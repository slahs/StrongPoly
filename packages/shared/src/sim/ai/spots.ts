import { BUILDINGS } from '../../data/buildings';
import type { Sim } from '../sim';

/** Offsets innerhalb Radius R, nach Abstand sortiert (einmal berechnet) */
let OFFSETS: [number, number][] | null = null;
export const SPOT_RADIUS = 36;
function offsets(): [number, number][] {
  if (OFFSETS) return OFFSETS;
  const l: [number, number][] = [];
  for (let dy = -SPOT_RADIUS; dy <= SPOT_RADIUS; dy++)
    for (let dx = -SPOT_RADIUS; dx <= SPOT_RADIUS; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= SPOT_RADIUS * SPOT_RADIUS) l.push([dx, dy]);
    }
  l.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
  OFFSETS = l;
  return l;
}

export interface SpotRules {
  /** Keep-Mittelpunkt */
  kx: number;
  ky: number;
  ring: number;
  /** Mindestabstand (Chebyshev) zum Keep-Mittelpunkt */
  minD?: number;
  /** nur innerhalb des Rings */
  inside?: boolean;
  /** nur außerhalb des Rings */
  outside?: boolean;
  margin?: boolean;
}

/** Sucht einen gültigen Bauplatz nahe (ax, ay). Gibt Top-Left oder null. */
export function findSpot(sim: Sim, p: number, type: number, ax: number, ay: number, rules: SpotRules, startSkip = 0): { x: number; y: number } | null {
  const def = BUILDINGS[type];
  const w = def.w;
  const h = def.h;
  const m = sim.map;
  const offs = offsets();
  const { kx, ky, ring } = rules;
  let checked = 0;
  // Um Lagermodule 3 Tiles frei halten, damit sie erweiterbar bleiben
  const storeRects: [number, number, number, number][] = [];
  if (!def.store) {
    for (const b of sim.buildings.values()) if (b.owner === p && b.def.store) storeRects.push([b.x - 3, b.y - 3, b.x + b.w + 2, b.y + b.h + 2]);
  }
  for (let i = startSkip; i < offs.length; i++) {
    const x = Math.round(ax - w / 2) + offs[i][0];
    const y = Math.round(ay - h / 2) + offs[i][1];
    if (x < 1 || y < 1 || x + w >= m.w - 1 || y + h >= m.h - 1) continue;
    if (++checked > 2600) return null;
    const d = Math.max(Math.abs(x + w / 2 - kx), Math.abs(y + h / 2 - ky));
    if (rules.minD !== undefined && d < rules.minD) continue;
    // Ringband für Mauern reservieren
    const x0 = Math.min(Math.abs(x - kx), Math.abs(x + w - 1 - kx));
    const farX = Math.max(Math.abs(x - kx), Math.abs(x + w - 1 - kx));
    const farY = Math.max(Math.abs(y - ky), Math.abs(y + h - 1 - ky));
    const far = Math.max(farX, farY);
    const near = Math.min(x0, Math.min(Math.abs(y - ky), Math.abs(y + h - 1 - ky)));
    void near;
    const spansBand = far >= ring - 1 && minCheb(x, y, w, h, kx, ky) <= ring + 3;
    if (spansBand) continue;
    const inside = far < ring - 1;
    if (rules.inside && !inside) continue;
    if (rules.outside && inside) continue;
    // Kreuzkorridore frei halten (Wege zu den Toren)
    if (d <= ring + 14 && (rectHitsBand(x, y, w, h, kx, 1, true) || rectHitsBand(x, y, w, h, ky, 1, false))) continue;
    if (storeRects.some(([x0, y0, x1, y1]) => x <= x1 && x + w - 1 >= x0 && y <= y1 && y + h - 1 >= y0)) continue;
    if (sim.checkPlace(p, type, x, y, 0, true)) continue;
    if (rules.margin !== false && !def.store && !hasMargin(sim, x, y, w, h)) continue;
    return { x, y };
  }
  return null;
}

function minCheb(x: number, y: number, w: number, h: number, kx: number, ky: number): number {
  const dx = x > kx ? x - kx : x + w - 1 < kx ? kx - (x + w - 1) : 0;
  const dy = y > ky ? y - ky : y + h - 1 < ky ? ky - (y + h - 1) : 0;
  return Math.max(dx, dy);
}

function rectHitsBand(x: number, y: number, w: number, h: number, c: number, half: number, vertical: boolean): boolean {
  if (vertical) return x <= c + half && x + w - 1 >= c - half;
  return y <= c + half && y + h - 1 >= c - half;
}

function hasMargin(sim: Sim, x: number, y: number, w: number, h: number): boolean {
  const m = sim.map;
  let free = 0;
  let total = 0;
  for (let yy = y - 1; yy <= y + h; yy++)
    for (let xx = x - 1; xx <= x + w; xx++) {
      if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
      if (!m.inBounds(xx, yy)) return false;
      const i = m.idx(xx, yy);
      if (sim.bldAt[i]) return false;
      total++;
      if (m.trees[i] === 0 && m.walkableTerrain(i)) free++;
    }
  // Zugang darf nicht zugewachsen sein (Wald/Wasser)
  return free >= total * 0.6;
}
