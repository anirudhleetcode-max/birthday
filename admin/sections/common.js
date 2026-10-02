/** Small building blocks shared by the sections. */
import { h, icon } from '../ui.js';

export function sectionHead(kicker, title, sub, actions = null) {
  return h('header.section-head',
    h('div.section-titles',
      kicker ? h('p.kicker', kicker) : null,
      h('h2.section-title', { tabindex: '-1' }, title),
      sub ? h('p.section-sub', sub) : null),
    actions);
}

export function panel(title, { hint = '', icon: ic = null, className = '', id = null } = {}, ...children) {
  return h(`section.panel${className ? `.${className}` : ''}`, { id },
    title ? h('header.panel-head', ic ? h('span.panel-icon', icon(ic)) : null, h('div', h('h3.panel-title', title), hint ? h('p.panel-hint', hint) : null)) : null,
    h('div.panel-body', children));
}

export function note(text, kind = 'info') {
  return h(`p.note.note-${kind}`, icon(kind === 'warn' ? 'warn' : 'info'), h('span', text));
}
