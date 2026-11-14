// app.js — Berlin Kvetch. One page, four views:
//
//   (no parameters)    home: "Open camera" (→ find.html) and "Open collection"
//   ?f=<id>            camera with that figure's drawing as overlay (old QR links)
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
  // Preview (find.html?celebrate → ?f=<id>&preview=1#listen): shows that figure's
  // player on any screen, unlocked in memory only — nothing lands in the collection.
  const PREVIEW = new URLSearchParams(location.search).has('preview');
  const DESKTOP = !DEMO && !PREVIEW && !window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  if (DESKTOP) {
    document.body.classList.add('desktop');
    if (location.search || location.hash) history.replaceState(null, '', location.pathname);
  }

  // ---------- Unlock store ----------
  function readUnlocked() {
    if (DEMO) return demoUnlocked;
    if (PREVIEW) return { [new URLSearchParams(location.search).get('f')]: 'preview' };
    if (DESKTOP) return {};
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  let unlocked = readUnlocked();
  function isUnlocked(id) { return Boolean(unlocked[id]); }
  function markUnlocked(id) {
    if (DESKTOP || PREVIEW) return;
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

  const views = { home: $('view-home'), camera: $('view-camera'), player: $('view-player'), collection: $('view-collection') };
  let current = null;       // current view name
  let previous = null;      // view before collection, for the back button

  function figureId() { return new URLSearchParams(location.search).get('f'); }
  function figure() { return byId[figureId()] || null; }

  function wantedView() {
    const hash = location.hash.replace('#', '');
    const f = figure();
    if (DESKTOP || hash === 'collection') return 'collection';
    if (!f) return 'home';
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
    if (next === 'home') renderHome();
  }

  // ---------- Home ----------
  const home = $('view-home');
  function renderHome() {
    home.classList.remove('is-camera', 'is-coll');
    unlocked = readUnlocked();
    const found = figures.filter((f) => isUnlocked(f.id) && f.drawing);
    const ul = $('home-preview');
    ul.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const li = document.createElement('li');
      const f = found[i];
      if (f) { const img = document.createElement('img'); img.src = encodeURI(f.drawing); img.alt = ''; li.appendChild(img); }
      else { li.className = 'is-missing'; li.textContent = '?'; }
      ul.appendChild(li);
    }
  }
  const GROW_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
  $('home-camera').addEventListener('click', (e) => {
    e.preventDefault();
    home.classList.add('is-camera');
    setTimeout(() => { location.href = 'find.html'; }, GROW_MS);
  });
  $('home-coll').addEventListener('click', (e) => {
    e.preventDefault();
    home.classList.add('is-coll');
    setTimeout(() => navigate(null, 'collection'), GROW_MS);
  });
  // back from find.html (browser back) can restore the grown page from cache: reset it
  window.addEventListener('pageshow', () => { if (current === 'home') renderHome(); });

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
    overlay.style.setProperty('--fig-scale', f.scale || 1);
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
  // Arriving from find.html's capture ceremony (&new=1): the player is revealed out of the white.
  {
    const qs = new URLSearchParams(location.search);
    if (qs.has('new')) {
      justUnlocked = true;
      document.body.classList.add('just-unlocked');
      setTimeout(() => document.body.classList.remove('just-unlocked'), 2500);
      qs.delete('new');
      history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash);
    }
  }
  function unlock() {
    const f = figure();
    if (!f) return;
    stopCamera();
    markUnlocked(f.id);
    justUnlocked = true;
    navigate(null, 'listen');
  }

  // ---------- Player (hold "Kvetch" to play, release to pause) ----------
  const audio = $('audio');
  const track = document.querySelector('.player__track');
  const kvetch = $('kvetch');
  function syncProgress() {
    const pct = isFinite(audio.duration) && audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
    track.style.setProperty('--progress', pct + '%');
  }
  function setAudioAvailable(ok) {
    document.querySelector('.player').classList.toggle('player--empty', !ok);
    $('audio-missing').classList.toggle('hidden', ok);
    kvetch.disabled = !ok;
  }
  // Short haptic tick on press. Android: Vibration API. iPhone (iOS 18+): Safari has no
  // vibration API, but toggling a native <input switch> gives a system tick, so a hidden one is flipped.
  const hapticLabel = (() => {
    const l = document.createElement('label');
    l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
    const i = document.createElement('input');
    i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
    l.appendChild(i); document.body.appendChild(l);
    return l;
  })();
  function haptic() {
    try {
      if (typeof navigator.vibrate === 'function' && navigator.vibrate(12)) return;
      hapticLabel.click();
    } catch (_) {}
  }
  let kvetching = false;
  function press(e) {
    if (kvetch.disabled) return;
    if (e && e.pointerId != null) { e.preventDefault(); try { kvetch.setPointerCapture(e.pointerId); } catch (_) {} }
    kvetching = true;
    haptic();
    kvetch.classList.add('is-pressed');
    audio.play().catch(() => {});
  }
  function release() {
    if (!kvetching) return;
    kvetching = false;
    kvetch.classList.remove('is-pressed');
    audio.pause();
  }
  kvetch.addEventListener('pointerdown', press);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => kvetch.addEventListener(ev, release));
  kvetch.addEventListener('contextmenu', (e) => e.preventDefault());
  kvetch.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
  kvetch.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  // Animation: cycles the numbered frames while audio plays, rests on frame 01 (= the drawing) otherwise
  const drawingEl = $('player-drawing');
  let frames = [], restSrc = '', frameIdx = 0, frameTimer = null, frameMs = 333;
  function setFrames(f) {
    stopAnimation();
    frames = (f.animation || []).map((u) => encodeURI(u));
    frameMs = 1000 / (f.fps || 3);
    restSrc = f.drawing ? encodeURI(f.drawing) : (frames[0] || '');
    frames.forEach((u) => { const i = new Image(); i.src = u; }); // preload so frames don't flicker
    drawingEl.style.setProperty('--fig-scale', f.scale || 1); // drawing and frames share one element, so they always match
    drawingEl.src = restSrc;
  }
  function startAnimation() {
    if (frames.length < 2 || frameTimer) return;
    frameIdx = 0;
    frameTimer = setInterval(() => {
      frameIdx = (frameIdx + 1) % frames.length;
      drawingEl.src = frames[frameIdx];
    }, frameMs);
  }
  function stopAnimation() {
    clearInterval(frameTimer); frameTimer = null;
    if (restSrc) drawingEl.src = restSrc;
  }
  audio.addEventListener('playing', startAnimation);
  ['pause', 'ended', 'waiting', 'emptied'].forEach((ev) => audio.addEventListener(ev, stopAnimation));

  audio.addEventListener('ended', () => { audio.currentTime = 0; syncProgress(); });
  audio.addEventListener('timeupdate', syncProgress);
  audio.addEventListener('loadedmetadata', () => { syncProgress(); setAudioAvailable(true); });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) setAudioAvailable(false); });

  function enterPlayer() {
    const f = figure();
    $('player-title').textContent = f.title;
    setFrames(f);
    $('player-drawing').alt = f.title;

    const src = f.audio ? encodeURI(f.audio) : '';
    if (audio.getAttribute('src') !== src) {
      audio.pause();
      track.style.setProperty('--progress', '0%');
      if (src) { audio.setAttribute('src', src); audio.load(); setAudioAvailable(true); }
      else { audio.removeAttribute('src'); setAudioAvailable(false); }
    }

    const flash = $('unlocked-flash');
    flash.classList.toggle('hidden', !justUnlocked);
    if (justUnlocked) {
      justUnlocked = false;
      setTimeout(() => flash.classList.add('hidden'), 2400);
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
    found.forEach(({ f }) => {
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
          <span class="coll-tile__name">${escapeHtml(f.title)}</span>
        </span>`;
      li.appendChild(a);
      grid.appendChild(li);
    });
    // figures not found yet: a question mark, no name
    figures.filter((f) => !isUnlocked(f.id)).forEach(() => {
      const li = document.createElement('li');
      li.className = 'coll-tile coll-tile--missing';
      li.innerHTML = `
        <span class="coll-tile__img"><span class="coll-tile__q" aria-hidden="true">?</span></span>
        <span class="coll-tile__meta"><span class="coll-tile__name">Not found yet</span></span>`;
      grid.appendChild(li);
    });

    // ✕: back to the player or the old QR camera if we came from there, otherwise home
    const back = $('coll-back');
    back.classList.remove('hidden');
    back.onclick = () => {
      if (previous === 'player' && isUnlocked(figureId())) navigate(null, 'listen');
      else if (previous === 'camera' && figure()) navigate(null, '');
      else navigate('', '');
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  render();
})();
