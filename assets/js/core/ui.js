// Cinematic UI: subtitles, chapter title cards, the continue button, hints.
import { flourishSVG, html } from './art.js';

const gsap = () => window.gsap;

function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((res, rej) => {
    if (signal.aborted) return rej(new DOMException('aborted', 'AbortError'));
    const onAbort = () => rej(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((v) => { signal.removeEventListener('abort', onAbort); res(v); }, rej);
  });
}

export function sleep(seconds, signal) {
  return abortable(new Promise((r) => setTimeout(r, seconds * 1000)), signal);
}

function splitWords(el, text) {
  el.textContent = '';
  const words = String(text).split(/(\s+)/);
  const spans = [];
  for (const w of words) {
    if (!w) continue;
    if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(' ')); continue; }
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = w;
    el.appendChild(s);
    spans.push(s);
  }
  return spans;
}

export function createUI({ audio, reducedMotion }) {
  const subs = document.getElementById('subtitles');
  const card = document.getElementById('chapter-card');
  const cont = document.getElementById('continue');
  const uiRoot = document.getElementById('ui');
  let signal = null;
  let fill = (t) => t;

  function setSignal(s) { signal = s; }
  /** Token filler for owner-written text ({name}, {creator}, {photoCount}…). */
  function setFill(fn) { fill = fn || ((t) => t); }

  /** Show one line; returns { el, out() } */
  function showLine(raw, { style = '', position } = {}) {
    const text = fill(String(raw ?? ''));
    if (position) subs.className = position === 'bottom' ? '' : position;
    const el = document.createElement('div');
    el.className = `sub-line ${style}`;
    const words = splitWords(el, text);
    subs.appendChild(el);
    const g = gsap();
    g.fromTo(words,
      { opacity: 0, y: 14, filter: 'blur(10px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: reducedMotion ? 0.4 : 1.1, ease: 'power3.out', stagger: reducedMotion ? 0 : 0.075 });
    return {
      el,
      duration: words.length * 0.075 + 1.1,
      out(d = 0.9) {
        return new Promise((r) => {
          g.to(words, { opacity: 0, y: -8, filter: 'blur(8px)', duration: d, ease: 'power2.in', stagger: 0.02, onComplete: () => { el.remove(); r(); } });
        });
      },
      kill() { g.killTweensOf(words); el.remove(); },
    };
  }

  /**
   * Show lines one after another. Options: hold (s), gap (s), style ('' | 'big' |
   * 'whisper' | 'title' | 'hand'), position ('bottom' | 'top' | 'center'),
   * duck (0..1 music level while the line is on screen; 'big' lines duck gently by default).
   */
  async function narrate(lines, { hold, gap = 0.45, style = '', position = 'bottom', duck, signal: sig } = {}) {
    const s = sig || signal;
    const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    const duckTo = duck != null ? duck : /\bbig\b/.test(style) ? 0.7 : null;
    for (const text of list) {
      const line = showLine(text, { style, position });
      const words = String(text).split(/\s+/).length;
      const h = hold != null ? hold : Math.max(2.4, 1.0 + words * 0.36);
      if (duckTo != null && audio) audio.duck(duckTo, line.duration * 0.6 + h);
      try {
        await sleep(line.duration * 0.6 + h, s);
        await line.out();
        await sleep(gap, s);
      } catch (e) {
        line.kill();
        throw e;
      }
    }
  }

  function say(text, opts = {}) {
    const line = showLine(text, opts);
    return { hide: () => line.out(), el: line.el };
  }

  function clearSubs() {
    subs.innerHTML = '';
    subs.className = '';
  }

  async function chapterCard(kicker, title, { hold = 2.4, sig } = {}) {
    const s = sig || signal;
    const g = gsap();
    card.innerHTML = '';
    const k = html('<div class="cc-kicker"></div>');
    k.textContent = fill(String(kicker || ''));
    const t = html('<div class="cc-title"></div>');
    const chars = [];
    for (const word of fill(String(title || '')).split(' ')) {
      const wspan = document.createElement('span');
      wspan.style.whiteSpace = 'nowrap';
      wspan.style.display = 'inline-block';
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'ch';
        c.textContent = ch;
        wspan.appendChild(c);
        chars.push(c);
      }
      t.appendChild(wspan);
      t.appendChild(document.createTextNode(' '));
    }
    const orn = html(flourishSVG());
    card.append(k, t, orn);
    g.set(card, { opacity: 1, visibility: 'visible' });
    audio && audio.sfx('shimmer');
    const paths = orn.querySelectorAll('path');
    const tl = g.timeline();
    tl.fromTo(k, { opacity: 0, letterSpacing: '1.1em' }, { opacity: 1, letterSpacing: '.55em', duration: 1.6, ease: 'power3.out' }, 0)
      .fromTo(chars, { opacity: 0, y: 24, filter: 'blur(12px)', scale: 1.15 }, { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, duration: 1.3, ease: 'power3.out', stagger: 0.045 }, 0.25)
      .fromTo(paths, { drawSVG: '50% 50%', opacity: 0 }, { drawSVG: '0% 100%', opacity: 1, duration: 1.6, ease: 'power2.inOut', stagger: 0.05 }, 0.7);
    try {
      await abortable(tl.then(), s);
      await sleep(hold, s);
      await abortable(new Promise((r) => g.to(card, { opacity: 0, filter: 'blur(6px)', duration: 1.1, ease: 'power2.in', onComplete: r })), s);
    } finally {
      g.set(card, { opacity: 0, visibility: 'hidden', filter: 'none' });
      card.innerHTML = '';
    }
  }

  let contResolve = null;
  function waitContinue(label = 'Continue', { delay = 0.6, sig } = {}) {
    const s = sig || signal;
    const g = gsap();
    cont.querySelector('.continue-label').textContent = fill(label);
    return abortable(new Promise((resolve) => {
      setTimeout(() => {
        if (s && s.aborted) return;
        cont.hidden = false;
        g.fromTo(cont, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' });
        contResolve = () => {
          contResolve = null;
          audio && audio.sfx('tap');
          g.to(cont, { opacity: 0, y: 8, duration: 0.4, onComplete: () => (cont.hidden = true) });
          resolve();
        };
      }, delay * 1000);
    }), s).catch((e) => { cont.hidden = true; contResolve = null; throw e; });
  }
  cont.addEventListener('click', () => contResolve && contResolve());
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') && contResolve) {
      e.preventDefault();
      contResolve();
    }
  });

  function hint(text) {
    const el = html(`<div class="hint" role="status"></div>`);
    el.textContent = fill(String(text ?? ''));
    uiRoot.appendChild(el);
    gsap().fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8 });
    return {
      el,
      remove() {
        gsap().to(el, { opacity: 0, duration: 0.5, onComplete: () => el.remove() });
      },
    };
  }

  function reset() {
    clearSubs();
    cont.hidden = true;
    contResolve = null;
    uiRoot.querySelectorAll('.hint').forEach((h) => h.remove());
    card.innerHTML = '';
    gsap().set(card, { opacity: 0, visibility: 'hidden' });
  }

  return { narrate, say, chapterCard, waitContinue, hint, reset, setSignal, setFill, clearSubs, fill: (t) => fill(String(t ?? '')) };
}
