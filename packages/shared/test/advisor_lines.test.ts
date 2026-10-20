import { describe, expect, it } from 'vitest';
import { ADVISOR_DE, ADVISOR_EN, ADVISOR_EVENTS, ADVISOR_EVENT_BY_ID, advisorKey, advisorKeys, advisorText, placeholders } from '../src';

describe('Berater-Zeilen als Daten', () => {
  it('Ereignis-IDs sind eindeutig, jede Variante hat deutschen Text', () => {
    expect(new Set(ADVISOR_EVENTS.map((e) => e.id)).size).toBe(ADVISOR_EVENTS.length);
    for (const e of ADVISOR_EVENTS) {
      expect(e.variants).toBeGreaterThan(0);
      for (const k of advisorKeys(e)) {
        expect(ADVISOR_DE[k], k).toBeTruthy();
        expect(ADVISOR_DE[k].length).toBeGreaterThan(8);
      }
    }
  });

  it('keine verwaisten Texte: jeder Schlüssel gehört zu einem Ereignis', () => {
    const all = new Set(ADVISOR_EVENTS.flatMap((e) => advisorKeys(e)));
    for (const k of Object.keys(ADVISOR_DE)) expect(all.has(k), `verwaist: ${k}`).toBe(true);
  });

  it('Englisch ist eine Teilmenge des Deutschen und nutzt dieselben Platzhalter', () => {
    for (const k of Object.keys(ADVISOR_EN)) {
      expect(ADVISOR_DE[k], `en ohne de: ${k}`).toBeDefined();
      expect(placeholders(ADVISOR_EN[k]).sort(), k).toEqual(placeholders(ADVISOR_DE[k]).sort());
    }
  });

  it('Platzhalter sind genau die vom Ereignis gelieferten Parameter (keine Zahlen im Text)', () => {
    for (const e of ADVISOR_EVENTS) {
      for (const k of advisorKeys(e)) {
        for (const ph of placeholders(ADVISOR_DE[k])) expect(e.params, `${k}: {${ph}}`).toContain(ph);
        expect(ADVISOR_DE[k], k).not.toMatch(/\d/);
      }
    }
  });

  it('Priorität, Thema und Art sind gesetzt; kritisch heißt alarmierend', () => {
    for (const e of ADVISOR_EVENTS) {
      expect([0, 1, 2]).toContain(e.prio);
      expect(['economy', 'food', 'popularity', 'military', 'development']).toContain(e.topic);
      if (e.prio === 2) expect(e.kind).toBe('alert');
    }
    expect(ADVISOR_EVENT_BY_ID['food.empty'].prio).toBe(2);
    expect(ADVISOR_EVENT_BY_ID['dev.grow'].prio).toBe(0);
  });

  it('Texte lassen sich ohne offene Platzhalter erzeugen', () => {
    const p = { res: 'Holz', n: 5, list: 'Holz und Stein', store: 'Das Lager', jobs: 9, peasants: 4, housing: 8, building: 'Bäckerei', months: 1.2, pop: 44, time: '1 min', threshold: 50, seconds: 4, name: 'Feind', dist: 40, what: 'Katapult', pct: 60, limit: 100 };
    for (const lang of ['de', 'en'] as const) {
      for (const e of ADVISOR_EVENTS) {
        for (let v = 1; v <= e.variants; v++) expect(advisorText(advisorKey(e.id, v), p, lang), `${e.id}.${v}`).not.toMatch(/\{/);
      }
    }
  });

  it('Sätze sind kurz und gut sprechbar', () => {
    for (const k of Object.keys(ADVISOR_DE)) {
      expect(ADVISOR_DE[k].length, k).toBeLessThan(170);
    }
  });
});
