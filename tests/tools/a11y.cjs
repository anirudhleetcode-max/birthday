#!/usr/bin/env node
// Accessibility audit of the film, chapter by chapter (phone + desktop):
//   • every visible control has an accessible name
//   • every visible photo has an alt attribute (empty is fine when decorative)
//   • touch targets on phones are ≥ 40 px (or sit in a larger hit area)
//   • Tab reaches the controls and the focused one shows a visible focus ring
//   • the page has a language, a title, and honours reduced motion
//   NODE_PATH=$(npm root -g) node tests/tools/a11y.cjs [--scenes story,cake] [--vps 390x844,1440x900]   (needs `npm run serve`)
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const PORT = args.port || '8090';
const VPS = (args.vps || '390x844,1440x900').split(',');
// how long to let each chapter play before auditing (its interactive moment)
const PLAN = {
  invite: 6, prologue: 12, tower: 14, story: 14, hair: 12, names: 16, dance: 14, lanterns: 30,
  letter: { t: 12, act: '.lt-seal' }, cake: 16, constellation: 14, birthday: 30, hug: 10, credits: 40,
};
const SCENES = args.scenes ? args.scenes.split(',') : Object.keys(PLAN);
let problems = 0;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  for (const vp of VPS) {
    const [w, h] = vp.split('x').map(Number);
    const phone = w < 900;
    for (const s of SCENES) {
      const plan = typeof PLAN[s] === 'object' ? PLAN[s] : { t: PLAN[s] };
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, reducedMotion: s === 'story' ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/index.html?preview&scene=${s}`);
      await page.waitForFunction(() => !!window.gsap).then(() => page.evaluate(() => window.gsap.ticker.lagSmoothing(0))).catch(() => {});
      await page.waitForSelector(`#stage .scene-${s}`, { timeout: 45000 });
      if (plan.act) { await page.waitForTimeout(6000); await page.click(plan.act, { force: true, timeout: 5000 }).catch(() => {}); }
      await page.waitForTimeout((plan.t || 10) * 1000);
      const r = await page.evaluate((isPhone) => {
        const out = { unnamed: [], noAlt: [], small: [], lang: document.documentElement.lang, title: document.title, reduced: document.documentElement.classList.contains('reduced-motion') };
        const visible = (el) => {
          const rc = el.getBoundingClientRect();
          if (rc.width < 1 || rc.height < 1 || rc.bottom < 0 || rc.top > innerHeight || rc.right < 0 || rc.left > innerWidth) return false;
          for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
          }
          return true;
        };
        const hiddenFromAT = (el) => !!el.closest('[aria-hidden="true"]');
        const nameOf = (el) => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) || el.textContent || el.title || el.querySelector('img[alt]')?.alt || '').trim();
        const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;
        for (const el of document.querySelectorAll('button, [role="button"], a[href], input, select, textarea')) {
          if (!visible(el) || hiddenFromAT(el)) continue;
          if (!nameOf(el)) out.unnamed.push(label(el));
          if (isPhone) {
            const rc = el.getBoundingClientRect();
            if (Math.min(rc.width, rc.height) < 40 && !el.closest('.gal-grid')) out.small.push(`${label(el)} ${Math.round(rc.width)}×${Math.round(rc.height)}`);
          }
        }
        for (const img of document.querySelectorAll('img')) {
          if (!visible(img) || hiddenFromAT(img)) continue;
          if (!img.hasAttribute('alt')) out.noAlt.push(img.currentSrc.split('/').pop() || 'img');
        }
        return out;
      }, phone);
      // keyboard: Tab through and check the focus ring on what gets focus
      const focus = [];
      for (let k = 0; k < 6; k++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1.5) || (cs.boxShadow && cs.boxShadow !== 'none');
          return { name: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`, ring };
        });
        if (f) focus.push(f);
      }
      const noRing = [...new Set(focus.filter((f) => !f.ring).map((f) => f.name))];
      const issues = [];
      if (r.unnamed.length) issues.push(`unnamed controls: ${[...new Set(r.unnamed)].join(', ')}`);
      if (r.noAlt.length) issues.push(`images without alt: ${[...new Set(r.noAlt)].slice(0, 5).join(', ')}`);
      if (r.small.length) issues.push(`small touch targets: ${[...new Set(r.small)].join(', ')}`);
      if (noRing.length) issues.push(`focus without a visible ring: ${noRing.join(', ')}`);
      if (!r.lang) issues.push('no <html lang>');
      if (!r.title) issues.push('no document title');
      if (s === 'story' && !r.reduced) issues.push('reduced motion not applied');
      problems += issues.length;
      console.log(`${issues.length ? '✗' : '✓'} ${vp} ${s}${focus.length ? ` (tab reaches ${focus.length})` : ''}${issues.length ? `\n    ${issues.join('\n    ')}` : ''}`);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(problems ? `\n✗ ${problems} accessibility issue(s)` : '\n✓ accessibility audit passed');
  process.exit(problems ? 1 : 0);
})();
