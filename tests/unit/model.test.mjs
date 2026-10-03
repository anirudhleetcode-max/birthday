// Film-level checks of the content model and the committed content files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  combine, split, migrateV1, upgrade, validate, daysAlive, describeRatio, ratioMatches, parseRatio,
  photosFor, reorder, newPhoto, usedFiles, FILES, PHOTO_CHAPTERS, FILM_CHAPTERS,
} from '../../assets/js/shared/model.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const loadSite = () => combine({ settings: read(FILES.settings), messages: read(FILES.messages), photos: read(FILES.photos) });

test('content files combine and validate without errors', () => {
  const site = loadSite();
  const v = validate(site);
  assert.deepEqual(v.errors, [], JSON.stringify(v.errors));
  assert.ok(site.photos.length >= 36, 'at least the initial 36 photo records');
});

test('7,305 days / 240 months / 20 years at the unlock moment', () => {
  const site = loadSite();
  assert.equal(site.settings.lock.unlockAt, '2027-01-03T00:00:00+05:30');
  assert.equal(daysAlive(site), 7305);
  const start = new Date('2007-01-03T00:00:00+05:30');
  const end = new Date('2027-01-03T00:00:00+05:30');
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  assert.equal(months, 240);
});

test('every required special role has a photo (“together” is optional)', () => {
  const site = loadSite();
  for (const role of ['hero', 'reveal']) assert.ok(site.photos.some((p) => p.role === role), role);
});

test('split/combine round-trips without loss', () => {
  const site = loadSite();
  const again = combine(split(site));
  assert.deepEqual(again, site);
});

test('ratio helpers', () => {
  assert.equal(describeRatio(1920, 1080), '16:9');
  assert.equal(describeRatio(1080, 1350), '4:5');
  assert.equal(describeRatio(3024, 4032), '3:4');
  assert.ok(ratioMatches('4:5', 0.8005));
  assert.ok(!ratioMatches('4:5', '16:9'));
  assert.equal(parseRatio('3:4'), 0.75);
  assert.equal(parseRatio('garbage'), 1);
});

test('no photo limit: 150 extra photos are accepted and ordered', () => {
  const site = loadSite();
  for (let i = 0; i < 150; i++) site.photos.push(newPhoto({ chapter: 'album', ratio: '4:3', src: `photos/extras/x${i}.jpg` }));
  const again = combine(split(site));
  const album = photosFor(again, 'album');
  assert.equal(album.length, 150);
  assert.deepEqual(album.map((p) => p.order), Array.from({ length: 150 }, (_, i) => i + 1));
  assert.ok(usedFiles(again).has('photos/extras/x149.jpg'));
});

test('reorder and disable', () => {
  const site = loadSite();
  const ids = photosFor(site, 'tower').map((p) => p.id);
  reorder(site, 'tower', [...ids].reverse());
  assert.deepEqual(photosFor(site, 'tower').map((p) => p.id), [...ids].reverse());
  site.photos.find((p) => p.id === ids[0]).enabled = false;
  assert.equal(photosFor(site, 'tower').length, ids.length - 1);
  assert.equal(photosFor(site, 'tower', { includeDisabled: true }).length, ids.length);
});

test('validation catches duplicate ids and bad ratios', () => {
  const site = loadSite();
  site.photos.push({ ...site.photos[0] });
  site.photos.push(newPhoto({ chapter: 'album', ratio: 'wide' }));
  const v = validate(site);
  assert.ok(v.errors.some((e) => /share the id/.test(e.message)));
  assert.ok(v.errors.some((e) => /invalid shape/.test(e.message)));
});

test('v1 (single site.json) upgrades to v2', () => {
  const v1 = {
    version: 1, her: { name: 'Deepu', birthDate: '2007-01-03' }, from: { name: 'Me' }, settings: { lock: { enabled: true, unlockAt: '2027-01-03T00:00:00+05:30' } },
    media: {}, text: { invite: { greeting: 'Hey' } },
    slots: [
      { id: 'hero', chapter: 'prologue', ratio: '4:5', src: 'photos/hero.jpg' },
      { id: 'tower-1', chapter: 'tower', ratio: '3:4', src: null, caption: 'c' },
      { id: 'finale', chapter: 'finale', ratio: '4:5' },
      { id: 'us', chapter: 'finale', ratio: '4:5' },
    ],
    extras: [{ id: 'x-1', ratio: '16:9', src: 'photos/extras/x-1.jpg', caption: 'beach' }],
  };
  const site = upgrade(v1);
  assert.equal(site.version, 2);
  assert.equal(site.photos.length, 5);
  assert.equal(site.photos.find((p) => p.id === 'hero').role, 'hero');
  assert.equal(site.photos.find((p) => p.id === 'finale').role, 'reveal');
  assert.equal(site.photos.find((p) => p.id === 'us').role, 'together');
  assert.equal(site.photos.find((p) => p.id === 'x-1').chapter, 'album');
  assert.equal(site.text.invite.greeting, 'Hey');
  assert.deepEqual(migrateV1(v1).photos.map((p) => p.id), site.photos.map((p) => p.id));
});

test('chapter catalogues are consistent', () => {
  const ids = new Set(PHOTO_CHAPTERS.map((c) => c.id));
  for (const id of ['prologue', 'tower', 'hair', 'names', 'dance', 'lanterns', 'letter', 'finale', 'album']) assert.ok(ids.has(id), id);
  const film = FILM_CHAPTERS.map((c) => c.id);
  assert.ok(film.indexOf('letter') < film.indexOf('cake'), 'letter comes before the cake');
  assert.ok(film.indexOf('cake') < film.indexOf('constellation'));
  const main = fs.readFileSync(new URL('../../assets/js/main.js', import.meta.url), 'utf8');
  for (const id of film.filter((x) => x !== 'gate')) assert.ok(main.includes(`id: '${id}'`), `main.js has chapter ${id}`);
});

test('messages cover every chapter the film shows', () => {
  const m = read(FILES.messages);
  for (const key of ['invite', 'prologue', 'tower', 'hair', 'names', 'dance', 'lanterns', 'letter', 'cake', 'credits']) assert.ok(m[key], `messages.${key}`);
  assert.equal(m.cake.lines.length >= 3, true);
});

test('unsafe file paths are rejected', async () => {
  const { safePath } = await import('../../assets/js/shared/model.js');
  assert.ok(safePath('photos/tower-1-20261102-101500.webp'));
  assert.ok(safePath('media/music-1.mp3'));
  assert.ok(!safePath('photos/a".jpg'));
  assert.ok(!safePath('../secret.jpg'));
  assert.ok(!safePath('javascript:alert(1)'));
  const site = loadSite();
  site.photos[0].src = 'photos/x" onerror="alert(1).jpg';
  assert.ok(validate(site).errors.some((e) => /unsafe file path/.test(e.message)));
});

test('memories: unwritten lines are left out of her film, shown as [LABEL] in preview', async () => {
  const { fillText, personalValues, personalGaps, PERSONAL_FIELDS } = await import('../../assets/js/shared/model.js');
  const personal = { memory1: 'The rain, the bus, the umbrella.', memory2: '' };
  assert.equal(fillText('{memory1}', {}, personal), 'The rain, the bus, the umbrella.');
  assert.equal(fillText('Remember? {memory2}', {}, personal), '');
  assert.equal(fillText('Remember? {memory2}', {}, personal, { preview: true }), 'Remember? [MEMORY 2]');
  assert.equal(fillText('Hey {name}.', { name: 'Deepu' }, personal), 'Hey Deepu.');
  // a hand-typed placeholder never reaches her
  assert.equal(fillText('Her song: [FAVOURITE SONG]', {}, personal), '');
  assert.equal(fillText('U/A: Unreasonably Adorable', {}, personal), 'U/A: Unreasonably Adorable');
  // unknown tokens (filled later by a scene) survive
  assert.equal(fillText('Secrets: {found} of {total}', {}, personal), 'Secrets: {found} of {total}');

  const site = loadSite();
  assert.deepEqual(Object.keys(personalValues(site)), PERSONAL_FIELDS.map((f) => f.key));
  const gaps = personalGaps(site);
  assert.ok(gaps.empty.some((f) => f.key === 'memory1'), 'the letter uses {memory1}');
  assert.ok(validate(site).warnings.some((w) => w.group === 'personal' && /\[MEMORY 1\]/.test(w.message)));
  site.text.personal = Object.fromEntries(PERSONAL_FIELDS.map((f) => [f.key, `Written: ${f.key}`]));
  assert.equal(personalGaps(site).empty.length, 0);
  assert.ok(!validate(site).warnings.some((w) => w.group === 'personal'));
  site.text.credits.end = 'The end of [CHAPTER NAME].';
  assert.ok(validate(site).warnings.some((w) => /\[CHAPTER NAME\]/.test(w.message)));
});

test('the committed script invents nothing and never assumes what her name means', () => {
  const m = read(FILES.messages);
  const all = JSON.stringify(m).toLowerCase();
  for (const bad of ['lamp', 'late-night', '2 a.m', 'after midnight', 'pancake']) assert.ok(!all.includes(bad), `"${bad}" is gone`);
  for (const k of ['memory1', 'memory2', 'tease', 'neverForget', 'admire', 'wantHerToKnow']) assert.ok(m.letter.body.some((p) => p.includes(`{${k}}`)), `letter uses {${k}}`);
  assert.equal(m.letter.ps, 'P.S. {insideJoke}');
});

test('the unlock moment is midnight in India, whatever the viewer’s time zone', () => {
  const s = read(FILES.settings).settings;
  assert.equal(s.lock.enabled, true);
  assert.equal(Date.parse(s.lock.unlockAt), Date.UTC(2027, 0, 2, 18, 30), '3 Jan 2027 00:00 IST = 2 Jan 2027 18:30 UTC');
  assert.equal(daysAlive(loadSite()), 7305);
});
