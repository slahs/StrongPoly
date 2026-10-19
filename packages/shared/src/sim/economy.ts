import { DT, FEAR_PROD_STEP } from '../data/balance';
import { BT, HORSES_PER_STABLE } from '../data/buildings';
import { RES_INFO } from '../data/resources';
import { T } from '../data/terrain';
import { U } from '../data/units';
import { Building } from './building';
import { followGoal, MR, tileOf } from './movement';
import type { Sim } from './sim';
import { S } from './unitstore';

/** Teilzustände der Arbeiter (units.sub) */
export const P = {
  Idle: 0,
  ToWork: 1,
  Working: 2,
  Search: 3,
  ToRes: 4,
  Gather: 5,
  ToStore: 6,
  ToFetch: 7,
  ToDig: 8,
  Dig: 9,
  ToRepair: 10,
  Repair: 11,
  OxSearch: 12,
  OxToQuarry: 13,
  Wait: 14,
  ToHome: 15,
  WaitFetch: 16,
  WaitWork: 17,
  WaitStore: 18,
} as const;

const WORK_LIMIT = 14 * 60;

export function prodMul(sim: Sim, p: number): number {
  return 1 + FEAR_PROD_STEP * sim.players[p].fear;
}

function setGoalTile(sim: Sim, s: number, tile: number): void {
  const u = sim.units;
  const w = sim.map.w;
  u.goal[s] = tile * 2 + (u.layer[s] === 1 ? 0 : 0);
  u.tx[s] = (tile % w) + 0.5;
  u.ty[s] = ((tile / w) | 0) + 0.5;
  u.state[s] = S.Work;
  u.stuck[s] = 0;
}

export function updateEconomy(sim: Sim): void {
  for (const b of sim.buildings.values()) b.staffed = 0;
  updateBuildings(sim);
  if (sim.tick % 10 === 3) assignWorkers(sim);
  for (const p of sim.players) {
    let h = 0;
    for (const b of sim.buildings.values()) if (b.owner === p.id && b.type === BT.Stable) h += b.horses;
    p.horses = h;
  }
}

function updateBuildings(sim: Sim): void {
  for (const b of sim.buildings.values()) {
    const d = b.def;
    if (b.type === BT.Stable) {
      if (b.horses < HORSES_PER_STABLE) {
        b.spawnTimer += DT;
        if (b.spawnTimer >= 40) {
          b.spawnTimer = 0;
          b.horses++;
        }
      }
    } else if (b.type === BT.OxTether) {
      b.workers = b.workers.filter((id) => sim.units.valid(id));
      if (b.workers.length < 2) {
        b.spawnTimer += DT;
        if (b.spawnTimer >= (b.workers.length ? 40 : 5) && sim.players[b.owner].alive) {
          b.spawnTimer = 0;
          const e = sim.entryOf(b);
          const w = sim.map.w;
          const x = e >= 0 ? (e % w) + 0.5 : b.cx;
          const y = e >= 0 ? ((e / w) | 0) + 0.5 : b.y + b.h + 0.5;
          const s = sim.spawnUnit(U.Ox, b.owner, x, y);
          if (s >= 0) {
            sim.units.home[s] = b.id;
            sim.units.sub[s] = P.OxSearch;
            sim.units.state[s] = S.Work;
            b.workers.push(sim.units.id(s));
          }
        }
      }
    }
    if (b.queue.length && d.id !== undefined) {
      const it = b.queue[0];
      it.left -= DT;
      if (it.left <= 0) {
        const e = sim.entryOf(b);
        if (e >= 0 || true) {
          const w = sim.map.w;
          const x = e >= 0 ? (e % w) + 0.5 : b.cx;
          const y = e >= 0 ? ((e / w) | 0) + 0.5 : b.y + b.h + 0.5;
          const s = sim.spawnUnit(it.unit, b.owner, x, y);
          if (s >= 0) {
            sim.units.stance[s] = 1;
            b.queue.shift();
          }
        }
      }
    }
  }
}

function assignWorkers(sim: Sim): void {
  const u = sim.units;
  // freie Bauern je Spieler sammeln
  const idle: number[][] = sim.players.map(() => []);
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s] || u.type[s] !== U.Peasant) continue;
    if (u.sub[s] === P.Idle && u.home[s] === 0 && (u.state[s] === S.Idle)) idle[u.owner[s]].push(s);
  }
  const takeNearest = (p: number, x: number, y: number): number => {
    const list = idle[p];
    let bi = -1;
    let bd = Infinity;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      const d = (u.x[s] - x) ** 2 + (u.y[s] - y) ** 2;
      if (d < bd) {
        bd = d;
        bi = k;
      }
    }
    if (bi < 0) return -1;
    const s = list[bi];
    list[bi] = list[list.length - 1];
    list.pop();
    return s;
  };
  for (const b of sim.buildings.values()) {
    const d = b.def;
    if (d.workers > 0) {
      b.workers = b.workers.filter((id) => {
        const s = u.slot(id);
        return s >= 0 && u.home[s] === b.id;
      });
      while (b.workers.length < d.workers) {
        if (!idle[b.owner].length) break;
        const e = sim.entryOf(b);
        if (e < 0) break;
        const s = takeNearest(b.owner, b.cx, b.cy);
        if (s < 0) break;
        u.home[s] = b.id;
        u.sub[s] = P.ToWork;
        setGoalTile(sim, s, e);
        b.workers.push(u.id(s));
      }
    }
  }
  // Grab- und Reparaturaufträge
  for (const pl of sim.players) {
    if (!pl.alive) continue;
    const list = idle[pl.id];
    if (!list.length) continue;
    if (sim.digCount > 0) {
      const w = sim.map.w;
      for (let k = list.length - 1; k >= 0 && sim.digCount > 0; k--) {
        const s = list[k];
        const tile = findDigTile(sim, pl.id, u.x[s], u.y[s]);
        if (tile < 0) break;
        const adj = adjacentFree(sim, tile, sim.teamOf[pl.id], u.x[s], u.y[s]);
        if (adj < 0) {
          // unerreichbar – Auftrag verwerfen
          sim.digMask[tile] = 0;
          sim.digCount--;
          continue;
        }
        sim.reserved.set(tile, u.id(s));
        u.ax[s] = (tile % w) + 0.5;
        u.ay[s] = ((tile / w) | 0) + 0.5;
        u.sub[s] = P.ToDig;
        u.target[s] = tile;
        setGoalTile(sim, s, adj);
        list.splice(k, 1);
      }
    }
    for (const b of sim.buildings.values()) {
      if (!list.length) break;
      if (b.owner !== pl.id || !b.repair || b.repairer && u.valid(b.repairer)) continue;
      const e = sim.entryOf(b);
      if (e < 0) continue;
      const s = takeNearest(pl.id, b.cx, b.cy);
      if (s < 0) break;
      b.repairer = u.id(s);
      u.home[s] = 0;
      u.target[s] = b.id;
      u.targetKind[s] = 2;
      u.sub[s] = P.ToRepair;
      setGoalTile(sim, s, e);
    }
  }
}

function findDigTile(sim: Sim, p: number, x: number, y: number): number {
  const m = sim.map;
  let best = -1;
  let bd = Infinity;
  // nur Tiles im Spielerumfeld (Radius 40 um Keep) berücksichtigen, grob nach Nähe
  for (let i = 0; i < m.n; i++) {
    if (!sim.digMask[i]) continue;
    if (sim.reserved.has(i)) {
      const r = sim.reserved.get(i)!;
      if (sim.units.valid(r)) continue;
      sim.reserved.delete(i);
    }
    const tx = (i % m.w) + 0.5;
    const ty = ((i / m.w) | 0) + 0.5;
    const d = (tx - x) ** 2 + (ty - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  void p;
  return best;
}

function adjacentFree(sim: Sim, tile: number, team: number, fx: number, fy: number): number {
  const m = sim.map;
  const x = tile % m.w;
  const y = (tile / m.w) | 0;
  let best = -1;
  let bd = Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!m.inBounds(nx, ny)) continue;
    const i = m.idx(nx, ny);
    if (!sim.nav.groundFree(i, team) || sim.nav.kind[i] & 1) continue;
    const d = (nx + 0.5 - fx) ** 2 + (ny + 0.5 - fy) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Zustandsautomat für Bauern und Ochsen. Wird für jede Einheit dieser Typen pro Tick aufgerufen. */
export function workerTick(sim: Sim, s: number): void {
  const u = sim.units;
  if (u.type[s] === U.Ox) return oxTick(sim, s);
  const sub = u.sub[s];
  const bid = u.home[s];
  const mul = prodMul(sim, u.owner[s]);

  // Aufträge ohne Heimatgebäude
  if (sub === P.ToDig || sub === P.Dig) return digTick(sim, s);
  if (sub === P.ToRepair || sub === P.Repair) return repairTick(sim, s);

  if (!bid) {
    if (sub !== P.Idle) {
      u.sub[s] = P.Idle;
      u.state[s] = S.Idle;
    }
    idleTick(sim, s);
    return;
  }
  const b = sim.buildings.get(bid);
  if (!b) {
    u.home[s] = 0;
    u.sub[s] = P.Idle;
    u.state[s] = S.Idle;
    return;
  }
  const prod = b.def.prod;
  const pl = sim.players[u.owner[s]];

  switch (sub) {
    case P.ToWork: {
      const r = followGoal(sim, s, false, 0.8, WORK_LIMIT);
      if (r === MR.Arrived) onArriveWork(sim, s, b);
      else if (r === MR.NoPath) {
        const e = sim.entryOf(b);
        if (e >= 0) setGoalTile(sim, s, e);
      }
      break;
    }
    case P.Working: {
      b.staffed++;
      if (!prod) break; // Wirtshaus, Kirche, Markt: Anwesenheit genügt
      u.timer[s] -= DT * mul;
      if (u.timer[s] > 0) break;
      const rec = prod.recipes[Math.min(b.recipe, prod.recipes.length - 1)];
      if (prod.mode === 'local' && prod.haul === 'ox' && b.out >= prod.batch * 2) {
        u.timer[s] = 2; // Puffer voll – warten
        break;
      }
      b.out += rec.outAmt;
      b.cycles++;
      if (rec.extra && b.cycles % rec.extra.every === 0) sim.deliver(b.owner, rec.extra.res, rec.extra.amt);
      afterProduce(sim, s, b);
      break;
    }
    case P.Search: {
      if (!prod) break;
      u.timer[s] -= 1;
      if (u.timer[s] > 0) break;
      if (prod.target === 'tree') {
        const t = findTree(sim, b, prod.radius ?? 12, u.id(s));
        if (t.tree < 0) {
          u.timer[s] = 40;
          break;
        }
        sim.reserved.set(t.tree, u.id(s));
        u.ax[s] = (t.tree % sim.map.w) + 0.5;
        u.ay[s] = ((t.tree / sim.map.w) | 0) + 0.5;
        u.sub[s] = P.ToRes;
        setGoalTile(sim, s, t.stand);
      } else {
        // Jagd: zufälliger Punkt im Radius
        const r = prod.radius ?? 12;
        for (let k = 0; k < 8; k++) {
          const a = sim.rng.next() * Math.PI * 2;
          const rr = 4 + sim.rng.next() * (r - 4);
          const x = Math.floor(b.cx + Math.cos(a) * rr);
          const y = Math.floor(b.cy + Math.sin(a) * rr);
          if (!sim.map.inBounds(x, y)) continue;
          const i = sim.map.idx(x, y);
          if (!sim.nav.groundFree(i, sim.teamOf[b.owner]) || sim.map.terrain[i] === T.Swamp) continue;
          u.ax[s] = x + 0.5;
          u.ay[s] = y + 0.5;
          u.timer[s] = -1;
          u.sub[s] = P.ToRes;
          setGoalTile(sim, s, i);
          break;
        }
        if (u.sub[s] === P.Search) u.timer[s] = 20;
      }
      break;
    }
    case P.ToRes: {
      const r = followGoal(sim, s, false, 0.8, WORK_LIMIT);
      if (r === MR.Arrived) {
        u.sub[s] = P.Gather;
        const rec = prod!.recipes[0];
        u.timer[s] = prod!.target === 'game' ? rec.time * 0.8 : rec.time * 0.7;
        u.stuck[s] = 0;
        u.state[s] = S.Work;
        u.goal[s] = -1;
        u.tx[s] = u.x[s];
        u.ty[s] = u.y[s];
        // Blick zum Baum
        u.face[s] = Math.atan2(u.ax[s] - u.x[s], u.ay[s] - u.y[s]);
      } else if (r === MR.NoPath || u.stuck[s] > 120) {
        releaseTree(sim, s);
        u.sub[s] = P.Search;
        u.timer[s] = 20;
        u.stuck[s] = 0;
      }
      break;
    }
    case P.Gather: {
      u.timer[s] -= DT * mul;
      if (u.timer[s] > 0) break;
      if (prod!.target === 'tree') {
        const tile = tileOf(sim, u.ax[s], u.ay[s]);
        const left = sim.map.trees[tile];
        const amt = Math.min(prod!.recipes[0].outAmt, left);
        sim.map.trees[tile] = left - amt;
        sim.markTile(tile);
        releaseTree(sim, s);
        if (amt <= 0) {
          u.sub[s] = P.Search;
          u.timer[s] = 1;
          break;
        }
        u.carryRes[s] = prod!.recipes[0].out;
        u.carryAmt[s] = amt;
      } else {
        u.carryRes[s] = prod!.recipes[0].out;
        u.carryAmt[s] = prod!.recipes[0].outAmt;
      }
      goToStore(sim, s, b);
      break;
    }
    case P.ToStore: {
      const r = followGoal(sim, s, false, 0.8, WORK_LIMIT);
      if (r === MR.Arrived) {
        const res = u.carryRes[s];
        const acc = sim.deliver(u.owner[s], res, u.carryAmt[s]);
        u.carryAmt[s] -= acc;
        if (u.carryAmt[s] > 0) {
          // Lager voll: kurz warten, dann abwerfen
          u.sub[s] = P.Wait;
          u.timer[s] = 30;
          break;
        }
        afterDrop(sim, s, b);
      } else if (r === MR.NoPath) {
        u.sub[s] = P.WaitStore;
        u.timer[s] = 40;
      }
      break;
    }
    case P.WaitStore: {
      u.timer[s] -= 1;
      if (u.timer[s] <= 0) goToStore(sim, s, b);
      break;
    }
    case P.WaitFetch: {
      u.timer[s] -= 1;
      if (u.timer[s] <= 0) u.sub[s] = P.ToFetch;
      break;
    }
    case P.WaitWork: {
      u.timer[s] -= 1;
      if (u.timer[s] <= 0) startCycle(sim, s, b);
      break;
    }
    case P.Wait: {
      u.timer[s] -= 1;
      if (u.timer[s] > 0) break;
      const acc = sim.deliver(u.owner[s], u.carryRes[s], u.carryAmt[s]);
      u.carryAmt[s] -= acc;
      if (u.carryAmt[s] > 0 && u.stuck[s] < 3) {
        u.stuck[s]++;
        u.timer[s] = 30;
        break;
      }
      u.carryAmt[s] = 0;
      u.stuck[s] = 0;
      afterDrop(sim, s, b);
      break;
    }
    case P.ToFetch: {
      const r = followGoal(sim, s, false, 0.8, WORK_LIMIT);
      if (r === MR.Arrived) {
        const rec = prod!.recipes[Math.min(b.recipe, prod!.recipes.length - 1)];
        const [res, need] = rec.in[0];
        const want = need * 2;
        const got = sim.takeStock(u.owner[s], res, want);
        if (got > 0) {
          u.carryRes[s] = res;
          u.carryAmt[s] = got;
          u.sub[s] = P.ToWork;
          const e = sim.entryOf(b);
          if (e >= 0) setGoalTile(sim, s, e);
          else u.sub[s] = P.ToHome;
        } else {
          u.sub[s] = P.WaitFetch;
          u.timer[s] = 30;
          u.carryAmt[s] = 0;
        }
      } else if (r === MR.NoPath) {
        u.timer[s] = 0;
        u.sub[s] = P.ToWork;
        const e = sim.entryOf(b);
        if (e >= 0) setGoalTile(sim, s, e);
      }
      break;
    }
    default:
      // unbekannter Zustand -> zurück zur Arbeit
      u.sub[s] = P.ToWork;
      void pl;
      break;
  }
}

function releaseTree(sim: Sim, s: number): void {
  const u = sim.units;
  const tile = tileOf(sim, u.ax[s], u.ay[s]);
  if (sim.reserved.get(tile) === u.id(s)) sim.reserved.delete(tile);
}

function findTree(sim: Sim, b: Building, radius: number, me: number): { tree: number; stand: number } {
  const m = sim.map;
  const cx = Math.floor(b.cx);
  const cy = Math.floor(b.cy);
  const team = sim.teamOf[b.owner];
  let best = -1;
  let bstand = -1;
  let bd = Infinity;
  for (let y = Math.max(0, cy - radius); y <= Math.min(m.h - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(m.w - 1, cx + radius); x++) {
      const i = m.idx(x, y);
      if (m.trees[i] === 0) continue;
      const rid = sim.reserved.get(i);
      if (rid !== undefined && rid !== me && sim.units.valid(rid)) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d >= bd) continue;
      // begehbares Nachbartile finden
      let st = -1;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!m.inBounds(nx, ny)) continue;
        const j = m.idx(nx, ny);
        if (sim.nav.groundFree(j, team) && !(sim.nav.kind[j] & 1)) {
          st = j;
          break;
        }
      }
      if (st < 0) continue;
      bd = d;
      best = i;
      bstand = st;
    }
  }
  return { tree: best, stand: bstand };
}

function goToStore(sim: Sim, s: number, b: Building): void {
  const u = sim.units;
  const kind = RES_INFO[u.carryRes[s]].store;
  const st = sim.nearestStore(u.owner[s], kind, u.x[s], u.y[s]);
  u.sub[s] = P.ToStore;
  if (!st) {
    u.sub[s] = P.WaitStore;
    u.timer[s] = 40;
    return;
  }
  const e = sim.entryOf(st);
  if (e < 0) {
    u.sub[s] = P.WaitStore;
    u.timer[s] = 40;
    return;
  }
  setGoalTile(sim, s, e);
  void b;
}

function afterDrop(sim: Sim, s: number, b: Building): void {
  const u = sim.units;
  u.carryAmt[s] = 0;
  const prod = b.def.prod;
  if (prod?.mode === 'roam') {
    u.sub[s] = P.Search;
    u.timer[s] = 1;
    u.state[s] = S.Work;
    return;
  }
  u.sub[s] = P.ToWork;
  const e = sim.entryOf(b);
  if (e >= 0) setGoalTile(sim, s, e);
}

function onArriveWork(sim: Sim, s: number, b: Building): void {
  const u = sim.units;
  const prod = b.def.prod;
  u.goal[s] = -1;
  u.tx[s] = u.x[s];
  u.ty[s] = u.y[s];
  if (u.carryAmt[s] > 0 && prod?.mode === 'process') {
    b.inBuf += u.carryAmt[s];
    u.carryAmt[s] = 0;
  }
  if (!prod) {
    u.sub[s] = P.Working;
    return;
  }
  if (prod.mode === 'roam') {
    u.sub[s] = P.Search;
    u.timer[s] = 1;
    return;
  }
  startCycle(sim, s, b);
}

function startCycle(sim: Sim, s: number, b: Building): void {
  const u = sim.units;
  const prod = b.def.prod!;
  const rec = prod.recipes[Math.min(b.recipe, prod.recipes.length - 1)];
  if (prod.mode === 'process') {
    const need = rec.in[0][1];
    if (b.inBuf >= need) {
      b.inBuf -= need;
    } else {
      // Material holen
      const kind = RES_INFO[rec.in[0][0]].store;
      const st = sim.nearestStore(b.owner, kind, b.cx, b.cy);
      const e = st ? sim.entryOf(st) : -1;
      if (e < 0) {
        u.sub[s] = P.WaitWork;
        u.carryAmt[s] = 0;
        u.timer[s] = 30;
        return;
      }
      u.sub[s] = P.ToFetch;
      setGoalTile(sim, s, e);
      return;
    }
  }
  u.sub[s] = P.Working;
  u.timer[s] = rec.time;
  u.state[s] = S.Work;
}

function afterProduce(sim: Sim, s: number, b: Building): void {
  const u = sim.units;
  const prod = b.def.prod!;
  if (prod.haul === 'worker' && b.out >= prod.batch) {
    const rec = prod.recipes[Math.min(b.recipe, prod.recipes.length - 1)];
    u.carryRes[s] = rec.out;
    u.carryAmt[s] = Math.min(b.out, prod.batch);
    b.out -= u.carryAmt[s];
    goToStore(sim, s, b);
    return;
  }
  startCycle(sim, s, b);
}

function idleTick(sim: Sim, s: number): void {
  const u = sim.units;
  if (u.state[s] === S.Move) return;
  u.timer[s] -= 1;
  if (u.timer[s] > 0) return;
  u.timer[s] = 30 + (s % 30);
  const pl = sim.players[u.owner[s]];
  const fire = sim.buildings.get(pl.campfireId);
  if (!fire) return;
  const d = Math.hypot(u.x[s] - fire.cx, u.y[s] - fire.cy);
  if (d > 6) {
    const a = ((s * 2654435761) >>> 0) / 4294967296 * Math.PI * 2;
    const tx = fire.cx + Math.cos(a) * 2.5;
    const ty = fire.cy + Math.sin(a) * 2.5;
    const tile = tileOf(sim, tx, ty);
    u.goal[s] = tile * 2;
    u.tx[s] = tx;
    u.ty[s] = ty;
    u.state[s] = S.Move;
    u.stuck[s] = 0;
  }
}

function digTick(sim: Sim, s: number): void {
  const u = sim.units;
  const m = sim.map;
  const tile = u.target[s];
  if (u.sub[s] === P.ToDig) {
    if (!sim.digMask[tile]) {
      u.sub[s] = P.Idle;
      u.state[s] = S.Idle;
      return;
    }
    const r = followGoal(sim, s, false, 0.8, WORK_LIMIT);
    if (r === MR.Arrived) {
      u.sub[s] = P.Dig;
      u.timer[s] = 4;
      u.goal[s] = -1;
      u.tx[s] = u.x[s];
      u.ty[s] = u.y[s];
    } else if (r === MR.NoPath) {
      sim.reserved.delete(tile);
      u.sub[s] = P.Idle;
      u.state[s] = S.Idle;
    }
    return;
  }
  u.timer[s] -= DT;
  if (u.timer[s] > 0) return;
  const mask = sim.digMask[tile];
  if (mask === 1) {
    if (m.walkableTerrain(tile) && sim.bldAt[tile] === 0) {
      m.terrain[tile] = T.Moat;
      m.trees[tile] = 0;
    }
  } else if (mask === 2) {
    if (m.terrain[tile] === T.Moat) m.terrain[tile] = T.Steppe;
  }
  if (mask) {
    sim.digMask[tile] = 0;
    sim.digCount = Math.max(0, sim.digCount - 1);
  }
  sim.markTile(tile);
  sim.nav.bump();
  sim.reserved.delete(tile);
  u.sub[s] = P.Idle;
  u.state[s] = S.Idle;
  u.target[s] = 0;
  u.targetKind[s] = 0;
}

function repairTick(sim: Sim, s: number): void {
  const u = sim.units;
  const b = sim.buildings.get(u.target[s]);
  if (!b || b.dead || !b.repair) {
    u.sub[s] = P.Idle;
    u.state[s] = S.Idle;
    u.target[s] = 0;
    u.targetKind[s] = 0;
    return;
  }
  if (u.sub[s] === P.ToRepair) {
    const r = followGoal(sim, s, false, 0.9, WORK_LIMIT);
    if (r === MR.Arrived) {
      u.sub[s] = P.Repair;
      u.goal[s] = -1;
      u.tx[s] = u.x[s];
      u.ty[s] = u.y[s];
    } else if (r === MR.NoPath) {
      b.repairer = 0;
      u.sub[s] = P.Idle;
      u.state[s] = S.Idle;
    }
    return;
  }
  b.repairer = u.id(s);
  b.hp = Math.min(b.maxHp, b.hp + (b.maxHp / 40) * DT * 4);
  if (b.hp >= b.maxHp) {
    b.repair = false;
    b.repairer = 0;
    u.sub[s] = P.Idle;
    u.state[s] = S.Idle;
    u.target[s] = 0;
    u.targetKind[s] = 0;
  }
}

function oxTick(sim: Sim, s: number): void {
  const u = sim.units;
  const home = sim.buildings.get(u.home[s]);
  if (!home) {
    sim.killUnitSilent(s);
    return;
  }
  switch (u.sub[s]) {
    case P.OxSearch: {
      u.timer[s] -= 1;
      if (u.timer[s] > 0) return;
      u.timer[s] = 15;
      let best: Building | null = null;
      let bd = Infinity;
      for (const b of sim.buildings.values()) {
        const prod = b.def.prod;
        if (b.owner !== u.owner[s] || !prod || prod.haul !== 'ox' || b.out < prod.batch) continue;
        if (b.claim && u.valid(b.claim) && b.claim !== u.id(s)) continue;
        const d = (b.cx - u.x[s]) ** 2 + (b.cy - u.y[s]) ** 2;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (!best) return;
      const e = sim.entryOf(best);
      if (e < 0) return;
      best.claim = u.id(s);
      u.target[s] = best.id;
      u.sub[s] = P.OxToQuarry;
      setGoalTile(sim, s, e);
      return;
    }
    case P.OxToQuarry: {
      const q = sim.buildings.get(u.target[s]);
      if (!q) {
        u.sub[s] = P.OxSearch;
        return;
      }
      const r = followGoal(sim, s, false, 0.9, WORK_LIMIT);
      if (r === MR.Arrived) {
        const prod = q.def.prod!;
        const take = Math.min(q.out, prod.batch);
        q.out -= take;
        q.claim = 0;
        u.carryRes[s] = prod.recipes[0].out;
        u.carryAmt[s] = take;
        const st = sim.nearestStore(u.owner[s], 'stock', u.x[s], u.y[s]);
        const e = st ? sim.entryOf(st) : -1;
        if (e < 0) {
          u.sub[s] = P.Wait;
          u.timer[s] = 30;
          return;
        }
        u.sub[s] = P.ToStore;
        setGoalTile(sim, s, e);
      } else if (r === MR.NoPath) {
        q.claim = 0;
        u.sub[s] = P.OxSearch;
        u.timer[s] = 30;
      }
      return;
    }
    case P.ToStore: {
      const r = followGoal(sim, s, false, 0.9, WORK_LIMIT);
      if (r === MR.Arrived) {
        const acc = sim.deliver(u.owner[s], u.carryRes[s], u.carryAmt[s]);
        u.carryAmt[s] -= acc;
        if (u.carryAmt[s] > 0) {
          u.sub[s] = P.Wait;
          u.timer[s] = 30;
          return;
        }
        u.sub[s] = P.OxSearch;
        u.timer[s] = 5;
        u.state[s] = S.Work;
      } else if (r === MR.NoPath) {
        u.sub[s] = P.Wait;
        u.timer[s] = 20;
      }
      return;
    }
    case P.Wait: {
      u.timer[s] -= 1;
      if (u.timer[s] > 0) return;
      if (u.carryAmt[s] > 0) {
        const st = sim.nearestStore(u.owner[s], 'stock', u.x[s], u.y[s]);
        const e = st ? sim.entryOf(st) : -1;
        if (e >= 0) {
          u.sub[s] = P.ToStore;
          setGoalTile(sim, s, e);
        } else u.timer[s] = 30;
      } else {
        u.sub[s] = P.OxSearch;
      }
      return;
    }
    default:
      u.sub[s] = P.OxSearch;
      u.state[s] = S.Work;
      u.timer[s] = 0;
  }
}
