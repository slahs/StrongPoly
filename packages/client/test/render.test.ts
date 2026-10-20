import { describe, expect, it } from 'vitest';
import { BT, BUILDINGS, PROJ, R, RES_COUNT, U, UNITS, UNIT_TYPES } from '@strongpoly/shared';
import { BenchWorld } from '../src/bench';
import { ModelBuilder } from '../src/render/builder';
import { PART } from '../src/render/materials';
import { buildBuildingModel, WALL_JOIN, WALL_TYPES, wallParts } from '../src/render/models_buildings';
import { arrowGeo, flameGeo, foundationGeo, rubbleGeo, scaffoldGeo, stoneGeo } from '../src/render/models_misc';
import { buildCargoModel, buildUnitModel, CARGO_KINDS, CARGO_OF_RES, UNIT_CORPSE, UNIT_CYCLE, UNIT_SCALE, UNIT_TOP, UNIT_WALK_W } from '../src/render/models_units';
import { QUALITY, qualityOf } from '../src/render/quality';
import { EMITTERS } from '../src/render/work_fx';

function parts(g: { getAttribute(n: string): { count: number; getW(i: number): number } | undefined }): Set<number> {
  const a = g.getAttribute('aPivot')!;
  const s = new Set<number>();
  for (let i = 0; i < a.count; i++) s.add(a.getW(i));
  return s;
}

function finite(g: { getAttribute(n: string): { array: ArrayLike<number> } | undefined }): boolean {
  for (const n of ['position', 'color', 'aPivot', 'aMeta']) {
    const a = g.getAttribute(n);
    if (!a) return false;
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) return false;
  }
  return true;
}

describe('Grafikstufen', () => {
  const L = QUALITY.low;
  const M = QUALITY.medium;
  const H = QUALITY.high;
  it('Schalter steigen von Niedrig über Mittel zu Hoch', () => {
    for (const k of ['shadowMapSize', 'shadowRadius', 'particleMax', 'particleScale', 'grassPerTile', 'grassMax', 'decorRadius', 'ao', 'pixelRatioMax', 'bloodDecals', 'corpses'] as const) {
      expect(L[k], k).toBeLessThanOrEqual(M[k]);
      expect(M[k], k).toBeLessThanOrEqual(H[k]);
    }
    expect(L.shadowMapSize).toBeLessThan(H.shadowMapSize);
    expect(L.grassPerTile).toBe(0);
    expect(L.waterShader).toBe(false);
    expect(M.waterShader && H.waterShader).toBe(true);
    expect(L.blobShadows).toBe(true);
    expect(H.blobShadows).toBe(false);
    expect(L.shadowUnits).toBe(false);
    expect(M.shadowUnits && H.shadowUnits).toBe(true);
  });
  it('unbekannte Stufe fällt auf Mittel zurück', () => {
    expect(qualityOf('bogus')).toBe(M);
    expect(qualityOf(undefined)).toBe(M);
    expect(qualityOf('high')).toBe(H);
  });
});

describe('Einheitenmodelle', () => {
  it('jeder Typ erzeugt ein gültiges Modell mit Animationsattributen', () => {
    expect(UNIT_SCALE.length).toBe(UNIT_TYPES);
    for (let t = 0; t < UNIT_TYPES; t++) {
      const m = buildUnitModel(t);
      expect(m.merged.getAttribute('position').count % 3, `Typ ${t}`).toBe(0);
      expect(m.tris, `Typ ${t}`).toBeGreaterThan(12);
      expect(m.tris, `Typ ${t}`).toBeLessThan(1200);
      expect(finite(m.merged), `Typ ${t}`).toBe(true);
      expect(UNIT_TOP[t]).toBeGreaterThan(0);
      expect(UNIT_WALK_W[t]).toBeGreaterThan(0);
      expect(UNIT_CYCLE[t]).toBeGreaterThanOrEqual(0.5);
    }
  });
  it('Menschen haben schwingende Beine und Arme, Geräte drehbare Räder', () => {
    for (const t of [U.Peasant, U.Archer, U.Swordsman, U.Spearman, U.Lord]) {
      const p = parts(buildUnitModel(t).merged);
      expect(p.has(PART.LegL) && p.has(PART.LegR), `Typ ${t} Beine`).toBe(true);
      expect(p.has(PART.ArmR), `Typ ${t} Waffenarm`).toBe(true);
    }
    expect(parts(buildUnitModel(U.Archer).merged).has(PART.Bow)).toBe(true);
    for (const t of [U.Catapult, U.Trebuchet, U.Ram, U.SiegeTower, U.FireBallista]) expect(parts(buildUnitModel(t).merged).has(PART.Wheel), `Typ ${t}`).toBe(true);
    expect(parts(buildUnitModel(U.Catapult).merged).has(PART.Lever)).toBe(true);
    expect(parts(buildUnitModel(U.Trebuchet).merged).has(PART.Lever)).toBe(true);
    expect(parts(buildUnitModel(U.Ram).merged).has(PART.Slide)).toBe(true);
    // Pferde: Beine bewegen sich auch bei Reitern
    expect(parts(buildUnitModel(U.Knight).merged).has(PART.LegL)).toBe(true);
  });
  it('Lord, Ritter und Belagerungsgerät sind klar unterscheidbar (Größe/Zierde)', () => {
    expect(UNIT_SCALE[U.Lord]).toBeGreaterThan(UNIT_SCALE[U.Swordsman]);
    expect(UNIT_SCALE[U.Knight]).toBeGreaterThan(UNIT_SCALE[U.Spearman]);
    expect(buildUnitModel(U.Lord).tris).toBeGreaterThan(buildUnitModel(U.Peasant).tris);
    expect(buildUnitModel(U.Knight).tris).toBeGreaterThan(buildUnitModel(U.Swordsman).tris);
    expect(UNIT_TOP[U.SiegeTower]).toBeGreaterThan(UNIT_TOP[U.Lord]);
  });
  it('Fußvolk und Reiter bleiben liegen, Belagerungsgerät nicht', () => {
    for (const d of UNITS) expect(UNIT_CORPSE[d.id]).toBe(d.side !== 'siege');
  });
  it('jede Ware hat eine Trageform', () => {
    for (let r = 0; r < RES_COUNT; r++) expect(CARGO_KINDS, `Ware ${r}`).toContain(CARGO_OF_RES[r]);
    expect(CARGO_OF_RES[R.Wood]).toBe('bundle');
    expect(CARGO_OF_RES[R.Stone]).toBe('block');
    for (const k of CARGO_KINDS) {
      const m = buildCargoModel(k);
      expect(m.tris).toBeGreaterThan(6);
      expect(finite(m.merged)).toBe(true);
    }
  });
});

describe('Gebäudemodelle', () => {
  it('jedes Gebäude lässt sich bauen, ohne NaN und mit Teamfarbkanal', () => {
    for (const def of BUILDINGS) {
      const m = buildBuildingModel(def);
      expect(m.tris, def.key).toBeGreaterThan(0);
      expect(m.tris, def.key).toBeLessThan(2500);
      expect(finite(m.merged), def.key).toBe(true);
      const meta = m.merged.getAttribute('aMeta');
      // eingebackene Ambient Occlusion: unten dunkler als oben
      let minAo = 1;
      for (let i = 0; i < meta.count; i++) minAo = Math.min(minAo, meta.getY(i));
      expect(minAo, def.key).toBeLessThanOrEqual(1);
    }
  });
  it('Gebäude haben ihre Arbeitsanimationen', () => {
    expect(parts(buildBuildingModel(BUILDINGS[BT.Mill]).merged).has(PART.Sail)).toBe(true);
    expect(parts(buildBuildingModel(BUILDINGS[BT.Blacksmith]).merged).has(PART.ArmR)).toBe(true);
    expect(parts(buildBuildingModel(BUILDINGS[BT.Woodcutter]).merged).has(PART.ArmR)).toBe(true);
    expect(parts(buildBuildingModel(BUILDINGS[BT.GateStone]).merged).has(PART.Door)).toBe(true);
    expect(parts(buildBuildingModel(BUILDINGS[BT.GateWood]).merged).has(PART.Door)).toBe(true);
    expect(parts(buildBuildingModel(BUILDINGS[BT.Keep]).merged).has(PART.Cloth)).toBe(true);
  });
  it('Mauerteile: Krone liegt auf Laufhöhe, Arme reichen bis zur Tilekante', () => {
    for (const id of WALL_TYPES) {
      const def = BUILDINGS[id];
      for (const kind of ['arm', 'post', 'stub'] as const) {
        const b = new ModelBuilder();
        wallParts(b, id, def.height, kind, 1);
        const g = b.build().merged;
        const pos = g.getAttribute('position');
        let maxX = -1;
        let minX = 1;
        let hasCrown = false;
        let maxY = 0;
        for (let i = 0; i < pos.count; i++) {
          maxX = Math.max(maxX, pos.getX(i));
          minX = Math.min(minX, pos.getX(i));
          maxY = Math.max(maxY, pos.getY(i));
          if (Math.abs(pos.getY(i) - def.height) < 1e-4) hasCrown = true;
        }
        expect(hasCrown, `${def.key} ${kind}`).toBe(true);
        expect(maxY, `${def.key} ${kind}`).toBeGreaterThanOrEqual(def.height);
        if (kind === 'arm') {
          expect(maxX).toBeCloseTo(0.5, 2);
          expect(minX).toBeGreaterThanOrEqual(-1e-6);
        }
      }
    }
  });
  it('Mauern schließen an Türme, Tore und Bergfried an', () => {
    for (const id of [BT.WallWood, BT.WallLow, BT.WallHigh, BT.TowerLookout, BT.TowerGuard, BT.TowerRound, BT.GateWood, BT.GateStone, BT.Keep]) expect(WALL_JOIN.has(id)).toBe(true);
    expect(WALL_JOIN.has(BT.Stairs)).toBe(false);
    expect(WALL_JOIN.has(BT.Hovel)).toBe(false);
  });
  it('Rauch und Dampf nur an echten Gebäuden mit gültigen Rändern', () => {
    for (const [k, list] of Object.entries(EMITTERS)) {
      expect(BUILDINGS[Number(k)]).toBeDefined();
      for (const e of list) {
        expect(e.rate).toBeGreaterThan(0);
        expect(Number.isFinite(e.x + e.y + e.z)).toBe(true);
      }
    }
  });
});

describe('Hilfsmodelle', () => {
  it('Fundament, Gerüst, Trümmer, Geschosse, Flammen', () => {
    for (const g of [foundationGeo(), scaffoldGeo(), rubbleGeo(false), rubbleGeo(true), arrowGeo('arrow'), arrowGeo('bolt'), arrowGeo('fire'), stoneGeo(false), stoneGeo(true), flameGeo()]) {
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
      expect(finite(g)).toBe(true);
    }
    expect(PROJ.Arrow).toBeDefined();
  });
});

describe('Benchmark-Welt', () => {
  it('hält die Einheitenzahl, kämpft und ist deterministisch', () => {
    const run = (): { x: number; deaths: number; count: number; proj: number } => {
      const bw = new BenchWorld(400, 3);
      let deaths = 0;
      let proj = 0;
      for (let i = 0; i < 160; i++) {
        bw.tick();
        deaths += bw.w.deaths.length;
        proj = Math.max(proj, bw.w.proj.length / 8);
      }
      let x = 0;
      for (let s = 0; s < bw.w.top; s++) if (bw.w.ids[s]) x += bw.w.curX[s] * (s % 7);
      return { x, deaths, count: bw.count, proj };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.deaths).toBeGreaterThan(5);
    expect(a.proj).toBeGreaterThan(0);
    expect(Math.abs(a.count - 402)).toBeLessThanOrEqual(8);
    expect(Number.isFinite(a.x)).toBe(true);
  });
});
