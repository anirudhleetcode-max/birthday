// The tower's arched window: the world outside (sky, far mountains, rolling
// hills, a blossoming branch) is built from layered panels set *behind* the
// wall, so it moves with real parallax through the opening; the window's own
// furniture (embrasure, open casements, sheer curtains, the stone sill with a
// flower box, hanging ivy) sits just in front of the wall. All original art.

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
const f1 = (v) => Number(v).toFixed(1);

/** Sky panel (HTML) — w×h world px; `hy` is the eye-level horizon (px from the top). */
export function skyHTML(w, h, hy) {
  const clouds = [
    { x: 0.08, y: 0.18, s: 1.0, d: 140 },
    { x: 0.55, y: 0.1, s: 1.25, d: 180 },
    { x: 0.3, y: 0.36, s: 0.75, d: 120 },
    { x: 0.78, y: 0.32, s: 0.9, d: 160 },
  ];
  const cw = Math.min(w, h) * 0.42;
  return `
  <div class="tw-sky" style="width:${f1(w)}px;height:${f1(h)}px;--hy:${f1(hy)}px">
    <div class="tw-sky-day"></div>
    <div class="tw-sky-eve"></div>
    <div class="tw-sky-sun"></div>
    ${clouds.map((c, i) => `<div class="tw-cloud" style="left:${f1(c.x * w)}px;top:${f1(c.y * hy)}px;width:${f1(cw * c.s)}px;height:${f1(cw * c.s * 0.42)}px;--d:${c.d}s;--dx:${f1(w * 0.12)}px;animation-delay:${-i * 37}s"><i></i><i></i><i></i></div>`).join('')}
    ${mountainsSVG(w, h, hy)}
    <svg class="tw-birds" viewBox="0 0 60 20" style="left:${f1(w * 0.2)}px;top:${f1(hy * 0.42)}px;width:${f1(cw * 0.22)}px"><path d="M2 10 q6 -7 12 0 q6 -7 12 0" /><path d="M34 6 q4 -5 8 0 q4 -5 8 0" /></svg>
  </div>`;
}

function mountainsSVG(w, h, hy) {
  const ridge = (base, amp, n, seed) => {
    const rr = rng(seed);
    let d = `M0 ${f1(h)} L0 ${f1(base)}`;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * w;
      const y = base - amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + rr() * 2))) * (0.7 + rr() * 0.3);
      d += ` L${f1(x)} ${f1(y)}`;
    }
    return `${d} L${f1(w)} ${f1(h)} Z`;
  };
  return `
  <svg class="tw-mtn" viewBox="0 0 ${f1(w)} ${f1(h)}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="tw-m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a99fcf"/><stop offset="1" stop-color="#c9bfe0"/></linearGradient>
      <linearGradient id="tw-m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f88bd"/><stop offset="1" stop-color="#b6aed6"/></linearGradient>
    </defs>
    <path d="${ridge(hy - h * 0.005, h * 0.075, 9, 5)}" fill="url(#tw-m1)" opacity=".75"/>
    <path d="${ridge(hy + h * 0.02, h * 0.05, 13, 9)}" fill="url(#tw-m2)" opacity=".8"/>
  </svg>`;
}

/** Hills panel (SVG) — rolling meadows below the horizon, trees, a river glint. */
export function hillsHTML(w, h, hy) {
  const r = rng(77);
  const hill = (y0, amp, freq, ph, col1, col2, id) => {
    let d = `M0 ${f1(h)} L0 ${f1(y0)}`;
    for (let i = 0; i <= 40; i++) {
      const x = (i / 40) * w;
      const y = y0 + Math.sin(ph + (i / 40) * freq * TAU) * amp + Math.sin(ph * 2 + (i / 40) * freq * 2.3 * TAU) * amp * 0.35;
      d += ` L${f1(x)} ${f1(y)}`;
    }
    d += ` L${f1(w)} ${f1(h)} Z`;
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col1}"/><stop offset="1" stop-color="${col2}"/></linearGradient><path d="${d}" fill="url(#${id})"/>`;
  };
  const yAt = (y0, amp, freq, ph, x) => y0 + Math.sin(ph + (x / w) * freq * TAU) * amp + Math.sin(ph * 2 + (x / w) * freq * 2.3 * TAU) * amp * 0.35;
  const unit = h / 100;
  const trees = [];
  const L = [
    { y0: hy + 3.5 * unit, amp: 1.6 * unit, freq: 1.3, ph: 0.4, c: ['#b7b98f', '#a6ab83'], id: 'tw-h1', t: 8, ts: 1.4 },
    { y0: hy + 9 * unit, amp: 2.4 * unit, freq: 1.1, ph: 2.1, c: ['#93a86f', '#7f9761'], id: 'tw-h2', t: 7, ts: 2.2 },
    { y0: hy + 17 * unit, amp: 3.5 * unit, freq: 0.8, ph: 4.0, c: ['#748f57', '#5f7a48'], id: 'tw-h3', t: 5, ts: 2.2 },
  ];
  let paths = '';
  L.forEach((l, li) => {
    paths += hill(l.y0, l.amp, l.freq, l.ph, l.c[0], l.c[1], l.id);
    if (li === 1) {
      // a river glinting between the hills
      const rx = w * 0.35;
      paths += `<path d="M${f1(rx)} ${f1(yAt(l.y0, l.amp, l.freq, l.ph, rx) + unit)} C ${f1(rx + w * 0.1)} ${f1(l.y0 + 5 * unit)}, ${f1(rx - w * 0.08)} ${f1(l.y0 + 8 * unit)}, ${f1(rx + w * 0.05)} ${f1(h)}" fill="none" stroke="#e9eef0" stroke-width="${f1(1.4 * unit)}" stroke-linecap="round" opacity=".55"/>`;
    }
    for (let k = 0; k < l.t; k++) {
      const x = r() * w;
      const y = yAt(l.y0, l.amp, l.freq, l.ph, x);
      const s = l.ts * unit * (0.7 + r() * 0.6);
      const dk = li === 0 ? '#8d9a72' : li === 1 ? '#5f7a4c' : '#4a6439';
      const lt = li === 0 ? '#a6b088' : li === 1 ? '#7f9a63' : '#6b8a52';
      if (r() < 0.4) trees.push(`<path d="M${f1(x)} ${f1(y - s * 3.4)} C ${f1(x + s * 0.55)} ${f1(y - s * 2.3)} ${f1(x + s * 0.5)} ${f1(y - s * 0.5)} ${f1(x)} ${f1(y + s * 0.1)} C ${f1(x - s * 0.5)} ${f1(y - s * 0.5)} ${f1(x - s * 0.55)} ${f1(y - s * 2.3)} ${f1(x)} ${f1(y - s * 3.4)} Z" fill="${dk}"/><path d="M${f1(x - s * 0.05)} ${f1(y - s * 3.1)} C ${f1(x - s * 0.3)} ${f1(y - s * 2.2)} ${f1(x - s * 0.3)} ${f1(y - s * 1.2)} ${f1(x - s * 0.1)} ${f1(y - s * 0.6)}" stroke="${lt}" stroke-width="${f1(s * 0.18)}" fill="none" opacity=".6"/>`);
      else trees.push(`<circle cx="${f1(x)}" cy="${f1(y - s * 0.9)}" r="${f1(s)}" fill="${dk}"/><circle cx="${f1(x - s * 0.3)}" cy="${f1(y - s * 1.15)}" r="${f1(s * 0.55)}" fill="${lt}" opacity=".75"/>`);
    }
    if (li === 1) paths += trees.splice(0).join('');
  });
  // wildflower specks on the nearest meadow
  let specks = '';
  for (let i = 0; i < 60; i++) {
    const x = r() * w;
    const y = yAt(L[2].y0, L[2].amp, L[2].freq, L[2].ph, x) + r() * (h - L[2].y0) * 0.8 + unit;
    specks += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(unit * (0.25 + r() * 0.35))}" fill="${['#f2c2cc', '#fbf1dc', '#c9b3e6', '#f5d283'][i % 4]}" opacity=".85"/>`;
  }
  return `
  <div class="tw-hills" style="width:${f1(w)}px;height:${f1(h)}px">
    <svg viewBox="0 0 ${f1(w)} ${f1(h)}" preserveAspectRatio="none"><defs></defs>${paths}${trees.join('')}${specks}</svg>
    <div class="tw-hills-eve"></div>
  </div>`;
}

/** Near panel: a blossoming branch reaching across the top corner of the view. */
export function nearHTML(w, h) {
  const r = rng(303);
  const u = Math.min(w, h) / 100;
  let leaves = '';
  const branch = [];
  const pts = [[-2 * u, 12 * u], [14 * u, 15 * u], [28 * u, 13 * u], [40 * u, 18 * u], [52 * u, 17 * u]];
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += ` Q${f1((pts[i - 1][0] + pts[i][0]) / 2)} ${f1(pts[i - 1][1] - 3 * u)} ${f1(pts[i][0])} ${f1(pts[i][1])}`;
  branch.push(`<path d="${d}" fill="none" stroke="#5a3d2c" stroke-width="${f1(1.6 * u)}" stroke-linecap="round"/>`);
  branch.push(`<path d="M${f1(28 * u)} ${f1(13 * u)} Q ${f1(33 * u)} ${f1(5 * u)} ${f1(38 * u)} ${f1(4 * u)}" fill="none" stroke="#5a3d2c" stroke-width="${f1(0.9 * u)}" stroke-linecap="round"/>`);
  for (let i = 0; i < 26; i++) {
    const t = r();
    const p = pts[Math.min(pts.length - 1, Math.floor(t * pts.length))];
    const x = p[0] + (r() - 0.5) * 12 * u;
    const y = p[1] + (r() - 0.5) * 10 * u;
    if (r() < 0.55) {
      const a = r() * 360;
      leaves += `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})" d="M0 0 Q ${f1(2.2 * u)} ${f1(-1.6 * u)} ${f1(4.4 * u)} 0 Q ${f1(2.2 * u)} ${f1(1.6 * u)} 0 0" fill="${r() < 0.5 ? '#7f9c6c' : '#9db783'}"/>`;
    } else {
      const s = (0.9 + r() * 0.8) * u;
      leaves += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(r() * 72)})">${[0, 72, 144, 216, 288].map((a) => `<ellipse transform="rotate(${a}) translate(0 ${f1(-s * 0.55)})" rx="${f1(s * 0.42)}" ry="${f1(s * 0.6)}" fill="${r() < 0.6 ? '#f7d3dc' : '#fff4ea'}"/>`).join('')}<circle r="${f1(s * 0.25)}" fill="#e7a0b4"/></g>`;
    }
  }
  return `<div class="tw-near" style="width:${f1(w)}px;height:${f1(h)}px"><svg class="tw-branch" viewBox="0 0 ${f1(w)} ${f1(h)}">${branch.join('')}${leaves}</svg></div>`;
}

/**
 * The window furniture, in a panel of w×h world px. `o` = { cx, bottom, hw, rectH } of the opening (panel px),
 * `t` = stone thickness. Returns HTML (an SVG + curtain layers) and the sill candle position.
 */
export function frameHTML(w, h, o, unit) {
  const r = rng(515);
  const { cx, bottom, hw, rectH } = o;
  const spring = bottom - rectH;
  const top = spring - hw;
  const u = unit;
  const arch = (inset) => `M${f1(cx - hw + inset)} ${f1(bottom)} L${f1(cx - hw + inset)} ${f1(spring)} A ${f1(hw - inset)} ${f1(hw - inset)} 0 0 1 ${f1(cx + hw - inset)} ${f1(spring)} L${f1(cx + hw - inset)} ${f1(bottom)}`;
  const rev = Math.max(4, hw * 0.13);
  // embrasure: the thickness of the wall, as a shaded band just inside the opening
  const band = `<path d="${arch(rev / 2)}" fill="none" stroke="url(#tw-emb)" stroke-width="${f1(rev)}" />`;
  // open casements (seen almost edge-on just inside the jambs), leaded diamond panes
  const leafW = hw * 0.2;
  const casement = (side) => {
    const x0 = side < 0 ? cx - hw + rev * 0.3 : cx + hw - rev * 0.3 - leafW;
    const yTop = spring - hw * 0.55;
    let lead = '';
    for (let k = -6; k < 30; k++) {
      const y = yTop + k * leafW * 0.9;
      lead += `<path d="M${f1(x0)} ${f1(y)} L${f1(x0 + leafW)} ${f1(y + leafW * 0.9)} M${f1(x0 + leafW)} ${f1(y)} L${f1(x0)} ${f1(y + leafW * 0.9)}"/>`;
    }
    const clip = `tw-cl${side < 0 ? 'l' : 'r'}`;
    return `
      <clipPath id="${clip}"><path d="M${f1(x0)} ${f1(bottom - 2 * u)} L${f1(x0)} ${f1(yTop + leafW)} Q ${f1(x0 + leafW / 2)} ${f1(yTop - leafW * 0.6)} ${f1(x0 + leafW)} ${f1(yTop + leafW)} L${f1(x0 + leafW)} ${f1(bottom - 2 * u)} Z"/></clipPath>
      <g clip-path="url(#${clip})">
        <rect x="${f1(x0)}" y="${f1(yTop - leafW)}" width="${f1(leafW)}" height="${f1(bottom - yTop + leafW)}" fill="url(#tw-glass${side < 0 ? 'L' : 'R'})"/>
        <g stroke="#6b5a4a" stroke-width="${f1(0.6 * u)}" opacity=".7">${lead}</g>
      </g>
      <path d="M${f1(x0)} ${f1(bottom - 2 * u)} L${f1(x0)} ${f1(yTop + leafW)} Q ${f1(x0 + leafW / 2)} ${f1(yTop - leafW * 0.6)} ${f1(x0 + leafW)} ${f1(yTop + leafW)} L${f1(x0 + leafW)} ${f1(bottom - 2 * u)}" fill="none" stroke="#6e4a30" stroke-width="${f1(1.6 * u)}"/>`;
  };
  // the sill + a flower box
  const sillT = Math.max(6, hw * 0.12);
  const sillW = hw * 2 + rev * 4;
  const sill = `
    <rect x="${f1(cx - sillW / 2)}" y="${f1(bottom - sillT * 0.25)}" width="${f1(sillW)}" height="${f1(sillT)}" rx="${f1(u)}" fill="url(#tw-sill)"/>
    <rect x="${f1(cx - sillW / 2)}" y="${f1(bottom - sillT * 0.25)}" width="${f1(sillW)}" height="${f1(sillT * 0.28)}" fill="#f3e2c6" opacity=".8"/>
    <rect x="${f1(cx - sillW / 2)}" y="${f1(bottom + sillT * 0.75)}" width="${f1(sillW)}" height="${f1(sillT * 0.9)}" fill="url(#tw-sillsh)"/>`;
  const boxW = hw * 1.15;
  const boxH = hw * 0.2;
  const bx = cx - boxW / 2 + hw * 0.18;
  const by = bottom - boxH;
  let blooms = '';
  for (let i = 0; i < 22; i++) {
    const x = bx + boxW * (0.05 + 0.9 * r());
    const y = by - r() * boxH * 1.2;
    const sx = (0.9 + r() * 0.9) * u * 1.6;
    if (r() < 0.45) blooms += `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(-120 + r() * 60)})" d="M0 0 Q ${f1(sx * 1.4)} ${f1(-sx)} ${f1(sx * 2.8)} 0 Q ${f1(sx * 1.4)} ${f1(sx)} 0 0" fill="${r() < 0.5 ? '#7f9c6c' : '#9db783'}"/>`;
    else {
      const col = ['#e59db2', '#b39bd8', '#fbf1dc', '#f2c2cc', '#8a64b6'][(r() * 5) | 0];
      blooms += `<g transform="translate(${f1(x)} ${f1(y)})">${[0, 72, 144, 216, 288].map((a) => `<ellipse transform="rotate(${a}) translate(0 ${f1(-sx * 0.55)})" rx="${f1(sx * 0.4)}" ry="${f1(sx * 0.6)}" fill="${col}"/>`).join('')}<circle r="${f1(sx * 0.25)}" fill="#f5d283"/></g>`;
    }
  }
  // trailing ivy over the box
  let trail = '';
  for (let k = 0; k < 3; k++) {
    let x = bx + boxW * (0.15 + k * 0.33);
    let y = by + boxH;
    for (let i = 0; i < 6; i++) {
      x += Math.sin(i + k) * 2 * u;
      y += 3.2 * u;
      trail += `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(r() * 360)}) scale(${f1(u * 0.9)})" d="M0 2.5 Q -4.5 1 -3.5 -1.8 Q -1.8 -1 0 -4 Q 1.8 -1 3.5 -1.8 Q 4.5 1 0 2.5 Z" fill="${r() < 0.5 ? '#6f8f58' : '#89a96c'}"/>`;
    }
  }
  const box = `
    ${blooms}
    <rect x="${f1(bx)}" y="${f1(by)}" width="${f1(boxW)}" height="${f1(boxH)}" rx="${f1(u * 0.8)}" fill="url(#tw-terra)"/>
    <rect x="${f1(bx)}" y="${f1(by)}" width="${f1(boxW)}" height="${f1(boxH * 0.18)}" fill="#e4a283" opacity=".7"/>
    ${trail}`;
  // a little jar candle on the sill (its flame is live)
  const jx = cx - hw * 0.72;
  const jy = bottom;
  const jw = hw * 0.12;
  const jh = hw * 0.16;
  const jar = `
    <rect x="${f1(jx - jw / 2)}" y="${f1(jy - jh)}" width="${f1(jw)}" height="${f1(jh)}" rx="${f1(jw * 0.18)}" fill="rgba(255,236,200,.35)" stroke="rgba(170,140,110,.6)" stroke-width="${f1(0.5 * u)}"/>
    <rect x="${f1(jx - jw * 0.36)}" y="${f1(jy - jh * 0.62)}" width="${f1(jw * 0.72)}" height="${f1(jh * 0.6)}" fill="#fff4e2"/>
    <path d="M${f1(jx)} ${f1(jy - jh * 0.62)} v${f1(-jh * 0.12)}" stroke="#3a2a20" stroke-width="${f1(0.6 * u)}"/>`;
  // ivy dangling from the top of the arch, in front of the view
  let ivy = '';
  for (let k = 0; k < 4; k++) {
    const a = Math.PI + 0.35 + k * 0.32 + (k > 1 ? 1.1 : 0);
    let x = cx + Math.cos(a) * (hw - rev * 0.5);
    let y = spring + Math.sin(a) * (hw - rev * 0.5);
    const n = 4 + ((r() * 4) | 0);
    let d = `M${f1(x)} ${f1(y)}`;
    const lv = [];
    for (let i = 0; i < n; i++) {
      x += Math.sin(i * 1.4 + k) * 1.4 * u;
      y += 4 * u;
      d += ` L${f1(x)} ${f1(y)}`;
      lv.push(`<path transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(r() * 360)}) scale(${f1(u * 1.05)})" d="M0 2.5 Q -4.5 1 -3.5 -1.8 Q -1.8 -1 0 -4 Q 1.8 -1 3.5 -1.8 Q 4.5 1 0 2.5 Z" fill="${r() < 0.5 ? '#5f7f4b' : '#7f9f64'}"/>`);
    }
    ivy += `<path d="${d}" fill="none" stroke="#56683f" stroke-width="${f1(0.5 * u)}"/>${lv.join('')}`;
  }
  const svg = `
  <svg class="tw-frame-svg" viewBox="0 0 ${f1(w)} ${f1(h)}" width="${f1(w)}" height="${f1(h)}">
    <defs>
      <linearGradient id="tw-emb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8987a"/><stop offset=".5" stop-color="#d9c1a0"/><stop offset="1" stop-color="#f0dcbc"/></linearGradient>
      <linearGradient id="tw-glassL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfd8de" stop-opacity=".55"/><stop offset=".6" stop-color="#fff7e6" stop-opacity=".7"/><stop offset="1" stop-color="#b9c6cf" stop-opacity=".5"/></linearGradient>
      <linearGradient id="tw-glassR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#cfd8de" stop-opacity=".55"/><stop offset=".6" stop-color="#fff7e6" stop-opacity=".7"/><stop offset="1" stop-color="#b9c6cf" stop-opacity=".5"/></linearGradient>
      <linearGradient id="tw-sill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2cdae"/><stop offset="1" stop-color="#b99b7c"/></linearGradient>
      <linearGradient id="tw-sillsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3626" stop-opacity=".35"/><stop offset="1" stop-color="#5a3626" stop-opacity="0"/></linearGradient>
      <linearGradient id="tw-terra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cf8466"/><stop offset="1" stop-color="#a65d43"/></linearGradient>
    </defs>
    ${band}
    ${casement(-1)}${casement(1)}
    ${sill}
    ${box}
    ${jar}
    ${ivy}
  </svg>`;
  // sheer curtains: separate layers so they can breathe in the breeze
  const curtW = hw * 0.62;
  const curtH = bottom - top + hw * 0.18;
  const curtain = (side) => `<div class="tw-curtain ${side < 0 ? 'l' : 'r'}" style="left:${f1(side < 0 ? cx - hw - rev * 1.2 : cx + hw + rev * 1.2 - curtW)}px;top:${f1(top - hw * 0.12)}px;width:${f1(curtW)}px;height:${f1(curtH)}px">${curtainSVG(curtW, curtH, side)}</div>`;
  const rod = `<div class="tw-rod" style="left:${f1(cx - hw - rev * 2)}px;top:${f1(top - hw * 0.14)}px;width:${f1(hw * 2 + rev * 4)}px;height:${f1(Math.max(3, u * 1.1))}px"></div>`;
  return { html: svg + rod + curtain(-1) + curtain(1), candle: { x: jx, y: jy - jh * 0.74 } };
}

function curtainSVG(w, h, side) {
  // gathered at a tie-back ~58% down; folds as soft vertical gradients
  const tie = h * 0.58;
  const narrow = w * 0.34;
  const outer = side < 0 ? 0 : w;
  const inner = side < 0 ? w : 0;
  const innerTie = side < 0 ? narrow : w - narrow;
  const d = `M${f1(outer)} 0 L${f1(inner)} 0 C ${f1(inner)} ${f1(tie * 0.5)}, ${f1(innerTie)} ${f1(tie * 0.8)}, ${f1(innerTie)} ${f1(tie)} C ${f1(innerTie)} ${f1(tie + h * 0.12)}, ${f1(side < 0 ? w * 0.7 : w * 0.3)} ${f1(h * 0.9)}, ${f1(side < 0 ? w * 0.62 : w * 0.38)} ${f1(h)} L${f1(outer)} ${f1(h)} Z`;
  const id = `tw-cur${side < 0 ? 'l' : 'r'}`;
  const folds = [0, 0.18, 0.34, 0.52, 0.7, 0.86, 1].map((o, i) => `<stop offset="${o}" stop-color="${i % 2 ? '#fff6e8' : '#f0dcc4'}"/>`).join('');
  const bowX = side < 0 ? narrow * 0.55 : w - narrow * 0.55;
  return `
  <svg viewBox="0 0 ${f1(w)} ${f1(h)}" width="100%" height="100%" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${folds}</linearGradient></defs>
    <path d="${d}" fill="url(#${id})" opacity=".78"/>
    <path d="${d}" fill="none" stroke="#e0c6a6" stroke-width="1" opacity=".5"/>
    <g transform="translate(${f1(bowX)} ${f1(tie)})" fill="#8a64b6">
      <ellipse rx="${f1(w * 0.09)}" ry="${f1(w * 0.05)}" transform="translate(${f1(-w * 0.08)} 0) rotate(-18)"/>
      <ellipse rx="${f1(w * 0.09)}" ry="${f1(w * 0.05)}" transform="translate(${f1(w * 0.08)} 0) rotate(18)"/>
      <circle r="${f1(w * 0.035)}" fill="#a984d0"/>
      <path d="M0 0 l ${f1(-w * 0.05)} ${f1(w * 0.2)} M0 0 l ${f1(w * 0.04)} ${f1(w * 0.22)}" stroke="#8a64b6" stroke-width="${f1(w * 0.025)}" stroke-linecap="round"/>
    </g>
  </svg>`;
}

/** An original skillet silhouette hanging by its handle (the easter egg). */
export function panSVG() {
  return `
  <svg class="tw-pan-svg" viewBox="0 0 60 150" aria-hidden="true">
    <defs>
      <radialGradient id="tw-pan-b" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#5b5552"/><stop offset=".55" stop-color="#2f2a29"/><stop offset="1" stop-color="#1c1817"/></radialGradient>
      <linearGradient id="tw-pan-h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2422"/><stop offset=".5" stop-color="#4c4542"/><stop offset="1" stop-color="#231e1c"/></linearGradient>
    </defs>
    <circle cx="30" cy="7" r="4.2" fill="none" stroke="#3a3230" stroke-width="2.4"/>
    <path d="M26.5 10 L25 66 Q30 70 35 66 L33.5 10 Q30 7.5 26.5 10 Z" fill="url(#tw-pan-h)"/>
    <rect x="25.6" y="58" width="8.8" height="6" rx="2" fill="#7a4b30"/>
    <circle cx="30" cy="105" r="29" fill="url(#tw-pan-b)"/>
    <circle cx="30" cy="105" r="29" fill="none" stroke="#c98a52" stroke-width="1.6" opacity=".55"/>
    <path d="M10 92 A 24 24 0 0 1 26 78" fill="none" stroke="#f3d6a8" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
    <g transform="translate(30 107)" opacity=".85">
      ${[0, 72, 144, 216, 288].map((a) => `<ellipse transform="rotate(${a}) translate(0 -5)" rx="3.1" ry="4.8" fill="#e59db2"/>`).join('')}
      <circle r="2.4" fill="#f5d283"/>
    </g>
  </svg>`;
}
