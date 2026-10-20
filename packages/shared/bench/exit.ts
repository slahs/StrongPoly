/**
 * Prüft, ob jede KI einen Weg vom Bergfried nach draußen hat (kein Selbsteinmauern).
 * Aufruf: tsx bench/exit.ts [minuten=60] [seeds=7,14] [profile=0,1,..8]
 */
import { AI_PROFILES, BT, generateMap, Sim } from '../src';

export function hasExit(sim: Sim, p: number): { ok: boolean; why: string } {
  const pl = sim.players[p];
  const keep = sim.buildings.get(pl.keepId);
  if (!keep) return { ok: true, why: 'Keep zerstört' };
  const m = sim.map;
  const team = sim.teamOf[p];
  const entry = sim.entryOf(keep);
  if (entry < 0) return { ok: false, why: 'Keep ohne Eingang' };
  for (const [dx, dy] of [[0, 28], [0, -28], [28, 0], [-28, 0], [20, 20], [-20, 20], [20, -20], [-20, -20]]) {
    const x = Math.round(keep.cx + dx);
    const y = Math.round(keep.cy + dy);
    if (!m.inBounds(x, y)) continue;
    const i = m.idx(x, y);
    if (!sim.nav.groundFree(i, team)) continue;
    const f = sim.nav.getField(team, i * 2, false, sim.tick);
    if (f && sim.nav.reachable(f, entry * 2)) return { ok: true, why: `via ${dx},${dy}` };
  }
  return { ok: false, why: 'kein Weg vom Bergfried nach draußen' };
}

if (process.argv[1]?.endsWith('exit.ts')) {
  const minutes = Number(process.argv[2] ?? 60);
  const seeds = (process.argv[3] ?? '7,14').split(',').map(Number);
  const profiles = (process.argv[4] ?? '0,1,2,3,4,5,6,7,8').split(',').map(Number);
  let bad = 0;
  for (const seed of seeds)
    for (const ai of profiles) {
      const map = generateMap({ seed, size: 160, players: 2 });
      const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai }, { name: 'B', team: 1, kind: 'human' }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
      while (sim.tick < minutes * 600) sim.step();
      const r = hasExit(sim, 0);
      let gates = 0;
      for (const b of sim.buildings.values()) if (b.owner === 0 && b.def.gate) gates++;
      console.log(`${r.ok ? 'OK ' : 'FEHLER'} ${AI_PROFILES[ai].name} seed ${seed}: ${r.why} (Tore ${gates})`);
      if (!r.ok) bad++;
    }
  console.log(bad ? `${bad} Burgen ohne Ausgang` : 'alle Burgen haben einen Ausgang');
  void BT;
  process.exit(bad ? 1 : 0);
}
