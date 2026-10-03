/**
 * MESSAGES — a friendly, grouped editor for data/messages.json (docs §4).
 *
 * Every chapter group shows the words the film can use (missing keys simply use the
 * film's built-in wording until typed), then any other keys already in the file —
 * unknown keys are always kept. Editors: short text, long text, lists, pairs, objects.
 */
import { FILM_CHAPTERS, daysAlive } from '../../assets/js/shared/model.js';
import { state, change } from '../state.js';
import { getAt, setAt, deleteAt, deepEqual, clone } from '../util.js';
import { h, icon, autoGrow, toast, nextId } from '../ui.js';
import { sectionHead } from './common.js';

const S = (label, hint) => ({ type: 'string', label, hint });
const T = (label, hint) => ({ type: 'text', label, hint });
const L = (label, hint, add = 'Add a line', long = false) => ({ type: 'list', label, hint, add, long });

export const SCHEMA = {
  invite: { title: 'Invitation', desc: 'The very first screen.', fields: { greeting: S('Greeting', 'The first words she sees, e.g. “Hey {nick1}.”'), lines: L('Lines', 'Shown one after another.'), button: S('Button'), foot: S('Small print at the bottom') } },
  gate: { title: 'Countdown', desc: 'Before the unlock time.', fields: { kicker: S('Small title'), title: S('Title'), sub: S('Line under the title'), openKicker: S('When it unlocks — small title'), openTitle: S('When it unlocks — title'), openSub: S('When it unlocks — line'), button: S('Button') } },
  prologue: { title: 'Prologue', desc: 'Once upon a time…', fields: { kicker: S('Small title'), title: S('Title'), lines: L('Narration', 'One line at a time.'), titleSub: S('Line under the title'), date: S('Date line') } },
  tower: { title: 'Chapter · The tower', fields: { kicker: S('Small title'), title: S('Title'), lines: L('Narration'), windowLine: S('Line at the tower window'), hint: S('Hint') } },
  hair: { title: 'Chapter · The golden thread', fields: { kicker: S('Small title'), title: S('Title'), lines: L('Narration'), heroHairLine: T('Line for the hero-hair moment', 'Shown with the photo marked “Hero-hair”.'), endLine: S('Closing line') } },
  names: { title: 'Chapter · Her names', desc: 'The funny one.', fields: { kicker: S('Small title'), title: S('Title'), documentary: L('Documentary narrator', 'The fake-serious narrator, line by line.'), items: { type: 'objects', label: 'Her names', hint: 'One card per name, in order (matches the Names photos).', add: 'Add a name', item: { name: S('Name'), line: S('Line'), sub: S('Small line underneath') } }, aka: S('“Also known as” line'), finale: S('Closing line') } },
  dance: { title: 'Chapter · The festival', fields: { kicker: S('Small title'), title: S('Title'), lines: L('Narration'), hint: S('Hint') } },
  lanterns: { title: 'Chapter · The night of lanterns', fields: { kicker: S('Small title'), title: S('Title'), lines: L('Narration'), tapHint: S('Hint: tap to send a lantern'), photoHint: S('Hint: tap a photo lantern'), after: S('Line after the lanterns'), secret: S('Secret message') } },
  letter: { title: 'The letter', desc: 'Your letter to her.', fields: { kicker: S('Small title'), title: S('Title'), salutation: S('Greeting (“My dearest …”)'), body: L('Paragraphs', 'Each box is one paragraph.', 'Add a paragraph', true), signoff: S('Sign-off'), tapSeal: S('Hint: tap the seal'), fasterHint: S('Hint: reading faster') } },
  cake: { title: 'Twenty candles', fields: { kicker: S('Small title'), title: S('Title'), lines: L('Narration'), blowHint: S('Hint: blow out the candles'), tapFallback: S('Hint: or tap instead'), afterBlow: S('After the wish'), cutHint: S('Hint: cut the cake'), afterCut: S('After the cake is cut'), wish: S('The wish line') } },
  constellation: { title: 'Finale · the constellation', fields: { kicker: S('Small title'), title: S('Title'), lines: L('Narration'), handwritten: T('Handwritten note') } },
  birthday: { title: 'Finale · 7,305 days', desc: 'The big count and the last lantern.', fields: { years: S('Years line'), months: S('Months line'), days: S('Days line'), somehow: S('“Somehow…” line'), interesting: S('“Interesting…” line'), lanterns: L('Lantern lines'), big: S('Big headline'), name: S('Name line'), loved: L('Things she is loved for', '', 'Add one'), closing: T('Closing line') } },
  hug: { title: 'The hug', fields: { lines: L('Lines'), holdHint: S('Hint: press and hold'), done: L('After the hug'), message: T('WhatsApp hug message', 'Sent to your number (Settings → WhatsApp).') } },
  credits: { title: 'Credits', fields: { opening: S('Opening line'), roles: { type: 'pairs', label: 'Credits', hint: 'Role → name, like film credits.', labels: ['Role', 'Name'], add: 'Add a credit' }, end: S('Last line'), endSub: S('Line under the last line'), postCredits: L('Post-credits scene'), extrasTitle: S('Extra memories — title'), extrasSub: S('Extra memories — subtitle'), secrets: S('Secrets-found line') } },
  gallery: { title: 'Photo gallery', fields: { allTitle: S('Gallery title'), allKicker: S('Gallery small title') } },
};

const ORDER = ['invite', 'gate', 'prologue', 'tower', 'hair', 'names', 'dance', 'lanterns', 'letter', 'cake', 'constellation', 'birthday', 'hug', 'credits', 'gallery'];
const TOKENS = ['name', 'nick1', 'nick2', 'creator', 'photoCount', 'days', 'age'];
const open = new Set(['invite']);

export function humanize(key) {
  if (typeof key === 'number') return `#${key + 1}`;
  const s = String(key).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const isPair = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function tokenValues() {
  const site = state.site;
  const nick = site.her.nicknames || [];
  const real = (site.photos || []).filter((p) => p.src && p.enabled !== false).length;
  const unlock = site.settings?.lock?.unlockAt;
  return {
    name: site.her.name || '',
    nick1: nick[1] || nick[0] || site.her.name || '',
    nick2: nick[2] || nick[1] || site.her.name || '',
    creator: site.from.name || '',
    photoCount: String(real || (site.photos || []).length),
    days: daysAlive(site).toLocaleString('en-IN'),
    age: String(new Date(unlock || Date.now()).getFullYear() - Number(String(site.her.birthDate || '2007').slice(0, 4))),
  };
}

export function renderMessages() {
  const text = state.site.text || (state.site.text = {});
  const vals = tokenValues();
  const tokens = h('section.panel.tokens',
    h('p.tokens-title', icon('sparkle'), 'Tokens you can use: ', h('code', '{name} {nick1} {nick2} {creator} {photoCount} {days} {age}')),
    h('p.field-hint', 'Type them anywhere — the film swaps in the real value. Tap one to copy it.'),
    h('div.token-list', TOKENS.map((t) => h('button.token', {
      type: 'button', title: `Copy {${t}}`,
      onclick: async () => { try { await navigator.clipboard.writeText(`{${t}}`); toast(`Copied {${t}}`); } catch { toast(`{${t}} → ${vals[t]}`); } },
    }, h('code', `{${t}}`), h('span', vals[t] || '—')))));

  const groups = [...ORDER];
  for (const k of Object.keys(text)) if (!groups.includes(k)) groups.push(k);
  const list = h('div.msg-groups', groups.map((g) => groupEl(g)));
  return h('div.messages',
    sectionHead('Messages', 'Every word she reads', 'Grouped by chapter, in story order. Empty boxes use the film’s own wording. Changes save to your draft as you type.',
      h('div.head-actions',
        h('button.btn.sm.ghost', { type: 'button', onclick: () => { for (const g of groups) open.add(g); for (const d of list.querySelectorAll('details.group')) d.open = true; } }, 'Open all'),
        h('button.btn.sm.quiet', { type: 'button', onclick: () => { open.clear(); for (const d of list.querySelectorAll('details.group')) d.open = false; } }, 'Close all'))),
    tokens, list);
}

function groupTitle(g) {
  if (SCHEMA[g]) return SCHEMA[g].title;
  const fc = FILM_CHAPTERS.find((c) => c.id === g);
  return fc ? fc.label : `${humanize(g)} (extra)`;
}

function groupEl(g) {
  const schema = SCHEMA[g];
  const body = h('div.group-body');
  const changedDot = h('span.changed-dot', { title: 'Changed (not published yet)' });
  const d = h('details.group', { open: open.has(g), dataset: { group: g } },
    h('summary.group-head',
      h('span.group-titles', h('span.group-title', groupTitle(g), changedDot), h('span.group-sub', summaryOf(g))),
      h('span.group-chev', icon('down'))),
    body);
  const sync = () => d.classList.toggle('is-changed', !deepEqual(getAt(state.site, ['text', g]), getAt(state.base, ['text', g])));
  d.addEventListener('toggle', () => {
    if (d.open) { open.add(g); if (!body.childElementCount) fill(); } else open.delete(g);
  });
  function fill() {
    const val = getAt(state.site, ['text', g]);
    if (schema && schema.desc) body.append(h('p.group-desc', schema.desc));
    const known = schema ? Object.keys(schema.fields) : [];
    for (const k of known) body.append(fieldFor(['text', g, k], schema.fields[k], k, sync));
    if (isObj(val)) {
      const extra = Object.keys(val).filter((k) => !known.includes(k));
      if (extra.length && schema) body.append(h('h4.sub-head', 'More words in this group'));
      for (const k of extra) body.append(genericField(['text', g, k], val[k], k, sync));
    } else if (val !== undefined && !schema) {
      body.append(genericField(['text', g], val, g, sync));
    }
  }
  if (d.open) fill();
  sync();
  return d;
}

function summaryOf(g) {
  const v = getAt(state.site, ['text', g]);
  if (!isObj(v)) return SCHEMA[g]?.desc || '';
  const t = v.title || v.greeting || v.big || v.salutation || (Array.isArray(v.lines) && typeof v.lines[0] === 'string' ? v.lines[0] : '');
  return typeof t === 'string' && t ? t : SCHEMA[g]?.desc || '';
}

/* ---------------------------------------------------------------- field editors */
function markChanged(path, el) {
  el.classList.toggle('is-changed', !deepEqual(getAt(state.site, path), getAt(state.base, path)));
}

function commit(path, value, { prune = true } = {}) {
  change((site) => {
    const existed = getAt(state.base, path) !== undefined;
    if (prune && !existed && (value === '' || (Array.isArray(value) && !value.length))) deleteAt(site, path);
    else setAt(site, path, value);
  }, { render: false });
}

function fieldFor(path, spec, key, onAny) {
  if (spec.type === 'string' || spec.type === 'text') return stringField(path, spec.label, { long: spec.type === 'text', hint: spec.hint, onAny });
  if (spec.type === 'list') return listField(path, spec, onAny);
  if (spec.type === 'pairs') return pairsField(path, spec, onAny);
  if (spec.type === 'objects') return objectsField(path, spec, onAny);
  return genericField(path, getAt(state.site, path), key, onAny);
}

function stringField(path, label, { long = null, hint = '', onAny = () => {}, placeholder } = {}) {
  const value = getAt(state.site, path) ?? '';
  const isLong = long ?? (String(value).length > 70 || String(value).includes('\n'));
  const id = nextId('m');
  const ph = placeholder ?? (getAt(state.base, path) === undefined ? 'Uses the film’s own words' : '');
  const control = isLong
    ? autoGrow(h('textarea.input', { id, rows: '2', value: String(value), placeholder: ph }))
    : h('input.input', { id, type: 'text', value: String(value), placeholder: ph });
  const wrap = h('div.field');
  const reset = h('button.link-btn.reset', {
    type: 'button', title: 'Undo this change',
    onclick: () => {
      const was = getAt(state.base, path);
      control.value = was ?? '';
      commit(path, was ?? '');
      markChanged(path, wrap);
      onAny();
    },
  }, icon('undo'), 'Undo');
  wrap.append(h('div.field-top', h('label.field-label', { for: id }, label), h('span.changed-dot', { title: 'Changed (not published yet)' }), reset), control, hint ? h('p.field-hint', hint) : null);
  control.addEventListener('input', () => { commit(path, control.value); markChanged(path, wrap); onAny(); });
  markChanged(path, wrap);
  return wrap;
}

function rowTools(n, i, { move, remove, label }) {
  return h('div.row-tools',
    h('button.icon-btn.sm', { type: 'button', 'aria-label': `Move ${label} ${i + 1} up`, disabled: i === 0, onclick: () => move(i, -1) }, icon('up')),
    h('button.icon-btn.sm', { type: 'button', 'aria-label': `Move ${label} ${i + 1} down`, disabled: i === n - 1, onclick: () => move(i, 1) }, icon('down')),
    h('button.icon-btn.sm.danger', { type: 'button', 'aria-label': `Remove ${label} ${i + 1}`, onclick: () => remove(i) }, icon('trash')));
}

/**
 * Shared plumbing for list / pairs / objects editors. Every structural change rebuilds the
 * editor; `focus(fresh)` then puts the keyboard focus back on the matching control INSIDE the
 * rebuilt editor (never on a same-named field of another group).
 */
function arrayShell(path, label, hint, onAny, build) {
  const wrap = h('div.array-field');
  const rerender = (focus) => {
    const fresh = build();
    wrap.replaceWith(fresh);
    onAny();
    if (focus) requestAnimationFrame(() => { const el = focus(fresh); if (el) el.focus(); });
    return fresh;
  };
  const arr = () => getAt(state.site, path) || [];
  const write = (a) => commit(path, a);
  const rows = (fresh) => [...fresh.querySelectorAll(':scope > .str-list > li.str-row, :scope > .pair-list > .pair-row, :scope > .obj-list > .obj-card')];
  const move = (i, d) => {
    const a = clone(arr()); const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    write(a);
    rerender((fresh) => {
      const row = rows(fresh)[j];
      const btn = row && row.querySelectorAll('.row-tools .icon-btn')[d < 0 ? 0 : 1];
      return btn && !btn.disabled ? btn : row && row.querySelector('textarea, input');
    });
  };
  const remove = (i) => {
    const a = clone(arr());
    a.splice(i, 1);
    write(a);
    rerender((fresh) => { const r = rows(fresh); const row = r[Math.min(i, r.length - 1)]; return (row && row.querySelector('textarea, input')) || fresh.querySelector('.add-btn'); });
  };
  const changed = !deepEqual(getAt(state.site, path), getAt(state.base, path));
  wrap.append(h('div.field-top', h('span.field-label', label), changed ? h('span.changed-dot.on', { title: 'Changed' }) : null));
  if (hint) wrap.append(h('p.field-hint', hint));
  return { wrap, arr, write, move, remove, rerender };
}

function listField(path, spec, onAny) {
  const build = () => {
    const { wrap, arr, write, move, remove, rerender } = arrayShell(path, spec.label, spec.hint, onAny, build);
    const items = arr();
    const list = h('ol.str-list');
    items.forEach((v, i) => {
      const ta = autoGrow(h('textarea.input', { rows: spec.long ? '3' : '1', value: typeof v === 'string' ? v : JSON.stringify(v), 'aria-label': `${spec.label} ${i + 1}` }));
      ta.addEventListener('input', () => { const a = clone(arr()); a[i] = ta.value; write(a); onAny(); });
      list.append(h('li.str-row', h('span.row-num', { 'aria-hidden': 'true' }, String(i + 1)), ta, rowTools(items.length, i, { move, remove, label: 'line' })));
    });
    if (!items.length) list.append(h('li.str-empty', getAt(state.base, path) === undefined ? 'Empty — the film uses its own lines.' : 'No lines.'));
    wrap.append(list, h('button.btn.quiet.sm.add-btn', { type: 'button', onclick: () => { write([...arr(), '']); rerender((fresh) => { const r = fresh.querySelectorAll(':scope > .str-list textarea'); return r[r.length - 1]; }); } }, icon('plus'), spec.add || 'Add a line'));
    return wrap;
  };
  return build();
}

function pairsField(path, spec, onAny) {
  const [la, lb] = spec.labels || ['Left', 'Right'];
  const build = () => {
    const { wrap, arr, write, move, remove, rerender } = arrayShell(path, spec.label, spec.hint, onAny, build);
    const items = arr();
    const list = h('div.pair-list');
    items.forEach((pair, i) => {
      const a = h('input.input', { type: 'text', value: pair[0] ?? '', placeholder: la, 'aria-label': `${la} ${i + 1}` });
      const b = h('input.input', { type: 'text', value: pair[1] ?? '', placeholder: lb, 'aria-label': `${lb} ${i + 1}` });
      const up = () => { const x = clone(arr()); x[i] = [a.value, b.value]; write(x); onAny(); };
      a.addEventListener('input', up);
      b.addEventListener('input', up);
      list.append(h('div.pair-row', h('div.pair-inputs', a, b), rowTools(items.length, i, { move, remove, label: 'row' })));
    });
    wrap.append(list, h('button.btn.quiet.sm.add-btn', { type: 'button', onclick: () => { write([...arr(), ['', '']]); rerender((fresh) => { const r = fresh.querySelectorAll(':scope > .pair-list .pair-row'); return r.length ? r[r.length - 1].querySelector('input') : null; }); } }, icon('plus'), spec.add || 'Add a row'));
    return wrap;
  };
  return build();
}

function objectsField(path, spec, onAny) {
  const build = () => {
    const { wrap, arr, write, move, remove, rerender } = arrayShell(path, spec.label, spec.hint, onAny, build);
    const items = arr();
    const list = h('div.obj-list');
    items.forEach((obj, i) => {
      const card = h('div.obj-card', h('div.obj-head', h('span.obj-title', `${spec.label.replace(/s$/, '')} ${i + 1}`), rowTools(items.length, i, { move, remove, label: 'item' })));
      const keys = [...Object.keys(spec.item || {})];
      for (const k of Object.keys(obj || {})) if (!keys.includes(k)) keys.push(k);
      for (const k of keys) {
        const sub = spec.item && spec.item[k];
        if (!sub || sub.type === 'string' || sub.type === 'text') card.append(stringField([...path, i, k], sub ? sub.label : humanize(k), { long: sub ? sub.type === 'text' : null, onAny, placeholder: '' }));
        else card.append(genericField([...path, i, k], obj[k], k, onAny));
      }
      list.append(card);
    });
    wrap.append(list, h('button.btn.quiet.sm.add-btn', {
      type: 'button',
      onclick: () => {
        const a = clone(arr());
        const tmpl = a[a.length - 1] || Object.fromEntries(Object.keys(spec.item || {}).map((k) => [k, '']));
        const blank = (v) => (typeof v === 'string' ? '' : Array.isArray(v) ? [] : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)])) : v);
        a.push(blank(tmpl));
        write(a);
        rerender((fresh) => { const r = fresh.querySelectorAll(':scope > .obj-list > .obj-card'); return r.length ? r[r.length - 1].querySelector('input, textarea') : null; });
      },
    }, icon('plus'), spec.add || 'Add one more'));
    return wrap;
  };
  return build();
}

/** Any value of unknown shape: string / number / boolean / list / pairs / objects / nested object. */
function genericField(path, value, key, onAny) {
  if (typeof value === 'string' || value === null) return stringField(path, humanize(key), { onAny, placeholder: '' });
  if (typeof value === 'number') {
    const id = nextId('m');
    const input = h('input.input', { id, type: 'number', value: String(value) });
    input.addEventListener('input', () => { const n = Number(input.value); if (Number.isFinite(n)) { commit(path, n, { prune: false }); onAny(); } });
    return h('div.field', h('label.field-label', { for: id }, humanize(key)), input);
  }
  if (typeof value === 'boolean') {
    const id = nextId('m');
    const input = h('input', { id, type: 'checkbox', checked: value });
    input.addEventListener('change', () => { commit(path, input.checked, { prune: false }); onAny(); });
    return h('label.check', { for: id }, input, h('span', humanize(key)));
  }
  if (Array.isArray(value)) {
    if (value.length && value.every(isPair)) return pairsField(path, { label: humanize(key), labels: ['Left', 'Right'] }, onAny);
    if (value.length && value.every(isObj)) {
      const keys = [...new Set(value.flatMap((o) => Object.keys(o)))];
      return objectsField(path, { label: humanize(key), item: Object.fromEntries(keys.map((k) => [k, typeof value[0][k] === 'string' ? { type: 'string', label: humanize(k) } : { type: 'other' }])) }, onAny);
    }
    if (value.every((x) => typeof x === 'string')) return listField(path, { label: humanize(key) }, onAny);
    const box = h('div.array-field', h('span.field-label', humanize(key)));
    value.forEach((v, i) => box.append(genericField([...path, i], v, `${humanize(key)} ${i + 1}`, onAny)));
    return box;
  }
  if (isObj(value)) {
    const box = h('fieldset.nested', h('legend', humanize(key)));
    for (const k of Object.keys(value)) box.append(genericField([...path, k], value[k], k, onAny));
    return box;
  }
  return h('p.field-hint', `${humanize(key)}: (kept as is)`);
}
