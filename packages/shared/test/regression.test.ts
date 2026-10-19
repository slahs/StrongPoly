import { describe, expect, it } from 'vitest';
import { AI_PROFILES, generateMap, Sim, T, TREE_WOOD } from '../src';

describe('Regression: Burgbau der KI', () => {
  it('Startbereiche sind baumfrei (Mauerring, Gräben und Tore passen hinein)', () => {
    for (const seed of [1, 7, 33]) {
      const m = generateMap({ seed, size: 160, players: 4 });
      for (const s of m.starts) {
        for (let y = s.y - 18; y <= s.y + 18; y++)
          for (let x = s.x - 18; x <= s.x + 18; x++) if (m.inBounds(x, y)) expect(m.trees[m.idx(x, y)] === TREE_WOOD).toBe(false);
      }
    }
    void T;
  });

  for (const ai of [5, 3, 0]) {
    it(`Profil ${ai} (${AI_PROFILES[ai].name}) baut sein Torhaus (früher: Bäume ließen den Plan das Tor überspringen)`, () => {
      const seed = 7;
      const map = generateMap({ seed, size: 160, players: 2 });
      const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai }, { name: 'B', team: 1, kind: 'ai', ai: 0 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
      for (let i = 0; i < 15000; i++) sim.step();
      let gates = 0;
      for (const b of sim.buildings.values()) if (b.owner === 0 && b.def.gate) gates++;
      expect(gates).toBeGreaterThanOrEqual(1);
    });
  }
});
