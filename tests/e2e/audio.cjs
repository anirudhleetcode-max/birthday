#!/usr/bin/env node
/* global AudioNode, AudioDestinationNode */ // (used inside the page)
// Sound behaviour, measured at the speakers (every connection to the output is tapped):
//   • no sound before her first tap (countdown and invitation are silent, no running AudioContext)
//   • the lantern tap starts the music; one audio engine for the whole film
//   • mute / unmute
//   • the finale's silences: the music really falls silent before her final photograph and
//     comes back after the handwritten line, and falls silent again just before the title
//   NODE_PATH=$(npm root -g) node tests/e2e/audio.cjs      (needs `npm run serve`)
const { chromium } = require('playwright');

const PORT = process.env.PORT || '8090';
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };

// taps everything that reaches ctx.destination, so we can read the actual output level
const TAP = () => {
  const Orig = window.AudioContext || window.webkitAudioContext;
  window.__ctxs = [];
  window.__level = () => 0;
  const conn = AudioNode.prototype.connect;
  const taps = new WeakMap();
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = conn.call(this, dest, ...rest);
    if (dest && dest instanceof AudioDestinationNode) {
      const c = dest.context;
      let an = taps.get(c);
      if (!an) {
        an = c.createAnalyser(); an.fftSize = 2048; taps.set(c, an);
        const buf = new Float32Array(an.fftSize);
        window.__level = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
      }
      conn.call(this, an);
    }
    return r;
  };
  window.AudioContext = function (...a) { const c = new Orig(...a); window.__ctxs.push(c); return c; };
  window.AudioContext.prototype = Orig.prototype;
};
const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };
const running = (page) => page.evaluate(() => window.__ctxs.filter((c) => c.state === 'running').length);

(async () => {
  const browser = await chromium.launch(LAUNCH);
  console.log('▸ before her first tap');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(TAP);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/index.html`); // locked: the countdown
    await page.waitForSelector('#stage .scene-gate', { timeout: 45000 });
    await page.waitForTimeout(4000);
    ok(await running(page) === 0, 'countdown: no audio running (no autoplay)');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(TAP);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/index.html?preview`);
    await page.waitForSelector('#stage .scene-invite .inv-light', { timeout: 45000 });
    await page.waitForTimeout(3000);
    ok(await running(page) === 0, 'invitation: silent until the lantern is lit');
    await page.click('.inv-light', { force: true });
    await page.waitForTimeout(5000);
    ok(await running(page) === 1, 'lighting the lantern starts exactly one audio engine');
    const lv = await page.evaluate(() => window.__level());
    ok(lv > 0.0005, `music is playing (level ${lv.toFixed(4)})`);
    await page.waitForSelector('#mute:not([hidden])', { timeout: 20000 }).catch(() => {});
    await page.click('#mute', { force: true });
    await page.waitForTimeout(1500);
    const muted = await page.evaluate(() => ({ m: window.__film.audio.muted, aria: document.getElementById('mute').getAttribute('aria-pressed'), lv: window.__level() }));
    ok(muted.m && muted.aria === 'true', 'mute button mutes (and says so to screen readers)');
    ok(muted.lv < 0.0005, `muted output is silent (level ${muted.lv.toFixed(5)})`);
    await page.click('#mute', { force: true });
    await page.waitForTimeout(1500);
    ok(!(await page.evaluate(() => window.__film.audio.muted)), 'unmute');
    await ctx.close();
  }

  console.log('\n▸ the finale: music → silence → her photo & handwritten line → music → silence → title');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(TAP);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/index.html?preview&scene=constellation`);
    await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});
    await page.waitForSelector('#stage .scene-constellation', { timeout: 45000 });
    await page.mouse.click(10, 300); // the first tap unlocks sound when jumping straight in
    // sample the output and what's on screen, every 250 ms
    await page.evaluate(() => {
      window.__trace = [];
      const t0 = performance.now();
      setInterval(() => {
        const hand = document.querySelector('.cn-hand');
        const title = document.querySelector('.bd-title');
        window.__trace.push({
          t: (performance.now() - t0) / 1000,
          lv: window.__level(),
          hand: !!(hand && hand.textContent.trim() && getComputedStyle(hand).opacity > 0.3),
          cont: !!document.querySelector('#continue:not([hidden])'),
          title: !!(title && getComputedStyle(title).visibility === 'visible'),
          scene: (document.querySelector('#stage .scene') || {}).className || '',
        });
      }, 250);
    });
    await page.waitForSelector('#continue:not([hidden])', { timeout: 300000 });
    await page.waitForTimeout(2500);
    await page.click('#continue', { force: true });
    await page.waitForFunction(() => { const t = document.querySelector('.bd-title'); return t && getComputedStyle(t).visibility === 'visible'; }, null, { timeout: 400000 });
    await page.waitForTimeout(3000);
    const tr = await page.evaluate(() => window.__trace);
    const QUIET = 0.0015;
    const handAt = tr.findIndex((s) => s.hand);
    const before = tr.slice(Math.max(0, handAt - 40), handAt); // the 10 s before her line appears
    const quietRun = (arr) => { let best = 0; let run = 0; for (const s of arr) { run = s.lv < QUIET ? run + 1 : 0; best = Math.max(best, run); } return best * 0.25; };
    const loud = (arr) => arr.filter((s) => s.lv > QUIET * 2).length;
    ok(handAt > 0, 'the handwritten line appears');
    ok(loud(tr.slice(0, Math.max(1, handAt - 40))) > 8, 'music plays through the photo heart');
    ok(quietRun(before) >= 2, `silence before the final photograph and her line (${quietRun(before).toFixed(1)} s quiet)`);
    const contAt = tr.findIndex((s) => s.cont);
    ok(contAt > handAt && loud(tr.slice(handAt, contAt + 8)) > 2, 'the music comes back after the line');
    const titleAt = tr.findIndex((s) => s.title);
    const preTitle = tr.slice(Math.max(0, titleAt - 20), titleAt + 1);
    ok(titleAt > 0 && quietRun(preTitle) >= 1, `a breath of silence just before the title (${quietRun(preTitle).toFixed(1)} s)`);
    ok(loud(tr.slice(titleAt, titleAt + 12)) > 2, 'the music returns with the title');
    ok(await running(page) === 1, 'still one audio engine after two chapters');
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? `\n✗ ${failed} audio check(s) failed` : '\n✓ audio behaves: no autoplay, mute works, the silences are real');
  process.exit(failed ? 1 : 0);
})();
