/**
 * AUDIO (background music + the voice note for the letter) and VIDEO (optional video
 * message + caption). Upload / replace / remove, preview players, size guards
 * (warn > 25 MB, block > 95 MB).
 */
import { state, change, stageFile, takenPath, srcFor, localBlob } from '../state.js';
import { uniquePath, stamp, formatBytes, MIME_EXT } from '../util.js';
import { h, icon, toast, confirmDialog, pickFiles, textField } from '../ui.js';
import { openPreview } from '../photos.js';
import { sectionHead, note } from './common.js';

const MB = 1024 * 1024;
export const MEDIA_WARN = 25 * MB;
export const MEDIA_BLOCK = 95 * MB;

export const MEDIA = {
  music: {
    title: 'Background music', icon: 'music', scene: 'invite',
    desc: 'Plays softly through the whole film (it ducks under voices and the video). MP3 or M4A works best.',
    accept: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.mp3,.m4a,.aac',
    exts: ['mp3', 'm4a', 'aac'], kind: 'audio',
    text: { key: 'musicTitle', label: 'Song title (optional, shown small in the credits)', placeholder: 'e.g. Our song' },
  },
  voice: {
    title: 'Voice note for the letter', icon: 'mic', optional: true, scene: 'letter',
    desc: 'A short voice message she can play while reading your letter. Record it on your phone and upload it here.',
    accept: 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus',
    exts: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm'], kind: 'audio',
  },
  video: {
    title: 'Video message', icon: 'video', optional: true, scene: 'video',
    desc: 'A video of you, played after the cake. MP4 plays everywhere (iPhone .mov files may not play on Android — export as MP4 if you can).',
    accept: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm',
    exts: ['mp4', 'mov', 'm4v', 'webm'], kind: 'video',
    text: { key: 'videoCaption', label: 'Caption under the video', placeholder: 'A little something I recorded for you' },
  },
};

export function renderAudio() {
  return h('div.media-section',
    sectionHead('Audio', 'Music & your voice', 'Big files make the film slow to open on phones — keep each one under 25 MB if you can.'),
    h('div.media-grid', mediaCard('music'), mediaCard('voice')));
}

export function renderVideo() {
  const ch = (state.site.chapters || []).find((c) => c.id === 'video');
  return h('div.media-section',
    sectionHead('Video', 'A message from you', 'Optional. The video chapter only plays when a video is uploaded.'),
    ch && ch.enabled === false ? note('The Video chapter is switched off in Chapters — the video won’t play until you switch it back on.', 'warn') : null,
    h('div.media-grid.single', mediaCard('video')));
}

function mediaCard(kind) {
  const cfg = MEDIA[kind];
  const m = state.site.media || {};
  const path = m[kind] || null;
  const bm = state.base.media || {};
  const isDraft = (bm[kind] || null) !== path || (cfg.text && (bm[cfg.text.key] || '') !== (m[cfg.text.key] || ''));
  const blob = localBlob(path);
  let player = null;
  if (path) {
    player = cfg.kind === 'video'
      ? h('video.media-player', { controls: true, playsinline: true, preload: 'metadata', src: srcFor(path), 'aria-label': cfg.title })
      : h('audio.media-player', { controls: true, preload: 'metadata', src: srcFor(path), 'aria-label': cfg.title });
  }
  const textField_ = cfg.text ? textField({
    label: cfg.text.label, value: m[cfg.text.key] || '', placeholder: cfg.text.placeholder, maxlength: 140,
    oninput: (v) => change((site) => { site.media[cfg.text.key] = v; }, { render: false }),
  }) : null;
  return h('article.panel.media-card', { class: isDraft ? 'is-draft' : '', dataset: { media: kind } },
    h('header.media-head', h('span.panel-icon', icon(cfg.icon)), h('div',
      h('h3.panel-title', cfg.title, cfg.optional ? h('span.opt', ' · optional') : null, isDraft ? h('span.badge.draft', 'Draft') : null),
      h('p.panel-hint', cfg.desc))),
    path
      ? h('div.media-current',
        h('p.media-file', icon('link'), h('span.media-name', path.split('/').pop()), blob ? h('span.muted', ` · ${formatBytes(blob.size)} · not published yet`) : null),
        player)
      : h('p.media-none', 'Nothing chosen yet.'),
    textField_,
    h('div.card-actions.wrap',
      h(`button.btn.sm.${path ? 'ghost' : 'gold-soft'}`, { type: 'button', 'data-testid': `media-${kind}-pick`, onclick: () => pickMedia(kind) }, icon('upload'), path ? 'Replace' : 'Choose file'),
      path ? h('button.btn.sm.quiet', { type: 'button', onclick: () => removeMedia(kind) }, icon('trash'), 'Remove') : null,
      isDraft ? h('button.btn.sm.quiet', { type: 'button', onclick: () => undoMedia(kind) }, icon('undo'), 'Undo') : null,
      path ? h('button.btn.sm.quiet', { type: 'button', onclick: () => openPreview(cfg.scene) }, icon('eye'), 'Preview in the film') : null));
}

export async function pickMedia(kind, file = null) {
  const cfg = MEDIA[kind];
  const f = file || (await pickFiles({ accept: cfg.accept }))[0];
  if (!f) return;
  if (f.size > MEDIA_BLOCK) {
    toast(`That file is ${formatBytes(f.size)} — too big to publish (the limit is 95 MB). Try a shorter clip or a compressed version.`, { type: 'error' });
    return;
  }
  if (f.size > MEDIA_WARN) {
    const ok = await confirmDialog({
      title: 'That’s a big file',
      message: `This file is ${formatBytes(f.size)}. Files over 25 MB take a long time to load on phones (and to publish). Use it anyway?`,
      confirm: 'Use it anyway', cancel: 'Choose another',
    });
    if (!ok) return;
  }
  const fromName = (f.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = cfg.exts.includes(fromName) ? fromName : (MIME_EXT[f.type] || fromName || (cfg.kind === 'video' ? 'mp4' : 'mp3'));
  const kindOk = cfg.kind === 'video' ? /^video\//.test(f.type) || cfg.exts.includes(fromName) : /^audio\//.test(f.type) || cfg.exts.includes(fromName);
  if (!kindOk) {
    toast(`That doesn’t look like ${cfg.kind === 'video' ? 'a video' : 'an audio file'}. Please choose ${cfg.exts.slice(0, 3).join(' / ').toUpperCase()}.`, { type: 'error' });
    return;
  }
  const path = uniquePath(`media/${kind}-${stamp()}.${ext}`, takenPath);
  stageFile(path, f);
  change((site) => { site.media[kind] = path; }, { files: true });
  toast(`${cfg.title} added to your draft.`, { type: 'success' });
}

function removeMedia(kind) {
  const prev = state.site.media[kind];
  const blob = localBlob(prev);
  change((site) => { site.media[kind] = null; });
  toast(`${MEDIA[kind].title} removed.`, { action: { label: 'Undo', run: () => { if (blob) stageFile(prev, blob); change((site) => { site.media[kind] = prev; }, { files: true }); } } });
}

function undoMedia(kind) {
  const cfg = MEDIA[kind];
  const bm = state.base.media || {};
  change((site) => {
    site.media[kind] = bm[kind] ?? null;
    if (cfg.text) site.media[cfg.text.key] = bm[cfg.text.key] ?? '';
  });
}
