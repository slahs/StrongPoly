import { UNITS } from '@strongpoly/shared';
import type { FrameInfo, Pose, PoseModel } from './motion_lab';

const PI2 = Math.PI * 2;

/**
 * Darstellungsmodell VOR dem Umbau (Stand Referenz-Commit): Interpolation mit Echtzeit-Alpha seit dem
 * Eintreffen des Snapshots (auf 1,15 begrenzt), Blickrichtung exponentiell der Sim-Richtung nachgeführt,
 * Gehanimation allein aus dem Sim-Zustand (feste Frequenz). Dient als Vergleichsbasis der Messungen.
 */
export class LegacyPose implements PoseModel {
  private x = new Float32Array(8192);
  private y = new Float32Array(8192);
  private f = new Float32Array(8192);
  private mv = new Uint8Array(8192);
  private seen = new Int32Array(8192);
  private gait = new Float32Array(8192);

  frame(fi: FrameInfo): void {
    const w = fi.world;
    const a = Math.min(1.15, (fi.nowMs - w.lastSnapMs) / (100 / fi.speed));
    const fk = Math.min(1, fi.dt * 12);
    for (let s = 0; s < w.top; s++) {
      const id = w.ids[s];
      if (!id) continue;
      this.x[s] = w.prevX[s] + (w.curX[s] - w.prevX[s]) * a;
      this.y[s] = w.prevY[s] + (w.curY[s] - w.prevY[s]) * a;
      if (this.seen[s] !== id) {
        this.seen[s] = id;
        this.f[s] = w.face[s];
      } else {
        let d = w.face[s] - this.f[s];
        if (d > Math.PI) d -= PI2;
        else if (d < -Math.PI) d += PI2;
        this.f[s] += d * fk;
      }
      this.mv[s] = w.flags[s] & 4 ? 1 : 0;
      // Phase der Schrittanimation: uTime * Frequenz (nur zur Auswertung)
      const fr = Math.min(14, 3 + UNITS[w.type[s]].speed * (UNITS[w.type[s]].side === 'siege' ? 3.2 : 4.2));
      this.gait[s] += this.mv[s] ? fr * fi.dt : 0;
    }
  }

  pose(s: number, o: Pose): void {
    o.x = this.x[s];
    o.y = this.y[s];
    o.face = this.f[s];
    o.moving = this.mv[s] === 1;
    o.gait = this.gait[s];
  }
}
