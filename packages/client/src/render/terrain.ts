import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, PAL, T, hash2 } from '@strongpoly/shared';

export const FOG_COLOR = 0xcfd8dc;
const CHUNK = 32;

function col(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

interface TerrainColors {
  a: [number, number, number];
  b: [number, number, number];
}
const TC: Record<number, TerrainColors> = {
  [T.Desert]: { a: col(PAL.sand), b: col(PAL.sandDark) },
  [T.Steppe]: { a: col(PAL.steppe), b: col(PAL.steppeDark) },
  [T.Oasis]: { a: col(PAL.oasis), b: col(PAL.oasisDark) },
  [T.Rock]: { a: col(PAL.rock), b: col(PAL.rockDark) },
  [T.Water]: { a: col(PAL.water), b: col(PAL.waterDeep) },
  [T.Swamp]: { a: col(PAL.swamp), b: col(PAL.steppeDark) },
  [T.StoneDeposit]: { a: col(PAL.stone), b: col(PAL.stoneDark) },
  [T.IronDeposit]: { a: col(PAL.rockDark), b: col(PAL.black) },
  [T.PitchSpring]: { a: col(PAL.pitch), b: col(PAL.swamp) },
  [T.Moat]: { a: col(PAL.water), b: col(PAL.waterDeep) },
};
const CLIFF = col(PAL.rockDark);
const FOGC = col(FOG_COLOR);

export function tileTopY(map: GameMap, i: number): number {
  const t = map.terrain[i];
  if (t === T.Water) return -0.25;
  if (t === T.Moat) return map.height[i] * HEIGHT_STEP - 0.3;
  return map.height[i] * HEIGHT_STEP;
}

/** Terrain als Chunks aus flach schattierten Terrassen-Quads (Vertexfarben, keine Texturen). */
export class TerrainRenderer {
  readonly group = new THREE.Group();
  private chunks = new Map<number, THREE.Mesh>();
  private dirty = new Set<number>();
  private cw = 0;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  private chunkData = new Map<number, { base: Float32Array; starts: Int32Array; counts: Int32Array; colorAttr: THREE.BufferAttribute }>();
  private fogState: Uint8Array | null = null;
  private fogVis: Uint8Array | null = null;
  private fogExp: Uint8Array | null = null;

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

  rebuildAll(): void {
    for (const m of this.chunks.values()) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.chunks.clear();
    this.chunkData.clear();
    this.fogState = this.fogVis ? new Uint8Array(this.map.n).fill(255) : null;
    const ch = Math.ceil(this.map.h / CHUNK);
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.buildChunk(cx, cy);
  }

  markTile(x: number, y: number): void {
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    this.dirty.add(cy * this.cw + cx);
    // Nachbar-Chunks bei Kantenänderung (Klippen)
    const lx = x % CHUNK;
    const ly = y % CHUNK;
    if (lx === 0 && cx > 0) this.dirty.add(cy * this.cw + cx - 1);
    if (lx === CHUNK - 1) this.dirty.add(cy * this.cw + cx + 1);
    if (ly === 0 && cy > 0) this.dirty.add((cy - 1) * this.cw + cx);
    if (ly === CHUNK - 1) this.dirty.add((cy + 1) * this.cw + cx);
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

  private buildChunk(cx: number, cy: number): void {
    const m = this.map;
    const key = cy * this.cw + cx;
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(m.w, x0 + CHUNK);
    const y1 = Math.min(m.h, y0 + CHUNK);
    const pos: number[] = [];
    const colr: number[] = [];
    const tStart = new Int32Array(CHUNK * CHUNK).fill(-1);
    const tCount = new Int32Array(CHUNK * CHUNK);

    const quad = (a: number[], b: number[], c: number[], d: number[], color: number[]) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) colr.push(color[0], color[1], color[2]);
    };
    const fog = (x: number, z: number, c: [number, number, number]): number[] => {
      const edge = Math.min(x, z, m.w - x, m.h - z);
      const f = edge < 10 ? 1 - edge / 10 : 0;
      const k = f * f * 0.85;
      return [c[0] + (FOGC[0] - c[0]) * k, c[1] + (FOGC[1] - c[1]) * k, c[2] + (FOGC[2] - c[2]) * k];
    };

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = m.idx(x, y);
        const local = (y - y0) * CHUNK + (x - x0);
        tStart[local] = colr.length / 3;
        const t = m.terrain[i];
        const y_ = tileTopY(m, i);
        const tc = TC[t] ?? TC[T.Steppe];
        const shade = hash2(m.seed + 17, x, y) < 0.5 ? tc.a : tc.b;
        const c = fog(x + 0.5, y + 0.5, shade);
        quad([x, y_, y], [x, y_, y + 1], [x + 1, y_, y + 1], [x + 1, y_, y], c);
        // Klippen/Seitenflächen zu tieferen Nachbarn
        const sides: [number, number, number, number][] = [
          [1, 0, 0, 1], // +x: Kante bei x+1
          [-1, 0, 0, 0],
          [0, 1, 1, 0],
          [0, -1, 1, 1],
        ];
        for (const [dx, dy] of sides) {
          const nx = x + dx;
          const ny = y + dy;
          let ny_ = -1.2;
          if (m.inBounds(nx, ny)) ny_ = tileTopY(m, m.idx(nx, ny));
          if (ny_ >= y_ - 0.001) continue;
          const cc = fog(x + 0.5, y + 0.5, t === T.Water || t === T.Moat ? TC[T.Water].b : CLIFF);
          if (dx === 1) quad([x + 1, y_, y + 1], [x + 1, ny_, y + 1], [x + 1, ny_, y], [x + 1, y_, y], cc);
          else if (dx === -1) quad([x, y_, y], [x, ny_, y], [x, ny_, y + 1], [x, y_, y + 1], cc);
          else if (dy === 1) quad([x, y_, y + 1], [x, ny_, y + 1], [x + 1, ny_, y + 1], [x + 1, y_, y + 1], cc);
          else quad([x + 1, y_, y], [x + 1, ny_, y], [x, ny_, y], [x, y_, y], cc);
        }
        tCount[local] = colr.length / 3 - tStart[local];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const colorAttr = new THREE.Float32BufferAttribute(colr, 3);
    geo.setAttribute('color', colorAttr);
    this.chunkData.set(key, { base: Float32Array.from(colr), starts: tStart, counts: tCount, colorAttr });
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.chunks.set(key, mesh);
    this.group.add(mesh);
    if (this.fogVis && this.fogExp && this.fogState) this.applyFogChunk(cx, cy, true);
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
    const d = this.chunkData.get(cy * this.cw + cx);
    const vis = this.fogVis;
    const exp = this.fogExp;
    const st = this.fogState;
    if (!d || !vis || !exp || !st) return;
    const m = this.map;
    const arr = d.colorAttr.array as Float32Array;
    let changed = false;
    const x1 = Math.min(m.w, (cx + 1) * CHUNK);
    const y1 = Math.min(m.h, (cy + 1) * CHUNK);
    for (let y = cy * CHUNK; y < y1; y++)
      for (let x = cx * CHUNK; x < x1; x++) {
        const i = y * m.w + x;
        const s = vis[i] ? 2 : exp[i] ? 1 : 0;
        if (!force && st[i] === s) continue;
        st[i] = s;
        const local = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
        const start = d.starts[local];
        if (start < 0) continue;
        const f = s === 2 ? 1 : s === 1 ? 0.55 : 0.08;
        for (let v = start * 3; v < (start + d.counts[local]) * 3; v++) arr[v] = d.base[v] * f;
        changed = true;
      }
    if (changed) d.colorAttr.needsUpdate = true;
  }

  setShadows(on: boolean): void {
    for (const m of this.chunks.values()) m.receiveShadow = on;
  }
}
