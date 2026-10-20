import { Formation, PLAYER_COLORS, Stance, U, UNITS, Command } from '@strongpoly/shared';
import { clear, h } from './dom';
import type { HudShared, SelectionState } from './hud';
import { iconEl, toolIcon, unitIcon } from './icons';

/** Truppenpanel: Porträt-Icons je Typ mit Anzahl, Haltung, Formation, Sonderbefehle */
export class TroopPanel {
  formationHandler: ((f: number) => void) | null = null;

  constructor(
    private api: HudShared,
    private root: HTMLElement,
  ) {}

  render(sel: SelectionState): void {
    const w = this.api.world;
    const el = this.root;
    clear(el);
    const pool = sel.pool.length ? sel.pool : sel.units;
    const counts = new Map<number, number>();
    const inSel = new Set(sel.units);
    let hp = 0;
    let n = 0;
    for (const id of pool) {
      const s = w.slotOf(id);
      if (s < 0) continue;
      const t = w.type[s];
      counts.set(t, (counts.get(t) ?? 0) + 1);
      if (inSel.has(id)) {
        hp += w.hp[s] / 255;
        n++;
      }
    }
    const me = w.players[this.api.me()];
    const col = me ? PLAYER_COLORS[me.color % PLAYER_COLORS.length] : undefined;
    const filtered = sel.units.length < pool.length;
    const activeType = filtered && sel.units.length ? w.type[w.slotOf(sel.units[0])] : null;
    el.append(h('div', { class: 'ctx-head' }, h('h3', { text: n === 1 ? UNITS[[...counts.keys()][0]]?.name ?? 'Einheit' : `${n} Einheiten` }), filtered ? h('button', { class: 'small', text: 'Alle', title: 'Wieder alle Typen der Auswahl', onclick: () => this.api.actions.filterSelection(null) }) : null));
    el.append(h('div', { class: 'hpbar' }, h('div', { style: `width:${n ? (hp / n) * 100 : 0}%` })));
    const grid = h('div', { class: 'typegrid' });
    for (const [t, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      const ud = UNITS[t];
      const b = h('button', { class: 'typebtn' + (activeType === t ? ' active' : ''), title: `${ud.name}: Klick wählt nur diesen Typ` , onclick: () => this.api.actions.filterSelection(activeType === t ? null : t) }, h('div', { class: 'ic', html: unitIcon(t, col, 40) }), h('span', { class: 'cnt', text: String(c) }));
      this.api.tip(b, 'unit', t, b.title);
      grid.append(b);
    }
    el.append(grid);
    const ids = sel.units;
    const types = new Set(counts.keys());
    const has = (f: (t: number) => boolean): boolean => [...types].some((t) => (activeType === null || t === activeType) && f(t));
    const mode = this.api.actions.currentMode();
    const mk = (icon: string, label: string, title: string, onclick: () => void, active = false): HTMLElement => h('button', { class: 'cmd' + (active ? ' active' : ''), title, onclick }, iconEl(toolIcon(icon, 24)), h('span', { text: label }));
    const send = (cmd: Command) => () => this.api.actions.send(cmd);
    const stances = h('div', { class: 'cmdrow' },
      mk('stance_hold', 'Halten', 'Stellung halten (H)', send({ c: 'stance', units: ids, stance: Stance.Hold })),
      mk('stance_defensive', 'Defensiv', 'Defensiv: Gegner nur nahe der Position verfolgen (V)', send({ c: 'stance', units: ids, stance: Stance.Defensive })),
      mk('stance_aggressive', 'Aggressiv', 'Aggressiv: Gegner in Sichtweite jagen (B)', send({ c: 'stance', units: ids, stance: Stance.Aggressive })),
      mk('stop', 'Stopp', 'Alle Befehle abbrechen (X)', send({ c: 'stop', units: ids })),
    );
    const fm = (label: string, key: string, f: number) => mk(key, label, `Formation: ${label}`, () => this.formationHandler?.(f));
    const forms = h('div', { class: 'cmdrow' }, fm('Frei', 'formation_free', Formation.Free), fm('Linie', 'formation_line', Formation.Line), fm('Block', 'formation_box', Formation.Box), fm('Keil', 'formation_wedge', Formation.Wedge));
    const orders = h('div', { class: 'cmdrow' },
      mk('attack', 'Angriffsmarsch', 'Angriffsmarsch: unterwegs alles bekämpfen (F), danach Ziel anklicken', () => this.api.actions.startMode('attackMove'), mode === 'attackMove'),
      mk('patrol', 'Patrouille', 'Patrouille zwischen hier und dem Ziel (P)', () => this.api.actions.startMode('patrol'), mode === 'patrol'),
    );
    if (has((t) => UNITS[t].range > 3 || !!UNITS[t].siege)) orders.append(mk('groundattack', 'Bodenangriff', 'Fernkämpfer und Belagerungsgerät beschießen ein Zielgebiet (G)', () => this.api.actions.startMode('attackGround'), mode === 'attackGround'));
    el.append(stances, forms, orders);
    if (has((t) => !!UNITS[t].tunnels)) el.append(h('div', { class: 'cmdrow' }, mk('dig', 'Tunnel', 'Tunnelgräber graben unterirdisch zum Ziel (Alt+T oder Rechtsklick)', () => this.api.actions.startMode('tunnel'), mode === 'tunnel')));
    if (has((t) => t === U.Peasant || !!UNITS[t].repairs || UNITS[t].key === 'engineer' || !!UNITS[t].worker)) {
      /* Arbeitereinheiten werden über die Gebäude gesteuert */
    }
    el.append(h('div', { class: 'cmdrow' }, mk('dig', 'Graben', 'Wassergraben ausheben (Rechteck ziehen)', () => this.api.actions.startDig(false)), mk('filloil', 'Entzünden', 'Pechgraben entzünden (ein Ingenieur muss nahe sein)', () => this.api.actions.startMode('ignite'), mode === 'ignite')));
    el.append(h('div', { class: 'crumb', html: 'Rechtsklick: Bewegen/Angreifen · Umschalt: Wegpunkt · Alt: Angriffsmarsch<br>Strg+Zahl: Gruppe speichern · Zahl: Gruppe wählen (doppelt: hinzoomen)' }));
  }
}
