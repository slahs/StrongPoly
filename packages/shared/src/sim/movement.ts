import { DT, UNIT_CAP } from '../data/balance';
import { TERRAIN_SPEED } from '../data/terrain';
import { UNITS } from '../data/units';
import { DIR_NONE, DIR_SWITCH, DX, DY, NK } from './nav';
import type { Sim } from './sim';

/** Ergebnis eines Bewegungsschritts */
export const MR = { Moving: 0, Arrived: 1, NoPath: 2, Breach: 3, Waiting: 4 } as const;

/** Gleichmäßiger Raster-Hash (Zellgröße 2 Tiles) für Nachbarschaftsabfragen. */
export class Spatial {
  readonly cs = 2;
  cw: number;
  ch: number;
  start: Int32Array;
  items = new Int32Array(UNIT_CAP);
  private cellOf = new Int32Array(UNIT_CAP);

  constructor(w: number, h: number) {
    this.cw = Math.ceil(w / this.cs);
    this.ch = Math.ceil(h / this.cs);
    this.start = new Int32Array(this.cw * this.ch + 1);
    this.fillPos = new Int32Array(this.cw * this.ch);
  }

  rebuild(sim: Sim): void {
    const u = sim.units;
    const cells = this.cw * this.ch;
    const start = this.start;
    start.fill(0);
    let n = 0;
    for (let s = 0; s < u.top; s++) {
      if (!u.alive[s]) {
        this.cellOf[s] = -1;
        continue;
      }
      const cx = Math.min(this.cw - 1, Math.max(0, (u.x[s] / this.cs) | 0));
      const cy = Math.min(this.ch - 1, Math.max(0, (u.y[s] / this.cs) | 0));
      const c = cy * this.cw + cx;
      this.cellOf[s] = c;
      start[c + 1]++;
      n++;
    }
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const fp = this.fillPos;
    for (let c = 0; c < cells; c++) fp[c] = start[c];
    for (let s = 0; s < u.top; s++) {
      const c = this.cellOf[s];
      if (c >= 0) this.items[fp[c]++] = s;
    }
    this.count = n;
  }
  private fillPos: Int32Array;
  count = 0;

  /** Iteriert alle Slots im Umkreis (grob, Zellen) */
  query(x: number, y: number, r: number, fn: (s: number) => void): void {
    const cs = this.cs;
    const x0 = Math.max(0, ((x - r) / cs) | 0);
    const x1 = Math.min(this.cw - 1, ((x + r) / cs) | 0);
    const y0 = Math.max(0, ((y - r) / cs) | 0);
    const y1 = Math.min(this.ch - 1, ((y + r) / cs) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * this.cw + cx;
        for (let k = this.start[c]; k < this.start[c + 1]; k++) fn(this.items[k]);
      }
    }
  }
}

/** Navigations-Team einer Einheit (Kletterer bekommen Bit 3) */
export function unitTeam(sim: Sim, s: number): number {
  const u = sim.units;
  return sim.teamOf[u.owner[s]] | (UNITS[u.type[s]].climbs ? 8 : 0);
}

export function tileOf(sim: Sim, x: number, y: number): number {
  const m = sim.map;
  let tx = x | 0;
  let ty = y | 0;
  if (tx < 0) tx = 0;
  else if (tx >= m.w) tx = m.w - 1;
  if (ty < 0) ty = 0;
  else if (ty >= m.h) ty = m.h - 1;
  return ty * m.w + tx;
}

/** Ist das Tile für eine Einheit (Team, Ebene) betretbar? */
export function passable(sim: Sim, tile: number, layer: number, team: number): boolean {
  const nav = sim.nav;
  if (layer === 1) return (nav.kind[tile] & NK.WallTop) !== 0;
  if (nav.groundFree(tile, team)) return true;
  return (nav.ladder[tile] & (1 << (team & 7))) !== 0;
}

function heightOk(sim: Sim, a: number, b: number): boolean {
  if (a === b) return true;
  const m = sim.map;
  if (Math.abs(m.height[a] - m.height[b]) <= 1) return true;
  return (sim.nav.kind[a] | sim.nav.kind[b]) & (NK.Gate | NK.Stairs) ? true : false;
}

/** Bewegt Einheit s Richtung (nx, ny). Gibt false zurück, wenn komplett blockiert. */
export function walkStep(sim: Sim, s: number, nx: number, ny: number, mul = 1): boolean {
  const u = sim.units;
  const x = u.x[s];
  const y = u.y[s];
  const dx = nx - x;
  const dy = ny - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-5) return true;
  const def = UNITS[u.type[s]];
  const team = unitTeam(sim, s);
  const layer = u.layer[s];
  const ownTile = tileOf(sim, x, y);
  let sp = def.speed * mul;
  if (layer === 0) {
    const ts = TERRAIN_SPEED[sim.map.terrain[ownTile]];
    if (ts > 0 && ts < 1 && !def.mounted) sp *= ts;
    else if (ts > 0 && ts < 1) sp *= 0.8;
  }
  if (u.burn[s] > 0) sp *= 1.2;
  const step = Math.min(d, sp * DT);
  const ux = dx / d;
  const uy = dy / d;
  u.face[s] = Math.atan2(ux, uy);
  const tryMove = (mx: number, my: number): boolean => {
    const t = tileOf(sim, mx, my);
    if (t !== ownTile) {
      if (mx < 0 || my < 0 || mx >= sim.map.w || my >= sim.map.h) return false;
      if (!passable(sim, t, layer, team)) return false;
      if (layer === 0 && !heightOk(sim, ownTile, t)) return false;
    }
    u.x[s] = mx;
    u.y[s] = my;
    return true;
  };
  if (tryMove(x + ux * step, y + uy * step)) return true;
  // an Kanten entlang gleiten
  if (Math.abs(ux) > 0.01 && tryMove(x + Math.sign(ux) * step, y)) return true;
  if (Math.abs(uy) > 0.01 && tryMove(x, y + Math.sign(uy) * step)) return true;
  return false;
}

/** Freie Sichtlinie am Boden zwischen zwei Punkten (grob, per Sampling) */
export function clearLine(sim: Sim, x0: number, y0: number, x1: number, y1: number, team: number, layer: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 0.7);
  let prev = tileOf(sim, x0, y0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const tile = tileOf(sim, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    if (tile !== prev) {
      if (!passable(sim, tile, layer, team)) return false;
      if (layer === 0 && !heightOk(sim, prev, tile)) return false;
      prev = tile;
    }
  }
  return true;
}

/**
 * Folgt dem Flowfield zum Ziel u.goal und läuft zuletzt direkt zu (tx, ty).
 */
export function followGoal(sim: Sim, s: number, breach: boolean, arrive = 0.5): number {
  const u = sim.units;
  const x = u.x[s];
  const y = u.y[s];
  const px = u.tx[s];
  const py = u.ty[s];
  const layer = u.layer[s];
  const goal = u.goal[s];
  const goalLayer = goal >= 0 ? goal & 1 : layer;
  const dx = px - x;
  const dy = py - y;
  const d2 = dx * dx + dy * dy;
  if (goalLayer === layer && d2 <= arrive * arrive) return MR.Arrived;
  const team = unitTeam(sim, s);
  const mapW = sim.map.w;
  const tile = tileOf(sim, x, y);
  const goalTile = goal >= 0 ? goal >> 1 : tile;

  // Direktlauf, wenn nah und frei
  if (goalLayer === layer && d2 < 16 && (tile === goalTile || clearLine(sim, x, y, px, py, team, layer))) {
    return walkStep(sim, s, px, py) ? MR.Moving : stuck(u, s);
  }
  if (goal < 0) return walkStep(sim, s, px, py) ? MR.Moving : stuck(u, s);
  const f = sim.nav.getField(team, goal, breach, sim.tick);
  if (!f) return MR.Waiting;
  const node = tile * 2 + layer;
  const dir = f.dir[node];
  if (dir === DIR_NONE) {
    if (node === goal) return walkStep(sim, s, px, py) ? MR.Moving : stuck(u, s);
    return MR.NoPath;
  }
  if (dir >= 16 && dir !== DIR_NONE) {
    // Seitliche Kletterstelle: erst an die Kante laufen, dann Ebene wechseln und hinübersteigen
    const k = dir - 16;
    const tx0 = tile % mapW;
    const ty0 = (tile / mapW) | 0;
    const ex = tx0 + 0.5 + DX[k] * 0.38;
    const ey = ty0 + 0.5 + DY[k] * 0.38;
    if ((ex - x) * (ex - x) + (ey - y) * (ey - y) < 0.02) {
      u.layer[s] = layer ^ 1;
      walkStep(sim, s, tx0 + 0.5 + DX[k], ty0 + 0.5 + DY[k]);
      return MR.Moving;
    }
    return walkStep(sim, s, ex, ey) ? MR.Moving : stuck(u, s);
  }
  if (dir === DIR_SWITCH) {
    const cx = (tile % mapW) + 0.5;
    const cy = ((tile / mapW) | 0) + 0.5;
    if ((cx - x) * (cx - x) + (cy - y) * (cy - y) < 0.09) {
      u.layer[s] = layer ^ 1;
      return MR.Moving;
    }
    return walkStep(sim, s, cx, cy) ? MR.Moving : stuck(u, s);
  }
  const tx = tile % mapW;
  const ty = (tile / mapW) | 0;
  const nxT = tx + DX[dir];
  const nyT = ty + DY[dir];
  const nextTile = nyT * mapW + nxT;
  if (layer === 0) {
    // Durchbruch: nächstes Tile ist ein feindliches, solides Gebäude
    const k = sim.nav.kind[nextTile];
    if (k & NK.Solid && !passable(sim, nextTile, 0, team)) {
      const bid = sim.bldAt[nextTile];
      if (bid) {
        u.target[s] = bid;
        u.targetKind[s] = 2;
        return MR.Breach;
      }
    }
  }
  const cx = nxT + 0.5;
  const cy = nyT + 0.5;
  // Zwei Schritte vorausschauen glättet die Bahn
  let aimX = cx;
  let aimY = cy;
  const d2n = (cx - x) * (cx - x) + (cy - y) * (cy - y);
  if (d2n < 0.5) {
    const n2 = f.dir[nextTile * 2 + layer];
    if (n2 < 8) {
      aimX = nxT + DX[n2] + 0.5;
      aimY = nyT + DY[n2] + 0.5;
      // nur nutzen, wenn Sichtlinie frei
      if (!clearLine(sim, x, y, aimX, aimY, team, layer)) {
        aimX = cx;
        aimY = cy;
      }
    }
  }
  return walkStep(sim, s, aimX, aimY) ? MR.Moving : stuck(u, s);
}

function stuck(u: Sim['units'], s: number): number {
  if (u.stuck[s] < 255) u.stuck[s]++;
  return MR.Moving;
}

/** Schiebt überlappende Einheiten auseinander (nur gleiche Ebene) */
export function separate(sim: Sim): void {
  const u = sim.units;
  const sp = sim.spatial;
  const cs = sp.cs;
  const cw = sp.cw;
  const ch = sp.ch;
  for (let s = 0; s < u.top; s++) {
    if (!u.alive[s]) continue;
    const st = u.state[s];
    const x = u.x[s];
    const y = u.y[s];
    const r1 = UNITS[u.type[s]].radius;
    const cx = Math.min(cw - 1, (x / cs) | 0);
    const cy = Math.min(ch - 1, (y / cs) | 0);
    let px = 0;
    let py = 0;
    let n = 0;
    for (let oy = cy > 0 ? cy - 1 : 0; oy <= (cy < ch - 1 ? cy + 1 : cy); oy++) {
      for (let ox = cx > 0 ? cx - 1 : 0; ox <= (cx < cw - 1 ? cx + 1 : cx); ox++) {
        const c = oy * cw + ox;
        for (let k = sp.start[c]; k < sp.start[c + 1]; k++) {
          const o = sp.items[k];
          if (o === s || u.layer[o] !== u.layer[s]) continue;
          const ddx = x - u.x[o];
          const ddy = y - u.y[o];
          const rr = r1 + UNITS[u.type[o]].radius;
          const dd = ddx * ddx + ddy * ddy;
          if (dd >= rr * rr * 1.0) continue;
          if (dd < 1e-6) {
            // exakt gleich: deterministisch auseinander
            px += ((s * 7919) % 13) / 13 - 0.5;
            py += ((s * 104729) % 17) / 17 - 0.5;
          } else {
            const dist = Math.sqrt(dd);
            const push = (rr - dist) / dist;
            px += ddx * push;
            py += ddy * push;
          }
          n++;
        }
      }
    }
    if (n === 0) continue;
    // Stehende (arbeitende/gehaltene) Einheiten werden weniger geschoben
    const k = st === 0 || st === 5 ? 0.25 : 0.5;
    const nx = x + Math.max(-0.15, Math.min(0.15, px * k));
    const ny = y + Math.max(-0.15, Math.min(0.15, py * k));
    const team = unitTeam(sim, s);
    const t0 = tileOf(sim, x, y);
    const t1 = tileOf(sim, nx, ny);
    if (nx < 0 || ny < 0 || nx >= sim.map.w || ny >= sim.map.h) continue;
    if (t1 !== t0 && !passable(sim, t1, u.layer[s], team)) continue;
    u.x[s] = nx;
    u.y[s] = ny;
  }
}
