import * as THREE from 'three';
import { animDepthMaterial, animMaterial, staticMaterial } from './materials';

/** Spielerfarben als lineare RGB-Tabelle (8 Plätze) */
export function teamTable(colors: readonly number[]): Float32Array {
  const t = new Float32Array(colors.length * 3);
  const c = new THREE.Color();
  colors.forEach((hex, i) => {
    c.setHex(hex);
    t[i * 3] = c.r;
    t[i * 3 + 1] = c.g;
    t[i * 3 + 2] = c.b;
  });
  return t;
}

export interface TypeMeshOpts {
  /** mit Vertex-Animation (iAnim) – sonst statisches Material */
  anim: boolean;
  shadow: boolean;
  /** Anfangskapazität */
  cap: number;
  /** zusätzliches Instanzattribut iVar (vec4: Palette, Helligkeit, Sichtbarkeits-Bits, Auswahl) – für Figuren */
  vari?: boolean;
  /** eigenes Material/Schattenmaterial statt der gemeinsamen Animationsmaterialien (Figuren) */
  material?: THREE.Material;
  depthMaterial?: THREE.Material;
}

/**
 * Ein InstancedMesh für ein Modell (alles in einer Geometrie, ein Draw Call).
 * Instanzdaten: Matrix (Position, Y-Drehung, Skalierung), Teamfarbe und – bei `anim` – das Attribut iAnim
 * (Phase, Flags, Schrittfrequenz, Zyklus/Alter), das der Vertex-Shader für die Animation liest.
 */
export class TypeMesh {
  mesh: THREE.InstancedMesh;
  cap: number;
  count = 0;
  private shadow: boolean;
  private an: THREE.InstancedBufferAttribute | null = null;
  private mat: Float32Array;
  private col: Float32Array;
  private ani: Float32Array | null = null;
  private vr: THREE.InstancedBufferAttribute | null = null;
  private vari: Float32Array | null = null;

  constructor(
    private geo: THREE.BufferGeometry,
    private parent: THREE.Object3D,
    private opts: TypeMeshOpts,
    private team: Float32Array,
  ) {
    this.cap = opts.cap;
    this.shadow = opts.shadow;
    this.mesh = this.make();
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.col = (this.mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    this.ani = this.an ? (this.an.array as Float32Array) : null;
    this.vari = this.vr ? (this.vr.array as Float32Array) : null;
  }

  private make(): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.opts.material ?? (this.opts.anim ? animMaterial() : staticMaterial()), this.cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (this.opts.anim) {
      this.an = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
      this.an.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute('iAnim', this.an);
      m.customDepthMaterial = (this.opts.depthMaterial as THREE.MeshDepthMaterial | undefined) ?? animDepthMaterial();
    }
    if (this.opts.vari) {
      this.vr = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
      this.vr.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute('iVar', this.vr);
    }
    m.frustumCulled = false;
    m.castShadow = this.shadow;
    m.receiveShadow = false;
    m.count = 0;
    this.parent.add(m);
    return m;
  }

  /** Kapazität erweitern (Instanzen gehen verloren; vor dem Befüllen aufrufen) */
  ensure(n: number): void {
    if (n <= this.cap) return;
    let cap = this.cap;
    while (cap < n) cap *= 2;
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.cap = cap;
    this.mesh = this.make();
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.col = (this.mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    this.ani = this.an ? (this.an.array as Float32Array) : null;
    this.vari = this.vr ? (this.vr.array as Float32Array) : null;
  }

  setShadows(on: boolean): void {
    this.shadow = on;
    this.mesh.castShadow = on;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v && this.count > 0;
  }

  begin(): void {
    this.count = 0;
  }

  /** Schreibt eine Instanz. rot = Drehung um Y, sx = Skalierung in x/z, sy = in y. */
  push(x: number, y: number, z: number, rot: number, sx: number, sy: number, team: number, a0 = 0, a1 = 0, a2 = 0, a3 = 0): void {
    if (this.count >= this.cap) {
      // Instanzen bleiben erhalten: Puffer vergrößern und kopieren
      const oldMat = this.mat.slice(0, this.count * 16);
      const oldCol = this.col.slice(0, this.count * 3);
      const oldAni = this.ani ? this.ani.slice(0, this.count * 4) : null;
      const oldVar = this.vari ? this.vari.slice(0, this.count * 4) : null;
      const n = this.count;
      this.ensure(this.cap * 2);
      this.mat.set(oldMat);
      this.col.set(oldCol);
      if (oldAni && this.ani) this.ani.set(oldAni);
      if (oldVar && this.vari) this.vari.set(oldVar);
      this.count = n;
    }
    const c = Math.cos(rot) * sx;
    const s = Math.sin(rot) * sx;
    const o = this.count * 16;
    const a = this.mat;
    a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    const t = (team % (this.team.length / 3)) * 3;
    const k = this.count * 3;
    this.col[k] = this.team[t];
    this.col[k + 1] = this.team[t + 1];
    this.col[k + 2] = this.team[t + 2];
    if (this.ani) {
      const q = this.count * 4;
      this.ani[q] = a0;
      this.ani[q + 1] = a1;
      this.ani[q + 2] = a2;
      this.ani[q + 3] = a3;
    }
    this.count++;
  }

  /**
   * Figuren: Variation der zuletzt geschriebenen Instanz. v0 = gepackte Palette, v1 = Helligkeit, v2 = Sichtbarkeits-Bits,
   * v3 = Auswahl-ID; kx/ky skalieren die Instanz (Breite/Höhe) zusätzlich.
   */
  styleLast(v0: number, v1: number, v2: number, v3: number, kx = 1, ky = 1): void {
    const i = this.count - 1;
    if (i < 0) return;
    if (this.vari) {
      const q = i * 4;
      this.vari[q] = v0;
      this.vari[q + 1] = v1;
      this.vari[q + 2] = v2;
      this.vari[q + 3] = v3;
    }
    if (kx !== 1 || ky !== 1) {
      const a = this.mat;
      const o = i * 16;
      a[o] *= kx; a[o + 2] *= kx; a[o + 8] *= kx; a[o + 10] *= kx;
      a[o + 5] *= ky;
    }
  }

  /** Gibt das Mesh frei (Qualitätswechsel) */
  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
  }

  /** Eigene Farbe statt Teamfarbe (Waren, Trümmer) */
  tintLast(r: number, g: number, b: number): void {
    const k = (this.count - 1) * 3;
    this.col[k] = r;
    this.col[k + 1] = g;
    this.col[k + 2] = b;
  }

  end(): void {
    const m = this.mesh;
    m.count = this.count;
    m.visible = this.count > 0;
    const n = this.count;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, n * 16);
    m.instanceMatrix.needsUpdate = true;
    const ic = m.instanceColor as THREE.InstancedBufferAttribute;
    ic.clearUpdateRanges();
    ic.addUpdateRange(0, n * 3);
    ic.needsUpdate = true;
    if (this.an) {
      this.an.clearUpdateRanges();
      this.an.addUpdateRange(0, n * 4);
      this.an.needsUpdate = true;
    }
    if (this.vr) {
      this.vr.clearUpdateRanges();
      this.vr.addUpdateRange(0, n * 4);
      this.vr.needsUpdate = true;
    }
  }
}
