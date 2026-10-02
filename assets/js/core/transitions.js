// Scene-to-scene film transitions. Each covers the screen, runs `swap`, then reveals.
const gsap = () => window.gsap;

function tween(target, vars) {
  return new Promise((resolve) => gsap().to(target, { ...vars, onComplete: resolve }));
}

const STYLES = {
  fade: {
    cover: async (el) => {
      el.style.background = '#05020a';
      await tween(el, { opacity: 1, duration: 1.0, ease: 'power2.inOut' });
    },
    reveal: (el) => tween(el, { opacity: 0, duration: 1.5, ease: 'power2.inOut' }),
  },
  glow: {
    cover: async (el) => {
      el.style.background = 'radial-gradient(circle at 50% 55%, #fffaf0 0%, #ffe3a3 30%, #f4c463 55%, #6b3fa0 100%)';
      await tween(el, { opacity: 1, duration: 1.1, ease: 'power2.in' });
    },
    reveal: (el) => tween(el, { opacity: 0, duration: 2.0, ease: 'power2.out' }),
  },
  iris: {
    cover: async (el) => {
      el.style.background = '#05020a';
      el.style.setProperty('--r', '150%');
      const mask = 'radial-gradient(circle at 50% 50%, transparent var(--r), #000 calc(var(--r) + 2px))';
      el.style.webkitMaskImage = mask;
      el.style.maskImage = mask;
      gsap().set(el, { opacity: 1 });
      await tween(el, { '--r': '0%', duration: 1.25, ease: 'power3.in' });
    },
    reveal: async (el) => {
      await tween(el, { '--r': '150%', duration: 1.6, ease: 'power3.out' });
      el.style.webkitMaskImage = el.style.maskImage = '';
      gsap().set(el, { opacity: 0 });
    },
  },
  curtain: {
    cover: async (el) => {
      document.documentElement.style.setProperty('--lb', '50.5vh');
      el.style.background = '#05020a';
      await new Promise((r) => setTimeout(r, 1400));
      gsap().set(el, { opacity: 1 });
    },
    reveal: async (el, { letterbox }) => {
      gsap().set(el, { opacity: 0 });
      document.documentElement.style.setProperty('--lb', letterbox || '0px');
      await new Promise((r) => setTimeout(r, 1500));
    },
  },
  dream: {
    cover: async (el) => {
      el.style.background = 'radial-gradient(ellipse at 50% 50%, rgba(255,240,210,.95), rgba(185,163,227,.9) 55%, #24113d 100%)';
      await tween(el, { opacity: 1, duration: 1.3, ease: 'sine.inOut' });
    },
    reveal: (el) => tween(el, { opacity: 0, duration: 2.2, ease: 'sine.inOut' }),
  },
};

let running = Promise.resolve();

export function transition(type, swap, opts = {}) {
  const el = document.getElementById('transition');
  const style = STYLES[type] || STYLES.fade;
  running = running.then(async () => {
    gsap().killTweensOf(el);
    el.style.mixBlendMode = '';
    await style.cover(el);
    await swap();
    await style.reveal(el, opts);
    el.style.background = '';
  });
  return running;
}
