/**
 * KI-gegen-KI-Duell (headless). Läuft bis zum Fall eines Bergfrieds oder bis zum Zeitlimit.
 * Aufruf: tsx bench/duel.ts <ai A> <ai B> [seed] [minuten] [kartengröße]
 */
import { AI_PROFILES, generateMap, Sim, U } from '../src';

const a = Number(process.argv[2] ?? 0);
const b = Number(process.argv[3] ?? 8);
const seed = Number(process.argv[4] ?? 7);
const minutes = Number(process.argv[5] ?? 60);
const size = Number(process.argv[6] ?? 160);
const TPM = 600;

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

const t0 = performance.now();
const tag = `${AI_PROFILES[a].name} vs ${AI_PROFILES[b].name} (seed ${seed}, ${size}²)`;

function army(p: number): { n: number; siege: number; types: Record<string, number> } {
  const u = sim.units;
  let n = 0;
  let siege = 0;
  const types: Record<string, number> = {};
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s] || u.owner[s] !== p) continue;
    const t = u.type[s];
    if (t < U.Archer || t === U.Lord) continue;
    n++;
    if (t >= U.Catapult) siege++;
    types[t] = (types[t] ?? 0) + 1;
  }
  return { n, siege, types };
}

function line(): string {
  const parts = sim.players.map((pl, i) => {
    const k = sim.buildings.get(pl.keepId);
    const ar = army(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ai = (pl as any).ai;
    const w = ai?.wave;
    return `P${i} keep ${k ? Math.round((100 * k.hp) / k.maxHp) : 0}% army ${ar.n} (siege ${ar.siege}) peas ${pl.peasants} gold ${Math.round(pl.gold)} pop ${Math.round(pl.popularity)} kills ${pl.stats.kills} loss ${pl.stats.losses}` + (w ? ` wave#${w.index} ph${w.phase}` : '');
  });
  return `${(sim.tick / TPM).toFixed(1).padStart(5)}min | ${parts.join(' | ')}`;
}

console.log(tag);
const limit = minutes * TPM;
while (sim.tick < limit && !sim.gameOver) {
  sim.step();
  if (sim.tick % (5 * TPM) === 0) console.log(line());
}
const secs = ((performance.now() - t0) / 1000).toFixed(0);
console.log(line());
console.log(
  sim.gameOver
    ? `RESULT ENDED ${(sim.tick / TPM).toFixed(1)}min winnerTeam=${sim.winnerTeam} | ${tag} | ${secs}s`
    : `RESULT TIMEOUT ${minutes}min | ${tag} | ${secs}s`,
);
