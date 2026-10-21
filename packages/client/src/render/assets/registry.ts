import type * as THREE from 'three';
import type { QualityCfg } from '../quality';
import { AssetMaterials } from './materials';
import { buildingKey, targetKey, unitKey, validateManifest, wallKey } from './manifest';
import type { AssetDef, AssetManifest, WallPiece } from './manifest';
import { modelFromScene } from './model';
import type { AssetModel } from './model';

/**
 * Override-Register und Stilschalter der GLB-Assets.
 *
 *  - Stil `classic` (Standard): nichts wird geladen, alle Renderer zeichnen die prozeduralen Modelle wie bisher.
 *  - Stil `medieval` (URL `?style=medieval` oder Einstellung): das Manifest wird geladen; jedes Asset mit einem Ziel
 *    (`target.building` → Gebäudetyp, `target.wall`+`piece` → Mauerstück, `target.unit` → Einheitentyp) ersetzt das
 *    prozedurale Modell, SOBALD es samt Texturen geladen ist. Bis dahin, bei Ladefehlern oder fehlenden Dateien bleibt das
 *    prozedurale Modell (Rückfall) – niemals eine Ausnahme im Spiel.
 *  - Zusätzlich lassen sich Overrides im Code setzen (`register('b:29', 'well')`) oder entfernen (`unregister`).
 *
 * Renderer fragen synchron (`forBuilding`, `forWall`, `forUnit`) und bekommen ein fertiges Modell oder null; der erste
 * Aufruf startet das Laden. `version` steigt bei jeder Änderung (Renderer verwerfen dann ihre Zwischenspeicher).
 */

export type ArtStyle = 'classic' | 'medieval';

export function parseStyle(v: string | null | undefined): ArtStyle | null {
  return v === 'medieval' || v === 'classic' ? v : null;
}

export interface AssetLoadStats {
  /** Manifest geladen (ms seit Start des Ladens) */
  manifestMs: number;
  /** je Asset: Ladezeit GLB + Texturen (ms), Byte der Datei */
  assets: Record<string, { ms: number; bytes: number; ok: boolean; error?: string }>;
  /** Gesamtzeit vom ersten Laden bis alles Angeforderte fertig ist (ms) */
  totalMs: number;
}

/** Lädt eine GLB-Datei und liefert die glTF-Szene (austauschbar für Tests) */
export type GlbLoader = (url: string) => Promise<THREE.Object3D>;

/** Standard-Lader: GLTFLoader + Meshopt-Decoder (EXT_meshopt_compression, KHR_mesh_quantization), erst bei Bedarf geladen */
export const defaultGlbLoader: GlbLoader = async (url) => {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  const g = await l.loadAsync(url);
  return g.scene;
};

export class AssetRegistry {
  style: ArtStyle = 'classic';
  base = '/assets/';
  manifest: AssetManifest | null = null;
  manifestState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  /** Probleme der Manifestprüfung (betroffene Assets werden übersprungen) */
  problems: string[] = [];
  /** Zielschlüssel → Asset-ID */
  readonly overrides = new Map<string, string>();
  private manual = new Map<string, string | null>();
  private models = new Map<string, AssetModel>();
  private pending = new Map<string, Promise<AssetModel | null>>();
  private failed = new Set<string>();
  readonly materials = new AssetMaterials();
  version = 0;
  loader: GlbLoader = defaultGlbLoader;
  /** Manifest-Quelle (austauschbar für Tests) */
  fetchManifest: (url: string) => Promise<AssetManifest> = async (url) => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as AssetManifest;
  };
  readonly stats: AssetLoadStats = { manifestMs: 0, assets: {}, totalMs: 0 };
  private t0 = 0;
  private listeners = new Set<() => void>();
  private manifestP: Promise<AssetManifest | null> | null = null;

  /** Rückruf bei jeder Änderung (Asset fertig, Stilwechsel); Rückgabe: abmelden */
  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private changed(): void {
    this.version++;
    for (const f of this.listeners) f();
  }

  setStyle(s: ArtStyle): void {
    if (s === this.style) return;
    this.style = s;
    if (s === 'medieval') void this.loadManifest();
    this.changed();
  }

  get active(): boolean {
    return this.style === 'medieval';
  }

  /** Renderer/Grafikstufe (Texturgröße, Anisotropie) */
  attachRenderer(r: THREE.WebGLRenderer): void {
    this.materials.renderer = r;
  }

  applyQuality(q: QualityCfg): void {
    this.materials.setQuality(q.assetTexMax, q.anisotropy);
  }

  /** Override im Code: Zielschlüssel (`b:<BT>` …) → Asset-ID; `null` erzwingt das prozedurale Modell */
  register(key: string, id: string | null): void {
    this.manual.set(key, id);
    this.rebuildOverrides();
    this.changed();
  }

  unregister(key: string): void {
    this.manual.delete(key);
    this.rebuildOverrides();
    this.changed();
  }

  private rebuildOverrides(): void {
    this.overrides.clear();
    const bad = new Set<string>();
    for (const p of this.problems) bad.add(p.split(':')[0]);
    if (this.manifest) {
      for (const a of Object.values(this.manifest.assets)) {
        if (bad.has(a.id)) continue;
        const k = targetKey(a.target ?? {});
        if (k) this.overrides.set(k, a.id);
      }
    }
    for (const [k, v] of this.manual) {
      if (v === null) this.overrides.delete(k);
      else this.overrides.set(k, v);
    }
  }

  /** Manifest laden (einmal); Fehler → kein Asset (prozeduraler Rückfall) */
  loadManifest(): Promise<AssetManifest | null> {
    if (this.manifestP) return this.manifestP;
    this.manifestState = 'loading';
    this.t0 = performance.now();
    this.manifestP = (async () => {
      try {
        const m = await this.fetchManifest(this.base + 'manifest.json');
        this.manifest = m;
        this.problems = validateManifest(m);
        this.materials.configure(m.materials, this.base);
        this.materials.version = {};
        for (const md of Object.values(m.materials)) for (const e of Object.values(md.maps ?? {})) if (e?.hash) this.materials.version[e.file] = e.hash;
        this.manifestState = 'ready';
        this.stats.manifestMs = performance.now() - this.t0;
        this.rebuildOverrides();
        this.changed();
        return m;
      } catch (e) {
        this.manifestState = 'failed';
        this.problems = [`manifest: ${e instanceof Error ? e.message : String(e)}`];
        return null;
      }
    })();
    return this.manifestP;
  }

  /** Asset-Definition zu einer ID (nach dem Laden des Manifests) */
  def(id: string): AssetDef | null {
    return this.manifest?.assets[id] ?? null;
  }

  /** Modell laden (GLB + Texturen der Materialien); null bei Fehler – dann bleibt dauerhaft der Rückfall */
  load(id: string): Promise<AssetModel | null> {
    const have = this.models.get(id);
    if (have) return Promise.resolve(have);
    const p0 = this.pending.get(id);
    if (p0) return p0;
    const p = (async (): Promise<AssetModel | null> => {
      const t = performance.now();
      const m = await this.loadManifest();
      const def = m?.assets[id];
      if (!def) {
        this.failed.add(id);
        this.stats.assets[id] = { ms: 0, bytes: 0, ok: false, error: 'nicht im Manifest' };
        return null;
      }
      try {
        const scene = await this.loader(this.base + def.file + (def.hash ? `?v=${def.hash}` : ''));
        const model = modelFromScene(def, scene);
        if (!model.lods.length) throw new Error('keine LOD-Geometrie');
        const mats = new Set<string>();
        for (const l of model.lods) for (const pt of l.parts) mats.add(pt.material);
        await this.materials.ensure([...mats]);
        model.loadMs = performance.now() - t;
        this.models.set(id, model);
        this.stats.assets[id] = { ms: model.loadMs, bytes: def.bytes, ok: true };
        this.stats.totalMs = Math.max(this.stats.totalMs, performance.now() - this.t0);
        this.changed();
        return model;
      } catch (e) {
        this.failed.add(id);
        this.stats.assets[id] = { ms: performance.now() - t, bytes: def.bytes, ok: false, error: e instanceof Error ? e.message : String(e) };
        console.info(`[assets] ${id}: Laden fehlgeschlagen, prozedurales Modell bleibt (${this.stats.assets[id].error})`);
        return null;
      } finally {
        this.pending.delete(id);
      }
    })();
    this.pending.set(id, p);
    return p;
  }

  /** Modell zu einem Zielschlüssel: fertig geladen → Modell; sonst null (Laden wird angestoßen) */
  forKey(key: string): AssetModel | null {
    if (this.style !== 'medieval') return null;
    if (this.manifestState !== 'ready') {
      if (this.manifestState === 'idle') void this.loadManifest();
      return null;
    }
    const id = this.overrides.get(key);
    if (!id || this.failed.has(id)) return null;
    const m = this.models.get(id);
    if (m) return m;
    void this.load(id);
    return null;
  }

  forBuilding(bt: number): AssetModel | null {
    return this.forKey(buildingKey(bt));
  }

  forWall(bt: number, piece: WallPiece): AssetModel | null {
    return this.forKey(wallKey(bt, piece));
  }

  forUnit(ut: number): AssetModel | null {
    return this.forKey(unitKey(ut));
  }

  /** Alle Assets mit Ziel (bzw. die genannten IDs) laden; für LookDev/Messungen. Rückgabe: Anzahl geladen/fehlgeschlagen */
  async preload(ids?: string[]): Promise<{ ok: number; failed: number; ms: number }> {
    const t = performance.now();
    const m = await this.loadManifest();
    if (!m) return { ok: 0, failed: 0, ms: performance.now() - t };
    const list = ids ?? [...new Set(this.overrides.values())];
    const res = await Promise.all(list.map((id) => this.load(id)));
    return { ok: res.filter(Boolean).length, failed: res.filter((r) => !r).length, ms: performance.now() - t };
  }

  /** alle geladenen Modelle (Statistik) */
  loadedModels(): AssetModel[] {
    return [...this.models.values()];
  }

  isFailed(id: string): boolean {
    return this.failed.has(id);
  }
}

/** gemeinsames Register der Seite */
export const assetRegistry = new AssetRegistry();
