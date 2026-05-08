// alignment.js — camera/reference-photo matching via MobileNet embeddings.
//
// Flow:
//   1. loadReference(urls)
//        - Waits for the MobileNet model to load (cached after first call).
//        - For each URL, loads the image and runs it through MobileNet's
//          embedding layer (1024-dimensional vector).
//        - Averages all embeddings into one "reference fingerprint".
//        - Returns { photos, fingerprint, ready }.
//
//   2. checkAlignment(videoEl, reference)
//        - Captures the current video frame into a 224×224 offscreen canvas.
//        - Gets its MobileNet embedding.
//        - Returns cosine similarity against reference.fingerprint (0..1).
//        - sketch.js unlocks when score >= ALIGN_THRESHOLD (currently 0.78).
//
// The manual-unlock button stays visible until camera matching is proven in
// the field; see project memory note on this.

window.Alignment = (function () {

  // ── Model singleton ────────────────────────────────────────────────────────

  let _modelPromise = null;

  function getModel() {
    if (!_modelPromise) {
      console.log('[alignment] Loading MobileNet model…');
      _modelPromise = mobilenet.load({ version: 2, alpha: 1.0 })
        .then(m => { console.log('[alignment] MobileNet ready ✓'); return m; })
        .catch(err => { console.error('[alignment] MobileNet load FAILED:', err); _modelPromise = null; throw err; });
    }
    return _modelPromise;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Cosine similarity between two Float32Arrays. Returns a value in [0, 1]. */
  function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom < 1e-10 ? 0 : dot / denom;
  }

  /** Get MobileNet embedding for an image/canvas/video element. */
  async function getEmbedding(model, imgEl) {
    // infer(el, true) returns the penultimate-layer activations (1024-d).
    const tensor = model.infer(imgEl, /* embedding= */ true);
    const data = await tensor.data();
    tensor.dispose();
    return data; // Float32Array
  }

  /** Load an image element from a URL. Handles spaces in filenames. */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = (e) => reject(new Error(`Could not load image: ${url}`));
      // encodeURI is idempotent — safe to call even if already encoded.
      img.src = encodeURI(url);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load reference photos and compute an average embedding fingerprint.
   * @param {string[]} referenceImageUrls  Full URLs (or paths) to reference images.
   * @returns {{ photos: string[], fingerprint: Float32Array|null, ready: boolean }}
   */
  async function loadReference(referenceImageUrls) {
    if (!referenceImageUrls || referenceImageUrls.length === 0) {
      console.log('[alignment] No reference photos — manual-unlock mode.');
      return { photos: [], fingerprint: null, ready: false };
    }

    let model;
    try {
      model = await getModel();
    } catch (err) {
      console.error('[alignment] Cannot load model — falling back to manual unlock.', err);
      return { photos: referenceImageUrls, fingerprint: null, ready: false };
    }

    const embeddings = [];
    for (const url of referenceImageUrls) {
      try {
        console.log('[alignment] Embedding reference image:', url);
        const img = await loadImage(url);
        const emb = await getEmbedding(model, img);
        embeddings.push(emb);
        console.log('[alignment] ✓', url);
      } catch (err) {
        console.warn('[alignment] Skipping reference image (load failed):', url, err);
      }
    }

    if (embeddings.length === 0) {
      console.warn('[alignment] All reference images failed — manual-unlock mode.');
      return { photos: referenceImageUrls, fingerprint: null, ready: false };
    }

    // Average all embeddings into one fingerprint.
    const dim = embeddings[0].length;
    const fingerprint = new Float32Array(dim);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) fingerprint[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) fingerprint[i] /= embeddings.length;

    console.log(`[alignment] Fingerprint ready (${embeddings.length}/${referenceImageUrls.length} photos, dim=${dim}) ✓`);
    return { photos: referenceImageUrls, fingerprint, ready: true };
  }

  // Reusable 224×224 offscreen canvas for capturing video frames.
  let _canvas = null;
  let _ctx    = null;

  /**
   * Compare the current camera frame against the reference fingerprint.
   * @param {HTMLVideoElement} videoEl
   * @param {{ fingerprint: Float32Array|null, ready: boolean }} reference
   * @returns {Promise<number>}  Cosine similarity in [0, 1].
   */
  async function checkAlignment(videoEl, reference) {
    if (!reference || !reference.ready || !reference.fingerprint) return 0;
    if (!videoEl || videoEl.readyState < 2) return 0; // no frame yet

    // Capture current frame at 224×224 (MobileNet's expected input size).
    if (!_canvas) {
      _canvas = document.createElement('canvas');
      _canvas.width  = 224;
      _canvas.height = 224;
      _ctx = _canvas.getContext('2d');
    }
    _ctx.drawImage(videoEl, 0, 0, 224, 224);

    try {
      const model = await getModel();
      const emb   = await getEmbedding(model, _canvas);
      const score = cosineSimilarity(emb, reference.fingerprint);
      return score;
    } catch (err) {
      console.warn('[alignment] checkAlignment error:', err);
      return 0;
    }
  }

  return { loadReference, checkAlignment };

})();
