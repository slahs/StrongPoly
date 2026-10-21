import * as THREE from 'three';
import { BT, BUILDINGS, BUILDING_TYPES, BuildingDef, ClientBuilding, ClientWorld } from '@strongpoly/shared';
import { buildTicksOf, NO_SCAFFOLD } from './build_config';
import { constructionDepthMaterial, constructionMaterial } from './building_materials';
import { constructionFx, finishFx, SiteRect, wallFx } from './building_fx';
import { buildProgress, constructionParams, wallDelayTicks, wallOrder } from './construction';
import type { FxSystem } from './fx';
import { TypeMesh } from './instanced';
import { AF } from './materials';
import { buildBuildingModel, buildWallModel, ModelDetail, WALL_TYPES } from './models_buildings';
import { groundworkGeo, materialPileGeo, SCAFFOLD_TIER, scaffoldTierGeo } from './models_construction';
import { assetRegistry } from './assets/registry';
import { AssetTypeMesh } from './assets/asset_mesh';
import { lodCfgOf } from './assets/lod';
import type { AssetModel } from './assets/model';
import type { QualityCfg } from './quality';

const ARM_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/**
 * Darstellung der Baustellen (4C). Rein visuell: Die Sim setzt Gebäude sofort; hier wird aus dem Platzierungs-Tick
 * (`ClientBuilding.n`) und der Weltzeit der Fortschritt abgeleitet. Fundament → Baumaterial und Gerüst → Teile
 * wachsen nach Zeitfenstern von unten nach oben (Höhenmaske im Shader, keine Skalierung) → Gerüst fällt → Abschlusseffekt.
 * Mauerlinien laufen als zusammenhängender Zug entlang (Verzögerung je Stück nach Breitensuche).
 */
export class BuildSites {
  private conMeshes: (TypeMesh | null)[] = new Array(BUILDING_TYPES).fill(null);
  private conWalls = new Map<string, TypeMesh>();
  private ground: TypeMesh;
  private scaffold: TypeMesh;
  private pileWood: TypeMesh;
  private pileStone: TypeMesh;
  private tops: number[] = [];
  private wallPlan = new Map<number, { idx: number; count: number }>();
  private detail: ModelDetail = 2;
  private shadows = true;
  scale = 1;
  /** GLB-Assets im Bau (Variante 'clip': gleiche Höhenmaske wie die prozeduralen Modelle) */
  private assetCon = new Map<string, AssetTypeMesh>();
  private assetVer = -1;
  private q: QualityCfg | null = null;
  /** Kameraposition für die LOD-Wahl der GLB-Baustellen (setzt der EntityRenderer je Durchgang) */
  camera: THREE.Vector3 | null = null;

  constructor(
    private parent: THREE.Object3D,
    private fx: FxSystem,
    private team: Float32Array,
  ) {
    this.ground = new TypeMesh(groundworkGeo(), parent, { anim: false, shadow: false, cap: 64 }, team);
    this.scaffold = new TypeMesh(scaffoldTierGeo(), parent, { anim: false, shadow: true, cap: 256 }, team);
    this.pileWood = new TypeMesh(materialPileGeo(true), parent, { anim: false, shadow: true, cap: 64 }, team);
    this.pileStone = new TypeMesh(materialPileGeo(false), parent, { anim: false, shadow: true, cap: 64 }, team);
  }

  /** Grafikstufe: Schatten, Partikelfaktor, Modelldetail (bei Wechsel werden Baustellenmeshes neu aufgebaut) */
  setQuality(shadows: boolean, particleScale: number, detail: ModelDetail, q?: QualityCfg): void {
    this.shadows = shadows;
    this.scale = particleScale;
    if (q) this.q = q;
    for (const m of this.assetCon.values()) {
      m.setShadows(shadows);
      if (this.q) m.setLodCfg(lodCfgOf(this.q));
    }
    this.scaffold.setShadows(shadows);
    this.pileWood.setShadows(shadows);
    this.pileStone.setShadows(shadows);
    for (const m of this.conMeshes) m?.setShadows(shadows);
    for (const m of this.conWalls.values()) m.setShadows(shadows);
    if (detail !== this.detail) {
      this.detail = detail;
      for (const m of this.conMeshes) m?.dispose();
      for (const m of this.conWalls.values()) m.dispose();
      this.conMeshes.fill(null);
      this.conWalls.clear();
    }
  }

  begin(): void {
    if (assetRegistry.version !== this.assetVer) {
      this.assetVer = assetRegistry.version;
      for (const m of this.assetCon.values()) m.dispose();
      this.assetCon.clear();
    }
    for (const m of this.assetCon.values()) m.begin();
    for (const m of this.conMeshes) m?.begin();
    for (const m of this.conWalls.values()) m.begin();
    this.ground.begin();
    this.scaffold.begin();
    this.pileWood.begin();
    this.pileStone.begin();
  }

  end(): void {
    for (const m of this.assetCon.values()) m.end(this.camera);
    for (const m of this.conMeshes) m?.end();
    for (const m of this.conWalls.values()) m.end();
    this.ground.end();
    this.scaffold.end();
    this.pileWood.end();
    this.pileStone.end();
  }

  /** Neue Karte/Vollzustand: Zwischenspeicher leeren */
  reset(): void {
    this.wallPlan.clear();
  }

  forget(id: number): void {
    this.wallPlan.delete(id);
  }

  private conMesh(t: number): TypeMesh {
    let m = this.conMeshes[t];
    if (!m) {
      const g = buildBuildingModel(BUILDINGS[t], this.detail, true).merged;
      this.tops[t] = g.boundingBox?.max.y ?? BUILDINGS[t].height;
      m = new TypeMesh(g, this.parent, { anim: true, shadow: this.shadows, cap: 16, material: constructionMaterial(), depthMaterial: constructionDepthMaterial() }, this.team);
      this.conMeshes[t] = m;
    }
    return m;
  }

  /** Baustellen-Mesh eines GLB-Assets */
  private assetMesh(key: string, model: AssetModel): AssetTypeMesh {
    let m = this.assetCon.get(key);
    if (!m || m.model !== model) {
      m?.dispose();
      m = new AssetTypeMesh(model, this.parent, assetRegistry.materials, this.team, 'clip', lodCfgOf(this.q ?? ({ assetLod0: 30, assetLod1: 72, assetLods: 3 } as QualityCfg)), this.shadows, 8);
      this.assetCon.set(key, m);
      m.begin();
    }
    return m;
  }

  /** Höhe der Oberkante (Gerüst, Abschlusseffekt): GLB-Asset oder prozedurales Modell */
  private topOf(t: number, def: BuildingDef): number {
    const am = assetRegistry.forBuilding(t);
    if (am) return am.height;
    return this.tops[t] ?? def.height;
  }

  private conWall(t: number, kind: 'arm' | 'post' | 'stub'): TypeMesh {
    const key = `${t}:${kind}`;
    let m = this.conWalls.get(key);
    if (!m) {
      const g = buildWallModel(t, BUILDINGS[t].height, kind, this.detail, true).merged;
      m = new TypeMesh(g, this.parent, { anim: true, shadow: this.shadows, cap: 128, material: constructionMaterial(), depthMaterial: constructionDepthMaterial() }, this.team);
      this.conWalls.set(key, m);
    }
    return m;
  }

  /** Mauergruppe (gleicher Platzierungs-Tick, zusammenhängend) einmal bestimmen und in Ausbreitungsreihenfolge ordnen */
  private planWalls(world: ClientWorld, b: ClientBuilding): { idx: number; count: number } {
    const have = this.wallPlan.get(b.i);
    if (have) return have;
    const mw = world.map.w;
    const group: ClientBuilding[] = [];
    const seen = new Set<number>([b.i]);
    const stack: ClientBuilding[] = [b];
    while (stack.length) {
      const c = stack.pop()!;
      group.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= mw || ny >= world.map.h) continue;
        const id = world.bldAt[ny * mw + nx];
        if (!id || seen.has(id)) continue;
        const nb = world.buildings.get(id);
        if (nb && nb.n === b.n && WALL_TYPES.includes(nb.t)) {
          seen.add(id);
          stack.push(nb);
        }
      }
    }
    const order = wallOrder(group.map((g) => ({ id: g.i, x: g.x, y: g.y })));
    for (const g of group) this.wallPlan.set(g.i, { idx: order.get(g.i) ?? 0, count: group.length });
    return this.wallPlan.get(b.i)!;
  }

  /** Baufortschritt 0..1 eines Gebäudes (1 = fertig). Mauerstücke einer gezogenen Linie starten gestaffelt. */
  progress(world: ClientWorld, b: ClientBuilding, alpha: number): number {
    if (b.n <= 0) return 1;
    const dur = buildTicksOf(BUILDINGS[b.t]);
    if (dur <= 0) return 1;
    if (!WALL_TYPES.includes(b.t)) return buildProgress(world.tick, b.n, alpha, dur);
    // zusammenhängender Mauerzug: nur gruppieren, solange die Baustelle jung ist
    const young = world.tick - b.n < dur + 60;
    if (!young) return 1;
    const plan = this.planWalls(world, b);
    return buildProgress(world.tick, b.n, alpha, dur, wallDelayTicks(plan.idx, plan.count));
  }

  private rect(b: ClientBuilding, def: BuildingDef, y: number, top: number): SiteRect {
    return { x: b.x, z: b.y, w: b.w, h: b.h, y, top, wood: def.wood };
  }

  /** Baustelle eines (nicht linienförmigen) Gebäudes zeichnen */
  draw(b: ClientBuilding, def: BuildingDef, y: number, rot: number, sy: number, prog: number, phase: number, dt: number, visible: boolean): void {
    const cp = constructionParams(prog);
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    const am = assetRegistry.forBuilding(b.t, b.i);
    const top = (am ? am.height : (this.tops[b.t] ?? def.height)) * sy;
    if (cp.ground > 0.01) {
      const sink = (1 - cp.ground) * 0.09;
      for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) this.ground.push(b.x + xx + 0.5, y + 0.004 - sink, b.y + yy + 0.5, 0, 1, 1, b.o);
    }
    if (am) this.assetMesh(`b:${b.t}:${am.id}`, am).push(b.i, cx, y, cz, rot, 1, sy, b.o, phase, AF.Static, cp.raise, 0);
    else this.conMesh(b.t).push(cx, y, cz, rot, 1, sy, b.o, phase, AF.Static, cp.raise, 0);
    const scafTop = am?.def.scaffold ? am.def.scaffold * sy : top;
    if (cp.scaffold > 0.02 && top >= 1.5 && def.cat !== 'farm' && !NO_SCAFFOLD.has(b.t)) this.pushScaffold(b, y, (scafTop + 0.35) * cp.scaffold);
    if (cp.materials > 0.02 && b.w * b.h >= 4 && def.cat !== 'farm') this.pushPiles(b, def, y, cp.materials);
    if (visible) constructionFx(this.fx, this.rect(b, def, y, top), cp, dt, this.scale);
  }

  /** Mauerstück im Bau: Pfosten und Arme zu den Nachbarn wachsen von unten nach oben */
  drawWall(b: ClientBuilding, def: BuildingDef, y: number, mask: number, prog: number, phase: number, dt: number, visible: boolean): void {
    const cp = constructionParams(prog);
    const cx = b.x + 0.5;
    const cz = b.y + 0.5;
    const piece = mask === 0 ? 'stub' : 'post';
    const ap = assetRegistry.forWall(b.t, piece);
    if (ap) this.assetMesh(`w:${b.t}:${piece}`, ap).push(b.i * 8, cx, y, cz, 0, 1, 1, b.o, phase, AF.Static, cp.raise, 0);
    else this.conWall(b.t, piece).push(cx, y, cz, 0, 1, 1, b.o, phase, AF.Static, cp.raise, 0);
    const aa = assetRegistry.forWall(b.t, 'arm');
    for (let k = 0; k < 4; k++) {
      if (!(mask & (1 << k))) continue;
      if (aa) this.assetMesh(`w:${b.t}:arm`, aa).push(b.i * 8 + 1 + k, cx, y, cz, ARM_ROT[k], 1, 1, b.o, phase, AF.Static, cp.raise, 0);
      else this.conWall(b.t, 'arm').push(cx, y, cz, ARM_ROT[k], 1, 1, b.o, phase, AF.Static, cp.raise, 0);
    }
    if (visible && prog > 0.02) wallFx(this.fx, cx, y, cz, def.wood, dt, this.scale);
  }

  /** Fertigstellung: Abschlusseffekt */
  finish(b: ClientBuilding, def: BuildingDef, y: number): void {
    if (WALL_TYPES.includes(b.t)) return;
    finishFx(this.fx, this.rect(b, def, y, this.topOf(b.t, def) || 1), this.scale);
  }

  /** Bau abgebrochen/rückgängig gemacht (ohne Zerstörung): nur eine kleine Staubwolke */
  abort(b: { x: number; y: number; w: number; h: number }, y: number): void {
    this.fx.dustRing(b.x + b.w / 2, y, b.y + b.h / 2, 5 + b.w * b.h * 0.5, Math.max(b.w, b.h) * 0.6, 0.8, [0.82, 0.72, 0.52], 0.45, 1.5);
  }

  private pushScaffold(b: ClientBuilding, y: number, top: number): void {
    const sc = this.scaffold;
    const x0 = b.x;
    const z0 = b.y;
    for (let k = 0; k * SCAFFOLD_TIER < top; k++) {
      const f = Math.min(1, (top - k * SCAFFOLD_TIER) / SCAFFOLD_TIER);
      if (f < 0.04) continue;
      const yk = y + k * SCAFFOLD_TIER;
      for (let i = 0; i < b.w; i++) sc.push(x0 + i, yk, z0, 0, 1, f, 0);
      for (let j = 0; j < b.h; j++) sc.push(x0 + b.w, yk, z0 + j, -Math.PI / 2, 1, f, 0);
      for (let i = 0; i < b.w; i++) sc.push(x0 + b.w - i, yk, z0 + b.h, Math.PI, 1, f, 0);
      for (let j = 0; j < b.h; j++) sc.push(x0, yk, z0 + b.h - j, Math.PI / 2, 1, f, 0);
    }
  }

  private pushPiles(b: ClientBuilding, def: BuildingDef, y: number, amount: number): void {
    const mesh = def.wood ? this.pileWood : this.pileStone;
    const h = (b.i * 2654435761) >>> 0;
    const a = 0.25 + 0.75 * amount;
    // zwei Haufen in den vorderen Ecken innerhalb der Grundfläche (verschwinden beim Aufbau)
    mesh.push(b.x + 0.45, y + 0.02, b.y + b.h - 0.45, ((h >>> 3) % 628) / 100, a, a, 0);
    if (b.w * b.h >= 6) mesh.push(b.x + b.w - 0.45, y + 0.02, b.y + b.h - 0.5, ((h >>> 9) % 628) / 100, a, a, 0);
  }

  dispose(): void {
    for (const m of this.assetCon.values()) m.dispose();
    this.assetCon.clear();
    for (const m of this.conMeshes) m?.dispose();
    for (const m of this.conWalls.values()) m.dispose();
  }
}

void BT;
