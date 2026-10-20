import { U, UNITS } from '@strongpoly/shared';
import { describe, expect, it } from 'vitest';
import { stridePerTile } from '../src/render/motion';
import { UNIT_SCALE, UNIT_WALK_W } from '../src/render/models_units';
import { HIP } from '../src/render/unit_items';

/**
 * 4H: Schrittlänge gegen Weg. Die Gehphase wird an die gezeichnete Geschwindigkeit gekoppelt (Phasenradiant je Tile =
 * UNIT_WALK_W / Sollgeschwindigkeit); der Figuren-Shader schwingt die Beine um ±0,66 rad um die Hüfte (Beinlänge ≈ HIP − Knöchel).
 * Beim Gehen auf der Stelle des Fußes (Standphase) bewegt sich der Fuß gegenüber dem Körper um 2·L·sin(0,66) Modelleinheiten;
 * der Körper legt in derselben Zeit (halbe Phase) π·v/W Tiles zurück. Verhältnis ≈ 1 = kein Gleiten; > 1,4 = Schlittern.
 */
const SWING = 0.66;
const LEG = HIP - 0.05;

function slipRatio(type: number): number {
  const d = UNITS[type];
  const stepTiles = (Math.PI * 1) / stridePerTile(UNIT_WALK_W[type], d.speed); // Weg je halbem Zyklus bei Sollgeschwindigkeit
  const footTravel = 2 * LEG * Math.sin(SWING) * (UNIT_SCALE[type] || 1);
  return stepTiles / footTravel;
}

describe('Gehphase und Schrittlänge (Füße gleiten nicht)', () => {
  const walkers = UNITS.filter((d) => d.side !== 'siege' && !d.mounted && d.id !== U.Ox && d.id !== U.Lord);
  it('Fußvolk: Körperweg je Schritt und Fußweg passen zusammen (Median ≤ 1,2; alle zwischen 0,8 und 1,45)', () => {
    const rs = walkers.map((d) => slipRatio(d.id));
    const table = walkers.map((d) => `${d.key}: ${slipRatio(d.id).toFixed(2)}`).join(', ');
    const sorted = [...rs].sort((a, b) => a - b);
    expect(sorted[sorted.length >> 1], table).toBeLessThanOrEqual(1.2);
    for (const r of rs) {
      expect(r, table).toBeGreaterThan(0.8);
      expect(r, table).toBeLessThan(1.45);
    }
  });
});
