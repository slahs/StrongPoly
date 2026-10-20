import { BT, generateMap, Sim } from '../src';
const seed = 14;
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: 2 }, { name: 'B', team: 1, kind: 'ai', ai: 3 }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
const u = sim.units;
let tracked = 0;
while (sim.tick < 40 * 600) {
  sim.step();
  if (!tracked) { for (const b of sim.buildings.values()) if (b.owner === 1 && b.type === BT.Woodcutter && b.workers.length && b.x < 60) { tracked = b.id; console.log('track woodcutter', b.id, 'at', b.x, b.y, 'built tick', sim.tick); } }
  else if (sim.tick % 100 === 0 && sim.tick > 20300 && sim.tick % 500 === 0) {
    const b = sim.buildings.get(tracked); if (!b) { console.log(sim.tick, 'woodcutter gone'); tracked = -1; break; }
    for (const id of b.workers) { const s = u.slot(id); console.log(sim.tick, s < 0 ? 'dead' : `sub ${u.sub[s]} state ${u.state[s]} at ${u.x[s].toFixed(1)},${u.y[s].toFixed(1)} goal ${u.goal[s]} timer ${u.timer[s].toFixed(0)} stuck ${u.stuck[s]} home ${u.home[s]}`); }
  }
}
const b = sim.buildings.get(148)!;
const m = map; const cx = Math.floor(b.cx), cy = Math.floor(b.cy), team = sim.teamOf[1];
let total = 0, reserved = 0, noStand = 0, ok = 0; const rs: any[] = [];
for (let y = cy - 14; y <= cy + 14; y++) for (let x = cx - 14; x <= cx + 14; x++) { const i = m.idx(x, y); if (!m.trees[i]) continue; total++; const rid = sim.reserved.get(i); if (rid !== undefined && sim.units.valid(rid)) { reserved++; rs.push(rid); continue; } let st = false; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const j = m.idx(x + dx, y + dy); if (sim.nav.groundFree(j, team) && !(sim.nav.kind[j] & 1)) st = true; } if (!st) noStand++; else ok++; }
console.log({ total, reserved, noStand, ok, workers: b.workers, reservedBy: [...new Set(rs)].map((id) => { const s = sim.units.slot(id); return s < 0 ? 'dead' : `${sim.units.owner[s]}:type${sim.units.type[s]}:sub${sim.units.sub[s]}:home${sim.units.home[s]}`; }) });
