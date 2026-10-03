#!/usr/bin/env node
// Adversarial QA of the Lantern Room admin, as a non-technical owner on a phone (390×844, touch)
// and a laptop (1366×768), against a REALISTIC mocked GitHub: a tiny git object store (blobs, trees,
// commits, refs) behind the REST endpoints the admin uses, fast-forward checks on the ref update,
// an injected 409 (with a concurrent commit landing first), contents served per commit.
//
//   (static server on :8090)  NODE_PATH=$(npm root -g) node tests/e2e/admin-qa.cjs [--only a,b] [--shots dir] [--port 8090]
//
// Each flow runs in its own browser context (fresh IndexedDB / localStorage). Also the regression
// suite for the bugs found in QA (see the "regression:" checks).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const PORT = args.port || '8090';
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(__dirname, '../..');
const SHOTS = typeof args.shots === 'string' ? args.shots : '';
const ONLY = typeof args.only === 'string' ? args.only.split(',') : null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-qa-'));

let failures = 0;
let step = 0;
const results = [];
const ok = (cond, msg, extra = '') => {
  step++;
  results.push({ ok: !!cond, msg });
  if (cond) console.log(`  ok ${String(step).padStart(3)}  ${msg}`);
  else { failures++; console.log(`  FAIL ${String(step).padStart(3)}  ${msg}${extra ? `\n           ${extra}` : ''}`); }
  return !!cond;
};
const section = (t) => console.log(`\n▸ ${t}`);
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };

/* ================================================================ test images */
// Small dependency-free encoders: PNG (zlib) and a baseline JPEG would be heavy — instead JPEGs are made by
// the browser itself (canvas.toBlob) and an EXIF APP1 segment (orientation 6) is spliced in by hand.
const zlib = require('zlib');
function crc32(buf) {
  let c;
  const t = crc32.t || (crc32.t = Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngOf(w, h, paint) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y, w, h);
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** A "photo": wall gradient, skin oval (face), dark hair, a RED square top-left and a BLUE square bottom-right. */
const scenePaint = (bg = [70, 90, 140], face = [0.5, 0.35]) => (x, y, w, h) => {
  if (x < w / 8 && y < h / 8) return [220, 30, 30];
  if (x >= w - w / 8 && y >= h - h / 8) return [30, 60, 220];
  const fx = w * face[0]; const fy = h * face[1]; const r = Math.min(w, h) * 0.14;
  const dx = (x - fx) / r; const dy = (y - fy) / (r * 1.3);
  if (dx * dx + dy * dy <= 1) return [205, 150, 118];
  if (Math.abs(dx) < 1.1 && dy < -0.75 && dy > -1.35) return [50, 35, 28];
  const k = 0.7 + 0.5 * (y / h);
  return bg.map((v) => Math.min(255, Math.round(v * k)));
};
/** Insert an EXIF APP1 (orientation) right after the JPEG SOI marker. */
function withOrientation(jpeg, orientation) {
  const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0, 0, 0]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, payload, jpeg.subarray(2)]);
}

/** What a phone writes into a photo: EXIF with the camera + GPS, XMP, a comment, and a hidden extra image after the end. */
function withPrivateMetadata(jpeg, orientation = 6) {
  const seg = (marker, payload) => { const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2); return Buffer.concat([Buffer.from([0xff, marker]), len, payload]); };
  const make = Buffer.from('SecretPhone GPS 12.9716N 77.5946E\0', 'latin1');
  const ifd = Buffer.alloc(2 + 24 + 4);
  ifd.writeUInt16LE(2, 0);
  ifd.writeUInt16LE(0x010f, 2); ifd.writeUInt16LE(2, 4); ifd.writeUInt32LE(make.length, 6); ifd.writeUInt32LE(8 + ifd.length, 10);
  ifd.writeUInt16LE(0x0112, 14); ifd.writeUInt16LE(3, 16); ifd.writeUInt32LE(1, 18); ifd.writeUInt16LE(orientation, 22);
  const exif = Buffer.concat([Buffer.from('Exif\0\0II', 'latin1'), Buffer.from([0x2a, 0, 8, 0, 0, 0]), ifd, make]);
  return Buffer.concat([jpeg.subarray(0, 2), seg(0xe1, exif), seg(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>xmp-secret</x:xmpmeta>', 'latin1')),
    seg(0xfe, Buffer.from('comment-secret')), jpeg.subarray(2), Buffer.from('MPF-hidden-image-secret')]);
}
/** A tiny MP4 whose moov holds the recording location (©xyz), like a phone video. */
function mp4WithLocation() {
  const box = (type, ...parts) => { const body = Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p))); const len = Buffer.alloc(4); len.writeUInt32BE(body.length + 8); return Buffer.concat([len, Buffer.from(type, 'latin1'), body]); };
  return Buffer.concat([box('ftyp', 'isom', Buffer.from([0, 0, 2, 0]), 'isomiso2mp41'), box('moov', box('mvhd', Buffer.alloc(20)), box('udta', box('\xa9xyz', Buffer.from([0, 18, 0x15, 0xc7]), '+12.9716+077.5946/'))), box('mdat', Buffer.alloc(4096, 7))]);
}

/* ================================================================ realistic GitHub mock */
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
class MockGit {
  constructor(files) {
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.calls = [];
    this.token = 'good-token';
    this.conflictOnce = null; // fn(git) run before failing the first PATCH with 409
    const tree = new Map();
    for (const [p, data] of Object.entries(files)) tree.set(p, this.putBlob(Buffer.from(data)));
    const t = this.putTree(tree);
    this.head = this.putCommit(t, [], 'initial');
  }
  putBlob(buf) { const s = sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])); this.blobs.set(s, buf); return s; }
  putTree(map) { const s = sha1(JSON.stringify([...map].sort())); this.trees.set(s, new Map(map)); return s; }
  putCommit(tree, parents, message) { const s = sha1(`${tree}|${parents.join(',')}|${message}|${this.commits.size}`); this.commits.set(s, { tree, parents, message }); return s; }
  treeOf(ref) {
    const c = this.commits.get(ref === 'main' ? this.head : ref);
    return c ? this.trees.get(c.tree) : null;
  }
  file(p, ref = 'main') { const t = this.treeOf(ref); const s = t && t.get(p); return s ? this.blobs.get(s) : null; }
  /** Commit straight to main (a "someone else" change). */
  commitDirect(changes, message = 'concurrent') {
    const tree = new Map(this.treeOf('main'));
    for (const [p, data] of Object.entries(changes)) {
      if (data === null) tree.delete(p);
      else tree.set(p, this.putBlob(Buffer.from(data)));
    }
    this.head = this.putCommit(this.putTree(tree), [this.head], message);
  }
  json(p) { return JSON.parse(this.file(p).toString('utf8')); }
}

async function mockGitHub(context, git) {
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const method = req.method();
    if (!u.pathname.startsWith('/repos/o/r')) return json(route, 404, { message: 'Not Found' });
    const p = decodeURIComponent(u.pathname.slice('/repos/o/r'.length));
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    git.calls.push({ method, path: p, body, query: u.search });
    const auth = req.headers().authorization || '';
    if (auth !== `Bearer ${git.token}`) return json(route, 401, { message: 'Bad credentials' });
    if (method === 'GET' && p === '') return json(route, 200, { full_name: 'o/r', private: false, permissions: { push: true }, default_branch: 'main' });
    if (method === 'GET' && p === '/branches/main') return json(route, 200, { name: 'main', commit: { sha: git.head } });
    if (method === 'GET' && p === '/git/ref/heads/main') return json(route, 200, { ref: 'refs/heads/main', object: { sha: git.head, type: 'commit' } });
    if (method === 'GET' && p.startsWith('/git/commits/')) {
      const s = p.split('/').pop();
      const c = git.commits.get(s);
      return c ? json(route, 200, { sha: s, tree: { sha: c.tree }, parents: c.parents.map((x) => ({ sha: x })) }) : json(route, 404, { message: 'Not Found' });
    }
    if (method === 'GET' && p.startsWith('/git/trees/')) {
      const t = git.trees.get(p.split('/').pop());
      if (!t) return json(route, 404, { message: 'Not Found' });
      return json(route, 200, { sha: p.split('/').pop(), truncated: false, tree: [...t].map(([path_, s]) => ({ path: path_, mode: '100644', type: 'blob', sha: s, size: git.blobs.get(s).length })) });
    }
    if (method === 'GET' && p.startsWith('/contents/')) {
      const f = p.slice('/contents/'.length);
      const ref = u.searchParams.get('ref') || 'main';
      const data = git.file(f, ref);
      if (!data) return json(route, 404, { message: 'Not Found' });
      if (/raw/.test(req.headers().accept || '')) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: data });
      return json(route, 200, { type: 'file', encoding: 'base64', content: data.toString('base64').replace(/(.{60})/g, '$1\n'), sha: sha1(data), size: data.length, path: f });
    }
    if (method === 'POST' && p === '/git/blobs') {
      if (body.encoding !== 'base64') return json(route, 422, { message: 'encoding must be base64 here' });
      return json(route, 201, { sha: git.putBlob(Buffer.from(body.content, 'base64')) });
    }
    if (method === 'POST' && p === '/git/trees') {
      const base = git.trees.get(body.base_tree);
      if (!base) return json(route, 422, { message: 'base_tree not found' });
      const t = new Map(base);
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!t.has(e.path)) return json(route, 422, { message: `GitRPC::BadObjectState: cannot delete missing ${e.path}` });
          t.delete(e.path);
        } else if (typeof e.content === 'string') t.set(e.path, git.putBlob(Buffer.from(e.content, 'utf8')));
        else if (e.sha && git.blobs.has(e.sha)) t.set(e.path, e.sha);
        else return json(route, 422, { message: `tree.sha ${e.sha} is not a valid blob` });
      }
      return json(route, 201, { sha: git.putTree(t) });
    }
    if (method === 'POST' && p === '/git/commits') {
      if (!git.trees.has(body.tree)) return json(route, 422, { message: 'tree not found' });
      return json(route, 201, { sha: git.putCommit(body.tree, body.parents, body.message) });
    }
    if (method === 'PATCH' && p === '/git/refs/heads/main') {
      if (git.conflictOnce) {
        const fn = git.conflictOnce;
        git.conflictOnce = null;
        fn(git);
        return json(route, 409, { message: 'Reference update failed' });
      }
      const c = git.commits.get(body.sha);
      if (!c) return json(route, 422, { message: 'Object does not exist' });
      if (!body.force && !c.parents.includes(git.head)) return json(route, 422, { message: 'Update is not a fast forward' });
      git.head = body.sha;
      return json(route, 200, { ref: 'refs/heads/main', object: { sha: body.sha } });
    }
    return json(route, 500, { message: `unmocked ${method} ${p}` });
  });
  await context.route('https://raw.githubusercontent.com/**', async (route) => {
    const f = decodeURIComponent(new URL(route.request().url()).pathname.split('/').slice(4).join('/'));
    const data = git.file(f);
    return data ? route.fulfill({ status: 200, contentType: 'application/octet-stream', body: data }) : route.fulfill({ status: 404, body: '' });
  });
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const text = (o) => `${JSON.stringify(o, null, 2)}\n`;
// The placeholder state (36 empty photo spots) with the current settings and words: tests/fixtures/*.json
// (the live data/*.json hold the real photos).
const FIXTURE = (name) => `tests/fixtures/${name}.json`;
/** The repo in its placeholder state + one published hero photo (with display/thumb/original) + extra files. */
function repoFiles(IMG) {
  const photos = read(FIXTURE('photos'));
  const hero = photos.photos.find((p) => p.role === 'hero');
  Object.assign(hero, { src: 'photos/hero-old.jpg', thumb: 'photos/thumbs/hero-old.jpg', original: 'photos/originals/hero-old.jpg' });
  const settings = read(FIXTURE('settings'));
  settings.settings.github = { owner: 'o', repo: 'r', branch: 'main' };
  settings.media.music = 'media/music-old.mp3';
  return {
    'index.html': '<!doctype html>',
    'README.md': '# readme',
    'data/settings.json': text(settings),
    'data/messages.json': text(read(FIXTURE('messages'))),
    'data/photos.json': text(photos),
    'photos/hero-old.jpg': IMG.p45,
    'photos/thumbs/hero-old.jpg': IMG.p45,
    'photos/originals/hero-old.jpg': IMG.p45,
    'photos/stray-unreferenced.jpg': IMG.p45, // orphan: never referenced → must never be deleted
    'photos/.gitkeep': '',
    'media/.gitkeep': '',
    'media/music-old.mp3': Buffer.alloc(2048, 3),
  };
}

/* ================================================================ page helpers */
const S = (page, fn, arg) => page.evaluate(fn, arg);
const site = (page) => S(page, () => JSON.parse(JSON.stringify(window.__lanternRoom.state.site)));
const photo = (page, id) => S(page, (i) => JSON.parse(JSON.stringify(window.__lanternRoom.state.site.photos.find((p) => p.id === i) || null)), id);
const allPhotos = (page) => S(page, () => JSON.parse(JSON.stringify(window.__lanternRoom.state.site.photos)));
const blobInfo = (page, p) => S(page, async (pp) => {
  const b = window.__lanternRoom.state.files.get(pp);
  if (!b) return null;
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const px = (u, v) => Array.from(x.getImageData(Math.min(bmp.width - 1, Math.round(u * bmp.width)), Math.min(bmp.height - 1, Math.round(v * bmp.height)), 1, 1).data.slice(0, 3));
  const out = { w: bmp.width, h: bmp.height, type: b.type, size: b.size, tl: px(0.02, 0.02), br: px(0.98, 0.98) };
  bmp.close();
  return out;
}, p);
const exact = (d, ratio) => { const [a, b] = ratio.split(':').map(Number); return !!d && d.w * b === d.h * a; };
const isRed = (c) => c && c[0] > 150 && c[1] < 110 && c[2] < 110;
const isBlue = (c) => c && c[2] > 150 && c[0] < 110;
async function chooseFile(page, trigger, files) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), trigger()]);
  await fc.setFiles(files);
}
async function waitIdle(page) { await page.waitForFunction(() => { const b = document.getElementById('busy'); return !b || b.hidden; }, null, { timeout: 60000 }); }
async function noSheet(page) { await page.waitForFunction(() => !document.querySelector('.sheet-backdrop') && !document.querySelector('.cropper'), null, { timeout: 15000 }); }
async function goSection(page, id) {
  await page.evaluate((s) => { location.hash = `#${s}`; }, id);
  await page.waitForSelector(`#view[data-section="${id}"]`);
}
const tap = (page, sel) => (page.__touch ? page.tap(sel) : page.click(sel));
const idsIn = (page, ch) => page.$$eval(`.lib-block[data-chapter="${ch}"] .pcard`, (els) => els.map((e) => e.dataset.id));
const ordersOk = (photos) => {
  const by = {};
  for (const p of photos) (by[p.chapter] = by[p.chapter] || []).push(p.order);
  return Object.values(by).every((o) => o.sort((a, b) => a - b).every((v, i) => v === i + 1));
};
async function lastToast(page) { return page.evaluate(() => [...document.querySelectorAll('.toast .toast-msg')].map((e) => e.textContent).join(' | ')); }

let model;
let browser;
let IMG;

async function setup({ phone = false, viewport, token = 'good-token', welcomed = true, git = null, timezone } = {}) {
  const g = git || new MockGit(repoFiles(IMG));
  const context = await browser.newContext({
    viewport: viewport || (phone ? { width: 390, height: 844 } : { width: 1366, height: 768 }),
    hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1, acceptDownloads: true, timezoneId: timezone,
  });
  await mockGitHub(context, g);
  await context.addInitScript(([tok, wel]) => {
    try {
      if (location.pathname.includes('/admin') && !sessionStorage.getItem('qa-init')) {
        sessionStorage.setItem('qa-init', '1');
        if (tok) localStorage.setItem('deepu-admin-token', tok);
        localStorage.setItem('deepu-admin-repo', JSON.stringify({ owner: 'o', repo: 'r', branch: 'main' }));
        if (wel) localStorage.setItem('deepu-admin-welcomed', '1');
      }
    } catch { /* ignore */ }
  }, [token, welcomed]);
  const page = await context.newPage();
  page.__touch = phone;
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.type()); await d.accept().catch(() => {}); });
  return { context, page, git: g, errors, dialogs };
}
async function boot(page, hash = 'library') {
  await page.goto(`${BASE}/admin/#${hash}`);
  await page.waitForSelector(`#view[data-section="${hash}"]`, { timeout: 20000 });
  await page.waitForFunction(() => window.__lanternRoom && window.__lanternRoom.state.site);
}
const fileOf = (name, buf, mimeType = 'image/png') => ({ name, mimeType, buffer: buf });

/* ================================================================ flows */
const FLOWS = {};

FLOWS.firstRun = async () => {
  section('First run: connect screen (laptop 1366×768)');
  const { context, page, git, errors } = await setup({ token: null, welcomed: false });
  // make GitHub's copy differ from the site's copy so we can see which one is used
  const msgs = git.json('data/messages.json');
  msgs.invite.greeting = 'Hey from GitHub';
  git.commitDirect({ 'data/messages.json': text(msgs) });
  await page.goto(`${BASE}/admin/#library`);
  await page.waitForSelector('.sheet .sheet-title', { timeout: 20000 });
  ok(/Connect once/.test(await page.textContent('.sheet .sheet-title')), 'first visit shows the connect sheet');
  ok(await page.locator('.sheet details.howto[open]').count() === 1, 'the how-to steps are open on first run');
  await shot(page, 'qa-first-run');
  await page.click('.sheet button:has-text("Just look around")');
  await noSheet(page);
  ok(/Connect/.test(await page.textContent('#status')), 'status invites to connect');
  ok(await S(page, () => window.__lanternRoom.state.site.text.invite.greeting) !== 'Hey from GitHub', 'without a token the site’s own copy is shown');
  await page.click('#status');
  await page.waitForSelector('#gh-token');
  await page.click('[data-testid="connect"]');
  ok(/Paste the token first/.test(await page.textContent('.form-error')), 'empty token → friendly error');
  await page.fill('#gh-token', 'wrong-token');
  await page.click('[data-testid="connect"]');
  await page.waitForFunction(() => { const e = document.querySelector('.form-error'); return e && !e.hidden && /token/i.test(e.textContent) && !/Paste/.test(e.textContent); });
  ok(/didn’t accept the token/.test(await page.textContent('.form-error')), `bad token → “${(await page.textContent('.form-error')).slice(0, 60)}…”`);
  await page.fill('#gh-token', 'good-token');
  await page.press('#gh-token', 'Enter');
  await noSheet(page);
  await page.waitForFunction(() => /Connected|All live/.test(document.getElementById('status').textContent));
  ok(await S(page, () => localStorage.getItem('deepu-admin-token')) === 'good-token', 'token stored in this browser');
  ok(await S(page, () => window.__lanternRoom.state.site.text.invite.greeting) === 'Hey from GitHub', 'after connecting, the GitHub copy is used');
  ok(await S(page, () => window.__lanternRoom.changes().count) === 0, 'connecting does not create phantom changes');
  // reload: no welcome sheet again, still connected
  await page.reload();
  await page.waitForSelector('#view[data-section="library"] .pcard');
  await page.waitForTimeout(300);
  ok(await page.locator('.sheet-backdrop').count() === 0, 'the welcome sheet shows only once');
  ok(/Connected|All live/.test(await page.textContent('#status')), 'still connected after reload');
  // forget token
  await goSection(page, 'settings');
  await page.click('[data-testid="forget-token"]');
  ok(await S(page, () => localStorage.getItem('deepu-admin-token')) === null, 'Forget token removes it');
  ok(!errors.length, 'no console errors (first run)', errors.join(' | '));
  await context.close();
};

FLOWS.library = async () => {
  section('Library filters & counts (phone 390×844)');
  const { context, page, errors } = await setup({ phone: true });
  await boot(page);
  const st = await site(page);
  const count = async () => page.locator('.pcard').count();
  ok(await count() === st.photos.length, `All shows ${st.photos.length} photos`);
  for (const ch of model.PHOTO_CHAPTERS) {
    await tap(page, `[data-filter="${ch.id}"]`);
    const n = await count();
    const expected = st.photos.filter((p) => p.chapter === ch.id).length;
    if (!ok(n === expected, `filter ${ch.short}: ${n} cards`, `expected ${expected}`)) break;
  }
  await tap(page, '[data-filter="missing"]');
  ok(await count() === st.photos.filter((p) => !p.src).length && await page.locator('.pcard.has-img').count() === 0, 'Missing photos shows only empty spots');
  await tap(page, '[data-filter="featured"]');
  ok(await count() === 0 && /No featured photos/.test(await page.textContent('.empty-note')), 'Featured (none yet) explains how');
  await tap(page, '[data-filter="disabled"]');
  ok(/Nothing is switched off/.test(await page.textContent('.empty-note')), 'Disabled (none) explains');
  const chipCount = await page.$$eval('[data-filter="tower"] .fchip-count', (e) => e[0].textContent);
  ok(chipCount === '0/6', `chapter chip shows filled/recommended (${chipCount})`);
  // regression: a stale/unknown filter remembered from an older version falls back to All
  await S(page, () => localStorage.setItem('deepu-admin-filter', 'xyz-old-chapter'));
  await page.reload();
  await page.waitForSelector('.pcard');
  ok(await count() === st.photos.length && await page.getAttribute('[data-filter="all"]', 'aria-selected') === 'true', 'regression: unknown remembered filter → All (not “Disabled”)');
  ok(await S(page, () => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll');
  ok(!errors.length, 'no console errors (library)', errors.join(' | '));
  // regression: a double tap opens ONE dialog (Add photo, Edit, Publish, the drawer)
  const sheets = () => page.locator('.sheet-backdrop:not(.out)').count();
  const closeAll = async () => { for (let n = 0; n < 3 && await sheets(); n++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); } };
  const dbl = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500); };
  await page.evaluate(() => window.scrollTo(0, 0));
  const counts2 = {};
  await dbl('[data-testid="add-photo"]'); counts2.add = await sheets(); await closeAll();
  await dbl('.pcard [data-act="edit"]'); counts2.edit = await sheets(); await closeAll();
  await dbl('.pcard [data-act="move"]'); counts2.move = await sheets(); await closeAll();
  await dbl('#bnav-more'); counts2.drawer = await sheets(); await closeAll();
  await goSection(page, 'messages');
  await page.getByLabel('Greeting', { exact: true }).fill('Double tap test');
  await dbl('[data-testid="publish"]');
  await page.waitForSelector('[data-testid="publish-now"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  counts2.publish = await sheets(); await closeAll();
  ok(Object.values(counts2).every((n) => n === 1), 'regression: double-tapping a button opens its dialog once', JSON.stringify(counts2));
  await context.close();
};

FLOWS.add = async () => {
  section('ADD 1 photo, then 10 photos at once (one HEIC among them) — laptop');
  const { context, page, errors } = await setup();
  await boot(page);
  // one photo into Lanterns (1:1)
  const before = (await allPhotos(page)).filter((p) => p.chapter === 'lanterns').length;
  await page.click('[data-testid="add-to-lanterns"]');
  await page.waitForSelector('[data-testid="add-chapter"]');
  ok(await page.getAttribute('.sheet .shape-chip[aria-checked="true"]', 'data-ratio') === '1:1', 'Lanterns defaults to 1:1');
  await chooseFile(page, () => page.click('[data-testid="add-choose"]'), fileOf('one.png', IMG.w169));
  await page.waitForSelector('.cropper.in');
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await page.click('[data-testid="crop-confirm"]');
  await page.waitForSelector('[data-testid="details-add"]');
  await page.click('[data-testid="details-add"]');
  await page.waitForFunction((n) => window.__lanternRoom.state.site.photos.filter((p) => p.chapter === 'lanterns').length === n + 1, before, { timeout: 20000 });
  const one = (await allPhotos(page)).filter((p) => p.chapter === 'lanterns').sort((a, b) => b.order - a.order)[0];
  ok(exact(await blobInfo(page, one.src), '1:1') && one.order === before + 1, `1 photo added at the end, exactly 1:1 (order ${one.order})`);
  await waitIdle(page);
  // ten (+ one undecodable HEIC) into the album with the 4:5 shape
  const albumBefore = (await allPhotos(page)).filter((p) => p.chapter === 'album').length;
  await page.click('[data-testid="add-photo"]');
  await page.waitForSelector('[data-testid="add-chapter"]');
  await page.selectOption('[data-testid="add-chapter"]', 'album');
  await page.click('.sheet .shape-chip[data-ratio="4:5"]');
  const ten = IMG.ten.map((b, i) => fileOf(`ten-${i + 1}.png`, b));
  ten.splice(3, 0, fileOf('IMG_0001.HEIC', IMG.garbage, 'image/heic'));
  await chooseFile(page, () => page.click('[data-testid="add-choose"]'), ten);
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('.cropper.in', { timeout: 20000 });
    const stepTxt = await page.textContent('.crop-step').catch(() => '');
    if (i === 0) ok(/Photo 1 of 11/.test(stepTxt), `step counter shown (“${stepTxt}”)`);
    ok((await page.textContent('.crop-rule .ratio-badge')).trim() === '4:5', `photo ${i + 1}: cropper locked to 4:5`);
    await page.click('[data-testid="crop-confirm"]');
    await page.waitForSelector('.cropper.in', { state: 'detached' }).catch(() => {});
    if (i === 0) {
      await page.waitForSelector('[data-testid="details-label"]');
      await page.fill('[data-testid="details-label"]', 'First of ten');
      await page.click('.sheet button:has-text("Skip details for the rest")');
    }
  }
  await page.waitForFunction((n) => window.__lanternRoom.state.site.photos.filter((p) => p.chapter === 'album').length === n + 10, albumBefore, { timeout: 60000 });
  await waitIdle(page);
  await page.waitForTimeout(300);
  const album = (await allPhotos(page)).filter((p) => p.chapter === 'album');
  ok(album.length === albumBefore + 10, `10 photos added (${((Date.now() - t0) / 1000).toFixed(1)}s), the HEIC skipped`);
  ok(album.some((p) => p.label === 'First of ten'), 'details of the first photo kept');
  let exactAll = true;
  for (const p of album) { const d = await blobInfo(page, p.src); if (!exact(d, '4:5') || p.ratio !== '4:5') exactAll = false; }
  ok(exactAll, 'every album photo is exactly 4:5');
  const paths = album.flatMap((p) => [p.src, p.thumb, p.original]);
  ok(new Set(paths).size === paths.length, 'all 30 file paths unique');
  ok(ordersOk(await allPhotos(page)), 'orders are 1..n in every chapter');
  const toasts = await lastToast(page);
  ok(/HEIC|couldn’t be opened|could not be opened/i.test(toasts), 'regression: the final message mentions the photo that couldn’t be opened', toasts);
  ok(!errors.length, 'no console errors (add)', errors.join(' | '));
  await context.close();
};

FLOWS.replace = async () => {
  section('REPLACE: ratio rule with real values, EXIF orientation 6, HEIC, huge 6000×4000, >12 MB original');
  const { context, page, errors } = await setup();
  await boot(page);
  let ph = await allPhotos(page);
  const empty = (ratio, n = 0) => ph.filter((p) => p.ratio === ratio && !p.src)[n].id;
  const warnFor = async (id, file) => {
    ph = await allPhotos(page);
    await chooseFile(page, () => page.click(`.pcard[data-id="${id}"] [data-act="replace"]`), file);
    const appeared = await page.waitForSelector('[data-testid="ratio-warning"]', { timeout: 15000 }).then(() => true).catch(() => false);
    return appeared ? (await page.textContent('[data-testid="ratio-warning"]')).trim() : null;
  };
  // 1:1 spot ← 3:4 portrait
  let w = await warnFor(empty('1:1'), fileOf('p34.png', IMG.p34));
  ok(w === 'Expected ratio: 1:1 · Uploaded ratio: 3:4', `1:1 ← 3:4: “${w}”`);
  await page.click('.sheet-x');
  await noSheet(page);
  // 3:4 spot ← 16:9
  w = await warnFor(empty('3:4'), fileOf('w.png', IMG.w169));
  ok(w === 'Expected ratio: 3:4 · Uploaded ratio: 16:9', `3:4 ← 16:9: “${w}”`);
  await page.click('[data-choice="contain"]');
  await waitIdle(page);
  await noSheet(page);
  // EXIF orientation 6: stored 800×600 (landscape), upright 600×800 = 3:4 → a 3:4 spot accepts it as a perfect fit
  ph = await allPhotos(page);
  const exifTarget = empty('3:4');
  await chooseFile(page, () => page.click(`.pcard[data-id="${exifTarget}"] [data-act="replace"]`), fileOf('IMG_exif6.jpg', IMG.exifPrivate, 'image/jpeg'));
  await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, exifTarget, { timeout: 20000 }).catch(() => {});
  const warned = await page.locator('[data-testid="ratio-warning"]').count();
  if (warned) { ok(false, 'EXIF-6 portrait (upright 3:4) fits a 3:4 spot without a warning', await page.textContent('[data-testid="ratio-warning"]')); await page.click('.sheet-x'); await noSheet(page); }
  else {
    const p = await photo(page, exifTarget);
    const d = await blobInfo(page, p.src);
    ok(exact(d, '3:4') && d.h > d.w, `EXIF-6 photo accepted upright as 3:4 (${d.w}×${d.h})`);
    ok(isRed(d.tl) && isBlue(d.br), `EXIF-6 display is upright (red top-left ${d.tl}, blue bottom-right ${d.br})`);
    const o = await blobInfo(page, p.original);
    ok(o && o.w === 600 && o.h === 800 && isRed(o.tl) && isBlue(o.br), `the stored original still shows upright (${o && `${o.w}×${o.h}`})`);
    const bytes = Buffer.from(await S(page, async (pp) => [...new Uint8Array(await window.__lanternRoom.state.files.get(pp).arrayBuffer())], p.original));
    const leaks = ['SecretPhone', 'GPS', '12.9716', 'xmp-secret', 'comment-secret', 'MPF-hidden'].filter((x) => bytes.includes(Buffer.from(x)));
    ok(!leaks.length && bytes.length < IMG.exifPrivate.length, `regression: the published original carries no GPS / camera / XMP / comment / hidden image (${IMG.exifPrivate.length} → ${bytes.length} bytes)`, leaks.join(', '));
    const pixels = (b) => { const i = b.indexOf(Buffer.from([0xff, 0xda])); return b.subarray(i, b.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2); };
    ok(pixels(bytes).equals(pixels(IMG.exifPrivate.subarray(0, IMG.exifPrivate.length - 'MPF-hidden-image-secret'.length))), 'the picture data itself is untouched (lossless clean-up)');
  }
  await waitIdle(page);
  // EXIF orientation 6 into a 4:5 spot → the warning must name the UPRIGHT shape (3:4, not 4:3)
  w = await warnFor(empty('4:5'), fileOf('IMG_exif6b.jpg', IMG.exif6, 'image/jpeg'));
  ok(w === 'Expected ratio: 4:5 · Uploaded ratio: 3:4', `4:5 ← EXIF-6 3:4: “${w}”`);
  await page.click('[data-choice="crop"]');
  await page.waitForSelector('.cropper.in');
  await page.click('[data-testid="crop-confirm"]');
  await waitIdle(page);
  await noSheet(page);
  // HEIC that browsers can't decode → friendly message, no surprise re-opening of the picker
  ph = await allPhotos(page);
  const heicTarget = empty('4:5');
  let reopened = false;
  const onChooser = () => { reopened = true; };
  await chooseFile(page, () => page.click(`.pcard[data-id="${heicTarget}"] [data-act="replace"]`), fileOf('IMG_0001.HEIC', IMG.garbage, 'image/heic'));
  page.on('filechooser', onChooser);
  await page.waitForSelector('.toast-error', { timeout: 10000 });
  const heicMsg = await page.textContent('.toast-error .toast-msg');
  ok(/HEIC/.test(heicMsg) && /Most Compatible/.test(heicMsg), `HEIC → “${heicMsg}”`);
  ok(await page.locator('.toast-error .toast-action:has-text("How?")').count() === 1, 'HEIC toast offers “How?”');
  await page.waitForTimeout(800);
  page.off('filechooser', onChooser);
  ok(!reopened, 'regression: after an unreadable photo the file picker does not pop open again by itself');
  await page.evaluate(() => { for (const i of document.querySelectorAll('input[type=file]')) i.dispatchEvent(new Event('cancel')); });
  // a real JPEG that is merely NAMED .HEIC (some phones) → works, original stored as a JPEG
  await chooseFile(page, () => page.click(`.pcard[data-id="${heicTarget}"] [data-act="replace"]`), fileOf('IMG_0002.HEIC', IMG.jpeg45, 'image/heic'));
  await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, heicTarget, { timeout: 20000 }).catch(() => {});
  const hp = await photo(page, heicTarget);
  ok(!!hp.src && /\.jpg$/.test(hp.original), `JPEG named .HEIC accepted; original stored as ${hp.original}`);
  await waitIdle(page);
  // huge 6000×4000 into the album as 3:2
  const t0 = Date.now();
  await page.click('[data-testid="add-photo"]');
  await page.selectOption('[data-testid="add-chapter"]', 'album');
  await page.click('.sheet .shape-chip[data-ratio="3:2"]');
  await chooseFile(page, () => page.click('[data-testid="add-choose"]'), fileOf('huge.jpg', IMG.huge, 'image/jpeg'));
  await page.waitForSelector('.cropper.in', { timeout: 30000 });
  await page.click('[data-testid="crop-confirm"]');
  await page.click('[data-testid="details-add"]');
  await page.waitForFunction(() => window.__lanternRoom.state.site.photos.some((p) => p.chapter === 'album' && p.ratio === '3:2' && p.src), null, { timeout: 60000 });
  await waitIdle(page);
  const hug = (await allPhotos(page)).find((p) => p.chapter === 'album' && p.ratio === '3:2');
  const hd = await blobInfo(page, hug.src);
  const ht = await blobInfo(page, hug.thumb);
  const ho = await blobInfo(page, hug.original);
  ok(hd.w === 1800 && hd.h === 1200 && exact(ht, '3:2') && Math.max(ht.w, ht.h) <= 640, `6000×4000 → display ${hd.w}×${hd.h}, thumb ${ht.w}×${ht.h} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  ok(ho.size === IMG.huge.length && ho.w === 6000, 'huge original kept byte-for-byte at full size');
  // > 12 MB PNG → original re-encoded as an upright JPEG ≤ 3600 px
  await page.click('[data-testid="add-photo"]');
  await page.selectOption('[data-testid="add-chapter"]', 'album');
  await page.click('.sheet .shape-chip[data-ratio="1:1"]');
  await chooseFile(page, () => page.click('[data-testid="add-choose"]'), path.join(TMP, 'noisy-big.png'));
  await page.waitForSelector('.cropper.in', { timeout: 60000 });
  await page.click('[data-testid="crop-confirm"]');
  await page.click('[data-testid="details-add"]');
  await page.waitForFunction(() => window.__lanternRoom.state.site.photos.some((p) => p.chapter === 'album' && p.ratio === '1:1' && p.src), null, { timeout: 90000 });
  await waitIdle(page);
  const big = (await allPhotos(page)).find((p) => p.chapter === 'album' && p.ratio === '1:1');
  const bo = await blobInfo(page, big.original);
  ok(/\.jpg$/.test(big.original) && bo.type === 'image/jpeg' && Math.max(bo.w, bo.h) <= 3600 && bo.size < 12 * 1024 * 1024, `>12 MB PNG → original stored as JPEG (${bo.w}×${bo.h}, ${(bo.size / 1048576).toFixed(1)} MB)`);
  // replace the PUBLISHED hero with a matching 4:5 photo (no warning), then Undo → the published files again, nothing staged
  const heroId = (await allPhotos(page)).find((p) => p.role === 'hero').id;
  const staged0 = await S(page, () => window.__lanternRoom.state.files.size);
  await chooseFile(page, () => page.click(`.pcard[data-id="${heroId}"] [data-act="replace"]`), fileOf('hero-new.png', IMG.p45b));
  await page.waitForFunction((id) => window.__lanternRoom.state.site.photos.find((x) => x.id === id).src !== 'photos/hero-old.jpg', heroId, { timeout: 20000 });
  await waitIdle(page);
  ok(await page.locator('[data-testid="ratio-warning"]').count() === 0 && /a perfect fit/.test(await lastToast(page)), 'matching 4:5 → replaced straight away (“a perfect fit”, no warning)');
  await page.click('.toast.has-action .toast-action:has-text("Undo")');
  const back = await photo(page, heroId);
  ok(back.src === 'photos/hero-old.jpg' && back.original === 'photos/originals/hero-old.jpg' && await S(page, () => window.__lanternRoom.state.files.size) === staged0, 'Undo of a replace restores the published photo and drops the new files');
  ok(!errors.length, 'no console errors (replace)', errors.join(' | '));
  await context.close();
};

FLOWS.edit = async () => {
  section('EDIT: move, roles, featured, hero-hair, disable, focal keyboard, grade override, no-op save (laptop)');
  const { context, page, errors } = await setup();
  await boot(page);
  const ph = await allPhotos(page);
  const heroId = ph.find((p) => p.role === 'hero').id;
  const openEd = async (id) => { await page.click(`.pcard[data-id="${id}"] [data-act="edit"]`); await page.waitForSelector('[data-testid="edit-save"]'); };
  // move via the card's Move dialog
  const mover = ph.find((p) => p.chapter === 'tower' && p.ratio === '3:4').id;
  await page.click(`.pcard[data-id="${mover}"] [data-act="move"]`);
  await page.waitForSelector('[data-testid="move-confirm"]');
  await page.selectOption('.sheet select', 'letter');
  ok(/keeps its 3:4 shape|usually uses/.test(await page.textContent('.sheet .field-hint')), 'move dialog explains the shape is kept');
  await page.click('[data-testid="move-confirm"]');
  await noSheet(page);
  let m = await photo(page, mover);
  const all1 = await allPhotos(page);
  ok(m.chapter === 'letter' && m.ratio === ph.find((p) => p.id === mover).ratio && m.order === all1.filter((p) => p.chapter === 'letter').length, `moved to the end of Letter (order ${m.order}), ratio kept`);
  ok(ordersOk(all1), 'orders contiguous in both chapters after a move');
  // Undo puts it back exactly where it was
  const towerBefore = ph.filter((p) => p.chapter === 'tower').sort((a, b) => a.order - b.order).map((p) => p.id);
  await page.click('.toast.has-action .toast-action:has-text("Undo")');
  const towerAfter = (await allPhotos(page)).filter((p) => p.chapter === 'tower').sort((a, b) => a.order - b.order).map((p) => p.id);
  ok(JSON.stringify(towerAfter) === JSON.stringify(towerBefore) && ordersOk(await allPhotos(page)), 'Undo of a move restores the exact position in its old chapter');
  await page.click(`.pcard[data-id="${mover}"] [data-act="move"]`);
  await page.waitForSelector('[data-testid="move-confirm"]');
  await page.selectOption('.sheet select', 'letter');
  await page.click('[data-testid="move-confirm"]');
  await noSheet(page);
  // move back through the editor's chapter select
  await openEd(mover);
  await page.selectOption('.editor-fields select >> nth=0', 'tower');
  await page.click('[data-testid="edit-save"]');
  await noSheet(page);
  m = await photo(page, mover);
  ok(m.chapter === 'tower' && ordersOk(await allPhotos(page)), 'editor chapter move works, orders contiguous');
  // roles: give "hero" to another photo → note shown, moved off the previous one
  const other = ph.find((p) => p.chapter === 'names').id;
  await openEd(other);
  await page.selectOption('[data-testid="edit-role"]', 'hero');
  const note = await page.textContent('.field-hint.is-note');
  ok(/has this part now/.test(note), `role note: “${note.slice(0, 70)}…”`);
  await page.click('[data-testid="edit-save"]');
  await noSheet(page);
  let all = await allPhotos(page);
  ok(all.filter((p) => p.role === 'hero').length === 1 && all.find((p) => p.id === other).role === 'hero' && !all.find((p) => p.id === heroId).role, 'role “hero” is unique (moved)');
  // featured + hero-hair uniqueness
  const a = ph.find((p) => p.chapter === 'hair' && p.order === 1).id;
  const b = ph.find((p) => p.chapter === 'hair' && p.order === 2).id;
  for (const id of [a, b]) {
    await openEd(id);
    await page.click('.switch-row:has-text("Hero-hair photo")');
    await page.click('.switch-row:has-text("Featured")');
    await page.click('[data-testid="edit-save"]');
    await noSheet(page);
  }
  all = await allPhotos(page);
  ok(all.filter((p) => p.heroHair).length === 1 && all.find((p) => p.id === b).heroHair, 'hero-hair kept to one photo (moved to the newest)');
  ok(all.filter((p) => p.featured).length === 2, 'featured can be many');
  await page.click('[data-filter="featured"]');
  ok(await page.locator('.pcard').count() === 2, 'Featured filter shows both');
  await page.click('[data-filter="all"]');
  // disable
  await openEd(a);
  await page.click('.switch-row:has-text("Show in the film")');
  await page.click('[data-testid="edit-save"]');
  await noSheet(page);
  ok((await photo(page, a)).enabled === false && await page.locator(`.pcard[data-id="${a}"] .badge.off`).count() === 1, 'disabled photo is hidden (badge)');
  await page.click('[data-filter="disabled"]');
  ok(await page.locator('.pcard').count() === 1, 'Disabled filter shows it');
  await page.click('[data-filter="all"]');
  // a no-op save does not make a phantom draft change
  const before = await S(page, () => window.__lanternRoom.changes().count);
  const prevA = await photo(page, a);
  await openEd(a);
  await page.click('[data-testid="edit-save"]');
  await noSheet(page);
  const prevAfter = await photo(page, a);
  ok(await S(page, () => window.__lanternRoom.changes().count) === before && prevAfter.updatedAt === prevA.updatedAt, 'regression: saving without changes changes nothing');
  // focal point via keyboard on the published hero (it has an image)
  await openEd(heroId);
  await page.waitForSelector('.editor-stage canvas', { timeout: 15000 });
  await page.focus('[data-testid="focal-picker"]');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const readout = await page.textContent('.focal-readout');
  ok(/60% across, 44% down/.test(readout), `focal readout “${readout}”`);
  // per-photo grade override: switch off global, set strength 0.3
  await page.click('.switch-row:has-text("Use the global grading")');
  await page.locator('input[type=range]').first().evaluate((el) => { el.value = '0.3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-testid="edit-save"]');
  await page.waitForFunction((id) => { const p = window.__lanternRoom.state.site.photos.find((x) => x.id === id); return p.grade.strength === 0.3; }, heroId, { timeout: 30000 });
  await waitIdle(page);
  const hero = await photo(page, heroId);
  ok(Math.abs(hero.focal.x - 0.6) < 0.001 && Math.abs(hero.focal.y - 0.44) < 0.001, `focal saved (${hero.focal.x}, ${hero.focal.y})`);
  ok(hero.src !== 'photos/hero-old.jpg' && hero.original === 'photos/originals/hero-old.jpg' && exact(await blobInfo(page, hero.src), '4:5'), 'grade override regenerated the display from the original (exact 4:5)');
  ok(ordersOk(await allPhotos(page)), 'orders still contiguous');
  ok(!errors.length, 'no console errors (edit)', errors.join(' | '));
  await context.close();
};

FLOWS.reorderTouch = async () => {
  section('REORDER on the phone: touch drag on the grip (with auto-scroll) + buttons');
  const { context, page, errors } = await setup({ phone: true });
  await boot(page);
  await tap(page, '[data-filter="dance"]');
  const ids0 = await idsIn(page, 'dance');
  const cdp = await context.newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pt(x, y) });
  // 1) a short drag: the first card's grip onto the lower half of the second card (both on screen)
  // the first card's top at 150 px: both cards on screen, clear of the auto-scroll edges
  await page.evaluate((id) => { const r = document.querySelector(`.pcard[data-id="${id}"]`).getBoundingClientRect(); window.scrollBy(0, r.top - 150); }, ids0[0]);
  let g = await page.locator(`.pcard[data-id="${ids0[0]}"] .grip`).boundingBox();
  let t = await page.locator(`.pcard[data-id="${ids0[1]}"]`).boundingBox();
  let x0 = g.x + g.width / 2; let y0 = g.y + g.height / 2;
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 10; i++) await touch('touchMove', x0, y0 + (t.y + t.height * 0.85 - y0) * (i / 10));
  await touch('touchEnd');
  await page.waitForTimeout(250);
  const ids1 = await idsIn(page, 'dance');
  ok(ids1[1] === ids0[0] && ids1[0] === ids0[1], `short touch drag swaps the first two (${ids0.slice(0, 3)} → ${ids1.slice(0, 3)})`);
  let orders = (await allPhotos(page)).filter((p) => p.chapter === 'dance').sort((a, b) => a.order - b.order).map((p) => p.id);
  ok(JSON.stringify(orders) === JSON.stringify(ids1), 'order fields follow the screen');
  // 2) regression: dragging to the bottom edge auto-scrolls; the release (finger over the bottom bar,
  //    the card moved in the DOM → pointer capture lost) still commits the new order
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(`.pcard[data-id="${ids1[0]}"] .grip`).scrollIntoViewIfNeeded();
  g = await page.locator(`.pcard[data-id="${ids1[0]}"] .grip`).boundingBox();
  x0 = g.x + g.width / 2; y0 = g.y + g.height / 2;
  const yEdge = 844 - 70; // over the bottom bar
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x0, y0 + (yEdge - y0) * (i / 8));
  const scroll0 = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(60); await touch('touchMove', x0, yEdge + (i % 2)); }
  const scroll1 = await page.evaluate(() => window.scrollY);
  await touch('touchEnd');
  await page.waitForTimeout(300);
  const ids2 = await idsIn(page, 'dance');
  ok(scroll1 > scroll0 + 100, `holding at the bottom edge scrolls the page (${scroll0} → ${scroll1})`);
  ok(ids2.indexOf(ids1[0]) >= 2, `long drag moved the photo several places (${ids1.slice(0, 4)} → ${ids2.slice(0, 4)})`);
  orders = (await allPhotos(page)).filter((p) => p.chapter === 'dance').sort((a, b) => a.order - b.order).map((p) => p.id);
  ok(JSON.stringify(orders) === JSON.stringify(ids2), 'order fields follow the screen after the long drag');
  ok(await page.locator('.pcard.dragging, .pgrid.is-sorting').count() === 0, 'no card is left stuck in “dragging”');
  await tap(page, `.pcard[data-id="${ids2[1]}"] [data-act="up"]`);
  const ids3 = await idsIn(page, 'dance');
  ok(ids3[0] === ids2[1], 'tap “move earlier” works');
  ok(!errors.length, 'no console errors (reorder touch)', errors.join(' | '));
  await context.close();
};

FLOWS.words = async () => {
  section('Messages (lists, pairs, unknown keys), chapters, theme, media limits (phone)');
  const { context, page, errors } = await setup({ phone: true });
  await boot(page, 'messages');
  const invite = '.group[data-group="invite"]';
  ok(await page.locator(`${invite}[open]`).count() === 1, 'Invitation group starts open');
  const lines0 = (await site(page)).text.invite.lines;
  await tap(page, `${invite} .add-btn`);
  const added = page.locator(`${invite} textarea[aria-label^="Lines "]`).last();
  // the focus moves on the next animation frame
  const focused = await page.waitForFunction((want) => document.activeElement && document.activeElement.getAttribute('aria-label') === want, `Lines ${lines0.length + 1}`, { timeout: 3000 }).then(() => true).catch(() => false);
  ok(focused, 'new line gets focus', await S(page, () => document.activeElement && document.activeElement.getAttribute('aria-label')));
  await added.fill('A brand new line');
  await tap(page, `${invite} button[aria-label="Move line ${lines0.length + 1} up"]`);
  let lines = (await site(page)).text.invite.lines;
  ok(lines.length === lines0.length + 1 && lines[lines0.length - 1] === 'A brand new line', 'list: add + move up');
  await tap(page, `${invite} button[aria-label="Remove line 1"]`);
  lines = (await site(page)).text.invite.lines;
  ok(lines.length === lines0.length && lines[0] === lines0[1], 'list: remove');
  // regression: with every group open, “Add a line” focuses the new line in THE SAME group
  await tap(page, 'button:has-text("Open all")');
  const hug = '.group[data-group="hug"]';
  await page.locator(`${hug} .add-btn`).first().scrollIntoViewIfNeeded();
  await tap(page, `${hug} .add-btn >> nth=0`);
  const focusedIn = await S(page, () => document.activeElement && document.activeElement.closest('.group') && document.activeElement.closest('.group').dataset.group);
  ok(focusedIn === 'hug', `regression: “Add a line” focuses the new line in its own group (got ${focusedIn})`);
  await tap(page, `${hug} button[aria-label^="Remove line"] >> nth=-1`);
  // unknown keys preserved & editable (finale.*, credits.lines)
  const s0 = await site(page);
  const unknownGroups = Object.keys(s0.text).filter((k) => !['invite', 'gate', 'prologue', 'tower', 'hair', 'names', 'dance', 'lanterns', 'letter', 'cake', 'constellation', 'birthday', 'hug', 'credits', 'gallery'].includes(k));
  ok(unknownGroups.every((g) => page.locator(`.group[data-group="${g}"]`).count()), `unknown groups listed (${unknownGroups.join(', ') || 'none'})`);
  // string field + undo
  const greet = page.getByLabel('Greeting', { exact: true });
  await greet.fill('Hello {nick2}');
  ok((await site(page)).text.invite.greeting === 'Hello {nick2}', 'greeting edited');
  await tap(page, `${invite} .field:has(label:text-is("Greeting")) .reset`);
  ok((await site(page)).text.invite.greeting === s0.text.invite.greeting, 'Undo restores the published wording');
  // credits: role → name pairs
  const cr = '.group[data-group="credits"]';
  const roles0 = (await site(page)).text.credits.roles;
  const n0 = roles0.length;
  await page.locator(`${cr} input[aria-label="Name 1"]`).scrollIntoViewIfNeeded();
  await page.fill(`${cr} input[aria-label="Name 1"]`, '{name}, as the main character');
  let roles = (await site(page)).text.credits.roles;
  ok(roles[0][0] === roles0[0][0] && roles[0][1] === '{name}, as the main character', 'credits: editing a name keeps its role');
  await tap(page, `${cr} .add-btn:has-text("Add a credit")`);
  ok(await S(page, () => document.activeElement && document.activeElement.getAttribute('aria-label')) === `Role ${n0 + 1}`, 'credits: a new row focuses its Role box');
  await page.fill(`${cr} input[aria-label="Role ${n0 + 1}"]`, 'Best laugh');
  await page.fill(`${cr} input[aria-label="Name ${n0 + 1}"]`, '{nick1}');
  await tap(page, `${cr} button[aria-label="Move row ${n0 + 1} up"]`);
  roles = (await site(page)).text.credits.roles;
  ok(roles.length === n0 + 1 && roles[n0 - 1][0] === 'Best laugh' && roles[n0 - 1][1] === '{nick1}', 'credits: add a row + move it up');
  await tap(page, `${cr} button[aria-label="Remove row 1"]`);
  roles = (await site(page)).text.credits.roles;
  ok(roles.length === n0 && roles[0][0] === roles0[1][0] && roles.every((r) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'string')), 'credits: remove a row; every credit is still a [role, name] pair');
  // chapters
  await goSection(page, 'chapters');
  ok(await page.locator('[data-testid="chapter-gate"]').count() === 0 && await page.locator('.chap-row[data-chapter="credits"] .badge.locked').count() === 1, 'Countdown/Invitation/Credits are “Always on”');
  await tap(page, '.chap-row[data-chapter="dance"] .switch');
  ok((await site(page)).chapters.find((c) => c.id === 'dance').enabled === false, 'Festival switched off');
  ok(await page.locator('.chap-row[data-chapter="dance"].is-off').count() === 1, 'row shows off');
  // theme
  await goSection(page, 'theme');
  await page.locator('input[type=range]').first().evaluate((el) => { el.value = '0.25'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('input[type=range]').nth(1).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight'); // 100 % → 130 % with the keyboard
  await tap(page, '.switch-row:has-text("Golden ribbon")');
  const th = (await site(page)).settings.theme;
  ok(th.grain === 0.25 && th.particles === 1.3 && th.ribbon === false, `theme saved (grain ${th.grain}, particles ${th.particles}, ribbon ${th.ribbon})`);
  // media limits
  await goSection(page, 'audio');
  const voiceBig = path.join(TMP, 'voice-30mb.m4a');
  const videoHuge = path.join(TMP, 'video-96mb.mp4');
  await chooseFile(page, () => tap(page, '[data-testid="media-voice-pick"]'), voiceBig);
  await page.waitForSelector('.sheet-title:has-text("big file")');
  await tap(page, '[data-testid="confirm-ok"]');
  await page.waitForFunction(() => !!window.__lanternRoom.state.site.media.voice);
  ok(/^media\/voice-\d{8}-\d{6}\.m4a$/.test((await site(page)).media.voice), 'a 30 MB voice note is accepted after asking');
  await chooseFile(page, () => tap(page, '[data-testid="media-music-pick"]'), fileOf('photo.png', IMG.p34));
  await page.waitForSelector('.toast-error');
  ok(/doesn’t look like an audio file/.test(await page.textContent('.toast-error')) && (await site(page)).media.music === 'media/music-old.mp3', 'an image is refused as music');
  await goSection(page, 'video');
  await chooseFile(page, () => tap(page, '[data-testid="media-video-pick"]'), videoHuge);
  const refused = await page.waitForSelector('.toast-error:has-text("too big to publish")', { timeout: 10000 }).then(() => true).catch(() => false);
  ok(refused && !(await site(page)).media.video, 'a 96 MB video is refused');
  await chooseFile(page, () => tap(page, '[data-testid="media-video-pick"]'), fileOf('IMG_0420.mp4', mp4WithLocation(), 'video/mp4'));
  await page.waitForFunction(() => !!window.__lanternRoom.state.site.media.video);
  const vbytes = Buffer.from(await S(page, async () => { const st = window.__lanternRoom.state; return [...new Uint8Array(await st.files.get(st.site.media.video).arrayBuffer())]; }));
  ok(vbytes.length === mp4WithLocation().length && !vbytes.includes(Buffer.from('12.9716')) && vbytes.includes(Buffer.from('+00.0000+000.0000/')), 'regression: a phone video’s recording location is blanked before upload (same size)');
  const cap = page.getByLabel('Caption under the video');
  await cap.fill('Watch till the end');
  ok((await site(page)).media.videoCaption === 'Watch till the end' && await S(page, () => document.activeElement && document.activeElement.tagName) === 'INPUT', 'video caption saves while typing (focus kept)');
  ok(!errors.length, 'no console errors (words)', errors.join(' | '));
  await context.close();
};

FLOWS.memories = async () => {
  section('HOW IT BEGAN on the phone: checks for broken memories, add a memory + its photos (own shape), link / move / unlink');
  // a memory without an id (an error) and a photo linked to a memory that no longer exists (a reminder)
  const files = repoFiles(IMG);
  const msgs = JSON.parse(files['data/messages.json']);
  msgs.story.memories.push({ kind: 'moment', when: '', text: 'QA: a memory typed by hand without an id' });
  files['data/messages.json'] = text(msgs);
  const photos = JSON.parse(files['data/photos.json']);
  photos.photos.push(model.newPhoto({ id: 'story-lost', chapter: 'story', order: 1, ratio: '1:1', label: 'Lost link', memory: 'm-gone' }));
  files['data/photos.json'] = text(photos);
  const { context, page, errors } = await setup({ phone: true, git: new MockGit(files) });
  await boot(page);
  const memories = () => S(page, () => JSON.parse(JSON.stringify(window.__lanternRoom.state.site.text.story.memories)));
  const n0 = (await memories()).length;
  ok(/Not linked to a memory/.test(await page.textContent('.pcard[data-id="story-lost"] .pcard-meta')), 'library: a How it began photo whose memory is gone says “Not linked to a memory”');
  // the model's checks render in the admin: the Preview checks panel …
  await tap(page, '.checks-banner');
  await page.waitForSelector('#view[data-section="preview"] [data-testid="checks"]');
  const checksText = await page.textContent('[data-testid="checks"]');
  ok(/Memory \d+ has no id/.test(checksText) && /belongs to a memory that no longer exists/.test(checksText), 'Preview → checks list the memory error and the lost-link reminder');
  await tap(page, '.check-item.error:has-text("has no id") .link-btn');
  await page.waitForSelector('#view[data-section="messages"] .group[data-group="story"][open]');
  await page.waitForTimeout(300);
  const inView = await S(page, () => { const r = document.querySelector('.group[data-group="story"]').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight && document.activeElement && document.activeElement.closest('.group[data-group="story"]'); });
  ok(!!inView, '“Open” goes to Messages → How it began (open, scrolled into view, focused)');
  // add a memory for a later month
  await tap(page, '.group[data-group="story"] [data-testid="memory-add"]');
  await page.waitForFunction((n) => window.__lanternRoom.state.site.text.story.memories.length === n + 1, n0);
  const mem = (await memories())[n0];
  let card = `.group[data-group="story"] .mem-card >> nth=${n0}`;
  await page.locator(card).locator('input').fill('November 2026');
  ok((await memories())[n0].when === 'November 2026' && (await memories())[n0].text === '', 'a new memory for November: the date is in, the words stay empty until written');
  // … and the publish sheet
  await tap(page, '[data-testid="publish"]');
  await page.waitForSelector('.sheet-title:has-text("need fixing")');
  ok(/has no id/.test(await page.textContent('.sheet [data-testid="checks"]')), 'Publish is blocked and the sheet names the broken memory');
  await tap(page, '.sheet button:has-text("OK")');
  await noSheet(page);
  // fix it: delete the broken memory (no photos → no question)
  await tap(page, `.group[data-group="story"] button[aria-label="Remove memory ${n0}"]`);
  await page.waitForFunction((n) => window.__lanternRoom.state.site.text.story.memories.length === n, n0);
  ok(model.validate(await site(page)).ok && (await memories())[n0 - 1].id === mem.id, 'after deleting it nothing blocks publishing');
  card = `.group[data-group="story"] .mem-card >> nth=${n0 - 1}`;
  // its photos: the add sheet is preset; “Its own shape” only for chapters that take any shape
  await page.locator(card).locator('[data-act="mem-photos"]').tap();
  await page.waitForSelector('[data-testid="add-memory"]');
  const sheetState = () => S(page, () => ({
    chapter: document.querySelector('[data-testid="add-chapter"]').value,
    memory: document.querySelector('[data-testid="add-memory"]').value,
    memoryShown: !document.querySelector('[data-testid="add-memory"]').closest('[hidden]'),
    shape: document.querySelector('.sheet .shape-chip[aria-checked="true"]').dataset.ratio,
    ownShown: !document.querySelector('.sheet .shape-chip[data-ratio="own"]').hidden,
  }));
  let st = await sheetState();
  ok(st.chapter === 'story' && st.memory === mem.id && st.memoryShown && st.shape === 'own' && st.ownShown, 'Add photos to this memory: How it began + this memory + “Its own shape”', JSON.stringify(st));
  await page.selectOption('[data-testid="add-chapter"]', 'tower');
  st = await sheetState();
  ok(st.shape === '3:4' && !st.ownShown && !st.memoryShown, 'switching to the tower: its 3:4 shape, no memory, no “own shape”', JSON.stringify(st));
  await page.selectOption('[data-testid="add-chapter"]', 'story');
  st = await sheetState();
  ok(st.shape === 'own' && st.ownShown && st.memoryShown && st.memory === mem.id, 'and back: own shape and the memory again', JSON.stringify(st));
  await chooseFile(page, () => tap(page, '[data-testid="add-choose"]'), fileOf('square.png', IMG.sq));
  await page.waitForSelector('.cropper.in');
  ok((await page.textContent('.crop-rule .ratio-badge')).trim() === '1:1', 'the cropper keeps the photo’s own square shape');
  await tap(page, '[data-testid="crop-confirm"]');
  await page.waitForSelector('[data-testid="details-add"]');
  await tap(page, '[data-testid="details-add"]');
  await page.waitForFunction((id) => window.__lanternRoom.state.site.photos.some((p) => p.memory === id && p.src), mem.id, { timeout: 20000 });
  await waitIdle(page);
  const ph = (await allPhotos(page)).find((p) => p.memory === mem.id);
  ok(ph.chapter === 'story' && ph.ratio === '1:1' && exact(await blobInfo(page, ph.src), '1:1') && /November 2026/.test(await lastToast(page)), `added to How it began, linked to the memory, exactly 1:1 (“${await lastToast(page)}”)`);
  await noSheet(page);
  ok(await page.locator(card).locator('.mem-thumb').count() === 1, 'the memory shows its photo');
  const small = await S(page, () => [...document.querySelectorAll('.group[data-group="story"] button, .group[data-group="story"] input, .group[data-group="story"] select, .group[data-group="story"] textarea')]
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height && Math.min(r.width, r.height) < 40).length);
  ok(small === 0 && await S(page, () => document.documentElement.scrollWidth <= innerWidth + 1), 'How it began on a phone: every control ≥ 40 px, no sideways scroll');
  // the editor: moving the photo out of How it began clears its memory
  await page.locator(card).locator('.mem-thumb').tap();
  await page.waitForSelector('[data-testid="edit-memory"]');
  ok(await page.$eval('[data-testid="edit-memory"]', (e) => e.value) === mem.id && await page.isVisible('[data-testid="edit-memory"]'), 'editor: “Belongs to memory” shows its memory');
  await page.selectOption('.editor-fields select >> nth=0', 'tower');
  ok(!(await page.isVisible('[data-testid="edit-memory"]')), 'editor: no memory choice outside How it began');
  await tap(page, '[data-testid="edit-save"]');
  await noSheet(page);
  let moved = await photo(page, ph.id);
  ok(moved.chapter === 'tower' && !('memory' in moved), 'moved out of How it began → its memory link is cleared');
  // the Move dialog: back into How it began, choosing the memory; Undo puts it back unlinked
  await goSection(page, 'library');
  await tap(page, `.pcard[data-id="${ph.id}"] [data-act="move"]`);
  await page.waitForSelector('[data-testid="move-confirm"]');
  await page.selectOption('.sheet select >> nth=0', 'story');
  await page.selectOption('.sheet select >> nth=1', mem.id);
  await tap(page, '[data-testid="move-confirm"]');
  await noSheet(page);
  moved = await photo(page, ph.id);
  ok(moved.chapter === 'story' && moved.memory === mem.id && /November 2026/.test(await lastToast(page)), 'Move to How it began can choose the memory');
  await tap(page, '.toast.has-action .toast-action:has-text("Undo")');
  moved = await photo(page, ph.id);
  ok(moved.chapter === 'tower' && !('memory' in moved) && ordersOk(await allPhotos(page)), 'Undo: back in the tower, unlinked, orders contiguous');
  ok(!errors.length, 'no console errors (memories)', errors.join(' | '));
  await context.close();
};

FLOWS.settings = async () => {
  section('Settings: IST round-trip in another time zone, names, WhatsApp; draft restore; reset');
  const { context, page, errors, dialogs } = await setup({ timezone: 'America/Los_Angeles' });
  await boot(page, 'settings');
  ok(await page.inputValue('[data-testid="unlock-at"]') === '2027-01-03T00:00', `IST shown as India time in a Los Angeles browser (${await page.inputValue('[data-testid="unlock-at"]')})`);
  ok(/3 January,? 2027.*12:00\s?am IST/i.test(await page.textContent('.lock-pretty')), `pretty: “${await page.textContent('.lock-pretty')}”`);
  await page.fill('[data-testid="unlock-at"]', '2027-01-02T23:45');
  await page.dispatchEvent('[data-testid="unlock-at"]', 'change');
  ok((await site(page)).settings.lock.unlockAt === '2027-01-02T23:45:00+05:30', 'stored as +05:30');
  // regression: some browsers report seconds in datetime-local values
  await page.evaluate(() => { const el = document.querySelector('[data-testid="unlock-at"]'); el.step = '1'; el.value = '2027-01-03T00:05:30'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  ok((await site(page)).settings.lock.unlockAt === '2027-01-03T00:05:30+05:30', `regression: a value with seconds is accepted (${(await site(page)).settings.lock.unlockAt})`);
  await page.fill('[data-testid="her-name"]', 'Deepika');
  await page.getByLabel('Your WhatsApp number').fill('+91 (98765) 43210');
  ok((await site(page)).settings.whatsapp === '919876543210', 'WhatsApp digits only');
  // daysAlive at the unlock moment still 7,305 (00:05 is the same day)
  ok(model.daysAlive(await site(page)) === 7305, 'still 7,305 days');
  // save → reload → restore
  await page.click('[data-action="save"]');
  await page.waitForSelector('.toast:has-text("Draft saved")');
  await page.reload();
  await page.waitForSelector('[data-testid="draft-continue"]');
  await page.click('[data-testid="draft-continue"]');
  await page.waitForSelector('#view[data-section="settings"] [data-testid="unlock-at"]');
  ok(await page.inputValue('[data-testid="unlock-at"]') === '2027-01-03T00:05', `after reload the IST time reads the same (${await page.inputValue('[data-testid="unlock-at"]')})`);
  ok(await page.inputValue('[data-testid="her-name"]') === 'Deepika', 'her name restored from the draft');
  // reset
  await page.click('[data-testid="more"]');
  await page.click('[data-testid="menu-reset"]');
  await page.click('[data-testid="confirm-ok"]');
  await page.waitForSelector('.toast:has-text("Draft discarded")');
  await noSheet(page);
  const afterReset = { name: await page.inputValue('[data-testid="her-name"]'), at: (await site(page)).settings.lock.unlockAt, sheets: await page.locator('.sheet-backdrop').count() };
  ok(afterReset.name === 'Deepu' && afterReset.at === '2027-01-03T00:00:00+05:30', 'Reset → back to the published version', JSON.stringify(afterReset));
  dialogs.length = 0;
  await page.reload();
  await page.waitForSelector('#view[data-section="settings"]');
  await page.waitForTimeout(400);
  ok(await page.locator('[data-testid="draft-continue"]').count() === 0 && !dialogs.length, 'after reset: no draft prompt, no leave warning');
  ok(!errors.length, 'no console errors (settings)', errors.join(' | '));
  await context.close();
};

FLOWS.preview = async () => {
  section('PREVIEW button opens the film with the draft; the live film is unchanged');
  const { context, page, errors } = await setup();
  await boot(page);
  const target = (await allPhotos(page)).find((p) => p.chapter === 'tower' && !p.src).id;
  await chooseFile(page, () => page.click(`.pcard[data-id="${target}"] [data-act="replace"]`), fileOf('t.png', IMG.p34));
  await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, target, { timeout: 20000 });
  await waitIdle(page);
  await goSection(page, 'messages');
  await page.getByLabel('Greeting', { exact: true }).fill('Draft greeting for the preview');
  const [popup] = await Promise.all([context.waitForEvent('page'), page.click('[data-action="preview"]')]);
  await popup.waitForURL(/index\.html\?preview&draft/, { timeout: 15000 });
  ok(/\?preview&draft$/.test(popup.url()), `header Preview opens ${popup.url().replace(BASE, '')}`);
  const draftText = await popup.waitForFunction(() => /Draft greeting for the preview/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true).catch(() => false);
  ok(draftText, 'the film shows the draft greeting (saved before opening)');
  await popup.close();
  const film = await context.newPage();
  await film.goto(`${BASE}/index.html?preview&draft&scene=tower`);
  // scenes may show photos as <img>, SVG <image> or CSS backgrounds
  const blobShown = await film.waitForFunction(() => [...document.querySelectorAll('img, image')].some((i) => (i.currentSrc || i.src || i.getAttribute('href') || i.getAttribute('xlink:href') || '').startsWith('blob:'))
    || [...document.querySelectorAll('*')].some((e) => /url\("?blob:/.test(getComputedStyle(e).backgroundImage)), null, { timeout: 30000 }).then(() => true).catch(() => false);
  ok(blobShown, 'draft film (tower) shows the new photo from the draft');
  await film.goto(`${BASE}/index.html?preview`);
  const live = await film.waitForFunction(() => document.body.innerText.length > 10, null, { timeout: 20000 }).then(() => film.evaluate(() => !/Draft greeting for the preview/.test(document.body.innerText))).catch(() => false);
  ok(live, 'the non-draft film keeps the published words');
  await film.close();
  // the Preview section: two clear actions, one line on the difference
  await goSection(page, 'preview');
  const diff = await page.textContent('.preview-diff');
  ok(/unpublished changes from this device/.test(diff) && /live on the site right now/.test(diff), `Preview explains draft vs published (“${diff.slice(0, 60)}…”)`);
  const [draftTab] = await Promise.all([context.waitForEvent('page'), page.click('[data-testid="preview-draft"]')]);
  await draftTab.waitForURL(/index\.html\?preview&draft$/, { timeout: 15000 }).catch(() => {});
  ok(/\/index\.html\?preview&draft$/.test(draftTab.url()), `“Preview draft” opens ${draftTab.url().replace(BASE, '')} in a new tab`);
  ok(await draftTab.waitForFunction(() => /Draft greeting for the preview/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true).catch(() => false), '… which shows the draft');
  await draftTab.close();
  const [liveTab] = await Promise.all([context.waitForEvent('page'), page.click('[data-testid="preview-published"]')]);
  await liveTab.waitForURL(/index\.html\?preview$/, { timeout: 15000 }).catch(() => {});
  ok(/\/index\.html\?preview$/.test(liveTab.url()), `“Preview published” opens ${liveTab.url().replace(BASE, '')} in a new tab`);
  const liveTabOk = await liveTab.waitForFunction(() => document.body.innerText.length > 10, null, { timeout: 20000 }).then(() => liveTab.evaluate(() => !/Draft greeting for the preview/.test(document.body.innerText))).catch(() => false);
  ok(liveTabOk, '… which shows the published words, not the draft');
  await liveTab.close();
  ok(!errors.length, 'no console errors (preview)', errors.join(' | '));
  await context.close();
};

FLOWS.publish = async () => {
  section('PUBLISH against a realistic git store, with a 409 (someone else committed) once; EXPORT zip');
  const { context, page, git, errors } = await setup();
  await boot(page);
  const heroId = (await allPhotos(page)).find((p) => p.role === 'hero').id;
  // 1. replace the published hero (→ its 3 old files must be deleted)
  await chooseFile(page, () => page.click(`.pcard[data-id="${heroId}"] [data-act="replace"]`), fileOf('hero2.png', IMG.p45b));
  await page.waitForFunction((id) => window.__lanternRoom.state.site.photos.find((x) => x.id === id).src !== 'photos/hero-old.jpg', heroId, { timeout: 20000 });
  await waitIdle(page);
  // 2. fill an empty spot, then delete a placeholder record
  const fillId = (await allPhotos(page)).find((p) => p.chapter === 'names' && !p.src).id;
  await chooseFile(page, () => page.click(`.pcard[data-id="${fillId}"] [data-act="replace"]`), fileOf('n.png', IMG.p45));
  await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, fillId, { timeout: 20000 });
  await waitIdle(page);
  const delId = (await allPhotos(page)).find((p) => p.chapter === 'dance' && p.order === 8).id;
  await page.click(`.pcard[data-id="${delId}"] [data-act="delete"]`);
  // 3. replace a photo twice (the intermediate files must never be uploaded)
  const twice = (await allPhotos(page)).find((p) => p.chapter === 'lanterns' && !p.src).id;
  for (const b of [IMG.sq, IMG.sq2]) {
    await chooseFile(page, () => page.click(`.pcard[data-id="${twice}"] [data-act="replace"]`), fileOf('sq.png', b));
    await page.waitForFunction(([id, prev]) => { const p = window.__lanternRoom.state.site.photos.find((x) => x.id === id); return p.src && p.src !== prev; }, [twice, (await photo(page, twice)).src], { timeout: 20000 });
    await waitIdle(page);
  }
  // 4. remove the published music, edit words
  await goSection(page, 'audio');
  await page.click('[data-media="music"] button:has-text("Remove")');
  await goSection(page, 'messages');
  await page.getByLabel('Greeting', { exact: true }).fill('Hey {nick1} — published from QA');
  const draft = await site(page);
  const staged = await S(page, () => [...window.__lanternRoom.state.files.keys()]);
  // export first (python zipfile validates it)
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('[data-testid="more"]'); await page.click('[data-testid="menu-export"]'); })()]);
  const zipPath = path.join(TMP, 'export.zip');
  await download.saveAs(zipPath);
  let zipReport = null;
  try {
    zipReport = JSON.parse(execFileSync('python3', ['-c', `
import zipfile, json, sys
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
names = z.namelist()
data = {n: json.loads(z.read(n).decode('utf-8')) for n in names if n.endswith('.json')}
print(json.dumps({"bad": bad, "names": names, "json": data, "sizes": {n: z.getinfo(n).file_size for n in names}}))
`, zipPath]).toString());
  } catch (err) { zipReport = { error: String(err.message || err) }; }
  ok(zipReport && !zipReport.error && zipReport.bad === null, 'python zipfile opens the export and every CRC is valid', zipReport && zipReport.error);
  if (zipReport && zipReport.json) {
    const zsite = model.combine({ settings: zipReport.json['data/settings.json'], messages: zipReport.json['data/messages.json'], photos: zipReport.json['data/photos.json'] });
    ok(zsite.text.invite.greeting === 'Hey {nick1} — published from QA' && zsite.photos.length === draft.photos.length && model.validate(zsite).ok, 'zip JSON combines into the draft (validate ok)');
    const refs = model.usedFiles(zsite);
    const missing = [...refs].filter((p) => !zipReport.names.includes(p) && !git.file(p));
    ok(!missing.length && staged.every((p) => zipReport.names.includes(p)), `zip holds every new file (${staged.length}); nothing referenced is missing`, missing.join(', '));
    ok(zipReport.names.filter((n) => !n.startsWith('data/')).every((n) => refs.has(n)), 'zip holds no unreferenced files');
  }
  // publish, with someone else committing a words change + a new album photo meanwhile (→ 409 once)
  const theirMsgs = git.json('data/messages.json');
  theirMsgs.credits = { ...(theirMsgs.credits || {}), end: 'Edited on GitHub meanwhile' };
  const theirPhotos = git.json('data/photos.json');
  theirPhotos.photos.push(model.newPhoto({ id: 'x-theirs', chapter: 'album', order: 99, ratio: '1:1', src: 'photos/theirs.jpg', thumb: 'photos/thumbs/theirs.jpg', label: 'Theirs' }));
  git.conflictOnce = (g) => g.commitDirect({ 'data/messages.json': text(theirMsgs), 'data/photos.json': text(theirPhotos), 'photos/theirs.jpg': IMG.sq, 'photos/thumbs/theirs.jpg': IMG.sq }, 'someone else');
  const headBefore = git.head;
  git.calls.length = 0;
  await page.click('[data-testid="publish"]');
  await page.waitForSelector('[data-testid="publish-now"]');
  const listText = await page.textContent('.sheet .change-list');
  ok(/Photo replaced/.test(listText) && /Deleted/.test(listText) && /Removed background music/.test(listText), 'the publish sheet lists the changes in plain words');
  await page.click('[data-testid="publish-now"]');
  await page.waitForSelector('.sheet-title:has-text("Published!")', { timeout: 60000 });
  // the progress sheet lingers ~240 ms while it fades out, so read the success sheet itself
  ok(/both sets of changes were kept/.test(await page.textContent('.sheet:has(.sheet-title:has-text("Published!"))')), 'the success sheet mentions the merge');
  const commits = git.calls.filter((c) => c.method === 'POST' && c.path === '/git/commits');
  const patches = git.calls.filter((c) => c.method === 'PATCH');
  ok(patches.length === 2 && commits.length === 2, `409 → re-read, merged, retried once (${commits.length} commits built, ${patches.length} ref updates)`);
  const head = git.commits.get(git.head);
  ok(head.parents.length === 1 && git.commits.get(head.parents[0]).message === 'someone else' && git.commits.get(git.commits.get(head.parents[0]).parents[0]) && git.commits.get(head.parents[0]).parents[0] === headBefore, 'history: initial → someone else → ours (fast-forward, nothing lost)');
  ok(/^Lantern Room: /.test(head.message), `commit message “${head.message}”`);
  const blobsPosted = git.calls.filter((c) => c.method === 'POST' && c.path === '/git/blobs').length;
  ok(blobsPosted === staged.length, `uploads reused on retry (${blobsPosted} blob uploads for ${staged.length} new files)`);
  // the final repo
  const tree = git.treeOf('main');
  const prevTree = git.trees.get(git.commits.get(head.parents[0]).tree);
  const pub = model.combine({ settings: git.json('data/settings.json'), messages: git.json('data/messages.json'), photos: git.json('data/photos.json') });
  ok(['data/settings.json', 'data/messages.json', 'data/photos.json'].every((f) => /^\{\n {2}"version": 2,/.test(git.file(f).toString()) && git.file(f).toString().endsWith('}\n')), 'JSON files: 2-space indent, version 2, trailing newline');
  ok(model.validate(pub).ok, 'published content passes model.validate');
  ok(pub.text.invite.greeting === 'Hey {nick1} — published from QA' && pub.text.credits.end === 'Edited on GitHub meanwhile', 'my words AND their concurrent words are both live');
  ok(pub.photos.some((p) => p.id === 'x-theirs') && !pub.photos.some((p) => p.id === delId) && pub.photos.find((p) => p.id === heroId).src !== 'photos/hero-old.jpg', 'their new photo kept; my delete + replace applied');
  const refs = model.usedFiles(pub);
  const missingInRepo = [...refs].filter((p) => !tree.has(p));
  ok(!missingInRepo.length, 'every file the content references exists in the repo', missingInRepo.join(', '));
  const removed = [...prevTree.keys()].filter((p) => !tree.has(p)).sort();
  ok(JSON.stringify(removed) === JSON.stringify(['media/music-old.mp3', 'photos/hero-old.jpg', 'photos/originals/hero-old.jpg', 'photos/thumbs/hero-old.jpg']), `deleted exactly the replaced/removed files (${removed.join(', ')})`);
  ok(tree.has('photos/stray-unreferenced.jpg') && tree.has('photos/.gitkeep') && tree.has('media/.gitkeep') && tree.has('README.md'), 'orphans, .gitkeep and non-managed files untouched');
  const added = [...tree.keys()].filter((p) => !prevTree.has(p));
  ok(added.every((p) => refs.has(p)), `every added file is referenced (${added.length} added)`, added.filter((p) => !refs.has(p)).join(', '));
  ok(!added.some((p) => !staged.includes(p)), 'no intermediate (replaced-twice) files uploaded');
  await page.click('.sheet button:has-text("Lovely")');
  await noSheet(page);
  ok(await S(page, () => window.__lanternRoom.changes().count) === 0 && await S(page, () => window.__lanternRoom.state.files.size) === 0, 'after publishing nothing is pending');
  ok(await S(page, () => window.__lanternRoom.state.site.photos.some((p) => p.id === 'x-theirs')), 'the admin now shows their photo too');
  // publish again with nothing to do
  await page.click('[data-testid="publish"]');
  await page.waitForSelector('.toast:has-text("Nothing new to publish")');
  ok(true, 'publishing with no changes says so');
  // a words-only change → the commit touches data/messages.json only
  await goSection(page, 'messages');
  await page.getByLabel('Greeting', { exact: true }).fill('Words only');
  git.calls.length = 0;
  await page.click('[data-testid="publish"]');
  await page.click('[data-testid="publish-now"]');
  await page.waitForSelector('.sheet-title:has-text("Published!")', { timeout: 30000 });
  const wtree = git.calls.filter((c) => c.method === 'POST' && c.path === '/git/trees').pop().body.tree;
  ok(JSON.stringify(wtree.map((e) => e.path)) === '["data/messages.json"]' && !git.calls.some((c) => c.path === '/git/blobs'), 'a words-only publish writes data/messages.json only (no blobs, no other files)', JSON.stringify(wtree.map((e) => e.path)));
  ok(git.json('data/messages.json').invite.greeting === 'Words only' && model.validate(model.combine({ settings: git.json('data/settings.json'), messages: git.json('data/messages.json'), photos: git.json('data/photos.json') })).ok, 'combine() of the published files validates');
  await page.click('.sheet button:has-text("Lovely")');
  await noSheet(page);
  // a real conflict that can't be retried twice → friendly error, draft kept
  await goSection(page, 'messages');
  await page.getByLabel('Greeting', { exact: true }).fill('Second publish');
  let n = 0;
  await context.route('https://api.github.com/repos/o/r/git/refs/heads/main', (route) => { n++; return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'Update is not a fast forward' }) }); });
  await page.click('[data-testid="publish"]');
  await page.click('[data-testid="publish-now"]');
  await page.waitForSelector('.sheet-title:has-text("didn’t work")', { timeout: 30000 });
  const conflictInfo = { n, sheet: (await page.textContent('.sheet:has(.sheet-title:has-text("didn’t work"))')).slice(0, 200), greeting: (await site(page)).text.invite.greeting };
  ok(n === 2 && /changed the site at the same moment/.test(conflictInfo.sheet) && conflictInfo.greeting === 'Second publish', 'two conflicts in a row → friendly message, draft kept', JSON.stringify(conflictInfo));
  ok(!errors.filter((e) => !/publish failed/.test(e)).length, 'no console errors (publish)', errors.join(' | '));
  await context.close();
};

FLOWS.missingJson = async () => {
  section('PUBLISH when one of the three JSON files is missing in the repo');
  const files = repoFiles(IMG);
  delete files['data/photos.json'];
  const git = new MockGit(files);
  const { context, page, errors } = await setup({ git });
  await boot(page, 'messages');
  await page.getByLabel('Greeting', { exact: true }).fill('Only a words change');
  await page.click('[data-testid="publish"]');
  await page.click('[data-testid="publish-now"]');
  await page.waitForSelector('.sheet-title:has-text("Published!")', { timeout: 30000 });
  ok(!!git.file('data/photos.json'), 'regression: a missing data/photos.json is written on publish (the film needs all three)');
  ok(!errors.length, 'no console errors (missing json)', errors.join(' | '));
  await context.close();
};

FLOWS.security = async () => {
  section('SECURITY: token storage (remember on/off), token only to api.github.com, never in drafts/exports/URLs; CSP; XSS; framing');
  const TOKEN = 'github_pat_QA0123456789abcdefSECRET';
  // hostile owner text straight from the repo: it must only ever be shown as text
  const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1"><script>window.__xss=1</script>"\'><svg onload="window.__xss=1">';
  const files = repoFiles(IMG);
  const photos = JSON.parse(files['data/photos.json']);
  const evil = photos.photos.find((p) => p.chapter === 'tower');
  Object.assign(evil, { label: `L ${XSS}`, caption: `C ${XSS}`, date: `D ${XSS}`, alt: `A ${XSS}`, hint: `H ${XSS}`, featured: true });
  photos.photos.push(model.newPhoto({ id: 'evil<b>id</b>', chapter: 'album', label: `Album ${XSS}` }));
  files['data/photos.json'] = text(photos);
  const settings = JSON.parse(files['data/settings.json']);
  Object.assign(settings.her, { name: `Deepu ${XSS}` });
  settings.from.name = `Me ${XSS}`;
  settings.media.musicTitle = `Song ${XSS}`;
  settings.settings.github = { owner: 'o', repo: 'r', branch: 'main' };
  files['data/settings.json'] = text(settings);
  const msgs = JSON.parse(files['data/messages.json']);
  msgs.invite.greeting = `Hey ${XSS}`;
  msgs.credits.roles.push([`Role ${XSS}`, `Name ${XSS}`]);
  msgs[`extra${XSS}`] = { [`key${XSS}`]: `Val ${XSS}` };
  files['data/messages.json'] = text(msgs);
  const git = new MockGit(files);
  git.token = TOKEN;
  const { context, page, errors } = await setup({ token: null, welcomed: true, git });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} → ${e.blockedURI}`));
  });
  const requests = [];
  context.on('request', (r) => requests.push({ url: r.url(), auth: r.headers().authorization || '', post: r.postData() || '' }));
  const consoleText = [];
  page.on('console', (m) => consoleText.push(m.text()));
  await boot(page);

  // CSP + referrer are in force
  const policy = await S(page, () => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
  ok(/script-src 'self'/.test(policy) && !/unsafe-eval|unsafe-inline/.test(policy) && /connect-src 'self' https:\/\/api\.github\.com https:\/\/raw\.githubusercontent\.com/.test(policy), 'a strict CSP <meta> is present (self scripts, no unsafe-*)');
  ok(await S(page, () => { const s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.body.append(s); return !window.__inline; }), 'an injected inline <script> does not run');
  ok(await S(page, () => new Promise((resolve) => { const s = document.createElement('script'); s.src = 'data:text/javascript,window.__dataScript=1'; s.onerror = () => resolve(!window.__dataScript); s.onload = () => resolve(false); document.body.append(s); })), 'a data: script does not run');
  await page.waitForTimeout(100);
  errors.length = 0; // the two refusals above were provoked on purpose
  await S(page, () => { window.__csp.length = 0; });
  ok(await S(page, () => (document.querySelector('meta[name="referrer"]') || {}).content) === 'no-referrer', 'referrer policy: no-referrer');

  // connect with "remember on this device" OFF → sessionStorage only
  await page.click('#status');
  await page.waitForSelector('#gh-token');
  ok(await page.isChecked('[data-testid="remember-token"]'), '“Remember on this device” is on by default');
  await page.fill('#gh-token', TOKEN);
  await page.locator('[data-testid="remember-token"]').setChecked(false, { force: true });
  await page.click('[data-testid="connect"]');
  await noSheet(page);
  await page.waitForFunction(() => /Connected|All live/.test(document.getElementById('status').textContent));
  let store = await S(page, () => ({ ls: localStorage.getItem('deepu-admin-token'), ss: sessionStorage.getItem('deepu-admin-token') }));
  ok(store.ls === null && store.ss === TOKEN, 'remember OFF → token only in sessionStorage', JSON.stringify(store));
  await page.reload();
  await boot(page);
  await page.waitForFunction(() => /Connected|All live/.test(document.getElementById('status').textContent));
  ok(true, 'remember OFF: still connected after a reload of the same tab');
  await goSection(page, 'settings');
  ok(/this tab only/.test(await page.textContent('[data-testid="token-place"]')), 'Settings says the token is kept for this tab only');
  const tab2 = await context.newPage();
  await tab2.goto(`${BASE}/admin/#library`);
  await tab2.waitForSelector('#view[data-section="library"]');
  await tab2.waitForTimeout(300);
  ok(await tab2.evaluate(() => window.__lanternRoom.state.conn.token === '' && !localStorage.getItem('deepu-admin-token')), 'remember OFF: a new tab is not connected (nothing on the device)');
  await tab2.close();

  // reconnect with remember ON → localStorage only
  await page.click('button:has-text("Change token")');
  await page.waitForSelector('#gh-token');
  ok(!(await page.isChecked('[data-testid="remember-token"]')), 'the toggle remembers the current choice (off)');
  await page.fill('#gh-token', TOKEN);
  await page.locator('[data-testid="remember-token"]').setChecked(true, { force: true });
  await page.click('[data-testid="connect"]');
  await noSheet(page);
  store = await S(page, () => ({ ls: localStorage.getItem('deepu-admin-token'), ss: sessionStorage.getItem('deepu-admin-token') }));
  ok(store.ls === TOKEN && store.ss === null, 'remember ON → token only in localStorage', JSON.stringify(store));

  // hostile text everywhere is shown as text, never parsed as HTML
  const visit = ['library', 'chapters', 'messages', 'audio', 'video', 'theme', 'preview', 'settings', 'help'];
  for (const sec of visit) {
    await goSection(page, sec);
    if (sec === 'messages') await page.click('button:has-text("Open all")');
    await page.waitForTimeout(150);
  }
  await goSection(page, 'library');
  await page.click(`.pcard[data-id="${evil.id}"] [data-act="edit"]`);
  await page.waitForSelector('[data-testid="edit-caption"]');
  await page.fill('[data-testid="edit-caption"]', `New ${XSS}`);
  await page.click('[data-testid="edit-save"]');
  await noSheet(page);
  await page.click('[data-testid="publish"]');
  await page.waitForSelector('[data-testid="publish-now"]');
  await page.waitForTimeout(200);
  const xss = await S(page, () => ({ ran: window.__xss || 0, imgs: document.querySelectorAll('img[src="x"], svg[onload], script:not([src])').length, shown: document.body.textContent.includes('onerror="window.__xss') }));
  ok(xss.ran === 0 && xss.imgs === 0 && xss.shown, 'hostile captions/labels/names/messages/credits render as plain text (no script ran)', JSON.stringify(xss));
  await page.click('.sheet button:has-text("Not yet")');
  await noSheet(page);

  // a draft with a new photo, saved; then export — the token must be in neither
  await goSection(page, 'library');
  const fill = (await allPhotos(page)).find((p) => p.chapter === 'names' && !p.src).id;
  await chooseFile(page, () => page.click(`.pcard[data-id="${fill}"] [data-act="replace"]`), fileOf('n.png', IMG.p45));
  await page.waitForFunction((id) => !!window.__lanternRoom.state.site.photos.find((x) => x.id === id).src, fill, { timeout: 20000 });
  await waitIdle(page);
  await page.click('[data-action="save"]');
  await page.waitForSelector('.toast:has-text("Draft saved")');
  const idb = await S(page, () => new Promise((resolve, reject) => {
    const r = indexedDB.open('deepu-admin');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const st = r.result.transaction('drafts').objectStore('drafts');
      const kq = st.getAllKeys();
      kq.onsuccess = () => {
        const vq = st.getAll();
        vq.onsuccess = () => {
          const out = {};
          kq.result.forEach((k, i) => { out[k] = k === 'files' ? Object.keys(vq.result[i] || {}) : vq.result[i]; });
          resolve(JSON.stringify(out));
        };
      };
    };
  }));
  ok(idb.length > 1000 && !idb.includes(TOKEN) && !/github_pat_|Bearer/.test(idb), `the draft in IndexedDB holds no token (${(idb.length / 1024).toFixed(0)} KB checked)`);
  const others = await S(page, (k) => Object.keys(localStorage).filter((x) => x !== k).map((x) => localStorage.getItem(x)).join('\n') + Object.keys(sessionStorage).map((x) => sessionStorage.getItem(x)).join('\n'), 'deepu-admin-token');
  ok(!others.includes(TOKEN), 'no other storage key holds the token');
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('[data-testid="more"]'); await page.click('[data-testid="menu-export"]'); })()]);
  const zipBytes = fs.readFileSync(await download.path());
  ok(zipBytes.length > 1000 && !zipBytes.includes(Buffer.from(TOKEN)) && !zipBytes.includes(Buffer.from('github_pat_')), `the export holds no token (${(zipBytes.length / 1024).toFixed(0)} KB checked)`);
  // publish, so every kind of request has happened
  await page.click('[data-testid="publish"]');
  await page.click('[data-testid="publish-now"]');
  await page.waitForSelector('.sheet-title:has-text("Published!")', { timeout: 30000 });
  await page.click('.sheet button:has-text("Lovely")');
  await noSheet(page);
  const authed = requests.filter((r) => r.auth);
  ok(authed.length > 10 && authed.every((r) => r.url.startsWith('https://api.github.com/') && r.auth === `Bearer ${TOKEN}`), `the token is only sent to https://api.github.com, in the Authorization header (${authed.length} requests)`);
  ok(!requests.some((r) => r.url.includes(TOKEN) || r.post.includes(TOKEN)), `the token never appears in a URL or request body (${requests.length} requests)`);
  ok(!requests.some((r) => r.url.startsWith('https://raw.githubusercontent.com') && r.auth), 'raw.githubusercontent.com never gets the token');
  ok(!consoleText.some((t) => t.includes(TOKEN)), 'the token is never logged');
  const csp = await S(page, () => window.__csp);
  ok(!csp.length, 'the admin works under the CSP: no violations in the whole flow', csp.join(' | '));
  // forget
  await goSection(page, 'settings');
  await page.click('[data-testid="forget-token"]');
  store = await S(page, () => ({ ls: localStorage.getItem('deepu-admin-token'), ss: sessionStorage.getItem('deepu-admin-token'), mem: window.__lanternRoom.state.conn.token }));
  ok(store.ls === null && store.ss === null && store.mem === '', 'Forget token clears it everywhere', JSON.stringify(store));
  ok(!errors.length, 'no console errors (security)', errors.join(' | '));

  // clickjacking: inside someone else's frame the admin refuses to start
  const framer = await context.newPage();
  await framer.setContent(`<iframe src="${BASE}/admin/#library" width="800" height="600"></iframe>`);
  const frame = await (await framer.waitForSelector('iframe')).contentFrame();
  await frame.waitForSelector('text=only works when it is opened directly', { timeout: 15000 });
  ok(await frame.evaluate(() => !document.querySelector('.pcard') && !document.getElementById('view')), 'framed by another page → refuses to start (no UI to click)');
  await framer.close();
  await context.close();
};

/* ================================================================ run */
(async () => {
  model = await import(pathToFileURL(path.join(ROOT, 'assets/js/shared/model.js')).href);
  browser = await chromium.launch();
  try {
    // images: PNGs here, JPEGs (incl. EXIF orientation 6 and 6000×4000) encoded by Chromium itself
    const png = (w, h, bg, face) => pngOf(w, h, scenePaint(bg, face));
    IMG = {
      p45: png(400, 500), p45b: png(480, 600, [140, 80, 110]), p34: png(450, 600, [90, 120, 80]), w169: png(640, 360, [60, 60, 120]),
      sq: png(500, 500, [120, 90, 60]), sq2: png(520, 520, [60, 120, 90]), garbage: Buffer.concat([Buffer.from('\0\0\0\x18ftypheic'), crypto.randomBytes(3000)]),
      ten: [[600, 800], [800, 600], [700, 700], [640, 360], [480, 600], [900, 600], [600, 900], [360, 640], [750, 1000], [1000, 750]].map(([w, h], i) => png(w, h, [40 + i * 18, 120 - i * 6, 160 - i * 9], [0.3 + 0.04 * i, 0.3])),
    };
    const page = await browser.newPage();
    await page.goto(`${BASE}/admin/index.html`);
    const toJpeg = async (w, h, rotate) => Buffer.from(await page.evaluate(async ([W, H, rot]) => {
      // draw the UPRIGHT scene, then store it rotated 90° counter-clockwise (what a phone does for orientation 6)
      const up = document.createElement('canvas'); up.width = W; up.height = H;
      const x = up.getContext('2d');
      x.fillStyle = 'rgb(80,100,150)'; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgb(205,150,118)'; x.beginPath(); x.ellipse(W / 2, H * 0.35, W * 0.14, W * 0.18, 0, 0, 7); x.fill();
      x.fillStyle = 'rgb(220,30,30)'; x.fillRect(0, 0, W / 8, H / 8);
      x.fillStyle = 'rgb(30,60,220)'; x.fillRect(W - W / 8, H - H / 8, W / 8, H / 8);
      let c = up;
      if (rot) { c = document.createElement('canvas'); c.width = H; c.height = W; const y = c.getContext('2d'); y.translate(0, W); y.rotate(-Math.PI / 2); y.drawImage(up, 0, 0); }
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      return [...new Uint8Array(await b.arrayBuffer())];
    }, [w, h, rotate]));
    IMG.exif6 = withOrientation(await toJpeg(600, 800, true), 6);
    IMG.exifPrivate = withPrivateMetadata(await toJpeg(600, 800, true), 6);
    IMG.jpeg45 = await toJpeg(800, 1000, false);
    IMG.huge = await toJpeg(6000, 4000, false);
    // > 12 MB PNG (noise) and big media files
    const N = 2400;
    fs.writeFileSync(path.join(TMP, 'noisy-big.png'), pngOf(N, N, () => [Math.random() * 255 | 0, Math.random() * 255 | 0, Math.random() * 255 | 0]));
    const sparse = (f, mb) => { const fd = fs.openSync(path.join(TMP, f), 'w'); fs.ftruncateSync(fd, mb * 1024 * 1024); fs.closeSync(fd); };
    sparse('voice-30mb.m4a', 30);
    sparse('video-96mb.mp4', 96);
    await page.close();

    for (const [name, fn] of Object.entries(FLOWS)) {
      if (ONLY && !ONLY.includes(name)) continue;
      try { await fn(); } catch (err) { failures++; console.log(`  FAIL  [${name}] ${String(err.message || err).split('\n').slice(0, 3).join(' / ')}`); }
    }
  } finally {
    await browser.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\n${results.filter((r) => r.ok).length} passed, ${failures} failed`);
  console.log(failures ? '✗ admin QA: failures' : '✓ admin QA passed');
  process.exit(failures ? 1 : 0);
})();
