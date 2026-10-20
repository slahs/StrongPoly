import * as THREE from 'three';
import { BUILDINGS, BT, BuildingDef, ClientWorld, PAL, PLAYER_COLORS, PROJ, U, UNITS, UNIT_TYPES, BUILDING_TYPES, BF, SLOT_MASK } from '@strongpoly/shared';
import type { ClientBuilding } from '@strongpoly/shared';
import { FxSystem, BillboardLayer } from './fx';
import { TypeMesh, teamTable } from './instanced';
import { AF } from './materials';
import { buildBuildingModel, buildTurretModel, buildWallModel, ModelDetail, TURRET_BASE_Y, WALL_JOIN, WALL_TYPES } from './models_buildings';
import { BGFX, buildingLevelOf, buildingMaterial } from './building_materials';
import { arrowGeo, flameGeo, rubbleGeo, stoneGeo } from './models_misc';
import { BuildSites } from './build_sites';
import { buildTicksOf } from './build_config';
import {
  buildCargoModel,
  buildUnitModel,
  CargoKind,
  CARGO_KINDS,
  CARGO_OF_RES,
  UNIT_CORPSE,
  UNIT_CYCLE,
  UNIT_SCALE,
  UNIT_SIDEWAYS,
  UNIT_TOP,
  UNIT_WALK_W,
} from './models_units';
import { ModelBuilder } from './builder';
import { QualityCfg, qualityOf } from './quality';
import { groundYAt, RES_COLORS, tileY } from './util';
import { EMITTERS } from './work_fx';

const TEAM = teamTable(PLAYER_COLORS);
const NEUTRAL = new THREE.Color(0xf2ede0);
const RANGED: boolean[] = UNITS.map((d) => d.proj !== PROJ.None && d.range > 2);
const SIEGE: boolean[] = UNITS.map((d) => d.side === 'siege');
const PI2 = Math.PI * 2;

export interface RenderOpts {
  alpha: number;
  now: number;
  camYaw: number;
  selected: Set<number>;
  selectedBuilding: number;
  hoverTile: { x: number; y: number } | null;
  /** Gebäude unter dem Mauszeiger (id oder 0) */
  hoverBuilding?: number;
  /** Kamera für die Sichtbarkeitsprüfung (nur Sichtbares wird geschrieben) */
  camera?: THREE.Camera;
  /** Sichtbarkeitsprüfung (Fog of War) */
  visible: ((x: number, y: number) => boolean) | null;
  /** Erkundet (Gebäude bleiben sichtbar, wenn einmal gesehen) */
  explored: ((x: number, y: number) => boolean) | null;
  me: number;
  myTeam: number;
  teamOfPlayer: number[];
}

interface Corpse {
  type: number;
  x: number;
  y: number;
  face: number;
  owner: number;
  t0: number;
  phase: number;
}
interface RubbleCell {
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
  t0: number;
  wood: boolean;
  life: number;
}
interface Collapse {
  type: number;
  cx: number;
  cz: number;
  y: number;
  rot: number;
  t0: number;
  owner: number;
}
interface BurnSite {
  x: number;
  z: number;
  y: number;
  w: number;
  h: number;
  top: number;
}
interface EmitSite {
  x: number;
  y: number;
  z: number;
  kind: string;
  rate: number;
  acc: number;
}

/** Dauer der Baustufen-Darstellung in Sim-Ticks (10 je Sekunde, rein visuell, aus der zentralen Konfiguration build_config.ts); 0 = keine */
export function buildTicks(def: BuildingDef): number {
  return buildTicksOf(def);
}

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Zeichnet Einheiten, Gebäude, Projektile und Effekte aus dem ClientWorld-Zustand (nur lesend). */
export class EntityRenderer {
  readonly group = new THREE.Group();
  readonly fx = new FxSystem();
  /** wird aufgerufen, wenn sich Gebäude geändert haben (z. B. Dekor neu berechnen) */
  onBuildingsChanged: (() => void) | null = null;
  private unitMeshes: (TypeMesh | null)[] = new Array(UNIT_TYPES).fill(null);
  private bldMeshes: (TypeMesh | null)[] = new Array(BUILDING_TYPES).fill(null);
  private wallMeshes = new Map<string, TypeMesh>();
  private cargoMeshes = new Map<CargoKind, TypeMesh>();
  /** Baustellen (Fundament, Gerüst, Baumaterial, wachsende Gebäude und Mauern, Abschlusseffekt) – siehe build_sites.ts */
  private sites: BuildSites;
  private turretMeshes: (TypeMesh | null)[] = [null, null, null];
  private rubbleStone: TypeMesh;
  private rubbleWood: TypeMesh;
  private ringMesh: THREE.InstancedMesh;
  private hpBg: THREE.InstancedMesh;
  private hpFg: THREE.InstancedMesh;
  private arrows: TypeMesh;
  private bolts: TypeMesh;
  private fireArrows: TypeMesh;
  private stones: TypeMesh;
  private boulders: TypeMesh;
  private fires: THREE.InstancedMesh;
  private ladderMesh: THREE.InstancedMesh;
  private frames: THREE.InstancedMesh;
  private blob: BillboardLayer;
  private aoLayer: BillboardLayer;
  private bannerMesh: TypeMesh;
  private hoverLines: THREE.LineSegments;
  private edgeCache = new Map<number, THREE.BufferGeometry>();
  private hoverId = -1;
  private yS: Float32Array = new Float32Array(8192);
  private faceS: Float32Array = new Float32Array(8192);
  private seenId: Int32Array = new Int32Array(8192);
  private shadows = true;
  private q: QualityCfg = qualityOf('medium');
  /** Detailstufe der Gebäudemodelle (aus der Grafikstufe, siehe building_materials.ts) */
  private bDetail: ModelDetail = 2;
  private unitShadows = true;
  private flameT = 0;
  private world: ClientWorld;
  private lastOpts: RenderOpts | null = null;
  private corpses: Corpse[] = [];
  private rubble: RubbleCell[] = [];
  private collapsing: Collapse[] = [];
  /** Gebäude, die gerade gebaut werden (Baustufe aus world.tick − Platzierungs-Tick `n` im Snapshot) */
  private building = new Set<number>();
  private gateP = new Map<number, number>();
  private mapRef: unknown = null;
  private burnSites: BurnSite[] = [];
  private emitSites: EmitSite[] = [];
  private fireList: { x: number; y: number; z: number; s: number }[] = [];
  private bldDirty = true;
  private gateAnim = false;
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  /** Statistik der letzten Aktualisierung (für Messungen) */
  stats = { units: 0, buildings: 0, projectiles: 0, corpses: 0, ms: { buildings: 0, units: 0, corpses: 0, proj: 0, emit: 0, fx: 0 } };

  constructor(world: ClientWorld) {
    this.world = world;
    this.group.name = 'entities';
    this.group.add(this.fx.group);

    this.sites = new BuildSites(this.group, this.fx, TEAM);
    this.rubbleStone = new TypeMesh(rubbleGeo(false), this.group, { anim: false, shadow: true, cap: 128 }, TEAM);
    this.rubbleWood = new TypeMesh(rubbleGeo(true), this.group, { anim: false, shadow: true, cap: 128 }, TEAM);

    const ringGeo = new THREE.RingGeometry(0.36, 0.47, 14);
    ringGeo.rotateX(-Math.PI / 2);
    const ringInner = new THREE.RingGeometry(0.31, 0.34, 14);
    ringInner.rotateX(-Math.PI / 2);
    const rg = mergeGeos(ringGeo, ringInner);
    this.ringMesh = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }), 2048);
    this.ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2048 * 3), 3);
    this.ringMesh.count = 0;
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 2;
    this.group.add(this.ringMesh);

    const barGeo = new THREE.PlaneGeometry(1, 1);
    this.hpBg = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x24211e, depthTest: false, transparent: true, opacity: 0.85 }), 2048);
    this.hpFg = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }), 2048);
    this.hpFg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2048 * 3), 3);
    for (const m of [this.hpBg, this.hpFg]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 10;
      this.group.add(m);
    }
    this.hpFg.renderOrder = 11;

    for (const k of CARGO_KINDS) this.cargoMeshes.set(k, new TypeMesh(buildCargoModel(k).merged, this.group, { anim: true, shadow: false, cap: 64 }, TEAM));

    this.arrows = new TypeMesh(arrowGeo('arrow'), this.group, { anim: false, shadow: false, cap: 512 }, TEAM);
    this.bolts = new TypeMesh(arrowGeo('bolt'), this.group, { anim: false, shadow: false, cap: 128 }, TEAM);
    this.fireArrows = new TypeMesh(arrowGeo('fire'), this.group, { anim: false, shadow: false, cap: 128 }, TEAM);
    this.stones = new TypeMesh(stoneGeo(false), this.group, { anim: false, shadow: true, cap: 128 }, TEAM);
    this.boulders = new TypeMesh(stoneGeo(true), this.group, { anim: false, shadow: true, cap: 64 }, TEAM);

    const fireGeo = flameGeo();
    this.fires = new THREE.InstancedMesh(fireGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), 1024);
    this.fires.count = 0;
    this.fires.frustumCulled = false;
    this.group.add(this.fires);

    const ladGeo = new ModelBuilder({ ao: 0.1 })
      .box(0.06, 1.8, 0.06, -0.2, 0, 0, PAL.wood)
      .box(0.06, 1.8, 0.06, 0.2, 0, 0, PAL.wood)
      .box(0.4, 0.05, 0.05, 0, 0.4, 0, PAL.woodDark)
      .box(0.4, 0.05, 0.05, 0, 0.9, 0, PAL.woodDark)
      .box(0.4, 0.05, 0.05, 0, 1.4, 0, PAL.woodDark)
      .build().body;
    this.ladderMesh = new THREE.InstancedMesh(ladGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 256);
    this.ladderMesh.count = 0;
    this.ladderMesh.frustumCulled = false;
    this.ladderMesh.castShadow = true;
    this.group.add(this.ladderMesh);

    const pole = new ModelBuilder({ ao: 0.2 })
      .cyl(0.05, 0.07, 2.6, 5, 0, 0, 0, PAL.woodDark)
      .part(11, 0, 2.45, 0)
      .box(0.04, 0.45, 0.7, 0, 2.05, 0.38, PAL.white, true)
      .part(0)
      .pyramid(0.08, 0.2, 0, 2.6, 0, PAL.gold)
      .cyl(0.35, 0.4, 0.15, 6, 0, 0, 0, PAL.stoneDark)
      .build();
    this.bannerMesh = new TypeMesh(pole.merged, this.group, { anim: true, shadow: true, cap: 8 }, TEAM);

    // Rahmen für Hover (0..3) und Auswahl (4..7) von Gebäuden
    this.frames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false }),
      8,
    );
    this.frames.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
    this.frames.count = 0;
    this.frames.frustumCulled = false;
    this.frames.renderOrder = 6;
    this.group.add(this.frames);

    this.hoverLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.85 }));
    this.hoverLines.visible = false;
    this.hoverLines.frustumCulled = false;
    this.hoverLines.renderOrder = 7;
    this.group.add(this.hoverLines);

    this.blob = new BillboardLayer(4096, { flat: true, order: 1, shape: 0 });
    this.aoLayer = new BillboardLayer(1024, { flat: true, order: 0, shape: 2 });
    this.group.add(this.blob.mesh, this.aoLayer.mesh);
  }

  setShadows(on: boolean): void {
    this.applyQuality(this.q, on);
  }

  /** Grafikstufe anwenden (Schatten, Partikelobergrenzen, Blob-Schatten) */
  applyQuality(q: QualityCfg, shadows = this.shadows): void {
    const reFx = this.q !== q;
    const lvl = buildingLevelOf(q);
    BGFX.uDetail.value = lvl.patterns ? 1 : 0;
    if (lvl.detail !== this.bDetail) {
      // andere Modellstufe: Gebäudemeshes verwerfen, sie werden beim nächsten Zeichnen neu aufgebaut
      this.bDetail = lvl.detail;
      for (const m of this.bldMeshes) m?.dispose();
      for (const m of this.wallMeshes.values()) m.dispose();
      this.bldMeshes.fill(null);
      this.wallMeshes.clear();
      for (const m of this.turretMeshes) m?.dispose();
      this.turretMeshes.fill(null);
    }
    this.q = q;
    this.shadows = shadows;
    this.unitShadows = shadows && q.shadowUnits;
    for (const m of this.unitMeshes) m?.setShadows(this.unitShadows);
    for (const m of this.cargoMeshes.values()) m.setShadows(false);
    for (const m of this.bldMeshes) m?.setShadows(shadows);
    for (const m of this.wallMeshes.values()) m.setShadows(shadows);
    this.sites.setQuality(shadows, q.particleScale, lvl.detail);
    for (const m of this.turretMeshes) m?.setShadows(shadows);
    this.rubbleStone.setShadows(shadows);
    this.rubbleWood.setShadows(shadows);
    this.stones.setShadows(shadows);
    this.boulders.setShadows(shadows);
    this.bannerMesh.setShadows(shadows);
    this.ladderMesh.castShadow = shadows;
    if (reFx) this.fx.applyQuality(q);
    this.bldDirty = true;
  }

  /** Gibt GPU-Puffer und Geometrien frei (beim Beenden der Partie) */
  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.sites.dispose();
    for (const g of this.edgeCache.values()) g.dispose();
    this.edgeCache.clear();
  }

  /** Blut abschaltbar (Einstellung) */
  setBlood(on: boolean): void {
    this.fx.blood = on;
  }

  private unitMesh(t: number): TypeMesh {
    let m = this.unitMeshes[t];
    if (!m) {
      m = new TypeMesh(buildUnitModel(t).merged, this.group, { anim: true, shadow: this.unitShadows, cap: t === U.Peasant ? 512 : 128 }, TEAM);
      this.unitMeshes[t] = m;
    }
    return m;
  }

  private bldMesh(t: number): TypeMesh {
    let m = this.bldMeshes[t];
    if (!m) {
      m = new TypeMesh(buildBuildingModel(BUILDINGS[t], this.bDetail).merged, this.group, { anim: true, shadow: this.shadows, cap: 64, material: buildingMaterial() }, TEAM);
      this.bldMeshes[t] = m;
    }
    return m;
  }

  private wallMesh(t: number, kind: 'arm' | 'post' | 'stub'): TypeMesh {
    const key = `${t}:${kind}`;
    let m = this.wallMeshes.get(key);
    if (!m) {
      m = new TypeMesh(buildWallModel(t, BUILDINGS[t].height, kind, this.bDetail).merged, this.group, { anim: true, shadow: this.shadows, cap: 256, material: buildingMaterial() }, TEAM);
      this.wallMeshes.set(key, m);
    }
    return m;
  }

  private cargoMesh(k: CargoKind): TypeMesh {
    return this.cargoMeshes.get(k)!;
  }

  private visibleAt(x: number, y: number): boolean {
    const o = this.lastOpts;
    return !o || !o.visible || o.visible(x, y);
  }

  /** Ruft gesammelte Sim-Events ab und erzeugt Effekte */
  consumeEvents(): void {
    const w = this.world;
    const now = this.lastOpts?.now ?? 0;
    for (const e of w.events) {
      if (e.e === 'fx') {
        if (!this.visibleAt(e.x, e.y)) continue;
        this.fx.effect(e.k, e.x, e.y, (e.z ?? 0.5) + tileY(w, Math.floor(e.x), Math.floor(e.y)));
      }
    }
    for (const d of w.deaths) {
      if (!this.visibleAt(d.x, d.y)) continue;
      const gy = tileY(w, Math.floor(d.x), Math.floor(d.y));
      if (UNIT_CORPSE[d.type] && d.type !== U.Ox) {
        if (this.corpses.length >= this.q.corpses) this.corpses.shift();
        this.corpses.push({ type: d.type, x: d.x, y: d.y, face: d.face, owner: d.owner, t0: now, phase: Math.random() });
        if (d.type !== U.Peasant) this.fx.bloodAt(d.x, gy, d.y);
        this.fx.effect('dust', d.x, d.y, gy + 0.1);
      } else if (d.type === U.Ox) {
        if (this.corpses.length >= this.q.corpses) this.corpses.shift();
        this.corpses.push({ type: d.type, x: d.x, y: d.y, face: d.face, owner: d.owner, t0: now, phase: Math.random() });
      } else {
        // Belagerungsgerät zerfällt in Splitter
        this.fx.effect('collapseWood', d.x, d.y, gy + 0.4);
      }
    }
    // Zerstörte Gebäude: Einsturz + Trümmerhaufen (Abriss ohne Trümmer erkennt man am fehlenden Einsturz-Ereignis)
    for (const b of w.removedBuildings) {
      const def = BUILDINGS[b.t];
      if (def.hp <= 0) continue;
      let destroyed = false;
      for (const e of w.events) {
        if (e.e === 'fx' && (e.k === 'collapse' || e.k === 'collapseWood') && Math.abs(e.x - (b.x + b.w / 2)) <= b.w / 2 + 1.5 && Math.abs(e.y - (b.y + b.h / 2)) <= b.h / 2 + 1.5) {
          destroyed = true;
          break;
        }
      }
      const wasBuilding = this.building.delete(b.i);
      this.sites.forget(b.i);
      // Abbruch/Rückgängig während der Bauphase: Baustelle verschwindet mit einer Staubwolke
      if (wasBuilding && !destroyed && this.visibleAt(b.x + b.w / 2, b.y + b.h / 2)) this.sites.abort(b, tileY(w, b.x, b.y));
      if (!destroyed) continue;
      this.collapsing.push({ type: b.t, cx: b.x + b.w / 2, cz: b.y + b.h / 2, y: def.placement === 'water' ? -0.1 : tileY(w, b.x, b.y), rot: b.r ? Math.PI / 2 : 0, t0: now, owner: b.o });
      const life = this.q.particleScale < 0.5 ? 8 : 22;
      const y0 = tileY(w, b.x, b.y);
      for (let yy = 0; yy < b.h; yy++)
        for (let xx = 0; xx < b.w; xx++) {
          if (this.rubble.length > 480) this.rubble.shift();
          const h1 = ((b.x + xx) * 73856093) ^ ((b.y + yy) * 19349663) ^ (b.i * 83492791);
          this.rubble.push({ x: b.x + xx + 0.5, y: y0, z: b.y + yy + 0.5, rot: ((h1 >>> 3) % 628) / 100, s: 0.85 + ((h1 >>> 9) % 40) / 100, t0: now + 0.25, wood: def.wood, life });
        }
    }
  }

  update(dt: number, o: RenderOpts): void {
    this.lastOpts = o;
    this.flameT += dt;
    if (o.camera) {
      o.camera.updateMatrixWorld();
      this.projScreen.multiplyMatrices((o.camera as THREE.PerspectiveCamera).projectionMatrix, o.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projScreen);
    }
    const ms = this.stats.ms;
    let t = performance.now();
    this.updateBuildings(dt, o);
    let t2 = performance.now();
    ms.buildings = t2 - t;
    t = t2;
    this.updateUnits(dt, o);
    t2 = performance.now();
    ms.units = t2 - t;
    t = t2;
    this.updateCorpses(o);
    t2 = performance.now();
    ms.corpses = t2 - t;
    t = t2;
    this.updateProjectiles(o);
    this.updateBanners(o);
    t2 = performance.now();
    ms.proj = t2 - t;
    t = t2;
    this.updateEmitters(dt, o);
    t2 = performance.now();
    ms.emit = t2 - t;
    t = t2;
    this.fx.update(dt);
    ms.fx = performance.now() - t;
  }

  private inView(x: number, y: number, z: number, r: number): boolean {
    const p = this.frustum.planes;
    for (let i = 0; i < 6; i++) {
      const pl = p[i];
      if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -r) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ Gebäude
  private updateBuildings(dt: number, o: RenderOpts): void {
    const w = this.world;
    const now = o.now;
    if (this.mapRef !== w.map) {
      // neue Karte/Vollzustand: alles als fertig behandeln
      this.mapRef = w.map;
      this.building.clear();
      this.sites.reset();
      this.rubble.length = 0;
      this.collapsing.length = 0;
      this.corpses.length = 0;
      this.gateP.clear();
      this.bldDirty = true;
    }
    // Torflügel gleiten
    this.gateAnim = false;
    for (const [id, p] of this.gateP) {
      const b = w.buildings.get(id);
      if (!b) {
        this.gateP.delete(id);
        continue;
      }
      const target = b.f & BF.GateOpen ? 1 : 0;
      if (Math.abs(p - target) > 0.01) {
        this.gateP.set(id, p + (target - p) * Math.min(1, dt * 3.5));
        this.gateAnim = true;
      } else if (p !== target) this.gateP.set(id, target);
    }
    const redraw = w.buildingsDirty || this.bldDirty || this.building.size > 0 || this.gateAnim || this.collapsing.length > 0 || o.selectedBuilding !== this.lastSelB;
    this.lastSelB = o.selectedBuilding;
    const sizeBefore = w.buildings.size;
    void sizeBefore;
    if (redraw) {
      const changed = w.buildingsDirty || this.bldDirty;
      w.buildingsDirty = false;
      this.bldDirty = false;
      this.rewriteBuildings(dt, o, changed);
      if (changed) this.onBuildingsChanged?.();
    }
    this.updateRubble(o);
    this.updateFrames(o);
  }
  private lastSelB = -1;

  private rewriteBuildings(dt: number, o: RenderOpts, rebuildLists: boolean): void {
    const w = this.world;
    const now = o.now;
    const hasCam = !!o.camera;
    void hasCam;
    for (const m of this.bldMeshes) m?.begin();
    for (const m of this.wallMeshes.values()) m.begin();
    this.sites.begin();
    for (const m of this.turretMeshes) m?.begin();
    this.aoLayer.n = 0;
    const burn: BurnSite[] = [];
    const emits: EmitSite[] = [];
    const fire: { x: number; y: number; z: number; s: number }[] = [];
    const bld = w.bldAt;
    const mw = w.map.w;
    const mh = w.map.h;
    const dir4: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const armRot = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
    let count = 0;
    for (const b of w.buildings.values()) {
      const def = BUILDINGS[b.t];
      const mine = o.teamOfPlayer[b.o] === o.myTeam;
      // Fallen sind für Gegner unsichtbar
      if ((b.t === BT.Pit || b.t === BT.KillingPit) && !mine) continue;
      const cx = b.x + b.w / 2;
      const cz = b.y + b.h / 2;
      // Bauphase aus dem Platzierungs-Tick (Fundament → Gerüst → fertig); Pause und Spielgeschwindigkeit wirken mit
      let prog = 1;
      if (b.n > 0) {
        prog = this.sites.progress(w, b, o.alpha);
        if (prog < 1) this.building.add(b.i);
      }
      if (prog >= 1 && this.building.delete(b.i)) {
        // fertig: Abschlusseffekt; Schornsteine, Rauch und Brandstellen werden erst jetzt eingetragen
        this.bldDirty = true;
        if (this.visibleAt(cx, cz)) this.sites.finish(b, def, tileY(w, b.x, b.y));
      }
      if (o.explored && !mine && !o.explored(cx, cz)) continue;
      count++;
      const y = def.placement === 'water' ? -0.1 : tileY(w, b.x, b.y);
      const phase = (((b.i * 2654435761) >>> 8) % 1000) / 1000;
      const staffed = b.s > 0;

      // Bodenverdunklung unter größeren Gebäuden (weicher Kontaktschatten)
      if (prog >= 0.2 && def.height >= 0.7 && !def.line && b.w + b.h >= 4 && this.aoLayer.n < 1000) {
        this.aoLayer.push(cx, y + 0.025, cz, Math.max(b.w, b.h) + 0.9, 0.05, 0.04, 0.03, 0.38);
      }

      // Bauphase: Fundament, Baumaterial, Gerüst, von unten wachsende Teile (build_sites.ts)
      const isWall = WALL_TYPES.includes(b.t);
      let wallMask = 0;
      if (isWall) {
        for (let k = 0; k < 4; k++) {
          const nx = b.x + dir4[k][0];
          const ny = b.y + dir4[k][1];
          if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
          const nid = bld[ny * mw + nx];
          if (!nid) continue;
          const nb = w.buildings.get(nid);
          if (nb && WALL_JOIN.has(nb.t)) wallMask |= 1 << k;
        }
      }
      if (prog < 1) {
        const vis = !o.camera || this.inView(cx, y + 1, cz, 4 + Math.max(b.w, b.h));
        if (isWall) this.sites.drawWall(b, def, y, wallMask, prog, phase, dt, vis);
        else {
          const so = this.stairOrient(b, dir4, bld, mw, mh);
          this.sites.draw(b, def, y, so.rot, so.sy, prog, phase, dt, vis);
        }
        continue;
      }

      // Mauern: Pfosten + Arme zu den vier Nachbarn (nahtlos, Ecken und T-Stücke ergeben sich von selbst)
      if (isWall) {
        const mask = wallMask;
        const post = this.wallMesh(b.t, mask === 0 ? 'stub' : 'post');
        post.push(cx, y, cz, 0, 1, 1, b.o, phase, AF.Static, 0, 1);
        for (let k = 0; k < 4; k++) if (mask & (1 << k)) this.wallMesh(b.t, 'arm').push(cx, y, cz, armRot[k], 1, 1, b.o, phase, AF.Static, 0, 1);
        continue;
      }

      const so = this.stairOrient(b, dir4, bld, mw, mh);
      const rot = so.rot;
      const sy = so.sy;
      let flags = AF.Static;
      const a2 = 0;
      let a3 = 1.2;
      if (staffed) flags |= AF.Work;
      if (def.gate) {
        let p = this.gateP.get(b.i);
        if (p === undefined) {
          p = b.f & BF.GateOpen ? 1 : 0;
          this.gateP.set(b.i, p);
        }
        a3 = p;
      }
      this.bldMesh(b.t).push(cx, y, cz, rot, 1, sy, b.o, phase, flags, a2, a3);
      if (b.u > 0 && b.t === BT.TowerRound) this.pushTurret(b, y, cx, cz, o, phase);

      if (rebuildLists) {
        if (b.f & BF.Burning) {
          burn.push({ x: b.x, z: b.y, y, w: b.w, h: b.h, top: Math.max(0.5, def.height) });
          const n = Math.max(1, Math.min(6, Math.round((b.w * b.h) / 3)));
          for (let k = 0; k < n; k++) {
            fire.push({
              x: b.x + 0.5 + (((k * 7919) % 97) / 97) * Math.max(0, b.w - 1),
              z: b.y + 0.5 + (((k * 104729) % 89) / 89) * Math.max(0, b.h - 1),
              y: y + Math.max(0.3, def.height * 0.6),
              s: 1 + def.height * 0.25,
            });
          }
        }
        const em = EMITTERS[b.t];
        if (em && this.q.workSmoke) {
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          for (const e of em) {
            if (e.staffed && !staffed) continue;
            emits.push({ x: cx + e.x * c + e.z * s, y: y + e.y, z: cz - e.x * s + e.z * c, kind: e.kind, rate: e.rate, acc: Math.random() });
          }
        }
      }
    }
    // Zusammenbrechende Gebäude: Modell sackt ab, während der Trümmerhaufen wächst
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const c = this.collapsing[i];
      const age = now - c.t0;
      if (age > 0.8) {
        this.collapsing.splice(i, 1);
        continue;
      }
      const k = ease(age / 0.8);
      const shake = Math.sin(age * 60) * 0.03 * (1 - k);
      this.bldMesh(c.type).push(c.cx + shake, c.y - 0.2 * k, c.cz, c.rot, 1, Math.max(0.05, 1 - 0.95 * k), c.owner, 0, AF.Static, 0, 1);
    }
    for (const m of this.bldMeshes) m?.end();
    for (const m of this.wallMeshes.values()) m.end();
    this.sites.end();
    for (const m of this.turretMeshes) m?.end();
    this.aoLayer.commit();
    this.stats.buildings = count;
    if (rebuildLists) {
      this.burnSites = burn;
      this.emitSites = emits;
      this.fireList = fire;
    }
  }

  /** Drehung und Höhenmaß: Treppen schauen zur angrenzenden Mauer und steigen bis zur Mauerkrone */
  private stairOrient(b: ClientBuilding, dir4: [number, number][], bld: Int32Array, mw: number, mh: number): { rot: number; sy: number } {
    let rot = b.r ? Math.PI / 2 : 0;
    let sy = 1;
    if (b.t === BT.Stairs) {
      for (const [dx, dz] of dir4) {
        const nx = b.x + dx;
        const ny = b.y + dz;
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
        const nid = bld[ny * mw + nx];
        const nb = nid ? this.world.buildings.get(nid) : null;
        if (nb && nb.t !== BT.Stairs && BUILDINGS[nb.t].wallTop) {
          rot = Math.atan2(dx, dz);
          sy = BUILDINGS[nb.t].height;
          break;
        }
      }
    }
    return { rot, sy };
  }

  /** Geschütz auf einem Großen Turm: zielt auf den nächsten gegnerischen Bergfried und schwenkt leicht */
  private pushTurret(b: ClientBuilding, y: number, cx: number, cz: number, o: RenderOpts, phase: number): void {
    const kind = b.u === 2 ? 2 : 1;
    let m = this.turretMeshes[kind];
    if (!m) {
      m = new TypeMesh(buildTurretModel(kind === 1 ? 'ballista' : 'mangonel', this.bDetail).merged, this.group, { anim: true, shadow: this.shadows, cap: 16, material: buildingMaterial() }, TEAM);
      this.turretMeshes[kind] = m;
      m.begin();
    }
    let best = 1e9;
    let ang = 0;
    for (const p of this.world.players) {
      if (!p.alive || p.id === b.o || o.teamOfPlayer[p.id] === o.teamOfPlayer[b.o]) continue;
      const dx = p.keepX - cx;
      const dz = p.keepY - cz;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        ang = Math.atan2(dx, dz);
      }
    }
    m.push(cx, y + TURRET_BASE_Y, cz, ang + Math.sin(o.now * 0.35 + b.i) * 0.3, 1, 1, b.o, phase, AF.Static, 0, 1);
  }

  private updateRubble(o: RenderOpts): void {
    const now = o.now;
    this.rubbleStone.begin();
    this.rubbleWood.begin();
    for (let i = this.rubble.length - 1; i >= 0; i--) {
      const r = this.rubble[i];
      const age = now - r.t0;
      if (age > r.life) {
        this.rubble.splice(i, 1);
        continue;
      }
      if (age < 0) continue;
      const rise = ease(age / 0.6);
      const sink = r.life - age < 3 ? ease((r.life - age) / 3) : 1;
      const s = r.s * (0.2 + 0.8 * rise) * sink;
      (r.wood ? this.rubbleWood : this.rubbleStone).push(r.x, r.y - (1 - sink) * 0.2, r.z, r.rot, s, s * (0.5 + 0.5 * rise), 0);
    }
    this.rubbleStone.end();
    this.rubbleWood.end();
  }

  /** Rahmen um das ausgewählte und das überfahrene Gebäude, Kantenlinien beim Überfahren */
  private updateFrames(o: RenderOpts): void {
    const w = this.world;
    const arr = this.frames.instanceMatrix.array as Float32Array;
    const col = (this.frames.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let n = 0;
    const put = (b: ClientBuilding, r: number, g: number, bl: number, thick: number, lift: number): void => {
      const y = tileY(w, b.x, b.y) + lift;
      const x0 = b.x - 0.08;
      const z0 = b.y - 0.08;
      const ww = b.w + 0.16;
      const hh = b.h + 0.16;
      const bars: [number, number, number, number][] = [
        [x0 + ww / 2, z0, ww, thick],
        [x0 + ww / 2, z0 + hh, ww, thick],
        [x0, z0 + hh / 2, thick, hh],
        [x0 + ww, z0 + hh / 2, thick, hh],
      ];
      for (const [bx, bz, sx, sz] of bars) {
        const m = n * 16;
        arr[m] = sx; arr[m + 1] = 0; arr[m + 2] = 0; arr[m + 3] = 0;
        arr[m + 4] = 0; arr[m + 5] = 0.05; arr[m + 6] = 0; arr[m + 7] = 0;
        arr[m + 8] = 0; arr[m + 9] = 0; arr[m + 10] = sz; arr[m + 11] = 0;
        arr[m + 12] = bx; arr[m + 13] = y; arr[m + 14] = bz; arr[m + 15] = 1;
        col[n * 3] = r;
        col[n * 3 + 1] = g;
        col[n * 3 + 2] = bl;
        n++;
      }
    };
    const hov = o.hoverBuilding ? w.buildings.get(o.hoverBuilding) : null;
    if (hov && hov.i !== o.selectedBuilding) put(hov, 1, 0.95, 0.7, 0.07, 0.06);
    const sb = o.selectedBuilding ? w.buildings.get(o.selectedBuilding) : null;
    if (sb) {
      const pulse = 0.8 + 0.2 * Math.sin(o.now * 4);
      put(sb, 1 * pulse, 0.85 * pulse, 0.25, 0.1, 0.07);
    }
    this.frames.count = n;
    this.frames.instanceMatrix.needsUpdate = true;
    (this.frames.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    // Kantenlinien des überfahrenen Gebäudes
    if (hov && !WALL_TYPES.includes(hov.t) && BUILDINGS[hov.t].height >= 0.7) {
      let eg = this.edgeCache.get(hov.t);
      if (!eg) {
        eg = new THREE.EdgesGeometry(buildBuildingModel(BUILDINGS[hov.t], 0).merged, 28);
        this.edgeCache.set(hov.t, eg);
      }
      if (this.hoverLines.geometry !== eg) this.hoverLines.geometry = eg;
      this.hoverLines.visible = true;
      const def = BUILDINGS[hov.t];
      this.hoverLines.position.set(hov.x + hov.w / 2, (def.placement === 'water' ? -0.1 : tileY(w, hov.x, hov.y)) + 0.005, hov.y + hov.h / 2);
      this.hoverLines.rotation.set(0, hov.r ? Math.PI / 2 : 0, 0);
      this.hoverLines.scale.setScalar(1.006);
      this.hoverId = hov.i;
    } else {
      this.hoverLines.visible = false;
      this.hoverId = -1;
    }
  }

  // ------------------------------------------------------------------ Einheiten
  private updateUnits(dt: number, o: RenderOpts): void {
    const w = this.world;
    for (const m of this.unitMeshes) m?.begin();
    for (const m of this.cargoMeshes.values()) m.begin();
    const a = Math.min(1.15, o.alpha);
    const ringArr = this.ringMesh.instanceMatrix.array as Float32Array;
    const ringCol = (this.ringMesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let rings = 0;
    const bgArr = this.hpBg.instanceMatrix.array as Float32Array;
    const fgArr = this.hpFg.instanceMatrix.array as Float32Array;
    const fgCol = (this.hpFg.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let bars = 0;
    const rc = Math.cos(o.camYaw);
    const rs = Math.sin(o.camYaw);
    const blob = this.blob;
    blob.n = 0;
    const useBlob = !this.unitShadows;
    const ptr = o.now;
    const hasCam = !!o.camera;
    const ids = w.ids;
    const types = w.type;
    const owners = w.owner;
    const flagsA = w.flags;
    const auxA = w.aux;
    const hpA = w.hp;
    const faceA = w.face;
    const carryA = w.carry;
    const yS = this.yS;
    const faceS = this.faceS;
    const seen = this.seenId;
    const fk = Math.min(1, dt * 12);
    const yk = Math.min(1, dt * 14);
    let drawn = 0;
    for (let s = 0; s < w.top; s++) {
      const id = ids[s];
      if (id === 0) continue;
      const type = types[s];
      const owner = owners[s];
      const mine = o.teamOfPlayer[owner] === o.myTeam;
      const x = w.prevX[s] + (w.curX[s] - w.prevX[s]) * a;
      const y = w.prevY[s] + (w.curY[s] - w.prevY[s]) * a;
      const fl = flagsA[s];
      if (!mine) {
        if (o.visible && !o.visible(x, y)) continue;
        if (fl & 8) continue; // unsichtbar (Assassine)
      }
      const layer = fl & 1;
      let gy = groundYAt(w, x, y);
      if (layer) {
        const bi = w.bldAt[w.map.idx(Math.min(w.map.w - 1, Math.max(0, Math.floor(x))), Math.min(w.map.h - 1, Math.max(0, Math.floor(y))))];
        const b = bi ? w.buildings.get(bi) : undefined;
        if (b) gy += BUILDINGS[b.t].height;
      }
      // Höhe und Blickrichtung weich nachführen (neue Einheit: sofort setzen)
      let ny: number;
      let face: number;
      if (seen[s] !== id) {
        seen[s] = id;
        ny = gy;
        face = faceA[s];
      } else {
        ny = yS[s] + (gy - yS[s]) * yk;
        face = faceS[s];
        let d = faceA[s] - face;
        if (d > Math.PI) d -= PI2;
        else if (d < -Math.PI) d += PI2;
        face += d * fk;
      }
      yS[s] = ny;
      faceS[s] = face;
      const def = UNITS[type];
      const sc = UNIT_SCALE[type];
      if (hasCam && !this.inView(x, ny + 0.5, y, 1.6 + sc)) continue;
      drawn++;
      let af = 0;
      const ax = auxA[s];
      if (fl & 4) af |= AF.Move;
      if (ax & 1) af |= RANGED[type] ? AF.Shoot : AF.Melee;
      if (ax & 2) af |= AF.Work;
      const tm = this.unitMesh(type);
      const phase = (s * 0.61803) % 1;
      tm.push(x, ny, y, face, sc, sc, owner, phase, af, UNIT_WALK_W[type], af & AF.Work ? 1.1 : UNIT_CYCLE[type]);
      if (useBlob) blob.push(x, ny + 0.025, y, Math.max(0.5, def.radius * 2.3) * sc, 0, 0, 0, SIEGE[type] ? 0.32 : 0.3);
      const sel = o.selected.has(id);
      if (sel && rings < 2048) {
        const r = Math.max(1, def.radius * 2.3) * (1 + 0.035 * Math.sin(ptr * 5 + s));
        const m = rings * 16;
        ringArr[m] = r; ringArr[m + 1] = 0; ringArr[m + 2] = 0; ringArr[m + 3] = 0;
        ringArr[m + 4] = 0; ringArr[m + 5] = 1; ringArr[m + 6] = 0; ringArr[m + 7] = 0;
        ringArr[m + 8] = 0; ringArr[m + 9] = 0; ringArr[m + 10] = r; ringArr[m + 11] = 0;
        ringArr[m + 12] = x; ringArr[m + 13] = ny + 0.035; ringArr[m + 14] = y; ringArr[m + 15] = 1;
        // Spielerfarbe, aufgehellt (weißer Kern bleibt lesbar)
        const t3 = (owner % 8) * 3;
        ringCol[rings * 3] = Math.min(1, TEAM[t3] * 0.6 + 0.4);
        ringCol[rings * 3 + 1] = Math.min(1, TEAM[t3 + 1] * 0.6 + 0.4);
        ringCol[rings * 3 + 2] = Math.min(1, TEAM[t3 + 2] * 0.6 + 0.4);
        rings++;
      }
      const hp = hpA[s];
      if (((hp < 250 && type !== U.Peasant && type !== U.Ox) || sel) && bars < 2048) {
        const wd = 0.55 + def.radius * 0.5;
        const h = 0.085;
        const by = ny + UNIT_TOP[type] * sc + 0.18;
        const m = bars * 16;
        bgArr[m] = rc * (wd + 0.04); bgArr[m + 1] = 0; bgArr[m + 2] = -rs * (wd + 0.04); bgArr[m + 3] = 0;
        bgArr[m + 4] = 0; bgArr[m + 5] = h + 0.04; bgArr[m + 6] = 0; bgArr[m + 7] = 0;
        bgArr[m + 8] = rs; bgArr[m + 9] = 0; bgArr[m + 10] = rc; bgArr[m + 11] = 0;
        bgArr[m + 12] = x; bgArr[m + 13] = by; bgArr[m + 14] = y; bgArr[m + 15] = 1;
        const f = hp / 255;
        fgArr[m] = rc * wd * f; fgArr[m + 1] = 0; fgArr[m + 2] = -rs * wd * f; fgArr[m + 3] = 0;
        fgArr[m + 4] = 0; fgArr[m + 5] = h; fgArr[m + 6] = 0; fgArr[m + 7] = 0;
        fgArr[m + 8] = rs; fgArr[m + 9] = 0; fgArr[m + 10] = rc; fgArr[m + 11] = 0;
        const off = -wd * (1 - f) * 0.5;
        fgArr[m + 12] = x + rc * off; fgArr[m + 13] = by + 0.001; fgArr[m + 14] = y - rs * off; fgArr[m + 15] = 1;
        fgCol[bars * 3] = f < 0.5 ? 1 : 2 - f * 2;
        fgCol[bars * 3 + 1] = f > 0.5 ? 0.85 : f * 1.7;
        fgCol[bars * 3 + 2] = 0.15;
        bars++;
      }
      const carry = carryA[s];
      if (carry > 0) {
        const kind = CARGO_OF_RES[carry - 1];
        if (kind) {
          const cm = this.cargoMesh(kind);
          cm.push(x, ny, y, face, sc, sc, 0, phase, af, UNIT_WALK_W[type], 1.1);
          const c = RES_COLORS[carry - 1] ?? 0xffffff;
          cm.tintLast(srgb(((c >> 16) & 255) / 255), srgb(((c >> 8) & 255) / 255), srgb((c & 255) / 255));
        }
      }
      // brennende Einheit: Flammen
      if (fl & 2 && Math.random() < 0.35) this.fx.effect('fire', x, y, ny + 0.5);
    }
    this.stats.units = drawn;

    // Gebäudebalken: beschädigte (< 100 %) bei Hover/Auswahl, kritische und brennende immer
    for (const b of w.buildings.values()) {
      if (bars >= 2040) break;
      const def = BUILDINGS[b.t];
      if (def.hp <= 0) continue;
      const frac = b.hp / def.hp;
      const selected = b.i === o.selectedBuilding;
      const focus = selected || b.i === o.hoverBuilding;
      if (!(selected || (frac < 0.985 && (focus || frac < 0.65 || (b.f & BF.Burning) !== 0)))) continue;
      const cx = b.x + b.w / 2;
      const cz = b.y + b.h / 2;
      const mine = o.teamOfPlayer[b.o] === o.myTeam;
      if (!mine && o.explored && !o.explored(cx, cz)) continue;
      if (hasCam && !this.inView(cx, tileY(w, b.x, b.y) + def.height, cz, 3)) continue;
      const wd = Math.min(2.4, 0.9 + Math.max(b.w, b.h) * 0.3);
      const h = 0.11;
      const by = tileY(w, b.x, b.y) + def.height + 0.55;
      const m = bars * 16;
      bgArr[m] = rc * (wd + 0.05); bgArr[m + 1] = 0; bgArr[m + 2] = -rs * (wd + 0.05); bgArr[m + 3] = 0;
      bgArr[m + 4] = 0; bgArr[m + 5] = h + 0.05; bgArr[m + 6] = 0; bgArr[m + 7] = 0;
      bgArr[m + 8] = rs; bgArr[m + 9] = 0; bgArr[m + 10] = rc; bgArr[m + 11] = 0;
      bgArr[m + 12] = cx; bgArr[m + 13] = by; bgArr[m + 14] = cz; bgArr[m + 15] = 1;
      const f = Math.max(0.02, Math.min(1, frac));
      fgArr[m] = rc * wd * f; fgArr[m + 1] = 0; fgArr[m + 2] = -rs * wd * f; fgArr[m + 3] = 0;
      fgArr[m + 4] = 0; fgArr[m + 5] = h; fgArr[m + 6] = 0; fgArr[m + 7] = 0;
      fgArr[m + 8] = rs; fgArr[m + 9] = 0; fgArr[m + 10] = rc; fgArr[m + 11] = 0;
      const off = -wd * (1 - f) * 0.5;
      fgArr[m + 12] = cx + rc * off; fgArr[m + 13] = by + 0.001; fgArr[m + 14] = cz - rs * off; fgArr[m + 15] = 1;
      fgCol[bars * 3] = f < 0.5 ? 1 : 2 - f * 2;
      fgCol[bars * 3 + 1] = f > 0.5 ? 0.85 : f * 1.7;
      fgCol[bars * 3 + 2] = 0.15;
      bars++;
    }

    for (const m of this.unitMeshes) m?.end();
    for (const m of this.cargoMeshes.values()) m.end();
    this.ringMesh.count = rings;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    (this.ringMesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.hpBg.count = bars;
    this.hpFg.count = bars;
    this.hpBg.instanceMatrix.needsUpdate = true;
    this.hpFg.instanceMatrix.needsUpdate = true;
    (this.hpFg.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    blob.commit();

    // Flammen (Kegel) auf brennenden Gebäuden
    const farr = this.fires.instanceMatrix.array as Float32Array;
    const fcol = this.fires.instanceColor;
    void fcol;
    let nf = 0;
    for (const f of this.fireList) {
      if (nf >= 1024) break;
      const pulse = 0.8 + Math.sin(this.flameT * 9 + f.x * 3) * 0.25;
      const m = nf * 16;
      farr[m] = f.s * pulse; farr[m + 1] = 0; farr[m + 2] = 0; farr[m + 3] = 0;
      farr[m + 4] = 0; farr[m + 5] = f.s * (1.1 + pulse * 0.4); farr[m + 6] = 0; farr[m + 7] = 0;
      farr[m + 8] = 0; farr[m + 9] = 0; farr[m + 10] = f.s * pulse; farr[m + 11] = 0;
      farr[m + 12] = f.x; farr[m + 13] = f.y; farr[m + 14] = f.z; farr[m + 15] = 1;
      nf++;
    }
    this.fires.count = nf;
    this.fires.instanceMatrix.needsUpdate = true;

    // Leitern
    const larr = this.ladderMesh.instanceMatrix.array as Float32Array;
    let nl = 0;
    const lad = w.ladders;
    for (let k = 0; k + 2 < lad.length && nl < 256; k += 3) {
      const tile = lad[k];
      const tx = tile % w.map.w;
      const ty = (tile / w.map.w) | 0;
      const m = nl * 16;
      const sc = lad[k + 2] ? 2.2 : 1.1;
      larr[m] = 1; larr[m + 1] = 0; larr[m + 2] = 0; larr[m + 3] = 0;
      larr[m + 4] = 0; larr[m + 5] = sc; larr[m + 6] = 0; larr[m + 7] = 0;
      larr[m + 8] = 0; larr[m + 9] = 0; larr[m + 10] = 1; larr[m + 11] = 0;
      larr[m + 12] = tx + 0.5; larr[m + 13] = tileY(w, tx, ty); larr[m + 14] = ty + 0.5; larr[m + 15] = 1;
      nl++;
    }
    this.ladderMesh.count = nl;
    this.ladderMesh.instanceMatrix.needsUpdate = true;
  }

  /** Gefallene Einheiten bleiben kurz liegen (Umkippen im Vertex-Shader), dann verschwinden sie */
  private updateCorpses(o: RenderOpts): void {
    const w = this.world;
    const now = o.now;
    const live = 4.0;
    let n = 0;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      const age = now - c.t0;
      if (age > live) {
        this.corpses.splice(i, 1);
        continue;
      }
      const gy = tileY(w, Math.floor(c.x), Math.floor(c.y));
      const sc = UNIT_SCALE[c.type];
      this.unitMesh(c.type).push(c.x, gy, c.y, c.face, sc, sc, c.owner, c.phase, AF.Dead, UNIT_SIDEWAYS[c.type] ? 1 : 0, age);
      n++;
    }
    this.stats.corpses = n;
    // `end()` der Einheitenmeshes wurde schon in updateUnits aufgerufen: Zähler nachziehen
    for (const m of this.unitMeshes) m?.end();
  }

  private neutral = NEUTRAL;
  private updateBanners(o: RenderOpts): void {
    const m = this.bannerMesh;
    const b = this.world.banners;
    m.begin();
    for (let i = 0; i + 3 < b.length; i += 4) {
      const owner = b[i + 2];
      if (owner >= 0) m.push(b[i], tileY(this.world, Math.floor(b[i]), Math.floor(b[i + 1])), b[i + 1], Math.sin(o.now * 1.5 + i) * 0.4, 1, 1, owner, 0.3, AF.Static, 0, 1);
      else {
        m.push(b[i], tileY(this.world, Math.floor(b[i]), Math.floor(b[i + 1])), b[i + 1], Math.sin(o.now * 1.5 + i) * 0.4, 1, 1, 0, 0.3, AF.Static, 0, 1);
        const k = (m.count - 1) * 3;
        const ic = m.mesh.instanceColor as THREE.InstancedBufferAttribute;
        (ic.array as Float32Array)[k] = this.neutral.r;
        (ic.array as Float32Array)[k + 1] = this.neutral.g;
        (ic.array as Float32Array)[k + 2] = this.neutral.b;
      }
      if (b[i + 3] > 0 && Math.random() < 0.05) this.fx.effect('banner', b[i], b[i + 1], 0.5);
    }
    m.end();
  }

  // ------------------------------------------------------------------ Projektile
  private updateProjectiles(o: RenderOpts): void {
    const p = this.world.proj;
    this.arrows.begin();
    this.bolts.begin();
    this.fireArrows.begin();
    this.stones.begin();
    this.boulders.begin();
    const a = Math.min(1, o.alpha);
    const t = o.now;
    let n = 0;
    const cap = this.q.particleScale < 0.5 ? 0.15 : 0.5;
    for (let i = 0; i + 7 < p.length; i += 8) {
      const kind = p[i];
      const x = p[i + 2] + p[i + 5] * a;
      const y = p[i + 3] + p[i + 6] * a;
      const z = p[i + 4] + p[i + 7] * a;
      n++;
      if (kind === PROJ.Stone || kind === PROJ.Boulder) {
        const big = kind === PROJ.Boulder;
        const sc = big ? 1.5 : 0.7;
        const ang = t * (big ? 3 : 7) + i * 0.37;
        const bt = ang * 0.7;
        const ca = Math.cos(ang), sa = Math.sin(ang), cb = Math.cos(bt), sb = Math.sin(bt);
        const m = big ? this.boulders : this.stones;
        pushRot(m, x, z, y, ca * sc, 0, -sa * sc, sa * sb * sc, cb * sc, ca * sb * sc, sa * cb * sc, -sb * sc, ca * cb * sc);
        if (big && Math.random() < cap) this.fx.puff(x, z, y, 0, 0.1, 0, 0.8, 0.25, 0.7, [0.3, 0.28, 0.26], 0.45, 0, 1);
      } else {
        let vx = p[i + 5];
        let vy = p[i + 7];
        let vz = p[i + 6];
        const l = Math.hypot(vx, vy, vz);
        if (l < 1e-5) {
          vx = 0;
          vy = 0;
          vz = 1;
        } else {
          vx /= l;
          vy /= l;
          vz /= l;
        }
        // Basis: z-Achse = Flugrichtung
        let rx = vz;
        let ry = 0;
        let rz = -vx;
        let rl = Math.hypot(rx, rz);
        if (rl < 1e-4) {
          rx = 1;
          rz = 0;
          rl = 1;
        }
        rx /= rl;
        rz /= rl;
        const ux = vy * rz - vz * ry;
        const uy = vz * rx - vx * rz;
        const uz = vx * ry - vy * rx;
        const m = kind === PROJ.Bolt ? this.bolts : kind === PROJ.FireArrow ? this.fireArrows : this.arrows;
        pushRot(m, x, z, y, rx, ry, rz, ux, uy, uz, vx, vy, vz);
        if (kind === PROJ.FireArrow && Math.random() < cap) this.fx.effect('fire', x, y, z);
      }
    }
    this.stats.projectiles = n;
    this.arrows.end();
    this.bolts.end();
    this.fireArrows.end();
    this.stones.end();
    this.boulders.end();
  }

  // ------------------------------------------------------------------ Dauereffekte
  private updateEmitters(dt: number, o: RenderOpts): void {
    const fx = this.fx;
    const hasCam = !!o.camera;
    for (const b of this.burnSites) {
      const cx = b.x + b.w / 2;
      const cz = b.z + b.h / 2;
      if (hasCam && !this.inView(cx, b.y + b.top, cz, 4)) continue;
      const area = b.w * b.h;
      let nFlames = dt * (6 + area * 1.6);
      while (nFlames > 0) {
        if (nFlames >= 1 || Math.random() < nFlames) fx.flame(b.x + 0.3 + Math.random() * (b.w - 0.6), b.y + b.top * (0.35 + Math.random() * 0.6), b.z + 0.3 + Math.random() * (b.h - 0.6), 0.4 + b.top * 0.12);
        nFlames -= 1;
      }
      if (this.q.workSmoke) {
        let nSmoke = dt * (2.2 + area * 0.45);
        while (nSmoke > 0) {
          if (nSmoke >= 1 || Math.random() < nSmoke) fx.smokeUp(cx + (Math.random() - 0.5) * b.w * 0.6, b.y + b.top + 0.3, cz + (Math.random() - 0.5) * b.h * 0.6, true, 0.45 + b.top * 0.1, 3.8);
          nSmoke -= 1;
        }
        if (Math.random() < dt * 4) fx.ember(cx + (Math.random() - 0.5) * b.w, b.y + b.top, cz + (Math.random() - 0.5) * b.h);
      }
    }
    for (const e of this.emitSites) {
      if (hasCam && !this.inView(e.x, e.y, e.z, 3)) continue;
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        switch (e.kind) {
          case 'smoke':
            fx.smokeUp(e.x, e.y, e.z, false, 0.26, 2.8);
            break;
          case 'smokeDark':
            fx.smokeUp(e.x, e.y, e.z, true, 0.3, 2.8);
            break;
          case 'steam':
            fx.puff(e.x + (Math.random() - 0.5) * 0.1, e.y, e.z + (Math.random() - 0.5) * 0.1, 0, 0.6 + Math.random() * 0.4, 0, 1.6, 0.15, 0.55, [0.95, 0.95, 0.92], 0.45, -0.05, 0.3);
            break;
          case 'flame':
            fx.flame(e.x, e.y, e.z, 0.26);
            break;
          case 'sparks':
            fx.ember(e.x, e.y - 0.8, e.z);
            break;
          case 'anvil':
            fx.ember(e.x, e.y, e.z);
            if (Math.random() < 0.5) fx.ember(e.x + (Math.random() - 0.5) * 0.1, e.y, e.z);
            break;
          case 'dust':
            fx.puff(e.x + (Math.random() - 0.5) * 0.3, e.y, e.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3, 1.0 + Math.random() * 0.6, 0.12, 0.5, [0.78, 0.7, 0.55], 0.32, -0.05, 0.9);
            break;
          case 'flour':
            fx.puff(e.x + (Math.random() - 0.5) * 0.3, e.y, e.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, 0.15 + Math.random() * 0.15, 0.1 + Math.random() * 0.2, 1.2, 0.1, 0.4, [0.94, 0.92, 0.86], 0.4, -0.04, 0.9);
            break;
          case 'chips':
            fx.chunk(e.x, e.y, e.z, (Math.random() - 0.5) * 1.1, 1 + Math.random() * 0.9, 0.2 + Math.random() * 0.8, 0.5, 0.04, [0.74, 0.56, 0.32], 9);
            break;
        }
      }
    }
  }

  /** Meldet das Ende der Frame-Verarbeitung von Welt-Ereignissen */
  clearEvents(): void {
    this.world.events.length = 0;
    this.world.deaths.length = 0;
    this.world.removedBuildings.length = 0;
  }
}

/** sRGB-Wert (0..1) in linear umrechnen, passend zu THREE.Color-Handhabung der Instanzfarben */
function srgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function pushRot(m: TypeMesh, x: number, y: number, z: number, rx: number, ry: number, rz: number, ux: number, uy: number, uz: number, fx: number, fy: number, fz: number): void {
  // schreibt eine Instanz mit beliebiger Basis (rechts, oben, vorwärts)
  m.push(x, y, z, 0, 1, 1, 0);
  const arr = m.mesh.instanceMatrix.array as Float32Array;
  const o = (m.count - 1) * 16;
  arr[o] = rx; arr[o + 1] = ry; arr[o + 2] = rz;
  arr[o + 4] = ux; arr[o + 5] = uy; arr[o + 6] = uz;
  arr[o + 8] = fx; arr[o + 9] = fy; arr[o + 10] = fz;
}

function mergeGeos(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const pa = a.getAttribute('position');
  const pb = b.getAttribute('position');
  const pos = new Float32Array((pa.count + pb.count) * 3);
  pos.set(pa.array as Float32Array, 0);
  pos.set(pb.array as Float32Array, pa.count * 3);
  const ia = a.getIndex()!;
  const ib = b.getIndex()!;
  const idx: number[] = [];
  for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i));
  for (let i = 0; i < ib.count; i++) idx.push(ib.getX(i) + pa.count);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

void SLOT_MASK;
void flameGeo;
