import { BUILDINGS, ClientWorld, PlayerView, Snapshot, U, UNITS } from '@strongpoly/shared';
import { clear, h } from './dom';

/** Der Berater: eigene Figur, eigener Name, meldet wichtige Ereignisse als Textzeile mit Ton und Kamerasprung. */
export const ADVISOR_NAME = 'Tamsin, die Wegkundige';

export type AdvisorKind = 'info' | 'warn' | 'alert';

export interface AdvisorMsg {
  id: number;
  tick: number;
  kind: AdvisorKind;
  text: string;
  /** Ort für den Kamerasprung (Tiles) */
  x?: number;
  y?: number;
  read: boolean;
}

/** Mindestabstand gleicher Meldungen in Ticks (10 Ticks = 1 s) */
const COOLDOWN: Record<string, number> = {
  food: 900,
  foodShort: 600,
  popfall: 1200,
  storage: 1800,
  attack: 250,
  breach: 150,
  lord: 300,
  aid: 100,
};

/**
 * Leitet aus Snapshots und Spieleransicht die Meldungen ab (reine Logik, ohne DOM, damit testbar).
 * `emit` bekommt jede neue Meldung genau einmal.
 */
export class AdvisorLogic {
  private last = new Map<string, number>();
  private seenRemoved = 0;
  private aidSeen = 0;
  private nextId = 1;
  readonly list: AdvisorMsg[] = [];
  onMessage: (m: AdvisorMsg) => void = () => {};

  constructor(
    private world: ClientWorld,
    private me: () => number,
    private teamOf: () => number[],
  ) {}

  push(kind: AdvisorKind, text: string, tick: number, x?: number, y?: number, key?: string): AdvisorMsg | null {
    if (key) {
      const cd = COOLDOWN[key.split(':')[0]] ?? 300;
      const prev = this.last.get(key);
      if (prev !== undefined && tick - prev < cd) return null;
      this.last.set(key, tick);
    }
    const m: AdvisorMsg = { id: this.nextId++, tick, kind, text, x, y, read: false };
    this.list.push(m);
    if (this.list.length > 40) this.list.shift();
    this.onMessage(m);
    return m;
  }

  /** Meldungen der Simulation (`msg`-Ereignisse) übernehmen */
  onEvents(events: Snapshot['events'], tick: number): void {
    for (const e of events) if (e.e === 'msg' && e.p === this.me()) this.push('info', e.text, tick);
  }

  /** Neu zerstörte eigene Mauerstücke: Mauer durchbrochen */
  checkRemoved(tick: number): void {
    const w = this.world;
    if (w.removedBuildings.length < this.seenRemoved) this.seenRemoved = 0;
    for (let i = this.seenRemoved; i < w.removedBuildings.length; i++) {
      const b = w.removedBuildings[i];
      const def = BUILDINGS[b.t];
      if (b.o !== this.me() || !def?.wallTop || def.stairs || def.id === 0) continue;
      // nur wenn Feinde in der Nähe waren (nicht beim Abreißen durch den Spieler)
      if (this.enemyNear(b.x, b.y, 14, 1)) this.push('alert', def.gate ? 'Das Tor ist gefallen!' : 'Die Mauer wurde durchbrochen!', tick, b.x, b.y, 'breach');
    }
    this.seenRemoved = w.removedBuildings.length;
  }

  /** Feindliche Soldaten im Umkreis (Tiles) eines Punkts */
  private enemyNear(x: number, y: number, r: number, min = 1): number {
    const w = this.world;
    const myTeam = this.teamOf()[this.me()] ?? 0;
    const team = this.teamOf();
    let n = 0;
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s]) continue;
      const t = w.type[s];
      if (t === U.Peasant || t === U.Ox) continue;
      if ((team[w.owner[s]] ?? -1) === myTeam) continue;
      if (w.flags[s] & 8) continue;
      if (Math.hypot(w.curX[s] - x, w.curY[s] - y) <= r && ++n >= min) return n;
    }
    return n;
  }

  /** Alle ~1 s aufrufen */
  update(view: PlayerView | null, tick: number): void {
    if (!view) return;
    const w = this.world;
    const me = this.me();
    const keep = w.players[me];
    // Nahrung
    if (view.foodShort) this.push('alert', 'Hunger! Die Bauern haben nichts mehr zu essen.', tick, keep?.keepX, keep?.keepY, 'foodShort');
    else if (view.peasants > 6 && foodStock(view) < view.peasants * 0.6) this.push('warn', 'Die Nahrung wird knapp.', tick, keep?.keepX, keep?.keepY, 'food');
    // Beliebtheit
    if (view.popDelta < -1 && view.popularity < 55) this.push('warn', `Die Beliebtheit sinkt (${view.popularity.toFixed(0)}).`, tick, undefined, undefined, 'popfall');
    // Lager voll
    const names = ['Lager', 'Kornspeicher', 'Waffenkammer'];
    if (tick > 1200) for (let i = 0; i < 3; i++) if (view.cap[i] > 0 && view.used[i] >= view.cap[i] * 0.97) this.push('warn', `${names[i]} ist voll – baue ein weiteres Modul an.`, tick, undefined, undefined, `storage:${i}`);
    // Angriff
    if (keep) {
      const team = this.teamOf();
      const myTeam = team[me] ?? 0;
      const seen = new Map<number, { n: number; x: number; y: number }>();
      for (let s = 0; s < w.top; s++) {
        if (!w.ids[s]) continue;
        const t = w.type[s];
        if (t === U.Peasant || t === U.Ox) continue;
        const o = w.owner[s];
        if ((team[o] ?? -1) === myTeam || (w.flags[s] & 8)) continue;
        const x = w.curX[s];
        const y = w.curY[s];
        // nah an der Burg oder an einem eigenen Gebäude
        let near = Math.hypot(x - keep.keepX, y - keep.keepY) < 34;
        if (!near) {
          for (const b of w.buildings.values()) {
            if (b.o === me && Math.abs(b.x - x) < 9 && Math.abs(b.y - y) < 9) {
              near = true;
              break;
            }
          }
        }
        if (!near) continue;
        const e = seen.get(o) ?? { n: 0, x: 0, y: 0 };
        e.n++;
        e.x += x;
        e.y += y;
        seen.set(o, e);
      }
      for (const [o, e] of seen) {
        if (e.n < 2) continue;
        const name = w.players[o]?.name ?? 'Feind';
        this.push('alert', `Angriff von ${name}! (${e.n} Soldaten)`, tick, e.x / e.n, e.y / e.n, `attack:${o}`);
      }
      // Lord in Gefahr
      for (let s = 0; s < w.top; s++) {
        if (!w.ids[s] || w.type[s] !== U.Lord || w.owner[s] !== me) continue;
        const x = w.curX[s];
        const y = w.curY[s];
        const hurt = w.hp[s] < 130;
        if (hurt || this.enemyNear(x, y, 7, 2) >= 2) this.push('alert', hurt ? 'Der Lord ist schwer verwundet!' : 'Der Lord ist in Gefahr!', tick, x, y, 'lord');
      }
    }
    // Hilferufe von Verbündeten
    if (view.aid.length > this.aidSeen) {
      for (let i = this.aidSeen; i < view.aid.length; i++) {
        const a = view.aid[i];
        const p = w.players[a.from];
        this.push('warn', `${p?.name ?? 'Ein Verbündeter'} bittet um Hilfe!`, tick, p?.keepX, p?.keepY, `aid:${a.from}`);
      }
    }
    this.aidSeen = view.aid.length;
  }
}

function foodStock(view: PlayerView): number {
  // Äpfel, Käse, Fleisch, Brot (Ressourcen 9..12)
  return (view.stock[9] ?? 0) + (view.stock[10] ?? 0) + (view.stock[11] ?? 0) + (view.stock[12] ?? 0);
}

/** Meldungsliste oben rechts (anklickbar) mit dem Berater-Porträt */
export class AdvisorPanel {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private face: HTMLElement;
  private open = true;

  constructor(
    parent: HTMLElement,
    private logic: AdvisorLogic,
    private onJump: (x: number, y: number) => void,
    private tickNow: () => number,
  ) {
    this.face = h('div', { class: 'adv-face', html: ADVISOR_FACE });
    this.listEl = h('div', { class: 'adv-list' });
    const head = h('div', { class: 'adv-head', title: 'Meldungsliste ein-/ausklappen', onclick: () => this.toggle() }, this.face, h('span', { text: ADVISOR_NAME }));
    this.root = h('div', { class: 'panel pp advisor' }, head, this.listEl);
    parent.append(this.root);
    this.render();
  }

  toggle(): void {
    this.open = !this.open;
    this.root.classList.toggle('closed', !this.open);
  }

  notify(): void {
    this.face.classList.remove('speak');
    void this.face.offsetWidth;
    this.face.classList.add('speak');
    this.render();
  }

  render(): void {
    clear(this.listEl);
    const now = this.tickNow();
    const shown = this.logic.list.slice(-6).reverse();
    if (!shown.length) this.listEl.append(h('div', { class: 'crumb', text: 'Keine Meldungen. Leertaste springt zur letzten Meldung.' }));
    for (const m of shown) {
      const age = Math.max(0, Math.round((now - m.tick) / 10));
      const el = h(
        'div',
        {
          class: `adv-msg ${m.kind}${m.read ? ' read' : ''}${m.x !== undefined ? ' go' : ''}`,
          title: m.x !== undefined ? 'Klick: Kamera dorthin' : '',
          onclick: () => {
            m.read = true;
            if (m.x !== undefined && m.y !== undefined) this.onJump(m.x, m.y);
            this.render();
          },
        },
        h('span', { class: 'adv-time', text: age < 60 ? `${age}s` : `${Math.floor(age / 60)}m` }),
        h('span', { text: m.text }),
      );
      this.listEl.append(el);
    }
  }

  destroy(): void {
    this.root.remove();
  }
}

/** Eigenes Porträt des Beraters (Turban, Bart, Schriftrolle) als Low-Poly-SVG */
const ADVISOR_FACE = `<svg viewBox="0 0 64 64" width="38" height="38" xmlns="http://www.w3.org/2000/svg"><g stroke="#241a12" stroke-width="2.4" stroke-linejoin="round">
<polygon points="32,6 50,16 52,26 12,26 14,16" fill="#3f6fa8"/><polygon points="32,6 50,16 32,20" fill="#5c8fcf"/><polygon points="32,6 14,16 32,20" fill="#2f5688"/>
<polygon points="14,26 52,26 50,44 32,56 16,44" fill="#d9a877"/><polygon points="32,26 52,26 50,44 32,56" fill="#c4915f"/>
<polygon points="16,40 32,58 48,40 44,52 32,60 20,52" fill="#5a4032"/>
<polygon points="20,32 28,32 28,36 20,36" fill="#fff" /><polygon points="36,32 44,32 44,36 36,36" fill="#fff"/><rect x="23" y="32" width="3" height="4" fill="#241a12" stroke="none"/><rect x="38" y="32" width="3" height="4" fill="#241a12" stroke="none"/>
<polygon points="30,40 34,40 33,46 31,46" fill="#b4784a"/>
<polygon points="29,12 35,12 34,19 30,19" fill="#f0c040"/></g></svg>`;

void UNITS;
