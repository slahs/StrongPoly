import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BT, BUILDINGS, R, U, UNITS, UNIT_TYPES } from '@strongpoly/shared';
import { BenchWorld } from '../src/bench';
import { TypeMesh, teamTable } from '../src/render/instanced';
import { QUALITY } from '../src/render/quality';
import { UPART } from '../src/render/unit_shader';
import {
  buildCargoModel,
  buildUnitModel,
  CARGO_KINDS,
  instanceTris,
  UNIT_BUDGET,
  UNIT_SCALE,
  UnitModel,
  worstCaseTris,
} from '../src/render/models_units';
import { JOB, JOB_ARM_L, JOB_ARM_R, JOB_COUNT, JOB_NAMES, JOB_OF_BUILDING, JOB_OF_RES, resolveJob } from '../src/render/unit_jobs';
import {
  CLOTH_TONES,
  HAIR_BITS,
  HAIR_TONES,
  HAT_BITS,
  LOD_HYST,
  LOD_NEAR_DIST,
  packPalette,
  SKIN_TONES,
  TC,
  TINT_COUNT,
  UNIT_TINTS,
  unitVariant,
  unpackPalette,
  VAR_SPEC,
  VIS,
} from '../src/render/units_style';
import { EntityRenderer } from '../src/render/entities';
import { WorkerPhase } from '@strongpoly/shared';

const ALL = Array.from({ length: UNIT_TYPES }, (_, i) => i);
const SIEGE = UNITS.filter((d) => d.side === 'siege').map((d) => d.id);
const FOOT = ALL.filter((t) => !SIEGE.includes(t) && t !== U.Ox && UNITS[t].mounted !== true);

const models = new Map<string, UnitModel>();
function model(type: number, detail: 0 | 1 | 2 = 2): UnitModel {
  const k = `${type}:${detail}`;
  let m = models.get(k);
  if (!m) {
    m = buildUnitModel(type, detail);
    models.set(k, m);
  }
  return m;
}

const ATTRS = ['position', 'color', 'aPivot', 'aMeta', 'aStyle'] as const;
const VALID_PARTS = new Set<number>(Object.values(UPART));

describe('Figurenmodelle: Katalog', () => {
  it('jeder Einheitentyp hat in allen drei Detailstufen ein gültiges Modell ohne NaN', () => {
    for (const t of ALL) {
      for (const d of [0, 1, 2] as const) {
        const g = model(t, d).merged;
        const n = g.getAttribute('position').count;
        expect(n % 3, `Typ ${t}/${d}`).toBe(0);
        expect(n, `Typ ${t}/${d}`).toBeGreaterThan(30);
        for (const a of ATTRS) {
          const at = g.getAttribute(a);
          expect(at, `Typ ${t} ${a}`).toBeDefined();
          expect(at.count, `Typ ${t} ${a}`).toBe(n);
          for (let i = 0; i < at.array.length; i++) if (!Number.isFinite(at.array[i])) throw new Error(`NaN in Typ ${t} Attribut ${a} Index ${i}`);
        }
      }
    }
  });

  it('Dreiecksbudget je Typ: nah (Hoch, alle Varianten/Berufe) und fern', () => {
    for (const t of ALL) {
      const m = model(t, 2);
      expect(worstCaseTris(m, true, t), `${UNITS[t].key} nah`).toBeLessThanOrEqual(UNIT_BUDGET[t].near);
      expect(worstCaseTris(m, false, t), `${UNITS[t].key} fern`).toBeLessThanOrEqual(UNIT_BUDGET[t].far);
    }
    // Vorgaben der Aufgabe: Infanterie nah ≤ ~400, Ritter/Pferd ≤ ~800, Belagerung bis ~1500
    for (const t of FOOT) expect(UNIT_BUDGET[t].near).toBeLessThanOrEqual(400);
    for (const t of [U.Knight, U.HorseArcher]) expect(UNIT_BUDGET[t].near).toBeLessThanOrEqual(800);
    for (const t of SIEGE) expect(UNIT_BUDGET[t].near).toBeLessThanOrEqual(1500);
  });

  it('fernes Modell ist deutlich einfacher als das nahe', () => {
    for (const t of ALL) {
      const m = model(t, 2);
      expect(instanceTris(m, false, 0, 0), UNITS[t].key).toBeLessThan(instanceTris(m, true, 0, 0));
    }
    for (const t of FOOT) expect(worstCaseTris(model(t, 2), false, t)).toBeLessThanOrEqual(250);
  });

  it('Grafikstufen: Niedrig ohne nahe Teile, Mittel ohne Hoch-Details, Hoch am vollständigsten', () => {
    for (const t of ALL) {
      const lo = model(t, 0);
      const mid = model(t, 1);
      const hi = model(t, 2);
      expect(lo.tris, UNITS[t].key).toBeLessThan(hi.tris);
      expect(lo.tris, UNITS[t].key).toBeLessThanOrEqual(mid.tris);
      expect(mid.tris, UNITS[t].key).toBeLessThanOrEqual(hi.tris);
      const st = lo.merged.getAttribute('aStyle');
      for (let i = 0; i < st.count; i++) expect(st.getY(i) & VIS.Near, `${UNITS[t].key} niedrig enthält nahes Teil`).toBe(0);
      const sm = mid.merged.getAttribute('aStyle');
      for (let i = 0; i < sm.count; i++) expect(sm.getY(i) & VIS.Detail, `${UNITS[t].key} mittel enthält Hoch-Detail`).toBe(0);
    }
    // Hoch-Details existieren für Fußvolk (Augen, Ohren, Beschläge)
    expect(model(U.Swordsman, 2).tris).toBeGreaterThan(model(U.Swordsman, 1).tris);
  });

  it('Teile und Drehpunkte sind gültig: bekannte Kennungen, Beine paarweise, Räder mit Achse über dem Boden', () => {
    for (const t of ALL) {
      const g = model(t, 2).merged;
      const pv = g.getAttribute('aPivot');
      const st = g.getAttribute('aStyle');
      const parts = new Set<number>();
      for (let i = 0; i < pv.count; i++) {
        const w = pv.getW(i);
        expect(VALID_PARTS.has(w), `${UNITS[t].key}: Teil ${w}`).toBe(true);
        parts.add(w);
        if (w !== 0) {
          expect(Math.abs(pv.getX(i)), UNITS[t].key).toBeLessThan(2);
          expect(pv.getY(i), `${UNITS[t].key} Teil ${w}`).toBeGreaterThan(0);
          expect(pv.getY(i), `${UNITS[t].key} Teil ${w}`).toBeLessThan(3);
        }
        // Schienbeine tragen die Hüfthöhe (über dem Knie) in aStyle.z
        if (w === UPART.ShinL || w === UPART.ShinR) expect(st.getZ(i), `${UNITS[t].key} Schienbein`).toBeGreaterThan(pv.getY(i));
        if (w === UPART.Wheel) expect(Math.abs(pv.getY(i) - pv.getY(i)), 'Rad').toBe(0);
      }
      if (SIEGE.includes(t)) {
        expect(parts.has(UPART.Wheel), UNITS[t].key).toBe(true);
      } else {
        expect(parts.has(UPART.LegL) && parts.has(UPART.LegR), `${UNITS[t].key} Beine`).toBe(true);
        expect(parts.has(UPART.ShinL) && parts.has(UPART.ShinR), `${UNITS[t].key} Knie`).toBe(true);
        expect(parts.has(UPART.Head), `${UNITS[t].key} Kopf`).toBe(true);
      }
    }
    // Arme, Bogen, Wurfarm, Ramme
    expect(new Set(Array.from({ length: model(U.Archer).merged.getAttribute('aPivot').count }, (_, i) => model(U.Archer).merged.getAttribute('aPivot').getW(i))).has(UPART.Bow)).toBe(true);
    const has = (t: number, p: number): boolean => {
      const a = model(t).merged.getAttribute('aPivot');
      for (let i = 0; i < a.count; i++) if (a.getW(i) === p) return true;
      return false;
    };
    for (const t of FOOT) expect(has(t, UPART.ArmR) || t === U.Peasant, `${UNITS[t].key} Waffenarm`).toBe(true);
    expect(has(U.Peasant, UPART.ArmR) && has(U.Peasant, UPART.ArmL)).toBe(true);
    expect(has(U.Catapult, UPART.Lever) && has(U.Trebuchet, UPART.Lever)).toBe(true);
    expect(has(U.Ram, UPART.Slide) && has(U.FireBallista, UPART.Slide)).toBe(true);
  });

  it('Farbklassen, Sichtbarkeits-Bits und Berufs-Masken liegen im gültigen Bereich', () => {
    for (const t of ALL) {
      const st = model(t, 2).merged.getAttribute('aStyle');
      for (let i = 0; i < st.count; i++) {
        const c = st.getX(i);
        expect([TC.Fixed, TC.Skin, TC.Hair, TC.A, TC.B], `${UNITS[t].key} Klasse`).toContain(c);
        expect(Number.isInteger(st.getY(i)) && st.getY(i) >= 0 && st.getY(i) < 2 ** 20).toBe(true);
        expect(Number.isInteger(st.getW(i)) && st.getW(i) >= 0 && st.getW(i) < 2 ** (JOB_COUNT + 1)).toBe(true);
        if (t !== U.Peasant) expect(st.getW(i), `${UNITS[t].key} nur Bauern haben Berufsteile`).toBe(0);
      }
    }
  });

  it('Vertexfarben sind gültig (0..~1,5), Teamfarbteile tragen Helligkeit', () => {
    for (const t of ALL) {
      const g = model(t, 2).merged;
      const c = g.getAttribute('color');
      for (let i = 0; i < c.array.length; i++) {
        expect(c.array[i]).toBeGreaterThanOrEqual(0);
        expect(c.array[i]).toBeLessThan(1.6);
      }
    }
  });

  it('jeder Soldat und jedes Gerät hat Teamfarbe an gut sichtbarer Stelle (Flächenanteil)', () => {
    for (const t of ALL) {
      if (t === U.Ox) continue;
      const share = teamShare(model(t, 2), t, 0);
      expect(share, `${UNITS[t].key} Teamfarbanteil`).toBeGreaterThan(0.012);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('Figurenmodelle: Berufe der Bauern', () => {
  it('jeder Beruf hat einen eigenen Namen, einen Armstil und Ausrüstung am Berufs-Bit', () => {
    expect(JOB_NAMES.length).toBe(JOB_COUNT);
    expect(new Set(JOB_NAMES).size).toBe(JOB_COUNT);
    expect(JOB_ARM_R.length).toBe(JOB_COUNT);
    expect(JOB_ARM_L.length).toBe(JOB_COUNT);
    const m = model(U.Peasant, 2);
    const st = m.merged.getAttribute('aStyle');
    const own = new Array(JOB_COUNT).fill(0);
    for (let i = 0; i < st.count; i += 3) for (let j = 0; j < JOB_COUNT; j++) if (st.getW(i) === 1 << j) own[j]++;
    for (let j = 0; j < JOB_COUNT; j++) expect(own[j], `Beruf ${JOB_NAMES[j]}`).toBeGreaterThan(5);
  });

  it('alle Arbeitsplätze des Spiels haben einen Beruf; jede Ware kann einen Beruf anzeigen', () => {
    for (const def of BUILDINGS) if (def.workers > 0) expect(JOB_OF_BUILDING[def.id], def.key).toBeGreaterThan(0);
    for (let r = 0; r < 21; r++) expect(JOB_OF_RES[r], `Ware ${r}`).toBeGreaterThan(0);
    expect(JOB_OF_BUILDING[BT.Woodcutter]).toBe(JOB.Woodcutter);
    expect(JOB_OF_BUILDING[BT.Quarry]).toBe(JOB.Stonemason);
    expect(JOB_OF_BUILDING[BT.Blacksmith]).toBe(JOB.Smith);
  });

  it('Berufserkennung: Arbeitsplatz gewinnt, Merker bleibt stabil, Graben ist vorübergehend', () => {
    const P = WorkerPhase;
    const base = { prev: JOB.None, sub: P.Idle, carry: 0, nearBuilding: -1, roamBuilding: -1 };
    expect(resolveJob(base)).toEqual({ show: JOB.None, keep: JOB.None });
    // getragene Ware nur ohne bisherigen Beruf
    expect(resolveJob({ ...base, carry: R.Stone + 1 }).show).toBe(JOB.Stonemason);
    expect(resolveJob({ ...base, prev: JOB.Smith, carry: R.Stone + 1 }).show).toBe(JOB.Smith);
    // Arbeitsplatz am Gebäude
    expect(resolveJob({ ...base, sub: P.Working, nearBuilding: BT.Bakery })).toEqual({ show: JOB.Baker, keep: JOB.Baker });
    expect(resolveJob({ ...base, prev: JOB.Miller, sub: P.Working, nearBuilding: BT.Brewery }).show).toBe(JOB.Brewer);
    // Graben/Reparieren zeigt Werkzeug, behält aber den Beruf
    expect(resolveJob({ ...base, prev: JOB.Farmer, sub: P.Dig })).toEqual({ show: JOB.Digger, keep: JOB.Farmer });
    expect(resolveJob({ ...base, prev: JOB.Farmer, sub: P.Repair })).toEqual({ show: JOB.Carpenter, keep: JOB.Farmer });
    // Sammeln im Freien nahe einer Holzfällerhütte / Jägerhütte
    expect(resolveJob({ ...base, sub: P.Gather, roamBuilding: BT.Woodcutter }).show).toBe(JOB.Woodcutter);
    expect(resolveJob({ ...base, sub: P.Search, roamBuilding: BT.HunterPost }).show).toBe(JOB.Hunter);
    // Arbeitsplatz ohne Beruf (Lager) ändert nichts
    expect(resolveJob({ ...base, prev: JOB.Baker, sub: P.Working, nearBuilding: BT.Stockpile }).show).toBe(JOB.Baker);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Figurenvariation', () => {
  it('ist deterministisch (gleiche ID, gleiches Ergebnis) und braucht keine Zufallszahlen', () => {
    const rnd = Math.random;
    Math.random = () => {
      throw new Error('Math.random darf nicht benutzt werden');
    };
    try {
      for (const t of ALL) for (const id of [1, 77, 4097, 123456]) expect(unitVariant(t, id, 0)).toEqual(unitVariant(t, id, 0));
    } finally {
      Math.random = rnd;
    }
    expect(unitVariant(U.Peasant, 5)).not.toEqual(unitVariant(U.Peasant, 6));
  });

  it('liegt im Wertebereich: Palettenindizes, Helligkeit, Größe ±5 %, Bits', () => {
    for (const t of ALL) {
      const spec = VAR_SPEC[t];
      expect(spec, UNITS[t].key).toBeDefined();
      expect(spec.size).toBeLessThanOrEqual(0.06);
      for (let id = 1; id <= 400; id++) {
        const v = unitVariant(t, id * 7919, t === U.Peasant ? id % JOB_COUNT : 0);
        expect(v.skin).toBeGreaterThanOrEqual(0);
        expect(v.skin).toBeLessThan(SKIN_TONES.length);
        expect(v.hair).toBeLessThan(HAIR_TONES.length);
        expect(v.a).toBeLessThan(CLOTH_TONES.length);
        expect(v.b).toBeLessThan(CLOTH_TONES.length);
        expect(v.jitter).toBeGreaterThan(0.9);
        expect(v.jitter).toBeLessThan(1.1);
        expect(v.ky).toBeGreaterThanOrEqual(1 - spec.size - 1e-9);
        expect(v.ky).toBeLessThanOrEqual(1 + spec.size + 1e-9);
        expect(v.kx).toBeGreaterThan(0.9);
        expect(v.kx).toBeLessThan(1.1);
        expect(v.pack).toBeLessThan(2 ** 24);
        const u = unpackPalette(v.pack);
        expect([u.skin, u.hair, u.a, u.b]).toEqual([v.skin, v.hair, v.a, v.b]);
        expect(v.bits & (VIS.Near | VIS.Far | VIS.Detail)).toBe(0);
        // höchstens eine Haarform und eine Kopfbedeckung
        expect(HAIR_BITS.filter((b) => v.bits & b).length).toBeLessThanOrEqual(1);
        expect(HAT_BITS.filter((b) => v.bits & b).length).toBeLessThanOrEqual(1);
      }
    }
    expect(packPalette(7, 7, 31, 31, 31)).toBeLessThan(2 ** 24);
    expect(UNIT_TINTS.length).toBe(TINT_COUNT * 3);
    for (const x of UNIT_TINTS) expect(x >= 0 && x <= 1).toBe(true);
  });

  it('erzeugt sichtbare Vielfalt innerhalb eines Typs (Haut, Haar, Stoffe, Hüte, Größe)', () => {
    const stat = (t: number, job = 0): { skin: number; hair: number; a: number; hat: number; size: number; packs: number } => {
      const sk = new Set<number>();
      const ha = new Set<number>();
      const aa = new Set<number>();
      const hats = new Set<number>();
      const packs = new Set<number>();
      let lo = 9;
      let hi = 0;
      for (let id = 1; id <= 600; id++) {
        const v = unitVariant(t, id * 31, job);
        sk.add(v.skin);
        ha.add(v.hair);
        aa.add(v.a);
        hats.add(v.hat);
        packs.add(v.pack);
        lo = Math.min(lo, v.ky);
        hi = Math.max(hi, v.ky);
      }
      return { skin: sk.size, hair: ha.size, a: aa.size, hat: hats.size, size: hi - lo, packs: packs.size };
    };
    const p = stat(U.Peasant);
    expect(p.skin).toBeGreaterThanOrEqual(4);
    expect(p.hair).toBeGreaterThanOrEqual(5);
    expect(p.a).toBeGreaterThanOrEqual(6);
    expect(p.hat).toBe(3); // Strohhut, Mütze oder barhäuptig
    expect(p.size).toBeGreaterThan(0.08);
    expect(p.packs).toBeGreaterThan(200);
    const a = stat(U.Archer);
    expect(a.skin).toBeGreaterThanOrEqual(4);
    expect(a.hat).toBe(3);
    const sw = stat(U.Swordsman);
    expect(sw.skin).toBeGreaterThanOrEqual(3);
    expect(sw.size).toBeGreaterThan(0.05);
  });

  it('Berufe wählen ihre Stoffe aus der Berufspalette', () => {
    const v = unitVariant(U.Peasant, 99, JOB.Baker);
    expect([CLOTH_TONES.indexOf(0xeeeadf), CLOTH_TONES.indexOf(0xe6dcc3)]).toContain(v.a);
    expect(v.jobBit).toBe(1 << JOB.Baker);
    expect(unpackPalette(v.pack).job).toBe(JOB.Baker);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Typen- und Berufs-Unterscheidbarkeit', () => {
  interface Sig {
    name: string;
    front: Uint8Array;
    side: Uint8Array;
    hist: Float64Array;
    team: number;
  }
  const W = 40;
  const H = 64;
  const sigCache = new Map<string, Sig>();

  function sig(type: number, job: number): Sig {
    const key = `${type}:${job}`;
    const hit = sigCache.get(key);
    if (hit) return hit;
    const s = computeSig(model(type, 2), type, job);
    sigCache.set(key, s);
    return s;
  }

  function computeSig(m: UnitModel, type: number, job: number): Sig {
    const g = m.merged;
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    const st = g.getAttribute('aStyle');
    const meta = g.getAttribute('aMeta');
    const v = unitVariant(type, 1001, type === U.Peasant ? job : 0);
    const mask = VIS.Near | v.bits;
    const jobBit = 1 << job;
    const sc = UNIT_SCALE[type];
    const front = new Uint8Array(W * H);
    const side = new Uint8Array(W * H);
    const hist = new Float64Array(65);
    let total = 0;
    let team = 0;
    const tint = (cls: number): THREE.Color => {
      const i = cls === TC.Skin ? v.skin : cls === TC.Hair ? 8 + v.hair : cls === TC.A ? 16 + v.a : 16 + v.b;
      return new THREE.Color(UNIT_TINTS[i * 3], UNIT_TINTS[i * 3 + 1], UNIT_TINTS[i * 3 + 2]);
    };
    const tmp = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const raster = (grid: Uint8Array, p: [number, number][]): void => {
      // Pixel: 0.05 Tiles, Breite −1..1, Höhe 0..3,2
      const px = p.map(([a, b]) => [(a + 1) / 2 * W, (b / 3.2) * H]);
      const x0 = Math.max(0, Math.floor(Math.min(px[0][0], px[1][0], px[2][0])));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(px[0][0], px[1][0], px[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(px[0][1], px[1][1], px[2][1])));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(px[0][1], px[1][1], px[2][1])));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          const d = (px[1][1] - px[2][1]) * (px[0][0] - px[2][0]) + (px[2][0] - px[1][0]) * (px[0][1] - px[2][1]);
          if (Math.abs(d) < 1e-9) {
            grid[y * W + x] = 1;
            continue;
          }
          const l1 = ((px[1][1] - px[2][1]) * (cx - px[2][0]) + (px[2][0] - px[1][0]) * (cy - px[2][1])) / d;
          const l2 = ((px[2][1] - px[0][1]) * (cx - px[2][0]) + (px[0][0] - px[2][0]) * (cy - px[2][1])) / d;
          const l3 = 1 - l1 - l2;
          if (l1 >= -0.1 && l2 >= -0.1 && l3 >= -0.1) grid[y * W + x] = 1;
        }
    };
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const vm = st.getY(i);
      if ((mask & vm) !== vm) continue;
      const sl = st.getW(i);
      if (sl !== 0 && (sl & jobBit) === 0) continue;
      const P = [0, 1, 2].map((k) => new THREE.Vector3(pos.getX(i + k) * sc, pos.getY(i + k) * sc, pos.getZ(i + k) * sc));
      e1.subVectors(P[1], P[0]);
      e2.subVectors(P[2], P[0]);
      const area = tmp.crossVectors(e1, e2).length() / 2;
      raster(front, P.map((q) => [q.x, q.y] as [number, number]));
      raster(side, P.map((q) => [q.z, q.y] as [number, number]));
      // Farbe
      const cls = st.getX(i);
      let r = col.getX(i);
      let g2 = col.getY(i);
      let b = col.getZ(i);
      const isTeam = meta.getX(i) > 0.5;
      if (cls > 0) {
        const t = tint(cls);
        r *= t.r;
        g2 *= t.g;
        b *= t.b;
      }
      total += area;
      if (isTeam) {
        hist[64] += area;
        team += area;
      } else {
        const q = (x: number): number => Math.min(3, Math.floor(Math.pow(Math.min(1, x), 0.45) * 4));
        hist[q(r) * 16 + q(g2) * 4 + q(b)] += area;
      }
    }
    for (let i = 0; i < hist.length; i++) hist[i] /= total || 1;
    return { name: `${UNITS[type].key}${type === U.Peasant ? '/' + JOB_NAMES[job] : ''}`, front, side, hist, team: team / (total || 1) };
  }

  const iou = (a: Uint8Array, b: Uint8Array): number => {
    let i = 0;
    let u = 0;
    for (let k = 0; k < a.length; k++) {
      if (a[k] && b[k]) i++;
      if (a[k] || b[k]) u++;
    }
    return u ? i / u : 1;
  };
  const dist = (a: Sig, b: Sig): { sil: number; col: number } => {
    const sil = 1 - (iou(a.front, b.front) + iou(a.side, b.side)) / 2;
    let col = 0;
    for (let k = 0; k < a.hist.length; k++) col += Math.abs(a.hist[k] - b.hist[k]);
    return { sil, col: col / 2 };
  };

  function teamShare(m: UnitModel, type: number, job: number): number {
    return computeSig(m, type, job).team;
  }
  (globalThis as unknown as { __teamShare: typeof teamShare }).__teamShare = teamShare;

  it('alle Einheitentypen sind paarweise durch Silhouette oder Farbsignatur unterscheidbar', () => {
    const list = ALL.filter((t) => t !== U.Peasant);
    const bad: string[] = [];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const d = dist(sig(list[i], 0), sig(list[j], 0));
        // Silhouette ODER Farbe müssen sich klar unterscheiden
        if (Math.max(d.sil, d.col) < 0.2) bad.push(`${sig(list[i], 0).name} ~ ${sig(list[j], 0).name} (Sil ${d.sil.toFixed(2)}, Farbe ${d.col.toFixed(2)})`);
      }
    expect(bad).toEqual([]);
  });

  it('Bauer, Holzfäller, Steinmetz, Schmied, Müller, Bäcker … sind unter sich und von Soldaten unterscheidbar', () => {
    const jobs = Array.from({ length: JOB_COUNT }, (_, j) => j);
    const bad: string[] = [];
    for (let i = 0; i < jobs.length; i++)
      for (let j = i + 1; j < jobs.length; j++) {
        const d = dist(sig(U.Peasant, jobs[i]), sig(U.Peasant, jobs[j]));
        if (Math.max(d.sil, d.col) < 0.12) bad.push(`${JOB_NAMES[jobs[i]]} ~ ${JOB_NAMES[jobs[j]]} (Sil ${d.sil.toFixed(2)}, Farbe ${d.col.toFixed(2)})`);
      }
    expect(bad).toEqual([]);
    // jeder Beruf gegen jeden Soldaten
    for (const t of FOOT.filter((x) => x !== U.Peasant)) {
      for (const j of jobs) {
        const d = dist(sig(U.Peasant, j), sig(t, 0));
        expect(Math.max(d.sil, d.col), `${JOB_NAMES[j]} ~ ${UNITS[t].key}`).toBeGreaterThan(0.12);
      }
    }
  });

  it('Soldatentypen unterscheiden sich in der Silhouette stärker als Variation innerhalb eines Typs', () => {
    // Variation (andere Haare/Hut/Stoffe) darf die Typ-Silhouette nicht verwischen
    for (const t of [U.Spearman, U.Archer, U.Swordsman, U.Pikeman]) {
      const a = computeSig(model(t), t, 0);
      for (const t2 of [U.Spearman, U.Archer, U.Swordsman, U.Pikeman]) {
        if (t2 === t) continue;
        const d = dist(a, sig(t2, 0));
        expect(Math.max(d.sil, d.col)).toBeGreaterThan(0.2);
      }
    }
  });
});

function teamShare(m: UnitModel, type: number, job: number): number {
  return (globalThis as unknown as { __teamShare: (m: UnitModel, t: number, j: number) => number }).__teamShare(m, type, job);
}

// ---------------------------------------------------------------------------------------------
describe('Tragelast, LOD und Instanzen', () => {
  it('Tragelast-Modelle hängen am Oberkörper und sitzen hinter bzw. über dem Rücken', () => {
    for (const k of CARGO_KINDS) {
      const m = buildCargoModel(k);
      expect(m.tris, k).toBeGreaterThan(6);
      const pos = m.merged.getAttribute('position');
      const st = m.merged.getAttribute('aStyle');
      let zmin = 9;
      let ymax = 0;
      let ymin = 9;
      for (let i = 0; i < pos.count; i++) {
        zmin = Math.min(zmin, pos.getZ(i));
        ymax = Math.max(ymax, pos.getY(i));
        ymin = Math.min(ymin, pos.getY(i));
        expect(st.getZ(i), k).toBeGreaterThan(0); // Oberkörper-Neigung wie der Träger
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      }
      expect(zmin, k).toBeLessThan(-0.1);
      expect(ymin, k).toBeGreaterThan(0.15);
      expect(ymax, k).toBeLessThan(0.95);
    }
  });

  it('Nah/Fern-Grenzen steigen mit der Grafikstufe, Hysterese ist klein gegen die Grenze', () => {
    expect(LOD_NEAR_DIST[0]).toBe(0);
    expect(LOD_NEAR_DIST[1]).toBeGreaterThan(15);
    expect(LOD_NEAR_DIST[2]).toBeGreaterThan(LOD_NEAR_DIST[1]);
    expect(LOD_HYST).toBeLessThan(LOD_NEAR_DIST[1] / 4);
    expect(QUALITY.low).toBeDefined();
  });

  it('TypeMesh schreibt Variation (iVar) und Größenabweichung und behält sie beim Wachsen', () => {
    const geo = model(U.Archer, 1).merged.clone();
    const parent = new THREE.Group();
    const tm = new TypeMesh(geo, parent, { anim: true, shadow: false, cap: 2, vari: true }, teamTable([0xff0000]));
    tm.begin();
    for (let i = 0; i < 5; i++) {
      tm.push(i, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0);
      tm.styleLast(100 + i, 1.05, VIS.Near | VIS.Hair1, 1 << 3, 1.04, 0.96);
    }
    tm.end();
    expect(tm.cap).toBeGreaterThanOrEqual(5);
    const vr = geo.getAttribute('iVar') as THREE.InstancedBufferAttribute;
    for (let i = 0; i < 5; i++) {
      expect(vr.array[i * 4]).toBe(100 + i);
      expect(vr.array[i * 4 + 1]).toBeCloseTo(1.05, 5);
      expect(vr.array[i * 4 + 2]).toBe(VIS.Near | VIS.Hair1);
      expect(vr.array[i * 4 + 3]).toBe(8);
    }
    const m = tm.mesh.instanceMatrix.array as Float32Array;
    expect(m[5]).toBeCloseTo(0.96, 5); // Höhe
    expect(m[0]).toBeCloseTo(1.04, 5); // Breite
    tm.dispose();
    expect(parent.children.length).toBe(0);
  });

  it('EntityRenderer: Beruf, Nah/Fern-Maske und Variation je Instanz ohne zusätzliche Meshes', () => {
    const bw = new BenchWorld(0, 4, true);
    bw.showcaseUnits(JOB_NAMES.map((label, job) => ({ type: U.Peasant, label, job })));
    const er = new EntityRenderer(bw.w);
    for (const [id, j] of bw.showJobs) er.debugJobs.set(id, j);
    er.applyQuality(QUALITY.high);
    // ohne Kamera: alles gezeichnet und nah
    const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 500);
    cam.position.set(bw.cx, 120, bw.cy + 1);
    cam.lookAt(bw.cx, 0, bw.cy);
    er.update(0.016, {
      alpha: 0,
      now: 1,
      camYaw: Math.PI / 4,
      selected: new Set(),
      selectedBuilding: 0,
      hoverTile: null,
      visible: null,
      explored: null,
      me: 0,
      myTeam: 0,
      teamOfPlayer: [0, 1],
    });
    const mesh = (er as unknown as { unitMeshes: (TypeMesh | null)[] }).unitMeshes;
    const peasants = mesh[U.Peasant]!;
    expect(peasants.count).toBe(4 * (JOB_COUNT + 1)); // Spalte „Bauer“ der Prüfszene plus je Beruf eine Spalte
    const iv = peasants.mesh.geometry.getAttribute('iVar') as THREE.InstancedBufferAttribute;
    const bits = new Set<number>();
    for (let i = 0; i < peasants.count; i++) {
      bits.add(iv.array[i * 4 + 3]);
      expect(iv.array[i * 4 + 2] & VIS.Near).toBe(VIS.Near); // nah (Kamera ist dicht dran)
      expect(iv.array[i * 4 + 2] & VIS.Detail).toBe(VIS.Detail); // Hoch
      expect(iv.array[i * 4 + 1]).toBeGreaterThan(0.9);
    }
    expect(bits.size).toBe(JOB_COUNT);
    // jeder Typ ein Mesh: Zahl der Unit-Meshes ≤ Typen
    expect(mesh.filter(Boolean).length).toBeLessThanOrEqual(UNIT_TYPES);
    // Kamera weit weg (Hoch): Fern-Modell
    er.update(0.016, {
      alpha: 0,
      now: 1.5,
      camYaw: Math.PI / 4,
      selected: new Set(),
      selectedBuilding: 0,
      hoverTile: null,
      camera: cam,
      visible: null,
      explored: null,
      me: 0,
      myTeam: 0,
      teamOfPlayer: [0, 1],
    });
    expect(peasants.count).toBeGreaterThan(0);
    for (let i = 0; i < peasants.count; i++) {
      expect(iv.array[i * 4 + 2] & VIS.Near).toBe(0);
      expect(iv.array[i * 4 + 2] & VIS.Far).toBe(VIS.Far);
    }
    // Niedrig: nur Fern-Modell
    er.applyQuality(QUALITY.low);
    er.update(0.016, {
      alpha: 0,
      now: 2,
      camYaw: Math.PI / 4,
      selected: new Set(),
      selectedBuilding: 0,
      hoverTile: null,
      visible: null,
      explored: null,
      me: 0,
      myTeam: 0,
      teamOfPlayer: [0, 1],
    });
    const p2 = (er as unknown as { unitMeshes: (TypeMesh | null)[] }).unitMeshes[U.Peasant]!;
    const iv2 = p2.mesh.geometry.getAttribute('iVar') as THREE.InstancedBufferAttribute;
    for (let i = 0; i < p2.count; i++) expect(iv2.array[i * 4 + 2] & VIS.Near).toBe(0);
    er.dispose();
  });
});
