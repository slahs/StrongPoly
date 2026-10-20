/**
 * Sim-Ebene in einer echten KI-Partie: Bewegungsqualität der Bauern/Soldaten (Schrittlänge, Umkehrungen, Stehen im Gedränge).
 * Aufruf: tsx bench/simjitter_game.ts [Minuten] [Seed]
 */
import { AI_PROFILES, DT, generateMap, Sim, U, UNITS } from '@strongpoly/shared';

const minutes = Number(process.argv[2] ?? 8);
const seed = Number(process.argv[3] ?? 7);
const map = generateMap({ seed, size: 128, players: 2 });
const sim = new Sim({
  map,
  seed,
  players: [
    { name: 'A', team: 0, kind: 'ai', ai: 0 },
    { name: 'B', team: 1, kind: 'ai', ai: 8 },
  ],
  startGold: 1500,
  troopLimit: 1000,
  fog: false,
  extreme: false,
});
const px = new Float32Array(8192);
const py = new Float32Array(8192);
const pdx = new Float32Array(8192);
const pdy = new Float32Array(8192);
const seen = new Uint8Array(8192);
const stuckTicks = new Uint16Array(8192);
interface Acc {
  ticks: number;
  moving: number;
  rev: number;
  slow: number;
  fast: number;
  stuck: number;
}
const acc: Record<string, Acc> = {};
const get = (k: string): Acc => (acc[k] ??= { ticks: 0, moving: 0, rev: 0, slow: 0, fast: 0, stuck: 0 });
for (let t = 0; t < minutes * 600; t++) {
  sim.step();
  const u = sim.units;
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s]) {
      seen[s] = 0;
      continue;
    }
    const dx = u.x[s] - px[s];
    const dy = u.y[s] - py[s];
    const d = Math.hypot(dx, dy);
    if (seen[s] && t > 100) {
      const kind = u.type[s] === U.Peasant ? 'Bauer' : u.type[s] === U.Ox ? 'Ochse' : UNITS[u.type[s]].range > 2 ? 'Fernkämpfer' : 'Nahkämpfer';
      const a = get(kind);
      const vn = UNITS[u.type[s]].speed * DT;
      const st = u.state[s];
      const wantsMove = st === 1 || st === 2 || (st === 5 && u.goal[s] >= 0);
      a.ticks++;
      if (wantsMove) {
        // Soll-Bewegung, aber kaum Fortschritt: festgefahren (Gedränge)
        if (d < 0.25 * vn) {
          stuckTicks[s]++;
          if (stuckTicks[s] === 10) a.stuck++;
        } else stuckTicks[s] = 0;
      } else stuckTicks[s] = 0;
      if (d > 0.3 * vn) {
        a.moving++;
        const pd = Math.hypot(pdx[s], pdy[s]);
        if (pd > 0.3 * vn && dx * pdx[s] + dy * pdy[s] < -0.3 * d * pd) a.rev++;
        if (d < 0.6 * vn) a.slow++;
        if (d > 1.5 * vn) a.fast++;
      }
    }
    seen[s] = 1;
    pdx[s] = dx;
    pdy[s] = dy;
    px[s] = u.x[s];
    py[s] = u.y[s];
  }
}
for (const [k, a] of Object.entries(acc))
  console.log(k.padEnd(12), 'Einheiten-Ticks', a.ticks, 'bewegt', a.moving, `Umkehr ${((100 * a.rev) / Math.max(1, a.moving)).toFixed(2)}%`, `langsam ${((100 * a.slow) / Math.max(1, a.moving)).toFixed(1)}%`, `schnell ${((100 * a.fast) / Math.max(1, a.moving)).toFixed(2)}%`, `festgefahren(>1s) ${a.stuck}`);
console.log('Tick', sim.tick, 'Einheiten', sim.units.count);
