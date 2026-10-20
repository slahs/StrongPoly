/**
 * Einheiten-Rückmeldung bei Auswahl und Befehl. Keine Aufnahmen: kurze synthetische
 * Formantsilben (Fantasiesprache), Hufschläge, Sehnenklang usw., je Einheitenklasse verschieden.
 */
import type { CommandKind, VoiceClass } from './classes';
import { bell, noise, pluck, syllable, tone, Env } from './synth';

type VoiceFn = (env: Env, t: number, k: number) => number;

const hoof = (env: Env, t: number, v = 1): void => {
  noise(env, t, { dur: 0.045, gain: 0.2 * v, freq: 520, q: 1.5, type: 'bandpass' });
  tone(env, t, { freq: 150, slideTo: 90, dur: 0.06, gain: 0.16 * v, type: 'sine' });
};

const neigh = (env: Env, t: number, k: number, v = 1): void => {
  // Schnauben und kurzes Wiehern
  noise(env, t, { dur: 0.16, gain: 0.12 * v, freq: 900, q: 1.2, type: 'bandpass', attack: 0.03 });
  const w = 560 * k;
  tone(env, t + 0.08, { freq: w, slideTo: w * 1.6, dur: 0.16, gain: 0.1 * v, type: 'sawtooth', lp: 1800, vib: { rate: 17, depth: 0.03 } });
  tone(env, t + 0.24, { freq: w * 1.6, slideTo: w * 0.9, dur: 0.22, gain: 0.1 * v, type: 'sawtooth', lp: 1500, vib: { rate: 15, depth: 0.04 } });
};

const clink = (env: Env, t: number, k: number, v = 1): void => {
  bell(env, t, 2300 * k, 0.12, 0.06 * v, [1, 1.7, 2.6]);
};

const twang = (env: Env, t: number, k: number, v = 1): void => {
  pluck(env, t, { midi: 55 + (k - 1) * 12, gain: 0.18 * v, dur: 0.35, bright: 0.9, lp: 5000 });
};

export const SELECT_VOICES: Record<VoiceClass, VoiceFn> = {
  infantry(env, t, k) {
    syllable(env, t, { f0: 108 * k, vowel: 'o', to: 'a', dur: 0.2, gain: 0.3, cons: 'h', glide: 0.92 });
    clink(env, t + 0.16, k, 0.8);
    return 0.4;
  },
  archer(env, t, k) {
    syllable(env, t, { f0: 175 * k, vowel: 'e', dur: 0.15, gain: 0.26, cons: 'h', glide: 1.1 });
    twang(env, t + 0.1, k, 0.8);
    return 0.45;
  },
  cavalry(env, t, k) {
    hoof(env, t, 0.8);
    hoof(env, t + 0.13, 0.6);
    neigh(env, t + 0.2, k, 0.9);
    return 0.7;
  },
  siege(env, t, k) {
    tone(env, t, { freq: 58 * k, slideTo: 74 * k, dur: 0.45, gain: 0.2, type: 'sawtooth', lp: 280, attack: 0.08, vib: { rate: 5, depth: 0.04 }, shape: 'sustain' });
    noise(env, t, { dur: 0.35, gain: 0.07, freq: 480, sweepTo: 640, q: 4, attack: 0.08, shape: 'sustain' });
    tone(env, t + 0.35, { freq: 110, slideTo: 60, dur: 0.12, gain: 0.25, type: 'sine' });
    return 0.55;
  },
  worker(env, t, k) {
    syllable(env, t, { f0: 215 * k, vowel: 'u', to: 'a', dur: 0.14, gain: 0.2, glide: 1.12 });
    return 0.2;
  },
  lord(env, t, k) {
    syllable(env, t, { f0: 80 * k, vowel: 'o', dur: 0.32, gain: 0.34, cons: 'h', glide: 0.9 });
    bell(env, t + 0.1, 440 * k, 0.6, 0.1, [1, 2.0, 3.01, 4.2]);
    return 0.7;
  },
  monk(env, t, k) {
    syllable(env, t, { f0: 196 * k, vowel: 'u', to: 'o', dur: 0.3, gain: 0.2, glide: 1.0 });
    bell(env, t + 0.18, 1175 * k, 0.7, 0.08, [1, 2.4, 4.1]);
    return 0.8;
  },
  special(env, t, k) {
    // FM-Klang: fremdartig
    const f = 330 * k;
    tone(env, t, { freq: f, dur: 0.3, gain: 0.15, type: 'sine' });
    tone(env, t, { freq: f * 1.4142, slideTo: f * 1.3, dur: 0.3, gain: 0.1, type: 'triangle' });
    noise(env, t, { dur: 0.05, gain: 0.1, freq: 3000, q: 2 });
    return 0.4;
  },
};

export const COMMAND_VOICES: Record<VoiceClass, VoiceFn> = {
  infantry(env, t, k) {
    syllable(env, t, { f0: 125 * k, vowel: 'a', dur: 0.13, gain: 0.3, cons: 'h', glide: 0.85 });
    return 0.2;
  },
  archer(env, t, k) {
    syllable(env, t, { f0: 195 * k, vowel: 'i', dur: 0.1, gain: 0.24, cons: 't', glide: 1.15 });
    return 0.2;
  },
  cavalry(env, t, k) {
    hoof(env, t, 0.8);
    hoof(env, t + 0.1, 0.7);
    hoof(env, t + 0.2, 0.6);
    if (k > 1.0) neigh(env, t + 0.28, k, 0.5);
    return 0.4;
  },
  siege(env, t, k) {
    tone(env, t, { freq: 130 * k, slideTo: 85, dur: 0.09, gain: 0.25, type: 'sine' });
    noise(env, t, { dur: 0.05, gain: 0.15, freq: 900, q: 2 });
    tone(env, t + 0.14, { freq: 120 * k, slideTo: 80, dur: 0.09, gain: 0.22, type: 'sine' });
    return 0.3;
  },
  worker(env, t, k) {
    syllable(env, t, { f0: 240 * k, vowel: 'a', dur: 0.09, gain: 0.18, glide: 0.9 });
    return 0.15;
  },
  lord(env, t, k) {
    syllable(env, t, { f0: 92 * k, vowel: 'a', dur: 0.2, gain: 0.34, cons: 'h', glide: 0.82 });
    return 0.3;
  },
  monk(env, t, k) {
    syllable(env, t, { f0: 210 * k, vowel: 'u', dur: 0.16, gain: 0.18, glide: 1.05 });
    bell(env, t + 0.06, 1319 * k, 0.4, 0.06, [1, 2.4]);
    return 0.4;
  },
  special(env, t, k) {
    const f = 392 * k;
    tone(env, t, { freq: f, slideTo: f * 0.7, dur: 0.14, gain: 0.14, type: 'triangle' });
    return 0.2;
  },
};

/** Spielt Auswahl- oder Befehlston. Angriffsbefehle klingen etwas schärfer/höher. */
export function playUnitVoice(env: Env, t: number, cls: VoiceClass, mode: 'select' | 'command', kind: CommandKind = 'move'): number {
  const k = (0.94 + env.rand() * 0.12) * (kind === 'attack' || kind === 'attackMove' ? 1.07 : 1);
  return (mode === 'select' ? SELECT_VOICES : COMMAND_VOICES)[cls](env, t, k);
}
