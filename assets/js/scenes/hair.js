// Chapter Two — Every Strand, a Memory.
// A glowing golden braid flows across a dusk sky; polaroids hang from it and
// develop like instant film as the camera dollies past.
import { esc, towerSVG } from '../core/art.js';
import { makeStars } from '../core/sky.js';

function braidPath(W, H, n, spacing, x0) {
  // A gentle wave across the whole track, dipping where each photo hangs.
  const pts = [];
  const steps = n * 2 + 2;
  for (let i = 0; i <= steps; i++) {
    const x = x0 - spacing * 0.6 + (i / steps) * (spacing * (n + 0.6));
    const y = H * 0.24 + Math.sin(i * 1.3) * H * 0.045 + (i % 2 ? H * 0.025 : -H * 0.02);
    pts.push([x, y]);
  }
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const cx = (px + x) / 2;
    d += ` C${cx} ${py} ${cx} ${y} ${x} ${y}`;
  }
  return d;
}

export default {
  id: 'hair',
  title: 'Every Strand, a Memory',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const t = ctx.text.hair || {};
    const photos = ctx.chapter('hair');
    await Promise.all(photos.map((p) => ctx.preload(p.url)));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const n = photos.length;
    const spacing = Math.max(vw * (vw < 700 ? 0.78 : 0.34), 300);
    const x0 = vw * 0.5 + spacing * 0.9;
    const trackW = x0 + spacing * (n - 1) + vw * 0.6;

    el.innerHTML = `
      <div class="hr-sky"></div>
      <div class="hr-far">${towerSVG({ className: 'hr-tower' })}</div>
      <div class="hr-hills"></div>
      <div class="hr-track" style="width:${trackW}px">
        <svg class="hr-braid" width="${trackW}" height="${vh}" viewBox="0 0 ${trackW} ${vh}">
          <defs>
            <linearGradient id="hr-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff2c4"/><stop offset=".45" stop-color="#f4c463"/><stop offset="1" stop-color="#b8792a"/>
            </linearGradient>
          </defs>
          <path class="hr-guide" d="" fill="none" stroke="none"/>
          <path class="hr-glow" d="" fill="none" stroke="#ffcf7a" stroke-width="34" stroke-linecap="round" opacity=".18"/>
          <g class="hr-plaits"></g>
          <path class="hr-pulse" d="" fill="none" stroke="#fff6dc" stroke-width="6" stroke-linecap="round" opacity=".95"/>
          <g class="hr-strands" fill="none" stroke="#ffe3a3" stroke-linecap="round"></g>
          <g class="hr-flowers"></g>
        </svg>
        <div class="hr-photos"></div>
      </div>`;
    makeStars(el.querySelector('.hr-sky'), { count: 140 });
    const track = el.querySelector('.hr-track');
    const svg = el.querySelector('.hr-braid');
    const d = braidPath(trackW, vh, n, spacing, x0);
    const guide = svg.querySelector('.hr-guide');
    guide.setAttribute('d', d);
    svg.querySelector('.hr-glow').setAttribute('d', d);
    const pulse = svg.querySelector('.hr-pulse');
    pulse.setAttribute('d', d);
    const L = guide.getTotalLength();

    // braid: overlapping plaits along the path, alternating sides
    const plaits = svg.querySelector('.hr-plaits');
    const step = device.lowPower ? 16 : 12;
    let frag = '';
    for (let s = 0, k = 0; s < L; s += step, k++) {
      const p = guide.getPointAtLength(s);
      const q = guide.getPointAtLength(Math.min(L, s + 1));
      const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
      const side = k % 2 ? 1 : -1;
      frag += `<ellipse cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" rx="14" ry="6.5" transform="rotate(${(ang + side * 28).toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}) translate(0 ${side * 2.5})" />`;
    }
    plaits.innerHTML = frag;
    plaits.setAttribute('fill', 'url(#hr-gold)');
    plaits.setAttribute('stroke', '#a86d22');
    plaits.setAttribute('stroke-width', '0.8');

    // loose strands
    const strands = svg.querySelector('.hr-strands');
    strands.innerHTML = [-9, 7, -4, 11].map((off, i) => `<path d="${d}" transform="translate(0 ${off})" stroke-width="${i % 2 ? 0.8 : 1.2}" opacity="${0.35 + i * 0.08}"/>`).join('');

    // little flowers woven into the braid
    const flowers = svg.querySelector('.hr-flowers');
    const fcol = ['#f2a7c3', '#b9a3e3', '#8fb3e8', '#fff4e0', '#ff8fb8'];
    let ff = '';
    for (let s = 60, k = 0; s < L; s += 95 + (k * 37) % 60, k++) {
      const p = guide.getPointAtLength(s);
      const c = fcol[k % fcol.length];
      const sc = 0.7 + ((k * 13) % 7) / 10;
      ff += `<g transform="translate(${p.x.toFixed(1)} ${(p.y + (k % 2 ? 5 : -5)).toFixed(1)}) scale(${sc})">${[0, 72, 144, 216, 288].map((a) => `<ellipse transform="rotate(${a}) translate(0 -5)" rx="3.6" ry="5.5" fill="${c}"/>`).join('')}<circle r="2.6" fill="#ffd27a"/></g>`;
    }
    flowers.innerHTML = ff;

    // hanging polaroids
    const holder = el.querySelector('.hr-photos');
    const cardW = Math.min(vw * (vw < 700 ? 0.6 : 0.2), 300);
    const cards = photos.map((p, i) => {
      const cx = x0 + i * spacing;
      // find braid y at cx
      let lo = 0, hi = L;
      for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (guide.getPointAtLength(mid).x < cx) lo = mid; else hi = mid; }
      const at = guide.getPointAtLength(lo);
      const drop = vh * (0.07 + (i % 3) * 0.03);
      const card = document.createElement('div');
      card.className = 'hr-card';
      card.style.left = `${cx - cardW / 2}px`;
      card.style.top = `${at.y}px`;
      card.style.width = `${cardW}px`;
      const tilt = ((i * 37) % 11) - 5;
      card.innerHTML = `
        <div class="hr-string" style="height:${drop}px"></div>
        <div class="hr-swing">
          <div class="hr-sway" style="--tilt:${tilt}deg; --dur:${3.2 + (i % 4) * 0.45}s">
            <i class="hr-clip"></i>
            <div class="polaroid">
              <div class="ph" style="aspect-ratio:${p.ratio}"><img alt="" src="${p.url}"></div>
              <div class="cap"><span>${esc(p.caption || '')}</span></div>
            </div>
          </div>
        </div>`;
      holder.appendChild(card);
      return { el: card, x: cx, seen: false };
    });

    ctx.letterbox(true);
    fx.dust({ density: 0.55 });
    audio.setMood('wonder');

    // draw-on intro: braid sweeps in, pulse travels
    gsap.set(track, { x: 0 });
    gsap.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 2.4, ease: 'power2.out' });
    gsap.set(pulse, { strokeDasharray: `140 ${L}`, strokeDashoffset: 140 });
    gsap.to(pulse, { strokeDashoffset: -L, duration: 9, repeat: -1, ease: 'none' });

    await ui.chapterCard(t.kicker || 'Chapter Two', t.title || 'Every Strand, a Memory');

    // the dolly: pan the track; parallax background; polaroids develop on arrival
    const panTo = -(x0 + spacing * (n - 1) - vw * 0.5);
    const cam = { x: 0 };
    const far = el.querySelector('.hr-far');
    const hills = el.querySelector('.hr-hills');
    const render = () => {
      gsap.set(track, { x: cam.x });
      gsap.set(far, { x: cam.x * 0.06 });
      gsap.set(hills, { x: cam.x * 0.18 });
      for (const c of cards) {
        const sx = c.x + cam.x;
        if (!c.seen && sx < vw * 0.82) {
          c.seen = true;
          develop(c.el);
        }
      }
    };
    const develop = (card) => {
      const sw = card.querySelector('.hr-swing');
      const img = card.querySelector('img');
      const cap = card.querySelector('.cap span');
      card.classList.add('in');
      gsap.fromTo(sw, { y: -vh * 0.4, rotation: -18, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 1.6, ease: 'elastic.out(1, 0.55)' });
      gsap.fromTo(card.querySelector('.hr-string'), { scaleY: 0 }, { scaleY: 1, duration: 0.8, ease: 'power2.out', transformOrigin: '50% 0%' });
      gsap.fromTo(img, { filter: 'brightness(2.2) saturate(0) sepia(.6) contrast(.6) blur(3px)', opacity: 0.25 }, { filter: 'brightness(1) saturate(1) sepia(0) contrast(1) blur(0px)', opacity: 1, duration: 3.4, delay: 0.5, ease: 'power2.out' });
      gsap.fromTo(cap, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.6, delay: 1.6, ease: 'power1.inOut' });
      audio.sfx('pageTurn');
      const r = card.getBoundingClientRect();
      setTimeout(() => fx.sparkle(r.left + r.width / 2, Math.max(40, r.top + 30), 8, { spread: 40 }), 500);
    };
    gsap.ticker.add(render);
    this.cleanup = () => gsap.ticker.remove(render);

    const total = n * 3.6 + 3;
    const pan = gsap.to(cam, { x: panTo, duration: total, ease: 'sine.inOut' });

    // drag to scrub the dolly
    let dragging = false;
    let lastX = 0;
    const down = (e) => { dragging = true; lastX = e.clientX; pan.pause(); };
    const move = (e) => {
      if (!dragging) return;
      cam.x = Math.min(0, Math.max(panTo, cam.x + (e.clientX - lastX) * 1.2));
      lastX = e.clientX;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      const remaining = Math.abs((cam.x - panTo) / panTo);
      pan.kill();
      if (remaining > 0.01) gsap.to(cam, { x: panTo, duration: Math.max(2, total * remaining), ease: 'sine.inOut' });
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const prev = this.cleanup;
    this.cleanup = () => { prev(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };

    const lines = t.lines || [];
    await ctx.wait(1.5);
    await ui.narrate(lines.slice(0, 1), { position: 'bottom' });
    await ctx.wait(total * 0.22);
    await ui.narrate(lines.slice(1, 2), { position: 'bottom' });
    await ctx.wait(total * 0.18);
    await ui.narrate(lines.slice(2), { position: 'bottom' });
    // make sure we've arrived
    while (cam.x > panTo + 4 && !ctx.signal.aborted) await ctx.wait(0.5);
    await ctx.wait(2);
    await ui.waitContinue('Continue');
    ctx.next();
  },
  async exit() {
    this.cleanup && this.cleanup();
    this.cleanup = null;
  },
};
