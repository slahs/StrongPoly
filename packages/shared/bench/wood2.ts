import { BT, generateMap, Sim, S } from '../src';
const seed = 14;
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: 2 }, { name: 'B', team: 1, kind: 'ai', ai: 3 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
while (sim.tick < 40 * 600) sim.step();
const u = sim.units;
for (const b of sim.buildings.values()) if (b.owner === 1 && b.type === BT.Woodcutter) {
  console.log('woodcutter', b.id, b.x, b.y, 'workers', b.workers.length, 'staffed', b.staffed, 'out', b.out, 'inBuf', b.inBuf, 'timer', b.timer, 'cycles', b.cycles, 'entry', b.entry, 'dead', b.dead);
  for (const id of b.workers) { const s = u.slot(id); console.log('  worker', s < 0 ? 'dead' : `state ${u.state[s]} sub ${u.sub[s]} at ${u.x[s].toFixed(1)},${u.y[s].toFixed(1)} goal ${u.goal[s]} stuck ${u.stuck[s]} carry ${u.carryRes[s]}x${u.carryAmt[s]} timer ${u.timer[s].toFixed(1)}`); }
}
const k = sim.buildings.get(sim.players[1].keepId)!; console.log('keep', k.cx, k.cy);
