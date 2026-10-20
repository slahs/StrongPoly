import { UnitBuilder, Col, clothA, clothB, hairC, skinC } from './unit_builder';
import { VIS } from './units_style';

/** Gemeinsame Maße und Bauteile der Figuren: Skelett, Waffen, Schilde, Werkzeuge, Kopfbedeckungen. */
export type V3 = [number, number, number];

/** Skelett (Einheiten in Tiles; Standard-Fußsoldat ≈ 0,81 hoch, ≈ 5,5 Kopfhöhen) */
export const HIP = 0.4;
export const KNEE = 0.215;
export const ANKLE = 0.05;
export const SHO = 0.625;
export const SX = 0.158;
export const LEGX = 0.058;
export const HEAD_Y = 0.737;
/** Ruheposition der Hände (Arm hängt) */
export const HAND_R: V3 = [0.172, 0.372, 0.04];
export const HAND_L: V3 = [-0.172, 0.372, 0.04];
export const ELBOW_R: V3 = [0.168, 0.495, -0.012];

// feste Materialfarben (sRGB) – kühles Stahlgrau, warme Hölzer, dunkles Leder
export const C = {
  steel: 0xaeb4ba,
  steelD: 0x808890,
  iron: 0x5a5e66,
  leather: 0x6e4b2d,
  leatherD: 0x47311f,
  wood: 0x8c643a,
  woodD: 0x654526,
  woodL: 0xb48a52,
  gold: 0xdcb04a,
  brass: 0xb98f3d,
  white: 0xeee9dc,
  black: 0x28251f,
  bone: 0xd8cdb0,
  fire: 0xe8782a,
  fireL: 0xf6c44a,
  straw: 0xd6b650,
  strawD: 0xb48f38,
  rope: 0xb09a68,
  red: 0xa8392d,
  green: 0x4d6a38,
  hide: 0x9b7a52,
  stone: 0x8e897f,
  rock: 0x6e675e,
  apple: 0xb83a2a,
  hop: 0x7a9a3a,
};

/** Zustand des Baukastens setzen: Teil, Sichtbarkeit, Oberkörper-Neigung, Auswahl (setzt vorher alles zurück) */
export function st(b: UnitBuilder, o: { part?: number; px?: number; py?: number; pz?: number; style?: number; show?: number; upper?: number; sel?: number; grad?: [number, number] }): UnitBuilder {
  b.reset();
  if (o.part) b.part(o.part, o.px ?? 0, o.py ?? 0, o.pz ?? 0, o.style ?? 0);
  if (o.show) b.show(o.show);
  if (o.upper) b.upper(o.upper);
  if (o.sel) b.sel(o.sel);
  if (o.grad) b.grad(o.grad[0], o.grad[1]);
  return b;
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// ---------------------------------------------------------------------------------- Nahkampfwaffen
/** Schwert in der Hand h; Klinge zeigt schräg nach vorn oben. `len` = Klingenlänge */
export function sword(b: UnitBuilder, h: V3, o: { len?: number; col?: number; guard?: number; dir?: V3; curved?: boolean; wide?: number } = {}): void {
  const dir = norm(o.dir ?? [0, 0.5, 0.86]);
  const len = o.len ?? 0.34;
  const col = o.col ?? C.steel;
  const w = o.wide ?? 0.016;
  b.limb(add(h, dir, -0.06), add(h, dir, 0.02), 0.011, 0.011, C.leatherD, { capA: true });
  b.box(0.11, 0.022, 0.026, h[0] + dir[0] * 0.03, h[1] + dir[1] * 0.03, h[2] + dir[2] * 0.03, o.guard ?? C.brass, { rotX: -Math.atan2(dir[1], dir[2]) + 0 });
  if (o.curved) {
    const m = add(h, dir, len * 0.55);
    b.limb(add(h, dir, 0.03), [m[0], m[1] + 0.02, m[2]], w, w * 0.9, col, { ry: 0.28, capA: false, capB: false });
    b.limb([m[0], m[1] + 0.02, m[2]], add(h, [dir[0], dir[1] - 0.25, dir[2] + 0.1], len), w * 0.9, 0.003, col, { ry: 0.28, capA: false });
  } else {
    b.limb(add(h, dir, 0.03), add(h, dir, len), w, 0.004, col, { ry: 0.28, capA: false });
  }
}

/** Speer: Schaft von hinter der Hand bis zur Spitze; `len` Gesamtlänge */
export function spear(b: UnitBuilder, h: V3, o: { len?: number; head?: number; dir?: V3; col?: number; far?: boolean; pennant?: boolean } = {}): void {
  const dir = norm(o.dir ?? [0, 0.7, 0.714]);
  const len = o.len ?? 1.1;
  const back = len * 0.29;
  const tip = add(h, dir, len - back);
  const hs = o.head ?? 0.13;
  b.limb(add(h, dir, -back), add(tip, dir, -hs * 0.8), 0.012, 0.011, o.col ?? C.wood, { capA: !o.far, capB: false });
  b.limb(add(tip, dir, -hs), add(tip, dir, 0), 0.026, 0.002, C.steel, { ry: 0.45, capA: false });
  if (!o.far) {
    b.limb(add(tip, dir, -hs * 1.05), add(tip, dir, -hs * 0.75), 0.017, 0.017, C.steelD, { capA: false, capB: false });
  }
}

/** Streitkolben: Stiel mit Eisenkopf (Flügelkopf) */
export function mace(b: UnitBuilder, h: V3, far = false): void {
  const dir = norm([0, 0.62, 0.78]);
  b.limb(add(h, dir, -0.05), add(h, dir, 0.27), 0.014, 0.012, C.woodD, { capA: false });
  const c = add(h, dir, 0.31);
  b.ball(0.05, 0.055, 0.05, c[0], c[1], c[2], C.iron, far ? 0 : 2);
  if (!far) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.spike([c[0] + dx * 0.04, c[1], c[2] + dz * 0.04], [c[0] + dx * 0.085, c[1] + 0.005, c[2] + dz * 0.085], 0.014, C.steelD, { capA: false });
}

export function axe(b: UnitBuilder, h: V3, o: { big?: boolean; far?: boolean } = {}): void {
  const dir = norm([0, 0.6, 0.8]);
  const len = o.big ? 0.42 : 0.34;
  b.limb(add(h, dir, -0.05), add(h, dir, len), 0.014, 0.012, C.woodD, { capA: false });
  const c = add(h, dir, len - 0.04);
  b.box(0.02, 0.1, 0.065, c[0], c[1] - 0.035, c[2] + 0.02, C.steel, { taper: [1, 0.6], rotX: 0.12 });
  b.box(0.026, 0.035, 0.03, c[0], c[1] - 0.02, c[2] - 0.018, C.steelD);
}

export function hammer(b: UnitBuilder, h: V3, o: { big?: boolean; head?: number; col?: number } = {}): void {
  const dir = norm([0, 0.55, 0.83]);
  const len = o.big ? 0.4 : 0.3;
  b.limb(add(h, dir, -0.05), add(h, dir, len), 0.014, 0.012, C.woodD, { capA: false });
  const c = add(h, dir, len);
  const s = o.big ? 1.3 : 1;
  b.box(0.05 * s, 0.045 * s, 0.045 * s, c[0], c[1] - 0.02, c[2], o.col ?? C.iron);
}

export function pick(b: UnitBuilder, h: V3): void {
  const dir = norm([0, 0.5, 0.86]);
  b.limb(add(h, dir, -0.06), add(h, dir, 0.42), 0.014, 0.012, C.woodD, { capA: false });
  const c = add(h, dir, 0.4);
  b.limb([c[0] - 0.09, c[1] - 0.025, c[2] - 0.02], [c[0] + 0.09, c[1] - 0.025, c[2] - 0.02], 0.016, 0.004, C.iron, { capA: false, capB: false });
  b.limb([c[0] - 0.09, c[1] - 0.025, c[2] - 0.02], [c[0] - 0.12, c[1] - 0.06, c[2] - 0.03], 0.012, 0.002, C.iron, { capA: false });
  b.limb([c[0] + 0.09, c[1] - 0.025, c[2] - 0.02], [c[0] + 0.12, c[1] - 0.06, c[2] - 0.03], 0.012, 0.002, C.iron, { capA: false });
}

export function dagger(b: UnitBuilder, h: V3, dir: V3 = [0, 0.4, 0.9], col: number = C.steel): void {
  const d = norm(dir);
  b.limb(add(h, d, -0.03), add(h, d, 0.01), 0.01, 0.01, C.leatherD);
  b.limb(add(h, d, 0.01), add(h, d, 0.21), 0.013, 0.003, col, { ry: 0.3, capA: false });
}

// ---------------------------------------------------------------------------------- Schilde
/** Runder Schild am linken Arm (Scheibe, Achse x), Teamfarbe außen, Eisenbuckel */
export function roundShield(b: UnitBuilder, o: { r?: number; col?: Col; team?: boolean; rim?: number; boss?: number; x?: number; y?: number; z?: number; far?: boolean } = {}): void {
  const r = o.r ?? 0.125;
  const x = o.x ?? -0.2;
  const y = o.y ?? 0.4;
  const z = o.z ?? 0.05;
  const seg = o.far ? 6 : 7;
  b.disc(r * 1.06, 0.026, seg, x - 0.004, y, z, o.rim ?? C.woodD, { capA: false, capB: false });
  b.disc(r, 0.03, seg, x - 0.012, y, z, o.col ?? C.wood, { team: o.team, capA: false });
  if (!o.far) b.disc(r * 0.28, 0.05, 5, x - 0.022, y, z, o.boss ?? C.steel, { capA: false });
}

/** Spitzschild (Tropfenform) – Teamfarbe */
export function kiteShield(b: UnitBuilder, o: { x?: number; y?: number; z?: number; h?: number; w?: number; team?: boolean; col?: Col; rim?: number; cross?: boolean } = {}): void {
  const x = o.x ?? -0.215;
  const y = o.y ?? 0.27;
  const z = o.z ?? 0.05;
  const h = o.h ?? 0.3;
  const w = o.w ?? 0.17;
  b.box(0.028, h, w * 0.36, x, y, z, o.rim ?? C.steelD, { taper: [1, 2.9], rotZ: 0 });
  b.box(0.034, h * 0.9, w * 0.3, x - 0.006, y + 0.012, z, o.col ?? C.white, { team: o.team ?? true, taper: [1, 2.9] });
  if (o.cross) b.box(0.04, 0.03, w * 0.7, x - 0.02, y + h * 0.62, z, C.white);
}

// ---------------------------------------------------------------------------------- Fernwaffen
/** Bogen (senkrecht, in der linken Hand), mit Sehne */
export function bow(b: UnitBuilder, h: V3, o: { len?: number; col?: number; far?: boolean; recurve?: boolean } = {}): void {
  const L = (o.len ?? 0.62) / 2;
  const col = o.col ?? C.woodL;
  const [x, y, z] = h;
  const bend = o.recurve ? 0.07 : 0.045;
  if (o.far) {
    b.limb([x, y - L, z - 0.02], [x, y + L, z - 0.02], 0.012, 0.012, col, { capA: false, capB: false });
    return;
  }
  b.limb([x, y - L, z - 0.01], [x, y - L * 0.45, z + bend], 0.012, 0.015, col, { capA: false, capB: false });
  b.limb([x, y - L * 0.45, z + bend], [x, y + L * 0.45, z + bend], 0.015, 0.015, C.leatherD, { capA: false, capB: false });
  b.limb([x, y + L * 0.45, z + bend], [x, y + L, z - 0.01], 0.015, 0.012, col, { capA: false, capB: false });
  b.limb([x, y - L, z - 0.012], [x, y + L, z - 0.012], 0.004, 0.004, C.bone, { capA: false, capB: false });
}

export function quiver(b: UnitBuilder, o: { x?: number; y?: number; z?: number; team?: boolean; col?: number; far?: boolean } = {}): void {
  const x = o.x ?? 0.06;
  const y = o.y ?? 0.4;
  const z = o.z ?? -0.105;
  b.box(0.06, 0.24, 0.06, x, y, z, o.col ?? C.leatherD, { rotX: -0.35, rotZ: -0.2 });
  b.box(0.065, 0.045, 0.065, x - 0.01, y + 0.155, z - 0.055, C.white, { team: o.team ?? true, rotX: -0.35, rotZ: -0.2 });
  if (!o.far) {
    b.limb([x - 0.05, y + 0.2, z - 0.06], [x - 0.07, y + 0.29, z - 0.105], 0.009, 0.009, C.bone, { capA: false, capB: false });
  }
}

/** Armbrust: Schaft, Bogenarme (quer), Bügel; Pose: schräg nach vorn */
export function crossbow(b: UnitBuilder, h: V3, o: { far?: boolean } = {}): void {
  const dir = norm([0, 0.62, 0.78]);
  const c = add(h, dir, 0.16);
  b.limb(add(h, dir, -0.1), add(h, dir, 0.36), 0.016, 0.014, C.wood, { capA: false });
  const f = add(h, dir, 0.3);
  b.limb([f[0] - 0.15, f[1] - 0.04, f[2] + 0.0], [f[0], f[1], f[2]], 0.012, 0.014, C.woodD, { capA: false, capB: false });
  b.limb([f[0] + 0.15, f[1] - 0.04, f[2] + 0.0], [f[0], f[1], f[2]], 0.012, 0.014, C.woodD, { capA: false, capB: false });
  if (!o.far) {
    b.limb([f[0] - 0.15, f[1] - 0.04, f[2] - 0.01], [f[0] + 0.15, f[1] - 0.04, f[2] - 0.01], 0.004, 0.004, C.bone, { capA: false, capB: false });
    b.box(0.02, 0.05, 0.016, c[0], c[1] - 0.04, c[2] - 0.02, C.steelD);
  }
}

// ---------------------------------------------------------------------------------- Kopfbedeckungen
const HY = HEAD_Y;

/** Strohhut mit breiter Krempe */
export function strawHat(b: UnitBuilder, o: { y?: number; band?: Col | number; far?: boolean; col?: Col } = {}): void {
  const y = o.y ?? HY + 0.045;
  const col = o.col ?? C.straw;
  b.cyl(0.19 * 0.35, 0.185, 0.045, 7, 0, y, 0.0, col, { capA: false, capB: false });
  b.cyl(0.062, 0.078, 0.05, 6, 0, y + 0.03, 0, col, { capA: false });
  if (!o.far) b.cyl(0.081, 0.082, 0.014, 6, 0, y + 0.032, 0, o.band ?? C.leather, { capA: false, capB: false });
}

/** Weiche Filzmütze/Haube */
export function softCap(b: UnitBuilder, col: Col | number, o: { y?: number; feather?: boolean; tall?: number; band?: number | Col } = {}): void {
  const y = o.y ?? HY + 0.025;
  b.ball(0.076, 0.058 * (o.tall ?? 1), 0.08, 0, y + 0.02, -0.003, col, 1);
  b.cyl(0.082, 0.082, 0.02, 6, 0, y - 0.012, 0, o.band ?? col, { capA: false, capB: false });
  if (o.feather) b.limb([0.045, y + 0.03, -0.02], [0.07, y + 0.12, -0.07], 0.01, 0.002, C.white, { ry: 0.5, capA: false });
}

/** Eisenhut/Kesselhaube mit Krempe */
export function kettleHat(b: UnitBuilder, o: { y?: number; col?: number; far?: boolean } = {}): void {
  const y = o.y ?? HY + 0.03;
  const col = o.col ?? C.steelD;
  b.cyl(0.03, 0.145, 0.04, 7, 0, y, 0, col, { capA: false, capB: false });
  b.ball(0.078, 0.06, 0.08, 0, y + 0.035, 0, col, o.far ? 1 : 2);
}

/** Helm mit Nasenschutz */
export function nasalHelm(b: UnitBuilder, o: { y?: number; col?: number; plume?: boolean; far?: boolean; coif?: Col | number | null } = {}): void {
  const y = o.y ?? HY + 0.03;
  const col = o.col ?? C.steel;
  b.ball(0.078, 0.066, 0.083, 0, y + 0.012, 0, col, o.far ? 1 : 3);
  b.cyl(0.082, 0.082, 0.022, 6, 0, y - 0.03, 0, col, { capA: false, capB: false });
  if (!o.far) b.box(0.018, 0.075, 0.016, 0, y - 0.05, 0.078, col);
  if (o.coif !== null && !o.far) b.box(0.15, 0.06, 0.12, 0, HY - 0.085, -0.012, o.coif ?? C.steelD);
  if (o.plume) b.limb([0, y + 0.055, -0.02], [0, y + 0.13, -0.09], 0.016, 0.004, { c: 3, k: 1 } as Col, { ry: 0.4, capA: false });
}

/** Topfhelm (Ritter) mit Sehschlitz */
export function greatHelm(b: UnitBuilder, o: { y?: number; plumeTeam?: boolean; far?: boolean; col?: number } = {}): void {
  const y = o.y ?? HY - 0.065;
  const col = o.col ?? C.steel;
  b.cyl(0.081, 0.088, 0.13, o.far ? 5 : 6, 0, y, 0, col, { capA: false });
  b.cyl(0.04, 0.083, 0.035, o.far ? 5 : 6, 0, y + 0.128, 0, C.steelD, { capA: false, capB: false });
  if (!o.far) b.box(0.1, 0.014, 0.012, 0, y + 0.075, 0.086, C.black);
  if (o.plumeTeam) b.limb([0, y + 0.16, -0.01], [0, y + 0.23, -0.1], 0.028, 0.006, C.white, { team: true, ry: 0.5, capA: false });
}

/** Turban (Tuch um den Kopf), optional Spitze */
export function turban(b: UnitBuilder, col: Col | number, o: { team?: boolean; spike?: boolean; y?: number; tall?: number; far?: boolean; tail?: boolean } = {}): void {
  const y = o.y ?? HY + 0.025;
  b.ball(0.084, 0.058 * (o.tall ?? 1), 0.088, 0, y + 0.018, -0.003, col, o.far ? 1 : 3, { team: o.team });
  if (!o.far) b.cyl(0.085, 0.087, 0.03, 6, 0, y - 0.024, 0, col, { team: o.team, capA: false, capB: false });
  if (o.spike) b.spike([0, y + 0.06, 0], [0, y + 0.16, 0], 0.016, C.steel, { capA: false });
  if (o.tail) b.quad([0.03, y - 0.02, -0.08], [0.09, y - 0.02, -0.05], [0.1, y - 0.14, -0.1], [0.04, y - 0.14, -0.12], col, true, { team: o.team });
}

/** Kapuze/Tuchhaube (Jäger, Mönch) mit Spitze nach hinten */
export function hood(b: UnitBuilder, col: Col | number, o: { y?: number; point?: boolean } = {}): void {
  const y = o.y ?? HY + 0.02;
  b.ball(0.083, 0.07, 0.088, 0, y, -0.004, col, 2);
  b.box(0.15, 0.1, 0.05, 0, HY - 0.095, -0.04, col, { taper: [1.35, 0.9] });
  if (o.point) b.limb([0, y + 0.03, -0.05], [0, y + 0.07, -0.14], 0.03, 0.004, col, { capA: false });
}

/** Haare/Bart der Varianten (nur nahes Modell) */
export function hairVariants(b: UnitBuilder, o: { styles: number; beard: boolean; hatCover?: boolean }): void {
  if (o.styles > 0) {
    st(b, { part: 14, px: 0, py: HEAD_Y - 0.075, pz: 0, show: VIS.Near | VIS.Hair0, upper: HIP });
    b.ball(0.074, 0.046, 0.078, 0, HY + 0.036, -0.008, hairC(), 1);
    b.box(0.15, 0.06, 0.03, 0, HY - 0.035, -0.07, hairC());
    st(b, { part: 14, px: 0, py: HEAD_Y - 0.075, pz: 0, show: VIS.Near | VIS.Hair1, upper: HIP });
    b.ball(0.077, 0.05, 0.082, 0, HY + 0.03, -0.004, hairC(0.95), 1);
    b.box(0.165, 0.13, 0.04, 0, HY - 0.105, -0.07, hairC(0.9), { taper: [0.8, 1] });
    b.box(0.03, 0.06, 0.05, -0.07, HY - 0.05, 0.01, hairC(0.9));
    b.box(0.03, 0.06, 0.05, 0.07, HY - 0.05, 0.01, hairC(0.9));
    if (o.styles > 2) {
      st(b, { part: 14, px: 0, py: HEAD_Y - 0.075, pz: 0, show: VIS.Near | VIS.Hair2, upper: HIP });
      b.box(0.04, 0.08, 0.14, -0.07, HY - 0.025, -0.005, hairC(0.95));
      b.box(0.04, 0.08, 0.14, 0.07, HY - 0.025, -0.005, hairC(0.95));
      b.box(0.14, 0.04, 0.04, 0, HY - 0.015, -0.07, hairC());
    }
  }
  if (o.beard) {
    st(b, { part: 14, px: 0, py: HEAD_Y - 0.075, pz: 0, show: VIS.Near | VIS.Beard, upper: HIP });
    b.box(0.1, 0.075, 0.05, 0, HY - 0.08, 0.05, hairC(0.92), { taper: [0.6, 0.7] });
    b.box(0.07, 0.016, 0.03, 0, HY - 0.035, 0.074, hairC());
  }
}

export { clothA, clothB, hairC, skinC };
