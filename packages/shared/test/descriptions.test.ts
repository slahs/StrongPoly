import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  ARMOR_KEYS,
  BUILDINGS,
  CATEGORIES,
  DTYPE_KEYS,
  LANGS,
  RES_INFO,
  SPECIAL_KEYS,
  TEXTS,
  TERRAIN_NAMES,
  UNITS,
  fill,
  fmtNum,
  getLang,
  hasText,
  placeholders,
  setLang,
  t,
  tf,
} from '../src';

const de = TEXTS.de;
const en = TEXTS.en;

describe('Beschreibungstexte (i18n)', () => {
  it('jedes Gebäude hat desc und tip, jede Einheit hat desc und tip', () => {
    for (const b of BUILDINGS) {
      expect(hasText(`building.${b.key}.desc`, 'de'), `building.${b.key}.desc`).toBe(true);
      expect(hasText(`building.${b.key}.tip`, 'de'), `building.${b.key}.tip`).toBe(true);
      expect(de[`building.${b.key}.desc`].length).toBeGreaterThan(10);
      expect(de[`building.${b.key}.tip`].length).toBeGreaterThan(10);
    }
    for (const u of UNITS) {
      expect(hasText(`unit.${u.key}.desc`, 'de'), `unit.${u.key}.desc`).toBe(true);
      expect(hasText(`unit.${u.key}.tip`, 'de'), `unit.${u.key}.tip`).toBe(true);
    }
  });

  it('jede Ware (und Gold), jede Fähigkeit, jede Kategorie, jede Schadensart und Rüstungsklasse hat Text', () => {
    for (const r of RES_INFO) expect(hasText(`res.${r.key}.desc`, 'de'), `res.${r.key}.desc`).toBe(true);
    expect(hasText('res.gold.desc', 'de')).toBe(true);
    for (const a of ABILITIES) {
      expect(hasText(`ability.${a.key}.desc`, 'de'), a.key).toBe(true);
      expect(hasText(`ability.${a.key}.tip`, 'de'), a.key).toBe(true);
    }
    for (const c of CATEGORIES) expect(hasText(`cat.${c.id}`, 'de'), c.id).toBe(true);
    for (const k of DTYPE_KEYS) {
      expect(hasText(`dtype.${k}`, 'de')).toBe(true);
      expect(hasText(`dtype.${k}.desc`, 'de')).toBe(true);
    }
    for (const k of ARMOR_KEYS) {
      expect(hasText(`armor.${k}`, 'de')).toBe(true);
      expect(hasText(`armor.${k}.desc`, 'de')).toBe(true);
    }
    for (const k of SPECIAL_KEYS) expect(hasText(`special.${k}`, 'de'), k).toBe(true);
    for (const id of Object.keys(TERRAIN_NAMES)) expect(hasText(`terrain.${id}`, 'de'), `terrain.${id}`).toBe(true);
  });

  it('keine verwaisten Schlüssel: Einheiten-/Gebäude-/Waren-Schlüssel verweisen auf vorhandene Daten', () => {
    const bKeys = new Set(BUILDINGS.map((b) => b.key));
    const uKeys = new Set(UNITS.map((u) => u.key));
    const rKeys = new Set([...RES_INFO.map((r) => r.key), 'gold']);
    const aKeys = new Set(ABILITIES.map((a) => a.key));
    const cKeys = new Set(CATEGORIES.map((c) => c.id as string));
    const orphans: string[] = [];
    for (const lang of LANGS) {
      for (const key of Object.keys(TEXTS[lang])) {
        const m = /^(building|unit|res|ability|cat|dtype|armor|special|terrain)\.([A-Za-z0-9_]+)(?:\.([a-z]+))?$/.exec(key);
        if (!m) continue;
        const [, kind, name, sub] = m;
        const ok =
          (kind === 'building' && bKeys.has(name) && ['desc', 'tip', 'rule'].includes(sub)) ||
          (kind === 'unit' && uKeys.has(name) && ['desc', 'tip'].includes(sub)) ||
          (kind === 'res' && rKeys.has(name) && sub === 'desc') ||
          (kind === 'ability' && aKeys.has(name) && ['desc', 'tip'].includes(sub)) ||
          (kind === 'cat' && cKeys.has(name) && !sub) ||
          (kind === 'dtype' && (DTYPE_KEYS as readonly string[]).includes(name) && (!sub || sub === 'desc')) ||
          (kind === 'armor' && (ARMOR_KEYS as readonly string[]).includes(name) && (!sub || sub === 'desc')) ||
          (kind === 'special' && (SPECIAL_KEYS as readonly string[]).includes(name) && !sub) ||
          (kind === 'terrain' && String(name) in TERRAIN_NAMES && !sub);
        if (!ok) orphans.push(`${lang}:${key}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('Englisch hat nur Schlüssel, die es auch auf Deutsch gibt, mit denselben Platzhaltern', () => {
    const extra = Object.keys(en).filter((k) => !(k in de));
    expect(extra).toEqual([]);
    for (const [k, v] of Object.entries(en)) {
      const a = [...new Set(placeholders(v))].sort();
      const b = [...new Set(placeholders(de[k]))].sort();
      expect(a, `Platzhalter von ${k}`).toEqual(b);
    }
    // englische Tooltip-Beschriftungen sind übersetzt
    for (const k of ['ui.cost', 'ui.hp', 'ui.strongVs', 'ui.weakVs', 'ui.recruitAt', 'ui.armor', 'ui.range', 'ui.speed', 'rule.enemy']) expect(en[k], k).toBeTruthy();
    expect(Object.keys(en).length).toBeGreaterThan(60);
  });

  it('in keinem Text stehen Zahlen: Ziffern gibt es nur innerhalb von Platzhaltern', () => {
    const bad: string[] = [];
    for (const lang of LANGS) {
      for (const [k, v] of Object.entries(TEXTS[lang])) {
        const stripped = v.replace(/\{[a-zA-Z0-9_]+\}/g, '');
        if (/[0-9]/.test(stripped)) bad.push(`${lang}:${k}: ${v}`);
        for (const name of placeholders(v)) if (!/^[a-zA-Z]+$/.test(name)) bad.push(`${lang}:${k}: Platzhalter ${name}`);
        if (/\{|\}/.test(v.replace(/\{[a-zA-Z0-9_]+\}/g, ''))) bad.push(`${lang}:${k}: lose Klammer`);
        if (v.trim() !== v || v.length === 0) bad.push(`${lang}:${k}: Leerraum/leer`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('t() fällt für fehlende englische Schlüssel auf Deutsch zurück; unbekannte Schlüssel liefern den Schlüssel', () => {
    expect(hasText('building.mill.desc', 'en')).toBe(false);
    expect(t('building.mill.desc', 'en')).toBe(de['building.mill.desc']);
    expect(t('ui.cost', 'en')).toBe('Cost');
    expect(t('ui.cost', 'de')).toBe('Kosten');
    expect(t('gibt.es.nicht')).toBe('gibt.es.nicht');
  });

  it('setLang schaltet die Standardsprache um', () => {
    const before = getLang();
    try {
      setLang('en');
      expect(t('ui.cost')).toBe('Cost');
      setLang('de');
      expect(t('ui.cost')).toBe('Kosten');
    } finally {
      setLang(before);
    }
  });

  it('Platzhalter und Zahlenformat', () => {
    expect(fill('{a} und {b}', { a: 3 }, 'de')).toBe('3 und {b}');
    expect(tf('ui.sizeFmt', { w: 3, h: 4 }, 'de')).toBe('3 × 4 Felder');
    expect(fmtNum(1.75, 'de')).toBe('1,75');
    expect(fmtNum(1.75, 'en')).toBe('1.75');
    expect(fmtNum(2, 'de')).toBe('2');
    expect(fmtNum(0.1 + 0.2, 'de')).toBe('0,3');
    expect(fmtNum(NaN, 'de')).toBe('?');
  });
});
