#!/usr/bin/env node
// Regenerates the fake-microphone recordings used by tests/e2e/cake-mic.cjs (16 kHz mono, 16-bit, 9 s;
// Chromium loops them):
//   silence.wav — a quiet room (faint hiss, ~0.002 RMS)
//   breath.wav  — the same room for 1.5 s, then a 3 s blow (wind noise: most of its energy below
//                 ~1 kHz, like a breath hitting a phone microphone), repeated
//   node tests/fixtures/audio/make-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 16000, SEC = 9, N = SR * SEC;
const dir = dirname(fileURLToPath(import.meta.url));
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return buf;
}

const room = () => rand() * 0.0035;
writeFileSync(join(dir, 'silence.wav'), wav(Float32Array.from({ length: N }, room)));

// wind noise: white noise through two one-pole low-passes (~700 Hz) plus a little broadband hiss
const a = Math.exp(-2 * Math.PI * 700 / SR);
let l1 = 0, l2 = 0;
const out = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = (i / SR) % 4.5; // 1.5 s room, 3 s blow
  const env = t < 1.5 ? 0 : Math.min(1, (t - 1.5) / 0.08) * Math.min(1, (4.5 - t) / 0.25);
  const w = rand();
  l1 = (1 - a) * w + a * l1; l2 = (1 - a) * l1 + a * l2;
  out[i] = room() + env * (l2 * 1.9 + w * 0.02);
}
writeFileSync(join(dir, 'breath.wav'), wav(out));
console.log('wrote silence.wav and breath.wav');
