// The golden ribbon — the film's signature motif.
//
// A silk ribbon made of warm golden light, inspired by very long flowing hair:
// 3–7 soft strands twist around each other along a smooth centripetal
// Catmull-Rom spline (resampled by arc length). Light is layered additively
// ('lighter'): a wide, very faint halo (soft sprite stamps) + a medium veil +
// a bright core per strand. Front strands are brighter and wider, back strands
// dimmer and thinner, so the crossings read like silk with depth. Colour runs
// warm cream-white at the head → gold → amber, fading out at the tail.
// Secondary motion (twist drift, breathing) uses incommensurate frequencies so
// it never loops visibly. Reshaping uses critically-damped springs per sample,
// head-first, so the ribbon carries believable momentum.
//
// One <canvas> per ribbon; the rAF loop sleeps whenever nothing animates.
// See docs/ARCHITECTURE.md §3 for the contract.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const now = () => performance.now();

/* ------------------------------------------------------------------ easing */
const BUILTIN_EASES = {
  linear: (t) => t,
  none: (t) => t,
  'sine.in': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'sine.out': (t) => Math.sin((t * Math.PI) / 2),
  'sine.inOut': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'expo.out': (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  'expo.in': (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
};

/** Resolve an ease name (GSAP names incl. registered CustomEases) or function. */
export function easeFn(ease) {
  if (typeof ease === 'function') return ease;
  const name = String(ease || 'power2.inOut');
  const g = typeof window !== 'undefined' ? window.gsap : null;
  if (g && g.parseEase) {
    try {
      const f = g.parseEase(name);
      if (typeof f === 'function') return f;
    } catch { /* fall through */ }
  }
  if (BUILTIN_EASES[name]) return BUILTIN_EASES[name];
  const m = /^power(\d)\.(in|out|inOut)$/.exec(name);
  if (m) {
    const p = Number(m[1]) + 1;
    if (m[2] === 'in') return (t) => t ** p;
    if (m[2] === 'out') return (t) => 1 - (1 - t) ** p;
    return (t) => (t < 0.5 ? (2 * t) ** p / 2 : 1 - (2 - 2 * t) ** p / 2);
  }
  return BUILTIN_EASES['sine.inOut'];
}

/* ------------------------------------------------------------------ splines */
function cleanPoints(points) {
  const out = [];
  if (!points) return out;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) continue;
    out.push({ x: p.x, y: p.y });
  }
  if (out.length === 1) out.push({ x: out[0].x + 0.5, y: out[0].y });
  return out;
}

/** Dense polyline through `pts` using a centripetal Catmull-Rom spline. */
function catmullDense(pts) {
  const xs = [];
  const ys = [];
  const n = pts.length;
  if (n < 2) return { xs, ys };
  if (n === 2) {
    const m = Math.max(2, Math.ceil(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 6));
    for (let k = 0; k <= m; k++) {
      xs.push(lerp(pts[0].x, pts[1].x, k / m));
      ys.push(lerp(pts[0].y, pts[1].y, k / m));
    }
    return { xs, ys };
  }
  const knot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p0 = i > 0 ? pts[i - 1] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = i + 2 < n ? pts[i + 2] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const m = clamp(Math.ceil(seg / 5), 3, 48);
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const a1x = ((t1 - t) / (t1 - t0)) * p0.x + ((t - t0) / (t1 - t0)) * p1.x;
      const a1y = ((t1 - t) / (t1 - t0)) * p0.y + ((t - t0) / (t1 - t0)) * p1.y;
      const a2x = ((t2 - t) / (t2 - t1)) * p1.x + ((t - t1) / (t2 - t1)) * p2.x;
      const a2y = ((t2 - t) / (t2 - t1)) * p1.y + ((t - t1) / (t2 - t1)) * p2.y;
      const a3x = ((t3 - t) / (t3 - t2)) * p2.x + ((t - t2) / (t3 - t2)) * p3.x;
      const a3y = ((t3 - t) / (t3 - t2)) * p2.y + ((t - t2) / (t3 - t2)) * p3.y;
      const b1x = ((t2 - t) / (t2 - t0)) * a1x + ((t - t0) / (t2 - t0)) * a2x;
      const b1y = ((t2 - t) / (t2 - t0)) * a1y + ((t - t0) / (t2 - t0)) * a2y;
      const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x;
      const b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;
      xs.push(((t2 - t) / (t2 - t1)) * b1x + ((t - t1) / (t2 - t1)) * b2x);
      ys.push(((t2 - t) / (t2 - t1)) * b1y + ((t - t1) / (t2 - t1)) * b2y);
    }
  }
  xs.push(pts[n - 1].x);
  ys.push(pts[n - 1].y);
  return { xs, ys };
}

/** Sample `points` (control points) into `n` points equally spaced by arc length. Returns total length. */
function sampleInto(points, n, outX, outY) {
  const pts = cleanPoints(points);
  if (pts.length < 2) return -1;
  const { xs, ys } = catmullDense(pts);
  const m = xs.length;
  const cum = new Float32Array(m);
  for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  const L = cum[m - 1];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (L * k) / (n - 1);
    while (j < m - 2 && cum[j + 1] < d) j++;
    const span = cum[j + 1] - cum[j] || 1;
    const t = clamp((d - cum[j]) / span, 0, 1);
    outX[k] = lerp(xs[j], xs[j + 1], t);
    outY[k] = lerp(ys[j], ys[j + 1], t);
  }
  return L;
}

/** Public helper: arc-length resampled points [{x,y}] along the spline through `points`. */
export function sampleSpline(points, n = 100) {
  n = Math.max(2, Math.round(n));
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  if (sampleInto(points, n, xs, ys) < 0) return [];
  return Array.from({ length: n }, (_, i) => ({ x: xs[i], y: ys[i] }));
}

/* ------------------------------------------------------------------ colour */
function hexRgb(h) {
  let s = String(h || '#ffd98a').trim().replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [255, 217, 138];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Colour along the visible length: u=0 tail (amber) → u=1 head (warm cream-white). */
function buildRamp(colorHex, n = 48) {
  const c = hexRgb(colorHex);
  const stops = [
    [0.0, mixRgb([255, 146, 60], c, 0.12)],
    [0.3, mixRgb([255, 179, 71], c, 0.22)], // #ffb347
    [0.62, mixRgb([244, 196, 99], c, 0.4)], // #f4c463
    [0.86, mixRgb([255, 227, 163], c, 0.25)], // #ffe3a3
    [1.0, [255, 248, 232]],
  ];
  const rgb = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let k = 0;
    while (k < stops.length - 2 && u > stops[k + 1][0]) k++;
    const [u0, c0] = stops[k];
    const [u1, c1] = stops[k + 1];
    const col = mixRgb(c0, c1, smooth(0, 1, (u - u0) / (u1 - u0)));
    rgb.push(col.map((v) => Math.round(v)));
  }
  return { rgb, str: rgb.map(([r, g, b]) => `rgb(${r},${g},${b})`) };
}

function radialSprite(size, rgb, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [o, a, white] of stops) {
    const col = white ? mixRgb(rgb, [255, 255, 255], white) : rgb;
    gr.addColorStop(o, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`);
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

// deterministic per-ribbon randomness (so strands keep their personality)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

let ribbonSeed = 7;

/* ================================================================== ribbon */
/**
 * createRibbon(container, opts) — see docs/ARCHITECTURE.md §3.
 * opts: strands (3–7, default 5), width (core px, 2.2), glow (halo strength, 1),
 * color (base tint, '#ffd98a'), particles (shed sparks, true), zIndex, device,
 * plus extras: samples (300 / 180 on low), living (idle secondary motion, true),
 * tail (fraction of the visible length that fades, .26), spread (strand spacing, 1),
 * twist (twist density, 1), blend (CSS mix-blend-mode for the canvas), rescale
 * (scale points with the container on resize, true), onResize(w, h, ribbon).
 */
export function createRibbon(container, opts = {}) {
  const device = opts.device || {};
  const low = device.tier === 'low' || !!device.lowPower;
  const reduced = !!device.reducedMotion;
  const S = clamp(Math.round(opts.strands ?? 5), 1, 7);
  const N = clamp(Math.round(opts.samples || (low ? 180 : 300)), 24, 800);
  const dprCap = low ? 1.25 : 2;
  const living = opts.living !== false && !reduced;
  const wantParticles = opts.particles !== false;
  const rescale = opts.rescale !== false;
  const rand = rng(ribbonSeed++ * 7919 + 17);

  /* ---- canvas ---- */
  const canvas = document.createElement('canvas');
  canvas.className = 'ribbon-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
    pointerEvents: 'none', display: 'block',
  });
  if (opts.zIndex != null) canvas.style.zIndex = String(opts.zIndex);
  if (opts.blend) canvas.style.mixBlendMode = opts.blend;
  try {
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  } catch { /* detached container */ }
  container.appendChild(canvas);
  const g = canvas.getContext('2d');

  /* ---- palette & sprites ---- */
  const ramp = buildRamp(opts.color);
  const LUTN = ramp.str.length;
  const lutIndex = (u) => clamp(Math.round(u * (LUTN - 1)), 0, LUTN - 1);
  const GLOWN = 8;
  const glowSprites = Array.from({ length: GLOWN }, (_, i) =>
    radialSprite(64, ramp.rgb[Math.round((i / (GLOWN - 1)) * (LUTN - 1))], [
      [0, 0.85, 0.15], [0.22, 0.42], [0.5, 0.12], [0.75, 0.03], [1, 0],
    ]));
  const headSprite = radialSprite(96, [255, 236, 190], [[0, 1, 1], [0.08, 0.95, 0.7], [0.25, 0.4, 0.2], [0.55, 0.1], [1, 0]]);
  const dotSprites = [0.1, 0.45, 0.8, 1].map((u) => radialSprite(32, ramp.rgb[lutIndex(u)], [[0, 1, 0.6], [0.25, 0.55, 0.2], [0.6, 0.1], [1, 0]]));

  /* ---- path state (sample 0 = tail end of the path, N-1 = head end) ---- */
  const px = new Float32Array(N); // current (rendered) positions
  const py = new Float32Array(N);
  const qx = new Float32Array(N); // targets
  const qy = new Float32Array(N);
  const vx = new Float32Array(N); // spring velocities
  const vy = new Float32Array(N);
  const fx0 = new Float32Array(N); // morph start
  const fy0 = new Float32Array(N);
  const tx1 = new Float32Array(N); // morph end
  const ty1 = new Float32Array(N);
  const cum = new Float32Array(N); // arc length
  const nx = new Float32Array(N); // centre-line normals
  const ny = new Float32Array(N);
  let hasPath = false;
  let springing = false;
  let omega = 10;

  // render scratch (visible portion, up to N + 2 samples)
  const R = N + 2;
  const rx = new Float32Array(R);
  const ry = new Float32Array(R);
  const rnx = new Float32Array(R);
  const rny = new Float32Array(R);
  const rs = new Float32Array(R);
  const ru = new Float32Array(R);
  const rfade = new Float32Array(R);
  const ramp2 = new Float32Array(R);
  const rtaper = new Float32Array(R);
  const rhw = new Float32Array(R);
  const rhw2 = new Float32Array(R);
  const ral = new Float32Array(R);
  const SX = Array.from({ length: S }, () => new Float32Array(R));
  const SY = Array.from({ length: S }, () => new Float32Array(R));
  const SZ = Array.from({ length: S }, () => new Float32Array(R));
  let M = 0;
  let visLen = 0;

  // per-strand personality
  const strands = Array.from({ length: S }, (_, j) => ({
    ph: (j / S) * TAU + (rand() - 0.5) * 0.5,
    ph2: rand() * TAU,
    amp: 0.72 + rand() * 0.42,
    fk: 0.86 + rand() * 0.3,
    sk: 0.8 + rand() * 0.45,
    sec: 0.007 + rand() * 0.006,
    secSp: 0.28 + rand() * 0.3,
    bright: 0.85 + rand() * 0.25,
    wk: 0.75 + rand() * 0.5,
    irr: 0.6 + rand() * 0.8,
  }));
  strands.sort((a, b) => b.bright - a.bright); // strand 0 = the "lead" strand

  /* ---- look & animation state ---- */
  const st = {
    head: 0, start: 0, trail: null,
    alpha: 1,
    width: Math.max(0.3, Number(opts.width ?? 2.2)),
    glow: Math.max(0, Number(opts.glow ?? 1)),
    spread: Number(opts.spread ?? 1),
    twist: Number(opts.twist ?? 1),
    split: 1,
    tail: clamp(Number(opts.tail ?? 0.26), 0.02, 1),
    // how line widths respond to view.scale: 1 = physically (default), < 1 = filaments stay fine under zoom
    zoomWidth: Number(opts.zoomWidth ?? 1),
    zoomGlow: Number(opts.zoomGlow ?? 1),
    flow: false, flowAmt: 0,
    dissolve: -1,
  };
  const view = { x: 0, y: 0, ax: null, ay: null, scale: 1, rotate: 0 };
  const band = { p: -1, dur: 1.9, wait: 0.4 };
  const parts = [];
  const dust = [];
  const maxParts = low ? 26 : 60;
  let phase = rand() * 50; // secondary-motion clock (only runs while "living")
  let clock = 0;
  let headSpeed = 0;
  let lastHead = null;
  let followFn = null;
  let morph = null;

  /* ---- size ---- */
  let cw = 0;
  let ch = 0;
  let dpr = 1;
  function measure() {
    if (destroyed) return;
    const w = container.clientWidth || container.getBoundingClientRect().width || window.innerWidth;
    const h = container.clientHeight || container.getBoundingClientRect().height || window.innerHeight;
    const d = Math.min(window.devicePixelRatio || 1, dprCap);
    if (w === cw && h === ch && d === dpr) return;
    const ow = cw;
    const oh = ch;
    cw = w;
    ch = h;
    dpr = d;
    canvas.width = Math.max(1, Math.round(w * d));
    canvas.height = Math.max(1, Math.round(h * d));
    if (ow > 0 && oh > 0 && (ow !== w || oh !== h)) {
      if (typeof opts.onResize === 'function') {
        try { opts.onResize(w, h, api); } catch (e) { console.warn('[ribbon] onResize', e); }
      } else if (rescale && hasPath) {
        const sx = w / ow;
        const sy = h / oh;
        for (const arr of [px, qx, fx0, tx1]) for (let i = 0; i < N; i++) arr[i] *= sx;
        for (const arr of [py, qy, fy0, ty1]) for (let i = 0; i < N; i++) arr[i] *= sy;
        for (const p of parts) { p.x *= sx; p.y *= sy; }
        for (const p of dust) { p.x *= sx; p.y *= sy; }
        updateGeometry();
      }
    }
    wake();
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure());
    ro.observe(container);
  }
  const onWinResize = () => measure();
  window.addEventListener('resize', onWinResize);

  /* ---- geometry helpers ---- */
  function updateGeometry() {
    cum[0] = 0;
    for (let i = 1; i < N; i++) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    for (let i = 0; i < N; i++) {
      const a = i > 0 ? i - 1 : 0;
      const b = i < N - 1 ? i + 1 : N - 1;
      let dx = px[b] - px[a];
      let dy = py[b] - py[a];
      const l = Math.hypot(dx, dy);
      if (l > 1e-5) { dx /= l; dy /= l; } else if (i > 0) { nx[i] = nx[i - 1]; ny[i] = ny[i - 1]; continue; } else { dx = 1; dy = 0; }
      nx[i] = -dy;
      ny[i] = dx;
    }
  }

  function toScreen(x, y) {
    const c = Math.cos(view.rotate) * view.scale;
    const s = Math.sin(view.rotate) * view.scale;
    const ax = view.ax ?? view.x;
    const ay = view.ay ?? view.y;
    const dx = x - view.x;
    const dy = y - view.y;
    return { x: ax + c * dx - s * dy, y: ay + s * dx + c * dy };
  }

  function rawAt(f) {
    const fi = clamp(f, 0, 1) * (N - 1);
    const i = Math.min(N - 2, Math.floor(fi));
    const t = fi - i;
    return { x: lerp(px[i], px[i + 1], t), y: lerp(py[i], py[i + 1], t), i, t };
  }

  /* ---- tweens (own clock so canvas and caller stay in sync) ---- */
  const tweens = new Map();
  function tweenTo(key, dur, ease, update, onDone) {
    const prev = tweens.get(key);
    if (prev) { tweens.delete(key); prev.resolve(false); }
    if (destroyed) return Promise.resolve(false);
    if (!(dur > 0.001)) {
      update(1);
      onDone && onDone();
      wake();
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      tweens.set(key, { t0: now(), dur: dur * 1000, ease: easeFn(ease), update, resolve, onDone });
      wake();
    });
  }
  function stepTweens(t) {
    for (const [key, tw] of tweens) {
      const k = clamp((t - tw.t0) / tw.dur, 0, 1);
      tw.update(tw.ease(k), k);
      if (k >= 1) {
        tweens.delete(key);
        tw.onDone && tw.onDone();
        tw.resolve(true);
      }
    }
  }

  /* ---- springs (exact critically damped step — stable for any dt) ---- */
  function stepSprings(dt) {
    const e = Math.exp(-omega * dt);
    let maxErr = 0;
    for (let i = 0; i < N; i++) {
      const dx = px[i] - qx[i];
      const dy = py[i] - qy[i];
      const tx = (vx[i] + omega * dx) * dt;
      const ty = (vy[i] + omega * dy) * dt;
      px[i] = qx[i] + (dx + tx) * e;
      py[i] = qy[i] + (dy + ty) * e;
      vx[i] = (vx[i] - omega * tx) * e;
      vy[i] = (vy[i] - omega * ty) * e;
      const err = Math.abs(dx) + Math.abs(dy) + (Math.abs(vx[i]) + Math.abs(vy[i])) * 0.05;
      if (err > maxErr) maxErr = err;
    }
    if (maxErr < 0.15 && !followFn && !morph) {
      px.set(qx);
      py.set(qy);
      vx.fill(0);
      vy.fill(0);
      springing = false;
    }
  }

  const tmpX = new Float32Array(N);
  const tmpY = new Float32Array(N);
  function smoothTargets(amount) {
    for (let pass = 0; pass < 3; pass++) {
      tmpX.set(qx);
      tmpY.set(qy);
      for (let i = 1; i < N - 1; i++) {
        qx[i] = lerp(tmpX[i], (tmpX[i - 1] + 2 * tmpX[i] + tmpX[i + 1]) / 4, amount);
        qy[i] = lerp(tmpY[i], (tmpY[i - 1] + 2 * tmpY[i] + tmpY[i + 1]) / 4, amount);
      }
    }
  }

  /* ---- particles ---- */
  function emit(count, fromDissolve, u0 = 0, u1 = 1) {
    if (M < 2) return;
    for (let n = 0; n < count; n++) {
      let k;
      if (fromDissolve) {
        const u = lerp(u0, u1, Math.random());
        k = clamp(Math.round(u * (M - 1)), 0, M - 1);
      } else {
        k = clamp(Math.round((M - 1) * (1 - Math.pow(Math.random(), 2.4) * 0.92)), 0, M - 1);
      }
      const j = (Math.random() * S) | 0;
      const x = SX[j][k];
      const y = SY[j][k];
      const side = (Math.random() - 0.5) * 2;
      const tnx = rnx[k];
      const tny = rny[k];
      const wk = st.width / 2.2;
      if (fromDissolve) {
        const bokeh = Math.random() < 0.1;
        dust.push({
          x: x + tnx * side * 4, y: y + tny * side * 4,
          vx: tnx * side * 20 + (Math.random() - 0.5) * 26,
          vy: tny * side * 20 - 10 - Math.random() * 34,
          life: 0, max: 1 + Math.random() * 1.1,
          s: (bokeh ? 3.5 + Math.random() * 3 : 0.7 + Math.random() * 2) * Math.sqrt(wk),
          a: bokeh ? 0.28 : 1,
          img: dotSprites[Math.min(3, (ru[k] * 4) | 0)],
          seed: Math.random() * TAU,
        });
      } else {
        parts.push({
          x, y,
          vx: tnx * side * 14 + (Math.random() - 0.5) * 6,
          vy: tny * side * 14 - 6 - Math.random() * 10,
          life: 0, max: 0.9 + Math.random() * 1.5,
          s: (0.7 + Math.random() * 1.5) * Math.sqrt(wk),
          img: dotSprites[Math.min(3, (ru[k] * 4) | 0)],
          seed: Math.random() * TAU,
        });
      }
    }
  }
  function stepParticles(list, dt, drag, lift) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.max) { list.splice(i, 1); continue; }
      const d = 1 - drag * dt;
      p.vx *= d;
      p.vy = p.vy * d - lift * dt;
      p.x += (p.vx + Math.sin(clock * 1.3 + p.seed) * 5) * dt;
      p.y += p.vy * dt;
    }
  }

  /* ---- render ---- */
  function buildVisible() {
    M = 0;
    if (!hasPath) return;
    const head = clamp(st.head, 0, 1);
    const tail = st.trail != null ? Math.max(0, head - st.trail) : Math.min(clamp(st.start, 0, 1), head);
    const hi = head * (N - 1);
    const lo = tail * (N - 1);
    if (hi - lo < 0.02) return;
    const push = (f) => {
      const i = Math.min(N - 2, Math.floor(f));
      const t = f - i;
      rx[M] = lerp(px[i], px[i + 1], t);
      ry[M] = lerp(py[i], py[i + 1], t);
      let a = lerp(nx[i], nx[i + 1], t);
      let b = lerp(ny[i], ny[i + 1], t);
      const l = Math.hypot(a, b) || 1;
      rnx[M] = a / l;
      rny[M] = b / l;
      rs[M] = lerp(cum[i], cum[i + 1], t);
      M++;
    };
    push(lo);
    for (let i = Math.floor(lo) + 1; i < hi; i++) push(i);
    push(hi);
    visLen = rs[M - 1] - rs[0];
  }

  function computeStrands() {
    const Lv = Math.max(visLen, 1e-3);
    const wk = st.width / 2.2;
    const tailF = Math.min(st.tail, (200 * Math.sqrt(wk)) / Lv);
    const conv = clamp((56 * Math.sqrt(wk)) / Lv, 0.015, 0.45);
    const breathA = living ? 1 + 0.11 * Math.sin(phase * 0.83 + 1.1) + 0.06 * Math.sin(phase * 1.97) : 1;
    const baseAmp = st.width * 2.5 * st.spread * breathA * clamp(st.split, 0, 1);
    const front = st.dissolve;
    for (let k = 0; k < M; k++) {
      const u = (rs[k] - rs[0]) / Lv;
      ru[k] = u;
      let f = smooth(0, tailF, u);
      if (front >= 0) f *= smooth(front, front + 0.1, u);
      rfade[k] = f;
      // strands converge into the head and fan out toward the tail, like hair
      let amp = baseAmp * (0.14 + 0.86 * smooth(1, 1 - conv, u)) * (1 + 0.5 * (1 - u));
      if (front >= 0) { const d = (u - front - 0.06) / 0.09; amp *= 1 + 2.4 * Math.exp(-d * d); } // fray before turning to dust
      ramp2[k] = amp;
      rtaper[k] = 0.3 + 0.7 * smooth(0, 0.4, u);
    }
    const twistK = (TAU / (150 + 26 * st.width)) * st.twist;
    const tp = phase * 0.9;
    for (let j = 0; j < S; j++) {
      const sd = strands[j];
      const X = SX[j];
      const Y = SY[j];
      const Z = SZ[j];
      for (let k = 0; k < M; k++) {
        const s = rs[k];
        const th = sd.ph + s * twistK * sd.fk - tp * sd.sk + sd.irr * Math.sin(s * 0.0041 * sd.fk + sd.ph2 + phase * 0.13);
        const lat = ramp2[k] * (sd.amp * Math.sin(th) + 0.34 * Math.sin(s * sd.sec + phase * sd.secSp + sd.ph2));
        X[k] = rx[k] + rnx[k] * lat;
        Y[k] = ry[k] + rny[k] * lat;
        Z[k] = 0.5 + 0.5 * Math.cos(th);
      }
    }
  }

  /** Width factor in path units so on-screen size grows like scale^exp under the camera. */
  function zoomK(exp) {
    return exp === 1 || view.scale <= 0 ? 1 : Math.pow(view.scale, exp - 1);
  }

  function bandBoost(u) {
    if (st.flowAmt < 0.01 || band.p < -0.5) return 1;
    const d = (u - band.p) / 0.075;
    return 1 + st.flowAmt * 0.95 * Math.exp(-d * d);
  }

  let lastFill = '';
  function chunkPoly(X, Y, HW, a, b, sub, curved) {
    if (curved && sub === 1 && b - a >= 2) {
      // long on-screen segments (camera zoom): smooth the outline with midpoint quadratics
      g.beginPath();
      g.moveTo(X[a] + rnx[a] * HW[a], Y[a] + rny[a] * HW[a]);
      for (let k = a + 1; k < b; k++) {
        const x1 = X[k] + rnx[k] * HW[k];
        const y1 = Y[k] + rny[k] * HW[k];
        const x2 = X[k + 1] + rnx[k + 1] * HW[k + 1];
        const y2 = Y[k + 1] + rny[k + 1] * HW[k + 1];
        if (k === b - 1) g.quadraticCurveTo(x1, y1, x2, y2);
        else g.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      g.lineTo(X[b] - rnx[b] * HW[b], Y[b] - rny[b] * HW[b]);
      for (let k = b - 1; k > a; k--) {
        const x1 = X[k] - rnx[k] * HW[k];
        const y1 = Y[k] - rny[k] * HW[k];
        const x2 = X[k - 1] - rnx[k - 1] * HW[k - 1];
        const y2 = Y[k - 1] - rny[k - 1] * HW[k - 1];
        if (k === a + 1) g.quadraticCurveTo(x1, y1, x2, y2);
        else g.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      g.closePath();
      g.fill();
      return;
    }
    g.beginPath();
    g.moveTo(X[a] + rnx[a] * HW[a], Y[a] + rny[a] * HW[a]);
    for (let k = a + sub; k < b; k += sub) g.lineTo(X[k] + rnx[k] * HW[k], Y[k] + rny[k] * HW[k]);
    g.lineTo(X[b] + rnx[b] * HW[b], Y[b] + rny[b] * HW[b]);
    g.lineTo(X[b] - rnx[b] * HW[b], Y[b] - rny[b] * HW[b]);
    for (let k = b - ((b - a) % sub || sub); k > a; k -= sub) g.lineTo(X[k] - rnx[k] * HW[k], Y[k] - rny[k] * HW[k]);
    g.lineTo(X[a] - rnx[a] * HW[a], Y[a] - rny[a] * HW[a]);
    g.closePath();
    g.fill();
  }

  /**
   * One strand = a soft veil + a bright core, both variable-width polygons
   * (depth → width, smoothly per vertex). Chunks only split where colour or
   * alpha really changes, so the additive seams stay invisible and cheap.
   */
  function fillStrand(j, A) {
    const X = SX[j];
    const Y = SY[j];
    const Z = SZ[j];
    const sd = strands[j];
    const strandA = j === 0 ? 1 : clamp(st.split * 1.7 - (j / S) * 0.7, 0, 1);
    if (strandA <= 0.01) return;
    const breathW = living ? 1 + 0.07 * Math.sin(phase * 1.13 + j) + 0.04 * Math.sin(phase * 2.71 + 0.5 * j) : 1;
    const wBase = st.width * 0.5 * breathW * sd.wk * zoomK(st.zoomWidth);
    const base = strandA * sd.bright * A;
    const dis = st.dissolve;
    for (let k = 0; k < M; k++) {
      const z = Z[k];
      const hw = wBase * (0.36 + 0.86 * z * z) * rtaper[k];
      rhw[k] = hw;
      rhw2[k] = hw * 2.3 + 0.9 * rtaper[k];
      let al = rfade[k] * base * bandBoost(ru[k]);
      if (dis >= 0) {
        const d = (ru[k] - dis - 0.05) / 0.06;
        al *= 1 + 1.4 * Math.exp(-d * d);
      }
      ral[k] = al;
    }
    // outline resolution in screen px: ~6px segments for the core, ~11px for the veil
    const spacing = (visLen / Math.max(1, M - 1)) * view.scale;
    const subC = clamp(Math.floor(6 / Math.max(spacing, 0.1)), 1, 6);
    const curved = spacing > 9;
    const subV = clamp(Math.floor(11 / Math.max(spacing, 0.1)), 1, 8);
    let a = 0;
    while (a < M - 1) {
      const a0 = ral[a];
      const c0 = ru[a];
      let b = a + 1;
      const tol = 0.022 + a0 * 0.07;
      while (b < M - 1 && b - a < 64 && Math.abs(ral[b] - a0) < tol && Math.abs(ru[b] - c0) < 0.06) b++;
      const al = (a0 + ral[b]) * 0.5;
      if (al > 0.004) {
        const um = ru[(a + b) >> 1];
        // veil (soft, warmer)
        g.globalAlpha = Math.min(1, al * 0.16);
        let fs = ramp.str[lutIndex(um * 0.9)];
        if (fs !== lastFill) { g.fillStyle = fs; lastFill = fs; }
        chunkPoly(X, Y, rhw2, a, b, subV, curved);
        // core
        g.globalAlpha = Math.min(1, al * 0.86);
        fs = ramp.str[lutIndex(um)];
        if (fs !== lastFill) { g.fillStyle = fs; lastFill = fs; }
        chunkPoly(X, Y, rhw, a, b, subC, curved);
      }
      a = b;
    }
  }

  function drawGlow(A) {
    if (st.glow <= 0.01) return;
    const breath = living ? 1 + 0.08 * Math.sin(phase * 0.71) + 0.05 * Math.sin(phase * 1.63 + 2) : 1;
    const r = (st.width * 6.5 + 10) * st.glow * breath * (0.75 + 0.25 * clamp(st.split, 0, 1)) * zoomK(st.zoomGlow);
    const spacing = Math.max(2, r * 0.62);
    const total = visLen;
    let k = 0;
    for (let d = spacing * 0.5; d < total; d += spacing) {
      const target = rs[0] + d;
      while (k < M - 2 && rs[k + 1] < target) k++;
      const span = rs[k + 1] - rs[k] || 1;
      const t = clamp((target - rs[k]) / span, 0, 1);
      const u = lerp(ru[k], ru[k + 1], t);
      const f = lerp(rfade[k], rfade[k + 1], t);
      const al = A * f * 0.3 * (0.55 + 0.45 * u) * bandBoost(u) * Math.min(1, st.glow);
      if (al < 0.003) continue;
      const x = lerp(rx[k], rx[k + 1], t);
      const y = lerp(ry[k], ry[k + 1], t);
      const rr = r * (0.7 + 0.3 * u);
      g.globalAlpha = Math.min(1, al);
      g.drawImage(glowSprites[Math.round(u * (GLOWN - 1))], x - rr, y - rr, rr * 2, rr * 2);
    }
  }

  function drawHead(A) {
    if (M < 2) return;
    let hk = 1;
    if (st.dissolve >= 0) hk = 1 - smooth(0.82, 1.02, st.dissolve);
    const energy = clamp(headSpeed / 260, 0, 1);
    const a = A * hk * (0.42 + 0.58 * energy) * rfade[M - 1];
    if (a < 0.01) return;
    const x = rx[M - 1];
    const y = ry[M - 1];
    const wk = Math.sqrt(st.width / 2.2);
    const pulse = living ? 1 + 0.06 * Math.sin(phase * 2.3) : 1;
    const big = (26 + 16 * energy) * wk * pulse * Math.max(0.6, st.glow) * zoomK(st.zoomGlow);
    g.globalAlpha = Math.min(1, a * 0.5);
    g.drawImage(headSprite, x - big, y - big, big * 2, big * 2);
    const small = (7 + 3 * energy) * wk * zoomK(st.zoomWidth);
    g.globalAlpha = Math.min(1, a * 0.95);
    g.drawImage(headSprite, x - small, y - small, small * 2, small * 2);
  }

  function drawParticles(list, A) {
    for (const p of list) {
      const k = p.life / p.max;
      const tw = 0.7 + 0.3 * Math.sin(p.life * 9 + p.seed * 3);
      const a = Math.sin(Math.PI * Math.min(1, k * 1.15 + 0.08)) * tw * A * (p.a ?? 1);
      if (a < 0.01) continue;
      const s = p.s * (1.6 - k * 0.7);
      g.globalAlpha = Math.min(1, a);
      g.drawImage(p.img, p.x - s * 2, p.y - s * 2, s * 4, s * 4);
    }
  }

  function render() {
    const t0 = now();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, canvas.width, canvas.height);
    const c = Math.cos(view.rotate) * view.scale;
    const s = Math.sin(view.rotate) * view.scale;
    const ax = view.ax ?? view.x;
    const ay = view.ay ?? view.y;
    const e = ax - (c * view.x - s * view.y);
    const f = ay - (s * view.x + c * view.y);
    g.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * e, dpr * f);
    g.globalCompositeOperation = 'lighter';
    const A = clamp(st.alpha, 0, 1);
    buildVisible();
    if (M >= 2) computeStrands();
    const t1 = now();
    let t2 = t1;
    let t3 = t1;
    if (M >= 2 && A > 0.003) {
      drawGlow(A);
      t2 = now();
      lastFill = '';
      t3 = now();
      for (let j = S - 1; j >= 0; j--) fillStrand(j, A);
      drawHead(A);
    }
    api.stats.strandsMs = t1 - t0;
    api.stats.glowMs = t2 - t1;
    api.stats.medMs = t3 - t2;
    api.stats.coreMs = now() - t3;
    drawParticles(parts, A);
    drawParticles(dust, 1);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    api.stats.renderMs = now() - t0;
  }

  /* ---- loop ---- */
  let raf = 0;
  let last = 0;
  let destroyed = false;
  function visible() {
    return hasPath && st.alpha > 0.003 && st.head > 0.0005;
  }
  function needsLoop() {
    return tweens.size > 0 || !!followFn || !!morph || springing || parts.length > 0 || dust.length > 0
      || st.flow || st.flowAmt > 0.01 || (living && visible());
  }
  function wake() {
    if (destroyed || raf) return;
    last = now();
    raf = requestAnimationFrame(frame);
  }
  function frame(t) {
    raf = 0;
    if (destroyed) return;
    const tt = Math.max(t, last);
    const dt = clamp((tt - last) / 1000, 0, 0.1);
    last = tt;
    clock += dt;
    if (living) phase += dt;

    stepTweens(now());

    if (followFn) {
      let pts = null;
      try { pts = followFn(); } catch (err) { console.warn('[ribbon] follow()', err); followFn = null; }
      if (pts && sampleInto(pts, N, qx, qy) >= 0) {
        if (!hasPath) { px.set(qx); py.set(qy); hasPath = true; }
        springing = true;
      }
    }
    if (morph) {
      const k = clamp((now() - morph.t0) / morph.dur, 0, 1);
      const lag = morph.lag;
      for (let i = 0; i < N; i++) {
        const order = i / (N - 1); // head (1) leads
        const ki = clamp((k * (1 + lag) - lag * (1 - order)), 0, 1);
        const e = morph.ease(ki);
        const dx = tx1[i] - fx0[i];
        const dy = ty1[i] - fy0[i];
        const sw = Math.sin(Math.PI * e) * morph.swirl;
        qx[i] = fx0[i] + dx * e - dy * sw;
        qy[i] = fy0[i] + dy * e + dx * sw;
      }
      // keep in-between shapes silky: soften kinks while the ribbon travels
      const soft = Math.sin(Math.PI * k);
      if (soft > 0.02) smoothTargets(soft);
      if (k >= 1) {
        qx.set(tx1);
        qy.set(ty1);
        const m = morph;
        morph = null;
        m.settle = true;
        setTimeout(() => m.resolve(true), 220);
      }
    }
    if (springing) stepSprings(dt);
    updateGeometry();

    // flow shimmer
    st.flowAmt += ((st.flow ? 1 : 0) - st.flowAmt) * Math.min(1, dt * 2.2);
    if (st.flowAmt > 0.01) {
      if (band.p < -0.5) {
        band.wait -= dt;
        if (band.wait <= 0) { band.p = -0.15; band.dur = 1.6 + Math.random() * 0.9; }
      } else {
        band.p += (dt / band.dur) * 1.3;
        if (band.p > 1.2) { band.p = -1; band.wait = 0.5 + Math.random() * 1.8; }
      }
    }

    // head speed (drives head brightness)
    const hp = hasPath ? rawAt(st.head) : null;
    if (hp && lastHead && dt > 0) {
      const sp = Math.hypot(hp.x - lastHead.x, hp.y - lastHead.y) / dt;
      headSpeed += (sp - headSpeed) * Math.min(1, dt * 6);
    } else headSpeed *= 0.9;
    lastHead = hp;

    stepParticles(parts, dt, 0.9, 7);
    stepParticles(dust, dt, 1.1, 16);

    render();

    // shed particles from the live ribbon (after strand positions are known)
    if (wantParticles && M > 2 && st.alpha > 0.05 && st.dissolve < 0) {
      const moving = clamp(headSpeed / 200, 0, 1);
      const rate = (low ? 5 : 10) * (0.5 + 1.6 * moving) * clamp(visLen / 600, 0.3, 1.6) * (reduced ? 0.4 : 1);
      spawnAcc += rate * dt;
      while (spawnAcc >= 1 && parts.length < maxParts) { emit(1, false); spawnAcc -= 1; }
      if (spawnAcc > 3) spawnAcc = 0;
    }
    if (st.dissolve >= 0 && M > 2) {
      const f = Math.min(1, st.dissolve);
      const prev = lastFront;
      lastFront = f;
      if (f > prev) {
        const total = (low ? 130 : 300) * clamp(Math.sqrt(visLen / 700), 0.45, 1.5);
        dustAcc += total * (f - prev);
        const n = Math.min(80, Math.floor(dustAcc));
        dustAcc -= n;
        if (n > 0) emit(n, true, prev, Math.min(1, f + 0.04));
      }
    }

    if (needsLoop()) raf = requestAnimationFrame(frame);
  }
  let spawnAcc = 0;
  let dustAcc = 0;
  let lastFront = 0;

  /* ================================================================ API */
  function setPath(points) {
    if (destroyed) return api;
    if (sampleInto(points, N, qx, qy) < 0) return api;
    px.set(qx);
    py.set(qy);
    vx.fill(0);
    vy.fill(0);
    if (morph) { const m = morph; morph = null; m.resolve(false); }
    springing = false;
    hasPath = true;
    updateGeometry();
    wake();
    return api;
  }

  function draw({ duration = 2.5, ease = 'power2.inOut', from = 0, to = 1, trail, start } = {}) {
    if (trail !== undefined) st.trail = trail == null ? null : clamp(Number(trail), 0.001, 1);
    if (start !== undefined) st.start = clamp(Number(start), 0, 1);
    const a = clamp(Number(from), 0, 1);
    const b = clamp(Number(to), 0, 1);
    st.head = a;
    const d = reduced ? duration * 0.6 : duration;
    return tweenTo('draw', d, ease, (e) => { st.head = lerp(a, b, e); });
  }

  /** Extra: the tail catches up with the head (the ribbon withdraws into its light). */
  function retract({ duration = 1.2, ease = 'power2.in', to } = {}) {
    const head = clamp(st.head, 0, 1);
    const curTail = st.trail != null ? Math.max(0, head - st.trail) : Math.min(st.start, head);
    st.trail = null;
    st.start = curTail;
    const target = to == null ? head : clamp(Number(to), 0, 1);
    return tweenTo('draw', duration, ease, (e) => { st.start = lerp(curTail, target, e); });
  }

  function flow(on = true) {
    st.flow = !!on && !reduced;
    if (st.flow && band.p < -0.5) band.wait = 0.15;
    wake();
    return api;
  }

  function morphTo(points, { duration = 1.6, ease = 'power2.inOut', lag = 0.28, swirl = 0.12 } = {}) {
    if (destroyed) return Promise.resolve(false);
    if (!hasPath) { setPath(points); return Promise.resolve(true); }
    if (sampleInto(points, N, tx1, ty1) < 0) return Promise.resolve(false);
    if (morph) { const m = morph; morph = null; m.resolve(false); }
    followFn = null;
    fx0.set(px);
    fy0.set(py);
    omega = 11;
    springing = true;
    const dur = (reduced ? duration * 0.6 : duration) * 1000;
    return new Promise((resolve) => {
      morph = { t0: now(), dur: Math.max(1, dur), ease: easeFn(ease), lag: clamp(lag, 0, 2), swirl: reduced ? 0 : swirl, resolve };
      wake();
    });
  }

  function follow(fn, { stiffness = 9 } = {}) {
    followFn = typeof fn === 'function' ? fn : null;
    if (followFn) {
      if (morph) { const m = morph; morph = null; m.resolve(false); }
      omega = clamp(stiffness, 1, 60);
      springing = true;
    }
    wake();
    return api;
  }

  function head() {
    if (!hasPath) return { x: cw / 2, y: ch / 2 };
    const p = rawAt(st.head);
    return toScreen(p.x, p.y);
  }

  function fade(alpha = 0, duration = 0.8, ease = 'sine.inOut') {
    const a = st.alpha;
    const b = clamp(Number(alpha), 0, 1);
    return tweenTo('fade', duration, ease, (e) => { st.alpha = lerp(a, b, e); });
  }

  function dissolve({ duration = 1.8 } = {}) {
    if (destroyed) return Promise.resolve(false);
    if (!visible()) { st.alpha = 0; wake(); return Promise.resolve(true); }
    st.dissolve = 0;
    lastFront = 0;
    dustAcc = 0;
    const travel = duration * 0.62;
    return tweenTo('dissolve', travel, 'sine.inOut', (e) => { st.dissolve = e * 1.12; })
      .then((done) => new Promise((resolve) => {
        if (!done) { st.dissolve = -1; return resolve(false); }
        setTimeout(() => {
          st.alpha = 0;
          st.dissolve = -1;
          parts.length = 0;
          wake();
          resolve(true);
        }, (duration - travel) * 1000);
      }));
  }

  /** Extra: live look parameters — width, glow, alpha, split (0 = one strand, 1 = all), spread, twist, tail, start, trail. */
  function set(o = {}) {
    for (const k of ['width', 'glow', 'alpha', 'split', 'spread', 'twist', 'tail', 'start', 'zoomWidth', 'zoomGlow']) {
      if (o[k] != null && Number.isFinite(Number(o[k]))) st[k] = Number(o[k]);
    }
    if (o.trail !== undefined) st.trail = o.trail == null ? null : Number(o.trail);
    if (o.head != null) st.head = clamp(Number(o.head), 0, 1);
    wake();
    return api;
  }

  /** Extra: camera. Path point (x,y) is placed at screen (ax,ay) (defaults to x,y), scaled and rotated (radians). */
  function setView(v = {}) {
    for (const k of ['x', 'y', 'scale', 'rotate']) if (v[k] != null && Number.isFinite(v[k])) view[k] = v[k];
    if (v.ax !== undefined) view.ax = v.ax;
    if (v.ay !== undefined) view.ay = v.ay;
    wake();
    return api;
  }

  /** Extra: point on the current path at fraction t (0 tail end … 1 head end), in container px. */
  function pointAt(t = 1) {
    if (!hasPath) return { x: cw / 2, y: ch / 2, angle: 0 };
    const p = rawAt(t);
    const sp = toScreen(p.x, p.y);
    const i = p.i;
    sp.angle = Math.atan2(py[i + 1] - py[i], px[i + 1] - px[i]) + view.rotate;
    return sp;
  }

  function tweenParam(key, to, duration = 1, ease = 'sine.inOut') {
    if (!(key in st)) return Promise.resolve(false);
    const a = Number(st[key]);
    const b = Number(to);
    return tweenTo(`p:${key}`, duration, ease, (e) => { st[key] = lerp(a, b, e); });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const tw of tweens.values()) tw.resolve(false);
    tweens.clear();
    if (morph) { morph.resolve(false); morph = null; }
    followFn = null;
    parts.length = 0;
    dust.length = 0;
    if (ro) ro.disconnect();
    window.removeEventListener('resize', onWinResize);
    canvas.width = canvas.height = 1;
    canvas.remove();
  }

  const api = {
    canvas,
    stats: { renderMs: 0 },
    setPath,
    draw,
    flow,
    morph: morphTo,
    follow,
    head,
    fade,
    dissolve,
    destroy,
    // extras
    retract,
    set,
    tween: tweenParam,
    view: setView,
    pointAt,
    length: () => (hasPath ? cum[N - 1] : 0),
    get progress() { return st.head; },
    /** dev: render synchronously (benchmarks) */
    _render: () => { if (!destroyed) { updateGeometry(); render(); } },
    get destroyed() { return destroyed; },
  };

  measure();
  return api;
}

/* ================================================================== paths */
const P = (x, y) => ({ x, y });

export const ribbonPaths = {
  /** A flowing horizontal wave across a w×h box. opts: amp (fraction of h, .12), cycles (1.25), y (fraction of h, .5), n (9), phase (0), x0/x1 (fractions, -.06/1.06), reverse. */
  wave(w, h, { amp = 0.12, cycles = 1.25, y = 0.5, n = 9, phase = 0, x0 = -0.06, x1 = 1.06, reverse = false } = {}) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const env = 0.65 + 0.35 * Math.sin(Math.PI * t);
      pts.push(P(lerp(x0 * w, x1 * w, t), y * h + Math.sin(phase + t * cycles * TAU) * amp * h * env));
    }
    return reverse ? pts.reverse() : pts;
  },

  /** A smooth heart, `size` px wide, starting and ending at the top dip (with a small overlap). */
  heart(cx, cy, size, n = 56) {
    const s = size / 32;
    const pts = [];
    const end = TAU + 0.42;
    for (let i = 0; i <= n; i++) {
      const t = 0.02 + (i / n) * end;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push(P(cx + x * s, cy + (y - 2.7) * s));
    }
    return pts;
  },

  /** A circle (or several slightly tightening loops when turns > 1), starting at the top. */
  circle(cx, cy, r, n = 48, turns = 1, start = -Math.PI / 2) {
    const pts = [];
    const total = Math.max(1, Math.round(n * turns));
    for (let i = 0; i <= total; i++) {
      const t = i / total;
      const a = start + t * turns * TAU;
      const rr = r * (1 - 0.06 * t * (turns - 1));
      pts.push(P(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
    return pts;
  },

  /** Archimedean spiral from radius r0 to r1. */
  spiral(cx, cy, r0 = 10, r1 = 200, turns = 2.5, n = 80, start = 0) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = start + t * turns * TAU;
      const r = lerp(r0, r1, t);
      pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return pts;
  },

  /**
   * A smooth path through the given points. opts.loose (0..1) adds loose curls
   * between points (probability & size), opts.sag (px) lets the thread hang
   * between points like a garland, opts.seed varies which gaps curl.
   */
  through(points, { loose = 0, sag = 0, seed = 3 } = {}) {
    const pts = cleanPoints(points);
    if (pts.length < 2 || (!loose && !sag)) return pts;
    const r = rng(seed * 2654435761);
    const out = [pts[0]];
    let side = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const m = P((a.x + b.x) / 2, (a.y + b.y) / 2 + sag);
      if (loose > 0 && r() < 0.35 + loose * 0.65 && d > 40) {
        const rad = Math.min(d * 0.15, 70) * (0.6 + 0.4 * loose);
        // a little loop that leaves and re-joins the line in the travel direction
        let nxv = -uy * side;
        let nyv = ux * side;
        if (nyv < 0 && Math.abs(nyv) > 0.3) { nxv = -nxv; nyv = -nyv; side = -side; } // prefer loops that hang down
        const cx = m.x + nxv * rad;
        const cy = m.y + nyv * rad;
        const a0 = Math.atan2(m.y - cy, m.x - cx);
        // direction so that the tangent at m points along (ux, uy)
        const tx = -Math.sin(a0);
        const ty = Math.cos(a0);
        const dir = tx * ux + ty * uy >= 0 ? 1 : -1;
        out.push(P(m.x - ux * rad * 0.9, m.y - uy * rad * 0.9));
        for (let k = 1; k <= 5; k++) {
          const ang = a0 + dir * (k / 6) * TAU;
          out.push(P(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad));
        }
        out.push(P(m.x + ux * rad * 0.9, m.y + uy * rad * 0.9));
        side = -side;
      } else if (sag) {
        out.push(m);
      }
      out.push(b);
    }
    return out;
  },

  /** One continuous, slightly slanted cursive stroke writing "20", fitted into box {x, y, w, h}. */
  twenty(box = {}) {
    const bw = box.w ?? box.width ?? 300;
    const bh = box.h ?? box.height ?? 200;
    const bx = box.x ?? 0;
    const by = box.y ?? 0;
    // design space: ~0..116 × 0..64 (y down); a gentle italic slant is applied below
    const raw = [
      // lead-in flourish → the hook of the 2
      [-10, 41], [-6.5, 31], [-1.5, 20], [4.5, 10], [12.5, 3.5], [22.5, 1], [32, 2.5], [39, 9], [40.5, 18],
      // the diagonal, a soft cursive corner, the base
      [36.5, 27.5], [29, 36], [19.5, 44.5], [10.5, 52.5], [5, 58.5], [4.5, 62.2], [8.5, 63.2], [16.5, 61.6],
      [27, 61.4], [38, 62],
      // flowing up into the 0, around, closing where it began
      [47, 60], [53.5, 53], [57, 41], [60.5, 24], [66, 10], [75, 2.5], [85.5, 3], [92.5, 12], [95, 27],
      [93, 43.5], [87, 55.5], [77.5, 62.5], [67, 62.5], [59.5, 56], [56.5, 46],
    ];
    const slant = 0.2;
    const pts = raw.map(([x, y]) => [x + (64 - y) * slant, y]);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const sc = Math.min(bw / (maxX - minX), bh / (maxY - minY));
    const ox = bx + (bw - (maxX - minX) * sc) / 2 - minX * sc;
    const oy = by + (bh - (maxY - minY) * sc) / 2 - minY * sc;
    return pts.map(([x, y]) => P(ox + x * sc, oy + y * sc));
  },

  /**
   * A gently curved line from x0 to x1 around height y with n anchor points.
   * Returns the path points (with a short lead-in/out); `.anchors` holds the n anchors.
   */
  timeline(x0, x1, y, n = 7, { amp, lead = 0.06 } = {}) {
    n = Math.max(2, Math.round(n));
    const span = x1 - x0;
    const A = amp ?? Math.min(Math.abs(span) * 0.045, 46);
    const anchors = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      anchors.push(P(x0 + span * t, y + Math.sin(t * Math.PI * 1.5 + 0.35) * A));
    }
    const first = anchors[0];
    const lastA = anchors[n - 1];
    const pts = [P(first.x - span * lead, first.y + A * 0.6), ...anchors, P(lastA.x + span * lead, lastA.y - A * 0.6)];
    pts.anchors = anchors;
    return pts;
  },
};
