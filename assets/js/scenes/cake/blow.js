// Breath ("blow") detection from the microphone — deliberately conservative.
//
// A blow into a phone mic is loud, broadband, unpitched wind noise whose energy
// sits mostly below ~1.2 kHz. Every animation frame we read the AnalyserNode:
//   rms      — time-domain loudness (full scale = 1)
//   lowDb    — mean power 40–1200 Hz, compared with the ambient baseline
//   lowFrac  — share of 40–6000 Hz power that lies below 1200 Hz
//   flatness — spectral flatness (geometric / arithmetic mean) over 100–1500 Hz;
//              voiced speech, singing and music are harmonic (low flatness),
//              wind/breath noise is not
//   peak     — max bin / mean power over 80–2000 Hz (rejects pure tones)
// The ambient baseline is calibrated for ~0.7 s, then drifts slowly (and falls
// quickly, so a blow during calibration cannot poison it). A frame "counts"
// only when every gate passes; a blow is >= 150 ms of counting frames
// (tiny dropouts tolerated). Output: a smoothed intensity 0..1, plus a raw
// `level` (loudness above ambient) used to make the flames react before any
// candle goes out.

export const BLOW = {
  calibrateSec: 0.7,
  minRms: 0.04,          // absolute RMS floor
  rmsOverBase: 3.5,      // ...and >= 3.5x the ambient RMS
  lowRiseDb: 12,         // low band must rise >= 12 dB over ambient
  minLowFrac: 0.62,      // >= 62% of the energy below 1.2 kHz
  minFlatness: 0.22,     // breath/wind ≈ 0.3–0.6; voiced speech/music ≈ 0.02–0.15
  maxPeakiness: 18,      // breath ≈ 3–10; a pure tone ≈ 40+
  sustainSec: 0.15,      // >= 150 ms
  dropoutSec: 0.08,
  attack: 0.06, release: 0.22,
};

export class BlowDetector {
  constructor({ sharedContext = null } = {}) {
    this.shared = sharedContext;
    this.ac = null; this.ownAc = false;
    this.stream = null; this.src = null; this.an = null;
    this.state = 'idle'; // idle | starting | calibrating | listening | stopped
    this.base = { rms: 0, lowDb: -120 };
    this.cal = [];
    this.calT = 0; this.run = 0; this.quiet = 0;
    this.intensity = 0; this.level = 0; this.active = false;
    this.lastHeard = 0; this.listenT = 0;
  }

  static supported() {
    return !!(window.isSecureContext !== false && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  }

  // Call straight from the tap handler: the AudioContext is created/resumed and
  // getUserMedia is requested synchronously inside the user gesture (iOS needs it).
  async start(signal) {
    this.state = 'starting';
    let ac = this.shared;
    if (!ac || ac.state === 'closed') {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC(); this.ownAc = true;
    }
    this.ac = ac;
    const resumed = ac.state === 'suspended' ? ac.resume().catch(() => {}) : null;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (signal?.aborted || this.state === 'stopped') {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException('Aborted', 'AbortError');
    }
    this.stream = stream;
    if (resumed) await resumed;
    if (this.state === 'stopped') { this.stop(); throw new DOMException('Aborted', 'AbortError'); }
    this.src = ac.createMediaStreamSource(stream);
    this.an = ac.createAnalyser();
    this.an.fftSize = 2048;
    this.an.smoothingTimeConstant = 0.2;
    this.src.connect(this.an); // analysis only — never routed to the speakers
    this.td = new Float32Array(this.an.fftSize);
    this.fd = new Float32Array(this.an.frequencyBinCount);
    const hz = ac.sampleRate / this.an.fftSize;
    const bin = (f) => Math.max(1, Math.min(this.fd.length - 1, Math.round(f / hz)));
    this.b = { low0: bin(40), low1: bin(1200), all1: bin(6000), fl0: bin(100), fl1: bin(1500), pk0: bin(80), pk1: bin(2000) };
    this.state = 'calibrating';
    this.calT = 0;
  }

  measure() {
    const an = this.an, b = this.b;
    if (an.getFloatTimeDomainData) an.getFloatTimeDomainData(this.td);
    else { const u = new Uint8Array(this.td.length); an.getByteTimeDomainData(u); for (let i = 0; i < u.length; i++) this.td[i] = (u[i] - 128) / 128; }
    let s = 0;
    for (let i = 0; i < this.td.length; i++) s += this.td[i] * this.td[i];
    const rms = Math.sqrt(s / this.td.length);
    an.getFloatFrequencyData(this.fd);
    const p = (i) => Math.pow(10, Math.max(-160, this.fd[i]) / 10);
    let low = 0, all = 0;
    for (let i = b.low0; i <= b.all1; i++) { const v = p(i); all += v; if (i <= b.low1) low += v; }
    let lnSum = 0, sum = 0, nF = 0;
    for (let i = b.fl0; i <= b.fl1; i++) { const v = p(i) + 1e-14; lnSum += Math.log(v); sum += v; nF++; }
    const flatness = Math.exp(lnSum / nF) / (sum / nF);
    let mx = 0, mean = 0;
    for (let i = b.pk0; i <= b.pk1; i++) { const v = p(i); mean += v; if (v > mx) mx = v; }
    mean /= (b.pk1 - b.pk0 + 1);
    return {
      rms,
      lowDb: 10 * Math.log10(low / (b.low1 - b.low0 + 1) + 1e-14),
      lowFrac: low / (all + 1e-14),
      flatness,
      peak: mx / (mean + 1e-14),
    };
  }

  // Call every frame with the frame delta (seconds). Returns intensity 0..1.
  update(dt) {
    if (!this.an || (this.state !== 'calibrating' && this.state !== 'listening')) return 0;
    const m = this.measure();
    const B = BLOW;
    if (this.state === 'calibrating') {
      this.calT += dt;
      this.cal.push(m);
      this.level = 0;
      if (this.calT >= B.calibrateSec) {
        // ignore the loudest third (a cough or a tap while calibrating)
        const rs = this.cal.map((c) => c.rms).sort((a, b) => a - b);
        const ls = this.cal.map((c) => c.lowDb).sort((a, b) => a - b);
        const k = Math.max(1, Math.floor(rs.length * 0.66));
        this.base.rms = rs.slice(0, k).reduce((a, v) => a + v, 0) / k;
        this.base.lowDb = ls.slice(0, k).reduce((a, v) => a + v, 0) / k;
        this.cal = [];
        this.state = 'listening';
        this.listenT = 0;
      }
      return 0;
    }
    this.listenT += dt;
    const thr = Math.max(B.minRms, this.base.rms * B.rmsOverBase);
    const rise = m.lowDb - this.base.lowDb;
    const loud = m.rms > thr;
    const gates = loud && rise > B.lowRiseDb && m.lowFrac > B.minLowFrac && m.flatness > B.minFlatness && m.peak < B.maxPeakiness;
    // raw breath level for the flames' live reaction (noise-like input only)
    const noiseLike = m.flatness > B.minFlatness * 0.8 && m.peak < B.maxPeakiness * 1.3;
    this.level = noiseLike ? Math.max(0, Math.min(1, (m.rms - this.base.rms * 1.6) / 0.1)) : this.level * 0.85;
    let score = 0;
    if (gates) {
      score = Math.min(1, 0.3 + (m.rms - thr) / 0.25 + Math.max(0, rise - B.lowRiseDb) / 60);
      this.run += dt; this.quiet = 0;
    } else {
      this.quiet += dt;
      if (this.quiet > B.dropoutSec) this.run = 0;
      if (this.run === 0) {
        const kd = Math.min(1, dt * 2.0), ku = Math.min(1, dt * 0.12);
        const tr = Math.min(m.rms, this.base.rms * 1.5 + 1e-4), tl = Math.min(m.lowDb, this.base.lowDb + 3);
        this.base.rms += (tr - this.base.rms) * (tr < this.base.rms ? kd : loud ? 0 : ku);
        this.base.lowDb += (tl - this.base.lowDb) * (tl < this.base.lowDb ? kd : loud ? 0 : ku);
      }
    }
    this.active = this.run >= B.sustainSec;
    const target = this.active ? Math.max(score, 0.25) : 0;
    const tau = target > this.intensity ? B.attack : B.release;
    this.intensity += (target - this.intensity) * Math.min(1, dt / tau);
    if (this.active) this.lastHeard = this.listenT;
    this.last = { ...m, thr, rise, score, gates };
    return this.intensity;
  }

  stop() {
    this.state = 'stopped';
    try { this.src && this.src.disconnect(); } catch (e) { /* ignore */ }
    try { this.an && this.an.disconnect(); } catch (e) { /* ignore */ }
    if (this.stream) this.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } });
    if (this.ownAc && this.ac && this.ac.state !== 'closed') { try { this.ac.close(); } catch (e) { /* ignore */ } }
    this.src = this.an = this.stream = null;
    this.ac = null;
    this.intensity = 0; this.active = false; this.level = 0;
  }
}
