import * as THREE from 'three';
import { TypeMesh } from '../instanced';
import { animDepthMaterial } from '../materials';
import { constructionDepthMaterial } from '../building_materials';
import { unitDepthMaterial } from '../unit_shader';
import { lodScale, pickLod } from './lod';
import type { LodCfg } from './lod';
import type { AssetMaterials, AssetVariant } from './materials';
import { shareGeometry } from './model';
import type { AssetModel } from './model';

/** Werte je Instanz im Zwischenspeicher: x y z rot sx sy team a0 a1 a2 a3 | v0 v1 v2 v3 kx ky */
const REC = 17;

/**
 * Instanzierung eines GLB-Assets im echten Renderer: je (LOD × Bibliotheksmaterial) ein TypeMesh (InstancedMesh mit
 * Teamfarbe, iAnim und – bei Figuren – iVar), also Draw-Calls = Σ Materialien der sichtbaren LOD-Stufen, unabhängig von der
 * Instanzanzahl. Die Schnittstelle folgt TypeMesh (begin/push/end), nur trägt jede Instanz einen Schlüssel (Gebäude-/
 * Einheiten-ID) für die LOD-Hysterese. Die Instanzen werden zwischengespeichert: `relod(kamera)` verteilt sie bei
 * Kamerabewegung neu, ohne dass der EntityRenderer seine Gebäudeliste neu schreiben muss.
 */
export class AssetTypeMesh {
  private meshes: (TypeMesh | null)[][];
  private rec = new Float32Array(64 * REC);
  private keys = new Float64Array(64);
  private n = 0;
  private lodOf = new Map<number, number>();
  private scale: number;
  private shadow: boolean;
  private cam = new THREE.Vector3();
  private hasCam = false;
  /** Instanzen je LOD-Stufe beim letzten Verteilen (Statistik/Tests) */
  readonly perLod: number[];

  constructor(
    readonly model: AssetModel,
    private parent: THREE.Object3D,
    private mats: AssetMaterials,
    private team: Float32Array,
    private variant: AssetVariant,
    private cfg: LodCfg,
    shadow: boolean,
    private cap = 32,
    private vari = false,
  ) {
    this.meshes = model.lods.map((l) => l.parts.map(() => null));
    this.perLod = model.lods.map(() => 0);
    this.scale = lodScale(model.diag, model.def.lodDist?.[0]);
    this.shadow = shadow;
  }

  get count(): number {
    return this.n;
  }

  setLodCfg(cfg: LodCfg): void {
    this.cfg = cfg;
  }

  setShadows(on: boolean): void {
    this.shadow = on;
    for (const l of this.meshes) for (const m of l) m?.setShadows(on);
  }

  private mesh(L: number, k: number): TypeMesh {
    let m = this.meshes[L][k];
    if (!m) {
      const part = this.model.lods[L].parts[k];
      const depth = this.variant === 'clip' ? constructionDepthMaterial() : this.variant === 'unit' ? unitDepthMaterial() : animDepthMaterial();
      m = new TypeMesh(shareGeometry(part.geometry), this.parent, { anim: true, shadow: this.shadow, cap: this.cap, vari: this.vari, material: this.mats.material(part.material, this.variant), depthMaterial: depth }, this.team);
      m.mesh.name = `asset:${this.model.id}:LOD${L}:${part.material}`;
      this.meshes[L][k] = m;
    }
    return m;
  }

  begin(): void {
    this.n = 0;
  }

  /** Instanz merken (Bedeutung der Werte wie TypeMesh.push); `key` = stabile ID für die LOD-Hysterese */
  push(key: number, x: number, y: number, z: number, rot: number, sx: number, sy: number, team: number, a0 = 0, a1 = 0, a2 = 0, a3 = 0): void {
    if (this.n >= this.keys.length) {
      const r = new Float32Array(this.rec.length * 2);
      r.set(this.rec);
      this.rec = r;
      const k = new Float64Array(this.keys.length * 2);
      k.set(this.keys);
      this.keys = k;
    }
    const o = this.n * REC;
    const r = this.rec;
    r[o] = x; r[o + 1] = y; r[o + 2] = z; r[o + 3] = rot; r[o + 4] = sx; r[o + 5] = sy; r[o + 6] = team;
    r[o + 7] = a0; r[o + 8] = a1; r[o + 9] = a2; r[o + 10] = a3;
    r[o + 11] = 0; r[o + 12] = 1; r[o + 13] = 0; r[o + 14] = 0; r[o + 15] = 1; r[o + 16] = 1;
    this.keys[this.n] = key;
    this.n++;
  }

  /** Figuren: Variation der zuletzt gemerkten Instanz (wie TypeMesh.styleLast) */
  styleLast(v0: number, v1: number, v2: number, v3: number, kx = 1, ky = 1): void {
    if (this.n === 0) return;
    const o = (this.n - 1) * REC;
    const r = this.rec;
    r[o + 11] = v0; r[o + 12] = v1; r[o + 13] = v2; r[o + 14] = v3; r[o + 15] = kx; r[o + 16] = ky;
  }

  /** LOD je Instanz bestimmen; true, wenn sich eine Stufe geändert hat */
  private choose(): boolean {
    let changed = false;
    const nL = this.model.lods.length;
    const r = this.rec;
    const hy = this.model.height * 0.5;
    for (let i = 0; i < this.n; i++) {
      const key = this.keys[i];
      const prev = this.lodOf.get(key) ?? -1;
      let L: number;
      if (this.hasCam) {
        const o = i * REC;
        const dx = r[o] - this.cam.x;
        const dy = r[o + 1] + hy - this.cam.y;
        const dz = r[o + 2] - this.cam.z;
        L = pickLod(prev, Math.sqrt(dx * dx + dy * dy + dz * dz), this.cfg, this.scale, nL);
      } else L = Math.min(nL - 1, Math.max(this.cfg.min, prev >= 0 ? prev : 0));
      if (L !== prev) {
        this.lodOf.set(key, L);
        changed = true;
      }
    }
    return changed;
  }

  private distribute(): void {
    for (const l of this.meshes) for (const m of l) m?.begin();
    for (let L = 0; L < this.perLod.length; L++) this.perLod[L] = 0;
    const r = this.rec;
    for (let i = 0; i < this.n; i++) {
      const L = this.lodOf.get(this.keys[i]) ?? 0;
      this.perLod[L]++;
      const o = i * REC;
      const parts = this.model.lods[L].parts;
      for (let k = 0; k < parts.length; k++) {
        const m = this.mesh(L, k);
        m.push(r[o], r[o + 1], r[o + 2], r[o + 3], r[o + 4], r[o + 5], r[o + 6], r[o + 7], r[o + 8], r[o + 9], r[o + 10]);
        if (this.vari) m.styleLast(r[o + 11], r[o + 12], r[o + 13], r[o + 14], r[o + 15], r[o + 16]);
      }
    }
    for (const l of this.meshes) for (const m of l) m?.end();
  }

  /** Abschluss eines Schreibdurchgangs: LOD wählen (Kamera optional) und auf die Instanzmeshes verteilen */
  end(cam?: THREE.Vector3 | null): void {
    if (cam) {
      this.cam.copy(cam);
      this.hasCam = true;
    }
    this.choose();
    if (this.lodOf.size > this.n * 2 + 64) {
      // abgerissene/zerstörte Instanzen vergessen
      const keep = new Map<number, number>();
      for (let i = 0; i < this.n; i++) keep.set(this.keys[i], this.lodOf.get(this.keys[i]) ?? 0);
      this.lodOf = keep;
    }
    this.distribute();
  }

  /** Kamera bewegt: LOD neu wählen, nur bei Änderung neu verteilen. Rückgabe: neu verteilt */
  relod(cam: THREE.Vector3): boolean {
    if (this.n === 0) return false;
    if (this.hasCam && this.cam.distanceToSquared(cam) < 0.25) return false;
    this.cam.copy(cam);
    this.hasCam = true;
    if (!this.choose()) return false;
    this.distribute();
    return true;
  }

  /** Hysterese-Zustand vergessen (z. B. neue Karte) */
  forget(): void {
    this.lodOf.clear();
  }

  dispose(): void {
    for (const l of this.meshes) for (const m of l) m?.dispose();
    this.meshes = this.model.lods.map((l) => l.parts.map(() => null));
  }
}
