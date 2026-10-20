import { describe, expect, it } from 'vitest';
import { BED_LEVEL } from '../src/audio/ambience';
import {
  AmbienceInput,
  AmbienceScheduler,
  AmbienceTargets,
  computeAmbience,
  densityGain,
  MAX_SOURCES,
  natureFactor,
  nearestSources,
  nearness,
  phaseOffset,
  QUIET_INPUT,
  scanSurroundings,
  SILENT_TARGETS,
  smoothstep,
  smoothTargets,
} from '../src/audio/ambience_logic';
import { LIMITER_CFG } from '../src/audio/mix';

const inp = (o: Partial<AmbienceInput> = {}): AmbienceInput => ({ ...QUIET_INPUT, ...o });

describe('Umgebung: Pegel aus der Lage', () => {
  it('alle Zielpegel liegen in 0..1, Summe bleibt kompressiv begrenzt', () => {
    const extreme = computeAmbience(inp({ dist: 12, water: 1, trees: 1, open: 1, built: 200, folk: 500, markets: 9, fire: 1, farCombat: 20, mood: 'tension' }));
    for (const k of ['wind', 'rustle', 'water', 'murmur', 'fire', 'din', 'master'] as const) {
      expect(extreme[k], k).toBeGreaterThanOrEqual(0);
      expect(extreme[k], k).toBeLessThanOrEqual(1);
    }
    const sum = extreme.wind + extreme.rustle + extreme.water + extreme.murmur + extreme.fire + extreme.din;
    expect(sum * extreme.master).toBeLessThanOrEqual(1.6 + 1e-9);
    expect(extreme.master).toBeLessThan(1);
    const quiet = computeAmbience(QUIET_INPUT);
    expect(quiet.master).toBe(1);
  });

  it('offenes Land ohne Besonderheiten: Wind, sonst (fast) nichts', () => {
    const t = computeAmbience(inp({ open: 1 }));
    expect(t.wind).toBeGreaterThan(0.3);
    expect(t.rustle).toBe(0);
    expect(t.water).toBe(0);
    expect(t.murmur).toBe(0);
    expect(t.fire).toBe(0);
    expect(t.din).toBe(0);
    expect(t.birdsPerMin).toBeGreaterThan(0);
    expect(t.birdsPerMin).toBeLessThan(6);
  });

  it('mehr Wasser, mehr Bäume, mehr Bewohner → mehr Pegel (monoton, Bewohner sättigend)', () => {
    let prev = -1;
    for (const water of [0, 0.02, 0.05, 0.1, 0.3]) {
      const w = computeAmbience(inp({ water, dist: 20 })).water;
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
    prev = -1;
    for (const trees of [0, 0.2, 0.5, 0.9]) {
      const r = computeAmbience(inp({ trees, dist: 20 })).rustle;
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    const folk = [0, 5, 20, 60, 300].map((n) => computeAmbience(inp({ folk: n, dist: 20 })).murmur);
    for (let i = 1; i < folk.length; i++) expect(folk[i]).toBeGreaterThan(folk[i - 1]);
    // sättigend: von 60 auf 300 Bewohner kaum lauter als von 5 auf 20
    expect(folk[4] - folk[3]).toBeLessThan(folk[2] - folk[1]);
  });

  it('Zoom: nah hört man Details (Wasser, Gemurmel, Vögel), weit herausgezoomt Wind', () => {
    const base = { water: 0.2, trees: 0.6, folk: 30, built: 30, open: 0.4 };
    const near = computeAmbience(inp({ ...base, dist: 14 }));
    const far = computeAmbience(inp({ ...base, dist: 90 }));
    expect(near.water).toBeGreaterThan(far.water);
    expect(near.murmur).toBeGreaterThan(far.murmur * 2);
    expect(near.birdsPerMin).toBeGreaterThan(far.birdsPerMin);
    expect(far.wind).toBeGreaterThan(near.wind);
    expect(nearness(10)).toBe(1);
    expect(nearness(200)).toBe(0);
  });

  it('Lage: Frieden > Spannung > Schlacht für Natur; Schlacht hebt fernen Lärm; keine Vögel in der Schlacht', () => {
    const base = { trees: 0.7, water: 0.2, dist: 20, farCombat: 5, folk: 20 };
    const build = computeAmbience(inp({ ...base, mood: 'build' }));
    const tension = computeAmbience(inp({ ...base, mood: 'tension' }));
    const battle = computeAmbience(inp({ ...base, mood: 'battle' }));
    expect(build.rustle).toBeGreaterThan(tension.rustle);
    expect(tension.rustle).toBeGreaterThan(battle.rustle);
    expect(build.murmur).toBeGreaterThan(battle.murmur);
    expect(battle.din).toBeGreaterThan(tension.din);
    expect(battle.birdsPerMin).toBe(0);
    expect(build.birdsPerMin).toBeGreaterThan(tension.birdsPerMin);
    expect(natureFactor('build', 0)).toBe(1);
    expect(natureFactor('build', 10)).toBeLessThan(0.6);
    // ohne fernen Kampf kein Lärm
    expect(computeAmbience(inp({ mood: 'battle', farCombat: 0 })).din).toBe(0);
  });

  it('Stereolage wird übernommen und begrenzt; Glättung nähert sich dem Ziel ohne Überschwingen', () => {
    const t = computeAmbience(inp({ water: 0.3, waterPan: 3, farCombat: 4, farCombatPan: -5, fire: 1, firePan: 0.4 }));
    expect(t.waterPan).toBe(1);
    expect(t.dinPan).toBe(-1);
    expect(t.firePan).toBeCloseTo(0.4);
    let cur: AmbienceTargets = SILENT_TARGETS;
    let last = 0;
    for (let i = 0; i < 40; i++) {
      cur = smoothTargets(cur, t, 0.25, 1.4);
      expect(cur.water).toBeGreaterThanOrEqual(last);
      expect(cur.water).toBeLessThanOrEqual(t.water + 1e-9);
      last = cur.water;
    }
    expect(cur.water).toBeCloseTo(t.water, 1);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('jedes Bett hat einen Grundpegel, und es gibt für jedes ein Ziel im Zielobjekt', () => {
    for (const id of Object.keys(BED_LEVEL)) {
      expect(id in SILENT_TARGETS, id).toBe(true);
      expect(BED_LEVEL[id as keyof typeof BED_LEVEL]).toBeGreaterThan(0);
      expect(BED_LEVEL[id as keyof typeof BED_LEVEL]).toBeLessThanOrEqual(1);
    }
  });
});

describe('Umgebung: Quellen begrenzen (keine Hammerwand)', () => {
  const src = (id: number, x: number, y: number) => ({ id, x, y });

  it('die nächsten Quellen gewinnen, höchstens maxN, stabil bei Gleichstand', () => {
    const list = [src(1, 50, 0), src(2, 3, 0), src(3, 10, 0), src(4, 3, 0), src(5, -8, 0)];
    expect(nearestSources(list, 0, 0, 3).map((s) => s.id)).toEqual([2, 4, 5]);
    expect(nearestSources(list, 0, 0, 0)).toEqual([]);
    expect(nearestSources(list, 0, 0, 99).length).toBe(5);
    expect(nearestSources([], 0, 0, 3)).toEqual([]);
  });

  it('Dichte: eine Quelle voll, mehrere kompressiv leiser; Gesamtleistung wächst kaum', () => {
    expect(densityGain(0)).toBe(1);
    expect(densityGain(1)).toBe(1);
    expect(densityGain(2)).toBeLessThan(1);
    expect(densityGain(3)).toBeLessThan(densityGain(2));
    for (let n = 1; n <= 6; n++) {
      const power = n * densityGain(n) ** 2;
      expect(power).toBeLessThan(1.4);
    }
    // Obergrenzen je Typ vorhanden und klein
    for (const k of ['smith', 'mill', 'pick']) {
      expect(MAX_SOURCES[k], k).toBeGreaterThanOrEqual(2);
      expect(MAX_SOURCES[k], k).toBeLessThanOrEqual(3);
    }
  });

  it('Phasenversatz verteilt Quellen über die Periode (kein Gleichtakt)', () => {
    const period = 2.4;
    const ph = Array.from({ length: 12 }, (_, i) => phaseOffset(i + 1, period));
    for (const p of ph) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(period);
    }
    expect(new Set(ph.map((p) => Math.round(p * 20))).size).toBeGreaterThanOrEqual(9);
    expect(phaseOffset(7, period)).toBe(phaseOffset(7, period));
  });

  it('Ereignistypen der Umgebung haben Voice-Limits (Vögel max 2, Knistern/Gefecht begrenzt)', () => {
    for (const k of ['bird', 'clash', 'crackle']) expect(LIMITER_CFG.types[k], k).toBeDefined();
    expect(LIMITER_CFG.types.bird.max).toBeLessThanOrEqual(2);
    expect(LIMITER_CFG.types.clash.max).toBeLessThanOrEqual(3);
  });
});

describe('Umgebung: Ereignisplanung', () => {
  function sim(seconds: number, t: AmbienceTargets, i: Partial<AmbienceInput>, seed = 3, durs = { bird: 1.1, clash: 0.6, crackle: 0.1 }) {
    let s = seed * 104729;
    const rand = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const sch = new AmbienceScheduler(rand);
    const counts = { bird: 0, clash: 0, crackle: 0 };
    let maxBirds = 0;
    const times: number[] = [];
    for (let step = 0; step < seconds * 4; step++) {
      for (const ev of sch.tick(0.25, t, { farCombat: 0, fire: 0, ...i })) {
        counts[ev.kind]++;
        sch.started(ev.kind, durs[ev.kind]);
        if (ev.kind === 'bird') times.push(step * 0.25);
        expect(ev.pan).toBeGreaterThanOrEqual(-1);
        expect(ev.pan).toBeLessThanOrEqual(1);
      }
      maxBirds = Math.max(maxBirds, sch.concurrent('bird'));
    }
    return { counts, maxBirds, times };
  }

  it('Vögel: selten (Rate ≈ vorgegeben), nie mehr als zwei gleichzeitig, Mindestabstand', () => {
    const t = computeAmbience(inp({ trees: 0.6, dist: 16 }));
    const rate = t.birdsPerMin;
    expect(rate).toBeGreaterThan(2);
    const r = sim(1800, t, {});
    const perMin = r.counts.bird / 30;
    expect(perMin).toBeGreaterThan(rate * 0.5);
    expect(perMin).toBeLessThan(rate * 1.3);
    expect(r.maxBirds).toBeLessThanOrEqual(2);
    for (let i = 1; i < r.times.length; i++) expect(r.times[i] - r.times[i - 1]).toBeGreaterThanOrEqual(2.2 - 1e-9);
  });

  it('ohne Ursache keine Ereignisse: kein Feuer → kein Knistern, kein Kampf → kein Klirren, Schlacht → keine Vögel', () => {
    const calm = sim(600, computeAmbience(inp({ trees: 0.6, dist: 16 })), {});
    expect(calm.counts.crackle).toBe(0);
    expect(calm.counts.clash).toBe(0);
    const battle = sim(600, computeAmbience(inp({ mood: 'battle', trees: 0.6, dist: 16, farCombat: 5 })), { farCombat: 5 });
    expect(battle.counts.bird).toBe(0);
    expect(battle.counts.clash).toBeGreaterThan(50);
    const fire = sim(300, computeAmbience(inp({ fire: 1, dist: 16 })), { fire: 1 });
    expect(fire.counts.crackle).toBeGreaterThan(100);
  });

  it('deterministisch bei gleichem Seed', () => {
    const t = computeAmbience(inp({ trees: 0.6, dist: 16 }));
    expect(sim(300, t, {}, 9).times).toEqual(sim(300, t, {}, 9).times);
  });
});

describe('Umgebung: Karte abtasten', () => {
  const W = 64;
  const mk = (f: (x: number, y: number) => { t: number; tree?: number }) => {
    const terrain = new Uint8Array(W * W);
    const trees = new Uint8Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const c = f(x, y);
        terrain[y * W + x] = c.t;
        trees[y * W + x] = c.tree ?? 0;
      }
    return { w: W, h: W, terrain, trees };
  };
  const isWater = (t: number): boolean => t === 4 || t === 9;
  const isRock = (t: number): boolean => t === 3;

  it('Wasser: Anteil und Richtung (rechts der Kamera = positiv, Gierwinkel 0 → rechts = +x)', () => {
    const map = mk((x) => ({ t: x >= 40 ? 4 : 1 }));
    const r = scanSurroundings(map, 32, 32, 0, 20, isWater, isRock);
    expect(r.water).toBeGreaterThan(0.1);
    expect(r.waterPan).toBeGreaterThan(0.2);
    const left = mk((x) => ({ t: x <= 24 ? 4 : 1 }));
    expect(scanSurroundings(left, 32, 32, 0, 20, isWater, isRock).waterPan).toBeLessThan(-0.2);
    // Kamera um 180° gedreht: dieselbe Karte liegt auf der anderen Seite
    expect(scanSurroundings(map, 32, 32, Math.PI, 20, isWater, isRock).waterPan).toBeLessThan(-0.2);
  });

  it('Bäume, Fels, offenes Land und Kartenrand', () => {
    const forest = mk(() => ({ t: 1, tree: 3 }));
    const f = scanSurroundings(forest, 32, 32, 0.7, 18, isWater, isRock);
    expect(f.trees).toBeGreaterThan(0.9);
    expect(f.open).toBeLessThan(0.1);
    expect(f.water).toBe(0);
    const open = mk(() => ({ t: 1 }));
    expect(scanSurroundings(open, 32, 32, 0, 18, isWater, isRock).open).toBeGreaterThan(0.95);
    const rock = mk(() => ({ t: 3 }));
    expect(scanSurroundings(rock, 32, 32, 0, 18, isWater, isRock).open).toBeLessThan(0.1);
    // Kamera am Rand: außerhalb der Karte zählt als nichts, keine Fehler
    const edge = scanSurroundings(open, 1, 1, 0, 30, isWater, isRock);
    expect(edge.open).toBeGreaterThan(0);
    expect(Number.isFinite(edge.waterPan)).toBe(true);
  });
});
