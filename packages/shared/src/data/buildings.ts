import { R } from './resources';

/** Gebäudetypen */
export const BT = {
  Keep: 0,
  Campfire: 1,
  Hovel: 2,
  Stockpile: 3,
  Granary: 4,
  Armory: 5,
  Woodcutter: 6,
  Quarry: 7,
  OxTether: 8,
  IronMine: 9,
  PitchRig: 10,
  AppleOrchard: 11,
  DairyFarm: 12,
  HunterPost: 13,
  WheatFarm: 14,
  HopFarm: 15,
  Mill: 16,
  Bakery: 17,
  Brewery: 18,
  Inn: 19,
  Fletcher: 20,
  Poleturner: 21,
  Blacksmith: 22,
  Tanner: 23,
  Armorer: 24,
  Market: 25,
  Chapel: 26,
  Church: 27,
  Cathedral: 28,
  Well: 29,
  WaterPot: 30,
  Garden: 31,
  Statue: 32,
  Maypole: 33,
  Gallows: 34,
  Stocks: 35,
  Dungeon: 36,
  WallWood: 37,
  WallLow: 38,
  WallHigh: 39,
  TowerLookout: 40,
  TowerGuard: 41,
  TowerRound: 42,
  GateWood: 43,
  GateStone: 44,
  Drawbridge: 45,
  Stairs: 46,
  Pit: 47,
  KillingPit: 48,
  PitchDitch: 49,
  Cauldron: 50,
  TurretBallista: 51,
  TurretMangonel: 52,
  Barracks: 53,
  MercPost: 54,
  Stable: 55,
  EngineerGuild: 56,
} as const;
export const BUILDING_TYPES = 57;

export type Cat = 'castle' | 'industry' | 'farm' | 'town' | 'weapons' | 'food';
export const CATEGORIES: { id: Cat; name: string }[] = [
  { id: 'castle', name: 'Burg' },
  { id: 'industry', name: 'Industrie' },
  { id: 'farm', name: 'Landwirtschaft' },
  { id: 'town', name: 'Stadt' },
  { id: 'weapons', name: 'Waffen' },
  { id: 'food', name: 'Nahrung' },
];

export interface Cost {
  gold?: number;
  wood?: number;
  stone?: number;
  iron?: number;
  pitch?: number;
}

export interface Recipe {
  name: string;
  in: [number, number][];
  out: number;
  outAmt: number;
  /** Sekunden pro Zyklus */
  time: number;
  /** Nebenprodukt alle N Zyklen */
  extra?: { res: number; amt: number; every: number };
}

export type ProdMode = 'roam' | 'local' | 'process';
export interface ProdDef {
  mode: ProdMode;
  /** roam: 'tree' sucht Bäume, 'game' läuft zufällig umher */
  target?: 'tree' | 'game';
  radius?: number;
  recipes: Recipe[];
  /** Menge pro Transport */
  batch: number;
  /** wer Ware zum Lager bringt */
  haul: 'worker' | 'ox';
}

export type Placement = 'flat' | 'any' | 'deposit' | 'fertile' | 'water' | 'wallAdj' | 'onWall';

export interface BuildingDef {
  id: number;
  key: string;
  name: string;
  cat: Cat;
  w: number;
  h: number;
  hp: number;
  cost: Cost;
  placement: Placement;
  /** Für 'deposit': Terraintyp und Mindestanzahl; für 'fertile'/'water': Mindestanzahl */
  terrain?: number;
  minTiles?: number;
  workers: number;
  prod?: ProdDef;
  solid: boolean;
  wallTop?: boolean;
  gate?: boolean;
  stairs?: boolean;
  wood: boolean;
  /** Gebäudeklasse: Wall-Stücke werden per Linie gezogen */
  line?: boolean;
  /** Lagermodul */
  store?: 'stock' | 'granary' | 'armory';
  housing?: number;
  /** Angstfaktor: +1 = schlechte Sache, -1 = gute Sache */
  fear?: number;
  religion?: 'chapel' | 'church' | 'cathedral';
  vision: number;
  /** Platzierung nur 1x pro Spieler */
  unique?: boolean;
  desc?: string;
  /** Modellhinweis für den Client */
  height: number;
}

type P = Partial<BuildingDef> & Pick<BuildingDef, 'key' | 'name' | 'cat' | 'w' | 'h' | 'hp' | 'cost'>;
function b(id: number, p: P): BuildingDef {
  return { id, placement: 'flat', workers: 0, solid: true, wood: false, vision: 8, height: 1.5, ...p };
}

const rc = (name: string, inp: [number, number][], out: number, outAmt: number, time: number, extra?: Recipe['extra']): Recipe => ({
  name,
  in: inp,
  out,
  outAmt,
  time,
  extra,
});

export const BUILDINGS: BuildingDef[] = [];
const bdefs: [number, P][] = [
  [BT.Keep, { key: 'keep', name: 'Bergfried', cat: 'castle', w: 5, h: 5, hp: 6500, cost: {}, unique: true, wallTop: true, vision: 14, height: 4.2, desc: 'Zentrale der Burg. Fällt der Lord, ist das Spiel verloren.' }],
  [BT.Campfire, { key: 'campfire', name: 'Lagerfeuer', cat: 'town', w: 1, h: 1, hp: 60, cost: {}, solid: false, wood: true, vision: 6, height: 0.5, desc: 'Hier erscheinen neue Bauern.' }],
  [BT.Hovel, { key: 'hovel', name: 'Hütte', cat: 'town', w: 2, h: 2, hp: 300, cost: { wood: 6 }, wood: true, housing: 8, height: 1.3, desc: 'Erhöht das Bevölkerungslimit um 8.' }],
  [BT.Stockpile, { key: 'stockpile', name: 'Lager', cat: 'industry', w: 3, h: 3, hp: 500, cost: { wood: 5 }, wood: true, store: 'stock', height: 0.9, desc: 'Lagert Holz, Stein, Eisen, Pech. Weitere Module müssen angrenzen.' }],
  [BT.Granary, { key: 'granary', name: 'Kornspeicher', cat: 'food', w: 3, h: 3, hp: 600, cost: { wood: 8 }, wood: true, store: 'granary', height: 1.8, desc: 'Lagert Nahrung. Weitere Module müssen angrenzen.' }],
  [BT.Armory, { key: 'armory', name: 'Waffenkammer', cat: 'weapons', w: 3, h: 3, hp: 700, cost: { wood: 10 }, wood: true, store: 'armory', height: 1.8, desc: 'Lagert Waffen. Weitere Module müssen angrenzen.' }],
  [BT.Woodcutter, { key: 'woodcutter', name: 'Holzfäller', cat: 'industry', w: 2, h: 2, hp: 300, cost: { gold: 3, wood: 3 }, wood: true, workers: 1, prod: { mode: 'roam', target: 'tree', radius: 14, batch: 8, haul: 'worker', recipes: [rc('Holz', [], R.Wood, 4, 7)] }, height: 1.2 }],
  [BT.Quarry, { key: 'quarry', name: 'Steinbruch', cat: 'industry', w: 3, h: 3, hp: 500, cost: { gold: 15, wood: 10 }, placement: 'deposit', terrain: 6, minTiles: 4, workers: 2, prod: { mode: 'local', batch: 9, haul: 'ox', recipes: [rc('Stein', [], R.Stone, 3, 12)] }, height: 1.6 }],
  [BT.OxTether, { key: 'oxtether', name: 'Ochsengespann', cat: 'industry', w: 2, h: 2, hp: 250, cost: { gold: 6, wood: 5 }, wood: true, workers: 0, height: 1.0, desc: 'Ochsen bringen Stein vom Steinbruch zum Lager.' }],
  [BT.IronMine, { key: 'ironmine', name: 'Eisenmine', cat: 'industry', w: 3, h: 3, hp: 500, cost: { gold: 20, wood: 20 }, placement: 'deposit', terrain: 7, minTiles: 3, workers: 2, prod: { mode: 'local', batch: 4, haul: 'worker', recipes: [rc('Eisen', [], R.Iron, 2, 15)] }, height: 1.6 }],
  [BT.PitchRig, { key: 'pitchrig', name: 'Pechgrube', cat: 'industry', w: 2, h: 2, hp: 350, cost: { gold: 20, wood: 10 }, wood: true, placement: 'deposit', terrain: 8, minTiles: 2, workers: 1, prod: { mode: 'local', batch: 4, haul: 'worker', recipes: [rc('Pech', [], R.Pitch, 2, 15)] }, height: 1.4 }],
  [BT.AppleOrchard, { key: 'apple', name: 'Apfelplantage', cat: 'farm', w: 4, h: 4, hp: 300, cost: { gold: 5, wood: 5 }, wood: true, placement: 'fertile', minTiles: 10, workers: 1, prod: { mode: 'local', batch: 6, haul: 'worker', recipes: [rc('Äpfel', [], R.Apple, 3, 18)] }, height: 1.1 }],
  [BT.DairyFarm, { key: 'dairy', name: 'Milchhof', cat: 'farm', w: 4, h: 4, hp: 300, cost: { gold: 8, wood: 10 }, wood: true, placement: 'fertile', minTiles: 8, workers: 1, prod: { mode: 'local', batch: 6, haul: 'worker', recipes: [rc('Käse', [], R.Cheese, 3, 20, { res: R.Cow, amt: 1, every: 2 })] }, height: 1.2 }],
  [BT.HunterPost, { key: 'hunter', name: 'Jägerhütte', cat: 'farm', w: 2, h: 2, hp: 250, cost: { gold: 4, wood: 5 }, wood: true, workers: 1, prod: { mode: 'roam', target: 'game', radius: 16, batch: 4, haul: 'worker', recipes: [rc('Fleisch', [], R.Meat, 4, 22)] }, height: 1.2 }],
  [BT.WheatFarm, { key: 'wheat', name: 'Weizenhof', cat: 'farm', w: 5, h: 5, hp: 300, cost: { gold: 10, wood: 12 }, wood: true, placement: 'fertile', minTiles: 14, workers: 1, prod: { mode: 'local', batch: 6, haul: 'worker', recipes: [rc('Weizen', [], R.Wheat, 4, 22)] }, height: 1.2 }],
  [BT.HopFarm, { key: 'hops', name: 'Hopfenfarm', cat: 'farm', w: 4, h: 4, hp: 300, cost: { gold: 10, wood: 12 }, wood: true, placement: 'fertile', minTiles: 10, workers: 1, prod: { mode: 'local', batch: 6, haul: 'worker', recipes: [rc('Hopfen', [], R.Hops, 4, 22)] }, height: 1.6 }],
  [BT.Mill, { key: 'mill', name: 'Mühle', cat: 'food', w: 3, h: 3, hp: 400, cost: { gold: 10, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 4, haul: 'worker', recipes: [rc('Mehl', [[R.Wheat, 2]], R.Flour, 2, 8)] }, height: 3.0 }],
  [BT.Bakery, { key: 'bakery', name: 'Bäckerei', cat: 'food', w: 3, h: 3, hp: 400, cost: { gold: 10, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 4, haul: 'worker', recipes: [rc('Brot', [[R.Flour, 2]], R.Bread, 2, 10)] }, height: 1.8 }],
  [BT.Brewery, { key: 'brewery', name: 'Brauerei', cat: 'food', w: 3, h: 3, hp: 400, cost: { gold: 10, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 4, haul: 'worker', recipes: [rc('Bier', [[R.Hops, 2]], R.Ale, 2, 10)] }, height: 2.0 }],
  [BT.Inn, { key: 'inn', name: 'Schenke', cat: 'food', w: 3, h: 3, hp: 400, cost: { gold: 20, wood: 20 }, wood: true, workers: 1, height: 1.8, desc: 'Schenkt Bier aus und steigert die Beliebtheit.' }],
  [BT.Fletcher, { key: 'fletcher', name: 'Bogner', cat: 'weapons', w: 3, h: 3, hp: 400, cost: { gold: 20, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 2, haul: 'worker', recipes: [rc('Bögen', [[R.Wood, 2]], R.Bow, 1, 12), rc('Armbrüste', [[R.Wood, 3]], R.Crossbow, 1, 15)] }, height: 1.5 }],
  [BT.Poleturner, { key: 'poleturner', name: 'Drechsler', cat: 'weapons', w: 3, h: 3, hp: 400, cost: { gold: 20, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 2, haul: 'worker', recipes: [rc('Speere', [[R.Wood, 2]], R.Spear, 1, 12), rc('Piken', [[R.Wood, 3]], R.Pike, 1, 15)] }, height: 1.5 }],
  [BT.Blacksmith, { key: 'blacksmith', name: 'Schmied', cat: 'weapons', w: 3, h: 3, hp: 500, cost: { gold: 30, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 2, haul: 'worker', recipes: [rc('Streitkolben', [[R.Iron, 2]], R.Mace, 1, 15), rc('Schwerter', [[R.Iron, 3]], R.Sword, 1, 18)] }, height: 1.6 }],
  [BT.Tanner, { key: 'tanner', name: 'Gerber', cat: 'weapons', w: 3, h: 3, hp: 400, cost: { gold: 20, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 2, haul: 'worker', recipes: [rc('Lederrüstung', [[R.Cow, 1]], R.Leather, 1, 15)] }, height: 1.5 }],
  [BT.Armorer, { key: 'armorer', name: 'Plattner', cat: 'weapons', w: 3, h: 3, hp: 500, cost: { gold: 30, wood: 20 }, wood: true, workers: 1, prod: { mode: 'process', batch: 2, haul: 'worker', recipes: [rc('Plattenrüstung', [[R.Iron, 3]], R.Armor, 1, 20)] }, height: 1.6 }],
  [BT.Market, { key: 'market', name: 'Markt', cat: 'town', w: 3, h: 3, hp: 400, cost: { gold: 30, wood: 20 }, wood: true, workers: 1, height: 1.6, desc: 'Handel mit allen Waren zu dynamischen Preisen.' }],
  [BT.Chapel, { key: 'chapel', name: 'Kapelle', cat: 'town', w: 2, h: 3, hp: 500, cost: { gold: 40, stone: 20 }, workers: 1, religion: 'chapel', height: 2.0 }],
  [BT.Church, { key: 'church', name: 'Kirche', cat: 'town', w: 3, h: 4, hp: 800, cost: { gold: 100, stone: 60 }, workers: 2, religion: 'church', height: 3.2 }],
  [BT.Cathedral, { key: 'cathedral', name: 'Kathedrale', cat: 'town', w: 4, h: 5, hp: 1400, cost: { gold: 250, stone: 150 }, workers: 3, religion: 'cathedral', height: 4.4 }],
  [BT.Well, { key: 'well', name: 'Brunnen', cat: 'town', w: 1, h: 1, hp: 200, cost: { stone: 4 }, height: 0.9, desc: 'Löscht Feuer im Umkreis.' }],
  [BT.WaterPot, { key: 'waterpot', name: 'Wassertopf', cat: 'castle', w: 1, h: 1, hp: 80, cost: { gold: 5 }, wood: true, height: 0.5, desc: 'Löscht Feuer in kleinem Umkreis.' }],
  [BT.Garden, { key: 'garden', name: 'Garten', cat: 'town', w: 2, h: 2, hp: 120, cost: { gold: 8 }, fear: -1, solid: false, height: 0.5 }],
  [BT.Statue, { key: 'statue', name: 'Statue', cat: 'town', w: 2, h: 2, hp: 300, cost: { gold: 40, stone: 10 }, fear: -2, height: 2.0 }],
  [BT.Maypole, { key: 'maypole', name: 'Maibaum', cat: 'town', w: 2, h: 2, hp: 200, cost: { gold: 20, wood: 8 }, wood: true, fear: -1, height: 2.4 }],
  [BT.Gallows, { key: 'gallows', name: 'Galgen', cat: 'town', w: 2, h: 2, hp: 200, cost: { gold: 10, wood: 8 }, wood: true, fear: 1, height: 2.4 }],
  [BT.Stocks, { key: 'stocks', name: 'Pranger', cat: 'town', w: 1, h: 2, hp: 150, cost: { gold: 8, wood: 4 }, wood: true, fear: 1, height: 1.2 }],
  [BT.Dungeon, { key: 'dungeon', name: 'Verlies', cat: 'town', w: 3, h: 3, hp: 700, cost: { gold: 40, stone: 25 }, fear: 2, height: 1.4 }],
  [BT.WallWood, { key: 'wallwood', name: 'Holzpalisade', cat: 'castle', w: 1, h: 1, hp: 240, cost: { wood: 2 }, placement: 'any', line: true, wallTop: true, wood: true, height: 1.5 }],
  [BT.WallLow, { key: 'walllow', name: 'Niedrige Steinmauer', cat: 'castle', w: 1, h: 1, hp: 700, cost: { stone: 3 }, placement: 'any', line: true, wallTop: true, height: 1.5 }],
  [BT.WallHigh, { key: 'wallhigh', name: 'Hohe Steinmauer', cat: 'castle', w: 1, h: 1, hp: 1500, cost: { stone: 6 }, placement: 'any', line: true, wallTop: true, height: 2.4 }],
  [BT.TowerLookout, { key: 'towerlookout', name: 'Wachturm', cat: 'castle', w: 2, h: 2, hp: 1000, cost: { stone: 20 }, placement: 'any', wallTop: true, vision: 14, height: 3.2 }],
  [BT.TowerGuard, { key: 'towerguard', name: 'Wehrturm', cat: 'castle', w: 3, h: 3, hp: 2000, cost: { stone: 40 }, placement: 'any', wallTop: true, vision: 16, height: 3.8 }],
  [BT.TowerRound, { key: 'towerround', name: 'Großer Turm', cat: 'castle', w: 4, h: 4, hp: 2800, cost: { stone: 90, gold: 20 }, placement: 'any', wallTop: true, vision: 18, height: 4.6, desc: 'Trägt Geschütze.' }],
  [BT.GateWood, { key: 'gatewood', name: 'Holztor', cat: 'castle', w: 3, h: 2, hp: 900, cost: { wood: 20 }, placement: 'any', gate: true, wallTop: true, wood: true, height: 2.2 }],
  [BT.GateStone, { key: 'gatestone', name: 'Steintor', cat: 'castle', w: 4, h: 3, hp: 2400, cost: { stone: 40, wood: 10 }, placement: 'any', gate: true, wallTop: true, vision: 14, height: 3.6 }],
  [BT.Drawbridge, { key: 'drawbridge', name: 'Zugbrücke', cat: 'castle', w: 3, h: 3, hp: 700, cost: { wood: 20 }, placement: 'water', minTiles: 5, gate: true, wood: true, height: 0.4 }],
  [BT.Stairs, { key: 'stairs', name: 'Treppe', cat: 'castle', w: 1, h: 1, hp: 400, cost: { stone: 4 }, placement: 'wallAdj', solid: false, stairs: true, wallTop: true, height: 1.6 }],
  [BT.Pit, { key: 'pit', name: 'Fallgrube', cat: 'castle', w: 1, h: 1, hp: 1, cost: { gold: 3 }, placement: 'any', solid: false, line: true, height: 0.05 }],
  [BT.KillingPit, { key: 'killingpit', name: 'Killing Pit', cat: 'castle', w: 1, h: 1, hp: 1, cost: { gold: 10, wood: 4 }, placement: 'any', solid: false, line: true, height: 0.05 }],
  [BT.PitchDitch, { key: 'pitchditch', name: 'Pechgraben', cat: 'castle', w: 1, h: 1, hp: 1, cost: { pitch: 2 }, placement: 'any', solid: false, line: true, height: 0.05 }],
  [BT.Cauldron, { key: 'cauldron', name: 'Ölkessel', cat: 'castle', w: 1, h: 1, hp: 500, cost: { gold: 30, pitch: 4 }, placement: 'any', wallTop: true, height: 1.8 }],
  [BT.TurretBallista, { key: 'turretballista', name: 'Ballista-Geschütz', cat: 'castle', w: 1, h: 1, hp: 0, cost: { gold: 100, wood: 20 }, placement: 'onWall', solid: false, height: 0 }],
  [BT.TurretMangonel, { key: 'turretmangonel', name: 'Mangonel-Geschütz', cat: 'castle', w: 1, h: 1, hp: 0, cost: { gold: 150, wood: 30 }, placement: 'onWall', solid: false, height: 0 }],
  [BT.Barracks, { key: 'barracks', name: 'Kaserne', cat: 'castle', w: 4, h: 4, hp: 1200, cost: { gold: 30, stone: 30 }, height: 2.4, desc: 'Rekrutiert europäische Truppen.' }],
  [BT.MercPost, { key: 'mercpost', name: 'Söldnerposten', cat: 'castle', w: 3, h: 3, hp: 800, cost: { gold: 30, wood: 20 }, wood: true, height: 2.0, desc: 'Heuert arabische Söldner nur für Gold an.' }],
  [BT.Stable, { key: 'stable', name: 'Stall', cat: 'castle', w: 4, h: 3, hp: 600, cost: { gold: 40, wood: 25 }, wood: true, height: 1.5, desc: 'Züchtet Pferde für Ritter.' }],
  [BT.EngineerGuild, { key: 'engineers', name: 'Ingenieurszunft', cat: 'castle', w: 4, h: 4, hp: 1000, cost: { gold: 100, wood: 30 }, wood: true, height: 2.0, desc: 'Baut Belagerungswaffen.' }],
];
for (const [id, p] of bdefs) BUILDINGS[id] = b(id, p);

export const BUILD_MENU: BuildingDef[] = BUILDINGS.filter((d) => d.id !== BT.Keep && d.id !== BT.Campfire);
export const MAX_BUILDING_FOOTPRINT = 5;
/** Kapazität pro Ware und Lagermodul */
export const STORE_CAP_PER_MODULE = { stock: 150, granary: 150, armory: 60 } as const;
export const STORE_MODULE_CAP = 150;
export const HORSES_PER_STABLE = 4;

/** Untermenüs der Burg-Kategorie im Baumenü (Reihenfolge = Anzeige) */
export const CASTLE_SUBCATS: { id: string; name: string; types: number[] }[] = [
  { id: 'walls', name: 'Mauern', types: [BT.WallWood, BT.WallLow, BT.WallHigh, BT.Stairs, BT.WaterPot] },
  { id: 'towers', name: 'Türme', types: [BT.TowerLookout, BT.TowerGuard, BT.TowerRound, BT.TurretBallista, BT.TurretMangonel] },
  { id: 'gates', name: 'Tore', types: [BT.GateWood, BT.GateStone, BT.Drawbridge] },
  { id: 'troops', name: 'Truppen', types: [BT.Barracks, BT.MercPost, BT.Stable] },
  { id: 'siege', name: 'Belagerungsbau', types: [BT.EngineerGuild, BT.Pit, BT.KillingPit, BT.PitchDitch, BT.Cauldron] },
];
/** Sekunden, bis ein Stall ein weiteres Pferd züchtet (bis HORSES_PER_STABLE) */
export const HORSE_BREED_SECONDS = 40;
/** Ochsen pro Ochsengespann und Sekunden bis zum Nachrücken eines zweiten Ochsen */
export const OXEN_PER_TETHER = 2;
export const OX_RESPAWN_SECONDS = 40;
