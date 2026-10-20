/**
 * Kopfleisten-Zahlen des HUD als reine Funktionen (ohne DOM): Warnzustände und Tooltip-Inhalte für Gold, Bauern,
 * Truppen, Angst, Nahrungsvorrat und Rohstoffe. Grenzwerte gleichen denen des Beraters, damit Anzeige und Hinweis übereinstimmen.
 */
import { FEAR_DMG_STEP, FEAR_PROD_STEP, FOOD_RES, R, RATION_FOOD, RATION_NAMES, RES_INFO, TAX_GOLD, TICKS_PER_MONTH, explainPopularity, popNum } from '@strongpoly/shared';
import type { PlayerView } from '@strongpoly/shared';
import type { Doc } from './doc/blocks';

export type Level = 'ok' | 'warn' | 'crit';

/** Bestandsgrenzen je Ware: ab `arm` gilt die Ware als gebraucht, unter `low` knapp. Ein Bestand, der nie vorhanden war, warnt nicht. */
export const RES_LIMITS: Record<number, { arm: number; low: number; ok: number }> = {
  [R.Wood]: { arm: 40, low: 20, ok: 45 },
  [R.Stone]: { arm: 40, low: 20, ok: 45 },
  [R.Iron]: { arm: 20, low: 8, ok: 25 },
  [R.Pitch]: { arm: 20, low: 8, ok: 25 },
};

/** Nahrungsvorrat in Monaten (bei aktuellen Rationen); `months` ist Infinity, wenn nichts verbraucht wird */
export function foodSupply(v: Pick<PlayerView, 'stock' | 'peasants' | 'ration'>): { total: number; need: number; months: number } {
  let total = 0;
  for (const r of FOOD_RES) total += v.stock[r] ?? 0;
  const need = v.peasants * (RATION_FOOD[v.ration] ?? 0);
  return { total, need, months: need > 0 ? total / need : Infinity };
}

/** Zustand eines Rohstoffs; `armed` = war schon einmal reichlich vorhanden */
export function resLevel(res: number, stock: number, armed: boolean): Level {
  const c = RES_LIMITS[res];
  if (!c || !armed) return 'ok';
  if (stock <= 0) return 'crit';
  return stock < c.low ? 'warn' : 'ok';
}

/** Zustand des Nahrungsvorrats */
export function foodLevel(v: Pick<PlayerView, 'stock' | 'peasants' | 'ration' | 'foodShort'>): Level {
  if (v.foodShort) return 'crit';
  const f = foodSupply(v);
  return v.peasants >= 6 && f.need > 0 && f.months < 1.5 ? 'warn' : 'ok';
}

/** Zustand der Bauernzahl: Wohnraum voll bzw. Überfüllung */
export function peasantLevel(v: Pick<PlayerView, 'peasants' | 'housing'>): Level {
  if (v.peasants > v.housing) return 'crit';
  return v.housing > 0 && v.peasants >= v.housing ? 'warn' : 'ok';
}

/** Zustand der Beliebtheit aus der Erklärfunktion */
export function popularityLevel(v: Parameters<typeof explainPopularity>[0]): Level {
  const ex = explainPopularity(v);
  if (ex.pending) return 'ok';
  if (ex.belowThreshold || ex.popularity < 25) return 'crit';
  if (ex.direction === 'down' && ex.secondsToThreshold !== null && ex.secondsToThreshold <= 180) return 'warn';
  return 'ok';
}

/** Zustand des Goldes: Bestechung kann Gold kosten; bei leerer Kasse und Ausgaben warnen */
export function goldLevel(v: Pick<PlayerView, 'gold' | 'peasants' | 'tax'>): Level {
  const income = v.peasants * TAX_GOLD[v.tax];
  return income < 0 && v.gold < -income * 2 ? (v.gold < -income ? 'crit' : 'warn') : 'ok';
}

/** Zustand der Truppenzahl: am Limit */
export function troopLevel(v: Pick<PlayerView, 'troops' | 'troopLimit'>): Level {
  return v.troopLimit > 0 && v.troops >= v.troopLimit ? 'warn' : 'ok';
}

const monthSeconds = TICKS_PER_MONTH / 10;

export function goldTipDoc(v: PlayerView): Doc {
  const income = v.peasants * TAX_GOLD[v.tax];
  const incomeTxt = Math.abs(income) < 0.05 ? '0' : popNum(income, true);
  return {
    title: 'Gold',
    subtitle: `${v.gold}`,
    blocks: [
      {
        k: 'kv',
        rows: [
          { label: 'Steuern pro Monat', value: [{ text: incomeTxt, cls: income > 0 ? 'pos' : income < 0 ? 'neg' : '', bold: true }] },
          { label: 'Steuerstufe', value: [String(v.tax)] },
        ],
      },
      { k: 'p', text: `Ein Monat dauert ${monthSeconds} Sekunden bei Geschwindigkeit 1×. Klick: Verwaltung (Steuern, Rationen).` },
    ],
  };
}

export function peasantsTipDoc(v: PlayerView): Doc {
  const ex = explainPopularity(v);
  const free = v.housing - v.peasants;
  const blocks: Doc['blocks'] = [{ k: 'kv', rows: [{ label: 'Bauern', value: [{ text: String(v.peasants), bold: true }] }, { label: 'Wohnraum', value: [String(v.housing)] }, { label: 'Frei', value: [{ text: String(Math.max(0, free)), cls: free <= 0 ? 'neg' : '' }] }] }];
  if (ex.leaving.active) blocks.push({ k: 'rule', text: `Es wandern Bauern ab: einer alle ${ex.leaving.secondsPerPeasant} Sekunden (Beliebtheit unter ${ex.threshold}).`, tone: 'warn' });
  else if (v.peasants >= v.housing) blocks.push({ k: 'rule', text: v.peasants > v.housing ? 'Überfüllung: mehr Bauern als Platz. Das kostet Beliebtheit. Baut Hütten.' : 'Kein Wohnraum mehr frei: Es kommen keine neuen Bauern. Baut Hütten.', tone: 'warn' });
  else if (ex.growth.active) blocks.push({ k: 'p', text: `Zuzug: ein Bauer alle ${Math.round(ex.growth.secondsPerPeasant * 10) / 10} Sekunden.` });
  blocks.push({ k: 'p', text: 'Klick: Verwaltung (Steuern, Rationen).' });
  return { title: 'Bauern', subtitle: `${v.peasants} / ${v.housing}`, blocks };
}

export function troopsTipDoc(v: PlayerView): Doc {
  return {
    title: 'Truppen',
    subtitle: `${v.troops} / ${v.troopLimit}`,
    blocks: [
      { k: 'p', text: 'Gezählt werden alle Soldaten (ohne Bauern und Ochsen). Das Truppenlimit gilt für die ganze Partie.' },
      ...(v.troopLimit > 0 && v.troops >= v.troopLimit ? ([{ k: 'rule', text: 'Das Truppenlimit ist erreicht. Mehr Soldaten lassen sich nicht ausbilden.', tone: 'warn' }] as Doc['blocks']) : []),
    ],
  };
}

export function fearTipDoc(v: PlayerView): Doc {
  const prod = Math.round(FEAR_PROD_STEP * v.fear * 100);
  const dmg = Math.round(FEAR_DMG_STEP * v.fear * 100);
  const sign = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
  return {
    title: 'Angstfaktor',
    subtitle: v.fear > 0 ? `+${v.fear}` : String(v.fear),
    blocks: [
      {
        k: 'kv',
        rows: [
          { label: 'Arbeitsleistung', value: [{ text: `${sign(prod)} %`, cls: prod > 0 ? 'pos' : prod < 0 ? 'neg' : '', bold: true }] },
          { label: 'Kampfkraft der eigenen Truppen', value: [{ text: `${sign(-dmg)} %`, cls: dmg > 0 ? 'neg' : dmg < 0 ? 'pos' : '', bold: true }] },
        ],
      },
      { k: 'p', text: 'Schlechte Dinge (Galgen, Pranger, Verlies) erhöhen den Angstfaktor, gute (Garten, Statue, Maibaum) senken ihn.' },
    ],
  };
}

/** Rohstoff-Zeile: Hinweis zum Vorrat (nur wenn knapp) */
export function resWarnText(res: number, stock: number, level: Level): string {
  if (level === 'ok') return '';
  const name = RES_INFO[res]?.name ?? 'Ware';
  return level === 'crit' ? `${name}: Der Vorrat ist aufgebraucht.` : `${name}: Der Vorrat wird knapp (${stock}).`;
}

/** Nahrungs-Hinweis für die Ressourcenleiste */
export function foodWarnText(v: Pick<PlayerView, 'stock' | 'peasants' | 'ration' | 'foodShort'>): string {
  const f = foodSupply(v);
  if (v.foodShort) return `Hunger: Es gibt keine Nahrung mehr. Rationen: ${RATION_NAMES[v.ration]}.`;
  if (!Number.isFinite(f.months)) return `Vorrat ${f.total}. Bei „${RATION_NAMES[v.ration]}“ Rationen wird nichts verbraucht.`;
  return `Vorrat ${f.total}, Verbrauch etwa ${popNum(f.need)} pro Monat: reicht noch ${popNum(f.months)} Monate.`;
}
