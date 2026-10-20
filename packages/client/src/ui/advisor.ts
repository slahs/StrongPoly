import {
  ADVISOR_EVENT_BY_ID,
  ADVISOR_NAME_DE,
  BT,
  BUILDINGS,
  ClientWorld,
  FOOD_RES,
  PlayerView,
  RES_INFO,
  Snapshot,
  U,
  UNITS,
  advisorKey,
  advisorText,
  explainPopularity,
  getLang,
  popDuration,
  popNum,
} from '@strongpoly/shared';
import type { AdvisorKind, AdvisorPrio, AdvisorTopic, Lang, Params, PopExplain } from '@strongpoly/shared';
import { AdvisorQueue, joinList, prioOf } from './advisor_queue';
import { RES_LIMITS, foodSupply } from './hud_stats';
import type { AdvisorCandidate, Delivery } from './advisor_queue';
import { keyLabel, loadHotkeys } from '../game/hotkeys';
import { clear, h } from './dom';
import { iconEl, toolIcon } from './icons';
import { attachTooltip } from './tooltip';

/** Der Berater: Hofkämmerer mit eigener Stimme. Er meldet Ereignisse aus echten Spieldaten als Text (und, wenn
 *  das Sprachsystem da und eingeschaltet ist, gesprochen), mit Priorität, Entprellung und Sprung zum Ort. */
export const ADVISOR_NAME = ADVISOR_NAME_DE;

export type { AdvisorKind };

export interface AdvisorMsg {
  id: number;
  tick: number;
  kind: AdvisorKind;
  text: string;
  /** Ort für den Kamerasprung (Tiles) */
  x?: number;
  y?: number;
  /** Gebäude, das beim Klick angewählt wird */
  building?: number;
  read: boolean;
  /** Zeilenschlüssel (`advisor.<ereignis>.<nr>`); fehlt bei rohen Meldungen der Simulation: dann nicht gesprochen */
  key?: string;
  prio: AdvisorPrio;
  topic?: AdvisorTopic;
  /** Ereignis-ID, z. B. `res.low.plain` */
  event?: string;
  lang?: Lang;
}

export interface AdvisorOptions {
  /** Tutorial-Mission: nur Wichtiges und Kritisches, damit der Berater die Aufgaben nicht übertönt */
  mission?: boolean;
  /** Sprache der Texte (Standard: aktuelle Sprache) */
  lang?: () => Lang;
}

/** Ruhephase nach Spielbeginn (Ticks): nur Kritisches wird gemeldet */
export const QUIET_NORMAL = 1200;
export const QUIET_IMPORTANT = 600;
export const QUIET_IMPORTANT_MISSION = 1800;

export { RES_LIMITS };
/** Schwelle Nahrung: Monate Vorrat */
export const FOOD_LOW_MONTHS = 1.5;
export const FOOD_OK_MONTHS = 3;
/** Heer- und Bevölkerungsmarken */
export const ARMY_MARKS = [10, 25, 50, 100, 200, 400];
export const PEASANT_MARKS = [10, 20, 30, 50, 75, 100, 150];
/** Feindliche Soldaten ab dieser Zahl in dieser Entfernung (Tiles) zum Bergfried gelten als anrückend */
export const APPROACH_MIN = 4;
export const APPROACH_RADIUS = 60;
export const ATTACK_RADIUS = 34;
export const SIEGE_RADIUS = 90;
/** Gegner nahe ihrer eigenen Burg gelten nicht als anrückend */
export const HOME_RADIUS = 25;
const STORE_NAMES = ['Das Lager', 'Der Kornspeicher', 'Die Waffenkammer'];
const STORE_NAMES_EN = ['The stockpile', 'The granary', 'The armory'];

interface ChainState {
  kind: 'noinput' | 'noworkers' | 'blocked';
  since: number;
  reported: boolean;
}

/**
 * Leitet aus Snapshots und Spieleransicht die Meldungen ab (reine Logik, ohne DOM, damit testbar).
 * Erkannte Ereignisse gehen als Kandidaten in die `AdvisorQueue` (Priorität, Entprellung, Bündelung);
 * `onMessage` bekommt jede ausgelieferte Meldung genau einmal.
 */
export class AdvisorLogic {
  readonly queue = new AdvisorQueue();
  private last = new Map<string, number>();
  private seenRemoved = 0;
  private aidSeen = 0;
  private nextId = 1;
  private variantCount = new Map<string, number>();
  private view: PlayerView | null = null;
  readonly list: AdvisorMsg[] = [];
  onMessage: (m: AdvisorMsg) => void = () => {};

  // ----- Zustände der Ereignisse (Hysterese) -----
  private res = new Map<number, { armed: boolean; low: boolean; empty: boolean }>();
  private food = { low: false, empty: false };
  private storeFull = [false, false, false];
  private workers = { since: -1, reported: false };
  private housingFull = false;
  private chains = new Map<number, ChainState>();
  private chainWatch = new Map<number, { p: number; b: number; active: number; bSince: number }>();
  private chainEver = false;
  private chainResolved = false;
  private pop: 'ok' | 'falling' | 'leaving' = 'ok';
  private popAnnounced = false;
  private attacks = new Map<number, { active: boolean; n: number; lastNear: number }>();
  private approaches = new Map<number, { active: boolean; n: number; lastSeen: number }>();
  private sieges = new Map<string, number>();
  private keepLevel = 100;
  private keepHp = -1;
  private armyMark = -2;
  private armyLimit = false;
  private peasantMark = -2;

  constructor(
    private world: ClientWorld,
    private me: () => number,
    private teamOf: () => number[],
    private opts: AdvisorOptions = {},
  ) {}

  private get lang(): Lang {
    return this.opts.lang ? this.opts.lang() : getLang();
  }

  /** Letzte gesprochene bzw. gelistete Meldung mit Zeilenschlüssel */
  lastSpoken(): AdvisorMsg | null {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].key) return this.list[i];
    return null;
  }

  private emit(m: AdvisorMsg): AdvisorMsg {
    this.list.push(m);
    if (this.list.length > 40) this.list.shift();
    this.onMessage(m);
    return m;
  }

  /**
   * Rohe Meldung (Simulation, Altlasten) direkt in die Liste, mit einfacher Abklingzeit je Schlüssel.
   * Wird nicht gesprochen.
   */
  push(kind: AdvisorKind, text: string, tick: number, x?: number, y?: number, key?: string): AdvisorMsg | null {
    if (key) {
      const cd = RAW_COOLDOWN[key.split(':')[0]] ?? 300;
      const prev = this.last.get(key);
      if (prev !== undefined && tick - prev < cd) return null;
      this.last.set(key, tick);
    }
    return this.emit({ id: this.nextId++, tick, kind, text, x, y, read: false, prio: kind === 'alert' ? 2 : kind === 'warn' ? 1 : 0 });
  }

  /** Meldungen der Simulation (`msg`-Ereignisse) übernehmen */
  onEvents(events: Snapshot['events'], tick: number): void {
    for (const e of events) if (e.e === 'msg' && e.p === this.me()) this.push('info', e.text, tick);
  }

  // ----- Kandidaten anbieten -----

  /** Kandidat in die Warteschlange; false, wenn zu früh (Ruhephase) oder in der Abklingzeit */
  private offer(id: string, slot: string, tick: number, params: Params, extra: Partial<AdvisorCandidate> = {}): boolean {
    const prio = prioOf(id);
    if (prio === 0 && (this.opts.mission || tick < QUIET_NORMAL)) return false;
    if (prio === 1 && tick < (this.opts.mission ? QUIET_IMPORTANT_MISSION : QUIET_IMPORTANT)) return false;
    return this.queue.offer({ id, slot, params, tick, ...extra }, tick);
  }

  /** Meldung aus der Warteschlange ausliefern (einmal je Aufruf höchstens eine) */
  flush(tick: number): AdvisorMsg | null {
    const d = this.queue.next(tick);
    if (!d) return null;
    const m = this.build(d, tick);
    this.queue.delivered(d, tick, m.text.length);
    return this.emit(m);
  }

  private build(d: Delivery, tick: number): AdvisorMsg {
    const def = ADVISOR_EVENT_BY_ID[d.id];
    const n = this.variantCount.get(d.id) ?? 0;
    this.variantCount.set(d.id, n + 1);
    const key = advisorKey(d.id, (n % def.variants) + 1);
    const lang = this.lang;
    const params: Params = { ...d.params };
    if (d.merged.length > 1) params.list = joinList(d.merged.map((c) => c.item ?? '').filter(Boolean), lang === 'de' ? 'und' : 'and');
    return { id: this.nextId++, tick, kind: def.kind, text: advisorText(key, params, lang), x: d.x, y: d.y, building: d.building, read: false, key, prio: d.prio, topic: def.topic, event: d.id, lang };
  }

  // ----- Hilfen -----

  private bname(type: number): string {
    return BUILDINGS[type].name;
  }
  private rname(r: number): string {
    return RES_INFO[r].name;
  }

  private own(): import('@strongpoly/shared').ClientBuilding[] {
    const me = this.me();
    const out: import('@strongpoly/shared').ClientBuilding[] = [];
    for (const b of this.world.buildings.values()) if (b.o === me) out.push(b);
    return out;
  }

  private keep(): { x: number; y: number; id?: number } | null {
    const me = this.me();
    for (const b of this.world.buildings.values()) if (b.o === me && b.t === BT.Keep) return { x: b.x + b.w / 2, y: b.y + b.h / 2, id: b.i };
    const k = this.world.players[me];
    return k ? { x: k.keepX, y: k.keepY } : null;
  }

  /** Eigene Gebäude, die eine Ware herstellen */
  private producersOf(res: number): import('@strongpoly/shared').ClientBuilding[] {
    return this.own().filter((b) => BUILDINGS[b.t].prod?.recipes.some((r) => r.out === res || r.extra?.res === res));
  }

  private firstOf(type: number): import('@strongpoly/shared').ClientBuilding | undefined {
    const me = this.me();
    for (const b of this.world.buildings.values()) if (b.o === me && b.t === type) return b;
    return undefined;
  }

  private locOf(b: import('@strongpoly/shared').ClientBuilding | { x: number; y: number } | null | undefined): Partial<AdvisorCandidate> {
    if (!b) return {};
    if ('i' in b) return { x: b.x + b.w / 2, y: b.y + b.h / 2, building: b.i };
    return { x: b.x, y: b.y };
  }

  /** Neu zerstörte eigene Mauern, Tore und Türme: nur mit Feinden in der Nähe (nicht beim Abreißen durch den Spieler) */
  checkRemoved(tick: number): void {
    const w = this.world;
    if (w.removedBuildings.length < this.seenRemoved) this.seenRemoved = 0;
    for (let i = this.seenRemoved; i < w.removedBuildings.length; i++) {
      const b = w.removedBuildings[i];
      const def = BUILDINGS[b.t];
      if (b.o !== this.me() || !def || def.id === BT.Keep || def.stairs) continue;
      const tower = b.t === BT.TowerLookout || b.t === BT.TowerGuard || b.t === BT.TowerRound;
      if (!def.wallTop && !tower) continue;
      if (!this.enemyNear(b.x, b.y, 14, 1)) continue;
      const id = def.gate ? 'gate.fallen' : tower ? 'tower.fallen' : 'wall.breach';
      this.offer(id, `${id}:${b.i}`, tick, { building: this.bname(b.t) }, { x: b.x, y: b.y });
    }
    this.seenRemoved = w.removedBuildings.length;
    this.flush(tick);
  }

  /** Feindliche Soldaten im Umkreis (Tiles) eines Punkts */
  private enemyNear(x: number, y: number, r: number, min = 1): number {
    const w = this.world;
    const team = this.teamOf();
    const myTeam = team[this.me()] ?? 0;
    let n = 0;
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s]) continue;
      const t = w.type[s];
      if (t === U.Peasant || t === U.Ox) continue;
      if ((team[w.owner[s]] ?? -1) === myTeam) continue;
      if (w.flags[s] & 8) continue;
      if (Math.hypot(w.curX[s] - x, w.curY[s] - y) <= r && ++n >= min) return n;
    }
    return n;
  }

  /** Alle ~1 s aufrufen */
  update(view: PlayerView | null, tick: number): void {
    if (!view || view.alive === false) return;
    this.view = view;
    this.economy(view, tick);
    this.foodEvents(view, tick);
    this.storage(view, tick);
    this.workerEvents(view, tick);
    this.chainEvents(view, tick);
    this.popularity(view, tick);
    this.military(view, tick);
    this.development(view, tick);
    this.flush(tick);
  }

  // ----- Wirtschaft -----

  private economy(view: PlayerView, tick: number): void {
    for (const [k, cfg] of Object.entries(RES_LIMITS)) {
      const r = Number(k);
      const stock = view.stock[r] ?? 0;
      let s = this.res.get(r);
      if (!s) this.res.set(r, (s = { armed: false, low: false, empty: false }));
      if (!s.armed) {
        if (stock >= cfg.arm) s.armed = true;
        continue;
      }
      if (s.low && stock >= cfg.ok) {
        if (this.offer('res.recovered', `res.recovered:${r}`, tick, { res: this.rname(r) }, { item: this.rname(r) })) {
          s.low = false;
          s.empty = false;
        }
        continue;
      }
      if (!s.low && stock < cfg.low) {
        const prod = this.producersOf(r);
        const empty = stock <= 0;
        const id = empty ? 'res.empty' : prod.length ? 'res.low.plain' : 'res.low.noprod';
        const at = prod[0] ?? this.firstOf(BT.Stockpile);
        const ok = this.offer(id, empty ? `res.empty:${r}` : `res.low:${r}`, tick, { res: this.rname(r), n: stock }, { item: this.rname(r), ...this.locOf(at ?? this.keep()), valid: () => (this.view?.stock[r] ?? 0) < cfg.ok });
        if (ok) {
          s.low = true;
          s.empty = empty;
        }
      } else if (s.low && !s.empty && stock <= 0) {
        this.queue.withdraw(`res.low:${r}`);
        if (this.offer('res.empty', `res.empty:${r}`, tick, { res: this.rname(r) }, { item: this.rname(r), ...this.locOf(this.producersOf(r)[0] ?? this.firstOf(BT.Stockpile) ?? this.keep()), valid: () => (this.view?.stock[r] ?? 0) < cfg.ok })) s.empty = true;
      }
    }
  }

  private foodEvents(view: PlayerView, tick: number): void {
    const { total, need } = foodSupply(view);
    const granary = this.firstOf(BT.Granary);
    const loc = this.locOf(granary ?? this.keep());
    const f = this.food;
    if (view.foodShort) {
      if (!f.empty && this.offer('food.empty', 'food.empty', tick, {}, { ...loc, valid: () => !!this.view?.foodShort })) {
        f.empty = true;
        f.low = true;
      }
      return;
    }
    if (f.empty && total > need) f.empty = false;
    if (!f.low && view.peasants >= 6 && need > 0 && total < need * FOOD_LOW_MONTHS) {
      const months = Math.round((total / need) * 10) / 10;
      const noprod = !this.own().some((b) => BUILDINGS[b.t].prod?.recipes.some((r) => FOOD_RES.includes(r.out)));
      if (this.offer(noprod ? 'food.low.noprod' : 'food.low', 'food.low', tick, { months }, { ...loc, valid: () => !this.view?.foodShort })) f.low = true;
    } else if (f.low && !f.empty && (need <= 0 || total >= need * FOOD_OK_MONTHS)) {
      if (this.offer('food.recovered', 'food.recovered', tick, {}, loc)) f.low = false;
    }
  }

  private storage(view: PlayerView, tick: number): void {
    if (tick <= 1200) return;
    const names = this.lang === 'de' ? STORE_NAMES : STORE_NAMES_EN;
    const types = [BT.Stockpile, BT.Granary, BT.Armory];
    for (let i = 0; i < 3; i++) {
      if (!(view.cap[i] > 0)) continue;
      const ratio = view.used[i] / view.cap[i];
      if (ratio >= 0.97 && !this.storeFull[i]) {
        if (this.offer('storage.full', `storage:${i}`, tick, { store: names[i] }, { item: names[i], ...this.locOf(this.firstOf(types[i])), valid: () => !!this.view && this.view.used[i] >= this.view.cap[i] * 0.9 })) this.storeFull[i] = true;
      } else if (ratio < 0.85) this.storeFull[i] = false;
    }
  }

  private workerEvents(view: PlayerView, tick: number): void {
    let jobs = 0;
    for (const b of this.own()) {
      const d = BUILDINGS[b.t];
      if (d.workers > 0 && !(b.f & 8)) jobs += d.workers;
    }
    const short = jobs - view.peasants;
    const w = this.workers;
    if (short >= 3 && short >= jobs * 0.2) {
      if (w.since < 0) w.since = tick;
      // erst, wenn der Mangel anhält (neue Bauern kommen laufend nach)
      if (!w.reported && tick - w.since >= 600) {
        const housing = view.peasants >= view.housing;
        if (this.offer(housing ? 'workers.short.housing' : 'workers.short', 'workers.short', tick, { jobs, peasants: view.peasants }, { ...this.locOf(this.firstOf(BT.Hovel) ?? this.keep()), valid: () => this.workers.since >= 0 })) w.reported = true;
      }
    } else if (short <= 0) {
      w.since = -1;
      w.reported = false;
    }
    // Wohnraum voll
    const full = view.peasants >= view.housing && view.housing > 0 && view.popularity >= 55;
    if (full && !this.housingFull && tick > 3000) {
      if (this.offer('housing.full', 'housing.full', tick, { housing: view.housing }, this.locOf(this.keep()))) this.housingFull = true;
    } else if (!full && view.peasants < view.housing - 2) this.housingFull = false;
  }

  /** Produktionsketten: Gebäude ohne Eingangsware, ohne Arbeiter oder ohne Abholung, wenn der Zustand anhält */
  private chainEvents(view: PlayerView, tick: number): void {
    const seen = new Set<number>();
    for (const b of this.own()) {
      const def = BUILDINGS[b.t];
      const prod = def.prod;
      if (!prod || b.f & 8) continue;
      seen.add(b.i);
      // frisch gebaute Gebäude bekommen Zeit zum Anlaufen
      if (b.n > 0 && tick - b.n < 600) continue;
      const rec = prod.recipes[Math.min(b.c, prod.recipes.length - 1)];
      const wt = this.chainWatch.get(b.i) ?? { p: b.p, b: b.b, active: tick, bSince: tick };
      if (b.s > 0 || b.p !== wt.p) wt.active = tick;
      if (b.b !== wt.b) wt.bSince = tick;
      wt.p = b.p;
      wt.b = b.b;
      this.chainWatch.set(b.i, wt);
      let kind: ChainState['kind'] | null = null;
      let need = 450;
      let missing = -1;
      for (const [res, amt] of rec.in) {
        if ((view.stock[res] ?? 0) < amt) {
          missing = res;
          break;
        }
      }
      if (prod.mode === 'process' && missing >= 0) kind = 'noinput';
      else if (prod.mode !== 'roam' && def.workers > 0 && tick - wt.active >= 1200) {
        kind = 'noworkers';
        need = 0;
      } else if (prod.haul === 'ox' && b.b >= prod.batch * 2 && tick - wt.bSince >= 600) {
        kind = 'blocked';
        need = 0;
      }
      const cur = this.chains.get(b.i);
      if (!kind) {
        if (cur?.reported) this.chainResolved = true;
        this.chains.delete(b.i);
        continue;
      }
      if (!cur || cur.kind !== kind) this.chains.set(b.i, { kind, since: tick, reported: false });
      const st = this.chains.get(b.i)!;
      if (!st.reported && tick - st.since >= need) {
        const id = kind === 'noinput' ? 'chain.noinput' : kind === 'noworkers' ? 'chain.noworkers' : 'chain.blocked';
        const bi = b.i;
        const params: Params = { building: this.bname(b.t) };
        if (kind === 'noinput') params.res = this.rname(missing);
        if (this.offer(id, `chain:${bi}`, tick, params, { item: this.bname(b.t), ...this.locOf(b), valid: () => this.chains.get(bi)?.kind === kind })) st.reported = true;
      }
    }
    // abgerissene Gebäude still vergessen (das ist keine Entwarnung)
    for (const id of [...this.chains.keys()]) {
      if (!seen.has(id)) {
        this.chains.delete(id);
        this.chainWatch.delete(id);
      }
    }
    let reported = 0;
    for (const c of this.chains.values()) if (c.reported) reported++;
    if (reported > 0) this.chainEver = true;
    else if (this.chainEver) {
      // alle gemeldeten Stillstände sind vorbei: Entwarnung, wenn sie sich wirklich gelöst haben
      if (!this.chainResolved) this.chainEver = false;
      else if (this.offer('chain.recovered', 'chain.recovered', tick, {}, {})) {
        this.chainEver = false;
        this.chainResolved = false;
      }
    }
  }

  // ----- Beliebtheit -----

  private popCause(ex: PopExplain): 'tax' | 'ration' | 'crowd' | 'bad' | 'events' | 'other' {
    const k = ex.mainNegative?.key;
    return k === 'tax' || k === 'ration' || k === 'crowd' || k === 'bad' || k === 'events' ? k : 'other';
  }

  private popularity(view: PlayerView, tick: number): void {
    const ex = explainPopularity(view);
    if (ex.pending) return;
    const lang = this.lang;
    const cause = this.popCause(ex);
    const loc = this.locOf(this.keep());
    const pop = Math.round(ex.popularity);
    if (view.peasants > 0 && ex.popularity < ex.threshold) {
      if (this.pop !== 'leaving' && this.offer(`pop.leaving.${cause}`, 'pop.leaving', tick, { pop, seconds: ex.leaving.secondsPerPeasant }, { ...loc, valid: () => !!this.view && this.view.popularity < ex.threshold + 4 })) {
        this.pop = 'leaving';
        this.popAnnounced = true;
      }
      return;
    }
    if (this.pop === 'leaving') {
      if (ex.popularity < ex.threshold + 4) return;
      this.pop = 'ok';
    }
    const dangerous = ex.direction === 'down' && ex.perMonth <= -1.5 && ex.secondsToThreshold !== null && ex.secondsToThreshold <= 180 && !view.foodShort;
    if (this.pop === 'ok' && dangerous) {
      if (this.offer(`pop.falling.${cause}`, 'pop.falling', tick, { pop, time: popDuration(ex.secondsToThreshold ?? 0, lang), threshold: ex.threshold }, { ...loc, valid: () => this.pop === 'falling' })) {
        this.pop = 'falling';
        this.popAnnounced = true;
      }
    } else if (this.pop === 'falling' && (ex.perMonth > -0.5 || ex.secondsToThreshold === null || ex.secondsToThreshold > 360)) {
      this.pop = 'ok';
    }
    if (this.pop === 'ok' && this.popAnnounced && ex.perMonth >= 0 && ex.popularity >= ex.threshold + 4) {
      if (this.offer('pop.recovered', 'pop.recovered', tick, { pop: popNum(ex.popularity, false, lang) }, loc)) this.popAnnounced = false;
    }
  }

  // ----- Militär -----

  private military(view: PlayerView, tick: number): void {
    const w = this.world;
    const me = this.me();
    const keep = this.keep();
    if (!keep) return;
    const team = this.teamOf();
    const myTeam = team[me] ?? 0;
    const near = new Map<number, { n: number; x: number; y: number }>();
    const far = new Map<number, { n: number; min: number; x: number; y: number }>();
    const siege = new Map<number, Set<number>>();
    const mine = this.own();
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s]) continue;
      const t = w.type[s];
      if (t === U.Peasant || t === U.Ox) continue;
      const o = w.owner[s];
      if ((team[o] ?? -1) === myTeam || w.flags[s] & 8) continue;
      const x = w.curX[s];
      const y = w.curY[s];
      const d = Math.hypot(x - keep.x, y - keep.y);
      if (d > SIEGE_RADIUS) continue;
      // Gegner nahe der eigenen Burg gelten nicht als anrückend
      const ek = w.players[o];
      if (ek && Math.hypot(x - ek.keepX, y - ek.keepY) < HOME_RADIUS) continue;
      const u = UNITS[t];
      if (u && (u.siege || u.towerBridge)) {
        const set = siege.get(o) ?? new Set<number>();
        set.add(t);
        siege.set(o, set);
      }
      let isNear = d < ATTACK_RADIUS;
      if (!isNear && d < 100) {
        for (const b of mine) {
          if (Math.abs(b.x - x) < 9 && Math.abs(b.y - y) < 9) {
            isNear = true;
            break;
          }
        }
      }
      if (isNear) {
        const e = near.get(o) ?? { n: 0, x: 0, y: 0 };
        e.n++;
        e.x += x;
        e.y += y;
        near.set(o, e);
      } else if (d < APPROACH_RADIUS) {
        const e = far.get(o) ?? { n: 0, min: Infinity, x: 0, y: 0 };
        e.n++;
        e.x += x;
        e.y += y;
        e.min = Math.min(e.min, d);
        far.set(o, e);
      }
    }
    // Angriff
    for (const [o, e] of near) {
      if (e.n < 2) continue;
      const name = w.players[o]?.name ?? 'Feind';
      const st = this.attacks.get(o) ?? { active: false, n: 0, lastNear: tick };
      st.lastNear = tick;
      const at = { x: e.x / e.n, y: e.y / e.n };
      if (!st.active) {
        if (this.offer('enemy.attack', `attack:${o}`, tick, { name, n: e.n }, { ...at, valid: () => this.attacks.get(o)?.active === true })) {
          st.active = true;
          st.n = e.n;
        }
      } else if (e.n >= Math.max(st.n * 1.6, st.n + 6)) {
        if (this.offer('enemy.attack.grow', `attack.grow:${o}`, tick, { name, n: e.n }, at)) st.n = e.n;
      }
      this.attacks.set(o, st);
    }
    for (const [o, st] of this.attacks) if (!near.has(o) && tick - st.lastNear > 300) this.attacks.delete(o);
    // Anrückende Feinde
    for (const [o, e] of far) {
      if (e.n < APPROACH_MIN || this.attacks.get(o)?.active) continue;
      const name = w.players[o]?.name ?? 'Feind';
      const st = this.approaches.get(o) ?? { active: false, n: 0, lastSeen: tick };
      st.lastSeen = tick;
      if (!st.active) {
        const dist = Math.max(5, Math.round(e.min / 5) * 5);
        if (this.offer('enemy.approach', `approach:${o}`, tick, { name, n: e.n, dist }, { x: e.x / e.n, y: e.y / e.n, valid: () => this.approaches.get(o)?.active === true })) {
          st.active = true;
          st.n = e.n;
        }
      }
      this.approaches.set(o, st);
    }
    for (const [o, st] of this.approaches) if (!far.has(o) && tick - st.lastSeen > 600) this.approaches.delete(o);
    // Belagerungsgerät
    for (const [o, set] of siege) {
      const fresh: string[] = [];
      for (const t of set) {
        const key = `${o}:${t}`;
        const prev = this.sieges.get(key);
        if (prev === undefined || tick - prev > 1200) fresh.push(UNITS[t].name);
        this.sieges.set(key, tick);
      }
      if (fresh.length) {
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let s = 0; s < w.top; s++) {
          if (!w.ids[s] || w.owner[s] !== o) continue;
          const u = UNITS[w.type[s]];
          if (u && (u.siege || u.towerBridge)) {
            sx += w.curX[s];
            sy += w.curY[s];
            n++;
          }
        }
        if (!this.offer('siege.sighted', `siege:${o}`, tick, { what: joinList(fresh, this.lang === 'de' ? 'und' : 'and') }, n ? { x: sx / n, y: sy / n } : {})) for (const t of set) this.sieges.delete(`${o}:${t}`);
      }
    }
    // Bergfried unter Beschuss
    const kb = this.firstOf(BT.Keep);
    if (kb) {
      const max = BUILDINGS[BT.Keep].hp;
      const pct = Math.round((kb.hp / max) * 100);
      const dropping = this.keepHp >= 0 && kb.hp < this.keepHp - max * 0.03;
      this.keepHp = kb.hp;
      if (pct > 90) this.keepLevel = 100;
      for (const lv of [40, 75]) {
        if (pct < lv && this.keepLevel > lv && (dropping || this.enemyNear(keep.x, keep.y, ATTACK_RADIUS, 2) >= 2)) {
          if (this.offer('keep.hurt', `keep:${lv}`, tick, { pct }, { x: kb.x + kb.w / 2, y: kb.y + kb.h / 2, building: kb.i })) this.keepLevel = lv;
          break;
        }
      }
    }
    // Lord in Gefahr
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s] || w.type[s] !== U.Lord || w.owner[s] !== me) continue;
      const x = w.curX[s];
      const y = w.curY[s];
      const hurt = w.hp[s] < 130;
      if (hurt || this.enemyNear(x, y, 7, 2) >= 2) this.offer(hurt ? 'lord.hurt' : 'lord.danger', 'lord', tick, {}, { x, y });
    }
    // Hilferufe von Verbündeten
    if (view.aid.length > this.aidSeen) {
      for (let i = this.aidSeen; i < view.aid.length; i++) {
        const a = view.aid[i];
        const p = w.players[a.from];
        this.offer('aid.request', `aid:${a.from}`, tick, { name: p?.name ?? (this.lang === 'de' ? 'Ein Verbündeter' : 'An ally') }, p ? { x: p.keepX, y: p.keepY } : {});
      }
    }
    this.aidSeen = view.aid.length;
    // Heer
    this.army(view, tick, keep);
  }

  private army(view: PlayerView, tick: number, keep: { x: number; y: number }): void {
    const t = view.troops;
    let level = -1;
    for (let i = 0; i < ARMY_MARKS.length; i++) if (t >= ARMY_MARKS[i]) level = i;
    // Beim ersten Blick gelten bestehende Stände (z. B. nach dem Laden) als bekannt
    if (this.armyMark === -2) this.armyMark = level;
    if (level > this.armyMark) {
      if (this.offer('army.ready', `army.ready:${level}`, tick, { n: t }, { x: keep.x, y: keep.y })) this.armyMark = level;
    } else if (level < this.armyMark && (level < 0 || t < ARMY_MARKS[this.armyMark] * 0.6)) this.armyMark = level;
    if (view.troopLimit > 0 && t >= view.troopLimit && !this.armyLimit) {
      if (this.offer('army.limit', 'army.limit', tick, { n: t, limit: view.troopLimit }, { x: keep.x, y: keep.y })) this.armyLimit = true;
    } else if (t < view.troopLimit * 0.9) this.armyLimit = false;
  }

  // ----- Entwicklung -----

  private development(view: PlayerView, tick: number): void {
    const n = view.peasants;
    let level = -1;
    for (let i = 0; i < PEASANT_MARKS.length; i++) if (n >= PEASANT_MARKS[i]) level = i;
    if (this.peasantMark === -2) this.peasantMark = level;
    if (level > this.peasantMark) {
      if (view.popularity >= 50 && this.offer('dev.grow', `dev.grow:${level}`, tick, { n }, this.locOf(this.keep()))) this.peasantMark = level;
    } else if (level < this.peasantMark && (level < 0 || n < PEASANT_MARKS[this.peasantMark] * 0.7)) this.peasantMark = level;
  }
}

/** Abklingzeit roher Meldungen (Ticks) */
const RAW_COOLDOWN: Record<string, number> = { attack: 250, breach: 150, lord: 300, aid: 100 };

// ============================================================================================================
// Panel
// ============================================================================================================

export interface AdvisorPanelHooks {
  /** Kamera zum Ort springen (und ggf. Gebäude anwählen) */
  onJump: (x: number, y: number, building?: number) => void;
  /** letzten Hinweis erneut abspielen (bzw. anzeigen) */
  onReplay: () => void;
  speechOn: () => boolean;
  toggleSpeech: () => void;
}

/** Meldungsliste oben rechts (anklickbar) mit dem Berater-Porträt, Wiederholen und Sprachschalter */
export class AdvisorPanel {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private face: HTMLElement;
  private speechBtn: HTMLElement;
  private open = true;

  constructor(
    parent: HTMLElement,
    private logic: AdvisorLogic,
    private hooks: AdvisorPanelHooks,
    private tickNow: () => number,
  ) {
    this.face = h('div', { class: 'adv-face', html: ADVISOR_FACE });
    this.listEl = h('div', { class: 'adv-list' });
    const replay = h('button', { class: 'adv-btn', title: 'Letzten Hinweis erneut abspielen', 'aria-label': 'Letzten Hinweis erneut abspielen', onclick: (e) => { e.stopPropagation(); this.hooks.onReplay(); } });
    replay.append(iconEl(toolIcon('rotate', 16)));
    this.speechBtn = h('button', { class: 'adv-btn', onclick: (e) => { e.stopPropagation(); this.hooks.toggleSpeech(); this.syncSpeech(); } });
    const head = h('div', { class: 'adv-head', title: 'Meldungsliste ein-/ausklappen', onclick: () => this.toggle() }, this.face, h('span', { class: 'adv-name', text: ADVISOR_NAME }), h('span', { class: 'spacer' }), this.speechBtn, replay);
    this.root = h('div', { class: 'panel pp advisor' }, head, this.listEl);
    attachTooltip(replay, () => `Letzten Hinweis erneut abspielen (${keyLabel(loadHotkeys().advisorReplay)})`, { placement: 'element' });
    attachTooltip(this.speechBtn, () => (this.hooks.speechOn() ? 'Berater spricht – Klick: Sprache aus (Text bleibt)' : 'Berater schweigt – Klick: Sprache an'), { placement: 'element' });
    parent.append(this.root);
    this.syncSpeech();
    this.render();
  }

  /** Sprachschalter-Symbol an den Zustand anpassen */
  syncSpeech(): void {
    const on = this.hooks.speechOn();
    clear(this.speechBtn);
    this.speechBtn.append(iconEl(toolIcon(on ? 'sound' : 'mute', 16)));
    this.speechBtn.classList.toggle('off', !on);
    this.speechBtn.setAttribute('aria-label', on ? 'Berater spricht' : 'Berater schweigt');
    this.speechBtn.setAttribute('aria-pressed', String(on));
  }

  toggle(): void {
    this.open = !this.open;
    this.root.classList.toggle('closed', !this.open);
  }

  notify(): void {
    this.face.classList.remove('speak');
    void this.face.offsetWidth;
    this.face.classList.add('speak');
    this.render();
  }

  private sig = '';
  private timeEls: { el: HTMLElement; tick: number }[] = [];

  private ageText(tick: number): string {
    const age = Math.max(0, Math.round((this.tickNow() - tick) / 10));
    return age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`;
  }

  /** Liste neu aufbauen, wenn sich Meldungen ändern; sonst nur die Altersangaben auffrischen (kein Neuaufbau unter dem Mauszeiger) */
  render(): void {
    const shown = this.logic.list.slice(-8).reverse();
    const sig = shown.map((m) => `${m.id}${m.read ? 'r' : ''}`).join(',');
    if (sig === this.sig && this.timeEls.length === shown.length) {
      for (const t of this.timeEls) t.el.textContent = this.ageText(t.tick);
      return;
    }
    this.sig = sig;
    this.timeEls = [];
    clear(this.listEl);
    if (!shown.length) this.listEl.append(h('div', { class: 'crumb', text: 'Keine Meldungen. Leertaste springt zur letzten Meldung.' }));
    for (const m of shown) {
      const go = m.x !== undefined && m.y !== undefined;
      const time = h('span', { class: 'adv-time', text: this.ageText(m.tick) });
      this.timeEls.push({ el: time, tick: m.tick });
      const el = h(
        'div',
        {
          class: `adv-msg ${m.kind} p${m.prio}${m.read ? ' read' : ''}${go ? ' go' : ''}`,
          title: go ? 'Klick: Kamera dorthin' : '',
          onclick: () => {
            m.read = true;
            if (go) this.hooks.onJump(m.x as number, m.y as number, m.building);
            this.render();
          },
        },
        time,
        h('span', { class: 'adv-text', text: m.text }),
      );
      this.listEl.append(el);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}

/** Eigenes Porträt des Beraters (Turban, Bart, Schriftrolle) als Low-Poly-SVG */
const ADVISOR_FACE = `<svg viewBox="0 0 64 64" width="38" height="38" xmlns="http://www.w3.org/2000/svg"><g stroke="#241a12" stroke-width="2.4" stroke-linejoin="round">
<polygon points="32,6 50,16 52,26 12,26 14,16" fill="#3f6fa8"/><polygon points="32,6 50,16 32,20" fill="#5c8fcf"/><polygon points="32,6 14,16 32,20" fill="#2f5688"/>
<polygon points="14,26 52,26 50,44 32,56 16,44" fill="#d9a877"/><polygon points="32,26 52,26 50,44 32,56" fill="#c4915f"/>
<polygon points="16,40 32,58 48,40 44,52 32,60 20,52" fill="#5a4032"/>
<polygon points="20,32 28,32 28,36 20,36" fill="#fff" /><polygon points="36,32 44,32 44,36 36,36" fill="#fff"/><rect x="23" y="32" width="3" height="4" fill="#241a12" stroke="none"/><rect x="38" y="32" width="3" height="4" fill="#241a12" stroke="none"/>
<polygon points="30,40 34,40 33,46 31,46" fill="#b4784a"/>
<polygon points="29,12 35,12 34,19 30,19" fill="#f0c040"/></g></svg>`;

