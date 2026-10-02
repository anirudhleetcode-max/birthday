// The very first screen: a quiet lantern, a greeting, and one button.
import { lanternSVG, esc } from '../core/art.js';
import { makeStars } from '../core/sky.js';

export default {
  id: 'invite',
  async enter(ctx, el) {
    const t = ctx.text.invite || {};
    const lines = t.lines || [];
    el.innerHTML = `
      <div class="inv-sky"></div>
      <div class="inv-wrap">
        <div class="inv-lantern">${lanternSVG()}</div>
        <h1 class="inv-greet">${esc(t.greeting || 'Hey you.')}</h1>
        <div class="inv-lines">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
        <button type="button" class="btn-gold inv-btn"><span>${esc(t.button || 'Light the lantern')}</span></button>
        <p class="inv-foot">🎧 &nbsp;sound on</p>
      </div>`;
    makeStars(el.querySelector('.inv-sky'), { count: 160 });
    const { gsap, fx } = ctx;
    fx.dust({ density: 0.3, alpha: 0.8 });

    const lantern = el.querySelector('.inv-lantern');
    const greet = el.querySelector('.inv-greet');
    const ps = el.querySelectorAll('.inv-lines p');
    const btn = el.querySelector('.inv-btn');
    const foot = el.querySelector('.inv-foot');

    const tl = gsap.timeline({ delay: 0.4 });
    tl.fromTo(lantern, { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 2.4, ease: 'power3.out' })
      .fromTo(greet, { opacity: 0, filter: 'blur(14px)', y: 16 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 1.8, ease: 'power3.out' }, '-=1.2')
      .fromTo(ps, { opacity: 0, y: 12, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3, stagger: 1.1, ease: 'power2.out' }, '-=0.4')
      .fromTo(btn, { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 1.2, ease: 'back.out(1.6)' }, '+=0.2')
      .fromTo(foot, { opacity: 0 }, { opacity: 0.6, duration: 1 }, '-=0.6');
    gsap.to(lantern, { rotation: 3, y: -6, duration: 3.2, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 0%' });

    // Sound must be unlocked synchronously inside the tap (iOS is strict about this).
    let soundReady;
    await new Promise((resolve) => btn.addEventListener('click', () => {
      soundReady = ctx.startSound();
      ctx.immersive();
      resolve();
    }, { once: true }));
    if (ctx.signal.aborted) return;
    tl.progress(1);
    btn.disabled = true;
    await soundReady;
    ctx.audio.sfx('magic');
    ctx.audio.setMood('hush');

    const svg = lantern.querySelector('.lantern-svg');
    svg.classList.add('is-lit');
    const r = lantern.getBoundingClientRect();
    fx.sparkle(r.left + r.width / 2, r.top + r.height * 0.75, 26, { spread: 80 });
    gsap.to([greet, ps, btn, foot], { opacity: 0, y: 10, filter: 'blur(8px)', duration: 1.2, stagger: 0.08, ease: 'power2.in' });
    gsap.killTweensOf(lantern);
    gsap.to(lantern, { scale: 1.12, duration: 1.2, ease: 'power2.out' });
    gsap.to(lantern, { y: -window.innerHeight * 0.95, x: 30, rotation: -4, scale: 0.55, duration: 4.2, delay: 1.2, ease: 'power1.in' });
    ctx.audio.sfx('lanternRise');
    await ctx.wait(2.6);
    ctx.next();
  },
  async exit() {},
};
