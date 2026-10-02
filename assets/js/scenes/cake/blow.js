// Breath ("blow") detection from the microphone.
//
// Approach: an AnalyserNode gives time-domain samples (RMS loudness) and a
// spectrum. Blowing into a phone mic is loud, broadband, low-frequency wind
// noise: we measure the RMS and the power below ~1.2 kHz relative to a
// calibrated ambient baseline (0.5 s), reject strongly tonal input (a beep,
// a sung note, music) with a spectral "peakiness" test, and require the
// condition to hold for >= 120 ms before calling it a blow. The result is a
// smoothed 0..1 intensity.

export const BLOW = {
  calibrateSec: 0.5,
  minRms: 0.03,          // absolute floor for the RMS gate (full scale = 1)
  rmsOverBase: 3.0,      // ...and at least 3x the ambient RMS
  lowRiseDb: 10,         // low band (<1.2 kHz) must rise >= 10 dB over ambient
  maxPeakiness: 60,      // max-bin / mean power in 80–2000 Hz; tones are far peakier
  sustainSec: 0.12,      // >= 120 ms of continuous blowing
  dropoutSec: 0.09,      // tolerate tiny gaps inside a blow
  attack: 0.06, release: 0.2,
};

export class BlowDetector {
  constructor({ sharedContext = null } = {}) {
    this.shared = sharedContext;
    this.ac = null; this.ownAc = false;
    this.stream = null; this.src = null; this.an = null;
    this.state = 'idle'; // idle | starting | calibrating | listening | stopped
    this.base = { rms: 0, lowDb: -120, n: 0, sumRms: 0, sumLow: 0 };
    this.calT = 0; this.run = 0; this.quiet = 0;
    this.intensity = 0; this.level = 0; this.active = false;
    this.lastHeard = 0; this.listenT = 0;
  }

  static supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  }

  // Must be called from a user gesture (tap) so getUserMedia + resume are allowed.
  async start(signal) {
    this.state = 'starting';
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (signal?.aborted || this.state === 'stopped') { stream.getTracks().forEach((t) => t.stop()); throw new DOMException('Aborted', 'AbortError'); }
    this.stream = stream;
    let ac = this.shared;
    if (!ac || ac.state === 'closed') {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC(); this.ownAc = true;
    }
    this.ac = ac;
    if (ac.state === 'suspended') { try { await ac.resume(); } catch (e) { /* ignore */ } }
    this.src = ac.createMediaStreamSource(stream);
    this.an = ac.createAnalyser();
    this.an.fftSize = 2048;
    this.an.smoothingTimeConstant = 0.15;
    this.src.connect(this.an);
    this.td = new Float32Array(this.an.fftSize);
    this.fd = new Float32Array(this.an.frequencyBinCount);
    const hz = ac.sampleRate / this.an.fftSize;
    this.binLow = [Math.max(1, Math.round(40 / hz)), Math.round(1200 / hz)];
    this.binPk = [Math.max(1, Math.round(80 / hz)), Math.round(2000 / hz)];
    this.state = 'calibrating';
    this.calT = 0;
  }

  measure() {
    const an = this.an;
    if (an.getFloatTimeDomainData) an.getFloatTimeDomainData(this.td);
    else { const b = new Uint8Array(this.td.length); an.getByteTimeDomainData(b); for (let i = 0; i < b.length; i++) this.td[i] = (b[i] - 128) / 128; }
    let s = 0;
    for (let i = 0; i < this.td.length; i++) s += this.td[i] * this.td[i];
    const rms = Math.sqrt(s / this.td.length);
    an.getFloatFrequencyData(this.fd);
    let low = 0;
    for (let i = this.binLow[0]; i <= this.binLow[1]; i++) low += Math.pow(10, this.fd[i] / 10);
    low /= (this.binLow[1] - this.binLow[0] + 1);
    let mx = 0, mean = 0;
    for (let i = this.binPk[0]; i <= this.binPk[1]; i++) { const p = Math.pow(10, this.fd[i] / 10); mean += p; if (p > mx) mx = p; }
    mean /= (this.binPk[1] - this.binPk[0] + 1);
    return { rms, lowDb: 10 * Math.log10(low + 1e-12), peak: mx / (mean + 1e-12) };
  }

  // Call every frame. Returns the smoothed intensity 0..1.
  update(dt) {
    if (!this.an || (this.state !== 'calibrating' && this.state !== 'listening')) return 0;
    const m = this.measure();
    const B = BLOW;
    if (this.state === 'calibrating') {
      this.calT += dt;
      this.base.n++; this.base.sumRms += m.rms; this.base.sumLow += m.lowDb;
      this.level = 0;
      if (this.calT >= B.calibrateSec) {
        this.base.rms = this.base.sumRms / this.base.n;
        this.base.lowDb = this.base.sumLow / this.base.n;
        this.state = 'listening';
        this.listenT = 0;
      }
      return 0;
    }
    this.listenT += dt;
    const thr = Math.max(B.minRms, this.base.rms * B.rmsOverBase);
    const rise = m.lowDb - this.base.lowDb;
    const loud = m.rms > thr;
    const lowOk = rise > B.lowRiseDb;
    const noisy = m.peak < B.maxPeakiness;
    // a visual "she's breathing on it" level even below the gate
    this.level = Math.max(0, Math.min(1, (m.rms - this.base.rms * 1.5) / 0.12));
    let score = 0;
    if (loud && lowOk && noisy) {
      score = Math.min(1, 0.25 + (m.rms - thr) / 0.22 + Math.max(0, rise - B.lowRiseDb) / 50);
      this.run += dt; this.quiet = 0;
    } else {
      this.quiet += dt;
      if (this.quiet > B.dropoutSec) this.run = 0;
      // adapt the ambient baseline slowly while nothing is happening
      if (!loud && this.run === 0) {
        const k = Math.min(1, dt * 0.25);
        this.base.rms += (Math.min(m.rms, this.base.rms * 1.5 + 1e-4) - this.base.rms) * k;
        this.base.lowDb += (Math.min(m.lowDb, this.base.lowDb + 3) - this.base.lowDb) * k;
      }
    }
    this.active = this.run >= B.sustainSec;
    const target = this.active ? Math.max(score, 0.2) : 0;
    const tau = target > this.intensity ? B.attack : B.release;
    this.intensity += (target - this.intensity) * Math.min(1, dt / tau);
    if (this.active) this.lastHeard = this.listenT;
    this.last = { ...m, thr, rise, score };
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
    this.intensity = 0; this.active = false;
  }
}
