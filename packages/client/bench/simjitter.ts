/**
 * Sim-Ebene: Schrittlänge und Richtungswechsel der Einheiten pro Tick (ohne Darstellung).
 * Aufruf: tsx bench/simjitter.ts <scene>
 */
import { Command, DT, generateMap, Sim, UNITS } from '@strongpoly/shared';
import { motionScene } from '../src/game/motion_scenes';
import { mkSimApi } from './motion_lab';

const sc = motionScene(process.argv[2] ?? 'pawns')!;
const seed = 1;
const sim = new Sim({
  map: generateMap({ seed, size: 128, players: 2 }),
  seed,
  players: [
    { name: 'A', team: 0, kind: 'human' },
    { name: 'B', team: 1, kind: 'human' },
  ],
  startGold: 3000,
  troopLimit: 1000,
  fog: false,
  extreme: false,
});
const pend: Command[] = [];
const api = mkSimApi(sim, pend);
sc.setup(api);
const px = new Float32Array(8192);
const py = new Float32Array(8192);
const pdx = new Float32Array(8192);
const pdy = new Float32Array(8192);
const ratios: number[] = [];
let rev = 0;
let mov = 0;
const byState: Record<number, number> = {};
const revByState: Record<number, number> = {};
for (let t = 0; t < sc.ticks; t++) {
  sc.step?.(api, sim.tick);
  sim.step(pend.splice(0).map((cmd) => ({ p: 0, cmd })));
  const u = sim.units;
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s]) continue;
    const dx = u.x[s] - px[s];
    const dy = u.y[s] - py[s];
    const d = Math.hypot(dx, dy);
    const vn = UNITS[u.type[s]].speed * DT;
    if (t > 40 && d > 0.3 * vn) {
      mov++;
      ratios.push(d / vn);
      const pd = Math.hypot(pdx[s], pdy[s]);
      if (pd > 0.3 * vn && dx * pdx[s] + dy * pdy[s] < -0.3 * d * pd) {
        rev++;
        revByState[u.state[s]] = (revByState[u.state[s]] ?? 0) + 1;
      }
      byState[u.state[s]] = (byState[u.state[s]] ?? 0) + 1;
    }
    pdx[s] = dx;
    pdy[s] = dy;
    px[s] = u.x[s];
    py[s] = u.y[s];
  }
}
ratios.sort((a, b) => a - b);
const p = (q: number): string => (ratios[Math.floor(q * ratios.length)] ?? 0).toFixed(2);
console.log(sc.id, 'Bewegungs-Ticks', mov, 'Schritt/Soll p5/p50/p95/p99/max', p(0.05), p(0.5), p(0.95), p(0.99), (ratios[ratios.length - 1] ?? 0).toFixed(2), 'Umkehrungen', rev, ((100 * rev) / Math.max(1, mov)).toFixed(2) + '%', JSON.stringify(byState), JSON.stringify(revByState));
