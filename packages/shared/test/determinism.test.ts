import { describe, expect, it } from 'vitest';
import { BT, generateMap, R, Rng, Sim, U } from '../src';
import { applyCommand } from '../src/sim/commands';

/** FNV-1a über den relevanten Zustand (Einheiten, Gebäude, Spieler, Karte) */
function stateHash(sim: Sim): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    const x = Math.round(v * 1000) | 0;
    for (let i = 0; i < 4; i++) {
      h ^= (x >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const u = sim.units;
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s]) continue;
    mix(s);
    mix(u.type[s]);
    mix(u.owner[s]);
    mix(u.x[s]);
    mix(u.y[s]);
    mix(u.hp[s]);
    mix(u.state[s]);
    mix(u.layer[s]);
  }
  for (const b of [...sim.buildings.values()].sort((a, c) => a.id - c.id)) {
    mix(b.id);
    mix(b.type);
    mix(b.x);
    mix(b.y);
    mix(b.hp);
    mix(b.out);
    mix(b.workers.length);
  }
  for (const p of sim.players) {
    mix(p.gold);
    mix(p.popularity);
    mix(p.peasants);
    mix(p.troops);
    for (let r = 0; r < p.stock.length; r++) mix(p.stock[r]);
  }
  mix(sim.tick);
  return h.toString(16);
}

function play(seed: number, extreme: boolean, minutes: number): string[] {
  const map = generateMap({ seed, size: 128, players: 3 });
  const sim = new Sim({
    map,
    seed,
    players: [
      { name: 'H0', team: 0, kind: 'human' },
      { name: 'H1', team: 1, kind: 'human' },
      { name: 'AI', team: 2, kind: 'ai', ai: 3 },
    ],
    startGold: 3000,
    troopLimit: 500,
    fog: false,
    extreme,
  });
  const rng = new Rng(seed * 31 + 7);
  const hashes: string[] = [];
  for (let t = 0; t < minutes * 600; t++) {
    if (t % 20 === 0) {
      for (const p of [0, 1]) {
        const k = sim.buildings.get(sim.players[p].keepId);
        if (!k) continue;
        const x = Math.round(k.cx + rng.range(-18, 18));
        const y = Math.round(k.cy + rng.range(-18, 18));
        const ids: number[] = [];
        for (let s = 0; s < sim.units.top && ids.length < 10; s++) if (sim.units.alive[s] && sim.units.owner[s] === p && rng.chance(0.05)) ids.push(sim.units.id(s));
        switch (rng.int(6)) {
          case 0: applyCommand(sim, p, { c: 'place', type: rng.pick([BT.Woodcutter, BT.Hovel, BT.Barracks, BT.WallLow, BT.Quarry, BT.Market]), x, y }); break;
          case 1: applyCommand(sim, p, { c: 'move', units: ids, x, y }); break;
          case 2: applyCommand(sim, p, { c: 'recruit', building: rng.pick([...sim.buildings.keys()]), unit: rng.pick([U.Archer, U.Spearman, U.Maceman]), count: 2 }); break;
          case 3: applyCommand(sim, p, { c: 'trade', res: rng.int(R.Armor), amount: 5, buy: rng.chance(0.5) }); break;
          case 4: applyCommand(sim, p, { c: 'ability', id: rng.int(5), x, y }); break;
          default: applyCommand(sim, p, { c: 'setTax', level: rng.pick([-1, 0, 1, 2]) });
        }
      }
    }
    sim.step();
    if (t % 600 === 599) hashes.push(stateHash(sim));
  }
  return hashes;
}

describe('Determinismus', () => {
  for (const extreme of [false, true]) {
    it(`gleicher Seed + gleiche Befehle → identische Zustände (extreme=${extreme})`, () => {
      const a = play(11, extreme, 6);
      const b = play(11, extreme, 6);
      expect(a).toEqual(b);
      expect(new Set(a).size).toBe(a.length); // der Zustand entwickelt sich tatsächlich
    }, 120000);
  }
  it('anderer Seed → anderer Zustand', () => {
    expect(play(12, false, 2)).not.toEqual(play(11, false, 2));
  }, 60000);
});
