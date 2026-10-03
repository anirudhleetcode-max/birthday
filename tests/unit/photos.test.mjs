// The post-upload photo check: sizes and private metadata read straight from the file bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSize, privacyIssues, mediaLocation } from '../../scripts/check-photos.mjs';
import { stripJpeg } from '../../admin/metadata.js';

const seg = (m, payload) => { const b = Buffer.from(payload); return Buffer.concat([Buffer.from([0xff, m, (b.length + 2) >> 8, (b.length + 2) & 255]), b]); };
/** big-endian TIFF with IFD0 entries [tag, type, count, value] */
const tiff = (entries) => {
  const head = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, entries.length];
  const body = entries.flatMap(([tag, type, count, value]) => [tag >> 8, tag & 255, 0, type, 0, 0, 0, count, (value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255]);
  return Buffer.from([...head, ...body, 0, 0, 0, 0]);
};
const jpeg = (...segs) => Buffer.concat([
  Buffer.from([0xff, 0xd8]), ...segs,
  seg(0xc0, [8, 0, 90, 0, 120, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), // SOF0 120×90
  seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]), Buffer.from([0x12, 0x34, 0xff, 0xd9]),
]);

test('reads the size of JPEG / PNG / WebP', () => {
  assert.deepEqual(imageSize(jpeg()), { type: 'jpeg', w: 120, h: 90 });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 5, 0x46, 0, 0, 7, 8, 8, 6, 0, 0, 0])]);
  assert.deepEqual(imageSize(png), { type: 'png', w: 1350, h: 1800 });
  const vp8x = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8X'), Buffer.from([10, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([0x45, 0x05, 0x00, 0x07, 0x07, 0x00])]);
  assert.deepEqual(imageSize(vp8x), { type: 'webp', w: 1350, h: 1800 });
});

test('finds GPS and serial numbers, and passes what the admin leaves behind', () => {
  const exif = (entries) => seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), tiff(entries)]));
  const leaky = jpeg(exif([[0x0112, 3, 1, 1 << 16], [0x8825, 4, 1, 26]]));
  assert.deepEqual(privacyIssues(leaky), ['GPS position (EXIF)']);
  const xmp = jpeg(seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'));
  assert.deepEqual(privacyIssues(xmp), ['XMP block']);
  const trailing = Buffer.concat([jpeg(), Buffer.alloc(200, 7)]);
  assert.deepEqual(privacyIssues(trailing), ['hidden data after the end of the image']);
  // the admin's own cleaner output is clean
  const cleaned = stripJpeg(new Uint8Array(Buffer.concat([leaky, Buffer.alloc(200, 7)])));
  assert.ok(cleaned, 'the admin can clean it');
  assert.deepEqual(privacyIssues(Buffer.from(cleaned.bytes || cleaned)), []);
});

test('finds a recording location left in a video', () => {
  assert.ok(mediaLocation(Buffer.from('....moov....©xyz+12.9716+077.5946/....')));
  assert.ok(!mediaLocation(Buffer.from('....moov....©xyz\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0....')));
});
