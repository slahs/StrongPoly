import { BT, BUILDINGS, U } from '@strongpoly/shared';

/**
 * Laufzeit-Manifest der 3D-Assets (`public/assets/manifest.json`, erzeugt von `scripts/asset-manifest.mjs` aus
 * `assets/materials.json`, `assets/registry/*.json` und den vorhandenen Texturen). Reine Typen und Prüfungen ohne
 * DOM/WebGL – testbar in Node. Konventionen: `assets/PIPELINE.md`.
 */

export type MapKind = 'albedo' | 'normal' | 'orm';
export const MAP_KINDS: MapKind[] = ['albedo', 'normal', 'orm'];

export interface MapEntry {
  /** Pfad relativ zu `public/assets/` */
  file: string;
  bytes: number;
  w: number;
  h: number;
  format: 'ktx2' | 'webp' | 'jpg' | 'png' | string;
  /** kleinere Fassungen derselben Karte: Kantenlänge → Datei (z. B. `albedo_512.webp`) */
  sizes?: Record<string, string>;
  /** andere Formate derselben Karte (z. B. KTX2 neben WebP) */
  alt?: Record<string, string>;
  /** Inhalts-Hash (Cache-Busting) */
  hash?: string;
}

export interface MaterialDef {
  /** sRGB-Hex der Grundfarbe (Rückfall ohne Textur) */
  base: string;
  rough: number;
  metal: number;
  /** Weltmaß einer Texturwiederholung (UVs sind bereits durch tile geteilt) */
  tile: number;
  /** sRGB-Hex der Schmutzfarbe (Vertexfarbe G) */
  dirt: string;
  alphaTest?: number;
  doubleSided?: boolean;
  normalScale?: number;
  maps: Partial<Record<MapKind, MapEntry>>;
}

export type WallPiece = 'arm' | 'post' | 'stub';

/** Wofür ein Asset steht: Gebäudetyp (Name aus BT), Mauerstück, Einheitentyp (Name aus U) oder reines Requisit/Dekor */
export interface AssetTarget {
  building?: string;
  wall?: string;
  piece?: WallPiece;
  unit?: string;
  prop?: string;
}

export interface AnchorDef {
  name: string;
  kind: string;
  /** Position in Asset-Koordinaten (three: y oben, Front +z) */
  pos: [number, number, number];
  extras: Record<string, unknown>;
}

export interface LodDef {
  node: string;
  tris: number;
  materials: string[];
}

export interface AssetDef {
  id: string;
  desc?: string;
  file: string;
  target: AssetTarget;
  class?: string;
  footprint: [number, number] | null;
  height: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  lods: LodDef[];
  tris: number[];
  budget?: number[] | null;
  materials: string[];
  anchors: AnchorDef[];
  attributes: string[];
  bytes: number;
  /** Inhalts-Hash der GLB-Datei (Cache-Busting) */
  hash?: string;
  /** Faktoren auf die LOD-Entfernungen (d01, d12), sonst aus der Größe abgeleitet */
  lodDist?: number[];
  source?: string | null;
  blend?: string;
  license?: string;
  /** Vegetation/Umgebung (assets/blender/lib/sp/veg.py): Laufzeitklasse, Art, Rolle im Katalog */
  veg?: { kind: string; species?: string; role?: string; [k: string]: unknown };
  /** Kachelgröße je Material beim Export (UV im Weltmaß / tile); die Laufzeit gleicht spätere Änderungen von tile aus */
  uvTile?: Record<string, number>;
}

export interface AssetManifest {
  version: number;
  /** Basis-Transcoder liegt unter public/assets/basis/ (sonst werden KTX2-Karten ignoriert) */
  ktx2?: boolean;
  materials: Record<string, MaterialDef>;
  assets: Record<string, AssetDef>;
}

/** Partikel-Emitter, die die Laufzeit aus Ankerpunkten erzeugt (wie work_fx.ts EMITTERS) */
export const EMITTER_KINDS = ['smoke', 'smokeDark', 'steam', 'flame', 'sparks', 'anvil', 'dust', 'flour', 'chips'] as const;
export const MARKER_KINDS = ['flag', 'banner', 'door', 'work', 'fx'] as const;

/** Spielraum eines Modells über den Footprint hinaus (Dachüberstände), je Seite in Einheiten */
export const FOOTPRINT_TOL = 0.35;

const BT_BY_NAME = BT as unknown as Record<string, number>;
const U_BY_NAME = U as unknown as Record<string, number>;

/** Gebäudetyp-Nummer zu einem BT-Namen (z. B. 'Well' → 29), sonst -1 */
export function buildingTypeOf(name: string | undefined): number {
  return name !== undefined && name in BT_BY_NAME ? BT_BY_NAME[name] : -1;
}

/** Einheitentyp-Nummer zu einem U-Namen, sonst -1 */
export function unitTypeOf(name: string | undefined): number {
  return name !== undefined && name in U_BY_NAME ? U_BY_NAME[name] : -1;
}

/** Schlüssel des Override-Registers: `b:<BT>` (Gebäude), `w:<BT>:<Stück>` (Mauer), `u:<U>` (Einheit); null = kein Spielobjekt */
export function targetKey(t: AssetTarget): string | null {
  if (t.building !== undefined) {
    const b = buildingTypeOf(t.building);
    return b >= 0 ? `b:${b}` : null;
  }
  if (t.wall !== undefined) {
    const b = buildingTypeOf(t.wall);
    return b >= 0 && t.piece ? `w:${b}:${t.piece}` : null;
  }
  if (t.unit !== undefined) {
    const u = unitTypeOf(t.unit);
    return u >= 0 ? `u:${u}` : null;
  }
  return null;
}

export const buildingKey = (bt: number): string => `b:${bt}`;
export const wallKey = (bt: number, piece: WallPiece): string => `w:${bt}:${piece}`;
export const unitKey = (ut: number): string => `u:${ut}`;

/**
 * Prüft ein Manifest gegen die Spieldaten. Rückgabe: Liste der Probleme (leer = in Ordnung). `exists` prüft optional,
 * ob eine Datei (relativ zu public/assets) vorhanden ist. Probleme machen das Spiel nicht kaputt – das betroffene Asset
 * wird zur Laufzeit übersprungen (prozeduraler Rückfall) – sollen aber im Test auffallen.
 */
export function validateManifest(m: AssetManifest, exists?: (file: string) => boolean): string[] {
  const out: string[] = [];
  if (!m || m.version !== 1) return ['Manifest: version != 1'];
  for (const [name, d] of Object.entries(m.materials ?? {})) {
    if (!/^M_[A-Za-z]+(_[A-Za-z0-9]+)*$/.test(name)) out.push(`Material ${name}: Name entspricht nicht M_*`);
    if (!(d.tile > 0)) out.push(`Material ${name}: tile fehlt`);
    if (!/^#[0-9a-fA-F]{6}$/.test(d.base)) out.push(`Material ${name}: base ist kein Hex-Wert`);
    for (const [k, e] of Object.entries(d.maps ?? {})) {
      if (!(MAP_KINDS as string[]).includes(k)) out.push(`Material ${name}: unbekannte Karte ${k}`);
      if (exists && e && !exists(e.file)) out.push(`Material ${name}: Textur fehlt (${e.file})`);
    }
  }
  const keys = new Map<string, string>();
  for (const [id, a] of Object.entries(m.assets ?? {})) {
    const p = (s: string): void => {
      out.push(`${id}: ${s}`);
    };
    if (a.id !== id) p('id passt nicht zum Schlüssel');
    if (!a.file?.endsWith('.glb')) p('file ist keine .glb');
    else if (exists && !exists(a.file)) p(`Datei fehlt (${a.file})`);
    if (!a.lods?.length) p('keine LOD-Stufen');
    else {
      a.lods.forEach((l, i) => {
        if (l.node !== `LOD${i}`) p(`LOD-Knoten ${i} heißt ${l.node}`);
        if (!(l.tris > 0)) p(`LOD${i} ohne Dreiecke`);
        if (i > 0 && l.tris > a.lods[i - 1].tris) p(`LOD${i} hat mehr Dreiecke als LOD${i - 1}`);
        if (a.budget && a.budget[i] && l.tris > a.budget[i]) p(`LOD${i}: ${l.tris} Dreiecke über Budget ${a.budget[i]}`);
        for (const mn of l.materials) if (!m.materials[mn]) p(`LOD${i}: unbekanntes Material ${mn}`);
      });
    }
    for (const mn of a.materials ?? []) if (!m.materials[mn]) p(`unbekanntes Material ${mn}`);
    if (!(a.height > 0)) p('Höhe fehlt');
    for (const an of a.anchors ?? []) {
      if (!(EMITTER_KINDS as readonly string[]).includes(an.kind) && !(MARKER_KINDS as readonly string[]).includes(an.kind)) p(`Anker ${an.name}: unbekannte Art ${an.kind}`);
      if (!Array.isArray(an.pos) || an.pos.length !== 3) p(`Anker ${an.name}: Position fehlt`);
    }
    const t = a.target ?? {};
    const key = targetKey(t);
    if ((t.building !== undefined || t.wall !== undefined || t.unit !== undefined) && !key) p(`Ziel ${JSON.stringify(t)} unbekannt (BT/U-Name, bei Mauern piece)`);
    if (key) {
      if (keys.has(key)) p(`Ziel ${key} doppelt (auch ${keys.get(key)})`);
      keys.set(key, id);
    }
    const bt = t.building !== undefined ? buildingTypeOf(t.building) : t.wall !== undefined ? buildingTypeOf(t.wall) : -1;
    if (bt >= 0) {
      const def = BUILDINGS[bt];
      if (t.building !== undefined) {
        if (!a.footprint || a.footprint[0] !== def.w || a.footprint[1] !== def.h) p(`Footprint ${JSON.stringify(a.footprint)} passt nicht zu ${def.key} (${def.w}x${def.h})`);
        if (a.bbox) {
          const hw = def.w / 2 + FOOTPRINT_TOL;
          const hh = def.h / 2 + FOOTPRINT_TOL;
          if (a.bbox.min[0] < -hw || a.bbox.max[0] > hw || a.bbox.min[2] < -hh || a.bbox.max[2] > hh) p(`Bounding-Box überschreitet den Footprint ${def.w}x${def.h}`);
        }
      }
    }
  }
  return out;
}
