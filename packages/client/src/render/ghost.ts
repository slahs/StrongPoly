import * as THREE from 'three';
import { BT, BuildingDef, ClientWorld } from '@strongpoly/shared';
import { buildBuildingModel, TURRET_BASE_Y } from './models_buildings';
import { tileY } from './util';
import type { ModelGeos } from './builder';

export interface GhostPlacement {
  x: number;
  y: number;
  valid: boolean;
}

const OK = new THREE.Color(0.7, 1, 0.7);
const BAD = new THREE.Color(1, 0.45, 0.45);

/** Transparente Bauvorschau (Gebäudemodell) + farbige Tile-Markierungen. */
export class GhostRenderer {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh | null = null;
  private accent: THREE.InstancedMesh | null = null;
  private tiles: THREE.InstancedMesh;
  private curType = -1;
  private geoCache = new Map<number, ModelGeos>();
  private matBody = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.62, depthWrite: false });
  private matAcc = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.62, depthWrite: false });
  /** Tiefenvorlauf: verdeckte Innenflächen des (halbtransparenten) Modells nicht mitzeichnen */
  private matDepth = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
  private preBody: THREE.InstancedMesh | null = null;
  private preAccent: THREE.InstancedMesh | null = null;
  private cap = 512;

  constructor() {
    const g = new THREE.PlaneGeometry(0.94, 0.94);
    g.rotateX(-Math.PI / 2);
    this.tiles = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), 1024);
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1024 * 3), 3);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = 5;
    this.group.add(this.tiles);
    this.group.visible = false;
  }

  hide(): void {
    this.group.visible = false;
    this.tiles.count = 0;
    if (this.body) this.body.count = 0;
    if (this.accent) this.accent.count = 0;
    if (this.preBody) this.preBody.count = 0;
    if (this.preAccent) this.preAccent.count = 0;
  }

  private setType(def: BuildingDef): void {
    if (this.curType === def.id) return;
    this.curType = def.id;
    if (this.body) {
      this.group.remove(this.body);
      this.body.dispose();
    }
    if (this.accent) {
      this.group.remove(this.accent);
      this.accent.dispose();
    }
    for (const m of [this.preBody, this.preAccent]) if (m) this.group.remove(m);
    this.preBody = null;
    this.preAccent = null;
    let geos = this.geoCache.get(def.id);
    if (!geos) {
      geos = buildBuildingModel(def, 1);
      this.geoCache.set(def.id, geos);
    }
    this.body = new THREE.InstancedMesh(geos.body, this.matBody, this.cap);
    this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.body.frustumCulled = false;
    this.group.add(this.body);
    this.preBody = this.makePre(geos.body, this.body);
    if (geos.accent) {
      this.accent = new THREE.InstancedMesh(geos.accent, this.matAcc, this.cap);
      this.accent.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
      this.accent.frustumCulled = false;
      this.group.add(this.accent);
      this.preAccent = this.makePre(geos.accent, this.accent);
    } else this.accent = null;
  }

  /** Nur-Tiefen-Kopie eines Instanzmeshes (teilt die Instanzmatrizen) */
  private makePre(geo: THREE.BufferGeometry, src: THREE.InstancedMesh): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, this.matDepth, this.cap);
    m.instanceMatrix = src.instanceMatrix;
    m.frustumCulled = false;
    m.renderOrder = -1;
    this.group.add(m);
    return m;
  }

  show(world: ClientWorld, def: BuildingDef, rot: number, list: GhostPlacement[]): void {
    this.setType(def);
    this.group.visible = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot ? Math.PI / 2 : 0);
    const w = rot ? def.h : def.w;
    const h = rot ? def.w : def.h;
    const n = Math.min(list.length, this.cap);
    // Geschütze sitzen auf der Turmkrone
    const lift = def.id === BT.TurretBallista || def.id === BT.TurretMangonel ? TURRET_BASE_Y : 0;
    let nt = 0;
    const tArr = this.tiles.instanceMatrix.array as Float32Array;
    const tCol = (this.tiles.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    const bCol = (this.body!.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    const aCol = this.accent ? ((this.accent.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array) : null;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const col = p.valid ? OK : BAD;
      m4.compose(new THREE.Vector3(p.x + w / 2, tileY(world, p.x, p.y) + lift, p.y + h / 2), q, new THREE.Vector3(1, 1, 1));
      this.body!.setMatrixAt(i, m4);
      this.accent?.setMatrixAt(i, m4);
      bCol[i * 3] = col.r; bCol[i * 3 + 1] = col.g; bCol[i * 3 + 2] = col.b;
      if (aCol) { aCol[i * 3] = col.r; aCol[i * 3 + 1] = col.g; aCol[i * 3 + 2] = col.b; }
      // Tile-Markierungen (begrenzt)
      for (let yy = 0; yy < h && nt < 1024; yy++)
        for (let xx = 0; xx < w && nt < 1024; xx++) {
          const o = nt * 16;
          tArr[o] = 1; tArr[o + 1] = 0; tArr[o + 2] = 0; tArr[o + 3] = 0;
          tArr[o + 4] = 0; tArr[o + 5] = 1; tArr[o + 6] = 0; tArr[o + 7] = 0;
          tArr[o + 8] = 0; tArr[o + 9] = 0; tArr[o + 10] = 1; tArr[o + 11] = 0;
          tArr[o + 12] = p.x + xx + 0.5; tArr[o + 13] = tileY(world, p.x + xx, p.y + yy) + 0.04; tArr[o + 14] = p.y + yy + 0.5; tArr[o + 15] = 1;
          tCol[nt * 3] = p.valid ? 0.3 : 1; tCol[nt * 3 + 1] = p.valid ? 1 : 0.25; tCol[nt * 3 + 2] = p.valid ? 0.3 : 0.25;
          nt++;
        }
    }
    this.body!.count = n;
    if (this.preBody) this.preBody.count = n;
    if (this.preAccent) this.preAccent.count = n;
    this.body!.instanceMatrix.needsUpdate = true;
    (this.body!.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    if (this.accent) {
      this.accent.count = n;
      this.accent.instanceMatrix.needsUpdate = true;
      (this.accent.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.tiles.count = nt;
    this.tiles.instanceMatrix.needsUpdate = true;
    (this.tiles.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** Nur Tile-Markierungen (z. B. Graben-Rechteck) */
  showRect(world: ClientWorld, x0: number, y0: number, x1: number, y1: number, color: [number, number, number]): void {
    this.group.visible = true;
    if (this.body) this.body.count = 0;
    if (this.accent) this.accent.count = 0;
    if (this.preBody) this.preBody.count = 0;
    if (this.preAccent) this.preAccent.count = 0;
    const tArr = this.tiles.instanceMatrix.array as Float32Array;
    const tCol = (this.tiles.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let nt = 0;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (nt >= 1024 || !world.map.inBounds(x, y)) continue;
        const o = nt * 16;
        tArr[o] = 1; tArr[o + 1] = 0; tArr[o + 2] = 0; tArr[o + 3] = 0;
        tArr[o + 4] = 0; tArr[o + 5] = 1; tArr[o + 6] = 0; tArr[o + 7] = 0;
        tArr[o + 8] = 0; tArr[o + 9] = 0; tArr[o + 10] = 1; tArr[o + 11] = 0;
        tArr[o + 12] = x + 0.5; tArr[o + 13] = tileY(world, x, y) + 0.04; tArr[o + 14] = y + 0.5; tArr[o + 15] = 1;
        tCol[nt * 3] = color[0]; tCol[nt * 3 + 1] = color[1]; tCol[nt * 3 + 2] = color[2];
        nt++;
      }
    this.tiles.count = nt;
    this.tiles.instanceMatrix.needsUpdate = true;
    (this.tiles.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
