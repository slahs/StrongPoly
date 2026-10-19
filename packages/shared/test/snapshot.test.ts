import { decode, encode } from '@msgpack/msgpack';
import { describe, expect, it } from 'vitest';
import { BT, ClientWorld, GameHost, generateMap, Sim, Snapshot } from '../src';

function mk(): Sim {
  const map = generateMap({ seed: 11, size: 128, players: 2 });
  return new Sim({ map, seed: 11, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'ai', ai: 0 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
}

describe('Snapshots', () => {
  it('Voll-Snapshot + Deltas spiegeln die Sim', () => {
    const host = new GameHost(mk());
    const w = new ClientWorld();
    const wire = (s: Snapshot): Snapshot => decode(encode(s)) as Snapshot;
    w.apply(wire(host.fullSnapshot()), 0);
    for (let i = 0; i < 300; i++) {
      const snap = host.stepOnce();
      w.apply(wire(snap), i * 100);
    }
    const sim = host.sim;
    expect(w.buildings.size).toBe(sim.buildings.size);
    let n = 0;
    for (let s = 0; s < sim.units.top; s++) {
      if (!sim.units.alive[s]) continue;
      n++;
      expect(w.ids[s]).toBe(sim.units.id(s));
      expect(Math.abs(w.curX[s] - sim.units.x[s])).toBeLessThan(0.07);
    }
    expect(n).toBeGreaterThan(10);
    expect(w.map.terrain.length).toBe(sim.map.n);
    // Baue etwas und prüfe Tile-/Gebäude-Delta
    const st = sim.map.starts[0];
    let placed = null;
    for (let dx = 8; dx < 20 && !placed; dx++) placed = sim.place(0, BT.Well, st.x + dx, st.y - 8, 0);
    const snap = host.stepOnce();
    w.apply(wire(snap), 31000);
    expect(w.buildings.has(placed!.id)).toBe(true);
    expect(w.bldAt[w.map.idx(placed!.x, placed!.y)]).toBe(placed!.id);
  });
});
