/**
 * Beliebtheits-Anzeige als neutrale Datenstruktur (ohne DOM): Hover-Zusammenfassung als `Doc` und Zeilen für die
 * Detailansicht. Alle Zahlen stammen aus `explainPopularity` (und damit aus den Sim-Faktoren), hier wird nur formatiert.
 */
import { explainPopularity, getLang, popDuration, popNum, popText, popularityTexts } from '@strongpoly/shared';
import type { Lang, PopExplain, PopFactorInfo, PopView } from '@strongpoly/shared';
import type { Doc, Rich } from './doc/blocks';
import { popFaceIcon, popFactorIcon } from './icons';

/** Beschriftung eines Faktors (Sim-Label nur für Ereignisse, deren Text es nur dort gibt) */
export function factorLabel(f: PopFactorInfo, v: PopView, lang: Lang = getLang()): string {
  if (f.key === 'ration' && v.foodShort) return popText('pop.factor.hunger', {}, lang);
  if (f.key === 'tax' && v.tax < 0) return popText('pop.factor.bribe', {}, lang);
  if (f.key === 'events') return f.label || popText('pop.factor.events', {}, lang);
  return popText(`pop.factor.${f.key}`, {}, lang);
}

/** Vorzeichenbehafteter Einfluss, z. B. `+4`, `−8`, `0` */
export function effectText(value: number, lang: Lang = getLang()): string {
  return Math.abs(value) < 0.05 ? '0' : popNum(value, true, lang);
}

export function effectClass(value: number): 'pos' | 'neg' | '' {
  return value > 0.05 ? 'pos' : value < -0.05 ? 'neg' : '';
}

/** Kurztext der Änderung pro Monat für die Kopfleiste, z. B. `▲1,5` / `▼4,3`; leer, wenn kaum Änderung */
export function deltaText(ex: PopExplain, lang: Lang = getLang()): string {
  if (ex.pending || ex.direction === 'flat') return '';
  return `${ex.direction === 'up' ? '▲' : '▼'}${popNum(Math.abs(ex.perMonth), false, lang)}`;
}

/** Trendzeile: `fällt um 4,3 pro Monat` */
export function trendText(ex: PopExplain, lang: Lang = getLang()): string {
  if (ex.pending) return '';
  const key = ex.direction === 'up' ? 'pop.ui.up' : ex.direction === 'down' ? 'pop.ui.down' : 'pop.ui.flat';
  return popText(key, { v: popNum(Math.abs(ex.perMonth), false, lang) }, lang);
}

/** Zeilen der Prognose (Monat, drei Monate, Schwelle, Abwanderung/Zuzug, Grenzen) */
export function forecastLines(ex: PopExplain, lang: Lang = getLang()): string[] {
  if (ex.pending) return [];
  const out: string[] = [];
  if (ex.clamped === 'ceiling') out.push(popText('pop.ui.ceiling', {}, lang));
  else if (ex.clamped === 'floor') out.push(popText('pop.ui.floor', {}, lang));
  else if (ex.direction !== 'flat') {
    out.push(popText('pop.ui.forecast1', { v: Math.round(ex.forecast1) }, lang));
    out.push(popText('pop.ui.forecast3', { v: Math.round(ex.forecast3) }, lang));
  }
  if (ex.secondsToThreshold !== null) {
    out.push(popText(ex.belowThreshold ? 'pop.ui.toThresholdUp' : 'pop.ui.toThreshold', { threshold: ex.threshold, time: popDuration(ex.secondsToThreshold, lang) }, lang));
  }
  if (ex.leaving.active) out.push(popText('pop.ui.leave', { seconds: ex.leaving.secondsPerPeasant }, lang));
  else if (ex.growth.active) out.push(popText('pop.ui.grow', { seconds: Math.round(ex.growth.secondsPerPeasant * 10) / 10 }, lang));
  return out;
}

/** Kurze Erklärung der Zeitabläufe (Monatslänge, Bewertungstakt) */
export function timeNote(ex: PopExplain, lang: Lang = getLang()): string[] {
  return [
    popText('pop.ui.noTarget', {}, lang),
    popText('pop.ui.timeNote', { seconds: ex.secondsPerMonth, step: ex.stepSeconds, perStep: popNum(ex.perStep, true, lang) }, lang),
    popText('pop.ui.thresholdNote', { threshold: ex.threshold }, lang),
  ];
}

const factorRich = (f: PopFactorInfo, v: PopView, lang: Lang): Rich => [{ icon: popFactorIcon(f.key, 18), text: factorLabel(f, v, lang) }];

/** Hover-Zusammenfassung an der Beliebtheitsanzeige: wichtigste positive und negative Faktoren, Hinweis, Warnungen */
export function popularityTipDoc(v: PopView, lang: Lang = getLang()): Doc {
  const ex = explainPopularity(v);
  const tx = popularityTexts(ex, lang);
  const trend = trendText(ex, lang);
  const blocks: Doc['blocks'] = [];
  blocks.push({ k: 'rule', text: tx.headline });
  const rows = (list: PopFactorInfo[]): Rich[][] =>
    list.slice(0, 3).map((f) => [factorRich(f, v, lang), [{ text: effectText(f.value, lang), cls: effectClass(f.value), bold: true }]]);
  if (ex.positives.length) blocks.push({ k: 'h', text: popText('pop.ui.positive', {}, lang), level: 3 }, { k: 'table', head: [[popText('pop.ui.factor', {}, lang)], [popText('pop.ui.effect', {}, lang)]], rows: rows(ex.positives) });
  if (ex.negatives.length) blocks.push({ k: 'h', text: popText('pop.ui.negative', {}, lang), level: 3 }, { k: 'table', head: [[popText('pop.ui.factor', {}, lang)], [popText('pop.ui.effect', {}, lang)]], rows: rows(ex.negatives) });
  const lines = forecastLines(ex, lang);
  if (lines.length) blocks.push({ k: 'list', items: lines.slice(0, 2).map((t) => [t]) });
  for (const w of tx.warnings.filter((x) => x.severity !== 'info').slice(0, 2)) blocks.push({ k: 'rule', text: w.text, tone: 'warn' });
  blocks.push({ k: 'tip', label: '', text: popText('pop.ui.hoverMore', {}, lang) });
  return {
    title: `${popText('pop.ui.title', {}, lang)} ${popNum(ex.popularity, false, lang)}`,
    icon: popFaceIcon(ex.popularity, 44),
    subtitle: trend ? `${popText(`pop.ui.level.${ex.level}`, {}, lang)} · ${trend}` : popText(`pop.ui.level.${ex.level}`, {}, lang),
    blocks,
  };
}
