# Faces in the City

Companion web app for a notebook of face/silhouette drawings tied to
specific spots in the city. Users open the app at the location, pick the
sketch from a list, point their camera at the building, and the sketch
reveals itself with a short spoken-word piece when the camera frame lines
up with reference photos of the spot.

This is a static site — pure HTML / CSS / JS, no build step. Drop it on
GitHub Pages (or any static host) and it works.

---

## Folder structure

```
.
├── index.html                  ← Landing page (list of sketches)
├── sketch.html                 ← Per-sketch page (locked → camera → unlocked)
├── css/
│   └── style.css
├── js/
│   ├── landing.js              ← Renders the list on the home page
│   ├── sketch.js               ← Camera, view states, audio
│   └── alignment.js            ← Stub for the photo-matching logic
└── sketches/
    ├── index.json              ← Master list of sketches (one entry per face)
    └── piano-face/             ← One folder per sketch
        ├── metadata.json       ← Title, paths, location, reference list
        ├── overlay.svg         ← The line-art doodle that overlays the camera
        ├── reference/          ← Photos of the building, varied lighting/weather
        │   └── README.md
        └── audio/
            ├── speech.mp3      ← The POV audio (you add this)
            └── README.md
```

---

## Adding a new sketch

1. **Create a folder** under `sketches/` named after the sketch slug, e.g.
   `sketches/clock-tower/`.
2. **Add four things** inside it:
   - `metadata.json` — copy from `sketches/piano-face/metadata.json` and edit
     the `id`, `title`, `subtitle`, and `location`.
   - `overlay.svg` — the line-art doodle that overlays the camera.
   - `reference/` — drop photos of the building from the right angle here.
     See `sketches/piano-face/reference/README.md` for naming/conventions.
   - `audio/speech.mp3` — the spoken piece that plays when unlocked.
3. **Register it** in `sketches/index.json` by adding a new entry to the
   `sketches` array (id, title, location).

That's it — no code changes needed.

---

## Current state of alignment

`js/alignment.js` is a **stub**. The camera page runs an alignment loop and
shows a "0%" confidence readout, but the unlock happens via the manual
**"I see it — unlock"** button.

When reference photos exist, the planned implementation will:

1. Run each reference photo through a small pretrained vision model
   (MobileNet via TensorFlow.js is the likely pick) to get a feature
   embedding — a vector describing the image content abstracted from
   exact lighting.
2. Average the embeddings across all reference photos for that sketch into
   one "reference fingerprint."
3. On each tick, capture a frame from the live camera, embed it the same
   way, and compute cosine similarity. Above a threshold (~0.78), unlock
   automatically.

See the comments at the top of `js/alignment.js` for the wiring points.

---

## Running locally

Most browsers will block `getUserMedia` (camera) and `fetch` for `file://`
URLs. Run a tiny local server:

```bash
# Python 3
python3 -m http.server 8080

# or Node, if installed
npx serve .
```

Then open http://localhost:8080.

For a real phone test, deploy to GitHub Pages or any HTTPS host — camera
access requires HTTPS (or `localhost`).
