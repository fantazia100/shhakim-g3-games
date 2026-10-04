// Procedural ambience (no audio files): city hum, birds, Israeli accessible pedestrian-signal ticks, bus brakes.
export class AudioManager {
  constructor() {
    this.ctx = null; this.muted = localStorage.getItem('rsc_muted') === '1';
    this.birdT = 2; this.tickT = 0;
  }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(ctx.destination);
    // brown-noise city bed
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    this.noiseBuf = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    this.bed = ctx.createGain(); this.bed.gain.value = 0.18;
    src.connect(lp).connect(this.bed).connect(this.master); src.start();
    // engine rumble, gain follows nearby traffic
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 52;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 160;
    this.engine = ctx.createGain(); this.engine.gain.value = 0;
    osc.connect(lp2).connect(this.engine).connect(this.master); osc.start();
  }
  setMuted(m) {
    this.muted = m; localStorage.setItem('rsc_muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }
  _chirp() {
    const ctx = this.ctx, t0 = ctx.currentTime, n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.13;
      o.type = 'sine'; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.12);
    }
  }
  _tick(vol) {
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 1150;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.04);
  }
  busBrake() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    s.connect(bp).connect(g).connect(this.master); s.start(t); s.stop(t + 0.8);
  }
  /** info: { activity 0..1, junctionProximity 0..1, pedGreen bool } */
  update(dt, info) {
    if (!this.ctx || this.muted) return;
    this.engine.gain.setTargetAtTime(0.02 + info.activity * 0.09, this.ctx.currentTime, 0.3);
    this.birdT -= dt; if (this.birdT <= 0) { this._chirp(); this.birdT = 1.5 + Math.random() * 4; }
    if (info.junctionProximity > 0.05) {
      this.tickT -= dt;
      if (this.tickT <= 0) { this._tick(info.junctionProximity); this.tickT = info.pedGreen ? 0.16 : 1.1; }
    }
  }
}
