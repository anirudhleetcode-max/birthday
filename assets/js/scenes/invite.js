// The very first screen after midnight: a calm night lake, a greeting, and one
// paper lantern waiting to be lit. Her tap is the gesture that starts the music
// (browsers block autoplay), lights the lantern, and sends it up into the sky —
// its light becomes the dawn of the prologue.
//
// Also exports the shared night-lake world (`nightscape`) and the original paper
// lantern drawing (`lanternArt`) used by the countdown gate.
import { esc, html } from '../core/art.js';
import { makeStars, shootingStar } from '../core/sky.js';

let uid = 0;
const nid = (p) => `${p}${++uid}`;

/* ------------------------------------------------------------------ helpers */
/** Owner text with a fallback, tokens filled ({nick1}…). */
export function words(ctx, value, fallback = '') {
  const v = typeof value === 'string' && value.trim() ? value : fallback;
  return ctx.fill(v);
}

/** Rejects with AbortError when the scene exits (so long awaits never dangle). */
export function until(promise, signal) {
  return new Promise((res, rej) => {
    if (signal.aborted) return rej(new DOMException('aborted', 'AbortError'));
    const onAbort = () => rej(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then((v) => { signal.removeEventListener('abort', onAbort); res(v); }, rej);
  });
}

/* ------------------------------------------------------------------ the lantern */
// One paper sky-lantern (viewBox 0 0 100 140; the halo spills outside — keep overflow visible).
export const LANTERN_BODY = 'M24 120 C15 96 5 58 8 34 C10 18 28 9 50 9 C72 9 90 18 92 34 C95 58 85 96 76 120 C66 124 34 124 24 120 Z';

/**
 * An original paper lantern: unlit indigo paper with a moonlit rim and a waiting
 * ember; lit, the light floods upward from the flame (animate `.lt-fill` y 150 → -70)
 * and a faint sun motif shows through the paper.
 */
export function lanternArt({ className = '', ember = true } = {}) {
  const k = nid('lt');
  const ribs = [-2, -1, 1, 2].map((i) => `<path d="M${50 + i * 8} 10 C${50 + i * 21} 40 ${50 + i * 16.5} 95 ${50 + i * 10.6} 121"/>`).join('');
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI * 2) / 12;
    const r1 = 12.5;
    const r2 = i % 2 ? 17 : 21;
    return `M${(50 + Math.cos(a) * r1).toFixed(2)} ${(62 + Math.sin(a) * r1).toFixed(2)} L${(50 + Math.cos(a) * r2).toFixed(2)} ${(62 + Math.sin(a) * r2).toFixed(2)}`;
  }).join(' ');
  return `
<svg class="lt ${className}" viewBox="0 0 100 140" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${k}d" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5b4a92"/>
      <stop offset=".16" stop-color="#2f2560"/>
      <stop offset=".55" stop-color="#1f1846"/>
      <stop offset="1" stop-color="#140f33"/>
    </linearGradient>
    <linearGradient id="${k}l" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#fff2cc"/>
      <stop offset=".28" stop-color="#ffd283"/>
      <stop offset=".66" stop-color="#ffa64c"/>
      <stop offset="1" stop-color="#e2683a"/>
    </linearGradient>
    <radialGradient id="${k}i" cx="50" cy="106" r="74" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fffbe8" stop-opacity=".95"/>
      <stop offset=".42" stop-color="#ffe2a0" stop-opacity=".45"/>
      <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${k}h" cx="50" cy="80" r="118" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffe7ae" stop-opacity=".62"/>
      <stop offset=".34" stop-color="#ffbe62" stop-opacity=".22"/>
      <stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${k}f" cx="50" cy="114" r="12" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".45" stop-color="#ffe9a6"/>
      <stop offset="1" stop-color="#ff9d3c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${k}e" cx="50" cy="126" r="9" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff1c2"/>
      <stop offset=".3" stop-color="#ffb347" stop-opacity=".9"/>
      <stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${k}s" x1="0" y1="0" x2=".9" y2=".75">
      <stop offset="0" stop-color="#a99ae6" stop-opacity=".34"/>
      <stop offset=".45" stop-color="#6f5fb0" stop-opacity=".08"/>
      <stop offset="1" stop-color="#000" stop-opacity=".18"/>
    </linearGradient>
    <radialGradient id="${k}w" cx="50" cy="128" r="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffb35c" stop-opacity=".42"/>
      <stop offset=".5" stop-color="#d9764a" stop-opacity=".12"/>
      <stop offset="1" stop-color="#b9583a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${k}m" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#fff"/>
      <stop offset=".72" stop-color="#fff"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="${k}k" maskUnits="userSpaceOnUse" x="-60" y="-80" width="220" height="320">
      <rect class="lt-fill" x="-60" y="150" width="220" height="230" fill="url(#${k}m)"/>
    </mask>
  </defs>
  <circle class="lt-halo" cx="50" cy="80" r="118" fill="url(#${k}h)"/>
  <path class="lt-dark" d="${LANTERN_BODY}" fill="url(#${k}d)"/>
  <path class="lt-sheen" d="${LANTERN_BODY}" fill="url(#${k}s)"/>
  ${ember ? `<path class="lt-warmth" d="${LANTERN_BODY}" fill="url(#${k}w)"/>` : ''}
  <g class="lt-lit" mask="url(#${k}k)">
    <path d="${LANTERN_BODY}" fill="url(#${k}l)"/>
    <path d="${LANTERN_BODY}" fill="url(#${k}i)"/>
    <g class="lt-motif" fill="none" stroke="#d8662c" stroke-width="1.1" stroke-linecap="round" opacity=".42">
      <circle cx="50" cy="62" r="9"/><circle cx="50" cy="62" r="4" fill="#d8662c" fill-opacity=".35" stroke="none"/>
      <path d="${rays}"/>
    </g>
  </g>
  <g class="lt-ribs" fill="none" stroke-width=".9">${ribs}<path d="M50 9 L50 122"/><path d="M9 32 Q50 25 91 32"/></g>
  <path class="lt-edge" d="${LANTERN_BODY}" fill="none" stroke-width="1.1"/>
  <path class="lt-cap" d="M33 12 Q50 5 67 12" fill="none" stroke-width="1.4" stroke-linecap="round"/>
  <ellipse class="lt-ring" cx="50" cy="120.5" rx="26" ry="3.6" fill="none" stroke-width="1.4"/>
  <path class="lt-wire" d="M26 121 L47 127 M74 121 L53 127" fill="none" stroke-width=".8"/>
  ${ember ? `<circle class="lt-ember" cx="50" cy="126" r="9" fill="url(#${k}e)"/>` : ''}
  <rect class="lt-cell" x="46" y="125" width="8" height="4" rx="1.6"/>
  <path class="lt-flame" d="M50 99 C56 107 57.5 115 50 122 C42.5 115 44 107 50 99 Z" fill="url(#${k}f)"/>
</svg>`;
}

/** Light a lanternArt svg (returns the gsap timeline). */
export function lightLantern(gsap, svg, { duration = 1.8, reduced = false } = {}) {
  const tl = gsap.timeline();
  svg.classList.add('is-lit');
  const d = reduced ? 0.6 : duration;
  tl.fromTo(svg.querySelector('.lt-flame'), { opacity: 0, scale: 0.2, svgOrigin: '50 122' }, { opacity: 1, scale: 1, duration: d * 0.45, ease: 'back.out(2.2)' }, 0)
    .to(svg.querySelector('.lt-fill'), { attr: { y: -90 }, duration: d, ease: 'power2.inOut' }, d * 0.12)
    .fromTo(svg.querySelector('.lt-halo'), { opacity: 0, scale: 0.6, svgOrigin: '50 80' }, { opacity: 1, scale: 1, duration: d * 1.2, ease: 'power2.out' }, d * 0.25)
    .to(svg.querySelectorAll('.lt-ember, .lt-warmth'), { opacity: 0, duration: d * 0.5 }, 0);
  return tl;
}

/* ------------------------------------------------------------------ the night lake */
// Deterministic soft noise (sum of sines) so hills look hand-drawn, not random each load.
const ridge = (x, seed, oct = [[1, 1], [2.3, 0.45], [5.1, 0.18]]) =>
  oct.reduce((s, [f, a], i) => s + a * Math.sin(x * f * 6.283 + seed * (i + 1) * 1.7), 0);

/**
 * A deep night sky over a calm lake: stars, a faint milky band, distant hills with
 * a tiny tower (one warm window), a still water surface with slow shimmer.
 * Returns { root, layout(), hy (px), H, W, warm(el) }.
 */
export function nightscape(el, { device = {}, stars = 200, horizon } = {}) {
  const root = html(`
    <div class="ns" aria-hidden="true">
      <div class="ns-sky"></div>
      <div class="ns-band"></div>
      <div class="ns-stars"></div>
      <div class="ns-warm"></div>
      <svg class="ns-land" preserveAspectRatio="none"></svg>
    </div>`);
  el.appendChild(root);
  const tier = device.tier || 'high';
  makeStars(root.querySelector('.ns-stars'), { count: Math.round(stars * (tier === 'low' ? 0.55 : tier === 'mid' ? 0.8 : 1)) });
  const svg = root.querySelector('.ns-land');
  const state = { W: 0, H: 0, hy: 0 };
  const blur = tier !== 'low';

  function layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const hy = Math.round(H * (horizon ? horizon(W, H) : W > H ? 0.75 : 0.74));
    Object.assign(state, { W, H, hy });
    root.style.setProperty('--hy', `${hy}px`);
    el.style.setProperty('--hy', `${hy}px`);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const k = nid('ns');
    // far ridge (low, long) and framing hills that rise toward the screen edges
    const n = 48;
    const far = [];
    const near = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = t * W;
      const edge = Math.pow(Math.abs(t - 0.5) * 2, 2.4);
      far.push([x, hy - H * (0.012 + 0.012 * (ridge(t, 1.3) + 1.6) / 3.2) - H * 0.02 * edge]);
      near.push([x, hy - H * (0.004 + 0.07 * edge * (0.75 + 0.25 * ridge(t, 4.2))) + 1]);
    }
    const poly = (pts) => `M0 ${hy + 2} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L${W} ${hy + 2} Z`;
    const mirror = (pts) => `M0 ${hy} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${(2 * hy - y).toFixed(1)}`).join(' ')} L${W} ${hy} Z`;
    // the tiny tower on the far ridge (left third)
    const tx = W * (W > H ? 0.2 : 0.16);
    const tIdx = Math.round((tx / W) * n);
    const tBase = far[tIdx][1] + 1;
    const th = Math.max(26, H * 0.052);
    const tw = th * 0.2;
    const tower = `
      <path d="M${tx - tw / 2} ${tBase} L${tx - tw * 0.42} ${tBase - th * 0.72} L${tx - tw * 0.62} ${tBase - th * 0.72} L${tx} ${tBase - th} L${tx + tw * 0.62} ${tBase - th * 0.72} L${tx + tw * 0.42} ${tBase - th * 0.72} L${tx + tw / 2} ${tBase} Z" fill="#100d28"/>
      <circle cx="${tx}" cy="${tBase - th * 0.6}" r="${Math.max(1.1, th * 0.04)}" fill="#ffd58a"/>
      <circle class="ns-window" cx="${tx}" cy="${tBase - th * 0.6}" r="${th * 0.22}" fill="url(#${k}w)"/>`;
    const shimmer = [];
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const lines = tier === 'low' ? 14 : 22;
    for (let i = 0; i < lines; i++) {
      const y = hy + Math.pow(rnd(), 1.5) * (H - hy) * 0.95 + 3;
      const depth = (y - hy) / (H - hy);
      const w = (14 + rnd() * 70) * (0.5 + depth * 1.3);
      const x = rnd() * W;
      shimmer.push(`<rect x="${(x - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(0.8 + depth * 1.2).toFixed(1)}" rx="1" opacity="${(0.05 + rnd() * 0.14).toFixed(2)}"/>`);
    }
    svg.innerHTML = `
      <defs>
        <linearGradient id="${k}wa" x1="0" y1="${hy}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#262055"/>
          <stop offset=".18" stop-color="#151236"/>
          <stop offset=".6" stop-color="#0b0a22"/>
          <stop offset="1" stop-color="#070616"/>
        </linearGradient>
        <linearGradient id="${k}hz" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#b9a3e3" stop-opacity="0"/>
          <stop offset=".5" stop-color="#e9d9ff" stop-opacity=".5"/>
          <stop offset="1" stop-color="#b9a3e3" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="${k}w"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".7"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
        ${blur ? `<filter id="${k}b" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="0 2.2"/></filter>` : ''}
      </defs>
      <rect x="0" y="${hy}" width="${W}" height="${H - hy}" fill="url(#${k}wa)"/>
      <g opacity=".42" ${blur ? `filter="url(#${k}b)"` : ''}>
        <path d="${mirror(far)}" fill="#141032"/>
        <path d="${mirror(near)}" fill="#0b0920"/>
      </g>
      <path d="${poly(far)}" fill="#161236"/>
      ${tower}
      <path d="${poly(near)}" fill="#0c0a22"/>
      <rect x="0" y="${hy - 0.5}" width="${W}" height="1" fill="url(#${k}hz)"/>
      <g class="ns-shimmer" fill="#c9b8f0">${shimmer.join('')}</g>`;
  }
  layout();

  return {
    root,
    layout,
    get W() { return state.W; },
    get H() { return state.H; },
    get hy() { return state.hy; },
  };
}

/* ------------------------------------------------------------------ the scene */
export default {
  id: 'invite',
  async enter(ctx, el) {
    const { gsap, fx, device } = ctx;
    const t = ctx.text.invite || {};
    const reduced = device.reducedMotion;
    const lines = (Array.isArray(t.lines) && t.lines.length ? t.lines : [
      'I made you something.',
      'Find a quiet corner. Lights low. Headphones on.',
    ]).map((l) => words(ctx, l)).filter(Boolean);
    const greeting = words(ctx, t.greeting, 'Hey {name}.');
    const label = words(ctx, t.button, 'Light the lantern');
    const foot = words(ctx, t.foot, 'headphones on · lights low');

    el.innerHTML = `
      <div class="inv-copy">
        <h1 class="inv-greet">${esc(greeting)}</h1>
        <div class="inv-lines">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      </div>
      <div class="inv-refl" aria-hidden="true"></div>
      <button type="button" class="inv-light" aria-label="${esc(label)}">
        <span class="inv-lantern">${lanternArt({ className: 'inv-lt' })}<i class="inv-ripple" aria-hidden="true"></i><i class="inv-ripple r2" aria-hidden="true"></i></span>
        <span class="inv-label">${esc(label)}</span>
      </button>
      <p class="inv-foot">
        <svg class="inv-phones" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6.5" rx="1.6"/><rect x="17" y="14" width="4" height="6.5" rx="1.6"/></svg>
        <span>${esc(foot)}</span>
      </p>`;
    const world = nightscape(el, { device, stars: 190 });
    el.prepend(world.root);

    const lanternBox = el.querySelector('.inv-lantern');
    const svg = el.querySelector('.inv-lt');
    const greet = el.querySelector('.inv-greet');
    const ps = el.querySelectorAll('.inv-lines p');
    const btn = el.querySelector('.inv-light');
    const lbl = el.querySelector('.inv-label');
    const ripples = el.querySelectorAll('.inv-ripple');
    const footEl = el.querySelector('.inv-foot');
    const refl = el.querySelector('.inv-refl');
    const warm = world.root.querySelector('.ns-warm');
    fx.dust({ density: 0.22, alpha: 0.7, speed: 0.6 });

    const placeRefl = () => {
      const r = lanternBox.getBoundingClientRect();
      refl.style.left = `${r.left + r.width / 2}px`;
      refl.style.width = `${r.width * 0.7}px`;
      refl.style.marginLeft = `${-r.width * 0.35}px`;
    };
    const onResize = () => { world.layout(); placeRefl(); };
    window.addEventListener('resize', onResize);
    this.cleanup = [() => window.removeEventListener('resize', onResize)];
    placeRefl();

    // entrance — slow, calm
    const tl = gsap.timeline({ delay: 0.3 });
    this.tl = tl;
    const D = reduced ? 0.45 : 1;
    tl.fromTo(world.root, { opacity: 0 }, { opacity: 1, duration: 2.4 * D, ease: 'power1.out' }, 0)
      .fromTo(lanternBox, { opacity: 0, y: reduced ? 0 : 26 }, { opacity: 1, y: 0, duration: 2.6 * D, ease: 'power3.out' }, 0.4 * D)
      .fromTo(refl, { opacity: 0 }, { opacity: 0.35, duration: 2 * D }, 1.2 * D)
      .fromTo(greet, { opacity: 0, filter: 'blur(14px)', y: reduced ? 0 : 14 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 2 * D, ease: 'power3.out' }, 1.0 * D)
      .fromTo(ps, { opacity: 0, y: reduced ? 0 : 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.4 * D, stagger: 1.15 * D, ease: 'power2.out' }, 2.4 * D)
      .fromTo(lbl, { opacity: 0, y: reduced ? 0 : 8 }, { opacity: 1, y: 0, duration: 1.4 * D, ease: 'power2.out' }, `>-${0.2 * D}`)
      .fromTo(footEl, { opacity: 0 }, { opacity: 0.62, duration: 1.4 * D }, '<0.6')
      .add(() => btn.classList.add('ready'), '<');
    if (!reduced) {
      this.sway = gsap.to(lanternBox, { rotation: 2.2, y: -7, duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 10%', delay: 3 });
      this.stars = setInterval(() => Math.random() < 0.35 && shootingStar(world.root.querySelector('.ns-stars')), 5200);
    }

    // The tap. Sound MUST be unlocked synchronously inside the gesture (iOS).
    let soundReady = null;
    await until(new Promise((resolve) => {
      let done = false;
      const go = () => {
        if (done || ctx.signal.aborted) return;
        done = true;
        soundReady = ctx.startSound();
        ctx.immersive();
        resolve();
      };
      btn.addEventListener('click', go);
      const onKey = (e) => {
        if (e.repeat || !(e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) return;
        if (document.activeElement === btn) return; // the button's own click handles it
        e.preventDefault();
        go();
      };
      window.addEventListener('keydown', onKey);
      this.cleanup.push(() => { btn.removeEventListener('click', go); window.removeEventListener('keydown', onKey); });
    }), ctx.signal);

    tl.progress(1).kill();
    this.sway && this.sway.kill();
    btn.disabled = true;
    btn.classList.add('lit');
    gsap.to(ripples, { opacity: 0, duration: 0.4 });

    // light it
    const lit = lightLantern(gsap, svg, { reduced });
    this.lit = lit;
    const r0 = lanternBox.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    fx.sparkle(cx, r0.top + r0.height * 0.86, reduced ? 10 : 22, { spread: 46 });
    gsap.to(refl, { opacity: 1, duration: 1.6, ease: 'power2.out' });
    gsap.to(warm, { opacity: 0.85, duration: 3, ease: 'sine.inOut' });
    gsap.to([greet, ...ps, lbl, footEl], { opacity: 0, y: reduced ? 0 : -8, filter: 'blur(8px)', duration: 1.3, stagger: 0.06, ease: 'power2.in', delay: 0.5 });
    Promise.resolve(soundReady).then(() => {
      if (ctx.signal.aborted) return;
      ctx.audio.sfx('magic');
      ctx.audio.setMood('hush');
    }).catch(() => {});
    fx.dust({ density: 0.35, alpha: 1 });

    await ctx.wait(reduced ? 0.9 : 1.7);

    // …and let it go. The film's 'lantern' transition picks it up from here
    // (it kindles its own light where ours is, rises and becomes the prologue's dawn).
    const H = window.innerHeight;
    const rise = gsap.timeline();
    this.rise = rise;
    rise.to(lanternBox, { y: -H * 0.12, x: reduced ? 0 : 8, rotation: reduced ? 0 : -1.5, duration: reduced ? 1.4 : 3, ease: 'sine.in' }, 0)
      .to(refl, { opacity: 0, scaleY: 0.5, duration: 1.6, ease: 'power2.in' }, 0);
    await ctx.wait(reduced ? 0.5 : 0.8);
    const r = svg.getBoundingClientRect();
    ctx.next({ kind: 'lantern', x: r.left + r.width / 2, y: r.top + r.height * 0.5, size: r.width, color: '#ffd98a' });
    // hand our lantern over to the transition's (it kindles in place over ~0.35s)
    gsap.to(lanternBox, { opacity: 0, duration: reduced ? 0.6 : 0.5, delay: 0.15, ease: 'power1.in' });
  },
  async exit() {
    (this.cleanup || []).forEach((fn) => fn());
    this.cleanup = [];
    clearInterval(this.stars);
    [this.tl, this.sway, this.lit, this.rise].forEach((t) => t && t.kill());
    this.tl = this.sway = this.lit = this.rise = null;
  },
};
