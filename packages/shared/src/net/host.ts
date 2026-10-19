import { DT, TICK_RATE } from '../data/balance';
import { Sim } from '../sim/sim';
import type { Command, PlayerCommand } from '../sim/types';
import { playerView, PlayerView, Snapshot, SnapshotEncoder } from './snapshot';

/** Treibt eine Sim mit fester Tickrate. Wird vom Server und vom Singleplayer-Worker gleich benutzt. */
export class GameHost {
  readonly enc: SnapshotEncoder;
  private queue: PlayerCommand[] = [];
  speed = 1;
  paused = false;
  private acc = 0;
  /** CPU-Zeit je Tick (gleitender Mittelwert, ms) */
  avgTickMs = 0;

  constructor(readonly sim: Sim) {
    this.enc = new SnapshotEncoder(sim);
  }

  submit(p: number, cmd: Command): void {
    if (this.queue.length < 20000) this.queue.push({ p, cmd });
  }

  /** Läuft ms Echtzeit vorwärts; liefert die dabei entstandenen Delta-Snapshots. */
  advance(dtMs: number): Snapshot[] {
    const out: Snapshot[] = [];
    if (this.paused || this.sim.gameOver) return out;
    this.acc += (dtMs / 1000) * this.speed;
    let guard = 0;
    while (this.acc >= DT && guard++ < 6) {
      this.acc -= DT;
      out.push(this.stepOnce());
    }
    if (this.acc > DT * 4) this.acc = 0; // aufholen begrenzen
    return out;
  }

  stepOnce(): Snapshot {
    const t0 = performance.now();
    const cmds = this.queue;
    this.queue = [];
    this.sim.step(cmds);
    const snap = this.enc.encode(false);
    this.enc.finishTick();
    this.avgTickMs = this.avgTickMs * 0.95 + (performance.now() - t0) * 0.05;
    return snap;
  }

  fullSnapshot(): Snapshot {
    return this.enc.encodeFullStandalone();
  }

  view(p: number): PlayerView {
    return playerView(this.sim, p);
  }

  get tickRate(): number {
    return TICK_RATE;
  }
}
