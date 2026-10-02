// Before her birthday: a lantern waiting for midnight, and a countdown.
import { lanternSVG, esc } from '../core/art.js';
import { makeStars, shootingStar } from '../core/sky.js';

const pad = (n) => String(n).padStart(2, '0');

export default {
  id: 'gate',
  async enter(ctx, el) {
    const site = ctx.site;
    const nick = (site.her?.nicknames || [])[2] || site.her?.name || 'you';
    const unlockAt = Date.parse(site.settings?.lock?.unlockAt);
    el.innerHTML = `
      <div class="inv-sky"></div>
      <div class="gate-wrap">
        <div class="inv-lantern gate-lantern">${lanternSVG()}</div>
        <p class="gate-kicker">Not yet, ${esc(nick)}.</p>
        <h1 class="gate-title">The lanterns rise in</h1>
        <div class="gate-count">
          <div><b data-u="d">--</b><span>days</span></div>
          <div><b data-u="h">--</b><span>hours</span></div>
          <div><b data-u="m">--</b><span>minutes</span></div>
          <div><b data-u="s">--</b><span>seconds</span></div>
        </div>
        <p class="gate-sub">Some lights are meant to rise at midnight.</p>
        <button type="button" class="btn-gold gate-btn" hidden>Open your gift</button>
      </div>`;
    const sky = el.querySelector('.inv-sky');
    makeStars(sky, { count: 200 });
    const { gsap, fx } = ctx;
    fx.dust({ density: 0.25 });
    const lantern = el.querySelector('.gate-lantern');
    gsap.to(lantern, { rotation: 3, y: -6, duration: 3.4, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 0%' });
    gsap.from(el.querySelectorAll('.gate-wrap > *'), { opacity: 0, y: 18, duration: 1.6, stagger: 0.18, ease: 'power3.out', clearProps: 'transform' });

    const units = Object.fromEntries([...el.querySelectorAll('[data-u]')].map((b) => [b.dataset.u, b]));
    const btn = el.querySelector('.gate-btn');
    let opened = false;
    const tick = () => {
      const left = Math.max(0, unlockAt - Date.now());
      const s = Math.floor(left / 1000);
      units.d.textContent = pad(Math.floor(s / 86400));
      units.h.textContent = pad(Math.floor((s % 86400) / 3600));
      units.m.textContent = pad(Math.floor((s % 3600) / 60));
      units.s.textContent = pad(s % 60);
      if (left <= 0 && !opened) {
        opened = true;
        lantern.querySelector('.lantern-svg').classList.add('is-lit');
        el.querySelector('.gate-kicker').textContent = 'It’s time.';
        el.querySelector('.gate-title').textContent = 'Happy birthday, sunshine';
        el.querySelector('.gate-count').style.opacity = '0.35';
        el.querySelector('.gate-sub').textContent = 'Headphones on. Lights low.';
        btn.hidden = false;
        gsap.fromTo(btn, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 1.2, ease: 'back.out(1.7)' });
        const r = lantern.getBoundingClientRect();
        fx.sparkle(r.left + r.width / 2, r.top + r.height * 0.7, 30, { spread: 90 });
      }
    };
    tick();
    this.timer = setInterval(tick, 1000);
    this.stars = setInterval(() => Math.random() < 0.5 && shootingStar(sky), 4200);
    btn.addEventListener('click', () => ctx.next(), { once: true });
  },
  async exit() {
    clearInterval(this.timer);
    clearInterval(this.stars);
  },
};
