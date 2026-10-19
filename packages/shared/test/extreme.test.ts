import { describe, expect, it } from 'vitest';
import { ABILITIES, EXTREME, Stance, U } from '../src';
import { mkSim, run } from './helpers';

describe('Extreme-Modus', () => {
  it('Machtleiste füllt sich, Fähigkeiten kosten Macht und haben Abklingzeit', () => {
    const sim = mkSim(5, 2, 128, { extreme: true });
    const pl = sim.players[0];
    const p0 = pl.power;
    run(sim, 300);
    expect(pl.power).toBeGreaterThan(p0);
    pl.power = 100;
    const gold = pl.gold;
    sim.step([{ p: 0, cmd: { c: 'ability', id: 4, x: 0, y: 0 } }]);
    expect(pl.gold).toBe(gold + EXTREME.goldDonation);
    expect(pl.power).toBeCloseTo(100 - ABILITIES[4].cost, 0);
    // erneut: Abklingzeit
    sim.step([{ p: 0, cmd: { c: 'ability', id: 4, x: 0, y: 0 } }]);
    expect(pl.gold).toBe(gold + EXTREME.goldDonation);
  });

  it('Verstärkung spawnt Truppen, Heilung heilt, Felsschlag tötet', () => {
    const sim = mkSim(5, 2, 128, { extreme: true });
    const pl = sim.players[0];
    pl.power = 100;
    const n0 = sim.units.count;
    sim.step([{ p: 0, cmd: { c: 'ability', id: 1, x: 0, y: 0 } }]);
    expect(sim.units.count).toBeGreaterThan(n0 + 6);
    // Felsschlag auf gegnerische Gruppe
    const m = sim.map;
    const cx = m.w >> 1;
    const cy = m.h >> 1;
    const victims: number[] = [];
    for (let i = 0; i < 6; i++) {
      const s = sim.spawnUnit(U.Spearman, 1, cx + (i % 3) * 0.6, cy + Math.floor(i / 3) * 0.6);
      sim.units.stance[s] = Stance.Hold;
      victims.push(sim.units.id(s));
    }
    pl.power = 100;
    sim.step([{ p: 0, cmd: { c: 'ability', id: 3, x: cx + 0.6, y: cy + 0.3 } }]);
    run(sim, 40);
    expect(victims.filter((id) => sim.units.valid(id)).length).toBeLessThan(3);
    // Heilung
    const hurt = sim.units.slot(sim.players[0].lordId);
    sim.units.hp[hurt] = 100;
    pl.power = 100;
    sim.step([{ p: 0, cmd: { c: 'ability', id: 2, x: sim.units.x[hurt], y: sim.units.y[hurt] } }]);
    expect(sim.units.hp[hurt]).toBeGreaterThan(300);
  });

  it('Fahnenstangen erscheinen und werden erobert', () => {
    const sim = mkSim(5, 2, 128, { extreme: true });
    run(sim, EXTREME.bannerEvery * 10 + 20);
    const ex = sim.extreme!;
    expect(ex.banners.length).toBeGreaterThan(0);
    const b = ex.banners[0];
    for (let i = 0; i < 4; i++) {
      const s = sim.spawnUnit(U.Swordsman, 0, b.x + i * 0.3, b.y);
      sim.units.stance[s] = Stance.Hold;
    }
    run(sim, 200);
    expect(b.owner).toBe(0);
    const p0 = sim.players[0].power;
    run(sim, 100);
    expect(sim.players[0].power).toBeGreaterThan(p0);
  });
});
