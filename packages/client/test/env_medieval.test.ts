import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { T, generateMap } from '@strongpoly/shared';
import { MEDIEVAL_LOOK, buildSky, fogDensityFor, hemiOf, skyRadiance, sunColorOf, sunDirOf, toneMapJs } from '../src/render/env/atmosphere';
import { CROSS_MAX, EnvMap, computeEnvMap, envRes, polylineSegs, roadAt } from '../src/render/env/envmap';
import { VEG_LOD, catalogOf, catalogReady, placeVegetation, speciesOf, vegLod, vegQualityOf } from '../src/render/env/veg_place';
import type { VegCatalog, VegPlaceInput } from '../src/render/env/veg_place';
import { snapTrails } from '../src/render/env/veg_layer';
import { trailSegments } from '../src/render/groundmap';
import { TerrainRenderer } from '../src/render/terrain';
import { LAYER_TINT, TERRAIN_LAYERS, terrainTexSize } from '../src/render/env/terrain_medieval';
import { biomeOf } from '../src/render/biome';
import { QUALITY } from '../src/render/quality';
import { modelFromScene } from '../src/render/assets/model';
import type { AssetManifest } from '../src/render/assets/manifest';
import { validateManifest } from '../src/render/assets/manifest';
import { LOOKDEV_CAMS, LOOKDEV_LAYOUT, lookdevSpec } from '../src/lookdev_scene';

const ROOT = path.resolve(__dirname, '../../..');
const PUB = path.join(ROOT, 'packages/client/public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.json'), 'utf8')) as AssetManifest;
const VEG = Object.values(MANIFEST.assets).filter((a) => a.veg);
const CAT = catalogOf(VEG);

/** Budgets je Klasse (assets/blender/lib/sp/veg.py BUDGETS) – Auftrag: Baum 6000/1500/300, Fels 1500 */
const BUDGETS: Record<string, number[]> = { tree: [6000, 1500, 300], bush: [2400, 700, 160], flora: [420, 140, 40], rock: [1500, 500, 150], prop: [1500, 600, 150] };

async function parseGlb(file: string): Promise<THREE.Object3D> {
  const buf = fs.readFileSync(path.join(PUB, file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((ok, err) => new GLTFLoader().parse(ab, '', (g) => ok(g.scene), err));
}

describe('Licht und Atmosphäre (Stil medieval)', () => {
  it('Sonnenfarbe: tief wärmer, hoch fast weiß; Rot bleibt 1', () => {
    const lo = sunColorOf(8);
    const mid = sunColorOf(30);
    const hi = sunColorOf(70);
    expect(lo[0]).toBe(1);
    expect(lo[1]).toBeLessThan(mid[1]);
    expect(mid[1]).toBeLessThanOrEqual(hi[1]);
    expect(lo[2]).toBeLessThan(mid[2]);
    expect(hi[2]).toBeGreaterThan(0.8);
    const d = sunDirOf(232, 34);
    expect(Math.hypot(...d)).toBeCloseTo(1, 6);
    expect(Math.asin(d[1]) * (180 / Math.PI)).toBeCloseTo(34, 3);
  });
  it('Himmel: Zenit blauer und dunkler als der Horizont, Boden dunkel, Aureole um die Sonne', () => {
    const s = sunDirOf(232, 34);
    const zen = skyRadiance([0, 1, 0], s);
    const hor = skyRadiance([1, 0.02, 0], s);
    const gnd = skyRadiance([0, -1, 0], s);
    expect(zen[2] / zen[0]).toBeGreaterThan(hor[2] / hor[0]);
    expect(zen[0] + zen[1]).toBeLessThan(hor[0] + hor[1]);
    expect(gnd[1]).toBeLessThan(hor[1]);
    const toSun = skyRadiance([s[0], Math.max(0.05, s[1]), s[2]], s);
    const away = skyRadiance([-s[0], Math.max(0.05, s[1]), -s[2]], s);
    expect(toSun[0]).toBeGreaterThan(away[0]);
    const sky = buildSky(s, 32, 16);
    expect(sky.length).toBe(32 * 16 * 4);
    for (const v of sky) expect(Number.isFinite(v) && v >= 0).toBe(true);
    const h = hemiOf(s);
    expect(h.sky[2]).toBeGreaterThan(h.ground[2]);
  });
  it('Nebel: nah klar, Dichte sinkt mit dem Kameraabstand; Tonemapping-Spiegel bleibt in 0..1 und monoton', () => {
    expect(fogDensityFor(10)).toBeGreaterThan(fogDensityFor(40));
    expect(fogDensityFor(40, 2)).toBeLessThan(fogDensityFor(40, 1));
    // bei Kameraabstand d ist der Nebel am Blickpunkt gering
    const k = fogDensityFor(36) * 36;
    expect(1 - Math.exp(-k * k)).toBeLessThan(0.15);
    let prev = -1;
    for (const x of [0, 0.02, 0.1, 0.3, 0.6, 1, 2, 5, 20]) {
      for (const op of ['agx', 'aces'] as const) {
        const c = toneMapJs([x, x, x], MEDIEVAL_LOOK.exposure, op);
        for (const v of c) expect(v >= 0 && v <= 1).toBe(true);
      }
      const g = toneMapJs([x, x, x], MEDIEVAL_LOOK.exposure, 'agx')[1];
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = g;
    }
  });
});

describe('Umgebungskarte (Wege, Kronendach)', () => {
  it('Weg: Mitte voll, außen leer, Querabstand mit Vorzeichen, Richtung als doppelter Winkel; deterministisch', () => {
    const w = 32;
    const h = 32;
    const res = 4;
    const roads = polylineSegs([[4, 16], [28, 16]], 1, 1);
    const dir = new Uint8Array(w * res * h * res * 4);
    const a = computeEnvMap(w, h, res, roads, null, undefined, dir);
    const b = computeEnvMap(w, h, res, roads, null);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const at = (x: number, y: number, c: number): number => a[(Math.floor(y * res) * w * res + Math.floor(x * res)) * 4 + c];
    expect(at(16, 16, 0)).toBeGreaterThan(240);
    expect(at(16, 20, 0)).toBe(0);
    // Querabstand: oberhalb/unterhalb der Linie entgegengesetzt, Mitte ≈ 0,5
    const g1 = at(16, 15.4, 1) / 255 - 0.5;
    const g2 = at(16, 16.6, 1) / 255 - 0.5;
    expect(Math.sign(g1)).toBe(-Math.sign(g2));
    expect(Math.abs(g1 * 2 * CROSS_MAX)).toBeCloseTo(0.6, 0);
    // waagrechter Weg: Winkel 0 → cos 2θ = 1
    const di = (Math.floor(16 * res) * w * res + Math.floor(16 * res)) * 4;
    expect(dir[di]).toBeGreaterThan(250);
    expect(Math.abs(dir[di + 1] - 128)).toBeLessThan(3);
    expect(roadAt(a, w, res, 16, 15)).toBeGreaterThan(0.5);
    expect(roadAt(a, w, res, 16, 25)).toBe(0);
  });
  it('Kronendach: im Wald hoch, im Offenen 0; Wasser hat keine Wege; Auflösung je Kartengröße begrenzt', () => {
    const w = 24;
    const h = 24;
    const trees = new Uint8Array(w * h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) trees[y * w + x] = 12;
    const roads = polylineSegs([[0, 12], [24, 12]], 1, 0);
    const wet = (i: number): boolean => i % w > 18;
    const a = computeEnvMap(w, h, 2, roads, trees, wet);
    const px = (x: number, y: number, c: number): number => a[(y * 2 * w * 2 + x * 2) * 4 + c];
    expect(px(3, 3, 2)).toBeGreaterThan(200);
    expect(px(20, 20, 2)).toBe(0);
    expect(px(21, 12, 0)).toBe(0);
    expect(px(10, 12, 0)).toBeGreaterThan(200);
    expect(envRes(96)).toBe(4);
    expect(envRes(400)).toBeLessThanOrEqual(3);
    expect(envRes(400) * 400).toBeLessThanOrEqual(1400);
  });
  it('EnvMap.update: unveränderte Eingaben → keine Neuberechnung, geänderte Bäume/Wege → neu', () => {
    const w = 16;
    const h = 16;
    const env = new EnvMap(w, h);
    const trees = new Uint8Array(w * h);
    const roads = polylineSegs([[0, 8], [16, 8]], 1, 0);
    env.update(roads, trees);
    const v0 = env.texture.version;
    env.update(polylineSegs([[0, 8], [16, 8]], 1, 0), trees);
    expect(env.texture.version).toBe(v0);
    trees[3] = 9;
    env.update(roads, trees);
    expect(env.texture.version).toBeGreaterThan(v0);
    const v1 = env.texture.version;
    env.update(polylineSegs([[0, 4], [16, 4]], 1, 0), trees);
    expect(env.texture.version).toBeGreaterThan(v1);
  });
  it('Trampelpfade enden am nächsten Weg statt quer zum Lager', () => {
    const trails: [number, number, number, number][] = [[10, 10, 30, 30]];
    const roads = polylineSegs([[0, 14], [40, 14]], 1, 1);
    const s = snapTrails(trails, roads);
    expect(s).toHaveLength(1);
    expect(s[0].x1).toBeCloseTo(10, 5);
    expect(s[0].y1).toBeCloseTo(14, 5);
    expect(s[0].ruts).toBe(0);
    expect(snapTrails(trails, [])[0].x1).toBe(30);
    expect(trailSegments([])).toEqual([]);
  });
});

describe('Gelände im Stil medieval (ohne GL)', () => {
  const map = generateMap({ seed: 3, size: 64, players: 2 });
  it('eigener Attributsatz (aMed), Tönung ≈ 1, classic bleibt ohne aMed', () => {
    const med = new TerrainRenderer(map, { medieval: true, material: new THREE.MeshBasicMaterial() });
    const cls = new TerrainRenderer(map);
    let n = 0;
    for (const o of med.group.children) {
      const g = (o as THREE.Mesh).geometry;
      if (!g.getAttribute('aSurf')) continue;
      const am = g.getAttribute('aMed');
      expect(am).toBeDefined();
      expect(am.count).toBe(g.getAttribute('position').count);
      for (const v of am.array) expect(v >= 0 && v <= 1).toBe(true);
      // Tönung der Bibliothekstexturen: überwiegend um 1 (Gewässerbett/nasse Ufer dürfen dunkler sein)
      const col = Array.from(g.getAttribute('color').array).sort((x, y) => x - y);
      expect(col[Math.floor(col.length / 2)]).toBeGreaterThan(0.75);
      expect(col[col.length - 1]).toBeLessThan(1.6);
      n++;
    }
    expect(n).toBeGreaterThan(0);
    for (const o of cls.group.children) expect((o as THREE.Mesh).geometry.getAttribute('aMed')).toBeUndefined();
    expect(TERRAIN_LAYERS).toEqual(['M_Ground_Grass', 'M_Ground_Dirt', 'M_Ground_Path', 'M_Rock']);
    expect(LAYER_TINT).toHaveLength(4);
    expect(terrainTexSize(QUALITY.low)).toBeLessThanOrEqual(terrainTexSize(QUALITY.medium));
    expect(terrainTexSize(QUALITY.high)).toBeLessThanOrEqual(1024);
  });
});

describe('Vegetations-Assets (Manifest, GLB, Budgets)', () => {
  it('Katalog vollständig: drei Baumarten je drei Varianten (davon ein Jungbaum), Büsche, Gras, Blumen, Farn, Felsen, Zäune', () => {
    expect(catalogReady(CAT)).toBe(true);
    for (const sp of ['oak', 'birch', 'spruce'] as const) {
      expect(CAT.trees[sp].length).toBeGreaterThanOrEqual(3);
      expect(CAT.young[sp]).toBeDefined();
    }
    expect(CAT.bush.length).toBeGreaterThanOrEqual(2);
    expect(CAT.grass.length + CAT.grassTall.length).toBeGreaterThanOrEqual(2);
    expect(CAT.flowers.length).toBeGreaterThanOrEqual(2);
    expect(CAT.fern.length).toBeGreaterThanOrEqual(1);
    expect(CAT.boulder.length + CAT.rock.length + CAT.stones.length).toBeGreaterThanOrEqual(3);
    expect(VEG.some((a) => a.veg?.role === 'fence')).toBe(true);
    expect(validateManifest(MANIFEST, (f) => fs.existsSync(path.join(PUB, f)))).toEqual([]);
  });
  it('Budgets je LOD eingehalten, LOD-Folge fallend, nur Bibliotheksmaterialien, Kachelgröße beim Export vermerkt', () => {
    for (const a of VEG) {
      const b = BUDGETS[a.veg!.kind];
      expect(b, a.id).toBeDefined();
      expect(a.lods).toHaveLength(3);
      a.lods.forEach((l, i) => {
        expect(l.tris, `${a.id} LOD${i}`).toBeLessThanOrEqual(b[i]);
        if (i) expect(l.tris).toBeLessThanOrEqual(a.lods[i - 1].tris);
      });
      for (const m of a.materials) {
        expect(MANIFEST.materials[m], m).toBeDefined();
        expect(a.uvTile?.[m]).toBeGreaterThan(0);
      }
      expect(a.target.prop).toBe(a.id);
    }
    // Bäume: Rinde + Laub (Alpha-Material) in jeder Stufe
    for (const id of [...CAT.trees.oak, ...CAT.trees.birch, ...CAT.trees.spruce]) {
      const a = MANIFEST.assets[id];
      for (const l of a.lods) {
        expect(l.materials).toContain('M_Bark');
        expect(l.materials.some((m) => (MANIFEST.materials[m].alphaTest ?? 0) > 0)).toBe(true);
      }
    }
  });
  it('GLB → Laufzeitmodell: Datenfarbe vorhanden (AO, Biegsamkeit, Zufall, Durchlicht), Normalen normiert, Dreiecke wie im Manifest', async () => {
    for (const id of ['veg_oak_a', 'veg_spruce_a', 'veg_grass_a', 'veg_rock_a']) {
      const def = MANIFEST.assets[id];
      const model = modelFromScene(def, await parseGlb(def.file));
      expect(model.lods.map((l) => l.tris)).toEqual(def.tris);
      for (const l of model.lods)
        for (const p of l.parts) {
          const d = p.geometry.getAttribute('aData');
          expect(d.itemSize).toBe(4);
          const n = p.geometry.getAttribute('normal');
          for (let i = 0; i < Math.min(n.count, 400); i++) {
            expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 2);
            for (let c = 0; c < 4; c++) expect(d.array[i * 4 + c]).toBeGreaterThanOrEqual(-1e-6);
            expect(d.array[i * 4]).toBeLessThanOrEqual(1.0001);
          }
        }
      // Baum: Laub biegsamer als der Stammfuß
      if (id === 'veg_oak_a') {
        const parts = model.lods[0].parts;
        const leaf = parts.find((p) => p.material === 'M_Foliage')!;
        const bark = parts.find((p) => p.material === 'M_Bark')!;
        const mean = (g: THREE.BufferGeometry, c: number): number => {
          const a = g.getAttribute('aData').array;
          let s = 0;
          for (let i = c; i < a.length; i += 4) s += a[i];
          return s / (a.length / 4);
        };
        expect(mean(leaf.geometry, 1)).toBeGreaterThan(mean(bark.geometry, 1));
        expect(mean(leaf.geometry, 3)).toBeGreaterThan(0.9);
      }
    }
  });
});

describe('Verteilung der Vegetation (rein, deterministisch)', () => {
  const map = generateMap({ seed: 3, size: 96, players: 2 });
  const input = (lv: 'low' | 'medium' | 'high', over: Partial<VegPlaceInput> = {}): VegPlaceInput => ({
    w: map.w,
    h: map.h,
    seed: map.seed,
    terrain: map.terrain,
    height: map.height,
    trees: map.trees,
    biome: biomeOf(map.seed),
    camX: 48,
    camZ: 48,
    camPos: { x: 60, y: 30, z: 60 },
    radius: 50,
    q: vegQualityOf(QUALITY[lv]),
    cat: CAT,
    ...over,
  });
  const run = (inp: VegPlaceInput): { list: string[]; st: ReturnType<typeof placeVegetation> } => {
    const list: string[] = [];
    const st = placeVegetation(inp, (id, lod, x, y, z, rot, s) => list.push(`${id}|${lod}|${x.toFixed(3)}|${z.toFixed(3)}|${rot.toFixed(3)}|${s.toFixed(3)}`));
    return { list, st };
  };
  it('deterministisch: gleiche Eingabe, gleiche Instanzen', () => {
    const a = run(input('medium'));
    const b = run(input('medium'));
    expect(a.list).toEqual(b.list);
    expect(a.st.total).toBeGreaterThan(100);
  });
  it('jeder Baum-Tile im Radius bekommt einen Baum (Ressource bleibt sichtbar); Arten mitteleuropäisch', () => {
    const r = run(input('medium'));
    let treeTiles = 0;
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const dx = x + 0.5 - 48;
        const dz = y + 0.5 - 48;
        if (dx * dx + dz * dz <= 50 * 50 && map.trees[y * map.w + x] > 0) treeTiles++;
      }
    expect(r.st.trees).toBeGreaterThanOrEqual(treeTiles);
    for (const s of ['spruce', 'spruce2', 'cypress', 'oak', 'birch', 'acacia', 'palm'] as const) expect(['oak', 'birch', 'spruce']).toContain(speciesOf(s));
  });
  it('Grafikstufen monoton: mehr Gras/Flora und feinere LOD von Niedrig bis Hoch; Niedrig nie Baum-LOD0', () => {
    const lo = run(input('low'));
    const me = run(input('medium'));
    const hi = run(input('high'));
    expect(lo.st.flora).toBeLessThanOrEqual(me.st.flora);
    expect(me.st.flora).toBeLessThanOrEqual(hi.st.flora);
    expect(lo.st.total).toBeLessThanOrEqual(me.st.total);
    expect(me.st.total).toBeLessThanOrEqual(hi.st.total);
    expect(lo.list.filter((l) => l.startsWith('veg_oak') && l.split('|')[1] === '0')).toHaveLength(0);
    expect(hi.st.perLod[0]).toBeGreaterThanOrEqual(me.st.perLod[0]);
    for (const k of Object.keys(VEG_LOD) as (keyof typeof VEG_LOD)[]) {
      const q = vegQualityOf(QUALITY.medium);
      let prev = 0;
      for (const d of [1, 10, 20, 40, 80, 200]) {
        const L = vegLod(k, d, q);
        expect(L).toBeGreaterThanOrEqual(prev);
        prev = L;
      }
    }
  });
  it('keine Vegetation auf Gebäuden, Wegen und im Wasser', () => {
    const occ = new Int32Array(map.n);
    for (let y = 40; y < 56; y++) for (let x = 40; x < 56; x++) occ[y * map.w + x] = 1;
    const r = run(input('high', { occupied: occ, road: (x, y) => (Math.abs(y - 60) < 1 ? 1 : 0) }));
    for (const l of r.list) {
      const [id, , xs, zs] = l.split('|');
      const x = Math.floor(Number(xs));
      const z = Math.floor(Number(zs));
      const t = map.terrain[z * map.w + x];
      expect(t === T.Water || t === T.Moat, `${id} im Wasser`).toBe(false);
      const cls = CAT.cls[id];
      if (cls === 'flora' || cls === 'bush') {
        expect(occ[z * map.w + x] && map.trees[z * map.w + x] === 0, `${id} auf Gebäude`).toBeFalsy();
        if (map.trees[z * map.w + x] === 0) expect(Math.abs(Number(zs) - 60) < 0.55 && CAT.grass.includes(id), `${id} auf dem Weg`).toBe(false);
      }
    }
  });
  it('Katalog aus dem Manifest ist unabhängig von der Reihenfolge; ohne Bäume nicht bereit', () => {
    const rev = catalogOf([...VEG].reverse());
    expect(rev).toEqual(CAT);
    const noTrees: VegCatalog = catalogOf(VEG.filter((a) => a.veg?.kind !== 'tree'));
    expect(catalogReady(noTrees)).toBe(false);
  });
});

describe('LookDev-Umgebung', () => {
  it('Wege, Requisiten (nur Bibliotheks-Assets) und die Landschaftskamera sind definiert', () => {
    const { roads, props, spec } = lookdevSpec();
    expect(roads.length).toBeGreaterThan(5);
    expect(props.length).toBeGreaterThan(10);
    for (const p of props) {
      expect(MANIFEST.assets[p.id], p.id).toBeDefined();
      expect(p.x >= 0 && p.y >= 0 && p.x < spec.size && p.y < spec.size).toBe(true);
    }
    expect(LOOKDEV_CAMS.map((c) => c.id)).toContain('3h-landscape');
    expect(LOOKDEV_LAYOUT.some((it) => it.kind === 'road')).toBe(true);
  });
});
