import { RenderClock, UNITS, type Snapshot } from '@strongpoly/shared';
import { UnitMotion } from '../src/render/motion';
import { UNIT_WALK_W } from '../src/render/models_units';
import type { FrameInfo, Pose, PoseModel } from './motion_lab';

/** Neues Darstellungsmodell: RenderClock + UnitMotion (dieselben Klassen wie im Spiel). */
export class NewPose implements PoseModel {
  clock = new RenderClock();
  motion = new UnitMotion();
  advance(f: FrameInfo): void {
    this.clock.advance(f.dt, f.speed, f.paused);
  }
  onSnapshot(s: Snapshot, lateMs: number, arrivalMs: number, speed: number): void {
    if (s.full) this.clock.reset(s.tick);
    else this.clock.onSnapshot(s.tick, lateMs, speed, arrivalMs);
  }
  frame(f: FrameInfo): void {
    this.motion.update(f.world, { tickF: this.clock.render, alpha: this.clock.alpha, dt: f.dt, paused: f.paused, walkW: UNIT_WALK_W });
  }
  pose(s: number, o: Pose): void {
    const m = this.motion;
    o.x = m.x[s];
    o.y = m.y[s];
    o.face = m.face[s];
    o.moving = m.walk[s] === 1;
    o.gait = m.gait[s];
  }
}
void UNITS;
export const mkNewModel = (): PoseModel => new NewPose();
