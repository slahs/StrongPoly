import { Formation, Stance } from './types';
import { tileOf } from './movement';
import { NK } from './nav';
import type { Sim } from './sim';
import { S } from './unitstore';

/** Formationsversatz (relativ zum Zielpunkt, in Tiles) */
export function formationOffsets(n: number, kind: number, dx: number, dy: number): [number, number][] {
  const out: [number, number][] = [];
  const len = Math.hypot(dx, dy) || 1;
  const fx = dx / len;
  const fy = dy / len;
  const px = -fy;
  const py = fx;
  const sp = 0.95;
  if (kind === Formation.Line) {
    const perRow = Math.max(1, Math.min(n, 14));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const off = (col - (perRow - 1) / 2) * sp;
      out.push([px * off - fx * row * sp, py * off - fy * row * sp]);
    }
  } else if (kind === Formation.Wedge) {
    let i = 0;
    for (let row = 0; i < n; row++) {
      const cnt = row + 1;
      for (let c = 0; c < cnt && i < n; c++, i++) {
        const off = (c - (cnt - 1) / 2) * sp;
        out.push([px * off - fx * row * sp, py * off - fy * row * sp]);
      }
    }
  } else {
    // Box / frei: kompaktes Quadrat
    const side = Math.max(1, Math.ceil(Math.sqrt(n)));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / side);
      const col = i % side;
      const offx = (col - (side - 1) / 2) * sp;
      const offy = (row - (side - 1) / 2) * sp;
      out.push([px * offx + fx * offy, py * offx + fy * offy]);
    }
  }
  return out;
}

/** Nächstes freies begehbares Tile (Spiralsuche) */
export function nearestFreeTile(sim: Sim, tx: number, ty: number, team: number, maxR = 8): number {
  const m = sim.map;
  tx = Math.max(0, Math.min(m.w - 1, tx));
  ty = Math.max(0, Math.min(m.h - 1, ty));
  for (let r = 0; r <= maxR; r++) {
    let best = -1;
    let bd = Infinity;
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (!m.inBounds(x, y)) continue;
        const i = m.idx(x, y);
        if (!sim.nav.groundFree(i, team) || sim.nav.kind[i] & NK.Solid && !(sim.nav.kind[i] & NK.Gate)) continue;
        const d = (x - tx) ** 2 + (y - ty) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Zielknoten für Punkt: Mauerkrone, wenn dort nur oben begehbar */
export function goalNodeAt(sim: Sim, x: number, y: number, team: number): { node: number; px: number; py: number } | null {
  const m = sim.map;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!m.inBounds(tx, ty)) return null;
  const i = m.idx(tx, ty);
  const k = sim.nav.kind[i];
  if (k & NK.WallTop && !sim.nav.groundFree(i, team)) return { node: i * 2 + 1, px: tx + 0.5, py: ty + 0.5 };
  if (sim.nav.groundFree(i, team)) return { node: i * 2, px: x, py: y };
  const f = nearestFreeTile(sim, tx, ty, team, 8);
  if (f < 0) return null;
  return { node: f * 2, px: (f % m.w) + 0.5, py: ((f / m.w) | 0) + 0.5 };
}

export function ownedSlots(sim: Sim, p: number, ids: number[]): number[] {
  const out: number[] = [];
  const u = sim.units;
  const n = Math.min(ids.length, 2000);
  for (let i = 0; i < n; i++) {
    const s = u.slot(ids[i] | 0);
    if (s >= 0 && u.owner[s] === p && u.type[s] !== 0 && u.type[s] !== 1) out.push(s);
  }
  return out;
}

export function orderMove(sim: Sim, p: number, ids: number[], x: number, y: number, attack: boolean, queue: boolean, formation: number): void {
  const slots = ownedSlots(sim, p, ids);
  if (!slots.length) return;
  const u = sim.units;
  const team = sim.teamOf[p];
  const g = goalNodeAt(sim, x, y, team);
  if (!g) return;
  if (queue) {
    for (const s of slots) {
      if (u.state[s] === S.Idle) continue;
      const q = u.waypoints.get(s) ?? [];
      if (q.length < 16) q.push({ x: g.px, y: g.py });
      u.waypoints.set(s, q);
    }
  }
  // Schwerpunkt für Ausrichtung
  let cx = 0;
  let cy = 0;
  for (const s of slots) {
    cx += u.x[s];
    cy += u.y[s];
  }
  cx /= slots.length;
  cy /= slots.length;
  const offs = formationOffsets(slots.length, formation, g.px - cx, g.py - cy);
  slots.forEach((s, i) => {
    if (queue && u.state[s] !== S.Idle) return;
    const [ox, oy] = offs[i];
    let px = g.px + ox;
    let py = g.py + oy;
    const gl = g.node & 1;
    const pt = tileOf(sim, px, py);
    if (gl === 0 && (!sim.nav.groundFree(pt, team) || Math.abs(sim.map.height[pt] - sim.map.height[g.node >> 1]) > 1)) {
      px = g.px;
      py = g.py;
    }
    if (gl === 1 && !(sim.nav.kind[pt] & NK.WallTop)) {
      px = g.px;
      py = g.py;
    }
    u.goal[s] = g.node;
    u.tx[s] = px;
    u.ty[s] = py;
    u.ax[s] = px;
    u.ay[s] = py;
    u.state[s] = attack ? S.AttackMove : S.Move;
    u.flags[s] &= ~(8 | 32 | 64 | 16);
    u.targetKind[s] = 0;
    u.target[s] = 0;
    u.stuck[s] = 0;
    if (!queue) u.waypoints.delete(s);
  });
}

export function orderStop(sim: Sim, p: number, ids: number[]): void {
  const u = sim.units;
  for (const s of ownedSlots(sim, p, ids)) {
    u.state[s] = S.Idle;
    u.targetKind[s] = 0;
    u.target[s] = 0;
    u.goal[s] = -1;
    u.waypoints.delete(s);
    u.ax[s] = u.x[s];
    u.ay[s] = u.y[s];
  }
}

export function orderStance(sim: Sim, p: number, ids: number[], stance: number): void {
  if (stance !== Stance.Hold && stance !== Stance.Defensive && stance !== Stance.Aggressive) return;
  for (const s of ownedSlots(sim, p, ids)) sim.units.stance[s] = stance;
}
