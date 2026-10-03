// Chapter — "7,305 Days → The Last Lantern" (the climax).
//
// One continuous shot that begins exactly where the previous chapter ends: a black
// screen and a single golden point at its centre.
//   1 · 7,305 days — the point becomes the head of the golden ribbon and draws her
//       timeline; one point of light for every year, then every month, then every day.
//   2 · the lantern sky — the days lift off the line and become far lanterns; quiet;
//       one lantern, another, another, hundreds, thousands; her photographs drift up
//       as photo-lanterns and turn into stars; the camera rises until the whole frame
//       is sky; the lanterns gather into a faint heart.
//   3 · "20" — the ribbon writes 20, it glows, becomes a constellation, the stars
//       become lanterns, and the lanterns rise away to reveal HAPPY 20TH BIRTHDAY + her name.
//   4 · every photograph returns, orbiting the title.
//   5 · the last words; a handwritten line; → "One last thing".
import * as THREE from 'three';
import { createLanternField, createPhotoLantern } from '../core/lanternfield.js';
import { createRibbon, ribbonPaths } from '../core/ribbon.js';
import { flourishSVG } from '../core/art.js';
import {
  clamp, lerp, rnd, easeSine, sstep, lifeSpan, splitCount, fmtCount, timelinePath, photoPool,
} from './birthday/util.js';
import { createSky, createStarfield, createDays, createStarSprites } from './birthday/world.js';
import { createOrbit } from './birthday/orbit.js';

const DEG = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GOLDS = ['#f4c463', '#ffe3a3', '#ffb347', '#e8a94c', '#f7d58a'];

let live = null;

export default {
  id: 'birthday',
  title: 'The Last Lantern',
  async enter(ctx, el) {
    const S = build(ctx, el);
    live = S;
    await S.play();
  },
  async exit() {
    if (live) live.dispose();
    live = null;
  },
};

function build(ctx, el) {
  const { gsap, audio, fx, ui, device } = ctx;
  const reduced = !!device.reducedMotion;
  const tier = device.tier || 'mid';
  const low = tier === 'low';
  const T = ctx.text.birthday || {};
  const life = lifeSpan(ctx.site, ctx.daysAlive());
  const sfx = (n) => { try { audio.sfx(n); } catch { /* sound is optional */ } };
  const wait = (s) => ctx.wait(s);

  /* ---------------------------------------------------------------- DOM */
  el.innerHTML = `
    <canvas class="gl bd-gl" aria-hidden="true"></canvas>
    <div class="bd-rib" aria-hidden="true"></div>
    <div class="bd-seed" aria-hidden="true"></div>
    <div class="bd-hush" aria-hidden="true"></div>
    <div class="bd-orbit" role="group" aria-label="Her photographs"></div>
    <div class="bd-slot" aria-live="polite"></div>
    <div class="bd-title" aria-hidden="true">
      <h1 class="bd-big"></h1>
      <div class="bd-orn"></div>
      <div class="bd-name"></div>
    </div>
    <div class="bd-words" aria-live="polite"></div>
    <div class="bd-closing"></div>`;
  const $ = (s) => el.querySelector(s);
  const canvas = $('.bd-gl');
  const ribLayer = $('.bd-rib');
  const seedEl = $('.bd-seed');
  const hushEl = $('.bd-hush');
  const orbitEl = $('.bd-orbit');
  const slotEl = $('.bd-slot');
  const titleEl = $('.bd-title');
  const bigEl = $('.bd-big');
  const ornEl = $('.bd-orn');
  const nameEl = $('.bd-name');
  const wordsEl = $('.bd-words');
  const closingEl = $('.bd-closing');

  const cleanups = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
  const tweens = [];
  const tw = (target, vars) => { const t = gsap.to(target, vars); tweens.push(t); return t; };
  const twFrom = (target, from, to) => { const t = gsap.fromTo(target, from, to); tweens.push(t); return t; };

  let W = el.clientWidth || window.innerWidth;
  let H = el.clientHeight || window.innerHeight;
  let phase = 0;

  // the golden point the previous chapter ended on (fallback: the centre), as a fraction of the stage
  const start = (() => {
    const inc = ctx.incoming;
    if (!inc || !Number.isFinite(inc.x) || !Number.isFinite(inc.y)) return { u: 0.5, v: 0.5 };
    const r = el.getBoundingClientRect();
    return { u: clamp((inc.x - r.left) / (W || 1), 0.05, 0.95), v: clamp((inc.y - r.top) / (H || 1), 0.05, 0.95) };
  })();
  seedEl.style.left = `${(start.u * 100).toFixed(3)}%`;
  seedEl.style.top = `${(start.v * 100).toFixed(3)}%`;
  fx.dust({ density: 0, alpha: 0 }); // a clean black frame (the sky's dust comes back with the lanterns)

  /* ---------------------------------------------------------------- renderer */
  const pr = Math.min(window.devicePixelRatio || 1, low ? 1 : device.mobile ? 1.6 : 1.75);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.5, 9000);
  camera.rotation.order = 'YXZ';

  const size2 = new THREE.Vector2();
  const U = {
    uTime: { value: 0 },
    uPx: { value: pr },
    uViewScale: { value: 600 },
    uReveal: { value: 0 },
    uWarm: { value: 0 },
    uGold: { value: 0 },
    uStars: { value: 0 },
    syncView: (r, s, cam) => {
      r.getDrawingBufferSize(size2);
      U.uViewScale.value = size2.y * 0.5 * cam.projectionMatrix.elements[5];
    },
  };

  /* ---------------------------------------------------------------- camera */
  let tanV = 0.55;
  let halfV = 29 * DEG;
  let halfH = 15 * DEG;
  const cam = {
    y0: 30, y1: reduced ? 30 : 86,
    p0: (reduced ? 13 : 3.5) * DEG,
    p1: (reduced ? 13 : 33) * DEG,
    t0: Infinity, dur: 30,
    sway: reduced ? 0 : 1,
  };
  const rigAt = (t, out = {}) => {
    const k = easeSine(clamp((t - cam.t0) / cam.dur, 0, 1));
    out.y = lerp(cam.y0, cam.y1, k);
    out.pitch = lerp(cam.p0, cam.p1, k);
    return out;
  };
  const rig = {};
  function placeCamera(t) {
    rigAt(t, rig);
    const s = cam.sway;
    camera.position.set(Math.sin(t * 0.09) * 0.8 * s, rig.y + Math.sin(t * 0.13) * 0.35 * s, 0);
    camera.rotation.set(rig.pitch + Math.sin(t * 0.11) * 0.0035 * s, Math.sin(t * 0.07) * 0.006 * s, 0);
    camera.updateMatrixWorld();
  }

  function fit() {
    W = el.clientWidth || window.innerWidth;
    H = el.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W < H ? (W / H < 0.55 ? 62 : 58) : 46;
    camera.updateProjectionMatrix();
    halfV = (camera.fov / 2) * DEG;
    tanV = Math.tan(halfV);
    halfH = Math.atan(tanV * camera.aspect);
    if (!reduced) cam.p1 = halfV + 4.5 * DEG;
  }
  fit();
  placeCamera(0);

  const _v = V();
  const _f = V();
  /** World point on the camera ray through screen (x, y) (CSS px), `depth` units in front of the camera plane. */
  function screenToWorld(x, y, depth, out = V()) {
    camera.updateMatrixWorld();
    _v.set((x / W) * 2 - 1, -(y / H) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    camera.getWorldDirection(_f);
    return out.copy(camera.position).addScaledVector(_v, depth / Math.max(0.05, _v.dot(_f)));
  }
  const _p = V();
  function worldToScreen(p) {
    _p.copy(p).project(camera);
    return { x: (_p.x + 1) * 0.5 * W, y: (1 - _p.y) * 0.5 * H, z: _p.z };
  }

  /* ---------------------------------------------------------------- world */
  const sky = createSky(scene, U);
  const stars = createStarfield(scene, U, low ? 800 : tier === 'high' ? 2200 : 1500);
  const days = createDays(scene, U, { days: Math.min(40000, life.days), months: life.months, years: life.years, device });
  const sprites = createStarSprites(scene, U, 96);
  const CAP = { high: 2000, mid: 1300, low: 500 }[tier] || 1300;
  const SPARE = 110; // the first three, the heart's spares, the "20", her taps
  const field = createLanternField({
    scene, camera, renderer, device, max: CAP + SPARE,
    haze: { near: 180, far: 2400, color: '#e98448' }, wind: [0.3, -0.16],
  });
  const B = CAP - 10;

  /* ---------------------------------------------------------------- photos */
  const pool = photoPool(ctx);
  // the last photographs: her featured ones circle the title (in film order); the photo-lanterns
  // that rise before it are other photos, one chapter after another, so nothing repeats back to back
  const featuredPool = pool.filter((p) => p.featured);
  const otherPool = pool.filter((p) => !p.featured);
  const lanternPool = otherPool.length >= 3 ? otherPool : pool;
  const PL_MAX = Math.min(lanternPool.length, { high: 7, mid: 5, low: 3 }[tier] || 5);
  // a calm last frame: her best photographs (featured and special ones first), not all of them
  const ORBIT_MAX = { high: 14, mid: 12, low: 9 }[tier] || 12;
  const orbitPhotos = [...featuredPool, ...otherPool.filter((p) => !lanternPool.slice(0, PL_MAX).includes(p))].slice(0, ORBIT_MAX);
  for (const p of orbitPhotos) ctx.preload(p.thumbUrl || p.url); // warm the cache for the last beat

  /* ---------------------------------------------------------------- loop */
  let time = 0;
  let raf = 0;
  let disposed = false;
  let orbit = null;
  const t0 = performance.now();
  let last = t0;
  const pls = [];
  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    time = (now - t0) / 1000;
    U.uTime.value = time;
    placeCamera(time);
    sky.mesh.position.copy(camera.position);
    stars.object.position.copy(camera.position);
    field.update(time, dt);
    updatePhotoLanterns();
    sprites.update();
    if (orbit) orbit.update(time, dt);
    if (phase === 1 && seedFollow) {
      const h = rib.head();
      seedEl.style.left = `${h.x}px`;
      seedEl.style.top = `${h.y}px`;
    }
    renderer.render(scene, camera);
  }

  /* ---------------------------------------------------------------- ribbon */
  // (a chapter-essential thread: settings.theme.ribbon only switches off the decorative ones)
  const rib = createRibbon(ribLayer, { strands: 5, width: 1.7, glow: 0.8, spread: 0.8, blend: 'screen', device });
  let rib20 = null;
  let seedFollow = false;
  let tl = null;

  function layoutTimeline() {
    tl = timelinePath(W, H, { x: start.u * W, y: start.v * H });
    el.style.setProperty('--line-y', `${Math.round(tl.y0)}px`);
    const tmp = V();
    days.layout((u, off) => screenToWorld(tl.xOf(u), tl.yOf(u) + off, 100, tmp), Math.max(4.5, Math.min(W, H) * 0.0145));
  }

  on(window, 'resize', () => {
    fit();
    placeCamera(time);
    if (phase === 1 && tl) {
      layoutTimeline();
      rib.setPath(tl.path);
    }
    layoutTitle();
  });

  /* ---------------------------------------------------------------- words in the slot above the line */
  function wordsInto(node, text) {
    node.textContent = '';
    const spans = [];
    String(text).split(/(\s+)/).forEach((w) => {
      if (!w) return;
      if (/^\s+$/.test(w)) { node.appendChild(document.createTextNode(' ')); return; }
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      node.appendChild(s);
      spans.push(s);
    });
    return spans;
  }
  const inVars = (o = {}) => (reduced
    ? [{ opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'sine.out', ...o }]
    : [{ opacity: 0, y: 14, filter: 'blur(9px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3, ease: 'power3.out', ...o }]);
  const outVars = (o = {}) => (reduced
    ? { opacity: 0, duration: 0.8, ease: 'sine.in', ...o }
    : { opacity: 0, y: -10, filter: 'blur(8px)', duration: 0.95, ease: 'power2.in', ...o });

  /** A line of text in the slot above the timeline: returns { out() }. */
  function say(text, cls = '') {
    const node = document.createElement('p');
    node.className = `bd-line ${cls}`;
    const spans = wordsInto(node, ctx.fill(text));
    slotEl.appendChild(node);
    const [a, b] = inVars({ stagger: reduced ? 0 : 0.08 });
    twFrom(spans, a, b);
    return {
      node,
      out: () => new Promise((r) => { tw(node, { ...outVars(), onComplete: () => { node.remove(); r(); } }); }),
    };
  }

  let countNode = null;
  /** "20 years." → a numeral (Cinzel Decorative) over its word (italic serif). Cross-fades with the previous one. */
  function showCount(raw, n, unitFallback) {
    const sc = splitCount(ctx.fill(raw || ''));
    const node = document.createElement('div');
    node.className = 'bd-count';
    if (sc || !raw) {
      node.innerHTML = '<span class="bd-num"></span><span class="bd-unit"></span>';
      node.firstChild.textContent = fmtCount(n);
      node.lastChild.textContent = sc ? sc.rest : unitFallback;
    } else {
      node.innerHTML = '<span class="bd-unit"></span>';
      node.firstChild.textContent = ctx.fill(raw);
    }
    slotEl.appendChild(node);
    const prev = countNode;
    countNode = node;
    if (prev) tw(prev, { ...outVars({ duration: 1.1 }), onComplete: () => prev.remove() });
    const [a, b] = inVars({ stagger: reduced ? 0 : 0.28, duration: 1.6, delay: prev ? 0.45 : 0 });
    twFrom(node.children, a, b);
  }
  async function hideCount() {
    const node = countNode;
    countNode = null;
    if (!node) return;
    await new Promise((r) => tw(node, { ...outVars({ duration: 1.1 }), onComplete: () => { node.remove(); r(); } }));
  }

  /* ================================================================ 1 · 7,305 days */
  async function partDays() {
    phase = 1;
    audio.setMood('quiet');
    layoutTimeline();
    rib.setPath(tl.path);
    rib.set({ head: 0 });
    await wait(reduced ? 1.2 : 1.9); // the golden point breathes once
    const T1 = reduced ? 4.2 : 6.4; // the line itself (time passes at a steady rate)
    const T1e = reduced ? T1 * 0.6 : T1; // the ribbon shortens its own motion when reduced
    const f0 = tl.startFrac;
    sfx('shimmer');
    seedFollow = true;
    tw(seedEl, { opacity: 0, scale: 0.4, duration: reduced ? 0.8 : 1.3, ease: 'sine.in' });
    // the point swings down into the first day…
    await rib.draw({ from: 0, to: f0, duration: reduced ? 2 : 2.8, ease: 'sine.inOut' });
    seedFollow = false;
    // …and the line: a year lights up each time the head passes one, while the lead-in withdraws
    days.uniforms.uAppear.value.x = time;
    days.uniforms.uSweep.value.x = T1e;
    const line = rib.draw({ from: f0, to: 1, duration: T1, ease: 'none' });
    rib.tween('start', f0 * 0.99, T1e * 0.55, 'sine.inOut');
    await wait(T1e * 0.42);
    showCount(T.years, life.years, 'years.');
    sfx('chime');
    await line;
    // the ribbon settles into a quiet axis, so the points of light on it can be seen
    rib.fade(0.55, 2.4);
    rib.tween('spread', 0.5, 2.4);
    rib.tween('glow', 0.62, 2.4);
    await wait(reduced ? 1.6 : 2.2);

    // months: a line of its own only if the owner wrote one; otherwise their lights come in with the days
    const monthsLine = typeof T.months === 'string' ? T.months.trim() : '';
    days.uniforms.uAppear.value.y = time;
    days.uniforms.uSweep.value.y = reduced ? 1.6 : 2.6;
    rib.flow(true);
    if (monthsLine) {
      showCount(T.months, life.months, 'months.');
      sfx('sparkle');
      await wait(reduced ? 3 : 3.8);
    }

    // days: first the lights, one for every day of her life, filling the thread…
    days.uniforms.uAppear.value.z = time;
    days.uniforms.uSweep.value.z = reduced ? 2 : 3.6;
    sfx('sparkle');
    if (!monthsLine) await hideCount();
    await wait(reduced ? 1.6 : 2.8);
    // …and only then what they are
    showCount(T.days, life.days, 'days.');
    await wait(reduced ? 3.2 : 4.2);
    rib.flow(false);
    await hideCount();
    await wait(0.4);

    // countless memories: moments catch light along the thread, one after another
    const mem = say(T.memories || 'Countless memories.');
    sfx('magic');
    ignite(0.18, 0.5);
    ignite(0.52, 1.2);
    ignite(0.83, 1.9);
    ignite(0.36, 2.7);
    rib.tween('glow', 1.0, 1.6);
    await wait(reduced ? 3 : 3.8);
    rib.tween('glow', 0.62, 1.6);
    await mem.out();
    await wait(0.3);

    const a = say(T.somehow || 'And somehow…', 'is-soft');
    await wait(reduced ? 2.2 : 2.8);
    await a.out();
    await wait(0.2);
    // the end of the thread brightens: it isn't the end at all
    const b = say(T.beginning || T.interesting || 'this is only the beginning.');
    ignite(0.985, 0.6);
    rib.tween('glow', 1.15, 2.2);
    await wait(reduced ? 3.4 : 4.4);
    rib.tween('glow', 0.62, 1.6);
    await b.out();
  }

  let ignSlot = 0;
  function ignite(u, delay) {
    const k = ignSlot++ % 3;
    const at = () => {
      if (disposed) return;
      const D = days.uniforms;
      if (k === 0) { D.uIgn.value.x = u; D.uIgn.value.y = time; } else if (k === 1) { D.uIgn.value.z = u; D.uIgn.value.w = time; } else { D.uIgn2.value.x = u; D.uIgn2.value.y = time; }
      if (tl) fx.sparkle(tl.xOf(u), tl.yOf(u), low ? 5 : 9, { spread: 22 });
    };
    const id = setTimeout(at, delay * 1000);
    cleanups.push(() => clearTimeout(id));
  }

  /* ================================================================ 2 · the lantern sky */
  const az = (f = 1) => (Math.random() * 2 - 1) * halfH * f;
  const tmpRig = {};
  /** A world point `d` ahead (horizontally) at azimuth `a`, at height `y` or elevation `e` as seen from the camera at time t. */
  const aim = (t, { d, a = 0, e = 0, y = null }) => {
    const r = rigAt(t, tmpRig);
    return { x: Math.sin(a) * d, y: y != null ? y : r.y + Math.tan(e) * d, z: -Math.cos(a) * d };
  };
  const fromSea = (dMin, dMax, f = 1) => (k, birth) => {
    const d = rnd(dMin, dMax);
    return { ...aim(birth, { d, a: az(1.12 * f), y: rnd(-4, 2) }), speed: rnd(1.4, 2.5) * (1 + d / 1100), scale: rnd(1.9, 2.6) * (d > 900 ? 1.15 : 1) };
  };
  const fromSky = (dMin, dMax, lo = -0.85, hi = 0.95, final = false) => (k, birth) => {
    const d = rnd(dMin, dMax);
    const r = rigAt(birth, tmpRig);
    const e = Math.max(1.5 * DEG, (final ? cam.p1 : r.pitch) + rnd(lo, hi) * halfV);
    return { ...aim(birth, { d, a: az(1.1), e }), speed: rnd(1.6, 3.0) * (1 + d / 900), scale: rnd(2.0, 2.9) * (d > 900 ? 1.18 : 1), brightness: rnd(0.72, 1.05) };
  };
  const fromNear = (k, birth) => {
    const r = rigAt(birth, tmpRig);
    const side = Math.random() < 0.5 ? -1 : 1;
    const d = rnd(18, 42);
    return { ...aim(birth, { d, a: side * rnd(0.35, 1.0) * halfH, y: r.y - d * tanV * rnd(0.75, 1.05) }), speed: rnd(0.9, 1.6), scale: rnd(1.6, 2.1), brightness: rnd(1.0, 1.2) };
  };

  // where each day goes in the sky: left days to the left, spread up to the top of the final view
  const skyTarget = (i, kind, u) => {
    const d = rnd(480, 2600);
    const a = (u * 2 - 1) * halfH * 1.25 + rnd(-0.07, 0.07);
    const e = rnd(0.8 * DEG, cam.p1 + halfV * 0.92);
    return V(Math.sin(a) * d, cam.y0 + Math.tan(e) * d * 0.92, -Math.cos(a) * d);
  };

  async function partSky() {
    phase = 2;
    const lines = Array.isArray(T.lanterns) ? T.lanterns : [];
    // the days lift off the line and become far-away lanterns; the ribbon dissolves into dust
    days.lift(time + 0.4, skyTarget, { sweep: reduced ? 3.5 : 5.5, travel: reduced ? [9, 14] : [12, 20], rise: [0.3, 1.2] });
    sfx('shimmer');
    rib.dissolve({ duration: reduced ? 1.8 : 3 });
    tw(U.uReveal, { value: 1, duration: reduced ? 6 : 10, ease: 'sine.inOut', delay: 0.6 });
    tw(U.uStars, { value: 1, duration: 12, ease: 'sine.inOut', delay: 2.5 });
    const dustId = setTimeout(() => !disposed && fx.dust({ density: low ? 0.18 : 0.28, alpha: 0.55, speed: 0.5 }), 4000);
    cleanups.push(() => clearTimeout(dustId));
    audio.setMood('wonder');
    let l0 = null;
    if (lines[0]) { await wait(1.2); l0 = say(lines[0]); }
    await wait(4.4);
    if (l0) l0.out();
    await wait(1.4);

    // quiet. one lantern…
    field.release(aim(field.time, { d: 52, a: 0.12 * halfH, y: cam.y0 - 52 * tanV * 0.72 }), { speed: 1.55, scale: 2.2, brightness: 1.25, warmth: 0.1, keep: true });
    sfx('lanternRise');
    await wait(3.6);
    // …another…
    field.release(aim(field.time, { d: 95, a: -0.5 * halfH, y: cam.y0 - 95 * tanV * 0.55 }), { speed: 1.9, scale: 2.3, brightness: 1.2, keep: true });
    sfx('lanternRise');
    await wait(2.6);
    // …another
    field.release(aim(field.time, { d: 150, a: 0.58 * halfH, y: rnd(-2, 1) }), { speed: 2.3, scale: 2.4, brightness: 1.15, keep: true });
    await wait(1.6);
    let l1 = null;
    if (lines[1]) l1 = say(lines[1]);
    // a few
    field.wave({ count: 7, start: 0.6, spread: 4, from: fromSea(110, 420, 0.8), brightness: [1, 1.15] });
    await wait(2.4);

    // hundreds — and the camera begins to rise with them
    cam.t0 = time + 0.5;
    cam.dur = reduced ? 1 : 24;
    const hund = Math.round(B * 0.22);
    field.wave({ count: Math.round(hund * 0.6), start: 0, spread: 11, curve: 0.6, from: fromSea(100, 1500) });
    field.wave({ count: Math.round(hund * 0.4), start: 1.5, spread: 11, curve: 0.6, from: fromSky(300, 1600, -0.9, 0.3) });
    field.wave({ count: Math.round(B * (reduced ? 0.01 : 0.022)), start: 1, spread: reduced ? 30 : 20, from: fromNear }); // (passed by the rising camera)
    playPhotoLanterns().catch(() => {});
    await wait(3);
    if (l1) l1.out();
    await wait(2.4);

    // thousands
    audio.setMood('soar');
    const thou = Math.round(B * 0.58);
    // (they light up all over the sky the camera is rising into, nearer ones brighter)
    field.wave({ count: Math.round(thou * 0.45), start: 0, spread: 16, curve: 0.7, from: fromSky(140, 1300, -0.95, 0.9, true) });
    field.wave({ count: Math.round(thou * 0.25), start: 2, spread: 16, curve: 0.8, from: fromSky(500, 2000, -0.6, 1.0, true) });
    field.wave({ count: Math.round(thou * 0.3), start: 0, spread: 16, curve: 0.8, from: fromSea(160, 1500) });
    // and the sky keeps breathing for the rest of the chapter
    const tr = Math.round(B * 0.12);
    field.wave({ count: tr, start: 16, spread: 110, from: fromSky(200, 1600, -1.1, 0.4, true) });
    tw(U.uWarm, { value: reduced ? 0.5 : 1, duration: 22, ease: 'sine.inOut' }); // (with a still camera the horizon stays in view)
    await wait(Math.max(4, cam.t0 + cam.dur - time + 0.3)); // the camera has come to rest

    // (no heart here: the photo heart a chapter ago is the heart of the film; the sky just breathes)
    await wait(reduced ? 1.6 : 3.2);
  }

  /* ---------------- her photographs, rising as photo-lanterns and turning into stars */
  const cR = V();
  const cU = V();
  const cF = V();
  async function playPhotoLanterns() {
    if (!PL_MAX) return;
    const portrait = H > W;
    for (let k = 0; k < PL_MAX; k++) {
      if (disposed) return;
      const photo = lanternPool[k];
      const pl = createPhotoLantern(photo, { size: 4.4, device });
      let ok = false;
      try {
        ok = await Promise.race([pl.ready.then(() => !pl.failed), wait(3.5).then(() => pl.isReady())]);
      } catch (e) { pl.dispose(); throw e; }
      if (disposed) { pl.dispose(); return; }
      if (!ok) { pl.dispose(); continue; }
      scene.add(pl);
      const target = portrait ? W * 0.32 : Math.min(W * 0.16, H * 0.28);
      const depth = (pl.size.outerW * (H / 2)) / (tanV * target);
      const side = k % 2 === 0 ? 1 : -1;
      const xs = side * (portrait ? W * 0.17 : W * 0.25) + rnd(-0.03, 0.03) * W;
      const halfY = depth * tanV;
      const s = {
        pl,
        born: time,
        life: reduced ? 8 : 10,
        depth,
        xv: (xs / (H / 2)) * halfY,
        y0: -halfY - pl.size.outerH * 0.75,
        y1: halfY * (portrait ? 0.42 : 0.3),
        starred: false,
      };
      pls.push(s);
      await wait(reduced ? 4.2 : 3.5);
    }
  }
  function updatePhotoLanterns() {
    if (!pls.length) return;
    cR.setFromMatrixColumn(camera.matrixWorld, 0);
    cU.setFromMatrixColumn(camera.matrixWorld, 1);
    cF.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    for (let i = pls.length - 1; i >= 0; i--) {
      const s = pls[i];
      const age = time - s.born;
      const k = clamp(age / s.life, 0, 1);
      const y = lerp(s.y0, s.y1, 1 - Math.pow(1 - k, 1.5));
      const sway = reduced ? 0 : Math.sin(age * 0.5 + s.depth) * 0.25;
      s.pl.position.copy(camera.position).addScaledVector(cF, s.depth).addScaledVector(cR, s.xv + sway).addScaledVector(cU, y);
      const a = sstep(0, 1.6, age) * (1 - sstep(s.life - 1.8, s.life, age));
      s.pl.setOpacity(a);
      s.pl.update(time, camera);
      if (!s.starred && age > s.life - 1.6) {
        s.starred = true;
        becomeStar(s.pl.position);
      }
      if (age > s.life) {
        s.pl.dispose();
        pls.splice(i, 1);
      }
    }
  }
  function becomeStar(pos) {
    const sp = worldToScreen(pos);
    const star = sprites.add({ p: screenToWorld(sp.x, sp.y, 2600), size: 30, a: 0, hue: 0.15 });
    if (!star) return;
    sfx('sparkle');
    tw(star, { a: 1.5, size: 54, duration: 0.7, ease: 'power2.out' });
    tw(star, { a: 0.85, size: 26, duration: 2.6, delay: 0.7, ease: 'sine.inOut' });
  }

  /* ================================================================ 3 · "20" */
  const titleCenterY = () => (H > W ? H * 0.41 : H * 0.44);

  async function partTwenty() {
    phase = 3;
    tw(cam, { sway: 0, duration: 2.5, ease: 'sine.inOut' });
    const fieldI = { v: 1 };
    tw(fieldI, { v: 0.78, duration: 4, ease: 'sine.inOut', onUpdate: () => field.setIntensity(fieldI.v) });
    await wait(reduced ? 0.8 : 1.6);

    const cy = titleCenterY();
    const bw = Math.min(W * 0.74, H * 0.34 * 1.75);
    const bh = bw / 1.75;
    const pts = ribbonPaths.twenty({ x: W / 2 - bw / 2, y: cy - bh / 2, w: bw, h: bh });
    rib20 = createRibbon(ribLayer, { strands: 6, width: 2.6, glow: 1.15, blend: 'screen', device });
    rib20.setPath(pts);
    rib20.set({ head: 0 });
    sfx('magic');
    // every memory a strand; tonight they all lead here
    if (T.strands) ui.narrate([T.strands], { position: 'bottom', hold: reduced ? 2.4 : 3.4 }).catch(() => {});
    await rib20.draw({ duration: reduced ? 3.4 : 4.6, ease: 'sine.inOut' });
    // it glows
    sfx('chime');
    rib20.flow(true);
    rib20.tween('glow', 2, 1.4);
    rib20.tween('width', 3.1, 1.4);
    await wait(reduced ? 1.4 : 2.2);

    // it becomes a constellation: stars along the stroke, the ribbon thins to fine lines between them
    const len = rib20.length();
    const K = clamp(Math.round(len / Math.max(24, Math.min(W, H) * 0.072)), 18, 40);
    const D20 = 300;
    const worldPts = [];
    const starList = [];
    for (let k = 0; k < K; k++) {
      const p = rib20.pointAt(k / (K - 1));
      const w = screenToWorld(p.x, p.y, D20);
      worldPts.push(w);
      const s = sprites.add({ p: screenToWorld(p.x, p.y, D20 + 4), size: 22, a: 0, hue: k % 5 === 2 ? 0.6 : 0.1 });
      if (s) {
        starList.push(s);
        tw(s, { a: 1.25, size: rnd(20, 30), duration: 0.6, delay: 0.1 + (k / K) * 1.8, ease: 'power2.out' });
      }
    }
    rib20.flow(false);
    rib20.tween('width', 0.8, 2.2);
    rib20.tween('glow', 0.35, 2.2);
    rib20.tween('split', 0, 2.2);
    rib20.fade(0.6, 2.2);
    setTimeout(() => !disposed && sfx('sparkle'), 400);
    await wait(reduced ? 2.2 : 3);

    // the constellation becomes lanterns: the nearest lanterns in the sky drift into the stars;
    // if there are too few, new ones ignite right below them
    sfx('lanternRise');
    const formed = field.formShape(worldPts, { duration: reduced ? 3.2 : 4.2, stagger: 0.35, spawn: true });
    for (const s of starList) tw(s, { a: 0, size: 12, duration: 2.6, delay: 0.9 + Math.random() * 0.8, ease: 'sine.in' });
    rib20.fade(0, 3);
    const idx20 = await formed;
    for (const s of starList) sprites.remove(s);
    rib20.destroy();
    rib20 = null;
    await wait(reduced ? 1.4 : 2.4);

    // …and the lanterns rise away. A breath of silence, then her title
    field.releaseShape({ indices: idx20, speed: [2.6, 4.4] });
    audio.duck(0, reduced ? 1.6 : 2.6, 1.2);
    await wait(reduced ? 1.6 : 3);
    await reveal();
  }

  /* ---------------- the title */
  function buildTitle() {
    const big = ctx.fill(T.big || 'Happy 20th Birthday');
    bigEl.textContent = '';
    big.split(/\s+/).filter(Boolean).forEach((word, i) => {
      if (i) bigEl.appendChild(document.createTextNode(' '));
      const w = document.createElement('span');
      w.className = 'bd-word';
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'ch';
        c.textContent = ch;
        w.appendChild(c);
      }
      bigEl.appendChild(w);
    });
    bigEl.setAttribute('aria-label', big);
    const name = ctx.fill(T.name || '{name}').trim();
    nameEl.innerHTML = '<span class="bd-name-in"></span>';
    nameEl.firstChild.textContent = name;
    ornEl.innerHTML = flourishSVG({ className: 'bd-orn-svg' });
    titleEl.setAttribute('aria-hidden', 'false');
  }

  /** Fit the title to the screen: every word on one line, the whole block inside its share of the height. */
  function layoutTitle() {
    if (!titleEl.classList.contains('is-built')) return;
    const cy = titleCenterY();
    el.style.setProperty('--title-y', `${Math.round(cy)}px`);
    titleEl.style.setProperty('--fit', '1');
    bigEl.style.fontSize = '';
    nameEl.style.fontSize = '';
    const maxW = W * 0.88;
    for (let k = 0; k < 8; k++) {
      const widest = Math.max(...[...bigEl.querySelectorAll('.bd-word')].map((w) => w.getBoundingClientRect().width), 1);
      if (widest <= maxW) break;
      const fs = parseFloat(getComputedStyle(bigEl).fontSize);
      bigEl.style.fontSize = `${Math.floor(fs * (maxW / widest) * 0.98)}px`;
    }
    const inner = nameEl.firstChild;
    for (let k = 0; k < 8; k++) {
      const r = inner.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(nameEl).fontSize);
      const sw = r.width / (W * 0.9);
      const sh = r.height / (H * 0.4); // (the box includes room for the swashes)
      const s = Math.max(sw, sh);
      if (s <= 1) break;
      nameEl.style.fontSize = `${Math.floor(fs / s * 0.98)}px`;
    }
    // the block stays clear of the top and bottom
    const r = titleEl.getBoundingClientRect();
    const room = Math.min(cy - 12, H - cy - 12) * 2;
    titleEl.style.setProperty('--fit', r.height > room ? String((room / r.height).toFixed(3)) : '1');
    if (orbit) orbit.layout({ W, H, cx: W / 2, cy, clear: titleClear() });
    updateZones();
  }
  function titleClear() {
    const r = titleEl.getBoundingClientRect();
    return r.height ? { hw: r.width / 2, hh: r.height / 2 } : null;
  }

  function rectOf(node, pad = 0, floor = 0.1) {
    if (!node || !node.isConnected) return null;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const host = el.getBoundingClientRect();
    return { x0: r.left - host.left - pad, y0: r.top - host.top - pad, x1: r.right - host.left + pad, y1: r.bottom - host.top + pad, floor };
  }
  function updateZones() {
    if (!orbit) return;
    const zs = [];
    const b = rectOf(bigEl, 6, 0);
    const n = rectOf(nameEl.firstChild, -4, 0); // its padding is only room for the swashes
    if (b) zs.push(b);
    if (n) zs.push(n);
    if (wordsEl.childElementCount) zs.push(rectOf(wordsEl.lastElementChild, 10, 0));
    if (closingEl.textContent) zs.push(rectOf(closingEl, 10, 0));
    orbit.zones(zs);
  }

  async function reveal() {
    phase = 4;
    buildTitle();
    titleEl.classList.add('is-built');
    layoutTitle();
    const chars = [...bigEl.querySelectorAll('.ch')];
    const mid = (chars.length - 1) / 2;
    gsap.set(chars, { opacity: 0 });
    gsap.set(nameEl, { '--wipe': '-30%', opacity: 1 });
    gsap.set(ornEl, { opacity: 0 });
    titleEl.style.visibility = 'visible';

    audio.setMood('soar');
    sfx('choir');
    tw(hushEl, { opacity: 1, duration: 2.4, ease: 'sine.inOut' });
    twFrom(chars, reduced ? { opacity: 0 } : { opacity: 0, y: 16, filter: 'blur(10px)', scale: 1.12 }, {
      opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, duration: reduced ? 1.4 : 1.8, ease: 'power3.out',
      stagger: (i) => Math.abs(i - mid) * (reduced ? 0.02 : 0.055),
    });
    twFrom(ornEl, { opacity: 0 }, { opacity: 1, duration: 1.4, delay: 1.1 });
    const paths = ornEl.querySelectorAll('path');
    if (paths.length && !reduced) twFrom(paths, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1.8, delay: 1.1, ease: 'power2.inOut', stagger: 0.05 });
    // her name is written in light, left to right
    tw(nameEl, { '--wipe': '130%', duration: reduced ? 2 : 3.2, delay: 1.5, ease: 'sine.inOut' });
    setTimeout(() => !disposed && sfx('bells'), 2100);
    celebrate().catch(() => {});
    await wait(reduced ? 3.6 : 4.8);
    tw(cam, { sway: reduced ? 0 : 0.6, duration: 4, ease: 'sine.inOut' });
  }

  async function celebrate() {
    await wait(1.4);
    const portrait = H > W;
    const spots = portrait
      ? [[0.24, 0.12, '#f4c463'], [0.76, 0.15, '#ffe3a3'], [0.5, 0.075, '#f2a7c3'], [0.3, 0.2, '#ffb347']]
      : [[0.16, 0.2, '#f4c463'], [0.84, 0.22, '#ffe3a3'], [0.3, 0.1, '#f2a7c3'], [0.7, 0.12, '#f4c463'], [0.5, 0.07, '#fff4e0']];
    const n = reduced ? 1 : low ? 3 : portrait ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const [x, y, color] = spots[i % spots.length];
      fx.firework({ x: W * x, y: H * y, color });
      if (i === 1 && !reduced) {
        const c = low ? 14 : 24;
        fx.confetti({ x: -10, y: H + 10, angle: -62, spread: 26, count: c, power: 1.05, colors: GOLDS });
        fx.confetti({ x: W + 10, y: H + 10, angle: -118, spread: 26, count: c, power: 1.05, colors: GOLDS });
      }
      sfx('pop');
      await wait(rnd(0.55, 0.95));
    }
  }

  /* ================================================================ 4 · all of her photographs, once more */
  async function partOrbit() {
    if (!orbitPhotos.length) { await wait(reduced ? 3 : 4.5); return; }
    orbit = createOrbit(orbitEl, orbitPhotos, { device });
    orbit.layout({ W, H, cx: W / 2, cy: titleCenterY(), clear: titleClear() });
    updateZones();
    await wait(reduced ? 1.4 : 2.4);
    sfx('shimmer');
    const d = orbit.show({ stagger: Math.min(0.32, 4.2 / orbitPhotos.length), slowing: true }); // each a little later than the last
    await wait(Math.min(d, 4) + (reduced ? 4 : 7));
  }

  /* ================================================================ 5 · the last words */
  async function partWords() {
    const loved = (Array.isArray(T.loved) ? T.loved : []).filter(Boolean);
    const words = loved.map((l) => ctx.fill(l));
    const holds = words.map((w) => Math.max(2.6, 1.2 + w.split(/\s+/).length * 0.34));
    const total = holds.reduce((a, b) => a + b + 1.6, 0) + 2;
    audio.duck(0.62, total);
    if (orbit) tw(orbit.state, { alpha: 0.58, speed: 0.45, duration: 3, ease: 'sine.inOut' }); // the words lead now
    tw(titleEl, { opacity: 0.8, duration: 3, ease: 'sine.inOut' });
    tw(hushEl, { opacity: 0.8, duration: 3 });
    await wait(1.2);
    for (let i = 0; i < words.length; i++) {
      const node = document.createElement('p');
      node.className = 'bd-word-line';
      const spans = wordsInto(node, words[i]);
      wordsEl.appendChild(node);
      updateZones();
      const [a, b] = inVars({ stagger: reduced ? 0 : 0.07 });
      twFrom(spans, a, b);
      await wait(1.1 + holds[i]);
      await new Promise((r) => tw(node, { ...outVars(), onComplete: () => { node.remove(); r(); } }));
      updateZones();
      await wait(0.45);
    }
    // the last line, in handwriting — and it stays
    const closing = ctx.fill(T.closing || 'I’m really glad you were born. That’s the whole film.');
    closingEl.textContent = closing;
    updateZones();
    tw(titleEl, { opacity: 0.9, duration: 2.5, ease: 'sine.inOut' });
    if (orbit) tw(orbit.state, { alpha: 0.7, speed: 0.35, duration: 2.5 });
    gsap.set(closingEl, { '--wipe': '-20%', opacity: 1 });
    sfx('pageTurn');
    await new Promise((r) => tw(closingEl, { '--wipe': '125%', duration: reduced ? 1.6 : Math.min(4.2, 1.2 + closing.length * 0.045), ease: 'none', onComplete: r }));
    await wait(1.6);
  }

  /* ---------------- her taps light lanterns too */
  let lastTap = 0;
  on(el, 'pointerdown', (e) => {
    if (phase < 2 || disposed) return;
    const now = performance.now();
    if (now - lastTap < 380) return;
    lastTap = now;
    const host = el.getBoundingClientRect();
    const p = screenToWorld(e.clientX - host.left, e.clientY - host.top + 26, 70);
    field.release(p, { speed: rnd(1.3, 1.8), scale: 2.1, brightness: 1.15, warmth: rnd(-0.3, 0.7) });
    sfx('lanternRise');
  }, { passive: true });

  /* ---------------------------------------------------------------- play / dispose */
  async function play() {
    ctx.letterbox(false);
    await partDays();
    await partSky();
    await partTwenty();
    await partOrbit();
    await partWords();
    await ui.waitContinue('One last thing');
    const r = nameEl.firstChild ? nameEl.firstChild.getBoundingClientRect() : null;
    const x = r ? r.left + r.width / 2 : W / 2;
    const y = r ? r.top + r.height / 2 : H / 2;
    ctx.next({ kind: 'ember', x, y, color: '#ffd98a' });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    cleanups.splice(0).forEach((f) => { try { f(); } catch { /* ignore */ } });
    tweens.splice(0).forEach((t) => t.kill());
    gsap.killTweensOf([U.uReveal, U.uStars, U.uWarm, U.uGold, cam, ...sprites.list]);
    if (orbit) orbit.destroy();
    orbit = null;
    for (const s of pls.splice(0)) s.pl.dispose();
    try { rib.destroy(); } catch { /* ignore */ }
    if (rib20) rib20.destroy();
    rib20 = null;
    field.dispose();
    days.dispose();
    sprites.dispose();
    stars.dispose();
    sky.dispose();
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  raf = requestAnimationFrame(frame);
  return { play, dispose };
}
