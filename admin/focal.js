/**
 * focal.js — focal point picker. Tap / click / drag on the image, or use the arrow keys
 * (Shift = bigger steps, Home = reset). Shows a ring; values are normalised 0..1 in the
 * DISPLAY image, so the film can use them as `object-position`.
 *
 *   const fp = focalPicker({ focal, onchange, label })
 *   fp.el            → the element (put the preview canvas/img inside with fp.setMedia(node))
 *   fp.set({x, y})   → move the ring without firing onchange
 */
import { h } from './ui.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const pct = (v) => `${Math.round(v * 100)}%`;

export function describeFocal(f) {
  const xs = f.x < 0.36 ? 'left' : f.x > 0.64 ? 'right' : 'centre';
  const ys = f.y < 0.36 ? 'top' : f.y > 0.64 ? 'bottom' : 'middle';
  return `${pct(f.x)} across, ${pct(f.y)} down (${ys === 'middle' && xs === 'centre' ? 'centre' : `${ys} ${xs}`})`;
}

export function focalPicker({ focal = { x: 0.5, y: 0.4 }, onchange = () => {}, label = 'Focal point' } = {}) {
  let f = { x: clamp01(focal.x), y: clamp01(focal.y) };
  const ring = h('span.focal-ring', { 'aria-hidden': 'true' }, h('span.focal-dot'));
  const media = h('div.focal-media');
  const readout = h('span.focal-readout', { 'aria-live': 'polite' });
  const el = h('div.focal-pick', {
    tabindex: '0', role: 'group', 'data-testid': 'focal-picker',
    'aria-label': `${label}. Tap the face, or use the arrow keys to move the focal point.`,
    'aria-describedby': null,
  }, media, ring);
  const wrap = h('div.focal-wrap', el, h('p.focal-caption', h('span', 'Focal point: '), readout));

  function paint() {
    ring.style.left = `${f.x * 100}%`;
    ring.style.top = `${f.y * 100}%`;
    readout.textContent = describeFocal(f);
    el.dataset.x = f.x.toFixed(3);
    el.dataset.y = f.y.toFixed(3);
  }
  function setFrom(e) {
    const r = media.getBoundingClientRect();
    if (!r.width || !r.height) return;
    f = { x: Math.round(clamp01((e.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(clamp01((e.clientY - r.top) / r.height) * 1000) / 1000 };
    paint();
  }
  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('dragging');
    setFrom(e);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => { if (dragging) setFrom(e); });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    onchange({ ...f });
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    let used = true;
    if (e.key === 'ArrowLeft') f.x = clamp01(f.x - step);
    else if (e.key === 'ArrowRight') f.x = clamp01(f.x + step);
    else if (e.key === 'ArrowUp') f.y = clamp01(f.y - step);
    else if (e.key === 'ArrowDown') f.y = clamp01(f.y + step);
    else if (e.key === 'Home') f = { x: 0.5, y: 0.4 };
    else used = false;
    if (!used) return;
    e.preventDefault();
    f = { x: Math.round(f.x * 1000) / 1000, y: Math.round(f.y * 1000) / 1000 };
    paint();
    onchange({ ...f });
  });
  paint();
  return {
    el: wrap,
    picker: el,
    set(v) { f = { x: clamp01(v.x), y: clamp01(v.y) }; paint(); },
    get() { return { ...f }; },
    setMedia(node) { media.replaceChildren(node); },
  };
}
