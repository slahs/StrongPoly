import * as THREE from 'three';
import { U, UNIT_TYPES } from '@strongpoly/shared';
import { JOB, JOB_COUNT } from './unit_jobs';

/**
 * Stil und Variation der Figuren: warme, leicht entsättigte Erdpalette, Hauttöne, Haarfarben, Stofffarben.
 * Die Tabelle `UNIT_TINTS` liegt als Uniform im Shader; jede Instanz wählt per Index (Instanzattribut iVar.x),
 * so entstehen Varianten ohne zusätzliche Draw-Calls. Alles hier ist reine Daten/Logik ohne GL und testbar.
 */

/** Farbklassen der Eckpunkte (Attribut aStyle.x) */
export const TC = {
  /** feste Farbe aus dem Eckpunkt */
  Fixed: 0,
  Skin: 1,
  Hair: 2,
  /** Hauptstoff (Kittel, Rock) */
  A: 3,
  /** Nebenstoff (Hose, Haube, Schärpe) */
  B: 4,
} as const;

/** Sichtbarkeits-Bits (Attribut aStyle.y / Instanzattribut iVar.z): Eckpunkt ist sichtbar, wenn alle seine Bits an der Instanz gesetzt sind */
export const VIS = {
  /** nahes, detailliertes Modell */
  Near: 1,
  /** fernes, vereinfachtes Modell */
  Far: 2,
  /** Haarform 0..2 (genau eine gesetzt) */
  Hair0: 4,
  Hair1: 8,
  Hair2: 16,
  /** Bart */
  Beard: 32,
  /** Kopfbedeckung/Zierde, Variante 0..2 */
  Hat0: 64,
  Hat1: 128,
  Hat2: 256,
  /** Hochstufe: Zusatzdetails (nur Grafikstufe Hoch) */
  Detail: 512,
} as const;

export const HAIR_BITS = [VIS.Hair0, VIS.Hair1, VIS.Hair2];
export const HAT_BITS = [VIS.Hat0, VIS.Hat1, VIS.Hat2];

/** Hauttöne (sRGB) */
export const SKIN_TONES = [0xf0cfa8, 0xe6b98e, 0xd9a679, 0xc68e60, 0xa9754a, 0x8a5a38, 0x6c4429, 0xe9c19c];
/** Haarfarben (sRGB) */
export const HAIR_TONES = [0x2b2118, 0x4a3222, 0x6b4a2b, 0x8f6a3a, 0xc4a060, 0xd6c9a8, 0x9a9590, 0xa8502d];
/** Stofffarben (sRGB): gedeckte Naturtöne */
export const CLOTH_TONES = [
  0xd8ccb0, // 0 Leinen
  0xe6dcc3, // 1 helles Leinen
  0x7a5a3c, // 2 Wollbraun
  0x5b4330, // 3 Dunkelbraun
  0xc79a3e, // 4 Ocker
  0xbf9a4f, // 5 Senf
  0x6b7a3c, // 6 Moosgrün
  0x7d7a45, // 7 Oliv
  0x45603a, // 8 Waldgrün
  0x5f7388, // 9 Blaugrau
  0x4a5d78, // 10 Schieferblau
  0x38476a, // 11 Indigo
  0xa2552f, // 12 Rost
  0x8f3f32, // 13 Ziegelrot
  0xa86b5a, // 14 Altrosa
  0x3a3836, // 15 Kohle
  0x8a867c, // 16 Steingrau
  0xb3aea2, // 17 Hellgrau
  0x9aa2a8, // 18 Stahl
  0x6a7078, // 19 dunkler Stahl
  0xd1b678, // 20 Sand
  0xb69a5c, // 21 dunkler Sand
  0xeeeadf, // 22 Weißwolle
  0xe3d7b8, // 23 Creme
  0x6b4a2e, // 24 Leder
  0x4a3322, // 25 dunkles Leder
  0x2a2724, // 26 Schwarz
  0xa8392d, // 27 Wüstenrot
  0x3f5f86, // 28 Wüstenblau
  0x4f7d7a, // 29 Türkisgrau
  0x6a4a58, // 30 Purpurbraun
  0xd49a2a, // 31 Safran
];

export const CLOTH = {
  linen: 0, linenLight: 1, wool: 2, brown: 3, ochre: 4, mustard: 5, moss: 6, olive: 7, forest: 8, blueGrey: 9, slate: 10, indigo: 11, rust: 12, brick: 13, rose: 14,
  coal: 15, stone: 16, lightGrey: 17, steel: 18, darkSteel: 19, sand: 20, sandDark: 21, white: 22, cream: 23, leather: 24, leatherDark: 25, black: 26, desertRed: 27,
  desertBlue: 28, teal: 29, plum: 30, saffron: 31,
} as const;

/** Offsets der Teiltabellen in `UNIT_TINTS` */
export const TINT_SKIN = 0;
export const TINT_HAIR = 8;
export const TINT_CLOTH = 16;
export const TINT_COUNT = 16 + CLOTH_TONES.length;

function lin(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Tabelle aller Farbtöne (linear RGB), Reihenfolge: Haut, Haar, Stoff – als Uniform für den Vertex-Shader */
export const UNIT_TINTS: Float32Array = (() => {
  const a = new Float32Array(TINT_COUNT * 3);
  const put = (i: number, hex: number): void => {
    const [r, g, b] = lin(hex);
    a[i * 3] = r;
    a[i * 3 + 1] = g;
    a[i * 3 + 2] = b;
  };
  SKIN_TONES.forEach((h, i) => put(TINT_SKIN + i, h));
  HAIR_TONES.forEach((h, i) => put(TINT_HAIR + i, h));
  CLOTH_TONES.forEach((h, i) => put(TINT_CLOTH + i, h));
  return a;
})();

/**
 * Packt Palettenindizes in eine Gleitkommazahl (bis 2^24 exakt): Haut 3 Bit, Haar 3 Bit, Stoff A 5 Bit, Stoff B 5 Bit,
 * ab Bit 16 der Beruf (5 Bit; bestimmt den Armstil der Bauern im Shader).
 */
export function packPalette(skin: number, hair: number, a: number, b: number, job = 0): number {
  return (skin & 7) | ((hair & 7) << 3) | ((a & 31) << 6) | ((b & 31) << 11) | ((job & 31) << 16);
}
export function unpackPalette(p: number): { skin: number; hair: number; a: number; b: number; job: number } {
  return { skin: p & 7, hair: (p >> 3) & 7, a: (p >> 6) & 31, b: (p >> 11) & 31, job: (p >> 16) & 31 };
}

/** Beschreibung der zulässigen Variation eines Modells */
export interface VarSpec {
  skin: number[];
  hair: number[];
  /** erlaubte Stoffe (Indizes in CLOTH_TONES) für Hauptstoff und Nebenstoff */
  a: number[];
  b: number[];
  /** Anzahl Haarformen (0 = keine sichtbaren Haare, z. B. Helm) und Wahrscheinlichkeit eines Barts */
  hairStyles: number;
  beard: number;
  /** Zahl der Kopfbedeckungs-Varianten (0 = fest) */
  hats: number;
  /** Größenabweichung (± Anteil) und Breitenabweichung */
  size: number;
  /** Helligkeitsabweichung (± Anteil) */
  jitter: number;
}

const EURO_SKIN = [0, 1, 2, 7, 3];
const ARAB_SKIN = [2, 3, 4, 5, 6];
const HAIR_N = [0, 1, 2, 3, 4, 6, 7];
const HAIR_ARAB = [0, 1, 2, 6];

const peasantSpec: VarSpec = {
  skin: EURO_SKIN,
  hair: HAIR_N,
  a: [CLOTH.linen, CLOTH.wool, CLOTH.ochre, CLOTH.moss, CLOTH.blueGrey, CLOTH.rust, CLOTH.olive, CLOTH.sand, CLOTH.mustard],
  b: [CLOTH.brown, CLOTH.leather, CLOTH.wool, CLOTH.forest, CLOTH.slate, CLOTH.coal],
  hairStyles: 3,
  beard: 0.3,
  hats: 3,
  size: 0.05,
  jitter: 0.07,
};

/** Variationsvorgaben je Einheitentyp (Soldaten behalten ihre Typfarben, nur Haut/Haar/leichte Stoffabweichung) */
export const VAR_SPEC: VarSpec[] = (() => {
  const s: VarSpec[] = new Array(UNIT_TYPES);
  const soldier = (a: number[], b: number[], o: Partial<VarSpec> = {}): VarSpec => ({
    skin: EURO_SKIN,
    hair: HAIR_N,
    a,
    b,
    hairStyles: 3,
    beard: 0.4,
    hats: 0,
    size: 0.05,
    jitter: 0.06,
    ...o,
  });
  s[U.Peasant] = peasantSpec;
  s[U.Ox] = { skin: [0], hair: [0], a: [CLOTH.wool, CLOTH.brown, CLOTH.leather, CLOTH.leatherDark], b: [CLOTH.cream], hairStyles: 0, beard: 0, hats: 0, size: 0.06, jitter: 0.1 };
  s[U.Lord] = soldier([CLOTH.saffron], [CLOTH.black], { size: 0.02, jitter: 0.03, hairStyles: 0, beard: 0.7 });
  s[U.Archer] = soldier([CLOTH.moss, CLOTH.forest, CLOTH.olive], [CLOTH.leather, CLOTH.brown], { hats: 3 });
  s[U.Crossbowman] = soldier([CLOTH.slate, CLOTH.blueGrey, CLOTH.stone], [CLOTH.leather, CLOTH.coal], { hats: 2 });
  s[U.Spearman] = soldier([CLOTH.wool, CLOTH.brown, CLOTH.ochre], [CLOTH.leather, CLOTH.leatherDark], { hats: 0 });
  s[U.Pikeman] = soldier([CLOTH.stone, CLOTH.lightGrey, CLOTH.steel], [CLOTH.darkSteel, CLOTH.coal], { hairStyles: 0, beard: 0.5 });
  s[U.Maceman] = soldier([CLOTH.brown, CLOTH.wool, CLOTH.rust], [CLOTH.leatherDark, CLOTH.leather], { hairStyles: 0 });
  s[U.Swordsman] = soldier([CLOTH.steel, CLOTH.lightGrey, CLOTH.darkSteel], [CLOTH.coal, CLOTH.darkSteel], { hairStyles: 0 });
  s[U.Knight] = soldier([CLOTH.wool, CLOTH.brown, CLOTH.rust, CLOTH.coal, CLOTH.stone], [CLOTH.coal], { hairStyles: 0, beard: 0, size: 0.03 });
  s[U.Tunneler] = soldier([CLOTH.brown, CLOTH.coal, CLOTH.leatherDark], [CLOTH.leather], { hats: 0 });
  s[U.Laddermen] = soldier([CLOTH.linen, CLOTH.ochre, CLOTH.sand], [CLOTH.brown, CLOTH.wool], { hats: 2 });
  s[U.Engineer] = soldier([CLOTH.olive, CLOTH.mustard, CLOTH.linen], [CLOTH.leatherDark, CLOTH.brown], { hats: 0 });
  s[U.Monk] = soldier([CLOTH.brown, CLOTH.wool, CLOTH.leatherDark], [CLOTH.cream], { hairStyles: 2, beard: 0.4 });
  s[U.Slave] = { ...soldier([CLOTH.sand, CLOTH.sandDark, CLOTH.linen], [CLOTH.sandDark, CLOTH.brown]), skin: ARAB_SKIN, hair: HAIR_ARAB, hairStyles: 2, hats: 0 };
  s[U.Slinger] = { ...soldier([CLOTH.sand, CLOTH.sandDark, CLOTH.cream], [CLOTH.teal, CLOTH.desertBlue, CLOTH.brown]), skin: ARAB_SKIN, hair: HAIR_ARAB, hats: 2 };
  s[U.HorseArcher] = { ...soldier([CLOTH.sand, CLOTH.sandDark, CLOTH.wool, CLOTH.brown, CLOTH.cream], [CLOTH.white, CLOTH.cream, CLOTH.desertBlue, CLOTH.teal]), skin: ARAB_SKIN, hair: HAIR_ARAB, hairStyles: 0 };
  s[U.ArabSwordsman] = { ...soldier([CLOTH.desertRed, CLOTH.brick], [CLOTH.white, CLOTH.cream]), skin: ARAB_SKIN, hair: HAIR_ARAB, hairStyles: 0 };
  s[U.Assassin] = { ...soldier([CLOTH.black, CLOTH.coal], [CLOTH.desertRed, CLOTH.plum]), skin: ARAB_SKIN, hair: HAIR_ARAB, hairStyles: 0, beard: 0, jitter: 0.03 };
  s[U.Firethrower] = { ...soldier([CLOTH.desertRed, CLOTH.rust], [CLOTH.coal, CLOTH.leatherDark]), skin: ARAB_SKIN, hair: HAIR_ARAB, hairStyles: 0, beard: 0.5 };
  for (const t of [U.Catapult, U.Trebuchet, U.Ram, U.SiegeTower, U.Mantlet, U.FireBallista]) {
    s[t] = { skin: [0], hair: [0], a: [CLOTH.wool], b: [CLOTH.brown], hairStyles: 0, beard: 0, hats: 0, size: 0.02, jitter: 0.05 };
  }
  return s;
})();

/** Berufs-spezifische Stoffe (Hauptstoff, Nebenstoff); null = Standardliste des Typs */
export const JOB_CLOTH: ([number[], number[]] | null)[] = (() => {
  const j: ([number[], number[]] | null)[] = new Array(JOB_COUNT).fill(null);
  j[JOB.None] = null;
  j[JOB.Woodcutter] = [[CLOTH.forest, CLOTH.moss, CLOTH.olive], [CLOTH.leather, CLOTH.brown]];
  j[JOB.Stonemason] = [[CLOTH.stone, CLOTH.lightGrey, CLOTH.linen], [CLOTH.leatherDark, CLOTH.leather]];
  j[JOB.Miner] = [[CLOTH.coal, CLOTH.leatherDark, CLOTH.brown], [CLOTH.rust, CLOTH.mustard]];
  j[JOB.PitchWorker] = [[CLOTH.black, CLOTH.coal], [CLOTH.leatherDark, CLOTH.brown]];
  j[JOB.Orchard] = [[CLOTH.linen, CLOTH.cream, CLOTH.sand], [CLOTH.moss, CLOTH.rust]];
  j[JOB.Dairy] = [[CLOTH.white, CLOTH.cream, CLOTH.linenLight], [CLOTH.slate, CLOTH.blueGrey, CLOTH.rose]];
  j[JOB.Hunter] = [[CLOTH.olive, CLOTH.forest, CLOTH.wool], [CLOTH.leatherDark, CLOTH.brown]];
  j[JOB.Farmer] = [[CLOTH.ochre, CLOTH.mustard, CLOTH.linen, CLOTH.sand], [CLOTH.brown, CLOTH.wool]];
  j[JOB.HopPicker] = [[CLOTH.moss, CLOTH.olive, CLOTH.linen], [CLOTH.forest, CLOTH.brown]];
  j[JOB.Miller] = [[CLOTH.white, CLOTH.cream, CLOTH.linenLight], [CLOTH.wool, CLOTH.brown]];
  j[JOB.Baker] = [[CLOTH.white, CLOTH.linenLight], [CLOTH.rust, CLOTH.brown]];
  j[JOB.Brewer] = [[CLOTH.wool, CLOTH.brown, CLOTH.ochre], [CLOTH.leatherDark, CLOTH.leather]];
  j[JOB.Bowyer] = [[CLOTH.forest, CLOTH.moss, CLOTH.olive], [CLOTH.leather, CLOTH.wool]];
  j[JOB.Turner] = [[CLOTH.wool, CLOTH.mustard, CLOTH.linen], [CLOTH.leatherDark, CLOTH.brown]];
  j[JOB.Smith] = [[CLOTH.coal, CLOTH.leatherDark, CLOTH.darkSteel], [CLOTH.black, CLOTH.leatherDark]];
  j[JOB.Tanner] = [[CLOTH.brown, CLOTH.wool, CLOTH.rust], [CLOTH.leatherDark, CLOTH.cream]];
  j[JOB.Armorer] = [[CLOTH.darkSteel, CLOTH.steel, CLOTH.coal], [CLOTH.leatherDark, CLOTH.black]];
  j[JOB.Digger] = [[CLOTH.wool, CLOTH.linen, CLOTH.sand], [CLOTH.brown, CLOTH.leatherDark]];
  j[JOB.Carpenter] = [[CLOTH.linen, CLOTH.mustard, CLOTH.olive], [CLOTH.leather, CLOTH.brown]];
  j[JOB.Innkeeper] = [[CLOTH.ochre, CLOTH.linen, CLOTH.rose], [CLOTH.white, CLOTH.cream]];
  j[JOB.Trader] = [[CLOTH.plum, CLOTH.indigo, CLOTH.teal, CLOTH.brick], [CLOTH.saffron, CLOTH.ochre]];
  j[JOB.Cleric] = [[CLOTH.cream, CLOTH.white, CLOTH.linenLight], [CLOTH.plum, CLOTH.brick]];
  return j;
})();

/** Deterministischer Hash (32 Bit) mit Salz; gleiche Eingabe liefert immer dasselbe */
export function hash32(a: number, salt = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(salt + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}
const unit = (h: number): number => h / 4294967296;

export interface UnitVariant {
  skin: number;
  hair: number;
  a: number;
  b: number;
  hairStyle: number;
  beard: boolean;
  hat: number;
  /** Helligkeit (um 1) */
  jitter: number;
  /** Skalierung in der Breite (x/z) und Höhe (y), um 1 */
  kx: number;
  ky: number;
  /** gepackte Palette für iVar.x */
  pack: number;
  /** Sichtbarkeits-Bits der Variante (ohne Nah/Fern) für iVar.z */
  bits: number;
  /** Berufs-Bit (1 << Beruf) für iVar.w */
  jobBit: number;
}

const pick = <T>(list: readonly T[], h: number): T => list[Math.floor(unit(h) * list.length) % list.length];

/**
 * Variation einer Einheit aus ihrer ID (stabil über die Lebenszeit, deterministisch, keine Zufallszahlen).
 * Alle Werte liegen in den Bereichen, die im Shader/Palette gültig sind; Größe ±`size`, Helligkeit ±`jitter`.
 */
export function unitVariant(type: number, id: number, job: number = JOB.None): UnitVariant {
  const spec = VAR_SPEC[type] ?? VAR_SPEC[U.Peasant];
  const jc = type === U.Peasant ? JOB_CLOTH[job] : null;
  const aList = jc ? jc[0] : spec.a;
  const bList = jc ? jc[1] : spec.b;
  const skin = pick(spec.skin, hash32(id, 1));
  const hair = pick(spec.hair, hash32(id, 2));
  const a = pick(aList, hash32(id, 3));
  const b = pick(bList, hash32(id, 4));
  const hairStyle = spec.hairStyles > 0 ? Math.floor(unit(hash32(id, 5)) * spec.hairStyles) % spec.hairStyles : -1;
  const beard = unit(hash32(id, 6)) < spec.beard;
  const hat = spec.hats > 0 ? Math.floor(unit(hash32(id, 7)) * spec.hats) % spec.hats : -1;
  const jitter = 1 + (unit(hash32(id, 8)) * 2 - 1) * spec.jitter;
  const ky = 1 + (unit(hash32(id, 9)) * 2 - 1) * spec.size;
  const kx = 1 + (unit(hash32(id, 10)) * 2 - 1) * spec.size * 0.6 + (ky - 1) * 0.5;
  let bits = 0;
  if (hairStyle >= 0) bits |= HAIR_BITS[hairStyle];
  if (beard) bits |= VIS.Beard;
  if (hat >= 0) bits |= HAT_BITS[hat];
  return { skin, hair, a, b, hairStyle, beard, hat, jitter, kx, ky, pack: packPalette(skin, hair, a, b, job), bits, jobBit: 1 << job };
}

// ---------------------------------------------------------------------------------------------
// Grafikstufen: Detailstufe der Figuren

/** 0 = niedrig (nur vereinfachte Modelle), 1 = mittel, 2 = hoch (volle Details) */
export type UnitDetail = 0 | 1 | 2;

/** Entfernung (Tiles) bis zu der das nahe Modell gezeichnet wird, je Detailstufe */
export const LOD_NEAR_DIST: Record<UnitDetail, number> = { 0: 0, 1: 32, 2: 46 };
/** Hysterese (Tiles) gegen Umspringen an der Grenze */
export const LOD_HYST = 2.5;
