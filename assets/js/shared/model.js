// The content model (v2), shared by the film and the admin portal.
//
// On disk the content lives in three files so words, photos and settings stay
// separate from the animation code:
//   data/settings.json  — who / when / switches / media / chapter visibility
//   data/messages.json  — every on-screen word, grouped by chapter
//   data/photos.json    — the photo library (unlimited) + per-chapter defaults
//
// In memory both the film and the admin work with ONE combined object:
//   { version, her, from, settings, media, chapters, text, photoChapters, photos }
// `combine()` / `split()` convert between the two.

export const MODEL_VERSION = 2;

/** Where photos can live in the film. Counts are flexible — chapters adapt. */
export const PHOTO_CHAPTERS = [
  { id: 'prologue', label: 'Prologue — the very first photo', short: 'Prologue', ratio: '4:5', min: 1, max: 1, recommended: 1, hint: 'Her prettiest solo portrait. This is the first photo she sees.' },
  { id: 'tower', label: 'Ch.1 · The tower walls (painted memories)', short: 'Tower', ratio: '3:4', min: 1, max: 16, recommended: 6, hint: 'Candid, warm, everyday moments.' },
  { id: 'hair', label: 'Ch.2 · The golden thread (hanging polaroids)', short: 'Golden thread', ratio: '3:4', min: 1, max: 24, recommended: 8, hint: 'Memories in order — the thread connects them.' },
  { id: 'names', label: 'Ch.3 · Her names (Deepu, Pinky, Kuchi Puchi)', short: 'Names', ratio: '4:5', min: 3, max: 3, recommended: 3, hint: 'One photo per name, in that order.' },
  { id: 'dance', label: 'Ch.4 · The festival (3D dance)', short: 'Festival', ratio: '3:4', min: 3, max: 16, recommended: 8, hint: 'Happy, festive, fun.' },
  { id: 'lanterns', label: 'Ch.5 · Photo lanterns in the night sky', short: 'Lanterns', ratio: '1:1', min: 1, max: 16, recommended: 6, hint: 'Soft, glowy, emotional moments.' },
  { id: 'letter', label: 'Ch.6 · Pinned to the letter', short: 'Letter', ratio: '1:1', min: 0, max: 3, recommended: 2, hint: 'Photos of you two, ideally.' },
  { id: 'finale', label: 'Finale · the grand reveal & you two together', short: 'Finale', ratio: '4:5', min: 2, max: 2, recommended: 2, hint: 'Her single best photo, and one of BOTH of you.' },
  { id: 'album', label: 'Extra memories (album, finale heart, credits)', short: 'Extra memories', ratio: null, min: 0, max: null, recommended: 0, hint: 'Add as many as you like, any time.' },
];

/** The film's chapters, in story order. `toggle:false` chapters are always on. */
export const FILM_CHAPTERS = [
  { id: 'gate', label: 'Countdown', toggle: false },
  { id: 'invite', label: 'Invitation', toggle: false },
  { id: 'prologue', label: 'Prologue' },
  { id: 'tower', label: 'Chapter · The tower' },
  { id: 'hair', label: 'Chapter · The golden thread' },
  { id: 'names', label: 'Chapter · Her names' },
  { id: 'dance', label: 'Chapter · The festival' },
  { id: 'lanterns', label: 'Chapter · The night of lanterns' },
  { id: 'letter', label: 'The letter' },
  { id: 'cake', label: 'Twenty candles' },
  { id: 'video', label: 'Video message (only if uploaded)' },
  { id: 'constellation', label: 'Finale · the constellation' },
  { id: 'birthday', label: 'Finale · 7,305 days & the last lantern' },
  { id: 'hug', label: 'The hug' },
  { id: 'credits', label: 'Credits', toggle: false },
];

export const RATIO_PRESETS = ['3:4', '4:5', '1:1', '4:3', '3:2', '2:3', '16:9', '9:16'];
export const ROLES = ['hero', 'reveal', 'together'];
export const CROP_MODES = ['cover', 'contain'];

/* ------------------------------------------------------------------ ratios */
export function parseRatio(str) {
  if (typeof str === 'number') return str > 0 ? str : 1;
  const [w, h] = String(str || '1:1').split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/** Human ratio for arbitrary pixel sizes: nearest common preset if close, else reduced w:h. */
export function describeRatio(w, h) {
  const r = w / h;
  let best = null;
  for (const p of [...RATIO_PRESETS, '5:4', '21:9', '9:19.5', '19.5:9']) {
    const d = Math.abs(parseRatio(p) - r) / r;
    if (!best || d < best.d) best = { p, d };
  }
  if (best && best.d < 0.02) return best.p;
  const W = Math.round(w);
  const H = Math.round(h);
  const g = gcd(W, H) || 1;
  const a = W / g;
  const b = H / g;
  return a < 50 && b < 50 ? `${a}:${b}` : `${r.toFixed(2)}:1`;
}

/** True when two ratios are the same shape (within `tol`, relative). */
export function ratioMatches(a, b, tol = 0.015) {
  const ra = parseRatio(a);
  const rb = parseRatio(b);
  return Math.abs(ra - rb) / rb <= tol;
}

/* ------------------------------------------------------------------ photos */
let seq = 0;
export function newId(prefix = 'p') {
  seq = (seq + 1) % 1000;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function chapterInfo(id) {
  return PHOTO_CHAPTERS.find((c) => c.id === id) || PHOTO_CHAPTERS[PHOTO_CHAPTERS.length - 1];
}

/** A complete photo record with defaults filled in. */
export function newPhoto(partial = {}) {
  const ch = chapterInfo(partial.chapter || 'album');
  return {
    id: partial.id || newId(ch.id === 'album' ? 'x' : ch.id),
    chapter: ch.id,
    order: Number.isFinite(partial.order) ? partial.order : 999,
    role: partial.role || null,
    label: partial.label || '',
    hint: partial.hint || '',
    ratio: partial.ratio || ch.ratio || '3:4',
    src: partial.src || null,
    thumb: partial.thumb || null,
    original: partial.original || null,
    crop: partial.crop || null, // {x,y,w,h} normalised (0..1) within `original`
    cropMode: CROP_MODES.includes(partial.cropMode) ? partial.cropMode : 'cover',
    focal: partial.focal && Number.isFinite(partial.focal.x) ? { x: clamp01(partial.focal.x), y: clamp01(partial.focal.y) } : { x: 0.5, y: 0.4 },
    caption: partial.caption || '',
    date: partial.date || '',
    alt: partial.alt || '',
    enabled: partial.enabled !== false,
    featured: !!partial.featured,
    heroHair: !!partial.heroHair,
    grade: {
      strength: partial.grade && Number.isFinite(partial.grade.strength) ? partial.grade.strength : null,
      warmth: (partial.grade && partial.grade.warmth) || 0,
      exposure: (partial.grade && partial.grade.exposure) || 0,
    },
    animation: partial.animation || null,
    effect: partial.effect || null,
    duration: Number.isFinite(partial.duration) ? partial.duration : null,
    addedAt: partial.addedAt || null,
    updatedAt: partial.updatedAt || null,
  };
}

function clamp01(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

/** Enabled photos of a chapter in display order. */
export function photosFor(site, chapter, { includeDisabled = false } = {}) {
  return (site.photos || [])
    .filter((p) => p.chapter === chapter && (includeDisabled || p.enabled !== false))
    .sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
}

export function nextOrder(site, chapter) {
  const list = photosFor(site, chapter, { includeDisabled: true });
  return list.length ? Math.max(...list.map((p) => p.order || 0)) + 1 : 1;
}

/** Re-number a chapter's photos 1..n following `ids` (others keep relative order after). */
export function reorder(site, chapter, ids) {
  const list = photosFor(site, chapter, { includeDisabled: true });
  const rank = new Map(ids.map((id, i) => [id, i]));
  list.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e6 + a.order) - (rank.has(b.id) ? rank.get(b.id) : 1e6 + b.order));
  list.forEach((p, i) => (p.order = i + 1));
  return site;
}

/** Every repo path the content refers to (photos + media). */
export function usedFiles(site) {
  const s = new Set();
  for (const p of site.photos || []) for (const k of ['src', 'thumb', 'original']) if (p[k]) s.add(p[k]);
  for (const k of ['music', 'video', 'voice']) if (site.media && site.media[k]) s.add(site.media[k]);
  return s;
}

/* ------------------------------------------------------------------ files */
export function combine({ settings = {}, messages = {}, photos = {} } = {}) {
  const { version: _v1, ...text } = messages || {};
  return normalize({
    version: MODEL_VERSION,
    her: settings.her,
    from: settings.from,
    settings: settings.settings,
    media: settings.media,
    chapters: settings.chapters,
    text,
    photoChapters: photos.chapters,
    photos: photos.photos,
  });
}

export function split(site) {
  const s = normalize(clone(site));
  return {
    settings: { version: MODEL_VERSION, her: s.her, from: s.from, settings: s.settings, media: s.media, chapters: s.chapters },
    messages: { version: MODEL_VERSION, ...s.text },
    photos: { version: MODEL_VERSION, chapters: s.photoChapters, photos: s.photos },
  };
}

export const FILES = { settings: 'data/settings.json', messages: 'data/messages.json', photos: 'data/photos.json' };
export const LEGACY_FILE = 'data/site.json';

export function clone(o) { return JSON.parse(JSON.stringify(o)); }

const DEFAULT_SETTINGS = {
  lock: { enabled: true, unlockAt: '2027-01-03T00:00:00+05:30' },
  grading: { strength: 0.85 },
  whatsapp: '',
  github: { owner: 'anirudhleetcode-max', repo: 'birthday', branch: 'main' },
  theme: { grain: 0.6, particles: 1, ribbon: true },
};

/** Fill defaults, repair ids/orders. Never removes owner data. */
export function normalize(site) {
  const s = site || {};
  s.version = MODEL_VERSION;
  s.her = { name: 'Deepu', nicknames: ['Deepu', 'Pinky', 'Kuchi Puchi'], birthDate: '2007-01-03', ...(s.her || {}) };
  s.from = { name: 'Your best friend', signoff: 'Yours, in every lifetime', ...(s.from || {}) };
  const st = s.settings || {};
  s.settings = {
    ...DEFAULT_SETTINGS,
    ...st,
    lock: { ...DEFAULT_SETTINGS.lock, ...(st.lock || {}) },
    grading: { ...DEFAULT_SETTINGS.grading, ...(st.grading || {}) },
    github: { ...DEFAULT_SETTINGS.github, ...(st.github || {}) },
    theme: { ...DEFAULT_SETTINGS.theme, ...(st.theme || {}) },
  };
  s.media = { music: null, musicTitle: '', video: null, videoCaption: 'A little something I recorded for you', voice: null, ...(s.media || {}) };
  const enabled = new Map((s.chapters || []).map((c) => [c.id, c.enabled !== false]));
  s.chapters = FILM_CHAPTERS.map((c) => ({ id: c.id, enabled: c.toggle === false ? true : enabled.has(c.id) ? enabled.get(c.id) : true }));
  s.text = s.text || {};
  s.photoChapters = s.photoChapters || {};
  const seen = new Set();
  s.photos = (s.photos || []).map((p) => {
    const q = newPhoto(p);
    while (seen.has(q.id)) q.id = newId(q.chapter);
    seen.add(q.id);
    return q;
  });
  // stable 1..n order per chapter
  for (const ch of PHOTO_CHAPTERS) photosFor(s, ch.id, { includeDisabled: true }).forEach((p, i) => (p.order = i + 1));
  return s;
}

/* ------------------------------------------------------------------ v1 → v2 */
export function migrateV1(old) {
  const roles = { hero: 'hero', finale: 'reveal', us: 'together' };
  const counters = {};
  const photos = (old.slots || []).map((slot) => {
    const chapter = slot.chapter === 'finale' || slot.id === 'us' ? 'finale' : slot.chapter;
    counters[chapter] = (counters[chapter] || 0) + 1;
    return newPhoto({ ...slot, chapter, order: counters[chapter], role: roles[slot.id] || null });
  });
  (old.extras || []).forEach((x, i) => photos.push(newPhoto({ ...x, chapter: 'album', order: i + 1, label: x.caption || `Extra memory ${i + 1}` })));
  return normalize({
    version: MODEL_VERSION,
    her: old.her,
    from: old.from,
    settings: old.settings,
    media: old.media,
    chapters: null,
    text: old.text || {},
    photoChapters: {},
    photos,
  });
}

/** Accept anything we've ever saved (v1 site.json, v2 combined) and return v2 combined. */
export function upgrade(site) {
  if (!site) return normalize({});
  if (Array.isArray(site.slots) && !Array.isArray(site.photos)) return migrateV1(site);
  return normalize(site);
}

/* ------------------------------------------------------------------ checks */
/**
 * Problems the owner should know about before publishing.
 * errors block publishing; warnings are friendly reminders.
 */
export function validate(site) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const p of site.photos || []) {
    if (ids.has(p.id)) errors.push({ id: p.id, message: `Two photos share the id "${p.id}".` });
    ids.add(p.id);
    if (!/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(String(p.ratio))) errors.push({ id: p.id, message: `"${p.label || p.id}" has an invalid shape (${p.ratio}).` });
  }
  for (const ch of PHOTO_CHAPTERS) {
    const live = photosFor(site, ch.id).filter((p) => p.src);
    const missing = photosFor(site, ch.id).filter((p) => !p.src);
    if (missing.length) warnings.push({ chapter: ch.id, message: `${ch.short}: ${missing.length} photo spot${missing.length > 1 ? 's are' : ' is'} still empty (a placeholder will show).` });
    else if (ch.min && live.length < ch.min) warnings.push({ chapter: ch.id, message: `${ch.short}: needs at least ${ch.min} photo${ch.min > 1 ? 's' : ''}.` });
    if (ch.max && photosFor(site, ch.id).length > ch.max) warnings.push({ chapter: ch.id, message: `${ch.short}: only the first ${ch.max} will be used.` });
  }
  for (const role of ROLES) {
    if (!(site.photos || []).some((p) => p.role === role && p.enabled !== false)) warnings.push({ role, message: `No photo is marked as "${role}".` });
  }
  const at = Date.parse(site.settings && site.settings.lock && site.settings.lock.unlockAt);
  if (site.settings && site.settings.lock && site.settings.lock.enabled && !Number.isFinite(at)) errors.push({ message: 'The unlock date/time is not a valid date.' });
  if (!site.her || !site.her.name) errors.push({ message: 'Her name is empty.' });
  return { errors, warnings, ok: errors.length === 0 };
}

/** Days from her birth to `when` (defaults to the unlock moment). */
export function daysAlive(site, when) {
  const birth = Date.parse(`${(site.her && site.her.birthDate) || '2007-01-03'}T00:00:00+05:30`);
  const end = when != null ? when : Date.parse(site.settings && site.settings.lock && site.settings.lock.unlockAt);
  return Math.round((end - birth) / 86400000);
}
