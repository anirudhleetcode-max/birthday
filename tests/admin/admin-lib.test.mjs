// Admin helpers: ZIP writer, 3-way merge, change summaries, ratios/naming, IST, publish planning and
// the GitHub one-commit publish (mocked fetch).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { combine, split, FILES, newPhoto, clone, normalize, usedFiles } from '../../assets/js/shared/model.js';
import { crc32, makeZip, readZip, zipBlob } from '../../admin/zip.js';
import {
  merge3, mergeSites, describeChanges, deletedPaths, isManagedPath, intRatio, outputSize, uniquePath, photoPaths, stamp,
  isoToIstInput, istInputToIso, formatBytes, deepEqual,
} from '../../admin/util.js';
import { GitHub, jsonText, decodeBase64Utf8, isApiUrl } from '../../admin/github.js';
import { planPublish } from '../../admin/publish.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const loadSite = () => combine({ settings: read(FILES.settings), messages: read(FILES.messages), photos: read(FILES.photos) });

/* ---------------------------------------------------------------- zip */
test('crc32 known vectors', () => {
  assert.equal(crc32(new TextEncoder().encode('')), 0);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});

test('makeZip (STORE) round-trips names, bytes and CRCs; unzip can read it', async () => {
  const bin = new Uint8Array(70000).map((_, i) => (i * 31) & 255);
  const entries = [
    { name: 'data/settings.json', data: '{"a":1}\n' },
    { name: 'data/messages.json', data: '{"greeting":"Hey Pinky ✨"}\n' },
    { name: 'photos/tower-1-20261102-101500.webp', data: bin },
  ];
  const zip = makeZip(entries);
  const back = readZip(zip);
  assert.deepEqual(back.map((e) => e.name), entries.map((e) => e.name));
  assert.equal(new TextDecoder().decode(back[1].data), '{"greeting":"Hey Pinky ✨"}\n');
  assert.deepEqual(back[2].data, bin);
  for (const e of back) assert.equal(e.crc, crc32(e.data));
  const blob = await zipBlob([{ name: 'x.txt', blob: new Blob(['hello']) }]);
  assert.equal(blob.type, 'application/zip');
  // cross-check with the system unzip when available
  const tmp = new URL('./.tmp-test.zip', import.meta.url);
  fs.writeFileSync(tmp, zip);
  try {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('unzip', ['-t', tmp.pathname], { encoding: 'utf8' });
    assert.match(out, /No errors detected/);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

/* ---------------------------------------------------------------- ratios & names */
test('intRatio / outputSize give exact integer ratios', () => {
  assert.deepEqual(intRatio('4:5'), { w: 4, h: 5, value: 0.8, label: '4:5' });
  assert.equal(intRatio('8:10').label, '4:5');
  assert.equal(intRatio('9:19.5').label, '6:13');
  for (const r of ['3:4', '4:5', '1:1', '4:3', '3:2', '2:3', '16:9', '9:16']) {
    const s = outputSize(r, 1800);
    assert.ok(Math.max(s.w, s.h) <= 1800, r);
    assert.ok(Math.max(s.w, s.h) > 1700, r);
    const R = intRatio(r);
    assert.equal(s.w * R.h, s.h * R.w, `${r} exact`);
    const t = outputSize(r, 640);
    assert.equal(t.w * R.h, t.h * R.w);
  }
});

test('photo paths are unique and stamped', () => {
  const when = new Date(2026, 10, 2, 10, 15, 0);
  assert.equal(stamp(when), '20261102-101500');
  const p = photoPaths('Tower-1', { displayExt: 'webp', originalExt: 'png', when });
  assert.deepEqual(p, { src: 'photos/tower-1-20261102-101500.webp', thumb: 'photos/thumbs/tower-1-20261102-101500.jpg', original: 'photos/originals/tower-1-20261102-101500.png' });
  const taken = new Set([p.src, 'photos/tower-1-20261102-101500-2.webp']);
  assert.equal(uniquePath(p.src, (x) => taken.has(x)), 'photos/tower-1-20261102-101500-3.webp');
  assert.ok(isManagedPath('photos/a.jpg') && isManagedPath('media/m.mp3'));
  assert.ok(!isManagedPath('data/photos.json') && !isManagedPath('photos/.gitkeep') && !isManagedPath('index.html'));
});

test('IST helpers store +05:30 and show India time', () => {
  assert.equal(isoToIstInput('2027-01-03T00:00:00+05:30'), '2027-01-03T00:00');
  assert.equal(isoToIstInput('2027-01-02T18:30:00Z'), '2027-01-03T00:00');
  assert.equal(istInputToIso('2027-01-03T00:00'), '2027-01-03T00:00:00+05:30');
  assert.equal(istInputToIso('tomorrow'), null);
  assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB');
});

/* ---------------------------------------------------------------- merge & changes */
test('merge3: my edits win, their unrelated edits are kept, photos merge by id', () => {
  const base = loadSite();
  const mine = clone(base);
  const theirs = clone(base);
  mine.text.invite.greeting = 'Hello you';
  mine.photos[1].caption = 'mine';
  mine.photos.push(newPhoto({ id: 'new-mine', chapter: 'album', src: 'photos/new-mine.webp' }));
  theirs.her.name = 'Deepika';
  theirs.photos[2].caption = 'theirs';
  theirs.photos.push(newPhoto({ id: 'new-theirs', chapter: 'album' }));
  const m = mergeSites(base, mine, theirs);
  assert.equal(m.text.invite.greeting, 'Hello you');
  assert.equal(m.her.name, 'Deepika');
  assert.equal(m.photos.find((p) => p.id === base.photos[1].id).caption, 'mine');
  assert.equal(m.photos.find((p) => p.id === base.photos[2].id).caption, 'theirs');
  assert.ok(m.photos.some((p) => p.id === 'new-mine') && m.photos.some((p) => p.id === 'new-theirs'));
  // a photo I deleted stays deleted
  const mine2 = clone(base);
  mine2.photos.splice(0, 1);
  assert.ok(!merge3(base, mine2, theirs).photos.some((p) => p.id === base.photos[0].id));
  // unchanged draft simply follows theirs
  assert.deepEqual(merge3(base, clone(base), theirs), theirs);
});

test('describeChanges counts and names what changed', () => {
  const base = loadSite();
  const site = clone(base);
  assert.equal(describeChanges(base, site).count, 0);
  const t1 = site.photos.find((p) => p.chapter === 'tower');
  t1.src = 'photos/t.webp';
  t1.caption = 'Laughing';
  site.photos.push(newPhoto({ chapter: 'album', label: 'Goa' }));
  site.text.invite.button = 'Open it';
  site.settings.lock.enabled = false;
  site.chapters.find((c) => c.id === 'video').enabled = false;
  const ch = describeChanges(base, site);
  const kinds = ch.items.map((i) => i.kind);
  for (const k of ['photo-fill', 'photo-edit', 'photo-add', 'words', 'settings', 'chapter']) assert.ok(kinds.includes(k), k);
  assert.ok(ch.count >= 6);
  assert.ok(ch.message.length <= 72);
  assert.match(ch.message, /^Lantern Room: /);
});

test('deletedPaths: replaced/removed files only, never data/', () => {
  const base = normalize({ photos: [newPhoto({ id: 'a', src: 'photos/a-1.webp', thumb: 'photos/thumbs/a-1.jpg', original: 'photos/originals/a-1.jpg' })], media: { music: 'media/m-1.mp3' } });
  const site = clone(base);
  site.photos[0].src = 'photos/a-2.webp';
  site.photos[0].thumb = 'photos/thumbs/a-2.jpg';
  site.media.music = null;
  assert.deepEqual(deletedPaths(base, site).sort(), ['media/m-1.mp3', 'photos/a-1.webp', 'photos/thumbs/a-1.jpg']);
});

/* ---------------------------------------------------------------- publish planning */
function remoteOf(site) {
  const parts = split(site);
  return { site: combine(parts), texts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, jsonText(v)])), legacy: false };
}

test('planPublish: only changed JSON files, new blobs, deletions of replaced files', () => {
  const base = loadSite();
  const hero = base.photos.find((p) => p.role === 'hero');
  Object.assign(hero, { src: 'photos/hero-old.jpg', thumb: 'photos/thumbs/hero-old.jpg', original: 'photos/originals/hero-old.jpg' });
  const site = clone(base);
  const h2 = site.photos.find((p) => p.id === hero.id);
  Object.assign(h2, { src: 'photos/hero-new.webp', thumb: 'photos/thumbs/hero-new.jpg', original: 'photos/originals/hero-new.jpg' });
  const files = new Map([
    ['photos/hero-new.webp', new Blob(['a'])], ['photos/thumbs/hero-new.jpg', new Blob(['b'])], ['photos/originals/hero-new.jpg', new Blob(['c'])],
    ['photos/orphan.webp', new Blob(['d'])], // staged but no longer referenced → not uploaded
  ]);
  const existing = new Set(['index.html', 'data/settings.json', 'data/messages.json', 'data/photos.json', 'photos/hero-old.jpg', 'photos/thumbs/hero-old.jpg', 'photos/originals/hero-old.jpg', 'photos/.gitkeep']);
  const plan = planPublish({ base, site, files, remote: remoteOf(base), existing });
  assert.deepEqual(Object.keys(plan.json), ['data/photos.json']);
  assert.deepEqual([...plan.files.keys()].sort(), ['photos/hero-new.webp', 'photos/originals/hero-new.jpg', 'photos/thumbs/hero-new.jpg']);
  assert.deepEqual(plan.deletes.sort(), ['photos/hero-old.jpg', 'photos/originals/hero-old.jpg', 'photos/thumbs/hero-old.jpg']);
  assert.equal(plan.json['data/photos.json'].photos.find((p) => p.id === hero.id).src, 'photos/hero-new.webp');
});

test('planPublish: merges a concurrent remote change and refuses missing files', () => {
  const base = loadSite();
  const site = clone(base);
  site.text.invite.button = 'Begin';
  const theirs = clone(base);
  theirs.settings.whatsapp = '919811111111';
  const inRepo = new Set(Object.values(FILES));
  const plan = planPublish({ base, site, files: new Map(), remote: remoteOf(theirs), existing: inRepo });
  assert.equal(plan.site.settings.whatsapp, '919811111111');
  assert.equal(plan.site.text.invite.button, 'Begin');
  assert.deepEqual(Object.keys(plan.json), ['data/messages.json']);
  // a content file missing from the repo is (re)written even when nothing in it changed
  const partial = planPublish({ base, site, files: new Map(), remote: remoteOf(theirs), existing: new Set([FILES.settings, FILES.messages]) });
  assert.deepEqual(Object.keys(partial.json).sort(), ['data/messages.json', 'data/photos.json']);
  const lost = clone(base);
  lost.photos[0].src = 'photos/never-uploaded.webp';
  assert.throws(() => planPublish({ base, site: lost, files: new Map(), remote: remoteOf(base), existing: new Set() }), /missing on this device/);
});

/* ---------------------------------------------------------------- GitHub (mocked) */
function mockRepo(site, { conflictOnce = false } = {}) {
  const parts = split(site);
  const files = { 'data/settings.json': jsonText(parts.settings), 'data/messages.json': jsonText(parts.messages), 'data/photos.json': jsonText(parts.photos), 'photos/old.jpg': 'x' };
  const calls = [];
  let head = 'c1';
  let conflicts = conflictOnce ? 1 : 0;
  const json = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob([JSON.stringify(body)]) });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace('/repos/o/r', '');
    const method = init.method || 'GET';
    calls.push({ method, path, body: init.body ? JSON.parse(init.body) : null, url: String(url), headers: { ...(init.headers || {}) }, credentials: init.credentials });
    if (method === 'GET' && path === '') return json(200, { full_name: 'o/r', permissions: { push: true }, default_branch: 'main' });
    if (method === 'GET' && path.startsWith('/branches/')) return json(200, { name: 'main' });
    if (method === 'GET' && path === '/git/ref/heads/main') return json(200, { object: { sha: head } });
    if (method === 'GET' && path.startsWith('/git/commits/')) return json(200, { tree: { sha: `t-${head}` } });
    if (method === 'GET' && path.startsWith('/git/trees/')) return json(200, { tree: Object.keys(files).map((p) => ({ path: p, type: 'blob' })) });
    if (method === 'GET' && path.startsWith('/contents/')) {
      const p = decodeURIComponent(path.slice('/contents/'.length));
      if (!(p in files)) return json(404, { message: 'Not Found' });
      return json(200, { encoding: 'base64', content: Buffer.from(files[p], 'utf8').toString('base64'), sha: `s-${p}`, size: files[p].length });
    }
    if (method === 'POST' && path === '/git/blobs') return json(201, { sha: `b${calls.length}` });
    if (method === 'POST' && path === '/git/trees') return json(201, { sha: 'tree2' });
    if (method === 'POST' && path === '/git/commits') return json(201, { sha: 'c2' });
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      if (conflicts) { conflicts--; return json(422, { message: 'Update is not a fast forward' }); }
      head = 'c2';
      return json(200, {});
    }
    return json(500, { message: `unmocked ${method} ${path}` });
  };
  return { fetch, calls };
}

test('GitHub.getContent combines the three files (UTF-8)', async () => {
  const site = loadSite();
  site.text.invite.greeting = 'Hey Pinky ✨ — ünïcode';
  const { fetch } = mockRepo(site);
  const gh = new GitHub({ owner: 'o', repo: 'r', token: 't', fetch });
  const { site: got, legacy } = await gh.getContent();
  assert.equal(legacy, false);
  assert.equal(got.text.invite.greeting, 'Hey Pinky ✨ — ünïcode');
  assert.equal(decodeBase64Utf8(Buffer.from('ä✨', 'utf8').toString('base64')), 'ä✨');
});

test('GitHub.publish: ONE commit with changed JSON, blobs and deletions; retries a conflict once', async () => {
  const base = loadSite();
  const hero = base.photos.find((p) => p.role === 'hero');
  hero.src = 'photos/old.jpg';
  const site = clone(base);
  site.photos.find((p) => p.id === hero.id).src = 'photos/new.webp';
  const { fetch, calls } = mockRepo(base, { conflictOnce: true });
  const gh = new GitHub({ owner: 'o', repo: 'r', token: 't', fetch });
  const files = new Map([['photos/new.webp', new Blob(['img'])]]);
  const res = await gh.publish({ message: 'test', prepare: (remote, existing) => planPublish({ base, site, files, remote, existing }) });
  assert.equal(res.retried, true);
  assert.deepEqual(res.written, ['data/photos.json']);
  assert.deepEqual(res.deleted, ['photos/old.jpg']);
  const blobs = calls.filter((c) => c.method === 'POST' && c.path === '/git/blobs');
  assert.equal(blobs.length, 1, 'blob uploaded once, reused on retry');
  const trees = calls.filter((c) => c.path === '/git/trees');
  const tree = trees[trees.length - 1].body.tree;
  assert.deepEqual(tree.map((e) => e.path).sort(), ['data/photos.json', 'photos/new.webp', 'photos/old.jpg']);
  assert.equal(tree.find((e) => e.path === 'photos/old.jpg').sha, null);
  assert.ok(tree.find((e) => e.path === 'data/photos.json').content.endsWith('\n'));
  assert.ok(!tree.some((e) => e.path === 'data/site.json'));
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 2);
  assert.ok(deepEqual(usedFiles(res.site), usedFiles(site)));
});

/* ---------------------------------------------------------------- token safety */
test('the token may only go to https://api.github.com (exact origin)', () => {
  assert.equal(isApiUrl('https://api.github.com/repos/o/r'), true);
  for (const bad of ['http://api.github.com/repos', 'https://api.github.com.evil.example/x', 'https://evil.example/?https://api.github.com/',
    'https://user:pw@api.github.com/x', 'https://raw.githubusercontent.com/o/r/main/x', 'javascript:alert(1)', '', null]) {
    assert.equal(isApiUrl(bad), false, String(bad));
  }
});

test('GitHub client: token only in the Authorization header, never in a URL or body; no cookies', async () => {
  const TOKEN = 'github_pat_unit0123456789SECRET';
  const base = loadSite();
  const site = clone(base);
  site.text.invite.greeting = 'changed';
  const { fetch, calls } = mockRepo(base);
  const gh = new GitHub({ owner: 'o', repo: 'r', token: TOKEN, fetch });
  await gh.check();
  await gh.publish({ message: 'x', prepare: (remote, existing) => planPublish({ base, site, files: new Map(), remote, existing }) });
  assert.ok(calls.length > 5);
  for (const c of calls) {
    assert.ok(c.url.startsWith('https://api.github.com/'), c.url);
    assert.equal(c.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(c.credentials, 'omit');
    assert.ok(!c.url.includes(TOKEN) && !JSON.stringify(c.body || '').includes(TOKEN));
  }
  assert.ok(!gh.rawUrl('data/settings.json').includes(TOKEN));
  // anonymous client: no Authorization header at all
  const anon = new GitHub({ owner: 'o', repo: 'r', fetch });
  await anon.getContent();
  assert.ok(calls.slice(-3).every((c) => !('Authorization' in c.headers)));
});
