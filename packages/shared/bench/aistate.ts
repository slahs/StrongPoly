/** Zustand zweier KI-Lords zu einem Zeitpunkt. Aufruf: tsx bench/aistate.ts <A> <B> <seed> <minuten> */
import { AI_PROFILES, generateMap, R, Sim, UNITS } from '../src';
const [a, b, seed, minutes] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4] ?? 7), Number(process.argv[5] ?? 60)];
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: a }, { name: 'B', team: 1, kind: 'ai', ai: b }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
while (sim.tick < minutes * 600 && !sim.gameOver) sim.step();
const RN = Object.fromEntries(Object.entries(R).map(([k, v]) => [v, k]));
for (const [i, pl] of sim.players.entries()) {
  const cnt: Record<string, number> = {};
  let queue = 0;
  for (const bd of sim.buildings.values()) if (bd.owner === i) { cnt[bd.def.key] = (cnt[bd.def.key] ?? 0) + 1; queue += bd.queue.length; }
  const army: Record<string, number> = {};
  for (let s = 0; s < sim.units.top; s++) if (sim.units.alive[s] && sim.units.owner[s] === i) { const k = UNITS[sim.units.type[s]].key; army[k] = (army[k] ?? 0) + 1; }
  const stock = Object.fromEntries(Array.from(pl.stock).map((v, r) => [RN[r], v]).filter(([, v]) => (v as number) > 0));
  console.log(`== P${i} ${AI_PROFILES[i ? b : a].name} gold ${Math.round(pl.gold)} peas ${pl.peasants} housing ${pl.housing} pop ${Math.round(pl.popularity)} horses ${pl.horses} tax ${pl.tax} ration ${pl.ration} queue ${queue}`);
  console.log('  stock', JSON.stringify(stock));
  console.log('  bld  ', JSON.stringify(cnt));
  console.log('  units', JSON.stringify(army));
}
