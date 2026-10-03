#!/usr/bin/env node
// The real release moment, in several time zones: 3 January 2027, 00:00 India time.
// The browser clock starts 15 s before that instant; the countdown must read 0:00:15 (not
// hours off, as it would if the date were read as UTC or local time), the film must stay
// locked until the moment, then the lanterns light and the invitation opens.
//   NODE_PATH=$(npm root -g) node tests/e2e/release-moment.cjs   (needs `npm run serve`)
const { chromium } = require('playwright');

const PORT = process.env.PORT || '8090';
const UNLOCK = Date.UTC(2027, 0, 2, 18, 30); // = 2027-01-03T00:00:00+05:30
const ZONES = ['Asia/Kolkata', 'UTC', 'America/Los_Angeles', 'Europe/London', 'Australia/Sydney'];
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const tz of ZONES) {
    console.log(`\n▸ ${tz}`);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, timezoneId: tz });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install({ time: new Date(UNLOCK - 15000) });
    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.clock.resume(); // time flows normally from 15 s before midnight IST
    await page.waitForSelector('#stage .scene-gate', { timeout: 45000 });
    const local = await page.evaluate(() => new Date().toString());
    await page.waitForFunction(() => document.querySelector('#stage .scene-gate [aria-label*="to go"]'), null, { timeout: 30000 }).catch(() => {});
    const label = await page.evaluate(() => (document.querySelector('#stage .scene-gate [aria-label*="to go"]') || {}).getAttribute?.('aria-label') || '');
    ok(/^0 days, 0 hours and 0 minutes to go$/.test(label), `countdown just before midnight IST reads “${label}” (browser local time: ${local.slice(0, 24)})`);
    const lockedEarly = await page.evaluate(() => !!document.querySelector('#stage .scene-gate') && !document.querySelector('#stage .scene-invite'));
    ok(lockedEarly, 'still locked before the moment');
    // after the moment: the gate celebrates and the invitation opens (the gate may ask for a tap)
    const t0 = Date.now();
    let opened = false;
    while (Date.now() - t0 < 90000) {
      await page.waitForTimeout(1000);
      const st = await page.evaluate(() => ({
        invite: !!document.querySelector('#stage .scene-invite'),
        btn: (() => { const b = document.querySelector('#stage .scene-gate button'); if (!b) return null; const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.4 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })(),
      }));
      if (st.invite) { opened = true; break; }
      if (st.btn) await page.mouse.click(st.btn.x, st.btn.y);
    }
    const when = await page.evaluate(() => Date.now());
    ok(opened && when >= UNLOCK, `opens after 00:00 IST (${opened ? `${Math.round((when - UNLOCK) / 1000)} s after` : 'never opened'})`);
    ok(!errors.length, `no console errors${errors.length ? `: ${errors[0]}` : ''}`);
    await context.close();
  }
  await browser.close();
  console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ the release moment is midnight in India, in every time zone');
  process.exit(failed ? 1 : 0);
})();
