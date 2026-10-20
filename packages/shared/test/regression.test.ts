import { describe, expect, it } from 'vitest';
import { AI_PROFILES, BT, generateMap, Sim, T, TREE_WOOD } from '../src';

describe('Regression: Burgbau der KI', () => {
  it('Startbereiche sind baumfrei (Mauerring, Gräben und Tore passen hinein)', () => {
    for (const seed of [1, 7, 33]) {
      const m = generateMap({ seed, size: 160, players: 4 });
      for (const s of m.starts) {
        for (let y = s.y - 14; y <= s.y + 14; y++)
          for (let x = s.x - 14; x <= s.x + 14; x++) if (m.inBounds(x, y)) expect(m.trees[m.idx(x, y)] === TREE_WOOD).toBe(false);
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

describe('Regression: Vorkommen', () => {
  it('Stein- und Eisenvorkommen werden nicht mit anderen Gebäuden überbaut (KI fand sonst keine Eisenmine)', () => {
    const map = generateMap({ seed: 7, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 7, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'human' }], startGold: 5000, troopLimit: 1000, fog: false, extreme: false });
    sim.players[0].stock[0] = 500;
    let iron = -1;
    for (let i = 0; i < map.n; i++) if (map.terrain[i] === T.IronDeposit && map.trees[i] === 0) { iron = i; break; }
    expect(iron).toBeGreaterThanOrEqual(0);
    const x = iron % map.w;
    const y = Math.floor(iron / map.w);
    expect(sim.checkPlace(0, BT.Hovel, x, y, 0, true)).toBe('Vorkommen nicht überbauen');
  });
});

describe('Regression: Holzversorgung der KI', () => {
  it('Gräfin (seed 15) bleibt mit Holz versorgt (früher: Holzfäller im baumfreien Burgbereich, ab Minute 9 kein Holz mehr)', () => {
    const map = generateMap({ seed: 15, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 15, players: [{ name: 'A', team: 0, kind: 'ai', ai: 0 }, { name: 'B', team: 1, kind: 'ai', ai: 1 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    let minWoodAfter15 = Infinity;
    while (sim.tick < 30 * 600 && !sim.gameOver) {
      sim.step();
      if (sim.tick > 15 * 600 && sim.tick % 600 === 0) minWoodAfter15 = Math.min(minWoodAfter15, sim.players[1].stock[0]);
    }
    // früher: alle 5 Holzfäller im baumfreien Burgbereich, ab Minute 9 dauerhaft 0 Holz
    let supplied = 0;
    const m = sim.map;
    for (const b of sim.buildings.values()) {
      if (b.owner !== 1 || b.type !== BT.Woodcutter) continue;
      let n = 0;
      for (let y = Math.floor(b.cy) - 14; y <= Math.floor(b.cy) + 14; y++)
        for (let x = Math.floor(b.cx) - 14; x <= Math.floor(b.cx) + 14; x++) if (m.inBounds(x, y) && m.trees[m.idx(x, y)]) n++;
      if (n >= 3) supplied++;
    }
    expect(supplied).toBeGreaterThanOrEqual(1);
    expect(minWoodAfter15).toBeGreaterThan(0);
    expect([...sim.buildings.values()].some((b) => b.owner === 1 && b.type === BT.Market)).toBe(true);
  }, 120000);
});

describe('Regression: KI-Duelle enden', () => {
  it('Baron vs Wolf (früher Patt bei ~25 Gold): ein Bergfried fällt innerhalb von 90 Minuten', () => {
    const map = generateMap({ seed: 7, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 7, players: [{ name: 'A', team: 0, kind: 'ai', ai: 0 }, { name: 'B', team: 1, kind: 'ai', ai: 8 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    while (sim.tick < 90 * 600 && !sim.gameOver) sim.step();
    expect(sim.gameOver).toBe(true);
  }, 120000);
});
