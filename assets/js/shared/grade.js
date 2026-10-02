/**
 * grade.js — one cohesive "Tangled golden-hour lantern night" colour grade.
 *
 * Every photo, from any phone and any lighting, is pulled into the same warm, soft,
 * filmic palette: plum-tinted lifted shadows, honey-gold highlights, gently warm
 * midtones, natural skin, a whisper of warm halation. No vignette / grain is baked in
 * (the site adds those live).
 *
 * Exports:
 *   gradeImage(source, { strength = 0.85, maxSide = 2000 }) → Promise<HTMLCanvasElement>
 *   canvasToJpegBlob(canvas, quality = 0.88)                 → Promise<Blob>
 *
 * Pipeline (all on 8-bit sRGB pixel data, LUT-accelerated):
 *   1. normalise  – partial grey-world white balance + gentle auto-levels
 *   2. tone       – soft filmic S-curve, rolled-off highlights, lifted (plum) blacks
 *   3. split-tone – plum shadows, gold highlights, warm mids; skin protected
 *   4. colour     – saturation −8 %, vibrance +12 %, pinks/magentas preserved
 *   5. glow       – blurred highlights screen-blended with a warm tint (halation)
 *   6. strength   – lerp between the (normalised) original and the full look
 *
 * No dependencies. ES module.
 */

const LOOK = Object.freeze({
  // 1. normalise
  wbAmount: 0.6,          // move channel means 60 % of the way to the luminance mean
  wbMin: 0.8,
  wbMax: 1.25,
  wbMaxGreen: 1.1,
  levelsLow: 0.004,       // 0.4th percentile → black point
  levelsHigh: 0.996,      // 99.6th percentile → white point
  levelsAmount: 0.7,      // applied gently
  maxBlackPoint: 48,      // never clip more than this (0..255)
  minWhitePoint: 190,
  exposureTarget: 0.42,   // gentle auto-exposure: pull the median luminance toward this
  exposureAmount: 0.5,
  gammaMin: 0.74,         // max brighten (gamma < 1 brightens)
  gammaMax: 1.18,         // max darken
  // palette match: pull every photo's average colour toward ONE warm golden-hour white
  paletteTarget: [1.062, 0.994, 0.86], // r, g, b relative to luminance (peachy gold white)
  // Opponent-axis amounts are asymmetric: a big purple wall or a blue sky must not be
  // "corrected" into olive skin, while green (fluorescent) and cold casts are fixed firmly.
  paletteWarmUp: 0.65,      // image cooler than target → warm it
  paletteCoolDown: 0.5,     // image warmer than target → cool it a little
  paletteDemagenta: 0.15,   // image magenta/purple → add green only very gently
  paletteDegreen: 0.85,     // image green → remove green firmly
  paletteMin: [0.8, 0.88, 0.8],
  paletteMax: [1.16, 1.06, 1.28],     // red is capped low so blue skies never turn pink
  clipDesat: 0.85,
  highlightNeutralise: 0.4, // bright (L > 0.8) pixels partially neutralised → consistent cream whites        // near-clipped highlights lose their (unreliable) colour → neutral, then gold
  // 2. tone
  sCurve: 0.26,           // blend toward smoothstep → soft S
  shoulderStart: 0.76,    // highlight roll-off begins here
  shoulderK: 1.7,         // roll-off strength (max white ≈ 0.95–0.96)
  fade: [0.051, 0.040, 0.051], // lifted, very slightly plum black floor (avg ≈ 0.045)
  // 3. split-tone (offsets are luminance-neutral, so brightness is preserved)
  shadowTint: [0x3b, 0x1a, 0x57],
  shadowAmount: 0.14,
  highlightTint: [0xff, 0xd9, 0x8a],
  highlightAmount: 0.2,
  midWarm: [1.0, 0.86, 0.66], // honey
  midAmount: 0.05,
  skinProtect: 0.75,      // how much of the split-tone skin areas are spared
  skinHueMax: 25,         // average skin hue (°, before split-tone/glow add ~5°) above this reads yellow
  skinHueGuard: [28, 44, 54], // per-pixel guard: hues 28°→44° compressed, fading out by 54°
  skinHueGuardKeep: 0.4,      // fraction of the excess hue that is kept
  // 4. colour
  saturation: -0.08,
  vibrance: 0.12,
  pinkKeep: 0.65,         // fraction of the desaturation pinks/magentas are spared
  skinSat: 0.97,          // skin saturation target factor (keeps it natural, never orange)
  skinSatWeight: 0.7,
  // 5. glow
  glowThreshold: 0.7,
  glowAmount: 0.14,
  glowTint: [1.0, 0.80, 0.56],
  glowGrid: 220,          // long side of the low-res glow buffer
  glowRadius: 3,          // box-blur radius in glow cells (3 passes ≈ gaussian)
});

const LR = 0.2126, LG = 0.7152, LB = 0.0722;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Luminance-neutral chroma offset of a colour (0..1 floats). */
function chromaOffset(rgb) {
  const [r, g, b] = rgb;
  const y = LR * r + LG * g + LB * b;
  return [r - y, g - y, b - y];
}

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
  let cur = source, cw = sw, ch = sh;
  while (cw / 2 >= w * 1.0001 && ch / 2 >= h * 1.0001 && cw > 2 && ch > 2) {
    const nw = Math.max(w, Math.floor(cw / 2)), nh = Math.max(h, Math.floor(ch / 2));
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

/* ------------------------------------------------------------------------ */
/* 1. Normalisation                                                          */
/* ------------------------------------------------------------------------ */

function analyse(data, n) {
  const step = Math.max(1, Math.floor(n / 280000));
  // Grey-world means, weighted toward low-saturation pixels (better illuminant estimate)
  let sr = 0, sg = 0, sb = 0, sw = 0;
  for (let p = 0; p < n; p += step) {
    const i = p << 2;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (mx < 8 || mx > 251) continue; // ignore crushed blacks and clipped highlights
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const wgt = neutralWeight((mx - mn) / mx);
    sr += r * wgt; sg += g * wgt; sb += b * wgt; sw += wgt;
  }
  let mr = 128, mg = 128, mb = 128;
  if (sw > 0) { mr = sr / sw; mg = sg / sw; mb = sb / sw; }
  const lumMean = LR * mr + LG * mg + LB * mb;
  const gain = (m, max) => {
    if (m < 1) return 1;
    const target = m + LOOK.wbAmount * (lumMean - m);
    const g = target / m;
    return g < LOOK.wbMin ? LOOK.wbMin : g > max ? max : g;
  };
  // green is only ever boosted a little (a purple wall is not a magenta cast)
  const gains = [gain(mr, LOOK.wbMax), gain(mg, LOOK.wbMaxGreen), gain(mb, LOOK.wbMax)];
  // keep overall exposure: normalise gains so mean luminance is unchanged
  const lumAfter = LR * mr * gains[0] + LG * mg * gains[1] + LB * mb * gains[2];
  if (lumAfter > 0) {
    const k = lumMean / lumAfter;
    for (let c = 0; c < 3; c++) gains[c] *= k;
  }

  // Luminance histogram after white balance
  const hist = new Uint32Array(256);
  let total = 0;
  for (let p = 0; p < n; p += step) {
    const i = p << 2;
    let y = LR * data[i] * gains[0] + LG * data[i + 1] * gains[1] + LB * data[i + 2] * gains[2];
    if (y > 255) y = 255;
    hist[y | 0]++;
    total++;
  }
  const pct = (q) => {
    const target = q * total;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  let bp = Math.min(pct(LOOK.levelsLow), LOOK.maxBlackPoint);
  let wp = Math.max(pct(LOOK.levelsHigh) + 1, LOOK.minWhitePoint);
  if (wp - bp < 64) { bp = Math.max(0, wp - 64); }
  return { gains, bp, wp };
}

/**
 * Illuminant-estimate weight by HSV saturation: near-neutral pixels (walls, whites, skin
 * in soft light) tell us about the light; strongly coloured objects (a purple wall, a blue
 * sky, a red dress) mostly don't, so they fade out quickly.
 */
function neutralWeight(s) {
  if (s < 0.12) return 1;
  if (s > 0.55) return 0.006;
  const t = (0.55 - s) / 0.43;
  return t * t * t + 0.006;
}

/** Weighted mean colour (low-saturation, unclipped pixels count most) of LUT-mapped samples. */
function weightedMean(data, n, step, L0, L1, L2) {
  let sr = 0, sg = 0, sb = 0, sw = 0;
  for (let p = 0; p < n; p += step) {
    const i = p << 2;
    const r = L0[data[i]], g = L1[data[i + 1]], b = L2[data[i + 2]];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (mx < 0.03 || mx > 0.985) continue;
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    let lw = (mx - 0.06) / 0.3; lw = lw < 0 ? 0 : lw > 1 ? 1 : lw; // dark pixels are noisy
    const wgt = neutralWeight((mx - mn) / mx) * (0.15 + 0.85 * lw);
    sr += r * wgt; sg += g * wgt; sb += b * wgt; sw += wgt;
  }
  return sw > 0 ? [sr / sw, sg / sw, sb / sw] : null;
}

/**
 * Per-channel LUTs:
 *   norm  – raw byte → normalised 0..1 (white balance, levels, gentle exposure)
 *   toned – raw byte → palette-matched, tone-curved, faded 0..1
 */
function buildLuts(data, n, { gains, bp, wp }) {
  const step = Math.max(1, Math.floor(n / 120000));
  const norm = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  const toned = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  const range = wp - bp;
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      let x = v * gains[c];
      if (x > 255) x = 255;
      let lv = ((x - bp) / range) * 255;
      lv = lv < 0 ? 0 : lv > 255 ? 255 : lv;
      norm[c][v] = clamp01((x + LOOK.levelsAmount * (lv - x)) / 255);
    }
  }

  // gentle auto-exposure: move the median luminance part of the way to the target
  const hist = new Uint32Array(256);
  let total = 0;
  for (let p = 0; p < n; p += step) {
    const i = p << 2;
    const y = LR * norm[0][data[i]] + LG * norm[1][data[i + 1]] + LB * norm[2][data[i + 2]];
    hist[(y * 255) | 0]++;
    total++;
  }
  let acc = 0, med = 128;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total / 2) { med = v; break; } }
  const median = Math.min(0.95, Math.max(0.03, (med + 0.5) / 255));
  let gamma = Math.log(LOOK.exposureTarget) / Math.log(median);
  gamma = 1 + LOOK.exposureAmount * (gamma - 1);
  gamma = gamma < LOOK.gammaMin ? LOOK.gammaMin : gamma > LOOK.gammaMax ? LOOK.gammaMax : gamma;
  if (Math.abs(gamma - 1) > 0.005) {
    for (let c = 0; c < 3; c++) for (let v = 0; v < 256; v++) norm[c][v] = Math.pow(norm[c][v], gamma);
  }

  // palette match: pull the average colour toward one warm golden-hour white
  const pg = [1, 1, 1];
  const mean = weightedMean(data, n, step, norm[0], norm[1], norm[2]);
  if (mean) {
    const y = LR * mean[0] + LG * mean[1] + LB * mean[2];
    const lr = Math.log(Math.max(1e-4, mean[0])), lg = Math.log(Math.max(1e-4, mean[1])), lb = Math.log(Math.max(1e-4, mean[2]));
    const [tr, tg, tb] = LOOK.paletteTarget.map(Math.log);
    // opponent axes in log space: warmth = ln r − ln b, tint = ln g − (ln r + ln b)/2
    const wNeed = (tr - tb) - (lr - lb);
    const tNeed = (tg - (tr + tb) / 2) - (lg - (lr + lb) / 2);
    const dW = wNeed * (wNeed > 0 ? LOOK.paletteWarmUp : LOOK.paletteCoolDown);
    const dT = tNeed * (tNeed > 0 ? LOOK.paletteDemagenta : LOOK.paletteDegreen);
    const lgain = [dW / 2 - dT / 3, (2 * dT) / 3, -dW / 2 - dT / 3];
    for (let c = 0; c < 3; c++) {
      const g = Math.exp(lgain[c]);
      pg[c] = g < LOOK.paletteMin[c] ? LOOK.paletteMin[c] : g > LOOK.paletteMax[c] ? LOOK.paletteMax[c] : g;
    }
    const yAfter = LR * mean[0] * pg[0] + LG * mean[1] * pg[1] + LB * mean[2] * pg[2];
    if (yAfter > 0) { const k = y / yAfter; pg[0] *= k; pg[1] *= k; pg[2] *= k; }
  }

  skinAnchor(data, n, step, norm, pg);

  for (let c = 0; c < 3; c++) {
    const fade = LOOK.fade[c];
    for (let v = 0; v < 256; v++) {
      toned[c][v] = fade + tone(norm[c][v] * pg[c]) * (1 - fade);
    }
  }
  return { norm, toned };
}

/**
 * Skin anchor: faces matter most. Measure the average skin hue the palette gains would
 * produce; if it drifts toward yellow (> skinHueMax), relax the gains, and if the photo's
 * skin is yellow to begin with (tungsten, low-light), nudge it gently rosy. Mutates `pg`.
 */
function skinAnchor(data, n, step, norm, pg) {
  const measure = (gr, gg, gb) => {
    let sr = 0, sg = 0, sb = 0, sw = 0, cnt = 0;
    for (let p = 0; p < n; p += step) {
      const i = p << 2;
      const r = tone(norm[0][data[i]] * gr), g = tone(norm[1][data[i + 1]] * gg), b = tone(norm[2][data[i + 2]] * gb);
      cnt++;
      if (!(r > g && g >= b)) continue;
      const c = r - b;
      if (c < 0.04 || r < 0.22 || r > 0.98) continue;
      const hf = (g - b) / c, sat = c / r;
      if (hf > 0.92 || sat < 0.12 || sat > 0.68) continue;
      const w = 1 - Math.abs(sat - 0.35) / 0.4;
      sr += r * w; sg += g * w; sb += b * w; sw += w;
    }
    if (sw < cnt * 0.02 * 0.5) return null; // not enough skin to judge
    const r = sr / sw, g = sg / sw, b = sb / sw;
    return (60 * (g - b)) / Math.max(1e-4, r - b);
  };
  const max = LOOK.skinHueMax;
  let hue = measure(pg[0], pg[1], pg[2]);
  if (hue === null || hue <= max) return;
  // relax the palette gains step by step
  const base = pg.slice();
  for (const t of [0.75, 0.5, 0.25, 0]) {
    const g = base.map((v) => Math.pow(v, t));
    hue = measure(g[0], g[1], g[2]);
    pg[0] = g[0]; pg[1] = g[1]; pg[2] = g[2];
    if (hue === null || hue <= max) return;
  }
  // still yellow: a gentle rosy shift (less green, a touch more blue)
  const over = Math.min(1, (hue - max) / 12);
  pg[1] *= 1 - 0.07 * over;
  pg[2] *= 1 + 0.06 * over;
}

/* ------------------------------------------------------------------------ */
/* 2. Tone curve                                                             */
/* ------------------------------------------------------------------------ */

function tone(x) {
  // soft S: blend toward smoothstep (mid slope ≈ 1.13, gentle toe & shoulder)
  let y = x >= 1 ? x : x + LOOK.sCurve * (x * x * (3 - 2 * x) - x);
  // filmic highlight roll-off (C1-continuous exponential shoulder)
  const s0 = LOOK.shoulderStart;
  if (y > s0) {
    const k = LOOK.shoulderK;
    y = s0 + (1 - Math.exp(-k * (y - s0))) / k;
  }
  return y;
}

/* ------------------------------------------------------------------------ */
/* 5. Glow helpers                                                           */
/* ------------------------------------------------------------------------ */

function boxBlur(src, tmp, gw, gh, ch, r) {
  // separable box blur, in place on `src` (Float32Array, ch interleaved channels)
  const win = 2 * r + 1;
  // horizontal
  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    for (let c = 0; c < ch; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const xx = k < 0 ? 0 : k >= gw ? gw - 1 : k;
        acc += src[(row + xx) * ch + c];
      }
      for (let x = 0; x < gw; x++) {
        tmp[(row + x) * ch + c] = acc / win;
        const xo = x - r < 0 ? 0 : x - r;
        const xi = x + r + 1 >= gw ? gw - 1 : x + r + 1;
        acc += src[(row + xi) * ch + c] - src[(row + xo) * ch + c];
      }
    }
  }
  // vertical
  for (let x = 0; x < gw; x++) {
    for (let c = 0; c < ch; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const yy = k < 0 ? 0 : k >= gh ? gh - 1 : k;
        acc += tmp[(yy * gw + x) * ch + c];
      }
      for (let y = 0; y < gh; y++) {
        src[(y * gw + x) * ch + c] = acc / win;
        const yo = y - r < 0 ? 0 : y - r;
        const yi = y + r + 1 >= gh ? gh - 1 : y + r + 1;
        acc += tmp[(yi * gw + x) * ch + c] - tmp[(yo * gw + x) * ch + c];
      }
    }
  }
}

/* ------------------------------------------------------------------------ */
/* The grade                                                                 */
/* ------------------------------------------------------------------------ */

function gradePixels(data, w, h, strength) {
  const n = w * h;
  const stats = analyse(data, n);
  const { norm, toned } = buildLuts(data, n, stats);
  const [NR, NG, NB] = norm;
  const [TR, TG, TB] = toned;

  const SH = chromaOffset(LOOK.shadowTint.map((v) => v / 255));
  const HI = chromaOffset(LOOK.highlightTint.map((v) => v / 255));
  const MW = chromaOffset(LOOK.midWarm);
  const shA = LOOK.shadowAmount, hiA = LOOK.highlightAmount, miA = LOOK.midAmount;
  const skinProtect = LOOK.skinProtect;
  const satBase = 1 + LOOK.saturation, vib = LOOK.vibrance, pinkKeep = LOOK.pinkKeep;
  const skinSat = LOOK.skinSat, skinSatW = LOOK.skinSatWeight;
  const gT = LOOK.glowThreshold, gInv = 1 / (1 - LOOK.glowThreshold);
  const clipDesat = LOOK.clipDesat, highNeutral = LOOK.highlightNeutralise;

  // low-res glow accumulation grid
  const cell = Math.max(1, Math.ceil(Math.max(w, h) / LOOK.glowGrid));
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const glow = new Float32Array(gw * gh * 4); // r, g, b, weight-count
  const graded = new Uint8ClampedArray(n * 4);

  // ---- pass 1: normalise → tone → split-tone → colour (pre-glow) ----
  for (let y = 0; y < h; y++) {
    const gy = (y / cell) | 0;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p << 2;
      const d0 = data[i], d1 = data[i + 1], d2 = data[i + 2];
      let r = TR[d0], g = TG[d1], b = TB[d2];
      const L = LR * r + LG * g + LB * b;
      // near-clipped highlights (2+ channels blown, e.g. a window): their colour is
      // unreliable after gains → neutralise (the gold highlight tint then warms them)
      const dmid = d0 > d1 ? (d1 > d2 ? d1 : d0 > d2 ? d2 : d0) : (d0 > d2 ? d0 : d1 > d2 ? d2 : d1);
      let hk = 0;
      if (dmid > 228) {
        let q = (dmid - 228) / 25; q = q > 1 ? 1 : q;
        hk = q * q * (3 - 2 * q) * clipDesat;
      }
      if (L > 0.8) {
        // all bright highlights converge to the same cream before the gold tint
        let q = (L - 0.8) / 0.17; q = q > 1 ? 1 : q;
        const k2 = q * q * (3 - 2 * q) * highNeutral;
        if (k2 > hk) hk = k2;
      }
      if (hk > 0) { r += (L - r) * hk; g += (L - g) * hk; b += (L - b) * hk; }

      // skin likelihood: hue ≈ 5°–45°, moderate saturation, not too dark
      let sk = 0;
      if (r > g && g >= b) {
        const c = r - b;
        if (c > 0.025) {
          const hf = (g - b) / c; // hue / 60°
          const sat = c / r;
          const hueW = hf < 0.02 ? 0 : hf < 0.1 ? (hf - 0.02) / 0.08 : hf < 0.68 ? 1 : hf < 0.85 ? (0.85 - hf) / 0.17 : 0;
          const satW = sat < 0.07 ? 0 : sat < 0.16 ? (sat - 0.07) / 0.09 : sat < 0.55 ? 1 : sat < 0.78 ? (0.78 - sat) / 0.23 : 0;
          const lumW = L < 0.1 ? 0 : L < 0.24 ? (L - 0.1) / 0.14 : 1;
          sk = hueW * satW * lumW;
        }
      }

      // split-tone weights by luminance
      let t = L / 0.62; t = t > 1 ? 1 : t;
      const ws = (1 - t * t * (3 - 2 * t)) * shA;
      let u = (L - 0.45) / 0.55; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const wh = u * u * (3 - 2 * u) * hiA;
      let m = 1 - Math.abs(L - 0.45) / 0.38; m = m < 0 ? 0 : m;
      const wm = m * miA;
      const prot = 1 - skinProtect * sk;
      r += (ws * SH[0] + wh * HI[0] + wm * MW[0]) * prot;
      g += (ws * SH[1] + wh * HI[1] + wm * MW[1]) * prot;
      b += (ws * SH[2] + wh * HI[2] + wm * MW[2]) * prot;

      // saturation & vibrance (around luminance, which the split-tone preserved)
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const s = mx > 0.0001 ? (mx - mn) / mx : 0;
      let f = satBase * (1 + vib * (1 - (s > 1 ? 1 : s)));
      if (f < 1 && g <= r && g <= b && mx - mn > 0.02) {
        // pinks & magentas: green is the minimum
        let pw;
        if (r >= b) { let q = ((b - g) / (r - g) - 0.08) / 0.32; q = q < 0 ? 0 : q > 1 ? 1 : q; pw = q * q * (3 - 2 * q); }
        else { let q = ((r - g) / (b - g) - 0.45) / 0.5; q = q < 0 ? 0 : q > 1 ? 1 : q; pw = q * q * (3 - 2 * q); }
        f += (1 - f) * pinkKeep * pw;
      }
      if (sk > 0) f += (skinSat - f) * sk * skinSatW;
      r = L + (r - L) * f;
      g = L + (g - L) * f;
      b = L + (b - L) * f;

      graded[i] = r * 255;
      graded[i + 1] = g * 255;
      graded[i + 2] = b * 255;

      // highlight extraction for the glow
      if (L > gT) {
        const v = (L - gT) * gInv;
        const gi = (gy * gw + ((x / cell) | 0)) << 2;
        glow[gi] += r * v;
        glow[gi + 1] += g * v;
        glow[gi + 2] += b * v;
      }
    }
  }

  // ---- glow: average, tint, blur ----
  const cellArea = cell * cell;
  const tint = LOOK.glowTint;
  const g3 = new Float32Array(gw * gh * 3);
  for (let k = 0, q = 0; k < glow.length; k += 4, q += 3) {
    const cr = glow[k] / cellArea, cg = glow[k + 1] / cellArea, cb = glow[k + 2] / cellArea;
    const lum = LR * cr + LG * cg + LB * cb;
    g3[q] = (0.45 * cr + 0.55 * tint[0] * lum) * 1.5;
    g3[q + 1] = (0.45 * cg + 0.55 * tint[1] * lum) * 1.5;
    g3[q + 2] = (0.45 * cb + 0.55 * tint[2] * lum) * 1.5;
  }
  const tmp = new Float32Array(g3.length);
  const rad = Math.max(1, Math.min(LOOK.glowRadius, Math.floor(Math.min(gw, gh) / 4)));
  for (let pass = 0; pass < 3; pass++) boxBlur(g3, tmp, gw, gh, 3, rad);

  // ---- pass 2: glow (screen) + strength blend ----
  const gA = LOOK.glowAmount;
  const hueH0 = LOOK.skinHueGuard[0] / 60, hueH1 = LOOK.skinHueGuard[1] / 60, hueH2 = LOOK.skinHueGuard[2] / 60;
  const hueKeep = LOOK.skinHueGuardKeep;
  const nAmt = Math.min(1, strength * 2); // normalisation fades in quickly
  const sAmt = strength;
  // precomputed bilinear columns
  const cx0 = new Int32Array(w), cx1 = new Int32Array(w), cwx = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let fx = (x + 0.5) / cell - 0.5;
    if (fx < 0) fx = 0;
    let x0 = fx | 0;
    if (x0 > gw - 1) x0 = gw - 1;
    cx0[x] = x0 * 3;
    cx1[x] = (x0 + 1 < gw ? x0 + 1 : gw - 1) * 3;
    cwx[x] = fx - x0 > 1 ? 1 : fx - x0;
  }
  const inv = new Float32Array(256);
  for (let v = 0; v < 256; v++) inv[v] = v / 255;
  for (let y = 0; y < h; y++) {
    let fy = (y + 0.5) / cell - 0.5;
    if (fy < 0) fy = 0;
    let y0 = fy | 0;
    if (y0 > gh - 1) y0 = gh - 1;
    const y1 = y0 + 1 < gh ? y0 + 1 : gh - 1;
    const wy = fy - y0 > 1 ? 1 : fy - y0;
    const row0 = y0 * gw * 3, row1 = y1 * gw * 3;
    for (let x = 0; x < w; x++) {
      const wx = cwx[x];
      const a = row0 + cx0[x], bq = row0 + cx1[x], c = row1 + cx0[x], d = row1 + cx1[x];
      const w00 = (1 - wx) * (1 - wy), w10 = wx * (1 - wy), w01 = (1 - wx) * wy, w11 = wx * wy;
      const gr = g3[a] * w00 + g3[bq] * w10 + g3[c] * w01 + g3[d] * w11;
      const gg = g3[a + 1] * w00 + g3[bq + 1] * w10 + g3[c + 1] * w01 + g3[d + 1] * w11;
      const gb = g3[a + 2] * w00 + g3[bq + 2] * w10 + g3[c + 2] * w01 + g3[d + 2] * w11;

      const i = (y * w + x) << 2;
      let r = inv[graded[i]], g = inv[graded[i + 1]], b = inv[graded[i + 2]];
      // screen blend at glowAmount: o + a·glow·(1−o)
      r += gA * (gr > 1 ? 1 : gr) * (1 - r);
      g += gA * (gg > 1 ? 1 : gg) * (1 - g);
      b += gA * (gb > 1 ? 1 : gb) * (1 - b);

      // skin-hue guard: skin drifting toward yellow (≈30°–50°) is eased back to peach,
      // keeping luminance; saturated yellows (flowers, lights) are left alone
      if (r > g && g > b) {
        const c = r - b;
        const hf = (g - b) / c;
        if (hf > hueH0 && hf < hueH2 && c > 0.04) {
          const sat = c / r;
          const sw = sat < 0.1 ? 0 : sat < 0.18 ? (sat - 0.1) / 0.08 : sat < 0.62 ? 1 : sat < 0.78 ? (0.78 - sat) / 0.16 : 0;
          if (sw > 0) {
            const hw = hf < hueH1 ? 1 : (hueH2 - hf) / (hueH2 - hueH1);
            const target = hueH0 + (hf - hueH0) * hueKeep;
            const g2 = b + c * (hf + (target - hf) * hw * sw);
            const y0 = LR * r + LG * g + LB * b;
            const y1 = y0 + LG * (g2 - g);
            const k = y1 > 1e-4 ? y0 / y1 : 1;
            r *= k; g = g2 * k; b *= k;
          }
        }
      }

      const d0 = data[i], d1 = data[i + 1], d2 = data[i + 2];
      const or = inv[d0], og = inv[d1], ob = inv[d2];
      const br = or + nAmt * (NR[d0] - or);
      const bg = og + nAmt * (NG[d1] - og);
      const bb = ob + nAmt * (NB[d2] - ob);
      data[i] = (br + sAmt * (r - br)) * 255 + 0.5;
      data[i + 1] = (bg + sAmt * (g - bg)) * 255 + 0.5;
      data[i + 2] = (bb + sAmt * (b - bb)) * 255 + 0.5;
      data[i + 3] = 255;
    }
  }
}

/**
 * Grade an image into the site's palette.
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} source
 * @param {{strength?: number, maxSide?: number}} [opts]  strength 0 = untouched, 1 = full look
 * @returns {Promise<HTMLCanvasElement>} a new canvas (≤ maxSide on its long side, same aspect)
 */
export async function gradeImage(source, { strength = 0.85, maxSide = 2000 } = {}) {
  const { width: sw, height: sh } = sourceSize(source);
  if (!sw || !sh) throw new Error('gradeImage: the image has no size (not loaded yet?)');
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = drawScaled(source, sw, sh, w, h);
  const s = clamp01(Number.isFinite(+strength) ? +strength : 0.85);
  if (s <= 0.001) return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  gradePixels(img.data, w, h, s);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Encode a canvas as JPEG.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {number} [quality=0.88]
 * @returns {Promise<Blob>}
 */
export function canvasToJpegBlob(canvas, quality = 0.88) {
  if (typeof canvas.convertToBlob === 'function' && typeof canvas.toBlob !== 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the image (the photo may be too large for this device).'));
      }, 'image/jpeg', quality);
    } catch (err) {
      reject(err);
    }
  });
}
