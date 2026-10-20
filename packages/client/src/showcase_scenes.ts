import {
  BF,
  BT,
  BUILDINGS,
  BuildingRec,
  ClientBuilding,
  ClientWorld,
  GameMap,
  PROJ,
  PublicPlayer,
  Rng,
  T,
  U,
  UNITS,
  generateMap,
} from '@strongpoly/shared';

/**
 * Vergleichsszenen für Grafikprüfungen (URL `?shots=<szene>`, siehe showcase.ts und scripts/shots.mjs).
 * Alles hier ist rein datengetrieben und deterministisch (feste Seeds, eigener Zufallsgenerator, keine Uhr):
 * dieselbe Szene ergibt immer dieselbe Welt und dieselbe Kamera. Gebäude und Einheiten werden nur als
 * Typ-Nummern beschrieben; gezeichnet wird über die öffentlichen Modellpfade (EntityRenderer), nichts wird dupliziert.
 */

export const SHOW_NAMES = ['early', 'town', 'castle', 'siege', 'figures', 'engines', 'map', 'ground', 'forest', 'water', 'coast', 'deposits'] as const;
export type ShowName = (typeof SHOW_NAMES)[number];

export interface ShowCam {
  /** Blickpunkt in Tile-Koordinaten */
  x: number;
  y: number;
  dist: number;
  /** Blickrichtung (Drehung um die Hochachse, Bogenmaß); 0 = Kamera südlich vom Blickpunkt */
  yaw: number;
  /** Neigung in Grad (Standard im Spiel: 52) */
  pitch: number;
}

export type UnitMode = 'idle' | 'walk' | 'fight' | 'work';

export interface ShowBuilding {
  t: number;
  x: number;
  y: number;
  o: number;
  rot?: number;
  /** Gebäude-Flags (BF) */
  f?: number;
  /** Arbeiter anwesend (Rauch, Mühlenflügel …) */
  s?: number;
}

export interface ShowUnit {
  t: number;
  o: number;
  x: number;
  y: number;
  /** Blickrichtung: Richtung (sin f, cos f) in (x, y) */
  face: number;
  mode: UnitMode;
  /** getragene Ware (Ressourcen-Index + 1), 0 = nichts */
  carry?: number;
  /** 0..255 */
  hp?: number;
}

export interface ShowArrow {
  kind: number;
  owner: number;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  arc: number;
  /** Flugfortschritt 0..1 */
  f: number;
}

export interface ShowSpec {
  name: ShowName;
  seed: number;
  size: number;
  players: number;
  map: GameMap;
  buildings: ShowBuilding[];
  units: ShowUnit[];
  arrows: ShowArrow[];
  cam: ShowCam;
  /** Weltzeit-Tick der Darstellung (Gebäude mit n = 0 sind immer fertig) */
  tick: number;
  /** Nebel-Skalierung für Übersichten */
  fogScale: number;
  /** Kurzbeschreibung */
  desc: string;
}

// ---------------------------------------------------------------- Karten-Suche (rein, deterministisch)

export interface Spot {
  x: number;
  y: number;
  score: number;
}

function window2(map: GameMap, cx: number, cy: number, r: number, f: (i: number) => number): number {
  let s = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (map.inBounds(x, y)) s += f(map.idx(x, y));
  return s;
}

function bestSpot(map: GameMap, margin: number, step: number, score: (x: number, y: number) => number): Spot {
  let best: Spot = { x: map.w >> 1, y: map.h >> 1, score: -1e9 };
  for (let y = margin; y < map.h - margin; y += step)
    for (let x = margin; x < map.w - margin; x += step) {
      const s = score(x, y);
      if (s > best.score) best = { x, y, score: s };
    }
  return best;
}

/** dichtester Wald (Bäume im 13x13-Fenster, ohne Wasser) in angemessenem Abstand zu den Startpunkten */
export function findForest(map: GameMap): Spot {
  return bestSpot(map, 10, 2, (x, y) => {
    const trees = window2(map, x, y, 6, (i) => (map.trees[i] > 0 ? 1 : 0));
    const wet = window2(map, x, y, 6, (i) => (map.terrain[i] === T.Water ? 1 : 0));
    return trees - wet * 2;
  });
}

/** Küstenstück: ungefähr hälftig Wasser und Land im 21x21-Fenster */
export function findCoast(map: GameMap): Spot {
  return bestSpot(map, 12, 2, (x, y) => {
    const n = 21 * 21;
    const water = window2(map, x, y, 10, (i) => (map.terrain[i] === T.Water ? 1 : 0));
    const trees = window2(map, x, y, 10, (i) => (map.trees[i] > 0 ? 1 : 0));
    const frac = water / n;
    return -Math.abs(frac - 0.42) * 100 + Math.min(trees, 30) * 0.15;
  });
}

/** viele Höhenstufen und Fels im Fenster: Klippenlandschaft */
export function findCliffs(map: GameMap): Spot {
  return bestSpot(map, 10, 2, (x, y) => {
    let edges = 0;
    let rock = 0;
    let wet = 0;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (!map.inBounds(px + 1, py) || !map.inBounds(px, py + 1) || !map.inBounds(px, py)) continue;
        const i = map.idx(px, py);
        if (map.terrain[i] === T.Water) wet++;
        if (map.terrain[i] === T.Rock) rock++;
        if (map.height[i] !== map.height[i + 1]) edges++;
        if (map.height[i] !== map.height[i + map.w]) edges++;
      }
    return Math.min(edges, 60) + rock * 0.1 - wet * 0.6;
  });
}

/**
 * Beste Stelle für eine Bebauung: Rechteck x±hw, y−up .. y+down mit möglichst viel Land (Wasser/Fels zählen nicht),
 * vollständig innerhalb der Karte; bei Gleichstand näher an der Kartenmitte.
 */
export function findFlat(map: GameMap, hw: number, up: number, down: number, margin = 26): Spot {
  const m = margin;
  return bestSpot(map, 0, 2, (x, y) => {
    if (x - hw < m || x + hw > map.w - m || y - up < m || y + down > map.h - m) return -1e9;
    let land = 0;
    for (let dy = -up; dy <= down; dy += 2)
      for (let dx = -hw; dx <= hw; dx += 2) {
        const t = map.terrain[map.idx(x + dx, y + dy)];
        if (t !== T.Water && t !== T.Rock) land++;
      }
    return land - Math.hypot(x - map.w / 2, y - map.h / 2) * 0.02;
  });
}

/** Umrandung aller Felder eines Terraintyps im Umkreis r um (x,y); null, wenn keine */
export function terrainBox(map: GameMap, type: number, x: number, y: number, r: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (let ty = Math.max(0, Math.floor(y - r)); ty <= Math.min(map.h - 1, Math.ceil(y + r)); ty++)
    for (let tx = Math.max(0, Math.floor(x - r)); tx <= Math.min(map.w - 1, Math.ceil(x + r)); tx++) {
      if (map.terrain[map.idx(tx, ty)] !== type || Math.hypot(tx - x, ty - y) > r) continue;
      if (!box) box = { x0: tx, y0: ty, x1: tx, y1: ty };
      else {
        box.x0 = Math.min(box.x0, tx);
        box.y0 = Math.min(box.y0, ty);
        box.x1 = Math.max(box.x1, tx);
        box.y1 = Math.max(box.y1, ty);
      }
    }
  return box;
}

/** Schwerpunkt der Vorkommen (Stein, Eisen, Pech) nächster zum Punkt (x,y) */
export function findDeposits(map: GameMap, x: number, y: number): Spot {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let ty = 0; ty < map.h; ty++)
    for (let tx = 0; tx < map.w; tx++) {
      const t = map.terrain[map.idx(tx, ty)];
      if ((t === T.StoneDeposit || t === T.IronDeposit || t === T.PitchSpring) && Math.hypot(tx - x, ty - y) < 26) {
        sx += tx;
        sy += ty;
        n++;
      }
    }
  return n ? { x: sx / n, y: sy / n, score: n } : { x, y, score: 0 };
}

// ---------------------------------------------------------------- Aufbauhelfer

class Plan {
  buildings: ShowBuilding[] = [];
  units: ShowUnit[] = [];
  arrows: ShowArrow[] = [];
  private occ: Uint8Array;
  rng: Rng;
  constructor(
    readonly map: GameMap,
    seed: number,
  ) {
    this.occ = new Uint8Array(map.n);
    this.rng = new Rng(seed);
  }
  size(t: number, rot: number): [number, number] {
    const d = BUILDINGS[t];
    return rot ? [d.h, d.w] : [d.w, d.h];
  }
  free(x: number, y: number, w: number, h: number, margin = 0): boolean {
    for (let j = y - margin; j < y + h + margin; j++)
      for (let i = x - margin; i < x + w + margin; i++) if (this.map.inBounds(i, j) && this.occ[this.map.idx(i, j)]) return false;
    return true;
  }
  /** Gebäude setzen (ohne Prüfung); Rückgabe: belegt */
  put(t: number, x: number, y: number, o = 0, rot = 0, f = 0, s = 1): boolean {
    const [w, h] = this.size(t, rot);
    if (!this.free(x, y, w, h)) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.map.inBounds(i, j)) this.occ[this.map.idx(i, j)] = 1;
    this.buildings.push({ t, x, y, o, rot, f, s });
    return true;
  }
  /** Mauerlinie entlang einer Achse; belegte Felder (Türme, Tore) werden ausgelassen */
  wall(t: number, x0: number, y0: number, x1: number, y1: number, o = 0): void {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) this.put(t, x0 + dx * k, y0 + dy * k, o);
  }
  isFree(x: number, y: number): boolean {
    return this.map.inBounds(x, y) && !this.occ[this.map.idx(x, y)] && this.map.terrain[this.map.idx(x, y)] !== T.Water && this.map.terrain[this.map.idx(x, y)] !== T.Moat;
  }
  unit(t: number, o: number, x: number, y: number, face: number, mode: UnitMode = 'idle', carry = 0, hp = 255): void {
    this.units.push({ t, o, x, y, face, mode, carry, hp });
  }
  /** freies Feld in der Nähe von (cx,cy) im Radius r, deterministisch gewürfelt */
  scatter(cx: number, cy: number, r: number): [number, number] | null {
    for (let k = 0; k < 30; k++) {
      const x = cx + (this.rng.next() * 2 - 1) * r;
      const y = cy + (this.rng.next() * 2 - 1) * r;
      if (this.isFree(Math.floor(x), Math.floor(y))) return [x, y];
    }
    return null;
  }
}

/** Fläche begehbar und eben machen (Höhe 1, keine Bäume); Wasser/Fels/Sumpf werden zu Steppe */
export function flatten(map: GameMap, x0: number, y0: number, x1: number, y1: number, height = 1): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!map.inBounds(x, y)) continue;
      const i = map.idx(x, y);
      const t = map.terrain[i];
      if (t === T.Water || t === T.Rock || t === T.Swamp || t === T.Moat || t === T.StoneDeposit || t === T.IronDeposit || t === T.PitchSpring) map.terrain[i] = T.Steppe;
      map.height[i] = height;
      map.trees[i] = 0;
    }
}

function moatRing(map: GameMap, x0: number, y0: number, x1: number, y1: number, width: number): void {
  for (let y = y0 - width; y <= y1 + width; y++)
    for (let x = x0 - width; x <= x1 + width; x++) {
      if (!map.inBounds(x, y)) continue;
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (inside) continue;
      map.terrain[map.idx(x, y)] = T.Moat;
      map.height[map.idx(x, y)] = 1;
      map.trees[map.idx(x, y)] = 0;
    }
}

/** Burg um (cx, cy): Außenmauer mit Ecktürmen, Torhaus nach Süden, Bergfried und Gebäude im Hof */
function castle(p: Plan, cx: number, cy: number, o: number, opts: { moat: boolean }): void {
  const X0 = cx - 18;
  const X1 = cx + 18;
  const Y0 = cy - 14;
  const Y1 = cy + 14;
  // Türme zuerst (Mauern lassen belegte Felder aus)
  p.put(BT.Keep, cx - 2, cy - 2, o);
  p.put(BT.TowerRound, X0 - 2, Y0 - 2, o);
  p.put(BT.TowerRound, X1 - 1, Y0 - 2, o);
  p.put(BT.TowerRound, X0 - 2, Y1 - 1, o);
  p.put(BT.TowerRound, X1 - 1, Y1 - 1, o);
  p.put(BT.TowerGuard, cx - 1, Y0 - 1, o);
  p.put(BT.TowerGuard, X0 - 1, cy - 1, o);
  p.put(BT.TowerGuard, X1 - 1, cy - 1, o);
  p.put(BT.TowerGuard, cx - 12, Y1 - 1, o);
  p.put(BT.TowerGuard, cx + 10, Y1 - 1, o);
  p.put(BT.GateStone, cx - 2, Y1 - 1, o, 0);
  p.wall(BT.WallHigh, X0, Y0, X1, Y0, o);
  p.wall(BT.WallHigh, X0, Y1, X1, Y1, o);
  p.wall(BT.WallHigh, X0, Y0, X0, Y1, o);
  p.wall(BT.WallHigh, X1, Y0, X1, Y1, o);
  // innerer Ring (niedrige Mauer) mit Holztor
  const ix0 = cx - 8;
  const ix1 = cx + 8;
  const iy0 = cy - 7;
  const iy1 = cy + 7;
  p.put(BT.GateWood, cx - 1, iy1, o, 0);
  p.put(BT.TowerLookout, ix0 - 1, iy0 - 1, o);
  p.put(BT.TowerLookout, ix1 - 0, iy0 - 1, o);
  p.put(BT.TowerLookout, ix0 - 1, iy1 - 0, o);
  p.put(BT.TowerLookout, ix1 - 0, iy1 - 0, o);
  p.wall(BT.WallLow, ix0, iy0, ix1, iy0, o);
  p.wall(BT.WallLow, ix0, iy1, ix1, iy1, o);
  p.wall(BT.WallLow, ix0, iy0, ix0, iy1, o);
  p.wall(BT.WallLow, ix1, iy0, ix1, iy1, o);
  // Hof: Kaserne, Waffenkammer, Stall, Ingenieurszunft, Lager, Kornspeicher …
  p.put(BT.Barracks, X0 + 3, Y0 + 3, o);
  p.put(BT.Armory, X0 + 9, Y0 + 3, o);
  p.put(BT.Stable, X1 - 8, Y0 + 3, o);
  p.put(BT.EngineerGuild, X1 - 7, cy + 2, o);
  p.put(BT.Stockpile, X0 + 3, cy + 4, o);
  p.put(BT.Granary, X0 + 3, cy + 9, o);
  p.put(BT.Hovel, X0 + 9, cy + 10, o);
  p.put(BT.Hovel, X0 + 12, cy + 10, o);
  p.put(BT.Well, cx + 11, cy - 10, o);
  p.put(BT.Statue, cx - 12, cy - 3, o);
  p.put(BT.Chapel, X1 - 9, cy - 8, o);
  p.put(BT.Blacksmith, X1 - 12, cy + 7, o, 0, 0, 1);
  p.put(BT.Cauldron, cx - 3, Y1, o);
  p.put(BT.Cauldron, cx + 2, Y1, o);
  if (opts.moat) {
    moatRing(p.map, X0 - 2, Y0 - 2, X1 + 2, Y1 + 2, 2);
    p.put(BT.Drawbridge, cx - 2, Y1 + 2, o, 0, 0, 1);
  }
}

function peasants(p: Plan, cx: number, cy: number, r: number, n: number, o = 0): void {
  for (let i = 0; i < n; i++) {
    const pos = p.scatter(cx, cy, r);
    if (!pos) continue;
    const m = p.rng.next();
    const mode: UnitMode = m < 0.45 ? 'walk' : m < 0.75 ? 'work' : 'idle';
    p.unit(U.Peasant, o, pos[0], pos[1], p.rng.next() * Math.PI * 2, mode, mode === 'walk' && p.rng.next() < 0.5 ? 1 + p.rng.int(12) : 0);
  }
}

/** Heerblock: Spalten x Reihen, Abstand s, Mittelpunkt (cx,cy), Blickrichtung face */
function block(p: Plan, types: number[], o: number, cx: number, cy: number, cols: number, rows: number, s: number, face: number, mode: UnitMode, hpMin = 255): void {
  const sf = Math.sin(face);
  const cf = Math.cos(face);
  let k = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      // Spalte quer zur Blickrichtung, Reihe entlang
      const lx = (c - (cols - 1) / 2) * s + (p.rng.next() - 0.5) * 0.18;
      const ly = -(r - (rows - 1) / 2) * s + (p.rng.next() - 0.5) * 0.18;
      const x = cx + lx * cf + ly * sf;
      const y = cy - lx * sf + ly * cf;
      const t = types[k++ % types.length];
      const hp = hpMin < 255 && p.rng.next() < 0.35 ? hpMin + p.rng.int(255 - hpMin) : 255;
      p.unit(t, o, x, y, face + (p.rng.next() - 0.5) * 0.2, mode, 0, hp);
    }
}

// ---------------------------------------------------------------- Szenen

const SCENE_SEED = 1;
const MAP_SIZE = 128;

function startOf(map: GameMap, i = 0): { x: number; y: number } {
  return map.starts[i] ?? { x: map.w >> 1, y: map.h >> 1 };
}

export function sceneSpec(name: ShowName, seedOverride?: number): ShowSpec {
  const seed = seedOverride ?? SCENE_SEED;
  const size = name === 'map' ? 160 : MAP_SIZE;
  const players = name === 'map' ? 4 : 2;
  const map = generateMap({ seed, size, players });
  const p = new Plan(map, seed * 7919 + 13);
  const st = startOf(map, 0);
  let cam: ShowCam = { x: st.x, y: st.y, dist: 34, yaw: Math.PI / 4, pitch: 52 };
  let fogScale = 1;
  let desc = '';
  const rngU = p.rng;
  switch (name) {
    case 'early': {
      desc = 'früher Wirtschaftsaufbau: Bergfried, Lager, Holzfäller, Hütten, wenige Bauern';
      const { x, y } = st;
      p.put(BT.Keep, x - 2, y - 2, 0);
      p.put(BT.Stockpile, x + 4, y - 1, 0);
      p.put(BT.Granary, x + 4, y + 3, 0);
      p.put(BT.Woodcutter, x - 8, y - 3, 0, 0, 0, 1);
      p.put(BT.Woodcutter, x - 8, y + 2, 0, 0, 0, 1);
      p.put(BT.Hovel, x - 3, y + 5, 0);
      p.put(BT.Hovel, x - 6, y + 6, 0);
      p.put(BT.Campfire, x - 1, y + 3, 0);
      p.put(BT.WheatFarm, x + 9, y - 2, 0);
      peasants(p, x, y, 8, 14);
      for (let i = 0; i < 3; i++) p.unit(U.Ox, 0, x + 6 + i * 0.8, y + 7.5, 1.0, i === 0 ? 'walk' : 'idle');
      cam = { x: x + 1, y: y + 1, dist: 30, yaw: Math.PI / 4, pitch: 52 };
      break;
    }
    case 'town': {
      desc = 'dicht bebaute Siedlung mit Märkten, Werkstätten, Feldern, Kirche und vielen Bauern';
      const { x, y } = findFlat(map, 26, 20, 20);
      flatten(map, x - 26, y - 20, x + 26, y + 20);
      p.put(BT.Keep, x - 2, y - 2, 0);
      const order: [number, number?][] = [
        [BT.Market], [BT.Church], [BT.Inn], [BT.Mill], [BT.Bakery], [BT.Granary], [BT.Stockpile], [BT.Stockpile], [BT.Brewery],
        [BT.Blacksmith], [BT.Fletcher], [BT.Poleturner], [BT.Tanner], [BT.Armorer], [BT.WheatFarm], [BT.HopFarm], [BT.Chapel],
        [BT.Armory], [BT.Barracks], [BT.Cathedral], [BT.DairyFarm], [BT.Woodcutter], [BT.Woodcutter], [BT.Maypole], [BT.Statue],
        [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Hovel],
        [BT.Well], [BT.Well], [BT.Garden], [BT.Garden], [BT.Gallows], [BT.Stocks], [BT.HunterPost], [BT.OxTether], [BT.AppleOrchard],
        [BT.Hovel], [BT.Hovel], [BT.Hovel], [BT.Well], [BT.Garden], [BT.WaterPot],
      ];
      // Packung nach Entfernung vom Bergfried: die Siedlung wächst von innen nach außen (Gassen von 1 Feld)
      const cands: [number, number][] = [];
      for (let yy = y - 18; yy <= y + 18; yy++) for (let xx = x - 24; xx <= x + 24; xx++) cands.push([xx, yy]);
      cands.sort((a, b) => Math.hypot(a[0] - x, (a[1] - y) * 1.3) - Math.hypot(b[0] - x, (b[1] - y) * 1.3) || a[1] - b[1] || a[0] - b[0]);
      for (const [t] of order) {
        const d = BUILDINGS[t];
        const staffed = d.prod || d.id === BT.Inn ? 1 : 0;
        for (const [xx, yy] of cands) {
          if (p.free(xx, yy, d.w, d.h, 1) && !(xx + d.w > x - 3 && xx < x + 4 && yy + d.h > y - 3 && yy < y + 4)) {
            p.put(t, xx, yy, 0, 0, 0, staffed);
            break;
          }
        }
      }
      peasants(p, x, y, 22, 80);
      for (let i = 0; i < 12; i++) {
        const pos = p.scatter(x, y, 18);
        if (pos) p.unit([U.Spearman, U.Swordsman, U.Archer][i % 3], 0, pos[0], pos[1], rngU.next() * 6.28, i % 2 ? 'walk' : 'idle');
      }
      for (let i = 0; i < 4; i++) {
        const pos = p.scatter(x, y, 16);
        if (pos) p.unit(U.Ox, 0, pos[0], pos[1], rngU.next() * 6.28, i % 2 ? 'walk' : 'idle');
      }
      cam = { x: x + 1, y: y + 2, dist: 42, yaw: Math.PI / 4, pitch: 52 };
      break;
    }
    case 'castle': {
      desc = 'große Steinburg mit Ring- und Außenmauer, Ecktürmen, Torhaus, Graben und Hofgebäuden';
      const { x, y } = findFlat(map, 30, 24, 26);
      flatten(map, x - 30, y - 24, x + 30, y + 26);
      castle(p, x, y, 0, { moat: true });
      block(p, [U.Swordsman, U.Spearman, U.Maceman], 0, x - 14, y - 8, 6, 4, 0.85, 0.3, 'idle');
      block(p, [U.Archer, U.Crossbowman], 0, x + 8, y + 10, 8, 2, 0.8, Math.PI, 'idle');
      p.unit(U.Lord, 0, x, y + 3.2, 0, 'idle');
      for (let i = 0; i < 4; i++) p.unit(U.Knight, 0, x - 6 + i * 1.4, y + 9, 0.2, 'idle');
      peasants(p, x, y, 14, 18);
      cam = { x: x, y: y + 4, dist: 52, yaw: Math.PI / 4, pitch: 50 };
      break;
    }
    case 'siege': {
      desc = 'Belagerung: Burg mit Verteidigern, mehrere hundert Angreifer mit Rammböcken, Belagerungstürmen, Katapulten';
      const { x, y } = findFlat(map, 34, 26, 58, 12);
      flatten(map, x - 34, y - 26, x + 34, y + 58);
      castle(p, x, y, 0, { moat: false });
      // Verteidiger hinter der Südmauer, einige verwundet
      block(p, [U.Archer, U.Crossbowman, U.Archer], 0, x, y + 11.5, 22, 2, 1.0, Math.PI, 'fight', 90);
      block(p, [U.Swordsman, U.Maceman, U.Spearman], 0, x, y + 8.4, 8, 3, 0.9, Math.PI, 'fight', 80);
      p.unit(U.Lord, 0, x + 1, y + 6, Math.PI, 'fight');
      // Angreifer (Spieler 1) vor der Südmauer
      const gy = y + 18;
      block(p, [U.ArabSwordsman, U.Slave, U.ArabSwordsman, U.Assassin], 1, x - 1, gy + 4, 18, 5, 0.85, Math.PI, 'fight', 80);
      block(p, [U.Spearman, U.Swordsman, U.Maceman, U.Pikeman], 1, x - 12, gy + 11, 14, 6, 0.85, Math.PI, 'walk');
      block(p, [U.Swordsman, U.Spearman, U.Maceman], 1, x + 11, gy + 11, 14, 6, 0.85, Math.PI, 'walk');
      block(p, [U.Slinger, U.Archer, U.Crossbowman, U.Slinger], 1, x, gy + 20, 24, 3, 0.9, Math.PI, 'fight');
      block(p, [U.Knight, U.HorseArcher, U.Knight], 1, x - 22, gy + 8, 6, 2, 1.7, Math.PI, 'walk');
      block(p, [U.Laddermen, U.Laddermen, U.Laddermen, U.Engineer], 1, x - 7, gy + 0.8, 10, 1, 0.9, Math.PI, 'fight');
      for (const [t, dx, dy, mode] of [
        [U.Ram, -2.5, 1.5, 'fight'], [U.Ram, 2.0, 1.2, 'fight'], [U.Ram, 8.0, 2.5, 'walk'],
        [U.SiegeTower, -12, 4, 'walk'], [U.SiegeTower, 14, 4, 'walk'],
        [U.Catapult, -8, 24, 'fight'], [U.Catapult, 4, 25, 'fight'], [U.Trebuchet, 11, 26, 'fight'], [U.Trebuchet, -16, 26, 'fight'],
        [U.Mantlet, -5, 5.5, 'walk'], [U.Mantlet, 5, 5.5, 'walk'], [U.Mantlet, 11, 6, 'walk'],
        [U.FireBallista, -18, 18, 'fight'],
      ] as [number, number, number, UnitMode][])
        p.unit(t, 1, x + dx, gy + dy, Math.PI, mode);
      // Pfeile im Flug (Angreifer -> Mauer und zurück) und Steine
      for (let i = 0; i < 70; i++) {
        const fromAttacker = i % 2 === 0;
        const sx = x + (rngU.next() - 0.5) * 36;
        const sy = fromAttacker ? gy + 20 : y + 11;
        const ex = x + (rngU.next() - 0.5) * 30;
        const ey = fromAttacker ? y + 14 : gy + 4;
        p.arrows.push({ kind: i % 11 === 0 ? PROJ.FireArrow : i % 5 === 0 ? PROJ.Bolt : PROJ.Arrow, owner: fromAttacker ? 1 : 0, sx, sy, ex, ey, arc: 3 + rngU.next() * 2, f: 0.15 + rngU.next() * 0.7 });
      }
      for (let i = 0; i < 4; i++) p.arrows.push({ kind: PROJ.Boulder, owner: 1, sx: x - 8 + i * 6, sy: gy + 24, ex: x - 6 + i * 4, ey: y + 6, arc: 8, f: 0.3 + i * 0.17 });
      // eine brennende Hütte im Hof
      p.buildings.push({ t: BT.Hovel, x: x - 15, y: y + 6, o: 0, rot: 0, f: BF.Burning, s: 0 });
      cam = { x: x + 2, y: y + 19, dist: 37, yaw: Math.PI / 4 + 0.2, pitch: 42 };
      break;
    }
    case 'figures': {
      desc = 'Detailansicht: Zivilisten und Soldaten in Ruhe, beim Gehen, im Kampf und bei der Arbeit';
      const { x, y } = findFlat(map, 14, 10, 10);
      flatten(map, x - 14, y - 10, x + 14, y + 10);
      const lineup = [U.Peasant, U.Peasant, U.Lord, U.Archer, U.Crossbowman, U.Spearman, U.Pikeman, U.Maceman, U.Swordsman, U.Knight, U.Monk];
      const lineup2 = [U.Slave, U.Slinger, U.HorseArcher, U.ArabSwordsman, U.Assassin, U.Firethrower, U.Engineer, U.Laddermen, U.Tunneler, U.Ox, U.Peasant];
      const modes: UnitMode[] = ['idle', 'walk', 'fight', 'work'];
      for (let r = 0; r < 2; r++) {
        const list = r === 0 ? lineup : lineup2;
        for (let k = 0; k < list.length; k++) {
          const mode = r === 0 ? (k === 1 ? 'work' : k % 3 === 1 ? 'walk' : k % 3 === 2 ? 'fight' : 'idle') : modes[(k + 1) % 4];
          p.unit(list[k], r === 0 ? 0 : 1, x - 7.5 + k * 1.5, y - 1.6 + r * 3.2, 0.25, mode, k === 0 && r === 0 ? 1 : k === 1 && r === 0 ? 2 : 0);
        }
      }
      for (let k = 0; k < 7; k++) p.unit([U.Peasant, U.Swordsman, U.Archer, U.Spearman, U.Knight, U.Monk, U.Maceman][k], k % 2, x - 5 + k * 1.7, y + 4.8, 0.25, 'idle', 0, k === 3 ? 90 : 255);
      cam = { x, y: y + 0.8, dist: 11.5, yaw: 0.25, pitch: 34 };
      break;
    }
    case 'engines': {
      desc = 'Belagerungsgerät aus der Nähe: Katapult, Trebuchet, Rammbock, Belagerungsturm, Setzschild, Feuerballista';
      const { x, y } = findFlat(map, 16, 8, 8);
      flatten(map, x - 16, y - 8, x + 16, y + 8);
      const list = [U.Catapult, U.Trebuchet, U.Ram, U.SiegeTower, U.Mantlet, U.FireBallista];
      const xs = [-11, -5.6, -0.8, 4.4, 9, 12.5];
      list.forEach((t, k) => {
        p.unit(t, 0, x + xs[k], y - 1.5, 0.3, k % 2 ? 'fight' : 'idle');
        p.unit(t, 1, x + xs[k], y + 4.6, 0.3, k % 2 ? 'idle' : 'walk');
      });
      cam = { x: x + 0.5, y: y + 1.6, dist: 19, yaw: 0.25, pitch: 36 };
      break;
    }
    case 'map': {
      desc = 'Übersicht einer vollständigen Spielkarte (160x160, 4 Spieler) mit Startsiedlungen';
      for (let i = 0; i < map.starts.length; i++) {
        const s = map.starts[i];
        p.put(BT.Keep, s.x - 2, s.y - 2, i);
        p.put(BT.Stockpile, s.x + 4, s.y - 1, i);
        p.put(BT.Granary, s.x + 4, s.y + 3, i);
        p.put(BT.Woodcutter, s.x - 8, s.y - 3, i, 0, 0, 1);
        p.put(BT.Hovel, s.x - 3, s.y + 5, i);
        p.put(BT.Hovel, s.x - 6, s.y + 6, i);
        p.put(BT.WheatFarm, s.x + 9, s.y - 2, i);
        p.put(BT.WallHigh, s.x - 5, s.y - 9, i);
        peasants(p, s.x, s.y, 8, 8, i);
      }
      cam = { x: map.w / 2, y: map.h / 2 + 4, dist: 188, yaw: Math.PI / 4, pitch: 58 };
      fogScale = 2.6;
      break;
    }
    case 'ground': {
      desc = 'Nahansicht Boden: Steppe, Oase, Wüste, Übergänge, Wege und Feld bei den ersten Gebäuden';
      const { x, y } = st;
      const mx = x <= map.w / 2 ? 1 : -1;
      const my = y <= map.h / 2 ? 1 : -1;
      const ox = x - 9 * mx;
      const oy = y + 6 * my;
      p.put(BT.Stockpile, ox + 5 * mx - 1, oy - 5 * my - 1, 0);
      p.put(BT.Hovel, ox + 8 * mx - 1, oy + 1 * my - 1, 0);
      p.put(BT.Woodcutter, ox + 3 * mx - 1, oy + 6 * my - 1, 0, 0, 0, 1);
      p.put(BT.WheatFarm, ox + 13 * mx - 2, oy - 6 * my - 2, 0);
      peasants(p, ox + 5 * mx, oy, 5, 6);
      cam = { x: ox + 5 * mx, y: oy - 1 * my, dist: 17, yaw: Math.PI / 4, pitch: 46 };
      break;
    }
    case 'forest': {
      desc = 'Nahansicht Wald: dichteste Baumgruppe der Karte';
      const f = findForest(map);
      cam = { x: f.x, y: f.y, dist: 20, yaw: Math.PI / 4, pitch: 46 };
      break;
    }
    case 'water': {
      desc = 'Nahansicht Wasser: Gewässer mit Ufer und Schaum, Graben mit Pech';
      const c = findCoast(map);
      cam = { x: c.x, y: c.y, dist: 20, yaw: Math.PI / 4 + Math.PI / 2, pitch: 40 };
      break;
    }
    case 'coast': {
      desc = 'Küste und Klippen aus mittlerer Entfernung';
      const c = findCoast(map);
      cam = { x: c.x, y: c.y, dist: 44, yaw: Math.PI / 4, pitch: 50 };
      break;
    }
    case 'deposits': {
      desc = 'Rohstoffvorkommen: Steinbruch auf dem Steinvorkommen, daneben Eisen und Pech';
      const sb = terrainBox(map, T.StoneDeposit, st.x, st.y, 26);
      const ib = terrainBox(map, T.IronDeposit, st.x, st.y, 26);
      const pb = terrainBox(map, T.PitchSpring, st.x, st.y, 26);
      if (sb) p.put(BT.Quarry, sb.x0, sb.y0, 0, 0, 0, 1);
      if (ib) p.put(BT.IronMine, ib.x0, ib.y0, 0, 0, 0, 1);
      if (pb) p.put(BT.PitchRig, pb.x0 + 1, pb.y0 + 1, 0, 0, 0, 1);
      if (sb) p.put(BT.OxTether, sb.x0 - 3, sb.y0 + 4, 0, 0, 0, 0);
      const c = sb ? { x: (sb.x0 + sb.x1) / 2 + 1, y: (sb.y0 + sb.y1) / 2 + 1 } : findDeposits(map, st.x, st.y);
      cam = { x: c.x, y: c.y, dist: 21, yaw: Math.PI / 4, pitch: 46 };
      break;
    }
  }
  return { name, seed, size, players, map, buildings: p.buildings, units: p.units, arrows: p.arrows, cam, tick: 5000, fogScale, desc };
}

// ---------------------------------------------------------------- Welt aus Spezifikation

export interface ShowWorld {
  world: ClientWorld;
}

/** Baut den ClientWorld-Spiegel (derselbe Weg wie im Spiel, nur ohne Sim) */
export function buildShowWorld(spec: ShowSpec): ClientWorld {
  const w = new ClientWorld();
  const map = spec.map;
  w.map = map;
  w.bldAt = new Int32Array(map.n);
  w.digMask = new Uint8Array(map.n);
  w.tileChanges.push(-1);
  w.tick = spec.tick;
  const players: PublicPlayer[] = [];
  for (let i = 0; i < spec.players; i++) {
    const s = map.starts[i] ?? { x: map.w >> 1, y: map.h >> 1 };
    players.push({ id: i, name: `Spieler ${i + 1}`, team: i, color: i, kind: 'ai', alive: true, keepX: s.x, keepY: s.y });
  }
  w.players = players;
  let id = 1;
  for (const b of spec.buildings) {
    const rec: BuildingRec = { i: id++, t: b.t, o: b.o, x: b.x, y: b.y, r: b.rot ?? 0, hp: BUILDINGS[b.t].hp, f: b.f ?? 0, u: 0, q: 0, s: b.s ?? 0, c: 0, b: 0, p: 0, n: 0 };
    const cb = rec as ClientBuilding;
    w.placeBuilding(cb);
    w.buildings.set(rec.i, cb);
  }
  w.buildingsDirty = true;
  // Einheiten (Slot = Reihenfolge, Generation 1)
  let s = 0;
  for (const u of spec.units) {
    if (s >= w.ids.length) break;
    w.ids[s] = (1 << 13) | s;
    w.type[s] = u.t;
    w.owner[s] = u.o;
    w.flags[s] = u.mode === 'walk' ? 4 : 0;
    const hp = u.hp ?? 255;
    w.hp[s] = hp;
    w.state[s] = 0;
    w.carry[s] = u.carry ?? 0;
    w.aux[s] = u.mode === 'fight' ? 1 : u.mode === 'work' ? 2 : 0;
    w.face[s] = ((u.face % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    w.prevX[s] = w.curX[s] = u.x;
    w.prevY[s] = w.curY[s] = u.y;
    s++;
  }
  w.top = s;
  // eingefrorene Projektile im Snapshot-Format (kind, owner, x, y, z, dx, dy, dz)
  const arr = new Float32Array(spec.arrows.length * 8);
  let o = 0;
  for (const a of spec.arrows) {
    const at = (f: number): [number, number, number] => [a.sx + (a.ex - a.sx) * f, a.sy + (a.ey - a.sy) * f, 0.9 + (0.4 - 0.9) * f + a.arc * 4 * f * (1 - f)];
    const p0 = at(a.f);
    const p1 = at(Math.min(1, a.f + 0.04));
    arr[o++] = a.kind;
    arr[o++] = a.owner;
    arr[o++] = p0[0];
    arr[o++] = p0[1];
    arr[o++] = p0[2];
    arr[o++] = p1[0] - p0[0];
    arr[o++] = p1[1] - p0[1];
    arr[o++] = p1[2] - p0[2];
  }
  w.proj = arr;
  return w;
}

/** Stabiler Prüfwert einer Szene (Geländehöhen/-typen, Gebäude, Einheiten, Kamera) für Determinismus-Tests */
export function specHash(spec: ShowSpec): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number): void => {
    h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619) >>> 0;
  };
  const m = spec.map;
  for (let i = 0; i < m.n; i++) {
    mix(m.terrain[i]);
    mix(m.height[i]);
    mix(m.trees[i]);
  }
  for (const b of spec.buildings) [b.t, b.x, b.y, b.o, b.rot ?? 0, b.f ?? 0].forEach(mix);
  for (const u of spec.units) [u.t, u.o, u.x, u.y, u.face, u.carry ?? 0, u.hp ?? 255].forEach(mix);
  for (const a of spec.arrows) [a.kind, a.sx, a.sy, a.ex, a.ey, a.f].forEach(mix);
  [spec.cam.x, spec.cam.y, spec.cam.dist, spec.cam.yaw, spec.cam.pitch].forEach(mix);
  return h;
}

void UNITS;
