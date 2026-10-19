import { DT, FIRE_DPS, FIRE_SPREAD_CHANCE, POT_RADIUS, WELL_RADIUS } from '../data/balance';
import { BT } from '../data/buildings';
import { R } from '../data/resources';
import { D, PROJ, U } from '../data/units';
import { damageUnit, fireProjectile, groundZ, hitBuilding, ignite, killUnit } from './combat';
import type { Building } from './building';
import type { Sim } from './sim';
import { S } from './unitstore';

/** Feuer, Tore, Fallen, Ölkessel und Turmgeschütze */
export function updateFire(sim: Sim): void {
  updateBurning(sim);
  if (sim.tick % 5 === 0) updateGates(sim);
  updateDefenses(sim);
  updateLadders(sim);
}

function updateBurning(sim: Sim): void {
  const cache = sim.fireCache;
  if (cache.tick !== sim.tick - (sim.tick % 10)) {
    cache.tick = sim.tick - (sim.tick % 10);
    cache.list = [];
    for (const b of sim.buildings.values()) if (b.type === BT.Well || b.type === BT.WaterPot) cache.list.push(b);
  }
  const extinguishers = cache.list;
  for (const b of [...sim.buildings.values()]) {
    if (b.burn <= 0) continue;
    if (b.type === BT.PitchDitch) {
      burnDitch(sim, b);
      continue;
    }
    b.burn -= DT;
    // Löschen
    for (const e of extinguishers) {
      const r = e.type === BT.Well ? WELL_RADIUS : POT_RADIUS;
      if (e.owner === b.owner && (e.cx - b.cx) ** 2 + (e.cy - b.cy) ** 2 <= r * r) {
        b.burn -= 5 * DT;
        break;
      }
    }
    sim.damageBuilding(b, FIRE_DPS * DT, -1);
    if (b.dead) continue;
    if (sim.tick % 10 === 0) {
      for (const o of sim.buildings.values()) {
        if (o === b || o.burn > 0 || !o.def.wood) continue;
        if (Math.abs(o.cx - b.cx) > (o.w + b.w) / 2 + 1.1 || Math.abs(o.cy - b.cy) > (o.h + b.h) / 2 + 1.1) continue;
        if (sim.rng.next() < FIRE_SPREAD_CHANCE * 10) ignite(sim, o);
      }
    }
    // Arbeiter in brennenden Gebäuden flüchten nicht (vereinfacht)
  }
}

/** Brennender Pechgraben: schädigt Einheiten, breitet sich aus, verbrennt */
function burnDitch(sim: Sim, b: Building): void {
  b.burn -= DT;
  const u = sim.units;
  if (sim.tick % 3 === 0) {
    sim.spatial.query(b.cx, b.cy, 1.2, (s) => {
      if (!u.alive[s] || Math.hypot(u.x[s] - b.cx, u.y[s] - b.cy) > 0.9) return;
      if (u.type[s] === U.Ox || u.type[s] === U.Peasant || sim.isEnemy(b.owner, u.owner[s]) || true) damageUnit(sim, s, 9, D.Fire, b.owner, true);
    });
    if (sim.tick % 6 === 0) sim.emit({ e: 'fx', k: 'fire', x: b.cx, y: b.cy, z: 0.3 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = sim.buildingAtTile(b.x + dx, b.y + dy);
      if (n && n.type === BT.PitchDitch && n.burn <= 0 && sim.rng.next() < 0.5) n.burn = 10;
    }
  }
  if (b.burn <= 0) sim.removeBuilding(b, false);
}

export function igniteAt(sim: Sim, p: number, x: number, y: number): void {
  const b = sim.buildingAtTile(Math.floor(x), Math.floor(y));
  if (!b || b.type !== BT.PitchDitch || b.owner !== p) return;
  // Zündquelle nötig: Ingenieur oder Feuerwerfer in der Nähe (15 Tiles)
  const u = sim.units;
  let ok = false;
  for (let s = 0; s < u.top && !ok; s++) {
    if (!u.alive[s] || u.owner[s] !== p) continue;
    const t = u.type[s];
    if ((t === U.Engineer || t === U.Firethrower || t === U.Slave) && Math.hypot(u.x[s] - b.cx, u.y[s] - b.cy) < 15) ok = true;
  }
  if (!ok) {
    sim.emit({ e: 'msg', p, text: 'Ein Ingenieur muss in der Nähe sein, um den Pechgraben zu entzünden.' });
    return;
  }
  b.burn = 10;
}

function updateGates(sim: Sim): void {
  const u = sim.units;
  for (const b of sim.buildings.values()) {
    if (!b.def.gate) continue;
    let open = false;
    const r = Math.max(b.w, b.h) / 2 + 2;
    sim.spatial.query(b.cx, b.cy, r, (s) => {
      if (open || !u.alive[s]) return;
      if (sim.teamOf[u.owner[s]] === sim.teamOf[b.owner]) open = true;
    });
    if (open) b.activeUntil = sim.tick + 8;
  }
}

function updateLadders(sim: Sim): void {
  if (!sim.ladders.size) return;
  const u = sim.units;
  for (const [tile, l] of [...sim.ladders]) {
    // Verteidiger zerstören Leitern in der Nähe
    if (sim.tick % 5 === 0) {
      const x = (tile % sim.map.w) + 0.5;
      const y = ((tile / sim.map.w) | 0) + 0.5;
      let dmg = 0;
      sim.spatial.query(x, y, 1.8, (s) => {
        if (u.alive[s] && sim.teamOf[u.owner[s]] !== l.team && u.type[s] >= U.Archer && u.type[s] < U.Catapult) dmg += 14;
      });
      l.hp -= dmg;
    }
    if (l.hp <= 0 || sim.tick > l.until || !(sim.nav.kind[tile] & 1)) {
      sim.ladders.delete(tile);
      sim.nav.ladder[tile] &= ~(1 << l.team);
      sim.nav.bump();
    }
  }
}

function updateDefenses(sim: Sim): void {
  const u = sim.units;
  for (const b of [...sim.buildings.values()]) {
    if (b.dead) continue;
    const t = b.type;
    if (t === BT.Pit || t === BT.KillingPit) {
      if (t === BT.KillingPit && b.burn > 0) {
        b.burn -= DT;
        if (sim.tick % 3 === 0) {
          sim.spatial.query(b.cx, b.cy, 1.6, (s) => {
            if (u.alive[s] && sim.isEnemy(b.owner, u.owner[s])) damageUnit(sim, s, 11, D.Fire, b.owner, true);
          });
          sim.emit({ e: 'fx', k: 'fire', x: b.cx, y: b.cy, z: 0.3 });
        }
        if (b.burn <= 0) sim.removeBuilding(b, false);
        continue;
      }
      if ((sim.tick + b.id) % 2 !== 0) continue;
      let victim = -1;
      sim.spatial.query(b.cx, b.cy, 0.9, (s) => {
        if (victim >= 0 || !u.alive[s] || u.layer[s] !== 0 || u.state[s] === S.Tunnel) return;
        if (!sim.isEnemy(b.owner, u.owner[s])) return;
        if (u.type[s] >= U.Catapult) return; // Belagerungsgerät rollt darüber
        if (Math.hypot(u.x[s] - b.cx, u.y[s] - b.cy) < 0.55) victim = s;
      });
      if (victim >= 0) {
        if (t === BT.Pit) {
          damageUnit(sim, victim, 70, D.Blunt, b.owner);
          if (u.alive[victim]) u.cd[victim] = Math.max(u.cd[victim], 30);
          sim.emit({ e: 'fx', k: 'dust', x: b.cx, y: b.cy, z: 0.3 });
          sim.removeBuilding(b, false);
        } else {
          b.burn = 8;
          damageUnit(sim, victim, 40, D.Fire, b.owner, true);
        }
      }
      continue;
    }
    if (t === BT.Cauldron) {
      if (b.cd > 0) {
        b.cd--;
        continue;
      }
      if ((sim.tick + b.id) % 5 !== 0) continue;
      const pl = sim.players[b.owner];
      if (pl.stock[R.Pitch] < 1) continue;
      let best = -1;
      let bd = 6.5 * 6.5;
      sim.spatial.query(b.cx, b.cy, 6.5, (s) => {
        if (!u.alive[s] || !sim.isEnemy(b.owner, u.owner[s]) || u.layer[s] === 1) return;
        const d = (u.x[s] - b.cx) ** 2 + (u.y[s] - b.cy) ** 2;
        if (d < bd) {
          bd = d;
          best = s;
        }
      });
      if (best >= 0) {
        sim.takeStock(b.owner, R.Pitch, 1);
        const tx = u.x[best];
        const ty = u.y[best];
        sim.emit({ e: 'fx', k: 'oil', x: tx, y: ty, z: 0.5 });
        sim.spatial.query(tx, ty, 2.4, (s) => {
          if (u.alive[s] && sim.isEnemy(b.owner, u.owner[s]) && Math.hypot(u.x[s] - tx, u.y[s] - ty) <= 2) damageUnit(sim, s, 85, D.Fire, b.owner, true);
        });
        b.cd = 90;
      }
      continue;
    }
    if (t === BT.TowerRound && b.turret) {
      if (b.turretCd > 0) {
        b.turretCd--;
        continue;
      }
      if ((sim.tick + b.id) % 3 !== 0) continue;
      const ballista = b.turret === 1;
      const range = ballista ? 18 : 16;
      const minR = ballista ? 2 : 5;
      let best = -1;
      let bd = range * range;
      sim.spatial.query(b.cx, b.cy, range, (s) => {
        if (!u.alive[s] || !sim.isEnemy(b.owner, u.owner[s]) || u.state[s] === S.Tunnel) return;
        if (UNITS_INVIS(sim, s)) return;
        const d = (u.x[s] - b.cx) ** 2 + (u.y[s] - b.cy) ** 2;
        if (d > minR * minR && d < bd) {
          bd = d;
          best = s;
        }
      });
      if (best >= 0) {
        const pl = sim.players[b.owner];
        const fm = 1 - 0.04 * pl.fear;
        fireProjectile(sim, {
          kind: ballista ? PROJ.Bolt : PROJ.Boulder,
          owner: b.owner,
          sx: b.cx,
          sy: b.cy,
          sz: groundZ(sim, b.cx, b.cy) + 1,
          tx: u.x[best],
          ty: u.y[best],
          dmg: (ballista ? 60 : 55) * fm,
          dtype: ballista ? D.Pierce : D.Siege,
          splash: ballista ? 0 : 1.5,
          target: u.id(best),
        });
        b.turretCd = ballista ? 30 : 60;
      }
    }
  }
  void hitBuilding;
  void killUnit;
}

function UNITS_INVIS(sim: Sim, s: number): boolean {
  const u = sim.units;
  if (u.type[s] !== U.Assassin) return false;
  return u.state[s] !== S.Attack;
}
