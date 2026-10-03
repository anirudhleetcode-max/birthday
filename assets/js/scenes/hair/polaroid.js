// Instant-film polaroids for the Golden Thread: a handwritten caption, a tiny
// handwritten date, and a developing effect (the chemical blank clears, a pale
// monochrome image rises, then the colour blooms in). Only opacity animates,
// so it stays cheap on phones. The photo itself is never altered.
import { esc } from '../../core/art.js';

/** Polaroid inner HTML for a photo. */
export function polaroidHTML(p) {
  const cap = String(p.caption || '').trim();
  const date = String(p.date || '').trim();
  return `
    <div class="hr-pol">
      <div class="hr-ph" style="aspect-ratio:${(p.ratio || 0.75).toFixed(4)}">
        <img class="hr-gray" alt="" aria-hidden="true" decoding="async" src="${esc(p.thumbUrl || p.url)}" style="object-position:${p.objectPosition}">
        <img class="hr-col" alt="${esc(p.alt)}" decoding="async" src="${esc(p.url)}" style="object-position:${p.objectPosition}">
        <div class="hr-chem"></div>
      </div>
      <div class="hr-cap">${cap ? `<span class="hr-capt">${esc(cap)}</span>` : ''}${date ? `<span class="hr-date">${esc(date)}</span>` : ''}</div>
    </div>`;
}

/** Develop a polaroid element (.hr-pol inside `root`). Returns the timeline. */
export function develop(root, gsap, { reduced = false, fast = false } = {}) {
  const chem = root.querySelector('.hr-chem');
  const gray = root.querySelector('.hr-gray');
  const col = root.querySelector('.hr-col');
  const capt = root.querySelector('.hr-capt');
  const date = root.querySelector('.hr-date');
  const tl = gsap.timeline();
  if (reduced) {
    tl.to(chem, { opacity: 0, duration: 0.9 }, 0).set(gray, { opacity: 0 }, 0).to(col, { opacity: 1, duration: 0.9 }, 0);
    if (capt) tl.to(capt, { opacity: 1, duration: 0.6 }, 0.4);
    if (date) tl.to(date, { opacity: 1, duration: 0.6 }, 0.6);
    return tl;
  }
  const k = fast ? 0.6 : 1;
  tl.to(chem, { opacity: 0, duration: 2.6 * k, ease: 'sine.inOut' }, 0.3 * k)
    .to(gray, { opacity: 1, duration: 1.4 * k, ease: 'sine.out' }, 0.2 * k)
    .to(col, { opacity: 1, duration: 2.4 * k, ease: 'sine.inOut' }, 1.3 * k)
    .to(gray, { opacity: 0, duration: 1 * k }, 3.2 * k);
  if (capt) tl.fromTo(capt, { opacity: 1, clipPath: 'inset(-20% 100% -20% 0)' }, { clipPath: 'inset(-20% 0% -20% 0)', duration: 1.5 * k, ease: 'power1.inOut' }, 1.9 * k);
  if (date) tl.to(date, { opacity: 1, duration: 0.8 * k }, 3 * k);
  return tl;
}

/** Mark a polaroid developed without animating. */
export function developed(root) {
  root.classList.add('is-dev');
}
