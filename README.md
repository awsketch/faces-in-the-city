# Berlin Kvetch

Cartoon figures hidden on objects around Berlin. Each figure has a
transparent card with the drawing, a tiny map and a QR code:

1. The map on the card leads to the spot; the drawing on the card shows what to look for.
2. Scanning the QR code opens the app **straight into the camera**, with the drawing as overlay.
3. When the camera frame matches the reference photos of the object, the sound player opens.
4. The only other screen is the **collection** (reachable from camera and player): which figures are unlocked.

Static site — HTML / CSS / JS, no framework. Unlocks are remembered per browser.

**Live at https://berlin-kvetch.chismes.de** (statichost.eu, custom subdomain).
QR links: `https://berlin-kvetch.chismes.de/?f=<figure-folder>` — e.g. `?f=worm-man`.

## Folders

```
index.html        the app (camera · player · collection)
cards.html        print sheet for the cards (drawing + map + QR) — not linked from the app
js/app.js         views, camera, unlock, player, collection
js/alignment.js   photo matching (MobileNet embeddings, loaded only on the camera)
css/style.css     Editorial Noir styling (design/DESIGN.md)
tools/build.mjs   scans figures/ → figures/index.json
figures/          ONE FOLDER PER FIGURE — see figures/README.md
```

## Adding content

Drop the drawing into `drawing/`, the audio into `audio/` and the photos
into `photos/` of `figures/<figure>/`, then run `node tools/build.mjs` or `./push.sh`.

## URLs

| URL | Opens |
|---|---|
| `/?f=worm-man` | camera with the Worm Man overlay (this is what the QR encodes) |
| `/?f=worm-man#listen` | player (only if already unlocked) |
| `/#collection` | collection |

## Making the cards

Open `cards.html` on the deployed site, check the app address at the top,
print on A4 transparency (63 × 88 mm cards, 3 × 3 per page). Maps need
`lat`/`lng` in each figure's `meta.json`.

## Matching

Same as before: every photo in `photos/` is embedded with MobileNet and
averaged; the live frame unlocks at cosine similarity ≥ 0.78
(`ALIGN_THRESHOLD` in `js/app.js`). The manual **Unlock** button on the
camera is temporary until matching is proven in the field.

## Running locally

```bash
python3 -m http.server 8080   # then http://localhost:8080/?f=worm-man
```

Camera access needs HTTPS or localhost.
