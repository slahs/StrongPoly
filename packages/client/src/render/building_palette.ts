/**
 * Erweiterte Palette der Gebäudemodelle („Refined Stylized Medieval“): warme, leicht entsättigte Erdtöne.
 * Stein warm-grau in drei Stufen, Putz cremig, Holz in drei Brauntönen, Dächer Terrakotta/Schiefer/Stroh.
 * Spielerfarbe kommt ausschließlich über `team`-Teile (Fahnen, Wimpel, Dachfirste, Tuchbahnen).
 */
export const BP = {
  // Stein
  stoneLight: 0xcbc3b3,
  stone: 0xb2aa9b,
  stoneMid: 0x9c9486,
  stoneDark: 0x7f786c,
  stoneDeep: 0x5e584f,
  rock: 0x8b8378,
  rockDark: 0x6e675e,
  // Putz
  plasterWhite: 0xeee4cc,
  plaster: 0xe2d2ae,
  plasterWarm: 0xd8bf92,
  ochre: 0xcfa468,
  clay: 0xb98a5c,
  // Holz
  woodLight: 0xbd9158,
  wood: 0x9a6c3d,
  woodDark: 0x6d4727,
  woodBlack: 0x3f2b1b,
  // Dächer
  terracotta: 0xb4573b,
  terracottaDark: 0x974831,
  terracottaLight: 0xc66c4a,
  slate: 0x626a74,
  slateDark: 0x4a505a,
  thatch: 0xcdb05a,
  thatchDark: 0xa88f45,
  shingle: 0x8a6a48,
  // Metall und Sonstiges
  iron: 0x4b4b52,
  ironLight: 0x80828a,
  copper: 0x5f9a86,
  black: 0x24211e,
  coal: 0x2d2926,
  gold: 0xe2b441,
  white: 0xf2ede0,
  cloth: 0xe8dcc0,
  clothDark: 0xb7a884,
  // Natur
  grass: 0x5f9a3e,
  grassDark: 0x4d8433,
  leaf: 0x3f8a3a,
  leafDark: 0x2c6a2e,
  soil: 0x8a6a45,
  soilDark: 0x6e5436,
  hay: 0xdcc468,
  wheat: 0xd9b84e,
  water: 0x3f86c4,
  pitch: 0x2a2622,
  apple: 0xc2483a,
} as const;
export type BPKey = keyof typeof BP;

/** Oberflächenarten (Vertexattribut aSurf): der Fragment-Shader zeichnet daraus Fugen, Planken, Ziegel … */
export const SURF = {
  None: 0,
  /** Quader mit Lagerfugen */
  Stone: 1,
  /** Putz: weiche Fleckung, unten schmutziger */
  Plaster: 2,
  /** senkrechte Bretter */
  Plank: 3,
  /** Hohlziegel in versetzten Reihen */
  Tile: 4,
  /** Stroh: Bündel und Fasern */
  Thatch: 5,
  /** Schindeln / Schiefer, kleinteilig */
  Shingle: 6,
  /** liegende Rundhölzer (Blockwand) */
  Log: 7,
  /** Erde / Staub: grobe Fleckung */
  Ground: 8,
  /** Pflaster / Platten */
  Flag: 9,
} as const;
