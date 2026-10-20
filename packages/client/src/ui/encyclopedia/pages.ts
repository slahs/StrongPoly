/**
 * Seiten der Enzyklopädie als neutrale Inhalte (`Doc`). Alle Zahlen stammen aus shared/data/*, die Texte aus data/descriptions.
 * Kein DOM: Navigation, Suche und Seitenliste sind testbar.
 */
import {
  ABILITIES,
  AI_PROFILES,
  ALE_PER_PEASANT_MONTH,
  ALE_POP_MAX,
  BAD_POP,
  BT,
  BUILDINGS,
  BuildingDef,
  CATEGORIES,
  CAULDRON,
  CROWD_POP,
  DEFAULT_TROOP_LIMIT,
  DMG_TABLE,
  ENEMY_BUILD_RADIUS,
  EXTREME,
  FEAR_DMG_STEP,
  FEAR_MAX,
  FEAR_PROD_STEP,
  FIRE_DPS,
  FIRE_DURATION,
  GOOD_POP,
  INN_SERVES,
  LEAVE_INTERVAL_TICKS,
  MARKET_PRICE_RECOVER,
  MARKET_PRICE_STEP,
  PEASANT_BASE_LIMIT,
  POP_BAD_CAP,
  POP_GOOD_CAP,
  POP_STEPS_PER_MONTH,
  POP_THRESHOLD,
  POT_RADIUS,
  RATION_FOOD,
  RATION_NAMES,
  RATION_POP,
  RELIGION_COVER,
  RELIGION_POP,
  RELIGION_POP_CAP,
  RES_INFO,
  SELL_RATIO,
  SPAWN_INTERVAL_TICKS,
  START_GOLD,
  STORE_CAP_PER_MODULE,
  TAX_GOLD,
  TAX_LEVELS,
  TAX_POP,
  TICKS_PER_MONTH,
  TICK_RATE,
  TURRETS,
  U,
  UNITS,
  UnitDef,
  VARIETY_POP,
  WELL_RADIUS,
  ARMOR_CLASSES,
  DAMAGE_TYPES,
  matchups,
  t,
  tf,
  TERRAIN_NAMES,
} from '@strongpoly/shared';
import type { Block, Doc, Rich } from '../doc/blocks';
import { docText } from '../doc/blocks';
import { buildingEffects, fearPopularity, signed } from '../info/effects';
import {
  armorName,
  bIcon,
  buildingLink,
  buildingsCostingRes,
  consumersOf,
  costRich,
  dtypeName,
  enemyRule,
  linkBuilding,
  linkRes,
  linkUnit,
  num,
  placementRules,
  producersOf,
  rIcon,
  recipeFlows,
  recruitBuilding,
  recruitList,
  requirements,
  resLink,
  storeBuilding,
  storeOfRes,
  uIcon,
  unitCostRich,
  unitLink,
  unitSpecials,
  unitsUsingRes,
  haulerKey,
} from '../info/facts';
import { matchupBlocks, multText } from '../info/matchupDoc';
import { FACE_NAMES } from '../icons/ui';
import { TOOL_ICONS, abilityIcon, buildingIcon, categoryIcon, popFaceIcon, popFactorIcon, popFaceLevel, resourceIcon, toolIcon } from '../icons';
import { DEFAULT_HOTKEYS, HOTKEY_LABELS, HotkeyAction, keyLabel } from '../../game/hotkeys';
import { buildingGraph, CHAIN_IDS, ChainId, chainBuildings, chainGraph, chainSvg, layoutChain } from './chains';
import { buildingTexts, productionRows, unitTexts } from '../tooltips/model';

export interface EncPage {
  id: string;
  title: string;
  /** Gruppe in der Navigation */
  group: string;
  icon: string;
  build(): Doc;
}

export interface EncSection {
  title?: string;
  pages: string[];
  /** Kategorie, zu der der Abschnitt gehört (für die Übersichtsseite) */
  cat?: string;
}
export interface EncGroup {
  id: string;
  title: string;
  icon: string;
  /** Übersichtsseite der Gruppe (optional) */
  page?: string;
  sections: EncSection[];
}

export interface EncOptions {
  /** Tastenbelegung für die Steuerungsseite (Standard: Voreinstellung) */
  hotkeys?: Record<HotkeyAction, string>;
}

const P = {
  building: (key: string) => `building/${key}`,
  unit: (key: string) => `unit/${key}`,
  resource: (key: string) => `resource/${key}`,
  chain: (id: string) => `chain/${id}`,
};

// ---------- Kleine Helfer ----------

const h2 = (text: string, icon?: string): Block => ({ k: 'h', text, level: 2, icon });
const h3 = (text: string): Block => ({ k: 'h', text, level: 3 });
const p = (text: string): Block => ({ k: 'p', text });
const kv = (rows: { label: string; value: Rich }[]): Block => ({ k: 'kv', rows });
const ul = (items: Rich[]): Block => ({ k: 'list', items });
const tipBlock = (text: string): Block => ({ k: 'tip', text, label: t('ui.tip') });
const join = (items: Rich[], sep: Rich = [' ']): Rich => items.flatMap((x, i) => (i ? [...sep, ...x] : x));
const gold = (n: number, size = 18): Rich[number] => ({ icon: toolIcon('gold', size), text: num(n), title: `${num(n)} ${t('ui.gold')}` });
const peasantIcon = (size = 18): string => toolIcon('peasants', size);
const sec = (n: number): string => tf('ui.secondsFmt', { s: n });

function isCastleGroup(d: BuildingDef, keys: string[]): boolean {
  return keys.includes(d.key);
}

// ---------- Navigation ----------

const CASTLE_SECTIONS: { id: string; keys: string[] }[] = [
  { id: 'center', keys: ['keep'] },
  { id: 'walls', keys: ['wallwood', 'walllow', 'wallhigh', 'stairs'] },
  { id: 'towers', keys: ['towerlookout', 'towerguard', 'towerround', 'turretballista', 'turretmangonel'] },
  { id: 'gates', keys: ['gatewood', 'gatestone', 'drawbridge'] },
  { id: 'defense', keys: ['pit', 'killingpit', 'pitchditch', 'cauldron', 'waterpot'] },
  { id: 'military', keys: ['barracks', 'mercpost', 'stable', 'engineers'] },
];
const SIDE_ORDER: UnitDef['side'][] = ['euro', 'arab', 'siege', 'neutral'];

function buildingNavSections(): EncSection[] {
  const out: EncSection[] = [];
  const used = new Set<number>();
  for (const cat of CATEGORIES) {
    if (cat.id === 'castle') {
      for (const s of CASTLE_SECTIONS) {
        const list = BUILDINGS.filter((d) => d.cat === 'castle' && isCastleGroup(d, s.keys));
        list.forEach((d) => used.add(d.id));
        out.push({ title: t(`enc.nav.castle.${s.id}`), cat: 'castle', pages: s.keys.map((k) => P.building(k)).filter((id) => list.some((d) => P.building(d.key) === id)) });
      }
      const rest = BUILDINGS.filter((d) => d.cat === 'castle' && !used.has(d.id));
      rest.forEach((d) => used.add(d.id));
      if (rest.length) out.push({ title: t('enc.nav.castle.other'), cat: 'castle', pages: rest.map((d) => P.building(d.key)) });
    } else {
      const list = BUILDINGS.filter((d) => d.cat === cat.id);
      list.forEach((d) => used.add(d.id));
      out.push({ title: cat.name, cat: cat.id, pages: list.map((d) => P.building(d.key)) });
    }
  }
  return out;
}

function unitNavSections(): EncSection[] {
  return SIDE_ORDER.map((side) => ({ title: t(`ui.side.${side}`), pages: UNITS.filter((u) => u.side === side).map((u) => P.unit(u.key)) })).filter((s) => s.pages.length);
}

function resourceNavSections(): EncSection[] {
  const stores = ['stock', 'granary', 'armory'] as const;
  const out: EncSection[] = [{ pages: [P.resource('gold')] }];
  for (const st of stores) out.push({ title: t(`ui.store.${st}`), pages: RES_INFO.filter((r) => r.store === st).map((r) => P.resource(r.key)) });
  return out;
}

export function encGroups(): EncGroup[] {
  return [
    { id: 'start', title: t('enc.nav.start'), icon: toolIcon('help', 24), page: 'start', sections: [] },
    { id: 'buildings', title: t('enc.nav.buildings'), icon: buildingIcon(BT.Keep, 24), page: 'buildings', sections: buildingNavSections() },
    { id: 'units', title: t('enc.nav.units'), icon: toolIcon('troops', 24), page: 'units', sections: unitNavSections() },
    { id: 'resources', title: t('enc.nav.resources'), icon: resourceIcon(RES_INFO.findIndex((r) => r.key === 'wood'), 24), page: 'resources', sections: resourceNavSections() },
    { id: 'chains', title: t('enc.nav.chains'), icon: resourceIcon(RES_INFO.findIndex((r) => r.key === 'bread'), 24), page: 'chains', sections: [{ pages: CHAIN_IDS.map((c) => P.chain(c)) }] },
    {
      id: 'systems',
      title: t('enc.nav.systems'),
      icon: popFaceIcon(80, 24),
      sections: [{ pages: ['popularity', 'combat', 'siege', 'abilities', 'rules'] }],
    },
    { id: 'more', title: t('enc.nav.more'), icon: toolIcon('hotkeys', 24), sections: [{ pages: ['controls', 'lords'] }] },
  ];
}

// ---------- Gebäude ----------

function buildingKvRows(def: BuildingDef): { label: string; value: Rich }[] {
  const rows: { label: string; value: Rich }[] = [{ label: t('ui.cost'), value: costRich(def.cost, 22) }];
  if (def.workers > 0) rows.push({ label: t('ui.workers'), value: [{ icon: peasantIcon(22), text: String(def.workers) }] });
  rows.push({ label: t('ui.size'), value: [tf('ui.sizeFmt', { w: def.w, h: def.h })] });
  if (def.hp > 0) rows.push({ label: t('ui.hp'), value: [num(def.hp)] });
  rows.push({ label: t('enc.b.vision'), value: [tf('ui.rangeTiles', { r: def.vision })] });
  rows.push({ label: t('enc.b.armorClass'), value: [def.wood ? armorName(4) : armorName(5)] });
  return rows;
}

function damageVsBuilding(def: BuildingDef): Block {
  const armor = def.wood ? 4 : 5;
  const rows = DAMAGE_TYPES.map((d) => [[{ text: dtypeName(d), bold: true }], [{ text: multText(DMG_TABLE[d][armor]), cls: DMG_TABLE[d][armor] >= 1 ? 'neg' : DMG_TABLE[d][armor] <= 0.5 ? 'pos' : '' }]] as Rich[]);
  return { k: 'table', head: [[t('ui.damageType')], [t('enc.b.damageTaken')]], rows };
}

function buildingChainBlocks(def: BuildingDef): Block[] {
  const out: Block[] = [];
  const flows = recipeFlows(def);
  if (!def.prod) {
    if (def.store) {
      const names = RES_INFO.map((r, i) => ({ r, i })).filter((x) => x.r.store === def.store);
      out.push(h3(t('enc.b.storesTitle')));
      out.push({ k: 'chips', items: names.map((x) => ({ label: x.r.name, icon: rIcon(x.i, 22), link: linkRes(x.i) })) });
    }
    return out;
  }
  out.push(h2(t('enc.b.chain')));
  const g = buildingGraph(def);
  if (g) out.push({ k: 'svg', svg: chainSvg(layoutChain(g)), caption: t('enc.b.chainCaption') });
  const rows: { label: string; value: Rich }[] = [];
  // abhängig von
  const inputs = new Map<number, true>();
  for (const f of flows) for (const i of f.inputs) inputs.set(i.res, true);
  if (inputs.size) {
    const items: Rich[] = [...inputs.keys()].map((r) => {
      const prods = producersOf(r);
      return [resLink(r), ' ← ', ...join(prods.map((b) => [buildingLink(b)]))];
    });
    rows.push({ label: t('enc.b.dependsOn'), value: join(items, [' · ']) });
  } else {
    rows.push({ label: t('enc.b.dependsOn'), value: [t('enc.b.noInput')] });
  }
  if (def.prod.haul === 'ox') rows.push({ label: t('enc.b.carrier'), value: [buildingLink(BUILDINGS[BT.OxTether])] });
  // liefert an
  const targets = [...new Set(flows.map((f) => f.target.id))];
  rows.push({ label: t('enc.b.deliversTo'), value: join(targets.map((id) => [buildingLink(BUILDINGS[id])])) });
  // weiterverarbeitet von
  const outs = [...new Set(flows.map((f) => f.out.res))];
  const cons = new Set<number>();
  for (const r of outs) for (const b of consumersOf(r)) cons.add(b.id);
  if (cons.size) rows.push({ label: t('enc.b.usedBy'), value: join([...cons].map((id) => [buildingLink(BUILDINGS[id])])) });
  const units = new Set<number>();
  for (const r of outs) for (const u of unitsUsingRes(r)) units.add(u.id);
  if (units.size) rows.push({ label: t('enc.b.neededFor'), value: join([...units].map((id) => [unitLink(UNITS[id])])) });
  out.push(kv(rows));
  out.push(kv(productionRows(def, 22)));
  return out;
}

export function buildingPage(def: BuildingDef): Doc {
  const { desc, tip } = buildingTexts(def);
  const cat = CATEGORIES.find((c) => c.id === def.cat);
  const blocks: Block[] = [p(desc), kv(buildingKvRows(def))];
  const rules = placementRules(def, true);
  if (def.id !== BT.Keep && def.id !== BT.Campfire) rules.push(enemyRule());
  blocks.push(h3(t('ui.rule')));
  for (const r of rules) blocks.push({ k: 'rule', text: r.text, tone: r.tone });
  const reqs = requirements(def);
  if (reqs.length) {
    blocks.push(h3(t('ui.requires')));
    blocks.push(ul(reqs.map((r) => [r])));
  }
  blocks.push(...buildingChainBlocks(def));
  const eff = buildingEffects(def);
  if (eff.length) {
    blocks.push(h3(t('ui.effect')));
    blocks.push(kv(eff));
  }
  const recruits = recruitList(def);
  if (recruits.length) {
    blocks.push(h3(t('enc.b.recruits')));
    blocks.push({ k: 'chips', items: recruits.map((u) => ({ label: u.name, icon: uIcon(u, 22), link: linkUnit(u) })) });
  }
  if (def.hp > 0) {
    blocks.push(h3(t('enc.b.damageTitle')));
    blocks.push(p(t('enc.b.damageIntro')));
    blocks.push(damageVsBuilding(def));
  }
  blocks.push(tipBlock(tip));
  return { title: def.name, icon: bIcon(def, 64), subtitle: cat?.name, blocks };
}

function buildingsOverview(): Doc {
  const blocks: Block[] = [p(t('enc.buildings.intro'))];
  const seenCat = new Set<string>();
  for (const sec of buildingNavSections()) {
    if (sec.cat && !seenCat.has(sec.cat)) {
      seenCat.add(sec.cat);
      const c = CATEGORIES.find((x) => x.id === sec.cat);
      blocks.push(h2(c?.name ?? '', categoryIcon(sec.cat, 28)), p(t(`cat.${sec.cat}`)));
    }
    blocks.push(h3(sec.title ?? ''));
    blocks.push({
      k: 'chips',
      items: sec.pages.map((id) => {
        const d = BUILDINGS.find((b) => P.building(b.key) === id)!;
        return { label: d.name, icon: bIcon(d, 24), link: id };
      }),
    });
  }
  return { title: t('enc.nav.buildings'), icon: buildingIcon(BT.Keep, 64), blocks };
}

// ---------- Einheiten ----------

export function unitPage(def: UnitDef): Doc {
  const { desc, tip } = unitTexts(def);
  const blocks: Block[] = [p(desc)];
  const rows: { label: string; value: Rich }[] = [];
  const rb = recruitBuilding(def);
  if (rb) {
    rows.push({ label: t('ui.cost'), value: unitCostRich(def, 22) });
    rows.push({ label: t('ui.recruitAt'), value: [buildingLink(rb)] });
    rows.push({ label: t('ui.trainTime'), value: [sec(def.train)] });
    rows.push({ label: t('enc.u.troopSlots'), value: [String(def.troops)] });
  }
  rows.push({ label: t('ui.hp'), value: [num(def.hp)] });
  rows.push({ label: t('ui.armor'), value: [armorName(def.armor)] });
  if (def.dmg > 0) {
    rows.push({ label: t('ui.damage'), value: [tf('ui.damageFmt', { dmg: def.dmg, type: dtypeName(def.dtype), cd: def.cd })] });
    rows.push({ label: t('enc.u.dps'), value: [num(def.dmg / def.cd)] });
  }
  if (def.dmg > 0 || def.siege) rows.push({ label: t('ui.range'), value: [def.range > 2 ? tf('ui.rangeTiles', { r: def.range }) : t('ui.melee')] });
  if (def.minRange > 0) rows.push({ label: t('ui.minRange'), value: [tf('ui.rangeTiles', { r: def.minRange })] });
  rows.push({ label: t('ui.speed'), value: [tf('ui.speedFmt', { v: def.speed })] });
  rows.push({ label: t('enc.u.sight'), value: [tf('ui.rangeTiles', { r: def.sight })] });
  blocks.push(kv(rows));
  const res = def.cost.res ?? [];
  if (res.length) {
    blocks.push(h3(t('enc.u.supplyTitle')));
    blocks.push({
      k: 'kv',
      rows: res.map(([r, a]) => ({
        label: RES_INFO[r].name,
        value: [{ icon: rIcon(r, 22), text: String(a) }, ' ← ', ...join(producersOf(r).map((b) => [buildingLink(b)])), ' → ', buildingLink(storeOfRes(r))],
      })),
    });
    if (def.cost.horse) blocks.push({ k: 'rich', parts: [t('enc.u.horseFrom'), ' ', buildingLink(BUILDINGS[BT.Stable])] });
  }
  const sp = unitSpecials(def);
  if (sp.length) {
    blocks.push(h3(t('ui.specials')));
    blocks.push(ul(sp.map((s) => [s.text])));
  }
  blocks.push(h3(t('ui.matchups')));
  blocks.push(...matchupBlocks(def.id));
  blocks.push(tipBlock(tip));
  return { title: def.name, icon: uIcon(def, 64), subtitle: t(`ui.side.${def.side}`), blocks };
}

function unitsOverview(): Doc {
  const blocks: Block[] = [p(t('enc.units.intro'))];
  for (const sec of unitNavSections()) {
    blocks.push(h3(sec.title ?? ''));
    blocks.push({
      k: 'chips',
      items: sec.pages.map((id) => {
        const u = UNITS.find((x) => P.unit(x.key) === id)!;
        return { label: u.name, icon: uIcon(u, 24), link: id };
      }),
    });
  }
  // Übersichtstabelle
  blocks.push(h3(t('enc.units.table')));
  const army = UNITS.filter((u) => u.producer !== 'none');
  blocks.push({
    k: 'table',
    head: [[t('enc.units.colUnit')], [t('ui.cost')], [t('ui.hp')], [t('ui.armor')], [t('ui.damage')], [t('ui.range')], [t('ui.speed')]],
    rows: army.map((u) => [
      [unitLink(u, 20)],
      unitCostRich(u, 18),
      [num(u.hp)],
      [armorName(u.armor)],
      u.dmg > 0 ? [`${num(u.dmg)} ${dtypeName(u.dtype)}`] : ['–'],
      [u.dmg > 0 || u.siege ? (u.range > 2 ? num(u.range) : t('ui.melee')) : '–'],
      [num(u.speed)],
    ]),
  });
  return { title: t('enc.nav.units'), icon: toolIcon('troops', 64), blocks };
}

// ---------- Waren ----------

export function resourcePage(resId: number): Doc {
  const info = RES_INFO[resId];
  const blocks: Block[] = [p(t(`res.${info.key}.desc`))];
  const store = storeOfRes(resId);
  const rows: { label: string; value: Rich }[] = [
    { label: t('ui.storedIn'), value: [buildingLink(store), ' ', tf('ui.capPerModule', { cap: STORE_CAP_PER_MODULE[info.store] })] },
    { label: t('enc.r.marketPrice'), value: [gold(info.price)] },
    { label: t('enc.r.sellPrice'), value: [gold(Math.floor(info.price * SELL_RATIO))] },
  ];
  blocks.push(kv(rows));
  const prods = producersOf(resId);
  blocks.push(h3(t('enc.r.producedBy')));
  blocks.push(prods.length ? { k: 'chips', items: prods.map((b) => ({ label: b.name, icon: bIcon(b, 22), link: linkBuilding(b) })) } : p(t('enc.r.noProducer')));
  const cons = consumersOf(resId);
  const units = unitsUsingRes(resId);
  if (cons.length || units.length) {
    blocks.push(h3(t('enc.r.usedFor')));
    blocks.push({
      k: 'chips',
      items: [...cons.map((b) => ({ label: b.name, icon: bIcon(b, 22), link: linkBuilding(b) })), ...units.map((u) => ({ label: u.name, icon: uIcon(u, 22), link: linkUnit(u) }))],
    });
  }
  const costKey = (['wood', 'stone', 'iron', 'pitch'] as const).find((k) => RES_INFO[resId].key === k);
  if (costKey) {
    const list = buildingsCostingRes(costKey);
    blocks.push(h3(t('enc.r.buildCost')));
    blocks.push({ k: 'chips', items: list.map((b) => ({ label: `${b.name} (${b.cost[costKey]})`, icon: bIcon(b, 22), link: linkBuilding(b) })) });
  }
  if (info.key === 'ale') {
    blocks.push({ k: 'rich', parts: [t('enc.r.aleLink'), ' ', buildingLink(BUILDINGS[BT.Inn])] });
  }
  if (info.food) blocks.push({ k: 'rich', parts: [t('enc.r.foodLink'), ' ', { link: 'popularity', text: t('enc.nav.popularity') }] });
  return { title: info.name, icon: rIcon(resId, 64), subtitle: info.food ? t('ui.food') : t(`ui.store.${info.store}`), blocks };
}

function goldPage(): Doc {
  const blocks: Block[] = [p(t('res.gold.desc')), p(t('enc.gold.sources'))];
  blocks.push(h3(t('enc.gold.taxTitle')));
  blocks.push(p(t('enc.gold.taxIntro')));
  blocks.push(taxTable());
  blocks.push(h3(t('enc.gold.market')));
  blocks.push(p(tf('enc.gold.marketText', { sell: Math.round(SELL_RATIO * 100), step: Math.round(MARKET_PRICE_STEP * 1000) / 10, recover: Math.round(MARKET_PRICE_RECOVER * 1000) / 10 })));
  blocks.push({ k: 'chips', items: [{ label: BUILDINGS[BT.Market].name, icon: bIcon(BUILDINGS[BT.Market], 22), link: linkBuilding(BUILDINGS[BT.Market]) }] });
  blocks.push(h3(t('enc.gold.start')));
  blocks.push(p(tf('enc.gold.startText', { gold: START_GOLD })));
  return { title: t('ui.gold'), icon: toolIcon('gold', 64), subtitle: t('enc.nav.resources'), blocks };
}

function resourcesOverview(): Doc {
  const blocks: Block[] = [p(t('enc.resources.intro'))];
  for (const sec of resourceNavSections()) {
    if (sec.title) blocks.push(h3(sec.title));
    blocks.push({
      k: 'chips',
      items: sec.pages.map((id) => {
        if (id === P.resource('gold')) return { label: t('ui.gold'), icon: toolIcon('gold', 24), link: id };
        const i = RES_INFO.findIndex((r) => P.resource(r.key) === id);
        return { label: RES_INFO[i].name, icon: rIcon(i, 24), link: id };
      }),
    });
  }
  blocks.push(h3(t('enc.resources.table')));
  blocks.push({
    k: 'table',
    head: [[t('enc.resources.colRes')], [t('ui.storedIn')], [t('ui.price')], [t('ui.sellPrice')]],
    rows: RES_INFO.map((r, i) => [[resLink(i, 20)], [storeOfRes(i).name], [gold(r.price)], [gold(Math.floor(r.price * SELL_RATIO))]]),
  });
  return { title: t('enc.nav.resources'), icon: rIcon(0, 64), blocks };
}

// ---------- Ketten ----------

function chainPage(id: ChainId): Doc {
  const g = chainGraph(id);
  const blocks: Block[] = [p(tf(`enc.chain.${id}.intro`)), ...(id === 'food' ? [p(t('popfactor.food'))] : []), { k: 'svg', svg: chainSvg(layoutChain(g)), caption: t('enc.chain.caption') }];
  blocks.push(p(tf(`enc.chain.${id}.text`)));
  const bs = chainBuildings(g).map((b) => BUILDINGS[b]);
  blocks.push(h3(t('enc.chain.buildings')));
  blocks.push({ k: 'chips', items: bs.map((b) => ({ label: b.name, icon: bIcon(b, 22), link: linkBuilding(b) })) });
  blocks.push(tipBlock(t(`enc.chain.${id}.tip`)));
  const first = id === 'horses' ? BT.Stable : chainBuildings(g)[0];
  return { title: t(`enc.chain.${id}.title`), icon: buildingIcon(first, 64), subtitle: t('enc.nav.chains'), blocks };
}

function chainsOverview(): Doc {
  const blocks: Block[] = [p(t('enc.chains.intro'))];
  for (const id of CHAIN_IDS) {
    const g = chainGraph(id);
    blocks.push(h2(t(`enc.chain.${id}.title`), buildingIcon(id === 'horses' ? BT.Stable : chainBuildings(g)[0], 28)));
    blocks.push(p(tf(`enc.chain.${id}.intro`)));
    blocks.push({ k: 'svg', svg: chainSvg(layoutChain(g)) });
    blocks.push({ k: 'chips', items: [{ label: t(`enc.chain.${id}.title`), link: P.chain(id), icon: buildingIcon(id === 'horses' ? BT.Stable : chainBuildings(g)[0], 24) }] });
  }
  return { title: t('enc.nav.chains'), icon: resourceIcon(RES_INFO.findIndex((r) => r.key === 'bread'), 64), blocks };
}

// ---------- Beliebtheit ----------

function taxTable(): Block {
  return {
    k: 'table',
    head: [[t('enc.pop.level')], [t('enc.pop.taxGold')], [t('enc.pop.perMonth')]],
    rows: TAX_LEVELS.map((lv) => [
      [lv < 0 ? tf('enc.pop.bribe', { n: -lv }) : lv === 0 ? t('enc.pop.noTax') : tf('enc.pop.taxLevel', { n: lv })],
      [{ icon: toolIcon('gold', 18), text: signed(TAX_GOLD[lv]), cls: TAX_GOLD[lv] > 0 ? 'pos' : TAX_GOLD[lv] < 0 ? 'neg' : '' }],
      [{ text: signed(TAX_POP[lv]), cls: TAX_POP[lv] > 0 ? 'pos' : TAX_POP[lv] < 0 ? 'neg' : '' }],
    ]),
  };
}

function faceRanges(): { level: number; from: number; to: number }[] {
  const out: { level: number; from: number; to: number }[] = [];
  for (let v = 0; v <= 100; v++) {
    const lv = popFaceLevel(v);
    const last = out[out.length - 1];
    if (last && last.level === lv) last.to = v;
    else out.push({ level: lv, from: v, to: v });
  }
  return out;
}

function popFactorHead(key: string): Block {
  const name = TOOL_ICONS[key]?.name;
  void name;
  return { k: 'h', text: t(`enc.pop.f.${key}`), level: 3, icon: popFactorIcon(key, 28) };
}

function popularityPage(): Doc {
  const blocks: Block[] = [p(t('enc.pop.intro'))];
  blocks.push(h2(t('enc.pop.rulesTitle')));
  blocks.push(
    ul([
      [tf('enc.pop.ruleImmigration', { limit: POP_THRESHOLD, interval: SPAWN_INTERVAL_TICKS / TICK_RATE })],
      [tf('enc.pop.ruleEmigration', { limit: POP_THRESHOLD, interval: LEAVE_INTERVAL_TICKS / TICK_RATE })],
      [tf('enc.pop.ruleHousing', { base: PEASANT_BASE_LIMIT, hovel: BUILDINGS[BT.Hovel].housing ?? 0 })],
      [tf('enc.pop.ruleForecast', { month: TICKS_PER_MONTH / TICK_RATE, steps: POP_STEPS_PER_MONTH })],
      [t('enc.pop.ruleRange')],
    ]),
  );
  blocks.push(h3(t('enc.pop.faces')));
  blocks.push({
    k: 'table',
    head: [[t('enc.pop.faceMood')], [t('enc.pop.faceRange')]],
    rows: faceRanges().map((f) => [[{ icon: popFaceIcon(f.from, 28), text: FACE_NAMES[f.level] }], [tf('enc.pop.rangeFmt', { a: f.from, b: f.to })]]),
  });
  blocks.push(h2(t('enc.pop.factorsTitle')));
  blocks.push(p(t('enc.pop.factorsIntro')));

  // Rationen
  blocks.push(popFactorHead('ration'), p(t('popfactor.ration')));
  blocks.push({
    k: 'table',
    head: [[t('enc.pop.ration')], [t('enc.pop.foodPerPeasant')], [t('enc.pop.perMonth')]],
    rows: RATION_NAMES.map((n, i) => [[n], [num(RATION_FOOD[i])], [{ text: signed(RATION_POP[i]), cls: RATION_POP[i] > 0 ? 'pos' : RATION_POP[i] < 0 ? 'neg' : '' }]]),
  });
  blocks.push(popFactorHead('variety'), p(t('popfactor.variety')), p(tf('enc.pop.varietyText', { v: VARIETY_POP })));
  blocks.push(popFactorHead('tax'), p(t('popfactor.tax')), taxTable());
  blocks.push(popFactorHead('ale'), p(t('popfactor.ale')), p(tf('enc.pop.aleText', { serves: INN_SERVES, max: ALE_POP_MAX, need: ALE_PER_PEASANT_MONTH })));
  blocks.push({ k: 'chips', items: [{ label: BUILDINGS[BT.Inn].name, icon: bIcon(BUILDINGS[BT.Inn], 22), link: linkBuilding(BUILDINGS[BT.Inn]) }] });
  blocks.push(popFactorHead('religion'), p(t('popfactor.religion')));
  blocks.push({
    k: 'table',
    head: [[t('enc.pop.building')], [t('enc.pop.perMonth')], [t('ui.cover')]],
    rows: (['chapel', 'church', 'cathedral'] as const).map((r) => {
      const b = BUILDINGS.find((x) => x.religion === r)!;
      return [[buildingLink(b)], [{ text: signed(RELIGION_POP[r]), cls: 'pos' }], [{ icon: peasantIcon(18), text: num(RELIGION_COVER[r]) }]];
    }),
  });
  blocks.push(p(tf('enc.pop.religionCap', { cap: RELIGION_POP_CAP })));
  const goods = BUILDINGS.filter((b) => (b.fear ?? 0) < 0);
  const bads = BUILDINGS.filter((b) => (b.fear ?? 0) > 0);
  blocks.push(popFactorHead('good'), p(t('popfactor.good')), p(tf('enc.pop.goodText', { v: GOOD_POP, cap: POP_GOOD_CAP })));
  blocks.push({ k: 'chips', items: goods.map((b) => ({ label: `${b.name} (${signed(fearPopularity(b.fear!))})`, icon: bIcon(b, 22), link: linkBuilding(b) })) });
  blocks.push({ k: 'rich', parts: [{ icon: popFactorIcon('garden', 24) }, ' ', t('popfactor.garden')] });
  blocks.push(popFactorHead('bad'), p(t('popfactor.bad')), p(tf('enc.pop.badText', { v: Math.abs(BAD_POP), cap: POP_BAD_CAP })));
  blocks.push({ k: 'chips', items: bads.map((b) => ({ label: `${b.name} (${signed(fearPopularity(b.fear!))})`, icon: bIcon(b, 22), link: linkBuilding(b) })) });
  blocks.push(popFactorHead('fear'), p(t('popfactor.fear')));
  blocks.push(
    p(tf('enc.pop.fearText', { prod: Math.round(FEAR_PROD_STEP * 100), dmg: Math.round(FEAR_DMG_STEP * 100), max: FEAR_MAX })),
  );
  blocks.push(popFactorHead('crowd'), p(t('popfactor.crowd')), p(tf('enc.pop.crowdText', { v: Math.abs(CROWD_POP) })));
  blocks.push(popFactorHead('events'), p(t('popfactor.events')));
  blocks.push(tipBlock(t('enc.pop.tip')));
  return { title: t('enc.nav.popularity'), icon: popFaceIcon(80, 64), subtitle: t('enc.nav.systems'), blocks };
}

// ---------- Kampf ----------

function armorRepresentative(a: number): string {
  if (a === 4) return buildingIcon(BT.WallWood, 28);
  if (a === 5) return buildingIcon(BT.WallHigh, 28);
  const u = UNITS.find((x) => x.armor === a && x.id !== U.Lord && x.id !== U.Ox);
  return u ? uIcon(u, 28) : buildingIcon(BT.Keep, 28);
}

function damageMatrix(): Block {
  return {
    k: 'matrix',
    corner: t('enc.combat.matrixCorner'),
    cols: ARMOR_CLASSES.map((a) => ({ label: armorName(a), icon: armorRepresentative(a), title: t(`armor.${['none', 'light', 'heavy', 'plate', 'bldwood', 'bldstone', 'siegeeng'][a]}.desc`) })),
    rows: DAMAGE_TYPES.map((d) => ({
      label: dtypeName(d),
      title: t(`dtype.${['slash', 'pierce', 'blunt', 'siege', 'fire'][d]}.desc`),
      cells: ARMOR_CLASSES.map((a) => ({ text: multText(DMG_TABLE[d][a]), value: DMG_TABLE[d][a], title: `${dtypeName(d)} → ${armorName(a)}: ${multText(DMG_TABLE[d][a])}` })),
    })),
  };
}

function unitMatrix(): Block {
  const attackers = UNITS.filter((u) => u.dmg > 0 && u.side !== 'neutral');
  return {
    k: 'matrix',
    corner: t('enc.combat.unitCorner'),
    cols: ARMOR_CLASSES.map((a) => ({ label: armorName(a), icon: armorRepresentative(a) })),
    rows: attackers.map((u) => ({
      label: `${u.name} (${dtypeName(u.dtype)})`,
      icon: uIcon(u, 22),
      cells: ARMOR_CLASSES.map((a) => ({ text: u.bldOnly && a < 4 ? '–' : multText(DMG_TABLE[u.dtype][a]), value: u.bldOnly && a < 4 ? 0 : DMG_TABLE[u.dtype][a] })),
    })),
  };
}

function combatPage(): Doc {
  const blocks: Block[] = [p(t('enc.combat.intro'))];
  blocks.push(h2(t('enc.combat.dtypesTitle')));
  blocks.push(
    kv(
      DAMAGE_TYPES.map((d) => ({
        label: dtypeName(d),
        value: [t(`dtype.${['slash', 'pierce', 'blunt', 'siege', 'fire'][d]}.desc`), ' ', ...join(UNITS.filter((u) => u.dmg > 0 && u.dtype === d && u.side !== 'neutral').map((u) => [unitLink(u, 18)]))],
      })),
    ),
  );
  blocks.push(h2(t('enc.combat.armorTitle')));
  blocks.push(
    kv(
      ARMOR_CLASSES.map((a) => ({
        label: armorName(a),
        value: [
          t(`armor.${['none', 'light', 'heavy', 'plate', 'bldwood', 'bldstone', 'siegeeng'][a]}.desc`),
          ' ',
          ...join(UNITS.filter((u) => u.armor === a && u.id !== U.Ox).map((u) => [unitLink(u, 18)])),
        ],
      })),
    ),
  );
  blocks.push(h2(t('enc.combat.matrixTitle')));
  blocks.push(p(t('enc.combat.matrixIntro')));
  blocks.push(damageMatrix());
  blocks.push(h3(t('enc.combat.unitMatrixTitle')));
  blocks.push(unitMatrix());
  blocks.push(h2(t('enc.combat.fearTitle')));
  blocks.push(p(tf('enc.combat.fearText', { prod: Math.round(FEAR_PROD_STEP * 100), dmg: Math.round(FEAR_DMG_STEP * 100), max: FEAR_MAX })));
  blocks.push(h2(t('enc.combat.stancesTitle')));
  blocks.push(p(t('enc.combat.stancesIntro')));
  blocks.push(kv(['stance_hold', 'stance_defensive', 'stance_aggressive'].map((k) => ({ label: TOOL_ICONS[k].name, value: [{ icon: toolIcon(k, 24) }, ' ', t(`tool.${k}`)] }))));
  blocks.push(h2(t('enc.combat.formationsTitle')));
  blocks.push(kv(['formation_free', 'formation_line', 'formation_box', 'formation_wedge'].map((k) => ({ label: TOOL_ICONS[k].name, value: [{ icon: toolIcon(k, 24) }, ' ', t(`tool.${k}`)] }))));
  blocks.push(h2(t('enc.combat.orders')));
  blocks.push(kv(['move', 'attack', 'groundattack', 'patrol', 'stop'].map((k) => ({ label: TOOL_ICONS[k].name, value: [{ icon: toolIcon(k, 24) }, ' ', t(`tool.${k}`)] }))));
  blocks.push(p(tf('enc.combat.limit', { limit: DEFAULT_TROOP_LIMIT })));
  blocks.push(tipBlock(t('enc.combat.tip')));
  return { title: t('enc.nav.combat'), icon: toolIcon('attack', 64), subtitle: t('enc.nav.systems'), blocks };
}

// ---------- Belagerung ----------

interface SiegeTopic {
  id: string;
  icon: string;
  units?: number[];
  buildings?: number[];
  extra?: () => Rich[];
}

function siegeTopics(): SiegeTopic[] {
  return [
    { id: 'ram', icon: uIcon(UNITS[U.Ram], 48), units: [U.Ram] },
    { id: 'catapult', icon: uIcon(UNITS[U.Catapult], 48), units: [U.Catapult] },
    { id: 'trebuchet', icon: uIcon(UNITS[U.Trebuchet], 48), units: [U.Trebuchet] },
    { id: 'fireballista', icon: uIcon(UNITS[U.FireBallista], 48), units: [U.FireBallista] },
    { id: 'tower', icon: uIcon(UNITS[U.SiegeTower], 48), units: [U.SiegeTower, U.Mantlet] },
    { id: 'ladders', icon: uIcon(UNITS[U.Laddermen], 48), units: [U.Laddermen] },
    { id: 'tunnel', icon: uIcon(UNITS[U.Tunneler], 48), units: [U.Tunneler] },
    {
      id: 'fire',
      icon: abilityIcon(3, 48),
      units: [U.Slave, U.Firethrower],
      buildings: [BT.Well, BT.WaterPot],
      extra: () => [[tf('enc.siege.fire.numbers', { dps: FIRE_DPS, dur: FIRE_DURATION, well: WELL_RADIUS, pot: POT_RADIUS })]],
    },
    {
      id: 'oil',
      icon: buildingIcon(BT.Cauldron, 48),
      buildings: [BT.Cauldron, BT.PitchRig, BT.PitchDitch],
      extra: () => [[tf('enc.siege.oil.numbers', { range: CAULDRON.range, dmg: CAULDRON.dmg, cd: CAULDRON.cooldown / TICK_RATE, radius: CAULDRON.radius })]],
    },
    { id: 'traps', icon: buildingIcon(BT.KillingPit, 48), buildings: [BT.Pit, BT.KillingPit, BT.PitchDitch] },
    { id: 'turrets', icon: buildingIcon(BT.TurretBallista, 48), buildings: [BT.TowerRound, BT.TurretBallista, BT.TurretMangonel] },
  ];
}

function siegePage(): Doc {
  const blocks: Block[] = [p(t('enc.siege.intro'))];
  blocks.push({ k: 'rule', tone: 'warn', text: t('enc.siege.rulesHint') });
  blocks.push({ k: 'chips', items: [{ label: t('enc.nav.rules'), link: 'rules', icon: toolIcon('help', 22) }] });
  for (const topic of siegeTopics()) {
    blocks.push({ k: 'h', text: t(`enc.siege.${topic.id}.title`), level: 2, icon: topic.icon });
    blocks.push(p(t(`enc.siege.${topic.id}.text`)));
    const chips = [
      ...(topic.units ?? []).map((id) => ({ label: UNITS[id].name, icon: uIcon(UNITS[id], 22), link: linkUnit(UNITS[id]) })),
      ...(topic.buildings ?? []).map((id) => ({ label: BUILDINGS[id].name, icon: bIcon(BUILDINGS[id], 22), link: linkBuilding(BUILDINGS[id]) })),
    ];
    if (chips.length) blocks.push({ k: 'chips', items: chips });
    for (const u of topic.units ?? []) {
      const d = UNITS[u];
      const rows: { label: string; value: Rich }[] = [{ label: d.name, value: [] }];
      rows.length = 0;
      rows.push({ label: `${d.name}: ${t('ui.hp')}`, value: [num(d.hp)] });
      if (d.dmg > 0) rows.push({ label: `${d.name}: ${t('ui.damage')}`, value: [tf('ui.damageFmt', { dmg: d.dmg, type: dtypeName(d.dtype), cd: d.cd })] });
      if (d.range > 2) rows.push({ label: `${d.name}: ${t('ui.range')}`, value: [tf('ui.rangeTiles', { r: d.range })] });
      if (d.minRange > 0) rows.push({ label: `${d.name}: ${t('ui.minRange')}`, value: [tf('ui.rangeTiles', { r: d.minRange })] });
      rows.push({ label: `${d.name}: ${t('ui.cost')}`, value: unitCostRich(d, 20) });
      blocks.push(kv(rows));
    }
    if (topic.extra) for (const r of topic.extra()) blocks.push({ k: 'rich', parts: r });
    blocks.push({ k: 'rule', tone: 'info', text: t(`enc.siege.${topic.id}.counter`) });
  }
  blocks.push(h2(t('enc.siege.counterTitle')));
  blocks.push(ul(['moat', 'oil', 'cavalry', 'repair', 'turrets', 'sally'].map((k) => [t(`enc.siege.counter.${k}`)])));
  return { title: t('enc.nav.siege'), icon: uIcon(UNITS[U.Ram], 64), subtitle: t('enc.nav.systems'), blocks };
}

// ---------- Extreme-Fähigkeiten ----------

export function abilitiesPage(hk?: Record<HotkeyAction, string>): Doc {
  const keys = hk ?? DEFAULT_HOTKEYS;
  const blocks: Block[] = [p(t('enc.abilities.intro'))];
  blocks.push(
    ul([
      [tf('enc.abilities.power', { max: EXTREME.powerMax, base: EXTREME.baseRate })],
      [tf('enc.abilities.kills', { kill: EXTREME.killGain })],
      [tf('enc.abilities.banners', { rate: EXTREME.bannerRate, max: EXTREME.bannerMax, every: EXTREME.bannerEvery, time: EXTREME.captureTime, radius: EXTREME.captureRadius })],
    ]),
  );
  blocks.push(h2(t('enc.abilities.list')));
  blocks.push({
    k: 'table',
    head: [[t('enc.abilities.colName')], [t('ui.powerCost')], [t('ui.cooldown')], [t('ui.radius')], [t('ui.hotkey')]],
    rows: ABILITIES.map((a) => [
      [{ icon: abilityIcon(a.id, 28), text: a.name, cls: 'b' }],
      [num(a.cost)],
      [sec(a.cooldown)],
      [a.radius > 0 ? tf('ui.rangeTiles', { r: a.radius }) : '–'],
      [keyLabel(keys[`ability${a.id + 1}` as HotkeyAction])],
    ]),
  });
  for (const a of ABILITIES) {
    blocks.push({ k: 'h', text: a.name, level: 3, icon: abilityIcon(a.id, 32) });
    blocks.push(p(tf(`ability.${a.key}.desc`)));
    if (a.key === 'gold') blocks.push(p(tf('enc.abilities.goldAmount', { gold: EXTREME.goldDonation })));
    if (a.key === 'reinforce') blocks.push(p(tf('enc.abilities.reinforceCount', { n: EXTREME.reinforceCount })));
    blocks.push({ k: 'tip', text: t(`ability.${a.key}.tip`), label: t('ui.tip') });
  }
  return { title: t('enc.nav.abilities'), icon: abilityIcon(3, 64), subtitle: t('enc.nav.systems'), blocks };
}

// ---------- Regeländerungen ----------

function rulesPage(): Doc {
  const blocks: Block[] = [p(t('enc.rules.intro'))];
  blocks.push(h2(t('enc.rules.build.title')));
  blocks.push(p(tf('enc.rules.build.text', { radius: ENEMY_BUILD_RADIUS })));
  blocks.push({ k: 'rule', tone: 'warn', text: tf('placefail.enemy', { radius: ENEMY_BUILD_RADIUS }) });
  blocks.push(h2(t('enc.rules.target.title')));
  blocks.push(p(t('enc.rules.target.text')));
  const autos = UNITS.filter((u) => u.siege && !u.bldOnly && u.dmg > 0);
  blocks.push({ k: 'chips', items: autos.map((u) => ({ label: u.name, icon: uIcon(u, 22), link: linkUnit(u) })) });
  blocks.push(h2(t('enc.rules.range.title')));
  blocks.push(p(t('enc.rules.range.text')));
  const rows: Rich[][] = [
    [[buildingLink(BUILDINGS[BT.TurretBallista])], [tf('ui.rangeTiles', { r: TURRETS.ballista.range })], [tf('ui.rangeTiles', { r: TURRETS.ballista.minRange })], [tf('ui.damageFmt', { dmg: TURRETS.ballista.dmg, type: dtypeName(1), cd: TURRETS.ballista.cooldown / TICK_RATE })]],
    [[buildingLink(BUILDINGS[BT.TurretMangonel])], [tf('ui.rangeTiles', { r: TURRETS.mangonel.range })], [tf('ui.rangeTiles', { r: TURRETS.mangonel.minRange })], [tf('ui.damageFmt', { dmg: TURRETS.mangonel.dmg, type: dtypeName(3), cd: TURRETS.mangonel.cooldown / TICK_RATE })]],
    ...[U.Catapult, U.Trebuchet, U.FireBallista].map((id) => {
      const d = UNITS[id];
      return [[unitLink(d)], [tf('ui.rangeTiles', { r: d.range })], [tf('ui.rangeTiles', { r: d.minRange })], [tf('ui.damageFmt', { dmg: d.dmg, type: dtypeName(d.dtype), cd: d.cd })]] as Rich[];
    }),
  ];
  blocks.push({ k: 'table', head: [[t('enc.rules.colWeapon')], [t('ui.range')], [t('ui.minRange')], [t('ui.damage')]], rows });
  blocks.push(tipBlock(t('enc.rules.tip')));
  return { title: t('enc.nav.rules'), icon: toolIcon('help', 64), subtitle: t('enc.nav.systems'), blocks };
}

// ---------- Steuerung ----------

const HOTKEY_GROUPS: { id: string; actions: HotkeyAction[] }[] = [
  { id: 'camera', actions: ['panUp', 'panDown', 'panLeft', 'panRight', 'rotateLeft', 'rotateRight', 'zoomIn', 'zoomOut', 'centerKeep'] },
  { id: 'units', actions: ['stop', 'hold', 'defensive', 'aggressive', 'attackMove', 'patrol', 'attackGround', 'selectAllArmy'] },
  { id: 'build', actions: ['rotateBuilding', 'cancel', 'demolish', 'repair', 'cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6'] },
  { id: 'menus', actions: ['toggleStock', 'toggleMarket', 'togglePopularity', 'toggleAdmin', 'pause', 'encyclopedia', 'toggleMute', 'toggleShadows'] },
  { id: 'abilities', actions: ['ability1', 'ability2', 'ability3', 'ability4', 'ability5'] },
];

function controlsPage(hk?: Record<HotkeyAction, string>): Doc {
  const keys = hk ?? DEFAULT_HOTKEYS;
  const blocks: Block[] = [p(t('enc.controls.intro'))];
  blocks.push(h2(t('enc.controls.mouse')));
  blocks.push(ul(['select', 'box', 'double', 'move', 'shift', 'cancel', 'wheel', 'minimap'].map((k) => [t(`enc.controls.mouse.${k}`)])));
  blocks.push(h2(t('enc.controls.keys')));
  for (const g of HOTKEY_GROUPS) {
    blocks.push(h3(t(`enc.controls.group.${g.id}`)));
    blocks.push({ k: 'table', head: [[t('enc.controls.action')], [t('ui.hotkey')]], rows: g.actions.map((a) => [[HOTKEY_LABELS[a]], [{ text: keyLabel(keys[a]), bold: true }]]) });
  }
  blocks.push(p(t('enc.controls.groups')));
  blocks.push(tipBlock(t('enc.controls.tip')));
  return { title: t('enc.nav.controls'), icon: toolIcon('hotkeys', 64), subtitle: t('enc.nav.more'), blocks };
}

// ---------- KI-Lords ----------

function lordsPage(): Doc {
  const blocks: Block[] = [p(t('enc.lords.intro'))];
  for (const prof of AI_PROFILES) {
    blocks.push({ k: 'h', text: `${prof.name} – ${prof.title}`, level: 2 });
    blocks.push(p(prof.desc));
    const top = [...prof.army.units].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const rows: { label: string; value: Rich }[] = [
      { label: t('enc.lords.castle'), value: [`${prof.castle.name}, ${BUILDINGS[prof.castle.wall].name}${prof.castle.moat ? ', ' + t('enc.lords.moat') : ''}`] },
      { label: t('enc.lords.units'), value: join(top.map(([u]) => [unitLink(UNITS[u], 20)])) },
    ];
    if (prof.army.siege.length) rows.push({ label: t('enc.lords.siege'), value: join(prof.army.siege.slice(0, 3).map(([u]) => [unitLink(UNITS[u], 20)])) });
    rows.push({ label: t('enc.lords.firstAttack'), value: [tf('enc.lords.minutes', { m: Math.round(prof.army.firstAttack / TICK_RATE / 60) })] });
    rows.push({ label: t('enc.lords.interval'), value: [tf('enc.lords.minutes', { m: Math.round((prof.army.waveInterval / TICK_RATE / 60) * 10) / 10 })] });
    blocks.push(kv(rows));
    if (prof.hidden) blocks.push({ k: 'rule', tone: 'info', text: t('enc.lords.hidden') });
  }
  return { title: t('enc.nav.lords'), icon: uIcon(UNITS[U.Lord], 64), subtitle: t('enc.nav.more'), blocks };
}

// ---------- Startseite ----------

function startPage(hk?: Record<HotkeyAction, string>): Doc {
  const blocks: Block[] = [p(t('enc.start.p1')), p(t('enc.start.p2'))];
  blocks.push(h3(t('enc.start.sections')));
  blocks.push({
    k: 'chips',
    items: [
      { label: t('enc.nav.buildings'), link: 'buildings', icon: buildingIcon(BT.Keep, 24) },
      { label: t('enc.nav.units'), link: 'units', icon: toolIcon('troops', 24) },
      { label: t('enc.nav.resources'), link: 'resources', icon: resourceIcon(0, 24) },
      { label: t('enc.nav.chains'), link: 'chains', icon: resourceIcon(RES_INFO.findIndex((r) => r.key === 'bread'), 24) },
      { label: t('enc.nav.popularity'), link: 'popularity', icon: popFaceIcon(80, 24) },
      { label: t('enc.nav.combat'), link: 'combat', icon: toolIcon('attack', 24) },
      { label: t('enc.nav.siege'), link: 'siege', icon: uIcon(UNITS[U.Ram], 24) },
      { label: t('enc.nav.abilities'), link: 'abilities', icon: abilityIcon(3, 24) },
      { label: t('enc.nav.rules'), link: 'rules', icon: toolIcon('help', 24) },
      { label: t('enc.nav.controls'), link: 'controls', icon: toolIcon('hotkeys', 24) },
      { label: t('enc.nav.lords'), link: 'lords', icon: uIcon(UNITS[U.Lord], 24) },
    ],
  });
  blocks.push(h3(t('enc.start.firstSteps')));
  blocks.push(ul(['a', 'b', 'c', 'd', 'e'].map((k) => [t(`enc.start.step.${k}`)])));
  blocks.push(tipBlock(tf('enc.start.tip', { key: keyLabel((hk ?? DEFAULT_HOTKEYS).encyclopedia) })));
  return { title: t('enc.title'), icon: toolIcon('encyclopedia', 64), blocks };
}

// ---------- Seitenliste ----------

export function encPages(opts: EncOptions = {}): Map<string, EncPage> {
  const m = new Map<string, EncPage>();
  const add = (id: string, title: string, group: string, icon: string, build: () => Doc): void => {
    m.set(id, { id, title, group, icon, build });
  };
  add('start', t('enc.nav.start'), 'start', toolIcon('help', 24), () => startPage(opts.hotkeys));
  add('buildings', t('enc.nav.buildings'), 'buildings', buildingIcon(BT.Keep, 24), buildingsOverview);
  for (const d of BUILDINGS) add(P.building(d.key), d.name, 'buildings', bIcon(d, 24), () => buildingPage(d));
  add('units', t('enc.nav.units'), 'units', toolIcon('troops', 24), unitsOverview);
  for (const u of UNITS) add(P.unit(u.key), u.name, 'units', uIcon(u, 24), () => unitPage(u));
  add('resources', t('enc.nav.resources'), 'resources', rIcon(0, 24), resourcesOverview);
  add(P.resource('gold'), t('ui.gold'), 'resources', toolIcon('gold', 24), goldPage);
  RES_INFO.forEach((r, i) => add(P.resource(r.key), r.name, 'resources', rIcon(i, 24), () => resourcePage(i)));
  add('chains', t('enc.nav.chains'), 'chains', rIcon(0, 24), chainsOverview);
  for (const c of CHAIN_IDS) add(P.chain(c), t(`enc.chain.${c}.title`), 'chains', buildingIcon(c === 'horses' ? BT.Stable : chainBuildings(chainGraph(c))[0], 24), () => chainPage(c));
  add('popularity', t('enc.nav.popularity'), 'systems', popFaceIcon(80, 24), popularityPage);
  add('combat', t('enc.nav.combat'), 'systems', toolIcon('attack', 24), combatPage);
  add('siege', t('enc.nav.siege'), 'systems', uIcon(UNITS[U.Ram], 24), siegePage);
  add('abilities', t('enc.nav.abilities'), 'systems', abilityIcon(3, 24), () => abilitiesPage(opts.hotkeys));
  add('rules', t('enc.nav.rules'), 'systems', toolIcon('help', 24), rulesPage);
  add('controls', t('enc.nav.controls'), 'more', toolIcon('hotkeys', 24), () => controlsPage(opts.hotkeys));
  add('lords', t('enc.nav.lords'), 'more', uIcon(UNITS[U.Lord], 24), lordsPage);
  return m;
}

/** Seiten-ID auflösen: akzeptiert volle IDs („building/quarry“), nackte Schlüssel („quarry“) und Gebäude-/Einheiten-Typen. */
export function resolvePage(pages: Map<string, EncPage>, id?: string | null): string {
  if (!id) return 'start';
  if (pages.has(id)) return id;
  for (const prefix of ['building/', 'unit/', 'resource/', 'chain/']) if (pages.has(prefix + id)) return prefix + id;
  return 'start';
}

/** Volltextsuche über Titel und Inhalt. Titeltreffer zuerst. */
export function searchPages(pages: Map<string, EncPage>, query: string, cache?: Map<string, string>): EncPage[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (!words.length) return [];
  const hits: { page: EncPage; score: number }[] = [];
  for (const page of pages.values()) {
    const title = page.title.toLowerCase();
    let text = cache?.get(page.id);
    if (text === undefined) {
      text = docText(page.build()).toLowerCase();
      cache?.set(page.id, text);
    }
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (title.includes(w)) score += title === w ? 100 : title.startsWith(w) ? 30 : 20;
      else if (text.includes(w)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) hits.push({ page, score });
  }
  hits.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title, 'de'));
  return hits.map((h) => h.page);
}
