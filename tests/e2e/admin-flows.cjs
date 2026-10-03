#!/usr/bin/env node
// End-to-end flows of the Lantern Room admin, with the GitHub API mocked (page.route).
//   (static server on :8090)  NODE_PATH=$(npm root -g) node tests/e2e/admin-flows.cjs [--port 8090] [--shots dir] [--headed]
//
// Covers: library renders all photos · ADD (count +1, ratio locked) · REPLACE matching ratio (no warning) ·
// REPLACE mismatched → "Expected ratio: 4:5 · Uploaded ratio: 16:9" → CROP (exact ratio) / CONTAIN (exact ratio) /
// CHOOSE ANOTHER · DELETE + undo · REORDER (buttons, keyboard, drag) · edit caption + focal point · messages &
// settings edits · unsaved-changes guard · draft restore · SAVE DRAFT → film ?preview&draft shows blob: images while
// ?preview does not · PUBLISH = one commit (split JSON + new blobs + deletion of the replaced files) · EXPORT zip.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const PORT = args.port || '8090';
const BASE = `http://localhost:${PORT}`;
const SHOTS = typeof args.shots === 'string' ? args.shots : '';
const ROOT = path.resolve(__dirname, '../..');

let failures = 0;
let step = 0;
const ok = (cond, msg, extra = '') => {
  step++;
  if (cond) console.log(`  ok ${String(step).padStart(2)}  ${msg}`);
  else { failures++; console.log(`  FAIL ${String(step).padStart(2)}  ${msg}${extra ? `\n          ${extra}` : ''}`); }
  return cond;
};
const section = (t) => console.log(`\n▸ ${t}`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

/* ---------------------------------------------------------------- mock repository */
// The repo starts in the placeholder state (36 empty photo spots): tests/fixtures/*.json. The live data/*.json
// hold the real photos; the fixtures keep the current settings and words.
const FIXTURE = (name) => path.join('tests/fixtures', `${name}.json`);
function makeRepo(images) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const photos = read(FIXTURE('photos'));
  const hero = photos.photos.find((p) => p.role === 'hero') || photos.photos[0];
  Object.assign(hero, { src: 'photos/hero-old.jpg', thumb: 'photos/thumbs/hero-old.jpg', original: 'photos/originals/hero-old.jpg', crop: null });
  const text = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const files = {
    'index.html': Buffer.from('<!doctype html>'),
    'data/settings.json': Buffer.from(text(read(FIXTURE('settings')))),
    'data/messages.json': Buffer.from(text(read(FIXTURE('messages')))),
    'data/photos.json': Buffer.from(text(photos)),
    'photos/hero-old.jpg': images.p45,
    'photos/thumbs/hero-old.jpg': images.p45,
    'photos/originals/hero-old.jpg': images.p45,
    'photos/.gitkeep': Buffer.from(''),
  };
  return { files, heroId: hero.id, calls: [], head: 'c0' };
}

async function mockGitHub(context, repo) {
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = decodeURIComponent(u.pathname.replace(/^\/repos\/o\/r/, ''));
    const method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    repo.calls.push({ method, path: p, body });
    if (method === 'GET' && p === '') return json(route, 200, { full_name: 'o/r', private: false, permissions: { push: true }, default_branch: 'main' });
    if (method === 'GET' && p.startsWith('/branches/')) return json(route, 200, { name: 'main' });
    if (method === 'GET' && p === '/git/ref/heads/main') return json(route, 200, { object: { sha: repo.head } });
    if (method === 'GET' && p.startsWith('/git/commits/')) return json(route, 200, { sha: repo.head, tree: { sha: `tree-${repo.head}` } });
    if (method === 'GET' && p.startsWith('/git/trees/')) return json(route, 200, { tree: Object.keys(repo.files).map((f) => ({ path: f, type: 'blob', mode: '100644' })) });
    if (method === 'GET' && p.startsWith('/contents/')) {
      const f = p.slice('/contents/'.length);
      const data = repo.files[f];
      if (!data) return json(route, 404, { message: 'Not Found' });
      if (/raw/.test(req.headers().accept || '')) return route.fulfill({ status: 200, contentType: f.endsWith('.json') ? 'application/json' : 'image/png', body: data });
      return json(route, 200, { type: 'file', encoding: 'base64', content: data.toString('base64'), sha: `sha-${f}`, size: data.length, path: f });
    }
    if (method === 'POST' && p === '/git/blobs') return json(route, 201, { sha: `blob-${repo.calls.length}` });
    if (method === 'POST' && p === '/git/trees') return json(route, 201, { sha: 'tree-new' });
    if (method === 'POST' && p === '/git/commits') return json(route, 201, { sha: 'c1' });
    if (method === 'PATCH' && p === '/git/refs/heads/main') { repo.head = 'c1'; return json(route, 200, { object: { sha: 'c1' } }); }
    return json(route, 500, { message: `unmocked ${method} ${p}` });
  });
  // public raw fallback (thumbnails of files that are on GitHub but not on this server)
  await context.route('https://raw.githubusercontent.com/**', async (route) => {
    const f = decodeURIComponent(new URL(route.request().url()).pathname.split('/').slice(4).join('/'));
    const data = repo.files[f];
    if (data) return route.fulfill({ status: 200, contentType: 'image/png', body: data });
    return route.fulfill({ status: 404, body: '' });
  });
}

/* ---------------------------------------------------------------- page helpers */
const photo = (page, id) => page.evaluate((i) => JSON.parse(JSON.stringify(window.__lanternRoom.state.site.photos.find((p) => p.id === i) || null)), id);
const allPhotos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__lanternRoom.state.site.photos)));
const blobInfo = (page, p) => page.evaluate(async (pp) => {
  const b = window.__lanternRoom.state.files.get(pp);
  if (!b) return null;
  const bmp = await createImageBitmap(b);
  const out = { w: bmp.width, h: bmp.height, type: b.type, size: b.size };
  bmp.close();
  return out;
}, p);
const exact = (d, ratio) => { const [a, b] = ratio.split(':').map(Number); return !!d && d.w * b === d.h * a; };
async function chooseFile(page, trigger, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), trigger()]);
  await fc.setFiles(file);
}
const chapterCount = (page, ch) => page.locator(`.lib-block[data-chapter="${ch}"] .pcard`).count();
const idsIn = (page, ch) => page.$$eval(`.lib-block[data-chapter="${ch}"] .pcard`, (els) => els.map((e) => e.dataset.id));
async function waitIdle(page) {
  await page.waitForFunction(() => { const b = document.getElementById('busy'); return !b || b.hidden; }, null, { timeout: 30000 });
}
async function goSection(page, id) {
  await page.evaluate((s) => { location.hash = `#${s}`; }, id);
  await page.waitForSelector(`#view[data-section="${id}"]`);
}

/* ---------------------------------------------------------------- the run */
(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const syn = await import(pathToFileURL(path.join(ROOT, 'tests/admin/synthetic.mjs')).href);
  const png = (scene, w, h) => Buffer.from(syn.encodePNG(syn.makeScene(scene, w, h), w, h));
  const IMG = {
    p45: png('daylight', 400, 500), // 4:5
    p45b: png('low-light', 480, 600), // 4:5
    w169: png('tungsten', 640, 360), // 16:9
    w169b: png('purple-party', 800, 450), // 16:9
    p34: png('cool-indoor', 450, 600), // 3:4
  };
  const file = (name, buf) => ({ name, mimeType: 'image/png', buffer: buf });

  const browser = await chromium.launch({ headless: args.headed !== true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const repo = makeRepo(IMG);
  await mockGitHub(context, repo);
  await context.addInitScript(() => {
    try {
      if (location.pathname.includes('/admin')) {
        localStorage.setItem('deepu-admin-token', 'test-token');
        localStorage.setItem('deepu-admin-repo', JSON.stringify({ owner: 'o', repo: 'r', branch: 'main' }));
        localStorage.setItem('deepu-admin-welcomed', '1');
      }
    } catch { /* ignore */ }
    // record blob: URLs created (diagnostics for the film preview check)
    const orig = URL.createObjectURL.bind(URL);
    window.__blobUrls = [];
    URL.createObjectURL = (o) => { const u = orig(o); try { window.__blobUrls.push({ url: u, type: o && o.type, size: o && o.size }); } catch { /* ignore */ } return u; };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.type()); await d.accept().catch(() => {}); });

  try {
    /* ---------- boot ---------- */
    section('Boot & library');
    await page.goto(`${BASE}/admin/#library`);
    await page.waitForSelector('#view[data-section="library"] .pcard', { timeout: 20000 });
    const total = JSON.parse(repo.files['data/photos.json'].toString()).photos.length;
    ok(await page.locator('.pcard').count() === total, `library renders all ${total} photos`, `got ${await page.locator('.pcard').count()}`);
    ok(/Connected/.test(await page.textContent('#status')), 'status shows Connected (mocked GitHub)');
    await page.waitForFunction((id) => { const img = document.querySelector(`.pcard[data-id="${id}"] .pcard-frame img`); return img && img.complete && img.naturalWidth > 0; }, repo.heroId, { timeout: 10000 }).catch(() => {});
    ok(await page.$eval(`.pcard[data-id="${repo.heroId}"] .pcard-frame img`, (i) => i.naturalWidth > 0).catch(() => false), 'existing photo thumbnail loads (raw GitHub fallback)');
    ok(await page.locator('.pcard.is-empty .empty-art').count() > 0, 'empty spots show the empty-state at their ratio');
    await shot(page, '01-library');

    section('Unsaved-changes guard (clean)');
    dialogs.length = 0;
    await page.click('[data-filter="tower"]');
    await page.reload();
    await page.waitForSelector('#view[data-section="library"] .pcard');
    ok(dialogs.length === 0, 'no leave warning without changes', dialogs.join(','));
    await page.click('[data-filter="all"]');

    /* ---------- add ---------- */
    section('ADD a photo to the tower');
    const towerBefore = await chapterCount(page, 'tower');
    await page.click('[data-testid="add-to-tower"]');
    await page.waitForSelector('[data-testid="add-chapter"]');
    ok(await page.$eval('[data-testid="add-chapter"]', (s) => s.value) === 'tower', 'chapter preselected');
    ok(await page.getAttribute('.sheet .shape-chip[aria-checked="true"]', 'data-ratio') === '3:4', 'shape defaults to the chapter ratio (3:4)');
    await chooseFile(page, () => page.click('[data-testid="add-choose"]'), file('tower-new.png', IMG.w169));
    await page.waitForSelector('.cropper.in');
    ok((await page.textContent('.crop-rule .ratio-badge')).trim() === '3:4', 'cropper locked to 3:4');
    await page.click('[data-testid="crop-confirm"]');
    await page.waitForSelector('[data-testid="details-caption"]');
    await page.fill('[data-testid="details-label"]', 'Tower — new memory');
    await page.fill('[data-testid="details-caption"]', 'The day we laughed');
    await page.click('[data-testid="details-add"]');
    await page.waitForFunction((n) => document.querySelectorAll('.lib-block[data-chapter="tower"] .pcard').length === n + 1, towerBefore, { timeout: 20000 });
    ok(true, `tower count increased ${towerBefore} → ${towerBefore + 1}`);
    const added = (await allPhotos(page)).filter((p) => p.chapter === 'tower').sort((a, b) => b.order - a.order)[0];
    ok(added.label === 'Tower — new memory' && added.caption === 'The day we laughed' && added.ratio === '3:4', 'new record has details + 3:4 ratio');
    const addDisp = await blobInfo(page, added.src);
    ok(exact(addDisp, '3:4'), `display image exactly 3:4 (${addDisp && `${addDisp.w}×${addDisp.h} ${addDisp.type}`})`);
    ok(/^photos\/thumbs\/.+\.jpg$/.test(added.thumb) && exact(await blobInfo(page, added.thumb), '3:4'), 'thumb exists (jpg, 3:4)');
    ok(/^photos\/originals\/.+\.png$/.test(added.original) && (await blobInfo(page, added.original)).size === IMG.w169.length, 'original stored untouched (same bytes)');
    ok(await page.locator(`.pcard[data-id="${added.id}"] .badge.ratio`).textContent() === '3:4', 'card shows the locked 3:4 badge');

    /* ---------- replace (matching) ---------- */
    section('REPLACE with a matching ratio');
    const heroBefore = await photo(page, repo.heroId);
    await chooseFile(page, () => page.click(`.pcard[data-id="${repo.heroId}"] [data-act="replace"]`), file('hero-new.png', IMG.p45b));
    await page.waitForFunction((id) => { const p = window.__lanternRoom.state.site.photos.find((x) => x.id === id); return p && p.src !== 'photos/hero-old.jpg'; }, repo.heroId, { timeout: 20000 });
    ok(await page.locator('[data-testid="ratio-warning"]').count() === 0, 'no ratio warning for a 4:5 photo in a 4:5 spot');
    const heroAfter = await photo(page, repo.heroId);
    ok(exact(await blobInfo(page, heroAfter.src), '4:5'), 'replacement display is exactly 4:5');
    ok(heroAfter.original !== heroBefore.original && heroAfter.cropMode === 'cover', 'new original kept, cover mode');
    await waitIdle(page);

    /* ---------- replace (mismatch → crop) ---------- */
    section('REPLACE with a mismatched ratio → CROP');
    const all45 = (await allPhotos(page)).filter((p) => p.ratio === '4:5' && p.id !== repo.heroId && !p.src);
    const cropTarget = all45[0].id;
    const containTarget = all45[1].id;
    const anotherTarget = all45[2].id;
    await chooseFile(page, () => page.click(`.pcard[data-id="${cropTarget}"] [data-act="replace"]`), file('wide.png', IMG.w169));
    await page.waitForSelector('[data-testid="ratio-warning"]');
    const warning = (await page.textContent('[data-testid="ratio-warning"]')).trim();
    ok(warning === 'Expected ratio: 4:5 · Uploaded ratio: 16:9', `warning text: “${warning}”`);
    ok(await page.locator('[data-choice="crop"]').isVisible() && await page.locator('[data-choice="contain"]').isVisible() && await page.locator('[data-choice="another"]').isVisible(), 'three choices: crop / contain / choose another');
    await shot(page, '02-ratio-warning');
    await page.click('[data-choice="crop"]');
    await page.waitForSelector('.cropper.in');
    ok((await page.textContent('.crop-rule .ratio-badge')).trim() === '4:5', 'cropper locked to the expected 4:5');
    await shot(page, '03-cropper');
    await page.click('[data-testid="crop-confirm"]');
    await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, cropTarget, { timeout: 20000 });
    const cropped = await photo(page, cropTarget);
    const cd = await blobInfo(page, cropped.src);
    ok(exact(cd, '4:5'), `CROP path yields exactly 4:5 (${cd && `${cd.w}×${cd.h}`})`);
    ok(cropped.cropMode === 'cover' && cropped.crop && Math.abs((cropped.crop.w * 640) / (cropped.crop.h * 360) - 0.8) < 0.01, 'crop rect recorded (normalised, 4:5 of the original)');
    await waitIdle(page);

    section('REPLACE with a mismatched ratio → CONTAIN');
    await chooseFile(page, () => page.click(`.pcard[data-id="${containTarget}"] [data-act="replace"]`), file('wide2.png', IMG.w169b));
    await page.waitForSelector('[data-testid="ratio-warning"]');
    await page.click('[data-choice="contain"]');
    await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, containTarget, { timeout: 20000 });
    const contained = await photo(page, containTarget);
    const ctd = await blobInfo(page, contained.src);
    ok(exact(ctd, '4:5') && contained.cropMode === 'contain', `CONTAIN path yields exactly 4:5, mode contain (${ctd && `${ctd.w}×${ctd.h}`})`);
    // the whole 16:9 picture is inside: its rows at the very top/bottom are the soft extension (darker than the middle)
    const bands = await page.evaluate(async (p) => {
      const bmp = await createImageBitmap(window.__lanternRoom.state.files.get(p));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const row = (y) => { const d = x.getImageData(0, y, bmp.width, 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
      return { top: row(2), mid: row(Math.round(bmp.height / 2)), bottom: row(bmp.height - 3) };
    }, contained.src);
    ok(bands.top > 4 && bands.top < bands.mid, `blurred, darkened extension above/below the photo (top ${bands.top.toFixed(0)} < mid ${bands.mid.toFixed(0)})`);
    await waitIdle(page);

    section('REPLACE → CHOOSE ANOTHER PHOTO');
    await chooseFile(page, () => page.click(`.pcard[data-id="${anotherTarget}"] [data-act="replace"]`), file('wide3.png', IMG.w169));
    await page.waitForSelector('[data-testid="ratio-warning"]');
    await chooseFile(page, () => page.click('[data-choice="another"]'), file('portrait.png', IMG.p45));
    await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, anotherTarget, { timeout: 20000 });
    ok(exact(await blobInfo(page, (await photo(page, anotherTarget)).src), '4:5'), 'second choice (4:5) accepted without a warning');
    await waitIdle(page);

    /* ---------- fill empty spots ---------- */
    section('FILL EMPTY SPOTS (bulk)');
    const emptyBefore = (await allPhotos(page)).filter((p) => !p.src && p.enabled !== false).length;
    await chooseFile(page, () => page.click('[data-testid="fill-empty"]'), [file('a.png', IMG.p34), file('b.png', IMG.w169b)]);
    await page.waitForSelector('.review-card img', { timeout: 20000 });
    await page.waitForFunction(() => /2 photos ready/.test(document.querySelector('.review-status')?.textContent || ''), null, { timeout: 30000 });
    ok(await page.locator('.review-card').count() === 2, 'review grid shows one card per photo, each with Adjust / Skip');
    await shot(page, '02b-bulk-review');
    await page.click('[data-testid="bulk-apply"]');
    await page.waitForFunction((n) => window.__lanternRoom.state.site.photos.filter((p) => !p.src && p.enabled !== false).length === n - 2, emptyBefore, { timeout: 30000 });
    const filled = (await allPhotos(page)).filter((p) => p.src && p.addedAt && !['photos/hero-old.jpg'].includes(p.src));
    let allExact = true;
    for (const p of filled) { const d = await blobInfo(page, p.src); if (!exact(d, p.ratio)) allExact = false; }
    ok(allExact, `two empty spots filled; every new display image has its spot's exact ratio (${filled.length} checked)`);
    await waitIdle(page);

    /* ---------- delete + undo ---------- */
    section('DELETE + undo');
    const n0 = await page.locator('.pcard').count();
    const victim = (await idsIn(page, 'dance'))[2];
    await page.click(`.pcard[data-id="${victim}"] [data-act="delete"]`);
    await page.waitForFunction((n) => document.querySelectorAll('.pcard').length === n - 1, n0);
    ok(!(await photo(page, victim)), 'photo deleted');
    ok(await page.locator('.toast-action:has-text("Undo")').count() === 1, 'only the latest action offers Undo');
    await page.click('.toast.has-action .toast-action:has-text("Undo")');
    await page.waitForFunction((n) => document.querySelectorAll('.pcard').length === n, n0);
    ok(!!(await photo(page, victim)) && (await idsIn(page, 'dance'))[2] === victim, 'undo restores it in the same place');

    /* ---------- reorder ---------- */
    section('REORDER');
    const t0 = await idsIn(page, 'tower');
    await page.click(`.pcard[data-id="${t0[0]}"] [data-act="down"]`);
    let t1 = await idsIn(page, 'tower');
    ok(t1[0] === t0[1] && t1[1] === t0[0], 'move-later button swaps with the next photo');
    ok(await page.evaluate((id) => document.activeElement && document.activeElement.dataset.fk === `down-${id}`, t0[0]), 'focus stays on the moved photo’s control');
    await page.focus(`.pcard[data-id="${t0[0]}"] .grip`);
    await page.keyboard.press('ArrowUp');
    t1 = await idsIn(page, 'tower');
    ok(t1[0] === t0[0], 'keyboard (arrow on the grip) moves it back');
    const orders = (await allPhotos(page)).filter((p) => p.chapter === 'tower').sort((a, b) => a.order - b.order).map((p) => p.id);
    ok(JSON.stringify(orders) === JSON.stringify(t1), 'order fields follow the screen (model.reorder)');
    // drag the first card onto the third
    const g = await page.locator(`.pcard[data-id="${t1[0]}"] .grip`).boundingBox();
    const target = await page.locator(`.pcard[data-id="${t1[2]}"]`).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    const tx = target.x + target.width * 0.75;
    const ty = target.y + target.height / 2;
    for (let i = 1; i <= 12; i++) await page.mouse.move(g.x + (tx - g.x) * (i / 12), g.y + (ty - g.y) * (i / 12));
    await page.mouse.up();
    await page.waitForTimeout(150);
    const t2 = await idsIn(page, 'tower');
    ok(t2.indexOf(t1[0]) >= 2, `drag-and-drop moved it (${t1.slice(0, 3).join(',')} → ${t2.slice(0, 3).join(',')})`);

    /* ---------- edit caption + focal ---------- */
    section('EDIT caption & focal point');
    await page.click(`.pcard[data-id="${repo.heroId}"] [data-act="edit"]`);
    await page.waitForSelector('[data-testid="edit-caption"]');
    await page.waitForSelector('.editor-stage canvas', { timeout: 15000 });
    await page.fill('[data-testid="edit-caption"]', 'Our very first photo ✨');
    const fp = await page.locator('[data-testid="focal-picker"]').boundingBox();
    await page.mouse.click(fp.x + fp.width * 0.3, fp.y + fp.height * 0.3);
    await page.focus('[data-testid="focal-picker"]');
    await page.keyboard.press('ArrowRight');
    await shot(page, '04-editor');
    await page.click('[data-testid="edit-save"]');
    await page.waitForFunction((id) => window.__lanternRoom.state.site.photos.find((x) => x.id === id).caption === 'Our very first photo ✨', repo.heroId);
    const edited = await photo(page, repo.heroId);
    ok(Math.abs(edited.focal.x - 0.32) < 0.03 && Math.abs(edited.focal.y - 0.3) < 0.03, `focal stored normalised (${edited.focal.x}, ${edited.focal.y})`);
    ok(edited.src === heroAfter.src, 'focal/caption edits keep the same display file (no needless re-encode)');
    await page.click(`.pcard[data-id="${repo.heroId}"] [data-act="edit"]`);
    await page.waitForSelector('.editor-stage canvas', { timeout: 15000 });
    await page.getByLabel('Warmth').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.getByLabel('Brightness').focus();
    await page.keyboard.press('ArrowLeft');
    await page.click('[data-testid="edit-save"]');
    await page.waitForFunction((id) => { const p = window.__lanternRoom.state.site.photos.find((x) => x.id === id); return p.grade && p.grade.warmth > 0.15; }, repo.heroId, { timeout: 20000 });
    const graded = await photo(page, repo.heroId);
    ok(graded.src !== edited.src && graded.original === edited.original && Math.abs(graded.grade.warmth - 0.2) < 0.001 && graded.grade.exposure < 0, 'per-photo grade override regenerates display + thumb from the untouched original');
    ok(exact(await blobInfo(page, graded.src), '4:5') && exact(await blobInfo(page, graded.thumb), '4:5'), 're-graded copies keep the exact ratio');
    await waitIdle(page);

    /* ---------- messages & settings ---------- */
    section('Messages & settings');
    await goSection(page, 'messages');
    const greeting = page.getByLabel('Greeting', { exact: true });
    await greeting.fill('Hey {nick1}, it’s finally here.');
    ok(await page.evaluate(() => window.__lanternRoom.state.site.text.invite.greeting) === 'Hey {nick1}, it’s finally here.', 'message edit lands in site.text');
    ok(/\{name\}.*\{nick1\}.*\{age\}/.test(await page.textContent('.tokens')), 'token help is shown');
    await goSection(page, 'settings');
    await page.getByLabel('Your WhatsApp number').fill('+91 98123 45678');
    ok(await page.evaluate(() => window.__lanternRoom.state.site.settings.whatsapp) === '919812345678', 'WhatsApp keeps digits only');
    const beforeRegrade = (await allPhotos(page)).filter((p) => p.src).map((p) => [p.id, p.src]);
    await page.click('[data-testid="regrade-all"]');
    await page.click('[data-testid="confirm-ok"]');
    await page.waitForSelector('.toast:has-text("Re-graded")', { timeout: 60000 });
    const afterRegrade = await allPhotos(page);
    const changedSrc = beforeRegrade.filter(([id, src]) => afterRegrade.find((p) => p.id === id).src !== src).length;
    ok(changedSrc === beforeRegrade.length, `re-grade all made fresh copies for ${changedSrc}/${beforeRegrade.length} photos (originals unchanged)`);
    ok(beforeRegrade.every(([id]) => { const p = afterRegrade.find((x) => x.id === id); return !p.original || p.original.startsWith('photos/originals/'); }), 'originals untouched by re-grading');
    await waitIdle(page);
    await page.fill('[data-testid="unlock-at"]', '2027-01-02T23:30');
    await page.dispatchEvent('[data-testid="unlock-at"]', 'change');
    ok(await page.evaluate(() => window.__lanternRoom.state.site.settings.lock.unlockAt) === '2027-01-02T23:30:00+05:30', 'unlock time stored as IST (+05:30)');
    // audio & video
    await goSection(page, 'audio');
    await chooseFile(page, () => page.click('[data-testid="media-music-pick"]'), { name: 'our-song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(4096, 7) });
    await page.waitForFunction(() => !!window.__lanternRoom.state.site.media.music);
    const music = await page.evaluate(() => window.__lanternRoom.state.site.media.music);
    ok(/^media\/music-\d{8}-\d{6}\.mp3$/.test(music) && await page.evaluate((m) => window.__lanternRoom.state.files.has(m), music), `music staged as ${music}`);
    ok(await page.locator('[data-media="music"] audio').count() === 1, 'music preview player shown');
    await goSection(page, 'video');
    await chooseFile(page, () => page.click('[data-testid="media-video-pick"]'), { name: 'big.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(26 * 1024 * 1024, 1) });
    await page.waitForSelector('.sheet-title:has-text("big file")');
    ok(/26(\.\d)? MB/.test(await page.textContent('.sheet .sheet-text')), 'videos over 25 MB ask first (size shown)');
    await page.click('.sheet button:has-text("Choose another")');
    ok(await page.evaluate(() => window.__lanternRoom.state.site.media.video) === null, 'declining keeps the video empty');

    // every control in every section has an accessible name
    const unlabeled = [];
    for (const sec of ['library', 'chapters', 'messages', 'audio', 'video', 'theme', 'preview', 'settings', 'help']) {
      await goSection(page, sec);
      if (sec === 'messages') await page.click('button:has-text("Open all")');
      const bad = await page.evaluate(() => [...document.querySelectorAll('#view input, #view select, #view textarea, #view button, #view a[href], .topbar button, .sidebar a')]
        .filter((el) => el.offsetParent !== null || el.type === 'checkbox')
        .filter((el) => !((el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || (el.textContent || '').trim()))
        .map((el) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`));
      if (bad.length) unlabeled.push(`${sec}: ${[...new Set(bad)].join(', ')}`);
    }
    ok(!unlabeled.length, 'every control has an accessible name (all sections)', unlabeled.join(' | '));
    await goSection(page, 'library');
    ok(/Draft · \d+ unpublished change/.test(await page.textContent('#status')), `status shows the draft (${(await page.textContent('#status .status-main')).trim()})`);

    /* ---------- save draft + guard + restore ---------- */
    section('SAVE DRAFT, leave guard, restore');
    await page.click('[data-action="save"]');
    await page.waitForSelector('.toast:has-text("Draft saved")');
    ok(true, 'explicit Save draft confirms');
    const expectPhotos = (await allPhotos(page)).length;
    dialogs.length = 0;
    await page.reload();
    ok(dialogs.includes('beforeunload'), 'leaving with unpublished changes asks first (beforeunload)', dialogs.join(','));
    await page.waitForSelector('[data-testid="draft-continue"]', { timeout: 20000 });
    await page.click('[data-testid="draft-continue"]');
    await page.waitForSelector('.pcard');
    ok((await allPhotos(page)).length === expectPhotos && !!(await blobInfo(page, (await photo(page, cropTarget)).src)), 'draft restored with its new image files');

    /* ---------- film preview ---------- */
    section('Film preview (draft vs published)');
    const film = await context.newPage();
    const filmErrors = [];
    film.on('pageerror', (e) => filmErrors.push(e.message));
    await film.goto(`${BASE}/index.html?preview&draft&scene=tower`);
    const blobSel = () => {
      const els = [...document.querySelectorAll('img, image, video, source, [style*="blob:"]')];
      return els.some((e) => (e.currentSrc || e.src || e.getAttribute('href') || e.getAttribute('xlink:href') || '').startsWith('blob:') || /blob:/.test(e.getAttribute('style') || ''))
        || [...document.querySelectorAll('*')].some((e) => /url\("?blob:/.test(getComputedStyle(e).backgroundImage));
    };
    const draftShows = await film.waitForFunction(blobSel, null, { timeout: 30000 }).then(() => true).catch(() => false);
    const created = await film.evaluate(() => window.__blobUrls.filter((b) => /^image\//.test(b.type || '')).length);
    ok(draftShows, `?preview&draft&scene=tower shows the new image via a blob: URL (${created} image blob URLs)`);
    await film.screenshot({ path: SHOTS ? path.join(SHOTS, '05-film-draft.png') : path.join(require('os').tmpdir(), 'film-draft.png') }).catch(() => {});
    await film.goto(`${BASE}/index.html?preview&scene=tower`);
    await film.waitForTimeout(6000);
    const liveShows = await film.evaluate(blobSel);
    const liveCreated = await film.evaluate(() => window.__blobUrls.filter((b) => /^image\//.test(b.type || '')).length);
    ok(!liveShows && liveCreated === 0, '?preview (no draft) does not show draft images');
    await film.close();

    /* ---------- export ---------- */
    section('EXPORT (.zip)');
    const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('[data-testid="more"]'); await page.click('[data-testid="menu-export"]'); })()]);
    const zipPath = await download.path();
    const zipBuf = fs.readFileSync(zipPath);
    const { readZip, crc32 } = await import(pathToFileURL(path.join(ROOT, 'admin/zip.js')).href);
    const entries = readZip(new Uint8Array(zipBuf));
    const names = entries.map((e) => e.name);
    ok(['data/settings.json', 'data/messages.json', 'data/photos.json'].every((n) => names.includes(n)), 'zip has the three JSON files');
    const staged = await page.evaluate(() => [...window.__lanternRoom.state.files.keys()]);
    ok(staged.every((n) => names.includes(n)) && entries.every((e) => e.crc === crc32(e.data)), `zip has all ${staged.length} new files, CRCs valid`);
    ok(JSON.parse(Buffer.from(entries.find((e) => e.name === 'data/photos.json').data).toString()).photos.length === expectPhotos, 'zipped photos.json matches the draft');

    /* ---------- publish ---------- */
    section('PUBLISH (one commit)');
    repo.calls.length = 0;
    await page.click('[data-testid="publish"]');
    await page.waitForSelector('[data-testid="publish-now"]');
    await shot(page, '06-publish');
    await page.click('[data-testid="publish-now"]');
    await page.waitForSelector('.sheet-title:has-text("Published!")', { timeout: 30000 });
    const commits = repo.calls.filter((c) => c.method === 'POST' && c.path === '/git/commits');
    const patches = repo.calls.filter((c) => c.method === 'PATCH');
    const trees = repo.calls.filter((c) => c.method === 'POST' && c.path === '/git/trees');
    const blobs = repo.calls.filter((c) => c.method === 'POST' && c.path === '/git/blobs');
    ok(commits.length === 1 && patches.length === 1 && trees.length === 1, 'exactly one tree, one commit, one ref update');
    const tree = trees[0].body.tree;
    const byPath = Object.fromEntries(tree.map((e) => [e.path, e]));
    const jsonOk = ['data/settings.json', 'data/messages.json', 'data/photos.json'].every((f) => byPath[f] && typeof byPath[f].content === 'string' && byPath[f].content.endsWith('\n') && JSON.parse(byPath[f].content).version === 2);
    ok(jsonOk, 'split JSON files (settings, messages, photos), 2-space + newline, version 2');
    ok(!byPath['data/site.json'], 'no legacy data/site.json written');
    const pub = JSON.parse(byPath['data/photos.json'].content);
    ok(pub.photos.length === expectPhotos && pub.photos.find((p) => p.id === repo.heroId).caption === 'Our very first photo ✨', 'photos.json carries the new photos and edits');
    ok(JSON.parse(byPath['data/messages.json'].content).invite.greeting === 'Hey {nick1}, it’s finally here.', 'messages.json carries the edit');
    ok(JSON.parse(byPath['data/settings.json'].content).settings.whatsapp === '919812345678', 'settings.json carries the edit');
    const uploads = tree.filter((e) => e.sha && !e.content);
    const refs = new Set([...pub.photos.flatMap((p) => [p.src, p.thumb, p.original]), ...Object.values(JSON.parse(byPath['data/settings.json'].content).media)].filter(Boolean));
    ok(uploads.length === blobs.length && uploads.length === staged.length && uploads.every((e) => refs.has(e.path)), `${uploads.length} new image blobs uploaded, all referenced`);
    const deletes = tree.filter((e) => e.sha === null).map((e) => e.path).sort();
    ok(JSON.stringify(deletes) === JSON.stringify(['photos/hero-old.jpg', 'photos/originals/hero-old.jpg', 'photos/thumbs/hero-old.jpg']), `replaced files deleted in the same commit (${deletes.join(', ')})`);
    ok(!deletes.includes('photos/.gitkeep'), 'never deletes .gitkeep / non-managed files');
    ok(!!byPath[music] && byPath[music].sha, 'the new music file is part of the same commit');
    await page.click('.sheet button:has-text("Lovely")');
    await page.waitForFunction(() => !document.querySelector('.sheet-backdrop'));
    ok(/All live|Connected/.test(await page.textContent('#status')), 'after publishing the status is clean');

    /* ---------- dirty guard again after publish ---------- */
    section('Unsaved-changes guard (dirty, not yet saved)');
    await goSection(page, 'messages');
    await page.getByLabel('Greeting', { exact: true }).fill('One more change');
    dialogs.length = 0;
    await page.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 500));
    ok(dialogs.includes('beforeunload'), 'closing the tab with a fresh edit asks first');

    ok(errors.length === 0, 'no console errors in the admin', errors.slice(0, 5).join('\n          '));

    /* ---------- phone (touch) ---------- */
    section('Phone 390×844 (touch)');
    const phoneRepo = makeRepo(IMG);
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await mockGitHub(phone, phoneRepo);
    await phone.addInitScript(() => {
      try {
        localStorage.setItem('deepu-admin-token', 'test-token');
        localStorage.setItem('deepu-admin-repo', JSON.stringify({ owner: 'o', repo: 'r', branch: 'main' }));
        localStorage.setItem('deepu-admin-welcomed', '1');
      } catch { /* ignore */ }
    });
    const ph = await phone.newPage();
    const phErrors = [];
    ph.on('pageerror', (e) => phErrors.push(e.message));
    await ph.goto(`${BASE}/admin/#library`);
    await ph.waitForSelector('.pcard');
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll on a phone');
    ok(await ph.locator('#bottomnav .bnav-item').count() === 5 && await ph.locator('.sidebar').isHidden(), 'bottom navigation on phones (sidebar hidden)');
    const small = await ph.$$eval('.pcard:first-child .pact, .pcard:first-child .order-btn, .pcard:first-child .grip, .bnav-item, .top-actions button', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }).filter((v) => v > 0 && v < 40));
    ok(!small.length, 'touch targets are ≥ 40 px', small.join(','));
    const phTarget = (await ph.evaluate(() => window.__lanternRoom.state.site.photos.find((p) => p.ratio === '4:5' && !p.src).id));
    await ph.locator(`.pcard[data-id="${phTarget}"] [data-act="replace"]`).scrollIntoViewIfNeeded();
    const [fc] = await Promise.all([ph.waitForEvent('filechooser'), ph.tap(`.pcard[data-id="${phTarget}"] [data-act="replace"]`)]);
    await fc.setFiles(file('wide.png', IMG.w169));
    await ph.waitForSelector('[data-testid="ratio-warning"]');
    ok((await ph.textContent('[data-testid="ratio-warning"]')).trim() === 'Expected ratio: 4:5 · Uploaded ratio: 16:9', 'ratio warning on the phone');
    await shot(ph, '07-phone-warning');
    await ph.tap('[data-choice="crop"]');
    await ph.waitForSelector('.cropper.in');
    await shot(ph, '08-phone-cropper');
    await ph.tap('[data-testid="crop-confirm"]');
    await ph.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, phTarget, { timeout: 20000 });
    const pd = await blobInfo(ph, (await photo(ph, phTarget)).src);
    ok(exact(pd, '4:5'), `phone crop yields exactly 4:5 (${pd && `${pd.w}×${pd.h}`})`);
    await waitIdle(ph);
    await ph.tap(`.pcard[data-id="${phTarget}"] [data-act="edit"]`);
    await ph.waitForSelector('.editor-stage canvas', { timeout: 15000 });
    await shot(ph, '09-phone-editor');
    await ph.tap('.sheet-x');
    await ph.tap('#bnav-more');
    await ph.waitForSelector('.drawer-nav');
    ok(await ph.locator('.drawer-item').count() === 9, 'the More drawer lists all nine sections');
    await shot(ph, '10-phone-drawer');
    ok(!phErrors.length, 'no errors on the phone', phErrors.join(' | '));
    await phone.close();
  } catch (err) {
    failures++;
    console.log(`\n  FAIL  ${err.message.split('\n')[0]}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'zz-failure.png') }).catch(() => {});
    if (errors.length) console.log(`  console:\n    ${errors.slice(0, 8).join('\n    ')}`);
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n✗ admin flows: ${failures} failure(s)` : '\n✓ admin flows passed');
  process.exit(failures ? 1 : 0);
})();
