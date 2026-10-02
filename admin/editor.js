/**
 * editor.js — the EDIT PHOTO panel.
 *
 * Edits are staged on a copy and applied with "Save changes". Words, chapter, role,
 * switches, focal point and motion are plain data; crop / crop mode / grading
 * regenerate the display + thumb from the stored ORIGINAL (originals never change).
 */
import { PHOTO_CHAPTERS, ROLES, nextOrder, reorder, chapterInfo } from '../assets/js/shared/model.js';
import * as I from './images.js';
import { state, change, photoById, globalStrength } from './state.js';
import { clone, deepEqual, intRatio, ROLE_INFO } from './util.js';
import { h, icon, toast, openSheet, textField, selectField, switchField, sliderField, segmented, debounce } from './ui.js';
import { focalPicker } from './focal.js';
import { openCropper } from './cropper.js';
import { loadOriginal, regenerate, withBusy, replacePhoto, deletePhoto, openPreview, sceneFor } from './photos.js';

export const ANIMATIONS = [
  { value: '', label: 'Auto (the chapter decides)' },
  { value: 'kenburns-in', label: 'Slow zoom in' },
  { value: 'kenburns-out', label: 'Slow zoom out' },
  { value: 'pan-left', label: 'Gentle pan left' },
  { value: 'pan-right', label: 'Gentle pan right' },
  { value: 'drift', label: 'Soft float' },
  { value: 'none', label: 'Still' },
];
export const EFFECTS = [
  { value: '', label: 'Auto (the chapter decides)' },
  { value: 'glow', label: 'Warm glow' },
  { value: 'sparkle', label: 'Sparkles' },
  { value: 'petals', label: 'Petals' },
  { value: 'lanterns', label: 'Lantern light' },
  { value: 'none', label: 'None' },
];
export const DURATIONS = [
  { value: '', label: 'Auto' },
  ...[3, 4, 5, 6, 8, 10].map((s) => ({ value: String(s), label: `${s} seconds` })),
];

const signed = (v) => (v > 0 ? `+${Math.round(v * 100)}` : `${Math.round(v * 100)}`);

export async function openEditor(id) {
  const orig = photoById(id);
  if (!orig) return;
  const p = clone(orig);
  p.grade = { strength: null, warmth: 0, exposure: 0, ...(p.grade || {}) };
  let src = null; //          decoded original
  let srcError = null;
  let showAfter = true;

  /* ---------- media column ---------- */
  const fp = focalPicker({ focal: p.focal || I.DEFAULT_FOCAL, onchange: (f) => { p.focal = f; } });
  const stageBox = h('div.editor-stage', { style: { aspectRatio: aspect(p.ratio), width: `min(100%, calc(60vh * ${intRatio(p.ratio).value.toFixed(4)}))` } }, fp.el);
  const status = h('p.editor-status', { 'aria-live': 'polite' });
  const ba = segmented({
    label: null, value: 'after', className: 'compact',
    options: [{ value: 'before', label: 'Before' }, { value: 'after', label: 'After' }],
    onchange: (v) => { showAfter = v === 'after'; draw(); },
  });
  ba.querySelector('.seg-group').setAttribute('aria-label', 'Compare before and after grading');
  const recropBtn = h('button.btn.sm.ghost', { type: 'button', disabled: !p.src, onclick: recrop }, icon('crop'), 'Re-crop from original');
  const replaceBtn = h('button.btn.sm.ghost', { type: 'button', onclick: async () => { s.close(null); await replacePhoto(id); } }, icon('replace'), p.src ? 'Replace photo' : 'Upload photo');
  const media = h('div.editor-media',
    stageBox,
    h('div.editor-media-bar', ba, status),
    h('p.field-hint', 'Tap the face (or use the arrow keys) to set the focal point — the film keeps it in view and auto-crops around it.'),
    h('div.card-actions.wrap', recropBtn, replaceBtn,
      h('button.btn.sm.quiet', { type: 'button', onclick: () => openPreview(sceneFor(p.chapter)) }, icon('eye'), 'Preview chapter')));

  /* ---------- fields ---------- */
  const caption = textField({ label: 'Caption', value: p.caption, multiline: true, maxlength: 240, placeholder: 'Shown under the photo in the film', oninput: (v) => { p.caption = v; } });
  caption.control.setAttribute('data-testid', 'edit-caption');
  const date = textField({ label: 'When', value: p.date, maxlength: 40, placeholder: 'e.g. Dec 2023', hint: 'Free text — “Dec 2023”, “Diwali 2022”, “last summer”.', oninput: (v) => { p.date = v; } });
  const alt = textField({ label: 'Alt text (describe the photo)', value: p.alt, maxlength: 220, placeholder: 'e.g. Deepu laughing under fairy lights', hint: 'Read aloud by screen readers.', oninput: (v) => { p.alt = v; } });
  const label = textField({ label: 'Name (only you see this)', value: p.label, maxlength: 80, oninput: (v) => { p.label = v; s.setTitle(v || 'Edit photo'); } });

  const chapterNote = h('p.field-hint');
  const syncChapterNote = () => {
    const info = chapterInfo(p.chapter);
    chapterNote.textContent = p.chapter === orig.chapter
      ? `${info.hint}`
      : `Moves to the end of ${info.short}. It keeps its ${p.ratio} shape${info.ratio && info.ratio !== p.ratio ? ` (that chapter usually uses ${info.ratio} — the film frames it gracefully)` : ''}.`;
  };
  const chapterSel = selectField({ label: 'Chapter', value: p.chapter, options: PHOTO_CHAPTERS.map((c) => ({ value: c.id, label: c.label })), onchange: (v) => { p.chapter = v; syncChapterNote(); } });
  syncChapterNote();

  const roleNote = h('p.field-hint');
  const syncRoleNote = () => {
    if (!p.role) { roleNote.textContent = 'A special part in the story (optional). Each part belongs to one photo.'; return; }
    const holder = (state.site.photos || []).find((x) => x.role === p.role && x.id !== id);
    roleNote.textContent = holder
      ? `${ROLE_INFO[p.role].text} Note: “${holder.label || holder.id}” has this part now — it will move to this photo.`
      : ROLE_INFO[p.role].text;
    roleNote.classList.toggle('is-note', !!holder);
  };
  const roleSel = selectField({
    label: 'Special part', value: p.role || '',
    options: [{ value: '', label: 'None' }, ...ROLES.map((r) => ({ value: r, label: ROLE_INFO[r].label }))],
    onchange: (v) => { p.role = v || null; syncRoleNote(); },
  });
  roleSel.control.setAttribute('data-testid', 'edit-role');
  syncRoleNote();

  const featured = switchField({ label: 'Featured ★', checked: p.featured, hint: 'One of her favourites — featured photos get extra moments in the finale.', onchange: (v) => { p.featured = v; } });
  const heroHairHolder = (state.site.photos || []).find((x) => x.heroHair && x.id !== id);
  const heroHair = switchField({
    label: 'Hero-hair photo',
    checked: p.heroHair,
    hint: `Shows her long hair beautifully — used for a special cinematic moment.${heroHairHolder ? ` (Now: “${heroHairHolder.label || heroHairHolder.id}” — switching this on moves it here.)` : ''}`,
    onchange: (v) => { p.heroHair = v; },
  });
  const enabled = switchField({ label: 'Show in the film', checked: p.enabled !== false, hint: 'Switch off to hide it without deleting it.', onchange: (v) => { p.enabled = v; } });

  const cropSeg = segmented({
    label: 'Fit',
    value: p.cropMode === 'contain' ? 'contain' : 'cover',
    options: [{ value: 'cover', label: 'Fill (crop)', icon: 'crop' }, { value: 'contain', label: 'Whole photo', icon: 'contain' }],
    onchange: (v) => setMode(v),
  });
  const framingHint = h('p.field-hint', `Locked shape: ${intRatio(p.ratio).label}. “Whole photo” shows everything over a soft blurred frame — nothing is ever stretched.`);

  const useGlobal = switchField({
    label: `Use the global grading (${Math.round(globalStrength() * 100)}%)`,
    checked: !Number.isFinite(p.grade.strength),
    onchange: (v) => { p.grade.strength = v ? null : globalStrength(); strength.control.disabled = v; strength.set(effStrength()); redraw(); },
  });
  const effStrength = () => (Number.isFinite(p.grade.strength) ? p.grade.strength : globalStrength());
  const strength = sliderField({
    label: 'Grading strength', min: 0, max: 1, step: 0.05, value: effStrength(), format: (v) => `${Math.round(v * 100)}%`,
    ends: ['Natural', 'Full look'], disabled: !Number.isFinite(p.grade.strength),
    oninput: (v) => { p.grade.strength = v; redraw(); },
  });
  const warmth = sliderField({ label: 'Warmth', min: -1, max: 1, step: 0.05, value: p.grade.warmth || 0, format: signed, ends: ['Cooler', 'Warmer'], oninput: (v) => { p.grade.warmth = v; redraw(); } });
  const exposure = sliderField({ label: 'Brightness', min: -1, max: 1, step: 0.05, value: p.grade.exposure || 0, format: signed, ends: ['Darker', 'Brighter'], oninput: (v) => { p.grade.exposure = v; redraw(); } });
  const resetGrade = h('button.btn.sm.quiet', { type: 'button', onclick: () => {
    p.grade = { strength: null, warmth: 0, exposure: 0 };
    useGlobal.control.checked = true; strength.control.disabled = true; strength.set(globalStrength()); warmth.set(0); exposure.set(0); redraw();
  } }, icon('undo'), 'Reset colour');

  const anim = selectField({ label: 'Animation', value: p.animation || '', options: ANIMATIONS, onchange: (v) => { p.animation = v || null; } });
  const effect = selectField({ label: 'Effect', value: p.effect || '', options: EFFECTS, onchange: (v) => { p.effect = v || null; } });
  const duration = selectField({ label: 'Time on screen', value: p.duration ? String(p.duration) : '', options: DURATIONS, onchange: (v) => { p.duration = v ? Number(v) : null; } });

  const fields = h('div.editor-fields',
    h('fieldset.fs', h('legend', 'Words'), caption, date, alt, label),
    h('fieldset.fs', h('legend', 'Place in the film'), chapterSel, chapterNote, roleSel, roleNote, featured, heroHair, enabled),
    h('fieldset.fs', h('legend', 'Framing'), cropSeg, framingHint),
    h('fieldset.fs', h('legend', 'Colour'), h('p.field-hint', 'Grading only changes the copy shown in the film. Your original stays untouched.'), useGlobal, strength, warmth, exposure, resetGrade),
    h('details.fs.more', h('summary', 'Motion (optional)'), h('div.fs-body', h('p.field-hint', 'Leave on Auto unless you want something specific — each chapter already has its own choreography.'), anim, effect, duration)));

  const saveBtn = h('button.btn.gold', { type: 'button', 'data-testid': 'edit-save', onclick: save }, icon('check'), 'Save changes');
  const s = openSheet({
    kicker: `${chapterInfo(p.chapter).short} · ${intRatio(p.ratio).label}`,
    title: p.label || 'Edit photo',
    size: 'xl',
    className: 'editor-sheet',
    content: h('div.editor', media, fields),
    actions: [
      h('button.btn.quiet.danger-text', { type: 'button', 'aria-label': 'Delete this photo', title: 'Delete this photo', onclick: () => { s.close(null); deletePhoto(id); } }, icon('trash'), h('span.hide-sm', 'Delete')),
      h('span.spacer'),
      h('button.btn.ghost', { type: 'button', onclick: () => s.close(null) }, 'Cancel'),
      saveBtn,
    ],
  });

  /* ---------- preview rendering ---------- */
  let shaped = null; // ungraded display-shaped canvas (small)
  let gradedC = null;
  const view = h('canvas.editor-canvas', { 'aria-hidden': 'true' });
  async function rebuildShape() {
    if (!src) return;
    shaped = I.renderShape(src.canvas, { ratio: p.ratio, crop: p.cropMode === 'contain' ? null : p.crop, mode: p.cropMode, focal: null, longPx: 640 });
    gradedC = null;
    await draw();
  }
  async function draw() {
    if (!shaped) return;
    let c = shaped;
    if (showAfter) {
      if (!gradedC) gradedC = await I.renderPreview(shaped, { ratio: p.ratio, mode: 'cover', crop: { x: 0, y: 0, w: 1, h: 1 }, grade: I.gradeFor(p, globalStrength()), longPx: 640 });
      c = gradedC;
    }
    view.width = c.width;
    view.height = c.height;
    view.getContext('2d').drawImage(c, 0, 0);
    fp.setMedia(view);
  }
  const redraw = debounce(() => { gradedC = null; draw(); }, 120);

  function setMode(mode) {
    if (mode === p.cropMode || !src) { p.cropMode = mode; return; }
    const geo = { srcW: src.width, srcH: src.height, ratio: p.ratio };
    const fSrc = I.focalToSource(p.focal || I.DEFAULT_FOCAL, { ...geo, crop: p.crop, mode: p.cropMode });
    p.cropMode = mode;
    if (mode === 'cover' && !p.crop) p.crop = I.roundRect(I.toNorm(I.autoCropRect(src.width, src.height, p.ratio, fSrc), src.width, src.height));
    p.focal = I.focalToDisplay(fSrc, { ...geo, crop: p.crop, mode });
    fp.set(p.focal);
    rebuildShape();
  }

  async function recrop() {
    if (!src) return;
    const geo = { srcW: src.width, srcH: src.height, ratio: p.ratio };
    const fSrc = I.focalToSource(p.focal || I.DEFAULT_FOCAL, { ...geo, crop: p.crop, mode: p.cropMode });
    const res = await openCropper({
      source: src.canvas, ratio: p.ratio, title: `Re-crop “${p.label || 'photo'}”`,
      rule: `Locked to ${intRatio(p.ratio).label} — working from your untouched original`,
      grade: I.gradeFor(p, globalStrength()),
      initialRect: p.cropMode !== 'contain' && p.crop ? I.fromNorm(p.crop, src.width, src.height) : null,
      focal: fSrc, confirmLabel: 'Use this crop',
    });
    if (!res) return;
    p.crop = I.roundRect(I.toNorm(res.rect, src.width, src.height));
    p.cropMode = 'cover';
    cropSeg.select('cover');
    p.focal = I.focalToDisplay(fSrc, { ...geo, crop: p.crop, mode: 'cover' });
    fp.set(p.focal);
    rebuildShape();
  }

  // load the original (or show the empty state)
  if (p.src) {
    stageBox.classList.add('loading');
    status.textContent = 'Loading the original…';
    loadOriginal(p).then((dec) => {
      src = dec;
      stageBox.classList.remove('loading');
      status.textContent = dec.fromDisplay ? 'No separate original saved — using the current image.' : '';
      if (!p.crop && p.cropMode !== 'contain' && !dec.fromDisplay) p.crop = null;
      rebuildShape();
    }).catch((err) => {
      srcError = err;
      stageBox.classList.remove('loading');
      status.textContent = 'Couldn’t load the original — words and settings can still be edited.';
      recropBtn.disabled = true;
      const img = h('img', { src: `../${p.thumb || p.src}`, alt: '' });
      fp.setMedia(img);
    });
  } else {
    fp.setMedia(h('div.empty-art.in-editor', h('span.empty-glyph', icon('lantern')), h('span.empty-ratio', intRatio(p.ratio).label), h('span.empty-cta', 'No photo yet')));
    recropBtn.disabled = true;
    ba.hidden = true;
  }

  /* ---------- save ---------- */
  async function save() {
    const regen = !!p.src && !srcError && (!deepEqual(orig.crop, p.crop) || orig.cropMode !== p.cropMode || !deepEqual(normGrade(orig.grade), normGrade(p.grade)));
    if (!Number.isFinite(p.grade.strength)) p.grade.strength = null;
    let patch = {};
    if (regen) {
      saveBtn.disabled = true;
      try {
        if (!src) src = await loadOriginal(p);
        patch = await withBusy('Updating the photo from its original…', () => regenerate(p, src));
      } catch (err) {
        saveBtn.disabled = false;
        toast(`Couldn’t update the photo: ${err.message || err}`, { type: 'error' });
        return;
      }
    }
    const notes = [];
    change((site) => {
      const i = site.photos.findIndex((x) => x.id === id);
      if (i < 0) return;
      const next = { ...p, ...patch, updatedAt: new Date().toISOString() };
      if (next.role && next.role !== orig.role) {
        for (const x of site.photos) if (x.id !== id && x.role === next.role) { x.role = null; notes.push(`“${ROLE_INFO[next.role].label}” moved from ${x.label || x.id}`); }
      }
      if (next.heroHair && !orig.heroHair) {
        for (const x of site.photos) if (x.id !== id && x.heroHair) { x.heroHair = false; notes.push(`hero-hair moved from ${x.label || x.id}`); }
      }
      if (next.chapter !== orig.chapter) next.order = nextOrder(site, next.chapter) + 0.5;
      site.photos[i] = next;
      if (next.chapter !== orig.chapter) { reorder(site, orig.chapter, []); reorder(site, next.chapter, []); }
    }, { files: regen });
    s.close('saved');
    toast(`Saved${regen ? ' — fresh copy made from the original' : ''}${notes.length ? ` (${notes.join('; ')})` : ''}.`, { type: 'success' });
  }
  return s.result;
}

const normGrade = (g) => ({ strength: Number.isFinite(g && g.strength) ? g.strength : null, warmth: (g && g.warmth) || 0, exposure: (g && g.exposure) || 0 });

function aspect(ratio) {
  const r = intRatio(ratio);
  return `${r.w} / ${r.h}`;
}
