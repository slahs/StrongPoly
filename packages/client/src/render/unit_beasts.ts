import { U } from '@strongpoly/shared';
import { UnitBuilder, clothA, clothB, Col } from './unit_builder';
import { ARM, UPART } from './unit_shader';
import { VIS } from './units_style';
import { C, HIP, HEAD_Y, SHO, st, V3, bow, quiver, greatHelm, kiteShield, sword, turban, hairVariants } from './unit_items';
import { arm, body, Rig } from './unit_humans';

/** Reittiere (Pferd), Ochse und die berittenen Einheiten (Ritter, Berittener Bogenschütze). */
const HY = HEAD_Y;
const RIDE_Y = 0.5;

/** Ein Bein: Oberschenkel + Unterschenkel mit Knie; `lp` = LegL/LegR (Diagonalpaare), Schienbein-Teil für die Kniebeugung */
function leg(b: UnitBuilder, x: number, z: number, top: number, knee: number, back: number, lp: number, sp: number, col: Col | number, hoof: number, w: number): void {
  st(b, { part: lp, px: x, py: top, pz: z, show: VIS.Near, upper: 0 });
  b.limb([x, top + 0.02, z], [x, knee, z + back], w, w * 0.78, col, { capA: false, capB: false });
  st(b, { part: sp, px: x, py: knee, pz: z + back, show: VIS.Near, upper: top });
  b.limb([x, knee, z + back], [x, 0.04, z + back * 0.4], w * 0.78, w * 0.55, col, { capA: false });
  b.box(w * 1.5, 0.045, w * 1.8, x, 0.0, z + back * 0.4 + 0.005, hoof);
  st(b, { part: lp, px: x, py: top, pz: z, show: VIS.Far });
  b.limb([x, top + 0.02, z], [x, 0.03, z + back * 0.5], w * 0.9, w * 0.6, col, { capA: false });
}

/** Pferd (Fell `coat`, Mähne `mane`); `barding` = Decke in Teamfarbe; `saddle` = Sattelzeug */
export function horse(b: UnitBuilder, coat: Col | number, mane: Col | number, o: { barding?: boolean; saddle?: boolean; blaze?: boolean } = {}): void {
  const hoof = C.black;
  // Beine: Diagonalpaare (links vorn + rechts hinten gemeinsam)
  leg(b, -0.09, 0.22, 0.34, 0.19, 0.03, UPART.LegL, UPART.ShinL, coat, hoof, 0.05);
  leg(b, 0.09, 0.22, 0.34, 0.19, 0.03, UPART.LegR, UPART.ShinR, coat, hoof, 0.05);
  leg(b, -0.09, -0.22, 0.34, 0.2, -0.03, UPART.LegR, UPART.ShinR, coat, hoof, 0.05);
  leg(b, 0.09, -0.22, 0.34, 0.2, -0.03, UPART.LegL, UPART.ShinL, coat, hoof, 0.05);
  // Rumpf: Brust, Bauch, Hinterhand (schaukelt mit dem Gang)
  st(b, { upper: -RIDE_Y });
  b.box(0.27, 0.27, 0.34, 0, 0.3, 0.2, coat, { taper: [0.95, 0.8] });
  b.box(0.29, 0.27, 0.3, 0, 0.3, -0.02, coat);
  b.box(0.27, 0.26, 0.24, 0, 0.3, -0.22, coat, { taper: [0.9, 0.85] });
  // Hals und Kopf (nicken beim Gehen)
  st(b, { part: UPART.Head, px: 0, py: 0.5, pz: 0.28, upper: -RIDE_Y });
  b.limb([0, 0.5, 0.26], [0, 0.74, 0.41], 0.1, 0.062, coat, { capA: false, capB: false });
  b.limb([0, 0.74, 0.41], [0, 0.63, 0.575], 0.064, 0.042, coat, { capA: false });
  b.box(0.07, 0.07, 0.05, 0, 0.6, 0.58, o.blaze ? C.white : C.leatherD);
  st(b, { part: UPART.Head, px: 0, py: 0.5, pz: 0.28, upper: -RIDE_Y, show: VIS.Near });
  b.spike([-0.035, 0.79, 0.39], [-0.04, 0.88, 0.36], 0.018, coat, { capA: false });
  b.spike([0.035, 0.79, 0.39], [0.04, 0.88, 0.36], 0.018, coat, { capA: false });
  // Mähne und Schweif
  st(b, { part: UPART.Mane, px: 0, py: 0.66, pz: 0.3, upper: -RIDE_Y });
  b.box(0.04, 0.16, 0.2, 0, 0.62, 0.3, mane, { rotX: 0.5 });
  b.box(0.05, 0.05, 0.05, 0, 0.78, 0.4, mane);
  st(b, { part: UPART.Mane, px: 0, py: 0.5, pz: -0.34, upper: -RIDE_Y });
  b.limb([0, 0.5, -0.33], [0, 0.18, -0.5], 0.045, 0.02, mane, { capA: false });
  st(b, { upper: -RIDE_Y });
  if (o.saddle) {
    b.box(0.3, 0.05, 0.26, 0, 0.56, -0.02, C.leather);
    b.box(0.31, 0.12, 0.04, 0, 0.58, -0.17, C.leatherD);
  }
  if (o.barding) {
    // Schabracke: hängt beidseitig vom Rücken bis zu den Flanken in Teamfarbe
    b.box(0.35, 0.2, 0.44, 0, 0.33, 0.0, C.white, { team: true, taper: [0.9, 0.95] });
    b.box(0.3, 0.14, 0.18, 0, 0.32, 0.27, C.white, { team: true, taper: [0.9, 0.8] });
    b.box(0.36, 0.035, 0.45, 0, 0.32, 0.0, C.white);
  }
}

/** Ochse mit Joch und Hörnern */
export function ox(b: UnitBuilder): void {
  const coat = clothA();
  const hoof = C.black;
  leg(b, -0.12, 0.24, 0.27, 0.15, 0.02, UPART.LegL, UPART.ShinL, coat, hoof, 0.06);
  leg(b, 0.12, 0.24, 0.27, 0.15, 0.02, UPART.LegR, UPART.ShinR, coat, hoof, 0.06);
  leg(b, -0.12, -0.24, 0.27, 0.15, -0.02, UPART.LegR, UPART.ShinR, coat, hoof, 0.06);
  leg(b, 0.12, -0.24, 0.27, 0.15, -0.02, UPART.LegL, UPART.ShinL, coat, hoof, 0.06);
  st(b, { upper: -0.4 });
  b.box(0.34, 0.3, 0.42, 0, 0.22, 0.17, coat, { taper: [0.9, 0.85] });
  b.box(0.36, 0.3, 0.34, 0, 0.22, -0.18, coat);
  b.box(0.22, 0.18, 0.3, 0, 0.42, 0.1, coat, { taper: [0.8, 0.9] }); // Widerrist
  st(b, { part: UPART.Head, px: 0, py: 0.42, pz: 0.34, upper: -0.4 });
  b.limb([0, 0.42, 0.3], [0, 0.4, 0.5], 0.13, 0.1, coat, { capA: false, capB: false });
  b.limb([0, 0.4, 0.5], [0, 0.33, 0.64], 0.1, 0.06, coat, { capA: false });
  b.box(0.1, 0.05, 0.05, 0, 0.3, 0.66, clothB());
  for (const s of [-1, 1]) {
    b.limb([s * 0.08, 0.46, 0.5], [s * 0.2, 0.52, 0.5], 0.022, 0.016, C.bone, { capA: false, capB: false });
    b.limb([s * 0.2, 0.52, 0.5], [s * 0.24, 0.66, 0.54], 0.016, 0.003, C.bone, { capA: false });
  }
  st(b, { upper: -0.4 });
  b.box(0.4, 0.05, 0.07, 0, 0.5, 0.36, C.woodD); // Joch
  b.box(0.04, 0.12, 0.04, -0.17, 0.4, 0.36, C.woodD);
  b.box(0.04, 0.12, 0.04, 0.17, 0.4, 0.36, C.woodD);
  st(b, { part: UPART.Mane, px: 0, py: 0.42, pz: -0.34, upper: -0.4 });
  b.limb([0, 0.42, -0.35], [0, 0.12, -0.42], 0.03, 0.012, clothB(), { capA: false });
  b.ball(0.035, 0.05, 0.035, 0, 0.1, -0.42, clothB(), 0);
}

export function buildMounted(b: UnitBuilder, type: number): void {
  if (type === U.Knight) {
    horse(b, clothA(), C.black, { barding: true, saddle: true, blaze: true });
    const rig: Rig = { top: C.steel, legs: C.steelD, belt: C.leatherD, boots: C.steelD, sleeves: 'long', broad: 1.08, rider: { dy: 0.25, pivot: RIDE_Y } };
    const up = body(b, rig);
    st(b, { upper: up });
    b.box(0.222, 0.2, 0.13, 0, HIP + 0.04, 0.004, C.steel, { taper: [1.12, 1.08] });
    b.box(0.215, 0.2, 0.13, 0, HIP + 0.0, 0, C.white, { team: true, taper: [1.14, 1.04] });
    b.box(0.095, 0.05, 0.09, -0.108, HIP + 0.215, 0, C.steel, { rotZ: 0.4 });
    b.box(0.095, 0.05, 0.09, 0.108, HIP + 0.215, 0, C.steel, { rotZ: -0.4 });
    arm(b, rig, 'R', ARM.Thrust, (h) => {
      // Lanze mit Wimpel in Teamfarbe
      b.limb([h[0], h[1] - 0.08, h[2] - 0.42], [h[0], h[1] + 0.32, h[2] + 0.98], 0.014, 0.01, C.woodL, { capA: true, capB: false });
      b.spike([h[0], h[1] + 0.32, h[2] + 0.98], [h[0], h[1] + 0.37, h[2] + 1.14], 0.022, C.steel, { capA: false });
      st(b, { part: UPART.Mane, px: h[0], py: h[1] + 0.3, pz: h[2] + 0.9, upper: up });
      b.quad([h[0], h[1] + 0.31, h[2] + 0.94], [h[0], h[1] + 0.31, h[2] + 0.7], [h[0], h[1] + 0.22, h[2] + 0.72], [h[0], h[1] + 0.22, h[2] + 0.94], C.white, true, { team: true });
    });
    arm(b, rig, 'L', 1, () => kiteShield(b, { team: true, cross: true, x: -0.215, y: 0.3, h: 0.34, z: 0.06 }));
    st(b, { part: UPART.Head, px: 0, py: 0.655 + 0.25, pz: 0, upper: up });
    greatHelm(b, { y: HY - 0.065 + 0.0, plumeTeam: true });
    return;
  }
  // Berittener Bogenschütze
  horse(b, clothA(), C.black, { saddle: false });
  st(b, { upper: -RIDE_Y });
  b.box(0.34, 0.025, 0.36, 0, 0.55, -0.02, C.white, { team: true });
  b.box(0.3, 0.1, 0.3, 0, 0.5, -0.02, clothB(), { taper: [1.1, 1.0] });
  const rig: Rig = { top: clothB(), legs: C.bone, belt: C.white, skirt: 0.16, boots: C.leather, sleeves: 'long', rider: { dy: 0.25, pivot: RIDE_Y } };
  const up = body(b, rig);
  st(b, { upper: up });
  b.box(0.2, 0.035, 0.135, 0, 0.62, 0, C.white, { team: true });
  quiver(b, { team: false, col: C.leatherD });
  arm(b, rig, 'R', ARM.Slash, (h) => b.limb([h[0], h[1] - 0.01, h[2]], [h[0], h[1] + 0.1, h[2] + 0.02], 0.007, 0.007, C.bone, { capA: false, capB: false }));
  arm(b, rig, 'L', 0, (h) => bow(b, [h[0], h[1] + 0.02, h[2]], { len: 0.58, recurve: true, col: C.woodL }), { part: UPART.Bow });
  st(b, { part: UPART.Head, px: 0, py: 0.655 + 0.25, pz: 0, upper: up });
  turban(b, clothB(1.1), { tall: 1.0, tail: true });
  void sword;
  void SHO;
  void hairVariants;
}
void ({} as V3);
