#!/usr/bin/env node
// Smoke test: every chapter boots at phone + desktop size with no console errors or horizontal overflow.
//   (static server on :8090)  NODE_PATH=$(npm root -g) node tests/e2e/film-smoke.cjs [--only tower,hair] [--vp 390x844,1440x900]
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const PORT = args.port || '8090';
const SCENES = (args.only || 'invite,prologue,tower,hair,names,dance,lanterns,letter,cake,constellation,birthday,hug,credits').split(',');
const VPS = (args.vp || '390x844,1440x900').split(',').map((s) => s.split('x').map(Number));
const WAIT = Number(args.wait || 9000);
const IGNORE = [/favicon/i, /net::ERR_ABORTED.*\.mp3/i];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  let failures = 0;
  const check = async (label, url, [w, h], expectSelector) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 900 });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (!IGNORE.some((x) => x.test(r.url()))) errs.push(`requestfailed: ${r.url()}`); });
    await page.goto(url);
    await page.waitForTimeout(WAIT);
    const state = await page.evaluate((sel) => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      found: !!document.querySelector(sel),
      scene: document.querySelector('#stage .scene')?.className || '(none)',
    }), expectSelector);
    const ok = !errs.length && !state.overflow && state.found;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} @${w}x${h}  scene=${state.scene}${state.overflow ? '  OVERFLOW' : ''}${state.found ? '' : `  missing ${expectSelector}`}${errs.length ? `\n      ${errs.slice(0, 5).join('\n      ')}` : ''}`);
    await page.close();
  };
  for (const vp of VPS) {
    if (!args.only) await check('gate (locked)', `http://localhost:${PORT}/index.html`, vp, '.scene-gate');
    for (const s of SCENES) await check(s, `http://localhost:${PORT}/index.html?preview&scene=${s}`, vp, `.scene-${s}`);
    if (!args.only) await check('admin', `http://localhost:${PORT}/admin/`, vp, 'body');
  }
  await browser.close();
  console.log(failures ? `\n✗ ${failures} failure(s)` : '\n✓ film smoke passed');
  process.exit(failures ? 1 : 0);
})();
