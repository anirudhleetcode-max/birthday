// Chapter Two — The Golden Thread.
//
// The golden ribbon that waited outside the tower window becomes a thread of
// light strung through a sunset landscape. Her polaroids hang from it — PHOTO →
// golden thread → PHOTO … — developing like instant film as the camera dollies
// past (auto, or drag to scrub). The thread curls, twists, now and then wraps
// right around a photo, and drifts in the evening air. If one photo is marked
// as the "hero hair" photo, the world dims, the camera leans in, golden
// particles gather and a ribbon emerges from the edge of the real photograph —
// the original — before it rejoins the thread. At the end the thread gathers
// into one strand, then into a single warm ember.
import { createRibbon } from '../core/ribbon.js';
import { buildScenery } from './hair/scenery.js';
import { polaroidHTML, develop, developed } from './hair/polaroid.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export default {
  id: 'hair',
  title: 'The Golden Thread',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const reduced = !!device.reducedMotion;
    const low = device.tier === 'low' || !!device.lowPower;
    const t = ctx.text.hair || {};
    const signal = ctx.signal;
    const cleanups = (this.cleanups = []);
    const tws = (this.tweens = []);
    const ribbons = (this.ribbons = new Set());
    const keep = (tw) => { tws.push(tw); return tw; };
    const done = (tw) => new Promise((res, rej) => {
      if (signal.aborted) return rej(new DOMException('aborted', 'AbortError'));
      const ab = () => rej(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', ab, { once: true });
      tw.then(() => { signal.removeEventListener('abort', ab); res(); });
    });

    /* ------------------------------------------------------------ photos */
    let photos = ctx.photos('hair').slice(0, 24);
    const hero = ctx.heroHair();
    let heroIndex = -1;
    if (hero) {
      heroIndex = photos.findIndex((p) => p.id === hero.id);
      if (heroIndex < 0) {
        heroIndex = Math.min(photos.length, Math.round(photos.length * 0.6));
        photos = [...photos.slice(0, heroIndex), hero, ...photos.slice(heroIndex)];
      }
    }
    const n = photos.length;

    /* ------------------------------------------------------------ layout */
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const portrait = vh > vw;
    const baseW = portrait ? clamp(vw * 0.54, 176, 300) : clamp(vw * 0.17, 200, 280);
    const maxCardH = (portrait ? 0.47 : 0.5) * vh;
    const spacing = portrait ? Math.max(vw * 0.68, baseW * 1.2) : Math.max(vw * 0.25, baseW * 1.5);
    const rnd = rng(31);
    const x0 = vw * (portrait ? 1.05 : 0.95);
    const cards = photos.map((p, i) => {
      const ratio = p.ratio || 0.75;
      const w = Math.min(baseW, maxCardH / (0.06 + 0.88 / ratio + 0.34));
      const h = w * (0.06 + 0.88 / ratio + 0.34);
      const x = x0 + i * spacing + (rnd() - 0.5) * spacing * 0.08;
      const y = vh * (0.135 + 0.1 * (0.5 + 0.5 * Math.sin(i * 1.9 + 0.6)) * (0.6 + 0.4 * rnd()));
      return { p, i, w, h, x, y, wrapped: false, hero: i === heroIndex, dev: false };
    });
    // every few photos the thread winds right around one
    cards.forEach((c, i) => { if (i % 4 === 2 && !c.hero && i > 0) c.wrapped = true; });
    const last = cards[n - 1];
    const ember = last
      ? { x: last.x + last.w * (portrait ? 0.9 : 1.1), y: last.y + Math.min(last.h * 0.42, vh * 0.22) }
      : { x: vw * 0.62, y: vh * 0.36 };
    const camEnd = last ? Math.max(0, last.x - vw * (portrait ? 0.3 : 0.36)) : 0;
    const travel = camEnd + vw;
    const T = clamp(6 + n * 2.5, 10, 45); // the whole dolly (the hero moment is extra)

    el.innerHTML = `
      <div class="hr-world">
        <div class="hr-back"></div>
        <div class="hr-track"><div class="hr-threads"></div><div class="hr-cards"></div></div>
        <div class="hr-front"></div>
      </div>
      <div class="hr-hero" aria-hidden="true"><div class="hr-veil"></div><div class="hr-herorib"></div><canvas class="hr-motes"></canvas></div>
      <div class="hr-ember" aria-hidden="true"><i></i></div>`;
    const world = el.querySelector('.hr-world');
    const back = el.querySelector('.hr-back');
    const trackEl = el.querySelector('.hr-track');
    const threadsEl = el.querySelector('.hr-threads');
    const cardsEl = el.querySelector('.hr-cards');
    const front = el.querySelector('.hr-front');
    const heroLayer = el.querySelector('.hr-hero');
    const veil = el.querySelector('.hr-veil');
    const emberEl = el.querySelector('.hr-ember');
    const layers = buildScenery(back, { vw, vh, travel, reduced, low });
    // the grass sits in front of the thread
    const near = layers.find((l) => l.el.classList.contains('hr-near'));
    if (near) front.appendChild(near.el);

    /* ------------------------------------------------------------ cards */
    for (const c of cards) {
      const node = document.createElement('div');
      node.className = `hr-card${c.wrapped ? ' wrapped' : ''}`;
      Object.assign(node.style, { left: `${c.x - c.w / 2}px`, top: `${c.y}px`, width: `${c.w}px` });
      node.style.setProperty('--tilt', `${((c.i * 37) % 9) - 4}deg`);
      node.style.setProperty('--dur', `${(3.4 + (c.i % 4) * 0.5).toFixed(2)}s`);
      node.style.setProperty('--fs', `${Math.max(17, c.w * 0.098).toFixed(1)}px`);
      node.innerHTML = `<div class="hr-sway">${polaroidHTML(c.p)}<i class="hr-knot"></i></div>`;
      cardsEl.appendChild(node);
      c.el = node;
      c.pol = node.querySelector('.hr-pol');
    }
    // the polaroid's height depends on its caption; measure once
    for (const c of cards) c.h = c.pol.offsetHeight || c.h;

    /* ------------------------------------------------------------ thread */
    const clip = (c) => ({ x: c.x, y: c.y + 2 });
    const segs = [];
    const segPoints = (a, b, i, wrapCard) => {
      const r = rng(97 + i * 13);
      const dx = b.x - a.x;
      const sag = vh * (0.05 + r() * 0.05);
      const m = { x: (a.x + b.x) / 2 + (r() - 0.5) * dx * 0.1, y: Math.max(a.y, b.y) + sag };
      const pts = [a, { x: a.x + dx * 0.16, y: a.y + sag * 0.35 }];
      if (r() < 0.55 && Math.abs(dx) > 120) {
        // a loose curl hanging from the thread
        const rc = clamp(Math.abs(dx) * 0.07, 14, 34);
        const dir = r() < 0.5 ? 1 : -1;
        pts.push({ x: m.x - rc * 1.1, y: m.y - rc * 0.1 });
        for (let k = 1; k <= 5; k++) {
          const an = -Math.PI / 2 + dir * (k / 6) * Math.PI * 2;
          pts.push({ x: m.x + Math.cos(an) * rc, y: m.y + rc + Math.sin(an) * rc });
        }
        pts.push({ x: m.x + rc * 1.1, y: m.y - rc * 0.1 });
      } else {
        pts.push(m);
      }
      if (wrapCard) {
        // wind once around the photo, then tie on at the top
        const c = wrapCard;
        const L = c.x - c.w / 2;
        const R = c.x + c.w / 2;
        const top = c.y;
        const bot = c.y + c.h;
        const g = 14;
        pts.push({ x: L - g * 2.2, y: top + c.h * 0.32 }, { x: L - g, y: top + c.h * 0.6 }, { x: L - g * 0.4, y: bot + g * 0.6 },
          { x: c.x - c.w * 0.1, y: bot + g * 1.2 }, { x: R + g * 0.5, y: bot + g * 0.4 }, { x: R + g, y: top + c.h * 0.55 },
          { x: R + g * 0.8, y: top + c.h * 0.12 }, { x: R - c.w * 0.18, y: top - g * 1.1 }, { x: b.x + 6, y: b.y - 3 }, b);
      } else {
        pts.push({ x: b.x - dx * 0.16, y: b.y + sag * 0.35 }, b);
      }
      return pts;
    };
    if (!n) {
      segs.push({ pts: segPoints({ x: -vw * 0.15, y: vh * 0.42 }, ember, 0, null), lead: 'out' });
    } else {
      segs.push({ pts: segPoints({ x: Math.min(cards[0].x - spacing, 0) - vw * 0.25, y: vh * 0.42 }, clip(cards[0]), 0, cards[0].wrapped ? cards[0] : null), lead: 'in' });
      for (let i = 0; i < n - 1; i++) segs.push({ pts: segPoints(clip(cards[i]), clip(cards[i + 1]), i + 1, cards[i + 1].wrapped ? cards[i + 1] : null), from: i });
      segs.push({ pts: segPoints(clip(last), ember, n + 1, null), lead: 'out', from: n - 1 });
    }
    const M = 70;
    for (const s of segs) {
      let a = Infinity; let b = Infinity; let c = -Infinity; let d = -Infinity;
      for (const p of s.pts) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
      s.box = { x: a - M, y: b - M, w: c - a + 2 * M, h: d - b + 2 * M };
      s.local = s.pts.map((p) => ({ x: p.x - s.box.x, y: p.y - s.box.y }));
      s.phase = Math.random() * 10;
      s.drawn = false;
    }
    const makeRibbon = (s) => {
      const host = document.createElement('div');
      host.className = 'hr-seg';
      Object.assign(host.style, { left: `${s.box.x}px`, top: `${s.box.y}px`, width: `${s.box.w}px`, height: `${s.box.h}px` });
      threadsEl.appendChild(host);
      const rib = createRibbon(host, {
        strands: low ? 3 : 4, width: portrait ? 2.1 : 2.3, glow: 1.05, color: '#ffd98a', device,
        samples: low ? 140 : 230, rescale: false, tail: 0.12, particles: !low || s.lead === 'out',
      });
      ribbons.add(rib);
      rib.setPath(s.local);
      rib.flow(true);
      if (!reduced) {
        const L = s.local;
        rib.follow(() => {
          const tt = performance.now() / 1000 + s.phase;
          return L.map((p, k) => {
            const e = Math.sin((Math.PI * k) / (L.length - 1));
            return { x: p.x + Math.sin(tt * 0.6 + k * 0.7) * 5 * e, y: p.y + Math.sin(tt * 0.83 + k * 0.5) * 7 * e };
          });
        }, { stiffness: 7 });
      }
      if (s.drawn) rib.set({ head: 1 });
      else {
        s.drawn = true;
        rib.set({ head: 0 });
        rib.draw({ duration: reduced ? 1 : 1.8, ease: 'power2.out', from: 0, to: 1 });
      }
      s.host = host;
      s.rib = rib;
    };
    const dropRibbon = (s) => {
      if (!s.rib) return;
      ribbons.delete(s.rib);
      s.rib.destroy();
      s.host.remove();
      s.rib = null;
      s.host = null;
    };

    /* ------------------------------------------------------------ camera */
    const cam = { x: 0 };
    let heroCamX = Infinity;
    if (heroIndex >= 0) heroCamX = clamp(cards[heroIndex].x - vw / 2, 0, camEnd);
    const state = { heroDone: heroIndex < 0, dragging: false, hold: false, zoom: 1 };
    const render = () => {
      if (!state.heroDone && cam.x > heroCamX) cam.x = heroCamX;
      trackEl.style.transform = `translate3d(${-cam.x}px,0,0)`;
      for (const l of layers) l.el.style.transform = `translate3d(${(-cam.x * l.k).toFixed(1)}px,0,0)`;
      // threads near the screen exist; far ones are released
      for (const s of segs) {
        const L = s.box.x - cam.x;
        const R = L + s.box.w;
        if (R > -vw * 0.35 && L < vw * 1.35) { if (!s.rib) makeRibbon(s); } else if ((R < -vw * 1.2 || L > vw * 2.2) && s.rib) dropRibbon(s);
      }
      // polaroids develop as they arrive
      for (const c of cards) {
        if (c.dev || c.hero) continue;
        if (c.x - cam.x < vw * (portrait ? 0.84 : 0.8)) {
          c.dev = true;
          keep(develop(c.pol, gsap, { reduced, fast: n > 14 }));
          c.el.classList.add('in');
          audio.sfx('pageTurn');
        }
      }
    };
    gsap.ticker.add(render);
    cleanups.push(() => gsap.ticker.remove(render));

    let dolly = null;
    const speed = camEnd / T;
    const goTo = (target, ease) => {
      if (dolly) dolly.kill();
      const dist = Math.abs(target - cam.x);
      if (dist < 1) { cam.x = target; return Promise.resolve(); }
      dolly = keep(gsap.to(cam, { x: target, duration: Math.max(1.2, dist / Math.max(1, speed)), ease }));
      return done(dolly);
    };

    // drag to scrub
    let lastX = 0;
    const down = (e) => {
      if (state.hold) return;
      state.dragging = true;
      lastX = e.clientX;
      if (dolly) dolly.pause();
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    };
    const move = (e) => {
      if (!state.dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const lim = state.heroDone ? camEnd : heroCamX;
      cam.x = clamp(cam.x - dx * 1.15, 0, lim);
    };
    let resume = null;
    const up = () => {
      if (!state.dragging) return;
      state.dragging = false;
      if (resume) resume();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    cleanups.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });

    /** Travel to `target`, letting the viewer scrub on the way; resolves on arrival. */
    const travelTo = (target, ease) => new Promise((res, rej) => {
      const go = () => {
        goTo(target, ease).then(() => {
          if (state.dragging) return; // a drag paused us; `up` will call resume
          if (Math.abs(cam.x - target) < 2) { resume = null; res(); } else go();
        }, rej);
      };
      resume = () => go();
      go();
    });

    /* ------------------------------------------------------------ narration */
    let narr = Promise.resolve();
    const say = (lines, opts = {}) => {
      const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
      if (!list.length) return narr;
      narr = narr.then(() => ui.narrate(list, { position: 'bottom', ...opts })).catch((e) => { if (e?.name !== 'AbortError') console.warn(e); });
      return narr;
    };
    const until = async (cond) => { while (!cond()) await ctx.wait(0.2); };

    /* ============================================================ the beat */
    fx.dust({ density: low ? 0.3 : 0.5 });
    audio.setMood('wonder');
    render();
    keep(gsap.fromTo(world, { opacity: 0.55 }, { opacity: 1, duration: 1.8, ease: 'power1.out' }));
    await ui.chapterCard(t.kicker || 'Chapter Two', t.title || 'The Golden Thread');

    const lines = t.lines || [];
    (async () => {
      await ctx.wait(0.6);
      say(lines.slice(0, 1));
      await until(() => !camEnd || cam.x / camEnd > 0.3);
      say(lines.slice(1, 2));
      await until(() => !camEnd || cam.x / camEnd > 0.6);
      say(lines.slice(2));
    })().catch(() => {});

    if (heroIndex >= 0) {
      await travelTo(heroCamX, 'power1.inOut');
      await heroMoment(cards[heroIndex]);
      state.heroDone = true;
    }
    await travelTo(camEnd, heroIndex >= 0 ? 'power1.inOut' : 'sine.inOut');
    state.hold = true;
    await narr;

    /* ------------------------------------------------ the ember at the end */
    const out = segs[segs.length - 1];
    if (!out.rib) makeRibbon(out);
    const rib = out.rib;
    const hp = { x: ember.x - cam.x, y: ember.y };
    for (const s of segs) if (s !== out && s.rib) s.rib.fade(0.5, 2.4);
    rib.follow(null);
    audio.sfx('swell');
    rib.tween('split', 0, 1.6);
    await done(keep(gsap.to({}, { duration: reduced ? 0.6 : 1.4 })));
    rib.tween('width', 2.8, 1.2);
    emberEl.style.left = `${hp.x}px`;
    emberEl.style.top = `${hp.y}px`;
    keep(gsap.fromTo(emberEl, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 1.8, delay: 0.6, ease: 'power2.out' }));
    await rib.retract({ duration: reduced ? 1 : 2, ease: 'power2.inOut' });
    rib.fade(0, 0.6);
    fx.sparkle(hp.x, hp.y, 12, { spread: 26 });
    audio.sfx('chime');
    await say([t.endLine || 'Still plenty of thread left. Good — we’re nowhere near done.']);
    await ui.waitContinue('Continue');
    ctx.next({ kind: 'ember', x: hp.x, y: hp.y });

    /* ------------------------------------------------ the hero-hair moment */
    async function heroMoment(c) {
      state.hold = true;
      const pr = c.pol.getBoundingClientRect();
      const ratio = c.p.ratio || 0.75;
      const k = 0.06 + 0.88 / ratio + 0.34;
      const Wt = Math.min(portrait ? vw * 0.68 : vw * 0.34, (vh * (portrait ? 0.5 : 0.62)) / k, 520);
      const cx = vw / 2;
      const cy = vh * (portrait ? 0.5 : 0.48);
      const big = document.createElement('div');
      big.className = 'hr-big';
      big.style.width = `${Wt}px`;
      big.style.setProperty('--fs', `${Math.max(19, Wt * 0.085).toFixed(1)}px`);
      big.innerHTML = polaroidHTML(c.p);
      heroLayer.appendChild(big);
      const bh = big.offsetHeight;
      big.style.left = `${cx - Wt / 2}px`;
      big.style.top = `${cy - bh / 2}px`;
      const s0 = pr.width / Wt;
      const from = { x: pr.left + pr.width / 2 - cx, y: pr.top + pr.height / 2 - cy, scale: s0 };
      c.el.style.visibility = 'hidden';
      audio.sfx('swell');
      heroLayer.classList.add('on');
      keep(gsap.to(veil, { opacity: 1, duration: 1.6, ease: 'power1.inOut' }));
      if (!reduced) {
        world.style.transformOrigin = `${pr.left + pr.width / 2}px ${pr.top + pr.height / 2}px`;
        keep(gsap.to(world, { scale: 1.07, duration: 2.2, ease: 'power2.inOut' }));
        gsap.set(big, from);
        keep(gsap.to(big, { x: 0, y: 0, scale: 1, rotation: 0, duration: 1.9, ease: 'power3.inOut' }));
      } else {
        keep(gsap.fromTo(big, { opacity: 0 }, { opacity: 1, duration: 0.8 }));
      }
      const dev = keep(develop(big.querySelector('.hr-pol'), gsap, { reduced }));
      await ctx.wait(reduced ? 0.8 : 1.6);

      // golden particles gather around the photograph
      const ph = big.querySelector('.hr-ph').getBoundingClientRect();
      if (!reduced) await gatherMotes(ph);
      big.classList.add('glow');

      // …and a ribbon of light emerges from its edge
      const host = el.querySelector('.hr-herorib');
      const hrib = createRibbon(host, { strands: low ? 3 : 5, width: 2.6, glow: 1.2, color: '#ffd98a', device, tail: 0.03, samples: low ? 160 : 260, rescale: false });
      ribbons.add(hrib);
      let pts;
      let spark;
      if (portrait) {
        const x = ph.left + ph.width * 0.66;
        const y = ph.top;
        spark = { x, y };
        const rise = Math.min(vh * 0.16, y - vh * 0.08);
        pts = [{ x, y: y + 16 }, { x: x + 4, y: y - 22 }, { x: x + vw * 0.12, y: y - rise * 0.42 }, { x: x + vw * 0.13, y: y - rise * 0.78 },
          { x: x + vw * 0.03, y: y - rise }, { x: x - vw * 0.06, y: y - rise * 0.72 }, { x: x + vw * 0.02, y: y - rise * 0.45 },
          { x: x + vw * 0.1, y: y - rise * 0.66 }, { x: x - vw * 0.25, y: y - rise * 1.15 }, { x: -vw * 0.2, y: y - rise * 0.9 }];
      } else {
        const x = ph.right;
        const y = ph.top + ph.height * 0.34;
        spark = { x, y };
        pts = [{ x: x - 16, y }, { x: x + 18, y: y - 4 }, { x: x + vw * 0.06, y: y - vh * 0.08 }, { x: x + vw * 0.11, y: y - vh * 0.03 },
          { x: x + vw * 0.09, y: y + vh * 0.06 }, { x: x + vw * 0.04, y: y + vh * 0.02 }, { x: x + vw * 0.08, y: y - vh * 0.05 },
          { x: x + vw * 0.2, y: y - vh * 0.16 }, { x: vw * 1.15, y: y - vh * 0.22 }];
      }
      const sparkEl = document.createElement('i');
      sparkEl.className = 'hr-spark';
      Object.assign(sparkEl.style, { left: `${spark.x}px`, top: `${spark.y}px` });
      heroLayer.appendChild(sparkEl);
      keep(gsap.fromTo(sparkEl, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out' }));
      hrib.setPath(pts);
      hrib.set({ split: 0.2 });
      hrib.flow(true);
      audio.sfx('magic');
      hrib.tween('split', 1, 2.4);
      const draw = hrib.draw({ duration: reduced ? 1.6 : 3, ease: 'power2.inOut', from: 0, to: 1 });
      await ctx.wait(0.8);
      say([t.heroHairLine || 'The original. The golden thread is just doing an impression.']);
      await draw;
      await narr;
      await dev;
      await ctx.wait(0.4);

      // the photograph rejoins its place on the thread
      const seg = segs.find((s) => s.from === c.i) || segs[segs.length - 1];
      const target = seg.pts.map((p) => ({ x: p.x - cam.x, y: p.y }));
      hrib.morph(target, { duration: 1.8, lag: 0.4 });
      keep(gsap.to(sparkEl, { opacity: 0, duration: 0.6 }));
      keep(gsap.to(veil, { opacity: 0, duration: 1.8, ease: 'power1.inOut' }));
      if (!reduced) {
        keep(gsap.to(world, { scale: 1, duration: 1.9, ease: 'power2.inOut' }));
        await done(keep(gsap.to(big, { ...from, duration: 1.9, ease: 'power3.inOut' })));
      } else {
        await done(keep(gsap.to(big, { opacity: 0, duration: 0.8 })));
      }
      developed(c.pol);
      c.dev = true;
      c.el.classList.add('in');
      c.el.style.visibility = '';
      big.remove();
      sparkEl.remove();
      heroLayer.classList.remove('on');
      await hrib.fade(0, 0.8);
      ribbons.delete(hrib);
      hrib.destroy();
      gsap.set(world, { clearProps: 'transform,transformOrigin' });
      state.hold = false;
    }

    function gatherMotes(rect) {
      const cv = el.querySelector('.hr-motes');
      const dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.5);
      cv.width = Math.round(vw * dpr);
      cv.height = Math.round(vh * dpr);
      const g = cv.getContext('2d');
      const N = low ? 30 : 80;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const R0 = Math.hypot(vw, vh) * 0.62;
      const per = 2 * (rect.width + rect.height);
      const motes = Array.from({ length: N }, () => {
        // a target on the photograph's edge
        let d = Math.random() * per;
        let tx; let ty;
        if (d < rect.width) { tx = rect.left + d; ty = rect.top; } else if ((d -= rect.width) < rect.height) { tx = rect.right; ty = rect.top + d; } else if ((d -= rect.height) < rect.width) { tx = rect.right - d; ty = rect.bottom; } else { d -= rect.width; tx = rect.left; ty = rect.bottom - d; }
        const a = Math.random() * Math.PI * 2;
        return { a, r: R0 * (0.8 + Math.random() * 0.4), tx, ty, delay: Math.random() * 0.6, dur: 1.3 + Math.random() * 0.9, s: 1 + Math.random() * 2.2, spin: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random()) };
      });
      const dot = document.createElement('canvas');
      dot.width = dot.height = 32;
      const dg = dot.getContext('2d');
      const gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,250,230,1)');
      gr.addColorStop(0.3, 'rgba(255,214,140,.75)');
      gr.addColorStop(1, 'rgba(255,190,100,0)');
      dg.fillStyle = gr;
      dg.fillRect(0, 0, 32, 32);
      audio.sfx('shimmer');
      return new Promise((res) => {
        const t0 = performance.now();
        const step = () => {
          if (signal.aborted) return res();
          const tt = (performance.now() - t0) / 1000;
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.clearRect(0, 0, vw, vh);
          g.globalCompositeOperation = 'lighter';
          let alive = false;
          for (const m of motes) {
            const k = clamp((tt - m.delay) / m.dur, 0, 1);
            if (k >= 1) continue;
            alive = true;
            const e = 1 - (1 - k) ** 3;
            const ang = m.a + m.spin * (1 - e) * 1.6;
            const sx = cx + Math.cos(ang) * m.r;
            const sy = cy + Math.sin(ang) * m.r;
            const x = sx + (m.tx - sx) * e;
            const y = sy + (m.ty - sy) * e;
            const a = Math.min(1, k * 4) * (1 - Math.max(0, (k - 0.85) / 0.15));
            const s = m.s * (2 + 3 * e);
            g.globalAlpha = a;
            g.drawImage(dot, x - s * 2, y - s * 2, s * 4, s * 4);
          }
          g.globalAlpha = 1;
          if (alive || tt < 0.2) requestAnimationFrame(step);
          else { g.clearRect(0, 0, vw, vh); cv.width = cv.height = 1; res(); }
        };
        requestAnimationFrame(step);
      });
    }
  },

  async exit() {
    (this.tweens || []).forEach((tw) => tw && tw.kill());
    (this.cleanups || []).forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
    (this.ribbons || new Set()).forEach((r) => r.destroy());
    this.ribbons = null;
    this.tweens = [];
    this.cleanups = [];
  },
};
