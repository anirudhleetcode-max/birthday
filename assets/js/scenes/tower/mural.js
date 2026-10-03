// The tower's painted walls — every bay of the round room is painted
// procedurally on a canvas (original artwork): warm plaster washed in
// watercolour, a timber beam and posts, a painted frieze of vines, little suns
// and flowers, sandstone wainscot, ivy, and per-bay murals (suns, lanterns,
// a flowering tree), a bookshelf with jars of flowers and candles, the arched
// window's stone surround (its opening is cut out so the world outside shows
// through), and the patch of sunlight the window throws on the far wall.
//
// Coordinates: one bay canvas spans one bay (posts at both edges). `fx` is the
// horizontal position in bay widths from the bay centre (−.5 … .5); `f` is the
// vertical position in viewport heights from eye level, as it appears on the
// wall straight ahead (− up). Everything that repeats around the room is
// parameterised by the global arc coordinate so the bays join seamlessly.

const TAU = Math.PI * 2;

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const C = {
  leaf: '#7f9c6c', leafDk: '#5d7a52', leafLt: '#a9c08c', stem: '#6f8a5c',
  rose: '#e59db2', roseDk: '#c47890', blush: '#f2c2cc', lav: '#b39bd8', violet: '#8a64b6', cream: '#fbf1dc',
  gold: '#e2a94f', goldDk: '#bf8433', goldLt: '#f5d283', sky: '#9fb5d8',
  wood: '#7a4b30', woodLt: '#a8744b', woodDk: '#4c2c1c',
};

/** A tile of fine plaster grain (shared by every bay). */
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const r = rng(99);
  for (let i = 0; i < 1500; i++) {
    const v = r();
    g.fillStyle = v < 0.4 ? `rgba(140,90,55,${0.02 + r() * 0.04})` : `rgba(255,250,235,${0.05 + r() * 0.09})`;
    const s = 0.6 + r() * 1.6;
    g.fillRect(r() * 160, r() * 160, s, s);
  }
  grainTile = c;
  return c;
}

/* ------------------------------------------------------------ primitives */
function blob(g, x, y, rad, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, col);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = a;
  g.fillStyle = gr;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  g.globalAlpha = 1;
}

function leaf(g, x, y, len, ang, col, edge = C.leafDk) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -len * 0.42, len, 0);
  g.quadraticCurveTo(len * 0.45, len * 0.42, 0, 0);
  g.fillStyle = col;
  g.globalAlpha = 0.92;
  g.fill();
  g.globalAlpha = 0.35;
  g.strokeStyle = edge;
  g.lineWidth = Math.max(0.6, len * 0.05);
  g.stroke();
  g.beginPath();
  g.moveTo(len * 0.08, 0);
  g.lineTo(len * 0.8, 0);
  g.globalAlpha = 0.3;
  g.stroke();
  g.restore();
  g.globalAlpha = 1;
}

function flower(g, x, y, r, col, { petals = 5, center = C.goldLt, rot = 0, dk } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  for (let i = 0; i < petals; i++) {
    g.rotate(TAU / petals);
    g.beginPath();
    g.ellipse(0, -r * 0.55, r * 0.36, r * 0.58, 0, 0, TAU);
    g.globalAlpha = 0.9;
    g.fillStyle = col;
    g.fill();
    g.globalAlpha = 0.28;
    g.strokeStyle = dk || 'rgba(120,60,80,1)';
    g.lineWidth = Math.max(0.5, r * 0.06);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(0, 0, r * 0.26, 0, TAU);
  g.fillStyle = center;
  g.fill();
  g.restore();
}

function star4(g, x, y, r, col, a = 0.8) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = a;
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.26 : r;
    const an = (i / 8) * TAU - Math.PI / 2;
    g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
  g.globalAlpha = 1;
}

function star5(g, x, y, r, col, a = 0.85, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = a;
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const an = (i / 10) * TAU - Math.PI / 2;
    g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  g.closePath();
  g.fill();
  g.globalAlpha = a * 0.4;
  g.strokeStyle = C.goldDk;
  g.lineWidth = Math.max(0.6, r * 0.08);
  g.stroke();
  g.restore();
  g.globalAlpha = 1;
}

/** The kingdom's sun, painted by hand: 8 long rays, 8 flame rays, a ringed disc. */
function paintedSun(g, x, y, r, { a = 1, rot = 0 } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = a;
  const k = r / 100;
  for (let i = 0; i < 16; i++) {
    g.save();
    g.rotate((i / 16) * TAU);
    g.beginPath();
    if (i % 2 === 0) {
      g.moveTo(46 * k, -7.5 * k);
      g.lineTo(97 * k, 0);
      g.lineTo(46 * k, 7.5 * k);
    } else {
      g.moveTo(46 * k, -5 * k);
      g.bezierCurveTo(56 * k, -11 * k, 61 * k, 4 * k, 69 * k, 1 * k);
      g.bezierCurveTo(75 * k, -1 * k, 79 * k, -3 * k, 86 * k, 0);
      g.bezierCurveTo(79 * k, 4 * k, 74 * k, 7 * k, 67 * k, 7 * k);
      g.bezierCurveTo(58 * k, 8 * k, 55 * k, -2 * k, 46 * k, 5 * k);
    }
    g.closePath();
    g.fillStyle = i % 2 ? C.goldLt : C.gold;
    g.fill();
    g.globalAlpha = a * 0.45;
    g.strokeStyle = C.goldDk;
    g.lineWidth = Math.max(0.7, 1.6 * k);
    g.stroke();
    g.globalAlpha = a;
    g.restore();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 42 * k);
  gr.addColorStop(0, '#fff3cf');
  gr.addColorStop(0.5, C.goldLt);
  gr.addColorStop(1, C.gold);
  g.beginPath();
  g.arc(0, 0, 40 * k, 0, TAU);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = Math.max(1, 3 * k);
  g.strokeStyle = C.goldDk;
  g.globalAlpha = a * 0.6;
  g.stroke();
  g.setLineDash([2 * k, 3.4 * k]);
  g.beginPath();
  g.arc(0, 0, 30 * k, 0, TAU);
  g.lineWidth = Math.max(0.6, 1.4 * k);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = a;
  g.beginPath();
  g.arc(0, 0, 11 * k, 0, TAU);
  g.fillStyle = '#fff6dc';
  g.fill();
  g.restore();
  g.globalAlpha = 1;
}

function paintedLantern(g, x, y, h, { a = 1, glow = true } = {}) {
  const w = h * 0.72;
  g.save();
  g.translate(x, y);
  if (glow) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, h * 1.5);
    gr.addColorStop(0, 'rgba(255,200,110,0.55)');
    gr.addColorStop(1, 'rgba(255,190,110,0)');
    g.globalAlpha = a * 0.7;
    g.fillStyle = gr;
    g.fillRect(-h * 1.5, -h * 1.5, h * 3, h * 3);
  }
  g.globalAlpha = a;
  g.beginPath();
  g.moveTo(-w * 0.36, -h * 0.5);
  g.lineTo(w * 0.36, -h * 0.5);
  g.quadraticCurveTo(w * 0.56, 0, w * 0.4, h * 0.42);
  g.lineTo(-w * 0.4, h * 0.42);
  g.quadraticCurveTo(-w * 0.56, 0, -w * 0.36, -h * 0.5);
  g.closePath();
  const body = g.createLinearGradient(0, -h * 0.5, 0, h * 0.42);
  body.addColorStop(0, '#f7b65c');
  body.addColorStop(0.55, '#ffd890');
  body.addColorStop(1, '#f39a4c');
  g.fillStyle = body;
  g.fill();
  g.globalAlpha = a * 0.5;
  g.strokeStyle = '#b86a2c';
  g.lineWidth = Math.max(0.6, h * 0.03);
  g.stroke();
  // ribs
  g.beginPath();
  g.moveTo(0, -h * 0.5);
  g.lineTo(0, h * 0.42);
  g.moveTo(-w * 0.18, -h * 0.5);
  g.quadraticCurveTo(-w * 0.26, 0, -w * 0.2, h * 0.42);
  g.moveTo(w * 0.18, -h * 0.5);
  g.quadraticCurveTo(w * 0.26, 0, w * 0.2, h * 0.42);
  g.globalAlpha = a * 0.25;
  g.stroke();
  g.globalAlpha = a;
  g.fillStyle = '#a65a2a';
  g.fillRect(-w * 0.3, h * 0.42, w * 0.6, h * 0.06);
  g.restore();
  g.globalAlpha = 1;
}

function swirl(g, x, y, r, col, a = 0.5, dir = 1) {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  g.globalAlpha = a;
  g.strokeStyle = col;
  g.lineWidth = Math.max(0.8, r * 0.14);
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const an = t * TAU * 1.35;
    const rr = r * (1 - t * 0.78);
    i ? g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  g.stroke();
  g.restore();
  g.globalAlpha = 1;
}

/** A climbing vine: a wavy stem with leaves and a few flowers. */
function vine(g, r, x0, y0, x1, y1, scale, { flowers = 3, cols = [C.rose, C.lav, C.cream], amp = 0.08, wave = 2.2, leafEvery = 0.07 } = {}) {
  const pts = [];
  const n = 60;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  const nx = -dy / L;
  const ny = dx / L;
  const ph = r() * TAU;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = Math.sin(ph + t * wave * TAU) * amp * L * (0.4 + 0.6 * t);
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  g.strokeStyle = C.stem;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = 0.85;
  g.lineWidth = 2.2 * scale;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.globalAlpha = 1;
  const step = Math.max(2, Math.round(n * leafEvery));
  for (let i = 3; i < n; i += step) {
    const [x, y] = pts[i];
    const [xb, yb] = pts[Math.min(n, i + 1)];
    const ang = Math.atan2(yb - y, xb - x);
    const side = (i / step) % 2 ? 1 : -1;
    const lc = r() < 0.3 ? C.leafLt : r() < 0.5 ? C.leafDk : C.leaf;
    leaf(g, x, y, (9 + r() * 7) * scale, ang + side * (0.9 + r() * 0.4), lc);
  }
  for (let k = 0; k < flowers; k++) {
    const i = Math.round(n * (0.25 + (0.72 * (k + r() * 0.5)) / Math.max(1, flowers)));
    const [x, y] = pts[Math.min(n, i)];
    flower(g, x, y, (6.5 + r() * 4) * scale, cols[(k + (r() * 3) | 0) % cols.length], { rot: r() * TAU, petals: r() < 0.3 ? 6 : 5 });
  }
  return pts;
}

function woodRect(g, r, x, y, w, h, { vertical = false, base = C.wood, lt = C.woodLt, dk = C.woodDk, scale = 1 } = {}) {
  const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, lt);
  gr.addColorStop(0.18, base);
  gr.addColorStop(0.8, base);
  gr.addColorStop(1, dk);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  // grain
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.lineWidth = Math.max(0.6, 0.9 * scale);
  const lines = Math.max(4, Math.round((vertical ? w : h) / (5 * scale)));
  for (let i = 0; i < lines; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(40,20,10,0.22)' : 'rgba(200,150,100,0.16)';
    g.beginPath();
    const ph = r() * TAU;
    const f = 0.004 + r() * 0.01;
    const amp = (1 + r() * 2.5) * scale;
    if (vertical) {
      const cx = x + ((i + r() * 0.6) / lines) * w;
      for (let yy = y; yy <= y + h; yy += 8 * scale) g.lineTo(cx + Math.sin(ph + yy * f / scale) * amp, yy);
    } else {
      const cy = y + ((i + r() * 0.6) / lines) * h;
      for (let xx = x; xx <= x + w; xx += 8 * scale) g.lineTo(xx, cy + Math.sin(ph + xx * f / scale) * amp);
    }
    g.stroke();
  }
  // a knot or two
  for (let i = 0; i < 2; i++) {
    if (r() < 0.5) continue;
    const kx = x + r() * w;
    const ky = y + r() * h;
    g.strokeStyle = 'rgba(40,20,10,0.25)';
    g.beginPath();
    g.ellipse(kx, ky, (vertical ? 2.5 : 7) * scale, (vertical ? 7 : 2.5) * scale, 0, 0, TAU);
    g.stroke();
  }
  g.restore();
}

/* ---------------------------------------------------------------- the bay */
/**
 * Paint one bay. o = { j, kind: 'window'|'photo'|'decor', variant (0..2 for an empty photo bay → big mural),
 * bayW, H, ts, vh, s, nb (bays), occupied: [{fx, f, w, h}] (painting rects, in fx/f units), low, opening }
 */
export function paintBay(g, o) {
  const { j, bayW, H, ts, vh, s, nb } = o;
  const W = Math.round(bayW * ts);
  const HT = Math.round(H * ts);
  const r = rng(1013 * (j + 1) + 7);
  const u0 = j * bayW; // global arc coordinate of the bay's left edge (world)
  const sc = ts * (vh / s) / 1500; // a pleasant unit that grows with the wall
  const X = (fx) => (0.5 + fx) * W;
  const Y = (f) => (H / 2 + (f * vh) / s) * ts;
  const UX = (u) => (u - u0) * ts; // global arc → canvas x
  const circ = nb * bayW;

  /* --- plaster base --- */
  const base = g.createLinearGradient(0, 0, 0, HT);
  base.addColorStop(0, '#efd0ad');
  base.addColorStop(0.35, '#f8e1c2');
  base.addColorStop(0.62, '#f6d9b6');
  base.addColorStop(1, '#e9c39c');
  g.fillStyle = base;
  g.fillRect(0, 0, W, HT);
  const washes = ['#fbe9cf', '#f2c39e', '#f6cdb4', '#efcf9f', '#fdf0d8', '#f3c2b4', '#f7d9a8'];
  const nWash = o.low ? 16 : 34;
  for (let i = 0; i < nWash; i++) {
    blob(g, r() * W, Y(-0.4) + r() * (Y(0.3) - Y(-0.4)), (0.12 + r() * 0.3) * W, washes[(r() * washes.length) | 0], 0.18 + r() * 0.22);
  }
  // lavender breath in the plaster (violet accent, very faint)
  blob(g, r() * W, Y(-0.15 + r() * 0.2), W * 0.35, 'rgba(185,160,220,1)', 0.08);
  g.fillStyle = g.createPattern(grain(), 'repeat');
  g.fillRect(0, 0, W, HT);
  // hairline cracks
  g.strokeStyle = 'rgba(120,80,55,0.13)';
  g.lineWidth = Math.max(0.6, sc * 0.9);
  for (let i = 0; i < 2; i++) {
    if (r() < 0.4) continue;
    let x = r() * W;
    let y = Y(-0.3 + r() * 0.5);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 18 * sc;
      y += (6 + r() * 12) * sc;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  /* --- murals (behind everything architectural) --- */
  const occ = o.occupied || [];
  const free = (fx, f, pad = 0.03) => !occ.some((q) => Math.abs(fx - q.fx) < q.w / 2 + pad && Math.abs(f - q.f) < q.h / 2 + pad * (vh / bayW));
  if (o.kind === 'photo') paintPhotoBayMural(g, r, o, { X, Y, W, sc, free });
  if (o.kind === 'decor') paintDecorMural(g, r, o, { X, Y, W, sc });

  /* --- sunlight from the window on the far wall --- */
  if (o.sunPatch) paintSunPatch(g, o, { X, Y, sc });

  /* --- wainscot (sandstone) --- */
  const wTop = Y(0.285);
  const rowH = (0.072 * vh * ts) / s;
  for (let row = 0; wTop + row * rowH < HT; row++) {
    const ry = wTop + row * rowH;
    const rr = rng(4001 + row * 31);
    // lay blocks along the whole circumference so neighbouring bays agree
    let u = -rr() * bayW * 0.2;
    while (u < circ) {
      const bw = bayW * (0.14 + rr() * 0.12);
      const tone = rr();
      if (u + bw > u0 - 2 && u < u0 + bayW + 2) {
        const x = UX(u);
        const w = bw * ts;
        const cols = tone < 0.33 ? ['#d6bc9b', '#c3a383'] : tone < 0.66 ? ['#cdb08e', '#b89878'] : ['#dcc4a5', '#c8aa8a'];
        const gr = g.createLinearGradient(0, ry, 0, ry + rowH);
        gr.addColorStop(0, cols[0]);
        gr.addColorStop(1, cols[1]);
        g.fillStyle = gr;
        const m = 1.6 * sc;
        g.beginPath();
        g.roundRect ? g.roundRect(x + m, ry + m, w - m * 2, rowH - m * 2, 3 * sc) : g.rect(x + m, ry + m, w - m * 2, rowH - m * 2);
        g.fill();
        g.strokeStyle = 'rgba(255,240,215,0.35)';
        g.lineWidth = Math.max(0.6, sc);
        g.beginPath();
        g.moveTo(x + m * 2, ry + rowH - m * 2);
        g.lineTo(x + m * 2, ry + m * 2);
        g.lineTo(x + w - m * 2, ry + m * 2);
        g.stroke();
        g.strokeStyle = 'rgba(90,60,40,0.25)';
        g.beginPath();
        g.moveTo(x + w - m * 2, ry + m * 2);
        g.lineTo(x + w - m * 2, ry + rowH - m * 2);
        g.lineTo(x + m * 2, ry + rowH - m * 2);
        g.stroke();
        // pitting
        const pr = rng(Math.floor(u * 13) + row);
        for (let k = 0; k < 10; k++) {
          g.fillStyle = pr() < 0.5 ? 'rgba(110,80,55,0.18)' : 'rgba(255,245,225,0.22)';
          g.fillRect(x + pr() * w, ry + pr() * rowH, 1.4 * sc, 1.4 * sc);
        }
      }
      u += bw;
    }
  }
  g.fillStyle = 'rgba(220,200,170,0.5)'; // mortar shows between blocks (base under it)
  g.globalCompositeOperation = 'destination-over';
  g.fillRect(0, wTop, W, HT - wTop);
  g.globalCompositeOperation = 'source-over';
  // chair rail
  woodRect(g, r, 0, Y(0.262), W, Y(0.29) - Y(0.262), { scale: sc, base: '#865436', lt: '#b98656', dk: '#57331f' });
  const railSh = g.createLinearGradient(0, Y(0.29), 0, Y(0.33));
  railSh.addColorStop(0, 'rgba(70,40,25,0.35)');
  railSh.addColorStop(1, 'rgba(70,40,25,0)');
  g.fillStyle = railSh;
  g.fillRect(0, Y(0.29), W, Y(0.33) - Y(0.29));

  /* --- frieze: painted bands + a running vine with little suns & flowers --- */
  const fT = Y(-0.372);
  const fB = Y(-0.312);
  g.strokeStyle = C.goldDk;
  g.globalAlpha = 0.55;
  g.lineWidth = 2.2 * sc;
  for (const yy of [fT, fT + 4 * sc, fB, fB - 4 * sc]) {
    g.beginPath();
    g.moveTo(0, yy);
    g.lineTo(W, yy);
    g.stroke();
    g.lineWidth = 1 * sc;
  }
  g.globalAlpha = 1;
  const period = bayW / 3;
  const fm = (fT + fB) / 2;
  const fa = (fB - fT) * 0.26;
  g.strokeStyle = C.stem;
  g.lineWidth = 1.8 * sc;
  g.beginPath();
  for (let x = -4; x <= W + 4; x += 3) {
    const u = u0 + x / ts;
    const y = fm + Math.sin((u / period) * TAU) * fa;
    x === -4 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  const per = Math.round(circ / period);
  for (let k = 0; k < per * 4; k++) {
    const u = (k / 4) * period;
    if (u < u0 - period * 0.3 || u > u0 + bayW + period * 0.3) continue;
    const x = UX(u);
    const y = fm + Math.sin((u / period) * TAU) * fa;
    const kk = k % 4;
    const ang = Math.cos((u / period) * TAU);
    if (kk === 0) paintedSun(g, x, fm, (fB - fT) * 0.36, { a: 0.92, rot: 0 });
    else if (kk === 2) flower(g, x, y, (fB - fT) * 0.2, k % 8 === 2 ? C.lav : C.rose, { rot: k });
    else {
      leaf(g, x - 4 * sc, y, 9 * sc, -0.9 + ang * 0.3, C.leaf);
      leaf(g, x + 4 * sc, y, 9 * sc, Math.PI + 0.9 + ang * 0.3, C.leafLt);
    }
  }

  /* --- ceiling & top beam --- */
  const bT = Y(-0.44);
  const bB = Y(-0.385);
  const ceil = g.createLinearGradient(0, 0, 0, bT);
  ceil.addColorStop(0, '#3c241a');
  ceil.addColorStop(1, '#5b3a28');
  g.fillStyle = ceil;
  g.fillRect(0, 0, W, bT);
  // boards
  g.strokeStyle = 'rgba(25,12,8,0.4)';
  g.lineWidth = 1.2 * sc;
  for (let u = Math.ceil(u0 / (bayW / 7)) * (bayW / 7); u < u0 + bayW; u += bayW / 7) {
    g.beginPath();
    g.moveTo(UX(u), 0);
    g.lineTo(UX(u), bT);
    g.stroke();
  }
  woodRect(g, r, 0, bT, W, bB - bT, { scale: sc, base: '#7b4c30', lt: '#b07a4e', dk: '#4a2b1b' });
  const bSh = g.createLinearGradient(0, bB, 0, bB + (bB - bT) * 1.1);
  bSh.addColorStop(0, 'rgba(60,32,20,0.42)');
  bSh.addColorStop(1, 'rgba(60,32,20,0)');
  g.fillStyle = bSh;
  g.fillRect(0, bB, W, (bB - bT) * 1.1);

  /* --- the arched window: stone surround, opening cut out --- */
  if (o.kind === 'window') paintWindowWall(g, r, o, { X, Y, W, HT, sc });

  /* --- posts at both edges (shared by neighbouring bays) --- */
  const postW = bayW * 0.06 * ts;
  for (const edge of [0, 1]) {
    const pj = (j + edge) % nb;
    const pr = rng(777 + pj * 17);
    const px = edge ? W - postW / 2 : -postW / 2;
    woodRect(g, pr, px, bB - 2 * sc, postW, HT - bB, { vertical: true, scale: sc, base: '#7d4d31', lt: '#b4804f', dk: '#4a2a1a' });
    // soft contact shadows either side
    for (const side of [-1, 1]) {
      const sx = px + (side < 0 ? 0 : postW);
      const gr = g.createLinearGradient(sx, 0, sx + side * postW * 0.7, 0);
      gr.addColorStop(0, 'rgba(70,40,25,0.28)');
      gr.addColorStop(1, 'rgba(70,40,25,0)');
      g.fillStyle = gr;
      g.fillRect(Math.min(sx, sx + side * postW * 0.7), bB, postW * 0.7, Y(0.262) - bB);
    }
    // ivy climbing every other post
    if (pj % 2 === 0) {
      const iv = rng(31 + pj * 5);
      const cx = edge ? W : 0;
      const ivy = [];
      for (let y = HT * 0.98; y > bB; y -= 9 * sc) {
        const t = (HT - y) / HT;
        ivy.push([cx + Math.sin(y * 0.012 / sc + pj) * postW * 0.55, y, t]);
      }
      g.strokeStyle = '#5c6e45';
      g.lineWidth = 1.6 * sc;
      g.beginPath();
      ivy.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      ivy.forEach(([x, y], i) => {
        if (i % 2) return;
        const big = iv() < 0.5;
        const lc = iv() < 0.33 ? '#6f8f58' : iv() < 0.5 ? '#557447' : '#89a96c';
        ivyLeaf(g, x + (iv() - 0.5) * postW * 0.9, y, (big ? 10 : 7) * sc, iv() * TAU, lc);
      });
    }
  }

  /* --- light: the window back-lights its own wall; the far wall is sunlit --- */
  const lightAt = (u) => {
    const d = Math.cos(((u - 0.5 * bayW) / circ) * TAU); // 1 at the window bay
    return 0.11 * Math.max(0, d) ** 1.5;
  };
  const lg = g.createLinearGradient(0, 0, W, 0);
  for (let k = 0; k <= 4; k++) lg.addColorStop(k / 4, `rgba(96,52,40,${lightAt(u0 + (k / 4) * bayW).toFixed(3)})`);
  g.fillStyle = lg;
  g.fillRect(0, 0, W, HT);
  // ceiling shade & floor bounce
  const vg = g.createLinearGradient(0, 0, 0, HT);
  vg.addColorStop(0, 'rgba(40,20,14,0.35)');
  vg.addColorStop(0.2, 'rgba(40,20,14,0)');
  vg.addColorStop(0.75, 'rgba(40,20,14,0)');
  vg.addColorStop(1, 'rgba(48,24,16,0.45)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, HT);
  // sunlight: the walls facing the window glow warm, everything is a little golden
  const sunAt = (u) => 0.5 - 0.5 * Math.cos(((u - 0.5 * bayW) / circ) * TAU); // 1 opposite the window
  const sun = sunAt(u0 + bayW / 2);
  g.globalCompositeOperation = 'lighter';
  const warm = g.createRadialGradient(W / 2, Y(-0.02), 0, W / 2, Y(-0.02), W * 1.1);
  warm.addColorStop(0, `rgba(255,190,110,${(0.06 + 0.1 * sun).toFixed(3)})`);
  warm.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, W, HT);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(255,196,130,0.06)';
  g.fillRect(0, 0, W, HT);

  if (o.kind === 'window' && o.opening) {
    // cut the opening last (so no light/grain lands in it)
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    archPath(g, X(0), Y(o.opening.f1), (o.opening.w * W) / 2, Y(o.opening.f1) - Y(o.opening.f0) - (o.opening.w * W) / 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  return { W, HT };
}

function ivyLeaf(g, x, y, r, rot, col) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, r * 0.5);
  g.quadraticCurveTo(-r * 0.9, r * 0.2, -r * 0.7, -r * 0.35);
  g.quadraticCurveTo(-r * 0.35, -r * 0.2, 0, -r * 0.8);
  g.quadraticCurveTo(r * 0.35, -r * 0.2, r * 0.7, -r * 0.35);
  g.quadraticCurveTo(r * 0.9, r * 0.2, 0, r * 0.5);
  g.closePath();
  g.fillStyle = col;
  g.globalAlpha = 0.95;
  g.fill();
  g.strokeStyle = 'rgba(40,60,30,0.35)';
  g.lineWidth = Math.max(0.5, r * 0.06);
  g.globalAlpha = 1;
  g.stroke();
  g.restore();
}

/** An arched path: a rectangle of half-width hw from y=bottom up to the springline, topped by a semicircle. */
export function archPath(g, cx, bottom, hw, rectH) {
  const spring = bottom - rectH;
  g.beginPath();
  g.moveTo(cx - hw, bottom);
  g.lineTo(cx - hw, spring);
  g.arc(cx, spring, hw, Math.PI, 0);
  g.lineTo(cx + hw, bottom);
  g.closePath();
}

function garland(g, r, pts, scale, cols, { flowerEvery = 5, leafEvery = 2 } = {}) {
  g.strokeStyle = C.stem;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = 0.85;
  g.lineWidth = 2.4 * scale;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  // a thinner twin stem twining around it
  g.lineWidth = 1.2 * scale;
  g.globalAlpha = 0.6;
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const [xa, ya] = pts[Math.max(0, i - 1)];
    const [xb, yb] = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(xb - xa, yb - ya) || 1;
    const o = Math.sin(i * 0.55) * 5 * scale;
    const px = x - ((yb - ya) / l) * o;
    const py = y + ((xb - xa) / l) * o;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.stroke();
  g.globalAlpha = 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [xb, yb] = pts[i + 1];
    const ang = Math.atan2(yb - y, xb - x);
    if (i % leafEvery === 0) {
      const side = (i / leafEvery) % 2 ? 1 : -1;
      leaf(g, x, y, (10 + r() * 8) * scale, ang + side * (0.8 + r() * 0.5), r() < 0.3 ? C.leafLt : r() < 0.5 ? C.leafDk : C.leaf);
    }
    if (i % flowerEvery === 2) {
      const big = r() < 0.35;
      flower(g, x + (r() - 0.5) * 6 * scale, y + (r() - 0.5) * 6 * scale, (big ? 9 : 6) * scale * (0.85 + r() * 0.3), cols[(i + ((r() * 3) | 0)) % cols.length], { rot: r() * TAU, petals: r() < 0.3 ? 6 : 5 });
      if (r() < 0.4) {
        g.fillStyle = C.goldLt;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + (r() - 0.5) * 16 * scale, y + (r() - 0.5) * 16 * scale, 1.3 * scale, 0, TAU); g.fill(); }
      }
    }
  }
}

function paintPhotoBayMural(g, r, o, { X, Y, W, sc, free }) {
  const variant = o.variant;
  const cols = [[C.rose, C.cream, C.lav], [C.lav, C.blush, C.cream], [C.cream, C.rose, C.goldLt]][o.j % 3];
  // a soft sunlit wash behind the painting
  blob(g, X(0), Y(-0.05), W * 0.55, 'rgba(255,226,170,1)', 0.22);
  const occ = o.occupied || [];
  const main = occ.length ? occ.reduce((a, b) => (a.w * a.h > b.w * b.h ? a : b)) : null;
  if (main) {
    // a painted garland arching over the painting, with vines climbing to it from the rail
    const cx = X(main.fx);
    const cy = Y(main.f);
    const hx = (main.w * W) / 2 + 18 * sc;
    const hy = (Y(main.f + main.h / 2) - Y(main.f - main.h / 2)) / 2 + 22 * sc;
    const pts = [];
    const N = 46;
    for (let i = 0; i <= N; i++) {
      const a = Math.PI * (1.08 - (i / N) * 1.16) ;
      const wob = Math.sin(i * 0.9 + o.j) * 3 * sc;
      pts.push([cx + Math.cos(a) * (hx + wob), cy - Math.sin(a) * (hy + wob) * 1.0 - hy * 0.08]);
    }
    garland(g, r, pts.reverse(), sc * 1.1, cols, { flowerEvery: 4, leafEvery: 2 });
    for (const side of [-1, 1]) {
      const x0 = cx + side * (hx + 4 * sc);
      vine(g, r, x0 + side * 6 * sc, Y(0.27), x0, cy + hy * 0.25, sc * 1.05, { flowers: 2, cols, amp: 0.035, wave: 1.6 });
    }
    // a little sun crowning the arch
    paintedSun(g, cx, cy - hy * 1.08 - 6 * sc, 15 * sc, { a: 0.95 });
  } else {
    for (const side of [-1, 1]) {
      const x = X(side * (0.36 + r() * 0.06));
      vine(g, r, x, Y(0.27), x + side * (r() * 12) * sc, Y(-0.06 - r() * 0.2), sc * 1.05, { flowers: 2 + ((r() * 2) | 0), cols, amp: 0.05 + r() * 0.04 });
    }
  }
  // little suns, stars and swirls in the margins
  const marks = o.low ? 12 : 22;
  for (let i = 0; i < marks; i++) {
    const fx = (r() - 0.5) * 0.88;
    const f = -0.3 + r() * 0.55;
    if (!free(fx, f, 0.06)) continue;
    const x = X(fx);
    const y = Y(f);
    const t = r();
    if (t < 0.12) paintedSun(g, x, y, (9 + r() * 7) * sc, { a: 0.9, rot: r() });
    else if (t < 0.5) star4(g, x, y, (4 + r() * 6) * sc, r() < 0.5 ? '#f6dc9c' : '#fff4dc', 0.9);
    else if (t < 0.66) star5(g, x, y, (5 + r() * 4) * sc, C.goldLt, 0.85, r());
    else if (t < 0.8) swirl(g, x, y, (8 + r() * 6) * sc, r() < 0.6 ? C.violet : C.goldDk, 0.4, r() < 0.5 ? 1 : -1);
    else flower(g, x, y, (5 + r() * 3) * sc, [C.rose, C.lav, C.cream][(r() * 3) | 0], { rot: r() * TAU });
  }
  // dots of gold leaf
  g.fillStyle = C.goldLt;
  for (let i = 0; i < 26; i++) {
    const fx = (r() - 0.5) * 0.9;
    const f = -0.3 + r() * 0.56;
    if (!free(fx, f, 0.02)) continue;
    g.globalAlpha = 0.5 + r() * 0.4;
    g.beginPath();
    g.arc(X(fx), Y(f), (1 + r() * 1.6) * sc, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  if (variant == null) {
    // a painted sun peeks over the painting
    if (o.j % 3 === 1) paintedSun(g, X(0.3), Y(-0.24), 26 * sc, { a: 0.95, rot: 0.2 });
    return;
  }
  // an empty bay: a big mural instead of a painting
  if (variant === 0) {
    blob(g, X(0), Y(-0.06), W * 0.42, 'rgba(255,214,140,1)', 0.35);
    paintedSun(g, X(0), Y(-0.06), W * 0.24, { a: 1, rot: 0.1 });
    for (let i = 0; i < 9; i++) star4(g, X((r() - 0.5) * 0.7), Y(-0.28 + r() * 0.45), (4 + r() * 6) * sc, '#fff1cf', 0.9);
  } else if (variant === 1) {
    // a patch of painted dusk with lanterns rising (violet accent)
    duskPatch(g, r, X(0), Y(-0.05), W * 0.34, (Y(0.2) - Y(-0.28)) * 0.5, sc, 7);
  } else {
    // a flowering tree
    const bx = X(0);
    const by = Y(0.26);
    g.strokeStyle = '#7a5238';
    g.lineCap = 'round';
    const branch = (x, y, len, ang, w, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang + 0.3) * len * 0.5, y + Math.sin(ang + 0.3) * len * 0.5, x2, y2);
      g.stroke();
      if (depth <= 0) {
        for (let i = 0; i < 5; i++) flower(g, x2 + (r() - 0.5) * 30 * sc, y2 + (r() - 0.5) * 30 * sc, (5 + r() * 4) * sc, r() < 0.6 ? C.blush : C.cream, { rot: r() * TAU, center: C.rose });
        return;
      }
      branch(x2, y2, len * 0.72, ang - 0.45 - r() * 0.2, w * 0.68, depth - 1);
      branch(x2, y2, len * 0.72, ang + 0.4 + r() * 0.2, w * 0.68, depth - 1);
    };
    branch(bx, by, (Y(0.26) - Y(0.02)) * 0.95, -Math.PI / 2, 9 * sc, 3);
  }
}

function duskPatch(g, r, cx, cy, rx, ry, sc, lanterns = 7) {
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  const dusk = g.createLinearGradient(0, cy - ry, 0, cy + ry);
  dusk.addColorStop(0, '#4f3a80');
  dusk.addColorStop(0.55, '#8a62a8');
  dusk.addColorStop(0.85, '#d98f92');
  dusk.addColorStop(1, '#f0b48a');
  g.globalAlpha = 0.9;
  g.fillStyle = dusk;
  g.fill();
  g.clip();
  g.globalAlpha = 1;
  for (let i = 0; i < 22; i++) star4(g, cx + (r() - 0.5) * rx * 2, cy - ry + r() * ry * 1.1, (1.4 + r() * 3) * sc, '#fff4dc', 0.9);
  for (let i = 0; i < lanterns; i++) paintedLantern(g, cx + (r() - 0.5) * rx * 1.6, cy - ry * 0.55 + r() * ry * 1.2, (10 + r() * 15) * sc, { a: 0.95 });
  g.fillStyle = '#4b3a5e';
  g.beginPath();
  g.moveTo(cx - rx, cy + ry);
  for (let x = cx - rx; x <= cx + rx; x += 6) g.lineTo(x, cy + ry * 0.74 + Math.sin(x * 0.02) * ry * 0.06);
  g.lineTo(cx + rx, cy + ry);
  g.fill();
  g.restore();
  g.globalAlpha = 0.65;
  g.strokeStyle = C.goldDk;
  g.lineWidth = 3 * sc;
  g.beginPath();
  g.ellipse(cx, cy, rx + 4 * sc, ry + 4 * sc, 0, 0, TAU);
  g.stroke();
  g.globalAlpha = 1;
  // little painted flowers around the frame of the patch
  for (let i = 0; i < 9; i++) {
    const an = Math.PI * (0.9 + (i / 8) * 1.2);
    flower(g, cx + Math.cos(an) * (rx + 6 * sc), cy + Math.sin(an) * (ry + 6 * sc), (5 + r() * 3) * sc, [C.rose, C.lav, C.cream][i % 3], { rot: r() * TAU });
  }
}

function paintDecorMural(g, r, o, { X, Y, W, sc }) {
  // a painted evening sky full of lanterns above the shelves (violet accent)
  duskPatch(g, r, X(-0.12), Y(-0.205), W * 0.31, (Y(-0.1) - Y(-0.31)) / 2, sc, 7);
  for (let i = 0; i < 12; i++) star4(g, X(0.2 + r() * 0.24), Y(-0.29 + r() * 0.5), (2.5 + r() * 4) * sc, '#f7e1a8', 0.85);
  // tally marks — somebody has been counting days
  g.strokeStyle = 'rgba(110,70,60,0.55)';
  g.lineWidth = 1.8 * sc;
  g.lineCap = 'round';
  const tx = X(0.25);
  const ty = Y(-0.2);
  for (let row = 0; row < 2; row++) {
    for (let gI = 0; gI < 3; gI++) {
      const bx = tx + gI * 24 * sc;
      const by = ty + row * 24 * sc;
      for (let k = 0; k < 4; k++) {
        const x = bx + k * 4.4 * sc;
        g.beginPath();
        g.moveTo(x + (r() - 0.5) * sc, by);
        g.lineTo(x + (r() - 0.5) * sc, by + 16 * sc);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(bx - 3 * sc, by + 13 * sc);
      g.lineTo(bx + 17 * sc, by + 3 * sc);
      g.stroke();
    }
  }
  const k = 1.45; // shelf items are drawn a little larger than life
  const books = ['#7c5a9e', '#b5646f', '#c99a4a', '#5f7c66', '#e0c9a6', '#8a4f5e', '#6a6aa0', '#b98a5a'];
  const shelfBoard = (x0, x1, y) => {
    const thick = 9 * sc * k * 0.8;
    for (const bx of [x0 + 18 * sc, x1 - 18 * sc]) {
      g.fillStyle = '#5e3a24';
      g.beginPath();
      g.moveTo(bx - 4 * sc, y + thick);
      g.lineTo(bx + 4 * sc, y + thick);
      g.quadraticCurveTo(bx + 3 * sc, y + 34 * sc, bx - 4 * sc, y + 40 * sc);
      g.closePath();
      g.fill();
    }
    woodRect(g, r, x0, y, x1 - x0, thick, { scale: sc, base: '#8a5937', lt: '#c08b5a', dk: '#5a341f' });
    const sh = g.createLinearGradient(0, y + thick, 0, y + thick + 30 * sc);
    sh.addColorStop(0, 'rgba(70,40,25,0.38)');
    sh.addColorStop(1, 'rgba(70,40,25,0)');
    g.fillStyle = sh;
    g.fillRect(x0, y + thick, x1 - x0, 30 * sc);
    return thick;
  };
  const bookRow = (x, y, count) => {
    for (let i = 0; i < count; i++) {
      const bw = (8 + r() * 6) * sc * k;
      const bh = (34 + r() * 18) * sc * k;
      const col = books[(i + ((r() * 3) | 0)) % books.length];
      const lean = i === count - 1 ? 0.2 : 0;
      g.save();
      g.translate(x + bw / 2, y);
      g.rotate(lean);
      const gr = g.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      gr.addColorStop(0, col);
      gr.addColorStop(0.5, shade(col, 0.15));
      gr.addColorStop(1, shade(col, -0.25));
      g.fillStyle = gr;
      g.fillRect(-bw / 2, -bh, bw, bh);
      g.fillStyle = 'rgba(245,215,150,0.75)';
      g.fillRect(-bw / 2, -bh * 0.82, bw, 1.6 * sc);
      g.fillRect(-bw / 2, -bh * 0.22, bw, 1.6 * sc);
      g.restore();
      x += bw + 0.8 * sc + (lean ? 8 * sc : 0);
    }
    return x;
  };
  const jar = (jx, jw, jh, y, flowers) => {
    for (let i = 0; i < flowers.length; i++) {
      const ang = -Math.PI / 2 + (i - (flowers.length - 1) / 2) * 0.34;
      const len = jh * (1.1 + r() * 0.5);
      const fx2 = jx + jw / 2 + Math.cos(ang) * len;
      const fy2 = y - jh * 0.4 + Math.sin(ang) * len;
      g.strokeStyle = C.stem;
      g.lineWidth = 1.5 * sc;
      g.beginPath();
      g.moveTo(jx + jw / 2, y - jh * 0.3);
      g.quadraticCurveTo(jx + jw / 2 + Math.cos(ang) * len * 0.3, y - jh * 0.6, fx2, fy2);
      g.stroke();
      leaf(g, (jx + jw / 2 + fx2) / 2, (y - jh * 0.5 + fy2) / 2, 9 * sc * k * 0.8, ang + 0.9, C.leaf);
      flower(g, fx2, fy2, (6 + r() * 3) * sc * k * 0.85, flowers[i], { rot: r() * TAU, petals: r() < 0.5 ? 6 : 5 });
    }
    g.beginPath();
    g.roundRect ? g.roundRect(jx, y - jh, jw, jh, [jw * 0.2, jw * 0.2, 4 * sc, 4 * sc]) : g.rect(jx, y - jh, jw, jh);
    const glass = g.createLinearGradient(jx, 0, jx + jw, 0);
    glass.addColorStop(0, 'rgba(210,235,230,0.5)');
    glass.addColorStop(0.3, 'rgba(255,255,255,0.22)');
    glass.addColorStop(1, 'rgba(160,200,190,0.45)');
    g.fillStyle = glass;
    g.fill();
    g.strokeStyle = 'rgba(120,150,140,0.6)';
    g.lineWidth = 1.2 * sc;
    g.stroke();
    g.fillStyle = 'rgba(170,205,200,0.35)';
    g.fillRect(jx + 2 * sc, y - jh * 0.45, jw - 4 * sc, jh * 0.45 - 2 * sc);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(jx + jw * 0.18, y - jh * 0.85, 2 * sc, jh * 0.6);
  };
  const candle = (x, y, cw, chh) => {
    const cg = g.createLinearGradient(x, 0, x + cw, 0);
    cg.addColorStop(0, '#f6ead2');
    cg.addColorStop(0.6, '#fff7e8');
    cg.addColorStop(1, '#dfcfb2');
    g.fillStyle = cg;
    g.fillRect(x, y - chh, cw, chh);
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.ellipse(x + cw / 2, y - chh, cw / 2, 2.2 * sc, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#f2e3c6';
    g.beginPath();
    g.ellipse(x + cw * 0.25, y - chh + 6 * sc, 1.6 * sc, 5 * sc, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#3a2a20';
    g.lineWidth = 1.2 * sc;
    g.beginPath();
    g.moveTo(x + cw / 2, y - chh);
    g.lineTo(x + cw / 2, y - chh - 4 * sc);
    g.stroke();
    o.candles && o.candles.push({ x: x + cw / 2, y: y - chh - 4 * sc, size: cw / (13 * sc) });
  };
  const pot = (x, y, w) => {
    for (let i = 0; i < 9; i++) leaf(g, x + w / 2 + (r() - 0.5) * w * 0.3, y - w * 0.8, w * (0.55 + r() * 0.35), -Math.PI / 2 + (r() - 0.5) * 2.4, r() < 0.5 ? C.leaf : C.leafDk);
    g.fillStyle = '#c47a5c';
    g.beginPath();
    g.moveTo(x, y - w * 0.85);
    g.lineTo(x + w, y - w * 0.85);
    g.lineTo(x + w * 0.85, y);
    g.lineTo(x + w * 0.15, y);
    g.closePath();
    g.fill();
    g.fillStyle = '#d99273';
    g.fillRect(x - w * 0.04, y - w * 0.92, w * 1.08, w * 0.16);
  };

  // upper shelf: jars, a potted plant, a little candle
  const ux0 = X(-0.44);
  const ux1 = X(0.14);
  const uy = Y(0.0);
  let x = ux0 + 14 * sc;
  jar(x, 18 * sc * k, 24 * sc * k, uy, [C.rose, C.cream, C.lav]);
  x += 30 * sc * k;
  pot(x, uy, 22 * sc * k);
  x += 34 * sc * k;
  x = bookRow(x, uy, 3);
  x += 10 * sc;
  candle(x, uy, 10 * sc * k, 20 * sc * k);
  x += 20 * sc * k;
  jar(x, 15 * sc * k, 19 * sc * k, uy, [C.lav, C.blush]);
  shelfBoard(ux0, ux1, uy);

  // lower shelf: books, a pillar candle, flowers, a stack with a tiny candle
  const ly = Y(0.17);
  x = ux0 + 10 * sc;
  x = bookRow(x, ly, 6);
  x += 10 * sc;
  candle(x, ly, 13 * sc * k, 30 * sc * k);
  x += 13 * sc * k + 10 * sc;
  jar(x, 20 * sc * k, 26 * sc * k, ly, [C.cream, C.rose, C.goldLt]);
  x += 30 * sc * k;
  for (let i = 0; i < 2; i++) {
    const bw = (26 - i * 4) * sc * k;
    const bh = 6 * sc * k;
    g.fillStyle = [books[2], books[6]][i];
    g.fillRect(x + i * 2 * sc, ly - bh * (i + 1), bw, bh);
    g.fillStyle = 'rgba(255,240,210,0.6)';
    g.fillRect(x + i * 2 * sc + bw - 3 * sc, ly - bh * (i + 1) + 1 * sc, 2 * sc, bh - 2 * sc);
  }
  shelfBoard(ux0, ux1, ly);
  // trailing ivy over the shelf edges
  const iv = rng(55);
  for (const [sy, xs] of [[uy, [0.15, 0.7]], [ly, [0.4]]]) {
    for (const f of xs) {
      let ix = ux0 + (ux1 - ux0) * f;
      let iy = sy + 9 * sc;
      for (let i = 0; i < 7; i++) {
        ix += Math.sin(i * 1.3 + f * 9) * 4 * sc;
        iy += 10 * sc;
        ivyLeaf(g, ix, iy, 8 * sc, iv() * TAU, iv() < 0.5 ? '#6f8f58' : '#89a96c');
      }
    }
  }
  // the hook for the pan (the pan itself is a live element)
  const hx = X(0.33);
  const hy = Y(-0.07);
  g.strokeStyle = '#3d2a22';
  g.lineWidth = 3 * sc;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(hx - 6 * sc, hy - 8 * sc);
  g.lineTo(hx + 6 * sc, hy - 8 * sc);
  g.moveTo(hx, hy - 8 * sc);
  g.lineTo(hx, hy + 4 * sc);
  g.arc(hx + 4 * sc, hy + 4 * sc, 4 * sc, Math.PI, Math.PI * 0.1, true);
  g.stroke();
  g.fillStyle = '#3d2a22';
  g.beginPath();
  g.arc(hx - 6 * sc, hy - 8 * sc, 2 * sc, 0, TAU);
  g.arc(hx + 6 * sc, hy - 8 * sc, 2 * sc, 0, TAU);
  g.fill();
  // a little painted flower vine under the pan
  vine(g, r, X(0.42), Y(0.27), X(0.4), Y(0.08), sc, { flowers: 2, cols: [C.rose, C.lav], amp: 0.06 });
}

function paintSunPatch(g, o, { X, Y, sc }) {
  // the window's arch of light, thrown low on the far wall (two mullion shadows)
  g.save();
  g.globalCompositeOperation = 'lighter';
  const cx = X(0.02);
  const bottom = Y(0.62);
  const hw = o.bayW * o.ts * 0.2;
  const rectH = Y(0.62) - Y(0.12);
  g.translate(cx, bottom);
  g.transform(1, 0, -0.32, 1, 0, 0); // light falls at an angle
  g.translate(-cx, -bottom);
  archPath(g, cx, bottom, hw, rectH);
  const gr = g.createLinearGradient(0, bottom - rectH - hw, 0, bottom);
  gr.addColorStop(0, 'rgba(255,214,140,0.20)');
  gr.addColorStop(1, 'rgba(255,190,110,0.30)');
  g.fillStyle = gr;
  g.filter = 'blur(6px)';
  g.fill();
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(150,90,60,0.10)';
  g.fillRect(cx - hw * 0.05, bottom - rectH - hw, hw * 0.1, rectH + hw);
  g.fillRect(cx - hw, bottom - rectH * 0.45, hw * 2, hw * 0.08);
  g.restore();
}

function paintWindowWall(g, r, o, { X, Y, W, sc }) {
  const op = o.opening; // { w (bay widths), f0 (top), f1 (sill) }
  const hw = (op.w * W) / 2;
  const bottom = Y(op.f1);
  const rectH = bottom - Y(op.f0) - hw;
  const cx = X(0);
  const spring = bottom - rectH;
  const t = 0.085 * W; // thickness of the stone surround
  // the shadowed plaster ring around the opening (contre-jour)
  const ring = g.createRadialGradient(cx, spring, hw, cx, spring, hw * 2.6);
  ring.addColorStop(0, 'rgba(90,50,35,0.22)');
  ring.addColorStop(1, 'rgba(90,50,35,0)');
  g.fillStyle = ring;
  g.fillRect(0, 0, W, bottom + hw);
  // voussoirs around the arch
  const nv = 13;
  for (let i = 0; i < nv; i++) {
    const a0 = Math.PI + (i / nv) * Math.PI;
    const a1 = Math.PI + ((i + 1) / nv) * Math.PI;
    const rIn = hw;
    const rOut = hw + t * (i % 2 ? 0.9 : 1.08);
    g.beginPath();
    g.arc(cx, spring, rOut, a0 + 0.012, a1 - 0.012);
    g.arc(cx, spring, rIn, a1 - 0.012, a0 + 0.012, true);
    g.closePath();
    const tone = r();
    g.fillStyle = tone < 0.5 ? '#d9c2a2' : '#cfb593';
    g.fill();
    g.strokeStyle = 'rgba(110,80,55,0.35)';
    g.lineWidth = 1 * sc;
    g.stroke();
  }
  // keystone with a tiny painted sun
  g.save();
  g.translate(cx, spring - hw - t * 0.5);
  g.fillStyle = '#e2ccad';
  g.beginPath();
  g.moveTo(-t * 0.42, -t * 0.7);
  g.lineTo(t * 0.42, -t * 0.7);
  g.lineTo(t * 0.3, t * 0.62);
  g.lineTo(-t * 0.3, t * 0.62);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(110,80,55,0.4)';
  g.stroke();
  g.restore();
  paintedSun(g, cx, spring - hw - t * 0.5, t * 0.3, { a: 1 });
  // jamb stones down both sides
  for (const side of [-1, 1]) {
    let y = spring;
    let k = 0;
    while (y < bottom) {
      const h = Math.min(bottom - y, t * (0.75 + ((k * 7) % 5) * 0.08));
      const w = t * (k % 2 ? 0.95 : 1.2);
      const x = side < 0 ? cx - hw - w : cx + hw;
      g.fillStyle = k % 2 ? '#d6be9c' : '#cdb290';
      g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.strokeStyle = 'rgba(110,80,55,0.3)';
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      y += h;
      k++;
    }
  }
  // ivy framing the arch
  const iv = rng(909);
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + 0.15 + iv() * 1.2;
    const rr = hw + t * (0.6 + iv() * 0.8);
    ivyLeaf(g, cx + Math.cos(a) * rr, spring + Math.sin(a) * rr, (8 + iv() * 6) * sc, iv() * TAU, iv() < 0.5 ? '#6f8f58' : iv() < 0.5 ? '#557447' : '#89a96c');
  }
  for (let i = 0; i < 12; i++) {
    const y = spring + iv() * rectH * 0.7;
    ivyLeaf(g, cx - hw - t * (0.4 + iv() * 0.9), y, (7 + iv() * 5) * sc, iv() * TAU, iv() < 0.5 ? '#6f8f58' : '#89a96c');
  }
  // a few painted flowers by the sill
  flower(g, cx - hw - t * 1.6, bottom - 12 * sc, 7 * sc, C.rose, { rot: 0.3 });
  flower(g, cx - hw - t * 1.25, bottom - 26 * sc, 6 * sc, C.lav, { rot: 1.1 });
  flower(g, cx + hw + t * 1.5, bottom - 18 * sc, 7 * sc, C.cream, { rot: 0.6, center: C.gold });
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
