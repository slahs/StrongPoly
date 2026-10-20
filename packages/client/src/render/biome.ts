import { T, hash2, valueNoise } from '@strongpoly/shared';

/**
 * Rein darstellungsseitige, deterministische Hilfen für Gelände und Vegetation (keine Sim-Daten werden verändert).
 * Alles hängt nur von Karten-Seed, Terraintyp und Tile-Koordinaten ab: gleiche Karte, gleiches Bild.
 */

export type BiomeId = 'dry' | 'temperate' | 'lush' | 'highland';

export interface Biome {
  id: BiomeId;
  /** wie stark Steppenflächen ins Grüne gehen (0 = Stroh, 1 = Wiese) */
  green: number;
  /** Anteil herbstlich gefärbter Laubbäume (0..1) */
  autumn: number;
  /** Zuschlag auf die Feuchte-Fleckung (verschiebt Wiese/Stroh) */
  moist: number;
}

const BIOMES: Record<BiomeId, Biome> = {
  dry: { id: 'dry', green: 0.0, autumn: 0.0, moist: -0.15 },
  temperate: { id: 'temperate', green: 0.28, autumn: 0.07, moist: 0 },
  lush: { id: 'lush', green: 0.68, autumn: 0.03, moist: 0.15 },
  highland: { id: 'highland', green: 0.22, autumn: 0.1, moist: -0.05 },
};

/** Biom einer Karte (jede Karte hat einen eigenen Grundcharakter) */
export function biomeOf(seed: number): Biome {
  const r = hash2(seed | 0, 91, 17);
  const id: BiomeId = r < 0.25 ? 'dry' : r < 0.62 ? 'temperate' : r < 0.88 ? 'lush' : 'highland';
  return BIOMES[id];
}

export type Species = 'spruce' | 'spruce2' | 'oak' | 'birch' | 'acacia' | 'cypress' | 'palm';
export const SPECIES: Species[] = ['spruce', 'spruce2', 'oak', 'birch', 'acacia', 'cypress', 'palm'];

/** Baumart eines Tiles: abhängig von Terrain, Höhenstufe (0..4), Biom und Zufallswert r (0..1) */
export function pickSpecies(b: Biome, terrain: number, height: number, r: number): Species {
  if (terrain === T.Oasis) {
    if (b.id === 'dry') return r < 0.8 ? 'palm' : 'acacia';
    if (b.id === 'highland') return r < 0.5 ? 'oak' : r < 0.8 ? 'birch' : 'palm';
    return r < 0.2 ? 'palm' : r < 0.6 ? 'oak' : 'birch';
  }
  if (terrain === T.Desert) return r < 0.7 ? 'acacia' : r < 0.85 ? 'cypress' : 'palm';
  // Steppe und Übriges
  const high = height >= 3;
  switch (b.id) {
    case 'dry':
      return r < 0.55 ? 'acacia' : r < 0.8 ? 'cypress' : r < 0.92 ? 'spruce' : 'oak';
    case 'lush':
      return r < 0.3 ? 'oak' : r < 0.52 ? 'birch' : r < 0.78 ? 'spruce' : r < 0.94 ? 'spruce2' : 'cypress';
    case 'highland':
      return high ? (r < 0.6 ? 'spruce' : r < 0.9 ? 'spruce2' : 'birch') : r < 0.45 ? 'spruce' : r < 0.7 ? 'spruce2' : r < 0.85 ? 'birch' : 'oak';
    default:
      return r < 0.38 ? 'spruce' : r < 0.6 ? 'spruce2' : r < 0.8 ? 'oak' : r < 0.93 ? 'birch' : 'cypress';
  }
}

export interface TreeLook {
  /** Skalierung in der Breite */
  s: number;
  /** Skalierung in der Höhe */
  sy: number;
  /** Neigung in Bogenmaß (Richtung = rot + π/2) */
  lean: number;
  /** Drehung um die Hochachse */
  rot: number;
  /** Farbmultiplikator (Instanzfarbe) */
  tint: [number, number, number];
  /** Position innerhalb des Tiles (Versatz −0.35..+0.35) */
  ox: number;
  oz: number;
}

/**
 * Gestalt eines Baumes: Größe, Streckung, Neigung, Farbton und Versatz aus vier Zufallswerten (0..1).
 * Reihenfolge der Zufallswerte ist fest, damit das Ergebnis reproduzierbar ist.
 */
export function treeLook(b: Biome, species: Species, r1: number, r2: number, r3: number, r4: number): TreeLook {
  // Größe: meist mittel, selten sehr groß oder klein (quadratische Verteilung)
  const q = (r1 - 0.5) * 2;
  const size = 1 + q * 0.28 + q * q * q * 0.12;
  const sy = 0.9 + r2 * 0.32;
  const lean = (r3 - 0.5) * 0.14;
  const rot = r4 * Math.PI * 2;
  const lum = 0.9 + hash2(7, Math.floor(r1 * 1000), Math.floor(r2 * 1000)) * 0.22;
  let tint: [number, number, number] = [lum, lum * (0.94 + r3 * 0.12), lum * (0.9 + r2 * 0.14)];
  // herbstlich gefärbte Laubbäume
  const leafy = species === 'oak' || species === 'birch';
  if (leafy && r2 * 0.37 + r3 * 0.63 < b.autumn) tint = [lum * 3.0, lum * 1.2, lum * 0.25];
  const ox = (hash2(11, Math.floor(r1 * 997), Math.floor(r4 * 991)) - 0.5) * 0.7;
  const oz = (hash2(13, Math.floor(r2 * 997), Math.floor(r3 * 991)) - 0.5) * 0.7;
  return { s: size, sy, lean, rot, tint, ox, oz };
}

/** Dichte der Bäume in der Umgebung (0..1) aus der Zahl der Baum-Tiles im 3x3-Fenster; steuert Unterholz und Zusatzbäume */
export function forestDensity(count3x3: number): number {
  return Math.min(1, Math.max(0, (count3x3 - 1) / 6));
}

/** großflächige Feuchte-Fleckung (0..1) für Wiese/Stroh-Wechsel; etwa 14-Felder-Flecken */
export function moistureAt(b: Biome, seed: number, x: number, y: number): number {
  const n = valueNoise(seed + 301, x * 0.07, y * 0.07) * 0.65 + valueNoise(seed + 303, x * 0.19, y * 0.19) * 0.35;
  return Math.min(1, Math.max(0, n + b.moist));
}

/** Übergangsgewicht (0..1) zwischen zwei Terraintypen über einen Abstand in Feldern: weiche S-Kurve */
export function blendWeight(distance: number, width: number): number {
  const t = Math.min(1, Math.max(0, 1 - distance / Math.max(1e-6, width)));
  return t * t * (3 - 2 * t);
}

/** Oberflächengewichte (Gras, Sand, Fels, nass) eines Terraintyps; Summe muss nicht 1 sein */
export function surfaceWeights(terrain: number, green = 0.5): [number, number, number, number] {
  switch (terrain) {
    case T.Oasis:
      return [1, 0, 0, 0];
    case T.Steppe:
      return [0.35 + 0.5 * green, 0.3 * (1 - green) + 0.05, 0, 0];
    case T.Desert:
      return [0.05, 1, 0, 0];
    case T.Rock:
      return [0, 0.1, 1, 0];
    case T.StoneDeposit:
    case T.IronDeposit:
      return [0, 0.2, 0.9, 0];
    case T.Swamp:
      return [0.5, 0, 0, 0.8];
    case T.PitchSpring:
      return [0.1, 0, 0.3, 0.6];
    default:
      return [0.3, 0.3, 0, 0];
  }
}
