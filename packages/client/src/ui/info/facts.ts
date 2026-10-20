/**
 * Reine Faktenfunktionen: leiten aus den Datentabellen (shared/data) ab, was Tooltips und Enzyklopädie anzeigen.
 * Kein DOM. Alle Zahlen kommen aus den Tabellen; Texte aus data/descriptions.
 */
import {
  ARMOR_KEYS,
  BT,
  BUILDINGS,
  BuildingDef,
  Cost,
  DTYPE_KEYS,
  ENEMY_BUILD_RADIUS,
  R,
  RES_INFO,
  Recipe,
  SPECIAL_KEYS,
  StoreKind,
  TERRAIN_NAMES,
  UNITS,
  UnitDef,
  fmtNum,
  hasText,
  t,
  tf,
} from '@strongpoly/shared';
import { abilityIcon, buildingIcon, resourceIcon, toolIcon, unitIcon } from '../icons';
import type { Rich } from '../doc/blocks';

// ---------- Namen und Seiten-Links ----------

export const linkBuilding = (d: BuildingDef): string => `building/${d.key}`;
export const linkUnit = (d: UnitDef): string => `unit/${d.key}`;
export const linkRes = (id: number): string => `resource/${RES_INFO[id].key}`;
export const linkAbility = (): string => 'abilities';

export const dtypeName = (d: number): string => t(`dtype.${DTYPE_KEYS[d]}`);
export const armorName = (a: number): string => t(`armor.${ARMOR_KEYS[a]}`);
export const terrainName = (id: number): string => (hasText(`terrain.${id}`) ? t(`terrain.${id}`) : (TERRAIN_NAMES[id] ?? String(id)));

/** Zahl für Anzeigen (siehe fmtNum) */
export const num = (n: number): string => fmtNum(n);
/** Ticks → Sekunden (Sim-Takt) */
export function secs(ticks: number, tickRate: number): number {
  return ticks / tickRate;
}

// ---------- Kosten ----------

export type CostKey = 'gold' | 'wood' | 'stone' | 'iron' | 'pitch';
export const COST_ORDER: CostKey[] = ['gold', 'wood', 'stone', 'iron', 'pitch'];
const COST_RES: Record<Exclude<CostKey, 'gold'>, number> = { wood: R.Wood, stone: R.Stone, iron: R.Iron, pitch: R.Pitch };

export function costName(k: CostKey): string {
  return k === 'gold' ? t('ui.gold') : RES_INFO[COST_RES[k]].name;
}

export function costIcon(k: CostKey, size = 20): string {
  return k === 'gold' ? toolIcon('gold', size) : resourceIcon(COST_RES[k], size);
}

/** Kosten als Icon+Zahl-Reihe, leer = kostenlos */
export function costRich(cost: Cost, size = 20): Rich {
  const out: Rich = [];
  for (const k of COST_ORDER) {
    const v = cost[k];
    if (v) out.push({ icon: costIcon(k, size), text: String(v), title: `${v} ${costName(k)}` });
  }
  if (!out.length) out.push(t('ui.free'));
  return out;
}

export function costEntries(cost: Cost): { key: CostKey; amount: number }[] {
  return COST_ORDER.filter((k) => !!cost[k]).map((k) => ({ key: k, amount: cost[k] as number }));
}

/** Kosten einer Einheit: Gold, Waffen/Rüstung, Pferd, Mannschaft */
export function unitCostRich(def: UnitDef, size = 20): Rich {
  const out: Rich = [];
  const c = def.cost;
  if (c.gold) out.push({ icon: toolIcon('gold', size), text: String(c.gold), title: `${c.gold} ${t('ui.gold')}` });
  for (const [r, a] of c.res ?? []) out.push({ icon: resourceIcon(r, size), text: String(a), title: `${a} ${RES_INFO[r].name}` });
  if (c.horse) out.push({ text: t('ui.horse'), cls: 'cost-horse' });
  const crew = Math.max(1, c.crew ?? 1);
  out.push({ icon: toolIcon('peasants', size), text: String(crew), title: t('ui.crewHint') });
  return out;
}

export function isFreeUnit(def: UnitDef): boolean {
  return def.cost.gold === 0 && !(def.cost.res && def.cost.res.length) && !def.cost.horse && !def.cost.crew;
}

// ---------- Lager und Lieferwege ----------

export function storeBuilding(kind: StoreKind): BuildingDef {
  const id = kind === 'stock' ? BT.Stockpile : kind === 'granary' ? BT.Granary : BT.Armory;
  return BUILDINGS[id];
}

export function storeOfRes(res: number): BuildingDef {
  return storeBuilding(RES_INFO[res].store);
}

export interface RecipeFlow {
  recipe: Recipe;
  index: number;
  inputs: { res: number; amt: number }[];
  out: { res: number; amt: number };
  /** Sekunden pro Zyklus (Grundzeit) */
  time: number;
  /** Sekunden pro Stück (Grundzeit) */
  perPiece: number;
  /** Lager, in das geliefert wird */
  target: BuildingDef;
  extra?: { res: number; amt: number; every: number; target: BuildingDef };
}

export function recipeFlows(def: BuildingDef): RecipeFlow[] {
  if (!def.prod) return [];
  return def.prod.recipes.map((r, i) => ({
    recipe: r,
    index: i,
    inputs: r.in.map(([res, amt]) => ({ res, amt })),
    out: { res: r.out, amt: r.outAmt },
    time: r.time,
    perPiece: r.time / r.outAmt,
    target: storeOfRes(r.out),
    extra: r.extra ? { ...r.extra, target: storeOfRes(r.extra.res) } : undefined,
  }));
}

/** Wer liefert? */
export function haulerKey(def: BuildingDef): 'worker' | 'ox' | null {
  return def.prod ? def.prod.haul : null;
}

// ---------- Platzierung und Voraussetzungen ----------

export interface RuleLine {
  text: string;
  tone: 'info' | 'warn';
}

/** Platzierungsregeln (ohne den Bauverbotsradius, der separat kommt) */
export function placementRules(def: BuildingDef, verbose = false): RuleLine[] {
  const out: RuleLine[] = [];
  const own = `building.${def.key}.rule`;
  if (hasText(own)) {
    const radius = def.prod?.radius;
    out.push({ text: tf(own, { radius }), tone: 'info' });
  }
  switch (def.placement) {
    case 'deposit':
      out.push({ text: tf('rule.deposit', { terrain: terrainName(def.terrain ?? 0), n: def.minTiles ?? 1 }), tone: 'info' });
      break;
    case 'fertile':
      out.push({ text: tf('rule.fertile', { n: def.minTiles ?? 1 }), tone: 'info' });
      break;
    case 'water':
      out.push({ text: tf('rule.water', { n: def.minTiles ?? 1 }), tone: 'info' });
      break;
    case 'wallAdj':
      out.push({ text: t('rule.wallAdj'), tone: 'info' });
      break;
    case 'onWall':
      out.push({ text: t('rule.onWall'), tone: 'info' });
      break;
    case 'flat':
      if (verbose) out.push({ text: t('rule.flat'), tone: 'info' });
      break;
    case 'any':
      if (verbose) out.push({ text: t('rule.any'), tone: 'info' });
      break;
  }
  if (def.store) out.push({ text: tf('rule.module', { store: def.name }), tone: 'info' });
  if (def.line) out.push({ text: t('rule.line'), tone: 'info' });
  return out;
}

/** Bauverbot in der Nähe feindlicher Soldaten: gilt für jedes baubare Gebäude außer Geschützen auf Türmen (sie werden trotzdem geprüft) */
export function enemyRule(): RuleLine {
  return { text: tf('rule.enemy', { radius: ENEMY_BUILD_RADIUS }), tone: 'warn' };
}

/** Voraussetzungen: einmalig, benötigt Lager, benötigt Ochsengespann, benötigt Eingangsware */
export function requirements(def: BuildingDef): string[] {
  const out: string[] = [];
  if (def.unique) out.push(t('rule.unique'));
  if (def.prod) {
    for (const f of recipeFlows(def)) {
      if (f.inputs.length) {
        const names = f.inputs.map((i) => RES_INFO[i.res].name).join(', ');
        const line = tf('ui.reqInput', { res: names, store: storeOfRes(f.inputs[0].res).name });
        if (!out.includes(line)) out.push(line);
      }
    }
    if (def.prod.haul === 'ox') out.push(tf('ui.reqOx', { building: BUILDINGS[BT.OxTether].name }));
    const targets = [...new Set(recipeFlows(def).map((f) => f.target.name))];
    out.push(tf('ui.reqStore', { store: targets.join(' / ') }));
  }
  if (def.workers > 0) out.push(tf('ui.reqWorkers', { n: def.workers }));
  return out;
}

// ---------- Rekrutierung ----------

const PRODUCER_BUILDING: Record<string, number> = { barracks: BT.Barracks, merc: BT.MercPost, guild: BT.EngineerGuild };

export function recruitBuilding(u: UnitDef): BuildingDef | undefined {
  const id = PRODUCER_BUILDING[u.producer];
  return id === undefined ? undefined : BUILDINGS[id];
}

export function recruitList(b: BuildingDef): UnitDef[] {
  return UNITS.filter((u) => PRODUCER_BUILDING[u.producer] === b.id);
}

// ---------- Besonderheiten ----------

export function unitSpecials(def: UnitDef): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const flag = (k: (typeof SPECIAL_KEYS)[number], on: boolean | undefined, params?: Record<string, number>): void => {
    if (on) out.push({ key: k, text: tf(`special.${k}`, params) });
  };
  flag('mounted', def.mounted);
  flag('invisible', def.invisible);
  flag('climbs', def.climbs);
  flag('ladders', def.ladders);
  flag('tunnels', def.tunnels);
  flag('siege', def.siege || def.towerBridge || def.cover);
  flag('bldOnly', def.bldOnly);
  flag('towerBridge', def.towerBridge);
  flag('fireDmg', def.fireDmg);
  flag('healer', def.healer);
  flag('cover', def.cover);
  flag('repairs', def.repairs);
  flag('worker', def.worker);
  flag('splash', def.splash > 0, { splash: def.splash });
  flag('minRange', def.minRange > 0, { min: def.minRange });
  flag('autoSiege', !!def.siege && !def.bldOnly && def.dmg > 0);
  flag('noAttack', def.dmg <= 0 && !def.worker && def.key !== 'ox');
  return out;
}

// ---------- Waren ----------

export function producersOf(res: number): BuildingDef[] {
  return BUILDINGS.filter((b) => b.prod && b.prod.recipes.some((r) => r.out === res || r.extra?.res === res));
}

export function consumersOf(res: number): BuildingDef[] {
  return BUILDINGS.filter((b) => b.prod && b.prod.recipes.some((r) => r.in.some(([x]) => x === res)));
}

export function unitsUsingRes(res: number): UnitDef[] {
  return UNITS.filter((u) => u.cost.res?.some(([r]) => r === res));
}

export function buildingsCostingRes(key: CostKey): BuildingDef[] {
  return BUILDINGS.filter((b) => !!b.cost[key]);
}

/** Icon-Kurzformen */
export const bIcon = (d: BuildingDef, size = 24): string => buildingIcon(d.id, size);
export const uIcon = (d: UnitDef, size = 24, color?: number): string => unitIcon(d.id, color, size);
export const rIcon = (id: number, size = 24): string => resourceIcon(id, size);
export const aIcon = (id: number, size = 24): string => abilityIcon(id, size);

/** Inline-Element: Gebäude mit Icon und Link */
export function buildingLink(d: BuildingDef, size = 20): Rich[number] {
  return { link: linkBuilding(d), text: d.name, icon: bIcon(d, size) };
}
export function unitLink(d: UnitDef, size = 20): Rich[number] {
  return { link: linkUnit(d), text: d.name, icon: uIcon(d, size) };
}
export function resLink(id: number, size = 20): Rich[number] {
  return { link: linkRes(id), text: RES_INFO[id].name, icon: rIcon(id, size) };
}
