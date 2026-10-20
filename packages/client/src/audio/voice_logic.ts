/**
 * Reine Logik des Sprachsystems (ohne WebAudio/DOM, getestet in `audio_voice.test.ts`):
 * Entprellung und Prioritäten (`VoiceGate`), Zeilenauswahl ohne Wiederholung (`LinePicker`),
 * Textvergleich Clip/Anfrage, Dauerabschätzung.
 */
import type { VoiceEvent } from '@strongpoly/shared';

export type VoiceCategory = 'advisor' | 'unit';
export type DropReason = 'repeat' | 'same' | 'global-gap' | 'voice-gap' | 'busy' | 'queue-full';

/** Anfrage an das Tor (Zeitangaben in ms) */
export interface GateReq {
  category: VoiceCategory;
  /** Stimme/Gruppe, z. B. 'archer', 'advisor' */
  voice: string;
  /** Zeilenschlüssel */
  key: string;
  /** Ereigniskategorie (Einheiten) – bestimmt die Mindestabstände */
  event?: VoiceEvent;
  /** 0 normal/Hintergrund, 1 wichtig (Spielerrückmeldung), 2 kritisch */
  priority: 0 | 1 | 2;
  /** Wiederholung erzwingen (erneut abspielen) */
  force?: boolean;
}

export interface GateCfg {
  /** Mindestabstand zwischen zwei Einheitenzeilen insgesamt, je Ereignis */
  unitGlobalGap: Record<VoiceEvent, number>;
  /** Mindestabstand je Stimme (Gruppe), je Ereignis */
  unitVoiceGap: Record<VoiceEvent, number>;
  /** gleicher Zeilenschlüssel frühestens nach … */
  keyGap: Record<VoiceCategory, number>;
  /** gleicher Beraterschlüssel bei kritischer Priorität frühestens nach … */
  keyGapCritical: number;
  /** gleichzeitig sprechende Einheitenstimmen */
  maxUnit: number;
  /** Berater: wartende Zeilen und deren Gültigkeit */
  advisorQueue: number;
  advisorQueueTtl: number;
  /** Berater: Pause zwischen zwei Zeilen */
  advisorGap: number;
}

export const GATE_CFG: GateCfg = {
  unitGlobalGap: { select: 280, move: 450, attack: 450, hold: 450, work: 7000, done: 8000, wounded: 4500, special: 6000 },
  unitVoiceGap: { select: 700, move: 900, attack: 900, hold: 900, work: 26000, done: 18000, wounded: 9000, special: 14000 },
  keyGap: { unit: 7000, advisor: 20000 },
  keyGapCritical: 5000,
  maxUnit: 1,
  advisorQueue: 3,
  advisorQueueTtl: 10000,
  advisorGap: 450,
};

interface Active {
  id: number;
  category: VoiceCategory;
  voice: string;
  key: string;
  priority: number;
  end: number;
}

export type Decision = { kind: 'play'; interrupt: number[] } | { kind: 'queue' } | { kind: 'drop'; reason: DropReason };

interface Queued {
  req: GateReq;
  at: number;
}

/**
 * Entscheidet, ob eine Zeile gesprochen werden darf:
 * - nie dieselbe Zeile zweimal hintereinander je Stimme, Wiederholungssperre je Schlüssel
 * - Mindestabstände global und je Stimme (je Ereignisart: Auswahl kurz, Hintergrundgerede selten)
 * - höchstens `maxUnit` Einheitenstimmen gleichzeitig; neue Spielerrückmeldung (Priorität ≥ 1) unterbricht gleich- oder niedrigerrangige
 * - Berater: eine Zeile zugleich, höhere Priorität verdrängt, wichtige Zeilen warten kurz in einer Schlange
 */
export class VoiceGate {
  private active: Active[] = [];
  private queue: Queued[] = [];
  private nextId = 1;
  private lastUnitStart = new Map<VoiceEvent, number>();
  private lastVoiceStart = new Map<string, number>();
  private lastKeyStart = new Map<string, number>();
  private lastKeyOfVoice = new Map<string, string>();
  private lastAdvisorEnd = -1e9;
  /** Zähler für Diagnose */
  dropped: Record<string, number> = {};

  constructor(readonly cfg: GateCfg = GATE_CFG) {}

  private prune(now: number): void {
    const a = this.active;
    let w = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i].end > now) a[w++] = a[i];
      else if (a[i].category === 'advisor') this.lastAdvisorEnd = Math.max(this.lastAdvisorEnd, a[i].end);
    }
    a.length = w;
    this.queue = this.queue.filter((q) => now - q.at < this.cfg.advisorQueueTtl);
  }

  /** Anzahl laufender Zeilen (optional je Kategorie) */
  activeCount(now: number, category?: VoiceCategory): number {
    this.prune(now);
    return category ? this.active.filter((a) => a.category === category).length : this.active.length;
  }

  private drop(reason: DropReason): Decision {
    this.dropped[reason] = (this.dropped[reason] ?? 0) + 1;
    return { kind: 'drop', reason };
  }

  decide(req: GateReq, now: number): Decision {
    this.prune(now);
    const c = this.cfg;
    if (!req.force) {
      const lastKey = this.lastKeyStart.get(req.key);
      const gap = req.category === 'advisor' && req.priority >= 2 ? c.keyGapCritical : c.keyGap[req.category];
      if (lastKey !== undefined && now - lastKey < gap) return this.drop('repeat');
      if (req.category === 'unit' && this.lastKeyOfVoice.get(req.voice) === req.key) return this.drop('same');
    }
    if (req.category === 'unit') {
      const ev = req.event ?? 'select';
      if (!req.force) {
        const lg = this.lastUnitStart.get(ev);
        if (lg !== undefined && now - lg < c.unitGlobalGap[ev]) return this.drop('global-gap');
        const lv = this.lastVoiceStart.get(`${req.voice}.${ev}`);
        if (lv !== undefined && now - lv < c.unitVoiceGap[ev]) return this.drop('voice-gap');
      }
      const mine = this.active.filter((a) => a.category === 'unit');
      if (mine.length >= c.maxUnit) {
        // Spielerrückmeldung (Auswahl/Befehl) unterbricht Hintergrundgerede und gleichrangige ältere Zeilen
        const blockers = mine.filter((a) => a.priority > req.priority || req.priority < 1);
        if (blockers.length > 0) return this.drop('busy');
        return { kind: 'play', interrupt: mine.map((a) => a.id) };
      }
      return { kind: 'play', interrupt: [] };
    }
    // Berater
    const adv = this.active.filter((a) => a.category === 'advisor');
    if (adv.length > 0) {
      if (adv.every((a) => req.priority > a.priority)) return { kind: 'play', interrupt: adv.map((a) => a.id) };
      if (req.priority >= 1) {
        if (this.queue.some((q) => q.req.key === req.key)) return this.drop('repeat');
        if (this.queue.length >= c.advisorQueue) {
          // kritische Zeile verdrängt die schwächste wartende
          const lowest = this.queue.reduce((m, q, i) => (q.req.priority < this.queue[m].req.priority ? i : m), 0);
          if (this.queue[lowest].req.priority < req.priority) this.queue.splice(lowest, 1);
          else return this.drop('queue-full');
        }
        this.queue.push({ req, at: now });
        return { kind: 'queue' };
      }
      return this.drop('busy');
    }
    if (now - this.lastAdvisorEnd < c.advisorGap && req.priority < 2 && !req.force) {
      if (req.priority >= 1 && this.queue.length < c.advisorQueue) {
        this.queue.push({ req, at: now });
        return { kind: 'queue' };
      }
      return this.drop('global-gap');
    }
    return { kind: 'play', interrupt: [] };
  }

  /** Zeile hat begonnen (Dauer in ms); gibt die Kennung zurück. */
  begin(req: GateReq, now: number, durMs: number): number {
    this.prune(now);
    const id = this.nextId++;
    this.active.push({ id, category: req.category, voice: req.voice, key: req.key, priority: req.priority, end: now + Math.max(200, durMs) });
    this.lastKeyStart.set(req.key, now);
    this.lastKeyOfVoice.set(req.voice, req.key);
    if (req.category === 'unit') {
      const ev = req.event ?? 'select';
      this.lastUnitStart.set(ev, now);
      this.lastVoiceStart.set(`${req.voice}.${ev}`, now);
    }
    return id;
  }

  /** Zeile wurde beendet oder unterbrochen */
  end(id: number, now: number): void {
    const i = this.active.findIndex((a) => a.id === id);
    if (i < 0) return;
    if (this.active[i].category === 'advisor') this.lastAdvisorEnd = now;
    this.active.splice(i, 1);
  }

  /** Nächste wartende Beraterzeile, falls der Berater frei ist (die wichtigste, bei Gleichstand die älteste) */
  nextQueued(now: number): GateReq | null {
    this.prune(now);
    if (this.queue.length === 0) return null;
    if (this.active.some((a) => a.category === 'advisor')) return null;
    if (now - this.lastAdvisorEnd < this.cfg.advisorGap) return null;
    let best = 0;
    for (let i = 1; i < this.queue.length; i++) if (this.queue[i].req.priority > this.queue[best].req.priority) best = i;
    return this.queue.splice(best, 1)[0].req;
  }

  /** Läuft gerade eine Zeile dieser Kategorie? (Kennungen) */
  activeIds(category: VoiceCategory): number[] {
    return this.active.filter((a) => a.category === category).map((a) => a.id);
  }

  clearQueue(): void {
    this.queue.length = 0;
  }

  queueLength(): number {
    return this.queue.length;
  }

  reset(): void {
    this.active.length = 0;
    this.queue.length = 0;
    this.lastUnitStart.clear();
    this.lastVoiceStart.clear();
    this.lastKeyStart.clear();
    this.lastKeyOfVoice.clear();
    this.lastAdvisorEnd = -1e9;
  }
}

/**
 * Wählt Zeilen eines Ereignisses so, dass sich Varianten abwechseln und dieselbe nie zweimal direkt hintereinander kommt
 * (Mischbeutel je Gruppe+Ereignis; beim Auffüllen wird die zuletzt gespielte Zeile ans Ende gestellt).
 */
export class LinePicker {
  private bags = new Map<string, number[]>();
  private last = new Map<string, number>();

  constructor(private rand: () => number = Math.random) {}

  /** Index der nächsten Zeile (0-basiert) bei `count` Varianten */
  pick(id: string, count: number): number {
    if (count <= 1) return 0;
    let bag = this.bags.get(id);
    if (!bag || bag.length === 0) {
      bag = [];
      for (let i = 0; i < count; i++) bag.push(i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      const last = this.last.get(id);
      if (last !== undefined && bag[bag.length - 1] === last) {
        // zuletzt gespielte Zeile nicht als erste ziehen (gezogen wird vom Ende)
        const j = Math.floor(this.rand() * (bag.length - 1));
        [bag[bag.length - 1], bag[j]] = [bag[j], bag[bag.length - 1]];
      }
      this.bags.set(id, bag);
    }
    const idx = bag.pop()!;
    this.last.set(id, idx);
    return idx;
  }

  reset(): void {
    this.bags.clear();
    this.last.clear();
  }
}

/** Vergleichsform eines Satzes (Groß-/Kleinschreibung, Satzzeichen und Leerraum egal) */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sprechdauer-Schätzung (ms), wenn kein Clip die Dauer liefert (Browser-Sprachausgabe, Untertitel) */
export function estimateDurationMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((380 + words * 330 + text.length * 22) / Math.max(0.5, rate));
}

/** Anzeigedauer eines Untertitels (ms) */
export function subtitleHoldMs(text: string): number {
  return Math.max(1800, Math.min(7000, 900 + text.length * 55));
}
