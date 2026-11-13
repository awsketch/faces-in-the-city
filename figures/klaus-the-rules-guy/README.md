# Klaus the Rules Guy — drop files here

```
klaus-the-rules-guy/
├── meta.json    ← title, subtitle, location (lat/lng for the map on the card)
├── drawing/     ← the cartoon: PNG with transparent background or SVG works best
├── audio/       ← the sound: mp3 or m4a
├── photos/      ← photos of the object the drawing sits on
└── animation/   ← optional: frames 01.png, 02.png, … (01 = the drawing)
```

- File names don't matter. One file each in drawing/ and audio/.
- Photos: 6–10 from the exact spot the card points to, in different light
  and weather. iPhone HEIC files are fine — they get converted on build.
- Match area: after pushing the photos, draw the main object on each photo in
  `tools/area.html` and save `klaus-the-rules-guy-areas.json` here in `photos/` (then push again).
- Animation: numbered PNGs (01, 02, 03 …) with transparent background. They
  loop like a gif while the Kvetch button is held; on release the figure
  rests on the drawing. Speed: "fps" in meta.json (default 8).
- After adding files, run `node tools/build.mjs` (or just `./push.sh`).
