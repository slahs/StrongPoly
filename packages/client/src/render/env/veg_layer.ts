import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, T } from '@strongpoly/shared';
import { DecorRenderer, writeInstanceMatrix } from '../decor';
import { biomeOf } from '../biome';
import type { Biome } from '../biome';
import { groundTrace, trailSegments } from '../groundmap';
import type { GroundBuilding, GroundMap } from '../groundmap';
import type { QualityCfg } from '../quality';
import { qualityOf } from '../quality';
import { assetRegistry } from '../assets/registry';
import type { AssetMaterials } from '../assets/materials';
import type { AssetModel } from '../assets/model';
import { shareGeometry } from '../assets/model';
import type { EnvMap, RoadSeg } from './envmap';
import { ENVU } from './uniforms';
import { VegMaterials } from './veg_material';
import { VEG_LOD, catalogOf, catalogReady, placeVegetation, vegLod, vegQualityOf } from './veg_place';
import type { VegCatalog, VegClass, VegStats } from './veg_place';

/** Requisit an fester Stelle (LookDev: Zäune, Gärten, Holzstapel …): Asset-ID, Position (Tiles), Drehung, Größe */
export interface PropPlacement {
  id: string;
  x: number;
  y: number;
  rot: number;
  s?: number;
}

/**
 * Trampelpfade des Stils medieval: führt ein gezeichneter Weg näher vorbei als das Lager, endet der Pfad am nächsten
 * Wegpunkt (statt quer über Wiesen und andere Wege zum Lager); schmale Fußpfade ohne Fahrspuren.
 */
export function snapTrails(trails: [number, number, number, number][], roads: RoadSeg[]): RoadSeg[] {
  const out: RoadSeg[] = [];
  for (const [x0, y0, x1, y1] of trails) {
    let best = Math.hypot(x1 - x0, y1 - y0);
    let ex = x1;
    let ey = y1;
    for (const r of roads) {
      const dx = r.x1 - r.x0;
      const dy = r.y1 - r.y0;
      const L2 = dx * dx + dy * dy;
      let t = L2 > 1e-9 ? ((x0 - r.x0) * dx + (y0 - r.y0) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = r.x0 + dx * t;
      const py = r.y0 + dy * t;
      const d = Math.hypot(px - x0, py - y0);
      if (d < best && d < 12) {
        best = d;
        ex = px;
        ey = py;
      }
    }
    if (best > 0.6) out.push({ x0, y0, x1: ex, y1: ey, hw: 0.4, ruts: 0 });
  }
  return out;
}

/** Floats je Instanz im Zwischenspeicher: x y z rot s sy lean r g b */
const STRIDE = 10;

interface VegMesh {
  mesh: THREE.InstancedMesh;
  cls: VegClass;
  lod: number;
}

/**
 * Vegetation und Umgebungs-Requisiten des Stils medieval (Teilschritt 5): GLB-Assets (Bäume, Büsche, Gras, Blumen, Farn,
 * Felsen, Zäune) als InstancedMesh je (Asset × LOD × Material), Verteilung aus env/veg_place.ts, Wind/Alpha-Test/
 * Durchlicht aus env/veg_material.ts. Gleiche Schnittstelle wie DecorRenderer (GameScene/Session/LookDev rufen dieselben
 * Methoden). Bis die Assets geladen sind – oder wenn sie fehlen/scheitern – zeichnet die prozedurale Dekoration
 * (Rückfall). Pflegt zusätzlich die Bodenkarte (Trampelpfade) und die Umgebungskarte (Wege, Kronendach).
 */
export class MedievalDecor {
  readonly group = new THREE.Group();
  ground: GroundMap | null = null;
  /** Zähler wie DecorRenderer.stats (+ je LOD, Draw-Gruppen) */
  stats = { trees: 0, far: 0, small: 0, total: 0, ms: 0, bushes: 0, rocks: 0, props: 0, perLod: [0, 0, 0] as number[], groups: 0 };
  /** feste Requisiten (LookDev) */
  extraProps: PropPlacement[] = [];
  state: 'loading' | 'ready' | 'failed' = 'loading';
  private fallback: DecorRenderer | null;
  private cat: VegCatalog | null = null;
  private models = new Map<string, AssetModel>();
  private vm: VegMaterials;
  private meshes = new Map<string, VegMesh>();
  private lists = new Map<string, number[]>();
  private q: QualityCfg = qualityOf('medium');
  private shadows = true;
  private dirty = true;
  private groundDirty = true;
  private lastBuild = -10;
  private cx = -1e9;
  private cz = -1e9;
  private camDist = 40;
  private lastCamDist = 40;
  private camPos = new THREE.Vector3(1e9, 0, 1e9);
  private explored: Uint8Array | null = null;
  private occupied: Int32Array | null = null;
  private blds: ReadonlyMap<number, GroundBuilding> | null = null;
  private biome: Biome;
  /** Kamera für die Sichtprüfung (Instanzen außerhalb des erweiterten Sichtkegels entfallen) */
  private camera: THREE.Camera | null = null;
  private frustum = new THREE.Frustum();
  private viewDir = new THREE.Vector3(0, 0, -1);
  private lastViewDir = new THREE.Vector3(0, 9, 0);
  private lastCamPos = new THREE.Vector3(1e9, 0, 0);

  constructor(
    private map: GameMap,
    private env: EnvMap | null,
    lib: AssetMaterials = assetRegistry.materials,
    alphaToCoverage = false,
  ) {
    this.group.name = 'decor-medieval';
    this.biome = biomeOf(map.seed);
    this.vm = new VegMaterials(lib);
    this.vm.alphaToCoverage = alphaToCoverage;
    this.fallback = new DecorRenderer(map);
    this.group.add(this.fallback.group);
    this.loaded = this.load();
  }

  /** erfüllt, sobald die Vegetation geladen ist (oder der Rückfall feststeht) – LookDev/Messungen warten darauf */
  readonly loaded: Promise<void>;

  /** Vegetations-Assets laden (alle Manifest-Einträge mit `veg`); fehlt eine Baumart → dauerhaft prozeduraler Rückfall */
  private async load(): Promise<void> {
    const m = await assetRegistry.loadManifest();
    const all = m ? Object.values(m.assets).filter((a) => a.veg) : [];
    if (!all.length || !catalogReady(catalogOf(all))) {
      this.fail('keine vollständigen Vegetations-Assets im Manifest');
      return;
    }
    const res = await Promise.all(all.map((a) => assetRegistry.load(a.id)));
    const ok = all.filter((_, i) => res[i]);
    res.forEach((r) => r && this.models.set(r.id, r));
    const cat = catalogOf(ok);
    if (!catalogReady(cat)) {
      this.fail('Vegetations-Assets konnten nicht geladen werden');
      return;
    }
    this.cat = cat;
    this.state = 'ready';
    if (this.fallback) {
      this.group.remove(this.fallback.group);
      this.fallback.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
      this.fallback = null;
    }
    this.dirty = true;
    this.lastBuild = -10;
  }

  private fail(why: string): void {
    this.state = 'failed';
    console.info(`[umgebung] ${why} – prozedurale Vegetation bleibt`);
  }

  get ready(): boolean {
    return this.state === 'ready';
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.biome = biomeOf(map.seed);
    this.fallback?.setMap(map);
    this.dirty = true;
    this.groundDirty = true;
  }

  setOccupancy(a: Int32Array | null, buildings?: ReadonlyMap<number, GroundBuilding>): void {
    this.occupied = a;
    if (buildings) this.blds = buildings;
    this.fallback?.setOccupancy(a, buildings);
    this.dirty = true;
    this.groundDirty = true;
  }

  setExplored(e: Uint8Array | null): void {
    this.explored = e;
    this.fallback?.setExplored(e);
    this.dirty = true;
  }

  applyQuality(q: QualityCfg, shadows: boolean): void {
    this.q = q;
    this.shadows = shadows;
    ENVU.uTrans.value = q.envTranslucency;
    this.fallback?.applyQuality(q, shadows);
    for (const v of this.meshes.values()) this.setupMesh(v.mesh, v.cls, v.lod);
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
    this.groundDirty = true;
    this.fallback?.markDirty();
  }

  setCameraPos(p: THREE.Vector3): void {
    this.camPos.copy(p);
  }

  /** Kamera setzen (GameScene): Sichtprüfung je Instanz; Drehen der Kamera verteilt neu */
  setCamera(c: THREE.Camera): void {
    this.camera = c;
  }

  private setupMesh(m: THREE.InstancedMesh, cls: VegClass, lod: number): void {
    // Fernformen (LOD2) werfen keine Schatten: liegen fast immer außerhalb der eingepassten Schattenkamera (spart Draw-Calls)
    m.castShadow = this.shadows && this.q.shadowDecor && cls !== 'flora' && lod < 2;
    m.receiveShadow = this.shadows;
  }

  /** Bodenkarte und Umgebungskarte (Wege aus Trampelpfaden + LookDev-Wege, Kronendach) neu berechnen */
  private updateGround(): void {
    const map = this.map;
    if (this.ground && this.blds) this.ground.update({ w: map.w, h: map.h, terrain: map.terrain }, this.blds.values());
    if (this.env) {
      const segs: RoadSeg[] = this.blds ? snapTrails(trailSegments(this.blds.values()), this.env.extraRoads) : [];
      this.env.update(segs, map.trees, (i) => map.terrain[i] === T.Water || map.terrain[i] === T.Moat);
    }
    this.groundDirty = false;
  }

  update(now: number, camX = this.map.w / 2, camZ = this.map.h / 2, camDist = this.camDist, camPos?: THREE.Vector3): void {
    this.camDist = camDist;
    if (camPos) this.camPos.copy(camPos);
    const fr = Math.min(this.q.envFloraRadius, Math.max(10, camDist * 0.9));
    ENVU.uGrassFade.value.set(camX, camZ, fr * 0.72, fr * 0.98);
    if (this.groundDirty && (now - this.lastBuild >= 0.35 || now < this.lastBuild)) this.updateGround();
    if (!this.ready) {
      this.fallback?.update(now, camX, camZ, camDist, camPos);
      return;
    }
    const moved = Math.abs(camX - this.cx) > 3 || Math.abs(camZ - this.cz) > 3;
    const zoomed = Math.abs(camDist - this.lastCamDist) > this.lastCamDist * 0.15;
    if (this.camera) this.camera.getWorldDirection(this.viewDir);
    // Sichtkegel-Auslese: auch Drehen/Verschieben der Kamera (bei festem Blickpunkt) verteilt neu
    const turned = this.camera ? this.viewDir.dot(this.lastViewDir) < 0.985 || this.camPos.distanceToSquared(this.lastCamPos) > 4 : false;
    // Zeit kann zurückspringen (LookDev setzt die synthetische Uhr je Kamera zurück) → dann sofort neu verteilen
    const since = now - this.lastBuild;
    if (!(this.dirty || moved || zoomed || turned) || (since >= 0 && since < 0.35)) return;
    this.lastViewDir.copy(this.viewDir);
    this.lastCamPos.copy(this.camPos);
    this.dirty = false;
    this.lastBuild = now;
    this.cx = camX;
    this.cz = camZ;
    this.lastCamDist = camDist;
    this.rebuild(camX, camZ);
  }

  /** Instanzen neu verteilen (Verteilung env/veg_place.ts, LOD je Instanz) */
  rebuild(camX: number, camZ: number): void {
    const cat = this.cat;
    if (!cat) return;
    const t0 = performance.now();
    const map = this.map;
    const q = this.q;
    const vq = vegQualityOf(q);
    for (const l of this.lists.values()) l.length = 0;
    const L = (id: string, lod0: number): number[] => {
      const nl = this.models.get(id)?.lods.length ?? 3;
      const lod = Math.min(lod0, nl - 1);
      const k = `${id}|${lod}`;
      let l = this.lists.get(k);
      if (!l) {
        l = [];
        this.lists.set(k, l);
      }
      return l;
    };
    const gd = this.ground?.data ?? null;
    const env = this.env;
    const radius = Math.min(q.decorRadius, Math.max(36, this.camDist * 1.55 + 14));
    const cp = this.camPos.x < 1e8 ? this.camPos : new THREE.Vector3(camX, 30, camZ);
    // erweiterter Sichtkegel: Rand 5 Einheiten (Schatten knapp außerhalb stehender Bäume fallen noch ins Bild)
    let visible: ((x: number, y: number, z: number, r: number) => boolean) | null = null;
    if (this.camera) {
      this.camera.updateMatrixWorld();
      const pm = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(pm);
      const sph = new THREE.Sphere();
      const fr = this.frustum;
      visible = (x, y, z, r) => {
        sph.center.set(x, y, z);
        sph.radius = r + 5;
        return fr.intersectsSphere(sph);
      };
    }
    const st: VegStats = placeVegetation(
      {
        w: map.w,
        h: map.h,
        seed: map.seed,
        terrain: map.terrain,
        height: map.height,
        trees: map.trees,
        biome: this.biome,
        occupied: this.occupied,
        explored: this.explored,
        trace: gd ? (i) => groundTrace(gd, i) : null,
        road: env ? (x, y) => env.road(x, y) : null,
        camX,
        camZ,
        camPos: cp,
        radius,
        q: vq,
        cat,
        visible,
      },
      (id, lod, x, y, z, rot, s, sy, lean, r, g, b) => L(id, lod).push(x, y, z, rot, s, sy, lean, r, g, b),
    );
    // feste Requisiten (Zäune, Gärten …)
    let props = 0;
    for (const p of this.extraProps) {
      const model = this.models.get(p.id);
      if (!model) continue;
      const cls = cat.cls[p.id] ?? 'prop';
      const xi = Math.floor(p.x);
      const yi = Math.floor(p.y);
      const base = map.inBounds(xi, yi) ? map.height[map.idx(xi, yi)] * HEIGHT_STEP : 0;
      const dx = p.x - cp.x;
      const dy = base + 0.4 - cp.y;
      const dz = p.y - cp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius * 1.2) continue;
      if (visible && !visible(p.x, base + 0.4, p.y, 1.5)) continue;
      const lod = vegLod(cls, dist, vq);
      if (cls === 'flora' && lod > 1) continue;
      const s = p.s ?? 1;
      L(p.id, lod).push(p.x, base, p.y, p.rot, s, s, 0, 1, 1, 1);
      props++;
    }
    // Instanzen in die Meshes je (Asset × LOD × Material)
    const touched = new Set<string>();
    let groups = 0;
    for (const [key, list] of this.lists) {
      const n = list.length / STRIDE;
      if (!n) continue;
      const [id, ls] = key.split('|');
      const model = this.models.get(id);
      if (!model) continue;
      const lod = Math.min(Number(ls), model.lods.length - 1);
      const parts = model.lods[lod].parts;
      for (let k = 0; k < parts.length; k++) {
        const mk = `${id}|${lod}|${k}`;
        const vmesh = this.ensure(mk, model, lod, k, n, cat.cls[id] ?? 'prop');
        const m = vmesh.mesh;
        const arr = m.instanceMatrix.array as Float32Array;
        const ca = (m.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
        const start = 0;
        for (let j = 0; j < n; j++) {
          const o = j * STRIDE;
          writeInstanceMatrix(arr, (start + j) * 16, list[o], list[o + 1], list[o + 2], list[o + 3], list[o + 6], list[o + 4], list[o + 5]);
          ca[(start + j) * 3] = list[o + 7];
          ca[(start + j) * 3 + 1] = list[o + 8];
          ca[(start + j) * 3 + 2] = list[o + 9];
        }
        m.count = start + n;
        m.visible = true;
        m.instanceMatrix.needsUpdate = true;
        (m.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
        groups++;
        touched.add(mk);
      }
    }
    for (const [k, v] of this.meshes)
      if (!touched.has(k)) {
        v.mesh.count = 0;
        v.mesh.visible = false;
      }
    this.stats = {
      trees: st.trees,
      far: 0,
      small: st.flora,
      total: st.total + props,
      ms: performance.now() - t0,
      bushes: st.bushes,
      rocks: st.rocks,
      props,
      perLod: st.perLod.slice(),
      groups,
    };
  }

  private ensure(key: string, model: AssetModel, lod: number, k: number, count: number, cls: VegClass): VegMesh {
    let v = this.meshes.get(key);
    if (v && v.mesh.instanceMatrix.count >= count) return v;
    const cap = Math.max(16, Math.ceil(count * 1.4));
    if (v) {
      this.group.remove(v.mesh);
      v.mesh.dispose();
    }
    const part = model.lods[lod].parts[k];
    const exportTile = model.def.uvTile?.[part.material];
    const nowTile = assetRegistry.materials.defs[part.material]?.tile;
    const uvScale = exportTile && nowTile ? exportTile / nowTile : 1;
    const { mat, depth } = this.vm.get(part.material, uvScale, cls === 'flora');
    const m = new THREE.InstancedMesh(shareGeometry(part.geometry), mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.customDepthMaterial = depth;
    m.frustumCulled = false;
    m.count = 0;
    m.name = `veg:${model.id}:LOD${lod}:${part.material}`;
    this.setupMesh(m, cls, lod);
    this.group.add(m);
    v = { mesh: m, cls, lod };
    this.meshes.set(key, v);
    return v;
  }

  /** Grenzen der LOD-Stufen je Klasse bei der aktuellen Stufe (Statistik/Doku) */
  lodTable(): Record<VegClass, [number, number]> {
    const s = vegQualityOf(this.q).lodScale;
    const out = {} as Record<VegClass, [number, number]>;
    for (const [k, v] of Object.entries(VEG_LOD)) out[k as VegClass] = [v[0] * s, v[1] * s];
    return out;
  }

  dispose(): void {
    for (const v of this.meshes.values()) v.mesh.dispose();
    this.meshes.clear();
    this.vm.dispose();
  }
}
