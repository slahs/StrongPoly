import { describe, expect, it } from 'vitest';
import { BT, R, POP_INTERVAL, SELL_RATIO, RES_INFO } from '../src';
import { autoPlace, mkSim, run } from './helpers';

const factor = (sim: ReturnType<typeof mkSim>, key: string) => sim.players[0].factors.find((f) => f.key === key)?.value ?? 0;

describe('Beliebtheit', () => {
  it('Hunger senkt, Extra-Rationen und Vielfalt heben die Beliebtheit', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    // leeres Lager: Hunger
    for (const r of [R.Apple, R.Bread, R.Cheese, R.Meat]) sim.takeStock(0, r, 9999);
    run(sim, POP_INTERVAL * 2);
    expect(factor(sim, 'ration')).toBeLessThan(0);
    expect(pl.foodShort).toBe(true);
    // Vorrat + extra Rationen + Vielfalt
    for (const r of [R.Apple, R.Cheese, R.Meat, R.Bread]) sim.addStock(0, r, 60);
    pl.ration = 3;
    run(sim, POP_INTERVAL * 2);
    expect(factor(sim, 'ration')).toBe(4);
    expect(factor(sim, 'variety')).toBeCloseTo(4.5, 5);
  });

  it('Steuern bringen Gold und kosten Beliebtheit, Bestechung umgekehrt', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    pl.tax = 3;
    const g0 = pl.gold;
    run(sim, POP_INTERVAL * 6);
    expect(pl.gold).toBeGreaterThan(g0);
    expect(factor(sim, 'tax')).toBeLessThan(0);
    pl.tax = -2;
    run(sim, POP_INTERVAL * 2);
    expect(factor(sim, 'tax')).toBeGreaterThan(0);
  });

  it('Wirtshaus mit Bier und Kirche mit Priester steigern die Beliebtheit', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    sim.addStock(0, R.Ale, 100);
    autoPlace(sim, 0, BT.Inn);
    autoPlace(sim, 0, BT.Church);
    run(sim, 800);
    run(sim, POP_INTERVAL * 2);
    expect(factor(sim, 'ale')).toBeGreaterThan(0);
    expect(factor(sim, 'religion')).toBeGreaterThan(0);
    expect(pl.stock[R.Ale]).toBeLessThan(100);
  });

  it('Angstfaktor: schlechte Dinge erhöhen die Produktivität, gute senken sie', () => {
    const sim = mkSim(5);
    for (let i = 0; i < 3; i++) autoPlace(sim, 0, BT.Gallows);
    run(sim, POP_INTERVAL);
    expect(sim.players[0].fear).toBe(3);
    expect(factor(sim, 'bad')).toBeLessThan(0);
    const sim2 = mkSim(5);
    autoPlace(sim2, 0, BT.Statue);
    run(sim2, POP_INTERVAL);
    expect(sim2.players[0].fear).toBe(-2);
  });

  it('unter 50 verlassen Bauern die Burg', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    run(sim, 300);
    const n0 = pl.peasants;
    pl.popularity = 20;
    pl.tax = 5;
    run(sim, 500);
    expect(pl.peasants).toBeLessThan(n0);
  });
});

describe('Markt', () => {
  it('Kauf und Verkauf mit dynamischen Preisen', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    expect(autoPlace(sim, 0, BT.Market)).not.toBeNull();
    const gold = pl.gold;
    const wood = pl.stock[R.Wood];
    sim.step([{ p: 0, cmd: { c: 'trade', res: R.Iron, amount: 10, buy: true } }]);
    expect(pl.stock[R.Iron]).toBe(10);
    expect(pl.gold).toBeLessThan(gold);
    expect(pl.priceMul[R.Iron]).toBeGreaterThan(1);
    const g2 = pl.gold;
    sim.step([{ p: 0, cmd: { c: 'trade', res: R.Wood, amount: 20, buy: false } }]);
    expect(pl.stock[R.Wood]).toBe(wood - 20);
    expect(pl.gold - g2).toBe(Math.floor(RES_INFO[R.Wood].price * SELL_RATIO * 20));
    expect(pl.priceMul[R.Wood]).toBeLessThan(1);
  });
  it('ohne Markt kein Handel', () => {
    const sim = mkSim(5);
    sim.step([{ p: 0, cmd: { c: 'trade', res: R.Iron, amount: 10, buy: true } }]);
    expect(sim.players[0].stock[R.Iron]).toBe(0);
  });
});
