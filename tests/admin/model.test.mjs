// Content model v2 as the admin uses it: ratios, validation, ordering, file split/combine, v1 upgrade.
//   node --test tests/admin/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PHOTO_CHAPTERS, FILM_CHAPTERS, RATIO_PRESETS, ROLES, parseRatio, describeRatio, ratioMatches, newPhoto, photosFor, nextOrder,
  reorder, usedFiles, combine, split, FILES, upgrade, normalize, validate, daysAlive, clone, MODEL_VERSION,
} from '../../assets/js/shared/model.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const loadSite = () => combine({ settings: read(FILES.settings), messages: read(FILES.messages), photos: read(FILES.photos) });

/* ---------------------------------------------------------------- ratios */
test('parseRatio: strings, numbers and junk', () => {
  assert.equal(parseRatio('4:5'), 0.8);
  assert.equal(parseRatio('16:9'), 16 / 9);
  assert.equal(parseRatio('9:19.5'), 9 / 19.5);
  assert.equal(parseRatio(1.5), 1.5);
  assert.equal(parseRatio('nonsense'), 1);
  assert.equal(parseRatio('0:4'), 1);
  assert.equal(parseRatio(null), 1);
});

test('describeRatio: snaps to presets, else reduces', () => {
  assert.equal(describeRatio(1920, 1080), '16:9');
  assert.equal(describeRatio(1080, 1350), '4:5');
  assert.equal(describeRatio(3000, 4000), '3:4');
  assert.equal(describeRatio(4032, 3024), '4:3');
  assert.equal(describeRatio(1000, 1000), '1:1');
  assert.equal(describeRatio(1919, 1080), '16:9'); // within 2 %
  assert.equal(describeRatio(700, 300), '21:9');
  assert.equal(describeRatio(500, 300), '5:3');
  assert.match(describeRatio(1373, 1000), /^\d+(\.\d+)?:1$/);
  for (const p of RATIO_PRESETS) {
    const [w, h] = p.split(':').map(Number);
    assert.equal(describeRatio(w * 97, h * 97), p);
  }
});

test('ratioMatches: the replace rule tolerance (1.5 %)', () => {
  assert.ok(ratioMatches(1080 / 1350, '4:5'));
  assert.ok(ratioMatches(0.805, '4:5'));
  assert.ok(!ratioMatches(0.83, '4:5'));
  assert.ok(!ratioMatches(16 / 9, '4:5'));
  assert.ok(ratioMatches('3:4', '6:8'));
  assert.ok(!ratioMatches('3:4', '4:5'));
  assert.ok(ratioMatches(1.01, '1:1', 0.02));
});

/* ---------------------------------------------------------------- photos */
test('newPhoto fills every field with safe defaults', () => {
  const p = newPhoto({ chapter: 'tower' });
  assert.equal(p.chapter, 'tower');
  assert.equal(p.ratio, '3:4');
  assert.equal(p.cropMode, 'cover');
  assert.deepEqual(p.focal, { x: 0.5, y: 0.4 });
  assert.deepEqual(p.grade, { strength: null, warmth: 0, exposure: 0 });
  assert.equal(p.enabled, true);
  assert.match(p.id, /^tower-/);
  assert.equal(newPhoto({ chapter: 'nowhere' }).chapter, 'album');
  assert.equal(newPhoto({ chapter: 'album' }).ratio, '3:4');
  assert.deepEqual(newPhoto({ focal: { x: 2, y: -1 } }).focal, { x: 1, y: 0 });
  assert.equal(newPhoto({ cropMode: 'stretch' }).cropMode, 'cover');
});

test('photosFor / nextOrder / reorder', () => {
  const site = normalize({ photos: [
    newPhoto({ id: 'a', chapter: 'tower', order: 1 }),
    newPhoto({ id: 'b', chapter: 'tower', order: 2 }),
    newPhoto({ id: 'c', chapter: 'tower', order: 3, enabled: false }),
    newPhoto({ id: 'd', chapter: 'hair', order: 1 }),
  ] });
  assert.deepEqual(photosFor(site, 'tower').map((p) => p.id), ['a', 'b']);
  assert.deepEqual(photosFor(site, 'tower', { includeDisabled: true }).map((p) => p.id), ['a', 'b', 'c']);
  assert.equal(nextOrder(site, 'tower'), 4);
  assert.equal(nextOrder(site, 'letter'), 1);
  reorder(site, 'tower', ['c', 'a', 'b']);
  assert.deepEqual(photosFor(site, 'tower', { includeDisabled: true }).map((p) => [p.id, p.order]), [['c', 1], ['a', 2], ['b', 3]]);
  // partial id lists keep the others' relative order after
  reorder(site, 'tower', ['b']);
  assert.deepEqual(photosFor(site, 'tower', { includeDisabled: true }).map((p) => p.id), ['b', 'c', 'a']);
  // other chapters untouched
  assert.equal(site.photos.find((p) => p.id === 'd').order, 1);
  // reorder after a delete repairs gaps
  site.photos = site.photos.filter((p) => p.id !== 'c');
  reorder(site, 'tower', []);
  assert.deepEqual(photosFor(site, 'tower').map((p) => p.order), [1, 2]);
});

test('normalize repairs duplicate ids and orders, never drops photos', () => {
  const site = normalize({ photos: [newPhoto({ id: 'x', chapter: 'dance', order: 7 }), newPhoto({ id: 'x', chapter: 'dance', order: 7 })] });
  assert.equal(site.photos.length, 2);
  assert.notEqual(site.photos[0].id, site.photos[1].id);
  assert.deepEqual(site.photos.map((p) => p.order).sort(), [1, 2]);
  assert.equal(site.chapters.length, FILM_CHAPTERS.length);
});

test('usedFiles lists photos (src/thumb/original) and media', () => {
  const site = normalize({
    photos: [newPhoto({ id: 'a', src: 'photos/a.webp', thumb: 'photos/thumbs/a.jpg', original: 'photos/originals/a.jpg' }), newPhoto({ id: 'b' })],
    media: { music: 'media/music-1.mp3', video: null, voice: 'media/voice-1.m4a' },
  });
  assert.deepEqual([...usedFiles(site)].sort(), ['media/music-1.mp3', 'media/voice-1.m4a', 'photos/a.webp', 'photos/originals/a.jpg', 'photos/thumbs/a.jpg']);
});

/* ---------------------------------------------------------------- validate */
test('validate: the shipped content has no errors', () => {
  const v = validate(loadSite());
  assert.deepEqual(v.errors, []);
  assert.ok(v.ok);
});

test('validate: errors block, warnings inform', () => {
  const site = loadSite();
  const v0 = validate(site);
  // empty spots are warnings, phrased for humans
  assert.ok(v0.warnings.some((w) => /^Tower: \d+ photo spots? (are|is) still empty/.test(w.message)), JSON.stringify(v0.warnings));
  // errors: bad ratio, duplicate id, bad unlock date, no name
  const bad = clone(site);
  bad.photos[0].ratio = 'wide';
  bad.photos[1].id = bad.photos[2].id;
  bad.settings.lock.unlockAt = 'someday';
  bad.her.name = '';
  const v = validate(bad);
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 4, JSON.stringify(v.errors));
  // the unlock date only matters while the lock is on
  bad.settings.lock.enabled = false;
  assert.equal(validate(bad).errors.length, 3);
  // a missing role is a warning, not an error
  const noRole = clone(site);
  for (const p of noRole.photos) p.role = null;
  const v2 = validate(noRole);
  assert.ok(v2.ok);
  assert.equal(v2.warnings.filter((w) => w.role).length, ROLES.length);
});

test('validate: too many photos for a capped chapter is a warning', () => {
  const site = loadSite();
  site.photos.push(newPhoto({ chapter: 'prologue', src: 'photos/x.jpg', order: 99 }));
  const v = validate(site);
  assert.ok(v.ok);
  assert.ok(v.warnings.some((w) => w.chapter === 'prologue' && /only the first 1/.test(w.message)));
});

/* ---------------------------------------------------------------- files */
test('split → combine round trip is lossless (incl. unknown message keys)', () => {
  const site = loadSite();
  site.text.someNewChapter = { title: 'Hello {name}', lines: ['a', 'b'], nested: { deep: [['x', 'y']] } };
  site.photos.push(newPhoto({ chapter: 'album', src: 'photos/x-1.webp', thumb: 'photos/thumbs/x-1.jpg', caption: 'Diwali ✨ — ünïcode', date: 'Dec 2023' }));
  site.photoChapters = { tower: { note: 'kept' } };
  const parts = split(site);
  assert.deepEqual(Object.keys(parts).sort(), ['messages', 'photos', 'settings']);
  for (const k of Object.keys(parts)) assert.equal(parts[k].version, MODEL_VERSION);
  assert.ok(!('photos' in parts.settings) && !('text' in parts.settings));
  assert.ok(Array.isArray(parts.photos.photos));
  assert.equal(parts.messages.someNewChapter.nested.deep[0][1], 'y');
  // through JSON text, like the files on disk
  const again = combine(JSON.parse(JSON.stringify(parts)));
  assert.deepEqual(again, normalize(clone(site)));
  assert.deepEqual(split(again), parts);
});

test('combine tolerates missing files (fresh repo)', () => {
  const site = combine({});
  assert.equal(site.version, MODEL_VERSION);
  assert.equal(site.her.name, 'Deepu');
  assert.deepEqual(site.photos, []);
  assert.equal(site.settings.lock.unlockAt, '2027-01-03T00:00:00+05:30');
});

/* ---------------------------------------------------------------- upgrade */
const V1 = {
  her: { name: 'Deepu', nicknames: ['Deepu', 'Pinky', 'Kuchu Puchu'] },
  from: { name: 'Me' },
  settings: { lock: { enabled: true, unlockAt: '2027-01-03T00:00:00+05:30' }, grading: { strength: 0.7 }, whatsapp: '919800000000' },
  media: { music: 'media/music-old.mp3' },
  text: { invite: { greeting: 'Hey Pinky.' } },
  slots: [
    { id: 'hero', chapter: 'prologue', label: 'Hero', ratio: '4:5', src: 'photos/hero-1.jpg', original: 'photos/originals/hero-1.jpg', caption: 'First' },
    { id: 'tower-1', chapter: 'tower', label: 'T1', ratio: '3:4', src: null },
    { id: 'tower-2', chapter: 'tower', label: 'T2', ratio: '1:1', src: 'photos/tower-2.jpg' },
    { id: 'finale', chapter: 'finale', label: 'Reveal', ratio: '4:5', src: null },
    { id: 'us', chapter: 'us', label: 'Us', ratio: '4:5', src: null },
  ],
  extras: [{ id: 'x-1', ratio: '16:9', src: 'photos/extras/x-1.jpg', caption: 'Goa' }],
};

test('upgrade(v1) → v2 keeps every photo, maps roles and extras', () => {
  const s = upgrade(clone(V1));
  assert.equal(s.version, MODEL_VERSION);
  assert.equal(s.photos.length, 6);
  const by = Object.fromEntries(s.photos.map((p) => [p.id, p]));
  assert.equal(by.hero.role, 'hero');
  assert.equal(by.finale.role, 'reveal');
  assert.equal(by.us.role, 'together');
  assert.equal(by.us.chapter, 'finale');
  assert.equal(by['x-1'].chapter, 'album');
  assert.equal(by['x-1'].ratio, '16:9');
  assert.equal(by['x-1'].label, 'Goa');
  assert.deepEqual(photosFor(s, 'tower').map((p) => [p.id, p.order]), [['tower-1', 1], ['tower-2', 2]]);
  assert.equal(by.hero.original, 'photos/originals/hero-1.jpg');
  assert.equal(s.settings.grading.strength, 0.7);
  assert.equal(s.settings.whatsapp, '919800000000');
  assert.equal(s.settings.theme.grain, 0.6); // defaults filled
  assert.equal(s.text.invite.greeting, 'Hey Pinky.');
  assert.equal(s.media.music, 'media/music-old.mp3');
  assert.ok(usedFiles(s).has('photos/extras/x-1.jpg'));
  assert.deepEqual(validate(s).errors, []);
  // upgrading twice is a no-op
  assert.deepEqual(upgrade(clone(s)), s);
  // and v2 survives split/combine
  assert.deepEqual(combine(split(s)), s);
});

test('daysAlive: 7,305 days at the unlock moment', () => {
  assert.equal(daysAlive(loadSite()), 7305);
});

test('every photo chapter is a known film location', () => {
  const ids = PHOTO_CHAPTERS.map((c) => c.id);
  assert.deepEqual(ids, ['prologue', 'tower', 'hair', 'names', 'dance', 'lanterns', 'letter', 'finale', 'album']);
  for (const c of PHOTO_CHAPTERS) if (c.ratio) assert.ok(RATIO_PRESETS.includes(c.ratio), c.id);
});
