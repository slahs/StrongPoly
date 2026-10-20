import { describe, expect, it } from 'vitest';
import { BT, R, explainPopularity, mkTestView, setLang } from './helpers_view';
import type { PlayerView } from '@strongpoly/shared';
import { docText } from '../src/ui/doc/blocks';
import { deltaText, effectText, factorLabel, forecastLines, popularityTipDoc, trendText } from '../src/ui/popularity_model';
import { foodLevel, foodSupply, fearTipDoc, goldLevel, goldTipDoc, peasantLevel, peasantsTipDoc, popularityLevel, resLevel, troopLevel } from '../src/ui/hud_stats';
import { Settings, migrateSettings } from '../src/game/settings';

const f = (key: string, value: number, label = key) => ({ key, label, value });
const taxView = (over: Partial<PlayerView> = {}): PlayerView =>
  mkTestView({ popularity: 58, tax: 4, factors: [f('ration', 0), f('variety', 1.5), f('tax', -8), f('ale', 0), f('religion', 0), f('good', 0), f('bad', 0), f('crowd', 0)], popDelta: -6.5, ...over });

describe('Beliebtheits-Anzeige (Daten, ohne DOM)', () => {
  it('Hover-Dokument nennt Hauptursache, wichtigste Faktoren und Prognose mit den echten Werten', () => {
    setLang('de');
    const txt = docText(popularityTipDoc(taxView()));
    expect(txt).toMatch(/Beliebtheit 58/);
    expect(txt).toMatch(/Eure hohen Steuern belasten die Stimmung im Volk/);
    expect(txt).toMatch(/Steuern \| −8/);
    expect(txt).toMatch(/Nahrungsvielfalt \| \+1,5/);
    expect(txt).toMatch(/fällt um 6,5 pro Monat/);
    expect(txt).toMatch(/in einem Monat etwa 52/);
    expect(txt).toMatch(/unter 50 in etwa|fällt die Beliebtheit unter 50/);
  });

  it('Kopfleiste: Pfeil und Betrag stimmen mit der Summe der Faktoren überein', () => {
    setLang('de');
    expect(deltaText(explainPopularity(taxView()))).toBe('▼6,5');
    const up = taxView({ factors: [f('ration', 4), f('tax', 0)], popDelta: 4 });
    expect(deltaText(explainPopularity(up))).toBe('▲4');
    const flat = taxView({ factors: [f('ration', 0), f('tax', 0)], popDelta: 0 });
    expect(deltaText(explainPopularity(flat))).toBe('');
    // vor der ersten Auswertung der Sim steht kein erfundener Pfeil (popDelta ist dort noch der Startwert)
    expect(deltaText(explainPopularity(taxView({ factors: [], popDelta: 60 })))).toBe('');
  });

  it('Trendzeile, Prognose und Faktorbeschriftung', () => {
    setLang('de');
    const ex = explainPopularity(taxView());
    expect(trendText(ex)).toBe('fällt um 6,5 pro Monat');
    expect(forecastLines(ex).join(' ')).toMatch(/in drei Monaten etwa 39/);
    expect(effectText(-8)).toBe('−8');
    expect(effectText(1.5)).toBe('+1,5');
    expect(effectText(0)).toBe('0');
    const hungry = taxView({ foodShort: true, factors: [f('ration', -8, 'Hunger (keine Nahrung)')] });
    expect(factorLabel(explainPopularity(hungry).factors[0], hungry)).toBe('Hunger (keine Nahrung)');
    const bribe = taxView({ tax: -2 });
    expect(factorLabel(explainPopularity(bribe).factors.find((x) => x.key === 'tax')!, bribe)).toBe('Bestechung');
  });

  it('Englisch: dieselben Zahlen, englische Texte', () => {
    setLang('en');
    const txt = docText(popularityTipDoc(taxView(), 'en'));
    expect(txt).toMatch(/Popularity 58/);
    expect(txt).toMatch(/Your high taxes weigh on the mood of the people/);
    expect(txt).toMatch(/Taxes \| −8/);
    expect(txt).toMatch(/Food variety \| \+1\.5/);
    setLang('de');
  });
});

describe('HUD-Warnzustände (gleiche Grenzen wie der Berater)', () => {
  const v = (o: Partial<PlayerView> = {}): PlayerView => mkTestView(o);
  it('Rohstoffe: nur warnen, wenn die Ware schon einmal reichlich da war', () => {
    expect(resLevel(R.Wood, 5, false)).toBe('ok');
    expect(resLevel(R.Wood, 5, true)).toBe('warn');
    expect(resLevel(R.Wood, 0, true)).toBe('crit');
    expect(resLevel(R.Wood, 30, true)).toBe('ok');
    expect(resLevel(R.Hops, 0, true)).toBe('ok'); // keine Grenzen für Hopfen
  });
  it('Nahrung: Monate Vorrat, Hunger kritisch', () => {
    const s = foodSupply(v({ peasants: 20, ration: 2 }));
    expect(s.need).toBe(10);
    expect(s.months).toBe(20); // 200 Äpfel
    expect(foodLevel(v({ peasants: 20, ration: 2 }))).toBe('ok');
    const low = v({ peasants: 20, ration: 2, stock: v().stock.map((x, i) => (i === R.Apple ? 12 : x)) });
    expect(foodLevel(low)).toBe('warn');
    expect(foodLevel(v({ foodShort: true }))).toBe('crit');
    expect(foodSupply(v({ ration: 0 })).months).toBe(Infinity);
  });
  it('Bauern, Beliebtheit, Gold, Truppen', () => {
    expect(peasantLevel({ peasants: 24, housing: 24 })).toBe('warn');
    expect(peasantLevel({ peasants: 30, housing: 24 })).toBe('crit');
    expect(peasantLevel({ peasants: 10, housing: 24 })).toBe('ok');
    expect(popularityLevel(taxView({ popularity: 58 }))).toBe('warn'); // Schwelle in unter 3 Minuten
    expect(popularityLevel(taxView({ popularity: 45 }))).toBe('crit');
    expect(popularityLevel(taxView({ popularity: 90, factors: [f('tax', -2)], popDelta: -2 }))).toBe('ok');
    expect(goldLevel({ gold: 5, peasants: 20, tax: -3 })).toBe('crit'); // Bestechung kostet mehr als vorhanden
    expect(goldLevel({ gold: 500, peasants: 20, tax: 2 })).toBe('ok');
    expect(troopLevel({ troops: 100, troopLimit: 100 })).toBe('warn');
  });
  it('Tooltip-Dokumente nennen echte Werte', () => {
    setLang('de');
    const vv = v({ gold: 321, peasants: 20, housing: 24, tax: 3, fear: 2, troops: 5, troopLimit: 50 });
    expect(docText(goldTipDoc(vv))).toMatch(/Steuern pro Monat: \+28/);
    expect(docText(peasantsTipDoc(vv))).toMatch(/Bauern: 20/);
    expect(docText(fearTipDoc(vv))).toMatch(/Arbeitsleistung: \+10 %/);
    expect(docText(fearTipDoc(vv))).toMatch(/Kampfkraft der eigenen Truppen: −8 %/);
    void BT;
  });
});

describe('Einstellung „Berater spricht“', () => {
  it('ist standardmäßig an und übersteht die Migration', () => {
    expect(new Settings().advisorSpeech).toBe(true);
    expect(migrateSettings({ advisorSpeech: false }).advisorSpeech).toBe(false);
  });
});
