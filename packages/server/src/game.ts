import { encode } from '@msgpack/msgpack';
import {
  FRAME,
  GameHost,
  GameSetup,
  generateMap,
  Sim,
  type Command,
  type ServerMsg,
  type Snapshot,
} from '@strongpoly/shared';

export function frame(type: number, payload: unknown): Buffer {
  const body = encode(payload);
  const out = Buffer.allocUnsafe(body.byteLength + 1);
  out[0] = type;
  out.set(body, 1);
  return out;
}

export interface GameClientRef {
  send(buf: Buffer | Uint8Array): void;
  connected: boolean;
}

/** Laufende Partie eines Raums: Sim + Takt + Verteilung der Snapshots. */
export class GameRuntime {
  readonly host: GameHost;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = performance.now();
  private tickCount = 0;
  ended = false;
  onEnd: ((winner: number) => void) | null = null;
  /** Spieler-Index -> Client */
  readonly clients = new Map<number, GameClientRef>();
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly setup: GameSetup) {
    const map = 'gen' in setup.map ? generateMap(setup.map.gen) : null;
    if (!map) throw new Error('Nur generierte Karten werden unterstützt');
    const sim = new Sim({
      map,
      players: setup.players,
      seed: setup.seed,
      startGold: setup.startGold,
      troopLimit: setup.troopLimit,
      fog: setup.fog,
      extreme: setup.extreme,
      mission: setup.mission,
    });
    this.host = new GameHost(sim);
    this.host.speed = setup.speed ?? 1;
  }

  start(): void {
    this.last = performance.now();
    this.timer = setInterval(() => this.loop(), 40);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.endTimer) clearTimeout(this.endTimer);
  }

  submit(player: number, cmd: Command): void {
    this.host.submit(player, cmd);
  }

  private loop(): void {
    const now = performance.now();
    const dt = Math.min(250, now - this.last);
    this.last = now;
    const snaps = this.host.advance(dt);
    for (const s of snaps) {
      const buf = frame(FRAME.Snapshot, s);
      for (const c of this.clients.values()) if (c.connected) c.send(buf);
      this.tickCount++;
      if (this.tickCount % 5 === 0) {
        for (const [p, c] of this.clients) if (c.connected) c.send(frame(FRAME.View, this.host.view(p)));
      }
      if (s.winner !== undefined && !this.ended) {
        this.ended = true;
        this.endTimer = setTimeout(() => this.onEnd?.(s.winner as number), 6000);
      }
    }
  }

  /** Voll-Zustand für (Wieder-)Einsteiger */
  syncClient(player: number, c: GameClientRef): void {
    const full: Snapshot = this.host.fullSnapshot();
    c.send(frame(FRAME.Snapshot, full));
    c.send(frame(FRAME.View, this.host.view(player)));
  }

  broadcastControl(msg: ServerMsg): void {
    const buf = frame(FRAME.Control, msg);
    for (const c of this.clients.values()) if (c.connected) c.send(buf);
  }
}
