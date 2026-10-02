/**
 * admin.js — "The Lantern Room": the admin portal for the birthday film.
 *
 * State model
 *   base   – the published site.json (read fresh from the GitHub API, or ../data/site.json)
 *   site   – the working draft (auto-saved to IndexedDB via shared/drafts.js)
 *   files  – Map<repo path, Blob> of new, not-yet-published files (final paths already in `site`)
 * Publishing turns (base → site) into ONE commit (see github.js).
 */
import { saveDraft, loadDraft, clearDraft } from '../assets/js/shared/drafts.js';
import { canvasToJpegBlob } from '../assets/js/shared/grade.js';
import { GitHub } from './github.js';
import { h, icon, toast, openSheet, confirmDialog, progressSheet, pickFiles, autoGrow } from './ui.js';
import * as M from './model.js';
import * as I from './images.js';
import { openCropper } from './cropper.js';
import { renderWords } from './words.js';

const TOKEN_KEY = 'deepu-admin-token';
const REPO_KEY = 'deepu-admin-repo';
const TAB_KEY = 'deepu-admin-tab';
const DEFAULT_REPO = { owner: 'anirudhleetcode-max', repo: 'birthday', branch: 'main' };
const MB = 1024 * 1024;
const MEDIA_WARN = 25 * MB;
const MEDIA_BLOCK = 95 * MB;

const TABS = [
  { id: 'photos', label: 'Photos', icon: 'image' },
  { id: 'extras', label: 'Extra memories', short: 'Extras', icon: 'heart' },
  { id: 'words', label: 'Words', icon: 'words' },
  { id: 'media', label: 'Music & video', short: 'Music', icon: 'music' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
  { id: 'help', label: 'Help', icon: 'help' },
];

const state = {
  base: null,
  site: null,
  files: new Map(),
  filesDirty: true,
  sessionBlobs: new Map(), // published during this session → keep showing them while Pages rebuilds
  source: 'none',          // 'github' | 'pages'
  conn: { status: 'none', message: '', token: '' }, // none | checking | ok | error
  repo: { ...DEFAULT_REPO },
  tab: 'photos',
};

/* ====================================================================== */
/* small utilities                                                         */
/* ====================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const strength = () => {
  const v = Number(state.site?.settings?.grading?.strength);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.85;
};
const changes = () => M.describeChanges(state.base, state.site);
const baseSlot = (id) => (state.base?.slots || []).find((s) => s.id === id);
const baseExtra = (id) => (state.base?.extras || []).find((x) => x.id === id);

function client() {
  return new GitHub({ ...state.repo, token: state.conn.token });
}

function liveUrl() {
  const { owner, repo } = state.repo;
  if (!owner || !repo) return '';
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) return `https://${repo}/`;
  return `https://${owner}.github.io/${repo}/`;
}

function takenPath(p) {
  return state.files.has(p) || state.sessionBlobs.has(p)
    || M.referencedPaths(state.base).has(p) || M.referencedPaths(state.site).has(p);
}

function newPhotoPaths(kind, id) {
  const p = M.photoPaths(kind, id);
  return { src: M.uniquePath(p.src, takenPath), original: M.uniquePath(p.original, takenPath) };
}

/* ---------- blob URLs ---------- */
const urlCache = new Map(); // Blob → object URL
function blobUrl(blob) {
  let u = urlCache.get(blob);
  if (!u) { u = URL.createObjectURL(blob); urlCache.set(blob, u); }
  return u;
}
function srcFor(path) {
  const b = state.files.get(path) || state.sessionBlobs.get(path);
  return b ? blobUrl(b) : `../${path}`;
}
function imgEl(path, alt = '') {
  const img = h('img', { alt, loading: 'lazy', decoding: 'async', draggable: 'false' });
  let triedRaw = false;
  img.addEventListener('error', () => {
    if (!triedRaw && !state.files.has(path) && state.repo.owner) {
      triedRaw = true;
      img.src = new GitHub(state.repo).rawUrl(path);
    } else {
      img.closest('.frame, .media-thumb')?.classList.add('broken');
    }
  });
  img.src = srcFor(path);
  return img;
}

/** Drop staged files the draft no longer references (and free their URLs). */
function gcFiles() {
  const refs = M.referencedPaths(state.site);
  for (const [p, b] of [...state.files]) {
    if (!refs.has(p)) {
      state.files.delete(p);
      state.filesDirty = true;
      if (![...state.sessionBlobs.values()].includes(b)) {
        const u = urlCache.get(b);
        if (u) { URL.revokeObjectURL(u); urlCache.delete(b); }
      }
    }
  }
}

/* ---------- busy overlay ---------- */
let busyDepth = 0;
async function withBusy(label, fn) {
  const el = $('#busy');
  $('#busy-label').textContent = label;
  busyDepth++;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('in'));
  try {
    return await fn();
  } finally {
    busyDepth--;
    if (!busyDepth) { el.classList.remove('in'); el.hidden = true; }
  }
}
const setBusyLabel = (t) => { $('#busy-label').textContent = t; };

/* ====================================================================== */
/* draft persistence                                                       */
/* ====================================================================== */

let saveTimer = 0;
let saveChain = Promise.resolve();
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 450);
}
function flushSave() {
  clearTimeout(saveTimer);
  const job = async () => {
    if (!state.site || !state.base) return;
    if (!changes().count && !state.files.size) {
      await clearDraft();
      state.filesDirty = true;
      return;
    }
    await saveDraft(state.site, state.filesDirty ? state.files : undefined, {
      deleted: M.deletedPaths(state.base, state.site),
      base: state.base,
    });
    state.filesDirty = false;
  };
  saveChain = saveChain.then(job).catch((err) => {
    console.error('[admin] draft save failed', err);
    toast(`Couldn’t save the draft on this device (${err.message || err}). Keep this tab open and publish soon.`, { type: 'error' });
  });
  return saveChain;
}

/**
 * Apply a change to the draft. `fn(site)` mutates; then files are tidied, the draft is
 * saved, the header updated and (optionally) the current tab re-rendered.
 */
function change(fn, { files = false, render = true } = {}) {
  if (fn) fn(state.site);
  if (files) state.filesDirty = true;
  gcFiles();
  scheduleSave();
  updateChrome();
  if (render) renderTab({ keepScroll: true });
}

/* ====================================================================== */
/* shell & chrome                                                          */
/* ====================================================================== */

function buildShell() {
  const nav = $('#tabs');
  nav.replaceChildren(...TABS.map((t) => h('button.tab', {
    type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': 'view', dataset: { tab: t.id },
    onclick: () => setTab(t.id),
  }, icon(t.icon), h('span.tab-label', t.label), t.short ? h('span.tab-short', t.short) : null)));
  for (const b of document.querySelectorAll('[data-action="preview"]')) b.addEventListener('click', preview);
  for (const b of document.querySelectorAll('[data-action="publish"]')) b.addEventListener('click', publishFlow);
  $('#status-chip').addEventListener('click', onChipClick);
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (TABS.some((t) => t.id === id) && id !== state.tab) setTab(id, { fromHash: true });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', () => flushSave());
}

function setTab(id, { fromHash = false } = {}) {
  state.tab = id;
  lsSet(TAB_KEY, id);
  if (!fromHash) history.replaceState(null, '', `#${id}`);
  renderTab();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function updateChrome() {
  const ch = state.base ? changes() : { count: 0 };
  const chip = $('#status-chip');
  const dot = $('.chip-dot', chip);
  const txt = $('.chip-text', chip);
  const conn = state.conn.status;
  chip.dataset.conn = conn;
  chip.dataset.draft = ch.count ? 'yes' : 'no';
  const connText = conn === 'ok' ? 'Connected' : conn === 'checking' ? 'Connecting…' : conn === 'error' ? 'Connection problem' : 'Not connected';
  txt.textContent = ch.count ? `Draft · ${plural(ch.count, 'change')}` : connText;
  $('.chip-short', chip).textContent = ch.count ? plural(ch.count, 'change') : conn === 'error' ? 'Problem' : connText;
  chip.title = `${connText}${ch.count ? ` · ${plural(ch.count, 'unpublished change')}` : ' · nothing unpublished'}`;
  dot.className = 'chip-dot';
  for (const b of document.querySelectorAll('[data-action="publish"]')) {
    const badge = $('.badge-count', b);
    if (badge) { badge.textContent = String(ch.count); badge.hidden = !ch.count; }
    b.classList.toggle('has-changes', !!ch.count);
  }
  for (const t of document.querySelectorAll('.tab')) {
    const on = t.dataset.tab === state.tab;
    t.setAttribute('aria-selected', String(on));
    t.classList.toggle('active', on);
  }
}

function onChipClick() {
  const ch = changes();
  if (ch.count) return showChangesSheet();
  if (state.conn.status !== 'ok') return showConnectSheet({});
  toast('Everything is published. ✨', { type: 'success' });
}

function showChangesSheet() {
  const ch = changes();
  const s = openSheet({
    kicker: 'Unpublished draft',
    title: plural(ch.count, 'change') + ' waiting',
    content: [
      h('p.sheet-text', 'These are saved on this device only. Preview them, then publish to make them live.'),
      changeList(ch),
    ],
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => { s.close(); preview(); } }, icon('eye'), 'Preview'),
      h('button.btn.gold', { type: 'button', onclick: () => { s.close(); publishFlow(); } }, icon('send'), 'Publish'),
    ],
  });
}

function changeList(ch) {
  return h('ul.change-list', ch.items.map((it) => h('li', h('span.change-dot'), it.text)));
}

/* ====================================================================== */
/* boot                                                                    */
/* ====================================================================== */

async function fetchPagesSite() {
  const res = await fetch('../data/site.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`site.json: HTTP ${res.status}`);
  return res.json();
}

function loadRepoCfg() {
  try {
    const v = JSON.parse(lsGet(REPO_KEY) || 'null');
    if (v && v.owner && v.repo) return { owner: v.owner, repo: v.repo, branch: v.branch || 'main' };
  } catch { /* ignore */ }
  return null;
}

async function boot() {
  buildShell();
  const hashTab = location.hash.slice(1);
  state.tab = TABS.some((t) => t.id === hashTab) ? hashTab : (TABS.some((t) => t.id === lsGet(TAB_KEY)) ? lsGet(TAB_KEY) : 'photos');
  renderLoading();
  updateChrome();

  const storedRepo = loadRepoCfg();
  state.conn.token = lsGet(TOKEN_KEY) || '';

  let pagesSite = null;
  try { pagesSite = await fetchPagesSite(); } catch (err) { console.warn('[admin] ../data/site.json unavailable', err); }
  const fromSite = pagesSite?.settings?.github;
  state.repo = storedRepo || (fromSite?.owner ? { owner: fromSite.owner, repo: fromSite.repo, branch: fromSite.branch || 'main' } : { ...DEFAULT_REPO });

  let base = null;
  if (state.conn.token) base = await connectAndFetch({ quiet: true });
  if (base) state.source = 'github';
  else if (pagesSite) { base = pagesSite; state.source = 'pages'; }
  if (!base) {
    renderFatal('Couldn’t load the site’s data (data/site.json). Check your internet connection, or connect GitHub in Settings.');
    return;
  }
  state.base = base;
  state.site = M.clone(base);
  await restoreDraft();
  renderTab();
  updateChrome();
  if (!state.conn.token) showConnectSheet({ firstRun: true });
}

async function connectAndFetch({ quiet = false } = {}) {
  state.conn.status = 'checking';
  state.conn.message = '';
  updateChrome();
  try {
    const gh = client();
    const info = await gh.check();
    const { site } = await gh.getSite();
    state.conn.status = 'ok';
    state.conn.info = info;
    updateChrome();
    if (info.canPush === false) toast('Heads-up: your GitHub account can read this repository but may not be allowed to change it.', { type: 'error' });
    return site;
  } catch (err) {
    console.warn('[admin] connect failed', err);
    state.conn.status = 'error';
    state.conn.message = err.message || String(err);
    updateChrome();
    if (quiet) toast(state.conn.message, { type: 'error' });
    else throw err;
    return null;
  }
}

/** After connecting (or reconnecting), adopt the fresh remote site and rebase the draft onto it. */
function adoptRemote(remote) {
  const hadBase = state.base;
  if (hadBase && state.site) {
    state.site = M.merge3(hadBase, state.site, remote);
  } else {
    state.site = M.clone(remote);
  }
  state.base = remote;
  state.source = 'github';
  gcFiles();
  scheduleSave();
  updateChrome();
  renderTab({ keepScroll: true });
}

async function restoreDraft() {
  let d = null;
  try { d = await loadDraft(); } catch (err) { console.warn('[admin] could not read draft', err); }
  if (!d || !d.site) return;
  const draftBase = d.base || state.base;
  let rebased;
  try { rebased = M.merge3(draftBase, d.site, state.base); } catch { rebased = d.site; }
  const ch = M.describeChanges(state.base, rebased);
  if (!ch.count) { await clearDraft().catch(() => {}); return; }
  const s = openSheet({
    kicker: 'Welcome back',
    title: 'Continue where you left off?',
    dismissible: false,
    content: [
      h('p.sheet-text', `You have ${plural(ch.count, 'unpublished change')} saved on this device${d.savedAt ? ` (${M.timeAgo(d.savedAt)})` : ''}.`),
      changeList(ch),
    ],
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => s.close('discard') }, 'Discard draft'),
      h('button.btn.gold', { type: 'button', autofocus: true, onclick: () => s.close('continue') }, 'Continue where you left off'),
    ],
  });
  const choice = await s.result;
  if (choice === 'continue') {
    state.site = rebased;
    state.files = d.files;
    state.filesDirty = false;
    gcFiles();
    scheduleSave();
    toast('Draft restored. ✨', { type: 'success' });
  } else {
    const ok = await confirmDialog({ title: 'Discard the draft?', message: 'Unpublished changes saved on this device will be deleted. This can’t be undone.', confirm: 'Discard', danger: true });
    if (ok) { await clearDraft().catch(() => {}); toast('Draft discarded.'); }
    else return restoreDraftChoice(d, rebased);
  }
}
async function restoreDraftChoice(d, rebased) {
  state.site = rebased;
  state.files = d.files;
  state.filesDirty = false;
  gcFiles();
  scheduleSave();
  toast('Draft kept. ✨', { type: 'success' });
}

/* ====================================================================== */
/* rendering                                                               */
/* ====================================================================== */

function renderLoading() {
  $('#view').replaceChildren(h('div.loading', h('div.loading-orb'), h('p', 'Lighting the lanterns…')));
}
function renderFatal(msg) {
  $('#view').replaceChildren(h('section.panel.fatal', h('h2', 'Something’s not right'), h('p', msg),
    h('button.btn.gold', { type: 'button', onclick: () => location.reload() }, 'Try again'),
    h('button.btn.ghost', { type: 'button', onclick: () => showConnectSheet({}) }, 'Connect GitHub')));
}

function renderTab({ keepScroll = false } = {}) {
  if (!state.site) return;
  const y = window.scrollY;
  const view = $('#view');
  const fn = { photos: renderPhotos, extras: renderExtras, words: renderWordsTab, media: renderMedia, settings: renderSettings, help: renderHelp }[state.tab] || renderPhotos;
  view.replaceChildren(fn());
  view.dataset.tab = state.tab;
  updateChrome();
  if (keepScroll) window.scrollTo(0, y);
}

function sectionHead(kicker, title, sub) {
  return h('header.section-head', kicker ? h('p.kicker', kicker) : null, h('h2.section-title', title), sub ? h('p.section-sub', sub) : null);
}

function emptyArt(ratioStr) {
  const r = M.parseRatio(ratioStr);
  return h('span.empty-art',
    h('span.empty-glyph', icon('lantern')),
    h('span.empty-ratio', r.label),
    h('span.empty-cta', 'Tap to add'));
}

/* ---------------------------- Photos ---------------------------------- */

function renderPhotos() {
  const slots = state.site.slots || [];
  const filled = slots.filter((s) => s.src).length;
  const empty = slots.length - filled;
  const pct = slots.length ? (filled / slots.length) * 100 : 0;

  const hero = h('section.hero-card',
    h('div.hero-copy',
      h('p.kicker', 'The photo wall'),
      h('h2.hero-title', h('span.hero-num', String(filled)), ` of ${slots.length} filled`),
      h('p.hero-text', 'Each spot has its own shape. New photos are cropped to that exact shape and colour-graded so every picture looks like part of the same film.'),
    ),
    h('div.meter', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(slots.length), 'aria-valuenow': String(filled) },
      h('div.meter-fill', { style: { width: `${pct}%` } })),
    h('div.hero-actions',
      h('button.btn.gold.lg', { type: 'button', disabled: !empty, onclick: bulkFill },
        icon('wand'), empty ? 'Fill all empty slots' : 'Every spot is filled ✨'),
      empty ? h('p.hero-hint', `${plural(empty, 'empty spot')} — choose several photos at once; you can adjust each one before it’s added.`) : null,
    ),
  );

  const groups = new Map();
  for (const s of slots) {
    if (!groups.has(s.chapter)) groups.set(s.chapter, []);
    groups.get(s.chapter).push(s);
  }
  const sections = [...groups].map(([ch, list]) => {
    const f = list.filter((s) => s.src).length;
    return h('section.chapter', { id: `ch-${ch}` },
      h('header.chapter-head',
        h('h3.chapter-title', M.CHAPTERS[ch] || ch),
        h('span.chapter-count', { class: f === list.length ? 'done' : '' }, `${f} / ${list.length}`)),
      h('div.card-grid', list.map(slotCard)));
  });
  return h('div.photos', hero, sections);
}

function slotCard(slot) {
  const b = baseSlot(slot.id);
  const isDraft = !!b && (slot.src !== b.src || (slot.caption || '') !== (b.caption || ''));
  const r = M.parseRatio(slot.ratio);
  const frame = h('button.frame', {
    type: 'button',
    class: slot.src ? 'filled' : 'empty',
    style: { aspectRatio: `${r.w} / ${r.h}` },
    'aria-label': `${slot.src ? 'Replace' : 'Upload'} photo for ${slot.label} (${r.label})`,
    onclick: () => replaceSlot(slot.id),
  }, slot.src ? imgEl(slot.src, slot.label) : emptyArt(slot.ratio));
  return h('article.card.slot-card', { class: isDraft ? 'is-draft' : '', dataset: { slot: slot.id } },
    isDraft ? h('span.ribbon', 'Draft') : null,
    frame,
    h('div.card-body',
      h('div.card-row', h('h4.card-title', slot.label), h('span.ratio-badge', { title: `Shape ${r.label} — always kept` }, r.label)),
      slot.hint ? h('p.card-hint', slot.hint) : null,
      slot.caption ? h('p.card-caption', `“${slot.caption}”`) : null,
      h('div.card-actions',
        h(`button.btn.sm.${slot.src ? 'ghost' : 'gold-soft'}`, { type: 'button', onclick: () => replaceSlot(slot.id) },
          icon(slot.src ? 'replace' : 'upload'), slot.src ? 'Replace' : 'Upload'),
        isDraft ? h('button.btn.sm.quiet', { type: 'button', onclick: () => undoSlot(slot.id), title: 'Go back to the published version' }, icon('undo'), 'Undo') : null,
      ),
    ),
  );
}

/** Decode a picked file with friendly errors. */
async function openFile(file) {
  try {
    return await withBusy('Opening photo…', () => I.decodeImage(file));
  } catch (err) {
    showImageError(err);
    return null;
  }
}

function showImageError(err) {
  if (err && err.code === 'heic') {
    toast(I.HEIC_MESSAGE, {
      type: 'error',
      action: { label: 'How?', run: () => { const s = openSheet({ kicker: 'iPhone photos', title: 'Share as “Most Compatible”', content: h('p.sheet-text', I.HEIC_HELP), actions: [h('button.btn.gold', { type: 'button', onclick: () => s.close() }, 'Got it')] }); } },
    });
  } else {
    toast((err && err.message) || 'This photo couldn’t be opened.', { type: 'error' });
  }
}

/**
 * Ask for one photo and fit it to `ratio`: within 1.5 % → exact center fit; otherwise the
 * cropper (locked to the ratio). Returns { originalBlob, gradedBlob } or null.
 */
async function photoForRatio({ ratio, title, rule, file = null }) {
  const f = file || (await pickFiles({ accept: 'image/*' }))[0];
  if (!f) return null;
  const dec = await openFile(f);
  if (!dec) return null;
  let rect, exact = false;
  if (M.matchesRatio(dec.width, dec.height, ratio)) {
    rect = I.centerCropRect(dec.width, dec.height, ratio);
    exact = true;
  } else {
    const res = await openCropper({ source: dec.canvas, ratio, title, rule, strength: strength(), confirmLabel: 'Use this photo' });
    if (!res) return null;
    rect = res.rect;
  }
  try {
    const out = await withBusy('Colour-grading your photo…', () => I.processPhoto(dec.canvas, rect, ratio, strength()));
    return { ...out, exact };
  } catch (err) {
    console.error(err);
    toast(`Couldn’t prepare this photo: ${err.message || err}`, { type: 'error' });
    return null;
  }
}

async function replaceSlot(id) {
  const slot = state.site.slots.find((s) => s.id === id);
  if (!slot) return;
  const r = M.parseRatio(slot.ratio);
  const had = !!slot.src;
  const out = await photoForRatio({
    ratio: slot.ratio,
    title: had ? `Replace “${slot.label}”` : `Add “${slot.label}”`,
    rule: had ? `This spot is ${r.label} — same shape as before` : `This spot is ${r.label} (${M.ratioWords(slot.ratio)}) — your photo is cropped to this shape`,
  });
  if (!out) return;
  const prev = M.clone(slot);
  const prevBlobs = [[slot.src, state.files.get(slot.src)], [slot.original, state.files.get(slot.original)]].filter(([, b]) => b);
  const paths = newPhotoPaths('slot', slot.id);
  state.files.set(paths.src, out.gradedBlob);
  state.files.set(paths.original, out.originalBlob);
  change((site) => {
    const s = site.slots.find((x) => x.id === id);
    s.src = paths.src;
    s.original = paths.original;
    s.updatedAt = new Date().toISOString();
  }, { files: true });
  toast(out.exact ? `Perfect fit — already ${r.label}. Added to your draft.` : `${had ? 'Replaced' : 'Added'} — cropped to ${r.label}, same shape as the spot.`, {
    type: 'success',
    action: { label: 'Undo', run: () => {
      for (const [p, b] of prevBlobs) state.files.set(p, b);
      change((site) => { const i = site.slots.findIndex((x) => x.id === id); if (i >= 0) site.slots[i] = prev; }, { files: true });
    } },
  });
}

function undoSlot(id) {
  const b = baseSlot(id);
  if (!b) return;
  change((site) => { const i = site.slots.findIndex((x) => x.id === id); if (i >= 0) site.slots[i] = M.clone(b); });
  toast('Back to the published photo.');
}

/* ---------------------------- Bulk fill ------------------------------- */

async function bulkFill() {
  const empties = state.site.slots.filter((s) => !s.src);
  if (!empties.length) { toast('Every spot already has a photo.'); return; }
  const files = await pickFiles({ accept: 'image/*', multiple: true });
  if (!files.length) return;
  const items = files.map((file, i) => ({ file, i, size: null }));
  await withBusy('Reading your photos…', async () => {
    for (const it of items) it.size = await I.readImageSize(it.file);
  });
  openBulkReview(empties, items);
}

function openBulkReview(empties, items) {
  let smart = false;
  let cancelled = false;
  const results = new Map(); // `${slotId}|${itemIndex}` → { rect, originalBlob, gradedBlob, url } | { error }
  let assignments = [];
  let leftovers = [];

  const grid = h('div.review-grid');
  const status = h('p.review-status');
  const leftoverBox = h('div.leftover');
  const addLeftovers = h('input', { type: 'checkbox' });
  const smartBtn = h('button.toggle', { type: 'button', 'aria-pressed': 'false', onclick: () => { smart = !smart; smartBtn.setAttribute('aria-pressed', String(smart)); assign(); render(); pump(); } },
    h('span.toggle-knob'), 'Match shapes automatically');
  const applyBtn = h('button.btn.gold', { type: 'button', onclick: apply }, icon('check'), 'Add to draft');

  const sheet = openSheet({
    kicker: 'Fill all empty slots',
    title: `${plural(Math.min(empties.length, items.length), 'photo')} ready to place`,
    full: true,
    content: [
      h('div.review-top',
        h('p.sheet-text', 'Each photo is cropped to its spot’s shape (faces usually sit high, so the crop leans up) and colour-graded. Tap ', h('b', 'Adjust'), ' to reframe any of them.'),
        smartBtn,
      ),
      status,
      grid,
      leftoverBox,
    ],
    actions: [h('button.btn.ghost', { type: 'button', onclick: () => sheet.close(null) }, 'Cancel'), applyBtn],
  });
  sheet.result.then(() => { cancelled = true; });

  const key = (a) => `${a.slot.id}|${a.item.i}`;
  const itemRatio = (it) => (it.size ? it.size.width / it.size.height : null);

  function assign() {
    const pool = items.slice();
    const out = [];
    for (const slot of empties) {
      if (!pool.length) break;
      let pick = 0;
      if (smart) {
        const target = Math.log(M.parseRatio(slot.ratio).value);
        let best = Infinity;
        pool.forEach((it, j) => {
          const r = itemRatio(it);
          const d = r ? Math.abs(Math.log(r) - target) : 9;
          if (d < best - 1e-9) { best = d; pick = j; }
        });
      }
      const prevSkip = assignments.find((a) => a.slot.id === slot.id)?.skipped || false;
      out.push({ slot, item: pool.splice(pick, 1)[0], skipped: prevSkip });
    }
    assignments = out;
    leftovers = pool;
  }

  function card(a) {
    const r = M.parseRatio(a.slot.ratio);
    const res = results.get(key(a));
    const frameContent = res?.url ? h('img', { src: res.url, alt: a.slot.label })
      : res?.error ? h('span.review-error', res.error)
        : h('span.spinner');
    return h('article.card.review-card', { class: a.skipped ? 'skipped' : '' },
      h('div.frame', { style: { aspectRatio: `${r.w} / ${r.h}` }, class: res?.url ? 'filled' : 'empty' }, frameContent),
      h('div.card-body',
        h('div.card-row', h('h4.card-title', a.slot.label), h('span.ratio-badge', r.label)),
        h('p.card-hint', a.item.file.name),
        h('div.card-actions.review-actions',
          a.skipped
            ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { a.skipped = false; render(); } }, icon('plus'), 'Include')
            : [
              h('button.btn.sm.ghost', { type: 'button', disabled: !res || !!res.error, onclick: () => adjust(a) }, icon('crop'), 'Adjust'),
              h('button.btn.sm.quiet', { type: 'button', onclick: () => { a.skipped = true; render(); } }, 'Skip'),
            ],
        ),
      ),
    );
  }

  function render() {
    grid.replaceChildren(...assignments.map(card));
    const done = assignments.filter((a) => !a.skipped && results.get(key(a))?.url).length;
    const pending = assignments.filter((a) => !a.skipped && !results.has(key(a))).length;
    const failed = assignments.filter((a) => !a.skipped && results.get(key(a))?.error).length;
    const extraCount = addLeftovers.checked ? leftovers.length : 0;
    status.textContent = pending
      ? `Preparing… ${done} of ${done + pending} ready`
      : `${plural(done, 'photo')} ready${failed ? ` · ${failed} couldn’t be opened` : ''}${empties.length > items.length ? ` · ${plural(empties.length - items.length, 'spot')} will stay empty` : ''}`;
    applyBtn.disabled = !!pending || (!done && !extraCount);
    applyBtn.lastChild.textContent = pending ? 'Preparing…' : `Add ${plural(done + extraCount, 'photo')} to draft`;
    if (leftovers.length) {
      leftoverBox.replaceChildren(
        h('p', `${plural(leftovers.length, 'photo')} didn’t fit — every empty spot is taken.`),
        h('label.check', addLeftovers, h('span', 'Add them to “Extra memories” instead (shape picked automatically)')),
      );
    } else leftoverBox.replaceChildren();
  }
  addLeftovers.addEventListener('change', render);

  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        if (cancelled) return;
        const next = assignments.find((a) => !results.has(key(a)));
        if (!next) break;
        const k = key(next);
        try {
          const dec = await I.decodeImage(next.item.file);
          const rect = M.matchesRatio(dec.width, dec.height, next.slot.ratio)
            ? I.centerCropRect(dec.width, dec.height, next.slot.ratio)
            : I.autoCropRect(dec.width, dec.height, next.slot.ratio, { focusY: 0.4 });
          const out = await I.processPhoto(dec.canvas, rect, next.slot.ratio, strength());
          if (cancelled) return;
          results.set(k, { rect, ...out, url: URL.createObjectURL(out.gradedBlob) });
        } catch (err) {
          results.set(k, { error: err.message || 'Couldn’t open this photo' });
        }
        render();
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      pumping = false;
    }
  }

  async function adjust(a) {
    const k = key(a);
    const prev = results.get(k);
    const dec = await openFile(a.item.file);
    if (!dec) return;
    const r = M.parseRatio(a.slot.ratio);
    const res = await openCropper({
      source: dec.canvas, ratio: a.slot.ratio, title: `Adjust “${a.slot.label}”`,
      rule: `This spot is ${r.label} — the crop always keeps this shape`, strength: strength(),
      initialRect: prev?.rect, confirmLabel: 'Done',
    });
    if (!res) return;
    const out = await withBusy('Colour-grading…', () => I.processPhoto(dec.canvas, res.rect, a.slot.ratio, strength()));
    if (prev?.url) URL.revokeObjectURL(prev.url);
    results.set(k, { rect: res.rect, ...out, url: URL.createObjectURL(out.gradedBlob) });
    render();
  }

  async function apply() {
    const ready = assignments.filter((a) => !a.skipped && results.get(key(a))?.url);
    const now = new Date().toISOString();
    for (const a of ready) {
      const res = results.get(key(a));
      const paths = newPhotoPaths('slot', a.slot.id);
      state.files.set(paths.src, res.gradedBlob);
      state.files.set(paths.original, res.originalBlob);
      const s = state.site.slots.find((x) => x.id === a.slot.id);
      s.src = paths.src; s.original = paths.original; s.updatedAt = now;
    }
    let extrasAdded = 0;
    if (addLeftovers.checked && leftovers.length) {
      sheet.close('applied');
      await withBusy('Adding extra memories…', async () => {
        for (let i = 0; i < leftovers.length; i++) {
          setBusyLabel(`Adding extra memories… ${i + 1} of ${leftovers.length}`);
          try {
            const dec = await I.decodeImage(leftovers[i].file);
            const shape = M.closestShape(dec.width, dec.height);
            const rect = I.autoCropRect(dec.width, dec.height, shape.ratio, { focusY: 0.4 });
            const out = await I.processPhoto(dec.canvas, rect, shape.ratio, strength());
            stageExtra(out, shape.ratio, '');
            extrasAdded++;
          } catch (err) {
            toast(`${leftovers[i].file.name}: ${err.message || err}`, { type: 'error' });
          }
        }
      });
    } else {
      sheet.close('applied');
    }
    for (const r of results.values()) if (r.url) URL.revokeObjectURL(r.url);
    change(null, { files: true });
    toast(`${plural(ready.length, 'photo')} added to your draft${extrasAdded ? ` + ${plural(extrasAdded, 'extra memory', 'extra memories')}` : ''}. Preview, then publish when you’re happy.`, { type: 'success' });
  }

  sheet.result.then((v) => { if (v !== 'applied') for (const r of results.values()) if (r.url) URL.revokeObjectURL(r.url); });
  assign();
  render();
  pump();
}

/* ---------------------------- Extras ---------------------------------- */

function stageExtra(out, ratio, caption) {
  const ids = new Set([...(state.site.extras || []), ...(state.base.extras || [])].map((x) => x.id));
  let id = M.randomId('x-');
  while (ids.has(id)) id = M.randomId('x-');
  const paths = newPhotoPaths('extra', id);
  state.files.set(paths.src, out.gradedBlob);
  state.files.set(paths.original, out.originalBlob);
  if (!Array.isArray(state.site.extras)) state.site.extras = [];
  state.site.extras.push({ id, ratio, src: paths.src, original: paths.original, caption: caption || '', addedAt: new Date().toISOString() });
  return id;
}

function renderExtras() {
  const extras = state.site.extras || [];
  const head = h('section.hero-card.extras-hero',
    h('div.hero-copy',
      h('p.kicker', 'Extra memories'),
      h('h2.hero-title', extras.length ? h('span', h('span.hero-num', String(extras.length)), ` ${extras.length === 1 ? 'memory' : 'memories'}`) : 'Add as many as you like'),
      h('p.hero-text', 'They appear after the credits, as pages still being written. Pick a shape for each photo — once added, that shape stays locked so a replacement always fits.'),
    ),
    h('div.hero-actions', h('button.btn.gold.lg', { type: 'button', onclick: addExtras }, icon('plus'), 'Add memories')),
  );
  if (!extras.length) {
    return h('div.extras', head, h('div.empty-panel', h('span.empty-glyph.big', icon('heart')), h('p', 'No extra memories yet.'), h('p.muted', 'Add one now, or any time later — even after her birthday.')));
  }
  return h('div.extras', head, h('div.card-grid.extras-grid', extras.map((x, i) => extraCard(x, i, extras.length))));
}

function extraCard(x, i, n) {
  const b = baseExtra(x.id);
  const isNew = !b;
  const isDraft = isNew || !M.deepEqual(x, b);
  const r = M.parseRatio(x.ratio);
  const cap = autoGrow(h('textarea.input.caption-input', { rows: '1', value: x.caption || '', placeholder: 'Add a caption…', 'aria-label': 'Caption' }));
  const card = h('article.card.extra-card', { class: isDraft ? 'is-draft' : '', dataset: { extra: x.id } });
  cap.addEventListener('input', () => {
    const e = state.site.extras.find((y) => y.id === x.id);
    if (!e) return;
    e.caption = cap.value;
    change(null, { render: false });
    const dirty = !baseExtra(x.id) || !M.deepEqual(e, baseExtra(x.id));
    card.classList.toggle('is-draft', dirty);
  });
  card.append(
    h('span.ribbon', isNew ? 'New' : 'Draft'),
    h('button.frame.filled', {
      type: 'button', style: { aspectRatio: `${r.w} / ${r.h}` }, 'aria-label': 'Replace this photo', onclick: () => replaceExtra(x.id),
    }, x.src ? imgEl(x.src, x.caption || 'Memory') : emptyArt(x.ratio)),
    h('div.card-body',
      h('div.card-row', h('span.mem-num', `Memory ${i + 1}`), h('span.ratio-badge', { title: `Shape ${r.label} is locked for this memory` }, r.label, icon('lock'))),
      cap,
      h('div.card-actions',
        h('button.btn.sm.ghost', { type: 'button', onclick: () => replaceExtra(x.id) }, icon('replace'), 'Replace'),
        h('button.icon-btn.danger', { type: 'button', 'aria-label': 'Delete this memory', title: 'Delete', onclick: () => deleteExtra(x.id) }, icon('trash')),
      ),
      h('div.card-actions.order-row',
        h('button.icon-btn', { type: 'button', 'aria-label': 'Move earlier', title: 'Move earlier', disabled: i === 0, onclick: () => moveExtra(x.id, -1) }, icon('up')),
        h('button.icon-btn', { type: 'button', 'aria-label': 'Move later', title: 'Move later', disabled: i === n - 1, onclick: () => moveExtra(x.id, 1) }, icon('down')),
        isDraft && !isNew ? h('button.btn.sm.quiet', { type: 'button', onclick: () => undoExtra(x.id), title: 'Go back to the published version' }, icon('undo'), 'Undo') : null,
      ),
    ),
  );
  return card;
}

async function addExtras() {
  const files = await pickFiles({ accept: 'image/*', multiple: true });
  if (!files.length) return;
  let added = 0;
  for (let i = 0; i < files.length; i++) {
    const dec = await openFile(files[i]);
    if (!dec) continue;
    const shape = M.closestShape(dec.width, dec.height);
    const res = await openCropper({
      source: dec.canvas, ratio: shape.ratio, shapes: M.SHAPES,
      title: 'Add a memory', rule: 'Pick a shape — it stays locked for this memory',
      step: files.length > 1 ? `Photo ${i + 1} of ${files.length}` : '',
      strength: strength(), allowSkip: files.length > 1, caption: '', confirmLabel: 'Add memory',
    });
    if (res === null) break;
    if (res.skip) continue;
    try {
      const out = await withBusy('Colour-grading…', () => I.processPhoto(dec.canvas, res.rect, res.ratio, strength()));
      stageExtra(out, res.ratio, res.caption);
      added++;
      change(null, { files: true });
    } catch (err) {
      toast(`Couldn’t prepare this photo: ${err.message || err}`, { type: 'error' });
    }
  }
  if (added) toast(`${plural(added, 'memory', 'memories')} added to your draft. ✨`, { type: 'success' });
}

async function replaceExtra(id) {
  const x = state.site.extras.find((e) => e.id === id);
  if (!x) return;
  const r = M.parseRatio(x.ratio);
  const out = await photoForRatio({ ratio: x.ratio, title: 'Replace this memory', rule: `This memory is ${r.label} — same shape as before` });
  if (!out) return;
  const paths = newPhotoPaths('extra', id);
  state.files.set(paths.src, out.gradedBlob);
  state.files.set(paths.original, out.originalBlob);
  change((site) => { const e = site.extras.find((y) => y.id === id); e.src = paths.src; e.original = paths.original; }, { files: true });
  toast(`Replaced — same ${r.label} shape.`, { type: 'success' });
}

function moveExtra(id, d) {
  change((site) => {
    const a = site.extras;
    const i = a.findIndex((x) => x.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
  });
}

function deleteExtra(id) {
  const i = state.site.extras.findIndex((x) => x.id === id);
  if (i < 0) return;
  const removed = state.site.extras[i];
  const blobs = [[removed.src, state.files.get(removed.src)], [removed.original, state.files.get(removed.original)]].filter(([, b]) => b);
  change((site) => { site.extras.splice(i, 1); });
  toast(baseExtra(id) ? 'Memory removed (it disappears from the live site when you publish).' : 'Memory removed.', {
    action: { label: 'Undo', run: () => {
      for (const [p, b] of blobs) state.files.set(p, b);
      change((site) => { site.extras.splice(Math.min(i, site.extras.length), 0, removed); }, { files: true });
    } },
  });
}

function undoExtra(id) {
  const b = baseExtra(id);
  change((site) => {
    const i = site.extras.findIndex((x) => x.id === id);
    if (i < 0) return;
    if (b) site.extras[i] = M.clone(b); else site.extras.splice(i, 1);
  });
}

/* ---------------------------- Words ----------------------------------- */

function renderWordsTab() {
  return h('div.words-tab',
    sectionHead('Words', 'Everything she reads', null),
    renderWords({
      getSite: () => state.site,
      getBase: () => state.base,
      onChange: () => change(null, { render: false }),
    }));
}

/* ---------------------------- Media ----------------------------------- */

const MEDIA = {
  music: {
    title: 'Background music', icon: 'music',
    desc: 'Plays softly through the whole film. MP3 or M4A works best.',
    accept: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.mp3,.m4a,.aac',
    exts: ['mp3', 'm4a', 'aac'], kind: 'audio',
    text: { key: 'musicTitle', label: 'Song title (optional, shown small)', placeholder: 'e.g. I See the Light' },
  },
  video: {
    title: 'Video message', icon: 'video', optional: true,
    desc: 'A video of you, played near the end. MP4 plays everywhere (iPhone .mov files may not play on Android).',
    accept: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm',
    exts: ['mp4', 'mov', 'm4v', 'webm'], kind: 'video',
    text: { key: 'videoCaption', label: 'Caption under the video', placeholder: 'A little something I recorded for you' },
  },
  voice: {
    title: 'Voice note', icon: 'mic', optional: true,
    desc: 'A short voice message she can play.',
    accept: 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus',
    exts: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm'], kind: 'audio',
  },
};
const MIME_EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v' };

function renderMedia() {
  return h('div.media-tab',
    sectionHead('Music & video', 'Sound and moving pictures', 'Big files make the film slow to open on phones — keep each one under 25 MB if you can.'),
    h('div.media-grid', Object.keys(MEDIA).map(mediaCard)));
}

function mediaCard(kind) {
  const cfg = MEDIA[kind];
  const m = state.site.media || {};
  const path = m[kind] || null;
  const bm = state.base.media || {};
  const isDraft = (bm[kind] || null) !== path || (cfg.text && (bm[cfg.text.key] || '') !== (m[cfg.text.key] || ''));
  const blob = path ? state.files.get(path) : null;
  let player = null;
  if (path) {
    player = cfg.kind === 'video'
      ? h('video.media-player', { controls: true, playsinline: true, preload: 'metadata', src: srcFor(path) })
      : h('audio.media-player', { controls: true, preload: 'metadata', src: srcFor(path) });
  }
  let textField = null;
  if (cfg.text) {
    const input = h('input.input', { type: 'text', value: m[cfg.text.key] || '', placeholder: cfg.text.placeholder });
    input.addEventListener('input', () => {
      if (!state.site.media) state.site.media = {};
      state.site.media[cfg.text.key] = input.value;
      change(null, { render: false });
    });
    textField = h('label.field', h('span.field-label', cfg.text.label), input);
  }
  return h('article.card.media-card', { class: isDraft ? 'is-draft' : '' },
    isDraft ? h('span.ribbon', 'Draft') : null,
    h('div.media-head', h('span.media-icon', icon(cfg.icon)), h('div',
      h('h3.media-title', cfg.title, cfg.optional ? h('span.opt', ' · optional') : null),
      h('p.card-hint', cfg.desc))),
    path
      ? h('div.media-current', h('p.media-file', icon('link'), h('span', path.split('/').pop()), blob ? h('span.muted', ` · ${M.formatBytes(blob.size)} · not published yet`) : null), player)
      : h('p.media-none', 'Nothing chosen yet.'),
    textField,
    h('div.card-actions.wrap',
      h(`button.btn.sm.${path ? 'ghost' : 'gold-soft'}`, { type: 'button', onclick: () => pickMedia(kind) }, icon('upload'), path ? 'Replace' : 'Choose file'),
      path ? h('button.btn.sm.quiet', { type: 'button', onclick: () => removeMedia(kind) }, icon('trash'), 'Remove') : null,
      isDraft ? h('button.btn.sm.quiet', { type: 'button', onclick: () => undoMedia(kind) }, icon('undo'), 'Undo') : null,
    ),
  );
}

async function pickMedia(kind) {
  const cfg = MEDIA[kind];
  const [file] = await pickFiles({ accept: cfg.accept });
  if (!file) return;
  if (file.size > MEDIA_BLOCK) {
    toast(`That file is ${M.formatBytes(file.size)} — too big to publish (the limit is 95 MB). Try a shorter clip or a compressed version.`, { type: 'error' });
    return;
  }
  if (file.size > MEDIA_WARN) {
    const ok = await confirmDialog({
      title: 'That’s a big file',
      message: `This file is ${M.formatBytes(file.size)}. Files over 25 MB take a long time to load on phones (and to publish). Use it anyway?`,
      confirm: 'Use it anyway', cancel: 'Choose another',
    });
    if (!ok) return;
  }
  const fromName = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = cfg.exts.includes(fromName) ? fromName : (MIME_EXT[file.type] || fromName || (cfg.kind === 'video' ? 'mp4' : 'mp3'));
  const kindOk = cfg.kind === 'video' ? /^video\//.test(file.type) || cfg.exts.includes(fromName) : /^audio\//.test(file.type) || cfg.exts.includes(fromName);
  if (!kindOk) {
    toast(`That doesn’t look like ${cfg.kind === 'video' ? 'a video' : 'an audio file'}. Please choose ${cfg.exts.slice(0, 3).join(' / ').toUpperCase()}.`, { type: 'error' });
    return;
  }
  const path = M.uniquePath(`media/${kind}-${M.stamp()}.${ext}`, takenPath);
  state.files.set(path, file);
  change((site) => { if (!site.media) site.media = {}; site.media[kind] = path; }, { files: true });
  toast(`${cfg.title} added to your draft.`, { type: 'success' });
}

function removeMedia(kind) {
  change((site) => { site.media[kind] = null; });
}
function undoMedia(kind) {
  const cfg = MEDIA[kind];
  const bm = state.base.media || {};
  change((site) => {
    site.media[kind] = bm[kind] ?? null;
    if (cfg.text) site.media[cfg.text.key] = bm[cfg.text.key] ?? '';
  });
}

/* ---------------------------- Settings -------------------------------- */

const IST_MS = 5.5 * 3600 * 1000;
function isoToIstInput(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t + IST_MS).toISOString().slice(0, 16);
}
function istInputToIso(v) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+05:30` : null;
}
function prettyIst(iso) {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }).format(t) + ' IST';
  } catch { return iso; }
}

function renderSettings() {
  const st = state.site.settings || (state.site.settings = {});
  if (!st.lock) st.lock = { enabled: true, unlockAt: '2027-01-03T00:00:00+05:30' };
  if (!st.grading) st.grading = { strength: 0.85 };
  if (!st.github) st.github = { ...state.repo };

  // ---- lock ----
  const lockToggle = h('input', { type: 'checkbox', checked: !!st.lock.enabled, role: 'switch' });
  const when = h('input.input', { type: 'datetime-local', value: isoToIstInput(st.lock.unlockAt), step: '60' });
  const whenPretty = h('p.muted.small', `Opens: ${prettyIst(st.lock.unlockAt)}`);
  lockToggle.addEventListener('change', () => { state.site.settings.lock.enabled = lockToggle.checked; change(null, { render: false }); });
  when.addEventListener('change', () => {
    const iso = istInputToIso(when.value);
    if (!iso) return;
    state.site.settings.lock.unlockAt = iso;
    whenPretty.textContent = `Opens: ${prettyIst(iso)}`;
    change(null, { render: false });
  });
  const lockCard = h('section.card.settings-card',
    h('h3.settings-title', 'Birthday lock'),
    h('p.card-hint', 'Until this moment, anyone opening the site sees a gentle countdown instead of the film. Your Preview button always skips the lock.'),
    h('label.switch-row', h('span.switch', lockToggle, h('span.switch-ui')), h('span', 'Keep the film locked until her birthday')),
    h('label.field', h('span.field-label', 'Unlocks at (India time, IST)'), when),
    whenPretty,
    h('button.btn.sm.quiet', { type: 'button', onclick: () => {
      state.site.settings.lock.unlockAt = '2027-01-03T00:00:00+05:30';
      change(null);
    } }, icon('undo'), 'Reset to 3 Jan 2027, midnight'),
  );

  // ---- grading ----
  const sVal = Math.round(strength() * 100);
  const slider = h('input.range', { type: 'range', min: '0', max: '100', step: '1', value: String(sVal), 'aria-label': 'Grading strength' });
  const sLabel = h('span.range-val', `${sVal}%`);
  const sampleCanvas = h('canvas.ba-canvas');
  const sampleBox = h('div.ba-box', h('p.muted.small', 'Loading a sample…'));
  const baBefore = h('button.seg', { type: 'button', 'aria-pressed': 'false' }, 'Before');
  const baAfter = h('button.seg', { type: 'button', 'aria-pressed': 'true' }, 'After');
  let showAfter = true;
  let sample = null; // { canvas (small, ungraded) }
  const drawSample = debounce(async () => {
    if (!sample) return;
    const c = showAfter ? await I.previewCrop(sample, { x: 0, y: 0, w: sample.width, h: sample.height }, `${sample.width}:${sample.height}`, strength(), 640) : sample;
    sampleCanvas.width = c.width; sampleCanvas.height = c.height;
    sampleCanvas.getContext('2d').drawImage(c, 0, 0);
  }, 90);
  const setBA = (after) => { showAfter = after; baAfter.setAttribute('aria-pressed', String(after)); baBefore.setAttribute('aria-pressed', String(!after)); drawSample(); };
  baBefore.addEventListener('click', () => setBA(false));
  baAfter.addEventListener('click', () => setBA(true));
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    sLabel.textContent = `${v}%`;
    state.site.settings.grading.strength = Math.round(v) / 100;
    change(null, { render: false });
    drawSample();
  });
  const useSample = (canvas) => {
    sample = I.drawRegion(canvas, 0, 0, canvas.width, canvas.height, ...fitLong(canvas.width, canvas.height, 640));
    sampleBox.replaceChildren(sampleCanvas);
    drawSample();
  };
  loadSampleOriginal().then((c) => {
    if (c) useSample(c);
    else sampleBox.replaceChildren(h('p.muted.small', 'Add a photo first — or try the look on any photo:'));
  });
  const gradingCard = h('section.card.settings-card',
    h('h3.settings-title', 'Colour grading'),
    h('p.card-hint', 'Every new photo is graded into the film’s warm “lantern night” palette so they all belong together. The strength applies to future uploads.'),
    h('div.range-row', h('span.muted.small', 'Natural'), slider, h('span.muted.small', 'Full look'), sLabel),
    h('div.ba', h('div.seg-group', baBefore, baAfter), sampleBox),
    h('div.card-actions.wrap',
      h('button.btn.sm.ghost', { type: 'button', onclick: async () => {
        const [f] = await pickFiles({ accept: 'image/*' });
        if (!f) return;
        const dec = await openFile(f);
        if (dec) useSample(dec.canvas);
      } }, icon('image'), 'Try on a photo'),
      h('button.btn.sm.gold-soft', { type: 'button', onclick: regradeAll }, icon('sparkle'), 'Re-grade all photos from originals'),
    ),
    h('p.muted.small', 'Re-grading makes fresh graded copies of every photo from its saved original (originals are never changed). It becomes part of your draft — publish to make it live.'),
  );

  // ---- WhatsApp ----
  const wa = h('input.input', { type: 'tel', inputmode: 'numeric', value: st.whatsapp || '', placeholder: 'e.g. 919876543210', autocomplete: 'off' });
  const waTest = h('a.link-btn', { target: '_blank', rel: 'noopener' }, icon('link'), 'Test the link');
  const syncWa = () => { const d = (state.site.settings.whatsapp || ''); waTest.href = d ? `https://wa.me/${d}` : '#'; waTest.hidden = !d; };
  wa.addEventListener('input', () => {
    const digits = wa.value.replace(/\D+/g, '').slice(0, 15);
    if (digits !== wa.value) wa.value = digits;
    state.site.settings.whatsapp = digits;
    syncWa();
    change(null, { render: false });
  });
  syncWa();
  const waCard = h('section.card.settings-card',
    h('h3.settings-title', 'WhatsApp “send a hug”'),
    h('p.card-hint', 'At the end she can tap “Send a hug” — it opens WhatsApp to YOUR number with a message. Digits only, with the country code (India = 91), no + or spaces.'),
    h('label.field', h('span.field-label', 'Your WhatsApp number'), wa),
    waTest,
  );

  // ---- GitHub ----
  const owner = h('input.input', { type: 'text', value: state.repo.owner, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const repo = h('input.input', { type: 'text', value: state.repo.repo, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const branch = h('input.input', { type: 'text', value: state.repo.branch, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const connLine = h('p.conn-line', { dataset: { conn: state.conn.status } },
    h('span.chip-dot'),
    state.conn.status === 'ok' ? `Connected to ${state.repo.owner}/${state.repo.repo} · ${state.repo.branch}`
      : state.conn.status === 'error' ? state.conn.message
        : state.conn.token ? 'Token saved — not checked yet' : 'Not connected — you can look around, but publishing needs a token.');
  const ghCard = h('section.card.settings-card',
    h('h3.settings-title', 'GitHub (where the site lives)'),
    connLine,
    h('div.field-grid',
      h('label.field', h('span.field-label', 'Owner'), owner),
      h('label.field', h('span.field-label', 'Repository'), repo),
      h('label.field', h('span.field-label', 'Branch'), branch)),
    h('div.card-actions.wrap',
      h('button.btn.sm.ghost', { type: 'button', onclick: async () => {
        const cfg = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main' };
        if (!cfg.owner || !cfg.repo) { toast('Please fill in the owner and repository.', { type: 'error' }); return; }
        state.repo = cfg;
        lsSet(REPO_KEY, JSON.stringify(cfg));
        state.site.settings.github = { ...cfg };
        change(null, { render: false });
        if (state.conn.token) {
          const remote = await connectAndFetch({ quiet: true });
          if (remote) { adoptRemote(remote); toast('Connected. ✨', { type: 'success' }); }
          else renderTab({ keepScroll: true });
        } else showConnectSheet({});
      } }, icon('check'), 'Save & reconnect'),
      h('button.btn.sm.ghost', { type: 'button', onclick: () => showConnectSheet({}) }, icon('key'), state.conn.token ? 'Change token' : 'Add token'),
      state.conn.token ? h('button.btn.sm.quiet', { type: 'button', onclick: forgetToken }, icon('trash'), 'Forget token') : null,
    ),
    h('p.muted.small', 'The token is stored only in this browser. Tap “Forget token” on shared devices.'),
  );

  // ---- danger ----
  const ch = changes();
  const dangerCard = h('section.card.settings-card.danger-zone',
    h('h3.settings-title', 'Draft'),
    h('p.card-hint', ch.count ? `You have ${plural(ch.count, 'unpublished change')} on this device.` : 'No unpublished changes.'),
    h('button.btn.sm.danger', { type: 'button', disabled: !ch.count, onclick: discardAll }, icon('trash'), 'Discard all unpublished changes'),
  );

  return h('div.settings-tab', sectionHead('Settings', 'The little levers', null),
    h('div.settings-grid', lockCard, gradingCard, waCard, ghCard, dangerCard));
}

function fitLong(w, h2, max) {
  const s = Math.min(1, max / Math.max(w, h2));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h2 * s))];
}

function debounce(fn, ms) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function loadSampleOriginal() {
  const all = [...(state.site.slots || []), ...(state.site.extras || [])].filter((x) => x.original);
  for (const x of all.slice(0, 3)) {
    try {
      const blob = await getFileBlob(x.original);
      return await I.blobToCanvas(blob);
    } catch { /* try next */ }
  }
  return null;
}

/** A file's bytes: staged → just published → GitHub API → Pages → raw.githubusercontent. */
async function getFileBlob(path) {
  const local = state.files.get(path) || state.sessionBlobs.get(path);
  if (local) return local;
  if (state.conn.status === 'ok') {
    try { return await client().getBlob(path); } catch (err) { if (err.status && err.status !== 404) throw err; }
  }
  for (const url of [`../${path}`, new GitHub(state.repo).rawUrl(path)]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.blob();
    } catch { /* next */ }
  }
  throw new Error(`Couldn’t download ${path}`);
}

async function regradeAll() {
  const targets = [
    ...(state.site.slots || []).filter((s) => s.original).map((s) => ({ kind: 'slot', item: s })),
    ...(state.site.extras || []).filter((x) => x.original).map((x) => ({ kind: 'extra', item: x })),
  ];
  if (!targets.length) { toast('There are no photos with saved originals yet.'); return; }
  const ok = await confirmDialog({
    title: `Re-grade ${plural(targets.length, 'photo')}?`,
    message: `Each photo is re-coloured from its original at ${Math.round(strength() * 100)}% strength. Originals stay untouched; this becomes part of your draft (publish to make it live). It can take a minute.`,
    confirm: 'Re-grade',
  });
  if (!ok) return;
  const prog = progressSheet({ kicker: 'Colour grading', title: 'Re-grading photos…' });
  let done = 0;
  const errors = [];
  for (const t of targets) {
    prog.set(done / targets.length, `Photo ${done + 1} of ${targets.length}…`);
    try {
      const blob = await getFileBlob(t.item.original);
      const canvas = await I.blobToCanvas(blob);
      const graded = await I.gradeFromOriginal(canvas, t.item.ratio, strength());
      const gb = await canvasToJpegBlob(graded, 0.88);
      const path = M.uniquePath(M.photoPaths(t.kind, t.item.id).src, takenPath);
      state.files.set(path, gb);
      t.item.src = path;
      if (t.kind === 'slot') t.item.updatedAt = new Date().toISOString();
    } catch (err) {
      errors.push(`${t.item.label || t.item.id}: ${err.message || err}`);
    }
    done++;
  }
  prog.set(1, 'Done');
  prog.close();
  change(null, { files: true });
  if (errors.length) toast(`Re-graded ${targets.length - errors.length} of ${targets.length}. Some failed: ${errors.slice(0, 2).join('; ')}`, { type: 'error' });
  else toast(`Re-graded ${plural(targets.length, 'photo')}. Preview, then publish.`, { type: 'success' });
}

async function discardAll() {
  const ok = await confirmDialog({ title: 'Discard all unpublished changes?', message: 'Everything goes back to what’s live on the site now. This can’t be undone.', confirm: 'Discard everything', danger: true });
  if (!ok) return;
  state.site = M.clone(state.base);
  gcFiles();
  await flushSave();
  await clearDraft().catch(() => {});
  renderTab();
  toast('Draft discarded.');
}

function forgetToken() {
  lsSet(TOKEN_KEY, null);
  state.conn = { status: 'none', message: '', token: '' };
  updateChrome();
  renderTab({ keepScroll: true });
  toast('Token forgotten on this device.');
}

/* ---------------------------- Connect --------------------------------- */

function showConnectSheet({ firstRun = false } = {}) {
  const tokenInput = h('input.input.mono', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: '' });
  const showBtn = h('button.link-btn', { type: 'button', onclick: () => { tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password'; showBtn.textContent = tokenInput.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
  const err = h('p.form-error', { hidden: true });
  const repoName = `${state.repo.owner}/${state.repo.repo}`;
  const steps = h('details.howto', { open: firstRun },
    h('summary', 'How to get a token (2 minutes)'),
    h('ol.steps',
      h('li', 'On ', h('b', 'github.com'), ' (signed in as ', h('b', state.repo.owner), '), open ', h('b', 'Settings → Developer settings → Personal access tokens → Fine-grained tokens'), ' → ', h('b', 'Generate new token'), '. ',
        h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'Open it directly ↗')),
      h('li', 'Name it “Lantern Room”. Set the expiration to after her birthday (e.g. 90 days).'),
      h('li', 'Repository access → ', h('b', 'Only select repositories'), ' → choose ', h('b', state.repo.repo), '.'),
      h('li', 'Repository permissions → ', h('b', 'Contents'), ' → ', h('b', 'Read and write'), '. (Leave everything else as is.)'),
      h('li', 'Tap ', h('b', 'Generate token'), ', copy it (it starts with ', h('code', 'github_pat_'), ') and paste it below.'),
    ),
  );
  const connectBtn = h('button.btn.gold', { type: 'button' }, icon('key'), 'Connect');
  const s = openSheet({
    kicker: firstRun ? 'Welcome to the Lantern Room' : 'GitHub',
    title: firstRun ? 'Connect once, publish anytime' : 'Connect to GitHub',
    content: [
      h('p.sheet-text', 'To publish changes, this page needs a GitHub key (a “token”) that can update ', h('b', repoName), '. You only do this once on each device.'),
      steps,
      h('label.field', h('span.field-top', h('span.field-label', 'Paste your token'), showBtn), tokenInput),
      err,
      h('p.muted.small', 'It’s saved only in this browser. Publishing goes to ', h('b', `${repoName} · ${state.repo.branch}`), ' (change this in Settings → GitHub).'),
    ],
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => s.close(null) }, firstRun ? 'Just look around' : 'Cancel'),
      connectBtn,
    ],
  });
  const go = async () => {
    const t = tokenInput.value.trim();
    if (!t) { err.textContent = 'Paste the token first.'; err.hidden = false; tokenInput.focus(); return; }
    connectBtn.disabled = true;
    connectBtn.lastChild.textContent = 'Checking…';
    err.hidden = true;
    const prev = state.conn.token;
    state.conn.token = t;
    try {
      const remote = await connectAndFetch({ quiet: false });
      lsSet(TOKEN_KEY, t);
      s.close('ok');
      adoptRemote(remote);
      toast('Connected to GitHub. You can publish now. ✨', { type: 'success' });
    } catch (e) {
      state.conn.token = prev;
      if (!prev) state.conn.status = 'none';
      updateChrome();
      err.textContent = e.message || String(e);
      err.hidden = false;
      connectBtn.disabled = false;
      connectBtn.lastChild.textContent = 'Connect';
    }
  };
  connectBtn.addEventListener('click', go);
  tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

/* ---------------------------- Preview --------------------------------- */

async function preview() {
  const hasDraft = changes().count > 0;
  const url = hasDraft ? '../index.html?preview&draft' : '../index.html?preview';
  const w = window.open('', '_blank');
  await flushSave();
  if (w) {
    try { w.location.href = url; } catch { window.open(url, '_blank'); }
  } else {
    toast('Your browser blocked the new tab — allow pop-ups for this page, or tap here.', { action: { label: 'Open preview', run: () => window.open(url, '_blank') } });
  }
}

/* ---------------------------- Publish --------------------------------- */

async function publishFlow() {
  const ch = changes();
  if (!ch.count) { toast('Nothing new to publish — everything is already live. ✨'); return; }
  if (state.conn.status !== 'ok' || !state.conn.token) {
    if (state.conn.token) {
      const remote = await connectAndFetch({ quiet: true });
      if (!remote) return showConnectSheet({});
      adoptRemote(remote);
    } else return showConnectSheet({});
  }
  const fresh = changes();
  const msg = h('input.input', { type: 'text', value: fresh.message, maxlength: '120' });
  const big = [...state.files.values()].reduce((n, b) => n + b.size, 0);
  const s = openSheet({
    kicker: 'Publish',
    title: `Publish ${plural(fresh.count, 'change')}?`,
    content: [
      changeList(fresh),
      h('p.muted.small', `${plural(state.files.size, 'new file')} to upload (${M.formatBytes(big)}).`),
      h('details.howto', h('summary', 'Note for the history (optional)'), h('label.field', msg)),
      h('p.sheet-text', 'The live site updates about 1–2 minutes after publishing.'),
    ],
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => s.close(null) }, 'Not yet'),
      h('button.btn.gold', { type: 'button', autofocus: true, onclick: () => s.close('go') }, icon('send'), 'Publish now'),
    ],
  });
  if ((await s.result) !== 'go') return;
  await doPublish(msg.value.trim() || fresh.message);
}

async function doPublish(message) {
  await flushSave();
  const prog = progressSheet({ kicker: 'Publishing', title: 'Sending your changes to the site…' });
  const gh = client();
  const myBase = state.base;
  const mySite = state.site;
  try {
    const res = await gh.publish({
      message,
      onProgress: (f, label) => prog.set(f, label),
      prepare: (remote, existing) => {
        const remoteChanged = !M.deepEqual(remote, myBase);
        const merged = remoteChanged ? M.merge3(myBase, mySite, remote) : M.clone(mySite);
        const refs = M.referencedPaths(merged);
        const remoteRefs = M.referencedPaths(remote);
        const files = new Map();
        for (const [p, b] of state.files) if (refs.has(p)) files.set(p, b);
        const missing = [...refs].filter((p) => !files.has(p) && !existing.has(p) && !remoteRefs.has(p) && M.isManagedPath(p));
        if (missing.length) {
          throw new Error(`Some new files in your draft are missing on this device (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}). Please upload those photos again, then publish.`);
        }
        const candidates = new Set([...M.referencedPaths(myBase), ...remoteRefs]);
        const deletes = [...candidates].filter((p) => !refs.has(p) && M.isManagedPath(p) && existing.has(p));
        return { site: merged, files, deletes };
      },
    });
    for (const p of res.uploaded) { const b = state.files.get(p); if (b) state.sessionBlobs.set(p, b); }
    state.base = M.clone(res.site);
    state.site = M.clone(res.site);
    state.files = new Map();
    state.filesDirty = true;
    await clearDraft().catch(() => {});
    prog.close();
    renderTab({ keepScroll: true });
    const live = liveUrl();
    const done = openSheet({
      kicker: 'Done',
      title: 'Published! ✨',
      content: [
        h('div.success-orb', icon('lantern')),
        h('p.sheet-text.center', 'Published! The live site updates in about 1–2 minutes.'),
        res.retried ? h('p.muted.small.center', 'Someone else had changed the site at the same moment — both sets of changes were kept.') : null,
        res.deleted.length ? h('p.muted.small.center', `${plural(res.deleted.length, 'old file')} tidied away.`) : null,
      ],
      actions: [
        live ? h('a.btn.ghost', { href: live, target: '_blank', rel: 'noopener' }, icon('link'), 'Open the live site') : null,
        h('button.btn.gold', { type: 'button', onclick: () => done.close() }, 'Lovely'),
      ].filter(Boolean),
    });
  } catch (err) {
    console.error('[admin] publish failed', err);
    prog.close();
    if (err.status === 401) { state.conn.status = 'error'; state.conn.message = err.message; updateChrome(); }
    const s = openSheet({
      kicker: 'Not published',
      title: 'That didn’t work',
      content: [h('p.sheet-text', err.message || String(err)), h('p.muted.small', 'Your draft is safe on this device — nothing was lost.')],
      actions: [
        err.status === 401 || err.status === 403 || err.status === 404
          ? h('button.btn.ghost', { type: 'button', onclick: () => { s.close(); showConnectSheet({}); } }, icon('key'), 'Check token')
          : null,
        h('button.btn.gold', { type: 'button', onclick: () => { s.close(); publishFlow(); } }, 'Try again'),
      ].filter(Boolean),
    });
  }
}

/* ---------------------------- Help ------------------------------------ */

function renderHelp() {
  const item = (title, ...body) => h('details.help-item', h('summary', title), h('div.help-body', ...body));
  const live = liveUrl();
  return h('div.help-tab',
    sectionHead('Help', 'How the Lantern Room works', 'Everything you change is saved on this device as a draft until you press Publish.'),
    h('div.help-list',
      item('Replacing a photo — the “same shape” rule',
        h('p', 'Every spot in the film has a fixed shape, shown on its badge (for example ', h('b', '3:4'), ' = portrait, ', h('b', '1:1'), ' = square, ', h('b', '4:3'), ' = landscape).'),
        h('p', 'A new photo must have the same shape as the spot. If yours already matches, it’s used as is. If not, a cropper opens that is locked to that shape: drag to move, pinch (or scroll) to zoom, then tap ', h('b', 'Use this photo'), '.'),
        h('p', 'Every photo is also colour-graded into the film’s warm palette automatically.')),
      item('Filling lots of spots at once',
        h('p', 'On the Photos tab tap ', h('b', 'Fill all empty slots'), ' and select many photos. Each one is cropped to its spot (leaning towards the top, where faces usually are). Tap ', h('b', 'Adjust'), ' to reframe any of them, ', h('b', 'Skip'), ' to leave one out, then ', h('b', 'Add to draft'), '.'),
        h('p', 'Tip: fill the special spots (the opening portrait, the grand reveal, the photo of you two) one by one first.')),
      item('Adding extra memories',
        h('p', 'On ', h('b', 'Extra memories'), ' tap ', h('b', 'Add memories'), ', choose photos, pick a shape for each (portrait, square or landscape) and add a caption if you like. You can add more any time — even after her birthday.'),
        h('p', 'Once added, a memory’s shape is locked, so replacing it later keeps the same shape. Use the arrows to reorder, or the bin to delete.')),
      item('Previewing before it goes live',
        h('p', 'Tap ', h('b', 'Preview'), ' to open the film in a new tab with your draft — new photos, words and music included. Preview always skips the birthday countdown. Nobody else can see your draft.')),
      item('Publishing',
        h('p', 'Tap ', h('b', 'Publish'), '. Everything in your draft goes to the site in one go. ', h('b', 'The live site updates about 1–2 minutes later'), ' (refresh the page if it still looks old).'),
        live ? h('p', 'The live site: ', h('a', { href: live, target: '_blank', rel: 'noopener' }, live)) : null),
      item('The birthday countdown lock',
        h('p', 'Go to ', h('b', 'Settings → Birthday lock'), '. Turn the switch off to show the film right away, or change the date and time (India time). Remember to publish afterwards.')),
      item('What is the “token”?',
        h('p', 'A token is a private key that lets this page update the website on GitHub on your behalf. It only works for this one repository, and it’s stored only in this browser.'),
        h('p', 'Never share it. On a shared device, use ', h('b', 'Settings → GitHub → Forget token'), ' when you’re done. If it expires, create a new one the same way and paste it in.')),
      item('Something went wrong',
        h('p', 'Your draft is saved on this device, so nothing is lost if the tab closes. If publishing fails, the message tells you why — usually an expired token or no internet. Fix that and press Publish again.'),
        h('p', 'iPhone photos in HEIC format may not open in some browsers: share them as JPEG / “Most Compatible” instead.')),
    ),
  );
}

/* ====================================================================== */

boot().catch((err) => {
  console.error(err);
  renderFatal(err.message || String(err));
});

// exposed for debugging / automated checks
window.__lanternRoom = { state, flushSave, changes };
