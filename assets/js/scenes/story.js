// Chapter — How It Began.
//
// Her real memories (messages.json → story.memories, written by the owner), in order, on the
// golden thread that followed us out of the tower window. Each memory is staged by its `kind`:
//   beginning — the thread ties its first knot; her photos develop beside it
//   daily     — small lights bead along the thread, one after another, like days
//   journey   — the view from a bus / train window: the world slides by, her photos in the glass
//   sharing   — little blank notes and lights drift in and gather onto the thread
//   moment    — any memory added later: a "when" label, the words, its photos on the thread
// Photos come from the 'story' photo chapter, linked to a memory by `memory`; untagged photos
// join the last memory. Nothing here invents words: blank notes carry scribbles, not messages.
import { createRibbon } from '../core/ribbon.js';
import { esc } from '../core/art.js';

const KINDS = new Set(['beginning', 'daily', 'journey', 'sharing', 'moment']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

/** "It started at a college event. That’s where we met." → two lines; tiny sentences join the next one. */
function splitLines(text) {
  const parts = String(text || '').split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev && prev.length < 12) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out;
}

export default {
  id: 'story',
  title: 'How It Began',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const reduced = !!device.reducedMotion;
    const low = device.tier === 'low' || !!device.lowPower;
    const t = ctx.text.story || {};
    const cleanups = (this.cleanups = []);
    const tws = (this.tweens = []);
    const keep = (tw) => { tws.push(tw); return tw; };
    const wait = (s) => ctx.wait(reduced ? Math.min(s, Math.max(0.4, s * 0.6)) : s);
    const sfx = (n) => { try { audio.sfx(n); } catch { /* sound is optional */ } };
    const tween = (target, vars) => new Promise((res) => keep(gsap.to(target, { ...vars, onComplete: res })));

    /* ---------------------------------------------------------- the memories */
    const photos = ctx.photos('story').filter((p) => !p.isPlaceholder);
    const mems = (Array.isArray(t.memories) ? t.memories : []).filter((m) => m && typeof m === 'object');
    const byMem = new Map(mems.map((m) => [m.id, []]));
    const loose = [];
    for (const p of photos) (p.memory && byMem.has(p.memory) ? byMem.get(p.memory) : loose).push(p);
    if (loose.length && mems.length) byMem.get(mems[mems.length - 1].id).push(...loose);
    let beats = mems.map((m) => ({
      id: m.id,
      kind: KINDS.has(m.kind) ? m.kind : 'moment',
      when: ctx.fill(m.when || '').trim(),
      lines: splitLines(ctx.fill(m.text || '')), // '' while the owner hasn't written it → no words
      photos: byMem.get(m.id) || [],
    })).filter((b) => b.lines.length || b.photos.length);
    if (!beats.length && loose.length) beats = [{ id: 'loose', kind: 'moment', when: '', lines: [], photos: loose }];
    await Promise.race([Promise.all(beats.flatMap((b) => b.photos.slice(0, 6)).map((p) => ctx.preload(p.thumbUrl || p.url))), ctx.wait(5)]);

    /* ---------------------------------------------------------- the stage */
    el.innerHTML = `
      <div class="st-sky" aria-hidden="true"><i class="st-sun"></i><i class="st-haze"></i></div>
      <div class="st-window" aria-hidden="true" hidden>
        <div class="st-glass">
          <i class="st-land st-far"></i><i class="st-land st-mid"></i><i class="st-land st-near"></i><i class="st-poles"></i>
          <div class="st-win-photos"></div>
          <i class="st-sheen"></i>
        </div>
        <i class="st-rail"></i>
      </div>
      <div class="st-thread" aria-hidden="true"></div>
      <canvas class="st-beads" aria-hidden="true"></canvas>
      <div class="st-notes" aria-hidden="true"></div>
      <div class="st-prints"></div>
      <div class="st-words" role="status" aria-live="polite"><p class="st-when"></p><div class="st-text"></div></div>`;
    const sky = el.querySelector('.st-sky');
    const win = el.querySelector('.st-window');
    const winPhotos = el.querySelector('.st-win-photos');
    const threadLayer = el.querySelector('.st-thread');
    const beadCanvas = el.querySelector('.st-beads');
    const notesLayer = el.querySelector('.st-notes');
    const printsLayer = el.querySelector('.st-prints');
    const whenEl = el.querySelector('.st-when');
    const textEl = el.querySelector('.st-text');

    const W = () => el.clientWidth || window.innerWidth;
    const H = () => el.clientHeight || window.innerHeight;
    const portrait = () => H() >= W();
    /** where photos may go: below the words, above the bottom controls */
    const box = () => {
      const w = W(); const h = H();
      return portrait()
        ? { x: w * 0.06, y: h * 0.3, w: w * 0.88, h: h * 0.5 }
        : { x: w * 0.16, y: h * 0.34, w: w * 0.68, h: h * 0.54 };
    };

    const rib = createRibbon(threadLayer, { strands: 5, width: 2, glow: 0.9, device });
    cleanups.push(() => rib.destroy());
    let pathGen = null;
    const setPath = (gen) => { pathGen = gen; rib.setPath(gen()); };
    const morphTo = (gen, duration = 2.2) => { pathGen = gen; return rib.morph(gen(), { duration: reduced ? 0.8 : duration, ease: 'power2.inOut' }); };
    const onResize = () => { if (pathGen) rib.setPath(pathGen()); sizeBeads(); };
    window.addEventListener('resize', onResize);
    cleanups.push(() => window.removeEventListener('resize', onResize));

    /* ---------------------------------------------------------- paths (screen px) */
    const P = (x, y) => ({ x, y });
    const knotPath = () => {
      const w = W(); const h = H(); const b = box();
      const cx = w * 0.5; const cy = b.y - h * (portrait() ? 0.012 : 0.035); const r = Math.min(w, h) * (portrait() ? 0.06 : 0.045);
      const pts = [P(-w * 0.08, cy - h * 0.03), P(w * 0.18, cy - h * 0.015), P(cx - r * 1.6, cy + r * 0.2)];
      for (let i = 0; i <= 16; i++) { const a = Math.PI * 0.9 + (i / 16) * Math.PI * 2.15; pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9)); }
      pts.push(P(cx + r * 2.2, cy + r * 0.9), P(w * 0.82, cy + h * 0.02), P(w * 1.08, cy - h * 0.02));
      return pts;
    };
    const wavePath = (yFrac, amp = 0.035, cycles = 1.15, phase = 0) => () => {
      const w = W(); const h = H(); const pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(P(-w * 0.08 + u * w * 1.16, h * yFrac + Math.sin(phase + u * cycles * Math.PI * 2) * h * amp)); }
      return pts;
    };
    const railPath = () => {
      const w = W(); const r = win.getBoundingClientRect(); const host = el.getBoundingClientRect();
      const y = r.bottom - host.top + H() * 0.03;
      const pts = [];
      for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(P(-w * 0.08 + u * w * 1.16, y + Math.sin(u * Math.PI * 3) * 3)); }
      return pts;
    };
    const risePath = () => {
      const w = W(); const h = H(); const b = box();
      return [P(-w * 0.06, b.y + b.h * 1.02), P(w * 0.2, b.y + b.h * 0.8), P(w * 0.45, b.y + b.h * 0.62), P(w * 0.6, b.y + b.h * 0.36), P(w * 0.84, b.y + b.h * 0.12), P(w * 1.06, b.y - h * 0.05)];
    };
    const exitPath = () => {
      const w = W(); const h = H();
      return [P(-w * 0.06, h * 0.72), P(w * 0.28, h * 0.62), P(w * 0.52, h * 0.5), P(w * 0.72, h * 0.34), P(w * 0.9, h * 0.18), P(w * 1.1, h * 0.02)];
    };

    /* ---------------------------------------------------------- words */
    const wordsIn = (node, text) => {
      node.textContent = '';
      const spans = String(text).split(/(\s+)/).filter(Boolean).map((w) => {
        if (/^\s+$/.test(w)) { node.appendChild(document.createTextNode(' ')); return null; }
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w;
        node.appendChild(s);
        return s;
      }).filter(Boolean);
      keep(gsap.fromTo(spans, reduced ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: reduced ? 0.5 : 1.2, ease: 'power3.out', stagger: reduced ? 0 : 0.07 }));
      return spans.length;
    };
    async function speak(beat) {
      textEl.innerHTML = '';
      whenEl.textContent = beat.when;
      gsap.set(whenEl, { opacity: 0 });
      if (beat.when) keep(gsap.to(whenEl, { opacity: 1, duration: 0.9 }));
      for (const line of beat.lines) {
        const p = document.createElement('p');
        p.className = 'st-line';
        textEl.appendChild(p);
        const n = wordsIn(p, line);
        await wait(Math.max(2.3, 1.0 + n * 0.34));
      }
    }
    async function hush() {
      await tween([whenEl, textEl], { opacity: 0, y: reduced ? 0 : -8, duration: 0.8, ease: 'power2.in' });
      textEl.innerHTML = '';
      whenEl.textContent = '';
      gsap.set([whenEl, textEl], { opacity: 1, y: 0 });
    }

    /* ---------------------------------------------------------- prints (her photos, untouched) */
    function makePrint(p, w, cls = '') {
      const f = document.createElement('figure');
      f.className = `st-print ${cls}`;
      f.style.width = `${Math.round(w)}px`;
      f.innerHTML = `<div class="ph" style="aspect-ratio:${p.ratio}"><img alt="${esc(p.alt)}" decoding="async" src="${esc(p.url)}"${p.srcset ? ` srcset="${esc(p.srcset)}" sizes="${Math.round(w)}px"` : ''} style="object-position:${esc(p.objectPosition)}"></div>${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}`;
      return f;
    }
    /** Lay 1–4 prints in the photo box: a loose, overlapping fan, alternating tilt. */
    function fan(list, { maxW = null } = {}) {
      const b = box();
      const n = Math.min(list.length, 4);
      const els = [];
      list.slice(0, n).forEach((p, i) => {
        const r = p.ratio || 0.75;
        const wide = r > 1.2; // landscape photos get a wider card
        const cellW = n === 1 ? b.w * (wide ? 0.94 : 0.74) : n === 2 ? b.w * (wide ? 0.8 : 0.6) : b.w * (wide ? 0.66 : 0.5);
        const cellH = n === 1 ? b.h * 0.92 : n === 2 ? b.h * 0.64 : b.h * 0.52;
        let w = Math.min(cellW, cellH * r, maxW || Infinity);
        if (!portrait()) w = Math.min(w, b.w * (n === 1 ? (wide ? 0.62 : 0.5) : (wide ? 0.46 : 0.36)));
        const h = w / r + 16;
        const fx2 = n === 1 ? 0.5 : i / (n - 1);
        const cx = b.x + b.w * (n === 1 ? 0.5 : portrait() ? 0.3 + fx2 * 0.4 : 0.22 + fx2 * 0.56);
        const cy = b.y + (n === 1 ? b.h * 0.5 : portrait() ? h / 2 + fx2 * (b.h - h) : b.h * (0.42 + (i % 2) * 0.16));
        const f = makePrint(p, w);
        f.style.left = `${Math.round(clamp(cx - w / 2, 6, W() - w - 6))}px`;
        f.style.top = `${Math.round(clamp(cy - h / 2, b.y - 10, b.y + b.h - h + 10))}px`;
        f.style.zIndex = String(10 + i);
        printsLayer.appendChild(f);
        els.push({ el: f, rot: (i % 2 ? 1 : -1) * rnd(2, 4.5) });
      });
      return els;
    }
    async function develop(items, { stagger = 0.9 } = {}) {
      for (const [i, it] of items.entries()) {
        const img = it.el.querySelector('img');
        keep(gsap.fromTo(it.el, { opacity: 0, y: reduced ? 0 : 26, rotation: it.rot * 2 }, { opacity: 1, y: 0, rotation: it.rot, duration: reduced ? 0.6 : 1.4, ease: 'power3.out' }));
        if (!reduced) keep(gsap.fromTo(img, { filter: 'brightness(1.8) saturate(0) blur(4px)' }, { filter: 'brightness(1) saturate(1) blur(0px)', duration: 2.2, ease: 'sine.out', clearProps: 'filter' }));
        if (i < items.length - 1) await wait(stagger);
      }
    }
    async function clearPrints(dir = -1) {
      const all = [...printsLayer.children];
      if (!all.length) return;
      await tween(all, { opacity: 0, y: reduced ? 0 : dir * 40, duration: 0.9, stagger: 0.08, ease: 'power2.in' });
      all.forEach((n) => n.remove());
    }

    /* ---------------------------------------------------------- beads (daily) */
    const bctx = beadCanvas.getContext('2d');
    let dpr = 1;
    function sizeBeads() {
      dpr = Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2);
      beadCanvas.width = Math.round(W() * dpr);
      beadCanvas.height = Math.round(H() * dpr);
    }
    sizeBeads();
    const sprite = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,248,226,1)');
      grd.addColorStop(0.25, 'rgba(255,214,130,.85)');
      grd.addColorStop(0.6, 'rgba(244,180,90,.18)');
      grd.addColorStop(1, 'rgba(244,180,90,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
      return c;
    })();
    const beads = [];
    let beadAlpha = 1;
    let beadRaf = 0;
    let lastT = performance.now();
    const beadLoop = (now) => {
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, beadCanvas.width, beadCanvas.height);
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.globalCompositeOperation = 'lighter';
      for (const b of beads) {
        b.age += dt;
        if (!reduced) b.u = Math.min(0.995, b.u + b.v * dt);
        const p = rib.pointAt(b.u);
        const tw = 0.75 + 0.25 * Math.sin(now / 420 + b.ph);
        const a = Math.min(1, b.age / 0.35) * tw * beadAlpha;
        const s = b.s * (b.age < 0.35 ? 1.6 - b.age / 0.35 * 0.6 : 1);
        bctx.globalAlpha = a;
        bctx.drawImage(sprite, p.x - s, p.y - s, s * 2, s * 2);
      }
      bctx.globalAlpha = 1;
      beadRaf = beads.length && beadAlpha > 0.01 ? requestAnimationFrame(beadLoop) : 0;
    };
    const startBeads = () => { if (!beadRaf) { lastT = performance.now(); beadRaf = requestAnimationFrame(beadLoop); } };
    cleanups.push(() => cancelAnimationFrame(beadRaf));

    /* ---------------------------------------------------------- the beats */
    async function beginning(beat) {
      sfx('shimmer');
      const words = speak(beat);
      await wait(0.6);
      const prints = fan(beat.photos);
      // the first knot: a little spark where the thread loops
      const b = box();
      setTimeout(() => !ctx.signal.aborted && fx.sparkle(W() * 0.5, b.y - H() * (portrait() ? 0.012 : 0.035), low ? 10 : 18, { spread: 46 }), 400);
      await develop(prints);
      await words;
      await wait(prints.length ? 2.6 : 1.4);
    }

    async function daily(beat) {
      await morphTo(wavePath(portrait() ? 0.83 : 0.86, 0.03, 1.1), 2.4);
      const words = speak(beat);
      sfx('sparkle');
      // one light after another, quicker and quicker: days
      const total = reduced ? 40 : low ? 70 : 140;
      beadAlpha = 1;
      startBeads();
      let gap = 0.16;
      for (let i = 0; i < total; i++) {
        beads.push({ u: 0.03 + (i / total) * 0.9 + rnd(-0.004, 0.004), v: rnd(0.004, 0.012), s: rnd(4, 7.5), age: 0, ph: rnd(0, 6.3) });
        startBeads();
        if (i === 12) { const prints = fan(beat.photos); develop(prints, { stagger: 1 }); }
        gap = Math.max(0.012, gap * 0.94);
        await ctx.wait(reduced ? 0.01 : gap);
      }
      await words;
      await wait(2.6);
      await tween({ v: 1 }, { v: 0, duration: 1.2, onUpdate() { beadAlpha = this.targets()[0].v; } });
      beads.length = 0;
    }

    async function journey(beat) {
      win.hidden = false;
      win.classList.toggle('is-train', false);
      keep(gsap.fromTo(win, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: reduced ? 0.6 : 1.4, ease: 'power3.out' }));
      audio.setMood('wonder');
      await morphTo(railPath, 2);
      rib.flow(true);
      const words = speak(beat);
      const shots = beat.photos.slice(0, 6);
      for (const [i, p] of shots.entries()) {
        const r = win.querySelector('.st-glass').getBoundingClientRect();
        const h = r.height * 0.78;
        const w = Math.min(r.width * 0.7, h * (p.ratio || 1));
        const f = makePrint(p, w, 'st-in-window');
        winPhotos.appendChild(f);
        const prev = winPhotos.children.length > 1 ? winPhotos.children[0] : null;
        if (prev) keep(gsap.to(prev, { opacity: 0, x: reduced ? 0 : -60, duration: 0.9, ease: 'power2.in', onComplete: () => prev.remove() }));
        keep(gsap.fromTo(f, { opacity: 0, x: reduced ? 0 : 50, rotation: i % 2 ? 2 : -2 }, { opacity: 1, x: 0, rotation: i % 2 ? 1.5 : -1.5, duration: reduced ? 0.5 : 1.1, ease: 'power3.out' }));
        if (!reduced) keep(gsap.to(f, { y: '+=3', duration: 0.42, yoyo: true, repeat: 7, ease: 'sine.inOut' })); // the road under the wheels
        if (i === Math.floor(shots.length / 2)) win.classList.add('is-train'); // …and later, rails
        const head = rib.pointAt(0.08 + (i / Math.max(1, shots.length)) * 0.84);
        fx.sparkle(head.x, head.y, low ? 4 : 8, { spread: 18 });
        await wait(2.6);
      }
      await words;
      await wait(shots.length ? 1.4 : 2.4);
      rib.flow(false);
      await tween(win, { opacity: 0, duration: 1, ease: 'sine.in' });
      winPhotos.innerHTML = '';
      win.hidden = true;
      audio.setMood('tender');
    }

    function noteSVG() {
      const lines = Array.from({ length: 3 + Math.floor(Math.random() * 2) }, (_, k) => {
        const y = 26 + k * 15;
        const x1 = 16 + rnd(0, 6);
        const x2 = (k === 3 ? 60 : 100) + rnd(-14, 8);
        let d = `M${x1} ${y}`;
        for (let x = x1; x < x2; x += 9) d += ` q4 ${rnd(-4, 4).toFixed(1)} 9 ${rnd(-1.5, 1.5).toFixed(1)}`;
        return `<path d="${d}" />`;
      }).join('');
      return `<svg viewBox="0 0 120 92"><path class="st-paper" d="M6 4 h96 l12 12 v70 a2 2 0 0 1 -2 2 h-106 a2 2 0 0 1 -2 -2 v-80 a2 2 0 0 1 2 -2z"/><path class="st-fold" d="M102 4 v10 a2 2 0 0 0 2 2 h10"/><g class="st-ink">${lines}</g></svg>`;
    }

    async function sharing(beat) {
      ctx.grade('sunset');
      sky.classList.add('is-dusk');
      await morphTo(risePath, 2.4);
      const words = speak(beat);
      sfx('pageTurn');
      const n = reduced ? 3 : low ? 5 : 8;
      const notes = [];
      for (let i = 0; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'st-note';
        d.innerHTML = noteSVG();
        const w = W(); const h = H();
        const size = clamp(Math.min(w, h) * rnd(0.15, 0.2), 64, 130);
        d.style.width = `${Math.round(size)}px`;
        d.style.left = `${Math.round(rnd(0.04, 0.96) * w - size / 2)}px`;
        d.style.top = `${Math.round(rnd(0.3, 0.86) * h)}px`;
        notesLayer.appendChild(d);
        notes.push(d);
        const ink = [...d.querySelectorAll('.st-ink path')];
        ink.forEach((pth) => { const L = pth.getTotalLength ? pth.getTotalLength() : 100; pth.style.strokeDasharray = `${L}`; pth.style.strokeDashoffset = `${L}`; });
        keep(gsap.fromTo(d, { opacity: 0, y: reduced ? 0 : 40, rotation: rnd(-14, 14) }, { opacity: 0.92, y: 0, rotation: rnd(-8, 8), duration: reduced ? 0.5 : 1.6, delay: i * 0.35, ease: 'power2.out' }));
        keep(gsap.to(ink, { strokeDashoffset: 0, duration: reduced ? 0.4 : 1.4, delay: 0.4 + i * 0.35, stagger: 0.25, ease: 'none' }));
        if (!reduced) keep(gsap.to(d, { y: '-=14', duration: rnd(2.4, 3.4), yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.6 + i * 0.35 }));
      }
      await wait(1.2);
      const prints = fan(beat.photos, { maxW: Math.min(W(), H()) * 0.46 });
      await develop(prints, { stagger: 1.1 });
      await words;
      await wait(2.4);
      // everything she told me, gathered onto the thread
      sfx('magic');
      const host = el.getBoundingClientRect();
      notes.forEach((d, i) => {
        gsap.killTweensOf(d);
        const p = rib.pointAt(0.15 + (i / Math.max(1, n - 1)) * 0.7);
        const r = d.getBoundingClientRect();
        keep(gsap.to(d, {
          x: p.x - (r.left - host.left) - r.width / 2, y: p.y - (r.top - host.top) - r.height / 2, scale: 0.12, opacity: 0, rotation: 0,
          duration: reduced ? 0.6 : 1.5, delay: i * 0.08, ease: 'power2.in',
          onComplete: () => { if (!ctx.signal.aborted) fx.sparkle(p.x, p.y, low ? 3 : 6, { spread: 14 }); },
        }));
      });
      rib.tween('glow', 1.25, 1.6);
      await wait(2);
      rib.tween('glow', 0.9, 1.4);
      notesLayer.innerHTML = '';
    }

    async function moment(beat) {
      await morphTo(wavePath(portrait() ? 0.31 : 0.29, 0.02, 0.9, beats.indexOf(beat)), 2);
      const words = speak(beat);
      await wait(0.5);
      await develop(fan(beat.photos), { stagger: 0.9 });
      await words;
      await wait(beat.photos.length ? 2.8 : 1.6);
    }

    const STAGE = { beginning, daily, journey, sharing, moment };

    /* ============================================================ play */
    ctx.grade('day');
    audio.setMood('tender');
    fx.dust({ density: low ? 0.25 : 0.4, alpha: 0.8 });
    keep(gsap.fromTo(sky, { opacity: 0.6 }, { opacity: 1, duration: 1.6 }));
    await ui.chapterCard(t.kicker || 'Chapter Two', t.title || 'How It Began');

    // the thread that drifted past the tower window comes in and ties its first knot
    setPath(beats[0] && beats[0].kind === 'beginning' ? knotPath : wavePath(0.31, 0.02));
    rib.set({ head: 0 });
    await rib.draw({ duration: reduced ? 1 : 2.8, ease: 'power2.inOut' });

    for (const [i, beat] of beats.entries()) {
      if (i > 0) { await Promise.all([hush(), clearPrints()]); await wait(0.3); }
      await STAGE[beat.kind](beat);
    }
    await Promise.all([hush(), clearPrints(-1)]);

    // every memory, another strand — and the thread goes on, into the next chapter
    await morphTo(exitPath, 2.2);
    if (t.end) {
      const end = { when: '', lines: splitLines(ctx.fill(t.end)), photos: [] };
      if (end.lines.length) await speak(end);
    }
    rib.flow(true);
    await ui.waitContinue('Continue');
    rib.flow(false);
    await hush();
    const head = rib.pointAt(0.97);
    await rib.fade(0, reduced ? 0.5 : 1.1);
    ctx.next({ kind: 'glow', x: clamp(head.x, 0, W()), y: clamp(head.y, 0, H()), color: '#ffd98a' });
  },

  async exit() {
    (this.tweens || []).forEach((tw) => tw && tw.kill && tw.kill());
    (this.cleanups || []).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    this.tweens = [];
    this.cleanups = [];
  },
};
