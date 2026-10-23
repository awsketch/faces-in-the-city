// alignment.js — camera ↔ reference-photo matching via MobileNet embeddings.
//
//   loadReference(urls)   embeds every photo of the object, averages them
//                         into one fingerprint → { fingerprint, ready, count }
//   checkAlignment(video, reference)
//                         embeds the current camera frame, returns cosine
//                         similarity (0..1) against the fingerprint.
//
// TensorFlow.js + MobileNet are loaded lazily on first use, so the player
// and collection screens never download them.

window.Alignment = (function () {
  const LIBS = [
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js',
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  let modelPromise = null;
  function getModel() {
    if (!modelPromise) {
      modelPromise = (async () => {
        for (const src of LIBS) await loadScript(src);
        return mobilenet.load({ version: 2, alpha: 1.0 });
      })().catch((err) => { modelPromise = null; throw err; });
    }
    return modelPromise;
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d < 1e-10 ? 0 : dot / d;
  }

  async function embed(model, el) {
    const t = model.infer(el, true);
    const data = await t.data();
    t.dispose();
    return data;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load ' + url));
      img.src = encodeURI(url);
    });
  }

  async function loadReference(urls) {
    const empty = { fingerprint: null, ready: false, count: 0 };
    if (!urls || urls.length === 0) return empty;

    let model;
    try { model = await getModel(); }
    catch (err) { console.error('[alignment] model load failed', err); return { ...empty, error: 'model' }; }

    const embs = [];
    for (const url of urls) {
      try { embs.push(await embed(model, await loadImage(url))); }
      catch (err) { console.warn('[alignment] skipped', url, err); }
    }
    if (embs.length === 0) return empty;

    const fp = new Float32Array(embs[0].length);
    for (const e of embs) for (let i = 0; i < fp.length; i++) fp[i] += e[i];
    for (let i = 0; i < fp.length; i++) fp[i] /= embs.length;
    return { fingerprint: fp, ready: true, count: embs.length };
  }

  let canvas = null, ctx = null;
  async function checkAlignment(video, reference) {
    if (!reference || !reference.ready || !video || video.readyState < 2) return 0;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = 224;
      ctx = canvas.getContext('2d');
    }
    ctx.drawImage(video, 0, 0, 224, 224);
    try { return cosine(await embed(await getModel(), canvas), reference.fingerprint); }
    catch (err) { console.warn('[alignment]', err); return 0; }
  }

  return { loadReference, checkAlignment };
})();
