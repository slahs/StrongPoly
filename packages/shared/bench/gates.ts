/** Diagnose: wie viele Tore/Mauern baut ein Profil? Aufruf: tsx bench/gates.ts <ai> [seed] [minuten] */
import { AI_PROFILES, BT, generateMap, Sim } from '../src';
const ai = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 7);
const minutes = Number(process.argv[4] ?? 20);
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai }, { name: 'B', team: 1, kind: 'ai', ai: 0 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
while (sim.tick < minutes * 600) sim.step();
const cnt: Record<string, number> = {};
for (const b of sim.buildings.values()) if (b.owner === 0) cnt[b.def.key] = (cnt[b.def.key] ?? 0) + 1;
console.log(AI_PROFILES[ai].name, 'keep', sim.buildings.get(sim.players[0].keepId)?.cx, sim.buildings.get(sim.players[0].keepId)?.cy);
console.log(JSON.stringify(cnt));
const plan = (sim.players[0] as any).ai.plan as { type: number; x: number; y: number; rot: number; done?: boolean }[];
console.log('plan steps', plan.length, 'gates in plan', plan.filter((p) => p.type === BT.GateStone || p.type === BT.GateWood).length);
console.log(plan.filter((p) => p.type === BT.GateStone || p.type === BT.GateWood));
for (const g of plan.filter((p) => p.type === BT.GateStone || p.type === BT.GateWood)) {
  console.log('gate checkPlace now ->', sim.checkPlace(0, g.type, g.x, g.y, g.rot));
  for (let dy = -2; dy <= 2; dy++) console.log(dy, Array.from({ length: 9 }, (_, i) => { const b = sim.buildingAtTile(g.x - 4 + i, g.y + dy); return b ? b.def.key.slice(0, 4) : '.'; }).join(' '));
}
