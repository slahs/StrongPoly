import { TICK_RATE } from '../data/balance';

/**
 * Darstellungsuhr für die Interpolation zwischen Snapshots (rein rechnerisch, ohne DOM).
 *
 * Statt die Zeit seit dem Eintreffen des letzten Snapshots zu messen (das springt bei jedem Paket, sobald
 * Worker-Timer, Übertragung oder Frame-Takt schwanken), läuft eine eigene, gleichmäßige Uhr in Sim-Ticks:
 *  - `est` schätzt den aktuellen Sim-Tick und schreitet mit Frame-Zeit × Spielgeschwindigkeit fort.
 *  - Jeder Snapshot korrigiert `est` nur sanft (Zeitraffer von höchstens ±6 % (bei großem Rückstand 25 %), keine Sprünge); frühe
 *    Ankünfte ziehen schnell, späte langsam nach, so folgt die Uhr dem Takt der schnellsten Pakete.
 *  - Gezeichnet wird `render = est − delay` mit einer Verzögerung von mindestens einem Tick plus gemessenem
 *    Verspätungs-Spitzenwert, damit zu jedem Zeitpunkt zwei bekannte Zustände zum Mischen vorliegen.
 *  - Pause friert die Uhr ein, ein Voll-Snapshot (Start/Reconnect) setzt sie neu.
 */
export class RenderClock {
  /** geschätzter aktueller Sim-Tick (fortlaufend, in Ticks) */
  est = 0;
  /** Tick des neuesten Snapshots */
  latest = 0;
  /** Spitzenwert der Verspätung eintreffender Snapshots (Ticks, langsam abklingend) */
  jitter = 0;
  /** noch nicht angewendete Korrektur (Ticks), wird mit begrenzter Rate eingearbeitet */
  private adj = 0;
  ready = false;
  /** Zähler für Diagnose: harte Neusynchronisationen */
  resyncs = 0;
  /** letzter Fehler e = Snapshot-Tick − Schätzung bei Ankunft (Ticks) */
  lastError = 0;
  /** Abstand der letzten beiden Ankünfte (ms) */
  lastGapMs = 0;
  private lastArrivalMs = 0;
  paused = false;

  static readonly MIN_DELAY = 1.0;
  static readonly MAX_DELAY = 3.2;
  /** wie weit über den neuesten Snapshot hinaus höchstens extrapoliert wird (Ticks) */
  static readonly MAX_EXTRAP = 0.3;

  /** Verzögerung der Darstellung gegenüber der Schätzung (Ticks), ändert sich nur langsam (kein Zeitsprung) */
  delay = RenderClock.MIN_DELAY + 0.05;

  /** Sollverzögerung aus dem gemessenen Verspätungs-Spitzenwert */
  get targetDelay(): number {
    return Math.min(RenderClock.MAX_DELAY, RenderClock.MIN_DELAY + this.jitter + 0.05);
  }

  /** Darstellungszeit in Ticks */
  get render(): number {
    return this.est - this.delay;
  }

  /** Anteil des laufenden Ticks seit dem neuesten Snapshot (0..1,15), für Effekte ohne Verlauf (Projektile, Bauzeit) */
  get alpha(): number {
    return Math.max(0, Math.min(1.15, this.est - this.latest));
  }

  reset(tick: number): void {
    this.est = tick;
    this.latest = tick;
    this.adj = 0;
    this.jitter = 0;
    this.delay = this.targetDelay;
    this.ready = true;
    this.lastArrivalMs = 0;
  }

  /** Pro Frame (vor dem Einlesen der Snapshots): Uhr um die Frame-Zeit weiterstellen. */
  advance(dtSec: number, speed: number, paused: boolean): void {
    this.paused = paused;
    if (!this.ready || paused) return;
    const dtTicks = Math.max(0, Math.min(1, dtSec)) * TICK_RATE * speed;
    // Korrektur mit höchstens 6 % (bei großem Rückstand 25 %) Zeitraffer einarbeiten
    const lim = dtTicks * (0.06 + 0.19 * Math.min(1, Math.abs(this.adj)));
    const step = Math.max(-lim, Math.min(lim, this.adj));
    this.adj -= step;
    this.est += dtTicks + step;
    // Verzögerung langsam nachführen: wächst höchstens mit 0,5 Ticks/s (Pufferbedarf), sinkt mit 0,1 Ticks/s
    const dd = this.targetDelay - this.delay;
    const dts = Math.min(1, dtSec);
    this.delay += Math.max(-0.1 * dts, Math.min(0.5 * dts, dd));
    // nie weiter laufen als bis zur begrenzten Extrapolation
    const cap = this.latest + this.delay + RenderClock.MAX_EXTRAP;
    if (this.est > cap) this.est = cap;
  }

  /**
   * Ein Snapshot ist eingetroffen. `lateMs`: wie lange vor dem aktuellen Frame er ankam (0 = jetzt),
   * `arrivalMs`: Ankunftszeit (nur für den Abstand der Pakete).
   */
  onSnapshot(tick: number, lateMs: number, speed: number, arrivalMs = 0): void {
    const rate = TICK_RATE * speed;
    if (arrivalMs) {
      this.lastGapMs = this.lastArrivalMs ? arrivalMs - this.lastArrivalMs : 0;
      this.lastArrivalMs = arrivalMs;
    }
    if (tick > this.latest || !this.ready) this.latest = tick;
    if (!this.ready) {
      this.reset(tick);
      return;
    }
    if (this.paused) return;
    const estAtArrival = this.est - (Math.max(0, lateMs) / 1000) * rate;
    const e = tick - estAtArrival;
    this.lastError = e;
    // Schwelle: 0,4 s Echtzeit (mindestens 4 Ticks), damit bei hoher Spielgeschwindigkeit kurze Hänger nicht gleich neu synchronisieren
    if (Math.abs(e) > Math.max(4, 0.4 * rate)) {
      // Aussetzer, Wechsel der Geschwindigkeit oder alter Zustand: hart neu synchronisieren
      this.est = tick + (Math.max(0, lateMs) / 1000) * rate;
      this.adj = 0;
      this.resyncs++;
      return;
    }
    if (e > 0) this.adj += e * 0.35;
    else this.adj += e * 0.03;
    // Verspätung gegenüber dem Takt der frühesten Pakete bestimmt den Puffer
    const late = Math.max(0, -e);
    this.jitter = Math.min(2, Math.max(late, this.jitter * 0.99));
  }
}

/** Einträge je Einheit in der Positionshistorie */
export const HIST = 4;

/** Höchstabstand zwischen zwei aufeinanderfolgenden Positionen, ab dem nicht mehr interpoliert wird (Teleport). */
export function teleportLimit(tickGap: number): number {
  return 1 + 0.5 * Math.max(1, tickGap);
}
