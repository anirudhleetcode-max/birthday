// Private metadata is stripped from uploads before they are published (admin/metadata.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripJpeg, stripPng, cleanImage, exifOrientation, orientationSegment, webpHasMetadata, scrubLocationBytes, scrubVideoLocation } from '../../admin/metadata.js';

const B = (...parts) => Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))));
const seg = (marker, payload) => { const p = B(payload); return B([0xff, marker, (p.length + 2) >> 8, (p.length + 2) & 255], p); };
const has = (bytes, s) => Buffer.from(bytes).includes(Buffer.from(s, 'latin1'));

/** EXIF (little-endian) with Orientation + Make (a long ASCII value stored at an offset). */
function exifPayload(orientation, make) {
  const str = Buffer.from(`${make}\0`, 'latin1');
  const ifd = Buffer.alloc(2 + 2 * 12 + 4);
  ifd.writeUInt16LE(2, 0);
  ifd.writeUInt16LE(0x010f, 2); ifd.writeUInt16LE(2, 4); ifd.writeUInt32LE(str.length, 6); ifd.writeUInt32LE(8 + ifd.length, 10); // Make → offset
  ifd.writeUInt16LE(0x0112, 14); ifd.writeUInt16LE(3, 16); ifd.writeUInt32LE(1, 18); ifd.writeUInt16LE(orientation, 22);
  return B('Exif\0\0', 'II', [0x2a, 0, 8, 0, 0, 0], ifd, str);
}

/** A structurally valid JPEG (tables / frame / scan are dummies — only the container matters here). */
function fakeJpeg({ orientation = 6, trailing = true } = {}) {
  return B(
    [0xff, 0xd8],
    seg(0xe1, exifPayload(orientation, 'SecretPhone GPS 12.9716N 77.5946E')),
    seg(0xe0, B('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>xmp-secret</x:xmpmeta>'),
    seg(0xe2, B('ICC_PROFILE\0', [1, 1], 'icc-data')),
    seg(0xe2, B('MPF\0', 'mpf-secret')),
    seg(0xed, 'Photoshop 3.0\0iptc-secret'),
    seg(0xfe, 'comment-secret'),
    seg(0xee, B('Adobe', [0, 100, 0, 0, 0, 0, 1])),
    seg(0xdb, B([0], Buffer.alloc(64, 1))),
    seg(0xc0, [8, 0, 16, 0, 16, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    seg(0xc4, B([0], Buffer.alloc(16, 0), [0])),
    seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a], // entropy data with a stuffed 0xFF00 and a restart marker
    [0xff, 0xd9],
    trailing ? B('MPF-hidden-image-secret', [0xff, 0xd8, 0xff, 0xd9]) : [],
  );
}

test('JPEG: GPS/camera EXIF, XMP, IPTC, comments, MPF and trailing images are removed losslessly', () => {
  const src = fakeJpeg();
  const out = stripJpeg(new Uint8Array(src));
  assert.ok(out);
  for (const s of ['SecretPhone', 'GPS', 'xmp-secret', 'iptc-secret', 'comment-secret', 'mpf-secret', 'MPF-hidden']) assert.ok(!has(out, s), s);
  // kept: JFIF first, colour profile, Adobe, tables, frame, scan + its data, EOI last
  assert.deepEqual([...out.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  for (const s of ['JFIF', 'ICC_PROFILE', 'icc-data', 'Adobe']) assert.ok(has(out, s), s);
  assert.ok(Buffer.from(out).includes(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a, 0xff, 0xd9])));
  assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9]);
  // orientation survives in a minimal EXIF right after JFIF
  const app1 = Buffer.from(out).indexOf(Buffer.from([0xff, 0xe1]));
  assert.ok(app1 > 0 && app1 === 2 + 2 + 16);
  assert.equal(exifOrientation(out.subarray(app1 + 4, app1 + 4 + 32)), 6);
});

test('JPEG: upright photos get no EXIF at all; garbage is refused', () => {
  const out = stripJpeg(new Uint8Array(fakeJpeg({ orientation: 1, trailing: false })));
  assert.ok(!has(out, 'Exif'));
  assert.equal(stripJpeg(new Uint8Array([1, 2, 3, 4, 5])), null);
  assert.equal(stripJpeg(new Uint8Array(fakeJpeg().subarray(0, 60))), null, 'truncated');
});

test('exifOrientation reads both byte orders; orientationSegment round-trips', () => {
  assert.equal(exifOrientation(new Uint8Array(exifPayload(8, 'x'))), 8);
  const seg6 = orientationSegment(6);
  assert.equal(exifOrientation(seg6.subarray(4)), 6);
  assert.equal(exifOrientation(new Uint8Array(B('nope'))), 1);
});

test('PNG: text / time / private chunks dropped; eXIf → re-encode instead', () => {
  const chunk = (type, data) => { const d = B(data); const len = Buffer.alloc(4); len.writeUInt32BE(d.length); return B(len, type, d, [0, 0, 0, 0]); };
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const png = B(sig, chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', 'Comment\0png-secret'), chunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0xmp'), chunk('tIME', Buffer.alloc(7)), chunk('sRGB', [0]), chunk('IDAT', 'pixels'), chunk('IEND', ''));
  const out = stripPng(new Uint8Array(png));
  assert.ok(out && !has(out, 'png-secret') && !has(out, 'tIME') && has(out, 'sRGB') && has(out, 'pixels') && has(out, 'IEND'));
  const withExif = B(sig, chunk('IHDR', Buffer.alloc(13)), chunk('eXIf', 'MM'), chunk('IDAT', 'x'), chunk('IEND', ''));
  assert.equal(stripPng(new Uint8Array(withExif)), null);
  assert.equal(cleanImage(new Uint8Array(withExif), 'png'), null);
});

test('WebP with EXIF/XMP is re-encoded; a plain one is kept as is', () => {
  const riff = (chunks) => { const body = B('WEBP', ...chunks); const len = Buffer.alloc(4); len.writeUInt32LE(body.length); return new Uint8Array(B('RIFF', len, body)); };
  const ch = (type, data) => { const d = B(data); const len = Buffer.alloc(4); len.writeUInt32LE(d.length); return B(type, len, d, d.length & 1 ? [0] : []); };
  const plain = riff([ch('VP8 ', 'abc')]);
  assert.equal(webpHasMetadata(plain), false);
  assert.deepEqual(cleanImage(plain, 'webp'), { bytes: plain, changed: false });
  assert.equal(cleanImage(riff([ch('VP8X', Buffer.alloc(10)), ch('VP8 ', 'abc'), ch('EXIF', 'gps')]), 'webp'), null);
});

test('MP4/MOV: the recording location is blanked in place (same size, nothing else touched)', async () => {
  const box = (type, ...parts) => { const body = B(...parts); const len = Buffer.alloc(4); len.writeUInt32BE(body.length + 8); return B(len, type, body); };
  const xyz = B([0, 18, 0x15, 0xc7], '+12.9716+077.5946/');
  const keys = B('com.apple.quicktime.location.ISO6709', '+37.3349-122.0090+010.000/');
  const mp4 = B(box('ftyp', 'isom', [0, 0, 2, 0], 'isomiso2mp41'), box('moov', box('mvhd', Buffer.alloc(20)), box('udta', box('\xa9xyz', xyz)), box('meta', keys)), box('mdat', 'frame-data +11.1111+011.1111/'));
  const blob = new Blob([mp4], { type: 'video/mp4' });
  const { blob: out, scrubbed } = await scrubVideoLocation(blob);
  const bytes = Buffer.from(await out.arrayBuffer());
  assert.equal(scrubbed, 2);
  assert.equal(bytes.length, mp4.length);
  assert.ok(!bytes.includes(Buffer.from('12.9716')) && !bytes.includes(Buffer.from('37.3349')));
  assert.ok(bytes.includes(Buffer.from('+00.0000+000.0000/')) && bytes.includes(Buffer.from('+00.0000-000.0000+000.000/')));
  assert.ok(bytes.includes(Buffer.from('frame-data +11.1111+011.1111/')), 'media data (mdat) is never touched');
  // not an MP4 (e.g. MP3, or zeros) → unchanged
  const zeros = new Blob([new Uint8Array(4096)]);
  assert.equal((await scrubVideoLocation(zeros)).blob, zeros);
  const raw = new Uint8Array(B('xx +48.8577+002.2950+30CRSWGS_84/ yy'));
  assert.equal(scrubLocationBytes(raw), 1);
  assert.ok(has(raw, '+00.0000+000.0000+00CRSWGS_84/'));
});
