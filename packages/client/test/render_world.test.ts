import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BT, BUILDINGS, GameMap, T, generateMap } from '@strongpoly/shared';
import { Biome, biomeOf, blendWeight, forestDensity, moistureAt, pickSpecies, SPECIES, surfaceWeights, treeLook } from '../src/render/biome';
import { DecorRenderer, DECOR_KINDS } from '../src/render/decor';
import { computeGround, GROUND_A, GROUND_B, GROUND_G, GROUND_R, groundTrace } from '../src/render/groundmap';
import { genNoiseA, genNoiseN, NOISE_SIZE, periodicFbm, periodicNoise } from '../src/render/noise';
import { QUALITY, QualityCfg } from '../src/render/quality';
import { TerrainRenderer, waterTint } from '../src/render/terrain';
import { buildShowWorld, findCliffs, findCoast, findFlat, findForest, SHOW_NAMES, sceneSpec, specHash } from '../src/showcase_scenes';

const NUMERIC_KEYS = (Object.keys(QUALITY.low) as (keyof QualityCfg)[]).filter((k) => typeof QUALITY.low[k] === 'number');

describe('Grafikstufen (Phase 4B)', () => {
  it('Tabelle ist vollständig: gleiche Felder in allen drei Stufen, keine undefinierten Werte', () => {
    const keys = Object.keys(QUALITY.low).sort();
    expect(Object.keys(QUALITY.medium).sort()).toEqual(keys);
    expect(Object.keys(QUALITY.high).sort()).toEqual(keys);
    for (const lv of ['low', 'medium', 'high'] as const) {
      for (const k of keys) {
        const v = (QUALITY[lv] as unknown as Record<string, unknown>)[k];
        expect(v, `${lv}.${k}`).not.toBeUndefined();
        if (typeof v === 'number') expect(Number.isFinite(v), `${lv}.${k}`).toBe(true);
      }
    }
  });
  it('Kosten steigen monoton: Niedrig <= Mittel <= Hoch bei jedem Zahlenfeld', () => {
    expect(NUMERIC_KEYS.length).toBeGreaterThan(20);
    for (const k of NUMERIC_KEYS) {
      expect(QUALITY.low[k] as number, k).toBeLessThanOrEqual(QUALITY.medium[k] as number);
      expect(QUALITY.medium[k] as number, k).toBeLessThanOrEqual(QUALITY.high[k] as number);
    }
  });
  it('Niedrig ist wirklich die einfachste Stufe, Hoch bietet alles', () => {
    const L = QUALITY.low;
    const M = QUALITY.medium;
    const H = QUALITY.high;
    expect(L.surfaceDetail).toBe(0);
    expect(L.cloudShadow).toBe(0);
    expect(L.rimLight).toBe(0);
    expect(L.waterDetail).toBe(0);
    expect(L.waterShader).toBe(false);
    expect(L.treeSway).toBe(0);
    expect(L.ambientLife).toBe(0);
    expect(L.ambientMax).toBe(0);
    expect(L.detailMax).toBe(0);
    expect(M.ambientLife).toBe(1);
    expect(H.ambientLife).toBe(2);
    expect(M.waterDetail).toBe(1);
    expect(H.waterDetail).toBe(2);
    expect(H.surfaceDetail).toBe(2);
    // Wasser-Schalter und Wasserdetail passen zusammen
    for (const q of [L, M, H]) expect(q.waterDetail > 0).toBe(q.waterShader);
    // Wertebereiche
    for (const q of [L, M, H]) {
      expect(q.cloudShadow).toBeLessThanOrEqual(1);
      expect(q.rimLight).toBeLessThanOrEqual(1);
      expect(q.treeSway).toBeLessThanOrEqual(1);
      expect(q.anisotropy).toBeGreaterThanOrEqual(1);
      expect(q.treeFullRadius).toBeGreaterThan(10);
    }
  });
});

describe('Rauschtexturen', () => {
  it('sind deterministisch und füllen den Wertebereich', () => {
    const a1 = genNoiseA(64, 5);
    const a2 = genNoiseA(64, 5);
    expect(a1).toEqual(a2);
    const n1 = genNoiseN(64, 9);
    expect(genNoiseN(64, 9)).toEqual(n1);
    expect(genNoiseA(64, 6)).not.toEqual(a1);
    for (const data of [a1, n1]) {
      expect(data.length).toBe(64 * 64 * 4);
      for (let ch = 0; ch < 4; ch++) {
        let lo = 255;
        let hi = 0;
        for (let i = ch; i < data.length; i += 4) {
          lo = Math.min(lo, data[i]);
          hi = Math.max(hi, data[i]);
        }
        expect(hi - lo, `Kanal ${ch}`).toBeGreaterThan(40);
      }
    }
  });
  it('sind kachelbar (Nahtstellen ohne Sprung)', () => {
    const size = 64;
    const a = genNoiseA(size, 5);
    const at = (x: number, y: number, ch: number): number => a[(((y + size) % size) * size + ((x + size) % size)) * 4 + ch];
    // Sprung über die Kante (x=size-1 -> 0) darf nicht größer sein als typische Nachbardifferenz im Inneren
    for (const ch of [0, 1, 2]) {
      let inner = 0;
      let seam = 0;
      for (let y = 0; y < size; y++) {
        inner = Math.max(inner, Math.abs(at(20, y, ch) - at(21, y, ch)));
        seam = Math.max(seam, Math.abs(at(size - 1, y, ch) - at(0, y, ch)));
      }
      expect(seam, `Kanal ${ch}`).toBeLessThanOrEqual(Math.max(inner, 40) * 1.6);
    }
    expect(periodicNoise(3, 0.3, 1.7, 8)).toBeCloseTo(periodicNoise(3, 8.3, 1.7, 8), 9);
    expect(periodicNoise(3, 0.3, 1.7, 8)).toBeCloseTo(periodicNoise(3, 0.3, 9.7, 8), 9);
    expect(periodicFbm(3, 0.25, 0.5, 4, 3)).toBeCloseTo(periodicFbm(3, 1.25, 0.5, 4, 3), 9);
    expect(NOISE_SIZE).toBe(256);
  });
});

describe('Biom und Vegetation (deterministisch)', () => {
  it('jede Karte hat ein festes Biom; über viele Karten kommen alle vier vor', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 300; s++) {
      const b = biomeOf(s);
      expect(biomeOf(s)).toBe(b);
      expect(b.green).toBeGreaterThanOrEqual(0);
      expect(b.green).toBeLessThanOrEqual(1);
      seen.add(b.id);
    }
    expect([...seen].sort()).toEqual(['dry', 'highland', 'lush', 'temperate']);
  });
  it('Baumart: gültig, reproduzierbar, nach Terrain und Biom sinnvoll', () => {
    const bio: Biome[] = [1, 3, 5, 10].map((s) => biomeOf(s));
    for (const b of bio) {
      for (let k = 0; k < 200; k++) {
        const r = k / 200;
        for (const t of [T.Steppe, T.Oasis, T.Desert, T.Rock]) {
          const sp = pickSpecies(b, t, 1 + (k % 4), r);
          expect(SPECIES).toContain(sp);
          expect(pickSpecies(b, t, 1 + (k % 4), r)).toBe(sp);
        }
      }
    }
    const dry = biomeOf(5);
    expect(dry.id).toBe('dry');
    // Wüste: Akazien/Zypressen/Palmen, keine Fichten
    for (let k = 0; k < 100; k++) expect(['acacia', 'cypress', 'palm']).toContain(pickSpecies(dry, T.Desert, 1, k / 100));
    // Oase: Palmen kommen vor
    let palms = 0;
    for (let k = 0; k < 100; k++) if (pickSpecies(biomeOf(1), T.Oasis, 1, k / 100) === 'palm') palms++;
    expect(palms).toBeGreaterThanOrEqual(15);
    // Mischwald in gemäßigter Zone: mehrere Arten
    const kinds = new Set<string>();
    for (let k = 0; k < 100; k++) kinds.add(pickSpecies(biomeOf(1), T.Steppe, 1, k / 100));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
  it('Baumgestalt: reproduzierbar, in Grenzen, mit Variation', () => {
    const b = biomeOf(1);
    const a = treeLook(b, 'oak', 0.31, 0.62, 0.17, 0.9);
    expect(treeLook(b, 'oak', 0.31, 0.62, 0.17, 0.9)).toEqual(a);
    const sizes: number[] = [];
    let autumn = 0;
    for (let i = 0; i < 400; i++) {
      const r1 = ((i * 7919) % 1000) / 1000;
      const l = treeLook(biomeOf(10), 'oak', r1, ((i * 104729) % 1000) / 1000, ((i * 1299709) % 1000) / 1000, ((i * 15485863) % 1000) / 1000);
      sizes.push(l.s);
      expect(l.s).toBeGreaterThanOrEqual(0.6);
      expect(l.s).toBeLessThanOrEqual(1.4 + 1e-9);
      expect(l.sy).toBeGreaterThanOrEqual(0.9);
      expect(l.sy).toBeLessThanOrEqual(1.22);
      expect(Math.abs(l.lean)).toBeLessThanOrEqual(0.07 + 1e-9);
      expect(Math.abs(l.ox)).toBeLessThanOrEqual(0.35 + 1e-9);
      for (const c of l.tint) expect(c).toBeGreaterThan(0);
      if (l.tint[0] > 1.5) autumn++;
    }
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(0.3);
    expect(autumn).toBeGreaterThan(0); // Hochland hat herbstliche Bäume
    expect(forestDensity(1)).toBe(0);
    expect(forestDensity(9)).toBe(1);
    expect(forestDensity(4)).toBeGreaterThan(forestDensity(3));
  });
  it('Übergangs- und Mischlogik ist rein und monoton', () => {
    let prev = -1;
    for (let d = 3; d >= 0; d -= 0.25) {
      const w = blendWeight(d, 3);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
    expect(blendWeight(0, 3)).toBe(1);
    expect(blendWeight(3, 3)).toBe(0);
    expect(blendWeight(1.5, 3)).toBeCloseTo(0.5, 5);
    for (const t of [T.Desert, T.Steppe, T.Oasis, T.Rock, T.Water, T.Swamp, T.StoneDeposit, T.IronDeposit, T.PitchSpring, T.Moat]) {
      const w = surfaceWeights(t, 0.5);
      expect(w).toHaveLength(4);
      for (const v of w) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(surfaceWeights(T.Desert)[1]).toBeGreaterThan(surfaceWeights(T.Oasis)[1]);
    expect(surfaceWeights(T.Rock)[2]).toBe(1);
    // Steppe wird mit steigender Grünheit grasiger und weniger sandig
    expect(surfaceWeights(T.Steppe, 1)[0]).toBeGreaterThan(surfaceWeights(T.Steppe, 0)[0]);
    expect(surfaceWeights(T.Steppe, 1)[1]).toBeLessThan(surfaceWeights(T.Steppe, 0)[1]);
    const m = moistureAt(biomeOf(1), 1, 10, 10);
    expect(m).toBe(moistureAt(biomeOf(1), 1, 10, 10));
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });
  it('Wassertönung: flach heller/türkis, tief dunkler/blau, Graben trüber', () => {
    const sh = waterTint(0, false);
    const dp = waterTint(1, false);
    expect(sh[0] + sh[1] + sh[2]).toBeGreaterThan(dp[0] + dp[1] + dp[2]);
    expect(dp[2]).toBeGreaterThan(dp[0]);
    const mo = waterTint(0.6, true);
    expect(mo[1]).toBeGreaterThanOrEqual(mo[2]);
    expect(waterTint(-5, false)).toEqual(waterTint(0, false));
  });
});

function plainMap(w = 40, h = 40): GameMap {
  const m = new GameMap(w, h);
  m.terrain.fill(T.Steppe);
  m.height.fill(1);
  return m;
}
function gb(t: number, x: number, y: number): { t: number; x: number; y: number; w: number; h: number } {
  return { t, x, y, w: BUILDINGS[t].w, h: BUILDINGS[t].h };
}

describe('Bodenkarte (Trampelpfade, Felder, Kontaktschatten)', () => {
  const m = plainMap();
  const list = [gb(BT.Keep, 10, 10), gb(BT.Stockpile, 20, 11), gb(BT.Woodcutter, 24, 20), gb(BT.WheatFarm, 5, 25), gb(BT.WallHigh, 15, 5), gb(BT.Hovel, 10, 17)];
  it('ist deterministisch und unabhängig von der Reihenfolge der Gebäude', () => {
    const a = computeGround(m, list);
    const b = computeGround(m, [...list].reverse());
    expect(a).toEqual(b);
    expect(a.length).toBe(m.w * m.h * 4);
  });
  it('leere Karte ohne Gebäude bleibt leer', () => {
    const a = computeGround(m, []);
    expect(a.every((v) => v === 0)).toBe(true);
  });
  it('getretene Erde um Gebäude, nach außen abnehmend', () => {
    const a = computeGround(m, list);
    const at = (x: number, y: number, ch: number): number => a[(y * m.w + x) * 4 + ch];
    // Tile direkt neben dem Bergfried: viel Spur; weit weg: keine
    expect(at(9, 12, GROUND_R)).toBeGreaterThan(150);
    expect(at(9, 12, GROUND_R)).toBeGreaterThan(at(7, 12, GROUND_R));
    expect(at(2, 2, GROUND_R)).toBe(0);
    expect(at(38, 38, GROUND_B)).toBe(0);
    // Kontaktschatten im Fußabdruck und an der Mauer
    expect(at(12, 12, GROUND_B)).toBeGreaterThan(100);
    expect(at(15, 5, GROUND_B)).toBeGreaterThan(50);
    // Mauern hinterlassen keine getretene Erde
    expect(at(15, 4, GROUND_R)).toBe(0);
  });
  it('Felder nur bei Ackerhöfen, Pfade zwischen Gebäuden und Lager', () => {
    const a = computeGround(m, list);
    const at = (x: number, y: number, ch: number): number => a[(y * m.w + x) * 4 + ch];
    expect(at(7, 27, GROUND_G)).toBe(255);
    expect(at(12, 12, GROUND_G)).toBe(0);
    // Pfad vom Holzfäller (24,20) zum Lager (20,11): irgendwo auf der Verbindung
    let pathTiles = 0;
    for (let y = 11; y <= 21; y++) for (let x = 20; x <= 25; x++) if (at(x, y, GROUND_A) > 200) pathTiles++;
    expect(pathTiles).toBeGreaterThan(4);
    // zu weit entfernte Gebäude bekommen keinen Pfad
    const far = computeGround(m, [gb(BT.Keep, 2, 2), gb(BT.Hovel, 35, 35)]);
    expect(far[(35 * m.w + 35) * 4 + GROUND_A]).toBe(0);
  });
  it('kein Eintrag im Wasser; groundTrace fasst Spuren zusammen', () => {
    const w2 = plainMap();
    for (let y = 8; y < 14; y++) for (let x = 8; x < 14; x++) w2.terrain[y * w2.w + x] = T.Water;
    const a = computeGround(w2, [gb(BT.Keep, 10, 10)]);
    expect(a[(10 * w2.w + 10) * 4 + GROUND_R]).toBe(0);
    const b = computeGround(m, list);
    expect(groundTrace(b, 12 * m.w + 9)).toBeGreaterThan(0.5);
    expect(groundTrace(b, 2 * m.w + 2)).toBe(0);
  });
});

describe('Gelände- und Dekor-Aufbau (ohne GL)', () => {
  const map = generateMap({ seed: 3, size: 64, players: 2 });
  it('TerrainRenderer baut alle Chunks mit gültigen Attributen', () => {
    const tr = new TerrainRenderer(map);
    expect(tr.group.children.length).toBeGreaterThan(9);
    let water = 0;
    for (const o of tr.group.children) {
      const g = (o as THREE.Mesh).geometry;
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error('NaN in Position');
      if (g.getAttribute('aSurf')) {
        expect(g.getAttribute('aSurf').count).toBe(pos.count);
        for (const v of g.getAttribute('aSurf').array) expect(v).toBeGreaterThanOrEqual(0);
        expect(g.getAttribute('normal')).toBeDefined();
      }
      if (g.getAttribute('aDepth')) {
        water++;
        for (const v of g.getAttribute('aDepth').array) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        for (const v of g.getAttribute('aFoam').array) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(water).toBeGreaterThan(0);
    tr.applyQuality(QUALITY.low);
    tr.applyQuality(QUALITY.high);
    // Geländeänderung baut den Chunk neu
    const i = map.idx(30, 30);
    const old = map.terrain[i];
    map.terrain[i] = old === T.Water ? T.Steppe : T.Water;
    tr.markTile(30, 30);
    tr.flush();
    map.terrain[i] = old;
  });
  it('DecorRenderer: deterministisch, Dreiecksbudget, Instanzzahlen nach Stufe monoton', () => {
    const counts: Record<string, number> = {};
    for (const lv of ['low', 'medium', 'high'] as const) {
      const d = new DecorRenderer(map);
      d.applyQuality(QUALITY[lv], true);
      d.rebuild(32, 32);
      counts[lv] = d.stats.total;
      expect(d.stats.total).toBeGreaterThan(50);
      const again = new DecorRenderer(map);
      again.applyQuality(QUALITY[lv], true);
      again.rebuild(32, 32);
      expect({ ...again.stats, ms: 0 }).toEqual({ ...d.stats, ms: 0 });
      const sig = (r: DecorRenderer): number => {
        let h = 0;
        for (const o of r.group.children) {
          const m = o as THREE.InstancedMesh;
          for (let i = 0; i < m.count * 16; i++) h = (h * 31 + Math.round((m.instanceMatrix.array[i] as number) * 1000)) | 0;
        }
        return h;
      };
      expect(sig(again)).toBe(sig(d));
    }
    expect(counts.low).toBeLessThanOrEqual(counts.medium);
    expect(counts.medium).toBeLessThanOrEqual(counts.high);
  });
  it('Baum-LOD folgt dem Kameraabstand: nah volle Bäume, weit weg nur Fernformen', () => {
    const near = new DecorRenderer(map);
    near.applyQuality(QUALITY.medium, true);
    near.setCameraPos(new THREE.Vector3(32, 20, 32));
    near.rebuild(32, 32);
    const far = new DecorRenderer(map);
    far.applyQuality(QUALITY.medium, true);
    far.setCameraPos(new THREE.Vector3(32, 150, 32));
    far.rebuild(32, 32);
    expect(near.stats.trees).toBeGreaterThan(20);
    expect(far.stats.trees).toBe(0);
    expect(far.stats.far).toBeGreaterThan(near.stats.far);
    // Niedrig zeigt bei gleichem Abstand weniger volle Bäume als Hoch
    const lo = new DecorRenderer(map);
    lo.applyQuality(QUALITY.low, true);
    lo.setCameraPos(new THREE.Vector3(32, 40, 32));
    lo.rebuild(32, 32);
    const hi = new DecorRenderer(map);
    hi.applyQuality(QUALITY.high, true);
    hi.setCameraPos(new THREE.Vector3(32, 40, 32));
    hi.rebuild(32, 32);
    expect(lo.stats.trees).toBeLessThan(hi.stats.trees);
  });
  it('alle Dekor-Modelle sind endlich, nicht leer und im Dreiecksbudget', () => {
    const d = new DecorRenderer(map);
    for (const k of DECOR_KINDS) {
      const g = d.modelGeo(k);
      const pos = g.getAttribute('position');
      expect(pos.count % 3, k).toBe(0);
      const tris = pos.count / 3;
      expect(tris, k).toBeGreaterThan(5);
      expect(tris, k).toBeLessThan(k.startsWith('far') ? 60 : 380);
      for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error(`${k}: NaN`);
      expect(g.getAttribute('color').count).toBe(pos.count);
    }
    // Fernformen sind deutlich billiger als die vollen Bäume
    expect(d.modelGeo('farConifer').getAttribute('position').count).toBeLessThan(d.modelGeo('spruce').getAttribute('position').count / 2);
    expect(d.modelGeo('farBroad').getAttribute('position').count).toBeLessThan(d.modelGeo('oak').getAttribute('position').count / 2);
  });
  it('Gras und Büsche meiden bebaute Tiles', () => {
    const m2 = plainMap(48, 48);
    m2.terrain.fill(T.Oasis);
    const occ = new Int32Array(m2.n);
    for (let y = 20; y < 26; y++) for (let x = 20; x < 26; x++) occ[y * m2.w + x] = 1;
    const d = new DecorRenderer(m2);
    d.applyQuality(QUALITY.high, true);
    d.setOccupancy(occ);
    d.rebuild(24, 24);
    for (const o of d.group.children) {
      const mesh = o as THREE.InstancedMesh;
      const arr = mesh.instanceMatrix.array as Float32Array;
      for (let n = 0; n < mesh.count; n++) {
        const x = arr[n * 16 + 12];
        const z = arr[n * 16 + 14];
        const inside = x >= 20.2 && x < 25.8 && z >= 20.2 && z < 25.8;
        expect(inside, `Instanz bei ${x.toFixed(1)}/${z.toFixed(1)}`).toBe(false);
      }
    }
  });
});

describe('Vergleichsszenen (deterministisch)', () => {
  it('jede Szene ist reproduzierbar (Prüfwert identisch) und unterscheidet sich von den anderen', () => {
    const hashes = new Set<number>();
    for (const name of SHOW_NAMES) {
      const a = sceneSpec(name);
      const b = sceneSpec(name);
      expect(specHash(a), name).toBe(specHash(b));
      expect(a.desc.length, name).toBeGreaterThan(10);
      hashes.add(specHash(a));
    }
    expect(hashes.size).toBe(SHOW_NAMES.length);
    // anderer Seed -> andere Welt
    expect(specHash(sceneSpec('forest', 5))).not.toBe(specHash(sceneSpec('forest')));
  });
  it('Gebäude liegen in der Karte und überlappen sich nicht; Einheiten stehen auf Land', () => {
    for (const name of SHOW_NAMES) {
      const s = sceneSpec(name);
      const occ = new Set<number>();
      for (const b of s.buildings) {
        const def = BUILDINGS[b.t];
        expect(def, `${name} Typ ${b.t}`).toBeDefined();
        const w = b.rot ? def.h : def.w;
        const h = b.rot ? def.w : def.h;
        expect(b.x >= 0 && b.y >= 0 && b.x + w <= s.map.w && b.y + h <= s.map.h, `${name} ${def.key} in der Karte`).toBe(true);
        for (let y = b.y; y < b.y + h; y++)
          for (let x = b.x; x < b.x + w; x++) {
            const k = y * s.map.w + x;
            // die brennende Hütte der Belagerung steht bewusst im Hof
            if (!(b.f && name === 'siege')) expect(occ.has(k), `${name} ${def.key} überlappt bei ${x}/${y}`).toBe(false);
            occ.add(k);
          }
      }
      for (const u of s.units) {
        expect(u.x >= 0 && u.y >= 0 && u.x < s.map.w && u.y < s.map.h, `${name} Einheit in der Karte`).toBe(true);
        expect(Number.isFinite(u.face)).toBe(true);
        const t = s.map.terrain[s.map.idx(Math.floor(u.x), Math.floor(u.y))];
        expect(t === T.Water ? 'Wasser' : 'Land', `${name} Einheit steht auf Land`).toBe('Land');
      }
      expect(s.cam.dist).toBeGreaterThan(5);
    }
  });
  it('Szenen haben den vorgesehenen Inhalt', () => {
    expect(sceneSpec('siege').units.length).toBeGreaterThanOrEqual(300);
    expect(sceneSpec('siege').arrows.length).toBeGreaterThan(20);
    expect(sceneSpec('castle').buildings.filter((b) => b.t === BT.WallHigh).length).toBeGreaterThan(60);
    expect(sceneSpec('castle').buildings.some((b) => b.t === BT.Keep)).toBe(true);
    expect(sceneSpec('town').buildings.length).toBeGreaterThan(35);
    expect(sceneSpec('early').buildings.length).toBeLessThan(15);
    expect(sceneSpec('figures').units.length).toBeGreaterThanOrEqual(20);
    expect(sceneSpec('map').players).toBe(4);
    expect(sceneSpec('map').map.w).toBe(160);
    expect(sceneSpec('map').buildings.filter((b) => b.t === BT.Keep)).toHaveLength(4);
  });
  it('Welt aus Spezifikation: Zähler stimmen, Belegung gesetzt', () => {
    const s = sceneSpec('town');
    const w = buildShowWorld(s);
    expect(w.buildings.size).toBe(s.buildings.length);
    expect(w.top).toBe(s.units.length);
    const keep = [...w.buildings.values()].find((b) => b.t === BT.Keep)!;
    expect(w.bldAt[keep.y * w.map.w + keep.x]).toBe(keep.i);
    const w2 = buildShowWorld(sceneSpec('town'));
    expect([...w2.buildings.values()].map((b) => b.i)).toEqual([...w.buildings.values()].map((b) => b.i));
  });
  it('Kartensuche ist deterministisch und liefert Punkte in der Karte', () => {
    const map = generateMap({ seed: 1, size: 128, players: 2 });
    for (const f of [findForest, findCoast, findCliffs]) {
      const a = f(map);
      expect(f(map)).toEqual(a);
      expect(a.x).toBeGreaterThan(0);
      expect(a.x).toBeLessThan(map.w);
      expect(a.y).toBeGreaterThan(0);
      expect(a.y).toBeLessThan(map.h);
    }
    const flat = findFlat(map, 20, 10, 10);
    expect(flat.x - 20).toBeGreaterThanOrEqual(0);
    expect(flat.y + 10).toBeLessThan(map.h);
    // Küste: ungefähr die Hälfte Wasser im Fenster
    const c = findCoast(map);
    let water = 0;
    for (let y = c.y - 10; y <= c.y + 10; y++) for (let x = c.x - 10; x <= c.x + 10; x++) if (map.inBounds(x, y) && map.terrain[map.idx(x, y)] === T.Water) water++;
    expect(water / 441).toBeGreaterThan(0.15);
    expect(water / 441).toBeLessThan(0.75);
  });
});
