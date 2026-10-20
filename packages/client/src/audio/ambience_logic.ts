/**
 * Reine Logik der Umgebungsgeräusche (Meilenstein 4G, ohne WebAudio, getestet in `audio_ambience.test.ts`):
 * aus Kameraposition/Zoom, Umgebung (Wasser, Bäume, offenes Land), Siedlungsdichte und Spiellage (Frieden/Spannung/Schlacht)
 * werden Zielpegel der Klangbetten und Ereignisraten abgeleitet; Quellen je Typ werden begrenzt (nächste gewinnen,
 * Lautstärke nach Dichte kompressiv).
 */
import type { GameMood } from './theory';

/** Beobachtungen aus dem Client-Spiegel (Soundscape liefert sie alle 0,25 s) */
export interface AmbienceInput {
  /** Kameraabstand (Zoom): klein = nah */
  dist: number;
  mood: GameMood;
  /** Anteil Wasser (Wasser/Gräben) um den Blickpunkt, 0..1 */
  water: number;
  /** Richtung des Wassers (−1 links .. +1 rechts) */
  waterPan: number;
  /** Baumdichte um den Blickpunkt 0..1 */
  trees: number;
  /** Offenes Land (weder Bäume noch Fels) 0..1 */
  open: number;
  /** Gebäude im Sichtbereich (ohne Mauern) */
  built: number;
  /** Bewohner (Bauern) im Sichtbereich */
  folk: number;
  /** Märkte im Sichtbereich */
  markets: number;
  /** Brennende Gebäude: Pegel 0..1 (Entfernung berücksichtigt) und Richtung */
  fire: number;
  firePan: number;
  /** Kampfgeschehen außerhalb des Bildes (hörbar, nicht sichtbar): Ereignisse/s, geglättet */
  farCombat: number;
  farCombatPan: number;
  /** Kampfgeschehen im Bild: Ereignisse/s, geglättet */
  nearCombat: number;
}

export const QUIET_INPUT: AmbienceInput = {
  dist: 38,
  mood: 'build',
  water: 0,
  waterPan: 0,
  trees: 0,
  open: 1,
  built: 0,
  folk: 0,
  markets: 0,
  fire: 0,
  firePan: 0,
  farCombat: 0,
  farCombatPan: 0,
  nearCombat: 0,
};

/** Zielpegel der Klangbetten (0..1) mit Stereolage und Ereignisraten (je Minute) */
export interface AmbienceTargets {
  wind: number;
  rustle: number;
  water: number;
  waterPan: number;
  murmur: number;
  fire: number;
  firePan: number;
  din: number;
  dinPan: number;
  /** Ereignisse je Minute (einzeln eingeplant, mit Zufall) */
  birdsPerMin: number;
  /** Anteil der Betten insgesamt (kompressive Obergrenze) */
  master: number;
}

/** Alle Betten aus (Hauptmenü, kein Spiel) */
export const SILENT_TARGETS: AmbienceTargets = { wind: 0, rustle: 0, water: 0, waterPan: 0, murmur: 0, fire: 0, firePan: 0, din: 0, dinPan: 0, birdsPerMin: 0, master: 1 };

const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Nähe der Kamera: 1 bei starkem Zoom (Details hörbar), 0 weit herausgezoomt (nur Wind/Ferne) */
export function nearness(dist: number): number {
  return 1 - clamp((dist - 12) / 70);
}

/** Wie sehr die Naturgeräusche zurückstehen: Frieden 1, Spannung 0,65, Schlacht 0,3 */
export function natureFactor(mood: GameMood, nearCombat: number): number {
  const base = mood === 'build' ? 1 : mood === 'tension' ? 0.65 : 0.3;
  return base * (1 - 0.5 * smoothstep(0.5, 4, nearCombat));
}

/**
 * Zielpegel aus den Beobachtungen. Eigenschaften (Tests):
 * - alle Pegel in 0..1, monoton: mehr Wasser → mehr Wasser, mehr Bauern → mehr Gemurmel (sättigend)
 * - Zoom: nah = Details (Wasser, Vögel, Gemurmel), fern = Wind und Ferne
 * - Schlacht dämpft Natur und Siedlung, hebt das ferne Kampfgeräusch
 * - Summe der Betten ist begrenzt (`master`)
 */
export function computeAmbience(i: AmbienceInput): AmbienceTargets {
  const near = nearness(i.dist);
  const nat = natureFactor(i.mood, i.nearCombat);
  const calm = i.mood === 'battle' ? 0.35 : i.mood === 'tension' ? 0.7 : 1;

  const wind = clamp((0.3 + 0.45 * i.open) * (0.65 + 0.35 * (1 - near)) * (0.55 + 0.45 * nat));
  const rustle = clamp(Math.pow(i.trees, 0.8) * 0.8 * (0.35 + 0.65 * near) * nat);
  const water = clamp(Math.pow(clamp(i.water * 3.5), 0.8) * (0.3 + 0.7 * near) * (0.6 + 0.4 * nat));
  // Gemurmel: sättigend in der Zahl der Bewohner, Märkte und viele Gebäude geben Grundbelebung
  const folkLevel = 1 - Math.exp(-i.folk / 14);
  const murmur = clamp((0.55 * folkLevel + 0.2 * clamp(i.markets / 2) + 0.15 * clamp(i.built / 25)) * (0.2 + 0.8 * near) * calm);
  const fire = clamp(i.fire * (0.4 + 0.6 * near));
  const din = clamp(smoothstep(0.25, 4, i.farCombat) * (i.mood === 'battle' ? 1 : 0.7));
  const birdsPerMin = i.mood === 'battle' ? 0 : 6.5 * Math.pow(clamp(0.25 + i.trees), 0.7) * near * nat * (0.3 + 0.7 * calm);

  const sum = wind + rustle + water + murmur + fire + din;
  // kompressive Obergrenze: ab Summe 1,6 werden alle Betten gemeinsam leiser
  const master = sum > 1.6 ? 1.6 / sum : 1;
  return { wind, rustle, water, waterPan: clamp(i.waterPan, -1, 1), murmur, fire, firePan: clamp(i.firePan, -1, 1), din, dinPan: clamp(i.farCombatPan, -1, 1), birdsPerMin, master };
}

/** Weicher Übergang der Zielpegel (zeitkonstant `tau` in Sekunden) */
export function smoothTargets(prev: AmbienceTargets, next: AmbienceTargets, dt: number, tau = 1.6): AmbienceTargets {
  const a = 1 - Math.exp(-Math.max(0, dt) / tau);
  const out = { ...next };
  for (const k of Object.keys(next) as (keyof AmbienceTargets)[]) out[k] = prev[k] + (next[k] - prev[k]) * a;
  out.birdsPerMin = next.birdsPerMin;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Quellen begrenzen

export interface SoundSource {
  id: number;
  x: number;
  y: number;
}

/** Die `maxN` Quellen, die dem Hörer am nächsten sind (stabil: bei Gleichstand kleinere Kennung zuerst) */
export function nearestSources<T extends SoundSource>(list: T[], lx: number, ly: number, maxN: number): T[] {
  return list
    .map((s) => ({ s, d: (s.x - lx) * (s.x - lx) + (s.y - ly) * (s.y - ly) }))
    .sort((a, b) => a.d - b.d || a.s.id - b.s.id)
    .slice(0, Math.max(0, maxN))
    .map((e) => e.s);
}

/**
 * Lautstärkefaktor bei `n` gleichartigen hörbaren Quellen: kompressiv (1 bei einer, danach langsam fallend),
 * damit mehrere Schmieden keine Hammerwand ergeben. Die Gesamtenergie wächst höchstens mit der Wurzel von n.
 */
export function densityGain(n: number): number {
  return n <= 1 ? 1 : Math.pow(n, -0.45);
}

/** Zeitversatz je Quelle (Phase), damit mehrere gleichartige Quellen nicht im Gleichtakt arbeiten */
export function phaseOffset(id: number, period: number): number {
  const h = Math.sin(id * 12.9898 + 78.233) * 43758.5453;
  return (h - Math.floor(h)) * period;
}

/** Wie viele Quellen je Typ höchstens hörbar sind */
export const MAX_SOURCES: Record<string, number> = { smith: 3, mill: 2, pick: 3, chop: 3, crackle: 2 };

// ---------------------------------------------------------------------------------------------
// Ereignisplanung (Vögel, Knistern, ferne Gefechtsgeräusche)

export type AmbEventKind = 'bird' | 'clash' | 'crackle';

export interface AmbEvent {
  kind: AmbEventKind;
  pan: number;
  /** 0..1 Entfernung (0 nah, 1 fern) */
  far: number;
  /** Zufallswert für die Variante */
  r: number;
}

/**
 * Plant einzelne Ereignisse zufällig (Poisson-artig) mit Mindestabstand und Obergrenze gleichzeitiger Ereignisse.
 * `rand` ist injizierbar (Tests deterministisch).
 */
export class AmbienceScheduler {
  private since = { bird: 99, clash: 99, crackle: 99 };
  private active: { kind: AmbEventKind; end: number }[] = [];
  private clock = 0;

  constructor(private rand: () => number = Math.random) {}

  static readonly MIN_GAP: Record<AmbEventKind, number> = { bird: 2.2, clash: 0.25, crackle: 0.06 };
  static readonly MAX_ACTIVE: Record<AmbEventKind, number> = { bird: 2, clash: 3, crackle: 3 };

  /** Ereignis ist gestartet (Dauer in s); damit zählt es gegen die Obergrenze */
  started(kind: AmbEventKind, dur: number): void {
    this.active.push({ kind, end: this.clock + dur });
  }

  concurrent(kind: AmbEventKind): number {
    return this.active.filter((a) => a.kind === kind && a.end > this.clock).length;
  }

  /** Ein Schritt von `dt` Sekunden; liefert die jetzt fälligen Ereignisse */
  tick(dt: number, t: AmbienceTargets, i: Pick<AmbienceInput, 'farCombat' | 'fire'>): AmbEvent[] {
    this.clock += dt;
    this.active = this.active.filter((a) => a.end > this.clock);
    const out: AmbEvent[] = [];
    const rates: Record<AmbEventKind, number> = {
      bird: t.birdsPerMin / 60,
      clash: t.din * (1.2 + 3.2 * clamp(i.farCombat / 6)),
      crackle: t.fire * 5.5,
    };
    for (const k of ['bird', 'clash', 'crackle'] as AmbEventKind[]) {
      this.since[k] += dt;
      if (rates[k] <= 0 || this.since[k] < AmbienceScheduler.MIN_GAP[k]) continue;
      if (this.concurrent(k) + out.filter((o) => o.kind === k).length >= AmbienceScheduler.MAX_ACTIVE[k]) continue;
      if (this.rand() < 1 - Math.exp(-rates[k] * dt)) {
        this.since[k] = 0;
        const pan = k === 'clash' ? clamp(t.dinPan + (this.rand() - 0.5) * 0.5, -1, 1) : k === 'crackle' ? clamp(t.firePan + (this.rand() - 0.5) * 0.2, -1, 1) : (this.rand() * 2 - 1) * 0.85;
        out.push({ kind: k, pan, far: k === 'bird' ? 0.2 + this.rand() * 0.7 : k === 'clash' ? 0.5 + this.rand() * 0.5 : 0.1, r: this.rand() });
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Umgebung abtasten

export interface SurroundMap {
  w: number;
  h: number;
  terrain: ArrayLike<number>;
  trees: ArrayLike<number>;
}

export interface Surround {
  water: number;
  waterPan: number;
  trees: number;
  open: number;
}

/**
 * Tastet die Karte im Umkreis `radius` (Tiles) um den Blickpunkt ab (gerastert, nach Nähe gewichtet).
 * `isWater`/`isRock` klassifizieren Terrain-IDs; `yaw` bestimmt die Stereorichtung (rechts = (cos yaw, −sin yaw)).
 */
export function scanSurroundings(map: SurroundMap, cx: number, cy: number, yaw: number, radius: number, isWater: (t: number) => boolean, isRock: (t: number) => boolean): Surround {
  const step = Math.max(1, Math.round(radius / 9));
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  let wSum = 0;
  let wWater = 0;
  let wTree = 0;
  let wRock = 0;
  let side = 0;
  const x0 = Math.floor(cx - radius);
  const y0 = Math.floor(cy - radius);
  for (let y = y0; y <= cy + radius; y += step) {
    for (let x = x0; x <= cx + radius; x += step) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const w = 1 - 0.6 * (d / radius);
      wSum += w;
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const i = y * map.w + x;
      const tr = map.terrain[i];
      if (isWater(tr)) {
        wWater += w;
        side += w * ((dx * rx + dy * ry) / radius);
      } else if (isRock(tr)) wRock += w;
      else if (map.trees[i] > 0) wTree += w;
    }
  }
  if (wSum <= 0) return { water: 0, waterPan: 0, trees: 0, open: 1 };
  const water = wWater / wSum;
  return {
    water,
    waterPan: wWater > 0 ? clamp((side / wWater) * 2.2, -1, 1) : 0,
    trees: clamp(wTree / wSum),
    open: clamp(1 - wTree / wSum - wRock / wSum),
  };
}
