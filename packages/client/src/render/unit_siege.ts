import { U } from '@strongpoly/shared';
import { UnitBuilder } from './unit_builder';
import { UPART } from './unit_shader';
import { VIS } from './units_style';
import { C, st, V3 } from './unit_items';

/**
 * Belagerungsgerät aus Holz, Eisenbändern, Seilen und Fellen; Spielerfarbe an Schilden, Wimpeln und Fellstreifen.
 * Hauptteile gelten für beide Detailstufen, Feinteile (Speichen, Seile, Beschläge) nur nah (VIS.Near).
 */
const near = VIS.Near;
const far = VIS.Far;

/** Rad mit Speichen; Drehpunkt = Achse (Höhe = Radius, die Shader-Drehgeschwindigkeit hängt am Radius) */
function wheel(b: UnitBuilder, x: number, z: number, r: number, thick = 0.06): void {
  const side = Math.sign(x) || 1;
  st(b, { part: UPART.Wheel, px: x, py: r, pz: z, show: far });
  b.disc(r, thick, 6, x, r, z, C.woodD, { capA: false });
  st(b, { part: UPART.Wheel, px: x, py: r, pz: z, show: near });
  b.disc(r, thick, 8, x, r, z, C.woodD, { capA: false });
  b.disc(r * 0.82, thick * 0.6, 8, x + side * 0.02, r, z, C.wood, { capA: false });
  b.limb([x + side * 0.03, r - r * 0.85, z], [x + side * 0.03, r + r * 0.85, z], 0.012, 0.012, C.woodL, { capA: false, capB: false });
  b.limb([x + side * 0.03, r, z - r * 0.85], [x + side * 0.03, r, z + r * 0.85], 0.012, 0.012, C.woodL, { capA: false, capB: false });
  b.disc(r * 0.26, thick * 1.4, 5, x + side * 0.03, r, z, C.iron, { capA: false });
  st(b, { part: UPART.Wheel, px: x, py: r, pz: z, show: far });
  b.disc(r * 0.26, thick * 1.4, 4, x + side * 0.03, r, z, C.iron, { capA: false });
}

const beam = (b: UnitBuilder, a: V3, c: V3, r: number, col: number = C.wood): void => {
  b.limb(a, c, r, r, col, { capA: true, capB: true });
};

/** Eisenband um ein senkrechtes/waagerechtes Holz */
const band = (b: UnitBuilder, x: number, y: number, z: number, w: number, h: number, d: number): void => {
  b.box(w, h, d, x, y, z, C.iron);
};

function pennant(b: UnitBuilder, x: number, y: number, z: number): void {
  st(b, { part: UPART.Mane, px: x, py: y, pz: z });
  b.quad([x, y + 0.14, z], [x, y + 0.14, z - 0.34], [x, y + 0.02, z - 0.3], [x, y + 0.0, z], C.white, true, { team: true });
}

export function buildSiege(b: UnitBuilder, type: number): void {
  switch (type) {
    case U.Catapult:
      catapult(b);
      break;
    case U.Trebuchet:
      trebuchet(b);
      break;
    case U.Ram:
      ram(b);
      break;
    case U.SiegeTower:
      tower(b);
      break;
    case U.Mantlet:
      mantlet(b);
      break;
    default:
      ballista(b);
  }
}

function catapult(b: UnitBuilder): void {
  for (const x of [-0.5, 0.5]) for (const z of [-0.4, 0.4]) wheel(b, x, z, 0.17);
  st(b, {});
  b.box(1.02, 0.06, 0.06, 0, 0.12, 0.4, C.woodD); // Achsen
  b.box(1.02, 0.06, 0.06, 0, 0.12, -0.4, C.woodD);
  for (const x of [-0.3, 0.3]) b.box(0.09, 0.09, 1.2, x, 0.17, 0, C.wood); // Längsholme
  for (const z of [-0.5, -0.1, 0.45]) b.box(0.7, 0.07, 0.09, 0, 0.21, z, C.woodD);
  // zwei Böcke aus schrägen Streben
  for (const x of [-0.33, 0.33]) {
    beam(b, [x, 0.22, -0.2], [x * 0.9, 0.78, 0.05], 0.04);
    beam(b, [x, 0.22, 0.32], [x * 0.9, 0.78, 0.05], 0.04);
    b.box(0.06, 0.34, 0.06, x, 0.22, 0.05, C.woodD);
  }
  b.box(0.8, 0.07, 0.08, 0, 0.74, 0.05, C.woodD);
  st(b, { show: near });
  for (const x of [-0.33, 0.33]) band(b, x * 0.95, 0.64, 0.05, 0.075, 0.03, 0.12);
  b.box(0.06, 0.06, 0.4, -0.2, 0.22, -0.5, C.woodD);
  b.cyl(0.07, 0.07, 0.36, 6, 0, 0.3, -0.52, C.wood, { rotZ: Math.PI / 2 }); // Seilwinde
  b.limb([-0.12, 0.3, -0.52], [0.0, 0.62, -0.08], 0.008, 0.008, C.rope, { capA: false, capB: false });
  b.limb([0.12, 0.3, -0.52], [0.0, 0.62, -0.08], 0.008, 0.008, C.rope, { capA: false, capB: false });
  for (const x of [-0.12, 0.12]) b.box(0.03, 0.11, 0.03, x, 0.3, -0.52, C.iron);
  // Schutzschild-Brett in Teamfarbe vorn
  st(b, {});
  b.box(0.7, 0.3, 0.04, 0, 0.26, 0.58, C.white, { team: true, taper: [0.9, 1.0] });
  // Wurfarm mit Schale
  st(b, { part: UPART.Lever, px: 0, py: 0.7, pz: 0.05 });
  b.limb([0, 0.64, 0.52], [0, 0.7, -0.52], 0.045, 0.04, C.wood, { capA: true, capB: true });
  b.box(0.26, 0.04, 0.24, 0, 0.58, 0.55, C.woodD);
  b.box(0.04, 0.12, 0.24, -0.13, 0.58, 0.55, C.woodD);
  b.box(0.04, 0.12, 0.24, 0.13, 0.58, 0.55, C.woodD);
  b.box(0.26, 0.12, 0.04, 0, 0.58, 0.67, C.woodD);
  b.ball(0.1, 0.1, 0.1, 0, 0.72, 0.54, C.stone, 2);
  b.box(0.1, 0.1, 0.1, 0, 0.62, -0.5, C.iron); // Gegengewicht-Ende
  st(b, { part: UPART.Lever, px: 0, py: 0.7, pz: 0.05, show: near });
  band(b, 0, 0.67, 0.05, 0.08, 0.1, 0.06);
  band(b, 0, 0.66, -0.3, 0.07, 0.07, 0.04);
  pennant(b, -0.33, 0.78, -0.2);
  st(b, { show: near });
  b.ball(0.08, 0.08, 0.08, 0.15, 0.1, -0.78, C.stone, 2); // Steine am Heck
  b.ball(0.07, 0.07, 0.07, -0.1, 0.09, -0.8, C.rock, 2);
}

function trebuchet(b: UnitBuilder): void {
  for (const x of [-0.58, 0.58]) for (const z of [-0.5, 0.5]) wheel(b, x, z, 0.2, 0.07);
  st(b, {});
  b.box(1.2, 0.07, 0.07, 0, 0.14, 0.5, C.woodD);
  b.box(1.2, 0.07, 0.07, 0, 0.14, -0.5, C.woodD);
  for (const x of [-0.42, 0.42]) b.box(0.11, 0.11, 1.6, x, 0.18, 0, C.wood);
  for (const z of [-0.7, -0.2, 0.2, 0.7]) b.box(0.9, 0.08, 0.1, 0, 0.27, z, C.woodD);
  // A-Gestell: vier hohe Streben, Querachse oben
  for (const x of [-0.42, 0.42]) {
    beam(b, [x, 0.26, -0.58], [x * 0.95, 1.55, 0.0], 0.05);
    beam(b, [x, 0.26, 0.58], [x * 0.95, 1.55, 0.0], 0.05);
    b.box(0.06, 0.5, 0.06, x, 0.26, 0.0, C.woodD);
  }
  b.box(1.0, 0.1, 0.1, 0, 1.5, 0, C.woodD);
  st(b, { show: near });
  for (const x of [-0.42, 0.42]) {
    b.limb([x * 0.98, 0.7, -0.3], [x * 0.98, 0.7, 0.3], 0.025, 0.025, C.wood, { capA: true, capB: true });
    band(b, x * 0.96, 1.46, 0, 0.11, 0.05, 0.14);
  }
  b.box(0.06, 0.3, 0.06, 0, 0.26, -0.9, C.woodD);
  // Schutzbretter in Teamfarbe seitlich
  st(b, {});
  for (const x of [-0.5, 0.5]) b.box(0.04, 0.5, 0.8, x, 0.28, 0.0, C.white, { team: true });
  b.box(0.52, 0.1, 0.46, 0, 1.12, -0.62, C.white, { team: true });
  // Schwingarm: kurzes Ende mit Gegengewicht, langes Ende mit Schleuder
  st(b, { part: UPART.Lever, px: 0, py: 1.5, pz: 0 });
  b.limb([0, 1.42, 1.4], [0, 1.48, -0.5], 0.05, 0.065, C.wood, { capA: true, capB: true });
  b.box(0.46, 0.46, 0.42, 0, 0.82, -0.62, C.rock, { taper: [0.95, 0.95] });
  b.box(0.5, 0.04, 0.46, 0, 1.28, -0.62, C.iron);
  b.limb([-0.18, 1.3, -0.62], [0, 1.48, -0.5], 0.012, 0.012, C.rope, { capA: false, capB: false });
  b.limb([0.18, 1.3, -0.62], [0, 1.48, -0.5], 0.012, 0.012, C.rope, { capA: false, capB: false });
  b.limb([0, 1.42, 1.4], [0, 1.08, 1.55], 0.01, 0.01, C.rope, { capA: false, capB: false });
  b.ball(0.12, 0.12, 0.12, 0, 1.0, 1.55, C.stone, 2);
  st(b, { part: UPART.Lever, px: 0, py: 1.5, pz: 0, show: near });
  band(b, 0, 1.46, 0.0, 0.08, 0.12, 0.1);
  band(b, 0, 1.44, 0.7, 0.07, 0.07, 0.05);
  band(b, 0, 1.46, -0.3, 0.075, 0.08, 0.05);
  pennant(b, 0.0, 1.62, 0.0);
}

function ram(b: UnitBuilder): void {
  for (const x of [-0.4, 0.4]) for (const z of [-0.5, 0.5]) wheel(b, x, z, 0.14, 0.07);
  st(b, {});
  b.box(0.72, 0.09, 1.55, 0, 0.1, 0, C.woodD);
  // Pfosten und Dach (Fellbespannung)
  for (const x of [-0.36, 0.36]) for (const z of [-0.62, 0.62]) b.box(0.07, 0.46, 0.07, x, 0.18, z, C.wood);
  b.wedge(0.94, 0.4, 1.6, 0, 0.6, 0, C.hide, { taper: 1 });
  b.box(0.82, 0.05, 1.5, 0, 0.58, 0, C.woodD);
  st(b, {});
  // Teamfarbe: Streifen auf dem Dach und Schilde an den Flanken
  b.box(0.14, 0.03, 1.52, 0, 0.99, 0, C.white, { team: true });
  for (const x of [-0.37, 0.37]) b.box(0.03, 0.26, 1.0, x, 0.26, 0, C.white, { team: true });
  st(b, { show: near });
  for (const z of [-0.5, 0, 0.5]) b.box(0.84, 0.035, 0.08, 0, 0.58, z, C.iron);
  for (const x of [-0.36, 0.36]) b.box(0.06, 0.05, 1.4, x, 0.62, 0, C.woodD);
  // Rammbock: Stamm mit Eisenkopf, an Ketten aufgehängt
  st(b, { part: UPART.Slide, px: 0, py: 0.3, pz: 0 });
  b.limb([0, 0.34, -0.85], [0, 0.34, 0.92], 0.085, 0.085, C.wood, { capA: true, capB: false });
  b.limb([0, 0.34, 0.92], [0, 0.34, 1.12], 0.1, 0.07, C.iron, { capA: true, capB: true });
  b.limb([0, 0.34, 1.12], [0, 0.34, 1.2], 0.07, 0.02, C.steelD, { capA: false });
  st(b, { part: UPART.Slide, px: 0, py: 0.3, pz: 0, show: near });
  band(b, 0, 0.34, 0.5, 0.18, 0.18, 0.04);
  band(b, 0, 0.34, -0.2, 0.18, 0.18, 0.04);
  for (const z of [-0.2, 0.5]) {
    b.limb([-0.06, 0.34, z], [-0.04, 0.55, z], 0.008, 0.008, C.iron, { capA: false, capB: false });
    b.limb([0.06, 0.34, z], [0.04, 0.55, z], 0.008, 0.008, C.iron, { capA: false, capB: false });
  }
  pennant(b, 0.0, 1.0, -0.6);
}

function tower(b: UnitBuilder): void {
  for (const x of [-0.6, 0.6]) for (const z of [-0.42, 0.42]) wheel(b, x, z, 0.19, 0.08);
  st(b, {});
  b.box(1.2, 0.1, 1.2, 0, 0.2, 0, C.woodD);
  // vier Eckpfosten, Beplankung
  for (const x of [-0.52, 0.52]) for (const z of [-0.52, 0.52]) b.box(0.09, 1.9, 0.09, x, 0.28, z, C.wood);
  b.box(1.0, 1.5, 0.05, 0, 0.35, -0.52, C.woodD);
  b.box(0.05, 1.5, 1.0, -0.52, 0.35, 0, C.woodD);
  b.box(0.05, 1.5, 1.0, 0.52, 0.35, 0, C.woodD);
  // Front: Felle über Holz, Schießscharten, Fallbrücke
  b.box(1.0, 1.1, 0.05, 0, 0.4, 0.52, C.hide);
  b.box(1.12, 0.07, 1.12, 0, 1.08, 0, C.woodD);
  b.box(1.12, 0.07, 1.12, 0, 2.02, 0, C.woodD);
  st(b, {});
  b.box(0.5, 0.4, 0.04, 0, 1.28, 0.55, C.white, { team: true });
  b.box(0.7, 0.14, 0.04, 0, 0.5, 0.56, C.white, { team: true });
  st(b, { show: near });
  for (const y of [1.45, 1.75]) for (const x of [-0.3, 0.3]) b.box(0.16, 0.06, 0.05, x, y, 0.55, C.black);
  for (const y of [0.55, 0.8, 1.05]) b.limb([-0.5, y, 0.5], [0.5, y + 0.12, 0.5], 0.01, 0.01, C.woodD, { capA: false, capB: false });
  // Zinnen oben, Flagge
  for (const x of [-0.5, -0.17, 0.17, 0.5]) for (const z of [-0.5, 0.5]) b.box(0.14, 0.16, 0.1, x, 2.09, z, C.wood);
  for (const z of [-0.17, 0.17]) for (const x of [-0.5, 0.5]) b.box(0.1, 0.16, 0.14, x, 2.09, z, C.wood);
  // Leiter an der Seite
  b.limb([0.56, 0.3, -0.35], [0.56, 1.9, -0.35], 0.02, 0.02, C.wood, { capA: false, capB: false });
  b.limb([0.56, 0.3, -0.15], [0.56, 1.9, -0.15], 0.02, 0.02, C.wood, { capA: false, capB: false });
  for (let i = 0; i < 6; i++) b.limb([0.56, 0.45 + i * 0.28, -0.35], [0.56, 0.45 + i * 0.28, -0.15], 0.01, 0.01, C.woodD, { capA: false, capB: false });
  b.limb([-0.6, 0.3, 0.0], [-0.6, 0.7, 0.9], 0.02, 0.02, C.woodD, { capA: false, capB: false });
  st(b, { part: 0 });
  b.limb([0.0, 2.1, 0.0], [0.0, 2.7, 0.0], 0.025, 0.02, C.woodD, { capA: false, capB: false });
  pennant(b, 0.0, 2.55, 0.0);
}

function mantlet(b: UnitBuilder): void {
  for (const x of [-0.42, 0.42]) wheel(b, x, 0.0, 0.1, 0.06);
  st(b, {});
  // Schutzwand aus Bohlen, leicht nach hinten geneigt, Stützen, Fellstreifen
  for (let i = 0; i < 5; i++) b.box(0.2, 0.84, 0.07, -0.4 + i * 0.2, 0.12, 0.0, i % 2 ? C.wood : C.woodL, { rotX: -0.1 });
  b.box(1.06, 0.07, 0.12, 0, 0.9, -0.02, C.woodD);
  b.box(1.06, 0.06, 0.1, 0, 0.3, 0.01, C.woodD);
  for (const x of [-0.42, 0.42]) {
    beam(b, [x, 0.1, -0.36], [x, 0.7, -0.05], 0.03, C.woodD);
  }
  st(b, {});
  b.box(0.5, 0.42, 0.04, 0, 0.42, 0.05, C.white, { team: true, rotX: -0.1 });
  st(b, { show: near });
  b.box(0.5, 0.05, 0.05, 0, 0.84, 0.03, C.white);
  b.box(0.1, 0.1, 0.05, 0, 0.62, 0.06, C.gold);
  for (let i = 0; i < 4; i++) band(b, -0.3 + i * 0.2, 0.9, 0.0, 0.03, 0.08, 0.14);
  pennant(b, -0.46, 0.96, 0.0);
}

function ballista(b: UnitBuilder): void {
  for (const x of [-0.4, 0.4]) wheel(b, x, 0.1, 0.15, 0.07);
  wheel(b, 0.0, -0.5, 0.1, 0.07);
  st(b, {});
  b.box(0.62, 0.09, 0.95, 0, 0.14, 0.0, C.woodD);
  b.box(0.1, 0.42, 0.1, 0, 0.22, 0.05, C.wood);
  beam(b, [0.0, 0.2, -0.4], [0.0, 0.5, 0.08], 0.04, C.woodD);
  // Bogenarme (gespannt) mit Sehne
  b.limb([-0.48, 0.66, 0.34], [0.0, 0.66, 0.2], 0.035, 0.05, C.wood, { capA: false, capB: false });
  b.limb([0.48, 0.66, 0.34], [0.0, 0.66, 0.2], 0.035, 0.05, C.wood, { capA: false, capB: false });
  st(b, { show: near });
  b.limb([-0.48, 0.66, 0.34], [-0.04, 0.66, -0.12], 0.008, 0.008, C.bone, { capA: false, capB: false });
  b.limb([0.48, 0.66, 0.34], [0.04, 0.66, -0.12], 0.008, 0.008, C.bone, { capA: false, capB: false });
  band(b, 0, 0.6, 0.2, 0.2, 0.04, 0.06);
  b.cyl(0.05, 0.05, 0.26, 6, 0, 0.34, -0.4, C.woodD, { rotZ: Math.PI / 2 });
  for (const x of [-0.14, 0.14]) b.box(0.03, 0.04, 0.03, x, 0.36, -0.4, C.iron);
  st(b, {});
  for (const x of [-0.3, 0.3]) b.box(0.04, 0.2, 0.36, x, 0.26, 0.0, C.white, { team: true });
  // Schlitten mit brennendem Bolzen
  st(b, { part: UPART.Slide, px: 0, py: 0.6, pz: 0.2 });
  b.box(0.08, 0.07, 1.0, 0, 0.58, 0.2, C.steelD);
  b.limb([0, 0.62, 0.7], [0, 0.62, 0.94], 0.035, 0.005, C.iron, { capA: false });
  b.cone(0.06, 0.16, 5, 0, 0.62, 0.84, C.fire, { rotX: 1.5708 });
  b.cone(0.035, 0.12, 4, 0, 0.62, 0.9, C.fireL, { rotX: 1.5708 });
  st(b, { part: UPART.Slide, px: 0, py: 0.6, pz: 0.2, show: near });
  b.box(0.04, 0.1, 0.05, 0, 0.64, -0.2, C.iron);
  pennant(b, 0.3, 0.52, -0.2);
}
