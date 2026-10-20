import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BT, BUILDINGS, BUILDING_TYPES, BuildingRec, ClientBuilding, ClientWorld, GameMap, TICK_RATE } from '@strongpoly/shared';
import { BuildSites } from '../src/render/build_sites';
import { BUILD_CLASS_OF, BUILD_CLASS_RANGE, BUILD_CLASS_SECONDS, buildClass, buildSeconds, buildTicksOf, WALL_SWEEP } from '../src/render/build_config';
import { buildingLevelOf } from '../src/render/building_materials';
import { AUTO_LO, AUTO_SPAN } from '../src/render/builder';
import { buildProgress, constructionParams, STAGE_BOUNDS, wallDelayTicks, wallGroupTicks, wallOrder, buildAgeTicks } from '../src/render/construction';
import { EntityRenderer, buildTicks } from '../src/render/entities';
import { FxSystem } from '../src/render/fx';
import { teamTable } from '../src/render/instanced';
import { buildBuildingModel, buildTurretModel, buildWallModel, MODELLED_TYPES, TRIS_BUDGET, TURRET_BASE_Y, WALL_TYPES } from '../src/render/models_buildings';
import { QUALITY } from '../src/render/quality';
import { EMITTERS } from '../src/render/work_fx';

describe('Bau-Konfiguration (zentral)', () => {
  it('jeder Gebäudetyp hat eine Klasse und eine Dauer innerhalb der Klassenspanne', () => {
    expect(Object.keys(BUILD_CLASS_OF).length).toBe(BUILDING_TYPES);
    for (const def of BUILDINGS) {
      const c = buildClass(def.id);
      expect(BUILD_CLASS_OF[def.id], def.key).toBeDefined();
      const s = buildSeconds(def.id);
      const [lo, hi] = BUILD_CLASS_RANGE[c];
      expect(s, `${def.key} ${c}`).toBeGreaterThanOrEqual(lo);
      expect(s, `${def.key} ${c}`).toBeLessThanOrEqual(hi);
      expect(buildTicksOf(def)).toBe(Math.round(s * TICK_RATE));
      expect(buildTicks(def)).toBe(buildTicksOf(def));
    }
  });
  it('Richtwerte: kleine Wirtschaft 1–3 s, große 3–5 s, Türme/Tore 4–7 s, Mauern schnell', () => {
    for (const t of [BT.Woodcutter, BT.OxTether, BT.HunterPost, BT.Well, BT.Hovel, BT.Stockpile]) {
      expect(buildSeconds(t), String(t)).toBeGreaterThanOrEqual(1);
      expect(buildSeconds(t), String(t)).toBeLessThanOrEqual(3);
    }
    for (const t of [BT.Mill, BT.Inn, BT.Church, BT.Cathedral, BT.Barracks, BT.EngineerGuild]) {
      expect(buildSeconds(t), String(t)).toBeGreaterThanOrEqual(3);
      expect(buildSeconds(t), String(t)).toBeLessThanOrEqual(5.5);
    }
    for (const t of [BT.TowerLookout, BT.TowerGuard, BT.TowerRound, BT.GateWood, BT.GateStone]) {
      expect(buildSeconds(t), String(t)).toBeGreaterThanOrEqual(4);
      expect(buildSeconds(t), String(t)).toBeLessThanOrEqual(7);
    }
    for (const t of WALL_TYPES) expect(buildSeconds(t)).toBeLessThanOrEqual(1.5);
    expect(BUILD_CLASS_SECONDS.none).toBe(0);
  });
  it('Bergfried, Lagerfeuer, Fallen und Geschütze bauen nicht auf (Startzustand bzw. keine eigene Baustelle)', () => {
    for (const t of [BT.Keep, BT.Campfire, BT.Pit, BT.KillingPit, BT.PitchDitch, BT.TurretBallista, BT.TurretMangonel]) expect(buildTicksOf(BUILDINGS[t])).toBe(0);
  });
});

describe('Baufortschritt (reine Funktionen)', () => {
  it('Zeit → Fortschritt: 0 am Anfang, monoton, 1 nach der Dauer', () => {
    const dur = 40;
    let last = -1;
    for (let age = -3; age <= dur + 5; age += 0.25) {
      const p = buildProgress(1000 + age, 1000, 0, dur);
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
    }
    expect(buildProgress(1000, 1000, 0, dur)).toBe(0);
    expect(buildProgress(1000 + dur, 1000, 0, dur)).toBe(1);
    expect(buildProgress(1000 + dur / 2, 1000, 0, dur)).toBeCloseTo(0.5, 5);
  });
  it('Interpolationsanteil wirkt, bleibt aber auf einen Tick begrenzt (Pause)', () => {
    expect(buildAgeTicks(1010, 1000, 0.5)).toBeCloseTo(10.5);
    expect(buildAgeTicks(1010, 1000, 7)).toBeCloseTo(11);
    expect(buildAgeTicks(1010, 1000, -2)).toBeCloseTo(10);
  });
  it('Reconnect, Laden und Voll-Snapshot: alte oder anfängliche Gebäude sind fertig und werden nicht neu aufgebaut', () => {
    const dur = buildTicksOf(BUILDINGS[BT.Mill]);
    // Platzierung liegt lange zurück
    expect(buildProgress(5000, 1000, 0, dur)).toBe(1);
    expect(buildProgress(1000 + dur, 1000, 0, dur)).toBe(1);
    // von Beginn an (born 0, auch Spielstände ohne Tick) und Typen ohne Bauzeit
    expect(buildProgress(3, 0, 0, dur)).toBe(1);
    expect(buildProgress(1000, 1000, 0, 0)).toBe(1);
    // junge Platzierung: Reconnect mitten in der Bauphase zeigt den passenden Stand statt von vorn zu beginnen
    const mid = buildProgress(1000 + dur / 2, 1000, 0, dur);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
  it('Spielgeschwindigkeit: der Fortschritt hängt nur an Ticks, nicht an der Echtzeit', () => {
    const dur = 40;
    // bei doppelter Geschwindigkeit sind in derselben Zeit doppelt so viele Ticks vergangen
    expect(buildProgress(1020, 1000, 0, dur)).toBeCloseTo(0.5);
    expect(buildProgress(1040, 1000, 0, dur)).toBe(1);
  });
  it('Stadien und Parameter: Monotonie, Endzustand, kein Sprung', () => {
    const order = ['ground', 'frame', 'raise', 'finish', 'done'];
    let lastStage = 0;
    let lastRaise = 0;
    let prev = constructionParams(0);
    expect(prev.stage).toBe('ground');
    expect(prev.raise).toBe(0);
    expect(prev.done).toBe(false);
    for (let i = 1; i <= 1000; i++) {
      const p = i / 1000;
      const c = constructionParams(p);
      const si = order.indexOf(c.stage);
      expect(si).toBeGreaterThanOrEqual(lastStage);
      lastStage = si;
      expect(c.raise).toBeGreaterThanOrEqual(lastRaise);
      lastRaise = c.raise;
      // keine Sprünge: Gerüst, Material, Fundament ändern sich je Promille nur wenig
      expect(Math.abs(c.scaffold - prev.scaffold), `p=${p}`).toBeLessThan(0.06);
      expect(Math.abs(c.materials - prev.materials), `p=${p}`).toBeLessThan(0.06);
      expect(Math.abs(c.ground - prev.ground), `p=${p}`).toBeLessThan(0.06);
      prev = c;
    }
    const end = constructionParams(1);
    expect(end.done).toBe(true);
    expect(end.stage).toBe('done');
    expect(end.raise).toBe(1);
    expect(end.scaffold).toBe(0);
    expect(end.materials).toBe(0);
    // Gerüst steigt zuerst und wird erst am Ende wieder abgebaut, es ist vor dem Abschluss fast weg
    expect(constructionParams(0.5).scaffold).toBeGreaterThan(constructionParams(0.1).scaffold);
    expect(constructionParams(0.99).scaffold).toBeLessThan(0.05);
    expect(STAGE_BOUNDS.ground).toBeLessThan(STAGE_BOUNDS.frame);
    expect(STAGE_BOUNDS.frame).toBeLessThan(STAGE_BOUNDS.raise);
  });
});

describe('Mauerzug', () => {
  const line = (n: number, y = 5) => Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 10 + i, y }));
  it('gerade Linie: Reihenfolge läuft lückenlos von einem Ende zum anderen', () => {
    const o = wallOrder(line(12));
    const idx = [...o.values()].sort((a, b) => a - b);
    expect(idx).toEqual(Array.from({ length: 12 }, (_, i) => i));
    // benachbarte Stücke unterscheiden sich in der Ausbreitungsreihenfolge um genau 1
    for (let i = 1; i < 12; i++) expect(Math.abs(o.get(i + 1)! - o.get(i)!)).toBe(1);
    expect(o.get(1)).toBe(0);
  });
  it('Winkel (L-Form): jedes Stück hat einen früheren Nachbarn, außer dem ersten', () => {
    const pieces = [...line(6), ...[1, 2, 3].map((j, k) => ({ id: 100 + k, x: 15, y: 5 + j }))];
    const o = wallOrder(pieces);
    expect(o.size).toBe(pieces.length);
    const at = new Map(pieces.map((p) => [`${p.x},${p.y}`, p.id]));
    for (const p of pieces) {
      const i = o.get(p.id)!;
      if (i === 0) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at.get(`${p.x + dx},${p.y + dy}`)).filter((v): v is number => v !== undefined);
      expect(nb.some((n) => o.get(n)! < i), `Stück ${p.id}`).toBe(true);
    }
  });
  it('getrennte Linien werden einzeln geordnet', () => {
    const o = wallOrder([...line(3, 5), ...line(3, 20).map((p) => ({ ...p, id: p.id + 50 }))]);
    expect(o.size).toBe(6);
  });
  it('Verzögerung: monoton, Gesamtlaufzeit begrenzt (lange Mauern bleiben schnell)', () => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const d = wallDelayTicks(i, 40);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
    const dur = buildTicksOf(BUILDINGS[BT.WallHigh]);
    expect(wallGroupTicks(40, dur)).toBeLessThanOrEqual(WALL_SWEEP.maxSweep * TICK_RATE + dur + 1e-6);
    expect(wallGroupTicks(1, dur)).toBe(dur);
    expect(wallDelayTicks(0, 10)).toBe(0);
  });
});

describe('Modelle: Bauzeitfenster und Aufbau ohne schwebende Teile', () => {
  /** CPU-Nachbildung der Höhenmaske im Shader: größte sichtbare Höhe bei Fortschritt r */
  function topAt(g: THREE.BufferGeometry, r: number): number {
    const pos = g.getAttribute('position');
    const bld = g.getAttribute('aBuild');
    let top = 0;
    for (let i = 0; i < pos.count; i++) {
      const s0 = bld.getX(i);
      const s1 = bld.getY(i);
      if (r <= s0) continue;
      const t = Math.min(1, Math.max(0, (r - s0) / Math.max(0.001, s1 - s0)));
      // sichtbar ist alles unterhalb der Schnitthöhe; die Teilhöhe wächst stetig mit t
      const cut = bld.getZ(i) + t * bld.getW(i);
      const y = pos.getY(i);
      void y;
      top = Math.max(top, cut);
    }
    return top;
  }
  it('alle Gebäudeteile haben gültige Zeitfenster, der Endzustand zeigt das ganze Modell', () => {
    for (const def of BUILDINGS) {
      const g = buildBuildingModel(def, 2).merged;
      const bld = g.getAttribute('aBuild');
      const pos = g.getAttribute('position');
      expect(bld, def.key).toBeDefined();
      let maxY = 0;
      for (let i = 0; i < bld.count; i++) {
        const s0 = bld.getX(i);
        const s1 = bld.getY(i);
        expect(s0, def.key).toBeGreaterThanOrEqual(0.09);
        expect(s1, def.key).toBeGreaterThan(s0);
        expect(s1, def.key).toBeLessThanOrEqual(0.97);
        maxY = Math.max(maxY, pos.getY(i));
      }
      // Endzustand: bei Fortschritt 1 ist alles sichtbar (= fertiges Modell)
      expect(topAt(g, 1), def.key).toBeCloseTo(maxY, 4);
      expect(topAt(g, 0), def.key).toBe(0);
    }
  });
  it('die sichtbare Höhe wächst monoton und ohne Sprünge', () => {
    for (const id of [BT.Hovel, BT.Mill, BT.Bakery, BT.Church, BT.Cathedral, BT.TowerGuard, BT.TowerRound, BT.GateStone, BT.Barracks, BT.Inn]) {
      const def = BUILDINGS[id];
      const g = buildBuildingModel(def, 2).merged;
      const H = topAt(g, 1);
      let last = 0;
      let worst = 0;
      for (let r = 0.01; r <= 1.0001; r += 0.01) {
        const t = topAt(g, r);
        expect(t, `${def.key} r=${r.toFixed(2)}`).toBeGreaterThanOrEqual(last - 1e-6);
        worst = Math.max(worst, t - last);
        last = t;
      }
      // je Hundertstel des Fortschritts wächst das Modell höchstens um einen kleinen Teil seiner Höhe
      expect(worst, def.key).toBeLessThan(H * 0.2);
    }
  });
  it('Dachteile beginnen erst, wenn die Wände darunter fertig sind (Auto-Fenster folgen der Höhe)', () => {
    const g = buildBuildingModel(BUILDINGS[BT.Bakery], 2).merged;
    const pos = g.getAttribute('position');
    const bld = g.getAttribute('aBuild');
    // alle Teile, die ganz oberhalb der Wandoberkante (~1,1) liegen, starten nach dem Aufbau der Wand
    let wallDone = 0;
    for (let i = 0; i < pos.count; i++) if (bld.getZ(i) + bld.getW(i) <= 1.12 && bld.getW(i) > 0.5) wallDone = Math.max(wallDone, bld.getY(i));
    expect(wallDone).toBeGreaterThan(AUTO_LO);
    for (let i = 0; i < pos.count; i++) if (bld.getZ(i) > 1.2) expect(bld.getX(i)).toBeGreaterThanOrEqual(wallDone - 0.06);
    expect(AUTO_LO + AUTO_SPAN).toBeLessThan(0.9);
  });
  it('Mauerstücke wachsen ebenfalls über Zeitfenster', () => {
    for (const id of WALL_TYPES) for (const kind of ['arm', 'post', 'stub'] as const) {
      const g = buildWallModel(id, BUILDINGS[id].height, kind, 2).merged;
      expect(g.getAttribute('aBuild')).toBeDefined();
      expect(topAt(g, 0)).toBe(0);
      expect(topAt(g, 0.5)).toBeGreaterThan(0);
      expect(topAt(g, 1)).toBeGreaterThanOrEqual(BUILDINGS[id].height);
    }
  });
});

describe('Gebäudemodelle (4B)', () => {
  it('jeder Gebäudetyp hat ein eigenes Modell', () => {
    for (const def of BUILDINGS) expect(MODELLED_TYPES, def.key).toContain(def.id);
  });
  it('Dreiecksbudget je Typ und Detailstufen steigen monoton', () => {
    for (const def of BUILDINGS) {
      const t0 = buildBuildingModel(def, 0).tris;
      const t1 = buildBuildingModel(def, 1).tris;
      const t2 = buildBuildingModel(def, 2).tris;
      expect(t0, def.key).toBeGreaterThan(0);
      expect(t0, def.key).toBeLessThanOrEqual(t1);
      expect(t1, def.key).toBeLessThanOrEqual(t2);
      const budget = def.id === BT.Keep ? TRIS_BUDGET.keep : WALL_TYPES.includes(def.id) || def.id === BT.Stairs ? TRIS_BUDGET.wall : def.w * def.h >= 16 || def.id === BT.TowerGuard ? TRIS_BUDGET.large : TRIS_BUDGET.normal;
      expect(t2, def.key).toBeLessThanOrEqual(budget);
    }
    // Bergfried ist monumental, aber nicht uferlos
    const keep = buildBuildingModel(BUILDINGS[BT.Keep], 2).tris;
    expect(keep).toBeGreaterThan(3000);
    expect(keep).toBeLessThanOrEqual(8000);
  });
  it('Modell bleibt im Footprint (Funktion und Maße unverändert), Laufhöhe stimmt', () => {
    for (const def of BUILDINGS) {
      if (def.id === BT.TurretBallista || def.id === BT.TurretMangonel) continue;
      const g = buildBuildingModel(def, 2).merged;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const hw = def.w / 2 + (def.id === BT.Keep ? 0.7 : 0.5);
      const hd = def.h / 2 + (def.id === BT.Keep ? 0.7 : 0.5);
      if (!WALL_TYPES.includes(def.id) && def.id !== BT.Stairs) {
        expect(bb.max.x, def.key).toBeLessThanOrEqual(hw);
        expect(bb.min.x, def.key).toBeGreaterThanOrEqual(-hw);
        expect(bb.max.z, def.key).toBeLessThanOrEqual(hd);
        expect(bb.min.z, def.key).toBeGreaterThanOrEqual(-hd);
      }
      expect(bb.min.y, def.key).toBeGreaterThanOrEqual(-0.15);
    }
    // Kronen der begehbaren Bauwerke liegen auf der Laufhöhe der Einheiten
    for (const id of [BT.Keep, BT.TowerLookout, BT.TowerGuard, BT.TowerRound, BT.GateWood, BT.GateStone]) {
      const def = BUILDINGS[id];
      const pos = buildBuildingModel(def, 2).merged.getAttribute('position');
      let has = false;
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - def.height) < 1e-3) has = true;
      expect(has, def.key).toBe(true);
    }
  });
  it('Oberflächenarten und Teamkanal sind gültig', () => {
    for (const def of BUILDINGS) {
      const g = buildBuildingModel(def, 2).merged;
      const surf = g.getAttribute('aSurf');
      for (let i = 0; i < surf.count; i++) {
        expect(surf.getX(i)).toBeGreaterThanOrEqual(0);
        expect(surf.getX(i)).toBeLessThanOrEqual(9);
      }
    }
    // Spielerfarbe an Fahnen, Wimpeln und Dachfirsten: jeder bewohnbare/militärische Bau hat Teamflächen
    for (const id of [BT.Keep, BT.Barracks, BT.Hovel, BT.Mill, BT.Church, BT.TowerGuard, BT.GateStone, BT.Market]) {
      const m = buildBuildingModel(BUILDINGS[id], 2);
      expect(m.accent, BUILDINGS[id].key).not.toBeNull();
      expect(m.accent!.getAttribute('position').count).toBeGreaterThan(0);
    }
  });
  it('Typen sind an Silhouette und Dreiecksverteilung unterscheidbar (keine zwei gleichen Modelle)', () => {
    const sig = new Map<string, string>();
    for (const def of BUILDINGS) {
      const g = buildBuildingModel(def, 2).merged;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const s = `${buildBuildingModel(def, 2).tris}|${bb.max.y.toFixed(2)}|${bb.max.x.toFixed(2)}|${bb.min.z.toFixed(2)}`;
      expect(sig.has(s), `${def.key} gleicht ${sig.get(s)}`).toBe(false);
      sig.set(s, def.key);
    }
  });
  it('Geschütze (Ballista, Mangonel) haben Modelle und sitzen auf der Turmkrone', () => {
    for (const k of ['ballista', 'mangonel'] as const) {
      const m = buildTurretModel(k, 2);
      expect(m.tris).toBeGreaterThan(100);
      expect(m.accent).not.toBeNull();
    }
    expect(TURRET_BASE_Y).toBe(BUILDINGS[BT.TowerRound].height);
  });
  it('Rauch, Dampf und Funken sitzen an den Modellen (Position innerhalb der Hülle plus Aufstieg)', () => {
    for (const [k, list] of Object.entries(EMITTERS)) {
      const def = BUILDINGS[Number(k)];
      const g = buildBuildingModel(def, 2).merged;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      for (const e of list) {
        expect(e.x, def.key).toBeGreaterThanOrEqual(bb.min.x - 0.6);
        expect(e.x, def.key).toBeLessThanOrEqual(bb.max.x + 0.6);
        expect(e.z, def.key).toBeGreaterThanOrEqual(bb.min.z - 0.6);
        expect(e.z, def.key).toBeLessThanOrEqual(bb.max.z + 0.6);
        expect(e.y, def.key).toBeGreaterThanOrEqual(0);
        expect(e.y, def.key).toBeLessThanOrEqual(bb.max.y + 0.6);
      }
    }
  });
  it('Grafikstufen: Niedrig vereinfacht (ohne Muster, geringere Detailstufe), Mittel und Hoch voll', () => {
    expect(buildingLevelOf(QUALITY.low)).toEqual({ detail: 1, patterns: false });
    expect(buildingLevelOf(QUALITY.medium)).toEqual({ detail: 2, patterns: true });
    expect(buildingLevelOf(QUALITY.high)).toEqual({ detail: 2, patterns: true });
    let lower = 0;
    for (const def of BUILDINGS) if (buildBuildingModel(def, 1).tris < buildBuildingModel(def, 2).tris) lower++;
    expect(lower).toBeGreaterThan(20);
  });
});

/** kleine Welt mit Gebäuden für Baustellen-Tests */
function mkWorld(): ClientWorld {
  const w = new ClientWorld();
  w.map = new GameMap(48, 48);
  w.bldAt = new Int32Array(w.map.n);
  w.players = [
    { id: 0, name: 'A', team: 0, color: 0, kind: 'human', alive: true, keepX: 10, keepY: 10 },
    { id: 1, name: 'B', team: 1, color: 1, kind: 'ai', alive: true, keepX: 40, keepY: 40 },
  ];
  return w;
}
function place(w: ClientWorld, id: number, t: number, x: number, y: number, n: number, o = 0): ClientBuilding {
  const rec: BuildingRec = { i: id, t, o, x, y, r: 0, hp: BUILDINGS[t].hp, f: 0, u: 0, q: 0, s: 0, c: 0, b: 0, p: 0, n };
  const cb = rec as ClientBuilding;
  w.placeBuilding(cb);
  w.buildings.set(id, cb);
  w.buildingsDirty = true;
  return cb;
}

describe('Baustellen im Renderer (Sofortbau bleibt rein visuell)', () => {
  const team = teamTable([0xff0000, 0x0000ff]);
  it('BuildSites.progress: Gebäude wächst über seine Dauer, ältere sind fertig, Mauerzug staffelt', () => {
    const w = mkWorld();
    const sites = new BuildSites(new THREE.Group(), new FxSystem(), team);
    w.tick = 2000;
    const mill = place(w, 1, BT.Mill, 5, 5, 2000);
    const old = place(w, 2, BT.Mill, 12, 5, 100);
    const start = place(w, 3, BT.Bakery, 20, 5, 0);
    expect(sites.progress(w, mill, 0)).toBe(0);
    expect(sites.progress(w, old, 0)).toBe(1);
    expect(sites.progress(w, start, 0)).toBe(1);
    w.tick = 2000 + Math.round(buildTicksOf(BUILDINGS[BT.Mill]) / 2);
    expect(sites.progress(w, mill, 0)).toBeCloseTo(0.5, 1);
    w.tick = 2000 + buildTicksOf(BUILDINGS[BT.Mill]);
    expect(sites.progress(w, mill, 0)).toBe(1);
    // Mauerlinie: alle Stücke gleicher Tick, das erste startet sofort, das letzte später, alle enden spätestens nach der Gruppenlaufzeit
    const walls: ClientBuilding[] = [];
    for (let i = 0; i < 10; i++) walls.push(place(w, 100 + i, BT.WallHigh, 20 + i, 30, 3000));
    w.tick = 3001;
    const ps = walls.map((b) => sites.progress(w, b, 0));
    const first = Math.max(...ps);
    expect(first).toBeGreaterThan(0);
    expect(Math.min(...ps)).toBe(0);
    const total = wallGroupTicks(10, buildTicksOf(BUILDINGS[BT.WallHigh]));
    w.tick = 3000 + Math.ceil(total);
    for (const b of walls) expect(sites.progress(w, b, 0)).toBe(1);
    // später (Reconnect): keine Gruppierung mehr nötig, fertig
    w.tick = 9000;
    for (const b of walls) expect(sites.progress(w, b, 0)).toBe(1);
  });
  it('EntityRenderer: Platzierung → Baustelle → fertig; Neuverbindung baut nichts neu auf; Abbruch räumt auf', () => {
    const w = mkWorld();
    const er = new EntityRenderer(w);
    const opts = (alpha = 0) => ({
      alpha,
      now: w.tick / 10,
      camYaw: 0,
      selected: new Set<number>(),
      selectedBuilding: 0,
      hoverTile: null,
      visible: null,
      explored: null,
      me: 0,
      myTeam: 0,
      teamOfPlayer: [0, 1],
    });
    const building = (): number => (er as unknown as { building: Set<number> }).building.size;
    w.tick = 500;
    place(w, 1, BT.Hovel, 8, 8, 500);
    place(w, 2, BT.Keep, 20, 20, 0);
    er.update(0.016, opts());
    expect(building()).toBe(1);
    // mitten im Bau
    w.tick = 500 + 10;
    er.update(0.016, opts());
    expect(building()).toBe(1);
    // fertig
    w.tick = 500 + buildTicksOf(BUILDINGS[BT.Hovel]) + 1;
    er.update(0.016, opts());
    expect(building()).toBe(0);
    // Reconnect: neuer Renderer, Welt mit Voll-Zustand weit nach der Platzierung → nichts im Bau
    const w2 = mkWorld();
    w2.tick = 9000;
    place(w2, 1, BT.Hovel, 8, 8, 500);
    place(w2, 2, BT.Cathedral, 20, 20, 8990 - 5000);
    const er2 = new EntityRenderer(w2);
    er2.update(0.016, { ...opts(), now: 900 });
    expect((er2 as unknown as { building: Set<number> }).building.size).toBe(0);
    // junge Platzierung: Neuverbindung zeigt den passenden Zwischenstand
    const w3 = mkWorld();
    w3.tick = 9000;
    place(w3, 1, BT.Church, 8, 8, 8990);
    const er3 = new EntityRenderer(w3);
    er3.update(0.016, { ...opts(), now: 900 });
    expect((er3 as unknown as { building: Set<number> }).building.size).toBe(1);
    // Abbruch während der Bauphase (Rückgängig): Gebäude verschwindet, Menge wird geleert, kein Absturz
    const b = w3.buildings.get(1)!;
    w3.clearBuilding(b);
    w3.removedBuildings.push(b);
    w3.buildings.delete(1);
    w3.buildingsDirty = true;
    er3.consumeEvents();
    er3.clearEvents();
    er3.update(0.016, { ...opts(), now: 901 });
    expect((er3 as unknown as { building: Set<number> }).building.size).toBe(0);
    // Zerstörung während der Bauphase: Einsturz läuft wie bei fertigen Gebäuden
    const w4 = mkWorld();
    w4.tick = 700;
    place(w4, 1, BT.Barracks, 8, 8, 700);
    const er4 = new EntityRenderer(w4);
    er4.update(0.016, { ...opts(), now: 70 });
    const b4 = w4.buildings.get(1)!;
    w4.clearBuilding(b4);
    w4.removedBuildings.push(b4);
    w4.buildings.delete(1);
    w4.events.push({ e: 'fx', k: 'collapse', x: 10, y: 10, z: 2 });
    er4.consumeEvents();
    er4.update(0.016, { ...opts(), now: 70.3 });
    expect((er4 as unknown as { collapsing: unknown[] }).collapsing.length).toBe(1);
  });
  it('Geschütz auf dem Großen Turm wird gezeichnet', () => {
    const w = mkWorld();
    const er = new EntityRenderer(w);
    w.tick = 100;
    const t = place(w, 1, BT.TowerRound, 8, 8, 0);
    t.u = 1;
    er.update(0.016, { alpha: 0, now: 10, camYaw: 0, selected: new Set(), selectedBuilding: 0, hoverTile: null, visible: null, explored: null, me: 0, myTeam: 0, teamOfPlayer: [0, 1] });
    const turrets = (er as unknown as { turretMeshes: ({ count: number } | null)[] }).turretMeshes;
    expect(turrets[1]?.count).toBe(1);
    expect(turrets[2]?.count ?? 0).toBe(0);
  });
});
