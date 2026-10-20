import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  AI_PROFILES,
  BT,
  BUILDINGS,
  DMG_TABLE,
  ENEMY_BUILD_RADIUS,
  EXTREME,
  POP_THRESHOLD,
  RATION_POP,
  RELIGION_COVER,
  RES_INFO,
  TAX_GOLD,
  TAX_LEVELS,
  TAX_POP,
  TEXTS,
  TURRETS,
  UNITS,
  fmtNum,
  hasText,
  trackTextUsage,
} from '@strongpoly/shared';
import { DEFAULT_HOTKEYS, HOTKEY_LABELS } from '../src/game/hotkeys';
import { docLinks, docSvgs, docText } from '../src/ui/doc/blocks';
import { TOOL_KEYS, POP_FACTOR_KEYS } from '../src/ui/icons';
import { CHAIN_IDS } from '../src/ui/encyclopedia/chains';
import { encGroups, encPages, resolvePage, searchPages } from '../src/ui/encyclopedia/pages';
import { abilityTipDoc, buildingTipDoc, resourceTipDoc, toolTipDoc, unitTipDoc } from '../src/ui/tooltips/model';

const BAD = /undefined|NaN|null|Infinity|\[object|\{[a-zA-Z]+\}|\?\?/;

describe('Enzyklopädie: Seitenliste', () => {
  const pages = encPages();

  it('deckt alle Gebäude, Einheiten, Waren, Ketten und Systemseiten ab', () => {
    for (const b of BUILDINGS) expect(pages.has(`building/${b.key}`), b.key).toBe(true);
    for (const u of UNITS) expect(pages.has(`unit/${u.key}`), u.key).toBe(true);
    for (const r of RES_INFO) expect(pages.has(`resource/${r.key}`), r.key).toBe(true);
    expect(pages.has('resource/gold')).toBe(true);
    for (const c of CHAIN_IDS) expect(pages.has(`chain/${c}`), c).toBe(true);
    for (const id of ['start', 'buildings', 'units', 'resources', 'chains', 'popularity', 'combat', 'siege', 'abilities', 'rules', 'controls', 'lords']) {
      expect(pages.has(id), id).toBe(true);
    }
  });

  it('die Navigation führt jede Seite genau einmal auf (ohne Gruppenseiten)', () => {
    const seen = new Map<string, number>();
    const groups = encGroups();
    for (const g of groups) {
      if (g.page) expect(pages.has(g.page), g.page).toBe(true);
      for (const s of g.sections) for (const id of s.pages) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const b of BUILDINGS) expect(seen.get(`building/${b.key}`), b.key).toBe(1);
    for (const u of UNITS) expect(seen.get(`unit/${u.key}`), u.key).toBe(1);
    for (const r of RES_INFO) expect(seen.get(`resource/${r.key}`), r.key).toBe(1);
    expect(seen.get('resource/gold')).toBe(1);
    for (const c of CHAIN_IDS) expect(seen.get(`chain/${c}`), c).toBe(1);
    for (const [id, n] of seen) {
      expect(pages.has(id), `Navigation verweist auf fehlende Seite ${id}`).toBe(true);
      expect(n, id).toBe(1);
    }
  });

  it('jede Seite lässt sich bauen: Titel, Inhalt, Icons gültig, keine undefined/NaN-Reste, Links lösen auf', () => {
    for (const p of pages.values()) {
      const doc = p.build();
      const text = docText(doc);
      expect(text, p.id).not.toMatch(BAD);
      expect(doc.title.length, p.id).toBeGreaterThan(0);
      expect(doc.blocks.length, p.id).toBeGreaterThan(0);
      expect(p.icon, p.id).toContain('<svg');
      for (const s of docSvgs(doc)) {
        expect(s, p.id).toContain('<svg');
        expect(s, p.id).not.toContain('NaN');
        expect(s, p.id).not.toContain('undefined');
      }
      for (const link of docLinks(doc)) expect(pages.has(link), `${p.id} verlinkt auf fehlende Seite ${link}`).toBe(true);
    }
  });

  it('resolvePage versteht volle IDs, nackte Schlüssel und fällt auf die Startseite zurück', () => {
    expect(resolvePage(pages, 'building/quarry')).toBe('building/quarry');
    expect(resolvePage(pages, 'quarry')).toBe('building/quarry');
    expect(resolvePage(pages, 'archer')).toBe('unit/archer');
    expect(resolvePage(pages, 'bread')).toBe('resource/bread');
    expect(resolvePage(pages, 'gibt-es-nicht')).toBe('start');
    expect(resolvePage(pages, undefined)).toBe('start');
  });
});

describe('Enzyklopädie: Inhalte aus den Datentabellen', () => {
  const pages = encPages();
  const text = (id: string): string => docText(pages.get(id)!.build());

  it('Gebäudeseite: Kennzahlen, Platzierung, Kette', () => {
    const q = BUILDINGS[BT.Quarry];
    const t = text('building/quarry');
    expect(t).toContain(`Lebenspunkte: ${fmtNum(q.hp)}`);
    expect(t).toContain(`Größe: ${q.w} × ${q.h} Felder`);
    expect(t).toContain(`Kosten: ${q.cost.gold} Gold ${q.cost.wood} Holz`);
    expect(t).toContain('Steinvorkommen');
    expect(t).toContain('Produktionskette');
    expect(t).toContain('Liefert an: Lager');
    expect(t).toContain('Ochsengespann');
    const mill = text('building/mill');
    expect(mill).toContain('Abhängig von: Weizen');
    expect(mill).toContain('Weizenhof');
    expect(mill).toContain('Weiterverarbeitet von: Bäckerei');
    const bld = docText(pages.get('building/barracks')!.build());
    expect(bld).toContain('Rekrutiert');
  });

  it('Einheitenseite: Stark/Schwach-Tabellen mit Multiplikatoren aus DMG_TABLE', () => {
    const t = text('unit/archer');
    expect(t).toContain('Ungepanzert | ×1');
    expect(t).toContain('Steingebäude | ×0,03');
    expect(t).toContain(`Bogenschütze`);
    expect(text('unit/knight')).toContain('Belagerung | ×1,2');
  });

  it('Beliebtheit: tatsächliche Zahlen aus den Tabellen', () => {
    const t = text('popularity');
    expect(t).toContain(`Ab einer Beliebtheit von ${POP_THRESHOLD}`);
    for (const lv of TAX_LEVELS) {
      const g = TAX_GOLD[lv];
      expect(t).toContain(`${g > 0 ? '+' : g < 0 ? '−' : ''}${fmtNum(Math.abs(g))}`);
      expect(TAX_POP[lv]).toBeDefined();
    }
    for (const v of RATION_POP) expect(t).toContain(fmtNum(Math.abs(v)));
    expect(t).toContain(String(RELIGION_COVER.cathedral));
    for (const k of ['Rationen', 'Nahrungsvielfalt', 'Steuern', 'Bier', 'Religion', 'Gute Dinge', 'Schlechte Dinge', 'Angstfaktor', 'Überfüllung', 'Ereignisse']) {
      expect(t, k).toContain(k);
    }
    expect(t).toContain('Monatsprognose');
  });

  it('Kampfsystem: Schadensmatrix enthält jeden Wert aus DMG_TABLE', () => {
    const doc = pages.get('combat')!.build();
    const matrix = doc.blocks.find((b) => b.k === 'matrix');
    expect(matrix).toBeDefined();
    if (matrix?.k !== 'matrix') return;
    expect(matrix.rows.length).toBe(DMG_TABLE.length);
    matrix.rows.forEach((row, d) => {
      expect(row.cells.length).toBe(DMG_TABLE[d].length);
      row.cells.forEach((c, a) => {
        expect(c.value).toBe(DMG_TABLE[d][a]);
        expect(c.text).toBe(`×${fmtNum(DMG_TABLE[d][a])}`);
      });
    });
    expect(matrix.cols.length).toBe(DMG_TABLE[0].length);
  });

  it('Extreme-Fähigkeiten: Kosten, Abklingzeit, Radius jeder Fähigkeit', () => {
    const t = text('abilities');
    for (const a of ABILITIES) {
      expect(t).toContain(a.name);
      expect(t).toContain(`${a.name} | ${a.cost} | ${a.cooldown} s | ${a.radius > 0 ? fmtNum(a.radius) + ' Felder' : '–'}`);
    }
    expect(t).toContain(`${EXTREME.goldDonation} Gold`);
    expect(t).toContain(`${EXTREME.powerMax} Macht`);
    const doc = pages.get('abilities')!.build();
    const table = doc.blocks.find((b) => b.k === 'table');
    expect(table?.k === 'table' ? table.rows.length : 0).toBe(ABILITIES.length);
  });

  it('Regeländerungen: Bauverbot, Zielwahl, Geschützreichweiten', () => {
    const t = text('rules');
    expect(t).toContain(`weniger als ${ENEMY_BUILD_RADIUS} Felder`);
    expect(t).toContain('Katapult, Trebuchet und Feuerballista suchen sich von selbst nur feindliches Gerät');
    expect(t).toContain(`${TURRETS.ballista.range} Felder`);
    expect(t).toContain(`${TURRETS.mangonel.range} Felder`);
    expect(t).toContain('Ballista-Geschütz');
    expect(t).toContain('Katapult');
  });

  it('Belagerung: alle Themen und Gegenmaßnahmen', () => {
    const t = text('siege');
    for (const k of ['Rammbock', 'Katapult', 'Trebuchet', 'Belagerungsturm', 'Leitern', 'Tunnel', 'Feuer', 'Öl und Pech', 'Fallen', 'Mauergeschütze', 'Gegenmaßnahmen']) expect(t, k).toContain(k);
  });

  it('Steuerung: Hotkeys aus game/hotkeys', () => {
    const t = text('controls');
    for (const a of Object.keys(HOTKEY_LABELS) as (keyof typeof HOTKEY_LABELS)[]) {
      if (['panUp'].includes(a)) continue;
      expect(DEFAULT_HOTKEYS[a], a).toBeTruthy();
    }
    expect(t).toContain(HOTKEY_LABELS.encyclopedia);
    expect(DEFAULT_HOTKEYS.encyclopedia).toBe('F2');
  });

  it('KI-Lords: jedes Profil mit Name und Beschreibung', () => {
    const t = text('lords');
    for (const p of AI_PROFILES) {
      expect(t).toContain(p.name);
      expect(t).toContain(p.desc);
    }
  });

  it('Wirtschaftsketten: Flussdiagramme sind als SVG vorhanden', () => {
    for (const c of CHAIN_IDS) {
      const doc = pages.get(`chain/${c}`)!.build();
      const svg = doc.blocks.find((b) => b.k === 'svg');
      expect(svg, c).toBeDefined();
      if (svg?.k === 'svg') {
        expect(svg.svg).toContain('<svg');
        expect(svg.svg).toContain('chain-node');
        expect(svg.svg).not.toMatch(/NaN|undefined/);
      }
    }
    const food = text('chain/food');
    for (const n of ['Weizenhof', 'Mühle', 'Bäckerei', 'Kornspeicher']) expect(food).toContain(n);
  });
});

describe('Enzyklopädie: Suche', () => {
  const pages = encPages();
  it('findet Gebäude, Einheiten und Begriffe, Titeltreffer zuerst', () => {
    const r = searchPages(pages, 'steinbruch');
    expect(r[0].id).toBe('building/quarry');
    expect(searchPages(pages, 'Bogenschütze')[0].id).toBe('unit/archer');
    expect(searchPages(pages, 'katapult').map((p) => p.id)).toContain('unit/catapult');
    expect(searchPages(pages, 'ölkessel').map((p) => p.id)).toContain('building/cauldron');
    expect(searchPages(pages, 'bauverbot').map((p) => p.id)).toContain('rules');
    expect(searchPages(pages, 'qqqqqq')).toEqual([]);
    expect(searchPages(pages, '   ')).toEqual([]);
  });
});

describe('Texte: Nutzung und Vollständigkeit', () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  }

  it('jeder deutsche Schlüssel wird irgendwo verwendet (keine toten Texte)', () => {
    const used = new Set<string>();
    trackTextUsage(used);
    try {
      const pages = encPages();
      for (const p of pages.values()) p.build();
      for (const b of BUILDINGS) buildingTipDoc(b.id);
      for (const u of UNITS) unitTipDoc(u.id);
      RES_INFO.forEach((_r, i) => resourceTipDoc(i, { stock: 1, capacity: 2, priceMul: 1 }));
      for (const a of ABILITIES) abilityTipDoc(a.id);
      for (const k of TOOL_KEYS) toolTipDoc(k, 'X');
    } finally {
      trackTextUsage(null);
    }
    // Schlüssel, die nur im DOM-Code (ui/encyclopedia.ts, ui/tooltip.ts) stehen
    const dom = readFileSync(new URL('../src/ui/encyclopedia.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/tooltip.ts', import.meta.url), 'utf8');
    for (const m of dom.matchAll(/'([a-z]+\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]);
    // Schlüssel in Quelldateien, die nicht über die Seiten laufen (z. B. Platzierungsfehler)
    const src = sourceFiles(new URL('../src', import.meta.url).pathname).map((f) => readFileSync(f, 'utf8')).join('\n');
    const dead: string[] = [];
    for (const key of Object.keys(TEXTS.de)) {
      if (used.has(key)) continue;
      if (key.startsWith('terrain.')) continue; // Tabelle nach TERRAIN_NAMES, nicht jede Geländeart wird genannt
      if (src.includes(`'${key}'`)) continue;
      dead.push(key);
    }
    expect(dead).toEqual([]);
  });

  it('jeder Beliebtheitsfaktor, jedes Werkzeug und jede Kategorie hat einen Text', () => {
    for (const k of POP_FACTOR_KEYS) expect(hasText(`popfactor.${k}`, 'de'), k).toBe(true);
    for (const k of TOOL_KEYS) expect(hasText(`tool.${k}`, 'de'), k).toBe(true);
    const src = readFileSync(new URL('../../shared/src/sim/popularity.ts', import.meta.url), 'utf8');
    const keys = [...src.matchAll(/factors\.push\(\{\s*key:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) expect(hasText(`popfactor.${k}`, 'de'), k).toBe(true);
  });
});
