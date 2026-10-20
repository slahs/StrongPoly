/**
 * Generativer Soundtrack. Schichten (Drone, Laute, Flöte, Rahmentrommel, Herzschlag, Tremolo-Pad)
 * haben je einen eigenen Gain; Stimmungswechsel überblenden diese Gains weich. Die Noten kommen
 * aus `generatePhrase` (reine Logik in theory.ts) und werden im Voraus eingeplant.
 */
import { drum, flute, noiseBuffer, pluck, Env } from './synth';
import {
  generatePhrase,
  hashSeed,
  LAYER_MIX,
  LayerMix,
  midiToHz,
  MoodId,
  MOODS,
  Phrase,
  stepSeconds,
  THEME_PHRASES,
  ThemeId,
} from './theory';

/** Grundpegel je Schicht, bevor die Stimmungsmischung (0..1) angewendet wird. */
const BASE: LayerMix = { drone: 0.26, oud: 0.5, flute: 0.38, drum: 0.5, heart: 0.55, pad: 0.1 };
const LAYERS = Object.keys(BASE) as (keyof LayerMix)[];
const LOOKAHEAD = 1.2;
const FADE = 1.6;

export interface MusicStats {
  running: boolean;
  mood: MoodId;
  wanted: MoodId;
  bpm: number;
  phrase: number;
  scheduled: number;
  ended: boolean;
  layers: Record<keyof LayerMix, number>;
}

export class MusicPlayer {
  readonly bus: GainNode;
  private layers = {} as Record<keyof LayerMix, GainNode>;
  private envs = {} as Record<keyof LayerMix, Env>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private stepInPhrase = 0;
  private phrase: Phrase | null = null;
  private phraseIndex = 0;
  private phrasesThisTheme = 0;
  private curBpm = 72;
  private wanted: MoodId = 'build';
  private themeLimit = 0;
  private ended = false;
  private running = false;
  private scheduled = 0;
  private drones: { stop: () => void }[] = [];
  private rand = Math.random;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    private seed: number,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    const noise = noiseBuffer(ctx);
    for (const k of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus);
      this.layers[k] = g;
      this.envs[k] = { ctx, out: g, noise, rand: this.rand };
    }
    this.buildDrone();
  }

  /** Dauerklänge: Bordun (Sägezahn + Quinte) und Tremolo-Pad (Spannung). */
  private buildDrone(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const root = MOODS.build.root - 24;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.Q.value = 0.8;
    lp.connect(this.layers.drone);
    const slow = ctx.createOscillator();
    slow.frequency.value = 0.07;
    const slowG = ctx.createGain();
    slowG.gain.value = 90;
    slow.connect(slowG).connect(lp.frequency);
    slow.start(t);
    const oscs: OscillatorNode[] = [slow];
    for (const [semi, type, level, det] of [[0, 'sawtooth', 0.5, -5], [0, 'sawtooth', 0.4, 6], [7, 'sine', 0.35, 0], [-12, 'sine', 0.3, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midiToHz(root + semi);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(lp);
      o.start(t);
      oscs.push(o);
    }
    // Pad: kleine Sekunde über dem Grundton, mit Tremolo
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 900;
    const trem = ctx.createGain();
    trem.gain.value = 0.55;
    padLp.connect(trem).connect(this.layers.pad);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.45;
    lfo.connect(lfoG).connect(trem.gain);
    lfo.start(t);
    oscs.push(lfo);
    for (const [semi, det] of [[1, -6], [1, 7], [7, 0], [13, 3]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToHz(root + 12 + semi);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(padLp);
      o.start(t);
      oscs.push(o);
    }
    this.drones.push({
      stop: () => {
        for (const o of oscs) {
          try {
            o.stop();
          } catch {
            /* schon gestoppt */
          }
        }
      },
    });
  }

  // ----- Steuerung -----
  /** Zielstimmung. Themen mit `limit` > 0 enden nach so vielen Phrasen von selbst. */
  setTarget(mood: MoodId, limit = 0, immediate = false): void {
    if (mood === this.wanted && limit === this.themeLimit && !this.ended && !immediate) return;
    this.wanted = mood;
    this.themeLimit = limit;
    this.phrasesThisTheme = 0;
    if (immediate) {
      this.phrase = null;
      this.stepInPhrase = 0;
      this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.1);
    }
    if (this.ended) {
      this.ended = false;
      this.phrase = null;
      this.stepInPhrase = 0;
      this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.1);
    }
    this.applyMix(mood);
    // sofort neue Phrase am nächsten Taktanfang (siehe scheduleStep)
  }

  private applyMix(mood: MoodId): void {
    const t = this.ctx.currentTime;
    const mix = LAYER_MIX[mood];
    for (const k of LAYERS) this.layers[k].gain.setTargetAtTime(BASE[k] * mix[k], t, FADE / 3);
  }

  start(fadeIn = 3, timer = true): void {
    if (this.running) return;
    this.running = true;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), t);
    this.bus.gain.linearRampToValueAtTime(1, t + fadeIn);
    this.applyMix(this.wanted);
    this.nextTime = t + 0.15;
    if (timer && typeof setInterval === 'function') {
      this.timer = setInterval(() => this.tick(), 180);
      this.tick();
    }
  }

  /** Blendet aus und hält an. */
  stop(fadeOut = 1.5): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + fadeOut);
  }

  dispose(): void {
    this.stop(0.05);
    for (const d of this.drones) d.stop();
    this.drones.length = 0;
  }

  private tick(): void {
    if (!this.running) return;
    this.scheduleUntil(this.ctx.currentTime + LOOKAHEAD);
  }

  /** Plant alle Schritte bis zur Kontextzeit `limit` (auch für Offline-Rendering). */
  scheduleUntil(limit: number): void {
    if (this.ended) return;
    if (this.nextTime < this.ctx.currentTime - 0.05) this.nextTime = this.ctx.currentTime + 0.05;
    let guard = 0;
    while (this.nextTime < limit && !this.ended && guard++ < 64) this.scheduleStep();
  }

  private newPhrase(): void {
    const finite = this.themeLimit > 0;
    const final = finite && this.phrasesThisTheme === this.themeLimit - 1;
    const seed = hashSeed(this.seed, this.phraseIndex++);
    const first = !this.phrase;
    this.phrase = generatePhrase(seed, this.wanted, { startDegree: this.phrase?.lastDegree, final });
    if (first) this.curBpm = this.phrase.bpm;
    this.stepInPhrase = 0;
  }

  private scheduleStep(): void {
    // neue Phrase: zu Beginn, oder zum Taktwechsel, wenn sich die Stimmung geändert hat
    if (!this.phrase || this.stepInPhrase >= this.phrase.steps || (this.stepInPhrase % 8 === 0 && this.stepInPhrase > 0 && this.phrase.mood !== this.wanted)) {
      if (this.phrase && this.stepInPhrase >= this.phrase.steps) {
        this.phrasesThisTheme++;
        if (this.themeLimit > 0 && this.phrasesThisTheme >= this.themeLimit) {
          this.finishTheme();
          return;
        }
      }
      this.newPhrase();
    }
    const ph = this.phrase!;
    const stepDur = stepSeconds(this.curBpm);
    const s0 = this.stepInPhrase;
    const t0 = this.nextTime;
    const at = (step: number): number => t0 + (step - s0) * stepDur;

    for (const n of ph.notes) {
      if (Math.floor(n.step + 1e-6) !== s0) continue;
      const when = at(n.step);
      const durS = Math.max(0.12, n.dur * stepDur);
      const jitter = (this.rand() - 0.5) * 0.012;
      if (n.voice === 'oud') {
        if (n.tremolo) {
          const count = Math.min(14, Math.floor(durS / 0.085));
          for (let i = 0; i < count; i++) pluck(this.envs.oud, when + i * 0.085, { midi: n.midi, gain: 0.3 * n.vel * (0.7 + 0.3 * (1 - i / count)), dur: 0.6, bright: 0.6 });
        } else if (n.grace) pluck(this.envs.oud, when + jitter, { midi: n.midi, gain: 0.3 * n.vel, dur: 0.5, bright: 0.8 });
        else pluck(this.envs.oud, when + jitter, { midi: n.midi, gain: 0.6 * n.vel, dur: Math.min(2.2, durS + 0.8), bright: 0.45 + n.vel * 0.3 });
      } else flute(this.envs.flute, when + jitter, n.midi + 12, Math.min(4, durS * 0.95), 0.7 * n.vel);
      this.scheduled++;
    }
    for (const n of ph.bass) {
      if (Math.floor(n.step + 1e-6) !== s0) continue;
      pluck(this.envs.oud, at(n.step), { midi: n.midi, gain: 0.55 * n.vel, dur: Math.min(2.4, n.dur * stepDur + 0.6), bright: 0.2, lp: 900 });
      this.scheduled++;
    }
    for (const d of ph.drums) {
      if (Math.floor(d.step + 1e-6) !== s0) continue;
      const layer = d.kind === 'beat' || d.kind === 'echo' ? this.envs.heart : this.envs.drum;
      drum(layer, at(d.step), d.kind, d.vel);
      this.scheduled++;
    }

    this.curBpm += (ph.bpm - this.curBpm) * 0.22;
    this.nextTime += stepDur;
    this.stepInPhrase++;
  }

  /** Endliches Thema ist durchgespielt: Schichten ausklingen lassen. */
  private finishTheme(): void {
    this.ended = true;
    const t = this.ctx.currentTime;
    for (const k of LAYERS) this.layers[k].gain.setTargetAtTime(0, t + 2.5, 1.5);
  }

  stats(): MusicStats {
    const layers = {} as Record<keyof LayerMix, number>;
    for (const k of LAYERS) layers[k] = Math.round(this.layers[k].gain.value * 1000) / 1000;
    return {
      running: this.running,
      mood: this.phrase?.mood ?? this.wanted,
      wanted: this.wanted,
      bpm: Math.round(this.curBpm),
      phrase: this.phraseIndex,
      scheduled: this.scheduled,
      ended: this.ended,
      layers,
    };
  }

  /** Bequemlichkeit für Themen */
  static limitFor(theme: ThemeId): number {
    return THEME_PHRASES[theme];
  }
}
