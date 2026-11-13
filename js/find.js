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
// URL options for testing:  ?debug=1  ?unlock=15  ?show=5  ?spread=0.25  ?radius=75  ?nogps=1

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

  const video = $('camera-feed');
  const overlay = $('camera-overlay');
  const dbg = $('find-debug');
  let debugOn = q.has('debug');
  dbg.classList.toggle('hidden', !debugOn);
  $('debug-toggle').addEventListener('click', () => { debugOn = !debugOn; dbg.classList.toggle('hidden', !debugOn); });

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
      renderDebug();
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

  // ---------- Unlock → player ----------
  function unlock(f) {
    if (!f || unlocking) return;
    unlocking = true;
    try {
      const u = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      u[f.id] = new Date().toISOString();
      localStorage.setItem(STORE_KEY, JSON.stringify(u));
    } catch {}
    overlay.style.opacity = 1;
    setStatus('Match');
    $('find-title').textContent = f.title;
    $('find-flash').classList.remove('hidden');
    setTimeout(() => { stop(); location.href = './?f=' + encodeURIComponent(f.id) + '#listen'; }, 1200);
  }

  // ---------- Debug readout ----------
  function renderDebug() {
    if (!debugOn) return;
    const lines = [];
    lines.push(`GPS ${gps.status}` + (gps.status === 'ok' ? `  ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}  ±${Math.round(gps.acc)} m` : ''));
    lines.push(`OpenCV ${cvState} · check ${tickMs} ms · unlock ≥${UNLOCK} · show ≥${SHOW} · spread ≥${MIN_SPREAD} · radius ${RADIUS} m`);
    for (const f of figures) {
      const d = distance(f), c = isCandidate(f), r = last[f.id];
      lines.push(
        `${c ? '●' : '○'} ${f.title.padEnd(14).slice(0, 14)} ` +
        (d == null ? (f.location && f.location.lat != null ? '   ? m' : ' no GPS') : String(Math.round(d)).padStart(5) + ' m') +
        (c && r ? `  inl ${String(r.inliers).padStart(3)} / good ${String(r.good).padStart(3)} · spread ${Math.round((r.spread || 0) * 100)}%  ${Math.round((ema[f.id] || 0) * 100)}%` : ''),
      );
    }
    dbg.textContent = lines.join('\n');
  }
  setInterval(() => { if (!running) renderDebug(); }, 1000);
  renderDebug();
})();
