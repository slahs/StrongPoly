import * as THREE from 'three';
import { R, U, UNITS, UNIT_TYPES } from '@strongpoly/shared';
import { UnitBuilder, visibleTris } from './unit_builder';
import { buildMounted, ox } from './unit_beasts';
import { buildSiege } from './unit_siege';
import { buildInfantry } from './unit_types';
import { C, HIP, st } from './unit_items';
import { HAIR_BITS, HAT_BITS, UnitDetail, VIS } from './units_style';
import { JOB_COUNT } from './unit_jobs';

/**
 * Figuren- und Tragelastmodelle. Jeder Einheitentyp ist EIN Modell (ein Mesh, ein Draw-Call) mit mehreren Detailstufen
 * und Varianten in einer Geometrie: nah/fern (VIS.Near/VIS.Far), Haar-/Bart-/Hut-Varianten, Berufe der Bauern.
 * Die Instanz wählt per Instanzattribut aus, welche Teile sichtbar sind; Unsichtbares wird im Vertex-Shader zusammengeklappt.
 * Grafikstufe Niedrig lässt die nahen Teile ganz weg, Mittel alles außer VIS.Detail, Hoch alles.
 */

/** Anzeigehöhe der Lebensbalken und Skalierung je Einheitentyp */
export const UNIT_SCALE: number[] = new Array(UNIT_TYPES).fill(1);
UNIT_SCALE[U.Lord] = 1.3;
UNIT_SCALE[U.Knight] = 1.12;
UNIT_SCALE[U.HorseArcher] = 1.0;
export const UNIT_TOP: number[] = new Array(UNIT_TYPES).fill(0.95);
UNIT_TOP[U.Ox] = 0.75;
UNIT_TOP[U.Lord] = 1.25;
UNIT_TOP[U.Knight] = 1.25;
UNIT_TOP[U.HorseArcher] = 1.2;
UNIT_TOP[U.Pikeman] = 1.0;
UNIT_TOP[U.Catapult] = 1.2;
UNIT_TOP[U.Trebuchet] = 1.9;
UNIT_TOP[U.Ram] = 1.0;
UNIT_TOP[U.SiegeTower] = 2.6;
UNIT_TOP[U.Mantlet] = 1.1;
UNIT_TOP[U.FireBallista] = 1.0;
/** Einheiten, die als Leiche liegen bleiben (keine Belagerungsgeräte) */
export const UNIT_CORPSE: boolean[] = UNITS.map((d) => d.side !== 'siege');
/** Reittiere und Ochsen kippen zur Seite, Fußvolk nach hinten */
export const UNIT_SIDEWAYS: boolean[] = UNITS.map((d) => !!d.mounted || d.id === U.Ox);
/** Schrittfrequenz (rad/s) je Einheitentyp, passend zur Geschwindigkeit */
export const UNIT_WALK_W: number[] = UNITS.map((d) => Math.min(14, 3 + d.speed * (d.side === 'siege' ? 3.2 : 4.2)));
/** Angriffs-/Schusszyklus in Sekunden (Abklingzeit der Waffe) */
export const UNIT_CYCLE: number[] = UNITS.map((d) => Math.max(0.5, d.cd));

/** Dreiecksbudget je Typ (sichtbare Dreiecke einer Instanz im nahen Modell, Hoch) und im fernen Modell */
export const UNIT_BUDGET: { near: number; far: number }[] = UNITS.map((d) => {
  if (d.side === 'siege') return d.id === U.Trebuchet || d.id === U.SiegeTower ? { near: 1500, far: 600 } : { near: 1300, far: 520 };
  if (d.mounted || d.id === U.Ox) return { near: 800, far: 380 };
  if (d.id === U.Lord) return { near: 400, far: 250 };
  return { near: 400, far: 230 };
});

export interface UnitModel {
  /** eine Geometrie mit allen Teilen und Varianten */
  merged: THREE.BufferGeometry;
  /** Dreiecke in der Geometrie insgesamt (alle Varianten) */
  tris: number;
  /** Detailstufe, mit der gebaut wurde */
  detail: UnitDetail;
}

function dropMask(detail: UnitDetail): number {
  if (detail === 0) return VIS.Near | VIS.Detail;
  if (detail === 1) return VIS.Detail;
  return 0;
}

/** Baut das Modell eines Einheitentyps in der gewünschten Detailstufe (0 niedrig, 1 mittel, 2 hoch) */
export function buildUnitModel(type: number, detail: UnitDetail = 1): UnitModel {
  const b = new UnitBuilder({ ao: 0.2, aoH: 0.3, cullDown: true, drop: dropMask(detail) });
  const d = UNITS[type];
  if (d && d.side === 'siege') buildSiege(b, type);
  else if (type === U.Ox) ox(b);
  else if (type === U.Knight || type === U.HorseArcher) buildMounted(b, type);
  else buildInfantry(b, type);
  const r = b.build();
  return { merged: r.geo, tris: r.tris, detail };
}

/** Sichtbare Dreiecke einer Instanz: nah (mit allen Varianten-Bits der Maske) bzw. fern; `job` = Beruf des Bauern */
export function instanceTris(m: UnitModel, near: boolean, bits: number, job = 0): number {
  const mask = (near ? VIS.Near | (m.detail === 2 ? VIS.Detail : 0) : VIS.Far) | bits;
  return visibleTris(m.merged, mask, 1 << job);
}

/** Größtes Dreiecksbudget über alle Varianten und Berufe (Test) */
export function worstCaseTris(m: UnitModel, near: boolean, type: number): number {
  let worst = 0;
  const hairs = [0, ...HAIR_BITS];
  const hats = [0, ...HAT_BITS];
  const jobs = type === U.Peasant ? JOB_COUNT : 1;
  for (let j = 0; j < jobs; j++)
    for (const h of hairs)
      for (const hat of hats)
        for (const beard of [0, VIS.Beard]) worst = Math.max(worst, instanceTris(m, near, h | hat | beard, j));
  return worst;
}

// ---------------------------------------------------------------------------------- Getragene Waren
/** Getragene Waren: Form je Ressource (kleine Modelle am Rücken/in den Armen, Farbe per Teamfarb-Kanal). */
export type CargoKind = 'bundle' | 'block' | 'ingot' | 'barrel' | 'bucket' | 'sack' | 'basket' | 'wheel' | 'sticks' | 'roll';
export const CARGO_KINDS: CargoKind[] = ['bundle', 'block', 'ingot', 'barrel', 'bucket', 'sack', 'basket', 'wheel', 'sticks', 'roll'];
export const CARGO_OF_RES: CargoKind[] = [];
CARGO_OF_RES[R.Wood] = 'bundle';
CARGO_OF_RES[R.Stone] = 'block';
CARGO_OF_RES[R.Iron] = 'ingot';
CARGO_OF_RES[R.Pitch] = 'barrel';
CARGO_OF_RES[R.Hops] = 'sack';
CARGO_OF_RES[R.Ale] = 'bucket';
CARGO_OF_RES[R.Wheat] = 'sack';
CARGO_OF_RES[R.Flour] = 'sack';
CARGO_OF_RES[R.Cow] = 'block';
CARGO_OF_RES[R.Apple] = 'basket';
CARGO_OF_RES[R.Cheese] = 'wheel';
CARGO_OF_RES[R.Meat] = 'basket';
CARGO_OF_RES[R.Bread] = 'basket';
CARGO_OF_RES[R.Bow] = 'sticks';
CARGO_OF_RES[R.Crossbow] = 'sticks';
CARGO_OF_RES[R.Spear] = 'sticks';
CARGO_OF_RES[R.Pike] = 'sticks';
CARGO_OF_RES[R.Mace] = 'sticks';
CARGO_OF_RES[R.Sword] = 'sticks';
CARGO_OF_RES[R.Leather] = 'roll';
CARGO_OF_RES[R.Armor] = 'roll';

/**
 * Waren sitzen am Rücken (z < 0) bzw. auf der Schulter; Teamfarb-Kanal = Warenfarbe.
 * Alle Teile hängen am Oberkörper (Neigung/Wippen wie der Träger) und passen zu den Proportionen der Figuren.
 */
export function buildCargoModel(kind: CargoKind): { merged: THREE.BufferGeometry; tris: number } {
  const b = new UnitBuilder({ ao: 0.12, aoH: 0.4, cullDown: true });
  cargoShape(b, kind, 0);
  const r = b.build();
  return { merged: r.geo, tris: r.tris };
}

/** Alle Warenformen in einer Geometrie: Form k sichtbar, wenn Bit (1 << k) der Instanz gesetzt ist (ein Draw-Call für alle Waren) */
export function buildCargoAll(): { merged: THREE.BufferGeometry; tris: number } {
  const b = new UnitBuilder({ ao: 0.12, aoH: 0.4, cullDown: true });
  CARGO_KINDS.forEach((k, i) => cargoShape(b, k, 1 << i));
  const r = b.build();
  return { merged: r.geo, tris: r.tris };
}

function cargoShape(b: UnitBuilder, kind: CargoKind, sel: number): void {
  st(b, { upper: HIP, sel });
  const t = { team: true };
  switch (kind) {
    case 'bundle':
      // Holzbündel quer am Rücken, mit Strick
      for (const [x, y] of [[-0.055, 0.0], [0.055, 0.0], [0, 0.075]]) b.limb([x, 0.46 + y, -0.32], [x, 0.46 + y, -0.04], 0.04, 0.04, C.wood, { team: true, capA: true, capB: true });
      b.box(0.19, 0.03, 0.03, 0, 0.5, -0.12, C.black);
      b.box(0.19, 0.03, 0.03, 0, 0.5, -0.24, C.black);
      break;
    case 'block':
      b.box(0.2, 0.17, 0.19, 0, 0.45, -0.17, C.white, { ...t, taper: [0.9, 0.9] });
      b.box(0.1, 0.06, 0.1, 0.03, 0.62, -0.17, C.stone);
      b.box(0.22, 0.03, 0.03, 0, 0.5, -0.1, C.rope);
      break;
    case 'ingot':
      b.box(0.2, 0.07, 0.12, 0, 0.47, -0.17, C.white, t);
      b.box(0.2, 0.07, 0.12, 0, 0.54, -0.17, C.white, t);
      b.box(0.17, 0.02, 0.09, 0, 0.61, -0.17, C.steel);
      break;
    case 'barrel':
      b.cyl(0.1, 0.1, 0.22, 6, 0, 0.44, -0.18, C.white, t);
      b.cyl(0.105, 0.105, 0.03, 6, 0, 0.5, -0.18, C.black, { capA: false, capB: false });
      b.cyl(0.105, 0.105, 0.03, 6, 0, 0.6, -0.18, C.black, { capA: false, capB: false });
      break;
    case 'bucket':
      b.cyl(0.1, 0.075, 0.2, 6, 0, 0.44, -0.18, C.white, t);
      b.cyl(0.085, 0.085, 0.02, 6, 0, 0.62, -0.18, C.gold, { capA: false });
      b.box(0.2, 0.025, 0.025, 0, 0.68, -0.18, C.black);
      break;
    case 'sack':
      b.box(0.2, 0.22, 0.15, 0, 0.44, -0.18, C.white, { ...t, taper: [0.8, 0.8] });
      b.box(0.12, 0.06, 0.1, 0, 0.63, -0.18, C.white, t);
      b.box(0.14, 0.025, 0.12, 0, 0.6, -0.18, C.rope);
      break;
    case 'basket':
      b.cyl(0.115, 0.095, 0.1, 6, 0, 0.47, -0.18, C.woodL, { capA: false });
      b.cyl(0.1, 0.1, 0.07, 6, 0, 0.56, -0.18, C.white, { ...t, capA: false });
      break;
    case 'wheel':
      b.cyl(0.12, 0.12, 0.08, 7, 0, 0.47, -0.17, C.white, t);
      b.cyl(0.12, 0.12, 0.08, 7, 0, 0.55, -0.17, C.white, t);
      break;
    case 'sticks':
      for (let i = 0; i < 4; i++) b.limb([-0.07 + i * 0.045, 0.2, -0.18], [-0.07 + i * 0.045, 0.78, -0.18], 0.014, 0.014, i === 1 ? C.white : i % 2 ? C.woodD : C.wood, { team: i === 1, capA: false, capB: false });
      b.box(0.2, 0.03, 0.03, 0, 0.5, -0.18, C.black);
      break;
    default:
      b.cyl(0.07, 0.07, 0.28, 6, 0, 0.42, -0.2, C.white, t);
      b.cyl(0.04, 0.04, 0.29, 5, 0, 0.42, -0.2, C.stone);
  }
}
