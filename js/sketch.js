// sketch.js — controls the individual sketch page (locked → camera → unlocked).

console.log('[sketch.js] file loaded');

(async function () {
  console.log('[sketch.js] IIFE start, URL =', window.location.href);

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  console.log('[sketch.js] sketch id from URL =', id);

  const titleEl = document.getElementById('sketch-title');
  const subtitleEl = document.getElementById('sketch-subtitle');

  if (!id) {
    console.warn('[sketch.js] No id in URL — IIFE returning early. Camera handler will NOT be attached.');
    titleEl.textContent = 'No sketch selected';
    return;
  }

  // Load metadata for this sketch.
  let meta;
  try {
    const url = `sketches/${encodeURIComponent(id)}/metadata.json`;
    console.log('[sketch.js] fetching metadata from', url);
    const res = await fetch(url, { cache: 'no-cache' });
    console.log('[sketch.js] metadata fetch response:', res.status);
    if (!res.ok) throw new Error(`Could not load metadata (${res.status})`);
    meta = await res.json();
    console.log('[sketch.js] metadata loaded:', meta.title);
  } catch (err) {
    console.error('[sketch.js] Metadata fetch FAILED — IIFE returning early. Camera handler will NOT be attached. Error:', err);
    titleEl.textContent = 'Sketch not found';
    subtitleEl.textContent = err.message;
    return;
  }

  titleEl.textContent = meta.title || id;
  subtitleEl.textContent = meta.subtitle || meta.location?.name || '';

  // Set image sources (relative to the sketches/<id>/ folder).
  const baseDir = `sketches/${encodeURIComponent(id)}/`;
  const overlayUrl = baseDir + (meta.overlay || 'overlay.svg');
  const audioUrl = baseDir + (meta.audio || 'audio/speech.mp3');

  document.getElementById('camera-overlay').src = overlayUrl;
  document.getElementById('full-sketch').src = overlayUrl;

  // ----- View management (set up first; the camera flow depends on it) -----

  const views = {
    locked: document.getElementById('view-locked'),
    camera: document.getElementById('view-camera'),
    unlocked: document.getElementById('view-unlocked'),
  };
  function showView(name) {
    for (const [k, el] of Object.entries(views)) {
      el.classList.toggle('hidden', k !== name);
    }
  }

  // ----- Camera + alignment loop (set up BEFORE audio so an audio failure
  //       can never prevent the camera button from working) -----

  let mediaStream = null;
  let alignmentTimer = null;
  const ALIGN_THRESHOLD = 0.78; // when the real impl is wired up
  const ALIGN_INTERVAL_MS = 800;

  const video = document.getElementById('camera-feed');
  const statusEl = document.getElementById('alignment-status');
  const confidenceEl = document.getElementById('alignment-confidence');
  const errorEl = document.getElementById('camera-error');

  const openBtn = document.getElementById('open-camera');
  console.log('[sketch.js] open-camera button found?', !!openBtn);
  openBtn.addEventListener('click', () => {
    console.log('[sketch.js] OPEN-CAMERA CLICKED');
    openCamera();
  });
  document.getElementById('close-camera').addEventListener('click', closeCamera);
  document.getElementById('manual-unlock').addEventListener('click', unlock);
  console.log('[sketch.js] camera handlers attached ✓');

  // ----- Audio player wiring (isolated in try/catch — must not break camera) -----
  try {
    const audioEl     = document.getElementById('audio-player');
    const playPauseEl = document.getElementById('play-pause');
    const iconPlay    = document.getElementById('icon-play');
    const iconPause   = document.getElementById('icon-pause');
    const back10El    = document.getElementById('back-10');
    const fwd10El     = document.getElementById('forward-10');
    const tCurrentEl  = document.getElementById('time-current');
    const tTotalEl    = document.getElementById('time-total');
    const seekEl      = document.getElementById('seek');

    if (audioEl && playPauseEl && back10El && fwd10El) {
      audioEl.src = audioUrl;

      const fmt = (t) => {
        if (!isFinite(t) || t < 0) t = 0;
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      };
      const setPlayingUI = (isPlaying) => {
        iconPlay && iconPlay.classList.toggle('hidden', isPlaying);
        iconPause && iconPause.classList.toggle('hidden', !isPlaying);
        playPauseEl.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
        playPauseEl.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      };

      // Track if the user is actively dragging — don't fight their input
      let userScrubbing = false;
      const setSeekProgress = (pct) => {
        if (!seekEl) return;
        seekEl.style.setProperty('--progress', `${pct}%`);
      };
      const syncSeekFromAudio = () => {
        if (!seekEl || userScrubbing) return;
        const dur = audioEl.duration;
        if (!isFinite(dur) || dur <= 0) return;
        const pct = (audioEl.currentTime / dur) * 100;
        seekEl.value = pct;
        setSeekProgress(pct);
      };

      playPauseEl.addEventListener('click', () => {
        if (audioEl.paused) audioEl.play().catch((err) => console.warn('play() failed', err));
        else audioEl.pause();
      });
      back10El.addEventListener('click', () => {
        audioEl.currentTime = Math.max(0, (audioEl.currentTime || 0) - 10);
      });
      fwd10El.addEventListener('click', () => {
        const dur = audioEl.duration;
        const next = (audioEl.currentTime || 0) + 10;
        audioEl.currentTime = isFinite(dur) ? Math.min(dur, next) : next;
      });

      if (seekEl) {
        seekEl.addEventListener('pointerdown', () => { userScrubbing = true; });
        seekEl.addEventListener('pointerup',   () => { userScrubbing = false; });
        seekEl.addEventListener('input', () => {
          const pct = Number(seekEl.value) || 0;
          setSeekProgress(pct);
          if (tCurrentEl && isFinite(audioEl.duration)) {
            tCurrentEl.textContent = fmt((pct / 100) * audioEl.duration);
          }
        });
        seekEl.addEventListener('change', () => {
          const pct = Number(seekEl.value) || 0;
          if (isFinite(audioEl.duration)) {
            audioEl.currentTime = (pct / 100) * audioEl.duration;
          }
          userScrubbing = false;
        });
      }

      audioEl.addEventListener('play',  () => setPlayingUI(true));
      audioEl.addEventListener('pause', () => setPlayingUI(false));
      audioEl.addEventListener('ended', () => {
        setPlayingUI(false);
        audioEl.currentTime = 0;
        syncSeekFromAudio();
      });
      audioEl.addEventListener('timeupdate', () => {
        if (tCurrentEl) tCurrentEl.textContent = fmt(audioEl.currentTime);
        syncSeekFromAudio();
      });
      audioEl.addEventListener('loadedmetadata', () => {
        if (tTotalEl) tTotalEl.textContent = fmt(audioEl.duration);
        syncSeekFromAudio();
      });
      audioEl.addEventListener('error', () => {
        playPauseEl.disabled = true;
        back10El.disabled = true;
        fwd10El.disabled = true;
        if (seekEl) { seekEl.disabled = true; seekEl.style.opacity = '0.4'; }
        playPauseEl.style.opacity = '0.4';
        back10El.style.opacity = '0.4';
        fwd10El.style.opacity = '0.4';
        if (tCurrentEl && tCurrentEl.parentElement) {
          tCurrentEl.parentElement.innerHTML =
            `<span class="muted">Audio not yet added — drop an MP3 at </span>` +
            `<code>${baseDir}audio/speech.mp3</code>`;
        }
      });
    }
  } catch (audioErr) {
    console.warn('Audio player setup failed (camera flow unaffected):', audioErr);
  }

  async function openCamera() {
    errorEl.classList.add('hidden');
    showView('camera');

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      video.srcObject = mediaStream;
      await video.play().catch(() => {});
    } catch (err) {
      errorEl.textContent = `Couldn't access the camera: ${err.message}`;
      errorEl.classList.remove('hidden');
      return;
    }

    // Load reference photos (currently a no-op stub).
    const reference = await window.Alignment.loadReference(meta.reference_photos || []);

    // Start the alignment loop.
    alignmentTimer = setInterval(async () => {
      const score = await window.Alignment.checkAlignment(video, reference);
      const pct = Math.round(score * 100);
      confidenceEl.textContent = `${pct}%`;

      if (!reference.ready) {
        statusEl.textContent = 'Manual unlock (no reference photos yet)';
      } else if (score >= ALIGN_THRESHOLD) {
        statusEl.textContent = 'Aligned ✓';
        unlock();
      } else if (score > 0.5) {
        statusEl.textContent = 'Almost there…';
      } else {
        statusEl.textContent = 'Looking for alignment…';
      }
    }, ALIGN_INTERVAL_MS);
  }

  function closeCamera() {
    stopCamera();
    showView('locked');
  }

  function stopCamera() {
    if (alignmentTimer) {
      clearInterval(alignmentTimer);
      alignmentTimer = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    video.srcObject = null;
  }

  function unlock() {
    stopCamera();
    showView('unlocked');
  }

  // Clean up if the user leaves the page mid-camera.
  window.addEventListener('pagehide', stopCamera);

  // Start in the locked view.
  showView('locked');
})();
