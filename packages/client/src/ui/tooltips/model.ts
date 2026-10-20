/**
 * Tooltip-Inhalte als neutrale Beschreibung (`Doc`). Keine DOM-Abhängigkeit, alle Zahlen aus shared/data.
 */
import {
  ABILITIES,
  BT,
  BUILDINGS,
  CATEGORIES,
  ENEMY_BUILD_RADIUS,
  OXEN_PER_TETHER,
  RES_INFO,
  SELL_RATIO,
  STORE_CAP_PER_MODULE,
  UNITS,
  hasText,
  matchups,
  t,
  tf,
} from '@strongpoly/shared';
import type { Block, Doc, Rich } from '../doc/blocks';
import { buildingEffects } from '../info/effects';
import {
  armorName,
  bIcon,
  costRich,
  dtypeName,
  enemyRule,
  hasEnemyBuildBan,
  haulerKey,
  num,
  placementRules,
  recipeFlows,
  recruitBuilding,
  requirements,
  storeOfRes,
  uIcon,
  unitCostRich,
  unitSpecials,
  isFreeUnit,
  aIcon,
  rIcon,
} from '../info/facts';
import { matchupRows } from '../info/matchupDoc';
import { TOOL_ICONS, toolIcon } from '../icons';
import type { BuildingDef, UnitDef } from '@strongpoly/shared';

/** Platzhalter, die in den Beschreibungstexten eines Gebäudes vorkommen dürfen */
export function buildingParams(def: BuildingDef): Record<string, number | undefined> {
  return { housing: def.housing, radius: def.prod?.radius, oxen: OXEN_PER_TETHER };
}

/** Beschreibung + Tipp eines Gebäudes (Platzhalter ersetzt) */
export function buildingTexts(def: BuildingDef): { desc: string; tip: string } {
  const p = buildingParams(def);
  return { desc: tf(`building.${def.key}.desc`, p), tip: tf(`building.${def.key}.tip`, p) };
}

export function unitTexts(def: UnitDef): { desc: string; tip: string } {
  return { desc: t(`unit.${def.key}.desc`), tip: t(`unit.${def.key}.tip`) };
}

/** Produktionszeilen: Eingang → Ausgang, Zeit, Lieferweg */
export function productionRows(def: BuildingDef, size = 20): { label: string; value: Rich }[] {
  const rows: { label: string; value: Rich }[] = [];
  const flows = recipeFlows(def);
  for (const f of flows) {
    const line: Rich = [];
    if (f.inputs.length) {
      f.inputs.forEach((i, k) => {
        if (k) line.push(' + ');
        line.push({ icon: rIcon(i.res, size), text: String(i.amt), title: `${i.amt} ${RES_INFO[i.res].name}` });
      });
      line.push(' → ');
    } else {
      line.push({ icon: bIcon(def, size), title: def.name }, ' → ');
    }
    line.push({ icon: rIcon(f.out.res, size), text: String(f.out.amt), title: `${f.out.amt} ${RES_INFO[f.out.res].name}` });
    line.push({ text: '  ' + tf('ui.everySeconds', { s: f.time }), cls: 'dim' });
    rows.push({ label: f.recipe.name, value: line });
    rows.push({ label: t('ui.perPiece'), value: [tf('ui.secondsEach', { s: f.perPiece })] });
    if (f.extra) {
      rows.push({
        label: t('ui.byproduct'),
        value: [{ icon: rIcon(f.extra.res, size), text: String(f.extra.amt), title: RES_INFO[f.extra.res].name }, ' ', tf('ui.everyCycles', { n: f.extra.every })],
      });
    }
  }
  if (flows.length) {
    const targets = [...new Set(flows.map((f) => f.target.id))].map((id) => BUILDINGS[id]);
    const hauler = haulerKey(def);
    const batch = def.prod?.batch ?? 0;
    rows.push({
      label: t('ui.delivery'),
      value: [
        hauler === 'ox' ? tf('ui.haulOx', { batch }) : tf('ui.haulWorker', { batch }),
        ' ',
        ...targets.flatMap((b, i) => (i ? [' / ', { icon: bIcon(b, size), text: b.name }] : [{ icon: bIcon(b, size), text: b.name }])),
      ],
    });
  }
  return rows;
}

function categoryName(def: BuildingDef): string {
  return CATEGORIES.find((c) => c.id === def.cat)?.name ?? '';
}

export function buildingTipDoc(typeId: number): Doc {
  const def = BUILDINGS[typeId];
  if (!def) throw new Error(`Unbekanntes Gebäude ${typeId}`);
  const { desc, tip } = buildingTexts(def);
  const blocks: Block[] = [{ k: 'p', text: desc }];
  const kv: { label: string; value: Rich }[] = [{ label: t('ui.cost'), value: costRich(def.cost) }];
  if (def.workers > 0) kv.push({ label: t('ui.workers'), value: [{ icon: toolIcon('peasants', 18), text: String(def.workers) }] });
  kv.push({ label: t('ui.size'), value: [tf('ui.sizeFmt', { w: def.w, h: def.h })] });
  if (def.hp > 0) kv.push({ label: t('ui.hp'), value: [num(def.hp)] });
  blocks.push({ k: 'kv', rows: kv });

  const rules = placementRules(def);
  if (hasEnemyBuildBan(def)) rules.push(enemyRule());
  if (rules.length) {
    blocks.push({ k: 'h', text: t('ui.rule'), level: 3 });
    for (const r of rules) blocks.push({ k: 'rule', text: r.text, tone: r.tone });
  }
  const reqs = requirements(def);
  if (reqs.length) blocks.push({ k: 'kv', rows: [{ label: t('ui.requires'), value: [reqs.join(' · ')] }] });

  const prod = productionRows(def);
  if (prod.length) {
    blocks.push({ k: 'h', text: t('ui.production'), level: 3 });
    blocks.push({ k: 'kv', rows: prod });
  }
  const eff = buildingEffects(def);
  if (eff.length) {
    blocks.push({ k: 'h', text: t('ui.effect'), level: 3 });
    blocks.push({ k: 'kv', rows: eff });
  }
  blocks.push({ k: 'tip', text: tip, label: t('ui.tip') });
  return { title: def.name, icon: bIcon(def, 44), subtitle: categoryName(def), blocks };
}

function sideName(def: UnitDef): string {
  return t(`ui.side.${def.side}`);
}

export function unitTipDoc(typeId: number, teamColor?: number): Doc {
  const def = UNITS[typeId];
  if (!def) throw new Error(`Unbekannte Einheit ${typeId}`);
  const { desc, tip } = unitTexts(def);
  const blocks: Block[] = [{ k: 'p', text: desc }];
  const kv: { label: string; value: Rich }[] = [];
  const rb = recruitBuilding(def);
  if (rb) {
    kv.push({ label: t('ui.cost'), value: unitCostRich(def) });
    kv.push({ label: t('ui.recruitAt'), value: [{ icon: bIcon(rb, 18), text: rb.name }] });
    kv.push({ label: t('ui.trainTime'), value: [tf('ui.secondsFmt', { s: def.train })] });
  } else if (!isFreeUnit(def)) {
    kv.push({ label: t('ui.cost'), value: unitCostRich(def) });
  }
  kv.push({ label: t('ui.hp'), value: [num(def.hp)] });
  kv.push({ label: t('ui.armor'), value: [armorName(def.armor)] });
  if (def.dmg > 0) kv.push({ label: t('ui.damage'), value: [tf('ui.damageFmt', { dmg: def.dmg, type: dtypeName(def.dtype), cd: def.cd })] });
  if (def.dmg > 0 || def.siege) kv.push({ label: t('ui.range'), value: [def.range > 2 ? tf('ui.rangeTiles', { r: def.range }) : t('ui.melee')] });
  kv.push({ label: t('ui.speed'), value: [tf('ui.speedFmt', { v: def.speed })] });
  blocks.push({ k: 'kv', rows: kv });

  const sp = unitSpecials(def);
  if (sp.length) {
    blocks.push({ k: 'h', text: t('ui.specials'), level: 3 });
    blocks.push({ k: 'list', items: sp.map((s) => [s.text]) });
  }
  const mrows = matchupRows(matchups(typeId));
  if (mrows.length) {
    blocks.push({ k: 'h', text: t('ui.matchups'), level: 3 });
    blocks.push({ k: 'kv', rows: mrows });
  }
  blocks.push({ k: 'tip', text: tip, label: t('ui.tip') });
  return { title: def.name, icon: uIcon(def, 44, teamColor), subtitle: sideName(def), blocks };
}

export interface ResourceLive {
  /** aktueller Bestand */
  stock?: number;
  /** aktuelle Gesamtkapazität pro Ware */
  capacity?: number;
  /** aktueller Preisfaktor des Marktes (1 = Grundpreis) */
  priceMul?: number;
}

export function resourceTipDoc(resId: number, live: ResourceLive = {}): Doc {
  const info = RES_INFO[resId];
  if (!info) throw new Error(`Unbekannte Ware ${resId}`);
  const blocks: Block[] = [{ k: 'p', text: t(`res.${info.key}.desc`) }];
  const kv: { label: string; value: Rich }[] = [];
  if (live.stock !== undefined) kv.push({ label: t('ui.stock'), value: [num(live.stock)] });
  if (live.capacity !== undefined) kv.push({ label: t('ui.capacity'), value: [num(live.capacity)] });
  kv.push({ label: t('ui.storedIn'), value: [{ icon: bIcon(storeOfRes(resId), 18), text: storeOfRes(resId).name }, ' ', tf('ui.capPerModule', { cap: STORE_CAP_PER_MODULE[info.store] })] });
  const mul = live.priceMul ?? 1;
  kv.push({ label: t('ui.price'), value: [{ icon: toolIcon('gold', 18), text: num(Math.round(info.price * mul * 100) / 100) }] });
  kv.push({ label: t('ui.sellPrice'), value: [{ icon: toolIcon('gold', 18), text: num(Math.floor(info.price * mul * SELL_RATIO)) }] });
  blocks.push({ k: 'kv', rows: kv });
  return { title: info.name, icon: rIcon(resId, 44), subtitle: info.food ? t('ui.food') : t(`ui.store.${info.store}`), blocks };
}

export function abilityTipDoc(id: number): Doc {
  const def = ABILITIES[id];
  if (!def) throw new Error(`Unbekannte Fähigkeit ${id}`);
  const blocks: Block[] = [{ k: 'p', text: tf(`ability.${def.key}.desc`) }];
  const kv: { label: string; value: Rich }[] = [
    { label: t('ui.powerCost'), value: [num(def.cost)] },
    { label: t('ui.cooldown'), value: [tf('ui.secondsFmt', { s: def.cooldown })] },
  ];
  if (def.radius > 0) kv.push({ label: t('ui.radius'), value: [tf('ui.rangeTiles', { r: def.radius })] });
  blocks.push({ k: 'kv', rows: kv });
  blocks.push({ k: 'tip', text: t(`ability.${def.key}.tip`), label: t('ui.tip') });
  return { title: def.name, icon: aIcon(id, 44), subtitle: t('ui.extremeAbility'), blocks };
}

export function toolTipDoc(key: string, hotkey?: string): Doc {
  const tool = TOOL_ICONS[key];
  if (!tool) throw new Error(`Unbekanntes Werkzeug ${key}`);
  const blocks: Block[] = [];
  if (hasText(`tool.${key}`)) blocks.push({ k: 'p', text: t(`tool.${key}`) });
  if (hotkey) blocks.push({ k: 'kv', rows: [{ label: t('ui.hotkey'), value: [{ text: hotkey, bold: true }] }] });
  return { title: tool.name, icon: toolIcon(key, 36), blocks };
}

/**
 * Ausführlicher Text zu einem Platzierungsfehler der Sim (`checkPlace`), z. B. „Feinde in der Nähe“.
 * Liefert null, wenn es keine weitere Erklärung gibt (dann genügt der kurze Fehlertext).
 */
export function placementErrorText(reason: string): string | null {
  if (reason === 'Feinde in der Nähe') return tf('placefail.enemy', { radius: ENEMY_BUILD_RADIUS });
  return null;
}
