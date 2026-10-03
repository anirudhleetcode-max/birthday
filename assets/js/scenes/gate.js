// Before her birthday: a night lake, twenty small unlit lanterns waiting on the
// water (one for every year) and the main lantern above them. At midnight IST a
// golden spark travels from the first year to the twentieth, lighting each one,
// then climbs to the main lantern. No sound here — nothing plays before a tap.
import { esc } from '../core/art.js';
import { shootingStar } from '../core/sky.js';
import { nightscape, lanternArt, lightLantern, words, LANTERN_BODY } from './invite.js';

const YEARS = 20;
const pad = (n) => String(n).padStart(2, '0');

export default {
  id: 'gate',
  async enter(ctx, el) {
    const { gsap, fx, device } = ctx;
    const reduced = device.reducedMotion;
    const t = ctx.text.gate || {};
    const unlockAt = Date.parse(ctx.site.settings?.lock?.unlockAt);
    const txt = {
      kicker: words(ctx, t.kicker, 'Not yet, {nick1}.'),
      title: words(ctx, t.title, 'The lanterns rise in'),
      sub: words(ctx, t.sub, 'Some lights are meant to rise at midnight.'),
      openKicker: words(ctx, t.openKicker, 'It’s time, {name}.'),
      openTitle: words(ctx, t.openTitle, 'Happy birthday, {name}.'),
      openSub: words(ctx, t.openSub, 'Twenty lanterns, one for every year of you.'),
      button: words(ctx, t.button, 'Open your gift'),
    };
    const unit = (u, label) => `<div class="gc-unit"><span class="gc-num" data-u="${u}"></span><span class="gc-label" data-l="${label}">${label}</span></div>`;
    el.innerHTML = `
      <div class="gate-copy">
        <p class="gate-kicker">${esc(txt.kicker)}</p>
        <h1 class="gate-title">${esc(txt.title)}</h1>
        <div class="gate-count" role="timer" aria-live="off">
          ${unit('d', 'days')}<i class="gc-sep" aria-hidden="true"></i>${unit('h', 'hours')}<i class="gc-sep" aria-hidden="true"></i>${unit('m', 'minutes')}<i class="gc-sep" aria-hidden="true"></i>${unit('s', 'seconds')}
        </div>
        <p class="gate-sub">${esc(txt.sub)}</p>
      </div>
      <div class="inv-refl gate-refl" aria-hidden="true"></div>
      <div class="gate-lantern" aria-hidden="true"><div class="gate-lantern-in">${lanternArt({ className: 'gate-lt' })}</div></div>
      <svg class="gate-arc" aria-hidden="true"></svg>
      <div class="gate-spark" aria-hidden="true"></div>
      <div class="gate-cta"><button type="button" class="gate-btn" hidden><span class="gb-orb" aria-hidden="true"></span><span>${esc(txt.button)}</span></button></div>`;
    const world = nightscape(el, { device, stars: 220 });
    el.prepend(world.root);
    fx.dust({ density: 0.2, alpha: 0.7, speed: 0.5 });

    const copy = el.querySelector('.gate-copy');
    const kickerEl = el.querySelector('.gate-kicker');
    const titleEl = el.querySelector('.gate-title');
    const countEl = el.querySelector('.gate-count');
    const subEl = el.querySelector('.gate-sub');
    const lanternBox = el.querySelector('.gate-lantern-in');
    const mainSvg = el.querySelector('.gate-lt');
    const refl = el.querySelector('.gate-refl');
    const arc = el.querySelector('.gate-arc');
    const spark = el.querySelector('.gate-spark');
    const btn = el.querySelector('.gate-btn');
    const warm = world.root.querySelector('.ns-warm');
    const timers = [];
    this.timers = timers;
    this.tweens = [];
    this.cleanup = [];
    const track = (tw) => (this.tweens.push(tw), tw);

    /* ---------- the twenty lanterns on the water ---------- */
    let lit = 0; // how many are lit (kept across re-layouts)
    let pts = [];
    function arcPoints() {
      const { W, H, hy } = world;
      const wh = H - hy;
      const portrait = H > W;
      const Rx = portrait ? W * 0.42 : Math.min(W * 0.34, H * 0.62);
      const yNear = hy + wh * 0.8;
      const yFar = hy + wh * 0.17;
      // dense semi-ellipse, then 20 points equally spaced along it
      const dense = [];
      for (let i = 0; i <= 400; i++) {
        const th = Math.PI * (1 - i / 400);
        dense.push({ x: W / 2 + Rx * Math.cos(th), y: yNear - (yNear - yFar) * Math.sin(th), z: Math.sin(th) });
      }
      const cum = [0];
      for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, (dense[i].y - dense[i - 1].y) * 2.2));
      const total = cum[cum.length - 1];
      const sNear = Math.max(19, Math.min(36, wh * 0.15, W * 0.06));
      const out = [];
      let j = 0;
      for (let k = 0; k < YEARS; k++) {
        const target = (k / (YEARS - 1)) * total;
        while (j < cum.length - 1 && cum[j + 1] < target) j++;
        const p = dense[j];
        const s = sNear * (1 - 0.52 * p.z);
        out.push({ x: p.x, y: p.y, s });
      }
      return out;
    }

    function drawArc() {
      const { W, H } = world;
      pts = arcPoints();
      arc.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const blur = device.tier !== 'low';
      const g = pts.map((p, i) => {
        const k = p.s / 140;
        const hover = p.s * 0.16;
        return `
        <g class="gl" data-i="${i}">
          <ellipse class="gl-refl" cx="${p.x.toFixed(1)}" cy="${(p.y + p.s * 0.55).toFixed(1)}" rx="${(p.s * 0.2).toFixed(1)}" ry="${(p.s * 0.62).toFixed(1)}" fill="url(#gr-r)" ${blur ? 'filter="url(#gr-b)"' : ''}/>
          <g class="sl-bob" style="animation-delay:${(-i * 0.41).toFixed(2)}s">
            <g transform="translate(${(p.x - 50 * k).toFixed(2)} ${(p.y - hover - 124 * k).toFixed(2)}) scale(${k.toFixed(4)})">
              <circle class="gl-halo" cx="50" cy="78" r="120" fill="url(#gr-h)" opacity="0"/>
              <use href="#gr-body" fill="url(#gr-d)"/>
              <use class="gl-lit" href="#gr-body" fill="url(#gr-l)" opacity="0"/>
              <use href="#gr-body" fill="none" stroke="#b9a3e3" stroke-opacity=".38" stroke-width="${(0.8 / k).toFixed(2)}" class="gl-edge"/>
              <ellipse class="gl-flame" cx="50" cy="110" rx="9" ry="14" fill="url(#gr-f)" opacity="0"/>
            </g>
          </g>
          <circle class="sl-hit" cx="${p.x.toFixed(1)}" cy="${(p.y - p.s * 0.5).toFixed(1)}" r="${Math.max(16, p.s * 0.75).toFixed(1)}" fill="transparent"/>
        </g>`;
      }).join('');
      arc.innerHTML = `
        <defs>
          <path id="gr-body" d="${LANTERN_BODY}"/>
          <linearGradient id="gr-d" x1="0" y1="0" x2="1" y2=".4">
            <stop offset="0" stop-color="#4c3e86"/><stop offset=".35" stop-color="#261d52"/><stop offset="1" stop-color="#140f33"/>
          </linearGradient>
          <linearGradient id="gr-l" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stop-color="#fff3cf"/><stop offset=".35" stop-color="#ffcf7c"/><stop offset=".75" stop-color="#ffa04a"/><stop offset="1" stop-color="#e26a3a"/>
          </linearGradient>
          <radialGradient id="gr-h" cx="50" cy="78" r="120" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffe2a0" stop-opacity=".75"/><stop offset=".4" stop-color="#ffb35c" stop-opacity=".22"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="gr-f"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#ffe7a0"/><stop offset="1" stop-color="#ffa040" stop-opacity="0"/></radialGradient>
          <linearGradient id="gr-r" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffd890" stop-opacity=".0"/><stop offset=".2" stop-color="#ffd890" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
          </linearGradient>
          ${blur ? '<filter id="gr-b" x="-100%" y="-30%" width="300%" height="160%"><feGaussianBlur stdDeviation="1.2 2"/></filter>' : ''}
        </defs>
        ${g}`;
      arc.querySelectorAll('.gl-refl').forEach((r) => gsap.set(r, { opacity: 0.12 }));
      for (let i = 0; i < lit; i++) setLit(i, true);
    }

    function setLit(i, instant = false) {
      const gEl = arc.querySelector(`.gl[data-i="${i}"]`);
      if (!gEl) return;
      const d = instant ? 0 : reduced ? 0.5 : 0.55;
      gsap.to(gEl.querySelector('.gl-lit'), { opacity: 1, duration: d, ease: 'power2.out' });
      gsap.to(gEl.querySelector('.gl-edge'), { attr: { 'stroke-opacity': 0 }, duration: d });
      gsap.to(gEl.querySelector('.gl-flame'), { opacity: 1, duration: d * 0.6 });
      gsap.fromTo(gEl.querySelector('.gl-halo'), { opacity: instant ? 1 : 0 }, { opacity: 1, duration: d * 1.6, ease: 'power2.out' });
      gsap.to(gEl.querySelector('.gl-refl'), { opacity: 0.9, duration: d * 1.4 });
    }

    /* ---------- layout ---------- */
    const placeRefl = () => {
      const r = lanternBox.getBoundingClientRect();
      refl.style.left = `${r.left + r.width / 2}px`;
      refl.style.width = `${r.width * 0.7}px`;
      refl.style.marginLeft = `${-r.width * 0.35}px`;
    };
    drawArc();
    placeRefl();
    let rz = 0;
    const onResize = () => {
      cancelAnimationFrame(rz);
      rz = requestAnimationFrame(() => { world.layout(); drawArc(); placeRefl(); });
    };
    window.addEventListener('resize', onResize);
    this.cleanup.push(() => { window.removeEventListener('resize', onResize); cancelAnimationFrame(rz); });

    /* ---------- entrance ---------- */
    const D = reduced ? 0.4 : 1;
    const intro = gsap.timeline({ delay: 0.2 });
    track(intro);
    intro.fromTo(world.root, { opacity: 0 }, { opacity: 1, duration: 2.2 * D }, 0)
      .fromTo(arc.querySelectorAll('.gl'), { opacity: 0 }, { opacity: 1, duration: 1.4 * D, stagger: { each: 0.05 * D, from: 'center' } }, 0.6 * D)
      .fromTo(lanternBox, { opacity: 0, y: reduced ? 0 : 20 }, { opacity: 1, y: 0, duration: 2.4 * D, ease: 'power3.out' }, 0.5 * D)
      .fromTo(refl, { opacity: 0 }, { opacity: 0.25, duration: 2 * D }, 1 * D)
      .fromTo([...copy.children], { opacity: 0, y: reduced ? 0 : 14, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.5 * D, stagger: 0.18 * D, ease: 'power3.out', clearProps: 'transform,filter' }, 0.9 * D);
    if (!reduced) {
      track(gsap.to(lanternBox, { rotation: 1.8, y: -6, duration: 3.8, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 10%', delay: 2.6 }));
      timers.push(setInterval(() => Math.random() < 0.35 && shootingStar(world.root.querySelector('.ns-stars')), 5600));
    }

    /* ---------- "not yet" — tapping a lantern before midnight ---------- */
    const notYet = (e) => {
      if (opened) return;
      const hit = e.target.closest && e.target.closest('.gl');
      if (!hit) return;
      const flame = hit.querySelector('.gl-flame');
      const bob = hit.querySelector('.sl-bob > g');
      gsap.timeline()
        .to(flame, { opacity: 0.85, duration: 0.12 })
        .to(flame, { opacity: 0, duration: 0.7, ease: 'power2.in' });
      if (!reduced) gsap.fromTo(bob, { y: 0 }, { y: -4, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.out' });
    };
    arc.addEventListener('pointerdown', notYet);
    const wobble = () => {
      if (opened || reduced) return;
      gsap.fromTo(mainSvg, { rotation: 0 }, { rotation: 4, duration: 0.35, yoyo: true, repeat: 3, ease: 'sine.inOut', transformOrigin: '50% 0%', clearProps: 'transform' });
      gsap.fromTo(mainSvg.querySelector('.lt-ember'), { scale: 1 }, { scale: 1.8, duration: 0.25, yoyo: true, repeat: 1, svgOrigin: '50 126' });
    };
    lanternBox.addEventListener('pointerdown', wobble);
    this.cleanup.push(() => { arc.removeEventListener('pointerdown', notYet); lanternBox.removeEventListener('pointerdown', wobble); });

    /* ---------- the countdown ---------- */
    const nums = Object.fromEntries([...el.querySelectorAll('[data-u]')].map((b) => [b.dataset.u, b]));
    const labels = Object.fromEntries([...el.querySelectorAll('[data-l]')].map((b) => [b.dataset.l, b]));
    const shown = {};
    const setUnit = (u, value, label) => {
      const str = pad(value);
      const prev = shown[u];
      if (prev === str) return;
      shown[u] = str;
      const node = nums[u];
      if (!prev || prev.length !== str.length) {
        node.innerHTML = [...str].map((c) => `<i>${c}</i>`).join('');
      } else {
        [...str].forEach((c, i) => {
          if (prev[i] === c) return;
          const d = node.children[i];
          d.textContent = c;
          if (!reduced) gsap.fromTo(d, { opacity: 0.15, y: '-0.14em', filter: 'blur(3px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.75, ease: 'power2.out' });
        });
      }
      const lab = labels[label];
      lab.textContent = value === 1 ? label.replace(/s$/, '') : label;
    };
    let opened = false;
    let lastAria = '';
    const tick = () => {
      const left = Number.isFinite(unlockAt) ? Math.max(0, unlockAt - Date.now()) : 0;
      const s = Math.floor(left / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      setUnit('d', d, 'days');
      setUnit('h', h, 'hours');
      setUnit('m', m, 'minutes');
      setUnit('s', s % 60, 'seconds');
      const aria = `${d} days, ${h} hours and ${m} minutes to go`;
      if (aria !== lastAria) { countEl.setAttribute('aria-label', aria); lastAria = aria; }
      if (left <= 0) {
        if (!opened) { opened = true; celebrate().catch((e) => { if (e?.name !== 'AbortError') console.error(e); }); }
        return;
      }
      // re-align to the next whole second so the digits never stutter
      clearTimeout(this.tickTimer);
      this.tickTimer = setTimeout(tick, 1000 - (Date.now() % 1000) + 15);
    };

    /* ---------- midnight ---------- */
    const celebrate = async () => {
      fx.dust({ density: 0.32, alpha: 1 });
      // the copy steps aside so the light can speak
      track(gsap.to([kickerEl, titleEl, countEl, subEl], { opacity: 0, y: reduced ? 0 : -6, filter: 'blur(8px)', duration: 1.1, stagger: 0.06, ease: 'power2.in', delay: 0.6 }));
      await ctx.wait(reduced ? 0.6 : 1.2);
      const posOf = (i) => ({ x: pts[i].x, y: pts[i].y - pts[i].s * 0.62 });
      if (reduced) {
        for (let i = 0; i < YEARS; i++) { lit = i + 1; timers.push(setTimeout(() => setLit(i), i * 60)); }
        await ctx.wait(1.4);
      } else {
        const tl = gsap.timeline();
        track(tl);
        const p0 = posOf(0);
        tl.set(spark, { x: p0.x, y: p0.y - 40, opacity: 0, scale: 0.4 })
          .to(spark, { y: p0.y, opacity: 1, scale: 1, duration: 0.9, ease: 'power2.out' })
          .add(() => { lit = Math.max(lit, 1); setLit(0); });
        for (let i = 1; i < YEARS; i++) {
          const a = posOf(i - 1);
          const b = posOf(i);
          const lift = 10 + Math.hypot(b.x - a.x, b.y - a.y) * 0.35;
          const dur = 0.34 - 0.15 * (i / (YEARS - 1));
          tl.to(spark, {
            duration: dur,
            ease: 'sine.inOut',
            motionPath: { path: [{ x: a.x, y: a.y }, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift }, { x: b.x, y: b.y }], curviness: 1.2 },
          }).add(() => {
            lit = Math.max(lit, i + 1);
            setLit(i);
          });
        }
        // the spark climbs from the twentieth year to the main lantern's wick
        const last = posOf(YEARS - 1);
        const mr = mainSvg.getBoundingClientRect();
        const wick = { x: mr.left + mr.width * 0.5, y: mr.top + mr.height * (124 / 140) };
        tl.to(spark, {
          duration: 1.5,
          ease: 'power1.inOut',
          motionPath: { path: [last, { x: last.x + (wick.x - last.x) * 0.15, y: wick.y + (last.y - wick.y) * 0.35 }, { x: wick.x + (last.x - wick.x) * 0.25, y: wick.y + 10 }, wick], curviness: 1.4 },
        }, '+=0.25').to(spark, { scale: 2.4, opacity: 0, duration: 0.6, ease: 'power2.out' });
        await tl.then();
        if (ctx.signal.aborted) return;
      }
      // the main lantern
      track(lightLantern(gsap, mainSvg, { reduced }));
      const mr = mainSvg.getBoundingClientRect();
      fx.sparkle(mr.left + mr.width / 2, mr.top + mr.height * 0.86, reduced ? 6 : 14, { spread: 40 });
      track(gsap.to(refl, { opacity: 1, duration: 1.8 }));
      track(gsap.to(warm, { opacity: 0.85, duration: 3.2, ease: 'sine.inOut' }));
      await ctx.wait(reduced ? 0.6 : 1.4);

      // new words, then the gift
      countEl.hidden = true;
      kickerEl.textContent = txt.openKicker;
      titleEl.textContent = txt.openTitle;
      titleEl.classList.add('is-open');
      subEl.textContent = txt.openSub;
      track(gsap.fromTo([kickerEl, titleEl, subEl], { opacity: 0, y: reduced ? 0 : 12, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6, stagger: 0.35, ease: 'power3.out' }));
      await ctx.wait(reduced ? 0.6 : 1.6);
      btn.hidden = false;
      track(gsap.fromTo(btn, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 1.2, ease: 'power3.out' }));
    };

    const go = () => {
      if (btn.hidden || btn.disabled) return;
      btn.disabled = true;
      ctx.next();
    };
    btn.addEventListener('click', go);
    const onKey = (e) => {
      if (btn.hidden || e.repeat) return;
      if (!(e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) return;
      if (document.activeElement === btn && e.key !== 'ArrowRight') return; // native click
      e.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    this.cleanup.push(() => window.removeEventListener('keydown', onKey));

    tick();
  },
  async exit() {
    (this.cleanup || []).forEach((fn) => fn());
    (this.timers || []).forEach((id) => { clearTimeout(id); clearInterval(id); });
    clearTimeout(this.tickTimer);
    (this.tweens || []).forEach((tw) => tw && tw.kill());
    this.cleanup = [];
    this.timers = [];
    this.tweens = [];
  },
};
