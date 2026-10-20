import {
  ALE_PER_PEASANT_MONTH,
  ALE_POP_MAX,
  BAD_POP,
  CROWD_POP,
  FEAR_MAX,
  GOOD_POP,
  POP_BAD_CAP,
  POP_GOOD_CAP,
  POP_THRESHOLD,
  LEAVE_INTERVAL_TICKS,
  RELIGION_POP_CAP,
  INN_SERVES,
  MARKET_PRICE_RECOVER,
  POP_INTERVAL,
  POP_STEPS_PER_MONTH,
  RATION_FOOD,
  RATION_POP,
  RELIGION_COVER,
  RELIGION_POP,
  SPAWN_INTERVAL_TICKS,
  TAX_GOLD,
  TAX_POP,
  VARIETY_POP,
} from '../data/balance';
import { BT } from '../data/buildings';
import { FOOD_RES, R } from '../data/resources';
import { U } from '../data/units';
import type { PopFactor } from './player';
import type { Sim } from './sim';
import { S } from './unitstore';

export function foodTypes(sim: Sim, p: number): number {
  let n = 0;
  for (const r of FOOD_RES) if (sim.players[p].stock[r] > 0) n++;
  return n;
}

/** Eingaben der Faktoren-Zerlegung: alles, was nach den Nebenwirkungen (Essen, Gold, Bier) feststeht. */
export interface PopInputs {
  ration: number;
  /** Nahrung ging in diesem Schritt aus (zählt wie Rationsstufe 0) */
  foodShort: boolean;
  foodTypes: number;
  tax: number;
  /** Bestechung nicht bezahlbar: die Stimmungswirkung der Steuerstufe entfällt */
  taxBlocked: boolean;
  /** Anteil der Bauern mit Bier (0..1, 0 = nicht versorgt) */
  aleCover: number;
  /** Punkte und Abdeckung (Bauern) der besetzten Gotteshäuser */
  religionPts: number;
  religionCover: number;
  /** Summe der guten bzw. schlechten Dinge (positive Beträge) */
  good: number;
  bad: number;
  crowded: boolean;
  /** aktive Ereignisse */
  events: { label: string; value: number }[];
}

/**
 * Zerlegung der Beliebtheitsänderung pro Monat in Faktoren. EINZIGE Stelle, an der die Formeln stehen:
 * die Simulation ruft sie je Intervall (`applyInterval`), die Anzeige zeigt das Ergebnis (`explainPopularity`).
 */
export function popularityFactors(i: PopInputs): PopFactor[] {
  const factors: PopFactor[] = [];
  const effRation = i.foodShort && i.ration > 0 ? 0 : i.ration;
  factors.push({ key: 'ration', label: i.foodShort ? 'Hunger (keine Nahrung)' : 'Rationen', value: RATION_POP[effRation] });
  factors.push({ key: 'variety', label: 'Nahrungsvielfalt', value: Math.max(0, i.foodTypes - 1) * VARIETY_POP });
  factors.push({ key: 'tax', label: i.tax < 0 ? 'Bestechung' : 'Steuern', value: i.taxBlocked ? 0 : TAX_POP[i.tax] });
  factors.push({ key: 'ale', label: 'Bier', value: ALE_POP_MAX * i.aleCover });
  factors.push({ key: 'religion', label: 'Religion', value: Math.min(RELIGION_POP_CAP, i.religionPts) * i.religionCover });
  factors.push({ key: 'good', label: 'Gute Dinge', value: Math.min(POP_GOOD_CAP, i.good * GOOD_POP) });
  factors.push({ key: 'bad', label: 'Schlechte Dinge', value: Math.max(-POP_BAD_CAP, i.bad * BAD_POP) });
  factors.push({ key: 'crowd', label: 'Überfüllung', value: i.crowded ? CROWD_POP : 0 });
  if (i.events.length) {
    let ev = 0;
    for (const e of i.events) ev += e.value;
    factors.push({ key: 'events', label: i.events.map((e) => e.label).join(', '), value: ev });
  }
  return factors;
}

/** Summe der Faktoren = Änderung der Beliebtheit pro Monat (`TICKS_PER_MONTH` Ticks) */
export function popularityTarget(factors: readonly PopFactor[]): number {
  let sum = 0;
  for (const f of factors) sum += f.value;
  return sum;
}

/** Ticks zwischen zwei Neuzugängen bei gegebener Beliebtheit (ab `POP_THRESHOLD`) */
export function spawnIntervalTicks(popularity: number): number {
  return Math.max(6, SPAWN_INTERVAL_TICKS * (1 - Math.min(0.6, (popularity - POP_THRESHOLD) / 100)));
}

/** Beliebtheit, Steuern, Rationen, Bevölkerungswachstum. */
export function updatePopularity(sim: Sim): void {
  const u = sim.units;
  // Bevölkerungszahlen (jeden Tick billig genug, aber nur im Intervall nötig)
  const doInterval = sim.tick % POP_INTERVAL === 0;
  if (doInterval) {
    for (const p of sim.players) {
      p.peasants = 0;
      p.troops = 0;
    }
    for (let s = 0; s < u.top; s++) {
      if (!u.alive[s]) continue;
      const t = u.type[s];
      const pl = sim.players[u.owner[s]];
      if (t === U.Peasant) pl.peasants++;
      else if (t !== U.Ox) pl.troops++;
    }
  }
  for (const p of sim.players) {
    if (!p.alive) continue;
    if (doInterval) {
      applyInterval(sim, p.id);
      const k = 1 - Math.pow(1 - MARKET_PRICE_RECOVER, POP_INTERVAL);
      for (let r = 0; r < p.priceMul.length; r++) p.priceMul[r] += (1 - p.priceMul[r]) * k;
    }
    spawnAndLeave(sim, p.id);
  }
}

function applyInterval(sim: Sim, pid: number): void {
  const pl = sim.players[pid];
  const n = pl.peasants;
  // Fear: gute vs. schlechte Dinge
  let good = 0;
  let bad = 0;
  let inns = 0;
  const cover = { n: 0, pts: 0 };
  for (const b of sim.buildings.values()) {
    if (b.owner !== pid) continue;
    const d = b.def;
    if (d.fear) {
      if (d.fear > 0) bad += d.fear;
      else good += -d.fear;
    }
    if (b.type === BT.Inn && b.staffed > 0) inns++;
    if (d.religion && b.staffed > 0) {
      cover.n += RELIGION_COVER[d.religion];
      cover.pts += RELIGION_POP[d.religion];
    }
  }
  pl.fear = Math.max(-FEAR_MAX, Math.min(FEAR_MAX, bad - good));

  // Rationen
  const eat = (RATION_FOOD[pl.ration] * n) / POP_STEPS_PER_MONTH;
  pl.foodAcc += eat;
  let short = false;
  while (pl.foodAcc >= 1) {
    // größte Menge zuerst → Vielfalt bleibt erhalten
    let best = -1;
    let bv = 0;
    for (const r of FOOD_RES) {
      if (pl.stock[r] > bv) {
        bv = pl.stock[r];
        best = r;
      }
    }
    if (best < 0) {
      short = true;
      pl.foodAcc = 0;
      break;
    }
    sim.takeStock(pid, best, 1);
    pl.foodAcc -= 1;
  }
  pl.foodShort = short;
  pl.foodTypes = foodTypes(sim, pid);
  // Steuern
  const gold = (n * TAX_GOLD[pl.tax]) / POP_STEPS_PER_MONTH;
  let taxBlocked = false;
  if (gold < 0 && pl.gold + gold < 0) {
    taxBlocked = true;
  } else {
    pl.gold += gold;
    if (gold > 0) pl.stats.goldEarned += gold;
  }

  // Bier
  let aleCover = 0;
  pl.aleCover = 0;
  if (inns > 0 && n > 0) {
    const served = Math.min(n, inns * INN_SERVES);
    const need = (served * ALE_PER_PEASANT_MONTH) / POP_STEPS_PER_MONTH;
    const have = pl.stock[R.Ale];
    const cov = served / n;
    if (have >= Math.max(1, Math.floor(need))) {
      aleCover = cov;
      pl.aleCover = cov;
      pl.aleAcc += need;
      const whole = Math.floor(pl.aleAcc);
      if (whole > 0) {
        sim.takeStock(pid, R.Ale, whole);
        pl.aleAcc -= whole;
      }
    }
  }

  // Religion
  const relCov = n > 0 ? Math.min(1, cover.n / n) : 0;
  pl.relCover = relCov;

  // Ereignisse
  pl.events = pl.events.filter((e) => e.until > sim.tick);

  const factors = popularityFactors({
    ration: pl.ration,
    foodShort: short,
    foodTypes: pl.foodTypes,
    tax: pl.tax,
    taxBlocked,
    aleCover,
    religionPts: cover.pts,
    religionCover: relCov,
    good,
    bad,
    crowded: n > pl.housing,
    events: pl.events,
  });
  const sum = popularityTarget(factors);
  pl.factors = factors;
  pl.popTarget = sum;
  pl.popularity = Math.max(0, Math.min(100, pl.popularity + sum / POP_STEPS_PER_MONTH));
}

function spawnAndLeave(sim: Sim, pid: number): void {
  const pl = sim.players[pid];
  const u = sim.units;
  if (pl.popularity >= POP_THRESHOLD && pl.peasants < pl.housing) {
    pl.spawnTimer++;
    const interval = spawnIntervalTicks(pl.popularity);
    if (pl.spawnTimer >= interval) {
      pl.spawnTimer = 0;
      if (sim.spawnPeasant(pid) >= 0) pl.peasants++;
    }
  } else if (pl.popularity < POP_THRESHOLD && pl.peasants > 0) {
    pl.leaveTimer++;
    if (pl.leaveTimer >= LEAVE_INTERVAL_TICKS) {
      pl.leaveTimer = 0;
      // unbeschäftigte zuerst
      let victim = -1;
      for (let s = 0; s < u.top; s++) {
        if (!u.alive[s] || u.owner[s] !== pid || u.type[s] !== U.Peasant) continue;
        if (u.home[s] === 0 && u.sub[s] === 0 && u.state[s] !== S.Dead) {
          victim = s;
          break;
        }
        if (victim < 0) victim = s;
      }
      if (victim >= 0) {
        sim.emit({ e: 'fx', k: 'leave', x: u.x[victim], y: u.y[victim] });
        sim.killUnitSilent(victim);
        pl.peasants--;
      }
    }
  } else {
    pl.spawnTimer = 0;
    pl.leaveTimer = 0;
  }
}
