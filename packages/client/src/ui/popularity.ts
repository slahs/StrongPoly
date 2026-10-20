/**
 * Beliebtheit: Hover-Zusammenfassung und Detailansicht. Beides zeigt dieselben Zahlen aus `explainPopularity`
 * (Faktoren der Simulation); die Anzeige rechnet nichts selbst.
 */
import { explainPopularity, getLang, popNum, popText, popularityTexts } from '@strongpoly/shared';
import type { PlayerView, PopExplain, PopFactorInfo, PopView } from '@strongpoly/shared';
import { renderDoc } from './doc/render';
import { h } from './dom';
import { iconEl, popFaceIcon, popFactorIcon } from './icons';
import { effectClass, effectText, factorLabel, forecastLines, popularityTipDoc, timeNote, trendText } from './popularity_model';

/** Inhalt für `attachTooltip` an der Beliebtheitsanzeige */
export function popularityTooltip(view: () => PopView | null): () => HTMLElement | null {
  return () => {
    const v = view();
    return v ? renderDoc(popularityTipDoc(v, getLang()), { compact: true }) : null;
  };
}

export interface PopularityHooks {
  /** Verwaltung (Steuern/Rationen) öffnen */
  openAdmin?: () => void;
  /** Detailansicht schließen */
  close?: () => void;
}

const MAX_BAR = 12;

function factorRow(f: PopFactorInfo, v: PopView, ex: PopExplain): HTMLElement[] {
  const lang = getLang();
  const label = h('span', { class: 'pd-fl' }, factorLabel(f, v, lang));
  const notes: string[] = [];
  if (f.atCap && f.cap !== undefined) notes.push(popText('pop.ui.cap', { cap: f.cap }, lang));
  else if (f.cap !== undefined && Math.abs(f.value) > 0.05) notes.push(popText('pop.ui.capOf', { cap: f.cap }, lang));
  if (f.blocked) notes.push(popText('pop.ui.blocked', {}, lang));
  if (ex.mainNegative?.key === f.key) notes.push(popText('pop.ui.mainNeg', {}, lang));
  else if (ex.mainPositive?.key === f.key && ex.negatives.length === 0) notes.push(popText('pop.ui.mainPos', {}, lang));
  const cls = effectClass(f.value);
  const width = Math.min(100, (Math.abs(f.value) / MAX_BAR) * 100);
  return [
    iconEl(popFactorIcon(f.key, 22)),
    h('span', { class: 'pd-fn' }, label, notes.length ? h('span', { class: 'pd-note', text: notes.join(' · ') }) : null),
    h('span', { class: 'pd-bar' }, h('i', { class: cls, style: `width:${width}%` })),
    h('b', { class: `pd-val ${cls}`, text: effectText(f.value, lang) }),
  ];
}

function section(title: string, ...kids: (Node | null)[]): HTMLElement {
  return h('div', { class: 'pd-sec' }, h('h4', { text: title }), ...kids);
}

/** Detailansicht: aktuelle Beliebtheit, Entwicklung, positive/negative Faktoren, Warnungen, Hinweis, Stellschrauben */
export function renderPopularityDetail(el: HTMLElement, v: PlayerView, hooks: PopularityHooks = {}): void {
  const lang = getLang();
  const ex = explainPopularity(v);
  const tx = popularityTexts(ex, lang);
  const trend = trendText(ex, lang);
  const cls = ex.direction === 'up' ? 'pos' : ex.direction === 'down' ? 'neg' : '';

  const L = h('div', { class: 'pd-col pd-l' });
  const Rr = h('div', { class: 'pd-col pd-r' });
  el.classList.add('pd');
  el.append(h('div', { class: 'pd-cols' }, L, Rr));
  // Kopf: Gesicht, Zahl, Stimmungswort, Trend
  L.append(
    h('div', { class: 'pd-head' },
      h('span', { class: 'face', html: popFaceIcon(ex.popularity, 56) }),
      h('div', { class: 'pd-headtext' },
        h('div', { class: 'pd-num', html: `<b>${popNum(ex.popularity, false, lang)}</b> / 100` }),
        h('div', { class: 'pd-level', text: popText(`pop.ui.level.${ex.level}`, {}, lang) }),
        trend ? h('div', { class: `pd-trend ${cls}`, text: `${ex.direction === 'up' ? '▲' : ex.direction === 'down' ? '▼' : '■'} ${trend}` }) : null,
      ),
    ),
    // Balken 0..100 mit Schwelle 50, Marke für die Prognose in einem Monat
    h('div', { class: 'pd-meter', title: `${popText('pop.ui.thresholdNote', { threshold: ex.threshold }, lang)}` },
      h('i', { class: `fill lv-${ex.level}`, style: `width:${ex.popularity}%` }),
      h('i', { class: 'mark thr', style: `left:${ex.threshold}%` }),
      ex.direction !== 'flat' && !ex.pending ? h('i', { class: 'mark fc', style: `left:${ex.forecast1}%` }) : null,
    ),
  );
  L.append(h('div', { class: 'pd-hint', text: tx.headline }));

  // Entwicklung / Prognose
  const lines = forecastLines(ex, lang);
  if (!ex.pending) {
    L.append(
      section(
        popText('pop.ui.trend', {}, lang),
        h('div', { class: 'pd-trendline' }, h('b', { class: cls, text: `${popNum(ex.perMonth, true, lang)} ${popText('pop.ui.perMonth', {}, lang)}` }), h('span', { class: 'crumb', text: ` (${popNum(ex.sumPositive, true, lang)} / ${popNum(ex.sumNegative, true, lang)})` })),
        lines.length ? h('ul', { class: 'pd-list' }, ...lines.map((t) => h('li', { text: t }))) : null,
        h('div', { class: 'pd-small' }, ...timeNote(ex, lang).map((t) => h('div', { text: t }))),
      ),
    );
  }

  // Faktoren
  const table = (list: PopFactorInfo[]): HTMLElement => {
    const g = h('div', { class: 'pd-grid' });
    for (const f of list) g.append(...factorRow(f, v, ex));
    return g;
  };
  const head = h('div', { class: 'pd-colhead' }, h('span', { text: popText('pop.ui.factor', {}, lang) }), h('span', { text: popText('pop.ui.effect', {}, lang) }));
  Rr.append(section(popText('pop.ui.positive', {}, lang), ex.positives.length ? head.cloneNode(true) : null, ex.positives.length ? table(ex.positives) : h('div', { class: 'crumb', text: popText('pop.ui.none', {}, lang) })));
  Rr.append(section(popText('pop.ui.negative', {}, lang), ex.negatives.length ? head.cloneNode(true) : null, ex.negatives.length ? table(ex.negatives) : h('div', { class: 'crumb', text: popText('pop.ui.none', {}, lang) })));
  const zero = ex.factors.filter((f) => Math.abs(f.value) <= 0.05).map((f) => factorLabel(f, v, lang));
  Rr.append(
    h('div', { class: 'pd-sum' }, h('span', { text: popText('pop.ui.sum', {}, lang) }), h('span', { class: 'pd-small', text: zero.length ? `(${zero.join(', ')}: 0)` : '' }), h('b', { class: `pd-val ${cls}`, text: `${popNum(ex.perMonth, true, lang)} ${popText('pop.ui.perMonth', {}, lang)}` })),
  );

  // Warnungen
  if (tx.warnings.length) {
    Rr.append(section(popText('pop.ui.warnings', {}, lang), ...tx.warnings.map((w) => h('div', { class: `pd-warn ${w.severity}`, text: w.text }))));
  }

  // Stellschrauben
  const advice = tx.advice.filter((a) => ex.level !== 'great' || ex.direction === 'down').slice(0, 5);
  const adv = section(popText('pop.ui.advice', {}, lang));
  if (!advice.length) adv.append(h('div', { class: 'crumb', text: popText('pop.ui.noAdvice', {}, lang) }));
  else adv.append(h('ul', { class: 'pd-list adv' }, ...advice.map((a) => h('li', { class: a.action, text: a.text }))));
  if (hooks.openAdmin && advice.some((a) => a.action === 'admin')) adv.append(h('button', { class: 'small', text: popText('pop.ui.openAdmin', {}, lang), onclick: () => hooks.openAdmin?.() }));
  Rr.append(adv);
}

/** Kurzform für die Bergfried-Kontextansicht: dieselben Zahlen, aber knapper (Zahl, Trend, Hauptursache) */
export function renderPopularitySummary(el: HTMLElement, v: PlayerView): void {
  const lang = getLang();
  const ex = explainPopularity(v);
  const trend = trendText(ex, lang);
  const cls = ex.direction === 'up' ? 'pos' : ex.direction === 'down' ? 'neg' : '';
  el.append(
    h('div', { class: 'popwrap small' },
      h('span', { class: 'face', html: popFaceIcon(ex.popularity, 40) }),
      h('div', {},
        h('b', { text: `${popText('pop.ui.title', {}, lang)} ${popNum(ex.popularity, false, lang)}` }),
        h('div', { class: cls, text: trend ? `${popNum(ex.perMonth, true, lang)} ${popText('pop.ui.perMonth', {}, lang)}` : popText('pop.ui.flat', {}, lang) }),
      ),
    ),
    h('div', { class: 'crumb', text: popularityTexts(ex, lang).headline }),
  );
}

