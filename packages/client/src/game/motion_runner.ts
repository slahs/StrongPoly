import { BUILDINGS, ClientWorld, Command, U } from '@strongpoly/shared';
import type { GameConnection } from './connection';
import type { MotionScene, SceneApi } from './motion_scenes';

/**
 * Spielt eine Bewegungs-Prüfszene im laufenden Spiel ab (`?quick=1&dev=1&motion=<id>`): Aufbau über die Dev-Befehle des
 * Sim-Workers, Skript-Befehle als normale Spielbefehle. Dieselbe Szene läuft headless im Messlabor (bench/motion.ts).
 */
export class MotionRunner {
  private api: SceneApi;
  private started = false;
  private startTick = 0;
  private lastStep = -1;
  /** Ticks, in denen die Szene fertig ist */
  done = false;
  focus = { x: 0, y: 0 };
  /** selbst platzierte Gebäudetiles (die Welt kennt sie erst mit dem nächsten Snapshot) */
  private occ = new Set<number>();

  constructor(
    private world: ClientWorld,
    private conn: GameConnection,
    private me: number,
    private send: (c: Command) => void,
    readonly scene: MotionScene,
  ) {
    const w = world;
    this.api = {
      map: w.map,
      bldAt: (i) => w.bldAt[i] || (this.occ.has(i) ? -1 : 0),
      home: { x: 0, y: 0 },
      spawn: (type, x, y, n, stance = 2) => conn.dev?.('spawn', { type, owner: me, x, y, n, stance }),
      build: (type, x, y, rot = 0) => {
        const d = BUILDINGS[type];
        const bw = rot ? d.h : d.w;
        const bh = rot ? d.w : d.h;
        for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) this.occ.add(w.map.idx(xx, yy));
        conn.dev?.('build', { owner: me, type, x, y, rot });
      },
      order: (rect, mk, types) => {
        const ids: number[] = [];
        for (let s = 0; s < w.top; s++) {
          if (!w.ids[s] || w.owner[s] !== me || w.type[s] === U.Lord) continue;
          if (types && !types.includes(w.type[s])) continue;
          const x = w.curX[s];
          const y = w.curY[s];
          if (x < rect[0] || x > rect[2] || y < rect[1] || y > rect[3]) continue;
          ids.push(w.ids[s]);
        }
        if (ids.length) send(mk(ids));
      },
    };
  }

  /** je Frame: beim ersten Mal aufbauen, danach das Skript je neuem Tick ausführen */
  update(): void {
    const w = this.world;
    if (this.done || !w.map.n) return;
    if (!this.started) {
      this.started = true;
      this.startTick = w.tick;
      const p = w.players[this.me];
      const keep = p ? { x: p.keepX, y: p.keepY } : { x: w.map.starts[this.me].x, y: w.map.starts[this.me].y };
      // die Karte ist erst nach dem Voll-Snapshot bekannt
      this.api.map = w.map;
      this.api.home = keep;
      this.focus = this.scene.setup(this.api);
      return;
    }
    const t = w.tick - this.startTick;
    if (t === this.lastStep) return;
    for (let k = Math.max(this.lastStep + 1, 0); k <= t; k++) this.scene.step?.(this.api, k);
    this.lastStep = t;
    if (t >= this.scene.ticks) this.done = true;
  }
}
