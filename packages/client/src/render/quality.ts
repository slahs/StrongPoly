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

  // ---- Phase 4B (Gelände, Vegetation, Wasser, Licht, Atmosphäre); alle Werte steigen von Niedrig bis Hoch ----
  /** Oberflächendetail im Gelände-Shader: 0 nur Bodenkarte + Grobfleckung, 1 Farbvariation + Bump, 2 + Gesteinsschichten/Kies */
  surfaceDetail: number;
  /** wandernde Wolkenschatten 0..1 */
  cloudShadow: number;
  /** Himmelsreflex am Rand (Randlicht) 0..1 */
  rimLight: number;
  /** Materialvariation je Instanz (Helligkeit/Farbton von Bäumen, Häusern, Figuren) 0..1 */
  instanceVariation: number;
  /** Wasserdetail: 0 flach, 1 animierte Normalen + Fresnel + Schaum, 2 + zweite Wellenlage + Glitzern */
  waterDetail: number;
  /** Baumschwanken im Wind 0..1 */
  treeSway: number;
  /** bis zu dieser Entfernung (Tiles) werden Bäume in voller Form gezeichnet, dahinter als einfache Fernform */
  treeFullRadius: number;
  /** Dichte zusätzlicher Vegetation (Büsche, Unterholz) 0..1 */
  undergrowth: number;
  /** Wiesenblumen je Gras-Tile (0 = aus) */
  flowersPerTile: number;
  /** Obergrenze der Kleinstdekoration (Blumen, Kiesel) */
  detailMax: number;
  /** Umgebungsleben: 0 aus, 1 Vogelschwärme, 2 zusätzlich Insekten und treibende Blätter/Staub */
  ambientLife: number;
  /** Obergrenze der Umgebungsinstanzen (Vögel, Insekten, Blätter) */
  ambientMax: number;
  /** Anisotrope Filterung der Rauschtexturen (und der Asset-Texturen) */
  anisotropy: number;

  // ---- Phase 5A (GLB-Assets, nur Stil „medieval“) ----
  /** Abstand (Einheiten, mal Größenfaktor des Assets), bis zu dem LOD0 gezeichnet wird */
  assetLod0: number;
  /** Abstand, bis zu dem LOD1 gezeichnet wird; dahinter LOD2 */
  assetLod1: number;
  /** nutzbare LOD-Stufen von der gröbsten an (3 = LOD0..LOD2, Niedrig 2 = nie LOD0) */
  assetLods: number;
  /** größte Texturkantenlänge der Asset-Materialien (kleinere Fassungen `*_512.*` werden genutzt, wenn vorhanden) */
  assetTexMax: number;

  // ---- Phase 5A Umgebung (nur Stil „medieval“: Vegetation aus GLB-Assets, Gelände mit Materialbibliothek) ----
  /** Faktor auf die LOD-Grenzen der Vegetation (env/veg_place.ts VEG_LOD) */
  envLodScale: number;
  /** nutzbare LOD-Stufen der Bäume (Niedrig 2 = nie LOD0) */
  envTreeLods: number;
  /** Grasbüschel je Wiesen-Tile nahe der Kamera (0 = nur Bodentextur) */
  envGrassPerTile: number;
  /** Radius (Tiles) um den Blickpunkt für Gras, Blumen, Farn */
  envFloraRadius: number;
  /** Obergrenze der Gras-/Blumen-/Farninstanzen */
  envFloraMax: number;
  /** Durchlicht der Blätter/Halme 0..1 */
  envTranslucency: number;
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
    surfaceDetail: 0,
    cloudShadow: 0,
    rimLight: 0,
    instanceVariation: 0.5,
    waterDetail: 0,
    treeSway: 0,
    treeFullRadius: 26,
    undergrowth: 0,
    flowersPerTile: 0,
    detailMax: 0,
    ambientLife: 0,
    ambientMax: 0,
    anisotropy: 1,
    assetLod0: 0,
    assetLod1: 34,
    assetLods: 2,
    assetTexMax: 512,
    envLodScale: 0.7,
    envTreeLods: 2,
    envGrassPerTile: 0,
    envFloraRadius: 12,
    envFloraMax: 1500,
    envTranslucency: 0.4,
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
    surfaceDetail: 1,
    cloudShadow: 0.6,
    rimLight: 0.6,
    instanceVariation: 1,
    waterDetail: 1,
    treeSway: 0.8,
    treeFullRadius: 46,
    undergrowth: 0.6,
    flowersPerTile: 1,
    detailMax: 2500,
    ambientLife: 1,
    ambientMax: 90,
    anisotropy: 4,
    assetLod0: 30,
    assetLod1: 72,
    assetLods: 3,
    assetTexMax: 1024,
    envLodScale: 1,
    envTreeLods: 3,
    envGrassPerTile: 6,
    envFloraRadius: 24,
    envFloraMax: 12000,
    envTranslucency: 0.75,
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
    surfaceDetail: 2,
    cloudShadow: 0.9,
    rimLight: 0.9,
    instanceVariation: 1,
    waterDetail: 2,
    treeSway: 1,
    treeFullRadius: 72,
    undergrowth: 1,
    flowersPerTile: 2,
    detailMax: 6000,
    ambientLife: 2,
    ambientMax: 220,
    anisotropy: 8,
    assetLod0: 44,
    assetLod1: 105,
    assetLods: 3,
    assetTexMax: 2048,
    envLodScale: 1.45,
    envTreeLods: 3,
    envGrassPerTile: 8,
    envFloraRadius: 34,
    envFloraMax: 20000,
    envTranslucency: 1,
  },
};

export function qualityOf(level: string | undefined): QualityCfg {
  return QUALITY[(level as QualityLevel) in QUALITY ? (level as QualityLevel) : 'medium'];
}
