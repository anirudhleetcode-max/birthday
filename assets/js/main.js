// The projector: loads the story, runs chapters in order, and hands every
// chapter a shared `ctx` (photos, words, audio, effects, subtitles…).
// See docs/ARCHITECTURE.md for the full contract.
import { loadSite, preload } from './core/data.js';
import { createFX } from './core/fx.js';
import { createUI, sleep } from './core/ui.js';
import { transition } from './core/transitions.js';
import { createEggs } from './core/eggs.js';

const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview') || params.has('draft');
const DRAFT = params.has('draft');
const START_AT = params.get('scene');

const gsap = window.gsap;
gsap.registerPlugin(CustomEase, DrawSVGPlugin, MotionPathPlugin, SplitText, Physics2DPlugin);
CustomEase.create('film', '0.65,0,0.35,1');
CustomEase.create('drift', '0.25,0.1,0.25,1');

/* ---------------- device & quality ---------------- */
const ua = navigator.userAgent;
const coarse = matchMedia('(pointer: coarse)').matches;
const mobile = coarse || /Android|iPhone|iPad|iPod/i.test(ua);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const lowPower = params.has('low') || (mobile && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3));
const device = {
  mobile,
  lowPower,
  reducedMotion,
  /** 'low' | 'mid' | 'high' — scale particles, shadows, post effects by this. */
  tier: lowPower ? 'low' : mobile ? 'mid' : 'high',
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  get portrait() { return window.innerHeight > window.innerWidth; },
};
const root = document.documentElement;
root.classList.toggle('is-mobile', mobile);
root.classList.toggle('low-power', lowPower);
root.classList.toggle('reduced-motion', reducedMotion);
if (reducedMotion) gsap.globalTimeline.timeScale(1); // scenes shorten their own motion

/* ---------------- chapters (story order) ----------------
   via   — the film transition INTO this chapter (see core/transitions.js)
   grade — the whole-film colour grade while this chapter plays
   mood  — suggested music mood on entry (chapters may refine it)          */
const CHAPTERS = [
  { id: 'invite', load: () => import('./scenes/invite.js'), nav: false, via: 'fade', grade: 'night' },
  { id: 'prologue', title: 'Once Upon a Deepu', load: () => import('./scenes/prologue.js'), via: 'lantern', grade: 'dawn', preload: ['prologue'] },
  { id: 'tower', title: 'A Tower Full of You', load: () => import('./scenes/tower.js'), via: 'sun', grade: 'day', preload: ['tower'] },
  { id: 'hair', title: 'The Golden Thread', load: () => import('./scenes/hair.js'), via: 'ribbon', grade: 'sunset', preload: ['hair'] },
  { id: 'names', title: 'A Legend of Many Names', load: () => import('./scenes/names.js'), via: 'ember', grade: 'sunset', preload: ['names'] },
  { id: 'dance', title: 'Somewhere Between Chaos and Magic', load: () => import('./scenes/dance.js'), via: 'petals', grade: 'twilight', preload: ['dance'] },
  { id: 'lanterns', title: 'The Night of Lanterns', load: () => import('./scenes/lanterns.js'), via: 'lantern', grade: 'night', preload: ['lanterns'] },
  { id: 'letter', title: 'A Letter You Were Supposed to Read', load: () => import('./scenes/letter.js'), via: 'ember', grade: 'candle', preload: ['letter'] },
  { id: 'cake', title: 'Twenty Candles', load: () => import('./scenes/cake.js'), via: 'curtain', grade: 'candle' },
  { id: 'video', title: 'A Little Message', load: () => import('./scenes/video.js'), via: 'fade', grade: 'candle', when: (s) => !!s.media.video },
  { id: 'constellation', title: 'Every Little Piece of You', load: () => import('./scenes/constellation.js'), via: 'dust', grade: 'deep', preload: ['finale', 'album'] },
  { id: 'birthday', title: 'The Last Lantern', load: () => import('./scenes/birthday.js'), via: 'none', grade: 'golden' },
  { id: 'hug', title: 'One Last Thing', load: () => import('./scenes/hug.js'), via: 'ember', grade: 'golden' },
  { id: 'credits', title: 'Credits', load: () => import('./scenes/credits.js'), via: 'fade', grade: 'deep' },
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
  eggs: null,
  list: [],
  index: -1,
  current: null,
  seen: new Set(),
  busy: false,
  lbTarget: '0px',
  curtainClosed: false,
  handoff: null,
};

function letterbox(on) {
  const v = on === true ? (device.portrait ? '5.5vh' : '9vh') : on ? String(on) : '0px';
  app.lbTarget = v;
  if (!app.curtainClosed) root.style.setProperty('--lb', v);
}

/** The whole-film colour grade: night → dawn → day → sunset → twilight → night → candle → deep → golden. */
function setGrade(name) {
  const el = document.getElementById('grade');
  el.dataset.grade = name || 'night';
}

function preloadChapter(def) {
  if (!def || !def.preload) return;
  for (const ch of def.preload) for (const p of app.store.photos(ch)) preload(p.url);
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
    b.title = def.title || def.id;
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
    if (i === app.index) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  });
}

function makeCtx(def, ac) {
  const { store, audio, fx, ui, eggs } = app;
  let nexted = false;
  const ctx = {
    id: def.id,
    title: def.title,
    site: store.site,
    text: store.text,
    store,
    // photos — always data-driven; never hard-code ids in chapters
    photos: (chapter, opts) => store.photos(chapter, opts),
    chapter: (name) => store.photos(name),
    photo: (id) => store.photo(id),
    role: (role) => store.role(role),
    featured: () => store.featured(),
    heroHair: () => store.heroHair(),
    extras: () => store.extras(),
    allPhotos: () => store.all(),
    realPhotos: () => store.real(),
    media: (key) => store.mediaUrl(key),
    daysAlive: (when) => store.daysAlive(when),
    /** Replace {name} {nick1} {nick2} {creator} {photoCount} {days} {age} in owner-written text. */
    fill: (str) => app.fill(str),
    preload,
    gsap,
    audio,
    fx,
    ui,
    eggs,
    device,
    theme: store.site.settings.theme || {},
    signal: ac.signal,
    wait: (s) => sleep(s, ac.signal),
    letterbox,
    grade: setGrade,
    /** Tell the next transition where the light should come from (continuity). */
    handoff(info) { app.handoff = { ...(info || {}), from: def.id }; },
    next(info) {
      if (nexted || ac.signal.aborted) return;
      nexted = true;
      if (info) ctx.handoff(info);
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
    setGrade(def.grade);
    const el = document.createElement('section');
    el.className = `scene scene-${def.id}`;
    el.setAttribute('aria-label', def.title || def.id);
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

  const handoff = app.handoff;
  app.handoff = null;
  // the owner can switch the decorative golden ribbon off (admin → Theme)
  const via = def.via === 'ribbon' && app.store.site.settings.theme?.ribbon === false ? 'glow' : def.via;
  if (instant || via === 'none') {
    await swap();
  } else {
    if (via === 'curtain') app.curtainClosed = true;
    await transition(via || 'fade', async () => {
      await swap();
      app.curtainClosed = false;
    }, { get letterbox() { return app.lbTarget; }, handoff, to: def.id, device, audio: app.audio });
    if (via === 'curtain') root.style.setProperty('--lb', app.lbTarget);
  }
  app.busy = false;
}

let wakeLock = null;
async function requestImmersive() {
  try {
    if (device.mobile && root.requestFullscreen && !document.fullscreenElement) {
      await root.requestFullscreen({ navigationUI: 'hide' });
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
    btn.setAttribute('aria-pressed', app.audio.muted ? 'true' : 'false');
  };
  btn.addEventListener('click', () => { app.audio.toggleMute(); sync(); });
  sync();
  app.showMute = () => { btn.hidden = false; gsap.fromTo(btn, { opacity: 0 }, { opacity: 0.7, duration: 1 }); sync(); };
}

/** Type her name anywhere for a little secret. */
function setupKeyboardSecret() {
  let typed = '';
  const word = String(app.store.site.her?.name || 'deepu').toLowerCase().replace(/\s+/g, '');
  window.addEventListener('keydown', (e) => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-word.length);
    if (typed === word) {
      app.eggs.found('keyboard', `You typed the magic word. The sky noticed.`);
      const { W, H } = app.fx.size;
      for (let i = 0; i < 4; i++) setTimeout(() => app.fx.firework({ x: W * (0.2 + 0.2 * i), y: H * 0.25 }), i * 260);
    }
  });
}

function isLocked(site) {
  const lock = site.settings && site.settings.lock;
  if (!lock || !lock.enabled || PREVIEW) return false;
  const at = Date.parse(lock.unlockAt);
  return Number.isFinite(at) && Date.now() < at;
}

async function boot() {
  makeGrain();
  try {
    app.store = await loadSite({ draft: DRAFT });
  } catch (err) {
    console.error(err);
    document.querySelector('.boot-text').textContent = 'Something went wrong loading the story. Please refresh.';
    return;
  }
  const { store } = app;
  const site = store.site;
  document.title = `For ${site.her?.name || 'you'}`;
  const theme = site.settings.theme || {};
  root.style.setProperty('--grain', String(0.075 * (theme.grain ?? 0.6) / 0.6));

  app.audio = await makeAudio(store.mediaUrl('music'));
  app.fx = createFX({ dustCanvas: document.getElementById('dust'), fxCanvas: document.getElementById('fx'), device, density: theme.particles ?? 1 });
  app.ui = createUI({ audio: app.audio, reducedMotion: device.reducedMotion });
  app.eggs = createEggs({ audio: app.audio, fx: app.fx });
  const nick = site.her?.nicknames || [];
  const tokens = {
    name: site.her?.name || '',
    nick1: nick[1] || nick[0] || site.her?.name || '',
    nick2: nick[2] || nick[1] || site.her?.name || '',
    creator: site.from?.name || '',
    photoCount: String(store.real().length || store.all().length),
    days: store.daysAlive().toLocaleString('en-IN'),
    age: String(new Date(site.settings?.lock?.unlockAt || Date.now()).getFullYear() - Number(String(site.her?.birthDate || '2007').slice(0, 4))),
  };
  app.fill = (str) => String(str ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in tokens ? tokens[k] : m));
  app.ui.setFill(app.fill);
  // "Chapter Five" → the real position among the chapters that are switched on
  const NUM = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  app.ui.setKicker((kicker) => {
    const m = /^Chapter (\w+)/.exec(kicker);
    if (!m || !NUM.includes(m[1])) return kicker;
    const numbered = app.list.filter((c) => /^Chapter \w+/.test(String(store.text[c.id]?.kicker || '')));
    const i = numbered.findIndex((c) => c.id === app.list[app.index]?.id);
    return i >= 0 && NUM[i + 1] ? kicker.replace(m[1], NUM[i + 1]) : kicker;
  });
  app.list = CHAPTERS.filter((c) => (!c.when || c.when(store)) && store.chapterEnabled(c.id));
  setupMute();
  setupKeyboardSecret();
  buildProgress();

  // fonts matter for the very first frame
  try { await Promise.race([document.fonts.ready, sleep(2.5)]); } catch { /* ignore */ }
  preloadChapter(app.list[1]);

  const bootEl = document.getElementById('boot');
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 1400);

  if (isLocked(site)) {
    const gate = { id: 'gate', load: () => import('./scenes/gate.js'), nav: false, via: 'fade', grade: 'night' };
    app.list = [gate, ...app.list];
    buildProgress();
    return goTo(0, { instant: true });
  }

  if (START_AT && PREVIEW) {
    const i = app.list.findIndex((c) => c.id === START_AT);
    if (i > 0) {
      // jumping straight in (testing): unlock audio on first tap
      window.addEventListener('pointerdown', () => { app.startSound(); }, { once: true });
      return goTo(i, { instant: true });
    }
  }
  return goTo(0, { instant: true });
}

// exposed for the invite scene (first gesture unlocks sound) and for debugging
window.__film = app;
app.startSound = async () => {
  if (app.soundStarted) return;
  app.soundStarted = true;
  await app.audio.unlock();
  app.audio.startTheme();
  app.showMute && app.showMute();
};

boot();
