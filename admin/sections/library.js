/**
 * PHOTO LIBRARY — every photo record, any number of them.
 * Filter by chapter (+ All, Missing photos, Featured, Disabled); counts vs recommended;
 * cards with EDIT · REPLACE · MOVE · DELETE · PREVIEW and badges; reorder within a chapter
 * by drag-and-drop (pointer: mouse + touch) or the accessible up/down buttons / arrow keys.
 */
import { PHOTO_CHAPTERS, photosFor, chapterInfo, validate } from '../../assets/js/shared/model.js';
import { state, srcFor, rawUrl, isDraftPhoto, basePhoto, rerender, lsSet } from '../state.js';
import { intRatio, plural, ROLE_INFO } from '../util.js';
import { h, icon } from '../ui.js';
import { addPhotos, replacePhoto, fillEmptySpots, deletePhoto, moveDialog, shiftPhoto, reorderChapter, openPreview, sceneFor } from '../photos.js';
import { openEditor } from '../editor.js';
import { sectionHead } from './common.js';

const FILTER_KEY = 'deepu-admin-filter';

export function counts(site) {
  const out = {};
  for (const ch of PHOTO_CHAPTERS) {
    const all = photosFor(site, ch.id, { includeDisabled: true });
    const live = all.filter((p) => p.enabled !== false);
    out[ch.id] = { total: all.length, filled: live.filter((p) => p.src).length, live: live.length, missing: live.filter((p) => !p.src).length };
  }
  const photos = site.photos || [];
  out.all = photos.length;
  out.missing = photos.filter((p) => !p.src && p.enabled !== false).length;
  out.featured = photos.filter((p) => p.featured).length;
  out.disabled = photos.filter((p) => p.enabled === false).length;
  return out;
}

function chapterStatus(ch, c) {
  if (ch.min && c.filled < ch.min) return 'low';
  if (ch.recommended && c.filled < ch.recommended) return 'under';
  return 'ok';
}

export function renderLibrary() {
  const site = state.site;
  const c = counts(site);
  const filter = validFilter(state.ui.filter);
  state.ui.filter = filter;
  const v = validate(site);

  const head = sectionHead('Photo library', 'Every photo in the film',
    `${plural(c.all, 'photo')} · ${c.missing ? `${plural(c.missing, 'empty spot')} to fill` : 'every spot filled ✨'}. Add more any time — there’s no limit.`,
    h('div.head-actions',
      h('button.btn.gold', { type: 'button', 'data-testid': 'add-photo', onclick: () => addPhotos({ chapter: PHOTO_CHAPTERS.some((x) => x.id === filter) ? filter : 'album' }) }, icon('plus'), 'Add photo'),
      c.missing ? h('button.btn.ghost', { type: 'button', 'data-testid': 'fill-empty', onclick: fillEmptySpots }, icon('wand'), `Fill empty spots (${c.missing})`) : null));

  const chip = (id, label, count, extra = {}) => h('button.fchip', {
    type: 'button', role: 'tab', 'aria-selected': String(filter === id), dataset: { filter: id, fk: `filter-${id}` },
    class: extra.cls || '', title: extra.title || null,
    onclick: () => { state.ui.filter = id; lsSet(FILTER_KEY, id); rerender({ keepScroll: false }); },
  }, extra.icon ? icon(extra.icon) : null, h('span.fchip-label', label), count != null ? h('span.fchip-count', count) : null);

  const filters = h('div.filters', { role: 'tablist', 'aria-label': 'Filter photos' },
    chip('all', 'All', c.all),
    PHOTO_CHAPTERS.map((ch) => {
      const k = c[ch.id];
      const st = chapterStatus(ch, k);
      const rec = ch.recommended ? `/${ch.recommended}` : '';
      return chip(ch.id, ch.short, `${k.filled}${rec}`, { cls: `st-${st}`, title: `${ch.label}: ${k.filled} with a photo${ch.recommended ? `, ${ch.recommended} recommended` : ''}${k.missing ? `, ${k.missing} empty` : ''}` });
    }),
    h('span.fchip-sep', { 'aria-hidden': 'true' }),
    chip('missing', 'Missing photos', c.missing, { icon: 'image', cls: c.missing ? 'st-under' : '' }),
    chip('featured', 'Featured', c.featured, { icon: 'star' }),
    chip('disabled', 'Disabled', c.disabled, { icon: 'eye' }));

  const checks = v.errors.length || v.warnings.length
    ? h('button.checks-banner', { type: 'button', class: v.errors.length ? 'has-errors' : '', onclick: () => { location.hash = '#preview'; } },
      icon(v.errors.length ? 'warn' : 'info'),
      h('span', v.errors.length ? `${plural(v.errors.length, 'problem')} to fix before publishing` : `${plural(v.warnings.length, 'gentle reminder')} before publishing`),
      h('span.checks-go', 'See checks', icon('right')))
    : null;

  let body;
  if (filter === 'all') body = PHOTO_CHAPTERS.map((ch) => chapterBlock(ch, c[ch.id]));
  else if (PHOTO_CHAPTERS.some((x) => x.id === filter)) body = chapterBlock(chapterInfo(filter), c[filter]);
  else {
    const list = (site.photos || []).filter((p) => (filter === 'missing' ? !p.src && p.enabled !== false : filter === 'featured' ? p.featured : p.enabled === false))
      .sort((a, b) => PHOTO_CHAPTERS.findIndex((x) => x.id === a.chapter) - PHOTO_CHAPTERS.findIndex((x) => x.id === b.chapter) || a.order - b.order);
    const empty = { missing: 'Every photo spot has a photo. ✨', featured: 'No featured photos yet — open a photo and switch on “Featured ★”.', disabled: 'Nothing is switched off.' }[filter];
    body = h('section.lib-block',
      list.length ? h('div.pgrid', list.map((p) => photoCard(p, { showChapter: true, sortable: false }))) : h('p.empty-note', empty));
  }

  return h('div.library', head, checks, filters, h('div.lib-body', body));
}

function chapterBlock(ch, c) {
  const list = photosFor(state.site, ch.id, { includeDisabled: true });
  const st = chapterStatus(ch, c);
  const need = ch.recommended ? `${c.filled} of ${ch.recommended} recommended` : plural(c.filled, 'photo');
  const grid = h('div.pgrid', { dataset: { chapter: ch.id }, role: 'list', 'aria-label': `${ch.short} photos` }, list.map((p, i) => photoCard(p, { index: i, total: list.length, sortable: list.length > 1 })));
  enableDrag(grid, ch.id);
  return h('section.lib-block', { id: `ch-${ch.id}`, dataset: { chapter: ch.id } },
    h('header.lib-head',
      h('div.lib-titles',
        h('h3.lib-title', ch.label),
        h('p.lib-sub', ch.hint)),
      h('div.lib-meta',
        h('span.count-pill', { class: `st-${st}` }, need),
        c.missing ? h('span.count-pill.st-under', plural(c.missing, 'empty spot')) : null,
        h('button.btn.sm.ghost', { type: 'button', 'data-testid': `add-to-${ch.id}`, onclick: () => addPhotos({ chapter: ch.id }) }, icon('plus'), 'Add here'),
        h('button.btn.sm.quiet', { type: 'button', onclick: () => openPreview(sceneFor(ch.id)), 'aria-label': `Preview ${ch.short}` }, icon('eye'), h('span.hide-sm', 'Preview')))),
    list.length ? grid : h('div.empty-note', h('p', ch.id === 'album' ? 'No extra memories yet — add as many as you like, any time (even after her birthday).' : 'No photos here yet.'),
      h('button.btn.sm.gold-soft', { type: 'button', onclick: () => addPhotos({ chapter: ch.id }) }, icon('plus'), 'Add a photo')));
}

/* ---------------------------------------------------------------- card */
/** The photo's exact shape, fitted inside the square media box. */
function frameStyle(v) {
  return v >= 1 ? { width: '100%', height: `${(100 / v).toFixed(2)}%` } : { width: `${(100 * v).toFixed(2)}%`, height: '100%' };
}

function thumbEl(p) {
  const path = p.thumb || p.src;
  if (!path) {
    const r = intRatio(p.ratio);
    return h('span.empty-art', h('span.empty-glyph', icon('lantern')), h('span.empty-ratio', r.label), h('span.empty-cta', 'Empty spot'));
  }
  const img = h('img', { alt: p.alt || p.label || 'Photo', loading: 'lazy', decoding: 'async', draggable: 'false' });
  let tries = 0;
  img.addEventListener('error', () => {
    tries++;
    if (tries === 1 && p.thumb && p.src && path === p.thumb) img.src = srcFor(p.src);
    else if (tries <= 2 && state.repo.owner && !/^blob:/.test(img.src)) img.src = rawUrl(p.src || path);
    else img.closest('.pcard-media')?.classList.add('broken');
  });
  img.src = srcFor(path);
  return img;
}

export function photoCard(p, { index = 0, total = 1, sortable = true, showChapter = false } = {}) {
  const r = intRatio(p.ratio);
  const draft = isDraftPhoto(p);
  const isNew = !basePhoto(p.id);
  const badges = h('div.badges',
    h('span.badge.ratio', { title: `Shape ${r.label} — locked` }, icon('lock'), r.label),
    p.role ? h('span.badge.role', { title: ROLE_INFO[p.role].text }, ROLE_INFO[p.role].label) : null,
    p.featured ? h('span.badge.star', { title: 'Featured' }, icon('star'), h('span.sr-only', 'Featured')) : null,
    p.heroHair ? h('span.badge.hair', { title: 'Hero-hair photo' }, icon('hair'), 'Hair') : null,
    p.enabled === false ? h('span.badge.off', 'Hidden') : null,
    draft ? h('span.badge.draft', isNew ? 'New' : 'Draft') : null);
  const title = p.label || (p.caption ? `“${p.caption}”` : 'Untitled photo');
  const meta = [showChapter ? chapterInfo(p.chapter).short : null, p.date || null, p.caption && p.label ? `“${p.caption}”` : null].filter(Boolean).join(' · ');
  const act = (name, label, ic, fn, extra = {}) => h(`button.pact${extra.danger ? '.danger' : ''}`, {
    type: 'button', dataset: { act: name, fk: `${name}-${p.id}` }, 'aria-label': `${label} — ${title}`, title: label, onclick: fn,
  }, icon(ic), h('span.pact-label', label));
  const order = sortable ? h('div.pcard-order',
    h('button.order-btn', { type: 'button', dataset: { act: 'up', fk: `up-${p.id}` }, 'aria-label': `Move earlier — ${title}`, title: 'Move earlier', disabled: index === 0, onclick: () => shiftPhoto(p.id, -1) }, icon('up')),
    h('button.grip', { type: 'button', dataset: { act: 'grip', fk: `grip-${p.id}` }, 'aria-label': `Reorder ${title}: drag, or use the arrow keys. Position ${index + 1} of ${total}.`, title: 'Drag to reorder' }, icon('grip')),
    h('button.order-btn', { type: 'button', dataset: { act: 'down', fk: `down-${p.id}` }, 'aria-label': `Move later — ${title}`, title: 'Move later', disabled: index === total - 1, onclick: () => shiftPhoto(p.id, 1) }, icon('down')),
    h('span.order-pos', { 'aria-hidden': 'true' }, `${index + 1} of ${total}`))
    : null;
  return h('article.pcard', {
    role: 'listitem', dataset: { id: p.id, chapter: p.chapter },
    class: [p.src ? 'has-img' : 'is-empty', p.enabled === false ? 'is-off' : '', draft ? 'is-draft' : ''].join(' '),
  },
  h('button.pcard-media', {
    type: 'button', dataset: { fk: `media-${p.id}` },
    'aria-label': p.src ? `Edit ${title}` : `Add a photo to ${title} (${r.label})`,
    onclick: () => (p.src ? openEditor(p.id) : replacePhoto(p.id)),
  }, h('span.pcard-frame', { style: frameStyle(r.value) }, thumbEl(p)), sortable ? h('span.order-num', { 'aria-hidden': 'true' }, `#${index + 1}`) : null),
  h('div.pcard-main',
    h('h4.pcard-title', title),
    meta ? h('p.pcard-meta', meta) : p.hint && !p.src ? h('p.pcard-meta.hint', p.hint) : null,
    badges),
  h('div.pcard-actions',
    act('edit', 'Edit', 'edit', () => openEditor(p.id)),
    act('replace', p.src ? 'Replace' : 'Upload', p.src ? 'replace' : 'upload', () => replacePhoto(p.id)),
    act('move', 'Move', 'move', () => moveDialog(p.id)),
    act('delete', 'Delete', 'trash', () => deletePhoto(p.id), { danger: true }),
    act('preview', 'Preview', 'eye', () => openPreview(sceneFor(p.chapter)))),
  order);
}

/* ---------------------------------------------------------------- drag & keyboard reorder */
function enableDrag(grid, chapter) {
  let drag = null;
  grid.addEventListener('keydown', (e) => {
    const grip = e.target.closest && e.target.closest('.grip');
    if (!grip) return;
    const id = grip.closest('.pcard').dataset.id;
    const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    shiftPhoto(id, d);
  });
  grid.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest && e.target.closest('.grip');
    if (!grip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const card = grip.closest('.pcard');
    e.preventDefault();
    grip.setPointerCapture?.(e.pointerId);
    const before = [...grid.children].map((c) => c.dataset.id);
    drag = { card, grip, pointerId: e.pointerId, before, moved: false, x0: e.clientX, y0: e.clientY };
    card.classList.add('dragging');
    grid.classList.add('is-sorting');
  });
  grid.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.moved = true;
    const cards = [...grid.children].filter((c) => c !== drag.card);
    let target = null;
    let after = false;
    let best = Infinity;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (d < best) { best = d; target = c; after = (Math.abs(e.clientY - cy) > r.height / 2) ? e.clientY > cy : e.clientX > cx; }
    }
    if (!target) return;
    const ref = after ? target.nextSibling : target;
    if (ref !== drag.card && ref !== drag.card.nextSibling) grid.insertBefore(drag.card, ref);
    else if (!after && target.previousSibling !== drag.card) grid.insertBefore(drag.card, target);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { card, before, moved } = drag;
    drag = null;
    card.classList.remove('dragging');
    grid.classList.remove('is-sorting');
    const ids = [...grid.children].map((c) => c.dataset.id);
    if (moved && ids.join('|') !== before.join('|')) reorderChapter(chapter, ids);
  };
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);
}

const SPECIAL_FILTERS = ['all', 'missing', 'featured', 'disabled'];
/** A filter this version knows (a remembered one from an older version may not exist any more). */
export const validFilter = (f) => (SPECIAL_FILTERS.includes(f) || PHOTO_CHAPTERS.some((x) => x.id === f) ? f : 'all');

export function restoreFilter() {
  try {
    const f = localStorage.getItem(FILTER_KEY);
    if (f) state.ui.filter = validFilter(f);
  } catch { /* ignore */ }
}
