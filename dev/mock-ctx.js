// A small stand-in for the orchestrator's `ctx`, so a single scene can be
// developed and screenshotted on its own. Query params:
//   ?fast=1      shorter chapter card / narration
//   ?mobile=1 &low=1 &reduced=1   force device flags
//   ?nocard=1    skip the chapter card
export function createMockCtx({ site, root }) {
  const q = new URLSearchParams(location.search);
  const fast = q.has('fast');
  const ctrl = new AbortController();
  const log = (...a) => console.log('%c[ctx]', 'color:#c9a0ff', ...a);
  const css = document.createElement('style');
  css.textContent = `
    .mk-sub{position:fixed;left:0;right:0;bottom:22%;text-align:center;font:italic 400 clamp(20px,4.6vw,30px)/1.3 "Cormorant Garamond",Georgia,serif;color:#fbefd9;text-shadow:0 2px 18px rgba(0,0,0,.9);padding:0 24px;pointer-events:none;opacity:0;transition:opacity .6s ease;z-index:30}
    .mk-sub.on{opacity:1}
    .mk-card{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#05020a;color:#f4c463;z-index:40;transition:opacity .8s ease;pointer-events:none}
    .mk-card small{font:500 13px/1 Cinzel,serif;letter-spacing:.4em;text-transform:uppercase;opacity:.8;margin-bottom:14px}
    .mk-card b{font:400 clamp(34px,8vw,64px)/1.1 "Cinzel Decorative",serif;color:#fff1d6}
    .mk-hint{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 38px);transform:translateX(-50%);padding:10px 18px;border-radius:999px;background:rgba(30,14,50,.7);border:1px solid rgba(244,196,99,.45);color:#f6e7c9;font:500 15px/1.2 "Cormorant Garamond",serif;z-index:31;white-space:nowrap;box-shadow:0 0 22px rgba(244,196,99,.25);pointer-events:none}
    .mk-cont{position:fixed;left:50%;bottom:12%;transform:translateX(-50%);padding:12px 26px;border-radius:999px;background:linear-gradient(#f4c463,#d9a23c);color:#2a1500;border:0;font:600 15px/1 Cinzel,serif;letter-spacing:.12em;z-index:35;cursor:pointer}
    #mk-fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:25}
    .mk-flash{position:fixed;inset:0;pointer-events:none;z-index:26;opacity:0}
  `;
  document.head.appendChild(css);

  // ---- tiny 2D fx layer (just enough to judge composition) ----
  const fxc = document.createElement('canvas'); fxc.id = 'mk-fx'; document.body.appendChild(fxc);
  const g = fxc.getContext('2d');
  const parts = [];
  const fit = () => { fxc.width = innerWidth * devicePixelRatio; fxc.height = innerHeight * devicePixelRatio; g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
  fit(); addEventListener('resize', fit);
  let rafId = 0;
  const loop = () => {
    rafId = requestAnimationFrame(loop);
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += 1 / 60;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      const k = 1 - p.age / p.life;
      if (p.kind === 'puff') {
        const r = p.size * (0.4 + 0.6 * Math.sqrt(p.age / p.life));
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, p.color + Math.round(70 * k).toString(16).padStart(2, '0'));
        gr.addColorStop(1, p.color + '00');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
        continue;
      }
      p.vy += p.kind === 'spark' ? 0.02 : 0.22; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, k * 2);
      g.fillStyle = p.color;
      if (p.kind === 'spark') { g.beginPath(); g.arc(0, 0, p.size * k, 0, 7); g.fill(); }
      else g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      g.restore();
    }
  };
  loop();
  const COLS = ['#f4c463', '#f2a7c3', '#c7b2ec', '#ffffff', '#9fc3ee'];
  const confetti = ({ x, y, angle = -90, spread = 60, count = 80, power = 1, colors = COLS }) => {
    for (let i = 0; i < count; i++) {
      const a = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180;
      const v = (8 + Math.random() * 10) * power;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, size: 7 + Math.random() * 6, color: colors[i % colors.length], age: 0, life: 3 + Math.random() });
    }
  };
  const flashEl = document.createElement('div'); flashEl.className = 'mk-flash'; document.body.appendChild(flashEl);

  const fx = {
    confetti(o) { log('fx.confetti', o); confetti(o); },
    cannons() { log('fx.cannons'); confetti({ x: 0, y: innerHeight, angle: -60, spread: 30, count: 90, power: 1.4 }); confetti({ x: innerWidth, y: innerHeight, angle: -120, spread: 30, count: 90, power: 1.4 }); },
    colorBurst({ x, y, colors = COLS, size = 200 }) { log('fx.colorBurst', x | 0, y | 0); colors.forEach((c, i) => parts.push({ kind: 'puff', x: x + (Math.random() - 0.5) * size * 0.4, y: y + (Math.random() - 0.5) * size * 0.4, size: size * (0.6 + i * 0.15), color: c.length === 7 ? c : '#ffffff', age: 0, life: 2.2 })); },
    sparkle(x, y, count = 12) { log('fx.sparkle', x | 0, y | 0, count); for (let i = 0; i < count; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 3; parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: 0, vr: 0, size: 2 + Math.random() * 2.5, color: '#fff2c4', age: 0, life: 0.8 + Math.random() * 0.6 }); } },
    flash({ color = '#fff', duration = 0.6 } = {}) { log('fx.flash', color, duration); flashEl.style.transition = 'none'; flashEl.style.background = color; flashEl.style.opacity = '0.85'; requestAnimationFrame(() => { flashEl.style.transition = `opacity ${duration}s ease-out`; flashEl.style.opacity = '0'; }); },
  };

  const wait = (s) => new Promise((res, rej) => {
    if (ctrl.signal.aborted) return rej(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(res, s * 1000);
    ctrl.signal.addEventListener('abort', () => { clearTimeout(id); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

  const sub = document.createElement('div'); sub.className = 'mk-sub'; document.body.appendChild(sub);
  const ui = {
    async chapterCard(kicker, title) {
      log('ui.chapterCard', kicker, title);
      if (q.has('nocard')) return;
      const c = document.createElement('div'); c.className = 'mk-card';
      c.innerHTML = `<small>${kicker}</small><b>${title}</b>`;
      document.body.appendChild(c);
      await wait(fast ? 1.0 : 3.0).catch(() => {});
      c.style.opacity = '0';
      await wait(0.6).catch(() => {});
      c.remove();
    },
    async narrate(lines, { hold, gap } = {}) {
      log('ui.narrate', lines);
      for (const line of lines) {
        sub.textContent = line; sub.classList.add('on');
        await wait(hold ?? (fast ? 1.0 : 1.4 + line.length * 0.045));
        sub.classList.remove('on');
        await wait(gap ?? (fast ? 0.3 : 0.6));
      }
    },
    say(text) { log('ui.say', text); sub.textContent = text; sub.classList.add('on'); return { hide: async () => sub.classList.remove('on') }; },
    hint(text) {
      log('ui.hint', text);
      const h = document.createElement('div'); h.className = 'mk-hint'; h.textContent = text; document.body.appendChild(h);
      return { remove() { log('ui.hint.remove', text); h.remove(); } };
    },
    waitContinue(label = 'Continue') {
      log('ui.waitContinue', label);
      return new Promise((res, rej) => {
        const b = document.createElement('button'); b.className = 'mk-cont'; b.textContent = label;
        b.onclick = () => { b.remove(); res(); };
        document.body.appendChild(b);
        ctrl.signal.addEventListener('abort', () => { b.remove(); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
    },
  };

  const audio = {
    sfx(name) { log('audio.sfx', name); },
    setMood(m) { log('audio.setMood', m); },
    duck(a, s) { log('audio.duck', a, s); },
    happyBirthday() { log('audio.happyBirthday'); return wait(8).catch(() => {}); },
    context: null,
  };

  const coarse = matchMedia('(pointer: coarse)').matches;
  const device = {
    mobile: q.has('mobile') || coarse || innerWidth < 760,
    lowPower: q.has('low'),
    reducedMotion: q.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches,
    dpr: devicePixelRatio,
  };

  const ctx = {
    site, text: site.text,
    photo: (id) => ({ id, url: '', ratio: 1, ratioStr: '1/1', caption: '', isPlaceholder: true }),
    gsap: window.gsap, audio, fx, ui,
    next() { log('ctx.next() — chapter finished'); window.__nextCalled = true; },
    wait, signal: ctrl.signal, device,
  };
  return {
    ctx,
    abort() { ctrl.abort(); },
    destroyFx() { cancelAnimationFrame(rafId); fxc.remove(); flashEl.remove(); sub.remove(); css.remove(); },
  };
}
