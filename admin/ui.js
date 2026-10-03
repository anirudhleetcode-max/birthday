/**
 * ui.js — minimal DOM helpers: h() element builder, icons, toasts (aria-live), sheets
 * (modal dialogs with focus trapping), menus, confirm/progress dialogs and labelled
 * form controls. No innerHTML with user content.
 */

let uid = 0;
export const nextId = (p = 'f') => `${p}-${++uid}`;

/**
 * h('button.btn.gold#id', { onclick, type: 'button', dataset: {...}, style: {...} }, 'text', child, …)
 */
export function h(tag, attrs, ...children) {
  let props = attrs;
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    props = {};
  }
  const m = /^([a-z0-9-]+)?((?:[.#][^.#]+)*)$/i.exec(tag);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][^.#]+/g) || []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') { for (const c of String(v).split(/\s+/)) if (c) el.classList.add(c); }
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // only for trusted, static markup (icons)
    else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'indeterminate') el[k] = v;
    else if (k in el && typeof v !== 'string' && typeof v !== 'number') el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Inline SVG icon (static, trusted markup). */
const P = {
  upload: '<path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  replace: '<path d="M20 11a8 8 0 0 0-14.9-3.9L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 3.9L20 15"/><path d="M20 20v-5h-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  send: '<path d="M4 12 20 4l-4 16-4-7-8-1z"/><path d="m12 13 8-9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  images: '<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><circle cx="12" cy="8" r="1.6"/><path d="m21 13-4-4-7 7"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  words: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  quote: '<path d="M7 7h4v5c0 3-1.5 5-4 5.5M15 7h4v5c0 3-1.5 5-4 5.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  lantern: '<path d="M9 3h6M10 3v2M14 3v2"/><path d="M7 7.5C7 6 8.5 5 12 5s5 1 5 2.5v8c0 1.5-1.5 2.5-5 2.5s-5-1-5-2.5z"/><path d="M10 18v2h4v-2"/><path d="M12 9.5c-1 1.2-1.4 2.2-.6 3.2.5.6 1.7.5 1.9-.4.2-.9-.4-1.8-1.3-2.8z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  wand: '<path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.7 1.3L21 13l-1.3.7L19 15l-.7-1.3L17 13l1.3-.7z"/>',
  grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  move: '<path d="M5 12h14M15 8l4 4-4 4"/><path d="M5 5v14"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.2-1-1.4-1-2.5 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
  save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  contain: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="7.5" y="8" width="9" height="8" rx="1"/>',
  cover: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18" opacity=".5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  hair: '<path d="M7 4c-2 5 1 7 0 11s1 5 3 5M12 3c-1.5 5 1.5 8 .5 12s.5 5 2 6M17 4c1 5-1 7 0 11s-1 5-2 6"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
};

export function icon(name, cls = 'icon') {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return span;
}

/* ---------------------------------------------------------------- focus */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary, audio[controls], video[controls]';

/** Keep Tab / Shift+Tab inside `root`. Returns an untrap function. */
export function trapFocus(root) {
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const all = [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!all.length) return;
    const first = all[0];
    const last = all[all.length - 1];
    if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}

/* ---------------------------------------------------------------- toasts */
let toastRoot = null;
export function toast(message, { type = 'info', action = null, duration } = {}) {
  if (!toastRoot) toastRoot = document.getElementById('toasts');
  const el = h(`div.toast.toast-${type}`, { role: type === 'error' ? 'alert' : 'status' },
    h('span.toast-dot', { 'aria-hidden': 'true' }),
    h('span.toast-msg', message),
  );
  if (action) {
    // "Undo" must always mean the latest action: retire older actionable toasts
    for (const old of toastRoot.querySelectorAll('.toast.has-action')) old.remove();
    el.classList.add('has-action');
    el.append(h('button.toast-action', {
      type: 'button',
      onclick: () => { dismiss(); action.run(); },
    }, action.label));
  }
  el.append(h('button.toast-close', { type: 'button', 'aria-label': 'Dismiss', onclick: () => dismiss() }, icon('close')));
  toastRoot.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const ms = duration ?? (type === 'error' ? 9000 : action ? 8000 : 3800);
  let timer = setTimeout(dismiss, ms);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { clearTimeout(timer); timer = setTimeout(dismiss, 2500); });
  el.addEventListener('focusin', () => clearTimeout(timer));
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }
  while (toastRoot.children.length > 3) toastRoot.firstElementChild.remove();
  return dismiss;
}

/** Remove every toast (e.g. when a full-screen tool opens). */
export function clearToasts() {
  if (!toastRoot) toastRoot = document.getElementById('toasts');
  if (toastRoot) toastRoot.replaceChildren();
}

/* ---------------------------------------------------------------- sheets */
const openSheets = [];
export const sheetOpen = () => openSheets.length > 0;

/**
 * Open a modal sheet. Returns { el, body, close(result), result: Promise, setActions(nodes) }.
 * @param {{title?:string, kicker?:string, content?:Node|Node[], actions?:Node[], size?:'sm'|'md'|'lg'|'full', drawer?:boolean, dismissible?:boolean, className?:string, keepToasts?:boolean}} o
 */
export function openSheet({ title, kicker, content, actions, size = 'md', drawer = false, dismissible = true, className = '', keepToasts = false, wide, full, key = '' } = {}) {
  // a double tap must not stack two copies of the same dialog: the one already open is returned
  // (`duplicate: true` tells the second caller to stop there)
  if (key) { const same = openSheets.find((x) => x.key === key && !x.closed); if (same) return Object.assign(Object.create(same), { duplicate: true }); }
  const root = document.getElementById('modal-root');
  if (!keepToasts) clearToasts();
  if (wide) size = 'lg';
  if (full) size = 'full';
  let resolveFn;
  const result = new Promise((r) => { resolveFn = r; });
  const titleId = nextId('sheet-title');
  const body = h('div.sheet-body', content);
  const head = (title || kicker) ? h('header.sheet-head',
    h('div.sheet-titles',
      kicker ? h('p.sheet-kicker', kicker) : null,
      title ? h('h2.sheet-title', { id: titleId }, title) : null,
    ),
    dismissible ? h('button.icon-btn.sheet-x', { type: 'button', 'aria-label': 'Close', onclick: () => close(null) }, icon('close')) : null,
  ) : null;
  const foot = h('footer.sheet-foot', { hidden: !(actions && actions.length) }, actions || []);
  const panel = h(`div.sheet.size-${size}${drawer ? '.drawer' : ''}`, {
    role: 'dialog', 'aria-modal': 'true', tabindex: '-1', class: className,
    'aria-labelledby': title ? titleId : null, 'aria-label': title ? null : (kicker || 'Dialog'),
  }, head, body, foot);
  // a tap on the dim backdrop closes the sheet — but not the second tap of the double tap that opened it
  const openedAt = performance.now();
  const backdrop = h(`div.sheet-backdrop${drawer ? '.drawer-backdrop' : ''}`, { onclick: (e) => { if (e.target === backdrop && dismissible && performance.now() - openedAt > 450) close(null); } }, panel);
  root.append(backdrop);
  document.body.classList.add('has-sheet');
  const untrap = trapFocus(panel);
  requestAnimationFrame(() => backdrop.classList.add('in'));
  const prevFocus = document.activeElement;
  setTimeout(() => {
    const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    const f = fine ? panel.querySelector('[autofocus]') : null;
    (f || panel).focus({ preventScroll: true });
  }, 60);
  const onKey = (e) => { if (e.key === 'Escape' && dismissible && openSheets[openSheets.length - 1] === api && !document.querySelector('.cropper')) close(null); };
  document.addEventListener('keydown', onKey);
  let closed = false;
  function close(value) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    untrap();
    backdrop.classList.remove('in');
    backdrop.classList.add('out');
    const i = openSheets.indexOf(api);
    if (i >= 0) openSheets.splice(i, 1);
    setTimeout(() => {
      backdrop.remove();
      if (!openSheets.length) document.body.classList.remove('has-sheet');
    }, 240);
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) try { prevFocus.focus({ preventScroll: true }); } catch { /* noop */ }
    resolveFn(value);
  }
  const api = {
    key, el: panel, body, close, result,
    get closed() { return closed; },
    setActions(nodes) { foot.replaceChildren(...nodes); foot.hidden = !nodes.length; },
    setTitle(t) { const el = panel.querySelector('.sheet-title'); if (el) el.textContent = t; },
  };
  openSheets.push(api);
  return api;
}

/** Simple confirm dialog → Promise<boolean>. */
export function confirmDialog({ title, message, confirm = 'OK', cancel = 'Cancel', danger = false, kicker } = {}) {
  const s = openSheet({
    title, kicker, size: 'sm',
    content: typeof message === 'string' ? h('p.sheet-text', message) : message,
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => s.close(false) }, cancel),
      h(`button.btn.${danger ? 'danger' : 'gold'}`, { type: 'button', autofocus: true, 'data-testid': 'confirm-ok', onclick: () => s.close(true) }, confirm),
    ],
  });
  return s.result.then((v) => v === true);
}

/** Choice dialog → Promise<value|null>. choices: [{label, value, kind:'gold'|'ghost'|'danger', icon?, hint?}] */
export function choiceDialog({ title, kicker, message, choices, size = 'sm' }) {
  const s = openSheet({
    title, kicker, size,
    content: [typeof message === 'string' ? h('p.sheet-text', message) : message,
      h('div.choice-list', choices.map((c) => h(`button.choice.${c.kind || 'ghost'}`, {
        type: 'button', dataset: { choice: c.value }, autofocus: c.autofocus || false, onclick: () => s.close(c.value),
      }, c.icon ? icon(c.icon) : null, h('span.choice-text', h('b', c.label), c.hint ? h('small', c.hint) : null))))],
  });
  return s.result;
}

/** Progress sheet: returns { set(fraction, label), close(), sheet }. */
export function progressSheet({ title, kicker }) {
  const bar = h('div.progress-fill');
  const label = h('p.progress-label', { 'aria-live': 'polite' }, 'Starting…');
  const pct = h('span.progress-pct', '0%');
  const track = h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, bar);
  const s = openSheet({ title, kicker, dismissible: false, size: 'sm', content: [track, h('div.progress-row', label, pct)] });
  return {
    sheet: s,
    set(f, text) {
      const v = Math.max(0, Math.min(1, f || 0));
      bar.style.width = `${(v * 100).toFixed(1)}%`;
      pct.textContent = `${Math.round(v * 100)}%`;
      track.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      if (text) label.textContent = text;
    },
    close() { s.close(null); },
  };
}

/* ---------------------------------------------------------------- menus */
/**
 * A small popover menu anchored to a button. items: [{label, icon, run, danger, hint}] (null = separator)
 */
export function openMenu(anchor, items, { align = 'end', label = 'Menu' } = {}) {
  closeMenus();
  const menu = h('div.menu', { role: 'menu', 'aria-label': label });
  const buttons = [];
  for (const it of items) {
    if (!it) { menu.append(h('div.menu-sep', { role: 'separator' })); continue; }
    const b = h(`button.menu-item${it.danger ? '.danger' : ''}`, {
      type: 'button', role: 'menuitem', tabindex: '-1', disabled: it.disabled || false, dataset: it.testid ? { testid: it.testid } : {},
      onclick: () => { close(); it.run(); },
    }, it.icon ? icon(it.icon) : null, h('span.menu-text', h('span', it.label), it.hint ? h('small', it.hint) : null));
    buttons.push(b);
    menu.append(b);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = Math.min(300, window.innerWidth - 24);
  menu.style.minWidth = `${Math.min(mw, Math.max(220, r.width))}px`;
  menu.style.maxWidth = `${mw}px`;
  const mr = menu.getBoundingClientRect();
  let left = align === 'end' ? r.right - mr.width : r.left;
  left = Math.max(12, Math.min(window.innerWidth - mr.width - 12, left));
  let top = r.bottom + 6;
  if (top + mr.height > window.innerHeight - 12) top = Math.max(12, r.top - mr.height - 6);
  Object.assign(menu.style, { left: `${left}px`, top: `${top}px` });
  anchor.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => menu.classList.add('in'));
  const focusAt = (i) => { const list = buttons.filter((b) => !b.disabled); if (list.length) list[(i + list.length) % list.length].focus(); };
  focusAt(0);
  const onKey = (e) => {
    const list = buttons.filter((b) => !b.disabled);
    const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === 'Tab') close();
  };
  const onDown = (e) => { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
  window.addEventListener('resize', close, { once: true });
  function close() {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    anchor.setAttribute('aria-expanded', 'false');
    menu.remove();
  }
  menu.__close = close;
  return close;
}
export function closeMenus() { for (const m of document.querySelectorAll('.menu')) (m.__close || (() => m.remove()))(); }

/* ---------------------------------------------------------------- files */
/** Pick files with a temporary <input type=file>. Resolves [] if cancelled (where detectable). */
export function pickFiles({ accept = 'image/*', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, 'data-testid': 'file-picker', style: { position: 'fixed', left: '-9999px', opacity: '0' } });
    let done = false;
    const finish = (files) => { if (done) return; done = true; input.remove(); resolve(files); };
    input.addEventListener('change', () => finish(Array.from(input.files || [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.append(input);
    input.click();
  });
}

export function autoGrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 560)}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

/* ---------------------------------------------------------------- form controls */
/** Text input / textarea with a visible label. */
export function textField({ label, value = '', oninput, onchange, multiline = false, placeholder = '', hint = '', maxlength, type = 'text', id = nextId('f'), attrs = {}, className = '' }) {
  const control = multiline
    ? autoGrow(h('textarea.input', { id, rows: '2', value, placeholder, maxlength, ...attrs }))
    : h('input.input', { id, type, value, placeholder, maxlength, ...attrs });
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  if (oninput) control.addEventListener('input', () => oninput(control.value, control));
  if (onchange) control.addEventListener('change', () => onchange(control.value, control));
  const wrap = h(`div.field${className ? `.${className}` : ''}`, h('label.field-label', { for: id }, label), control, hint ? h('p.field-hint', { id: hintId }, hint) : null);
  wrap.control = control;
  return wrap;
}

/** Accessible on/off switch (a checkbox with role="switch"). */
export function switchField({ label, checked = false, onchange, hint = '', disabled = false, id = nextId('sw') }) {
  const input = h('input', { type: 'checkbox', role: 'switch', id, checked, disabled, 'aria-describedby': hint ? `${id}-hint` : null });
  if (onchange) input.addEventListener('change', () => onchange(input.checked, input));
  const wrap = h(`div.switch-field${disabled ? '.is-disabled' : ''}`,
    h('label.switch-row', { for: id }, h('span.switch', input, h('span.switch-ui', { 'aria-hidden': 'true' })), h('span.switch-label', label)),
    hint ? h('p.field-hint', { id: `${id}-hint` }, hint) : null);
  wrap.control = input;
  return wrap;
}

/** Range slider with label + live value. */
export function sliderField({ label, min = 0, max = 1, step = 0.01, value = 0, format = (v) => String(v), oninput, onchange, hint = '', id = nextId('rg'), ends = null, disabled = false }) {
  const out = h('output.range-val', { for: id }, format(value));
  const input = h('input.range', { type: 'range', id, min: String(min), max: String(max), step: String(step), value: String(value), disabled, 'aria-describedby': hint ? `${id}-hint` : null });
  input.setAttribute('aria-valuetext', format(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    input.setAttribute('aria-valuetext', format(v));
    if (oninput) oninput(v, input);
  });
  if (onchange) input.addEventListener('change', () => onchange(Number(input.value), input));
  const wrap = h('div.field.slider-field',
    h('div.field-top', h('label.field-label', { for: id }, label), out),
    ends ? h('div.range-row', h('span.range-end', ends[0]), input, h('span.range-end', ends[1])) : input,
    hint ? h('p.field-hint', { id: `${id}-hint` }, hint) : null);
  wrap.control = input;
  wrap.set = (v) => { input.value = String(v); out.textContent = format(v); input.setAttribute('aria-valuetext', format(v)); };
  return wrap;
}

/** <select> with a label. options: [{value, label}] */
export function selectField({ label, options, value, onchange, hint = '', id = nextId('sel') }) {
  const sel = h('select.input.select', { id, 'aria-describedby': hint ? `${id}-hint` : null },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  if (onchange) sel.addEventListener('change', () => onchange(sel.value, sel));
  const wrap = h('div.field', h('label.field-label', { for: id }, label), sel, hint ? h('p.field-hint', { id: `${id}-hint` }, hint) : null);
  wrap.control = sel;
  return wrap;
}

/** Segmented control (radio group). options: [{value, label, icon?}] */
export function segmented({ label, options, value, onchange, className = '' }) {
  const id = nextId('seg');
  const btns = options.map((o) => h('button.seg', {
    type: 'button', role: 'radio', 'aria-checked': String(o.value === value), tabindex: o.value === value ? '0' : '-1', dataset: { value: o.value },
    onclick: () => select(o.value, true),
  }, o.icon ? icon(o.icon) : null, h('span', o.label)));
  const group = h(`div.seg-group${className ? `.${className}` : ''}`, { role: 'radiogroup', 'aria-labelledby': `${id}-l` }, btns);
  group.addEventListener('keydown', (e) => {
    const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % btns.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + btns.length) % btns.length;
    if (j >= 0) { e.preventDefault(); select(options[j].value, true); btns[j].focus(); }
  });
  function select(v, fire) {
    for (const b of btns) { const on = b.dataset.value === String(v); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    if (fire && onchange) onchange(v);
  }
  const wrap = h('div.field.seg-field', label ? h('span.field-label', { id: `${id}-l` }, label) : null, group);
  wrap.select = (v) => select(v, false);
  return wrap;
}

/**
 * Wrap an async flow so it never runs twice at once (a double tap on “Publish”, “Add photo”,
 * “Edit”… returns the run already in progress instead of opening a second dialog).
 */
export function single(fn) {
  let running = null;
  return (...args) => {
    if (running) return running;
    running = Promise.resolve().then(() => fn(...args)).finally(() => { running = null; });
    return running;
  };
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
