import { TICK_RATE } from '@strongpoly/shared';
import { WALL_SWEEP } from './build_config';

/**
 * Reine Funktionen der Bauinszenierung (4C): Zeit → Fortschritt → Stadium → Darstellungsparameter.
 * Kein Zugriff auf Szene oder Sim; alles lässt sich ohne Browser testen.
 */

/** Alter einer Baustelle in Ticks: Weltzeit minus Platzierungs-Tick plus Interpolationsanteil (0..1) */
export function buildAgeTicks(tick: number, born: number, alpha: number): number {
  return tick - born + Math.min(1, Math.max(0, alpha));
}

/**
 * Baufortschritt 0..1. `born <= 0` (von Beginn an vorhanden, auch Spielstände ohne Platzierungs-Tick) und
 * `durTicks <= 0` ergeben immer 1. Ein Gebäude, dessen Platzierung länger zurückliegt als die Dauer
 * (Reconnect, Laden, Voll-Snapshot), ist fertig und wird nie neu aufgebaut.
 */
export function buildProgress(tick: number, born: number, alpha: number, durTicks: number, delayTicks = 0): number {
  if (born <= 0 || durTicks <= 0) return 1;
  const age = buildAgeTicks(tick, born, alpha) - delayTicks;
  if (age <= 0) return 0;
  if (age >= durTicks) return 1;
  return age / durTicks;
}

export type BuildStage = 'ground' | 'frame' | 'raise' | 'finish' | 'done';

export const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** Darstellungsparameter eines Baufortschritts p (0..1) */
export interface ConstructionParams {
  stage: BuildStage;
  /** Fortschritt für die Teilefenster im Shader (entspricht p, 1 = fertiges Modell) */
  raise: number;
  /** Fundamentplatte sichtbar (0..1, Aufblenden); bei Fertigstellung 0 */
  ground: number;
  /** Höhe der Gerüstspitze als Anteil der Gebäudehöhe (steigt, wird am Ende wieder abgebaut) */
  scaffold: number;
  /** Baumaterial am Boden (Stapel); wächst zu Beginn, wird verbraucht */
  materials: number;
  /** Staub-/Arbeitsintensität 0..1 */
  dust: number;
  /** Gebäude ist fertig dargestellt (Konstruktionspfad nicht mehr nötig) */
  done: boolean;
}

export const STAGE_BOUNDS = { ground: 0.1, frame: 0.3, raise: 0.8 };

export function constructionParams(p: number): ConstructionParams {
  if (p >= 1) return { stage: 'done', raise: 1, ground: 0, scaffold: 0, materials: 0, dust: 0, done: true };
  const q = clamp01(p);
  const stage: BuildStage = q < STAGE_BOUNDS.ground ? 'ground' : q < STAGE_BOUNDS.frame ? 'frame' : q < STAGE_BOUNDS.raise ? 'raise' : 'finish';
  const up = smooth((q - 0.04) / 0.62);
  const dismantle = smooth((q - 0.8) / 0.2);
  const scaffold = (q <= 0.04 ? 0.22 * smooth(q / 0.04) : 0.22 + 0.78 * up) * (1 - dismantle);
  const materials = smooth(q / 0.08) * (1 - smooth((q - 0.7) / 0.28));
  const dust = Math.sin(Math.PI * clamp01(q)) * (0.5 + 0.5 * smooth(q / 0.2));
  return { stage, raise: q, ground: smooth(q / 0.06) * (1 - smooth((q - 0.86) / 0.12)), scaffold, materials, dust, done: false };
}

/**
 * Reihenfolge der Stücke einer gezogenen Mauerlinie: Breitensuche ab einem Ende, damit der Zug
 * zusammenhängend entlangläuft (kein Springen). `pieces` sind Kacheln gleicher Platzierungs-Tick;
 * Rückgabe: Index je Stück in der Reihenfolge der Ausbreitung (0 = erstes).
 */
export function wallOrder(pieces: { id: number; x: number; y: number }[]): Map<number, number> {
  const out = new Map<number, number>();
  if (!pieces.length) return out;
  const at = new Map<number, (typeof pieces)[number]>();
  const key = (x: number, y: number): number => y * 65536 + x;
  for (const p of pieces) at.set(key(p.x, p.y), p);
  const deg = (p: { x: number; y: number }): number => [[1, 0], [-1, 0], [0, 1], [0, -1]].reduce((n, [dx, dy]) => n + (at.has(key(p.x + dx, p.y + dy)) ? 1 : 0), 0);
  const seen = new Set<number>();
  let idx = 0;
  // Komponenten einzeln, jeweils ab dem Endstück (kleinster Grad, dann kleinste Koordinate)
  const sorted = [...pieces].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const root of sorted) {
    if (seen.has(root.id)) continue;
    // Komponente einsammeln
    const comp: (typeof pieces)[number][] = [];
    const stack = [root];
    const mark = new Set<number>([root.id]);
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = at.get(key(c.x + dx, c.y + dy));
        if (n && !mark.has(n.id)) {
          mark.add(n.id);
          stack.push(n);
        }
      }
    }
    comp.sort((a, b) => deg(a) - deg(b) || a.y - b.y || a.x - b.x);
    const queue = [comp[0]];
    const vis = new Set<number>([comp[0].id]);
    while (queue.length) {
      const c = queue.shift()!;
      out.set(c.id, idx++);
      seen.add(c.id);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const n = at.get(key(c.x + dx, c.y + dy));
        if (n && !vis.has(n.id)) {
          vis.add(n.id);
          queue.push(n);
        }
      }
    }
  }
  return out;
}

/** Verzögerung (Ticks) des Stücks mit Ausbreitungsindex `index` in einer Gruppe von `count` Stücken */
export function wallDelayTicks(index: number, count: number): number {
  const per = count > 1 ? Math.min(WALL_SWEEP.perPiece, WALL_SWEEP.maxSweep / (count - 1)) : 0;
  return index * per * TICK_RATE;
}

/** Gesamtdauer (Ticks) einer Mauergruppe: letzte Verzögerung + Stückdauer */
export function wallGroupTicks(count: number, pieceTicks: number): number {
  return wallDelayTicks(Math.max(0, count - 1), count) + pieceTicks;
}
