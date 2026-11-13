// matcher.js — feature-point matching with a geometry check (OpenCV.js).
//
//   Matcher.load()                       loads OpenCV.js once (≈3.5 MB gzipped, from jsDelivr)
//   Matcher.prepare(figure)              ORB keypoints + descriptors for every reference photo
//   Matcher.match(videoEl, prepared[])   ORB on the current frame, then per figure:
//                                        ratio-tested matches → RANSAC homography → inlier count
//                                        returns [{ id, inliers, good }] (best photo per figure)
//
// The inlier count is the "how sure" number: matches that agree on one
// consistent geometric fit between the photo and the camera frame. In tests,
// a photo of a different spot gives 0–4 inliers, another photo of the same
// spot 10–200.
//
// OpenCV.js objects live in WebAssembly memory and are NOT garbage-collected:
// every Mat / vector created here is deleted explicitly.

window.Matcher = (function () {
  const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js';
  const REF_MAX = 640;      // reference photos are scaled so the long side is this
  const FRAME_MAX = 480;    // camera frames likewise
  const REF_FEATURES = 1000;
  const FRAME_FEATURES = 800;
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

  function detect(cv, gray, n) {
    const orb = new cv.ORB(n);
    const kp = new cv.KeyPointVector();
    const des = new cv.Mat();
    const none = new cv.Mat();
    orb.detectAndCompute(gray, none, kp, des);
    const pts = new Float32Array(kp.size() * 2);
    for (let i = 0; i < kp.size(); i++) { const p = kp.get(i).pt; pts[2 * i] = p.x; pts[2 * i + 1] = p.y; }
    orb.delete(); kp.delete(); none.delete();
    return { pts, des };   // des must be deleted by the caller
  }

  // → { id, refs: [{ url, pts, des }] }
  async function prepare(figure) {
    await load(); const cv = CV;   // never return/await CV itself (thenable)
    const refs = [];
    for (const url of figure.photos || []) {
      try {
        const img = await loadImage(url);
        const gray = toGray(cv, img, img.naturalWidth, img.naturalHeight, REF_MAX, 'ref');
        const { pts, des } = detect(cv, gray, REF_FEATURES);
        gray.delete();
        if (des.rows > 0) refs.push({ url, pts, des }); else des.delete();
      } catch (err) { console.warn('[matcher] skipped', url, err); }
    }
    return { id: figure.id, refs };
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
    if (good < MIN_GOOD) return { good, inliers: 0 };

    const srcM = cv.matFromArray(good, 1, cv.CV_32FC2, src);
    const dstM = cv.matFromArray(good, 1, cv.CV_32FC2, dst);
    const mask = new cv.Mat();
    const H = cv.findHomography(srcM, dstM, cv.RANSAC, RANSAC_PX, mask);
    let inliers = 0;
    if (!H.empty() && saneHomography(H)) for (let i = 0; i < mask.rows; i++) if (mask.data[i]) inliers++;
    srcM.delete(); dstM.delete(); mask.delete(); H.delete();
    return { good, inliers };
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
        let best = { id: fig.id, inliers: 0, good: 0 };
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

  return { load, prepare, match };
})();
