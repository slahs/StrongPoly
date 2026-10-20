import { UnitBuilder, clothA, clothB, hairC } from './unit_builder';
import { UPART } from './unit_shader';
import { JOB } from './unit_jobs';
import { VIS } from './units_style';
import { axe, C, dagger, hammer, HAND_L, HAND_R, HEAD_Y, HIP, hood, pick, SHO, softCap, st, strawHat, SX, turban, V3 } from './unit_items';
import { arm, Rig } from './unit_humans';

/**
 * Ausrüstung der Bauernberufe. Alle Berufe teilen Körper und Arme (Armstil folgt dem Beruf im Shader);
 * Hüte, Schürzen und Werkzeuge hängen an Berufs-Bits (aStyle.w), je Instanz ist genau eines gesetzt.
 */
const HY = HEAD_Y;
const bit = (j: number): number => 1 << j;

/** Kopfteil-Zustand für einen Beruf */
const headOf = (b: UnitBuilder, up: number, job: number, show = 0): UnitBuilder => st(b, { part: UPART.Head, px: 0, py: SHO + 0.03, pz: 0, upper: up, sel: bit(job), show });
/** Rechte/linke Hand (Arm im Berufsstil 9/10) */
const handR = (b: UnitBuilder, up: number, job: number): UnitBuilder => st(b, { part: UPART.ArmR, px: SX, py: SHO, pz: 0, style: 9, upper: up, sel: bit(job) });
const handL = (b: UnitBuilder, up: number, job: number): UnitBuilder => st(b, { part: UPART.ArmL, px: -SX, py: SHO, pz: 0, style: 10, upper: up, sel: bit(job) });
const bodyOf = (b: UnitBuilder, up: number, job: number): UnitBuilder => st(b, { upper: up, sel: bit(job) });

/** Schürze vor dem Rumpf (von der Brust bis zu den Knien) */
function apron(b: UnitBuilder, col: number | { c: number; k: number }, o: { top?: number; len?: number; w?: number } = {}): void {
  const top = o.top ?? 0.6;
  const len = o.len ?? 0.3;
  b.box(o.w ?? 0.19, len, 0.02, 0, top - len, 0.074, col, { taper: [1.0, 1.0] });
  b.box(0.15, 0.025, 0.14, 0, top - 0.02, 0.0, col); // Latz-Träger um den Hals
}

function longSmock(b: UnitBuilder, len: number, col: { c: number; k: number } | number): void {
  b.box(0.215, len, 0.14, 0, HIP + 0.045 - len, 0, col, { taper: [0.82, 0.86] });
}

export function jobProps(b: UnitBuilder, rig: Rig, up: number): void {
  // gemeinsame Arme (Stil je Beruf im Shader)
  arm(b, rig, 'R', 9);
  arm(b, rig, 'L', 10);
  const R: V3 = HAND_R;
  const L: V3 = HAND_L;

  // ---- Bauer (ohne Beruf): Strohhut / Mütze / barhäuptig, Hacke
  headOf(b, up, JOB.None, VIS.Hat0);
  strawHat(b);
  headOf(b, up, JOB.None, VIS.Hat1);
  softCap(b, clothB(1.1), { tall: 0.8 });
  handR(b, up, JOB.None);
  b.limb([R[0], R[1] - 0.2, R[2] - 0.12], [R[0], R[1] + 0.3, R[2] + 0.3], 0.012, 0.011, C.woodD, { capA: true, capB: false });
  b.box(0.05, 0.015, 0.1, R[0], R[1] + 0.28, R[2] + 0.33, C.iron, { rotX: 0.5 });
  handL(b, up, JOB.None);
  b.box(0.07, 0.07, 0.07, L[0] - 0.01, L[1] - 0.04, L[2] + 0.03, C.bone); // Brotbeutel
  bodyOf(b, up, JOB.None);
  b.box(0.2, 0.1, 0.13, 0, HIP + 0.12, 0.0, clothB(0.9), { taper: [1.2, 1.0] }); // Weste

  // ---- Holzfäller: Filzmütze mit Feder, große Axt, Stämmchen am Gürtel
  headOf(b, up, JOB.Woodcutter);
  softCap(b, clothB(), { feather: true });
  handR(b, up, JOB.Woodcutter);
  axe(b, R, { big: true });
  bodyOf(b, up, JOB.Woodcutter);
  b.box(0.21, 0.07, 0.135, 0, HIP + 0.19, 0.0, C.leatherD, { taper: [1.2, 1.0] });
  b.limb([-0.12, HIP - 0.02, 0.07], [-0.12, HIP - 0.12, 0.09], 0.012, 0.012, C.woodD, { capA: false, capB: false });

  // ---- Steinmetz: Mütze, Lederschürze, Fäustel und Meißel
  headOf(b, up, JOB.Stonemason);
  softCap(b, clothB(0.85), { tall: 0.55 });
  bodyOf(b, up, JOB.Stonemason);
  apron(b, C.leather, { top: 0.6, len: 0.34 });
  handR(b, up, JOB.Stonemason);
  hammer(b, R, { head: 0.06 });
  handL(b, up, JOB.Stonemason);
  b.limb([L[0], L[1] - 0.02, L[2]], [L[0], L[1] + 0.12, L[2] + 0.1], 0.012, 0.007, C.steelD, { capA: false });

  // ---- Bergmann: Helm mit Lampe, Spitzhacke, Erzsack
  headOf(b, up, JOB.Miner);
  b.ball(0.078, 0.058, 0.082, 0, HY + 0.035, 0, C.leatherD, 2);
  b.cyl(0.082, 0.084, 0.026, 6, 0, HY + 0.0, 0, C.leatherD, { capA: false, capB: false });
  b.box(0.034, 0.04, 0.03, 0, HY + 0.045, 0.082, C.brass);
  b.cone(0.016, 0.04, 4, 0, HY + 0.072, 0.085, C.fire);
  handR(b, up, JOB.Miner);
  pick(b, R);
  bodyOf(b, up, JOB.Miner);
  b.box(0.16, 0.18, 0.1, 0, 0.36, -0.13, C.leather, { rotX: -0.15 }); // Erzsack
  b.box(0.1, 0.05, 0.07, 0, 0.53, -0.14, C.stone);

  // ---- Pechsieder: Kopftuch, langer Kittel, Schöpfkelle und Eimer
  headOf(b, up, JOB.PitchWorker);
  turban(b, clothB(), { tall: 0.8 });
  bodyOf(b, up, JOB.PitchWorker);
  longSmock(b, 0.26, clothA(0.85));
  handR(b, up, JOB.PitchWorker);
  b.limb([R[0], R[1] - 0.05, R[2] - 0.04], [R[0], R[1] + 0.08, R[2] + 0.46], 0.012, 0.011, C.woodD, { capA: false, capB: false });
  b.cyl(0.04, 0.032, 0.05, 6, R[0], R[1] + 0.04, R[2] + 0.48, C.black, { rotX: 1.2 });
  handL(b, up, JOB.PitchWorker);
  b.cyl(0.062, 0.05, 0.1, 6, L[0] - 0.01, L[1] - 0.05, L[2] + 0.06, C.black);
  b.cyl(0.055, 0.055, 0.012, 6, L[0] - 0.01, L[1] + 0.05, L[2] + 0.06, C.iron, { capA: false });

  // ---- Obstbauer: Strohhut, Korb mit Äpfeln, Apfel in der Hand
  headOf(b, up, JOB.Orchard);
  strawHat(b, { band: C.apple });
  handR(b, up, JOB.Orchard);
  b.ball(0.03, 0.03, 0.03, R[0], R[1] + 0.03, R[2] + 0.02, C.apple, 0);
  handL(b, up, JOB.Orchard);
  b.cyl(0.095, 0.075, 0.08, 6, L[0] - 0.02, L[1] - 0.05, L[2] + 0.08, C.woodL, { capA: false });
  for (const [dx, dz] of [[-0.03, 0.0], [0.03, 0.01], [0, 0.05]]) b.ball(0.034, 0.034, 0.034, L[0] - 0.02 + dx, L[1] + 0.04, L[2] + 0.08 + dz, C.apple, 0);
  bodyOf(b, up, JOB.Orchard);
  apron(b, C.white, { top: 0.55, len: 0.22 });

  // ---- Milchbauer: Haube, Schürze, Melkeimer, Butterstößel
  headOf(b, up, JOB.Dairy);
  softCap(b, clothB(1.1), { tall: 0.85 });
  bodyOf(b, up, JOB.Dairy);
  apron(b, C.white, { top: 0.58, len: 0.3 });
  handR(b, up, JOB.Dairy);
  b.limb([R[0], R[1] - 0.08, R[2]], [R[0], R[1] + 0.34, R[2] + 0.12], 0.012, 0.012, C.woodL, { capA: false });
  b.disc(0.045, 0.012, 5, R[0], R[1] + 0.33, R[2] + 0.12, C.woodD, { rotX: 0 });
  handL(b, up, JOB.Dairy);
  b.cyl(0.062, 0.052, 0.12, 6, L[0] - 0.01, L[1] - 0.06, L[2] + 0.06, C.woodL);
  b.cyl(0.056, 0.056, 0.012, 6, L[0] - 0.01, L[1] + 0.05, L[2] + 0.06, C.white, { capA: false });

  // ---- Jäger: Kapuze mit Feder, Bogen, Köcher, Messer
  headOf(b, up, JOB.Hunter);
  hood(b, clothB(), { point: true });
  b.limb([0.045, HY + 0.06, -0.02], [0.08, HY + 0.15, -0.08], 0.01, 0.002, C.white, { ry: 0.5, capA: false });
  bodyOf(b, up, JOB.Hunter);
  b.box(0.2, 0.12, 0.13, 0, HIP + 0.1, 0, C.leather, { taper: [1.25, 1.0] });
  b.box(0.06, 0.22, 0.06, 0.06, 0.4, -0.105, C.leatherD, { rotX: -0.35, rotZ: -0.2 });
  handR(b, up, JOB.Hunter);
  dagger(b, R, [0, 0.4, 0.9]);
  handL(b, up, JOB.Hunter);
  st(b, { part: UPART.ArmL, px: -SX, py: SHO, pz: 0, style: 10, upper: up, sel: bit(JOB.Hunter) });
  b.limb([L[0], L[1] - 0.25, L[2] - 0.01], [L[0], L[1] + 0.3, L[2] + 0.04], 0.012, 0.012, C.woodL, { capA: false, capB: false });

  // ---- Landwirt: Strohhut, Sichel, Garbe
  headOf(b, up, JOB.Farmer);
  strawHat(b, { band: C.red });
  handR(b, up, JOB.Farmer);
  b.limb([R[0], R[1] - 0.03, R[2]], [R[0], R[1] + 0.14, R[2] + 0.12], 0.013, 0.012, C.woodD, { capA: true, capB: false });
  b.limb([R[0], R[1] + 0.14, R[2] + 0.12], [R[0], R[1] + 0.22, R[2] + 0.3], 0.02, 0.012, C.steel, { ry: 0.25, capA: false, capB: false });
  b.limb([R[0], R[1] + 0.22, R[2] + 0.3], [R[0], R[1] + 0.2, R[2] + 0.4], 0.012, 0.003, C.steel, { ry: 0.25, capA: false });
  handL(b, up, JOB.Farmer);
  for (let i = 0; i < 4; i++) b.limb([L[0] - 0.03 + i * 0.02, L[1] - 0.12, L[2] + 0.02], [L[0] - 0.05 + i * 0.035, L[1] + 0.12, L[2] + 0.08], 0.011, 0.016, C.straw, { capA: false, capB: false });
  b.box(0.07, 0.025, 0.05, L[0] - 0.02, L[1] + 0.0, L[2] + 0.05, C.rope);

  // ---- Hopfenpflücker: grüne Mütze, hohe Hopfenstange, Hopfenkorb
  headOf(b, up, JOB.HopPicker);
  softCap(b, clothB(), { tall: 1.0 });
  handR(b, up, JOB.HopPicker);
  b.limb([R[0], R[1] - 0.35, R[2]], [R[0], 1.22, R[2]], 0.012, 0.011, C.woodD, { capA: false, capB: false });
  for (const y of [0.62, 0.82, 1.02]) {
    b.ball(0.045, 0.06, 0.045, R[0] - 0.02, y, R[2], C.hop, 0);
    b.ball(0.04, 0.055, 0.04, R[0] + 0.02, y + 0.07, R[2], C.hop, 0);
  }
  handL(b, up, JOB.HopPicker);
  b.cyl(0.085, 0.07, 0.08, 6, L[0] - 0.02, L[1] - 0.05, L[2] + 0.08, C.woodL, { capA: false });
  b.ball(0.06, 0.04, 0.06, L[0] - 0.02, L[1] + 0.03, L[2] + 0.08, C.hop, 1);

  // ---- Müller: weiße Mütze, mehlbestäubt, Mehlsack auf der Schulter
  headOf(b, up, JOB.Miller);
  softCap(b, C.white, { tall: 1.3 });
  bodyOf(b, up, JOB.Miller);
  b.box(0.17, 0.2, 0.13, 0.06, 0.58, -0.02, C.bone, { rotZ: -0.5, taper: [0.8, 0.8] });
  b.box(0.07, 0.05, 0.07, 0.115, 0.7, -0.02, C.rope);
  b.box(0.12, 0.03, 0.12, 0.0, 0.46, -0.1, C.white);

  // ---- Bäcker: hohe weiße Mütze, weiße Schürze, Brotschieber mit Laib
  headOf(b, up, JOB.Baker);
  b.cyl(0.07, 0.074, 0.1, 6, 0, HY + 0.035, 0, C.white, { capA: false });
  b.ball(0.085, 0.045, 0.085, 0, HY + 0.15, 0, C.white, 1);
  bodyOf(b, up, JOB.Baker);
  apron(b, C.white, { top: 0.6, len: 0.34, w: 0.2 });
  handR(b, up, JOB.Baker);
  b.limb([R[0], R[1] - 0.08, R[2] - 0.05], [R[0], R[1] + 0.05, R[2] + 0.42], 0.012, 0.011, C.woodL, { capA: false });
  b.disc(0.07, 0.012, 6, R[0], R[1] + 0.06, R[2] + 0.48, C.woodL, { rotX: 0.2 });
  b.ball(0.06, 0.035, 0.04, R[0], R[1] + 0.09, R[2] + 0.48, C.hide, 1);
  handL(b, up, JOB.Baker);
  b.ball(0.05, 0.035, 0.035, L[0] - 0.01, L[1] + 0.0, L[2] + 0.07, C.hide, 1);

  // ---- Brauer: Mütze, Lederschürze, Fass, Rührpaddel
  headOf(b, up, JOB.Brewer);
  softCap(b, clothB(0.8), { tall: 0.6 });
  bodyOf(b, up, JOB.Brewer);
  apron(b, C.leatherD, { top: 0.6, len: 0.32 });
  handR(b, up, JOB.Brewer);
  b.limb([R[0], R[1] - 0.1, R[2] - 0.02], [R[0], R[1] + 0.22, R[2] + 0.34], 0.012, 0.011, C.woodD, { capA: false, capB: false });
  b.box(0.07, 0.014, 0.1, R[0], R[1] + 0.2, R[2] + 0.38, C.woodL, { rotX: 0.9 });
  handL(b, up, JOB.Brewer);
  b.cyl(0.07, 0.07, 0.12, 6, L[0] - 0.01, L[1] - 0.05, L[2] + 0.08, C.wood);
  b.cyl(0.073, 0.073, 0.02, 6, L[0] - 0.01, L[1] - 0.02, L[2] + 0.08, C.iron, { capA: false, capB: false });
  b.cyl(0.073, 0.073, 0.02, 6, L[0] - 0.01, L[1] - 0.09, L[2] + 0.08, C.iron, { capA: false, capB: false });

  // ---- Bogner: Kapuze, Bogenstab, Zugmesser
  headOf(b, up, JOB.Bowyer);
  softCap(b, clothB(), { feather: true, tall: 0.9 });
  bodyOf(b, up, JOB.Bowyer);
  b.box(0.2, 0.1, 0.13, 0, HIP + 0.11, 0, C.leather, { taper: [1.2, 1.0] });
  apron(b, C.leatherD, { top: 0.52, len: 0.22, w: 0.17 });
  handR(b, up, JOB.Bowyer);
  dagger(b, R, [0, 0.3, 0.95], C.steelD);
  handL(b, up, JOB.Bowyer);
  b.limb([L[0], L[1] - 0.28, L[2]], [L[0], L[1] + 0.52, L[2] + 0.03], 0.016, 0.01, C.woodL, { capA: false, capB: false });
  b.limb([L[0], L[1] + 0.52, L[2] + 0.03], [L[0], L[1] + 0.6, L[2] - 0.02], 0.01, 0.006, C.woodL, { capA: false });

  // ---- Drechsler: Mütze, Schürze, gedrechselte Stange
  headOf(b, up, JOB.Turner);
  softCap(b, clothB(1.0), { tall: 0.7 });
  bodyOf(b, up, JOB.Turner);
  apron(b, C.hide, { top: 0.6, len: 0.3 });
  handR(b, up, JOB.Turner);
  b.limb([R[0], R[1] - 0.25, R[2]], [R[0], R[1] + 0.55, R[2] + 0.42], 0.012, 0.012, C.woodL, { capA: true, capB: true });
  for (const t of [0.35, 0.55, 0.75]) b.cyl(0.02, 0.02, 0.025, 5, R[0], R[1] - 0.25 + 0.8 * t, R[2] + 0.42 * t, C.woodD, { rotX: 0.5 });
  handL(b, up, JOB.Turner);
  b.limb([L[0], L[1], L[2]], [L[0], L[1] + 0.1, L[2] + 0.12], 0.012, 0.006, C.steelD, { capA: false });

  // ---- Schmied: Stirnband, schwere Lederschürze, Schmiedehammer, Zange mit glühendem Eisen
  headOf(b, up, JOB.Smith);
  b.cyl(0.072, 0.074, 0.028, 6, 0, HY + 0.02, 0, clothB(0.8), { capA: false, capB: false });
  bodyOf(b, up, JOB.Smith);
  apron(b, C.black, { top: 0.6, len: 0.4, w: 0.22 });
  handR(b, up, JOB.Smith);
  hammer(b, R, { big: true, head: 0.08, col: C.steelD });
  handL(b, up, JOB.Smith);
  b.limb([L[0] - 0.01, L[1], L[2]], [L[0] - 0.03, L[1] + 0.02, L[2] + 0.22], 0.01, 0.007, C.iron, { capA: false, capB: false });
  b.limb([L[0] + 0.01, L[1] + 0.02, L[2]], [L[0] + 0.02, L[1] + 0.03, L[2] + 0.22], 0.01, 0.007, C.iron, { capA: false, capB: false });
  b.box(0.04, 0.035, 0.1, L[0] - 0.005, L[1] + 0.03, L[2] + 0.28, C.fire);

  // ---- Gerber: Mütze, Schürze, Fellrolle auf dem Rücken, Schabmesser
  headOf(b, up, JOB.Tanner);
  softCap(b, clothB(0.9), { tall: 0.6 });
  bodyOf(b, up, JOB.Tanner);
  apron(b, C.leatherD, { top: 0.6, len: 0.3 });
  b.cyl(0.05, 0.05, 0.3, 6, 0, SHO - 0.05, -0.12, C.hide, { rotZ: 1.5708 });
  b.cyl(0.052, 0.052, 0.025, 6, 0.08, SHO - 0.05, -0.12, C.rope, { rotZ: 1.5708 });
  handR(b, up, JOB.Tanner);
  dagger(b, R, [0, 0.25, 0.95], C.steelD);
  handL(b, up, JOB.Tanner);
  b.box(0.12, 0.012, 0.16, L[0], L[1] + 0.02, L[2] + 0.1, C.hide, { rotX: -0.4 });

  // ---- Plattner: Eisenkappe, Schürze, Hammer, Brustplatte
  headOf(b, up, JOB.Armorer);
  b.ball(0.077, 0.055, 0.08, 0, HY + 0.03, 0, C.steelD, 2);
  bodyOf(b, up, JOB.Armorer);
  apron(b, C.black, { top: 0.6, len: 0.38, w: 0.21 });
  handR(b, up, JOB.Armorer);
  hammer(b, R, { head: 0.06, col: C.steel });
  handL(b, up, JOB.Armorer);
  b.box(0.13, 0.15, 0.03, L[0] - 0.01, L[1] + 0.0, L[2] + 0.12, C.steel, { rotX: -0.3, taper: [0.8, 1.0] });

  // ---- Gräber: Kopftuch, Schaufel
  headOf(b, up, JOB.Digger);
  turban(b, clothB(1.0), { tall: 0.7, tail: true });
  handR(b, up, JOB.Digger);
  b.limb([R[0], R[1] - 0.25, R[2] - 0.12], [R[0], R[1] + 0.28, R[2] + 0.4], 0.012, 0.011, C.woodD, { capA: true, capB: false });
  b.box(0.1, 0.16, 0.014, R[0], R[1] + 0.28, R[2] + 0.45, C.steelD, { rotX: 0.9, taper: [0.6, 1.0] });
  bodyOf(b, up, JOB.Digger);
  b.box(0.2, 0.06, 0.13, 0, HIP + 0.01, 0, clothB(0.9), { taper: [1.2, 1.0] });

  // ---- Zimmermann: Mütze, Werkzeuggürtel, Hammer, Brett
  headOf(b, up, JOB.Carpenter);
  softCap(b, clothA(1.0), { tall: 0.6 });
  bodyOf(b, up, JOB.Carpenter);
  b.box(0.215, 0.05, 0.135, 0, HIP + 0.0, 0, C.leatherD);
  b.box(0.04, 0.12, 0.03, 0.12, HIP - 0.08, 0.03, C.woodD);
  b.box(0.05, 0.08, 0.012, -0.11, HIP - 0.06, 0.07, C.steel); // Säge
  handR(b, up, JOB.Carpenter);
  hammer(b, R, { head: 0.045 });
  handL(b, up, JOB.Carpenter);
  b.box(0.07, 0.02, 0.6, L[0], L[1] + 0.02, L[2] + 0.2, C.woodL, { rotX: -0.15 });

  // ---- Wirt: Schürze, Krug mit Schaum, Tuch am Arm
  headOf(b, up, JOB.Innkeeper);
  b.cyl(0.075, 0.075, 0.024, 6, 0, HY + 0.03, 0, C.white, { capA: false, capB: false });
  bodyOf(b, up, JOB.Innkeeper);
  apron(b, C.white, { top: 0.52, len: 0.26, w: 0.21 });
  handR(b, up, JOB.Innkeeper);
  b.cyl(0.04, 0.036, 0.09, 6, R[0] + 0.01, R[1] - 0.03, R[2] + 0.08, C.woodL);
  b.cyl(0.042, 0.042, 0.025, 6, R[0] + 0.01, R[1] + 0.06, R[2] + 0.08, C.white, { capA: false });
  handL(b, up, JOB.Innkeeper);
  b.quad([L[0] - 0.03, L[1] + 0.02, L[2]], [L[0] + 0.03, L[1] + 0.02, L[2]], [L[0] + 0.04, L[1] - 0.14, L[2] + 0.04], [L[0] - 0.04, L[1] - 0.14, L[2] + 0.04], C.white, true);

  // ---- Händler: Hut mit Feder, langer Mantel, Beutel, Waage
  headOf(b, up, JOB.Trader);
  strawHat(b, { col: clothB(1.0), band: C.gold });
  b.limb([0.05, HY + 0.07, -0.02], [0.1, HY + 0.18, -0.07], 0.012, 0.003, C.white, { ry: 0.5, capA: false });
  bodyOf(b, up, JOB.Trader);
  longSmock(b, 0.3, clothA(0.95));
  b.box(0.1, 0.1, 0.05, 0.12, HIP - 0.02, 0.0, C.leather); // Beutel
  handR(b, up, JOB.Trader);
  b.limb([R[0] - 0.12, R[1] + 0.05, R[2] + 0.06], [R[0] + 0.1, R[1] + 0.05, R[2] + 0.06], 0.008, 0.008, C.brass, { capA: false, capB: false });
  b.disc(0.035, 0.008, 4, R[0] - 0.12, R[1] - 0.03, R[2] + 0.06, C.gold);
  b.disc(0.035, 0.008, 4, R[0] + 0.1, R[1] - 0.03, R[2] + 0.06, C.gold);
  handL(b, up, JOB.Trader);
  b.box(0.05, 0.09, 0.12, L[0], L[1] + 0.02, L[2] + 0.08, C.red);

  // ---- Geistlicher: langes Gewand, Stola in Teamfarbe, Buch, Weihrauchfass
  headOf(b, up, JOB.Cleric);
  bodyOf(b, up, JOB.Cleric);
  longSmock(b, 0.36, clothA(1.0));
  b.box(0.06, 0.4, 0.014, 0, 0.3, 0.072, C.white, { team: true });
  b.box(0.012, 0.07, 0.012, 0, SHO - 0.1, 0.085, C.gold);
  b.box(0.05, 0.012, 0.012, 0, SHO - 0.08, 0.085, C.gold);
  handR(b, up, JOB.Cleric);
  b.box(0.05, 0.07, 0.1, R[0], R[1] + 0.01, R[2] + 0.08, C.red);
  handL(b, up, JOB.Cleric);
  b.limb([L[0], L[1], L[2]], [L[0] - 0.01, L[1] - 0.16, L[2] + 0.05], 0.005, 0.005, C.brass, { capA: false, capB: false });
  b.ball(0.035, 0.035, 0.035, L[0] - 0.01, L[1] - 0.19, L[2] + 0.05, C.brass, 1);
  void hairC;
  void turban;
}
