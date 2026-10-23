# figures/

One folder per figure. The folder name is the figure's id — it ends up in
the QR code (`?f=<folder-name>`), so keep it lowercase with dashes and
don't rename it after cards are printed.

```
figures/
└── worm-man/
    ├── meta.json      ← title, subtitle, location (lat/lng → map on the card), order
    ├── drawing/       ← the cartoon (any name; PNG with transparency or SVG)
    ├── audio/         ← the sound (any name; mp3 / m4a)
    └── photos/        ← photos of the object the drawing overlays
```

After adding or changing files: `node tools/build.mjs` (push.sh does it
for you). It writes `figures/index.json`, which is what the app reads, and
makes small web copies of the photos in `photos/_web/`.

New figure: copy the `worm-man` folder, rename it, edit meta.json.
