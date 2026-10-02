// Scene-to-scene film transitions. Each covers the screen, runs `swap`, then reveals.
//
//   transition(type, swap, opts) → Promise   (queued: transitions never overlap)
//   opts = { handoff: {x, y, color, kind, from} | null, to, device, audio, letterbox (getter) }
//
// Types: fade · glow · iris · curtain · dream (classic) and the film's own:
//   lantern — a lit lantern rises; its light fills the frame, then shrinks to a point that drifts away
//   sun     — a storybook iris shaped like the kingdom's sun emblem
//   ribbon  — the golden strand: enters, splits into strands, weaves a glowing path, we fly into it
//   ember   — a spark travels from the handoff point, curls into the centre and blooms
//   petals  — a soft swirl of original petals covers, then clears the frame
//   dust    — the frame dissolves into golden dust; the next chapter condenses out of it
//   page    — a storybook page turn
// Every transition ends with #transition transparent and emptied — even if `swap` throws.
// With device.reducedMotion every type becomes a gentle ~0.8s crossfade.
import { createRibbon, easeFn, sampleSpline } from './ribbon.js';
import { sunEmblem, lanternSVG, html } from './art.js';

const gsap = () => window.gsap;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const E = {
  in2: easeFn('power2.in'),
  out2: easeFn('power2.out'),
  io2: easeFn('power2.inOut'),
  in3: easeFn('power3.in'),
  out3: easeFn('power3.out'),
  io3: easeFn('power3.inOut'),
  sio: easeFn('sine.inOut'),
  sin: easeFn('sine.in'),
  sout: easeFn('sine.out'),
};

function tween(target, vars) {
  return new Promise((resolve) => gsap().to(target, { ...vars, onComplete: resolve }));
}

/* ------------------------------------------------------------------ helpers */
function hexRgb(h, fallback = [255, 179, 71]) {
  const s = String(h || '').trim().replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6);
  const n = parseInt(full, 16);
  if (full.length !== 6 || !Number.isFinite(n)) return fallback;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// the colour the frame falls to, chosen by the chapter we're travelling into
const GRADE_OF = {
  gate: 'night', invite: 'night', prologue: 'dawn', tower: 'day', hair: 'sunset', names: 'sunset', dance: 'twilight',
  lanterns: 'night', letter: 'candle', cake: 'candle', video: 'candle', constellation: 'deep', birthday: 'golden',
  hug: 'golden', credits: 'deep',
};
const DARK = {
  dawn: '#25132c', day: '#26152b', sunset: '#230d27', twilight: '#170f31', night: '#0b0a22',
  candle: '#130810', deep: '#0a0d27', golden: '#170e25',
};
const darkFor = (o) => hexRgb(DARK[GRADE_OF[o.to]] || '#0b0614');

function viewport() {
  return { W: window.innerWidth || 390, H: window.innerHeight || 844 };
}

/** Handoff point in viewport px (fractions 0..1 are accepted too), or null. */
function handoffXY(o) {
  const h = o.handoff;
  if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.y)) return null;
  const { W, H } = viewport();
  const frac = h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1 && !Number.isInteger(h.x + h.y);
  return frac ? { x: h.x * W, y: h.y * H } : { x: h.x, y: h.y };
}

function sfx(o, name, opts) {
  try { o.audio?.sfx?.(name, opts); } catch { /* sound is optional */ }
}

/** rAF timeline on wall-clock time: fn(k 0..1, t seconds, dt). Resolves at k = 1 (with a watchdog for hidden tabs). */
function frames(duration, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(dog);
      resolve();
    };
    const step = (now) => {
      if (done) return;
      const tt = Math.max(now, t0);
      const t = (tt - t0) / 1000;
      const dt = clamp((tt - last) / 1000, 0, 0.1);
      last = tt;
      const k = duration > 0 ? Math.min(1, t / duration) : 1;
      let stop = false;
      try { stop = fn(k, t, dt) === false; } catch (e) { console.error('[transition] frame', e); stop = true; }
      if (k >= 1 || stop) finish();
      else requestAnimationFrame(step);
    };
    const dog = setTimeout(() => { try { fn(1, duration, 0); } catch { /* ignore */ } finish(); }, duration * 1000 + 6000);
    requestAnimationFrame(step);
  });
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

function crispDpr(o) {
  return Math.min(window.devicePixelRatio || 1, o.low ? 1 : 1.5);
}

/** A full-viewport canvas inside the transition layer (scale = backing-store px per CSS px). */
function canvasLayer(el, scale = 1) {
  const { W, H } = viewport();
  const c = document.createElement('canvas');
  c.className = 'tr-layer';
  c.width = Math.max(1, Math.round(W * scale));
  c.height = Math.max(1, Math.round(H * scale));
  el.appendChild(c);
  const g = c.getContext('2d');
  g.setTransform(scale, 0, 0, scale, 0, 0);
  return { c, g, W, H, s: scale };
}
function resetCtx(L) {
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalAlpha = 1;
  L.g.globalCompositeOperation = 'source-over';
  L.g.clearRect(0, 0, L.c.width, L.c.height);
  L.g.setTransform(L.s, 0, 0, L.s, 0, 0);
}

const spriteCache = new Map();
/** Soft radial sprite: stops [[offset, rgb, alpha]]. */
function sprite(key, size, stops) {
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [o, col, a] of stops) gr.addColorStop(o, rgba(col, a));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  spriteCache.set(key, c);
  return c;
}
const WHITE = [255, 252, 244];
const CREAM = [255, 244, 224];
const GOLD_HI = [255, 227, 163];
const GOLD = [244, 196, 99];
const AMBER = [255, 179, 71];
const spark = () => sprite('spark', 128, [[0, WHITE, 1], [0.07, CREAM, 0.95], [0.18, GOLD_HI, 0.5], [0.42, AMBER, 0.14], [1, AMBER, 0]]);
const mote = () => sprite('mote', 32, [[0, WHITE, 1], [0.22, GOLD_HI, 0.75], [0.55, AMBER, 0.15], [1, AMBER, 0]]);
const halo = () => sprite('halo', 128, [[0, CREAM, 0.55], [0.3, GOLD, 0.26], [0.65, AMBER, 0.07], [1, AMBER, 0]]);

/** Warm light disc: opaque core → soft edge; `dark` (optional) adds a dusk-coloured rim. */
function lightGradient(g, x, y, r, { tint = AMBER, dark = null, core = 1 } = {}) {
  const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  gr.addColorStop(0, rgba(mixRgb(CREAM, WHITE, 0.4), core));
  gr.addColorStop(0.2, rgba(GOLD_HI, 1));
  gr.addColorStop(0.42, rgba(mixRgb(GOLD, tint, 0.35), 1));
  if (dark) {
    gr.addColorStop(0.64, rgba(mixRgb(mixRgb(tint, [196, 104, 70], 0.5), dark, 0.25), 1));
    gr.addColorStop(0.84, rgba(dark, 1));
    gr.addColorStop(1, rgba(dark, 0));
  } else {
    gr.addColorStop(0.66, rgba(mixRgb(tint, [230, 140, 64], 0.4), 1));
    gr.addColorStop(0.86, rgba(mixRgb(tint, [214, 112, 58], 0.6), 0.96));
    gr.addColorStop(1, rgba([214, 112, 58], 0));
  }
  return gr;
}
/** Expanding bloom: soft light with a long falloff (corners are covered once r ≥ farthest / 0.56). */
function bloomGradient(g, x, y, r, { tint = AMBER } = {}) {
  const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  gr.addColorStop(0, rgba(mixRgb(CREAM, WHITE, 0.5), 1));
  gr.addColorStop(0.16, rgba(GOLD_HI, 1));
  gr.addColorStop(0.36, rgba(mixRgb(GOLD, tint, 0.3), 1));
  gr.addColorStop(0.56, rgba(mixRgb(tint, [236, 150, 70], 0.35), 1));
  gr.addColorStop(0.72, rgba(mixRgb(tint, [220, 120, 62], 0.5), 0.7));
  gr.addColorStop(0.87, rgba([206, 106, 60], 0.25));
  gr.addColorStop(1, rgba([206, 106, 60], 0));
  return gr;
}

/** Reveal: a ring of light expanding from (x,y); transparent inside radius r, warm light outside. */
function ringGradient(g, x, y, r, R, { tint = AMBER } = {}) {
  const R2 = Math.max(R, r * 1.7, 1);
  const gr = g.createRadialGradient(x, y, 0, x, y, R2);
  const f = (v) => clamp(v / R2, 0, 1);
  gr.addColorStop(0, 'rgba(255,240,210,0)');
  gr.addColorStop(f(r * 0.5), 'rgba(255,200,110,0)');
  gr.addColorStop(f(r * 0.84), rgba(GOLD, 0.55));
  gr.addColorStop(f(r), rgba(GOLD_HI, 1));
  gr.addColorStop(f(r * 1.25), rgba(mixRgb(GOLD, tint, 0.4), 1));
  gr.addColorStop(Math.max(f(r * 1.26) + 0.001, 0.999), rgba(mixRgb(tint, [214, 112, 58], 0.5), 1));
  if (f(r * 1.26) + 0.001 < 0.999) gr.addColorStop(1, rgba(mixRgb(tint, [214, 112, 58], 0.5), 1));
  return gr;
}
const farthest = (x, y, W, H) => Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));

/** Small particle system drawn additively onto a canvas layer. */
function particles() {
  const list = [];
  return {
    list,
    add(p) { list.push({ life: 0, seed: Math.random() * TAU, a: 1, grav: 0, drag: 1.2, ...p }); },
    step(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life += dt;
        if (p.life >= p.max) { list.splice(i, 1); continue; }
        const d = 1 - p.drag * dt;
        p.vx = p.vx * d + Math.sin(p.life * 2.3 + p.seed) * 8 * dt;
        p.vy = p.vy * d + p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    draw(g, img = mote(), alphaMul = 1) {
      g.globalCompositeOperation = 'lighter';
      for (const p of list) {
        const k = p.life / p.max;
        const a = Math.sin(Math.PI * Math.min(1, k * 1.1 + 0.05)) * (0.7 + 0.3 * Math.sin(p.life * 11 + p.seed * 5)) * p.a * alphaMul;
        if (a < 0.01) continue;
        const s = p.s * (1 - k * 0.45);
        g.globalAlpha = Math.min(1, a);
        g.drawImage(img, p.x - s, p.y - s, s * 2, s * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
  };
}

/* ======================================================= classic transitions */
const LEGACY = {
  fade: {
    cover: async (el) => {
      el.style.background = '#05020a';
      await tween(el, { opacity: 1, duration: 1.0, ease: 'power2.inOut' });
    },
    reveal: (el) => tween(el, { opacity: 0, duration: 1.5, ease: 'power2.inOut' }),
  },
  glow: {
    cover: async (el) => {
      el.style.background = 'radial-gradient(circle at 50% 55%, #fffaf0 0%, #ffe3a3 30%, #f4c463 55%, #6b3fa0 100%)';
      await tween(el, { opacity: 1, duration: 1.1, ease: 'power2.in' });
    },
    reveal: (el) => tween(el, { opacity: 0, duration: 2.0, ease: 'power2.out' }),
  },
  iris: {
    cover: async (el) => {
      el.style.background = '#05020a';
      el.style.setProperty('--r', '150%');
      const mask = 'radial-gradient(circle at 50% 50%, transparent var(--r), #000 calc(var(--r) + 2px))';
      el.style.webkitMaskImage = mask;
      el.style.maskImage = mask;
      gsap().set(el, { opacity: 1 });
      await tween(el, { '--r': '0%', duration: 1.25, ease: 'power3.in' });
    },
    reveal: async (el) => {
      await tween(el, { '--r': '150%', duration: 1.6, ease: 'power3.out' });
      el.style.webkitMaskImage = el.style.maskImage = '';
      gsap().set(el, { opacity: 0 });
    },
  },
  curtain: {
    cover: async (el) => {
      document.documentElement.style.setProperty('--lb', '50.5vh');
      el.style.background = '#05020a';
      await sleep(1.4);
      gsap().set(el, { opacity: 1 });
    },
    reveal: async (el, o) => {
      gsap().set(el, { opacity: 0 });
      document.documentElement.style.setProperty('--lb', o.letterbox || '0px');
      await sleep(1.5);
    },
  },
  dream: {
    cover: async (el) => {
      el.style.background = 'radial-gradient(ellipse at 50% 50%, rgba(255,240,210,.95), rgba(185,163,227,.9) 55%, #24113d 100%)';
      await tween(el, { opacity: 1, duration: 1.3, ease: 'sine.inOut' });
    },
    reveal: (el) => tween(el, { opacity: 0, duration: 2.2, ease: 'sine.inOut' }),
  },
};

/* ============================================================== crossfade */
// the reduced-motion path for every type: a gentle ~0.8s dip through the next chapter's dusk
async function crossfade(el, swap, o) {
  const c = darkFor(o);
  el.style.background = rgba(c);
  el.style.opacity = '0';
  await frames(0.35, (k) => { el.style.opacity = String(E.sio(k)); });
  await swap();
  await frames(0.45, (k) => { el.style.opacity = String(1 - E.sio(k)); });
}

/* ================================================================== ember */
async function ember(el, swap, o) {
  const { W, H } = viewport();
  const low = o.low;
  const soft = canvasLayer(el, low ? 0.35 : 0.5);
  const fx = canvasLayer(el, crispDpr(o));
  const dark = darkFor(o);
  const tint = hexRgb(o.handoff?.color, AMBER);
  const c = { x: W * 0.5, y: H * (H > W ? 0.45 : 0.48) };
  const from = handoffXY(o) || { x: W * (0.5 + (Math.random() < 0.5 ? -0.18 : 0.18)), y: H * 1.03 };
  const side = from.x <= c.x ? 1 : -1;
  const dx = c.x - from.x;
  const dy = c.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const px = -dy / dist;
  const py = dx / dist;
  const bow = Math.min(W, H) * 0.32 * side;
  // a graceful arc that curls once around the centre before settling
  const ctrl = [
    from,
    { x: from.x + dx * 0.42 + px * bow, y: from.y + dy * 0.42 + py * bow },
    { x: c.x + side * W * 0.13, y: c.y - H * 0.1 },
    { x: c.x - side * W * 0.07, y: c.y - H * 0.06 },
    { x: c.x - side * W * 0.02, y: c.y + H * 0.02 },
    c,
  ];
  const path = sampleSpline(ctrl, 160);
  const parts = particles();
  const R = farthest(c.x, c.y, W, H) / 0.56;
  const FLY = 1.0;
  const BLOOM0 = 0.86;
  const COVER = 1.42;
  sfx(o, 'whoosh', { duration: 1.1 });
  let shimmered = false;
  const at = (p) => {
    const f = clamp(p, 0, 1) * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const t = f - i;
    return { x: lerp(path[i].x, path[i + 1].x, t), y: lerp(path[i].y, path[i + 1].y, t) };
  };
  await frames(COVER, (k, t, dt) => {
    resetCtx(soft);
    resetCtx(fx);
    // dusk falls a little so the spark reads
    soft.g.fillStyle = rgba(dark, 0.32 * E.sio(clamp(t / 0.9, 0, 1)));
    soft.g.fillRect(0, 0, W, H);
    // the bloom
    if (t > BLOOM0) {
      if (!shimmered) { shimmered = true; sfx(o, 'shimmer'); }
      const b = E.in2(clamp((t - BLOOM0) / (COVER - BLOOM0), 0, 1));
      soft.g.fillStyle = bloomGradient(soft.g, c.x, c.y, Math.max(2, R * b), { tint });
      soft.g.fillRect(0, 0, W, H);
    }
    // the spark and its trail
    const p = E.io2(clamp(t / FLY, 0, 1));
    const g = fx.g;
    g.globalCompositeOperation = 'lighter';
    const trail = 0.2;
    const n = low ? 14 : 26;
    for (let i = 0; i <= n; i++) {
      const q = p - trail * (1 - i / n);
      if (q < 0) continue;
      const pt = at(q);
      const w = i / n;
      const s = (3 + 10 * w * w) * (1 - smooth(BLOOM0, COVER, t) * 0.5);
      g.globalAlpha = 0.08 + 0.5 * w * w;
      g.drawImage(halo(), pt.x - s * 2, pt.y - s * 2, s * 4, s * 4);
    }
    const head = at(p);
    const flare = 1 + smooth(BLOOM0 - 0.1, COVER, t) * 5;
    const hs = 30 * flare;
    g.globalAlpha = 1;
    g.drawImage(spark(), head.x - hs, head.y - hs, hs * 2, hs * 2);
    g.globalCompositeOperation = 'source-over';
    // shed embers
    if (t < FLY && Math.random() < (low ? 0.55 : 0.9)) {
      parts.add({ x: head.x, y: head.y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.2) * 40, grav: 60, s: 2 + Math.random() * 3.5, max: 0.5 + Math.random() * 0.7 });
    }
    parts.step(dt);
    parts.draw(g);
  });
  await swap();
  // from here the light is light: it adds to the new world instead of fogging it
  el.style.mixBlendMode = 'screen';
  // embers that rise as the light opens
  for (let i = 0; i < (low ? 12 : 26); i++) {
    const a = Math.random() * TAU;
    const r = Math.random() * Math.min(W, H) * 0.32;
    parts.add({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, vx: Math.cos(a) * 30, vy: -30 - Math.random() * 60, grav: -10, drag: 0.6, s: 2 + Math.random() * 5, max: 0.9 + Math.random() * 0.8 });
  }
  await frames(1.05, (k, t, dt) => {
    resetCtx(soft);
    resetCtx(fx);
    const g = soft.g;
    // the light opens from its heart as a widening ring
    const hr = Math.max(1, R * 0.75 * E.out2(k));
    g.globalAlpha = 1 - smooth(0.45, 1, k);
    g.fillStyle = k < 0.02 ? bloomGradient(g, c.x, c.y, R, { tint }) : ringGradient(g, c.x, c.y, hr, R * 0.56, { tint });
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    const fs = 30 * 6 * (1 - E.out2(k));
    if (fs > 1) {
      fx.g.globalCompositeOperation = 'lighter';
      fx.g.globalAlpha = 1 - k;
      fx.g.drawImage(spark(), c.x - fs, c.y - fs, fs * 2, fs * 2);
      fx.g.globalCompositeOperation = 'source-over';
    }
    parts.step(dt);
    parts.draw(fx.g);
  });
}

/* ================================================================ lantern */
async function lantern(el, swap, o) {
  const { W, H } = viewport();
  const low = o.low;
  const soft = canvasLayer(el, low ? 0.35 : 0.5);
  const dark = darkFor(o);
  const tint = hexRgb(o.handoff?.color, AMBER);
  const size = clamp(Math.min(W, H) * 0.22, 72, 160);
  const lh = (size * 170) / 120;
  const lan = document.createElement('div');
  lan.className = 'tr-lantern';
  lan.style.width = `${size}px`;
  lan.style.height = `${lh}px`;
  lan.innerHTML = lanternSVG({ lit: true });
  el.appendChild(lan);
  const fx = canvasLayer(el, crispDpr(o));
  const hp = handoffXY(o);
  const x0 = hp ? clamp(hp.x, size * 0.6, W - size * 0.6) : W * 0.56;
  const y0 = hp && hp.y < H + lh ? Math.max(hp.y, H * 0.55) : H + lh * 0.6;
  const yTop = H * 0.43;
  const RISE = 1.22;
  const EXPAND0 = 0.92;
  const COVER = 1.45;
  const lightAt = (x, y) => ({ x, y: y + lh * 0.18 }); // the flame sits low in the lantern
  let pos = { x: x0, y: y0 };
  sfx(o, 'lanternRise');
  let shimmered = false;
  await frames(COVER, (k, t) => {
    const r = E.sout(clamp(t / RISE, 0, 1));
    pos = {
      x: lerp(x0, W * 0.5, E.sio(clamp(t / RISE, 0, 1)) * 0.75) + Math.sin(t * 2.1) * W * 0.012,
      y: lerp(y0, yTop, r),
    };
    const sc = 0.9 + 0.22 * r;
    // when it starts on screen (handoff), it kindles in place instead of popping in
    const lanA = (y0 < H ? smooth(0, 0.35, t) : 1) * (1 - smooth(EXPAND0 + 0.2, COVER, t));
    lan.style.transform = `translate3d(${pos.x - size / 2}px, ${pos.y - lh / 2}px, 0) rotate(${Math.sin(t * 1.7) * 3.5}deg) scale(${sc})`;
    lan.style.opacity = String(lanA);
    const L = lightAt(pos.x, pos.y);
    resetCtx(soft);
    resetCtx(fx);
    soft.g.fillStyle = rgba(dark, 0.5 * E.sio(clamp(t / 1.0, 0, 1)));
    soft.g.fillRect(0, 0, W, H);
    // the lantern's own warm halo
    const hs = size * (1.7 + 0.08 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23));
    fx.g.globalCompositeOperation = 'lighter';
    fx.g.globalAlpha = 0.6 * lanA + 0.3;
    fx.g.drawImage(halo(), L.x - hs, L.y - hs, hs * 2, hs * 2);
    fx.g.globalCompositeOperation = 'source-over';
    if (t > EXPAND0) {
      if (!shimmered) { shimmered = true; sfx(o, 'shimmer'); }
      const b = E.in2(clamp((t - EXPAND0) / (COVER - EXPAND0), 0, 1));
      const R = farthest(L.x, L.y, W, H) / 0.56;
      soft.g.globalAlpha = 0.55 + 0.45 * smooth(0, 0.5, b);
      soft.g.fillStyle = bloomGradient(soft.g, L.x, L.y, lerp(size * 1.6, R, b), { tint });
      soft.g.fillRect(0, 0, W, H);
      soft.g.globalAlpha = 1;
    }
  });
  lan.remove();
  await swap();
  el.style.mixBlendMode = 'screen';
  // the light contracts into a point that drifts up and fades
  const L0 = lightAt(pos.x, pos.y);
  const R0 = farthest(L0.x, L0.y, W, H) / 0.56;
  const parts = particles();
  await frames(1.15, (k, t, dt) => {
    resetCtx(soft);
    resetCtx(fx);
    const c = E.out3(clamp(k / 0.85, 0, 1));
    const up = E.sio(k);
    const x = lerp(L0.x, W * 0.5, up * 0.5);
    const y = lerp(L0.y, H * 0.16, up);
    const r = lerp(R0, size * 0.12, c);
    soft.g.globalAlpha = 1 - smooth(0.7, 1, k);
    soft.g.fillStyle = bloomGradient(soft.g, x, y, r, { tint });
    soft.g.fillRect(0, 0, W, H);
    const ps = size * (0.5 + 0.6 * c) * (1 - smooth(0.75, 1, k));
    if (ps > 0.5) {
      fx.g.globalCompositeOperation = 'lighter';
      fx.g.globalAlpha = 0.9 * (1 - smooth(0.8, 1, k));
      fx.g.drawImage(spark(), x - ps, y - ps, ps * 2, ps * 2);
      fx.g.globalCompositeOperation = 'source-over';
    }
    if (k > 0.45 && k < 0.92 && Math.random() < (low ? 0.3 : 0.6)) {
      parts.add({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, grav: 30, s: 1.5 + Math.random() * 2.5, max: 0.5 + Math.random() * 0.5 });
    }
    parts.step(dt);
    parts.draw(fx.g);
  });
}

/* ==================================================================== sun */
let sunPath = null;
function getSunPath() {
  if (sunPath) return sunPath;
  const p = new Path2D();
  try {
    const svg = html(sunEmblem({ glow: false }));
    for (const ray of svg.querySelectorAll('.sun-rays path')) {
      const m = /rotate\(([-\d.]+)/.exec(ray.getAttribute('transform') || '');
      const mtx = new DOMMatrix().rotate(m ? Number(m[1]) : 0);
      p.addPath(new Path2D(ray.getAttribute('d')), mtx);
    }
  } catch (e) {
    console.warn('[transition] sun rays', e);
  }
  const disc = new Path2D();
  disc.arc(0, 0, 43.5, 0, TAU);
  p.addPath(disc);
  sunPath = p;
  return p;
}

async function sun(el, swap, o) {
  const { W, H } = viewport();
  const low = o.low;
  const L = canvasLayer(el, crispDpr(o));
  const dark = darkFor(o);
  const g = L.g;
  const path = getSunPath();
  const hp = handoffXY(o);
  const c1 = hp || { x: W / 2, y: H * 0.46 };
  const c2 = { x: W / 2, y: H * 0.46 };
  const S1 = (farthest(c1.x, c1.y, W, H) / 43.5) * 1.04;
  const S2 = (farthest(c2.x, c2.y, W, H) / 43.5) * 1.04;
  const sMin = Math.min(W, H) / 640; // the sun is still clearly a sun at this size
  const bg = (cx, cy) => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.7);
    gr.addColorStop(0, rgba(mixRgb(dark, [90, 54, 70], 0.22)));
    gr.addColorStop(1, rgba(mixRgb(dark, [0, 0, 0], 0.35)));
    return gr;
  };
  const paint = (cx, cy, s, rot, rimA, glint) => {
    resetCtx(L);
    g.fillStyle = bg(cx, cy);
    g.fillRect(0, 0, W, H);
    if (s > 0.0005) {
      const cs = Math.cos(rot) * s;
      const sn = Math.sin(rot) * s;
      g.setTransform(L.s * cs, L.s * sn, -L.s * sn, L.s * cs, L.s * cx, L.s * cy);
      g.globalCompositeOperation = 'destination-out';
      g.fill(path);
      g.globalCompositeOperation = 'source-over';
      if (rimA > 0.01) {
        g.lineJoin = 'round';
        if (!low) {
          g.globalAlpha = rimA * 0.16;
          g.strokeStyle = rgba(GOLD);
          g.lineWidth = 9 / s;
          g.stroke(path);
        }
        g.globalAlpha = rimA * 0.9;
        g.strokeStyle = rgba(GOLD_HI);
        g.lineWidth = 1.5 / s;
        g.stroke(path);
        g.globalAlpha = 1;
      }
      g.setTransform(L.s, 0, 0, L.s, 0, 0);
    }
    if (glint > 0.01) {
      g.globalCompositeOperation = 'lighter';
      const r = 26 + 40 * glint;
      g.globalAlpha = glint;
      g.drawImage(spark(), cx - r, cy - r, r * 2, r * 2);
      // a soft four-point twinkle
      g.globalAlpha = glint * 0.8;
      g.fillStyle = rgba(CREAM);
      g.save();
      g.translate(cx, cy);
      g.rotate(0.3);
      for (let i = 0; i < 4; i++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(0, -1.4);
        g.lineTo(r * 0.78, 0);
        g.lineTo(0, 1.4);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  };
  // log-space zoom reads as a steady camera move; the small sun lingers just long enough to be seen
  const CLOSE = 1.12;
  sfx(o, 'whoosh', { duration: 1.0 });
  await frames(CLOSE, (k) => {
    const e = E.io2(clamp(k / 0.84, 0, 1));
    let s = S1 * Math.pow(sMin / S1, e);
    if (k > 0.84) s = sMin * (1 - E.in2((k - 0.84) / 0.16));
    if (k >= 1) s = 0;
    paint(c1.x, c1.y, s, -0.5 * E.io2(k), smooth(0, 0.25, k) * (1 - smooth(0.92, 1, k)), smooth(0.88, 1, k));
  });
  sfx(o, 'chime');
  await frames(0.2, (k) => paint(c1.x, c1.y, 0, 0, 0, 1 - E.sio(k) * 0.4));
  await swap();
  await frames(1.2, (k) => {
    const e = E.io2(k);
    const s = S2 * Math.pow(sMin / S2, 1 - e);
    const gl = k < 0.25 ? 0.6 * (1 - k / 0.25) : 0;
    paint(lerp(c1.x, c2.x, E.out2(k)), lerp(c1.y, c2.y, E.out2(k)), s, -0.5 - 0.6 * e, (1 - smooth(0.55, 1, k)), gl);
  });
}

/* ================================================================= ribbon */
async function ribbon(el, swap, o) {
  const { W, H } = viewport();
  const low = o.low;
  const portrait = H > W;
  const D = Math.hypot(W, H);
  const dark = darkFor(o);
  const veil = canvasLayer(el, low ? 0.35 : 0.5);
  const host = document.createElement('div');
  host.className = 'tr-host';
  el.appendChild(host);
  const width = portrait ? 2.3 : 2.8;
  const rib = createRibbon(host, {
    strands: low ? 3 : 6, width, glow: 1.15, particles: true, device: o.device, samples: low ? 150 : 240,
    zoomWidth: 0.6, zoomGlow: 0.9,
  });
  try {
    const hp = handoffXY(o);
    const start = hp || { x: -W * 0.06, y: H * (portrait ? 0.7 : 0.66) };
    const dir = start.x > W * 0.6 ? -1 : 1; // travel away from the side it entered
    const X = (f) => (dir > 0 ? W * f : W * (1 - f));
    // 1 — a single strand enters and moves gracefully across
    const enter = [
      start,
      { x: lerp(start.x, X(0.3), 0.6), y: lerp(start.y, H * 0.62, 0.6) },
      { x: X(0.48), y: H * 0.56 },
      { x: X(0.7), y: H * 0.62 },
      { x: X(0.9), y: H * 0.48 },
      { x: X(1.16), y: H * 0.34 },
    ];
    // 2 — the strands weave into one big sweeping path with a loop at its heart
    const loopC = { x: X(0.5), y: H * 0.45 };
    const lr = Math.min(W, H) * (portrait ? 0.28 : 0.24);
    const woven = [
      { x: X(-0.12), y: H * 0.86 },
      { x: X(0.22), y: H * 0.74 },
      { x: loopC.x + dir * lr * 1.1, y: loopC.y + lr * 0.55 },
      { x: loopC.x + dir * lr * 1.05, y: loopC.y - lr * 0.6 },
      { x: loopC.x, y: loopC.y - lr * 1.05 },
      { x: loopC.x - dir * lr * 0.9, y: loopC.y - lr * 0.2 },
      { x: loopC.x - dir * lr * 0.2, y: loopC.y + lr * 0.55 },
      { x: loopC.x + dir * lr * 0.9, y: loopC.y + lr * 0.25 },
      { x: X(0.92), y: H * 0.2 },
      { x: X(1.2), y: H * 0.06 },
    ];
    rib.setPath(enter);
    rib.set({ split: 0, trail: 0.5, twist: 1, spread: 1.15 });
    rib.flow(true);
    sfx(o, 'shimmer');
    rib.draw({ duration: 1.05, ease: 'power1.inOut', from: 0, to: 0.72, trail: 0.5 });
    // the camera glides along the woven path (path coords) as it dives in
    const wovenS = sampleSpline(woven, 120);
    const along = (f) => wovenS[clamp(Math.round(f * (wovenS.length - 1)), 0, wovenS.length - 1)];
    let morphing = false;
    let whooshed = false;
    const COVER = 2.05;
    await frames(COVER, (k, t) => {
      if (t > 0.55 && !morphing) {
        morphing = true;
        rib.morph(woven, { duration: 1.1, lag: 0.5, swirl: 0.16 });
        rib.tween('split', 1, 0.9);
        rib.tween('width', width * 1.35, 1.0);
        rib.tween('twist', 1.7, 1.1);
        rib.draw({ duration: 1.0, ease: 'power2.inOut', from: rib.progress, to: 1 });
        rib.tween('trail', 1, 1.0, 'power2.inOut');
      }
      if (t > 1.15 && !whooshed) { whooshed = true; sfx(o, 'whoosh', { duration: 1.2 }); }
      // the camera: we fly along the ribbon into its loop
      const cam = E.in2(clamp((t - 1.12) / (COVER - 1.12), 0, 1));
      if (cam > 0) {
        const f = along(0.42 + 0.2 * cam);
        rib.view({ x: f.x, y: f.y, ax: lerp(f.x, W / 2, E.out2(Math.min(1, cam * 1.6))), ay: lerp(f.y, H / 2, E.out2(Math.min(1, cam * 1.6))), scale: 1 + (low ? 4 : 6.5) * cam, rotate: -0.42 * cam * dir });
      }
      // golden light floods the frame as we arrive
      resetCtx(veil);
      const v = E.in2(clamp((t - 1.25) / (COVER - 1.25), 0, 1));
      const pre = 0.28 * E.sio(clamp(t / 1.0, 0, 1));
      veil.g.fillStyle = rgba(dark, pre * (1 - v));
      veil.g.fillRect(0, 0, W, H);
      if (v > 0) {
        veil.g.globalAlpha = v;
        veil.g.fillStyle = lightGradient(veil.g, W / 2, H / 2, D * 0.62, { tint: GOLD, dark: mixRgb(dark, [150, 70, 70], 0.4) });
        veil.g.fillRect(0, 0, W, H);
        veil.g.globalAlpha = 1;
      }
    });
    // the opening follows the ribbon's on-screen shape at the moment of the swap:
    // the longest run of the path that is on (or near) the screen, smoothed
    const runs = [];
    let run = [];
    for (let i = 0; i <= 240; i++) {
      const p = rib.pointAt(i / 240);
      if (p.x > -W * 0.35 && p.x < W * 1.35 && p.y > -H * 0.35 && p.y < H * 1.35) run.push(p);
      else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    let best = runs.sort((a, b) => b.length - a.length)[0] || [];
    if (best.length < 6) best = [{ x: -W * 0.2, y: H * 0.78 }, { x: W * 0.5, y: H * 0.52 }, { x: W * 1.2, y: H * 0.22 }];
    const thin = best.filter((_, i) => i % 6 === 0 || i === best.length - 1);
    // extend both ends past the frame so the opening never shows a rounded cap
    const ext = (a, b) => ({ x: a.x + (a.x - b.x) * 4, y: a.y + (a.y - b.y) * 4 });
    if (thin.length >= 2) {
      thin.unshift(ext(thin[0], thin[1]));
      thin.push(ext(thin[thin.length - 1], thin[thin.length - 2]));
    }
    const open = sampleSpline(thin, 120);
    const openPath = new Path2D();
    open.forEach((p, i) => (i ? openPath.lineTo(p.x, p.y) : openPath.moveTo(p.x, p.y)));
    await swap();
    el.style.mixBlendMode = 'screen';
    sfx(o, 'shimmer');
    rib.fade(0, 0.75, 'power1.in');
    const REVEAL = 1.25;
    await frames(REVEAL, (k) => {
      const cam = E.out2(k);
      rib.view({ scale: 1 + (low ? 4 : 6.5) + 5 * cam, rotate: (-0.42 - 0.18 * cam) * dir });
      resetCtx(veil);
      const g = veil.g;
      g.globalAlpha = 1 - smooth(0.7, 1, k);
      g.fillStyle = lightGradient(g, W / 2, H / 2, D * 0.62, { tint: GOLD, dark: mixRgb(dark, [150, 70, 70], 0.4) });
      g.fillRect(0, 0, W, H);
      const w = Math.max(0.5, D * 1.5 * E.in2(k) + D * 0.12 * E.out2(k));
      const blur = (18 + D * 0.08 * k) * veil.s;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // a soft golden rim along the opening…
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba(mixRgb(GOLD, AMBER, 0.3));
      g.shadowColor = rgba(GOLD, 0.9);
      g.shadowBlur = blur;
      g.globalAlpha = 0.55 * (1 - k);
      g.lineWidth = w + 30;
      g.stroke(openPath);
      // …and the opening itself, feathered
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = '#000';
      g.shadowColor = '#000';
      g.globalAlpha = 1;
      g.lineWidth = w;
      g.stroke(openPath);
      g.shadowBlur = 0;
      g.shadowColor = 'transparent';
      g.globalCompositeOperation = 'source-over';
    });
  } finally {
    rib.destroy();
  }
}

/* ================================================================= petals */
const PETAL_COLORS = {
  rose: [[233, 143, 176], [255, 217, 230]],
  blush: [[242, 167, 195], [255, 236, 240]],
  cream: [[240, 214, 184], [255, 248, 236]],
  gold: [[232, 176, 79], [255, 231, 173]],
};
function petalSprite(kind, blur) {
  const key = `petal:${kind}:${blur}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const size = blur ? 128 : 96;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const [deep, light] = PETAL_COLORS[kind];
  const s = size * (blur ? 0.3 : 0.44);
  const shape = (ox) => {
    g.beginPath();
    g.moveTo(ox, s);
    g.bezierCurveTo(ox + s * 0.6, s * 0.55, ox + s * 0.8, -s * 0.25, ox + s * 0.48, -s * 0.8);
    g.quadraticCurveTo(ox + s * 0.26, -s * 1.04, ox, -s * 0.84);
    g.quadraticCurveTo(ox - s * 0.26, -s * 1.04, ox - s * 0.48, -s * 0.8);
    g.bezierCurveTo(ox - s * 0.8, -s * 0.25, ox - s * 0.6, s * 0.55, ox, s);
    g.closePath();
  };
  g.translate(size / 2, size / 2);
  if (blur) {
    // out of focus: draw only the soft shadow of the petal
    g.shadowColor = rgba(mixRgb(deep, light, 0.55), 0.9);
    g.shadowBlur = size * 0.12;
    g.shadowOffsetX = 4000;
    shape(-4000);
    g.fill();
  } else {
    const gr = g.createLinearGradient(0, s, 0, -s);
    gr.addColorStop(0, rgba(deep));
    gr.addColorStop(0.55, rgba(mixRgb(deep, light, 0.6)));
    gr.addColorStop(1, rgba(light));
    g.fillStyle = gr;
    shape(0);
    g.fill();
    const hl = g.createRadialGradient(-s * 0.15, -s * 0.3, 0, -s * 0.15, -s * 0.3, s * 0.8);
    hl.addColorStop(0, 'rgba(255,255,255,.35)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fill();
    g.strokeStyle = rgba(mixRgb(deep, [120, 60, 80], 0.2), 0.25);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, s * 0.92);
    g.quadraticCurveTo(s * 0.06, 0, 0, -s * 0.7);
    g.stroke();
  }
  spriteCache.set(key, c);
  return c;
}

async function petals(el, swap, o) {
  const { W, H } = viewport();
  const low = o.low;
  const veil = canvasLayer(el, low ? 0.35 : 0.5);
  const L = canvasLayer(el, crispDpr(o));
  const g = L.g;
  const dark = darkFor(o);
  const unit = Math.min(W, H) / 400;
  const hp = handoffXY(o);
  const kinds = ['rose', 'blush', 'cream', 'gold', 'rose', 'blush'];
  const n = low ? 24 : 46;
  // a gust: petals swirl in around a moving eye (bottom-left → centre → top-right)
  const eye = (t) => ({
    x: lerp(hp ? hp.x : -W * 0.15, W * 1.15, smooth(0, 1, t)),
    y: lerp(hp ? hp.y : H * 0.92, -H * 0.1, smooth(0, 1, t)) + Math.sin(t * Math.PI) * H * 0.04,
  });
  const ps = [];
  for (let i = 0; i < n; i++) {
    const layer = i % 9 === 0 ? 2 : i % 4 === 0 ? 0 : 1; // 2 = near & out of focus, 0 = far & soft
    ps.push({
      kind: kinds[i % kinds.length],
      layer,
      size: unit * (layer === 2 ? 95 + Math.random() * 80 : layer === 0 ? 13 + Math.random() * 9 : 22 + Math.random() * 30),
      r0: Math.min(W, H) * (0.12 + Math.pow(Math.random(), 0.8) * 0.8),
      th: Math.random() * TAU,
      w: (1.6 + Math.random() * 1.6) * (Math.random() < 0.8 ? 1 : -1),
      delay: Math.random() * 0.35,
      flip: Math.random() * TAU,
      vf: 3 + Math.random() * 4,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 3,
      a: layer === 2 ? 0.55 : layer === 0 ? 0.7 : 0.95,
    });
  }
  ps.sort((a, b) => a.layer - b.layer);
  const TOTAL = 2.4;
  const SWAP = 1.15;
  const draw = (time) => {
    resetCtx(L);
    for (const p of ps) {
      const tt = clamp((time - p.delay) / (TOTAL - 0.35), 0, 1);
      if (tt <= 0 || tt >= 1) continue;
      const e = eye(tt);
      const th = p.th + p.w * time;
      const rr = p.r0 * (0.55 + 0.45 * Math.sin(Math.PI * tt)) * (p.layer === 2 ? 1.3 : 1);
      const x = e.x + Math.cos(th) * rr;
      const y = e.y + Math.sin(th) * rr * 0.62 + time * 18 * unit;
      const flip = Math.cos(p.flip + p.vf * time);
      const fadeIn = smooth(0, 0.12, tt) * (1 - smooth(0.88, 1, tt));
      g.globalAlpha = p.a * fadeIn;
      g.save();
      g.translate(x, y);
      g.rotate(p.rot + p.vr * time);
      g.scale(0.35 + 0.65 * Math.abs(flip), 1);
      const img = petalSprite(p.kind, p.layer === 2 || (p.layer === 0 && !low));
      const sz = p.size * (p.layer === 2 ? 1.7 : 1.2);
      g.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      g.restore();
    }
    g.globalAlpha = 1;
  };
  const wash = (time, k) => {
    resetCtx(veil);
    const vg = veil.g;
    const e = eye(clamp(time / (TOTAL - 0.35), 0, 1));
    const R = Math.hypot(W, H) * 1.05;
    const gr = vg.createRadialGradient(e.x, e.y, 0, e.x, e.y, R);
    gr.addColorStop(0, rgba([255, 241, 232]));
    gr.addColorStop(0.3, rgba([247, 207, 200]));
    gr.addColorStop(0.55, rgba([232, 167, 185]));
    gr.addColorStop(0.8, rgba(mixRgb([140, 92, 160], dark, 0.35)));
    gr.addColorStop(1, rgba(mixRgb([90, 52, 120], dark, 0.5)));
    vg.globalAlpha = k;
    vg.fillStyle = gr;
    vg.fillRect(0, 0, W, H);
    vg.globalAlpha = 1;
  };
  sfx(o, 'whoosh', { duration: 1.4 });
  await frames(SWAP, (k, t) => {
    wash(t, E.in2(clamp((t - 0.25) / (SWAP - 0.25), 0, 1)));
    draw(t);
  });
  await swap();
  await frames(TOTAL - SWAP, (k, tt) => {
    const t = SWAP + tt;
    // the wash clears behind the gust, from where it came
    wash(t, 1);
    const vg = veil.g;
    const from = eye(0);
    const R = Math.hypot(W, H) * 1.4;
    const r = Math.max(1, R * E.io2(k));
    const hole = vg.createRadialGradient(from.x, from.y, 0, from.x, from.y, r);
    hole.addColorStop(0, 'rgba(0,0,0,1)');
    hole.addColorStop(0.62, 'rgba(0,0,0,1)');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    vg.globalCompositeOperation = 'destination-out';
    vg.fillStyle = hole;
    vg.fillRect(0, 0, W, H);
    vg.globalCompositeOperation = 'source-over';
    draw(t);
  });
}

/* =================================================================== dust */
function valueNoise(gw, gh, seed, cells) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const octave = (n) => {
    const gx = n + 1;
    const gy = Math.ceil((n * gh) / gw) + 1;
    const grid = new Float32Array(gx * gy).map(() => rnd());
    return { gx, gy, grid, n };
  };
  const octs = [octave(cells), octave(cells * 2), octave(cells * 4)];
  const out = new Float32Array(gw * gh);
  const fade = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let v = 0;
      let amp = 1;
      let tot = 0;
      for (const o of octs) {
        const fx = (x / gw) * o.n;
        const fy = (y / gw) * o.n;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fade(fx - ix);
        const ty = fade(fy - iy);
        const i00 = o.grid[iy * o.gx + ix] ?? 0;
        const i10 = o.grid[iy * o.gx + ix + 1] ?? 0;
        const i01 = o.grid[(iy + 1) * o.gx + ix] ?? 0;
        const i11 = o.grid[(iy + 1) * o.gx + ix + 1] ?? 0;
        v += amp * lerp(lerp(i00, i10, tx), lerp(i01, i11, tx), ty);
        tot += amp;
        amp *= 0.5;
      }
      out[y * gw + x] = v / tot;
    }
  }
  // normalise to 0..1
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of out) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn || 1);
  return out;
}

async function dust(el, swap, o) {
  const { W, H } = viewport();
  const low = o.low;
  const gw = Math.round(clamp(W / (low ? 6 : 3.6), 48, low ? 120 : 220));
  const gh = Math.max(8, Math.round((gw * H) / W));
  const mask = document.createElement('canvas');
  mask.className = 'tr-layer tr-smooth';
  mask.width = gw;
  mask.height = gh;
  el.appendChild(mask);
  const mg = mask.getContext('2d');
  const img = mg.createImageData(gw, gh);
  const fx = canvasLayer(el, crispDpr(o));
  const dark = darkFor(o);
  const darkHi = mixRgb(dark, [70, 60, 120], 0.25);
  const hp = handoffXY(o);
  const origin = hp || { x: W / 2, y: H / 2 };
  const maxD = farthest(origin.x, origin.y, W, H);
  const field = (seed, fromCentre) => {
    const nz = valueNoise(gw, gh, seed, 4);
    const out = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const px = ((x + 0.5) / gw) * W;
        const py = ((y + 0.5) / gh) * H;
        const d = Math.hypot(px - (fromCentre ? W / 2 : origin.x), py - (fromCentre ? H / 2 : origin.y)) / (fromCentre ? Math.hypot(W, H) / 2 : maxD);
        // cover spreads out from the handoff point; the new world condenses from the centre outward
        out[y * gw + x] = 0.62 * nz[y * gw + x] + 0.38 * (fromCentre ? 1 - clamp(d, 0, 1) : clamp(d, 0, 1));
      }
    }
    return out;
  };
  const coverF = field(1234 + ((Math.random() * 1e6) | 0), false);
  const revealF = field(98765 + ((Math.random() * 1e6) | 0), true);
  const parts = particles();
  const data = img.data;
  const EDGE = 0.026;
  // covered where field < thr; a golden burning edge where field ≈ thr
  const paint = (F, thr, edgeA) => {
    for (let i = 0, j = 0; i < F.length; i++, j += 4) {
      const v = F[i];
      const a = smooth(v - 0.02, v + 0.02, thr);
      const d = (v - thr) / EDGE;
      const eg = Math.exp(-d * d) * edgeA * 0.85;
      const base = mixRgb(dark, darkHi, v);
      const al = Math.max(a, eg);
      if (al < 0.003) { data[j + 3] = 0; continue; }
      const r = (base[0] * a + 255 * eg) / al;
      const gg = (base[1] * a + 196 * eg) / al;
      const b = (base[2] * a + 104 * eg) / al;
      data[j] = Math.min(255, r);
      data[j + 1] = Math.min(255, gg);
      data[j + 2] = Math.min(255, b);
      data[j + 3] = Math.min(255, al * 255);
    }
    mg.putImageData(img, 0, 0);
  };
  const emit = (F, thr, count, inward) => {
    for (let n = 0, tries = 0; n < count && tries < count * 30; tries++) {
      const i = (Math.random() * F.length) | 0;
      if (Math.abs(F[i] - thr) > 0.022) continue;
      n++;
      const x = ((i % gw) + Math.random()) / gw * W;
      const y = (((i / gw) | 0) + Math.random()) / gh * H;
      if (inward) {
        // condensing: motes drift in and settle where the world appears
        const a = Math.random() * TAU;
        const r = 18 + Math.random() * 40;
        parts.add({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.4, vy: -Math.sin(a) * r * 1.4, drag: 2.2, s: 1.6 + Math.random() * 3, max: 0.5 + Math.random() * 0.45 });
      } else {
        parts.add({ x, y, vx: (Math.random() - 0.5) * 30, vy: -18 - Math.random() * 46, grav: -16, drag: 0.8, s: 1.8 + Math.random() * 4.2, max: 0.8 + Math.random() * 1.0, a: 0.95 });
      }
    }
  };
  const rate = low ? 90 : 230;
  sfx(o, 'sparkle');
  const COVER = 1.1;
  await frames(COVER, (k, t, dt) => {
    const thr = lerp(0.02, 1.04, E.sio(k));
    paint(coverF, thr, 1 - smooth(0.85, 1, k));
    if (k < 0.95) emit(coverF, thr, Math.round(rate * dt * 2.2), false);
    resetCtx(fx);
    parts.step(dt);
    parts.draw(fx.g);
  });
  paint(coverF, 1.2, 0);
  await swap();
  sfx(o, 'shimmer');
  await frames(1.25, (k, t, dt) => {
    // still covered where field < thr; thr falls, so the highest values (the centre) open first
    const thr = lerp(0.97, -0.06, E.sio(k));
    paint(revealF, thr, 1 - smooth(0.85, 1, k));
    if (k < 0.92) emit(revealF, thr, Math.round(rate * dt * 1.6), true);
    resetCtx(fx);
    parts.step(dt);
    parts.draw(fx.g);
  });
}

/* =================================================================== page */
function paintParchment(g, W, H, ox, low) {
  // one deterministic sheet, so every strip of the page agrees
  let s = 20270103;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  g.save();
  g.translate(-ox, 0);
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#f6e7c8');
  base.addColorStop(0.5, '#f2dfbb');
  base.addColorStop(1, '#ead2a6');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W * 0.55, H * 0.45, Math.min(W, H) * 0.2, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(255,248,230,.5)');
  vg.addColorStop(0.7, 'rgba(214,180,128,0)');
  vg.addColorStop(1, 'rgba(160,112,62,.42)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // the binding side is a touch darker
  const bind = g.createLinearGradient(0, 0, W * 0.12, 0);
  bind.addColorStop(0, 'rgba(120,80,40,.28)');
  bind.addColorStop(1, 'rgba(120,80,40,0)');
  g.fillStyle = bind;
  g.fillRect(0, 0, W * 0.12, H);
  if (!low) {
    // fibres & foxing
    for (let i = 0; i < 420; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      g.globalAlpha = 0.04 + rnd() * 0.06;
      g.fillStyle = rnd() < 0.5 ? '#9a7040' : '#fffaf0';
      g.fillRect(x, y, 1 + rnd() * 2.5, 0.6 + rnd());
    }
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = 20 + rnd() * 60;
      const f = g.createRadialGradient(x, y, 0, x, y, r);
      f.addColorStop(0, 'rgba(170,120,60,.07)');
      f.addColorStop(1, 'rgba(170,120,60,0)');
      g.globalAlpha = 1;
      g.fillStyle = f;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }
  // a storybook frame: double rule with small corner curls
  const m = Math.min(W, H) * 0.06;
  g.strokeStyle = 'rgba(150,104,48,.55)';
  g.lineWidth = 1.4;
  g.strokeRect(m, m, W - 2 * m, H - 2 * m);
  g.lineWidth = 0.8;
  g.strokeRect(m + 6, m + 6, W - 2 * m - 12, H - 2 * m - 12);
  const curl = (x, y, sx, sy) => {
    g.beginPath();
    g.moveTo(x + sx * 4, y + sy * 26);
    g.bezierCurveTo(x + sx * 4, y + sy * 8, x + sx * 8, y + sy * 4, x + sx * 26, y + sy * 4);
    g.moveTo(x + sx * 12, y + sy * 12);
    g.arc(x + sx * 15, y + sy * 15, 3.2, 0, TAU);
    g.stroke();
  };
  curl(m + 6, m + 6, 1, 1);
  curl(W - m - 6, m + 6, -1, 1);
  curl(m + 6, H - m - 6, 1, -1);
  curl(W - m - 6, H - m - 6, -1, -1);
  // the sun emblem, lightly inked, at the heart of the page
  const size = Math.min(W, H) * 0.0021;
  g.translate(W / 2, H * 0.47);
  g.scale(size, size);
  g.globalAlpha = 0.55;
  g.strokeStyle = '#a8742f';
  g.lineWidth = 1.1 / size;
  g.stroke(getSunPath());
  g.beginPath();
  g.arc(0, 0, 31, 0, TAU);
  g.stroke();
  g.globalAlpha = 0.12;
  g.fillStyle = '#c98f2b';
  g.fill(getSunPath());
  g.restore();
}

async function page(el, swap, o) {
  const { W, H } = viewport();
  const low = o.low;
  const dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.5);
  const book = document.createElement('div');
  book.className = 'tr-book';
  book.style.perspective = `${Math.round(Math.max(W, H) * 1.7)}px`;
  const shade = document.createElement('div');
  shade.className = 'tr-pshade';
  book.appendChild(shade);
  // the leaf: 3 nested strips so it can curl as it lifts
  const cuts = low ? [0, 1] : [0, 0.58, 0.84, 1];
  let parent = book;
  const strips = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const x0 = cuts[i] * W;
    const w = (cuts[i + 1] - cuts[i]) * W;
    const s = document.createElement('div');
    s.className = 'tr-strip';
    s.style.width = `${Math.ceil(w) + (i < cuts.length - 2 ? 1 : 0)}px`;
    s.style.left = i === 0 ? '0px' : `${Math.floor(cuts[i] * W - cuts[i - 1] * W)}px`;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round((Math.ceil(w) + 1) * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    paintParchment(g, W, H, x0, low);
    const light = document.createElement('i');
    light.className = 'tr-plight';
    s.append(cv, light);
    parent.appendChild(s);
    strips.push({ el: s, light });
    parent = s;
  }
  el.appendChild(book);
  // θ: 0 = flat on the frame, -1 = lifted away to the left (×100°)
  const pose = (lift) => {
    const base = -100 * lift;
    const curlA = low ? 0 : Math.sin(Math.PI * clamp(lift * 1.15, 0, 1)) * 34;
    const angles = [base, -curlA * 0.6, -curlA];
    let abs = 0;
    strips.forEach((s, i) => {
      const a = angles[i] || 0;
      abs += a;
      s.el.style.transform = `rotateY(${a.toFixed(2)}deg)`;
      // light: pages darken as they tilt away; a soft sheen near the curl
      const tilt = Math.abs(Math.sin((abs * Math.PI) / 180));
      s.light.style.opacity = String(clamp(tilt * 0.55, 0, 0.6));
    });
    shade.style.opacity = String(0.5 * Math.sin(Math.PI * clamp(lift, 0, 1)));
  };
  // cover: the page swings down onto the frame and settles
  sfx(o, 'pageTurn');
  pose(1);
  await frames(0.95, (k) => {
    const e = E.out2(k);
    pose(1 - e);
  });
  pose(0);
  await sleep(0.1);
  await swap();
  sfx(o, 'pageTurn');
  // reveal: it lifts from the free edge, curls and turns away
  await frames(1.25, (k) => pose(E.io2(k)));
}

/* ================================================================ registry */
const MODERN = { ember, lantern, sun, ribbon, petals, dust, page };

function legacyRunner(style) {
  return async (el, swap, o) => {
    gsap().killTweensOf(el);
    el.style.mixBlendMode = '';
    await style.cover(el, o);
    await swap();
    await style.reveal(el, o);
  };
}

function cleanup(el) {
  try { gsap()?.killTweensOf(el); } catch { /* ignore */ }
  el.replaceChildren();
  el.style.opacity = '0';
  for (const p of ['background', 'mixBlendMode', 'maskImage', 'webkitMaskImage', 'transform', 'filter', 'perspective']) el.style[p] = '';
  el.style.removeProperty('--r');
  el.classList.remove('tr-on');
  el.removeAttribute('data-type');
}

function deviceOf(o) {
  const d = o.device || {};
  const root = document.documentElement;
  const reduced = d.reducedMotion ?? (root.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const low = d.tier === 'low' || !!d.lowPower || (!o.device && root.classList.contains('low-power'));
  return { device: { ...d, reducedMotion: !!reduced }, reduced: !!reduced, low };
}

let running = Promise.resolve();

/**
 * Play a film transition. `swap` (async) is called exactly once, while the
 * frame is fully covered. Resolves when the reveal is done and #transition is clean.
 */
export function transition(type, swap, opts = {}) {
  const el = document.getElementById('transition');
  const run = async () => {
    const env = deviceOf(opts);
    // inherit from opts (not a copy) so main.js's lazy `letterbox` getter is read when needed
    const o = Object.create(opts || null);
    Object.assign(o, { device: env.device, low: env.low, reduced: env.reduced });
    let swapped = false;
    const doSwap = async () => {
      if (swapped) return;
      swapped = true;
      try { await swap?.(); } catch (e) { console.error('[transition] swap failed', e); }
    };
    if (!el) { await doSwap(); return; }
    let play;
    if (type === 'none') play = (e, s) => s();
    else if (o.reduced) play = crossfade;
    else if (MODERN[type]) play = MODERN[type];
    else play = legacyRunner(LEGACY[type] || LEGACY.fade);
    cleanup(el);
    if (MODERN[type] && !o.reduced) {
      el.classList.add('tr-on');
      el.dataset.type = type;
      el.style.opacity = '1';
    }
    try {
      await play(el, doSwap, o);
    } catch (e) {
      console.error(`[transition] ${type}`, e);
    } finally {
      if (!swapped) await doSwap();
      cleanup(el);
    }
  };
  const p = running.then(run, run);
  running = p.catch(() => {});
  return p;
}

/** The transition types this module knows. */
export const TRANSITIONS = ['fade', 'glow', 'iris', 'curtain', 'dream', 'lantern', 'sun', 'ribbon', 'ember', 'petals', 'dust', 'page'];
