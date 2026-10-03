// The last beat of the constellation: one photograph alone in the dark, softly
// lit, a short handwritten line that writes itself, and then the photograph
// dissolving into a single golden point at the centre of a black screen.
// Plain DOM for the photo (the browser's own full-quality image), a 2D canvas
// for the dust. Her photo is never altered: only light and framing around it.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const GOLD = [255, 217, 138];

/**
 * createReveal(el, photo, { device, fill }) →
 *   { layout(W, H), show(), write(text) → Promise, hideText(), dissolve() → Promise<{x, y}>, dispose() }
 */
export function createReveal(el, photo, { device = {}, signal } = {}) {
  const gsap = window.gsap;
  const reduced = !!device.reducedMotion;
  const tier = device.tier || 'high';
  const ratio = clamp(Number(photo && photo.ratio) || 0.8, 0.5, 2);

  const root = document.createElement('div');
  root.className = 'cn-reveal';
  root.innerHTML = `
    <div class="cn-reveal-light" aria-hidden="true"></div>
    <figure class="cn-print"><img alt="" decoding="async" draggable="false"></figure>
    <p class="cn-hand"></p>
    <canvas class="cn-dust" aria-hidden="true"></canvas>
    <div class="cn-point" aria-hidden="true"></div>`;
  el.appendChild(root);
  const light = root.querySelector('.cn-reveal-light');
  const fig = root.querySelector('.cn-print');
  const img = fig.querySelector('img');
  const hand = root.querySelector('.cn-hand');
  const dust = root.querySelector('.cn-dust');
  const point = root.querySelector('.cn-point');
  img.alt = (photo && photo.alt) || '';
  img.style.objectPosition = (photo && photo.objectPosition) || '50% 40%';
  if (photo) img.src = photo.url || photo.thumbUrl || '';

  const tweens = [];
  const keep = (t) => { tweens.push(t); return t; };
  let raf = 0;
  let W = 0;
  let H = 0;
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let fs = 32;
  let text = '';
  let handLines = [];
  let written = false;
  let disposed = false;

  const measure = document.createElement('canvas').getContext('2d');
  function wrapText(str, maxW) {
    measure.font = `400 ${fs}px Caveat, 'Bradley Hand', cursive`;
    const words = str.split(/\s+/).filter(Boolean);
    const width = (s) => measure.measureText(s).width;
    if (width(str) <= maxW || words.length < 2) return [str];
    // the most balanced split into two lines (three if it really must)
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const m = Math.max(width(a), width(b));
      if (!best || m < best.m) best = { m, lines: [a, b] };
    }
    if (best.m <= maxW) return best.lines;
    const out = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && width(next) > maxW) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }

  function layout(w, h) {
    W = w;
    H = h;
    const portrait = H > W * 1.05;
    fs = Math.round(portrait ? clamp(W * 0.078, 26, 44) : clamp(H * 0.052, 28, 46));
    const maxTextW = Math.min(W * 0.86, portrait ? W * 0.86 : 640);
    const lines = text ? wrapText(text, maxTextW) : ['x'];
    const textH = lines.length * fs * 1.12;
    const top = Math.max(portrait ? H * 0.085 : H * 0.075, 54);
    const bottomUI = portrait ? Math.max(104, H * 0.13) : Math.max(96, H * 0.12);
    const gap = Math.max(16, fs * 0.6);
    const availH = H - top - bottomUI - textH - gap;
    const availW = W * (portrait ? 0.82 : 0.56);
    let ph = Math.min(availH, availW / ratio, H * (portrait ? 0.58 : 0.66));
    ph = Math.max(ph, Math.min(availH, 120));
    const pw = ph * ratio;
    const y = top + Math.max(0, (availH - ph) * 0.4);
    box = { x: (W - pw) / 2, y, w: pw, h: ph };
    Object.assign(fig.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${pw}px`, height: `${ph}px` });
    const border = Math.max(3, Math.round(Math.min(pw, ph) * 0.012));
    fig.style.setProperty('--b', `${border}px`);
    const lw = Math.max(pw, ph) * 1.9;
    Object.assign(light.style, { left: `${box.x + pw / 2 - lw / 2}px`, top: `${box.y + ph / 2 - lw / 2}px`, width: `${lw}px`, height: `${lw}px` });
    Object.assign(hand.style, { top: `${box.y + ph + gap}px`, fontSize: `${fs}px` });
    const dpr = Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1 : 2);
    dust.width = Math.round(W * dpr);
    dust.height = Math.round(H * dpr);
    dust.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    point.style.left = `${W / 2}px`;
    point.style.top = `${H / 2}px`;
    if (handLines.length && text) {
      buildHand();
      if (written) hand.querySelectorAll('.cn-hand-row').forEach((r) => r.style.setProperty('--p', '99999px'));
    }
  }

  /** Appear: alone, large, softly lit; a slow push-in. */
  async function show() {
    if (!img.complete || !img.naturalWidth) {
      await Promise.race([
        new Promise((r) => { img.onload = r; img.onerror = r; }),
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    }
    try { await img.decode(); } catch { /* fine */ }
    if (disposed) return;
    root.classList.add('on');
    keep(gsap.fromTo(light, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: reduced ? 1.4 : 3.2, ease: 'sine.out' }));
    keep(gsap.fromTo(fig, { opacity: 0, scale: reduced ? 1 : 0.965, filter: 'blur(10px) brightness(0.6)' },
      { opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)', duration: reduced ? 1.2 : 2.8, ease: 'power2.out', clearProps: 'filter' }));
    if (!reduced) keep(gsap.to(fig, { scale: 1.055, duration: 22, delay: 2.8, ease: 'sine.out' }));
    await new Promise((r) => setTimeout(r, (reduced ? 1.2 : 2.6) * 1000));
  }

  function buildHand() {
    const portrait = H > W * 1.05;
    handLines = wrapText(text, Math.min(W * 0.86, portrait ? W * 0.86 : 640));
    hand.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'cn-sr';
    sr.textContent = text;
    hand.appendChild(sr);
    handLines.forEach((ln) => {
      const row = document.createElement('span');
      row.className = 'cn-hand-row';
      row.setAttribute('aria-hidden', 'true');
      row.innerHTML = '<span class="ink"></span><span class="wet"></span><i class="nib"></i>';
      row.querySelector('.ink').textContent = ln;
      row.querySelector('.wet').textContent = ln;
      hand.appendChild(row);
    });
  }

  /** The line writes itself, pen-speed: quick strokes, little pauses between words, a breath at the comma. */
  async function write(str) {
    text = String(str || '').trim();
    if (!text) return;
    // the canvas measures with the real script, so the pen follows the letters exactly
    try { await Promise.race([document.fonts.load(`400 ${fs}px Caveat`), new Promise((r) => setTimeout(r, 1500))]); } catch { /* fallback font */ }
    if (disposed) return;
    buildHand();
    measure.font = `400 ${fs}px Caveat, 'Bradley Hand', cursive`;
    const rows = [...hand.querySelectorAll('.cn-hand-row')];
    const PAD = Math.round(fs * 0.35); // matches the CSS padding (overhangs of the script)
    rows.forEach((r) => r.style.setProperty('--pad', `${PAD}px`));
    // keyframes: (time, row, px)
    const keys = [];
    let time = 0;
    const speed = reduced ? 0.45 : 1;
    handLines.forEach((ln, ri) => {
      keys.push({ t: time, r: ri, x: PAD - 2 });
      for (let i = 0; i < ln.length; i++) {
        const ch = ln[i];
        const x = PAD + measure.measureText(ln.slice(0, i + 1)).width;
        const cw = measure.measureText(ch).width;
        let d = clamp((cw / (fs * 0.44)) * 0.072, 0.03, 0.12);
        if (ch === ' ') d = 0.05;
        time += d * speed * (0.85 + Math.random() * 0.3);
        keys.push({ t: time, r: ri, x });
        if (ch === ' ') time += 0.07 * speed;
        if (/[,;:—–]/.test(ch)) time += 0.28 * speed;
        if (/[.!?…]/.test(ch)) time += 0.18 * speed;
      }
      keys.push({ t: time + 0.05, r: ri, x: PAD + measure.measureText(ln).width + PAD + 60 });
      time += 0.34 * speed;
    });
    const total = time;
    hand.classList.add('on');
    rows.forEach((r) => r.style.setProperty('--p', '0px'));
    await new Promise((resolve) => {
      const t0 = performance.now();
      let k = 0;
      const step = () => {
        const t = (performance.now() - t0) / 1000;
        while (k < keys.length - 1 && keys[k + 1].t <= t) k++;
        const a = keys[k];
        const b = keys[Math.min(k + 1, keys.length - 1)];
        rows.forEach((row, ri) => {
          let px;
          if (ri < a.r) px = 99999;
          else if (ri > a.r) px = 0;
          else if (b.r !== a.r || b.t <= a.t) px = a.x;
          else px = a.x + (b.x - a.x) * clamp((t - a.t) / (b.t - a.t), 0, 1);
          row.style.setProperty('--p', `${px.toFixed(1)}px`);
          row.classList.toggle('writing', ri === a.r && t < total);
        });
        if (t < total + 0.1) raf = requestAnimationFrame(step);
        else {
          rows.forEach((row) => { row.style.setProperty('--p', '99999px'); row.classList.remove('writing'); });
          written = true;
          resolve();
        }
      };
      raf = requestAnimationFrame(step);
      if (signal) signal.addEventListener('abort', () => { cancelAnimationFrame(raf); resolve(); }, { once: true });
    });
  }

  /** Sample the photo (as framed on screen) into a coarse grid of colours. */
  function sample(cols, rows) {
    try {
      const c = document.createElement('canvas');
      c.width = cols;
      c.height = rows;
      const g = c.getContext('2d', { willReadFrequently: true });
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw || !ih) return null;
      const r = cols / rows;
      let sw = iw;
      let sh = ih;
      const f = photo.focal || { x: 0.5, y: 0.4 };
      if (iw / ih > r) sw = ih * r; else sh = iw / r;
      const sx = clamp(f.x * iw - sw / 2, 0, iw - sw);
      const sy = clamp(f.y * ih - sh / 2, 0, ih - sh);
      g.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
      return g.getImageData(0, 0, cols, rows).data;
    } catch {
      return null; // a tainted canvas or an undecodable image: golden dust instead
    }
  }

  /** The photograph becomes golden dust that gathers into one point at the centre. */
  function dissolve() {
    const cx = W / 2;
    const cy = H / 2;
    keep(gsap.to(hand, { opacity: 0, filter: 'blur(6px)', y: -6, duration: reduced ? 0.6 : 1.1, ease: 'power2.in' }));
    keep(gsap.to(light, { opacity: 0, duration: reduced ? 1 : 2.2, ease: 'sine.inOut' }));
    if (reduced) {
      keep(gsap.to(fig, { opacity: 0, filter: 'blur(8px)', duration: 1.3, ease: 'sine.inOut' }));
      keep(gsap.fromTo(point, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 1.1, delay: 0.6, ease: 'sine.out' }));
      return new Promise((r) => setTimeout(() => r({ x: Math.round(cx), y: Math.round(cy) }), 1900));
    }
    const rect = fig.getBoundingClientRect();
    const host = root.getBoundingClientRect();
    const fx0 = rect.left - host.left;
    const fy0 = rect.top - host.top;
    const fw = rect.width;
    const fh = rect.height;
    const cols = tier === 'low' ? 20 : tier === 'mid' ? 28 : 36;
    const rowsN = Math.max(8, Math.round(cols / (fw / fh)));
    const data = sample(cols, rowsN);
    const cellW = fw / cols;
    const cellH = fh / rowsN;
    const FRONT = 1.5; // seconds for the dissolve to reach the middle of the photo
    const parts = [];
    for (let j = 0; j < rowsN; j++) {
      for (let i = 0; i < cols; i++) {
        // jittered, so the dust never shows the grid it was sampled on
        const x = fx0 + (i + 0.5 + (Math.random() - 0.5) * 0.9) * cellW;
        const y = fy0 + (j + 0.5 + (Math.random() - 0.5) * 0.9) * cellH;
        const nx = ((i + 0.5) / cols) * 2 - 1;
        const ny = ((j + 0.5) / rowsN) * 2 - 1;
        const rr = Math.hypot(nx, ny);
        const o = (j * cols + i) * 4;
        const col = data ? [data[o], data[o + 1], data[o + 2]] : GOLD;
        // the colour on its way to gold, in a few cached steps (no string building per frame)
        const steps = [];
        for (let k = 0; k <= 5; k++) {
          const e = smooth(0, 1, k / 5);
          steps.push(`rgb(${(col[0] + (GOLD[0] - col[0]) * e) | 0},${(col[1] + (GOLD[1] - col[1]) * e) | 0},${(col[2] + (GOLD[2] - col[2]) * e) | 0})`);
        }
        const dist = Math.hypot(cx - x, cy - y);
        parts.push({
          x0: x, y0: y, steps,
          rel: clamp((1.45 - rr) / 1.45, 0, 1) * FRONT + Math.random() * 0.22,
          dur: 1.25 + Math.random() * 0.75 + dist / Math.max(W, H) * 0.5,
          swirl: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.2),
          drift: [(Math.random() - 0.5) * cellW * 3, (Math.random() - 0.5) * cellH * 3 - cellH],
          r0: Math.max(cellW, cellH) * (0.4 + Math.random() * 0.45),
        });
      }
    }
    const end = Math.max(...parts.map((p) => p.rel + p.dur));
    const g = dust.getContext('2d');
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const sg = sprite.getContext('2d');
    const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,248,226,1)');
    gr.addColorStop(0.22, 'rgba(255,217,138,.8)');
    gr.addColorStop(0.6, 'rgba(255,178,90,.14)');
    gr.addColorStop(1, 'rgba(255,178,90,0)');
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 64, 64);
    dust.classList.add('on');
    point.style.opacity = '0';
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = () => {
        const t = (performance.now() - t0) / 1000;
        // the photograph: its edges go first, the light eats inward
        const R = Math.max(0, 1.45 * (1 - t / FRONT));
        const m = `radial-gradient(ellipse 50% 50% at 50% 50%, #000 ${Math.max(0, R * 100 - 10).toFixed(1)}%, transparent ${(R * 100).toFixed(1)}%)`;
        fig.style.webkitMaskImage = m;
        fig.style.maskImage = m;
        g.clearRect(0, 0, W, H);
        let arrived = 0;
        // pass 1: fresh dust still wearing the photo's colours
        g.globalCompositeOperation = 'source-over';
        for (const p of parts) {
          const k = (t - p.rel) / p.dur;
          if (k < 0 || k > 0.24) continue;
          const e = k / 0.24;
          g.globalAlpha = 1 - e * 0.35;
          g.fillStyle = p.steps[Math.round(e * 5)];
          const x = p.x0 + p.drift[0] * e * 0.4;
          const y = p.y0 + p.drift[1] * e * 0.4;
          const r = p.r0 * (0.62 - e * 0.32);
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
        // pass 2: golden light gathering toward the centre
        g.globalCompositeOperation = 'lighter';
        for (const p of parts) {
          const k = (t - p.rel) / p.dur;
          if (k < 0.12) continue;
          if (k >= 1) { arrived++; continue; }
          const e = clamp((k - 0.12) / 0.88, 0, 1);
          const ease = e * e * (3 - 2 * e) * 0.35 + e * e * e * 0.65; // slow away, quick in
          const sx = p.x0 + p.drift[0] * 0.4;
          const sy = p.y0 + p.drift[1] * 0.4;
          const dx = cx - sx;
          const dy = cy - sy;
          const sw = Math.sin(Math.PI * ease) * p.swirl;
          const x = sx + dx * ease - dy * sw;
          const y = sy + dy * ease + dx * sw;
          const a = smooth(0.12, 0.3, k) * (1 - smooth(0.82, 1, k)) * 0.62;
          if (a < 0.015) continue;
          const s = (p.r0 * 1.6) * (1 - ease * 0.75) + 1.5;
          g.globalAlpha = a;
          g.drawImage(sprite, x - s, y - s, s * 2, s * 2);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        const f = arrived / parts.length;
        point.style.opacity = String(smooth(0.02, 0.5, f));
        point.style.setProperty('--glow', String(1 + 0.6 * smooth(0.4, 0.95, f) * (1 - smooth(0.95, 1, f) * 0.6)));
        if (t < end + 0.05) raf = requestAnimationFrame(frame);
        else {
          g.clearRect(0, 0, W, H);
          fig.style.visibility = 'hidden';
          point.style.opacity = '1';
          point.style.setProperty('--glow', '1');
          resolve({ x: Math.round(cx), y: Math.round(cy) });
        }
      };
      raf = requestAnimationFrame(frame);
      if (signal) signal.addEventListener('abort', () => cancelAnimationFrame(raf), { once: true });
    });
  }

  return {
    el: root,
    layout,
    show,
    write,
    dissolve,
    get box() { return box; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      tweens.forEach((t) => t && t.kill());
      gsap.killTweensOf([fig, light, hand, point]);
      img.removeAttribute('src');
      root.remove();
    },
  };
}
