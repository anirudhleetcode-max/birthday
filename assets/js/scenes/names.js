// Chapter Three — A Girl of Many Names: Deepu, Pinky, Kuchu Puchu.
// A tiny chameleon friend watches, turns pink, and blushes.
import { chameleonSVG } from '../core/art.js';

const MOODS = [
  { a: '#1a0b2e', b: '#3b1a57', glow: 'rgba(244,196,99,.30)' },
  { a: '#2a0f2a', b: '#7a2f5c', glow: 'rgba(255,143,184,.38)' },
  { a: '#1f1238', b: '#5b3f8f', glow: 'rgba(255,227,163,.34)' },
];

const heartSVG = '<svg viewBox="0 0 32 29"><path d="M16 28 C6 20 0 14 0 8 C0 3 4 0 8.5 0 C12 0 14.5 2 16 4.5 C17.5 2 20 0 23.5 0 C28 0 32 3 32 8 C32 14 26 20 16 28 Z"/></svg>';

export default {
  id: 'names',
  title: 'A Girl of Many Names',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx } = ctx;
    const t = ctx.text.names || {};
    const items = (t.items || []).slice(0, 3);
    const ids = ['name-deepu', 'name-pinky', 'name-kuchu'];
    const photos = ids.map((id) => ctx.photo(id));
    await Promise.all(photos.map((p) => ctx.preload(p.url)));

    el.innerHTML = `
      <div class="nm-bg"></div>
      <div class="nm-glow"></div>
      <div class="nm-stage">
        <div class="nm-photo-wrap">${photos.map((p, i) => `<div class="nm-photo arch" data-i="${i}" style="aspect-ratio:${p.ratio}"><img alt="" src="${p.url}"></div>`).join('')}</div>
        <div class="nm-text">
          <p class="nm-line"></p>
          <h2 class="nm-name"></h2>
          <p class="nm-sub"></p>
        </div>
      </div>
      <div class="nm-pascal">${chameleonSVG()}</div>
      <div class="nm-hearts"></div>`;
    const bg = el.querySelector('.nm-bg');
    const glow = el.querySelector('.nm-glow');
    const pics = [...el.querySelectorAll('.nm-photo')];
    const line = el.querySelector('.nm-line');
    const nameEl = el.querySelector('.nm-name');
    const sub = el.querySelector('.nm-sub');
    const pascal = el.querySelector('.nm-pascal');
    const pupil = pascal.querySelector('.ch-pupil');
    const blush = pascal.querySelector('.ch-blush');
    const hearts = el.querySelector('.nm-hearts');

    const setMood = (i, d = 2) => gsap.to(el, { '--nm-a': MOODS[i].a, '--nm-b': MOODS[i].b, '--nm-glow': MOODS[i].glow, duration: d, ease: 'sine.inOut' });
    gsap.set(el, { '--nm-a': MOODS[0].a, '--nm-b': MOODS[0].b, '--nm-glow': MOODS[0].glow });
    gsap.set(pics, { autoAlpha: 0 });
    gsap.set(pascal, { yPercent: 110 });
    fx.dust({ density: 0.45 });
    audio.setMood('tender');

    await ui.chapterCard(t.kicker || 'Chapter Three', t.title || 'A Girl of Many Names');

    // the chameleon peeks in and looks around
    gsap.to(pascal, { yPercent: 18, duration: 1.6, ease: 'back.out(1.4)', delay: 1.2 });
    const look = gsap.timeline({ repeat: -1, repeatDelay: 1.4, delay: 3 });
    look.to(pupil, { attr: { cx: 175, cy: 76 }, duration: 0.5 }).to(pupil, { attr: { cx: 184, cy: 82 }, duration: 0.5, delay: 1 }).to(pupil, { attr: { cx: 181, cy: 79 }, duration: 0.5, delay: 0.8 });
    gsap.to(pascal.querySelector('.ch-tail'), { rotation: 8, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '70px 98px' });

    let prevPic = null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      setMood(i);
      // photo swap
      if (prevPic) gsap.to(prevPic, { autoAlpha: 0, scale: 0.92, filter: 'blur(10px)', duration: 1.1, ease: 'power2.in' });
      gsap.to([line, nameEl, sub], { opacity: 0, duration: 0.6 });
      await ctx.wait(prevPic ? 0.9 : 0.2);
      const pic = pics[i];
      gsap.set(pic, { autoAlpha: 1, filter: 'blur(0px)' });
      gsap.fromTo(pic, { opacity: 0, y: 30, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 1.6, ease: 'power3.out' });
      gsap.fromTo(pic.querySelector('img'), { clipPath: 'inset(100% 0 0 0)', scale: 1.25 }, { clipPath: 'inset(0% 0 0 0)', duration: 1.8, ease: 'power3.inOut' });
      gsap.to(pic.querySelector('img'), { scale: 1.04, duration: 8, ease: 'power1.out' });
      prevPic = pic;

      line.textContent = it.line || '';
      sub.textContent = it.sub || '';
      nameEl.textContent = '';
      nameEl.classList.toggle('long', String(it.name || '').length > 7);
      const chars = [];
      for (const ch of String(it.name || '')) {
        const s = document.createElement('span');
        s.className = 'nm-ch';
        s.textContent = ch === ' ' ? ' ' : ch;
        nameEl.appendChild(s);
        chars.push(s);
      }
      gsap.set(nameEl, { opacity: 1 });
      gsap.fromTo(line, { opacity: 0, y: 12, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2, delay: 0.6, ease: 'power2.out' });
      await ctx.wait(1.6);

      if (i === 2) {
        // Kuchu Puchu: bouncy and adorable
        gsap.fromTo(chars, { opacity: 0, y: -70, scale: 0.4, rotation: () => gsap.utils.random(-30, 30) }, { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 1.3, stagger: 0.08, ease: 'elastic.out(1.1, 0.45)' });
        audio.sfx('sparkle');
        setTimeout(() => {
          const r = nameEl.getBoundingClientRect();
          fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, 30, { spread: r.width / 2, pink: true });
          fx.colorBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2, colors: ['#ff8fb8', '#f2a7c3', '#ffe3a3', '#b9a3e3'], size: 0.7 });
        }, 900);
      } else {
        gsap.fromTo(chars, { opacity: 0, x: -10, filter: 'blur(10px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 1.4, stagger: 0.09, ease: 'power3.out' });
        audio.sfx('chime');
      }
      await ctx.wait(1.4);
      gsap.fromTo(sub, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1.4, ease: 'power2.out' });

      if (i === 1) {
        // the chameleon turns pink
        await ctx.wait(0.6);
        gsap.to(pascal, { '--skin': '#ff9ec4', '--skin-d': '#d8608f', '--belly': '#ffd6e6', duration: 2.2, ease: 'sine.inOut' });
        gsap.fromTo(pascal, { scale: 1 }, { scale: 1.08, duration: 0.3, yoyo: true, repeat: 1, transformOrigin: '50% 100%' });
        const r = pascal.getBoundingClientRect();
        fx.sparkle(r.left + r.width * 0.6, r.top + r.height * 0.3, 14, { spread: 60, pink: true });
      }
      if (i === 2) {
        await ctx.wait(0.4);
        gsap.to(blush, { opacity: 0.9, duration: 0.8 });
        gsap.to(pascal, { '--skin': '#f6b0d0', duration: 1.5 });
        const r = pascal.getBoundingClientRect();
        for (let h = 0; h < 9; h++) {
          const hEl = document.createElement('i');
          hEl.className = 'nm-heart';
          hEl.innerHTML = heartSVG;
          hearts.appendChild(hEl);
          gsap.fromTo(hEl, { x: r.left + r.width * 0.75, y: r.top + r.height * 0.2, scale: 0.2, opacity: 0 }, {
            x: `+=${gsap.utils.random(-80, 60)}`, y: `-=${gsap.utils.random(140, 300)}`, scale: gsap.utils.random(0.6, 1.2), opacity: 1,
            duration: gsap.utils.random(2.2, 3.4), delay: h * 0.18, ease: 'power1.out',
            onComplete: () => gsap.to(hEl, { opacity: 0, duration: 0.6, onComplete: () => hEl.remove() }),
          });
        }
      }
      await ctx.wait(i === 2 ? 4.2 : 3.6);
    }
    look.kill();
    gsap.to(pascal, { yPercent: 110, duration: 1.2, ease: 'back.in(1.4)' });
    await ui.waitContinue('Continue');
    ctx.next();
  },
  async exit() {},
};

