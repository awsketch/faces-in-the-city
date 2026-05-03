// alignment.js — placeholder for the camera/reference-photo matching logic.
//
// THIS IS A STUB. It always returns 0 confidence so the user must press the
// manual "I see it — unlock" button. The full implementation will go here
// once you've added reference photos to sketches/<id>/reference/.
//
// Planned implementation:
//   1. loadReference(urls):
//        - For each URL, load the image and run it through a small pretrained
//          vision model (e.g. MobileNet via TensorFlow.js) to get a feature
//          embedding (a vector of numbers describing the image content).
//        - Average the embeddings across all reference photos. The result is
//          one "reference fingerprint" that absorbs lighting / weather variation.
//        - Cache it on the returned object.
//
//   2. checkAlignment(videoEl, reference):
//        - Capture the current frame from videoEl into an offscreen canvas.
//        - Run that frame through the same model to get its embedding.
//        - Return cosine similarity to reference.fingerprint (0..1).
//        - The sketch page treats a value above some threshold (e.g. 0.78)
//          as "aligned" and unlocks automatically.
//
// For now: the page still runs the alignment loop so you can see the UI
// updating with a confidence readout, but it's hard-coded to 0.

window.Alignment = (function () {
  async function loadReference(referenceImageUrls) {
    // No-op for now. Returns the list so the rest of the code can branch on
    // whether any reference photos exist.
    return {
      photos: referenceImageUrls || [],
      fingerprint: null,
      ready: false,
    };
  }

  async function checkAlignment(/* videoEl, reference */) {
    // Always 0 in the stub. Replace with real similarity score later.
    return 0;
  }

  return { loadReference, checkAlignment };
})();
