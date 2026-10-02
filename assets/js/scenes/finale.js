// Finale — every photo flies in from the dark and gathers into a heart;
// the heart beats, we fly through it into light, and the sky says
// Happy Birthday. Then: the two of you, and a hug.
import { sunEmblem, esc } from '../core/art.js';

function heartPoints(count, aspect) {
  // sample a filled heart, then sort from the centre outwards
  const pts = [];
  const inHeart = (x, y) => {
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  };
  let tries = 0;
  while (pts.length < count && tries < 200000) {
    tries++;
    const x = (Math.random() - 0.5) * 2.6;
    const y = (Math.random() - 0.5) * 2.6 + 0.15;
    if (!inHeart(x, y)) continue;
    if (pts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 0.034)) continue;
    pts.push({ x, y });
  }
  // relax remaining slots if we couldn't fit enough
  while (pts.length < count) {
    const x = (Math.random() - 0.5) * 2.2;
    const y = (Math.random() - 0.5) * 2.2;
    if (inHeart(x, y)) pts.push({ x, y });
  }
  pts.sort((a, b) => a.x * a.x + (a.y - 0.2) ** 2 - (b.x * b.x + (b.y - 0.2) ** 2));
  return pts.map((p) => ({ x: p.x, y: -p.y * aspect }));
}

export default {
  id: 'finale',
  title: 'Happy Birthday',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const t = ctx.text.finale || {};
    const her = ctx.site.her || {};
    const finalePhoto = ctx.photo('finale');
    const us = ctx.photo('us');
    const all = ctx.allPhotos().filter((p) => p.id !== 'finale' && p.id !== 'us');
    const real = all.filter((p) => !p.isPlaceholder);
    const pool = real.length >= 8 ? real : all;
    const tiles = device.lowPower ? 34 : 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const S = Math.min(vw, vh) * (vw < vh ? 0.36 : 0.3); // heart radius in px
    const tileSize = S * 0.3;

    el.innerHTML = `
      <div class="fn-bg"></div>
      <div class="fn-3d"><div class="fn-world"></div></div>
      <div class="fn-light"></div>
      <div class="fn-reveal">
        <div class="fn-sun">${sunEmblem()}</div>
        <div class="fn-portrait arch"><img alt="" src="${finalePhoto.url}"></div>
        <p class="fn-big">${esc(t.big || 'Happy Birthday')}</p>
        <h1 class="fn-name">${esc(t.name || her.name || '')}</h1>
        <p class="fn-sub">${esc(t.sub || '')}</p>
      </div>
      <div class="fn-us">
        <figure class="polaroid fn-us-card"><div class="ph" style="aspect-ratio:${us.ratio}"><img alt="" src="${us.url}"></div><figcaption class="cap">${esc((ctx.site.her?.name || '') + ' & me')}</figcaption></figure>
        <p class="fn-hugline">${esc(t.hugLine || '')}</p>
        <button type="button" class="btn-gold fn-hug">🫂&nbsp; ${esc(t.hugButton || 'Send a hug')}</button>
        <p class="fn-hugdone" hidden>${esc(t.hugDone || '')}</p>
      </div>`;
    const world = el.querySelector('.fn-world');
    const light = el.querySelector('.fn-light');
    const reveal = el.querySelector('.fn-reveal');
    const usWrap = el.querySelector('.fn-us');
    gsap.set([reveal, usWrap], { autoAlpha: 0 });
    gsap.set(light, { opacity: 0 });
    await Promise.all([finalePhoto, us, ...pool.slice(0, 20)].map((p) => ctx.preload(p.url)));

    // build tiles
    const pts = heartPoints(tiles, 1);
    const tileEls = pts.map((p, i) => {
      const photo = pool[i % pool.length];
      const w = photo.ratio >= 1 ? tileSize : tileSize * photo.ratio;
      const h = photo.ratio >= 1 ? tileSize / photo.ratio : tileSize;
      const d = document.createElement('div');
      d.className = 'fn-tile';
      Object.assign(d.style, { width: `${w}px`, height: `${h}px`, marginLeft: `${-w / 2}px`, marginTop: `${-h / 2}px` });
      d.innerHTML = `<img alt="" src="${photo.url}">`;
      world.appendChild(d);
      return { el: d, x: p.x * S, y: p.y * S - S * 0.05 };
    });

    ctx.letterbox(true);
    fx.dust({ density: 0.2 });
    audio.setMood('quiet');

    // 1 — the quiet before
    await ui.narrate((t.lines || []).slice(0, 2), { position: 'center', style: 'big' });
    audio.sfx('heartbeat');

    // 1b — every day she's been here
    const birth = Date.parse(`${her.birthDate || '2007-01-03'}T00:00:00+05:30`);
    const unlock = Date.parse(ctx.site.settings?.lock?.unlockAt) || Date.now();
    const days = Math.max(1, Math.floor((Math.max(Date.now(), unlock) - birth) / 86400000));
    if (Number.isFinite(days) && t.daysLine) {
      const box = document.createElement('div');
      box.className = 'fn-days';
      box.innerHTML = `<p class="fn-days-n">0</p><p class="fn-days-l">${esc(t.daysLine)}</p><p class="fn-days-s">${esc(t.daysSub || '')}</p>`;
      el.appendChild(box);
      const n = box.querySelector('.fn-days-n');
      const counter = { v: 0 };
      gsap.fromTo(box.querySelector('.fn-days-l'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.4, delay: 0.6 });
      audio.sfx('shimmer');
      await gsap.to(counter, {
        v: days, duration: 4.2, ease: 'power3.inOut',
        onUpdate: () => (n.textContent = Math.round(counter.v).toLocaleString('en-IN')),
      }).then();
      audio.sfx('chime');
      fx.sparkle(window.innerWidth / 2, n.getBoundingClientRect().top + n.offsetHeight / 2, 26, { spread: 120 });
      gsap.fromTo(box.querySelector('.fn-days-s'), { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6 });
      await ctx.wait(4.2);
      await gsap.to(box, { opacity: 0, filter: 'blur(10px)', duration: 1.2 }).then();
      box.remove();
    }
    const last = (t.lines || []).slice(2);

    // 2 — the photos fly in from the dark and gather into a heart
    audio.setMood('wonder');
    audio.sfx('shimmer');
    tileEls.forEach((tile, i) => {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.max(vw, vh) * (0.8 + Math.random() * 0.8);
      gsap.fromTo(tile.el,
        { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, z: -2600 - Math.random() * 2000, rotationX: gsap.utils.random(-140, 140), rotationY: gsap.utils.random(-180, 180), rotationZ: gsap.utils.random(-90, 90), opacity: 0 },
        { x: tile.x, y: tile.y, z: 0, rotationX: 0, rotationY: 0, rotationZ: gsap.utils.random(-7, 7), opacity: 1, duration: 4.2 + Math.random() * 1.6, delay: i * 0.07, ease: 'power3.out' });
    });
    const sayLast = ui.narrate(last, { position: 'bottom', hold: 3.2 });
    gsap.to(world, { rotationY: 360, duration: 26, ease: 'none', repeat: -1 });
    await ctx.wait(4.8 + tiles * 0.07);

    // 3 — the heart beats
    audio.sfx('heartbeat');
    const beat = gsap.timeline({ repeat: 2 });
    beat.to(world, { scale: 1.08, duration: 0.14, ease: 'power2.out' }).to(world, { scale: 1, duration: 0.24, ease: 'power2.in' })
      .to(world, { scale: 1.12, duration: 0.14, ease: 'power2.out' }).to(world, { scale: 1, duration: 0.5, ease: 'power2.inOut' });
    await beat.then();
    await sayLast.catch(() => {});

    // 4 — fly through into light
    audio.sfx('swell');
    audio.setMood('soar');
    gsap.killTweensOf(world, 'rotationY');
    gsap.to(world, { rotationY: 0, duration: 1, ease: 'power2.inOut' });
    gsap.to(world, { z: 1600, duration: 2.6, ease: 'power3.in', delay: 0.6 });
    gsap.to(light, { opacity: 1, duration: 1.6, delay: 1.6, ease: 'power2.in' });
    await ctx.wait(3.3);
    world.innerHTML = '';
    gsap.set(reveal, { autoAlpha: 1 });
    gsap.to(light, { opacity: 0, duration: 3, ease: 'power2.out' });

    // 5 — Happy Birthday
    const sun = reveal.querySelector('.fn-sun');
    const portrait = reveal.querySelector('.fn-portrait');
    const big = reveal.querySelector('.fn-big');
    const name = reveal.querySelector('.fn-name');
    const sub = reveal.querySelector('.fn-sub');
    const split = new SplitText(name, { type: 'chars' });
    const bigSplit = new SplitText(big, { type: 'chars' });
    const tl = gsap.timeline();
    tl.fromTo(sun, { scale: 0.4, opacity: 0, rotation: -60 }, { scale: 1, opacity: 1, rotation: 0, duration: 3.2, ease: 'power3.out' }, 0)
      .fromTo(portrait, { scale: 0.6, opacity: 0, filter: 'brightness(3) blur(10px)' }, { scale: 1, opacity: 1, filter: 'brightness(1) blur(0px)', duration: 2.6, ease: 'power3.out' }, 0.2)
      .fromTo(bigSplit.chars, { opacity: 0, y: 26, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2, stagger: 0.06, ease: 'power3.out' }, 1.0)
      .fromTo(split.chars, { opacity: 0, scale: 1.6, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.4, stagger: 0.11, ease: 'power3.out' }, 1.8)
      .fromTo(sub, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.6 }, 3.2);
    gsap.to(sun.querySelector('.sun-rays'), { rotation: 360, duration: 90, ease: 'none', repeat: -1, transformOrigin: '50% 50%' });
    setTimeout(() => {
      fx.cannons();
      fx.colorBurst({ x: vw * 0.2, y: vh * 0.35, size: 0.9 });
      fx.colorBurst({ x: vw * 0.8, y: vh * 0.3, size: 0.9 });
      audio.sfx('pop');
    }, 1900);
    let fw = 0;
    const fireworks = setInterval(() => {
      fx.firework();
      if (++fw % 3 === 0) fx.firework();
    }, 900);
    ctx.signal.addEventListener('abort', () => clearInterval(fireworks));
    setTimeout(() => fx.rain(device.lowPower ? 60 : 110), 3500);
    await tl.then();
    await ctx.wait(6);
    clearInterval(fireworks);

    // 6 — the two of you
    gsap.to(reveal, { autoAlpha: 0, scale: 0.96, filter: 'blur(8px)', duration: 1.6, ease: 'power2.in' });
    await ctx.wait(1.4);
    audio.setMood('tender');
    gsap.set(usWrap, { autoAlpha: 1 });
    const card = usWrap.querySelector('.fn-us-card');
    const line = usWrap.querySelector('.fn-hugline');
    const hug = usWrap.querySelector('.fn-hug');
    const done = usWrap.querySelector('.fn-hugdone');
    gsap.fromTo(card, { y: 80, rotation: -14, opacity: 0, scale: 0.9 }, { y: 0, rotation: -3, opacity: 1, scale: 1, duration: 1.8, ease: 'back.out(1.4)' });
    gsap.fromTo(card.querySelector('img'), { filter: 'brightness(2) saturate(0) blur(3px)' }, { filter: 'brightness(1) saturate(1) blur(0px)', duration: 3.2, delay: 0.4 });
    gsap.fromTo(line, { opacity: 0, y: 12, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6, delay: 1.6 });
    gsap.fromTo(hug, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 1.2, delay: 2.8, ease: 'back.out(1.8)' });

    const phone = String(ctx.site.settings?.whatsapp || '').replace(/[^\d]/g, '');
    hug.addEventListener('click', () => {
      audio.sfx('magic');
      const r = hug.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, 30, { spread: 90, pink: true });
      fx.colorBurst({ x: r.left + r.width / 2, y: r.top, colors: ['#ff8fb8', '#f2a7c3', '#ffe3a3'], size: 0.8 });
      done.hidden = false;
      gsap.fromTo(done, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1 });
      if (phone) {
        const msg = encodeURIComponent(t.hugMessage || '🫂');
        setTimeout(() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank'), 700);
      }
    });

    await ctx.wait(5);
    await ui.waitContinue('Roll the credits');
    ctx.next();
  },
  async exit() {},
};
