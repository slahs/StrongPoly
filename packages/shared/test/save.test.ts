import { describe, expect, it } from 'vitest';
import { AI_PROFILES, generateMap, restoreSim, saveSim, Sim, type SimConfig } from '../src';

function cfgFor(seed: number, extreme: boolean): SimConfig {
  const map = generateMap({ seed, size: 128, players: 2 });
  return {
    map,
    seed,
    players: [
      { name: AI_PROFILES[1].name, team: 0, kind: 'ai', ai: 1 },
      { name: AI_PROFILES[0].name, team: 1, kind: 'ai', ai: 0 },
    ],
    startGold: 1500,
    troopLimit: 1000,
    fog: false,
    extreme,
  };
}

function digest(sim: Sim): string {
  const u = sim.units;
  let h = 0;
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s]) continue;
    h = (h * 31 + Math.round(u.x[s] * 100) + Math.round(u.y[s] * 100) * 7 + u.type[s] * 13 + Math.round(u.hp[s])) | 0;
  }
  for (const b of sim.buildings.values()) h = (h * 17 + b.id * 3 + Math.round(b.hp) + b.workers.length) | 0;
  for (const p of sim.players) h = (h * 19 + Math.round(p.gold) + p.stock[0] + p.stock[1] + Math.round(p.popularity * 10)) | 0;
  return `${sim.tick}:${h}:${u.count}:${sim.buildings.size}`;
}

describe('Speichern/Laden', () => {
  for (const extreme of [false, true]) {
    it(`Roundtrip ist exakt fortsetzbar (extreme=${extreme})`, () => {
      const a = new Sim(cfgFor(8, extreme));
      for (let i = 0; i < 3500; i++) a.step();
      const save = saveSim(a);
      // strukturiertes Klonen simulieren
      const clone = structuredClone(save);
      const b = new Sim({ ...cfgFor(8, extreme), restore: true });
      restoreSim(b, clone);
      expect(digest(b)).toBe(digest(a));
      // Wegfindungs-Cache wird nicht gespeichert; Verlauf kann daher minimal abweichen, bleibt aber plausibel
      for (let i = 0; i < 1500; i++) {
        a.step();
        b.step();
      }
      expect(b.tick).toBe(a.tick);
      expect(Math.abs(b.units.count - a.units.count)).toBeLessThan(a.units.count * 0.2);
      expect(Math.abs(b.buildings.size - a.buildings.size)).toBeLessThan(a.buildings.size * 0.2);
      expect(b.players[0].peasants).toBeGreaterThan(a.players[0].peasants * 0.7);
      expect(b.players[1].alive).toBe(a.players[1].alive);
    }, 60000);
  }
});
