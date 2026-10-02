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
          <div class="ph" style="aspect-ratio:${p.ratio}"><img loading="lazy" alt="" src="${p.url}"></div>
          ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
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
  wrap.querySelector('.gal-grid').addEventListener('click', (e) => {
    const item = e.target.closest('.gal-item');
    if (!item) return;
    const p = list[Number(item.dataset.i)];
    lightImg.src = p.url;
    lightCap.textContent = p.caption || '';
    light.hidden = false;
    gsap.fromTo(light, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    gsap.fromTo(lightImg, { scale: 0.9 }, { scale: 1, duration: 0.6, ease: 'back.out(1.4)' });
    audio.sfx('tap');
  });
  light.addEventListener('click', () => gsap.to(light, { opacity: 0, duration: 0.3, onComplete: () => (light.hidden = true) }));
  const close = () => gsap.to(wrap, { opacity: 0, duration: 0.5, onComplete: () => wrap.remove() });
  wrap.querySelector('.gal-close').addEventListener('click', close);
  ctx.signal.addEventListener('abort', () => wrap.remove());
  return { close, showExtras };
}
