/**
 * Zentrale Tabelle der Grafikstufen. Alle Schalter, die Qualität gegen Leistung tauschen,
 * stehen hier; Renderer-Module lesen nur diese Werte (angewandt über `GameScene.applyGfx`).
 */
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityCfg {
  /** Schatten überhaupt zulassen (zusätzlich zum Schalter in den Optionen) */
  shadows: boolean;
  /** Kantenlänge der Shadow-Map */
  shadowMapSize: number;
  /** basic = harte Kanten, pcf = gefiltert, pcfsoft = weiche Kanten */
  shadowType: 'basic' | 'pcf' | 'pcfsoft';
  /** Weichzeichner-Radius der Schattenkante (nur pcf) */
  shadowRadius: number;
  /** Einheiten werfen Schatten (sonst Blob-Schatten) */
  shadowUnits: boolean;
  /** Bäume und Felsen werfen Schatten */
  shadowDecor: boolean;
  /** Obergrenze gleichzeitig lebender Partikel */
  particleMax: number;
  /** Faktor auf die Zahl erzeugter Partikel */
  particleScale: number;
  /** Grasbüschel je Oasen-Tile (0 = aus) */
  grassPerTile: number;
  /** Obergrenze der Grasinstanzen */
  grassMax: number;
  /** Sichtweite der Dekoration (Tiles um den Blickpunkt) */
  decorRadius: number;
  /** Stärke der eingebackenen Ambient Occlusion (0..1) */
  ao: number;
  /** animiertes Wasser (Wellen, Schaum); sonst flache Farbe */
  waterShader: boolean;
  /** Obergrenze des Pixel-Ratios */
  pixelRatioMax: number;
  /** SSAO-Nachbearbeitung (nur Hoch geplant; siehe PROGRESS, nicht umgesetzt) */
  ssao: boolean;
  /** weiche Kontaktschatten unter Einheiten, wenn Einheiten keine echten Schatten werfen */
  blobShadows: boolean;
  /** Obergrenze der Blutflecken am Boden */
  bloodDecals: number;
  /** Rauch aus Werkstätten und brennenden Gebäuden */
  workSmoke: boolean;
  /** Obergrenze animierter Leichen */
  corpses: number;
}

export const QUALITY: Record<QualityLevel, QualityCfg> = {
  low: {
    shadows: true,
    shadowMapSize: 1024,
    shadowType: 'basic',
    shadowRadius: 1,
    shadowUnits: false,
    shadowDecor: false,
    particleMax: 500,
    particleScale: 0.4,
    grassPerTile: 0,
    grassMax: 0,
    decorRadius: 48,
    ao: 0.5,
    waterShader: false,
    pixelRatioMax: 1,
    ssao: false,
    blobShadows: true,
    bloodDecals: 40,
    workSmoke: false,
    corpses: 60,
  },
  medium: {
    shadows: true,
    shadowMapSize: 2048,
    shadowType: 'pcfsoft',
    shadowRadius: 1.5,
    shadowUnits: true,
    shadowDecor: true,
    particleMax: 1800,
    particleScale: 1,
    grassPerTile: 3,
    grassMax: 9000,
    decorRadius: 72,
    ao: 0.85,
    waterShader: true,
    pixelRatioMax: 1.5,
    ssao: false,
    blobShadows: false,
    bloodDecals: 120,
    workSmoke: true,
    corpses: 160,
  },
  high: {
    shadows: true,
    shadowMapSize: 4096,
    shadowType: 'pcfsoft',
    shadowRadius: 2.5,
    shadowUnits: true,
    shadowDecor: true,
    particleMax: 4000,
    particleScale: 1.6,
    grassPerTile: 7,
    grassMax: 22000,
    decorRadius: 110,
    ao: 1,
    waterShader: true,
    pixelRatioMax: 2,
    ssao: false,
    blobShadows: false,
    bloodDecals: 260,
    workSmoke: true,
    corpses: 320,
  },
};

export function qualityOf(level: string | undefined): QualityCfg {
  return QUALITY[(level as QualityLevel) in QUALITY ? (level as QualityLevel) : 'medium'];
}
