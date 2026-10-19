import { followGoal, MR } from './movement';
import type { Sim } from './sim';
import { S } from './unitstore';

// --- Platzhalter bis zum Kampfmeilenstein ---
export function updateProjectiles(_sim: Sim): void {}
export function orderAttack(_sim: Sim, _p: number, _ids: number[], _kind: number, _target: number): void {}
export function orderAttackGround(_sim: Sim, _p: number, _ids: number[], _x: number, _y: number): void {}
export function orderPatrol(_sim: Sim, _p: number, _ids: number[], _x: number, _y: number): void {}
export function orderTunnel(_sim: Sim, _p: number, _ids: number[], _x: number, _y: number): void {}
export function militaryTick(sim: Sim, s: number): void {
  const u = sim.units;
  if (u.state[s] === S.Move || u.state[s] === S.AttackMove) {
    const r = followGoal(sim, s, false, 0.5);
    if (r === MR.Arrived || r === MR.NoPath) u.state[s] = S.Idle;
  }
}
