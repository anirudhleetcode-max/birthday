#!/usr/bin/env node
/**
 * check-photos — run after uploading or replacing photos (no browser, no dependencies).
 *
 *   node scripts/check-photos.mjs          (also part of `npm run check`)
 *
 * For every photo in data/photos.json that has a real image:
 *   • shape: the display copy has exactly the shape its spot expects (nothing stretched/squashed)
 *   • weight: display copy ≤ 1800 px and not unnecessarily heavy; thumbnail ≤ 640 px
 *   • privacy: no GPS position, camera/lens serial number, XMP/IPTC blocks or hidden trailing
 *     images left in the published files (originals are public too)
 * and, for uploaded music / video / voice notes, no recording location left in the file.
 * Exits 1 on a shape or privacy problem; size notes are warnings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { combine, FILES, parseRatio } from '../assets/js/shared/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DISPLAY_MAX = 1800;
const THUMB_MAX = 640;
const DISPLAY_HEAVY = 900 * 1024;
const THUMB_HEAVY = 220 * 1024;

const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

/** { type, w, h } of a JPEG / PNG / WebP, or null. */
export function imageSize(b) {
  if (b.length > 24 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return { type: 'png', w: u32be(b, 16), h: u32be(b, 20) };
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const kind = ascii(b, 12, 4);
    if (kind === 'VP8X') return { type: 'webp', w: u24le(b, 24) + 1, h: u24le(b, 27) + 1 };
    if (kind === 'VP8 ') return { type: 'webp', w: u16le(b, 26) & 0x3fff, h: u16le(b, 28) & 0x3fff };
    if (kind === 'VP8L') { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { type: 'webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = u16be(b, i + 2);
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'jpeg', w: u16be(b, i + 7), h: u16be(b, i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** Private details still inside an image file: [] when clean. */
export function privacyIssues(b) {
  const issues = [];
  const tiffTags = (t) => { // t = TIFF bytes (after "Exif\0\0")
    const le = ascii(t, 0, 2) === 'II';
    const r16 = (i) => (le ? t[i] | (t[i + 1] << 8) : (t[i] << 8) | t[i + 1]);
    const r32 = (i) => (le ? (t[i] | (t[i + 1] << 8) | (t[i + 2] << 16) | (t[i + 3] << 24)) >>> 0 : u32be(t, i));
    const ifd = (off) => {
      const out = [];
      if (off + 2 > t.length) return out;
      const n = r16(off);
      for (let k = 0; k < n && off + 2 + k * 12 + 12 <= t.length; k++) { const e = off + 2 + k * 12; out.push({ tag: r16(e), value: r32(e + 8) }); }
      return out;
    };
    const ifd0 = ifd(r32(4));
    const all = [...ifd0];
    const exif = ifd0.find((e) => e.tag === 0x8769);
    if (exif) all.push(...ifd(exif.value));
    return all.map((e) => e.tag);
  };
  const exifCheck = (t) => {
    const tags = tiffTags(t);
    if (tags.includes(0x8825)) issues.push('GPS position (EXIF)');
    if (tags.some((x) => x === 0xa431 || x === 0xa435 || x === 0xc62f)) issues.push('camera/lens serial number (EXIF)');
    if (tags.includes(0x0110) || tags.includes(0x010f)) issues.push('camera make/model (EXIF)');
  };
  const img = imageSize(b);
  if (img && img.type === 'jpeg') {
    let i = 2;
    while (i + 4 < b.length) {
      if (b[i] !== 0xff) break;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd9) { if (b.length - (i + 2) > 64) issues.push('hidden data after the end of the image'); break; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = u16be(b, i + 2);
      const p = b.subarray(i + 4, i + 2 + len);
      if (m === 0xe1 && ascii(p, 0, 6) === 'Exif\0\0') exifCheck(p.subarray(6));
      if (m === 0xe1 && ascii(p, 0, 4) === 'http') issues.push('XMP block');
      if (m === 0xed) issues.push('IPTC block');
      if (m === 0xda) { // scan data: jump to EOI
        let e = i + 2 + len;
        while (e + 1 < b.length && !(b[e] === 0xff && b[e + 1] === 0xd9)) e++;
        if (b.length - (e + 2) > 64) issues.push('hidden data after the end of the image');
        break;
      }
      i += 2 + len;
    }
  } else if (img && img.type === 'png') {
    for (let i = 8; i + 8 <= b.length;) {
      const len = u32be(b, i);
      const type = ascii(b, i + 4, 4);
      if (type === 'eXIf') exifCheck(b.subarray(i + 8, i + 8 + len));
      if (['tEXt', 'iTXt', 'zTXt'].includes(type)) issues.push(`text chunk (${type})`);
      if (type === 'IEND') break;
      i += 12 + len;
    }
  } else if (img && img.type === 'webp') {
    for (let i = 12; i + 8 <= b.length;) {
      const type = ascii(b, i, 4);
      const len = u32be(Uint8Array.of(b[i + 7], b[i + 6], b[i + 5], b[i + 4]), 0);
      if (type === 'EXIF') { const p = b.subarray(i + 8, i + 8 + len); exifCheck(ascii(p, 0, 6) === 'Exif\0\0' ? p.subarray(6) : p); }
      if (type === 'XMP ') issues.push('XMP block');
      i += 8 + len + (len & 1);
    }
  }
  return [...new Set(issues)];
}

/** Recording locations (ISO 6709, e.g. "+12.9716+077.5946/") left in an audio/video file. */
export function mediaLocation(b) {
  const s = Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('latin1');
  return /[+-]\d{1,2}\.\d{2,}[+-]\d{1,3}\.\d{2,}/.test(s);
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

function main() {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const site = combine({ settings: read(FILES.settings), messages: read(FILES.messages), photos: read(FILES.photos) });
  const errors = [];
  const warnings = [];
  const file = (p) => {
    if (!p || /^(https?:|blob:|data:)/.test(p)) return null;
    const abs = path.join(ROOT, p);
    return fs.existsSync(abs) ? fs.readFileSync(abs) : undefined;
  };
  const real = (site.photos || []).filter((p) => p.src);
  let total = 0;
  let biggest = null;
  for (const p of real) {
    const name = `${p.label || p.id} (${p.chapter})`;
    const disp = file(p.src);
    if (disp === undefined) { errors.push(`${name}: display file missing (${p.src})`); continue; }
    if (!disp) continue;
    total += disp.length;
    if (!biggest || disp.length > biggest.size) biggest = { name, size: disp.length };
    const s = imageSize(disp);
    const want = parseRatio(p.ratio);
    if (!s) warnings.push(`${name}: couldn't read the display image's size`);
    else {
      const got = s.w / s.h;
      if (want && Math.abs(got / want - 1) > 0.015) errors.push(`${name}: display copy is ${s.w}×${s.h} but its spot is ${p.ratio} (it would look stretched or cropped). Replace it in the admin.`);
      if (Math.max(s.w, s.h) > DISPLAY_MAX) warnings.push(`${name}: display copy is ${s.w}×${s.h}, bigger than the film needs (≤ ${DISPLAY_MAX} px). Re-upload it through the admin to get a lighter copy; the original is kept.`);
    }
    if (disp.length > DISPLAY_HEAVY) warnings.push(`${name}: display copy is ${kb(disp.length)} (aim for under ${kb(DISPLAY_HEAVY)}).`);
    const leak = privacyIssues(disp);
    if (leak.length) errors.push(`${name}: display copy still contains ${leak.join(', ')}.`);
    const th = file(p.thumb);
    if (th === undefined) warnings.push(`${name}: thumbnail missing (${p.thumb})`);
    else if (th) {
      const ts = imageSize(th);
      if (ts && Math.max(ts.w, ts.h) > THUMB_MAX) warnings.push(`${name}: thumbnail is ${ts.w}×${ts.h} (≤ ${THUMB_MAX} px expected).`);
      if (th.length > THUMB_HEAVY) warnings.push(`${name}: thumbnail is ${kb(th.length)}.`);
      const tl = privacyIssues(th);
      if (tl.length) errors.push(`${name}: thumbnail still contains ${tl.join(', ')}.`);
    }
    const orig = file(p.original);
    if (orig) {
      const ol = privacyIssues(orig);
      const serious = ol.filter((x) => !/make\/model/.test(x));
      if (serious.length) errors.push(`${name}: the ORIGINAL (public!) still contains ${serious.join(', ')}. Re-upload it through the admin, which removes these.`);
      else if (ol.length) warnings.push(`${name}: the original still names the camera (${ol.join(', ')}).`);
    }
  }
  for (const k of ['music', 'video', 'voice']) {
    const m = site.media && site.media[k];
    const b = m && file(m);
    if (b && mediaLocation(b)) errors.push(`The ${k} file still contains a recording location. Re-upload it through the admin, which blanks it.`);
  }

  console.log(`photos with images: ${real.length} of ${(site.photos || []).length}`);
  if (real.length) console.log(`display copies: ${kb(total)} in total${biggest ? `, largest ${biggest.name} ${kb(biggest.size)}` : ''}`);
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(errors.length ? `\n✗ photo check: ${errors.length} problem(s)` : '\n✓ photo check passed');
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
