import { AI_PROFILES, BT, BUILDINGS, generateMap, R, Sim } from '../src';
const [a, b, seed, mins, who] = [0, 8, 11, 40, 0].map((d, i) => Number(process.argv[2 + i] ?? d));
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'a', team: 0, kind: 'ai', ai: a }, { name: 'b', team: 1, kind: 'ai', ai: b }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
const RN = Object.fromEntries(Object.entries(R).map(([k, v]) => [v, k]));
while (sim.tick < mins * 600) {
  sim.step();
  if (sim.tick % 3000) continue;
  const pl = sim.players[who];
  const blds: Record<string, string> = {};
  for (const bb of sim.buildings.values()) {
    if (bb.owner !== who || !bb.def.prod && bb.type !== BT.Barracks) continue;
    const k = BUILDINGS[bb.type].key;
    const cur = blds[k]?.split('/') ?? ['0', '0'];
    blds[k] = `${+cur[0] + 1}/${+cur[1] + (bb.staffed > 0 ? 1 : 0)}`;
  }
  const stock = Object.fromEntries([...pl.stock].map((v, i) => [RN[i], Math.round(v)]).filter(([, v]) => v));
  console.log(`${sim.tick / 600}min gold=${Math.round(pl.gold)} peas=${pl.peasants}/${pl.housing} troops=${pl.troops}`);
  console.log('  bld(count/staffed)', JSON.stringify(blds));
  console.log('  stock', JSON.stringify(stock));
}
import { UNITS } from '../src';
{
  const pl = sim.players[who];
  const used: Record<string, number> = {};
  for (let t = 0; t < UNITS.length; t++) for (const [r, n] of UNITS[t].cost.res ?? []) used[RN[r]] = (used[RN[r]] ?? 0) + n * pl.stats.ever[t];
  console.log('recruited ever', JSON.stringify(Object.fromEntries([...pl.stats.ever].map((v, i) => [UNITS[i]?.key, v]).filter(([, v]) => v))));
  console.log('weapons consumed by recruits', JSON.stringify(used));
}
