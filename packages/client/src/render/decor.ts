import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, PAL, T, hash2 } from '@strongpoly/shared';
import { ModelBuilder } from './builder';

function treeModel(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cyl(0.07, 0.1, 0.35, 5, 0, 0, 0, PAL.trunk);
  b.cone(0.38, 0.6, 6, 0, 0.25, 0, PAL.treeDark);
  b.cone(0.28, 0.5, 6, 0, 0.6, 0, PAL.treeLight);
  return b.build().body;
}
function palmModel(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cyl(0.05, 0.08, 0.7, 4, 0, 0, 0, PAL.trunk);
  b.cone(0.4, 0.14, 5, 0, 0.66, 0, PAL.treeLight);
  b.cone(0.22, 0.14, 5, 0, 0.78, 0, PAL.treeDark);
  return b.build().body;
}
function rockModel(color: number, dark: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.pyramid(0.46, 0.5, -0.05, 0, 0.0, color);
  b.pyramid(0.3, 0.38, 0.3, 0, 0.22, dark);
  b.pyramid(0.26, 0.3, -0.3, 0, -0.2, dark);
  return b.build().body;
}
function peakModel(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cone(0.62, 1.1, 5, 0, 0, 0, PAL.rock);
  b.cone(0.3, 0.7, 5, 0.25, 0, 0.1, PAL.rockDark);
  return b.build().body;
}
function pitchModel(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cyl(0.35, 0.4, 0.08, 6, 0, 0, 0, PAL.pitch);
  b.cyl(0.14, 0.2, 0.18, 5, 0.1, 0, 0.05, PAL.black);
  return b.build().body;
}

/** Statische Dekoration (Bäume, Felsen, Vorkommen) als InstancedMeshes. */
export class DecorRenderer {
  readonly group = new THREE.Group();
  private mats = {
    lit: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
  private meshes: Record<string, THREE.InstancedMesh> = {};
  private dirty = true;
  private lastBuild = 0;
  private explored: Uint8Array | null = null;

  constructor(private map: GameMap) {
    this.group.name = 'decor';
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.dirty = true;
  }

  /** Erkundungskarte (Kriegsnebel): nicht erkundete Tiles bekommen keine Dekoration */
  setExplored(e: Uint8Array | null): void {
    this.explored = e;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(now: number): void {
    if (!this.dirty || now - this.lastBuild < 0.4) return;
    this.dirty = false;
    this.lastBuild = now;
    this.rebuild();
  }

  private ensure(name: string, geo: THREE.BufferGeometry, count: number): THREE.InstancedMesh {
    let m = this.meshes[name];
    if (!m || m.instanceMatrix.count < count) {
      if (m) {
        this.group.remove(m);
        m.dispose();
      }
      m = new THREE.InstancedMesh(geo, this.mats.lit, Math.max(16, Math.ceil(count * 1.2)));
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      this.meshes[name] = m;
      this.group.add(m);
    }
    return m;
  }

  private geoCache: Record<string, THREE.BufferGeometry> = {};
  private geo(name: string, f: () => THREE.BufferGeometry): THREE.BufferGeometry {
    return (this.geoCache[name] ??= f());
  }

  rebuild(): void {
    const map = this.map;
    const lists: Record<string, number[]> = { tree: [], palm: [], rock: [], ore: [], peak: [], pitch: [] };
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const i = map.idx(x, y);
        if (this.explored && !this.explored[i]) continue;
        const t = map.terrain[i];
        const base = map.height[i] * HEIGHT_STEP;
        const r1 = hash2(map.seed + 3, x, y);
        const r2 = hash2(map.seed + 4, x, y);
        const r3 = hash2(map.seed + 5, x, y);
        if (map.trees[i] > 0) {
          const k = t === T.Oasis ? 'palm' : 'tree';
          lists[k].push(x + 0.5 + (r1 - 0.5) * 0.5, base, y + 0.5 + (r2 - 0.5) * 0.5, r3 * 6.28, 0.8 + r1 * 0.6);
        } else if (t === T.Rock) {
          lists.peak.push(x + 0.5, base, y + 0.5, r3 * 6.28, 0.8 + r2 * 1.1);
        } else if (t === T.StoneDeposit) {
          lists.rock.push(x + 0.5, base, y + 0.5, r3 * 6.28, 0.8 + r1 * 0.4);
        } else if (t === T.IronDeposit) {
          lists.ore.push(x + 0.5, base, y + 0.5, r3 * 6.28, 0.8 + r1 * 0.4);
        } else if (t === T.PitchSpring) {
          lists.pitch.push(x + 0.5, base, y + 0.5, r3 * 6.28, 0.9 + r1 * 0.3);
        }
      }
    }
    const geos: Record<string, () => THREE.BufferGeometry> = {
      tree: treeModel,
      palm: palmModel,
      rock: () => rockModel(PAL.stone, PAL.stoneDark),
      ore: () => rockModel(PAL.rockDark, PAL.black),
      peak: peakModel,
      pitch: pitchModel,
    };
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    for (const name of Object.keys(lists)) {
      const l = lists[name];
      const count = l.length / 5;
      const mesh = this.ensure(name, this.geo(name, geos[name]), count);
      for (let k = 0; k < count; k++) {
        const o = k * 5;
        q.setFromAxisAngle(axis, l[o + 3]);
        const s = l[o + 4];
        m4.compose(new THREE.Vector3(l[o], l[o + 1], l[o + 2]), q, new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(k, m4);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
