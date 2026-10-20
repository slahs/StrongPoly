import { describe, expect, it } from 'vitest';
import { BT, BUILDINGS, R, UNDO_WINDOW_TICKS } from '../src';
import { applyCommand } from '../src/sim/commands';
import { autoPlace, mkSim, run } from './helpers';

describe('Rückgängig und Arbeiter an/aus', () => {
  it('Strg+Z nimmt die zuletzt gesetzte Baute voll erstattet zurück', () => {
    const sim = mkSim(5, 2, 128);
    const gold0 = sim.players[0].gold;
    const wood0 = sim.players[0].stock[R.Wood];
    const st = sim.map.starts[0];
    let placed = null as ReturnType<typeof sim.place>;
    for (let r = 4; r < 20 && !placed; r++) for (let dy = -r; dy <= r && !placed; dy++) for (let dx = -r; dx <= r && !placed; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) placed = sim.place(0, BT.Hovel, st.x + dx, st.y + dy);
    expect(placed).not.toBeNull();
    expect(sim.players[0].stock[R.Wood]).toBe(wood0 - (BUILDINGS[BT.Hovel].cost.wood ?? 0));
    applyCommand(sim, 0, { c: 'undo' });
    expect(sim.buildings.has(placed!.id)).toBe(false);
    expect(sim.players[0].stock[R.Wood]).toBe(wood0);
    expect(Math.round(sim.players[0].gold)).toBe(Math.round(gold0));
  });

  it('nach Ablauf des Fensters oder bei Schaden wird nichts zurückgenommen', () => {
    const sim = mkSim(5, 2, 128);
    const b = autoPlace(sim, 0, BT.Hovel)!;
    run(sim, UNDO_WINDOW_TICKS + 5);
    applyCommand(sim, 0, { c: 'undo' });
    expect(sim.buildings.has(b.id)).toBe(true);
    const c = autoPlace(sim, 0, BT.Hovel)!;
    c.hp -= 10;
    applyCommand(sim, 0, { c: 'undo' });
    expect(sim.buildings.has(c.id)).toBe(true);
  });

  it('Undo ist nur für den Besitzer und wirkt auf mehrere Schritte nacheinander', () => {
    const sim = mkSim(5, 2, 128);
    const a = autoPlace(sim, 0, BT.Hovel)!;
    const c = autoPlace(sim, 0, BT.Hovel)!;
    applyCommand(sim, 1, { c: 'undo' });
    expect(sim.buildings.has(c.id)).toBe(true);
    applyCommand(sim, 0, { c: 'undo' });
    applyCommand(sim, 0, { c: 'undo' });
    expect(sim.buildings.has(c.id)).toBe(false);
    expect(sim.buildings.has(a.id)).toBe(false);
  });

  it('Arbeiter aus: Werkstatt gibt Arbeiter frei und produziert nicht; an: es läuft wieder', () => {
    const sim = mkSim(5, 2, 128);
    const w = autoPlace(sim, 0, BT.Woodcutter, undefined, 40)!;
    sim.players[0].stock[R.Wood] = 0;
    run(sim, 3000);
    expect(w.workers.length).toBe(1);
    applyCommand(sim, 0, { c: 'setWork', building: w.id, on: false });
    expect(w.off).toBe(true);
    expect(w.workers.length).toBe(0);
    const made = sim.players[0].produced[R.Wood];
    run(sim, 2000);
    expect(sim.players[0].produced[R.Wood]).toBe(made);
    expect(w.workers.length).toBe(0);
    applyCommand(sim, 0, { c: 'setWork', building: w.id, on: true });
    run(sim, 3000);
    expect(w.workers.length).toBe(1);
    expect(sim.players[0].produced[R.Wood]).toBeGreaterThan(made);
  });
});
