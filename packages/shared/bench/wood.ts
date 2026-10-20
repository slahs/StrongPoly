/** Holzwirtschaft einer KI über die Zeit. Aufruf: tsx bench/wood.ts <A> <B> <seed> <spieler 0|1> [minuten] */
import { AI_PROFILES, BT, generateMap, Sim } from '../src';
const [a, b, seed, who, mins = 60] = process.argv.slice(2, 7).map(Number);
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: a }, { name: 'B', team: 1, kind: 'ai', ai: b }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
console.log(AI_PROFILES[who ? b : a].name);
while (sim.tick < mins * 600 && !sim.gameOver) {
  sim.step();
  if (sim.tick % 1800 !== 0) continue;
  const pl = sim.players[who];
  const wc = [...sim.buildings.values()].filter((x) => x.owner === who && x.type === BT.Woodcutter);
  const trees = wc.map((w) => { let n = 0; for (let y = Math.max(0, Math.round(w.cy) - 14); y <= Math.min(map.h - 1, Math.round(w.cy) + 14); y++) for (let x = Math.max(0, Math.round(w.cx) - 14); x <= Math.min(map.w - 1, Math.round(w.cx) + 14); x++) if (map.trees[y * map.w + x]) n++; return n; });
  const ws = [...sim.buildings.values()].filter((x) => x.owner === who && x.def.prod && x.def.wood === undefined).length;
  console.log(`${(sim.tick / 600).toFixed(0)}min wood ${pl.stock[0]} produced ${pl.produced[0]} woodcutters ${wc.length} treesNear ${JSON.stringify(trees)} gold ${Math.round(pl.gold)} market ${[...sim.buildings.values()].filter((x) => x.owner === who && x.type === BT.Market).length}`);
}
