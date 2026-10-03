/**
 * images.js — the admin's photo pipeline.
 *
 *   decodeImage(fileOrBlob)          → { canvas, width, height }   upright (EXIF), ≤ MAX_SOURCE px
 *   keepOriginal(file, decoded)      → { blob, ext }   the upload's own bytes (JPEG/PNG/WebP ≤ 12 MB)
 *                                      or a high-quality upright JPEG ≤ 3600 px
 *   estimateFocal(canvas)            → { x, y, confidence }   where a face most likely is (0..1)
 *   autoCropRect(w, h, ratio, focal) → px rect of the largest crop of `ratio`, centred on focal
 *   renderPhoto(source, opts)        → { display:{blob,ext,width,height}, thumb:{blob}, canvas }
 *                                      DISPLAY = crop/contain at the EXACT ratio, ≤ 1800 px, graded
 *                                      THUMB   = ≤ 640 px JPEG of the display
 *   renderPreview(source, opts)      → small canvas (cropper / editor before-after)
 *
 * Originals are never modified. Every derived image has exactly the photo's ratio:
 * its pixel size is an integer multiple of the reduced ratio (3:4 → 1350×1800).
 */
import { gradeImage, canvasToBlob } from '../assets/js/shared/grade.js';
import { intRatio, outputSize, MIME_EXT } from './util.js';
import { cleanImage } from './metadata.js';

export const MAX_SOURCE = 3600; //            working copy long side (< 16 MP canvas limit on phones)
export const DISPLAY_MAX = 1800;
export const THUMB_MAX = 640;
export const KEEP_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024;
export const DISPLAY_QUALITY = 0.86;
export const THUMB_QUALITY = 0.8;
export const DEFAULT_FOCAL = Object.freeze({ x: 0.5, y: 0.4 });
export const HEIC_MESSAGE = 'iPhone HEIC photos — please share as JPEG / “Most Compatible”.';
export const HEIC_HELP = 'On the iPhone: Photos → select the photo → Share → Options → choose “Most Compatible” (or Settings → Camera → Formats → Most Compatible for future photos). Then choose it again here.';

export class ImageError extends Error {
  constructor(message, code = '') { super(message); this.name = 'ImageError'; this.code = code; }
}

export function isHeic(file) {
  const t = ((file && file.type) || '').toLowerCase();
  const n = ((file && file.name) || '').toLowerCase();
  return /hei[cf]/.test(t) || /\.(heic|heif)$/.test(n);
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function loadImgElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

/** Draw a region of `src` into a new w×h canvas with good-quality, stepped downscaling. */
export function drawRegion(src, sx, sy, sw, sh, w, h) {
  let cur = src;
  let cx = sx;
  let cy = sy;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= w && ch / 2 >= h && cw > 2 && ch > 2) {
    const nw = Math.max(w, Math.floor(cw / 2));
    const nh = Math.max(h, Math.floor(ch / 2));
    const step = makeCanvas(nw, nh);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh);
    cur = step; cx = 0; cy = 0; cw = nw; ch = nh;
  }
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, cx, cy, cw, ch, 0, 0, out.width, out.height);
  return out;
}

/**
 * Decode a File/Blob into an upright canvas no larger than MAX_SOURCE on its long side.
 * createImageBitmap(…, {imageOrientation:'from-image'}) applies EXIF orientation; the
 * <img> fallback does too (CSS image-orientation defaults to from-image).
 */
export async function decodeImage(file, { maxSide = MAX_SOURCE } = {}) {
  let source = null;
  let sw = 0;
  let sh = 0;
  let cleanup = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      source = bmp; sw = bmp.width; sh = bmp.height;
      cleanup = () => { try { bmp.close(); } catch { /* noop */ } };
    } catch { /* fall back to <img> */ }
  }
  if (!source) {
    try {
      const { img, url } = await loadImgElement(file);
      source = img; sw = img.naturalWidth; sh = img.naturalHeight;
      cleanup = () => URL.revokeObjectURL(url);
    } catch {
      if (isHeic(file)) throw new ImageError(HEIC_MESSAGE, 'heic');
      const t = (file && file.type) || '';
      if (t && !t.startsWith('image/')) throw new ImageError('That file isn’t a photo. Please choose a JPEG, PNG or WebP image.', 'type');
      throw new ImageError('This photo couldn’t be opened. Try exporting it as a JPEG and choose it again.', 'decode');
    }
  }
  if (!sw || !sh) { cleanup(); throw new ImageError('This photo seems to be empty.', 'empty'); }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  let canvas;
  try {
    canvas = drawRegion(source, 0, 0, sw, sh, w, h);
  } finally {
    cleanup();
  }
  return { canvas, width: w, height: h, naturalWidth: sw, naturalHeight: sh };
}

/**
 * What to store as the untouched original: the uploaded picture itself when it is a web image
 * format and ≤ 12 MB — with its private metadata (GPS position, dates, camera, hidden previews)
 * removed losslessly (metadata.js), because originals are published; otherwise a high-quality
 * upright JPEG (≤ 3600 px), which carries no metadata at all.
 */
export async function keepOriginal(file, decoded) {
  const type = ((file && file.type) || '').toLowerCase();
  const ext = MIME_EXT[type];
  if (ext && ['jpg', 'png', 'webp'].includes(ext) && file.size <= KEEP_ORIGINAL_MAX_BYTES) {
    try {
      const clean = cleanImage(new Uint8Array(await file.arrayBuffer()), ext);
      if (clean) return { blob: clean.changed ? new Blob([clean.bytes], { type }) : file, ext };
    } catch { /* unreadable as bytes → re-encode below */ }
  }
  const blob = await canvasToBlob(decoded.canvas, 'image/jpeg', 0.93);
  return { blob, ext: 'jpg' };
}

/* ---------------------------------------------------------------- focal & crops */

function skinW(r, g, b) {
  if (!(r > g && g >= b)) return 0;
  const c = r - b;
  if (c < 10) return 0;
  const hf = (g - b) / c;
  const sat = c / r;
  if (hf < 0.05 || hf > 0.85 || sat < 0.12 || sat > 0.7 || r < 60) return 0;
  return 1;
}

/**
 * A gentle guess of where the subject's face is: skin-coloured pixels, weighted toward
 * the upper-middle of the frame. Falls back to (0.5, 0.4) when unsure.
 */
export function estimateFocal(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const k = Math.min(1, 96 / Math.max(W, H));
  const w = Math.max(4, Math.round(W * k));
  const h = Math.max(4, Math.round(H * k));
  let data;
  try {
    const small = drawRegion(canvas, 0, 0, W, H, w, h);
    data = small.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  } catch {
    return { ...DEFAULT_FOCAL, confidence: 0 };
  }
  let sx = 0;
  let sy = 0;
  let sw = 0;
  let skin = 0;
  for (let y = 0; y < h; y++) {
    const ny = (y + 0.5) / h;
    const py = Math.exp(-(((ny - 0.38) / 0.32) ** 2));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const s = skinW(data[i], data[i + 1], data[i + 2]);
      if (!s) continue;
      skin++;
      const nx = (x + 0.5) / w;
      const wt = py * Math.exp(-(((nx - 0.5) / 0.42) ** 2));
      sx += nx * wt; sy += ny * wt; sw += wt;
    }
  }
  const frac = skin / (w * h);
  if (sw <= 0 || frac < 0.008) return { ...DEFAULT_FOCAL, confidence: 0 };
  const conf = Math.min(1, frac * 8);
  const x = DEFAULT_FOCAL.x + (sx / sw - DEFAULT_FOCAL.x) * conf;
  // faces sit a little above the skin centroid (necks, arms pull it down)
  const y = DEFAULT_FOCAL.y + (sy / sw - 0.04 - DEFAULT_FOCAL.y) * conf;
  return { x: clamp01(x), y: clamp01(y), confidence: conf };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Largest crop of `ratio` inside srcW×srcH, centred on `focal` (normalised), clamped to the image. */
export function autoCropRect(srcW, srcH, ratioStr, focal = DEFAULT_FOCAL) {
  const r = intRatio(ratioStr).value;
  let w;
  let h;
  if (srcW / srcH > r) { h = srcH; w = h * r; } else { w = srcW; h = w / r; }
  const fx = focal && Number.isFinite(focal.x) ? focal.x : DEFAULT_FOCAL.x;
  const fy = focal && Number.isFinite(focal.y) ? focal.y : DEFAULT_FOCAL.y;
  const x = Math.max(0, Math.min(srcW - w, srcW * fx - w / 2));
  const y = Math.max(0, Math.min(srcH - h, srcH * fy - h / 2));
  return { x, y, w, h };
}

export const toNorm = (rect, W, H) => ({ x: rect.x / W, y: rect.y / H, w: rect.w / W, h: rect.h / H });
export const fromNorm = (n, W, H) => ({ x: n.x * W, y: n.y * H, w: n.w * W, h: n.h * H });
export const round4 = (v) => Math.round(v * 10000) / 10000;
export const roundRect = (n) => ({ x: round4(n.x), y: round4(n.y), w: round4(n.w), h: round4(n.h) });

/** Where the whole image sits inside a contain-mode display (normalised). */
export function containInset(srcW, srcH, ratioStr) {
  const R = intRatio(ratioStr).value;
  const s = srcW / srcH;
  if (s >= R) { const hh = R / s; return { x: 0, y: (1 - hh) / 2, w: 1, h: hh }; }
  const ww = s / R;
  return { x: (1 - ww) / 2, y: 0, w: ww, h: 1 };
}

/** Focal in source space (normalised) → focal in the display image (normalised). */
export function focalToDisplay(f, { crop, mode, srcW, srcH, ratio }) {
  const box = mode === 'contain' ? containInset(srcW, srcH, ratio) : null;
  if (box) return { x: round4(clamp01(box.x + f.x * box.w)), y: round4(clamp01(box.y + f.y * box.h)) };
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  return { x: round4(clamp01((f.x - c.x) / c.w)), y: round4(clamp01((f.y - c.y) / c.h)) };
}

/** Focal in the display image → source space (normalised). */
export function focalToSource(f, { crop, mode, srcW, srcH, ratio }) {
  const box = mode === 'contain' ? containInset(srcW, srcH, ratio) : null;
  if (box) return { x: clamp01((f.x - box.x) / box.w), y: clamp01((f.y - box.y) / box.h) };
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  return { x: clamp01(c.x + f.x * c.w), y: clamp01(c.y + f.y * c.h) };
}

/* ---------------------------------------------------------------- rendering */

/** Cover: the crop rect (px) drawn at exactly `ratio`, long side ≤ longPx (never upscaled past the crop). */
function renderCover(src, rectPx, ratio, longPx) {
  const size = outputSize(ratio, Math.min(longPx, Math.max(16, Math.round(Math.max(rectPx.w, rectPx.h)))));
  return drawRegion(src, rectPx.x, rectPx.y, rectPx.w, rectPx.h, size.w, size.h);
}

/**
 * Contain: the WHOLE image fitted inside `ratio`, over a soft, blurred, darkened,
 * colour-matched extension of itself. Never stretched.
 */
export function renderContain(src, ratio, longPx) {
  const sw = src.width;
  const sh = src.height;
  const R = intRatio(ratio).value;
  // size where the contained photo is shown at (at most) 1:1
  const natW = sw / sh >= R ? sw : sh * R;
  const natH = natW / R;
  const size = outputSize(ratio, Math.min(longPx, Math.max(16, Math.round(Math.max(natW, natH)))));
  const out = makeCanvas(size.w, size.h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 1. background: cover-fit, blurred by down/up-sampling (works everywhere, no ctx.filter needed)
  const cover = autoCropRect(sw, sh, ratio, { x: 0.5, y: 0.5 });
  const tinyLong = 18;
  const t1 = outputSize(ratio, tinyLong);
  const tiny = drawRegion(src, cover.x, cover.y, cover.w, cover.h, t1.w, t1.h);
  const mid = makeCanvas(Math.max(2, Math.round(size.w / 6)), Math.max(2, Math.round(size.h / 6)));
  const mctx = mid.getContext('2d');
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(tiny, 0, 0, mid.width, mid.height);
  ctx.drawImage(mid, 0, 0, size.w, size.h);
  // 2. darken + gently desaturate so the photo stays the hero
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = 'rgba(128,128,128,0.25)';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(12, 8, 18, 0.42)';
  ctx.fillRect(0, 0, size.w, size.h);
  // 3. the photo, centred, with a soft shadow
  const inset = containInset(sw, sh, ratio);
  const dx = inset.x * size.w;
  const dy = inset.y * size.h;
  const dw = inset.w * size.w;
  const dh = inset.h * size.h;
  const photo = drawRegion(src, 0, 0, sw, sh, Math.max(1, Math.round(dw)), Math.max(1, Math.round(dh)));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = Math.round(Math.max(size.w, size.h) * 0.025);
  ctx.drawImage(photo, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
  ctx.restore();
  return out;
}

/** Ungraded display-shaped canvas. */
export function renderShape(src, { ratio, crop, mode = 'cover', focal, longPx = DISPLAY_MAX }) {
  if (mode === 'contain') return renderContain(src, ratio, longPx);
  const rect = crop ? fromNorm(crop, src.width, src.height) : autoCropRect(src.width, src.height, ratio, focal);
  return renderCover(src, rect, ratio, longPx);
}

/** Encode the display image: WebP where the browser really produces it, else JPEG. */
export async function encodeDisplay(canvas, quality = DISPLAY_QUALITY) {
  try {
    const webp = await canvasToBlob(canvas, 'image/webp', quality);
    if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
  } catch { /* fall through */ }
  const jpg = await canvasToBlob(canvas, 'image/jpeg', quality);
  return { blob: jpg, ext: 'jpg' };
}

/**
 * Full derive: shape → grade → encode display + thumb.
 * @param {HTMLCanvasElement} source decoded original (upright)
 * @param {{ratio:string, crop?:object, mode?:'cover'|'contain', focal?:object, grade?:{strength:number, warmth?:number, exposure?:number}}} opts
 */
export async function renderPhoto(source, { ratio, crop = null, mode = 'cover', focal = null, grade = { strength: 0.85 } }) {
  const shaped = renderShape(source, { ratio, crop, mode, focal, longPx: DISPLAY_MAX });
  const graded = await gradeImage(shaped, { strength: grade.strength, warmth: grade.warmth || 0, exposure: grade.exposure || 0, maxSide: Math.max(shaped.width, shaped.height) });
  const display = await encodeDisplay(graded);
  const t = outputSize(ratio, THUMB_MAX);
  const thumbCanvas = graded.width > t.w ? drawRegion(graded, 0, 0, graded.width, graded.height, t.w, t.h) : graded;
  const thumb = await canvasToBlob(thumbCanvas, 'image/jpeg', THUMB_QUALITY);
  return { display: { ...display, width: graded.width, height: graded.height }, thumb: { blob: thumb }, canvas: graded };
}

/** Small preview (cropper, editor before/after). `grade` null → ungraded. */
export async function renderPreview(source, { ratio, crop = null, rectPx = null, mode = 'cover', focal = null, grade = null, longPx = 480 }) {
  let shaped;
  if (rectPx) shaped = renderCover(source, rectPx, ratio, longPx);
  else shaped = renderShape(source, { ratio, crop, mode, focal, longPx });
  if (!grade) return shaped;
  return gradeImage(shaped, { strength: grade.strength, warmth: grade.warmth || 0, exposure: grade.exposure || 0, maxSide: Math.max(shaped.width, shaped.height) });
}

/** Image size of a blob (upright). */
export async function blobSize(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const out = { width: b.width, height: b.height };
      b.close();
      return out;
    } catch { /* fall back */ }
  }
  const { img, url } = await loadImgElement(blob);
  URL.revokeObjectURL(url);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** Effective grading for a photo record. */
export function gradeFor(photo, globalStrength) {
  const g = (photo && photo.grade) || {};
  const strength = Number.isFinite(g.strength) ? g.strength : globalStrength;
  return { strength: Math.max(0, Math.min(1, strength)), warmth: Number(g.warmth) || 0, exposure: Number(g.exposure) || 0 };
}

export { intRatio };
