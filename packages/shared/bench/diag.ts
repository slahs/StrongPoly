/**
 * Diagnose eines KI-Angriffs: was macht die Welle vor der Feindburg?
 * Aufruf: tsx bench/diag.ts <ai A> <ai B> [seed] [minuten] [kartengröße]
 */
import { AI_PROFILES, generateMap, Sim, U, UNITS } from '../src';
import { S } from '../src/sim/unitstore';

const a = Number(process.argv[2] ?? 0);
const b = Number(process.argv[3] ?? 8);
const seed = Number(process.argv[4] ?? 11);
const minutes = Number(process.argv[5] ?? 45);
const size = Number(process.argv[6] ?? 160);
const map = generateMap({ seed, size, players: 2 });
const sim = new Sim({
  map,
  seed,
  players: [
    { name: AI_PROFILES[a].name, team: 0, kind: 'ai', ai: a },
    { name: AI_PROFILES[b].name, team: 1, kind: 'ai', ai: b },
  ],
  startGold: 1500,
  troopLimit: 1000,
  fog: false,
  extreme: false,
});
const SN = Object.fromEntries(Object.entries(S).map(([k, v]) => [v, k]));
const u = sim.units;
while (sim.tick < minutes * 600 && !sim.gameOver) {
  sim.step();
  if (sim.tick % 300 !== 0) continue;
  for (let p = 0; p < 2; p++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ai = (sim.players[p] as any).ai;
    const w = ai.wave;
    if (w.phase < 1 || p !== Number(process.env.P ?? p)) continue;
    const e = w.target;
    const ek = sim.buildings.get(sim.players[e].keepId)!;
    const lord = u.slot(sim.players[e].lordId);
    const st: Record<string, number> = {};
    const ty: Record<string, number> = {};
    let dsum = 0;
    let dmin = 1e9;
    let atKeep = 0;
    for (const id of w.ids) {
      const s = u.slot(id);
      if (s < 0) continue;
      st[SN[u.state[s]]] = (st[SN[u.state[s]]] ?? 0) + 1;
      ty[UNITS[u.type[s]].key] = (ty[UNITS[u.type[s]].key] ?? 0) + 1;
      const d = Math.hypot(u.x[s] - ek.cx, u.y[s] - ek.cy);
      dsum += d;
      dmin = Math.min(dmin, d);
      if (d < 6) atKeep++;
    }
    let walls = 0;
    let wallHp = 0;
    let gates = 0;
    for (const bb of sim.buildings.values()) {
      if (bb.owner !== e || !bb.def.wallTop || bb.type === ek.type) continue;
      walls++;
      wallHp += bb.hp;
      if (bb.def.gate) gates++;
    }
    console.log(
      `${(sim.tick / 600).toFixed(1)}min P${p}->P${e} wave#${w.index} ph${w.phase} n=${w.ids.length} avgD=${(dsum / Math.max(1, w.ids.length)).toFixed(1)} minD=${dmin.toFixed(1)} atKeep=${atKeep} keepHp=${Math.round(ek.hp)} lord=${lord >= 0 ? `${u.hp[lord].toFixed(0)}hp d=${Math.hypot(u.x[lord] - ek.cx, u.y[lord] - ek.cy).toFixed(1)}` : 'dead'} walls=${walls} gates=${gates} wallHp=${Math.round(wallHp)}`,
    );
    console.log(`   states ${JSON.stringify(st)} types ${JSON.stringify(ty)}`);
  }
}
console.log(sim.gameOver ? `ENDED ${(sim.tick / 600).toFixed(1)}min team ${sim.winnerTeam}` : 'TIMEOUT');
