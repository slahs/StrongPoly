import { BT, BUILDINGS, Command, Formation, GameMap, U } from '@strongpoly/shared';

/**
 * Reproduzierbare Bewegungs-Prüfszenen (Meilenstein 4A). Dieselben Szenen laufen headless
 * (bench/motion.ts, Messung) und im Browser (`?quick=1&dev=1&motion=<id>`, Sichtprüfung).
 * Eine Szene benutzt nur diese kleine Schnittstelle, damit beide Treiber austauschbar sind.
 */
export interface SceneApi {
  map: GameMap;
  /** Gebäude-ID auf dem Tile (0 = frei) */
  bldAt(i: number): number;
  /** Bergfried-Mitte des Spielers 0 */
  home: { x: number; y: number };
  /** Einheiten von Spieler 0 in einem Raster ab (x, y), Abstand 0,7 Tiles */
  spawn(type: number, x: number, y: number, n: number, stance?: number): void;
  /** Gebäude ohne Kosten/Prüfung (Dev-Befehl) */
  build(type: number, x: number, y: number, rot?: number): void;
  /** Befehl an alle Einheiten von Spieler 0 im Rechteck [x0, y0, x1, y1] (optional nur bestimmte Typen) */
  order(rect: [number, number, number, number], mk: (ids: number[]) => Command, types?: number[]): void;
}

export interface MotionScene {
  id: string;
  title: string;
  /** Länge der Szene in Sim-Ticks */
  ticks: number;
  /** Aufbau, liefert den Kamerafokus */
  setup(api: SceneApi): { x: number; y: number };
  /** Skript je Tick (Befehle zu bestimmten Zeitpunkten) */
  step?(api: SceneApi, tick: number): void;
}

/** Sucht spiralförmig ab (nx, ny) ein ebenes, freies Rechteck w × h und liefert seine linke obere Ecke. */
export function findFree(api: SceneApi, w: number, h: number, nx: number, ny: number, maxR = 40, margin = 1): { x: number; y: number } | null {
  const m = api.map;
  const ok = (x0: number, y0: number): boolean => {
    if (x0 - margin < 1 || y0 - margin < 1 || x0 + w + margin >= m.w - 1 || y0 + h + margin >= m.h - 1) return false;
    const h0 = m.height[m.idx(x0, y0)];
    for (let y = y0 - margin; y < y0 + h + margin; y++)
      for (let x = x0 - margin; x < x0 + w + margin; x++) {
        const i = m.idx(x, y);
        if (!m.walkable(i) || api.bldAt(i) || m.height[i] !== h0) return false;
      }
    return true;
  };
  for (let r = 0; r < maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(nx) + dx;
        const y = Math.round(ny) + dy;
        if (ok(x, y)) return { x, y };
      }
  return null;
}

const fp = (x: number, y: number): { x: number; y: number } => ({ x, y });

/** viele Bauern und Arbeitsgebäude rund um den Bergfried: Gedränge am Lagerfeuer, Wege zu Speicher und Lager */
const pawns: MotionScene = {
  id: 'pawns',
  title: 'Viele Bauern vor dem Bergfried',
  ticks: 1200,
  setup(api) {
    const { x, y } = api.home;
    const farms = [BT.AppleOrchard, BT.AppleOrchard, BT.AppleOrchard, BT.DairyFarm, BT.AppleOrchard, BT.DairyFarm];
    farms.forEach((t, k) => {
      const d = BUILDINGS[t];
      const a = (k / farms.length) * Math.PI * 2 + 0.4;
      const p = findFree(api, d.w, d.h, x + Math.cos(a) * 11, y + Math.sin(a) * 11);
      if (p) api.build(t, p.x, p.y);
    });
    api.spawn(U.Peasant, x - 5, y + 5, 36, 0);
    return fp(x, y + 2);
  },
};

/** Arbeiter mit Waren: weit entfernte Farmen, lange Trageetappen zum Kornspeicher */
const haul: MotionScene = {
  id: 'haul',
  title: 'Arbeiter mit Waren',
  ticks: 1500,
  setup(api) {
    const { x, y } = api.home;
    for (let k = 0; k < 6; k++) {
      const t = k % 2 ? BT.DairyFarm : BT.AppleOrchard;
      const d = BUILDINGS[t];
      const a = (k / 6) * Math.PI * 2;
      const p = findFree(api, d.w, d.h, x + Math.cos(a) * 18, y + Math.sin(a) * 18);
      if (p) api.build(t, p.x, p.y);
    }
    api.spawn(U.Peasant, x - 4, y + 5, 24, 0);
    return fp(x, y + 2);
  },
};

/** Mauer mit enger Tordurchfahrt, Gegenverkehr von Soldaten und Bauern */
const gate: MotionScene = {
  id: 'gate',
  title: 'Enges Tor',
  ticks: 1000,
  setup(api) {
    const { x, y } = api.home;
    const W = 21;
    const f = findFree(api, W, 18, x + 4, y + 10, 50, 0);
    const x0 = f ? f.x : Math.round(x) + 4;
    const y0 = f ? f.y : Math.round(y) + 10;
    const wy = y0 + 8;
    const gx = x0 + (W >> 1) - 1;
    for (let k = 0; k < W; k++) if (k < gx - x0 || k > gx - x0 + 2) api.build(BT.WallHigh, x0 + k, wy);
    api.build(BT.GateWood, gx, wy);
    api.spawn(U.Spearman, gx - 3, y0 + 1, 28, 2);
    api.spawn(U.Peasant, gx - 2, y0 + 16, 16, 2);
    gateCenter = { x: gx + 1.5, y: wy + 1 };
    gateBox = { x0, y0 };
    return fp(gx + 1.5, wy + 1);
  },
  step(api, tick) {
    const g = gateBox;
    if (!g) return;
    const rect: [number, number, number, number] = [g.x0 - 2, g.y0 - 2, g.x0 + 24, g.y0 + 20];
    const north = g.y0 + 2;
    const south = g.y0 + 15;
    if (tick === 2 || tick === 340 || tick === 680) {
      const down = tick !== 340;
      api.order(rect, (ids) => ({ c: 'move', units: ids, x: gateCenter.x, y: down ? south : north }), [U.Spearman]);
      api.order(rect, (ids) => ({ c: 'move', units: ids, x: gateCenter.x + 1, y: down ? north : south }), [U.Peasant]);
    }
  },
};
let gateCenter = { x: 0, y: 0 };
let gateBox: { x0: number; y0: number } | null = null;

/** Soldaten in Formation, mehrere Richtungswechsel */
const formation: MotionScene = {
  id: 'formation',
  title: 'Soldaten in Formation',
  ticks: 1000,
  setup(api) {
    const { x, y } = api.home;
    const f = findFree(api, 30, 22, x + 4, y + 14, 50, 0);
    const bx = (f ? f.x : Math.round(x)) + 4;
    const by = (f ? f.y : Math.round(y)) + 4;
    api.spawn(U.Spearman, bx, by, 24, 0);
    api.spawn(U.Swordsman, bx, by + 6, 24, 0);
    formBase = { x: bx, y: by };
    return fp(bx + 8, by + 6);
  },
  step(api, tick) {
    const b = formBase;
    if (!b) return;
    const pts: [number, number, number][] = [
      [2, b.x + 20, b.y + 2],
      [220, b.x + 20, b.y + 14],
      [440, b.x + 4, b.y + 12],
      [660, b.x + 12, b.y + 2],
    ];
    const forms = [Formation.Line, Formation.Box, Formation.Wedge, Formation.Line];
    pts.forEach(([t, px, py], k) => {
      if (tick === t) api.order([b.x - 30, b.y - 20, b.x + 40, b.y + 40], (ids) => ({ c: 'move', units: ids, x: px, y: py, formation: forms[k] }), [U.Spearman, U.Swordsman]);
    });
  },
};
let formBase: { x: number; y: number } | null = null;

/** Mauerkrone: Aufstieg über Treppen, Marsch auf der Mauer, Abstieg */
const stairs: MotionScene = {
  id: 'stairs',
  title: 'Treppen und Mauern',
  ticks: 900,
  setup(api) {
    const { x, y } = api.home;
    const W = 14;
    const f = findFree(api, W + 2, 12, x + 4, y + 12, 50, 0);
    const x0 = (f ? f.x : Math.round(x)) + 1;
    const y0 = (f ? f.y : Math.round(y)) + 5;
    for (let k = 0; k < W; k++) api.build(BT.WallHigh, x0 + k, y0);
    api.build(BT.Stairs, x0 - 1, y0);
    api.build(BT.Stairs, x0 + W, y0);
    api.spawn(U.Spearman, x0 - 4, y0 - 4, 12, 0);
    stairBase = { x0, y0, W };
    return fp(x0 + W / 2, y0 + 1);
  },
  step(api, tick) {
    const s = stairBase;
    if (!s) return;
    const rect: [number, number, number, number] = [s.x0 - 8, s.y0 - 8, s.x0 + s.W + 8, s.y0 + 8];
    if (tick === 2) api.order(rect, (ids) => ({ c: 'move', units: ids, x: s.x0 + s.W - 2.5, y: s.y0 + 0.5 }));
    if (tick === 330) api.order(rect, (ids) => ({ c: 'move', units: ids, x: s.x0 + 2.5, y: s.y0 + 0.5 }));
    if (tick === 560) api.order(rect, (ids) => ({ c: 'move', units: ids, x: s.x0 + s.W + 3, y: s.y0 + 5 }));
  },
};
let stairBase: { x0: number; y0: number; W: number } | null = null;

/** große Ansammlung: zwei Heere kreuzen sich, dazu Bauern */
const crowd: MotionScene = {
  id: 'crowd',
  title: 'Große Ansammlung',
  ticks: 900,
  setup(api) {
    const { x, y } = api.home;
    const f = findFree(api, 34, 20, x + 6, y + 12, 50, 0);
    const bx = (f ? f.x : Math.round(x)) + 2;
    const by = (f ? f.y : Math.round(y)) + 2;
    api.spawn(U.Spearman, bx, by, 80, 0);
    api.spawn(U.Swordsman, bx, by + 8, 60, 0);
    api.spawn(U.Archer, bx + 24, by, 60, 0);
    api.spawn(U.Pikeman, bx + 24, by + 8, 50, 0);
    api.spawn(U.Peasant, bx + 12, by + 14, 30, 0);
    crowdBase = { x: bx, y: by };
    return fp(bx + 14, by + 8);
  },
  step(api, tick) {
    const b = crowdBase;
    if (!b) return;
    const rect: [number, number, number, number] = [b.x - 10, b.y - 10, b.x + 50, b.y + 40];
    if (tick === 2) {
      api.order(rect, (ids) => ({ c: 'move', units: ids, x: b.x + 26, y: b.y + 4 }), [U.Spearman, U.Swordsman]);
      api.order(rect, (ids) => ({ c: 'move', units: ids, x: b.x + 2, y: b.y + 4 }), [U.Archer, U.Pikeman]);
      api.order(rect, (ids) => ({ c: 'move', units: ids, x: b.x + 14, y: b.y + 4 }), [U.Peasant]);
    }
    if (tick === 400) api.order(rect, (ids) => ({ c: 'move', units: ids, x: b.x + 14, y: b.y + 10 }));
  },
};
let crowdBase: { x: number; y: number } | null = null;

export const MOTION_SCENES: MotionScene[] = [pawns, gate, formation, haul, stairs, crowd];

export function motionScene(id: string): MotionScene | undefined {
  return MOTION_SCENES.find((s) => s.id === id);
}
