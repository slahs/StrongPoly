/** Bevölkerungsschwankung: größte Änderung der Bauernzahl binnen 3 Minuten. Aufruf: tsx bench/pop.ts <A> <B> <seed> [minuten] */
import { AI_PROFILES, generateMap, Sim } from '../src';
const [a, b, seed, mins = 60] = process.argv.slice(2, 6).map(Number);
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: a }, { name: 'B', team: 1, kind: 'ai', ai: b }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
const hist: number[][] = [[], []];
while (sim.tick < mins * 600 && !sim.gameOver) {
  sim.step();
  if (sim.tick % 60 === 0) for (const p of [0, 1]) hist[p].push(sim.players[p].peasants);
}
for (const p of [0, 1]) {
  const h = hist[p];
  const W = 18; // 3 min bei 10 s Abstand
  let worst = 0, at = 0;
  for (let i = W; i < h.length; i++) { const sw = Math.max(...h.slice(i - W, i + 1)) - Math.min(...h.slice(i - W, i + 1)); if (sw > worst) { worst = sw; at = i; } }
  console.log(`${AI_PROFILES[p ? b : a].name}: max Schwankung ${worst} Bauern binnen 3 Min (bei ${(at / 6).toFixed(0)} Min), Ende ${h[h.length - 1]}`);
}
if (process.env.TRACE) for (let i = 0; i < hist[0].length; i += 12) console.log(`${(i / 6).toFixed(0)}min P0 ${hist[0][i]} P1 ${hist[1][i]}`);
