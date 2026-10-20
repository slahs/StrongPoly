import { PAL, U, UNITS, R, UNIT_TYPES } from '@strongpoly/shared';
import { ModelBuilder, ModelGeos } from './builder';
import { PART } from './materials';

const SKIN = PAL.sand;
/** Schulterhöhe (Drehpunkt der Arme) */
const SH = 0.52;

interface HumanOpts {
  tunic: number;
  legs: number;
  team?: boolean;
  skin?: number;
  sleeve?: number;
  noArms?: boolean;
  /** Reiter: Körper nach oben versetzt, Beine starr */
  dy?: number;
  /** Arme animieren (Standard ja) */
  anim?: boolean;
}

/** Menschliche Grundform mit animierbaren Beinen und Armen (Waffenarm rechts, Hilfsarm links). */
function human(b: ModelBuilder, o: HumanOpts): void {
  const dy = o.dy ?? 0;
  if (o.dy) {
    b.box(0.09, 0.22, 0.12, -0.17, dy - 0.02, 0, o.legs);
    b.box(0.09, 0.22, 0.12, 0.17, dy - 0.02, 0, o.legs);
  } else {
    b.part(PART.LegL, -0.065, 0.27, 0).box(0.09, 0.27, 0.12, -0.065, 0, 0, o.legs);
    b.part(PART.LegR, 0.065, 0.27, 0).box(0.09, 0.27, 0.12, 0.065, 0, 0, o.legs);
    b.part(0);
  }
  b.box(0.28, 0.3, 0.17, 0, 0.26 + dy, 0, o.tunic, !!o.team);
  b.box(0.16, 0.16, 0.16, 0, 0.56 + dy, 0, o.skin ?? SKIN);
  if (!o.noArms) {
    const anim = o.anim !== false;
    if (anim) b.part(PART.ArmL, -0.185, SH + dy, 0);
    b.box(0.07, 0.26, 0.08, -0.185, 0.27 + dy, 0, o.sleeve ?? o.tunic);
    if (anim) b.part(PART.ArmR, 0.185, SH + dy, 0);
    b.box(0.07, 0.26, 0.08, 0.185, 0.27 + dy, 0, o.sleeve ?? o.tunic);
    b.part(0);
  }
}
const rArm = (b: ModelBuilder, dy = 0, style = 0): ModelBuilder => b.part(PART.ArmR, 0.185, SH + dy, 0, style);
const lArm = (b: ModelBuilder, dy = 0): ModelBuilder => b.part(PART.ArmL, -0.185, SH + dy, 0);
const bowArm = (b: ModelBuilder, dy = 0): ModelBuilder => b.part(PART.Bow, -0.185, SH + dy, 0);

function horse(b: ModelBuilder, color: number, mane: number): void {
  // vier Beine, diagonal im Takt (Trab)
  b.part(PART.LegL, -0.09, 0.3, 0.24).box(0.1, 0.3, 0.1, -0.09, 0, 0.24, PAL.woodDark);
  b.part(PART.LegR, 0.09, 0.3, 0.24).box(0.1, 0.3, 0.1, 0.09, 0, 0.24, PAL.woodDark);
  b.part(PART.LegR, -0.09, 0.3, -0.24).box(0.1, 0.3, 0.1, -0.09, 0, -0.24, PAL.woodDark);
  b.part(PART.LegL, 0.09, 0.3, -0.24).box(0.1, 0.3, 0.1, 0.09, 0, -0.24, PAL.woodDark);
  b.part(0);
  b.box(0.3, 0.3, 0.62, 0, 0.28, 0, color);
  b.box(0.12, 0.3, 0.12, 0, 0.5, 0.34, color); // Hals
  b.box(0.12, 0.12, 0.2, 0, 0.66, 0.44, color); // Kopf
  b.box(0.04, 0.1, 0.06, 0, 0.8, 0.28, mane); // Mähne
  b.box(0.06, 0.06, 0.2, 0, 0.62, -0.38, mane); // Schweif
}

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

export function buildUnitModel(type: number): ModelGeos {
  const b = new ModelBuilder({ ao: 0.16, aoH: 0.3, cullDown: true });
  switch (type) {
    case U.Peasant:
      human(b, { tunic: PAL.thatch, legs: PAL.woodDark });
      b.cone(0.19, 0.1, 6, 0, 0.7, 0, PAL.thatch);
      // Werkzeug: Stiel nach vorn, Kopf quer (Hacken/Hämmern/Hauen)
      rArm(b).box(0.03, 0.03, 0.34, 0.2, 0.25, 0.2, PAL.woodDark).box(0.045, 0.11, 0.05, 0.2, 0.2, 0.36, PAL.stoneDark);
      break;
    case U.Ox:
      b.part(PART.LegL, -0.12, 0.24, 0.26).box(0.11, 0.24, 0.11, -0.12, 0, 0.26, PAL.black);
      b.part(PART.LegR, 0.12, 0.24, 0.26).box(0.11, 0.24, 0.11, 0.12, 0, 0.26, PAL.black);
      b.part(PART.LegR, -0.12, 0.24, -0.26).box(0.11, 0.24, 0.11, -0.12, 0, -0.26, PAL.black);
      b.part(PART.LegL, 0.12, 0.24, -0.26).box(0.11, 0.24, 0.11, 0.12, 0, -0.26, PAL.black);
      b.part(0);
      b.box(0.36, 0.34, 0.72, 0, 0.22, 0, PAL.woodDark);
      b.box(0.22, 0.24, 0.22, 0, 0.4, 0.44, PAL.wood);
      b.box(0.04, 0.12, 0.04, -0.12, 0.62, 0.46, PAL.white);
      b.box(0.04, 0.12, 0.04, 0.12, 0.62, 0.46, PAL.white);
      b.box(0.4, 0.05, 0.05, 0, 0.58, 0.3, PAL.wood); // Joch
      break;
    case U.Lord:
      human(b, { tunic: PAL.gold, legs: PAL.black, sleeve: PAL.gold });
      b.box(0.34, 0.5, 0.05, 0, 0.1, -0.12, PAL.black, true); // Umhang in Teamfarbe
      b.box(0.34, 0.08, 0.06, 0, 0.5, -0.1, PAL.gold); // Kragen
      b.box(0.1, 0.08, 0.14, -0.2, 0.52, 0, PAL.gold); // Schulterstücke
      b.box(0.1, 0.08, 0.14, 0.2, 0.52, 0, PAL.gold);
      b.cyl(0.1, 0.11, 0.08, 6, 0, 0.7, 0, PAL.gold);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.pyramid(0.025, 0.08, Math.cos(a) * 0.09, 0.78, Math.sin(a) * 0.09, PAL.gold);
      }
      b.pyramid(0.03, 0.18, 0, 0.82, 0, PAL.roof, true);
      rArm(b)
        .box(0.045, 0.03, 0.56, 0.21, 0.25, 0.34, PAL.stone)
        .spike(0.03, 0.1, 0.21, 0.255, 0.62, PAL.stone)
        .box(0.03, 0.12, 0.05, 0.21, 0.2, 0.07, PAL.gold)
        .box(0.05, 0.05, 0.08, 0.21, 0.24, 0.0, PAL.gold);
      lArm(b).disc(0.15, 0.04, 6, -0.25, 0.38, 0.04, PAL.gold, true);
      break;
    case U.Archer:
      human(b, { tunic: PAL.treeLight, legs: PAL.woodDark });
      b.cone(0.13, 0.12, 5, 0, 0.68, 0, PAL.treeDark);
      b.box(0.07, 0.22, 0.09, 0.05, 0.3, -0.13, PAL.woodDark, true); // Köcher mit Team
      bowArm(b).box(0.03, 0.56, 0.04, -0.21, 0.0, 0.04, PAL.wood).box(0.015, 0.54, 0.015, -0.21, 0.01, -0.02, PAL.white);
      rArm(b).box(0.014, 0.3, 0.014, 0.2, 0.0, 0.04, PAL.woodDark).box(0.03, 0.04, 0.03, 0.2, 0.0, 0.04, PAL.stone);
      break;
    case U.Crossbowman:
      human(b, { tunic: PAL.stoneDark, legs: PAL.woodDark });
      b.cyl(0.13, 0.15, 0.08, 6, 0, 0.68, 0, PAL.stoneDark);
      b.box(0.07, 0.14, 0.1, 0, 0.32, -0.13, PAL.black, true);
      rArm(b).box(0.04, 0.42, 0.05, 0.19, 0.0, 0.06, PAL.woodDark).box(0.3, 0.03, 0.04, 0.19, 0.02, 0.06, PAL.wood);
      lArm(b).box(0.03, 0.12, 0.04, -0.17, 0.12, 0.08, PAL.woodDark);
      break;
    case U.Spearman:
      human(b, { tunic: PAL.wood, legs: PAL.woodDark });
      b.cone(0.12, 0.1, 5, 0, 0.7, 0, PAL.stoneDark);
      rArm(b, 0, 1).box(0.03, 0.03, 1.05, 0.21, 0.26, 0.36, PAL.woodDark).spike(0.045, 0.16, 0.21, 0.275, 0.88, PAL.stone);
      lArm(b).disc(0.14, 0.04, 6, -0.25, 0.38, 0.04, PAL.wood, true);
      break;
    case U.Pikeman:
      human(b, { tunic: PAL.stoneDark, legs: PAL.stoneDark, sleeve: PAL.stone });
      b.box(0.2, 0.12, 0.2, 0, 0.66, 0, PAL.stone);
      b.box(0.05, 0.14, 0.05, 0, 0.78, 0, PAL.roof, true);
      b.box(0.3, 0.06, 0.18, 0, 0.5, 0, PAL.stone); // Brustplatte
      rArm(b, 0, 1).box(0.035, 0.035, 1.4, 0.22, 0.27, 0.5, PAL.woodDark).spike(0.055, 0.18, 0.22, 0.285, 1.2, PAL.stone);
      break;
    case U.Maceman:
      human(b, { tunic: PAL.wood, legs: PAL.woodDark, sleeve: PAL.woodDark });
      b.box(0.22, 0.1, 0.2, 0, 0.66, 0, PAL.stone);
      rArm(b).box(0.04, 0.04, 0.34, 0.21, 0.26, 0.2, PAL.woodDark).box(0.13, 0.13, 0.13, 0.21, 0.22, 0.42, PAL.stoneDark);
      lArm(b).disc(0.13, 0.04, 6, -0.25, 0.36, 0.04, PAL.stoneDark, true);
      break;
    case U.Swordsman:
      human(b, { tunic: PAL.stone, legs: PAL.stoneDark, sleeve: PAL.stoneDark });
      b.box(0.2, 0.1, 0.2, 0, 0.66, 0, PAL.stone);
      b.box(0.04, 0.16, 0.12, 0, 0.76, 0, PAL.roof, true);
      b.box(0.3, 0.14, 0.19, 0, 0.42, 0, PAL.stoneDark, true); // Wappenrock-Gürtel in Teamfarbe
      rArm(b).box(0.045, 0.03, 0.5, 0.21, 0.25, 0.32, PAL.stone).spike(0.03, 0.08, 0.21, 0.255, 0.57, PAL.stone).box(0.03, 0.11, 0.04, 0.21, 0.2, 0.07, PAL.gold);
      lArm(b).box(0.04, 0.34, 0.24, -0.25, 0.14, 0.04, PAL.stone, true);
      break;
    case U.Knight:
      horse(b, PAL.woodDark, PAL.black);
      b.box(0.34, 0.3, 0.5, 0, 0.3, 0, PAL.white, true); // Schabracke in Teamfarbe
      human(b, { tunic: PAL.stone, legs: PAL.stoneDark, sleeve: PAL.stone, dy: 0.34, anim: false });
      b.box(0.22, 0.12, 0.22, 0, 1.0, 0, PAL.stone);
      b.box(0.05, 0.22, 0.14, 0, 1.12, -0.02, PAL.roof, true); // Helmbusch
      b.box(0.035, 0.035, 1.1, 0.22, 0.88, 0.5, PAL.woodDark).box(0.04, 0.2, 0.3, 0.22, 0.84, 0.8, PAL.roof, true).spike(0.04, 0.2, 0.22, 0.9, 1.05, PAL.stone);
      b.box(0.04, 0.32, 0.22, -0.26, 0.74, 0.05, PAL.white, true);
      break;
    case U.Tunneler:
      human(b, { tunic: PAL.woodDark, legs: PAL.black });
      b.cyl(0.11, 0.12, 0.08, 5, 0, 0.7, 0, PAL.thatch);
      b.box(0.05, 0.05, 0.05, 0, 0.78, 0.08, PAL.gold);
      rArm(b).box(0.03, 0.03, 0.4, 0.2, 0.25, 0.22, PAL.woodDark).box(0.2, 0.05, 0.05, 0.2, 0.25, 0.4, PAL.stoneDark);
      break;
    case U.Laddermen:
      human(b, { tunic: PAL.thatch, legs: PAL.woodDark, noArms: true });
      b.box(0.04, 0.95, 0.04, -0.1, 0.2, -0.18, PAL.wood);
      b.box(0.04, 0.95, 0.04, 0.1, 0.2, -0.18, PAL.wood);
      for (let i = 0; i < 4; i++) b.box(0.2, 0.03, 0.03, 0, 0.32 + i * 0.22, -0.18, PAL.woodDark);
      b.box(0.1, 0.05, 0.05, 0, 0.74, 0.1, PAL.roof, true);
      b.box(0.07, 0.06, 0.2, -0.17, 0.5, -0.06, PAL.thatch);
      b.box(0.07, 0.06, 0.2, 0.17, 0.5, -0.06, PAL.thatch);
      break;
    case U.Engineer:
      human(b, { tunic: PAL.wood, legs: PAL.woodDark });
      b.cyl(0.13, 0.15, 0.1, 6, 0, 0.7, 0, PAL.thatch, true);
      b.box(0.2, 0.14, 0.1, 0.0, 0.2, -0.14, PAL.woodDark);
      rArm(b).box(0.03, 0.03, 0.3, 0.2, 0.25, 0.18, PAL.woodDark).box(0.08, 0.1, 0.14, 0.2, 0.21, 0.34, PAL.stoneDark);
      break;
    case U.Monk:
      b.cone(0.19, 0.58, 6, 0, 0, 0, PAL.woodDark);
      b.box(0.16, 0.16, 0.16, 0, 0.54, 0, SKIN);
      b.cone(0.13, 0.14, 5, 0, 0.66, 0, PAL.woodDark);
      b.box(0.24, 0.06, 0.2, 0, 0.3, 0, PAL.gold, true); // Gürtel
      b.part(PART.ArmL, -0.18, SH, 0).box(0.07, 0.26, 0.08, -0.18, 0.27, 0, PAL.woodDark);
      b.part(PART.ArmR, 0.18, SH, 0).box(0.07, 0.26, 0.08, 0.18, 0.27, 0, PAL.woodDark);
      b.part(0);
      b.box(0.03, 0.9, 0.03, 0.2, 0.0, 0.1, PAL.wood);
      b.box(0.1, 0.03, 0.03, 0.2, 0.8, 0.1, PAL.gold);
      b.box(0.03, 0.12, 0.03, 0.2, 0.74, 0.1, PAL.gold);
      break;
    case U.Slave:
      human(b, { tunic: PAL.sandDark, legs: PAL.sandDark });
      rArm(b).box(0.03, 0.03, 0.4, 0.2, 0.26, 0.22, PAL.woodDark).cone(0.06, 0.14, 4, 0.2, 0.28, 0.42, PAL.roof).cone(0.03, 0.1, 4, 0.2, 0.38, 0.42, PAL.gold);
      break;
    case U.Slinger:
      human(b, { tunic: PAL.sand, legs: PAL.woodDark, sleeve: PAL.sandDark });
      b.box(0.15, 0.13, 0.15, 0, 0.7, 0, PAL.white, true);
      rArm(b).box(0.012, 0.3, 0.012, 0.21, 0.0, 0.05, PAL.woodDark).box(0.05, 0.05, 0.05, 0.21, 0.0, 0.05, PAL.stoneDark);
      break;
    case U.HorseArcher:
      horse(b, PAL.sandDark, PAL.roof);
      b.box(0.3, 0.06, 0.3, 0, 0.56, 0, PAL.white, true); // Satteldecke
      human(b, { tunic: PAL.white, legs: PAL.sand, sleeve: PAL.white, dy: 0.34 });
      b.box(0.15, 0.13, 0.15, 0, 1.0, 0, PAL.white, true);
      bowArm(b, 0.34).box(0.03, 0.5, 0.04, -0.21, 0.34, 0.04, PAL.wood).box(0.015, 0.48, 0.015, -0.21, 0.35, -0.02, PAL.white);
      rArm(b, 0.34).box(0.014, 0.3, 0.014, 0.2, 0.34, 0.04, PAL.woodDark);
      break;
    case U.ArabSwordsman:
      human(b, { tunic: PAL.roof, legs: PAL.white, sleeve: PAL.roof });
      b.box(0.2, 0.12, 0.2, 0, 0.66, 0, PAL.white, true);
      b.cone(0.05, 0.08, 4, 0, 0.78, 0, PAL.white);
      rArm(b).box(0.045, 0.03, 0.36, 0.21, 0.25, 0.24, PAL.stone).box(0.045, 0.03, 0.16, 0.21, 0.29, 0.5, PAL.stone).box(0.03, 0.11, 0.04, 0.21, 0.2, 0.07, PAL.gold);
      lArm(b).disc(0.14, 0.04, 6, -0.25, 0.36, 0.04, PAL.gold);
      break;
    case U.Assassin:
      human(b, { tunic: PAL.black, legs: PAL.black });
      b.cone(0.14, 0.18, 5, 0, 0.62, 0, PAL.black);
      b.box(0.3, 0.05, 0.19, 0, 0.42, 0, PAL.roof, true);
      rArm(b).box(0.025, 0.015, 0.34, 0.2, 0.26, 0.24, PAL.stone);
      lArm(b).box(0.025, 0.015, 0.26, -0.2, 0.26, 0.2, PAL.stone);
      break;
    case U.Firethrower:
      human(b, { tunic: PAL.roof, legs: PAL.black });
      b.box(0.18, 0.22, 0.1, 0, 0.3, -0.16, PAL.black);
      b.box(0.14, 0.14, 0.14, 0, 0.7, 0, PAL.thatch, true);
      rArm(b).box(0.05, 0.05, 0.42, 0.2, 0.24, 0.26, PAL.stoneDark).spike(0.06, 0.14, 0.2, 0.25, 0.47, PAL.gold);
      break;
    case U.Catapult:
      b.part(PART.Wheel, -0.46, 0.17, 0.4).disc(0.17, 0.07, 8, -0.46, 0.17, 0.4, PAL.black).box(0.07, 0.05, 0.3, -0.46, 0.15, 0.4, PAL.woodDark);
      b.part(PART.Wheel, 0.46, 0.17, 0.4).disc(0.17, 0.07, 8, 0.46, 0.17, 0.4, PAL.black).box(0.07, 0.05, 0.3, 0.46, 0.15, 0.4, PAL.woodDark);
      b.part(PART.Wheel, -0.46, 0.17, -0.4).disc(0.17, 0.07, 8, -0.46, 0.17, -0.4, PAL.black).box(0.07, 0.05, 0.3, -0.46, 0.15, -0.4, PAL.woodDark);
      b.part(PART.Wheel, 0.46, 0.17, -0.4).disc(0.17, 0.07, 8, 0.46, 0.17, -0.4, PAL.black).box(0.07, 0.05, 0.3, 0.46, 0.15, -0.4, PAL.woodDark);
      b.part(0);
      b.box(0.8, 0.12, 1.1, 0, 0.14, 0, PAL.woodDark);
      b.box(0.1, 0.55, 0.1, -0.28, 0.2, 0.05, PAL.wood);
      b.box(0.1, 0.55, 0.1, 0.28, 0.2, 0.05, PAL.wood);
      b.box(0.62, 0.08, 0.08, 0, 0.7, 0.05, PAL.woodDark);
      b.box(0.3, 0.06, 0.5, 0, 0.2, -0.5, PAL.roof, true);
      // Wurfarm mit Schale
      b.part(PART.Lever, 0, 0.62, 0.05);
      b.box(0.1, 0.1, 1.05, 0, 0.58, -0.28, PAL.wood);
      b.box(0.3, 0.1, 0.3, 0, 0.64, 0.38, PAL.stoneDark);
      b.box(0.2, 0.2, 0.2, 0, 0.74, 0.38, PAL.stone);
      b.part(0);
      break;
    case U.Trebuchet:
      b.part(PART.Wheel, -0.55, 0.2, 0.5).disc(0.2, 0.08, 8, -0.55, 0.2, 0.5, PAL.black).box(0.08, 0.05, 0.36, -0.55, 0.18, 0.5, PAL.woodDark);
      b.part(PART.Wheel, 0.55, 0.2, 0.5).disc(0.2, 0.08, 8, 0.55, 0.2, 0.5, PAL.black).box(0.08, 0.05, 0.36, 0.55, 0.18, 0.5, PAL.woodDark);
      b.part(PART.Wheel, -0.55, 0.2, -0.5).disc(0.2, 0.08, 8, -0.55, 0.2, -0.5, PAL.black).box(0.08, 0.05, 0.36, -0.55, 0.18, -0.5, PAL.woodDark);
      b.part(PART.Wheel, 0.55, 0.2, -0.5).disc(0.2, 0.08, 8, 0.55, 0.2, -0.5, PAL.black).box(0.08, 0.05, 0.36, 0.55, 0.18, -0.5, PAL.woodDark);
      b.part(0);
      b.box(1.1, 0.12, 1.5, 0, 0.18, 0, PAL.woodDark);
      b.box(0.1, 1.2, 0.1, -0.38, 0.2, 0, PAL.wood);
      b.box(0.1, 1.2, 0.1, 0.38, 0.2, 0, PAL.wood);
      b.box(0.9, 0.1, 0.1, 0, 1.2, 0, PAL.woodDark);
      b.box(0.1, 0.8, 0.1, -0.38, 0.2, 0.5, PAL.woodDark, false, 0);
      b.box(0.1, 0.8, 0.1, 0.38, 0.2, 0.5, PAL.woodDark, false, 0);
      b.box(0.5, 0.18, 0.5, 0, 0.2, -0.55, PAL.roof, true);
      b.part(PART.Lever, 0, 1.2, 0);
      b.box(0.12, 0.12, 2.0, 0, 1.14, 0.35, PAL.wood);
      b.box(0.4, 0.4, 0.4, 0, 0.78, -0.62, PAL.stoneDark);
      b.box(0.24, 0.12, 0.24, 0, 1.16, 1.3, PAL.black);
      b.part(0);
      break;
    case U.Ram:
      b.part(PART.Wheel, -0.38, 0.14, 0.5).disc(0.14, 0.07, 6, -0.38, 0.14, 0.5, PAL.black);
      b.part(PART.Wheel, 0.38, 0.14, 0.5).disc(0.14, 0.07, 6, 0.38, 0.14, 0.5, PAL.black);
      b.part(PART.Wheel, -0.38, 0.14, -0.5).disc(0.14, 0.07, 6, -0.38, 0.14, -0.5, PAL.black);
      b.part(PART.Wheel, 0.38, 0.14, -0.5).disc(0.14, 0.07, 6, 0.38, 0.14, -0.5, PAL.black);
      b.part(0);
      b.box(0.7, 0.1, 1.5, 0, 0.1, 0, PAL.woodDark);
      b.roof(0.94, 0.55, 1.4, 0, 0.5, 0, PAL.wood, false);
      b.box(0.08, 0.4, 0.08, -0.38, 0.1, 0.6, PAL.woodDark);
      b.box(0.08, 0.4, 0.08, 0.38, 0.1, 0.6, PAL.woodDark);
      b.box(0.08, 0.4, 0.08, -0.38, 0.1, -0.6, PAL.woodDark);
      b.box(0.08, 0.4, 0.08, 0.38, 0.1, -0.6, PAL.woodDark);
      b.box(0.2, 0.1, 0.4, 0, 0.82, 0, PAL.roof, true);
      b.part(PART.Slide, 0, 0.3, 0);
      b.box(0.16, 0.16, 1.7, 0, 0.3, 0.1, PAL.stoneDark);
      b.box(0.24, 0.22, 0.24, 0, 0.27, 1.0, PAL.black);
      b.part(0);
      break;
    case U.SiegeTower:
      b.part(PART.Wheel, -0.6, 0.18, 0.4).disc(0.18, 0.08, 8, -0.6, 0.18, 0.4, PAL.black);
      b.part(PART.Wheel, 0.6, 0.18, 0.4).disc(0.18, 0.08, 8, 0.6, 0.18, 0.4, PAL.black);
      b.part(PART.Wheel, -0.6, 0.18, -0.4).disc(0.18, 0.08, 8, -0.6, 0.18, -0.4, PAL.black);
      b.part(PART.Wheel, 0.6, 0.18, -0.4).disc(0.18, 0.08, 8, 0.6, 0.18, -0.4, PAL.black);
      b.part(0);
      b.box(1.1, 1.8, 1.1, 0, 0.3, 0, PAL.wood);
      b.box(1.2, 0.12, 1.2, 0, 2.1, 0, PAL.woodDark);
      b.box(0.9, 0.55, 0.06, 0, 1.1, 0.58, PAL.woodDark);
      b.box(0.2, 0.5, 0.2, 0.4, 2.22, 0.4, PAL.roof, true);
      b.box(0.2, 0.5, 0.2, -0.4, 2.22, -0.4, PAL.roof, true);
      b.box(0.1, 1.6, 0.04, -0.3, 0.4, 0.57, PAL.woodDark);
      b.box(0.1, 1.6, 0.04, 0.3, 0.4, 0.57, PAL.woodDark);
      b.box(1.2, 0.2, 0.12, 0, 0.1, 0.55, PAL.black);
      break;
    case U.Mantlet:
      b.part(PART.Wheel, -0.4, 0.1, 0.0).disc(0.1, 0.06, 6, -0.4, 0.1, 0.0, PAL.black);
      b.part(PART.Wheel, 0.4, 0.1, 0.0).disc(0.1, 0.06, 6, 0.4, 0.1, 0.0, PAL.black);
      b.part(0);
      b.box(1.0, 0.8, 0.12, 0, 0.12, 0, PAL.wood);
      b.box(1.04, 0.1, 0.16, 0, 0.92, 0, PAL.woodDark);
      b.box(0.06, 0.5, 0.3, 0.4, 0.1, -0.14, PAL.woodDark);
      b.box(0.06, 0.5, 0.3, -0.4, 0.1, -0.14, PAL.woodDark);
      b.box(0.3, 0.2, 0.04, 0, 0.5, 0.08, PAL.roof, true);
      b.box(1.0, 0.04, 0.05, 0, 0.45, 0.07, PAL.woodDark);
      break;
    case U.FireBallista:
      b.part(PART.Wheel, -0.4, 0.15, 0.1).disc(0.15, 0.07, 8, -0.4, 0.15, 0.1, PAL.black);
      b.part(PART.Wheel, 0.4, 0.15, 0.1).disc(0.15, 0.07, 8, 0.4, 0.15, 0.1, PAL.black);
      b.part(PART.Wheel, 0.0, 0.1, -0.5).disc(0.1, 0.07, 6, 0.0, 0.1, -0.5, PAL.black);
      b.part(0);
      b.box(0.7, 0.12, 0.9, 0, 0.14, 0, PAL.woodDark);
      b.box(0.1, 0.4, 0.1, 0, 0.26, 0, PAL.wood);
      b.box(1.0, 0.08, 0.08, 0, 0.64, 0.2, PAL.wood); // Bogenarme
      b.part(PART.Slide, 0, 0.6, 0.2);
      b.box(0.07, 0.07, 1.0, 0, 0.56, 0.2, PAL.stoneDark);
      b.cone(0.06, 0.16, 4, 0, 0.56, 0.78, PAL.roof);
      b.cone(0.03, 0.12, 4, 0, 0.6, 0.84, PAL.gold);
      b.part(0);
      b.box(0.2, 0.2, 0.06, 0, 0.3, -0.4, PAL.roof, true);
      break;
    default:
      human(b, { tunic: PAL.stone, legs: PAL.black });
  }
  return b.build();
}

/** Getragene Waren: Form je Ressource (kleine Modelle am Rücken/in den Armen, Farbe per Teamfarb-Kanal). */
export type CargoKind = 'bundle' | 'block' | 'ingot' | 'barrel' | 'sack' | 'basket' | 'wheel' | 'sticks' | 'roll';
export const CARGO_KINDS: CargoKind[] = ['bundle', 'block', 'ingot', 'barrel', 'sack', 'basket', 'wheel', 'sticks', 'roll'];
export const CARGO_OF_RES: CargoKind[] = [];
CARGO_OF_RES[R.Wood] = 'bundle';
CARGO_OF_RES[R.Stone] = 'block';
CARGO_OF_RES[R.Iron] = 'ingot';
CARGO_OF_RES[R.Pitch] = 'barrel';
CARGO_OF_RES[R.Hops] = 'sack';
CARGO_OF_RES[R.Ale] = 'barrel';
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

/** Waren sitzen am Rücken (z < 0) bzw. auf der Schulter; Teamfarb-Kanal = Warenfarbe. */
export function buildCargoModel(kind: CargoKind): ModelGeos {
  const b = new ModelBuilder({ ao: 0.1, cullDown: true });
  switch (kind) {
    case 'bundle':
      for (const [x, y] of [[-0.05, 0.0], [0.05, 0.0], [0, 0.08]]) b.box(0.07, 0.07, 0.34, x, 0.5 + y, -0.17, PAL.wood, true, 0);
      b.box(0.17, 0.03, 0.03, 0, 0.52, -0.1, PAL.black);
      b.box(0.17, 0.03, 0.03, 0, 0.52, -0.26, PAL.black);
      break;
    case 'block':
      b.box(0.2, 0.18, 0.2, 0, 0.46, -0.2, PAL.stone, true);
      b.box(0.08, 0.05, 0.08, 0.04, 0.64, -0.2, PAL.white);
      break;
    case 'ingot':
      b.box(0.2, 0.07, 0.12, 0, 0.5, -0.19, PAL.black, true);
      b.box(0.2, 0.07, 0.12, 0, 0.57, -0.19, PAL.black, true);
      b.box(0.17, 0.02, 0.09, 0, 0.64, -0.19, PAL.stone);
      break;
    case 'barrel':
      b.cyl(0.1, 0.1, 0.2, 6, 0, 0.44, -0.18, PAL.wood, true);
      b.cyl(0.105, 0.105, 0.03, 6, 0, 0.5, -0.18, PAL.black);
      break;
    case 'sack':
      b.box(0.2, 0.22, 0.14, 0, 0.44, -0.2, PAL.thatch, true);
      b.box(0.12, 0.06, 0.1, 0, 0.64, -0.2, PAL.thatch, true);
      break;
    case 'basket':
      b.box(0.22, 0.1, 0.16, 0, 0.5, -0.19, PAL.woodDark);
      b.box(0.18, 0.07, 0.12, 0, 0.6, -0.19, PAL.roof, true);
      break;
    case 'wheel':
      b.cyl(0.12, 0.12, 0.08, 7, 0, 0.5, -0.17, PAL.gold, true);
      b.cyl(0.12, 0.12, 0.08, 7, 0, 0.58, -0.17, PAL.gold, true);
      break;
    case 'sticks':
      for (let i = 0; i < 4; i++) b.box(0.03, 0.55, 0.03, -0.07 + i * 0.045, 0.3, -0.18, i % 2 ? PAL.woodDark : PAL.wood, i === 1);
      b.box(0.2, 0.03, 0.03, 0, 0.5, -0.18, PAL.black);
      break;
    default:
      b.cyl(0.07, 0.07, 0.26, 6, 0, 0.44, -0.2, PAL.woodDark, true);
      b.cyl(0.04, 0.04, 0.27, 5, 0, 0.44, -0.2, PAL.stone);
  }
  return b.build();
}

void SH;
