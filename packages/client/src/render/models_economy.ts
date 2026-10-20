import type { ModelBuilder } from './builder';
import { BP, SURF } from './building_palette';
import {
  anvil,
  banner,
  barrel,
  bed,
  chimney,
  crate,
  doorOn,
  fence,
  flag,
  gableRoof,
  haystack,
  hipRoof,
  ladder,
  logPile,
  logX,
  masonry,
  pennant,
  plankPile,
  plinth,
  sack,
  shedRoof,
  slab,
  stonePile,
  windowOn,
} from './building_parts';
import { house } from './building_house';
import { PART } from './materials';

const hash1 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return s - Math.floor(s);
};

/** kleiner Handkarren (Räder, Ladefläche, Deichsel) */
function cart(b: ModelBuilder, x: number, z: number, rot = 0, load: 'stone' | 'wood' | 'sacks' | 'none' = 'none'): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
  b.det(1).surf(SURF.Plank);
  let [px, pz] = P(0, 0);
  b.box(0.42, 0.07, 0.62, px, 0.2, pz, BP.wood, false, rot);
  for (const sx of [-1, 1]) {
    [px, pz] = P(sx * 0.21, 0);
    b.box(0.04, 0.14, 0.62, px, 0.27, pz, BP.woodDark, false, rot);
  }
  b.surf(0);
  for (const sx of [-1, 1]) {
    [px, pz] = P(sx * 0.27, 0.02);
    b.disc(0.15, 0.05, 8, px, 0.16, pz, BP.woodDark);
  }
  const [d1x, d1z] = P(0, 0.3);
  const [d2x, d2z] = P(0, 0.85);
  b.beam(d1x, 0.22, d1z, d2x, 0.12, d2z, 0.04, BP.woodDark);
  if (load === 'stone') stonePile(b, P(0, -0.05)[0], P(0, -0.05)[1], 0.27, 4);
  else if (load === 'wood') for (let i = 0; i < 3; i++) logX(b, P(0, -0.15 + i * 0.15)[0], 0.27, P(0, -0.15 + i * 0.15)[1], 0.4, 0.06);
  else if (load === 'sacks') {
    sack(b, P(-0.1, -0.1)[0], P(-0.1, -0.1)[1], 0.27);
    sack(b, P(0.1, 0.1)[0], P(0.1, 0.1)[1], 0.27);
  }
  b.det(0);
}

/** Gestell mit Fell/Tuch (Trockenrahmen) */
function dryingRack(b: ModelBuilder, x: number, z: number, w: number, rot = 0, color: number = BP.clay): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  b.det(1).surf(0);
  for (const sx of [-1, 1]) b.box(0.05, 1.15, 0.05, x + sx * (w / 2) * c, 0, z - sx * (w / 2) * s, BP.woodDark);
  b.box(w + 0.06, 0.05, 0.05, x, 1.13, z, BP.wood, false, rot);
  for (let i = 0; i < 2; i++) {
    const u = (i - 0.5) * (w * 0.5);
    b.box(w * 0.38, 0.7, 0.025, x + u * c, 0.45, z - u * s, i ? color : BP.shingle, false, rot);
  }
  b.det(0);
}

// -------------------------------------------------------------------------------------------- Lager

export function stockpile(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.1, 0.06, H - 0.1, 0, 0, 0, BP.soil).surf(0);
  // Zaun hinten und links
  fence(b, -W / 2 + 0.1, -H / 2 + 0.1, W / 2 - 0.1, -H / 2 + 0.1, 0.34);
  fence(b, -W / 2 + 0.1, -H / 2 + 0.1, -W / 2 + 0.1, H / 2 - 0.9, 0.34);
  // Schuppen mit Pultdach hinten rechts
  for (const [x, z] of [[0.15, -1.35], [1.35, -1.35], [0.15, -0.3], [1.35, -0.3]]) b.det(0).box(0.1, 1.05, 0.1, x, 0.06, z, BP.woodDark);
  shedRoof(b, { w: 1.2, d: 1.1, x: 0.75, z: -0.82, y: 1.11, rise: 0.22, color: BP.shingle, surf: SURF.Shingle, over: 0.12, low: 0.08 });
  crate(b, 0.5, -1.1, 0.34, 0.06);
  crate(b, 1.0, -1.1, 0.3, 0.06, BP.woodDark);
  crate(b, 0.62, -1.1, 0.26, 0.4, BP.woodLight);
  barrel(b, 1.2, -0.7, 0.06);
  barrel(b, 0.95, -0.55, 0.06, BP.woodDark);
  sack(b, 0.3, -0.6, 0.06);
  // Stammstapel, Brettstapel, Steine, Eisenbarren
  logPile(b, -0.7, -0.9, 1.0, 3, 0.06);
  plankPile(b, -0.75, 0.0, 1.0, 0.5, 5, 0.06);
  stonePile(b, -0.7, 0.9, 0.06, 6);
  masonry(b, 0.34, 0.24, 0.26, 0.2, 0.06, 0.8, BP.stoneLight);
  masonry(b, 0.34, 0.24, 0.26, 0.58, 0.06, 0.78, BP.stone);
  b.det(1).surf(0);
  for (let i = 0; i < 3; i++) b.box(0.3, 0.07, 0.12, 1.0, 0.06 + i * 0.07, 0.8 - (i % 2) * 0.02, BP.iron);
  barrel(b, 1.2, 0.3, 0.06, BP.pitch);
  b.det(0);
  cart(b, 0.7, 1.15, 0.2, 'sacks');
  flag(b, W / 2 - 0.15, 0, H / 2 - 0.15, 1.1);
}

export function granary(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  // Steinpilze, Holzspeicher, Strohdach mit Lüftungsaufsatz
  for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85], [0, -0.85], [0, 0.85]]) {
    b.det(0).surf(SURF.Stone).cyl(0.16, 0.2, 0.28, 7, x, 0, z, BP.stoneMid).surf(0);
  }
  b.det(0).surf(SURF.Plank).box(2.0, 0.84, 2.0, 0, 0.28, 0, BP.wood).surf(0);
  b.det(1).box(2.06, 0.1, 2.06, 0, 0.28, 0, BP.woodDark);
  b.box(2.06, 0.08, 2.06, 0, 1.04, 0, BP.woodDark);
  for (const f of [0, 1, 2, 3]) {
    for (let i = -2; i <= 2; i++) {
      const [x, z] = [f & 1 ? (f === 1 ? 1.0 : -1.0) : i * 0.4, f & 1 ? i * 0.4 : f === 0 ? 1.0 : -1.0];
      b.box(f & 1 ? 0.06 : 0.07, 0.3, f & 1 ? 0.07 : 0.06, x, 0.58, z, BP.coal);
    }
  }
  b.det(0);
  hipRoof(b, { w: 2.0, d: 2.0, x: 0, z: 0, y: 1.12, rise: 0.95, color: BP.thatch, surf: SURF.Thatch, over: 0.3 });
  // Lüftungsaufsatz
  b.det(1).surf(0);
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) b.box(0.05, 0.28, 0.05, x, 1.95, z, BP.woodDark);
  hipRoof(b, { w: 0.36, d: 0.36, x: 0, z: 0, y: 2.23, rise: 0.22, color: BP.thatchDark, surf: SURF.Thatch, over: 0.08 });
  flag(b, 0, 2.45, 0, 0.5, 0.3, 0.16);
  // Tür mit Rampe, Säcke, Garben
  doorOn(b, 0, 0, 0.28, 1.0, 0.5, 0.78, { frame: BP.woodDark });
  b.surf(SURF.Plank).poly([[-1.58, 0], [-1.04, 0.3], [-1.04, 0]], 0.5, 0, 0.0, 0, BP.wood, false, Math.PI / 2).surf(0);
  b.det(1).surf(SURF.Plank).box(0.5, 0.05, 0.6, 0, 0.0, 1.3, BP.wood, false).surf(0);
  sack(b, 0.75, 1.15);
  sack(b, 0.95, 1.0);
  sack(b, 0.85, 1.35);
  haystack(b, -0.95, 1.25, 0.22);
  b.det(0);
}

export function armory(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  house(b, { w: 2.5, d: 2.3, h: 1.15, x: 0, z: -0.15, wall: BP.stone, wallSurf: SURF.Stone, plinth: 0.2, roof: { kind: 'hip', rise: 0.8, color: BP.slate, surf: SURF.Shingle, over: 0.18 }, door: { w: 0.7, h: 0.9, arch: true, step: true, leaf: BP.woodDark }, windows: 1, chimney: false });
  // Teamfarbene Schilde an der Fassade, Wappenbanner
  for (const u of [-0.95, -0.55, 0.55, 0.95]) {
    b.det(1).surf(0).discZ(0.15, 0.04, 8, u, 0.95, 1.03, BP.white, true);
    b.discZ(0.07, 0.05, 8, u, 0.95, 1.05, BP.ironLight);
  }
  // Fassadenfahne am Dachfirst
  flag(b, 0, 1.35 + 0.8, -0.15, 0.7, 0.45, 0.22);
  // Waffenständer: Speere und Schwerter im Hof
  b.det(1).box(0.9, 0.05, 0.1, -0.85, 0, 1.28, BP.woodDark);
  for (let i = 0; i < 5; i++) b.beam(-1.2 + i * 0.16, 0.05, 1.28, -1.16 + i * 0.16, i % 2 ? 1.0 : 0.85, 1.28, 0.035, i % 2 ? BP.wood : BP.ironLight);
  crate(b, 0.9, 1.3, 0.3, 0);
  crate(b, 1.2, 1.2, 0.26, 0, BP.woodDark);
  b.box(0.5, 0.05, 0.12, 0.95, 0.3, 1.3, BP.woodDark);
  b.det(0);
}

// ------------------------------------------------------------------------------------ Rohstoffe

export function woodcutter(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  house(b, { w: 1.15, d: 1.0, h: 0.62, x: -0.28, z: -0.38, plinth: 0.08, wall: BP.wood, wallSurf: SURF.Log, roof: { rise: 0.55, color: BP.thatch, surf: SURF.Thatch, over: 0.14, teamRidge: true }, door: { w: 0.3, h: 0.46, face: 0, u: -0.2 }, windows: 1, chimney: false });
  logPile(b, 0.62, -0.1, 0.9, 4, 0, 0.075);
  // Hackklotz mit Axt
  b.det(0).surf(SURF.Log).cyl(0.17, 0.2, 0.3, 7, -0.55, 0, 0.62, BP.woodLight).surf(0);
  b.part(PART.ArmR, -0.55, 0.64, 0.45);
  b.box(0.04, 0.04, 0.38, -0.55, 0.6, 0.62, BP.woodDark);
  b.box(0.04, 0.16, 0.1, -0.55, 0.52, 0.84, BP.ironLight);
  b.part(0);
  // Sägebock mit Stamm, Spalthaufen
  b.det(1).beam(-0.05, 0.0, 0.55, 0.05, 0.4, 0.62, 0.06, BP.woodDark);
  b.beam(0.3, 0.0, 0.55, 0.2, 0.4, 0.62, 0.06, BP.woodDark);
  b.beam(-0.05, 0.0, 0.7, 0.05, 0.4, 0.62, 0.06, BP.woodDark);
  b.beam(0.3, 0.0, 0.7, 0.2, 0.4, 0.62, 0.06, BP.woodDark);
  logX(b, 0.13, 0.4, 0.62, 0.55, 0.07, BP.wood);
  for (let i = 0; i < 4; i++) b.box(0.1, 0.07, 0.1, -0.1 + i * 0.13, 0, 0.82 + (i % 2) * 0.05, i % 2 ? BP.woodLight : BP.wood, false, i);
  b.det(0);
}

export function quarry(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.2, 0.06, H - 0.2, 0, 0, 0, BP.rockDark).surf(0);
  // abgestufte Bruchwand
  masonry(b, 1.7, 0.34, 1.5, -0.55, 0.06, -0.55, BP.stoneDark);
  masonry(b, 1.25, 0.3, 1.1, -0.45, 0.4, -0.5, BP.stoneMid);
  masonry(b, 0.8, 0.28, 0.75, -0.4, 0.7, -0.45, BP.stone);
  b.det(1).surf(0);
  for (let i = 0; i < 5; i++) b.box(0.07, 0.04, 0.6, -1.15 + i * 0.3, 0.06, -0.05, BP.coal);
  // gebrochene Blöcke und Steinhaufen
  masonry(b, 0.44, 0.3, 0.32, 0.55, 0.06, 0.3, BP.stoneLight, 0.3);
  masonry(b, 0.4, 0.28, 0.4, 0.2, 0.06, 0.65, BP.stone, -0.2);
  masonry(b, 0.34, 0.26, 0.34, 0.5, 0.36, 0.34, BP.stoneMid, 0.5);
  stonePile(b, -1.0, 0.8, 0.06, 6);
  // Holzkran
  const cx = 0.95;
  const cz = -0.85;
  b.det(0).box(0.14, 1.45, 0.14, cx, 0.06, cz, BP.woodDark);
  b.beam(cx, 1.45, cz, cx - 0.9, 1.5, cz + 0.2, 0.1, BP.wood);
  b.beam(cx, 0.5, cz + 0.28, cx, 1.3, cz, 0.07, BP.woodDark);
  b.beam(cx, 0.5, cz - 0.28, cx, 1.3, cz, 0.07, BP.woodDark);
  b.det(1).beam(cx - 0.85, 1.48, cz + 0.2, cx - 0.85, 0.7, cz + 0.2, 0.025, BP.cloth);
  masonry(b, 0.28, 0.22, 0.28, cx - 0.85, 0.5, cz + 0.2, BP.stoneLight);
  // Meißelarm
  b.part(PART.ArmR, 0.1, 0.8, 0.3);
  b.box(0.04, 0.04, 0.4, 0.1, 0.78, 0.5, BP.woodDark);
  b.box(0.26, 0.05, 0.05, 0.1, 0.76, 0.72, BP.ironLight);
  b.part(0);
  // Ochsenkarren mit Steinen und Werkzeugschuppen
  cart(b, 1.0, 0.75, -0.3, 'stone');
  b.det(1).box(0.5, 0.05, 0.26, -1.1, 0.5, -1.2, BP.woodDark);
  for (const sx of [-1, 1]) b.box(0.05, 0.5, 0.05, -1.1 + sx * 0.22, 0.06, -1.2, BP.woodDark);
  for (let i = 0; i < 3; i++) b.beam(-1.28 + i * 0.18, 0.2, -1.2, -1.2 + i * 0.18, 0.7, -1.22, 0.03, i % 2 ? BP.ironLight : BP.wood);
  flag(b, -W / 2 + 0.2, 0.06, H / 2 - 0.2, 1.0);
  b.det(0);
}

export function oxTether(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.2, 0.06, H - 0.2, 0, 0, 0, BP.soil).surf(0);
  // Pfosten mit Ring und Seil zum Joch
  b.det(0).cyl(0.06, 0.08, 0.9, 6, 0, 0.06, 0.0, BP.woodDark);
  b.sphere(0.07, 0, 0.98, 0, BP.iron);
  b.det(1).beam(0, 0.5, 0, 0.55, 0.12, 0.35, 0.025, BP.cloth);
  b.box(0.9, 0.07, 0.08, 0.2, 0.2, 0.55, BP.woodDark, false, 0.4);
  // Trog und Heu
  b.box(0.7, 0.14, 0.26, 0.0, 0.06, -0.55, BP.woodDark);
  b.box(0.62, 0.05, 0.2, 0.0, 0.18, -0.55, BP.hay);
  haystack(b, -0.65, 0.55, 0.3, 0.06);
  // Unterstand mit Pultdach
  for (const [x, z] of [[0.55, -0.6], [0.95, -0.6], [0.55, -0.1], [0.95, -0.1]]) b.det(0).box(0.07, 0.62, 0.07, x, 0.06, z, BP.woodDark);
  shedRoof(b, { w: 0.55, d: 0.7, x: 0.75, z: -0.35, y: 0.66, rise: 0.2, color: BP.thatch, surf: SURF.Thatch, over: 0.1, low: 0.1 });
  barrel(b, 0.7, -0.4, 0.06, BP.woodDark);
  b.det(0);
}

export function ironMine(b: ModelBuilder, W: number, H: number): void {
  void W;
  // Felshügel aus Brocken
  const rocks: [number, number, number, number, number, number, number][] = [
    [1.05, 0.85, 0.95, 0, 0.45, -0.55, 3],
    [0.75, 0.65, 0.75, -0.85, 0.3, -0.35, 5],
    [0.75, 0.6, 0.8, 0.85, 0.3, -0.4, 7],
    [0.65, 0.55, 0.6, 0.05, 1.0, -0.62, 9],
    [0.55, 0.45, 0.55, -1.0, 0.2, 0.2, 11],
    [0.5, 0.4, 0.5, 1.05, 0.2, 0.15, 13],
  ];
  b.det(0).surf(0);
  for (const [rx, ry, rz, x, y, z, seed] of rocks) b.boulder(rx, ry, rz, x, y, z, seed, seed % 2 ? BP.rockDark : BP.rock);
  // Erzadern
  for (const [x, y, z] of [[-0.3, 0.75, -0.05], [0.4, 0.55, 0.0], [0.0, 1.2, -0.3], [-0.9, 0.4, 0.0]] as [number, number, number][]) b.det(1).box(0.14, 0.1, 0.08, x, y, z, BP.terracottaDark, false, x);
  // Stollenportal aus Holz
  const zf = H / 2 - 0.95;
  b.det(0).box(0.78, 0.82, 0.3, 0, 0, zf - 0.05, BP.black);
  for (const sx of [-1, 1]) b.box(0.13, 0.95, 0.14, sx * 0.46, 0, zf + 0.1, BP.woodDark);
  b.box(1.2, 0.13, 0.16, 0, 0.9, zf + 0.1, BP.wood);
  b.det(1).beam(-0.46, 0.7, zf + 0.1, -0.26, 0.92, zf + 0.1, 0.07, BP.woodDark);
  b.beam(0.46, 0.7, zf + 0.1, 0.26, 0.92, zf + 0.1, 0.07, BP.woodDark);
  // Schienen mit Schwellen, Erzwagen, Laterne
  for (const sx of [-1, 1]) b.box(0.04, 0.04, 1.2, sx * 0.17, 0.0, zf + 0.7, BP.iron);
  for (let i = 0; i < 6; i++) b.box(0.5, 0.03, 0.07, 0, 0.0, zf + 0.2 + i * 0.2, BP.woodDark);
  b.surf(SURF.Plank).box(0.4, 0.22, 0.5, 0, 0.06, zf + 0.9, BP.woodDark).surf(0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.disc(0.06, 0.04, 6, sx * 0.2, 0.07, zf + 0.9 + sz * 0.17, BP.ironLight);
  for (let i = 0; i < 4; i++) b.boulder(0.08, 0.07, 0.08, -0.1 + (i % 2) * 0.17, 0.3, zf + 0.78 + (i > 1 ? 0.2 : 0), 3 + i, BP.terracottaDark);
  b.box(0.04, 0.5, 0.04, 0.55, 0, zf + 0.35, BP.woodDark);
  b.box(0.08, 0.1, 0.08, 0.55, 0.5, zf + 0.35, BP.gold);
  // Abraum und Erzarm
  stonePile(b, 1.2, 0.95, 0, 5);
  b.part(PART.ArmR, -0.65, 0.7, zf + 0.35);
  b.box(0.04, 0.04, 0.4, -0.65, 0.68, zf + 0.55, BP.woodDark);
  b.box(0.3, 0.05, 0.05, -0.65, 0.66, zf + 0.78, BP.ironLight);
  b.part(0).det(0);
}

export function pitchRig(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  b.det(0).surf(SURF.Ground).cyl(0.75, 0.82, 0.08, 9, 0, 0, 0, BP.soilDark).surf(0);
  b.cyl(0.55, 0.6, 0.07, 9, 0, 0.08, 0, BP.pitch);
  // Bohrturm: drei Beine, Querstreben, Kopf mit Rolle
  for (const [x, z] of [[-0.42, -0.3], [0.42, -0.3], [0, 0.46]]) b.det(0).beam(x, 0.06, z, 0, 1.4, 0, 0.07, BP.woodDark);
  for (const y of [0.45, 0.85]) {
    const k = 1 - y / 1.4;
    b.det(1).beam(-0.42 * k, y, -0.3 * k, 0.42 * k, y, -0.3 * k, 0.04, BP.wood);
    b.beam(0.42 * k, y, -0.3 * k, 0, y, 0.46 * k, 0.04, BP.wood);
    b.beam(0, y, 0.46 * k, -0.42 * k, y, -0.3 * k, 0.04, BP.wood);
  }
  b.det(0).box(0.2, 0.18, 0.2, 0, 1.38, 0, BP.coal);
  b.det(1).discZ(0.1, 0.05, 8, 0, 1.52, 0.0, BP.iron);
  // Schwengel-Pumpe
  b.box(0.12, 0.5, 0.12, 0.62, 0.06, 0.55, BP.woodDark);
  b.beam(0.62, 0.55, 0.55, 0.1, 0.78, 0.2, 0.07, BP.wood);
  b.box(0.2, 0.16, 0.2, 0.7, 0.45, 0.55, BP.iron);
  b.cyl(0.05, 0.05, 0.4, 5, 0.0, 0.06, 0.2, BP.iron);
  // Fässer
  barrel(b, -0.7, 0.55, 0.0, BP.pitch);
  barrel(b, -0.45, 0.68, 0.0, BP.pitch);
  barrel(b, -0.6, 0.62, 0.32, BP.pitch);
  b.det(0);
}

// ------------------------------------------------------------------------------------------ Farmen

function tree(b: ModelBuilder, x: number, z: number, k: number, fruit: number | null): void {
  b.det(0).surf(0).cyl(0.05, 0.075, 0.38, 5, x, 0.04, z, BP.woodDark);
  b.sphere(0.3 + hash1(k) * 0.05, x, 0.6, z, k % 2 ? BP.leaf : BP.grassDark);
  b.sphere(0.2, x + 0.14, 0.76, z - 0.06, BP.leaf);
  if (fruit !== null) {
    b.det(2);
    for (let i = 0; i < 4; i++) b.box(0.07, 0.07, 0.07, x + Math.cos(i * 1.6 + k) * 0.28, 0.5 + (i % 2) * 0.16, z + Math.sin(i * 1.6 + k) * 0.28, fruit);
  }
  b.det(0);
}

export function appleOrchard(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.2, 0.05, H - 0.2, 0, 0, 0, BP.grassDark).surf(0);
  const x0 = -W / 2 + 0.55;
  const z0 = -H / 2 + 0.55;
  let k = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2) continue;
      tree(b, x0 + i * 0.95 + (j % 2) * 0.1, z0 + j * 1.05, k++, BP.apple);
    }
  // Zaun mit Eingang vorn
  fence(b, -W / 2 + 0.12, -H / 2 + 0.12, W / 2 - 0.12, -H / 2 + 0.12, 0.3);
  fence(b, -W / 2 + 0.12, -H / 2 + 0.12, -W / 2 + 0.12, H / 2 - 0.12, 0.3);
  fence(b, W / 2 - 0.12, -H / 2 + 0.12, W / 2 - 0.12, H / 2 - 0.12, 0.3);
  fence(b, -W / 2 + 0.12, H / 2 - 0.12, -0.45, H / 2 - 0.12, 0.3);
  fence(b, 0.45, H / 2 - 0.12, W / 2 - 0.12, H / 2 - 0.12, 0.3);
  // Obstkisten und Leiter
  crate(b, 0.8, H / 2 - 0.55, 0.3, 0.05);
  for (let i = 0; i < 3; i++) b.det(2).box(0.07, 0.07, 0.07, 0.72 + i * 0.07, 0.36, H / 2 - 0.58, BP.apple);
  crate(b, 1.15, H / 2 - 0.5, 0.26, 0.05, BP.woodDark);
  ladder(b, -0.4, 0.5, 1.0, 0.3, 0.05);
  flag(b, W / 2 - 0.2, 0, H / 2 - 0.2, 0.9, 0.36, 0.2);
}

export function dairyFarm(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.2, 0.05, H - 0.2, 0, 0, 0, BP.grass).surf(0);
  // Stall-Scheune
  house(b, { w: 2.0, d: 1.5, h: 0.85, x: -0.85, z: -1.0, plinth: 0.12, wall: BP.terracotta, wallSurf: SURF.Plank, roof: { rise: 0.8, color: BP.thatch, surf: SURF.Thatch, over: 0.2, teamRidge: true }, door: { w: 0.62, h: 0.7, u: 0.35, step: false }, windows: 1, timber: false, chimney: false });
  b.det(1).box(0.32, 0.26, 0.05, -0.55, 1.1, -0.2, BP.black);
  b.beam(-0.55, 1.5, -0.22, -0.55, 1.5, 0.1, 0.07, BP.woodDark);
  haystack(b, -1.45, -1.95 + 0.4, 0.3);
  // Weide mit Zaun und Kühen
  fence(b, -W / 2 + 0.12, 0.05, -W / 2 + 0.12, H / 2 - 0.12, 0.3);
  fence(b, -W / 2 + 0.12, H / 2 - 0.12, W / 2 - 0.12, H / 2 - 0.12, 0.3);
  fence(b, W / 2 - 0.12, -H / 2 + 0.12, W / 2 - 0.12, H / 2 - 0.12, 0.3);
  fence(b, 0.3, 0.05, W / 2 - 0.12, 0.05, 0.3);
  for (const [x, z, rot, spot] of [[1.0, 0.9, 0.3, true], [0.2, 1.35, -0.4, false], [1.35, -0.45, 1.2, true]] as [number, number, number, boolean][]) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const col = spot ? BP.white : BP.clay;
    b.det(1).surf(0).box(0.28, 0.24, 0.52, x, 0.18, z, col, false, rot);
    b.box(0.16, 0.16, 0.18, x + s * 0.34, 0.3, z + c * 0.34, col, false, rot);
    b.box(0.1, 0.07, 0.08, x + s * 0.43, 0.27, z + c * 0.43, BP.plasterWarm, false, rot);
    for (const [lx, lz] of [[-0.1, -0.18], [0.1, -0.18], [-0.1, 0.18], [0.1, 0.18]]) b.box(0.05, 0.2, 0.05, x + lx * c + lz * s, 0, z - lx * s + lz * c, BP.woodDark, false, rot);
    if (spot) b.box(0.14, 0.05, 0.2, x - s * 0.04, 0.4, z - c * 0.04, BP.woodDark, false, rot);
  }
  // Milchkannen und Trog
  for (const x of [-0.2, 0.0, 0.2]) {
    b.det(1).cyl(0.07, 0.09, 0.3, 6, x, 0.05, -0.25, BP.ironLight);
    b.cyl(0.05, 0.05, 0.04, 6, x, 0.35, -0.25, BP.iron);
  }
  b.box(0.7, 0.14, 0.24, 0.9, 0.0, 0.2, BP.woodDark);
  b.det(0);
}

export function hunterPost(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  // Blockhütte auf Stelzen mit Plattform
  for (const [x, z] of [[-0.5, -0.55], [0.4, -0.55], [-0.5, 0.2], [0.4, 0.2]]) b.det(0).cyl(0.06, 0.07, 0.32, 5, x, 0, z, BP.woodDark);
  b.det(0).surf(SURF.Plank).box(1.15, 0.07, 0.95, -0.05, 0.3, -0.18, BP.wood).surf(0);
  house(b, { w: 0.95, d: 0.75, h: 0.6, x: -0.05, z: -0.3, y: 0, plinth: 0, wall: BP.wood, wallSurf: SURF.Log, roof: { rise: 0.5, color: BP.shingle, surf: SURF.Shingle, over: 0.14, teamRidge: true }, door: { w: 0.26, h: 0.44, u: 0.2 }, windows: 1, chimney: false });
  void 0;
  b.det(1).surf(0);
  // Treppe, Geländer (Platz davor)
  for (let i = 0; i < 3; i++) b.box(0.3, 0.1, 0.12, 0.45, 0.06 + i * 0.1, 0.5 - i * 0.12, BP.woodDark);
  // Geweih über der Tür, Trockenrahmen, Bogenständer
  b.beam(-0.1, 0.78, 0.1, -0.2, 0.95, 0.1, 0.03, BP.woodLight);
  b.beam(-0.1, 0.78, 0.1, 0.0, 0.95, 0.1, 0.03, BP.woodLight);
  dryingRack(b, -0.65, 0.7, 0.7, 0.2, BP.shingle);
  b.box(0.05, 0.6, 0.05, 0.6, 0, 0.75, BP.woodDark);
  b.beam(0.6, 0.6, 0.75, 0.75, 0.2, 0.75, 0.03, BP.wood);
  b.det(0);
}

export function wheatFarm(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.2, 0.04, H - 0.2, 0, 0, 0, BP.soil).surf(0);
  // Felder in Streifen: reifer Weizen (gold), junge Saat (grün), brach (Furchen)
  const strips: [number, number][] = [[0, BP.wheat], [1, BP.grass], [2, BP.hay], [3, BP.grassDark]];
  const fw = W - 1.1;
  for (const [i, col] of strips) {
    const z = -H / 2 + 0.7 + i * 0.78;
    b.stage(0.12 + i * 0.12, 0.3 + i * 0.12);
    bed(b, 0.3, z, fw, 0.58, 11, col, 0.04, col === BP.grass || col === BP.grassDark ? 0.1 : 0.3, true);
    b.stage();
  }
  // Furchen als Bodenstreifen
  b.det(1).surf(0);
  // Bauernhaus hinten rechts
  house(b, { w: 1.1, d: 0.9, h: 0.55, x: W / 2 - 0.8, z: -H / 2 + 0.7, plinth: 0.1, wall: BP.plaster, roof: { rise: 0.55, color: BP.thatch, surf: SURF.Thatch, over: 0.15, teamRidge: true }, door: { w: 0.28, h: 0.42, u: -0.15 }, windows: 1, timber: 'ends', chimney: { x: W / 2 - 0.5, z: -H / 2 + 0.5, h: 0.5 } });
  // Vogelscheuche
  b.det(1).surf(0).box(0.05, 0.8, 0.05, -1.0, 0.04, 0.5, BP.woodDark);
  b.box(0.6, 0.05, 0.05, -1.0, 0.6, 0.5, BP.woodDark);
  b.sphere(0.09, -1.0, 0.9, 0.5, BP.clothDark);
  b.cone(0.12, 0.14, 5, -1.0, 0.94, 0.5, BP.shingle);
  b.box(0.42, 0.34, 0.03, -1.0, 0.3, 0.5, BP.white, true);
  // Heuhaufen, Zaun, Karren
  haystack(b, -W / 2 + 0.6, -H / 2 + 0.5, 0.3, 0.04);
  haystack(b, -W / 2 + 1.1, -H / 2 + 0.45, 0.24, 0.04);
  fence(b, -W / 2 + 0.12, H / 2 - 0.12, W / 2 - 0.12, H / 2 - 0.12, 0.28);
  cart(b, W / 2 - 0.8, H / 2 - 0.7, 0.3, 'sacks');
  b.det(0);
}

export function hopFarm(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.2, 0.04, H - 0.2, 0, 0, 0, BP.soilDark).surf(0);
  // Hopfenstangen mit Ranken und Spanndrähten
  for (let r = 0; r < 4; r++) {
    const z = -H / 2 + 0.55 + r * 0.7;
    b.stage(0.1 + r * 0.1, 0.35 + r * 0.1);
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.5 + i * 0.7;
      b.det(0).box(0.06, 1.6, 0.06, x, 0.04, z, BP.woodDark);
      b.det(1).box(0.3, 1.05, 0.26, x, 0.04, z, (i + r) % 2 ? BP.grass : BP.grassDark, false, i * 0.4);
      b.sphere(0.07, x + 0.1, 0.9 + (i % 2) * 0.2, z + 0.1, BP.hay);
    }
    b.det(1).beam(-W / 2 + 0.5, 1.58, z, -W / 2 + 0.5 + 4 * 0.7, 1.58, z, 0.025, BP.cloth);
    b.stage();
  }
  // Trockenschuppen
  house(b, { w: 1.1, d: 0.85, h: 0.65, x: W / 2 - 0.85, z: H / 2 - 0.75, plinth: 0.1, wall: BP.wood, wallSurf: SURF.Plank, roof: { rise: 0.5, color: BP.shingle, surf: SURF.Shingle, over: 0.14, teamRidge: true }, door: { w: 0.28, h: 0.45, u: -0.2 }, windows: 1, chimney: false });
  sack(b, W / 2 - 0.3, H / 2 - 1.5);
  sack(b, W / 2 - 0.5, H / 2 - 1.45);
  barrel(b, -W / 2 + 0.4, H / 2 - 0.4, 0.04);
  b.det(0);
}

// ----------------------------------------------------------------------- Nahrung und Handwerk

export function mill(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  b.det(0).surf(SURF.Stone).cyl(1.0, 1.18, 0.3, 10, 0, 0, 0, BP.stoneDark);
  b.surf(SURF.Plaster).cyl(0.72, 0.96, 1.95, 10, 0, 0.28, 0, BP.plaster).surf(0);
  b.det(1).surf(SURF.Stone).cyl(0.99, 0.99, 0.06, 10, 0, 1.2, 0, BP.stoneMid).surf(0);
  // Kappe mit Schindeldach, Spitze und Wimpel
  b.det(0).surf(SURF.Plank).cyl(0.82, 0.78, 0.22, 10, 0, 2.2, 0, BP.woodDark).surf(0);
  b.surf(SURF.Shingle).cone(1.0, 0.85, 10, 0, 2.38, 0, BP.shingle).surf(0);
  pennant(b, 0, 3.2, 0, 0.45, 0.5, 0.2);
  // Eingang mit Treppe, Fenster, Galerie
  doorOn(b, 0, 0, 0.28, 0.99, 0.42, 0.66, { arch: true, frame: BP.woodDark, step: true });
  for (const f of [1, 3]) windowOn(b, f, 0, 1.45, 0.78, 0.2, 0.3, { arch: true, frame: BP.woodDark });
  windowOn(b, 2, 0, 1.45, 0.78, 0.2, 0.3, { arch: true, frame: BP.woodDark });
  b.det(1).surf(SURF.Plank).box(1.0, 0.06, 0.42, 0, 1.18, 1.0, BP.wood).surf(0);
  b.box(1.0, 0.1, 0.04, 0, 1.28, 1.2, BP.woodDark);
  for (const sx of [-1, 1]) b.box(0.04, 0.3, 0.04, sx * 0.48, 1.18, 1.2, BP.woodDark);
  b.box(0.1, 0.2, 0.5, -0.0, 1.0, 0.95, BP.woodDark);
  // Flügelkreuz mit Gitterrahmen und Tuchbahnen (dreht sich um die Welle)
  const cz = 1.08;
  const cy = 2.0;
  b.det(0).part(PART.Sail, 0, cy, cz);
  b.box(0.1, 2.7, 0.06, 0, cy - 1.35, cz, BP.wood);
  b.box(2.7, 0.1, 0.06, 0, cy - 0.05, cz, BP.wood);
  const blades: [number, number, number, number][] = [
    [0.26, cy + 0.82, 0.42, 0.95],
    [0.82, cy - 0.26, 0.95, 0.42],
    [-0.26, cy - 0.82, 0.42, 0.95],
    [-0.82, cy + 0.26, 0.95, 0.42],
  ];
  for (const [bx, by, bw, bh] of blades) {
    b.box(bw, bh, 0.03, bx, by - bh / 2, cz + 0.03, BP.white);
    b.det(1);
    if (bh > bw) {
      for (const sx of [-1, 1]) b.box(0.03, bh, 0.05, bx + sx * (bw / 2), by - bh / 2, cz + 0.04, BP.woodDark);
      for (const k of [0.25, 0.5, 0.75]) b.box(bw, 0.03, 0.05, bx, by - bh / 2 + bh * k - 0.015, cz + 0.04, BP.woodDark);
    } else {
      for (const sy of [-1, 1]) b.box(bw, 0.03, 0.05, bx, by + sy * (bh / 2) - 0.015, cz + 0.04, BP.woodDark);
      for (const k of [0.25, 0.5, 0.75]) b.box(0.03, bh, 0.05, bx - bw / 2 + bw * k, by - bh / 2, cz + 0.04, BP.woodDark);
    }
    b.det(0);
  }
  b.discZ(0.16, 0.16, 8, 0, cy, cz, BP.woodDark);
  b.discZ(0.07, 0.2, 6, 0, cy, cz, BP.iron);
  b.part(0);
  // Wellenkopf an der Kappe
  b.det(1).box(0.18, 0.18, 0.34, 0, cy - 0.09, 0.9, BP.woodDark);
  sack(b, 0.75, 1.05);
  sack(b, 0.95, 0.9);
  sack(b, 0.82, 1.2);
  b.det(0);
}

export function bakery(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  const h = house(b, { w: 1.9, d: 1.8, h: 0.95, x: -0.3, z: -0.1, plinth: 0.14, wall: BP.plasterWhite, roof: { rise: 0.85, color: BP.terracotta, surf: SURF.Tile, over: 0.18, teamRidge: true }, door: { w: 0.4, h: 0.7, u: -0.3, step: true }, windows: 1, timber: 'ends', shutters: true, chimney: false });
  void h;
  // Backofen: gemauerter Kuppelbau seitlich mit Schornstein
  b.det(0).surf(SURF.Stone).cyl(0.55, 0.62, 0.45, 9, 0.95, 0.0, 0.25, BP.stoneMid).surf(0);
  b.sphere(0.5, 0.95, 0.5, 0.25, BP.stoneLight);
  b.det(1).box(0.3, 0.26, 0.1, 0.95, 0.2, 0.85, BP.coal);
  b.box(0.38, 0.06, 0.14, 0.95, 0.12, 0.88, BP.stoneDark);
  chimney(b, 0.95, 0.85, 0.0, 1.0, 0.3, BP.stoneMid);
  // Verkaufstisch mit Broten, Brotschieber, Brotschild
  b.det(1).surf(SURF.Plank).box(0.9, 0.3, 0.3, -0.5, 0.0, 1.02, BP.woodLight).surf(0);
  for (let i = 0; i < 5; i++) b.sphere(0.07, -0.85 + i * 0.16, 0.38, 1.02, i % 2 ? BP.clay : BP.ochre);
  shedRoof(b, { w: 1.0, d: 0.5, x: -0.5, z: 0.95, y: 0.88, rise: 0.15, color: BP.white, team: true, surf: SURF.None, over: 0.04, low: 0.05 });
  for (const sx of [-1, 1]) b.det(1).box(0.05, 0.9, 0.05, -0.5 + sx * 0.5, 0, 1.2, BP.woodDark);
  b.beam(0.45, 0.0, 1.2, 0.5, 0.9, 1.2, 0.04, BP.wood);
  b.det(2).box(0.2, 0.05, 0.28, 0.5, 0.88, 1.2, BP.wood);
  for (let i = 0; i < 3; i++) sack(b, -1.2, 0.8 + i * 0.12, 0, BP.cloth);
  logPile(b, 1.25, -0.45, 0.5, 2, 0, 0.07);
  b.det(0);
}

export function brewery(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  house(b, { w: 2.0, d: 1.7, h: 1.0, x: 0.2, z: -0.4, plinth: 0.16, wall: BP.plaster, roof: { rise: 0.95, color: BP.terracottaDark, surf: SURF.Tile, over: 0.18, teamRidge: true }, door: { w: 0.5, h: 0.8, u: 0.35, arch: false, step: true }, windows: 1, timber: 'all', chimney: { x: 0.9, z: -0.8, h: 0.5 } });
  // Braukessel aus Kupfer auf Steinsockel mit Rohr
  b.det(0).surf(SURF.Stone).cyl(0.4, 0.46, 0.35, 8, -1.0, 0, 0.95, BP.stoneMid).surf(0);
  b.cyl(0.36, 0.4, 0.5, 10, -1.0, 0.35, 0.95, BP.copper);
  b.cone(0.38, 0.28, 10, -1.0, 0.85, 0.95, BP.copper);
  b.det(1).cyl(0.07, 0.07, 0.2, 6, -1.0, 1.1, 0.95, BP.copper);
  b.beam(-1.0, 1.25, 0.95, -0.55, 0.9, 0.7, 0.05, BP.copper);
  b.box(0.3, 0.06, 0.3, -1.0, 0.35, 0.95, BP.iron);
  // Fassstapel
  for (let i = 0; i < 3; i++) barrel(b, 0.75 + i * 0.3, 0.95, 0);
  for (let i = 0; i < 2; i++) barrel(b, 0.9 + i * 0.3, 0.95, 0.32);
  barrel(b, 1.05, 0.95, 0.64);
  for (const [x, z] of [[1.3, 0.6], [1.25, 1.1]]) sack(b, x, z, 0, BP.grass);
  b.box(0.8, 0.24, 0.3, -0.1, 0, 1.15, BP.woodDark);
  b.det(0);
}

export function inn(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  house(b, { w: 2.2, d: 1.9, h: 0.95, x: 0, z: -0.3, plinth: 0.14, wall: BP.plaster, roof: { kind: 'gable', rise: 0.75, color: BP.terracotta, surf: SURF.Tile, over: 0.2, teamRidge: true, ridgeX: false }, door: { w: 0.5, h: 0.78, u: 0.45, arch: true, step: true, leaf: BP.woodDark }, windows: 1, timber: 'all', shutters: true, chimney: false });
  // Obergeschoss mit Überhang und zweiter Dachebene
  b.det(0).surf(SURF.Plaster).box(2.0, 0.75, 1.7, 0, 1.09, -0.3, BP.plasterWhite).surf(0);
  b.det(0).surf(SURF.Plank).box(2.34, 0.1, 2.0, 0, 1.04, -0.3, BP.woodDark).surf(0);
  gableRoof(b, { w: 2.0, d: 1.7, x: 0, z: -0.3, y: 1.84, rise: 0.9, color: BP.terracotta, surf: SURF.Tile, over: 0.2, ridge: BP.white, ridgeTeam: true });
  chimney(b, 0.8, 2.0, -0.7, 1.0, 0.3);
  for (const u of [-0.7, 0.0, 0.7]) windowOn(b, 0, u, 1.3, 0.56, 0.22, 0.32, { shutters: true });
  b.det(1);
  for (let i = 0; i < 2; i++) windowOn(b, i ? 3 : 1, 0, 1.3, 1.02, 0.22, 0.32, { shutters: true });
  // Wirtshausschild mit Ausleger
  b.box(0.05, 0.05, 0.5, 1.15, 1.2, 0.8, BP.woodDark);
  b.box(0.05, 0.5, 0.05, 1.15, 0.9, 0.62, BP.woodDark);
  b.part(PART.Cloth, 1.15, 1.18, 0.9);
  b.box(0.04, 0.3, 0.3, 1.15, 0.86, 0.9, BP.white, true);
  b.part(0);
  b.discZ(0.08, 0.03, 6, 1.18, 0.98, 0.9, BP.gold);
  // Tische, Hocker, Fässer
  for (const [x, z] of [[-0.9, 1.0], [0.0, 1.05]]) {
    b.box(0.45, 0.05, 0.3, x, 0.3, z, BP.woodLight);
    for (const sx of [-1, 1]) b.box(0.05, 0.3, 0.05, x + sx * 0.18, 0, z, BP.woodDark);
    for (const sx of [-1, 1]) b.cyl(0.07, 0.07, 0.2, 5, x + sx * 0.3, 0, z + 0.2, BP.wood);
  }
  barrel(b, 0.95, 1.15);
  barrel(b, 1.15, 1.0);
  b.det(0);
}

function workshopShell(b: ModelBuilder, o: { wall: number; surf?: number; roof: number; roofSurf?: number; chimX?: number }): void {
  house(b, { w: 1.9, d: 1.55, h: 0.8, x: -0.35, z: -0.5, plinth: 0.14, wall: o.wall, wallSurf: o.surf ?? SURF.Plaster, roof: { rise: 0.7, color: o.roof, surf: o.roofSurf ?? SURF.Shingle, over: 0.18, teamRidge: true }, door: { w: 0.38, h: 0.62, u: -0.4, step: true }, windows: 1, timber: 'ends', chimney: { x: o.chimX ?? 0.2, z: -0.95, h: 0.6, w: 0.3 } });
}

export function fletcher(b: ModelBuilder): void {
  workshopShell(b, { wall: BP.woodLight, surf: SURF.Plank, roof: BP.shingle });
  // Bogenständer mit Bögen, Pfeilbündel, Werkbank
  b.det(1).surf(0);
  b.box(0.8, 0.05, 0.1, 0.9, 0, 0.85, BP.woodDark);
  for (let i = 0; i < 4; i++) {
    const x = 0.6 + i * 0.16;
    b.beam(x, 0.05, 0.85, x - 0.05, 0.4, 0.85, 0.035, BP.wood);
    b.beam(x - 0.05, 0.4, 0.85, x, 0.72, 0.85, 0.035, BP.wood);
    b.beam(x, 0.05, 0.9, x, 0.72, 0.9, 0.012, BP.cloth);
  }
  for (let i = 0; i < 6; i++) b.beam(-1.2 + (i % 3) * 0.04, 0.0, 0.7 + i * 0.03, -1.1 + (i % 3) * 0.04, 0.55, 0.7 + i * 0.03, 0.02, BP.woodLight);
  b.box(0.7, 0.05, 0.3, 0.0, 0.32, 1.0, BP.woodLight);
  for (const sx of [-1, 1]) b.box(0.05, 0.32, 0.05, sx * 0.3, 0, 1.0, BP.woodDark);
  logPile(b, 1.0, -0.1, 0.5, 2, 0, 0.07);
  // großes Bogenschild an einer Stange über dem Eingang (Silhouette)
  b.det(0).box(0.06, 1.9, 0.06, -1.2, 0, 0.95, BP.woodDark);
  b.beam(-1.2, 1.2, 0.95, -0.7, 1.55, 0.95, 0.07, BP.woodLight);
  b.beam(-1.2, 1.2, 0.95, -0.7, 0.85, 0.95, 0.07, BP.woodLight);
  b.beam(-0.7, 1.55, 0.95, -0.7, 0.85, 0.95, 0.02, BP.cloth);
  b.beam(-1.2, 1.2, 0.97, -0.62, 1.2, 0.97, 0.03, BP.ironLight);
  b.spike(0.04, 0.16, -0.62, 1.2, 0.97, BP.ironLight);
  b.det(0);
}

export function poleturner(b: ModelBuilder): void {
  workshopShell(b, { wall: BP.plasterWarm, roof: BP.woodDark, roofSurf: SURF.Shingle });
  // lange Stangen an der Wand und Drechselbank
  b.det(1).surf(0);
  for (let i = 0; i < 6; i++) b.beam(0.78 + i * 0.1, 0.0, 0.62, 0.78 + i * 0.1 + 0.25, 2.3, -0.05, 0.04, i % 2 ? BP.woodLight : BP.wood);
  for (let i = 0; i < 3; i++) b.spike(0.04, 0.18, 1.03 + i * 0.1 + 0.0, 2.3, -0.05, BP.ironLight);
  b.box(0.9, 0.06, 0.28, -0.2, 0.34, 1.05, BP.woodDark);
  for (const sx of [-1, 1]) b.box(0.05, 0.34, 0.05, -0.2 + sx * 0.38, 0, 1.05, BP.woodDark);
  b.disc(0.22, 0.05, 8, -0.55, 0.5, 1.05, BP.woodDark);
  b.cyl(0.04, 0.04, 0.7, 5, -0.2, 0.44, 1.05, BP.wood);
  b.box(0.12, 0.12, 0.12, 0.1, 0.4, 1.05, BP.woodLight);
  for (let i = 0; i < 5; i++) b.box(0.1, 0.03, 0.06, 0.2 + i * 0.1, 0, 0.9 + (i % 2) * 0.1, BP.hay, false, i);
  b.det(0);
}

export function blacksmith(b: ModelBuilder): void {
  workshopShell(b, { wall: BP.stone, surf: SURF.Stone, roof: BP.slateDark, chimX: 0.55 });
  // große Esse an der Giebelwand: Steinaufbau mit Glut
  b.det(0).surf(SURF.Stone).box(0.8, 0.55, 0.55, 0.9, 0.14, 0.4, BP.stoneMid).surf(0);
  b.box(0.5, 0.2, 0.06, 0.9, 0.35, 0.7, BP.terracottaLight);
  b.det(1).box(0.36, 0.12, 0.04, 0.9, 0.4, 0.72, BP.gold);
  chimney(b, 0.9, 0.69, 0.4, 1.5, 0.34, BP.stoneMid);
  b.beam(0.5, 0.35, 0.55, 0.3, 0.2, 0.7, 0.05, BP.woodDark);
  b.box(0.3, 0.1, 0.18, 0.28, 0.14, 0.72, BP.wood);
  // Amboss mit Hammerarm, Wasserfass, Kohle, Zange
  anvil(b, 0.0, 0.0, 1.05);
  b.part(PART.ArmR, 0.0, 0.5, 0.78);
  b.box(0.04, 0.04, 0.36, 0.0, 0.46, 0.92, BP.woodDark);
  b.box(0.1, 0.12, 0.1, 0.0, 0.4, 1.1, BP.iron);
  b.part(0);
  barrel(b, -0.5, 1.05, 0, BP.woodDark);
  b.det(1).cyl(0.11, 0.11, 0.02, 8, -0.5, 0.31, 1.05, BP.water);
  for (let i = 0; i < 4; i++) b.sphere(0.07, 1.25 + (i % 2) * 0.1, 0.07, 1.0 + i * 0.08, BP.coal);
  b.box(0.04, 0.04, 0.3, -1.2, 0.5, 0.82, BP.ironLight);
  b.det(0);
}

export function tanner(b: ModelBuilder): void {
  workshopShell(b, { wall: BP.woodDark, surf: SURF.Plank, roof: BP.thatch, roofSurf: SURF.Thatch });
  dryingRack(b, 0.85, 0.7, 1.0, 0.0, BP.clay);
  dryingRack(b, -0.3, 1.1, 1.0, 0.0, BP.shingle);
  dryingRack(b, 1.2, 0.0, 0.8, 1.57, BP.clay);
  // Gerbbottiche
  for (let i = 0; i < 3; i++) {
    b.det(1).surf(0).cyl(0.2, 0.18, 0.28, 8, 0.4 + i * 0.5, 0.0, 1.15, BP.woodDark);
    b.cyl(0.16, 0.16, 0.02, 8, 0.4 + i * 0.5, 0.26, 1.15, i % 2 ? BP.shingle : BP.soilDark);
  }
  b.box(0.45, 0.14, 0.3, -1.05, 0.0, 0.7, BP.clay);
  b.box(0.35, 0.1, 0.26, -1.05, 0.14, 0.7, BP.shingle);
  b.det(0);
}

export function armorer(b: ModelBuilder): void {
  workshopShell(b, { wall: BP.stoneMid, surf: SURF.Stone, roof: BP.slate, chimX: 0.55 });
  anvil(b, 0.0, 0.0, 1.0);
  b.part(PART.ArmR, 0.0, 0.5, 0.74);
  b.box(0.04, 0.04, 0.34, 0.0, 0.46, 0.88, BP.woodDark);
  b.box(0.12, 0.1, 0.1, 0.0, 0.41, 1.04, BP.ironLight);
  b.part(0);
  // Rüstungspuppen mit Brustpanzer und Helm, Schilde in Spielerfarbe
  for (const x of [0.75, 1.1]) {
    b.det(1).surf(0).box(0.04, 0.7, 0.04, x, 0, 0.9, BP.woodDark);
    b.box(0.24, 0.3, 0.12, x, 0.34, 0.9, BP.ironLight);
    b.sphere(0.09, x, 0.76, 0.9, BP.ironLight);
    b.box(0.2, 0.04, 0.2, x, 0.04, 0.9, BP.woodDark);
  }
  b.discZ(0.17, 0.04, 8, -1.05, 0.5, 0.95, BP.white, true);
  b.box(0.05, 0.5, 0.05, -1.05, 0, 0.9, BP.woodDark);
  b.box(0.9, 0.2, 0.3, -0.4, 0.4, 1.15, BP.woodDark);
  for (let i = 0; i < 3; i++) b.box(0.22, 0.05, 0.2, -0.65 + i * 0.25, 0.6, 1.15, BP.ironLight);
  b.det(0);
}

export function market(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Flag).box(W - 0.2, 0.05, H - 0.2, 0, 0, 0, BP.stoneMid).surf(0);
  const stalls: [number, number, number][] = [
    [-0.85, -0.7, 0],
    [0.85, -0.7, 1],
    [-0.4, 0.85, 2],
  ];
  const awn = [BP.white, BP.cloth, BP.white];
  for (const [x, z, k] of stalls) {
    for (const [dx, dz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) b.det(0).box(0.06, 0.95, 0.06, x + dx, 0.05, z + dz, BP.woodDark);
    // gestreifte Plane: abwechselnd Spielerfarbe und Naturtuch
    for (let i = 0; i < 4; i++) {
      b.det(0).surf(0);
      const sx = x - 0.4 + (i + 0.5) * 0.2;
      b.shed(0.2, 0.2, 0.9, sx, 1.0, z, i % 2 ? awn[k] : BP.white, i % 2 === 0, 0, 0.08);
    }
    // Tisch mit Ware
    b.det(1).surf(SURF.Plank).box(0.76, 0.05, 0.36, x, 0.38, z, BP.woodLight).surf(0);
    b.box(0.76, 0.32, 0.05, x, 0.06, z + 0.17, BP.woodDark);
    if (k === 0) for (let i = 0; i < 5; i++) b.sphere(0.07, x - 0.3 + i * 0.15, 0.5, z, i % 2 ? BP.apple : BP.hay);
    if (k === 1) for (let i = 0; i < 3; i++) b.box(0.18, 0.14, 0.26, x - 0.25 + i * 0.25, 0.43, z, i % 2 ? BP.white : BP.clothDark);
    if (k === 2) for (let i = 0; i < 4; i++) b.cyl(0.07, 0.08, 0.16, 6, x - 0.28 + i * 0.19, 0.43, z, i % 2 ? BP.clay : BP.terracottaDark);
    b.det(0);
  }
  // Wegweiser mit Fahne, Fässer, Karren
  b.det(1).box(0.07, 1.3, 0.07, W / 2 - 0.3, 0.05, H / 2 - 0.3, BP.woodDark);
  flag(b, W / 2 - 0.3, 1.2, H / 2 - 0.3, 0.4, 0.4, 0.2);
  barrel(b, 0.8, 0.9, 0.05);
  barrel(b, 1.05, 0.75, 0.05, BP.woodDark);
  crate(b, 0.7, 0.35, 0.28, 0.05);
  sack(b, 1.0, 0.1, 0.05);
  b.det(0);
}

void ladder;
void hipRoof;
void banner;
void plinth;
void slab;
