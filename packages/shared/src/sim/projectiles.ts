import { PROJ_CAP } from '../data/balance';

/** Projektile als Struct-of-Arrays (Flugbahn: Parabel von Start- zu Zielpunkt). */
export class ProjStore {
  readonly cap = PROJ_CAP;
  alive = new Uint8Array(PROJ_CAP);
  kind = new Uint8Array(PROJ_CAP);
  owner = new Uint8Array(PROJ_CAP);
  sx = new Float32Array(PROJ_CAP);
  sy = new Float32Array(PROJ_CAP);
  sz = new Float32Array(PROJ_CAP);
  ex = new Float32Array(PROJ_CAP);
  ey = new Float32Array(PROJ_CAP);
  ez = new Float32Array(PROJ_CAP);
  arc = new Float32Array(PROJ_CAP);
  t = new Uint16Array(PROJ_CAP);
  T = new Uint16Array(PROJ_CAP);
  dmg = new Float32Array(PROJ_CAP);
  dtype = new Uint8Array(PROJ_CAP);
  splash = new Float32Array(PROJ_CAP);
  /** Zielhandle (Einheit) zur Trefferprüfung, 0 = Bodenziel */
  target = new Int32Array(PROJ_CAP);
  /** Quelle: Einheitentyp für Schadensmultiplikatoren */
  fire = new Uint8Array(PROJ_CAP);
  /** Zielgebäude (Belagerung) */
  bTarget = new Int32Array(PROJ_CAP);
  top = 0;
  count = 0;
  private free: number[] = [];

  add(): number {
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else if (this.top < this.cap) i = this.top++;
    else return -1;
    this.alive[i] = 1;
    this.count++;
    return i;
  }
  remove(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free.push(i);
    this.count--;
  }
  x(i: number): number {
    return this.sx[i] + (this.ex[i] - this.sx[i]) * (this.t[i] / this.T[i]);
  }
  y(i: number): number {
    return this.sy[i] + (this.ey[i] - this.sy[i]) * (this.t[i] / this.T[i]);
  }
  z(i: number): number {
    const f = this.t[i] / this.T[i];
    return this.sz[i] + (this.ez[i] - this.sz[i]) * f + this.arc[i] * 4 * f * (1 - f);
  }
}
