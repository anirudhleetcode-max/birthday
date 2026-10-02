/**
 * audio.js — the sound of Deepu's film.
 *
 * Everything here is synthesized live with the Web Audio API: no audio files, no samples.
 * The score is an ORIGINAL lullaby-waltz ("Sunlight Waltz") written for this film.
 *
 *   import { createAudio } from './core/audio.js';
 *   const audio = createAudio({ musicUrl: null });
 *   button.addEventListener('click', async () => { await audio.unlock(); audio.startTheme(); });
 *
 * Layout of this file
 *   1. helpers                 4. instruments (voices)          7. sound effects
 *   2. score data              5. graph (mixer, reverb, delay)  8. engine (any BaseAudioContext)
 *   3. moods                   6. Happy Birthday arrangement    9. createAudio() — the live wrapper
 *
 * `createEngine(ctx)` works with any BaseAudioContext, so the exact same graph can be rendered
 * with an OfflineAudioContext for testing (call `engine.pump(t)` / `engine.runTimers(t)` yourself).
 */

const LOOKAHEAD = 0.22; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25; // scheduler tick
const STEP = 0.5; // scheduler resolution in beats (an eighth note)
const MUTE_KEY = 'deepu-muted';
const SOFT_VOICES = 46; // above this, decorative notes (sparkles, arpeggios, octaves) are skipped
const HARD_VOICES = 80; // above this, every optional note is skipped

/* ───────────────────────────── 1. helpers ───────────────────────────── */

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C#6' | 'Bb3' | 72 → midi number */
export function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mod = (a, n) => ((a % n) + n) % n;

/** Cancel future automation without a jump (cancelAndHold where available). */
function hold(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else param.cancelScheduledValues(t);
}
function glide(param, value, t, tau) {
  hold(param, t);
  param.setTargetAtTime(value, t, Math.max(0.005, tau));
}
function gainNode(ctx, value = 1) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}
function biquad(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}
function safeDisconnect(nodes) {
  for (const n of nodes) {
    try { n.disconnect(); } catch { /* already gone */ }
  }
}

/* ───────────────────────────── 2. score ─────────────────────────────── */

/*
 * Chord voicings (hand voice-led: every pad voice moves by step or holds).
 * pad: warm close/open voicing in F3–Bb4, kept under the melody (C5–F6).
 */
const CHORD_DEFS = {
  F: ['F2', ['F3', 'C4', 'F4', 'A4']],
  'Am/E': ['E2', ['E3', 'C4', 'E4', 'A4']],
  'Bb/D': ['D2', ['F3', 'D4', 'F4', 'Bb4']],
  'F/C': ['C2', ['F3', 'C4', 'F4', 'A4']],
  Dm: ['D2', ['F3', 'D4', 'F4', 'A4']],
  Dm7: ['D2', ['F3', 'C4', 'F4', 'A4']],
  'Dm/C': ['C2', ['F3', 'D4', 'F4', 'A4']],
  'Dm7/C': ['C2', ['F3', 'D4', 'F4', 'A4']],
  Bb: ['Bb1', ['F3', 'D4', 'F4', 'Bb4']],
  'Bb(8)': ['Bb1', ['F3', 'Bb3', 'D4', 'Bb4']], // F7 → IV: Eb falls to D, A rises to Bb
  Bbm6: ['Bb1', ['F3', 'Db4', 'G4', 'Bb4']], // borrowed iv — the tear
  Bb6: ['Bb1', ['F3', 'D4', 'G4', 'Bb4']],
  Gm7: ['G1', ['F3', 'D4', 'G4', 'Bb4']],
  C7sus4: ['C2', ['F3', 'C4', 'G4', 'Bb4']],
  C7: ['C2', ['E3', 'C4', 'G4', 'Bb4']],
  C: ['C2', ['G3', 'C4', 'E4', 'G4']],
  F7: ['F2', ['F3', 'C4', 'Eb4', 'A4']],
  Am7: ['A1', ['G3', 'C4', 'E4', 'A4']],
  A7: ['A1', ['E3', 'C#4', 'G4', 'A4']], // V/vi — the lift into the bridge's peak
  Fadd9: ['F2', ['F3', 'C4', 'G4', 'A4']],
};
export const CHORDS = {};
for (const [name, [bass, pad]] of Object.entries(CHORD_DEFS)) {
  const padM = pad.map(midi);
  const bassM = midi(bass);
  const pcs = new Set([bassM % 12, ...padM.map((m) => m % 12)]);
  const inRange = (lo, hi) => {
    const out = [];
    for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
    return out;
  };
  CHORDS[name] = {
    name,
    bass: bassM,
    pad: padM,
    pcs,
    arp: inRange(53, 79), // harp arpeggio tones, F3–G5
    high: inRange(86, 101), // shimmer tones, D6–F7
    strings: [...new Set([bassM + 12, ...padM])].sort((a, b) => a - b),
    choir: padM.slice(1),
  };
}

/*
 * "Sunlight Waltz" — original theme. F major, 3/4, ~66 bpm, 32 bars: A (1–8) A' (9–16) B (17–24) A'' (25–32).
 *   c: chord segments [beatInBar, chord]
 *   m: melody [beatInBar, note, durationBeats, variant?]   variant 'a' = even loops, 'b' = odd loops
 *   d: phrase dynamics (0..1)
 * Motif: a rising arpeggio (5–1–3) that sighs down a third, then reaches up a minor sixth and falls by step.
 */
export const THEME = [
  // A — a music box in a quiet tower
  /*  1 */ { c: [[0, 'F']], d: 0.78, m: [[0, 'C5', 1], [1, 'F5', 1], [2, 'A5', 1]] },
  /*  2 */ { c: [[0, 'Am/E']], d: 0.8, m: [[0, 'G5', 2], [2, 'E5', 1]] },
  /*  3 */ { c: [[0, 'Bb/D']], d: 0.85, m: [[-0.14, 'D6', 0.14, 'b'], [0, 'C6', 2], [2, 'Bb5', 1]] },
  /*  4 */ { c: [[0, 'F/C']], d: 0.78, m: [[0, 'A5', 3, 'a'], [0, 'A5', 2, 'b'], [2, 'C6', 0.5, 'b'], [2.5, 'A5', 0.5, 'b']] },
  /*  5 */ { c: [[0, 'Dm']], d: 0.8, m: [[0, 'D5', 1], [1, 'F5', 1], [2, 'A5', 1]] },
  /*  6 */ { c: [[0, 'Bb']], d: 0.88, m: [[0, 'D6', 2], [2, 'C6', 1]] },
  /*  7 */ { c: [[0, 'Gm7']], d: 0.84, m: [[0, 'Bb5', 1.5], [1.5, 'A5', 0.5], [2, 'G5', 1]] },
  /*  8 */ { c: [[0, 'C7sus4'], [2, 'C7']], d: 0.76, m: [[0, 'F5', 2], [2, 'E5', 1, 'a'], [2, 'E5', 0.5, 'b'], [2.5, 'G5', 0.5, 'b']] },
  // A' — the same wish, reaching higher
  /*  9 */ { c: [[0, 'F']], d: 0.8, m: [[0, 'C5', 1], [1, 'F5', 1], [2, 'A5', 1]] },
  /* 10 */ { c: [[0, 'Am/E']], d: 0.82, m: [[0, 'G5', 2], [2, 'E5', 1]] },
  /* 11 */ { c: [[0, 'Dm7']], d: 0.86, m: [[0, 'C6', 2], [2, 'A5', 1]] },
  /* 12 */ { c: [[0, 'Bb']], d: 0.9, m: [[0, 'Bb5', 1], [1, 'C6', 1], [2, 'D6', 1]] },
  /* 13 */ { c: [[0, 'Gm7']], d: 0.92, m: [[0, 'D6', 2], [2, 'C6', 1]] },
  /* 14 */ { c: [[0, 'C7sus4'], [2, 'C7']], d: 0.84, m: [[0, 'Bb5', 1.5], [1.5, 'A5', 0.5], [2, 'G5', 1]] },
  /* 15 */ { c: [[0, 'F']], d: 0.8, m: [[0, 'F5', 3]] },
  /* 16 */ { c: [[0, 'F'], [2, 'F7']], d: 0.72, m: [[1, 'F5', 1, 'a'], [2, 'A5', 1, 'a'], [1, 'C6', 1, 'b'], [2, 'A5', 1, 'b']] },
  // B — the window opens
  /* 17 */ { c: [[0, 'Bb(8)']], d: 0.86, m: [[0, 'Bb5', 1], [1, 'C6', 1], [2, 'D6', 1]] },
  /* 18 */ { c: [[0, 'C']], d: 0.94, m: [[0, 'E6', 2], [2, 'D6', 1]] },
  /* 19 */ { c: [[0, 'Am7']], d: 0.88, m: [[0, 'C6', 2], [2, 'A5', 1]] },
  /* 20 */ { c: [[0, 'Dm']], d: 0.86, m: [[0, 'D6', 3, 'a'], [0, 'D6', 2, 'b'], [2, 'A5', 1, 'b']] },
  /* 21 */ { c: [[0, 'Gm7']], d: 0.9, m: [[0, 'Bb5', 1], [1, 'C6', 1], [2, 'D6', 1]] },
  /* 22 */ { c: [[0, 'A7']], d: 1, m: [[0, 'E6', 2], [2, 'C#6', 1]] },
  /* 23 */ { c: [[0, 'Dm'], [2, 'Dm/C']], d: 0.92, m: [[0, 'D6', 2], [2, 'C6', 1]] },
  /* 24 */ { c: [[0, 'C7sus4'], [2, 'C7']], d: 0.8, m: [[0, 'F5', 2], [2, 'E5', 1]] },
  // A'' — home, under the lanterns (IV → iv → I)
  /* 25 */ { c: [[0, 'F']], d: 0.84, m: [[0, 'C5', 1], [1, 'F5', 1], [2, 'A5', 1]] },
  /* 26 */ { c: [[0, 'Am/E']], d: 0.86, m: [[0, 'G5', 2], [2, 'E5', 1]] },
  /* 27 */ { c: [[0, 'Bb/D']], d: 0.9, m: [[-0.14, 'D6', 0.14, 'b'], [0, 'C6', 2], [2, 'Bb5', 1]] },
  /* 28 */ { c: [[0, 'Dm7/C']], d: 0.92, m: [[0, 'A5', 2], [2, 'D6', 1]] },
  /* 29 */ { c: [[0, 'Bb']], d: 1, m: [[0, 'F6', 2], [2, 'D6', 1]] },
  /* 30 */ { c: [[0, 'Bbm6']], d: 0.95, m: [[0, 'Db6', 2], [2, 'C6', 1]] },
  /* 31 */ { c: [[0, 'F/C'], [2, 'C7']], d: 0.84, m: [[0, 'A5', 2], [2, 'G5', 1]] },
  /* 32 */ { c: [[0, 'F']], d: 0.74, m: [[0, 'F5', 3]] },
];

const LOOP_BEATS = THEME.length * 3;
const LOOP_STEPS = LOOP_BEATS / STEP;

// Flatten the score into per-step buckets so the scheduler never scans the whole score.
const MEL_STEPS = Array.from({ length: LOOP_STEPS }, () => []);
const SEGS = [];
const SEG_START = new Int16Array(LOOP_STEPS).fill(-1);
const SEG_AT = new Int16Array(LOOP_STEPS);
THEME.forEach((bar, i) => {
  for (const [b, n, dur, v] of bar.m) {
    const beat = mod(i * 3 + b, LOOP_BEATS);
    MEL_STEPS[Math.floor(beat / STEP + 1e-6)].push({ beat, midi: midi(n), dur, v, grace: dur < 0.25, bar: i, down: b === 0 });
  }
  bar.c.forEach(([b, name], k) => {
    const start = i * 3 + b;
    const end = k + 1 < bar.c.length ? i * 3 + bar.c[k + 1][0] : (i + 1) * 3;
    SEG_START[start / STEP] = SEGS.length;
    SEGS.push({ start, dur: end - start, chord: CHORDS[name], bar: i });
  });
});
for (let s = 0, cur = 0; s < LOOP_STEPS; s++) {
  if (SEG_START[s] >= 0) cur = SEG_START[s];
  SEG_AT[s] = cur;
}

/*
 * Happy Birthday to You (traditional, public domain) in F major, 3/4, with a pickup.
 * C major reference: G G | A G C | B, G G | A G D | C, G G | G' E C | B A, F F | E C D | C
 * Beats count from the downbeat of the intro bar; the pickup "Hap-py" lands on beat 2.
 */
export const HAPPY_BIRTHDAY = {
  bpm: 78,
  melody: [
    // [beat, note, dur, velocity]
    [2, 'C5', 0.75, 0.5], [2.75, 'C5', 0.25, 0.42], //            Hap-py
    [3, 'D5', 1, 0.66], [4, 'C5', 1, 0.6], [5, 'F5', 1, 0.66], //  birth-day to
    [6, 'E5', 2, 0.7], [8, 'C5', 0.75, 0.5], [8.75, 'C5', 0.25, 0.42], // you, Hap-py
    [9, 'D5', 1, 0.66], [10, 'C5', 1, 0.6], [11, 'G5', 1, 0.7], // birth-day to
    [12, 'F5', 2, 0.72], [14, 'C5', 0.75, 0.52], [14.75, 'C5', 0.25, 0.45], // you, Hap-py
    [15, 'C6', 1, 0.86], [16, 'A5', 1, 0.72], [17, 'F5', 1, 0.66], // birth-day dear
    [18, 'E5', 1, 0.76], [19, 'D5', 1, 0.72], [20, 'Bb5', 0.75, 0.6], [20.75, 'Bb5', 0.25, 0.5], // Dee-pu, Hap-py
    [21, 'A5', 1, 0.72], [22, 'F5', 1, 0.66], [23, 'G5', 1, 0.7], // birth-day to
    [24, 'F5', 5, 0.84], //                                          you
  ],
  chords: [
    // [beat, chord, lengthBeats]
    [0, 'F', 6], [6, 'C7', 6], [12, 'F', 3], [15, 'F7', 3], [18, 'Bb6', 3], [21, 'F/C', 2], [23, 'C7', 1], [24, 'Fadd9', 5],
  ],
  // rubato: per-beat stretch factors (1 = in time)
  stretch: { 2: 1.04, 7: 1.08, 13: 1.1, 14: 1.12, 15: 1.18, 16: 1.04, 18: 1.1, 19: 1.7, 20: 1.1, 21: 1.12, 22: 1.22, 23: 1.38 },
  finalStretch: 1.4,
  tail: 3.8, // seconds after the last "you" before the promise resolves
};

/* ───────────────────────────── 3. moods ─────────────────────────────── */

const ALL_LAYERS = ['mbox', 'pad', 'arp', 'shimmer', 'pizz', 'bass', 'strings', 'choir', 'lead', 'drone'];

const MOODS = {
  // near silence: a lone music-box line in a big dark room
  hush: { tempo: 63, layers: { mbox: 0.62 }, mbox: { vel: 0.6, decay: 1.25, wet: 0.95, delay: 0.32 }, padCut: 700, stringsCut: 900 },
  // music box + soft pad (+ a whisper of bass)
  tender: { tempo: 66, layers: { mbox: 1, pad: 0.42, bass: 0.16 }, mbox: { vel: 0.8, decay: 1.1, wet: 0.6, delay: 0.2 }, padCut: 1100, stringsCut: 900 },
  // + harp arpeggios + high shimmer
  wonder: {
    tempo: 68, layers: { mbox: 1, pad: 0.42, arp: 0.65, shimmer: 0.8, bass: 0.22 },
    mbox: { vel: 0.82, decay: 1, wet: 0.55, delay: 0.24 }, padCut: 1500, stringsCut: 900, shimmerP: 0.2,
  },
  // brighter, oom-pah-pah waltz with pizzicato and bells
  festive: {
    tempo: 76, layers: { mbox: 1, pad: 0.33, pizz: 0.9, bass: 0.68, shimmer: 0.5 },
    mbox: { vel: 1, decay: 0.8, wet: 0.42, delay: 0.14 }, padCut: 2300, stringsCut: 900, shimmerP: 0.1, waltz: true,
  },
  // the lantern sky: strings, choir, octave melody, bass — everything
  soar: {
    // (the strings take over from the pad here — same voicing, so the pad would only cost CPU)
    tempo: 65, layers: { mbox: 1, strings: 0.8, choir: 0.5, lead: 0.55, bass: 0.46, shimmer: 0.6, arp: 0.4 },
    mbox: { vel: 0.9, decay: 1.05, wet: 0.5, delay: 0.2 }, padCut: 1900, stringsCut: 2800, shimmerP: 0.16, octave: true,
  },
  // fade to a soft drone
  quiet: { tempo: 60, layers: { drone: 0.62 }, mbox: { vel: 0.6, decay: 1.2, wet: 0.9, delay: 0.3 }, padCut: 600, stringsCut: 900 },
};

// With an uploaded song, moods only shape volume + brightness.
const CUSTOM_MOODS = {
  hush: { gain: 0.32, cut: 900 },
  tender: { gain: 0.6, cut: 3500 },
  wonder: { gain: 0.75, cut: 9000 },
  festive: { gain: 0.85, cut: 16000 },
  soar: { gain: 1, cut: 20000 },
  quiet: { gain: 0.22, cut: 600 },
};

/* ──────────────────────────── 4. instruments ────────────────────────── */

// [ratio, amplitude, decay as a fraction of the note's decay]
const MBOX_PARTIALS = [[1, 1, 1], [2, 0.3, 0.42], [3, 0.11, 0.22], [4.16, 0.09, 0.07], [5.43, 0.06, 0.04]];
const HARP_PARTIALS = [[1, 1, 1], [2, 0.42, 0.4], [3, 0.16, 0.22], [4, 0.05, 0.12]];
const PIZZ_PARTIALS = [[1, 1, 1], [2, 0.5, 0.55], [3, 0.22, 0.3]];
const BELL_PARTIALS = [[1, 1, 1], [2.0, 0.22, 0.5], [2.76, 0.16, 0.3], [4.16, 0.1, 0.12], [5.43, 0.07, 0.06]];

/**
 * Struck/plucked tone: a sum of sine partials, each with its own exponential decay.
 * Used for the music box, celesta, harp, pizzicato and bells.
 */
function strike(e, dest, t, note, vel, o = {}) {
  const { ctx } = e;
  if (o.optional && e.voices > (o.optional === 'hard' ? HARD_VOICES : SOFT_VOICES)) return;
  const f0 = mtof(note) * 2 ** (rand(-3, 3) / 1200);
  const D = (o.decay ?? clamp(3.3 - (note - 72) * 0.075, 1.2, 3.6)) * (o.decayMul ?? 1);
  const partials = o.partials ?? MBOX_PARTIALS;
  const attack = o.attack ?? 0.003;
  const bright = (o.bright ?? 1) * (0.55 + 0.6 * clamp(vel, 0, 1));
  const out = gainNode(ctx, vel * (o.gain ?? 0.16));
  out.connect(dest);
  const nyq = Math.min(15000, ctx.sampleRate * 0.45);
  const nodes = [out];
  let longest = null;
  let longestEnd = 0;
  partials.forEach(([ratio, amp, frac], i) => {
    const f = f0 * ratio;
    if (f > nyq) return;
    const a = i === 0 ? amp : amp * bright;
    const d = Math.max(0.03, D * frac);
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + (i === 0 ? attack : Math.min(attack, 0.002)));
    g.gain.exponentialRampToValueAtTime(0.0001 * a + 1e-6, t + attack + d);
    osc.connect(g);
    g.connect(out);
    const end = t + attack + d + 0.02;
    osc.start(t);
    osc.stop(end);
    nodes.push(osc, g);
    if (end > longestEnd) { longestEnd = end; longest = osc; }
  });
  if (longest) e.track(longest, nodes);
}

const PAD = { oscs: [['sawtooth', -8], ['sawtooth', 7], ['triangle', 0]], attack: 1.3, release: 2.1 };
const STRINGS = { oscs: [['sawtooth', -11], ['sawtooth', 1], ['sawtooth', 10]], attack: 1.2, release: 1.9, vib: 'vibStrings' };
const CHOIR = { oscs: [['sawtooth', -6], ['sawtooth', 6]], attack: 1.5, release: 2.1, vib: 'vibChoir' };
const LEAD = { oscs: [['sawtooth', -5], ['triangle', 4]], attack: 0.14, release: 0.55, vib: 'vibStrings' };
const BASS = { oscs: [['sine', 0], ['triangle', 0]], attack: 0.05, release: 0.9 };
const DRONE = { oscs: [['triangle', -3], ['sine', 3]], attack: 3 };

/** Sustained tone (pad, strings, choir, lead, bass): detuned oscillators under one slow envelope. */
function sustain(e, dest, t, note, dur, vel, cfg) {
  const { ctx } = e;
  const f = mtof(note);
  const g = ctx.createGain();
  // slow exponential attack; at release, continue from the exact envelope value and fall 60 dB
  const tau = cfg.attack / 3;
  const relAt = t + Math.max(dur, 0.05);
  const vRel = Math.max(vel * (1 - Math.exp(-(relAt - t) / tau)), 1e-6);
  const end = relAt + cfg.release * 1.3;
  g.gain.setValueAtTime(0, t);
  g.gain.setTargetAtTime(vel, t, tau);
  g.gain.setValueAtTime(vRel, relAt);
  g.gain.exponentialRampToValueAtTime(vRel * 1e-3, end);
  g.connect(dest);
  const vib = cfg.vib ? e.G[cfg.vib] : null;
  const nodes = [g];
  const oscs = [];
  for (const [type, cents] of cfg.oscs) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = cents + rand(-2.5, 2.5);
    o.connect(g);
    if (vib) vib.connect(o.detune);
    o.start(t);
    o.stop(end + 0.01);
    nodes.push(o);
    oscs.push(o);
  }
  e.track(oscs[oscs.length - 1], nodes, vib ? () => oscs.forEach((o) => { try { vib.disconnect(o.detune); } catch { /* gone */ } }) : null);
  return end;
}

/* ─────────────────────── 5. graph: mixer, reverb, delay ─────────────── */

/** Stereo impulse response: pre-delay, a few early reflections, then decaying noise that darkens. */
function makeImpulse(ctx, seconds = 4, preDelay = 0.02) {
  const sr = ctx.sampleRate;
  const pre = Math.floor(sr * preDelay);
  const len = pre + Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const fc = 1100 + 7500 * Math.exp(-t * 1.7); // brightness falls as the tail decays
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.006);
    }
    for (let k = 0; k < 6; k++) {
      const at = pre + Math.floor(sr * rand(0.004, 0.07));
      if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * rand(0.25, 0.6) * (1 - k / 7);
    }
  }
  return buf;
}

/** A send strip: three buses (dry/wet/delay), each with a fader and a ducker. */
function makeStrip(ctx, G, initial = 1) {
  const fade = [];
  const duck = [];
  const bus = (dest) => {
    const input = gainNode(ctx, 1);
    const f = gainNode(ctx, initial);
    const d = gainNode(ctx, 1);
    input.connect(f);
    f.connect(d);
    d.connect(dest);
    fade.push(f.gain);
    duck.push(d.gain);
    return input;
  };
  return { dry: bus(G.master), wet: bus(G.reverbIn), delay: bus(G.delayIn), fade, duck };
}

/** A mixer channel: input → (insert) → level → sends into a strip. */
function makeLayer(ctx, strip, { dry = 1, wet = 0.3, delay = 0 } = {}, insert = null, level = 0) {
  const input = gainNode(ctx, 1);
  const out = gainNode(ctx, level);
  if (insert) {
    input.connect(insert.in);
    insert.out.connect(out);
  } else input.connect(out);
  const mk = (to, v) => {
    const g = gainNode(ctx, v);
    out.connect(g);
    g.connect(to);
    return g;
  };
  const sends = { dry: mk(strip.dry, dry), wet: mk(strip.wet, wet), delay: mk(strip.delay, delay) };
  const pans = new Map();
  return {
    input, out, sends, insert, target: level, activeUntil: 0, catchup: false, held: new Map(),
    /** an input pre-panned to p (-1..1), shared per 0.1 step */
    pan(p) {
      if (!p || !ctx.createStereoPanner) return input;
      const k = Math.round(clamp(p, -1, 1) * 10);
      let node = pans.get(k);
      if (!node) {
        node = ctx.createStereoPanner();
        node.pan.value = k / 10;
        node.connect(input);
        pans.set(k, node);
      }
      return node;
    },
  };
}

function lowpassInsert(ctx, freq, q = 0.7) {
  const f = biquad(ctx, 'lowpass', freq, q);
  return { in: f, out: f, filter: f, filters: [f] };
}
/** 24 dB/oct: keeps detuned saws silky instead of fizzy. */
function lowpass4Insert(ctx, freq) {
  const a = biquad(ctx, 'lowpass', freq, 0.54);
  const b = biquad(ctx, 'lowpass', freq, 1.31);
  a.connect(b);
  return { in: a, out: b, filters: [a, b] };
}
/** "aah" formants (~800 / 1150 / 2800 Hz) plus a little low body. */
function formantInsert(ctx, makeup = 2.4) {
  const input = gainNode(ctx, 1);
  const sum = gainNode(ctx, makeup);
  const out = biquad(ctx, 'lowpass', 3200, 0.6); // soften the saw buzz above the formants
  sum.connect(out);
  for (const [f, q, g] of [[800, 5, 1], [1150, 7, 0.55], [2800, 10, 0.22]]) {
    const bp = biquad(ctx, 'bandpass', f, q);
    const gg = gainNode(ctx, g);
    input.connect(bp);
    bp.connect(gg);
    gg.connect(sum);
  }
  const body = biquad(ctx, 'lowpass', 420, 0.7);
  const bg = gainNode(ctx, 0.3);
  input.connect(body);
  body.connect(bg);
  bg.connect(sum);
  return { in: input, out };
}
function lfo(ctx, rate, depth, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const g = gainNode(ctx, depth);
  o.connect(g);
  o.start();
  g.osc = o;
  return g;
}

function buildGraph(ctx) {
  const G = {};
  // master: pre-gain → limiter → volume → mute → out
  G.master = gainNode(ctx, 0.9);
  G.limiter = ctx.createDynamicsCompressor();
  G.limiter.threshold.value = -4;
  G.limiter.knee.value = 3;
  G.limiter.ratio.value = 12;
  G.limiter.attack.value = 0.003;
  G.limiter.release.value = 0.22;
  G.volume = gainNode(ctx, 1);
  G.mute = gainNode(ctx, 1);
  G.master.connect(G.limiter);
  G.limiter.connect(G.volume);
  G.volume.connect(G.mute);
  G.mute.connect(ctx.destination);

  // reverb: high-passed send → convolver (≈4.2 s, 20 ms pre-delay) → gentle top cut
  G.reverbIn = gainNode(ctx, 1);
  const revHP = biquad(ctx, 'highpass', 170, 0.6);
  G.convolver = ctx.createConvolver();
  G.convolver.buffer = makeImpulse(ctx, 4.2, 0.02);
  const revTone = biquad(ctx, 'lowpass', 6500, 0.5);
  G.reverbOut = gainNode(ctx, 0.85);
  G.reverbIn.connect(revHP);
  revHP.connect(G.convolver);
  G.convolver.connect(revTone);
  revTone.connect(G.reverbOut);
  G.reverbOut.connect(G.master);

  // stereo ping-pong delay for bells: L → R → L … each bounce darker and quieter
  G.delayIn = gainNode(ctx, 1);
  const dHP = biquad(ctx, 'highpass', 400, 0.6);
  const dl = ctx.createDelay(2);
  const dr = ctx.createDelay(2);
  dl.delayTime.value = 0.43;
  dr.delayTime.value = 0.43;
  const lr = gainNode(ctx, 0.55);
  const rl = gainNode(ctx, 0.5);
  const fbTone = biquad(ctx, 'lowpass', 3200, 0.5);
  G.delayIn.connect(dHP);
  dHP.connect(dl);
  dl.connect(lr);
  lr.connect(dr);
  dr.connect(fbTone);
  fbTone.connect(rl);
  rl.connect(dl);
  const merger = ctx.createChannelMerger(2);
  dl.connect(merger, 0, 0);
  dr.connect(merger, 0, 1);
  const dOut = gainNode(ctx, 0.5);
  merger.connect(dOut);
  dOut.connect(G.master);
  const dRev = gainNode(ctx, 0.35);
  dOut.connect(dRev);
  dRev.connect(G.reverbIn);

  // shared modulators
  G.vibStrings = lfo(ctx, 5.2, 9);
  G.vibChoir = lfo(ctx, 4.6, 13);

  // shared white noise (2 s)
  const nlen = ctx.sampleRate * 2;
  G.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
  const nd = G.noise.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

  // strips
  G.music = makeStrip(ctx, G, 0); // silent until startTheme()
  G.hb = makeStrip(ctx, G);
  G.sfx = makeStrip(ctx, G);
  return G;
}

function makeThemeLayers(ctx, G) {
  const S = G.music;
  const padIns = lowpassInsert(ctx, 1100, 0.6);
  lfo(ctx, 0.07, 260).connect(padIns.filter.frequency); // slow breathing filter
  const strIns = lowpass4Insert(ctx, 900);
  const L = {
    mbox: makeLayer(ctx, S, { dry: 0.8, wet: 0.6, delay: 0.2 }),
    pad: makeLayer(ctx, S, { dry: 0.8, wet: 0.35 }, padIns),
    arp: makeLayer(ctx, S, { dry: 0.75, wet: 0.5, delay: 0.22 }),
    shimmer: makeLayer(ctx, S, { dry: 0.4, wet: 0.85, delay: 0.5 }),
    pizz: makeLayer(ctx, S, { dry: 0.85, wet: 0.3, delay: 0.06 }, lowpassInsert(ctx, 5000, 0.5)),
    bass: makeLayer(ctx, S, { dry: 1, wet: 0.06 }, lowpassInsert(ctx, 420, 0.6)),
    strings: makeLayer(ctx, S, { dry: 0.75, wet: 0.5 }, strIns),
    choir: makeLayer(ctx, S, { dry: 0.7, wet: 0.65 }, formantInsert(ctx)),
    lead: makeLayer(ctx, S, { dry: 0.75, wet: 0.5 }, lowpass4Insert(ctx, 2600)),
    drone: makeLayer(ctx, S, { dry: 0.8, wet: 0.55 }, lowpassInsert(ctx, 750, 0.5)),
    custom: makeLayer(ctx, S, { dry: 1, wet: 0.1 }, null, 0.5), // −6 dB: mastered songs are far louder than the score
  };
  L.padFilter = padIns.filter;
  L.stringsFilters = strIns.filters;
  return L;
}

function makeHBLayers(ctx, G) {
  const S = G.hb;
  return {
    mbox: makeLayer(ctx, S, { dry: 0.85, wet: 0.62, delay: 0.2 }, null, 1),
    pad: makeLayer(ctx, S, { dry: 0.8, wet: 0.4 }, lowpassInsert(ctx, 1300, 0.6), 1),
    bass: makeLayer(ctx, S, { dry: 1, wet: 0.06 }, lowpassInsert(ctx, 420, 0.6), 1),
    choir: makeLayer(ctx, S, { dry: 0.7, wet: 0.7 }, formantInsert(ctx), 1),
    strings: makeLayer(ctx, S, { dry: 0.7, wet: 0.55 }, lowpass4Insert(ctx, 2600), 1),
    sparkle: makeLayer(ctx, S, { dry: 0.5, wet: 0.85, delay: 0.45 }, null, 1),
  };
}

/* ───────────────────── 6. Happy Birthday arrangement ────────────────── */

function hbClock(spb) {
  const { stretch, finalStretch } = HAPPY_BIRTHDAY;
  const k = (b) => (b >= 24 ? finalStretch : stretch[b] ?? 1);
  return (beat) => {
    const whole = Math.floor(beat);
    let s = 0;
    for (let b = 0; b < whole; b++) s += spb * k(b);
    return s + (beat - whole) * spb * k(whole);
  };
}

/** Returns a list of timed events ({time, fn}) and the total length in seconds. */
function arrangeHappyBirthday(e, t0, L) {
  const HB = HAPPY_BIRTHDAY;
  const clock = hbClock(60 / HB.bpm);
  const T = (b) => t0 + clock(b);
  const ev = [];
  const at = (beat, fn, dt = 0) => ev.push({ time: T(beat) + dt, fn });

  // intro: the music box winds up over a warm F chord
  [[0, 'F5', 0.3], [0.5, 'A5', 0.28], [1, 'C6', 0.32]].forEach(([b, n, v]) =>
    at(b, (t) => strike(e, L.mbox.pan(0.15), t, midi(n), v, { gain: 0.3, decayMul: 1.1 })));

  // melody (+ a warm octave below on "Dee-pu" and on the last "to you")
  for (const [b, n, , v] of HB.melody) {
    const m = midi(n);
    at(b, (t) => {
      strike(e, L.mbox.pan(clamp((m - 76) / 20, -0.3, 0.3)), t + rand(0, 0.01), m, v, { gain: 0.36, decayMul: b >= 24 ? 1.5 : 1.15 });
      if (b >= 18 && b < 20) strike(e, L.mbox.input, t + 0.012, m - 12, v * 0.3, { gain: 0.3, optional: true });
      if (b >= 21) strike(e, L.sparkle.pan(0.3), t + 0.015, m + 12, v * 0.22, { gain: 0.3, optional: true });
      if (b >= 24) strike(e, L.mbox.pan(-0.2), t + 0.02, m - 12, v * 0.45, { gain: 0.3, decayMul: 1.4 });
    });
  }

  // harmony: pad + bass throughout, choir from "birth-day dear", strings for the last line
  for (const [b, name, len] of HB.chords) {
    const ch = CHORDS[name];
    at(b, (t) => {
      const dur = T(b + len) - T(b);
      const fin = b >= 24;
      for (const n of ch.pad) sustain(e, L.pad.input, t, n, dur, fin ? 0.02 : 0.016, { ...PAD, attack: b === 0 ? 1.2 : 0.7, release: fin ? 3 : 1.6 });
      sustain(e, L.bass.input, t, ch.bass, dur, fin ? 0.04 : 0.03, { ...BASS, release: fin ? 2.5 : 0.9 });
      if (b >= 15) for (const n of ch.choir) sustain(e, L.choir.input, t, n, dur, fin ? 0.045 : 0.035, { ...CHOIR, attack: b === 15 ? 2 : 0.8 });
      if (b >= 21) for (const n of ch.strings) sustain(e, L.strings.input, t, n, dur, fin ? 0.03 : 0.022, { ...STRINGS, attack: b === 21 ? 1.6 : 0.8, release: fin ? 3.2 : 1.6 });
    });
  }

  // the final "you": a celesta cascade up into the stars, then a few stray twinkles
  const cascade = ['F6', 'G6', 'A6', 'C7', 'D7', 'F7', 'G7', 'A7'].map(midi);
  cascade.forEach((m, i) => at(24, (t) => strike(e, L.sparkle.pan(-0.6 + (1.2 * i) / cascade.length), t, m, 0.36 - i * 0.022, { gain: 0.3, decay: 2.2, partials: BELL_PARTIALS }), 0.42 + i * 0.085));
  const twinkle = [89, 91, 93, 96, 98, 101, 103];
  for (let i = 0; i < 7; i++) at(24, (t) => strike(e, L.sparkle.pan(rand(-0.8, 0.8)), t, pick(twinkle), rand(0.1, 0.2), { gain: 0.3, decay: 1.8, optional: true }), 1.3 + i * 0.32 + rand(0, 0.12));

  return { events: ev, length: clock(24) + HB.tail };
}

/* ─────────────────────────── 7. sound effects ───────────────────────── */

const PENTA_PCS = new Set([5, 7, 9, 0, 2]); // F G A C D
function penta(lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (PENTA_PCS.has(m % 12)) out.push(m);
  return out;
}

/** Per-effect output: volume → pan → sfx strip (dry + reverb + delay sends). */
function fxOut(e, o, wet = 0.35, delay = 0, scale = 1) {
  const { ctx, G } = e;
  const g = gainNode(ctx, (o.volume ?? 1) * scale);
  const nodes = [g];
  let last = g;
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(o.pan, -1, 1);
    g.connect(p);
    nodes.push(p);
    last = p;
  }
  last.connect(G.sfx.dry);
  if (wet) {
    const w = gainNode(ctx, wet);
    last.connect(w);
    w.connect(G.sfx.wet);
    nodes.push(w);
  }
  if (delay) {
    const d = gainNode(ctx, delay);
    last.connect(d);
    d.connect(G.sfx.delay);
    nodes.push(d);
  }
  return { input: g, nodes };
}

function noiseSrc(e, t, dur) {
  const s = e.ctx.createBufferSource();
  s.buffer = e.G.noise;
  s.loop = true;
  s.start(t, rand(0, 1.5));
  s.stop(t + dur);
  return s;
}

/** Shaped, filtered noise. env: [[time, value], ...] relative to t (linear ramps). */
function noiseBurst(e, dest, t, dur, filters, env, extra = []) {
  const { ctx } = e;
  const src = noiseSrc(e, t, dur);
  let node = src;
  const nodes = [src];
  for (const [type, freq, q, automate] of filters) {
    const f = biquad(ctx, type, freq, q);
    if (automate) automate(f.frequency, t);
    node.connect(f);
    node = f;
    nodes.push(f);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  for (const [dt, v] of env) g.gain.linearRampToValueAtTime(v, t + dt);
  node.connect(g);
  g.connect(dest);
  nodes.push(g, ...extra);
  e.track(src, nodes);
  return g;
}

/** Sine "blip" with a pitch glide and an exponential decay — for thumps, ticks, pops. */
function blip(e, dest, t, f1, f2, amp, decay, type = 'sine', attack = 0.002) {
  const { ctx } = e;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + decay * 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + attack);
  g.gain.exponentialRampToValueAtTime(amp * 0.0001 + 1e-6, t + attack + decay);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.02);
  e.track(o, [o, g]);
}

const SFX = {
  tap(e, t, o) {
    const out = fxOut(e, o, 0.06);
    const f = o.note ? mtof(midi(o.note)) : 2100;
    blip(e, out.input, t, f, f, 0.07, 0.035, 'sine', 0.001);
    blip(e, out.input, t, f * 2.01, f * 2.01, 0.016, 0.018, 'sine', 0.001);
    return { out, end: t + 0.2 };
  },

  chime(e, t, o) {
    const out = fxOut(e, o, 0.5, 0.3);
    const base = o.note ? midi(o.note) : midi('F6');
    strike(e, out.input, t, base, 0.55, { gain: 0.2, decay: 2.8, partials: BELL_PARTIALS });
    strike(e, out.input, t + 0.035, base + 7, 0.3, { gain: 0.18, decay: 2.2 });
    strike(e, out.input, t + 0.07, base + 12, 0.16, { gain: 0.16, decay: 1.6 });
    return { out, end: t + 3.5 };
  },

  shimmer(e, t, o) {
    const out = fxOut(e, o, 0.6, 0.35);
    const notes = penta(midi('F5'), midi('F7'));
    notes.forEach((m, i) => {
      const k = i / (notes.length - 1);
      const dt = 1.0 * k ** 0.8;
      strike(e, out.input, t + dt, m, 0.12 + 0.2 * Math.sin(k * Math.PI * 0.85), { gain: 0.17, decay: 1.6, optional: 'hard' });
    });
    noiseBurst(e, out.input, t, 1.6,
      [['bandpass', 2500, 1.2, (p, t0) => { p.setValueAtTime(2500, t0); p.exponentialRampToValueAtTime(9000, t0 + 1.2); }]],
      [[0.8, 0.05], [1.5, 0]]);
    return { out, end: t + 3.6 };
  },

  whoosh(e, t, o) {
    const dur = o.duration ?? 1.1;
    const out = fxOut(e, o, 0.25);
    const { ctx } = e;
    let dest = out.input;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.6, t);
      p.pan.linearRampToValueAtTime(0.6, t + dur);
      p.connect(out.input);
      out.nodes.push(p);
      dest = p;
    }
    noiseBurst(e, dest, t, dur + 0.05,
      [['bandpass', 300, 0.9, (p, t0) => {
        p.setValueAtTime(300, t0);
        p.exponentialRampToValueAtTime(1700, t0 + dur * 0.5);
        p.exponentialRampToValueAtTime(450, t0 + dur);
      }], ['lowpass', 3200, 0.5]],
      [[dur * 0.45, 0.42], [dur, 0]]);
    return { out, end: t + dur + 2 };
  },

  swell(e, t, o) {
    const S = o.duration ?? 2.6;
    const out = fxOut(e, o, 0.5, 0.12, 0.6);
    const { ctx } = e;
    // riser: noise + a detuned F-major chord through an opening filter, exponential crescendo
    noiseBurst(e, out.input, t, S + 0.1,
      [['lowpass', 200, 0.8, (p, t0) => { p.setValueAtTime(200, t0); p.exponentialRampToValueAtTime(6000, t0 + S); }]],
      [[S * 0.5, 0.02], [S * 0.85, 0.06], [S - 0.02, 0.1], [S + 0.06, 0]]);
    const lp = biquad(ctx, 'lowpass', 300, 1.2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2800, t + S);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.06, t + S);
    env.gain.linearRampToValueAtTime(0, t + S + 0.1);
    lp.connect(env);
    env.connect(out.input);
    out.nodes.push(lp, env);
    for (const n of ['F3', 'C4', 'F4', 'A4', 'C5']) {
      for (const cents of [-9, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = mtof(midi(n));
        osc.detune.value = cents;
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + S + 0.12);
        e.track(osc, [osc]);
      }
    }
    // the soft hit
    const h = t + S;
    blip(e, out.input, h, 75, 42, 0.42, 1.0);
    noiseBurst(e, out.input, h, 0.8, [['lowpass', 900, 0.6]], [[0.005, 0.1], [0.6, 0]]);
    ['F5', 'A5', 'C6', 'F6'].forEach((n, i) => strike(e, out.input, h + i * 0.018, midi(n), 0.42, { gain: 0.15, decay: 3 }));
    for (const n of ['F3', 'C4', 'A4']) sustain(e, out.input, h, midi(n), 0.4, 0.03, { ...PAD, attack: 0.05, release: 2.8 });
    return { out, end: h + 4.5 };
  },

  sparkle(e, t, o) {
    const out = fxOut(e, o, 0.6, 0.35);
    const notes = penta(midi('F6'), midi('A7'));
    const n = 4 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      strike(e, out.input, t + rand(0, 0.7), pick(notes), rand(0.12, 0.3), { gain: 0.16, decay: 1.6, optional: 'hard' });
    }
    return { out, end: t + 3 };
  },

  pop(e, t, o) {
    const out = fxOut(e, o, 0.25, 0.1);
    noiseBurst(e, out.input, t, 0.12, [['highpass', 900, 0.7], ['bandpass', 2300, 0.7]], [[0.001, 0.17], [0.012, 0.08], [0.08, 0]]);
    blip(e, out.input, t, 220, 70, 0.22, 0.12);
    noiseBurst(e, out.input, t + 0.05, 0.6, [['highpass', 4200, 0.7]], [[0.04, 0.05], [0.18, 0.02], [0.55, 0]]);
    const notes = penta(midi('F6'), midi('F7'));
    for (let i = 0; i < 6; i++) strike(e, out.input, t + 0.08 + rand(0, 0.8), pick(notes), rand(0.1, 0.24), { gain: 0.15, decay: 1.3, optional: 'hard' });
    return { out, end: t + 2.5 };
  },

  candleOut(e, t, o) {
    const out = fxOut(e, o, 0.2);
    noiseBurst(e, out.input, t, 0.35, [['bandpass', 700, 0.6], ['lowpass', 1800, 0.5]], [[0.012, 0.16], [0.06, 0.08], [0.3, 0]]);
    blip(e, out.input, t, 140, 90, 0.05, 0.15);
    noiseBurst(e, out.input, t + 0.08, 0.5, [['highpass', 3000, 0.6]], [[0.1, 0.018], [0.45, 0]]);
    return { out, end: t + 1.5 };
  },

  blow(e, t, o) {
    const dur = o.duration ?? 1.4;
    const out = fxOut(e, o, 0.15);
    const wobble = lfo(e.ctx, 3.1, 180);
    wobble.osc.stop(t + dur + 0.8);
    noiseBurst(e, out.input, t, dur + 0.7,
      [['bandpass', 900, 0.5, (p) => wobble.connect(p)], ['lowpass', 2600, 0.5]],
      [[0.25, 0.22], [dur, 0.18], [dur + 0.6, 0]], [wobble]);
    noiseBurst(e, out.input, t, dur + 0.7, [['highpass', 2500, 0.5]], [[0.25, 0.045], [dur, 0.035], [dur + 0.6, 0]]);
    return { out, end: t + dur + 1.5, cleanup: () => { try { wobble.disconnect(); } catch { /* gone */ } } };
  },

  heartbeat(e, t, o) {
    const out = fxOut(e, o, 0.08);
    const thump = (at, a) => {
      blip(e, out.input, at, 95, 48, 0.36 * a, 0.22, 'sine', 0.004);
      blip(e, out.input, at, 190, 96, 0.1 * a, 0.12, 'triangle', 0.004);
    };
    thump(t, 1);
    thump(t + 0.3, 0.72);
    return { out, end: t + 1.2 };
  },

  pageTurn(e, t, o) {
    const out = fxOut(e, o, 0.12);
    const { ctx } = e;
    // crinkle: an irregular amplitude curve on top of a swoosh-shaped envelope
    const crackle = new Float32Array(48);
    for (let i = 0; i < crackle.length; i++) crackle[i] = Math.random() < 0.3 ? rand(0.6, 1) : rand(0.15, 0.4);
    const cg = ctx.createGain();
    cg.gain.value = crackle[0];
    cg.gain.setValueCurveAtTime(crackle, t, 0.45);
    cg.connect(out.input);
    let dest = cg;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(0.4, t);
      p.pan.linearRampToValueAtTime(-0.3, t + 0.45);
      p.connect(cg);
      out.nodes.push(p);
      dest = p;
    }
    out.nodes.push(cg);
    noiseBurst(e, dest, t, 0.5, [['highpass', 1200, 0.6], ['bandpass', 3200, 0.5]], [[0.12, 0.3], [0.45, 0]]);
    noiseBurst(e, out.input, t + 0.3, 0.25, [['lowpass', 420, 0.7]], [[0.03, 0.12], [0.2, 0]]);
    return { out, end: t + 1.2 };
  },

  lanternRise(e, t, o) {
    const out = fxOut(e, o, 0.4, 0.25);
    noiseBurst(e, out.input, t, 1.2,
      [['lowpass', 180, 0.9, (p, t0) => {
        p.setValueAtTime(180, t0);
        p.exponentialRampToValueAtTime(1100, t0 + 0.18);
        p.exponentialRampToValueAtTime(380, t0 + 1.1);
      }]],
      [[0.12, 0.3], [0.4, 0.14], [1.1, 0]]);
    blip(e, out.input, t, 70, 95, 0.18, 0.6, 'sine', 0.08);
    strike(e, out.input, t + 0.32, midi('C7'), 0.36, { gain: 0.18, decay: 2.6, partials: BELL_PARTIALS });
    strike(e, out.input, t + 0.47, midi('G7'), 0.18, { gain: 0.15, decay: 1.8 });
    return { out, end: t + 4 };
  },

  magic(e, t, o) {
    const out = fxOut(e, o, 0.55, 0.3);
    const { ctx } = e;
    // choir bloom (its own formant bank so it never depends on the theme mixer)
    const ins = formantInsert(ctx, 2.2);
    const bloom = ctx.createGain();
    bloom.gain.setValueAtTime(0, t);
    bloom.gain.setTargetAtTime(1, t, 0.35);
    bloom.gain.setTargetAtTime(0, t + 2.2, 0.6);
    ins.out.connect(bloom);
    bloom.connect(out.input);
    for (const n of ['C4', 'F4', 'A4', 'C5', 'G5']) {
      sustain(e, ins.in, t, midi(n), 2.4, 0.045, { ...CHOIR, attack: 0.6, release: 1.6 });
    }
    sustain(e, out.input, t, midi('F2'), 2, 0.05, { ...BASS, attack: 0.6, release: 1.6 });
    ['F5', 'A5', 'C6', 'F6', 'A6', 'C7'].forEach((n, i) => strike(e, out.input, t + 0.15 + i * 0.12, midi(n), 0.3, { gain: 0.13, decay: 2.4 }));
    const notes = penta(midi('F6'), midi('F7'));
    for (let i = 0; i < 6; i++) strike(e, out.input, t + rand(0.8, 2.6), pick(notes), rand(0.1, 0.22), { gain: 0.15, decay: 1.6, optional: 'hard' });
    noiseBurst(e, out.input, t, 2.8, [['bandpass', 7000, 2]], [[1.2, 0.025], [2.7, 0]]);
    const nodes = [bloom];
    return { out, end: t + 6, cleanup: () => { safeDisconnect(nodes); try { ins.in.disconnect(); ins.out.disconnect(); } catch { /* gone */ } } };
  },
};
export const SFX_NAMES = Object.keys(SFX);

/* ───────────────────── 8. engine (any BaseAudioContext) ─────────────── */

export function createEngine(ctx) {
  const G = buildGraph(ctx);
  const e = { ctx, G, voices: 0 };
  const now = () => ctx.currentTime;

  // voice bookkeeping: count live voices, disconnect everything when the last oscillator ends
  e.track = (src, nodes, extra) => {
    e.voices++;
    src.onended = () => {
      e.voices--;
      if (extra) extra();
      safeDisconnect(nodes);
    };
  };

  const L = makeThemeLayers(ctx, G);
  let HBL = null; // a fresh mixer set per Happy Birthday run, so a stopped run can be faded and retired cleanly
  const retire = (layers) => safeDisconnect(Object.values(layers).map((l) => l.out));

  // timed events (scheduled ahead, like notes) and timers (run when the clock passes them)
  const queue = [];
  const timers = [];
  const enqueue = (events) => {
    queue.push(...events);
    queue.sort((a, b) => a.time - b.time);
  };
  const addTimer = (time, fn) => {
    timers.push({ time, fn });
    timers.sort((a, b) => a.time - b.time);
  };

  const theme = {
    playing: false, paused: false, startedAt: -1,
    beat: 0, nextTime: 0, tempo: MOODS.tender.tempo, targetTempo: MOODS.tender.tempo,
    mood: 'tender',
  };
  const hb = { active: false, promise: null, resolve: null, id: 0 };
  const custom = { el: null, ok: false, lp: null, g: null };
  let drone = null;

  const live = (name) => L[name].target > 0.0001 || now() < L[name].activeUntil;
  const fadeStrip = (strip, v, t, tau, from) => {
    for (const p of strip.fade) {
      hold(p, t);
      if (from !== undefined) p.setValueAtTime(from, t);
      p.setTargetAtTime(v, t, tau);
    }
  };
  const usingCustom = () => custom.el && custom.ok;

  /* ── moods ── */
  function setMood(name, fade) {
    const m = MOODS[name];
    if (!m) return;
    theme.mood = name;
    const t = now();
    // a mood set while the theme is still fading in takes over almost immediately
    const early = theme.playing && t - theme.startedAt < 1.5;
    const tau = fade === 0 ? 0.02 : early ? 0.25 : (fade ?? 2.8) / 3;
    for (const ln of ALL_LAYERS) {
      const layer = L[ln];
      const target = m.layers[ln] ?? 0;
      const wasLive = layer.target > 0.0001;
      layer.target = target;
      const k = ln === 'strings' && name === 'soar' && !early ? 1.5 : 1; // strings swell in slower
      glide(layer.out.gain, target, t, tau * k);
      if (target > 0) {
        layer.activeUntil = Infinity;
        if (!wasLive) layer.catchup = true;
      } else layer.activeUntil = t + tau * 7;
    }
    glide(L.mbox.sends.wet.gain, m.mbox.wet, t, tau);
    glide(L.mbox.sends.delay.gain, m.mbox.delay, t, tau);
    glide(L.padFilter.frequency, m.padCut, t, tau);
    for (const f of L.stringsFilters) glide(f.frequency, m.stringsCut, t, name === 'soar' ? tau * 1.6 : tau);
    theme.targetTempo = m.tempo;
    if (!theme.playing) theme.tempo = m.tempo;
    // the drone lives outside the scheduler
    if ((m.layers.drone ?? 0) > 0) startDrone(t);
    else if (drone) stopDrone(t + Math.max(tau * 6, 1.5));
    // an uploaded song only gets volume + brightness
    if (custom.g) {
      const c = CUSTOM_MOODS[name] ?? CUSTOM_MOODS.tender;
      glide(custom.g.gain, c.gain, t, tau);
      glide(custom.lp.frequency, c.cut, t, tau);
    }
  }

  /** 'quiet': a soft open-fifth drone on F that breathes slowly. Runs outside the scheduler. */
  function startDrone(t) {
    if (drone) return;
    const amp = gainNode(ctx, 0.85);
    const wob = lfo(ctx, 0.05, 0.15);
    wob.connect(amp.gain);
    const fade = gainNode(ctx, 1);
    amp.connect(fade);
    fade.connect(L.drone.input);
    const d = { oscs: [wob.osc], nodes: [amp, wob, fade], fade };
    for (const [n, v] of [['F2', 0.022], ['C3', 0.022], ['F3', 0.024], ['C4', 0.012], ['A3', 0.005]]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(v, t, DRONE.attack / 3);
      g.connect(amp);
      d.nodes.push(g);
      for (const [type, cents] of DRONE.oscs) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(midi(n));
        o.detune.value = cents;
        o.connect(g);
        o.start(t);
        d.oscs.push(o);
        d.nodes.push(o);
      }
    }
    drone = d;
  }
  function stopDrone(at) {
    if (!drone) return;
    const d = drone;
    drone = null;
    const t = now();
    const tau = Math.max(0.1, (at - t) / 6);
    glide(d.fade.gain, 0, t, tau); // its own fade, so a new drone can start while this one dies away
    for (const o of d.oscs) {
      try { o.stop(at + tau); } catch { /* already stopped */ }
    }
    addTimer(at + tau + 0.1, () => safeDisconnect(d.nodes));
  }

  /* ── the scheduler ── */
  function processStep() {
    const st = theme;
    const t0 = st.nextTime;
    const spb = 60 / st.tempo;
    const lb = mod(st.beat, LOOP_BEATS);
    const si = Math.round(lb / STEP) % LOOP_STEPS;
    const loop = Math.floor(st.beat / LOOP_BEATS + 1e-9);
    const variant = loop % 2 ? 'b' : 'a';
    const mood = MOODS[st.mood];
    const seg = SEGS[SEG_AT[si]];
    const bar = THEME[seg.bar];
    const dyn = bar.d;
    const late = now() - 0.12;

    // melody
    for (const ev of MEL_STEPS[si]) {
      if (ev.v && ev.v !== variant) continue;
      const t = t0 + (ev.beat - lb) * spb;
      if (t < late) continue;
      const accent = ev.down ? 1.06 : 0.94;
      if (live('mbox')) {
        const vel = (ev.grace ? 0.4 : 0.85) * mood.mbox.vel * dyn * accent * rand(0.93, 1.05);
        strike(e, L.mbox.pan(clamp((ev.midi - 79) / 16, -0.35, 0.35)), t + rand(0, 0.012), ev.midi, vel, { gain: 0.42, decayMul: mood.mbox.decay, optional: ev.grace ? 'soft' : false });
        if (mood.octave && !ev.grace) strike(e, L.mbox.pan(0.25), t + 0.012, ev.midi + 12, vel * 0.3, { gain: 0.34, optional: true });
      }
      if (live('lead') && !ev.grace) {
        sustain(e, L.lead.input, t, ev.midi - 12, ev.dur * spb * 0.97 + 0.06, 0.14 * dyn, LEAD);
      }
    }

    // harmony: pads/strings/choir hold common tones across chord changes
    const segIdx = SEG_START[si];
    if (segIdx >= 0) {
      holdChord('pad', segIdx, 0, st.beat, t0, spb, dyn);
      holdChord('strings', segIdx, 0, st.beat, t0, spb, dyn);
      holdChord('choir', segIdx, 0, st.beat, t0, spb, dyn);
      if (live('bass')) {
        const ch = SEGS[segIdx].chord;
        if (mood.waltz) strike(e, L.bass.input, t0, ch.bass + 12, 0.75, { partials: PIZZ_PARTIALS, decay: 0.7, gain: 0.34, attack: 0.008 });
        else sustain(e, L.bass.input, t0, ch.bass, SEGS[segIdx].dur * spb, 0.075, BASS);
      }
    }
    for (const ln of ['pad', 'strings', 'choir']) {
      if (L[ln].catchup && live(ln)) {
        const s = SEG_AT[si];
        holdChord(ln, s, lb - SEGS[s].start, st.beat, t0, spb, dyn);
      }
      L[ln].catchup = false;
    }

    // decoration
    const pos = Math.round((lb - seg.bar * 3) / STEP); // 0..5 within the bar
    if (live('arp')) {
      const tones = seg.chord.arp;
      const pattern = seg.bar % 2 === 0 ? [0, 1, 2, 3, 4, 5] : [6, 5, 4, 3, 2, 1];
      const m = tones[Math.min(pattern[pos], tones.length - 1)];
      strike(e, L.arp.pan(clamp((m - 65) / 14, -0.5, 0.5)), t0 + rand(0, 0.008), m, (pos === 0 ? 0.55 : 0.4) * dyn, { partials: HARP_PARTIALS, decay: 1.7, gain: 0.45, attack: 0.005, optional: true });
    }
    if (live('pizz') && pos % 2 === 0) {
      if (pos > 0) {
        for (const m of seg.chord.pad.slice(1)) strike(e, L.pizz.input, t0 + rand(0, 0.01), m, 0.55 * dyn, { partials: PIZZ_PARTIALS, decay: 0.42, gain: 0.26, attack: 0.007 });
      } else {
        strike(e, L.pizz.pan(0.3), t0, seg.chord.pad[3] + 24, 0.2, { partials: BELL_PARTIALS, decay: 1.4, gain: 0.3, optional: true });
      }
    }
    if (live('shimmer') && Math.random() < (mood.shimmerP ?? 0.12)) {
      strike(e, L.shimmer.pan(rand(-0.7, 0.7)), t0 + rand(0, spb * STEP), pick(seg.chord.high), rand(0.12, 0.28), { decay: 2.4, gain: 0.4, optional: true });
    }

    // advance (tempo eases toward the mood's tempo)
    st.tempo += (st.targetTempo - st.tempo) * 0.06;
    st.beat += STEP;
    st.nextTime = t0 + STEP * spb;
  }

  const MAX_RUN = 9; // beats; long common tones are re-struck so pads keep breathing
  const SUSTAIN = {
    pad: { notes: (c) => c.pad, cfg: PAD, vel: 0.034 },
    strings: { notes: (c) => c.strings, cfg: STRINGS, vel: 0.05 },
    choir: { notes: (c) => c.choir, cfg: CHOIR, vel: 0.1 },
  };
  /** Start every note of segment s that isn't already sounding, merged across following segments that share it. */
  function holdChord(ln, s, offset, absBeat, t, spb, dyn) {
    if (!live(ln)) return;
    const S = SUSTAIN[ln];
    const layer = L[ln];
    for (const n of S.notes(SEGS[s].chord)) {
      if ((layer.held.get(n) ?? -1) > absBeat + 0.01) continue;
      let run = SEGS[s].dur - offset;
      for (let j = (s + 1) % SEGS.length; run < MAX_RUN; j = (j + 1) % SEGS.length) {
        if (!S.notes(SEGS[j].chord).includes(n)) break;
        run += SEGS[j].dur;
      }
      sustain(e, layer.input, t, n, run * spb, S.vel * (0.8 + 0.25 * dyn), S.cfg);
      layer.held.set(n, absBeat + run);
    }
  }

  /** Schedule everything that falls before `until` (seconds on the context clock). */
  function pump(until) {
    while (queue.length && queue[0].time < until) {
      const ev = queue.shift();
      ev.fn(Math.max(ev.time, now() + 0.005));
    }
    if (!theme.playing || theme.paused || usingCustom()) return;
    // after a stall (busy main thread), skip ahead instead of firing a burst of late notes
    if (theme.nextTime < now() - 0.25) {
      const spb = 60 / theme.tempo;
      const skip = Math.ceil((now() - theme.nextTime) / (STEP * spb));
      theme.beat += skip * STEP;
      theme.nextTime += skip * STEP * spb;
    }
    while (theme.nextTime < until) processStep();
  }
  function runTimers(t) {
    while (timers.length && timers[0].time <= t) timers.shift().fn();
  }

  /* ── transport ── */
  function restartTheme(t, fadeTau) {
    theme.paused = false;
    theme.startedAt = t;
    for (const ln of ['pad', 'strings', 'choir']) L[ln].held.clear();
    if (usingCustom()) {
      playMedia();
    } else {
      theme.nextTime = t + 0.06;
      theme.tempo = theme.targetTempo;
    }
    fadeStrip(G.music, 1, t, fadeTau);
  }
  function startTheme() {
    if (theme.playing) return;
    theme.playing = true;
    theme.beat = 0;
    if (!hb.active) restartTheme(now(), 1.0); // ≈3 s fade in
  }

  function duck(amount = 0.35, seconds = 1.2) {
    const t = now();
    const a = clamp(amount, 0, 1);
    for (const p of G.music.duck) {
      hold(p, t);
      p.setTargetAtTime(a, t, 0.08);
      p.setTargetAtTime(1, t + 0.2 + seconds, 0.4);
    }
  }

  function happyBirthday() {
    if (hb.active) return hb.promise;
    const t = now();
    hb.active = true;
    theme.paused = true;
    fadeStrip(G.music, 0, t, 0.3);
    if (usingCustom()) addTimer(t + 1.4, () => { if (hb.active) custom.el.pause(); });
    if (HBL) {
      const old = HBL; // the previous run's tail may still be ringing: let it finish first
      addTimer(t + 10, () => retire(old));
    }
    HBL = makeHBLayers(ctx, G);
    const t0 = t + 1.0;
    const { events, length } = arrangeHappyBirthday(e, t0, HBL);
    enqueue(events);
    const id = ++hb.id;
    hb.promise = new Promise((resolve) => {
      hb.resolve = resolve;
      addTimer(t0 + length, () => finishHappyBirthday(id));
    });
    return hb.promise;
  }
  function finishHappyBirthday(id) {
    if (!hb.active || id !== hb.id) return;
    hb.active = false;
    const resolve = hb.resolve;
    hb.promise = null;
    hb.resolve = null;
    if (theme.playing) {
      // come back in at the top of the theme, gently
      theme.beat = Math.ceil(theme.beat / LOOP_BEATS - 1e-9) * LOOP_BEATS;
      restartTheme(now(), 1.0);
    } else theme.paused = false;
    if (resolve) resolve();
  }

  function sfx(name, o = {}) {
    const fn = SFX[name];
    if (!fn) return;
    const t = now() + 0.01 + Math.max(0, o.delay ?? 0);
    const r = fn(e, t, o);
    if (r) {
      addTimer(r.end + 0.5, () => {
        safeDisconnect(r.out.nodes);
        if (r.cleanup) r.cleanup();
      });
    }
  }

  function stop() {
    const t = now();
    theme.playing = false;
    theme.paused = false;
    fadeStrip(G.music, 0, t, 0.2);
    if (HBL) {
      const old = HBL;
      HBL = null;
      for (const l of Object.values(old)) glide(l.out.gain, 0, t, 0.15);
      addTimer(t + 1.5, () => retire(old));
    }
    queue.length = 0;
    if (custom.el) addTimer(t + 0.8, () => { if (!theme.playing) custom.el.pause(); });
    if (drone) stopDrone(t + 1);
    if (hb.active) {
      hb.active = false;
      const r = hb.resolve;
      hb.promise = null;
      hb.resolve = null;
      if (r) r();
    }
  }

  /* ── an uploaded song instead of the generated score ── */
  function attachMedia(el) {
    try {
      const src = ctx.createMediaElementSource(el);
      custom.lp = biquad(ctx, 'lowpass', 20000, 0.5);
      custom.g = gainNode(ctx, 1);
      src.connect(custom.lp);
      custom.lp.connect(custom.g);
      custom.g.connect(L.custom.input);
      custom.el = el;
      custom.ok = true;
      const c = CUSTOM_MOODS[theme.mood] ?? CUSTOM_MOODS.tender;
      custom.g.gain.value = c.gain;
      custom.lp.frequency.value = c.cut;
      return true;
    } catch (err) {
      console.warn('[audio] custom music unavailable, using the score', err);
      return false;
    }
  }
  function playMedia() {
    if (!custom.el) return;
    const p = custom.el.play();
    if (p && p.catch) p.catch((err) => { if (err && err.name !== 'AbortError') e.onMediaBlocked && e.onMediaBlocked(); });
  }
  function mediaFailed() {
    if (!custom.ok) return;
    custom.ok = false;
    console.warn('[audio] custom music failed to load, using the score');
    if (theme.playing && !theme.paused) {
      theme.nextTime = now() + 0.06;
      theme.tempo = theme.targetTempo;
    }
  }

  setMood('tender', 0);

  Object.assign(e, {
    layers: L, theme, hb, custom,
    setMood, startTheme, duck, happyBirthday, sfx, stop,
    pump, runTimers, attachMedia, playMedia, mediaFailed,
    setVolume(v, instant) { glide(G.volume.gain, clamp(v, 0, 1), now(), instant ? 0.005 : 0.08); },
    setMuted(m, instant) { glide(G.mute.gain, m ? 0 : 1, now(), instant ? 0.005 : 0.08); },
    onHidden() { if (custom.el && !custom.el.paused) custom.el.pause(); },
    onVisible() { if (usingCustom() && theme.playing && !theme.paused) playMedia(); },
  });
  Object.defineProperties(e, {
    hbLayers: { get: () => HBL },
    mood: { get: () => theme.mood },
    themePlaying: { get: () => theme.playing && !theme.paused },
  });
  return e;
}

/* ─────────────────────── 9. createAudio — live wrapper ──────────────── */

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
function writeMuted(m) {
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* private mode */ }
}
const isIOS = () => typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** 0.25 s of 8-bit silence as a WAV blob URL (keeps iOS in "playback" mode under the ringer switch). */
function silentWavUrl() {
  const n = 2000;
  const b = new DataView(new ArrayBuffer(44 + n));
  const str = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); b.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true); b.setUint32(28, 8000, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true);
  str(36, 'data'); b.setUint32(40, n, true);
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }));
}

export function createAudio(options = {}) {
  const hasWindow = typeof window !== 'undefined';
  const AC = hasWindow ? window.AudioContext || window.webkitAudioContext : null;
  const musicUrl = options.musicUrl || null;

  let ctx = null;
  let eng = null;
  let timer = null;
  let unlocked = false;
  let muted = readMuted();
  let volume = 1;
  let mood = 'tender';
  let wantTheme = false;
  let silentEl = null;
  let mediaEl = null;
  let mediaPrimed = false;
  const lastSfx = new Map();
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  // very old WebKit returns undefined instead of a promise
  const resumeCtx = () => { try { const r = ctx.resume(); return r && r.catch ? r.catch(() => {}) : null; } catch { return null; } };
  const suspendCtx = () => { try { const r = ctx.suspend(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ } };

  const tick = () => {
    if (!eng) return;
    try {
      eng.runTimers(ctx.currentTime);
      if (ctx.state === 'running') eng.pump(ctx.currentTime + LOOKAHEAD);
    } catch (err) {
      console.warn('[audio]', err);
    }
  };
  const startTimer = () => { if (!timer) timer = setInterval(tick, TICK_MS); };
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  function makeContext() {
    try { return new AC({ latencyHint: 'balanced' }); } catch { /* old Safari: no options */ }
    try { return new AC(); } catch { return null; }
  }

  // iOS: keep Web Audio audible with the ringer switch on silent
  function playbackSession() {
    try {
      if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; }
      if (!isIOS()) return;
      if (!silentEl) {
        silentEl = new Audio(silentWavUrl());
        silentEl.loop = true;
        silentEl.setAttribute('playsinline', '');
      }
      const p = silentEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch { /* best effort */ }
  }

  function resumeIfNeeded() {
    if (!ctx || !unlocked || hidden()) return;
    if (ctx.state !== 'running') resumeCtx();
    if (silentEl && silentEl.paused) silentEl.play().catch(() => {});
    if (eng) eng.onVisible();
  }

  function onVisibility(ev) {
    if (!ctx || !unlocked) return;
    if (hidden() || (ev && ev.type === 'pagehide')) {
      stopTimer();
      if (eng) eng.onHidden();
      if (silentEl) silentEl.pause();
      suspendCtx();
    } else {
      resumeIfNeeded();
      startTimer();
    }
  }

  function setupMedia() {
    if (!musicUrl || mediaEl) return;
    try {
      mediaEl = new Audio();
      mediaEl.crossOrigin = 'anonymous';
      mediaEl.preload = 'auto';
      mediaEl.loop = true;
      mediaEl.setAttribute('playsinline', '');
      mediaEl.addEventListener('error', () => eng && eng.mediaFailed());
      mediaEl.src = musicUrl;
      if (!eng.attachMedia(mediaEl)) mediaEl = null;
    } catch (err) {
      console.warn('[audio] custom music unavailable', err);
      mediaEl = null;
    }
  }

  async function unlock() {
    if (!AC) return;
    try {
      // everything up to the first await runs inside the user gesture (required by iOS)
      if (!ctx) {
        ctx = makeContext();
        if (!ctx) return;
        eng = createEngine(ctx);
        eng.setVolume(volume, true);
        eng.setMuted(muted, true);
        eng.setMood(mood, 0);
        eng.onMediaBlocked = () => { if (mediaEl) mediaPrimed = false; };
        setupMedia();
        ctx.onstatechange = () => {
          if (ctx.state === 'interrupted' || (ctx.state === 'suspended' && !hidden())) resumeIfNeeded();
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onVisibility);
        window.addEventListener('pageshow', onVisibility);
        for (const ev of ['pointerdown', 'touchend', 'keydown']) {
          window.addEventListener(ev, resumeIfNeeded, { capture: true, passive: true });
        }
      }
      // the classic iOS unlock: play one silent sample inside the gesture
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      playbackSession();
      if (mediaEl && !mediaPrimed) {
        // bless the element for later play() calls; the music strip is silent until startTheme
        mediaPrimed = true;
        const p = mediaEl.play();
        if (p && p.then) p.then(() => { if (!eng.themePlaying) mediaEl.pause(); }).catch(() => { mediaPrimed = false; });
      }
      unlocked = true;
      const resumed = ctx.state === 'running' ? null : resumeCtx();
      startTimer();
      if (wantTheme) eng.startTheme();
      // never hang the caller: some browsers keep resume() pending while the page is hidden
      if (resumed) await Promise.race([resumed, new Promise((r) => setTimeout(r, 800))]);
    } catch (err) {
      console.warn('[audio] unlock failed', err);
    }
  }

  return {
    unlock,
    startTheme() {
      wantTheme = true;
      if (eng && unlocked) eng.startTheme();
    },
    setMood(m) {
      if (!MOODS[m]) return;
      mood = m;
      if (eng) eng.setMood(m);
    },
    duck(amount = 0.35, seconds = 1.2) {
      if (eng) eng.duck(amount, seconds);
    },
    happyBirthday() {
      if (!eng || !unlocked) return Promise.resolve();
      resumeIfNeeded();
      const p = eng.happyBirthday();
      // safety net: if the audio clock never runs (blocked/broken output), don't hold the film hostage
      return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        p.then(finish);
        const check = () => {
          if (done) return;
          if (ctx.state !== 'running' && !hidden()) finish();
          else setTimeout(check, 4000);
        };
        setTimeout(check, 30000);
      });
    },
    sfx(name, opts) {
      if (!eng || !unlocked || ctx.state !== 'running') return;
      const t = performance.now();
      if (t - (lastSfx.get(name) ?? -1e9) < 35) return; // de-dupe double fires
      lastSfx.set(name, t);
      try { eng.sfx(name, opts || {}); } catch (err) { console.warn('[audio] sfx', name, err); }
    },
    toggleMute() {
      muted = !muted;
      writeMuted(muted);
      if (eng) eng.setMuted(muted);
      return muted;
    },
    get muted() { return muted; },
    setVolume(v) {
      volume = clamp(Number(v) || 0, 0, 1);
      if (eng) eng.setVolume(volume);
    },
    get context() { return ctx; },
    stop() {
      wantTheme = false;
      if (eng) eng.stop();
    },
  };
}
