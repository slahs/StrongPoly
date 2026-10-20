/**
 * Darstellung der Ergebnisse von `matchups()` (shared/data/matchups.ts) als Inhalts-Bausteine.
 */
import { ArmorGroup, DefenseEntry, Matchups, UNITS, matchups, t, tf } from '@strongpoly/shared';
import type { Block, Rich } from '../doc/blocks';
import { armorName, dtypeName, uIcon, unitLink } from './facts';

/** „×1,2“ */
export function multText(m: number): string {
  return tf('ui.mult', { m });
}

function multCls(m: number): string {
  return m >= 1 ? 'pos' : m <= 0.5 ? 'neg' : '';
}

/** Zielgruppe (Rüstungsklasse) als Inline-Reihe: Name, Multiplikator, Icons der betroffenen Einheiten */
export function groupRich(g: ArmorGroup, limit: number, links = false): Rich {
  const out: Rich = [{ text: armorName(g.armor), bold: true }, ' ', { text: multText(g.mult), cls: multCls(g.mult) }];
  if (g.units.length) {
    out.push(' ');
    const shown = g.units.slice(0, limit);
    for (const id of shown) {
      const d = UNITS[id];
      out.push(links ? unitLink(d, 18) : { icon: uIcon(d, 18), title: d.name });
    }
    if (g.units.length > shown.length) out.push({ text: `+${g.units.length - shown.length}` });
  }
  return out;
}

/** Schadensart als Inline-Reihe: Name, Multiplikator, Icons der Einheiten, die so schaden */
export function defenseRich(e: DefenseEntry, limit: number, links = false): Rich {
  const out: Rich = [{ text: dtypeName(e.dtype), bold: true }, ' ', { text: multText(e.mult), cls: e.mult >= 1 ? 'neg' : e.mult <= 0.5 ? 'pos' : '' }];
  if (e.dealers.length) {
    out.push(' ');
    const shown = e.dealers.slice(0, limit);
    for (const id of shown) {
      const d = UNITS[id];
      out.push(links ? unitLink(d, 18) : { icon: uIcon(d, 18), title: d.name });
    }
    if (e.dealers.length > shown.length) out.push({ text: `+${e.dealers.length - shown.length}` });
  }
  return out;
}

/** Zeilen „Stark gegen / Schwach gegen / Verwundbar durch / Widersteht“ für den Tooltip */
export function matchupRows(m: Matchups, limit = 4): { label: string; value: Rich }[] {
  const rows: { label: string; value: Rich }[] = [];
  const join = (groups: Rich[]): Rich => {
    const out: Rich = [];
    groups.forEach((g, i) => {
      if (i) out.push(' · ');
      out.push(...g);
    });
    return out;
  };
  if (m.canAttack) {
    if (m.strong.length) rows.push({ label: t('ui.strongVs'), value: join(m.strong.slice(0, 3).map((g) => groupRich(g, limit))) });
    if (m.weak.length) rows.push({ label: t('ui.weakVs'), value: join(m.weak.slice(0, 3).map((g) => groupRich(g, limit))) });
  }
  if (m.hardestHit.length) rows.push({ label: t('ui.hardestHit'), value: join(m.hardestHit.slice(0, 3).map((e) => defenseRich(e, limit))) });
  if (m.resists.length) rows.push({ label: t('ui.resists'), value: join(m.resists.slice(0, 3).map((e) => defenseRich(e, limit))) });
  return rows;
}

/** Ausführliche Darstellung für die Enzyklopädie: Tabellen über alle Klassen */
export function matchupBlocks(unitId: number): Block[] {
  const m = matchups(unitId);
  const blocks: Block[] = [];
  const def = UNITS[unitId];
  if (m.canAttack) {
    blocks.push({ k: 'h', text: t('ui.offense'), level: 3 });
    blocks.push({ k: 'p', text: tf('ui.offenseIntro', { type: dtypeName(def.dtype) }) });
    blocks.push({
      k: 'table',
      head: [[t('ui.targetClass')], [t('ui.multiplier')], [t('ui.targets')]],
      rows: m.offense.map((g) => {
        const targets: Rich = g.building ? [t('ui.buildingsOfClass')] : g.units.map((id) => unitLink(UNITS[id], 18));
        const mark = m.strong.includes(g) ? ' ▲' : m.weak.includes(g) ? ' ▼' : '';
        return [[{ text: armorName(g.armor), bold: true }], [{ text: multText(g.mult) + mark, cls: multCls(g.mult) }], targets];
      }),
    });
  } else {
    blocks.push({ k: 'p', text: t('special.noAttack') });
  }
  blocks.push({ k: 'h', text: t('ui.defense'), level: 3 });
  blocks.push({ k: 'p', text: tf('ui.defenseIntro', { armor: armorName(m.armor) }) });
  blocks.push({
    k: 'table',
    head: [[t('ui.damageType')], [t('ui.multiplier')], [t('ui.dealtBy')]],
    rows: m.defense.map((e) => {
      const mark = m.hardestHit.includes(e) ? ' ▲' : m.resists.includes(e) ? ' ▼' : '';
      return [[{ text: dtypeName(e.dtype), bold: true }], [{ text: multText(e.mult) + mark, cls: e.mult >= 1 ? 'neg' : e.mult <= 0.5 ? 'pos' : '' }], e.dealers.map((id) => unitLink(UNITS[id], 18))];
    }),
  });
  return blocks;
}
