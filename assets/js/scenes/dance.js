// Chapter Four — The Kingdom Dance.
// A festival at dusk: bunting, falling petals, a chalk sun on the plaza, and
// her photos dancing in a slow 3D circle.
import { buntingSVG, sunEmblem } from '../core/art.js';

function castleSVG() {
  // an original hill-town skyline with lit windows
  const towers = [
    [40, 210, 26, 70], [95, 170, 34, 90], [150, 120, 40, 120], [205, 150, 30, 80], [250, 90, 46, 150],
    [310, 140, 34, 95], [360, 175, 28, 70], [410, 130, 40, 110], [470, 185, 26, 64], [515, 160, 32, 84],
  ];
  let body = '';
  let wins = '';
  towers.forEach(([x, top, w, roof], i) => {
    body += `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${300 - top}"/>`;
    body += `<path d="M${x - w / 2 - 4} ${top} L${x} ${top - roof * 0.55} L${x + w / 2 + 4} ${top} Z"/>`;
    for (let k = 0; k < 3; k++) {
      if ((i + k) % 2) wins += `<rect x="${x - 3}" y="${top + 18 + k * 26}" width="6" height="10" rx="3"/>`;
    }
  });
  return `<svg class="dn-castle" viewBox="0 0 560 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <g fill="#24113d">${body}<rect x="0" y="240" width="560" height="60"/></g>
    <g fill="#ffcf7a" class="dn-wins">${wins}</g>
  </svg>`;
}

function fairyLights(n = 26) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = t * 1000;
    const y = 18 + Math.sin(t * Math.PI) * 70;
    s += `<circle class="fl-bulb" style="--d:${(i % 7) * 0.31}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`;
  }
  return `<svg class="dn-lights" viewBox="0 0 1000 110" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 18 Q500 158 1000 18" fill="none" stroke="#3a2a40" stroke-width="2"/>
    <g fill="#ffe3a3">${s}</g>
  </svg>`;
}

export default {
  id: 'dance',
  title: 'The Kingdom Dance',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const t = ctx.text.dance || {};
    const photos = ctx.chapter('dance');
    await Promise.all(photos.map((p) => ctx.preload(p.url)));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const n = photos.length;

    const cardW = Math.min(vw < 700 ? vw * 0.42 : vw * 0.17, 270, vh * 0.27);
    const R = (cardW / (2 * Math.tan(Math.PI / n))) * 1.28;

    const petals = Array.from({ length: device.lowPower ? 14 : 24 }, (_, i) => {
      const left = (i * 37) % 100;
      const dur = 9 + ((i * 13) % 8);
      const delay = -((i * 7) % 14);
      const hue = ['#f2a7c3', '#ffe3a3', '#b9a3e3', '#ff8fb8', '#fff4e0'][i % 5];
      return `<i class="dn-petal" style="left:${left}%;--dur:${dur}s;--delay:${delay}s;--c:${hue};--s:${0.6 + ((i * 3) % 7) / 10}"></i>`;
    }).join('');

    el.innerHTML = `
      <div class="dn-sky"></div>
      <div class="dn-far">${castleSVG()}</div>
      <div class="dn-plaza"></div>
      <div class="dn-top">
        ${fairyLights()}
        ${buntingSVG({ count: vw < 700 ? 7 : 11, width: 1000, sag: 50, className: 'dn-bunting' })}
      </div>
      <div class="dn-3d">
        <div class="dn-world">
          <div class="dn-floor">${sunEmblem({ glow: false, className: 'dn-chalk' })}</div>
          <div class="dn-ring"></div>
        </div>
      </div>
      <div class="dn-petals">${petals}</div>`;

    const ring = el.querySelector('.dn-ring');
    const world = el.querySelector('.dn-world');
    const floor = el.querySelector('.dn-floor');
    const floorSize = R * 3.2;
    Object.assign(floor.style, { width: `${floorSize}px`, height: `${floorSize}px`, marginLeft: `${-floorSize / 2}px`, marginTop: `${-floorSize / 2}px` });
    el.querySelector('.dn-3d').style.perspective = `${Math.max(900, R * 3.4)}px`;

    const cards = photos.map((p, i) => {
      const a = (i / n) * 360;
      const c = document.createElement('div');
      c.className = 'dn-card';
      const h = cardW / p.ratio;
      Object.assign(c.style, { width: `${cardW}px`, height: `${h}px`, marginLeft: `${-cardW / 2}px`, marginTop: `${-h}px`, transform: `rotateY(${a}deg) translateZ(${R}px)` });
      c.innerHTML = `<div class="dn-bob" style="--d:${(i % 2) * -1.1}s"><div class="dn-photo"><img alt="" src="${p.url}"></div><i class="dn-ribbon"></i></div>`;
      ring.appendChild(c);
      return { el: c, a, photo: c.querySelector('.dn-photo') };
    });

    const cam = { rot: 0, tilt: -9, spin: -9, zoom: 0 };
    const apply = () => {
      world.style.transform = `translateZ(${-R * 0.35 + cam.zoom}px) rotateX(${cam.tilt}deg)`;
      ring.style.transform = `rotateY(${cam.rot}deg)`;
      floor.style.transform = `rotateX(90deg) rotate(${cam.rot}deg)`;
      for (const c of cards) {
        const ang = ((((c.a + cam.rot) % 360) + 540) % 360) - 180;
        const front = Math.cos((ang * Math.PI) / 180); // 1 = facing us
        c.photo.style.filter = `brightness(${(0.55 + 0.45 * Math.max(0, front)).toFixed(3)}) saturate(${(0.7 + 0.3 * Math.max(0, front)).toFixed(3)})`;
        c.el.style.zIndex = String(Math.round(front * 100) + 100);
      }
    };
    apply();
    let lastT = performance.now();
    let vel = 0;
    let dragging = false;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!dragging) {
        vel += (cam.spin - vel) * Math.min(1, dt * 1.5);
        cam.rot += vel * dt;
      }
      apply();
    };
    gsap.ticker.add(tick);

    let lastX = 0;
    let lastMoveT = 0;
    const down = (e) => { dragging = true; lastX = e.clientX; lastMoveT = performance.now(); };
    const move = (e) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      cam.rot += dx * (120 / vw);
      vel = (dx * (120 / vw)) / Math.max(0.016, (now - lastMoveT) / 1000);
      lastX = e.clientX;
      lastMoveT = now;
    };
    const up = () => { dragging = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.cleanup = () => { gsap.ticker.remove(tick); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };

    fx.dust({ density: 0.5 });
    audio.setMood('festive');
    gsap.fromTo(world, { opacity: 0 }, { opacity: 1, duration: 2.4, delay: 0.4 });
    gsap.from(cards.map((c) => c.el.querySelector('.dn-bob')), { y: -vh, duration: 2.2, stagger: 0.12, ease: 'bounce.out', delay: 0.6 });

    await ui.chapterCard(t.kicker || 'Chapter Four', t.title || 'The Kingdom Dance');
    gsap.to(cam, { zoom: R * 0.25, tilt: -6, duration: 6, ease: 'sine.inOut' });
    fx.confetti({ x: vw * 0.15, y: vh * 0.25, angle: -60, spread: 70, count: 40, power: 0.6 });
    fx.confetti({ x: vw * 0.85, y: vh * 0.25, angle: -120, spread: 70, count: 40, power: 0.6 });
    audio.sfx('pop');
    await ui.narrate(t.lines || [], { position: 'bottom' });
    const hint = ui.hint('Swipe to spin the dance');
    await ctx.wait(4);
    hint.remove();
    cam.spin = -14;
    await ctx.wait(2);
    await ui.waitContinue('Continue');
    ctx.next();
  },
  async exit() {
    this.cleanup && this.cleanup();
    this.cleanup = null;
  },
};
