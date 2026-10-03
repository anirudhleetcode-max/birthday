// Chapter Four — Somewhere Between Chaos and Magic.
//
// The kingdom festival at dusk, turning to night: a violet sky that deepens as
// we watch, a hill town whose windows light one by one, fairy lights that switch
// on in a wave, bunting stitched with the kingdom's sun, a few petals, and the
// chalk-sun plaza where her photos dance in a slow 3D ring (drag / swipe to spin
// with inertia, ← → to step, tap a photo and it does a happy little spin-hop).
// Photos also turn up where they shouldn't: one flips round on the bunting, one
// pops up from behind the rooftops. High above, the first lanterns are already
// drifting up — and at the end, one rises from the plaza and carries us into
// the Night of Lanterns.
//
// Photos: ctx.photos('dance'), ANY count (0 → the festival still plays).
// Words: messages.dance { kicker, title, lines[], hint }.
import { lanternSVG, sunEmblem } from '../core/art.js';
import { makeStars } from '../core/sky.js';
import { createChameleon } from '../core/chameleon.js';

const LINES_FALLBACK = [
  'Every good festival is about sixty percent chaos.',
  'The other forty percent is magic. Same as every good friendship.',
  'Look up. The sky’s starting to notice.',
];
const FABRIC = ['#6b3fa0', '#f4c463', '#8a5cc7', '#f2a7c3', '#3b1a57'];

/* ------------------------------------------------------------------ art */
/** The kingdom's sun as a tiny one-colour symbol (same 8 long + 8 flame rays as core/art sunEmblem). */
function sunSymbol() {
  const rays = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * 360) / 16;
    rays.push(i % 2 === 0
      ? `<path transform="rotate(${a})" d="M46 -8 L97 0 L46 8 Z"/>`
      : `<path transform="rotate(${a})" d="M46 -5 C56 -11 61 4 69 1 C75 -1 79 -3 86 0 C79 4 74 7 67 7 C58 8 55 -2 46 5 Z"/>`);
  }
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="dn-sun" viewBox="-100 -100 200 200"><g fill="currentColor">${rays.join('')}<circle r="38"/></g>
      <circle r="27" fill="none" stroke="var(--sun-in, rgba(0,0,0,.25))" stroke-width="5"/></symbol>
    <radialGradient id="dn-bulb-halo"><stop offset="0" stop-color="#fff2c4" stop-opacity=".95"/><stop offset=".35" stop-color="#ffcf7a" stop-opacity=".45"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
  </defs></svg>`;
}

/** A hill town at dusk: a far hazy layer and a near layer of rooftops with windows. */
function townSVG(layer) {
  let s = 1 + layer * 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const W = 1200;
  const H = 300;
  let body = '';
  let wins = '';
  if (layer === 0) {
    // far: towers & a spire flying the sun flag
    const towers = [[90, 170, 40, 60], [200, 130, 46, 90], [330, 150, 34, 70], [470, 95, 54, 130], [600, 60, 38, 170], [720, 110, 50, 110], [860, 150, 40, 80], [990, 120, 44, 100], [1110, 165, 36, 70]];
    towers.forEach(([x, top, w, roof]) => {
      body += `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${H - top}"/><path d="M${x - w / 2 - 6} ${top} L${x} ${top - roof * 0.62} L${x + w / 2 + 6} ${top} Z"/>`;
      for (let k = 0; k < 3; k++) if (rnd() < 0.55) wins += `<rect class="dn-win" style="--wd:${(rnd() * 9).toFixed(2)}s" x="${x - 3}" y="${top + 16 + k * 24}" width="6" height="10" rx="3"/>`;
    });
    body += '<path d="M600 -2 L600 -40"/>';
    body += `<path d="M0 ${H} L0 230 C140 200 260 214 380 206 C520 196 640 186 780 200 C920 214 1060 196 ${W} 214 L${W} ${H} Z"/>`;
    return `<svg class="dn-town-svg far" viewBox="0 -60 ${W} ${H + 60}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="#3a2458">${body}</g><path d="M600 -40 L628 -32 L600 -24 Z" fill="#f4c463" opacity=".8"/><g class="dn-wins" fill="#ffd58a">${wins}</g></svg>`;
  }
  // near: rooftops, chimneys, a little bell tower
  let x = -20;
  while (x < W + 20) {
    const w = 70 + rnd() * 80;
    const top = 150 + rnd() * 50;
    const peak = 26 + rnd() * 34;
    body += `<rect x="${x.toFixed(0)}" y="${top.toFixed(0)}" width="${(w + 2).toFixed(0)}" height="${(H - top).toFixed(0)}"/>`;
    body += `<path d="M${(x - 6).toFixed(0)} ${top.toFixed(0)} L${(x + w / 2).toFixed(0)} ${(top - peak).toFixed(0)} L${(x + w + 6).toFixed(0)} ${top.toFixed(0)} Z"/>`;
    if (rnd() < 0.5) body += `<rect x="${(x + w * 0.7).toFixed(0)}" y="${(top - peak * 0.8).toFixed(0)}" width="9" height="${(peak * 0.6).toFixed(0)}"/>`;
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) {
        if (rnd() < 0.62) wins += `<rect class="dn-win" style="--wd:${(rnd() * 14).toFixed(2)}s" x="${(x + w * (0.28 + c * 0.36) - 5).toFixed(0)}" y="${(top + 22 + r * 34).toFixed(0)}" width="10" height="15" rx="2"/>`;
      }
    }
    x += w + 2;
  }
  return `<svg class="dn-town-svg near" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <g fill="#1d0e2b">${body}</g><g class="dn-wins" fill="#ffcf7a">${wins}</g></svg>`;
}

/** Fairy lights hanging in a curve across the top of the frame (viewBox px of the container). */
function lightsSVG(W, H, n, { y0, sag }) {
  let bulbs = '';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = t * W;
    const y = y0 + 4 * sag * t * (1 - t);
    bulbs += `<g class="dn-bulb" style="--i:${i};--tw:${(1.6 + ((i * 7) % 5) * 0.37).toFixed(2)}s" transform="translate(${x.toFixed(1)} ${(y + 7).toFixed(1)})">
      <circle class="halo" r="15" fill="url(#dn-bulb-halo)"/><path class="cap" d="M-2 -8 h4 v3 h-4z" fill="#3a2a40"/><ellipse class="core" rx="3.2" ry="4.2" cy="-1"/></g>`;
  }
  return `<svg class="dn-lights" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="M0 ${y0} Q ${W / 2} ${y0 + 2 * sag} ${W} ${y0}" fill="none" stroke="#2b1b33" stroke-width="1.6"/>${bulbs}</svg>`;
}

/** Bunting: a rope and pennants stitched with the sun; one pennant hides a photo on its back. */
function buntingHTML(W, H, n, { y0, sag, photoAt, photo }) {
  let flags = '';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = t * W;
    const y = y0 + 4 * sag * t * (1 - t);
    const slope = (4 * sag * (1 - 2 * t)) / W; // dy/dx
    const ang = (Math.atan(slope) * 180) / Math.PI;
    const c = FABRIC[i % FABRIC.length];
    const sun = c === '#f4c463' ? '#6b3fa0' : '#f4c463';
    const isPhoto = photo && i === photoAt;
    flags += `<div class="dn-flag${isPhoto ? ' has-photo' : ''}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--a:${ang.toFixed(2)}deg;--d:${((i % 5) * -0.53).toFixed(2)}s">
      <div class="dn-flag-in">
        <div class="dn-flag-face" style="--c:${c};color:${sun}"><svg class="dn-flag-sun" viewBox="0 0 100 100"><use href="#dn-sun" width="100" height="100"/></svg></div>
        ${isPhoto ? '<div class="dn-flag-face back"><img alt=""></div>' : ''}
      </div></div>`;
  }
  return `<div class="dn-bunting" style="width:${W}px;height:${H}px">
    <svg class="dn-rope" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="M0 ${y0} Q ${W / 2} ${y0 + 2 * sag} ${W} ${y0}" fill="none" stroke="#e7d3a6" stroke-opacity=".7" stroke-width="1.6"/></svg>
    ${flags}</div>`;
}

/* ------------------------------------------------------------------ scene */
export default {
  id: 'dance',
  title: 'Somewhere Between Chaos and Magic',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const reduced = device.reducedMotion;
    const low = device.tier === 'low';
    const t = ctx.text.dance || {};
    const photos = ctx.photos('dance');
    await Promise.race([Promise.all(photos.map((p) => ctx.preload(p.url))), ctx.wait(6)]);
    const n = photos.length;
    const timers = new Set();
    const later = (s, fn) => { const d = gsap.delayedCall(s, () => { timers.delete(d); if (!ctx.signal.aborted) fn(); }); timers.add(d); return d; };

    const petalN = reduced ? 0 : low ? 6 : device.mobile ? 9 : 13;
    const petals = Array.from({ length: petalN }, (_, i) => {
      const left = (i * 37 + 11) % 100;
      const dur = 13 + ((i * 13) % 9);
      const delay = -((i * 7.3) % dur);
      const hue = ['#f2a7c3', '#fff4e0', '#d9c8f5', '#ffc9dc'][i % 4];
      return `<i class="dn-petal" style="left:${left}%;--dur:${dur}s;--delay:${delay.toFixed(1)}s;--c:${hue};--s:${(0.55 + ((i * 3) % 6) / 10).toFixed(2)}"></i>`;
    }).join('');

    el.innerHTML = `
      ${sunSymbol()}
      <div class="dn-sky">
        <div class="dn-sky-night"></div>
        <div class="dn-stars"></div>
        <div class="dn-glow"></div>
        <div class="dn-skylanterns"></div>
      </div>
      <div class="dn-town far-wrap">${townSVG(0)}</div>
      <div class="dn-bomb" aria-hidden="true"><div class="dn-bomb-in"><img alt=""></div></div>
      <div class="dn-town near-wrap">${townSVG(1)}</div>
      <div class="dn-plaza"></div>
      <div class="dn-3d">
        <div class="dn-world">
          <div class="dn-floor"><div class="dn-cobbles"></div>${sunEmblem({ glow: false, className: 'dn-chalk', fill: 'rgba(255,244,224,.06)', stroke: 'rgba(255,244,224,.55)', inner: 'rgba(255,244,224,.35)' })}</div>
          <div class="dn-ring" role="group" aria-label="Photos dancing in a circle"></div>
          <div class="dn-final-wrap"></div>
        </div>
      </div>
      <div class="dn-top"></div>
      <div class="dn-petals">${petals}</div>
      <div class="dn-rise" aria-hidden="true">${lanternSVG({ lit: true })}</div>`;

    const $ = (s) => el.querySelector(s);
    const ring = $('.dn-ring');
    const world = $('.dn-world');
    const stage3d = $('.dn-3d');
    const floor = $('.dn-floor');
    const top = $('.dn-top');
    const skyNight = $('.dn-sky-night');
    const starsEl = $('.dn-stars');
    const skyLanterns = $('.dn-skylanterns');
    const bomb = $('.dn-bomb');
    const rise = $('.dn-rise');
    if (!low) makeStars(starsEl, { count: device.mobile ? 110 : 170 });
    gsap.set(starsEl, { opacity: 0 });
    gsap.set(skyNight, { opacity: 0 });
    gsap.set(rise, { autoAlpha: 0 });

    /* ---------- cards ---------- */
    const cards = photos.map((p, i) => {
      const c = document.createElement('div');
      c.className = 'dn-card';
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', `${p.alt || `Photo ${i + 1}`} — photo ${i + 1} of ${n}. Press Enter to make it dance.`);
      c.innerHTML = `<div class="dn-bob" style="--d:${((i % 3) * -0.73).toFixed(2)}s"><div class="dn-jump">
          <div class="dn-face front"><img alt="" draggable="false"><i class="dn-shade"></i><i class="dn-sheen"></i></div>
          <div class="dn-face back"><svg viewBox="0 0 100 100"><use href="#dn-sun" width="100" height="100"/></svg></div>
        </div></div>`;
      const img = c.querySelector('img');
      if (p.srcset) { img.sizes = '(max-width: 700px) 34vw, 220px'; img.srcset = p.srcset; }
      img.src = p.url;
      img.alt = p.alt || '';
      img.style.objectPosition = p.objectPosition;
      ring.appendChild(c);
      return { el: c, a: (i / Math.max(1, n)) * 360, photo: p, jump: c.querySelector('.dn-jump'), shade: c.querySelector('.dn-shade'), front: 0, busy: false };
    });

    /* ---------- layout (also on resize) ---------- */
    const L = { R: 200, cardW: 160, vw: 0, vh: 0 };
    let bunting = null;
    const layout = () => {
      const vw = el.clientWidth || window.innerWidth;
      const vh = el.clientHeight || window.innerHeight;
      L.vw = vw;
      L.vh = vh;
      const portrait = vh > vw;
      const ratio = Math.min(1.25, Math.max(0.55, n ? photos.reduce((s, p) => s + (p.ratio || 0.75), 0) / n : 0.75));
      let cardW = portrait ? Math.min(vw * 0.37, vh * 0.25 * ratio, 230) : Math.min(vw * 0.135, vh * 0.31 * ratio, 260);
      const k = n > 2 ? 1 / (2 * Math.tan(Math.PI / n)) : 0.5;
      let R = Math.max(cardW * 0.72, cardW * k * 1.45);
      const Rmax = portrait ? Math.max(vw * 0.95, 300) : Math.min(vw * 0.36, vh * 0.95);
      if (R > Rmax) { cardW *= Rmax / R; R = Rmax; }
      L.R = R;
      L.cardW = cardW;
      cards.forEach((c) => {
        const w = cardW;
        const h = cardW / (c.photo.ratio || 0.75);
        Object.assign(c.el.style, { width: `${w}px`, height: `${h}px`, marginLeft: `${-w / 2}px`, marginTop: `${-h}px` });
        c.el.style.setProperty('--tz', `${R}px`);
        c.el.style.setProperty('--ry', `${c.a}deg`);
      });
      const fs = Math.max(R * 3.3, cardW * 3);
      Object.assign(floor.style, { width: `${fs}px`, height: `${fs}px`, marginLeft: `${-fs / 2}px`, marginTop: `${-fs / 2}px` });
      stage3d.style.perspective = `${Math.round(R * 1.7 + 420)}px`;
      world.style.top = portrait ? '71%' : '72%';
      // bunting & lights span the top of the frame
      const TW = Math.round(vw * 1.1);
      const TH = Math.round(Math.min(vh * 0.34, 300));
      const nFlags = portrait ? 7 : vw > 1200 ? 13 : 11;
      const nBulbs = portrait ? 15 : 26;
      const sagB = Math.min(TH * 0.3, 70);
      const photoFlag = n ? Math.floor(nFlags * 0.3) : -1;
      top.innerHTML = `${lightsSVG(TW, TH, nBulbs, { y0: Math.round(vh * 0.02) + 6, sag: Math.min(TH * 0.38, 92) })}
        ${buntingHTML(TW, TH, nFlags, { y0: Math.round(vh * 0.045) + 10, sag: sagB, photoAt: photoFlag, photo: n > 0 })}`;
      top.style.width = `${TW}px`;
      bunting = top.querySelector('.dn-flag.has-photo');
      if (lightsOn) top.querySelector('.dn-lights').classList.add('on', 'instant');
    };
    let lightsOn = false;
    layout();

    /* ---------- camera / spin ---------- */
    const cam = { rot: 0, tilt: reduced ? -14 : -17, spin: reduced ? 0 : -8, push: 0 };
    let vel = cam.spin;
    let dragging = false;
    const apply = () => {
      world.style.transform = `translateZ(${(-L.R + cam.push).toFixed(1)}px) rotateX(${cam.tilt.toFixed(2)}deg)`;
      ring.style.transform = `rotateY(${cam.rot.toFixed(2)}deg)`;
      floor.style.transform = `rotateX(90deg) rotate(${(-cam.rot).toFixed(2)}deg)`;
      for (const c of cards) {
        const ang = ((((c.a + cam.rot) % 360) + 540) % 360) - 180;
        const front = Math.cos((ang * Math.PI) / 180);
        c.front = front;
        c.ang = ang;
        const shade = Math.max(0, Math.min(0.62, 0.5 - front * 0.5 + 0.06));
        c.shade.style.opacity = shade.toFixed(3);
        // edge-on or turned away: not something to tap, Tab to or announce (unless it already has focus)
        const usable = front > 0.35 || document.activeElement === c.el;
        if (usable !== c.usable) {
          c.usable = usable;
          c.el.tabIndex = usable ? 0 : -1;
          c.el.style.pointerEvents = usable ? '' : 'none';
          if (usable) c.el.removeAttribute('aria-hidden'); else c.el.setAttribute('aria-hidden', 'true');
        }
      }
    };
    apply();
    let lastT = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!dragging) {
        vel += (cam.spin - vel) * Math.min(1, dt * 1.2);
        cam.rot += vel * dt;
      }
      apply();
    };
    gsap.ticker.add(tick);

    /* ---------- interaction: drag to spin (inertia), tap a card to make it dance ---------- */
    const hop = (c) => {
      if (!c || c.busy) return;
      c.busy = true;
      const r = c.el.getBoundingClientRect();
      const tl = gsap.timeline({ onComplete: () => { c.busy = false; } });
      if (reduced) {
        tl.fromTo(c.jump, { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' });
      } else {
        tl.to(c.jump, { scaleY: 0.9, scaleX: 1.06, duration: 0.12, ease: 'power2.in' })
          .to(c.jump, { y: -L.cardW * 0.42, scaleY: 1.05, scaleX: 0.97, rotationY: '+=360', duration: 0.62, ease: 'power2.out' })
          .to(c.jump, { y: 0, scaleY: 1, scaleX: 1, duration: 0.36, ease: 'bounce.out' }, '>-0.05')
          .set(c.jump, { rotationY: 0 });
      }
      audio.sfx('pop');
      audio.sfx('sparkle', { delay: 0.25 });
      fx.sparkle(r.left + r.width / 2, r.top + r.height * 0.4, 16, { spread: r.width * 0.6, pink: true });
    };
    const cardFromEvent = (e) => {
      const hit = e.target && e.target.closest ? e.target.closest('.dn-card') : null;
      return hit ? cards.find((c) => c.el === hit) : null;
    };
    let down = null;
    let lastX = 0;
    let lastMoveT = 0;
    const onDown = (e) => {
      if (e.button != null && e.button > 0) return;
      dragging = true;
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, target: e.target };
      lastX = e.clientX;
      lastMoveT = performance.now();
      vel = 0;
    };
    const onMove = (e) => {
      if (!dragging || !down) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
      const k = 150 / Math.max(320, L.vw);
      cam.rot += dx * k;
      const inst = (dx * k) / Math.max(0.016, (now - lastMoveT) / 1000);
      vel = vel * 0.4 + inst * 0.6;
      lastX = e.clientX;
      lastMoveT = now;
      if (down.moved > 8) hintDone();
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - lastMoveT > 120) vel *= 0.3; // held still before letting go
      vel = Math.max(-260, Math.min(260, vel));
      if (down && down.moved < 8 && performance.now() - down.t < 450) {
        const c = cardFromEvent({ target: down.target });
        if (c) hop(c);
        else if (e && e.target && e.target.closest && e.target.closest('.dn-bomb')) bombTap();
      }
      down = null;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const step = (dir) => {
      if (!n) return;
      const stepDeg = 360 / n;
      const target = Math.round((cam.rot + dir * stepDeg) / stepDeg) * stepDeg;
      vel = 0;
      gsap.to(cam, { rot: target, duration: 0.7, ease: 'power3.out', overwrite: 'auto' });
      hintDone();
    };
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowRight' && !continueShown) { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', onKey);
    // keyboard: focusing a card brings it round to the front; Enter / Space makes it dance
    cards.forEach((c) => {
      c.el.addEventListener('focus', () => {
        const target = -c.a + Math.round((cam.rot + c.a) / 360) * 360;
        vel = 0;
        cam.spin = 0;
        gsap.to(cam, { rot: target, duration: 0.8, ease: 'power3.out', overwrite: 'auto' });
      });
      c.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); hop(c); }
      });
    });

    /* ---------- the little one hides behind one of the cards ---------- */
    let cham = null;
    let chamCard = null;
    if (n >= 2) {
      chamCard = cards[Math.min(n - 1, Math.floor(n / 2))];
      const wrap = document.createElement('div');
      wrap.className = 'dn-cham-wrap';
      chamCard.jump.appendChild(wrap);
      cham = createChameleon(wrap, {
        size: '100%',
        reducedMotion: reduced,
        className: 'dn-cham',
        label: 'Someone small is hiding behind this photo',
        onTap: () => ctx.eggs.found('chameleon', 'You found the little one. It’s shy.'),
      });
    }
    let chamOut = false;
    const chamLoop = () => {
      later(2.5 + Math.random() * 2, () => {
        if (cham && chamCard) {
          const facing = Math.abs(chamCard.ang) < 32;
          if (facing && !chamOut && Math.random() < 0.6) {
            chamOut = true;
            cham.peek('bottom', { duration: 0.9 }).then(() => {
              if (ctx.signal.aborted) return;
              const r = chamCard.el.getBoundingClientRect();
              cham.lookAt(r.left - 60, r.top + 40);
              later(2.6 + Math.random() * 1.5, () => cham.hide().then(() => { chamOut = false; }));
            });
          } else if (!facing && chamOut) {
            cham.hide().then(() => { chamOut = false; });
          }
        }
        chamLoop();
      });
    };

    /* ---------- photos where they shouldn't be ---------- */
    let bombBusy = false;
    let bombIdx = 0;
    const bombImg = bomb.querySelector('img');
    const bombIn = bomb.querySelector('.dn-bomb-in');
    gsap.set(bombIn, { yPercent: 120 });
    const photobomb = () => {
      if (!n || bombBusy) return;
      bombBusy = true;
      const p = photos[(bombIdx++ * 3 + 1) % n];
      bombImg.src = p.thumbUrl || p.url;
      bombImg.style.objectPosition = p.objectPosition;
      bomb.style.left = `${[64, 22, 78, 36][bombIdx % 4]}%`;
      const tl = gsap.timeline({ onComplete: () => { bombBusy = false; } });
      tl.to(bombIn, { yPercent: 8, duration: 0.55, ease: 'back.out(2.2)', onStart: () => audio.sfx('pop') })
        .to(bombIn, { rotation: 7, duration: 0.16, yoyo: true, repeat: 3, ease: 'sine.inOut' }, '+=0.1')
        .to(bombIn, { yPercent: 120, rotation: 0, duration: 0.45, ease: 'power2.in' }, '+=1.1');
    };
    const bombTap = () => {
      if (!bombBusy) return;
      const r = bombIn.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 3, 12, { spread: 30, pink: true });
      audio.sfx('sparkle');
    };
    let flagIdx = 0;
    const flagFlip = () => {
      if (!bunting || !n) return;
      const p = photos[(flagIdx++ * 5 + 2) % n];
      const img = bunting.querySelector('img');
      img.src = p.thumbUrl || p.url;
      img.style.objectPosition = p.objectPosition;
      const inner = bunting.querySelector('.dn-flag-in');
      gsap.timeline()
        .to(inner, { rotationY: 180, duration: 0.7, ease: 'back.out(1.6)', onStart: () => audio.sfx('whoosh') })
        .to(inner, { rotationY: 360, duration: 0.6, ease: 'power2.inOut' }, '+=3')
        .set(inner, { rotationY: 0 });
    };
    const mischief = () => {
      later(9 + Math.random() * 6, () => {
        if (Math.random() < 0.55) photobomb(); else flagFlip();
        mischief();
      });
    };

    /* ---------- dusk → night ---------- */
    const lanternsHigh = [];
    const skyLantern = (i) => {
      const d = document.createElement('div');
      d.className = 'dn-sl';
      const size = 9 + Math.random() * 12;
      d.style.cssText = `left:${(8 + Math.random() * 84).toFixed(1)}%;top:${(18 + Math.random() * 22).toFixed(1)}%;width:${size.toFixed(1)}px;--dur:${(44 + Math.random() * 30).toFixed(1)}s;--sw:${(Math.random() * 6 - 3).toFixed(1)}vw`;
      d.innerHTML = lanternSVG({ lit: true });
      skyLanterns.appendChild(d);
      lanternsHigh.push(d);
      gsap.fromTo(d, { opacity: 0 }, { opacity: 0.55 + Math.random() * 0.35, duration: 3, ease: 'sine.out' });
      return i;
    };
    const nightfall = (dur) => {
      gsap.to(skyNight, { opacity: 0.82, duration: dur, ease: 'sine.inOut' });
      gsap.to(starsEl, { opacity: 0.9, duration: dur * 0.8, delay: dur * 0.2, ease: 'sine.in' });
      el.classList.add('is-night');
      const wins = [...el.querySelectorAll('.dn-win')];
      wins.forEach((w) => later(Math.random() * dur * 0.7, () => w.classList.add('lit')));
      const count = low ? 4 : device.mobile ? 6 : 8;
      for (let i = 0; i < count; i++) later(4 + i * (dur / count) * 0.85 + Math.random() * 2, () => skyLantern(i));
    };

    const onResize = () => { layout(); apply(); };
    let rz = 0;
    const resized = () => { clearTimeout(rz); rz = setTimeout(onResize, 160); };
    window.addEventListener('resize', resized);

    let hintEl = null;
    let hintShown = false;
    const hintDone = () => { if (hintEl) { hintEl.remove(); hintEl = null; } };
    let continueShown = false;

    this.cleanup = () => {
      gsap.ticker.remove(tick);
      timers.forEach((d) => d.kill());
      timers.clear();
      clearTimeout(rz);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resized);
      gsap.killTweensOf(cam);
      cham && cham.destroy();
      hintDone();
    };

    /* ================================================================ play */
    el.dataset.phase = 'build';
    fx.dust({ density: 0.32, alpha: 0.75 });
    audio.setMood('festive');
    // the ring assembles itself out of the plaza
    gsap.fromTo(world, { opacity: 0 }, { opacity: 1, duration: 1.6, delay: 0.3 });
    if (!reduced) {
      gsap.fromTo(cards.map((c) => c.jump), { y: () => L.vh * 0.5, opacity: 0 }, { y: 0, opacity: 1, duration: 1.4, stagger: 0.09, ease: 'back.out(1.3)', delay: 0.6 });
      gsap.fromTo(cam, { push: -L.R * 0.6 }, { push: 0, duration: 7, ease: 'power2.out' });
    }

    await ui.chapterCard(t.kicker || 'Chapter Four', t.title || 'Somewhere Between Chaos and Magic');
    el.dataset.phase = 'dance';

    // the festival lights come on, left to right
    const lights = top.querySelector('.dn-lights');
    lights && lights.classList.add('on');
    lightsOn = true;
    audio.sfx('sparkle');
    audio.sfx('chime', { delay: 0.5 });
    nightfall(reduced ? 20 : 34);
    if (!reduced) {
      fx.confetti({ x: L.vw * 0.12, y: L.vh * 0.3, angle: -62, spread: 50, count: 26, power: 0.5, colors: ['#f4c463', '#ffe3a3', '#f2a7c3', '#b9a3e3'] });
      fx.confetti({ x: L.vw * 0.88, y: L.vh * 0.3, angle: -118, spread: 50, count: 26, power: 0.5, colors: ['#f4c463', '#ffe3a3', '#f2a7c3', '#b9a3e3'] });
    }
    // a little demo: the photo at the front can't keep still
    later(1.8, () => {
      const front = cards.reduce((a, c) => (!a || c.front > a.front ? c : a), null);
      if (front) hop(front);
    });
    chamLoop();
    mischief();
    later(4.5, () => photobomb());

    await ui.narrate(t.lines && t.lines.length ? t.lines : LINES_FALLBACK, { position: 'bottom' });
    if (n > 1 && !hintShown) {
      hintShown = true;
      hintEl = ui.hint(t.hint || 'Swipe to spin');
      later(5.5, hintDone);
    }
    await ctx.wait(4.5);

    /* ---------- the first lantern of the night rises from the plaza ---------- */
    el.dataset.phase = 'end';
    const rr = world.getBoundingClientRect();
    const sr = el.getBoundingClientRect();
    const startX = rr.left - sr.left;
    const startY = rr.top - sr.top;
    gsap.set(rise, { autoAlpha: 1, x: startX, y: startY, scale: 0.4 });
    audio.sfx('lanternRise');
    const hoverY = L.vh * (L.vh > L.vw ? 0.25 : 0.22);
    await new Promise((r) => gsap.to(rise, { y: hoverY, scale: 1, duration: reduced ? 1.6 : 4.2, ease: 'sine.inOut', onComplete: r }));
    if (!reduced) gsap.to(rise, { x: `+=${L.vw * 0.03}`, y: `-=${L.vh * 0.015}`, duration: 2.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    continueShown = true;
    await ui.waitContinue('Continue');
    el.dataset.phase = 'next';
    gsap.killTweensOf(rise);
    const lr = rise.getBoundingClientRect();
    await new Promise((r) => gsap.to(rise, { y: `-=${L.vh * 0.06}`, scale: 1.12, duration: reduced ? 0.3 : 0.7, ease: 'power2.in', onComplete: r }));
    const fr = rise.getBoundingClientRect();
    ctx.next({ kind: 'lantern', x: fr.left + fr.width / 2 || lr.left, y: fr.top + fr.height / 2 || lr.top, color: '#ffb347' });
  },
  async exit() {
    this.cleanup && this.cleanup();
    this.cleanup = null;
  },
};
