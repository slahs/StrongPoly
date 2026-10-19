import { describe, expect, it } from 'vitest';
import { BT, Sim, Stance, U } from '../src';
import { mkSim, run } from './helpers';

function arena(sim: Sim): { x: number; y: number } {
  const m = sim.map;
  const cx = m.w >> 1;
  const cy = m.h >> 1;
  for (let y = cy - 14; y < cy + 14; y++)
    for (let x = cx - 18; x < cx + 18; x++) {
      const i = m.idx(x, y);
      m.terrain[i] = 1;
      m.height[i] = 1;
      m.trees[i] = 0;
    }
  sim.nav.bump();
  return { x: cx, y: cy };
}

/** Geschlossener Mauerring um (cx,cy) mit Radius r (Quadrat) */
function ring(sim: Sim, owner: number, cx: number, cy: number, r: number, type: number = BT.WallHigh): number[] {
  const ids: number[] = [];
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
      ids.push(sim.addBuilding(owner, type, x, y, 0).id);
    }
  return ids;
}

function spawn(sim: Sim, type: number, owner: number, x: number, y: number, stance: number = Stance.Aggressive): number {
  const s = sim.spawnUnit(type, owner, x, y);
  sim.units.stance[s] = stance;
  sim.units.ax[s] = x;
  sim.units.ay[s] = y;
  return sim.units.id(s);
}

describe('Belagerung', () => {
  it('Rammbock zerstört Mauer', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const wall = sim.addBuilding(1, BT.WallLow, c.x, c.y, 0);
    const ram = spawn(sim, U.Ram, 0, c.x - 6, c.y);
    sim.step([{ p: 0, cmd: { c: 'attack', units: [ram], kind: 'building', target: wall.id } }]);
    run(sim, 500);
    expect(wall.dead).toBe(true);
  });

  it('Katapult zerstört Mauern aus der Ferne', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const wall = sim.addBuilding(1, BT.WallLow, c.x + 8, c.y, 0);
    const cat = spawn(sim, U.Catapult, 0, c.x - 6, c.y);
    sim.step([{ p: 0, cmd: { c: 'attack', units: [cat], kind: 'building', target: wall.id } }]);
    run(sim, 1500);
    expect(wall.dead).toBe(true);
  });

  it('Belagerungsturm legt Brücke, Truppen erreichen die Mauerkrone', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    ring(sim, 1, c.x, c.y, 4);
    const tower = spawn(sim, U.SiegeTower, 0, c.x - 12, c.y);
    const sw = [0, 1, 2].map((i) => spawn(sim, U.Swordsman, 0, c.x - 10, c.y - 1 + i));
    const bid = sim.bldAt[sim.map.idx(c.x - 4, c.y)];
    sim.step([{ p: 0, cmd: { c: 'attack', units: [tower], kind: 'building', target: bid } }]);
    run(sim, 400);
    expect(sim.ladders.size).toBeGreaterThan(0);
    sim.step([{ p: 0, cmd: { c: 'move', units: sw, x: c.x, y: c.y, attack: true } }]);
    run(sim, 300);
    const inside = sw.filter((id) => {
      const s = sim.units.slot(id);
      return s >= 0 && (sim.units.layer[s] === 1 || Math.abs(sim.units.x[s] - c.x) < 4);
    });
    expect(inside.length).toBeGreaterThan(0);
  });

  it('Leiterträger stellen Leitern auf', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    ring(sim, 1, c.x, c.y, 4);
    const lad = spawn(sim, U.Laddermen, 0, c.x - 9, c.y);
    const bid = sim.bldAt[sim.map.idx(c.x - 4, c.y)];
    sim.step([{ p: 0, cmd: { c: 'attack', units: [lad], kind: 'building', target: bid } }]);
    run(sim, 300);
    expect(sim.ladders.size).toBe(1);
  });

  it('Assassine erklimmt Mauern ohne sie zu beschädigen', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const ids = ring(sim, 1, c.x, c.y, 3);
    const a = spawn(sim, U.Assassin, 0, c.x - 9, c.y);
    sim.step([{ p: 0, cmd: { c: 'move', units: [a], x: c.x, y: c.y } }]);
    run(sim, 250);
    const s = sim.units.slot(a);
    expect(Math.hypot(sim.units.x[s] - c.x, sim.units.y[s] - c.y)).toBeLessThan(2.5);
    for (const id of ids) expect(sim.buildings.get(id)!.hp).toBe(sim.buildings.get(id)!.maxHp);
  });

  it('Tunnelgräber bringen Mauern zum Einsturz', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    const ids = ring(sim, 1, c.x, c.y, 3, BT.WallLow);
    const t = spawn(sim, U.Tunneler, 0, c.x - 10, c.y);
    sim.step([{ p: 0, cmd: { c: 'tunnel', units: [t], x: c.x - 3 + 0.5, y: c.y + 0.5 } }]);
    run(sim, 500);
    const destroyed = ids.filter((id) => !sim.buildings.has(id)).length;
    expect(destroyed).toBeGreaterThan(0);
  });

  it('Burg-Angriff: Truppen brechen durch Holztor und töten den Lord', () => {
    const sim = mkSim(5);
    const c = arena(sim);
    // Spieler 1 Lord in den Ring setzen
    const lordSlot = sim.units.slot(sim.players[1].lordId);
    sim.units.x[lordSlot] = c.x + 0.5;
    sim.units.y[lordSlot] = c.y + 0.5;
    ring(sim, 1, c.x, c.y, 3, BT.WallLow);
    const att = [0, 1, 2, 3, 4, 5].map((i) => spawn(sim, U.Swordsman, 0, c.x - 10, c.y - 2 + i * 0.7));
    sim.step([{ p: 0, cmd: { c: 'move', units: att, x: c.x, y: c.y, attack: true } }]);
    run(sim, 1500);
    expect(sim.players[1].alive).toBe(false);
  });
});
