/**
 * Umgebungsgeräusche (Meilenstein 4G), vollständig synthetisiert: dauerhafte Klangbetten (Wind, Blätterrauschen, Wasser,
 * Siedlungsgemurmel, Feuer, ferner Gefechtslärm) und seltene Einzelereignisse (Vögel, Knistern, ferne Waffenschläge).
 * Pegel und Raten kommen aus der reinen Logik (`ambience_logic.ts`); läuft auch auf einem OfflineAudioContext.
 */
import { AmbEvent, AmbienceInput, AmbienceScheduler, AmbienceTargets, computeAmbience, QUIET_INPUT, smoothTargets } from './ambience_logic';
import { bell, noise, tone, Env } from './synth';
import { mulberry32 } from './theory';

/** Grundpegel je Bett bei Zielwert 1 (so abgestimmt, dass die Summe unter Musik und Effekten bleibt) */
export const BED_LEVEL = { wind: 0.5, rustle: 0.4, water: 0.5, murmur: 0.45, fire: 0.35, din: 0.5 } as const;
export type BedId = keyof typeof BED_LEVEL;

const bedNoiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Lange Rauschfläche (8 s) für die Betten: Schleife bleibt nach der Filterung unhörbar */
function bedNoise(ctx: BaseAudioContext): AudioBuffer {
  let b = bedNoiseCache.get(ctx);
  if (!b) {
    const len = Math.ceil(ctx.sampleRate * 8);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = mulberry32(0xa3b1);
    let last = 0;
    // leicht rosa gefärbt (Tiefpass-Anteil), dann Randüberblendung für eine nahtlose Schleife
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      last = last * 0.72 + w * 0.28;
      d[i] = last * 1.6;
    }
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[len - fade + i] * (1 - k);
    }
    bedNoiseCache.set(ctx, b);
  }
  return b;
}

interface Bed {
  gain: GainNode;
  panner: StereoPannerNode | null;
}

export class Ambience {
  readonly sched: AmbienceScheduler;
  /** geglättete Zielpegel (Diagnose) */
  state: AmbienceTargets = computeAmbience(QUIET_INPUT);
  private beds = {} as Record<BedId, Bed>;
  private env: Env;
  private started = false;
  private oscs: OscillatorNode[] = [];
  private srcs: AudioBufferSourceNode[] = [];
  private rand: () => number;
  /** Zähler gespielter Einzelereignisse (Diagnose) */
  readonly played = { bird: 0, clash: 0, crackle: 0 };

  constructor(
    private ctx: BaseAudioContext,
    private out: AudioNode,
    noiseBuf: AudioBuffer,
    rand: () => number = Math.random,
  ) {
    this.rand = rand;
    this.sched = new AmbienceScheduler(rand);
    this.env = { ctx, out, noise: noiseBuf, rand };
    this.build();
  }

  // ---------------------------------------------------------------------------------------
  // Betten

  private src(rate: number, offset: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = bedNoise(this.ctx);
    s.loop = true;
    s.playbackRate.value = rate;
    this.srcs.push(s);
    s.start(0, offset);
    return s;
  }

  private lfo(freq: number, depth: number, target: AudioParam, phase = 0): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start(phase > 0 ? this.ctx.currentTime + phase : 0);
    this.oscs.push(o);
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  private bed(id: BedId, pan: boolean): Bed {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    let panner: StereoPannerNode | null = null;
    if (pan && typeof this.ctx.createStereoPanner === 'function') {
      panner = this.ctx.createStereoPanner();
      gain.connect(panner).connect(this.out);
    } else gain.connect(this.out);
    const b = { gain, panner };
    this.beds[id] = b;
    return b;
  }

  private build(): void {
    const ctx = this.ctx;
    const r = this.rand;
    // --- Wind: breites Rauschen, Böen über Durchlassfrequenz und Pegel
    {
      const b = this.bed('wind', false);
      const gust = ctx.createGain();
      gust.gain.value = 0.62;
      const bp = this.filter('bandpass', 520, 0.55);
      const lp = this.filter('lowpass', 1500, 0.6);
      this.src(0.92, r() * 6)
        .connect(this.filter('highpass', 110, 0.7))
        .connect(bp)
        .connect(lp)
        .connect(gust)
        .connect(b.gain);
      this.lfo(0.071, 0.38, gust.gain);
      this.lfo(0.19, 0.12, gust.gain, 0.4);
      this.lfo(0.052, 220, bp.frequency);
      // leises Heulen in der Höhe
      const howl = ctx.createGain();
      howl.gain.value = 0.16;
      const hb = this.filter('bandpass', 880, 7);
      this.src(1.03, r() * 6).connect(hb).connect(howl).connect(b.gain);
      this.lfo(0.043, 240, hb.frequency);
      this.lfo(0.087, 0.12, howl.gain);
    }
    // --- Blätterrauschen: hohes Rauschen, zwei Modulationen
    {
      const b = this.bed('rustle', false);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      this.src(1.12, r() * 6)
        .connect(this.filter('highpass', 2300, 0.7))
        .connect(this.filter('bandpass', 4300, 0.8))
        .connect(g)
        .connect(b.gain);
      this.lfo(0.37, 0.28, g.gain);
      this.lfo(1.4, 0.14, g.gain, 0.2);
    }
    // --- Wasser: Plätschern (mittleres Band, schnelle Modulation) + Rauschen
    {
      const b = this.bed('water', true);
      const g1 = ctx.createGain();
      g1.gain.value = 0.55;
      this.src(0.97, r() * 6)
        .connect(this.filter('bandpass', 640, 0.55))
        .connect(this.filter('lowpass', 1700, 0.6))
        .connect(g1)
        .connect(b.gain);
      this.lfo(0.83, 0.22, g1.gain);
      const g2 = ctx.createGain();
      g2.gain.value = 0.3;
      this.src(1.08, r() * 6)
        .connect(this.filter('highpass', 1400, 0.7))
        .connect(this.filter('bandpass', 2300, 1.1))
        .connect(g2)
        .connect(b.gain);
      this.lfo(3.3, 0.2, g2.gain);
      this.lfo(5.7, 0.12, g2.gain, 0.3);
    }
    // --- Siedlungsgemurmel: zwei „Formant“-Bänder mit silbenartiger Modulation
    {
      const b = this.bed('murmur', false);
      const lp = this.filter('lowpass', 2400, 0.6);
      lp.connect(b.gain);
      for (const [f, q, rate, depth, base] of [
        [460, 1.5, 3.6, 0.3, 0.5],
        [1250, 1.7, 4.4, 0.32, 0.4],
        [2100, 1.4, 2.9, 0.25, 0.25],
      ] as const) {
        const g = ctx.createGain();
        g.gain.value = base;
        this.src(0.9 + r() * 0.2, r() * 6).connect(this.filter('bandpass', f, q)).connect(g).connect(lp);
        this.lfo(rate, depth, g.gain, r() * 0.5);
        this.lfo(rate * 0.37, depth * 0.6, g.gain, r() * 0.5);
      }
    }
    // --- Feuer: Grundrauschen mit Flackern (Knistern kommt als Einzelereignis)
    {
      const b = this.bed('fire', true);
      const g = ctx.createGain();
      g.gain.value = 0.55;
      this.src(1.0, r() * 6)
        .connect(this.filter('lowpass', 560, 0.7))
        .connect(g)
        .connect(b.gain);
      this.lfo(6.9, 0.3, g.gain);
      this.lfo(11.3, 0.15, g.gain, 0.1);
      const hi = ctx.createGain();
      hi.gain.value = 0.18;
      this.src(1.07, r() * 6).connect(this.filter('highpass', 1800, 0.7)).connect(hi).connect(b.gain);
      this.lfo(9.1, 0.14, hi.gain);
    }
    // --- ferner Gefechtslärm: tiefes Grollen mit Schwellen
    {
      const b = this.bed('din', true);
      const g = ctx.createGain();
      g.gain.value = 0.55;
      this.src(0.88, r() * 6)
        .connect(this.filter('bandpass', 240, 0.8))
        .connect(this.filter('lowpass', 760, 0.6))
        .connect(g)
        .connect(b.gain);
      this.lfo(0.9, 0.3, g.gain);
      this.lfo(2.3, 0.15, g.gain, 0.2);
      const mid = ctx.createGain();
      mid.gain.value = 0.12;
      this.src(1.05, r() * 6).connect(this.filter('bandpass', 1100, 0.9)).connect(this.filter('lowpass', 1700)).connect(mid).connect(b.gain);
      this.lfo(1.7, 0.1, mid.gain);
    }
    this.started = true;
  }

  // ---------------------------------------------------------------------------------------
  // Pegel

  /** Zielpegel anwenden (weicher Übergang auf dem Audio-Takt) */
  apply(t: AmbienceTargets, now = this.ctx.currentTime, tc = 0.9): void {
    this.state = t;
    const set = (id: BedId, v: number, pan?: number): void => {
      const b = this.beds[id];
      b.gain.gain.setTargetAtTime(Math.max(0, v) * t.master * BED_LEVEL[id], now, tc);
      if (b.panner && pan !== undefined) b.panner.pan.setTargetAtTime(pan, now, tc);
    };
    set('wind', t.wind);
    set('rustle', t.rustle);
    set('water', t.water, t.waterPan * 0.8);
    set('murmur', t.murmur);
    set('fire', t.fire, t.firePan * 0.8);
    set('din', t.din, t.dinPan * 0.8);
  }

  /** Beobachtungen → Pegel (geglättet) → Betten; liefert die jetzt fälligen Einzelereignisse (die der Aufrufer begrenzt und abspielt) */
  update(dt: number, input: AmbienceInput): AmbEvent[] {
    const next = computeAmbience(input);
    this.state = smoothTargets(this.state, next, dt, 1.4);
    this.apply(this.state);
    return this.sched.tick(dt, this.state, input);
  }

  // ---------------------------------------------------------------------------------------
  // Einzelereignisse

  /** Ereignis zum Zeitpunkt `t` abspielen; gibt die Dauer zurück */
  fire(ev: AmbEvent, t = this.ctx.currentTime + 0.02): number {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 1;
    let tail: AudioNode = g;
    const nodes: AudioNode[] = [g];
    if (ev.far > 0.05) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 9000 - ev.far * 6500;
      f.Q.value = 0.5;
      tail.connect(f);
      tail = f;
      nodes.push(f);
    }
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = ev.pan;
      tail.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(this.out);
    const env: Env = { ...this.env, out: g };
    let dur = 0.3;
    if (ev.kind === 'bird') dur = birdCall(env, t, ev.r, ev.far);
    else if (ev.kind === 'clash') dur = distantClash(env, t, ev.r, ev.far);
    else dur = crackle(env, t, ev.r);
    this.sched.started(ev.kind, dur);
    this.played[ev.kind]++;
    if (typeof setTimeout === 'function' && !(ctx instanceof OfflineAudioContext)) {
      setTimeout(() => {
        for (const n of nodes) n.disconnect();
      }, (dur + 0.5) * 1000);
    }
    return dur;
  }

  /** Alles beenden (Spielende / Test) */
  dispose(): void {
    if (!this.started) return;
    this.started = false;
    for (const s of this.srcs) {
      try {
        s.stop();
      } catch {
        /* ignorieren */
      }
    }
    for (const o of this.oscs) {
      try {
        o.stop();
      } catch {
        /* ignorieren */
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Synthese der Einzelereignisse

/** Vogelruf: Fink (zwei bis drei Zwitschernoten), Taube (tiefes Gurren), Trillerer (schnelle Notenfolge). Gibt die Dauer zurück. */
export function birdCall(env: Env, t: number, r: number, far: number): number {
  const v = 0.075 * (1 - 0.55 * far);
  const rnd = env.rand;
  if (r < 0.42) {
    const base = 2900 + rnd() * 1300;
    const n = 2 + Math.floor(rnd() * 2);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const up = rnd() < 0.5;
      const f0 = base * (1 + (rnd() - 0.5) * 0.25);
      tone(env, t + at, { freq: f0, slideTo: f0 * (up ? 1.35 : 0.72), dur: 0.085, gain: v, type: 'sine', attack: 0.012 });
      tone(env, t + at, { freq: f0 * 2, slideTo: f0 * (up ? 2.6 : 1.4), dur: 0.07, gain: v * 0.18, type: 'sine', attack: 0.012 });
      at += 0.12 + rnd() * 0.06;
    }
    return at + 0.1;
  }
  if (r < 0.72) {
    // Turteltaube: weiches Gurren „du-du-duuu“
    const f = 360 + rnd() * 70;
    const notes = [0, 0.26, 0.5];
    notes.forEach((o, i) => {
      tone(env, t + o, { freq: f * (i === 2 ? 0.93 : 1), slideTo: f * 0.88, dur: i === 2 ? 0.5 : 0.19, gain: v * 1.2, type: 'sine', attack: 0.05, lp: 900, vib: { rate: 22, depth: 0.012, delay: 0.02 } });
    });
    return 1.1;
  }
  // Trillerer
  const base = 3000 + rnd() * 700;
  const n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const f = base * (i % 2 === 0 ? 1 : 1.18) * (1 - i * 0.012);
    tone(env, t + i * 0.052, { freq: f, slideTo: f * 1.06, dur: 0.04, gain: v * (0.55 + 0.45 * Math.sin((i / n) * Math.PI)), type: 'sine', attack: 0.006 });
  }
  return n * 0.052 + 0.1;
}

/** Ferner Waffenschlag: dumpfes Klirren mit kurzem Nachhall, kaum Höhen. */
export function distantClash(env: Env, t: number, r: number, far: number): number {
  const rnd = env.rand;
  const v = 0.09 * (1 - 0.5 * far);
  const f = 780 + rnd() * 700;
  noise(env, t, { dur: 0.05, gain: v, freq: 1500 + rnd() * 900, q: 2.5, type: 'bandpass' });
  bell(env, t, f, 0.22, v * 0.55, [1, 2.76, 5.4]);
  if (r > 0.45) {
    const o = 0.1 + rnd() * 0.12;
    noise(env, t + o, { dur: 0.045, gain: v * 0.8, freq: 1200 + rnd() * 900, q: 2.5, type: 'bandpass' });
    bell(env, t + o, f * (0.85 + rnd() * 0.3), 0.18, v * 0.45, [1, 2.76]);
  }
  if (r > 0.82) tone(env, t + 0.05, { freq: 130 + rnd() * 30, slideTo: 100, dur: 0.32, gain: v * 0.9, type: 'sine' });
  return 0.6;
}

/** Feuerknacken: kurzer heller Knall mit leisem Nachklang. */
export function crackle(env: Env, t: number, r: number): number {
  const rnd = env.rand;
  const v = 0.13 * (0.5 + rnd() * 0.5);
  noise(env, t, { dur: 0.018 + r * 0.02, gain: v, freq: 2600 + rnd() * 3200, q: 1.8, type: 'bandpass' });
  if (r > 0.6) noise(env, t + 0.03, { dur: 0.012, gain: v * 0.7, freq: 4200 + rnd() * 2200, q: 2, type: 'bandpass' });
  tone(env, t, { freq: 180 + rnd() * 120, slideTo: 90, dur: 0.05, gain: v * 0.6, type: 'sine' });
  return 0.1;
}
