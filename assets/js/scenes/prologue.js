// Prologue — "Once Upon a Deepu".
// A storybook title card inks itself onto the night. A single drop of sunlight
// falls; where it lands a golden flower blooms and the sky warms into dawn
// (the film's day begins here). The flower's light becomes her — her photo in an
// inked arch, a quiet sun behind her, her name writing itself in script.
// A tiny lantern drifts far away on the horizon (the one she just lit).
// Secret: tap the sun behind her three times.
import { flowerSVG, sunEmblem, esc } from '../core/art.js';
import { makeStars, shootingStar } from '../core/sky.js';
import { words, until } from './invite.js';

const DEFAULT_LINES = [
  'Once upon a time — on the third of January, 2007 —',
  'the sun let slip a single drop of light.',
  'It fell, and fell, quietly through the dark.',
  'Where it landed, something golden bloomed.',
  'And by morning, the whole world was a little warmer.',
];

const PAL = {
  night: { far: '#1b1238', mid: '#130b2a', near: '#0b0618' },
  dawn: { far: '#eec3cc', mid: '#d6a3bd', near: '#9e7199' },
};

/** Split the lines into beats: intro · the drop appears · it falls · it lands & blooms · morning. */
function beats(lines) {
  const n = lines.length;
  const L = (i) => [lines[i]];
  if (n >= 5) return { intro: lines.slice(0, n - 4), drop: L(n - 4), fall: L(n - 3), land: L(n - 2), after: L(n - 1) };
  if (n === 4) return { intro: L(0), drop: L(1), fall: L(2), land: L(3), after: [] };
  if (n === 3) return { intro: L(0), drop: [], fall: L(1), land: L(2), after: [] };
  if (n === 2) return { intro: L(0), drop: [], fall: [], land: L(1), after: [] };
  return { intro: lines.slice(0, 1), drop: [], fall: [], land: [], after: [] };
}

/** "Once Upon a Deepu" → ['Once Upon a', 'Deepu', ''] when a name/nickname is in the title. */
function splitTitle(title, names) {
  for (const nm of names.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|\\s)(${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[\\s.,!?…’'])`, 'i');
    const m = title.match(re);
    if (m) {
      const i = m.index + m[1].length;
      return [title.slice(0, i).trim(), title.slice(i, i + m[2].length), title.slice(i + m[2].length).trim()];
    }
  }
  return [title, '', ''];
}

function birthLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]} · ${m[2]} · ${m[1]}` : '03 · 01 · 2007';
}

/* ---------- hand-drawn ornaments (original) ---------- */
function frameSVG(W, H, inset) {
  // a thin inked border with curling corner flourishes
  const x0 = inset;
  const y0 = inset;
  const x1 = W - inset;
  const y1 = H - inset;
  const c = Math.min(46, Math.min(W, H) * 0.09);
  const corner = (sx, sy, x, y) => {
    const p = (dx, dy) => `${(x + sx * dx).toFixed(1)} ${(y + sy * dy).toFixed(1)}`;
    return `<path class="pf-corner" d="M${p(0, c * 1.5)} L${p(0, c * 0.35)} C${p(0, c * 0.12)} ${p(c * 0.12, 0)} ${p(c * 0.35, 0)} L${p(c * 1.5, 0)}"/>
      <path class="pf-curl" d="M${p(c * 0.9, c * 0.3)} C${p(c * 0.5, c * 0.3)} ${p(c * 0.3, c * 0.5)} ${p(c * 0.3, c * 0.9)} C${p(c * 0.3, c * 0.62)} ${p(c * 0.62, c * 0.55)} ${p(c * 0.62, c * 0.78)} C${p(c * 0.62, c * 0.95)} ${p(c * 0.42, c * 0.95)} ${p(c * 0.45, c * 0.8)}"/>
      <circle class="pf-dot" cx="${(x + sx * c * 0.95).toFixed(1)}" cy="${(y + sy * c * 0.95).toFixed(1)}" r="1.6"/>`;
  };
  const midX = W / 2;
  return `
<svg class="pro-frame" viewBox="0 0 ${W} ${H}" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
    ${corner(1, 1, x0, y0)}${corner(-1, 1, x1, y0)}${corner(1, -1, x0, y1)}${corner(-1, -1, x1, y1)}
    <path class="pf-line" d="M${x0 + c * 1.7} ${y0} L${midX - 14} ${y0}"/><path class="pf-line" d="M${x1 - c * 1.7} ${y0} L${midX + 14} ${y0}"/>
    <path class="pf-line" d="M${x0 + c * 1.7} ${y1} L${midX - 14} ${y1}"/><path class="pf-line" d="M${x1 - c * 1.7} ${y1} L${midX + 14} ${y1}"/>
    <path class="pf-line" d="M${x0} ${y0 + c * 1.7} L${x0} ${y1 - c * 1.7}"/><path class="pf-line" d="M${x1} ${y0 + c * 1.7} L${x1} ${y1 - c * 1.7}"/>
    <path class="pf-gem" d="M${midX} ${y0 - 5} L${midX + 6} ${y0} L${midX} ${y0 + 5} L${midX - 6} ${y0} Z" fill="currentColor" fill-opacity=".35"/>
    <path class="pf-gem" d="M${midX} ${y1 - 5} L${midX + 6} ${y1} L${midX} ${y1 + 5} L${midX - 6} ${y1} Z" fill="currentColor" fill-opacity=".35"/>
  </g>
</svg>`;
}

function flourishSVG(cls = '') {
  return `
<svg class="pro-flourish ${cls}" viewBox="0 0 300 26" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
    <path class="fl-l" d="M150 13 C138 13 134 4 126 6 C119 8 121 17 128 16 C133 15 132 10 128 10 M126 13 L18 13"/>
    <path class="fl-r" d="M150 13 C162 13 166 4 174 6 C181 8 179 17 172 16 C167 15 168 10 172 10 M174 13 L282 13"/>
    <path class="fl-c" d="M150 6 L154 13 L150 20 L146 13 Z" fill="currentColor" fill-opacity=".4"/>
  </g>
</svg>`;
}

function glyphSun() {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r1 = 9;
    const r2 = i % 2 ? 13.5 : 17.5;
    return `M${(20 + Math.cos(a) * r1).toFixed(2)} ${(20 + Math.sin(a) * r1).toFixed(2)} L${(20 + Math.cos(a) * r2).toFixed(2)} ${(20 + Math.sin(a) * r2).toFixed(2)}`;
  }).join(' ');
  return `<svg class="pro-glyph" viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><circle class="g-ring" cx="20" cy="20" r="6.2"/><path class="g-rays" d="${rays}"/></g><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>`;
}

/** The inked arch around her photo, with a little sun finial, base curls and two flower sprigs. */
function archInk(pw, ph) {
  const d = Math.max(6, pw * 0.028);
  const R = pw / 2 + d;
  const cx = pw / 2;
  const top = -d;
  const base = ph + d;
  const m = pw * 0.36; // room for curls & sprigs
  const left = `M${cx} ${top} A${R} ${R} 0 0 0 ${-d} ${pw / 2} L${-d} ${base} L${cx - 7} ${base}`;
  const right = `M${cx} ${top} A${R} ${R} 0 0 1 ${pw + d} ${pw / 2} L${pw + d} ${base} L${cx + 7} ${base}`;
  const gem = `<path class="ai-gem" d="M${cx} ${base - 4.5} L${cx + 6} ${base} L${cx} ${base + 4.5} L${cx - 6} ${base} Z"/>`;
  const d2 = d * 0.45;
  const R2 = pw / 2 + d2;
  const inner = `M${-d2} ${base - d * 0.6} L${-d2} ${pw / 2} A${R2} ${R2} 0 0 1 ${pw + d2} ${pw / 2} L${pw + d2} ${base - d * 0.6}`;
  const s = Math.max(0.55, pw / 300);
  const curl = (sx) => {
    const x = sx < 0 ? -d : pw + d;
    const p = (dx, dy) => `${(x + sx * dx * s).toFixed(1)} ${(base + dy * s).toFixed(1)}`;
    return `<path class="ai-curl" d="M${p(0, 0)} C${p(16, 0)} ${p(26, -6)} ${p(26, -16)} C${p(26, -26)} ${p(12, -26)} ${p(12, -17)} C${p(12, -11)} ${p(20, -11)} ${p(20, -16)}"/>`;
  };
  // a flower sprig (stem + leaves + blossoms) growing from a base corner
  const sprig = (sx, flip) => {
    const x = sx < 0 ? -d - 6 * s : pw + d + 6 * s;
    const P = (dx, dy) => [x + sx * dx * s, base + dy * s];
    const f = (pt) => `${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`;
    const stem = `M${f(P(4, 4))} C${f(P(-10, -20))} ${f(P(-4, -54))} ${f(P(-20, -86))}`;
    const stem2 = `M${f(P(2, -18))} C${f(P(16, -34))} ${f(P(24, -44))} ${f(P(30, -62))}`;
    const leaf = (pt, rot, len) => {
      const [lx, ly] = pt;
      return `<path class="ai-leaf" transform="translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(3)})" d="M0 0 C${len * 0.3} ${-len * 0.28} ${len * 0.75} ${-len * 0.22} ${len} 0 C${len * 0.7} ${len * 0.2} ${len * 0.3} ${len * 0.22} 0 0 Z"/>`;
    };
    const blossom = (pt, r, hue) => {
      const [bx, by] = pt;
      const petals = Array.from({ length: 5 }, (_, i) => `<ellipse rx="${(r * 0.55).toFixed(1)}" ry="${(r * 0.36).toFixed(1)}" cx="${(r * 0.55).toFixed(1)}" transform="rotate(${i * 72 - 90})"/>`).join('');
      return `<g class="ai-bloom" transform="translate(${bx.toFixed(1)} ${by.toFixed(1)})"><g class="ai-petals ${hue}">${petals}</g><circle r="${(r * 0.26).toFixed(1)}" class="ai-heart"/></g>`;
    };
    const a = flip ? -1 : 1;
    return `
      <g class="ai-sprig">
        <path class="ai-stem" d="${stem}"/><path class="ai-stem" d="${stem2}"/>
        ${leaf(P(-6, -30), sx < 0 ? -150 : -30, 22)}${leaf(P(-2, -50), sx < 0 ? -30 * a : -150, 18)}${leaf(P(14, -32), sx < 0 ? -40 : -140, 16)}
        ${blossom(P(-20, -88), 11 * s, 'rose')}${blossom(P(30, -64), 8.5 * s, 'peach')}${blossom(P(-6, -58), 6.5 * s, 'cream')}
      </g>`;
  };
  const fin = `<g class="ai-finial" transform="translate(${cx} ${top - 12 * s}) scale(${s.toFixed(3)})">
      <circle r="4.2"/>${Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45})" d="M0 -6.5 L0 ${i % 2 ? -10 : -13}"/>`).join('')}
    </g>`;
  return `
<svg class="pro-arch-ink" viewBox="${-m} ${-m} ${pw + 2 * m} ${ph + 2 * m}" style="left:${-m}px;top:${-m}px;width:${pw + 2 * m}px;height:${ph + 2 * m}px" aria-hidden="true">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path class="ai-line" d="${left}"/><path class="ai-line" d="${right}"/>${gem}
    <path class="ai-hair" d="${inner}"/>
    ${curl(-1)}${curl(1)}
    ${fin}
  </g>
  ${sprig(-1, false)}${sprig(1, true)}
</svg>`;
}

/* ---------- the land: hills that warm from night to dawn ---------- */
function landSVG(W, H, hy) {
  const n = 40;
  const wave = (t, f, ph) => Math.sin(t * f * 6.283 + ph);
  const row = (fn) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(`L${(t * W).toFixed(1)} ${fn(t).toFixed(1)}`);
    }
    return `M0 ${H} ${pts.join(' ')} L${W} ${H} Z`;
  };
  const far = row((t) => hy - H * (0.025 + 0.012 * wave(t, 1.3, 0.8) + 0.006 * wave(t, 3.1, 2)));
  const mid = row((t) => hy + H * 0.012 - H * (0.02 + 0.022 * Math.max(0, wave(t, 0.9, 2.6)) + 0.03 * Math.pow(Math.abs(t - 0.5) * 2, 2)));
  // the meadow: a gentle mound in the centre where the flower grows
  const near = row((t) => {
    const dx = (t - 0.5) / 0.42;
    return hy + H * 0.075 - H * 0.045 * Math.exp(-dx * dx) + H * 0.02 * Math.pow(Math.abs(t - 0.5) * 2, 3);
  });
  return `
    <path class="pl-far" d="${far}" fill="${PAL.night.far}"/>
    <path class="pl-mid" d="${mid}" fill="${PAL.night.mid}"/>
    <path class="pl-near" d="${near}" fill="${PAL.night.near}"/>`;
}

export default {
  id: 'prologue',
  title: 'Once Upon a Deepu',
  async enter(ctx, el) {
    const { gsap, fx, ui, audio, device } = ctx;
    const reduced = device.reducedMotion;
    const low = device.tier === 'low';
    const sig = ctx.signal;
    const t = ctx.text.prologue || {};
    const her = ctx.site.her || {};
    const name = String(her.name || 'Deepu');
    const lines = (Array.isArray(t.lines) && t.lines.length ? t.lines : DEFAULT_LINES).filter(Boolean);
    const beat = beats(lines);
    const kicker = words(ctx, t.kicker, 'Prologue');
    const title = words(ctx, t.title, ctx.title || `Once Upon a ${name}`);
    const [tA, tName, tB] = splitTitle(title, [name, ...(her.nicknames || [])]);
    const titleSub = words(ctx, t.titleSub, '');
    const date = words(ctx, t.date, birthLabel(her.birthDate));
    const hero = ctx.role('hero');
    this.tweens = [];
    this.cleanup = [];
    this.timers = [];
    const track = (tw) => (this.tweens.push(tw), tw);
    const done = (tw) => until(tw.then(), sig);

    ctx.preload(hero.url); // the reveal is ~25s away; decode it in the background

    el.innerHTML = `
      <div class="pro-world" aria-hidden="true">
        <div class="pro-sky pro-night"></div>
        <div class="pro-sky pro-predawn"></div>
        <div class="pro-sky pro-dawn"></div>
        <div class="pro-stars"></div>
        <div class="pro-sunrise"></div>
        <div class="pro-far"><i></i></div>
        <svg class="pro-land" preserveAspectRatio="none"></svg>
        <div class="pro-mist"></div>
      </div>
      <div class="pro-frame-wrap" aria-hidden="true"></div>
      <div class="pro-card">
        ${glyphSun()}
        <p class="pro-kicker">${esc(kicker)}</p>
        ${flourishSVG('top')}
        <h1 class="pro-card-title">
          ${tA ? `<span class="pct-a">${esc(tA)}</span>` : ''}
          ${tName ? `<span class="pct-name"><span class="pn-glow" aria-hidden="true">${esc(tName)}</span><span class="pn-ink">${esc(tName)}</span></span>` : ''}
          ${tB ? `<span class="pct-a">${esc(tB)}</span>` : ''}
        </h1>
        ${flourishSVG('bottom')}
      </div>
      <div class="pro-motes" aria-hidden="true"></div>
      <div class="pro-drop" aria-hidden="true"><i></i></div>
      <div class="pro-ring" aria-hidden="true"></div>
      <div class="pro-flower" aria-hidden="true">${flowerSVG()}</div>
      <div class="pro-bloomlight" aria-hidden="true"></div>
      <div class="pro-reveal">
        <div class="pro-portrait">
          <div class="pro-glow" aria-hidden="true"></div>
          <div class="pro-sun"><i class="pro-sun-glow"></i><div class="pro-sun-spin"><div class="pro-sun-in">${sunEmblem({ glow: false, fill: '#ffe2a6', inner: '#f2bf6c', stroke: '#fff3d6' })}</div></div></div>
          <div class="pro-hero"><img alt="${esc(hero.alt || `${name}`)}" src="${esc(hero.url)}" style="object-position:${esc(hero.objectPosition)}" decoding="async"></div>
          <div class="pro-ink-host"></div>
        </div>
        <div class="pro-title">
          <h2 class="pro-name"><span class="pn-glow" aria-hidden="true">${esc(name)}</span><span class="pn-ink">${esc(name)}</span></h2>
          ${titleSub ? `<p class="pro-sub">${esc(titleSub)}</p>` : ''}
          <p class="pro-date">${esc(date)}</p>
        </div>
      </div>`;

    const world = el.querySelector('.pro-world');
    const starsHost = el.querySelector('.pro-stars');
    makeStars(starsHost, { count: low ? 150 : 240 });
    const land = el.querySelector('.pro-land');
    const frameWrap = el.querySelector('.pro-frame-wrap');
    const card = el.querySelector('.pro-card');
    const drop = el.querySelector('.pro-drop');
    const ring = el.querySelector('.pro-ring');
    const flower = el.querySelector('.pro-flower');
    const fsvg = flower.querySelector('svg');
    const bloomlight = el.querySelector('.pro-bloomlight');
    const reveal = el.querySelector('.pro-reveal');
    const portrait = el.querySelector('.pro-portrait');
    const heroEl = el.querySelector('.pro-hero');
    const sun = el.querySelector('.pro-sun');
    const sunIn = el.querySelector('.pro-sun-in');
    const sunSpin = el.querySelector('.pro-sun-spin');
    const sunGlow = el.querySelector('.pro-sun-glow');
    const glow = el.querySelector('.pro-glow');
    const inkHost = el.querySelector('.pro-ink-host');
    const titleBox = el.querySelector('.pro-title');
    const nameEl = el.querySelector('.pro-name');
    const subEl = el.querySelector('.pro-sub');
    const dateEl = el.querySelector('.pro-date');
    const far = el.querySelector('.pro-far');

    /* ---------- layout (all viewports, on resize too) ---------- */
    const L = {};
    const layout = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const portraitMode = H > W;
      const hy = Math.round(H * (portraitMode ? 0.8 : 0.79));
      Object.assign(L, { W, H, hy });
      el.style.setProperty('--hy', `${hy}px`);
      land.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const dawnNow = land.dataset.dawn === '1';
      land.innerHTML = landSVG(W, H, hy);
      if (dawnNow) land.querySelectorAll('path').forEach((p) => { p.setAttribute('fill', PAL.dawn[p.getAttribute('class').slice(3)]); });
      // the meadow mound top (flower grows here)
      L.ground = hy + H * 0.075 - H * 0.045 + 2;
      el.style.setProperty('--ground', `${L.ground}px`);
      // ink frame (title card)
      const lb = portraitMode ? H * 0.055 : H * 0.09;
      const inset = Math.max(14, Math.min(W, H) * 0.045);
      frameWrap.innerHTML = frameSVG(W, H - 2 * lb, inset);
      frameWrap.style.top = `${lb}px`;
      frameWrap.style.height = `${H - 2 * lb}px`;
      // the reveal: photo + name framed between the letterbox bars, clear of the continue button
      const top = lb + Math.max(16, H * 0.035);
      const bottom = lb + H * 0.034 + 56 + Math.max(10, H * 0.015);
      const Ah = H - top - bottom;
      const nameSize = Math.round(Math.max(50, Math.min(Ah * 0.118, W * 0.2, 118)));
      reveal.style.top = `${top}px`;
      reveal.style.height = `${Ah}px`;
      reveal.style.setProperty('--name', `${nameSize}px`);
      const titleH = titleBox.offsetHeight || nameSize * 1.4 + 50;
      const gap = Math.max(10, Math.min(26, H * 0.022));
      // the inked arch's finial needs ~9% of the photo height above it
      let ph = (Ah - titleH - gap) / 1.09;
      ph = Math.min(ph, W * 0.74 * 1.25, 640);
      const pw = Math.round(ph * 0.8);
      ph = Math.round(pw * 1.25);
      L.pw = pw;
      L.ph = ph;
      reveal.style.setProperty('--pw', `${pw}px`);
      reveal.style.setProperty('--ph', `${ph}px`);
      reveal.style.setProperty('--gap', `${gap}px`);
      const sunD = Math.round(ph * 1.62);
      sun.style.width = sun.style.height = `${sunD}px`;
      sun.style.left = `${(pw - sunD) / 2}px`;
      sun.style.top = `${ph * 0.46 - sunD / 2}px`;
      const inkWasDrawn = inkHost.dataset.drawn === '1';
      inkHost.innerHTML = archInk(pw, ph);
      if (inkWasDrawn) inkHost.dataset.drawn = '1';
    };
    layout();
    let rz = 0;
    const onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); };
    window.addEventListener('resize', onResize);
    this.cleanup.push(() => { window.removeEventListener('resize', onResize); cancelAnimationFrame(rz); });

    /* ---------- start: deep night ---------- */
    ctx.grade('night');
    ctx.letterbox(true);
    fx.dust({ density: 0.14, alpha: 0.75, speed: 0.6 });
    audio.setMood('hush');
    gsap.set([drop, flower, reveal, card], { autoAlpha: 0 });
    gsap.set(['.pro-predawn', '.pro-dawn', '.pro-sunrise', '.pro-mist'].map((s) => el.querySelector(s)), { opacity: 0 });
    track(gsap.fromTo(world, { opacity: 0 }, { opacity: 1, duration: reduced ? 1 : 2.4, ease: 'power1.out' }));
    if (!reduced) {
      this.starTimer = setInterval(() => Math.random() < 0.4 && shootingStar(starsHost), 4200);
      // the far lantern drifts up the whole scene, very slowly
      track(gsap.fromTo(far, { y: 0, x: 0 }, { y: -L.H * 0.2, x: -L.W * 0.03, duration: 70, ease: 'none' }));
      track(gsap.to(far.querySelector('i'), { x: 3, rotation: 4, duration: 3.2, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    }
    track(gsap.fromTo(far, { opacity: 0 }, { opacity: 1, duration: 4, delay: 1.5 }));

    /* ---------- 1 · the storybook title card ---------- */
    const frame = frameWrap.querySelector('.pro-frame');
    const framePaths = frame.querySelectorAll('path');
    gsap.set(card, { autoAlpha: 1 });
    const glyph = card.querySelector('.pro-glyph');
    const kickEl = card.querySelector('.pro-kicker');
    const fls = card.querySelectorAll('.pro-flourish path');
    const tAs = card.querySelectorAll('.pct-a');
    const tNameEl = card.querySelector('.pct-name');
    const cardTl = gsap.timeline({ delay: reduced ? 0.4 : 1.0 });
    track(cardTl);
    if (reduced) {
      if (tNameEl) tNameEl.style.setProperty('--wp', '115%');
      cardTl.fromTo([frameWrap, glyph, kickEl, ...card.querySelectorAll('.pro-flourish'), ...tAs, tNameEl].filter(Boolean), { opacity: 0 }, { opacity: 1, duration: 1, stagger: 0.08 });
    } else {
      cardTl.add(() => audio.sfx('pageTurn'), 0)
        .fromTo(framePaths, { drawSVG: '0%' }, { drawSVG: '100%', duration: 2.6, ease: 'power2.inOut', stagger: 0.04 }, 0)
        .fromTo(frame.querySelectorAll('circle'), { opacity: 0 }, { opacity: 1, duration: 1 }, 1.6)
        .fromTo(glyph.querySelectorAll('circle, path'), { drawSVG: '0%', opacity: 0 }, { drawSVG: '100%', opacity: 1, duration: 1.6, ease: 'power2.out' }, 0.3)
        .fromTo(kickEl, { opacity: 0, letterSpacing: '0.9em' }, { opacity: 1, letterSpacing: '0.55em', duration: 1.8, ease: 'power3.out' }, 0.5)
        .fromTo(fls, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1.8, ease: 'power2.inOut' }, 0.9)
        .add(() => audio.sfx('shimmer'), 1.1)
        .fromTo(tAs, { opacity: 0, y: 12, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.5, ease: 'power3.out' }, 1.2);
      if (tNameEl) cardTl.fromTo(tNameEl, { '--wp': '-15%' }, { '--wp': '115%', duration: 2.2, ease: 'power1.inOut' }, 1.8);
    }
    await done(cardTl);
    await ctx.wait(reduced ? 1.6 : 2.6);
    const cardOut = gsap.timeline();
    track(cardOut);
    cardOut.to(card, { autoAlpha: 0, y: reduced ? 0 : -10, filter: 'blur(6px)', duration: 1.4, ease: 'power2.in' }, 0)
      .to(frameWrap, { opacity: 0, duration: 1.8, ease: 'power2.inOut' }, 0.2);
    await done(cardOut);

    /* ---------- 2 · once upon a time… ---------- */
    await ui.narrate(beat.intro, { position: 'center', style: 'big' });

    /* ---------- 3 · a drop of sunlight ---------- */
    const W = L.W;
    const H = L.H;
    const start = { x: W * (W > H ? 0.62 : 0.68), y: L.H * (W > H ? 0.3 : 0.31) };
    const landAt = { x: W * 0.5, y: L.ground };
    gsap.set(drop, { x: start.x, y: start.y, scale: 0.2, autoAlpha: 0 });
    track(gsap.to(drop, { autoAlpha: 1, scale: 1, duration: reduced ? 1 : 2.4, ease: 'power2.out' }));
    track(gsap.to(el.querySelector('.pro-predawn'), { opacity: 0.55, duration: 9, ease: 'sine.inOut' }));
    audio.sfx('chime');
    if (!reduced) track(gsap.to(drop.querySelector('i'), { scale: 1.25, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    await ui.narrate(beat.drop, { position: 'top' });

    /* ---------- 4 · it falls ---------- */
    let fall;
    if (reduced) {
      fall = gsap.to(drop, { x: landAt.x, y: landAt.y, duration: 1.6, ease: 'power1.inOut' });
    } else {
      let last = 0;
      const motes = el.querySelector('.pro-motes');
      fall = gsap.to(drop, {
        duration: 4.4,
        ease: 'power1.in',
        motionPath: { path: [start, { x: W * 0.62, y: H * 0.46 }, { x: W * 0.47, y: H * 0.62 }, landAt], curviness: 1.25 },
        onUpdate() {
          const now = performance.now();
          if (now - last < (low ? 120 : 70)) return;
          last = now;
          const m = document.createElement('i');
          motes.appendChild(m);
          const sz = 3 + Math.random() * 5;
          gsap.fromTo(m, { x: gsap.getProperty(drop, 'x') + (Math.random() - 0.5) * 8, y: gsap.getProperty(drop, 'y'), width: sz, height: sz, opacity: 0.95 }, {
            x: `+=${(Math.random() - 0.5) * 26}`, y: `+=${6 + Math.random() * 22}`, opacity: 0, scale: 0.3, duration: 1.1 + Math.random() * 0.8, ease: 'power1.out', onComplete: () => m.remove(),
          });
        },
      });
    }
    track(fall);
    audio.sfx('whoosh');
    const fallLine = ui.narrate(beat.fall, { position: 'top', hold: 2.4 });
    fallLine.catch(() => {});
    await done(fall);

    /* ---------- 5 · impact, bloom, and the sky warms into dawn ---------- */
    audio.sfx('magic');
    audio.setMood('tender');
    ctx.grade('dawn');
    fx.flash({ color: '#ffe3a3', duration: 0.9, peak: reduced ? 0.25 : 0.5 });
    fx.sparkle(landAt.x, landAt.y - 10, reduced ? 4 : 9, { spread: 70 });
    track(gsap.to(drop, { scale: 3, autoAlpha: 0, duration: 0.8, ease: 'power2.out' }));
    if (!reduced) track(gsap.fromTo(ring, { x: landAt.x, y: landAt.y, scale: 0, opacity: 0.9 }, { scale: 9, opacity: 0, duration: 2.2, ease: 'power2.out' }));
    const dawnDur = reduced ? 3 : 8;
    land.dataset.dawn = '1';
    this.timers.push(setTimeout(() => el.classList.add('is-dawn'), dawnDur * 450));
    const sky = gsap.timeline();
    track(sky);
    sky.to(el.querySelector('.pro-predawn'), { opacity: 1, duration: dawnDur * 0.45, ease: 'sine.inOut' }, 0)
      .to(el.querySelector('.pro-dawn'), { opacity: 1, duration: dawnDur, ease: 'sine.inOut' }, dawnDur * 0.25)
      .to(el.querySelector('.pro-sunrise'), { opacity: 1, duration: dawnDur, ease: 'sine.out' }, 0)
      .to(starsHost, { opacity: 0, duration: dawnDur * 0.8, ease: 'sine.in' }, dawnDur * 0.2)
      .to(el.querySelector('.pro-mist'), { opacity: 1, duration: dawnDur, ease: 'sine.inOut' }, dawnDur * 0.4)
      .to(far, { '--dawn': 1, duration: dawnDur }, 0);
    land.querySelectorAll('path').forEach((p) => {
      const key = p.getAttribute('class').slice(3);
      sky.to(p, { attr: { fill: PAL.dawn[key] }, duration: dawnDur * 0.9, ease: 'sine.inOut' }, dawnDur * 0.15);
    });
    fx.dust({ density: 0.22, alpha: 0.8 });

    gsap.set(flower, { autoAlpha: 1 });
    const stem = fsvg.querySelectorAll('.stem');
    const leaves = fsvg.querySelectorAll('.leaf');
    const outer = fsvg.querySelectorAll('.p1');
    const inner = fsvg.querySelectorAll('.p2');
    const aura = fsvg.querySelector('.fl-aura');
    const core = fsvg.querySelectorAll('.fl-core, .fl-dots');
    const bloom = gsap.timeline();
    track(bloom);
    if (reduced) {
      bloom.fromTo(flower, { opacity: 0 }, { opacity: 1, duration: 1.4 });
    } else {
      bloom.fromTo(stem, { drawSVG: '0%' }, { drawSVG: '100%', duration: 2.2, ease: 'power2.inOut' })
        .fromTo(leaves, { scale: 0, transformOrigin: '100% 100%' }, { scale: 1, duration: 1.4, stagger: 0.3, ease: 'back.out(1.6)' }, 0.8)
        .fromTo(core, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.8, ease: 'back.out(2)' }, 1.6)
        .fromTo(outer, { scale: 0, skewX: -12, transformOrigin: '50% 100%' }, { scale: 1, skewX: 0, duration: 1.8, stagger: 0.09, ease: 'elastic.out(1, 0.6)' }, 1.8)
        .fromTo(inner, { scale: 0, transformOrigin: '50% 100%' }, { scale: 1, duration: 1.4, stagger: 0.08, ease: 'back.out(1.8)' }, 2.2)
        .fromTo(aura, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 0.9, scale: 1.1, duration: 2, ease: 'power2.out' }, 2.4);
      track(gsap.to(aura, { opacity: 0.5, scale: 1.22, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 4.4, transformOrigin: '50% 50%' }));
    }
    await fallLine.catch(() => {});
    if (sig.aborted) return;
    await ui.narrate(beat.land, { position: 'top' });
    await done(bloom);
    await ui.narrate(beat.after, { position: 'top', hold: 2.2 });
    await done(sky);
    // the night is over: retire its layers (less overdraw, fewer composited layers)
    [starsHost, el.querySelector('.pro-night'), el.querySelector('.pro-predawn')].forEach((n) => { n.style.display = 'none'; });
    clearInterval(this.starTimer);

    /* ---------- 6 · the flower's light becomes her ---------- */
    await ctx.preload(hero.url);
    if (sig.aborted) return;
    audio.sfx('swell');
    const fr = fsvg.querySelector('.fl-head').getBoundingClientRect();
    bloomlight.style.left = `${fr.left + fr.width / 2}px`;
    bloomlight.style.top = `${fr.top + fr.height / 2}px`;
    const swell = gsap.to(bloomlight, { opacity: 1, scale: 1.25, duration: reduced ? 1.2 : 2.4, ease: 'power2.in' });
    track(swell);
    await done(swell);
    gsap.set(flower, { autoAlpha: 0 });
    gsap.set(reveal, { autoAlpha: 1 });
    audio.setMood('wonder');
    layout(); // fonts & sizes are final now
    const ink = inkHost.querySelector('.pro-arch-ink');
    const inkLines = ink.querySelectorAll('.ai-line, .ai-hair, .ai-curl, .ai-finial *, .ai-stem, .ai-gem');
    const leavesInk = ink.querySelectorAll('.ai-leaf');
    const blooms = ink.querySelectorAll('.ai-bloom');
    const rv = gsap.timeline();
    track(rv);
    rv.to(bloomlight, { opacity: 0, scale: 2.4, duration: reduced ? 1.4 : 3.2, ease: 'power2.out', onComplete: () => { bloomlight.style.display = 'none'; flower.style.display = 'none'; } }, 0)
      .fromTo(glow, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 3, ease: 'power2.out' }, 0)
      .fromTo(heroEl, { clipPath: 'circle(0% at 50% 58%)', filter: 'brightness(2.2) saturate(.6) blur(6px)' }, { clipPath: 'circle(80% at 50% 58%)', filter: 'brightness(1) saturate(1) blur(0px)', duration: reduced ? 1.6 : 3.2, ease: 'power3.out', clearProps: 'clipPath,filter' }, 0.1)
      .fromTo(heroEl.querySelector('img'), { scale: reduced ? 1 : 1.12 }, { scale: 1, duration: reduced ? 0.1 : 4, ease: 'power2.out' }, 0.1)
      .fromTo(sun, { opacity: 0 }, { opacity: 1, duration: 3.2, ease: 'power2.out' }, 0.5)
      .fromTo(sunSpin, { scale: reduced ? 1 : 0.7, rotation: reduced ? 0 : -24 }, { scale: 1, rotation: 0, duration: 3.6, ease: 'power3.out' }, 0.5);
    if (reduced) {
      nameEl.style.setProperty('--wp', '115%');
      rv.fromTo([ink, nameEl, subEl, dateEl].filter(Boolean), { opacity: 0 }, { opacity: 1, duration: 1.2, stagger: 0.3 }, 0.8);
    } else {
      rv.fromTo(inkLines, { drawSVG: '0%' }, { drawSVG: '100%', duration: 2.4, ease: 'power2.inOut', stagger: 0.03 }, 0.9)
        .fromTo(leavesInk, { scale: 0, transformOrigin: '0% 50%' }, { scale: 1, duration: 1, stagger: 0.08, ease: 'back.out(1.8)' }, 2.2)
        .fromTo(blooms, { scale: 0, rotation: -40, transformOrigin: '50% 50%' }, { scale: 1, rotation: 0, duration: 1.4, stagger: 0.12, ease: 'back.out(2)' }, 2.5)
        .fromTo(nameEl, { '--wp': '-15%' }, { '--wp': '115%', duration: 2.6, ease: 'power1.inOut' }, 1.8)
        .fromTo(subEl || [], { opacity: 0, letterSpacing: '0.62em' }, { opacity: 1, letterSpacing: '0.3em', duration: 2.2, ease: 'power3.out' }, 3.3)
        .fromTo(dateEl, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 1.6, ease: 'power2.out' }, 4.1);
    }
    inkHost.dataset.drawn = '1';
    rv.add(() => {
      const r = heroEl.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top - r.width * 0.06, reduced ? 4 : 8, { spread: r.width * 0.2 });
      audio.sfx('sparkle');
    }, 2.4);
    if (!reduced) {
      track(gsap.to(sunIn, { rotation: 360, duration: 180, repeat: -1, ease: 'none' }));
      track(gsap.to(glow, { scale: 1.06, opacity: 0.85, duration: 3.4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 3.2 }));
      track(gsap.to(heroEl.querySelector('img'), { scale: 1.05, duration: 16, ease: 'none', delay: 4 }));
    }

    /* ---------- secret: tap the sun three times ---------- */
    let taps = 0;
    let spinning = false;
    const onSun = (e) => {
      const r = sun.getBoundingClientRect();
      fx.sparkle(e.clientX, e.clientY, 4, { spread: 18 });
      if (spinning) return;
      taps += 1;
      if (taps !== 3) {
        // a small acknowledgement — the sun noticed
        track(gsap.fromTo(sunSpin, { scale: 1 }, { scale: 1.03, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.out' }));
        return;
      }
      spinning = true;
      audio.sfx('chime');
      const tl = gsap.timeline({ onComplete: () => { spinning = false; } });
      track(tl);
      tl.to(sunSpin, { rotation: '+=360', duration: reduced ? 0.01 : 1.8, ease: 'power2.inOut' }, 0)
        .to(sun, { '--glow': 1, duration: 0.9, ease: 'power2.out' }, 0)
        .fromTo(sunGlow, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 1, ease: 'power2.out' }, 0)
        .to(sunGlow, { opacity: 0, duration: 2.4, ease: 'power2.inOut' }, 1.6)
        .to(sun, { '--glow': 0, duration: 2.4, ease: 'power2.inOut' }, 1.6);
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, 22, { spread: r.width * 0.3 });
      ctx.eggs.found('sun-taps', 'The sun has always known your name.');
    };
    sun.addEventListener('pointerdown', onSun);
    this.cleanup.push(() => sun.removeEventListener('pointerdown', onSun));

    await done(rv);
    // the name has finished writing itself — drop the mask layer
    nameEl.style.webkitMaskImage = 'none';
    nameEl.style.maskImage = 'none';
    await ctx.wait(reduced ? 0.8 : 1.6);
    await ui.waitContinue('Begin her story');
    const sr = sun.getBoundingClientRect();
    const sx = Math.min(Math.max(sr.left + sr.width / 2, 0), window.innerWidth);
    const sy = Math.min(Math.max(sr.top + sr.height / 2, 0), window.innerHeight);
    ctx.next({ kind: 'sun', x: sx, y: sy, color: '#ffe3a3' });
  },
  async exit() {
    (this.cleanup || []).forEach((fn) => fn());
    (this.timers || []).forEach((id) => { clearInterval(id); clearTimeout(id); });
    clearInterval(this.starTimer);
    (this.tweens || []).forEach((tw) => tw && tw.kill());
    this.cleanup = [];
    this.timers = [];
    this.tweens = [];
  },
};
