import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ABILITIES, BUILDINGS, CATEGORIES, PLAYER_COLORS, RES_INFO, UNITS } from '@strongpoly/shared';
import {
  CATEGORY_KEYS, POP_FACTOR_KEYS, REQUIRED_TOOL_KEYS, TOOL_KEYS, abilityIcon, buildingIcon, categoryIcon, galleryItems, iconCoverage, popFaceIcon, popFactorIcon, resourceIcon, toolIcon, unitIcon,
} from '../src/ui/icons';

function validSvg(s: string): void {
  expect(s).toContain('<svg');
  expect(s).toContain('viewBox="0 0 64 64"');
  expect(s).toContain('class="sp-icon"');
  expect(s.trim().endsWith('</svg>')).toBe(true);
  expect(s).not.toContain('NaN');
  expect(s).not.toContain('undefined');
  // genug Inhalt (nicht nur das leere Gerüst)
  expect(s.length).toBeGreaterThan(300);
}

describe('Icons', () => {
  it('jedes Gebäude hat ein Icon', () => {
    expect(BUILDINGS.length).toBeGreaterThan(50);
    for (const b of BUILDINGS) validSvg(buildingIcon(b.id));
  });
  it('jede Einheit hat ein Icon (in Spielerfarbe einfärbbar)', () => {
    for (const u of UNITS) {
      validSvg(unitIcon(u.id));
      validSvg(unitIcon(u.id, PLAYER_COLORS[1], 48));
    }
    // Teamfarbe wirkt sich aus: nicht jede Einheit, aber die meisten ändern sich
    const changed = UNITS.filter((u) => unitIcon(u.id, PLAYER_COLORS[0]) !== unitIcon(u.id, PLAYER_COLORS[1])).length;
    expect(changed).toBeGreaterThanOrEqual(UNITS.length - 4);
  });
  it('jede Ware / Waffe / Nahrung hat ein Icon', () => {
    for (let i = 0; i < RES_INFO.length; i++) validSvg(resourceIcon(i));
  });
  it('jede Fähigkeit hat ein Icon', () => {
    for (const a of ABILITIES) validSvg(abilityIcon(a.id));
  });
  it('Werkzeuge, Beliebtheitsfaktoren, Gesichter, Kategorien', () => {
    for (const k of REQUIRED_TOOL_KEYS) expect(TOOL_KEYS).toContain(k);
    for (const k of TOOL_KEYS) validSvg(toolIcon(k));
    for (const k of POP_FACTOR_KEYS) validSvg(popFactorIcon(k));
    for (const c of CATEGORIES) expect(CATEGORY_KEYS).toContain(c.id);
    for (const k of CATEGORY_KEYS) validSvg(categoryIcon(k));
    const faces = new Set<string>();
    for (const v of [0, 19, 20, 39, 40, 59, 60, 79, 80, 100]) {
      validSvg(popFaceIcon(v));
      faces.add(popFaceIcon(v));
    }
    expect(faces.size).toBe(5);
  });
  it('Schlüssel der Beliebtheitsfaktoren aus sim/popularity.ts sind abgedeckt', () => {
    const src = readFileSync(new URL('../../shared/src/sim/popularity.ts', import.meta.url), 'utf8');
    const keys = [...src.matchAll(/factors\.push\(\{\s*key:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) {
      expect(POP_FACTOR_KEYS, `Beliebtheitsfaktor ${k}`).toContain(k);
      expect(popFactorIcon(k)).not.toContain('aria-label="' + k + '"');
    }
  });
  it('iconCoverage meldet nichts Fehlendes', () => {
    const c = iconCoverage();
    for (const [k, v] of Object.entries(c)) expect(v, `fehlend in ${k}`).toEqual([]);
  });
  it('Galerie liefert alle Icons mit eindeutigen Schlüsseln je Gruppe', () => {
    const items = galleryItems({ size: 32 });
    expect(items.length).toBeGreaterThanOrEqual(150);
    const seen = new Set<string>();
    for (const it of items) {
      const id = it.group + '/' + it.key;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });
});
