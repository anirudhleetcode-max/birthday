// Painting a photograph onto a canvas, stroke by stroke: first a loose, warm
// underpainting in broad bristle strokes, then the real photo in finer strokes,
// the face (focal point) last. The photo is never altered — the strokes only
// decide where it is visible yet. Cover-cropping matches CSS
// `object-fit: cover; object-position: <focal>` so the finished canvas can hand
// over to the real <img> without a jump.

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

let bristle = null;
function bristleSprite() {
  if (bristle) return bristle;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d');
  const r = rng(4242);
  // a soft body…
  const body = g.createRadialGradient(64, 24, 4, 64, 24, 60);
  body.addColorStop(0, 'rgba(255,255,255,0.55)');
  body.addColorStop(1, 'rgba(255,255,255,0)');
  g.save();
  g.scale(1, 0.42);
  g.fillStyle = body;
  g.fillRect(0, 0, 128, 115);
  g.restore();
  // …combed by bristles
  for (let i = 0; i < 46; i++) {
    const y = 4 + r() * 40;
    const prof = 1 - Math.abs((y - 24) / 22);
    const len = 50 + r() * 70 * prof;
    const x0 = 64 - len / 2 + (r() - 0.5) * 16;
    const gr = g.createLinearGradient(x0, 0, x0 + len, 0);
    const a = (0.35 + r() * 0.65) * Math.min(1, prof * 1.6);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.15, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.85, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr;
    g.lineWidth = 1 + r() * 2.2;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x0 + len, y + (r() - 0.5) * 2);
    g.stroke();
  }
  bristle = c;
  return c;
}

/** Source rect for cover-fitting (iw×ih) into (cw×ch) with CSS object-position fx/fy (0..1). */
export function coverRect(iw, ih, cw, ch, fx = 0.5, fy = 0.5) {
  const scale = Math.max(cw / iw, ch / ih);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: (iw - sw) * fx, sy: (ih - sh) * fy, sw, sh };
}

function makeStrokes(W, H, r, { broad, count, focal }) {
  const strokes = [];
  const min = Math.min(W, H);
  if (broad) {
    // loose diagonal zig-zags that block in the whole canvas
    const rows = count;
    for (let i = 0; i < rows; i++) {
      const y = ((i + 0.5) / rows) * H;
      const ltr = i % 2 === 0;
      const tilt = (r() - 0.5) * H * 0.25;
      strokes.push({
        x0: ltr ? -W * 0.12 : W * 1.12, y0: y - tilt,
        x1: ltr ? W * 1.12 : -W * 0.12, y1: y + tilt,
        bend: (r() - 0.5) * H * 0.18,
        w: (H / rows) * (1.9 + r() * 0.5),
      });
    }
  } else {
    // finer strokes in a loose grid order, the focal area last
    const rows = Math.max(4, Math.round(count / 2));
    const list = [];
    for (let i = 0; i < rows; i++) {
      const y = ((i + 0.5) / rows) * H;
      const segs = 2;
      for (let k = 0; k < segs; k++) {
        const x0 = (k / segs) * W - W * 0.15;
        const x1 = ((k + 1) / segs) * W + W * 0.15;
        const dir = r() < 0.5;
        const ang = (r() - 0.5) * 0.5;
        const cx = (x0 + x1) / 2;
        const len = (x1 - x0) * (1 + r() * 0.15);
        const d = Math.hypot(cx / W - focal.x, y / H - focal.y);
        list.push({
          x0: cx - (Math.cos(ang) * len) / 2 * (dir ? 1 : -1), y0: y - (Math.sin(ang) * len) / 2 * (dir ? 1 : -1),
          x1: cx + (Math.cos(ang) * len) / 2 * (dir ? 1 : -1), y1: y + (Math.sin(ang) * len) / 2 * (dir ? 1 : -1),
          bend: (r() - 0.5) * (H / rows) * 0.8,
          w: (H / rows) * (1.55 + r() * 0.4),
          order: -d + r() * 0.35,
        });
      }
    }
    list.sort((a, b) => b.order - a.order); // far from the face first
    strokes.push(...list);
    // a few small dabs right at the focal point
    for (let i = 0; i < 6; i++) {
      const cx = focal.x * W + (r() - 0.5) * min * 0.3;
      const cy = focal.y * H + (r() - 0.5) * min * 0.3;
      const a = r() * TAU;
      const len = min * (0.18 + r() * 0.12);
      strokes.push({ x0: cx - Math.cos(a) * len / 2, y0: cy - Math.sin(a) * len / 2, x1: cx + Math.cos(a) * len / 2, y1: cy + Math.sin(a) * len / 2, bend: 0, w: min * 0.14 });
    }
  }
  return strokes;
}

/**
 * createPainting(canvas, img, { focal:{x,y}, low, seed }) → { step(t 0..1), done(), destroy() }
 * canvas must already be sized (backing px). img must be decoded.
 */
export function createPainting(canvas, img, { focal = { x: 0.5, y: 0.4 }, low = false, seed = 1 } = {}) {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d');
  const r = rng(seed * 977 + 13);
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const src = coverRect(iw, ih, W, H, focal.x, focal.y);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  // the underpainting: a tiny, warm, colour-blocked version of the photo
  let under = null;
  if (!low) {
    under = document.createElement('canvas');
    const uw = 22;
    under.width = uw;
    under.height = Math.max(8, Math.round((uw * H) / W));
    const ug = under.getContext('2d');
    ug.fillStyle = '#d9a46a';
    ug.fillRect(0, 0, under.width, under.height);
    ug.globalAlpha = 0.82;
    ug.drawImage(img, src.sx, src.sy, src.sw, src.sh, 0, 0, under.width, under.height);
    ug.globalAlpha = 1;
  }
  const maskU = low ? null : mk();
  const maskF = mk();
  const tmp = mk();
  const gu = maskU && maskU.getContext('2d');
  const gf = maskF.getContext('2d');
  const gt = tmp.getContext('2d');
  const strokesU = low ? [] : makeStrokes(W, H, r, { broad: true, count: 5, focal });
  const strokesF = makeStrokes(W, H, r, { broad: false, count: low ? 8 : 14, focal });
  // timing: underpainting 0 → .5, final strokes .22 → 1
  const plan = [];
  strokesU.forEach((s, i) => plan.push({ ...s, g: gu, t0: (i / strokesU.length) * 0.42, t1: (i / strokesU.length) * 0.42 + 0.12, done: 0 }));
  strokesF.forEach((s, i) => {
    const t0 = (low ? 0 : 0.22) + (i / strokesF.length) * (low ? 0.86 : 0.68);
    plan.push({ ...s, g: gf, t0, t1: t0 + (low ? 0.14 : 0.1), done: 0 });
  });
  const spr = bristleSprite();

  function stamp(gc, s, a, b) {
    // stamps along a quadratic stroke from param a to b
    const mx = (s.x0 + s.x1) / 2 - ((s.y1 - s.y0) / Math.hypot(s.x1 - s.x0, s.y1 - s.y0 || 1)) * s.bend;
    const my = (s.y0 + s.y1) / 2 + ((s.x1 - s.x0) / Math.hypot(s.x1 - s.x0, s.y1 - s.y0 || 1)) * s.bend;
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    const step = Math.max(1.5, s.w * 0.16) / Math.max(1, len);
    for (let t = a; t <= b; t += step) {
      const u = 1 - t;
      const x = u * u * s.x0 + 2 * u * t * mx + t * t * s.x1;
      const y = u * u * s.y0 + 2 * u * t * my + t * t * s.y1;
      const dx = 2 * u * (mx - s.x0) + 2 * t * (s.x1 - mx);
      const dy = 2 * u * (my - s.y0) + 2 * t * (s.y1 - my);
      const press = Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.06)) * 0.45 + 0.6;
      const w = s.w * press;
      gc.save();
      gc.translate(x, y);
      gc.rotate(Math.atan2(dy, dx));
      gc.globalAlpha = 0.9;
      gc.drawImage(spr, -w * 0.9, -w / 2, w * 1.8, w);
      gc.restore();
    }
  }

  let last = 0;
  function step(t) {
    t = Math.max(0, Math.min(1, t));
    if (t < last) return;
    last = t;
    for (const s of plan) {
      if (t <= s.t0 || s.done >= 1) continue;
      const k = Math.min(1, (t - s.t0) / (s.t1 - s.t0));
      if (k > s.done) {
        stamp(s.g, s, s.done, k);
        s.done = k;
      }
    }
    g.clearRect(0, 0, W, H);
    if (under) {
      g.globalCompositeOperation = 'source-over';
      g.drawImage(maskU, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.imageSmoothingEnabled = true;
      g.drawImage(under, 0, 0, W, H);
    }
    gt.globalCompositeOperation = 'source-over';
    gt.clearRect(0, 0, W, H);
    gt.drawImage(maskF, 0, 0);
    gt.globalCompositeOperation = 'source-in';
    gt.drawImage(img, src.sx, src.sy, src.sw, src.sh, 0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(tmp, 0, 0);
  }

  function destroy() {
    for (const c of [maskU, maskF, tmp, under]) if (c) c.width = c.height = 1;
  }
  return { step, destroy };
}
