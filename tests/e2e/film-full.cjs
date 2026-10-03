#!/usr/bin/env node
// Plays the WHOLE film like a first-time visitor: countdown → open gift → … → credits.
// Clicks Continue and on-screen buttons, does the gestures (tap lanterns, open the seal, blow fallback,
// swipe to cut, press-and-hold the hug), screenshots every chapter, and fails on console errors,
// overflow, or a chapter that gets stuck.
//   NODE_PATH=$(npm root -g) node tests/e2e/film-full.cjs [--vp 390x844] [--out /tmp/film] [--slow 1]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const [W, H] = (args.vp || '390x844').split('x').map(Number);
const OUT = args.out || path.join(require('os').tmpdir(), `film-full-${W}x${H}`);
const PORT = args.port || '8090';
const STUCK_MS = Number(args.stuck || 8 * 60 * 1000); // SwiftShader is slow; real devices are ~4x faster
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 900, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // start 12 s before the unlock moment so the countdown ticks to zero for real
  const unlock = new Date(Date.now() + 12000).toISOString();
  await page.route('**/data/settings.json*', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.settings.lock = { enabled: true, unlockAt: unlock };
    route.fulfill({ response: res, json });
  });
  await page.goto(`http://localhost:${PORT}/index.html`);
  // SwiftShader frames can take seconds; without this GSAP lag-smoothing freezes tweens in screenshots
  await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});

  const seen = [];
  let scene = '';
  let since = Date.now();
  let shots = 0;
  let lastShot = 0;
  const clicked = new Set();
  const t0 = Date.now();
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(0);

  while (true) {
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => {
      const s = document.querySelector('#stage .scene');
      const c = document.getElementById('continue');
      const vis = (el) => {
        if (!el || el.disabled) return false;
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        let o = 1; // effective opacity: opacity isn't inherited, so walk up the tree
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none') return false;
          o *= Number(cs.opacity);
        }
        return o > 0.4;
      };
      const buttons = s ? [...s.querySelectorAll('button, [role="button"]')].filter(vis).map((b) => ({ key: (b.className + '|' + b.textContent).slice(0, 80), x: b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2, y: b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2, text: b.textContent.trim().slice(0, 40) })) : [];
      return { scene: s ? s.className.replace('scene ', '') : '', cont: vis(c) && !c.hidden, buttons, overflow: document.documentElement.scrollWidth > innerWidth + 1, end: vis(document.querySelector('.cr-again, [data-action="again"]')) };
    }).catch(() => ({ scene: scene, buttons: [] }));

    if (st.scene !== scene) {
      scene = st.scene;
      since = Date.now();
      seen.push(scene);
      console.log(`${elapsed()}s → ${scene}`);
      clicked.clear();
    }
    if (st.overflow) errors.push(`horizontal overflow in ${scene}`);
    if (Date.now() - lastShot > 15000) {
      lastShot = Date.now();
      await page.screenshot({ path: path.join(OUT, `${String(++shots).padStart(3, '0')}-${scene}.png`) });
    }
    if (st.end && scene.includes('credits')) { await page.waitForTimeout(12000); await page.screenshot({ path: path.join(OUT, `${String(++shots).padStart(3, '0')}-end.png`) }); break; }
    if (Date.now() - since > STUCK_MS) { errors.push(`stuck in ${scene} for ${STUCK_MS / 1000}s`); break; }

    if (st.cont) { await page.click('#continue', { force: true }).catch(() => {}); continue; }
    const inScene = (Date.now() - since) / 1000;
    // scene-specific gestures
    if (scene.includes('cake') && inScene > 30 && Math.floor(inScene) % 9 < 2) {
      await page.mouse.move(W * 0.12, H * 0.5); await page.mouse.down();
      for (let k = 1; k <= 14; k++) await page.mouse.move(W * 0.12 + (W * 0.76 * k) / 14, H * 0.52);
      await page.mouse.up();
    }
    if (scene.includes('hug') && inScene > 8 && Math.floor(inScene) % 10 < 2) {
      await page.mouse.move(W / 2, H * 0.5); await page.mouse.down(); await page.waitForTimeout(3500); await page.mouse.up();
    }
    if (scene.includes('lanterns') && inScene > 40 && !clicked.has('sky')) { clicked.add('sky'); await page.mouse.click(W * 0.5, H * 0.35); }
    if (scene.includes('letter') && inScene > 10 && !clicked.has('seal')) {
      const seal = await page.$('.lt-seal, [data-action="open-letter"]');
      if (seal) { clicked.add('seal'); const b = await seal.boundingBox(); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
    }
    for (const b of st.buttons) {
      if (clicked.has(b.key) || /watch again|mute/i.test(b.text)) continue;
      if (/more memories|every photo|send it|whatsapp/i.test(b.text)) continue; // optional extras — keep the flow linear
      clicked.add(b.key);
      await page.mouse.click(b.x, b.y);
      break;
    }
  }
  const expected = ['gate', 'invite', 'prologue', 'tower', 'hair', 'names', 'dance', 'lanterns', 'letter', 'cake', 'constellation', 'birthday', 'hug', 'credits'];
  const missing = expected.filter((e) => !seen.some((s) => s.includes(e)));
  if (missing.length) errors.push(`never reached: ${missing.join(', ')}`);
  console.log(`\nchapters: ${seen.join(' → ')}\nscreenshots: ${OUT}\ntotal: ${elapsed()}s`);
  console.log(errors.length ? `✗ ${errors.length} problem(s):\n  ${[...new Set(errors)].join('\n  ')}` : '✓ full film played without errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
