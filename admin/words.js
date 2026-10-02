/**
 * words.js — generic form renderer for site.text (+ names and photo captions).
 *
 * Walks the `text` object recursively:
 *   string            → input (textarea when long)
 *   string[]          → list of textareas with add / remove
 *   [a, b][]          → paired inputs with add / remove
 *   object[]          → grouped fields per item with add / remove
 *   object            → nested fieldset
 * Unknown keys are kept and rendered with a humanised label. Edits mutate the draft
 * site in place and call onChange(); add/remove re-render the affected group.
 */
import { h, icon, autoGrow } from './ui.js';
import { TEXT_GROUPS, CHAPTERS, getAt, setAt, deepEqual, clone } from './model.js';

const LABELS = {
  greeting: 'Greeting',
  lines: 'Lines (shown one after another)',
  button: 'Button text',
  titleSub: 'Subtitle under the title',
  title: 'Title',
  kicker: 'Small label above the title',
  items: 'Names',
  name: 'Name',
  line: 'Line',
  sub: 'Small line underneath',
  tapHint: 'Hint: tap to send a lantern',
  after: 'Line after the lanterns',
  blowHint: 'Hint: blow out the candles',
  tapFallback: 'Hint: or tap instead',
  afterBlow: 'After the wish',
  cutHint: 'Hint: cut the cake',
  afterCut: 'After the cake is cut',
  salutation: 'Greeting (“My dearest …”)',
  body: 'Letter paragraphs',
  signoff: 'Sign-off',
  big: 'Big headline',
  hugLine: 'Line before the hug button',
  hugButton: 'Hug button text',
  hugMessage: 'WhatsApp hug message (sent to you)',
  hugDone: 'After the hug is sent',
  end: 'Last line',
  endSub: 'Line under the last line',
  extrasTitle: 'Extra memories — title',
  extrasSub: 'Extra memories — subtitle',
};
const ADD_LABELS = { lines: 'Add a line', body: 'Add a paragraph', items: 'Add a name' };
const PAIR_LABELS = { credits: ['Role', 'Credit'] };

export function humanize(key) {
  if (typeof key === 'number') return `#${key + 1}`;
  if (LABELS[key]) return LABELS[key];
  const s = String(key).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const isPair = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {{ getSite: () => object, getBase: () => object, onChange: (opts?) => void }} ctx
 * @returns {HTMLElement}
 */
export function renderWords(ctx) {
  const site = ctx.getSite();
  const root = h('div.words');

  root.append(h('p.lede', 'Every word in the film lives here. Changes save automatically as a draft — use ',
    h('b', 'Preview'), ' to see them in place, then ', h('b', 'Publish'), '.'));

  // Names
  root.append(group('names-group', 'Names', 'Who the film is for, and who it’s from', true, (body) => {
    body.append(
      stringField(ctx, ['her', 'name'], 'Her name'),
      stringField(ctx, ['from', 'name'], 'Your name (as it appears in the film)'),
      stringField(ctx, ['from', 'signoff'], 'Your sign-off'),
    );
  }));

  // text groups (known order first, then unknown keys)
  const text = site.text || {};
  const keys = Object.keys(TEXT_GROUPS).filter((k) => k in text);
  for (const k of Object.keys(text)) if (!keys.includes(k)) keys.push(k);
  for (const k of keys) {
    const title = TEXT_GROUPS[k] || humanize(k);
    root.append(group(`g-${k}`, title, summaryOf(text[k]), false, (body) => {
      renderValue(ctx, body, ['text', k], text[k], k, 0);
    }));
  }

  // captions
  root.append(group('captions', 'Captions', 'Handwritten notes under the photos (the golden-hair polaroids show them)', false, (body) => {
    const slots = site.slots || [];
    const order = ['hair', ...new Set(slots.map((s) => s.chapter).filter((c) => c !== 'hair'))];
    for (const ch of order) {
      const list = slots.filter((s) => s.chapter === ch);
      if (!list.length) continue;
      body.append(h('h4.sub-head', CHAPTERS[ch] || humanize(ch)));
      for (const s of list) {
        const idx = slots.indexOf(s);
        body.append(stringField(ctx, ['slots', idx, 'caption'], s.label, { placeholder: 'No caption' }));
      }
    }
  }));
  return root;
}

function summaryOf(v) {
  if (isObj(v)) {
    const t = v.title || v.greeting || v.big || v.salutation || (Array.isArray(v.lines) && typeof v.lines[0] === 'string' ? v.lines[0] : '');
    return typeof t === 'string' ? t : '';
  }
  return '';
}

function group(id, title, sub, open, fill) {
  const body = h('div.group-body');
  const d = h('details.group', { id, open },
    h('summary.group-head',
      h('span.group-titles', h('span.group-title', title), sub ? h('span.group-sub', sub) : null),
      h('span.group-chev', icon('down')),
    ),
    body,
  );
  fill(body);
  return d;
}

function markChanged(ctx, path, el) {
  const now = getAt(ctx.getSite(), path);
  const was = getAt(ctx.getBase(), path);
  el.classList.toggle('is-changed', !deepEqual(now, was));
}

function stringField(ctx, path, label, { placeholder = '', long = null } = {}) {
  const value = getAt(ctx.getSite(), path) ?? '';
  const isLong = long ?? (String(value).length > 60 || String(value).includes('\n'));
  const id = 'f-' + path.join('-').replace(/[^a-z0-9-]/gi, '_');
  const control = isLong
    ? autoGrow(h('textarea.input', { id, rows: '2', value: String(value), placeholder }))
    : h('input.input', { id, type: 'text', value: String(value), placeholder });
  const wrap = h('div.field');
  const reset = h('button.link-btn.reset', {
    type: 'button', title: 'Undo this change',
    onclick: () => {
      const was = getAt(ctx.getBase(), path);
      setAt(ctx.getSite(), path, was ?? '');
      control.value = was ?? '';
      control.dispatchEvent(new Event('input'));
    },
  }, icon('undo'), 'Undo');
  wrap.append(h('div.field-top', h('label.field-label', { for: id }, label), h('span.changed-dot', { title: 'Changed (not published yet)' }), reset), control);
  control.addEventListener('input', () => {
    setAt(ctx.getSite(), path, control.value);
    markChanged(ctx, path, wrap);
    ctx.onChange({ quiet: true });
  });
  markChanged(ctx, path, wrap);
  return wrap;
}

function renderValue(ctx, container, path, value, key, depth) {
  if (typeof value === 'string') {
    container.append(stringField(ctx, path, humanize(key)));
  } else if (typeof value === 'number') {
    const wrap = h('div.field', h('label.field-label', humanize(key)));
    const input = h('input.input', { type: 'number', value: String(value) });
    input.addEventListener('input', () => { const n = Number(input.value); if (Number.isFinite(n)) { setAt(ctx.getSite(), path, n); ctx.onChange({ quiet: true }); } });
    wrap.append(input);
    container.append(wrap);
  } else if (typeof value === 'boolean') {
    const input = h('input', { type: 'checkbox', checked: value });
    input.addEventListener('change', () => { setAt(ctx.getSite(), path, input.checked); ctx.onChange({ quiet: true }); });
    container.append(h('label.check', input, h('span', humanize(key))));
  } else if (Array.isArray(value)) {
    container.append(renderArray(ctx, path, value, key, depth));
  } else if (isObj(value)) {
    const box = depth === 0 ? container : h('fieldset.nested', h('legend', humanize(key)));
    for (const k of Object.keys(value)) renderValue(ctx, box, [...path, k], value[k], k, depth + 1);
    if (box !== container) container.append(box);
  } else if (value === null) {
    container.append(stringField(ctx, path, humanize(key), { placeholder: '(empty)' }));
  }
}

function renderArray(ctx, path, arr, key, depth) {
  const wrap = h('div.array-field');
  const rerender = () => {
    const fresh = renderArray(ctx, path, getAt(ctx.getSite(), path), key, depth);
    wrap.replaceWith(fresh);
  };
  const kind = arr.length === 0 ? 'strings'
    : arr.every((x) => typeof x === 'string') ? 'strings'
      : arr.every(isPair) ? 'pairs'
        : arr.every(isObj) ? 'objects' : 'mixed';
  const changed = !deepEqual(getAt(ctx.getSite(), path), getAt(ctx.getBase(), path));
  wrap.append(h('div.field-top', h('span.field-label', humanize(key)), changed ? h('span.changed-dot.on', { title: 'Changed' }) : null));

  const remove = (i) => {
    const a = getAt(ctx.getSite(), path);
    a.splice(i, 1);
    ctx.onChange({ quiet: true });
    rerender();
  };
  const move = (i, d) => {
    const a = getAt(ctx.getSite(), path);
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    ctx.onChange({ quiet: true });
    rerender();
  };
  const rowTools = (i, n) => h('div.row-tools',
    h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, icon('up')),
    h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Move down', disabled: i === n - 1, onclick: () => move(i, 1) }, icon('down')),
    h('button.icon-btn.sm.danger', { type: 'button', 'aria-label': 'Remove', onclick: () => remove(i) }, icon('trash')),
  );

  if (kind === 'strings') {
    const list = h('ol.str-list');
    arr.forEach((v, i) => {
      const ta = autoGrow(h('textarea.input', { rows: '1', value: v, 'aria-label': `${humanize(key)} ${i + 1}` }));
      ta.addEventListener('input', () => { setAt(ctx.getSite(), [...path, i], ta.value); ctx.onChange({ quiet: true }); });
      list.append(h('li.str-row', h('span.row-num', String(i + 1)), ta, rowTools(i, arr.length)));
    });
    wrap.append(list, h('button.btn.quiet.sm.add-btn', {
      type: 'button',
      onclick: () => { getAt(ctx.getSite(), path).push(''); ctx.onChange({ quiet: true }); rerender(); },
    }, icon('plus'), ADD_LABELS[key] || 'Add a line'));
  } else if (kind === 'pairs') {
    const [la, lb] = PAIR_LABELS[path[1]] || ['Left', 'Right'];
    const list = h('div.pair-list');
    arr.forEach((pair, i) => {
      const a = h('input.input', { type: 'text', value: pair[0], placeholder: la, 'aria-label': `${la} ${i + 1}` });
      const b = h('input.input', { type: 'text', value: pair[1], placeholder: lb, 'aria-label': `${lb} ${i + 1}` });
      a.addEventListener('input', () => { setAt(ctx.getSite(), [...path, i, 0], a.value); ctx.onChange({ quiet: true }); });
      b.addEventListener('input', () => { setAt(ctx.getSite(), [...path, i, 1], b.value); ctx.onChange({ quiet: true }); });
      list.append(h('div.pair-row', h('div.pair-inputs', a, b), rowTools(i, arr.length)));
    });
    wrap.append(list, h('button.btn.quiet.sm.add-btn', {
      type: 'button',
      onclick: () => { getAt(ctx.getSite(), path).push(['', '']); ctx.onChange({ quiet: true }); rerender(); },
    }, icon('plus'), 'Add a row'));
  } else if (kind === 'objects') {
    const list = h('div.obj-list');
    arr.forEach((obj, i) => {
      const card = h('div.obj-card', h('div.obj-head', h('span.obj-title', `${humanize(key).replace(/s$/, '')} ${i + 1}`), rowTools(i, arr.length)));
      for (const k of Object.keys(obj)) renderValue(ctx, card, [...path, i, k], obj[k], k, depth + 2);
      list.append(card);
    });
    wrap.append(list, h('button.btn.quiet.sm.add-btn', {
      type: 'button',
      onclick: () => {
        const a = getAt(ctx.getSite(), path);
        const tmpl = clone(a[a.length - 1] || {});
        const blank = (v) => (typeof v === 'string' ? '' : Array.isArray(v) ? [] : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)])) : v);
        a.push(blank(tmpl));
        ctx.onChange({ quiet: true });
        rerender();
      },
    }, icon('plus'), ADD_LABELS[key] || 'Add one more'));
  } else {
    // mixed: render each item by type, keep everything
    arr.forEach((v, i) => renderValue(ctx, wrap, [...path, i], v, `${humanize(key)} ${i + 1}`, depth + 1));
  }
  return wrap;
}
