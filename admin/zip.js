/**
 * zip.js — a tiny ZIP writer (STORE method, no compression) with CRC-32.
 * Photos/audio/video are already compressed, so STORE keeps it fast and simple.
 *
 *   const bytes = makeZip([{ name: 'data/settings.json', data: Uint8Array|string, date?: Date }])
 *   const blob = await zipBlob(entries)   // entries may also carry `blob`
 *
 * Pure (no DOM) so it can be unit-tested in Node.
 */

let TABLE = null;
function crcTable() {
  if (TABLE) return TABLE;
  TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }
  return TABLE;
}

/** CRC-32 (IEEE) of a Uint8Array. */
export function crc32(bytes, crc = 0) {
  const t = crcTable();
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  return ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31);
}
function dosDate(d) {
  return (((Math.max(1980, d.getFullYear()) - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
}

const enc = new TextEncoder();
const toBytes = (data) => (typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data));

/**
 * Build a ZIP archive.
 * @param {{name:string, data:Uint8Array|ArrayBuffer|string, date?:Date}[]} entries
 * @returns {Uint8Array}
 */
export function makeZip(entries) {
  const files = entries.map((e) => {
    const name = enc.encode(String(e.name).replace(/^\/+/, ''));
    const data = toBytes(e.data);
    return { name, data, crc: crc32(data), date: e.date || new Date() };
  });
  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  if (localSize + centralSize + 22 > 0xffffffff || files.length > 0xffff) throw new Error('The export is too large for a simple ZIP file.');
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const offsets = [];
  for (const f of files) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true); // version needed
    view.setUint16(p + 6, 0x0800, true); // UTF-8 names
    view.setUint16(p + 8, 0, true); // STORE
    view.setUint16(p + 10, dosTime(f.date), true);
    view.setUint16(p + 12, dosDate(f.date), true);
    view.setUint32(p + 14, f.crc, true);
    view.setUint32(p + 18, f.data.length, true);
    view.setUint32(p + 22, f.data.length, true);
    view.setUint16(p + 26, f.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(f.name, p + 30);
    out.set(f.data, p + 30 + f.name.length);
    p += 30 + f.name.length + f.data.length;
  }
  const cdStart = p;
  files.forEach((f, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true); // made by
    view.setUint16(p + 6, 20, true); // needed
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, dosTime(f.date), true);
    view.setUint16(p + 14, dosDate(f.date), true);
    view.setUint32(p + 16, f.crc, true);
    view.setUint32(p + 20, f.data.length, true);
    view.setUint32(p + 24, f.data.length, true);
    view.setUint16(p + 28, f.name.length, true);
    view.setUint16(p + 30, 0, true); // extra
    view.setUint16(p + 32, 0, true); // comment
    view.setUint16(p + 34, 0, true); // disk
    view.setUint16(p + 36, 0, true); // internal attrs
    view.setUint32(p + 38, 0, true); // external attrs
    view.setUint32(p + 42, offsets[i], true);
    out.set(f.name, p + 46);
    p += 46 + f.name.length;
  });
  const cdSize = p - cdStart;
  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 4, 0, true);
  view.setUint16(p + 6, 0, true);
  view.setUint16(p + 8, files.length, true);
  view.setUint16(p + 10, files.length, true);
  view.setUint32(p + 12, cdSize, true);
  view.setUint32(p + 16, cdStart, true);
  view.setUint16(p + 20, 0, true);
  return out;
}

/** Same as makeZip, but entries may carry a Blob (`blob`) — returns a Blob. */
export async function zipBlob(entries) {
  const resolved = [];
  for (const e of entries) {
    const data = e.blob ? new Uint8Array(await e.blob.arrayBuffer()) : e.data;
    resolved.push({ name: e.name, data, date: e.date });
  }
  return new Blob([makeZip(resolved)], { type: 'application/zip' });
}

/** Read back a STORE zip (used by tests): → [{name, data:Uint8Array, crc}] */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && view.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const count = view.getUint16(e + 10, true);
  let p = view.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const off = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(off + 26, true);
    const lExtra = view.getUint16(off + 28, true);
    const start = off + 30 + lNameLen + lExtra;
    out.push({ name, data: bytes.subarray(start, start + size), crc });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
