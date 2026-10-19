import { decode } from '@msgpack/msgpack';
import type { Command, PlayerView, Snapshot } from '@strongpoly/shared';
import type { FromWorker, GameSetup, ToWorker } from './protocol';

export interface GameConnection {
  readonly playerId: number;
  onSnapshot: (s: Snapshot) => void;
  onView: (v: PlayerView) => void;
  onInfo?: (i: { tickMs: number; tick: number; units: number }) => void;
  onError?: (m: string) => void;
  send(cmd: Command): void;
  setSpeed?(x: number): void;
  dev?(op: string, args: Record<string, number>): void;
  setPaused?(p: boolean): void;
  close(): void;
  readonly local: boolean;
}

/** Singleplayer: Simulation läuft in einem Web Worker, gleicher Snapshot-Pfad wie online. */
export class LocalConnection implements GameConnection {
  readonly local = true;
  private worker: Worker;
  onSnapshot: (s: Snapshot) => void = () => {};
  onView: (v: PlayerView) => void = () => {};
  onInfo?: (i: { tickMs: number; tick: number; units: number }) => void;
  onError?: (m: string) => void;
  playerId: number;

  constructor(setup: GameSetup) {
    this.playerId = setup.me;
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.t === 'snap') this.onSnapshot(decode(m.data) as Snapshot);
      else if (m.t === 'me') this.onView(m.view);
      else if (m.t === 'info') this.onInfo?.(m);
      else if (m.t === 'error') this.onError?.(m.message);
    };
    this.worker.onerror = (e) => this.onError?.(e.message);
    this.post({ t: 'start', setup });
  }

  private post(m: ToWorker): void {
    this.worker.postMessage(m);
  }
  send(cmd: Command): void {
    this.post({ t: 'cmd', cmd });
  }
  dev(op: string, args: Record<string, number>): void {
    this.post({ t: 'dev', op, args });
  }
  setSpeed(x: number): void {
    this.post({ t: 'speed', speed: x });
  }
  setPaused(p: boolean): void {
    this.post({ t: 'pause', paused: p });
  }
  close(): void {
    this.post({ t: 'stop' });
    this.worker.terminate();
  }
}
