import { Rng } from '../rng';
import { GameMap } from '../map/gamemap';
import { T } from '../data/terrain';
import {
  DEFAULT_TROOP_LIMIT,
  HOVEL_HOUSING,
  PEASANT_BASE_LIMIT,
  SLOT_MASK,
  TICKS_PER_MONTH,
} from '../data/balance';
import { BT, BUILDINGS, BuildingDef, Cost, STORE_CAP_PER_MODULE } from '../data/buildings';
import { R, RES_COUNT, RES_INFO, StoreKind } from '../data/resources';
import { U, UNITS } from '../data/units';
import { Building } from './building';
import { checkPlaceRules, PlaceCtx } from './placement';
import { Nav, NK } from './nav';
import { PlayerState } from './player';
import { ProjStore } from './projectiles';
import { Spatial, separate, tileOf } from './movement';
import { S, UnitStore } from './unitstore';
import type { PlayerCommand, SimConfig, SimEvent } from './types';
import { applyCommand } from './commands';
import { updateEconomy } from './economy';
import { updatePopularity } from './popularity';
import { updateUnits } from './units_sys';
import { updateProjectiles } from './combat';
import { updateFire } from './fire';
import { updateExtreme, ExtremeState } from './extreme';
import { updateAi } from './ai/ai';
import { AiController } from './ai/controller';
import { AI_PROFILES } from '../data/ai';
import { updateMission, MissionState } from './mission';

export interface Ladder {
  tile: number;
  team: number;
  owner: number;
  hp: number;
  until: number;
  tower: boolean;
}

export const START_LAYOUT: [number, number, number][] = [
  [BT.Keep, -2, -2],
  [BT.Stockpile, 3, -2],
  [BT.Granary, 3, 1],
  [BT.Campfire, -1, 4],
  [BT.Hovel, -6, -2],
  [BT.Hovel, -6, 1],
];

export class Sim {
  map: GameMap;
  nav: Nav;
  units = new UnitStore();
  proj = new ProjStore();
  spatial: Spatial;
  buildings = new Map<number, Building>();
  bldAt: Int32Array;
  nextBid = 1;
  players: PlayerState[] = [];
  teamOf: number[] = [];
  tick = 0;
  rng: Rng;
  events: SimEvent[] = [];
  dirtyTiles = new Set<number>();
  removedBuildings: number[] = [];
  ladders = new Map<number, Ladder>();
  /** 1 = graben, 2 = zuschütten, pro Tile */
  digMask: Uint8Array;
  digCount = 0;
  extreme: ExtremeState | null = null;
  mission: MissionState | null = null;
  /** Aufträge, die im nächsten Tick als Marschbefehl ausgeführt werden (z. B. Verstärkung) */
  pendingOrders: { p: number; units: number[]; x: number; y: number }[] = [];
  winnerTeam = -1;
  troopLimit: number;
  /** Zufallsstream nur für nicht-kritische Dinge */
  gameOver = false;
  deadUnits: number[] = [];
  /** Profiling: kumulierte ms je System */
  prof = { spatial: 0, ai: 0, economy: 0, units: 0, fire: 0, separate: 0, misc: 0 };
  fireCache: { tick: number; list: Building[] } = { tick: -1, list: [] };
  /** Reservierte Bäume (Tile -> Einheiten-Handle) */
  reserved = new Map<number, number>();

  constructor(readonly cfg: SimConfig) {
    this.map = cfg.map.clone();
    this.nav = new Nav(this.map);
    this.nav.computeBudget = 4;
    this.spatial = new Spatial(this.map.w, this.map.h);
    this.bldAt = new Int32Array(this.map.n);
    this.digMask = new Uint8Array(this.map.n);
    this.rng = new Rng(cfg.seed);
    this.troopLimit = cfg.troopLimit || DEFAULT_TROOP_LIMIT;
    const colors = [0, 1, 2, 3, 4, 5, 6, 7];
    cfg.players.forEach((ps, i) => {
      const p = new PlayerState(i, ps.team, ps.name, ps.kind, ps.color ?? colors[i % 8]);
      this.players.push(p);
      this.teamOf.push(ps.team);
    });
    this.nav.teamOf = this.teamOf;
    if (cfg.players.length > this.map.starts.length) throw new Error('Zu wenige Startpositionen');
    if (cfg.restore) this.recountAll();
    if (!cfg.restore) this.setupPlayers();
    if (cfg.extreme) this.extreme = new ExtremeState(this);
    if (cfg.mission) this.mission = new MissionState(this, cfg.mission, !!cfg.restore);
  }

  private setupPlayers(): void {
    for (const p of this.players) {
      const st = this.map.starts[p.id];
      p.gold = this.cfg.startGold;
      for (const [type, dx, dy] of START_LAYOUT) {
        const b = this.addBuilding(p.id, type, st.x + dx, st.y + dy, 0);
        if (type === BT.Keep) p.keepId = b.id;
        if (type === BT.Campfire) p.campfireId = b.id;
      }
      this.recountStores(p.id);
      const m = this.cfg.startRes ?? 1;
      const give = (r: number, a: number) => this.addStock(p.id, r, Math.round(a * m));
      give(R.Wood, 100);
      give(R.Stone, 50);
      give(R.Apple, 90);
      give(R.Bread, 20);
      // Lord
      const lord = this.spawnUnit(U.Lord, p.id, st.x + 0.5, st.y + 3.5);
      if (lord >= 0) p.lordId = this.units.id(lord);
      for (let i = 0; i < 8; i++) this.spawnPeasant(p.id);
    }
    this.recountAll();
  }

  // ---------- Hilfen ----------
  isEnemy(a: number, b: number): boolean {
    return this.teamOf[a] !== this.teamOf[b];
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  markTile(i: number): void {
    this.dirtyTiles.add(i);
  }

  spawnUnit(type: number, owner: number, x: number, y: number): number {
    const def = UNITS[type];
    const s = this.units.spawn(type, owner, x, y, def.hp);
    if (s >= 0) this.players[owner].stats.ever[type]++;
    return s;
  }

  spawnPeasant(p: number): number {
    const pl = this.players[p];
    const fire = this.buildings.get(pl.campfireId);
    const cx = fire ? fire.cx : this.map.starts[p].x;
    const cy = fire ? fire.cy : this.map.starts[p].y;
    const team = this.teamOf[p];
    for (let k = 0; k < 12; k++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = 1 + this.rng.next() * 2;
      const x = Math.min(this.map.w - 1, Math.max(0, cx + Math.cos(a) * r));
      const y = Math.min(this.map.h - 1, Math.max(0, cy + Math.sin(a) * r));
      if (this.nav.groundFree(tileOf(this, x, y), team) && !(this.nav.kind[tileOf(this, x, y)] & NK.Solid)) {
        return this.spawnUnit(U.Peasant, p, x, y);
      }
    }
    return this.spawnUnit(U.Peasant, p, cx, cy);
  }

  /** Rezept eines Gebäudes setzen (KI-Hilfe, entspricht dem Befehl setRecipe) */
  step_setRecipe(b: Building, recipe: number): void {
    if (b.def.prod && recipe >= 0 && recipe < b.def.prod.recipes.length) {
      b.recipe = recipe;
      b.inBuf = 0;
    }
  }

  /**
   * Befreit Einheiten, die auf einem blockierten Boden-Tile stehen, und holt gestrandete
   * Arbeiter (andere Region als das Lagerfeuer) zurück in die Heimatregion.
   */
  rescueUnit(s: number): void {
    const u = this.units;
    if (u.layer[s] !== 0) return;
    const team = this.teamOf[u.owner[s]] | (UNITS[u.type[s]].climbs ? 8 : 0);
    const t = tileOf(this, u.x[s], u.y[s]);
    const worker = u.type[s] === U.Peasant || u.type[s] === U.Ox;
    let homeLabel = 0;
    let labels: Int32Array | null = null;
    if (worker) {
      labels = this.nav.regionLabels(team, this.tick);
      const fire = this.buildings.get(this.players[u.owner[s]].campfireId);
      if (fire) homeLabel = labels[this.map.idx(fire.x, fire.y)];
    }
    const blocked = !(this.nav.groundFree(t, team) || this.nav.ladder[t] & (1 << (team & 7)));
    const stranded = worker && homeLabel !== 0 && labels![t] !== homeLabel;
    if (!blocked && !stranded) return;
    if (UNITS[u.type[s]].tunnels && u.state[s] === S.Tunnel) return;
    const w = this.map.w;
    const tx = t % w;
    const ty = (t / w) | 0;
    const maxR = stranded ? 30 : 12;
    for (let r = 1; r < maxR; r++) {
      let best = -1;
      let bd = Infinity;
      for (let y = ty - r; y <= ty + r; y++)
        for (let x = tx - r; x <= tx + r; x++) {
          if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r || !this.map.inBounds(x, y)) continue;
          const i = this.map.idx(x, y);
          if (!this.nav.groundFree(i, team) || this.nav.kind[i] & NK.Solid) continue;
          if (homeLabel !== 0 && labels![i] !== homeLabel) continue;
          const d = (x - tx) ** 2 + (y - ty) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      if (best >= 0) {
        u.x[s] = (best % w) + 0.5;
        u.y[s] = ((best / w) | 0) + 0.5;
        u.goal[s] = -1;
        if (stranded) {
          // Auftrag neu beginnen
          if (u.type[s] === U.Ox) u.sub[s] = 12;
        }
        return;
      }
    }
  }

  // ---------- Lager ----------
  recountStores(p: number): void {
    const pl = this.players[p];
    pl.cap.stock = pl.cap.granary = pl.cap.armory = 0;
    pl.housing = PEASANT_BASE_LIMIT;
    pl.horses = 0;
    for (const b of this.buildings.values()) {
      if (b.owner !== p) continue;
      const d = b.def;
      if (d.store) pl.cap[d.store] += STORE_CAP_PER_MODULE[d.store];
      if (d.housing) pl.housing += d.housing;
    }
    this.recountUsed(p);
  }

  recountUsed(p: number): void {
    const pl = this.players[p];
    pl.used.stock = pl.used.granary = pl.used.armory = 0;
    for (let r = 0; r < RES_COUNT; r++) pl.used[RES_INFO[r].store] += pl.stock[r];
  }

  recountAll(): void {
    for (const p of this.players) this.recountStores(p.id);
  }

  /** Freier Platz für eine Ware (Kapazität gilt pro Ware) */
  freeSpace(p: number, res: number): number {
    const pl = this.players[p];
    const k: StoreKind = RES_INFO[res].store;
    return Math.max(0, pl.cap[k] - pl.stock[res]);
  }

  addStock(p: number, res: number, amt: number): number {
    const pl = this.players[p];
    const take = Math.min(amt, this.freeSpace(p, res));
    if (take <= 0) return 0;
    pl.stock[res] += take;
    pl.used[RES_INFO[res].store] += take;
    return take;
  }

  /** Ablieferung von Produktion (zählt in der Produktionsstatistik) */
  deliver(p: number, res: number, amt: number): number {
    const a = this.addStock(p, res, amt);
    this.players[p].produced[res] += a;
    return a;
  }

  takeStock(p: number, res: number, amt: number): number {
    const pl = this.players[p];
    const take = Math.min(amt, pl.stock[res]);
    if (take <= 0) return 0;
    pl.stock[res] -= take;
    pl.used[RES_INFO[res].store] -= take;
    return take;
  }

  /** Nächstes Lagergebäude der Art für Spieler */
  nearestStore(p: number, kind: StoreKind, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings.values()) {
      if (b.owner !== p || b.def.store !== kind) continue;
      const d = (b.cx - x) ** 2 + (b.cy - y) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  canAfford(p: number, cost: Cost, mul = 1): boolean {
    const pl = this.players[p];
    if ((cost.gold ?? 0) * mul > pl.gold) return false;
    if ((cost.wood ?? 0) * mul > pl.stock[R.Wood]) return false;
    if ((cost.stone ?? 0) * mul > pl.stock[R.Stone]) return false;
    if ((cost.iron ?? 0) * mul > pl.stock[R.Iron]) return false;
    if ((cost.pitch ?? 0) * mul > pl.stock[R.Pitch]) return false;
    return true;
  }

  pay(p: number, cost: Cost, mul = 1): void {
    const pl = this.players[p];
    pl.gold -= (cost.gold ?? 0) * mul;
    if (cost.wood) this.takeStock(p, R.Wood, cost.wood * mul);
    if (cost.stone) this.takeStock(p, R.Stone, cost.stone * mul);
    if (cost.iron) this.takeStock(p, R.Iron, cost.iron * mul);
    if (cost.pitch) this.takeStock(p, R.Pitch, cost.pitch * mul);
  }

  // ---------- Gebäude ----------
  footprint(def: BuildingDef, rot: number): [number, number] {
    return rot ? [def.h, def.w] : [def.w, def.h];
  }

  /** Gibt eine Fehlermeldung zurück oder null, wenn die Platzierung gültig ist. */
  checkPlace(p: number, type: number, x: number, y: number, rot: number, ignoreCost = false): string | null {
    const def = BUILDINGS[type];
    const pl = this.players[p];
    if (!def || !pl || !pl.alive) return 'Ungültig';
    if (!ignoreCost && !this.canAfford(p, def.cost)) return 'Zu wenig Ressourcen';
    return checkPlaceRules(this.placeCtx, p, type, x, y, rot);
  }

  private _ctx: PlaceCtx | null = null;
  get placeCtx(): PlaceCtx {
    return (this._ctx ??= {
      map: this.map,
      bldAt: this.bldAt,
      digMask: this.digMask,
      bld: (id) => this.buildings.get(id) ?? null,
      countOwn: (p, t) => this.countOwn(p, t),
      countStoreModules: (p, k) => this.countStoreModules(p, k),
      enemyNear: (p, x0, y0, x1, y1) => this.enemyNear(p, x0, y0, x1, y1),
    });
  }

  /** Feindliche Soldaten (sichtbar, nicht im Tunnel) im Rechteck – Bauverbot wie im Original */
  enemyNear(p: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const u = this.units;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const r = Math.max(x1 - x0, y1 - y0) / 2 + 1;
    let hit = false;
    this.spatial.query(cx, cy, r, (s) => {
      if (hit || !u.alive[s] || !this.isEnemy(p, u.owner[s])) return;
      const t = u.type[s];
      if (t === U.Peasant || t === U.Ox || u.state[s] === S.Tunnel) return;
      if (UNITS[t].invisible && u.state[s] !== S.Attack) return;
      if (u.x[s] >= x0 && u.x[s] <= x1 && u.y[s] >= y0 && u.y[s] <= y1) hit = true;
    });
    return hit;
  }

  countOwn(p: number, type: number): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.owner === p && b.type === type) n++;
    return n;
  }
  countStoreModules(p: number, kind: StoreKind): number {
    let n = 0;
    for (const b of this.buildings.values()) if (b.owner === p && b.def.store === kind) n++;
    return n;
  }

  buildingAtTile(x: number, y: number): Building | null {
    if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return null;
    const id = this.bldAt[y * this.map.w + x];
    return id ? this.buildings.get(id) ?? null : null;
  }

  /** Platziert (prüft + bezahlt). */
  place(p: number, type: number, x: number, y: number, rot = 0): Building | null {
    const err = this.checkPlace(p, type, x, y, rot);
    if (err) return null;
    const def = BUILDINGS[type];
    if (def.placement === 'onWall') {
      const b = this.buildingAtTile(x, y)!;
      this.pay(p, def.cost);
      b.turret = type === BT.TurretBallista ? 1 : 2;
      return b;
    }
    this.pay(p, def.cost);
    const b = this.addBuilding(p, type, x, y, rot);
    this.players[p].stats.built++;
    return b;
  }

  /** Legt ein Gebäude ohne Prüfung an. */
  addBuilding(owner: number, type: number, x: number, y: number, rot: number): Building {
    const b = new Building(this.nextBid++, type, owner, x, y, rot);
    this.registerBuilding(b);
    if (b.def.solid) this.ejectUnits(b);
    if (b.def.store || b.def.housing) this.recountStores(owner);
    return b;
  }

  /** Trägt ein (neues oder geladenes) Gebäude in Karte und Navigation ein. */
  registerBuilding(b: Building): void {
    const { type, owner, x, y } = b;
    this.buildings.set(b.id, b);
    const m = this.map;
    const def = b.def;
    let k = NK.Bld;
    if (def.solid) k |= NK.Solid;
    if (def.gate) k |= NK.Gate;
    if (def.stairs) k |= NK.Stairs;
    if (def.wallTop) k |= NK.WallTop;
    for (let yy = y; yy < y + b.h; yy++)
      for (let xx = x; xx < x + b.w; xx++) {
        const i = m.idx(xx, yy);
        this.bldAt[i] = b.id;
        this.nav.kind[i] = k;
        this.nav.owner[i] = owner + 1;
        if (def.solid || def.gate) {
          // Bäume werden ersetzt, Fallen bleiben
        }
        if (type === BT.Pit) m.trap[i] = 1;
        else if (type === BT.KillingPit) m.trap[i] = 2;
        this.markTile(i);
      }
    this.nav.bump();
  }

  /** KI-Controller eines Spielers (erzeugt ihn bei Bedarf) */
  ensureAi(p: number): AiController | null {
    const pl = this.players[p];
    if (pl.kind !== 'ai') return null;
    if (!pl.ai) {
      const prof = AI_PROFILES[(this.cfg.players[p].ai ?? p) % AI_PROFILES.length];
      pl.ai = new AiController(this, p, prof, this.cfg.players[p].difficulty ?? 0);
    }
    return pl.ai as AiController;
  }

  private ejectUnits(b: Building): void {
    const u = this.units;
    for (let s = 0; s < u.top; s++) {
      if (!u.alive[s] || u.layer[s] !== 0) continue;
      const x = u.x[s];
      const y = u.y[s];
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        const opts: [number, number][] = [
          [b.x - 0.5, y],
          [b.x + b.w + 0.5, y],
          [x, b.y - 0.5],
          [x, b.y + b.h + 0.5],
        ];
        let best: [number, number] | null = null;
        let bd = Infinity;
        const team = this.teamOf[u.owner[s]];
        for (const o of opts) {
          if (o[0] < 0 || o[1] < 0 || o[0] >= this.map.w || o[1] >= this.map.h) continue;
          if (!this.nav.groundFree(tileOf(this, o[0], o[1]), team)) continue;
          const d = (o[0] - x) ** 2 + (o[1] - y) ** 2;
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) {
          u.x[s] = best[0];
          u.y[s] = best[1];
        }
      }
    }
  }

  removeBuilding(b: Building, destroyed: boolean): void {
    if (b.dead) return;
    b.dead = true;
    const m = this.map;
    for (let yy = b.y; yy < b.y + b.h; yy++)
      for (let xx = b.x; xx < b.x + b.w; xx++) {
        const i = m.idx(xx, yy);
        if (this.bldAt[i] === b.id) {
          this.bldAt[i] = 0;
          this.nav.kind[i] = 0;
          this.nav.owner[i] = 0;
          if (b.type === BT.Pit || b.type === BT.KillingPit) m.trap[i] = 0;
          this.markTile(i);
        }
      }
    this.nav.bump();
    this.buildings.delete(b.id);
    this.removedBuildings.push(b.id);
    // Arbeiter freisetzen
    for (const wid of b.workers) {
      const s = this.units.slot(wid);
      if (s >= 0 && this.units.home[s] === b.id) {
        this.units.home[s] = 0;
        this.units.sub[s] = 0;
        this.units.state[s] = S.Idle;
        this.units.carryAmt[s] = 0;
      }
    }
    if (b.def.store || b.def.housing) {
      this.recountStores(b.owner);
      // Überschuss verfällt
      this.clampStock(b.owner);
    }
    if (destroyed) {
      this.emit({ e: 'fx', k: b.def.wood ? 'collapseWood' : 'collapse', x: b.cx, y: b.cy, z: b.def.height });
      const pl = this.players[b.owner];
      if (b.type === BT.Keep && pl.alive) this.defeat(b.owner);
    }
  }

  private clampStock(p: number): void {
    const pl = this.players[p];
    for (let r = 0; r < RES_COUNT; r++) {
      const cap = pl.cap[RES_INFO[r].store];
      if (pl.stock[r] > cap) pl.stock[r] = cap;
    }
    this.recountUsed(p);
  }

  damageBuilding(b: Building, dmg: number, by: number): void {
    if (b.dead || b.def.hp <= 0) return;
    b.hp -= dmg;
    if (b.hp <= 0) {
      if (by >= 0 && by < this.players.length) this.players[by].stats.kills++;
      this.removeBuilding(b, true);
    } else if (dmg > 0) {
      this.emit({ e: 'alert', p: b.owner, x: b.cx, y: b.cy, k: 'attack' });
    }
  }

  /** Zugangstile eines Gebäudes (Index) oder -1. Bevorzugt die Heimatregion (Region des Lagerfeuers). */
  entryOf(b: Building): number {
    if (b.entryVer === this.nav.version) return b.entry;
    b.entryVer = this.nav.version;
    const m = this.map;
    const team = this.teamOf[b.owner];
    const labels = this.nav.regionLabels(team, this.tick);
    const pl = this.players[b.owner];
    const fire = this.buildings.get(pl.campfireId);
    const home = fire ? labels[m.idx(fire.x, fire.y)] : 0;
    let best = -1;
    let bd = Infinity;
    let bestAny = -1;
    let bdAny = Infinity;
    const px = b.cx;
    const py = b.y + b.h + 3;
    for (let yy = b.y - 1; yy <= b.y + b.h; yy++) {
      for (let xx = b.x - 1; xx <= b.x + b.w; xx++) {
        if (xx >= b.x && xx < b.x + b.w && yy >= b.y && yy < b.y + b.h) continue;
        if ((xx < b.x || xx >= b.x + b.w) && (yy < b.y || yy >= b.y + b.h)) continue;
        if (!m.inBounds(xx, yy)) continue;
        const i = m.idx(xx, yy);
        if (!this.nav.groundFree(i, team) || this.nav.kind[i] & NK.Solid) continue;
        const d = (xx + 0.5 - px) ** 2 + (yy + 0.5 - py) ** 2;
        if (d < bdAny) {
          bdAny = d;
          bestAny = i;
        }
        if (home && labels[i] === home && d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    b.entry = best >= 0 ? best : bestAny;
    return b.entry;
  }

  defeat(p: number): void {
    const pl = this.players[p];
    if (!pl.alive) return;
    pl.alive = false;
    pl.defeatedTick = this.tick;
    this.emit({ e: 'lose', p });
    // Einheiten und Gebäude fallen
    const u = this.units;
    for (let s = 0; s < u.top; s++) if (u.alive[s] && u.owner[s] === p) this.killUnitSilent(s);
    for (const b of [...this.buildings.values()]) if (b.owner === p) this.removeBuilding(b, true);
    this.checkWin();
  }

  killUnitSilent(s: number): void {
    this.deadUnits.push(this.units.id(s));
    this.units.kill(s);
  }

  checkWin(): void {
    if (this.gameOver) return;
    if (this.mission) {
      // In Missionen entscheiden nur die Missionsziele; fällt der eigene Lord, ist die Mission verloren
      if (!this.players[0].alive) {
        this.gameOver = true;
        this.winnerTeam = -1;
        this.emit({ e: 'win', team: -1 });
      }
      return;
    }
    const teams = new Set<number>();
    for (const p of this.players) if (p.alive) teams.add(p.team);
    const humans = this.players.filter((p) => p.kind === 'human');
    const humanAlive = humans.some((p) => p.alive);
    if (teams.size <= 1 || (humans.length > 0 && !humanAlive)) {
      this.gameOver = true;
      this.winnerTeam = teams.size === 1 ? [...teams][0] : -1;
      this.emit({ e: 'win', team: this.winnerTeam });
    }
  }

  // ---------- Simulationsschritt ----------
  step(cmds: PlayerCommand[] = []): void {
    this.events.length = 0;
    this.nav.computedThisTick = 0;
    for (const pc of cmds) {
      const pl = this.players[pc.p];
      if (!pl || !pl.alive) continue;
      applyCommand(this, pc.p, pc.cmd);
    }
    const pf = this.prof;
    let t0 = performance.now();
    const lap = (k: keyof Sim['prof']) => {
      const t1 = performance.now();
      pf[k] += t1 - t0;
      t0 = t1;
    };
    for (const o of this.pendingOrders) applyCommand(this, o.p, { c: 'move', units: o.units, x: o.x, y: o.y, attack: true });
    this.pendingOrders.length = 0;
    this.spatial.rebuild(this);
    lap('spatial');
    updateAi(this);
    lap('ai');
    updateEconomy(this);
    lap('economy');
    updateUnits(this);
    lap('units');
    updateProjectiles(this);
    updateFire(this);
    lap('fire');
    separate(this);
    lap('separate');
    updatePopularity(this);
    if (this.extreme) updateExtreme(this);
    if (this.mission) updateMission(this);
    lap('misc');
    this.tick++;
  }

  get month(): number {
    return Math.floor(this.tick / TICKS_PER_MONTH);
  }

  /** Beliebige Einheit-Handle -> Slot-Hilfe für externe Aufrufer */
  slotOf(id: number): number {
    return id & SLOT_MASK;
  }
}

export { HOVEL_HOUSING };
