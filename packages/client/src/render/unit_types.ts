import { U } from '@strongpoly/shared';
import { UnitBuilder, clothA, clothB, hairC, skinC } from './unit_builder';
import { ARM, UPART } from './unit_shader';
import { JOB } from './unit_jobs';
import { VIS } from './units_style';
import {
  axe,
  bow,
  C,
  crossbow,
  dagger,
  greatHelm,
  HAND_L,
  HAND_R,
  hairVariants,
  hammer,
  HEAD_Y,
  HIP,
  hood,
  kettleHat,
  kiteShield,
  mace,
  nasalHelm,
  pick,
  quiver,
  roundShield,
  SHO,
  softCap,
  spear,
  st,
  strawHat,
  sword,
  turban,
  V3,
} from './unit_items';
import { arm, body, Rig, upperOf } from './unit_humans';
import { jobProps } from './unit_jobs_models';

/**
 * Fußtruppen: Aufbau je Typ. Jede Funktion zeichnet den Körper (body), die Arme mit Ausrüstung und die Kopfbedeckung.
 * Haar-/Bartvarianten (nur nahes Modell) und Kopfbedeckungs-Varianten laufen über Sichtbarkeits-Bits.
 */
const HY = HEAD_Y;

/** Kopfteil-Zustand (Kopf dreht sich mit): für Hüte, Helme */
function head(b: UnitBuilder, up: number, show = 0): void {
  st(b, { part: UPART.Head, px: 0, py: SHO + 0.03, pz: 0, upper: up, show });
}
/** Oberkörper-Zustand ohne Teil (Rüstung, Tabard, Rucksack) */
function torso(b: UnitBuilder, up: number, show = 0): void {
  st(b, { upper: up, show });
}

/** Tabard (Wappenrock) in Teamfarbe über Rumpf und Hüfte */
function tabard(b: UnitBuilder, o: { len?: number; w?: number; cross?: boolean; trim?: number; chest?: number } = {}): void {
  const len = o.len ?? 0.4;
  const w = (o.w ?? 0.215) * 1.0;
  const d = 0.13 * (o.chest ?? 1);
  b.box(w, len, d, 0, HIP + 0.24 - len, 0, C.white, { team: true, taper: [1.14, 1.04] });
  if (o.cross) {
    b.box(0.034, 0.17, 0.014, 0, HIP + 0.04, d / 2 + 0.002, C.white);
    b.box(0.11, 0.034, 0.014, 0, HIP + 0.11, d / 2 + 0.002, C.white);
  }
}

function breastPlate(b: UnitBuilder, col = C.steel): void {
  b.box(0.222, 0.17, 0.13, 0, HIP + 0.075, 0.004, col, { taper: [1.12, 1.08] });
  b.box(0.095, 0.05, 0.09, -0.105, HIP + 0.2, 0, col, { rotZ: 0.4 });
  b.box(0.095, 0.05, 0.09, 0.105, HIP + 0.2, 0, col, { rotZ: -0.4 });
}

// ---------------------------------------------------------------------------------------------
export function buildInfantry(b: UnitBuilder, type: number, job = 0): void {
  switch (type) {
    case U.Peasant:
      peasant(b, job);
      return;
    case U.Spearman: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'long' };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.2, 0.2, 0.13, 0, HIP + 0.02, 0.0, C.leather, { taper: [1.18, 1.06] }); // Lederkoller
      arm(b, rig, 'R', ARM.Thrust, (h) => spear(b, h, { len: 1.18 }));
      arm(b, rig, 'L', 1, () => roundShield(b, { team: true, col: C.white, rim: C.woodD, r: 0.135, y: 0.4 }));
      head(b, up);
      kettleHat(b, { col: C.steelD });
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.Pikeman: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, boots: C.leatherD, broad: 1.06 };
      const up = body(b, rig);
      torso(b, up);
      breastPlate(b, C.steel);
      // Schärpe quer über die Brust in Teamfarbe
      b.limb([-0.1, HIP + 0.23, 0.07], [0.1, HIP + 0.04, 0.072], 0.024, 0.024, C.white, { team: true, capA: false, capB: false, ry: 0.5 });
      arm(b, rig, 'R', ARM.Thrust, (h) => spear(b, h, { len: 1.62, head: 0.17, dir: [0, 0.6, 0.8] }));
      arm(b, rig, 'L', ARM.Thrust, () => {
        b.box(0.05, 0.05, 0.05, -0.2, 0.37, 0.03, C.steelD);
      });
      head(b, up);
      nasalHelm(b, { col: C.steelD, plume: true });
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.Maceman: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'long', broad: 1.04 };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.215, 0.18, 0.135, 0, HIP + 0.03, 0, C.leather, { taper: [1.16, 1.06] });
      for (const x of [-0.05, 0.05]) b.box(0.022, 0.022, 0.012, x, HIP + 0.11, 0.073, C.steel);
      arm(b, rig, 'R', ARM.Smash, (h) => mace(b, h));
      arm(b, rig, 'L', 1, () => roundShield(b, { team: true, col: C.white, rim: C.iron, boss: C.steel, r: 0.13, y: 0.41 }));
      head(b, up);
      nasalHelm(b, { col: C.iron, coif: null });
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.Swordsman: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, boots: C.leatherD, sleeves: 'long', broad: 1.06 };
      const up = body(b, rig);
      torso(b, up);
      tabard(b, { len: 0.42, cross: true });
      b.box(0.16, 0.07, 0.15, 0, HIP + 0.17, 0, C.steelD, { taper: [1.3, 1.0] }); // Kettenkragen
      arm(b, rig, 'R', ARM.Slash, (h) => sword(b, h, { len: 0.38 }));
      arm(b, rig, 'L', 1, () => kiteShield(b, { team: true, cross: true, x: -0.205, y: 0.26, h: 0.31 }));
      head(b, up);
      nasalHelm(b, { col: C.steel, coif: C.steelD });
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.Archer: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'short', boots: C.leatherD };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.2, 0.12, 0.13, 0, HIP + 0.1, 0, C.leather, { taper: [1.25, 1.0] }); // Lederweste
      quiver(b, { team: true });
      arm(b, rig, 'R', ARM.Slash, (h) => {
        b.limb([h[0], h[1] - 0.01, h[2]], [h[0], h[1] + 0.1, h[2] + 0.02], 0.007, 0.007, C.bone, { capA: false, capB: false });
      });
      arm(b, rig, 'L', 0, (h) => bow(b, [h[0], h[1] + 0.02, h[2]], { len: 0.66 }), { part: UPART.Bow });
      head(b, up);
      // Kopfbedeckung: Variante 0 Kapuze, 1 Mütze mit Feder, 2 Haube
      head(b, up, VIS.Hat0);
      hood(b, clothB(), { point: true });
      head(b, up, VIS.Hat1);
      softCap(b, clothB(1.1), { feather: true });
      head(b, up, VIS.Hat2);
      softCap(b, clothA(0.9), { tall: 0.7 });
      hairVariants(b, { styles: 3, beard: true });
      return;
    }
    case U.Crossbowman: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'long', broad: 1.04 };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.21, 0.21, 0.13, 0, HIP + 0.03, 0, C.leather, { taper: [1.16, 1.06] });
      tabard(b, { len: 0.28, w: 0.16, chest: 1.04 });
      quiver(b, { team: false, x: -0.07, y: 0.32, z: -0.1, col: C.leatherD });
      arm(b, rig, 'R', ARM.Hold, (h) => crossbow(b, [h[0], h[1] + 0.02, h[2]]));
      arm(b, rig, 'L', ARM.Hold, (h) => {
        b.box(0.03, 0.03, 0.14, h[0] + 0.02, h[1] + 0.02, h[2] + 0.1, C.woodD);
      });
      head(b, up);
      kettleHat(b, { col: C.steelD });
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.Monk: {
      const rig: Rig = { top: clothA(), legs: clothA(), belt: null, skirt: 0.37, sleeves: 'long', noNeck: false };
      const up = body(b, rig);
      torso(b, up);
      // Kapuzenkragen und Strick in Teamfarbe
      b.box(0.17, 0.05, 0.15, 0, SHO - 0.035, -0.01, clothA(0.9), { taper: [1.2, 1.0] });
      b.box(0.215, 0.03, 0.13, 0, HIP + 0.04, 0, C.white, { team: true });
      b.limb([0.04, HIP + 0.03, 0.068], [0.06, HIP - 0.14, 0.09], 0.01, 0.01, C.white, { team: true, capA: false });
      head(b, up);
      b.box(0.14, 0.1, 0.05, 0, HY - 0.085, -0.045, clothA(0.85), { taper: [1.3, 0.9] }); // Kapuze im Nacken
      arm(b, rig, 'R', ARM.Hold, (h) => {
        // Stab mit goldenem Kreuz
        b.limb([h[0], 0.0, h[2]], [h[0], 1.06, h[2]], 0.014, 0.012, C.woodD, { capA: false, capB: false });
        b.box(0.016, 0.1, 0.016, h[0], 1.0, h[2], C.gold);
        b.box(0.075, 0.016, 0.016, h[0], 1.04, h[2], C.gold);
      });
      arm(b, rig, 'L', ARM.Hold, (h) => b.box(0.07, 0.09, 0.03, h[0] + 0.03, h[1] + 0.05, h[2] + 0.06, C.red));
      hairVariants(b, { styles: 2, beard: true });
      return;
    }
    case U.Engineer: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'short' };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.19, 0.27, 0.025, 0, HIP - 0.04, 0.075, C.leather, { taper: [1.1, 1.0] }); // Lederschürze
      b.limb([-0.1, HIP + 0.23, 0.07], [0.1, HIP + 0.05, 0.072], 0.022, 0.022, C.white, { team: true, capA: false, capB: false, ry: 0.5 }); // Gurt in Teamfarbe
      // Werkzeugkiste auf dem Rücken
      b.box(0.2, 0.15, 0.1, 0, HIP + 0.04, -0.12, C.woodL);
      b.box(0.21, 0.025, 0.105, 0, HIP + 0.1, -0.12, C.iron);
      arm(b, rig, 'R', ARM.Smash, (h) => hammer(b, h, { big: true }));
      arm(b, rig, 'L', ARM.Hold, (h) => {
        // Rolle mit Plänen
        b.cyl(0.026, 0.026, 0.2, 5, h[0] + 0.02, h[1] - 0.03, h[2] + 0.04, C.bone, { rotX: 1.3 });
      });
      head(b, up);
      // Barett in Teamfarbe mit Lederband, Schutzbrille auf der Stirn
      b.ball(0.08, 0.05, 0.085, 0, HY + 0.045, -0.004, C.white, 1, { team: true });
      b.cyl(0.082, 0.084, 0.022, 6, 0, HY + 0.012, 0, C.leatherD, { capA: false, capB: false });
      b.disc(0.026, 0.014, 5, -0.032, HY + 0.035, 0.064, C.brass);
      b.disc(0.026, 0.014, 5, 0.032, HY + 0.035, 0.064, C.brass);
      hairVariants(b, { styles: 3, beard: true });
      return;
    }
    case U.Tunneler: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'short', boots: C.black };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.17, 0.1, 0.12, 0, HIP + 0.1, 0, C.black, { taper: [1.2, 1.0] });
      b.box(0.1, 0.05, 0.1, 0, SHO - 0.05, 0.0, C.white, { team: true });
      arm(b, rig, 'R', ARM.Dig, (h) => pick(b, h));
      arm(b, rig, 'L', ARM.Hold, (h) => {
        // Laterne
        b.box(0.05, 0.065, 0.05, h[0] - 0.01, h[1] - 0.06, h[2] + 0.02, C.iron);
        b.box(0.036, 0.04, 0.036, h[0] - 0.01, h[1] - 0.05, h[2] + 0.02, C.fireL);
      });
      head(b, up);
      // Bergmannshelm mit Stirnlampe
      b.ball(0.078, 0.058, 0.082, 0, HY + 0.035, 0, C.leatherD, 2);
      b.cyl(0.082, 0.084, 0.026, 6, 0, HY + 0.0, 0, C.leatherD, { capA: false, capB: false });
      b.box(0.034, 0.04, 0.03, 0, HY + 0.045, 0.082, C.brass);
      b.cone(0.016, 0.04, 4, 0, HY + 0.072, 0.085, C.fire);
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.Laddermen: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'short' };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.2, 0.034, 0.13, 0, SHO - 0.04, 0, C.white, { team: true });
      // Leiter schräg über der Schulter, beide Hände halten sie
      const rail = (x: number): void => {
        b.limb([x, 0.3, -0.34], [x, 1.02, 0.16], 0.016, 0.016, C.wood, { capA: true, capB: true });
      };
      st(b, { upper: up });
      rail(-0.085);
      rail(0.085);
      for (let i = 0; i < 6; i++) {
        const t = 0.08 + i * 0.165;
        b.limb([-0.085, 0.3 + 0.72 * t, -0.34 + 0.5 * t], [0.085, 0.3 + 0.72 * t, -0.34 + 0.5 * t], 0.01, 0.01, C.woodD, { capA: false, capB: false });
      }
      arm(b, rig, 'R', ARM.Hold, undefined, { handAt: [0.1, 0.43, 0.02] });
      arm(b, rig, 'L', ARM.Hold, undefined, { handAt: [-0.1, 0.43, 0.02] });
      head(b, up);
      head(b, up, VIS.Hat0);
      softCap(b, clothB(), { tall: 0.8 });
      head(b, up, VIS.Hat1);
      strawHat(b, { col: C.strawD });
      hairVariants(b, { styles: 3, beard: true });
      return;
    }
    case U.Slave: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.rope, sleeves: 'none', bare: true, skirt: 0.14, skirtCol: clothA(), broad: 0.94 };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.2, 0.034, 0.13, 0, SHO - 0.04, 0, C.white, { team: true });
      arm(b, rig, 'R', ARM.Slash, (h) => {
        b.limb([h[0], h[1] - 0.18, h[2] - 0.05], [h[0], h[1] + 0.34, h[2] + 0.17], 0.013, 0.012, C.woodD, { capA: false, capB: false });
        // Flamme (flackert)
        st(b, { part: UPART.Mane, px: h[0], py: h[1] + 0.34, pz: h[2] + 0.17, upper: up });
        b.cone(0.05, 0.14, 5, h[0], h[1] + 0.32, h[2] + 0.17, C.fire);
        b.cone(0.03, 0.12, 4, h[0] + 0.005, h[1] + 0.34, h[2] + 0.18, C.fireL);
      });
      arm(b, rig, 'L', 0, undefined);
      head(b, up);
      // Stirnband in Teamfarbe
      b.cyl(0.074, 0.075, 0.03, 6, 0, HY + 0.02, 0, C.white, { team: true, capA: false, capB: false });
      hairVariants(b, { styles: 2, beard: true });
      return;
    }
    case U.Slinger: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.white, sleeves: 'short', boots: C.leather };
      const up = body(b, rig);
      torso(b, up);
      b.limb([-0.1, HIP + 0.23, 0.07], [0.1, HIP + 0.04, 0.072], 0.026, 0.026, C.white, { team: true, capA: false, capB: false, ry: 0.5 });
      b.box(0.09, 0.09, 0.05, -0.12, HIP - 0.05, 0.0, C.leather); // Steinbeutel
      arm(b, rig, 'R', ARM.Sweep, (h) => {
        // Schleuder: Schnur nach unten, Stein am Ende
        b.limb([h[0], h[1], h[2]], [h[0] + 0.02, h[1] - 0.3, h[2] + 0.04], 0.006, 0.006, C.rope, { capA: false, capB: false });
        b.ball(0.026, 0.026, 0.026, h[0] + 0.02, h[1] - 0.32, h[2] + 0.04, C.stone, 0);
      });
      arm(b, rig, 'L', 0, undefined);
      head(b, up);
      turban(b, clothB(0.95), { tall: 1.0, tail: true });
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.ArabSwordsman: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.white, skirt: 0.24, sleeves: 'long', broad: 1.05 };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.215, 0.05, 0.14, 0, HIP + 0.02, 0, clothB(), { taper: 1.0 }); // Schärpe
      b.box(0.2, 0.035, 0.135, 0, SHO - 0.04, 0, C.white, { team: true });
      arm(b, rig, 'R', ARM.Slash, (h) => sword(b, h, { len: 0.4, curved: true, wide: 0.02 }));
      arm(b, rig, 'L', 1, () => roundShield(b, { team: true, col: C.white, rim: C.brass, boss: C.brass, r: 0.12, y: 0.41 }));
      head(b, up);
      // Spitzhelm mit Turbantuch
      b.cone(0.082, 0.11, 6, 0, HY + 0.02, 0, C.steel);
      b.cyl(0.088, 0.09, 0.04, 6, 0, HY - 0.022, 0, clothB(1.1), { capA: false, capB: false });
      b.spike([0, HY + 0.12, 0], [0, HY + 0.17, 0], 0.012, C.brass, { capA: false });
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    case U.Assassin: {
      const rig: Rig = { top: clothA(), legs: clothA(), belt: null, sleeves: 'long', boots: C.black, broad: 0.92, chest: 0.9 };
      const up = body(b, rig);
      torso(b, up);
      b.box(0.2, 0.04, 0.13, 0, HIP + 0.02, 0, C.white, { team: true });
      b.limb([0.08, HIP + 0.02, 0.0], [0.16, HIP - 0.2, -0.04], 0.024, 0.02, C.white, { team: true, capA: false });
      st(b, { part: UPART.Cape, px: 0, py: SHO, pz: -0.06, upper: up });
      b.box(0.2, 0.4, 0.02, 0, 0.22, -0.085, clothA(0.8), { taper: [1.1, 1.0] });
      arm(b, rig, 'R', ARM.Slash, (h) => dagger(b, h, [0, 0.35, 0.9]));
      arm(b, rig, 'L', ARM.Slash, (h) => dagger(b, h, [0, 0.35, 0.9]));
      head(b, up);
      // Kapuze mit Gesichtsschal, Schweif flattert
      b.ball(0.083, 0.078, 0.088, 0, HY + 0.01, -0.004, clothA(), 2);
      b.box(0.14, 0.05, 0.03, 0, HY - 0.04, 0.062, clothA(0.8));
      st(b, { part: UPART.Mane, px: 0, py: HY, pz: -0.07, upper: up });
      b.quad([0.0, HY + 0.02, -0.07], [0.05, HY + 0.01, -0.07], [0.06, HY - 0.16, -0.15], [0.0, HY - 0.15, -0.14], C.white, true, { team: true });
      return;
    }
    case U.Firethrower: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.leatherD, sleeves: 'long', boots: C.leatherD, broad: 1.04 };
      const up = body(b, rig);
      torso(b, up);
      tabard(b, { len: 0.3, w: 0.15 });
      // Brandtank auf dem Rücken mit Schlauch
      b.cyl(0.075, 0.075, 0.25, 6, 0, 0.36, -0.15, C.black, { rotX: 0.1 });
      b.cyl(0.078, 0.078, 0.03, 6, 0, 0.42, -0.15, C.iron);
      b.cyl(0.078, 0.078, 0.03, 6, 0, 0.55, -0.15, C.iron);
      b.limb([0.03, 0.45, -0.1], [0.15, 0.4, 0.04], 0.012, 0.012, C.leatherD, { capA: false, capB: false });
      arm(b, rig, 'R', ARM.Hold, (h) => {
        b.limb([h[0] - 0.02, h[1] - 0.04, h[2] - 0.06], [h[0] - 0.02, h[1] + 0.1, h[2] + 0.34], 0.022, 0.016, C.iron, { capA: false });
        st(b, { part: UPART.Mane, px: h[0] - 0.02, py: h[1] + 0.1, pz: h[2] + 0.34, upper: up });
        b.cone(0.05, 0.2, 5, h[0] - 0.02, h[1] + 0.1, h[2] + 0.36, C.fire, { rotX: 1.5 });
        b.cone(0.028, 0.16, 4, h[0] - 0.02, h[1] + 0.1, h[2] + 0.4, C.fireL, { rotX: 1.5 });
      });
      arm(b, rig, 'L', ARM.Hold, (h) => b.box(0.04, 0.04, 0.1, h[0] + 0.05, h[1] + 0.07, h[2] + 0.16, C.leatherD));
      head(b, up);
      // Lederhaube mit Gesichtsmaske
      b.ball(0.08, 0.075, 0.085, 0, HY + 0.012, -0.004, C.leatherD, 2);
      b.box(0.11, 0.05, 0.03, 0, HY - 0.045, 0.062, C.steelD);
      b.box(0.15, 0.03, 0.12, 0, HY - 0.085, 0, C.white, { team: true });
      return;
    }
    case U.Lord: {
      const rig: Rig = { top: clothA(), legs: clothB(), belt: C.gold, sleeves: 'long', boots: C.black, broad: 1.1, scarf: false, skirt: 0.12, skirtCol: clothA(0.9) };
      const up = body(b, rig);
      torso(b, up);
      // Goldborte, Pelzkragen, Schulterstücke
      b.box(0.2, 0.034, 0.128, 0, SHO - 0.065, 0, C.gold, { taper: [1.2, 1.05] });
      b.box(0.1, 0.05, 0.1, -0.15, SHO - 0.01, 0, C.gold, { rotZ: 0.3 });
      b.box(0.1, 0.05, 0.1, 0.15, SHO - 0.01, 0, C.gold, { rotZ: -0.3 });
      b.cyl(0.115, 0.13, 0.05, 6, 0, SHO - 0.02, 0, C.white, { capA: false, capB: false });
      // Umhang in Teamfarbe
      st(b, { part: UPART.Cape, px: 0, py: SHO, pz: -0.07, upper: up });
      b.box(0.26, 0.5, 0.025, 0, 0.12, -0.09, C.white, { team: true, taper: [0.9, 1.0] });
      b.box(0.27, 0.04, 0.03, 0, 0.12, -0.092, C.gold);
      arm(b, rig, 'R', ARM.Slash, (h) => sword(b, h, { len: 0.46, guard: C.gold, wide: 0.02 }));
      arm(b, rig, 'L', 1, () => kiteShield(b, { team: true, cross: false, x: -0.215, y: 0.25, h: 0.34, rim: C.gold }));
      head(b, up);
      // Krone mit Zacken
      b.cyl(0.082, 0.084, 0.045, 6, 0, HY + 0.03, 0, C.gold, { capA: false });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.spike([Math.cos(a) * 0.07, HY + 0.07, Math.sin(a) * 0.07], [Math.cos(a) * 0.07, HY + 0.13, Math.sin(a) * 0.07], 0.016, C.gold, { capA: false });
      }
      hairVariants(b, { styles: 0, beard: true });
      return;
    }
    default:
      peasant(b, JOB.None);
  }
}

// ---------------------------------------------------------------------------------------------
/** Bauer und alle Berufe: gemeinsamer Körper, Ausrüstung je Beruf über die Auswahl-ID (Beruf + 1). */
function peasant(b: UnitBuilder, _job: number): void {
  const rig: Rig = { top: clothA(), legs: clothB(), belt: C.rope, sleeves: 'short', boots: C.leatherD, scarf: true };
  const up = body(b, rig);
  torso(b, up);
  hairVariants(b, { styles: 3, beard: true });
  jobProps(b, rig, up);
}
