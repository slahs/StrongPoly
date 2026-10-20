import { AiProfile } from '../../data/ai';
import { RATION_FOOD } from '../../data/balance';
import { BT, BUILDINGS } from '../../data/buildings';
import { R, RES_INFO } from '../../data/resources';
import { T } from '../../data/terrain';
import { A, U, UNITS } from '../../data/units';
import type { Building } from '../building';
import type { Sim } from '../sim';
import { S } from '../unitstore';
import { Stance } from '../types';
import { applyCommand } from '../commands';
import { findSpot, SpotRules } from './spots';

type Counts = Record<number, number>;

interface PlanStep {
  type: number;
  x: number;
  y: number;
  rot: number;
  done: boolean;
  skip: number;
  /** Zusatzbefehl: 'dig' Rechteck / 'line' */
  kind?: 'place' | 'dig' | 'line';
  x2?: number;
  y2?: number;
}

const ARMY_MIN = U.Archer;

/** Eine KI: baut Burg aus Template, betreibt Wirtschaft, rekrutiert und greift in Wellen an. */
/** Ab diesem Tick (40 Min) greift jede KI mit voller Aggression an, damit Partien nicht im Patt enden */
const LATE_GAME = 40 * 600;
/** Obergrenze Belagerungsgerät pro Welle */
const MAX_SIEGE_PER_WAVE = 6;

export class AiController {
  readonly kx: number;
  readonly ky: number;
  /** Himmelsrichtung zum Gegner: 0 N(-y), 1 E(+x), 2 S(+y), 3 W(-x) */
  readonly side: number;
  private task = 0;
  private plan: PlanStep[] | null = null;
  private planIdx = 0;
  private counts: Counts = {};
  wave = { phase: 0, index: 0, start: 0, ids: [] as number[], target: -1, nextAt: 0, stage: { x: 0, y: 0 }, launched: 0, siegeTargets: [] as number[] };
  private garrisonIds = new Set<number>();
  private lastThreat = 0;
  private buildFail = new Map<number, number>();
  cpuTicks = 0;
  difficulty: number;
  private castleDone = false;
  private retryAt = 0;
  private woodCheckAt = 0;

  constructor(
    sim: Sim,
    readonly p: number,
    readonly profile: AiProfile,
    difficulty: number,
  ) {
    this.difficulty = difficulty;
    const st = sim.map.starts[p];
    this.kx = st.x;
    this.ky = st.y;
    // Seite zur Kartenmitte (dort wird der Feind vermutet)
    const dx = sim.map.w / 2 - st.x;
    const dy = sim.map.h / 2 - st.y;
    this.side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    this.wave.nextAt = profile.army.firstAttack;
  }

  update(sim: Sim): void {
    // alle 5 Ticks eine Aufgabe, KIs gegeneinander versetzt
    if ((sim.tick + this.p * 2) % 5 !== 0) return;
    const pl = sim.players[this.p];
    const tasks = [
      () => this.econStep(sim),
      () => this.castleStep(sim),
      () => this.recruitStep(sim),
      () => this.defenseStep(sim),
      () => this.waveStep(sim),
      () => this.upkeepStep(sim),
      () => this.abilityStep(sim),
    ];
    this.task = (this.task + 1) % tasks.length;
    if (this.task === 0) this.countBuildings(sim);
    if (!pl.alive) return;
    tasks[this.task]();
  }

  saveState(): {
    task: number;
    plan: PlanStep[] | null;
    wave: AiController['wave'];
    garrison: number[];
    lastThreat: number;
    buildFail: [number, number][];
    castleDone: boolean;
    retryAt: number;
  } {
    return {
      task: this.task,
      plan: this.plan ? this.plan.map((p) => ({ ...p })) : null,
      wave: JSON.parse(JSON.stringify(this.wave)),
      garrison: [...this.garrisonIds],
      lastThreat: this.lastThreat,
      buildFail: [...this.buildFail.entries()],
      castleDone: this.castleDone,
      retryAt: this.retryAt,
    };
  }

  loadState(s: ReturnType<AiController['saveState']>): void {
    this.task = s.task;
    this.plan = s.plan ? s.plan.map((p) => ({ ...p })) : null;
    this.wave = JSON.parse(JSON.stringify(s.wave));
    this.garrisonIds = new Set(s.garrison);
    this.lastThreat = s.lastThreat;
    this.buildFail = new Map(s.buildFail);
    this.castleDone = s.castleDone;
    this.retryAt = s.retryAt;
  }

  // ------------------------------------------------------------------
  private countBuildings(sim: Sim): void {
    const c: Counts = {};
    for (const b of sim.buildings.values()) if (b.owner === this.p) c[b.type] = (c[b.type] ?? 0) + 1;
    this.counts = c;
  }
  private cnt(t: number): number {
    return this.counts[t] ?? 0;
  }

  private rules(extra: Partial<SpotRules> = {}): SpotRules {
    return { kx: this.kx, ky: this.ky, ring: this.profile.castle.ring, ...extra };
  }

  /** Versucht, ein Gebäude zu bauen. Rückgabe: true = gebaut oder wartet auf Geld (Abbruch der Planung). */
  private tryBuild(sim: Sim, type: number, anchor?: { x: number; y: number }, extra: Partial<SpotRules> = {}): 'built' | 'poor' | 'nospot' {
    const def = BUILDINGS[type];
    if (!sim.canAfford(this.p, def.cost)) return 'poor';
    const failAt = this.buildFail.get(type) ?? -1;
    if (failAt > sim.tick) return 'nospot';
    const ax = anchor?.x ?? this.kx;
    const ay = anchor?.y ?? this.ky;
    let spot = findSpot(sim, this.p, type, ax, ay, this.rules({ ...extra }));
    if (!spot && !extra.outside) spot = findSpot(sim, this.p, type, ax, ay, this.rules({ ...extra, inside: false, outside: true }));
    if (!spot) {
      this.buildFail.set(type, sim.tick + 1200);
      return 'nospot';
    }
    const b = sim.place(this.p, type, spot.x, spot.y, 0);
    if (b) {
      this.counts[type] = (this.counts[type] ?? 0) + 1;
      return 'built';
    }
    this.buildFail.set(type, sim.tick + 600);
    return 'nospot';
  }

  /** Ort eines Vorkommens (Terrain) nahe der Burg */
  private depositAnchor(sim: Sim, terrain: number): { x: number; y: number } | null {
    const m = sim.map;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let y = Math.max(0, this.ky - 36); y < Math.min(m.h, this.ky + 36); y++)
      for (let x = Math.max(0, this.kx - 36); x < Math.min(m.w, this.kx + 36); x++) {
        if (m.terrain[m.idx(x, y)] !== terrain) continue;
        const d = (x - this.kx) ** 2 + (y - this.ky) ** 2;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    return best;
  }

  // ---------------- Wirtschaft ----------------
  private foodCapacity(): number {
    const c = (t: number) => this.cnt(t);
    const chain = Math.min(c(BT.WheatFarm), c(BT.Mill), c(BT.Bakery));
    return c(BT.AppleOrchard) * 10 + c(BT.DairyFarm) * 9 + c(BT.HunterPost) * 7 + chain * 10.9;
  }

  private usesIron(): boolean {
    return this.profile.army.units.some(([u]) => UNITS[u].cost.res?.some(([r]) => r === R.Mace || r === R.Sword || r === R.Armor));
  }
  private wantsUnit(...types: number[]): boolean {
    return this.profile.army.units.some(([u]) => types.includes(u));
  }

  private econStep(sim: Sim): void {
    const pl = sim.players[this.p];
    const pr = this.profile;
    const c = (t: number) => this.cnt(t);
    const t = sim.tick;
    // Steuern & Rationen
    pl.tax = pl.popularity > 75 ? Math.min(pr.econ.tax + 2, 5) : pl.popularity > 58 ? pr.econ.tax : pl.popularity > 45 ? 0 : -1;
    // Geldnot: Steuern anheben, solange die Beliebtheit es trägt (sonst bleibt die Armee klein)
    // (unter 50 Beliebtheit wandern Bauern ab und keine kommen nach: nie darunter drücken)
    if (pl.gold < 200 && pl.popularity > 56) pl.tax = Math.max(pl.tax, 1);
    if (pl.gold < 80 && pl.popularity > 62) pl.tax = Math.max(pl.tax, 2);
    if (pl.popularity < 52 && pl.peasants < pl.housing * 0.6) pl.tax = Math.min(pl.tax, -1);
    pl.ration = pl.foodShort ? 1 : pl.popularity < 50 ? 3 : 2;

    const peas = pl.peasants;
    // Die Bevölkerung wächst mit der Spieldauer (mehr Steuern und Arbeiter, sonst erstarrt die Partie),
    // aber nur, solange die Nahrung mithält (sonst Hunger -> Beliebtheit < 50 -> Abwanderungs-Schaukel)
    const foodOk = !pl.foodShort && this.foodCapacity() >= peas * RATION_FOOD[2] * 1.7 * pr.econ.food + 8;
    const housingWant = Math.ceil((pr.econ.peasants - 8) / 8) + (foodOk ? Math.min(6, Math.floor(sim.tick / 9000)) : 0);
    const sequence: [number, number, boolean?][] = [];
    const add = (type: number, target: number, cond = true) => sequence.push([type, target, cond]);

    add(BT.Woodcutter, 1);
    add(BT.AppleOrchard, 1);
    add(BT.Quarry, 1);
    add(BT.OxTether, 1, c(BT.Quarry) > 0);
    add(BT.Hovel, Math.min(housingWant, 4), peas >= pl.housing - 4);
    add(BT.Woodcutter, Math.min(2, pr.econ.wood));
    add(BT.AppleOrchard, 2);
    // Nahrung nach Bedarf
    const foodNeed = peas * RATION_FOOD[2] * 1.7 * pr.econ.food + 8;
    const food0 = pl.stock[R.Apple] + pl.stock[R.Cheese] + pl.stock[R.Meat] + pl.stock[R.Bread];
    if (this.foodCapacity() < foodNeed || pl.foodShort || food0 < 30) {
      add(BT.AppleOrchard, 4);
      add(BT.HunterPost, 3);
      add(BT.DairyFarm, 1);
      add(BT.HunterPost, 6);
      add(BT.WheatFarm, 1);
      add(BT.Mill, 1, c(BT.WheatFarm) > 0);
      add(BT.Bakery, 1, c(BT.Mill) > 0);
      add(BT.WheatFarm, 3);
      add(BT.Mill, 2, c(BT.WheatFarm) > 2);
      add(BT.Bakery, 2, c(BT.Mill) > 1);
    }
    add(BT.Hovel, housingWant, peas >= pl.housing - 6);
    add(BT.Woodcutter, pr.econ.wood + (pl.stock[R.Wood] < 40 ? 2 : 0) + (t > 6000 && pl.stock[R.Wood] < 150 ? 1 : 0));
    add(BT.Quarry, pr.econ.stone, t > 1500);
    add(BT.Well, 1, c(BT.Hovel) >= 3);
    // Militärbasis (Waffenbau wächst mit der Spieldauer, sonst bleibt die Armee klein)
    const wood = pl.stock[R.Wood];
    const wk = t > 20000 && wood > 220 ? 3 : t > 9000 && wood > 120 ? 2 : 1;
    add(BT.Armory, 1, t > 2400 || peas > 14);
    add(BT.Barracks, 1, c(BT.Armory) > 0);
    if (this.wantsUnit(U.Archer, U.Crossbowman)) add(BT.Fletcher, wk, c(BT.Barracks) > 0);
    if (this.wantsUnit(U.Spearman, U.Pikeman)) add(BT.Poleturner, wk, c(BT.Barracks) > 0);
    // Eisen wächst mit den Werkstätten mit (Schmied + Plattner brauchen 2–3 Eisen je Stück)
    if (this.usesIron()) add(BT.IronMine, pr.econ.iron + (wk - 1), c(BT.Barracks) > 0);
    if (this.wantsUnit(U.Maceman, U.Swordsman, U.Knight)) add(BT.Blacksmith, wk, c(BT.IronMine) > 0);
    if (this.wantsUnit(U.Maceman)) {
      add(BT.DairyFarm, 1);
      add(BT.Tanner, 1, c(BT.DairyFarm) > 0);
    }
    if (this.wantsUnit(U.Swordsman, U.Pikeman, U.Knight)) add(BT.Armorer, wk, c(BT.IronMine) > 0);
    if (this.wantsUnit(U.Knight)) add(BT.Stable, 1, c(BT.Barracks) > 0);
    if (pr.army.units.some(([u]) => UNITS[u].producer === 'merc')) add(BT.MercPost, 1, t > 1200);
    if (this.doctrine().siege.length) add(BT.EngineerGuild, 1, t > 5 * 600);
    if (pr.econ.pitch) add(BT.PitchRig, pr.econ.pitch, t > 3000);
    else if (pr.castle.cauldrons || pr.castle.killingPits) add(BT.PitchRig, 1, t > 4000);
    // Komfort
    // Profile ohne Markt bauen ihn trotzdem, wenn das Gold ausgeht (Überschuss verkaufen statt Stillstand)
    if (pr.econ.market || (t > 12000 && pl.gold < 120)) add(BT.Market, 1, t > 3000);
    if (pr.econ.ale) {
      add(BT.HopFarm, 1, peas > 20);
      add(BT.Brewery, 1, c(BT.HopFarm) > 0);
      add(BT.Inn, 1, c(BT.Brewery) > 0);
    }
    if (pr.econ.religion >= 1) add(BT.Chapel, 1, peas > 20);
    if (pr.econ.religion >= 2) add(BT.Church, 1, peas > 30);
    if (pr.econ.religion >= 3) add(BT.Cathedral, 1, peas > 45);
    if (pr.econ.goodThings) add(BT.Garden, pr.econ.goodThings, peas > 25);
    if (pr.econ.goodThings > 2) add(BT.Statue, 1, peas > 35);
    if (pr.econ.badThings) add(BT.Gallows, pr.econ.badThings, peas > 25);
    add(BT.IronMine, 1, this.usesIron() && peas > 25);
    add(BT.Hovel, housingWant + 2, peas >= pl.housing - 2);
    add(BT.Barracks, 2, c(BT.Barracks) > 0 && pl.troops > 60);

    // Lager erweitern, sobald eine Ware die Kapazität fast erreicht
    const nearFull = (kind: 'stock' | 'granary' | 'armory'): boolean => {
      for (let r = 0; r < pl.stock.length; r++) if (RES_INFO[r].store === kind && pl.stock[r] > pl.cap[kind] * 0.85) return true;
      return false;
    };
    for (const [kind, type] of [['stock', BT.Stockpile], ['granary', BT.Granary], ['armory', BT.Armory]] as ['stock' | 'granary' | 'armory', number][]) {
      if (pl.cap[kind] && nearFull(kind)) {
        const st = this.anyBuilding(sim, type);
        if (st && this.tryBuild(sim, type, { x: st.cx, y: st.cy }) === 'built') return;
      }
    }

    let poor = 0;
    const stoneReserve = this.castlePending() > 0.3 && pl.stock[R.Stone] < 250;
    for (const [type, target, cond] of sequence) {
      if (!cond || c(type) >= target) continue;
      // Stein gehört zuerst der Burg
      if (stoneReserve && (BUILDINGS[type].religion || type === BT.Statue || type === BT.Dungeon || type === BT.Well)) continue;
      let anchor: { x: number; y: number } | undefined;
      const def = BUILDINGS[type];
      if (def.placement === 'deposit' && def.terrain !== undefined) {
        const a = this.depositAnchor(sim, def.terrain);
        if (!a) continue;
        anchor = a;
      } else if (def.placement === 'fertile') {
        anchor = this.depositAnchor(sim, T.Oasis) ?? undefined;
      } else if (type === BT.Woodcutter) {
        // dorthin, wo noch Wald steht (der Burgbereich ist baumfrei)
        const a = this.treeAnchor(sim);
        if (!a) continue;
        anchor = a;
      } else if (type === BT.OxTether) {
        const q = this.anyBuilding(sim, BT.Quarry);
        if (q) anchor = { x: q.cx, y: q.cy };
      }
      const inside = !def.placement || def.placement === 'flat';
      const res = this.tryBuild(sim, type, anchor, { inside: inside && type !== BT.Hovel ? undefined : undefined });
      if (res === 'built') return;
      if (res === 'poor' && ++poor >= 3) return;
    }
    // Waffenproduktion lenken
    this.steerRecipes(sim);
  }

  private treeCache = { tick: -1e9, at: null as { x: number; y: number } | null };

  /** Bäume im Arbeitsradius eines Holzfällers (wie findTree: Quadrat um die Mitte) */
  private treesAround(sim: Sim, cx: number, cy: number, r = 14): number {
    const m = sim.map;
    let n = 0;
    for (let y = Math.max(0, cy - r); y <= Math.min(m.h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(m.w - 1, cx + r); x++) if (m.trees[y * m.w + x]) n++;
    return n;
  }

  /** Mittelpunkt des dichtesten erreichbaren Waldstücks nahe der Burg (grobes 4er-Raster, 5 s gecacht) */
  private treeAnchor(sim: Sim): { x: number; y: number } | null {
    if (sim.tick - this.treeCache.tick < 50) return this.treeCache.at;
    const m = sim.map;
    const C = 4;
    const R = 48;
    const x0 = Math.max(0, this.kx - R);
    const y0 = Math.max(0, this.ky - R);
    const cw = Math.ceil((Math.min(m.w, this.kx + R) - x0) / C);
    const ch = Math.ceil((Math.min(m.h, this.ky + R) - y0) / C);
    const cells = new Int32Array(cw * ch);
    for (let y = y0; y < Math.min(m.h, y0 + ch * C); y++)
      for (let x = x0; x < Math.min(m.w, x0 + cw * C); x++) if (m.trees[y * m.w + x]) cells[((y - y0) / C | 0) * cw + ((x - x0) / C | 0)]++;
    const wcs: Building[] = [];
    for (const b of sim.buildings.values()) if (b.owner === this.p && b.type === BT.Woodcutter) wcs.push(b);
    let best: { x: number; y: number } | null = null;
    let bs = 0;
    for (let cy = 0; cy < ch; cy++)
      for (let cx = 0; cx < cw; cx++) {
        let sum = 0;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const xx = cx + dx;
            const yy = cy + dy;
            if (xx >= 0 && yy >= 0 && xx < cw && yy < ch) sum += cells[yy * cw + xx];
          }
        if (sum < 8) continue;
        const px = x0 + cx * C + C / 2;
        const py = y0 + cy * C + C / 2;
        // nah an der Burg bevorzugen, schon bewirtschaftete Stellen meiden
        let score = sum - Math.hypot(px - this.kx, py - this.ky) * 0.6;
        for (const w of wcs) if (Math.hypot(w.cx - px, w.cy - py) < 8) score *= 0.6;
        if (score > bs) {
          bs = score;
          best = { x: px, y: py };
        }
      }
    this.treeCache = { tick: sim.tick, at: best };
    return best;
  }

  /** Abgeholzte Holzfäller abreißen, damit sie neu am Wald entstehen (Arbeiter + halbes Holz zurück) */
  private relocateWoodcutters(sim: Sim): void {
    const dead: number[] = [];
    let alive = 0;
    for (const b of sim.buildings.values()) {
      if (b.owner !== this.p || b.type !== BT.Woodcutter) continue;
      if (this.treesAround(sim, Math.floor(b.cx), Math.floor(b.cy)) < 3) dead.push(b.id);
      else alive++;
    }
    if (!dead.length || !this.treeAnchor(sim)) return;
    applyCommand(sim, this.p, { c: 'demolish', ids: dead });
    this.counts[BT.Woodcutter] = alive;
    this.buildFail.delete(BT.Woodcutter);
  }

  /** Anteil des Burgplans, der noch aussteht (0 = fertig) */
  private castlePending(): number {
    if (!this.plan) return 1;
    let n = 0;
    for (const st of this.plan) if (!st.done && st.kind !== 'dig' && st.kind !== 'line') n++;
    return n / Math.max(1, this.plan.length);
  }

  private anyBuilding(sim: Sim, type: number): Building | null {
    let best: Building | null = null;
    for (const b of sim.buildings.values()) if (b.owner === this.p && b.type === type) best = best ?? b;
    return best;
  }

  /** Waffenbauer produzieren die Waren, die am dringendsten fehlen */
  private steerRecipes(sim: Sim): void {
    const pl = sim.players[this.p];
    const need = (res: number): number => {
      let w = 0;
      for (const [u, weight] of this.profile.army.units) {
        for (const [r] of UNITS[u].cost.res ?? []) if (r === res) w += weight;
      }
      return w;
    };
    // Waren, die das Profil nie verbraucht, nicht herstellen (sonst Holz/Eisen verschwendet)
    const score = (res: number) => (need(res) > 0 ? need(res) * 10 - pl.stock[res] : -1e9);
    for (const b of sim.buildings.values()) {
      if (b.owner !== this.p || !b.def.prod || b.def.prod.recipes.length < 2) continue;
      let best = 0;
      let bs = -1e9;
      b.def.prod.recipes.forEach((r, i) => {
        const s = score(r.out);
        if (s > bs) {
          bs = s;
          best = i;
        }
      });
      if (b.recipe !== best) sim.step_setRecipe(b, best);
    }
  }

  // ---------------- Burg ----------------
  private buildPlan(sim: Sim): PlanStep[] {
    const c = this.profile.castle;
    const r = c.ring;
    const kx = this.kx;
    const ky = this.ky;
    const steps: PlanStep[] = [];
    const push = (type: number, x: number, y: number, rot = 0, kind: PlanStep['kind'] = 'place', x2?: number, y2?: number) =>
      steps.push({ type, x, y, rot, done: false, skip: 0, kind, x2, y2 });
    const gateDef = BUILDINGS[c.gate];
    const sides = c.gates >= 2 ? [this.side, (this.side + 2) % 4] : [this.side];
    // Tore zuerst
    const gateBoxes: { x: number; y: number; w: number; h: number; side: number }[] = [];
    for (const sd of sides) {
      const horizontal = sd === 0 || sd === 2; // N/S: Tor liegt in x-Richtung
      const rot = horizontal ? 0 : 1;
      const gw = horizontal ? gateDef.w : gateDef.h;
      const gd = horizontal ? gateDef.h : gateDef.w;
      let gx: number;
      let gy: number;
      if (horizontal) {
        gx = kx - Math.floor(gw / 2);
        gy = sd === 0 ? ky - r : ky + r - gd + 1;
      } else {
        gy = ky - Math.floor(gw / 2);
        gx = sd === 3 ? kx - r : kx + r - gd + 1;
      }
      push(c.gate, gx, gy, rot);
      gateBoxes.push({ x: gx, y: gy, w: horizontal ? gw : gd, h: horizontal ? gd : gw, side: sd });
    }
    // Ecktürme
    if (c.corner) {
      const td = BUILDINGS[c.corner];
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = kx + sx * r;
        const cy = ky + sy * r;
        push(c.corner, cx - Math.floor(td.w / 2), cy - Math.floor(td.h / 2));
      }
    }
    // Zwischentürme
    if (c.towerEvery > 0) {
      const td = BUILDINGS[c.towerType];
      for (let k = c.towerEvery; k < 2 * r; k += c.towerEvery) {
        for (const sd of [0, 1, 2, 3]) {
          const off = -r + k;
          let tx: number;
          let ty: number;
          if (sd === 0) { tx = kx + off; ty = ky - r; }
          else if (sd === 2) { tx = kx + off; ty = ky + r; }
          else if (sd === 3) { tx = kx - r; ty = ky + off; }
          else { tx = kx + r; ty = ky + off; }
          if (Math.abs(off) <= 3 && (sd === this.side || (c.gates >= 2 && sd === (this.side + 2) % 4))) continue;
          push(c.towerType, tx - Math.floor(td.w / 2), ty - Math.floor(td.h / 2));
        }
      }
    }
    // Kessel neben dem Tor (ersetzen Mauerstücke)
    if (c.cauldrons > 0 && gateBoxes.length) {
      const g = gateBoxes[0];
      const horizontal = g.side === 0 || g.side === 2;
      const ox = horizontal ? 2 : 0;
      const oy = horizontal ? 0 : 2;
      const wallRow = g.side === 0 ? ky - r : g.side === 2 ? ky + r : ky;
      const wallCol = g.side === 3 ? kx - r : g.side === 1 ? kx + r : kx;
      const list: [number, number][] = horizontal
        ? [[g.x - 1, wallRow], [g.x + g.w, wallRow], [g.x - 3, wallRow], [g.x + g.w + 2, wallRow]]
        : [[wallCol, g.y - 1], [wallCol, g.y + g.h], [wallCol, g.y - 3], [wallCol, g.y + g.h + 2]];
      void ox;
      void oy;
      for (let i = 0; i < Math.min(c.cauldrons, list.length); i++) push(BT.Cauldron, list[i][0], list[i][1]);
    }
    // Mauerring (von der Torseite aus gesehen sortiert: Chebyshev-Ring)
    const wallSteps: PlanStep[] = [];
    const ringTiles = (rr: number): [number, number][] => {
      const l: [number, number][] = [];
      for (let y = ky - rr; y <= ky + rr; y++)
        for (let x = kx - rr; x <= kx + rr; x++) if (Math.max(Math.abs(x - kx), Math.abs(y - ky)) === rr) l.push([x, y]);
      return l;
    };
    const gx0 = gateBoxes[0] ? gateBoxes[0].x + gateBoxes[0].w / 2 : kx;
    const gy0 = gateBoxes[0] ? gateBoxes[0].y + gateBoxes[0].h / 2 : ky;
    const tiles = ringTiles(r).sort((a, b) => (a[0] - gx0) ** 2 + (a[1] - gy0) ** 2 - ((b[0] - gx0) ** 2 + (b[1] - gy0) ** 2));
    for (const [x, y] of tiles) wallSteps.push({ type: c.wall, x, y, rot: 0, done: false, skip: 0 });
    steps.push(...wallSteps);
    if (c.doubleWall) {
      for (const [x, y] of ringTiles(r - 1)) steps.push({ type: c.wall, x, y, rot: 0, done: false, skip: 0 });
    }
    // Treppen innen an der Mauer: neben dem Tor und an den Ecken
    if (c.stairs) {
      const inner = r - (c.doubleWall ? 2 : 1);
      const cands: [number, number][] = [];
      for (const sd of sides) {
        const off = 4;
        if (sd === 0) { cands.push([kx - off, ky - inner], [kx + off, ky - inner]); }
        else if (sd === 2) { cands.push([kx - off, ky + inner], [kx + off, ky + inner]); }
        else if (sd === 3) { cands.push([kx - inner, ky - off], [kx - inner, ky + off]); }
        else { cands.push([kx + inner, ky - off], [kx + inner, ky + off]); }
      }
      cands.push([kx - inner + 0, ky - inner + 3], [kx + inner, ky + inner - 3]);
      for (const [x, y] of cands) push(BT.Stairs, x, y);
    }
    // Geschütze auf Ecktürmen
    if (c.turret && c.corner === BT.TowerRound) {
      const td = BUILDINGS[c.corner];
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = kx + sx * r;
        const cy = ky + sy * r;
        push(c.turret === 1 ? BT.TurretBallista : BT.TurretMangonel, cx, cy);
        void td;
      }
    }
    // Graben um die Mauer (mit Damm an den Toren)
    if (c.moat) {
      const o = r + 2;
      const w2 = 2;
      // vier Streifen; bei Tor-Seiten Lücke von 5 Tiles
      const gap = 5;
      const strip = (x1: number, y1: number, x2: number, y2: number) => push(0, x1, y1, 0, 'dig', x2, y2);
      const gs = new Set(sides);
      const half = Math.floor(gap / 2);
      const sideStrip = (sd: number) => {
        if (sd === 0 || sd === 2) {
          const y1 = sd === 0 ? ky - o - w2 + 1 : ky + o;
          const y2 = y1 + w2 - 1;
          if (gs.has(sd)) {
            strip(kx - o - w2, y1, kx - half - 1, y2);
            strip(kx + half + 1, y1, kx + o + w2, y2);
          } else strip(kx - o - w2, y1, kx + o + w2, y2);
        } else {
          const x1 = sd === 3 ? kx - o - w2 + 1 : kx + o;
          const x2 = x1 + w2 - 1;
          if (gs.has(sd)) {
            strip(x1, ky - o, x2, ky - half - 1);
            strip(x1, ky + half + 1, x2, ky + o);
          } else strip(x1, ky - o, x2, ky + o);
        }
      };
      // Nur vor dem Tor: ein Rundumgraben könnte Steinbruch & Co. von der Burg abschneiden
      for (const sd of sides) sideStrip(sd);
    }
    // Fallgruben und Killing Pits vor dem Tor
    if (c.pits || c.killingPits) {
      const g = gateBoxes[0];
      if (g) {
        const horizontal = g.side === 0 || g.side === 2;
        const d = r + (c.moat ? 5 : 3);
        const type = c.killingPits ? BT.KillingPit : BT.Pit;
        for (let k = -2; k <= 2; k += 2) {
          if (horizontal) {
            const y = g.side === 0 ? ky - d - k % 2 : ky + d + k % 2;
            push(type, kx - 2, y, 0, 'line', kx + 2, y);
          } else {
            const x = g.side === 3 ? kx - d : kx + d;
            push(type, x, ky - 2, 0, 'line', x, ky + 2);
          }
          break;
        }
        if (c.pits && c.killingPits) {
          const d2 = d + 2;
          if (horizontal) push(BT.Pit, kx - 3, g.side === 0 ? ky - d2 : ky + d2, 0, 'line', kx + 3, g.side === 0 ? ky - d2 : ky + d2);
          else push(BT.Pit, g.side === 3 ? kx - d2 : kx + d2, ky - 3, 0, 'line', g.side === 3 ? kx - d2 : kx + d2, ky + 3);
        }
      }
    }
    return steps;
  }

  private castleStep(sim: Sim): void {
    const c = this.profile.castle;
    const t = sim.tick;
    if (this.castleDone && t < this.retryAt) return;
    // Burgbau beginnt, wenn die Wirtschaft steht
    const pl = sim.players[this.p];
    if (t < 1500 || (c.wall !== BT.WallWood && this.cnt(BT.Quarry) < 1) || pl.peasants < 12) return;
    if (!this.plan) this.plan = this.buildPlan(sim);
    let placed = 0;
    let pending = 0;
    for (let i = 0; i < this.plan.length && placed < 6; i++) {
      const st = this.plan[i];
      if (st.done) continue;
      pending++;
      const def = BUILDINGS[st.type] ?? null;
      if (st.kind === 'dig') {
        if (t < 6000) continue;
        applyCommand(sim, this.p, { c: 'dig', x1: st.x, y1: st.y, x2: st.x2!, y2: st.y2!, fill: false });
        st.done = true;
        continue;
      }
      if (st.kind === 'line') {
        if (t < 5000 || !def || !sim.canAfford(this.p, def.cost, 3)) continue;
        applyCommand(sim, this.p, { c: 'placeLine', type: st.type, x1: st.x, y1: st.y, x2: st.x2!, y2: st.y2! });
        st.done = true;
        continue;
      }
      if (!def) {
        st.done = true;
        continue;
      }
      // Reihenfolge: Mauern erst nach den Toren (stehen vorn im Plan)
      if (!sim.canAfford(this.p, def.cost)) {
        // Armut: bei teuren Teilen abwarten, bei billigen weiterprobieren
        if (placed === 0) break;
        continue;
      }
      if (def.placement === 'onWall') {
        const err = sim.checkPlace(this.p, st.type, st.x, st.y, 0);
        if (err === null) {
          sim.place(this.p, st.type, st.x, st.y, 0);
          st.done = true;
          placed++;
        } else if (++st.skip > 40) st.done = true;
        continue;
      }
      const err = sim.checkPlace(this.p, st.type, st.x, st.y, st.rot);
      if (err === null) {
        sim.place(this.p, st.type, st.x, st.y, st.rot);
        st.done = true;
        placed++;
        pl.stats.built += 0;
      } else if (err === 'Platz belegt') {
        st.done = true;
      } else if (err === 'Zu wenig Ressourcen') {
        break;
      } else {
        // Bäume/Gelände: später erneut versuchen
        // Tore/Türme sind tragend für den Ring: länger warten, bevor Mauerstücke ihre Stelle füllen
        if (++st.skip > (def.gate ? 120 : 6)) st.done = true;
      }
    }
    if (pending === 0) {
      this.castleDone = true;
      this.retryAt = t + 3000;
      // vergessene Lücken später erneut prüfen
      this.plan = this.buildPlan(sim);
      for (const st of this.plan) if (st.kind === 'dig' || st.kind === 'line') st.done = true;
    }
  }

  /** Mauerkrone-Positionen zur Besatzung (zum Feind hin) */
  private garrisonTiles(sim: Sim): { x: number; y: number }[] {
    const r = this.profile.castle.ring;
    const out: { x: number; y: number }[] = [];
    const kx = this.kx;
    const ky = this.ky;
    for (let k = -r + 1; k < r; k += 2) {
      const cand: [number, number][] = [];
      if (this.side === 0) cand.push([kx + k, ky - r]);
      else if (this.side === 2) cand.push([kx + k, ky + r]);
      else if (this.side === 3) cand.push([kx - r, ky + k]);
      else cand.push([kx + r, ky + k]);
      for (const [x, y] of cand) {
        const b = sim.buildingAtTile(x, y);
        if (b && b.owner === this.p && b.def.wallTop && !b.def.gate) out.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    return out;
  }

  // ---------------- Rekrutierung ----------------
  private armyUnits(sim: Sim): { slots: number[]; counts: Record<number, number> } {
    const u = sim.units;
    const slots: number[] = [];
    const counts: Record<number, number> = {};
    for (let s = 0; s < u.top; s++) {
      if (!u.alive[s] || u.owner[s] !== this.p) continue;
      const t = u.type[s];
      if (t < ARMY_MIN || t === U.Lord) continue;
      slots.push(s);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return { slots, counts };
  }

  private recruitStep(sim: Sim): void {
    const pl = sim.players[this.p];
    const pr = this.profile;
    if (this.cnt(BT.Barracks) === 0 && !pr.army.units.some(([u]) => UNITS[u].producer === 'merc')) return;
    const { counts } = this.armyUnits(sim);
    // Queue-Länge begrenzen
    let queued = 0;
    for (const b of sim.buildings.values()) if (b.owner === this.p) queued += b.queue.length;
    if (queued > 6) return;
    // Belagerungsgerät zählt nicht zur Infanteriestärke (sonst verdrängt es die Soldaten und Wellen starten nie)
    const total = Object.entries(counts).reduce((a, [t, n]) => a + (Number(t) < U.Catapult ? n : 0), 0) + queued;
    const waveTarget = this.waveTarget();
    // Ziel: Welle + Heimwache; Belagerung separat
    const want = waveTarget + pr.castle.garrison + 4;
    // Spezialeinheiten zuerst, wenn die nächste Welle naht
    const special: [number, number][] = [];
    if (pr.army.ladders) special.push([U.Laddermen, pr.army.ladders]);
    if (pr.army.tunnelers) special.push([U.Tunneler, pr.army.tunnelers]);
    if (pr.army.assassins) special.push([U.Assassin, pr.army.assassins]);
    if (pr.army.firethrowers) special.push([U.Firethrower, pr.army.firethrowers]);
    const doc = this.doctrine();
    const siegeWanted = this.siegeWanted(doc.siegePer10, waveTarget);
    const siegeCount = Object.entries(counts).filter(([t]) => Number(t) >= U.Catapult).reduce((a, [, n]) => a + n, 0);
    const nearWave = sim.tick >= this.wave.nextAt - 2400;
    if (nearWave) {
      for (const [type, n] of special) {
        if ((counts[type] ?? 0) < n && this.recruitOne(sim, type)) return;
      }
      if (siegeCount < siegeWanted && doc.siege.length) {
        const pick = doc.siege[(siegeCount + this.wave.index) % doc.siege.length][0];
        if (this.recruitOne(sim, pick)) return;
        // Gold für Belagerungsgerät sparen, statt es in billige Infanterie zu stecken (sonst bricht nie jemand eine Mauer)
        if (pl.gold < UNITS[pick].cost.gold + 20 && this.cnt(BT.EngineerGuild) > 0) return;
      }
    }
    if (total >= want || pl.troops >= sim.troopLimit) return;
    // Zusammensetzung nach Gewichten
    const wsum = pr.army.units.reduce((a, [, w]) => a + w, 0);
    let bestT = -1;
    let bestDef = -1e9;
    for (const [type, w] of pr.army.units) {
      const deficit = (w / wsum) * total - (counts[type] ?? 0) * 1 + w * 0.01;
      const have = -(counts[type] ?? 0) / (w || 1);
      void deficit;
      if (have > bestDef) {
        bestDef = have;
        bestT = type;
      }
    }
    // erste mit Verfügbarkeit probieren (sortiert nach Bedarf)
    const order = [...pr.army.units].sort((a, b) => (counts[a[0]] ?? 0) / a[1] - (counts[b[0]] ?? 0) / b[1]);
    for (const [type] of order) if (this.recruitOne(sim, type)) return;
    void bestT;
  }

  private recruitOne(sim: Sim, type: number): boolean {
    const def = UNITS[type];
    const pl = sim.players[this.p];
    const want = def.producer === 'barracks' ? BT.Barracks : def.producer === 'merc' ? BT.MercPost : BT.EngineerGuild;
    let b: Building | null = null;
    for (const bb of sim.buildings.values()) {
      if (bb.owner === this.p && bb.type === want && (!b || bb.queue.length < b.queue.length)) b = bb;
    }
    if (!b) return false;
    if (pl.gold < def.cost.gold + 20) return false;
    for (const [r, a] of def.cost.res ?? []) if (pl.stock[r] < a) return false;
    if (def.cost.horse && pl.horses < 1) return false;
    const gold0 = pl.gold;
    const q0 = b.queue.length;
    applyCommand(sim, this.p, { c: 'recruit', building: b.id, unit: type, count: 1 });
    return b.queue.length > q0 || pl.gold < gold0;
  }

  // ---------------- Verteidigung ----------------
  private defenseStep(sim: Sim): void {
    const u = sim.units;
    const pl = sim.players[this.p];
    // Bedrohungen im Umkreis der Burg
    let ex = 0;
    let ey = 0;
    let n = 0;
    sim.spatial.query(this.kx, this.ky, 40, (s) => {
      if (!u.alive[s] || !sim.isEnemy(this.p, u.owner[s])) return;
      if (Math.hypot(u.x[s] - this.kx, u.y[s] - this.ky) > 38) return;
      ex += u.x[s];
      ey += u.y[s];
      n++;
    });
    if (n > 0) {
      ex /= n;
      ey /= n;
      this.lastThreat = sim.tick;
      const { slots } = this.armyUnits(sim);
      const def: number[] = [];
      for (const s of slots) {
        if (this.wave.ids.includes(u.id(s)) && this.wave.phase >= 2) continue;
        if (Math.hypot(u.x[s] - this.kx, u.y[s] - this.ky) < 45 && (u.state[s] === S.Idle || u.state[s] === S.Move)) def.push(u.id(s));
      }
      if (def.length) {
        // nur ausrücken, wenn der Feind nahe ist; Fernkämpfer bleiben hinter Mauern
        const near = n > 0 && Math.hypot(ex - this.kx, ey - this.ky) < this.profile.castle.ring + 14;
        if (near) applyCommand(sim, this.p, { c: 'move', units: def, x: ex, y: ey, attack: true });
      }
      // Hilfe rufen, wenn überlegen
      let mine = slots.length;
      if (n > mine * this.profile.aid.request * 0.5 && sim.tick % 100 < 6) {
        for (const o of sim.players) if (o.id !== this.p && o.alive && o.team === pl.team) applyCommand(sim, this.p, { c: 'requestAid', to: o.id });
      }
      mine = 0;
    }
    // Hilferufe Verbündeter
    if (pl.aidRequests.length) {
      const req = pl.aidRequests.shift()!;
      const ally = sim.players[req.from];
      if (ally && ally.alive) {
        const { slots } = this.armyUnits(sim);
        const home = slots.filter((s) => Math.hypot(u.x[s] - this.kx, u.y[s] - this.ky) < 40 && !this.garrisonIds.has(u.id(s)));
        const k = Math.floor(home.length * this.profile.aid.send);
        if (k >= 4) {
          const ids = home.slice(0, k).map((s) => u.id(s));
          applyCommand(sim, this.p, { c: 'move', units: ids, x: ally.id === req.from ? sim.map.starts[req.from].x : 0, y: sim.map.starts[req.from].y, attack: true });
          for (const id of ids) u.stance[u.slot(id)] = Stance.Aggressive;
        }
        if (pl.gold > 900) applyCommand(sim, this.p, { c: 'sendAid', to: req.from, res: -1, amount: 250 });
      }
    }
  }

  // ---------------- Wellen ----------------
  /** Eskalation: scheitern Wellen, rüstet jeder Lord nach (Belagerung, Aggression, kürzere Pausen), damit Partien enden. */
  private doctrine(tick = 0): { siege: [number, number][]; siegePer10: number; aggression: number; interval: number } {
    const a = this.profile.army;
    const i = this.wave.index;
    const siege: [number, number][] = a.siege.length ? a.siege : i >= 1 ? [[U.Ram, 2], [U.Catapult, 1]] : [];
    return {
      siege,
      siegePer10: i >= 1 ? Math.max(a.siegePer10, Math.min(4, 1 + i)) : a.siegePer10,
      aggression: tick > LATE_GAME ? 1 : Math.min(1, a.aggression + 0.1 * i),
      interval: Math.max(1.5 * 600, a.waveInterval * Math.pow(0.85, i) * (tick > LATE_GAME ? 0.6 : 1)),
    };
  }

  /** Wellenstärke: wächst nur bis zur 5. Welle, sonst eilt die Anforderung der Armee davon und die KI greift nie mehr an */
  private waveTarget(): number {
    return this.profile.army.wave + this.profile.army.waveGrow * Math.min(this.wave.index, 5);
  }

  /**
   * Belagerungsgerät je Welle, gedeckelt: ohne Deckel verlangte die Eskalation bis zu ~20 Geräte
   * (4 je 10 Soldaten), das gesparte Gold fehlte der Infanterie und die Welle startete nie.
   */
  private siegeWanted(per10: number, waveTarget: number): number {
    return Math.min(MAX_SIEGE_PER_WAVE, Math.round((per10 * waveTarget) / 10));
  }

  /** Streitkräfte (ohne Lord/Arbeiter) aller Gegner */
  private enemyArmy(sim: Sim): number {
    const u = sim.units;
    let n = 0;
    for (let s = 0; s < u.top; s++) if (u.alive[s] && u.type[s] >= ARMY_MIN && u.type[s] !== U.Lord && sim.isEnemy(this.p, u.owner[s])) n++;
    return n;
  }

  private waveStep(sim: Sim): void {
    const u = sim.units;
    const pr = this.profile;
    const w = this.wave;
    const { slots } = this.armyUnits(sim);
    // Garnison auf die Mauern
    this.garrisonStep(sim, slots);
    const free = slots.filter((s) => !this.garrisonIds.has(u.id(s)));
    const waveTarget = this.waveTarget();
    if (w.phase === 0) {
      // Standby: Zuhause sammeln
      if (sim.tick < w.nextAt) return;
      const strength = free.filter((s) => u.type[s] < U.Catapult).length;
      // Überfällige Welle: nach 5 Minuten Warten reicht die halbe Stärke (kein Dauer-Patt)
      const overdue = sim.tick > w.nextAt + 5 * 600;
      // Gegner geschwächt oder Spätphase: früher losschlagen (kein Dauer-Patt)
      const superior = strength >= 10 && strength >= this.enemyArmy(sim) * 1.6;
      const frac = sim.tick > LATE_GAME ? 0.4 : overdue ? 0.5 : 0.7;
      if (strength < waveTarget * frac && !superior) return;
      // Belagerungsgerät abwarten (max. 3 Minuten Verzögerung)
      const doc = this.doctrine(sim.tick);
      const siegeWant = this.siegeWanted(doc.siegePer10, waveTarget);
      const siegeHave = free.filter((s) => u.type[s] >= U.Catapult).length;
      if (siegeWant > 0 && siegeHave < Math.ceil(siegeWant * 0.6) && sim.tick < w.nextAt + 1800 && doc.siege.length) return;
      const enemy = this.pickEnemy(sim);
      if (enemy < 0) return;
      w.target = enemy;
      const ek = sim.buildings.get(sim.players[enemy].keepId);
      if (!ek) return;
      // Sammelpunkt 24 Tiles vor dem Feind-Keep (auf der eigenen Seite)
      const dx = this.kx - ek.cx;
      const dy = this.ky - ek.cy;
      const d = Math.hypot(dx, dy) || 1;
      w.stage = { x: ek.cx + (dx / d) * Math.min(26, d * 0.5), y: ek.cy + (dy / d) * Math.min(26, d * 0.5) };
      const take = Math.max(8, Math.round(free.length * doc.aggression));
      w.ids = free.slice(0, take).map((s) => u.id(s));
      // Angriffsmarsch: auf dem Weg und am Sammelpunkt wehrt sich die Welle gegen Ausfälle
      applyCommand(sim, this.p, { c: 'move', units: w.ids, x: w.stage.x, y: w.stage.y, attack: true });
      for (const id of w.ids) {
        const s = u.slot(id);
        if (s >= 0) u.stance[s] = Stance.Aggressive;
      }
      w.phase = 1;
      w.start = sim.tick;
      return;
    }
    // Überlebende filtern
    w.ids = w.ids.filter((id) => u.valid(id));
    if (w.phase === 1) {
      // Sammeln: warten bis 70 % am Sammelpunkt oder Timeout
      let near = 0;
      for (const id of w.ids) {
        const s = u.slot(id);
        if (Math.hypot(u.x[s] - w.stage.x, u.y[s] - w.stage.y) < 12) near++;
      }
      if (near >= w.ids.length * 0.7 || sim.tick - w.start > 1500) {
        this.launchAssault(sim);
        w.phase = 2;
        w.launched = sim.tick;
      }
      return;
    }
    if (w.phase === 2) {
      // Angriff läuft: bei Verlusten oder Zeitablauf abbrechen
      const target = sim.players[w.target];
      if (!target || !target.alive) {
        w.phase = 3;
        return;
      }
      if (sim.tick % 50 === 0) this.retargetAssault(sim);
      // Nachschub: frisch ausgebildete Soldaten stoßen laufend zum Angriff (Dauerbelagerung statt Einzelwellen)
      if (sim.tick % 300 === 0) {
        const joined = free.filter((s) => !w.ids.includes(u.id(s)) && u.state[s] === S.Idle && u.type[s] !== U.Tunneler).map((s) => u.id(s));
        if (joined.length >= 4) {
          for (const id of joined) w.ids.push(id);
          this.launchAssault(sim, joined);
        }
      }
      if (w.ids.length < Math.max(3, waveTarget * 0.18) || sim.tick - w.launched > 7000) w.phase = 3;
      return;
    }
    if (w.phase === 3) {
      // Rückzug nach Hause
      if (w.ids.length) applyCommand(sim, this.p, { c: 'move', units: w.ids, x: this.kx, y: this.ky + (this.side === 2 ? 5 : -5) });
      w.ids = [];
      w.phase = 0;
      w.index++;
      w.nextAt = sim.tick + this.doctrine(sim.tick).interval;
    }
  }

  private pickEnemy(sim: Sim): number {
    let best = -1;
    let bd = Infinity;
    const pl = sim.players[this.p];
    for (const o of sim.players) {
      if (!o.alive || o.team === pl.team) continue;
      const k = sim.buildings.get(o.keepId);
      if (!k) continue;
      const d = Math.hypot(k.cx - this.kx, k.cy - this.ky);
      if (d < bd) {
        bd = d;
        best = o.id;
      }
    }
    return best;
  }

  /** Beste Durchbruchstelle: nächstes Tor bzw. nächste Mauer/Turm auf dem Weg zum Keep */
  private breachTargets(sim: Sim, enemy: number): { gate: Building | null; wall: Building | null; tower: Building | null; keep: Building | null } {
    const keep = sim.buildings.get(sim.players[enemy].keepId) ?? null;
    let gate: Building | null = null;
    let wall: Building | null = null;
    let tower: Building | null = null;
    let gd = Infinity;
    let wd = Infinity;
    let td = Infinity;
    const ref = this.wave.stage;
    for (const b of sim.buildings.values()) {
      if (b.owner !== enemy || !b.def.wallTop || b.type === BT.Keep) continue;
      const d = (b.cx - ref.x) ** 2 + (b.cy - ref.y) ** 2;
      if (b.def.gate) {
        if (d < gd) {
          gd = d;
          gate = b;
        }
      } else if (b.w >= 2) {
        if (d < td) {
          td = d;
          tower = b;
        }
      } else if (d < wd) {
        wd = d;
        wall = b;
      }
    }
    return { gate, wall, tower, keep };
  }

  private launchAssault(sim: Sim, ids: number[] = this.wave.ids): void {
    const u = sim.units;
    const w = this.wave;
    const enemy = w.target;
    const k = this.breachTargets(sim, enemy);
    const keep = k.keep;
    if (!keep) return;
    const infantry: number[] = [];
    const jobs: { id: number; kind: 'attack'; target: number }[] = [];
    for (const id of ids) {
      const s = u.slot(id);
      if (s < 0) continue;
      const t = u.type[s];
      const def = UNITS[t];
      u.stance[s] = Stance.Aggressive;
      if (t === U.Ram) jobs.push({ id, kind: 'attack', target: (k.gate ?? k.wall ?? k.keep)!.id });
      else if (t === U.SiegeTower || t === U.Laddermen) jobs.push({ id, kind: 'attack', target: (k.wall ?? k.tower ?? k.gate ?? k.keep)!.id });
      else if (t === U.Catapult || t === U.Trebuchet || t === U.FireBallista) jobs.push({ id, kind: 'attack', target: (k.tower ?? k.gate ?? k.wall ?? k.keep)!.id });
      else if (t === U.Tunneler) {
        const tgt = k.wall ?? k.tower ?? k.keep;
        applyCommand(sim, this.p, { c: 'tunnel', units: [id], x: tgt!.cx, y: tgt!.cy });
      } else if (def.towerBridge || def.cover) infantry.push(id);
      else infantry.push(id);
    }
    for (const j of jobs) applyCommand(sim, this.p, { c: 'attack', units: [j.id], kind: 'building', target: j.target });
    // Ein Drittel der Nahkämpfer jagt direkt den Lord (Siegbedingung)
    const lordId = sim.players[enemy].lordId;
    const hunters = infantry.filter((id, i) => i % 3 === 0 && UNITS[u.type[u.slot(id)]].range < 3);
    if (u.valid(lordId) && hunters.length) applyCommand(sim, this.p, { c: 'attack', units: hunters, kind: 'unit', target: lordId });
    const rest = infantry.filter((id) => !hunters.includes(id));
    if (rest.length) applyCommand(sim, this.p, { c: 'move', units: rest, x: keep.cx, y: keep.cy, attack: true });
  }

  /** Alle 5 s: Untätige Einheiten der Welle erneut auf den Keep hetzen */
  private retargetAssault(sim: Sim): void {
    const u = sim.units;
    const k = sim.buildings.get(sim.players[this.wave.target].keepId);
    if (!k) return;
    const idle: number[] = [];
    for (const id of this.wave.ids) {
      const s = u.slot(id);
      if (s >= 0 && u.state[s] === S.Idle && u.type[s] !== U.Tunneler) idle.push(id);
    }
    if (idle.length) {
      // Belagerungsgerät: nächstes beliebiges Gebäude angreifen
      const inf = idle.filter((id) => !UNITS[u.type[u.slot(id)]].siege && !UNITS[u.type[u.slot(id)]].bldOnly);
      if (inf.length) applyCommand(sim, this.p, { c: 'move', units: inf, x: k.cx, y: k.cy, attack: true });
      const sg = idle.filter((id) => !inf.includes(id));
      if (sg.length) applyCommand(sim, this.p, { c: 'attack', units: sg, kind: 'building', target: k.id });
    }
  }

  private garrisonStep(sim: Sim, slots: number[]): void {
    const u = sim.units;
    const pr = this.profile;
    // Tote aus der Garnison entfernen
    for (const id of [...this.garrisonIds]) if (!u.valid(id)) this.garrisonIds.delete(id);
    if (this.garrisonIds.size >= pr.castle.garrison) return;
    const tiles = this.garrisonTiles(sim);
    if (!tiles.length) return;
    const ranged = slots.filter(
      (s) => UNITS[u.type[s]].range > 5 && !UNITS[u.type[s]].siege && !this.garrisonIds.has(u.id(s)) && !this.wave.ids.includes(u.id(s)) && u.state[s] === S.Idle,
    );
    if (!ranged.length) return;
    const s = ranged[0];
    const spot = tiles[this.garrisonIds.size % tiles.length];
    this.garrisonIds.add(u.id(s));
    u.stance[s] = Stance.Hold;
    applyCommand(sim, this.p, { c: 'move', units: [u.id(s)], x: spot.x, y: spot.y });
  }

  // ---------------- Extreme-Fähigkeiten ----------------
  private abilityStep(sim: Sim): void {
    if (!sim.extreme) return;
    const pl = sim.players[this.p];
    if (pl.power < 15) return;
    const u = sim.units;
    const ready = (id: number) => pl.abilityCd[id] <= sim.tick;
    const use = (id: number, x: number, y: number) => applyCommand(sim, this.p, { c: 'ability', id, x, y });
    const { slots } = this.armyUnits(sim);
    // Heilung: verwundete eigene Gruppe
    if (ready(2) && pl.power >= 20) {
      for (const s of slots) {
        if (u.hp[s] < u.maxHp[s] * 0.5) {
          let n = 0;
          sim.spatial.query(u.x[s], u.y[s], 8, (o) => {
            if (u.alive[o] && u.owner[o] === this.p && u.hp[o] < u.maxHp[o] * 0.7) n++;
          });
          if (n >= 4) return use(2, u.x[s], u.y[s]);
        }
      }
    }
    // Ziele: feindliche Ansammlungen nahe eigener Einheiten oder der Burg
    let bestCluster = { n: 0, x: 0, y: 0 };
    let siegeTarget: { x: number; y: number } | null = null;
    const probes = slots.slice(0, 12);
    probes.push(...[]);
    const seen = new Set<number>();
    const probeAround = (x: number, y: number, rad: number) => {
      sim.spatial.query(x, y, rad, (e) => {
        if (!u.alive[e] || !sim.isEnemy(this.p, u.owner[e]) || seen.has(e)) return;
        seen.add(e);
        if (u.type[e] >= U.Catapult && u.type[e] !== U.Mantlet) siegeTarget = { x: u.x[e], y: u.y[e] };
        let n = 0;
        sim.spatial.query(u.x[e], u.y[e], 5, (o) => {
          if (u.alive[o] && sim.isEnemy(this.p, u.owner[o])) n++;
        });
        if (n > bestCluster.n) bestCluster = { n, x: u.x[e], y: u.y[e] };
      });
    };
    for (const s of probes) probeAround(u.x[s], u.y[s], 14);
    probeAround(this.kx, this.ky, 30);
    if (siegeTarget && ready(3) && pl.power >= 55) {
      const t = siegeTarget as { x: number; y: number };
      return use(3, t.x, t.y);
    }
    if (bestCluster.n >= 8 && ready(3) && pl.power >= 75) return use(3, bestCluster.x, bestCluster.y);
    if (bestCluster.n >= 6 && ready(0) && pl.power >= 25) return use(0, bestCluster.x, bestCluster.y);
    // Verstärkung bei Bedrängnis
    if (ready(1) && pl.power >= 55 && (bestCluster.n >= 10 || slots.length < 6)) return use(1, this.kx, this.ky);
    if (pl.gold < 120 && ready(4) && pl.power >= 40) return use(4, this.kx, this.ky);
  }

  // ---------------- Haushalt ----------------
  private upkeepStep(sim: Sim): void {
    const pl = sim.players[this.p];
    if (sim.tick - this.woodCheckAt >= 600) {
      this.woodCheckAt = sim.tick;
      this.relocateWoodcutters(sim);
    }
    // Überschuss verkaufen, wenn Gold knapp ist
    if (this.cnt(BT.Market) > 0 && pl.gold < 150) {
      // [Ware, Behalten, Verkaufsschwelle]: Waffen ab 25 Stück (liegen sonst ungenutzt in der Waffenkammer)
      const weapons: [number, number, number][] = [R.Bow, R.Crossbow, R.Spear, R.Pike, R.Mace, R.Sword, R.Leather, R.Armor].map((r) => [r, 15, 25]);
      for (const [res, keep, over] of [[R.Wood, 150, 190], [R.Stone, 120, 160], [R.Iron, 80, 120], [R.Cheese, 60, 100], [R.Meat, 60, 100], ...weapons] as [number, number, number][]) {
        if (pl.stock[res] > over) {
          applyCommand(sim, this.p, { c: 'trade', res, amount: pl.stock[res] - keep, buy: false });
          break;
        }
      }
    }
    // Notkauf von Nahrung
    const food = pl.stock[R.Apple] + pl.stock[R.Cheese] + pl.stock[R.Meat] + pl.stock[R.Bread];
    if (this.cnt(BT.Market) > 0 && food < 30 && pl.gold > 250) applyCommand(sim, this.p, { c: 'trade', res: R.Bread, amount: 25, buy: true });
    // Holzmangel (Wälder abgeholzt): ohne Holz entsteht weder Kaserne noch Mauer noch Waffe
    if (this.cnt(BT.Market) > 0 && pl.stock[R.Wood] < 25 && pl.gold > 250) applyCommand(sim, this.p, { c: 'trade', res: R.Wood, amount: 25, buy: true });
    // Goldüberschuss in Waffen umsetzen, wenn die Werkstätten nicht hinterherkommen
    if (this.cnt(BT.Market) > 0 && pl.gold > 600) {
      let best = -1;
      let bs = Infinity;
      for (const [u, w] of this.profile.army.units) {
        for (const [r] of UNITS[u].cost.res ?? []) {
          const s = pl.stock[r] / w;
          if (pl.stock[r] < 6 && s < bs) {
            bs = s;
            best = r;
          }
        }
      }
      if (best >= 0) {
        const price = RES_INFO[best].price * pl.priceMul[best];
        const n = Math.min(6, Math.floor((pl.gold - 400) / price));
        if (n > 0) applyCommand(sim, this.p, { c: 'trade', res: best, amount: n, buy: true });
      }
    }
    // Reparatur beschädigter Gebäude
    let n = 0;
    for (const b of sim.buildings.values()) {
      if (b.owner !== this.p || b.repair || b.def.hp <= 0) continue;
      if (b.hp < b.maxHp * 0.7 && sim.tick - this.lastThreat > 100) {
        b.repair = true;
        if (++n >= 3) break;
      }
    }
    void A;
  }
}
