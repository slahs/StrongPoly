import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, PAL, T, hash2 } from '@strongpoly/shared';
import { ModelBuilder } from './builder';
import { grassMaterial, staticMaterial } from './materials';
import type { QualityCfg } from './quality';
import { qualityOf } from './quality';

function treePine(v: number): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.3, aoH: 0.5 });
  b.cyl(0.07, 0.1, 0.35, 5, 0, 0, 0, PAL.trunk);
  b.cone(0.4, 0.6, 6, 0, 0.25, 0, v ? PAL.treeLight : PAL.treeDark);
  b.cone(0.3, 0.5, 6, 0, 0.6, 0, v ? PAL.treeDark : PAL.treeLight);
  b.cone(0.17, 0.35, 5, 0, 0.92, 0, PAL.treeLight);
  return b.build().body;
}
function treeBroad(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.3, aoH: 0.5 });
  b.cyl(0.07, 0.1, 0.45, 5, 0, 0, 0, PAL.trunk);
  b.boulder(0.36, 0.3, 0.36, 0, 0.62, 0, 3, PAL.treeLight);
  b.boulder(0.24, 0.22, 0.24, 0.18, 0.84, 0.05, 7, PAL.treeDark);
  return b.build().body;
}
function palmModel(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.3, aoH: 0.5 });
  b.cyl(0.05, 0.08, 0.55, 4, 0, 0, 0, PAL.trunk);
  b.cyl(0.045, 0.05, 0.25, 4, 0.04, 0.55, 0, PAL.trunk);
  // Wedel: flache, abfallende Keile in vier Richtungen
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.cone(0.16, 0.34, 3, Math.cos(a) * 0.2 + 0.04, 0.74 - 0.05, Math.sin(a) * 0.2, i % 2 ? PAL.treeLight : PAL.treeDark);
  }
  b.cone(0.18, 0.2, 5, 0.04, 0.78, 0, PAL.treeLight);
  return b.build().body;
}
function peakModel(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.35, aoH: 0.8 });
  b.cone(0.62, 1.1, 5, 0, 0, 0, PAL.rock);
  b.cone(0.3, 0.7, 5, 0.25, 0, 0.1, PAL.rockDark);
  b.boulder(0.3, 0.22, 0.28, -0.3, 0.1, 0.2, 5, PAL.rockDark);
  b.cone(0.16, 0.26, 4, 0, 1.0, 0, PAL.stone);
  return b.build().body;
}
/** Steinvorkommen: Haufen heller, kantiger Brocken mit dunklen Spalten */
function stoneModel(v: number): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.4, aoH: 0.4 });
  b.boulder(0.34, 0.3, 0.3, -0.05, 0.12, 0.02, 11 + v, PAL.stone);
  b.boulder(0.24, 0.24, 0.22, 0.28, 0.08, 0.1, 21 + v, PAL.stoneDark);
  b.boulder(0.2, 0.3, 0.2, -0.28, 0.1, -0.22, 31 + v, PAL.stone);
  b.boulder(0.16, 0.14, 0.15, 0.1, 0.06, -0.3, 41 + v, PAL.stoneDark);
  b.boulder(0.12, 0.1, 0.1, 0.34, 0.04, -0.2, 51 + v, PAL.stone);
  b.boulder(0.1, 0.34, 0.1, -0.02, 0.28, 0.0, 61 + v, PAL.white);
  return b.build().body;
}
/** Eisenader: dunkle Brocken, durchzogen von rostroten und goldenen Erzadern/Kristallen */
function oreModel(v: number): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.4, aoH: 0.4 });
  b.boulder(0.34, 0.3, 0.3, -0.05, 0.12, 0.02, 13 + v, PAL.rockDark);
  b.boulder(0.24, 0.26, 0.22, 0.28, 0.08, 0.1, 23 + v, PAL.black);
  b.boulder(0.2, 0.32, 0.2, -0.28, 0.1, -0.22, 33 + v, PAL.rockDark);
  b.boulder(0.16, 0.14, 0.15, 0.1, 0.06, -0.3, 43 + v, PAL.black);
  // Adern: schräg liegende Streifen und Kristallspitzen in Rost und Gold
  b.box(0.5, 0.05, 0.07, -0.02, 0.3, 0.12, PAL.roof, false, 0.5);
  b.box(0.38, 0.05, 0.06, 0.16, 0.24, -0.06, PAL.roof, false, -0.7);
  b.box(0.3, 0.05, 0.06, -0.26, 0.26, -0.2, PAL.gold, false, 0.2);
  b.pyramid(0.07, 0.2, 0.2, 0.2, 0.12, PAL.roof);
  b.pyramid(0.05, 0.16, -0.12, 0.3, -0.1, PAL.gold);
  b.pyramid(0.06, 0.18, 0.02, 0.28, 0.18, PAL.roof);
  return b.build().body;
}
function pitchModel(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.1 });
  b.cyl(0.38, 0.42, 0.06, 7, 0, 0, 0, PAL.pitch);
  b.cyl(0.16, 0.22, 0.14, 6, 0.1, 0, 0.05, PAL.black);
  b.cyl(0.08, 0.1, 0.1, 5, -0.18, 0.04, -0.1, PAL.black);
  return b.build().body;
}
function grassGeo(dry: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color(dry ? PAL.steppeDark : PAL.oasisDark).multiplyScalar(dry ? 0.95 : 0.8);
  const tip = new THREE.Color(dry ? PAL.steppe : PAL.treeLight);
  if (dry) tip.lerp(new THREE.Color(PAL.thatch), 0.35);
  const blades = 6;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const r = 0.03 + (i % 3) * 0.025;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const h = (dry ? 0.1 : 0.17) + (i % 4) * (dry ? 0.04 : 0.06);
    const lean = 0.07 + (i % 2) * 0.05;
    const tx = cx + Math.cos(a) * lean;
    const tz = cz + Math.sin(a) * lean;
    const ox = -Math.sin(a) * 0.028;
    const oz = Math.cos(a) * 0.028;
    pos.push(cx - ox, 0, cz - oz, cx + ox, 0, cz + oz, tx, h, tz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

type Kind = 'pine' | 'pine2' | 'broad' | 'palm' | 'peak' | 'stone' | 'stone2' | 'ore' | 'ore2' | 'pitch' | 'grass' | 'grassDry';
const KINDS: Kind[] = ['pine', 'pine2', 'broad', 'palm', 'peak', 'stone', 'stone2', 'ore', 'ore2', 'pitch', 'grass', 'grassDry'];

/** Statische Dekoration (Bäume, Felsen, Vorkommen, Gras) als InstancedMeshes, nur im Sichtbereich. */
export class DecorRenderer {
  readonly group = new THREE.Group();
  private lit = staticMaterial();
  private meshes: Partial<Record<Kind, THREE.InstancedMesh>> = {};
  private geoCache: Partial<Record<Kind, THREE.BufferGeometry>> = {};
  private lists = new Map<Kind, number[]>();
  private dirty = true;
  private lastBuild = -10;
  private explored: Uint8Array | null = null;
  private q: QualityCfg = qualityOf('medium');
  private shadows = true;
  private cx = -1e9;
  private cz = -1e9;
  /** Belegung durch Gebäude (Client-Spiegel), damit kein Gras durch Felder wächst */
  private occupied: Int32Array | null = null;

  constructor(private map: GameMap) {
    this.group.name = 'decor';
    for (const k of KINDS) this.lists.set(k, []);
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.dirty = true;
  }

  setOccupancy(a: Int32Array | null): void {
    this.occupied = a;
    this.dirty = true;
  }

  /** Erkundungskarte (Kriegsnebel): nicht erkundete Tiles bekommen keine Dekoration */
  setExplored(e: Uint8Array | null): void {
    this.explored = e;
    this.dirty = true;
  }

  applyQuality(q: QualityCfg, shadows: boolean): void {
    this.q = q;
    this.shadows = shadows;
    for (const k of KINDS) {
      const m = this.meshes[k];
      if (m) m.castShadow = shadows && q.shadowDecor && k !== 'grass' && k !== 'grassDry';
    }
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(now: number, camX = this.map.w / 2, camZ = this.map.h / 2): void {
    const moved = Math.abs(camX - this.cx) > 5 || Math.abs(camZ - this.cz) > 5;
    if (!(this.dirty || moved) || now - this.lastBuild < 0.35) return;
    this.dirty = false;
    this.lastBuild = now;
    this.cx = camX;
    this.cz = camZ;
    this.rebuild(camX, camZ);
  }

  private geo(k: Kind): THREE.BufferGeometry {
    let g = this.geoCache[k];
    if (!g) {
      switch (k) {
        case 'pine': g = treePine(0); break;
        case 'pine2': g = treePine(1); break;
        case 'broad': g = treeBroad(); break;
        case 'palm': g = palmModel(); break;
        case 'peak': g = peakModel(); break;
        case 'stone': g = stoneModel(0); break;
        case 'stone2': g = stoneModel(7); break;
        case 'ore': g = oreModel(0); break;
        case 'ore2': g = oreModel(5); break;
        case 'pitch': g = pitchModel(); break;
        case 'grass': g = grassGeo(false); break;
        default: g = grassGeo(true);
      }
      this.geoCache[k] = g;
    }
    return g;
  }

  private ensure(k: Kind, count: number): THREE.InstancedMesh {
    let m = this.meshes[k];
    if (!m || m.instanceMatrix.count < count) {
      if (m) {
        this.group.remove(m);
        m.dispose();
      }
      const grass = k === 'grass' || k === 'grassDry';
      m = new THREE.InstancedMesh(this.geo(k), grass ? grassMaterial() : this.lit, Math.max(32, Math.ceil(count * 1.3)));
      m.castShadow = this.shadows && this.q.shadowDecor && !grass;
      m.receiveShadow = false;
      m.frustumCulled = false;
      this.meshes[k] = m;
      this.group.add(m);
    }
    return m;
  }

  rebuild(camX: number, camZ: number): void {
    const map = this.map;
    for (const l of this.lists.values()) l.length = 0;
    const L = (k: Kind): number[] => this.lists.get(k)!;
    const r = this.q.decorRadius;
    const xa = Math.max(0, Math.floor(camX - r));
    const xb = Math.min(map.w - 1, Math.ceil(camX + r));
    const za = Math.max(0, Math.floor(camZ - r));
    const zb = Math.min(map.h - 1, Math.ceil(camZ + r));
    const gr = Math.min(r, 62);
    const grassN = this.q.grassPerTile;
    let grassCount = 0;
    for (let y = za; y <= zb; y++) {
      for (let x = xa; x <= xb; x++) {
        const i = map.idx(x, y);
        if (this.explored && !this.explored[i]) continue;
        const t = map.terrain[i];
        const base = map.height[i] * HEIGHT_STEP;
        const r1 = hash2(map.seed + 3, x, y);
        const r2 = hash2(map.seed + 4, x, y);
        const r3 = hash2(map.seed + 5, x, y);
        if (map.trees[i] > 0) {
          const k: Kind = t === T.Oasis ? 'palm' : r1 < 0.55 ? 'pine' : r1 < 0.8 ? 'pine2' : 'broad';
          L(k).push(x + 0.5 + (r1 - 0.5) * 0.5, base, y + 0.5 + (r2 - 0.5) * 0.5, r3 * 6.28, 0.8 + r1 * 0.6);
        } else if (t === T.Rock) {
          L('peak').push(x + 0.5, base, y + 0.5, r3 * 6.28, 0.8 + r2 * 1.1);
        } else if (t === T.StoneDeposit) {
          L(r1 < 0.5 ? 'stone' : 'stone2').push(x + 0.5, base, y + 0.5, r3 * 6.28, 1.0 + r2 * 0.25);
        } else if (t === T.IronDeposit) {
          L(r1 < 0.5 ? 'ore' : 'ore2').push(x + 0.5, base, y + 0.5, r3 * 6.28, 1.0 + r2 * 0.25);
        } else if (t === T.PitchSpring) {
          L('pitch').push(x + 0.5, base, y + 0.5, r3 * 6.28, 0.9 + r1 * 0.3);
        } else if (grassN > 0 && (t === T.Oasis || t === T.Steppe || t === T.Swamp) && Math.abs(x - camX) <= gr && Math.abs(y - camZ) <= gr && (!this.occupied || !this.occupied[i])) {
          const n = t === T.Oasis ? grassN : t === T.Swamp ? Math.ceil(grassN * 0.6) : r2 < 0.3 ? Math.ceil(grassN * 0.3) : 0;
          const dry = t === T.Steppe;
          const list = L(dry ? 'grassDry' : 'grass');
          for (let g = 0; g < n && grassCount < this.q.grassMax; g++, grassCount++) {
            const gx = x + hash2(map.seed + 61 + g, x, y);
            const gz = y + hash2(map.seed + 71 + g, x, y);
            list.push(gx, base, gz, hash2(map.seed + 81 + g, x, y) * 6.28, 0.8 + hash2(map.seed + 91 + g, x, y) * 0.7);
          }
        }
      }
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    const pv = new THREE.Vector3();
    const sv = new THREE.Vector3();
    for (const k of KINDS) {
      const l = L(k);
      const count = l.length / 5;
      if (count === 0 && !this.meshes[k]) continue;
      const mesh = this.ensure(k, count);
      const arr = mesh.instanceMatrix.array as Float32Array;
      for (let n = 0; n < count; n++) {
        const o = n * 5;
        q.setFromAxisAngle(axis, l[o + 3]);
        const s = l[o + 4];
        pv.set(l[o], l[o + 1], l[o + 2]);
        sv.set(s, s, s);
        m4.compose(pv, q, sv);
        m4.toArray(arr, n * 16);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
