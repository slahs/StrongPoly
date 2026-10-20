/**
 * Synthese-Bausteine auf Basis von WebAudio. Alle Funktionen laufen auf jedem `BaseAudioContext`
 * (also auch auf einem OfflineAudioContext für Prüfungen) und planen Klänge zu einem
 * absoluten Zeitpunkt `t` (Sekunden der Kontextzeit).
 */
import { mulberry32 } from './theory';

export interface Env {
  ctx: BaseAudioContext;
  /** Ziel, an das der Effekt seinen Klang schickt */
  out: AudioNode;
  /** Weißes Rauschen (mehrere Sekunden, loopfähig) */
  noise: AudioBuffer;
  /** Zufall für Variationen (Math.random außerhalb der Sim erlaubt) */
  rand: () => number;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext, seconds = 3): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = mulberry32(0x5eed);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

const EPS = 0.0001;
const safe = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export interface ToneOpts {
  freq: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  slideTo?: number;
  attack?: number;
  /** Tiefpass-Grenzfrequenz (optional) */
  lp?: number;
  hp?: number;
  q?: number;
  /** Vibrato: Rate (Hz), Tiefe (Anteil der Frequenz) und Einsatz (s) */
  vib?: { rate: number; depth: number; delay?: number };
  detune?: number;
  /** Hüllkurve: 'exp' klingt aus, 'sustain' hält und endet sanft */
  shape?: 'exp' | 'sustain';
}

/** Ein Oszillatorton mit Hüllkurve. Gibt den Ausgangsknoten (Gain) zurück. */
export function tone(env: Env, t: number, o: ToneOpts): GainNode {
  const ctx = env.ctx;
  const dur = safe(o.dur, 0.02, 20);
  const atk = safe(o.attack ?? 0.006, 0.002, dur * 0.9);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  const f0 = safe(o.freq, 20, 12000);
  osc.frequency.setValueAtTime(f0, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(safe(o.slideTo, 20, 12000), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const peak = safe(o.gain, EPS, 1);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  if (o.shape === 'sustain') {
    const rel = Math.min(dur * 0.4, 0.25);
    g.gain.setValueAtTime(peak, t + dur - rel);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  } else g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = safe(o.lp, 40, 20000);
    f.Q.value = o.q ?? 0.7;
    node.connect(f);
    node = f;
  }
  if (o.hp) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = safe(o.hp, 20, 20000);
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(env.out);
  if (o.vib) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vib.rate;
    const d = o.vib.delay ?? 0;
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + d);
    lg.gain.linearRampToValueAtTime(f0 * o.vib.depth, t + d + 0.2);
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return g;
}

export interface NoiseOpts {
  dur: number;
  gain: number;
  freq?: number;
  q?: number;
  type?: BiquadFilterType;
  attack?: number;
  /** Filterfrequenz gleitet zu diesem Wert */
  sweepTo?: number;
  shape?: 'exp' | 'sustain';
}

/** Gefilterter Rauschstoß mit Hüllkurve. */
export function noise(env: Env, t: number, o: NoiseOpts): GainNode {
  const ctx = env.ctx;
  const dur = safe(o.dur, 0.01, 20);
  const src = ctx.createBufferSource();
  src.buffer = env.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  const fr = safe(o.freq ?? 1000, 40, 20000);
  f.frequency.setValueAtTime(fr, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(safe(o.sweepTo, 40, 20000), t + dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const atk = safe(o.attack ?? 0.003, 0.002, dur * 0.9);
  const peak = safe(o.gain, EPS, 1);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  if (o.shape === 'sustain') {
    const rel = Math.min(dur * 0.4, 0.25);
    g.gain.setValueAtTime(peak, t + dur - rel);
  }
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  src.connect(f).connect(g).connect(env.out);
  const span = env.noise.duration - 0.1;
  src.start(t, env.rand() * Math.max(0, span));
  src.stop(t + dur + 0.05);
  return g;
}

/** Glocken-/Metallklang: mehrere unharmonische Teiltöne. */
export function bell(env: Env, t: number, freq: number, dur: number, gain: number, partials: readonly number[] = [1, 2.76, 5.4, 8.93], decayScale = 1): void {
  partials.forEach((r, i) => {
    const f = freq * r;
    if (f > 11000) return;
    tone(env, t, { freq: f, dur: dur / (1 + i * 0.7 * decayScale), gain: (gain / (1 + i * 0.9)) * (i === 0 ? 1 : 0.7), type: 'sine', attack: 0.002 });
  });
}

/** Horn/Blechklang: zwei leicht verstimmte Sägezähne durch einen sich öffnenden Tiefpass. */
export function horn(env: Env, t: number, freq: number, dur: number, gain: number, bright = 1): void {
  const ctx = env.ctx;
  const g = ctx.createGain();
  const peak = safe(gain, EPS, 1);
  const atk = Math.min(0.12, dur * 0.3);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.setValueAtTime(peak * 0.85, t + Math.max(atk, dur * 0.6));
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(freq * 1.2, t);
  lp.frequency.linearRampToValueAtTime(Math.min(9000, freq * 4 * bright), t + atk * 1.5);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.6, t + dur);
  lp.connect(g).connect(env.out);
  for (const det of [-7, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = safe(freq, 20, 8000);
    o.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = 0.5;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Trommelschläge der Rahmentrommel. */
export function drum(env: Env, t: number, kind: 'dum' | 'tek' | 'ka' | 'beat' | 'echo', vel: number): void {
  const v = safe(vel, 0.05, 1);
  switch (kind) {
    case 'dum':
      tone(env, t, { freq: 130, slideTo: 62, dur: 0.28, gain: 0.5 * v, type: 'sine', attack: 0.002 });
      noise(env, t, { dur: 0.09, gain: 0.22 * v, freq: 380, type: 'lowpass', q: 0.8 });
      break;
    case 'tek':
      noise(env, t, { dur: 0.07, gain: 0.3 * v, freq: 2400, type: 'bandpass', q: 1.4 });
      tone(env, t, { freq: 240, slideTo: 170, dur: 0.07, gain: 0.12 * v, type: 'triangle' });
      break;
    case 'ka':
      noise(env, t, { dur: 0.04, gain: 0.2 * v, freq: 5200, type: 'highpass', q: 0.7 });
      break;
    case 'beat':
      tone(env, t, { freq: 78, slideTo: 44, dur: 0.34, gain: 0.55 * v, type: 'sine', attack: 0.004 });
      noise(env, t, { dur: 0.06, gain: 0.08 * v, freq: 220, type: 'lowpass' });
      break;
    case 'echo':
      tone(env, t, { freq: 70, slideTo: 42, dur: 0.28, gain: 0.35 * v, type: 'sine', attack: 0.004 });
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Gezupfte Saite: Karplus-Strong mit Allpass-Feinstimmung

const pluckCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

export function pluckBuffer(ctx: BaseAudioContext, midi: number, bright = 0.5): AudioBuffer {
  let m = pluckCache.get(ctx);
  if (!m) {
    m = new Map();
    pluckCache.set(ctx, m);
  }
  const key = Math.round(midi * 4) * 10 + Math.round(bright * 9);
  const hit = m.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const dur = freq < 120 ? 1.8 : freq < 300 ? 1.4 : 1.0;
  const len = Math.ceil(sr * dur);
  const delay = sr / freq - 0.5;
  const N = Math.max(2, Math.floor(delay));
  const frac = delay - N;
  const C = (1 - frac) / (1 + frac);
  const d = new Float32Array(N);
  const rnd = mulberry32(Math.round(midi * 100) + 17);
  // Anregung: weiche Rauschpuls-Füllung, heller bei hohem bright
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const r = rnd() * 2 - 1;
    prev = prev + (r - prev) * (0.35 + 0.65 * bright);
    d[i] = prev;
  }
  const decay = Math.pow(0.02, 1 / Math.max(1, freq * dur));
  const out = new Float32Array(len);
  let p = 0;
  let ax1 = 0;
  let ay1 = 0;
  for (let n = 0; n < len; n++) {
    const cur = d[p];
    const nxt = d[p + 1 === N ? 0 : p + 1];
    const lp = decay * (0.5 * (cur + nxt));
    const y = C * (lp - ay1) + ax1;
    ax1 = lp;
    ay1 = y;
    d[p] = y;
    out[n] = cur;
    p = p + 1 === N ? 0 : p + 1;
  }
  // normieren, Anfang und Ende entklicken
  let peak = 0;
  for (let n = 0; n < len; n++) peak = Math.max(peak, Math.abs(out[n]));
  const k = peak > 0 ? 0.9 / peak : 0;
  const fade = Math.floor(sr * 0.05);
  for (let n = 0; n < len; n++) {
    let s = out[n] * k;
    if (n > len - fade) s *= (len - n) / fade;
    out[n] = s;
  }
  const buf = ctx.createBuffer(1, len, sr);
  buf.copyToChannel(out, 0);
  m.set(key, buf);
  return buf;
}

export interface PluckOpts {
  midi: number;
  gain: number;
  /** Länge, nach der die Note ausgeblendet wird (s) */
  dur?: number;
  bright?: number;
  lp?: number;
}

/** Zupfton (Oud/Laute). */
export function pluck(env: Env, t: number, o: PluckOpts): void {
  const ctx = env.ctx;
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(ctx, o.midi, o.bright ?? 0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = safe(o.lp ?? 3200, 200, 12000);
  lp.Q.value = 0.5;
  const g = ctx.createGain();
  const peak = safe(o.gain, EPS, 1);
  const dur = o.dur ?? 1.2;
  g.gain.setValueAtTime(peak, t);
  g.gain.setValueAtTime(peak, t + Math.max(0.02, dur - 0.25));
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  src.connect(lp).connect(g).connect(env.out);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------------------------------------
// Flöte: Dreieck + Sinus mit Vibrato und Hauchrauschen

export function flute(env: Env, t: number, midi: number, dur: number, gain: number): void {
  const ctx = env.ctx;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = safe(gain, EPS, 1);
  const g = ctx.createGain();
  const atk = Math.min(0.09, dur * 0.35);
  const rel = Math.min(0.25, dur * 0.5);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.setValueAtTime(peak * 0.9, t + Math.max(atk, dur - rel));
  g.gain.exponentialRampToValueAtTime(EPS, t + dur + 0.05);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(6000, f * 4.5);
  lp.Q.value = 0.6;
  lp.connect(g).connect(env.out);
  const vib = ctx.createOscillator();
  const vg = ctx.createGain();
  vib.frequency.value = 5 + env.rand() * 0.8;
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur * 0.8));
  vib.connect(vg);
  vib.start(t);
  vib.stop(t + dur + 0.1);
  for (const [type, level] of [['triangle', 0.7], ['sine', 0.5]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = level;
    vg.connect(o.frequency);
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  // Hauch
  const n = ctx.createBufferSource();
  n.buffer = env.noise;
  n.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(9000, f * 2);
  bp.Q.value = 2.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(EPS, t);
  ng.gain.linearRampToValueAtTime(peak * 0.16, t + atk * 0.6);
  ng.gain.setValueAtTime(peak * 0.1, t + Math.max(atk, dur - rel));
  ng.gain.exponentialRampToValueAtTime(EPS, t + dur + 0.05);
  n.connect(bp).connect(ng).connect(env.out);
  n.start(t, env.rand() * (env.noise.duration - 0.2));
  n.stop(t + dur + 0.1);
}

// ---------------------------------------------------------------------------------------------
// Formantsilbe für synthetische Fantasiesprache (keine Sprachaufnahmen)

export const VOWELS = {
  a: [800, 1150, 2900],
  e: [450, 1700, 2600],
  i: [300, 2200, 3000],
  o: [450, 800, 2830],
  u: [325, 700, 2700],
} as const;

export interface SyllableOpts {
  f0: number;
  vowel: keyof typeof VOWELS;
  dur: number;
  gain: number;
  /** Tonhöhe gleitet zu f0 * glide */
  glide?: number;
  /** Anlaut */
  cons?: 'h' | 'k' | 't' | 's' | 'm';
  /** zweiter Vokal, in den die Formanten gleiten */
  to?: keyof typeof VOWELS;
}

export function syllable(env: Env, t: number, o: SyllableOpts): void {
  const ctx = env.ctx;
  const dur = safe(o.dur, 0.05, 2);
  const peak = safe(o.gain, EPS, 1);
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(safe(o.f0, 40, 1200), t);
  if (o.glide) src.frequency.exponentialRampToValueAtTime(safe(o.f0 * o.glide, 40, 1200), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(0.03, dur * 0.3));
  g.gain.setValueAtTime(peak * 0.8, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  g.connect(env.out);
  const v1 = VOWELS[o.vowel];
  const v2 = VOWELS[o.to ?? o.vowel];
  const levels = [1, 0.55, 0.3];
  for (let i = 0; i < 3; i++) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = i === 0 ? 7 : 10;
    f.frequency.setValueAtTime(v1[i], t);
    if (o.to) f.frequency.linearRampToValueAtTime(v2[i], t + dur * 0.9);
    const fg = ctx.createGain();
    fg.gain.value = levels[i] * 2.2;
    src.connect(f).connect(fg).connect(g);
  }
  src.start(t);
  src.stop(t + dur + 0.05);
  if (o.cons) {
    const hp = o.cons === 'k' ? 1800 : o.cons === 't' ? 4200 : o.cons === 's' ? 6000 : o.cons === 'm' ? 300 : 2500;
    noise(env, t - 0.02 < 0 ? t : t - 0.02, { dur: o.cons === 'h' ? 0.09 : 0.04, gain: peak * 0.5, freq: hp, type: o.cons === 'm' ? 'lowpass' : 'bandpass', q: 1.5 });
  }
}
