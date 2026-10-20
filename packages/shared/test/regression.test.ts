import { describe, expect, it } from 'vitest';
import { AI_PROFILES, BT, BUILDINGS, generateMap, R, Sim, T, TREE_WOOD, U } from '../src';
import { autoPlace } from './helpers';

describe('Regression: Burgbau der KI', () => {
  it('Startbereiche sind baumfrei (Mauerring, Gräben und Tore passen hinein)', () => {
    for (const seed of [1, 7, 33]) {
      const m = generateMap({ seed, size: 160, players: 4 });
      for (const s of m.starts) {
        for (let y = s.y - 14; y <= s.y + 14; y++)
          for (let x = s.x - 14; x <= s.x + 14; x++) if (m.inBounds(x, y)) expect(m.trees[m.idx(x, y)] === TREE_WOOD).toBe(false);
      }
    }
    void T;
  });

  for (const ai of [5, 3, 0]) {
    it(`Profil ${ai} (${AI_PROFILES[ai].name}) baut sein Torhaus (früher: Bäume ließen den Plan das Tor überspringen)`, () => {
      const seed = 7;
      const map = generateMap({ seed, size: 160, players: 2 });
      const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai }, { name: 'B', team: 1, kind: 'human' }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
      for (let i = 0; i < 15000; i++) sim.step();
      let gates = 0;
      for (const b of sim.buildings.values()) if (b.owner === 0 && b.def.gate) gates++;
      expect(gates).toBeGreaterThanOrEqual(1);
    });
  }
});

describe('Regression: Vorkommen', () => {
  it('Stein- und Eisenvorkommen werden nicht mit anderen Gebäuden überbaut (KI fand sonst keine Eisenmine)', () => {
    const map = generateMap({ seed: 7, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 7, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'human' }], startGold: 5000, troopLimit: 1000, fog: false, extreme: false });
    sim.players[0].stock[0] = 500;
    let iron = -1;
    for (let i = 0; i < map.n; i++) if (map.terrain[i] === T.IronDeposit && map.trees[i] === 0) { iron = i; break; }
    expect(iron).toBeGreaterThanOrEqual(0);
    const x = iron % map.w;
    const y = Math.floor(iron / map.w);
    expect(sim.checkPlace(0, BT.Hovel, x, y, 0, true)).toBe('Vorkommen nicht überbauen');
  });
});

describe('Regression: Bauverbot bei Feinden', () => {
  it('neben feindlichen Soldaten kann nicht gebaut werden (früher: Tor mitten im Sturm sofort neu gebaut)', () => {
    const map = generateMap({ seed: 7, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 7, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'human' }], startGold: 5000, troopLimit: 1000, fog: false, extreme: false });
    sim.players[0].stock[0] = 500;
    const st = map.starts[0];
    // freien Platz für eine Hütte nahe dem eigenen Keep suchen
    let spot: { x: number; y: number } | null = null;
    for (let r = 4; r < 14 && !spot; r++)
      for (let dy = -r; dy <= r && !spot; dy++)
        for (let dx = -r; dx <= r && !spot; dx++) if (sim.checkPlace(0, BT.Hovel, st.x + dx, st.y + dy, 0) === null) spot = { x: st.x + dx, y: st.y + dy };
    expect(spot).not.toBeNull();
    const enemy = sim.spawnUnit(U.Swordsman, 1, spot!.x + 4.5, spot!.y + 1.5);
    const peasant = sim.spawnUnit(U.Peasant, 1, spot!.x + 1.5, spot!.y - 2.5);
    expect(enemy).toBeGreaterThanOrEqual(0);
    expect(peasant).toBeGreaterThanOrEqual(0);
    sim.spatial.rebuild(sim);
    expect(sim.checkPlace(0, BT.Hovel, spot!.x, spot!.y, 0)).toBe('Feinde in der Nähe');
    // feindliche Bauern blockieren nicht, Soldaten außerhalb des Radius auch nicht
    sim.units.x[enemy] = spot!.x + 30;
    sim.spatial.rebuild(sim);
    expect(sim.checkPlace(0, BT.Hovel, spot!.x, spot!.y, 0)).toBe(null);
  });
});

describe('Regression: Holzversorgung der KI', () => {
  it('Gräfin (seed 15) bleibt mit Holz versorgt (früher: Holzfäller im baumfreien Burgbereich, ab Minute 9 kein Holz mehr)', () => {
    const map = generateMap({ seed: 15, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 15, players: [{ name: 'A', team: 0, kind: 'ai', ai: 0 }, { name: 'B', team: 1, kind: 'ai', ai: 1 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    let minWoodAfter15 = Infinity;
    while (sim.tick < 30 * 600 && !sim.gameOver) {
      sim.step();
      if (sim.tick > 15 * 600 && sim.tick % 600 === 0) minWoodAfter15 = Math.min(minWoodAfter15, sim.players[1].stock[0]);
    }
    // früher: alle 5 Holzfäller im baumfreien Burgbereich, ab Minute 9 dauerhaft 0 Holz
    let supplied = 0;
    const m = sim.map;
    for (const b of sim.buildings.values()) {
      if (b.owner !== 1 || b.type !== BT.Woodcutter) continue;
      let n = 0;
      for (let y = Math.floor(b.cy) - 14; y <= Math.floor(b.cy) + 14; y++)
        for (let x = Math.floor(b.cx) - 14; x <= Math.floor(b.cx) + 14; x++) if (m.inBounds(x, y) && m.trees[m.idx(x, y)]) n++;
      if (n >= 3) supplied++;
    }
    expect(supplied).toBeGreaterThanOrEqual(1);
    expect(minWoodAfter15).toBeGreaterThan(0);
    expect([...sim.buildings.values()].some((b) => b.owner === 1 && b.type === BT.Market)).toBe(true);
  }, 120000);
});

describe('Regression: KI-Duelle enden', () => {
  it('Baron vs Wolf (früher Patt bei ~25 Gold): ein Bergfried fällt innerhalb von 90 Minuten', () => {
    const map = generateMap({ seed: 7, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 7, players: [{ name: 'A', team: 0, kind: 'ai', ai: 0 }, { name: 'B', team: 1, kind: 'ai', ai: 8 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    while (sim.tick < 90 * 600 && !sim.gameOver) sim.step();
    expect(sim.gameOver).toBe(true);
  }, 120000);
});

describe('Regression: weit entfernte Arbeitsplätze', () => {
  it('Ein Holzfäller 30+ Tiles vom Lager entfernt wird bemannt und liefert Holz (Wegfeld war auf 14 Tiles begrenzt)', () => {
    const map = generateMap({ seed: 14, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 14, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'human' }], startGold: 3000, troopLimit: 1000, fog: false, extreme: false });
    const st = map.starts[1];
    let spot: { x: number; y: number } | null = null;
    outer: for (let r = 30; r < 50; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = st.x + dx, y = st.y + dy;
          if (!map.inBounds(x, y) || !map.trees[map.idx(x, y)]) continue;
          for (let ox = -3; ox <= 3 && !spot; ox++)
            for (let oy = -3; oy <= 3 && !spot; oy++) if (!sim.checkPlace(1, BT.Woodcutter, x + ox, y + oy, 0, true)) spot = { x: x + ox, y: y + oy };
          if (spot) break outer;
        }
    expect(spot).not.toBeNull();
    const before = sim.players[1].produced[0];
    sim.place(1, BT.Woodcutter, spot!.x, spot!.y, 0);
    for (let i = 0; i < 4000; i++) sim.step();
    expect(sim.players[1].produced[0] - before).toBeGreaterThan(0);
  }, 60000);
});

describe('Regression: KI-Waffenproduktion', () => {
  it('Die KI steuert die Rezepte der Waffenbauer auch bei Holzmangel (econStep brach vorher früh ab, der Schmied blieb auf Streitkolben)', () => {
    const map = generateMap({ seed: 14, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 14, players: [{ name: 'A', team: 0, kind: 'ai', ai: 3 }, { name: 'B', team: 1, kind: 'human' }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    autoPlace(sim, 0, BT.Armorer); // Schwerter nützen erst mit Rüstung
    const smith = autoPlace(sim, 0, BT.Blacksmith);
    expect(smith).not.toBeNull();
    smith!.recipe = 0; // Streitkolben: Ritter Falk braucht Schwerter
    for (let i = 0; i < 3000; i++) {
      sim.players[0].stock[R.Wood] = 0; // Holzmangel: der Wirtschaftsplan kommt nie zum Zug
      sim.step();
    }
    expect(smith!.recipe).toBe(1);
  }, 60000);
});

describe('Regression: Burg mauert sich nicht ein', () => {
  it('Kein Mauerstück des KI-Plans liegt auf einer Torfläche (alle Profile)', () => {
    for (let ai = 0; ai < 9; ai++) {
      const map = generateMap({ seed: 7, size: 160, players: 2 });
      const sim = new Sim({ map, seed: 7, players: [{ name: 'A', team: 0, kind: 'ai', ai }, { name: 'B', team: 1, kind: 'human' }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
      for (let i = 0; i < 2200; i++) sim.step();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plan = (sim.players[0] as any).ai.plan as { type: number; x: number; y: number; rot: number; kind?: string }[];
      expect(plan).toBeTruthy();
      const gates = plan.filter((s) => BUILDINGS[s.type]?.gate);
      expect(gates.length).toBeGreaterThan(0);
      const walls = plan.filter((s) => BUILDINGS[s.type]?.wallTop && !BUILDINGS[s.type].gate && !BUILDINGS[s.type].stairs && BUILDINGS[s.type].w === 1 && (s.kind ?? 'place') === 'place');
      for (const g of gates) {
        const d = BUILDINGS[g.type];
        const w = g.rot ? d.h : d.w;
        const h = g.rot ? d.w : d.h;
        for (const wl of walls) expect(wl.x >= g.x && wl.x < g.x + w && wl.y >= g.y && wl.y < g.y + h, `Profil ${ai}: Mauer ${wl.x},${wl.y} auf Tor ${g.x},${g.y}`).toBe(false);
      }
    }
  }, 120000);
});

describe('Regression: zerstörte Tore werden neu gebaut', () => {
  it('Ritter Falk baut ein zerstörtes Tor wieder auf', () => {
    const map = generateMap({ seed: 7, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 7, players: [{ name: 'A', team: 0, kind: 'ai', ai: 3 }, { name: 'B', team: 1, kind: 'human' }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    const gates = () => [...sim.buildings.values()].filter((b) => b.owner === 0 && b.def.gate);
    for (let i = 0; i < 16000 && gates().length < 2; i++) sim.step();
    expect(gates().length).toBeGreaterThan(0);
    for (const g of gates()) sim.removeBuilding(g, false);
    expect(gates().length).toBe(0);
    for (let i = 0; i < 12000 && gates().length === 0; i++) sim.step();
    expect(gates().length).toBeGreaterThan(0);
  }, 120000);
});

describe('Regression: Bevölkerungsschaukel', () => {
  it('Die KI ändert den Steuersatz höchstens einmal pro Minute (früher alle 30 s zwischen 0 und 2 bei Beliebtheit ~58)', () => {
    const map = generateMap({ seed: 15, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 15, players: [{ name: 'A', team: 0, kind: 'ai', ai: 0 }, { name: 'B', team: 1, kind: 'ai', ai: 1 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    let last = sim.players[0].tax;
    const changes: number[] = [];
    for (let i = 0; i < 22 * 600; i++) {
      sim.step();
      if (sim.players[0].tax !== last) {
        last = sim.players[0].tax;
        changes.push(sim.tick);
      }
    }
    for (let i = 1; i < changes.length; i++) expect(changes[i] - changes[i - 1]).toBeGreaterThanOrEqual(550);
  }, 120000);
});

describe('Regression: Goldhortung ohne Waffen', () => {
  it('Kaiserin Mathilde (Seed 6) baut ihren Markt, statt 1000+ Gold zu horten (früher fraß die Burg das Holz, Heer blieb schwach)', () => {
    const map = generateMap({ seed: 6, size: 160, players: 2 });
    const sim = new Sim({ map, seed: 6, players: [{ name: 'A', team: 0, kind: 'ai', ai: 6 }, { name: 'B', team: 1, kind: 'ai', ai: 7 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
    const markets = (): number => [...sim.buildings.values()].filter((b) => b.owner === 1 && b.type === BT.Market).length;
    for (let i = 0; i < 27 * 600 && markets() === 0; i++) sim.step();
    expect(markets()).toBeGreaterThan(0);
  }, 180000);
});
