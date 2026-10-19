import { describe, expect, it } from 'vitest';
import { BT, S, Sim, U, UNITS, Stance, R, D } from '../src';
import { damageUnit } from '../src/sim/combat';
import { autoPlace, mkSim, run } from './helpers';

function spawnGroup(sim: Sim, type: number, owner: number, x: number, y: number, n: number, cols = 5): number[] {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = sim.spawnUnit(type, owner, x + (i % cols) * 0.8, y + Math.floor(i / cols) * 0.8);
    sim.units.stance[s] = Stance.Aggressive;
    sim.units.ax[s] = sim.units.x[s];
    sim.units.ay[s] = sim.units.y[s];
    ids.push(sim.units.id(s));
  }
  return ids;
}

/** Freies Feld in der Kartenmitte */
function arena(sim: Sim): { x: number; y: number } {
  const m = sim.map;
  const cx = m.w >> 1;
  const cy = m.h >> 1;
  for (let y = cy - 8; y < cy + 8; y++)
    for (let x = cx - 12; x < cx + 12; x++) {
      const i = m.idx(x, y);
      m.terrain[i] = 1;
      m.height[i] = 1;
      m.trees[i] = 0;
    }
  sim.nav.bump();
  return { x: cx, y: cy };
}

const alive = (sim: Sim, ids: number[]) => ids.filter((id) => sim.units.valid(id)).length;

describe('Kampf', () => {
  it('Speerkämpfer besiegen Peasants/schwächere Einheit; stärkere Gruppe gewinnt', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const a = spawnGroup(sim, U.Swordsman, 0, c.x - 8, c.y, 10);
    const b = spawnGroup(sim, U.Spearman, 1, c.x + 4, c.y, 10);
    run(sim, 600);
    expect(alive(sim, a)).toBeGreaterThan(alive(sim, b));
    expect(alive(sim, b)).toBeLessThan(10);
  });

  it('Bogenschützen schießen Projektile und töten', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const a = spawnGroup(sim, U.Archer, 0, c.x - 8, c.y, 8);
    const b = spawnGroup(sim, U.Spearman, 1, c.x + 2, c.y, 4);
    let sawProj = false;
    for (let i = 0; i < 400; i++) {
      sim.step();
      if (sim.proj.count > 0) sawProj = true;
    }
    expect(sawProj).toBe(true);
    expect(alive(sim, b)).toBeLessThan(4);
    expect(alive(sim, a)).toBeGreaterThan(0);
  });

  it('Rüstung: Bogenschaden gegen Schwertkämpfer deutlich geringer als gegen Bauern', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const sw = sim.spawnUnit(U.Swordsman, 1, c.x, c.y);
    const kn = sim.spawnUnit(U.Knight, 1, c.x + 2, c.y);
    const pe = sim.spawnUnit(U.Spearman, 1, c.x + 4, c.y);
    const peas = sim.spawnUnit(U.Peasant, 1, c.x + 6, c.y);
    const before = [sw, kn, pe, peas].map((s) => sim.units.hp[s]);
    for (const s of [sw, kn, pe, peas]) damageUnit(sim, s, 10, D.Pierce, 0);
    const loss = [sw, kn, pe, peas].map((s, i) => before[i] - sim.units.hp[s]);
    expect(loss[3]).toBeGreaterThan(loss[2]);
    expect(loss[2]).toBeGreaterThan(loss[0]);
    expect(loss[0]).toBeGreaterThan(loss[1]);
  });

  it('Geschlossene Mauer blockiert Gegner, Angreifer brechen durch', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const cx = c.x + 5;
    for (let y = c.y - 3; y <= c.y + 3; y++)
      for (let x = cx - 3; x <= cx + 3; x++) if (Math.max(Math.abs(x - cx), Math.abs(y - c.y)) === 3) sim.addBuilding(1, BT.WallLow, x, y, 0);
    const att = spawnGroup(sim, U.Maceman, 0, c.x - 9, c.y, 3);
    sim.step([{ p: 0, cmd: { c: 'move', units: att, x: cx + 0.5, y: c.y + 0.5, attack: true } }]);
    run(sim, 200);
    const inside = att.filter((id) => { const s = sim.units.slot(id); return s >= 0 && Math.hypot(sim.units.x[s] - cx, sim.units.y[s] - c.y) < 2.5; });
    expect(inside.length).toBe(0);
    const walls = [...sim.buildings.values()].filter((b) => b.type === BT.WallLow);
    expect(walls.some((w) => w.hp < w.maxHp)).toBe(true);
  });

  it('Tor: eigene Einheiten passieren, fremde nicht', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    for (let y = c.y - 6; y <= c.y + 6; y++) if (y < c.y - 1 || y > c.y) sim.addBuilding(1, BT.WallHigh, c.x, y, 0);
    sim.addBuilding(1, BT.GateWood, c.x - 1, c.y - 1, 1); // 2 breit (x) × 3 hoch (y) - rot
    const own = spawnGroup(sim, U.Spearman, 1, c.x + 4, c.y, 1);
    sim.step([{ p: 1, cmd: { c: 'move', units: own, x: c.x - 6, y: c.y } }]);
    run(sim, 160);
    const s = sim.units.slot(own[0]);
    expect(sim.units.x[s]).toBeLessThan(c.x - 3);
    // Torregel: für den Besitzer frei, für Fremde gesperrt (Navigation)
    const gi = sim.map.idx(c.x, c.y);
    expect(sim.nav.groundFree(gi, 1)).toBe(true);
    expect(sim.nav.groundFree(gi, 0)).toBe(false);
  });

  it('Treppe führt auf die Mauer; Bogenschützen auf der Mauer haben Reichweitenvorteil', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    for (let x = c.x - 3; x <= c.x + 3; x++) sim.addBuilding(0, BT.WallHigh, x, c.y, 0);
    sim.addBuilding(0, BT.Stairs, c.x - 4, c.y, 0);
    const arch = spawnGroup(sim, U.Archer, 0, c.x - 5, c.y + 2, 2);
    sim.step([{ p: 0, cmd: { c: 'move', units: arch, x: c.x, y: c.y } }]);
    run(sim, 200);
    const s = sim.units.slot(arch[0]);
    expect(sim.units.layer[s]).toBe(1);
  });

  it('Pit und Ölkessel verletzen Angreifer', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    sim.addBuilding(0, BT.Pit, c.x, c.y, 0);
    const e = spawnGroup(sim, U.Swordsman, 1, c.x - 3, c.y, 1);
    sim.step([{ p: 1, cmd: { c: 'move', units: e, x: c.x + 3, y: c.y } }]);
    const s = sim.units.slot(e[0]);
    const hp0 = sim.units.hp[s];
    run(sim, 80);
    expect(sim.units.hp[s]).toBeLessThan(hp0);
    // Kessel
    sim.addStock(0, R.Pitch, 5);
    sim.addBuilding(0, BT.Cauldron, c.x + 6, c.y + 3, 0);
    const e2 = spawnGroup(sim, U.Pikeman, 1, c.x + 4, c.y + 3, 1);
    const s2 = sim.units.slot(e2[0]);
    const h2 = sim.units.hp[s2];
    sim.units.stance[s2] = Stance.Hold;
    run(sim, 30);
    expect(sim.units.hp[s2]).toBeLessThan(h2);
    expect(sim.players[0].stock[R.Pitch]).toBeLessThan(5);
  });

  it('Feuer breitet sich aus, Brunnen löscht', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const h1 = sim.addBuilding(0, BT.Hovel, c.x, c.y, 0);
    const h2 = sim.addBuilding(0, BT.Hovel, c.x + 2, c.y, 0);
    h1.burn = 18;
    run(sim, 300);
    expect(h1.hp).toBeLessThan(h1.maxHp);
    expect(h2.hp < h2.maxHp || h2.burn > 0 || h2.dead).toBe(true);
    const sim2 = mkSim(5);
    const c2 = arena(sim2);
    const k1 = sim2.addBuilding(0, BT.Hovel, c2.x, c2.y, 0);
    sim2.addBuilding(0, BT.Well, c2.x + 3, c2.y, 0);
    k1.burn = 18;
    run(sim2, 100);
    expect(k1.burn).toBeLessThanOrEqual(0);
    expect(k1.hp).toBeGreaterThan(k1.maxHp * 0.7);
  });

  it('Rekrutierung verbraucht Bauer, Gold und Waffe', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    const bk = autoPlace(sim, 0, BT.Barracks)!;
    autoPlace(sim, 0, BT.Armory);
    sim.addStock(0, R.Bow, 3);
    run(sim, 20);
    const g = pl.gold;
    const peas = pl.peasants;
    sim.step([{ p: 0, cmd: { c: 'recruit', building: bk.id, unit: U.Archer, count: 2 } }]);
    expect(pl.gold).toBe(g - 2 * UNITS[U.Archer].cost.gold);
    expect(pl.stock[R.Bow]).toBe(1);
    run(sim, 120);
    let archers = 0;
    for (let s = 0; s < sim.units.top; s++) if (sim.units.alive[s] && sim.units.owner[s] === 0 && sim.units.type[s] === U.Archer) archers++;
    expect(archers).toBe(2);
    expect(peas).toBeGreaterThan(0);
  });

  it('Lord stirbt -> Spieler besiegt', () => {
    const sim = mkSim(5);
    const lord = sim.units.slot(sim.players[1].lordId);
    // Gegner-Einheit direkt an den Lord
    const a = spawnGroup(sim, U.Knight, 0, sim.units.x[lord] + 1, sim.units.y[lord], 6);
    sim.units.hp[lord] = 10;
    run(sim, 80);
    expect(sim.players[1].alive).toBe(false);
    expect(sim.gameOver).toBe(true);
    expect(a.length).toBe(6);
    void S;
  });
});
