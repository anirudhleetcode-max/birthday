/**
 * model.js — pure data helpers for the admin (no DOM): cloning, diffing, 3-way merge,
 * referenced-file bookkeeping, change summaries, ratios and file naming.
 */

export const CHAPTERS = {
  prologue: 'Prologue',
  tower: 'Ch.1 The Tower',
  hair: 'Ch.2 Golden Hair',
  names: 'Ch.3 Her Names',
  dance: 'Ch.4 Kingdom Dance',
  lanterns: 'Ch.5 Lanterns',
  cake: 'Ch.6 Cake',
  letter: 'Ch.7 The Letter',
  finale: 'Finale',
  credits: 'Credits',
  invite: 'Opening invitation',
};

export const TEXT_GROUPS = {
  invite: 'Opening invitation',
  prologue: 'Prologue',
  tower: 'Ch.1 The Tower',
  hair: 'Ch.2 Golden Hair',
  names: 'Ch.3 Her Names',
  dance: 'Ch.4 Kingdom Dance',
  lanterns: 'Ch.5 Lanterns',
  cake: 'Ch.6 Cake',
  letter: 'Ch.7 The Letter',
  finale: 'Finale',
  credits: 'Credits',
};

/** Shapes offered for extra memories. */
export const SHAPES = [
  { ratio: '3:4', label: 'Portrait', sub: '3:4' },
  { ratio: '4:5', label: 'Portrait', sub: '4:5' },
  { ratio: '1:1', label: 'Square', sub: '1:1' },
  { ratio: '4:3', label: 'Landscape', sub: '4:3' },
  { ratio: '16:9', label: 'Landscape', sub: '16:9' },
];

export const RATIO_TOLERANCE = 0.015;

/* ---------------------------------------------------------------------- */
/* generic                                                                 */
/* ---------------------------------------------------------------------- */

export function clone(v) {
  if (v === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(v); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(v));
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
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

/* ---------------------------------------------------------------------- */
/* 3-way merge (base → mine, base → theirs)                                */
/* ---------------------------------------------------------------------- */

const hasIds = (arr) => Array.isArray(arr) && arr.every((x) => isPlainObject(x) && typeof x.id === 'string');

/**
 * Merge `mine` (local draft) and `theirs` (what is on GitHub now), both derived from `base`.
 * Untouched parts follow `theirs`; parts changed locally win. Arrays of {id} objects
 * (slots, extras) are merged item by item.
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
  if (hasIds(mine) && hasIds(theirs) && (base === undefined || hasIds(base))) {
    return mergeById(base || [], mine, theirs);
  }
  return clone(mine);
}

function mergeById(base, mine, theirs) {
  const bm = new Map(base.map((x) => [x.id, x]));
  const mm = new Map(mine.map((x) => [x.id, x]));
  const tm = new Map(theirs.map((x) => [x.id, x]));
  const ids = (a) => a.map((x) => x.id);
  const mineReordered = !deepEqual(ids(mine).filter((id) => bm.has(id)), ids(base).filter((id) => mm.has(id)));
  const order = mineReordered ? ids(mine) : ids(theirs);
  const extra = mineReordered ? ids(theirs) : ids(mine);
  for (const id of extra) if (!order.includes(id)) order.push(id);
  const out = [];
  for (const id of order) {
    const b = bm.get(id), m = mm.get(id), t = tm.get(id);
    if (m && t) out.push(merge3(b, m, t));
    else if (m) { if (!b || !deepEqual(m, b)) out.push(clone(m)); } // theirs deleted it; keep only if I changed it
    else if (t) { if (!b) out.push(clone(t)); }                      // I deleted it → stays deleted
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* files referenced by a site                                              */
/* ---------------------------------------------------------------------- */

export function referencedPaths(site) {
  const out = new Set();
  if (!site) return out;
  const add = (p) => { if (typeof p === 'string' && p) out.add(p); };
  for (const s of site.slots || []) { add(s.src); add(s.original); }
  for (const x of site.extras || []) { add(x.src); add(x.original); }
  const m = site.media || {};
  add(m.music); add(m.video); add(m.voice);
  return out;
}

/** Only files the admin manages may ever be deleted. */
export function isManagedPath(p) {
  return typeof p === 'string' && (p.startsWith('photos/') || p.startsWith('media/')) && !p.endsWith('.gitkeep');
}

/** Paths the base references that the draft no longer does (deleted on publish). */
export function deletedPaths(base, site) {
  const keep = referencedPaths(site);
  return [...referencedPaths(base)].filter((p) => !keep.has(p) && isManagedPath(p));
}

/* ---------------------------------------------------------------------- */
/* change summary                                                          */
/* ---------------------------------------------------------------------- */

function countLeafChanges(a, b) {
  if (deepEqual(a, b)) return 0;
  if (isPlainObject(a) && isPlainObject(b)) {
    let n = 0;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) n += countLeafChanges(a[k], b[k]);
    return n;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    let n = 0;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) n += countLeafChanges(a[i], b[i]);
    return n;
  }
  return 1;
}

/**
 * Human summary of what changed between the published site and the draft.
 * @returns {{count:number, items:{kind:string, id?:string, text:string}[], message:string}}
 */
export function describeChanges(base, site) {
  const items = [];
  if (!base || !site) return { count: 0, items, message: '' };

  const baseSlots = new Map((base.slots || []).map((s) => [s.id, s]));
  const filled = [], replaced = [], cleared = [], captioned = [];
  for (const s of site.slots || []) {
    const b = baseSlots.get(s.id);
    if (!b) continue;
    if (s.src !== b.src) {
      if (!s.src) cleared.push(s.id);
      else if (!b.src) filled.push(s.id);
      else replaced.push(s.id);
    }
    if ((s.caption || '') !== (b.caption || '')) captioned.push(s.id);
  }
  const label = (id) => {
    const s = (site.slots || []).find((x) => x.id === id);
    return s && s.label ? s.label : id;
  };
  for (const id of filled) items.push({ kind: 'fill', id, text: `New photo · ${label(id)}` });
  for (const id of replaced) items.push({ kind: 'replace', id, text: `Replaced photo · ${label(id)}` });
  for (const id of cleared) items.push({ kind: 'clear', id, text: `Removed photo · ${label(id)}` });
  for (const id of captioned) items.push({ kind: 'caption', id, text: `Caption · ${label(id)}` });

  const bx = new Map((base.extras || []).map((x) => [x.id, x]));
  const sx = new Map((site.extras || []).map((x) => [x.id, x]));
  let added = 0, removed = 0, changedX = 0;
  for (const x of site.extras || []) {
    const b = bx.get(x.id);
    if (!b) { added++; items.push({ kind: 'extra-add', id: x.id, text: 'Add an extra memory' }); }
    else if (!deepEqual(x, b)) {
      changedX++;
      items.push({ kind: 'extra-edit', id: x.id, text: x.src !== b.src ? 'Replace an extra memory' : 'Edit an extra memory caption' });
    }
  }
  for (const x of base.extras || []) if (!sx.has(x.id)) { removed++; items.push({ kind: 'extra-remove', id: x.id, text: 'Remove an extra memory' }); }
  const commonOrder = (a, set) => a.filter((x) => set.has(x.id)).map((x) => x.id).join('|');
  const reordered = commonOrder(site.extras || [], bx) !== commonOrder(base.extras || [], sx);
  if (reordered) items.push({ kind: 'extra-order', text: 'Reorder extra memories' });

  const words = countLeafChanges(base.text, site.text)
    + countLeafChanges(base.her, site.her)
    + countLeafChanges(base.from, site.from);
  if (words) items.push({ kind: 'words', count: words, text: `Edit words (${words} ${words === 1 ? 'change' : 'changes'})` });

  const bm = base.media || {}, sm = site.media || {};
  const mediaLabel = { music: 'music', video: 'video message', voice: 'voice note' };
  for (const k of ['music', 'video', 'voice']) {
    if ((bm[k] || null) !== (sm[k] || null)) items.push({ kind: 'media', id: k, text: sm[k] ? `New ${mediaLabel[k]}` : `Remove ${mediaLabel[k]}` });
  }
  if ((bm.musicTitle || '') !== (sm.musicTitle || '')) items.push({ kind: 'media-text', id: 'musicTitle', text: 'Music title' });
  if ((bm.videoCaption || '') !== (sm.videoCaption || '')) items.push({ kind: 'media-text', id: 'videoCaption', text: 'Video caption' });
  const otherMedia = countLeafChanges(
    Object.fromEntries(Object.entries(bm).filter(([k]) => !['music', 'video', 'voice', 'musicTitle', 'videoCaption'].includes(k))),
    Object.fromEntries(Object.entries(sm).filter(([k]) => !['music', 'video', 'voice', 'musicTitle', 'videoCaption'].includes(k))),
  );
  if (otherMedia) items.push({ kind: 'media-text', text: 'Media settings' });

  const bs = base.settings || {}, ss = site.settings || {};
  const settingNames = { lock: 'birthday lock', grading: 'colour grading', whatsapp: 'WhatsApp number', github: 'GitHub settings' };
  const sKeys = new Set([...Object.keys(bs), ...Object.keys(ss)]);
  for (const k of sKeys) if (!deepEqual(bs[k], ss[k])) items.push({ kind: 'settings', id: k, text: `Change ${settingNames[k] || k}` });

  // anything else at the top level (unknown keys)
  const known = new Set(['slots', 'extras', 'text', 'her', 'from', 'media', 'settings']);
  for (const k of new Set([...Object.keys(base), ...Object.keys(site)])) {
    if (!known.has(k) && !deepEqual(base[k], site[k])) items.push({ kind: 'other', id: k, text: `Change ${k}` });
  }

  const count = items.reduce((n, it) => n + (it.kind === 'words' ? it.count : 1), 0);
  return { count, items, message: commitMessage({ filled, replaced, cleared, captioned, added, removed, changedX, reordered, words, items }) };
}

function listIds(verb, ids) {
  if (!ids.length) return null;
  if (ids.length <= 3) return `${verb} ${ids.join(', ')}`;
  return `${verb} ${ids.length} photos`;
}

function commitMessage(c) {
  const parts = [];
  const p1 = listIds('fill', c.filled); if (p1) parts.push(p1);
  const p2 = listIds('replace', c.replaced); if (p2) parts.push(p2);
  const p3 = listIds('clear', c.cleared); if (p3) parts.push(p3);
  if (c.added) parts.push(`add ${c.added} extra ${c.added === 1 ? 'memory' : 'memories'}`);
  if (c.removed) parts.push(`remove ${c.removed} extra ${c.removed === 1 ? 'memory' : 'memories'}`);
  if (c.changedX || c.reordered) parts.push('edit extra memories');
  if (c.captioned.length) parts.push(`${c.captioned.length} ${c.captioned.length === 1 ? 'caption' : 'captions'}`);
  if (c.words) parts.push('edit words');
  for (const it of c.items) {
    if (it.kind === 'media') parts.push(it.text.toLowerCase());
    if (it.kind === 'settings') parts.push(it.text.replace(/^Change /, '').toLowerCase());
  }
  if (c.items.some((it) => it.kind === 'media-text')) parts.push('media text');
  let msg = 'Admin: ' + (parts.length ? parts.join(', ') : 'update site');
  if (msg.length > 72) {
    const photos = c.filled.length + c.replaced.length + c.cleared.length;
    const short = [];
    if (photos) short.push(`${photos} ${photos === 1 ? 'photo' : 'photos'}`);
    if (c.added || c.removed || c.changedX || c.reordered) short.push('extra memories');
    if (c.words || c.captioned.length) short.push('words');
    if (c.items.some((it) => it.kind.startsWith('media'))) short.push('media');
    if (c.items.some((it) => it.kind === 'settings')) short.push('settings');
    msg = 'Admin: update ' + short.join(', ');
  }
  return msg;
}

/* ---------------------------------------------------------------------- */
/* ratios & naming                                                         */
/* ---------------------------------------------------------------------- */

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/** "3:4" → {w:3, h:4, value:0.75, label:"3:4"} (reduced). */
export function parseRatio(str) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(str || ''));
  let w = 1, h = 1;
  if (m) { w = parseFloat(m[1]); h = parseFloat(m[2]); }
  // make integers
  let scale = 1;
  while ((Math.round(w * scale) !== w * scale || Math.round(h * scale) !== h * scale) && scale < 1000) scale *= 10;
  w = Math.round(w * scale); h = Math.round(h * scale);
  const g = gcd(w, h) || 1;
  w /= g; h /= g;
  return { w, h, value: w / h, label: `${w}:${h}` };
}

export function ratioWords(str) {
  const r = parseRatio(str);
  if (r.w === r.h) return 'square';
  return r.w < r.h ? 'portrait' : 'landscape';
}

/** Is a w×h image within the tolerance of the ratio? */
export function matchesRatio(w, h, ratioStr, tol = RATIO_TOLERANCE) {
  const r = parseRatio(ratioStr).value;
  return Math.abs((w / h) / r - 1) <= tol;
}

/** The SHAPES entry closest to w×h. */
export function closestShape(w, h) {
  const v = Math.log(w / h);
  let best = SHAPES[0], bd = Infinity;
  for (const s of SHAPES) {
    const d = Math.abs(Math.log(parseRatio(s.ratio).value) - v);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** yyyymmdd-hhmmss in local time. */
export function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/** Make `path` unique against `taken(path) → bool` by appending -2, -3, … before the extension. */
export function uniquePath(path, taken) {
  if (!taken(path)) return path;
  const dot = path.lastIndexOf('.');
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const p = `${stem}-${i}${ext}`;
    if (!taken(p)) return p;
  }
  return `${stem}-${Date.now()}${ext}`;
}

export function randomId(prefix = 'x-') {
  const bytes = new Uint8Array(6);
  (globalThis.crypto || {}).getRandomValues?.(bytes);
  let s = '';
  for (const b of bytes) s += (b % 36).toString(36);
  if (!/[a-z0-9]{6}/.test(s)) s = Math.random().toString(36).slice(2, 8);
  return prefix + s;
}

export function photoPaths(kind, id, when = new Date()) {
  const st = stamp(when);
  const dir = kind === 'extra' ? 'photos/extras' : 'photos';
  return { src: `${dir}/${id}-${st}.jpg`, original: `photos/originals/${id}-${st}.jpg` };
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
