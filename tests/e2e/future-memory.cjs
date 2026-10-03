#!/usr/bin/env node
// A memory added later (as the owner will for October / November / December 2026) appears in
// "How it began" with its "when" label and words; an EMPTY one produces nothing public.
// (The data is changed only in this test's browser; nothing is written to the repository.)
//   NODE_PATH=$(npm root -g) node tests/e2e/future-memory.cjs     (needs `npm run serve`)
const { chromium } = require('playwright');

const PORT = process.env.PORT || '8090';
const WORDS = 'TEST-ONLY memory words for October.';
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/data/messages.json*', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.story.memories.push(
      { id: 'm-oct-test', kind: 'moment', when: 'October 2026', text: WORDS },
      { id: 'm-nov-test', kind: 'moment', when: 'November 2026', text: '' }, // left empty: must not show
    );
    route.fulfill({ response: res, json });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/index.html?preview&scene=story`);
  await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});
  await page.waitForSelector('#stage .scene-story', { timeout: 45000 });
  // record everything the chapter ever says
  await page.evaluate(() => {
    window.__said = new Set();
    new MutationObserver(() => {
      const w = document.querySelector('.st-words');
      if (w) window.__said.add(w.innerText.replace(/\s+/g, ' ').trim());
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.waitForSelector('#continue:not([hidden])', { timeout: 360000 });
  const said = await page.evaluate(() => [...window.__said].join(' | '));
  const low = said.toLowerCase(); // (the date label is set in capitals by CSS, and innerText reports it that way)
  ok(low.includes('october 2026') && said.includes(WORDS), 'the October memory plays, with its date and words');
  ok(!low.includes('november 2026'), 'the empty November memory produces nothing');
  ok(said.includes('We met') || said.includes('college event'), 'the four real memories still play first');
  ok(!errors.length, `no console errors${errors.length ? `: ${errors[0]}` : ''}`);
  await browser.close();
  console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ future memories: added ones play, empty ones stay invisible');
  process.exit(failed ? 1 : 0);
})();
