// 2D overlay effects: drifting golden dust, confetti, colour-powder clouds,
// sparkles, fireworks, a magic touch trail and screen flashes.

const TAU = Math.PI * 2;
const PALETTE = ['#f4c463', '#ffe3a3', '#f2a7c3', '#ff8fb8', '#b9a3e3', '#8a5cc7', '#fff4e0', '#ffb347'];

function sprite(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

function starSprite(size, color) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const glow = g.createRadialGradient(h, h, 0, h, h, h);
  glow.addColorStop(0, color);
  glow.addColorStop(0.25, color.replace('1)', '.35)'));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.beginPath();
  const r1 = h * 0.95;
  const r2 = h * 0.09;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    g.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function createFX({ dustCanvas, fxCanvas, device, density = 1 }) {
  const dctx = dustCanvas.getContext('2d');
  const fctx = fxCanvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, device.lowPower ? 1.25 : 2);
  let W = 0;
  let H = 0;

  const dustSprite = sprite(64, [
    [0, 'rgba(255,240,200,1)'],
    [0.18, 'rgba(255,214,140,.75)'],
    [0.5, 'rgba(255,190,110,.16)'],
    [1, 'rgba(255,190,110,0)'],
  ]);
  const sparkleSprite = starSprite(64, 'rgba(255,233,170,1)');
  const pinkSparkle = starSprite(64, 'rgba(255,190,220,1)');
  const puffCache = new Map();
  const puff = (hex) => {
    if (!puffCache.has(hex)) {
      const [r, g, b] = hexToRgb(hex);
      puffCache.set(hex, sprite(128, [
        [0, `rgba(${r},${g},${b},.42)`],
        [0.4, `rgba(${r},${g},${b},.2)`],
        [1, `rgba(${r},${g},${b},0)`],
      ]));
    }
    return puffCache.get(hex);
  };
  const emberCache = new Map();
  const ember = (hex) => {
    if (!emberCache.has(hex)) {
      const [r, g, b] = hexToRgb(hex);
      emberCache.set(hex, sprite(32, [
        [0, 'rgba(255,255,255,1)'],
        [0.2, `rgba(${r},${g},${b},1)`],
        [0.55, `rgba(${r},${g},${b},.25)`],
        [1, `rgba(${r},${g},${b},0)`],
      ]));
    }
    return emberCache.get(hex);
  };

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    for (const c of [dustCanvas, fxCanvas]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---------------- dust ---------------- */
  const dust = [];
  const dustState = { density: 0.5, target: 0.5, warm: 1, speed: 1, alpha: 1, targetAlpha: 1 };
  const maxDust = Math.round((device.lowPower ? 55 : device.mobile ? 80 : 140) * Math.max(0.2, Math.min(1.5, density)) * (device.reducedMotion ? 0.5 : 1));
  function spawnDust(anyY = true) {
    const z = Math.random();
    return {
      x: Math.random() * W,
      y: anyY ? Math.random() * H : H + 20,
      z,
      r: 1.5 + z * z * 9,
      vy: -(4 + z * 16),
      sway: 6 + Math.random() * 20,
      phase: Math.random() * TAU,
      tw: 0.6 + Math.random() * 2.2,
      a: 0.25 + z * 0.6,
    };
  }
  for (let i = 0; i < maxDust; i++) dust.push(spawnDust(true));

  /* ---------------- particles ---------------- */
  const confetti = [];
  const puffs = [];
  const sparks = [];
  const embers = [];
  const rockets = [];

  function confettiBurst({ x = W / 2, y = H, angle = -90, spread = 60, count = 90, power = 1, colors = PALETTE } = {}) {
    const n = Math.max(1, Math.round(count * (device.lowPower ? 0.6 : 1) * (device.reducedMotion ? 0.5 : 1)));
    for (let i = 0; i < n; i++) {
      const a = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
      const v = (520 + Math.random() * 680) * power * Math.min(1.3, Math.max(0.7, H / 800));
      const shape = Math.random();
      confetti.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        w: 6 + Math.random() * 7,
        h: 9 + Math.random() * 10,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 12,
        flip: Math.random() * TAU,
        vf: 5 + Math.random() * 9,
        sway: Math.random() * TAU,
        color: colors[(Math.random() * colors.length) | 0],
        shape: shape < 0.62 ? 0 : shape < 0.85 ? 1 : 2,
        life: 0,
        max: 4.5 + Math.random() * 3,
      });
    }
  }

  function cannons() {
    // reduced motion: a light, slow fall instead of two fast cannons across the subtitles
    if (device.reducedMotion) return rain(50);
    confettiBurst({ x: -10, y: H + 10, angle: -62, spread: 34, count: 110, power: 1.08 });
    confettiBurst({ x: W + 10, y: H + 10, angle: -118, spread: 34, count: 110, power: 1.08 });
  }

  function rain(count = 120) {
    for (let i = 0; i < count; i++) {
      confettiBurst({ x: Math.random() * W, y: -20 - Math.random() * 200, angle: 90, spread: 30, count: 1, power: 0.12 });
    }
  }

  function colorBurst({ x = W / 2, y = H / 2, colors = ['#f2a7c3', '#f4c463', '#b9a3e3', '#ff8fb8'], size = 1 } = {}) {
    const n = device.lowPower ? 12 : 18;
    const base = Math.min(W, H) * 0.12 * size;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (80 + Math.random() * 260) * size;
      puffs.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        r: base * (0.4 + Math.random() * 0.6),
        grow: base * (1.4 + Math.random() * 1.6),
        img: puff(colors[i % colors.length]),
        life: 0,
        max: 2.4 + Math.random() * 1.6,
        rot: Math.random() * TAU,
      });
    }
    sparkle(x, y, 18);
  }

  function sparkle(x, y, count = 12, { spread = 60, pink = false } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = Math.random() * spread * 2.2;
      sparks.push({
        x: x + Math.cos(a) * Math.random() * spread * 0.3,
        y: y + Math.sin(a) * Math.random() * spread * 0.3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 20,
        s: 8 + Math.random() * 18,
        life: 0,
        max: 0.6 + Math.random() * 0.9,
        spin: Math.random() * TAU,
        img: pink && Math.random() < 0.5 ? pinkSparkle : sparkleSprite,
      });
    }
  }

  function firework({ x = W * (0.2 + Math.random() * 0.6), y = H * (0.15 + Math.random() * 0.25), color } = {}) {
    const col = color || ['#f4c463', '#ff8fb8', '#b9a3e3', '#ffe3a3', '#ffb347'][(Math.random() * 5) | 0];
    rockets.push({ x: x + (Math.random() - 0.5) * 40, y: H + 10, tx: x, ty: y, t: 0, dur: 0.9 + Math.random() * 0.4, color: col });
  }

  function explode(x, y, color) {
    const n = device.lowPower ? 50 : 90;
    const ring = Math.random() < 0.35;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.1;
      const v = ring ? 230 : 70 + Math.random() * 220;
      embers.push({
        x, y, px: x, py: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 1.4 + Math.random() * 1.0,
        img: ember(Math.random() < 0.18 ? '#fff4e0' : color),
        s: 5 + Math.random() * 5,
      });
    }
    // a soft gold bloom at the heart of the burst (no clip-art star sparkles)
    const bloom = ember('#ffe3a3');
    for (let i = 0; i < 4; i++) {
      embers.push({ x, y, px: x, py: y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0, max: 0.5 + i * 0.12, img: bloom, s: 26 - i * 4 });
    }
  }

  /* ---------------- touch trail ---------------- */
  let trailOn = true;
  let lastTrail = 0;
  let pointerDown = false;
  window.addEventListener('pointerdown', (e) => { pointerDown = true; if (trailOn) sparkle(e.clientX, e.clientY, 6, { spread: 26 }); }, { passive: true });
  window.addEventListener('pointerup', () => (pointerDown = false), { passive: true });
  window.addEventListener('pointercancel', () => (pointerDown = false), { passive: true });
  window.addEventListener('pointermove', (e) => {
    if (!trailOn) return;
    if (e.pointerType !== 'mouse' && !pointerDown) return;
    const now = performance.now();
    if (now - lastTrail < (e.pointerType === 'mouse' ? 45 : 28)) return;
    lastTrail = now;
    sparks.push({
      x: e.clientX + (Math.random() - 0.5) * 6,
      y: e.clientY + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 20,
      vy: 12 + Math.random() * 20,
      s: 6 + Math.random() * 10,
      life: 0,
      max: 0.7 + Math.random() * 0.5,
      spin: Math.random() * TAU,
      img: sparkleSprite,
    });
  }, { passive: true });

  /* ---------------- loop ---------------- */
  let last = performance.now();
  let running = true;
  const t0 = last;

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = (now - t0) / 1000;

    // dust
    dustState.density += (dustState.target - dustState.density) * Math.min(1, dt * 0.8);
    dustState.alpha += (dustState.targetAlpha - dustState.alpha) * Math.min(1, dt * 1.2);
    dctx.clearRect(0, 0, W, H);
    const showN = Math.round(maxDust * dustState.density);
    dctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      p.y += p.vy * dt * dustState.speed;
      p.phase += dt * 0.5;
      if (p.y < -30) Object.assign(p, spawnDust(false));
      if (i >= showN) continue;
      const x = p.x + Math.sin(p.phase + time * 0.3) * p.sway;
      const tw = 0.55 + 0.45 * Math.sin(time * p.tw + p.phase * 3);
      dctx.globalAlpha = p.a * tw * dustState.alpha;
      const s = p.r * 2;
      dctx.drawImage(dustSprite, x - s, p.y - s, s * 2, s * 2);
    }
    dctx.globalAlpha = 1;
    dctx.globalCompositeOperation = 'source-over';

    // fx
    fctx.clearRect(0, 0, W, H);
    const busy = confetti.length || puffs.length || sparks.length || embers.length || rockets.length;
    if (busy) {
      // colour powder (normal blending keeps the colours, never blows out to white)
      fctx.globalCompositeOperation = 'source-over';
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { puffs.splice(i, 1); continue; }
        p.vx *= 1 - dt * 1.8;
        p.vy *= 1 - dt * 1.8;
        p.vy -= 8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const r = p.r + p.grow * (1 - Math.pow(1 - k, 3));
        fctx.globalAlpha = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k) * 0.7;
        fctx.drawImage(p.img, p.x - r, p.y - r, r * 2, r * 2);
      }

      // rockets & embers
      fctx.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.t += dt;
        const k = Math.min(1, r.t / r.dur);
        const e = 1 - Math.pow(1 - k, 2.2);
        const x = r.x + (r.tx - r.x) * e;
        const y = r.y + (r.ty - r.y) * e;
        fctx.globalAlpha = 0.9;
        fctx.drawImage(ember(r.color), x - 7, y - 7, 14, 14);
        if (Math.random() < 0.7) embers.push({ x, y, px: x, py: y, vx: (Math.random() - 0.5) * 20, vy: 30, life: 0, max: 0.5, img: ember('#ffe3a3'), s: 3 });
        if (k >= 1) { rockets.splice(i, 1); explode(x, y, r.color); }
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i];
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { embers.splice(i, 1); continue; }
        p.px = p.x; p.py = p.y;
        p.vx *= 1 - dt * 1.4;
        p.vy = p.vy * (1 - dt * 1.4) + 90 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = (1 - k) * (0.6 + 0.4 * Math.sin(p.life * 30 + i));
        fctx.globalAlpha = a;
        const s = p.s * (1 - k * 0.5);
        fctx.drawImage(p.img, p.x - s, p.y - s, s * 2, s * 2);
      }

      // sparkles
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { sparks.splice(i, 1); continue; }
        p.vx *= 1 - dt * 2;
        p.vy *= 1 - dt * 2;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const s = p.s * Math.sin(k * Math.PI);
        fctx.globalAlpha = Math.sin(k * Math.PI);
        fctx.save();
        fctx.translate(p.x, p.y);
        fctx.rotate(p.spin + k * 1.5);
        fctx.drawImage(p.img, -s, -s, s * 2, s * 2);
        fctx.restore();
      }

      // confetti
      fctx.globalCompositeOperation = 'source-over';
      for (let i = confetti.length - 1; i >= 0; i--) {
        const p = confetti[i];
        p.life += dt;
        if (p.life > p.max || p.y > H + 60) { confetti.splice(i, 1); continue; }
        // paper: strong air drag, gentle gravity, flutters at terminal speed
        p.vx *= 1 - dt * 1.9;
        p.vy = (p.vy + 1050 * dt) * (1 - dt * 1.7);
        if (p.vy > 150) p.vy += (150 - p.vy) * Math.min(1, dt * 6);
        p.sway += dt * 3;
        p.x += (p.vx + Math.sin(p.sway) * 40) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        const sy = Math.cos(p.flip);
        const fade = Math.min(1, (p.max - p.life) * 1.5);
        fctx.globalAlpha = fade;
        fctx.save();
        fctx.translate(p.x, p.y);
        fctx.rotate(p.rot);
        fctx.scale(1, sy);
        fctx.fillStyle = p.color;
        if (p.shape === 0) {
          fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          fctx.fillStyle = `rgba(255,255,255,${0.35 * Math.max(0, sy)})`;
          fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.3);
        } else if (p.shape === 1) {
          fctx.beginPath();
          fctx.arc(0, 0, p.w * 0.55, 0, TAU);
          fctx.fill();
        } else {
          fctx.fillRect(-p.w * 0.18, -p.h, p.w * 0.36, p.h * 2);
        }
        fctx.restore();
      }
      fctx.globalAlpha = 1;
      fctx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  /* ---------------- flash ---------------- */
  const flashEl = document.getElementById('transition');
  function flash({ color = '#ffe3a3', duration = 0.8, peak = 0.9 } = {}) {
    const g = window.gsap;
    flashEl.style.background = `radial-gradient(circle at 50% 50%, #fffaf0 0%, ${color} 40%, ${color}00 100%)`;
    flashEl.style.mixBlendMode = 'screen';
    g.killTweensOf(flashEl);
    g.fromTo(flashEl, { opacity: 0 }, { opacity: peak, duration: duration * 0.25, ease: 'power2.out', yoyo: true, repeat: 1, repeatDelay: duration * 0.1,
      onComplete: () => { flashEl.style.mixBlendMode = ''; flashEl.style.background = ''; g.set(flashEl, { opacity: 0 }); } });
  }

  return {
    confetti: confettiBurst,
    cannons,
    rain,
    colorBurst,
    sparkle,
    firework,
    flash,
    dust(opts = {}) {
      if (opts.density != null) dustState.target = opts.density;
      if (opts.speed != null) dustState.speed = opts.speed;
      if (opts.alpha != null) dustState.targetAlpha = opts.alpha;
    },
    trail(on) { trailOn = on; },
    clear() { confetti.length = puffs.length = sparks.length = embers.length = rockets.length = 0; },
    get size() { return { W, H }; },
  };
}
