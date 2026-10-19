/** Feste Farbpalette (24 Farben). Alle Modelle und das Terrain nutzen nur diese Werte. */
export const PAL = {
  sand: 0xe3c98a,
  sandDark: 0xd1b073,
  steppe: 0xb5a560,
  steppeDark: 0xa0914f,
  oasis: 0x6fae4a,
  oasisDark: 0x5c9a3c,
  rock: 0x8b8378,
  rockDark: 0x6e675e,
  water: 0x3f86c4,
  waterDeep: 0x2d6a9f,
  swamp: 0x56633a,
  pitch: 0x2a2622,
  treeLight: 0x3f8a3a,
  treeDark: 0x2c6a2e,
  trunk: 0x6b4a2b,
  wood: 0xa97c45,
  woodDark: 0x7d5a30,
  stone: 0xb9b4aa,
  stoneDark: 0x8e897f,
  roof: 0xb0452f,
  thatch: 0xd9b84e,
  white: 0xf2ede0,
  black: 0x24211e,
  gold: 0xf0c040,
} as const;
export type PalKey = keyof typeof PAL;

/** Spielerfarben (Akzent: Fahnen, Schilde, Dächer). */
export const PLAYER_COLORS: readonly number[] = [
  0xd8362f, // Rot
  0x2f6fd8, // Blau
  0x35a84a, // Grün
  0xe8c020, // Gelb
  0x9a45c8, // Violett
  0xe8822a, // Orange
  0x2fc0c0, // Türkis
  0xe05aa0, // Rosa
];
export const PLAYER_COLOR_NAMES = ['Rot', 'Blau', 'Grün', 'Gelb', 'Violett', 'Orange', 'Türkis', 'Rosa'];
