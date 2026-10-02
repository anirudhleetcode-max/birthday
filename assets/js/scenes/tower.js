// Chapter One — The Girl in the Tower.
// We stand inside a round tower room whose walls are covered in hand-painted
// murals; her photos are painted onto the wall, brush stroke by brush stroke.
const DEG = 180 / Math.PI;

function muralTile() {
  // An original painted-wall pattern: vines, little suns, flowers, stars.
  const flowers = [
    [60, 70, '#e98fb4'], [300, 40, '#b48be0'], [210, 230, '#f2a7c3'], [360, 300, '#8fb3e8'], [90, 340, '#f4c463'], [250, 380, '#e98fb4'],
  ];
  const flower = ([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse transform="rotate(${a}) translate(0 -8)" rx="5" ry="8" fill="${c}" opacity=".85"/>`).join('')}<circle r="4" fill="#ffe3a3"/></g>`;
  const sun = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#f4c463" opacity=".75">${Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30})" d="M12 -3 L24 0 L12 3 Z"/>`).join('')}<circle r="10"/></g>`;
  const star = (x, y) => `<path transform="translate(${x} ${y})" d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" fill="#fff4e0" opacity=".7"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420">
    <rect width="420" height="420" fill="#a57f68"/>
    <g fill="none" stroke="#5f8a5a" stroke-width="5" stroke-linecap="round" opacity=".6">
      <path d="M-10 120 C60 60 120 180 200 120 S330 60 430 130"/>
      <path d="M-10 300 C70 250 150 360 230 300 S340 250 430 310"/>
    </g>
    <g fill="#79a86a" opacity=".8">
      <ellipse cx="40" cy="96" rx="10" ry="5" transform="rotate(-30 40 96)"/><ellipse cx="150" cy="140" rx="10" ry="5" transform="rotate(25 150 140)"/>
      <ellipse cx="270" cy="96" rx="10" ry="5" transform="rotate(-20 270 96)"/><ellipse cx="380" cy="120" rx="10" ry="5" transform="rotate(30 380 120)"/>
      <ellipse cx="60" cy="282" rx="10" ry="5" transform="rotate(-30 60 282)"/><ellipse cx="190" cy="320" rx="10" ry="5" transform="rotate(25 190 320)"/>
      <ellipse cx="300" cy="276" rx="10" ry="5" transform="rotate(-20 300 276)"/><ellipse cx="400" cy="300" rx="10" ry="5" transform="rotate(30 400 300)"/>
    </g>
    ${flowers.map(flower).join('')}
    ${sun(160, 40, 1)}${sun(380, 210, 0.8)}${sun(20, 210, 0.7)}
    ${star(110, 200)}${star(330, 170)}${star(240, 30)}${star(30, 400)}${star(400, 400)}
    <g fill="none" stroke="#7d5aa6" stroke-width="3" opacity=".55" stroke-linecap="round">
      <path d="M120 250 c10 -18 30 -18 30 0 c0 14 -18 14 -18 4"/><path d="M330 360 c10 -18 30 -18 30 0 c0 14 -18 14 -18 4"/>
    </g>
  </svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

function paintingSVG(photo, i) {
  const W = Math.round(photo.ratio * 1000);
  const H = 1000;
  const rows = 5;
  let d = '';
  for (let r = 0; r < rows; r++) {
    const y = ((r + 0.5) / rows) * H;
    const fromLeft = r % 2 === 0;
    d += `${r === 0 ? 'M' : 'L'}${fromLeft ? -120 : W + 120} ${y - 40} L${fromLeft ? W + 120 : -120} ${y + 40} `;
  }
  return `
  <svg class="tw-paint" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs>
      <filter id="tw-rough-${i}" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${i * 7 + 3}" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="90" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <mask id="tw-mask-${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
        <path class="tw-brush" d="${d}" fill="none" stroke="#fff" stroke-width="${H / rows + 150}" stroke-linecap="round" stroke-linejoin="round" filter="url(#tw-rough-${i})"/>
      </mask>
    </defs>
    <image href="${photo.url}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" mask="url(#tw-mask-${i})"/>
  </svg>`;
}

export default {
  id: 'tower',
  title: 'The Girl in the Tower',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx } = ctx;
    const t = ctx.text.tower || {};
    const photos = ctx.chapter('tower');
    await Promise.all(photos.map((p) => ctx.preload(p.url)));

    el.innerHTML = `
      <div class="tw-room"><div class="tw-ring"></div></div>
      <div class="tw-light"></div>
      <div class="tw-candle"></div>`;
    const room = el.querySelector('.tw-room');
    const ring = el.querySelector('.tw-ring');
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // --- geometry: we stand inside a cylinder of radius R ---
    const s = 0.56; // apparent scale of the wall straight ahead
    const apparent = photos.map((p) => {
      const h = Math.min(vh * 0.47, (vw * (vw < 700 ? 0.74 : 0.42)) / p.ratio);
      return { w: h * p.ratio, h };
    });
    const meanW = apparent.reduce((a, b) => a + b.w, 0) / apparent.length;
    const gap = meanW * (vw < 700 ? 0.5 : 0.28);
    const circ = apparent.reduce((a, b) => a + b.w + gap, 0) / s;
    const R = circ / (2 * Math.PI);
    const eps = 0.3 * R;
    const persp = s * (eps + R);
    const D = persp - eps;
    room.style.perspective = `${persp}px`;

    // walls
    const strips = 40;
    // flat panels bulge past the circle at their edges — keep the wall behind them
    const maxHalf = Math.max(...apparent.map((a) => a.w)) / s / 2;
    const Rw = Math.hypot(R, maxHalf) + 12;
    const stripW = ((2 * Math.PI * Rw) / strips) * 1.025;
    const wallH = (vh * 1.35) / (persp / (eps + Rw));
    const mural = muralTile();
    const items = [];
    for (let k = 0; k < strips; k++) {
      const a = (k / strips) * 360;
      const strip = document.createElement('div');
      strip.className = 'tw-strip';
      Object.assign(strip.style, {
        width: `${stripW}px`, height: `${wallH}px`, marginLeft: `${-stripW / 2}px`, marginTop: `${-wallH / 2}px`,
        backgroundImage: mural, backgroundPosition: `${-k * stripW}px 0`,
        transform: `rotateY(${a}deg) translateZ(${-Rw}px)`,
      });
      ring.appendChild(strip);
      items.push({ el: strip, a });
    }

    // paintings
    const panels = [];
    let acc = 0;
    photos.forEach((p, i) => {
      const { w, h } = apparent[i];
      const rw = w / s;
      const rh = h / s;
      const center = acc + rw / 2;
      acc += rw + gap / s;
      const a = (center / circ) * 360;
      const panel = document.createElement('div');
      panel.className = 'tw-panel';
      Object.assign(panel.style, {
        width: `${rw}px`, height: `${rh}px`, marginLeft: `${-rw / 2}px`, marginTop: `${-rh / 2 - rh * 0.04}px`,
        transform: `rotateY(${a}deg) translateZ(${-R}px)`,
      });
      panel.innerHTML = `<div class="tw-frame"><div class="tw-canvas">${paintingSVG(p, i)}</div></div>`;
      ring.appendChild(panel);
      items.push({ el: panel, a });
      panels.push({ el: panel, a, brush: panel.querySelector('.tw-brush'), svg: panel.querySelector('svg') });
    });

    // camera state
    const cam = { rot: -panels[0].a + 38, tilt: 0 };
    const apply = () => {
      ring.style.transform = `translateZ(${D}px) rotateX(${cam.tilt}deg) rotateY(${cam.rot}deg)`;
      for (const it of items) {
        let w = (((it.a + cam.rot) % 360) + 540) % 360 - 180;
        const vis = Math.abs(w) < 96;
        if (it.vis !== vis) {
          it.vis = vis;
          it.el.style.visibility = vis ? 'visible' : 'hidden';
        }
      }
    };
    apply();
    gsap.ticker.add(apply);
    this.cleanup = () => gsap.ticker.remove(apply);
    gsap.to(cam, { tilt: 1.2, duration: 4.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    panels.forEach((p) => gsap.set(p.brush, { drawSVG: '0%' }));

    fx.dust({ density: 0.45 });
    audio.setMood('tender');
    gsap.fromTo(room, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 3, ease: 'power2.out' });

    await ui.chapterCard(t.kicker || 'Chapter One', t.title || 'The Girl in the Tower');

    const lines = t.lines || [];
    const lineAt = { 0: [lines[0]], 3: [lines[1]], 5: [lines[2]] };
    const nearest = (target) => {
      // shortest rotation path
      let diff = ((((target - cam.rot) % 360) + 540) % 360) - 180;
      return cam.rot + diff;
    };
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const turn = gsap.to(cam, { rot: nearest(-p.a), duration: i === 0 ? 3.2 : 2.6, ease: 'power2.inOut' });
      const say = lineAt[i] ? ui.narrate(lineAt[i], { position: 'top' }) : null;
      await turn.then();
      audio.sfx('sparkle');
      p.svg.style.opacity = 1;
      await gsap.to(p.brush, { drawSVG: '100%', duration: 2.1, ease: 'power1.inOut' }).then();
      p.svg.querySelector('image').removeAttribute('mask'); // cheaper to render afterwards
      p.el.classList.add('done');
      const r = p.el.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + r.height * 0.1, 10, { spread: r.width * 0.4 });
      if (say) await say;
      else await ctx.wait(0.6);
    }

    // free look: drag to turn, gentle auto-rotation
    let auto = gsap.to(cam, { rot: '-=360', duration: 90, repeat: -1, ease: 'none' });
    let dragging = false;
    let lastX = 0;
    const down = (e) => { dragging = true; lastX = e.clientX; auto.pause(); };
    const move = (e) => { if (!dragging) return; cam.rot += (e.clientX - lastX) * (90 / vw); lastX = e.clientX; };
    const up = () => { if (!dragging) return; dragging = false; auto.kill(); auto = gsap.to(cam, { rot: '-=360', duration: 90, repeat: -1, ease: 'none' }); };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const prev = this.cleanup;
    this.cleanup = () => { prev(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); auto.kill(); };
    const hint = ui.hint('Drag to look around the tower');
    await ctx.wait(3.5);
    hint.remove();
    await ui.waitContinue('Continue');
    ctx.next();
  },
  async exit() {
    this.cleanup && this.cleanup();
    this.cleanup = null;
  },
};

