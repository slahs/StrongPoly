/** Prozedurale WebAudio-Effekte (einfache Synthese, keine Audiodateien) und optionale generative Musik. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.6;
  private budget = 0;
  private lastBudgetReset = 0;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicOn = false;
  private musicGain: GainNode | null = null;

  constructor() {
    // Browser erlauben Audio erst nach einer Nutzergeste
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 1.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        if (this.musicOn) this.startMusic();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Begrenzt die Anzahl gleichzeitig erzeugter Klänge */
  private allow(): boolean {
    const now = performance.now();
    if (now - this.lastBudgetReset > 100) {
      this.lastBudgetReset = now;
      this.budget = 0;
    }
    return ++this.budget <= 10;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0, dest?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, gain: number, q = 1, type: BiquadFilterType = 'lowpass', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  click(): void {
    if (!this.ensure() || !this.allow()) return;
    this.tone(660, 0.05, 'square', 0.05);
  }

  build(): void {
    if (!this.ensure()) return;
    this.noise(0.08, 900, 0.25, 2, 'bandpass');
    this.noise(0.08, 700, 0.2, 2, 'bandpass', 0.11);
    this.tone(180, 0.1, 'triangle', 0.1, 120);
  }

  error(): void {
    if (!this.ensure()) return;
    this.tone(160, 0.18, 'sawtooth', 0.08, 90);
  }

  alert(): void {
    if (!this.ensure()) return;
    this.tone(330, 0.25, 'sawtooth', 0.07);
    this.tone(247, 0.35, 'sawtooth', 0.07, undefined, 0.22);
  }

  victory(): void {
    if (!this.ensure()) return;
    [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.12, undefined, i * 0.18));
  }

  defeat(): void {
    if (!this.ensure()) return;
    [294, 262, 220, 165].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.08, undefined, i * 0.25));
  }

  shoot(): void {
    if (!this.ensure() || !this.allow()) return;
    this.noise(0.12, 2600, 0.05, 1, 'highpass');
  }

  /** Effekt aus einem Sim-Ereignis; Lautstärke fällt mit dem Abstand zur Kamera. */
  fx(kind: string, x: number, y: number, camX: number, camY: number): void {
    const d = Math.hypot(x - camX, y - camY);
    if (d > 55) return;
    if (!this.ensure() || !this.allow()) return;
    const vol = Math.max(0.05, 1 - d / 55);
    switch (kind) {
      case 'hit':
        this.noise(0.07, 1600, 0.12 * vol, 3, 'bandpass');
        break;
      case 'explosion':
      case 'rock':
        this.tone(110, 0.5, 'sine', 0.4 * vol, 40);
        this.noise(0.5, 500, 0.35 * vol);
        break;
      case 'collapse':
        this.noise(0.9, 380, 0.4 * vol);
        this.tone(70, 0.7, 'sine', 0.25 * vol, 35);
        break;
      case 'collapseWood':
        this.noise(0.6, 900, 0.3 * vol, 2, 'bandpass');
        this.tone(120, 0.3, 'triangle', 0.2 * vol, 60);
        break;
      case 'oil':
        this.noise(0.8, 3500, 0.18 * vol, 1, 'highpass');
        break;
      case 'heal':
        this.tone(880, 0.3, 'sine', 0.06 * vol, 1320);
        break;
      case 'arrows':
        this.noise(0.7, 3000, 0.1 * vol, 1, 'highpass');
        break;
      case 'banner':
        this.tone(262, 0.5, 'sawtooth', 0.07 * vol);
        this.tone(392, 0.6, 'sawtooth', 0.06 * vol, undefined, 0.15);
        break;
      case 'splash':
        this.noise(0.25, 1200, 0.12 * vol);
        break;
      default:
        break;
    }
  }

  // ---- Musik ----
  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  private startMusic(): void {
    if (!this.ensure() || this.musicTimer || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
    // Moll-Pentatonik, langsame Melodie über Bordun
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const root = 146.83;
    let step = 0;
    let last = 2;
    this.musicTimer = setInterval(() => {
      if (!this.musicGain) return;
      if (step % 8 === 0) {
        this.tone(root / 2, 3.6, 'triangle', 0.12, undefined, 0, this.musicGain);
        this.tone(root / 2 * 1.5, 3.6, 'sine', 0.06, undefined, 0, this.musicGain);
      }
      if (Math.random() < 0.7) {
        last = Math.max(0, Math.min(scale.length - 1, last + (Math.random() < 0.5 ? -1 : 1) * (1 + (Math.random() < 0.3 ? 1 : 0))));
        const f = root * Math.pow(2, scale[last] / 12) * 2;
        this.tone(f, 0.9, 'triangle', 0.07, undefined, 0, this.musicGain);
      }
      step++;
    }, 450);
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicGain?.disconnect();
    this.musicGain = null;
  }
}
