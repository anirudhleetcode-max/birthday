/**
 * admin.js — "The Lantern Room": the CMS for the birthday film (content model v2).
 *
 * Shell: sidebar (desktop) / bottom bar + drawer (phone); header with status,
 * SAVE DRAFT, PREVIEW, PUBLISH and an overflow (EXPORT, RESET). Sections are routed by
 * the URL hash. All state lives in state.js; photo work in photos.js / editor.js;
 * publishing, export and reset in publish.js.
 */
import { upgrade } from '../assets/js/shared/model.js';
import {
  state, setHooks, changes, hasUnsavedDraft, flushSave, readDraft, clearDraft, fetchLocalSite, connectAndFetch,
  loadRepoCfg, lsGet, lsSet, TOKEN_KEY, SECTION_KEY, DEFAULT_REPO, gcFiles,
} from './state.js';
import { clone, describeChanges, mergeSites, plural, timeAgo } from './util.js';
import { h, icon, toast, openSheet, openMenu, sheetOpen } from './ui.js';
import { publishFlow, exportZip, resetFlow, showConnectSheet, changeList } from './publish.js';
import { openPreview } from './photos.js';
import { renderLibrary, restoreFilter } from './sections/library.js';
import { renderChapters } from './sections/chapters.js';
import { renderMessages } from './sections/messages.js';
import { renderAudio, renderVideo } from './sections/media.js';
import { renderTheme } from './sections/theme.js';
import { renderPreview } from './sections/preview.js';
import { renderSettings } from './sections/settings.js';
import { renderHelp } from './sections/help.js';

const SECTIONS = [
  { id: 'library', label: 'Photo library', short: 'Photos', icon: 'images', render: renderLibrary, primary: true },
  { id: 'chapters', label: 'Chapters', icon: 'film', render: renderChapters, primary: true },
  { id: 'messages', label: 'Messages', icon: 'quote', render: renderMessages, primary: true },
  { id: 'audio', label: 'Audio', icon: 'music', render: renderAudio },
  { id: 'video', label: 'Video', icon: 'video', render: renderVideo },
  { id: 'theme', label: 'Theme', icon: 'palette', render: renderTheme },
  { id: 'preview', label: 'Preview', icon: 'eye', render: renderPreview, primary: true },
  { id: 'settings', label: 'Settings', icon: 'gear', render: renderSettings },
  { id: 'help', label: 'Help', icon: 'help', render: renderHelp },
];
const WELCOME_KEY = 'deepu-admin-welcomed';
const $ = (sel, root = document) => root.querySelector(sel);

/* ================================================================ shell */
function navItem(s, cls) {
  return h(`a.${cls}`, { href: `#${s.id}`, dataset: { section: s.id }, 'aria-label': s.label },
    icon(s.icon), h('span.nav-label', cls === 'bnav-item' && s.short ? s.short : s.label));
}

function buildShell() {
  $('#nav').replaceChildren(...SECTIONS.map((s) => navItem(s, 'nav-item')));
  $('#bottomnav').replaceChildren(
    ...SECTIONS.filter((s) => s.primary).map((s) => navItem(s, 'bnav-item')),
    h('button.bnav-item', { type: 'button', id: 'bnav-more', 'aria-haspopup': 'dialog', onclick: openDrawer }, icon('menu'), h('span.nav-label', 'More')));
  for (const b of document.querySelectorAll('[data-action="save"]')) b.addEventListener('click', saveDraftNow);
  for (const b of document.querySelectorAll('[data-action="preview"]')) b.addEventListener('click', () => openPreview(null));
  for (const b of document.querySelectorAll('[data-action="publish"]')) b.addEventListener('click', publishFlow);
  for (const b of document.querySelectorAll('[data-action="more"]')) b.addEventListener('click', () => openOverflow(b));
  $('#status').addEventListener('click', onStatusClick);
  window.addEventListener('hashchange', () => route({ focus: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', () => { flushSave(); });
  window.addEventListener('beforeunload', (e) => {
    if (!state.site) return;
    if (hasUnsavedDraft() || changes().count > 0) {
      flushSave();
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveDraftNow(); }
  });
}

function openOverflow(anchor) {
  const ch = changes();
  openMenu(anchor, [
    { label: 'Export (.zip)', hint: 'Content files + new photos, for manual hosting', icon: 'download', testid: 'menu-export', run: exportZip },
    { label: 'Reset changes', hint: ch.count ? `Discard ${plural(ch.count, 'unpublished change')}` : 'Nothing to reset', icon: 'undo', danger: true, disabled: !ch.count && !state.files.size, testid: 'menu-reset', run: resetFlow },
    null,
    { label: state.conn.token ? 'GitHub connection' : 'Connect GitHub', icon: 'key', run: () => showConnectSheet({}) },
    { label: 'Help', icon: 'help', run: () => { location.hash = '#help'; } },
  ], { label: 'More actions' });
}

function openDrawer() {
  const ch = changes();
  const s = openSheet({
    kicker: 'The Lantern Room', title: 'Sections', drawer: true, size: 'sm',
    content: [
      h('nav.drawer-nav', { 'aria-label': 'All sections' }, SECTIONS.map((sec) => h('a.drawer-item', {
        href: `#${sec.id}`, 'aria-current': sec.id === state.section ? 'page' : null, onclick: () => s.close(),
      }, icon(sec.icon), h('span', sec.label)))),
      h('div.drawer-actions',
        h('button.btn.ghost', { type: 'button', onclick: () => { s.close(); exportZip(); } }, icon('download'), 'Export (.zip)'),
        h('button.btn.danger', { type: 'button', disabled: !ch.count && !state.files.size, onclick: () => { s.close(); resetFlow(); } }, icon('undo'), 'Reset changes')),
    ],
  });
}

async function saveDraftNow() {
  const ok = await flushSave();
  if (ok && !hasUnsavedDraft()) {
    const n = changes().count;
    toast(n ? `Draft saved on this device (${plural(n, 'unpublished change')}).` : 'Saved — nothing unpublished.', { type: 'success' });
  } else toast(`Couldn’t save the draft on this device (${state.saveError || 'unknown error'}). Keep this tab open and publish soon.`, { type: 'error' });
}

function onStatusClick() {
  const ch = changes();
  if (!ch.count && state.conn.status !== 'ok') { showConnectSheet({}); return; }
  if (!ch.count) { toast('Everything is published. ✨', { type: 'success' }); return; }
  const s = openSheet({
    kicker: 'Unpublished draft', title: `${plural(ch.count, 'change')} waiting`, size: 'md',
    content: [
      h('p.sheet-text', `Saved on this device${state.savedAt ? ` ${timeAgo(state.savedAt)}` : ''}. Preview them, then publish to make them live.`),
      changeList(ch),
    ],
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => { s.close(); openPreview(null); } }, icon('eye'), 'Preview'),
      h('button.btn.gold', { type: 'button', onclick: () => { s.close(); publishFlow(); } }, icon('send'), 'Publish'),
    ],
  });
}

/* ================================================================ chrome */
function updateChrome() {
  const ch = state.base && state.site ? changes() : { count: 0 };
  const chip = $('#status');
  const conn = state.conn.status;
  chip.dataset.conn = conn;
  chip.dataset.draft = ch.count ? 'yes' : 'no';
  const connText = conn === 'ok' ? 'Connected' : conn === 'checking' ? 'Connecting…' : conn === 'error' ? 'Connection problem' : 'Not connected';
  const saveText = state.saving ? 'saving…' : state.saveError ? 'not saved!' : hasUnsavedDraft() ? 'unsaved' : 'saved';
  $('.status-main', chip).textContent = ch.count ? `Draft · ${plural(ch.count, 'unpublished change')}` : connText;
  $('.status-sub', chip).textContent = ch.count ? `${connText} · ${saveText} on this device` : state.source === 'github' ? 'Everything is live' : 'Using the site’s copy';
  $('.status-short', chip).textContent = ch.count ? `Draft · ${ch.count}` : conn === 'ok' ? 'All live' : conn === 'error' ? 'Problem' : conn === 'checking' ? '…' : 'Connect';
  chip.setAttribute('aria-label', `${connText}. ${ch.count ? `${plural(ch.count, 'unpublished change')}, ${saveText} on this device.` : 'Nothing unpublished.'}`);
  chip.dataset.save = state.saveError ? 'error' : hasUnsavedDraft() ? 'pending' : 'ok';
  for (const b of document.querySelectorAll('[data-action="publish"]')) {
    const badge = $('.badge-count', b);
    if (badge) { badge.textContent = String(ch.count); badge.hidden = !ch.count; }
    b.classList.toggle('has-changes', !!ch.count);
  }
  for (const b of document.querySelectorAll('[data-action="save"]')) b.classList.toggle('has-unsaved', hasUnsavedDraft());
  for (const a of document.querySelectorAll('[data-section]')) {
    if (a.dataset.section === state.section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const sec = SECTIONS.find((s) => s.id === state.section);
  $('#topbar-title').textContent = sec ? sec.label : '';
  document.title = `${sec ? `${sec.label} · ` : ''}The Lantern Room`;
}

/* ================================================================ rendering */
function render({ keepScroll = false, focus = false } = {}) {
  if (!state.site) return;
  const view = $('#view');
  const active = document.activeElement;
  const fk = active && view.contains(active) && active.dataset ? active.dataset.fk : null;
  const y = window.scrollY;
  const sec = SECTIONS.find((s) => s.id === state.section) || SECTIONS[0];
  view.replaceChildren(sec.render());
  view.dataset.section = sec.id;
  updateChrome();
  if (keepScroll) window.scrollTo(0, y);
  else window.scrollTo({ top: 0 });
  if (fk) {
    const el = view.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (el && !el.disabled) el.focus({ preventScroll: true });
    else if (el) (el.closest('.pcard')?.querySelector('[data-act="grip"]') || el).focus({ preventScroll: true });
  } else if (focus && !sheetOpen()) {
    view.querySelector('.section-title')?.focus({ preventScroll: true });
  }
}

function route({ focus = false } = {}) {
  const id = location.hash.slice(1);
  const next = SECTIONS.some((s) => s.id === id) ? id : state.section;
  if (next !== state.section || !$('#view').dataset.section) {
    state.section = next;
    lsSet(SECTION_KEY, next);
    render({ focus });
  } else updateChrome();
}

function renderLoading() {
  $('#view').replaceChildren(h('div.loading', { role: 'status' }, h('div.loading-orb', { 'aria-hidden': 'true' }), h('p', 'Lighting the lanterns…')));
}

function renderFatal(msg) {
  $('#view').replaceChildren(h('section.panel.fatal', { role: 'alert' }, h('h2', 'Something’s not right'), h('p', msg),
    h('div.card-actions.wrap',
      h('button.btn.gold', { type: 'button', onclick: () => location.reload() }, 'Try again'),
      h('button.btn.ghost', { type: 'button', onclick: () => showConnectSheet({}) }, 'Connect GitHub'))));
}

/* ================================================================ boot */
async function restoreDraft() {
  const d = await readDraft();
  if (!d || !d.site) return;
  let draftSite;
  let rebased;
  try {
    draftSite = upgrade(clone(d.site));
    const draftBase = d.base ? upgrade(clone(d.base)) : state.base;
    rebased = mergeSites(draftBase, draftSite, state.base);
  } catch (err) {
    console.warn('[admin] draft could not be rebased', err);
    rebased = draftSite || upgrade(d.site);
  }
  const ch = describeChanges(state.base, rebased);
  if (!ch.count) { await clearDraft().catch(() => {}); return; }
  const adopt = () => {
    state.site = rebased;
    state.files = d.files || new Map();
    state.filesDirty = false;
    gcFiles();
    state.rev++;
    state.savedRev = state.rev;
    state.savedAt = d.savedAt;
  };
  const s = openSheet({
    kicker: 'Welcome back', title: 'Continue where you left off?', dismissible: false, size: 'md',
    content: [
      h('p.sheet-text', `You have ${plural(ch.count, 'unpublished change')} saved on this device${d.savedAt ? ` (${timeAgo(d.savedAt)})` : ''}.`),
      changeList(ch),
    ],
    actions: [
      h('button.btn.ghost', { type: 'button', 'data-testid': 'draft-discard', onclick: () => s.close('discard') }, 'Discard draft'),
      h('button.btn.gold', { type: 'button', autofocus: true, 'data-testid': 'draft-continue', onclick: () => s.close('continue') }, 'Continue'),
    ],
  });
  const choice = await s.result;
  if (choice === 'continue') {
    adopt();
    toast('Draft restored. ✨', { type: 'success' });
    return;
  }
  const c = openSheet({
    kicker: 'Discard draft', title: 'Delete the unpublished changes?', size: 'sm', dismissible: false,
    content: h('p.sheet-text', 'They’ll be removed from this device and you’ll start from what’s live. This can’t be undone.'),
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => c.close(false) }, 'Keep them'),
      h('button.btn.danger', { type: 'button', 'data-testid': 'confirm-ok', onclick: () => c.close(true) }, 'Discard'),
    ],
  });
  if (await c.result) { await clearDraft().catch(() => {}); toast('Draft discarded.'); }
  else { adopt(); toast('Draft kept. ✨', { type: 'success' }); }
}

async function boot() {
  buildShell();
  setHooks({ render, chrome: updateChrome });
  restoreFilter();
  const hashSec = location.hash.slice(1);
  const stored = lsGet(SECTION_KEY);
  state.section = SECTIONS.some((s) => s.id === hashSec) ? hashSec : SECTIONS.some((s) => s.id === stored) ? stored : 'library';
  renderLoading();
  updateChrome();

  const storedRepo = loadRepoCfg();
  state.conn.token = lsGet(TOKEN_KEY) || '';
  let local = null;
  try { local = await fetchLocalSite(); } catch (err) { console.warn('[admin] ../data/*.json unavailable', err); }
  const fromSite = local && local.settings && local.settings.github;
  state.repo = storedRepo || (fromSite && fromSite.owner ? { owner: fromSite.owner, repo: fromSite.repo, branch: fromSite.branch || 'main' } : { ...DEFAULT_REPO });

  let base = null;
  if (state.conn.token) {
    try {
      base = await connectAndFetch();
      state.source = 'github';
    } catch (err) {
      console.warn('[admin] GitHub unavailable', err);
      toast(`${err.message || err} — showing the site’s own copy for now.`, { type: 'error' });
    }
  }
  if (!base && local) { base = local; state.source = 'pages'; }
  if (!base) {
    renderFatal('Couldn’t load the site’s content (data/settings.json, messages.json, photos.json). Check your internet connection, or connect GitHub.');
    return;
  }
  state.base = upgrade(clone(base));
  state.site = clone(state.base);
  await restoreDraft();
  if (location.hash.slice(1) !== state.section) history.replaceState(null, '', `#${state.section}`);
  render();
  if (!state.conn.token && !lsGet(WELCOME_KEY)) {
    lsSet(WELCOME_KEY, '1');
    showConnectSheet({ firstRun: true });
  }
}

boot().catch((err) => {
  console.error(err);
  renderFatal(err.message || String(err));
});

// for automated checks / debugging
window.__lanternRoom = { state, flushSave, changes };
