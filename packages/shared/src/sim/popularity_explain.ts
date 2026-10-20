/**
 * Erklärung der Beliebtheit für Anzeige und Berater: reine Funktion ohne DOM und ohne eigene Formeln.
 *
 * Grundlage sind die Faktoren, die die Simulation selbst berechnet (`popularityFactors` in `popularity.ts`, geliefert
 * in `PlayerView.factors`) und dieselben Konstanten aus `data/balance.ts`. Die Anzeige rechnet also nichts nach,
 * was der Sim widersprechen könnte; sie ordnet, benennt und prognostiziert nur.
 *
 * So bewegt sich die Beliebtheit wirklich (siehe `applyInterval`):
 * - Alle `POP_INTERVAL` Ticks (10 s) werden die Faktoren neu bewertet. Ihre Summe ist die Änderung PRO MONAT
 *   (`TICKS_PER_MONTH` Ticks = 60 s bei Geschwindigkeit 1x); pro Auswertung kommt ein Sechstel davon dazu.
 * - Es gibt KEINE Annäherung an einen Zielwert: Die Beliebtheit steigt oder fällt linear, solange die Summe
 *   positiv oder negativ bleibt, und wird nur auf 0..100 begrenzt. `PlayerView.popDelta` (intern `popTarget`) ist
 *   diese Summe, kein Zielwert der Beliebtheit.
 * - Obergrenzen wirken je Faktor: gute Dinge (`POP_GOOD_CAP`), schlechte Dinge (`POP_BAD_CAP`), Religion
 *   (`RELIGION_POP_CAP`).
 * - Unter `POP_THRESHOLD` wandert alle `LEAVE_INTERVAL_TICKS` Ticks ein Bauer ab; darüber kommen Neue, solange Platz ist.
 */
import {
  ALE_POP_MAX,
  LEAVE_INTERVAL_TICKS,
  POP_BAD_CAP,
  POP_GOOD_CAP,
  POP_INTERVAL,
  POP_STEPS_PER_MONTH,
  POP_THRESHOLD,
  RATION_FOOD,
  RATION_POP,
  RELIGION_POP,
  RELIGION_POP_CAP,
  GOOD_POP,
  TAX_GOLD,
  TAX_LEVELS,
  TAX_POP,
  TICKS_PER_MONTH,
  VARIETY_POP,
} from '../data/balance';
import { FOOD_RES } from '../data/resources';
import { spawnIntervalTicks } from './popularity';

/** Was die Erklärung vom Spieler-Zustand braucht (`PlayerView` erfüllt das). */
export interface PopView {
  popularity: number;
  popDelta: number;
  factors: readonly { key: string; label: string; value: number }[];
  tax: number;
  ration: number;
  peasants: number;
  housing: number;
  foodShort: boolean;
  foodTypes: number;
  aleCover: number;
  relCover: number;
}

export type PopCategory = 'food' | 'tax' | 'ale' | 'religion' | 'fear' | 'crowd' | 'events';
export type PopLevel = 'great' | 'good' | 'ok' | 'low' | 'critical';

export interface PopFactorInfo {
  key: string;
  label: string;
  /** Einfluss auf die Beliebtheit in Punkten pro Monat */
  value: number;
  category: PopCategory;
  /** Obergrenze des Faktors, falls er eine hat */
  cap?: number;
  /** Obergrenze erreicht: weitere Verbesserung bringt nichts mehr */
  atCap: boolean;
  /** Wirkung entfällt (z. B. Bestechung nicht bezahlbar) */
  blocked: boolean;
}

export interface PopWarning {
  code: 'hunger' | 'leaving' | 'nearThreshold' | 'critical' | 'bribeBlocked' | 'crowded' | 'housingFull' | 'floor';
  severity: 'critical' | 'warn' | 'info';
  params: Record<string, number | string>;
}

export interface PopAdvice {
  code: 'tax' | 'ration' | 'food' | 'variety' | 'ale' | 'religion' | 'good' | 'bad' | 'housing' | 'bribe';
  /** zu erwartender Gewinn in Punkten pro Monat (so gut die Daten ihn hergeben) */
  gain: number;
  /** Wo man handeln kann: Verwaltung (Steuern/Rationen) oder Bauen */
  action: 'admin' | 'build';
  params: Record<string, number | string>;
}

export interface PopExplain {
  /** noch keine Auswertung der Sim vorhanden (erste 10 Sekunden) */
  pending: boolean;
  /** aktuelle Beliebtheit 0..100 */
  popularity: number;
  level: PopLevel;
  /** Summe der Faktoren = Änderung pro Monat (Spielmonat) */
  perMonth: number;
  /** dasselbe pro Minute bei Geschwindigkeit 1x */
  perMinute: number;
  /** Länge eines Spielmonats in Sekunden bei 1x */
  secondsPerMonth: number;
  /** Änderung je Auswertung (`stepSeconds`) */
  perStep: number;
  stepSeconds: number;
  direction: 'up' | 'down' | 'flat';
  /** Beliebtheit in einem bzw. drei Monaten, falls alles bleibt, begrenzt auf 0..100 */
  forecast1: number;
  forecast3: number;
  /** Höchst- bzw. Tiefstwert erreicht und die Summe schiebt weiter dagegen */
  clamped: 'floor' | 'ceiling' | null;
  /** Sekunden bis die Schwelle (`POP_THRESHOLD`) unter-/überschritten wird; null, wenn nicht absehbar */
  secondsToThreshold: number | null;
  threshold: number;
  belowThreshold: boolean;
  /** Abwanderung: ein Bauer alle `secondsPerPeasant` Sekunden */
  leaving: { active: boolean; secondsPerPeasant: number };
  growth: { active: boolean; secondsPerPeasant: number };
  /** alle Faktoren, nach Betrag absteigend */
  factors: PopFactorInfo[];
  positives: PopFactorInfo[];
  negatives: PopFactorInfo[];
  sumPositive: number;
  sumNegative: number;
  mainNegative: PopFactorInfo | null;
  mainPositive: PopFactorInfo | null;
  /** Schlüssel des Hinweistexts (siehe `data/popularity_text.ts`) und seine Parameter */
  headline: { key: string; params: Record<string, number | string> };
  warnings: PopWarning[];
  advice: PopAdvice[];
}

const CATEGORY: Record<string, PopCategory> = {
  ration: 'food',
  variety: 'food',
  tax: 'tax',
  ale: 'ale',
  religion: 'religion',
  good: 'fear',
  bad: 'fear',
  crowd: 'crowd',
  events: 'events',
};

const EPS = 1e-9;
const FLAT = 0.05;

export function popLevel(popularity: number): PopLevel {
  return popularity >= 75 ? 'great' : popularity >= 60 ? 'good' : popularity >= POP_THRESHOLD ? 'ok' : popularity >= 25 ? 'low' : 'critical';
}

function info(f: { key: string; label: string; value: number }, v: PopView): PopFactorInfo {
  let cap: number | undefined;
  let atCap = false;
  let blocked = false;
  if (f.key === 'good') {
    cap = POP_GOOD_CAP;
    atCap = f.value >= POP_GOOD_CAP - EPS;
  } else if (f.key === 'bad') {
    cap = POP_BAD_CAP;
    atCap = f.value <= -POP_BAD_CAP + EPS;
  } else if (f.key === 'religion') {
    cap = RELIGION_POP_CAP;
    atCap = v.relCover > 0 && f.value / v.relCover >= RELIGION_POP_CAP - EPS;
  } else if (f.key === 'tax') {
    blocked = v.tax < 0 && f.value === 0;
  }
  return { key: f.key, label: f.label, value: f.value, category: CATEGORY[f.key] ?? 'events', cap, atCap, blocked };
}

/** Erklärung zu den echten Sim-Werten. Rein, ohne Seiteneffekte. */
export function explainPopularity(v: PopView): PopExplain {
  const pending = v.factors.length === 0;
  const secondsPerMonth = TICKS_PER_MONTH / 10;
  const stepSeconds = POP_INTERVAL / 10;
  const all = v.factors.map((f) => info(f, v));
  // Summe in derselben Reihenfolge wie die Sim (`popularityTarget`), damit sie bitgleich ist
  let sum = 0;
  for (const f of all) sum += f.value;
  const perMonth = pending ? 0 : sum;
  const perStep = perMonth / POP_STEPS_PER_MONTH;
  const pop = Math.max(0, Math.min(100, v.popularity));
  const sorted = [...all].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const positives = sorted.filter((f) => f.value > FLAT);
  const negatives = sorted.filter((f) => f.value < -FLAT);
  const sumPositive = positives.reduce((s, f) => s + f.value, 0);
  const sumNegative = negatives.reduce((s, f) => s + f.value, 0);
  const clamp = (x: number): number => Math.max(0, Math.min(100, x));
  const direction = perMonth > FLAT ? 'up' : perMonth < -FLAT ? 'down' : 'flat';
  const belowThreshold = pop < POP_THRESHOLD;

  // Wann kippt die Stimmung über die Schwelle? Diskret wie die Sim: eine Auswertung alle `stepSeconds`.
  let secondsToThreshold: number | null = null;
  if (!pending && perStep < -EPS && !belowThreshold) secondsToThreshold = (Math.floor((pop - POP_THRESHOLD) / -perStep) + 1) * stepSeconds;
  else if (!pending && perStep > EPS && belowThreshold) secondsToThreshold = Math.ceil((POP_THRESHOLD - pop) / perStep) * stepSeconds;

  const leaving = { active: belowThreshold && v.peasants > 0, secondsPerPeasant: LEAVE_INTERVAL_TICKS / 10 };
  const growing = !belowThreshold && v.peasants < v.housing;
  const growth = { active: growing, secondsPerPeasant: spawnIntervalTicks(pop) / 10 };

  const by = (k: string): PopFactorInfo | undefined => all.find((f) => f.key === k);
  const mainNegative = negatives[0] ?? null;
  const mainPositive = positives[0] ?? null;

  // ---- Warnungen ----
  const warnings: PopWarning[] = [];
  if (v.foodShort) warnings.push({ code: 'hunger', severity: 'critical', params: {} });
  if (leaving.active) warnings.push({ code: 'leaving', severity: 'critical', params: { seconds: leaving.secondsPerPeasant } });
  else if (secondsToThreshold !== null && direction === 'down' && secondsToThreshold <= secondsPerMonth * 3) warnings.push({ code: 'nearThreshold', severity: 'warn', params: { seconds: secondsToThreshold, threshold: POP_THRESHOLD } });
  if (pop < 25) warnings.push({ code: 'critical', severity: 'critical', params: { value: Math.round(pop) } });
  if (by('tax')?.blocked) warnings.push({ code: 'bribeBlocked', severity: 'warn', params: {} });
  if ((by('crowd')?.value ?? 0) < 0) warnings.push({ code: 'crowded', severity: 'warn', params: { peasants: v.peasants, housing: v.housing } });
  if (!belowThreshold && v.peasants >= v.housing && v.housing > 0) warnings.push({ code: 'housingFull', severity: 'info', params: { housing: v.housing } });
  const clampedState: PopExplain['clamped'] = !pending && pop <= 0 && perMonth < 0 ? 'floor' : !pending && pop >= 100 && perMonth > 0 ? 'ceiling' : null;
  if (clampedState === 'floor') warnings.push({ code: 'floor', severity: 'critical', params: {} });

  // ---- Stellschrauben (aus denselben Konstanten wie die Sim) ----
  const advice: PopAdvice[] = [];
  const n = v.peasants;
  const taxes = TAX_LEVELS as readonly number[];
  if (v.tax > taxes[0]) {
    const lower = v.tax - 1;
    const gain = TAX_POP[lower] - TAX_POP[v.tax];
    const goldLoss = n * (TAX_GOLD[v.tax] - TAX_GOLD[lower]);
    if (gain > 0 && v.tax > 0) advice.push({ code: 'tax', gain, action: 'admin', params: { gain, gold: Math.round(goldLoss) } });
    else if (gain > 0 && !by('tax')?.blocked && (direction === 'down' || pop < 60)) advice.push({ code: 'bribe', gain, action: 'admin', params: { gain, gold: Math.round(-goldLoss) } });
  }
  if (v.foodShort) {
    const gain = RATION_POP[v.ration] - RATION_POP[0];
    advice.push({ code: 'food', gain: Math.max(gain, 0), action: 'build', params: { gain: Math.max(gain, 0) } });
  } else if (v.ration < RATION_POP.length - 1) {
    const gain = RATION_POP[v.ration + 1] - RATION_POP[v.ration];
    const food = n * (RATION_FOOD[v.ration + 1] - RATION_FOOD[v.ration]);
    advice.push({ code: 'ration', gain, action: 'admin', params: { gain, food: Math.round(food) } });
  }
  if (!v.foodShort && v.foodTypes < FOOD_RES.length) advice.push({ code: 'variety', gain: VARIETY_POP, action: 'build', params: { gain: VARIETY_POP, types: FOOD_RES.length - v.foodTypes } });
  const ale = by('ale')?.value ?? 0;
  if (ale < ALE_POP_MAX - EPS) {
    const gain = ALE_POP_MAX - ale;
    advice.push({ code: 'ale', gain, action: 'build', params: { gain, cover: Math.round(v.aleCover * 100) } });
  }
  const rel = by('religion');
  if (rel && !(rel.atCap && v.relCover >= 1 - EPS)) {
    // Gewinn durch volle Abdeckung bzw. ein weiteres Gotteshaus, höchstens bis zur Obergrenze
    const pts = v.relCover > 0 ? rel.value / v.relCover : 0;
    const gain = v.relCover > 0 ? Math.min(RELIGION_POP_CAP, pts) * (1 - Math.min(1, v.relCover)) : RELIGION_POP.church;
    if (gain > EPS) advice.push({ code: 'religion', gain, action: 'build', params: { gain, cover: Math.round(v.relCover * 100) } });
  }
  const good = by('good');
  if (good && !good.atCap) advice.push({ code: 'good', gain: GOOD_POP, action: 'build', params: { gain: GOOD_POP, cap: POP_GOOD_CAP } });
  const bad = by('bad');
  if (bad && bad.value < -FLAT) advice.push({ code: 'bad', gain: -bad.value, action: 'build', params: { gain: -bad.value } });
  const crowd = by('crowd');
  if (crowd && crowd.value < 0) advice.push({ code: 'housing', gain: -crowd.value, action: 'build', params: { gain: -crowd.value, peasants: v.peasants, housing: v.housing } });
  // Zuerst, was die Hauptbelastung betrifft, dann nach Gewinn
  const related: Record<string, string[]> = { tax: ['tax', 'bribe'], ration: ['ration', 'food'], crowd: ['housing'], bad: ['bad'] };
  const mainCodes = related[mainNegative?.key ?? ''] ?? [];
  advice.sort((a, b) => Number(mainCodes.includes(b.code)) - Number(mainCodes.includes(a.code)) || b.gain - a.gain);

  // ---- Hinweistext aus der Hauptursache ----
  const headline = headlineOf({ pending, perMonth, v, mainNegative, mainPositive, direction });

  return {
    pending,
    popularity: pop,
    level: popLevel(pop),
    perMonth,
    perMinute: (perMonth * 60) / secondsPerMonth,
    secondsPerMonth,
    perStep,
    stepSeconds,
    direction,
    forecast1: clamp(pop + perMonth),
    forecast3: clamp(pop + perMonth * 3),
    clamped: clampedState,
    secondsToThreshold,
    threshold: POP_THRESHOLD,
    belowThreshold,
    leaving,
    growth,
    factors: sorted,
    positives,
    negatives,
    sumPositive,
    sumNegative,
    mainNegative,
    mainPositive,
    headline,
    warnings,
    advice,
  };
}

function headlineOf(a: { pending: boolean; perMonth: number; v: PopView; mainNegative: PopFactorInfo | null; mainPositive: PopFactorInfo | null; direction: 'up' | 'down' | 'flat' }): PopExplain['headline'] {
  const { v, mainNegative: neg, mainPositive: pos } = a;
  if (a.pending) return { key: 'pop.head.pending', params: {} };
  if (v.foodShort) return { key: 'pop.head.hunger', params: {} };
  if (a.direction === 'down' && neg) {
    if (neg.key === 'tax') return { key: v.tax >= 3 ? 'pop.head.neg.tax.high' : 'pop.head.neg.tax', params: {} };
    if (neg.key === 'events') return { key: 'pop.head.neg.events', params: { label: neg.label } };
    if (['ration', 'bad', 'crowd'].includes(neg.key)) return { key: `pop.head.neg.${neg.key}`, params: {} };
    return { key: 'pop.head.neg.generic', params: { label: neg.label } };
  }
  if (a.direction === 'up' && pos) {
    if (pos.key === 'events') return { key: 'pop.head.pos.events', params: { label: pos.label } };
    if (['ration', 'variety', 'tax', 'ale', 'religion', 'good'].includes(pos.key)) return { key: `pop.head.pos.${pos.key}`, params: {} };
    return { key: 'pop.head.pos.generic', params: { label: pos.label } };
  }
  if (neg && pos) return { key: 'pop.head.balanced', params: {} };
  return { key: 'pop.head.flat', params: {} };
}
