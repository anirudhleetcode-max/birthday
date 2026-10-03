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
 *
 * Mixing rules
 *   • duck(level, hold): overlapping ducks combine — the music follows the LOWEST active duck and only
 *     comes back (smoothly, ≈1 s) after the longest hold has ended; duck(1, x) clears them all.
 *   • every mood change, start, stop and hand-over (song ⇄ score, theme ⇄ Happy Birthday) is a fade.
 *   • sfx('scratch') briefly stops the music like a turntable losing power, then brings it back.
 *   • an uploaded song (≤ 15 MB) is analysed once in the background and trimmed toward the score's
 *     loudness (−12…+3 dB); larger files, or any failure, keep the fixed −6 dB trim.
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

/**
 * A send strip: three buses (dry/wet/delay), each with a fader and a ducker.
 * With `tape`, each bus also gets a "tape" stage (a modulated delay + its own gain) so the whole
 * strip can be slowed to a stop and silenced (the record-scratch interruption) without touching
 * the fader or the duckers: input → fade → [tape delay → stop gain] → duck → out.
 */
function makeStrip(ctx, G, initial = 1, tape = false) {
  const fade = [];
  const duck = [];
  const tapes = [];
  const stops = [];
  const bus = (dest) => {
    const input = gainNode(ctx, 1);
    const f = gainNode(ctx, initial);
    const d = gainNode(ctx, 1);
    input.connect(f);
    if (tape) {
      const dl = ctx.createDelay(0.5);
      dl.delayTime.value = 0;
      const s = gainNode(ctx, 1);
      f.connect(dl);
      dl.connect(s);
      s.connect(d);
      tapes.push(dl.delayTime);
      stops.push(s.gain);
    } else f.connect(d);
    d.connect(dest);
    fade.push(f.gain);
    duck.push(d.gain);
    return input;
  };
  return { dry: bus(G.master), wet: bus(G.reverbIn), delay: bus(G.delayIn), fade, duck, tape: tapes, stop: stops };
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
  G.music = makeStrip(ctx, G, 0, true); // silent until startTheme()
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

/**
 * Automate a FRESH param (no other events) along fn(x), x = 0..1, over [t, t + dur].
 * The param holds fn(0) until t and fn(1) afterwards.
 */
function curveAt(param, t, dur, fn, n = 96) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1));
  param.value = c[0];
  param.setValueCurveAtTime(c, t, dur);
}

/** A stereo-placed input into an effect's output (falls back to the plain input). */
function panIn(e, out, p) {
  if (!p || !e.ctx.createStereoPanner) return out.input;
  const n = e.ctx.createStereoPanner();
  n.pan.value = clamp(p, -1, 1);
  n.connect(out.input);
  out.nodes.push(n);
  return n;
}

/** An oscillator started at t and stopped at end, counted as a voice. */
function osc(e, dest, type, freq, t, end, extra = []) {
  const o = e.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(dest);
  o.start(t);
  o.stop(end);
  e.track(o, [o, ...extra]);
  return o;
}

/** Soft saturation (tanh) for the brass grit. */
let SAT_CURVE = null;
function satCurve() {
  if (!SAT_CURVE) {
    SAT_CURVE = new Float32Array(1025);
    for (let i = 0; i < 1025; i++) {
      const x = (i / 512) - 1;
      SAT_CURVE[i] = Math.tanh(1.8 * x) / Math.tanh(1.8);
    }
  }
  return SAT_CURVE;
}

// free-free bar modes, i.e. the inharmonic ring of a hanging chime tube
const TUBE_PARTIALS = [[1, 1, 1], [2.756, 0.34, 0.45], [5.404, 0.12, 0.2], [8.933, 0.035, 0.08]];

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

  /** A deep trailer "BRAAM" (for absurdly epic title reveals): growling low brass, a sub drop, a long dark tail. */
  braam(e, t, o) {
    const { ctx } = e;
    const out = fxOut(e, o, 0.62, 0, 0.9);
    const low = fxOut(e, { volume: o.volume }, 0, 0, 0.9); // sub + impact stay dry and centred
    out.nodes.push(...low.nodes);
    if (o.duck !== false && e.duck) e.duck(0.45, 1.5, t - 0.03, 0.03);
    // brass: detuned saws that scoop up into pitch → soft saturation → a resonant filter that blares open, then closes
    const drive = gainNode(ctx, 1);
    const sat = ctx.createWaveShaper();
    sat.curve = satCurve();
    sat.oversample = '2x';
    const lp = biquad(ctx, 'lowpass', 160, 2.4);
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.exponentialRampToValueAtTime(2100, t + 0.075);
    lp.frequency.setTargetAtTime(560, t + 0.1, 0.5);
    lp.frequency.setTargetAtTime(240, t + 1.3, 0.6);
    const tone = biquad(ctx, 'lowpass', 4200, 0.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.55, t + 0.035);
    env.gain.setTargetAtTime(0.32, t + 0.06, 0.35);
    env.gain.setTargetAtTime(0, t + 1.3, 0.42);
    drive.connect(sat);
    sat.connect(lp);
    lp.connect(tone);
    tone.connect(env);
    env.connect(out.input);
    out.nodes.push(drive, sat, lp, tone, env);
    const end = t + 4.6;
    for (const [n, a] of [['F1', 1], ['C2', 0.9], ['F2', 0.8], ['C3', 0.55], ['F3', 0.35]]) {
      for (const c of [-15, -5, 5, 14]) {
        const g = gainNode(ctx, a * 0.07);
        g.connect(drive);
        const s = osc(e, g, 'sawtooth', mtof(midi(n)), t, end, [g]);
        s.detune.setValueAtTime(c - 80, t);
        s.detune.linearRampToValueAtTime(c, t + 0.1);
      }
    }
    // sub: drops into a low F and sits under the brass
    const sub = ctx.createGain();
    sub.gain.setValueAtTime(0, t);
    sub.gain.linearRampToValueAtTime(0.22, t + 0.012);
    sub.gain.setTargetAtTime(0.13, t + 0.06, 0.3);
    sub.gain.setTargetAtTime(0, t + 1.3, 0.42);
    sub.connect(low.input);
    const so = osc(e, sub, 'sine', 72, t, end, [sub]);
    so.frequency.setValueAtTime(72, t);
    so.frequency.exponentialRampToValueAtTime(mtof(midi('F1')), t + 0.35);
    // impact: a dark thud and a short boom
    noiseBurst(e, low.input, t, 0.7,
      [['lowpass', 1400, 0.7, (p, t0) => { p.setValueAtTime(1600, t0); p.exponentialRampToValueAtTime(140, t0 + 0.45); }]],
      [[0.004, 0.22], [0.09, 0.075], [0.6, 0]]);
    blip(e, low.input, t, 120, 46, 0.15, 0.55);
    // air in the tail: a dark wash that mostly feeds the reverb
    noiseBurst(e, out.input, t, 3.2, [['bandpass', 420, 0.7]], [[0.06, 0.05], [1.2, 0.03], [3.1, 0]]);
    return { out, end: end + 0.2 };
  },

  /** A heavenly "aah": a choir chord blooms from the basses up to the sopranos, glows, and releases (~2.5 s). */
  choir(e, t, o) {
    const { ctx } = e;
    const S = clamp(o.duration ?? 2.5, 1.2, 6);
    const out = fxOut(e, o, 0.7, 0.14, 1.7);
    const ins = formantInsert(ctx, 2.2);
    const air = biquad(ctx, 'lowpass', 1300, 0.5); // opens as the chord blooms
    air.frequency.setValueAtTime(1300, t);
    air.frequency.exponentialRampToValueAtTime(5200, t + S * 0.45);
    air.frequency.setTargetAtTime(2000, t + S * 0.6, S * 0.25);
    const bloom = ctx.createGain();
    bloom.gain.setValueAtTime(0, t);
    bloom.gain.setTargetAtTime(1, t, S * 0.14);
    bloom.gain.setTargetAtTime(0, t + S * 0.62, S * 0.15);
    ins.out.connect(air);
    air.connect(bloom);
    bloom.connect(out.input);
    const hold = S * 0.62;
    const voices = [['F3', 0.85, 0], ['C4', 0.85, 0.02], ['F4', 0.9, 0.05], ['A4', 0.9, 0.09], ['C5', 0.95, 0.13], ['F5', 0.8, 0.18], ['A5', 0.6, 0.24]];
    for (const [n, v, dt] of voices) {
      sustain(e, ins.in, t + dt, midi(n), hold - dt, 0.04 * v, { ...CHOIR, attack: S * 0.32, release: S * 0.35 });
    }
    // a soft "oo" descant floating above, and the breath of the singers
    sustain(e, air, t + 0.3, midi('C6'), hold - 0.3, 0.012, { oscs: [['sine', -3], ['triangle', 4]], attack: S * 0.3, release: S * 0.3 });
    noiseBurst(e, ins.in, t, S, [['highpass', 900, 0.6]], [[S * 0.35, 0.03], [S * 0.65, 0.022], [S, 0]]);
    const nodes = [air, bloom];
    return { out, end: t + S + 2.2, cleanup: () => { safeDisconnect(nodes); try { ins.in.disconnect(); ins.out.disconnect(); } catch { /* gone */ } } };
  },

  /** A snare roll that swells for ~2 s and lands on an accent with a soft cymbal crash. */
  drumroll(e, t, o) {
    const { ctx } = e;
    const D = clamp(o.duration ?? 2, 0.6, 6);
    const out = fxOut(e, o, 0.2, 0, 1.2);
    // an accelerating, alternating-hand roll with a crescendo, then the accent
    const strokes = [];
    for (let x = 0, k = 0; x < D - 0.03; k++) {
      const p = x / D;
      strokes.push([x, (0.2 + 0.62 * p ** 1.5) * (k % 2 ? 0.84 : 1) * rand(0.88, 1.08), 0.034]);
      x += rand(0.95, 1.05) / (15 + 9 * p);
    }
    strokes.push([D, 1.05, 0.11]);
    // render the strokes into two gain curves (snare wires buzz longer than the shell)
    const R = 3000;
    const L = D + 0.5;
    const N = Math.ceil(L * R);
    const wires = new Float32Array(N);
    const shell = new Float32Array(N);
    for (const [x, v, tau] of strokes) {
      const i0 = Math.round(x * R);
      for (let i = i0; i < N; i++) {
        const dt = (i - i0) / R;
        const a = v * (dt < 0.0012 ? dt / 0.0012 : 1);
        const w = a * Math.exp(-dt / tau);
        if (w < 1e-4 && dt > 0.002) break;
        wires[i] += w;
        shell[i] += a * Math.exp(-dt / (tau * 0.45));
      }
    }
    wires[0] = shell[0] = wires[N - 1] = shell[N - 1] = 0;
    const src = noiseSrc(e, t, L);
    const wHP = biquad(ctx, 'highpass', 1500, 0.6);
    const wBP = biquad(ctx, 'bandpass', 4200, 0.5);
    const wG = ctx.createGain();
    wG.gain.value = 0;
    wG.gain.setValueCurveAtTime(wires, t, L);
    const wLvl = gainNode(ctx, 0.2);
    src.connect(wHP);
    wHP.connect(wBP);
    wBP.connect(wG);
    wG.connect(wLvl);
    wLvl.connect(out.input);
    const hBP = biquad(ctx, 'bandpass', 1000, 1.2);
    const sG = ctx.createGain();
    sG.gain.value = 0;
    sG.gain.setValueCurveAtTime(shell, t, L);
    const sLvl = gainNode(ctx, 0.14);
    src.connect(hBP);
    hBP.connect(sLvl);
    sLvl.connect(sG);
    const body = gainNode(ctx, 1);
    body.connect(sG);
    sG.connect(out.input);
    const shellTone = gainNode(ctx, 0.018); // the drum's shell: two membrane modes (1 : 1.59), kept low
    shellTone.connect(body);
    osc(e, shellTone, 'triangle', 182, t, t + L, [shellTone]);
    osc(e, shellTone, 'sine', 290, t, t + L);
    e.track(src, [src, wHP, wBP, wG, wLvl, hBP, sLvl, body, sG]);
    blip(e, out.input, t + D, 150, 92, 0.1, 0.12, 'sine', 0.0015); // weight under the accent
    // a soft crash: an inharmonic square cluster (the bronze) + a high noise wash, mallet-soft attack
    const ct = t + D + 0.004;
    const cym = panIn(e, out, 0.28);
    const metal = ctx.createGain();
    metal.gain.setValueAtTime(0, ct);
    metal.gain.linearRampToValueAtTime(0.05, ct + 0.012);
    metal.gain.exponentialRampToValueAtTime(5e-6, ct + 2.2);
    const mHP = biquad(ctx, 'highpass', 5200, 0.7);
    mHP.connect(metal);
    metal.connect(cym);
    out.nodes.push(mHP, metal);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) osc(e, mHP, 'square', f * 1.42, ct, ct + 2.25);
    noiseBurst(e, cym, ct, 2.25, [['highpass', 4200, 0.6], ['lowpass', 12000, 0.5]], [[0.015, 0.11], [0.25, 0.05], [1.0, 0.012], [2.1, 0]]);
    return { out, end: ct + 2.4 };
  },

  /**
   * A comedic record scratch: the needle drags (forward, back, a nudge) while the music grinds to a halt;
   * the music comes back ~1 s later (pass {interrupt: false} for the scratch alone).
   */
  scratch(e, t, o) {
    const { ctx } = e;
    const out = fxOut(e, o, 0.16, 0, 1);
    if (o.interrupt !== false && e.interruptMusic) e.interruptMusic(t, { silence: o.silence ?? 0.95 });
    const strokes = [[0, 0.07, 2.5], [0.07, 0.17, 1.7], [0.24, 0.06, 1.0]]; // [start, length, peak speed]
    const D = 0.3;
    const speed = (x) => {
      const s = x * D;
      for (const [a, d, pk] of strokes) if (s >= a && s <= a + d) return pk * Math.sin((Math.PI * (s - a)) / d) ** 1.25;
      return 0;
    };
    const amp = (x) => (speed(x) / 2.5) ** 0.7;
    const n = 240;
    const stop = t + D + 0.02;
    // the groove: a buzzy low chord whose pitch and brightness follow the hand
    const lp = biquad(ctx, 'lowpass', 300, 1.6);
    curveAt(lp.frequency, t, D, (x) => 280 + 1700 * speed(x), n);
    const tg = ctx.createGain();
    curveAt(tg.gain, t, D, (x) => 0.065 * amp(x), n);
    lp.connect(tg);
    tg.connect(out.input);
    out.nodes.push(lp, tg);
    for (const [ratio, type] of [[1, 'sawtooth'], [1.5, 'square'], [2.01, 'sawtooth']]) {
      const s = osc(e, lp, type, 30, t, stop);
      curveAt(s.frequency, t, D, (x) => 30 + 160 * ratio * speed(x), n);
    }
    // the scrape of the needle in the groove
    const src = noiseSrc(e, t, D + 0.02);
    const bp = biquad(ctx, 'bandpass', 1000, 1.3);
    curveAt(bp.frequency, t, D, (x) => 450 + 2400 * speed(x), n);
    const ng = ctx.createGain();
    curveAt(ng.gain, t, D, (x) => 0.4 * amp(x), n);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(out.input);
    e.track(src, [src, bp, ng]);
    blip(e, out.input, t + D + 0.01, 160, 70, 0.05, 0.09); // the needle lifts
    return { out, end: t + D + 0.4 };
  },

  /** A tasteful cartoon skillet "clang": an inharmonic ring with a shiver (vibrato + tremolo) that settles. */
  clang(e, t, o) {
    const { ctx } = e;
    const out = fxOut(e, o, 0.3, 0.05, 1.6);
    const f0 = o.note ? mtof(midi(o.note)) : 311; // ~Eb4: low enough to read as a pan, not a bell
    const ring = gainNode(ctx, 1);
    const tone = biquad(ctx, 'lowpass', 6000, 0.5);
    ring.connect(tone);
    tone.connect(out.input);
    out.nodes.push(ring, tone);
    const end = t + 2.6;
    const trem = lfo(ctx, 5.4, 0);
    trem.gain.setValueAtTime(0.38, t);
    trem.gain.setTargetAtTime(0, t + 0.12, 0.45);
    trem.connect(ring.gain);
    trem.osc.stop(end);
    e.track(trem.osc, [trem.osc, trem]);
    const vib = lfo(ctx, 6.6, 0);
    vib.gain.setValueAtTime(26, t);
    vib.gain.setTargetAtTime(0, t + 0.08, 0.4);
    vib.osc.stop(end);
    e.track(vib.osc, [vib.osc, vib]);
    // [ratio, amplitude, decay]; the close pairs beat against each other like a real pan
    const modes = [[1, 1, 1.6], [1.0085, 0.5, 1.4], [1.594, 0.42, 0.95], [2.136, 0.34, 0.7], [2.17, 0.2, 0.62], [2.98, 0.24, 0.45], [4.06, 0.13, 0.3], [5.42, 0.07, 0.18]];
    for (const [r, a, d] of modes) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a * 0.055, t + 0.0015);
      g.gain.exponentialRampToValueAtTime(a * 0.055 * 1e-4, t + 0.0015 + d * 1.5);
      g.connect(ring);
      const s = osc(e, g, 'sine', f0 * r, t, t + d * 1.5 + 0.03, [g]);
      vib.connect(s.detune);
    }
    noiseBurst(e, out.input, t, 0.06, [['bandpass', 2800, 0.8]], [[0.001, 0.16], [0.03, 0]]); // the strike
    blip(e, out.input, t, 190, 120, 0.14, 0.1, 'sine', 0.001); // the "bonk" of the body
    return { out, end: end + 0.1 };
  },

  /** A soft night breeze that swells and passes: two drifting noise bands (L/R) and a faint whistle. */
  wind(e, t, o) {
    const { ctx } = e;
    const D = clamp(o.duration ?? 3, 1.2, 10);
    const out = fxOut(e, o, 0.3, 0, 1);
    const shape = (x, ph) => {
      const swell = x < 0.42 ? Math.sin((Math.PI / 2) * (x / 0.42)) ** 2 : Math.cos((Math.PI / 2) * ((x - 0.42) / 0.58)) ** 2;
      return swell * (1 + 0.28 * Math.sin(2 * Math.PI * 1.15 * D * x + ph) * Math.sin(Math.PI * x));
    };
    for (const [pan, ph, a] of [[-0.5, 0, 1], [0.5, 2.1, 0.9]]) {
      const src = noiseSrc(e, t, D + 0.05);
      const bp = biquad(ctx, 'bandpass', 400, 0.6);
      curveAt(bp.frequency, t, D, (x) => 320 + 380 * Math.sin(Math.PI * x) ** 1.5 + 70 * Math.sin(2 * Math.PI * 0.9 * D * x + ph), 64);
      const lp = biquad(ctx, 'lowpass', 1500, 0.5);
      const hp = biquad(ctx, 'highpass', 140, 0.6);
      const g = ctx.createGain();
      curveAt(g.gain, t, D, (x) => a * 0.26 * shape(x, ph), 128);
      src.connect(bp);
      bp.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(panIn(e, out, pan));
      e.track(src, [src, bp, hp, lp, g]);
    }
    const ws = noiseSrc(e, t, D + 0.05);
    const wb = biquad(ctx, 'bandpass', 1100, 11);
    curveAt(wb.frequency, t, D, (x) => 950 + 420 * Math.sin(Math.PI * x * 0.9) + 60 * Math.sin(2 * Math.PI * 1.7 * D * x), 96);
    const wg = ctx.createGain();
    curveAt(wg.gain, t, D, (x) => 0.22 * shape(x, 1) ** 1.6, 128);
    ws.connect(wb);
    wb.connect(wg);
    wg.connect(panIn(e, out, 0.15));
    e.track(ws, [ws, wb, wg]);
    return { out, end: t + D + 0.2 };
  },

  /** A light wind-chime cascade: tuned tubes brushed by a breeze, sweeping across the stereo field. */
  bells(e, t, o) {
    const out = fxOut(e, o, 0.55, 0.28, 1.6);
    const tubes = penta(midi('C6'), midi('D7')); // C6 D6 F6 G6 A6 C7 D7
    const n = tubes.length;
    const pans = tubes.map((_, i) => panIn(e, out, -0.6 + (1.2 * i) / (n - 1)));
    const hit = (dt, i, vel) => strike(e, pans[i], t + dt, tubes[i], vel, { gain: 0.13, decay: rand(1.4, 2.0), partials: TUBE_PARTIALS, attack: 0.0015, optional: 'hard' });
    // a brush down (or up) the row, a little rebound, then a few strays
    const down = Math.random() < 0.6;
    for (let k = 0; k < n; k++) hit(0.075 * k * rand(0.85, 1.15), down ? n - 1 - k : k, rand(0.26, 0.38));
    const mid = (n / 2) | 0;
    [0.62, 0.74, 0.86].forEach((dt, k) => hit(dt + rand(0, 0.03), clamp(mid + (down ? k - 1 : 1 - k), 0, n - 1), 0.2 - k * 0.03));
    for (let k = 0; k < 3; k++) hit(rand(0.95, 1.35), (Math.random() * n) | 0, rand(0.08, 0.15));
    noiseBurst(e, out.input, t, 0.4, [['highpass', 6000, 0.7]], [[0.05, 0.012], [0.35, 0]]); // the breeze on the tubes
    return { out, end: t + 3.6 };
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
    // a mood set while the theme is still fading in takes over almost immediately; an audible
    // theme always crossfades (even with fade 0) — only a silent mixer may jump
    const audible = theme.playing && !theme.paused;
    const early = audible && t - theme.startedAt < 1.5;
    const tau = fade === 0 ? (audible ? 0.12 : 0.02) : early ? 0.25 : Math.max(0.12, (fade ?? 2.8) / 3);
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

  /*
   * Ducking. Every duck() adds an entry {level, from, until}; the music follows the LOWEST active
   * entry and only comes back when the longest hold has ended. Each change is one setTargetAtTime
   * (sample-accurate, so no zipper noise): falls use the entry's attack, rises a slow release
   * (≈1.2 s to 95 %). duck(1, x) clears every entry.
   */
  const DUCK_RELEASE = 0.4;
  const ducks = [];
  const duckLevelAt = (time) => {
    let l = 1;
    for (const d of ducks) if (d.from <= time && time < d.until) l = Math.min(l, d.level);
    return l;
  };
  const duckAttackAt = (time) => {
    let a = 0.08;
    for (const d of ducks) if (d.from <= time && time < d.until) a = Math.min(a, d.attack);
    return a;
  };
  function applyDucks() {
    const t = now();
    for (let i = ducks.length - 1; i >= 0; i--) if (ducks[i].until <= t) ducks.splice(i, 1);
    const marks = [...new Set(ducks.flatMap((d) => [d.from, d.until]))].filter((m) => m > t).sort((a, b) => a - b);
    const l0 = duckLevelAt(t);
    for (const p of G.music.duck) {
      const cur = p.value;
      hold(p, t);
      p.setTargetAtTime(l0, t, l0 < cur - 1e-4 ? duckAttackAt(t) : DUCK_RELEASE);
      let prev = l0;
      for (const m of marks) {
        const l = duckLevelAt(m);
        if (Math.abs(l - prev) < 1e-6) continue;
        p.setTargetAtTime(l, m, l < prev ? duckAttackAt(m) : DUCK_RELEASE);
        prev = l;
      }
    }
  }
  /** duck(level 0..1, holdSeconds) — public. `at` (context time) and `attack` (τ) are for effects. */
  function duck(amount = 0.35, seconds = 1.2, at, attack) {
    const t = now();
    const a = clamp(Number.isFinite(+amount) ? +amount : 0.35, 0, 1);
    const s = Math.max(0, Number.isFinite(+seconds) ? +seconds : 1.2);
    if (a >= 0.999) ducks.length = 0;
    else {
      const from = Math.max(t, Number.isFinite(at) ? at : t);
      ducks.push({ level: a, from, until: from + 0.2 + s, attack: clamp(attack ?? 0.08, 0.01, 0.5) });
    }
    applyDucks();
  }

  /*
   * The record-scratch interruption: the whole music strip slows to a stop like a turntable losing
   * power (a delay whose time grows as t²/2 → pitch falls linearly to zero) while its own gain closes,
   * stays silent, then comes back with a smooth fade. Independent of the fader and the duckers.
   */
  const tape = { lockedUntil: 0 };
  function interruptMusic(at, o = {}) {
    const t = Math.max(now() + 0.005, Number.isFinite(at) ? at : 0);
    if (t < tape.lockedUntil) return false; // already stopping / silent: let that one play out
    const Ts = clamp(o.stop ?? 0.26, 0.08, 0.45);
    const tReset = t + Ts + 0.08;
    const tResume = Math.max(tReset + 0.02, t + (o.silence ?? 0.95));
    const K = 40;
    for (const p of G.music.tape) {
      hold(p, t);
      p.setValueAtTime(0, t);
      for (let i = 1; i <= K; i++) {
        const x = i / K;
        p.linearRampToValueAtTime((Ts * x * x) / 2, t + Ts * x);
      }
      p.setValueAtTime(0, tReset); // rewind while silent
    }
    for (const p of G.music.stop) {
      const g0 = clamp(p.value, 0, 1);
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        p.setValueAtTime(g0, t);
      }
      for (let i = 1; i <= 16; i++) {
        const x = i / 16;
        p.linearRampToValueAtTime(i === 16 ? 0 : g0 * Math.cos((x * Math.PI) / 2) ** 0.7, t + Ts * x);
      }
      p.setTargetAtTime(1, tResume, clamp(o.release ?? 0.3, 0.2, 1)); // ≈0.9 s back to full
    }
    tape.lockedUntil = tReset + 0.005;
    return true;
  }

  /** Loudness trim for an uploaded song (dB, from the analysis in createAudio), applied smoothly. */
  function setMusicTrim(db, tau = 0.8) {
    const g = 10 ** (clamp(Number(db) || 0, -24, 6) / 20);
    L.custom.target = g;
    glide(L.custom.out.gain, g, now(), tau);
  }

  function happyBirthday() {
    if (hb.active) return hb.promise;
    const t = now();
    hb.active = true;
    theme.paused = true;
    fadeStrip(G.music, 0, t, 0.3);
    if (usingCustom()) addTimer(t + 2, () => { if (hb.active) custom.el.pause(); });
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
    fadeStrip(G.music, 0, t, 0.45); // ≈1.4 s fade-out
    if (HBL) {
      const old = HBL;
      HBL = null;
      for (const l of Object.values(old)) glide(l.out.gain, 0, t, 0.3);
      addTimer(t + 2.5, () => retire(old));
    }
    queue.length = 0;
    // pause the song only once it is inaudible (−58 dB)
    if (custom.el) addTimer(t + 3, () => { if (!theme.playing && custom.el) custom.el.pause(); });
    if (drone) stopDrone(t + 1.5);
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
      // the score takes over: dip the strip (only a drone could be sounding) and fade the score in
      const t = now();
      theme.nextTime = t + 0.25;
      theme.tempo = theme.targetTempo;
      theme.startedAt = t;
      for (const p of G.music.fade) {
        hold(p, t);
        p.setTargetAtTime(0, t, 0.04);
        p.setTargetAtTime(1, t + 0.22, 1.0);
      }
    }
  }

  setMood('tender', 0);

  Object.assign(e, {
    layers: L, theme, hb, custom,
    setMood, startTheme, duck, happyBirthday, sfx, stop,
    pump, runTimers, attachMedia, playMedia, mediaFailed,
    interruptMusic, setMusicTrim,
    setVolume(v, instant) { glide(G.volume.gain, clamp(v, 0, 1), now(), instant ? 0.005 : 0.08); },
    setMuted(m, instant) { glide(G.mute.gain, m ? 0 : 1, now(), instant ? 0.005 : 0.08); },
    onHidden() { if (custom.el && !custom.el.paused) custom.el.pause(); },
    onVisible() { if (usingCustom() && theme.playing && !theme.paused) playMedia(); },
  });
  Object.defineProperties(e, {
    hbLayers: { get: () => HBL },
    mood: { get: () => theme.mood },
    duckLevel: { get: () => duckLevelAt(now()) },
    activeDucks: { get: () => ducks.filter((d) => d.until > now()).map((d) => ({ ...d })) },
    themePlaying: { get: () => theme.playing && !theme.paused },
  });
  return e;
}

/* ───────────────── loudness (for an owner-uploaded song) ─────────────── */

const MUSIC_ANALYSE_MAX_BYTES = 15 * 1024 * 1024; // bigger files keep the fixed trim
// Calibrated offline: the score's loudest stretch measures ≈ −23 (tender), −21 (wonder/festive), −16 LUFS
// (soar); with the CUSTOM_MOODS gains and the song path (+0.75 dB incl. its reverb send), a song whose
// loudest minute sits at −19 LUFS before the mood gain matches the score mood for mood (±1.5 dB).
const MUSIC_TARGET_LUFS = -19;
const MUSIC_TRIM_RANGE = [-12, 3]; // dB

/** RBJ biquad coefficients [b0, b1, b2, a1, a2] (normalised). */
function rbj(type, sr, f0, q, gainDb = 0) {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * f0) / sr;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highpass') {
    b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  } else { // high shelf
    const sq = 2 * Math.sqrt(A) * al;
    b0 = A * (A + 1 + (A - 1) * cs + sq); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - sq);
    a0 = A + 1 - (A - 1) * cs + sq; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - sq;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/**
 * K-weighted loudness (ITU-R BS.1770 filters, ungated) of the loudest `window`-second stretch of an
 * AudioBuffer, in LUFS. Mono counts as dual-mono. Pass `pause` (an async function) to yield to the
 * main thread between chunks. → { lufs, whole, start, seconds }
 */
export async function measureLoudness(buffer, { window = 60, block = 0.1, pause = null } = {}) {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const chans = Math.min(2, buffer.numberOfChannels);
  const hop = Math.max(1, Math.round(sr * block));
  const nb = Math.ceil(n / hop);
  const power = new Float64Array(nb);
  const [s, h] = [rbj('shelf', sr, 1681.97, 0.7072, 4), rbj('highpass', sr, 38.135, 0.5003)];
  const CHUNK = 1 << 17;
  for (let c = 0; c < chans; c++) {
    const x = buffer.getChannelData(c);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0;
    for (let i0 = 0; i0 < n; i0 += CHUNK) {
      const i1 = Math.min(n, i0 + CHUNK);
      for (let i = i0; i < i1; i++) {
        const v = x[i];
        const y = s[0] * v + s[1] * x1 + s[2] * x2 - s[3] * y1 - s[4] * y2;
        x2 = x1; x1 = v;
        const z = h[0] * y + h[1] * y1 + h[2] * y2 - h[3] * z1 - h[4] * z2;
        y2 = y1; y1 = y;
        z2 = z1; z1 = z;
        power[(i / hop) | 0] += z * z;
      }
      if (pause) await pause();
    }
  }
  const k = chans === 1 ? 2 : 1;
  const W = Math.max(1, Math.min(nb, Math.round(window / block)));
  let sum = 0;
  let best = -1;
  let bestAt = 0;
  let total = 0;
  for (let b = 0; b < nb; b++) {
    sum += power[b];
    total += power[b];
    if (b >= W) sum -= power[b - W];
    if (b >= W - 1 && sum > best) { best = sum; bestAt = b - W + 1; }
  }
  const len = Math.min(n, W * hop);
  const lufs = (p, m) => -0.691 + 10 * Math.log10((k * p) / Math.max(1, m) + 1e-20);
  return { lufs: lufs(best, len), whole: lufs(total, n), start: (bestAt * hop) / sr, seconds: n / sr };
}

/** Fetch at most `max` bytes (null if the file is bigger, or on any failure). */
async function fetchCapped(url, max, cache = 'default') {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const res = await fetch(url, { cache, ...(ac ? { signal: ac.signal } : {}) });
  if (!res.ok) return null;
  if (Number(res.headers.get('content-length') || 0) > max) {
    if (ac) ac.abort();
    return null;
  }
  if (!res.body || !res.body.getReader) {
    const ab = await res.arrayBuffer();
    return ab.byteLength > max ? null : ab;
  }
  const reader = res.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      try { reader.cancel(); } catch { /* ignore */ }
      if (ac) ac.abort();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.byteLength; }
  return all.buffer;
}

/** decodeAudioData for promise and callback-only (old WebKit) implementations. */
function decodeAudio(c, ab) {
  return new Promise((resolve, reject) => {
    try {
      const p = c.decodeAudioData(ab, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    } catch (err) { reject(err); }
  });
}

/** A small offline context to decode into (low rate = less memory); falls back to the live one. */
function analysisContext(fallback) {
  const OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (OAC) {
    for (const sr of [16000, 22050, 44100]) {
      try { return new OAC(1, 1, sr); } catch { /* try the next rate */ }
    }
  }
  return fallback;
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
  // loudness normalisation of the uploaded song: status none → analysing → done | skipped | failed
  const music = { status: 'none', lufs: null, trimDb: null, bytesMax: MUSIC_ANALYSE_MAX_BYTES };
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
      else mediaEl.addEventListener('canplay', () => setTimeout(scheduleAnalysis, 600), { once: true });
    } catch (err) {
      console.warn('[audio] custom music unavailable', err);
      mediaEl = null;
    }
  }

  /*
   * Loudness normalisation: decode a fetched copy of the song once (≤ 15 MB), find its loudest
   * minute and trim it toward the score's level (−12…+3 dB). Runs in the background in small
   * chunks; playback never waits for it, and any failure just keeps the fixed −6 dB trim.
   *
   * When to fetch the copy: shortly after the element can play (so it starts first, and a file that
   * failed to load is never fetched again). If the element already holds the whole file, the copy
   * comes from the HTTP cache; otherwise it is a separate 'no-store' request, which never waits on —
   * or holds up — the element's own (cache-locked, range) request.
   */
  function scheduleAnalysis() {
    const el = mediaEl;
    if (!el || el.error || music.status !== 'none') return;
    const d = el.duration;
    const b = el.buffered;
    const full = Number.isFinite(d) && d > 0 && b && b.length > 0 && b.start(0) <= 0.5 && b.end(b.length - 1) >= d - 0.5;
    analyseMusic(full ? 'force-cache' : 'no-store');
  }

  async function analyseMusic(cache) {
    if (music.status !== 'none' || options.normalize === false || typeof fetch === 'undefined') return;
    if (typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData) {
      music.status = 'skipped'; // don't download the song twice on a metered connection
      return;
    }
    music.status = 'analysing';
    try {
      const ab = await fetchCapped(musicUrl, MUSIC_ANALYSE_MAX_BYTES, cache);
      if (!ab) { music.status = 'skipped'; return; }
      const buf = await decodeAudio(analysisContext(ctx), ab);
      const pause = () => new Promise((r) => setTimeout(r, 0));
      const r = await measureLoudness(buf, { window: 60, pause });
      if (!Number.isFinite(r.lufs) || r.lufs < -70) { music.status = 'skipped'; return; }
      music.lufs = Math.round(r.lufs * 10) / 10;
      music.trimDb = Math.round(clamp(MUSIC_TARGET_LUFS - r.lufs, MUSIC_TRIM_RANGE[0], MUSIC_TRIM_RANGE[1]) * 10) / 10;
      music.status = 'done';
      if (eng && mediaEl) eng.setMusicTrim(music.trimDb);
    } catch (err) {
      music.status = 'failed';
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
    /** duck(level, holdSeconds, fadeSeconds?): fadeSeconds slows the fall (up to ~1.5 s), for a fade into silence. */
    duck(amount = 0.35, seconds = 1.2, fade) {
      if (eng) eng.duck(amount, seconds, undefined, Number.isFinite(fade) ? fade / 3 : undefined);
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
    /** loudness analysis of the uploaded song: {status, lufs, trimDb} */
    get musicLevel() { return { status: music.status, lufs: music.lufs, trimDb: music.trimDb }; },
    stop() {
      wantTheme = false;
      if (eng) eng.stop();
    },
  };
}
