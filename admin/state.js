/**
 * state.js — the admin's single source of truth.
 *
 *   base   the published content (combined v2 site, read fresh from GitHub or ../data/*.json)
 *   site   the working draft (auto-saved to IndexedDB through shared/drafts.js)
 *   files  Map<repo path, Blob> of new, not-yet-published files; their final paths are
 *          already in `site`, so the film's ?draft preview resolves them to blob: URLs
 *
 * Every edit goes through change(fn) → revision++ → autosave (debounced) → chrome update →
 * re-render. SAVE DRAFT flushes immediately. Publishing (publish.js) turns base → site
 * into ONE commit.
 */
import { saveDraft, loadDraft, clearDraft } from '../assets/js/shared/drafts.js';
import { FILES, LEGACY_FILE, combine, upgrade, usedFiles, normalize } from '../assets/js/shared/model.js';
import { GitHub } from './github.js';
import { clone, deepEqual, describeChanges, deletedPaths, uniquePath, photoPaths, mergeSites } from './util.js';

export const TOKEN_KEY = 'deepu-admin-token';
export const REPO_KEY = 'deepu-admin-repo';
export const SECTION_KEY = 'deepu-admin-section';
export const DEFAULT_REPO = { owner: 'anirudhleetcode-max', repo: 'birthday', branch: 'main' };
const AUTOSAVE_MS = 900;

export const state = {
  base: null,
  site: null,
  files: new Map(),
  filesDirty: true,
  sessionBlobs: new Map(), // published during this session → keep showing them while Pages rebuilds
  source: 'none', //          'github' | 'pages'
  conn: { status: 'none', message: '', token: '', info: null }, // none | checking | ok | error
  repo: { ...DEFAULT_REPO },
  section: 'library',
  rev: 0,
  savedRev: 0,
  saving: false,
  savedAt: null,
  saveError: null,
  ui: { filter: 'all' },
};

/* ---------------------------------------------------------------- storage */
export const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* private mode */ } };

/* ---------------------------------------------------------------- the GitHub token
 * The token lives ONLY in this browser's Web Storage, under TOKEN_KEY:
 *   "remember on this device" ON  (default) → localStorage   (survives closing the browser)
 *   "remember on this device" OFF           → sessionStorage (forgotten when the tab closes)
 * It is never written to the draft (IndexedDB), the content, an export or a URL, and it is
 * only ever sent to https://api.github.com in the Authorization header (github.js).
 */
export function loadToken() { return (lsGet(TOKEN_KEY) || ssGet(TOKEN_KEY) || '').trim(); }
/** Where the current token is kept: 'device' | 'tab' | null (none). */
export function tokenPlace() { return lsGet(TOKEN_KEY) ? 'device' : ssGet(TOKEN_KEY) ? 'tab' : null; }
export function storeToken(token, { remember = true } = {}) {
  const t = String(token || '').trim();
  if (remember) { ssSet(TOKEN_KEY, null); lsSet(TOKEN_KEY, t || null); } else { lsSet(TOKEN_KEY, null); ssSet(TOKEN_KEY, t || null); }
}
export function clearToken() { lsSet(TOKEN_KEY, null); ssSet(TOKEN_KEY, null); }

/* ---------------------------------------------------------------- hooks */
const hooks = { render: () => {}, chrome: () => {} };
export function setHooks(h) { Object.assign(hooks, h); }
export const rerender = (opts) => hooks.render(opts || { keepScroll: true });
export const refreshChrome = () => hooks.chrome();

/* ---------------------------------------------------------------- derived */
export const globalStrength = () => {
  const v = Number(state.site?.settings?.grading?.strength);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.85;
};
export const changes = () => (state.base && state.site ? describeChanges(state.base, state.site) : { count: 0, items: [], message: '' });
export const unpublishedCount = () => changes().count;
export const hasUnsavedDraft = () => state.rev !== state.savedRev;
export const photoById = (id) => (state.site?.photos || []).find((p) => p.id === id) || null;
export const basePhoto = (id) => (state.base?.photos || []).find((p) => p.id === id) || null;
export const isDraftPhoto = (p) => { const b = basePhoto(p.id); return !b || !deepEqual(p, b); };

export function client() {
  return new GitHub({ ...state.repo, token: state.conn.token });
}

export function liveUrl() {
  const { owner, repo } = state.repo;
  if (!owner || !repo) return '';
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) return `https://${repo}/`;
  return `https://${owner}.github.io/${repo}/`;
}

/* ---------------------------------------------------------------- files */
export function takenPath(p) {
  return state.files.has(p) || state.sessionBlobs.has(p)
    || usedFiles(state.base || {}).has(p) || usedFiles(state.site || {}).has(p);
}

/** Unique repo paths for a photo's new files. */
export function newPhotoPaths(id, opts = {}) {
  const p = photoPaths(id, opts);
  const out = {};
  for (const k of Object.keys(p)) out[k] = uniquePath(p[k], takenPath);
  return out;
}

const urlCache = new Map(); // Blob → object URL
export function blobUrl(blob) {
  let u = urlCache.get(blob);
  if (!u) { u = URL.createObjectURL(blob); urlCache.set(blob, u); }
  return u;
}
export function localBlob(path) {
  return (path && (state.files.get(path) || state.sessionBlobs.get(path))) || null;
}
/** URL to show a repo file: staged blob → just-published blob → the site copy. */
export function srcFor(path) {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const b = localBlob(path);
  return b ? blobUrl(b) : `../${path}`;
}
export function rawUrl(path) {
  return new GitHub(state.repo).rawUrl(path);
}

/** Stage a new file (its path must then be referenced by the draft). */
export function stageFile(path, blob) {
  state.files.set(path, blob);
  state.filesDirty = true;
}

/** Drop staged files the draft no longer references (and free their URLs). */
export function gcFiles() {
  const refs = usedFiles(state.site || {});
  for (const [p, b] of [...state.files]) {
    if (!refs.has(p)) {
      state.files.delete(p);
      state.filesDirty = true;
      if (![...state.sessionBlobs.values()].includes(b) && ![...state.files.values()].includes(b)) {
        const u = urlCache.get(b);
        if (u) { URL.revokeObjectURL(u); urlCache.delete(b); }
      }
    }
  }
}

/** A file's bytes: staged → just published → GitHub API → the site → raw.githubusercontent. */
export async function getFileBlob(path) {
  const local = localBlob(path);
  if (local) return local;
  if (state.conn.status === 'ok') {
    try { return await client().getBlob(path); } catch (err) { if (err.status && err.status !== 404) throw err; }
  }
  for (const url of [`../${path}`, rawUrl(path)]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.blob();
    } catch { /* next */ }
  }
  throw new Error(`Couldn’t download ${path}`);
}

/* ---------------------------------------------------------------- changes & drafts */
let saveTimer = 0;
let saveChain = Promise.resolve();

/**
 * Apply a change to the draft. `fn(site)` mutates; files are tidied, the draft is
 * auto-saved, the header updated and (optionally) the current section re-rendered.
 */
export function change(fn, { files = false, render = true } = {}) {
  if (fn) fn(state.site);
  state.rev++;
  if (files) state.filesDirty = true;
  gcFiles();
  scheduleSave();
  hooks.chrome();
  if (render) hooks.render({ keepScroll: true });
}

export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flushSave(); }, AUTOSAVE_MS);
}

/** Save the draft now (serialised). Resolves true on success. */
export function flushSave() {
  clearTimeout(saveTimer);
  const job = async () => {
    if (!state.site || !state.base) return true;
    const rev = state.rev;
    state.saving = true;
    hooks.chrome();
    // Taken BEFORE the await: a file staged while this save is running sets filesDirty again,
    // so the next save writes it (resetting the flag afterwards would silently drop it).
    const filesDirty = state.filesDirty;
    state.filesDirty = false;
    try {
      if (!changes().count && !state.files.size) {
        await clearDraft();
        state.filesDirty = true;
      } else {
        await saveDraft(state.site, filesDirty ? state.files : undefined, {
          deleted: deletedPaths(state.base, state.site),
          base: state.base,
        });
      }
      state.savedRev = rev;
      state.savedAt = new Date().toISOString();
      state.saveError = null;
      return true;
    } catch (err) {
      if (filesDirty) state.filesDirty = true; // the files were not written — try again next time
      throw err;
    } finally {
      state.saving = false;
      hooks.chrome();
    }
  };
  const p = saveChain.then(job);
  saveChain = p.catch((err) => {
    console.error('[admin] draft save failed', err);
    state.saveError = err.message || String(err);
    hooks.chrome();
    return false;
  });
  return saveChain;
}

/** Forget every unpublished change (and the stored draft). */
export async function resetDraft() {
  clearTimeout(saveTimer);
  state.site = clone(state.base);
  gcFiles();
  state.files = new Map();
  state.filesDirty = true;
  await saveChain.catch(() => {});
  await clearDraft().catch(() => {});
  state.rev++;
  state.savedRev = state.rev;
  state.savedAt = null;
}

export async function readDraft() {
  try { return await loadDraft(); } catch (err) { console.warn('[admin] could not read draft', err); return null; }
}
export { clearDraft };

/* ---------------------------------------------------------------- loading */
async function fetchLocalJSON(path) {
  const res = await fetch(`../${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** The site's own copy (../data/*.json, or an old ../data/site.json). */
export async function fetchLocalSite() {
  try {
    const [settings, messages, photos] = await Promise.all([fetchLocalJSON(FILES.settings), fetchLocalJSON(FILES.messages), fetchLocalJSON(FILES.photos)]);
    return combine({ settings, messages, photos });
  } catch (err) {
    try { return upgrade(await fetchLocalJSON(LEGACY_FILE)); } catch { throw err; }
  }
}

export function loadRepoCfg() {
  try {
    const v = JSON.parse(lsGet(REPO_KEY) || 'null');
    if (v && v.owner && v.repo) return { owner: v.owner, repo: v.repo, branch: v.branch || 'main' };
  } catch { /* ignore */ }
  return null;
}

/** Check the token and read the published content from GitHub. Throws friendly errors. */
export async function connectAndFetch() {
  state.conn.status = 'checking';
  state.conn.message = '';
  hooks.chrome();
  try {
    const gh = client();
    const info = await gh.check();
    const { site } = await gh.getContent();
    state.conn.status = 'ok';
    state.conn.info = info;
    hooks.chrome();
    return site;
  } catch (err) {
    state.conn.status = 'error';
    state.conn.message = err.message || String(err);
    hooks.chrome();
    throw err;
  }
}

/** Adopt a fresh published site, rebasing the draft onto it. */
export function adoptBase(remote) {
  const prevBase = state.base;
  const fresh = normalize(clone(remote));
  if (prevBase && state.site && !deepEqual(prevBase, fresh)) {
    state.site = mergeSites(prevBase, state.site, fresh);
  } else if (!state.site) {
    state.site = clone(fresh);
  }
  state.base = fresh;
  gcFiles();
}
