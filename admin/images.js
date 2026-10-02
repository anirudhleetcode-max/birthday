/**
 * images.js — decoding, cropping and the photo pipeline for the admin.
 *
 *   decodeImage(fileOrBlob)       → { canvas, width, height }   (EXIF-oriented, ≤ MAX_SOURCE px)
 *   readImageSize(file)           → { width, height }            (cheap, header only)
 *   autoCropRect(w, h, ratio)     → { x, y, w, h }               (center X, faces-high Y = 40 %)
 *   centerCropRect(w, h, ratio)   → { x, y, w, h }
 *   processPhoto(canvas, rect, ratio, strength) → { originalBlob, gradedBlob, width, height }
 *
 * Saved images ALWAYS have exactly the slot ratio: the pixel size is an integer multiple
 * of the reduced ratio (e.g. 3:4 → 1500×2000 graded, 1800×2400 original).
 */
import { gradeImage, canvasToJpegBlob } from '../assets/js/shared/grade.js';
import { parseRatio } from './model.js';

export const MAX_SOURCE = 3600;      // working copy long side (keeps phones happy; < 16 MP canvas limit)
export const ORIGINAL_MAX = 2400;    // stored "original" (pre-grade) long side
export const GRADED_MAX = 2000;      // published graded photo long side
export const HEIC_MESSAGE = 'iPhone HEIC photos — please share as JPEG / “Most Compatible”.';
export const HEIC_HELP = 'On the iPhone: Photos → select the photo → Share → Options → choose “Most Compatible” (or Settings → Camera → Formats → Most Compatible for future photos). Then choose it again here.';

export class ImageError extends Error {
  constructor(message, code = '') { super(message); this.name = 'ImageError'; this.code = code; }
}

export function isHeic(file) {
  const t = (file && file.type || '').toLowerCase();
  const n = (file && file.name || '').toLowerCase();
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
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
  while (cw / 2 >= w && ch / 2 >= h && cw > 2 && ch > 2) {
    const nw = Math.max(w, Math.floor(cw / 2)), nh = Math.max(h, Math.floor(ch / 2));
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
 * Uses createImageBitmap(…, {imageOrientation:'from-image'}) with an <img> fallback.
 */
export async function decodeImage(file, { maxSide = MAX_SOURCE } = {}) {
  let source = null, sw = 0, sh = 0, cleanup = () => {};
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
      if (t && !t.startsWith('image/')) throw new ImageError('That file isn’t a photo. Please choose a JPEG or PNG image.', 'type');
      throw new ImageError('This photo couldn’t be opened. Try exporting it as a JPEG and choose it again.', 'decode');
    }
  }
  if (!sw || !sh) { cleanup(); throw new ImageError('This photo seems to be empty.', 'empty'); }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  let canvas;
  try {
    canvas = drawRegion(source, 0, 0, sw, sh, w, h);
  } finally {
    cleanup();
  }
  return { canvas, width: w, height: h };
}

/** Cheap dimension read (header decode only; EXIF orientation respected by modern browsers). */
export async function readImageSize(file) {
  try {
    const { img, url } = await loadImgElement(file);
    const out = { width: img.naturalWidth, height: img.naturalHeight };
    URL.revokeObjectURL(url);
    return out;
  } catch {
    return null;
  }
}

/** Largest crop of the given ratio; centered horizontally, vertical center at focusY. */
export function autoCropRect(srcW, srcH, ratioStr, { focusX = 0.5, focusY = 0.4 } = {}) {
  const r = parseRatio(ratioStr).value;
  let w, h;
  if (srcW / srcH > r) { h = srcH; w = h * r; } else { w = srcW; h = w / r; }
  let x = srcW * focusX - w / 2;
  let y = srcH * focusY - h / 2;
  x = Math.max(0, Math.min(srcW - w, x));
  y = Math.max(0, Math.min(srcH - h, y));
  return { x, y, w, h };
}

export function centerCropRect(srcW, srcH, ratioStr) {
  return autoCropRect(srcW, srcH, ratioStr, { focusX: 0.5, focusY: 0.5 });
}

/** Integer pixel size with EXACTLY the ratio, long side ≤ longPx. */
export function outputSize(ratioStr, longPx) {
  const r = parseRatio(ratioStr);
  const k = Math.max(1, Math.floor(longPx / Math.max(r.w, r.h)));
  return { w: r.w * k, h: r.h * k };
}

/**
 * Crop → stored original (≤ 2400 px, JPEG q0.9, ungraded) → graded (≤ 2000 px, JPEG q0.88).
 * Both have exactly the slot ratio.
 */
export async function processPhoto(source, rect, ratioStr, strength = 0.85) {
  const cropLong = Math.max(rect.w, rect.h);
  const o = outputSize(ratioStr, Math.min(ORIGINAL_MAX, Math.round(cropLong)));
  const origCanvas = drawRegion(source, rect.x, rect.y, rect.w, rect.h, o.w, o.h);
  const originalBlob = await canvasToJpegBlob(origCanvas, 0.9);
  const graded = await gradeFromOriginal(origCanvas, ratioStr, strength);
  const gradedBlob = await canvasToJpegBlob(graded, 0.88);
  return { originalBlob, gradedBlob, width: graded.width, height: graded.height };
}

/** Grade an (exact-ratio) original canvas/bitmap into an exact-ratio graded canvas. */
export async function gradeFromOriginal(original, ratioStr, strength = 0.85) {
  const ow = original.width, oh = original.height;
  const g = outputSize(ratioStr, Math.min(GRADED_MAX, Math.max(ow, oh)));
  const src = (g.w === ow && g.h === oh) ? original : drawRegion(original, 0, 0, ow, oh, g.w, g.h);
  return gradeImage(src, { strength, maxSide: Math.max(g.w, g.h) });
}

/** Small preview canvas of a crop, graded (for the cropper / settings preview). */
export async function previewCrop(source, rect, ratioStr, strength, longPx = 420) {
  const s = outputSize(ratioStr, longPx);
  const c = drawRegion(source, rect.x, rect.y, rect.w, rect.h, s.w, s.h);
  if (strength <= 0) return c;
  return gradeImage(c, { strength, maxSide: Math.max(s.w, s.h) });
}

/** Decode a Blob (e.g. an original JPEG fetched from GitHub) into a canvas. */
export async function blobToCanvas(blob) {
  const { canvas } = await decodeImage(blob, { maxSide: 4096 });
  return canvas;
}
