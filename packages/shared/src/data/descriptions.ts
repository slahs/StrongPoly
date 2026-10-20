/**
 * Beschreibungstexte und Beschriftungen (i18n). Deutsch ist vollständig (`descriptions.de.ts`, `descriptions.de.enc.ts`),
 * Englisch ist als zweite Datei vorbereitet (`descriptions.en.ts`); fehlende englische Schlüssel fallen auf Deutsch zurück.
 *
 * Regeln:
 * - Zahlen stehen NIE im Text. Wo eine Zahl nötig ist, steht ein Platzhalter wie `{cost}` oder `{radius}`,
 *   den der Aufrufer zur Laufzeit aus den Datentabellen (`shared/data/*`) einsetzt.
 * - Schlüssel: `building.<key>.desc|tip|rule`, `unit.<key>.desc|tip`, `res.<key>.desc`, `ability.<key>.desc|tip`,
 *   `popfactor.<key>`, `tool.<key>`, `cat.<id>`, `terrain.<id>`, `special.<flag>`, `dtype.<key>`, `armor.<key>`,
 *   `rule.<art>`, `ui.<label>`, `enc.<kapitel>.<…>`.
 */
import { DE } from './descriptions.de';
import { DE_ENC } from './descriptions.de.enc';
import { EN } from './descriptions.en';

export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];

export const TEXTS: Record<Lang, Record<string, string>> = {
  de: { ...DE, ...DE_ENC },
  en: { ...EN },
};

/** Schlüssel der Schadensarten (Reihenfolge wie `D` in data/units.ts) */
export const DTYPE_KEYS = ['slash', 'pierce', 'blunt', 'siege', 'fire'] as const;
/** Schlüssel der Rüstungsklassen (Reihenfolge wie `A` in data/units.ts) */
export const ARMOR_KEYS = ['none', 'light', 'heavy', 'plate', 'bldwood', 'bldstone', 'siegeeng'] as const;
/** Schlüssel der Sonderfähigkeiten von Einheiten (Flags in data/units.ts plus abgeleitete) */
export const SPECIAL_KEYS = [
  'mounted', 'invisible', 'climbs', 'ladders', 'tunnels', 'siege', 'bldOnly', 'towerBridge', 'fireDmg', 'healer', 'cover', 'repairs', 'worker',
  'splash', 'minRange', 'autoSiege', 'noAttack',
] as const;

let current: Lang = 'de';
let usage: Set<string> | null = null;

/** Testhilfe: sammelt alle über `t()`/`tf()` abgefragten Schlüssel (null = aus). */
export function trackTextUsage(sink: Set<string> | null): void {
  usage = sink;
}

export function setLang(l: Lang): void {
  if (LANGS.includes(l)) current = l;
}

export function getLang(): Lang {
  return current;
}

/** Gibt es den Schlüssel in dieser Sprache (ohne Rückfall)? */
export function hasText(key: string, lang: Lang = current): boolean {
  return Object.prototype.hasOwnProperty.call(TEXTS[lang], key);
}

/** Rohtext (mit Platzhaltern). Fehlt der Schlüssel in der Sprache, gilt der deutsche Text; fehlt er überall, kommt der Schlüssel selbst zurück. */
export function t(key: string, lang: Lang = current): string {
  usage?.add(key);
  const own = TEXTS[lang];
  if (Object.prototype.hasOwnProperty.call(own, key)) return own[key];
  const de = TEXTS.de;
  if (Object.prototype.hasOwnProperty.call(de, key)) return de[key];
  return key;
}

export type Params = Record<string, string | number | undefined>;

/** Zahl für die Anzeige: höchstens zwei Nachkommastellen ohne Nullen am Ende, Dezimalkomma auf Deutsch. */
export function fmtNum(n: number, lang: Lang = current): string {
  if (!Number.isFinite(n)) return '?';
  const r = Math.round(n * 100) / 100;
  let s = String(r);
  if (Object.is(r, -0)) s = '0';
  return lang === 'de' ? s.replace('.', ',') : s;
}

/** Ersetzt `{name}` durch Parameter (Zahlen werden formatiert). Unbekannte Platzhalter bleiben stehen, damit Tests sie finden. */
export function fill(template: string, params: Params = {}, lang: Lang = current): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k: string) => {
    const v = params[k];
    if (v === undefined) return m;
    return typeof v === 'number' ? fmtNum(v, lang) : v;
  });
}

/** Text holen und Platzhalter einsetzen. */
export function tf(key: string, params: Params = {}, lang: Lang = current): string {
  return fill(t(key, lang), params, lang);
}

/** Namen der Platzhalter in einem Text. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
}
