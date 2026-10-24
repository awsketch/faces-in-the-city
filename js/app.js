// app.js — Berlin Kvetch. One page, three views:
//
//   ?f=<id>            camera with that figure's drawing as overlay (QR target)
//   ?f=<id>#listen     player (only once the figure is unlocked)
//   #collection        which figures are unlocked (reachable from both)
//
// Unlocked figures are remembered in this browser (localStorage).

(async function () {
  const $ = (id) => document.getElementById(id);
  const ALIGN_THRESHOLD = 0.78;
  const ALIGN_INTERVAL_MS = 800;
  const STORE_KEY = 'berlin-kvetch.unlocked';
  // Demo mode (demo.html): live camera, but matching is simulated with a
  // hold-to-match button, and unlocks live in memory only (never saved).
  const DEMO = Boolean(window.KVETCH_DEMO);
  const demoUnlocked = {};
  if (DEMO) document.body.classList.add('demo');
  // Computer = no touch-first pointer. There, only the (always empty) collection
  // page with the project description is reachable; nothing can be unlocked.
  // The demo page is exempt so it can still be shown on any screen.
  const DESKTOP = !DEMO && !window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  if (DESKTOP) {
    document.body.classList.add('desktop');
    if (location.search || location.hash) history.replaceState(null, '', location.pathname);
  }

  // ---------- Unlock store ----------
  function readUnlocked() {
    if (DEMO) return demoUnlocked;
    if (DESKTOP) return {};
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  let unlocked = readUnlocked();
  function isUnlocked(id) { return Boolean(unlocked[id]); }
  function markUnlocked(id) {
    if (DESKTOP) return;
    unlocked[id] = new Date().toISOString();
    if (DEMO) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(unlocked)); } catch {}
  }

  // ---------- Data ----------
  let figures = [];
  try {
    const res = await fetch('figures/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    figures = (await res.json()).figures || [];
  } catch (err) {
    console.error('Could not load figures/index.json — run `node tools/build.mjs`', err);
  }
  const byId = Object.fromEntries(figures.map((f) => [f.id, f]));

  // Demo opened without ?f= → start on the first figure's camera
  if (DEMO && figures.length && !byId[new URLSearchParams(location.search).get('f')]) {
    history.replaceState(null, '', location.pathname + '?f=' + encodeURIComponent(figures[0].id));
  }

  const views = { camera: $('view-camera'), player: $('view-player'), collection: $('view-collection') };
  let current = null;       // current view name
  let previous = null;      // view before collection, for the back button

  function figureId() { return new URLSearchParams(location.search).get('f'); }
  function figure() { return byId[figureId()] || null; }

  function wantedView() {
    const hash = location.hash.replace('#', '');
    const f = figure();
    if (DESKTOP || hash === 'collection' || !f) return 'collection';
    if (hash === 'listen' && isUnlocked(f.id)) return 'player';
    return 'camera';
  }

  function navigate(search, hash) {
    const url = location.pathname + (search ?? location.search) + (hash ? '#' + hash : '');
    history.pushState(null, '', url);
    render();
  }

  function render() {
    const next = wantedView();
    if (next === current) { if (next === 'collection') renderCollection(); return; }
    if (next === 'collection') previous = current;
    if (current === 'camera') stopCamera();
    if (current === 'player' && next !== 'player') audio.pause();
    current = next;
    for (const [k, el] of Object.entries(views)) el.classList.toggle('hidden', k !== next);
    document.body.dataset.view = next;
    window.scrollTo(0, 0);
    if (next === 'camera') enterCamera();
    if (next === 'player') enterPlayer();
    if (next === 'collection') renderCollection();
  }

  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', render);
  document.querySelectorAll('[data-go="collection"]').forEach((b) =>
    b.addEventListener('click', () => navigate(null, 'collection')));

  // ---------- Camera ----------
  const video = $('camera-feed');
  const overlay = $('camera-overlay');
  const statusEl = $('align-status');
  const scoreEl = $('align-score');
  let stream = null, timer = null, camSession = 0;

  async function enterCamera() {
    const f = figure();
    $('cam-figure-title').textContent = f.title;
    overlay.removeAttribute('src');
    overlay.classList.add('hidden');
    if (f.drawing) {
      lineArt(f.drawing).then((src) => {
        if (figure() !== f) return;
        overlay.src = src;
        overlay.classList.remove('hidden');
      });
    }
    $('cam-listen').classList.toggle('hidden', !isUnlocked(f.id));
    scoreEl.textContent = '0%';
    await startCamera();
  }

  // Turns any drawing into pure black lines on transparent: white (and light
  // paper tones) become see-through, darkness becomes line opacity. So a PNG
  // or JPG with a white background overlays the camera with only its lines.
  const lineArtCache = {};
  function lineArt(url) {
    if (lineArtCache[url]) return lineArtCache[url];
    lineArtCache[url] = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1400;
          const k = Math.min(1, MAX / Math.max(img.naturalWidth || MAX, img.naturalHeight || MAX));
          const w = Math.round((img.naturalWidth || MAX) * k), h = Math.round((img.naturalHeight || MAX) * k);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h);
          const px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            // light tones (> ~85% white) vanish; darker tones ramp to full black
            let a = (0.85 - lum / 255) / 0.85;
            a = Math.max(0, Math.min(1, a)) * (px[i + 3] / 255);
            px[i] = px[i + 1] = px[i + 2] = 0;
            px[i + 3] = Math.round(a * 255);
          }
          ctx.putImageData(d, 0, 0);
          resolve(c.toDataURL('image/png'));
        } catch (err) {
          console.warn('lineArt failed, using original', err);
          resolve(encodeURI(url));
        }
      };
      img.onerror = () => resolve(encodeURI(url));
      img.src = encodeURI(url);
    });
    return lineArtCache[url];
  }

  async function startCamera() {
    const session = ++camSession;
    $('cam-start').classList.add('hidden');
    statusEl.textContent = 'Starting camera…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (err) {
      $('cam-start-msg').textContent = err && err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in your browser settings, then try again.'
        : 'Camera access is needed to find the figure.';
      $('cam-start').classList.remove('hidden');
      statusEl.textContent = 'No camera';
      return;
    }
    if (session !== camSession || current !== 'camera') { stopStream(); return; }
    video.srcObject = stream;
    await video.play().catch(() => {});

    if (DEMO) { statusEl.textContent = 'Searching…'; return; }

    const f = figure();
    if (!f.photos || f.photos.length === 0) { statusEl.textContent = 'No reference photos yet'; return; }
    statusEl.textContent = 'Loading matcher…';
    const reference = await window.Alignment.loadReference(f.photos);
    if (session !== camSession) return;
    if (!reference.ready) { statusEl.textContent = 'Matcher unavailable'; return; }

    statusEl.textContent = 'Searching…';
    timer = setInterval(async () => {
      const score = await window.Alignment.checkAlignment(video, reference);
      if (session !== camSession) return;
      scoreEl.textContent = Math.round(score * 100) + '%';
      if (score >= ALIGN_THRESHOLD) unlock();
      else statusEl.textContent = score > 0.5 ? 'Almost there…' : 'Searching…';
    }, ALIGN_INTERVAL_MS);
  }

  function stopStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }
  function stopCamera() {
    camSession++;
    if (DEMO) stopHold(true);
    if (timer) clearInterval(timer);
    timer = null;
    stopStream();
  }

  $('cam-start-btn').addEventListener('click', startCamera);
  $('manual-unlock').addEventListener('click', unlock);
  $('cam-listen').addEventListener('click', (e) => { e.preventDefault(); navigate(null, 'listen'); });
  window.addEventListener('pagehide', stopCamera);
  document.addEventListener('visibilitychange', () => {
    if (current !== 'camera') return;
    if (document.hidden) stopCamera(); else startCamera();
  });

  // ---------- Demo: hold-to-match ----------
  let holdTimer = null, holding = false, simScore = 0;
  const holdBtn = $('demo-hold');
  function stopHold(reset) {
    holding = false;
    if (holdBtn) holdBtn.classList.remove('is-holding');
    if (reset) { clearInterval(holdTimer); holdTimer = null; simScore = 0; }
  }
  function tickHold() {
    if (holding) simScore = Math.min(1, simScore + 0.018 + Math.random() * 0.02);   // ~2.5 s to full
    else simScore = Math.max(0, simScore - 0.06);
    scoreEl.textContent = Math.round(simScore * 100) + '%';
    statusEl.textContent = simScore >= 1 ? 'Match' : simScore > 0.5 ? 'Almost there…' : 'Searching…';
    if (simScore >= 1) {
      clearInterval(holdTimer); holdTimer = null;
      stopHold(false);
      setTimeout(() => { simScore = 0; unlock(); }, 450);
    } else if (!holding && simScore === 0) {
      clearInterval(holdTimer); holdTimer = null;
    }
  }
  if (DEMO && holdBtn) {
    const press = (e) => {
      e.preventDefault();
      if (simScore >= 1) return;
      holding = true;
      holdBtn.classList.add('is-holding');
      try { holdBtn.setPointerCapture(e.pointerId); } catch {}
      if (!holdTimer) holdTimer = setInterval(tickHold, 50);
    };
    const release = () => { if (holding) stopHold(false); };
    holdBtn.addEventListener('pointerdown', press);
    holdBtn.addEventListener('pointerup', release);
    holdBtn.addEventListener('pointercancel', release);
    holdBtn.addEventListener('lostpointercapture', release);
    holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  let justUnlocked = false;
  function unlock() {
    const f = figure();
    if (!f) return;
    stopCamera();
    markUnlocked(f.id);
    justUnlocked = true;
    navigate(null, 'listen');
  }

  // ---------- Player ----------
  const audio = $('audio');
  const seek = $('seek');
  const fmt = (t) => {
    if (!isFinite(t) || t < 0) t = 0;
    return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  };
  let scrubbing = false;
  function syncSeek() {
    if (scrubbing || !isFinite(audio.duration) || audio.duration <= 0) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    seek.value = pct;
    seek.style.setProperty('--progress', pct + '%');
  }
  function setPlaying(on) {
    $('icon-play').classList.toggle('hidden', on);
    $('icon-pause').classList.toggle('hidden', !on);
    $('play-pause').setAttribute('aria-label', on ? 'Pause' : 'Play');
  }
  function setAudioAvailable(ok) {
    document.querySelector('.player').classList.toggle('player--empty', !ok);
    $('audio-missing').classList.toggle('hidden', ok);
    ['play-pause', 'back-10', 'fwd-10', 'seek'].forEach((id) => { $(id).disabled = !ok; });
  }

  $('play-pause').addEventListener('click', () => { audio.paused ? audio.play().catch(() => {}) : audio.pause(); });
  $('back-10').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
  $('fwd-10').addEventListener('click', () => {
    audio.currentTime = isFinite(audio.duration) ? Math.min(audio.duration, audio.currentTime + 10) : audio.currentTime + 10;
  });
  seek.addEventListener('pointerdown', () => { scrubbing = true; });
  seek.addEventListener('input', () => {
    seek.style.setProperty('--progress', seek.value + '%');
    if (isFinite(audio.duration)) $('t-cur').textContent = fmt((seek.value / 100) * audio.duration);
  });
  seek.addEventListener('change', () => {
    if (isFinite(audio.duration)) audio.currentTime = (seek.value / 100) * audio.duration;
    scrubbing = false;
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { setPlaying(false); audio.currentTime = 0; syncSeek(); });
  audio.addEventListener('timeupdate', () => { $('t-cur').textContent = fmt(audio.currentTime); syncSeek(); });
  audio.addEventListener('loadedmetadata', () => { $('t-tot').textContent = fmt(audio.duration); setAudioAvailable(true); });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) setAudioAvailable(false); });

  function enterPlayer() {
    const f = figure();
    $('player-title').textContent = f.title;
    $('player-subtitle').textContent = [f.subtitle, f.location && f.location.name].filter(Boolean).join(' · ');
    $('player-drawing').src = f.drawing ? encodeURI(f.drawing) : '';
    $('player-drawing').alt = f.title;

    const src = f.audio ? encodeURI(f.audio) : '';
    if (audio.getAttribute('src') !== src) {
      audio.pause();
      $('t-cur').textContent = '0:00';
      $('t-tot').textContent = '0:00';
      seek.value = 0;
      seek.style.setProperty('--progress', '0%');
      setPlaying(false);
      if (src) { audio.setAttribute('src', src); audio.load(); setAudioAvailable(true); }
      else { audio.removeAttribute('src'); setAudioAvailable(false); }
    }

    const flash = $('unlocked-flash');
    flash.classList.toggle('hidden', !justUnlocked);
    if (justUnlocked) {
      justUnlocked = false;
      setTimeout(() => flash.classList.add('hidden'), 2400);
      if (src) audio.play().catch(() => {}); // may be blocked without a tap — the play button is right there
    }
  }

  // ---------- Collection ----------
  function renderCollection() {
    unlocked = readUnlocked();
    const grid = $('coll-grid');
    const n = figures.filter((f) => isUnlocked(f.id)).length;
    $('coll-count').textContent = `${n} / ${figures.length} found`;

    grid.innerHTML = '';
    grid.classList.toggle('hidden', DESKTOP);
    $('coll-desktop')?.classList.toggle('hidden', !DESKTOP);
    document.querySelector('.coll-foot')?.classList.toggle('hidden', DESKTOP);
    if (DESKTOP) { $('coll-back').classList.add('hidden'); return; }
    const found = figures
      .map((f, i) => ({ f, no: i + 1 }))
      .filter(({ f }) => isUnlocked(f.id));
    if (found.length === 0) {
      grid.innerHTML = '<li class="coll-empty">Nothing found yet.</li>';
    }
    found.forEach(({ f, no }) => {
      const li = document.createElement('li');
      li.className = 'coll-tile';
      const a = document.createElement('a');
      a.className = 'coll-tile__inner';
      a.href = `?f=${encodeURIComponent(f.id)}#listen`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(`?f=${encodeURIComponent(f.id)}`, 'listen');
      });
      a.innerHTML = `
        <span class="coll-tile__img">${f.drawing ? `<img src="${encodeURI(f.drawing)}" alt="" loading="lazy" />` : ''}</span>
        <span class="coll-tile__meta">
          <span class="label-caps">No. ${String(no).padStart(2, '0')}</span>
          <span class="coll-tile__name">${escapeHtml(f.title)}</span>
        </span>`;
      li.appendChild(a);
      grid.appendChild(li);
    });

    const back = $('coll-back');
    const canGoBack = Boolean(figure());
    back.classList.toggle('hidden', !canGoBack);
    back.onclick = () => navigate(null, previous === 'player' && isUnlocked(figureId()) ? 'listen' : '');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  render();
})();
