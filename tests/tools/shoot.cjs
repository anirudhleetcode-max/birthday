#!/usr/bin/env node
// Visual QA harness — screenshots a chapter at given times.
//   NODE_PATH=$(npm root -g) node tests/tools/shoot.cjs --scene tower --vp 390x844 --at 6,14,30 --out /tmp/shots [--query "low"] [--act "14:tap:195,400;20:click:.btn"] [--port 8090]
// Prints console errors/warnings. Requires a static server on --port serving the repo root
// (e.g. `npx http-server . -p 8090 -c-1 -s`).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const scene = args.scene || '';
const [w, h] = (args.vp || '390x844').split('x').map(Number);
const times = (args.at || '5').split(',').map(Number);
const out = args.out || path.join(process.cwd(), 'shots');
const port = args.port || '8090';
const extra = args.query ? `&${args.query}` : '';
const acts = (args.act || '').split(';').filter(Boolean).map((a) => {
  const [t, kind, arg] = a.split(':');
  return { t: Number(t), kind, arg };
});
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 900 });
  const log = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  // --scene gate shows the real countdown (no ?preview, so the lock applies)
  const url = scene === 'gate'
    ? `http://localhost:${port}/index.html?${extra.slice(1)}`
    : `http://localhost:${port}/index.html?preview${scene ? `&scene=${scene}` : ''}${extra}`;
  await page.goto(url);
  // SwiftShader frames can take seconds; without this GSAP lag-smoothing freezes tweens in screenshots
  await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});
  const t0 = Date.now();
  const done = new Set();
  for (const t of times) {
    for (const a of acts) {
      if (done.has(a) || a.t > t) continue;
      const wait = a.t * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      done.add(a);
      try {
        if (a.kind === 'tap') { const [x, y] = a.arg.split(',').map(Number); await page.mouse.click(x, y); }
        if (a.kind === 'click') await page.click(a.arg, { timeout: 3000, force: true });
        if (a.kind === 'cont') await page.click('#continue', { timeout: 3000, force: true });
        if (a.kind === 'key') await page.keyboard.press(a.arg);
        if (a.kind === 'swipe') {
          const [x1, y1, x2, y2] = a.arg.split(',').map(Number);
          await page.mouse.move(x1, y1); await page.mouse.down();
          for (let k = 1; k <= 12; k++) await page.mouse.move(x1 + ((x2 - x1) * k) / 12, y1 + ((y2 - y1) * k) / 12);
          await page.mouse.up();
        }
        if (a.kind === 'hold') { const [x, y, ms] = a.arg.split(',').map(Number); await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); }
      } catch (e) { log.push(`[action] ${a.kind} ${a.arg} failed: ${e.message.split('\n')[0]}`); }
    }
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const file = path.join(out, `${scene || 'start'}-${w}x${h}-${String(t).padStart(3, '0')}.png`);
    await page.screenshot({ path: file });
    console.log('shot', file);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth);
  if (overflow) log.push('[layout] horizontal overflow detected');
  console.log(log.length ? log.join('\n') : 'no console errors');
  await browser.close();
})();
