// The sunset landscape the Golden Thread travels through — original art in
// parallax layers: a gold/rose/violet sky with a low sun and lit cloud
// streaks, far violet mountains with the tower on its rock (one warm window),
// rolling plum hills with tree clumps, and dark wildflower grass in front.
import { towerSVG } from '../../core/art.js';

const f1 = (v) => Number(v).toFixed(1);
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** A smooth-ish ridge path across width w (1 point every `step` px), filled to the bottom. */
function ridge(w, h, base, amp, step, seed, { sharp = 0 } = {}) {
  const r = rng(seed);
  const n = Math.max(2, Math.ceil(w / step));
  const ph = [r() * 6, r() * 6, r() * 6];
  let d = `M0 ${f1(h)}`;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const t = x / 900;
    let y = base - amp * (0.5 + 0.28 * Math.sin(t * 2.1 + ph[0]) + 0.16 * Math.sin(t * 5.3 + ph[1]) + 0.06 * Math.sin(t * 13 + ph[2]));
    if (sharp) y -= amp * sharp * Math.max(0, Math.sin(t * 3.7 + ph[1])) ** 6;
    d += ` L${f1(x)} ${f1(y)}`;
  }
  return `${d} L${f1(w)} ${f1(h)} Z`;
}

/**
 * Build the layers inside `root`. Returns [{ el, k }] — k is the parallax factor
 * (1 = moves with the polaroids).
 */
export function buildScenery(root, { vw, vh, travel, reduced, low }) {
  const H = vh;
  const hz = H * 0.76; // the horizon
  const layers = [];
  const add = (cls, k, html, w) => {
    const el = document.createElement('div');
    el.className = `hr-layer ${cls}`;
    if (w) el.style.width = `${w}px`;
    el.innerHTML = html;
    root.appendChild(el);
    layers.push({ el, k: reduced ? 0 : k });
    return el;
  };

  // sky (barely moves)
  const r = rng(11);
  let clouds = '';
  for (let i = 0; i < (low ? 4 : 7); i++) {
    const cw = vw * (0.35 + r() * 0.5);
    const ch = H * (0.012 + r() * 0.02);
    const x = r() * vw * 1.2 - vw * 0.1;
    const y = H * (0.18 + r() * 0.4);
    clouds += `<i class="hr-streak" style="left:${f1(x)}px;top:${f1(y)}px;width:${f1(cw)}px;height:${f1(ch)}px;opacity:${(0.35 + r() * 0.45).toFixed(2)}"></i>`;
  }
  add('hr-sky', 0.015, `<div class="hr-sun" style="left:${f1(vw * 0.68)}px;top:${f1(hz - H * 0.07)}px"></div>${clouds}`, vw * 1.2);

  // far mountains + the tower on its rock
  const farW = Math.ceil(vw * 1.3 + travel * 0.07);
  const towerH = H * 0.2;
  const towerX = vw * (vh > vw ? 0.7 : 0.62);
  add('hr-far', 0.07, `
    <svg width="${farW}" height="${H}" viewBox="0 0 ${farW} ${H}">
      <defs>
        <linearGradient id="hr-mf1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a3628a"/><stop offset="1" stop-color="#c98a8a"/></linearGradient>
        <linearGradient id="hr-mf2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4277"/><stop offset="1" stop-color="#93577e"/></linearGradient>
      </defs>
      <path d="${ridge(farW, H, hz - H * 0.02, H * 0.09, 40, 3, { sharp: 0.5 })}" fill="url(#hr-mf1)" opacity=".75"/>
      <path d="${ridge(farW, H, hz + H * 0.02, H * 0.07, 40, 8)}" fill="url(#hr-mf2)"/>
    </svg>
    <div class="hr-towerwrap" style="left:${f1(towerX)}px;top:${f1(hz + H * 0.03 - towerH)}px;height:${f1(towerH)}px">${towerSVG({ className: 'hr-tower' })}</div>`, farW);

  // rolling hills with clumps of trees
  const midW = Math.ceil(vw * 1.3 + travel * 0.22);
  const rt = rng(5);
  let trees = '';
  const treeN = Math.round(midW / (low ? 160 : 110));
  for (let i = 0; i < treeN; i++) {
    const x = rt() * midW;
    const s = H * (0.014 + rt() * 0.018);
    const y = hz + H * 0.07 + Math.sin(x / 300) * H * 0.012;
    if (rt() < 0.45) trees += `<ellipse cx="${f1(x)}" cy="${f1(y - s * 1.7)}" rx="${f1(s * 0.42)}" ry="${f1(s * 1.8)}"/>`;
    else trees += `<circle cx="${f1(x)}" cy="${f1(y - s)}" r="${f1(s)}"/><circle cx="${f1(x + s * 0.9)}" cy="${f1(y - s * 0.7)}" r="${f1(s * 0.75)}"/>`;
  }
  add('hr-mid', 0.22, `
    <svg width="${midW}" height="${H}" viewBox="0 0 ${midW} ${H}">
      <defs><linearGradient id="hr-mh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d2c5c"/><stop offset=".35" stop-color="#46204b"/><stop offset="1" stop-color="#2c1434"/></linearGradient></defs>
      <g fill="#4d244f">${trees}</g>
      <path d="${ridge(midW, H, hz + H * 0.1, H * 0.06, 30, 21)}" fill="url(#hr-mh)"/>
    </svg>`, midW);

  // foreground grass and wildflowers (a tile repeated along the whole journey)
  const tileW = 640;
  const tileH = Math.round(H * 0.16);
  const rg = rng(77);
  let blades = '';
  for (let i = 0; i < 110; i++) {
    const x = rg() * tileW;
    const hh = tileH * (0.25 + rg() * 0.6);
    const lean = (rg() - 0.5) * 18;
    blades += `<path d="M${f1(x - 2)} ${tileH} Q ${f1(x + lean * 0.4)} ${f1(tileH - hh * 0.6)} ${f1(x + lean)} ${f1(tileH - hh)} Q ${f1(x + lean * 0.3 + 1.5)} ${f1(tileH - hh * 0.5)} ${f1(x + 2)} ${tileH} Z"/>`;
  }
  let blooms = '';
  for (let i = 0; i < 16; i++) {
    const x = rg() * tileW;
    const y = tileH * (0.2 + rg() * 0.45);
    const s = 2.5 + rg() * 3;
    const col = ['#f2a7c3', '#ffe3a3', '#b9a3e3', '#fff4e0'][i % 4];
    blooms += `<path d="M${f1(x)} ${tileH} Q ${f1(x + 3)} ${f1((y + tileH) / 2)} ${f1(x)} ${f1(y)}" stroke="#1d0c26" stroke-width="1.4" fill="none"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(s)}" fill="${col}" opacity=".85"/>`;
  }
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}" viewBox="0 0 ${tileW} ${tileH}"><g fill="#1b0b24">${blades}</g>${blooms}</svg>`;
  const nearW = Math.ceil(vw * 1.3 + travel * 1.3);
  const near = add('hr-near', 1.3, '', nearW);
  near.style.height = `${tileH}px`;
  near.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(tile)}")`;
  near.style.backgroundSize = `${tileW}px ${tileH}px`;
  return layers;
}
