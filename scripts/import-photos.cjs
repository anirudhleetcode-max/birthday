#!/usr/bin/env node
/**
 * Import a folder of photos into the film with the ADMIN's own pipeline (admin/images.js run in
 * Chromium): the original is kept byte-for-byte (only private metadata removed), the display copy
 * is cropped to its spot's exact shape around her face and gently graded, plus a thumbnail.
 * Nothing about the photo itself is changed: no retouching, no reshaping, no generated pixels.
 *
 *   npm run serve   (in another terminal)
 *   NODE_PATH=$(npm root -g) node scripts/import-photos.cjs <folder> [scripts/photo-import-spec.json]
 *
 * <folder> holds img-000.jpg … (spec "n" = 1-based page number). Writes photos/, photos/thumbs/,
 * photos/originals/ and data/photos.json (records for every photo in the spec; other records kept
 * only if they're "album" extras).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const [dir, specPath = path.join(__dirname, 'photo-import-spec.json')] = process.argv.slice(2);
if (!dir) { console.error('usage: import-photos.cjs <folder> [spec.json]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const PORT = process.env.PORT || '8090';
const pad2 = (n) => String(n).padStart(2, '0');
const when = new Date(spec.stamp || Date.now());
const stamp = `${when.getFullYear()}${pad2(when.getMonth() + 1)}${pad2(when.getDate())}-${pad2(when.getHours())}${pad2(when.getMinutes())}${pad2(when.getSeconds())}`;

(async () => {
  const { orientationSegment } = await import(path.join(ROOT, 'admin/metadata.js'));
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/settings.json'), 'utf8'));
  const strength = settings.settings?.grading?.strength ?? 0.85;
  for (const d of ['photos', 'photos/thumbs', 'photos/originals']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/data/settings.json`); // any same-origin page without a CSP
  const records = [];
  const orders = {};
  for (const s of spec.photos) {
    let bytes = fs.readFileSync(path.join(dir, `img-${String(s.n - 1).padStart(3, '0')}.jpg`));
    if (s.rotate) {
      // stored sideways: say so with a standard EXIF orientation tag (pixels untouched)
      const o = { 90: 8, 180: 3, 270: 6 }[s.rotate];
      bytes = Buffer.concat([bytes.subarray(0, 2), Buffer.from(orientationSegment(o)), bytes.subarray(2)]);
    }
    const out = await page.evaluate(async ({ b64, ratio, focal, strength }) => {
      const I = await import('/admin/images.js');
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bin], 'photo.jpg', { type: 'image/jpeg' });
      const dec = await I.decodeImage(file);
      const focalSrc = { x: focal[0], y: focal[1] };
      const crop = I.roundRect(I.toNorm(I.autoCropRect(dec.width, dec.height, ratio, focalSrc), dec.width, dec.height));
      const r = await I.renderPhoto(dec.canvas, { ratio, crop, mode: 'cover', grade: { strength } });
      const orig = await I.keepOriginal(file, dec);
      const focalD = I.focalToDisplay(focalSrc, { crop, mode: 'cover', srcW: dec.width, srcH: dec.height, ratio });
      const b64of = async (blob) => { const a = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
      return {
        src: await b64of(r.display.blob), ext: r.display.ext, w: r.display.width, h: r.display.height,
        thumb: await b64of(r.thumb.blob), orig: await b64of(orig.blob), origExt: orig.ext,
        crop, focal: { x: Math.round(focalD.x * 1000) / 1000, y: Math.round(focalD.y * 1000) / 1000 }, srcW: dec.width, srcH: dec.height,
      };
    }, { b64: bytes.toString('base64'), ratio: s.ratio, focal: s.focal, strength });
    const base = `${s.id}-${stamp}`;
    const paths = { src: `photos/${base}.${out.ext}`, thumb: `photos/thumbs/${base}.jpg`, original: `photos/originals/${base}.${out.origExt}` };
    fs.writeFileSync(path.join(ROOT, paths.src), Buffer.from(out.src, 'base64'));
    fs.writeFileSync(path.join(ROOT, paths.thumb), Buffer.from(out.thumb, 'base64'));
    fs.writeFileSync(path.join(ROOT, paths.original), Buffer.from(out.orig, 'base64'));
    orders[s.chapter] = (orders[s.chapter] || 0) + 1;
    records.push({
      id: s.id, chapter: s.chapter, order: orders[s.chapter], role: s.role || null, label: s.label, hint: '',
      ratio: s.ratio, ...paths, crop: out.crop, cropMode: 'cover', focal: out.focal,
      caption: '', date: '', alt: s.alt || '', enabled: true, featured: !!s.featured, heroHair: !!s.heroHair,
      grade: { strength: null, warmth: 0, exposure: 0 }, animation: null, effect: null, duration: null,
      ...(s.memory ? { memory: s.memory } : {}),
      w: out.w, h: out.h, addedAt: when.toISOString(), updatedAt: when.toISOString(),
    });
    console.log(`#${String(s.n).padStart(2, '0')} → ${s.id.padEnd(11)} ${s.chapter.padEnd(9)} ${s.ratio.padEnd(5)} ${out.srcW}×${out.srcH} → ${out.w}×${out.h} ${out.ext}`);
  }
  await browser.close();

  const file = path.join(ROOT, 'data/photos.json');
  const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
  const extras = (prev.photos || []).filter((p) => p.chapter === 'album' && p.src);
  const next = { ...prev, photos: [...records, ...extras] };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n${records.length} photos written to data/photos.json`);
})().catch((e) => { console.error(e); process.exit(1); });
