// find.js — TEST page (find.html): find a figure without a QR code.
//
//   1. GPS pre-filter: only figures within RADIUS of the phone are candidates.
//      Figures without lat/lng in meta.json are always candidates (so the test
//      also works before coordinates are entered). No GPS → all figures.
//   2. Camera: every frame is matched against the reference photos of the
//      candidates (Matcher: a few strong ORB feature points, taken only from
//      each photo's match area = the main façade / object, + RANSAC geometry check).
//   3. The best candidate's drawing fades in as the number of geometrically
//      consistent matches ("inliers") rises from SHOW to UNLOCK.
//   4. UNLOCK inliers, spread over at least MIN_SPREAD of the match area, on two
//      checks in a row → unlocked (same store as the app), then the player: ./?f=<id>#listen
//
//   5. Capture ceremony (capture()): the frame freezes, the figure lights up as glowing
//      white lines, white blooms out of it over the whole screen, then the player opens.
//
// URL options for testing:  ?unlock=15  ?show=5  ?spread=0.25  ?radius=75  ?nogps=1
//   ?celebrate=<figure-id>   preview of the capture moment, no camera / GPS / matching:
//                            a reference photo stands in for the camera, the match is
//                            simulated, nothing is saved (player opens with &preview=1)

(async function () {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const num = (k, d) => (q.has(k) && isFinite(+q.get(k)) ? +q.get(k) : d);

  const UNLOCK = num('unlock', 15);   // inliers needed to unlock (other photos of the same spot: 27–103, a wrong spot: 0)
  const SHOW = num('show', 5);        // inliers at which the drawing starts to appear
  const MIN_SPREAD = num('spread', 0.25); // agreeing points must cover ≥ this share of the match area's width and height
  const RADIUS = num('radius', 75);   // metres
  const NO_GPS = q.has('nogps');
  const HITS_NEEDED = 2;              // consecutive checks at UNLOCK
  const TICK_PAUSE_MS = 150;          // pause between checks
  const STORE_KEY = 'berlin-kvetch.unlocked';
  const PREVIEW = q.has('celebrate');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const video = $('camera-feed');
  const overlay = $('camera-overlay');

  // ---------- Data ----------
  let figures = [];
  try {
    const res = await fetch('figures/index.json', { cache: 'no-cache' });
    figures = ((await res.json()).figures || []).filter((f) => f.photos && f.photos.length);
  } catch (err) { console.error('figures/index.json', err); }

  let cvState = 'loading';
  window.Matcher.load().then(() => { cvState = 'ready'; }, (err) => { cvState = 'failed: ' + err.message; });

  // ---------- GPS ----------
  const gps = { status: NO_GPS ? 'off (?nogps)' : 'not started', lat: null, lng: null, acc: null };
  function startGps() {
    if (NO_GPS) return;
    if (!('geolocation' in navigator)) { gps.status = 'unsupported'; return; }
    gps.status = 'waiting…';
    navigator.geolocation.watchPosition(
      (p) => { gps.lat = p.coords.latitude; gps.lng = p.coords.longitude; gps.acc = p.coords.accuracy; gps.status = 'ok'; },
      (e) => { gps.status = e.code === 1 ? 'denied' : 'error ' + e.code; },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  function distance(f) {
    const L = f.location || {};
    if (gps.status !== 'ok' || L.lat == null || L.lng == null) return null;
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (L.lat - gps.lat) * rad, dLng = (L.lng - gps.lng) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(gps.lat * rad) * Math.cos(L.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function isCandidate(f) {
    if (gps.status !== 'ok') return true;                 // no position → don't filter
    const d = distance(f);
    if (d == null) return true;                           // no coordinates yet → always a candidate
    return d - Math.min(gps.acc || 0, 100) <= RADIUS;     // generous with poor accuracy
  }

  // ---------- Camera ----------
  let stream = null, running = false, session = 0;
  async function start() {
    $('find-start').classList.add('hidden');
    setStatus('Starting camera…');
    startGps();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    } catch (err) {
      $('find-start-msg').textContent = err && err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in your browser settings, then try again.'
        : 'The camera could not be started.';
      $('find-start').classList.remove('hidden');
      setStatus('No camera');
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    running = true;
    loop(++session);
  }
  function stop() {
    running = false; session++;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; video.srcObject = null;
  }
  $('find-start-btn').addEventListener('click', start);
  window.addEventListener('pagehide', stop);
  let wasRunning = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { wasRunning = running; stop(); }
    else if (wasRunning) start();
  });

  // ---------- Matching loop ----------
  const prepared = {};          // id → Promise<{id, refs}>
  const ema = {};               // id → smoothed 0..1 score
  const last = {};              // id → last {inliers, good}
  let hits = { id: null, n: 0 };
  let shown = null;             // id of the figure whose drawing is on the overlay
  let tickMs = 0, unlocking = false;

  async function loop(s) {
    while (running && s === session && !unlocking) {
      const t0 = performance.now();
      try { await tick(); } catch (err) { console.warn('[find]', err); }
      tickMs = Math.round(performance.now() - t0);
      await new Promise((r) => setTimeout(r, TICK_PAUSE_MS));
    }
  }

  async function tick() {
    if (cvState !== 'ready') { setStatus(cvState === 'loading' ? 'Loading matcher…' : 'Matcher unavailable'); await window.Matcher.load().catch(() => {}); return; }
    const cands = figures.filter(isCandidate);
    if (cands.length === 0) {
      setStatus('Nothing nearby');
      $('find-hint').textContent = 'No figure is hiding close to here.';
      fade(null, 0);
      return;
    }
    $('find-hint').textContent = 'Point the camera at the spot.';
    const preps = await Promise.all(cands.map((f) => (prepared[f.id] ||= window.Matcher.prepare(f))));
    const results = await window.Matcher.match(video, preps);

    let leader = null;
    for (const r of results) {
      last[r.id] = r;
      let raw = Math.max(0, Math.min(1, (r.inliers - SHOW) / Math.max(1, UNLOCK - SHOW)));
      if (r.spread < MIN_SPREAD) raw = Math.min(raw, 0.6);   // matches bunched on one small detail: never a full match
      ema[r.id] = 0.55 * (ema[r.id] || 0) + 0.45 * raw;
      if (!leader || ema[r.id] > ema[leader.id]) leader = r;
    }
    for (const id of Object.keys(ema)) if (!cands.some((f) => f.id === id)) ema[id] = 0;

    const best = results.reduce((a, b) => (b.inliers > (a ? a.inliers : -1) ? b : a), null);
    if (best && best.inliers >= UNLOCK && best.spread >= MIN_SPREAD) hits = { id: best.id, n: hits.id === best.id ? hits.n + 1 : 1 };
    else hits = { id: null, n: 0 };

    const score = leader ? ema[leader.id] : 0;
    fade(score > 0.02 ? leader.id : null, score);
    $('find-score').textContent = Math.round(score * 100) + '%';
    $('find-meter').style.width = Math.round(score * 100) + '%';
    setStatus(score >= 0.7 ? 'Almost there…' : score >= 0.3 ? 'Getting warmer…' : 'Searching…');
    $('find-title').textContent = score >= 0.3 ? figureById(leader.id).title : 'Looking around…';

    if (hits.n >= HITS_NEEDED) unlock(figureById(hits.id));
  }

  function figureById(id) { return figures.find((f) => f.id === id); }
  function setStatus(t) { $('find-status').textContent = t; }

  // ---------- Overlay: drawing fades in with the score ----------
  function fade(id, score) {
    if (id !== shown) {
      shown = id;
      overlay.style.opacity = 0;
      if (!id) { overlay.removeAttribute('src'); return; }
      const f = figureById(id);
      overlay.style.setProperty('--fig-scale', f.scale || 1);
      if (f.drawing) lineArt(f.drawing).then((src) => { if (shown === id) overlay.src = src; });
    }
    if (id) overlay.style.opacity = (0.15 + 0.8 * score).toFixed(2);
  }

  // Same as app.js: white / light paper becomes transparent, darkness → black line opacity.
  const lineArtCache = {};
  function lineArt(url) {
    if (lineArtCache[url]) return lineArtCache[url];
    lineArtCache[url] = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h), px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            const a = Math.max(0, Math.min(1, (0.85 - lum / 255) / 0.85)) * (px[i + 3] / 255);
            px[i] = px[i + 1] = px[i + 2] = 0;
            px[i + 3] = Math.round(a * 255);
          }
          ctx.putImageData(d, 0, 0);
          resolve(c.toDataURL('image/png'));
        } catch (err) { resolve(encodeURI(url)); }
      };
      img.onerror = () => resolve(encodeURI(url));
      img.src = encodeURI(url);
    });
    return lineArtCache[url];
  }

  // ---------- Unlock → capture ceremony → player ----------
  function unlock(f) {
    if (!f || unlocking) return;
    unlocking = true;
    if (!PREVIEW) {
      try {
        const u = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
        u[f.id] = new Date().toISOString();
        localStorage.setItem(STORE_KEY, JSON.stringify(u));
      } catch {}
    }
    setStatus('Match');
    $('find-score').textContent = '100%';
    $('find-meter').style.width = '100%';
    $('find-title').textContent = f.title;
    const dest = './?f=' + encodeURIComponent(f.id) + (PREVIEW ? '&preview=1' : '') + '&new=1#listen';
    capture(f).then(() => { location.href = dest; });
  }

  async function capture(f) {
    const view = $('view-find'), cap = $('capture'), fig = $('capture-fig');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Freeze the moment: the current camera frame becomes a still, the camera goes off.
    const still = $('camera-still');
    if (video.videoWidth) {
      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        still.src = c.toDataURL('image/jpeg', 0.85);
      } catch {}
    }
    if (still.getAttribute('src')) still.classList.remove('hidden');
    stop();

    // The figure's line art, exactly where the overlay sat.
    let src = shown === f.id ? overlay.getAttribute('src') : null;
    if (!src && f.drawing) src = await lineArt(f.drawing);
    fig.style.setProperty('--fig-scale', f.scale || 1);
    if (src) { fig.src = src; if (fig.decode) await fig.decode().catch(() => {}); }
    else fig.removeAttribute('src');
    $('capture-name').textContent = f.title;

    // White blooms out of the centre of the drawing (same box as .cam-overlay: padding 96 top / 140 bottom).
    cap.style.setProperty('--cx', innerWidth / 2 + 'px');
    cap.style.setProperty('--cy', (innerHeight + 96 - 140) / 2 + 'px');

    try { if (navigator.vibrate) navigator.vibrate([30, 70, 30, 70, 160]); } catch {}
    cap.classList.remove('hidden');
    void cap.offsetWidth;                     // start the transitions from the current state

    view.classList.add('is-capturing');       // 2. figure lights up, scene goes dark
    await wait(reduce ? 350 : 1250);
    view.classList.add('is-bloom');           // 3. white fills the screen
    await wait(reduce ? 350 : 850);
    view.classList.add('is-white');           // 4. "Found — <name>" on white
    await wait(reduce ? 700 : 1300);
  }

  // ---------- Manual unlock (TEMPORARY, testing only) ----------
  // Unlocks the figure currently fading in; otherwise the nearest candidate.
  function manualTarget() {
    if (shown) return figureById(shown);
    const cands = figures.filter(isCandidate);
    const near = cands.map((f) => ({ f, d: distance(f) })).filter((x) => x.d != null).sort((a, b) => a.d - b.d);
    return (near[0] && near[0].f) || cands[0] || figures[0];
  }
  $('manual-unlock').addEventListener('click', () => unlock(manualTarget()));

  // ---------- ?celebrate preview ----------
  async function runPreview() {
    const f = figureById(q.get('celebrate')) || figures.find((x) => x.drawing) || figures[0];
    if (!f) return;
    $('find-start').classList.add('hidden');
    $('find-hint').textContent = 'Preview: no camera, simulated match.';
    const still = $('camera-still');
    if (f.photos && f.photos[0]) { still.src = encodeURI(f.photos[0]); still.classList.remove('hidden'); }
    await wait(600);
    for (let i = 0; i <= 24; i++) {           // the drawing fades in like a real approach
      const s = i / 24;
      fade(f.id, s);
      $('find-score').textContent = Math.round(s * 100) + '%';
      $('find-meter').style.width = Math.round(s * 100) + '%';
      setStatus(s >= 0.7 ? 'Almost there…' : s >= 0.3 ? 'Getting warmer…' : 'Searching…');
      $('find-title').textContent = s >= 0.3 ? f.title : 'Looking around…';
      await wait(100);
    }
    await wait(400);
    unlock(f);
  }
  if (PREVIEW) runPreview();
})();
