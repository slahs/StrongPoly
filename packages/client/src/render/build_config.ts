import { BT, BUILDING_TYPES, BuildingDef, TICK_RATE } from '@strongpoly/shared';

/**
 * Zentrale Konfiguration der Bauanimation (4C). Rein visuell: Die Simulation setzt Gebäude sofort,
 * die Dauer hier steuert nur, wie lange der Renderer den Aufbau zeigt (Pause und Spielgeschwindigkeit
 * wirken über die Sim-Ticks mit). Jeder Gebäudetyp hat eine Klasse und eine Dauer in Sekunden.
 */
export type BuildClass = 'none' | 'tiny' | 'small' | 'medium' | 'large' | 'tower' | 'gate' | 'wall';

/** Richtwerte je Klasse in Sekunden (Spielzeit bei Geschwindigkeit 1) */
export const BUILD_CLASS_SECONDS: Record<BuildClass, number> = {
  none: 0,
  tiny: 1.4,
  small: 2.2,
  medium: 3.2,
  large: 4.4,
  tower: 5.5,
  gate: 5,
  wall: 0.9,
};

/** Zulässiger Zeitraum je Klasse (Konfigurationstest und Gegenprobe der Zielvorgaben) */
export const BUILD_CLASS_RANGE: Record<BuildClass, [number, number]> = {
  none: [0, 0],
  tiny: [0.8, 3],
  small: [1, 3],
  medium: [2, 5],
  large: [3, 5.5],
  tower: [4, 7],
  gate: [3.5, 7],
  wall: [0.4, 1.6],
};

/** Klasse je Gebäudetyp (jeder Typ muss vorkommen) */
export const BUILD_CLASS_OF: Record<number, BuildClass> = {
  [BT.Keep]: 'none',
  [BT.Campfire]: 'none',
  [BT.Hovel]: 'small',
  [BT.Stockpile]: 'small',
  [BT.Granary]: 'medium',
  [BT.Armory]: 'medium',
  [BT.Woodcutter]: 'tiny',
  [BT.Quarry]: 'medium',
  [BT.OxTether]: 'tiny',
  [BT.IronMine]: 'medium',
  [BT.PitchRig]: 'small',
  [BT.AppleOrchard]: 'medium',
  [BT.DairyFarm]: 'medium',
  [BT.HunterPost]: 'tiny',
  [BT.WheatFarm]: 'medium',
  [BT.HopFarm]: 'medium',
  [BT.Mill]: 'large',
  [BT.Bakery]: 'medium',
  [BT.Brewery]: 'medium',
  [BT.Inn]: 'large',
  [BT.Fletcher]: 'medium',
  [BT.Poleturner]: 'medium',
  [BT.Blacksmith]: 'medium',
  [BT.Tanner]: 'medium',
  [BT.Armorer]: 'medium',
  [BT.Market]: 'medium',
  [BT.Chapel]: 'medium',
  [BT.Church]: 'large',
  [BT.Cathedral]: 'large',
  [BT.Well]: 'tiny',
  [BT.WaterPot]: 'tiny',
  [BT.Garden]: 'tiny',
  [BT.Statue]: 'small',
  [BT.Maypole]: 'small',
  [BT.Gallows]: 'small',
  [BT.Stocks]: 'tiny',
  [BT.Dungeon]: 'medium',
  [BT.WallWood]: 'wall',
  [BT.WallLow]: 'wall',
  [BT.WallHigh]: 'wall',
  [BT.TowerLookout]: 'tower',
  [BT.TowerGuard]: 'tower',
  [BT.TowerRound]: 'tower',
  [BT.GateWood]: 'gate',
  [BT.GateStone]: 'gate',
  [BT.Drawbridge]: 'gate',
  [BT.Stairs]: 'small',
  [BT.Pit]: 'none',
  [BT.KillingPit]: 'none',
  [BT.PitchDitch]: 'none',
  [BT.Cauldron]: 'small',
  [BT.TurretBallista]: 'none',
  [BT.TurretMangonel]: 'none',
  [BT.Barracks]: 'large',
  [BT.MercPost]: 'medium',
  [BT.Stable]: 'medium',
  [BT.EngineerGuild]: 'large',
};

/** Einzelne Abweichungen von der Klassendauer (Sekunden) */
export const BUILD_SECONDS_OVERRIDE: Partial<Record<number, number>> = {
  [BT.Hovel]: 2.0,
  [BT.Stockpile]: 2.4,
  [BT.Granary]: 3.0,
  [BT.Armory]: 3.2,
  [BT.Quarry]: 3.0,
  [BT.AppleOrchard]: 2.8,
  [BT.WheatFarm]: 2.8,
  [BT.HopFarm]: 2.8,
  [BT.Mill]: 4.2,
  [BT.Inn]: 4.0,
  [BT.Church]: 4.6,
  [BT.Cathedral]: 5.0,
  [BT.WallWood]: 0.7,
  [BT.WallHigh]: 1.2,
  [BT.TowerLookout]: 4.2,
  [BT.TowerGuard]: 5.2,
  [BT.TowerRound]: 6.5,
  [BT.GateWood]: 4.0,
  [BT.GateStone]: 6.0,
  [BT.Drawbridge]: 3.5,
  [BT.Stairs]: 1.2,
  [BT.Cauldron]: 2.5,
  [BT.Barracks]: 5.0,
  [BT.EngineerGuild]: 5.0,
};

export function buildClass(type: number): BuildClass {
  return BUILD_CLASS_OF[type] ?? 'none';
}

/** Dauer der Bauanimation eines Typs in Sekunden (0 = keine) */
export function buildSeconds(type: number): number {
  const c = buildClass(type);
  if (c === 'none') return 0;
  return BUILD_SECONDS_OVERRIDE[type] ?? BUILD_CLASS_SECONDS[c];
}

/** Dauer in Sim-Ticks (10 je Sekunde) */
export function buildTicksOf(def: Pick<BuildingDef, 'id'>): number {
  return Math.round(buildSeconds(def.id) * TICK_RATE);
}

/** Typen ohne Gerüst (offene Höfe, Felsen, flache Anlagen): sie wachsen nur aus Fundament und Baumaterial */
export const NO_SCAFFOLD: Set<number> = new Set([BT.Market, BT.Stockpile, BT.Quarry, BT.IronMine, BT.PitchRig, BT.OxTether, BT.Maypole, BT.Drawbridge, BT.Garden, BT.Well, BT.WaterPot, BT.Stocks, BT.Gallows]);

/** Staffelung innerhalb einer gezogenen Mauerlinie: Verzögerung je Stück (s) und Obergrenze der Gesamtlaufzeit */
export const WALL_SWEEP = { perPiece: 0.07, maxSweep: 2.4 };

export const BUILD_TYPE_COUNT = BUILDING_TYPES;
