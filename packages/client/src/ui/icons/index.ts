/**
 * Öffentliche Icon-API. Alle Icons entstehen im Code (SVG-Strings, 64x64-Raster, viewBox "0 0 64 64"),
 * liefern immer ein vollständiges <svg class="sp-icon"> und lassen sich per innerHTML einsetzen.
 */
import { ABILITIES, BUILDINGS, CATEGORIES, PLAYER_COLORS, RES_INFO, UNITS } from '@strongpoly/shared';
import { BUILDING_ICONS } from './buildings';
import { RESOURCE_ICONS, ABILITY_ICONS } from './items';
import { man } from './parts';
import { UNIT_ICONS } from './units';
import { CATEGORY_ICONS, FACE_NAMES, POP_ALIASES, POP_FACTORS, TOOL_ICONS, faceIcon, popFaceLevel } from './ui';
import { Col, SW, X, ngon, poly, rect, shadow, wrap } from './svg';

export { TOOL_ICONS, POP_FACTORS, CATEGORY_ICONS, popFaceLevel };

/** Vorgabe-Spielerfarbe für Einheiten-Icons (Rot) */
export const DEFAULT_TEAM_COLOR: Col = PLAYER_COLORS[0];
export const DEFAULT_ICON_SIZE = 32;

/** Notwendige Schlüssel (Werkzeuge laut Spezifikation); iconCoverage meldet fehlende. */
export const TOOL_KEYS: readonly string[] = Object.keys(TOOL_ICONS);
export const REQUIRED_TOOL_KEYS: readonly string[] = [
  'demolish', 'repair', 'undo', 'cancel', 'move', 'attack', 'groundattack', 'patrol', 'stop',
  'stance_hold', 'stance_defensive', 'stance_aggressive', 'formation_free', 'formation_line', 'formation_box', 'formation_wedge',
  'dig', 'filloil', 'pause', 'play', 'center', 'group', 'rotate', 'save', 'load', 'options', 'menu', 'help', 'encyclopedia', 'advisor', 'hotkeys',
];
/** Schlüssel der Beliebtheitsfaktoren (entsprechen den `key` in sim/popularity.ts, plus Zusatzschlüssel) */
export const POP_FACTOR_KEYS: readonly string[] = Object.keys(POP_FACTORS);
export const REQUIRED_POP_KEYS: readonly string[] = ['ration', 'variety', 'tax', 'ale', 'religion', 'good', 'bad', 'crowd', 'events', 'fear', 'garden'];
export const CATEGORY_KEYS: readonly string[] = Object.keys(CATEGORY_ICONS);

function generic(): string {
  return shadow(32, 58, 20) + rect(10, 10, 44, 44, X.cream, SW) + ngon(32, 32, 14, null, 2, 8) + poly([26, 26, 30, 21, 36, 21, 40, 26, 36, 32, 33, 35, 33, 38, 30, 38, 30, 34, 34, 30, 36, 27, 34, 25, 31, 25, 29, 27], X.red, 1.8) + rect(30, 42, 4, 4, X.red, 1.4);
}

const cache = new Map<string, string>();
function cached(key: string, build: () => string): string {
  let s = cache.get(key);
  if (s === undefined) {
    s = build();
    if (cache.size > 4000) cache.clear();
    cache.set(key, s);
  }
  return s;
}

function sz(size: number | undefined): number {
  return size && size > 0 ? size : DEFAULT_ICON_SIZE;
}

export function buildingIcon(typeId: number, size?: number): string {
  const d = BUILDING_ICONS[typeId];
  return wrap(cached(`b${typeId}`, () => (d ? d() : generic())), sz(size), BUILDINGS[typeId]?.name ?? 'Gebäude');
}

export function unitIcon(typeId: number, color?: number, size?: number): string {
  const c = color ?? DEFAULT_TEAM_COLOR;
  const d = UNIT_ICONS[typeId];
  return wrap(cached(`u${typeId}:${c}`, () => (d ? d(c) : shadow(32, 57, 15) + man({ tunic: c }))), sz(size), UNITS[typeId]?.name ?? 'Einheit');
}

export function resourceIcon(resId: number, size?: number): string {
  const d = RESOURCE_ICONS[resId];
  return wrap(cached(`r${resId}`, () => (d ? d() : generic())), sz(size), RES_INFO[resId]?.name ?? 'Ware');
}

export function abilityIcon(id: number, size?: number): string {
  const d = ABILITY_ICONS[id];
  return wrap(cached(`a${id}`, () => (d ? d() : generic())), sz(size), ABILITIES[id]?.name ?? 'Fähigkeit');
}

export function toolIcon(key: string, size?: number): string {
  const t = TOOL_ICONS[key];
  return wrap(cached(`t${key}`, () => (t ? t.draw() : generic())), sz(size), t?.name ?? key);
}

export function popFactorIcon(key: string, size?: number): string {
  const k = POP_ALIASES[key] ?? key;
  const t = POP_FACTORS[k];
  return wrap(cached(`p${k}`, () => (t ? t.draw() : generic())), sz(size), t?.name ?? key);
}

/** Gesichtssymbol für die Beliebtheit (0..100): fünf Stufen von Rot (unzufrieden) bis Grün (begeistert). */
export function popFaceIcon(value: number, size?: number): string {
  const lv = popFaceLevel(value);
  return wrap(cached(`f${lv}`, () => faceIcon(lv)), sz(size), FACE_NAMES[lv]);
}

export function categoryIcon(key: string, size?: number): string {
  const t = CATEGORY_ICONS[key];
  return wrap(cached(`c${key}`, () => (t ? t.draw() : generic())), sz(size), t?.name ?? key);
}

export interface IconCoverage {
  buildings: string[];
  units: string[];
  resources: string[];
  abilities: string[];
  tools: string[];
  popFactors: string[];
  categories: string[];
}

/** Listet je Kategorie auf, was kein Icon hat (alles leer = vollständig). */
export function iconCoverage(): IconCoverage {
  const miss = <T>(items: readonly T[], has: (x: T, i: number) => boolean, name: (x: T, i: number) => string): string[] => items.map((x, i) => (has(x, i) ? '' : name(x, i))).filter((s) => s);
  return {
    buildings: miss(BUILDINGS, (b) => !!BUILDING_ICONS[b.id], (b) => `${b.key} (${b.id})`),
    units: miss(UNITS, (u) => !!UNIT_ICONS[u.id], (u) => `${u.key} (${u.id})`),
    resources: miss(RES_INFO, (_r, i) => !!RESOURCE_ICONS[i], (r, i) => `${r.key} (${i})`),
    abilities: miss(ABILITIES, (a) => !!ABILITY_ICONS[a.id], (a) => `${a.key} (${a.id})`),
    tools: miss(REQUIRED_TOOL_KEYS, (k) => !!TOOL_ICONS[k], (k) => k),
    popFactors: miss(REQUIRED_POP_KEYS, (k) => !!POP_FACTORS[POP_ALIASES[k] ?? k], (k) => k),
    categories: miss([...CATEGORIES.map((c) => c.id as string), ...CATEGORY_KEYS], (k) => !!CATEGORY_ICONS[k], (k) => k),
  };
}

/** SVG-String als HTML-Element (für DOM-Aufbau ohne innerHTML-Kette) */
export function iconEl(svg: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = svg.trim();
  return t.content.firstElementChild as HTMLElement;
}

export interface GalleryItem {
  group: string;
  key: string;
  name: string;
  svg: string;
}

/** Alle Icons für die Galerie (?icons) */
export function galleryItems(o: { size?: number; teamColor?: number } = {}): GalleryItem[] {
  const size = o.size ?? 64;
  const out: GalleryItem[] = [];
  for (const b of BUILDINGS) out.push({ group: 'Gebäude', key: `BT.${b.key}`, name: b.name, svg: buildingIcon(b.id, size) });
  for (const u of UNITS) out.push({ group: 'Einheiten', key: `U.${u.key}`, name: u.name, svg: unitIcon(u.id, o.teamColor, size) });
  RES_INFO.forEach((r, i) => out.push({ group: 'Waren', key: `R.${r.key}`, name: r.name, svg: resourceIcon(i, size) }));
  for (const a of ABILITIES) out.push({ group: 'Fähigkeiten', key: `ability.${a.key}`, name: a.name, svg: abilityIcon(a.id, size) });
  for (const k of TOOL_KEYS) out.push({ group: 'Werkzeuge', key: k, name: TOOL_ICONS[k].name, svg: toolIcon(k, size) });
  for (const k of POP_FACTOR_KEYS) out.push({ group: 'Beliebtheitsfaktoren', key: k, name: POP_FACTORS[k].name, svg: popFactorIcon(k, size) });
  [10, 30, 50, 70, 90].forEach((v, i) => out.push({ group: 'Beliebtheit', key: `face${i}`, name: FACE_NAMES[i], svg: popFaceIcon(v, size) }));
  for (const k of CATEGORY_KEYS) out.push({ group: 'Kategorien', key: k, name: CATEGORY_ICONS[k].name, svg: categoryIcon(k, size) });
  return out;
}
