import { BT, BUILDINGS, generateMap, R, Sim } from '../src';

export function mkSim(seed = 5, players = 2, size = 128, extra: Partial<ConstructorParameters<typeof Sim>[0]> = {}): Sim {
  const map = generateMap({ seed, size, players });
  return new Sim({
    map,
    seed,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, team: i, kind: 'human' as const })),
    startGold: 3000,
    troopLimit: 1000,
    fog: false,
    extreme: false,
    ...extra,
  });
}

/** Sucht spiralförmig um den Start einen gültigen Platz und baut (Kosten ignoriert, Ressourcen werden bei Bedarf aufgefüllt). */
export function autoPlace(sim: Sim, p: number, type: number, near?: { x: number; y: number }, maxR = 32): ReturnType<Sim['place']> {
  const st = near ?? sim.map.starts[p];
  sim.players[p].gold += 500;
  for (let r = 0; r < maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = st.x + dx;
        const y = st.y + dy;
        if (sim.checkPlace(p, type, x, y, 0, true)) continue;
        if (!BUILDINGS[type].store && !BUILDINGS[type].line && !hasMargin(sim, type, x, y)) continue;
        // Ressourcen auffüllen
        const c = sim.players[p].stock;
        c[R.Wood] = Math.max(c[R.Wood], 150);
        c[R.Stone] = Math.max(c[R.Stone], 150);
        sim.recountUsed(p);
        const b = sim.place(p, type, x, y, 0);
        if (b) return b;
      }
  return null;
}

export function run(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

export { BT, R };

/** 1 Tile Abstand zu anderen Gebäuden, damit nichts eingemauert wird */
function hasMargin(sim: Sim, type: number, x: number, y: number): boolean {
  const d = BUILDINGS[type];
  for (let yy = y - 1; yy <= y + d.h; yy++)
    for (let xx = x - 1; xx <= x + d.w; xx++) {
      if (!sim.map.inBounds(xx, yy)) return false;
      if (sim.bldAt[sim.map.idx(xx, yy)] && !(xx >= x && xx < x + d.w && yy >= y && yy < y + d.h)) return false;
    }
  return true;
}
