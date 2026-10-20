import { describe, expect, it } from 'vitest';
import { U, UNITS, UNIT_TYPES } from '@strongpoly/shared';
import { buildUnitModel } from '../src/render/models_units';

/**
 * 4H-Befund (Wiedererkennbarkeit der Spielerfarben): Bogenschützen trugen die Teamfarbe nur am Köcher auf dem Rücken; in der
 * RTS-Ansicht (Kamera schaut auf Brust und Kopf) sind die Archer-Massen beider Seiten deshalb nicht zu unterscheiden
 * (Browseraufnahme `docs/phase4/qa/s16_teamcolors`). Regel: jedes Fußvolk (außer Bauern) hat Teamfarbe auch auf der Vorderseite
 * (Flächenanteil der vorderen Hälfte, z > 0) oberhalb der Hüfte.
 */
const FRONT_TEAM_MIN = 0.008;

function frontTeamShare(type: number): number {
  const g = buildUnitModel(type, 2).merged;
  const pos = g.getAttribute('position');
  const meta = g.getAttribute('aMeta');
  const idx = g.index;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const at = (k: number): number => (idx ? idx.getX(k) : k);
  let total = 0;
  let front = 0;
  for (let t = 0; t < tri; t++) {
    const a = at(t * 3);
    const b = at(t * 3 + 1);
    const c = at(t * 3 + 2);
    const ux = pos.getX(b) - pos.getX(a);
    const uy = pos.getY(b) - pos.getY(a);
    const uz = pos.getZ(b) - pos.getZ(a);
    const vx = pos.getX(c) - pos.getX(a);
    const vy = pos.getY(c) - pos.getY(a);
    const vz = pos.getZ(c) - pos.getZ(a);
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    total += area;
    const isTeam = meta.getX(a) > 0.5;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    if (isTeam && cz > 0 && cy > 0.35) front += area;
  }
  return front / (total || 1);
}

describe('Spielerfarbe auf der Vorderseite des Fußvolks', () => {
  const foot = Array.from({ length: UNIT_TYPES }, (_, i) => i).filter((t) => UNITS[t].side !== 'siege' && t !== U.Ox && t !== U.Peasant && !UNITS[t].mounted);
  it('jeder Fußsoldat zeigt Teamfarbe vorne oberhalb der Hüfte (Flächenanteil ≥ 0,8 %)', () => {
    const rows = foot.map((t) => `${UNITS[t].key}: ${(frontTeamShare(t) * 100).toFixed(2)} %`);
    for (const t of foot) expect(frontTeamShare(t), rows.join(', ')).toBeGreaterThanOrEqual(FRONT_TEAM_MIN);
  });
});
