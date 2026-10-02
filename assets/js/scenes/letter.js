// Chapter Seven — A Letter, Sealed with Sunlight.
// A wax-sealed envelope; tap the seal, and the letter writes itself out in ink.
import { sunEmblem, esc } from '../core/art.js';

function pressedFlower() {
  const petals = [0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a})" d="M0 0 C10 -8 12 -26 0 -34 C-12 -26 -10 -8 0 0 Z"/>`).join('');
  return `<svg class="lt-flower" viewBox="-60 -60 140 160" aria-hidden="true">
    <path d="M4 10 C10 40 2 70 14 96" stroke="#7d9a62" stroke-width="2.4" fill="none"/>
    <path d="M10 52 C26 44 34 30 36 22 C24 26 12 38 10 52 Z" fill="#8aa96e" opacity=".8"/>
    <g fill="#e7a3bf" opacity=".85" stroke="#c97d9c" stroke-width=".8">${petals}</g>
    <circle r="6" fill="#f2c46a"/>
  </svg>`;
}

export default {
  id: 'letter',
  title: 'A Letter',
  async enter(ctx, el) {
    const { gsap, ui, audio, fx } = ctx;
    const t = ctx.text.letter || {};
    const from = ctx.site.from || {};
    const p1 = ctx.photo('letter-1');
    const p2 = ctx.photo('letter-2');
    await Promise.all([ctx.preload(p1.url), ctx.preload(p2.url)]);
    const voice = ctx.media('voice');
    const body = (t.body || []).filter(Boolean);
    const mid = Math.max(1, Math.ceil(body.length / 2));

    el.innerHTML = `
      <div class="lt-bg"></div>
      <div class="lt-env-wrap">
        <div class="lt-env">
          <div class="lt-back"></div>
          <div class="lt-peek"></div>
          <div class="lt-front"></div>
          <div class="lt-flap"><div class="lt-flap-in"></div></div>
          <button type="button" class="lt-seal" aria-label="Open the letter">${sunEmblem({ glow: false, fill: '#8a2d4d', inner: '#5e1a33', stroke: '#c75a7d' })}</button>
          <p class="lt-to">for ${esc(ctx.site.her?.name || 'you')}</p>
        </div>
        <p class="lt-tap">tap the seal</p>
      </div>
      <div class="lt-paper" hidden>
        <div class="lt-scroll">
          <div class="lt-inner">
            <figure class="lt-pin lt-pin-1 polaroid"><i class="lt-tape"></i><div class="ph" style="aspect-ratio:${p1.ratio}"><img alt="" src="${p1.url}"></div></figure>
            <h3 class="lt-salute">${esc(t.salutation || '')}</h3>
            ${body.slice(0, mid).map((p) => `<p class="lt-p">${esc(p)}</p>`).join('')}
            <figure class="lt-pin lt-pin-2 polaroid"><i class="lt-tape"></i><div class="ph" style="aspect-ratio:${p2.ratio}"><img alt="" src="${p2.url}"></div></figure>
            ${body.slice(mid).map((p) => `<p class="lt-p">${esc(p)}</p>`).join('')}
            <p class="lt-sign">${esc(t.signoff || from.signoff || '')}</p>
            <p class="lt-from">${esc(from.name || '')}</p>
            ${voice ? '<button type="button" class="btn-ghost lt-voice" hidden>▶&nbsp; Hear it in my voice</button>' : ''}
            ${pressedFlower()}
          </div>
        </div>
      </div>`;

    const env = el.querySelector('.lt-env');
    const seal = el.querySelector('.lt-seal');
    const flap = el.querySelector('.lt-flap');
    const peek = el.querySelector('.lt-peek');
    const tap = el.querySelector('.lt-tap');
    const paper = el.querySelector('.lt-paper');
    const scroller = el.querySelector('.lt-scroll');

    fx.dust({ density: 0.35 });
    audio.setMood('tender');
    await ui.chapterCard(t.kicker || 'Chapter Seven', t.title || 'A Letter');

    gsap.fromTo(env, { y: 60, opacity: 0, rotationX: 20 }, { y: 0, opacity: 1, rotationX: 0, duration: 1.8, ease: 'power3.out' });
    gsap.fromTo(tap, { opacity: 0 }, { opacity: 0.8, duration: 1, delay: 1.6 });
    gsap.to(seal, { scale: 1.06, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(env, { y: -6, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.8 });

    await new Promise((resolve) => {
      seal.addEventListener('click', resolve, { once: true });
      env.addEventListener('click', resolve, { once: true });
    });
    if (ctx.signal.aborted) return;
    gsap.killTweensOf([seal, env]);
    audio.sfx('magic');
    const sr = seal.getBoundingClientRect();
    fx.sparkle(sr.left + sr.width / 2, sr.top + sr.height / 2, 24, { spread: 70 });
    gsap.to(tap, { opacity: 0, duration: 0.4 });
    const open = gsap.timeline();
    open.to(seal, { scale: 1.3, opacity: 0, rotation: 25, duration: 0.7, ease: 'power2.in' })
      .to(flap, { rotationX: 180, duration: 1.1, ease: 'power2.inOut' }, 0.4)
      .set(flap, { zIndex: 0 }, 0.95)
      .to(peek, { yPercent: -55, duration: 1.2, ease: 'power2.out' }, 1.2)
      .to(env, { y: '30vh', opacity: 0, scale: 0.9, duration: 1.1, ease: 'power2.in' }, 2.4);
    audio.sfx('pageTurn');
    await open.then();

    // the letter
    paper.hidden = false;
    gsap.fromTo(paper, { opacity: 0, y: 50, scale: 0.94, rotationX: 12 }, { opacity: 1, y: 0, scale: 1, rotationX: 0, duration: 1.4, ease: 'power3.out' });
    audio.sfx('pageTurn');

    // split every written element into characters
    const writeEls = [...el.querySelectorAll('.lt-salute, .lt-p, .lt-sign, .lt-from')];
    const chunks = writeEls.map((w) => {
      const text = w.textContent;
      w.textContent = '';
      const spans = [];
      for (const word of text.split(/(\s+)/)) {
        if (!word) continue;
        if (/^\s+$/.test(word)) { w.appendChild(document.createTextNode(' ')); continue; }
        const ws = document.createElement('span');
        ws.className = 'lt-w';
        for (const ch of word) {
          const c = document.createElement('span');
          c.className = 'lt-c';
          c.textContent = ch;
          ws.appendChild(c);
          spans.push(c);
        }
        w.appendChild(ws);
      }
      return { el: w, spans };
    });
    const pins = [el.querySelector('.lt-pin-1'), el.querySelector('.lt-pin-2')];
    gsap.set(pins, { opacity: 0 });

    const cps = 34; // characters per second
    let lastChar = null;
    const tl = gsap.timeline({ paused: true });
    let at = 0.6;
    tl.call(() => dropPin(0), [], at);
    chunks.forEach((c, idx) => {
      if (c.el.previousElementSibling === pins[1]) tl.call(() => dropPin(1), [], at);
      tl.fromTo(c.spans, { opacity: 0, filter: 'blur(3px)' }, {
        opacity: 1, filter: 'blur(0px)', duration: 0.35, ease: 'none',
        stagger: { each: 1 / cps, onStart() { lastChar = this.targets()[0]; } },
      }, at);
      tl.call(() => follow(c.el), [], at + 0.1);
      at += c.spans.length / cps + (idx === 0 ? 0.9 : 0.7);
    });
    const dropPin = (k) => {
      gsap.fromTo(pins[k], { opacity: 0, y: -40, rotation: k ? -14 : 14, scale: 1.1 }, { opacity: 1, y: 0, rotation: k ? -4 : 6, scale: 1, duration: 1.1, ease: 'back.out(1.6)' });
      audio.sfx('chime');
    };
    const follow = (node) => {
      const target = node.offsetTop - scroller.clientHeight * 0.35;
      if (target > scroller.scrollTop) gsap.to(scroller, { scrollTop: target, duration: 1.4, ease: 'power2.inOut' });
    };
    // keep the newest line in view while writing
    const keepUp = setInterval(() => {
      if (lastChar) {
        const r = lastChar.getBoundingClientRect();
        const sr2 = scroller.getBoundingClientRect();
        if (r.bottom > sr2.bottom - sr2.height * 0.22) gsap.to(scroller, { scrollTop: scroller.scrollTop + (r.bottom - (sr2.bottom - sr2.height * 0.45)), duration: 1.2, ease: 'power1.inOut', overwrite: true });
      }
    }, 900);
    ctx.signal.addEventListener('abort', () => clearInterval(keepUp));

    await ctx.wait(1.2);
    // tap the letter to write faster
    const faster = () => tl.timeScale(Math.min(8, tl.timeScale() * 2.5));
    paper.addEventListener('click', faster);
    const hint = ui.hint('tap the letter to write faster');
    setTimeout(() => hint.remove(), 4500);
    tl.play();
    await tl.then();
    clearInterval(keepUp);
    paper.removeEventListener('click', faster);
    audio.sfx('sparkle');

    if (voice) {
      const btn = el.querySelector('.lt-voice');
      btn.hidden = false;
      gsap.fromTo(btn, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1 });
      follow(btn);
      const a = new Audio(voice);
      btn.addEventListener('click', () => {
        if (a.paused) { audio.duck(0.1, 3600); a.play(); btn.innerHTML = '❚❚&nbsp; Pause'; }
        else { a.pause(); audio.duck(1, 0.1); btn.innerHTML = '▶&nbsp; Hear it in my voice'; }
      });
      a.addEventListener('ended', () => { audio.duck(1, 0.1); btn.innerHTML = '▶&nbsp; Hear it again'; });
      this.voiceEl = a;
    }
    await ctx.wait(1.5);
    await ui.waitContinue('Keep going');
    if (this.voiceEl) { this.voiceEl.pause(); audio.duck(1, 0.1); }
    ctx.next();
  },
  async exit() {
    if (this.voiceEl) { this.voiceEl.pause(); this.voiceEl = null; }
  },
};
