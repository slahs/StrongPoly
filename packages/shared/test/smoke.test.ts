import { describe, expect, it } from 'vitest';
import { runSmoke } from '../bench/smoke';

describe('Smoke: Befehls-Fuzzing', () => {
  it('jeder Befehlstyp läuft gegen eine laufende Sim, Invarianten halten', () => {
    const r = runSmoke(2, 8, true);
    expect(r.violations).toEqual([]);
    for (const c of ['place', 'placeLine', 'demolish', 'move', 'attack', 'recruit', 'setTax', 'setRation', 'trade', 'setRecipe', 'dig', 'repair', 'ability', 'tunnel', 'sendAid']) {
      expect(r.commands[c] ?? 0).toBeGreaterThan(0);
    }
  }, 120000);
});
