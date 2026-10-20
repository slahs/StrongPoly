/**
 * Wirkung eines Gebäudes (Beliebtheit, Angstfaktor, Lager, Reichweiten …), abgeleitet aus Datentabellen.
 */
import {
  ALE_POP_MAX,
  BAD_POP,
  BT,
  BuildingDef,
  CAULDRON,
  FEAR_DMG_STEP,
  FEAR_PROD_STEP,
  GOOD_POP,
  HORSES_PER_STABLE,
  HORSE_BREED_SECONDS,
  INN_SERVES,
  OXEN_PER_TETHER,
  POT_RADIUS,
  RELIGION_COVER,
  RELIGION_POP,
  RES_INFO,
  SELL_RATIO,
  STORE_CAP_PER_MODULE,
  TICK_RATE,
  TURRETS,
  WELL_RADIUS,
  t,
  tf,
} from '@strongpoly/shared';
import type { Rich } from '../doc/blocks';
import { dtypeName, num, recruitList, secs } from './facts';
import { toolIcon } from '../icons';

export interface EffectLine {
  label: string;
  value: Rich;
}

/** Vorzeichen-Text: +1,5 / −0,5 */
export function signed(n: number): string {
  const s = num(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

function cls(n: number): string {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
}

/** Beliebtheit pro Monat durch ein Gebäude mit Angstfaktor */
export function fearPopularity(fear: number): number {
  return fear < 0 ? -fear * GOOD_POP : fear * BAD_POP;
}

export function buildingEffects(def: BuildingDef): EffectLine[] {
  const out: EffectLine[] = [];
  if (def.housing) out.push({ label: t('ui.housing'), value: [{ icon: toolIcon('peasants', 18), text: `+${def.housing}` }] });
  if (def.fear) {
    const pop = fearPopularity(def.fear);
    out.push({ label: t('ui.fear'), value: [{ text: signed(def.fear), cls: cls(-def.fear) }, ' ', def.fear > 0 ? t('ui.badThing') : t('ui.goodThing')] });
    out.push({ label: t('ui.popularityMonth'), value: [{ text: signed(pop), cls: cls(pop) }] });
    // Angst: +Produktivität, −Kampfkraft eigener Truppen (und umgekehrt)
    const prod = def.fear * FEAR_PROD_STEP * 100;
    const dmg = -def.fear * FEAR_DMG_STEP * 100;
    out.push({ label: t('ui.workSpeed'), value: [{ text: `${signed(prod)} %`, cls: cls(prod) }] });
    out.push({ label: t('ui.ownDamage'), value: [{ text: `${signed(dmg)} %`, cls: cls(dmg) }] });
  }
  if (def.religion) {
    out.push({ label: t('ui.popularityMonth'), value: [{ text: signed(RELIGION_POP[def.religion]), cls: 'pos' }, ' ', t('ui.atFullCover')] });
    out.push({ label: t('ui.cover'), value: [{ icon: toolIcon('peasants', 18), text: num(RELIGION_COVER[def.religion]) }, ' ', t('ui.needsStaff')] });
  }
  if (def.id === BT.Inn) {
    out.push({ label: t('ui.serves'), value: [{ icon: toolIcon('peasants', 18), text: num(INN_SERVES) }] });
    out.push({ label: t('ui.popularityMonth'), value: [{ text: `+${num(ALE_POP_MAX)}`, cls: 'pos' }, ' ', t('ui.atFullCover')] });
  }
  if (def.store) {
    const names = RES_INFO.filter((r) => r.store === def.store).map((r) => r.name);
    out.push({ label: t('ui.stores'), value: [names.join(', ')] });
    out.push({ label: t('ui.capacityPerModule'), value: [num(STORE_CAP_PER_MODULE[def.store])] });
  }
  if (def.id === BT.Well) out.push({ label: t('ui.extinguish'), value: [tf('ui.radiusTiles', { r: WELL_RADIUS })] });
  if (def.id === BT.WaterPot) out.push({ label: t('ui.extinguish'), value: [tf('ui.radiusTiles', { r: POT_RADIUS })] });
  if (def.id === BT.Stable) out.push({ label: t('ui.horses'), value: [tf('ui.horseBreed', { max: HORSES_PER_STABLE, s: HORSE_BREED_SECONDS })] });
  if (def.id === BT.OxTether) out.push({ label: t('ui.oxen'), value: [num(OXEN_PER_TETHER)] });
  if (def.id === BT.Market) out.push({ label: t('ui.sellRatio'), value: [`${num(SELL_RATIO * 100)} %`] });
  if (def.id === BT.TurretBallista || def.id === BT.TurretMangonel) {
    const tu = def.id === BT.TurretBallista ? TURRETS.ballista : TURRETS.mangonel;
    out.push({ label: t('ui.range'), value: [tf('ui.rangeTiles', { r: tu.range })] });
    out.push({ label: t('ui.minRange'), value: [tf('ui.rangeTiles', { r: tu.minRange })] });
    out.push({ label: t('ui.damage'), value: [tf('ui.damageFmt', { dmg: tu.dmg, type: dtypeName(def.id === BT.TurretBallista ? 1 : 3), cd: secs(tu.cooldown, TICK_RATE) })] });
    if (tu.splash > 0) out.push({ label: t('ui.splash'), value: [tf('ui.radiusTiles', { r: tu.splash })] });
  }
  if (def.id === BT.Cauldron) {
    out.push({ label: t('ui.range'), value: [tf('ui.rangeTiles', { r: CAULDRON.range })] });
    out.push({ label: t('ui.damage'), value: [tf('ui.damageFmt', { dmg: CAULDRON.dmg, type: dtypeName(4), cd: secs(CAULDRON.cooldown, TICK_RATE) })] });
    out.push({ label: t('ui.splash'), value: [tf('ui.radiusTiles', { r: CAULDRON.radius })] });
  }
  if (def.gate) out.push({ label: t('ui.gate'), value: [t('ui.gateText')] });
  if (def.wallTop && def.id !== BT.Keep && !def.gate && !def.stairs) out.push({ label: t('ui.crown'), value: [t('ui.crownText')] });
  const recruits = recruitList(def);
  if (recruits.length) out.push({ label: t('ui.trains'), value: [recruits.map((u) => u.name).join(', ')] });
  return out;
}
