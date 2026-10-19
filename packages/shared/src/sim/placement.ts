import { BT, BUILDINGS } from '../data/buildings';
import { StoreKind } from '../data/resources';
import { T } from '../data/terrain';
import type { GameMap } from '../map/gamemap';

export interface PlaceBld {
  owner: number;
  type: number;
  turret: number;
}

/** Abstrakter Zugriff, damit Sim und Client-Welt dieselbe Platzierungslogik nutzen. */
export interface PlaceCtx {
  map: GameMap;
  bldAt: Int32Array;
  digMask: Uint8Array;
  bld(id: number): PlaceBld | null;
  countOwn(p: number, type: number): number;
  countStoreModules(p: number, kind: StoreKind): number;
}

/** Terrain-, Nachbarschafts- und Sonderregeln. Kosten werden separat geprüft. */
export function checkPlaceRules(ctx: PlaceCtx, p: number, type: number, x: number, y: number, rot: number): string | null {
  const def = BUILDINGS[type];
  if (!def) return 'Ungültig';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Ungültig';
  if (type === BT.Keep || type === BT.Campfire) return 'Nicht baubar';
  const m = ctx.map;
  const at = (xx: number, yy: number): PlaceBld | null => {
    if (!m.inBounds(xx, yy)) return null;
    const id = ctx.bldAt[m.idx(xx, yy)];
    return id ? ctx.bld(id) : null;
  };
  if (def.placement === 'onWall') {
    const b = at(x, y);
    if (!b || b.owner !== p || b.type !== BT.TowerRound || b.turret) return 'Nur auf freien Großen Türmen';
    return null;
  }
  const w = rot ? def.h : def.w;
  const h = rot ? def.w : def.h;
  if (x < 0 || y < 0 || x + w > m.w || y + h > m.h) return 'Außerhalb der Karte';
  if (def.unique && ctx.countOwn(p, type) > 0) return 'Nur einmal baubar';
  let fertile = 0;
  let dep = 0;
  let water = 0;
  const h0 = m.height[m.idx(x, y)];
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = m.idx(xx, yy);
      if (ctx.bldAt[i] !== 0) return 'Platz belegt';
      if (m.trees[i] !== 0) return 'Bäume im Weg';
      const t = m.terrain[i];
      if (def.placement === 'water' && (t === T.Water || t === T.Moat)) {
        water++;
        continue;
      }
      if (!m.walkableTerrain(i)) return 'Ungeeignetes Gelände';
      if (def.placement !== 'any' && def.placement !== 'water' && m.height[i] !== h0) return 'Gelände nicht eben';
      if ((t === T.StoneDeposit || t === T.IronDeposit) && def.placement !== 'any' && def.terrain !== t) return 'Vorkommen nicht überbauen';
      if (t === T.Oasis) fertile++;
      if (def.terrain !== undefined && t === def.terrain) dep++;
      if (ctx.digMask[i]) return 'Graben geplant';
    }
  }
  if (def.placement === 'deposit' && dep < (def.minTiles ?? 1)) return 'Benötigt Vorkommen';
  if (def.placement === 'fertile' && fertile < (def.minTiles ?? 1)) return 'Benötigt fruchtbaren Boden';
  if (def.placement === 'water' && water < (def.minTiles ?? 1)) return 'Muss über Wasser gebaut werden';
  if (def.placement === 'wallAdj') {
    let ok = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const b = at(x + dx, y + dy);
      const bd = b ? BUILDINGS[b.type] : null;
      if (b && bd && b.owner === p && bd.wallTop && !bd.stairs && b.type !== BT.Keep) ok = true;
    }
    if (!ok) return 'Muss an eine Mauer angrenzen';
  }
  if (def.store && ctx.countStoreModules(p, def.store) > 0) {
    let adj = false;
    for (let yy = y - 1; yy <= y + h && !adj; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
        if ((xx < x || xx >= x + w) && (yy < y || yy >= y + h)) continue;
        const b = at(xx, yy);
        if (b && b.owner === p && BUILDINGS[b.type].store === def.store) {
          adj = true;
          break;
        }
      }
    }
    if (!adj) return 'Muss an ein bestehendes Modul angrenzen';
  }
  return null;
}
