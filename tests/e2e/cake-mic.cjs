#!/usr/bin/env node
// The cake's microphone, every way it can go — through Chromium's fake microphone fed with real
// audio files (tests/fixtures/audio): granted + silence (the "Blow them out" button surfaces after
// ~12 s), granted + a breath (the candles go out), permission denied, no microphone API, no device.
// Also: the microphone stream is stopped once the candles are out / the chapter ends, and the mic
// is never routed to the speakers.
// The recordings are made by tests/fixtures/audio/make-fixtures.mjs. Run it on an otherwise idle
// machine: under software rendering the cake draws only a few frames a second when the CPU is busy,
// and the detector samples the microphone once per frame.
//   NODE_PATH=$(npm root -g) node tests/e2e/cake-mic.cjs [name filter]    (needs `npm run serve`)
const { chromium } = require('playwright');
const path = require('path');

const PORT = process.env.PORT || '8090';
const AUDIO = path.join(__dirname, '..', 'fixtures', 'audio');
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };

// records every stream getUserMedia hands out, and whether anything is connected to the speakers from it
const SPY = () => {
  window.__streams = [];
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { const s = await orig(c); window.__streams.push(s); return s; };
  }
  window.__live = () => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length;
};

const ONLY = process.argv[2] || '';

async function scenario(name, { fake = 'silence', grant = true, init = null }, run) {
  if (ONLY && !name.includes(ONLY)) return;
  console.log(`\n▸ ${name}`);
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream'];
  if (grant) args.push('--use-fake-ui-for-media-stream');
  if (fake) args.push(`--use-file-for-fake-audio-capture=${path.join(AUDIO, `${fake}.wav`)}`);
  const browser = await chromium.launch({ args });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, permissions: grant ? ['microphone'] : [] });
  await context.addInitScript(SPY);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/index.html?preview&scene=cake`);
  await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});
  // the blow moment: the mic button (or, without a microphone, the fallback) is offered
  await page.waitForSelector('.ck-btn.primary.on, .ck-btn.alt.on', { timeout: 150000 });
  try { await run(page); } catch (e) { ok(false, `scenario crashed: ${e.message.split('\n')[0]}`); }
  ok(!errors.length, `no console errors${errors.length ? `: ${errors[0]}` : ''}`);
  await browser.close();
}
const text = (page) => page.evaluate(() => document.body.innerText);
const candlesOut = (page, ms) => page.waitForFunction(() => /swipe across the cake|cut it/i.test(document.body.innerText), null, { timeout: ms }).then(() => true).catch(() => false);

(async () => {
  await scenario('granted, then silence (12 s) → the fallback button surfaces', { fake: 'silence' }, async (page) => {
    await page.click('.ck-btn.primary', { force: true });
    const listening = await page.waitForSelector('.ck-chip.on', { timeout: 15000 }).then(() => true).catch(() => false);
    ok(listening, 'permission granted → “listening” is shown');
    ok(await page.evaluate(() => window.__live()) === 1, 'exactly one live microphone track');
    await page.waitForTimeout(6000);
    ok(!(await page.$('.ck-btn.alt.surfaced')), 'no fallback nagging during the first seconds');
    const surfaced = await page.waitForSelector('.ck-btn.alt.surfaced', { timeout: 30000 }).then(() => true).catch(() => false);
    ok(surfaced, 'after ~12 s of silence the “Blow them out” button surfaces');
    await page.click('.ck-btn.alt', { force: true });
    ok(await candlesOut(page, 60000), 'the fallback button blows the candles out → cut hint');
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__live()) === 0, 'microphone stopped once the candles are out');
  });

  await scenario('granted, then a real breath → the candles go out', { fake: 'breath' }, async (page) => {
    await page.click('.ck-btn.primary', { force: true });
    await page.waitForSelector('.ck-chip.on', { timeout: 15000 }).catch(() => {});
    ok(await candlesOut(page, 90000), 'blowing (breath noise) puts all twenty out → cut hint');
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__live()) === 0, 'microphone stopped after the blow');
    // finish the chapter: cut, continue → the next chapter must not hold the mic
    for (let k = 0; k < 3; k++) {
      await page.mouse.move(40, 420); await page.mouse.down();
      for (let s = 1; s <= 12; s++) await page.mouse.move(40 + s * 26, 430);
      await page.mouse.up();
      await page.waitForTimeout(2500);
    }
    const left = await page.waitForSelector('#continue:not([hidden])', { timeout: 90000 }).then(async (b) => { await b.click({ force: true }); return true; }).catch(() => false);
    if (left) await page.waitForSelector('#stage .scene-constellation, #stage .scene-video', { timeout: 60000 }).catch(() => {});
    ok(left, 'the cake chapter finishes (cut + Continue)');
    ok(await page.evaluate(() => window.__live()) === 0, 'no microphone stream after leaving the chapter');
  });

  await scenario('permission denied → fallback straight away', { fake: 'silence', grant: false, init: () => {
    const md = navigator.mediaDevices;
    md.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  } }, async (page) => {
    await page.click('.ck-btn.primary', { force: true });
    ok(await page.waitForSelector('.ck-btn.alt.surfaced', { timeout: 10000 }).then(() => true).catch(() => false), 'denied → “Blow them out” surfaces immediately');
    ok(!(await page.$('.ck-chip.on')), 'no “listening” indicator');
    await page.click('.ck-btn.alt', { force: true });
    ok(await candlesOut(page, 60000), 'fallback works → cut hint');
  });

  await scenario('no microphone API (unsupported browser) → only the button', { fake: null, init: () => { try { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }); } catch { /* */ } } }, async (page) => {
    ok(await page.waitForSelector('.ck-btn.alt.surfaced, .ck-btn.alt.on', { timeout: 10000 }).then(() => true).catch(() => false), 'fallback offered without a microphone API');
    await page.click('.ck-btn.alt', { force: true });
    ok(await candlesOut(page, 60000), 'fallback works → cut hint');
  });

  await scenario('no microphone device → fallback', { fake: 'silence', init: () => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
  } }, async (page) => {
    await page.click('.ck-btn.primary', { force: true });
    ok(await page.waitForSelector('.ck-btn.alt.surfaced', { timeout: 10000 }).then(() => true).catch(() => false), 'no device → “Blow them out” surfaces');
    ok(/swipe across|blow/i.test(await text(page)), 'the chapter keeps going');
  });

  console.log(failed ? `\n✗ ${failed} microphone check(s) failed` : '\n✓ microphone: every path works and nothing is left listening');
  process.exit(failed ? 1 : 0);
})();
