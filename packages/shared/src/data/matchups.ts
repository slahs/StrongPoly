import { A, D, DMG_TABLE, UNITS } from './units';

/** Alle Rüstungsklassen in Tabellenreihenfolge (Spalten von DMG_TABLE). */
export const ARMOR_CLASSES: number[] = [A.None, A.Light, A.Heavy, A.Plate, A.BldWood, A.BldStone, A.SiegeEng];
/** Alle Schadensarten in Tabellenreihenfolge (Zeilen von DMG_TABLE). */
export const DAMAGE_TYPES: number[] = [D.Slash, D.Pierce, D.Blunt, D.Siege, D.Fire];

/** „stark“ im Angriff: Multiplikator mindestens dieser Anteil des besten Multiplikators der Einheit … */
export const STRONG_RATIO = 0.8;
/** … und mindestens dieser absolute Wert; ebenso ab hier „verwundbar“ in der Verteidigung */
export const STRONG_MIN = 0.75;
/** „schwach“ bzw. „widersteht“: Multiplikator höchstens dieser Wert */
export const WEAK_MAX = 0.5;

/** Multiplikator einer Schadensart gegen eine Rüstungsklasse (direkt aus DMG_TABLE). */
export function damageMult(dtype: number, armor: number): number {
  return DMG_TABLE[dtype][armor];
}

/** Rüstungsklasse, gegen die die Gruppe zählt, mit den betroffenen Einheitentypen. */
export interface ArmorGroup {
  armor: number;
  mult: number;
  /** Einheitentypen mit dieser Rüstungsklasse (leer bei Gebäudeklassen) */
  units: number[];
  /** true bei Holz-/Steingebäuden */
  building: boolean;
}

/** Eine Schadensart, die diese Einheit trifft, mit den Einheiten, die so schaden. */
export interface DefenseEntry {
  dtype: number;
  mult: number;
  /** Einheitentypen (ohne Bauern/Ochsen), die mit dieser Schadensart angreifen */
  dealers: number[];
}

export interface Matchups {
  unitId: number;
  dtype: number;
  /** false bei Einheiten ohne Angriff (Belagerungsturm, Schutzschild) */
  canAttack: boolean;
  /** greift nur Gebäude an (Rammbock) */
  bldOnly: boolean;
  /** alle möglichen Ziel-Rüstungsklassen, absteigend nach Multiplikator */
  offense: ArmorGroup[];
  /** Ziele mit hohem Multiplikator (>= STRONG_MIN und >= STRONG_RATIO * Bestwert), absteigend */
  strong: ArmorGroup[];
  /** Ziele mit niedrigem Multiplikator (<= WEAK_MAX), aufsteigend (das schwächste zuerst) */
  weak: ArmorGroup[];
  /** Rüstungsklasse der Einheit selbst */
  armor: number;
  /** alle Schadensarten gegen diese Einheit, absteigend nach Multiplikator */
  defense: DefenseEntry[];
  /** Schadensarten, die diese Einheit hart treffen (Multiplikator >= STRONG_MIN), absteigend */
  hardestHit: DefenseEntry[];
  /** Schadensarten, die an dieser Einheit wenig ausrichten (Multiplikator <= WEAK_MAX), aufsteigend */
  resists: DefenseEntry[];
}

function isBuildingArmor(a: number): boolean {
  return a === A.BldWood || a === A.BldStone;
}

/** Einheitentypen, die als Ziel zählen (alles außer dem Ochsen, der kein Gegner ist). */
function targetUnits(): number[] {
  return UNITS.filter((d) => d.key !== 'ox').map((d) => d.id);
}

/** Einheitentypen, die Schaden austeilen können und keine Zivilisten sind. */
function dealerUnits(): number[] {
  return UNITS.filter((d) => d.dmg > 0 && d.side !== 'neutral').map((d) => d.id);
}

function sortDesc<T extends { mult: number }>(list: T[]): T[] {
  return list
    .map((g, i) => ({ g, i }))
    .sort((x, y) => y.g.mult - x.g.mult || x.i - y.i)
    .map((x) => x.g);
}

/**
 * Berechnet Stärken und Schwächen einer Einheit aus DMG_TABLE:
 * - Angriff: Multiplikator ihrer Schadensart gegen jede Rüstungsklasse (mit den Einheitentypen bzw. Gebäudeklassen dahinter),
 * - Verteidigung: Multiplikator jeder Schadensart gegen ihre eigene Rüstungsklasse.
 */
export function matchups(unitId: number): Matchups {
  const def = UNITS[unitId];
  if (!def) throw new Error(`Unbekannte Einheit ${unitId}`);
  const canAttack = def.dmg > 0;
  const tu = targetUnits();
  let offense: ArmorGroup[] = [];
  if (canAttack) {
    for (const a of ARMOR_CLASSES) {
      const building = isBuildingArmor(a);
      if (def.bldOnly && !building) continue;
      const units = building ? [] : tu.filter((id) => UNITS[id].armor === a);
      if (!building && !units.length) continue;
      offense.push({ armor: a, mult: DMG_TABLE[def.dtype][a], units, building });
    }
    offense = sortDesc(offense);
  }
  const best = offense.length ? offense[0].mult : 0;
  const strong = offense.filter((g) => g.mult >= STRONG_MIN && g.mult >= best * STRONG_RATIO);
  const weak = offense.filter((g) => g.mult <= WEAK_MAX).reverse();

  const dealers = dealerUnits();
  const defense = sortDesc(DAMAGE_TYPES.map((d) => ({ dtype: d, mult: DMG_TABLE[d][def.armor], dealers: dealers.filter((id) => UNITS[id].dtype === d) })));

  return { unitId, dtype: def.dtype, canAttack, bldOnly: !!def.bldOnly, offense, strong, weak, armor: def.armor, defense, hardestHit: defense.filter((e) => e.mult >= STRONG_MIN), resists: defense.filter((e) => e.mult <= WEAK_MAX).reverse() };
}
