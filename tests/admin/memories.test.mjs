// “How it began”: the owner's memories (messages.json → story.memories) and the photos linked to them.
//   node --test tests/admin/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { combine, newPhoto, normalize, validate, memoriesOf, MEMORY_KINDS, clone } from '../../assets/js/shared/model.js';
import {
  STORY, newMemory, memoryLabel, memoryName, memoryPhotos, unlinkedStoryPhotos, memoryOptions, linkMemory, removeMemory, restoreMemory,
  describeChanges, mergeSites,
} from '../../admin/util.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../../tests/fixtures/${f}.json`, import.meta.url), 'utf8'));
const fixture = () => combine({ settings: read('settings'), messages: read('messages'), photos: read('photos') });

/** The fixture plus a few “How it began” photos: two on the first memory, one on the second, one unlinked, one on a deleted memory. */
function withStoryPhotos() {
  const site = fixture();
  const [m1, m2] = memoriesOf(site);
  site.photos.push(
    newPhoto({ id: 's-b', chapter: STORY, order: 2, ratio: '16:9', memory: m1.id, src: 'photos/s-b.webp' }),
    newPhoto({ id: 's-a', chapter: STORY, order: 1, ratio: '3:4', memory: m1.id, src: 'photos/s-a.webp' }),
    newPhoto({ id: 's-c', chapter: STORY, order: 3, ratio: '1:1', memory: m2.id, src: 'photos/s-c.webp' }),
    newPhoto({ id: 's-d', chapter: STORY, order: 4, ratio: '9:16', src: 'photos/s-d.webp' }),
    newPhoto({ id: 's-e', chapter: STORY, order: 5, ratio: '2:3', memory: 'm-gone', src: 'photos/s-e.webp' }),
  );
  return normalize(site);
}

test('the fixture holds the owner’s memories, each with an id and a known style', () => {
  const list = memoriesOf(fixture());
  assert.ok(list.length >= 4);
  assert.equal(new Set(list.map((m) => m.id)).size, list.length);
  for (const m of list) {
    assert.ok(MEMORY_KINDS.some((k) => k.id === m.kind), m.kind);
    assert.equal(typeof m.text, 'string');
  }
});

test('newMemory: a fresh id, style “moment”, and nothing pre-written', () => {
  const existing = memoriesOf(fixture());
  const m = newMemory(existing);
  assert.deepEqual(Object.keys(m).sort(), ['id', 'kind', 'text', 'when']);
  assert.equal(m.kind, 'moment');
  assert.equal(m.when, '');
  assert.equal(m.text, '');
  assert.ok(m.id && !existing.some((x) => x.id === m.id));
  assert.notEqual(newMemory([...existing, m]).id, m.id);
});

test('memoryLabel: number + when, else the first words, else just the number — never the id', () => {
  assert.equal(memoryLabel({ id: 'x1', when: ' October 2026 ', text: 'Anything' }, 1), 'Memory 2 · October 2026');
  assert.equal(memoryLabel({ id: 'x1', when: '', text: 'One two three four five six seven eight.' }, 0), 'Memory 1 · “One two three four five six…”');
  assert.equal(memoryLabel({ id: 'x1', when: '', text: 'Short words.' }, 0), 'Memory 1 · “Short words.”');
  assert.equal(memoryLabel({ id: 'x1', when: '', text: 'One, two, three, four, five, six, seven' }, 0), 'Memory 1 · “One, two, three, four, five, six…”');
  assert.equal(memoryLabel({ id: 'x1', when: '', text: '   ' }, 2), 'Memory 3');
  assert.equal(memoryLabel({}, 0), 'Memory 1');
  assert.equal(memoryLabel(null, 4), 'Memory 5');
  for (const m of memoriesOf(fixture())) assert.ok(!memoryLabel(m, 0).includes(m.id) || m.text.includes(m.id));
});

test('memoryName: the label of an existing memory, null otherwise', () => {
  const site = fixture();
  const [m1, m2] = memoriesOf(site);
  assert.equal(memoryName(site, m2.id), memoryLabel(m2, 1));
  assert.equal(memoryName(site, m1.id), memoryLabel(m1, 0));
  assert.equal(memoryName(site, 'nope'), null);
  assert.equal(memoryName(site, ''), null);
  assert.equal(memoryName(site, undefined), null);
});

test('memoryPhotos / unlinkedStoryPhotos: “How it began” photos in film order', () => {
  const site = withStoryPhotos();
  const [m1, m2, m3] = memoriesOf(site);
  assert.deepEqual(memoryPhotos(site, m1.id).map((p) => p.id), ['s-a', 's-b']);
  assert.deepEqual(memoryPhotos(site, m2.id).map((p) => p.id), ['s-c']);
  assert.deepEqual(memoryPhotos(site, m3.id), []);
  assert.deepEqual(memoryPhotos(site, ''), []);
  // a photo outside “How it began” never counts, even with a memory id on it
  site.photos.find((p) => p.chapter === 'tower').memory = m3.id;
  assert.deepEqual(memoryPhotos(site, m3.id), []);
  // not linked, or linked to a memory that no longer exists → shown with the last memory
  assert.deepEqual(unlinkedStoryPhotos(site).map((p) => p.id), ['s-d', 's-e']);
});

test('memoryOptions: “None” first, every memory by label, and a deleted memory is never hidden', () => {
  const site = withStoryPhotos();
  const list = memoriesOf(site);
  const opts = memoryOptions(site, list[0].id);
  assert.deepEqual(opts[0], { value: '', label: 'None — shown with the last memory' });
  assert.deepEqual(opts.slice(1).map((o) => o.value), list.map((m) => m.id));
  assert.deepEqual(opts.slice(1).map((o) => o.label), list.map((m, i) => memoryLabel(m, i)));
  const dangling = memoryOptions(site, 'm-gone');
  assert.equal(dangling.length, list.length + 2);
  assert.equal(dangling[dangling.length - 1].value, 'm-gone');
  assert.match(dangling[dangling.length - 1].label, /no longer exists/);
});

test('linkMemory: only “How it began” photos keep a memory', () => {
  assert.equal(linkMemory({ chapter: STORY }, 'met').memory, 'met');
  const moved = linkMemory({ chapter: 'tower', memory: 'met' }, 'met');
  assert.ok(!('memory' in moved));
  const none = linkMemory({ chapter: STORY, memory: 'met' }, '');
  assert.ok(!('memory' in none));
  assert.ok(!('memory' in linkMemory({ chapter: STORY, memory: 'met' }, null)));
});

test('removeMemory keeps the photos (unlinked); restoreMemory puts everything back', () => {
  const site = withStoryPhotos();
  const before = clone(site);
  const [m1] = memoriesOf(site);
  const undo = removeMemory(site, m1.id);
  assert.equal(undo.index, 0);
  assert.deepEqual(undo.memory, memoriesOf(before)[0]);
  assert.deepEqual(undo.unlinked.sort(), ['s-a', 's-b']);
  assert.ok(!memoriesOf(site).some((m) => m.id === m1.id));
  assert.equal(site.photos.length, before.photos.length, 'no photo is deleted');
  assert.ok(site.photos.filter((p) => ['s-a', 's-b'].includes(p.id)).every((p) => !('memory' in p)));
  assert.deepEqual(unlinkedStoryPhotos(site).map((p) => p.id), ['s-a', 's-b', 's-d', 's-e']);
  assert.ok(!validate(site).warnings.some((w) => /no longer exists/.test(w.message) && ['s-a', 's-b'].includes(w.id)));
  restoreMemory(site, undo);
  assert.deepEqual(site, before);
  // unknown ids and missing lists are harmless
  assert.equal(removeMemory(site, 'nope'), null);
  assert.equal(removeMemory(normalize({}), 'met'), null);
  assert.deepEqual(restoreMemory(normalize({}), { memory: { id: 'a', kind: 'moment', when: '', text: '' }, index: 3, unlinked: [] }).text.story.memories.map((m) => m.id), ['a']);
});

test('describeChanges: linking a photo to a memory is a change to publish', () => {
  const base = withStoryPhotos();
  const site = clone(base);
  const [, m2] = memoriesOf(site);
  linkMemory(site.photos.find((p) => p.id === 's-d'), m2.id);
  const ch = describeChanges(base, site);
  assert.equal(ch.count, 1);
  assert.equal(ch.items[0].kind, 'photo-edit');
  assert.match(ch.items[0].text, /its memory/);
});

test('describeChanges: adding, editing, reordering and deleting memories are word changes', () => {
  const base = fixture();
  const site = clone(base);
  const list = site.text.story.memories;
  list.push({ ...newMemory(list), when: 'October 2026' });
  [list[0], list[1]] = [list[1], list[0]];
  const ch = describeChanges(base, site);
  assert.ok(ch.count > 0 && ch.items.some((i) => i.kind === 'words'));
  assert.match(ch.message, /edit words/);
});

test('merge: my memory edits and their new memory both survive (merged by id)', () => {
  const base = fixture();
  const mine = clone(base);
  const theirs = clone(base);
  mine.text.story.memories[1].when = 'Mine';
  const added = { ...newMemory(theirs.text.story.memories), when: 'November 2026' };
  theirs.text.story.memories.push(added);
  const m = mergeSites(base, mine, theirs);
  assert.equal(m.text.story.memories[1].when, 'Mine');
  assert.ok(m.text.story.memories.some((x) => x.id === added.id));
  assert.equal(m.text.story.memories[0].text, base.text.story.memories[0].text);
});
