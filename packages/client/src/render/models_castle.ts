import { BT } from '@strongpoly/shared';
import type { ModelBuilder } from './builder';
import { BP, SURF } from './building_palette';
import {
  anvil,
  banner,
  barrel,
  chimney,
  corbels,
  crate,
  crenel,
  coneRoof,
  doorOn,
  facePos,
  faceOff,
  FACE_ROT,
  flag,
  gableRoof,
  haystack,
  hipRoof,
  ladder,
  lancet,
  logPile,
  masonry,
  pennant,
  plankPile,
  plinth,
  roundCrenel,
  roundTower,
  sack,
  shedRoof,
  slab,
  slitOn,
  stonePile,
  windowOn,
} from './building_parts';
import { house } from './building_house';
import { PART } from './materials';

/** Dicke der Mauerstücke je Typ und Höhe der Mauerkrone (= Laufhöhe der Einheiten, siehe def.height) */
export const WALL_T: Record<number, number> = { [BT.WallWood]: 0.52, [BT.WallLow]: 0.6, [BT.WallHigh]: 0.72 };

const hash1 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Mauerteile. `arm`: halbes Tile von der Mitte (x=0) zur Kante (x=±0.5), `post`: Pfosten in der Tilemitte,
 * `stub`: Einzelpfosten ohne Nachbarn (mit Spitze/Kappe). Steinmauern tragen Lagerfugen (Shader), Mauerband,
 * Sockel mit Anlauf, Schießscharten und einen durchgehenden Wehrgang mit Zinnen auf beiden Seiten.
 */
export function wallParts(b: ModelBuilder, id: number, h: number, kind: 'arm' | 'post' | 'stub', sx = 1): void {
  const T = WALL_T[id] ?? 0.6;
  if (id === BT.WallWood) {
    const top = h;
    b.det(0).surf(SURF.Log);
    if (kind === 'arm') {
      // zwei versetzte Stammreihen, außen höher und angespitzt
      for (let i = 0; i < 3; i++) {
        const x = sx * (0.085 + i * 0.165);
        const oh = top + 0.2 + hash1(i * 3.1 + 0.7) * 0.22;
        const ih = top + 0.02 + hash1(i * 5.3 + 1.9) * 0.1;
        b.cyl(0.085, 0.095, oh - 0.16, 6, x, 0, 0.17, i % 2 ? BP.wood : BP.woodDark);
        b.cone(0.085, 0.17, 6, x, oh - 0.16, 0.17, BP.woodLight);
        b.cyl(0.085, 0.095, ih, 6, x, 0, -0.17, i % 2 ? BP.woodDark : BP.wood);
      }
      b.surf(SURF.Plank).det(1);
      // Laufbohlen und Querbinder
      b.box(0.5, 0.05, T - 0.1, sx * 0.25, top - 0.05, 0, BP.woodLight);
      for (const y of [0.45, 1.05]) b.box(0.5, 0.06, 0.07, sx * 0.25, y, 0.245, BP.woodDark);
      b.surf(0).det(0);
    } else {
      b.det(0).surf(SURF.Log);
      const P = T + 0.1;
      b.box(P - 0.14, top, P - 0.14, 0, 0, 0, BP.woodDark);
      for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
        const hh = top + 0.12 + hash1(x * 7 + z * 3 + 2) * 0.18;
        b.cyl(0.11, 0.125, hh - (kind === 'stub' ? 0.5 : 0.0), 6, x, 0, z, BP.wood);
        if (kind === 'stub') b.cone(0.11, 0.5, 6, x, hh - 0.5, z, BP.woodLight);
        else b.cone(0.11, 0.2, 6, x, hh, z, BP.woodLight);
      }
      b.surf(SURF.Plank).box(P, 0.05, P, 0, top - 0.04, 0, BP.woodLight);
      b.surf(0);
    }
    return;
  }
  const body = h - 0.04;
  const stone = id === BT.WallHigh ? BP.stone : BP.stoneLight;
  if (kind === 'arm') {
    b.det(0).surf(SURF.Stone);
    b.box(0.5, body, T - 0.02, sx * 0.25, 0.1, 0, stone);
    // Sockel mit Anlauf
    b.box(0.5, 0.14, T + 0.1, sx * 0.25, 0, 0, BP.stoneDark);
    b.box(0.5, 0.05, T + 0.06, sx * 0.25, 0.14, 0, BP.stoneMid);
    // Mauerband unter dem Wehrgang
    b.box(0.5, 0.07, T + 0.07, sx * 0.25, body - 0.2, 0, BP.stoneMid);
    // Wehrgang
    b.box(0.5, 0.05, T + 0.02, sx * 0.25, body, 0, BP.stoneDark);
    // Brüstung und Zinnen beiden Seiten
    for (const z of [-1, 1]) {
      b.box(0.5, 0.1, 0.12, sx * 0.25, h, z * (T / 2 - 0.05), stone);
    }
    b.surf(0);
    if (id === BT.WallHigh) {
      slitOn(b, 0, sx * 0.25, h * 0.55, T / 2 + 0.01, 0.3);
      slitOn(b, 2, -sx * 0.25, h * 0.55, T / 2 + 0.01, 0.3);
    }
  } else {
    const P = T + 0.1;
    b.det(0).surf(SURF.Stone);
    b.box(P - 0.04, body, P - 0.04, 0, 0.1, 0, stone);
    b.box(P + 0.08, 0.14, P + 0.08, 0, 0, 0, BP.stoneDark);
    b.box(P + 0.06, 0.05, P + 0.06, 0, 0.14, 0, BP.stoneMid);
    b.box(P + 0.07, 0.07, P + 0.07, 0, body - 0.2, 0, BP.stoneMid);
    b.box(P + 0.03, 0.05, P + 0.03, 0, body, 0, BP.stoneDark);
    // Zinnen im gleichmäßigen Abstand 0,5 (Tile-Mitte ± 0,25), egal in welcher Richtung die Mauer läuft
    const o = 0.25;
    for (const [x, z] of [[-o, -o], [o, -o], [-o, o], [o, o]]) b.box(0.22, 0.34, 0.22, x, h, z, stone);
    if (kind === 'stub') b.pyramid(P * 0.7, 0.55, 0, h + 0.05, 0, BP.stoneDark);
    b.surf(0);
  }
}

/** Mauerstück für das Geisterbild: nur der Pfosten (die Arme zu den Nachbarn kennt erst die fertige Mauer) */
export function wallStraight(b: ModelBuilder, id: number, h: number): void {
  wallParts(b, id, h, 'post');
}

/** Treppe: vier Stufen, Höhe 1.0, steigt entlang +z; im Renderer in y auf Mauerhöhe skaliert */
export function stairs(b: ModelBuilder): void {
  b.surf(SURF.Stone).det(0);
  for (let i = 0; i < 4; i++) {
    b.box(0.9, 0.25 * (i + 1), 0.26, 0, 0, -0.375 + i * 0.25, i % 2 ? BP.stoneLight : BP.stone);
    b.box(0.1, 0.25 * (i + 1) + 0.08, 0.26, -0.45, 0, -0.375 + i * 0.25, BP.stoneMid);
    b.box(0.1, 0.25 * (i + 1) + 0.08, 0.26, 0.45, 0, -0.375 + i * 0.25, BP.stoneMid);
  }
  b.surf(0);
}

// -------------------------------------------------------------------------------------------- Bergfried

export function keep(b: ModelBuilder, W: number, H: number): void {
  const hw = W / 2 - 0.4;
  const hd = H / 2 - 0.4;
  void hd;
  const side = 4.2;
  // Sockel mit Anlauf
  plinth(b, side + 0.1, side + 0.1, 0, 0, 0.4, BP.stoneDark, 0.22);
  // Hauptkörper (Quader), Wehrgangskranz mit Konsolen darunter
  masonry(b, side, 3.7, side, 0, 0.4, 0, BP.stone);
  b.det(0).surf(SURF.Stone).box(side + 0.16, 0.22, side + 0.16, 0, 3.98, 0, BP.stoneMid);
  b.box(side + 0.3, 0.1, side + 0.3, 0, 4.2 - 0.1, 0, BP.stoneDark).surf(0);
  for (let f = 0; f < 4; f++) corbels(b, f, side - 1.0, 3.78, side / 2 + 0.08, BP.stoneDark, 7);
  // Brüstung mit Zinnen (Plattform liegt auf 4.2 = Laufhöhe)
  crenel(b, side + 0.3, side + 0.3, 4.2, BP.stoneLight, { step: 0.5, mh: 0.34 });
  // Strebepfeiler
  for (let f = 1; f < 4; f++) {
    const [x, z] = facePos(f, 0, side / 2 + 0.07);
    b.det(1).surf(SURF.Stone).box(0.34, 3.5, 0.2, x, 0.3, z, BP.stoneLight, false, FACE_ROT[f]);
    b.frustum(0.34, 0.2, 0.34, 0.1, 0.3, x, 3.8, z, BP.stoneMid, false, FACE_ROT[f]).surf(0).det(0);
  }
  // Eingang: Torbogen mit Fallgitter und Treppe
  const n = side / 2;
  doorOn(b, 0, 0, 0.4, n, 1.0, 1.35, { arch: true, frame: BP.stoneLight, leaf: BP.woodDark, step: true });
  b.det(1).surf(0);
  for (let i = -3; i <= 3; i++) b.box(0.035, 1.5, 0.03, i * 0.13, 0.45, n + 0.11, BP.iron);
  for (const y of [0.9, 1.4]) b.box(0.95, 0.04, 0.03, 0, y, n + 0.12, BP.iron);
  // Fackeln
  for (const sx of [-1, 1]) {
    b.box(0.04, 0.2, 0.04, sx * 0.78, 1.5, n + 0.08, BP.woodDark);
    b.cone(0.06, 0.12, 4, sx * 0.78, 1.7, n + 0.08, BP.gold);
  }
  // Rundfenster über dem Tor
  b.discZ(0.24, 0.05, 10, 0, 3.0, n + 0.02, BP.stoneLight);
  b.discZ(0.17, 0.06, 10, 0, 3.0, n + 0.03, BP.coal);
  b.det(0);
  // Banner in Spielerfarbe links und rechts des Tors
  banner(b, 0, -1.0, 3.7, n + 0.06, 0.5, 1.5);
  banner(b, 0, 1.0, 3.7, n + 0.06, 0.5, 1.5);
  // Fenster und Schießscharten der Seiten
  for (const f of [1, 2, 3]) {
    for (const u of [-0.75, 0.75]) windowOn(b, f, u, 2.1, n, 0.3, 0.62, { arch: true, frame: BP.stoneLight, shutters: false });
    for (const u of [-1.3, 1.3]) slitOn(b, f, u, 1.0, n, 0.4);
  }
  for (const u of [-1.3, 1.3]) slitOn(b, 0, u, 2.4, n, 0.4);
  // Eckmauertürme mit Kegeldach in Spielerfarbe
  const tc = side / 2 - 0.12;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      roundTower(b, { r: 0.66, h: 4.9, x: sx * tc, z: sz * tc, seg: 12, color: BP.stoneLight, roof: { color: BP.white, team: true, h: 1.5 }, slits: 3, slitFace: sx * sz > 0 ? 0.4 : 2.2 });
    }
  // Bergfried-Aufsatz mit Walmdach, Firstfahne und großer Flagge
  masonry(b, 2.3, 1.7, 2.3, 0, 4.32, 0, BP.stoneLight);
  b.det(1).surf(SURF.Stone).box(2.5, 0.12, 2.5, 0, 6.0, 0, BP.stoneMid).surf(0).det(0);
  hipRoof(b, { w: 2.3, d: 2.3, x: 0, z: 0, y: 6.1, rise: 1.15, color: BP.slate, over: 0.22, surf: SURF.Shingle });
  for (const f of [0, 1, 2, 3]) {
    windowOn(b, f, 0, 5.0, 1.15, 0.28, 0.5, { arch: true, frame: BP.stoneLight });
  }
  b.det(1).surf(0).cyl(0.04, 0.05, 1.9, 6, 0, 7.2, 0, BP.woodDark);
  b.sphere(0.07, 0, 9.12, 0, BP.gold);
  b.part(PART.Cloth, 0, 9.0, 0);
  b.poly([[0, 0], [0, 0.62], [0.35, 0.58], [1.05, 0.31], [0.35, 0.04]], 0.03, 0, 8.4, 0, BP.white, true, Math.PI / 2);
  b.part(0).det(0);
  // Wimpel auf den Turmspitzen
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pennant(b, sx * tc, 6.64, sz * tc, 0.5, 0.5, 0.2);
  void hw;
}

// ---------------------------------------------------------------------------------------------- Türme

export function towerLookout(b: ModelBuilder): void {
  // Höhe der Wehrgangskrone: 3.2
  plinth(b, 1.55, 1.55, 0, 0, 0.3, BP.stoneDark, 0.14);
  masonry(b, 1.55, 2.5, 1.55, 0, 0.3, 0, BP.stone);
  b.det(0).surf(SURF.Stone).box(1.58, 0.07, 1.58, 0, 1.5, 0, BP.stoneMid).surf(0);
  // vorkragende Wehrplatte
  b.det(0).surf(SURF.Stone).box(1.92, 0.28, 1.92, 0, 2.82, 0, BP.stoneMid);
  b.box(1.96, 0.1, 1.96, 0, 3.1, 0, BP.stoneDark).surf(0);
  for (let f = 0; f < 4; f++) corbels(b, f, 1.6, 2.64, 0.86, BP.stoneDark, 4);
  crenel(b, 1.96, 1.96, 3.2, BP.stoneLight, { step: 0.5, mh: 0.32, t: 0.14 });
  doorOn(b, 0, 0, 0.3, 0.775, 0.38, 0.62, { arch: true, frame: BP.stoneLight, step: true });
  for (const f of [0, 1, 2, 3]) slitOn(b, f, f === 0 ? 0.45 : 0, 1.65, 0.775, 0.34);
  for (const f of [1, 2, 3]) slitOn(b, f, 0, 0.9, 0.775, 0.3);
  banner(b, 0, 0, 2.6, 0.82, 0.34, 0.95);
  // Pfahlaufsatz mit Wimpel an der Rückseite
  b.det(1).surf(0).box(0.09, 0.2, 0.09, 0.62, 3.2, -0.62, BP.woodDark);
  pennant(b, 0.62, 3.2, -0.62, 0.9, 0.5, 0.22);
  b.det(0);
}

export function towerGuard(b: ModelBuilder): void {
  // Wehrgangskrone auf 3.8
  plinth(b, 2.4, 2.4, 0, 0, 0.34, BP.stoneDark, 0.18);
  masonry(b, 2.4, 3.0, 2.4, 0, 0.34, 0, BP.stone);
  b.det(0).surf(SURF.Stone).box(2.44, 0.08, 2.44, 0, 1.7, 0, BP.stoneMid);
  b.box(2.82, 0.5, 2.82, 0, 3.24, 0, BP.stoneMid);
  b.box(2.9, 0.1, 2.9, 0, 3.7, 0, BP.stoneDark).surf(0);
  b.det(0).surf(SURF.Stone).box(2.6, 0.12, 2.6, 0, 3.12, 0, BP.stoneDark).surf(0);
  for (let f = 0; f < 4; f++) corbels(b, f, 2.3, 3.0, 1.2, BP.stoneDark, 6);
  crenel(b, 2.9, 2.9, 3.8, BP.stoneLight, { step: 0.5, mh: 0.34 });
  // Erker (Türmchen) an den vier Ecken, Kegeldach in Spielerfarbe
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.det(0).surf(SURF.Stone).cyl(0.2, 0.3, 0.4, 8, sx * 1.34, 3.1, sz * 1.34, BP.stoneMid);
      b.cyl(0.3, 0.3, 0.7, 8, sx * 1.34, 3.5, sz * 1.34, BP.stoneLight).surf(0);
      coneRoof(b, 0.4, 0.8, sx * 1.34, 4.18, sz * 1.34, BP.white, true, 8);
    }
  doorOn(b, 0, 0, 0.34, 1.2, 0.5, 0.85, { arch: true, frame: BP.stoneLight, step: true });
  for (const f of [0, 1, 2, 3]) {
    for (const u of [-0.6, 0.6]) slitOn(b, f, u, 2.0, 1.2, 0.42);
    windowOn(b, f, f === 0 ? 0 : 0, 2.35, 1.2, 0.26, 0.5, { arch: true, frame: BP.stoneLight });
  }
  for (const f of [1, 2, 3]) for (const u of [-0.6, 0.6]) slitOn(b, f, u, 1.0, 1.2, 0.36);
  banner(b, 0, 0.78, 3.5, 1.26, 0.4, 1.1);
  banner(b, 0, -0.78, 3.5, 1.26, 0.4, 1.1);
  b.det(1).surf(0);
  flag(b, 0, 3.92, 0, 1.2, 0.55, 0.3);
  b.det(0);
}

export function towerRound(b: ModelBuilder): void {
  // Krone auf 4.6, Radius 1.7 → 1.9 am Fuß
  b.det(0).surf(SURF.Stone);
  b.cyl(1.78, 1.98, 0.4, 14, 0, 0, 0, BP.stoneDark);
  b.cyl(1.7, 1.78, 3.6, 14, 0, 0.4, 0, BP.stone);
  b.cyl(1.76, 1.76, 0.1, 14, 0, 1.9, 0, BP.stoneMid);
  b.cyl(1.76, 1.7, 0.3, 14, 0, 3.55, 0, BP.stoneLight);
  // Konsolkranz und Wehrplatte
  b.cyl(2.1, 1.85, 0.5, 14, 0, 3.9, 0, BP.stoneMid);
  b.cyl(2.12, 2.1, 0.2, 14, 0, 4.4, 0, BP.stoneDark);
  b.surf(0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    b.det(1).surf(SURF.Stone).box(0.16, 0.26, 0.16, Math.cos(a) * 1.86, 3.64, Math.sin(a) * 1.86, BP.stoneDark, false, -a);
  }
  b.surf(0);
  roundCrenel(b, 2.1, 4.6, 0, 0, BP.stoneLight, 14, 0.36);
  // Geschützsockel in der Mitte
  b.det(1).surf(SURF.Stone).cyl(0.82, 0.9, 0.12, 10, 0, 4.6, 0, BP.stoneMid).surf(0).det(0);
  // Tor, Fenster, Scharten
  doorOn(b, 0, 0, 0.4, 1.75, 0.6, 1.0, { arch: true, frame: BP.stoneLight, step: true });
  for (const f of [0, 1, 2, 3]) for (const u of [-0.7, 0.7]) slitOn(b, f, u * (f === 0 ? 1.4 : 1), 2.5, 1.7 + 0.02, 0.5);
  for (const f of [1, 2, 3]) windowOn(b, f, 0, 3.0, 1.72, 0.3, 0.55, { arch: true, frame: BP.stoneLight });
  banner(b, 0, 1.0, 3.9, 1.95, 0.46, 1.5);
  banner(b, 0, -1.0, 3.9, 1.95, 0.46, 1.5);
  pennant(b, 0, 4.6, -1.55, 1.3, 0.8, 0.34);
}

/** Geschützmodelle, die auf dem Großen Turm sitzen (Ursprung auf der Plattform, Blick nach +z) */
export function turretModel(b: ModelBuilder, kind: 'ballista' | 'mangonel'): void {
  b.det(0).surf(0);
  if (kind === 'ballista') {
    b.cyl(0.26, 0.32, 0.16, 8, 0, 0, 0, BP.woodDark);
    b.cyl(0.1, 0.1, 0.3, 6, 0, 0.14, 0, BP.iron);
    b.box(0.2, 0.1, 1.25, 0, 0.42, 0.1, BP.wood);
    b.box(0.14, 0.04, 0.9, 0, 0.52, 0.2, BP.woodLight);
    b.box(0.5, 0.16, 0.22, 0, 0.36, -0.58, BP.woodDark);
    // Bogenarme und Sehne
    b.beam(-0.08, 0.5, 0.62, -0.78, 0.5, 0.36, 0.11, BP.wood);
    b.beam(0.08, 0.5, 0.62, 0.78, 0.5, 0.36, 0.11, BP.wood);
    b.cyl(0.13, 0.13, 0.26, 8, -0.22, 0.4, 0.6, BP.iron);
    b.cyl(0.13, 0.13, 0.26, 8, 0.22, 0.4, 0.6, BP.iron);
    b.beam(-0.78, 0.5, 0.36, 0.0, 0.52, -0.38, 0.025, BP.cloth);
    b.beam(0.78, 0.5, 0.36, 0.0, 0.52, -0.38, 0.025, BP.cloth);
    b.spike(0.05, 0.9, 0, 0.58, 0.2, BP.ironLight);
    b.box(0.5, 0.42, 0.05, 0, 0.5, 0.78, BP.white, true);
    b.surf(SURF.Plank).box(0.5, 0.04, 0.06, 0, 0.9, 0.78, BP.woodDark).surf(0);
    b.cyl(0.07, 0.07, 0.3, 6, 0.24, 0.5, -0.5, BP.woodDark);
  } else {
    b.box(1.1, 0.12, 1.3, 0, 0, 0, BP.woodDark);
    b.surf(SURF.Plank);
    for (const sx of [-1, 1]) {
      b.box(0.14, 0.7, 0.14, sx * 0.38, 0.12, 0.3, BP.wood);
      b.box(0.14, 0.7, 0.14, sx * 0.38, 0.12, -0.3, BP.wood);
      b.beam(sx * 0.38, 0.82, 0.3, sx * 0.38, 0.82, -0.3, 0.12, BP.woodDark);
    }
    b.surf(0);
    for (const [x, z] of [[-0.5, 0.52], [0.5, 0.52], [-0.5, -0.52], [0.5, -0.52]]) b.disc(0.13, 0.1, 8, x, 0.12, z, BP.woodDark);
    b.cyl(0.12, 0.12, 0.8, 8, 0, 0.78, 0, BP.clay);
    // Wurfarm mit Becher und Gegengewicht
    b.beam(0, 0.85, 0.75, 0, 1.3, -0.5, 0.1, BP.woodLight);
    b.box(0.34, 0.1, 0.3, 0, 0.72, 0.78, BP.woodDark);
    b.box(0.3, 0.2, 0.3, 0, 1.28, -0.58, BP.iron);
    b.boulder(0.14, 0.12, 0.14, 0, 0.8, 0.84, 5, BP.stone);
    b.box(0.3, 0.05, 0.6, 0.0, 0.55, -0.62, BP.woodDark);
    b.box(0.4, 0.34, 0.05, 0, 0.3, 0.62, BP.white, true);
  }
  b.det(0);
}

// -------------------------------------------------------------------------------------------------- Tore

export function gateWood(b: ModelBuilder, W: number, H: number): void {
  const d = H - 0.3;
  // zwei Torpfeiler-Türme aus Bohlen, oben Palisadenkranz
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.4);
    b.det(0).surf(SURF.Plank).box(0.8, 2.2, d, x, 0, 0, BP.woodDark);
    b.surf(SURF.Log);
    for (let i = 0; i < 4; i++) {
      for (const sz of [-1, 1]) {
        b.cyl(0.09, 0.1, 0.5 + (i % 2) * 0.12, 6, x - 0.3 + i * 0.2, 2.2, sz * (d / 2 - 0.1), BP.wood);
        b.cone(0.09, 0.16, 6, x - 0.3 + i * 0.2, 2.7 + (i % 2) * 0.12, sz * (d / 2 - 0.1), BP.woodLight);
      }
    }
    b.surf(0);
    // eiserne Beschläge
    b.det(1).box(0.84, 0.06, d + 0.04, x, 0.5, 0, BP.iron);
    b.box(0.84, 0.06, d + 0.04, x, 1.4, 0, BP.iron);
    b.det(0);
    for (const sz of [-1, 1]) b.det(1).box(0.12, 2.3, 0.12, x + sx * 0.36, 0, sz * (d / 2), BP.wood).det(0);
  }
  // Torbalken
  b.det(0).surf(SURF.Plank).box(W - 1.4 + 0.2, 0.42, d, 0, 1.78, 0, BP.wood).surf(0);
  b.det(1).box(W - 1.3, 0.1, d + 0.1, 0, 2.2, 0, BP.woodDark);
  // Wehrgang auf dem Balken: Palisadenbrüstung
  b.surf(SURF.Log);
  for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) {
    b.cyl(0.085, 0.09, 0.32, 6, -0.62 + i * 0.25, 2.2, sz * (d / 2 - 0.06), BP.wood);
    b.cone(0.085, 0.14, 6, -0.62 + i * 0.25, 2.52, sz * (d / 2 - 0.06), BP.woodLight);
  }
  b.surf(0).det(0);
  // Fallgatter / Torflügel (hebt sich)
  b.part(PART.Door, 0, 0, 0);
  b.surf(SURF.Plank).box(W - 1.4, 1.62, 0.1, 0, 0, 0, BP.wood).surf(0);
  b.det(1);
  for (const y of [0.3, 0.8, 1.3]) b.box(W - 1.4, 0.07, 0.13, 0, y, 0, BP.iron);
  for (const x of [-0.5, 0, 0.5]) b.box(0.06, 1.5, 0.13, x, 0.05, 0, BP.woodDark);
  b.part(0).det(0);
  // Spielerfarbe: Wimpel und Banner über dem Tor
  pennant(b, 0, 2.5, 0, 0.8, 0.55, 0.24);
  banner(b, 0, 0, 1.7, d / 2 + 0.07, 0.5, 0.45);
  banner(b, 2, 0, 1.7, d / 2 + 0.07, 0.5, 0.45);
}

export function gateStone(b: ModelBuilder, W: number, H: number): void {
  // Durchgang 1,4 breit mittig; die Türme (r 0,65) stehen links und rechts daneben, innerhalb des Footprints
  const pw = 1.4;
  const r = 0.66;
  const tx = pw / 2 + r;
  for (const sx of [-1, 1]) {
    b.det(0).surf(SURF.Stone);
    b.cyl(r + 0.03, r + 0.14, 0.35, 12, sx * tx, 0, 0, BP.stoneDark);
    b.cyl(r, r + 0.03, 2.95, 12, sx * tx, 0.35, 0, BP.stone);
    b.cyl(r + 0.05, r + 0.05, 0.09, 12, sx * tx, 1.8, 0, BP.stoneMid);
    b.cyl(r + 0.22, r + 0.02, 0.4, 12, sx * tx, 3.2, 0, BP.stoneMid);
    b.surf(0);
    roundCrenel(b, r + 0.2, 3.6, sx * tx, 0, BP.stoneLight, 8, 0.34);
    for (const f of [0, 1, 2, 3]) {
      const a = (f / 4) * Math.PI * 2 + 0.8;
      b.det(1).box(0.07, 0.4, 0.06, sx * tx + Math.cos(a) * (r + 0.005), 2.2, Math.sin(a) * (r + 0.005), BP.black, false, -a + Math.PI / 2).det(0);
    }
    pennant(b, sx * tx, 3.6, 0, 1.0, 0.6, 0.26);
  }
  // Torhaus-Brücke zwischen den Türmen (Wehrgang auf 3.6)
  const bw = 2 * tx;
  const d = H - 0.5;
  masonry(b, bw, 1.7, d, 0, 1.9, 0, BP.stone);
  b.det(0).surf(SURF.Stone).box(bw + 0.1, 0.12, d + 0.1, 0, 3.48, 0, BP.stoneMid).surf(0);
  crenel(b, bw + 0.1, d + 0.1, 3.6, BP.stoneLight, { step: 0.5, mh: 0.3 });
  // Kranz-Konsolen unter dem Wehrgang
  for (const f of [0, 2]) corbels(b, f, bw - 0.4, 3.28, d / 2 + 0.05, BP.stoneDark, 4);
  // Durchgang: dunkle Öffnung mit Bogen, Rahmen aus Werkstein, Pechnasen
  const n = d / 2;
  for (const f of [0, 2]) {
    const rot = FACE_ROT[f];
    const [x, z] = facePos(f, 0, n + 0.02);
    b.det(0).surf(0).box(pw, 1.9, 0.08, x, 0, z, BP.black, false, rot);
    b.arch(pw / 2, 0.08, x, 1.9, z, BP.black, false, rot, 8);
    const [fx, fz] = facePos(f, 0, n + 0.04);
    b.det(1).arch(pw / 2 + 0.14, 0.06, fx, 1.9, fz, BP.stoneLight, false, rot, 8);
    for (const sx of [-1, 1]) {
      const [px, pz] = facePos(f, sx * (pw / 2 + 0.08), n + 0.04);
      b.box(0.16, 1.9, 0.07, px, 0, pz, BP.stoneLight, false, rot);
    }
    const [mx, mz] = facePos(f, 0, n + 0.03);
    b.box(pw, 0.06, 0.05, mx, 3.0, mz, BP.black, false, rot);
    b.det(0);
    banner(b, f, 0, 3.4, n + 0.07, 0.42, 0.8);
  }
  // Fallgitter (hebt sich beim Öffnen)
  b.part(PART.Door, 0, 0, 0);
  b.det(0).surf(0);
  const gz = n + 0.1;
  for (let i = 0; i < 7; i++) b.box(0.06, 2.0, 0.07, -pw / 2 + 0.1 + i * ((pw - 0.2) / 6), 0, gz, BP.iron);
  for (const y of [0.4, 1.0, 1.6]) b.box(pw, 0.07, 0.09, 0, y, gz, BP.iron);
  for (let i = 0; i < 7; i++) b.cyl(0.04, 0, 0.12, 4, -pw / 2 + 0.1 + i * ((pw - 0.2) / 6), 0.0, gz, BP.ironLight);
  b.part(0).det(0);
  void W;
}

export function drawbridge(b: ModelBuilder, W: number, H: number): void {
  const w = W - 0.5;
  b.det(0).surf(SURF.Plank);
  for (let i = 0; i < 12; i++) b.box(w, 0.1, (H - 0.3) / 12 - 0.015, 0, 0.05 + (i % 2) * 0.012, -H / 2 + 0.2 + (i + 0.5) * ((H - 0.3) / 12), i % 3 ? BP.wood : BP.woodDark);
  b.surf(0);
  for (const sx of [-1, 1]) {
    b.det(0).box(0.14, 0.16, H - 0.2, sx * (w / 2 - 0.05), 0, 0, BP.woodDark);
    for (let i = 0; i < 5; i++) {
      b.det(1).box(0.07, 0.5, 0.07, sx * (w / 2 - 0.05), 0.12, -H / 2 + 0.3 + i * ((H - 0.6) / 4), BP.wood);
    }
    b.det(1).box(0.07, 0.06, H - 0.4, sx * (w / 2 - 0.05), 0.55, 0, BP.woodDark);
    // Kettenpfosten an der Stirnseite und Ketten
    b.det(0).box(0.14, 1.2, 0.14, sx * (w / 2 - 0.08), 0.1, -H / 2 + 0.16, BP.woodDark);
    b.det(1).beam(sx * (w / 2 - 0.08), 1.2, -H / 2 + 0.16, sx * (w / 2 - 0.08), 0.15, 0.4, 0.04, BP.iron);
    b.sphere(0.07, sx * (w / 2 - 0.08), 1.32, -H / 2 + 0.16, BP.iron);
  }
  b.det(1).box(w, 0.1, 0.16, 0, 0.1, H / 2 - 0.1, BP.stoneMid);
  b.det(0);
}

export function cauldron(b: ModelBuilder): void {
  wallParts(b, BT.WallLow, 1.5, 'post');
  b.det(0).surf(0);
  // Feuerstelle und Gestell
  b.box(0.52, 0.14, 0.52, 0, 1.56, 0, BP.stoneDark);
  b.cone(0.13, 0.22, 5, 0, 1.7, 0, BP.gold);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [0, 0.22]]) b.beam(x, 1.6, z, 0, 2.2, 0, 0.045, BP.iron);
  // Kessel mit heißem Öl und Ausguss
  b.cyl(0.36, 0.26, 0.32, 9, 0, 1.78, 0, BP.black);
  b.cyl(0.4, 0.4, 0.05, 9, 0, 2.08, 0, BP.stoneDark);
  b.cyl(0.3, 0.3, 0.02, 9, 0, 2.11, 0, BP.gold);
  b.box(0.12, 0.08, 0.36, 0, 2.0, 0.42, BP.iron);
  b.beam(-0.4, 2.1, 0, 0.4, 2.1, 0, 0.04, BP.iron);
  b.det(1);
  b.box(0.06, 0.34, 0.06, 0.28, 1.6, 0.28, BP.woodDark);
  barrel(b, -0.2, 0.3, 1.5, BP.woodDark);
  b.det(0);
}

// ------------------------------------------------------------------------------------- Militärgebäude

export function barracks(b: ModelBuilder, W: number, H: number): void {
  const zf = H / 2 - 0.35;
  // Halle im Hintergrund
  plinth(b, 3.5, 2.0, 0, -0.85, 0.22, BP.stoneDark, 0.08);
  masonry(b, 3.5, 1.7, 2.0, 0, 0.22, -0.85, BP.stone);
  gableRoof(b, { w: 3.5, d: 2.0, x: 0, z: -0.85, y: 1.92, rise: 0.85, color: BP.slate, surf: SURF.Shingle, over: 0.12, rotY: 0, ridge: BP.white, ridgeTeam: true });
  chimney(b, 1.1, 2.3, -1.2, 1.0, 0.3);
  for (const u of [-1.1, 0, 1.1]) windowOn(b, 2, u, 1.0, 1.85, 0.26, 0.5, { arch: true, frame: BP.stoneLight });
  for (const f of [1, 3]) windowOn(b, f, f === 1 ? 0.85 : -0.85, 1.0, 1.75, 0.26, 0.5, { arch: true, frame: BP.stoneLight });
  // Torhaus-Flügel vorn mit Zinnen und Tor
  masonry(b, 1.5, 1.7, 0.7, 0, 0.0, zf, BP.stone);
  b.det(0).surf(SURF.Stone).box(1.6, 0.14, 0.8, 0, 1.55, zf, BP.stoneMid).surf(0);
  crenel(b, 1.6, 0.8, 1.7, BP.stoneLight, { x: 0, z: zf, step: 0.4, mh: 0.26, t: 0.13 });
  doorOn(b, 0, 0, 0, zf + 0.35, 0.8, 1.1, { arch: true, frame: BP.stoneLight, leaf: BP.woodDark, step: true });
  banner(b, 0, 0, 1.55, zf + 0.4, 0.4, 0.7);
  // Flankentürme mit Spielerfarbe
  for (const sx of [-1, 1]) {
    const x = sx * 1.55;
    masonry(b, 0.95, 2.35, 0.95, x, 0, zf, BP.stoneLight);
    b.det(0).surf(SURF.Stone).box(1.1, 0.14, 1.1, x, 2.2, zf, BP.stoneMid).surf(0);
    hipRoof(b, { w: 1.0, d: 1.0, x, z: zf, y: 2.34, rise: 0.8, color: BP.white, team: true, over: 0.15, ridgeLen: 0 });
    for (const f of [0, 1, 3]) {
      const [u0, n0] = faceOff(f, x, zf);
      slitOn(b, f, u0, 1.3, n0 + 0.475, 0.4);
    }
    {
      const [u0, n0] = faceOff(0, x, zf);
      windowOn(b, 0, u0, 0.5, n0 + 0.475, 0.22, 0.4, { frame: BP.stoneLight });
    }
  }
  // Übungsplatz: Zielpuppen, Waffenständer, Fass
  for (const x of [-0.5, 0.5]) {
    b.det(1).surf(0).box(0.08, 0.7, 0.08, x, 0, 0.1, BP.woodDark);
    b.box(0.4, 0.07, 0.07, x, 0.5, 0.1, BP.woodDark);
    b.cyl(0.14, 0.15, 0.3, 6, x, 0.32, 0.1, BP.hay);
    b.sphere(0.1, x, 0.74, 0.1, BP.hay);
  }
  // Waffenständer
  b.det(1).box(0.9, 0.05, 0.12, 1.1, 0.0, 0.25, BP.woodDark);
  for (let i = 0; i < 4; i++) b.beam(0.75 + i * 0.16, 0.05, 0.25, 0.75 + i * 0.16 + 0.04, 0.8, 0.25, 0.03, i % 2 ? BP.ironLight : BP.wood);
  barrel(b, -1.2, 0.2);
  slab(b, W - 0.5, 1.5, 0, 0.25, BP.stoneMid, 0.03, 0, SURF.Flag);
  b.det(0);
}

export function mercPost(b: ModelBuilder, W: number, H: number): void {
  void W;
  void H;
  // Großes Zelt: Rundbau mit gestreiftem Kegeldach
  b.det(0).surf(SURF.Plaster).cyl(1.05, 1.1, 0.7, 10, -0.1, 0, -0.1, BP.plaster).surf(0);
  b.det(0).surf(0).cone(1.35, 1.1, 10, -0.1, 0.7, -0.1, BP.white, true);
  b.cone(1.2, 0.95, 10, -0.1, 0.72, -0.1, BP.ochre);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.det(1).beam(-0.1 + Math.cos(a) * 1.1, 0.74, -0.1 + Math.sin(a) * 1.1, -0.1, 1.78, -0.1, 0.04, BP.white, true);
  }
  b.det(1).cyl(0.03, 0.04, 0.5, 5, -0.1, 1.8, -0.1, BP.woodDark);
  b.disc(0.1, 0.02, 8, -0.1, 2.35, -0.1, BP.gold);
  // Eingang
  b.det(1).box(0.55, 0.62, 0.05, -0.1, 0, 0.98, BP.black);
  b.box(0.7, 0.1, 0.1, -0.1, 0.62, 0.98, BP.clothDark);
  // Kleines Zelt
  b.det(0).cyl(0.5, 0.52, 0.4, 7, 1.05, 0, 0.9, BP.clothDark);
  b.cone(0.62, 0.7, 7, 1.05, 0.4, 0.9, BP.terracotta);
  // Fahnenstange mit Halbmond und Spielerwimpel
  b.det(1).box(0.07, 2.4, 0.07, 1.2, 0, -0.85, BP.woodDark);
  b.disc(0.17, 0.04, 10, 1.2, 2.42, -0.85, BP.gold);
  b.disc(0.14, 0.05, 10, 1.26, 2.45, -0.85, BP.plaster);
  b.part(PART.Cloth, 1.2, 2.2, -0.85);
  b.poly([[0, 0], [0, 0.4], [0.7, 0.2]], 0.03, 1.2, 1.78, -0.85, BP.white, true, Math.PI / 2);
  b.part(0).det(1);
  // Teppiche, Kissen, Waffenständer
  b.box(1.2, 0.025, 0.7, -0.1, 0, 1.25, BP.terracottaDark);
  b.box(1.0, 0.03, 0.5, -0.1, 0.025, 1.25, BP.gold);
  for (const x of [-0.5, 0.2]) b.box(0.28, 0.1, 0.2, x, 0.04, 1.2, BP.copper);
  b.box(0.6, 0.05, 0.1, -1.1, 0, 0.8, BP.woodDark);
  for (let i = 0; i < 3; i++) b.beam(-1.3 + i * 0.18, 0.05, 0.8, -1.2 + i * 0.18, 0.75, 0.8, 0.035, BP.ironLight);
  barrel(b, -1.15, -0.8);
  b.det(0);
}

export function stable(b: ModelBuilder, W: number, H: number): void {
  const hw = W - 0.5;
  const hd = H - 0.9;
  b.det(0).surf(SURF.Stone).box(hw + 0.1, 0.2, hd + 0.1, 0, 0, -0.1, BP.stoneDark).surf(SURF.Plank);
  b.box(hw, 1.0, hd, 0, 0.2, -0.1, BP.wood).surf(0);
  gableRoof(b, { w: hw, d: hd, x: 0, z: -0.1, y: 1.2, rise: 0.85, color: BP.thatch, surf: SURF.Thatch, over: 0.2, ridge: BP.white, ridgeTeam: true });
  // offene Boxen an der Front
  const zf = hd / 2 - 0.1 + 0.02;
  for (let i = 0; i < 4; i++) {
    const x = -hw / 2 + (i + 0.5) * (hw / 4);
    b.det(1).box(0.52, 0.55, 0.05, x, 0.28, zf, BP.black);
    b.box(0.5, 0.26, 0.05, x, 0.2, zf + 0.04, BP.woodLight);
    if (i % 2 === 0) {
      // Pferdekopf, schaut aus der Box
      b.box(0.14, 0.2, 0.3, x, 0.55, zf + 0.12, BP.clay);
      b.box(0.1, 0.1, 0.16, x, 0.52, zf + 0.34, BP.clay);
      b.box(0.04, 0.1, 0.04, x - 0.04, 0.73, zf + 0.1, BP.clay);
      b.box(0.04, 0.1, 0.04, x + 0.04, 0.73, zf + 0.1, BP.clay);
    }
  }
  // Heuboden-Luke und Hebebalken
  b.det(1).box(0.4, 0.34, 0.05, -hw / 4, 1.28, hd / 2 - 0.1, BP.black);
  b.box(0.6, 0.06, 0.6, -hw / 4, 1.3, hd / 2 + 0.2, BP.woodDark);
  b.beam(-hw / 4, 1.78, hd / 2 - 0.1, -hw / 4, 1.78, hd / 2 + 0.36, 0.07, BP.woodDark);
  // Trog, Haltebalken, Heu
  b.box(0.7, 0.14, 0.25, hw / 2 - 0.5, 0.0, zf + 0.7, BP.woodDark);
  b.box(0.06, 0.45, 0.06, -hw / 2 + 0.3, 0, zf + 0.7, BP.woodDark);
  b.box(0.06, 0.45, 0.06, hw / 2 - 0.3, 0, zf + 0.9, BP.woodDark);
  b.beam(-hw / 2 + 0.3, 0.38, zf + 0.7, hw / 2 - 0.3, 0.38, zf + 0.9, 0.04, BP.wood);
  haystack(b, hw / 2 - 0.5, -hd / 2 - 0.1, 0.34);
  banner(b, 0, hw / 4, 1.1, zf + 0.12, 0.3, 0.5);
  b.det(0);
}

export function engineerGuild(b: ModelBuilder, W: number, H: number): void {
  const hw = W - 0.9;
  const hd = H - 0.8;
  plinth(b, hw, hd, -0.2, -0.1, 0.4, BP.stoneDark, 0.08);
  masonry(b, hw, 0.9, hd, -0.2, 0.4, -0.1, BP.stone);
  b.det(0).surf(SURF.Plank).box(hw, 0.7, hd, -0.2, 1.3, -0.1, BP.wood).surf(0);
  gableRoof(b, { w: hw, d: hd, x: -0.2, z: -0.1, y: 2.0, rise: 0.8, color: BP.slate, surf: SURF.Shingle, over: 0.15, ridge: BP.white, ridgeTeam: true });
  chimney(b, -0.9, 2.3, -0.7, 1.0, 0.32);
  // Werkstatttor, Fenster, Schild mit Zahnrad
  doorOn(b, 0, -0.2, 0.4, hd / 2 - 0.1 + 0.0, 0.9, 1.0, { arch: false, frame: BP.woodDark, step: true });
  for (const u of [-1.1, 0.7]) windowOn(b, 0, u - 0.2, 0.75, hd / 2 - 0.1, 0.26, 0.4, { frame: BP.woodDark, shutters: true });
  b.det(1).surf(0).box(0.04, 0.5, 0.04, 0.95, 1.4, hd / 2 - 0.05, BP.woodDark);
  b.discZ(0.22, 0.04, 8, 0.95, 1.2, hd / 2 + 0.16, BP.white, true);
  b.discZ(0.12, 0.05, 8, 0.95, 1.2, hd / 2 + 0.18, BP.coal);
  // Kran mit Seilzug und Steinblock
  const cx = W / 2 - 0.45;
  b.det(0).box(0.16, 2.2, 0.16, cx, 0, H / 2 - 0.4, BP.woodDark);
  b.box(0.16, 0.14, 0.16, cx, 2.2, H / 2 - 0.4, BP.wood);
  b.beam(cx, 2.1, H / 2 - 0.4, cx - 1.1, 2.5, H / 2 - 0.4, 0.12, BP.wood);
  b.beam(cx, 1.5, H / 2 - 0.4, cx - 0.7, 2.3, H / 2 - 0.4, 0.07, BP.woodDark);
  b.det(1).beam(cx - 1.05, 2.5, H / 2 - 0.4, cx - 1.05, 1.15, H / 2 - 0.4, 0.025, BP.cloth);
  masonry(b, 0.34, 0.26, 0.34, cx - 1.05, 0.86, H / 2 - 0.4, BP.stoneLight);
  // Zahnräder und Holz
  for (const [x, y] of [[-W / 2 + 0.2, 0.9], [-W / 2 + 0.2, 1.4]]) b.disc(0.22, 0.06, 8, x, y, -H / 2 + 0.9, BP.iron);
  plankPile(b, -W / 2 + 0.55, H / 2 - 0.45, 0.8, 0.3, 4, 0, 0.2);
  // Ausstellungsstück: kleine Balliste
  b.box(0.5, 0.08, 0.3, W / 2 - 0.7, 0, -H / 2 + 0.35, BP.woodDark);
  b.beam(W / 2 - 0.95, 0.2, -H / 2 + 0.35, W / 2 - 0.45, 0.2, -H / 2 + 0.35, 0.07, BP.wood);
  b.det(0);
}

export function dungeon(b: ModelBuilder, W: number, H: number): void {
  const w = W - 0.3;
  const d = H - 0.3;
  plinth(b, w, d, 0, 0, 0.3, BP.stoneDeep, 0.1);
  masonry(b, w, 1.0, d, 0, 0.3, 0, BP.stoneDark);
  b.det(0).surf(SURF.Stone).box(w + 0.14, 0.12, d + 0.14, 0, 1.2, 0, BP.stoneDeep).surf(0);
  crenel(b, w + 0.14, d + 0.14, 1.32, BP.stoneMid, { step: 0.5, mh: 0.28 });
  doorOn(b, 0, 0, 0.3, d / 2, 0.7, 0.8, { arch: true, frame: BP.stoneMid, leaf: BP.iron, step: true });
  // vergitterte Fenster
  for (const [f, u] of [[0, -0.9], [0, 0.95], [1, 0], [3, 0], [2, -0.6], [2, 0.6]] as [number, number][]) {
    const n = (f & 1 ? w : d) / 2;
    windowOn(b, f, u, 0.75, n, 0.26, 0.3, { arch: false, frame: BP.stoneMid, sill: false });
    const [x, z] = facePos(f, u, n + 0.05);
    for (const k of [-0.07, 0, 0.07]) {
      const [bx, bz] = facePos(f, u + k, n + 0.05);
      b.det(1).box(0.025, 0.34, 0.025, bx, 0.72, bz, BP.iron);
    }
    void x;
    void z;
  }
  // Ketten und Fackel
  b.det(1).beam(0.5, 0.95, d / 2 + 0.06, 0.62, 0.45, d / 2 + 0.06, 0.03, BP.ironLight);
  b.beam(-0.5, 0.95, d / 2 + 0.06, -0.62, 0.45, d / 2 + 0.06, 0.03, BP.ironLight);
  b.det(0);
}

// ------------------------------------------------------------------------------------------- Fallen

export function pit(b: ModelBuilder): void {
  b.det(0).surf(SURF.Ground).box(0.96, 0.07, 0.96, 0, 0, 0, BP.soilDark).surf(0);
  b.box(0.62, 0.04, 0.62, 0, 0.07, 0, BP.black);
  b.det(1);
  for (const [x, z, a] of [[-0.3, -0.3, 0.2], [0.3, -0.3, -0.2], [0.0, 0.32, 0.1], [0.32, 0.25, 0.3]] as [number, number, number][]) b.spike(0.05, 0.3, x, 0.04, z, BP.woodLight);
  b.beam(-0.4, 0.09, 0.2, 0.0, 0.12, -0.4, 0.07, BP.woodDark);
  b.det(0);
}

export function killingPit(b: ModelBuilder): void {
  b.det(0).surf(SURF.Ground).box(0.97, 0.07, 0.97, 0, 0, 0, BP.soilDark).surf(0);
  b.box(0.66, 0.05, 0.66, 0, 0.07, 0, BP.black);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.det(1).pyramid(0.06, 0.36, -0.26 + i * 0.26, 0.05, -0.26 + j * 0.26, BP.ironLight);
  b.det(1).box(0.96, 0.05, 0.06, 0, 0.07, -0.42, BP.terracotta).box(0.96, 0.05, 0.06, 0, 0.07, 0.42, BP.terracotta);
  b.det(0);
}

export function pitchDitch(b: ModelBuilder): void {
  b.det(0).surf(SURF.Ground).box(0.97, 0.06, 0.97, 0, 0, 0, BP.soilDark).surf(0);
  b.box(0.7, 0.05, 0.8, 0, 0.05, 0, BP.pitch);
  b.det(1).box(0.9, 0.05, 0.07, 0, 0.06, -0.44, BP.woodDark).box(0.9, 0.05, 0.07, 0, 0.06, 0.44, BP.woodDark);
  b.sphere(0.07, -0.12, 0.1, 0.1, BP.coal).sphere(0.05, 0.18, 0.09, -0.15, BP.coal);
  b.det(0);
}

/** Alle Gebäude dieser Datei, die ein Haus-Gerüst nutzen, brauchen `house`; Import hält die Abhängigkeit sichtbar */
export const CASTLE_USES = { house, anvil, crate, ladder, lancet, logPile, sack, shedRoof, stonePile };
