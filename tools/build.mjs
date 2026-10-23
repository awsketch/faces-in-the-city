#!/usr/bin/env node
// tools/build.mjs — scans figures/ and writes figures/index.json.
//
// Run:  node tools/build.mjs      (push.sh runs this automatically)
//
// Per figure folder (figures/<id>/) it looks for:
//   - the drawing   : the image file at the top of the folder (svg/png/jpg/webp/heic)
//   - the audio     : the audio file at the top of the folder (mp3/m4a/aac/wav/ogg)
//   - the photos    : every image inside photos/
//   - meta.json     : optional — title, subtitle, location {name, lat, lng}, order
//
// Photos are shrunk to small JPGs in photos/_web/ (the matcher only needs
// ~224px; full phone photos would make the page download tens of MB at the
// spot). HEIC files are converted the same way. Uses macOS `sips`, or
// ImageMagick if present; without either, originals are used as-is and HEIC
// files are skipped with a warning.
//
// Folders starting with "_" or "." are ignored (use e.g. _template/).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIG_DIR = path.join(ROOT, 'figures');
const WEB_MAX = 640;

const IMG = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic'];
const AUD = ['.mp3', '.m4a', '.aac', '.wav', '.ogg'];
const RASTER_NEEDS_CONVERT = ['.heic'];

const ext = (f) => path.extname(f).toLowerCase();
const visible = (f) => !f.startsWith('.') && !f.startsWith('_');
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const warn = (id, msg) => console.warn(`  ! ${id}: ${msg}`);

function which(cmd) {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
}
const CONVERTER = which('sips') ? 'sips' : which('magick') ? 'magick' : which('convert') ? 'convert' : null;

function toWebJpg(src, dest) {
  if (!CONVERTER) return false;
  try {
    if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) return true;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (CONVERTER === 'sips') {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(WEB_MAX), src, '--out', dest], { stdio: 'ignore' });
    } else {
      execFileSync(CONVERTER, [src, '-auto-orient', '-resize', `${WEB_MAX}x${WEB_MAX}>`, '-quality', '80', dest], { stdio: 'ignore' });
    }
    return fs.existsSync(dest);
  } catch {
    return false;
  }
}

function titleFromId(id) {
  return id.split(/[-_ ]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function pickOne(files, preferredNames, id, kind) {
  if (files.length === 0) return null;
  const pref = files.find((f) => preferredNames.includes(path.parse(f).name.toLowerCase()));
  if (pref) return pref;
  if (files.length > 1) warn(id, `several ${kind} files found, using "${files[0]}" (name one "${preferredNames[0]}.*" to choose)`);
  return files[0];
}

function buildFigure(id) {
  const dir = path.join(FIG_DIR, id);
  const top = fs.readdirSync(dir).filter(visible).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();

  let meta = {};
  if (fs.existsSync(path.join(dir, 'meta.json'))) {
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); }
    catch (e) { warn(id, `meta.json is not valid JSON (${e.message}) — ignoring it`); }
  }

  // Files in a subfolder (drawing/, audio/) win; files at the top level still work.
  const sub = (name) => {
    const d = path.join(dir, name);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter(visible).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort().map((f) => `${name}/${f}`);
  };
  const drawingCandidates = [...sub('drawing'), ...top].filter((f) => IMG.includes(ext(f)));
  const audioCandidates = [...sub('audio'), ...top].filter((f) => AUD.includes(ext(f)));

  // Drawing
  let drawingFile = pickOne(drawingCandidates, ['drawing', 'cartoon', 'figure'], id, 'image');
  let drawing = null;
  if (drawingFile) {
    const abs = path.join(dir, drawingFile);
    if (RASTER_NEEDS_CONVERT.includes(ext(drawingFile))) {
      const dest = path.join(dir, '_web', 'drawing.jpg');
      if (toWebJpg(abs, dest)) drawing = rel(dest);
      else warn(id, `drawing is HEIC and could not be converted — export it as PNG`);
    } else {
      drawing = rel(abs);
    }
  } else {
    warn(id, 'no drawing yet (put the cartoon image in drawing/)');
  }

  // Audio
  const audioFile = pickOne(audioCandidates, ['audio', 'speech'], id, 'audio');
  const audio = audioFile ? rel(path.join(dir, audioFile)) : null;
  if (!audio) warn(id, 'no audio yet (put the mp3/m4a in audio/)');

  // Photos
  const photoDir = path.join(dir, 'photos');
  const photos = [];
  if (fs.existsSync(photoDir)) {
    const all = fs.readdirSync(photoDir).filter(visible).filter((f) => IMG.includes(ext(f)) && ext(f) !== '.svg').sort();
    const baseNames = new Set(all.filter((f) => ext(f) !== '.heic').map((f) => path.parse(f).name.toLowerCase()));
    for (const f of all) {
      const isHeic = ext(f) === '.heic';
      if (isHeic && baseNames.has(path.parse(f).name.toLowerCase())) continue; // already have a png/jpg twin
      const abs = path.join(photoDir, f);
      const dest = path.join(photoDir, '_web', path.parse(f).name + '.jpg');
      if (toWebJpg(abs, dest)) photos.push(rel(dest));
      else if (!isHeic) photos.push(rel(abs));
      else warn(id, `skipped ${f} (HEIC needs sips or ImageMagick to convert)`);
    }
  }
  if (photos.length === 0) warn(id, 'no photos in photos/ yet — camera matching cannot work without them');

  const loc = meta.location || {};
  return {
    id,
    title: meta.title || titleFromId(id),
    subtitle: meta.subtitle || '',
    location: {
      name: loc.name || '',
      lat: typeof loc.lat === 'number' ? loc.lat : null,
      lng: typeof loc.lng === 'number' ? loc.lng : null,
    },
    order: typeof meta.order === 'number' ? meta.order : 999,
    drawing,
    audio,
    photos,
  };
}

const ids = fs.readdirSync(FIG_DIR).filter(visible).filter((f) => fs.statSync(path.join(FIG_DIR, f)).isDirectory());
console.log(`Berlin Kvetch — building figures/index.json (${ids.length} figures, image tool: ${CONVERTER || 'none'})`);

const figures = ids.map(buildFigure)
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  .map(({ order, ...f }) => f);

for (const f of figures) {
  console.log(`  ✓ ${f.id}: drawing ${f.drawing ? 'yes' : 'NO'}, audio ${f.audio ? 'yes' : 'NO'}, ${f.photos.length} photos`);
}

fs.writeFileSync(path.join(FIG_DIR, 'index.json'), JSON.stringify({ figures }, null, 2) + '\n');
console.log('  → figures/index.json written');
