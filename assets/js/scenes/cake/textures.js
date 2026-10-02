// Procedural (canvas-generated) textures for the cake chapter.
// Nothing here touches the network: every texture is painted at runtime.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, { srgb = true, wrap = false, aniso = 4, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Cut-face sponge: u = r / R (0 = centre, 1 = outer fondant), v = y / H.
// Vanilla-pink sponge, lavender cream, a glossy gold (passion-fruit) jam line.
export function spongeTexture(size = 512, seed = 7) {
  const W = size, H = size;
  const c = cnv(W, H), g = c.getContext('2d');
  const R = rng(seed);
  const Y = (v) => (1 - v) * H; // canvas y for a v coordinate

  const sponge = [[0.94, 0.675], [0.585, 0.355], [0.265, 0.0]];
  const cream = [[0.675, 0.585], [0.355, 0.265]];

  // sponge layers
  for (const [top, bot] of sponge) {
    const y0 = Y(top), y1 = Y(bot);
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#fae6d2');
    gr.addColorStop(0.55, '#f6dac6');
    gr.addColorStop(0.9, '#efc8ad');
    gr.addColorStop(1, '#e2b08c'); // baked bottom
    g.fillStyle = gr;
    g.fillRect(0, y0, W, y1 - y0);
    // crumb: pores + light specks
    const n = Math.round((y1 - y0) * W / 38);
    for (let i = 0; i < n; i++) {
      const x = R() * W, y = y0 + R() * (y1 - y0);
      const r = 0.6 + R() * R() * 3.2;
      g.fillStyle = R() < 0.62 ? `rgba(196,128,104,${0.18 + R() * 0.28})` : `rgba(255,243,232,${0.35 + R() * 0.4})`;
      g.beginPath(); g.ellipse(x, y, r * (0.8 + R() * 0.6), r * (0.6 + R() * 0.5), R() * 3, 0, Math.PI * 2); g.fill();
    }
    // a few pink-strawberry flecks (vanilla-pink sponge)
    for (let i = 0; i < n / 10; i++) {
      const x = R() * W, y = y0 + R() * (y1 - y0);
      g.fillStyle = `rgba(236,140,160,${0.18 + R() * 0.2})`;
      g.beginPath(); g.arc(x, y, 1 + R() * 2.2, 0, Math.PI * 2); g.fill();
    }
  }

  // cream layers with the gold jam ribbon
  for (const [top, bot] of cream) {
    const y0 = Y(top), y1 = Y(bot);
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#cdb2f2');
    gr.addColorStop(0.5, '#ddcaf8');
    gr.addColorStop(1, '#c8abef');
    g.fillStyle = gr;
    // wavy edges so the layer looks spread, not ruled
    g.beginPath();
    g.moveTo(0, y0 + 2);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.03 + top * 20) * 1.6 + (R() - 0.5) * 1.2);
    for (let x = W; x >= 0; x -= 8) g.lineTo(x, y1 + Math.sin(x * 0.025 + bot * 30) * 1.8 + (R() - 0.5) * 1.2);
    g.closePath(); g.fill();
    // cream streaks
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.12 + R() * 0.18})`;
      g.lineWidth = 0.6 + R();
      const y = y0 + R() * (y1 - y0), x = R() * W;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + R() * 60, y + (R() - 0.5) * 2); g.stroke();
    }
    // jam line
    const ym = (y0 + y1) / 2;
    g.lineCap = 'round';
    g.strokeStyle = '#c97f1e'; g.lineWidth = 11;
    g.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = ym + Math.sin(x * 0.045 + top * 9) * 1.6; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = '#f0b443'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = 'rgba(255,236,170,0.9)'; g.lineWidth = 1.8;
    g.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = ym - 1.4 + Math.sin(x * 0.045 + top * 9) * 1.6; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }

  // buttercream under the fondant (top + outer edge) then the fondant skin
  const bc = '#f1e6f7';
  g.fillStyle = bc; g.fillRect(0, Y(0.972), W, Y(0.94) - Y(0.972));
  g.fillRect(W * 0.948, 0, W * 0.03, H);
  g.fillStyle = '#c5afe9';
  g.fillRect(0, 0, W, Y(0.972));
  g.fillRect(W * 0.976, 0, W * 0.024, H);
  // soft inner shading toward the centre (reads as depth)
  const sh = g.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, 'rgba(120,60,60,0.10)');
  sh.addColorStop(0.5, 'rgba(120,60,60,0.0)');
  g.fillStyle = sh; g.fillRect(0, Y(0.94), W * 0.948, H);
  return toTex(c);
}

// ---------------------------------------------------------------------------
// Rapunzel-tower style painted flowers on lavender fondant (bottom tier side).
// u wraps around the tier once, v = height on the side (0 bottom, 1 top).
function petalFlower(g, x, y, r, col, rot, R) {
  const petals = 5;
  for (let k = 0; k < petals; k++) {
    const a = rot + (k / petals) * Math.PI * 2;
    const px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.55;
    const gr = g.createRadialGradient(x, y, r * 0.1, px, py, r * 0.75);
    gr.addColorStop(0, col.light);
    gr.addColorStop(1, col.base);
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(px, py, r * 0.58, r * 0.4, a, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = col.edge; g.lineWidth = Math.max(0.8, r * 0.07);
    g.stroke();
    // little painted vein
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(0.6, r * 0.05);
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25); g.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); g.stroke();
  }
  g.fillStyle = '#e9b949';
  g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,248,220,0.9)';
  g.beginPath(); g.arc(x - r * 0.06, y - r * 0.07, r * 0.08, 0, Math.PI * 2); g.fill();
  // dotted centre stamens
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2;
    g.fillStyle = 'rgba(160,100,40,0.6)';
    g.beginPath(); g.arc(x + Math.cos(a) * r * 0.14, y + Math.sin(a) * r * 0.14, Math.max(0.5, r * 0.03), 0, Math.PI * 2); g.fill();
  }
}

function leaf(g, x, y, len, ang, col = 'rgba(126,156,112,0.85)') {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = col;
  g.beginPath(); g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
  g.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(230,240,210,0.5)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(len * 0.1, 0); g.lineTo(len * 0.85, 0); g.stroke();
  g.restore();
}

const FLOWER_COLS = [
  { base: '#ef9dbd', light: '#fbd5e3', edge: 'rgba(184,82,124,0.55)' },  // pink
  { base: '#efc15a', light: '#fbe7a8', edge: 'rgba(170,118,30,0.55)' },  // gold
  { base: '#9cbfee', light: '#dbe8fb', edge: 'rgba(70,104,170,0.5)' },   // soft blue
];

function fondantBase(g, W, H, top, bot, R) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // very gentle mottling — fondant is never perfectly uniform
  for (let i = 0; i < 260; i++) {
    const x = R() * W, y = R() * H, r = 10 + R() * 40;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.025 + R() * 0.03;
    rg.addColorStop(0, R() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(90,60,140,${a})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function paintedSideTexture({ W: CW = 2048, H: CH = 256, repeats = 12, seed = 3 } = {}) {
  // paint in a fixed 2048×256 logical space so low-res canvases keep the same motif scale
  const W = 2048, H = 256;
  const c = cnv(CW, CH), g = c.getContext('2d');
  g.scale(CW / W, CH / H);
  const R = rng(seed);
  fondantBase(g, W, H, '#d2bdf7', '#bea6ee', R);
  const Y = (v) => (1 - v) * H;
  const period = W / repeats;
  const vMid = 0.36, amp = 0.075;

  const drawRepeat = (ox) => {
    // the vine: a soft painted gold scroll
    g.strokeStyle = 'rgba(204,160,72,0.85)';
    g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const x = ox + (i / 40) * period;
      const y = Y(vMid + Math.sin((i / 40) * Math.PI * 2) * amp);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    // curls
    for (const f of [0.18, 0.68]) {
      const x = ox + f * period, y = Y(vMid + Math.sin(f * Math.PI * 2) * amp);
      const dir = f < 0.5 ? -1 : 1;
      g.strokeStyle = 'rgba(204,160,72,0.7)'; g.lineWidth = 1.4;
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = k / 24 * Math.PI * 1.6, rr = 9 * (1 - k / 30);
        const px = x + Math.cos(a) * rr * dir, py = y + dir * 6 + Math.sin(a) * rr * dir;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.stroke();
    }
    // leaves along the vine
    for (const f of [0.08, 0.36, 0.58, 0.86]) {
      const x = ox + f * period, y = Y(vMid + Math.sin(f * Math.PI * 2) * amp);
      leaf(g, x, y, 13 + R() * 5, -0.9 + (R() - 0.5) * 0.6);
      leaf(g, x, y, 11 + R() * 4, 2.3 + (R() - 0.5) * 0.6);
    }
    // flowers at crest & trough + a bud
    const f1 = ox + 0.25 * period, f2 = ox + 0.75 * period;
    const ci = (k) => FLOWER_COLS[(((Math.round(ox / period) + k) % 3) + 3) % 3];
    petalFlower(g, f1, Y(vMid + amp), 17, ci(0), R() * 6, R);
    petalFlower(g, f2, Y(vMid - amp), 15, ci(1), R() * 6, R);
    petalFlower(g, ox + 0.47 * period, Y(vMid + 0.02), 8, ci(2), R() * 6, R);
    // tiny painted dots (three-dot clusters)
    for (const [f, dv] of [[0.04, -0.14], [0.52, 0.16], [0.95, -0.1]]) {
      const x = ox + f * period, y = Y(vMid + dv);
      g.fillStyle = 'rgba(255,248,236,0.85)';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + Math.cos(k * 2.1) * 3.4, y + Math.sin(k * 2.1) * 3.4, 1.5, 0, Math.PI * 2); g.fill(); }
    }
  };
  for (let i = -1; i <= repeats; i++) drawRepeat(i * period);
  // fine gold pinstripe above the band
  g.strokeStyle = 'rgba(214,170,80,0.55)'; g.lineWidth = 1.2;
  for (const v of [0.13, 0.6]) { g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(W, Y(v)); g.stroke(); }
  g.fillStyle = 'rgba(232,196,110,0.75)';
  for (let x = period / 8; x < W; x += period / 4) {
    g.beginPath(); g.arc(x, Y(0.6), 1.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + period / 8, Y(0.13), 1.6, 0, Math.PI * 2); g.fill();
  }
  const t = toTex(c, { wrap: true, aniso: 8 });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Top tier: plain fondant + edible gold-leaf flecks. Returns {map, mr} where
// `mr` drives roughness (G) & metalness (B) so the flecks really glint.
export function goldLeafSideTextures({ W: CW = 1536, H: CH = 256, seed = 11 } = {}) {
  const W = 1536, H = 256;
  const c = cnv(CW, CH), g = c.getContext('2d');
  const m = cnv(CW, CH), gm = m.getContext('2d');
  g.scale(CW / W, CH / H); gm.scale(CW / W, CH / H);
  const R = rng(seed);
  fondantBase(g, W, H, '#d6c2f8', '#c3abef', R);
  gm.fillStyle = 'rgb(0,150,0)'; gm.fillRect(0, 0, W, H);
  const fleck = (cx, cy, s) => {
    const pts = [];
    const n = 6 + Math.floor(R() * 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R() * 0.5;
      const rr = s * (0.45 + R() * 0.75);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (0.7 + R() * 0.5)]);
    }
    for (const [gg, col] of [[g, null], [gm, 'rgb(0,60,255)']]) {
      gg.beginPath();
      pts.forEach(([x, y], i) => (i ? gg.lineTo(x, y) : gg.moveTo(x, y)));
      gg.closePath();
      if (col) gg.fillStyle = col;
      else {
        const gr = gg.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
        gr.addColorStop(0, '#f6d78a'); gr.addColorStop(0.5, '#e2b154'); gr.addColorStop(1, '#f9e3a6');
        gg.fillStyle = gr;
      }
      gg.fill();
    }
  };
  // flecks cluster near the top (where the drip meets) and thin out downward
  for (let i = 0; i < 150; i++) {
    const v = Math.pow(R(), 0.8) * 0.8 + 0.08;
    const x = R() * W, y = (1 - v) * H;
    const s = 1.2 + R() * R() * 5.5;
    fleck(x, y, s);
    if (x < 12) fleck(x + W, y, s);
    if (x > W - 12) fleck(x - W, y, s);
  }
  const map = toTex(c, { wrap: true, aniso: 8 });
  const mr = toTex(m, { srgb: false, wrap: true, aniso: 8 });
  map.wrapT = mr.wrapT = THREE.ClampToEdgeWrapping;
  return { map, mr };
}

// Spiral-striped candle wax: cream + rose-pink + a gold pinstripe.
export function candleTexture() {
  const W = 64, H = 256;
  const c = cnv(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const turns = 3.2;
  const cream = [252, 243, 229], rose = [236, 150, 178], gold = [232, 190, 98];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let p = (x / W + (y / H) * turns) % 1;
      if (p < 0) p += 1;
      let col = cream;
      const soft = (a, b, w = 0.02) => Math.min(1, Math.max(0, (p - a) / w)) * Math.min(1, Math.max(0, (b - p) / w));
      const kr = soft(0.08, 0.46), kg = soft(0.6, 0.67, 0.012);
      col = [0, 1, 2].map((i) => cream[i] * (1 - kr - kg) + rose[i] * kr + gold[i] * kg);
      const i4 = (y * W + x) * 4;
      img.data[i4] = col[0]; img.data[i4 + 1] = col[1]; img.data[i4 + 2] = col[2]; img.data[i4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTex(c, { wrap: true });
}

// Emissive gradient for the candle wax glow (bright at the top, like a lit candle).
export function candleGlowTexture() {
  const c = cnv(4, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#ffcf93');
  gr.addColorStop(0.18, '#a5603a');
  gr.addColorStop(0.5, '#1e0d08');
  gr.addColorStop(1, '#000000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return toTex(c);
}

// The round white-chocolate plaque at the heart of the sun topper.
export function plaqueTexture({ name = 'Deepu', line1 = 'Happy 20th', size = 1024, script = '"Great Vibes"', serif = '"Cormorant Garamond"' } = {}) {
  const S = size, c = cnv(S, S), g = c.getContext('2d');
  const cx = S / 2, cy = S / 2, R = S / 2;
  const base = g.createRadialGradient(cx - S * 0.12, cy - S * 0.16, S * 0.05, cx, cy, R);
  base.addColorStop(0, '#fffaf0');
  base.addColorStop(0.7, '#f7ecd8');
  base.addColorStop(1, '#e9d6b5');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  // subtle chocolate "tempered" streaks
  const Rr = rng(5);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.06 + Rr() * 0.08})`;
    g.lineWidth = 6 + Rr() * 18;
    const y = Rr() * S;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + (Rr() - 0.5) * 80, S * 0.6, y + (Rr() - 0.5) * 80, S, y + (Rr() - 0.5) * 40); g.stroke();
  }
  // piped pearl border (gold-dusted)
  const ringR = R * 0.86, n = 54;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * ringR, y = cy + Math.sin(a) * ringR;
    const gr = g.createRadialGradient(x - 4, y - 5, 1, x, y, 15);
    gr.addColorStop(0, '#fff2c4'); gr.addColorStop(0.45, '#e6b85a'); gr.addColorStop(1, '#a8772a');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(205,160,80,0.65)'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, R * 0.78, 0, Math.PI * 2); g.stroke();

  // writing
  const gold = (y0, y1) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#c99a3c'); gr.addColorStop(0.5, '#a6741f'); gr.addColorStop(1, '#c79a41');
    return gr;
  };
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  // line 1
  g.font = `${Math.round(S * 0.118)}px ${script}, ${serif}, cursive`;
  g.fillStyle = gold(cy - S * 0.24, cy - S * 0.1);
  g.shadowColor = 'rgba(90,50,10,0.25)'; g.shadowBlur = 3; g.shadowOffsetY = 2;
  g.fillText(line1, cx, cy - S * 0.105);
  // the name — rose-plum ganache, larger
  let fs = S * 0.235;
  g.font = `${Math.round(fs)}px ${script}, ${serif}, cursive`;
  while (g.measureText(name).width > S * 0.66 && fs > 40) { fs -= 6; g.font = `${Math.round(fs)}px ${script}, ${serif}, cursive`; }
  const ny = cy + S * 0.13;
  const pg = g.createLinearGradient(0, ny - fs * 0.8, 0, ny + fs * 0.1);
  pg.addColorStop(0, '#b44f80'); pg.addColorStop(1, '#7d2b58');
  g.fillStyle = pg;
  g.shadowColor = 'rgba(80,20,50,0.35)'; g.shadowBlur = 4; g.shadowOffsetY = 3;
  g.fillText(name, cx, ny);
  g.shadowColor = 'transparent';
  // a tiny heart flourish under the name
  g.fillStyle = '#c4537f';
  const hx = cx, hy = ny + S * 0.075, hs = S * 0.022;
  g.beginPath();
  g.moveTo(hx, hy + hs * 0.9);
  g.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.2, hx - hs * 0.6, hy - hs * 1.3, hx, hy - hs * 0.4);
  g.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.3, hx + hs * 1.6, hy - hs * 0.2, hx, hy + hs * 0.9);
  g.fill();
  g.strokeStyle = 'rgba(190,140,60,0.7)'; g.lineWidth = 2.2;
  for (const d of [-1, 1]) {
    g.beginPath(); g.moveTo(hx + d * hs * 1.8, hy); g.quadraticCurveTo(hx + d * hs * 5, hy - hs * 1.2, hx + d * hs * 8, hy + hs * 0.2); g.stroke();
  }
  return toTex(c, { aniso: 8 });
}

// Dark walnut table top with grain (planar uv on a disc).
export function woodTexture(size = 1024, seed = 21) {
  const S = size, c = cnv(S, S), g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = '#2a160f'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const y0 = R() * S, amp = 4 + R() * 18, f = 0.002 + R() * 0.006, ph = R() * 6;
    g.strokeStyle = R() < 0.5 ? `rgba(70,38,22,${0.25 + R() * 0.35})` : `rgba(18,8,5,${0.3 + R() * 0.4})`;
    g.lineWidth = 1 + R() * 6;
    g.beginPath();
    for (let x = -10; x <= S + 10; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.25;
      x === -10 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(10,4,2,${0.15 + R() * 0.25})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 10, 1);
  }
  return toTex(c, { aniso: 8 });
}

// Soft radial falloff used for contact shadows, glows, sparks.
export function radialTexture({ size = 128, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)', outer = 'rgba(255,255,255,0)', midStop = 0.35 } = {}) {
  const c = cnv(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(midStop, mid); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return toTex(c, { srgb: false, mips: true });
}

// A four-point star glint (for the plaque/sun catching the last light).
export function starTexture(size = 128) {
  const c = cnv(size, size), g = c.getContext('2d');
  const h = size / 2;
  const gl = g.createRadialGradient(h, h, 0, h, h, h);
  gl.addColorStop(0, 'rgba(255,255,255,1)');
  gl.addColorStop(0.12, 'rgba(255,240,200,0.6)');
  gl.addColorStop(0.4, 'rgba(255,210,140,0.08)');
  gl.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gl; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (const [a, len, w] of [[0, 1, 2.2], [Math.PI / 2, 1, 2.2], [Math.PI / 4, 0.5, 1.2], [-Math.PI / 4, 0.5, 1.2]]) {
    g.save(); g.translate(h, h); g.rotate(a);
    const gr = g.createLinearGradient(-h * len, 0, h * len, 0);
    gr.addColorStop(0, 'rgba(255,230,170,0)'); gr.addColorStop(0.5, 'rgba(255,250,235,0.95)'); gr.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-h * len, 0); g.lineTo(0, -w); g.lineTo(h * len, 0); g.lineTo(0, w); g.closePath(); g.fill();
    g.restore();
  }
  return toTex(c, { srgb: false });
}

// Wispy smoke puff (white, alpha in the alpha channel).
export function smokeTexture(size = 128, seed = 33) {
  const c = cnv(size, size), g = c.getContext('2d');
  const R = rng(seed);
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, d = R() * size * 0.18;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const r = size * (0.12 + R() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.1 + R() * 0.12})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  return toTex(c, { srgb: false });
}

// Gradient used by the environment sky dome (vertical, equirect-ish v).
export function envGradientTexture() {
  const c = cnv(4, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#0d1230');
  gr.addColorStop(0.42, '#232a62');
  gr.addColorStop(0.52, '#3a2c4a');
  gr.addColorStop(0.6, '#161020');
  gr.addColorStop(1, '#070508');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return toTex(c);
}
