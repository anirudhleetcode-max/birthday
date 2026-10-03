// The album: extra memories added later, and every photo in the film.
import { esc } from '../core/art.js';

export function openGallery(ctx, { only = 'all' } = {}) {
  const { gsap, audio } = ctx;
  const t = ctx.text.credits || {};
  const extras = ctx.extras();
  const everything = ctx.allPhotos().filter((p) => !p.isPlaceholder);
  const showExtras = only === 'extras' || (only === 'all' && extras.length);
  const list = only === 'extras' ? extras : everything;

  const wrap = document.createElement('div');
  wrap.className = 'gal';
  wrap.innerHTML = `
    <div class="gal-head">
      <div>
        <p class="gal-kicker">${only === 'extras' ? esc(t.extrasSub || 'Memories added along the way') : 'The album'}</p>
        <h2 class="gal-title">${only === 'extras' ? esc(t.extrasTitle || 'More pages') : 'Every photo in this film'}</h2>
      </div>
      <button type="button" class="gal-close" aria-label="Close">✕</button>
    </div>
    <div class="gal-grid">
      ${list.map((p, i) => `
        <figure class="gal-item" data-i="${i}">
          <div class="ph" style="aspect-ratio:${p.ratio}"><img loading="lazy" alt="${esc(p.alt || '')}" src="${p.thumbUrl || p.url}" style="object-position:${p.objectPosition || '50% 40%'}"></div>
          ${p.caption || p.date ? `<figcaption>${esc(p.caption || '')}${p.date ? `<span class="gal-date">${esc(p.date)}</span>` : ''}</figcaption>` : ''}
        </figure>`).join('')}
      ${list.length ? '' : '<p class="gal-empty">More memories are on their way…</p>'}
    </div>
    <div class="gal-light" hidden><img alt=""><p></p></div>`;
  document.getElementById('ui').appendChild(wrap);
  audio.sfx('pageTurn');
  gsap.fromTo(wrap, { opacity: 0 }, { opacity: 1, duration: 0.6 });
  gsap.from(wrap.querySelectorAll('.gal-item'), { opacity: 0, y: 30, duration: 0.8, stagger: 0.04, ease: 'power3.out', delay: 0.2 });

  const light = wrap.querySelector('.gal-light');
  const lightImg = light.querySelector('img');
  const lightCap = light.querySelector('p');
  const opener = document.activeElement;
  let current = -1;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', only === 'extras' ? 'More memories' : 'Every photo in this film');
  light.setAttribute('role', 'dialog');
  light.setAttribute('aria-modal', 'true');
  light.tabIndex = -1;
  wrap.querySelectorAll('.gal-item').forEach((it) => { it.tabIndex = 0; it.setAttribute('role', 'button'); });
  const showAt = (i) => {
    if (!list.length) return;
    current = (i + list.length) % list.length;
    const p = list[current];
    lightImg.src = p.url;
    lightImg.alt = p.alt || '';
    lightCap.textContent = [p.caption, p.date].filter(Boolean).join(' · ');
    if (light.hidden) {
      light.hidden = false;
      gsap.fromTo(light, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    }
    gsap.fromTo(lightImg, { scale: 0.94, opacity: 0.4 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' });
    light.focus({ preventScroll: true });
    audio.sfx('tap');
  };
  const hideLight = () => {
    gsap.to(light, { opacity: 0, duration: 0.3, onComplete: () => (light.hidden = true) });
    const item = wrap.querySelector(`.gal-item[data-i="${current}"]`);
    item && item.focus({ preventScroll: true });
  };
  wrap.querySelector('.gal-grid').addEventListener('click', (e) => {
    const item = e.target.closest('.gal-item');
    if (item) showAt(Number(item.dataset.i));
  });
  light.addEventListener('click', hideLight);
  // swipe between photos
  let sx = null;
  light.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  light.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) { e.stopPropagation(); showAt(current + (dx < 0 ? 1 : -1)); }
  });
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    gsap.to(wrap, { opacity: 0, duration: 0.5, onComplete: () => wrap.remove() });
    opener && opener.focus && opener.focus({ preventScroll: true });
  };
  function onKey(e) {
    if (!light.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideLight(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); showAt(current + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); showAt(current - 1); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('gal-item')) {
      e.preventDefault(); e.stopPropagation(); showAt(Number(e.target.dataset.i)); return;
    }
    if (e.key === 'Tab') { // keep focus inside the album
      const f = [...wrap.querySelectorAll('button, .gal-item')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    if (['Enter', ' ', 'ArrowRight'].includes(e.key)) e.stopPropagation(); // don't trigger the film's Continue
  }
  window.addEventListener('keydown', onKey, true);
  wrap.querySelector('.gal-close').addEventListener('click', close);
  setTimeout(() => wrap.querySelector('.gal-close').focus({ preventScroll: true }), 50);
  ctx.signal.addEventListener('abort', () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); });
  return { close, showExtras };
}
