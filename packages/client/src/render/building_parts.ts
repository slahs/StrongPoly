import type { ModelBuilder } from './builder';
import { BP, SURF } from './building_palette';
import { PART } from './materials';

/**
 * Bauteile für die Gebäudemodelle: Dächer, Türen, Fenster, Schlote, Zinnen, Türme, Fahnen, Requisiten.
 * Konvention: Gebäudefront zeigt nach +z; Seiten werden über `face` (0 = +z, 1 = +x, 2 = -z, 3 = -x) angesprochen.
 * In Seitenkoordinaten ist `u` die Position entlang der Seite (von außen gesehen nach rechts) und `n` der Abstand
 * von der Mittellinie nach außen. Detailstufen: det(0) Grundform, det(1) Mittelform, det(2) Feindetail.
 */
export const FACE_ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** Weltposition (x, z) aus Seitenkoordinaten */
export function facePos(face: number, u: number, n: number): [number, number] {
  switch (face & 3) {
    case 0:
      return [u, n];
    case 1:
      return [n, -u];
    case 2:
      return [-u, -n];
    default:
      return [-n, u];
  }
}

/** Mittelpunkt (cx, cz) eines Bauteils in Seitenkoordinaten: [u0, n0] (Addieren zu lokalem u bzw. zur halben Tiefe) */
export function faceOff(face: number, cx: number, cz: number): [number, number] {
  switch (face & 3) {
    case 0:
      return [cx, cz];
    case 1:
      return [-cz, cx];
    case 2:
      return [-cx, -cz];
    default:
      return [cz, -cx];
  }
}

// ---------------------------------------------------------------------------------------------- Mauerwerk

/** Quaderwand/-block mit Lagerfugen */
export function masonry(b: ModelBuilder, w: number, h: number, d: number, x: number, y: number, z: number, color: number = BP.stone, rotY = 0): void {
  b.surf(SURF.Stone).box(w, h, d, x, y, z, color, false, rotY).surf(0);
}

/** Sockel mit leichtem Anlauf */
export function plinth(b: ModelBuilder, w: number, d: number, x: number, z: number, h = 0.2, color: number = BP.stoneDark, grow = 0.1): void {
  b.surf(SURF.Stone).frustum(w + grow * 2, d + grow * 2, w, d, h, x, 0, z, color).surf(0);
}

/** Zinnenkranz auf rechteckiger Krone (Brüstung mit Zinnen, außen bündig). Krone liegt bei y. */
export function crenel(b: ModelBuilder, w: number, d: number, y: number, color: number = BP.stone, opts: { step?: number; mh?: number; t?: number; x?: number; z?: number; parapet?: number } = {}): void {
  const step = opts.step ?? 0.5;
  const mh = opts.mh ?? 0.3;
  const t = opts.t ?? 0.16;
  const ox = opts.x ?? 0;
  const oz = opts.z ?? 0;
  const par = opts.parapet ?? 0.12;
  b.surf(SURF.Stone);
  // niedrige Brüstung rundum, darauf die Zinnen
  b.box(w, par, t, ox, y, oz - d / 2 + t / 2, color);
  b.box(w, par, t, ox, y, oz + d / 2 - t / 2, color);
  b.box(t, par, d - 2 * t, ox - w / 2 + t / 2, y, oz, color);
  b.box(t, par, d - 2 * t, ox + w / 2 - t / 2, y, oz, color);
  const nx = Math.max(2, Math.round(w / step));
  const nz = Math.max(2, Math.round(d / step));
  const mw = (w / nx) * 0.56;
  for (let i = 0; i < nx; i++) {
    const x = ox - w / 2 + (i + 0.5) * (w / nx);
    b.box(mw, mh, t, x, y + par, oz - d / 2 + t / 2, color);
    b.box(mw, mh, t, x, y + par, oz + d / 2 - t / 2, color);
  }
  for (let j = 1; j < nz - 1; j++) {
    const z = oz - d / 2 + (j + 0.5) * (d / nz);
    b.box(t, mh, (d / nz) * 0.56, ox - w / 2 + t / 2, y + par, z, color);
    b.box(t, mh, (d / nz) * 0.56, ox + w / 2 - t / 2, y + par, z, color);
  }
  b.surf(0);
}

/** Zinnenkranz auf runder Krone */
export function roundCrenel(b: ModelBuilder, r: number, y: number, x: number, z: number, color: number = BP.stone, n = 8, mh = 0.3): void {
  b.surf(SURF.Stone);
  b.cyl(r, r, 0.12, 12, x, y, z, color);
  const mw = ((Math.PI * 2 * r) / n) * 0.52;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.box(mw, mh, 0.16, x + Math.cos(a) * (r - 0.08), y + 0.12, z + Math.sin(a) * (r - 0.08), color, false, -a + Math.PI / 2);
  }
  b.surf(0);
}

/** Auskragung unter einer Krone (Konsolen/Machikulis) an einer Seite */
export function corbels(b: ModelBuilder, face: number, len: number, y: number, n: number, color: number = BP.stoneDark, count = 0): void {
  const c = count || Math.max(2, Math.round(len / 0.45));
  b.surf(SURF.Stone);
  for (let i = 0; i < c; i++) {
    const u = -len / 2 + (i + 0.5) * (len / c);
    const [x, z] = facePos(face, u, n);
    b.box(0.16, 0.18, 0.16, x, y, z, color, false, FACE_ROT[face]);
  }
  b.surf(0);
}

// ----------------------------------------------------------------------------------------------- Dächer

export interface RoofOpts {
  w: number;
  d: number;
  x?: number;
  y: number;
  z?: number;
  rise: number;
  color: number;
  surf?: number;
  over?: number;
  rotY?: number;
  team?: boolean;
  /** Firstbalken in Dunkelholz/Spielerfarbe */
  ridge?: number | false;
  ridgeTeam?: boolean;
  /** Traufblende (Holz) unter dem Dachrand */
  fascia?: number | false;
}

/** Satteldach über Grundriss w (x) × d (z), First entlang z; mit Überstand, Firstbalken und Traufblende */
export function gableRoof(b: ModelBuilder, o: RoofOpts): void {
  const over = o.over ?? 0.12;
  const x = o.x ?? 0;
  const z = o.z ?? 0;
  const rot = o.rotY ?? 0;
  b.surf(o.surf ?? SURF.Tile).det(0);
  b.roof(o.w + over * 2, o.rise, o.d + over * 2, x, o.y, z, o.color, !!o.team, rot);
  b.surf(0);
  if (o.ridge !== false) {
    const rc = o.ridge ?? BP.woodDark;
    // Firstbalken: entlang der Firstrichtung (z), bei Drehung mitdrehen
    b.det(1).box(0.1, 0.07, o.d + over * 2 + 0.04, x, o.y + o.rise - 0.03, z, rc, !!o.ridgeTeam, rot);
  }
  if (o.fascia !== false) {
    const fc = o.fascia ?? BP.woodDark;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const hw = o.w / 2 + over;
    for (const sx of [-1, 1]) {
      // Traufblende: dünner Balken entlang der Firstrichtung an beiden Dachkanten
      const lx = sx * hw;
      b.det(1).box(0.05, 0.07, o.d + over * 2, x + lx * c, o.y - 0.01, z - lx * s, fc, false, rot);
    }
  }
  b.det(0);
}

/** Walmdach */
export function hipRoof(b: ModelBuilder, o: RoofOpts & { ridgeLen?: number }): void {
  const over = o.over ?? 0.12;
  b.surf(o.surf ?? SURF.Tile).det(0);
  b.hip(o.w + over * 2, o.rise, o.d + over * 2, o.x ?? 0, o.y, o.z ?? 0, o.color, !!o.team, o.rotY ?? 0, o.ridgeLen ?? -1);
  b.surf(0);
}

/** Pultdach: hoch hinten (-z), niedrig vorn (+z) */
export function shedRoof(b: ModelBuilder, o: RoofOpts & { low?: number }): void {
  const over = o.over ?? 0.1;
  b.surf(o.surf ?? SURF.Shingle).det(0);
  b.shed(o.w + over * 2, o.rise, o.d + over * 2, o.x ?? 0, o.y, o.z ?? 0, o.color, !!o.team, o.rotY ?? 0, o.low ?? 0.1);
  b.surf(0);
}

/** Kegeldach mit Spitze */
export function coneRoof(b: ModelBuilder, r: number, h: number, x: number, y: number, z: number, color: number, team = false, seg = 10, surf: number = SURF.Tile): void {
  b.surf(surf).det(0).cone(r, h, seg, x, y, z, color, team).surf(0);
}

// ----------------------------------------------------------------------------------- Türen und Fenster

export interface DoorOpts {
  arch?: boolean;
  frame?: number;
  leaf?: number;
  /** Tür steht offen/dunkle Öffnung */
  open?: boolean;
  step?: boolean;
}

/** Tür in Seite `face` an Position u, Fußhöhe y, Wandabstand n (Außenfläche der Wand) */
export function doorOn(b: ModelBuilder, face: number, u: number, y: number, n: number, w: number, h: number, o: DoorOpts = {}): void {
  const r = FACE_ROT[face];
  const frame = o.frame ?? BP.woodDark;
  const leaf = o.leaf ?? BP.wood;
  const at = (uu: number, nn: number): [number, number] => facePos(face, u + uu, n + nn);
  b.det(0);
  // dunkle Öffnung
  let [x, z] = at(0, 0.02);
  b.surf(0).box(w, h, 0.05, x, y, z, BP.black, false, r);
  if (o.arch) {
    [x, z] = at(0, 0.02);
    b.arch(w / 2, 0.05, x, y + h, z, BP.black, false, r);
  }
  // Türblatt (Bretter) leicht eingerückt
  [x, z] = at(0, 0.045);
  b.surf(SURF.Plank).box(w * 0.82, h * 0.96, 0.03, x, y, z, leaf, false, r);
  if (o.arch) {
    [x, z] = at(0, 0.045);
    b.arch((w * 0.82) / 2, 0.03, x, y + h * 0.96, z, leaf, false, r);
  }
  b.surf(0);
  // Rahmen
  b.det(1);
  for (const sx of [-1, 1]) {
    [x, z] = at(sx * (w / 2 + 0.035), 0.03);
    b.box(0.07, h + (o.arch ? w / 2 : 0.05), 0.08, x, y, z, frame, false, r);
  }
  if (!o.arch) {
    [x, z] = at(0, 0.03);
    b.box(w + 0.18, 0.08, 0.1, x, y + h, z, frame, false, r);
  } else {
    [x, z] = at(0, 0.03);
    b.arch(w / 2 + 0.07, 0.07, x, y + h, z, frame, false, r);
    // Schlussstein-Gefühl: Ring über dem Bogen nicht gefüllt, Türblatt liegt davor
    [x, z] = at(0, 0.05);
    b.arch(w / 2 + 0.0, 0.05, x, y + h, z, BP.black, false, r);
  }
  // Eisenbänder
  b.det(2);
  for (const k of [0.3, 0.72]) {
    [x, z] = at(0, 0.065);
    b.box(w * 0.78, 0.05, 0.015, x, y + h * k, z, BP.iron, false, r);
  }
  [x, z] = at(w * 0.28, 0.07);
  b.box(0.05, 0.05, 0.02, x, y + h * 0.5, z, BP.ironLight, false, r);
  if (o.step) {
    [x, z] = at(0, 0.18);
    b.det(1).box(w + 0.3, 0.07, 0.4, x, 0, z, BP.stoneMid, false, r);
  }
  b.det(0).surf(0);
}

export interface WindowOpts {
  shutters?: boolean;
  arch?: boolean;
  frame?: number;
  glow?: boolean;
  sill?: boolean;
}

/** Fenster in Seite `face` */
export function windowOn(b: ModelBuilder, face: number, u: number, y: number, n: number, w: number, h: number, o: WindowOpts = {}): void {
  const r = FACE_ROT[face];
  const frame = o.frame ?? BP.woodDark;
  const at = (uu: number, nn: number): [number, number] => facePos(face, u + uu, n + nn);
  b.det(1).surf(0);
  let [x, z] = at(0, 0.015);
  b.box(w, h, 0.04, x, y, z, o.glow ? 0x4a3a28 : BP.coal, false, r);
  if (o.arch) {
    [x, z] = at(0, 0.015);
    b.arch(w / 2, 0.04, x, y + h, z, o.glow ? 0x4a3a28 : BP.coal, false, r, 5);
  }
  // Rahmen: Kreuzsprosse
  [x, z] = at(0, 0.03);
  b.box(w, 0.03, 0.03, x, y + h * 0.5 - 0.015, z, frame, false, r);
  [x, z] = at(0, 0.03);
  b.box(0.03, h, 0.03, x, y, z, frame, false, r);
  for (const sx of [-1, 1]) {
    [x, z] = at(sx * (w / 2 + 0.02), 0.03);
    b.box(0.05, h + 0.06, 0.06, x, y - 0.01, z, frame, false, r);
  }
  [x, z] = at(0, 0.03);
  b.box(w + 0.1, 0.05, 0.06, x, y + h, z, frame, false, r);
  if (o.sill !== false) {
    [x, z] = at(0, 0.05);
    b.box(w + 0.14, 0.04, 0.1, x, y - 0.045, z, BP.stoneLight, false, r);
  }
  if (o.shutters) {
    for (const sx of [-1, 1]) {
      [x, z] = at(sx * (w / 2 + 0.11), 0.035);
      b.surf(SURF.Plank).box(0.14, h + 0.02, 0.03, x, y, z, BP.woodLight, false, r).surf(0);
    }
  }
  b.det(0);
}

/** Schießscharte */
export function slitOn(b: ModelBuilder, face: number, u: number, y: number, n: number, h = 0.36): void {
  const r = FACE_ROT[face];
  const at = (uu: number, nn: number): [number, number] => facePos(face, u + uu, n + nn);
  b.det(1).surf(0);
  let [x, z] = at(0, 0.015);
  b.box(0.07, h, 0.05, x, y, z, BP.black, false, r);
  [x, z] = at(0, 0.02);
  b.box(0.16, 0.04, 0.05, x, y + h, z, BP.stoneLight, false, r);
  [x, z] = at(0, 0.02);
  b.box(0.16, 0.04, 0.05, x, y - 0.04, z, BP.stoneLight, false, r);
  b.det(0);
}

/** Rundbogenfenster, hoch (Kirchen) */
export function lancet(b: ModelBuilder, face: number, u: number, y: number, n: number, w: number, h: number, glass: number = 0x6f8fb0): void {
  const r = FACE_ROT[face];
  const at = (uu: number, nn: number): [number, number] => facePos(face, u + uu, n + nn);
  b.det(1).surf(0);
  let [x, z] = at(0, 0.015);
  b.box(w, h, 0.05, x, y, z, glass, false, r);
  [x, z] = at(0, 0.015);
  b.arch(w / 2, 0.05, x, y + h, z, glass, false, r, 6);
  [x, z] = at(0, 0.035);
  b.box(0.035, h + w / 2, 0.03, x, y, z, BP.stoneMid, false, r);
  [x, z] = at(0, 0.035);
  b.box(w, 0.03, 0.03, x, y + h * 0.55, z, BP.stoneMid, false, r);
  for (const sx of [-1, 1]) {
    [x, z] = at(sx * (w / 2 + 0.04), 0.03);
    b.box(0.08, h, 0.07, x, y, z, BP.stoneLight, false, r);
  }
  [x, z] = at(0, 0.03);
  b.arch(w / 2 + 0.08, 0.06, x, y + h, z, BP.stoneLight, false, r, 6);
  b.det(0);
}

// ------------------------------------------------------------------------------------- Fachwerk / Schlot

/** Fachwerk über einer Wandfläche: Balkenraster mit Streben. len = Wandlänge, h = Wandhöhe ab y0 */
export function timberFace(b: ModelBuilder, face: number, len: number, y0: number, h: number, n: number, color: number = BP.woodDark, bays = 0, skip: number[] = [], du = 0): void {
  const r = FACE_ROT[face];
  const nb = bays || Math.max(2, Math.round(len / 0.9));
  const at = (uu: number, nn: number): [number, number] => facePos(face, uu + du, n + nn);
  b.det(1).surf(0);
  let x: number;
  let z: number;
  // Schwelle und Rähm
  [x, z] = at(0, 0.02);
  b.box(len, 0.09, 0.07, x, y0, z, color, false, r);
  [x, z] = at(0, 0.02);
  b.box(len, 0.09, 0.07, x, y0 + h - 0.09, z, color, false, r);
  for (let i = 0; i <= nb; i++) {
    const u = -len / 2 + (i / nb) * len;
    [x, z] = at(u, 0.02);
    b.box(0.08, h, 0.07, x, y0, z, color, false, r);
  }
  for (let i = 0; i < nb; i++) {
    if (skip.includes(i)) continue;
    const ua = -len / 2 + (i / nb) * len;
    const ub = -len / 2 + ((i + 1) / nb) * len;
    const [x1, z1] = at(i % 2 ? ub : ua, 0.03);
    const [x2, z2] = at(i % 2 ? ua : ub, 0.03);
    b.beam(x1, y0 + 0.08, z1, x2, y0 + h - 0.1, z2, 0.055, color);
  }
  b.det(0);
}

/** Schornstein: gemauerter Schaft mit Kappe; (x, z) Mitte, Fußhöhe y, Höhe h */
export function chimney(b: ModelBuilder, x: number, y: number, z: number, h: number, w = 0.3, color: number = BP.stoneMid): void {
  b.det(1).surf(SURF.Stone).box(w, h, w, x, y, z, color);
  b.frustum(w + 0.1, w + 0.1, w, w, 0.07, x, y + h, z, BP.stoneDark);
  b.surf(0).box(w * 0.55, 0.03, w * 0.55, x, y + h + 0.06, z, BP.coal);
  b.det(0);
}

// ------------------------------------------------------------------------------------------- Türme

export interface RoundTowerOpts {
  r: number;
  h: number;
  x?: number;
  z?: number;
  seg?: number;
  color?: number;
  /** Zinnenkranz an der Spitze */
  crown?: boolean;
  /** Dach (Kegel) statt Zinnen */
  roof?: { color: number; team?: boolean; h?: number; surf?: number };
  slits?: number;
  slitFace?: number;
  base?: boolean;
  band?: boolean;
}

/** Runder Turm: Sockel mit Anlauf, Schaft, Zierband, Schießscharten, Kranz mit Zinnen oder Kegeldach */
export function roundTower(b: ModelBuilder, o: RoundTowerOpts): void {
  const x = o.x ?? 0;
  const z = o.z ?? 0;
  const seg = o.seg ?? 12;
  const col = o.color ?? BP.stone;
  const r = o.r;
  b.surf(SURF.Stone).det(0);
  if (o.base !== false) b.cyl(r * 1.02, r * 1.16, Math.min(0.32, o.h * 0.14), seg, x, 0, z, BP.stoneDark);
  b.cyl(r, r * 1.02, o.h, seg, x, 0.02, z, col);
  if (o.band !== false) b.cyl(r * 1.05, r * 1.05, 0.09, seg, x, o.h * 0.56, z, BP.stoneMid);
  // Kranz mit Konsolen
  b.cyl(r * 1.22, r * 1.08, 0.2, seg, x, o.h, z, BP.stoneMid);
  b.surf(0);
  const top = o.h + 0.2;
  if (o.roof) {
    coneRoof(b, r * 1.28, o.roof.h ?? r * 2.0, x, top - 0.02, z, o.roof.color, !!o.roof.team, seg, o.roof.surf ?? SURF.Tile);
    b.det(1).cyl(0.03, 0.03, 0.36, 4, x, top + (o.roof.h ?? r * 2.0) - 0.04, z, BP.woodDark);
    b.cyl(0.06, 0.06, 0.05, 6, x, top + (o.roof.h ?? r * 2.0) + 0.28, z, BP.gold).det(0);
  } else if (o.crown !== false) {
    roundCrenel(b, r * 1.18, top - 0.02, x, z, BP.stone, Math.max(6, Math.round(r * 9)));
  }
  const ns = o.slits ?? 0;
  for (let i = 0; i < ns; i++) {
    const a = (i / Math.max(1, ns)) * Math.PI * 2 + (o.slitFace ?? 0);
    const sx = x + Math.cos(a) * (r + 0.005);
    const sz = z + Math.sin(a) * (r + 0.005);
    b.det(1).box(0.07, 0.34, 0.06, sx, o.h * 0.62, sz, BP.black, false, -a + Math.PI / 2);
    b.box(0.07, 0.34, 0.06, sx, o.h * 0.28, sz, BP.black, false, -a + Math.PI / 2).det(0);
  }
}

// --------------------------------------------------------------------------------- Fahnen, Wimpel

/** Fahnenstange mit Wimpel in Spielerfarbe (Tuch weht im Shader). Wimpel zeigt nach +z */
export function flag(b: ModelBuilder, x: number, y: number, z: number, h = 0.9, len = 0.42, ht = 0.24, team = true): void {
  b.det(1).surf(0);
  b.cyl(0.025, 0.035, h, 5, x, y, z, BP.woodDark);
  b.sphere(0.045, x, y + h + 0.02, z, BP.gold);
  b.part(PART.Cloth, x, y + h - 0.04, z);
  b.poly([[0, 0], [0, ht], [len * 0.2, ht * 0.9], [len, ht * 0.5], [len * 0.2, ht * 0.1]], 0.025, x, y + h - ht - 0.06, z, BP.white, team, Math.PI / 2);
  b.part(0).det(0);
}

/** Langer Fahnenwimpel (Dreiecksform) für Türme */
export function pennant(b: ModelBuilder, x: number, y: number, z: number, h: number, len = 0.7, ht = 0.3): void {
  b.det(0).surf(0);
  b.cyl(0.03, 0.04, h, 5, x, y, z, BP.woodDark);
  b.sphere(0.05, x, y + h + 0.02, z, BP.gold);
  b.part(PART.Cloth, x, y + h - 0.05, z);
  b.poly([[0, 0], [0, ht], [len, ht * 0.5]], 0.03, x, y + h - ht - 0.08, z, BP.white, true, Math.PI / 2);
  b.part(0);
}

/** Hängendes Banner an einer Wand (Seite face, Position u, Oberkante y, Wandabstand n), Spielerfarbe */
export function banner(b: ModelBuilder, face: number, u: number, yTop: number, n: number, w = 0.4, h = 1.0): void {
  const r = FACE_ROT[face];
  const [x, z] = facePos(face, u, n + 0.04);
  b.det(1).surf(0);
  const [bx, bz] = facePos(face, u, n + 0.05);
  b.box(w + 0.1, 0.05, 0.05, bx, yTop, bz, BP.woodDark, false, r);
  b.part(PART.Cloth, x, yTop, z);
  b.poly([[-w / 2, 0], [w / 2, 0], [w / 2, -h], [0, -h + 0.14], [-w / 2, -h]], 0.02, x, yTop, z, BP.white, true, r);
  b.part(0);
  b.box(w * 0.55, h * 0.5, 0.012, bx, yTop - h * 0.78, bz, BP.gold, false, r);
  b.det(0);
}

// ---------------------------------------------------------------------------------------- Requisiten

export function barrel(b: ModelBuilder, x: number, z: number, y = 0, c: number = BP.wood): void {
  b.det(1).surf(0);
  b.cyl(0.13, 0.13, 0.32, 8, x, y, z, c);
  b.cyl(0.145, 0.145, 0.04, 8, x, y + 0.07, z, BP.iron);
  b.cyl(0.145, 0.145, 0.04, 8, x, y + 0.21, z, BP.iron);
  b.cyl(0.12, 0.12, 0.02, 8, x, y + 0.32, z, BP.woodDark);
  b.det(0);
}

export function crate(b: ModelBuilder, x: number, z: number, s = 0.3, y = 0, c: number = BP.wood, rot = 0): void {
  b.det(1).surf(SURF.Plank).box(s, s, s, x, y, z, c, false, rot);
  b.surf(0).box(s + 0.02, 0.035, s + 0.02, x, y + s - 0.02, z, BP.woodDark, false, rot);
  b.box(s + 0.02, 0.035, s + 0.02, x, y + 0.0, z, BP.woodDark, false, rot);
  b.det(0);
}

export function sack(b: ModelBuilder, x: number, z: number, y = 0, c: number = BP.cloth): void {
  b.det(1).surf(0);
  b.cyl(0.07, 0.12, 0.22, 6, x, y, z, c);
  b.cone(0.09, 0.1, 6, x, y + 0.2, z, BP.clothDark);
  b.det(0);
}

/** Liegender Stamm entlang x (Länge len) */
export function logX(b: ModelBuilder, x: number, y: number, z: number, len: number, r = 0.08, c: number = BP.woodDark): void {
  b.surf(SURF.Log).disc(r, len, 6, x, y + r, z, c).surf(0);
}

/** Stapel Rundhölzer: n Lagen (Pyramide), Stämme entlang x */
export function logPile(b: ModelBuilder, x: number, z: number, len: number, layers = 3, y = 0, r = 0.08): void {
  b.det(1);
  for (let l = 0; l < layers; l++) {
    const cnt = layers - l;
    for (let i = 0; i < cnt; i++) logX(b, x, y + l * r * 1.75, z + (i - (cnt - 1) / 2) * r * 2.05, len, r, (i + l) % 2 ? BP.wood : BP.woodDark);
  }
  b.det(0);
}

/** Brettstapel */
export function plankPile(b: ModelBuilder, x: number, z: number, w: number, d: number, layers = 4, y = 0, rot = 0): void {
  b.det(1).surf(SURF.Plank);
  for (let l = 0; l < layers; l++) b.box(w, 0.045, d - (l % 2) * 0.04, x, y + l * 0.055, z, l % 2 ? BP.woodLight : BP.wood, false, rot);
  b.surf(0).det(0);
}

/** Steinhaufen aus Quadern */
export function stonePile(b: ModelBuilder, x: number, z: number, y = 0, n = 5): void {
  b.det(1).surf(SURF.Stone);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4;
    b.box(0.26 - (i % 3) * 0.04, 0.16, 0.2, x + Math.cos(a) * 0.12, y + (i > 2 ? 0.15 : 0), z + Math.sin(a) * 0.1, i % 2 ? BP.stone : BP.stoneMid, false, a);
  }
  b.surf(0).det(0);
}

/** Zaun entlang einer Linie: Pfosten + zwei Latten */
export function fence(b: ModelBuilder, x1: number, z1: number, x2: number, z2: number, h = 0.32, post = BP.woodDark, rail = BP.wood): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / 0.5));
  b.det(1).surf(0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.box(0.06, h, 0.06, x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t, post);
  }
  for (const k of [0.45, 0.82]) b.beam(x1, h * k, z1, x2, h * k, z2, 0.035, rail);
  b.det(0);
}

/** Leiter an einer Seite */
export function ladder(b: ModelBuilder, x: number, z: number, h: number, rotY = 0, y = 0): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  b.det(1).surf(0);
  for (const sx of [-0.1, 0.1]) b.box(0.04, h, 0.04, x + sx * c, y, z - sx * s, BP.woodDark);
  const n = Math.max(2, Math.round(h / 0.22));
  for (let i = 1; i < n; i++) b.box(0.22, 0.03, 0.03, x, y + (i / n) * h, z, BP.wood, false, rotY);
  b.det(0);
}

/** Heuhaufen */
export function haystack(b: ModelBuilder, x: number, z: number, r = 0.3, y = 0): void {
  b.det(1).surf(SURF.Thatch);
  b.cyl(r * 0.92, r, r * 0.7, 7, x, y, z, BP.hay);
  b.cone(r * 0.95, r * 0.75, 7, x, y + r * 0.68, z, BP.hay);
  b.surf(0).det(0);
}

/** Amboss */
export function anvil(b: ModelBuilder, x: number, y: number, z: number, rot = 0): void {
  b.det(1).surf(0);
  b.box(0.2, 0.12, 0.2, x, y, z, BP.woodDark, false, rot);
  b.box(0.26, 0.06, 0.1, x, y + 0.12, z, BP.iron, false, rot);
  b.box(0.12, 0.03, 0.08, x, y + 0.18, z, BP.iron, false, rot);
  b.spike(0.04, 0.12, x + Math.sin(rot) * 0.1, y + 0.14, z + Math.cos(rot) * 0.1, BP.ironLight);
  b.det(0);
}

/** Dachfenster/Gaube */
export function dormer(b: ModelBuilder, x: number, y: number, z: number, w = 0.3, h = 0.3, color: number = BP.terracottaDark): void {
  b.det(1).surf(SURF.Plaster).box(w, h, 0.28, x, y, z, BP.plasterWhite);
  b.surf(0).box(w * 0.55, h * 0.6, 0.05, x, y + h * 0.15, z + 0.14, BP.coal);
  b.roof(w + 0.1, 0.18, 0.36, x, y + h, z, color).det(0);
}

/** Bodenplatte (Hof, Pflaster) */
export function slab(b: ModelBuilder, w: number, d: number, x: number, z: number, color: number = BP.stoneMid, h = 0.05, y = 0, kind: number = SURF.Flag): void {
  b.det(0).surf(kind).box(w, h, d, x, y, z, color).surf(0);
}

/** Ackerbeet mit Reihen */
export function bed(b: ModelBuilder, x: number, z: number, w: number, d: number, rows: number, color: number, y = 0.04, h = 0.2, alongZ = true): void {
  b.det(1).surf(0);
  for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows;
    if (alongZ) b.box(w / rows * 0.55, h, d, x - w / 2 + t * w, y, z, i % 2 ? color : color + 0x0a0a00);
    else b.box(w, h, d / rows * 0.55, x, y, z - d / 2 + t * d, i % 2 ? color : color + 0x0a0a00);
  }
  b.det(0);
}
