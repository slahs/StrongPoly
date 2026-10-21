import { BT, BUILDINGS, GameMap, Rng, T, TREE_WOOD, U, generateMap } from '@strongpoly/shared';
import { flatten } from './showcase_scenes';
import { polylineSegs } from './render/env/envmap';
import type { RoadSeg } from './render/env/envmap';
import type { PropPlacement } from './render/env/veg_layer';
import type { ShowBuilding, ShowCam, ShowSpec, ShowUnit, UnitMode } from './showcase_scenes';

/**
 * Referenzsiedlung der LookDev-Umgebung (`?lookdev=medieval`, siehe lookdev.ts). Alles kommt aus der Datentabelle
 * LOOKDEV_LAYOUT (Koordinaten relativ zur Siedlungsmitte, Tiles; x nach Osten, y nach Süden = Front der Gebäude bei rot 0):
 * gezeichnet wird über den echten EntityRenderer – sobald ein GLB-Asset für einen Gebäude-/Einheitentyp im Manifest
 * registriert ist, erscheint es hier automatisch (Stil „medieval“), sonst das prozedurale Modell. Neue Referenzobjekte:
 * Zeile in LOOKDEV_LAYOUT ergänzen (und ggf. eine Kamera in LOOKDEV_CAMS).
 */

export type LayoutItem =
  | { kind: 'building'; t: number; x: number; y: number; rot?: number; staffed?: boolean; note?: string }
  | { kind: 'wall'; t: number; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'unit'; t: number; x: number; y: number; face: number; mode: UnitMode; carry?: number; n?: number; spread?: number }
  /** Gelände: Rechteck mit Geländeart (Gras = Oase, Weg = Steppe, Fels = Steine) */
  | { kind: 'ground'; terrain: number; x0: number; y0: number; x1: number; y1: number }
  /** Bäume: Rechteck mit Dichte 0..1 (deterministisch gestreut) */
  | { kind: 'trees'; x0: number; y0: number; x1: number; y1: number; density: number }
  /** einzelner Baum (Baum-Tile; Art aus dem Biom) */
  | { kind: 'tree'; x: number; y: number }
  /** Weg (nur Stil medieval sichtbar, als Polylinie in der Umgebungskarte): halbe Breite hw, Fahrspuren 0..1 */
  | { kind: 'road'; pts: [number, number][]; hw: number; ruts: number }
  /** Requisit aus der Vegetations-/Umgebungsbibliothek (nur Stil medieval): Asset-ID, Position, Drehung (rad), Größe */
  | { kind: 'prop'; id: string; x: number; y: number; rot?: number; s?: number }
  /** Reihe gleicher Requisiten (Zaun): von (x0,y0) nach (x1,y1), Abstand step, Drehung entlang der Linie */
  | { kind: 'propLine'; id: string; x0: number; y0: number; x1: number; y1: number; step: number; s?: number };

/** Siedlung: Bergfried, Fachwerkhäuser (Hütten), Bäckerei, Schmiede, Lager, Brunnen, Mauer mit Tor, Bauern, Soldaten, Weg, Gras, Wald, Steine */
export const LOOKDEV_LAYOUT: LayoutItem[] = [
  // Gelände zuerst (Gras, Weg vom Tor zum Platz, Felsen am Rand, Waldsaum)
  { kind: 'ground', terrain: T.Oasis, x0: -20, y0: -20, x1: 20, y1: 18 },
  { kind: 'ground', terrain: T.Steppe, x0: 0, y0: -3, x1: 1, y1: 18 },
  { kind: 'ground', terrain: T.Steppe, x0: -8, y0: 2, x1: 9, y1: 3 },
  { kind: 'ground', terrain: T.Rock, x0: -19, y0: 4, x1: -16, y1: 8 },
  // Waldsaum auf Steppe (gemäßigt/feucht: Eiche, Birke, Fichte statt Palmen der Oase)
  { kind: 'ground', terrain: T.Steppe, x0: 12, y0: -20, x1: 20, y1: -6 },
  { kind: 'ground', terrain: T.Steppe, x0: -20, y0: -20, x1: -14, y1: -12 },
  { kind: 'ground', terrain: T.Steppe, x0: 14, y0: 4, x1: 20, y1: 10 },
  { kind: 'trees', x0: 12, y0: -20, x1: 20, y1: -6, density: 0.55 },
  { kind: 'trees', x0: -20, y0: -20, x1: -14, y1: -12, density: 0.4 },
  { kind: 'trees', x0: 14, y0: 4, x1: 20, y1: 10, density: 0.25 },
  // einzelne Bäume in der Wiese und am Weg (Solitäreichen, Birkengruppe)
  { kind: 'tree', x: -15, y: 1 },
  { kind: 'tree', x: 11, y: -2 },
  { kind: 'tree', x: 9, y: 9 },
  { kind: 'tree', x: -9, y: 7 },
  { kind: 'tree', x: 5, y: 16 },
  { kind: 'tree', x: -6, y: 17 },
  // Wege (Stil medieval): Karrenweg vom Tor zum Platz, Abzweig zum Bergfried, Gasse zur Schmiede, Fußpfad zur Bäckerei
  { kind: 'road', pts: [[0.6, 26], [0.9, 19], [0.5, 12.5], [0.9, 8.5], [1.3, 4.8], [0.4, 1.8]], hw: 1.05, ruts: 1 },
  { kind: 'road', pts: [[0.4, 1.8], [-2.8, -1.6], [-6.2, -4.8], [-8.4, -7.6]], hw: 0.9, ruts: 0.7 },
  { kind: 'road', pts: [[1.3, 4.8], [3.8, 4.4], [6.2, 5.8]], hw: 0.6, ruts: 0.25 },
  { kind: 'road', pts: [[0.6, 3.4], [-2.4, 5.0], [-3.9, 5.6]], hw: 0.42, ruts: 0 },
  // Zäune und Gärten (Stil medieval)
  { kind: 'propLine', id: 'veg_fence_wattle', x0: 8.6, y0: -8.2, x1: 12.6, y1: -8.2, step: 1 },
  { kind: 'propLine', id: 'veg_fence_wattle', x0: 12.6, y0: -8.2, x1: 12.6, y1: -5.2, step: 1 },
  { kind: 'propLine', id: 'veg_fence_wattle', x0: 12.6, y0: -5.2, x1: 9.6, y1: -5.2, step: 1 },
  { kind: 'prop', id: 'veg_garden_bed', x: 10.6, y: -7.4, rot: 0 },
  { kind: 'prop', id: 'veg_garden_bed', x: 10.6, y: -6.0, rot: 0 },
  { kind: 'propLine', id: 'veg_fence_rail', x0: 3.2, y0: 14.6, x1: 10.2, y1: 14.6, step: 1 },
  { kind: 'propLine', id: 'veg_fence_rail', x0: 10.2, y0: 14.6, x1: 10.2, y1: 19.6, step: 1 },
  { kind: 'propLine', id: 'veg_fence_wattle', x0: -7.6, y0: 6.6, x1: -3.6, y1: 6.6, step: 1 },
  { kind: 'prop', id: 'veg_garden_bed', x: -5.6, y: 7.6, rot: 1.5708 },
  { kind: 'prop', id: 'veg_rock_a', x: -2.6, y: 13.8, rot: 0.6, s: 1.1 },
  { kind: 'prop', id: 'veg_rock_d', x: 2.6, y: 9.6, rot: 2.1 },
  { kind: 'prop', id: 'veg_log', x: 12.2, y: -3.6, rot: 0.4 },
  // Gebäude
  { kind: 'building', t: BT.Keep, x: -11, y: -13, note: 'Bergfried' },
  { kind: 'building', t: BT.Stockpile, x: -10, y: -3, note: 'Lager (Wegenetz)' },
  { kind: 'building', t: BT.Hovel, x: 3, y: -8, note: 'Fachwerkhaus' },
  { kind: 'building', t: BT.Hovel, x: 7, y: -7, note: 'Fachwerkhaus' },
  { kind: 'building', t: BT.Hovel, x: 4, y: -3, rot: 1, note: 'Fachwerkhaus (gedreht)' },
  { kind: 'building', t: BT.Hovel, x: -4, y: -7, note: 'Fachwerkhaus' },
  { kind: 'building', t: BT.Bakery, x: -5, y: 4, staffed: true, note: 'Bäckerei' },
  { kind: 'building', t: BT.Blacksmith, x: 6, y: 4, staffed: true, note: 'Schmiede' },
  { kind: 'building', t: BT.Well, x: 2, y: 1, note: 'Brunnen' },
  // Mauerabschnitt mit Tor (Süden)
  { kind: 'building', t: BT.GateStone, x: -1, y: 11, note: 'Steintor' },
  { kind: 'wall', t: BT.WallHigh, x0: -12, y0: 12, x1: -2, y1: 12 },
  { kind: 'wall', t: BT.WallHigh, x0: 3, y0: 12, x1: 13, y1: 12 },
  // Figuren
  { kind: 'unit', t: U.Peasant, x: 1.4, y: 6.2, face: 0.5, mode: 'idle' },
  { kind: 'unit', t: U.Peasant, x: 2.4, y: 2.6, face: 2.6, mode: 'work' },
  { kind: 'unit', t: U.Peasant, x: -2.4, y: 5.4, face: -1.2, mode: 'work' },
  { kind: 'unit', t: U.Peasant, x: 0.6, y: -1, face: 0.1, mode: 'walk', carry: 2 },
  { kind: 'unit', t: U.Peasant, x: -6.5, y: 0.5, face: 1.4, mode: 'walk', carry: 1 },
  { kind: 'unit', t: U.Peasant, x: 6.6, y: -1.6, face: -0.6, mode: 'idle' },
  { kind: 'unit', t: U.Spearman, x: -0.2, y: 7.4, face: 0.6, mode: 'idle', n: 3, spread: 0.7 },
  { kind: 'unit', t: U.Swordsman, x: 2.2, y: 7.6, face: 0.4, mode: 'idle', n: 2, spread: 0.7 },
  { kind: 'unit', t: U.Archer, x: -3.2, y: 8.2, face: 0.8, mode: 'idle', n: 2, spread: 0.8 },
];

export interface LookdevCam extends ShowCam {
  id: string;
  label: string;
  /** Blickpunkt über dem Boden (Nahaufnahmen) */
  lookHeight: number;
  /** Dunst weiter hinausschieben (Nahaufnahmen; der Spieldunst folgt dem Kameraabstand) */
  fog: number;
}

/** feste Kameras (relativ zur Siedlungsmitte); IDs sind Dateinamen der Aufnahmen */
export const LOOKDEV_CAMS: LookdevCam[] = [
  { id: '1-rts', label: '1 RTS', x: -2, y: -1, dist: 36, yaw: Math.PI / 4, pitch: 52, lookHeight: 0, fog: 1 },
  { id: '2-mid', label: '2 Mittel', x: -1, y: 0, dist: 17, yaw: Math.PI / 4 + 0.12, pitch: 38, lookHeight: 0.3, fog: 1.3 },
  { id: '3a-building', label: '3a Gebäude', x: -6.5, y: -7, dist: 10.5, yaw: 0.55, pitch: 20, lookHeight: 1.5, fog: 2.2 },
  { id: '3b-figures', label: '3b Figuren', x: 0.9, y: 7.3, dist: 4.4, yaw: 0.55, pitch: 13, lookHeight: 0.5, fog: 4 },
  { id: '3c-material', label: '3c Material', x: 2.5, y: 1.5, dist: 2.7, yaw: 0.45, pitch: 17, lookHeight: 0.55, fog: 5 },
  { id: '3d-landscape', label: '3d Landschaft', x: 10.5, y: -6, dist: 10, yaw: -0.75, pitch: 13, lookHeight: 1.1, fog: 2.6 },
];

/** Karten-Seed mit feuchtem Biom ('lush': grüne Wiesen, Laub- und Nadelbäume) */
export const LOOKDEV_SEED = 3;
export const LOOKDEV_SIZE = 96;

function hash2(s: number, x: number, y: number): number {
  let h = (s * 374761393 + x * 668265263 + y * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Baut die Spezifikation (Karte, Gebäude, Figuren, Kameras) – rein und deterministisch */
export function lookdevSpec(layout: LayoutItem[] = LOOKDEV_LAYOUT): { spec: ShowSpec; cx: number; cy: number; roads: RoadSeg[]; props: PropPlacement[] } {
  const map: GameMap = generateMap({ seed: LOOKDEV_SEED, size: LOOKDEV_SIZE, players: 2 });
  const cx = LOOKDEV_SIZE >> 1;
  const cy = LOOKDEV_SIZE >> 1;
  flatten(map, cx - 24, cy - 24, cx + 24, cy + 22, 1);
  const rng = new Rng(0x10cd);
  const buildings: ShowBuilding[] = [];
  const units: ShowUnit[] = [];
  const roads: RoadSeg[] = [];
  const props: PropPlacement[] = [];
  for (const it of layout) {
    switch (it.kind) {
      case 'ground':
        for (let y = cy + it.y0; y <= cy + it.y1; y++)
          for (let x = cx + it.x0; x <= cx + it.x1; x++) if (map.inBounds(x, y)) map.terrain[map.idx(x, y)] = it.terrain;
        break;
      case 'trees':
        for (let y = cy + it.y0; y <= cy + it.y1; y++)
          for (let x = cx + it.x0; x <= cx + it.x1; x++) if (map.inBounds(x, y) && hash2(7, x, y) < it.density) map.trees[map.idx(x, y)] = TREE_WOOD;
        break;
      case 'tree':
        if (map.inBounds(cx + it.x, cy + it.y)) map.trees[map.idx(cx + it.x, cy + it.y)] = TREE_WOOD;
        break;
      case 'road':
        roads.push(...polylineSegs(it.pts.map(([x, y]) => [cx + x, cy + y] as [number, number]), it.hw, it.ruts));
        break;
      case 'prop':
        props.push({ id: it.id, x: cx + it.x, y: cy + it.y, rot: it.rot ?? 0, s: it.s });
        break;
      case 'propLine': {
        const dx = it.x1 - it.x0;
        const dy = it.y1 - it.y0;
        const L = Math.hypot(dx, dy);
        const n = Math.max(1, Math.round(L / it.step));
        // Zaunstück: Länge 1 entlang +x (Blender X) → Drehung um die Hochachse auf die Linienrichtung
        const rot = Math.atan2(-dy, dx);
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n;
          props.push({ id: it.id, x: cx + it.x0 + dx * f, y: cy + it.y0 + dy * f, rot, s: (L / n) / it.step * (it.s ?? 1) });
        }
        break;
      }
      case 'building':
        buildings.push({ t: it.t, x: cx + it.x, y: cy + it.y, o: 0, rot: it.rot ?? 0, s: it.staffed ? 1 : 0 });
        break;
      case 'wall': {
        const dx = Math.sign(it.x1 - it.x0);
        const dy = Math.sign(it.y1 - it.y0);
        const n = Math.max(Math.abs(it.x1 - it.x0), Math.abs(it.y1 - it.y0));
        for (let k = 0; k <= n; k++) buildings.push({ t: it.t, x: cx + it.x0 + dx * k, y: cy + it.y0 + dy * k, o: 0 });
        break;
      }
      case 'unit': {
        const n = it.n ?? 1;
        for (let k = 0; k < n; k++) {
          const ox = n > 1 ? (k - (n - 1) / 2) * (it.spread ?? 0.7) : 0;
          const oy = n > 1 ? (rng.next() - 0.5) * 0.25 : 0;
          units.push({ t: it.t, o: 0, x: cx + it.x + ox, y: cy + it.y + oy, face: it.face + (n > 1 ? (rng.next() - 0.5) * 0.2 : 0), mode: it.mode, carry: it.carry ?? 0, hp: 255 });
        }
        break;
      }
    }
  }
  // keine Bäume unter Gebäuden
  for (const b of buildings) {
    const d = BUILDINGS[b.t];
    const w = b.rot ? d.h : d.w;
    const h = b.rot ? d.w : d.h;
    for (let y = b.y - 1; y <= b.y + h; y++) for (let x = b.x - 1; x <= b.x + w; x++) if (map.inBounds(x, y)) map.trees[map.idx(x, y)] = 0;
  }
  const spec: ShowSpec = {
    name: 'early',
    seed: LOOKDEV_SEED,
    size: LOOKDEV_SIZE,
    players: 2,
    map,
    buildings,
    units,
    arrows: [],
    cam: { x: cx, y: cy, dist: 34, yaw: Math.PI / 4, pitch: 52 },
    tick: 5000,
    fogScale: 1,
    desc: 'LookDev-Referenzsiedlung',
  };
  // keine Requisiten auf Gebäuden
  return { spec, cx, cy, roads, props };
}
