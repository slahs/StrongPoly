import { UNIT_CAP, TICKS_PER_MONTH } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import type { Sim } from '../sim/sim';
import { S } from '../sim/unitstore';
import type { SimEvent } from '../sim/types';

export const UREC = 16;

/** Öffentliche Spielerinformation */
export interface PublicPlayer {
  id: number;
  name: string;
  team: number;
  color: number;
  kind: 'human' | 'ai';
  alive: boolean;
  keepX: number;
  keepY: number;
}

/** Eigene Spieleransicht (nur an den Besitzer gesendet) */
export interface PlayerView {
  gold: number;
  stock: number[];
  cap: [number, number, number];
  used: [number, number, number];
  tax: number;
  ration: number;
  popularity: number;
  popDelta: number;
  factors: { key: string; label: string; value: number }[];
  peasants: number;
  housing: number;
  troops: number;
  troopLimit: number;
  fear: number;
  horses: number;
  foodTypes: number;
  foodShort: boolean;
  power: number;
  powerMax: number;
  abilityCd: number[];
  banners: number;
  priceMul: number[];
  alive: boolean;
  aid: { from: number; tick: number }[];
}

export interface BuildingRec {
  i: number;
  t: number;
  o: number;
  x: number;
  y: number;
  r: number;
  hp: number;
  /** Flags: 1 brennt, 2 Reparatur, 4 Tor offen */
  f: number;
  /** Turm-Geschütz */
  u: number;
  /** Warteschlangenlänge */
  q: number;
  /** Arbeiter anwesend */
  s: number;
  /** Rezeptindex */
  c: number;
  /** Ausgabepuffer */
  b: number;
}

export interface Snapshot {
  t: 'snap';
  full: boolean;
  tick: number;
  month: number;
  units: Uint8Array;
  deadUnits: number[];
  blds: BuildingRec[];
  bRemoved: number[];
  tiles: Int32Array;
  proj: Float32Array;
  ladders: number[];
  events: SimEvent[];
  /** nur bei full */
  map?: {
    w: number;
    h: number;
    terrain: Uint8Array;
    height: Uint8Array;
    trees: Uint8Array;
    deposit: Uint16Array;
    trap: Uint8Array;
    starts: { x: number; y: number }[];
    seed: number;
    name: string;
  };
  players?: PublicPlayer[];
  winner?: number;
}

export function packTile(sim: Sim, i: number): number {
  return sim.map.terrain[i] | (sim.map.trees[i] << 8) | (sim.map.trap[i] << 16) | (sim.digMask[i] << 24);
}

export function playerView(sim: Sim, p: number): PlayerView {
  const pl = sim.players[p];
  const ex = sim.extreme;
  return {
    gold: Math.floor(pl.gold),
    stock: Array.from(pl.stock),
    cap: [pl.cap.stock, pl.cap.granary, pl.cap.armory],
    used: [pl.used.stock, pl.used.granary, pl.used.armory],
    tax: pl.tax,
    ration: pl.ration,
    popularity: pl.popularity,
    popDelta: pl.popTarget,
    factors: pl.factors,
    peasants: pl.peasants,
    housing: pl.housing,
    troops: pl.troops,
    troopLimit: sim.troopLimit,
    fear: pl.fear,
    horses: pl.horses,
    foodTypes: pl.foodTypes,
    foodShort: pl.foodShort,
    power: ex ? pl.power : 0,
    powerMax: pl.powerMax,
    abilityCd: pl.abilityCd.map((c) => Math.max(0, Math.ceil(c - sim.tick) / 10)),
    banners: pl.banners,
    priceMul: Array.from(pl.priceMul, (v) => Math.round(v * 100) / 100),
    alive: pl.alive,
    aid: pl.aidRequests,
  };
}

export function publicPlayers(sim: Sim): PublicPlayer[] {
  return sim.players.map((p) => {
    const keep = sim.buildings.get(p.keepId);
    const st = sim.map.starts[p.id];
    return {
      id: p.id,
      name: p.name,
      team: p.team,
      color: p.color,
      kind: p.kind,
      alive: p.alive,
      keepX: keep ? keep.cx : st.x,
      keepY: keep ? keep.cy : st.y,
    };
  });
}

function bFlags(b: ReturnType<Sim['buildings']['get']> & object, sim: Sim): number {
  let f = 0;
  if (b.burn > 0) f |= 1;
  if (b.repair) f |= 2;
  if (b.def.gate && b.activeUntil > sim.tick) f |= 4;
  return f;
}

function bRec(b: NonNullable<ReturnType<Sim['buildings']['get']>>, sim: Sim): BuildingRec {
  return {
    i: b.id,
    t: b.type,
    o: b.owner,
    x: b.x,
    y: b.y,
    r: b.rot,
    hp: Math.ceil(b.hp),
    f: bFlags(b, sim),
    u: b.turret,
    q: b.queue.length,
    s: b.staffed,
    c: b.recipe,
    b: b.out,
  };
}

function bSig(r: BuildingRec): number {
  let h = r.hp | 0;
  h = (h * 31 + r.f) | 0;
  h = (h * 31 + r.u) | 0;
  h = (h * 31 + r.q) | 0;
  h = (h * 31 + r.s) | 0;
  h = (h * 31 + r.c) | 0;
  h = (h * 31 + r.b) | 0;
  return h;
}

/** Erzeugt Delta-Snapshots aus der Sim. Eine Instanz pro laufendem Spiel; Ergebnis geht an alle Clients. */
export class SnapshotEncoder {
  private prev = new Uint8Array(UNIT_CAP * UREC);
  private buf = new Uint8Array(UNIT_CAP * UREC);
  private bSigs = new Map<number, number>();
  private tmp = new Uint8Array(UREC);
  private tdv = new DataView(this.tmp.buffer);

  constructor(private sim: Sim) {}

  private writeUnit(s: number, dv: DataView, o: number): void {
    const u = this.sim.units;
    dv.setUint32(o, u.id(s), true);
    dv.setUint8(o + 4, u.type[s]);
    const burning = u.burn[s] > 0 ? 1 : 0;
    const moving = u.state[s] === S.Move || u.state[s] === S.AttackMove || (u.state[s] === S.Attack && u.flags[s] & 1) || (u.state[s] === S.Work && u.goal[s] >= 0) ? 1 : 0;
    dv.setUint8(o + 5, (u.owner[s] & 15) | (u.layer[s] << 4) | (burning << 5) | (moving << 6) | ((u.flags[s] & 2 ? 1 : 0) << 7));
    dv.setInt16(o + 6, Math.round(u.x[s] * 16), true);
    dv.setInt16(o + 8, Math.round(u.y[s] * 16), true);
    dv.setUint8(o + 10, Math.max(1, Math.ceil((u.hp[s] / u.maxHp[s]) * 255)));
    dv.setUint8(o + 11, Math.round((((u.face[s] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 256) & 255);
    dv.setUint8(o + 12, u.state[s]);
    dv.setUint8(o + 13, u.carryAmt[s] > 0 ? u.carryRes[s] + 1 : 0);
    // Bit 0: greift an (Animation), Bit 1: arbeitet
    const atk = u.cd[s] > 0 && u.state[s] !== S.Idle ? 1 : 0;
    const wrk = u.state[s] === S.Work && u.goal[s] < 0 ? 2 : 0;
    dv.setUint16(o + 14, atk | wrk | (u.sub[s] << 4), true);
  }

  encode(full: boolean): Snapshot {
    const sim = this.sim;
    const u = sim.units;
    const changed: number[] = [];
    const dv = new DataView(this.buf.buffer);
    for (let s = 0; s < u.top; s++) {
      if (!u.alive[s]) {
        // vorherigen Eintrag als tot markieren
        this.prev[s * UREC + 4] = 255;
        continue;
      }
      this.writeUnit(s, dv, s * UREC);
      const o = s * UREC;
      let diff = full;
      if (!diff) {
        for (let k = 0; k < UREC; k++) {
          if (this.buf[o + k] !== this.prev[o + k]) {
            diff = true;
            break;
          }
        }
      }
      if (diff) changed.push(s);
    }
    const out = new Uint8Array(changed.length * UREC);
    changed.forEach((s, k) => {
      const o = s * UREC;
      out.set(this.buf.subarray(o, o + UREC), k * UREC);
      this.prev.set(this.buf.subarray(o, o + UREC), o);
    });

    const blds: BuildingRec[] = [];
    for (const b of sim.buildings.values()) {
      const r = bRec(b, sim);
      const sig = bSig(r);
      if (full || this.bSigs.get(b.id) !== sig) {
        blds.push(r);
        this.bSigs.set(b.id, sig);
      }
    }
    for (const id of sim.removedBuildings) this.bSigs.delete(id);

    // Tiles
    let tiles: Int32Array;
    if (full) tiles = new Int32Array(0);
    else {
      tiles = new Int32Array(sim.dirtyTiles.size * 2);
      let k = 0;
      for (const i of sim.dirtyTiles) {
        tiles[k++] = i;
        tiles[k++] = packTile(sim, i);
      }
    }

    // Projektile
    const pr = sim.proj;
    const parr: number[] = [];
    for (let i = 0; i < pr.top; i++) {
      if (!pr.alive[i]) continue;
      const T = Math.max(1, pr.T[i]);
      const f = pr.t[i] / T;
      const f2 = Math.min(1, (pr.t[i] + 1) / T);
      const x = pr.x(i);
      const y = pr.y(i);
      const z = pr.z(i);
      const nx = pr.sx[i] + (pr.ex[i] - pr.sx[i]) * f2;
      const ny = pr.sy[i] + (pr.ey[i] - pr.sy[i]) * f2;
      const nz = pr.sz[i] + (pr.ez[i] - pr.sz[i]) * f2 + pr.arc[i] * 4 * f2 * (1 - f2);
      void f;
      parr.push(pr.kind[i], pr.owner[i], x, y, z, nx - x, ny - y, nz - z);
    }

    const ladders: number[] = [];
    for (const [tile, l] of sim.ladders) ladders.push(tile, l.team, l.tower ? 1 : 0);

    const snap: Snapshot = {
      t: 'snap',
      full,
      tick: sim.tick,
      month: Math.floor(sim.tick / TICKS_PER_MONTH),
      units: out,
      deadUnits: sim.deadUnits.slice(),
      blds,
      bRemoved: sim.removedBuildings.slice(),
      tiles,
      proj: Float32Array.from(parr),
      ladders,
      events: sim.events.slice(),
    };
    if (full) {
      const m = sim.map;
      snap.map = {
        w: m.w,
        h: m.h,
        terrain: m.terrain.slice(),
        height: m.height.slice(),
        trees: m.trees.slice(),
        deposit: m.deposit.slice(),
        trap: m.trap.slice(),
        starts: m.starts,
        seed: m.seed,
        name: m.name,
      };
      snap.players = publicPlayers(sim);
      // Digmask in tiles mitschicken
      const dm: number[] = [];
      for (let i = 0; i < m.n; i++) if (sim.digMask[i]) dm.push(i, packTile(sim, i));
      snap.tiles = Int32Array.from(dm);
    }
    if (sim.gameOver) snap.winner = sim.winnerTeam;
    return snap;
  }

  /** Nach dem Verteilen eines Delta-Snapshots aufrufen. */
  finishTick(): void {
    const sim = this.sim;
    sim.dirtyTiles.clear();
    sim.removedBuildings.length = 0;
    sim.deadUnits.length = 0;
  }

  /** Voll-Snapshot (Beitritt/Reconnect), ohne den Delta-Zustand zu stören. */
  encodeFullStandalone(): Snapshot {
    const saved = { prev: this.prev, sigs: this.bSigs };
    this.prev = new Uint8Array(UNIT_CAP * UREC);
    this.bSigs = new Map(this.bSigs);
    const dirty = new Set(this.sim.dirtyTiles);
    const snap = this.encode(true);
    this.prev = saved.prev;
    this.bSigs = saved.sigs;
    this.sim.dirtyTiles = dirty;
    return snap;
  }
}

/** Für Aufrufer: Gebäude-Flags */
export const BF = { Burning: 1, Repair: 2, GateOpen: 4 } as const;
export { BUILDINGS };
