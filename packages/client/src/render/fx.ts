import * as THREE from 'three';
import { PAL } from '@strongpoly/shared';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  grav: number;
  shrink: boolean;
}

const CAP = 3000;

/** Einfaches Partikelsystem (instanzierte Würfel). */
export class FxSystem {
  readonly mesh: THREE.InstancedMesh;
  private ps: Particle[] = [];
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private tc = new THREE.Color();

  constructor() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.mesh = new THREE.InstancedMesh(g, m, CAP);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
  }

  spawn(x: number, y: number, z: number, n: number, color: number, speed: number, up: number, size: number, life: number, grav = 9): void {
    for (let i = 0; i < n && this.ps.length < CAP; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.ps.push({
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: up * (0.4 + Math.random() * 0.8),
        life,
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: new THREE.Color(color),
        grav,
        shrink: true,
      });
    }
  }

  /** Spezialeffekte nach Namen (aus Sim-Events) */
  effect(kind: string, x: number, y: number, z: number): void {
    switch (kind) {
      case 'collapse':
        this.spawn(x, z, y, 36, PAL.stone, 3.5, 4, 0.28, 1.2);
        this.spawn(x, z, y, 16, PAL.sandDark, 2, 3, 0.4, 1.6, 2);
        break;
      case 'collapseWood':
        this.spawn(x, z, y, 30, PAL.wood, 3.5, 4, 0.22, 1.2);
        this.spawn(x, z, y, 10, PAL.roof, 2, 3, 0.3, 1.2, 2);
        break;
      case 'explosion':
        this.spawn(x, z, y, 24, PAL.gold, 3, 3, 0.2, 0.7);
        this.spawn(x, z, y, 16, PAL.roof, 3, 2, 0.25, 0.8);
        this.spawn(x, z, y, 10, PAL.stoneDark, 2, 3, 0.3, 1.0);
        break;
      case 'hit':
        this.spawn(x, z, y, 5, PAL.roof, 1.4, 1.6, 0.1, 0.4);
        break;
      case 'dust':
        this.spawn(x, z, y, 6, PAL.sandDark, 1.2, 0.8, 0.2, 0.7, 1);
        break;
      case 'heal':
        this.spawn(x, z, y, 8, PAL.treeLight, 0.8, 2.4, 0.12, 0.9, -2);
        break;
      case 'arrows':
        this.spawn(x, z + 4, y, 8, PAL.wood, 1.2, -1, 0.1, 0.5, 0);
        break;
      case 'splash':
        this.spawn(x, z, y, 10, PAL.water, 1.6, 3, 0.14, 0.7);
        break;
      case 'leave':
        this.spawn(x, z, y, 4, PAL.white, 0.6, 1.5, 0.1, 0.8, -1);
        break;
      case 'fire':
        this.spawn(x, z, y, 2, PAL.gold, 0.3, 2.2, 0.16, 0.7, -3);
        this.spawn(x, z, y, 1, PAL.roof, 0.3, 1.8, 0.16, 0.6, -2);
        break;
      case 'oil':
        this.spawn(x, z + 1, y, 18, PAL.black, 1.8, 1, 0.16, 0.9);
        this.spawn(x, z + 1, y, 10, PAL.gold, 1.4, 1, 0.14, 0.8);
        break;
      case 'banner':
        this.spawn(x, z, y, 14, PAL.gold, 1.5, 3.5, 0.16, 1.2, -1);
        break;
      case 'rock':
        this.spawn(x, z + 6, y, 20, PAL.rockDark, 1.8, 0, 0.35, 0.9, 14);
        break;
      default:
        this.spawn(x, z, y, 6, PAL.white, 1, 1, 0.12, 0.6);
    }
  }

  update(dt: number): void {
    const ps = this.ps;
    let n = 0;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const col = (this.mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    for (const p of ps) {
      const s = p.size * (p.shrink ? Math.max(0.1, p.life / p.max) : 1);
      this.tmp.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(s, s, s));
      this.tmp.toArray(arr, n * 16);
      col[n * 3] = p.color.r;
      col[n * 3 + 1] = p.color.g;
      col[n * 3 + 2] = p.color.b;
      n++;
    }
    void this.tc;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
