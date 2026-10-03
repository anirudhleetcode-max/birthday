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

/** Periodic Catmull-Rom interpolation of values v[k] placed at u = (k + 0.5) / n (u periodic). */
export function periodicInterp(values, u, out) {
  const n = values.length;
  if (!n) return out;
  if (n === 1) return out.copy(values[0]);
  const f = (u - Math.floor(u)) * n - 0.5;
  const i1 = Math.floor(f);
  const t = f - i1;
  const idx = (i) => ((i % n) + n) % n;
  const p0 = values[idx(i1 - 1)];
  const p1 = values[idx(i1)];
  const p2 = values[idx(i1 + 1)];
  const p3 = values[idx(i1 + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  // uniform Catmull-Rom
  const c0 = -0.5 * t3 + t2 - 0.5 * t;
  const c1 = 1.5 * t3 - 2.5 * t2 + 1;
  const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
  const c3 = 0.5 * t3 - 0.5 * t2;
  out.set(
    p0.x * c0 + p1.x * c1 + p2.x * c2 + p3.x * c3,
    p0.y * c0 + p1.y * c1 + p2.y * c2 + p3.y * c3,
    p0.z * c0 + p1.z * c1 + p2.z * c2 + p3.z * c3,
  );
  return out;
}
