import { DT, FEAR_DMG_STEP } from '../data/balance';
import { BT, BUILDINGS } from '../data/buildings';
import { A, D, DMG_TABLE, PROJ, U, UNITS } from '../data/units';
import { HEIGHT_STEP } from '../data/terrain';
import { followGoal, MR, tileOf, walkStep, clearLine } from './movement';
import { NK } from './nav';
import type { Sim } from './sim';
import { S } from './unitstore';
import { Stance } from './types';
import { ownedSlots, goalNodeAt } from './orders';

/** Schaden gegen Einheit anwenden. Gibt true zurück, wenn die Einheit stirbt. */
export function damageUnit(sim: Sim, s: number, dmg: number, dtype: number, by: number, ignite = false): boolean {
  const u = sim.units;
  if (!u.alive[s]) return false;
  const def = UNITS[u.type[s]];
  if (def.invisible === true && u.state[s] === S.Tunnel) return false;
  let mult = DMG_TABLE[dtype][def.armor];
  // Zinnen bieten Deckung gegen Fernwaffen
  if (u.layer[s] === 1 && dtype === D.Pierce) mult *= 0.7;
  if (dtype === D.Pierce && coveredByMantlet(sim, s)) mult *= 0.35;
  u.hp[s] -= dmg * mult;
  if (ignite && dtype === D.Fire) u.burn[s] = Math.max(u.burn[s], 4);
  if (u.hp[s] <= 0) {
    killUnit(sim, s, by);
    return true;
  }
  // Angegriffene Einheit wehrt sich ggf.
  if (u.state[s] === S.Idle && u.type[s] !== U.Peasant && by >= 0) u.cd[s] = Math.min(u.cd[s], 2);
  return false;
}

function coveredByMantlet(sim: Sim, s: number): boolean {
  const u = sim.units;
  let covered = false;
  sim.spatial.query(u.x[s], u.y[s], 1.8, (o) => {
    if (covered || o === s) return;
    if (u.type[o] === U.Mantlet && !sim.isEnemy(u.owner[o], u.owner[s])) covered = true;
  });
  return covered;
}

export function killUnit(sim: Sim, s: number, by: number): void {
  const u = sim.units;
  if (!u.alive[s]) return;
  const owner = u.owner[s];
  const type = u.type[s];
  if (by >= 0 && by < sim.players.length) {
    sim.players[by].stats.kills++;
    if (sim.extreme) sim.extreme.onKill(by);
  }
  sim.players[owner].stats.losses++;
  sim.emit({ e: 'fx', k: type >= U.Catapult ? 'collapseWood' : 'hit', x: u.x[s], y: u.y[s], z: 0.4 });
  const id = u.id(s);
  sim.deadUnits.push(id);
  const wasLord = type === U.Lord;
  u.kill(s);
  if (wasLord && sim.players[owner].alive) sim.defeat(owner);
}

// ---------------- Projektile ----------------
export function groundZ(sim: Sim, x: number, y: number): number {
  const m = sim.map;
  const tx = Math.max(0, Math.min(m.w - 1, x | 0));
  const ty = Math.max(0, Math.min(m.h - 1, y | 0));
  const i = ty * m.w + tx;
  let h = m.height[i] * HEIGHT_STEP;
  const k = sim.nav.kind[i];
  if (k & NK.WallTop) {
    const b = sim.buildingAtTile(tx, ty);
    if (b) h += b.def.height;
  }
  return h;
}

const PROJ_SPEED: Record<number, number> = {
  [PROJ.Arrow]: 22,
  [PROJ.Bolt]: 26,
  [PROJ.Stone]: 14,
  [PROJ.FireArrow]: 20,
  [PROJ.Boulder]: 12,
};

export interface ShotOpts {
  kind: number;
  owner: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  dmg: number;
  dtype: number;
  splash?: number;
  target?: number;
  bTarget?: number;
  fire?: boolean;
}

export function fireProjectile(sim: Sim, o: ShotOpts): void {
  const i = sim.proj.add();
  if (i < 0) return;
  const pr = sim.proj;
  const dist = Math.hypot(o.tx - o.sx, o.ty - o.sy);
  const sp = PROJ_SPEED[o.kind] ?? 20;
  pr.kind[i] = o.kind;
  pr.owner[i] = o.owner;
  pr.sx[i] = o.sx;
  pr.sy[i] = o.sy;
  pr.sz[i] = o.sz;
  pr.ex[i] = o.tx;
  pr.ey[i] = o.ty;
  pr.ez[i] = groundZ(sim, o.tx, o.ty) + 0.4;
  const T = Math.max(2, Math.round((dist / sp) * 10));
  pr.T[i] = T;
  pr.t[i] = 0;
  pr.arc[i] = o.kind === PROJ.Boulder || o.kind === PROJ.Stone ? Math.min(6, dist * 0.3) : Math.min(3.5, dist * 0.12);
  pr.dmg[i] = o.dmg;
  pr.dtype[i] = o.dtype;
  pr.splash[i] = o.splash ?? 0;
  pr.target[i] = o.target ?? 0;
  pr.bTarget[i] = o.bTarget ?? 0;
  pr.fire[i] = o.fire ? 1 : 0;
}

export function updateProjectiles(sim: Sim): void {
  const pr = sim.proj;
  for (let i = 0; i < pr.top; i++) {
    if (!pr.alive[i]) continue;
    pr.t[i]++;
    if (pr.t[i] >= pr.T[i]) {
      impact(sim, i);
      pr.remove(i);
    }
  }
}

function impact(sim: Sim, i: number): void {
  const pr = sim.proj;
  const u = sim.units;
  const x = pr.ex[i];
  const y = pr.ey[i];
  const owner = pr.owner[i];
  const dmg = pr.dmg[i];
  const dtype = pr.dtype[i];
  const splash = pr.splash[i];
  const fire = pr.fire[i] === 1 || dtype === D.Fire;
  const kind = pr.kind[i];
  const tile = tileOf(sim, x, y);
  const bid = sim.bldAt[tile];
  if (splash > 0) {
    sim.emit({ e: 'fx', k: kind === PROJ.Boulder ? 'explosion' : 'hit', x, y, z: 0.4 });
    sim.spatial.query(x, y, splash + 0.5, (s) => {
      if (!u.alive[s] || !sim.isEnemy(owner, u.owner[s])) return;
      const d = Math.hypot(u.x[s] - x, u.y[s] - y);
      if (d > splash) return;
      damageUnit(sim, s, dmg * (1 - (d / splash) * 0.5), dtype, owner, fire);
    });
    // Gebäude im Radius
    const r = Math.ceil(splash);
    const seen = new Set<number>();
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const tx = (x | 0) + dx;
        const ty = (y | 0) + dy;
        if (!sim.map.inBounds(tx, ty)) continue;
        const id = sim.bldAt[ty * sim.map.w + tx];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const b = sim.buildings.get(id);
        if (!b || !sim.isEnemy(owner, b.owner)) continue;
        hitBuilding(sim, b, dmg * (dx === 0 && dy === 0 ? 1 : 0.6), dtype, owner, fire);
      }
    return;
  }
  // Einzelziel: Einheit am Einschlagpunkt
  let hit = false;
  const tgt = pr.target[i];
  if (tgt) {
    const s = u.slot(tgt);
    if (s >= 0 && Math.hypot(u.x[s] - x, u.y[s] - y) < 1.3 && sim.isEnemy(owner, u.owner[s])) {
      damageUnit(sim, s, dmg, dtype, owner, fire);
      sim.emit({ e: 'fx', k: 'hit', x, y, z: 0.5 });
      hit = true;
    }
  }
  if (!hit) {
    let best = -1;
    let bd = 0.8 * 0.8;
    sim.spatial.query(x, y, 1, (s) => {
      if (!u.alive[s] || !sim.isEnemy(owner, u.owner[s]) || u.state[s] === S.Tunnel) return;
      const d = (u.x[s] - x) ** 2 + (u.y[s] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    });
    if (best >= 0) damageUnit(sim, best, dmg, dtype, owner, fire);
  }
  if (bid) {
    const b = sim.buildings.get(bid);
    if (b) {
      if (sim.isEnemy(owner, b.owner) || fire) {
        if (b.type === BT.PitchDitch && fire) igniteDitch(sim, b);
        else if (sim.isEnemy(owner, b.owner)) hitBuilding(sim, b, kind === PROJ.Bolt ? dmg * 0.5 : dmg * 0.3, dtype, owner, fire);
      }
    }
  }
}

export function hitBuilding(sim: Sim, b: ReturnType<Sim['buildings']['get']> & object, dmg: number, dtype: number, by: number, fire: boolean): void {
  const armor = b.def.wood ? A.BldWood : A.BldStone;
  const mult = DMG_TABLE[dtype][armor];
  sim.damageBuilding(b, dmg * mult, by);
  if (fire && !b.dead) {
    if (b.type === BT.PitchDitch) igniteDitch(sim, b);
    else if (b.def.wood && dtype === D.Fire) ignite(sim, b);
  }
}

export function ignite(sim: Sim, b: { burn: number; def: { wood: boolean } }): void {
  void sim;
  if (b.def.wood && b.burn <= 0) b.burn = 18;
}

/** Entzündet ein Pechgraben-Stück; Feuer läuft über angrenzende Stücke weiter. */
export function igniteDitch(sim: Sim, b: ReturnType<Sim['buildings']['get']> & object): void {
  if (b.burn <= 0) b.burn = 10;
  void sim;
}

// ---------------- Befehle ----------------
export function orderAttack(sim: Sim, p: number, ids: number[], kind: number, target: number): void {
  const slots = ownedSlots(sim, p, ids);
  const u = sim.units;
  if (kind === 1) {
    const ts = u.slot(target);
    if (ts < 0 || !sim.isEnemy(p, u.owner[ts])) return;
  } else {
    const b = sim.buildings.get(target);
    if (!b || !sim.isEnemy(p, b.owner)) return;
  }
  for (const s of slots) {
    if (UNITS[u.type[s]].ladders || UNITS[u.type[s]].towerBridge) {
      // Leiterträger/Belagerungsturm: Ziel wird zum Marschziel
    }
    u.target[s] = target;
    u.targetKind[s] = kind;
    u.state[s] = S.Attack;
    u.goal[s] = -1;
    u.waypoints.delete(s);
    u.stuck[s] = 0;
  }
}

export function orderAttackGround(sim: Sim, p: number, ids: number[], x: number, y: number): void {
  const u = sim.units;
  for (const s of ownedSlots(sim, p, ids)) {
    const def = UNITS[u.type[s]];
    if (def.range <= 2 && !def.siege) continue;
    u.ax[s] = x;
    u.ay[s] = y;
    u.flags[s] |= 4; // Bodenangriff-Modus
    u.state[s] = S.Ground;
    u.targetKind[s] = 0;
    u.target[s] = 0;
  }
}

export function orderPatrol(sim: Sim, p: number, ids: number[], x: number, y: number): void {
  const u = sim.units;
  const g = goalNodeAt(sim, x, y, sim.teamOf[p]);
  if (!g) return;
  for (const s of ownedSlots(sim, p, ids)) {
    // Patrouille: zwischen aktueller Position (ax, ay) und Ziel
    u.ax[s] = u.x[s];
    u.ay[s] = u.y[s];
    u.tx[s] = g.px;
    u.ty[s] = g.py;
    u.goal[s] = g.node;
    u.state[s] = S.Patrol;
    u.sub[s] = 0;
    u.stuck[s] = 0;
  }
}

// ---------------- Einheiten-KI ----------------
/** Nächste feindliche Einheit im Umkreis */
function findEnemyUnit(sim: Sim, s: number, radius: number, preferRanged = false): number {
  const u = sim.units;
  const owner = u.owner[s];
  const x = u.x[s];
  const y = u.y[s];
  let best = -1;
  let bd = radius * radius;
  const myLayer = u.layer[s];
  const def = UNITS[u.type[s]];
  sim.spatial.query(x, y, radius, (o) => {
    if (!u.alive[o] || !sim.isEnemy(owner, u.owner[o])) return;
    const ot = u.type[o];
    if (ot === U.Peasant || ot === U.Ox) {
      // Bauern nur angreifen, wenn nichts anderes da (niedrige Priorität)
    }
    if (UNITS[ot].invisible && u.state[o] !== S.Attack && !adjacentEnemyNear(sim, o)) return;
    if (u.state[o] === S.Tunnel) return;
    // Nahkämpfer erreichen Ziele auf anderer Ebene nur, wenn direkt benachbart
    const d = (u.x[o] - x) ** 2 + (u.y[o] - y) ** 2;
    let score = d;
    if (u.layer[o] !== myLayer && def.range < 3) score += 16;
    if (ot === U.Peasant || ot === U.Ox) score += 25;
    if (preferRanged && UNITS[ot].range > 3) score -= 6;
    if (score < bd) {
      bd = score;
      best = o;
    }
  });
  return best;
}

function adjacentEnemyNear(sim: Sim, o: number): boolean {
  // Assassinen werden nur von nahen Gegnern entdeckt
  const u = sim.units;
  let seen = false;
  sim.spatial.query(u.x[o], u.y[o], 2.2, (e) => {
    if (seen || !u.alive[e]) return;
    if (sim.isEnemy(u.owner[o], u.owner[e])) seen = true;
  });
  return seen;
}

function enemyBuildingAt(sim: Sim, x: number, y: number, owner: number, radius: number, siege = false): number {
  // Nächstes feindliches Gebäude im Radius (nur "sinnvolle" Ziele: Wehranlagen und Gebäude)
  const cx = x | 0;
  const cy = y | 0;
  const r = Math.ceil(radius);
  let best = 0;
  let bd = radius * radius;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (!sim.map.inBounds(tx, ty)) continue;
      const id = sim.bldAt[ty * sim.map.w + tx];
      if (!id) continue;
      const b = sim.buildings.get(id);
      if (!b || !sim.isEnemy(owner, b.owner) || b.def.hp <= 0) continue;
      if (!b.def.solid && b.type !== BT.Campfire) continue;
      if (b.def.wallTop && b.type !== BT.Keep && !siege) continue; // Fußtruppen greifen Mauern nur an, wenn sie den Weg versperren
      const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
  return best;
}

function fearMul(sim: Sim, owner: number): number {
  return 1 - FEAR_DMG_STEP * sim.players[owner].fear;
}

/** Führt einen Angriff aus (Nahkampf/Fernkampf). Gibt true zurück, wenn der Cooldown startet. */
function attackUnit(sim: Sim, s: number, o: number): void {
  const u = sim.units;
  const def = UNITS[u.type[s]];
  const owner = u.owner[s];
  const dmg = def.dmg * fearMul(sim, owner);
  u.face[s] = Math.atan2(u.x[o] - u.x[s], u.y[o] - u.y[s]);
  u.cd[s] = Math.round(def.cd * 10);
  if (def.proj) {
    // Höhenbonus: erhöhte Position verstärkt Schaden
    const hs = groundZ(sim, u.x[s], u.y[s]);
    const ho = groundZ(sim, u.x[o], u.y[o]);
    const bonus = hs > ho + 0.3 ? 1.15 : hs < ho - 0.3 ? 0.9 : 1;
    // Streuung nach Entfernung
    const d = Math.hypot(u.x[o] - u.x[s], u.y[o] - u.y[s]);
    const spread = d * 0.05;
    const tx = u.x[o] + (sim.rng.next() - 0.5) * spread * 2;
    const ty = u.y[o] + (sim.rng.next() - 0.5) * spread * 2;
    fireProjectile(sim, {
      kind: def.proj,
      owner,
      sx: u.x[s],
      sy: u.y[s],
      sz: hs + 0.7,
      tx,
      ty,
      dmg: dmg * bonus,
      dtype: def.dtype,
      splash: def.splash,
      target: u.id(o),
      fire: def.fireDmg,
    });
  } else {
    damageUnit(sim, o, dmg, def.dtype, owner, def.fireDmg);
    if (def.fireDmg) u.burn[o] = Math.max(u.burn[o], 3);
    if (sim.rng.next() < 0.3) sim.emit({ e: 'fx', k: 'hit', x: u.x[o], y: u.y[o], z: 0.5 });
  }
}

function attackBuilding(sim: Sim, s: number, b: NonNullable<ReturnType<Sim['buildings']['get']>>): void {
  const u = sim.units;
  const def = UNITS[u.type[s]];
  const owner = u.owner[s];
  u.cd[s] = Math.round(def.cd * 10);
  u.face[s] = Math.atan2(b.cx - u.x[s], b.cy - u.y[s]);
  const dmg = def.dmg * fearMul(sim, owner);
  if (def.proj) {
    const hs = groundZ(sim, u.x[s], u.y[s]);
    fireProjectile(sim, {
      kind: def.proj,
      owner,
      sx: u.x[s],
      sy: u.y[s],
      sz: hs + 0.8,
      tx: b.cx + (sim.rng.next() - 0.5) * Math.min(2, b.w),
      ty: b.cy + (sim.rng.next() - 0.5) * Math.min(2, b.h),
      dmg,
      dtype: def.dtype,
      splash: def.splash,
      bTarget: b.id,
      fire: def.fireDmg,
    });
  } else {
    hitBuilding(sim, b, dmg, def.dtype, owner, !!def.fireDmg);
    if (sim.rng.next() < 0.3) sim.emit({ e: 'fx', k: 'dust', x: b.cx, y: b.cy, z: 0.5 });
  }
}

export function buildingCenterTile(sim: Sim, b: { x: number; y: number; w: number; h: number }): number {
  return Math.floor(b.y + b.h / 2) * sim.map.w + Math.floor(b.x + b.w / 2);
}

function distToBuilding(u: Sim['units'], s: number, b: { x: number; y: number; w: number; h: number }): number {
  const cx = Math.max(b.x, Math.min(u.x[s], b.x + b.w));
  const cy = Math.max(b.y, Math.min(u.y[s], b.y + b.h));
  return Math.hypot(u.x[s] - cx, u.y[s] - cy);
}

/** Pro-Tick-Logik für Kampf- und Bewegungseinheiten */
export function militaryTick(sim: Sim, s: number): void {
  const u = sim.units;
  const def = UNITS[u.type[s]];
  const state = u.state[s];
  if (u.cd[s] > 0) u.cd[s]--;
  // brennende Einheiten
  if (u.burn[s] > 0) {
    u.burn[s] -= DT;
    if (damageUnit(sim, s, 5 * DT, D.Fire, -1)) return;
  }
  if (def.tunnels && state === S.Tunnel) return tunnelTick(sim, s);
  if (def.healer) healTick(sim, s);
  if (def.repairs && state === S.Idle) repairerTick(sim, s);
  if (def.towerBridge || def.cover) return siegeSupportTick(sim, s);
  if (def.ladders) return ladderTick(sim, s);

  const owner = u.owner[s];
  switch (state) {
    case S.Idle: {
      if (def.bldOnly || def.range < 1) break;
      if ((sim.tick + s) % 4 !== 0) break;
      const stance = u.stance[s];
      const anchorDist = Math.hypot(u.x[s] - u.ax[s], u.y[s] - u.ay[s]);
      const sight = stance === Stance.Hold ? def.range : stance === Stance.Defensive ? Math.min(def.sight, def.range + 3) : def.sight;
      const e = findEnemyUnit(sim, s, Math.max(sight, def.range + 0.5), def.range > 3);
      if (e >= 0) {
        u.target[s] = u.id(e);
        u.targetKind[s] = 1;
        u.flags[s] |= 8; // Auto-Ziel (kehrt zurück)
        u.state[s] = S.Attack;
        break;
      }
      // Rückkehr zum Ankerpunkt (defensiv, nachdem Jagd beendet)
      if (stance !== Stance.Hold && anchorDist > 3 && u.flags[s] & 16) {
        u.goal[s] = -1; // direkter Rückweg (spart Flowfields)
        u.tx[s] = u.ax[s];
        u.ty[s] = u.ay[s];
        u.state[s] = S.Move;
        u.flags[s] &= ~16;
      }
      break;
    }
    case S.Move:
    case S.AttackMove: {
      // Bei Angriffsmarsch Gegner auf dem Weg bekämpfen
      if (state === S.AttackMove && (sim.tick + s) % 4 === 0 && !def.bldOnly) {
        const e = findEnemyUnit(sim, s, def.sight, def.range > 3);
        if (e >= 0) {
          u.target[s] = u.id(e);
          u.targetKind[s] = 1;
          u.flags[s] |= 8 | 32; // auto + Marsch fortsetzen
          u.state[s] = S.Attack;
          break;
        }
        const bid = enemyBuildingAt(sim, u.x[s], u.y[s], owner, Math.max(2, def.range), !!def.siege);
        if (bid && u.stance[s] !== Stance.Hold) {
          u.target[s] = bid;
          u.targetKind[s] = 2;
          u.flags[s] |= 8 | 32;
          u.state[s] = S.Attack;
          break;
        }
      }
      const r = followGoal(sim, s, state === S.AttackMove || def.bldOnly === true || !!def.siege, state === S.AttackMove ? 1.2 : 0.6);
      if (r === MR.Arrived || r === MR.NoPath) {
        const q = u.waypoints.get(s);
        if (q && q.length) {
          const w = q.shift()!;
          const g = goalNodeAt(sim, w.x, w.y, sim.teamOf[owner]);
          if (g) {
            u.goal[s] = g.node;
            u.tx[s] = g.px;
            u.ty[s] = g.py;
          }
        } else {
          u.state[s] = S.Idle;
          u.ax[s] = u.x[s];
          u.ay[s] = u.y[s];
        }
      } else if (r === MR.Breach) {
        // Wand blockiert den Weg: angreifen
        if (def.range < 1 && !def.dmg) {
          u.targetKind[s] = 0;
          break;
        }
        u.flags[s] |= 32;
        u.state[s] = S.Attack;
      } else if (u.stuck[s] > 60) {
        // festgefahren: aufgeben
        u.stuck[s] = 0;
        if (u.goal[s] < 0) {
          u.state[s] = S.Idle;
          u.ax[s] = u.x[s];
          u.ay[s] = u.y[s];
        }
      }
      break;
    }
    case S.Attack:
      attackStateTick(sim, s, def);
      break;
    case S.Patrol: {
      if ((sim.tick + s) % 4 === 0) {
        const e = findEnemyUnit(sim, s, def.sight, def.range > 3);
        if (e >= 0) {
          u.target[s] = u.id(e);
          u.targetKind[s] = 1;
          u.flags[s] |= 8 | 64;
          u.state[s] = S.Attack;
          break;
        }
      }
      const r = followGoal(sim, s, false, 0.8);
      if (r === MR.Arrived || r === MR.NoPath) {
        // Zielpunkt tauschen
        const nx = u.ax[s];
        const ny = u.ay[s];
        u.ax[s] = u.tx[s];
        u.ay[s] = u.ty[s];
        u.tx[s] = nx;
        u.ty[s] = ny;
        u.goal[s] = tileOf(sim, nx, ny) * 2 + u.layer[s];
      }
      break;
    }
    case S.Ground: {
      const d = Math.hypot(u.ax[s] - u.x[s], u.ay[s] - u.y[s]);
      if (d > def.range) {
        u.tx[s] = u.ax[s];
        u.ty[s] = u.ay[s];
        u.goal[s] = tileOf(sim, u.ax[s], u.ay[s]) * 2;
        const dx = u.ax[s] - u.x[s];
        const dy = u.ay[s] - u.y[s];
        const l = Math.hypot(dx, dy) || 1;
        // so weit nähern, dass das Ziel in Reichweite liegt
        u.tx[s] = u.ax[s] - (dx / l) * (def.range - 1);
        u.ty[s] = u.ay[s] - (dy / l) * (def.range - 1);
        followGoal(sim, s, false, 0.5);
      } else if (u.cd[s] <= 0 && def.proj) {
        u.cd[s] = Math.round(def.cd * 10);
        fireProjectile(sim, {
          kind: def.proj,
          owner,
          sx: u.x[s],
          sy: u.y[s],
          sz: groundZ(sim, u.x[s], u.y[s]) + 0.7,
          tx: u.ax[s] + (sim.rng.next() - 0.5) * 1.2,
          ty: u.ay[s] + (sim.rng.next() - 0.5) * 1.2,
          dmg: def.dmg * fearMul(sim, owner),
          dtype: def.dtype,
          splash: def.splash,
          fire: def.fireDmg,
        });
      }
      break;
    }
    default:
      break;
  }
}

function attackStateTick(sim: Sim, s: number, def: (typeof UNITS)[number]): void {
  const u = sim.units;
  const owner = u.owner[s];
  const auto = (u.flags[s] & 8) !== 0;
  const resume = (u.flags[s] & 32) !== 0;
  const kind = u.targetKind[s];
  const finish = () => {
    // Ursprüngliches Ziel nach Durchbruch/Hindernis wieder aufnehmen
    if (u.home[s]) {
      const k = u.sub[s];
      const ok = k === 1 ? u.valid(u.home[s]) : sim.buildings.has(u.home[s]);
      const t = u.home[s];
      u.home[s] = 0;
      u.sub[s] = 0;
      if (ok) {
        u.target[s] = t;
        u.targetKind[s] = k;
        return;
      }
    }
    u.targetKind[s] = 0;
    u.target[s] = 0;
    u.flags[s] &= ~(8 | 32 | 64);
    if (resume && u.march[s] >= 0 && Math.hypot(u.ax[s] - u.x[s], u.ay[s] - u.y[s]) > 1.5) {
      u.goal[s] = u.march[s];
      u.tx[s] = u.ax[s];
      u.ty[s] = u.ay[s];
      u.state[s] = S.AttackMove;
    } else {
      u.state[s] = S.Idle;
      u.flags[s] |= 16;
    }
  };
  if (kind === 1) {
    const o = u.slot(u.target[s]);
    if (o < 0 || !sim.isEnemy(owner, u.owner[o]) || u.state[o] === S.Tunnel) return finish();
    const dx = u.x[o] - u.x[s];
    const dy = u.y[o] - u.y[s];
    const d = Math.hypot(dx, dy);
    const range = def.range + UNITS[u.type[o]].radius * 0.5;
    // Zu weit vom Anker: aufgeben (defensiv)
    if (auto && u.stance[s] !== Stance.Aggressive && Math.hypot(u.x[s] - u.ax[s], u.y[s] - u.ay[s]) > def.sight + 6) return finish();
    if (u.stance[s] === Stance.Hold && auto && d > def.range + 0.5) return finish();
    if (d <= range && (def.minRange === 0 || d >= def.minRange) && (u.layer[o] === u.layer[s] || def.range > 3 || d < 1.6)) {
      if (def.bldOnly) return finish();
      if (u.cd[s] <= 0) {
        // Fernkämpfer benötigen freie Schusslinie nicht (Bögen schießen über Hindernisse)
        attackUnit(sim, s, o);
      } else {
        u.face[s] = Math.atan2(dx, dy);
      }
      return;
    }
    // zu nah für Katapulte
    if (def.minRange > 0 && d < def.minRange) return;
    // Annähern
    if (u.layer[o] === u.layer[s] && clearLine(sim, u.x[s], u.y[s], u.x[o], u.y[o], sim.teamOf[owner], u.layer[s])) {
      const stop = Math.max(0.4, range - 0.3);
      const nx = u.x[o] - (dx / (d || 1)) * stop;
      const ny = u.y[o] - (dy / (d || 1)) * stop;
      if (!walkStep(sim, s, nx, ny)) u.stuck[s]++;
    } else {
      // über Flowfield zum Ziel-Tile
      const g = goalNodeAt(sim, u.x[o], u.y[o], sim.teamOf[owner]);
      if (g) {
        const gl = u.layer[o] === 1 ? 1 : 0;
        u.goal[s] = (g.node >> 1) * 2 + gl;
        u.tx[s] = u.x[o];
        u.ty[s] = u.y[o];
        const t0 = u.target[s];
        const r = followGoal(sim, s, true, range * 0.8, 14 * 24);
        if (r === MR.Breach) {
          // eine Wand blockiert: Wand angreifen, danach Ziel wieder aufnehmen
          if (u.target[s] !== t0) {
            u.home[s] = t0;
            u.sub[s] = 1;
          }
        } else if (r === MR.NoPath) {
          // Ziel unerreichbar: Fernkämpfer feuern trotzdem; sonst aufgeben
          if (def.range <= 3) return finish();
        }
      }
    }
    if (u.stuck[s] > 60) {
      u.stuck[s] = 0;
      if (auto) return finish();
    }
    return;
  }
  if (kind === 2) {
    const b = sim.buildings.get(u.target[s]);
    if (!b || b.dead || !sim.isEnemy(owner, b.owner)) return finish();
    const d = distToBuilding(u, s, b);
    const reach = def.range + 0.35;
    if (d <= reach && (def.minRange === 0 || d >= def.minRange) && (u.layer[s] === 0 || !b.def.wallTop || true)) {
      if (u.cd[s] <= 0) attackBuilding(sim, s, b);
      return;
    }
    if (def.range > 3 && d <= def.range && u.layer[s] === 0) {
      if (u.cd[s] <= 0 && d >= def.minRange) attackBuilding(sim, s, b);
      return;
    }
    // Ziel anlaufen: Flowfield zur Gebäudemitte (Durchbruchskosten führen durch Mauern/Tore)
    const w = sim.map.w;
    const tile = buildingCenterTile(sim, b);
    u.goal[s] = tile * 2;
    u.tx[s] = (tile % w) + 0.5;
    u.ty[s] = ((tile / w) | 0) + 0.5;
    const t0 = u.target[s];
    const k0 = u.targetKind[s];
    const r = followGoal(sim, s, true, 0.6);
    if (r === MR.Breach) {
      if (u.target[s] !== t0) {
        u.home[s] = t0;
        u.sub[s] = k0;
      }
    } else if (r === MR.NoPath || r === MR.Arrived) {
      if (!walkStep(sim, s, b.cx, b.cy)) u.stuck[s]++;
      if (u.stuck[s] > 80) {
        u.stuck[s] = 0;
        return finish();
      }
    }
    return;
  }
  finish();
}

// ---------------- Spezialeinheiten ----------------
function healTick(sim: Sim, s: number): void {
  if ((sim.tick + s) % 10 !== 0) return;
  const u = sim.units;
  sim.spatial.query(u.x[s], u.y[s], 3, (o) => {
    if (!u.alive[o] || sim.isEnemy(u.owner[s], u.owner[o]) || o === s) return;
    if (u.hp[o] < u.maxHp[o]) {
      u.hp[o] = Math.min(u.maxHp[o], u.hp[o] + 4);
      if (sim.rng.next() < 0.2) sim.emit({ e: 'fx', k: 'heal', x: u.x[o], y: u.y[o], z: 0.4 });
    }
  });
}

function repairerTick(sim: Sim, s: number): void {
  if ((sim.tick + s) % 10 !== 0) return;
  const u = sim.units;
  const owner = u.owner[s];
  for (const b of sim.buildings.values()) {
    if (b.owner !== owner || b.hp >= b.maxHp) continue;
    if (distToBuilding(u, s, b) <= 1.6) {
      b.hp = Math.min(b.maxHp, b.hp + 12);
      return;
    }
  }
}

function siegeSupportTick(sim: Sim, s: number): void {
  const u = sim.units;
  const def = UNITS[u.type[s]];
  const state = u.state[s];
  if (state === S.Move || state === S.AttackMove) {
    const r = followGoal(sim, s, true, 1.0);
    if (r === MR.Arrived || r === MR.NoPath) u.state[s] = S.Idle;
    else if (r === MR.Breach && def.towerBridge) deployTower(sim, s);
    return;
  }
  if (state === S.Attack && def.towerBridge) {
    // Belagerungsturm läuft zur Zielmauer
    const b = sim.buildings.get(u.target[s]);
    if (!b) {
      u.state[s] = S.Idle;
      return;
    }
    const w = sim.map.w;
    const tile = buildingCenterTile(sim, b);
    u.goal[s] = tile * 2;
    u.tx[s] = (tile % w) + 0.5;
    u.ty[s] = ((tile / w) | 0) + 0.5;
    const r = followGoal(sim, s, true, 0.6);
    if (r === MR.Breach || distToBuilding(u, s, b) < 1.6) deployTower(sim, s);
    else if (r === MR.NoPath) u.state[s] = S.Idle;
  }
}

/** Belagerungsturm legt sich an die Mauer: wird zur Leiter für das Team */
function deployTower(sim: Sim, s: number): void {
  const u = sim.units;
  const owner = u.owner[s];
  const w = sim.map.w;
  // Mauer-Tile in Laufrichtung suchen
  const fx = Math.sin(u.face[s]);
  const fy = Math.cos(u.face[s]);
  for (let k = 0; k < 4; k++) {
    const tx = Math.floor(u.x[s] + fx * (0.8 + k * 0.6));
    const ty = Math.floor(u.y[s] + fy * (0.8 + k * 0.6));
    if (!sim.map.inBounds(tx, ty)) continue;
    const i = ty * w + tx;
    if (sim.nav.kind[i] & NK.WallTop && sim.nav.kind[i] & NK.Solid && sim.isEnemy(owner, sim.nav.owner[i] - 1)) {
      placeLadder(sim, i, owner, u.hp[s], true);
      sim.killUnitSilent(s);
      return;
    }
  }
}

export function placeLadder(sim: Sim, tile: number, owner: number, hp: number, tower: boolean): void {
  const team = sim.teamOf[owner];
  const existing = sim.ladders.get(tile);
  if (existing && existing.team === team) {
    existing.until = sim.tick + (tower ? 3000 : 900);
    return;
  }
  sim.ladders.set(tile, { tile, team, owner, hp, until: sim.tick + (tower ? 3000 : 900), tower });
  sim.nav.ladder[tile] |= 1 << team;
  sim.nav.bump();
  sim.emit({ e: 'fx', k: 'dust', x: (tile % sim.map.w) + 0.5, y: ((tile / sim.map.w) | 0) + 0.5, z: 1 });
}

export function removeLadder(sim: Sim, tile: number): void {
  const l = sim.ladders.get(tile);
  if (!l) return;
  sim.ladders.delete(tile);
  sim.nav.ladder[tile] &= ~(1 << l.team);
  sim.nav.bump();
}

/** Leiterträger: laufen zur nächsten feindlichen Mauer am Ziel und stellen eine Leiter auf */
function ladderTick(sim: Sim, s: number): void {
  const u = sim.units;
  const owner = u.owner[s];
  const state = u.state[s];
  if (state === S.Move || state === S.AttackMove || state === S.Attack) {
    if (state === S.Attack && u.targetKind[s] === 2) {
      const tb = sim.buildings.get(u.target[s]);
      if (!tb) {
        u.state[s] = S.Idle;
        return;
      }
      const tile = buildingCenterTile(sim, tb);
      u.goal[s] = tile * 2;
      u.tx[s] = (tile % sim.map.w) + 0.5;
      u.ty[s] = ((tile / sim.map.w) | 0) + 0.5;
    }
    const r = followGoal(sim, s, true, 0.8);
    if (r === MR.Breach) {
      const bid = u.target[s];
      const b = sim.buildings.get(bid);
      if (b && b.def.wallTop && sim.isEnemy(owner, b.owner)) {
        // Das Tile direkt vor uns ist die Wand
        const fx = Math.sin(u.face[s]);
        const fy = Math.cos(u.face[s]);
        const tx = Math.floor(u.x[s] + fx * 0.9);
        const ty = Math.floor(u.y[s] + fy * 0.9);
        const tile = sim.map.inBounds(tx, ty) ? ty * sim.map.w + tx : -1;
        if (tile >= 0 && sim.bldAt[tile] === bid) {
          placeLadder(sim, tile, owner, 120, false);
          sim.killUnitSilent(s);
          return;
        }
        // sonst: nächstes Wand-Tile des Gebäudes
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = Math.floor(u.x[s]) + dx;
          const ny = Math.floor(u.y[s]) + dy;
          if (!sim.map.inBounds(nx, ny)) continue;
          const ni = ny * sim.map.w + nx;
          if (sim.nav.kind[ni] & NK.WallTop && sim.nav.kind[ni] & NK.Solid && sim.isEnemy(owner, sim.nav.owner[ni] - 1)) {
            placeLadder(sim, ni, owner, 120, false);
            sim.killUnitSilent(s);
            return;
          }
        }
      }
      u.state[s] = S.Idle;
    } else if (r === MR.Arrived || r === MR.NoPath) u.state[s] = S.Idle;
  }
}

// ---------------- Tunnelgräber ----------------
export function orderTunnel(sim: Sim, p: number, ids: number[], x: number, y: number): void {
  const u = sim.units;
  for (const s of ownedSlots(sim, p, ids)) {
    if (!UNITS[u.type[s]].tunnels) continue;
    u.tx[s] = x;
    u.ty[s] = y;
    u.goal[s] = -1;
    u.state[s] = S.Tunnel;
    u.sub[s] = 0; // 0 = Anmarsch zum Einstieg (oberirdisch), 1 = unterirdisch
    u.timer[s] = 0;
    u.flags[s] &= ~(8 | 32 | 64);
  }
}

function tunnelTick(sim: Sim, s: number): void {
  const u = sim.units;
  const owner = u.owner[s];
  const tx = u.tx[s];
  const ty = u.ty[s];
  const d = Math.hypot(tx - u.x[s], ty - u.y[s]);
  // Einstieg: zunächst offen laufen, sobald eine Mauer im Weg oder Entfernung < 12: untertauchen
  if (u.sub[s] === 0) {
    if (d > 14) {
      u.goal[s] = tileOf(sim, tx, ty) * 2;
      const r = followGoal(sim, s, false, 13);
      if (r === MR.NoPath) {
        // direkt untertauchen, wenn kein Weg
        u.sub[s] = 1;
      }
      const dd = Math.hypot(tx - u.x[s], ty - u.y[s]);
      if (dd <= 14) u.sub[s] = 1;
      return;
    }
    u.sub[s] = 1;
    sim.emit({ e: 'fx', k: 'dust', x: u.x[s], y: u.y[s], z: 0.2 });
  }
  // Unterirdisch: gerade Linie, langsam, unverwundbar
  if (d < 1.0) {
    // Auftauchen: Gebäude im Radius zum Einsturz bringen
    sim.emit({ e: 'fx', k: 'explosion', x: tx, y: ty, z: 0.5 });
    const r = 2;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const bx = Math.floor(tx) + dx;
        const by = Math.floor(ty) + dy;
        if (!sim.map.inBounds(bx, by)) continue;
        const id = sim.bldAt[by * sim.map.w + bx];
        const b = id ? sim.buildings.get(id) : null;
        if (b && sim.isEnemy(owner, b.owner) && b.def.hp > 0) sim.damageBuilding(b, b.def.line ? b.hp + 1 : 450 + b.maxHp * 0.25, owner);
      }
    killUnit(sim, s, -1);
    return;
  }
  const sp = UNITS[U.Tunneler].speed * 0.9 * DT;
  u.x[s] += ((tx - u.x[s]) / d) * sp;
  u.y[s] += ((ty - u.y[s]) / d) * sp;
  u.face[s] = Math.atan2(tx - u.x[s], ty - u.y[s]);
}

export { BUILDINGS };
