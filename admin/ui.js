/**
 * ui.js — minimal DOM helpers: h() element builder, toasts, sheets (modal dialogs),
 * confirm dialogs and a progress sheet. No innerHTML with user content.
 */

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
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
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
export function icon(name, cls = 'icon') {
  const P = {
    upload: '<path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    replace: '<path d="M20 11a8 8 0 0 0-14.9-3.9L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 3.9L20 15"/><path d="M20 20v-5h-5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    send: '<path d="M4 12 20 4l-4 16-4-7-8-1z"/><path d="m12 13 8-9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    words: '<path d="M4 6h16M4 12h10M4 18h13"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    lantern: '<path d="M9 3h6M10 3v2M14 3v2"/><path d="M7 7.5C7 6 8.5 5 12 5s5 1 5 2.5v8c0 1.5-1.5 2.5-5 2.5s-5-1-5-2.5z"/><path d="M10 18v2h4v-2"/><path d="M12 9.5c-1 1.2-1.4 2.2-.6 3.2.5.6 1.7.5 1.9-.4.2-.9-.4-1.8-1.3-2.8z"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
    wand: '<path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.7 1.3L21 13l-1.3.7L19 15l-.7-1.3L17 13l1.3-.7z"/>',
  };
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return span;
}

/* ---------------------------------------------------------------------- */
/* toasts                                                                  */
/* ---------------------------------------------------------------------- */

let toastRoot = null;
export function toast(message, { type = 'info', action = null, duration } = {}) {
  if (!toastRoot) toastRoot = document.getElementById('toasts');
  const el = h(`div.toast.toast-${type}`, { role: type === 'error' ? 'alert' : 'status' },
    h('span.toast-dot'),
    h('span.toast-msg', message),
  );
  if (action) {
    el.append(h('button.toast-action', {
      type: 'button',
      onclick: () => { dismiss(); action.run(); },
    }, action.label));
  }
  el.append(h('button.toast-close', { type: 'button', 'aria-label': 'Dismiss', onclick: () => dismiss() }, icon('close')));
  toastRoot.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const ms = duration ?? (type === 'error' ? 9000 : action ? 7000 : 3600);
  let timer = setTimeout(dismiss, ms);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { clearTimeout(timer); timer = setTimeout(dismiss, 2500); });
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }
  // keep at most 2 on screen
  while (toastRoot.children.length > 2) toastRoot.firstElementChild.remove();
  return dismiss;
}

/** Remove every toast (e.g. when a full-screen tool opens). */
export function clearToasts() {
  if (!toastRoot) toastRoot = document.getElementById('toasts');
  if (toastRoot) toastRoot.replaceChildren();
}

/* ---------------------------------------------------------------------- */
/* sheets                                                                  */
/* ---------------------------------------------------------------------- */

const openSheets = [];

/**
 * Open a modal sheet. Returns { el, body, close(result), result: Promise }.
 * @param {{title?:string, kicker?:string, content?:Node|Node[], actions?:Node[], wide?:boolean, full?:boolean, dismissible?:boolean, className?:string}} o
 */
export function openSheet({ title, kicker, content, actions, wide = false, full = false, dismissible = true, className = '' } = {}) {
  const root = document.getElementById('modal-root');
  clearToasts(); // stale toasts (and their Undo buttons) must not cover a dialog
  let resolveFn;
  const result = new Promise((r) => { resolveFn = r; });
  const body = h('div.sheet-body', content);
  const head = (title || kicker) ? h('header.sheet-head',
    h('div',
      kicker ? h('p.sheet-kicker', kicker) : null,
      title ? h('h2.sheet-title', title) : null,
    ),
    dismissible ? h('button.icon-btn.sheet-x', { type: 'button', 'aria-label': 'Close', onclick: () => close(null) }, icon('close')) : null,
  ) : null;
  const foot = actions && actions.length ? h('footer.sheet-foot', actions) : null;
  const panel = h(`div.sheet${wide ? '.wide' : ''}${full ? '.full' : ''}`, { role: 'dialog', 'aria-modal': 'true', tabindex: '-1', class: className }, head, body, foot);
  const backdrop = h('div.sheet-backdrop', { onclick: (e) => { if (e.target === backdrop && dismissible) close(null); } }, panel);
  root.append(backdrop);
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => backdrop.classList.add('in'));
  const prevFocus = document.activeElement;
  setTimeout(() => {
    // keyboards/mice: focus the primary control; touch: focus the dialog itself (no ring, no keyboard pop-up)
    const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    const f = fine ? panel.querySelector('[autofocus]') : null;
    (f || panel).focus({ preventScroll: true });
  }, 60);
  const onKey = (e) => { if (e.key === 'Escape' && dismissible && openSheets[openSheets.length - 1] === api) close(null); };
  document.addEventListener('keydown', onKey);
  let closed = false;
  function close(value) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('in');
    backdrop.classList.add('out');
    setTimeout(() => {
      backdrop.remove();
      const i = openSheets.indexOf(api);
      if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) document.body.classList.remove('has-sheet');
    }, 240);
    if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch { /* noop */ }
    resolveFn(value);
  }
  const api = { el: panel, body, close, result, setActions(nodes) { if (foot) { foot.replaceChildren(...nodes); } } };
  openSheets.push(api);
  return api;
}

/** Simple confirm dialog → Promise<boolean>. */
export function confirmDialog({ title, message, confirm = 'OK', cancel = 'Cancel', danger = false } = {}) {
  const s = openSheet({
    title,
    content: typeof message === 'string' ? h('p.sheet-text', message) : message,
    actions: [
      h('button.btn.ghost', { type: 'button', onclick: () => s.close(false) }, cancel),
      h(`button.btn.${danger ? 'danger' : 'gold'}`, { type: 'button', autofocus: true, onclick: () => s.close(true) }, confirm),
    ],
  });
  return s.result.then((v) => v === true);
}

/** Progress sheet: returns { set(fraction, label), close(), sheet }. */
export function progressSheet({ title, kicker }) {
  const bar = h('div.progress-fill');
  const label = h('p.progress-label', 'Starting…');
  const pct = h('span.progress-pct', '0%');
  const s = openSheet({
    title, kicker, dismissible: false,
    content: [h('div.progress', bar), h('div.progress-row', label, pct)],
  });
  return {
    sheet: s,
    set(f, text) {
      const v = Math.max(0, Math.min(1, f || 0));
      bar.style.width = `${(v * 100).toFixed(1)}%`;
      pct.textContent = `${Math.round(v * 100)}%`;
      if (text) label.textContent = text;
    },
    close() { s.close(null); },
  };
}

/** Pick files with a temporary <input type=file>. Resolves [] if cancelled (where detectable). */
export function pickFiles({ accept = 'image/*', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { position: 'fixed', left: '-9999px', opacity: '0' } });
    let done = false;
    const finish = (files) => { if (done) return; done = true; input.remove(); resolve(files); };
    input.addEventListener('change', () => finish(Array.from(input.files || [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.append(input);
    input.click();
  });
}

export function autoGrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 520)}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}
