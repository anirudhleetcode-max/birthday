// The last beat of the birthday chapter: every photograph comes back and drifts
// in a slow, soft swirl around the title — up to three tilted rings, depth-sorted
// (the near side passes below the title, larger and brighter; the far side above,
// smaller and dimmer). Photos fade whenever they would cross the words on screen,
// so the title and the final lines always stay clean. Plain DOM (crisp photos,
// object-position focal points, alt text); one transform + opacity write per frame.
import { TAU, clamp, lerp, sstep } from './util.js';

const RINGS = {
  // on a phone the title is nearly as wide as the screen: the rings are wider than the
  // frame, so photos pass above and below it and swing out past the edges at the sides
  portrait: [
    { rx: 0.52, ry: 0.235, size: 0.86, speed: 1 },
    { rx: 0.64, ry: 0.305, size: 1, speed: 0.74 },
    { rx: 0.76, ry: 0.375, size: 1.1, speed: 0.56 },
  ],
  landscape: [
    { rx: 0.25, ry: 0.255, size: 0.84, speed: 1 },
    { rx: 0.35, ry: 0.35, size: 1, speed: 0.74 },
    { rx: 0.45, ry: 0.44, size: 1.1, speed: 0.56 },
  ],
};

/**
 * createOrbit(container, photos, { device }) →
 *   { layout({ W, H, cx, cy }), update(time, dt), show({ stagger }), set({ alpha, spread, speed }), zones(rects), destroy() }
 */
export function createOrbit(container, photos, { device = {} } = {}) {
  const reduced = !!device.reducedMotion;
  const ringCount = photos.length <= 9 ? 1 : photos.length <= 22 ? 2 : 3;
  const items = photos.map((photo, i) => {
    const fig = document.createElement('figure');
    fig.className = 'bd-ph';
    const img = document.createElement('img');
    img.alt = photo.alt || photo.caption || photo.label || 'A photograph of her';
    img.decoding = 'async';
    img.draggable = false;
    img.src = photo.thumbUrl || photo.url;
    img.style.objectPosition = photo.objectPosition || '50% 40%';
    fig.appendChild(img);
    container.appendChild(fig);
    return { photo, fig, ring: i % ringCount, k: 0, ratio: clamp(Number(photo.ratio) || 1, 0.55, 1.8), appear: 0, w: 0, h: 0, theta: 0, last: '' };
  });
  // spread each ring's photos evenly around it, rings offset from each other
  for (let r = 0; r < ringCount; r++) {
    const ring = items.filter((it) => it.ring === r);
    ring.forEach((it, k) => { it.theta = (k / ring.length) * TAU + r * 0.9 + 0.35; });
  }

  const st = { W: 0, H: 0, cx: 0, cy: 0, alpha: 1, spread: 1, speed: 1, rings: RINGS.portrait, base: 80, zones: [], phase: 0 };

  /** `clear` = half the size of the title block (px): the rings pass above and below it. */
  function layout({ W, H, cx, cy, clear = null }) {
    st.W = W;
    st.H = H;
    st.cx = cx;
    st.cy = cy;
    const portrait = H >= W * 1.05;
    // a photo about a fifth of the short side (smaller when there are many)
    const crowd = items.length > 24 ? 0.86 : items.length > 14 ? 0.93 : 1;
    st.base = clamp(Math.min(W, H) * (portrait ? 0.215 : 0.135) * crowd, 58, 150);
    st.rings = (portrait ? RINGS.portrait : RINGS.landscape).map((R, k) => {
      if (!clear) return R;
      // tall titles (tablets): open the rings up so the near and far passes clear it
      const half = (st.base * R.size) / 2;
      const need = (clear.hh + half * 1.08 + 10) / H + k * 0.06;
      return { ...R, ry: clamp(Math.max(R.ry, need), R.ry, 0.47) };
    });
    for (const it of items) {
      const s = st.base * st.rings[it.ring].size;
      it.w = Math.round(s * Math.sqrt(it.ratio));
      it.h = Math.round(s / Math.sqrt(it.ratio));
      it.fig.style.width = `${it.w}px`;
      it.fig.style.height = `${it.h}px`;
      it.fig.style.marginLeft = `${-it.w / 2}px`;
      it.fig.style.marginTop = `${-it.h / 2}px`;
    }
  }

  /** Screen rects ({x0, y0, x1, y1}) the photos must not cover. */
  function zones(rects) { st.zones = (rects || []).filter(Boolean); }

  function maskAt(x, y, hw, hh) {
    let m = 1;
    for (const z of st.zones) {
      const dx = Math.max(z.x0 - (x + hw), (x - hw) - z.x1, 0);
      const dy = Math.max(z.y0 - (y + hh), (y - hh) - z.y1, 0);
      const d = Math.hypot(dx, dy);
      m = Math.min(m, lerp(z.floor ?? 0.1, 1, sstep(0, 34, d)));
    }
    return m;
  }

  const omega = (TAU / 92) * (reduced ? 0.25 : 1);
  function update(time, dt) {
    st.phase += dt * omega * st.speed;
    for (const it of items) {
      const R = st.rings[it.ring];
      const th = it.theta + st.phase * R.speed;
      const depth = Math.sin(th); // +1 near (below the title), -1 far (above it)
      const near = (depth + 1) / 2;
      const sp = st.spread * lerp(0.9, 1, it.appear);
      const x = st.cx + Math.cos(th) * R.rx * st.W * sp;
      const y = st.cy + depth * R.ry * st.H * sp;
      const s = lerp(0.58, 1.08, near) * lerp(0.55, 1, it.appear);
      const a = lerp(0.6, 1, near) * maskAt(x, y, (it.w * s) / 2, (it.h * s) / 2) * st.alpha * it.appear;
      it.fig.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      it.fig.style.opacity = a.toFixed(3);
      const z = String(100 + Math.round(depth * 60));
      if (z !== it.last) { it.fig.style.zIndex = z; it.last = z; }
      it.fig.style.visibility = a < 0.004 ? 'hidden' : 'visible';
    }
  }

  /** Bring them back one by one (front ones first). */
  function show({ stagger = 0.09, duration = 1.6 } = {}) {
    const g = window.gsap;
    const order = items.slice().sort((a, b) => Math.sin(b.theta) - Math.sin(a.theta));
    order.forEach((it, k) => g.to(it, { appear: 1, duration: reduced ? 1.2 : duration, delay: k * (reduced ? stagger * 0.5 : stagger), ease: 'power2.out' }));
    return order.length * stagger + duration;
  }

  function set(o = {}) {
    for (const k of ['alpha', 'spread', 'speed']) if (o[k] != null) st[k] = o[k];
  }

  function destroy() {
    const g = window.gsap;
    for (const it of items) { g.killTweensOf(it); it.fig.remove(); }
    items.length = 0;
  }

  return { layout, update, show, set, zones, destroy, state: st, get count() { return items.length; } };
}
