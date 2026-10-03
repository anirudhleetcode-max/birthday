// End credits, like the end of an animated film:
// "A little birthday film for…" → her name → rolling credits over a slow
// Ken Burns slideshow of her photos, faint lanterns drifting behind, the little
// chameleon's cameo → the end card → and, for whoever waits, a post-credits scene.
import { esc, lanternSVG, sunEmblem } from '../core/art.js';
import { createChameleon } from '../core/chameleon.js';

const KB = {
  'kenburns-in': { from: { scale: 1.02, xPercent: 0, yPercent: 0 }, to: { scale: 1.14, xPercent: 0, yPercent: -1.5 } },
  'kenburns-out': { from: { scale: 1.16, xPercent: 0, yPercent: -1.5 }, to: { scale: 1.03, xPercent: 0, yPercent: 0 } },
  'pan-left': { from: { scale: 1.12, xPercent: 3, yPercent: 0 }, to: { scale: 1.12, xPercent: -3, yPercent: 0 } },
  'pan-right': { from: { scale: 1.12, xPercent: -3, yPercent: 0 }, to: { scale: 1.12, xPercent: 3, yPercent: 0 } },
  drift: { from: { scale: 1.08, xPercent: -1.5, yPercent: 1 }, to: { scale: 1.1, xPercent: 1.5, yPercent: -1 } },
  none: { from: { scale: 1.04, xPercent: 0, yPercent: 0 }, to: { scale: 1.04, xPercent: 0, yPercent: 0 } },
};

export default {
  id: 'credits',
  title: 'Credits',
  async enter(ctx, el) {
    const { gsap, audio, fx, device, eggs } = ctx;
    const reduced = device.reducedMotion;
    const t = ctx.text.credits || {};
    const her = ctx.site.her || {};
    const real = ctx.realPhotos();
    const reel = (real.length ? real : ctx.allPhotos()).slice();
    const extras = ctx.extras();
    const roles = (Array.isArray(t.roles) && t.roles.length ? t.roles : t.lines || [])
      .filter((r) => Array.isArray(r) && (!r[1] || ctx.fill(r[1]))); // a credit built on an unwritten memory is left out
    this.timers = [];
    this.cleanup = [];

    const lanterns = Array.from({ length: device.tier === 'low' ? 6 : 12 }, (_, i) => {
      const left = (i * 37 + 11) % 96;
      const s = 0.35 + ((i * 7) % 5) / 10;
      const dur = 26 + ((i * 13) % 18);
      return `<i class="cr-lantern" style="left:${left}%;--s:${s};--dur:${dur}s;--delay:${-((i * 9) % dur)}s">${lanternSVG({ lit: true })}</i>`;
    }).join('');

    el.innerHTML = `
      <div class="cr-reel" aria-hidden="true"><div class="cr-frame"></div></div>
      <div class="cr-shade" aria-hidden="true"></div>
      <div class="cr-lanterns" aria-hidden="true">${lanterns}</div>
      <div class="cr-open" aria-live="polite">
        <p class="cr-open-kicker">${esc(ctx.fill(t.opening || 'A little birthday film for…'))}</p>
        <h2 class="cr-open-name">${esc(her.name || '')}</h2>
      </div>
      <div class="cr-roll" aria-hidden="true"><div class="cr-list">
        <div class="cr-sun">${sunEmblem({ glow: false })}</div>
        ${roles.map(([role, name]) => `
          <div class="cr-item">${role ? `<p class="cr-role">${esc(ctx.fill(role))}</p>` : ''}<p class="cr-name ${role ? '' : 'cr-note'}">${esc(ctx.fill(name))}</p></div>`).join('')}
      </div></div>
      <div class="cr-sr sr-only">${roles.map(([r, n]) => esc(ctx.fill(`${r} ${n}`))).join('. ')}</div>
      <div class="cr-end">
        <p class="cr-the-end">${esc(ctx.fill(t.end || 'The end.'))}</p>
        <p class="cr-end-sub">${esc(ctx.fill(t.endSub || ''))}</p>
        <div class="cr-actions">
          ${extras.length ? `<button type="button" class="btn-gold cr-more">${esc(ctx.fill(t.extrasTitle || 'More memories'))}</button>` : ''}
          <button type="button" class="btn-ghost cr-album">Every photo</button>
          <button type="button" class="btn-ghost cr-again">↺ &nbsp;Watch again</button>
        </div>
        <p class="cr-secrets"></p>
        <button type="button" class="cr-wait">wait…</button>
      </div>
      <div class="cr-post" hidden>
        <div class="cr-post-slice" aria-hidden="true">
          <svg viewBox="0 0 120 80"><path d="M10 62 L110 62 L104 40 Z" fill="#f6ead6"/><path d="M10 62 L104 40 L104 50 L10 70 Z" fill="#e9b7cf"/><path d="M10 70 L104 50 L110 62 L110 66 L10 74 Z" fill="#c99bdd"/><path d="M14 60 L104 40" stroke="#f4c463" stroke-width="2.5" stroke-linecap="round"/></svg>
        </div>
        <p class="cr-post-line" aria-live="polite"></p>
      </div>`;

    const frame = el.querySelector('.cr-frame');
    const open = el.querySelector('.cr-open');
    const list = el.querySelector('.cr-list');
    const end = el.querySelector('.cr-end');
    const post = el.querySelector('.cr-post');
    gsap.set([end, open], { autoAlpha: 0 });
    gsap.set(list, { y: window.innerHeight * 0.92 }); // parked below the frame until the roll starts
    ctx.letterbox(true);
    fx.dust({ density: 0.3 });
    audio.setMood('tender');

    // ---------- Ken Burns slideshow (honours each photo's animation/duration hints) ----------
    let idx = 0;
    let stopped = false;
    const show = async () => {
      if (stopped || !reel.length) return;
      const p = reel[idx % reel.length];
      idx++;
      await ctx.preload(p.url);
      if (stopped) return;
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = '';
      img.style.objectPosition = p.objectPosition;
      frame.appendChild(img);
      const hold = Math.max(3, Math.min(10, p.duration || 4.6));
      const move = reduced ? KB.none : KB[p.animation] || (idx % 2 ? KB['kenburns-in'] : KB['pan-left']);
      gsap.fromTo(img, { opacity: 0, ...move.from }, { opacity: 1, ...move.to, duration: hold + 2, ease: 'none' });
      gsap.to(img, { opacity: 0, duration: 1.4, delay: hold + 0.6, onComplete: () => img.remove() });
      this.timers.push(setTimeout(show, hold * 1000));
    };
    this.cleanup.push(() => { stopped = true; });

    // ---------- opening card ----------
    const nameEl = open.querySelector('.cr-open-name');
    gsap.set(open, { autoAlpha: 1 });
    gsap.fromTo(open.querySelector('.cr-open-kicker'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.6, ease: 'power2.out' });
    gsap.fromTo(nameEl, { opacity: 0, scale: 1.08, filter: 'blur(12px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 2.4, delay: 1.2, ease: 'power3.out' });
    audio.sfx('shimmer');
    await ctx.wait(reduced ? 3 : 5.4);
    await gsap.to(open, { autoAlpha: 0, filter: 'blur(8px)', duration: 1.2, ease: 'power2.in' }).then();
    show();

    // ---------- the chameleon's cameo, halfway through the roll ----------
    let cham = null;
    const cameo = async () => {
      if (stopped) return;
      cham = createChameleon(el, { size: device.mobile ? 86 : 110, onTap: () => {
        cham.react('proud');
        eggs.found('chameleon', 'You found the little one. It’s shy.');
      } });
      cham.el.style.bottom = `calc(var(--lb, 0px) + 2vh)`;
      cham.el.style.left = '-130px';
      cham.el.setAttribute('aria-label', 'A tiny chameleon');
      await cham.peek('bottom');
      const walk = gsap.to(cham.el, { left: `calc(100vw + 20px)`, duration: reduced ? 6 : 16, ease: 'none' });
      this.timers.push(setTimeout(() => cham && cham.react('happy'), 4500));
      await walk.then();
      if (cham) { cham.destroy(); cham = null; }
    };
    this.cleanup.push(() => { if (cham) { cham.destroy(); cham = null; } });

    // ---------- the roll ----------
    const vh = window.innerHeight;
    const rollH = list.scrollHeight;
    const pxPerSec = device.mobile ? 36 : 44;
    const duration = Math.max(24, (rollH + vh) / pxPerSec) * (reduced ? 0.7 : 1);
    this.timers.push(setTimeout(() => { cameo(); }, duration * 450));
    await gsap.fromTo(list, { y: vh * 0.92 }, { y: -rollH - 30, duration, ease: 'none' }).then();

    // ---------- the end card ----------
    audio.setMood('quiet');
    gsap.to(el.querySelector('.cr-reel'), { opacity: 0.28, duration: 2 });
    gsap.set(end, { autoAlpha: 1 });
    const theEnd = end.querySelector('.cr-the-end');
    const sub = end.querySelector('.cr-end-sub');
    const acts = end.querySelector('.cr-actions');
    const secrets = end.querySelector('.cr-secrets');
    const wait = end.querySelector('.cr-wait');
    secrets.textContent = ctx.fill(String(t.secrets || 'Secrets found: {found} of {total}').replace('{found}', eggs.count).replace('{total}', eggs.total));
    gsap.set([acts, secrets, wait], { opacity: 0 });
    gsap.fromTo(theEnd, { opacity: 0, filter: 'blur(12px)', letterSpacing: '0.4em' }, { opacity: 1, filter: 'blur(0px)', letterSpacing: '0.12em', duration: 2.6, ease: 'power3.out' });
    await ctx.wait(2.6);
    audio.sfx('magic');
    audio.setMood('tender');
    gsap.fromTo(sub, { opacity: 0, scale: 0.92, filter: 'blur(10px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 2.2, ease: 'power3.out' });
    this.timers.push(setTimeout(() => {
      const r = sub.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, 34, { spread: r.width / 2 });
    }, 900));
    gsap.to(acts, { opacity: 1, y: 0, duration: 1.2, delay: 2.4 });
    gsap.to(secrets, { opacity: 0.7, duration: 1.2, delay: 3.2 });
    gsap.to(wait, { opacity: 0.55, duration: 1.2, delay: 5 });

    const more = end.querySelector('.cr-more');
    more && more.addEventListener('click', () => ctx.openGallery({ only: 'extras' }));
    end.querySelector('.cr-album').addEventListener('click', () => ctx.openGallery({ only: 'all' }));
    end.querySelector('.cr-again').addEventListener('click', () => ctx.restart());

    // ---------- post-credits (for whoever waits) ----------
    let posted = false;
    const postCredits = async () => {
      if (posted || ctx.signal.aborted) return;
      posted = true;
      const lines = (t.postCredits && t.postCredits.length ? t.postCredits : ['Wait. Where did the last slice go?']).map((l) => ctx.fill(l));
      gsap.to(end, { autoAlpha: 0, duration: 1 });
      post.hidden = false;
      gsap.fromTo(post, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 });
      const line = post.querySelector('.cr-post-line');
      const slice = post.querySelector('.cr-post-slice');
      gsap.fromTo(slice, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'back.out(1.6)' });
      audio.sfx('scratch');
      const pc = createChameleon(post, { size: device.mobile ? 96 : 120 });
      pc.el.classList.add('cr-post-chm');
      this.cleanup.push(() => pc.destroy());
      for (let i = 0; i < lines.length; i++) {
        if (ctx.signal.aborted) return;
        line.textContent = lines[i];
        gsap.fromTo(line, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.8 });
        if (i === 0) await pc.peek('right');
        if (i === 1) { pc.colorTo('#f6ead6'); pc.blush(); gsap.to(slice, { opacity: 0, scale: 0.6, duration: 1.4, delay: 0.6 }); }
        if (i === 2) pc.react('happy');
        await ctx.wait(3.2);
      }
      eggs.found('post-credits', 'You stayed after the credits. Of course you did.');
      await ctx.wait(1.5);
      gsap.to(post, { autoAlpha: 0, duration: 1 });
      gsap.to(end, { autoAlpha: 1, duration: 1.2 });
      gsap.to(wait, { opacity: 0, duration: 0.3 });
      secrets.textContent = ctx.fill(String(t.secrets || 'Secrets found: {found} of {total}').replace('{found}', eggs.count).replace('{total}', eggs.total));
    };
    wait.addEventListener('click', postCredits);
    this.timers.push(setTimeout(postCredits, 14000));
  },
  async exit() {
    (this.timers || []).forEach(clearTimeout);
    (this.cleanup || []).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    this.timers = [];
    this.cleanup = [];
  },
};
