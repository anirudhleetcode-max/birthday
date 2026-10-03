#!/usr/bin/env node
// The final montage, measured: the photo heart uses a chosen 9–14 photographs (not all of them),
// in film order, no repeats, each arriving a little later than the last (it slows down); the
// final photograph is not part of it and appears alone with the handwritten line. Then the
// birthday chapter: the photo-lanterns and the ring around the title don't repeat each other.
// Screenshots of the last frames go to --out.
//   NODE_PATH=$(npm root -g) node tests/e2e/finale-montage.cjs [--vp 390x844] [--out dir]   (needs `npm run serve`)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const [W, H] = (args.vp || '390x844').split('x').map(Number);
const OUT = args.out || path.join(require('os').tmpdir(), 'finale-montage');
const PORT = process.env.PORT || '8090';
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };
const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };

(async () => {
  const site = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'photos.json'), 'utf8'));
  const records = (site.photos || site).filter((p) => p.enabled !== false);
  const browser = await chromium.launch(LAUNCH);

  console.log(`▸ the photo heart (${W}×${H})`);
  {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 900 });
    await ctx.addInitScript(() => { window.__CN_DEV__ = true; });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/index.html?preview&scene=constellation`);
    await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});
    await page.waitForFunction(() => !!window.__cn, null, { timeout: 120000 });
    const { montage, reveal } = await page.evaluate(() => window.__cn);
    const ids = montage.map((m) => m.id);
    console.log(`  ${ids.join(' · ')}  →  last: ${reveal}`);
    ok(ids.length >= 9 && ids.length <= 14, `a chosen ${ids.length} photographs, not all ${records.length}`);
    ok(new Set(ids).size === ids.length, 'no photograph twice');
    ok(!ids.includes(reveal), 'the final photograph is kept for its own moment');
    const rank = (id) => records.findIndex((r) => r.id === id);
    const film = await page.evaluate(() => (window.__film && window.__film.store && window.__film.store.real ? window.__film.store.real().map((p) => p.id) : null));
    const order = film || records.map((r) => r.id);
    const pos = ids.map((id) => order.indexOf(id));
    ok(pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1])), 'in the order the film showed them (not random)');
    const at = montage.map((m) => m.at);
    const gaps = at.slice(1).map((v, i) => v - at[i]);
    const half = Math.floor(gaps.length / 2);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    ok(mean(gaps.slice(half)) > 2.5 * mean(gaps.slice(0, half)) && gaps[gaps.length - 1] > 0.8, `it slows down (gaps ${gaps.map((g) => g.toFixed(2)).join(', ')} s)`);
    ok(rank(reveal) >= 0, 'the final photograph is one of her real photos');
    // the final frame: her photograph alone, with the handwritten line
    await page.waitForFunction(() => { const h = document.querySelector('.cn-hand'); return h && h.textContent.trim().length > 10 && getComputedStyle(h).opacity > 0.9; }, null, { timeout: 400000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `final-frame-${W}x${H}.png`) });
    const frame = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('#stage .scene-constellation img')].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 40 && getComputedStyle(i).visibility !== 'hidden'; });
      const cv = document.querySelector('#stage .scene-constellation canvas');
      return { imgs: imgs.map((i) => i.currentSrc || i.src), canvasHidden: !cv || getComputedStyle(cv).visibility === 'hidden' };
    });
    const revealRec = records.find((r) => r.id === reveal);
    ok(frame.canvasHidden && frame.imgs.length === 1 && revealRec && frame.imgs[0].includes(path.basename(revealRec.src).split('.')[0]), 'the last frame is her final photograph, alone');
    ok(!errors.length, `no console errors${errors.length ? `: ${errors[0]}` : ''}`);
    await ctx.close();
  }

  console.log('\n▸ the birthday chapter');
  {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 900 });
    await ctx.addInitScript(() => { window.__BD_DEV__ = true; });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/index.html?preview&scene=birthday`);
    await page.waitForFunction(() => !!window.__bd, null, { timeout: 120000 });
    const bd = await page.evaluate(() => window.__bd);
    console.log(`  photo-lanterns: ${bd.lanterns.join(' · ')}\n  ring: ${bd.orbit.join(' · ')}`);
    ok(new Set([...bd.lanterns, ...bd.orbit]).size === bd.lanterns.length + bd.orbit.length, 'the photo-lanterns and the ring never show the same photograph');
    ok(bd.orbit.length >= 9 && bd.orbit.length <= 14, `the ring around the title: ${bd.orbit.length} chosen photographs`);
    await page.waitForFunction(() => { const t = document.querySelector('.bd-title'); return t && getComputedStyle(t).visibility === 'visible'; }, null, { timeout: 400000 });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: path.join(OUT, `title-${W}x${H}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(`\nscreenshots: ${OUT}`);
  console.log(failed ? `\n✗ ${failed} montage check(s) failed` : '\n✓ the final montage: chosen, in order, slowing down, ending on her photograph');
  process.exit(failed ? 1 : 0);
})();
