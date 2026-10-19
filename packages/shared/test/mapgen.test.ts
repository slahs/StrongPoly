import { describe, expect, it } from 'vitest';
import { generateMap, mapFromJson, mapToJson, T } from '../src';

describe('mapgen', () => {
  it('ist deterministisch', () => {
    const a = generateMap({ seed: 42, size: 128, players: 4 });
    const b = generateMap({ seed: 42, size: 128, players: 4 });
    expect(Buffer.from(a.terrain).equals(Buffer.from(b.terrain))).toBe(true);
    expect(Buffer.from(a.height).equals(Buffer.from(b.height))).toBe(true);
  });
  it('erzeugt Startpositionen auf begehbarem Terrain', () => {
    for (const n of [2, 3, 4, 8]) {
      const m = generateMap({ seed: 7, size: 200, players: n });
      expect(m.starts.length).toBe(n);
      for (const s of m.starts) expect(m.walkableTerrain(m.idx(s.x, s.y))).toBe(true);
    }
  });
  it('Nachbar-Höhen unterscheiden sich max. um 1 (außer Wasser)', () => {
    const m = generateMap({ seed: 3, size: 100, players: 2 });
    let bad = 0;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w - 1; x++) {
        const a = m.idx(x, y);
        const b = a + 1;
        if (m.terrain[a] === T.Water || m.terrain[b] === T.Water) continue;
        if (Math.abs(m.height[a] - m.height[b]) > 1) bad++;
      }
    expect(bad).toBe(0);
  });
  it('JSON round-trip', () => {
    const m = generateMap({ seed: 9, size: 96, players: 3 });
    const j = mapFromJson(JSON.parse(JSON.stringify(mapToJson(m))));
    expect(Buffer.from(j.terrain).equals(Buffer.from(m.terrain))).toBe(true);
    expect(j.starts).toEqual(m.starts);
  });
});
