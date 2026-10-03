/**
 * photos.js — every photo operation the library and the editor use:
 *
 *   addPhotos({chapter})        pick 1..n files → chapter + shape → crop → details
 *   replacePhoto(id)            the HARD ratio rule: matching → accepted; otherwise
 *                               "Expected ratio: 4:5 · Uploaded ratio: 16:9" → CROP | CONTAIN | CHOOSE ANOTHER
 *   fillEmptySpots()            placeholder records (src null) → focal-aware auto crops → review grid → Adjust
 *   deletePhoto(id)             with Undo
 *   movePhoto(id, chapter)      keeps its ratio, goes to the end of the new chapter
 *   shiftPhoto(id, ±1)          accessible reorder; reorderChapter(chapter, ids) for drag-and-drop
 *   regenerate(photo, source)   display + thumb from the ORIGINAL (crop / contain / grade)
 *   regradeAll()                every photo, from its original
 */
import {
  PHOTO_CHAPTERS, RATIO_PRESETS, newPhoto, nextOrder, photosFor, reorder, chapterInfo, ratioMatches, describeRatio,
} from '../assets/js/shared/model.js';
import * as I from './images.js';
import {
  state, change, stageFile, newPhotoPaths, getFileBlob, globalStrength, photoById, flushSave,
} from './state.js';
import { clone, plural, intRatio, ratioWords } from './util.js';
import { h, icon, toast, openSheet, confirmDialog, progressSheet, pickFiles, textField, selectField, choiceDialog } from './ui.js';
import { openCropper } from './cropper.js';

export const CHAPTER_RANK = PHOTO_CHAPTERS.map((c) => c.id);
const nowIso = () => new Date().toISOString();

/** Film chapter used to preview a photo chapter. */
export function sceneFor(photoChapter) {
  return { finale: 'constellation', album: 'credits' }[photoChapter] || photoChapter;
}

export function previewUrl(scene) {
  return `../index.html?preview&draft${scene ? `&scene=${encodeURIComponent(scene)}` : ''}`;
}

/** Save the draft, then open the film preview in a new tab (popup-safe). */
export async function openPreview(scene = null, { draft = true } = {}) {
  const url = draft ? previewUrl(scene) : `../index.html?preview${scene ? `&scene=${encodeURIComponent(scene)}` : ''}`;
  const w = window.open('', '_blank');
  await flushSave();
  if (w) {
    try { w.opener = null; w.location.href = url; } catch { window.open(url, '_blank', 'noopener'); }
  } else {
    toast('Your browser blocked the new tab — allow pop-ups for this page, or tap here.', { action: { label: 'Open preview', run: () => window.open(url, '_blank', 'noopener') } });
  }
}

/* ---------------------------------------------------------------- decode */
let busyDepth = 0;
export async function withBusy(label, fn) {
  const el = document.getElementById('busy');
  const lab = document.getElementById('busy-label');
  if (lab) lab.textContent = label;
  busyDepth++;
  if (el) { el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); }
  try {
    return await fn((t) => { if (lab) lab.textContent = t; });
  } finally {
    busyDepth--;
    if (!busyDepth && el) { el.classList.remove('in'); el.hidden = true; }
  }
}

export function showImageError(err) {
  if (err && err.code === 'heic') {
    toast(I.HEIC_MESSAGE, {
      type: 'error',
      action: { label: 'How?', run: () => { const s = openSheet({ kicker: 'iPhone photos', title: 'Share as “Most Compatible”', size: 'sm', content: h('p.sheet-text', I.HEIC_HELP), actions: [h('button.btn.gold', { type: 'button', onclick: () => s.close() }, 'Got it')] }); } },
    });
  } else {
    toast((err && err.message) || 'This photo couldn’t be opened.', { type: 'error' });
  }
}

/** Decode a picked file with friendly errors → decoded | null. */
export async function openFile(file) {
  try {
    return await withBusy('Opening photo…', () => I.decodeImage(file));
  } catch (err) {
    showImageError(err);
    return null;
  }
}

/** Decode a photo's stored original (or, for old records, its display image). */
export async function loadOriginal(photo) {
  const path = photo.original || photo.src;
  if (!path) return null;
  const blob = await getFileBlob(path);
  const dec = await I.decodeImage(blob);
  return { ...dec, fromDisplay: !photo.original };
}

/* ---------------------------------------------------------------- build files */
/**
 * Make display + thumb (+ original when `upload` is given) for `photo` and stage them.
 * @returns {Promise<object>} the patch to apply to the record
 */
export async function buildImages(photo, decoded, { upload = null, crop = null, mode = 'cover', focalSrc = null }) {
  const ratio = photo.ratio;
  const W = decoded.width;
  const H = decoded.height;
  const cropN = mode === 'contain' ? null : I.roundRect(crop || I.toNorm(I.autoCropRect(W, H, ratio, focalSrc || undefined), W, H));
  const grade = I.gradeFor(photo, globalStrength());
  const out = await I.renderPhoto(decoded.canvas, { ratio, crop: cropN, mode, grade });
  const kinds = upload ? ['src', 'thumb', 'original'] : ['src', 'thumb'];
  let originalExt = 'jpg';
  let originalBlob = null;
  if (upload) {
    const o = await I.keepOriginal(upload, decoded);
    originalExt = o.ext;
    originalBlob = o.blob;
  }
  const paths = newPhotoPaths(photo.id, { displayExt: out.display.ext, originalExt, kinds });
  stageFile(paths.src, out.display.blob);
  stageFile(paths.thumb, out.thumb.blob);
  if (originalBlob) stageFile(paths.original, originalBlob);
  const patch = { src: paths.src, thumb: paths.thumb, crop: cropN, cropMode: mode, updatedAt: nowIso() };
  if (upload) patch.original = paths.original;
  if (focalSrc) patch.focal = I.focalToDisplay(focalSrc, { crop: cropN, mode, srcW: W, srcH: H, ratio });
  return patch;
}

/** Regenerate display + thumb from the stored original (crop / contain / grade changed). */
export async function regenerate(photo, decoded) {
  const src = decoded || (await loadOriginal(photo));
  if (!src) throw new Error('This photo has no image yet.');
  const mode = photo.cropMode === 'contain' ? 'contain' : 'cover';
  let crop = null;
  if (mode === 'cover') {
    crop = photo.crop && !src.fromDisplay
      ? photo.crop
      : I.toNorm(I.autoCropRect(src.width, src.height, photo.ratio, { x: 0.5, y: 0.5 }), src.width, src.height);
  }
  return buildImages(photo, src, { crop, mode });
}

function applyPatch(id, patch, { files = true } = {}) {
  change((site) => {
    const p = site.photos.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  }, { files });
}

/* ---------------------------------------------------------------- replace */
function ratioWarning(photo, w, h) {
  return `Expected ratio: ${photo.ratio} · Uploaded ratio: ${describeRatio(w, h)}`;
}

/**
 * Ask how to fit a mismatched photo → 'crop' | 'contain' | 'another' | null.
 */
export function mismatchDialog(photo, dec, previewCanvas) {
  const exp = intRatio(photo.ratio);
  const glyph = (r, cls) => {
    const v = typeof r === 'number' ? r : intRatio(r).value;
    const box = 54;
    return h(`span.ratio-glyph${cls ? `.${cls}` : ''}`, { style: { width: `${v >= 1 ? box : box * v}px`, height: `${v >= 1 ? box / v : box}px` }, 'aria-hidden': 'true' });
  };
  const thumb = previewCanvas ? h('div.mismatch-thumb', previewCanvas) : null;
  const message = h('div.mismatch',
    h('p.mismatch-warning', { role: 'alert', 'data-testid': 'ratio-warning' }, icon('warn'), h('span', ratioWarning(photo, dec.width, dec.height))),
    h('div.mismatch-shapes',
      h('figure', glyph(exp.value, 'expected'), h('figcaption', `This spot · ${exp.label} ${ratioWords(photo.ratio)}`)),
      h('figure', thumb || glyph(dec.width / dec.height, 'uploaded'), h('figcaption', `Your photo · ${describeRatio(dec.width, dec.height)}`))),
    h('p.sheet-text', 'This spot’s shape is locked, so the film never stretches or cuts a photo by surprise. How should this one fit?'));
  return choiceDialog({
    kicker: 'Different shape',
    title: 'This photo has a different shape',
    message,
    size: 'md',
    choices: [
      { value: 'crop', label: 'Crop', hint: `Choose the ${exp.label} part to keep (starts centred on the face)`, icon: 'crop', kind: 'gold', autofocus: true },
      { value: 'contain', label: 'Contain', hint: 'Show the whole photo, framed by a soft blurred extension of itself', icon: 'contain' },
      { value: 'another', label: 'Choose another photo', hint: 'Pick a different file', icon: 'images' },
    ],
  });
}

/** Replace (or fill) a photo's image, following the ratio rule. */
export async function replacePhoto(id, { file = null } = {}) {
  let photo = photoById(id);
  if (!photo) return false;
  let f = file;
  for (;;) {
    if (!f) f = (await pickFiles({ accept: 'image/jpeg,image/png,image/webp,image/*' }))[0];
    if (!f) return false;
    const dec = await openFile(f);
    // an unreadable file (HEIC…) ends here with a friendly message — re-opening the picker by
    // itself would hide that message and surprise the owner
    if (!dec) return false;
    const est = I.estimateFocal(dec.canvas);
    const focalSrc = est.confidence > 0.15 ? est : I.DEFAULT_FOCAL;
    let crop = null;
    let mode = 'cover';
    if (ratioMatches(dec.width / dec.height, photo.ratio)) {
      crop = I.toNorm(I.autoCropRect(dec.width, dec.height, photo.ratio, { x: 0.5, y: 0.5 }), dec.width, dec.height);
    } else {
      const small = I.drawRegion(dec.canvas, 0, 0, dec.width, dec.height, ...fit(dec.width, dec.height, 120));
      const choice = await mismatchDialog(photo, dec, small);
      if (choice === 'another') { f = null; continue; }
      if (choice === 'contain') mode = 'contain';
      else if (choice === 'crop') {
        const res = await openCropper({
          source: dec.canvas, ratio: photo.ratio, focal: focalSrc,
          title: `Crop for “${photo.label || 'this photo'}”`,
          rule: `Locked to ${intRatio(photo.ratio).label} — the same shape as this spot`,
          grade: I.gradeFor(photo, globalStrength()), confirmLabel: 'Use this crop',
        });
        if (!res) return false;
        crop = I.toNorm(res.rect, dec.width, dec.height);
      } else return false;
    }
    photo = photoById(id) || photo;
    const prev = clone(photo);
    const prevBlobs = ['src', 'thumb', 'original'].map((k) => [photo[k], state.files.get(photo[k])]).filter(([, b]) => b);
    let patch;
    try {
      patch = await withBusy('Preparing your photo…', () => buildImages(photo, dec, { upload: f, crop, mode, focalSrc }));
    } catch (err) {
      console.error(err);
      toast(`Couldn’t prepare this photo: ${err.message || err}`, { type: 'error' });
      return false;
    }
    const had = !!photo.src;
    applyPatch(id, { ...patch, addedAt: photo.addedAt || nowIso() });
    const how = mode === 'contain' ? 'shown whole, inside the frame' : crop && ratioMatches(dec.width / dec.height, photo.ratio) ? 'a perfect fit' : `cropped to ${intRatio(photo.ratio).label}`;
    toast(`${had ? 'Replaced' : 'Added'} — ${how}. Saved in your draft.`, {
      type: 'success',
      action: { label: 'Undo', run: () => {
        for (const [p, b] of prevBlobs) stageFile(p, b);
        change((site) => { const i = site.photos.findIndex((x) => x.id === id); if (i >= 0) site.photos[i] = prev; }, { files: true });
      } },
    });
    return true;
  }
}

const fit = (w, h, max) => { const s = Math.min(1, max / Math.max(w, h)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; };

/* ---------------------------------------------------------------- add */
function shapeChips(selected, onPick) {
  const chips = RATIO_PRESETS.map((r) => {
    const v = intRatio(r).value;
    const box = 20;
    return h('button.shape-chip', { type: 'button', role: 'radio', 'aria-checked': String(r === selected), dataset: { ratio: r }, onclick: () => pick(r) },
      h('span.shape-glyph', { style: { width: `${v >= 1 ? box : box * v}px`, height: `${v >= 1 ? box / v : box}px` }, 'aria-hidden': 'true' }),
      h('span.shape-txt', h('b', { portrait: 'Portrait', landscape: 'Landscape', square: 'Square' }[ratioWords(r)]), h('small', r)));
  });
  const row = h('div.shape-row.wrap', { role: 'radiogroup', 'aria-label': 'Shape' }, chips);
  row.addEventListener('keydown', (e) => {
    const i = chips.findIndex((c) => c.getAttribute('aria-checked') === 'true');
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (j === null) return;
    e.preventDefault();
    const k = (j + chips.length) % chips.length;
    pick(RATIO_PRESETS[k]);
    chips[k].focus();
  });
  function pick(r) {
    for (const c of chips) c.setAttribute('aria-checked', String(c.dataset.ratio === r));
    onPick(r);
  }
  row.pick = pick;
  return row;
}

/** ADD PHOTO: chapter + shape → files → crop each → details → new records. */
export async function addPhotos({ chapter = 'album' } = {}) {
  let ch = chapterInfo(chapter).id;
  let ratio = chapterInfo(ch).ratio || '3:4';
  const note = h('p.field-hint');
  const shapes = shapeChips(ratio, (r) => { ratio = r; syncNote(); });
  const syncNote = () => {
    const info = chapterInfo(ch);
    note.textContent = info.ratio
      ? (ratio === info.ratio ? `${info.short} photos are usually ${info.ratio}. ${info.hint}` : `${info.short} usually uses ${info.ratio} — ${ratio} works too; the film frames it.`)
      : `${info.hint} Pick any shape.`;
  };
  const chapterSel = selectField({
    label: 'Chapter', value: ch,
    options: PHOTO_CHAPTERS.map((c) => ({ value: c.id, label: c.label })),
    onchange: (v) => { ch = v; const r = chapterInfo(v).ratio; if (r) { ratio = r; shapes.pick(r); } syncNote(); },
  });
  chapterSel.control.setAttribute('data-testid', 'add-chapter');
  syncNote();
  const s = openSheet({
    key: 'add-photos', kicker: 'Add photos', title: 'Where should they go?', size: 'md',
    content: [
      h('p.sheet-text', 'There’s no limit — add photos now or any time later. Each one is cropped to the shape you pick, and that shape stays locked so a future replacement always fits.'),
      chapterSel,
      h('div.field', h('span.field-label', 'Shape'), shapes, note),
    ],
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => s.close(null) }, 'Cancel'),
      h('button.btn.gold', { type: 'button', autofocus: true, 'data-testid': 'add-choose', onclick: () => s.close('go') }, icon('images'), 'Choose photos…'),
    ],
  });
  if (s.duplicate || (await s.result) !== 'go') return 0;
  const files = await pickFiles({ accept: 'image/jpeg,image/png,image/webp,image/*', multiple: true });
  if (!files.length) return 0;
  let added = 0;
  let quick = false;
  const failed = []; // the cropper clears toasts, so unreadable files are reported once, at the end
  for (let i = 0; i < files.length; i++) {
    let dec;
    try {
      dec = await withBusy('Opening photo…', () => I.decodeImage(files[i]));
    } catch (err) {
      failed.push({ name: files[i].name || 'photo', err });
      continue;
    }
    const est = I.estimateFocal(dec.canvas);
    const focalSrc = est.confidence > 0.15 ? est : I.DEFAULT_FOCAL;
    const res = await openCropper({
      source: dec.canvas, ratio, focal: focalSrc,
      title: `Add to ${chapterInfo(ch).short}`,
      rule: `Locked to ${intRatio(ratio).label} — this photo will always keep this shape`,
      step: files.length > 1 ? `Photo ${i + 1} of ${files.length}` : '',
      grade: { strength: globalStrength() }, allowSkip: files.length > 1, confirmLabel: 'Next',
    });
    if (res === null) break;
    if (res.skip) continue;
    let details = { label: '', caption: '', date: '', alt: '' };
    if (!quick) {
      const d = await detailsSheet({ index: i, total: files.length, chapter: ch });
      if (d === null) break;
      if (d.quick) quick = true;
      details = d;
    }
    const rec = newPhoto({ chapter: ch, ratio, order: nextOrder(state.site, ch), label: details.label || `${chapterInfo(ch).short} photo`, caption: details.caption, date: details.date, alt: details.alt, addedAt: nowIso() });
    try {
      const patch = await withBusy('Preparing your photo…', () => buildImages(rec, dec, { upload: files[i], crop: I.toNorm(res.rect, dec.width, dec.height), mode: 'cover', focalSrc }));
      Object.assign(rec, patch);
      change((site) => { site.photos.push(rec); }, { files: true });
      added++;
    } catch (err) {
      console.error(err);
      failed.push({ name: files[i].name || 'photo', err });
    }
  }
  const done = added ? `${plural(added, 'photo')} added to ${chapterInfo(ch).short}.` : '';
  if (failed.length) reportFailed(failed, done);
  else if (added) toast(`${done} Saved in your draft — preview, then publish.`, { type: 'success' });
  return added;
}

/** One message for every photo that couldn't be used (names + the HEIC tip when it applies). */
export function reportFailed(failed, prefix = '') {
  const names = failed.slice(0, 3).map((f) => `“${f.name}”`).join(', ') + (failed.length > 3 ? ` and ${failed.length - 3} more` : '');
  const heic = failed.some((f) => f.err && f.err.code === 'heic');
  const why = heic ? ` ${I.HEIC_MESSAGE}` : failed.length === 1 && failed[0].err && failed[0].err.message ? ` ${failed[0].err.message}` : ' Try exporting them as JPEG and adding them again.';
  const msg = `${prefix ? `${prefix} ` : ''}${failed.length === 1 ? `${names} couldn’t be added.` : `${plural(failed.length, 'photo')} couldn’t be added: ${names}.`}${why}`;
  toast(msg, {
    type: 'error', duration: 14000,
    action: heic ? { label: 'How?', run: () => { const s = openSheet({ kicker: 'iPhone photos', title: 'Share as “Most Compatible”', size: 'sm', content: h('p.sheet-text', I.HEIC_HELP), actions: [h('button.btn.gold', { type: 'button', onclick: () => s.close() }, 'Got it')] }); } } : null,
  });
}

/** Details for a new photo → {label, caption, date, alt, quick?} | null */
function detailsSheet({ index, total, chapter }) {
  const label = textField({ label: 'Name (just for you)', placeholder: `e.g. ${chapterInfo(chapter).short} — beach day`, maxlength: 80 });
  const caption = textField({ label: 'Caption (shown in the film)', multiline: true, maxlength: 200, placeholder: 'A few words she’ll read under the photo' });
  const date = textField({ label: 'When', placeholder: 'e.g. Dec 2023', maxlength: 40, hint: 'Free text — a month, a year, “last summer”…' });
  const alt = textField({ label: 'Describe the photo (alt text)', placeholder: 'e.g. Deepu laughing on the beach at sunset', maxlength: 200, hint: 'Read aloud by screen readers. One short sentence.' });
  label.control.setAttribute('data-testid', 'details-label');
  caption.control.setAttribute('data-testid', 'details-caption');
  const val = (quick) => ({ label: label.control.value.trim(), caption: caption.control.value.trim(), date: date.control.value.trim(), alt: alt.control.value.trim(), quick });
  const s = openSheet({
    kicker: total > 1 ? `Photo ${index + 1} of ${total}` : 'Almost done',
    title: 'A few details (optional)', size: 'md',
    content: [label, caption, date, alt],
    actions: [
      total > 1 && index < total - 1 ? h('button.btn.ghost', { type: 'button', onclick: () => s.close(val(true)) }, 'Skip details for the rest') : h('button.btn.ghost', { type: 'button', onclick: () => s.close(null) }, 'Cancel'),
      h('button.btn.gold', { type: 'button', autofocus: true, 'data-testid': 'details-add', onclick: () => s.close(val(false)) }, icon('check'), 'Add photo'),
    ],
  });
  return s.result;
}

/* ---------------------------------------------------------------- delete / move / order */
export function deletePhoto(id) {
  const i = state.site.photos.findIndex((x) => x.id === id);
  if (i < 0) return;
  const removed = clone(state.site.photos[i]);
  const blobs = ['src', 'thumb', 'original'].map((k) => [removed[k], state.files.get(removed[k])]).filter(([, b]) => b);
  change((site) => { site.photos.splice(i, 1); reorder(site, removed.chapter, []); });
  toast(`Deleted “${removed.label || 'photo'}”.`, {
    action: { label: 'Undo', run: () => {
      for (const [p, b] of blobs) stageFile(p, b);
      change((site) => {
        site.photos.splice(Math.min(i, site.photos.length), 0, removed);
        const ids = photosFor(site, removed.chapter, { includeDisabled: true }).map((p) => p.id).filter((x) => x !== removed.id);
        ids.splice(Math.max(0, removed.order - 1), 0, removed.id);
        reorder(site, removed.chapter, ids);
      }, { files: true });
      toast('Restored.', { type: 'success' });
    } },
  });
}

export function movePhoto(id, chapter, { undoable = true, at = null } = {}) {
  const p = photoById(id);
  if (!p || p.chapter === chapter) return;
  const from = p.chapter;
  const fromIds = photosFor(state.site, from, { includeDisabled: true }).map((x) => x.id);
  change((site) => {
    const q = site.photos.find((x) => x.id === id);
    q.chapter = chapter;
    q.order = nextOrder(site, chapter) + 0.5;
    reorder(site, from, []);
    if (at) reorder(site, chapter, at);
    else reorder(site, chapter, []);
  });
  if (!undoable) return;
  // Undo puts it back exactly where it was (not at the end of its old chapter)
  toast(`Moved to ${chapterInfo(chapter).short}.`, { type: 'success', action: { label: 'Undo', run: () => movePhoto(id, from, { undoable: false, at: fromIds }) } });
}

/** Ask where to move a photo. */
export async function moveDialog(id) {
  const p = photoById(id);
  if (!p) return;
  let target = p.chapter;
  const note = h('p.field-hint');
  const sync = () => {
    const info = chapterInfo(target);
    note.textContent = info.ratio && info.ratio !== p.ratio
      ? `${info.short} usually uses ${info.ratio}. This photo keeps its ${p.ratio} shape — the film frames it gracefully.`
      : 'It goes to the end of that chapter; reorder it there if you like.';
  };
  const sel = selectField({
    label: 'Move to', value: p.chapter,
    options: PHOTO_CHAPTERS.map((c) => ({ value: c.id, label: c.label })),
    onchange: (v) => { target = v; sync(); },
  });
  sync();
  const s = openSheet({
    key: 'move-photo', kicker: 'Move photo', title: p.label || 'Move photo', size: 'sm',
    content: [sel, note],
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => s.close(null) }, 'Cancel'),
      h('button.btn.gold', { type: 'button', autofocus: true, 'data-testid': 'move-confirm', onclick: () => s.close(target) }, icon('move'), 'Move'),
    ],
  });
  if (s.duplicate) return;
  const to = await s.result;
  if (to && to !== p.chapter) movePhoto(id, to);
}

export function shiftPhoto(id, delta) {
  const p = photoById(id);
  if (!p) return false;
  const ids = photosFor(state.site, p.chapter, { includeDisabled: true }).map((x) => x.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return false;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  change((site) => reorder(site, p.chapter, ids));
  return true;
}

export function reorderChapter(chapter, ids) {
  change((site) => reorder(site, chapter, ids));
}

/* ---------------------------------------------------------------- bulk fill */
export async function fillEmptySpots() {
  const empties = (state.site.photos || []).filter((p) => !p.src && p.enabled !== false)
    .sort((a, b) => (CHAPTER_RANK.indexOf(a.chapter) - CHAPTER_RANK.indexOf(b.chapter)) || (a.order - b.order));
  if (!empties.length) { toast('Every photo spot already has a photo. ✨'); return; }
  const files = await pickFiles({ accept: 'image/jpeg,image/png,image/webp,image/*', multiple: true });
  if (!files.length) return;
  const items = files.map((file, i) => ({ file, i, size: null }));
  await withBusy('Reading your photos…', async () => {
    for (const it of items) { try { it.size = await I.blobSize(it.file); } catch { it.size = null; } }
  });
  openBulkReview(empties, items);
}

function openBulkReview(empties, items) {
  let smart = true;
  let cancelled = false;
  const results = new Map(); // `${photoId}|${itemIndex}` → { crop, focalSrc, url, dec? } | { error }
  let assignments = [];
  let leftovers = [];
  const grid = h('div.review-grid');
  const status = h('p.review-status', { 'aria-live': 'polite' });
  const leftoverBox = h('div.leftover');
  const addLeftovers = h('input', { type: 'checkbox', id: 'bulk-leftovers' });
  const smartBtn = h('button.toggle', { type: 'button', 'aria-pressed': 'true', onclick: () => { smart = !smart; smartBtn.setAttribute('aria-pressed', String(smart)); assign(); render(); pump(); } },
    h('span.toggle-knob', { 'aria-hidden': 'true' }), 'Match shapes automatically');
  const applyBtn = h('button.btn.gold', { type: 'button', 'data-testid': 'bulk-apply', onclick: apply }, icon('check'), h('span', 'Add to draft'));

  const sheet = openSheet({
    kicker: 'Fill empty spots',
    title: `${plural(Math.min(empties.length, items.length), 'photo')} ready to place`,
    size: 'full',
    content: [
      h('div.review-top',
        h('p.sheet-text', 'Each photo is cropped to its spot’s shape, centred on where a face most likely is. Tap ', h('b', 'Adjust'), ' to reframe any of them.'),
        smartBtn),
      status, grid, leftoverBox,
    ],
    actions: [h('button.btn.ghost', { type: 'button', onclick: () => sheet.close(null) }, 'Cancel'), applyBtn],
  });
  sheet.result.then((v) => {
    cancelled = true;
    if (v !== 'applied') for (const r of results.values()) if (r.url) URL.revokeObjectURL(r.url);
  });

  const key = (a) => `${a.photo.id}|${a.item.i}`;
  const itemRatio = (it) => (it.size ? it.size.width / it.size.height : null);

  function assign() {
    const pool = items.slice();
    const out = [];
    for (const photo of empties) {
      if (!pool.length) break;
      let pick = 0;
      if (smart) {
        const target = Math.log(intRatio(photo.ratio).value);
        let best = Infinity;
        pool.forEach((it, j) => {
          const r = itemRatio(it);
          const d = r ? Math.abs(Math.log(r) - target) : 9;
          if (d < best - 1e-9) { best = d; pick = j; }
        });
      }
      const prevSkip = assignments.find((a) => a.photo.id === photo.id)?.skipped || false;
      out.push({ photo, item: pool.splice(pick, 1)[0], skipped: prevSkip });
    }
    assignments = out;
    leftovers = pool;
  }

  function card(a) {
    const r = intRatio(a.photo.ratio);
    const res = results.get(key(a));
    const content = res?.url ? h('img', { src: res.url, alt: `Preview for ${a.photo.label}` }) : res?.error ? h('span.review-error', res.error) : h('span.spinner', { 'aria-label': 'Preparing' });
    return h('article.card.review-card', { class: a.skipped ? 'skipped' : '' },
      h('div.frame', { style: { aspectRatio: `${r.w} / ${r.h}` }, class: res?.url ? 'filled' : 'empty' }, content),
      h('div.card-body',
        h('div.card-row', h('h4.card-title', a.photo.label || a.photo.id), h('span.badge.ratio', r.label)),
        h('p.card-hint', `${chapterInfo(a.photo.chapter).short} · ${a.item.file.name}`),
        h('div.card-actions.review-actions',
          a.skipped
            ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { a.skipped = false; render(); } }, icon('plus'), 'Include')
            : [
              h('button.btn.sm.ghost', { type: 'button', disabled: !res || !!res.error, onclick: () => adjust(a) }, icon('crop'), 'Adjust'),
              h('button.btn.sm.quiet', { type: 'button', onclick: () => { a.skipped = true; render(); } }, 'Skip'),
            ]),
      ));
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
        h('label.check', { for: 'bulk-leftovers' }, addLeftovers, h('span', 'Add them to “Extra memories” instead (each keeps its own shape)')));
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
          const est = I.estimateFocal(dec.canvas);
          const focalSrc = est.confidence > 0.15 ? est : I.DEFAULT_FOCAL;
          const rect = ratioMatches(dec.width / dec.height, next.photo.ratio)
            ? I.autoCropRect(dec.width, dec.height, next.photo.ratio, { x: 0.5, y: 0.5 })
            : I.autoCropRect(dec.width, dec.height, next.photo.ratio, focalSrc);
          const pv = await I.renderPreview(dec.canvas, { ratio: next.photo.ratio, rectPx: rect, grade: I.gradeFor(next.photo, globalStrength()), longPx: 360 });
          const blob = await new Promise((r) => pv.toBlob(r, 'image/jpeg', 0.8));
          if (cancelled) return;
          results.set(k, { crop: I.toNorm(rect, dec.width, dec.height), focalSrc, url: URL.createObjectURL(blob) });
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
    const res = await openCropper({
      source: dec.canvas, ratio: a.photo.ratio, title: `Adjust “${a.photo.label}”`,
      rule: `Locked to ${intRatio(a.photo.ratio).label} — the shape of this spot`, grade: I.gradeFor(a.photo, globalStrength()),
      initialRect: prev?.crop ? I.fromNorm(prev.crop, dec.width, dec.height) : null, focal: prev?.focalSrc, confirmLabel: 'Done',
    });
    if (!res) return;
    const pv = await I.renderPreview(dec.canvas, { ratio: a.photo.ratio, rectPx: res.rect, grade: I.gradeFor(a.photo, globalStrength()), longPx: 360 });
    const blob = await new Promise((r) => pv.toBlob(r, 'image/jpeg', 0.8));
    if (prev?.url) URL.revokeObjectURL(prev.url);
    results.set(k, { crop: I.toNorm(res.rect, dec.width, dec.height), focalSrc: prev?.focalSrc, url: URL.createObjectURL(blob) });
    render();
  }

  async function apply() {
    const ready = assignments.filter((a) => !a.skipped && results.get(key(a))?.url);
    sheet.close('applied');
    let ok = 0;
    let extras = 0;
    await withBusy('Adding photos…', async (label) => {
      for (let n = 0; n < ready.length; n++) {
        const a = ready[n];
        label(`Adding photos… ${n + 1} of ${ready.length}`);
        try {
          const res = results.get(key(a));
          const dec = await I.decodeImage(a.item.file);
          const photo = photoById(a.photo.id);
          if (!photo) continue;
          const patch = await buildImages(photo, dec, { upload: a.item.file, crop: res.crop, mode: 'cover', focalSrc: res.focalSrc });
          Object.assign(photo, patch, { addedAt: photo.addedAt || nowIso() });
          ok++;
        } catch (err) {
          toast(`${a.item.file.name}: ${err.message || err}`, { type: 'error' });
        }
      }
      if (addLeftovers.checked) {
        for (let n = 0; n < leftovers.length; n++) {
          label(`Adding extra memories… ${n + 1} of ${leftovers.length}`);
          try {
            const dec = await I.decodeImage(leftovers[n].file);
            const shape = closestPreset(dec.width, dec.height);
            const est = I.estimateFocal(dec.canvas);
            const rec = newPhoto({ chapter: 'album', ratio: shape, order: nextOrder(state.site, 'album'), label: leftovers[n].file.name.replace(/\.[^.]+$/, ''), addedAt: nowIso() });
            Object.assign(rec, await buildImages(rec, dec, { upload: leftovers[n].file, mode: 'cover', focalSrc: est.confidence > 0.15 ? est : I.DEFAULT_FOCAL }));
            state.site.photos.push(rec);
            extras++;
          } catch (err) {
            toast(`${leftovers[n].file.name}: ${err.message || err}`, { type: 'error' });
          }
        }
      }
    });
    for (const r of results.values()) if (r.url) URL.revokeObjectURL(r.url);
    change(null, { files: true });
    toast(`${plural(ok, 'photo')} added${extras ? ` + ${plural(extras, 'extra memory', 'extra memories')}` : ''}. Saved in your draft — preview, then publish.`, { type: 'success' });
  }

  assign();
  render();
  pump();
}

export function closestPreset(w, h) {
  const v = Math.log(w / h);
  let best = RATIO_PRESETS[0];
  let bd = Infinity;
  for (const r of RATIO_PRESETS) {
    const d = Math.abs(Math.log(intRatio(r).value) - v);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/* ---------------------------------------------------------------- re-grade all */
export async function regradeAll() {
  const targets = (state.site.photos || []).filter((p) => p.src);
  if (!targets.length) { toast('There are no photos yet.'); return; }
  const ok = await confirmDialog({
    kicker: 'Colour grading',
    title: `Re-grade ${plural(targets.length, 'photo')}?`,
    message: `Each photo gets a fresh display copy made from its untouched original, at ${Math.round(globalStrength() * 100)}% strength (photos with their own setting keep it). Originals never change. It becomes part of your draft — publish to make it live. It can take a minute.`,
    confirm: 'Re-grade',
  });
  if (!ok) return;
  const prog = progressSheet({ kicker: 'Colour grading', title: 'Re-grading photos…' });
  const errors = [];
  let fromDisplay = 0;
  for (let n = 0; n < targets.length; n++) {
    const t = targets[n];
    prog.set(n / targets.length, `Photo ${n + 1} of ${targets.length}…`);
    try {
      const dec = await loadOriginal(t);
      if (dec.fromDisplay) fromDisplay++;
      const patch = await regenerate(t, dec);
      Object.assign(t, patch);
    } catch (err) {
      errors.push(`${t.label || t.id}: ${err.message || err}`);
    }
  }
  prog.set(1, 'Done');
  prog.close();
  change(null, { files: true });
  if (errors.length) toast(`Re-graded ${targets.length - errors.length} of ${targets.length}. Some failed: ${errors.slice(0, 2).join('; ')}`, { type: 'error' });
  else toast(`Re-graded ${plural(targets.length, 'photo')}${fromDisplay ? ` (${fromDisplay} had no saved original and used their current image)` : ''}. Preview, then publish.`, { type: 'success' });
}
