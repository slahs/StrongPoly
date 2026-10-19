import { PAL, U } from '@strongpoly/shared';
import { ModelBuilder, ModelGeos } from './builder';

const SKIN = PAL.sand;

/** Menschliche Grundform: Beine, Torso, Kopf (+ optional Arme) – 36..48 Dreiecke */
function human(b: ModelBuilder, tunic: number, legs: number, opts: { arms?: boolean; team?: boolean; scale?: number } = {}): void {
  b.box(0.2, 0.26, 0.14, 0, 0, 0, legs);
  b.box(0.28, 0.3, 0.17, 0, 0.26, 0, tunic, !!opts.team);
  b.box(0.16, 0.16, 0.16, 0, 0.56, 0, SKIN);
  if (opts.arms) b.box(0.46, 0.07, 0.08, 0, 0.44, 0.02, tunic);
}

function horse(b: ModelBuilder, color: number, rider = true): void {
  b.box(0.3, 0.3, 0.62, 0, 0.28, 0, color);
  b.box(0.12, 0.28, 0.12, 0, 0.5, 0.36, color); // Hals
  b.box(0.12, 0.12, 0.2, 0, 0.62, 0.46, color); // Kopf
  b.box(0.3, 0.3, 0.1, 0, 0, 0.24, PAL.woodDark);
  b.box(0.3, 0.3, 0.1, 0, 0, -0.24, PAL.woodDark);
  if (rider) {
    b.box(0.22, 0.3, 0.16, 0, 0.58, -0.02, PAL.stoneDark);
    b.box(0.15, 0.15, 0.15, 0, 0.88, -0.02, SKIN);
  }
}

export function buildUnitModel(type: number): ModelGeos {
  const b = new ModelBuilder();
  switch (type) {
    case U.Peasant:
      human(b, PAL.thatch, PAL.woodDark);
      b.cone(0.17, 0.1, 6, 0, 0.7, 0, PAL.thatch);
      break;
    case U.Ox:
      b.box(0.34, 0.34, 0.7, 0, 0.22, 0, PAL.woodDark);
      b.box(0.2, 0.2, 0.2, 0, 0.42, 0.42, PAL.wood);
      b.box(0.34, 0.22, 0.1, 0, 0, 0.25, PAL.black);
      b.box(0.34, 0.22, 0.1, 0, 0, -0.25, PAL.black);
      b.box(0.36, 0.05, 0.05, 0, 0.62, 0.45, PAL.white);
      break;
    case U.Lord:
      human(b, PAL.gold, PAL.black, { arms: true });
      b.box(0.34, 0.5, 0.06, 0, 0.12, -0.1, PAL.black, true); // Umhang in Teamfarbe
      b.cyl(0.1, 0.1, 0.1, 5, 0, 0.7, 0, PAL.gold);
      b.box(0.04, 0.04, 0.7, 0.26, 0.15, 0.1, PAL.stone);
      break;
    case U.Archer:
      human(b, PAL.treeLight, PAL.woodDark, { arms: true });
      b.cone(0.13, 0.12, 5, 0, 0.68, 0, PAL.treeDark);
      b.box(0.04, 0.5, 0.04, -0.26, 0.2, 0.12, PAL.wood); // Bogen
      b.box(0.05, 0.12, 0.1, 0, 0.5, -0.12, PAL.woodDark, true); // Köcher mit Team
      break;
    case U.Crossbowman:
      human(b, PAL.stoneDark, PAL.woodDark, { arms: true });
      b.box(0.14, 0.06, 0.18, 0, 0.7, 0, PAL.stoneDark);
      b.box(0.34, 0.04, 0.04, 0, 0.45, 0.22, PAL.woodDark);
      b.box(0.04, 0.04, 0.3, 0, 0.45, 0.1, PAL.wood);
      b.box(0.06, 0.14, 0.1, 0, 0.5, -0.12, PAL.black, true);
      break;
    case U.Spearman:
      human(b, PAL.wood, PAL.woodDark);
      b.box(0.04, 0.04, 1.0, 0.2, 0.3, 0.1, PAL.woodDark);
      b.pyramid(0.04, 0.12, 0.2, 0.3, 0.64, PAL.stone);
      b.cyl(0.14, 0.14, 0.04, 6, -0.2, 0.34, 0.06, PAL.wood, true);
      b.cone(0.12, 0.1, 5, 0, 0.7, 0, PAL.stoneDark);
      break;
    case U.Pikeman:
      human(b, PAL.stoneDark, PAL.stoneDark, { team: false });
      b.box(0.04, 0.04, 1.5, 0.2, 0.3, 0.2, PAL.woodDark);
      b.pyramid(0.05, 0.14, 0.2, 0.3, 0.95, PAL.stone);
      b.box(0.2, 0.12, 0.2, 0, 0.64, 0, PAL.stone);
      b.box(0.05, 0.14, 0.05, 0, 0.74, 0, PAL.roof, true);
      break;
    case U.Maceman:
      human(b, PAL.wood, PAL.woodDark, { arms: true });
      b.box(0.04, 0.34, 0.04, 0.22, 0.38, 0.1, PAL.woodDark);
      b.box(0.12, 0.12, 0.12, 0.22, 0.7, 0.1, PAL.stoneDark);
      b.box(0.22, 0.1, 0.2, 0, 0.66, 0, PAL.stone);
      b.cyl(0.13, 0.13, 0.04, 6, -0.22, 0.34, 0.06, PAL.stoneDark, true);
      break;
    case U.Swordsman:
      human(b, PAL.stone, PAL.stoneDark, { arms: true });
      b.box(0.05, 0.05, 0.62, 0.22, 0.4, 0.2, PAL.stone);
      b.box(0.16, 0.04, 0.04, 0.22, 0.4, -0.02, PAL.gold);
      b.box(0.2, 0.1, 0.2, 0, 0.66, 0, PAL.stone);
      b.box(0.04, 0.16, 0.12, 0, 0.76, 0, PAL.roof, true);
      b.box(0.04, 0.32, 0.24, -0.24, 0.26, 0.04, PAL.stone, true);
      break;
    case U.Knight:
      horse(b, PAL.woodDark);
      b.box(0.04, 0.04, 0.9, 0.2, 0.62, 0.2, PAL.woodDark); // Lanze
      b.box(0.22, 0.12, 0.22, 0, 0.84, -0.02, PAL.stone);
      b.box(0.04, 0.18, 0.1, 0, 0.96, -0.02, PAL.roof, true);
      b.box(0.34, 0.34, 0.04, 0, 0.3, 0.0, PAL.white, true); // Schabracke
      break;
    case U.Tunneler:
      human(b, PAL.woodDark, PAL.black);
      b.cyl(0.11, 0.12, 0.08, 5, 0, 0.7, 0, PAL.thatch);
      b.box(0.04, 0.5, 0.04, 0.22, 0.25, 0, PAL.woodDark);
      b.box(0.22, 0.05, 0.05, 0.22, 0.72, 0, PAL.stoneDark);
      break;
    case U.Laddermen:
      human(b, PAL.thatch, PAL.woodDark, { team: false });
      b.box(0.04, 0.9, 0.04, -0.1, 0.2, -0.16, PAL.wood);
      b.box(0.04, 0.9, 0.04, 0.1, 0.2, -0.16, PAL.wood);
      for (let i = 0; i < 4; i++) b.box(0.2, 0.03, 0.03, 0, 0.35 + i * 0.2, -0.16, PAL.woodDark);
      b.box(0.1, 0.05, 0.05, 0, 0.7, 0.1, PAL.roof, true);
      break;
    case U.Engineer:
      human(b, PAL.wood, PAL.woodDark, { arms: true });
      b.cyl(0.13, 0.15, 0.1, 6, 0, 0.7, 0, PAL.thatch, true);
      b.box(0.2, 0.14, 0.12, 0.22, 0.2, 0, PAL.woodDark);
      break;
    case U.Monk:
      b.cone(0.18, 0.56, 6, 0, 0, 0, PAL.woodDark);
      b.box(0.16, 0.16, 0.16, 0, 0.54, 0, SKIN);
      b.cone(0.13, 0.12, 5, 0, 0.66, 0, PAL.woodDark);
      b.box(0.22, 0.06, 0.04, 0, 0.36, 0.14, PAL.gold, true);
      b.box(0.04, 0.7, 0.04, 0.2, 0, 0.05, PAL.wood);
      break;
    case U.Slave:
      human(b, PAL.sandDark, PAL.sandDark);
      b.box(0.04, 0.3, 0.04, 0.2, 0.4, 0.1, PAL.woodDark);
      b.cone(0.06, 0.14, 4, 0.2, 0.7, 0.1, PAL.roof);
      b.cone(0.03, 0.1, 4, 0.2, 0.78, 0.1, PAL.gold);
      break;
    case U.Slinger:
      human(b, PAL.sand, PAL.woodDark, { arms: true });
      b.box(0.14, 0.14, 0.14, 0, 0.7, 0, PAL.white, true);
      b.box(0.03, 0.3, 0.03, -0.24, 0.3, 0.06, PAL.woodDark);
      break;
    case U.HorseArcher:
      horse(b, PAL.sandDark);
      b.box(0.14, 0.12, 0.14, 0, 0.98, -0.02, PAL.white, true);
      b.box(0.04, 0.45, 0.04, -0.22, 0.64, 0.1, PAL.wood);
      break;
    case U.ArabSwordsman:
      human(b, PAL.roof, PAL.white, { arms: true });
      b.box(0.2, 0.12, 0.2, 0, 0.66, 0, PAL.white, true);
      b.box(0.05, 0.05, 0.55, 0.22, 0.42, 0.18, PAL.stone);
      b.box(0.05, 0.05, 0.14, 0.22, 0.42, 0.5, PAL.stone);
      b.cyl(0.14, 0.14, 0.04, 6, -0.2, 0.34, 0.06, PAL.gold);
      break;
    case U.Assassin:
      human(b, PAL.black, PAL.black, { arms: true });
      b.cone(0.14, 0.18, 5, 0, 0.62, 0, PAL.black);
      b.box(0.04, 0.04, 0.3, 0.2, 0.4, 0.18, PAL.stone);
      b.box(0.3, 0.05, 0.06, 0, 0.5, 0.0, PAL.roof, true);
      break;
    case U.Firethrower:
      human(b, PAL.roof, PAL.black, { arms: true });
      b.box(0.18, 0.2, 0.1, 0, 0.3, -0.16, PAL.black);
      b.box(0.06, 0.06, 0.5, 0.12, 0.44, 0.2, PAL.stoneDark);
      b.cone(0.05, 0.1, 4, 0.12, 0.44, 0.5, PAL.gold);
      b.box(0.14, 0.14, 0.14, 0, 0.7, 0, PAL.thatch, true);
      break;
    case U.Catapult:
      b.box(0.8, 0.12, 1.1, 0, 0.1, 0, PAL.woodDark);
      b.box(0.08, 0.3, 0.3, -0.44, 0, 0.35, PAL.black);
      b.box(0.08, 0.3, 0.3, 0.44, 0, 0.35, PAL.black);
      b.box(0.08, 0.3, 0.3, -0.44, 0, -0.35, PAL.black);
      b.box(0.08, 0.3, 0.3, 0.44, 0, -0.35, PAL.black);
      b.box(0.1, 0.55, 0.1, -0.28, 0.2, 0, PAL.wood);
      b.box(0.1, 0.55, 0.1, 0.28, 0.2, 0, PAL.wood);
      b.box(0.1, 0.1, 1.0, 0, 0.6, -0.1, PAL.wood);
      b.box(0.26, 0.12, 0.26, 0, 0.62, 0.4, PAL.stoneDark);
      b.box(0.3, 0.08, 0.5, 0, 0.5, -0.5, PAL.roof, true);
      break;
    case U.Trebuchet:
      b.box(1.0, 0.1, 1.4, 0, 0.1, 0, PAL.woodDark);
      b.box(0.1, 1.2, 0.1, -0.35, 0.1, 0, PAL.wood);
      b.box(0.1, 1.2, 0.1, 0.35, 0.1, 0, PAL.wood);
      b.box(0.1, 0.1, 1.9, 0, 1.2, 0.1, PAL.wood);
      b.box(0.34, 0.34, 0.34, 0, 0.9, -0.8, PAL.stoneDark);
      b.box(0.2, 0.12, 0.2, 0, 1.2, 1.0, PAL.black);
      b.box(0.08, 0.5, 0.5, 0.4, 0.2, 0.2, PAL.roof, true);
      break;
    case U.Ram:
      b.box(0.7, 0.1, 1.5, 0, 0.1, 0, PAL.woodDark);
      b.roof(0.9, 0.6, 1.3, 0, 0.45, 0, PAL.wood, false);
      b.box(0.8, 0.4, 1.3, 0, 0.1, 0, PAL.woodDark);
      b.box(0.16, 0.16, 1.6, 0, 0.2, 0.1, PAL.stone);
      b.box(0.2, 0.1, 0.3, 0, 0.62, 0, PAL.roof, true);
      break;
    case U.SiegeTower:
      b.box(1.1, 1.8, 1.1, 0, 0.15, 0, PAL.wood);
      b.box(1.2, 0.12, 1.2, 0, 1.95, 0, PAL.woodDark);
      b.box(0.9, 0.5, 0.06, 0, 1.0, 0.58, PAL.woodDark);
      b.box(0.2, 0.5, 0.2, 0.4, 2.07, 0.4, PAL.roof, true);
      b.box(0.2, 0.5, 0.2, -0.4, 2.07, -0.4, PAL.roof, true);
      b.box(1.2, 0.2, 0.12, 0, 0.0, 0.55, PAL.black);
      break;
    case U.Mantlet:
      b.box(1.0, 0.8, 0.12, 0, 0.1, 0, PAL.wood);
      b.box(1.04, 0.1, 0.16, 0, 0.9, 0, PAL.woodDark);
      b.box(0.06, 0.5, 0.3, 0.4, 0.1, -0.12, PAL.woodDark);
      b.box(0.06, 0.5, 0.3, -0.4, 0.1, -0.12, PAL.woodDark);
      b.box(0.3, 0.2, 0.04, 0, 0.5, 0.08, PAL.roof, true);
      break;
    case U.FireBallista:
      b.box(0.8, 0.12, 0.9, 0, 0.1, 0, PAL.woodDark);
      b.box(0.1, 0.4, 0.1, 0, 0.22, 0, PAL.wood);
      b.box(0.9, 0.08, 0.08, 0, 0.62, 0.2, PAL.wood);
      b.box(0.06, 0.06, 0.9, 0, 0.56, 0.2, PAL.stoneDark);
      b.cone(0.05, 0.14, 4, 0, 0.56, 0.7, PAL.roof);
      b.box(0.2, 0.2, 0.06, 0, 0.3, -0.35, PAL.roof, true);
      break;
    default:
      human(b, PAL.stone, PAL.black);
  }
  return b.build();
}
