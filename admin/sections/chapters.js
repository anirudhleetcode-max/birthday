/**
 * CHAPTERS — the film's chapters in story order, with on/off switches (locked ones always
 * play), photo counts + missing warnings per photo chapter and quick per-chapter preview.
 */
import { FILM_CHAPTERS, PHOTO_CHAPTERS } from '../../assets/js/shared/model.js';
import { state, change } from '../state.js';
import { plural } from '../util.js';
import { h, icon } from '../ui.js';
import { openPreview } from '../photos.js';
import { counts } from './library.js';
import { sectionHead } from './common.js';

/** Which photo chapters a film chapter shows. */
export const USES = {
  prologue: ['prologue'], tower: ['tower'], hair: ['hair'], names: ['names'], dance: ['dance'], lanterns: ['lanterns'],
  letter: ['letter'], constellation: ['finale', 'album'], birthday: ['finale'], credits: ['album'],
};

const BLURB = {
  gate: 'The gentle countdown people see before the unlock time (Settings → Countdown lock).',
  invite: '“Hey Pinky.” — the invitation and the first tap that starts the sound.',
  prologue: 'Once upon a time… her very first photo.',
  tower: 'A tower whose walls are painted with her.',
  hair: 'The golden thread of memories, like polaroids on a ribbon.',
  names: 'Deepu, Pinky, Kuchi Puchi — a legend of many names (the funny one).',
  dance: 'The festival — a 3D carousel of happy photos.',
  lanterns: 'The night of lanterns, with her photos floating among them.',
  letter: 'Your letter, with photos pinned to it.',
  cake: 'Twenty candles — she blows them out.',
  video: 'Your video message.',
  constellation: 'Every little piece of her, gathered into the sky.',
  birthday: '7,305 days → the last lantern.',
  hug: 'One last thing — send a hug.',
  credits: 'Credits, the extra memories and a post-credits scene.',
};

export function renderChapters() {
  const site = state.site;
  const c = counts(site);
  const enabledMap = new Map((site.chapters || []).map((x) => [x.id, x.enabled !== false]));
  const rows = FILM_CHAPTERS.map((fc, i) => {
    const locked = fc.toggle === false;
    const on = locked || enabledMap.get(fc.id) !== false;
    const uses = USES[fc.id] || [];
    const warnings = [];
    const stats = uses.map((pc) => {
      const info = PHOTO_CHAPTERS.find((x) => x.id === pc);
      const k = c[pc];
      if (k.missing) warnings.push(`${info.short}: ${plural(k.missing, 'empty photo spot')} (a placeholder shows)`);
      else if (info.min && k.filled < info.min) warnings.push(`${info.short}: needs at least ${plural(info.min, 'photo')}`);
      return h('span.count-pill', { class: info.min && k.filled < info.min ? 'st-low' : info.recommended && k.filled < info.recommended ? 'st-under' : 'st-ok', title: info.label },
        icon('image'), `${info.short} ${k.filled}${info.recommended ? `/${info.recommended}` : ''}`);
    });
    if (fc.id === 'video' && !site.media.video) warnings.push('No video uploaded — this chapter is skipped (add one in Video).');
    if (fc.id === 'gate' && !site.settings.lock.enabled) warnings.push('The countdown lock is off — the film opens right away.');
    const id = `chap-${fc.id}`;
    const toggle = h('input', {
      type: 'checkbox', role: 'switch', id, checked: on, disabled: locked, 'data-testid': `chapter-${fc.id}`, dataset: { fk: `chap-${fc.id}` },
      'aria-describedby': `${id}-d`,
      onchange: (e) => change((s) => { const x = s.chapters.find((q) => q.id === fc.id); if (x) x.enabled = e.target.checked; }),
    });
    return h('li.chap-row', { class: on ? '' : 'is-off', dataset: { chapter: fc.id } },
      h('span.chap-num', { 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      h('div.chap-main',
        locked ? h('p.chap-title', fc.label, h('span.badge.locked', icon('lock'), 'Always on')) : h('label.chap-title', { for: id }, fc.label, h('span.sr-only', on ? ' (on)' : ' (off)')),
        h('p.chap-desc', { id: `${id}-d` }, BLURB[fc.id] || ''),
        stats.length ? h('div.chap-stats', stats) : null,
        warnings.length ? h('ul.chap-warn', warnings.map((w) => h('li', icon('warn'), w))) : null),
      h('div.chap-side',
        locked ? null : h('span.switch', toggle, h('span.switch-ui', { 'aria-hidden': 'true' })),
        fc.id !== 'gate' ? h('button.btn.sm.ghost', { type: 'button', onclick: () => openPreview(fc.id), 'aria-label': `Preview ${fc.label}` }, icon('eye'), h('span.hide-sm', 'Preview')) : null));
  });
  return h('div.chapters',
    sectionHead('Chapters', 'The story, in order',
      'Switch chapters off to skip them (the countdown, invitation and credits always play). Every chapter adapts to however many photos it has.'),
    h('ol.chap-list', rows));
}
