import { describe, expect, it } from 'vitest';
import { BT, R, STORE_MODULE_CAP } from '../src';
import { autoPlace, mkSim, run } from './helpers';

describe('Wirtschaftsketten', () => {
  it('Nahrung, Weizen→Mehl→Brot, Hopfen→Bier, Stein/Eisen/Pech, Waffen', () => {
    const sim = mkSim(5);
    const p = 0;
    const pl = sim.players[p];
    for (let i = 0; i < 3; i++) expect(autoPlace(sim, p, BT.Hovel)).not.toBeNull();
    for (const t of [BT.Stockpile, BT.Stockpile, BT.Armory, BT.Granary]) expect(autoPlace(sim, p, t), `Bau ${t}`).not.toBeNull();
    const chain = [
      BT.AppleOrchard, BT.WheatFarm, BT.Mill, BT.Bakery, BT.HopFarm, BT.Brewery, BT.Quarry, BT.OxTether, BT.IronMine,
      BT.PitchRig, BT.Woodcutter, BT.Woodcutter, BT.DairyFarm, BT.Fletcher, BT.Blacksmith, BT.Tanner, BT.Armorer,
    ];
    for (const t of chain) expect(autoPlace(sim, p, t), `Bau von ${t}`).not.toBeNull();
    sim.addStock(p, R.Cheese, 200); // Vorrat, damit niemand verhungert
    sim.addStock(p, R.Meat, 200);
    run(sim, 9000);
    const prod = pl.produced;
    expect(pl.cap.stock).toBeGreaterThanOrEqual(3 * STORE_MODULE_CAP);
    for (const r of [R.Apple, R.Wheat, R.Flour, R.Bread, R.Hops, R.Ale, R.Stone, R.Iron, R.Pitch, R.Wood, R.Cheese, R.Cow, R.Bow, R.Mace, R.Leather, R.Armor]) {
      expect(prod[r], `Produktion von Ware ${r}`).toBeGreaterThan(0);
    }
  });
});
