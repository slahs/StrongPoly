import { describe, expect, it } from 'vitest';
import { BT, BUILDINGS, ClientBuilding, ClientWorld, PlayerView, R, U, setLang } from '@strongpoly/shared';
import { AdvisorLogic, AdvisorMsg, QUIET_IMPORTANT, QUIET_NORMAL, RES_LIMITS } from '../src/ui/advisor';
import { AdvisorCandidate, AdvisorQueue, COOLDOWN, CRITICAL_GAP, TTL, WINDOW, joinList } from '../src/ui/advisor_queue';

const stock = (o: Record<number, number> = {}): number[] => {
  const s = new Array(21).fill(0);
  s[R.Wood] = 200;
  s[R.Stone] = 200;
  s[R.Iron] = 50;
  s[R.Apple] = 200;
  for (const [k, v] of Object.entries(o)) s[Number(k)] = v;
  return s;
};

function mkView(over: Partial<PlayerView> = {}): PlayerView {
  return {
    gold: 100, stock: stock(), cap: [150, 150, 60], used: [10, 10, 0], tax: 0, ration: 2, popularity: 60, popDelta: 0, factors: [], peasants: 20, housing: 24, troops: 0, troopLimit: 100,
    fear: 0, horses: 0, foodTypes: 1, foodShort: false, power: 0, powerMax: 100, abilityCd: [], banners: 0, priceMul: new Array(21).fill(1), alive: true, aid: [], aleCover: 0, relCover: 0, undoLeft: 0, ...over,
  };
}

function mkWorld(): ClientWorld {
  const w = new ClientWorld();
  w.players = [
    { id: 0, name: 'Du', team: 0, color: 0, kind: 'human', alive: true, keepX: 50, keepY: 50 },
    { id: 1, name: 'Feind', team: 1, color: 1, kind: 'ai', alive: true, keepX: 150, keepY: 150 },
  ];
  return w;
}

let uid = 1;
function addUnit(w: ClientWorld, owner: number, type: number, x: number, y: number, hp = 255): number {
  const s = w.top++;
  w.ids[s] = s + 1;
  w.type[s] = type;
  w.owner[s] = owner;
  w.curX[s] = x;
  w.curY[s] = y;
  w.hp[s] = hp;
  return s;
}
function addBuilding(w: ClientWorld, type: number, x: number, y: number, over: Partial<ClientBuilding> = {}): ClientBuilding {
  const d = BUILDINGS[type];
  const b: ClientBuilding = { i: uid++, t: type, o: 0, x, y, r: 0, hp: d.hp, f: 0, u: 0, q: 0, s: 0, c: 0, b: 0, p: 0, n: 0, w: d.w, h: d.h, ...over };
  w.buildings.set(b.i, b);
  return b;
}

function mkLogic(opts = {}): { a: AdvisorLogic; w: ClientWorld; got: AdvisorMsg[] } {
  setLang('de');
  const w = mkWorld();
  const a = new AdvisorLogic(w, () => 0, () => [0, 1], opts);
  const got: AdvisorMsg[] = [];
  a.onMessage = (m) => got.push(m);
  return { a, w, got };
}

/** Spielt Sekunde für Sekunde (10 Ticks) mit gegebener Ansicht */
function play(a: AdvisorLogic, view: PlayerView, from: number, to: number): void {
  for (let t = from; t <= to; t += 10) a.update(view, t);
}

const T0 = 2000; // nach der Ruhephase

describe('Berater: Wirtschaft', () => {
  it('meldet knappes Holz genau einmal, bei Leerstand einmal verschärft, danach Entwarnung (Hysterese)', () => {
    const { a, got } = mkLogic();
    play(a, mkView(), T0, T0 + 50); // Vorrat da: scharf
    const low = mkView({ stock: stock({ [R.Wood]: 12 }) });
    play(a, low, T0 + 60, T0 + 600);
    expect(got.length).toBe(1);
    expect(got[0].text).toMatch(/Holz/);
    expect(got[0].text).toMatch(/12/);
    expect(got[0].event).toBe('res.low.noprod'); // kein Holzfäller gebaut
    // pendelt zwischen den Schwellen: keine Wiederholung
    play(a, mkView({ stock: stock({ [R.Wood]: 30 }) }), T0 + 610, T0 + 700);
    play(a, mkView({ stock: stock({ [R.Wood]: 10 }) }), T0 + 710, T0 + 800);
    expect(got.length).toBe(1);
    // leer: wesentliche Verschlimmerung, eine weitere Meldung
    play(a, mkView({ stock: stock({ [R.Wood]: 0 }) }), T0 + 810, T0 + 1500);
    expect(got.length).toBe(2);
    expect(got[1].event).toBe('res.empty');
    expect(got[1].text).toMatch(/Holz/);
    // wieder reichlich: Entwarnung genau einmal
    play(a, mkView({ stock: stock({ [R.Wood]: 120 }) }), T0 + 1510, T0 + 2400);
    expect(got.length).toBe(3);
    expect(got[2].event).toBe('res.recovered');
    expect(got[2].kind).toBe('info');
  });

  it('Mit Holzfäller heißt es „knapp“, ohne Holzfäller fehlt die Produktion; Ort ist der Holzfäller', () => {
    const { a, w, got } = mkLogic();
    const wc = addBuilding(w, BT.Woodcutter, 60, 60);
    play(a, mkView(), T0, T0 + 50);
    play(a, mkView({ stock: stock({ [R.Wood]: 5 }) }), T0 + 60, T0 + 200);
    expect(got[0].event).toBe('res.low.plain');
    expect(got[0].building).toBe(wc.i);
    expect(got[0].x).toBeCloseTo(60 + BUILDINGS[BT.Woodcutter].w / 2);
  });

  it('meldet nichts für Waren, die nie vorhanden waren', () => {
    const { a, got } = mkLogic();
    play(a, mkView({ stock: stock({ [R.Pitch]: 0, [R.Iron]: 3 }) }), T0, T0 + 600);
    expect(got.length).toBe(0);
  });

  it('in der Ruhephase nach Spielbeginn schweigt der Berater (außer bei Kritischem) und holt Mangel nachher nach', () => {
    const { a, got } = mkLogic();
    play(a, mkView(), 0, 40);
    const low = mkView({ stock: stock({ [R.Wood]: 5 }) });
    play(a, low, 50, QUIET_IMPORTANT - 10);
    expect(got.length).toBe(0);
    play(a, low, QUIET_IMPORTANT, QUIET_IMPORTANT + 100);
    expect(got.length).toBe(1);
    // Kritisches kommt sofort
    const c = mkLogic();
    c.a.update(mkView({ foodShort: true }), 50);
    expect(c.got.length).toBe(1);
    expect(c.got[0].prio).toBe(2);
    void QUIET_NORMAL;
  });

  it('bündelt mehrere gleichzeitige Engpässe zu einer Sammelmeldung', () => {
    const { a, got } = mkLogic();
    play(a, mkView(), T0, T0 + 50);
    play(a, mkView({ stock: stock({ [R.Wood]: 10, [R.Stone]: 10, [R.Iron]: 3 }) }), T0 + 60, T0 + 400);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('res.low.multi');
    expect(got[0].text).toMatch(/Holz, Stein und Eisen/);
  });

  it('Tutorial-Mission: Normales schweigt, Wichtiges kommt erst später', () => {
    const { a, got } = mkLogic({ mission: true });
    a.update(mkView({ troops: 0 }), T0 - 10);
    play(a, mkView({ troops: 12 }), T0, T0 + 300);
    expect(got.length).toBe(0); // army.ready ist normal
    play(a, mkView(), T0 + 310, T0 + 320);
    play(a, mkView({ stock: stock({ [R.Wood]: 5 }) }), T0 + 330, T0 + 400);
    expect(got.length).toBe(1);
  });

  it('Lager voll: eine Meldung, erst nach dem Leeren wieder möglich', () => {
    const { a, w, got } = mkLogic();
    addBuilding(w, BT.Stockpile, 55, 55);
    const full = mkView({ used: [150, 10, 0] });
    play(a, full, T0, T0 + 400);
    expect(got.length).toBe(1);
    expect(got[0].text).toMatch(/Lager/);
    play(a, mkView({ used: [100, 10, 0] }), T0 + 410, T0 + 500);
    play(a, full, T0 + 510, T0 + 3000);
    expect(got.length).toBe(1); // Abklingzeit
    play(a, full, T0 + 3700, T0 + 3800);
    expect(got.length).toBe(2);
  });

  it('zu wenig Arbeitskräfte: erst wenn der Mangel anhält, mit Wohnraum-Hinweis', () => {
    const { a, w, got } = mkLogic();
    for (let i = 0; i < 8; i++) addBuilding(w, BT.Woodcutter, 60 + i * 3, 60); // 8 Stellen
    const v = mkView({ peasants: 3, housing: 3 });
    play(a, v, T0, T0 + 300);
    expect(got.length).toBe(0);
    play(a, v, T0 + 310, T0 + 900);
    const m = got.find((x) => x.event?.startsWith('workers.short'));
    expect(m).toBeDefined();
    expect(m!.event).toBe('workers.short.housing');
    expect(m!.text).toMatch(/8 Stellen/);
  });
});

describe('Berater: Produktionsketten', () => {
  it('Bäckerei ohne Mehl steht still: Meldung nach Dauer, mit Ort, einmal; Entwarnung wenn es läuft', () => {
    const { a, w, got } = mkLogic();
    const bak = addBuilding(w, BT.Bakery, 70, 70);
    const noFlour = mkView();
    play(a, noFlour, T0, T0 + 300);
    expect(got.length).toBe(0); // noch nicht lange genug
    play(a, noFlour, T0 + 310, T0 + 700);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('chain.noinput');
    expect(got[0].text).toMatch(/Bäckerei/);
    expect(got[0].text).toMatch(/Mehl/);
    expect(got[0].building).toBe(bak.i);
    play(a, noFlour, T0 + 710, T0 + 1500);
    expect(got.length).toBe(1);
    bak.s = 1; // arbeitet wieder
    play(a, mkView({ stock: stock({ [R.Flour]: 40 }) }), T0 + 1510, T0 + 1700);
    expect(got.length).toBe(2);
    expect(got[1].event).toBe('chain.recovered');
  });

  it('abgerissenes Gebäude löst keine falsche Entwarnung aus', () => {
    const { a, w, got } = mkLogic();
    const bak = addBuilding(w, BT.Bakery, 70, 70);
    play(a, mkView(), T0, T0 + 700);
    expect(got.length).toBe(1);
    w.buildings.delete(bak.i);
    play(a, mkView(), T0 + 710, T0 + 1500);
    expect(got.length).toBe(1);
  });

  it('abgeschaltete und frisch gebaute Gebäude melden nichts', () => {
    const { a, w, got } = mkLogic();
    addBuilding(w, BT.Bakery, 70, 70, { f: 8 });
    addBuilding(w, BT.Mill, 80, 70, { n: T0 + 10 });
    play(a, mkView(), T0, T0 + 500);
    expect(got.length).toBe(0);
  });

  it('mehrere stehende Betriebe werden gebündelt', () => {
    const { a, w, got } = mkLogic();
    addBuilding(w, BT.Bakery, 70, 70);
    addBuilding(w, BT.Mill, 80, 70);
    play(a, mkView(), T0, T0 + 900);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('chain.noinput.multi');
    expect(got[0].text).toMatch(/Bäckerei/);
    expect(got[0].text).toMatch(/Mühle/);
  });
});

describe('Berater: Nahrung', () => {
  it('Kornspeicher fast leer: Vorwarnung mit Monaten, dann Hunger kritisch, dann Entwarnung', () => {
    const { a, w, got } = mkLogic();
    const g = addBuilding(w, BT.Granary, 40, 40);
    // 20 Bauern, Normalration: Bedarf 10 pro Monat; 12 Vorrat = 1,2 Monate
    const lowFood = mkView({ stock: stock({ [R.Apple]: 12 }) });
    play(a, lowFood, T0, T0 + 600);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('food.low.noprod');
    expect(got[0].text).toMatch(/1,2 Monate/);
    expect(got[0].building).toBe(g.i);
    play(a, mkView({ stock: stock({ [R.Apple]: 0 }), foodShort: true }), T0 + 610, T0 + 700);
    expect(got.length).toBe(2);
    expect(got[1].prio).toBe(2);
    expect(got[1].text).toMatch(/Hunger|hungert/);
    play(a, mkView({ stock: stock({ [R.Apple]: 300 }) }), T0 + 710, T0 + 1200);
    expect(got[got.length - 1].event).toBe('food.recovered');
  });
});

describe('Berater: Beliebtheit', () => {
  const tax = (v: number) => ({ key: 'tax', label: 'Steuern', value: v });
  const ration = (v: number) => ({ key: 'ration', label: 'Rationen', value: v });
  const view = (pop: number, factors: { key: string; label: string; value: number }[], over: Partial<PlayerView> = {}): PlayerView => mkView({ popularity: pop, factors, popDelta: factors.reduce((s, f) => s + f.value, 0), tax: 4, ...over });

  it('sinkende Beliebtheit: Hauptursache Steuern wird genannt, einmal, mit Zeit bis zur Schwelle', () => {
    const { a, got } = mkLogic();
    const v = view(60, [ration(0), tax(-8)]);
    play(a, v, T0, T0 + 900);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('pop.falling.tax');
    expect(got[0].text).toMatch(/Steuern/);
    expect(got[0].text).toMatch(/unter 50/);
  });

  it('Hauptursache Rationen und Überfüllung wählen den passenden Text', () => {
    const r = mkLogic();
    play(r.a, view(60, [ration(-4), tax(0)], { tax: 0, ration: 1 }), T0, T0 + 300);
    expect(r.got[0].event).toBe('pop.falling.ration');
    const c = mkLogic();
    play(c.a, view(60, [ration(0), { key: 'crowd', label: 'Überfüllung', value: -4 }], { tax: 0 }), T0, T0 + 300);
    expect(c.got[0].event).toBe('pop.falling.crowd');
  });

  it('keine Warnung bei harmlosem Rückgang (Schwelle fern) oder steigender Beliebtheit', () => {
    const a1 = mkLogic();
    play(a1.a, view(95, [tax(-2)], { tax: 1 }), T0, T0 + 600);
    expect(a1.got.length).toBe(0);
    const a2 = mkLogic();
    play(a2.a, view(60, [ration(4), tax(-2)], { tax: 1 }), T0, T0 + 600);
    expect(a2.got.length).toBe(0);
  });

  it('unter 50: Abwanderung kritisch genau einmal; Erholung wird gemeldet', () => {
    const { a, got } = mkLogic();
    play(a, view(48, [ration(0), tax(-8)]), T0, T0 + 900);
    expect(got.length).toBe(1);
    expect(got[0].prio).toBe(2);
    expect(got[0].event).toBe('pop.leaving.tax');
    expect(got[0].text).toMatch(/Bauern verlassen/);
    // Lage verbessert sich, Beliebtheit steigt über die Schwelle
    play(a, view(58, [ration(4), tax(0)], { tax: 0 }), T0 + 910, T0 + 1400);
    expect(got[got.length - 1].event).toBe('pop.recovered');
    expect(got.length).toBe(2);
  });

  it('erste Sekunden ohne Auswertung der Sim: keine erfundene Meldung', () => {
    const { a, got } = mkLogic();
    play(a, mkView({ popularity: 40, popDelta: 60, factors: [] }), T0, T0 + 300);
    expect(got.length).toBe(0);
  });
});

describe('Berater: Militär', () => {
  it('anrückende Feinde: einmal mit Anzahl und Entfernung, nicht für Gegner nahe ihrer eigenen Burg', () => {
    const { a, w, got } = mkLogic();
    for (let i = 0; i < 5; i++) addUnit(w, 1, U.Spearman, 95 + i, 50); // ca. 45 Felder entfernt
    play(a, mkView(), T0, T0 + 500);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('enemy.approach');
    expect(got[0].text).toMatch(/5 Soldaten/);
    expect(got[0].text).toMatch(/45/);
    expect(got[0].prio).toBe(1);
    expect(got[0].x).toBeGreaterThan(90);
    const h = mkLogic();
    for (let i = 0; i < 5; i++) addUnit(h.w, 1, U.Spearman, 140 + i, 150);
    play(h.a, mkView(), T0, T0 + 500);
    expect(h.got.length).toBe(0);
  });

  it('Angriff vor der Burg ist kritisch, kommt einmal und meldet Verstärkung erst bei deutlichem Zuwachs', () => {
    const { a, w, got } = mkLogic();
    for (let i = 0; i < 3; i++) addUnit(w, 1, U.Spearman, 60 + i, 52);
    play(a, mkView(), T0, T0 + 600);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('enemy.attack');
    expect(got[0].prio).toBe(2);
    expect(got[0].text).toMatch(/Feind/);
    expect(got[0].text).toMatch(/3/);
    for (let i = 0; i < 12; i++) addUnit(w, 1, U.Spearman, 62 + (i % 4), 54 + ((i / 4) | 0));
    play(a, mkView(), T0 + 610, T0 + 1500);
    expect(got.length).toBe(2);
    expect(got[1].event).toBe('enemy.attack.grow');
  });

  it('Angriff verdrängt einen wartenden normalen Hinweis (Priorität)', () => {
    const { a, w, got } = mkLogic();
    play(a, mkView({ troops: 0 }), T0, T0 + 10);
    // normaler Hinweis und gleich danach ein Angriff im selben Takt
    for (let i = 0; i < 3; i++) addUnit(w, 1, U.Spearman, 60 + i, 52);
    a.update(mkView({ troops: 12 }), T0 + 20);
    expect(got[0].event).toBe('enemy.attack');
    expect(got.length).toBe(1);
    // der normale Hinweis wartet und kommt nach dem Zeitfenster
    play(a, mkView({ troops: 12 }), T0 + 30, T0 + 400);
    expect(got.map((m) => m.event)).toEqual(['enemy.attack', 'army.ready']);
  });

  it('Belagerungsgerät wird beim Auftauchen gemeldet, mit Namen', () => {
    const { a, w, got } = mkLogic();
    addUnit(w, 1, U.Catapult, 110, 60);
    play(a, mkView(), T0, T0 + 400);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('siege.sighted');
    expect(got[0].text).toMatch(/Katapult/);
    expect(got[0].prio).toBe(2);
  });

  it('Tor, Mauer und Turm: nur wenn Feinde in der Nähe sind', () => {
    const { a, w, got } = mkLogic();
    const mk = (t: number, x: number) => ({ i: uid++, t, o: 0, x, y: 60, r: 0, hp: 0, f: 0, u: 0, q: 0, s: 0, c: 0, b: 0, p: 0, n: 0, w: 1, h: 1 });
    w.removedBuildings.push(mk(BT.GateStone, 60));
    a.checkRemoved(T0);
    expect(got.length).toBe(0); // vom Spieler abgerissen
    addUnit(w, 1, U.Spearman, 62, 60);
    w.removedBuildings.push(mk(BT.GateStone, 61));
    a.checkRemoved(T0 + 10);
    expect(got[0].text).toMatch(/Tor ist gefallen/);
    w.removedBuildings.push(mk(BT.TowerGuard, 63));
    a.checkRemoved(T0 + 100);
    expect(got[1].text).toMatch(/Wehrturm ist gefallen/);
  });

  it('Bergfried unter Beschuss: einmal je Stufe', () => {
    const { a, w, got } = mkLogic();
    const k = addBuilding(w, BT.Keep, 48, 48);
    addUnit(w, 1, U.Spearman, 56, 50);
    addUnit(w, 1, U.Spearman, 57, 50);
    play(a, mkView(), T0, T0 + 50);
    k.hp = Math.round(BUILDINGS[BT.Keep].hp * 0.7);
    play(a, mkView(), T0 + 60, T0 + 120);
    expect(got.some((m) => m.event === 'keep.hurt' && /70 Prozent/.test(m.text))).toBe(true);
    const n = got.filter((m) => m.event === 'keep.hurt').length;
    play(a, mkView(), T0 + 130, T0 + 400);
    expect(got.filter((m) => m.event === 'keep.hurt').length).toBe(n);
  });

  it('Heer bereit: je Marke einmal; Truppenlimit', () => {
    const { a, got } = mkLogic();
    a.update(mkView({ troops: 0 }), T0 - 10);
    play(a, mkView({ troops: 10 }), T0, T0 + 400);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('army.ready');
    expect(got[0].text).toMatch(/10 Mann/);
    play(a, mkView({ troops: 14 }), T0 + 410, T0 + 800);
    expect(got.length).toBe(1);
    play(a, mkView({ troops: 25 }), T0 + 810, T0 + 1300);
    expect(got.length).toBe(2);
    play(a, mkView({ troops: 100, troopLimit: 100 }), T0 + 1310, T0 + 2600);
    expect(got.some((m) => m.event === 'army.limit')).toBe(true);
  });
});

describe('Berater: Entwicklung', () => {
  it('Wachstum: Bevölkerungsmarken einmalig, nicht bei niedriger Beliebtheit', () => {
    const { a, got } = mkLogic();
    a.update(mkView({ peasants: 5 }), T0 - 10);
    play(a, mkView({ peasants: 10 }), T0, T0 + 400);
    expect(got.length).toBe(1);
    expect(got[0].event).toBe('dev.grow');
    expect(got[0].text).toMatch(/10/);
    play(a, mkView({ peasants: 12 }), T0 + 410, T0 + 900);
    expect(got.length).toBe(1);
  });
});

describe('Berater: Zeilen, Schlüssel und Variation', () => {
  it('jede Meldung trägt Zeilenschlüssel, Priorität und Thema; Varianten wechseln', () => {
    const { a, got } = mkLogic();
    a.update(mkView({ troops: 0 }), T0 - 10);
    play(a, mkView({ troops: 10 }), T0, T0 + 400);
    play(a, mkView({ troops: 25 }), T0 + 410, T0 + 900);
    expect(got[0].key).toMatch(/^advisor\.army\.ready\.\d$/);
    expect(got[1].key).toMatch(/^advisor\.army\.ready\.\d$/);
    expect(got[0].key).not.toBe(got[1].key);
    expect(got[0].topic).toBe('military');
    expect(a.lastSpoken()?.key).toBe(got[1].key);
  });

  it('Sim-Meldungen (roh) bleiben lesbar, werden aber nicht gesprochen (kein Schlüssel)', () => {
    const { a, got } = mkLogic();
    a.onEvents([{ e: 'msg', p: 0, text: 'Baue einen Holzfäller.' }] as never, 10);
    expect(got[0].text).toBe('Baue einen Holzfäller.');
    expect(got[0].key).toBeUndefined();
    expect(a.lastSpoken()).toBeNull();
  });

  it('Schwellen sind sinnvoll gewählt', () => {
    for (const c of Object.values(RES_LIMITS)) {
      expect(c.low).toBeLessThan(c.ok);
      expect(c.arm).toBeGreaterThan(c.low);
    }
  });
});

describe('AdvisorQueue', () => {
  const cand = (id: string, slot: string, tick: number, extra: Partial<AdvisorCandidate> = {}): AdvisorCandidate => ({ id, slot, params: {}, tick, ...extra });

  it('Zeitfenster: nach einer Meldung kommt eine normale erst nach der Lesezeit', () => {
    const q = new AdvisorQueue();
    q.offer(cand('dev.grow', 'dev.grow', 0), 0);
    q.offer(cand('army.ready', 'army.ready', 0), 0);
    const first = q.next(0)!;
    q.delivered(first, 0, 40);
    expect(q.next(WINDOW[0] - 10)).toBeNull();
    expect(q.next(WINDOW[0] + 1)).not.toBeNull();
  });

  it('Kritisches bricht das Zeitfenster und kommt vor Wartendem', () => {
    const q = new AdvisorQueue();
    q.offer(cand('dev.grow', 'dev.grow', 0), 0);
    q.delivered(q.next(0)!, 0, 40);
    q.offer(cand('army.ready', 'army.ready', 5), 5);
    q.offer(cand('enemy.attack', 'attack:1', 6, { params: { name: 'X', n: 4 } }), 6);
    const n = q.next(10)!;
    expect(n.id).toBe('enemy.attack');
    q.delivered(n, 10, 40);
    // zwei kritische brauchen Mindestabstand
    q.offer(cand('lord.hurt', 'lord', 12), 12);
    expect(q.next(12)).toBeNull();
    expect(q.next(10 + CRITICAL_GAP)?.id).toBe('lord.hurt');
  });

  it('veraltete Kandidaten verfallen, ungültige werden verworfen', () => {
    const q = new AdvisorQueue();
    q.offer(cand('dev.grow', 'dev.grow', 0), 0);
    expect(q.next(TTL[0] + 1)).toBeNull();
    q.offer(cand('res.low.plain', 'r', 100, { valid: () => false }), 100);
    expect(q.next(110)).toBeNull();
    expect(q.waiting.length).toBe(0);
  });

  it('Abklingzeit je Art, kein Wiederholen', () => {
    const q = new AdvisorQueue();
    q.offer(cand('res.low.plain', 'res.low:0', 0), 0);
    q.delivered(q.next(0)!, 0, 30);
    expect(q.offer(cand('res.low.plain', 'res.low:0', 600), 600)).toBe(false);
    expect(q.offer(cand('res.low.plain', 'res.low:0', COOLDOWN[1] + 1), COOLDOWN[1] + 1)).toBe(true);
  });

  it('gleiche Art im selben Slot ersetzt den wartenden Kandidaten', () => {
    const q = new AdvisorQueue();
    q.offer(cand('res.low.plain', 'res.low:0', 0, { params: { n: 10 } }), 0);
    q.offer(cand('res.low.plain', 'res.low:0', 5, { params: { n: 4 } }), 5);
    expect(q.waiting.length).toBe(1);
    expect(q.next(10)!.params.n).toBe(4);
  });

  it('Sammelmeldung aus mehreren Kandidaten', () => {
    const q = new AdvisorQueue();
    q.offer(cand('res.low.plain', 'res.low:0', 0, { item: 'Holz' }), 0);
    q.offer(cand('res.low.noprod', 'res.low:1', 2, { item: 'Stein' }), 2);
    const d = q.next(10)!;
    expect(d.id).toBe('res.low.multi');
    expect(d.params.list).toBe('Holz und Stein');
    expect(d.merged.length).toBe(2);
    expect(joinList(['A', 'B', 'C'])).toBe('A, B und C');
  });
});
