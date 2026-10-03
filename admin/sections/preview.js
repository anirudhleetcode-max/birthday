/**
 * PREVIEW — open the film with the draft (whole film or one chapter), or the published
 * version, each in a new tab; see what's waiting to be published and the validation checks.
 *   Preview draft      ../index.html?preview&draft   (this device's unpublished changes)
 *   Preview published  ../index.html?preview         (what is live right now)
 */
import { FILM_CHAPTERS } from '../../assets/js/shared/model.js';
import { state, changes, flushSave, hasUnsavedDraft, liveUrl } from '../state.js';
import { plural, timeAgo } from '../util.js';
import { h, icon, toast } from '../ui.js';
import { openPreview } from '../photos.js';
import { checksPanel, changeList, publishFlow } from '../publish.js';
import { sectionHead, panel } from './common.js';

export function renderPreview() {
  const ch = changes();
  const live = liveUrl();
  const enabled = new Map((state.site.chapters || []).map((c) => [c.id, c.enabled !== false]));
  const list = FILM_CHAPTERS.filter((c) => c.id !== 'gate').map((c) => h('li',
    h('button.chip-link', { type: 'button', disabled: enabled.get(c.id) === false, title: enabled.get(c.id) === false ? 'Switched off in Chapters' : null, onclick: () => openPreview(c.id) },
      icon('play'), h('span', c.label))));
  const saved = state.savedAt ? `Draft saved on this device ${timeAgo(state.savedAt)}.` : 'Your draft is saved on this device as you work.';
  return h('div.preview',
    sectionHead('Preview', 'See it exactly as she will', 'Watch your draft — new photos, words and music included — or what’s live right now. Nobody else can see your draft.'),
    h('div.preview-grid',
      panel('Watch the film', { icon: 'film' },
        h('div.preview-hero',
          h('button.btn.gold.lg', { type: 'button', 'data-testid': 'preview-draft', onclick: () => openPreview(null) }, icon('play'), 'Preview draft'),
          h('button.btn.ghost', { type: 'button', 'data-testid': 'preview-published', onclick: () => openPreview(null, { draft: false }) }, icon('eye'), 'Preview published')),
        h('p.preview-diff', h('b', 'Draft'), ' is the film with your unpublished changes from this device. ', h('b', 'Published'), ' is exactly what’s live on the site right now. Both open in a new tab and skip the countdown.'),
        h('p.field-hint', saved),
        h('h4.sub-head', 'Jump to a chapter (draft)'),
        h('ul.chip-links', list)),
      panel('Before you publish', { icon: 'check' },
        checksPanel(),
        h('h4.sub-head', ch.count ? `${plural(ch.count, 'change')} waiting to be published` : 'Nothing waiting — everything is live'),
        ch.count ? changeList(ch) : null,
        h('div.card-actions.wrap',
          h('button.btn.sm.ghost', { type: 'button', onclick: async () => { await flushSave(); toast(hasUnsavedDraft() ? 'Couldn’t save the draft.' : 'Draft saved on this device.', { type: 'success' }); } }, icon('save'), 'Save draft'),
          ch.count ? h('button.btn.sm.gold', { type: 'button', onclick: publishFlow }, icon('send'), 'Publish') : null,
          live ? h('a.btn.sm.quiet', { href: live, target: '_blank', rel: 'noopener' }, icon('external'), 'Open the live site') : null))));
}
