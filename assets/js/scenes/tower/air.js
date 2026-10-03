// Sunlight in the air of the tower room (screen space, drawn at half
// resolution because light is soft): a bloom around the window, soft god-rays
// falling into the room, and dust motes that sparkle where the beams catch them.
// Everything is anchored to the window's projected opening each frame, so the
// light turns with the room.

const TAU = Math.PI * 2;

function dotSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,250,235,1)');
  gr.addColorStop(0.25, 'rgba(255,232,180,0.7)');
  gr.addColorStop(0.6, 'rgba(255,214,150,0.12)');
  gr.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return c;
}

/** createAir(canvas, { device }) → { update(dt, win), resize(), destroy() } */
export function createAir(canvas, { device = {} } = {}) {
  const low = device.tier === 'low' || device.lowPower;
  const reduced = !!device.reducedMotion;
  const g = canvas.getContext('2d');
  const res = low ? 0.4 : 0.5;
  let W = 0;
  let H = 0;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * res));
    canvas.height = Math.max(1, Math.round(H * res));
  }
  resize();
  const dot = dotSprite();
  const beams = Array.from({ length: low ? 4 : 6 }, (_, i) => ({
    u: -0.62 + (i / ((low ? 4 : 6) - 1)) * 1.1 + (Math.random() - 0.5) * 0.08,
    w: 0.16 + Math.random() * 0.14,
    a: 0.55 + Math.random() * 0.45,
    ph: Math.random() * TAU,
    sp: 0.15 + Math.random() * 0.25,
  }));
  const motes = Array.from({ length: low ? 16 : reduced ? 22 : 46 }, () => ({
    u: (Math.random() - 0.5) * 2.6,
    v: Math.random() * 2.4 - 0.2,
    s: 0.5 + Math.random() * 1.6,
    ph: Math.random() * TAU,
    vx: (Math.random() - 0.5) * 0.02,
    vy: (Math.random() - 0.5) * 0.02 - 0.006,
  }));
  let time = 0;

  /**
   * win = { vis (0..1), cx, top, bottom, ow (opening width px), warm (0..1), boost (0..1) } in CSS px.
   */
  function update(dt, win) {
    time += dt;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!win || win.vis < 0.01) return;
    g.setTransform(res, 0, 0, res, 0, 0);
    g.globalCompositeOperation = 'lighter';
    const { cx, top, bottom, ow } = win;
    const oh = Math.max(1, bottom - top);
    const warm = win.warm || 0;
    const A = win.vis * (0.85 + 0.5 * (win.boost || 0));
    const col = (a) => `rgba(${255},${Math.round(232 - 40 * warm)},${Math.round(190 - 80 * warm)},${a})`;

    // bloom around the opening
    const bl = g.createRadialGradient(cx, top + oh * 0.45, 0, cx, top + oh * 0.45, Math.max(ow, oh) * 1.05);
    bl.addColorStop(0, col(0.13 * A));
    bl.addColorStop(0.45, col(0.05 * A));
    bl.addColorStop(1, col(0));
    g.fillStyle = bl;
    g.fillRect(0, 0, W, H);

    // god-rays: from the opening, falling toward us and down to the floor (sun upper right)
    const len = H * 1.25;
    for (const b of beams) {
      const shimmer = reduced ? 1 : 0.75 + 0.25 * Math.sin(time * b.sp + b.ph);
      const x0 = cx + b.u * ow * 0.5;
      const y0 = top + oh * 0.28;
      const ang = Math.PI / 2 + 0.32 + b.u * 0.22; // down, leaning left
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      const w0 = ow * b.w * 0.6;
      const w1 = ow * b.w * 3.2;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      for (const [k, a] of [[1.6, 0.25], [1, 0.45], [0.55, 0.6]]) {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        const aa = 0.05 * b.a * shimmer * A * a * (1 + warm * 0.6);
        gr.addColorStop(0, col(0));
        gr.addColorStop(0.08, col(aa));
        gr.addColorStop(0.55, col(aa * 0.55));
        gr.addColorStop(1, col(0));
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x0 + nx * w0 * k, y0 + ny * w0 * k);
        g.lineTo(x1 + nx * w1 * k, y1 + ny * w1 * k);
        g.lineTo(x1 - nx * w1 * k, y1 - ny * w1 * k);
        g.lineTo(x0 - nx * w0 * k, y0 - ny * w0 * k);
        g.closePath();
        g.fill();
      }
    }

    // dust motes drifting in the light
    for (const m of motes) {
      if (!reduced) {
        m.u += (m.vx + Math.sin(time * 0.3 + m.ph) * 0.004) * dt * 6;
        m.v += (m.vy + Math.cos(time * 0.23 + m.ph) * 0.003) * dt * 6;
        if (m.u < -1.4) m.u += 2.8;
        if (m.u > 1.4) m.u -= 2.8;
        if (m.v < -0.3) m.v += 2.6;
        if (m.v > 2.3) m.v -= 2.6;
      }
      const x = cx + m.u * ow * 0.62 + (m.v * ow * -0.25);
      const y = top + m.v * oh * 0.75;
      // brighter inside the beams
      let lit = 0.25;
      for (const b of beams) {
        const bx = cx + b.u * ow * 0.5 + (y - (top + oh * 0.28)) * Math.cos(Math.PI / 2 + 0.32 + b.u * 0.22) / Math.max(0.2, Math.sin(Math.PI / 2 + 0.32 + b.u * 0.22));
        const d = Math.abs(x - bx) / Math.max(10, ow * b.w * (0.6 + 2.6 * Math.max(0, (y - top) / (H * 1.2))));
        lit = Math.max(lit, Math.exp(-d * d * 2));
      }
      const tw = reduced ? 1 : 0.55 + 0.45 * Math.sin(time * 1.7 + m.ph * 3);
      const a = A * lit * tw * 0.8;
      if (a < 0.02) continue;
      const s = m.s * (2.2 + 2.5 * lit) * Math.max(0.7, Math.min(1.6, ow / 220));
      g.globalAlpha = Math.min(1, a);
      g.drawImage(dot, x - s, y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function destroy() {
    canvas.width = canvas.height = 1;
  }
  return { update, resize, destroy };
}
