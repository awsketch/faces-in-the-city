// matcher.js — feature-point matching with a geometry check (OpenCV.js).
//
//   Matcher.load()                       loads OpenCV.js once (≈3.5 MB gzipped, from jsDelivr)
//   Matcher.prepare(figure)              ORB keypoints + descriptors for every reference photo,
//                                        only inside the photo's match area (figure.areas[i],
//                                        from photos/areas.json) — the main façade / object,
//                                        never the background
//   Matcher.match(videoEl, prepared[])   ORB on the current frame, then per figure:
//                                        ratio-tested matches → RANSAC homography → inlier count
//                                        returns [{ id, inliers, good, spread }] (best photo per figure)
//   Matcher.preview(img, polygon)        feature points inside a polygon (for tools/area.html)
//
// Few, strong points: at most REF_FEATURES per photo (inside the area) and
// FRAME_FEATURES per camera frame. ORB looks for them on 10 image scales, so a
// different camera, frame size or the user zooming in (up to ~5×) still matches.
// "spread" = how much of the match area the agreeing points span (0..1): a
// handful of matches on one small detail (a sign, a window) gives a low spread.
//
// The inlier count is the "how sure" number: matches that agree on one
// consistent geometric fit between the photo and the camera frame. In tests
// (400 points per photo), a photo of a different spot gave 0 inliers, other
// photos of the same spot 27–103.
//
// OpenCV.js objects live in WebAssembly memory and are NOT garbage-collected:
// every Mat / vector created here is deleted explicitly.

window.Matcher = (function () {
  const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js';
  const REF_MAX = 640;      // reference photos are scaled so the long side is this
  const FRAME_MAX = 480;    // camera frames likewise
  const REF_FEATURES = 400;
  const FRAME_FEATURES = 500;
  const LEVELS = 10;        // ORB pyramid levels (scale factor 1.2 → ~5× zoom range)
  const RATIO = 0.75;       // Lowe ratio test
  const RANSAC_PX = 5;
  const MIN_GOOD = 8;       // fewer good matches → no geometry check

  // The OpenCV module object is a "thenable": handing it to resolve(), returning
  // it from an async function or awaiting it makes the promise chase its own .then forever. So the promise
  // resolves with a plain wrapper and the module is kept in CV.
  let CV = null;
  let cvPromise = null;
  function load() {
    if (cvPromise) return cvPromise;
    cvPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = OPENCV_URL;
      s.async = true;
      s.onerror = () => { cvPromise = null; reject(new Error('Could not load OpenCV.js')); };
      s.onload = () => {
        // Poll until the classes exist (the module initialises asynchronously).
        const t0 = Date.now();
        const poll = setInterval(() => {
          const cv = window.cv;
          if (cv && cv.Mat && cv.ORB && cv.findHomography) { clearInterval(poll); CV = cv; resolve({ ready: true }); }
          else if (Date.now() - t0 > 60000) { clearInterval(poll); cvPromise = null; reject(new Error('OpenCV.js did not initialise')); }
        }, 50);
      };
      document.head.appendChild(s);
    });
    return cvPromise;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load ' + url));
      img.src = encodeURI(url);
    });
  }

  // Draws an image/video into a canvas (long side ≤ max) and returns a grey Mat.
  const canvases = {};
  function toGray(cv, source, w0, h0, max, key) {
    const k = Math.min(1, max / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const c = canvases[key] || (canvases[key] = document.createElement('canvas'));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const rgba = cv.matFromImageData(ctx.getImageData(0, 0, w, h));
    const gray = new cv.Mat();
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    rgba.delete();
    return gray;
  }

  // polygon = [[x, y], …] as fractions (0..1) of the photo's width / height
  function validPolygon(poly) {
    return Array.isArray(poly) && poly.length >= 3 && poly.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= -0.01 && v <= 1.01));
  }
  function makeMask(cv, w, h, poly) {
    const mask = cv.Mat.zeros(h, w, cv.CV_8UC1);
    const flat = [];
    for (const [x, y] of poly) flat.push(Math.round(x * w), Math.round(y * h));
    const pts = cv.matFromArray(poly.length, 1, cv.CV_32SC2, flat);
    const mv = new cv.MatVector();
    mv.push_back(pts);
    cv.fillPoly(mask, mv, new cv.Scalar(255));
    pts.delete(); mv.delete();
    return mask;
  }
  function polygonBox(poly, w, h) {
    if (!poly) return { x0: 0, y0: 0, x1: w, y1: h };
    const xs = poly.map((p) => p[0] * w), ys = poly.map((p) => p[1] * h);
    return { x0: Math.max(0, Math.min(...xs)), y0: Math.max(0, Math.min(...ys)), x1: Math.min(w, Math.max(...xs)), y1: Math.min(h, Math.max(...ys)) };
  }

  function detect(cv, gray, n, mask) {
    const orb = new cv.ORB(n, 1.2, LEVELS);
    const kp = new cv.KeyPointVector();
    const des = new cv.Mat();
    const m = mask || new cv.Mat();
    orb.detectAndCompute(gray, m, kp, des);
    const pts = new Float32Array(kp.size() * 2);
    for (let i = 0; i < kp.size(); i++) { const p = kp.get(i).pt; pts[2 * i] = p.x; pts[2 * i + 1] = p.y; }
    orb.delete(); kp.delete();
    if (!mask) m.delete();
    return { pts, des };   // des must be deleted by the caller
  }

  // → { id, refs: [{ url, pts, des, box }] }
  async function prepare(figure) {
    await load(); const cv = CV;   // never return/await CV itself (thenable)
    const refs = [];
    const photos = figure.photos || [];
    for (let i = 0; i < photos.length; i++) {
      const url = photos[i];
      const poly = figure.areas && validPolygon(figure.areas[i]) ? figure.areas[i] : null;
      try {
        const img = await loadImage(url);
        const gray = toGray(cv, img, img.naturalWidth, img.naturalHeight, REF_MAX, 'ref');
        const mask = poly ? makeMask(cv, gray.cols, gray.rows, poly) : null;
        const { pts, des } = detect(cv, gray, REF_FEATURES, mask);
        const box = polygonBox(poly, gray.cols, gray.rows);
        gray.delete(); if (mask) mask.delete();
        if (des.rows > 0) refs.push({ url, pts, des, box, area: Boolean(poly) }); else des.delete();
      } catch (err) { console.warn('[matcher] skipped', url, err); }
    }
    return { id: figure.id, refs };
  }

  // For tools/area.html: the points the matcher would use inside a polygon.
  // → { points: [[x, y] as fractions], count }
  async function preview(img, poly) {
    await load(); const cv = CV;
    const gray = toGray(cv, img, img.naturalWidth, img.naturalHeight, REF_MAX, 'preview');
    const mask = validPolygon(poly) ? makeMask(cv, gray.cols, gray.rows, poly) : null;
    const { pts, des } = detect(cv, gray, REF_FEATURES, mask);
    const points = [];
    for (let i = 0; i < pts.length; i += 2) points.push([pts[i] / gray.cols, pts[i + 1] / gray.rows]);
    gray.delete(); if (mask) mask.delete(); des.delete();
    return { points, count: points.length };
  }

  let matcher = null;
  function matchOne(cv, frame, ref) {
    const pairs = new cv.DMatchVectorVector();
    matcher.knnMatch(frame.des, ref.des, pairs, 2);
    const src = [], dst = [];
    for (let i = 0; i < pairs.size(); i++) {
      const p = pairs.get(i);
      if (p.size() === 2) {
        const a = p.get(0), b = p.get(1);
        if (a.distance < RATIO * b.distance) {
          src.push(ref.pts[2 * a.trainIdx], ref.pts[2 * a.trainIdx + 1]);
          dst.push(frame.pts[2 * a.queryIdx], frame.pts[2 * a.queryIdx + 1]);
        }
      }
      p.delete();
    }
    pairs.delete();
    const good = src.length / 2;
    if (good < MIN_GOOD) return { good, inliers: 0, spread: 0 };

    const srcM = cv.matFromArray(good, 1, cv.CV_32FC2, src);
    const dstM = cv.matFromArray(good, 1, cv.CV_32FC2, dst);
    const mask = new cv.Mat();
    const H = cv.findHomography(srcM, dstM, cv.RANSAC, RANSAC_PX, mask);
    let inliers = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    if (!H.empty() && saneHomography(H)) {
      for (let i = 0; i < mask.rows; i++) {
        if (!mask.data[i]) continue;
        inliers++;
        const x = src[2 * i], y = src[2 * i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    srcM.delete(); dstM.delete(); mask.delete(); H.delete();
    // spread: how much of the match area the agreeing points span — geometric mean of
    // the covered width and height shares, so a tall thin object (a column, a tube)
    // still scores well, while points bunched on one small detail score low
    const b = ref.box, bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
    const spread = inliers ? Math.min(1, Math.sqrt(Math.min(1, (x1 - x0) / bw) * Math.min(1, (y1 - y0) / bh))) : 0;
    return { good, inliers, spread };
  }

  // Rejects fits that flip, collapse or blow up the image (typical of chance matches).
  function saneHomography(H) {
    const h = H.data64F;
    const det = h[0] * h[4] - h[1] * h[3];
    return det > 0.05 && det < 20 && Math.abs(h[6]) < 0.005 && Math.abs(h[7]) < 0.005;
  }

  async function match(video, prepared) {
    await load(); const cv = CV;   // never return/await CV itself (thenable)
    if (!video || video.readyState < 2 || !video.videoWidth) return [];
    if (!matcher) matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    const gray = toGray(cv, video, video.videoWidth, video.videoHeight, FRAME_MAX, 'frame');
    const frame = detect(cv, gray, FRAME_FEATURES);
    gray.delete();
    const out = [];
    try {
      for (const fig of prepared) {
        let best = { id: fig.id, inliers: 0, good: 0, spread: 0 };
        if (frame.des.rows > 0) {
          for (const ref of fig.refs) {
            const r = matchOne(cv, frame, ref);
            if (r.inliers > best.inliers || (r.inliers === best.inliers && r.good > best.good)) best = { id: fig.id, ...r };
          }
        }
        out.push(best);
      }
    } finally {
      frame.des.delete();
    }
    return out;
  }

  return { load, prepare, match, preview, validPolygon };
})();
