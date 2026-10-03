/**
 * metadata.js — remove private metadata from uploads before they reach the (public) repository.
 *
 * Phones write a lot into a photo besides the picture: the GPS position where it was taken,
 * the exact date and time, the phone's make / model / serial, editing software, sometimes a
 * small preview of the ORIGINAL (uncropped) photo and, on newer phones, extra hidden images
 * (depth maps) after the end of the JPEG. Every original the Lantern Room keeps is published,
 * so all of that is stripped here — LOSSLESSLY: the picture data itself is never re-encoded.
 *
 *   cleanImage(bytes, ext)   JPEG: keeps only what decoding needs (JFIF, colour profile, Adobe,
 *                            tables, frame, scans) + a tiny EXIF that holds ONLY the
 *                            orientation, so the photo still shows upright; drops EXIF (GPS,
 *                            dates, camera, thumbnail), XMP, IPTC, comments, MPF and anything
 *                            after the end of the image.
 *                            PNG: keeps the image + colour chunks; drops text, time and EXIF.
 *                            WebP: returned as is when it carries no EXIF/XMP.
 *                            → { bytes, changed } or null when the file can't be cleaned safely
 *                              (the caller then stores a re-encoded copy instead).
 *   scrubVideoLocation(blob) MP4 / MOV / M4A: the recording location (ISO 6709 strings such as
 *                            "+12.9716+077.5946/" in the `moov` box) is overwritten IN PLACE with
 *                            zeros — same length, so nothing else in the file moves.
 *                            → Promise<{ blob, scrubbed: number }>
 *
 * Pure byte work, no DOM: unit-tested in tests/admin/metadata.test.mjs.
 */

const ascii = (bytes, at, n) => String.fromCharCode(...bytes.subarray(at, at + n));

/* ---------------------------------------------------------------- JPEG */

/** EXIF orientation (1–8) from an APP1 payload that starts with "Exif\0\0", or 1. */
export function exifOrientation(payload) {
  try {
    if (ascii(payload, 0, 6) !== 'Exif\0\0') return 1;
    const t = 6;
    const le = ascii(payload, t, 2) === 'II';
    const u16 = (o) => (le ? payload[t + o] | (payload[t + o + 1] << 8) : (payload[t + o] << 8) | payload[t + o + 1]);
    const u32 = (o) => (le
      ? (payload[t + o] | (payload[t + o + 1] << 8) | (payload[t + o + 2] << 16) | (payload[t + o + 3] << 24)) >>> 0
      : ((payload[t + o] << 24) | (payload[t + o + 1] << 16) | (payload[t + o + 2] << 8) | payload[t + o + 3]) >>> 0);
    const ifd = u32(4);
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (t + e + 12 > payload.length) break;
      if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
    }
  } catch { /* malformed → upright */ }
  return 1;
}

/** A minimal APP1 segment: EXIF with only the orientation tag (big-endian TIFF). */
export function orientationSegment(orientation) {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0, 0, 0];
  const payload = [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat(tiff);
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 255, ...payload]);
}

/** Lossless JPEG clean-up (see the header). → Uint8Array | null (not a parseable JPEG). */
export function stripJpeg(bytes) {
  if (!(bytes && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8)) return null;
  const keep = [bytes.subarray(0, 2)];
  let orientation = 1;
  let afterApp0 = 1; // index in `keep` where the orientation EXIF goes (after SOI / JFIF)
  let pos = 2;
  for (;;) {
    if (pos + 1 >= bytes.length) return null; // no end-of-image marker
    if (bytes[pos] !== 0xff) return null;
    let m = bytes[pos + 1];
    while (m === 0xff && pos + 2 < bytes.length) { pos++; m = bytes[pos + 1]; } // fill bytes
    if (m === 0xd9) { keep.push(bytes.subarray(pos, pos + 2)); break; } // EOI: drop everything after it
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { keep.push(bytes.subarray(pos, pos + 2)); pos += 2; continue; }
    if (pos + 4 > bytes.length) return null;
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (len < 2 || pos + 2 + len > bytes.length) return null;
    const seg = bytes.subarray(pos, pos + 2 + len);
    const payload = bytes.subarray(pos + 4, pos + 2 + len);
    pos += 2 + len;
    if (m === 0xda) {
      // start of scan: copy the header and the entropy-coded data up to the next real marker
      let end = pos;
      while (end + 1 < bytes.length && !(bytes[end] === 0xff && bytes[end + 1] !== 0x00 && !(bytes[end + 1] >= 0xd0 && bytes[end + 1] <= 0xd7))) end++;
      if (end + 1 >= bytes.length) return null;
      keep.push(seg, bytes.subarray(pos, end));
      pos = end;
      continue;
    }
    if (m === 0xe0) { // APP0: JFIF stays (JFXX thumbnails go)
      if (ascii(payload, 0, 5) === 'JFIF\0') { keep.push(seg); afterApp0 = keep.length; }
      continue;
    }
    if (m === 0xe1) { if (ascii(payload, 0, 6) === 'Exif\0\0') orientation = exifOrientation(payload); continue; } // EXIF / XMP
    if (m === 0xe2) { if (ascii(payload, 0, 12) === 'ICC_PROFILE\0') keep.push(seg); continue; } // colour profile stays, MPF goes
    if (m === 0xee) { keep.push(seg); continue; } // Adobe (needed to decode some colour spaces)
    if ((m >= 0xe3 && m <= 0xef) || m === 0xfe) continue; // other APPn (IPTC, maker data…) and comments
    keep.push(seg); // tables, frame header, restart interval…
  }
  if (orientation !== 1) keep.splice(afterApp0, 0, orientationSegment(orientation));
  const total = keep.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of keep) { out.set(b, o); o += b.length; }
  return out;
}

/* ---------------------------------------------------------------- PNG */
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'acTL', 'fcTL', 'fdAT', 'cICP']);

/** PNG without text / time / EXIF / private chunks. null when it has EXIF (orientation) or is malformed. */
export function stripPng(bytes) {
  if (!(bytes && bytes.length > 8 && PNG_SIG.every((v, i) => bytes[i] === v))) return null;
  const keep = [bytes.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const len = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
    const type = ascii(bytes, pos + 4, 4);
    const end = pos + 12 + len;
    if (end > bytes.length) return null;
    if (type === 'eXIf') return null; // may rotate the picture → let the caller re-encode it upright
    if (PNG_KEEP.has(type)) keep.push(bytes.subarray(pos, end));
    pos = end;
    if (type === 'IEND') break;
  }
  if (ascii(keep[keep.length - 1], 4, 4) !== 'IEND') return null;
  const out = new Uint8Array(keep.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of keep) { out.set(b, o); o += b.length; }
  return out;
}

/* ---------------------------------------------------------------- WebP */
/** True when a WebP carries EXIF or XMP chunks. */
export function webpHasMetadata(bytes) {
  if (!(bytes && bytes.length > 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')) return true;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const type = ascii(bytes, pos, 4);
    const len = (bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)) >>> 0;
    if (type === 'EXIF' || type === 'XMP ') return true;
    pos += 8 + len + (len & 1);
  }
  return false;
}

/** Clean an uploaded image's bytes. → { bytes, changed } | null (store a re-encoded copy instead). */
export function cleanImage(bytes, ext) {
  let out = null;
  if (ext === 'jpg') out = stripJpeg(bytes);
  else if (ext === 'png') out = stripPng(bytes);
  else if (ext === 'webp') out = webpHasMetadata(bytes) ? null : bytes;
  if (!out) return null;
  return { bytes: out, changed: out.length !== bytes.length || out.some((v, i) => v !== bytes[i]) };
}

/* ---------------------------------------------------------------- MP4 / MOV / M4A */
// "+12.9716+077.5946/", "+37.3349-122.0090+010.000/", "+48.8577+002.2950+30CRSWGS_84/" …
const ISO6709 = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[A-Z0-9_]+)?\//g;

/** Zero the digits of every ISO 6709 location string in `bytes` (in place). → how many. */
export function scrubLocationBytes(bytes) {
  // latin1 view: one char per byte, so string indexes are byte offsets
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  let n = 0;
  for (const m of s.matchAll(ISO6709)) {
    const crs = m[0].indexOf('CRS'); // the coordinate system's name ("WGS_84") is not a position
    for (let k = 0; k < (crs >= 0 ? crs : m[0].length); k++) {
      const c = bytes[m.index + k];
      if (c >= 0x30 && c <= 0x39) bytes[m.index + k] = 0x30;
    }
    n++;
  }
  return n;
}

/** Top-level boxes of an ISO-BMFF file → [{type, start, size}] (reads only the 8–16 byte headers). */
async function topBoxes(blob) {
  const out = [];
  let pos = 0;
  for (let guard = 0; pos + 8 <= blob.size && guard < 4096; guard++) {
    const head = new Uint8Array(await blob.slice(pos, pos + 16).arrayBuffer());
    let size = ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0;
    const type = ascii(head, 4, 4);
    if (size === 1 && head.length >= 16) size = Number((BigInt(((head[8] << 24) | (head[9] << 16) | (head[10] << 8) | head[11]) >>> 0) << 32n) + BigInt(((head[12] << 24) | (head[13] << 16) | (head[14] << 8) | head[15]) >>> 0));
    else if (size === 0) size = blob.size - pos;
    if (size < 8 || pos + size > blob.size) break;
    out.push({ type, start: pos, size });
    pos += size;
  }
  return out;
}

/** MP4/MOV/M4A: blank the recording location inside `moov` (same length; nothing else moves). */
export async function scrubVideoLocation(blob) {
  try {
    const boxes = await topBoxes(blob);
    if (!boxes.length || !boxes.some((b) => b.type === 'ftyp' || b.type === 'moov' || b.type === 'wide' || b.type === 'mdat')) return { blob, scrubbed: 0 };
    const parts = [];
    let pos = 0;
    let scrubbed = 0;
    for (const b of boxes.filter((x) => x.type === 'moov' && x.size <= 64 * 1024 * 1024)) {
      const bytes = new Uint8Array(await blob.slice(b.start, b.start + b.size).arrayBuffer());
      const n = scrubLocationBytes(bytes);
      if (!n) continue;
      scrubbed += n;
      parts.push(blob.slice(pos, b.start), bytes);
      pos = b.start + b.size;
    }
    if (!scrubbed) return { blob, scrubbed: 0 };
    parts.push(blob.slice(pos));
    return { blob: new Blob(parts, { type: blob.type }), scrubbed };
  } catch {
    return { blob, scrubbed: 0 };
  }
}
