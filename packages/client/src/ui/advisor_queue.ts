/**
 * Warteschlange und Entprellung der Beraterhinweise (reine Logik ohne DOM, deshalb testbar).
 *
 * - Ereignisse werden als Kandidaten angeboten; ein Kandidat gleicher Art (`slot`) ersetzt den wartenden.
 * - Abklingzeit je Art (`slot`): Nach einer Meldung wird dieselbe Art für die Abklingzeit nicht mehr angenommen.
 * - Ein Zeitfenster pro Meldung: Nach jeder Meldung bleibt der Berater eine Weile still (Sprech-/Lesezeit),
 *   damit nie mehrere Hinweise gleichzeitig oder im Sekundentakt kommen.
 * - Priorität: kritisch (2) > wichtig (1) > normal (0). Kritisches kommt auch innerhalb des Zeitfensters durch und
 *   verdrängt leisere Hinweise, solange nicht gerade eine kritische Meldung läuft (dann kurzer Mindestabstand).
 * - Veraltete Kandidaten verfallen (Lebensdauer je Priorität) oder werden verworfen, wenn ihre Bedingung nicht mehr gilt.
 * - Mehrfachereignisse gleicher Art werden zu einer Sammelmeldung gebündelt (`<id>.multi`).
 */
import type { Params } from '@strongpoly/shared';
import { ADVISOR_EVENT_BY_ID } from '@strongpoly/shared';
import type { AdvisorPrio } from '@strongpoly/shared';

export interface AdvisorCandidate {
  /** Ereignis-ID aus `ADVISOR_EVENTS` */
  id: string;
  /** Instanz, z. B. `res.low:0` oder `attack:3`: Abklingzeit und Ersetzung gelten je Slot */
  slot: string;
  params: Params;
  /** Name des betroffenen Dings für Sammelmeldungen (z. B. „Holz“, „Bäckerei“) */
  item?: string;
  x?: number;
  y?: number;
  /** Gebäude, das beim Klick angewählt werden kann */
  building?: number;
  /** Tick der Entstehung */
  tick: number;
  /** gilt die Bedingung noch? (wird beim Ausliefern geprüft) */
  valid?: () => boolean;
}

export interface Delivery extends AdvisorCandidate {
  prio: AdvisorPrio;
  /** Sammelmeldung aus diesen Kandidaten (>1) */
  merged: AdvisorCandidate[];
}

/** Lebensdauer wartender Kandidaten in Ticks */
export const TTL: Record<AdvisorPrio, number> = { 0: 600, 1: 1200, 2: 3000 };
/** Mindest-Zeitfenster nach einer Meldung in Ticks (Lesezeit) */
export const WINDOW: Record<AdvisorPrio, number> = { 0: 150, 1: 100, 2: 40 };
/** Standard-Abklingzeit gleicher Meldungen in Ticks */
export const COOLDOWN: Record<AdvisorPrio, number> = { 0: 3600, 1: 1800, 2: 900 };
/** Mindestabstand zweier kritischer Meldungen in Ticks */
export const CRITICAL_GAP = 30;
const MAX_PENDING = 10;

export function prioOf(id: string): AdvisorPrio {
  return ADVISOR_EVENT_BY_ID[id]?.prio ?? 0;
}

/** Bündelgruppe: Ursachen-Varianten (`.plain`, `.noprod`) gehören zu derselben Sammelmeldung */
export function groupOf(id: string): string {
  return id.replace(/\.(plain|noprod)$/, '');
}

export function cooldownOf(id: string): number {
  const d = ADVISOR_EVENT_BY_ID[id];
  return d?.cooldown ?? COOLDOWN[d?.prio ?? 0];
}

/** Zeitfenster nach einer Meldung: Lesezeit nach Textlänge, mindestens das Prioritätsfenster */
export function windowFor(prio: AdvisorPrio, textLength: number): number {
  return Math.max(WINDOW[prio], Math.ceil(textLength / 14) * 10);
}

export class AdvisorQueue {
  private pending: AdvisorCandidate[] = [];
  private lastBySlot = new Map<string, number>();
  private nextFree = 0;
  private lastPrio: AdvisorPrio = 0;
  private lastTick = -1e9;

  /** Wartende Kandidaten (für Tests und Anzeige) */
  get waiting(): readonly AdvisorCandidate[] {
    return this.pending;
  }

  /** Wurde diese Art vor Kurzem gemeldet? */
  coolingDown(slot: string, id: string, tick: number): boolean {
    const prev = this.lastBySlot.get(slot);
    return prev !== undefined && tick - prev < cooldownOf(id);
  }

  /** Kandidat anbieten; false, wenn er wegen der Abklingzeit verworfen wurde */
  offer(c: AdvisorCandidate, tick: number): boolean {
    if (this.coolingDown(c.slot, c.id, tick)) return false;
    const i = this.pending.findIndex((p) => p.slot === c.slot);
    if (i >= 0) this.pending[i] = c;
    else this.pending.push(c);
    if (this.pending.length > MAX_PENDING) {
      // niedrigste Priorität, älteste zuerst, fliegt raus
      let worst = 0;
      for (let k = 1; k < this.pending.length; k++) {
        const a = this.pending[k];
        const b = this.pending[worst];
        if (prioOf(a.id) < prioOf(b.id) || (prioOf(a.id) === prioOf(b.id) && a.tick < b.tick)) worst = k;
      }
      this.pending.splice(worst, 1);
    }
    return true;
  }

  /** Verfallene und ungültige Kandidaten entfernen */
  private prune(tick: number): void {
    this.pending = this.pending.filter((c) => {
      if (tick - c.tick > TTL[prioOf(c.id)]) return false;
      if (c.valid && !c.valid()) return false;
      return true;
    });
  }

  /**
   * Nächste auszuliefernde Meldung oder null. Wird regelmäßig (z. B. jede Sekunde) gerufen.
   * Nach dem Bauen des Texts muss `delivered` gerufen werden, damit das Zeitfenster beginnt.
   */
  next(tick: number): Delivery | null {
    this.prune(tick);
    if (!this.pending.length) return null;
    // beste zuerst: Priorität, dann älteste
    const order = [...this.pending].sort((a, b) => prioOf(b.id) - prioOf(a.id) || a.tick - b.tick);
    const head = order[0];
    const prio = prioOf(head.id);
    if (tick < this.nextFree) {
      // Kritisches darf das Zeitfenster leiserer Meldungen durchbrechen; zwei kritische brauchen einen Mindestabstand
      const preempt = prio === 2 && (this.lastPrio < 2 || tick - this.lastTick >= CRITICAL_GAP);
      if (!preempt) return null;
    }
    // Bündeln: gleiche ID mehrfach und Sammelzeile vorhanden
    const group = groupOf(head.id);
    const same = this.pending.filter((c) => groupOf(c.id) === group);
    this.pending = this.pending.filter((c) => groupOf(c.id) !== group);
    if (same.length > 1 && ADVISOR_EVENT_BY_ID[`${group}.multi`]) {
      same.sort((a, b) => a.tick - b.tick);
      const first = same[0];
      const names = same.map((c) => c.item).filter((s): s is string => !!s);
      return { ...first, id: `${group}.multi`, slot: `${group}.multi`, params: { list: joinList(names), n: same.length }, prio, merged: same };
    }
    // Ohne Sammelzeile: nur der erste, die übrigen Gleichen bleiben für später
    const first = same[0];
    for (const c of same.slice(1)) this.pending.push(c);
    return { ...first, prio, merged: [first] };
  }

  /** Meldung wurde ausgeliefert: Abklingzeit der beteiligten Arten und Zeitfenster starten */
  delivered(d: Delivery, tick: number, textLength: number): void {
    for (const c of d.merged) this.lastBySlot.set(c.slot, tick);
    this.lastBySlot.set(d.slot, tick);
    this.nextFree = tick + windowFor(d.prio, textLength);
    this.lastPrio = d.prio;
    this.lastTick = tick;
  }

  /** Wartenden Kandidaten einer Art zurückziehen (z. B. weil ein schlimmerer an seine Stelle tritt) */
  withdraw(slot: string): void {
    this.pending = this.pending.filter((c) => c.slot !== slot);
  }

  /** Abklingzeit einer Art zurücksetzen (z. B. wenn sich die Lage grundlegend ändert) */
  forget(slot: string): void {
    this.lastBySlot.delete(slot);
  }

  clear(): void {
    this.pending = [];
  }
}

/** „A, B und C“ (Deutsch) – für Sammelmeldungen; die Sprache des Texts bleibt dem Aufrufer überlassen */
export function joinList(items: string[], and = 'und'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}
