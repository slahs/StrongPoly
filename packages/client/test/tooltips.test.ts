import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  BT,
  BUILDINGS,
  CAULDRON,
  ENEMY_BUILD_RADIUS,
  R,
  RES_INFO,
  TURRETS,
  U,
  UNITS,
  fmtNum,
  matchups,
  t,
  tf,
} from '@strongpoly/shared';
import { docLinks, docSvgs, docText } from '../src/ui/doc/blocks';
import { TOOL_KEYS, iconCoverage } from '../src/ui/icons';
import { abilityTipDoc, buildingTipDoc, placementErrorText, resourceTipDoc, toolTipDoc, unitTipDoc } from '../src/ui/tooltips/model';
import { placeAtCursor, placeAtRect, insideView } from '../src/ui/tooltips/place';

const BAD = /undefined|NaN|null|Infinity|\[object|\{[a-zA-Z]+\}/;

function expectClean(text: string, what: string): void {
  expect(text, what).not.toMatch(BAD);
  expect(text.length, what).toBeGreaterThan(20);
}

describe('Icons und Texte zusammen', () => {
  it('jedes Gebäude und jede Einheit hat Icon (iconCoverage) und Text (desc + tip)', () => {
    const cov = iconCoverage();
    expect(cov.buildings).toEqual([]);
    expect(cov.units).toEqual([]);
    expect(cov.resources).toEqual([]);
    expect(cov.abilities).toEqual([]);
    for (const b of BUILDINGS) {
      expect(t(`building.${b.key}.desc`), b.key).not.toBe(`building.${b.key}.desc`);
      expect(t(`building.${b.key}.tip`), b.key).not.toBe(`building.${b.key}.tip`);
    }
    for (const u of UNITS) {
      expect(t(`unit.${u.key}.desc`), u.key).not.toBe(`unit.${u.key}.desc`);
      expect(t(`unit.${u.key}.tip`), u.key).not.toBe(`unit.${u.key}.tip`);
    }
  });
});

describe('Gebäude-Tooltips', () => {
  it('liefern für alle Gebäude vollständigen Inhalt ohne undefined/NaN', () => {
    for (const b of BUILDINGS) {
      const doc = buildingTipDoc(b.id);
      const text = docText(doc);
      expectClean(text, b.key);
      expect(text).toContain(b.name);
      expect(docSvgs(doc).length).toBeGreaterThan(0);
      for (const s of docSvgs(doc)) expect(s).toContain('<svg');
    }
  });

  it('Steinbruch: Kosten, Arbeiter, Größe, Lebenspunkte, Platzierung, Produktion exakt aus den Daten', () => {
    const q = BUILDINGS[BT.Quarry];
    const text = docText(buildingTipDoc(BT.Quarry));
    expect(text).toContain(`Kosten: ${q.cost.gold} Gold ${q.cost.wood} Holz`);
    expect(text).toContain(`Arbeiter: ${q.workers}`);
    expect(text).toContain(`Größe: ${q.w} × ${q.h} Felder`);
    expect(text).toContain(`Lebenspunkte: ${q.hp}`);
    expect(text).toContain(`Nur auf Steinvorkommen, mindestens ${q.minTiles} Felder davon.`);
    expect(text).toContain(`Kein Bau, solange feindliche Soldaten näher als ${ENEMY_BUILD_RADIUS} Felder sind.`);
    // Eingang → Ausgang mit Zeit pro Stück, Lieferweg per Ochse zum Lager
    const rec = q.prod!.recipes[0];
    expect(text).toContain(`${rec.outAmt} Stein`);
    expect(text).toContain(`alle ${rec.time} s`);
    expect(text).toContain(`${fmtNum(rec.time / rec.outAmt)} s`);
    expect(text).toContain(`Ochsen liefern je ${q.prod!.batch} an: Lager`);
    expect(text).toContain('Braucht ein Ochsengespann');
  });

  it('Mühle: Eingang Weizen aus dem Lager, Ausgang Mehl', () => {
    const text = docText(buildingTipDoc(BT.Mill));
    const rec = BUILDINGS[BT.Mill].prod!.recipes[0];
    expect(text).toContain(`${rec.in[0][1]} Weizen`);
    expect(text).toContain(`${rec.outAmt} Mehl`);
    expect(text).toContain('Eingangsware aus dem Lager: Weizen');
    expect(text).toContain(`Arbeiter liefern je ${BUILDINGS[BT.Mill].prod!.batch} an: Lager`);
  });

  it('Bäckerei liefert ins Lager laut RES_INFO, Äpfel ins Kornspeicher, Waffen in die Waffenkammer', () => {
    expect(docText(buildingTipDoc(BT.AppleOrchard))).toContain('an: Kornspeicher');
    expect(docText(buildingTipDoc(BT.Bakery))).toContain('an: Kornspeicher');
    expect(docText(buildingTipDoc(BT.Blacksmith))).toContain('an: Waffenkammer');
    expect(docText(buildingTipDoc(BT.Brewery))).toContain('an: Lager');
  });

  it('Platzierungsregeln: Vorkommen, Mauer, Modul, einmalig, Bauverbot in Feindesnähe', () => {
    expect(docText(buildingTipDoc(BT.Stairs))).toContain('Muss an eine Mauer angrenzen.');
    expect(docText(buildingTipDoc(BT.TurretBallista))).toContain('Nur auf einem freien Großen Turm.');
    expect(docText(buildingTipDoc(BT.Granary))).toContain('Weitere Module müssen an ein bestehendes Kornspeicher angrenzen.');
    expect(docText(buildingTipDoc(BT.IronMine))).toContain('Eisenvorkommen');
    expect(docText(buildingTipDoc(BT.Drawbridge))).toContain('über Wasser');
    expect(docText(buildingTipDoc(BT.Woodcutter))).toContain(`Braucht Bäume im Umkreis von ${BUILDINGS[BT.Woodcutter].prod!.radius} Feldern.`);
    for (const b of BUILDINGS) {
      if (b.id === BT.Keep || b.id === BT.Campfire) continue;
      expect(docText(buildingTipDoc(b.id)), b.key).toContain(tf('rule.enemy', { radius: ENEMY_BUILD_RADIUS }));
    }
    expect(ENEMY_BUILD_RADIUS).toBe(8);
  });

  it('Wirkung auf Beliebtheit und Angstfaktor', () => {
    const gallows = docText(buildingTipDoc(BT.Gallows));
    expect(gallows).toContain('Angstfaktor: +1');
    expect(gallows).toContain('Beliebtheit pro Monat: −0,5');
    const statue = docText(buildingTipDoc(BT.Statue));
    expect(statue).toContain('Angstfaktor: −2');
    expect(statue).toContain('Beliebtheit pro Monat: +1,4');
    expect(docText(buildingTipDoc(BT.Church))).toContain('bei voller Deckung');
    expect(docText(buildingTipDoc(BT.Hovel))).toContain(`Bevölkerungslimit um ${BUILDINGS[BT.Hovel].housing}`);
  });

  it('Geschütze und Ölkessel zeigen ihre Werte aus data/balance', () => {
    const ba = docText(buildingTipDoc(BT.TurretBallista));
    expect(ba).toContain(`Reichweite: ${TURRETS.ballista.range} Felder`);
    expect(ba).toContain(`Mindestabstand: ${TURRETS.ballista.minRange} Felder`);
    expect(ba).toContain(`Schaden: ${TURRETS.ballista.dmg}`);
    const ma = docText(buildingTipDoc(BT.TurretMangonel));
    expect(ma).toContain(`Reichweite: ${TURRETS.mangonel.range} Felder`);
    expect(TURRETS.ballista.range).toBe(18);
    expect(TURRETS.mangonel.range).toBe(16);
    const ca = docText(buildingTipDoc(BT.Cauldron));
    expect(ca).toContain(`Reichweite: ${fmtNum(CAULDRON.range)} Felder`);
  });

  it('Kosten stimmen für alle Gebäude mit den Tabellen überein', () => {
    for (const b of BUILDINGS) {
      const text = docText(buildingTipDoc(b.id));
      const parts: string[] = [];
      if (b.cost.gold) parts.push(`${b.cost.gold} Gold`);
      if (b.cost.wood) parts.push(`${b.cost.wood} Holz`);
      if (b.cost.stone) parts.push(`${b.cost.stone} Stein`);
      if (b.cost.iron) parts.push(`${b.cost.iron} Eisen`);
      if (b.cost.pitch) parts.push(`${b.cost.pitch} Pech`);
      expect(text, b.key).toContain(`Kosten: ${parts.length ? parts.join(' ') : 'kostenlos'}`);
      if (b.hp > 0) expect(text, b.key).toContain(`Lebenspunkte: ${fmtNum(b.hp)}`);
    }
  });
});

describe('Einheiten-Tooltips', () => {
  it('liefern für alle Einheiten vollständigen Inhalt ohne undefined/NaN', () => {
    for (const u of UNITS) {
      const doc = unitTipDoc(u.id);
      const text = docText(doc);
      expectClean(text, u.key);
      expect(text).toContain(u.name);
      expect(text).toContain(`Lebenspunkte: ${fmtNum(u.hp)}`);
      expect(text).toContain('Rüstung:');
      for (const s of docSvgs(doc)) expect(s).toContain('<svg');
      expect(docLinks(doc)).toEqual([]);
    }
  });

  it('Bogenschütze: Kosten, Rekrutierungsort, Werte, Stark/Schwach', () => {
    const a = UNITS[U.Archer];
    const text = docText(unitTipDoc(U.Archer));
    expect(text).toContain(`Kosten: ${a.cost.gold} Gold 1 Bogen`);
    expect(text).toContain('Rekrutierung: Kaserne');
    expect(text).toContain(`Ausbildung: ${a.train} s`);
    expect(text).toContain(`Schaden: ${a.dmg} (Stich) alle ${fmtNum(a.cd)} s`);
    expect(text).toContain(`Reichweite: ${a.range} Felder`);
    expect(text).toContain(`Tempo: ${fmtNum(a.speed)} Felder/s`);
    expect(text).toContain('Rüstung: Ungepanzert');
    expect(text).toContain('Stark gegen: Ungepanzert ×1');
    expect(text).toContain('Schwach gegen: Steingebäude ×0,03');
  });

  it('Ritter: Pferd, Besonderheit „beritten“, Verwundbarkeit aus der Tabelle', () => {
    const text = docText(unitTipDoc(U.Knight));
    expect(text).toContain('Pferd');
    expect(text).toContain('Beritten');
    expect(text).toContain('Rekrutierung: Kaserne');
    expect(text).toContain('Verwundbar durch: Belagerung ×1,2');
    expect(text).toContain('Widersteht: Stich ×0,3');
    // Spezialfähigkeiten
    expect(docText(unitTipDoc(U.Assassin))).toContain('Unsichtbar');
    expect(docText(unitTipDoc(U.Assassin))).toContain('Klettert');
    expect(docText(unitTipDoc(U.Tunneler))).toContain('Gräbt Tunnel');
    expect(docText(unitTipDoc(U.Laddermen))).toContain('Leitern');
    expect(docText(unitTipDoc(U.Ram))).toContain('Greift nur Gebäude an');
    expect(docText(unitTipDoc(U.SiegeTower))).toContain('Greift nicht selbst an');
  });

  it('Rekrutierungsorte: Kaserne, Söldnerposten, Ingenieurszunft', () => {
    expect(docText(unitTipDoc(U.Slave))).toContain('Rekrutierung: Söldnerposten');
    expect(docText(unitTipDoc(U.Catapult))).toContain('Rekrutierung: Ingenieurszunft');
    expect(docText(unitTipDoc(U.Peasant))).not.toContain('Rekrutierung');
  });

  it('Katapult: Zielwahl nur Gerät und Mindestreichweite', () => {
    const text = docText(unitTipDoc(U.Catapult));
    expect(text).toContain('Zielt von selbst nur auf feindliches Gerät');
    expect(text).toContain(`Mindestabstand ${UNITS[U.Catapult].minRange} Felder`);
    expect(docText(unitTipDoc(U.Trebuchet))).toContain('Zielt von selbst nur auf feindliches Gerät');
    expect(docText(unitTipDoc(U.Archer))).not.toContain('Zielt von selbst nur');
  });

  it('Stark/Schwach im Tooltip stimmt mit matchups() überein', () => {
    for (const u of UNITS) {
      if (u.dmg <= 0) continue;
      const m = matchups(u.id);
      const text = docText(unitTipDoc(u.id));
      if (m.strong.length) expect(text, u.key).toContain('Stark gegen');
      else expect(text, u.key).not.toContain('Stark gegen');
      if (m.weak.length) expect(text, u.key).toContain('Schwach gegen');
      else expect(text, u.key).not.toContain('Schwach gegen');
    }
  });
});

describe('Waren-, Fähigkeits- und Werkzeug-Tooltips', () => {
  it('Waren: Bestand, Kapazität, Preis aus RES_INFO und Marktfaktor', () => {
    RES_INFO.forEach((info, i) => {
      const text = docText(resourceTipDoc(i, { stock: 12, capacity: 150, priceMul: 1.5 }));
      expectClean(text, info.key);
      expect(text).toContain('Bestand: 12');
      expect(text).toContain('Kapazität: 150');
      expect(text).toContain(`Preis: ${fmtNum(info.price * 1.5)}`);
    });
    const wood = docText(resourceTipDoc(R.Wood));
    expect(wood).toContain(`Preis: ${RES_INFO[R.Wood].price}`);
    expect(wood).toContain('Lagerort: Lager');
    expect(docText(resourceTipDoc(R.Bread))).toContain('Lagerort: Kornspeicher');
    expect(docText(resourceTipDoc(R.Sword))).toContain('Lagerort: Waffenkammer');
  });

  it('Fähigkeiten: Kosten, Abklingzeit, Radius', () => {
    for (const a of ABILITIES) {
      const text = docText(abilityTipDoc(a.id));
      expectClean(text, a.key);
      expect(text).toContain(`Kosten (Macht): ${a.cost}`);
      expect(text).toContain(`Abklingzeit: ${a.cooldown} s`);
      if (a.radius > 0) expect(text).toContain(`Radius: ${fmtNum(a.radius)} Felder`);
      else expect(text).not.toContain('Radius');
    }
  });

  it('Werkzeuge: jedes Werkzeug hat Text, Taste optional', () => {
    for (const k of TOOL_KEYS) {
      const text = docText(toolTipDoc(k, 'Entf'));
      expect(text, k).not.toMatch(BAD);
      expect(text, k).toContain('Taste: Entf');
      expect(text.split('\n').length, k).toBeGreaterThan(2);
    }
  });
});

describe('Platzierungsfehler', () => {
  it('„Feinde in der Nähe“ wird mit dem Radius erklärt', () => {
    const msg = placementErrorText('Feinde in der Nähe');
    expect(msg).toContain(String(ENEMY_BUILD_RADIUS));
    expect(msg).not.toMatch(BAD);
    expect(placementErrorText('Platz belegt')).toBeNull();
  });
});

describe('Positionierung', () => {
  const view = { w: 1280, h: 720 };
  it('am Cursor: immer vollständig im Bild, klappt nach links/oben', () => {
    const size = { w: 360, h: 300 };
    for (const [x, y] of [[0, 0], [10, 700], [1270, 10], [1279, 719], [640, 360], [1200, 400], [300, 710]]) {
      const p = placeAtCursor({ x, y }, size, view);
      expect(insideView(p, size, view), `${x},${y}`).toBe(true);
    }
    // normal: rechts unterhalb
    const p = placeAtCursor({ x: 100, y: 100 }, size, view);
    expect(p.x).toBeGreaterThan(100);
    expect(p.y).toBeGreaterThan(100);
    // am rechten Rand links vom Cursor
    const q = placeAtCursor({ x: 1250, y: 100 }, size, view);
    expect(q.x + size.w).toBeLessThanOrEqual(1250);
    // am unteren Rand oberhalb des Cursors
    const r = placeAtCursor({ x: 100, y: 690 }, size, view);
    expect(r.y + size.h).toBeLessThanOrEqual(690);
  });
  it('zu große Tooltips werden auf den Rand geklemmt', () => {
    const p = placeAtCursor({ x: 500, y: 300 }, { w: 2000, h: 2000 }, view);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });
  it('am Element: bevorzugt darüber, sonst darunter', () => {
    const size = { w: 300, h: 200 };
    const bottom = placeAtRect({ x: 600, y: 650, w: 40, h: 40 }, size, view);
    expect(bottom.y + size.h).toBeLessThanOrEqual(650);
    const top = placeAtRect({ x: 600, y: 20, w: 40, h: 40 }, size, view);
    expect(top.y).toBeGreaterThanOrEqual(60);
    const edge = placeAtRect({ x: 5, y: 650, w: 40, h: 40 }, size, view);
    expect(insideView(edge, size, view)).toBe(true);
  });
});
