/** Warum rekrutiert die KI nicht? Aufruf: tsx bench/recruitwhy.ts <A> <B> <seed> <minuten> */
import { AI_PROFILES, BT, generateMap, R, Sim, UNITS } from '../src';
const [a, b, seed, mins] = process.argv.slice(2, 6).map(Number);
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: a }, { name: 'B', team: 1, kind: 'ai', ai: b }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
while (sim.tick < mins * 600 && !sim.gameOver) sim.step();
const RN = Object.fromEntries(Object.entries(R).map(([k, v]) => [v, k]));
for (const [i, pl] of sim.players.entries()) {
  const prof = AI_PROFILES[i ? b : a];
  console.log(`== P${i} ${prof.name} gold ${Math.round(pl.gold)} troops ${pl.troops} peasants ${pl.peasants} horses ${pl.horses}`);
  for (const [t, w] of prof.army.units) {
    const d = UNITS[t];
    const want = d.producer === 'barracks' ? BT.Barracks : d.producer === 'merc' ? BT.MercPost : BT.EngineerGuild;
    const bs = [...sim.buildings.values()].filter((x) => x.owner === i && x.type === want);
    const why: string[] = [];
    if (!bs.length) why.push('kein ' + want);
    if (pl.gold < d.cost.gold + 20) why.push('Gold');
    for (const [r, n] of d.cost.res ?? []) if (pl.stock[r] < n) why.push('fehlt ' + RN[r]);
    if (d.cost.horse && pl.horses < 1) why.push('Pferd');
    if (pl.peasants < 1) why.push('keine Bauern');
    console.log(`  ${d.key} (w${w}): ${why.length ? why.join(', ') : 'OK'} queue ${bs.map((x) => x.queue.length).join(',')}`);
  }
}
for (const [i] of sim.players.entries()) for (const x of sim.buildings.values()) if (x.owner === i && x.def.prod && x.def.prod.mode !== 'roam') console.log(`P${i} ${x.def.key} recipe ${x.recipe} (${x.def.prod.recipes.map((r) => RN[r.out]).join('/')}) workers ${x.workers.length} cycles ${x.cycles} out ${x.out} inBuf ${x.inBuf}`);
