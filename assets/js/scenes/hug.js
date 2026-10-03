// One Last Thing — "Okay, final step. Send me a hug."
// A golden thread draws a heart; she presses and holds (touch, mouse, or
// Space/Enter) while light gathers into it and small lanterns rise behind.
// When the hug is "received", the photo of the two of you appears.
import { createRibbon, ribbonPaths } from '../core/ribbon.js';
import { lanternSVG, esc } from '../core/art.js';

const HOLD = 2.6; // seconds of holding for a full hug
const HEART_D = 'M50 88 C22 66 6 50 6 31 C6 16 18 6 31 6 C40 6 46 11 50 18 C54 11 60 6 69 6 C82 6 94 16 94 31 C94 50 78 66 50 88 Z';

export default {
  id: 'hug',
  title: 'One Last Thing',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx, device } = ctx;
    const t = ctx.text.hug || {};
    const reduced = device.reducedMotion;
    const holdFor = reduced ? 1.2 : HOLD;
    const us = ctx.role('together');
    const phone = String(ctx.site.settings?.whatsapp || '').replace(/[^\d]/g, '');
    this.cleanup = [];

    el.innerHTML = `
      <div class="hg-sky" aria-hidden="true"></div>
      <div class="hg-lanterns" aria-hidden="true"></div>
      <div class="hg-stage">
        <button type="button" class="hg-heart" aria-label="${esc(ctx.fill(t.holdHint || 'Press and hold'))} to send a hug">
          <span class="hg-ring" aria-hidden="true">
            <svg viewBox="0 0 120 120"><circle class="hg-ring-bg" cx="60" cy="60" r="56"/><circle class="hg-ring-fg" cx="60" cy="60" r="56"/></svg>
          </span>
          <span class="hg-glow" aria-hidden="true"></span>
          <svg class="hg-shape" viewBox="0 0 100 94" aria-hidden="true">
            <defs>
              <radialGradient id="hg-fill" cx="50%" cy="42%" r="62%">
                <stop offset="0" stop-color="#fff6dc"/><stop offset=".45" stop-color="#ffd27a"/><stop offset="1" stop-color="#e98a3a"/>
              </radialGradient>
            </defs>
            <path class="hg-fill" d="${HEART_D}" fill="url(#hg-fill)"/>
            <path class="hg-line" d="${HEART_D}" fill="none" stroke="#ffe3a3" stroke-width="1.6" stroke-linejoin="round"/>
          </svg>
        </button>
        <p class="hg-hint" aria-hidden="true">${esc(ctx.fill(t.holdHint || 'Press and hold'))}</p>
      </div>
      <div class="hg-after" hidden>
        <figure class="polaroid hg-us">
          <div class="ph" style="aspect-ratio:${us.ratio}"><img alt="${esc(us.alt)}" src="${esc(us.url)}" style="object-position:${esc(us.objectPosition)}"></div>
          <figcaption class="cap">${esc(ctx.fill(`{name} & me`))}</figcaption>
        </figure>
        ${phone ? `<a class="btn-ghost hg-send" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(ctx.fill(t.message || ''))}">Send it to me</a>` : ''}
      </div>`;

    const stage = el.querySelector('.hg-stage');
    const heart = el.querySelector('.hg-heart');
    const fill = el.querySelector('.hg-fill');
    const line = el.querySelector('.hg-line');
    const glow = el.querySelector('.hg-glow');
    const ringFg = el.querySelector('.hg-ring-fg');
    const hint = el.querySelector('.hg-hint');
    const lanternLayer = el.querySelector('.hg-lanterns');
    const after = el.querySelector('.hg-after');
    const C = 2 * Math.PI * 56;
    gsap.set(ringFg, { strokeDasharray: C, strokeDashoffset: C });
    gsap.set(fill, { opacity: 0.08, scale: 0.92, svgOrigin: '50 48' });
    gsap.set([heart, hint], { autoAlpha: 0 });
    ctx.letterbox(true);
    fx.dust({ density: 0.35 });
    audio.setMood('tender');

    await ui.narrate((t.lines && t.lines.length ? t.lines : ['Okay, final step.', 'Send me a hug.']), { position: 'top', hold: 2.2 });

    // a golden thread draws the heart (the film's ribbon, one last time)
    const box = heart.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    let rib = null;
    if (ctx.theme.ribbon !== false) {
      rib = createRibbon(el, { strands: 4, width: 2, device, zIndex: 3 });
      // match the drawn heart (66% of the button, path spans 88% of its viewBox)
      rib.setPath(ribbonPaths.heart(box.left - host.left + box.width / 2, box.top - host.top + box.height * 0.5, box.width * 0.6));
      this.cleanup.push(() => rib && rib.destroy());
      gsap.set(heart, { autoAlpha: 1 });
      gsap.set(line, { opacity: 0 });
      await rib.draw({ duration: reduced ? 0.8 : 2.4, ease: 'power2.inOut' });
      gsap.to(line, { opacity: 1, duration: 0.8 });
      rib.flow(true);
      rib.fade(0.55, 1.2);
    } else {
      gsap.to(heart, { autoAlpha: 1, duration: 1 });
    }
    gsap.to(hint, { autoAlpha: 1, duration: 0.8 });
    gsap.to(glow, { opacity: 0.5, scale: 1.05, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    heart.focus({ preventScroll: true });

    // ---------------- press and hold ----------------
    let p = 0;
    let holding = false;
    let done = false;
    let last = performance.now();
    let buzz = 0;
    let lanternClock = 0;
    const lanternSpots = [];
    const releaseLantern = (big = false) => {
      const d = document.createElement('div');
      d.className = 'hg-lantern';
      d.innerHTML = lanternSVG({ lit: true });
      const x = 6 + Math.random() * 88;
      const s = big ? 0.9 + Math.random() * 0.6 : 0.45 + Math.random() * 0.5;
      d.style.left = `${x}%`;
      d.style.setProperty('--s', s.toFixed(2));
      lanternLayer.appendChild(d);
      lanternSpots.push(d);
      gsap.fromTo(d, { y: 0, opacity: 0 }, {
        y: -window.innerHeight * (0.9 + Math.random() * 0.4), opacity: 1, duration: reduced ? 4 : 9 + Math.random() * 5, ease: 'none',
        onUpdate() { if (this.progress() > 0.8) d.style.opacity = String((1 - this.progress()) * 5); },
        onComplete: () => d.remove(),
      });
      gsap.to(d, { x: (Math.random() - 0.5) * 60, duration: 4, yoyo: true, repeat: 3, ease: 'sine.inOut' });
    };
    const gather = () => {
      const r = heart.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const a = Math.random() * Math.PI * 2;
      const dist = Math.max(window.innerWidth, window.innerHeight) * (0.25 + Math.random() * 0.25);
      fx.sparkle(cx + Math.cos(a) * dist * (1 - p), cy + Math.sin(a) * dist * (1 - p), 1, { spread: 8 });
    };
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000); // real time, so slow devices hug at the same speed
      last = now;
      if (done) return;
      if (holding) {
        p = Math.min(1, p + dt / holdFor);
        buzz += dt;
        lanternClock += dt;
        if (buzz > 0.32) { buzz = 0; try { navigator.vibrate && navigator.vibrate(12); } catch { /* ignore */ } }
        if (lanternClock > (reduced ? 0.6 : 0.22)) { lanternClock = 0; releaseLantern(); }
        if (!reduced && Math.random() < 0.7) gather();
      } else if (p > 0) {
        p = Math.max(0, p - dt * 0.45); // gentle decay, never punishing
      }
      ringFg.style.strokeDashoffset = String(C * (1 - p));
      gsap.set(fill, { opacity: 0.08 + p * 0.92, scale: 0.92 + p * 0.08 });
      gsap.set(heart, { scale: 1 + p * 0.28 });
      glow.style.setProperty('--p', p.toFixed(3));
      if (p >= 1) complete();
    };
    gsap.ticker.add(tick);
    this.cleanup.push(() => gsap.ticker.remove(tick));

    const start = (e) => {
      if (done) return;
      if (e && e.cancelable) e.preventDefault();
      if (!holding) {
        holding = true;
        heart.classList.add('is-holding');
        audio.sfx('heartbeat');
        gsap.to(hint, { autoAlpha: 0.35, duration: 0.4 });
      }
    };
    const stop = () => {
      if (!holding) return;
      holding = false;
      heart.classList.remove('is-holding');
      if (!done) gsap.to(hint, { autoAlpha: 1, duration: 0.6 });
    };
    heart.addEventListener('pointerdown', start);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    heart.addEventListener('contextmenu', (e) => e.preventDefault());
    const keyDown = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { start(e); } };
    const keyUp = (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    this.cleanup.push(() => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    });

    let resolveDone;
    const finished = new Promise((r) => (resolveDone = r));
    function complete() {
      if (done) return;
      done = true;
      holding = false;
      heart.classList.add('is-done');
      heart.disabled = true;
      try { navigator.vibrate && navigator.vibrate([30, 60, 40]); } catch { /* ignore */ }
      audio.sfx('magic');
      const r = heart.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      fx.flash({ color: '#ffe3a3', duration: 0.9, peak: 0.6 });
      fx.sparkle(cx, cy, 46, { spread: 140, pink: true });
      fx.colorBurst({ x: cx, y: cy, colors: ['#ffd27a', '#f2a7c3', '#fff4e0', '#ffb347'], size: 0.85 });
      for (let i = 0; i < (reduced ? 4 : 14); i++) setTimeout(() => releaseLantern(true), i * 140);
      gsap.to(heart, { scale: 1.45, duration: 0.5, ease: 'back.out(2)' });
      gsap.to([heart, hint], { autoAlpha: 0, y: -30, duration: 1.2, delay: 0.9, ease: 'power2.in' });
      if (rib) rib.dissolve({ duration: 1.6 });
      resolveDone();
    }

    await Promise.race([finished, new Promise((_, rej) => ctx.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')), { once: true }))]);
    await ctx.wait(1.4);
    stage.style.pointerEvents = 'none';
    await ui.narrate((t.done && t.done.length ? t.done : ['Hug received.']), { position: 'top', hold: 2.4 });

    // the two of you
    after.hidden = false;
    const card = after.querySelector('.hg-us');
    gsap.fromTo(card, { y: 70, rotation: -12, opacity: 0, scale: 0.92 }, { y: 0, rotation: -3, opacity: 1, scale: 1, duration: reduced ? 0.8 : 1.8, ease: 'back.out(1.3)' });
    gsap.fromTo(card.querySelector('img'), { filter: 'brightness(1.9) saturate(0) blur(3px)' }, { filter: 'brightness(1) saturate(1) blur(0px)', duration: reduced ? 1 : 3.2, delay: 0.4 });
    const send = after.querySelector('.hg-send');
    if (send) {
      gsap.fromTo(send, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1, delay: 2.4 });
      send.addEventListener('click', () => audio.sfx('chime'));
    }
    await ctx.wait(reduced ? 1.5 : 4);
    await ui.waitContinue('Roll the credits');
    ctx.next();
  },
  async exit() {
    (this.cleanup || []).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    this.cleanup = [];
  },
};
