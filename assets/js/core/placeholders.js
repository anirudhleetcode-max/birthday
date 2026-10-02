// Pretty stand-in images for slots that don't have a photo yet (only ever
// visible while the site is being prepared — the admin fills every slot).
const cache = new Map();

const PALETTES = [
  ['#3b1a57', '#6b3fa0', '#f4c463'],
  ['#24113d', '#8a5cc7', '#ffb347'],
  ['#2a1440', '#b9a3e3', '#f2a7c3'],
  ['#1d0f33', '#6b3fa0', '#ffe3a3'],
  ['#311748', '#c27bb0', '#f4c463'],
];

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function placeholderURL({ id = 'x', label = '', ratio = 1, index = 0 } = {}) {
  const key = `${id}|${ratio}`;
  if (cache.has(key)) return cache.get(key);

  const long = 640;
  const w = ratio >= 1 ? long : Math.round(long * ratio);
  const h = ratio >= 1 ? Math.round(long / ratio) : long;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const r = rand(hash(id));
  const [a, b, glow] = PALETTES[index % PALETTES.length];

  const bg = g.createLinearGradient(0, 0, w * 0.3, h);
  bg.addColorStop(0, a);
  bg.addColorStop(1, b);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // soft lantern bokeh
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 10 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255, 210, 140, ${0.18 + r() * 0.25})`);
    gr.addColorStop(1, 'rgba(255, 210, 140, 0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }

  // central warm glow
  const cx = w / 2;
  const cy = h * 0.45;
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
  rg.addColorStop(0, glow + 'aa');
  rg.addColorStop(0.35, glow + '33');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);

  // sun emblem line art
  const R = Math.min(w, h) * 0.13;
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = 'rgba(255, 236, 190, .85)';
  g.fillStyle = 'rgba(255, 236, 190, .18)';
  g.lineWidth = Math.max(2, R * 0.06);
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const len = i % 2 ? R * 0.55 : R * 0.9;
    g.beginPath();
    g.moveTo(Math.cos(ang) * R * 1.18, Math.sin(ang) * R * 1.18);
    g.lineTo(Math.cos(ang) * (R * 1.18 + len), Math.sin(ang) * (R * 1.18 + len));
    g.stroke();
  }
  g.restore();

  g.textAlign = 'center';
  g.fillStyle = 'rgba(255, 244, 224, .92)';
  g.font = `italic ${Math.round(Math.min(w, h) * 0.06)}px "Cormorant Garamond", Georgia, serif`;
  g.fillText('a memory goes here', cx, cy + R * 2.75);
  g.fillStyle = 'rgba(217, 200, 245, .75)';
  g.font = `${Math.round(Math.min(w, h) * 0.038)}px Cinzel, Georgia, serif`;
  const tag = (label || id).toUpperCase();
  g.fillText(tag.length > 34 ? tag.slice(0, 33) + '…' : tag, cx, cy + R * 3.35);

  const url = c.toDataURL('image/jpeg', 0.86);
  cache.set(key, url);
  return url;
}
