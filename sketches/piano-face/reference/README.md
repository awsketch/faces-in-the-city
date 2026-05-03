# Reference photos — Piano Face

Drop the photos of the building (taken from the right angle, in different
lights / weather / seasons) into **this folder**.

## Naming convention

```
ref-01.jpg
ref-02.jpg
ref-03.jpg
…
```

`.jpg`, `.jpeg`, and `.png` are all fine. Keep the originals reasonably sized
(1024 × 1024 or so is plenty — bigger files just slow the page down).

## How many?

6–10 photos spanning the actual variation (bright sun, overcast, evening,
winter vs. summer if there's foliage in frame) does most of the work.
20–30 is fine but adds diminishing returns.

## After you add photos

Open `../metadata.json` and list them under `"reference_photos"`:

```json
"reference_photos": [
  "reference/ref-01.jpg",
  "reference/ref-02.jpg",
  "reference/ref-03.jpg"
]
```

Once that's filled in and the alignment logic is wired up, the app will
automatically average them in feature space and use the result to detect
when the live camera matches the spot.
