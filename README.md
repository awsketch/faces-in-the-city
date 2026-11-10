# Berlin Kvetch

Cartoon figures hidden on objects around Berlin. Each figure has a
transparent card with the drawing, a tiny map and a QR code:

1. The map on the card leads to the spot; the drawing on the card shows what to look for.
2. Scanning the QR code opens the app **straight into the camera**, with the drawing as overlay.
3. When the camera frame matches the reference photos of the object, the sound player opens.
   The figure only talks while the round **Kvetch** button is held: press = play (and the
   figure animates), release = pause (and the figure freezes on its drawing).
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

Everything for a figure goes into its own folder, `figures/<figure>/`:

| Folder | What goes in | Notes |
|---|---|---|
| `drawing/` | the cartoon | one file; PNG with transparent background or SVG |
| `audio/` | the sound | one file; mp3 or m4a |
| `photos/` | photos of the object | 6–10 from the card's spot, different light/weather; HEIC is fine |
| `animation/` | numbered frames `01.png`, `02.png`, … | optional; see below |
| `meta.json` | title, subtitle, location, order, `fps` | |

**Animation:** the frames play in number order, looping like a gif, only while
the Kvetch button is held and the audio plays. When it stops, the figure rests on
the drawing. `01.png` must be identical to the drawing. Speed is 3 frames per
second; set e.g. `"fps": 4` in `meta.json` to change it per figure. Without
frames (or with just one) the drawing simply stays still.

Then run `./push.sh` (or double-click `Push to website.command`). It runs
`node tools/build.mjs`, which lists per figure what it found (drawing, audio,
photos, animation frames), and publishes.

## URLs

| URL | Opens |
|---|---|
| `/?f=worm-man` | camera with the Worm Man overlay (this is what the QR encodes) |
| `/?f=worm-man#listen` | player (only if already unlocked) |
| `/#collection` | collection |

## QR codes

Each QR code encodes one plain link, `https://berlin-kvetch.chismes.de/?f=<figure-folder>`:

| Figure | QR link |
|---|---|
| Piano Face | `https://berlin-kvetch.chismes.de/?f=piano-face` |
| Worm Man | `https://berlin-kvetch.chismes.de/?f=worm-man` |
| Rosa Needs Sun | `https://berlin-kvetch.chismes.de/?f=rosa-needs-sun` |
| Claudia Doesn't Get It | `https://berlin-kvetch.chismes.de/?f=claudia-doesnt-get-it` |
| Cunty Little Sphynx | `https://berlin-kvetch.chismes.de/?f=cunty-little-sphynx` |
| Cunty Sphynx | `https://berlin-kvetch.chismes.de/?f=cunty-sphynx` |
| Fritz the Disappointed Optimist | `https://berlin-kvetch.chismes.de/?f=fritz-the-disappointed-optimist` |
| Kevin the Imp | `https://berlin-kvetch.chismes.de/?f=kevin-the-imp` |
| Klaus the Rules Guy | `https://berlin-kvetch.chismes.de/?f=klaus-the-rules-guy` |
| Worm Orgy | `https://berlin-kvetch.chismes.de/?f=worm-orgy` |

A new figure gets `?f=` + its folder name in `figures/`.

**How they are made:** `cards.html` draws them in the browser with the
open-source JavaScript library **qrcode-generator 1.4.4** (Kazuhiko Arase,
loaded from cdn.jsdelivr.net), error correction level **M**, output as SVG.
No external QR service, no tracking or redirect: the link is in the code itself,
so printed cards keep working as long as the domain and folder names stay the same.

**To make them again:**
1. Run `./push.sh` (or `Push to website.command`) so the live site is current.
2. Open `https://berlin-kvetch.chismes.de/cards.html`.
3. Check the "App address" field at the top reads `https://berlin-kvetch.chismes.de/`
   (not `localhost`); if not, fix it and click "Update codes".
4. Print, or copy a link from the table above into any other QR generator
   (any generator works, since the code only contains the plain link).

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
