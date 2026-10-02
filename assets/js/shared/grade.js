/**
 * grade.js — the film's photo grade: SUBTLE, natural, consistent.
 *
 * Presentation copies only (the admin keeps every original untouched). Grain and
 * vignette are added live by the site, never baked in here.
 *
 * What it does (all gentle, all capped):
 *   1. exposure normalisation   – the median brightness moves part of the way to a
 *                                 common target (dark party photos lift, bright ones calm)
 *   2. colour balance           – a small, partial neutralisation of strong casts,
 *                                 estimated only from near-neutral pixels (a purple wall
 *                                 is not a cast) — skin is protected
 *   3. mild warmth              – the same small warm shift on every photo (skin protected,
 *                                 so faces never turn orange)
 *   4. contrast normalisation   – hazy blacks are settled, dull whites lifted a little,
 *                                 a soft S-curve, slightly deeper (never crushed) shadows
 *   5. highlight roll-off       – bright areas ease into white instead of clipping
 *   6. restrained saturation    – loud colours (neon lights) are calmed; skin left natural
 *   7. strength                 – blend between the photo and the full look (0..1)
 *
 * Tone is applied to LUMINANCE in linear light and the colour ratios are kept, so
 * hues — skin above all — do not shift. Per-photo `warmth` (−1..1) and `exposure`
 * (−1..1) overrides are honoured even at strength 0.
 *
 * Exports:
 *   gradeImage(source, { strength = 0.85, maxSide = 2000, warmth = 0, exposure = 0 }) → Promise<HTMLCanvasElement>
 *   gradeData(rgba, width, height, { strength, warmth, exposure })  (in place, pure — used by tests)
 *   canvasToJpegBlob(canvas, quality = 0.88) → Promise<Blob>
 *   canvasToBlob(canvas, type, quality)      → Promise<Blob>
 *   skinHue(rgba, width, height, rect?)      → average hue (°) of skin-like pixels (tests / QA)
 *   LOOK                                     the tuning constants
 *
 * No dependencies. ES module.
 */

export const LOOK = Object.freeze({
  // 1. exposure normalisation (perceptual = sRGB-encoded luminance): dark photos are
  //    lifted toward liftTarget, very bright ones calmed a little toward calmTarget,
  //    anything in between is left alone
  liftBelow: 0.42,
  liftTarget: 0.45,
  liftAmount: 0.42,
  liftMaxEV: 0.6,
  calmAbove: 0.68,
  calmTarget: 0.62,
  calmAmount: 0.25,
  calmMaxEV: 0.15,
  // 2. colour balance (partial, capped, from near-neutral pixels)
  wbAmount: 0.3,
  wbMin: 0.94,
  wbMax: 1.07,
  // 3. mild warmth (linear-light gains, luminance preserving)
  warmth: 0.022,
  skinProtectBalance: 0.6,
  skinProtectWarmth: 0.9,
  highlightProtectWarmth: 0.65, // near-white areas stay clean (no beige whites)
  // 4. contrast normalisation
  blackTarget: 0.03,
  blackAmount: 0.5,
  blackMaxShift: 0.05,
  whiteTarget: 0.97,
  whiteAmount: 0.4,
  whiteMaxGain: 1.08,
  contrast: 0.07,
  shadowDepth: 0.035,
  // 5. highlight roll-off: above shoulderStart the curve eases so the brightest
  //    content lands at shoulderTop instead of clipping
  shoulderStart: 0.8,
  shoulderTop: 0.985,
  // 6. colour
  saturation: 1,
  satCompress: 0.16,
  skinSatKeep: 0.85,
  // per-photo overrides (−1..1 in the admin)
  userWarmth: 0.075,
  userExposureEV: 0.7,
});

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;
const N = 4096; // LUT resolution (indexed by sqrt of linear values)

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const eotf = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); // sRGB → linear
const oetf = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); // linear → sRGB

let LIN = null;
function linTable() {
  if (LIN) return LIN;
  LIN = new Float32Array(256);
  for (let v = 0; v < 256; v++) LIN[v] = eotf(v / 255);
  return LIN;
}
let ENC = null;
/** linear (sqrt-indexed) → sRGB byte (float) */
function encTable() {
  if (ENC) return ENC;
  ENC = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) { const s = i / N; ENC[i] = oetf(s * s) * 255; }
  return ENC;
}

/** Skin likelihood (0..1) from sRGB bytes. Hue ≈ 1°–54°, moderate saturation, not too dark. */
function skinWeight(r, g, b) {
  if (!(r > g && g >= b)) return 0;
  const c = r - b;
  if (c < 6) return 0;
  const hf = (g - b) / c; // hue / 60°
  const sat = c / r;
  const hueW = hf < 0.02 ? 0 : hf < 0.1 ? (hf - 0.02) / 0.08 : hf < 0.7 ? 1 : hf < 0.9 ? (0.9 - hf) / 0.2 : 0;
  if (!hueW) return 0;
  const satW = sat < 0.08 ? 0 : sat < 0.16 ? (sat - 0.08) / 0.08 : sat < 0.6 ? 1 : sat < 0.8 ? (0.8 - sat) / 0.2 : 0;
  if (!satW) return 0;
  const valW = r < 38 ? 0 : r < 76 ? (r - 38) / 38 : 1;
  return hueW * satW * valW;
}

/** Illuminant-estimate weight by saturation: near-neutral pixels tell us about the light. */
function neutralWeight(s) {
  if (s < 0.1) return 1;
  if (s > 0.4) return 0;
  const t = (0.4 - s) / 0.3;
  return t * t;
}

/* ---------------------------------------------------------------- analysis */
function analyse(data, n) {
  const L = linTable();
  const step = Math.max(1, Math.floor(n / 240000));
  const hist = new Uint32Array(1024);
  let total = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sw = 0;
  for (let p = 0; p < n; p += step) {
    const i = p << 2;
    const r8 = data[i];
    const g8 = data[i + 1];
    const b8 = data[i + 2];
    const lr = L[r8];
    const lg = L[g8];
    const lb = L[b8];
    const y = LR * lr + LG * lg + LB * lb;
    const yp = oetf(y);
    hist[Math.min(1023, (yp * 1023 + 0.5) | 0)]++;
    total++;
    const mx = r8 > g8 ? (r8 > b8 ? r8 : b8) : (g8 > b8 ? g8 : b8);
    if (mx < 40 || mx > 250) continue; // noisy blacks / clipped whites tell nothing about the light
    const mn = r8 < g8 ? (r8 < b8 ? r8 : b8) : (g8 < b8 ? g8 : b8);
    let w = neutralWeight((mx - mn) / mx);
    if (!w) continue;
    w *= 1 - skinWeight(r8, g8, b8);
    sr += lr * w; sg += lg * w; sb += lb * w; sw += w;
  }
  const pct = (q) => {
    const target = q * total;
    let acc = 0;
    for (let v = 0; v < 1024; v++) { acc += hist[v]; if (acc >= target) return v / 1023; }
    return 1;
  };
  const balance = sw > total * 0.01 && sw > 0 ? [sr / sw, sg / sw, sb / sw] : null;
  return { lo: pct(0.005), median: pct(0.5), hi: pct(0.995), balance };
}

function balanceGains(mean) {
  if (!mean) return [1, 1, 1];
  const y = LR * mean[0] + LG * mean[1] + LB * mean[2];
  if (!(y > 0)) return [1, 1, 1];
  const g = mean.map((m) => {
    const v = Math.pow(y / Math.max(1e-5, m), LOOK.wbAmount);
    return v < LOOK.wbMin ? LOOK.wbMin : v > LOOK.wbMax ? LOOK.wbMax : v;
  });
  const after = LR * mean[0] * g[0] + LG * mean[1] * g[1] + LB * mean[2] * g[2];
  const k = after > 0 ? y / after : 1;
  return g.map((v) => v * k);
}

function warmthGains(w) {
  const g = [1 + w, 1 + w * 0.1, 1 - w * 1.25];
  const k = 1 / (LR * g[0] + LG * g[1] + LB * g[2]);
  return g.map((v) => v * k);
}

/* ---------------------------------------------------------------- tone */
/** Reinhard-style shoulder, C1 at s0, mapping `top` (the brightest content) to LOOK.shoulderTop. */
function makeShoulder(top) {
  const s0 = LOOK.shoulderStart;
  const a = Math.max(top, 1) - s0;
  const b = LOOK.shoulderTop - s0;
  const R = a > b + 1e-6 ? (a * b) / (a - b) : Infinity;
  return (s) => (s <= s0 ? s : s0 + (s - s0) / (1 + (s - s0) / R));
}

/**
 * Tone curve on perceptual luminance: levels → exposure → soft S → deeper shadows → roll-off.
 * Returns a sqrt-indexed LUT: linear luminance in → linear luminance out.
 */
function buildToneLut(stats, userEV, full) {
  const lut = new Float32Array(N + 1);
  let bp = 0;
  let wg = 1;
  let ev = userEV;
  if (full) {
    if (stats.lo > LOOK.blackTarget) bp = Math.min(LOOK.blackMaxShift, (stats.lo - LOOK.blackTarget) * LOOK.blackAmount);
    const hiQ = (stats.hi - bp) / (1 - bp);
    if (hiQ > 0.05 && hiQ < LOOK.whiteTarget) wg = Math.min(LOOK.whiteMaxGain, 1 + (LOOK.whiteTarget / hiQ - 1) * LOOK.whiteAmount);
    const medQ = Math.max(0.02, Math.min(0.98, ((stats.median - bp) / (1 - bp)) * wg));
    let auto = 0;
    if (medQ < LOOK.liftBelow) auto = Math.min(LOOK.liftMaxEV, LOOK.liftAmount * Math.log2(eotf(LOOK.liftTarget) / eotf(medQ)));
    else if (medQ > LOOK.calmAbove) auto = Math.max(-LOOK.calmMaxEV, LOOK.calmAmount * Math.log2(eotf(LOOK.calmTarget) / eotf(medQ)));
    ev += auto;
  }
  const E = Math.pow(2, ev);
  const curve = (yin) => {
    let p = oetf(yin);
    if (full) {
      p = ((p - bp) / (1 - bp)) * wg;
      if (p < 0) p = 0;
    }
    // exposure in linear light (values above 1 stay above 1 for the shoulder)
    let r = E === 1 ? p : oetf(eotf(Math.min(p, 1)) * E) + (p > 1 ? (p - 1) * E : 0);
    if (full && r < 1) {
      const sm = r * r * (3 - 2 * r);
      r += LOOK.contrast * (sm - r);
      const q = 1 - r;
      r -= LOOK.shadowDepth * 4 * r * q * q * q;
    }
    return r;
  };
  const top = curve(eotf(stats.hi));
  const shoulder = full || E > 1 ? makeShoulder(top) : (v) => v;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    lut[i] = eotf(clamp01(shoulder(curve(s * s))));
  }
  return lut;
}

const lookup = (lut, y) => {
  const f = Math.sqrt(y < 0 ? 0 : y > 1 ? 1 : y) * N;
  const i = f | 0;
  if (i >= N) return lut[N];
  const t = f - i;
  return lut[i] + (lut[i + 1] - lut[i]) * t;
};

/* ---------------------------------------------------------------- grade */
/**
 * Grade RGBA pixel data in place.
 * @param {Uint8ClampedArray|Uint8Array} data
 * @param {number} w
 * @param {number} h
 * @param {{strength?:number, warmth?:number, exposure?:number}} [opts]
 */
export function gradeData(data, w, h, { strength = 0.85, warmth = 0, exposure = 0 } = {}) {
  const n = w * h;
  const s = clamp01(Number.isFinite(+strength) ? +strength : 0.85);
  const uw = Math.max(-1, Math.min(1, +warmth || 0)) * LOOK.userWarmth;
  const ue = Math.max(-1, Math.min(1, +exposure || 0)) * LOOK.userExposureEV;
  const hasUser = Math.abs(uw) > 1e-4 || Math.abs(ue) > 1e-4;
  if (s <= 0.001 && !hasUser) return data;

  const L = linTable();
  const ENCT = encTable();
  const stats = analyse(data, n);
  const bal = balanceGains(stats.balance);
  const warmFull = warmthGains(LOOK.warmth + uw);
  const warmUser = warmthGains(uw);
  const lutFull = buildToneLut(stats, ue, true);
  const lutUser = hasUser ? buildToneLut(stats, ue, false) : null;
  const spB = LOOK.skinProtectBalance;
  const spW = LOOK.skinProtectWarmth;
  const hpW = LOOK.highlightProtectWarmth;
  const satBase = LOOK.saturation;
  const satC = LOOK.satCompress;
  const skinKeep = LOOK.skinSatKeep;

  const enc = (v) => {
    const f = Math.sqrt(v < 0 ? 0 : v > 1 ? 1 : v) * N;
    const i = f | 0;
    if (i >= N) return ENCT[N];
    return ENCT[i] + (ENCT[i + 1] - ENCT[i]) * (f - i);
  };

  for (let p = 0; p < n; p++) {
    const i = p << 2;
    const r8 = data[i];
    const g8 = data[i + 1];
    const b8 = data[i + 2];
    const lr = L[r8];
    const lg = L[g8];
    const lb = L[b8];
    const sk = skinWeight(r8, g8, b8);

    // ---- full look ----
    const kb = 1 - spB * sk;
    const y0 = LR * lr + LG * lg + LB * lb;
    let hl = (y0 - 0.45) / 0.45; // 0 at perceptual ≈ 0.7, 1 at ≈ 0.95
    hl = hl <= 0 ? 0 : hl >= 1 ? hpW : hl * hl * (3 - 2 * hl) * hpW;
    const kw = (1 - spW * sk) * (1 - hl);
    // skin keeps (most of) its colour: only the user's own warmth fully applies there
    const gr = (1 + (bal[0] - 1) * kb) * (warmUser[0] + (warmFull[0] - warmUser[0]) * kw);
    const gg = (1 + (bal[1] - 1) * kb) * (warmUser[1] + (warmFull[1] - warmUser[1]) * kw);
    const gb = (1 + (bal[2] - 1) * kb) * (warmUser[2] + (warmFull[2] - warmUser[2]) * kw);
    let r = lr * gr;
    let g = lg * gg;
    let b = lb * gb;
    let y = LR * r + LG * g + LB * b;
    const yo = lookup(lutFull, y);
    const k = y > 1e-7 ? yo / y : 0;
    r *= k; g *= k; b *= k;
    if (y <= 1e-7) { r = g = b = yo; }
    // restrained saturation (around luminance, linear light → hue preserved)
    let mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    if (mx > 1e-6) {
      const sat = (mx - mn) / mx;
      let f = satBase * (1 - satC * sat * sat);
      f += (1 - f) * skinKeep * sk;
      r = yo + (r - yo) * f; g = yo + (g - yo) * f; b = yo + (b - yo) * f;
      mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    }
    if (mx > 1) { // out of gamut: ease toward luminance, keep hue
      const t = (1 - yo) / Math.max(1e-6, mx - yo);
      r = yo + (r - yo) * t; g = yo + (g - yo) * t; b = yo + (b - yo) * t;
    }
    let R = enc(r);
    let G = enc(g);
    let B = enc(b);

    if (s < 0.999) {
      // ---- the "untouched" side of the blend (only the user's tweaks) ----
      let R0 = r8;
      let G0 = g8;
      let B0 = b8;
      if (hasUser) {
        let ur = lr * warmUser[0];
        let ug = lg * warmUser[1];
        let ub = lb * warmUser[2];
        const uy = LR * ur + LG * ug + LB * ub;
        const uyo = lookup(lutUser, uy);
        const uk = uy > 1e-7 ? uyo / uy : 0;
        ur *= uk; ug *= uk; ub *= uk;
        const umx = ur > ug ? (ur > ub ? ur : ub) : (ug > ub ? ug : ub);
        if (umx > 1) { const t = (1 - uyo) / Math.max(1e-6, umx - uyo); ur = uyo + (ur - uyo) * t; ug = uyo + (ug - uyo) * t; ub = uyo + (ub - uyo) * t; }
        R0 = enc(ur); G0 = enc(ug); B0 = enc(ub);
      }
      R = R0 + (R - R0) * s;
      G = G0 + (G - G0) * s;
      B = B0 + (B - B0) * s;
    }
    data[i] = R + 0.5;
    data[i + 1] = G + 0.5;
    data[i + 2] = B + 0.5;
    data[i + 3] = 255;
  }
  return data;
}

/** Average hue (degrees) of skin-like pixels in `rect` ({x,y,w,h} px) — for QA and tests. */
export function skinHue(data, w, h, rect = { x: 0, y: 0, w, h }) {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sw = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * w + x) << 2;
      const wt = skinWeight(data[i], data[i + 1], data[i + 2]);
      if (!wt) continue;
      sr += data[i] * wt; sg += data[i + 1] * wt; sb += data[i + 2] * wt; sw += wt;
    }
  }
  if (!sw) return null;
  const r = sr / sw;
  const g = sg / sw;
  const b = sb / sw;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 1e-6) return 0;
  let hue;
  if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6);
  else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2);
  else hue = 60 * ((r - g) / (mx - mn) + 4);
  return hue < 0 ? hue + 360 : hue;
}

/* ---------------------------------------------------------------- canvas glue */
function sourceSize(source) {
  const width = source.naturalWidth || source.videoWidth || source.displayWidth || source.width || 0;
  const height = source.naturalHeight || source.videoHeight || source.displayHeight || source.height || 0;
  return { width, height };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draw `source` into a new w×h canvas, stepping down by halves for clean large downscales. */
function drawScaled(source, sw, sh, w, h) {
  let cur = source;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= w * 1.0001 && ch / 2 >= h * 1.0001 && cw > 2 && ch > 2) {
    const nw = Math.max(w, Math.floor(cw / 2));
    const nh = Math.max(h, Math.floor(ch / 2));
    const step = makeCanvas(nw, nh);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = step; cw = nw; ch = nh;
  }
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, cw, ch, 0, 0, w, h);
  return out;
}

/**
 * Grade an image into the film's look.
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} source
 * @param {{strength?: number, maxSide?: number, warmth?: number, exposure?: number}} [opts]
 * @returns {Promise<HTMLCanvasElement>} a new canvas (≤ maxSide on its long side, same aspect)
 */
export async function gradeImage(source, { strength = 0.85, maxSide = 2000, warmth = 0, exposure = 0 } = {}) {
  const { width: sw, height: sh } = sourceSize(source);
  if (!sw || !sh) throw new Error('gradeImage: the image has no size (not loaded yet?)');
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = drawScaled(source, sw, sh, w, h);
  const s = clamp01(Number.isFinite(+strength) ? +strength : 0.85);
  if (s <= 0.001 && !(+warmth) && !(+exposure)) return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  gradeData(img.data, w, h, { strength: s, warmth, exposure });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Encode a canvas. Resolves the Blob (its .type tells what the browser really produced). */
export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.88) {
  if (typeof canvas.convertToBlob === 'function' && typeof canvas.toBlob !== 'function') {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the image (the photo may be too large for this device).'));
      }, type, quality);
    } catch (err) {
      reject(err);
    }
  });
}

/** Encode a canvas as JPEG. */
export function canvasToJpegBlob(canvas, quality = 0.88) {
  return canvasToBlob(canvas, 'image/jpeg', quality);
}
