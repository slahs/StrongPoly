import { MARKET_PRICE_STEP, RATION_FOOD, TAX_LEVELS, UNDO_WINDOW_TICKS } from '../data/balance';
import { BT, BUILDINGS } from '../data/buildings';
import { R, RES_COUNT, RES_INFO, SELL_RATIO } from '../data/resources';
import { T } from '../data/terrain';
import { U, UNITS } from '../data/units';
import { orderAttack, orderAttackGround, orderPatrol, orderTunnel } from './combat';
import { igniteAt } from './fire';
import { useAbility } from './extreme';
import { orderMove, orderStance, orderStop } from './orders';
import type { Sim } from './sim';
import type { Command } from './types';
import { S } from './unitstore';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ids = (v: unknown): number[] => (Array.isArray(v) ? (v.filter(num) as number[]) : []);

export function linePoints(x1: number, y1: number, x2: number, y2: number, max = 120): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;
  for (let i = 0; i < max; i++) {
    pts.push([x, y]);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** Rückgängig: nimmt die zuletzt platzierte Baute zurück (voll erstattet), solange sie frisch und unbeschädigt ist */
function undoPlacement(sim: Sim, p: number): void {
  const pl = sim.players[p];
  while (pl.placed.length) {
    const rec = pl.placed[pl.placed.length - 1];
    const b = sim.buildings.get(rec.id);
    if (!b || b.owner !== p) {
      pl.placed.pop();
      continue;
    }
    if (sim.tick - rec.tick > UNDO_WINDOW_TICKS || b.hp < b.maxHp || b.burn > 0) {
      sim.emit({ e: 'msg', p, text: 'Rückgängig nicht mehr möglich (zu spät oder beschädigt).' });
      return;
    }
    pl.placed.pop();
    const c = b.def.cost;
    pl.gold += c.gold ?? 0;
    if (c.wood) sim.addStock(p, R.Wood, c.wood);
    if (c.stone) sim.addStock(p, R.Stone, c.stone);
    if (c.iron) sim.addStock(p, R.Iron, c.iron);
    if (c.pitch) sim.addStock(p, R.Pitch, c.pitch);
    sim.removeBuilding(b, false);
    return;
  }
}

export function applyCommand(sim: Sim, p: number, cmd: Command): void {
  const pl = sim.players[p];
  switch (cmd.c) {
    case 'place':
      if (num(cmd.type) && num(cmd.x) && num(cmd.y)) sim.place(p, cmd.type | 0, cmd.x | 0, cmd.y | 0, cmd.rot ? 1 : 0);
      break;
    case 'placeLine': {
      if (![cmd.type, cmd.x1, cmd.y1, cmd.x2, cmd.y2].every(num)) return;
      const def = BUILDINGS[cmd.type | 0];
      if (!def || !def.line) {
        sim.place(p, cmd.type | 0, cmd.x1 | 0, cmd.y1 | 0, 0);
        return;
      }
      for (const [x, y] of linePoints(cmd.x1 | 0, cmd.y1 | 0, cmd.x2 | 0, cmd.y2 | 0)) {
        if (!sim.canAfford(p, def.cost)) break;
        sim.place(p, def.id, x, y, 0);
      }
      break;
    }
    case 'demolish':
      for (const id of ids(cmd.ids).slice(0, 500)) {
        const b = sim.buildings.get(id);
        if (!b || b.owner !== p || b.type === BT.Keep || b.type === BT.Campfire) continue;
        const c = b.def.cost;
        if (c.wood) sim.addStock(p, 0, Math.floor(c.wood / 2));
        if (c.stone) sim.addStock(p, 1, Math.floor(c.stone / 2));
        if (c.iron) sim.addStock(p, 2, Math.floor(c.iron / 2));
        sim.removeBuilding(b, false);
      }
      break;
    case 'move':
      if (num(cmd.x) && num(cmd.y)) orderMove(sim, p, ids(cmd.units), cmd.x, cmd.y, !!cmd.attack, !!cmd.queue, (cmd.formation ?? 0) | 0);
      break;
    case 'attack':
      if (num(cmd.target)) orderAttack(sim, p, ids(cmd.units), cmd.kind === 'building' ? 2 : 1, cmd.target | 0);
      break;
    case 'attackGround':
      if (num(cmd.x) && num(cmd.y)) orderAttackGround(sim, p, ids(cmd.units), cmd.x, cmd.y);
      break;
    case 'patrol':
      if (num(cmd.x) && num(cmd.y)) orderPatrol(sim, p, ids(cmd.units), cmd.x, cmd.y);
      break;
    case 'tunnel':
      if (num(cmd.x) && num(cmd.y)) orderTunnel(sim, p, ids(cmd.units), cmd.x, cmd.y);
      break;
    case 'stance':
      orderStance(sim, p, ids(cmd.units), cmd.stance | 0);
      break;
    case 'stop':
      orderStop(sim, p, ids(cmd.units));
      break;
    case 'recruit':
      recruit(sim, p, cmd.building | 0, cmd.unit | 0, Math.min(30, Math.max(1, cmd.count | 0)));
      break;
    case 'setTax':
      if (num(cmd.level) && (TAX_LEVELS as readonly number[]).includes(cmd.level | 0)) pl.tax = cmd.level | 0;
      break;
    case 'setRation':
      if (num(cmd.level) && cmd.level >= 0 && cmd.level < RATION_FOOD.length) pl.ration = cmd.level | 0;
      break;
    case 'trade':
      trade(sim, p, cmd.res | 0, Math.min(500, Math.max(1, cmd.amount | 0)), !!cmd.buy);
      break;
    case 'undo':
      undoPlacement(sim, p);
      break;
    case 'setWork': {
      const b = sim.buildings.get(cmd.building | 0);
      if (b && b.owner === p && b.def.workers > 0) {
        b.off = !cmd.on;
        if (b.off) sim.releaseWorkers(b);
      }
      break;
    }
    case 'setRecipe': {
      const b = sim.buildings.get(cmd.building | 0);
      if (b && b.owner === p && b.def.prod && cmd.recipe >= 0 && cmd.recipe < b.def.prod.recipes.length) {
        b.recipe = cmd.recipe | 0;
        b.inBuf = 0;
      }
      break;
    }
    case 'dig': {
      if (![cmd.x1, cmd.y1, cmd.x2, cmd.y2].every(num)) return;
      const x0 = Math.min(cmd.x1, cmd.x2) | 0;
      const x1 = Math.max(cmd.x1, cmd.x2) | 0;
      const y0 = Math.min(cmd.y1, cmd.y2) | 0;
      const y1 = Math.max(cmd.y1, cmd.y2) | 0;
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return;
      const m = sim.map;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (!m.inBounds(x, y)) continue;
          const i = m.idx(x, y);
          if (sim.digMask[i] || sim.bldAt[i]) continue;
          if (cmd.fill) {
            if (m.terrain[i] !== T.Moat) continue;
            sim.digMask[i] = 2;
          } else {
            const t = m.terrain[i];
            if (t === T.Water || t === T.Moat || t === T.Rock || m.trees[i]) continue;
            sim.digMask[i] = 1;
          }
          sim.digCount++;
        }
      break;
    }
    case 'repair': {
      const b = sim.buildings.get(cmd.building | 0);
      if (b && b.owner === p && b.hp < b.maxHp) b.repair = true;
      break;
    }
    case 'ability':
      if (num(cmd.x) && num(cmd.y)) useAbility(sim, p, cmd.id | 0, cmd.x, cmd.y);
      break;
    case 'igniteDitch':
      if (num(cmd.x) && num(cmd.y)) igniteAt(sim, p, cmd.x, cmd.y);
      break;
    case 'sendAid': {
      const to = sim.players[cmd.to | 0];
      if (!to || to.id === p || !to.alive || to.team !== pl.team) return;
      const amt = Math.min(500, Math.max(1, cmd.amount | 0));
      if (cmd.res === -1) {
        const g = Math.min(amt, Math.floor(pl.gold));
        pl.gold -= g;
        to.gold += g;
      } else if (cmd.res >= 0 && cmd.res < RES_COUNT) {
        const taken = sim.takeStock(p, cmd.res | 0, amt);
        const acc = sim.addStock(to.id, cmd.res | 0, taken);
        if (acc < taken) sim.addStock(p, cmd.res | 0, taken - acc);
      }
      sim.emit({ e: 'msg', p: to.id, text: `${pl.name} schickt Hilfe.` });
      break;
    }
    case 'requestAid': {
      const to = sim.players[cmd.to | 0];
      if (!to || to.id === p || to.team !== pl.team) return;
      to.aidRequests.push({ from: p, tick: sim.tick });
      if (to.aidRequests.length > 8) to.aidRequests.shift();
      sim.emit({ e: 'msg', p: to.id, text: `${pl.name} bittet um Hilfe!` });
      break;
    }
    case 'surrender':
      sim.defeat(p);
      break;
    default:
      break;
  }
}

function idlePeasants(sim: Sim, p: number): number[] {
  const u = sim.units;
  const out: number[] = [];
  for (let s = 0; s < u.top; s++) {
    if (u.alive[s] && u.owner[s] === p && u.type[s] === U.Peasant && u.home[s] === 0 && u.sub[s] === 0 && u.state[s] === S.Idle) out.push(s);
  }
  return out;
}

const PRODUCER: Record<number, string> = { [BT.Barracks]: 'barracks', [BT.MercPost]: 'merc', [BT.EngineerGuild]: 'guild' };

function recruit(sim: Sim, p: number, bid: number, unit: number, count: number): void {
  const b = sim.buildings.get(bid);
  const def = UNITS[unit];
  if (!b || !def || b.owner !== p || PRODUCER[b.type] !== def.producer) return;
  const pl = sim.players[p];
  for (let n = 0; n < count; n++) {
    if (b.queue.length >= 30) return;
    let queued = 0;
    for (const bb of sim.buildings.values()) if (bb.owner === p) for (const q of bb.queue) queued += UNITS[q.unit].troops;
    if (pl.troops + queued + def.troops > sim.troopLimit) return;
    const cost = def.cost;
    if (pl.gold < cost.gold) return;
    for (const [r, a] of cost.res ?? []) if (pl.stock[r] < a) return;
    if (cost.horse && pl.horses < 1) return;
    const need = Math.max(1, cost.crew ?? 1);
    const idle = idlePeasants(sim, p);
    if (idle.length < need) return;
    // bezahlen
    pl.gold -= cost.gold;
    for (const [r, a] of cost.res ?? []) sim.takeStock(p, r, a);
    if (cost.horse) {
      for (const st of sim.buildings.values()) {
        if (st.owner === p && st.type === BT.Stable && st.horses > 0) {
          st.horses--;
          break;
        }
      }
    }
    // nächste freie Bauern zur Kaserne verbrauchen
    idle.sort((a, c) => (sim.units.x[a] - b.cx) ** 2 + (sim.units.y[a] - b.cy) ** 2 - ((sim.units.x[c] - b.cx) ** 2 + (sim.units.y[c] - b.cy) ** 2));
    for (let k = 0; k < need; k++) sim.killUnitSilent(idle[k]);
    b.queue.push({ unit, left: def.train });
  }
}

function trade(sim: Sim, p: number, res: number, amount: number, buy: boolean): void {
  if (res < 0 || res >= RES_COUNT) return;
  let hasMarket = false;
  for (const b of sim.buildings.values()) if (b.owner === p && b.type === BT.Market) hasMarket = true;
  if (!hasMarket) return;
  const pl = sim.players[p];
  const price = RES_INFO[res].price * pl.priceMul[res];
  if (buy) {
    const space = sim.freeSpace(p, res);
    const n = Math.min(amount, space, Math.floor(pl.gold / price));
    if (n <= 0) return;
    pl.gold -= Math.ceil(price * n);
    sim.addStock(p, res, n);
    pl.priceMul[res] = Math.min(3, pl.priceMul[res] + MARKET_PRICE_STEP * n);
  } else {
    const n = Math.min(amount, pl.stock[res]);
    if (n <= 0) return;
    pl.gold += Math.floor(price * SELL_RATIO * n);
    sim.takeStock(p, res, n);
    pl.priceMul[res] = Math.max(0.4, pl.priceMul[res] - MARKET_PRICE_STEP * n);
  }
}
