import type { ModelBuilder } from './builder';
import { BP, SURF } from './building_palette';
import {
  banner,
  barrel,
  coneRoof,
  doorOn,
  FACE_ROT,
  faceOff,
  facePos,
  fence,
  gableRoof,
  hipRoof,
  lancet,
  logPile,
  logX,
  masonry,
  plinth,
  slab,
  windowOn,
} from './building_parts';
import { house } from './building_house';

const PINK = 0xd07a96;
const SKY = 0x8aa8d0;

function cross(b: ModelBuilder, x: number, y: number, z: number, s = 1): void {
  b.det(0).surf(0);
  b.box(0.07 * s, 0.5 * s, 0.07 * s, x, y, z, BP.gold);
  b.box(0.3 * s, 0.07 * s, 0.07 * s, x, y + 0.28 * s, z, BP.gold);
}

export function hovel(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  house(b, { w: 1.5, d: 1.35, h: 0.66, x: 0, z: -0.1, plinth: 0.1, wall: BP.plaster, roof: { rise: 0.62, color: BP.terracotta, surf: SURF.Tile, over: 0.15, teamRidge: true }, door: { w: 0.3, h: 0.5, u: -0.3, step: true }, windows: 1, timber: 'ends', shutters: true, banner: true, chimney: { x: 0.45, z: -0.4, h: 0.55 } });
  logPile(b, 0.62, 0.62, 0.5, 2, 0, 0.065);
  b.det(1).surf(SURF.Plank).box(0.5, 0.05, 0.16, -0.5, 0.2, 0.7, BP.wood).surf(0);
  b.box(0.05, 0.2, 0.05, -0.7, 0, 0.7, BP.woodDark);
  b.box(0.05, 0.2, 0.05, -0.3, 0, 0.7, BP.woodDark);
  b.det(0);
}

export function campfire(b: ModelBuilder): void {
  b.det(0).surf(SURF.Stone);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.boulder(0.1, 0.07, 0.09, Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3, i + 2, i % 2 ? BP.stoneMid : BP.stoneDark);
  }
  b.surf(0).cyl(0.26, 0.28, 0.04, 8, 0, 0, 0, BP.coal);
  b.det(1);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    b.beam(Math.cos(a) * 0.22, 0.06, Math.sin(a) * 0.22, -Math.cos(a) * 0.05, 0.16, -Math.sin(a) * 0.05, 0.06, i % 2 ? BP.woodDark : BP.wood);
  }
  // Dreibein mit Topf, Sitzstämme
  for (const [x, z] of [[-0.18, -0.12], [0.18, -0.12], [0, 0.2]]) b.beam(x * 1.6, 0.0, z * 1.6, 0, 0.7, 0, 0.03, BP.woodDark);
  b.cyl(0.1, 0.08, 0.1, 6, 0, 0.42, 0, BP.black);
  logX(b, 0.0, 0.0, 0.52, 0.34, 0.06, BP.woodDark);
  logX(b, 0.0, 0.0, -0.52, 0.34, 0.06, BP.wood);
  b.det(0);
}

export function well(b: ModelBuilder): void {
  b.det(0).surf(SURF.Stone).cyl(0.36, 0.4, 0.14, 8, 0, 0, 0, BP.stoneDark);
  b.cyl(0.32, 0.34, 0.34, 8, 0, 0.12, 0, BP.stone).surf(0);
  b.cyl(0.24, 0.24, 0.02, 8, 0, 0.44, 0, BP.water);
  b.surf(SURF.Stone).cyl(0.35, 0.35, 0.05, 8, 0, 0.44, 0, BP.stoneMid).surf(0);
  for (const sx of [-1, 1]) b.det(0).box(0.06, 0.62, 0.06, sx * 0.3, 0.44, 0, BP.woodDark);
  b.det(1).cyl(0.045, 0.045, 0.66, 5, 0, 0.9, 0, BP.wood);
  // Kurbel, Seil und Eimer
  b.box(0.06, 0.06, 0.2, 0.33, 0.9, 0.1, BP.woodDark);
  b.beam(0, 0.88, 0, 0, 0.5, 0, 0.015, BP.cloth);
  b.cyl(0.06, 0.05, 0.08, 6, 0, 0.42, 0, BP.woodLight);
  b.det(0);
  gableRoof(b, { w: 0.84, d: 0.62, x: 0, z: 0, y: 1.06, rise: 0.28, color: BP.terracotta, surf: SURF.Tile, over: 0.08, rotY: Math.PI / 2, ridge: BP.white, ridgeTeam: true, fascia: false });
}

export function waterPot(b: ModelBuilder): void {
  b.det(0).surf(0);
  b.box(0.5, 0.05, 0.5, 0, 0, 0, BP.woodDark);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.box(0.05, 0.12, 0.05, x, 0.05, z, BP.woodDark);
  b.cyl(0.22, 0.14, 0.12, 8, 0, 0.17, 0, BP.clay);
  b.cyl(0.2, 0.2, 0.02, 8, 0, 0.35, 0, BP.water);
  b.cyl(0.16, 0.12, 0.12, 8, 0, 0.17 + 0.12, 0, BP.clay);
  b.det(1).box(0.04, 0.3, 0.04, 0.3, 0.05, 0.1, BP.woodDark);
  b.box(0.12, 0.05, 0.12, 0.3, 0.3, 0.1, BP.white, true);
  b.det(0);
}

export function garden(b: ModelBuilder, W: number, H: number): void {
  b.det(0).surf(SURF.Ground).box(W - 0.2, 0.06, H - 0.2, 0, 0, 0, BP.grassDark).surf(0);
  const cols = [BP.apple, BP.gold, BP.white, PINK, SKY, BP.apple];
  let k = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 0.5;
      const z = sz * 0.5;
      b.det(0).surf(SURF.Plank).box(0.62, 0.14, 0.62, x, 0.06, z, BP.woodDark).surf(0);
      b.box(0.54, 0.05, 0.54, x, 0.16, z, BP.soilDark);
      b.det(1);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + k;
        b.cone(0.07, 0.16, 4, x + Math.cos(a) * 0.17, 0.2, z + Math.sin(a) * 0.17, BP.grass);
        b.sphere(0.06, x + Math.cos(a) * 0.17, 0.4, z + Math.sin(a) * 0.17, cols[(k + i) % cols.length]);
      }
      k++;
    }
  // Kieswege, Rosenbogen, Bank
  b.det(1).surf(SURF.Flag).box(0.18, 0.04, W - 0.3, 0, 0.06, 0, BP.stoneLight).box(W - 0.3, 0.04, 0.18, 0, 0.065, 0, BP.stoneLight).surf(0);
  b.det(1).sphere(0.12, 0, 0.3, 0, BP.stoneMid);
  b.cone(0.05, 0.12, 5, 0, 0.4, 0, BP.gold);
  b.det(0);
}

export function statue(b: ModelBuilder): void {
  b.det(0).surf(SURF.Stone);
  b.box(1.6, 0.16, 1.6, 0, 0, 0, BP.stoneDark);
  b.box(1.3, 0.14, 1.3, 0, 0.16, 0, BP.stoneMid);
  b.box(0.8, 0.7, 0.8, 0, 0.3, 0, BP.stone);
  b.box(0.92, 0.08, 0.92, 0, 1.0, 0, BP.stoneMid);
  b.box(0.92, 0.08, 0.92, 0, 0.26, 0, BP.stoneMid).surf(0);
  // Ritterfigur: Beine, Rumpf, Kopf, Schild und Schwert
  b.det(0).surf(SURF.Stone);
  b.box(0.12, 0.42, 0.14, -0.08, 1.08, 0, BP.stoneLight);
  b.box(0.12, 0.42, 0.14, 0.08, 1.08, 0, BP.stoneLight);
  b.box(0.34, 0.42, 0.2, 0, 1.5, 0, BP.stoneLight);
  b.box(0.38, 0.1, 0.24, 0, 1.52, 0, BP.stone).surf(0);
  b.sphere(0.12, 0, 2.05, 0, BP.stoneLight);
  b.box(0.1, 0.1, 0.1, 0, 1.92, 0, BP.stoneLight);
  b.det(1).box(0.1, 0.38, 0.1, -0.24, 1.5, 0, BP.stoneLight);
  b.box(0.1, 0.5, 0.1, 0.24, 1.46, 0.0, BP.stoneLight);
  b.beam(0.26, 1.7, 0.1, 0.26, 2.5, 0.1, 0.045, BP.ironLight);
  b.box(0.18, 0.05, 0.05, 0.26, 1.75, 0.1, BP.gold);
  b.box(0.04, 0.3, 0.26, -0.34, 1.35, 0.1, BP.white, true);
  b.det(0);
  // Umlaufende Lampen und Banner an den Ecken des Sockels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.det(1).box(0.05, 0.3, 0.05, sx * 0.68, 0.3, sz * 0.68, BP.woodDark);
    b.sphere(0.06, sx * 0.68, 0.64, sz * 0.68, BP.gold);
  }
  b.det(0);
}

export function maypole(b: ModelBuilder): void {
  b.det(0).surf(SURF.Ground).cyl(0.65, 0.72, 0.1, 10, 0, 0, 0, BP.grass).surf(0);
  b.cyl(0.06, 0.085, 2.3, 6, 0, 0.1, 0, BP.woodLight);
  b.det(1).cyl(0.09, 0.09, 0.05, 6, 0, 0.45, 0, BP.woodDark);
  // Blumenkranz an der Spitze und Bänder (Spielerfarbe + bunt)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.sphere(0.07, Math.cos(a) * 0.17, 2.32, Math.sin(a) * 0.17, [BP.apple, BP.white, BP.gold, BP.grass][i % 4]);
  }
  const rib = [BP.white, BP.gold, BP.apple, BP.white, SKY, BP.white];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 0.62 + (i % 2) * 0.12;
    b.beam(Math.cos(a + 0.4) * 0.05, 2.25, Math.sin(a + 0.4) * 0.05, Math.cos(a) * r, 0.2, Math.sin(a) * r, 0.025, rib[i], i === 0 || i === 3);
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    b.sphere(0.06, Math.cos(a) * 0.55, 0.14, Math.sin(a) * 0.55, [PINK, BP.gold, BP.white][i % 3]);
  }
  b.det(0);
}

export function gallows(b: ModelBuilder): void {
  b.det(0).surf(SURF.Plank).box(1.5, 0.14, 1.5, 0, 0, 0, BP.woodDark);
  b.box(1.4, 0.05, 1.4, 0, 0.14, 0, BP.wood).surf(0);
  for (let i = 0; i < 3; i++) b.det(1).box(0.9, 0.08, 0.2, 0.0, 0.0 + i * 0.05, 0.9 + i * 0.1, BP.woodDark);
  // Pfosten, Querbalken, Strebe, Strick
  b.det(0).box(0.14, 2.2, 0.14, -0.5, 0.18, 0, BP.wood);
  b.box(1.2, 0.14, 0.14, 0.0, 2.2, 0, BP.wood);
  b.beam(-0.5, 1.7, 0, 0.0, 2.2, 0, 0.09, BP.woodDark);
  b.det(1).beam(0.45, 2.2, 0, 0.45, 1.6, 0, 0.02, BP.cloth);
  b.cyl(0.1, 0.1, 0.03, 8, 0.45, 1.46, 0, BP.cloth);
  b.box(0.12, 0.2, 0.12, 0.45, 1.4, 0, BP.clothDark);
  b.box(0.5, 0.04, 0.5, 0.45, 0.18, 0.0, BP.black);
  b.beam(0.0, 0.2, -0.4, 0.5, 0.35, -0.4, 0.06, BP.woodDark);
  b.box(0.08, 0.06, 0.1, -0.2, 2.34, 0, BP.black);
  b.box(0.06, 0.05, 0.08, -0.1, 2.34, 0, BP.black);
  b.det(0);
}

export function stocks(b: ModelBuilder): void {
  b.det(0).surf(SURF.Plank).box(0.9, 0.1, 1.5, 0, 0, 0, BP.woodDark).surf(0);
  for (const sz of [-1, 1]) b.box(0.1, 0.85, 0.1, 0, 0.1, sz * 0.62, BP.wood);
  b.box(0.14, 0.12, 1.34, 0, 0.5, 0, BP.wood);
  b.box(0.14, 0.12, 1.34, 0, 0.64, 0, BP.woodLight);
  b.det(1).surf(0);
  for (const z of [-0.3, 0.3]) b.box(0.15, 0.02, 0.1, 0, 0.625, z, BP.black);
  b.box(0.2, 0.06, 0.1, 0, 0.98, 0.62, BP.woodDark);
  b.box(0.04, 0.3, 0.04, 0.2, 0.1, 0.62, BP.iron);
  b.det(0);
}

// ----------------------------------------------------------------------------------------- Kirchen

/** Bogenfenster in Seitenreihe */
function sideWindows(b: ModelBuilder, f: number, cx: number, cz: number, n: number, len: number, count: number, y: number, h: number): void {
  const [u0, n0] = faceOff(f, cx, cz);
  for (let i = 0; i < count; i++) lancet(b, f, u0 - len / 2 + ((i + 0.5) / count) * len, y, n0 + n, 0.2, h);
}

export function chapel(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  // Kirchenschiff
  plinth(b, 1.55, 2.1, 0, -0.35, 0.16, BP.stoneDark, 0.07);
  masonry(b, 1.55, 1.0, 2.1, 0, 0.16, -0.35, BP.stone);
  gableRoof(b, { w: 1.55, d: 2.1, x: 0, z: -0.35, y: 1.16, rise: 0.75, color: BP.slate, surf: SURF.Shingle, over: 0.12, ridge: BP.white, ridgeTeam: true });
  // Vorbau/Turm an der Front mit Spitzhelm und Kreuz
  masonry(b, 0.85, 1.55, 0.7, 0, 0.0, 1.0, BP.stoneLight);
  b.det(0).surf(SURF.Stone).box(0.95, 0.08, 0.8, 0, 1.5, 1.0, BP.stoneMid).surf(0);
  b.pyramid(0.7, 0.85, 0, 1.58, 1.0, BP.slate);
  cross(b, 0, 2.4, 1.0, 0.9);
  doorOn(b, 0, 0, 0.0, 1.35, 0.46, 0.8, { arch: true, frame: BP.stoneLight, step: true });
  for (const f of [1, 3]) {
    const [u0, n0] = faceOff(f, 0, 1.0);
    windowOn(b, f, u0, 1.12, n0 + 0.425, 0.14, 0.24, { arch: true, frame: BP.stoneLight, sill: false });
  }
  // Lanzettfenster am Schiff
  for (const f of [1, 3]) sideWindows(b, f, 0, -0.35, 0.775, 1.6, 2, 0.4, 0.45);
  sideWindows(b, 2, 0, -0.35, 1.05, 0.0, 1, 0.4, 0.45);
  banner(b, 0, 0.0, 1.4, 1.37, 0.3, 0.55);
}

export function church(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  // Schiff mit Seitenschiffen
  plinth(b, 1.9, 2.6, 0, -0.35, 0.18, BP.stoneDark, 0.08);
  masonry(b, 1.9, 1.5, 2.6, 0, 0.18, -0.35, BP.stone);
  gableRoof(b, { w: 1.9, d: 2.6, x: 0, z: -0.35, y: 1.68, rise: 1.0, color: BP.terracotta, surf: SURF.Tile, over: 0.14, ridge: BP.white, ridgeTeam: true });
  for (const sx of [-1, 1]) {
    masonry(b, 0.55, 0.9, 2.2, sx * 1.2, 0.0, -0.3, BP.stoneMid);
    b.det(0).shed(0.6, 0.35, 2.3, sx * 1.2, 0.9, -0.3, BP.terracottaDark, false, sx > 0 ? 0 : Math.PI, 0.05);
  }
  // Apsis
  b.det(0).surf(SURF.Stone).cyl(0.8, 0.88, 1.35, 8, 0, 0.0, -1.9, BP.stoneMid).surf(0);
  coneRoof(b, 0.95, 0.75, 0, 1.33, -1.9, BP.slate, false, 8, SURF.Shingle);
  // Westturm mit Spitzhelm und Kreuz
  masonry(b, 1.15, 2.7, 1.15, 0, 0.0, 1.35, BP.stoneLight);
  b.det(0).surf(SURF.Stone).box(1.25, 0.1, 1.25, 0, 2.45, 1.35, BP.stoneMid).box(1.2, 0.14, 1.2, 0, 1.2, 1.35, BP.stoneMid).surf(0);
  b.det(0).surf(SURF.Shingle).pyramid(0.95, 1.7, 0, 2.7, 1.35, BP.slateDark).surf(0);
  b.det(1).pyramid(0.35, 0.5, 0.0, 2.7 + 1.3, 1.35, BP.slate);
  cross(b, 0, 4.2, 1.35, 1.1);
  // Portal, Rosenfenster, Uhr, Schallöffnungen
  doorOn(b, 0, 0, 0.0, 1.925, 0.66, 1.1, { arch: true, frame: BP.stoneLight, step: true });
  b.det(1).discZ(0.26, 0.05, 12, 0, 1.65, 1.95, BP.stoneLight).discZ(0.19, 0.06, 12, 0, 1.65, 1.97, SKY);
  for (const f of [0, 1, 2, 3]) {
    const [u0, n0] = faceOff(f, 0, 1.35);
    windowOn(b, f, u0, 2.05, n0 + 0.575, 0.22, 0.4, { arch: true, frame: BP.stoneLight, sill: false });
  }
  b.det(1).discZ(0.17, 0.05, 12, 0, 2.2, 1.99, BP.white).discZ(0.2, 0.04, 12, 0, 2.2, 1.97, BP.gold);
  // Fenster und Strebepfeiler am Schiff
  for (const f of [1, 3]) sideWindows(b, f, 0, -0.35, 0.95 + 0.0, 2.3, 3, 0.55, 0.65);
  for (const sx of [-1, 1]) for (const z of [-1.25, -0.35, 0.55]) {
    b.det(1).surf(SURF.Stone).box(0.15, 1.1, 0.2, sx * 0.99 + sx * 0.5, 0.0, z + 0.45 * 0, BP.stoneMid).surf(0);
  }
  banner(b, 0, 0.45, 1.5, 1.94, 0.3, 0.9);
  banner(b, 0, -0.45, 1.5, 1.94, 0.3, 0.9);
  b.det(0);
}

export function cathedral(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  // Hauptschiff und Querschiff
  plinth(b, 2.3, 3.4, 0, -0.2, 0.22, BP.stoneDark, 0.08);
  masonry(b, 2.3, 2.1, 3.4, 0, 0.22, -0.2, BP.stone);
  gableRoof(b, { w: 2.3, d: 3.4, x: 0, z: -0.2, y: 2.32, rise: 1.35, color: BP.slate, surf: SURF.Shingle, over: 0.14, ridge: BP.white, ridgeTeam: true });
  masonry(b, 3.7, 1.8, 1.2, 0, 0.0, -0.4, BP.stoneMid);
  gableRoof(b, { w: 1.2, d: 3.7, x: 0, z: -0.4, y: 1.8, rise: 1.0, color: BP.slate, surf: SURF.Shingle, over: 0.1, rotY: Math.PI / 2, ridge: BP.woodDark, fascia: false });
  // Apsis
  b.det(0).surf(SURF.Stone).cyl(1.05, 1.12, 1.9, 10, 0, 0.0, -2.15, BP.stoneMid).surf(0);
  coneRoof(b, 1.2, 1.0, 0, 1.88, -2.15, BP.slate, false, 10, SURF.Shingle);
  // Zwei Westtürme mit Spitzhelmen
  for (const sx of [-1, 1]) {
    const x = sx * 1.3;
    masonry(b, 1.1, 3.4, 1.1, x, 0.0, 1.8, BP.stoneLight);
    b.det(0).surf(SURF.Stone).box(1.2, 0.12, 1.2, x, 3.1, 1.8, BP.stoneMid).box(1.18, 0.12, 1.18, x, 1.6, 1.8, BP.stoneMid).surf(0);
    b.surf(SURF.Shingle).pyramid(0.92, 1.5, x, 3.4, 1.8, BP.slateDark).surf(0);
    cross(b, x, 4.8, 1.8, 0.9);
    for (const f of [0, 1, 2, 3]) {
      const [u0, n0] = faceOff(f, x, 1.8);
      windowOn(b, f, u0, 2.45, n0 + 0.55, 0.2, 0.5, { arch: true, frame: BP.stoneLight, sill: false });
    }
    banner(b, 0, x, 1.45, 2.4, 0.36, 1.0);
  }
  // Mittelportal, Rosette
  masonry(b, 1.5, 2.1, 0.5, 0, 0.0, 2.05, BP.stoneMid);
  doorOn(b, 0, 0, 0.0, 2.3, 0.9, 1.4, { arch: true, frame: BP.stoneLight, step: true });
  b.det(1).discZ(0.46, 0.06, 14, 0, 2.55, 2.31, BP.stoneLight).discZ(0.36, 0.07, 14, 0, 2.55, 2.33, SKY);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(0.03, 0.34, 0.04, Math.cos(a) * 0.17, 2.55 + Math.sin(a) * 0.17 - 0.17, 2.36, BP.stoneLight, false, a);
  }
  // Vierungsturm (Dachreiter) mit Kreuz
  b.det(0).surf(SURF.Stone).box(0.55, 0.7, 0.55, 0, 3.6, -0.4, BP.stoneLight).surf(0);
  b.pyramid(0.45, 1.0, 0, 4.3, -0.4, BP.slateDark);
  cross(b, 0, 5.25, -0.4, 0.9);
  // Seitenfenster und Strebebögen
  for (const f of [1, 3]) sideWindows(b, f, 0, -0.2, 1.15, 3.0, 4, 0.7, 0.85);
  for (const sx of [-1, 1]) {
    for (const z of [-1.2, 0.4]) {
      b.det(1).surf(SURF.Stone).box(0.2, 1.5, 0.26, sx * 1.42, 0, z, BP.stoneMid);
      b.beam(sx * 1.4, 1.35, z, sx * 1.12, 2.3, z, 0.1, BP.stoneMid).surf(0);
    }
  }
  b.det(0);
}

void FACE_ROT;
void facePos;
void barrel;
void fence;
void hipRoof;
void slab;
