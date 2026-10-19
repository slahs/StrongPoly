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
  it('Ressourcen sind von jedem Start aus erreichbar', () => {
    for (const [seed, n] of [[5, 2], [7, 4], [11, 8], [3, 3]] as [number, number][]) {
      const m = generateMap({ seed, size: n > 4 ? 200 : 128, players: n });
      for (const st of m.starts) {
        const seen = new Uint8Array(m.n);
        const q = [m.idx(st.x, st.y)];
        seen[q[0]] = 1;
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi];
          const x = i % m.w;
          const y = (i / m.w) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (!m.inBounds(nx, ny)) continue;
            const j = m.idx(nx, ny);
            if (seen[j] || !m.walkable(j) && m.terrain[j] !== T.StoneDeposit) continue;
            if (!m.walkableTerrain(j) || Math.abs(m.height[j] - m.height[i]) > 1) continue;
            seen[j] = 1;
            q.push(j);
          }
        }
        let stone = 0, iron = 0, pitch = 0;
        for (let i = 0; i < m.n; i++) {
          if (!seen[i]) continue;
          const dist = Math.hypot((i % m.w) - st.x, ((i / m.w) | 0) - st.y);
          if (dist > 32) continue;
          if (m.terrain[i] === T.StoneDeposit) stone++;
          if (m.terrain[i] === T.IronDeposit) iron++;
          if (m.terrain[i] === T.PitchSpring) pitch++;
        }
        expect(stone, `Stein seed ${seed}`).toBeGreaterThanOrEqual(8);
        expect(iron, `Eisen seed ${seed}`).toBeGreaterThanOrEqual(4);
        expect(pitch, `Pech seed ${seed}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('JSON round-trip', () => {
    const m = generateMap({ seed: 9, size: 96, players: 3 });
    const j = mapFromJson(JSON.parse(JSON.stringify(mapToJson(m))));
    expect(Buffer.from(j.terrain).equals(Buffer.from(m.terrain))).toBe(true);
    expect(j.starts).toEqual(m.starts);
  });
});
