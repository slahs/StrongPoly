/** Terraintypen. Bäume liegen als eigene Ebene (map.trees) über dem Terrain. */
export const T = {
  Desert: 0,
  Steppe: 1,
  Oasis: 2,
  Rock: 3,
  Water: 4,
  Swamp: 5,
  StoneDeposit: 6,
  IronDeposit: 7,
  PitchSpring: 8,
  Moat: 9,
} as const;
export type TerrainId = (typeof T)[keyof typeof T];

export const TERRAIN_NAMES: Record<number, string> = {
  [T.Desert]: 'Wüste',
  [T.Steppe]: 'Steppe',
  [T.Oasis]: 'Oase',
  [T.Rock]: 'Fels',
  [T.Water]: 'Wasser',
  [T.Swamp]: 'Sumpf',
  [T.StoneDeposit]: 'Steinvorkommen',
  [T.IronDeposit]: 'Eisenvorkommen',
  [T.PitchSpring]: 'Pechquelle',
  [T.Moat]: 'Wassergraben',
};

/** Bewegungsgeschwindigkeits-Faktor je Terrain (0 = unpassierbar). */
export const TERRAIN_SPEED: Record<number, number> = {
  [T.Desert]: 0.9,
  [T.Steppe]: 1,
  [T.Oasis]: 1,
  [T.Rock]: 0,
  [T.Water]: 0,
  [T.Swamp]: 0.55,
  [T.StoneDeposit]: 0.9,
  [T.IronDeposit]: 0.9,
  [T.PitchSpring]: 0.6,
  [T.Moat]: 0,
};

/** Höhenstufen 0..4; Weltabstand pro Stufe */
export const MAX_HEIGHT = 4;
export const HEIGHT_STEP = 0.6;
export const DEPOSIT_AMOUNT: Record<number, number> = {
  [T.StoneDeposit]: 2500,
  [T.IronDeposit]: 1500,
  [T.PitchSpring]: 1500,
};
export const TREE_WOOD = 12;
