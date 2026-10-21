import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { BT, BUILDINGS, BuildingRec, ClientBuilding, ClientWorld, GameMap, U } from '@strongpoly/shared';
import { buildingKey, buildingTypeOf, targetKey, validateManifest, variantKey, variantOf, wallKey } from '../src/render/assets/manifest';
import type { AssetManifest } from '../src/render/assets/manifest';
import { convertGeometry, mergedLod, modelFromScene } from '../src/render/assets/model';
import { lodCfgOf, lodScale, pickLod } from '../src/render/assets/lod';
import { AssetMaterials, pickMapFile, textureBytes } from '../src/render/assets/materials';
import { AssetRegistry, assetRegistry, parseStyle } from '../src/render/assets/registry';
import { AssetTypeMesh } from '../src/render/assets/asset_mesh';
import { teamTable } from '../src/render/instanced';
import { EntityRenderer } from '../src/render/entities';
import { QUALITY } from '../src/render/quality';
// @ts-expect-error – reines JS-Modul der Skripte (Manifest-Generator)
import { buildManifest, serialize } from '../../../scripts/lib/asset_manifest.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const PUB = path.join(ROOT, 'packages/client/public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.json'), 'utf8')) as AssetManifest;
const exists = (f: string): boolean => fs.existsSync(path.join(PUB, f));

async function parseGlb(file: string): Promise<THREE.Object3D> {
  const buf = fs.readFileSync(path.join(PUB, file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((ok, err) => new GLTFLoader().parse(ab, '', (g) => ok(g.scene), err));
}

function stubRegistry(loader: (url: string) => Promise<THREE.Object3D>, manifest: AssetManifest = MANIFEST): AssetRegistry {
  const r = new AssetRegistry();
  r.fetchManifest = async () => JSON.parse(JSON.stringify(manifest)) as AssetManifest;
  r.loader = loader;
  return r;
}

describe('Asset-Manifest (public/assets/manifest.json)', () => {
  it('ist aktuell (scripts/asset-manifest.mjs ergibt dieselbe Datei)', () => {
    const { manifest, problems } = buildManifest(ROOT);
    expect(problems).toEqual([]);
    expect(serialize(manifest)).toBe(fs.readFileSync(path.join(PUB, 'manifest.json'), 'utf8'));
  });
  it('ist gültig: Dateien vorhanden, LODs, Footprint passt zu BUILDINGS, Materialien aus der Bibliothek', () => {
    expect(validateManifest(MANIFEST, exists)).toEqual([]);
    expect(Object.keys(MANIFEST.assets).length).toBeGreaterThan(0);
    for (const a of Object.values(MANIFEST.assets)) {
      expect(a.lods.map((l) => l.node)).toEqual(a.lods.map((_, i) => `LOD${i}`));
      const bt = buildingTypeOf(a.target.building);
      if (bt >= 0) expect(a.footprint).toEqual([BUILDINGS[bt].w, BUILDINGS[bt].h]);
    }
  });
  it('Prüfung erkennt Fehler: falscher Footprint, unbekanntes Material, LOD-Reihenfolge, doppeltes Ziel, fehlende Datei', () => {
    const m = JSON.parse(JSON.stringify(MANIFEST)) as AssetManifest;
    const w = m.assets.well;
    w.footprint = [2, 2];
    w.lods[1].tris = w.lods[0].tris + 1;
    w.lods[0].materials.push('M_Gold');
    m.assets.well2 = { ...JSON.parse(JSON.stringify(MANIFEST.assets.well)), id: 'well2', file: 'models/fehlt.glb' };
    const p = validateManifest(m, exists).join('\n');
    expect(p).toMatch(/Footprint/);
    expect(p).toMatch(/M_Gold/);
    expect(p).toMatch(/LOD1 hat mehr Dreiecke/);
    expect(p).toMatch(/doppelt/);
    expect(p).toMatch(/Datei fehlt/);
  });
  it('Zielschlüssel des Override-Registers', () => {
    expect(targetKey({ building: 'Well' })).toBe(buildingKey(BT.Well));
    expect(targetKey({ wall: 'WallHigh', piece: 'arm' })).toBe(wallKey(BT.WallHigh, 'arm'));
    expect(targetKey({ unit: 'Spearman' })).toBe(`u:${U.Spearman}`);
    expect(targetKey({ building: 'Burg' })).toBeNull();
    expect(targetKey({ prop: 'woodpile' })).toBeNull();
    expect(parseStyle('medieval')).toBe('medieval');
    expect(parseStyle('x')).toBeNull();
  });
  it('Modellvarianten: eigener Schlüssel je Variante, Auswahl stabil je Gebäude-ID und gestreut', () => {
    expect(targetKey({ building: 'Hovel', variant: 1 })).toBe(variantKey(BT.Hovel, 1));
    expect(targetKey({ building: 'Hovel', variant: 0 })).toBe(buildingKey(BT.Hovel));
    expect(targetKey({ building: 'Hovel', variant: 1.5 })).toBeNull();
    const m = JSON.parse(JSON.stringify(MANIFEST)) as AssetManifest;
    m.assets.well_b = { ...JSON.parse(JSON.stringify(MANIFEST.assets.well)), id: 'well_b', target: { building: 'Well', variant: 1 } };
    expect(validateManifest(m, exists).filter((p) => p.startsWith('well_b'))).toEqual([]);
    for (let id = 1; id < 50; id++) expect(variantOf(id, 2)).toBe(variantOf(id, 2));
    const counts = [0, 0];
    for (let id = 1; id <= 40; id++) counts[variantOf(id, 2)]++;
    expect(Math.min(...counts)).toBeGreaterThan(10);
    // vier aufeinanderfolgende IDs (typische Häusergruppe) nutzen beide Varianten
    expect(new Set([5, 6, 7, 8].map((id) => variantOf(id, 2))).size).toBe(2);
    expect(variantOf(7, 1)).toBe(0);
  });
});

describe('GLB → Laufzeitmodell (Brunnen, echte Datei)', () => {
  it('LOD-Knoten, Materialteile, Dreiecke wie im Manifest; Bauanimations- und Datenattribute vorhanden', async () => {
    const def = MANIFEST.assets.well;
    const model = modelFromScene(def, await parseGlb(def.file));
    expect(model.lods.length).toBe(3);
    expect(model.lods.map((l) => l.tris)).toEqual(def.tris);
    for (const lod of model.lods) {
      for (const p of lod.parts) {
        expect(MANIFEST.materials[p.material]).toBeDefined();
        const g = p.geometry;
        for (const a of ['position', 'normal', 'uv', 'aData', 'aBuild', 'aPivot', 'aMeta']) expect(g.getAttribute(a), `${p.material}.${a}`).toBeDefined();
        const b = g.getAttribute('aBuild');
        for (let i = 0; i < b.count; i += 7) {
          expect(b.getX(i)).toBeGreaterThanOrEqual(0.1 - 1e-6);
          expect(b.getY(i)).toBeGreaterThan(b.getX(i));
          expect(b.getY(i)).toBeLessThanOrEqual(0.87);
          expect(b.getW(i)).toBeGreaterThan(0);
        }
        // AO in der Datenfarbe gebacken (nicht überall 1)
        const d = g.getAttribute('aData');
        let lo = 1;
        for (let i = 0; i < d.count; i++) lo = Math.min(lo, d.getX(i));
        expect(lo).toBeLessThan(0.95);
      }
    }
    // Höhe/Bounding-Box innerhalb Footprint + Toleranz, Ursprung Footprint-Mitte am Boden
    expect(model.height).toBeCloseTo(def.height, 1);
    const box = new THREE.Box3();
    for (const p of model.lods[0].parts) box.union(p.geometry.boundingBox!);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(0.2);
  });
  it('Ankerpunkte aus glTF-extras (Position in three-Koordinaten, Front = +z)', async () => {
    const def = MANIFEST.assets.well;
    const model = modelFromScene(def, await parseGlb(def.file));
    const a = model.anchors.find((x) => x.kind === 'work');
    expect(a).toBeDefined();
    expect(a!.extras.kind).toBe('work');
    const m = def.anchors.find((x) => x.name === a!.name)!;
    for (let k = 0; k < 3; k++) expect(a!.pos[k]).toBeCloseTo(m.pos[k], 3);
    // Arbeitsplatz liegt vorn (Front = +z bei b.r = 0)
    expect(a!.pos[2]).toBeGreaterThan(0.4);
  });
  it('Attribut-Zuordnung: _PART/_PIVOT → aPivot, _STYLE/_SLOT → aStyle, COLOR_0.a → Teamfarbe; ohne _BUILD wächst das Teil als Ganzes', () => {
    const g = new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0);
    const n = g.getAttribute('position').count;
    g.setAttribute('_part', new THREE.Float32BufferAttribute(new Array(n).fill(3), 1));
    g.setAttribute('_pivot', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [0.1, 0.8, 0]), 3));
    g.setAttribute('_style', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [3, 1, 0.5]), 3));
    g.setAttribute('_slot', new THREE.Float32BufferAttribute(new Array(n).fill(4), 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [0.5, 0.2, 0.1, 1]), 4));
    const c = convertGeometry(g, new THREE.Matrix4());
    const ap = c.getAttribute('aPivot');
    expect([ap.getX(0), ap.getY(0), ap.getZ(0), ap.getW(0)]).toEqual([expect.closeTo(0.1), expect.closeTo(0.8), 0, 3]);
    const st = c.getAttribute('aStyle');
    expect([st.getX(0), st.getY(0), st.getZ(0), st.getW(0)]).toEqual([3, 1, 0.5, 4]);
    expect(c.getAttribute('aMeta').getX(0)).toBe(1);
    const b = c.getAttribute('aBuild');
    expect(b.getZ(0)).toBeCloseTo(0);
    expect(b.getW(0)).toBeCloseTo(2);
  });
  it('Bauvorschau/Hover-Geometrie aus einer LOD-Stufe', async () => {
    const def = MANIFEST.assets.well;
    const model = modelFromScene(def, await parseGlb(def.file));
    const g = mergedLod(model, 1, () => new THREE.Color(1, 0, 0));
    expect(g.getAttribute('position').count).toBe(model.lods[1].tris * 3);
    expect(g.getAttribute('color').getX(0)).toBeGreaterThan(0);
    expect(new THREE.EdgesGeometry(g, 28).getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('LOD-Wahl mit Hysterese', () => {
  const cfg = lodCfgOf(QUALITY.medium);
  it('Grenzen und Hysterese: kein Flackern an der Grenze', () => {
    expect(pickLod(-1, 10, cfg)).toBe(0);
    expect(pickLod(-1, cfg.d01 + 1, cfg)).toBe(1);
    expect(pickLod(-1, cfg.d12 + 1, cfg)).toBe(2);
    // knapp über der Grenze bleibt LOD0, erst jenseits der Hysterese wechselt es
    expect(pickLod(0, cfg.d01 + cfg.hyst * 0.5, cfg)).toBe(0);
    expect(pickLod(0, cfg.d01 + cfg.hyst + 0.1, cfg)).toBe(1);
    expect(pickLod(1, cfg.d01 - cfg.hyst * 0.5, cfg)).toBe(1);
    expect(pickLod(1, cfg.d01 - cfg.hyst - 0.1, cfg)).toBe(0);
    // Sprung über zwei Stufen (Zoom)
    expect(pickLod(0, cfg.d12 + 20, cfg)).toBe(2);
    expect(pickLod(2, 1, cfg)).toBe(0);
  });
  it('Niedrig zeichnet nie LOD0; Größenfaktor verschiebt die Grenzen; nur vorhandene Stufen', () => {
    const low = lodCfgOf(QUALITY.low);
    expect(pickLod(-1, 1, low)).toBe(1);
    expect(pickLod(-1, cfg.d01 * 1.5, cfg, 2)).toBe(0);
    expect(pickLod(-1, 500, cfg, 1, 2)).toBe(1);
    expect(lodScale(1.9)).toBeCloseTo(0.7);
    expect(lodScale(20)).toBeCloseTo(2.2);
  });
});

describe('Laufzeit-Materialbibliothek', () => {
  it('ein Material je M_* und Variante, Rückfallwerte ohne Texturen, unbekannte Namen neutral', () => {
    const lib = new AssetMaterials();
    lib.configure(MANIFEST.materials, '/assets/');
    const a = lib.material('M_Stone_Rubble', 'final');
    expect(lib.material('M_Stone_Rubble', 'final')).toBe(a);
    expect(lib.material('M_Stone_Rubble', 'clip')).not.toBe(a);
    expect(a).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(a.name).toBe('M_Stone_Rubble');
    expect(a.roughness).toBeCloseTo(MANIFEST.materials.M_Stone_Rubble.rough);
    expect(a.color.getHexString()).toBe(new THREE.Color(MANIFEST.materials.M_Stone_Rubble.base).getHexString());
    expect(a.customProgramCacheKey()).toBe(lib.material('M_Timber_Oak', 'final').customProgramCacheKey());
    expect(lib.material('M_Iron_Wrought', 'final').metalness).toBeGreaterThan(0.5);
    expect(lib.material('M_Unbekannt', 'final').color).toBeDefined();
    expect(lib.material('M_Foliage', 'final').alphaTest).toBeGreaterThan(0);
    expect(lib.material('M_Foliage', 'final').side).toBe(THREE.DoubleSide);
  });
  it('Texturwahl nach Grafikstufe (kleinere Fassungen) und KTX2 nur mit Unterstützung; Speicherschätzung', () => {
    const e = { file: 'textures/M_X/albedo.webp', bytes: 1, w: 2048, h: 2048, format: 'webp', sizes: { '1024': 'textures/M_X/albedo_1024.webp', '512': 'textures/M_X/albedo_512.webp' }, alt: { ktx2: 'textures/M_X/albedo.ktx2' } };
    expect(pickMapFile(e, 2048, false)).toBe(e.file);
    expect(pickMapFile(e, 1024, false)).toBe(e.sizes['1024']);
    expect(pickMapFile(e, 512, false)).toBe(e.sizes['512']);
    expect(pickMapFile(e, 256, false)).toBe(e.sizes['512']);
    expect(pickMapFile(e, 1024, true)).toBe('textures/M_X/albedo.ktx2');
    expect(textureBytes(1024, 1024, 4)).toBe(Math.round(1024 * 1024 * 4 * (4 / 3)));
  });
});

// ---------------------------------------------------------------- Register, Rückfall, Integration im EntityRenderer

function mkWorld(): ClientWorld {
  const w = new ClientWorld();
  w.map = new GameMap(32, 32);
  w.bldAt = new Int32Array(w.map.n);
  w.players = [{ id: 0, name: 'A', team: 0, color: 0, kind: 'human', alive: true, keepX: 10, keepY: 10 }];
  w.tick = 5000;
  return w;
}
function place(w: ClientWorld, id: number, t: number, x: number, y: number, n = 0): ClientBuilding {
  const rec: BuildingRec = { i: id, t, o: 0, x, y, r: 0, hp: BUILDINGS[t].hp, f: 0, u: 0, q: 0, s: 0, c: 0, b: 0, p: 0, n };
  const cb = rec as ClientBuilding;
  w.placeBuilding(cb);
  w.buildings.set(id, cb);
  w.buildingsDirty = true;
  return cb;
}
const cam = new THREE.PerspectiveCamera(36, 1.6, 0.5, 500);
const opts = (now: number) => ({ alpha: 1, now, camYaw: 0, selected: new Set<number>(), selectedBuilding: 0, hoverTile: null, visible: null, explored: null, me: 0, myTeam: 0, teamOfPlayer: [0], camera: cam });
const assetMeshesOf = (er: EntityRenderer): THREE.InstancedMesh[] => {
  const out: THREE.InstancedMesh[] = [];
  er.group.traverse((o) => {
    if (o.name.startsWith('asset:')) out.push(o as THREE.InstancedMesh);
  });
  return out;
};
const wellProcedural = (er: EntityRenderer): number => ((er as unknown as { bldMeshes: ({ count: number } | null)[] }).bldMeshes[BT.Well]?.count ?? 0);

describe('Override-Register und Rückfall', () => {
  it('Stil classic: kein Laden, kein Override', async () => {
    let calls = 0;
    const r = stubRegistry(async () => {
      calls++;
      return new THREE.Group();
    });
    expect(r.forBuilding(BT.Well)).toBeNull();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(calls).toBe(0);
    expect(r.manifestState).toBe('idle');
  });
  it('Ladefehler (fehlende Datei) → kein Modell, keine Ausnahme, dauerhaft prozedural', async () => {
    const r = stubRegistry(async () => {
      throw new Error('HTTP 404');
    });
    r.setStyle('medieval');
    await r.loadManifest();
    expect(r.forBuilding(BT.Well)).toBeNull();
    expect(await r.load('well')).toBeNull();
    expect(r.isFailed('well')).toBe(true);
    expect(r.forBuilding(BT.Well)).toBeNull();
    expect(r.stats.assets.well.ok).toBe(false);
    // unbekanntes Asset / kaputtes Manifest
    expect(await r.load('gibtsnicht')).toBeNull();
    const r2 = new AssetRegistry();
    r2.fetchManifest = async () => {
      throw new Error('offline');
    };
    r2.setStyle('medieval');
    expect(await r2.loadManifest()).toBeNull();
    expect(r2.forBuilding(BT.Well)).toBeNull();
  });
  it('geladen → Override; manuelles Register (null erzwingt prozedural); Version steigt', async () => {
    const def = MANIFEST.assets.well;
    const r = stubRegistry(() => parseGlb(def.file));
    r.setStyle('medieval');
    await r.preload();
    const m = r.forBuilding(BT.Well);
    expect(m?.id).toBe('well');
    const v = r.version;
    r.register(buildingKey(BT.Well), null);
    expect(r.forBuilding(BT.Well)).toBeNull();
    r.unregister(buildingKey(BT.Well));
    expect(r.forBuilding(BT.Well)?.id).toBe('well');
    expect(r.version).toBeGreaterThan(v);
    r.register(buildingKey(BT.Keep), 'well');
    await r.preload(['well']);
    expect(r.forBuilding(BT.Keep)?.id).toBe('well');
    r.setStyle('classic');
    expect(r.forBuilding(BT.Well)).toBeNull();
  });
  it('Modellvarianten im Register: Variante je Gebäude-ID, Rückfall auf das Grundmodell', async () => {
    const def = MANIFEST.assets.well;
    const man = JSON.parse(JSON.stringify(MANIFEST)) as AssetManifest;
    man.assets.well_b = { ...JSON.parse(JSON.stringify(def)), id: 'well_b', target: { building: 'Well', variant: 1 } };
    const r = stubRegistry(() => parseGlb(def.file), man);
    r.setStyle('medieval');
    await r.preload();
    expect(r.variants.get(buildingKey(BT.Well))).toBe(1);
    expect(r.forBuilding(BT.Well)?.id).toBe('well');
    const ids = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => r.forBuilding(BT.Well, id)?.id);
    expect(new Set(ids)).toEqual(new Set(['well', 'well_b']));
    for (let id = 1; id <= 8; id++) expect(r.forBuilding(BT.Well, id)?.id).toBe(variantOf(id, 2) ? 'well_b' : 'well');
    r.register(variantKey(BT.Well, 1), null);
    for (let id = 1; id <= 8; id++) expect(r.forBuilding(BT.Well, id)?.id).toBe('well');
  });
  it('AssetTypeMesh: ein InstancedMesh je LOD × Material, LOD nach Kameraabstand, relod nur bei Änderung', async () => {
    const def = MANIFEST.assets.well;
    const model = modelFromScene(def, await parseGlb(def.file));
    const r = new AssetRegistry();
    r.materials.configure(MANIFEST.materials, '/assets/');
    const g = new THREE.Group();
    const am = new AssetTypeMesh(model, g, r.materials, teamTable([0xff0000]), 'final', lodCfgOf(QUALITY.medium), true);
    am.begin();
    am.push(1, 0, 0, 0, 0, 1, 1, 0);
    am.push(2, 300, 0, 0, 0, 1, 1, 0);
    am.end(new THREE.Vector3(0, 5, 5));
    expect(am.perLod).toEqual([1, 0, 1]);
    const meshes = g.children as THREE.InstancedMesh[];
    expect(meshes.length).toBe(model.lods[0].parts.length + model.lods[2].parts.length);
    expect(meshes.every((m) => m.count === 1)).toBe(true);
    expect(am.relod(new THREE.Vector3(0, 5, 5.2))).toBe(false);
    expect(am.relod(new THREE.Vector3(300, 5, 5))).toBe(true);
    expect(am.perLod).toEqual([1, 0, 1]);
    am.dispose();
  });
});

describe('EntityRenderer mit GLB-Override (Stil medieval)', () => {
  it('fertiges Gebäude, Baustelle (Höhenmaske), Rückfall bei Fehler, classic unverändert', async () => {
    const def = MANIFEST.assets.well;
    const saved = { loader: assetRegistry.loader, fetch: assetRegistry.fetchManifest };
    try {
      // Rückfall: Asset lädt nicht → prozedurales Modell
      assetRegistry.fetchManifest = async () => JSON.parse(JSON.stringify(MANIFEST)) as AssetManifest;
      assetRegistry.loader = async () => {
        throw new Error('HTTP 404');
      };
      assetRegistry.setStyle('medieval');
      await assetRegistry.preload();
      const w0 = mkWorld();
      place(w0, 1, BT.Well, 5, 5);
      const er0 = new EntityRenderer(w0);
      er0.update(0.016, opts(500));
      expect(assetMeshesOf(er0).length).toBe(0);
      expect(wellProcedural(er0)).toBe(1);

      // Erfolg: neues Register-Objekt ist nicht nötig – Fehlerzustand gilt je Asset; frische Registry-Daten über einen neuen Lader
      const fresh = stubRegistry(() => parseGlb(def.file));
      Object.assign(assetRegistry, { loader: fresh.loader });
      (assetRegistry as unknown as { failed: Set<string> }).failed.clear();
      await assetRegistry.preload();
      const w = mkWorld();
      place(w, 1, BT.Well, 5, 5);
      place(w, 2, BT.Well, 9, 5, w.tick - 3);
      const er = new EntityRenderer(w);
      er.applyQuality(QUALITY.medium, true);
      cam.position.set(5.5, 6, 12);
      er.update(0.016, opts(500));
      const ms = assetMeshesOf(er);
      expect(ms.length).toBeGreaterThan(0);
      expect(ms.some((m) => m.name.startsWith('asset:well:') && m.count >= 1)).toBe(true);
      expect(wellProcedural(er)).toBe(0);
      // Baustelle nutzt das Clip-Material (Höhenmaske, iAnim.z = Fortschritt)
      const con = ms.filter((m) => (m.material as THREE.Material).customProgramCacheKey?.() === 'spAsset:clip' && m.count > 0);
      expect(con.length).toBeGreaterThan(0);
      const ia = (con[0].geometry.getAttribute('iAnim') as THREE.InstancedBufferAttribute).getZ(0);
      expect(ia).toBeGreaterThan(0);
      expect(ia).toBeLessThan(1);

      // classic: wieder prozedural
      assetRegistry.setStyle('classic');
      er.update(0.016, opts(501));
      expect(assetMeshesOf(er).filter((m) => m.count > 0).length).toBe(0);
      expect(wellProcedural(er)).toBeGreaterThanOrEqual(1);
    } finally {
      assetRegistry.setStyle('classic');
      assetRegistry.loader = saved.loader;
      assetRegistry.fetchManifest = saved.fetch;
    }
  });
});
