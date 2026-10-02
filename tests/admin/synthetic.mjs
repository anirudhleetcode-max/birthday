// Synthetic test photographs for the colour grade (no image files needed).
// Each scene: a wall, a face-like skin patch with soft shading, dark hair, a white
// shirt, a small colour chart — lit by a coloured illuminant at some exposure.
import zlib from 'node:zlib';

const eotf = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const oetf = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const lin = (r, g, b) => [eotf(r / 255), eotf(g / 255), eotf(b / 255)];

export const SKIN = lin(194, 138, 108); // medium warm-brown skin (sRGB)

export const SCENES = {
  'cool-indoor': { light: [0.86, 0.97, 1.18], exposure: 0.85, wall: lin(200, 200, 196) },
  tungsten: { light: [1.3, 0.96, 0.58], exposure: 0.95, wall: lin(214, 206, 190) },
  'purple-party': { light: [1.12, 0.84, 1.16], exposure: 0.7, wall: lin(120, 60, 170), neon: true },
  daylight: { light: [1, 1, 1], exposure: 1.15, wall: lin(170, 196, 225), sky: true },
  'low-light': { light: [1.12, 0.96, 0.78], exposure: 0.22, wall: lin(150, 132, 118), noise: 0.035 },
};

export const FACE = (w, h) => ({ x: Math.round(w * 0.36), y: Math.round(h * 0.3), w: Math.round(w * 0.28), h: Math.round(h * 0.4) });

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** RGBA Uint8ClampedArray of a scene. */
export function makeScene(name, w = 360, h = 270) {
  const sc = SCENES[name];
  const data = new Uint8ClampedArray(w * h * 4);
  const rand = rng(name.length * 7919 + w);
  const face = FACE(w, h);
  const fcx = face.x + face.w / 2;
  const fcy = face.y + face.h / 2;
  const chart = [lin(190, 40, 50), lin(60, 150, 70), lin(50, 80, 170), lin(225, 200, 60), lin(240, 240, 236), lin(30, 30, 32)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let refl;
      let shade = 1;
      const dx = (x - fcx) / (face.w / 2);
      const dy = (y - fcy) / (face.h / 2);
      const inFace = dx * dx + dy * dy <= 1;
      if (sc.sky && y < h * 0.28) refl = lin(150, 190, 235);
      else refl = sc.wall.slice();
      // vertical wall gradient
      shade = 0.75 + 0.35 * (1 - y / h);
      if (inFace) {
        refl = SKIN;
        shade = 0.72 + 0.4 * Math.max(0, 1 - Math.hypot(dx + 0.35, dy + 0.3) * 0.8); // soft key light from top-left
      } else if (Math.abs(dx) < 1.35 && dy < -0.65 && dy > -1.3) {
        refl = lin(58, 40, 32); // hair
        shade = 0.9;
      } else if (y > face.y + face.h * 1.02 && x > face.x - face.w * 0.4 && x < face.x + face.w * 1.4) {
        refl = lin(236, 234, 228); // white shirt
        shade = 0.85;
      } else if (y > h * 0.84 && x < w * 0.3) {
        refl = chart[Math.min(5, Math.floor((x / (w * 0.3)) * 6))];
        shade = 1;
      }
      let r = refl[0] * sc.light[0] * sc.exposure * shade;
      let g = refl[1] * sc.light[1] * sc.exposure * shade;
      let b = refl[2] * sc.light[2] * sc.exposure * shade;
      if (sc.neon) {
        const d = Math.hypot(x - w * 0.88, y - h * 0.18) / (w * 0.14);
        if (d < 1) { const k = (1 - d) * 1.4; r += 1.0 * k; g += 0.12 * k; b += 0.7 * k; }
      }
      if (sc.noise) {
        const n = (rand() - 0.5) * sc.noise;
        r += n * 0.6; g += n * 0.5; b += n * 0.7;
      }
      const i = (y * w + x) * 4;
      data[i] = oetf(Math.max(0, Math.min(1, r))) * 255 + 0.5;
      data[i + 1] = oetf(Math.max(0, Math.min(1, g))) * 255 + 0.5;
      data[i + 2] = oetf(Math.max(0, Math.min(1, b))) * 255 + 0.5;
      data[i + 3] = 255;
    }
  }
  return data;
}

export function meanLuma(data) {
  let s = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return s / n / 255;
}

/** Mean RGB of a rect. */
export function meanRGB(data, w, rect) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
    const i = (y * w + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return [r / n, g / n, b / n];
}

/** HSV saturation of a mean colour. */
export const satOf = ([r, g, b]) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };

/* ---- minimal PNG encoder (RGBA, no filter) ---- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
export function encodePNG(data, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Side-by-side (before | after) RGBA. */
export function sideBySide(a, b, w, h, gap = 6) {
  const W = w * 2 + gap;
  const out = new Uint8ClampedArray(W * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      let src = null, sx = 0;
      if (x < w) { src = a; sx = x; } else if (x >= w + gap) { src = b; sx = x - w - gap; }
      if (!src) { out[o] = 20; out[o + 1] = 12; out[o + 2] = 30; out[o + 3] = 255; continue; }
      const i = (y * w + sx) * 4;
      out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = 255;
    }
  }
  return { data: out, w: W, h };
}
