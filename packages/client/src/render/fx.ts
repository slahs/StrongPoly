import * as THREE from 'three';
import { PAL } from '@strongpoly/shared';
import { QualityCfg, qualityOf } from './quality';

function rgb(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
const C = {
  stone: rgb(PAL.stone),
  stoneDark: rgb(PAL.stoneDark),
  rockDark: rgb(PAL.rockDark),
  sandDark: rgb(PAL.sandDark),
  sand: rgb(PAL.sand),
  wood: rgb(PAL.wood),
  woodDark: rgb(PAL.woodDark),
  roof: rgb(PAL.roof),
  gold: rgb(PAL.gold),
  black: rgb(PAL.black),
  white: rgb(PAL.white),
  water: rgb(PAL.water),
  treeLight: rgb(PAL.treeLight),
  smoke: [0.62, 0.6, 0.57] as [number, number, number],
  smokeDark: [0.2, 0.19, 0.18] as [number, number, number],
  blood: [0.45, 0.06, 0.05] as [number, number, number],
  flameA: [1.0, 0.62, 0.15] as [number, number, number],
  flameB: [1.0, 0.32, 0.08] as [number, number, number],
};

const BILLBOARD_VS = /* glsl */ `
attribute vec4 iPos;
attribute vec4 iCol;
uniform float uFlat;
varying vec4 vCol;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vCol = iCol;
  vUv = position.xy * 2.0;
  vec4 mvPosition = viewMatrix * vec4(iPos.xyz, 1.0);
  if (uFlat > 0.5) {
    vec3 w = iPos.xyz + vec3(position.x, 0.0, position.y) * iPos.w;
    mvPosition = viewMatrix * vec4(w, 1.0);
  } else {
    mvPosition.xy += position.xy * iPos.w;
  }
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const BILLBOARD_FS = /* glsl */ `
uniform float uShape;
varying vec4 vCol;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float d = max(abs(vUv.x) * 0.866 + abs(vUv.y) * 0.5, abs(vUv.y));
  float r = uShape > 0.5 ? max(abs(vUv.x), abs(vUv.y)) : d;
  float a = uShape > 1.5 ? 1.0 - smoothstep(0.55, 1.0, max(abs(vUv.x), abs(vUv.y))) : smoothstep(1.0, 0.45, r);
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  if (gl_FragColor.a < 0.01) discard;
  #include <fog_fragment>
}
`;

/** Billboard-/Flächen-Schicht: Instanzen mit Position+Größe und Farbe+Alpha, ein Draw Call. */
export class BillboardLayer {
  readonly mesh: THREE.Mesh;
  readonly geo: THREE.InstancedBufferGeometry;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  private pAttr: THREE.InstancedBufferAttribute;
  private cAttr: THREE.InstancedBufferAttribute;
  n = 0;

  constructor(
    readonly cap: number,
    opts: { additive?: boolean; flat?: boolean; shape?: number; order?: number; depthTest?: boolean } = {},
  ) {
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setIndex(quad.getIndex());
    this.pos = new Float32Array(cap * 4);
    this.col = new Float32Array(cap * 4);
    this.pAttr = new THREE.InstancedBufferAttribute(this.pos, 4);
    this.cAttr = new THREE.InstancedBufferAttribute(this.col, 4);
    this.pAttr.setUsage(THREE.DynamicDrawUsage);
    this.cAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.pAttr);
    this.geo.setAttribute('iCol', this.cAttr);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VS,
      fragmentShader: BILLBOARD_FS,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uFlat: { value: opts.flat ? 1 : 0 }, uShape: { value: opts.shape ?? 0 } },
      ]),
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest !== false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.order ?? 3;
  }

  /** Nach dem Befüllen aufrufen */
  commit(): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this.pAttr.clearUpdateRanges();
    this.cAttr.clearUpdateRanges();
    if (this.n > 0) {
      this.pAttr.addUpdateRange(0, this.n * 4);
      this.cAttr.addUpdateRange(0, this.n * 4);
    }
    this.pAttr.needsUpdate = true;
    this.cAttr.needsUpdate = true;
  }

  push(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    if (this.n >= this.cap) return;
    const o = this.n * 4;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
    this.pos[o + 3] = size;
    this.col[o] = r;
    this.col[o + 1] = g;
    this.col[o + 2] = b;
    this.col[o + 3] = a;
    this.n++;
  }
}

/** Partikel-Pool (Struct-of-Arrays) für Billboard-Partikel mit Lebensdauer. */
class Pool {
  cap: number;
  n = 0;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  life: Float32Array;
  max: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  constructor(cap: number) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.g = new Float32Array(cap);
    this.b = new Float32Array(cap);
    this.a = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
  }
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: [number, number, number], a: number, grav: number, drag: number): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2]; this.a[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  step(dt: number): void {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) this.copy(i, l);
        continue;
      }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k;
      this.vz[i] *= k;
      this.vy[i] = (this.vy[i] - this.grav[i] * dt) * (this.drag[i] > 0 ? k : 1);
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
    }
  }
  private copy(d: number, s: number): void {
    this.x[d] = this.x[s]; this.y[d] = this.y[s]; this.z[d] = this.z[s];
    this.vx[d] = this.vx[s]; this.vy[d] = this.vy[s]; this.vz[d] = this.vz[s];
    this.life[d] = this.life[s]; this.max[d] = this.max[s];
    this.s0[d] = this.s0[s]; this.s1[d] = this.s1[s];
    this.r[d] = this.r[s]; this.g[d] = this.g[s]; this.b[d] = this.b[s]; this.a[d] = this.a[s];
    this.grav[d] = this.grav[s]; this.drag[d] = this.drag[s];
  }
}

const rnd = Math.random;

/**
 * Partikelsystem des Renderers (alles instanziert):
 * - Rauch/Staub: weiche Billboards mit Alpha, wachsen beim Aufsteigen
 * - Glut/Feuer: additive Billboards
 * - Trümmer: kleine beleuchtete Würfel mit Schwerkraft
 * - Blutflecken: flache Decals, langsam verblassend
 * Obergrenzen kommen aus der Grafikstufe (render/quality.ts).
 */
export class FxSystem {
  readonly group = new THREE.Group();
  /** Würfel (Trümmer) – wird auch außerhalb als `mesh` erwartet */
  readonly mesh: THREE.InstancedMesh;
  private smoke!: Pool;
  private glow!: Pool;
  private debris!: Pool;
  private decals!: Pool;
  private smokeLayer!: BillboardLayer;
  private glowLayer!: BillboardLayer;
  private decalLayer!: BillboardLayer;
  private q: QualityCfg = qualityOf('medium');
  private scale = 1;
  /** Blut an/aus (Einstellung) */
  blood = true;
  private tmp = new THREE.Matrix4();
  private pv = new THREE.Vector3();
  private sv = new THREE.Vector3();
  private qt = new THREE.Quaternion();
  private ax = new THREE.Vector3(0, 1, 0);
  private debrisCap = 0;

  constructor() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.mesh = new THREE.InstancedMesh(g, m, 1);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.add(this.mesh);
    this.applyQuality(this.q);
  }

  applyQuality(q: QualityCfg): void {
    this.q = q;
    this.scale = q.particleScale;
    const max = q.particleMax;
    for (const l of [this.smokeLayer, this.glowLayer, this.decalLayer]) if (l) this.group.remove(l.mesh);
    this.smoke = new Pool(Math.floor(max * 0.5));
    this.glow = new Pool(Math.floor(max * 0.22));
    this.debris = new Pool(Math.floor(max * 0.28));
    this.decals = new Pool(q.bloodDecals);
    this.smokeLayer = new BillboardLayer(this.smoke.cap, { order: 4, shape: 0 });
    this.glowLayer = new BillboardLayer(this.glow.cap, { additive: true, order: 5, shape: 0 });
    this.decalLayer = new BillboardLayer(this.decals.cap, { flat: true, order: 1, shape: 1, depthTest: true });
    this.group.add(this.smokeLayer.mesh, this.glowLayer.mesh, this.decalLayer.mesh);
    const old = this.mesh;
    this.group.remove(old);
    old.dispose();
    (this as { mesh: THREE.InstancedMesh }).mesh = new THREE.InstancedMesh(old.geometry, old.material, this.debris.cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.debris.cap * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.group.add(this.mesh);
    this.debrisCap = this.debris.cap;
  }

  /** Anzahl nach Grafikstufe skalieren (stochastisch gerundet) */
  private cnt(n: number): number {
    const v = n * this.scale;
    const f = Math.floor(v);
    return f + (rnd() < v - f ? 1 : 0);
  }

  // ----- Grundbausteine (Weltkoordinaten: x, y = Höhe, z) -----
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: [number, number, number], a: number, grav = 0, drag = 0.6): void {
    this.smoke.add(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag);
  }
  spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: [number, number, number], a: number, grav = 0, drag = 0): void {
    this.glow.add(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag);
  }
  chunk(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, c: [number, number, number], grav = 11): void {
    this.debris.add(x, y, z, vx, vy, vz, life, size, rnd() * 6.28, c, 1, grav, 0);
  }
  decal(x: number, y: number, z: number, size: number, c: [number, number, number], a: number, life: number): void {
    this.decals.add(x, y, z, 0, 0, 0, life, size, size, c, a, 0, 0);
  }

  /** Ringförmige Staubwolke am Boden */
  dustRing(x: number, y: number, z: number, n: number, radius: number, size: number, c: [number, number, number] = C.sandDark, a = 0.55, life = 1.8): void {
    const k = this.cnt(n);
    for (let i = 0; i < k; i++) {
      const ang = rnd() * 6.283;
      const sp = radius * (0.4 + rnd() * 0.8);
      this.puff(x + Math.cos(ang) * radius * 0.3, y + 0.1, z + Math.sin(ang) * radius * 0.3, Math.cos(ang) * sp, 0.25 + rnd() * 0.5, Math.sin(ang) * sp, life * (0.7 + rnd() * 0.6), size * 0.5, size * (1.2 + rnd() * 0.7), c, a, -0.1, 1.2);
    }
  }

  /** Aufsteigender Rauch (Schornstein, Brand) */
  smokeUp(x: number, y: number, z: number, dark: boolean, size = 0.28, life = 2.6): void {
    const c = dark ? C.smokeDark : C.smoke;
    this.puff(x + (rnd() - 0.5) * 0.12, y, z + (rnd() - 0.5) * 0.12, (rnd() - 0.4) * 0.25, 0.7 + rnd() * 0.5, (rnd() - 0.5) * 0.25, life * (0.8 + rnd() * 0.4), size * 0.6, size * (2.2 + rnd()), c, dark ? 0.62 : 0.5, -0.08, 0.15);
  }

  /** Flamme: additive Zunge, steigt auf und schrumpft */
  flame(x: number, y: number, z: number, size = 0.3): void {
    const c = rnd() < 0.5 ? C.flameA : C.flameB;
    this.spark(x + (rnd() - 0.5) * 0.2, y, z + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2, 0.8 + rnd() * 0.9, (rnd() - 0.5) * 0.2, 0.55 + rnd() * 0.35, size, size * 0.2, c, 0.95, -1.0, 0);
  }
  ember(x: number, y: number, z: number): void {
    this.spark(x, y, z, (rnd() - 0.5) * 0.9, 1.2 + rnd() * 1.4, (rnd() - 0.5) * 0.9, 0.9 + rnd() * 0.8, 0.07, 0.02, C.flameA, 1, 0.4, 0.2);
  }

  /** Blut: wenige dunkelrote Spritzer und ein Fleck am Boden (abschaltbar) */
  bloodAt(x: number, y: number, z: number): void {
    if (!this.blood || this.q.bloodDecals <= 0) return;
    const n = this.cnt(3);
    for (let i = 0; i < n; i++) this.chunk(x, y + 0.3, z, (rnd() - 0.5) * 1.6, 1 + rnd() * 1.4, (rnd() - 0.5) * 1.6, 0.5, 0.05, C.blood, 10);
    if (rnd() < 0.7) this.decal(x + (rnd() - 0.5) * 0.3, y + 0.03, z + (rnd() - 0.5) * 0.3, 0.3 + rnd() * 0.3, C.blood, 0.55, 14 + rnd() * 10);
  }

  /** Spezialeffekte nach Namen (aus Sim-Events). x, y = Tile-Koordinaten, z = Höhe. */
  effect(kind: string, x: number, y: number, z: number): void {
    const wx = x;
    const wz = y;
    const wy = z;
    switch (kind) {
      case 'collapse':
      case 'collapseWood': {
        const wood = kind === 'collapseWood';
        const n = this.cnt(22);
        for (let i = 0; i < n; i++) {
          const a = rnd() * 6.28;
          const sp = 1.5 + rnd() * 3;
          this.chunk(wx + Math.cos(a) * 0.4, wy + 0.3 + rnd() * 0.6, wz + Math.sin(a) * 0.4, Math.cos(a) * sp, 2 + rnd() * 4, Math.sin(a) * sp, 1.1 + rnd(), 0.1 + rnd() * 0.18, wood ? (rnd() < 0.7 ? C.wood : C.woodDark) : rnd() < 0.5 ? C.stone : C.stoneDark, 12);
        }
        this.dustRing(wx, wy * 0.3, wz, 12, 2.4, 1.4, wood ? C.sandDark : C.sand, 0.6, 2.4);
        const m = this.cnt(6);
        for (let i = 0; i < m; i++) this.puff(wx + (rnd() - 0.5) * 1.4, wy * 0.5 + 0.2, wz + (rnd() - 0.5) * 1.4, (rnd() - 0.5) * 0.7, 0.6 + rnd() * 0.9, (rnd() - 0.5) * 0.7, 2.4 + rnd(), 0.7, 2.4, C.smoke, 0.5, -0.1, 0.5);
        break;
      }
      case 'explosion': {
        const n = this.cnt(14);
        for (let i = 0; i < n; i++) {
          const a = rnd() * 6.28;
          const sp = 1 + rnd() * 3.2;
          this.chunk(wx, wy + 0.2, wz, Math.cos(a) * sp, 2.5 + rnd() * 3.5, Math.sin(a) * sp, 0.9 + rnd() * 0.6, 0.08 + rnd() * 0.16, rnd() < 0.5 ? C.rockDark : C.stoneDark, 12);
        }
        this.spark(wx, wy + 0.3, wz, 0, 0.2, 0, 0.22, 0.7, 1.2, C.gold, 0.85, 0, 0);
        this.spark(wx, wy + 0.3, wz, 0, 0.5, 0, 0.3, 0.5, 0.8, C.flameB, 0.7, 0, 0);
        this.dustRing(wx, wy, wz, 9, 2.0, 1.0, C.sandDark, 0.55, 2.0);
        const m = this.cnt(5);
        for (let i = 0; i < m; i++) this.puff(wx + (rnd() - 0.5) * 0.6, wy + 0.3, wz + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.5, 0.8 + rnd() * 0.8, (rnd() - 0.5) * 0.5, 1.8 + rnd(), 0.5, 1.8, C.smokeDark, 0.55, -0.1, 0.4);
        break;
      }
      case 'hit': {
        const n = this.cnt(4);
        for (let i = 0; i < n; i++) this.spark(wx, wy, wz, (rnd() - 0.5) * 2.2, 0.4 + rnd() * 1.6, (rnd() - 0.5) * 2.2, 0.25 + rnd() * 0.2, 0.09, 0.02, C.gold, 1, 6, 0);
        if (this.cnt(1) > 0) this.puff(wx, wy, wz, 0, 0.3, 0, 0.5, 0.2, 0.6, C.sand, 0.35, 0, 1);
        break;
      }
      case 'dust':
        this.dustRing(wx, wy, wz, 3, 0.7, 0.4, C.sandDark, 0.4, 0.9);
        break;
      case 'heal': {
        const n = this.cnt(8);
        for (let i = 0; i < n; i++) this.spark(wx + (rnd() - 0.5) * 0.8, wy, wz + (rnd() - 0.5) * 0.8, 0, 1.2 + rnd(), 0, 0.9, 0.16, 0.04, C.treeLight, 0.9, 0, 0);
        break;
      }
      case 'arrows': {
        const n = this.cnt(10);
        for (let i = 0; i < n; i++) this.chunk(wx + (rnd() - 0.5) * 3, wy + 5 + rnd() * 3, wz + (rnd() - 0.5) * 3, 0, -9, 0, 0.7, 0.07, C.woodDark, 0);
        break;
      }
      case 'splash': {
        const n = this.cnt(10);
        for (let i = 0; i < n; i++) this.chunk(wx, wy, wz, (rnd() - 0.5) * 2, 2 + rnd() * 2.4, (rnd() - 0.5) * 2, 0.7, 0.07, C.water, 10);
        this.puff(wx, wy + 0.1, wz, 0, 0.3, 0, 0.8, 0.3, 1.0, C.white, 0.45, 0, 1);
        break;
      }
      case 'leave':
        this.puff(wx, wy, wz, 0, 0.8, 0, 0.9, 0.12, 0.34, C.white, 0.5, 0, 0.5);
        break;
      case 'fire':
        this.flame(wx, wy, wz, 0.34);
        if (rnd() < 0.25) this.smokeUp(wx, wy + 0.3, wz, true, 0.2, 1.8);
        break;
      case 'oil': {
        // Kessel kippt: schwarz-goldener Strahl, fällt nach unten, Dampf
        const n = this.cnt(22);
        for (let i = 0; i < n; i++) this.chunk(wx + (rnd() - 0.5) * 0.6, wy + 0.8, wz + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 1.6, 0.5 + rnd() * 1.5, (rnd() - 0.5) * 1.6, 0.9, 0.09, rnd() < 0.65 ? C.black : C.gold, 9);
        const m = this.cnt(5);
        for (let i = 0; i < m; i++) this.puff(wx + (rnd() - 0.5) * 0.8, wy + 0.4, wz + (rnd() - 0.5) * 0.8, 0, 0.9 + rnd() * 0.6, 0, 1.6, 0.3, 1.1, C.smoke, 0.5, 0, 0.3);
        this.spark(wx, wy + 0.5, wz, 0, 0.5, 0, 0.5, 0.9, 1.3, C.flameB, 0.5, 0, 0);
        break;
      }
      case 'banner': {
        const n = this.cnt(10);
        for (let i = 0; i < n; i++) this.spark(wx + (rnd() - 0.5) * 0.4, wy + 2.4, wz + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.8, 1 + rnd() * 1.6, (rnd() - 0.5) * 0.8, 1.2, 0.14, 0.03, C.gold, 1, -0.3, 0);
        break;
      }
      case 'rock': {
        // Felsschlag aus großer Höhe: Brocken fallen, Aufprall mit Staub
        const n = this.cnt(18);
        for (let i = 0; i < n; i++) this.chunk(wx + (rnd() - 0.5) * 2.6, wy + 6 + rnd() * 4, wz + (rnd() - 0.5) * 2.6, 0, -6 - rnd() * 6, 0, 0.9, 0.25 + rnd() * 0.25, C.rockDark, 16);
        this.dustRing(wx, wy, wz, 10, 2.6, 1.3, C.sandDark, 0.6, 2.2);
        break;
      }
      case 'built':
        this.dustRing(wx, wy, wz, 7, 1.4, 0.7, C.sandDark, 0.45, 1.6);
        break;
      default: {
        const n = this.cnt(4);
        for (let i = 0; i < n; i++) this.spark(wx, wy, wz, (rnd() - 0.5) * 1.6, 0.4 + rnd(), (rnd() - 0.5) * 1.6, 0.5, 0.1, 0.03, C.white, 0.9, 4, 0);
      }
    }
  }

  /** Reiner Zeit-Fortschritt + Befüllen der GPU-Puffer */
  update(dt: number): void {
    this.smoke.step(dt);
    this.glow.step(dt);
    this.debris.step(dt);
    this.decals.step(dt);

    const sl = this.smokeLayer;
    sl.n = 0;
    const sp = this.smoke;
    for (let i = 0; i < sp.n; i++) {
      const t = 1 - sp.life[i] / sp.max[i];
      const size = sp.s0[i] + (sp.s1[i] - sp.s0[i]) * Math.sqrt(t);
      const a = sp.a[i] * Math.min(1, t * 6) * (1 - t * t);
      sl.push(sp.x[i], sp.y[i], sp.z[i], size, sp.r[i], sp.g[i], sp.b[i], a);
    }
    sl.commit();

    const gl = this.glowLayer;
    gl.n = 0;
    const gp = this.glow;
    for (let i = 0; i < gp.n; i++) {
      const t = 1 - gp.life[i] / gp.max[i];
      const size = gp.s0[i] + (gp.s1[i] - gp.s0[i]) * t;
      gl.push(gp.x[i], gp.y[i], gp.z[i], size, gp.r[i], gp.g[i], gp.b[i], gp.a[i] * (1 - t * t));
    }
    gl.commit();

    const dl = this.decalLayer;
    dl.n = 0;
    const dp = this.decals;
    for (let i = 0; i < dp.n; i++) {
      const f = Math.min(1, dp.life[i] / 4);
      dl.push(dp.x[i], dp.y[i], dp.z[i], dp.s0[i], dp.r[i], dp.g[i], dp.b[i], dp.a[i] * f);
    }
    dl.commit();

    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const col = (this.mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    const p = this.debris;
    for (let i = 0; i < p.n; i++) {
      const s = p.s0[i] * Math.max(0.15, Math.min(1, p.life[i] / p.max[i] * 2));
      this.pv.set(p.x[i], p.y[i], p.z[i]);
      this.sv.set(s, s, s);
      this.qt.setFromAxisAngle(this.ax, p.s1[i] + p.life[i] * 6);
      this.tmp.compose(this.pv, this.qt, this.sv);
      this.tmp.toArray(arr, i * 16);
      col[i * 3] = p.r[i];
      col[i * 3 + 1] = p.g[i];
      col[i * 3 + 2] = p.b[i];
    }
    this.mesh.count = p.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** aktuelle Zahl lebender Partikel (für Messungen) */
  get count(): number {
    return this.smoke.n + this.glow.n + this.debris.n + this.decals.n;
  }
  get cap(): number {
    return this.debrisCap + this.smoke.cap + this.glow.cap;
  }
}
