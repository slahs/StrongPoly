import { describe, expect, it } from 'vitest';
import {
  BT,
  POP_BAD_CAP,
  POP_GOOD_CAP,
  POP_INTERVAL,
  POP_STEPS_PER_MONTH,
  POP_THRESHOLD,
  POP_TEXT_DE,
  POP_TEXT_EN,
  R,
  TICKS_PER_MONTH,
  explainPopularity,
  playerView,
  popText,
  popularityFactors,
  popularityTarget,
  popularityTexts,
  spawnIntervalTicks,
} from '../src';
import type { PopExplain } from '../src';
import { autoPlace, mkSim, run } from './helpers';

type TestSim = ReturnType<typeof mkSim>;

/** Läuft bis kurz nach einer Beliebtheits-Auswertung (die Sim wertet bei `tick % POP_INTERVAL === 0` aus). */
function settle(sim: TestSim, intervals = 3): void {
  run(sim, POP_INTERVAL * intervals);
  while (sim.tick % POP_INTERVAL !== 1) sim.step();
}

const clamp = (x: number): number => Math.max(0, Math.min(100, x));

/** Belegt: Summe/Faktoren der Erklärung = Sim, und die nächste Auswertung ändert die Beliebtheit genau um Summe/6 */
function expectMatchesSim(sim: TestSim): PopExplain {
  const pl = sim.players[0];
  const view = playerView(sim, 0);
  const ex = explainPopularity(view);
  // Summe, Faktoren und Beliebtheit sind bitgleich die der Sim
  expect(ex.perMonth).toBe(pl.popTarget);
  expect(popularityTarget(pl.factors)).toBe(pl.popTarget);
  expect(ex.popularity).toBe(pl.popularity);
  expect(ex.factors.length).toBe(pl.factors.length);
  for (const f of pl.factors) {
    const g = ex.factors.find((x) => x.key === f.key);
    expect(g, f.key).toBeDefined();
    expect(g!.value).toBe(f.value);
    expect(g!.label).toBe(f.label);
  }
  expect(ex.sumPositive + ex.sumNegative).toBeCloseTo(ex.perMonth, 9);
  // Die nächste Auswertung ändert die Beliebtheit um genau (neue Summe)/6, begrenzt auf 0..100
  const before = pl.popularity;
  run(sim, POP_INTERVAL);
  expect(pl.popularity).toBe(clamp(before + pl.popTarget / POP_STEPS_PER_MONTH));
  return ex;
}

describe('Beliebtheits-Erklärung stimmt mit der Simulation überein', () => {
  it('Konstanten: ein Monat = 60 s, Auswertung alle 10 s, sechs je Monat', () => {
    const ex = explainPopularity(playerView(mkSim(5), 0));
    expect(ex.secondsPerMonth).toBe(TICKS_PER_MONTH / 10);
    expect(ex.stepSeconds).toBe(POP_INTERVAL / 10);
    expect(POP_STEPS_PER_MONTH).toBe(6);
  });

  it('vor der ersten Auswertung: keine erfundene Prognose', () => {
    const sim = mkSim(5);
    const ex = explainPopularity(playerView(sim, 0));
    expect(ex.pending).toBe(true);
    expect(ex.perMonth).toBe(0);
    expect(ex.direction).toBe('flat');
    expect(ex.headline.key).toBe('pop.head.pending');
  });

  it('hohe Steuern: Steuern sind die Hauptursache, Prognose fällt, Text nennt die Steuern', () => {
    const sim = mkSim(5);
    sim.players[0].tax = 4;
    settle(sim);
    const view = playerView(sim, 0);
    const ex = explainPopularity(view);
    expect(ex.mainNegative?.key).toBe('tax');
    expect(ex.mainNegative?.value).toBe(-8);
    expect(ex.direction).toBe('down');
    expect(ex.headline.key).toBe('pop.head.neg.tax.high');
    expect(popText(ex.headline.key, ex.headline.params, 'de')).toBe('Eure hohen Steuern belasten die Stimmung im Volk.');
    expect(ex.advice.find((a) => a.code === 'tax')?.gain).toBe(2);
    expect(ex.advice[0].code).toBe('tax'); // Stellschraube der Hauptbelastung zuerst
    // Prognose in einem Monat entspricht der Sim (die Faktoren bleiben in diesem Szenario gleich)
    const pop0 = sim.players[0].popularity;
    expect(ex.forecast1).toBeCloseTo(clamp(pop0 + ex.perMonth), 9);
    run(sim, POP_INTERVAL * POP_STEPS_PER_MONTH);
    expect(sim.players[0].popularity).toBeCloseTo(ex.forecast1, 6);
    expectMatchesSim(sim);
  });

  it('Hunger: Warnung, Hungertext, Rationsfaktor als Hauptursache', () => {
    const sim = mkSim(5);
    for (const r of [R.Apple, R.Bread, R.Cheese, R.Meat]) sim.takeStock(0, r, 9999);
    settle(sim);
    const ex = expectMatchesSim(sim);
    expect(ex.warnings.some((w) => w.code === 'hunger' && w.severity === 'critical')).toBe(true);
    expect(ex.headline.key).toBe('pop.head.hunger');
    expect(ex.mainNegative?.key).toBe('ration');
    expect(ex.advice.some((a) => a.code === 'food')).toBe(true);
  });

  it('Rationen und Vielfalt (extra Rationen, vier Sorten): positive Faktoren mit korrekten Werten', () => {
    const sim = mkSim(5);
    for (const r of [R.Apple, R.Cheese, R.Meat, R.Bread]) sim.addStock(0, r, 200);
    sim.players[0].ration = 3;
    settle(sim);
    const ex = expectMatchesSim(sim);
    expect(ex.factors.find((f) => f.key === 'ration')?.value).toBe(4);
    expect(ex.factors.find((f) => f.key === 'variety')?.value).toBeCloseTo(4.5, 9);
    expect(ex.positives.map((f) => f.key)).toEqual(expect.arrayContaining(['ration', 'variety']));
    expect(ex.direction).toBe('up');
  });

  it('Bier und Kirche: positive Faktoren, Obergrenzen gekennzeichnet', () => {
    const sim = mkSim(5);
    sim.addStock(0, R.Ale, 200);
    autoPlace(sim, 0, BT.Inn);
    autoPlace(sim, 0, BT.Church);
    run(sim, 800);
    settle(sim);
    const ex = expectMatchesSim(sim);
    expect(ex.factors.find((f) => f.key === 'ale')!.value).toBeGreaterThan(0);
    expect(ex.factors.find((f) => f.key === 'religion')!.value).toBeGreaterThan(0);
    expect(ex.mainPositive).not.toBeNull();
    expect(ex.positives.length).toBeGreaterThan(0);
  });

  it('gute Dinge erreichen die Obergrenze: weitere bringen nichts', () => {
    const sim = mkSim(5);
    for (let i = 0; i < 6; i++) autoPlace(sim, 0, BT.Statue);
    settle(sim);
    const ex = expectMatchesSim(sim);
    const good = ex.factors.find((f) => f.key === 'good')!;
    expect(good.value).toBe(POP_GOOD_CAP);
    expect(good.cap).toBe(POP_GOOD_CAP);
    expect(good.atCap).toBe(true);
    expect(ex.advice.some((a) => a.code === 'good')).toBe(false);
  });

  it('schlechte Dinge: Deckel erreicht, Abriss als Stellschraube', () => {
    const sim = mkSim(5);
    for (let i = 0; i < 10; i++) autoPlace(sim, 0, BT.Dungeon);
    settle(sim);
    const ex = expectMatchesSim(sim);
    const bad = ex.factors.find((f) => f.key === 'bad')!;
    expect(bad.value).toBe(-POP_BAD_CAP);
    expect(bad.atCap).toBe(true);
    expect(ex.advice.find((a) => a.code === 'bad')?.gain).toBe(POP_BAD_CAP);
    expect(ex.headline.key).toMatch(/^pop\.head\.neg\./);
  });

  it('Überfüllung: Faktor, Warnung und Hütten als Stellschraube', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    for (let i = 0; i < 40; i++) sim.spawnPeasant(0);
    settle(sim);
    expect(pl.peasants).toBeGreaterThan(pl.housing);
    const ex = expectMatchesSim(sim);
    expect(ex.factors.find((f) => f.key === 'crowd')!.value).toBeLessThan(0);
    expect(ex.warnings.some((w) => w.code === 'crowded')).toBe(true);
    expect(ex.advice.some((a) => a.code === 'housing')).toBe(true);
  });

  it('Bestechung ohne Gold wirkt nicht und wird als Warnung gemeldet', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    pl.tax = -3;
    pl.gold = 0;
    settle(sim);
    const ex = explainPopularity(playerView(sim, 0));
    const tax = ex.factors.find((f) => f.key === 'tax')!;
    expect(tax.value).toBe(0);
    expect(tax.blocked).toBe(true);
    // Konstanten statt Zahlen: Bestechung kostet Gold, die Kosten in der Stellschraube sind positiv
    sim.players[0].gold = 3000;
    sim.players[0].tax = 0;
    run(sim, POP_INTERVAL * 3);
    const v2 = playerView(sim, 0);
    const e2 = explainPopularity({ ...v2, popularity: 40 });
    const bribe = e2.advice.find((a) => a.code === 'bribe');
    expect(bribe).toBeDefined();
    expect(Number(bribe!.params.gold)).toBeGreaterThan(0);
    expect(ex.warnings.some((w) => w.code === 'bribeBlocked')).toBe(true);
  });

  it('Abwanderung unter 50: Warnung, Rate stimmt mit der Sim überein', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    run(sim, 300);
    pl.popularity = 30;
    pl.tax = 5;
    settle(sim);
    const ex = explainPopularity(playerView(sim, 0));
    expect(ex.belowThreshold).toBe(true);
    expect(ex.leaving.active).toBe(true);
    expect(ex.warnings.some((w) => w.code === 'leaving')).toBe(true);
    // Rate: ein Bauer alle LEAVE_INTERVAL_TICKS Ticks
    const n0 = pl.peasants;
    run(sim, ex.leaving.secondsPerPeasant * 10 * 3);
    expect(n0 - pl.peasants).toBe(3);
  });

  it('Warnung vor der Schwelle nennt die Zeit bis zum Unterschreiten', () => {
    const sim = mkSim(5);
    const pl = sim.players[0];
    pl.tax = 5;
    pl.popularity = 58;
    settle(sim, 1);
    const ex = explainPopularity(playerView(sim, 0));
    expect(ex.direction).toBe('down');
    expect(ex.secondsToThreshold).not.toBeNull();
    // die Sim unterschreitet die Schwelle tatsächlich in dieser Zeit (Faktoren bleiben gleich)
    const steps = ex.secondsToThreshold! / ex.stepSeconds;
    run(sim, POP_INTERVAL * (steps - 1));
    expect(pl.popularity).toBeGreaterThanOrEqual(POP_THRESHOLD);
    run(sim, POP_INTERVAL);
    expect(pl.popularity).toBeLessThan(POP_THRESHOLD);
  });

  it('Wachstumsrate entspricht dem Spawn-Intervall der Sim', () => {
    expect(spawnIntervalTicks(50)).toBe(25);
    expect(spawnIntervalTicks(110)).toBe(10);
    expect(spawnIntervalTicks(200)).toBe(10);
    const sim = mkSim(5);
    settle(sim);
    const ex = explainPopularity(playerView(sim, 0));
    expect(ex.growth.secondsPerPeasant).toBe(spawnIntervalTicks(ex.popularity) / 10);
  });

  it('Faktoren-Zerlegung ist eine einzige Funktion: gleiche Eingabe, gleiche Faktoren', () => {
    const f = popularityFactors({ ration: 2, foodShort: false, foodTypes: 3, tax: 2, taxBlocked: false, aleCover: 0.5, religionPts: 20, religionCover: 0.5, good: 20, bad: 40, crowded: true, events: [{ label: 'Fest', value: 3 }] });
    expect(f.map((x) => x.key)).toEqual(['ration', 'variety', 'tax', 'ale', 'religion', 'good', 'bad', 'crowd', 'events']);
    expect(f.find((x) => x.key === 'religion')!.value).toBe(6); // min(12, 20) * 0.5
    expect(f.find((x) => x.key === 'good')!.value).toBe(POP_GOOD_CAP);
    expect(f.find((x) => x.key === 'bad')!.value).toBe(-POP_BAD_CAP);
    const ex = explainPopularity({ popularity: 60, popDelta: popularityTarget(f), factors: f, tax: 2, ration: 2, peasants: 10, housing: 5, foodShort: false, foodTypes: 3, aleCover: 0.5, relCover: 0.5 });
    expect(ex.perMonth).toBe(popularityTarget(f));
    expect(ex.factors.find((x) => x.key === 'religion')!.atCap).toBe(true);
    expect(ex.factors.find((x) => x.key === 'events')!.label).toBe('Fest');
  });
});

describe('Beliebtheits-Texte', () => {
  it('jeder Faktor-/Warn-/Hinweis-Schlüssel hat deutschen Text, Englisch nur zusätzlich', () => {
    for (const k of Object.keys(POP_TEXT_EN)) expect(POP_TEXT_DE[k], `en-Schlüssel ohne de: ${k}`).toBeDefined();
    for (const k of ['ration', 'variety', 'tax', 'ale', 'religion', 'good', 'bad', 'crowd', 'events']) expect(POP_TEXT_DE[`pop.factor.${k}`]).toBeDefined();
    for (const c of ['hunger', 'leaving', 'nearThreshold', 'critical', 'bribeBlocked', 'crowded', 'housingFull', 'floor']) expect(POP_TEXT_DE[`pop.warn.${c}`], c).toBeDefined();
    for (const c of ['tax', 'bribe', 'ration', 'food', 'variety', 'ale', 'religion', 'good', 'bad', 'housing']) expect(POP_TEXT_DE[`pop.advice.${c}`], c).toBeDefined();
  });

  it('jede mögliche Hauptursache liefert einen vorhandenen Hinweistext ohne offene Platzhalter', () => {
    const keys = ['ration', 'variety', 'tax', 'ale', 'religion', 'good', 'bad', 'crowd', 'events'];
    for (const neg of keys) {
      for (const sign of [-1, 1]) {
        const factors = keys.map((k) => ({ key: k, label: k === 'events' ? 'Fest' : k, value: k === neg ? sign * 5 : 0 }));
        for (const tax of [1, 3, -2]) {
          const ex = explainPopularity({ popularity: 60, popDelta: sign * 5, factors, tax, ration: 2, peasants: 10, housing: 20, foodShort: false, foodTypes: 2, aleCover: 0, relCover: 0 });
          for (const lang of ['de', 'en'] as const) {
            const tx = popularityTexts(ex, lang);
            expect(tx.headline, `${neg}/${sign}/${lang}`).not.toMatch(/\{|pop\.head/);
            for (const a of tx.advice) expect(a.text).not.toMatch(/\{|pop\.advice/);
            for (const w of tx.warnings) expect(w.text).not.toMatch(/\{|pop\.warn/);
          }
        }
      }
    }
  });

  it('Text passt zur Richtung: negative Hauptursache nur bei fallender Beliebtheit, positive bei steigender', () => {
    const fx = (tax: number, ration: number): PopExplain => explainPopularity({ popularity: 60, popDelta: tax + ration, factors: [{ key: 'ration', label: 'R', value: ration }, { key: 'tax', label: 'S', value: tax }], tax: 4, ration: 2, peasants: 5, housing: 20, foodShort: false, foodTypes: 1, aleCover: 0, relCover: 0 });
    expect(fx(-8, 4).headline.key).toBe('pop.head.neg.tax.high');
    expect(fx(-2, 4).headline.key).toBe('pop.head.pos.ration');
    expect(fx(-4, 4).headline.key).toBe('pop.head.balanced');
  });
});
