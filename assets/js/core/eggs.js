// Little secrets hidden around the film. Finding one shows a soft golden toast;
// the credits can say how many she found. Nothing ever depends on them.

const KEY = 'deepu-secrets';

/** Every secret in the film, so the credits can say "3 of 7". Chapters register theirs here. */
export const SECRETS = {
  'sun-taps': 'The sun remembers you',
  'pan': 'A very important frying pan',
  'chameleon': 'A small, shy friend',
  'pink-lantern': 'The pink lantern',
  'constellation': 'Your name in the stars',
  'cake-wish': 'An extra wish',
  'keyboard': 'You typed the magic word',
  'post-credits': 'You stayed after the credits',
};

function read() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}
function write(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode — fine */ }
}

let found = read();
const listeners = new Set();

export function createEggs({ audio, fx } = {}) {
  const root = document.getElementById('ui');

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'egg-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="egg-star" aria-hidden="true">✦</span><span class="egg-text"></span>';
    el.querySelector('.egg-text').textContent = text;
    root.appendChild(el);
    const g = window.gsap;
    g.fromTo(el, { opacity: 0, y: -14, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out' });
    g.to(el, { opacity: 0, y: -8, duration: 0.8, delay: 4.2, ease: 'power2.in', onComplete: () => el.remove() });
  }

  return {
    /** Mark a secret as found. `message` (optional) is shown in the toast. */
    found(id, message) {
      const isNew = !found.has(id);
      found.add(id);
      write(found);
      if (isNew) {
        audio && audio.sfx('sparkle');
        toast(message || `Secret found · ${SECRETS[id] || 'a little secret'}`);
        listeners.forEach((fn) => fn(id));
      }
      return isNew;
    },
    has(id) { return found.has(id); },
    get count() { return [...found].filter((id) => id in SECRETS).length; },
    get total() { return Object.keys(SECRETS).length; },
    onFound(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { found = new Set(); write(found); },
    toast,
  };
}
