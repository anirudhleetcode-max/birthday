#!/usr/bin/env node
// Rough performance numbers: first load (bytes, requests, time to the first screen) and, per
// chapter, what it downloads, JS memory, and frame timing. Run it again after uploading photos.
// In this headless browser the 3D runs on a SOFTWARE renderer, so frame rates here are far
// below a phone's; use them to compare runs, not as real-device numbers.
//   NODE_PATH=$(npm root -g) node tests/tools/perf.cjs [--vp 390x844] [--scenes tower,cake]
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const [W, H] = (args.vp || '390x844').split('x').map(Number);
const PORT = args.port || '8090';
const SCENES = (args.scenes || 'prologue,tower,hair,names,dance,lanterns,letter,cake,constellation,birthday,hug,credits').split(',');
const kb = (n) => `${Math.round(n / 1024)} KB`;

async function session(browser, url, settle) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 900 });
  const page = await ctx.newPage();
  let bytes = 0;
  let imgBytes = 0;
  let requests = 0;
  page.on('response', async (r) => {
    try {
      const len = Number(r.headers()['content-length']) || (await r.body()).length;
      bytes += len;
      requests++;
      if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(r.url())) imgBytes += len;
    } catch { /* body not available */ }
  });
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});
  await page.waitForSelector('#stage .scene', { timeout: 60000 });
  const firstScreen = Date.now() - t0;
  await page.waitForTimeout(settle);
  const m = await page.evaluate(() => new Promise((res) => {
    const gaps = [];
    let last = performance.now();
    const end = last + 4000;
    const f = (t) => { gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res({ gaps, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }); };
    requestAnimationFrame(f);
  }));
  const sorted = m.gaps.slice(1).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  await ctx.close();
  return { bytes, imgBytes, requests, firstScreen, heap: m.heap, fps: median ? 1000 / median : 0, p95 };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  console.log(`viewport ${W}×${H} · headless Chromium, software 3D (not a phone)\n`);
  const first = await session(browser, `http://localhost:${PORT}/index.html?preview`, 3000);
  console.log(`first load: ${kb(first.bytes)} in ${first.requests} requests, first screen after ${(first.firstScreen / 1000).toFixed(1)} s, JS heap ${kb(first.heap)}\n`);
  console.log('chapter        downloads   of which images   JS heap    frames (median fps · p95 frame ms)');
  for (const s of SCENES) {
    const r = await session(browser, `http://localhost:${PORT}/index.html?preview&scene=${s}`, 8000);
    console.log(`${s.padEnd(14)} ${kb(r.bytes).padStart(9)}   ${kb(r.imgBytes).padStart(15)}   ${kb(r.heap).padStart(8)}   ${r.fps.toFixed(0).padStart(3)} fps · ${r.p95.toFixed(0)} ms`);
  }
  await browser.close();
})();
