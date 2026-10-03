// Small helpers for the birthday chapter: maths, the factual numbers of her
// twenty years, the shapes the sky draws (timeline, heart) and the photo order.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const ease3 = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeSine = (k) => -(Math.cos(Math.PI * clamp(k, 0, 1)) - 1) / 2;
export const easeOut3 = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
export const smooth5 = (k) => { const x = clamp(k, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };

/** A normally distributed random number (mean 0, sd 1). */
export function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
const fmtDate = (p) => (p ? `${p.d} ${MONTHS[p.m - 1] || ''} ${p.y}` : '');

/**
 * Her life in whole years / months / days, from her birth date to the unlock
 * moment (3 Jan 2007 → 3 Jan 2027: 20 years, 240 months, 7,305 days).
 * `days` comes from ctx.daysAlive() so every chapter agrees on it.
 */
export function lifeSpan(site, daysAlive) {
  const b = ymd(site && site.her && site.her.birthDate) || { y: 2007, m: 1, d: 3 };
  const e = ymd(site && site.settings && site.settings.lock && site.settings.lock.unlockAt) || { y: b.y + 20, m: b.m, d: b.d };
  const months = Math.max(0, (e.y - b.y) * 12 + (e.m - b.m) - (e.d < b.d ? 1 : 0));
  const years = Math.floor(months / 12);
  const days = Number.isFinite(daysAlive) && daysAlive > 0 ? Math.round(daysAlive) : Math.round(years * 365.25);
  return { years, months, days, born: fmtDate(b), today: fmtDate(e) };
}

/** '7,305 days.' → { num: '7,305', rest: 'days.' }; null when the line doesn't start with a number. */
export function splitCount(text) {
  const m = /^\s*(\d(?:[\d,.\s]*\d)?)\s*([\s\S]*)$/.exec(String(text || ''));
  return m ? { num: m[1], rest: m[2].trim() } : null;
}

export const fmtCount = (n) => Number(n).toLocaleString('en-IN');

/**
 * The 7,305-day timeline: a gently curved line across the frame (screen px).
 * Returns y(u) for u in 0..1 and the anchor points for the ribbon.
 */
export function timelineGeom(W, H) {
  const portrait = H > W;
  const x0 = W * (portrait ? 0.085 : 0.12);
  const x1 = W * (portrait ? 0.915 : 0.88);
  const y0 = H * (portrait ? 0.585 : 0.6);
  const amp = Math.min((x1 - x0) * 0.04, H * 0.035, 34);
  const xOf = (u) => x0 + (x1 - x0) * u;
  const yOf = (u) => y0 + Math.sin(u * Math.PI * 1.5 + 0.35) * amp;
  const anchors = [];
  for (let k = 0; k <= 16; k++) anchors.push({ x: xOf(k / 16), y: yOf(k / 16) });
  return { x0, x1, y0, amp, xOf, yOf, anchors };
}

/**
 * The lead-in: from the golden point (the centre unless `start` is given), a soft hair-like curl that
 * dips below the line and comes up into its first day. Returns the full ribbon
 * path and the fraction (by arc length) where the timeline itself begins.
 */
export function timelinePath(W, H, start = null) {
  const g = timelineGeom(W, H);
  const cx = start && Number.isFinite(start.x) ? start.x : W / 2;
  const cy = start && Number.isFinite(start.y) ? start.y : H / 2;
  const s = g.anchors[0];
  const dy = Math.max(26, H * 0.06);
  const lead = [
    { x: cx, y: cy },
    { x: lerp(cx, s.x, 0.3), y: cy + dy * 0.55 },
    { x: lerp(cx, s.x, 0.62), y: s.y + dy * 1.15 },
    { x: s.x - Math.max(10, W * 0.02), y: s.y + dy * 0.95 },
    { x: s.x - Math.max(14, W * 0.03), y: s.y + dy * 0.35 },
  ];
  const pts = [...lead, ...g.anchors];
  // where along the path (by arc length, roughly — the ribbon resamples by length) the line starts
  let L = 0;
  let Lstart = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (i === lead.length) Lstart = L;
  }
  return { ...g, path: pts, startFrac: Lstart / L };
}

/**
 * A heart outline (classic parametric heart), resampled to `n` points evenly
 * spaced by arc length, starting at the top dip, normalised to width 1 (centred).
 * y is up.
 */
export function heartOutline(n = 60) {
  const M = 720;
  const raw = [];
  for (let i = 0; i <= M; i++) {
    const t = (i / M) * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push([x, y]);
  }
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const L = cum[cum.length - 1];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of raw) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cy = (minY + maxY) / 2;
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * L;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const t = (target - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    out.push({ x: lerp(raw[j][0], raw[j + 1][0], t) / 32, y: (lerp(raw[j][1], raw[j + 1][1], t) - cy) / 32 });
  }
  out.aspect = (maxY - minY) / 32; // height / width
  return out;
}

/** Resample a polyline [{x,y}] to n points evenly spaced by arc length. */
export function resample(pts, n) {
  if (!pts || pts.length < 2) return pts ? pts.slice() : [];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const L = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = n === 1 ? 0 : (k / (n - 1)) * L;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const t = (target - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    out.push({ x: lerp(pts[j].x, pts[j + 1].x, t), y: lerp(pts[j].y, pts[j + 1].y, t) });
  }
  return out;
}

/**
 * Her photographs in the order this chapter shows them: featured first, then the
 * special ones (hero / reveal / together / hair), then everything else taken
 * round-robin across the chapters so a cap never keeps only the early ones.
 * Uses the real photos; falls back to placeholders only while none are uploaded.
 */
export function photoPool(ctx) {
  const all = (ctx.allPhotos() || []).filter((p) => p && p.url);
  const real = all.filter((p) => !p.isPlaceholder);
  const base = real.length ? real : all;
  const seen = new Set();
  const out = [];
  const add = (p) => { if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); } };
  base.filter((p) => p.featured).forEach(add);
  for (const role of ['hero', 'reveal', 'together']) add(base.find((p) => p.role === role));
  add(base.find((p) => p.heroHair));
  const byChapter = new Map();
  for (const p of base) {
    if (seen.has(p.id)) continue;
    if (!byChapter.has(p.chapter)) byChapter.set(p.chapter, []);
    byChapter.get(p.chapter).push(p);
  }
  const lists = [...byChapter.values()];
  for (let k = 0; lists.some((l) => k < l.length); k++) for (const l of lists) add(l[k]);
  return out;
}
