import { describe, expect, it } from 'vitest';
import { BT, generateMap, MISSIONS, R, Sim, U, mapFromJson, mapToJson } from '../src';
import { autoPlace, run } from './helpers';

function missionSim(i: number): Sim {
  const m = MISSIONS[i];
  const setup = m.setup();
  const map = 'gen' in setup.map ? generateMap(setup.map.gen) : mapFromJson(setup.map.json);
  return new Sim({ map, players: setup.players, seed: setup.seed, startGold: setup.startGold, troopLimit: setup.troopLimit, fog: setup.fog, extreme: setup.extreme, mission: m.id, startRes: setup.startRes });
}

describe('Missionen', () => {
  it('es gibt fünf Missionen mit Zielen', () => {
    expect(MISSIONS.length).toBe(5);
    for (const m of MISSIONS) {
      expect(m.stages.length).toBeGreaterThan(0);
      for (const s of m.stages) expect(s.objectives.length).toBeGreaterThan(0);
      const sim = missionSim(MISSIONS.indexOf(m));
      expect(sim.mission).not.toBeNull();
    }
  });

  it('Mission 1 lässt sich abschließen', () => {
    const sim = missionSim(0);
    for (let i = 0; i < 3; i++) autoPlace(sim, 0, BT.Hovel);
    autoPlace(sim, 0, BT.AppleOrchard);
    // Holzfäller direkt am Wald
    const st = sim.map.starts[0];
    let tree: { x: number; y: number } | null = null;
    for (let r = 5; r < 40 && !tree; r++)
      for (let dy = -r; dy <= r && !tree; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = st.x + dx;
          const y = st.y + dy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && sim.map.inBounds(x, y) && sim.map.trees[sim.map.idx(x, y)]) {
            tree = { x, y };
            break;
          }
        }
    expect(autoPlace(sim, 0, BT.Woodcutter, tree!)).not.toBeNull();
    expect(autoPlace(sim, 0, BT.Woodcutter, tree!)).not.toBeNull();
    autoPlace(sim, 0, BT.Quarry);
    autoPlace(sim, 0, BT.OxTether);
    sim.takeStock(0, R.Wood, 130); // Testhelfer füllt das Lager auf; Platz schaffen
    sim.takeStock(0, R.Stone, 130);
    run(sim, 4000);
    expect(sim.mission!.stage).toBeGreaterThanOrEqual(1);
    run(sim, 8000);
    expect(sim.mission!.complete).toBe(true);
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerTeam).toBe(0);
  }, 60000);

  it('Mission 4 beginnt mit gefüllter Waffenkammer', () => {
    const sim = missionSim(3);
    expect(sim.players[0].stock[R.Spear]).toBeGreaterThan(0);
    expect(sim.countOwn(0, BT.Armory)).toBe(1);
    expect(MISSIONS[3].stages[1].objectives[0].k).toBe('defeat');
    void U;
  });

  it('Karten-Export/Import (Editor-Format) behält Terrain', () => {
    const m = generateMap({ seed: 3, size: 96, players: 2 });
    const j = mapFromJson(JSON.parse(JSON.stringify(mapToJson(m))));
    expect(j.w).toBe(96);
    expect(j.starts.length).toBe(2);
  });
});
