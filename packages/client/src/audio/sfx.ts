/**
 * Effekt-Synthese. Jeder Effekt ist eine Funktion (Env, Startzeit, Parameter) → Dauer in Sekunden
 * und läuft auf jedem BaseAudioContext. Jeder Aufruf variiert leicht (Tonhöhe, Zeitversatz, Pegel).
 */
import { bell, drum, horn, noise, pluck, tone, Env } from './synth';

export interface SfxParams {
  /** Intensität 0..1.5 (Standard 1) */
  v?: number;
  /** Variante, z. B. Holz statt Stein */
  wood?: boolean;
}
export type SfxFn = (env: Env, t: number, p: SfxParams) => number;

const jit = (env: Env, amt: number): number => 1 + (env.rand() - 0.5) * 2 * amt;

function hammerHit(env: Env, t: number, v: number, pitch: number): void {
  noise(env, t, { dur: 0.045, gain: 0.3 * v, freq: 1900 * pitch, q: 2, type: 'bandpass' });
  tone(env, t, { freq: 240 * pitch, slideTo: 130 * pitch, dur: 0.11, gain: 0.22 * v, type: 'triangle' });
  tone(env, t, { freq: 920 * pitch, slideTo: 700 * pitch, dur: 0.05, gain: 0.07 * v, type: 'square', lp: 2500 });
}

export const SFX = {
  /** Hammerschläge beim Bauen */
  build(env, t, p) {
    const v = p.v ?? 1;
    const n = 2 + (env.rand() < 0.5 ? 1 : 0);
    let at = 0;
    for (let i = 0; i < n; i++) {
      hammerHit(env, t + at, v * (0.8 + env.rand() * 0.3), jit(env, 0.08));
      at += 0.15 + env.rand() * 0.08;
    }
    return at + 0.15;
  },
  /** Abreißen: Gepolter */
  demolish(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.7, gain: 0.35 * v, freq: 700 * jit(env, 0.2), sweepTo: 220, type: 'lowpass', q: 0.8 });
    tone(env, t, { freq: 90, slideTo: 40, dur: 0.45, gain: 0.35 * v, type: 'sine' });
    for (let i = 0; i < 4; i++) noise(env, t + 0.05 + i * 0.09 + env.rand() * 0.05, { dur: 0.06, gain: 0.14 * v, freq: 900 + env.rand() * 1500, q: 3 });
    return 0.8;
  },
  /** Platzieren nicht möglich: dumpfer Fehlerton */
  placeFail(env, t) {
    tone(env, t, { freq: 150, slideTo: 100, dur: 0.16, gain: 0.3, type: 'triangle', lp: 700 });
    tone(env, t + 0.1, { freq: 112, slideTo: 74, dur: 0.22, gain: 0.3, type: 'triangle', lp: 600 });
    noise(env, t, { dur: 0.06, gain: 0.15, freq: 300, type: 'lowpass' });
    return 0.35;
  },
  /** Holzfäller: Axthieb */
  chop(env, t, p) {
    const v = p.v ?? 1;
    const k = jit(env, 0.1);
    noise(env, t, { dur: 0.04, gain: 0.3 * v, freq: 1300 * k, q: 2.2 });
    tone(env, t, { freq: 210 * k, slideTo: 120 * k, dur: 0.14, gain: 0.3 * v, type: 'sine' });
    tone(env, t + 0.005, { freq: 680 * k, slideTo: 520 * k, dur: 0.06, gain: 0.08 * v, type: 'triangle' });
    if (env.rand() < 0.25) noise(env, t + 0.12, { dur: 0.08, gain: 0.08 * v, freq: 2600, type: 'highpass' });
    return 0.25;
  },
  /** Steinbruch / Eisenmine: Pickel */
  pick(env, t, p) {
    const v = p.v ?? 1;
    const k = jit(env, 0.12);
    noise(env, t, { dur: 0.03, gain: 0.25 * v, freq: 3400, q: 1.2, type: 'highpass' });
    bell(env, t, 2100 * k, 0.16, 0.12 * v, [1, 1.58, 2.33]);
    noise(env, t + 0.03, { dur: 0.12, gain: 0.12 * v, freq: 800, type: 'lowpass' });
    tone(env, t, { freq: 140 * k, slideTo: 90, dur: 0.1, gain: 0.18 * v, type: 'sine' });
    return 0.3;
  },
  /** Schmiede: Hammer auf Amboss */
  smith(env, t, p) {
    const v = p.v ?? 1;
    const k = jit(env, 0.05);
    let at = 0;
    for (let i = 0; i < 2; i++) {
      noise(env, t + at, { dur: 0.03, gain: 0.25 * v, freq: 3000, q: 1, type: 'highpass' });
      bell(env, t + at, 780 * k * (i ? 1.04 : 1), 0.42, 0.2 * v, [1, 1.59, 2.14, 2.92, 3.9]);
      tone(env, t + at, { freq: 120, slideTo: 70, dur: 0.1, gain: 0.2 * v, type: 'sine' });
      at += 0.26 + env.rand() * 0.06;
    }
    return at + 0.4;
  },
  /** Mühle: Mahlen und Knarren */
  mill(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.9, gain: 0.2 * v, freq: 420, sweepTo: 340, q: 3, type: 'bandpass', attack: 0.15, shape: 'sustain' });
    tone(env, t, { freq: 62 * jit(env, 0.05), slideTo: 72, dur: 0.9, gain: 0.12 * v, type: 'sawtooth', lp: 260, attack: 0.2, shape: 'sustain', vib: { rate: 3.2, depth: 0.03 } });
    for (let i = 0; i < 3; i++) tone(env, t + 0.1 + i * 0.26 + env.rand() * 0.05, { freq: 160 + env.rand() * 60, slideTo: 100, dur: 0.07, gain: 0.07 * v, type: 'triangle' });
    return 1;
  },
  /** Ernte: Sensenschwung */
  harvest(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.2, gain: 0.12 * v, freq: 2200, sweepTo: 4200, q: 1.5, type: 'bandpass', attack: 0.06 });
    return 0.25;
  },
  /** Pfeilschuss: Sehne und Zischen */
  arrowShot(env, t, p) {
    const v = p.v ?? 1;
    const k = jit(env, 0.12);
    tone(env, t, { freq: 190 * k, slideTo: 85, dur: 0.1, gain: 0.2 * v, type: 'sine' });
    tone(env, t, { freq: 520 * k, slideTo: 260 * k, dur: 0.05, gain: 0.07 * v, type: 'triangle' });
    noise(env, t + 0.015, { dur: 0.18, gain: 0.1 * v, freq: 4800, sweepTo: 2200, q: 0.9, type: 'bandpass', attack: 0.03 });
    return 0.25;
  },
  /** Pfeileinschlag: dumpfes Stecken */
  arrowHit(env, t, p) {
    const v = p.v ?? 1;
    const k = jit(env, 0.15);
    noise(env, t, { dur: 0.05, gain: 0.22 * v, freq: 1100 * k, type: 'lowpass' });
    tone(env, t, { freq: 230 * k, slideTo: 130, dur: 0.07, gain: 0.2 * v, type: 'triangle' });
    return 0.12;
  },
  /** Nahkampf: Schwertklirren / Trefferdumpfen */
  swordHit(env, t, p) {
    const v = p.v ?? 1;
    const k = jit(env, 0.18);
    const metal = env.rand() < 0.6;
    noise(env, t, { dur: 0.04, gain: 0.25 * v, freq: 3600 * k, q: 1.4, type: 'bandpass' });
    if (metal) bell(env, t, 1250 * k, 0.28, 0.13 * v, [1, 1.51, 2.37, 3.31]);
    tone(env, t, { freq: 160 * k, slideTo: 90, dur: 0.08, gain: 0.22 * v, type: 'sine' });
    return metal ? 0.3 : 0.12;
  },
  /** Katapult/Trebuchet: Auslöser und Sehnenschlag */
  catapult(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.35, gain: 0.25 * v, freq: 700, sweepTo: 200, type: 'lowpass', q: 0.9 });
    tone(env, t, { freq: 100, slideTo: 42, dur: 0.4, gain: 0.35 * v, type: 'sine' });
    tone(env, t, { freq: 150 * jit(env, 0.08), slideTo: 55, dur: 0.22, gain: 0.12 * v, type: 'sawtooth', lp: 500 });
    noise(env, t + 0.02, { dur: 0.1, gain: 0.12 * v, freq: 1500, q: 2 });
    return 0.5;
  },
  /** Schwerer Einschlag */
  siegeImpact(env, t, p) {
    const v = p.v ?? 1;
    tone(env, t, { freq: 115 * jit(env, 0.1), slideTo: 34, dur: 0.6, gain: 0.5 * v, type: 'sine' });
    noise(env, t, { dur: 0.55, gain: 0.35 * v, freq: 560, sweepTo: 160, type: 'lowpass' });
    noise(env, t, { dur: 0.1, gain: 0.2 * v, freq: 2500, q: 1, type: 'highpass' });
    for (let i = 0; i < 3; i++) noise(env, t + 0.1 + i * 0.07 + env.rand() * 0.05, { dur: 0.06, gain: 0.1 * v, freq: 700 + env.rand() * 1200, q: 3 });
    return 0.7;
  },
  /** Mauer- oder Gebäudeeinsturz */
  wallCollapse(env, t, p) {
    const v = p.v ?? 1;
    const wood = !!p.wood;
    noise(env, t, { dur: 1.4, gain: 0.35 * v, freq: wood ? 900 : 380, sweepTo: wood ? 300 : 140, type: 'lowpass', q: 0.8, attack: 0.08 });
    tone(env, t, { freq: 72, slideTo: 30, dur: 1.1, gain: 0.4 * v, type: 'sine', attack: 0.03 });
    for (let i = 0; i < 7; i++) {
      const at = 0.08 + i * 0.12 + env.rand() * 0.08;
      noise(env, t + at, { dur: 0.07, gain: 0.12 * v * (1 - i * 0.08), freq: (wood ? 700 : 1100) + env.rand() * 1800, q: 3 });
      if (wood) tone(env, t + at, { freq: 260 + env.rand() * 200, slideTo: 150, dur: 0.06, gain: 0.07 * v, type: 'triangle' });
    }
    return 1.6;
  },
  /** Feuer: Knistern */
  fire(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.5, gain: 0.07 * v, freq: 260, type: 'lowpass', attack: 0.08, shape: 'sustain' });
    for (let i = 0; i < 7; i++) {
      noise(env, t + env.rand() * 0.45, { dur: 0.015 + env.rand() * 0.02, gain: (0.06 + env.rand() * 0.12) * v, freq: 2400 + env.rand() * 3400, q: 1.2, type: 'bandpass' });
    }
    return 0.55;
  },
  /** Tor öffnen: Knarren und Ketten */
  gateOpen(env, t, p) {
    const v = p.v ?? 1;
    tone(env, t, { freq: 58, slideTo: 96, dur: 0.75, gain: 0.2 * v, type: 'sawtooth', lp: 320, attack: 0.1, vib: { rate: 6, depth: 0.04 }, shape: 'sustain' });
    noise(env, t + 0.02, { dur: 0.6, gain: 0.09 * v, freq: 520, sweepTo: 760, q: 4, type: 'bandpass', attack: 0.1, shape: 'sustain' });
    for (let i = 0; i < 6; i++) noise(env, t + 0.05 + i * 0.1, { dur: 0.025, gain: 0.07 * v, freq: 4200 + env.rand() * 1500, q: 4 });
    return 0.9;
  },
  /** Tor schließen: kurzes Knarren, schwerer Schlag */
  gateClose(env, t, p) {
    const v = p.v ?? 1;
    tone(env, t, { freq: 96, slideTo: 60, dur: 0.45, gain: 0.16 * v, type: 'sawtooth', lp: 300, attack: 0.05, shape: 'sustain' });
    const at = 0.42;
    tone(env, t + at, { freq: 84, slideTo: 36, dur: 0.4, gain: 0.5 * v, type: 'sine' });
    noise(env, t + at, { dur: 0.25, gain: 0.3 * v, freq: 420, type: 'lowpass' });
    return at + 0.5;
  },
  /** Rekrutierung: Hornstoß und Trommelschlag */
  recruit(env, t, p) {
    const v = p.v ?? 1;
    drum(env, t, 'dum', 0.9 * v);
    horn(env, t + 0.05, 146.83, 0.42, 0.22 * v, 0.9);
    horn(env, t + 0.4, 220, 0.55, 0.22 * v, 0.9);
    drum(env, t + 0.4, 'dum', 0.7 * v);
    return 1;
  },
  /** Öl: Zischen und Blubbern */
  oil(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.9, gain: 0.14 * v, freq: 4200, q: 0.7, type: 'highpass', attack: 0.1 });
    noise(env, t, { dur: 0.8, gain: 0.12 * v, freq: 300, sweepTo: 600, type: 'lowpass' });
    for (let i = 0; i < 4; i++) tone(env, t + 0.1 + i * 0.15 + env.rand() * 0.07, { freq: 180 + env.rand() * 150, slideTo: 420, dur: 0.06, gain: 0.07 * v, type: 'sine' });
    return 1;
  },
  /** Heilung: heller Glockenton */
  heal(env, t, p) {
    const v = p.v ?? 1;
    tone(env, t, { freq: 880, slideTo: 1320, dur: 0.3, gain: 0.1 * v, type: 'sine' });
    bell(env, t + 0.08, 1760 * jit(env, 0.02), 0.5, 0.06 * v, [1, 2.0]);
    return 0.6;
  },
  /** Banner / Fahne erobert */
  banner(env, t, p) {
    const v = p.v ?? 1;
    horn(env, t, 196, 0.5, 0.2 * v);
    horn(env, t + 0.18, 293.66, 0.7, 0.2 * v);
    return 0.95;
  },
  splash(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.3, gain: 0.14 * v, freq: 500, sweepTo: 1400, q: 1.5, type: 'bandpass', attack: 0.03 });
    return 0.35;
  },
  // ---- Oberfläche ----
  uiHover(env, t) {
    tone(env, t, { freq: 1500 * jit(env, 0.03), dur: 0.025, gain: 0.05, type: 'sine', attack: 0.003 });
    return 0.05;
  },
  uiClick(env, t) {
    tone(env, t, { freq: 560 * jit(env, 0.03), slideTo: 380, dur: 0.06, gain: 0.16, type: 'triangle' });
    noise(env, t, { dur: 0.02, gain: 0.06, freq: 2400, q: 1.5 });
    return 0.1;
  },
  uiConfirm(env, t) {
    tone(env, t, { freq: 440, dur: 0.11, gain: 0.12, type: 'triangle' });
    bell(env, t + 0.07, 660, 0.3, 0.12, [1, 2.0, 3.0]);
    return 0.4;
  },
  uiError(env, t) {
    tone(env, t, { freq: 150, slideTo: 105, dur: 0.17, gain: 0.2, type: 'sawtooth', lp: 650 });
    return 0.2;
  },
  /** Berater: Gong */
  gong(env, t, p) {
    const v = p.v ?? 1;
    noise(env, t, { dur: 0.05, gain: 0.12 * v, freq: 1200, q: 1 });
    bell(env, t, 164.8 * jit(env, 0.01), 2.2, 0.32 * v, [1, 1.5, 2.0, 2.74, 3.76, 5.1], 0.5);
    bell(env, t + 0.28, 123.5, 1.8, 0.22 * v, [1, 1.5, 2.0, 2.74], 0.6);
    return 2.4;
  },
  /** Berater: leiser Hinweis */
  notice(env, t, p) {
    const v = p.v ?? 1;
    bell(env, t, 523.25, 0.45, 0.14 * v, [1, 2.0, 3.0]);
    bell(env, t + 0.14, 659.25, 0.6, 0.14 * v, [1, 2.0, 3.0]);
    return 0.8;
  },
  /** Sieg: Fanfare aus Hörnern und Trommeln (eigene Tonfolge aus dem D-Dur-Dreiklang) */
  victory(env, t) {
    const notes: [number, number, number][] = [
      [293.66, 0, 0.3],
      [369.99, 0.32, 0.3],
      [440, 0.64, 0.3],
      [587.33, 0.96, 0.9],
      [440, 1.9, 0.3],
      [587.33, 2.22, 1.2],
    ];
    for (const [f, at, d] of notes) horn(env, t + at, f, d + 0.1, 0.2);
    horn(env, t + 2.22, 369.99, 1.3, 0.14);
    horn(env, t + 2.22, 146.83, 1.4, 0.16);
    for (let i = 0; i < 4; i++) drum(env, t + i * 0.32, i % 2 ? 'tek' : 'dum', 0.8);
    for (let i = 0; i < 8; i++) drum(env, t + 1.7 + i * 0.07, 'ka', 0.3 + i * 0.07);
    drum(env, t + 2.22, 'dum', 1);
    return 3.6;
  },
  /** Niederlage: tiefe absteigende Hörner, dumpfe Trommel */
  defeat(env, t) {
    const notes: [number, number, number][] = [
      [220, 0, 0.7],
      [196, 0.8, 0.7],
      [174.6, 1.6, 0.7],
      [146.83, 2.4, 1.6],
    ];
    for (const [f, at, d] of notes) horn(env, t + at, f, d + 0.1, 0.2, 0.7);
    horn(env, t + 2.4, 73.42, 1.7, 0.2, 0.6);
    drum(env, t, 'beat', 0.9);
    drum(env, t + 1.6, 'beat', 0.9);
    drum(env, t + 2.4, 'beat', 1);
    pluck(env, t + 2.4, { midi: 38, gain: 0.3, dur: 1.5 });
    return 4.2;
  },
} satisfies Record<string, SfxFn>;

export type SfxId = keyof typeof SFX;
export const SFX_IDS = Object.keys(SFX) as SfxId[];
