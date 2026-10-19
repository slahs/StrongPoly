import { generateMap, Sim, Stance, U, GameHost } from '../src';
import { encode } from '@msgpack/msgpack';

/** Lasttest: n Einheiten je Seite auf offenem Feld; misst Sim-, Snapshot- und Encode-Zeit. */
const per = Number(process.argv[2] ?? 1000);
const ticks = Number(process.argv[3] ?? 300);
const map = generateMap({ seed: 3, size: 200, players: 2 });
const sim = new Sim({ map, seed: 3, players: [{ name: 'A', team: 0, kind: 'human' }, { name: 'B', team: 1, kind: 'human' }], startGold: 3000, troopLimit: 5000, fog: false, extreme: false });
const cx = 100;
const cy = 100;
for (let y = cy - 30; y < cy + 30; y++) for (let x = cx - 40; x < cx + 40; x++) { const i = map.idx(x, y); sim.map.terrain[i] = 1; sim.map.height[i] = 1; sim.map.trees[i] = 0; }
sim.nav.bump();
const types = [U.Archer, U.Swordsman, U.Spearman, U.Maceman, U.Crossbowman, U.Knight];
const side = (owner: number, x0: number, dir: number) => {
  const ids: number[] = [];
  const cols = Math.ceil(Math.sqrt(per / 2));
  for (let i = 0; i < per; i++) {
    const s = sim.spawnUnit(types[i % types.length], owner, x0 + dir * (i % cols) * 0.7, cy - 20 + Math.floor(i / cols) * 0.7);
    if (s < 0) break;
    sim.units.stance[s] = Stance.Aggressive;
    ids.push(sim.units.id(s));
  }
  return ids;
};
const a = side(0, cx - 30, 1);
const b = side(1, cx + 30, -1);
sim.step([
  { p: 0, cmd: { c: 'move', units: a, x: cx + 30, y: cy, attack: true } },
  { p: 1, cmd: { c: 'move', units: b, x: cx - 30, y: cy, attack: true } },
]);
const host = new GameHost(sim);
let simMs = 0;
let encMs = 0;
let bytes = 0;
let worst = 0;
for (let i = 0; i < ticks; i++) {
  const t0 = performance.now();
  sim.step();
  const t1 = performance.now();
  const snap = host.enc.encode(false);
  host.enc.finishTick();
  const buf = encode(snap);
  const t2 = performance.now();
  simMs += t1 - t0;
  encMs += t2 - t1;
  worst = Math.max(worst, t1 - t0);
  bytes += buf.byteLength;
}
console.log(`Einheiten: ${sim.units.count} (${per} je Seite), ${ticks} Ticks`);
console.log(`Sim: ${(simMs / ticks).toFixed(2)} ms/Tick (Spitze ${worst.toFixed(1)} ms) · Snapshot+msgpack: ${(encMs / ticks).toFixed(2)} ms/Tick · ${(bytes / ticks / 1024).toFixed(1)} KiB/Tick`);
console.log('Profil (ms/Tick):', Object.entries(sim.prof).map(([k, v]) => `${k}=${(v / ticks).toFixed(2)}`).join(' '), `nav-Felder=${sim.nav.stats.computes} (${(sim.nav.stats.ms / ticks).toFixed(2)} ms/Tick)`);
console.log('Verluste:', sim.players[0].stats.losses, sim.players[1].stats.losses, 'Projektile max:', sim.proj.top);
