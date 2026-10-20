import { describe, expect, it } from 'vitest';
import { comboOf, DEFAULT_HOTKEYS, hotkeyConflicts, HotkeyAction, tracksHeldKey } from '../src/game/hotkeys';

/** 4H-Befund: Kombinationen mit Alt/Strg/Cmd dürfen nicht zugleich die Kamera bewegen und müssen sauber unterscheidbar sein. */
describe('Hotkeys', () => {
  it('Standardbelegung ohne Doppelbelegung (Alt+H Berater ≠ H Halten)', () => {
    expect([...hotkeyConflicts(DEFAULT_HOTKEYS)]).toEqual([]);
    expect(DEFAULT_HOTKEYS.hold).toBe('KeyH');
    expect(DEFAULT_HOTKEYS.advisorReplay).toBe('Alt+KeyH');
    expect(comboOf({ code: 'KeyH', ctrlKey: false, metaKey: false, altKey: true })).toBe(DEFAULT_HOTKEYS.advisorReplay);
    expect(comboOf({ code: 'KeyH', ctrlKey: false, metaKey: false, altKey: false })).toBe(DEFAULT_HOTKEYS.hold);
  });

  it('Alt+Buchstabe/Strg+Buchstabe/Cmd+Buchstabe zählt nicht als gehaltene Schwenktaste (Alt+S, Alt+W, Cmd+S …)', () => {
    const none = { ctrlKey: false, metaKey: false, altKey: false };
    expect(tracksHeldKey(none)).toBe(true);
    expect(tracksHeldKey({ ...none, altKey: true })).toBe(false);
    expect(tracksHeldKey({ ...none, ctrlKey: true })).toBe(false);
    expect(tracksHeldKey({ ...none, metaKey: true })).toBe(false);
    // genau diese zwei Alt-Belegungen teilen die Taste mit dem Schwenken und hätten vorher die Kamera mitbewegt
    const alt = (Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]).filter((a) => DEFAULT_HOTKEYS[a].startsWith('Alt+')).map((a) => DEFAULT_HOTKEYS[a].replace('Alt+', ''));
    const pan = [DEFAULT_HOTKEYS.panUp, DEFAULT_HOTKEYS.panDown, DEFAULT_HOTKEYS.panLeft, DEFAULT_HOTKEYS.panRight];
    expect(alt.filter((k) => pan.includes(k)).sort()).toEqual(['KeyS', 'KeyW']);
  });
});
