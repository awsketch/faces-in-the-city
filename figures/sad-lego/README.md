# Sad Lego — drop files here

```
sad-lego/
├── meta.json    ← title, subtitle, location (lat/lng for the map on the card)
├── drawing/     ← the cartoon: PNG with transparent background or SVG works best
├── audio/       ← the sound: mp3 or m4a
├── photos/      ← photos of the object the drawing sits on
└── animation/   ← optional: frames 01.png, 02.png, … (01 = the drawing)
```

- File names don't matter. One file each in drawing/ and audio/.
- Photos: 6–10 from the exact spot the card points to, in different light
  and weather. iPhone HEIC files are fine — they get converted on build.
- Animation: numbered PNGs (01, 02, 03 …) with transparent background. They
  loop like a gif while the Kvetch button is held; on release the figure
  rests on the drawing. Speed: "fps" in meta.json (default 8).
- After adding files, run `node tools/build.mjs` (or just `./push.sh`).

## Test figure for the QR-free method

Sad Lego is used to test `find.html` (GPS + feature-point matching) close to home.
- Coordinates: 52.469472, 13.437167 (52°28'10.1"N 13°26'13.8"E) — checked within 75 m of that point.
- Match areas: draw them in `tools/area.html` and save `sad-lego-areas.json` here in `photos/`.
- Test link: https://berlin-kvetch.chismes.de/find.html?debug=1
- Normal QR link (camera with overlay): https://berlin-kvetch.chismes.de/?f=sad-lego
