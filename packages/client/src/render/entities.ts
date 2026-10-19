import * as THREE from 'three';
import { BUILDINGS, BT, ClientWorld, HEIGHT_STEP, PAL, PLAYER_COLORS, PROJ, S, U, UNITS, UNIT_TYPES, BUILDING_TYPES, BF } from '@strongpoly/shared';
import { ModelBuilder, ModelGeos } from './builder';
import { FxSystem } from './fx';
import { buildBuildingModel } from './models_buildings';
import { buildUnitModel } from './models_units';
import { groundYAt, RES_COLORS, tileY } from './util';

const matBody = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const matAccent = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const teamColors = PLAYER_COLORS.map((c) => new THREE.Color(c));

class TypeMesh {
  body: THREE.InstancedMesh;
  accent: THREE.InstancedMesh | null = null;
  cap: number;
  count = 0;
  constructor(
    private geos: ModelGeos,
    private parent: THREE.Group,
    cap: number,
    private shadows: boolean,
  ) {
    this.cap = cap;
    this.body = this.make(geos.body, matBody, false);
    if (geos.accent) this.accent = this.make(geos.accent, matAccent, true);
  }
  private make(geo: THREE.BufferGeometry, mat: THREE.Material, color: boolean): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, this.cap);
    if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    m.frustumCulled = false;
    m.castShadow = this.shadows;
    m.receiveShadow = false;
    m.count = 0;
    this.parent.add(m);
    return m;
  }
  ensure(n: number): void {
    if (n <= this.cap) return;
    let cap = this.cap;
    while (cap < n) cap *= 2;
    this.parent.remove(this.body);
    this.body.dispose();
    this.cap = cap;
    this.body = this.make(this.geos.body, matBody, false);
    if (this.accent) {
      this.parent.remove(this.accent);
      this.accent.dispose();
      this.accent = this.make(this.geos.accent!, matAccent, true);
    }
  }
  setShadows(on: boolean): void {
    this.shadows = on;
    this.body.castShadow = on;
    if (this.accent) this.accent.castShadow = on;
  }
  begin(): void {
    this.count = 0;
  }
  /** Schreibt Matrix (Position, Y-Rotation, Skalierung) und Teamfarbe */
  push(x: number, y: number, z: number, rot: number, scale: number, team: THREE.Color): void {
    if (this.count >= this.cap) this.ensure(this.cap * 2);
    const c = Math.cos(rot) * scale;
    const s = Math.sin(rot) * scale;
    const o = this.count * 16;
    const a = this.body.instanceMatrix.array as Float32Array;
    a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = scale; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    if (this.accent) {
      (this.accent.instanceMatrix.array as Float32Array).set(a.subarray(o, o + 16), o);
      const ca = (this.accent.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
      ca[this.count * 3] = team.r;
      ca[this.count * 3 + 1] = team.g;
      ca[this.count * 3 + 2] = team.b;
    }
    this.count++;
  }
  end(): void {
    this.body.count = this.count;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.accent) {
      this.accent.count = this.count;
      this.accent.instanceMatrix.needsUpdate = true;
      (this.accent.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }
}

export interface RenderOpts {
  alpha: number;
  now: number;
  camYaw: number;
  selected: Set<number>;
  selectedBuilding: number;
  hoverTile: { x: number; y: number } | null;
  /** Sichtbarkeitsprüfung (Fog of War) */
  visible: ((x: number, y: number) => boolean) | null;
  me: number;
  myTeam: number;
  teamOfPlayer: number[];
}

/** Zeichnet Einheiten, Gebäude, Projektile und Effekte aus dem ClientWorld-Zustand (nur lesend). */
export class EntityRenderer {
  readonly group = new THREE.Group();
  readonly fx = new FxSystem();
  private unitMeshes: (TypeMesh | null)[] = new Array(UNIT_TYPES).fill(null);
  private bldMeshes: (TypeMesh | null)[] = new Array(BUILDING_TYPES).fill(null);
  private ringMesh: THREE.InstancedMesh;
  private hpBg: THREE.InstancedMesh;
  private hpFg: THREE.InstancedMesh;
  private cargo: THREE.InstancedMesh;
  private arrows: THREE.InstancedMesh;
  private stones: THREE.InstancedMesh;
  private fires: THREE.InstancedMesh;
  private ladderMesh: THREE.InstancedMesh;
  private selBox: THREE.Mesh;
  private bannerMesh: TypeMesh | null = null;
  private yS: Float32Array = new Float32Array(8192);
  private shadows = true;
  private flameT = 0;
  private world: ClientWorld;
  private fxClock = 0;

  constructor(world: ClientWorld) {
    this.world = world;
    this.group.name = 'entities';
    this.group.add(this.fx.mesh);
    const ringGeo = new THREE.RingGeometry(0.34, 0.46, 10);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false }), 2048);
    this.ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2048 * 3), 3);
    this.ringMesh.count = 0;
    this.ringMesh.frustumCulled = false;
    this.group.add(this.ringMesh);

    const barGeo = new THREE.PlaneGeometry(1, 1);
    this.hpBg = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x24211e, depthTest: false, transparent: true }), 1536);
    this.hpFg = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }), 1536);
    this.hpFg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1536 * 3), 3);
    for (const m of [this.hpBg, this.hpFg]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 10;
      this.group.add(m);
    }

    const cargoGeo = new ModelBuilder().box(0.16, 0.16, 0.16, 0, 0, 0, 0xffffff).build().body;
    this.cargo = new THREE.InstancedMesh(cargoGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 4096);
    this.cargo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(4096 * 3), 3);
    this.cargo.count = 0;
    this.cargo.frustumCulled = false;
    this.group.add(this.cargo);

    const arrowGeo = new ModelBuilder().box(0.04, 0.04, 0.55, 0, 0, 0, PAL.woodDark).box(0.05, 0.05, 0.12, 0, 0, 0.3, PAL.stone).build().body;
    this.arrows = new THREE.InstancedMesh(arrowGeo, matBody, 2048);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.group.add(this.arrows);
    const stoneGeo = new ModelBuilder().box(0.4, 0.4, 0.4, 0, -0.2, 0, PAL.stoneDark).build().body;
    this.stones = new THREE.InstancedMesh(stoneGeo, matBody, 512);
    this.stones.count = 0;
    this.stones.frustumCulled = false;
    this.stones.castShadow = true;
    this.group.add(this.stones);

    const fireGeo = new ModelBuilder().cone(0.22, 0.6, 4, 0, 0, 0, PAL.gold).cone(0.14, 0.45, 4, 0, 0, 0, PAL.roof).build().body;
    this.fires = new THREE.InstancedMesh(fireGeo, matBody, 1024);
    this.fires.count = 0;
    this.fires.frustumCulled = false;
    this.group.add(this.fires);

    const ladGeo = new ModelBuilder()
      .box(0.06, 1.8, 0.06, -0.2, 0, 0, PAL.wood)
      .box(0.06, 1.8, 0.06, 0.2, 0, 0, PAL.wood)
      .box(0.4, 0.05, 0.05, 0, 0.4, 0, PAL.woodDark)
      .box(0.4, 0.05, 0.05, 0, 0.9, 0, PAL.woodDark)
      .box(0.4, 0.05, 0.05, 0, 1.4, 0, PAL.woodDark)
      .build().body;
    this.ladderMesh = new THREE.InstancedMesh(ladGeo, matBody, 256);
    this.ladderMesh.count = 0;
    this.ladderMesh.frustumCulled = false;
    this.group.add(this.ladderMesh);

    const poleModel = new ModelBuilder()
      .cyl(0.05, 0.07, 2.6, 5, 0, 0, 0, PAL.woodDark)
      .box(0.7, 0.45, 0.04, 0.38, 2.05, 0, PAL.white, true)
      .pyramid(0.08, 0.2, 0, 2.6, 0, PAL.gold)
      .cyl(0.35, 0.4, 0.15, 6, 0, 0, 0, PAL.stoneDark)
      .build();
    this.bannerMesh = new TypeMesh(poleModel, this.group, 8, true);
    this.selBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.06, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.selBox.visible = false;
    this.group.add(this.selBox);
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const m of this.unitMeshes) m?.setShadows(on);
    for (const m of this.bldMeshes) m?.setShadows(on);
  }

  private unitMesh(t: number): TypeMesh {
    let m = this.unitMeshes[t];
    if (!m) {
      m = new TypeMesh(buildUnitModel(t), this.group, t === U.Peasant ? 512 : 128, this.shadows);
      this.unitMeshes[t] = m;
    }
    return m;
  }

  private bldMesh(t: number): TypeMesh {
    let m = this.bldMeshes[t];
    if (!m) {
      m = new TypeMesh(buildBuildingModel(BUILDINGS[t]), this.group, 64, this.shadows);
      this.bldMeshes[t] = m;
    }
    return m;
  }

  /** Ruft gesammelte Sim-Events ab und erzeugt Effekte */
  consumeEvents(): void {
    const w = this.world;
    for (const e of w.events) {
      if (e.e === 'fx') this.fx.effect(e.k, e.x, e.y, (e.z ?? 0.5) + tileY(w, Math.floor(e.x), Math.floor(e.y)));
    }
    for (const d of w.deaths) {
      const col = d.type === U.Peasant ? PAL.thatch : PAL.roof;
      this.fx.spawn(d.x, tileY(w, Math.floor(d.x), Math.floor(d.y)) + 0.4, d.y, 6, col, 1.2, 2.2, 0.1, 0.7);
    }
  }

  update(dt: number, o: RenderOpts): void {
    const w = this.world;
    this.flameT += dt;
    this.fxClock += dt;
    this.updateBuildings(o);
    this.updateUnits(dt, o);
    this.updateProjectiles(o);
    this.updateBanners(o);
    this.fx.update(dt);
  }

  private bldMatrixBuilt = false;
  private lastBldRev = -1;
  private bldRev = 0;

  private updateBuildings(o: RenderOpts): void {
    const w = this.world;
    // Gebäude jeden Frame neu schreiben, wenn sich etwas geändert hat; sonst nur Zähler lassen
    if (w.buildingsDirty || !this.bldMatrixBuilt) {
      this.bldMatrixBuilt = true;
      w.buildingsDirty = false;
      for (const m of this.bldMeshes) m?.begin();
      for (const b of w.buildings.values()) {
        const def = BUILDINGS[b.t];
        // Fallen sind für Gegner unsichtbar
        if ((b.t === BT.Pit || b.t === BT.KillingPit) && o.teamOfPlayer[b.o] !== o.myTeam) continue;
        const m = this.bldMesh(b.t);
        const cx = b.x + b.w / 2;
        const cz = b.y + b.h / 2;
        let y = tileY(w, b.x, b.y);
        if (def.placement === 'water') y = -0.1;
        m.push(cx, y, cz, b.r ? Math.PI / 2 : 0, 1, teamColors[b.o % 8]);
      }
      for (const m of this.bldMeshes) m?.end();
      this.rebuildFires();
    }
    // Auswahlkasten
    const sb = o.selectedBuilding ? w.buildings.get(o.selectedBuilding) : null;
    if (sb) {
      this.selBox.visible = true;
      this.selBox.position.set(sb.x + sb.w / 2, tileY(w, sb.x, sb.y) + 0.06, sb.y + sb.h / 2);
      this.selBox.scale.set(sb.w + 0.2, 1, sb.h + 0.2);
    } else this.selBox.visible = false;
  }

  private fireList: { x: number; y: number; z: number; s: number }[] = [];
  private rebuildFires(): void {
    const w = this.world;
    this.fireList = [];
    for (const b of w.buildings.values()) {
      if (!(b.f & BF.Burning)) continue;
      const def = BUILDINGS[b.t];
      const n = Math.max(1, Math.min(6, Math.round((b.w * b.h) / 3)));
      for (let k = 0; k < n; k++) {
        this.fireList.push({
          x: b.x + 0.5 + ((k * 7919) % 97) / 97 * (b.w - 1),
          z: b.y + 0.5 + ((k * 104729) % 89) / 89 * (b.h - 1),
          y: tileY(w, b.x, b.y) + def.height * 0.6,
          s: 1 + def.height * 0.25,
        });
      }
    }
  }

  private updateUnits(dt: number, o: RenderOpts): void {
    const w = this.world;
    for (const m of this.unitMeshes) m?.begin();
    const a = Math.min(1.15, o.alpha);
    const ringArr = this.ringMesh.instanceMatrix.array as Float32Array;
    const ringCol = (this.ringMesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let rings = 0;
    const bgArr = this.hpBg.instanceMatrix.array as Float32Array;
    const fgArr = this.hpFg.instanceMatrix.array as Float32Array;
    const fgCol = (this.hpFg.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let bars = 0;
    const cargoArr = this.cargo.instanceMatrix.array as Float32Array;
    const cargoCol = (this.cargo.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let cargo = 0;
    const cy = Math.cos(-o.camYaw);
    const sy = Math.sin(-o.camYaw);
    const t = o.now;
    for (let s = 0; s < w.top; s++) {
      const id = w.ids[s];
      if (id === 0) continue;
      const type = w.type[s];
      const owner = w.owner[s];
      const mine = o.teamOfPlayer[owner] === o.myTeam;
      let x = w.prevX[s] + (w.curX[s] - w.prevX[s]) * a;
      let y = w.prevY[s] + (w.curY[s] - w.prevY[s]) * a;
      if (!mine) {
        if (w.flags[s] & 8 && w.flags[s] & 4) { /* unsichtbar (Assassine) */ }
        if (o.visible && !o.visible(x, y)) continue;
        if (w.flags[s] & 8) continue; // unsichtbar
      }
      const layer = w.flags[s] & 1;
      let gy = groundYAt(w, x, y);
      if (layer) {
        const b = w.buildings.get(w.bldAt[w.map.idx(Math.min(w.map.w - 1, Math.max(0, Math.floor(x))), Math.min(w.map.h - 1, Math.max(0, Math.floor(y))))]);
        if (b) gy += BUILDINGS[b.t].height;
      }
      // sanftes Höhen-Smoothing
      const prevY = this.yS[s] || gy;
      const ny = prevY + (gy - prevY) * Math.min(1, dt * 14);
      this.yS[s] = ny;
      const moving = (w.flags[s] & 4) !== 0;
      const working = (w.aux[s] & 2) !== 0;
      const attacking = (w.aux[s] & 1) !== 0;
      let bob = 0;
      if (moving) bob = Math.abs(Math.sin(t * 11 + s)) * 0.06;
      else if (working) bob = Math.abs(Math.sin(t * 6 + s)) * 0.05;
      else if (attacking) bob = Math.abs(Math.sin(t * 9 + s)) * 0.07;
      const def = UNITS[type];
      const tm = this.unitMesh(type);
      const big = def.radius > 0.5;
      const lunge = attacking ? Math.sin(t * 9 + s) * 0.08 : 0;
      const face = w.face[s];
      tm.push(x + Math.sin(face) * lunge, ny + (big ? 0 : bob), y + Math.cos(face) * lunge, face, 1, teamColors[owner % 8]);
      const sel = o.selected.has(id);
      if (sel && rings < 2048) {
        const r = Math.max(1, def.radius * 2.4);
        const m = rings * 16;
        ringArr[m] = r; ringArr[m + 1] = 0; ringArr[m + 2] = 0; ringArr[m + 3] = 0;
        ringArr[m + 4] = 0; ringArr[m + 5] = 1; ringArr[m + 6] = 0; ringArr[m + 7] = 0;
        ringArr[m + 8] = 0; ringArr[m + 9] = 0; ringArr[m + 10] = r; ringArr[m + 11] = 0;
        ringArr[m + 12] = x; ringArr[m + 13] = ny + 0.03; ringArr[m + 14] = y; ringArr[m + 15] = 1;
        ringCol[rings * 3] = 0.4; ringCol[rings * 3 + 1] = 1; ringCol[rings * 3 + 2] = 0.4;
        rings++;
      }
      const hp = w.hp[s];
      if ((sel || hp < 250) && bars < 1536 && type !== U.Peasant && type !== U.Ox || (sel && bars < 1536)) {
        const wd = 0.7;
        const h = 0.09;
        const by = ny + (big ? 1.2 : 1.0) + (type === U.SiegeTower ? 1.8 : 0);
        const m = bars * 16;
        // Billboard um Y: Rotation um camYaw
        const rc = Math.cos(o.camYaw);
        const rs = Math.sin(o.camYaw);
        bgArr[m] = rc * (wd + 0.04); bgArr[m + 1] = 0; bgArr[m + 2] = -rs * (wd + 0.04); bgArr[m + 3] = 0;
        bgArr[m + 4] = 0; bgArr[m + 5] = h + 0.04; bgArr[m + 6] = 0; bgArr[m + 7] = 0;
        bgArr[m + 8] = rs; bgArr[m + 9] = 0; bgArr[m + 10] = rc; bgArr[m + 11] = 0;
        bgArr[m + 12] = x; bgArr[m + 13] = by; bgArr[m + 14] = y; bgArr[m + 15] = 1;
        const f = hp / 255;
        fgArr[m] = rc * wd * f; fgArr[m + 1] = 0; fgArr[m + 2] = -rs * wd * f; fgArr[m + 3] = 0;
        fgArr[m + 4] = 0; fgArr[m + 5] = h; fgArr[m + 6] = 0; fgArr[m + 7] = 0;
        fgArr[m + 8] = rs; fgArr[m + 9] = 0; fgArr[m + 10] = rc; fgArr[m + 11] = 0;
        // links ausrichten
        const off = -wd * (1 - f) * 0.5;
        fgArr[m + 12] = x + rc * off; fgArr[m + 13] = by + 0.001; fgArr[m + 14] = y - rs * off; fgArr[m + 15] = 1;
        fgCol[bars * 3] = f < 0.5 ? 1 : 2 - f * 2;
        fgCol[bars * 3 + 1] = f > 0.5 ? 0.85 : f * 1.7;
        fgCol[bars * 3 + 2] = 0.15;
        bars++;
      }
      const carry = w.carry[s];
      if (carry > 0 && cargo < 4096) {
        const m = cargo * 16;
        cargoArr[m] = 1; cargoArr[m + 1] = 0; cargoArr[m + 2] = 0; cargoArr[m + 3] = 0;
        cargoArr[m + 4] = 0; cargoArr[m + 5] = 1; cargoArr[m + 6] = 0; cargoArr[m + 7] = 0;
        cargoArr[m + 8] = 0; cargoArr[m + 9] = 0; cargoArr[m + 10] = 1; cargoArr[m + 11] = 0;
        cargoArr[m + 12] = x - Math.sin(face) * 0.14; cargoArr[m + 13] = ny + 0.78 + bob; cargoArr[m + 14] = y - Math.cos(face) * 0.14; cargoArr[m + 15] = 1;
        const c = RES_COLORS[carry - 1] ?? 0xffffff;
        cargoCol[cargo * 3] = ((c >> 16) & 255) / 255;
        cargoCol[cargo * 3 + 1] = ((c >> 8) & 255) / 255;
        cargoCol[cargo * 3 + 2] = (c & 255) / 255;
        cargo++;
      }
      // brennende Einheit: Flammenpartikel
      if (w.flags[s] & 2 && Math.random() < 0.3) this.fx.effect('fire', x, y, ny + 0.5);
    }
    for (const m of this.unitMeshes) m?.end();
    this.ringMesh.count = rings;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    (this.ringMesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.hpBg.count = bars;
    this.hpFg.count = bars;
    this.hpBg.instanceMatrix.needsUpdate = true;
    this.hpFg.instanceMatrix.needsUpdate = true;
    (this.hpFg.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.cargo.count = cargo;
    this.cargo.instanceMatrix.needsUpdate = true;
    (this.cargo.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;

    // Flammen
    const farr = this.fires.instanceMatrix.array as Float32Array;
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
      if (Math.random() < 0.05) this.fx.effect('fire', f.x, f.z, f.y);
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
    void cy;
    void sy;
  }

  private neutral = new THREE.Color(0xf2ede0);
  private updateBanners(o: RenderOpts): void {
    const m = this.bannerMesh;
    if (!m) return;
    const b = this.world.banners;
    m.begin();
    for (let i = 0; i + 3 < b.length; i += 4) {
      const owner = b[i + 2];
      m.push(b[i], tileY(this.world, Math.floor(b[i]), Math.floor(b[i + 1])), b[i + 1], Math.sin(o.now * 1.5 + i) * 0.4, 1, owner >= 0 ? teamColors[owner % 8] : this.neutral);
      if (b[i + 3] > 0 && Math.random() < 0.05) this.fx.effect('banner', b[i], b[i + 1], 0.5);
    }
    m.end();
  }

  private updateProjectiles(o: RenderOpts): void {
    const p = this.world.proj;
    const aarr = this.arrows.instanceMatrix.array as Float32Array;
    const sarr = this.stones.instanceMatrix.array as Float32Array;
    let na = 0;
    let ns = 0;
    const a = Math.min(1, o.alpha);
    const v = new THREE.Vector3();
    for (let i = 0; i + 7 < p.length; i += 8) {
      const kind = p[i];
      const x = p[i + 2] + p[i + 5] * a;
      const y = p[i + 3] + p[i + 6] * a;
      const z = p[i + 4] + p[i + 7] * a;
      if (kind === PROJ.Stone || kind === PROJ.Boulder) {
        if (ns >= 512) continue;
        const m = ns * 16;
        const sc = kind === PROJ.Boulder ? 1.6 : 0.5;
        sarr[m] = sc; sarr[m + 1] = 0; sarr[m + 2] = 0; sarr[m + 3] = 0;
        sarr[m + 4] = 0; sarr[m + 5] = sc; sarr[m + 6] = 0; sarr[m + 7] = 0;
        sarr[m + 8] = 0; sarr[m + 9] = 0; sarr[m + 10] = sc; sarr[m + 11] = 0;
        sarr[m + 12] = x; sarr[m + 13] = z; sarr[m + 14] = y; sarr[m + 15] = 1;
        ns++;
      } else {
        if (na >= 2048) continue;
        // Ausrichtung entlang der Geschwindigkeit (x, z=y-tile, y=höhe)
        v.set(p[i + 5], p[i + 7], p[i + 6]);
        if (v.lengthSq() < 1e-8) v.set(0, 0, 1);
        v.normalize();
        const up = Math.abs(v.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const rgt = new THREE.Vector3().crossVectors(up, v).normalize();
        const u2 = new THREE.Vector3().crossVectors(v, rgt);
        const m = na * 16;
        aarr[m] = rgt.x; aarr[m + 1] = rgt.y; aarr[m + 2] = rgt.z; aarr[m + 3] = 0;
        aarr[m + 4] = u2.x; aarr[m + 5] = u2.y; aarr[m + 6] = u2.z; aarr[m + 7] = 0;
        aarr[m + 8] = v.x; aarr[m + 9] = v.y; aarr[m + 10] = v.z; aarr[m + 11] = 0;
        aarr[m + 12] = x; aarr[m + 13] = z; aarr[m + 14] = y; aarr[m + 15] = 1;
        na++;
        if (kind === PROJ.FireArrow && Math.random() < 0.5) this.fx.effect('fire', x, y, z);
      }
    }
    this.arrows.count = na;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.stones.count = ns;
    this.stones.instanceMatrix.needsUpdate = true;
  }

  /** Meldet das Ende der Frame-Verarbeitung von Welt-Ereignissen */
  clearEvents(): void {
    this.world.events.length = 0;
    this.world.deaths.length = 0;
    this.world.removedBuildings.length = 0;
  }
}

export { HEIGHT_STEP, BT, S };
