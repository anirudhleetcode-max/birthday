// Chapter — "Every Little Piece of You" (the constellation).
//
// Dark space. Her photographs float at many depths, softly lit prints drifting
// and turning. They drift toward each other; golden motes begin to pass between
// them, and the golden thread travels from photograph to photograph until the
// whole collection is linked. The thread curves into a heart, the prints settle
// along it and condense into stars, and the heart beats twice. Then darkness and
// silence; one last photograph alone, a handwritten line, and the photograph
// dissolves into a single golden point at the centre of a black screen — where
// the next chapter begins.
//
// Secret: among the background stars, a tiny constellation shaped like the first
// letter of her name (constellation/secret.js).
import * as THREE from 'three';
import { buildAtlas, createCards } from './constellation/cards.js';
import { createHeart, periodicInterp } from './constellation/heart.js';
import { createThread } from './constellation/thread.js';
import { createSky } from './constellation/sky.js';
import { createSecret } from './constellation/secret.js';
import { createReveal } from './constellation/reveal.js';

const FALLBACK = {
  kicker: 'Chapter Eight',
  title: 'Every Little Piece of You',
  lines: ['On their own, they’re just moments.', 'Connect them, and look what they were making all along.'],
  handwritten: 'That’s my best friend, by the way.',
};
const CAP = { high: 40, mid: 26, low: 16 };
const D0 = 10; // camera distance to the heart plane once everything settles

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease5 = (k) => k * k * k * (k * (k * 6 - 15) + 10);
const sine = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k, 0, 1));
const rnd = (a, b) => a + Math.random() * (b - a);

/** Her photographs for the sky: real ones when there are enough, featured first, extras included, evenly sampled under the cap. */
function pickPhotos(ctx, tier, reveal) {
  const real = ctx.realPhotos();
  const base = real.length >= 8 ? real : ctx.allPhotos();
  const extras = real.length >= 8 ? ctx.extras() : [];
  const seen = new Set();
  const all = [...base, ...extras].filter((p) => p && (p.thumbUrl || p.url) && !seen.has(p.id) && seen.add(p.id));
  const pool = all.length > 1 && reveal ? all.filter((p) => p.id !== reveal.id) : all;
  const cap = CAP[tier] || CAP.mid;
  const feat = pool.filter((p) => p.featured).slice(0, cap);
  const rest = pool.filter((p) => !p.featured);
  const room = cap - feat.length;
  let pick = rest;
  if (rest.length > room) {
    pick = [];
    for (let i = 0; i < room; i++) pick.push(rest[Math.floor(((i + 0.5) * rest.length) / room)]);
  }
  return [...feat, ...pick];
}

function createChapter(ctx, el) {
  const { gsap, ui, audio, fx, device } = ctx;
  const T = { ...FALLBACK, ...(ctx.text.constellation || {}) };
  const lines = (Array.isArray(T.lines) ? T.lines : FALLBACK.lines).filter(Boolean);
  const reduced = !!device.reducedMotion;
  const tier = device.tier || 'high';
  const low = tier === 'low';
  const revealPhoto = ctx.role('reveal');
  const photos = pickPhotos(ctx, tier, revealPhoto);
  const n = photos.length;

  const listeners = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); listeners.push([t, type, fn, o]); };
  const tweens = [];
  const aborted = () => new DOMException('aborted', 'AbortError');
  /** an abortable gsap tween (resolves on complete, rejects when the chapter exits) */
  function tween(target, vars) {
    return new Promise((resolve, reject) => {
      if (ctx.signal.aborted) return reject(aborted());
      const tw = gsap.to(target, { ...vars, onComplete: resolve });
      tweens.push(tw);
      ctx.signal.addEventListener('abort', () => { tw.kill(); reject(aborted()); }, { once: true });
    });
  }

  el.innerHTML = `
    <canvas class="gl" aria-hidden="true"></canvas>
    <div class="cn-bloom" aria-hidden="true"></div>
    <div class="cn-veil" aria-hidden="true"></div>`;
  const canvas = el.querySelector('canvas');
  const bloom = el.querySelector('.cn-bloom');
  const veil = el.querySelector('.cn-veil');

  /* ---------------- renderer, camera ---------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x04030b, 1);
  renderer.toneMapping = THREE.NoToneMapping; // our shaders write display colours; her photos stay exactly as they are
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 0, D0);
  const world = new THREE.Group(); // beats with the heart
  scene.add(world);

  const heart = createHeart(900);
  const sky = createSky({ device });
  scene.add(sky.nebula, sky.group);
  const secret = createSecret({
    name: ctx.site.her && ctx.site.her.name,
    device,
    host: el,
    onFound: () => {
      ctx.eggs.found('constellation', 'Your name has always been in the stars.');
      audio.sfx('chime');
    },
  });
  scene.add(secret.group);

  const flowM = n ? (low ? 34 : tier === 'mid' ? 72 : 110) : 0;
  const sparkM = n ? (low ? 12 : tier === 'mid' ? 24 : 36) : 0;
  const cards = n ? createCards({ count: n, device, motes: flowM + sparkM }) : null;
  if (cards) world.add(cards.group);
  const thread = n ? createThread({ segments: low ? 180 : tier === 'mid' ? 240 : 300, width: 0.034, device }) : null;
  if (thread) world.add(thread.mesh);
  const reveal = createReveal(el, revealPhoto, { device, signal: ctx.signal });

  /* ---------------- layout ---------------- */
  const view = { W: 1, H: 1, portrait: true, tanH: 0.5, aspect: 1, pr, hh: 5, hw: 3 };
  const heartC = new THREE.Vector3();
  let heartW = 3;
  let baseS = 1;
  let slotS = 0.5;
  let gatherS = 0.6;
  let LOOSE = 1.12;
  let LOOSE_Y = 1.1;
  function fit() {
    const W = el.clientWidth || window.innerWidth;
    const H = el.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    const portrait = H > W * 1.05;
    camera.aspect = W / H;
    camera.fov = portrait ? (W / H < 0.56 ? 54 : 50) : 40;
    camera.updateProjectionMatrix();
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const hh = D0 * tanH;
    const hw = hh * camera.aspect;
    Object.assign(view, { W, H, portrait, tanH, aspect: camera.aspect, hh, hw });
    // a smaller heart when there are only a few photographs
    const few = n >= 8 ? 1 : 0.62 + (0.38 * Math.max(0, n - 1)) / 7;
    heartW = Math.min(2 * hw * (portrait ? 0.8 : 0.72), (2 * hh * (portrait ? 0.46 : 0.58)) / heart.height) * few;
    heartC.set(0, hh * (portrait ? 0.07 : 0.05), 0);
    LOOSE = portrait ? 1.08 : 1.24;
    LOOSE_Y = portrait ? 1.24 : 0.98;
    baseS = portrait ? 2 * hw * 0.24 : 2 * hh * 0.16;
    // gathered, they sit on a loose ring a little larger than the heart; on the heart, at their places
    const spacing = (heart.length * heartW) / Math.max(1, n);
    gatherS = clamp(spacing * LOOSE * (portrait ? 0.86 : 0.9), baseS * 0.26, baseS * 0.56);
    slotS = clamp(spacing * 0.95, baseS * 0.2, baseS * 0.6);
    gatherS = Math.max(gatherS, slotS * 1.04);
    items.forEach((it) => { it.off = spacing < slotS * 1.4 ? (it.rank % 2 ? 1 : -1) * slotS * 0.3 : 0; });
    if (cards) cards.setPixelRatio(pr);
    sky.setPixelRatio(pr);
    secret.layout(view);
    reveal.layout(W, H);
    const px = (heartW / (2 * hw)) * W;
    const bs = px * 1.9;
    Object.assign(bloom.style, { width: `${bs}px`, height: `${bs}px`, left: `${W / 2 - bs / 2}px`, top: `${H / 2 - (heartC.y / hh) * (H / 2) - bs / 2}px` });
  }

  /* ---------------- the photographs ---------------- */
  // scattered through the dark at many depths (best-candidate sampling, so they never clump),
  // featured ones nearer and larger
  const items = [];
  const placed = [];
  const landscape = (el.clientWidth || window.innerWidth) > (el.clientHeight || window.innerHeight) * 1.05;
  photos.forEach((p, k) => {
    let best = null;
    for (let c = 0; c < 26; c++) {
      const sx = rnd(-0.9, 0.9);
      const sy = rnd(landscape ? -0.64 : -0.52, 0.86);
      let d = Infinity;
      for (const q of placed) d = Math.min(d, Math.hypot((sx - q[0]) * 1.2, sy - q[1]));
      if (!best || d > best.d) best = { sx, sy, d };
    }
    placed.push([best.sx, best.sy]);
    let z = p.featured ? rnd(-1.5, 2.4) : 1.6 - 17.5 * Math.pow(Math.random(), 0.85);
    if (best.sy < (landscape ? -0.42 : -0.28) && z > -4) z = rnd(-10, -4); // nothing big near the subtitles
    items.push({
      photo: p,
      k,
      featured: !!p.featured,
      r: clamp(Number(p.ratio) || 1, 0.5, 2),
      sx: best.sx,
      sy: best.sy,
      z,
      vx: reduced ? 0 : rnd(-1, 1) * 0.0055,
      vy: reduced ? 0 : rnd(-1, 1) * 0.0035,
      sizeK: p.featured ? 1.22 : rnd(0.82, 1.12),
      rot: {
        bz: rnd(-0.12, 0.12), ax: rnd(0.05, 0.14), ay: rnd(0.16, 0.42), az: rnd(0.03, 0.08),
        fx: rnd(0.11, 0.2), fy: rnd(0.07, 0.15), fz: rnd(0.05, 0.12), px: rnd(0, 6.28), py: rnd(0, 6.28), pz: rnd(0, 6.28),
      },
      u: 0,
      off: 0,
      appearAt: Infinity,
      passAt: -1,
      seed: Math.random(),
      rect: null,
      ready: 0,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      w: 1,
      h: 1,
      opacity: 0,
      lit: 0,
      light: 0,
      star: { size: 0, alpha: 0, twinkle: 1 },
      anchor: new THREE.Vector3(),
    });
  });
  // order them around the heart by angle (clockwise from the top), so the thread circles instead of zig-zagging
  const byAngle = [...items].sort((a, b) => Math.atan2(a.sx * 1.2, a.sy - 0.08) - Math.atan2(b.sx * 1.2, b.sy - 0.08));
  // with only a few photos, the thread also passes through a few points of a loose heart between them
  const q = n ? Math.max(1, Math.ceil(12 / n)) : 1;
  const m = n * q;
  byAngle.forEach((it, rank) => { it.u = (rank * q + 0.5) / m; it.rank = rank; });
  const anchors = Array.from({ length: m }, () => new THREE.Vector3());

  /* ---------------- state (tweened by the script, read every frame) ---------------- */
  const S = { push: 0, gather: 0, motes: 0, thread: 0, heart: 0, star: 0, glow: 0, bloom: 0, atlas: 0 };
  const beats = [];
  const dd = (u) => 2 * Math.min(u - Math.floor(u), 1 - (u - Math.floor(u))); // 0 at the top of the heart, 1 at its tip
  const hkU = (u) => ease5(clamp(S.heart * 1.6 - 0.6 * dd(u), 0, 1));
  const lightU = (u) => sine(clamp(S.star * 1.5 - 0.5 * dd(u), 0, 1));

  const h2 = { x: 0, y: 0 };
  const nrm = { x: 0, y: 0 };
  function heartAt(u, out, scale = 1, z = 0, sy = 1) {
    heart.at(u, h2);
    return out.set(heartC.x + h2.x * heartW * scale, heartC.y + h2.y * heartW * scale * sy, z);
  }
  const hp = new THREE.Vector3();
  function curve(u, out) {
    if (!m) return heartAt(u, out);
    periodicInterp(anchors, u, out);
    const k = hkU(u);
    if (k > 0) out.lerp(heartAt(u, hp), k);
    return out;
  }
  const envFn = (u) => {
    const e = Math.abs(Math.sin((Math.PI * (u * m - 0.5)) / q));
    return lerp(Math.pow(e, 0.7), 0.3, hkU(u));
  };

  let t = 0; // the chapter's own clock (ambient motion)
  const beatEnv = () => {
    const now = performance.now() / 1000;
    let b = 0;
    const pulse = (x) => (x < 0 ? 0 : x < 0.08 ? x / 0.08 : Math.exp(-(x - 0.08) / 0.2));
    for (const t0 of beats) b = Math.max(b, pulse(now - t0), 0.7 * pulse(now - t0 - 0.3));
    return b;
  };

  const pS = new THREE.Vector3();
  const pL = new THREE.Vector3();
  const pG = new THREE.Vector3();
  const pH = new THREE.Vector3();
  const eul = new THREE.Euler();
  const qId = new THREE.Quaternion();
  let threadZ = -0.3;
  /** the point on the thread plane that sits exactly behind p on screen (k → 1: p itself, for the heart) */
  function toThreadPlane(p, out, k) {
    const c = camera.position;
    const f = (c.z - threadZ) / Math.max(0.1, c.z - p.z);
    const x = c.x + (p.x - c.x) * f;
    const y = c.y + (p.y - c.y) * f;
    return out.set(lerp(x, p.x, k), lerp(y, p.y, k), lerp(threadZ, p.z - 0.05, k));
  }
  function updateItems(beat) {
    const { tanH, aspect } = view;
    const g = sine(S.gather);
    const rt = reduced ? 0 : t;
    for (const it of items) {
      // drifting in the dark
      const dist = D0 - it.z;
      pS.set((it.sx + it.vx * t) * dist * tanH * aspect * 0.94, (it.sy + it.vy * t) * dist * tanH * 0.94, it.z);
      // …toward each other: onto a loose ring around where the heart will be, out of the depths
      // (each keeps some of its depth, placed so that it still lands on the ring on screen)
      const zG = it.z * 0.2;
      const kz = (D0 - zG) / D0;
      heartAt(it.u, pL, LOOSE * (1 + (it.seed - 0.5) * 0.12), 0, LOOSE_Y);
      pL.set(pL.x * kz + Math.sin(t * 0.4 + it.seed * 9) * 0.05, pL.y * kz + Math.cos(t * 0.33 + it.seed * 7) * 0.05, zG);
      pG.set(it.sx * (D0 - zG) * tanH * aspect * 0.94, it.sy * (D0 - zG) * tanH * 0.94, zG);
      pL.lerp(pG, 0.12);
      it.pos.lerpVectors(pS, pL, g);
      // …into the heart
      const hk = hkU(it.u);
      const light = lightU(it.u);
      if (hk > 0) {
        // as it turns to light it slips behind the thread (a fading print must not hide the glow)
        heartAt(it.u, pH, 1, 0.05 - 0.35 * smooth(0.45, 0.85, light));
        heart.normal(it.u, nrm);
        pH.x += nrm.x * it.off * (1 - light);
        pH.y += nrm.y * it.off * (1 - light);
        it.pos.lerp(pH, hk);
      }
      // a slow turn, settling to face us
      const R = it.rot;
      const amp = (1 - 0.5 * g) * (reduced ? 0.35 : 1);
      eul.set(
        R.ax * Math.sin(rt * R.fx + R.px) * amp,
        R.ay * Math.sin(rt * R.fy + R.py) * amp,
        (R.bz + R.az * Math.sin(rt * R.fz + R.pz)) * amp,
      );
      it.quat.setFromEuler(eul).slerp(qId, hk);
      // size: a little smaller as they gather, then the size of their place on the heart, then a star
      let s = baseS * it.sizeK;
      s = lerp(s, gatherS * (it.featured ? 1.15 : 1), g);
      s = lerp(s, slotS * (it.featured ? 1.12 : 1), hk);
      s *= 1 - 0.8 * smooth(0, 0.85, light);
      const sq = Math.sqrt(it.r);
      it.w = s * sq;
      it.h = s / sq;
      it.opacity = smooth(it.appearAt, it.appearAt + (reduced ? 1 : 2), t) * S.atlas * (it.ready ? 1 : 0); // an image that never loaded stays a star only
      // the thread touches it
      if (it.passAt < 0 && thread && thread.head >= it.u) it.passAt = t;
      const since = it.passAt < 0 ? -1 : t - it.passAt;
      it.lit = since < 0 ? 0 : smooth(0, 0.35, since) * (0.5 + 0.5 * Math.exp(-since / 1.6)) * (1 - 0.5 * hk);
      it.light = light;
      const st = it.star;
      st.alpha = smooth(0.25, 0.8, light) * (0.92 + 0.4 * beat);
      st.size = (low ? 28 : 34) * (it.featured ? 1.2 : 1) * (0.7 + 0.3 * light) * (1 + 0.4 * beat);
    }
    // the thread runs on a plane just behind every print, meeting each one behind its centre (along the
    // camera ray), so it shows between the photographs and never crosses her face
    let zMin = 0;
    for (const it of items) if (it.opacity > 0.01) zMin = Math.min(zMin, it.pos.z);
    threadZ = zMin - 0.3;
    for (const it of items) {
      toThreadPlane(it.pos, it.anchor, hkU(it.u));
    }
    // the thread's anchors in heart order (plus a few points of a loose heart when there are only a few photos)
    for (const it of items) anchors[it.rank * q].copy(it.anchor);
    if (q > 1) {
      for (let r = 0; r < n; r++) {
        const a = anchors[r * q];
        const b = anchors[((r + 1) % n) * q];
        for (let j = 1; j < q; j++) {
          const u = (r * q + j + 0.5) / m;
          heartAt(u, pL, LOOSE, 0, LOOSE_Y);
          toThreadPlane(pL, pL, 0);
          anchors[r * q + j].lerpVectors(a, b, j / q).lerp(pL, 0.6);
        }
      }
    }
  }

  // motes: golden particles drifting photo → photo along the thread, and sparks shed by its head
  const flow = Array.from({ length: flowM }, (_, i) => ({ a: i / Math.max(1, flowM) + rnd(0, 0.01), v: rnd(0.016, 0.03), ph: rnd(0, 6.28), s: rnd(2.6, 4.6) }));
  const sparks = Array.from({ length: sparkM }, () => ({ life: 1, dur: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 3 }));
  let sparkAcc = 0;
  let sparkI = 0;
  const headP = new THREE.Vector3();
  const moteOut = { a: 0, s: 0 };
  function updateMotes(dt, beat) {
    if (!cards) return;
    const head = thread ? thread.head : 0;
    const drawing = head > 0.001 && head < 1;
    if (drawing) {
      curve(Math.min(head, 0.9999), headP);
      sparkAcc += dt * (low ? 12 : 22);
      while (sparkAcc >= 1 && sparkM) {
        sparkAcc -= 1;
        const sp = sparks[sparkI++ % sparkM];
        sp.life = 0;
        sp.dur = rnd(0.8, 1.6);
        sp.p.copy(headP);
        sp.v.set(rnd(-1, 1), rnd(-1.2, 0.7), rnd(-1, 1)).multiplyScalar(0.22);
        sp.s = rnd(2.4, 4);
      }
    }
    for (const sp of sparks) {
      if (sp.life >= 1) continue;
      sp.life += dt / sp.dur;
      sp.v.multiplyScalar(1 - dt * 1.2);
      sp.p.addScaledVector(sp.v, dt);
    }
    const R = moteOut;
    cards.writeMotes((i, out) => {
      if (i < flowM) {
        if (S.motes < 0.002) { out.set(0, 0, 0); R.a = 0; R.s = 0; return R; }
        const f = flow[i];
        const u = (((f.a + f.v * t) % 1) + 1) % 1;
        curve(u, out);
        const hk = hkU(u);
        const j = 0.07 * (1 - 0.65 * hk);
        out.x += Math.sin(t * 1.3 + f.ph) * j;
        out.y += Math.cos(t * 1.1 + f.ph * 1.7) * j;
        out.z += Math.sin(t * 0.9 + f.ph * 2.3) * j;
        const ahead = u <= head ? 1 : 0.28;
        const tw = 0.6 + 0.4 * Math.sin(t * 2.6 + f.ph * 5);
        R.a = S.motes * ahead * tw * (1 + 0.6 * beat);
        R.s = f.s * (1 + 0.35 * beat);
        return R;
      }
      const sp = sparks[i - flowM];
      if (!sp || sp.life >= 1) { out.set(0, 0, 0); R.a = 0; R.s = 0; return R; }
      out.copy(sp.p);
      R.a = Math.pow(1 - sp.life, 1.5) * 0.9;
      R.s = sp.s;
      return R;
    });
  }

  /* ---------------- the loop ---------------- */
  let raf = 0;
  let running = true;
  let glOn = true;
  let lastNow = 0;
  const look = new THREE.Vector3();
  let lastBloom = '';
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = lastNow ? Math.min(0.2, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    t += dt;
    if (!glOn) return;
    const beat = beatEnv();
    // camera: a slow push-in through the dark with a little sway; settles square to the heart
    const settle = sine(S.heart);
    const drift = reduced ? 0 : 1 - settle;
    const D = reduced ? D0 : lerp(11.8, D0, sine(S.push));
    camera.position.set(Math.sin(t * 0.071) * 0.42 * drift, Math.sin(t * 0.053 + 1.3) * 0.26 * drift, D);
    look.set(camera.position.x * 0.3, camera.position.y * 0.3, 0);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    // the heart beats
    const sc = 1 + beat * (reduced ? 0.015 : 0.045);
    world.scale.setScalar(sc);
    world.position.copy(heartC).multiplyScalar(1 - sc);
    if (n) {
      updateItems(beat);
      cards.write(items, camera);
      cards.setTime(t);
      cards.setHalo(1 + 0.6 * S.glow);
      thread.setOpacity(S.thread > 0 ? 1 : 0);
      if (S.thread > 0) {
        thread.setWidth(lerp(0.05, 0.036, S.heart) * Math.max(1, (camera.position.z - threadZ) / D0));
        thread.set(curve, envFn);
      }
      thread.setHead(S.thread >= 1 ? 1.02 : S.thread);
      thread.setBright(lerp(1.15, 0.9, S.heart) + 0.45 * S.glow + 0.8 * beat);
      thread.setHalo(0.45 + 0.9 * S.glow + 1.3 * beat);
      thread.setSwell(1 + 0.3 * S.glow + 0.25 * beat);
      thread.update(t, dt);
      updateMotes(dt, beat);
    }
    const bo = clamp(S.bloom * 0.55 + beat * 0.45 * S.bloom, 0, 1).toFixed(3);
    if (bo !== lastBloom) { bloom.style.opacity = bo; lastBloom = bo; }
    sky.update(t, camera);
    secret.update(t, camera);
    renderer.render(scene, camera);
  }

  fit();
  on(window, 'resize', fit);
  raf = requestAnimationFrame(frame);

  /* ---------------- the script ---------------- */
  async function play() {
    ctx.letterbox(true);
    fx.dust({ density: 0.05, alpha: 0.45, speed: 0.4 });
    audio.setMood('quiet');
    gsap.set(veil, { opacity: 1 });
    tweens.push(gsap.to(veil, { opacity: 0, duration: reduced ? 1.2 : 3, ease: 'sine.inOut' }));
    // the prints are drawn into one atlas while the title plays
    const maxTex = renderer.capabilities.maxTextureSize || 4096;
    const atlasP = n
      ? buildAtlas(photos, { cell: low ? 240 : tier === 'mid' ? 384 : 448, maxSize: Math.min(maxTex, low ? 2048 : 4096), preload: ctx.preload, timeout: 8 })
        .then((a) => {
          if (!running) { a.texture.dispose(); return; }
          cards.setAtlas(a.texture);
          photos.forEach((p, k) => { items[k].rect = a.rects[k]; items[k].ready = a.rects[k].ok ? 1 : 0; });
          gsap.to(S, { atlas: 1, duration: 0.8 });
        })
        .catch((err) => console.warn('[constellation] atlas', err))
      : Promise.resolve();
    if (revealPhoto) ctx.preload(revealPhoto.url);

    await ctx.wait(reduced ? 0.4 : 1.1);
    await ui.chapterCard(T.kicker, T.title);
    secret.show(reduced ? 1 : 3);

    const half = Math.ceil(lines.length / 2);
    const first = lines.slice(0, half);
    const second = lines.slice(half);

    if (n) {
      await Promise.race([atlasP, ctx.wait(6)]);
      audio.setMood('tender');
      // they appear one by one out of the dark, nearest first
      const order = [...items].sort((a, b) => b.z - a.z);
      const spread = reduced ? 1.2 : 3.6;
      order.forEach((it, i) => { it.appearAt = t + 0.2 + (i / Math.max(1, n - 1)) * spread + rnd(0, 0.25); });
      tweens.push(gsap.to(S, { push: 1, duration: reduced ? 1 : 26, ease: 'none' }));
      await ctx.wait(reduced ? 0.6 : 1.4);
      await ui.narrate(first, { position: 'bottom' });
      await ctx.wait(reduced ? 0.2 : 1.2);

      // they begin moving toward each other; golden motes start to pass between them
      audio.setMood('wonder');
      const gatherP = tween(S, { gather: 1, duration: reduced ? 3.2 : 8.5, ease: 'none' });
      tweens.push(gsap.to(S, { motes: 0.75, duration: reduced ? 1.5 : 3.5, delay: reduced ? 0.3 : 1, ease: 'sine.inOut' }));
      await ctx.wait(reduced ? 1 : 2.6);

      // the golden thread travels from photograph to photograph
      audio.sfx('shimmer');
      const threadP = tween(S, { thread: 1, duration: reduced ? 4.2 : Math.min(11, 7.5 + n * 0.06), ease: 'sine.inOut' });
      const narrateP = (async () => {
        await ctx.wait(reduced ? 0.5 : 2);
        if (second.length) await ui.narrate(second, { position: 'bottom' });
      })();
      await Promise.all([gatherP, threadP, narrateP]);

      // …and curves into a heart; the photographs settle along it
      audio.sfx('swell');
      tweens.push(gsap.to(S, { motes: 1, bloom: 0.25, duration: 3 }));
      await tween(S, { heart: 1, duration: reduced ? 2.4 : 4.6, ease: 'none' });

      // …and become a constellation
      audio.sfx('magic');
      tweens.push(gsap.to(S, { glow: 1, bloom: 0.55, duration: reduced ? 1.4 : 2.6, ease: 'sine.inOut' }));
      await tween(S, { star: 1, duration: reduced ? 1.6 : 3, ease: 'none' });
      await ctx.wait(reduced ? 0.3 : 0.7);

      // the heart beats twice
      for (let b = 0; b < 2; b++) {
        audio.sfx('heartbeat');
        beats.push(performance.now() / 1000 + 0.01);
        await ctx.wait(1.5);
      }
      await ctx.wait(reduced ? 0.6 : 1.2);
    } else {
      // no photographs at all: the words, the stars, and then the last photograph
      await ctx.wait(0.8);
      await ui.narrate(lines, { position: 'bottom' });
      await ctx.wait(0.6);
    }

    // darkness, and silence
    secret.hide(reduced ? 0.8 : 1.8);
    audio.setMood('quiet');
    audio.duck(0.2, 9);
    fx.dust({ density: 0, alpha: 0 });
    await tween(veil, { opacity: 1, duration: reduced ? 1.4 : 3, ease: 'sine.inOut' });
    glOn = false;
    canvas.style.visibility = 'hidden';
    ctx.letterbox(false);
    await ctx.wait(reduced ? 0.8 : 2);

    // one final photograph, alone, softly lit
    await reveal.show();
    await ctx.wait(reduced ? 0.3 : 1.2);
    await reveal.write(ctx.fill(T.handwritten));
    await ctx.wait(reduced ? 1.2 : 2.6);
    await ui.waitContinue('Continue');

    // it dissolves into a single golden point at the centre of the black
    audio.sfx('shimmer');
    fx.trail(false); // nothing but the point on the last frame (restored on exit)
    const pt = await reveal.dissolve();
    fx.clear();
    await ctx.wait(0.8);
    ctx.next({ kind: 'point', x: pt.x, y: pt.y, color: '#ffd98a' });
  }

  function dispose() {
    running = false;
    fx.trail(true);
    cancelAnimationFrame(raf);
    listeners.forEach(([tg, type, fn, o]) => tg.removeEventListener(type, fn, o));
    listeners.length = 0;
    tweens.forEach((tw) => tw && tw.kill && tw.kill());
    tweens.length = 0;
    gsap.killTweensOf(S);
    gsap.killTweensOf([veil, bloom]);
    reveal.dispose();
    secret.dispose();
    if (thread) thread.dispose();
    if (cards) cards.dispose();
    sky.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { play, dispose };
}

export default {
  id: 'constellation',
  title: 'Every Little Piece of You',
  async enter(ctx, el) {
    const ch = createChapter(ctx, el);
    this._ch = ch;
    await ch.play();
  },
  async exit() {
    const ch = this._ch;
    this._ch = null;
    if (ch) ch.dispose();
  },
};
