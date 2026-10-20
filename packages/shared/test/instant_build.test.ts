import { describe, expect, it } from 'vitest';
import { BT, BUILDINGS, generateMap, Sim } from '../src';

/**
 * 4C/4H: Sofortbau. Die Bauanimation im Client ist rein visuell; in der Sim ist ein Gebäude unmittelbar nach dem Platzieren
 * voll funktionsfähig: kein Baufortschritt, keine Bauzeit, Arbeiter werden in der nächsten Zuteilungsrunde (alle 10 Ticks) bestimmt.
 * (Browser-Gegenprobe: scripts/qa/s02_economy.mjs.)
 */
function mkSim(seed = 5): Sim {
  const map = generateMap({ seed, size: 128, players: 2 });
  return new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'human' }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
}

function findSpot(sim: Sim, type: number): { x: number; y: number } | null {
  const st = sim.map.starts[0];
  for (let r = 4; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!sim.checkPlace(0, type, st.x + dx, st.y + dy, 0, true)) return { x: st.x + dx, y: st.y + dy };
      }
  return null;
}

describe('Sofortbau (Sim)', () => {
  for (const type of [BT.Stockpile, BT.Hovel, BT.Mill, BT.Bakery, BT.Market]) {
    it(`${BUILDINGS[type].name}: nach dem Platzieren sofort vollständig (volle Trefferpunkte, keine Bauphase) und im Gebäuderegister`, () => {
      const sim = mkSim();
      sim.players[0].gold = 5000;
      for (let r = 0; r < 5; r++) sim.addStock(0, r, 100);
      const s = findSpot(sim, type);
      expect(s).not.toBeNull();
      const b = sim.place(0, type, s!.x, s!.y, 0);
      expect(b).not.toBeNull();
      expect(sim.buildings.get(b!.id)).toBe(b);
      // volle Trefferpunkte vom ersten Tick an (kein „im Bau“-Zustand mit wachsenden HP)
      expect(b!.hp).toBe(b!.def.hp);
      expect(b!.born).toBeGreaterThanOrEqual(0);
    });
  }

  it('Betrieb mit Arbeitern: spätestens nach 2 s Spielzeit ist ein Arbeiter zugeteilt, nach einer Minute läuft die Produktion', () => {
    const sim = mkSim();
    sim.players[0].gold = 5000;
    for (let r = 0; r < 5; r++) sim.addStock(0, r, 100);
    const s = findSpot(sim, BT.Quarry) ?? findSpot(sim, BT.WheatFarm);
    const type = findSpot(sim, BT.Quarry) ? BT.Quarry : BT.WheatFarm;
    expect(s).not.toBeNull();
    const b = sim.place(0, type, s!.x, s!.y, 0)!;
    expect(b).not.toBeNull();
    for (let i = 0; i < 20; i++) sim.step(); // 2 s
    expect(b.workers.length).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) sim.step();
    expect(b.workers.length).toBeGreaterThan(0);
  });
});
