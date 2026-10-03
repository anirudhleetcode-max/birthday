// Chapter One — A Tower Full of You.
//
// We stand inside a sunlit round tower room (a CSS-3D cylinder of painted wall
// strips) where someone has spent years collecting memories: warm plaster
// covered in hand-painted murals, timber beams, a bookshelf with jars of
// flowers and candles, ivy, and a big arched window with god-rays and dust in
// the light. Her photos are painted onto canvases on the walls, brush stroke
// by brush stroke (6 one by one, the rest in a quick painterly cascade). Near
// the end the room turns to the window: the evening warms the sky and the
// golden ribbon drifts past outside — it comes back and waits — and the
// 'ribbon' transition carries it into the next chapter.
import { createRibbon } from '../core/ribbon.js';
import { paintBay } from './tower/mural.js';
import { createPainting } from './tower/brush.js';
import { skyHTML, hillsHTML, nearHTML, frameHTML, panSVG } from './tower/window.js';
import { createAir } from './tower/air.js';
import { esc } from '../core/art.js';

const RAD = Math.PI / 180;
const NB = 8; // bays around the room (posts between them)
const S = 0.56; // apparent scale of the wall straight ahead
const E = 0.85; // the camera stands E·R behind the room's centre (a longer lens: gentle curvature)
const WIN = 0;
const DECOR = 7;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap180 = (d) => ((((d % 360) + 540) % 360) - 180);
/** angle (deg) of a point at arc coordinate u (bays: left → right as seen from inside) */
const angleOfU = (u, circ) => 360 * (1 - u / circ);

export default {
  id: 'tower',
  title: 'A Tower Full of You',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const reduced = !!device.reducedMotion;
    const low = device.tier === 'low' || !!device.lowPower;
    const t = ctx.text.tower || {};
    const photos = ctx.photos('tower').slice(0, 18);
    const n = photos.length;
    const cleanups = (this.cleanups = []);
    const tws = (this.tweens = []);
    const keep = (tw) => { tws.push(tw); return tw; };
    const signal = ctx.signal;
    const done = (tw) => new Promise((res, rej) => {
      if (signal.aborted) return rej(new DOMException('aborted', 'AbortError'));
      const ab = () => rej(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', ab, { once: true });
      tw.then(() => { signal.removeEventListener('abort', ab); res(); });
    });
    const vw0 = window.innerWidth;
    const vh0 = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    /* ------------------------------------------------------------ geometry */
    const bwOf = (w, h) => Math.min(w * 0.92, h * (w > h ? 0.8 : 0.62)); // wider bays on landscape keep the lens gentle
    const Bw = bwOf(vw0, vh0); // apparent bay width straight ahead
    const bayW = Bw / S;
    const circ = NB * bayW;
    const Rw = circ / (2 * Math.PI);
    const eps = E * Rw;
    const P = S * (eps + Rw);
    const D0 = P - eps;
    const VH = vh0 / S; // world px per viewport height on the far wall
    const Hwall = 1.32 * VH;
    // painted walls (not text, not her photos): 2× is as sharp as the eye can tell, at half the memory of 3×
    let ts = S * (low ? 1 : device.tier === 'mid' ? Math.min(dpr, 1.6) : Math.min(dpr, 2));
    ts = Math.min(ts, 1100 / bayW, 2300 / Hwall);
    const spb = low ? 4 : 5;
    const NS = NB * spb;
    const sw = circ / NS;
    const bayAngle = (j) => angleOfU((j + 0.5) * bayW, circ);
    const rotFor = (j, fx = 0) => -angleOfU((j + 0.5 + fx) * bayW, circ);
    const year = String(ctx.site.her?.birthDate || '2007').slice(0, 4);

    el.innerHTML = `
      <div class="tw-room"><div class="tw-ring"></div></div>
      <canvas class="tw-air" aria-hidden="true"></canvas>
      <div class="tw-shade" aria-hidden="true"></div>
      <div class="tw-scrim" aria-hidden="true"></div>`;
    const room = el.querySelector('.tw-room');
    const ring = el.querySelector('.tw-ring');
    room.style.perspective = `${P}px`;
    const items = []; // everything placed on the ring: { el, a, r, hw, group }
    const place = (node, { a, r, w, h, y = 0, extra = '' }) => {
      Object.assign(node.style, {
        width: `${w}px`, height: `${h}px`, marginLeft: `${-w / 2}px`, marginTop: `${-h / 2}px`,
        transform: `rotateY(${a}deg) translateZ(${-r}px) translateY(${y}px)${extra}`,
      });
      ring.appendChild(node);
      return node;
    };

    /* ------------------------------------------------------- photo slots */
    const mains = Math.min(n, 6);
    const mainBays = n >= 6 ? [1, 2, 3, 4, 5, 6] : Array.from({ length: n }, (_, i) => 1 + Math.floor(((i + 0.5) * 6) / n));
    const smallOf = {};
    for (let i = 6; i < n; i++) {
      const j = 1 + ((i - 6) % 6);
      (smallOf[j] = smallOf[j] || []).push(i);
    }
    const slots = photos.map((p, i) => {
      if (i < mains) {
        const j = mainBays[i];
        const two = !!smallOf[j];
        return { i, j, fx: 0, f: two ? -0.13 : -0.035, mw: two ? 0.66 : 0.74, mh: two ? 0.285 : 0.43, small: false };
      }
      const j = 1 + ((i - 6) % 6);
      const list = smallOf[j];
      const k = list.indexOf(i);
      const c = list.length;
      return { i, j, fx: c === 1 ? 0 : k ? 0.22 : -0.22, f: 0.148, mw: c === 1 ? 0.5 : 0.38, mh: 0.17, small: true };
    });
    for (const s of slots) {
      const p = photos[s.i];
      const aw = s.mw * bayW;
      const ah = s.mh * VH;
      const fw = 0.05 * Math.min(aw, ah);
      const iw0 = aw - 2 * fw;
      const ih0 = ah - 2 * fw;
      const ratio = p.ratio || 0.75;
      const ih = Math.min(ih0, iw0 / ratio);
      const iw = ih * ratio;
      Object.assign(s, { iw, ih, fw, w: iw + 2 * fw, h: ih + 2 * fw });
    }
    const occupiedBy = (j) => slots.filter((s) => s.j === j).map((s) => ({ fx: s.fx, f: s.f, w: s.w / bayW, h: s.h / VH }));

    /* ---------------------------------------------------- the painted walls */
    const tmp = document.createElement('canvas');
    tmp.width = Math.round(bayW * ts);
    tmp.height = Math.round(Hwall * ts);
    const tg = tmp.getContext('2d');
    const opening = { w: Math.min(0.6, (0.26 * VH) / bayW), f0: -0.32, f1: 0.2 }; // a tall arch on every screen
    const strips = [];
    for (let k = 0; k < NS; k++) {
      const c = document.createElement('canvas');
      c.className = 'tw-strip';
      c.width = Math.max(1, Math.round(sw * ts));
      c.height = tmp.height;
      const a = angleOfU((k + 0.5) * sw, circ);
      place(c, { a, r: Rw, w: sw * 1.03, h: Hwall });
      items.push({ el: c, a, r: Rw, hw: sw / 2 });
      strips.push(c);
    }
    const candles = [];
    const emptyVariant = {};
    [1, 2, 3, 4, 5, 6].filter((j) => !slots.some((s) => s.j === j)).forEach((j, i) => { emptyVariant[j] = i % 3; });
    const paintOne = (j) => {
      const kind = j === WIN ? 'window' : j === DECOR ? 'decor' : 'photo';
      const bayCandles = [];
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.clearRect(0, 0, tmp.width, tmp.height);
      paintBay(tg, {
        j, kind, variant: emptyVariant[j], bayW, H: Hwall, ts, vh: vh0, s: S, nb: NB, low,
        occupied: occupiedBy(j), opening: kind === 'window' ? opening : null, sunPatch: j === 4, candles: bayCandles,
      });
      for (let k = j * spb; k < (j + 1) * spb; k++) {
        const c = strips[k];
        c.getContext('2d').drawImage(tmp, (k - j * spb) * sw * ts, 0, sw * ts, tmp.height, 0, 0, c.width, c.height);
      }
      for (const cd of bayCandles) candles.push({ j, x: cd.x / ts, y: cd.y / ts, size: cd.size });
    };
    // the bays we see first are painted right away; the rest follow over the next frames
    const order = [WIN, DECOR, 1, 2, 6, 3, 5, 4];
    paintOne(WIN); // the iris opens on the window; the other bays follow frame by frame
    const paintRest = (async () => {
      for (const j of order.slice(1)) {
        await new Promise((r) => requestAnimationFrame(r));
        if (signal.aborted) return;
        paintOne(j);
        addCandles(j);
      }
      tmp.width = tmp.height = 1;
    })();
    function addCandles(j) {
      for (const cd of candles.filter((c) => c.j === j && !c.el)) {
        const u = j * bayW + cd.x;
        const a = angleOfU(u, circ);
        const fw = 8 * cd.size * (VH / 1500); // flame width (world px)
        const s = fw * 8; // the element holds the flame and its halo
        cd.el = place(Object.assign(document.createElement('div'), { className: 'tw-flame' }), { a, r: Rw - 3, w: s, h: s, y: cd.y - Hwall / 2 - fw * 1.1 });
        cd.el.style.setProperty('--fd', `${(1.6 + Math.random()).toFixed(2)}s`);
        items.push({ el: cd.el, a, r: Rw - 3, hw: s });
      }
    }
    addCandles(WIN);

    /* -------------------------------------------------------- the window */
    const a0 = bayAngle(WIN);
    const hwO = (opening.w * bayW) / 2; // opening half width (world)
    const yTop = opening.f0 * VH;
    const yBot = opening.f1 * VH;
    const DOLLY = 0.5 * Rw;
    const ratioAt = (r, dolly) => (eps - dolly + r) / (eps - dolly + Rw);
    const winGroup = [];
    const outside = (r, html, cls) => {
      const rho = ratioAt(r, DOLLY);
      const w = 2 * hwO * rho * 1.12 + 2 * (r - Rw) * Math.tan(42 * RAD) + 40;
      const top = yTop * rho - 60 - (r - Rw) * 0.25;
      const bot = yBot * rho + 60 + (r - Rw) * 0.25;
      const h = bot - top;
      const node = document.createElement('div');
      node.className = `tw-out ${cls}`;
      node.innerHTML = html(w, h, -top);
      place(node, { a: a0, r, w, h, y: (top + bot) / 2 });
      const it = { el: node, a: a0, r, hw: bayW * 0.7, group: 'win' };
      items.push(it);
      winGroup.push(it);
      return { node, w, h, top, rho };
    };
    outside(Rw * 1.55, skyHTML, 'sky');
    outside(Rw * 1.3, (w, h, hy) => hillsHTML(w, h, hy + h * 0.004), 'hills');
    // the ribbon's stage, between the hills and the branch — laid out at roughly screen
    // resolution and scaled down into the world so its canvas stays light
    const rR = Rw * 1.16;
    const rho = ratioAt(rR, DOLLY);
    const kHost = P / (eps - DOLLY + rR);
    const rbW = (2 * hwO * rho * 1.12 + 2 * (rR - Rw) * Math.tan(42 * RAD) + 40);
    const rbTop = yTop * rho - 80;
    const rbBot = yBot * rho + 80;
    const rbH = rbBot - rbTop;
    const ribHost = document.createElement('div');
    ribHost.className = 'tw-out tw-ribhost';
    place(ribHost, { a: a0, r: rR, w: rbW * kHost, h: rbH * kHost, y: (rbTop + rbBot) / 2, extra: ` scale(${1 / kHost})` });
    const ribItem = { el: ribHost, a: a0, r: rR, hw: bayW * 0.7, group: 'win' };
    items.push(ribItem);
    winGroup.push(ribItem);
    outside(Rw * 1.05, (w, h) => nearHTML(w, h), 'near');
    // the window furniture stands a little proud of the wall (a flat panel must stay inside the
    // cylinder), scaled by its depth so that it lines up with the painted opening
    const frW = 0.84 * bayW;
    const rF = Math.sqrt(Rw * Rw - (frW / 2) ** 2) - 4;
    const fk = (eps + rF) / (eps + Rw);
    const frTop = -0.44 * VH;
    const frBot = 0.34 * VH;
    const frH = frBot - frTop;
    const unit = VH / 300;
    const fr = frameHTML(frW, frH, { cx: frW / 2, bottom: yBot - frTop, hw: hwO, rectH: yBot - yTop - hwO }, unit);
    const frame = document.createElement('div');
    frame.className = 'tw-winframe';
    frame.innerHTML = fr.html;
    place(frame, { a: a0, r: rF, w: frW, h: frH, y: ((frTop + frBot) / 2) * fk, extra: ` scale(${fk})` });
    const frItem = { el: frame, a: a0, r: rF, hw: frW / 2, group: 'win' };
    items.push(frItem);
    winGroup.push(frItem);
    {
      const fw = 4.5 * (VH / 1500) * fk;
      const s = fw * 8;
      const lx = (fr.candle.x - frW / 2) * fk;
      const cd = place(Object.assign(document.createElement('div'), { className: 'tw-flame' }), {
        a: a0 + (-lx / (rF - 2)) / RAD, r: rF - 2, w: s, h: s, y: (frTop + fr.candle.y) * fk - fw * 1.1,
      });
      const it = { el: cd, a: a0, r: rF - 2, hw: s, group: 'win' };
      items.push(it);
      winGroup.push(it);
    }

    /* --------------------------------------------------------- paintings */
    const arts = slots.map((s) => {
      const p = photos[s.i];
      const u = (s.j + 0.5 + s.fx) * bayW;
      const a = angleOfU(u, circ);
      const r = Math.sqrt(Math.max(1, Rw * Rw - (s.w / 2) ** 2)) - 0.012 * Rw;
      const node = document.createElement('div');
      node.className = `tw-art fr${(s.i + (s.small ? 1 : 0)) % 3}${s.small ? ' small' : ''}`;
      node.style.setProperty('--fw', `${s.fw}px`);
      node.innerHTML = `<div class="tw-art-in"><img class="tw-img" alt="${esc(p.alt)}" decoding="async" style="object-position:${esc(p.objectPosition)}"></div>`;
      place(node, { a, r, w: s.w, h: s.h, y: s.f * VH });
      const img = node.querySelector('img');
      img.src = p.url;
      const appScale = P / (eps + r);
      const k = Math.min(dpr * appScale * (low ? 0.75 : 1), (s.small ? 520 : 900) / Math.max(s.iw, s.ih));
      const it = { el: node, a, r, hw: s.w / 2, slot: s, photo: p, img, canvas: null, cw: Math.max(8, Math.round(s.iw * k)), ch: Math.max(8, Math.round(s.ih * k)), y: s.f * VH, revealed: false };
      items.push(it);
      return it;
    });

    /* --------------------------------------------------------- the skillet */
    const pan = (() => {
      const u = (DECOR + 0.5 + 0.33) * bayW;
      const a = angleOfU(u, circ);
      const hh = 0.23 * VH;
      const ww = hh * 0.62;
      const wrap = document.createElement('div');
      wrap.className = 'tw-panwrap';
      wrap.innerHTML = `
        <button class="tw-pan" type="button" aria-label="A frying pan hanging on a hook">${panSVG()}</button>
        <div class="tw-stars" aria-hidden="true">${'<i>✦</i>'.repeat(5)}</div>
        <div class="tw-pancap" aria-hidden="true">Undefeated since ${esc(year)}.</div>`;
      wrap.style.setProperty('--u', `${hh / 150}px`);
      // hang it so the handle's ring sits on the painted hook
      place(wrap, { a, r: Rw - 10, w: ww, h: hh, y: -0.07 * VH + 3 * (VH / 1500) - hh * 0.02 + hh / 2 });
      const it = { el: wrap, a, r: Rw - 10, hw: ww / 2 };
      items.push(it);
      return { wrap, btn: wrap.querySelector('.tw-pan'), stars: [...wrap.querySelectorAll('.tw-stars i')], cap: wrap.querySelector('.tw-pancap'), a, r: Rw - 10, hh, ww, it };
    })();

    /* ------------------------------------------------------------ camera */
    const cam = { rot: rotFor(WIN) - (reduced ? 0 : 7), tilt: 0, dolly: reduced ? 0 : -0.07 * Rw };
    const view = { k: 1, vw: vw0, vh: vh0 };
    const fit = () => {
      view.vw = window.innerWidth;
      view.vh = window.innerHeight;
      view.k = Math.max(bwOf(view.vw, view.vh) / Bw, (0.82 * view.vh) / vh0);
      room.style.transform = view.k === 1 ? '' : `scale(${view.k})`;
    };
    fit();
    /** screen position (CSS px) of local point (lx, ly) on a panel at angle a, radius r */
    const project = (a, r, lx = 0, ly = 0) => {
      const th = (a + cam.rot) * RAD;
      const tl = cam.tilt * RAD;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const x1 = lx * c - r * sn;
      const z1 = -lx * sn - r * c;
      const y2 = ly * Math.cos(tl) - z1 * Math.sin(tl);
      const z2 = ly * Math.sin(tl) + z1 * Math.cos(tl);
      const depth = P - (z2 + D0 + cam.dolly);
      const kk = (P / Math.max(1, depth)) * view.k;
      return { x: view.vw / 2 + x1 * kk, y: view.vh / 2 + y2 * kk, k: kk, depth };
    };
    let winVis = false;
    const apply = () => {
      ring.style.transform = `translateZ(${D0 + cam.dolly}px) rotateX(${cam.tilt}deg) rotateY(${cam.rot}deg)`;
      const half = (view.vw / 2 / view.k) * 1.12;
      let wv = false;
      for (const it of items) {
        if (it.group === 'win') continue;
        const th = (it.a + cam.rot) * RAD;
        const depth = eps - cam.dolly + it.r * Math.cos(th);
        const x = Math.abs(it.r * Math.sin(th));
        const vis = depth > 0.04 * Rw && ((x - it.hw) * P) / depth < half;
        if (it.vis !== vis) { it.vis = vis; it.el.style.visibility = vis ? 'visible' : 'hidden'; }
      }
      {
        const th = (a0 + cam.rot) * RAD;
        const depth = eps - cam.dolly + Rw * Math.cos(th);
        const x = Math.abs(Rw * Math.sin(th));
        wv = depth > 0.1 * Rw && ((x - bayW * 0.7) * P) / depth < half;
      }
      if (wv !== winVis) {
        winVis = wv;
        for (const it of winGroup) it.el.style.visibility = wv ? 'visible' : 'hidden';
      }
    };

    /* -------------------------------------------------------- light & air */
    const airCanvas = el.querySelector('.tw-air');
    const air = createAir(airCanvas, { device });
    const light = { warm: 0, boost: 0 };
    let airClear = false;
    const onResize = () => { fit(); air.resize(); };
    window.addEventListener('resize', onResize);
    cleanups.push(() => window.removeEventListener('resize', onResize));

    // free look (drag / arrow keys) with a little inertia
    const look = { on: false, dragging: false, lastX: 0, vel: 0, lastT: 0, idleSince: 0, moved: 0 };
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (look.on && !look.dragging) {
        cam.rot += look.vel * dt;
        look.vel *= Math.exp(-3.2 * dt);
        if (!reduced && Math.abs(look.vel) < 4) cam.rot += 1.4 * dt; // a gentle drift
      }
      apply();
      if (winVis) {
        const th = (a0 + cam.rot) * RAD;
        const L = project(a0, Rw, -hwO, yBot);
        const R = project(a0, Rw, hwO, yBot);
        const T = project(a0, Rw, 0, yTop);
        const vis = clamp((Math.cos(th) - 0.5) / 0.35, 0, 1);
        air.update(dt, { vis, cx: T.x, top: T.y, bottom: L.y, ow: R.x - L.x, warm: light.warm, boost: light.boost });
        airClear = false;
      } else if (!airClear) {
        air.update(dt, null);
        airClear = true;
      }
    };
    gsap.ticker.add(tick);
    cleanups.push(() => gsap.ticker.remove(tick));
    cleanups.push(() => {
      air.destroy();
      for (const c of strips) c.width = c.height = 1;
      for (const it of arts) if (it.canvas) it.canvas.width = it.canvas.height = 1;
      tmp.width = tmp.height = 1;
    });
    if (!reduced) keep(gsap.to(cam, { tilt: 0.9, duration: 5.5, yoyo: true, repeat: -1, ease: 'sine.inOut' }));

    /* ------------------------------------------------------------ helpers */
    let narr = Promise.resolve();
    const say = (lines, opts = {}) => {
      const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
      if (!list.length) return narr;
      narr = narr.then(() => ui.narrate(list, { position: 'bottom', ...opts })).catch((e) => { if (e?.name !== 'AbortError') console.warn(e); });
      return narr;
    };
    const nearest = (target) => cam.rot + wrap180(target - cam.rot);
    const cut = async (fn) => {
      await done(keep(gsap.to(room, { opacity: 0, duration: 0.35, ease: 'power1.in' })));
      fn();
      apply();
      await done(keep(gsap.to(room, { opacity: 1, duration: 0.55, ease: 'power1.out' })));
    };
    const turnTo = (target, dur, ease = 'power2.inOut', vars = {}) => {
      const to = nearest(target);
      if (reduced) return cut(() => { cam.rot = to; Object.assign(cam, vars); });
      return done(keep(gsap.to(cam, { rot: to, duration: dur, ease, ...vars })));
    };
    const sparkleOn = (it, n2 = 8) => {
      const top = project(it.a, it.r, 0, it.y - it.slot.h / 2);
      const mid = project(it.a, it.r, 0, it.y);
      fx.sparkle(mid.x, top.y + (mid.y - top.y) * 0.25, n2, { spread: Math.max(30, it.slot.w * mid.k * 0.4) });
    };
    const reveal = async (it, dur) => {
      if (it.revealed) return;
      it.revealed = true;
      const img = await ctx.preload(it.photo.url);
      if (signal.aborted) return;
      if (!img || reduced) {
        it.el.classList.add('done');
        await ctx.wait(reduced ? 1 : 0.6);
        return;
      }
      // the canvas only exists while it is being painted (one less layer in the 3D scene)
      it.canvas = document.createElement('canvas');
      it.canvas.className = 'tw-brush';
      it.canvas.width = it.cw;
      it.canvas.height = it.ch;
      it.el.querySelector('.tw-art-in').appendChild(it.canvas);
      const painting = createPainting(it.canvas, img, { focal: it.photo.focal || { x: 0.5, y: 0.4 }, low, seed: it.slot.i + 3 });
      const o = { t: 0 };
      await done(keep(gsap.to(o, { t: 1, duration: dur, ease: 'power1.inOut', onUpdate: () => painting.step(o.t) })));
      it.el.classList.add('done');
      if (it.vis) sparkleOn(it, it.slot.small ? 5 : 9);
      setTimeout(() => { painting.destroy(); if (it.canvas) { it.canvas.width = it.canvas.height = 1; it.canvas.remove(); it.canvas = null; } }, 900);
    };

    /* ---------------------------------------------------------- the egg */
    let panBusy = false;
    const onPan = () => {
      if (panBusy) return;
      panBusy = true;
      audio.sfx('clang');
      const o = { t: 0 };
      const swingEl = pan.btn;
      keep(gsap.to(o, {
        t: 1, duration: reduced ? 0.6 : 2.6, ease: 'none',
        onUpdate: () => {
          const tt = o.t * (reduced ? 0.6 : 2.6);
          swingEl.style.transform = `rotate(${(reduced ? 6 : 24) * Math.exp(-2.1 * tt) * Math.sin(tt * 8.5)}deg)`;
        },
        onComplete: () => { swingEl.style.transform = ''; panBusy = false; },
      }));
      // little stars circle the pan
      const so = { t: 0 };
      pan.stars.forEach((s) => { s.style.opacity = 0; });
      keep(gsap.to(so, {
        t: 1, duration: 2.6, ease: 'none',
        onUpdate: () => {
          const fade = Math.min(1, so.t * 6) * Math.min(1, (1 - so.t) * 4);
          pan.stars.forEach((s, i) => {
            const an = (reduced ? 0 : so.t * Math.PI * 4.2) + (i / pan.stars.length) * Math.PI * 2;
            const z = Math.sin(an);
            s.style.transform = `translate(${(Math.cos(an) * pan.ww * 0.62).toFixed(1)}px, ${(z * pan.ww * 0.17).toFixed(1)}px) scale(${(0.75 + 0.35 * (z + 1) / 2).toFixed(2)})`;
            s.style.opacity = (fade * (0.55 + 0.45 * (z + 1) / 2)).toFixed(2);
          });
        },
      }));
      keep(gsap.fromTo(pan.cap, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.7, delay: 0.35, ease: 'power2.out' }));
      keep(gsap.to(pan.cap, { opacity: 0, duration: 1, delay: 5.5 }));
      const pr = project(pan.a, pan.r, 0, 0.15 * pan.hh);
      fx.sparkle(pr.x, pr.y, 10, { spread: 40 });
      ctx.eggs.found('pan', 'A very important frying pan. Undefeated since 2007.');
    };
    pan.btn.addEventListener('click', onPan);
    cleanups.push(() => pan.btn.removeEventListener('click', onPan));

    /* --------------------------------------------------------- drag look */
    const degPerPx = () => 45 / (Bw * view.k) * 0.95;
    const down = (e) => {
      if (!look.on) return;
      look.idleSince = performance.now();
      if (e.target.closest && e.target.closest('.tw-pan')) return; // a tap on the pan is a tap, not a drag
      look.dragging = true;
      look.lastX = e.clientX;
      look.lastT = performance.now();
      look.vel = 0;
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    };
    const move = (e) => {
      if (!look.dragging) return;
      const now = performance.now();
      const dx = e.clientX - look.lastX;
      look.lastX = e.clientX;
      const d = -dx * degPerPx();
      cam.rot += d;
      const dt = Math.max(0.008, (now - look.lastT) / 1000);
      look.lastT = now;
      look.vel = look.vel * 0.6 + (d / dt) * 0.4;
      look.moved += Math.abs(dx);
      look.idleSince = now;
    };
    const up = () => {
      if (!look.dragging) return;
      look.dragging = false;
      look.idleSince = performance.now();
      if (performance.now() - look.lastT > 120) look.vel = 0;
      look.vel = clamp(look.vel, -120, 120);
    };
    const key = (e) => {
      if (!look.on) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // ArrowRight continues once the Continue button is up; until then it looks around
        if (!document.getElementById('continue').hidden) return;
        look.vel = e.key === 'ArrowLeft' ? -70 : 70;
        look.idleSince = performance.now();
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    cleanups.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    });

    /* ============================================================ the beat */
    apply();
    fx.dust({ density: low ? 0.25 : 0.38 });
    audio.setMood('tender');
    const scrim = el.querySelector('.tw-scrim');
    if (!reduced) keep(gsap.to(cam, { rot: rotFor(WIN), dolly: 0, duration: 7, ease: 'power2.out' }));
    keep(gsap.fromTo(room, { opacity: 0.4 }, { opacity: 1, duration: 1.6, ease: 'power1.out' }));
    await ui.chapterCard(t.kicker || 'Chapter One', t.title || 'A Tower Full of You');
    keep(gsap.to(scrim, { opacity: 0, duration: 1.8, ease: 'power1.inOut' }));
    await paintRest;
    if (signal.aborted) return;

    const lines = t.lines || [];
    const mainArts = arts.slice(0, mains);
    const lineAt = new Map();
    lines.forEach((l, k) => {
      const at = mains ? Math.min(mains - 1, Math.round((k * mains) / 3)) : -1;
      lineAt.set(at, (lineAt.get(at) || []).concat(l));
    });

    if (!mains) {
      // no photos yet: a slow tour of the murals while the words play
      say(lines);
      await turnTo(rotFor(2), 5, 'sine.inOut');
      await turnTo(rotFor(5), 6, 'sine.inOut');
    }
    for (let i = 0; i < mainArts.length; i++) {
      const it = mainArts[i];
      if (lineAt.has(i)) say(lineAt.get(i));
      await turnTo(rotFor(it.slot.j), i === 0 ? 3.2 : 2.5);
      await reveal(it, low ? 1.9 : 2.4);
      await ctx.wait(0.35);
    }

    // the rest: a quick painterly cascade as the room turns all the way round
    const smalls = arts.slice(mains);
    if (smalls.length) {
      if (reduced) {
        await Promise.all(smalls.map((it) => reveal(it, 1)));
      } else {
        const started = [];
        const trigger = () => {
          for (const it of smalls) {
            if (it.revealed) continue;
            if (Math.abs(wrap180(it.a + cam.rot)) < 16) started.push(reveal(it, low ? 1 : 1.25));
          }
        };
        trigger();
        await done(keep(gsap.to(cam, { rot: cam.rot + 360, duration: clamp(5 + smalls.length * 0.6, 7, 11), ease: 'sine.inOut', onUpdate: trigger })));
        smalls.forEach((it) => { if (!it.revealed) started.push(reveal(it, 1)); });
        await Promise.all(started);
      }
    }

    // a look around the room (and the pan on its hook)
    await turnTo(rotFor(DECOR, -0.04), 2.6);
    await narr;
    look.on = true;
    look.idleSince = performance.now();
    const hint = ui.hint(t.hint || 'Drag to look around');
    const t0 = performance.now();
    while (!signal.aborted) {
      await ctx.wait(0.25);
      const el2 = performance.now() - t0;
      const idle = performance.now() - look.idleSince;
      if (look.dragging) continue;
      if ((el2 > 7000 && idle > 1800) || el2 > 26000) break;
    }
    hint.remove();
    look.on = false;
    look.dragging = false;
    look.vel = 0;

    // the room turns to the window; the evening warms the sky outside
    audio.setMood('wonder');
    el.classList.add('tw-eve');
    keep(gsap.to(light, { warm: 1, boost: 1, duration: 5, ease: 'sine.inOut' }));
    if (reduced) {
      await cut(() => { cam.rot = nearest(rotFor(WIN)); cam.dolly = DOLLY; cam.tilt = 0; });
    } else {
      gsap.killTweensOf(cam, 'tilt');
      await turnTo(rotFor(WIN), 3.6, 'power2.inOut', { dolly: DOLLY, tilt: -0.6 });
    }
    await ctx.wait(reduced ? 0.4 : 0.9);

    // something golden drifts past…
    const rib = createRibbon(ribHost, { strands: low ? 3 : 5, width: 2.6, glow: 1.15, color: '#ffd98a', device, samples: low ? 160 : 260, rescale: false });
    this.rib = rib;
    const hwL = hwO * rho * kHost;
    const oTop = (yTop * rho - rbTop) * kHost;
    const oBot = (yBot * rho - rbTop) * kHost;
    const cxL = (rbW * kHost) / 2;
    const O = (fx2, fy) => ({ x: cxL + (fx2 - 0.5) * 2 * hwL, y: oTop + fy * (oBot - oTop) });
    audio.sfx('shimmer');
    rib.setPath([O(1.6, 0.2), O(1.05, 0.26), O(0.62, 0.3), O(0.25, 0.24), O(-0.2, 0.3), O(-0.7, 0.24)]);
    rib.set({ split: 0.35, trail: 0.4 });
    rib.flow(true);
    await rib.draw({ duration: reduced ? 1.6 : 2.4, ease: 'sine.inOut', from: 0, to: 1, trail: 0.4 });
    await rib.retract({ duration: 0.7 });
    say([t.windowLine || 'Wait. Something golden just drifted past the window. Follow it.']);
    await ctx.wait(reduced ? 0.6 : 1.1);
    // …and comes back, curls once, and waits
    const back = [O(-0.75, 0.9), O(-0.28, 0.78), O(0.08, 0.68), O(0.36, 0.585), O(0.53, 0.52), O(0.475, 0.448), O(0.37, 0.465), O(0.39, 0.535), O(0.56, 0.55), O(0.7, 0.485), O(0.79, 0.425)];
    rib.setPath(back);
    rib.set({ split: 0, trail: null, start: 0 });
    audio.sfx('magic');
    rib.tween('split', 1, 2.2);
    await rib.draw({ duration: reduced ? 1.8 : 3, ease: 'power2.out', from: 0, to: 1 });
    if (!reduced) {
      const tb = performance.now();
      rib.follow(() => {
        const s = (performance.now() - tb) / 1000;
        return back.map((p, i) => {
          const k = i / (back.length - 1);
          return { x: p.x + Math.sin(s * 0.7 + i * 0.9) * 6 * k, y: p.y + Math.sin(s * 0.9 + i * 0.6) * 10 * k * k };
        });
      }, { stiffness: 6 });
    }
    await narr;
    await ui.waitContinue('Continue');
    const hp = rib.pointAt(1);
    const sp = project(a0, rR, (hp.x - (rbW * kHost) / 2) / kHost, (hp.y - (rbH * kHost) / 2) / kHost + (rbTop + rbBot) / 2);
    ctx.next({ kind: 'ribbon', x: clamp(sp.x, 0, view.vw), y: clamp(sp.y, 0, view.vh), color: '#ffd98a' });
  },

  async exit() {
    (this.tweens || []).forEach((tw) => tw && tw.kill());
    (this.cleanups || []).forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
    if (this.rib) this.rib.destroy();
    this.rib = null;
    this.tweens = [];
    this.cleanups = [];
  },
};
