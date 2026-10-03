// The heart curve used by the constellation chapter: the classic parametric heart,
// re-parameterised by arc length (u ∈ [0, 1), periodic), normalised to unit width
// and centred on its bounding box. u = 0 is the top dip; u grows clockwise
// (right lobe → bottom tip → left lobe), as seen with y pointing up.

export function createHeart(samples = 900) {
  const raw = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const s = Math.sin(t);
    raw.push([16 * s * s * s, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of raw) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const X = new Float64Array(samples + 1);
  const Y = new Float64Array(samples + 1);
  const cum = new Float64Array(samples + 1);
  raw.forEach(([x, y], i) => {
    X[i] = (x - cx) / w;
    Y[i] = (y - cy) / w;
    if (i) cum[i] = cum[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  });
  const total = cum[samples];

  /** Point at arc fraction u (periodic). */
  function at(u, out = { x: 0, y: 0 }) {
    const f = u - Math.floor(u);
    const L = f * total;
    let lo = 0;
    let hi = samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= L) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const k = (L - cum[lo]) / seg;
    out.x = X[lo] + (X[hi] - X[lo]) * k;
    out.y = Y[lo] + (Y[hi] - Y[lo]) * k;
    return out;
  }
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  /** Outward unit normal at u (the curve runs clockwise, so outward is to the left of travel). */
  function normal(u, out = { x: 0, y: 0 }) {
    at(u - 0.002, a);
    at(u + 0.002, b);
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    out.x = -ty / l;
    out.y = tx / l;
    return out;
  }
  return { at, normal, length: total, height: (maxY - minY) / w };
}

const dist = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)));
// Barry–Goldman pyramid for one coordinate (knots 0, t1, t2, t3)
function cr(a, b, c, d, t1, t2, t3, t) {
  const a1 = a + (b - a) * (t / t1);
  const a2 = b + (c - b) * ((t - t1) / (t2 - t1));
  const a3 = c + (d - c) * ((t - t2) / (t3 - t2));
  const b1 = a1 + (a2 - a1) * (t / t2);
  const b2 = a2 + (a3 - a2) * ((t - t1) / (t3 - t1));
  return b1 + (b2 - b1) * ((t - t1) / (t2 - t1));
}

/**
 * Periodic centripetal Catmull-Rom interpolation of values v[k] placed at u = (k + 0.5) / n (u periodic).
 * Centripetal (α = ½) never overshoots into little loops when neighbours are unevenly spaced.
 */
export function periodicInterp(values, u, out) {
  const n = values.length;
  if (!n) return out;
  if (n === 1) return out.copy(values[0]);
  const f = (u - Math.floor(u)) * n - 0.5;
  const i1 = Math.floor(f);
  const s = f - i1;
  const idx = (i) => ((i % n) + n) % n;
  const p0 = values[idx(i1 - 1)];
  const p1 = values[idx(i1)];
  const p2 = values[idx(i1 + 1)];
  const p3 = values[idx(i1 + 2)];
  const t1 = dist(p0, p1);
  const t2 = t1 + dist(p1, p2);
  const t3 = t2 + dist(p2, p3);
  const t = t1 + (t2 - t1) * s;
  out.set(cr(p0.x, p1.x, p2.x, p3.x, t1, t2, t3, t), cr(p0.y, p1.y, p2.y, p3.y, t1, t2, t3, t), cr(p0.z, p1.z, p2.z, p3.z, t1, t2, t3, t));
  return out;
}
