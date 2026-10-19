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
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

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
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.chunks.set(key, mesh);
    this.group.add(mesh);
  }

  setShadows(on: boolean): void {
    for (const m of this.chunks.values()) m.receiveShadow = on;
  }
}
