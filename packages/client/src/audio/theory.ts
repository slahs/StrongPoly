/**
 * Reine Musiktheorie und Phrasen-Erzeugung (keine WebAudio-/DOM-Abhängigkeit, daher testbar).
 * Alles hier ist eigene Komposition per Algorithmus: modale Skalen, Rhythmuszyklen als
 * allgemeine Muster, Melodien als gewichteter Zufallsgang über Skalenstufen.
 */

export type MoodId = 'build' | 'tension' | 'battle' | 'menu' | 'victory' | 'defeat';
export type GameMood = 'build' | 'tension' | 'battle';
export type ThemeId = 'menu' | 'victory' | 'defeat';

/** Skalen als Halbtonabstände zum Grundton (12-TET-Näherung der Modi). */
export const SCALES = {
  /** Hijaz / Phrygisch-Dominant: der "nahöstliche" Klang */
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  /** Hijaz Kar / doppelt harmonisch: besonders dunkel und gespannt */
  hijazKar: [0, 1, 4, 5, 7, 8, 11],
  nahawand: [0, 2, 3, 5, 7, 8, 11],
  ajam: [0, 2, 4, 5, 7, 9, 11],
} as const;
export type ScaleName = keyof typeof SCALES;

/** Rhythmuszyklen über 8 Achtel: D = tiefer Schlag, T = heller Schlag, k = Fingerschlag, H = Herzschlag, h = Echo, '.' = Pause */
export const RHYTHMS = {
  maqsum: 'DT.TD.T.',
  saidi: 'DT.DD.T.',
  ayyub: 'D..DT...',
  heart: 'H...h...',
  drive: 'DTkTDDTk',
  war: 'DDTkDTDk',
  fanfare: 'D.TkD.TD',
  mourn: 'D.......',
} as const;
export type RhythmName = keyof typeof RHYTHMS;

export interface MoodConfig {
  scale: ScaleName;
  /** MIDI-Note des Grundtons (Melodieoktave) */
  root: number;
  bpm: number;
  /** Anteil belegter Achtel in der Melodie (0..1) */
  density: number;
  /** Wahrscheinlichkeit einer Vorschlagnote */
  ornament: number;
  /** Anteil langer Töne, die die Flöte statt der Laute spielt */
  fluteShare: number;
  rhythm: RhythmName;
  /** Wahrscheinlichkeit eines Trommelwirbels am Taktende */
  fill: number;
  /** Phrasenlänge in Achteln (zwei Zyklen) */
  steps: number;
  /** Melodie springt weiter (kämpferisch) oder bleibt eng */
  leap: number;
  /** Tremolo-gezupfte Laute (Spannung) */
  tremolo: boolean;
  /** Bereich der Skalenstufen (relativ zum Grundton, 7 Stufen je Oktave) */
  lo: number;
  hi: number;
}

export const MOODS: Record<MoodId, MoodConfig> = {
  build: { scale: 'dorian', root: 62, bpm: 72, density: 0.38, ornament: 0.18, fluteShare: 0.55, rhythm: 'maqsum', fill: 0, steps: 16, leap: 0.12, tremolo: false, lo: -3, hi: 8 },
  tension: { scale: 'phrygian', root: 62, bpm: 88, density: 0.3, ornament: 0.1, fluteShare: 0.6, rhythm: 'heart', fill: 0, steps: 16, leap: 0.1, tremolo: true, lo: -4, hi: 6 },
  battle: { scale: 'hijazKar', root: 62, bpm: 136, density: 0.7, ornament: 0.3, fluteShare: 0.15, rhythm: 'drive', fill: 0.5, steps: 16, leap: 0.35, tremolo: false, lo: -2, hi: 9 },
  menu: { scale: 'hijaz', root: 62, bpm: 84, density: 0.46, ornament: 0.3, fluteShare: 0.5, rhythm: 'saidi', fill: 0.1, steps: 16, leap: 0.18, tremolo: false, lo: -3, hi: 9 },
  victory: { scale: 'ajam', root: 62, bpm: 108, density: 0.6, ornament: 0.15, fluteShare: 0.35, rhythm: 'fanfare', fill: 0.4, steps: 16, leap: 0.4, tremolo: false, lo: 0, hi: 10 },
  defeat: { scale: 'nahawand', root: 62, bpm: 58, density: 0.22, ornament: 0.08, fluteShare: 0.8, rhythm: 'mourn', fill: 0, steps: 16, leap: 0.05, tremolo: false, lo: -4, hi: 5 },
};

export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

/** Zielpegel der Klangschichten je Stimmung (0..1), Grundlage für die weichen Übergänge. */
export interface LayerMix {
  drone: number;
  oud: number;
  flute: number;
  drum: number;
  heart: number;
  pad: number;
}
export const LAYER_MIX: Record<MoodId, LayerMix> = {
  build: { drone: 0.5, oud: 0.85, flute: 0.65, drum: 0.18, heart: 0, pad: 0 },
  tension: { drone: 0.75, oud: 0.5, flute: 0.35, drum: 0.3, heart: 0.9, pad: 0.7 },
  battle: { drone: 0.4, oud: 0.6, flute: 0.3, drum: 1, heart: 0, pad: 0.25 },
  menu: { drone: 0.5, oud: 0.85, flute: 0.85, drum: 0.35, heart: 0, pad: 0.2 },
  victory: { drone: 0.4, oud: 0.9, flute: 0.75, drum: 0.75, heart: 0, pad: 0.1 },
  defeat: { drone: 0.65, oud: 0.35, flute: 0.8, drum: 0.2, heart: 0.25, pad: 0.35 },
};

// ---------------------------------------------------------------------------------------------
// Zufall (deterministisch aus Seed)

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ---------------------------------------------------------------------------------------------
// Phrasen

export type NoteVoice = 'oud' | 'flute';
export interface PhraseNote {
  /** Startposition in Achteln (kann Bruchteile für Vorschläge haben) */
  step: number;
  /** Dauer in Achteln */
  dur: number;
  midi: number;
  /** Anschlagstärke 0..1 */
  vel: number;
  voice: NoteVoice;
  /** gezupft mit Tremolo (schnelle Wiederholung) */
  tremolo?: boolean;
  /** Vorschlagnote */
  grace?: boolean;
}
export type DrumKind = 'dum' | 'tek' | 'ka' | 'beat' | 'echo';
export interface PhraseDrum {
  step: number;
  kind: DrumKind;
  vel: number;
}
export interface Phrase {
  mood: MoodId;
  scale: ScaleName;
  scaleSteps: readonly number[];
  root: number;
  bpm: number;
  steps: number;
  notes: PhraseNote[];
  drums: PhraseDrum[];
  /** Bassnote (Laute, eine Oktave unter dem Grundton) für Harmonie */
  bass: PhraseNote[];
  /** letzte Skalenstufe, für nahtlose Fortsetzung */
  lastDegree: number;
}

export interface PhraseOpts {
  /** Skalenstufe, an die angeknüpft wird */
  startDegree?: number;
  /** Schlussphrase: endet lang auf dem Grundton */
  final?: boolean;
}

/** Skalenstufe (auch negativ/oktavübergreifend) → MIDI */
export function degreeToMidi(scale: readonly number[], root: number, degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + oct * 12 + scale[idx];
}

/** Gehört die MIDI-Note zur Skala (Tonart relativ zu root)? */
export function inScale(scale: readonly number[], root: number, midi: number): boolean {
  const pc = (((midi - root) % 12) + 12) % 12;
  return scale.includes(pc);
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

export function generatePhrase(seed: number, mood: MoodId, opts: PhraseOpts = {}): Phrase {
  const cfg = MOODS[mood];
  const rng = mulberry32(hashSeed(seed, MOOD_IDS.indexOf(mood) + 1, 7919));
  const scale = SCALES[cfg.scale];
  const steps = cfg.steps;
  // Tempo leicht gestreut, bleibt aber klar im Bereich der Stimmung
  const bpm = Math.round(cfg.bpm * (0.97 + rng() * 0.06));

  // Rhythmus der Melodie: betonte Zählzeiten sicher belegen, Rest nach Dichte
  const onset: boolean[] = new Array(steps).fill(false);
  for (let s = 0; s < steps; s++) {
    const strong = s % 8 === 0 ? 1 : s % 4 === 0 ? 0.65 : s % 2 === 0 ? 0.35 : 0.2;
    const p = Math.min(0.97, cfg.density * (0.55 + strong * 0.9));
    onset[s] = rng() < p;
  }
  onset[0] = true;
  if (opts.final) {
    for (let s = steps - 5; s < steps; s++) onset[s] = false;
    onset[steps - 4] = true;
  }
  // nicht zu viele Pausen hintereinander
  let gap = 0;
  for (let s = 0; s < steps; s++) {
    if (onset[s]) gap = 0;
    else if (++gap > 5) {
      onset[s] = true;
      gap = 0;
    }
  }

  // Melodie: Zufallsgang über Skalenstufen mit Kadenz am Ende
  let deg = opts.startDegree ?? pick(rng, [0, 2, 4, 7]);
  deg = Math.max(cfg.lo, Math.min(cfg.hi, deg));
  const notes: PhraseNote[] = [];
  const onsets: number[] = [];
  for (let s = 0; s < steps; s++) if (onset[s]) onsets.push(s);
  onsets.forEach((s, k) => {
    const last = k === onsets.length - 1;
    const prev = deg;
    if (k > 0) {
      if (rng() < cfg.leap) deg += pick(rng, [-4, -3, 3, 4, 2, -2]);
      else deg += pick(rng, [-2, -1, -1, -1, 0, 1, 1, 1, 2]);
      // sanft in den Tonraum zurückziehen
      if (deg > cfg.hi) deg -= 2 + Math.floor(rng() * 3);
      if (deg < cfg.lo) deg += 2 + Math.floor(rng() * 3);
    }
    if (last) {
      // Kadenz: Grundton oder Quinte, oft von der zweiten Stufe her angesteuert
      const targets = opts.final ? [0, 7] : [0, 0, 4, 7, 3];
      const want = pick(rng, targets);
      // nur Kandidaten im Tonraum, damit die Schlussnote sicher Grundton oder Quinte bleibt
      let best = NaN;
      for (let k = -3; k <= 3; k++) {
        const c = want + 7 * k;
        if (c < cfg.lo || c > cfg.hi) continue;
        if (Number.isNaN(best) || Math.abs(c - prev) < Math.abs(best - prev)) best = c;
      }
      deg = Number.isNaN(best) ? 0 : best;
    }
    const nextOnset = onsets[k + 1] ?? steps;
    let dur = nextOnset - s;
    if (last && opts.final) dur = Math.max(dur, 8);
    dur = Math.min(dur, 6);
    if (opts.final && last) dur = 8;
    const long = dur >= 2.5;
    const voice: NoteVoice = long ? (rng() < cfg.fluteShare + 0.35 ? 'flute' : 'oud') : rng() < cfg.fluteShare * 0.35 ? 'flute' : 'oud';
    const midi = degreeToMidi(scale, cfg.root, deg);
    const accent = s % 4 === 0 ? 0.12 : 0;
    const vel = Math.min(1, 0.55 + accent + rng() * 0.25);
    // Vorschlagnote (Verzierung) vor dem Hauptton
    if (!last && k > 0 && rng() < cfg.ornament && s - 0.25 > 0) {
      const g = degreeToMidi(scale, cfg.root, deg + pick(rng, [1, -1]));
      notes.push({ step: s - 0.25, dur: 0.25, midi: g, vel: vel * 0.6, voice: 'oud', grace: true });
    }
    notes.push({ step: s, dur, midi, vel, voice, tremolo: cfg.tremolo && voice === 'oud' && dur >= 3 ? true : undefined });
  });

  // Bass: Grundton am Zyklusanfang, Quinte in der Mitte (Laute, tief)
  const bass: PhraseNote[] = [];
  for (let s = 0; s < steps; s += 8) {
    bass.push({ step: s, dur: 4, midi: cfg.root - 24, vel: 0.7, voice: 'oud' });
    if (mood !== 'tension' && mood !== 'defeat') bass.push({ step: s + 4, dur: 2, midi: degreeToMidi(scale, cfg.root - 24, rng() < 0.7 ? 4 : 3), vel: 0.5, voice: 'oud' });
  }

  // Trommeln aus dem Rhythmuszyklus
  const drums: PhraseDrum[] = [];
  const pat = RHYTHMS[cfg.rhythm];
  for (let s = 0; s < steps; s++) {
    const ch = pat[s % pat.length];
    const accent = s % 8 === 0 ? 1 : 0.8;
    const jitter = 0.9 + rng() * 0.2;
    if (ch === 'D') drums.push({ step: s, kind: 'dum', vel: accent * jitter });
    else if (ch === 'T') drums.push({ step: s, kind: 'tek', vel: 0.75 * jitter });
    else if (ch === 'k') drums.push({ step: s, kind: 'ka', vel: 0.5 * jitter });
    else if (ch === 'H') drums.push({ step: s, kind: 'beat', vel: jitter });
    else if (ch === 'h') drums.push({ step: s, kind: 'echo', vel: 0.65 * jitter });
  }
  // Wirbel am Ende des zweiten Zyklus
  if (rng() < cfg.fill) {
    for (let s = steps - 3; s < steps; s += 0.5) drums.push({ step: s, kind: 'ka', vel: 0.4 + (s - (steps - 3)) * 0.15 });
    drums.push({ step: steps - 0.5, kind: 'dum', vel: 0.9 });
  }
  drums.sort((a, b) => a.step - b.step);
  notes.sort((a, b) => a.step - b.step);

  return { mood, scale: cfg.scale, scaleSteps: scale, root: cfg.root, bpm, steps, notes, drums, bass, lastDegree: deg };
}

/** Dauer eines Achtels in Sekunden */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 2;
}

/** Anzahl der Phrasen eines endlichen Themas (0 = Endlosschleife). */
export const THEME_PHRASES: Record<ThemeId, number> = { menu: 0, victory: 3, defeat: 2 };
