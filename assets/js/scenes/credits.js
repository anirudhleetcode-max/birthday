// End credits, like the end of a film: photos drift by in slow Ken Burns
// while the credits roll. Then: "The end of chapter nineteen."
import { esc } from '../core/art.js';

export default {
  id: 'credits',
  title: 'Credits',
  async enter(ctx, el) {
    const { gsap, audio, fx, device } = ctx;
    const t = ctx.text.credits || {};
    const photos = ctx.allPhotos();
    const real = photos.filter((p) => !p.isPlaceholder);
    const reel = (real.length ? real : photos).slice();
    const extras = ctx.extras();

    el.innerHTML = `
      <div class="cr-reel"><div class="cr-frame"></div></div>
      <div class="cr-shade"></div>
      <div class="cr-roll"><div class="cr-list">
        ${(t.lines || []).map(([role, name]) => `
          <div class="cr-item">${role ? `<p class="cr-role">${esc(role)}</p>` : ''}<p class="cr-name ${role ? '' : 'cr-note'}">${esc(name)}</p></div>`).join('')}
      </div></div>
      <div class="cr-end">
        <p class="cr-the-end">${esc(t.end || '')}</p>
        <p class="cr-end-sub">${esc(t.endSub || '')}</p>
        <div class="cr-actions">
          ${extras.length ? `<button type="button" class="btn-gold cr-more">${esc(t.extrasTitle || 'More memories')}</button>` : ''}
          <button type="button" class="btn-ghost cr-album">Every photo</button>
          <button type="button" class="btn-ghost cr-again">↺ &nbsp;Watch again</button>
        </div>
      </div>`;

    const frame = el.querySelector('.cr-frame');
    const list = el.querySelector('.cr-list');
    const end = el.querySelector('.cr-end');
    gsap.set(end, { autoAlpha: 0 });
    ctx.letterbox(true);
    fx.dust({ density: 0.3 });
    audio.setMood('tender');

    // Ken Burns slideshow
    let idx = 0;
    let stopped = false;
    const show = async () => {
      if (stopped || !reel.length) return;
      const p = reel[idx % reel.length];
      idx++;
      await ctx.preload(p.url);
      if (stopped) return;
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = '';
      frame.appendChild(img);
      const dir = idx % 2 ? 1 : -1;
      gsap.fromTo(img, { opacity: 0, scale: 1.18, xPercent: -3 * dir, yPercent: 2 }, { opacity: 1, scale: 1.04, xPercent: 3 * dir, yPercent: -2, duration: 6.5, ease: 'none' });
      gsap.to(img, { opacity: 0, duration: 1.4, delay: 5.2, onComplete: () => img.remove() });
      this.timer = setTimeout(show, 4300);
    };
    show();
    this.cleanup = () => { stopped = true; clearTimeout(this.timer); };

    await ctx.wait(1.2);
    // roll
    const rollH = list.scrollHeight;
    const vh = window.innerHeight;
    const duration = Math.max(26, (rollH + vh) / (device.mobile ? 34 : 40));
    await gsap.fromTo(list, { y: vh * 0.9 }, { y: -rollH - 20, duration, ease: 'none' }).then();

    // the end
    audio.setMood('quiet');
    gsap.to(el.querySelector('.cr-reel'), { opacity: 0.25, duration: 2 });
    gsap.set(end, { autoAlpha: 1 });
    const theEnd = end.querySelector('.cr-the-end');
    const sub = end.querySelector('.cr-end-sub');
    const acts = end.querySelector('.cr-actions');
    gsap.fromTo(theEnd, { opacity: 0, filter: 'blur(12px)', letterSpacing: '0.4em' }, { opacity: 1, filter: 'blur(0px)', letterSpacing: '0.12em', duration: 2.6, ease: 'power3.out' });
    await ctx.wait(2.6);
    audio.sfx('magic');
    audio.setMood('tender');
    gsap.fromTo(sub, { opacity: 0, scale: 0.9, filter: 'blur(10px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 2.2, ease: 'power3.out' });
    setTimeout(() => {
      const r = sub.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, 34, { spread: r.width / 2 });
    }, 900);
    gsap.fromTo(acts, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.2, delay: 2.4 });

    const more = end.querySelector('.cr-more');
    more && more.addEventListener('click', () => ctx.openGallery({ only: 'extras' }));
    end.querySelector('.cr-album').addEventListener('click', () => ctx.openGallery({ only: 'all' }));
    end.querySelector('.cr-again').addEventListener('click', () => ctx.restart());
  },
  async exit() {
    this.cleanup && this.cleanup();
  },
};
