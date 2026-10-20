import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, PAL, T, hash2, valueNoise } from '@strongpoly/shared';
import { waterMaterial } from './materials';
import type { QualityCfg } from './quality';

/** warmer Wüstendunst: Hintergrund, Nebel und Kartenrand */
export const FOG_COLOR = 0xe6d8b8;
const CHUNK = 32;
/** Tiefe des Gewässerbetts unter der Wasserfläche */
const BED_DEPTH = 0.55;

function col(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
type RGB = [number, number, number];

function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

interface TerrainColors {
  a: RGB;
  b: RGB;
  /** Stärke des Dünen-/Fleckenmusters */
  pat: number;
}
const TC: Record<number, TerrainColors> = {
  [T.Desert]: { a: col(PAL.sand), b: col(PAL.sandDark), pat: 0.075 },
  [T.Steppe]: { a: col(PAL.steppe), b: col(PAL.steppeDark), pat: 0.05 },
  [T.Oasis]: { a: col(PAL.oasis), b: col(PAL.oasisDark), pat: 0.045 },
  [T.Rock]: { a: col(PAL.rock), b: col(PAL.rockDark), pat: 0.06 },
  [T.Water]: { a: col(PAL.sandDark), b: col(PAL.waterDeep), pat: 0 },
  [T.Swamp]: { a: col(PAL.swamp), b: col(PAL.steppeDark), pat: 0.05 },
  [T.StoneDeposit]: { a: col(PAL.stone), b: col(PAL.stoneDark), pat: 0.04 },
  [T.IronDeposit]: { a: mix(col(PAL.sandDark), col(PAL.rockDark), 0.55), b: col(PAL.stoneDark), pat: 0.04 },
  [T.PitchSpring]: { a: mix(col(PAL.swamp), col(PAL.pitch), 0.7), b: col(PAL.swamp), pat: 0.03 },
  [T.Moat]: { a: col(PAL.sandDark), b: col(PAL.waterDeep), pat: 0 },
};
const WET = mix(col(PAL.sandDark), col(PAL.waterDeep), 0.22);
const BED = mix(col(PAL.sandDark), col(PAL.waterDeep), 0.55);
const CLIFF = col(PAL.rockDark);
const CLIFF_LIGHT = mix(col(PAL.rock), col(PAL.sandDark), 0.2);
const FOGC = col(FOG_COLOR);
const WHITE: RGB = [1, 1, 1];
const WATER_SHALLOW = mix(col(PAL.water), col(PAL.white), 0.3);
const WATER_DEEP = col(PAL.waterDeep);
const MOAT_SHALLOW = mix(col(PAL.water), col(PAL.swamp), 0.25);
const MOAT_DEEP = mix(col(PAL.waterDeep), col(PAL.pitch), 0.25);

function isWaterT(t: number): boolean {
  return t === T.Water || t === T.Moat;
}

/** Höhe der Wasseroberfläche (Wasser/Graben) bzw. Oberkante des Landes */
export function tileTopY(map: GameMap, i: number): number {
  const t = map.terrain[i];
  if (t === T.Water) return -0.25;
  if (t === T.Moat) return map.height[i] * HEIGHT_STEP - 0.3;
  return map.height[i] * HEIGHT_STEP;
}

/** Oberkante des begehbaren Bodens bzw. des Gewässerbetts */
function groundY(map: GameMap, i: number): number {
  const t = map.terrain[i];
  const y = tileTopY(map, i);
  return isWaterT(t) ? y - BED_DEPTH : y;
}

/** Dünenmuster: weiche, diagonal laufende Rücken mit Domain-Warp, -1..1 */
function dune(seed: number, x: number, y: number): number {
  const n = valueNoise(seed + 7, x * 0.07, y * 0.07);
  const w = valueNoise(seed + 11, x * 0.23, y * 0.23);
  const s = Math.sin(x * 0.46 + y * 0.27 + n * 9 + w * 2.2);
  const r = s > 0 ? s : s * 0.5;
  return r * 0.7 + (n - 0.5) * 0.9;
}

class MeshAcc {
  pos: number[] = [];
  col: number[] = [];
  foam: number[] = [];
  vert(x: number, y: number, z: number, c: RGB, f = 0): void {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2]);
    this.foam.push(f);
  }
  tri(a: number[], b: number[], c: number[], ca: RGB, cb: RGB, cc: RGB, fa = 0, fb = 0, fc = 0): void {
    this.vert(a[0], a[1], a[2], ca, fa);
    this.vert(b[0], b[1], b[2], cb, fb);
    this.vert(c[0], c[1], c[2], cc, fc);
  }
  get count(): number {
    return this.pos.length / 3;
  }
}

interface ChunkRec {
  land: THREE.Mesh;
  water: THREE.Mesh | null;
  landBase: Float32Array;
  waterBase: Float32Array | null;
  landStarts: Int32Array;
  landCounts: Int32Array;
  waterStarts: Int32Array;
  waterCounts: Int32Array;
  landAttr: THREE.BufferAttribute;
  waterAttr: THREE.BufferAttribute | null;
}

/**
 * Terrain als Chunks: Terrassen-Quads mit weich verlaufenden Vertexfarben, Felsklippen an Höhenstufen
 * (facettiert, mit Gesteinsbändern), Dünenmuster, Gewässerbetten und eine getrennte animierte Wasserfläche.
 */
export class TerrainRenderer {
  readonly group = new THREE.Group();
  private chunks = new Map<number, ChunkRec>();
  private dirty = new Set<number>();
  private cw = 0;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  private waterMats = { animated: waterMaterial(true), flat: waterMaterial(false) };
  private waterAnimated = true;
  private fogState: Uint8Array | null = null;
  private fogVis: Uint8Array | null = null;
  private fogExp: Uint8Array | null = null;
  /** zuletzt gesehener Terraintyp/Höhe je Tile (nur echte Geländeänderungen bauen Chunks neu) */
  private seenT: Uint8Array = new Uint8Array(0);
  private seenH: Uint8Array = new Uint8Array(0);
  private shore: Uint8Array = new Uint8Array(0);
  private tileCol: Float32Array = new Float32Array(0);

  constructor(private map: GameMap) {
    this.cw = Math.ceil(map.w / CHUNK);
    this.group.name = 'terrain';
    this.rebuildAll();
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.cw = Math.ceil(map.w / CHUNK);
    this.rebuildAll();
  }

  applyQuality(q: QualityCfg): void {
    this.waterAnimated = q.waterShader;
    const mat = q.waterShader ? this.waterMats.animated : this.waterMats.flat;
    for (const c of this.chunks.values()) if (c.water) c.water.material = mat;
  }

  private tileColorAt(i: number, x: number, y: number): RGB {
    const t = this.map.terrain[i];
    const tc = TC[t] ?? TC[T.Steppe];
    const r = hash2(this.map.seed + 17, x, y);
    return mix(tc.a, tc.b, r < 0.5 ? r * 0.5 : 0.25 + (r - 0.5) * 0.4);
  }

  private computeShore(): void {
    const m = this.map;
    const d = new Uint8Array(m.n).fill(255);
    const q: number[] = [];
    for (let i = 0; i < m.n; i++) {
      if (!isWaterT(m.terrain[i])) {
        d[i] = 0;
        q.push(i);
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % m.w;
      const y = (i / m.w) | 0;
      const nd = d[i] + 1;
      if (nd > 9) continue;
      if (x > 0 && d[i - 1] > nd) { d[i - 1] = nd; q.push(i - 1); }
      if (x < m.w - 1 && d[i + 1] > nd) { d[i + 1] = nd; q.push(i + 1); }
      if (y > 0 && d[i - m.w] > nd) { d[i - m.w] = nd; q.push(i - m.w); }
      if (y < m.h - 1 && d[i + m.w] > nd) { d[i + m.w] = nd; q.push(i + m.w); }
    }
    this.shore = d;
  }

  rebuildAll(): void {
    for (const c of this.chunks.values()) {
      this.group.remove(c.land);
      c.land.geometry.dispose();
      if (c.water) {
        this.group.remove(c.water);
        c.water.geometry.dispose();
      }
    }
    this.chunks.clear();
    const m = this.map;
    this.seenT = m.terrain.slice();
    this.seenH = m.height.slice();
    this.tileCol = new Float32Array(m.n * 3);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = m.idx(x, y);
        const c = this.tileColorAt(i, x, y);
        this.tileCol.set(c, i * 3);
      }
    this.computeShore();
    this.fogState = this.fogVis ? new Uint8Array(m.n).fill(255) : null;
    const ch = Math.ceil(m.h / CHUNK);
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.buildChunk(cx, cy);
  }

  markTile(x: number, y: number): void {
    const m = this.map;
    if (!m.inBounds(x, y)) return;
    const i = m.idx(x, y);
    if (this.seenT[i] === m.terrain[i] && this.seenH[i] === m.height[i]) return;
    const wasWater = isWaterT(this.seenT[i]);
    this.seenT[i] = m.terrain[i];
    this.seenH[i] = m.height[i];
    const c = this.tileColorAt(i, x, y);
    this.tileCol.set(c, i * 3);
    const waterChange = wasWater !== isWaterT(m.terrain[i]);
    if (waterChange) {
      this.computeShore();
      // Uferabstand ändert Wasserfarben im Umkreis
      for (let dy = -9; dy <= 9; dy += 9) for (let dx = -9; dx <= 9; dx += 9) this.dirtyChunkAt(x + dx, y + dy);
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.dirtyChunkAt(x + dx, y + dy);
  }

  private dirtyChunkAt(x: number, y: number): void {
    if (!this.map.inBounds(x, y)) return;
    this.dirty.add(Math.floor(y / CHUNK) * this.cw + Math.floor(x / CHUNK));
  }

  flush(): void {
    if (!this.dirty.size) return;
    for (const id of this.dirty) {
      const cx = id % this.cw;
      const cy = Math.floor(id / this.cw);
      if (cx * CHUNK < this.map.w && cy * CHUNK < this.map.h) this.buildChunk(cx, cy);
    }
    this.dirty.clear();
  }

  /** Farbe an einer Tile-Ecke: gewichtetes Mittel der vier angrenzenden Tiles (weiche Übergänge). */
  private corner(self: number, sx: number, sy: number, px: number, py: number, out: RGB): void {
    const m = this.map;
    const selfWater = isWaterT(m.terrain[self]);
    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    let amp = 0;
    let higher = false;
    const selfH = m.height[self];
    for (let k = 0; k < 4; k++) {
      const tx = px - 1 + (k & 1);
      const ty = py - 1 + (k >> 1);
      if (!m.inBounds(tx, ty)) continue;
      const j = m.idx(tx, ty);
      const tj = m.terrain[j];
      const wj = isWaterT(tj);
      let c0: number;
      let c1: number;
      let c2: number;
      if (selfWater) {
        if (wj) {
          c0 = this.tileCol[j * 3];
          c1 = this.tileCol[j * 3 + 1];
          c2 = this.tileCol[j * 3 + 2];
          c0 = BED[0];
          c1 = BED[1];
          c2 = BED[2];
        } else {
          c0 = WET[0];
          c1 = WET[1];
          c2 = WET[2];
        }
      } else if (wj) {
        c0 = WET[0];
        c1 = WET[1];
        c2 = WET[2];
      } else {
        c0 = this.tileCol[j * 3];
        c1 = this.tileCol[j * 3 + 1];
        c2 = this.tileCol[j * 3 + 2];
      }
      const w = j === self ? 2 : 1;
      r += c0 * w;
      g += c1 * w;
      b += c2 * w;
      wsum += w;
      amp += (TC[tj]?.pat ?? 0.04) * w;
      if (!wj && m.height[j] > selfH) higher = true;
    }
    if (wsum === 0) {
      out[0] = out[1] = out[2] = 0.5;
      return;
    }
    r /= wsum;
    g /= wsum;
    b /= wsum;
    amp /= wsum;
    if (!selfWater && amp > 0) {
      const d = dune(m.seed, px, py);
      const f = 1 + amp * d * 1.6;
      r *= f;
      g *= f;
      b *= f;
    }
    if (higher && !selfWater) {
      r *= 0.88;
      g *= 0.88;
      b *= 0.88;
    }
    // weicher Kartenrand zum Dunst
    const edge = Math.min(px, py, m.w - px, m.h - py);
    if (edge < 10) {
      const f = 1 - edge / 10;
      const k = f * f * 0.85;
      r += (FOGC[0] - r) * k;
      g += (FOGC[1] - g) * k;
      b += (FOGC[2] - b) * k;
    }
    void sx;
    void sy;
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  private buildChunk(cx: number, cy: number): void {
    const m = this.map;
    const key = cy * this.cw + cx;
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old.land);
      old.land.geometry.dispose();
      if (old.water) {
        this.group.remove(old.water);
        old.water.geometry.dispose();
      }
    }
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(m.w, x0 + CHUNK);
    const y1 = Math.min(m.h, y0 + CHUNK);
    const land = new MeshAcc();
    const water = new MeshAcc();
    const lStart = new Int32Array(CHUNK * CHUNK).fill(-1);
    const lCount = new Int32Array(CHUNK * CHUNK);
    const wStart = new Int32Array(CHUNK * CHUNK).fill(-1);
    const wCount = new Int32Array(CHUNK * CHUNK);
    const c00: RGB = [0, 0, 0];
    const c10: RGB = [0, 0, 0];
    const c01: RGB = [0, 0, 0];
    const c11: RGB = [0, 0, 0];

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = m.idx(x, y);
        const local = (y - y0) * CHUNK + (x - x0);
        lStart[local] = land.count;
        const t = m.terrain[i];
        const wt = isWaterT(t);
        const yg = groundY(m, i);
        this.corner(i, x, y, x, y, c00);
        this.corner(i, x, y, x + 1, y, c10);
        this.corner(i, x, y, x, y + 1, c01);
        this.corner(i, x, y, x + 1, y + 1, c11);
        const A = [x, yg, y];
        const B = [x, yg, y + 1];
        const C = [x + 1, yg, y + 1];
        const D = [x + 1, yg, y];
        land.tri(A, B, C, c00, c01, c11);
        land.tri(A, C, D, c00, c11, c10);

        // Seitenflächen zu tieferen Nachbarn: Felsklippen bzw. Uferböschung
        const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          let yb = -1.4;
          if (m.inBounds(nx, ny)) yb = groundY(m, m.idx(nx, ny));
          if (yb >= yg - 0.001) continue;
          this.wall(land, x, y, dx, dy, yg, yb, t, i, c00, c10, c01, c11);
        }
        lCount[local] = land.count - lStart[local];

        if (wt) {
          wStart[local] = water.count;
          this.waterTile(water, x, y, i, t);
          wCount[local] = water.count - wStart[local];
        }
      }
    }

    const mk = (acc: MeshAcc, mat: THREE.Material, withFoam: boolean): { mesh: THREE.Mesh; attr: THREE.BufferAttribute } => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
      const attr = new THREE.Float32BufferAttribute(acc.col, 3);
      geo.setAttribute('color', attr);
      if (withFoam) geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(acc.foam, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      return { mesh, attr };
    };
    const L = mk(land, this.material, false);
    L.mesh.receiveShadow = true;
    L.mesh.castShadow = false;
    this.group.add(L.mesh);
    let W: { mesh: THREE.Mesh; attr: THREE.BufferAttribute } | null = null;
    if (water.count) {
      W = mk(water, this.waterAnimated ? this.waterMats.animated : this.waterMats.flat, true);
      W.mesh.receiveShadow = false;
      W.mesh.castShadow = false;
      W.mesh.renderOrder = 2;
      this.group.add(W.mesh);
    }
    const rec: ChunkRec = {
      land: L.mesh,
      water: W ? W.mesh : null,
      landBase: Float32Array.from(land.col),
      waterBase: W ? Float32Array.from(water.col) : null,
      landStarts: lStart,
      landCounts: lCount,
      waterStarts: wStart,
      waterCounts: wCount,
      landAttr: L.attr,
      waterAttr: W ? W.attr : null,
    };
    this.chunks.set(key, rec);
    if (this.fogVis && this.fogExp && this.fogState) this.applyFogChunk(cx, cy, true);
  }

  /** Seitenfläche (Klippe/Böschung): 2x2 Felder, Mittelpunkte leicht nach außen gedrückt, Gesteinsbänder. */
  private wall(acc: MeshAcc, x: number, y: number, dx: number, dy: number, yTop: number, yBot: number, t: number, i: number, c00: RGB, c10: RGB, c01: RGB, c11: RGB): void {
    const m = this.map;
    // Eckpunkte der Kante (a -> b) im Uhrzeigersinn von außen gesehen; n = Außennormale
    let ax: number, az: number, bx: number, bz: number;
    if (dx === 1) { ax = x + 1; az = y + 1; bx = x + 1; bz = y; }
    else if (dx === -1) { ax = x; az = y; bx = x; bz = y + 1; }
    else if (dy === 1) { ax = x; az = y + 1; bx = x + 1; bz = y + 1; }
    else { ax = x + 1; az = y; bx = x; bz = y; }
    const h1 = hash2(m.seed + 41, x * 4 + dx + 2, y * 4 + dy + 2);
    const h2 = hash2(m.seed + 43, x * 4 + dx + 2, y * 4 + dy + 2);
    const h3 = hash2(m.seed + 47, x * 4 + dx + 2, y * 4 + dy + 2);
    const wetBank = isWaterT(t) ? false : yBot < -0.5 || (m.inBounds(x + dx, y + dy) && isWaterT(m.terrain[m.idx(x + dx, y + dy)]));
    const top: RGB = wetBank
      ? mix(mix(CLIFF_LIGHT, CLIFF, 0.35 + h1 * 0.2), WET, 0.4)
      : isWaterT(t)
        ? BED
        : mix(mix(CLIFF_LIGHT, CLIFF, 0.2 + h1 * 0.45), TC[t]?.a ?? CLIFF, t === T.Desert ? 0.3 : 0.12);
    const topC: RGB = isWaterT(t) ? [BED[0], BED[1], BED[2]] : top;
    const midC = mix(topC, CLIFF, 0.35 + h2 * 0.25);
    const botC = mix(wetBank ? BED : CLIFF, [0.12, 0.1, 0.09], 0.28 + h3 * 0.15);
    // Kartenrand zum Dunst
    const edgeFog = (c: RGB, px: number, py: number): RGB => {
      const e = Math.min(px, py, m.w - px, m.h - py);
      if (e >= 10) return c;
      const f = 1 - e / 10;
      return mix(c, FOGC, f * f * 0.85);
    };
    const mxp = (ax + bx) / 2;
    const mzp = (az + bz) / 2;
    const out = 0.05 + h1 * 0.11;
    const out2 = 0.07 + h2 * 0.15;
    const yMid = yTop + (yBot - yTop) * (0.45 + h3 * 0.15);
    const P = (px: number, py: number, pz: number): number[] => [px, py, pz];
    const row0 = [P(ax, yTop, az), P(mxp, yTop, mzp), P(bx, yTop, bz)];
    const row1 = [P(ax, yMid, az), P(mxp + dx * out, yMid, mzp + dy * out), P(bx, yMid, bz)];
    const row2 = [P(ax, yBot, az), P(mxp + dx * out2, yBot, mzp + dy * out2), P(bx, yBot, bz)];
    const cT = (p: number[]): RGB => edgeFog(topC, p[0], p[2]);
    const cM = (p: number[]): RGB => edgeFog(midC, p[0], p[2]);
    const cB = (p: number[]): RGB => edgeFog(botC, p[0], p[2]);
    // Zellen: Zeile 0-1 und 1-2, Spalten 0-1 und 1-2
    for (let r = 0; r < 2; r++) {
      const ra = r === 0 ? row0 : row1;
      const rb = r === 0 ? row1 : row2;
      const ca = r === 0 ? cT : cM;
      const cb = r === 0 ? cM : cB;
      for (let cc = 0; cc < 2; cc++) {
        const p00 = ra[cc];
        const p01 = ra[cc + 1];
        const p10 = rb[cc];
        const p11 = rb[cc + 1];
        acc.tri(p00, p10, p11, ca(p00), cb(p10), cb(p11));
        acc.tri(p00, p11, p01, ca(p00), cb(p11), ca(p01));
      }
    }
    void i;
    void c00;
    void c10;
    void c01;
    void c11;
  }

  /** Wasseroberfläche eines Tiles: vier Dreiecke um einen Mittelpunkt (Facetten fangen Licht). */
  private waterTile(acc: MeshAcc, x: number, y: number, i: number, t: number): void {
    const m = this.map;
    const yw = tileTopY(m, i);
    const moat = t === T.Moat;
    const shallow = moat ? MOAT_SHALLOW : WATER_SHALLOW;
    const deep = moat ? MOAT_DEEP : WATER_DEEP;
    const dist = this.shore[i];
    const depthK = Math.min(1, Math.max(0, (dist - 1) / 4));
    const base = mix(shallow, deep, depthK);
    const cornerFoam = (px: number, py: number): number => {
      for (let k = 0; k < 4; k++) {
        const tx = px - 1 + (k & 1);
        const ty = py - 1 + (k >> 1);
        if (m.inBounds(tx, ty) && !isWaterT(m.terrain[m.idx(tx, ty)])) return 1;
      }
      return 0;
    };
    const fogC = (c: RGB, px: number, py: number): RGB => {
      const e = Math.min(px, py, m.w - px, m.h - py);
      if (e >= 10) return c;
      const f = 1 - e / 10;
      return mix(c, FOGC, f * f * 0.85);
    };
    const jitter = (hash2(m.seed + 53, x, y) - 0.5) * 0.06;
    const cc: RGB = [base[0] * (1 + jitter), base[1] * (1 + jitter), base[2] * (1 + jitter)];
    const corners: [number, number][] = [[x, y], [x, y + 1], [x + 1, y + 1], [x + 1, y]];
    const foams = corners.map(([px, py]) => cornerFoam(px, py));
    const fcenter = (foams[0] + foams[1] + foams[2] + foams[3]) / 4;
    const cols = corners.map(([px, py], k) => fogC(mix(cc, WHITE, foams[k] * 0.28), px, py));
    const cmid = fogC(mix(cc, WHITE, fcenter * 0.2), x + 0.5, y + 0.5);
    const mid = [x + 0.5, yw, y + 0.5];
    for (let k = 0; k < 4; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % 4];
      acc.tri([a[0], yw, a[1]], mid, [b[0], yw, b[1]], cols[k], cmid, cols[(k + 1) % 4], foams[k], fcenter, foams[(k + 1) % 4]);
    }
  }

  /** Kriegsnebel in die Vertexfarben einarbeiten (nur geänderte Tiles). */
  applyFog(vis: Uint8Array | null, exp: Uint8Array | null): void {
    if (!vis || !exp) {
      if (this.fogVis) {
        this.fogVis = this.fogExp = this.fogState = null;
        this.rebuildAll();
      }
      return;
    }
    this.fogVis = vis;
    this.fogExp = exp;
    if (!this.fogState) this.fogState = new Uint8Array(this.map.n).fill(255);
    const ch = Math.ceil(this.map.h / CHUNK);
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.applyFogChunk(cx, cy, false);
  }

  private applyFogChunk(cx: number, cy: number, force: boolean): void {
    const d = this.chunks.get(cy * this.cw + cx);
    const vis = this.fogVis;
    const exp = this.fogExp;
    const st = this.fogState;
    if (!d || !vis || !exp || !st) return;
    const m = this.map;
    const arr = d.landAttr.array as Float32Array;
    const warr = d.waterAttr ? (d.waterAttr.array as Float32Array) : null;
    let changed = false;
    let wchanged = false;
    const x1 = Math.min(m.w, (cx + 1) * CHUNK);
    const y1 = Math.min(m.h, (cy + 1) * CHUNK);
    for (let y = cy * CHUNK; y < y1; y++)
      for (let x = cx * CHUNK; x < x1; x++) {
        const i = y * m.w + x;
        const s = vis[i] ? 2 : exp[i] ? 1 : 0;
        if (!force && st[i] === s) continue;
        st[i] = s;
        const local = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
        const f = s === 2 ? 1 : s === 1 ? 0.55 : 0.08;
        const start = d.landStarts[local];
        if (start >= 0) {
          for (let v = start * 3; v < (start + d.landCounts[local]) * 3; v++) arr[v] = d.landBase[v] * f;
          changed = true;
        }
        const ws = d.waterStarts[local];
        if (ws >= 0 && warr && d.waterBase) {
          for (let v = ws * 3; v < (ws + d.waterCounts[local]) * 3; v++) warr[v] = d.waterBase[v] * f;
          wchanged = true;
        }
      }
    if (changed) d.landAttr.needsUpdate = true;
    if (wchanged && d.waterAttr) d.waterAttr.needsUpdate = true;
  }

  setShadows(on: boolean): void {
    for (const c of this.chunks.values()) c.land.receiveShadow = on;
  }
}
