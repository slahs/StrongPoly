import { BUILDINGS, ClientWorld, UNITS } from '@strongpoly/shared';

/** Kriegsnebel (nur clientseitig dargestellt). Sichtbar = aktuell im Sichtradius, erkundet = jemals gesehen. */
export class FogOfWar {
  private vis: Uint8Array;
  private exp: Uint8Array;
  private w: number;
  private h: number;
  version = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.vis = new Uint8Array(w * h);
    this.exp = new Uint8Array(w * h);
  }

  visible(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.vis[ty * this.w + tx] === 1;
  }
  explored(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.exp[ty * this.w + tx] === 1;
  }
  get visibleMap(): Uint8Array {
    return this.vis;
  }
  get exploredMap(): Uint8Array {
    return this.exp;
  }

  private reveal(cx: number, cy: number, r: number): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) {
          const i = y * this.w + x;
          this.vis[i] = 1;
          this.exp[i] = 1;
        }
      }
  }

  update(world: ClientWorld, myTeam: number, teamOf: number[]): void {
    this.vis.fill(0);
    for (const b of world.buildings.values()) {
      if (teamOf[b.o] !== myTeam) continue;
      this.reveal(b.x + b.w / 2, b.y + b.h / 2, BUILDINGS[b.t].vision + Math.max(b.w, b.h) / 2);
    }
    for (let s = 0; s < world.top; s++) {
      if (!world.ids[s] || teamOf[world.owner[s]] !== myTeam) continue;
      this.reveal(world.curX[s], world.curY[s], UNITS[world.type[s]].sight);
    }
    this.version++;
  }
}
