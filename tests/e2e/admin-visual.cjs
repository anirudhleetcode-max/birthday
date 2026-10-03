#!/usr/bin/env node
// Visual / layout audit of every Lantern Room section and its main dialogs at phone, tablet and
// desktop sizes: horizontal overflow, things sticking out of the screen, clipped text, overlapping
// controls, tap targets < 40 px, visible keyboard focus and text contrast (WCAG AA).
//
//   (static server on :8090)  NODE_PATH=$(npm root -g) node tests/e2e/admin-visual.cjs [--shots dir] [--vp 390x844,1440x900] [--only library,settings]
//
// GitHub is mocked (no token → the site's own copy). Exits 1 on any problem.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const BASE = `http://localhost:${args.port || '8090'}`;
const SHOTS = typeof args.shots === 'string' ? args.shots : '';
const VPS = (typeof args.vp === 'string' ? args.vp : '390x844,412x915,768x1024,1440x900').split(',').map((s) => s.split('x').map(Number));
const SECTIONS = ['library', 'chapters', 'messages', 'audio', 'video', 'theme', 'preview', 'settings', 'help'];
const ONLY = typeof args.only === 'string' ? args.only.split(',') : null;

let failures = 0;
let passes = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { passes++; console.log(`  ok    ${msg}`); } else { failures++; console.log(`  FAIL  ${msg}${extra ? `\n          ${extra}` : ''}`); }
};

/** Runs in the page: layout problems inside `root` (default: the whole document). */
function audit(rootSel) {
  const root = rootSel ? document.querySelector(rootSel) : document.body;
  const W = window.innerWidth;
  const out = { overflowX: document.documentElement.scrollWidth - W, offscreen: [], small: [], clipped: [], overlap: [], contrast: [] };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (el.closest('[hidden], .sr-only, [aria-hidden="true"]')) return false;
    const d = el.closest('details:not([open])'); // content of a closed <details> isn't shown
    return !d || !!el.closest('summary');
  };
  // fixed / sticky chrome (top bar, bottom bar, sheet footers) floats over scrolling content by design
  const floating = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') return p; } return null; };
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}${el.textContent ? ` “${el.textContent.trim().slice(0, 24)}”` : ''}`;
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return p; } return null; };
  const all = [...root.querySelectorAll('*')].filter(visible);
  // the part of an element actually on screen: clipped by every scrolling / overflow-hidden ancestor
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    let { left, top, right, bottom } = r;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const q = p.getBoundingClientRect();
        left = Math.max(left, q.left); top = Math.max(top, q.top); right = Math.min(right, q.right); bottom = Math.min(bottom, q.bottom);
      }
    }
    return { left, top, right, bottom };
  };
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !inScroller(el) && getComputedStyle(el).position !== 'fixed') out.offscreen.push(`${name(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  // tap targets
  const targets = [...root.querySelectorAll('button, a[href], select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, summary, .switch, label.check')].filter(visible);
  for (const el of targets) {
    if (el.closest('.toast')) continue; // transient
    const r = el.getBoundingClientRect();
    if (el.matches('a') && getComputedStyle(el).display === 'inline') continue; // links inside sentences
    // a switch's real hit area is its (invisible, enlarged) checkbox
    const tap = el.matches('.switch') ? (el.querySelector('input') || el).getBoundingClientRect() : r;
    if (Math.min(tap.width, tap.height) < 40 - 0.5) out.small.push(`${name(el)} ${Math.round(tap.width)}×${Math.round(tap.height)}`);
  }
  // clipped text (single-line ellipsis is deliberate and fine)
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' || el.matches('input, textarea, select, canvas, img, svg, video, audio, .filters, .sheet-body, .menu')) continue;
    if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') && el.childElementCount === 0 && el.textContent.trim()) {
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) out.clipped.push(`${name(el)} ${el.scrollWidth}/${el.clientWidth}×${el.scrollHeight}/${el.clientHeight}`);
    }
  }
  // overlapping interactive controls (siblings in the same card)
  const ctrls = targets.filter((el) => !el.closest('.toast'));
  for (let i = 0; i < ctrls.length; i++) {
    const a = shown(ctrls[i]);
    for (let j = i + 1; j < ctrls.length; j++) {
      if (ctrls[i].contains(ctrls[j]) || ctrls[j].contains(ctrls[i])) continue;
      if (floating(ctrls[i]) !== floating(ctrls[j])) continue;
      if (getComputedStyle(ctrls[i]).display === 'inline' || getComputedStyle(ctrls[j]).display === 'inline') continue; // multi-line inline links
      const b = shown(ctrls[j]);
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 2 && iy > 2) out.overlap.push(`${name(ctrls[i])} × ${name(ctrls[j])}`);
    }
  }
  // contrast of text against the nearest solid background
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const v = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null; // photo / texture: unknown
      if (/gradient/.test(cs.backgroundImage) && p !== document.body && p !== document.documentElement) {
        // a gradient fill (gold buttons): use the average of its colour stops
        const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
        if (stops.length && stops.every((x) => x.a >= 0.9)) {
          const avg = stops.reduce((a, x) => ({ r: a.r + x.r / stops.length, g: a.g + x.g / stops.length, b: a.b + x.b / stops.length, a: 1 }), { r: 0, g: 0, b: 0, a: 1 });
          layers.push(avg);
          break;
        }
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let bg = { r: 11, g: 6, b: 20, a: 1 }; // the page's night sky (#0b0614)
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  };
  const seen = new Set();
  for (const el of all) {
    if (el.closest('button:disabled, [aria-disabled="true"], .is-disabled, input:disabled')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || !bg) continue;
    const f = blend({ ...fg, a: fg.a * Number(cs.opacity || 1) }, bg);
    const L1 = lum(f); const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize);
    const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      const k = `${name(el)}|${ratio.toFixed(2)}`;
      if (!seen.has(k)) { seen.add(k); out.contrast.push(`${name(el)} ${ratio.toFixed(2)}:1 (${px}px)`); }
    }
  }
  return out;
}

/** Tab through the page and check every focused control shows a visible focus ring. */
async function focusAudit(page, n = 25) {
  const missing = [];
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(260); // focus rings fade in
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.matches('input[type="range"]')) return null; // range: the ring is on the thumb (::-webkit-slider-thumb)
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1.5) || /rgb/.test(cs.boxShadow) && cs.boxShadow !== 'none';
      // a visually-hidden input (switch) shows its ring on the sibling knob
      const sib = el.matches('input') && el.nextElementSibling ? getComputedStyle(el.nextElementSibling) : null;
      const sibRing = sib && ((sib.outlineStyle !== 'none' && parseFloat(sib.outlineWidth) >= 1.5) || (sib.boxShadow && sib.boxShadow !== 'none'));
      return { ring: ring || sibRing, name: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} “${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}”` };
    });
    if (r && !r.ring) missing.push(r.name);
  }
  return [...new Set(missing)];
}

const fmt = (list) => list.slice(0, 8).join(' | ') + (list.length > 8 ? ` … (+${list.length - 8})` : '');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [w, hgt] of VPS) {
      const phone = w < 600;
      console.log(`\n▸ ${w}×${hgt}${phone ? ' (touch)' : ''}`);
      const context = await browser.newContext({ viewport: { width: w, height: hgt }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1 });
      await context.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' }));
      await context.addInitScript(() => { try { localStorage.setItem('deepu-admin-welcomed', '1'); } catch { /* */ } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      await page.goto(`${BASE}/admin/#library`);
      await page.waitForSelector('#view[data-section="library"] .pcard', { timeout: 20000 });
      for (const sec of SECTIONS) {
        if (ONLY && !ONLY.includes(sec)) continue;
        await page.evaluate((s) => { location.hash = `#${s}`; }, sec);
        await page.waitForSelector(`#view[data-section="${sec}"]`);
        if (sec === 'messages') { await page.click('button:has-text("Open all")'); }
        await page.waitForTimeout(sec === 'settings' ? 900 : 250);
        const a = await page.evaluate(audit, null);
        const tag = `${sec} @${w}`;
        ok(a.overflowX <= 1 && !a.offscreen.length, `${tag}: nothing wider than the screen`, `scrollX+${a.overflowX} ${fmt(a.offscreen)}`);
        ok(!a.small.length, `${tag}: tap targets ≥ 40 px`, fmt(a.small));
        ok(!a.clipped.length, `${tag}: no clipped text`, fmt(a.clipped));
        ok(!a.overlap.length, `${tag}: no overlapping controls`, fmt(a.overlap));
        ok(!a.contrast.length, `${tag}: text contrast ≥ AA`, fmt(a.contrast));
        const hidden = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          const bar = document.getElementById('bottomnav');
          const br = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null;
          const last = [...document.querySelectorAll('#view *')].filter((e) => e.getBoundingClientRect().height > 0 && !e.closest('details:not([open]) > :not(summary)')).pop();
          const lr = last && last.getBoundingClientRect();
          const footer = document.querySelector('.page-foot');
          let fr = null;
          if (footer && getComputedStyle(footer).display !== 'none') { const rg = document.createRange(); rg.selectNodeContents(footer); fr = rg.getBoundingClientRect(); } // its TEXT, not its padding
          const limit = br ? br.top : window.innerHeight;
          const res = lr && lr.bottom > limit + 1 ? `last item ends at ${Math.round(lr.bottom)} > ${Math.round(limit)}` : fr && fr.bottom > limit + 1 ? `footer ends at ${Math.round(fr.bottom)} > ${Math.round(limit)}` : '';
          window.scrollTo(0, 0);
          return res;
        });
        ok(!hidden, `${tag}: the end of the page scrolls clear of the bottom bar`, hidden);
        if (!phone) {
          const f = await focusAudit(page);
          ok(!f.length, `${tag}: keyboard focus is always visible`, fmt(f));
        }
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${sec}-${w}.png`), fullPage: false }); }
      }
      // dialogs: connect, add-photo, editor, drawer (phone) / menu (desktop)
      if (!ONLY) {
        const dialogs = [
          ['connect', async () => { await page.click('#status'); await page.waitForSelector('#gh-token'); }],
          ['add', async () => { await page.evaluate(() => { location.hash = '#library'; }); await page.click('[data-testid="add-photo"]'); await page.waitForSelector('[data-testid="add-choose"]'); }],
          ['editor', async () => { await page.evaluate(() => { location.hash = '#library'; }); await page.click('.pcard [data-act="edit"]'); await page.waitForSelector('[data-testid="edit-save"]'); }],
          phone ? ['drawer', async () => { await page.click('#bnav-more'); await page.waitForSelector('.drawer-nav'); }]
            : ['menu', async () => { await page.click('[data-testid="more"]'); await page.waitForSelector('.menu'); }],
        ];
        for (const [name, open] of dialogs) {
          await open();
          await page.waitForTimeout(400);
          const a = await page.evaluate(audit, name === 'menu' ? '.menu' : '#modal-root');
          const tag = `${name} dialog @${w}`;
          ok(a.overflowX <= 1 && !a.offscreen.length, `${tag}: fits the screen`, `scrollX+${a.overflowX} ${fmt(a.offscreen)}`);
          ok(!a.small.length, `${tag}: tap targets ≥ 40 px`, fmt(a.small));
          ok(!a.clipped.length && !a.overlap.length, `${tag}: nothing clipped or overlapping`, fmt([...a.clipped, ...a.overlap]));
          ok(!a.contrast.length, `${tag}: text contrast ≥ AA`, fmt(a.contrast));
          if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `dlg-${name}-${w}.png`) });
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('.sheet-backdrop:not(.out)') && !document.querySelector('.menu'), null, { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(300);
        }
      }
      ok(!errors.length, `no console errors @${w}`, errors.join(' | '));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  console.log(failures ? '✗ admin visual audit: problems found' : '✓ admin visual audit passed');
  process.exit(failures ? 1 : 0);
})();
