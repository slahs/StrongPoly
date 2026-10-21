import { HEIGHT_STEP, T, hash2, valueNoise } from '@strongpoly/shared';
import { forestDensity, pickSpecies, treeLook } from '../biome';
import type { Biome, Species } from '../biome';

/**
 * Verteilung der Vegetation im Stil medieval (rein, deterministisch, ohne WebGL – testbar). Ergebnis sind Instanzen je
 * Asset und LOD-Stufe; die Asset-IDs kommen aus dem Katalog (Manifest-Einträge mit `veg`), fehlende Arten entfallen.
 *
 *  - Bäume auf Baum-Tiles (Spielressource Holz): Art aus Biom/Terrain (pickSpecies) → Eiche/Birke/Fichte, Variante per
 *    Hash, Größe/Neigung/Tönung aus treeLook; dichter Wald bekommt Jungwuchs, Farn und Gebüsch
 *  - Waldsaum: Büsche, Farn, höheres Gras; offene Wiese: Grasbüschel nahe der Kamera (Dichte nach Stufe, Feuchte),
 *    Wiesenblumen in Flecken (Rauschen), vereinzelte Büsche, Steine; Felsgelände/Vorkommen: Felsen und Findlinge
 *  - keine Pflanzen auf Gebäuden, Wegen (Umgebungskarte), Feldern/Trampelpfaden (Bodenkarte), im Wasser, im Unerkundeten
 *  - LOD je Instanz nach dem Kameraabstand (Grenzen je Art × Stufenfaktor), Niedrig nie LOD0 bei Bäumen
 */

export type VegClass = 'tree' | 'bush' | 'flora' | 'rock' | 'prop';
export type TreeSpecies = 'oak' | 'birch' | 'spruce';

/** Katalog der verfügbaren Vegetations-Assets (aus dem Manifest) */
export interface VegCatalog {
  trees: Record<TreeSpecies, string[]>;
  /** Jungbaum je Art (Unterwuchs) */
  young: Partial<Record<TreeSpecies, string>>;
  bush: string[];
  grass: string[];
  /** trockenes/hohes Gras (Wegränder, Waldsaum) */
  grassTall: string[];
  flowers: string[];
  fern: string[];
  /** Findling, kantiger Fels, Platte, Steine */
  boulder: string[];
  rock: string[];
  stones: string[];
  /** Klasse je Asset-ID */
  cls: Record<string, VegClass>;
  /** LOD2 (Fernform) gemeinsam nutzen: ausgewachsene Varianten einer Art → erste Variante (weniger Draw-Calls) */
  lod2Alias: Record<string, string>;
}

/** Katalog aus Manifest-Einträgen (`veg.kind`, `veg.species`, `veg.role`) */
export function catalogOf(assets: { id: string; veg?: { kind?: string; species?: string; role?: string } }[]): VegCatalog {
  const c: VegCatalog = { trees: { oak: [], birch: [], spruce: [] }, young: {}, bush: [], grass: [], grassTall: [], flowers: [], fern: [], boulder: [], rock: [], stones: [], cls: {}, lod2Alias: {} };
  for (const a of [...assets].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const v = a.veg;
    if (!v?.kind) continue;
    const kind = v.kind as VegClass;
    c.cls[a.id] = kind;
    const role = v.role ?? '';
    if (kind === 'tree') {
      const sp = (v.species ?? 'oak') as TreeSpecies;
      if (!c.trees[sp]) continue;
      if (role === 'young') c.young[sp] = a.id;
      c.trees[sp].push(a.id);
    } else if (kind === 'bush') c.bush.push(a.id);
    else if (kind === 'flora') {
      if (role === 'grassTall') c.grassTall.push(a.id);
      else if (role === 'flowers') c.flowers.push(a.id);
      else if (role === 'fern') c.fern.push(a.id);
      else c.grass.push(a.id);
    } else if (kind === 'rock') {
      if (role === 'boulder') c.boulder.push(a.id);
      else if (role === 'stones') c.stones.push(a.id);
      else c.rock.push(a.id);
    }
  }
  for (const sp of ['oak', 'birch', 'spruce'] as const) {
    const old = c.trees[sp].filter((id) => id !== c.young[sp]);
    for (const id of old.slice(1)) c.lod2Alias[id] = old[0];
  }
  for (const id of c.bush.slice(1)) c.lod2Alias[id] = c.bush[0];
  return c;
}

/** Vollständig genug, um die prozedurale Vegetation zu ersetzen (alle drei Baumarten vorhanden) */
export function catalogReady(c: VegCatalog): boolean {
  return c.trees.oak.length > 0 && c.trees.birch.length > 0 && c.trees.spruce.length > 0;
}

/** Werte der Grafikstufe für die Vegetation (aus QualityCfg abgeleitet) */
export interface VegQuality {
  /** Faktor auf alle LOD-Grenzen */
  lodScale: number;
  /** feinste erlaubte Stufe der Bäume (Niedrig 1 = nie LOD0) */
  treeMinLod: number;
  /** Grasbüschel je Wiesen-Tile */
  grassPerTile: number;
  /** Radius (Tiles) für Gras, Blumen, Farn */
  floraRadius: number;
  /** Unterwuchs (Büsche, Jungbäume, Farn) 0..1 */
  undergrowth: number;
  /** Obergrenze Gras-/Blumeninstanzen */
  floraMax: number;
}

/** LOD-Grenzen je Klasse bei Faktor 1: [LOD0 bis, LOD1 bis] */
export const VEG_LOD: Record<VegClass, [number, number]> = {
  tree: [21, 50],
  bush: [14, 34],
  flora: [9, 20],
  rock: [18, 44],
  prop: [16, 40],
};

/** LOD-Stufe aus dem Abstand */
export function vegLod(cls: VegClass, dist: number, q: VegQuality): number {
  const d = VEG_LOD[cls];
  let L = dist < d[0] * q.lodScale ? 0 : dist < d[1] * q.lodScale ? 1 : 2;
  if (cls === 'tree') L = Math.max(L, q.treeMinLod);
  return L;
}

/** Baumart des Stils medieval (mitteleuropäisch) aus der Biom-Art: Nadelbäume → Fichte, Palme → Birke, Akazie → Eiche */
export function speciesOf(s: Species): TreeSpecies {
  switch (s) {
    case 'spruce':
    case 'spruce2':
    case 'cypress':
      return 'spruce';
    case 'birch':
    case 'palm':
      return 'birch';
    default:
      return 'oak';
  }
}

export interface VegPlaceInput {
  w: number;
  h: number;
  seed: number;
  terrain: ArrayLike<number>;
  height: ArrayLike<number>;
  trees: ArrayLike<number>;
  biome: Biome;
  occupied?: ArrayLike<number> | null;
  explored?: ArrayLike<number> | null;
  /** Spurstärke der Bodenkarte je Tile-Index (Felder, Trampelpfade, getretene Erde) */
  trace?: ((i: number) => number) | null;
  /** Wegstärke an einem Punkt (Umgebungskarte) */
  road?: ((x: number, y: number) => number) | null;
  /** Blickpunkt (Mitte des Sichtbereichs) und Kameraposition */
  camX: number;
  camZ: number;
  camPos: { x: number; y: number; z: number };
  /** Sichtradius der Vegetation (Tiles) */
  radius: number;
  q: VegQuality;
  cat: VegCatalog;
  /** Sichtprüfung (Kugel um den Fußpunkt, Radius r): false = außerhalb des erweiterten Sichtkegels, entfällt */
  visible?: ((x: number, y: number, z: number, r: number) => boolean) | null;
}

export interface VegStats {
  trees: number;
  bushes: number;
  flora: number;
  rocks: number;
  total: number;
  perLod: [number, number, number];
}

/** Ausgabe einer Instanz: Asset, LOD, Position, Drehung, Breite, Höhe, Neigung, Tönung */
export type VegEmit = (id: string, lod: number, x: number, y: number, z: number, rot: number, s: number, sy: number, lean: number, r: number, g: number, b: number) => void;

const pick = <T>(arr: T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

/** Variante eines Baumes: ältere Bäume häufiger, Jungbaum seltener */
function treeVariant(cat: VegCatalog, sp: TreeSpecies, r: number): string | null {
  const list = cat.trees[sp];
  if (!list.length) return null;
  const young = cat.young[sp];
  const old = list.filter((id) => id !== young);
  if (young && (r < 0.18 || !old.length)) return young;
  return old.length ? pick(old, (r - 0.18) / 0.82) : list[0];
}

export function placeVegetation(inp: VegPlaceInput, emit: VegEmit): VegStats {
  const { w, h, seed, cat, q } = inp;
  const st: VegStats = { trees: 0, bushes: 0, flora: 0, rocks: 0, total: 0, perLod: [0, 0, 0] };
  const cp = inp.camPos;
  const r = inp.radius;
  const fr = Math.min(q.floraRadius, r);
  const xa = Math.max(0, Math.floor(inp.camX - r));
  const xb = Math.min(w - 1, Math.ceil(inp.camX + r));
  const za = Math.max(0, Math.floor(inp.camZ - r));
  const zb = Math.min(h - 1, Math.ceil(inp.camZ + r));
  const treeAt = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && inp.trees[y * w + x] > 0;
  let floraN = 0;
  const out = (cls: VegClass, id: string | null | undefined, x: number, y: number, z: number, rot: number, s: number, sy: number, lean: number, tr: number, tg: number, tb: number, top = 0.5): void => {
    if (!id) return;
    if (inp.visible && !inp.visible(x, y + top, z, cls === 'tree' ? 3 : cls === 'flora' ? 0.6 : 1.5)) return;
    const dx = x - cp.x;
    const dy = y + top - cp.y;
    const dz = z - cp.z;
    const L = vegLod(cls, Math.sqrt(dx * dx + dy * dy + dz * dz), q);
    if (cls === 'flora' && L > 1) return;
    emit(L === 2 ? cat.lod2Alias[id] ?? id : id, L, x, y, z, rot, s, sy, lean, tr, tg, tb);
    st.perLod[L]++;
    st.total++;
    if (cls === 'tree') st.trees++;
    else if (cls === 'bush') st.bushes++;
    else if (cls === 'flora') st.flora++;
    else st.rocks++;
  };
  for (let y = za; y <= zb; y++) {
    for (let x = xa; x <= xb; x++) {
      const ddx = x + 0.5 - inp.camX;
      const ddz = y + 0.5 - inp.camZ;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 > r * r) continue;
      const i = y * w + x;
      if (inp.explored && !inp.explored[i]) continue;
      const t = inp.terrain[i];
      if (t === T.Water || t === T.Moat) continue;
      const hgt = inp.height[i];
      const base = hgt * HEIGHT_STEP;
      const r1 = hash2(seed + 3, x, y);
      const r2 = hash2(seed + 4, x, y);
      const r3 = hash2(seed + 5, x, y);
      const near = d2 <= fr * fr;
      const occ = inp.occupied ? inp.occupied[i] !== 0 : false;
      // ---- Bäume (Ressource Holz: immer gezeichnet)
      if (inp.trees[i] > 0) {
        const sp = speciesOf(pickSpecies(inp.biome, t, hgt, r1));
        const look = treeLook(inp.biome, pickSpecies(inp.biome, t, hgt, r1), r1, r2, r3, hash2(seed + 6, x, y));
        const id = treeVariant(cat, sp, hash2(seed + 41, x, y));
        const px = x + 0.5 + look.ox * 0.8;
        const pz = y + 0.5 + look.oz * 0.8;
        // Tönung abgeschwächt (Texturen tragen die Farbe), Herbstfärbung begrenzt
        const tint = look.tint.map((v) => Math.min(1.5, 1 + (v - 1) * 0.55)) as [number, number, number];
        const young = id === cat.young[sp];
        const s = (young ? 1.05 : 0.86) * (0.8 + (look.s - 0.6) * 0.5);
        out('tree', id, px, base, pz, look.rot, s, s * (look.sy / 1.05), look.lean, tint[0], tint[1], tint[2], 1.6);
        const dens = forestDensity(
          (treeAt(x - 1, y - 1) ? 1 : 0) + (treeAt(x, y - 1) ? 1 : 0) + (treeAt(x + 1, y - 1) ? 1 : 0) + (treeAt(x - 1, y) ? 1 : 0) + 1 + (treeAt(x + 1, y) ? 1 : 0) + (treeAt(x - 1, y + 1) ? 1 : 0) + (treeAt(x, y + 1) ? 1 : 0) + (treeAt(x + 1, y + 1) ? 1 : 0),
        );
        const r5 = hash2(seed + 7, x, y);
        // Unterwuchs: Jungbaum im dichten Wald, sonst Busch oder Farn
        if (dens > 0.45 && r5 < 0.32 * q.undergrowth && cat.young[sp]) {
          const ox = (hash2(seed + 8, x, y) - 0.5) * 0.7;
          const oz = (hash2(seed + 9, x, y) - 0.5) * 0.7;
          const s2 = 0.55 + hash2(seed + 10, x, y) * 0.25;
          out('tree', cat.young[sp], x + 0.5 - look.ox * 0.7 + ox * 0.4, base, y + 0.5 - look.oz * 0.7 + oz * 0.4, r2 * 6.28, s2, s2, 0, 1, 1, 1, 1);
        } else if (dens > 0.2 && r5 > 0.55 && r5 < 0.55 + 0.25 * q.undergrowth && cat.bush.length) {
          out('bush', pick(cat.bush, r3), x + 0.2 + r2 * 0.6, base, y + 0.2 + r1 * 0.6, r3 * 6.28, 0.8 + r2 * 0.5, 0.8 + r1 * 0.4, 0, 0.92 + r1 * 0.16, 0.95 + r2 * 0.1, 0.9 + r3 * 0.12, 0.4);
        }
        if (near && cat.fern.length && floraN < q.floraMax && hash2(seed + 11, x, y) < 0.55 * q.undergrowth) {
          const fx = x + 0.15 + hash2(seed + 12, x, y) * 0.7;
          const fz = y + 0.15 + hash2(seed + 13, x, y) * 0.7;
          out('flora', pick(cat.fern, r2), fx, base, fz, r1 * 6.28, 0.8 + r3 * 0.5, 0.8 + r2 * 0.4, 0, 1, 1, 1, 0.2);
          floraN++;
        }
        continue;
      }
      // ---- Felsgelände und Vorkommen
      if (t === T.Rock || t === T.StoneDeposit || t === T.IronDeposit || t === T.PitchSpring) {
        const tint: [number, number, number] = t === T.StoneDeposit ? [1.18, 1.15, 1.1] : t === T.IronDeposit ? [0.78, 0.6, 0.5] : t === T.PitchSpring ? [0.32, 0.3, 0.28] : [1, 1, 1];
        if (t === T.Rock) {
          // Felsgelände: kantige Felsen und Platten, seltener Findlinge, manche Tiles nur Steine (kein Wattebausch-Haufen)
          const big = r1 < 0.25 ? cat.boulder : cat.rock;
          if (r1 < 0.82) out('rock', pick(big.length ? big : cat.rock, r2), x + 0.5 + (r2 - 0.5) * 0.5, base - 0.05, y + 0.5 + (r3 - 0.5) * 0.5, r3 * 6.28, 0.75 + r2 * 0.6, 0.7 + r1 * 0.7, 0, tint[0] * (0.85 + r3 * 0.2), tint[1] * (0.85 + r3 * 0.2), tint[2] * (0.85 + r3 * 0.2), 0.6);
        } else {
          out('rock', pick(cat.rock.length ? cat.rock : cat.boulder, r2), x + 0.5 + (r2 - 0.5) * 0.3, base, y + 0.5 + (r3 - 0.5) * 0.3, r3 * 6.28, 0.7 + r1 * 0.4, 0.7 + r2 * 0.4, 0, tint[0], tint[1], tint[2], 0.4);
        }
        if (cat.stones.length && hash2(seed + 14, x, y) < 0.5) out('rock', pick(cat.stones, r1), x + hash2(seed + 15, x, y), base, y + hash2(seed + 16, x, y), r2 * 6.28, 0.8 + r3 * 0.6, 0.8 + r1 * 0.5, 0, tint[0], tint[1], tint[2], 0.1);
        continue;
      }
      if (occ) continue;
      const trace = inp.trace ? inp.trace(i) : 0;
      const cx = x + 0.5;
      const cz = y + 0.5;
      const road = inp.road ? inp.road(cx, cz) : 0;
      const treeNb = (treeAt(x - 1, y) ? 1 : 0) + (treeAt(x + 1, y) ? 1 : 0) + (treeAt(x, y - 1) ? 1 : 0) + (treeAt(x, y + 1) ? 1 : 0);
      const green = t === T.Oasis || t === T.Steppe || t === T.Swamp;
      // ---- Büsche (Waldsaum, vereinzelt im Offenen)
      if (q.undergrowth > 0 && cat.bush.length && trace < 0.3 && road < 0.15 && (green || t === T.Desert)) {
        const pb = (treeNb > 0 ? 0.24 : 0.012) * q.undergrowth;
        if (hash2(seed + 21, x, y) < pb) out('bush', pick(cat.bush, r1), x + 0.2 + r2 * 0.6, base, y + 0.2 + r3 * 0.6, r1 * 6.28, 0.75 + r3 * 0.6, 0.8 + r2 * 0.45, 0, 0.92 + r1 * 0.16, 0.95 + r2 * 0.1, 0.9 + r3 * 0.12, 0.4);
      }
      // ---- Steine und Findlinge im Offenen
      const hRock = hash2(seed + 23, x, y);
      if (t !== T.Swamp && trace < 0.2 && road < 0.2) {
        if (hRock < 0.004 && cat.boulder.length) out('rock', pick(cat.boulder, r2), x + 0.3 + r1 * 0.4, base, y + 0.3 + r3 * 0.4, r3 * 6.28, 0.7 + r2 * 0.6, 0.7 + r1 * 0.5, 0, 1, 1, 1, 0.4);
        else if (hRock < 0.03 && cat.stones.length) out('rock', pick(cat.stones, r2), x + 0.15 + r1 * 0.7, base, y + 0.15 + r3 * 0.7, r3 * 6.28, 0.7 + r2 * 0.7, 0.8 + r1 * 0.4, 0, 1, 1, 1, 0.05);
      }
      if (!near || !green || trace >= 0.4) continue;
      // ---- Gras (Dichte nach Stufe und Feuchte), hohes Gras am Waldsaum und an Wegrändern
      const moist = valueNoise(seed + 301, x * 0.07, y * 0.07);
      const edge = treeNb > 0 || (road > 0.12 && road < 0.6);
      const nG = q.grassPerTile > 0 ? Math.round(q.grassPerTile * (t === T.Steppe ? 0.55 + moist * 0.5 : 0.75 + moist * 0.45) * (1 - Math.min(1, trace * 1.6)) * (t === T.Swamp ? 0.7 : 1)) : 0;
      for (let g = 0; g < nG && floraN < q.floraMax; g++) {
        const gx = x + hash2(seed + 61 + g, x, y);
        const gz = y + hash2(seed + 71 + g, x, y);
        const rd = inp.road ? inp.road(gx, gz) : 0;
        if (rd > 0.45) continue;
        const tall = (edge || rd > 0.15) && hash2(seed + 51 + g, x, y) < 0.45 && cat.grassTall.length;
        const list = tall ? cat.grassTall : cat.grass;
        if (!list.length) continue;
        const tone = 0.86 + hash2(seed + 95 + g, x, y) * 0.28;
        const dryk = t === T.Steppe ? (1 - moist) * 0.15 : 0;
        out('flora', pick(list, hash2(seed + 81 + g, x, y)), gx, base, gz, hash2(seed + 85 + g, x, y) * 6.28, 0.8 + hash2(seed + 91 + g, x, y) * 0.55, 0.75 + hash2(seed + 93 + g, x, y) * 0.6, 0, tone * (1 + dryk), tone * (1 + dryk * 0.5), tone * (1 - dryk), 0.1);
        floraN++;
      }
      // ---- Wiesenblumen in Flecken
      if (cat.flowers.length && floraN < q.floraMax && road < 0.3) {
        const patch = valueNoise(seed + 77, x * 0.18, y * 0.18);
        if (patch > 0.6 && hash2(seed + 31, x, y) < (patch - 0.6) * 2.2 * Math.min(1, q.grassPerTile / 3 + 0.4)) {
          const n = 1 + (hash2(seed + 32, x, y) < 0.4 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            out('flora', pick(cat.flowers, hash2(seed + 33 + k, x, y)), x + hash2(seed + 34 + k, x, y), base, y + hash2(seed + 36 + k, x, y), r3 * 6.28 + k, 0.8 + r1 * 0.5, 0.85 + r2 * 0.4, 0, 1, 1, 1, 0.1);
            floraN++;
          }
        }
      }
      // ---- Farn am schattigen Waldsaum
      if (treeNb > 1 && cat.fern.length && hash2(seed + 37, x, y) < 0.3 * q.undergrowth && floraN < q.floraMax) {
        out('flora', pick(cat.fern, r1), x + 0.2 + r2 * 0.6, base, y + 0.2 + r3 * 0.6, r1 * 6.28, 0.8 + r3 * 0.4, 0.8 + r2 * 0.3, 0, 1, 1, 1, 0.2);
        floraN++;
      }
    }
  }
  return st;
}

/** Vegetationswerte einer Grafikstufe (aus QualityCfg) */
export function vegQualityOf(q: { envLodScale: number; envTreeLods: number; envGrassPerTile: number; envFloraRadius: number; undergrowth: number; envFloraMax: number }): VegQuality {
  return { lodScale: q.envLodScale, treeMinLod: Math.max(0, 3 - q.envTreeLods), grassPerTile: q.envGrassPerTile, floraRadius: q.envFloraRadius, undergrowth: Math.max(0.35, q.undergrowth), floraMax: q.envFloraMax };
}
