import { UNIT_TYPES, U } from '@strongpoly/shared';
import { describe, expect, it } from 'vitest';
import { leadClass, voiceClassOf } from '../src/audio/classes';
import { distanceGain, LIMITER_CFG, spatialize, VoiceLimiter, viewRadius, volumeCurve, zoomGain } from '../src/audio/mix';
import { MoodDirector } from '../src/audio/mood';
import { SFX_IDS } from '../src/audio/sfx';
import { degreeToMidi, generatePhrase, inScale, MOOD_IDS, MOODS, RHYTHMS, SCALES, stepSeconds } from '../src/audio/theory';
import { migrateSettings } from '../src/game/settings';

describe('Musik: Phrasen', () => {
  it('alle Noten (Melodie, Verzierung, Bass) liegen in der gewählten Skala', () => {
    for (const mood of MOOD_IDS) {
      for (let seed = 1; seed <= 60; seed++) {
        const ph = generatePhrase(seed, mood);
        const scale = SCALES[MOODS[mood].scale];
        expect(ph.scale).toBe(MOODS[mood].scale);
        expect(ph.notes.length).toBeGreaterThan(0);
        for (const n of [...ph.notes, ...ph.bass]) {
          expect(inScale(scale, ph.root, n.midi), `${mood} seed ${seed} midi ${n.midi}`).toBe(true);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          expect(n.dur).toBeGreaterThan(0);
          expect(Number.isFinite(n.step)).toBe(true);
        }
      }
    }
  });

  it('ist bei gleichem Seed deterministisch, bei anderem Seed verschieden', () => {
    for (const mood of MOOD_IDS) {
      expect(generatePhrase(77, mood)).toEqual(generatePhrase(77, mood));
    }
    const a = JSON.stringify(generatePhrase(1, 'build'));
    let differing = 0;
    for (let s = 2; s < 20; s++) if (JSON.stringify(generatePhrase(s, 'build')) !== a) differing++;
    expect(differing).toBeGreaterThan(14);
  });

  it('Tempo wächst von Aufbau über Spannung zur Schlacht', () => {
    const avg = (m: Parameters<typeof generatePhrase>[1]) => {
      let sum = 0;
      for (let s = 0; s < 40; s++) sum += generatePhrase(s, m).bpm;
      return sum / 40;
    };
    expect(avg('build')).toBeLessThan(avg('tension'));
    expect(avg('tension')).toBeLessThan(avg('battle'));
    expect(avg('defeat')).toBeLessThan(avg('build'));
    for (const m of MOOD_IDS) {
      for (let s = 0; s < 30; s++) {
        const b = generatePhrase(s, m).bpm;
        expect(b).toBeGreaterThanOrEqual(MOODS[m].bpm * 0.96);
        expect(b).toBeLessThanOrEqual(MOODS[m].bpm * 1.04);
      }
    }
    expect(stepSeconds(60)).toBeCloseTo(0.5);
  });

  it('Schlacht ist rhythmisch dichter, Spannung hat Herzschlag, Aufbau spärlicher', () => {
    const count = (m: Parameters<typeof generatePhrase>[1], f: (p: ReturnType<typeof generatePhrase>) => number) => {
      let s = 0;
      for (let i = 0; i < 40; i++) s += f(generatePhrase(i, m));
      return s / 40;
    };
    expect(count('battle', (p) => p.drums.length)).toBeGreaterThan(count('build', (p) => p.drums.length) * 1.4);
    expect(count('battle', (p) => p.notes.length)).toBeGreaterThan(count('build', (p) => p.notes.length));
    expect(count('tension', (p) => p.drums.filter((d) => d.kind === 'beat').length)).toBeGreaterThan(1);
    expect(count('build', (p) => p.drums.filter((d) => d.kind === 'beat').length)).toBe(0);
  });

  it('Schlussphrase endet lang auf Grundton oder Quinte', () => {
    for (let s = 0; s < 30; s++) {
      for (const mood of ['victory', 'defeat'] as const) {
        const ph = generatePhrase(s, mood, { final: true });
        const last = ph.notes.filter((n) => !n.grace).at(-1)!;
        expect(last.dur).toBeGreaterThanOrEqual(8);
        const pc = (((last.midi - ph.root) % 12) + 12) % 12;
        expect([0, 7]).toContain(pc);
      }
    }
  });

  it('Rhythmuszyklen haben 8 Schritte, Skalen 7 Stufen', () => {
    for (const r of Object.values(RHYTHMS)) expect(r.length).toBe(8);
    for (const sc of Object.values(SCALES)) {
      expect(sc.length).toBe(7);
      expect(sc[0]).toBe(0);
      for (let i = 1; i < sc.length; i++) expect(sc[i]).toBeGreaterThan(sc[i - 1]);
    }
    expect(degreeToMidi(SCALES.hijaz, 62, 7)).toBe(74);
    expect(degreeToMidi(SCALES.hijaz, 62, -1)).toBe(62 - 2);
  });

  it('Spannung nutzt eine dunklere Skala (kleine Sekund), Menü ist Hijaz', () => {
    expect(SCALES[MOODS.tension.scale]).toContain(1);
    expect(SCALES[MOODS.tension.scale]).not.toContain(4);
    expect(MOODS.menu.scale).toBe('hijaz');
    expect(SCALES.hijaz).toEqual([0, 1, 4, 5, 7, 8, 10]);
  });
});

describe('Mischung: Voice-Limiter', () => {
  const cfg = { global: 5, priorityHeadroom: 2, fallback: { max: 3, gapMs: 0 }, types: { a: { max: 2, gapMs: 50 }, hi: { max: 9, gapMs: 0, priority: 2 } } };

  it('begrenzt gleichzeitige Stimmen je Typ', () => {
    const l = new VoiceLimiter(cfg);
    expect(l.request('a', 0, 1000)).toBe(true);
    expect(l.request('a', 60, 1000)).toBe(true);
    expect(l.request('a', 120, 1000)).toBe(false);
    expect(l.active(120, 'a')).toBe(2);
    expect(l.dropped).toBe(1);
  });

  it('drosselt zu schnelle Wiederholung desselben Klangs', () => {
    const l = new VoiceLimiter(cfg);
    expect(l.request('a', 0, 100)).toBe(true);
    expect(l.request('a', 30, 100)).toBe(false);
    expect(l.request('a', 51, 100)).toBe(true);
  });

  it('gibt Stimmen nach Ablauf frei', () => {
    const l = new VoiceLimiter(cfg);
    l.request('a', 0, 100);
    l.request('a', 60, 100);
    expect(l.request('a', 100, 100)).toBe(false);
    expect(l.request('a', 170, 100)).toBe(true);
    expect(l.active(170)).toBe(1);
  });

  it('globales Limit gilt, Prioritäten dürfen es leicht überschreiten', () => {
    const l = new VoiceLimiter(cfg);
    for (let i = 0; i < 5; i++) expect(l.request(`t${i}`, 0, 1000)).toBe(true);
    expect(l.request('x', 0, 1000)).toBe(false);
    expect(l.request('hi', 0, 1000)).toBe(true);
    expect(l.request('hi', 0, 1000)).toBe(true);
    expect(l.request('hi', 0, 1000)).toBe(false);
    expect(l.active(0)).toBe(7);
  });

  it('jeder Effekt hat eine Limit-Konfiguration', () => {
    for (const id of SFX_IDS) expect(LIMITER_CFG.types[id], id).toBeDefined();
    expect(LIMITER_CFG.types.arrowShot.max).toBe(4);
    expect(LIMITER_CFG.types.build.max).toBe(3);
  });
});

describe('Mischung: Raum', () => {
  it('Entfernung → Lautstärke ist monoton fallend, 1 nah, 0 fern', () => {
    let prev = 2;
    for (let d = 0; d <= 120; d += 0.5) {
      const g = distanceGain(d, 10, 60);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      prev = g;
    }
    expect(distanceGain(5, 10, 60)).toBe(1);
    expect(distanceGain(60, 10, 60)).toBe(0);
    expect(distanceGain(100, 10, 60)).toBe(0);
  });

  it('Zoom: weiter heraus ist leiser', () => {
    expect(zoomGain(10)).toBeGreaterThan(zoomGain(50));
    expect(zoomGain(50)).toBeGreaterThan(zoomGain(90));
    expect(zoomGain(200)).toBeGreaterThan(0.5);
  });

  const L = (yaw: number, dist = 38) => ({ x: 100, y: 100, yaw, dist });

  it('Pan nach der Rechtsrichtung der Kamera', () => {
    // yaw 0: Bildschirm-rechts = +x
    expect(spatialize(L(0), 110, 100).pan).toBeGreaterThan(0.2);
    expect(spatialize(L(0), 90, 100).pan).toBeLessThan(-0.2);
    expect(Math.abs(spatialize(L(0), 100, 110).pan)).toBeLessThan(1e-9);
    // um 90° gedreht: rechts = -y
    expect(spatialize(L(Math.PI / 2), 100, 90).pan).toBeGreaterThan(0.2);
    expect(spatialize(L(Math.PI / 2), 100, 110).pan).toBeLessThan(-0.2);
    // Pan bleibt begrenzt
    expect(Math.abs(spatialize(L(0), 400, 100).pan)).toBeLessThanOrEqual(0.85);
  });

  it('Klänge außerhalb des Sichtbereichs sind nicht hörbar, nahe laut', () => {
    const near = spatialize(L(0.7), 102, 101);
    const far = spatialize(L(0.7), 100 + viewRadius(38) * 1.7, 100);
    const mid = spatialize(L(0.7), 100 + viewRadius(38) * 0.9, 100);
    expect(near.gain).toBeGreaterThan(0.8);
    expect(near.audible).toBe(true);
    expect(far.audible).toBe(false);
    expect(mid.gain).toBeLessThan(near.gain);
    expect(mid.gain).toBeGreaterThan(far.gain);
    expect(mid.lowpass).toBeLessThan(near.lowpass);
    // gleicher Abstand ist bei starkem Herauszoomen leiser, aber weiter hörbar
    expect(spatialize(L(0, 80), 130, 100).audible).toBe(true);
    expect(spatialize(L(0, 12), 130, 100).audible).toBe(false);
  });

  it('Lautstärkekurve ist monoton und begrenzt', () => {
    let prev = -1;
    for (let v = -0.5; v <= 1.5; v += 0.05) {
      const g = volumeCurve(v);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
    expect(volumeCurve(0)).toBe(0);
    expect(volumeCurve(1)).toBe(1);
    expect(volumeCurve(2)).toBe(1);
  });
});

describe('Stimmungsableitung', () => {
  it('bleibt im Aufbau ohne Bedrohung und ohne Kampf', () => {
    const d = new MoodDirector();
    for (let i = 0; i < 400; i++) d.update(0.25, { enemyNear: 0, combat: 0 });
    expect(d.mood).toBe('build');
  });

  it('wechselt bei anhaltender Bedrohung zu Spannung und zurück', () => {
    const d = new MoodDirector();
    for (let i = 0; i < 40; i++) d.update(0.25, { enemyNear: 5, combat: 0 });
    expect(d.mood).toBe('tension');
    for (let i = 0; i < 100; i++) d.update(0.25, { enemyNear: 0, combat: 0 });
    expect(d.mood).toBe('build');
  });

  it('wechselt bei Kampf zur Schlacht und fällt erst nach Ruhe zurück', () => {
    const d = new MoodDirector();
    for (let i = 0; i < 40; i++) d.update(0.25, { enemyNear: 6, combat: 3 });
    expect(d.mood).toBe('battle');
    for (let i = 0; i < 12; i++) d.update(0.25, { enemyNear: 6, combat: 0 });
    expect(d.mood).toBe('battle');
    for (let i = 0; i < 100; i++) d.update(0.25, { enemyNear: 6, combat: 0 });
    expect(d.mood).toBe('tension');
    for (let i = 0; i < 200; i++) d.update(0.25, { enemyNear: 0, combat: 0 });
    expect(d.mood).toBe('build');
  });

  it('flackert nicht bei wechselnder Eingabe', () => {
    const d = new MoodDirector();
    let changes = 0;
    let last = d.mood;
    for (let i = 0; i < 480; i++) {
      d.update(0.25, { enemyNear: i % 4 < 2 ? 5 : 0, combat: i % 6 < 3 ? 1.5 : 0 });
      if (d.mood !== last) {
        changes++;
        last = d.mood;
      }
    }
    expect(changes).toBeLessThanOrEqual(6);
  });
});

describe('Einheitenklassen und Einstellungen', () => {
  it('jede Einheit hat eine Klasse', () => {
    const seen = new Set<string>();
    for (let t = 0; t < UNIT_TYPES; t++) seen.add(voiceClassOf(t));
    expect(seen).toEqual(new Set(['infantry', 'archer', 'cavalry', 'siege', 'worker', 'lord', 'monk', 'special']));
    expect(voiceClassOf(U.Knight)).toBe('cavalry');
    expect(voiceClassOf(U.Catapult)).toBe('siege');
    expect(leadClass([U.Peasant, U.Swordsman, U.Archer])).toBe('infantry');
    expect(leadClass([U.Peasant])).toBe('worker');
    expect(leadClass([])).toBeNull();
  });

  it('Einstellungen: alter Regler "volume" wird zu volMaster migriert', () => {
    expect(migrateSettings({ volume: 0.4, music: false })).toEqual({ volMaster: 0.4, music: false });
    expect(migrateSettings({ volume: 0.4, volMaster: 0.9 }).volMaster).toBe(0.9);
    expect(migrateSettings({ volSfx: 7, volMusic: -2, volAdvisor: 'x' })).toEqual({ volSfx: 1, volMusic: 0 });
  });
});
