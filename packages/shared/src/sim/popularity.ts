import {
  ALE_PER_PEASANT_MONTH,
  ALE_POP_MAX,
  BAD_POP,
  CROWD_POP,
  FEAR_MAX,
  GOOD_POP,
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
  const factors: PopFactor[] = [];

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
  const effRation = short && pl.ration > 0 ? 0 : pl.ration;
  factors.push({ key: 'ration', label: short ? 'Hunger (keine Nahrung)' : 'Rationen', value: RATION_POP[effRation] });
  factors.push({ key: 'variety', label: 'Nahrungsvielfalt', value: Math.max(0, pl.foodTypes - 1) * VARIETY_POP });

  // Steuern
  const gold = (n * TAX_GOLD[pl.tax]) / POP_STEPS_PER_MONTH;
  let taxPop = TAX_POP[pl.tax];
  if (gold < 0 && pl.gold + gold < 0) {
    taxPop = 0;
  } else {
    pl.gold += gold;
    if (gold > 0) pl.stats.goldEarned += gold;
  }
  factors.push({ key: 'tax', label: pl.tax < 0 ? 'Bestechung' : 'Steuern', value: taxPop });

  // Bier
  let aleF = 0;
  pl.aleCover = 0;
  if (inns > 0 && n > 0) {
    const served = Math.min(n, inns * INN_SERVES);
    const need = (served * ALE_PER_PEASANT_MONTH) / POP_STEPS_PER_MONTH;
    const have = pl.stock[R.Ale];
    const cov = served / n;
    if (have >= Math.max(1, Math.floor(need))) {
      aleF = ALE_POP_MAX * cov;
      pl.aleCover = cov;
      pl.aleAcc += need;
      const whole = Math.floor(pl.aleAcc);
      if (whole > 0) {
        sim.takeStock(pid, R.Ale, whole);
        pl.aleAcc -= whole;
      }
    }
  }
  factors.push({ key: 'ale', label: 'Bier', value: aleF });

  // Religion
  const relCov = n > 0 ? Math.min(1, cover.n / n) : 0;
  pl.relCover = relCov;
  factors.push({ key: 'religion', label: 'Religion', value: Math.min(12, cover.pts) * relCov });

  // Gute/schlechte Dinge (direkter Beliebtheitseffekt)
  factors.push({ key: 'good', label: 'Gute Dinge', value: Math.min(8, good * GOOD_POP) });
  factors.push({ key: 'bad', label: 'Schlechte Dinge', value: Math.max(-8, bad * BAD_POP) });

  // Überfüllung
  factors.push({ key: 'crowd', label: 'Überfüllung', value: n > pl.housing ? CROWD_POP : 0 });

  // Ereignisse
  pl.events = pl.events.filter((e) => e.until > sim.tick);
  let ev = 0;
  for (const e of pl.events) ev += e.value;
  if (pl.events.length) factors.push({ key: 'events', label: pl.events.map((e) => e.label).join(', '), value: ev });

  let sum = 0;
  for (const f of factors) sum += f.value;
  pl.factors = factors;
  pl.popTarget = sum;
  pl.popularity = Math.max(0, Math.min(100, pl.popularity + sum / POP_STEPS_PER_MONTH));
}

function spawnAndLeave(sim: Sim, pid: number): void {
  const pl = sim.players[pid];
  const u = sim.units;
  if (pl.popularity >= 50 && pl.peasants < pl.housing) {
    pl.spawnTimer++;
    const interval = Math.max(6, SPAWN_INTERVAL_TICKS * (1 - Math.min(0.6, (pl.popularity - 50) / 100)));
    if (pl.spawnTimer >= interval) {
      pl.spawnTimer = 0;
      if (sim.spawnPeasant(pid) >= 0) pl.peasants++;
    }
  } else if (pl.popularity < 50 && pl.peasants > 0) {
    pl.leaveTimer++;
    if (pl.leaveTimer >= 40) {
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
