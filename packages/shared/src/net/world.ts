import { UNIT_CAP, SLOT_MASK } from '../data/balance';
import { GameMap } from '../map/gamemap';
import type { SimEvent } from '../sim/types';
import { BuildingRec, PlayerView, PublicPlayer, Snapshot, UREC } from './snapshot';
import type { PlaceBld, PlaceCtx } from '../sim/placement';
import type { StoreKind } from '../data/resources';

export interface ClientBuilding extends BuildingRec {
  w: number;
  h: number;
}

/** Client-Spiegel des Spielzustands, gespeist aus Snapshots. Enthält Interpolationsdaten. */
export class ClientWorld implements PlaceCtx {
  map: GameMap = new GameMap(1, 1);
  players: PublicPlayer[] = [];
  me = 0;
  view: PlayerView | null = null;
  tick = 0;
  month = 0;
  winner: number | undefined;

  // Einheiten (nach Slot)
  ids = new Int32Array(UNIT_CAP);
  type = new Uint8Array(UNIT_CAP);
  owner = new Uint8Array(UNIT_CAP);
  flags = new Uint8Array(UNIT_CAP);
  hp = new Uint8Array(UNIT_CAP);
  state = new Uint8Array(UNIT_CAP);
  carry = new Uint8Array(UNIT_CAP);
  aux = new Uint16Array(UNIT_CAP);
  face = new Float32Array(UNIT_CAP);
  prevX = new Float32Array(UNIT_CAP);
  prevY = new Float32Array(UNIT_CAP);
  curX = new Float32Array(UNIT_CAP);
  curY = new Float32Array(UNIT_CAP);
  /** Zeitpunkt der letzten Aktualisierung (ms, performance.now) */
  top = 0;

  buildings = new Map<number, ClientBuilding>();
  /** Gebäude-ID je Tile (Client-seitig, für Picking) */
  bldAt: Int32Array = new Int32Array(1);
  proj: Float32Array = new Float32Array(0);
  ladders: number[] = [];
  banners: number[] = [];
  mission: import('../sim/mission').MissionView | null = null;
  digMask: Uint8Array = new Uint8Array(1);
  /** geänderte Tiles seit letztem Abholen (für Renderer) */
  tileChanges: number[] = [];
  buildingsDirty = true;
  /** Ereignisse seit dem letzten Abholen */
  events: SimEvent[] = [];
  /** neu gestorbene Einheiten (id, x, y, type, owner) für Effekte */
  deaths: { id: number; x: number; y: number; type: number; owner: number }[] = [];
  removedBuildings: ClientBuilding[] = [];
  gameTimeMs = 0;
  lastSnapMs = 0;
  snapInterval = 100;

  bld(id: number): PlaceBld | null {
    const b = this.buildings.get(id);
    return b ? { owner: b.o, type: b.t, turret: b.u } : null;
  }
  countOwn(p: number, type: number): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.o === p && b.t === type) n++;
    return n;
  }
  countStoreModules(p: number, kind: StoreKind): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.o === p && BUILDINGS[b.t].store === kind) n++;
    return n;
  }

  has(slot: number): boolean {
    return this.ids[slot] !== 0;
  }

  slotOf(id: number): number {
    const s = id & SLOT_MASK;
    return this.ids[s] === id ? s : -1;
  }

  applyMe(v: PlayerView): void {
    this.view = v;
  }

  apply(snap: Snapshot, nowMs: number): void {
    if (snap.full && snap.map) {
      const m = new GameMap(snap.map.w, snap.map.h);
      m.terrain = snap.map.terrain;
      m.height = snap.map.height;
      m.trees = snap.map.trees;
      m.deposit = snap.map.deposit;
      m.trap = snap.map.trap;
      m.starts = snap.map.starts;
      m.seed = snap.map.seed;
      m.name = snap.map.name;
      this.map = m;
      this.bldAt = new Int32Array(m.n);
      this.digMask = new Uint8Array(m.n);
      this.buildings.clear();
      this.ids.fill(0);
      this.top = 0;
      this.tileChanges = [];
      this.buildingsDirty = true;
      this.tileChanges.push(-1); // Signal: komplette Karte neu
    }
    if (snap.players) this.players = snap.players;
    this.tick = snap.tick;
    this.month = snap.month;
    this.winner = snap.winner;
    this.lastSnapMs = nowMs;

    // Einheiten
    const dv = new DataView(snap.units.buffer, snap.units.byteOffset, snap.units.byteLength);
    const n = snap.units.byteLength / UREC;
    for (let k = 0; k < n; k++) {
      const o = k * UREC;
      const id = dv.getUint32(o, true);
      const s = id & SLOT_MASK;
      const x = dv.getInt16(o + 6, true) / 16;
      const y = dv.getInt16(o + 8, true) / 16;
      const fresh = this.ids[s] !== id;
      this.ids[s] = id;
      this.type[s] = dv.getUint8(o + 4);
      const f = dv.getUint8(o + 5);
      this.owner[s] = f & 15;
      this.flags[s] = f >> 4;
      this.hp[s] = dv.getUint8(o + 10);
      this.face[s] = (dv.getUint8(o + 11) / 256) * Math.PI * 2;
      this.state[s] = dv.getUint8(o + 12);
      this.carry[s] = dv.getUint8(o + 13);
      this.aux[s] = dv.getUint16(o + 14, true);
      if (fresh) {
        this.prevX[s] = x;
        this.prevY[s] = y;
      } else {
        this.prevX[s] = this.curX[s];
        this.prevY[s] = this.curY[s];
      }
      this.curX[s] = x;
      this.curY[s] = y;
      if (s >= this.top) this.top = s + 1;
    }
    for (const id of snap.deadUnits) {
      const s = id & SLOT_MASK;
      if (this.ids[s] === id) {
        this.deaths.push({ id, x: this.curX[s], y: this.curY[s], type: this.type[s], owner: this.owner[s] });
        this.ids[s] = 0;
      }
    }

    // Gebäude
    for (const b of snap.blds) {
      const old = this.buildings.get(b.i);
      const cb = b as ClientBuilding;
      if (!old) this.placeBuilding(cb);
      else {
        cb.w = old.w;
        cb.h = old.h;
      }
      this.buildings.set(b.i, cb);
      this.buildingsDirty = true;
    }
    for (const id of snap.bRemoved) {
      const b = this.buildings.get(id);
      if (b) {
        this.clearBuilding(b);
        this.removedBuildings.push(b);
        this.buildings.delete(id);
        this.buildingsDirty = true;
      }
    }

    // Tiles
    for (let k = 0; k < snap.tiles.length; k += 2) {
      const i = snap.tiles[k];
      const v = snap.tiles[k + 1];
      this.map.terrain[i] = v & 255;
      this.map.trees[i] = (v >> 8) & 255;
      this.map.trap[i] = (v >> 16) & 255;
      this.digMask[i] = (v >> 24) & 255;
      this.tileChanges.push(i);
    }
    this.proj = snap.proj;
    this.ladders = snap.ladders;
    this.banners = snap.banners ?? [];
    if (snap.mission) this.mission = snap.mission;
    for (const e of snap.events) this.events.push(e);
  }

  placeBuilding(b: ClientBuilding): void {
    const def = defOf(b.t);
    b.w = b.r ? def[1] : def[0];
    b.h = b.r ? def[0] : def[1];
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) if (this.map.inBounds(x, y)) this.bldAt[this.map.idx(x, y)] = b.i;
  }

  clearBuilding(b: ClientBuilding): void {
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        if (!this.map.inBounds(x, y)) continue;
        const i = this.map.idx(x, y);
        if (this.bldAt[i] === b.i) this.bldAt[i] = 0;
      }
  }
}

import { BUILDINGS } from '../data/buildings';
function defOf(t: number): [number, number] {
  const d = BUILDINGS[t];
  return [d.w, d.h];
}
