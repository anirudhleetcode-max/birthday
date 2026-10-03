/**
 * SETTINGS — who it's for / from, the countdown lock (IST), WhatsApp, global colour grading
 * (+ re-grade all from originals), GitHub repository + token.
 */
import { state, change, lsSet, REPO_KEY, globalStrength, getFileBlob, tokenPlace } from '../state.js';
import { isoToIstInput, istInputToIso, prettyIst } from '../util.js';
import { h, icon, toast, textField, switchField, sliderField, segmented, pickFiles, debounce } from '../ui.js';
import * as I from '../images.js';
import { regradeAll, openFile } from '../photos.js';
import { showConnectSheet, forgetToken, reconnect } from '../publish.js';
import { sectionHead, panel } from './common.js';

const DEFAULT_UNLOCK = '2027-01-03T00:00:00+05:30';

export function renderSettings() {
  const site = state.site;
  const set = (fn) => change(fn, { render: false });

  /* ---- people ---- */
  const nick = site.her.nicknames || [];
  const people = panel('Who it’s for, and from', { icon: 'heart', hint: 'Used everywhere in the film (and by the {name} {nick1} {nick2} {creator} tokens).' },
    textField({ label: 'Her name', value: site.her.name || '', maxlength: 40, oninput: (v) => set((s) => { s.her.name = v; }), attrs: { 'data-testid': 'her-name', autocomplete: 'off' } }),
    h('div.field-grid.three',
      [0, 1, 2].map((i) => textField({
        label: `Nickname ${i + 1}${i === 0 ? ' (everyday)' : i === 1 ? ' ({nick1})' : ' (optional)'}`, value: nick[i] || '', maxlength: 30,
        oninput: (v) => set((s) => { const n = [...(s.her.nicknames || [])]; while (n.length < 3) n.push(''); n[i] = v; s.her.nicknames = n; }),
      }))),
    textField({ label: 'Her birth date', type: 'date', value: site.her.birthDate || '2007-01-03', hint: 'Used for “7,305 days” and her age.', oninput: (v) => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) set((s) => { s.her.birthDate = v; }); } }),
    h('div.field-grid.two',
      textField({ label: 'Your name (as it appears in the film)', value: site.from.name || '', maxlength: 60, oninput: (v) => set((s) => { s.from.name = v; }) }),
      textField({ label: 'Your sign-off', value: site.from.signoff || '', maxlength: 80, placeholder: 'Yours, in every lifetime', oninput: (v) => set((s) => { s.from.signoff = v; }) })));

  /* ---- lock ---- */
  const lock = site.settings.lock;
  const whenPretty = h('p.lock-pretty', { 'aria-live': 'polite' }, `Opens ${prettyIst(lock.unlockAt)}`);
  const whenError = h('p.form-error', { role: 'alert', hidden: true }, 'Please pick both a date and a time — the previous time is kept until then.');
  const when = textField({
    label: 'Unlocks at (India time, IST)', type: 'datetime-local', value: isoToIstInput(lock.unlockAt), attrs: { step: '60', 'data-testid': 'unlock-at' },
    hint: 'Stored as Indian Standard Time (+05:30), so it opens at the same moment wherever she is.',
    onchange: (v) => {
      const iso = istInputToIso(v);
      whenError.hidden = !!iso;
      if (!iso) return;
      set((s) => { s.settings.lock.unlockAt = iso; });
      whenPretty.textContent = `Opens ${prettyIst(iso)}`;
    },
  });
  const lockPanel = panel('Countdown lock', { icon: 'lock', hint: 'Until this moment, anyone opening the site sees a gentle countdown instead of the film. Your Preview always skips it.' },
    switchField({ label: 'Keep the film locked until her birthday', checked: !!lock.enabled, onchange: (v) => set((s) => { s.settings.lock.enabled = v; }) }),
    when, whenError, whenPretty,
    h('button.btn.sm.quiet', { type: 'button', onclick: () => change((s) => { s.settings.lock.unlockAt = DEFAULT_UNLOCK; }) }, icon('undo'), 'Reset to 3 Jan 2027, midnight IST'));

  /* ---- WhatsApp ---- */
  const waTest = h('a.link-btn', { target: '_blank', rel: 'noopener' }, icon('external'), 'Test the link');
  const syncWa = () => { const d = state.site.settings.whatsapp || ''; waTest.href = d ? `https://wa.me/${d}` : '#'; waTest.hidden = !d; };
  const wa = textField({
    label: 'Your WhatsApp number', type: 'tel', value: site.settings.whatsapp || '', placeholder: 'e.g. 919876543210',
    attrs: { inputmode: 'numeric', autocomplete: 'off' },
    hint: 'Digits only, with the country code (India = 91), no + or spaces.',
    oninput: (v, el) => { const d = v.replace(/\D+/g, '').slice(0, 15); if (d !== v) el.value = d; set((s) => { s.settings.whatsapp = d; }); syncWa(); },
  });
  syncWa();
  const waPanel = panel('WhatsApp “send a hug”', { icon: 'send', hint: 'At the end she can tap “Send a hug” — it opens WhatsApp to YOUR number with a little message.' }, wa, waTest);

  /* ---- grading ---- */
  const gradePanel = gradingPanel();

  /* ---- GitHub ---- */
  const owner = textField({ label: 'Owner', value: state.repo.owner, attrs: { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' } });
  const repo = textField({ label: 'Repository', value: state.repo.repo, attrs: { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' } });
  const branch = textField({ label: 'Branch', value: state.repo.branch, attrs: { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' } });
  const c = state.conn;
  const connLine = h('p.conn-line', { dataset: { conn: c.status } }, h('span.dot', { 'aria-hidden': 'true' }),
    c.status === 'ok' ? `Connected to ${state.repo.owner}/${state.repo.repo} · ${state.repo.branch}`
      : c.status === 'error' ? c.message
        : c.token ? 'Token saved — not checked yet' : 'Not connected — you can look around and save drafts, but publishing needs a token.');
  const ghPanel = panel('GitHub (where the site lives)', { icon: 'key' },
    connLine,
    h('div.field-grid.three', owner, repo, branch),
    h('div.card-actions.wrap',
      h('button.btn.sm.ghost', { type: 'button', onclick: async () => {
        const cfg = { owner: owner.control.value.trim(), repo: repo.control.value.trim(), branch: branch.control.value.trim() || 'main' };
        if (!cfg.owner || !cfg.repo) { toast('Please fill in the owner and repository.', { type: 'error' }); return; }
        state.repo = cfg;
        lsSet(REPO_KEY, JSON.stringify(cfg));
        change((s) => { s.settings.github = { ...cfg }; }, { render: false });
        await reconnect();
      } }, icon('check'), 'Save & reconnect'),
      h('button.btn.sm.ghost', { type: 'button', onclick: () => showConnectSheet({}) }, icon('key'), c.token ? 'Change token' : 'Add token'),
      c.token ? h('button.btn.sm.quiet', { type: 'button', 'data-testid': 'forget-token', onclick: forgetToken }, icon('trash'), 'Forget token') : null),
    h('p.field-hint', { 'data-testid': 'token-place' }, !c.token ? 'The token is kept only in this browser — never in the site, your drafts or an export.'
      : tokenPlace() === 'tab' ? 'The token is kept for this tab only and is forgotten when you close it.'
        : 'The token is remembered in this browser only (never in the site, your drafts or an export). Tap “Forget token” on shared devices.'));

  return h('div.settings',
    sectionHead('Settings', 'The little levers', null),
    h('div.settings-grid', people, lockPanel, gradePanel, waPanel, ghPanel));
}

/* ---------------------------------------------------------------- grading */
function gradingPanel() {
  const canvas = h('canvas.ba-canvas', { 'aria-hidden': 'true' });
  const box = h('div.ba-box', h('p.muted.small', 'Loading a sample photo…'));
  let showAfter = true;
  let sample = null;
  const draw = debounce(async () => {
    if (!sample) return;
    const c = showAfter ? await I.renderPreview(sample, { ratio: `${sample.width}:${sample.height}`, crop: { x: 0, y: 0, w: 1, h: 1 }, grade: { strength: globalStrength() }, longPx: 640 }) : sample;
    canvas.width = c.width;
    canvas.height = c.height;
    canvas.getContext('2d').drawImage(c, 0, 0);
  }, 90);
  const use = (src) => {
    const k = Math.min(1, 640 / Math.max(src.width, src.height));
    sample = I.drawRegion(src, 0, 0, src.width, src.height, Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
    box.replaceChildren(canvas);
    draw();
  };
  const seg = segmented({ label: 'Compare', value: 'after', className: 'compact', options: [{ value: 'before', label: 'Before' }, { value: 'after', label: 'After' }], onchange: (v) => { showAfter = v === 'after'; draw(); } });
  const slider = sliderField({
    label: 'Grading strength (all photos)', min: 0, max: 1, step: 0.05, value: globalStrength(), format: (v) => `${Math.round(v * 100)}%`, ends: ['Natural', 'Full look'],
    hint: 'Subtle and natural: gentle exposure and contrast evening-out, a touch of warmth, soft highlights — skin tones are protected. Photos with their own setting keep it.',
    oninput: (v) => { change((s) => { s.settings.grading.strength = Math.round(v * 100) / 100; }, { render: false }); draw(); },
  });
  (async () => {
    const withImg = (state.site.photos || []).filter((p) => p.original || p.src).slice(0, 4);
    // the original when it can be fetched (it isn't on the public site), else the display copy
    for (const path of withImg.flatMap((p) => [p.original, p.src].filter(Boolean))) {
      try {
        const dec = await I.decodeImage(await getFileBlob(path), { maxSide: 1200 });
        use(dec.canvas);
        return;
      } catch { /* next */ }
    }
    box.replaceChildren(h('p.muted.small', 'Add a photo first — or try the look on any photo below.'));
  })();
  return panel('Colour grading', { icon: 'palette', hint: 'Every photo shown in the film is a graded copy; the originals you upload are never changed.' },
    slider,
    h('div.ba', seg, box),
    h('div.card-actions.wrap',
      h('button.btn.sm.ghost', { type: 'button', onclick: async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return; const d = await openFile(f); if (d) use(d.canvas); } }, icon('image'), 'Try on a photo'),
      h('button.btn.sm.gold-soft', { type: 'button', 'data-testid': 'regrade-all', onclick: regradeAll }, icon('refresh'), 'Re-grade all photos from originals')),
    h('p.field-hint', 'A new strength applies to new photos. To update existing ones, re-grade them from their originals (it becomes part of your draft).'));
}
