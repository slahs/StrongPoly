import { describe, expect, it } from 'vitest';
import { BT, ClientWorld, PlayerView, U, UNITS } from '@strongpoly/shared';
import { AdvisorLogic } from '../src/ui/advisor';
import { rankTeams } from '../src/ui/endscreen';
import { recruitMissing } from '../src/ui/hud_context';
import { DEFAULT_HOTKEYS, comboOf, hotkeyConflicts, keyLabel } from '../src/game/hotkeys';

function mkView(over: Partial<PlayerView> = {}): PlayerView {
  return {
    gold: 100, stock: Array.from({ length: 21 }, (_, i) => (i === 9 ? 200 : 0)), cap: [150, 150, 60], used: [10, 10, 0], tax: 0, ration: 2, popularity: 60, popDelta: 0, factors: [], peasants: 20, housing: 24, troops: 0, troopLimit: 100,
    fear: 0, horses: 0, foodTypes: 1, foodShort: false, power: 0, powerMax: 100, abilityCd: [], banners: 0, priceMul: new Array(21).fill(1), alive: true, aid: [], aleCover: 0, relCover: 0, undoLeft: 0, ...over,
  };
}

function mkWorld(): ClientWorld {
  const w = new ClientWorld();
  w.players = [
    { id: 0, name: 'Du', team: 0, color: 0, kind: 'human', alive: true, keepX: 50, keepY: 50 },
    { id: 1, name: 'Feind', team: 1, color: 1, kind: 'ai', alive: true, keepX: 120, keepY: 120 },
  ];
  return w;
}
function addUnit(w: ClientWorld, owner: number, type: number, x: number, y: number, hp = 255): void {
  const s = w.top++;
  w.ids[s] = s + 1;
  w.type[s] = type;
  w.owner[s] = owner;
  w.curX[s] = x;
  w.curY[s] = y;
  w.hp[s] = hp;
}

describe('Berater', () => {
  it('meldet Hunger genau einmal, nicht alle paar Sekunden; erneut erst nach Entwarnung und Abklingzeit', () => {
    const w = mkWorld();
    const a = new AdvisorLogic(w, () => 0, () => [0, 1]);
    const got: string[] = [];
    a.onMessage = (m) => got.push(m.text);
    a.update(mkView({ foodShort: true }), 100);
    for (let t = 110; t <= 900; t += 10) a.update(mkView({ foodShort: true }), t);
    expect(got.length).toBe(1);
    expect(got[0]).toMatch(/Hunger|Kornspeicher/);
    // Entwarnung (Vorrat da), danach wieder Hunger: innerhalb der Abklingzeit still, danach eine neue Meldung
    a.update(mkView({ foodShort: false }), 1000);
    a.update(mkView({ foodShort: true }), 1100);
    expect(got.length).toBe(1);
    a.update(mkView({ foodShort: true }), 1500);
    expect(got.length).toBe(2);
  });

  it('erkennt Angriff nur mit feindlichen Soldaten (nicht mit Bauern) und nennt den Angreifer samt Ort', () => {
    const w = mkWorld();
    const a = new AdvisorLogic(w, () => 0, () => [0, 1]);
    const got: { text: string; x?: number }[] = [];
    a.onMessage = (m) => got.push(m);
    addUnit(w, 1, U.Peasant, 52, 52);
    addUnit(w, 1, U.Peasant, 53, 52);
    a.update(mkView(), 100);
    expect(got.length).toBe(0);
    addUnit(w, 1, U.Spearman, 55, 52);
    addUnit(w, 1, U.Spearman, 56, 53);
    a.update(mkView(), 200);
    expect(got.length).toBe(1);
    expect(got[0].text).toMatch(/Angriff von Feind/);
    expect(got[0].x).toBeGreaterThan(50);
  });

  it('warnt, wenn der Lord in Gefahr oder verwundet ist', () => {
    const w = mkWorld();
    const a = new AdvisorLogic(w, () => 0, () => [0, 1]);
    const got: string[] = [];
    a.onMessage = (m) => got.push(m.text);
    addUnit(w, 0, U.Lord, 50, 50, 90);
    a.update(mkView(), 100);
    expect(got.some((t) => /Lord/.test(t))).toBe(true);
  });

  it('meldet durchbrochene Mauern, aber nicht beim Abreißen ohne Feinde', () => {
    const w = mkWorld();
    const a = new AdvisorLogic(w, () => 0, () => [0, 1]);
    const got: string[] = [];
    a.onMessage = (m) => got.push(m.text);
    const rec = { i: 7, t: BT.WallLow, o: 0, x: 60, y: 60, r: 0, hp: 0, f: 0, u: 0, q: 0, s: 0, c: 0, b: 0, p: 0, n: 0, w: 1, h: 1 };
    w.removedBuildings.push(rec);
    a.checkRemoved(100);
    expect(got.length).toBe(0);
    addUnit(w, 1, U.Spearman, 61, 60);
    w.removedBuildings.push({ ...rec, i: 8 });
    a.checkRemoved(200);
    expect(got[0]).toMatch(/Mauer/);
  });
});

describe('Rekrutierung und Endwertung', () => {
  it('nennt fehlende Waffe, Pferd und Gold', () => {
    const miss = recruitMissing(UNITS[U.Knight], mkView({ gold: 10 }));
    expect(miss.join(',')).toMatch(/Gold/);
    expect(miss.join(',')).toMatch(/Pferd/);
    expect(miss.join(',')).toMatch(/Schwert/);
    expect(recruitMissing(UNITS[U.Peasant], mkView({ gold: 0 }))).toEqual([]);
  });

  it('Rangfolge: Sieger zuerst, danach wer länger durchhielt', () => {
    const players = [{ id: 0, team: 0 }, { id: 1, team: 1 }, { id: 2, team: 2 }];
    const stats = [
      { id: 0, kills: 0, losses: 0, built: 0, goldEarned: 0, recruited: 0, buildings: 0, peasants: 0, alive: true, defeatedTick: -1 },
      { id: 1, kills: 0, losses: 0, built: 0, goldEarned: 0, recruited: 0, buildings: 0, peasants: 0, alive: false, defeatedTick: 5000 },
      { id: 2, kills: 0, losses: 0, built: 0, goldEarned: 0, recruited: 0, buildings: 0, peasants: 0, alive: false, defeatedTick: 9000 },
    ];
    const r = rankTeams(players, stats, 0);
    expect(r.map((x) => x.team)).toEqual([0, 2, 1]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
});

describe('Hotkeys', () => {
  it('Standardbelegung ist doppelfrei und vollständig', () => {
    expect([...hotkeyConflicts(DEFAULT_HOTKEYS)]).toEqual([]);
    for (const v of Object.values(DEFAULT_HOTKEYS)) expect(v.length).toBeGreaterThan(0);
  });
  it('Kombinationen und Anzeige', () => {
    expect(comboOf({ code: 'KeyZ', ctrlKey: true, metaKey: false, altKey: false })).toBe('Ctrl+KeyZ');
    expect(comboOf({ code: 'KeyK', ctrlKey: false, metaKey: false, altKey: true })).toBe('Alt+KeyK');
    expect(keyLabel('Ctrl+KeyZ')).toBe('Strg+Z');
    expect(keyLabel('Space')).toBe('Leertaste');
    expect(DEFAULT_HOTKEYS.toggleMute).toBe('KeyM');
    expect(DEFAULT_HOTKEYS.jumpAlert).toBe('Space');
    expect(DEFAULT_HOTKEYS.help).toBe('F1');
    expect(DEFAULT_HOTKEYS.encyclopedia).toBe('F2');
    expect(DEFAULT_HOTKEYS.advisorReplay).toBe('Alt+KeyH');
    expect(keyLabel(DEFAULT_HOTKEYS.advisorReplay)).toBe('Alt+H');
  });
});
