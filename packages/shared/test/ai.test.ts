import { describe, expect, it } from 'vitest';
import { AI_PROFILES, generateMap, Sim, U } from '../src';

function duel(a: number, b: number, seed: number, ticks: number): Sim {
  const map = generateMap({ seed, size: 128, players: 2 });
  const sim = new Sim({
    map,
    seed,
    players: [
      { name: AI_PROFILES[a].name, team: 0, kind: 'ai', ai: a },
      { name: AI_PROFILES[b].name, team: 1, kind: 'ai', ai: b },
    ],
    startGold: 1500,
    troopLimit: 1000,
    fog: false,
    extreme: false,
  });
  for (let i = 0; i < ticks; i++) sim.step();
  return sim;
}

describe('KI-Lords', () => {
  it('gibt es mindestens 8 Persönlichkeiten mit vollständigem Datenprofil', () => {
    expect(AI_PROFILES.length).toBeGreaterThanOrEqual(8);
    for (const p of AI_PROFILES) {
      expect(p.castle.ring).toBeGreaterThanOrEqual(8);
      expect(p.army.units.length).toBeGreaterThan(0);
      expect(p.army.firstAttack).toBeGreaterThan(0);
      expect(p.econ.peasants).toBeGreaterThan(10);
    }
  });

  for (let i = 0; i < AI_PROFILES.length; i++) {
    it(`Profil ${i} (${AI_PROFILES[i].name}) baut Wirtschaft auf und rekrutiert`, () => {
      const sim = duel(i, (i + 3) % AI_PROFILES.length, 10 + i, 6000);
      const p = sim.players[0];
      let blds = 0;
      for (const b of sim.buildings.values()) if (b.owner === 0) blds++;
      let army = 0;
      for (let s = 0; s < sim.units.top; s++) if (sim.units.alive[s] && sim.units.owner[s] === 0 && sim.units.type[s] >= U.Archer && sim.units.type[s] !== U.Lord) army++;
      expect(p.peasants).toBeGreaterThan(20);
      expect(blds).toBeGreaterThan(20);
      expect(p.stats.built).toBeGreaterThan(15);
      expect(army + p.stats.losses).toBeGreaterThan(0);
    }, 60000);
  }

  it('Rechenzeit der KI bleibt im Budget (< 2 ms/Tick Mittel)', () => {
    const sim = duel(7, 1, 3, 4000);
    expect(sim.prof.ai / sim.tick).toBeLessThan(2);
  }, 60000);
});
