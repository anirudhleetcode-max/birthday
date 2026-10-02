/**
 * util.js — pure helpers for the admin (no DOM; unit-tested in tests/admin):
 * deep compare, 3-way merge of the combined v2 site, change summaries + commit
 * messages, integer ratios, unique file names, IST date helpers, formatting.
 */
import { usedFiles, PHOTO_CHAPTERS, FILM_CHAPTERS, ROLES, normalize, clone as jsonClone } from '../assets/js/shared/model.js';

/* ---------------------------------------------------------------- generic */
export function clone(v) {
  if (v === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(v); } catch { /* fall through */ }
  }
  return jsonClone(v);
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export function getAt(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function setAt(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = typeof path[i + 1] === 'number' ? [] : {};
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

export function deleteAt(obj, path) {
  const parent = getAt(obj, path.slice(0, -1));
  if (parent && typeof parent === 'object') {
    if (Array.isArray(parent)) parent.splice(path[path.length - 1], 1);
    else delete parent[path[path.length - 1]];
  }
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------- 3-way merge (v2) */
const hasIds = (arr) => Array.isArray(arr) && arr.every((x) => isPlainObject(x) && typeof x.id === 'string');

/**
 * Merge `mine` (the local draft) and `theirs` (what is on GitHub now), both derived
 * from `base`. Untouched parts follow `theirs`; parts changed locally win. Arrays of
 * {id} objects (photos, chapters) are merged item by item.
 */
export function merge3(base, mine, theirs) {
  if (deepEqual(mine, base)) return clone(theirs);
  if (deepEqual(theirs, base) || deepEqual(theirs, mine)) return clone(mine);
  if (isPlainObject(mine) && isPlainObject(theirs)) {
    const b = isPlainObject(base) ? base : {};
    const out = {};
    const keys = [...Object.keys(theirs)];
    for (const k of Object.keys(mine)) if (!keys.includes(k)) keys.push(k);
    for (const k of keys) {
      const inM = Object.prototype.hasOwnProperty.call(mine, k);
      const inT = Object.prototype.hasOwnProperty.call(theirs, k);
      const inB = Object.prototype.hasOwnProperty.call(b, k);
      if (inM && inT) out[k] = merge3(b[k], mine[k], theirs[k]);
      else if (inM) { if (!(inB && deepEqual(mine[k], b[k]))) out[k] = clone(mine[k]); }
      else if (inT) { if (!(inB && deepEqual(theirs[k], b[k]))) out[k] = clone(theirs[k]); }
    }
    return out;
  }
  if (hasIds(mine) && hasIds(theirs) && (base === undefined || base === null || hasIds(base))) {
    return mergeById(base || [], mine, theirs);
  }
  return clone(mine);
}

function mergeById(base, mine, theirs) {
  const bm = new Map(base.map((x) => [x.id, x]));
  const mm = new Map(mine.map((x) => [x.id, x]));
  const tm = new Map(theirs.map((x) => [x.id, x]));
  const order = theirs.map((x) => x.id);
  for (const x of mine) if (!order.includes(x.id)) order.push(x.id);
  const out = [];
  for (const id of order) {
    const b = bm.get(id);
    const m = mm.get(id);
    const t = tm.get(id);
    if (m && t) out.push(merge3(b, m, t));
    else if (m) { if (!b || !deepEqual(m, b)) out.push(clone(m)); } // they deleted it: keep only if I changed it
    else if (t) { if (!b) out.push(clone(t)); } //                     I deleted it: stays deleted
  }
  return out;
}

/** merge3 for whole combined sites, re-normalised (orders repaired). */
export function mergeSites(base, mine, theirs) {
  return normalize(merge3(base, mine, theirs));
}

/* ------------------------------------------------------- files & deletes */
/** Only files the admin manages may ever be deleted. */
export function isManagedPath(p) {
  return typeof p === 'string' && (p.startsWith('photos/') || p.startsWith('media/')) && !/(^|\/)\.gitkeep$/.test(p);
}

/** Paths `base` references that `site` no longer does (deleted on publish). */
export function deletedPaths(base, site) {
  const keep = usedFiles(site);
  return [...usedFiles(base || {})].filter((p) => !keep.has(p) && isManagedPath(p));
}

/* ------------------------------------------------------- change summary */
function countLeafChanges(a, b) {
  if (deepEqual(a, b)) return 0;
  if (isPlainObject(a) && isPlainObject(b)) {
    let n = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) n += countLeafChanges(a[k], b[k]);
    return n;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    let n = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) n += countLeafChanges(a[i], b[i]);
    return n;
  }
  return 1;
}

const chapterShort = (id) => (PHOTO_CHAPTERS.find((c) => c.id === id) || { short: id }).short;
const photoName = (p) => (p && (p.label || p.caption)) || (p && p.id) || 'photo';
const DETAIL_KEYS = ['caption', 'date', 'alt', 'label', 'hint', 'role', 'featured', 'heroHair', 'enabled', 'focal', 'animation', 'effect', 'duration'];
const IMAGE_KEYS = ['crop', 'cropMode', 'grade'];

/**
 * Human summary of what changed between the published site and the draft.
 * @returns {{count:number, items:{kind:string, id?:string, text:string}[], message:string}}
 */
export function describeChanges(base, site) {
  const items = [];
  if (!base || !site) return { count: 0, items, message: '' };
  const tally = { added: 0, removed: 0, replaced: 0, filled: 0, edited: 0, moved: 0, reordered: 0, regraded: 0 };

  const bp = new Map((base.photos || []).map((p) => [p.id, p]));
  const sp = new Map((site.photos || []).map((p) => [p.id, p]));
  for (const p of site.photos || []) {
    const b = bp.get(p.id);
    if (!b) {
      tally.added++;
      items.push({ kind: 'photo-add', id: p.id, text: `New photo in ${chapterShort(p.chapter)} · ${photoName(p)}` });
      continue;
    }
    if (p.src !== b.src) {
      if (!p.src) items.push({ kind: 'photo-clear', id: p.id, text: `Image removed · ${photoName(p)}` });
      else if (!b.src) { tally.filled++; items.push({ kind: 'photo-fill', id: p.id, text: `Photo added · ${photoName(p)}` }); }
      else if (p.original !== b.original) { tally.replaced++; items.push({ kind: 'photo-replace', id: p.id, text: `Photo replaced · ${photoName(p)}` }); }
      else { tally.regraded++; items.push({ kind: 'photo-regrade', id: p.id, text: `Re-cropped / re-graded · ${photoName(p)}` }); }
    } else if (IMAGE_KEYS.some((k) => !deepEqual(p[k], b[k]))) {
      tally.regraded++;
      items.push({ kind: 'photo-regrade', id: p.id, text: `Re-cropped / re-graded · ${photoName(p)}` });
    }
    if (p.chapter !== b.chapter) {
      tally.moved++;
      items.push({ kind: 'photo-move', id: p.id, text: `Moved to ${chapterShort(p.chapter)} · ${photoName(p)}` });
    }
    // a new image brings its own focal point — that's part of the image change, not a separate edit
    const changedDetails = DETAIL_KEYS.filter((k) => !deepEqual(p[k], b[k]) && !(k === 'focal' && p.src !== b.src));
    if (changedDetails.length) {
      tally.edited++;
      items.push({ kind: 'photo-edit', id: p.id, text: `Details (${changedDetails.map(detailName).join(', ')}) · ${photoName(p)}` });
    }
  }
  for (const b of base.photos || []) {
    if (!sp.has(b.id)) {
      tally.removed++;
      items.push({ kind: 'photo-remove', id: b.id, text: `Deleted · ${photoName(b)}` });
    }
  }
  for (const ch of PHOTO_CHAPTERS) {
    const order = (s) => (s.photos || []).filter((p) => p.chapter === ch.id).sort((a, c) => a.order - c.order).map((p) => p.id);
    const common = new Set(order(base).filter((id) => sp.has(id) && sp.get(id).chapter === ch.id));
    const a = order(base).filter((id) => common.has(id)).join('|');
    const c = order(site).filter((id) => common.has(id)).join('|');
    if (a !== c) {
      tally.reordered++;
      items.push({ kind: 'photo-order', id: ch.id, text: `New order · ${ch.short}` });
    }
  }

  const words = countLeafChanges(base.text, site.text) + countLeafChanges(base.her, site.her) + countLeafChanges(base.from, site.from);
  if (words) items.push({ kind: 'words', count: words, text: `Words & names (${plural(words, 'edit')})` });

  const bm = base.media || {};
  const sm = site.media || {};
  const mediaLabel = { music: 'background music', video: 'video message', voice: 'voice note' };
  for (const k of ['music', 'video', 'voice']) {
    if ((bm[k] || null) !== (sm[k] || null)) items.push({ kind: 'media', id: k, text: sm[k] ? (bm[k] ? `Replaced ${mediaLabel[k]}` : `Added ${mediaLabel[k]}`) : `Removed ${mediaLabel[k]}` });
  }
  if ((bm.musicTitle || '') !== (sm.musicTitle || '')) items.push({ kind: 'media-text', id: 'musicTitle', text: 'Music title' });
  if ((bm.videoCaption || '') !== (sm.videoCaption || '')) items.push({ kind: 'media-text', id: 'videoCaption', text: 'Video caption' });

  const bc = new Map((base.chapters || []).map((c) => [c.id, c.enabled !== false]));
  for (const c of site.chapters || []) {
    if (bc.has(c.id) && bc.get(c.id) !== (c.enabled !== false)) {
      const label = (FILM_CHAPTERS.find((f) => f.id === c.id) || { label: c.id }).label;
      items.push({ kind: 'chapter', id: c.id, text: `${c.enabled !== false ? 'Turned on' : 'Turned off'} · ${label}` });
    }
  }

  const bs = base.settings || {};
  const ss = site.settings || {};
  const settingNames = { lock: 'countdown lock', grading: 'colour grading', whatsapp: 'WhatsApp number', github: 'GitHub settings', theme: 'theme' };
  for (const k of new Set([...Object.keys(bs), ...Object.keys(ss)])) {
    if (!deepEqual(bs[k], ss[k])) items.push({ kind: 'settings', id: k, text: `Changed ${settingNames[k] || k}` });
  }
  if (!deepEqual(base.photoChapters, site.photoChapters)) items.push({ kind: 'settings', id: 'photoChapters', text: 'Chapter photo settings' });

  const count = items.reduce((n, it) => n + (it.kind === 'words' ? it.count : 1), 0);
  return { count, items, message: commitMessage(tally, items, words) };
}

function detailName(k) {
  return { heroHair: 'hair moment', alt: 'alt text', focal: 'focal point', enabled: 'on/off' }[k] || k;
}

function commitMessage(t, items, words) {
  const parts = [];
  const n = (count, one, many) => (count ? parts.push(plural(count, one, many)) : 0);
  if (t.added) parts.push(`add ${plural(t.added, 'photo')}`);
  if (t.filled) parts.push(`fill ${plural(t.filled, 'spot')}`);
  if (t.replaced) parts.push(`replace ${plural(t.replaced, 'photo')}`);
  if (t.removed) parts.push(`delete ${plural(t.removed, 'photo')}`);
  if (t.regraded) parts.push(`re-crop ${plural(t.regraded, 'photo')}`);
  if (t.moved) parts.push(`move ${plural(t.moved, 'photo')}`);
  if (t.reordered) parts.push('reorder');
  n(t.edited, 'photo detail', 'photo details');
  if (words) parts.push('edit words');
  if (items.some((it) => it.kind === 'media' || it.kind === 'media-text')) parts.push('media');
  if (items.some((it) => it.kind === 'chapter')) parts.push('chapters');
  if (items.some((it) => it.kind === 'settings')) parts.push('settings');
  let msg = `Lantern Room: ${parts.length ? parts.join(', ') : 'update content'}`;
  if (msg.length > 72) msg = `${msg.slice(0, 69).replace(/[,\s]+\S*$/, '')}…`;
  return msg;
}

/* ------------------------------------------------------- integer ratios */
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/** "3:4" → {w:3, h:4, value:0.75, label:"3:4"} with integer, reduced terms ("9:19.5" → 6:13). */
export function intRatio(str) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(str || ''));
  let w = 1;
  let h = 1;
  if (m) { w = parseFloat(m[1]); h = parseFloat(m[2]); }
  if (!(w > 0 && h > 0)) { w = 1; h = 1; }
  let scale = 1;
  while ((Math.round(w * scale) !== w * scale || Math.round(h * scale) !== h * scale) && scale < 1000) scale *= 10;
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const g = gcd(w, h) || 1;
  w /= g;
  h /= g;
  return { w, h, value: w / h, label: `${w}:${h}` };
}

export function ratioWords(str) {
  const r = intRatio(str);
  if (r.w === r.h) return 'square';
  return r.w < r.h ? 'portrait' : 'landscape';
}

/** Integer pixel size with EXACTLY the ratio and the long side ≤ longPx (never below one ratio unit). */
export function outputSize(ratioStr, longPx) {
  const r = intRatio(ratioStr);
  let k = Math.floor(longPx / Math.max(r.w, r.h));
  if (k < 1) {
    // huge ratio terms (rare): approximate, still within 0.5 px of the ratio
    const long = Math.max(1, Math.round(longPx));
    return r.w >= r.h ? { w: long, h: Math.max(1, Math.round(long / r.value)) } : { w: Math.max(1, Math.round(long * r.value)), h: long };
  }
  return { w: r.w * k, h: r.h * k };
}

/* ------------------------------------------------------- naming */
const pad2 = (n) => String(n).padStart(2, '0');

/** yyyymmdd-hhmmss in local time. */
export function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/** Make `path` unique against `taken(path) → bool` by appending -2, -3, … before the extension. */
export function uniquePath(path, taken) {
  if (!taken(path)) return path;
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  const stem = dot > slash ? path.slice(0, dot) : path;
  const ext = dot > slash ? path.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const p = `${stem}-${i}${ext}`;
    if (!taken(p)) return p;
  }
  return `${stem}-${Date.now()}${ext}`;
}

export function safeId(id) {
  return String(id || 'photo').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
}

/**
 * Repo paths for a photo's files. Each kind can be omitted.
 * @returns {{src?:string, thumb?:string, original?:string}}
 */
export function photoPaths(id, { displayExt = 'jpg', originalExt = 'jpg', when = new Date(), kinds = ['src', 'thumb', 'original'] } = {}) {
  const base = `${safeId(id)}-${stamp(when)}`;
  const out = {};
  if (kinds.includes('src')) out.src = `photos/${base}.${displayExt}`;
  if (kinds.includes('thumb')) out.thumb = `photos/thumbs/${base}.jpg`;
  if (kinds.includes('original')) out.original = `photos/originals/${base}.${originalExt}`;
  return out;
}

export const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
};
const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', json: 'application/json' };
export const mimeFor = (path) => EXT_MIME[String(path).split('.').pop().toLowerCase()] || 'application/octet-stream';

/* ------------------------------------------------------- formatting */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 36) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const d = Math.round(hrs / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/* ------------------------------------------------------- IST (UTC+05:30) */
const IST_MS = 5.5 * 3600 * 1000;

/** ISO (any offset) → "yyyy-mm-ddThh:mm" as seen in India. */
export function isoToIstInput(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t + IST_MS).toISOString().slice(0, 16);
}

/** "yyyy-mm-ddThh:mm" (India time) → "yyyy-mm-ddThh:mm:00+05:30", or null. */
export function istInputToIso(v) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v || '')) ? `${v}:00+05:30` : null;
}

export function prettyIst(iso) {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return '—';
  try {
    return `${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }).format(t)} IST`;
  } catch {
    return String(iso);
  }
}

/* ------------------------------------------------------- roles */
export const ROLE_INFO = {
  hero: { label: 'Hero', text: 'The very first photo she sees (prologue).' },
  reveal: { label: 'Grand reveal', text: 'Her single best photo — the finale reveal.' },
  together: { label: 'You two', text: 'A photo of both of you, for the finale.' },
};
export { ROLES };
