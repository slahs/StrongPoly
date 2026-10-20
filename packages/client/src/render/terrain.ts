import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, PAL, T, hash2, valueNoise } from '@strongpoly/shared';
import { Biome, biomeOf, moistureAt, surfaceWeights } from './biome';
import { terrainMaterial, waterMaterial } from './materials';
import type { QualityCfg } from './quality';

/** warmer, leicht kühler Dunst: Hintergrund, Nebel und Kartenrand */
export const FOG_COLOR = 0xe3d9c0;
const CHUNK = 32;
/** Tiefe des Gewässerbetts unter der Wasserfläche */
const BED_DEPTH = 0.55;

function col(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
type RGB = [number, number, number];
type Surf = [number, number, number, number];

function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- Palette des Bodens (warm, leicht entsättigt; das Fragment-Detail setzt Flecken, Risse und Schichten darauf)
const STRAW = col(0xbaac74);
const STRAW_DARK = col(0xa89a62);
const MEADOW = col(0x91a860);
const MEADOW_DARK = col(0x7c9852);
const SAND = col(0xe1c999);
const SAND_DARK = col(0xcfb27d);
const OASIS = col(0x72994f);
const OASIS_DARK = col(0x628a4a);
const ROCK = col(PAL.rock);
const ROCK_DARK = col(PAL.rockDark);
const SWAMP = col(0x59643c);
const STONE_GROUND = col(0xaca79c);
const STONE_GROUND_D = col(0x8d887e);
const IRON_GROUND = col(0x6f6254);
const IRON_GROUND_D = col(0x514840);
const PITCH_GROUND = col(0x3a332b);
const PITCH_GROUND_D = col(0x2a2622);

const WET = mix(SAND_DARK, col(PAL.waterDeep), 0.2);
const BED_SHALLOW = col(0xbaa876);
const BED_DEEP = col(0x32525d);
const CLIFF = col(PAL.rockDark);
const CLIFF_LIGHT = mix(col(PAL.rock), SAND_DARK, 0.22);
const CLIFF_WARM = mix(col(0x9a8466), CLIFF, 0.25);
const FOGC = col(FOG_COLOR);
const WHITE: RGB = [1, 1, 1];
// Wasser: flach türkis, tief blau; Graben: trüb olivgrün bis fast schwarz
const W_SHALLOW = col(0x62b5b2);
const W_MID = col(0x3f8ebb);
const W_DEEP = col(0x215f93);
const MOAT_SHALLOW = col(0x7a8a5c);
const MOAT_DEEP = col(0x2f3b33);

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

/** Wassertönung nach Tiefe 0 (Ufer) .. 1 (tief) */
export function waterTint(depth: number, moat: boolean): RGB {
  const d = clamp01(depth);
  if (moat) return mix(MOAT_SHALLOW, MOAT_DEEP, d);
  return d < 0.5 ? mix(W_SHALLOW, W_MID, d * 2) : mix(W_MID, W_DEEP, (d - 0.5) * 2);
}

class MeshAcc {
  pos: number[] = [];
  col: number[] = [];
  /** Land: Oberflächengewichte (Gras, Sand, Fels, nass) */
  surf: number[] = [];
  /** Wasser: Schaum, Tiefe, Graben-Kennung */
  foam: number[] = [];
  depth: number[] = [];
  kind: number[] = [];
  vert(x: number, y: number, z: number, c: RGB, s: Surf = [0, 0, 0, 0], f = 0, d = 0, k = 0): void {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2]);
    this.surf.push(s[0], s[1], s[2], s[3]);
    this.foam.push(f);
    this.depth.push(d);
    this.kind.push(k);
  }
  tri(a: number[], b: number[], c: number[], ca: RGB, cb: RGB, cc: RGB, sa: Surf, sb: Surf, sc: Surf): void {
    this.vert(a[0], a[1], a[2], ca, sa);
    this.vert(b[0], b[1], b[2], cb, sb);
    this.vert(c[0], c[1], c[2], cc, sc);
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
 * Terrain als Chunks: Terrassen-Quads mit weich verlaufenden Vertexfarben und Oberflächengewichten, Felsklippen an
 * Höhenstufen (facettiert, mit Gesteinsschichten), Gewässerbetten und eine getrennte animierte Wasserfläche.
 * Das Feindetail (Flecken, Gräser, Risse, Pfade) entsteht im Shader (materials.ts, terrainMaterial).
 */
export class TerrainRenderer {
  readonly group = new THREE.Group();
  private chunks = new Map<number, ChunkRec>();
  private dirty = new Set<number>();
  private cw = 0;
  private material = terrainMaterial();
  private waterMats: { animated: THREE.Material | null; flat: THREE.Material | null } = { animated: null, flat: null };
  private waterAnimated = true;
  private fogState: Uint8Array | null = null;
  private fogVis: Uint8Array | null = null;
  private fogExp: Uint8Array | null = null;
  /** zuletzt gesehener Terraintyp/Höhe je Tile (nur echte Geländeänderungen bauen Chunks neu) */
  private seenT: Uint8Array = new Uint8Array(0);
  private seenH: Uint8Array = new Uint8Array(0);
  /** Abstand eines Wasser-Tiles zum Land (1..9), 0 auf Land */
  private shore: Uint8Array = new Uint8Array(0);
  /** Abstand eines Land-Tiles zum Wasser (1..4), 0 im Wasser */
  private shoreL: Uint8Array = new Uint8Array(0);
  private tileCol: Float32Array = new Float32Array(0);
  private tileSurf: Float32Array = new Float32Array(0);
  /** Dünenmuster je Eckpunkt (wird von vier Tiles gebraucht, daher einmal berechnet; NaN = noch nicht) */
  private duneV: Float32Array = new Float32Array(0);
  biome: Biome;

  constructor(private map: GameMap) {
    this.cw = Math.ceil(map.w / CHUNK);
    this.group.name = 'terrain';
    this.biome = biomeOf(map.seed);
    this.rebuildAll();
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.cw = Math.ceil(map.w / CHUNK);
    this.biome = biomeOf(map.seed);
    this.rebuildAll();
  }

  private waterMat(animated: boolean): THREE.Material {
    if (animated) return (this.waterMats.animated ??= waterMaterial(true));
    return (this.waterMats.flat ??= waterMaterial(false));
  }

  applyQuality(q: QualityCfg): void {
    this.waterAnimated = q.waterDetail > 0;
    const mat = this.waterMat(this.waterAnimated);
    for (const c of this.chunks.values()) if (c.water) c.water.material = mat;
  }

  /** Farbe und Oberflächengewichte eines Tiles (Biom, großflächige Feuchte, Höhenlage, Zufallsvariation) */
  private computeTile(i: number, x: number, y: number): void {
    const m = this.map;
    const t = m.terrain[i];
    const r = hash2(m.seed + 17, x, y);
    const rr = r < 0.5 ? r * 0.5 : 0.25 + (r - 0.5) * 0.4;
    const hgt = m.height[i];
    let c: RGB;
    let green = 0.5;
    switch (t) {
      case T.Desert: {
        const d = dune(m.seed, x, y);
        c = mix(SAND, SAND_DARK, clamp01(0.4 + rr * 0.8 - d * 0.35));
        break;
      }
      case T.Steppe: {
        const moist = moistureAt(this.biome, m.seed, x, y);
        green = clamp01(this.biome.green * 0.85 + (moist - 0.5) * 0.95);
        const strawC = mix(STRAW, STRAW_DARK, rr);
        const meadowC = mix(MEADOW, MEADOW_DARK, rr);
        c = mix(strawC, meadowC, green);
        break;
      }
      case T.Oasis: {
        const moist = moistureAt(this.biome, m.seed, x, y);
        c = mix(mix(OASIS_DARK, OASIS, moist), mix(OASIS_DARK, OASIS, 0.2), rr * 0.6);
        c = mix(c, STRAW, this.biome.id === 'dry' ? 0.22 : 0);
        break;
      }
      case T.Rock:
        c = mix(ROCK, ROCK_DARK, rr);
        break;
      case T.Swamp:
        c = mix(SWAMP, STRAW_DARK, rr * 0.5);
        break;
      case T.StoneDeposit:
        c = mix(STONE_GROUND, STONE_GROUND_D, rr);
        break;
      case T.IronDeposit:
        c = mix(IRON_GROUND, IRON_GROUND_D, rr);
        break;
      case T.PitchSpring:
        c = mix(PITCH_GROUND, PITCH_GROUND_D, rr);
        break;
      default:
        c = mix(SAND, SAND_DARK, rr);
    }
    // Höhenlage: Hochland heller, trockener und steiniger; Senken satter
    if (t !== T.Rock && !isWaterT(t)) {
      const k = hgt - 1;
      const lum = 1 + k * 0.035;
      c = mix(c, ROCK, clamp01((hgt - 2.2) * 0.1));
      c = [c[0] * lum, c[1] * lum, c[2] * lum];
    }
    this.tileCol[i * 3] = c[0];
    this.tileCol[i * 3 + 1] = c[1];
    this.tileCol[i * 3 + 2] = c[2];
    const sw = surfaceWeights(t, green);
    this.tileSurf[i * 4] = sw[0];
    this.tileSurf[i * 4 + 1] = sw[1];
    this.tileSurf[i * 4 + 2] = sw[2];
    this.tileSurf[i * 4 + 3] = sw[3];
  }

  /** Abstände zum Ufer: Wasser → Land (1..9) für die Wassertiefe, Land → Wasser (1..4) für nasse Streifen */
  private computeShore(): void {
    const m = this.map;
    const bfs = (seedWater: boolean, limit: number, store: Uint8Array): void => {
      store.fill(255);
      const q: number[] = [];
      for (let i = 0; i < m.n; i++) {
        if (isWaterT(m.terrain[i]) === seedWater) {
          store[i] = 0;
          q.push(i);
        }
      }
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        const x = i % m.w;
        const y = (i / m.w) | 0;
        const nd = store[i] + 1;
        if (nd > limit) continue;
        if (x > 0 && store[i - 1] > nd) { store[i - 1] = nd; q.push(i - 1); }
        if (x < m.w - 1 && store[i + 1] > nd) { store[i + 1] = nd; q.push(i + 1); }
        if (y > 0 && store[i - m.w] > nd) { store[i - m.w] = nd; q.push(i - m.w); }
        if (y < m.h - 1 && store[i + m.w] > nd) { store[i + m.w] = nd; q.push(i + m.w); }
      }
    };
    this.shore = new Uint8Array(m.n);
    this.shoreL = new Uint8Array(m.n);
    bfs(false, 9, this.shore);
    bfs(true, 4, this.shoreL);
  }

  /** nasser Uferstreifen eines Land-Tiles 0..1 (direkt am Wasser 1, zwei Felder weiter 0,45, dann 0) */
  private wetOf(i: number): number {
    if (isWaterT(this.map.terrain[i])) return 1;
    const d = this.shoreL[i];
    return d === 1 ? 1 : d === 2 ? 0.45 : d === 3 ? 0.12 : 0;
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
    this.tileSurf = new Float32Array(m.n * 4);
    this.duneV = new Float32Array((m.w + 1) * (m.h + 1)).fill(NaN);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) this.computeTile(m.idx(x, y), x, y);
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
    this.computeTile(i, x, y);
    const waterChange = wasWater !== isWaterT(m.terrain[i]);
    if (waterChange) {
      this.computeShore();
      // Uferabstand ändert Wasserfarben und nasse Streifen im Umkreis
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

  /**
   * Farbe und Oberflächengewichte an einer Tile-Ecke: gewichtetes Mittel der vier angrenzenden Tiles
   * (weiche Übergänge ohne harte Tilegrenzen). Gewässer: Bett nach Tiefe, nasses Ufer.
   */
  private corner(self: number, px: number, py: number, out: RGB, surf: Surf): void {
    const m = this.map;
    const selfWater = isWaterT(m.terrain[self]);
    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    let amp = 0;
    let higher = false;
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let wet = 0;
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
      if (selfWater && wj) {
        // Bett: sandig im Flachen, dunkel in der Tiefe
        const dk = clamp01((this.shore[j] - 1) / 4);
        const bed = mix(BED_SHALLOW, BED_DEEP, dk);
        [c0, c1, c2] = bed;
      } else if (selfWater || wj) {
        [c0, c1, c2] = WET;
      } else {
        c0 = this.tileCol[j * 3];
        c1 = this.tileCol[j * 3 + 1];
        c2 = this.tileCol[j * 3 + 2];
      }
      const w = j === self ? 2 : 1;
      r += c0 * w;
      g += c1 * w;
      b += c2 * w;
      s0 += this.tileSurf[j * 4] * w;
      s1 += this.tileSurf[j * 4 + 1] * w;
      s2 += this.tileSurf[j * 4 + 2] * w;
      wet += this.wetOf(j) * w;
      wsum += w;
      amp += (tj === T.Desert ? 0.075 : tj === T.Steppe ? 0.05 : tj === T.Oasis ? 0.045 : tj === T.Rock ? 0.06 : 0.04) * w;
      if (!wj && m.height[j] > selfH) higher = true;
    }
    if (wsum === 0) {
      out[0] = out[1] = out[2] = 0.5;
      surf[0] = surf[1] = surf[2] = surf[3] = 0;
      return;
    }
    r /= wsum;
    g /= wsum;
    b /= wsum;
    amp /= wsum;
    if (!selfWater && amp > 0) {
      const vi = py * (m.w + 1) + px;
      let d = this.duneV[vi];
      if (d !== d) d = this.duneV[vi] = dune(m.seed, px, py);
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
    out[0] = r;
    out[1] = g;
    out[2] = b;
    surf[0] = s0 / wsum;
    surf[1] = s1 / wsum;
    surf[2] = s2 / wsum;
    // Gewässerbett ist mit w = 2 markiert (kein Wolkenschatten, dunkler)
    surf[3] = selfWater ? 2 : wet / wsum;
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
    const s00: Surf = [0, 0, 0, 0];
    const s10: Surf = [0, 0, 0, 0];
    const s01: Surf = [0, 0, 0, 0];
    const s11: Surf = [0, 0, 0, 0];

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = m.idx(x, y);
        const local = (y - y0) * CHUNK + (x - x0);
        lStart[local] = land.count;
        const t = m.terrain[i];
        const wt = isWaterT(t);
        const yg = groundY(m, i);
        this.corner(i, x, y, c00, s00);
        this.corner(i, x + 1, y, c10, s10);
        this.corner(i, x, y + 1, c01, s01);
        this.corner(i, x + 1, y + 1, c11, s11);
        const A = [x, yg, y];
        const B = [x, yg, y + 1];
        const C = [x + 1, yg, y + 1];
        const D = [x + 1, yg, y];
        land.tri(A, B, C, c00, c01, c11, s00, s01, s11);
        land.tri(A, C, D, c00, c11, c10, s00, s11, s10);

        // Seitenflächen zu tieferen Nachbarn: Felsklippen bzw. Uferböschung
        const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          let yb = -1.4;
          if (m.inBounds(nx, ny)) yb = groundY(m, m.idx(nx, ny));
          if (yb >= yg - 0.001) continue;
          this.wall(land, x, y, dx, dy, yg, yb, t, c00, c10, c01, c11);
        }
        lCount[local] = land.count - lStart[local];

        if (wt) {
          wStart[local] = water.count;
          this.waterTile(water, x, y, i, t);
          wCount[local] = water.count - wStart[local];
        }
      }
    }

    const mk = (acc: MeshAcc, mat: THREE.Material, isWater: boolean): { mesh: THREE.Mesh; attr: THREE.BufferAttribute } => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
      const attr = new THREE.Float32BufferAttribute(acc.col, 3);
      geo.setAttribute('color', attr);
      if (isWater) {
        geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(acc.foam, 1));
        geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(acc.depth, 1));
        geo.setAttribute('aKind', new THREE.Float32BufferAttribute(acc.kind, 1));
      } else {
        geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(acc.surf, 4));
      }
      // Normalen werden für den Schattenversatz (normalBias) und die Klippenerkennung im Shader gebraucht
      geo.computeVertexNormals();
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
      W = mk(water, this.waterMat(this.waterAnimated), true);
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

  /**
   * Seitenfläche (Klippe/Böschung): 3 Schichten x 2 Spalten. Schichtgrenzen und Vorsprünge hängen an den Eckpunkten,
   * benachbarte Flächen schließen daher ohne Risse an. Farben wechseln schichtweise (warm/kühl), oben ein Rasenrand.
   */
  private wall(acc: MeshAcc, x: number, y: number, dx: number, dy: number, yTop: number, yBot: number, t: number, c00: RGB, c10: RGB, c01: RGB, c11: RGB): void {
    const m = this.map;
    // Eckpunkte der Kante (a -> b) im Uhrzeigersinn von außen gesehen
    let ax: number, az: number, bx: number, bz: number;
    if (dx === 1) { ax = x + 1; az = y + 1; bx = x + 1; bz = y; }
    else if (dx === -1) { ax = x; az = y; bx = x; bz = y + 1; }
    else if (dy === 1) { ax = x; az = y + 1; bx = x + 1; bz = y + 1; }
    else { ax = x + 1; az = y; bx = x; bz = y; }
    const seed = m.seed;
    const h1 = hash2(seed + 41, x * 4 + dx + 2, y * 4 + dy + 2);
    const h2 = hash2(seed + 43, x * 4 + dx + 2, y * 4 + dy + 2);
    const h3 = hash2(seed + 47, x * 4 + dx + 2, y * 4 + dy + 2);
    const nbWater = m.inBounds(x + dx, y + dy) && isWaterT(m.terrain[m.idx(x + dx, y + dy)]);
    const wetBank = isWaterT(t) ? false : yBot < -0.5 || nbWater;
    const waterSelf = isWaterT(t);
    const tc = (c00[0] + c10[0] + c01[0] + c11[0]) / 4;
    void tc;
    const topTile: RGB = [(c00[0] + c10[0] + c01[0] + c11[0]) / 4, (c00[1] + c10[1] + c01[1] + c11[1]) / 4, (c00[2] + c10[2] + c01[2] + c11[2]) / 4];
    // Schichtfarben (oben nach unten)
    const layer = (k: number, hh: number): RGB => {
      if (waterSelf) return mix(BED_SHALLOW, BED_DEEP, 0.3 + k * 0.25);
      const base = mix(mix(CLIFF_LIGHT, CLIFF_WARM, hh), CLIFF, 0.15 + k * 0.28 + hh * 0.18);
      return wetBank ? mix(base, WET, 0.25 + k * 0.22) : base;
    };
    const c0 = mix(layer(0, h1), topTile, wetBank ? 0.12 : 0.34);
    const c1 = layer(1, h2);
    const c2 = layer(2.5, hash2(seed + 49, x * 4 + dx + 2, y * 4 + dy + 2));
    const c3 = mix(wetBank ? BED_DEEP : CLIFF, [0.1, 0.09, 0.08], 0.3 + h3 * 0.15);
    const rowCols = [c0, c1, c2, c3];
    const edgeFog = (c: RGB, px: number, py: number): RGB => {
      const e = Math.min(px, py, m.w - px, m.h - py);
      if (e >= 10) return c;
      const f = 1 - e / 10;
      return mix(c, FOGC, f * f * 0.85);
    };
    const mxp = (ax + bx) / 2;
    const mzp = (az + bz) / 2;
    // Zeilenhöhen und Vorsprünge: an den Ecken aus dem Eckpunkt gewürfelt (nahtlos), in der Mitte aus der Fläche
    const rowT = [0, 0.34, 0.68, 1];
    const cornerRand = (px: number, pz: number, k: number): number => hash2(seed + 60 + k * 7, Math.round(px * 2), Math.round(pz * 2));
    const rowY = (px: number, pz: number, k: number, r: number): number => {
      const jitter = k === 0 || k === 3 ? 0 : (r - 0.5) * 0.18;
      return yTop + (yBot - yTop) * (rowT[k] + jitter);
    };
    const outAt = (k: number, r: number): number => (k === 0 || k === 3 ? (k === 3 ? 0.02 : 0) : 0.03 + r * 0.13);
    const mk = (px: number, pz: number, k: number, mid: boolean): number[] => {
      const r = mid ? (k === 1 ? h2 : h3) : cornerRand(px, pz, k);
      const out = mid ? outAt(k, r) : outAt(k, r) * 0.35;
      return [px + dx * out, rowY(px, pz, k, r), pz + dy * out];
    };
    const surfWall: Surf = [0, 0, 1, wetBank ? 1 : 0];
    const cols: number[][][] = [];
    for (let k = 0; k < 4; k++) cols.push([mk(ax, az, k, false), mk(mxp, mzp, k, true), mk(bx, bz, k, false)]);
    // leichte seitliche Verschiebung der Mittelpunkte für unregelmäßige Kanten
    const lateral = (h1 - 0.5) * 0.16;
    for (let k = 1; k < 3; k++) {
      cols[k][1][0] += -dy * lateral;
      cols[k][1][2] += dx * lateral;
    }
    for (let r = 0; r < 3; r++) {
      for (let cc = 0; cc < 2; cc++) {
        const p00 = cols[r][cc];
        const p01 = cols[r][cc + 1];
        const p10 = cols[r + 1][cc];
        const p11 = cols[r + 1][cc + 1];
        const ca = rowCols[r];
        const cb = rowCols[r + 1];
        const f = (c: RGB, p: number[]): RGB => edgeFog(c, p[0], p[2]);
        acc.tri(p00, p10, p11, f(ca, p00), f(cb, p10), f(cb, p11), surfWall, surfWall, surfWall);
        acc.tri(p00, p11, p01, f(ca, p00), f(cb, p11), f(ca, p01), surfWall, surfWall, surfWall);
      }
    }
  }

  /** Wasseroberfläche eines Tiles: vier Dreiecke um einen Mittelpunkt (Facetten fangen Licht), Tiefe/Schaum je Ecke. */
  private waterTile(acc: MeshAcc, x: number, y: number, i: number, t: number): void {
    const m = this.map;
    const yw = tileTopY(m, i);
    const moat = t === T.Moat;
    // Tiefe je Ecke: mittlerer Uferabstand der angrenzenden Wasser-Tiles (an Land 0)
    const cornerInfo = (px: number, py: number): { foam: number; depth: number } => {
      let sum = 0;
      let n = 0;
      let land = false;
      for (let k = 0; k < 4; k++) {
        const tx = px - 1 + (k & 1);
        const ty = py - 1 + (k >> 1);
        if (!m.inBounds(tx, ty)) continue;
        const j = m.idx(tx, ty);
        if (isWaterT(m.terrain[j])) {
          sum += Math.min(9, this.shore[j]);
          n++;
        } else land = true;
      }
      const d = land ? 0 : n ? sum / n : 4;
      // Gräben sind trüb und tief wirkend (dunkler Ton auch am Rand)
      return { foam: land ? 1 : 0, depth: moat ? Math.max(0.62, clamp01((d - 0.5) / 4.5)) : clamp01((d - 0.5) / 4.5) };
    };
    const fogC = (c: RGB, px: number, py: number): RGB => {
      const e = Math.min(px, py, m.w - px, m.h - py);
      if (e >= 10) return c;
      const f = 1 - e / 10;
      return mix(c, FOGC, f * f * 0.85);
    };
    const jitter = (hash2(m.seed + 53, x, y) - 0.5) * 0.06;
    const corners: [number, number][] = [[x, y], [x, y + 1], [x + 1, y + 1], [x + 1, y]];
    const info = corners.map(([px, py]) => cornerInfo(px, py));
    const dc = info.reduce((s, v) => s + v.depth, 0) / 4;
    const fc = info.reduce((s, v) => s + v.foam, 0) / 4;
    const tintOf = (d: number, px: number, py: number): RGB => {
      const c = waterTint(d, moat);
      return fogC([c[0] * (1 + jitter), c[1] * (1 + jitter), c[2] * (1 + jitter)], px, py);
    };
    const cols = corners.map(([px, py], k) => tintOf(info[k].depth, px, py));
    const cmid = tintOf(dc, x + 0.5, y + 0.5);
    const kind = moat ? 1 : 0;
    const mid = [x + 0.5, yw, y + 0.5];
    for (let k = 0; k < 4; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % 4];
      const kb = (k + 1) % 4;
      // Windung so, dass die Fläche nach oben zeigt
      acc.vert(b[0], yw, b[1], cols[kb], [0, 0, 0, 0], info[kb].foam, info[kb].depth, kind);
      acc.vert(mid[0], yw, mid[2], cmid, [0, 0, 0, 0], fc, dc, kind);
      acc.vert(a[0], yw, a[1], cols[k], [0, 0, 0, 0], info[k].foam, info[k].depth, kind);
    }
    void WHITE;
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
