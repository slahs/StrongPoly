import { describe, expect, it } from 'vitest';
import { isSecondaryClick, wheelPixels } from '../src/game/pointer';

describe('Zeigergeräte (Safari/macOS, Trackpad)', () => {
  it('Mausrad: Zeilen-/Seitenmodus wird in Pixel umgerechnet, riesige Schritte werden begrenzt', () => {
    expect(wheelPixels({ deltaY: 100, deltaMode: 0 })).toBe(100);
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelPixels({ deltaY: -3, deltaMode: 1 })).toBe(-48);
    expect(wheelPixels({ deltaY: 5000 })).toBe(240);
    expect(wheelPixels({ deltaY: -5000 })).toBe(-240);
  });
  it('Rechtsklick: Taste 2 immer, Strg+Klick nur auf dem Mac', () => {
    expect(isSecondaryClick({ button: 2, ctrlKey: false }, false)).toBe(true);
    expect(isSecondaryClick({ button: 0, ctrlKey: true }, false)).toBe(false);
    expect(isSecondaryClick({ button: 0, ctrlKey: true }, true)).toBe(true);
    expect(isSecondaryClick({ button: 0, ctrlKey: false }, true)).toBe(false);
  });
});
