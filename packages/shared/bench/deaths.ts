/** Wo und warum sterben Angriffseinheiten? Aufruf: tsx bench/deaths.ts <A> <B> <seed> <von-min> <bis-min> */
import { AI_PROFILES, generateMap, Sim, UNITS } from '../src';
const [a, b, seed, t0, t1] = process.argv.slice(2, 7).map(Number);
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: a }, { name: 'B', team: 1, kind: 'ai', ai: b }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
const u = sim.units;
let prev = new Map<number, [number, number, number]>();
const rows: string[] = [];
const bk = sim.buildings.get(sim.players[1].keepId)!;
while (sim.tick < t1 * 600 && !sim.gameOver) {
  sim.step();
  if (sim.tick < t0 * 600) continue;
  const now = new Map<number, [number, number, number]>();
  for (let s = 0; s < u.top; s++) if (u.alive[s] && u.owner[s] === 0 && u.type[s] >= 3) now.set(u.id(s), [u.type[s], u.x[s], u.y[s]]);
  for (const [id, [t, x, y]] of prev) if (!now.has(id) && !u.valid(id)) {
    // nächster Feind
    let best = 1e9, what = '';
    for (let s = 0; s < u.top; s++) if (u.alive[s] && u.owner[s] === 1) { const d = Math.hypot(u.x[s] - x, u.y[s] - y); if (d < best) { best = d; what = UNITS[u.type[s]].key; } }
    let bb = 1e9, bw = '';
    for (const q of sim.buildings.values()) if (q.owner === 1) { const d = Math.hypot(q.cx - x, q.cy - y); if (d < bb) { bb = d; bw = q.def.key; } }
    rows.push(`${(sim.tick / 600).toFixed(1)}min ${UNITS[t].key} @${x.toFixed(0)},${y.toFixed(0)} dKeep=${Math.hypot(bk.cx - x, bk.cy - y).toFixed(0)} nearestEnemyUnit=${what}:${best.toFixed(1)} nearestEnemyBld=${bw}:${bb.toFixed(1)}`);
  }
  prev = now;
}
console.log(rows.slice(0, 60).join('\n'));
console.log('total deaths', rows.length);
