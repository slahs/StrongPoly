import { R } from './resources';

/** Einheitentypen */
export const U = {
  Peasant: 0,
  Ox: 1,
  Lord: 2,
  Archer: 3,
  Crossbowman: 4,
  Spearman: 5,
  Pikeman: 6,
  Maceman: 7,
  Swordsman: 8,
  Knight: 9,
  Tunneler: 10,
  Laddermen: 11,
  Engineer: 12,
  Monk: 13,
  Slave: 14,
  Slinger: 15,
  HorseArcher: 16,
  ArabSwordsman: 17,
  Assassin: 18,
  Firethrower: 19,
  Catapult: 20,
  Trebuchet: 21,
  Ram: 22,
  SiegeTower: 23,
  Mantlet: 24,
  FireBallista: 25,
} as const;
export const UNIT_TYPES = 26;

/** Schadensarten */
export const D = { Slash: 0, Pierce: 1, Blunt: 2, Siege: 3, Fire: 4 } as const;
/** Rüstungsklassen */
export const A = { None: 0, Light: 1, Heavy: 2, Plate: 3, BldWood: 4, BldStone: 5, SiegeEng: 6 } as const;

/** Schadensmultiplikator [Schadensart][Rüstungsklasse] */
export const DMG_TABLE: number[][] = [
  // None Light Heavy Plate BldWood BldStone SiegeEng
  [1.0, 0.8, 0.5, 0.4, 0.5, 0.12, 0.5], // Slash
  [1.0, 0.75, 0.4, 0.3, 0.2, 0.03, 0.25], // Pierce
  [1.0, 1.0, 0.9, 0.8, 0.7, 0.25, 0.8], // Blunt
  [1.2, 1.2, 1.2, 1.2, 1.3, 1.0, 1.0], // Siege
  [1.2, 1.0, 0.8, 0.7, 2.0, 0.12, 1.5], // Fire
];

export type ProjKind = 0 | 1 | 2 | 3 | 4 | 5;
/** Projektilarten */
export const PROJ = { None: 0, Arrow: 1, Bolt: 2, Stone: 3, FireArrow: 4, Boulder: 5 } as const;

export type Producer = 'none' | 'barracks' | 'merc' | 'guild';

export interface UnitCost {
  gold: number;
  res?: [number, number][];
  horse?: boolean;
  /** verbrauchte Bauern (Belagerungsmannschaft) */
  crew?: number;
}

export interface UnitDef {
  id: number;
  key: string;
  name: string;
  side: 'euro' | 'arab' | 'neutral' | 'siege';
  producer: Producer;
  speed: number;
  hp: number;
  armor: number;
  dmg: number;
  dtype: number;
  /** Reichweite in Tiles (Nahkampf ~1) */
  range: number;
  minRange: number;
  cd: number;
  sight: number;
  proj: number;
  splash: number;
  cost: UnitCost;
  train: number;
  troops: number;
  radius: number;
  // Fähigkeiten
  mounted?: boolean;
  invisible?: boolean;
  climbs?: boolean;
  ladders?: boolean;
  tunnels?: boolean;
  siege?: boolean;
  bldOnly?: boolean;
  towerBridge?: boolean;
  fireDmg?: boolean;
  healer?: boolean;
  cover?: boolean;
  repairs?: boolean;
  worker?: boolean;
}

type Partial_ = Partial<UnitDef> & Pick<UnitDef, 'key' | 'name' | 'speed' | 'hp'>;
function u(id: number, p: Partial_): UnitDef {
  return {
    id,
    side: 'euro',
    producer: 'none',
    armor: A.None,
    dmg: 0,
    dtype: D.Slash,
    range: 1,
    minRange: 0,
    cd: 1.2,
    sight: 9,
    proj: PROJ.None,
    splash: 0,
    cost: { gold: 0 },
    train: 4,
    troops: 1,
    radius: 0.3,
    ...p,
  };
}

export const UNITS: UnitDef[] = [];
const defs: [number, Partial_][] = [
  [U.Peasant, { key: 'peasant', name: 'Bauer', side: 'neutral', speed: 1.7, hp: 20, dmg: 2, dtype: D.Blunt, troops: 0, sight: 7, worker: true }],
  [U.Ox, { key: 'ox', name: 'Ochse', side: 'neutral', speed: 1.4, hp: 60, troops: 0, radius: 0.4, sight: 5 }],
  [U.Lord, { key: 'lord', name: 'Lord', side: 'euro', speed: 2.0, hp: 700, armor: A.Plate, dmg: 24, dtype: D.Slash, cd: 0.9, sight: 11, radius: 0.35 }],
  [U.Archer, { key: 'archer', name: 'Bogenschütze', producer: 'barracks', speed: 2.0, hp: 30, armor: A.None, dmg: 7, dtype: D.Pierce, range: 12, cd: 1.7, sight: 14, proj: PROJ.Arrow, cost: { gold: 12, res: [[R.Bow, 1]] } }],
  [U.Crossbowman, { key: 'crossbowman', name: 'Armbrustschütze', producer: 'barracks', speed: 1.7, hp: 48, armor: A.Light, dmg: 15, dtype: D.Pierce, range: 10, cd: 2.6, sight: 12, proj: PROJ.Bolt, cost: { gold: 20, res: [[R.Crossbow, 1]] } }],
  [U.Spearman, { key: 'spearman', name: 'Speerkämpfer', producer: 'barracks', speed: 2.1, hp: 48, armor: A.Light, dmg: 8, dtype: D.Pierce, range: 1.3, cd: 1.2, cost: { gold: 8, res: [[R.Spear, 1]] } }],
  [U.Pikeman, { key: 'pikeman', name: 'Pikenier', producer: 'barracks', speed: 1.6, hp: 85, armor: A.Heavy, dmg: 9, dtype: D.Pierce, range: 1.6, cd: 1.4, cost: { gold: 18, res: [[R.Pike, 1], [R.Armor, 1]] } }],
  [U.Maceman, { key: 'maceman', name: 'Streitkolbenkämpfer', producer: 'barracks', speed: 1.9, hp: 80, armor: A.Light, dmg: 15, dtype: D.Blunt, range: 1, cd: 1.3, cost: { gold: 20, res: [[R.Mace, 1], [R.Leather, 1]] } }],
  [U.Swordsman, { key: 'swordsman', name: 'Schwertkämpfer', producer: 'barracks', speed: 1.6, hp: 115, armor: A.Heavy, dmg: 20, dtype: D.Slash, range: 1, cd: 1.2, cost: { gold: 40, res: [[R.Sword, 1], [R.Armor, 1]] }, train: 6 }],
  [U.Knight, { key: 'knight', name: 'Ritter', producer: 'barracks', speed: 3.2, hp: 170, armor: A.Plate, dmg: 22, dtype: D.Slash, range: 1.2, cd: 1.0, radius: 0.4, mounted: true, cost: { gold: 60, res: [[R.Sword, 1], [R.Armor, 1]], horse: true }, train: 8 }],
  [U.Tunneler, { key: 'tunneler', name: 'Tunnelgräber', producer: 'barracks', speed: 1.5, hp: 30, dmg: 3, dtype: D.Blunt, tunnels: true, cost: { gold: 25 } }],
  [U.Laddermen, { key: 'laddermen', name: 'Leiterträger', producer: 'barracks', speed: 1.9, hp: 32, dmg: 2, dtype: D.Blunt, ladders: true, cost: { gold: 10 } }],
  [U.Engineer, { key: 'engineer', name: 'Ingenieur', producer: 'barracks', speed: 1.8, hp: 35, dmg: 3, dtype: D.Blunt, repairs: true, cost: { gold: 30 } }],
  [U.Monk, { key: 'monk', name: 'Mönch', producer: 'barracks', speed: 1.6, hp: 32, dmg: 3, dtype: D.Blunt, healer: true, sight: 8, cost: { gold: 15 } }],
  [U.Slave, { key: 'slave', name: 'Sklave', side: 'arab', producer: 'merc', speed: 2.6, hp: 20, dmg: 6, dtype: D.Fire, cd: 1.0, fireDmg: true, cost: { gold: 5 }, train: 2 }],
  [U.Slinger, { key: 'slinger', name: 'Schleuderer', side: 'arab', producer: 'merc', speed: 2.3, hp: 24, dmg: 7, dtype: D.Pierce, range: 9, cd: 1.5, sight: 11, proj: PROJ.Stone, cost: { gold: 12 }, train: 3 }],
  [U.HorseArcher, { key: 'horsearcher', name: 'Berittener Bogenschütze', side: 'arab', producer: 'merc', speed: 3.6, hp: 60, armor: A.Light, dmg: 9, dtype: D.Pierce, range: 10, cd: 1.6, sight: 13, proj: PROJ.Arrow, mounted: true, radius: 0.4, cost: { gold: 40 }, train: 6 }],
  [U.ArabSwordsman, { key: 'arabswordsman', name: 'Arabischer Schwertkämpfer', side: 'arab', producer: 'merc', speed: 2.3, hp: 95, armor: A.Light, dmg: 17, dtype: D.Slash, range: 1, cd: 1.1, cost: { gold: 30 }, train: 5 }],
  [U.Assassin, { key: 'assassin', name: 'Assassine', side: 'arab', producer: 'merc', speed: 2.7, hp: 55, dmg: 24, dtype: D.Slash, cd: 1.0, invisible: true, climbs: true, cost: { gold: 60 }, train: 7 }],
  [U.Firethrower, { key: 'firethrower', name: 'Feuerwerfer', side: 'arab', producer: 'merc', speed: 1.8, hp: 55, armor: A.Light, dmg: 6, dtype: D.Fire, range: 4, cd: 0.6, fireDmg: true, proj: PROJ.FireArrow, cost: { gold: 50 }, train: 6 }],
  [U.Catapult, { key: 'catapult', name: 'Katapult', side: 'siege', producer: 'guild', speed: 0.8, hp: 240, armor: A.SiegeEng, dmg: 75, dtype: D.Siege, range: 22, minRange: 5, cd: 7, sight: 16, proj: PROJ.Boulder, splash: 1.8, siege: true, troops: 3, radius: 0.6, cost: { gold: 150, crew: 2 }, train: 12 }],
  [U.Trebuchet, { key: 'trebuchet', name: 'Trebuchet', side: 'siege', producer: 'guild', speed: 0.5, hp: 320, armor: A.SiegeEng, dmg: 130, dtype: D.Siege, range: 32, minRange: 8, cd: 10, sight: 22, proj: PROJ.Boulder, splash: 2.4, siege: true, troops: 4, radius: 0.7, cost: { gold: 260, crew: 3 }, train: 16 }],
  [U.Ram, { key: 'ram', name: 'Rammbock', side: 'siege', producer: 'guild', speed: 1.2, hp: 420, armor: A.SiegeEng, dmg: 60, dtype: D.Siege, range: 1.4, cd: 1.6, siege: true, bldOnly: true, troops: 3, radius: 0.6, cost: { gold: 110, crew: 2 }, train: 10 }],
  [U.SiegeTower, { key: 'siegetower', name: 'Belagerungsturm', side: 'siege', producer: 'guild', speed: 0.9, hp: 750, armor: A.SiegeEng, towerBridge: true, troops: 4, radius: 0.9, cost: { gold: 170, crew: 3 }, train: 14 }],
  [U.Mantlet, { key: 'mantlet', name: 'Schutzschild', side: 'siege', producer: 'guild', speed: 1.4, hp: 520, armor: A.SiegeEng, cover: true, troops: 1, radius: 0.5, cost: { gold: 30, crew: 1 }, train: 4 }],
  [U.FireBallista, { key: 'fireballista', name: 'Feuerballista', side: 'siege', producer: 'guild', speed: 1.0, hp: 210, armor: A.SiegeEng, dmg: 38, dtype: D.Fire, range: 17, minRange: 3, cd: 3.5, sight: 17, proj: PROJ.FireArrow, siege: true, troops: 3, radius: 0.55, cost: { gold: 140, crew: 2 }, train: 10 }],
];
for (const [id, p] of defs) UNITS[id] = u(id, p);

export const ARMY_UNITS: number[] = UNITS.filter((d) => d.producer === 'barracks' || d.producer === 'merc').map((d) => d.id);
export const SIEGE_UNITS: number[] = UNITS.filter((d) => d.producer === 'guild').map((d) => d.id);
