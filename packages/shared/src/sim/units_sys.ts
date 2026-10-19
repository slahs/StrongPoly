import { U } from '../data/units';
import { workerTick } from './economy';
import { militaryTick } from './combat';
import { followGoal, MR } from './movement';
import type { Sim } from './sim';
import { S } from './unitstore';

export function updateUnits(sim: Sim): void {
  const u = sim.units;
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s]) continue;
    const t = u.type[s];
    if ((sim.tick + s) % 32 === 0) sim.rescueUnit(s);
    if (t === U.Peasant || t === U.Ox) {
      if (u.state[s] === S.Move) {
        const r = followGoal(sim, s, false, 0.6);
        if (r === MR.Arrived || r === MR.NoPath) u.state[s] = S.Idle;
        continue;
      }
      workerTick(sim, s);
    } else {
      militaryTick(sim, s);
    }
  }
}
