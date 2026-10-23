# Moaning Viking — drop files here

```
moaning-viking/
├── meta.json    ← title, subtitle, location (lat/lng for the map on the card)
├── drawing/     ← the cartoon: PNG with transparent background or SVG works best
├── audio/       ← the sound: mp3 or m4a
└── photos/      ← photos of the object the drawing sits on
```

- File names don't matter. One file each in drawing/ and audio/.
- Photos: 6–10 from the exact spot the card points to, in different light
  and weather. iPhone HEIC files are fine — they get converted on build.
- After adding files, run `node tools/build.mjs` (or just `./push.sh`).
