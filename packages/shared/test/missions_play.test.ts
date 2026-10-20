import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src';
import { playMission, POLICIES } from '../bench/missions';

/** Jede Tutorial-Mission wird per Skript (nur Spielbefehle, echte Kosten) bis zum Missionssieg gespielt */
describe('Tutorial-Missionen sind gewinnbar', () => {
  MISSIONS.forEach((m, i) => {
    it(`Mission ${i + 1} (${m.name})`, () => {
      const r = playMission(i, POLICIES[i], 40);
      expect(r.open, r.log.slice(-6).join('\n')).toEqual([]);
      expect(r.won).toBe(true);
    }, 240000);
  });
});
