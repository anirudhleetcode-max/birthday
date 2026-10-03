// Chapter Three — A Legend of Many Names. The film's funny chapter.
//
//  1. A hushed, deadly-serious nature documentary: letterboxed golden-hour
//     meadow, a telephoto focus pull onto the subject, a "Field notes" lower third.
//  2. An absurdly epic trailer: every nickname is announced like a legendary
//     title — braams, god rays, lens-flare sweeps, screen shake, sparks, metallic
//     type and a slow push-in on a "legendary portrait". The little chameleon
//     peeks in and turns pink at the second name…
//  3. …and the last name breaks the trailer: record scratch, freeze frame, the
//     chameleon faints, the scary letters fall off the screen, and the name
//     arrives the only way it can — softly, in a script, in pink.
//  4. A small triptych of all the names; the finale line.
//
// Photos: ctx.photos('names') in order, ANY count (reused / skipped gracefully).
// Words: messages.names {kicker, title, documentary[], items[{name,line,sub}], aka, finale}.
import { createChameleon } from '../core/chameleon.js';
import { sunEmblem, esc } from '../core/art.js';

const DOC_FALLBACK = [
  'Here, in the soft light of the golden hour, we observe one of nature’s rarest creatures.',
  'She is rare. She is radiant. Tonight, she is turning twenty.',
  'The locals know her simply as {name}.',
  'But our field notes suggest… she goes by other names.',
];
const ITEM_FALLBACK = [
  { line: 'To the world, she is {name}.', sub: 'Keeper of the lanterns. Twenty of them, as of tonight.' },
  { line: 'To the chosen few, she is {nick1}.', sub: 'Origin: classified. Usage: constant. Complaints: none on record.' },
  { line: 'And to the very, very lucky…', sub: 'There is no other word for it. There never will be.' },
];
const TINTS = [
  { ray: '255, 206, 120', haze: 'rgba(255, 176, 82, .34)', name: 'gold' },
  { ray: '255, 156, 196', haze: 'rgba(255, 128, 176, .32)', name: 'rose' },
  { ray: '255, 214, 150', haze: 'rgba(255, 190, 120, .3)', name: 'gold' },
  { ray: '214, 180, 255', haze: 'rgba(185, 140, 255, .3)', name: 'gold' },
];

/* ------------------------------------------------------------------ helpers */
function grassSVG(n, { seed = 1, h = 100, color = '#1a0b22', rim = 'rgba(255, 214, 140, .38)' } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const groups = [[], [], []];
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 1000 + rnd() * 30;
    const tall = h * (0.45 + rnd() * 0.55);
    const lean = (rnd() - 0.5) * 70;
    const w = 5 + rnd() * 7;
    const d = `M${(x - w).toFixed(1)} ${h} Q${(x + lean * 0.3).toFixed(1)} ${(h - tall * 0.55).toFixed(1)} ${(x + lean).toFixed(1)} ${(h - tall).toFixed(1)} Q${(x + lean * 0.25 + w * 0.3).toFixed(1)} ${(h - tall * 0.5).toFixed(1)} ${(x + w).toFixed(1)} ${h} Z`;
    groups[i % 3].push(`<path d="${d}"/>`);
    if (rnd() < 0.18) {
      // a seed head catching the light
      groups[i % 3].push(`<ellipse cx="${(x + lean).toFixed(1)}" cy="${(h - tall + 4).toFixed(1)}" rx="2.4" ry="7" transform="rotate(${(lean * 0.4).toFixed(1)} ${(x + lean).toFixed(1)} ${(h - tall + 4).toFixed(1)})" fill="${rim}"/>`);
    }
  }
  return `<svg class="nm-grass-svg" viewBox="0 0 1000 ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${groups.map((g, i) => `<g class="nm-blades b${i}" fill="${color}" stroke="${rim}" stroke-width=".7">${g.join('')}</g>`).join('')}
  </svg>`;
}

function cornerSVG() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12 V1 H12" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
}

/** A frame flourish for the bottom corners of the legendary portraits. */
function cornerOrn() {
  return `<svg class="nm-co" viewBox="0 0 60 60" aria-hidden="true"><g fill="none" stroke="#f4c463" stroke-width="1.3" stroke-linecap="round">
    <path d="M4 56 C4 34 14 20 34 14"/><path d="M34 14 C42 12 47 18 44 23 C41 28 34 25 36 20"/><path d="M4 56 C18 54 28 48 32 38"/>
    <circle cx="4" cy="56" r="2.4" fill="#f4c463"/></g></svg>`;
}

/** Embers rising through the trailer (a small, capped particle canvas). */
function makeEmbers(canvas, device) {
  const g = canvas.getContext('2d');
  const dpr = Math.min(device.dpr || 1, device.lowPower ? 1 : 1.5);
  let W = 0;
  let H = 0;
  const resize = () => {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const sprites = new Map();
  const sprite = (rgb) => {
    if (!sprites.has(rgb)) {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.22, `rgba(${rgb},1)`);
      gr.addColorStop(0.55, `rgba(${rgb},.22)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = gr;
      x.fillRect(0, 0, 32, 32);
      sprites.set(rgb, c);
    }
    return sprites.get(rgb);
  };
  const max = device.reducedMotion ? 16 : device.tier === 'low' ? 26 : device.tier === 'mid' ? 48 : 80;
  const ps = [];
  const st = { rate: 0, frozen: false, rgb: '255, 196, 110', speed: 1, alpha: 1 };
  let acc = 0;
  let raf = 0;
  let last = performance.now();
  const spawn = (o) => {
    if (ps.length >= max * 1.6) return;
    ps.push({ x: 0, y: H + 10, vx: 0, vy: -40, life: 0, max: 4, s: 3, ph: Math.random() * 6.28, img: sprite(st.rgb), ...o });
  };
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.clearRect(0, 0, W, H);
    if (!st.frozen) {
      acc += st.rate * dt;
      while (acc >= 1 && ps.length < max) {
        acc -= 1;
        spawn({ x: Math.random() * W, y: H + 10, vx: (Math.random() - 0.5) * 20, vy: -(30 + Math.random() * 70) * st.speed, max: 3 + Math.random() * 4, s: 1.6 + Math.random() * 3.6 });
      }
      if (acc > 1) acc = 1;
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (!st.frozen) {
        p.life += dt;
        p.ph += dt * 3;
        p.vx += Math.sin(p.ph) * 14 * dt;
        p.vx *= 1 - dt * 0.6;
        p.vy *= 1 - dt * 0.25;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      const k = p.life / p.max;
      if (k >= 1 || p.y < -20) { ps.splice(i, 1); continue; }
      const a = Math.sin(Math.PI * Math.min(1, k * 1.15)) * (0.65 + 0.35 * Math.sin(p.ph * 4)) * st.alpha;
      g.globalAlpha = Math.max(0, a);
      const s = p.s * 3;
      g.drawImage(p.img, p.x - s, p.y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  raf = requestAnimationFrame(frame);
  return {
    st,
    resize,
    burst(x, y, n = 30, power = 1) {
      const count = Math.round(n * (device.tier === 'low' ? 0.5 : 1) * (device.reducedMotion ? 0.4 : 1));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (60 + Math.random() * 260) * power;
        spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 50, max: 1.2 + Math.random() * 1.6, s: 1.4 + Math.random() * 2.6 });
      }
    },
    tint(rgb) { st.rgb = rgb; },
    destroy() { cancelAnimationFrame(raf); ps.length = 0; },
  };
}

/** Split a name into word/char spans (script names keep whole words so the letters join). */
function buildName(el, text, script = false) {
  el.textContent = '';
  const inner = document.createElement('span');
  inner.className = 'nm-name-in';
  const chars = [];
  const words = String(text).trim().split(/\s+/);
  words.forEach((w, wi) => {
    const ws = document.createElement('span');
    ws.className = 'nm-word';
    if (script) {
      const c = document.createElement('span');
      c.className = 'nm-ch';
      c.textContent = w;
      ws.appendChild(c);
      chars.push(c);
    } else for (const ch of w) {
      const c = document.createElement('span');
      c.className = 'nm-ch';
      c.textContent = ch;
      ws.appendChild(c);
      chars.push(c);
    }
    inner.appendChild(ws);
    if (wi < words.length - 1) inner.appendChild(document.createTextNode(' '));
  });
  el.appendChild(inner);
  return { chars, inner, words: [...inner.querySelectorAll('.nm-word')] };
}

/** Fit a name into maxW × maxH: one line if it stays big enough, else one word per line. */
function fitName(el, built, { maxW, maxH, maxPx, minOne }) {
  el.classList.remove('stack');
  el.style.fontSize = '100px';
  const one = built.inner.getBoundingClientRect().width / 100;
  const widest = Math.max(...built.words.map((w) => w.getBoundingClientRect().width)) / 100;
  let size = Math.min(maxPx, maxW / Math.max(one, 0.01), maxH / 1.15);
  if (size < minOne && built.words.length > 1) {
    el.classList.add('stack');
    size = Math.min(maxPx, maxW / Math.max(widest, 0.01), maxH / (built.words.length * 1.05));
  }
  el.style.fontSize = `${Math.max(18, Math.floor(size))}px`;
  return size;
}

/* ------------------------------------------------------------------ scene */
export default {
  id: 'names',
  title: 'A Legend of Many Names',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const reduced = device.reducedMotion;
    const t = ctx.text.names || {};
    const fill = (s) => ctx.fill(s);
    const nick = (ctx.site.her && ctx.site.her.nicknames) || [];
    const herName = (ctx.site.her && ctx.site.her.name) || nick[0] || 'Deepu';
    const items = Array.isArray(t.items) ? t.items : [];
    const count = Math.max(1, Math.min(5, Math.max(nick.length, items.length) || 3));
    const beats = Array.from({ length: count }, (_, i) => {
      const it = items[i] || {};
      const fb = ITEM_FALLBACK[i] || ITEM_FALLBACK[ITEM_FALLBACK.length - 1];
      const name = String(nick[i] || fill(it.name) || (i === 0 ? herName : '')).trim() || herName;
      return { name, line: fill(it.line != null ? it.line : fb.line), sub: fill(it.sub != null ? it.sub : fb.sub) };
    });
    const photos = ctx.photos('names');
    const photoFor = (i) => (photos.length ? photos[i % photos.length] : null);
    // the title faces must be loaded before names are measured
    const fonts = ['700 40px "Cinzel Decorative"', '40px "Great Vibes"', '40px Caveat', '12px Cinzel'];
    await Promise.race([
      Promise.all([...photos.map((p) => ctx.preload(p.url)), ...fonts.map((f) => (document.fonts ? document.fonts.load(f).catch(() => null) : null))]),
      ctx.wait(4),
    ]);

    // optional chapter words (with fallbacks)
    const aka = fill(t.aka || 'also known as…');
    const finaleLine = fill(t.finale || 'Three names. One legend. Every one of them, completely her.');
    const scratchNote = fill(t.scratch || 'okay. some names are too cute for the scary font.');
    const fieldKicker = fill(t.fieldKicker || 'Field notes');
    const subjectLine = fill(t.subject || `Subject: ${beats[0].name}`);
    const docLines = Array.isArray(t.documentary) && t.documentary.length ? t.documentary : DOC_FALLBACK;

    /* ---------- sound helpers: dedicated sfx when the engine has them ---------- */
    let SFX = null;
    try { SFX = (await import('../core/audio.js')).SFX_NAMES || null; } catch { SFX = null; }
    const sfx = (name, fallbacks = [], opts) => {
      if (!SFX || SFX.includes(name)) audio.sfx(name, opts);
      if (SFX && !SFX.includes(name)) fallbacks.forEach((f) => audio.sfx(f, opts));
    };

    /* ---------- DOM ---------- */
    el.innerHTML = `
      <div class="nm-doc">
        <div class="nm-doc-cam">
          <div class="nm-doc-sky"><i class="nm-doc-sun"></i></div>
          <div class="nm-doc-bokeh">${Array.from({ length: device.tier === 'low' ? 6 : 11 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--y:${18 + ((i * 23) % 50)}%;--s:${0.5 + ((i * 7) % 6) / 5};--d:${(i % 5) * -2.3}s"></i>`).join('')}</div>
          <div class="nm-doc-hill"></div>
          <div class="nm-grass back">${grassSVG(70, { seed: 7, h: 120, color: '#2a1432', rim: 'rgba(255, 196, 140, .3)' })}</div>
          <div class="nm-subject"><img alt=""></div>
          <div class="nm-grass front">${grassSVG(46, { seed: 3, h: 160 })}</div>
        </div>
        <div class="nm-dim"></div>
        <div class="nm-vf" aria-hidden="true">
          <i class="c tl">${cornerSVG()}</i><i class="c tr">${cornerSVG()}</i><i class="c bl">${cornerSVG()}</i><i class="c br">${cornerSVG()}</i>
          <span class="nm-tc">00:00:00:00</span><span class="nm-lens">600mm · f/4</span>
        </div>
        <div class="nm-lower" aria-hidden="true"><i class="nl-bar"></i><span class="nl-k"></span><span class="nl-t"></span></div>
      </div>
      <div class="nm-trailer" aria-hidden="true">
        <div class="nm-void"></div>
        <div class="nm-rays"></div>
        <div class="nm-haze"></div>
        <canvas class="nm-embers"></canvas>
        <div class="nm-shake">
          <div class="nm-stage">
            <div class="nm-frame-slot"></div>
            <div class="nm-title">
              <h2 class="nm-name"></h2>
              <p class="nm-line"></p>
              <p class="nm-sub"></p>
              <p class="nm-note"></p>
            </div>
          </div>
        </div>
        <div class="nm-aka"></div>
        <div class="nm-flare"><i class="nf-streak"></i><i class="nf-core"></i><i class="nf-g g1"></i><i class="nf-g g2"></i><i class="nf-g g3"></i></div>
        <div class="nm-vignette"></div>
      </div>
      <div class="nm-finale" aria-hidden="true"><div class="nm-trip"></div><p class="nm-fin-line"></p></div>
      <div class="nm-live sr-only" aria-live="polite"></div>`;

    const $ = (s) => el.querySelector(s);
    const doc = $('.nm-doc');
    const docCam = $('.nm-doc-cam');
    const subject = $('.nm-subject');
    const subjectImg = subject.querySelector('img');
    const vf = $('.nm-vf');
    const tc = $('.nm-tc');
    const lower = $('.nm-lower');
    const trailer = $('.nm-trailer');
    const rays = $('.nm-rays');
    const haze = $('.nm-haze');
    const shake = $('.nm-shake');
    const stage = $('.nm-stage');
    const slot = $('.nm-frame-slot');
    const title = $('.nm-title');
    const nameEl = $('.nm-name');
    const lineEl = $('.nm-line');
    const subEl = $('.nm-sub');
    const noteEl = $('.nm-note');
    const akaEl = $('.nm-aka');
    const flare = $('.nm-flare');
    const finale = $('.nm-finale');
    const live = $('.nm-live');
    lower.querySelector('.nl-k').textContent = fieldKicker;
    lower.querySelector('.nl-t').textContent = subjectLine;

    const p0 = photoFor(0);
    if (p0) {
      subjectImg.src = p0.url;
      subjectImg.alt = p0.alt || '';
      subjectImg.style.objectPosition = p0.objectPosition;
      subject.style.aspectRatio = String(p0.ratio || 0.8);
    } else subject.remove();

    const embers = makeEmbers($('.nm-embers'), device);
    let tcRaf = 0;
    const tcStart = performance.now();
    const tickTC = () => {
      tcRaf = requestAnimationFrame(tickTC);
      const s = (performance.now() - tcStart) / 1000 + 754;
      const f = Math.floor((s % 1) * 24);
      const p2 = (n) => String(Math.floor(n)).padStart(2, '0');
      tc.textContent = `${p2(s / 3600)}:${p2((s / 60) % 60)}:${p2(s % 60)}:${p2(f)}`;
    };
    const onResize = () => embers.resize();
    window.addEventListener('resize', onResize);

    // the little one — an easter egg, never the star
    const chamSize = Math.round(Math.max(76, Math.min(128, Math.min(window.innerWidth, window.innerHeight) * 0.24)));
    const cham = createChameleon(el, {
      size: chamSize,
      reducedMotion: reduced,
      className: 'nm-cham',
      onTap: () => ctx.eggs.found('chameleon', 'You found the little one. It’s shy.'),
    });

    this.cleanup = () => {
      cancelAnimationFrame(tcRaf);
      embers.destroy();
      cham.destroy();
      window.removeEventListener('resize', onResize);
    };

    /* ---------- beat helpers ---------- */
    const portrait = (photo, i) => {
      const f = document.createElement('div');
      f.className = 'nm-frame';
      f.style.setProperty('--ar', String(photo.ratio || 0.8));
      f.innerHTML = `
        <div class="nm-portrait"><img alt="${esc(photo.alt || '')}" src="${esc(photo.url)}" style="object-position:${esc(photo.objectPosition || '50% 40%')}"><i class="nm-shine"></i></div>
        <i class="nm-frame-line"></i>
        <div class="nm-crest">${sunEmblem({ className: 'nm-crest-sun' })}</div>
        <i class="nm-co-l">${cornerOrn()}</i><i class="nm-co-r">${cornerOrn()}</i>`;
      const img = f.querySelector('img');
      img.alt = photo.alt || '';
      img.style.objectPosition = photo.objectPosition;
      f.dataset.i = String(i);
      return f;
    };

    const doShake = (amt = 1, n = 8) => {
      if (reduced) return;
      gsap.killTweensOf(shake, 'x,y,rotation');
      gsap.fromTo(shake, { x: 0, y: 0 }, {
        x: () => gsap.utils.random(-9, 9) * amt, y: () => gsap.utils.random(-6, 6) * amt, rotation: () => gsap.utils.random(-0.5, 0.5) * amt,
        duration: 0.045, repeat: n, yoyo: true, repeatRefresh: true, ease: 'none',
        onComplete: () => gsap.set(shake, { x: 0, y: 0, rotation: 0 }),
      });
    };

    const flareSweep = (dur = 1.6, y = 0.42) => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const core = flare.querySelector('.nf-core');
      const streak = flare.querySelector('.nf-streak');
      const ghosts = [...flare.querySelectorAll('.nf-g')];
      const k = [0.45, 0.9, 1.35];
      const pr = { p: 0 };
      gsap.set(flare, { opacity: 1 });
      return gsap.to(pr, {
        p: 1, duration: reduced ? 0.8 : dur, ease: reduced ? 'none' : 'power1.inOut',
        onUpdate: () => {
          const cx = reduced ? W * 0.5 : -0.15 * W + pr.p * 1.3 * W;
          const cy = H * y + (pr.p - 0.5) * H * 0.04;
          const env = Math.sin(Math.PI * pr.p);
          gsap.set(core, { x: cx, y: cy, opacity: env });
          gsap.set(streak, { y: cy, x: cx - W, opacity: env * 0.9 });
          ghosts.forEach((gh, j) => gsap.set(gh, { x: W / 2 + (W / 2 - cx) * k[j], y: H / 2 + (H / 2 - cy) * k[j], opacity: env * 0.55 }));
        },
        onComplete: () => gsap.set(flare, { opacity: 0 }),
      });
    };

    const setTint = (i) => {
      const tint = TINTS[i % TINTS.length];
      el.style.setProperty('--nm-ray', tint.ray);
      el.style.setProperty('--nm-haze', tint.haze);
      embers.tint(tint.ray);
    };

    const placeLight = () => {
      // rays & haze radiate from behind the portrait (or the name, if there's no photo)
      const r = (slot.firstElementChild || nameEl).getBoundingClientRect();
      const s = el.getBoundingClientRect();
      const fxp = ((r.left + r.width / 2 - s.left) / s.width) * 100;
      const fyp = ((r.top + r.height * 0.45 - s.top) / s.height) * 100;
      el.style.setProperty('--fx', `${fxp.toFixed(1)}%`);
      el.style.setProperty('--fy', `${fyp.toFixed(1)}%`);
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
    };

    const sizeName = (text, script = false) => {
      nameEl.classList.toggle('script', script);
      const built = buildName(nameEl, text, script);
      const landscape = el.clientWidth > el.clientHeight * 1.05;
      const W = el.clientWidth;
      const maxW = landscape ? Math.min(W * 0.42, 620) : Math.min(W * 0.88, 640);
      const maxH = landscape ? el.clientHeight * 0.3 : el.clientHeight * 0.17;
      const maxPx = script ? (landscape ? 128 : 96) : (landscape ? 104 : 80);
      fitName(nameEl, built, { maxW, maxH, maxPx, minOne: script ? 40 : 46 });
      return built;
    };

    const clearTitle = () => {
      nameEl.textContent = '';
      lineEl.textContent = '';
      subEl.textContent = '';
      noteEl.textContent = '';
      gsap.set([lineEl, subEl, noteEl], { opacity: 0 });
    };

    const layoutText = (b) => {
      // lay the words out invisibly first, so nothing shifts when they fade in
      lineEl.textContent = b.line;
      subEl.textContent = b.sub;
      gsap.set([lineEl, subEl], { opacity: 0 });
    };
    const showText = async (b) => {
      if (!lineEl.textContent && !subEl.textContent) layoutText(b);
      gsap.fromTo(lineEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.1, ease: 'power2.out', overwrite: 'auto' });
      await ctx.wait(0.9);
      gsap.fromTo(subEl, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out', overwrite: 'auto' });
      live.textContent = `${b.name}. ${b.line} ${b.sub}`;
    };

    const enterFrame = (i, { slow = false } = {}) => {
      const photo = photoFor(i);
      slot.innerHTML = '';
      if (!photo) return null;
      const f = portrait(photo, i);
      slot.appendChild(f);
      if (reduced) gsap.fromTo(f, { opacity: 0 }, { opacity: 1, duration: 0.8 });
      else if (device.tier === 'low') gsap.fromTo(f, { opacity: 0, scale: slow ? 1.3 : 1.15 }, { opacity: 1, scale: 1, duration: slow ? 2 : 1, ease: 'expo.out' });
      else {
        gsap.fromTo(f, { opacity: 0, scale: slow ? 1.5 : 1.28, filter: 'blur(14px) brightness(2)' },
          { opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)', duration: slow ? 2.4 : 1.1, ease: 'expo.out', clearProps: 'filter' });
        gsap.fromTo(f.querySelector('.nm-shine'), { xPercent: -160 }, { xPercent: 160, duration: 1.6, delay: slow ? 1.2 : 0.4, ease: 'power2.inOut' });
      }
      return f;
    };

    const epicName = (text, { tintRose = false } = {}) => {
      nameEl.classList.toggle('rose', tintRose);
      const { chars } = sizeName(text);
      if (reduced) {
        gsap.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: 0.7, stagger: 0.04 });
      } else {
        gsap.fromTo(chars, { opacity: 0, scale: 2.6, y: -10 },
          { opacity: 1, scale: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07, overwrite: 'auto' });
      }
      return chars;
    };

    const pushIn = (dur = 10) => {
      if (reduced) return;
      gsap.fromTo(stage, { scale: 1 }, { scale: 1.06, duration: dur, ease: 'none' });
    };

    const hitAt = () => {
      const r = nameEl.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width };
    };

    const impact = (power = 1, { flashColor = '#ffe3a3' } = {}) => {
      fx.flash({ color: flashColor, duration: 0.7, peak: 0.42 * power });
      doShake(power, 8);
      const h = hitAt();
      embers.burst(h.x, h.y, 34 * power, 1.1);
      const r = nameEl.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, Math.round(14 * power), { spread: r.width / 2 });
    };

    const fadeTrailer = async (d = 0.9) => {
      const f = slot.firstElementChild;
      gsap.to(title, { opacity: 0, y: -10, duration: d * 0.8, ease: 'power2.in', overwrite: 'auto' });
      if (f) gsap.to(f, { opacity: 0, scale: 0.94, duration: d, ease: 'power2.in', overwrite: 'auto' });
      gsap.to([rays, haze], { opacity: 0, duration: d, overwrite: 'auto' });
      embers.st.rate = 2;
      await ctx.wait(d);
      if (f) { gsap.killTweensOf(f); f.remove(); }
      gsap.killTweensOf(stage);
      gsap.set(title, { opacity: 1, y: 0 });
      gsap.set(stage, { scale: 1 });
      clearTitle();
    };

    const akaPause = async (dramatic = false) => {
      audio.duck(0.12, dramatic ? 3.4 : 2.4);
      akaEl.textContent = aka;
      gsap.fromTo(akaEl, { opacity: 0, letterSpacing: '0.7em' }, { opacity: 1, letterSpacing: '0.42em', duration: 1.4, ease: 'power2.out', overwrite: 'auto' });
      live.textContent = aka;
      await ctx.wait(dramatic ? 2.2 : 1.7);
      if (dramatic) {
        sfx('drumroll', ['heartbeat']);
        if (!SFX || !SFX.includes('drumroll')) { audio.sfx('heartbeat', { delay: 0.7 }); }
        gsap.to(akaEl, { scale: 1.06, duration: 1.4, ease: 'sine.in', overwrite: 'auto' });
        await ctx.wait(1.3);
      }
      gsap.killTweensOf(akaEl);
      await new Promise((r) => gsap.to(akaEl, { opacity: 0, duration: 0.5, onComplete: r }));
      gsap.set(akaEl, { scale: 1, opacity: 0 });
    };

    /* ================================================================ 0 · open */
    gsap.set(trailer, { autoAlpha: 0 });
    gsap.set(finale, { autoAlpha: 0 });
    gsap.set([vf, lower], { opacity: 0 });
    gsap.set(subject, { opacity: 0 });
    setTint(0);
    clearTitle();
    ctx.letterbox(true);
    fx.dust({ density: 0.35, alpha: 0.8 });
    audio.setMood('hush');
    if (!reduced) gsap.fromTo(docCam, { scale: 1.08 }, { scale: 1, duration: 9, ease: 'power2.out' });

    await ui.chapterCard(t.kicker || 'Chapter Three', t.title || 'A Legend of Many Names');

    /* ================================================================ 1 · documentary */
    el.dataset.phase = 'doc';
    gsap.to(el.querySelector('.nm-dim'), { opacity: 0, duration: 2.4, ease: 'sine.inOut' });
    tickTC();
    gsap.to(vf, { opacity: 1, duration: 1.2 });
    if (p0) {
      gsap.fromTo(subject, { opacity: 0 }, { opacity: 1, duration: 1.6, ease: 'sine.out' });
      if (reduced || device.tier === 'low') gsap.fromTo(subjectImg, { opacity: 0.6 }, { opacity: 1, duration: 2 });
      else gsap.fromTo(subjectImg, { filter: 'blur(9px)', scale: 1.06 }, { filter: 'blur(0px)', scale: 1, duration: 3.2, delay: 0.6, ease: 'power2.inOut' });
    }
    await ctx.wait(1.4);
    gsap.fromTo(lower, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 1.1, ease: 'power3.out' });
    gsap.fromTo(lower.querySelector('.nl-bar'), { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power3.inOut', transformOrigin: '0 50%' });
    await ctx.wait(4.2);
    gsap.to(lower, { opacity: 0, x: -8, duration: 0.8, ease: 'power2.in' });
    if (!reduced) gsap.to(docCam, { scale: 1.07, duration: 26, ease: 'none' });
    await ctx.wait(0.6);
    await ui.narrate(docLines, { style: 'whisper', position: 'bottom', duck: 0.55 });
    await ctx.wait(0.3);

    /* ================================================================ 2 · the trailer */
    // hard cut to black. a breath of silence.
    gsap.set(doc, { autoAlpha: 0 });
    cancelAnimationFrame(tcRaf);
    fx.dust({ density: 0.15, alpha: 0.5 });
    audio.duck(0.05, 1.3);
    gsap.set(trailer, { autoAlpha: 1 });
    gsap.set([rays, haze], { opacity: 0 });
    await ctx.wait(1.0);
    audio.setMood('wonder');
    embers.st.rate = device.tier === 'low' ? 6 : 12;

    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const last = i === beats.length - 1 && beats.length > 1;
      el.dataset.phase = `beat${i}`;
      setTint(i);
      if (i > 0) await akaPause(last);

      if (!last) {
        // ---------- an epic, entirely serious announcement ----------
        const f = enterFrame(i);
        placeLight();
        gsap.to(rays, { opacity: 1, duration: 1.4 });
        gsap.to(haze, { opacity: 1, duration: 1.4 });
        pushIn(11);
        if (i === 1) sfx('choir', ['shimmer', 'magic']);
        sfx('braam', ['swell', 'whoosh']);
        fx.flash({ color: i === 1 ? '#ffc4dc' : '#ffe3a3', duration: 0.9, peak: 0.35 });
        layoutText(b);
        await ctx.wait(f ? 0.8 : 0.3);
        epicName(b.name, { tintRose: i === 1 });
        live.textContent = b.name;
        await ctx.wait(0.45);
        impact(1, { flashColor: i === 1 ? '#ffc4dc' : '#ffe3a3' });
        flareSweep(1.7, (hitAt().y + el.getBoundingClientRect().top) / window.innerHeight);
        await ctx.wait(1.1);
        await showText(b);

        if (i === 1 || (beats.length === 2 && i === 0)) {
          // the little one can't help it: it peeks in… and turns pink
          await ctx.wait(0.6);
          const peek = cham.peek('bottom');
          await ctx.wait(1.3);
          const r = nameEl.getBoundingClientRect();
          cham.lookAt(r.left + r.width / 2, r.top + r.height / 2);
          await peek;
          await ctx.wait(0.5);
          cham.react('surprised');
          await ctx.wait(0.9);
          cham.colorTo('#f6a9c9', { duration: 1.6 });
          const cr = cham.el.getBoundingClientRect();
          fx.sparkle(cr.left + cr.width * 0.55, cr.top + cr.height * 0.35, 12, { spread: cr.width * 0.4, pink: true });
          await ctx.wait(1.4);
          cham.blush(true, { hold: 1.6 });
          await ctx.wait(2.2);
        } else {
          await ctx.wait(3.6);
        }
        await fadeTrailer(0.9);
        continue;
      }

      // ---------- the last name: the trailer can't handle it ----------
      if (!cham.visible) {
        cham.peek('bottom');
        cham.colorTo('#f6a9c9', { duration: 1.2 });
      }
      const f = enterFrame(i, { slow: true });
      placeLight();
      gsap.to(rays, { opacity: 1, duration: 2 });
      gsap.to(haze, { opacity: 1, duration: 2 });
      embers.st.rate = device.tier === 'low' ? 10 : 22;
      embers.st.speed = 1.5;
      pushIn(14);
      sfx('braam', ['swell', 'whoosh']);
      sfx('choir', ['shimmer']);
      await ctx.wait(f ? 1.4 : 0.4);

      // K… U… C… H… I… — one braam per letter, building
      const words = b.name.split(/\s+/);
      const built = sizeName(b.name);
      nameEl.classList.remove('rose');
      const firstWord = built.words[0] ? [...built.words[0].querySelectorAll('.nm-ch')] : built.chars;
      const restChars = built.chars.filter((c) => !firstWord.includes(c));
      gsap.set(built.chars, { opacity: 0 });
      const cr0 = cham.el.getBoundingClientRect();
      if (cham.visible) cham.lookAt(window.innerWidth / 2, cr0.top - 200);
      for (let k = 0; k < firstWord.length; k++) {
        const c = firstWord[k];
        if (reduced) gsap.to(c, { opacity: 1, duration: 0.3 });
        else gsap.fromTo(c, { opacity: 0, scale: 3.2 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'expo.out', overwrite: 'auto' });
        audio.sfx(k % 2 ? 'pop' : 'tap');
        if (k === firstWord.length - 1) sfx('braam', ['swell']);
        await ctx.wait(0.18);
        const cr = c.getBoundingClientRect();
        const s = el.getBoundingClientRect();
        embers.burst(cr.left - s.left + cr.width / 2, cr.top - s.top + cr.height / 2, 10 + k * 3, 0.8);
        doShake(0.35 + k * 0.18, 4);
        await ctx.wait(Math.max(0.16, 0.36 - k * 0.04));
      }
      if (words.length === 1 || !restChars.length) await ctx.wait(0.2);

      // ——— the record scratch ———
      el.dataset.phase = 'scratch';
      sfx('scratch', ['pop']);
      audio.duck(0.02, 3.6);
      gsap.killTweensOf(stage);
      gsap.killTweensOf(shake);
      gsap.set(shake, { x: 0, y: 0, rotation: 0 });
      trailer.classList.add('is-frozen');
      embers.st.frozen = true;
      if (!reduced) gsap.fromTo(shake, { scale: 1 }, { scale: 1.035, duration: 0.12, ease: 'power3.out' });
      live.textContent = scratchNote;
      await ctx.wait(0.9);
      if (cham.visible) {
        const r = nameEl.getBoundingClientRect();
        cham.lookAt(r.left + r.width / 2, r.top + r.height / 2);
        await ctx.wait(0.5);
        cham.react('faint');
        await ctx.wait(2.0);
      }
      noteEl.textContent = scratchNote;
      {
        // pin the note just under what's actually on screen (the first word)
        const anchor = (built.words[0] || nameEl).getBoundingClientRect();
        const tr = title.getBoundingClientRect();
        noteEl.style.top = `${Math.round(anchor.bottom - tr.top + 4)}px`;
      }
      gsap.fromTo(noteEl, { opacity: 0, y: 6, rotation: -3 }, { opacity: 1, y: 0, rotation: -2, duration: 0.6, ease: 'power2.out' });
      await ctx.wait(2.6);

      // the scary letters fall off the screen like dropped props
      const H = el.clientHeight;
      if (reduced) gsap.to(built.chars, { opacity: 0, duration: 0.5 });
      else {
        firstWord.forEach((c, k) => {
          gsap.to(c, {
            y: H * 0.8, rotation: gsap.utils.random(-70, 70), opacity: 0.0, duration: 1.0, delay: k * 0.09, ease: 'power2.in', overwrite: 'auto',
            onStart: () => audio.sfx('pop', { delay: 0.75 }),
          });
        });
      }
      gsap.to(noteEl, { opacity: 0, duration: 0.6, delay: 0.9, onComplete: () => { noteEl.textContent = ''; } });
      await ctx.wait(reduced ? 0.6 : 1.4);

      // unfreeze, softly — this name only comes in pink and gold, in a script
      el.dataset.phase = 'script';
      trailer.classList.remove('is-frozen');
      trailer.classList.add('is-soft');
      embers.st.frozen = false;
      embers.st.speed = 0.6;
      embers.st.rate = device.tier === 'low' ? 6 : 12;
      embers.tint('255, 170, 205');
      el.style.setProperty('--nm-ray', '255, 170, 205');
      el.style.setProperty('--nm-haze', 'rgba(255, 150, 196, .36)');
      audio.setMood('tender');
      layoutText(b);
      const sc = sizeName(b.name, true);
      gsap.set(sc.chars, { opacity: 1 });
      if (reduced) gsap.fromTo(nameEl, { opacity: 0 }, { opacity: 1, duration: 0.9 });
      else gsap.fromTo(sc.inner, { clipPath: 'inset(-20% 100% -30% 0)' }, { clipPath: 'inset(-20% -5% -30% 0)', duration: 1.9, ease: 'power2.inOut' });
      sfx('chime', []);
      audio.sfx('shimmer', { delay: 0.3 });
      audio.sfx('sparkle', { delay: 1.1 });
      setTimeout(() => {
        if (ctx.signal.aborted) return;
        const r = nameEl.getBoundingClientRect();
        fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, 26, { spread: r.width / 2, pink: true });
      }, reduced ? 200 : 1500);
      live.textContent = b.name;
      await ctx.wait(2.1);
      await showText(b);
      await ctx.wait(4.4);
      await fadeTrailer(1.1);
    }
    if (beats.length === 1) await ctx.wait(0.2);

    /* ================================================================ 3 · the legend, all of it */
    el.dataset.phase = 'finale';
    gsap.set(trailer, { autoAlpha: 0 });
    embers.st.rate = 0;
    const trip = finale.querySelector('.nm-trip');
    trip.style.setProperty('--n', String(beats.length));
    trip.innerHTML = beats.map((b, i) => {
      const p = photoFor(i);
      return `<figure class="nm-tf">
        ${p ? `<div class="nm-tf-ph"><img alt="" src="${esc(p.thumbUrl || p.url)}" style="object-position:${esc(p.objectPosition)}"></div>` : ''}
        <figcaption class="${i === beats.length - 1 && beats.length > 1 ? 'script' : ''}"></figcaption>
      </figure>`;
    }).join('');
    [...trip.querySelectorAll('figcaption')].forEach((fc, i) => { fc.textContent = beats[i].name; });
    [...trip.querySelectorAll('img')].forEach((im, i) => { im.alt = (photoFor(i) || {}).alt || ''; });
    const finLine = finale.querySelector('.nm-fin-line');
    finLine.textContent = finaleLine;
    gsap.set(finale, { autoAlpha: 1 });
    gsap.set(finLine, { opacity: 0 });
    audio.setMood('festive');
    const figs = [...trip.querySelectorAll('.nm-tf')];
    gsap.fromTo(figs, { opacity: 0, y: 24, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 1.2, stagger: 0.22, ease: 'power3.out' });
    audio.sfx('chime', { delay: 0.2 });
    await ctx.wait(1.6);
    gsap.fromTo(finLine, { opacity: 0, y: 12, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3, ease: 'power2.out' });
    live.textContent = finaleLine;
    await ctx.wait(1.8);

    // the little one comes round, realises everyone saw that, and leaves with dignity
    if (cham.visible) {
      await cham.recover();
      await ctx.wait(0.4);
      cham.lookAt(window.innerWidth / 2, window.innerHeight * 0.3);
      await ctx.wait(0.6);
      await cham.blush(true, { hold: 1.4 });
      cham.hide({ duration: 0.7 });
    }
    await ctx.wait(0.6);
    el.dataset.phase = 'continue';
    await ui.waitContinue('Continue');
    const fr = trip.getBoundingClientRect();
    ctx.next({ kind: 'ember', x: fr.left + fr.width / 2, y: fr.top + fr.height * 0.4, color: '#ffc4dc' });
  },
  async exit() {
    this.cleanup && this.cleanup();
    this.cleanup = null;
  },
};
