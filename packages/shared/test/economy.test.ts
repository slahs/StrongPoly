import { describe, expect, it } from 'vitest';
import { BT, generateMap, R, Sim, U } from '../src';

function mkSim(seed = 5): Sim {
  const map = generateMap({ seed, size: 128, players: 2 });
  return new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'human' }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
}

/** Sucht einen gültigen Bauplatz in der Nähe des Starts */
function findSpot(sim: Sim, p: number, type: number, near?: { x: number; y: number }): { x: number; y: number } | null {
  const st = near ?? sim.map.starts[p];
  for (let r = 3; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!sim.checkPlace(p, type, st.x + dx, st.y + dy, 0, true)) return { x: st.x + dx, y: st.y + dy };
      }
  return null;
}

describe('Wirtschaft', () => {
  it('startet mit Keep, Lager, Kornspeicher und Bauern', () => {
    const sim = mkSim();
    expect(sim.players[0].keepId).toBeGreaterThan(0);
    expect(sim.players[0].cap.stock).toBe(300);
    expect(sim.players[0].stock[R.Wood]).toBeGreaterThan(0);
    expect(sim.units.count).toBeGreaterThanOrEqual(2 * 9);
  });

  it('Holzfäller liefert Holz ins Lager', () => {
    const sim = mkSim();
    // Holzfäller direkt neben Bäumen: suche Tile mit Bäumen im Umkreis
    const st = sim.map.starts[0];
    let spot: { x: number; y: number } | null = null;
    outer: for (let r = 4; r < 28; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = st.x + dx, y = st.y + dy;
          if (!sim.map.inBounds(x, y) || !sim.map.trees[sim.map.idx(x, y)]) continue;
          const s = findSpot(sim, 0, BT.Woodcutter, { x, y });
          if (s && Math.hypot(s.x - x, s.y - y) < 6) { spot = s; break outer; }
        }
    expect(spot).not.toBeNull();
    const before = sim.players[0].stock[R.Wood];
    const b = sim.place(0, BT.Woodcutter, spot!.x, spot!.y, 0);
    expect(b).not.toBeNull();
    for (let i = 0; i < 1200; i++) sim.step();
    const after = sim.players[0].stock[R.Wood];
    expect(after).toBeGreaterThanOrEqual(before - 3 + 12); // Baukosten abgezogen, mehrere Lieferungen erhalten
    expect(b!.workers.length).toBe(1);
  });

  it('Bauern wachsen bis zum Limit bei guter Beliebtheit', () => {
    const sim = mkSim();
    for (let i = 0; i < 1500; i++) sim.step();
    const p = sim.players[0];
    expect(p.peasants).toBeGreaterThan(8);
    expect(p.peasants).toBeLessThanOrEqual(p.housing);
  });
});
