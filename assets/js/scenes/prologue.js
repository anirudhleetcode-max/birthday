// Prologue: a single drop of sunlight falls, a golden flower blooms,
// and from its light — her.
import { flowerSVG, sunEmblem, esc } from '../core/art.js';
import { makeStars, shootingStar } from '../core/sky.js';

export default {
  id: 'prologue',
  title: 'Once upon a time',
  async enter(ctx, el) {
    const { gsap, fx, ui, audio } = ctx;
    const t = ctx.text.prologue || {};
    const lines = t.lines || [];
    const her = ctx.site.her || {};
    const hero = ctx.photo('hero');
    await ctx.preload(hero.url);

    el.innerHTML = `
      <div class="pro-sky"><div class="pro-nebula"></div></div>
      <div class="pro-ground"></div>
      <div class="pro-drop"><i></i></div>
      <div class="pro-ring"></div>
      <div class="pro-flower">${flowerSVG()}</div>
      <div class="pro-bloomlight"></div>
      <div class="pro-reveal">
        <div class="pro-sun">${sunEmblem()}</div>
        <div class="pro-hero arch"><img alt="" src="${hero.url}"></div>
        <div class="pro-title">
          <h1 class="pro-name">${esc(her.name || 'Deepu')}</h1>
          <p class="pro-sub">${esc(t.titleSub || '')}</p>
          <p class="pro-date">03 &nbsp;·&nbsp; 01 &nbsp;·&nbsp; 2007</p>
        </div>
      </div>`;
    const sky = el.querySelector('.pro-sky');
    makeStars(sky, { count: 260 });
    ctx.letterbox(true);
    fx.dust({ density: 0.18 });
    audio.setMood('hush');
    const stars = setInterval(() => Math.random() < 0.6 && shootingStar(sky), 3500);
    ctx.signal.addEventListener('abort', () => clearInterval(stars));

    const drop = el.querySelector('.pro-drop');
    const flower = el.querySelector('.pro-flower');
    const fsvg = flower.querySelector('svg');
    const reveal = el.querySelector('.pro-reveal');
    const bloomlight = el.querySelector('.pro-bloomlight');

    gsap.set(drop, { opacity: 0 });
    gsap.set(flower, { opacity: 0 });
    gsap.set(reveal, { autoAlpha: 0 });
    gsap.fromTo(sky, { opacity: 0 }, { opacity: 1, duration: 3 });

    // 1 — once upon a time…
    await ui.narrate(lines.slice(0, 2), { position: 'center', style: 'big' });

    // 2 — a drop of sunlight appears high in the sky
    const W = window.innerWidth;
    const H = window.innerHeight;
    gsap.set(drop, { x: W * 0.62, y: H * 0.12, scale: 0.2 });
    gsap.to(drop, { opacity: 1, scale: 1, duration: 2.2, ease: 'power2.out' });
    audio.sfx('chime');
    await ui.narrate(lines.slice(2, 3), { position: 'top' });

    // 3 — it falls…
    const fall = gsap.to(drop, {
      duration: 4.2,
      ease: 'power1.in',
      motionPath: { path: [{ x: W * 0.62, y: H * 0.12 }, { x: W * 0.58, y: H * 0.35 }, { x: W * 0.47, y: H * 0.55 }, { x: W * 0.5, y: H * 0.74 }], curviness: 1.2 },
      onUpdate() {
        if (Math.random() < 0.55) {
          const x = gsap.getProperty(drop, 'x');
          const y = gsap.getProperty(drop, 'y');
          fx.sparkle(x, y, 1, { spread: 10 });
        }
      },
    });
    audio.sfx('whoosh');
    const fallLine = ui.narrate(lines.slice(3, 4), { position: 'top', hold: 2.6 });
    await fall.then();
    // 4 — impact & bloom
    audio.sfx('magic');
    audio.setMood('tender');
    fx.flash({ color: '#ffe3a3', duration: 0.9, peak: 0.55 });
    fx.sparkle(W * 0.5, H * 0.74, 40, { spread: 120 });
    gsap.to(drop, { scale: 3, opacity: 0, duration: 0.8, ease: 'power2.out' });
    const ring = el.querySelector('.pro-ring');
    gsap.fromTo(ring, { x: W * 0.5, y: H * 0.74, scale: 0, opacity: 0.9 }, { scale: 9, opacity: 0, duration: 2.2, ease: 'power2.out' });

    gsap.set(flower, { opacity: 1 });
    const stem = fsvg.querySelectorAll('.stem');
    const leaves = fsvg.querySelectorAll('.leaf');
    const outer = fsvg.querySelectorAll('.p1');
    const inner = fsvg.querySelectorAll('.p2');
    const aura = fsvg.querySelector('.fl-aura');
    const core = fsvg.querySelectorAll('.fl-core, .fl-dots');
    const bloom = gsap.timeline();
    bloom.fromTo(stem, { drawSVG: '0%' }, { drawSVG: '100%', duration: 2.2, ease: 'power2.inOut' })
      .fromTo(leaves, { scale: 0, transformOrigin: '100% 100%' }, { scale: 1, duration: 1.4, stagger: 0.3, ease: 'back.out(1.6)' }, 0.8)
      .fromTo(core, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.8, ease: 'back.out(2)' }, 1.6)
      .fromTo(outer, { scale: 0, skewX: -12, transformOrigin: '50% 100%' }, { scale: 1, skewX: 0, duration: 1.8, stagger: 0.09, ease: 'elastic.out(1, 0.6)' }, 1.8)
      .fromTo(inner, { scale: 0, transformOrigin: '50% 100%' }, { scale: 1, duration: 1.4, stagger: 0.08, ease: 'back.out(1.8)' }, 2.2)
      .fromTo(aura, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 0.9, scale: 1.1, duration: 2, ease: 'power2.out' }, 2.4);
    gsap.to(aura, { opacity: 0.45, scale: 1.25, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 4.4, transformOrigin: '50% 50%' });
    await fallLine.catch(() => {});
    await ui.narrate(lines.slice(4), { position: 'top' });
    await bloom.then();

    // 5 — the flower's light swells and becomes her
    audio.sfx('swell');
    gsap.to(bloomlight, { opacity: 1, scale: 1.4, duration: 2.6, ease: 'power2.in' });
    await ctx.wait(2.2);
    gsap.set(flower, { opacity: 0 });
    gsap.set(reveal, { autoAlpha: 1 });
    audio.setMood('wonder');
    const sun = el.querySelector('.pro-sun');
    const heroEl = el.querySelector('.pro-hero');
    const name = el.querySelector('.pro-name');
    const sub = el.querySelector('.pro-sub');
    const date = el.querySelector('.pro-date');
    const split = new SplitText(name, { type: 'chars' });
    const rv = gsap.timeline();
    rv.to(bloomlight, { opacity: 0, scale: 2.2, duration: 3, ease: 'power2.out' }, 0)
      .fromTo(heroEl, { clipPath: 'circle(0% at 50% 60%)', scale: 1.15, filter: 'brightness(2.4) blur(8px)' }, { clipPath: 'circle(75% at 50% 60%)', scale: 1, filter: 'brightness(1) blur(0px)', duration: 3.2, ease: 'power3.out' }, 0.1)
      .fromTo(sun, { scale: 0.3, opacity: 0, rotation: -40 }, { scale: 1, opacity: 1, rotation: 0, duration: 3.4, ease: 'power3.out' }, 0.3)
      .fromTo(split.chars, { opacity: 0, y: 30, filter: 'blur(14px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6, stagger: 0.12, ease: 'power3.out' }, 1.6)
      .fromTo(sub, { opacity: 0, letterSpacing: '0.7em' }, { opacity: 1, letterSpacing: '0.32em', duration: 2.2, ease: 'power3.out' }, 2.6)
      .fromTo(date, { opacity: 0 }, { opacity: 0.75, duration: 1.6 }, 3.4);
    gsap.to(sun.querySelector('.sun-rays'), { rotation: 360, duration: 120, repeat: -1, ease: 'none', transformOrigin: '50% 50%' });
    gsap.to(sun, { scale: 1.04, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 3.5 });
    gsap.to(heroEl.querySelector('img'), { scale: 1.07, duration: 14, ease: 'none', delay: 0.5 });
    setTimeout(() => {
      const r = heroEl.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + 10, 24, { spread: r.width * 0.5 });
    }, 1800);
    await rv.then();
    await ctx.wait(1.5);
    await ui.waitContinue('Begin her story');
    ctx.next();
  },
  async exit() {},
};
