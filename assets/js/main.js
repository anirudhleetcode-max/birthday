// The projector: loads the story, runs chapters in order, and hands every
// chapter a shared `ctx` (photos, words, audio, effects, subtitles…).
import { loadSite, preload } from './core/data.js';
import { createFX } from './core/fx.js';
import { createUI, sleep } from './core/ui.js';
import { transition } from './core/transitions.js';

const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview') || params.has('draft');
const DRAFT = params.has('draft');
const START_AT = params.get('scene');

const gsap = window.gsap;
gsap.registerPlugin(CustomEase, DrawSVGPlugin, MotionPathPlugin, SplitText, Physics2DPlugin);
CustomEase.create('film', '0.65,0,0.35,1');
CustomEase.create('drift', '0.25,0.1,0.25,1');

/* ---------------- device ---------------- */
const ua = navigator.userAgent;
const coarse = matchMedia('(pointer: coarse)').matches;
const mobile = coarse || /Android|iPhone|iPad|iPod/i.test(ua);
const device = {
  mobile,
  lowPower: mobile && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3),
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  get portrait() { return window.innerHeight > window.innerWidth; },
};
document.documentElement.classList.toggle('is-mobile', mobile);

/* ---------------- chapters ---------------- */
const CHAPTERS = [
  { id: 'invite', load: () => import('./scenes/invite.js'), nav: false, via: 'fade' },
  { id: 'prologue', load: () => import('./scenes/prologue.js'), via: 'glow', preload: ['prologue'] },
  { id: 'tower', load: () => import('./scenes/tower.js'), via: 'iris', preload: ['tower'] },
  { id: 'hair', load: () => import('./scenes/hair.js'), via: 'fade', preload: ['hair'] },
  { id: 'names', load: () => import('./scenes/names.js'), via: 'glow', preload: ['names'] },
  { id: 'dance', load: () => import('./scenes/dance.js'), via: 'iris', preload: ['dance'] },
  { id: 'lanterns', load: () => import('./scenes/lanterns.js'), via: 'fade', preload: ['lanterns'] },
  { id: 'cake', load: () => import('./scenes/cake.js'), via: 'curtain' },
  { id: 'letter', load: () => import('./scenes/letter.js'), via: 'glow', preload: ['letter'] },
  { id: 'video', load: () => import('./scenes/video.js'), via: 'fade', when: (s) => !!s.media.video },
  { id: 'finale', load: () => import('./scenes/finale.js'), via: 'fade', preload: ['finale'] },
  { id: 'credits', load: () => import('./scenes/credits.js'), via: 'fade' },
];

/* ---------------- grain texture ---------------- */
function makeGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 180;
  const g = c.getContext('2d');
  const img = g.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  document.getElementById('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

/* ---------------- audio (with a silent fallback) ---------------- */
async function makeAudio(musicUrl) {
  try {
    const mod = await import('./core/audio.js');
    return mod.createAudio({ musicUrl });
  } catch (err) {
    console.warn('[audio] unavailable', err);
    const noop = () => {};
    return {
      unlock: async () => {}, startTheme: noop, setMood: noop, duck: noop, happyBirthday: async () => {},
      sfx: noop, toggleMute: () => true, muted: true, setVolume: noop, context: null, stop: noop,
    };
  }
}

/* ---------------- app ---------------- */
const app = {
  store: null,
  audio: null,
  fx: null,
  ui: null,
  list: [],
  index: -1,
  current: null,
  seen: new Set(),
  busy: false,
  lbTarget: '0px',
  curtainClosed: false,
};

function letterbox(on) {
  const v = on === true ? (device.portrait ? '5.5vh' : '9vh') : on ? String(on) : '0px';
  app.lbTarget = v;
  if (!app.curtainClosed) document.documentElement.style.setProperty('--lb', v);
}

function chapterOf(id) { return app.store.chapter(id); }

function preloadChapter(def) {
  if (!def || !def.preload) return;
  for (const ch of def.preload) for (const p of chapterOf(ch)) preload(p.url);
}

function buildProgress() {
  const nav = document.getElementById('progress');
  nav.innerHTML = '';
  app.list.forEach((def, i) => {
    if (def.nav === false) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.i = i;
    b.setAttribute('aria-label', def.title || def.id);
    b.disabled = true;
    b.addEventListener('click', () => {
      if (!b.disabled && i !== app.index && !app.busy) goTo(i);
    });
    nav.appendChild(b);
  });
}

function updateProgress() {
  const nav = document.getElementById('progress');
  nav.classList.toggle('on', app.index > 0 && app.list[app.index]?.nav !== false);
  nav.querySelectorAll('button').forEach((b) => {
    const i = Number(b.dataset.i);
    b.classList.toggle('now', i === app.index);
    b.classList.toggle('seen', app.seen.has(i));
    b.disabled = !app.seen.has(i);
  });
}

function makeCtx(def, ac) {
  const { store, audio, fx, ui } = app;
  let nexted = false;
  const ctx = {
    id: def.id,
    site: store.site,
    text: store.text,
    store,
    photo: (id) => store.photo(id),
    chapter: (name) => store.chapter(name),
    extras: () => store.extras(),
    allPhotos: () => store.all(),
    media: (key) => store.mediaUrl(key),
    preload,
    gsap,
    audio,
    fx,
    ui,
    device,
    signal: ac.signal,
    wait: (s) => sleep(s, ac.signal),
    letterbox,
    next() {
      if (nexted || ac.signal.aborted) return;
      nexted = true;
      goTo(app.index + 1);
    },
    restart() { goTo(app.list.findIndex((c) => c.id === 'prologue')); },
    immersive: requestImmersive,
    startSound: () => app.startSound(),
  };
  ctx.openGallery = async (opts) => (await import('./scenes/gallery.js')).openGallery(ctx, opts);
  return ctx;
}

async function goTo(index, { instant = false } = {}) {
  if (index < 0 || index >= app.list.length || app.busy) return;
  app.busy = true;
  const def = app.list[index];
  let mod;
  try {
    mod = (await def.load()).default;
  } catch (err) {
    console.error(`[scene] failed to load ${def.id}`, err);
    app.busy = false;
    if (index + 1 < app.list.length) return goTo(index + 1, { instant });
    return;
  }

  const swap = async () => {
    const prev = app.current;
    if (prev) {
      prev.ac.abort();
      try { await prev.mod.exit?.(); } catch (e) { console.warn(e); }
      gsap.killTweensOf([prev.el, ...prev.el.querySelectorAll('*')]);
      prev.el.remove();
    }
    app.ui.reset();
    app.fx.clear();
    letterbox(false);
    const el = document.createElement('section');
    el.className = `scene scene-${def.id}`;
    document.getElementById('stage').appendChild(el);
    const ac = new AbortController();
    const ctx = makeCtx(def, ac);
    app.ui.setSignal(ac.signal);
    app.current = { def, mod, el, ac, ctx };
    app.index = index;
    app.seen.add(index);
    updateProgress();
    Promise.resolve()
      .then(() => mod.enter(ctx, el))
      .catch((err) => { if (err?.name !== 'AbortError') console.error(`[scene ${def.id}]`, err); });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await sleep(0.25);
    preloadChapter(app.list[index + 1]);
  };

  if (instant) {
    await swap();
  } else {
    if (def.via === 'curtain') app.curtainClosed = true;
    await transition(def.via || 'fade', async () => {
      await swap();
      app.curtainClosed = false;
    }, { get letterbox() { return app.lbTarget; } });
    if (def.via === 'curtain') document.documentElement.style.setProperty('--lb', app.lbTarget);
  }
  app.busy = false;
}

let wakeLock = null;
async function requestImmersive() {
  try {
    if (device.mobile && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch { /* not supported (iOS) — fine */ }
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && wakeLock?.released) {
          try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
        }
      });
    }
  } catch { /* ignore */ }
}

function setupMute() {
  const btn = document.getElementById('mute');
  const sync = () => {
    btn.classList.toggle('muted', !!app.audio.muted);
    btn.setAttribute('aria-label', app.audio.muted ? 'Play music' : 'Mute music');
  };
  btn.addEventListener('click', () => { app.audio.toggleMute(); sync(); });
  sync();
  app.showMute = () => { btn.hidden = false; gsap.fromTo(btn, { opacity: 0 }, { opacity: 0.7, duration: 1 }); sync(); };
}

function isLocked(site) {
  const lock = site.settings && site.settings.lock;
  if (!lock || !lock.enabled || PREVIEW) return false;
  const at = Date.parse(lock.unlockAt);
  return Number.isFinite(at) && Date.now() < at;
}

async function boot() {
  makeGrain();
  app.ui = null;
  try {
    app.store = await loadSite({ draft: DRAFT });
  } catch (err) {
    console.error(err);
    document.querySelector('.boot-text').textContent = 'Something went wrong loading the story. Please refresh.';
    return;
  }
  const { store } = app;
  document.title = `For ${store.site.her?.name || 'you'}`;

  app.audio = await makeAudio(store.mediaUrl('music'));
  app.fx = createFX({ dustCanvas: document.getElementById('dust'), fxCanvas: document.getElementById('fx'), device });
  app.ui = createUI({ audio: app.audio, reducedMotion: device.reducedMotion });
  app.list = CHAPTERS.filter((c) => !c.when || c.when(store));
  setupMute();
  buildProgress();

  // fonts matter for the very first frame
  try { await Promise.race([document.fonts.ready, sleep(2.5)]); } catch { /* ignore */ }
  preloadChapter(app.list[1]);

  const boot = document.getElementById('boot');
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 1400);

  if (isLocked(store.site)) {
    const gate = { id: 'gate', load: () => import('./scenes/gate.js'), nav: false, via: 'fade' };
    app.list = [gate, ...app.list];
    buildProgress();
    return goTo(0, { instant: true });
  }

  if (START_AT && PREVIEW) {
    const i = app.list.findIndex((c) => c.id === START_AT);
    if (i > 0) {
      // jumping straight in (testing): unlock audio on first tap
      window.addEventListener('pointerdown', async () => { await app.audio.unlock(); app.audio.startTheme(); app.showMute(); }, { once: true });
      return goTo(i, { instant: true });
    }
  }
  return goTo(0, { instant: true });
}

// exposed for the invite scene (first gesture unlocks sound) and for debugging
window.__film = app;
app.startSound = async () => {
  await app.audio.unlock();
  app.audio.startTheme();
  app.showMute && app.showMute();
};

boot();
