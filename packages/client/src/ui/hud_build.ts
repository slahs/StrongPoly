import { BT, BUILDINGS, CASTLE_SUBCATS, CATEGORIES, Cat, PlayerView, R } from '@strongpoly/shared';
import { clear, fmtCost, h } from './dom';
import type { HudShared } from './hud';
import { buildingIcon, categoryIcon, iconEl, toolIcon } from './icons';

/** Baumenü: Kategorie-Reiter, Burg-Unterkategorien, Gebäudeleiste als Icon-Raster, Werkzeuge */
export class BuildMenu {
  readonly root: HTMLElement;
  private tabs = new Map<string, HTMLButtonElement>();
  private tabBar: HTMLElement;
  private subBar: HTMLElement;
  private grid: HTMLElement;
  private tools: HTMLElement;
  private cat: Cat = 'castle';
  private sub = 'walls';
  private items = new Map<number, HTMLElement>();
  private toolBtns = new Map<string, HTMLElement>();
  private undoLabel!: HTMLElement;
  private lastKey = '';

  constructor(private api: HudShared) {
    this.root = h('div', { class: 'panel pp menu' });
    this.tabBar = h('div', { class: 'tabs' });
    for (const c of CATEGORIES) {
      const b = h('button', { class: 'tab', onclick: () => this.setCat(c.id) }, iconEl(categoryIcon(c.id, 22)), h('span', { text: c.name }));
      b.title = c.name;
      this.tabs.set(c.id, b);
      this.tabBar.append(b);
    }
    this.subBar = h('div', { class: 'subtabs' });
    this.grid = h('div', { class: 'items' });
    this.tools = h('div', { class: 'tools' });
    this.buildTools();
    this.root.append(this.tabBar, this.subBar, h('div', { class: 'menubody' }, this.grid, this.tools));
    this.setCat('castle');
  }

  private buildTools(): void {
    const mk = (key: string, icon: string, label: string, title: string, onclick: () => void): HTMLElement => {
      const b = h('button', { class: 'tool', onclick }, iconEl(toolIcon(icon, 26)), h('span', { class: 'tl', text: label }));
      this.api.tip(b, 'text', 0, title);
      this.toolBtns.set(key, b);
      this.tools.append(b);
      return b;
    };
    mk('demolish', 'demolish', 'Abreißen', 'Gebäude abreißen: anklicken (Rückerstattung: halbes Holz/Stein/Eisen). Entf: ausgewähltes Gebäude abreißen.', () => this.api.actions.startMode('demolish'));
    mk('repair', 'repair', 'Reparieren', 'Gebäude reparieren: anklicken. U: ausgewähltes Gebäude reparieren.', () => this.api.actions.startMode('repair'));
    const undo = mk('undo', 'undo', 'Rückgängig', 'Letzte Platzierung zurücknehmen (Strg+Z), voll erstattet – nur kurz nach dem Bau.', () => this.api.actions.undo());
    this.undoLabel = undo.querySelector('.tl') as HTMLElement;
    mk('cancel', 'cancel', 'Abbrechen', 'Bau-/Auswahlmodus abbrechen (Rechtsklick oder Esc)', () => this.api.actions.cancelPlacement());
  }

  private setCat(c: Cat): void {
    this.cat = c;
    for (const [id, b] of this.tabs) b.classList.toggle('active', id === c);
    this.renderSubs();
    this.renderItems();
  }

  private renderSubs(): void {
    clear(this.subBar);
    this.subBar.style.display = this.cat === 'castle' ? '' : 'none';
    if (this.cat !== 'castle') return;
    for (const s of CASTLE_SUBCATS) {
      const b = h('button', { class: 'subtab' + (s.id === this.sub ? ' active' : ''), text: s.name, onclick: () => {
        this.sub = s.id;
        this.renderSubs();
        this.renderItems();
      } });
      this.subBar.append(b);
    }
  }

  private renderItems(): void {
    clear(this.grid);
    this.items.clear();
    const list: number[] = [];
    if (this.cat === 'castle') {
      const sc = CASTLE_SUBCATS.find((s) => s.id === this.sub) ?? CASTLE_SUBCATS[0];
      list.push(...sc.types);
    } else {
      for (const def of BUILDINGS) if (def && def.cat === this.cat && def.id !== BT.Keep && def.id !== BT.Campfire) list.push(def.id);
    }
    for (const id of list) {
      const def = BUILDINGS[id];
      if (!def) continue;
      const el = h(
        'button',
        { class: 'item', onclick: () => this.api.actions.startPlacement(id) },
        h('div', { class: 'ic', html: buildingIcon(id, 40) }),
        h('div', { class: 'nm', text: def.name }),
        h('div', { class: 'cs', text: fmtCost(def.cost) }),
      );
      this.api.tip(el, 'building', id);
      this.items.set(id, el);
      this.grid.append(el);
    }
    if (this.cat === 'castle' && this.sub === 'siege') {
      for (const [fill, label, icon, tip] of [[false, 'Graben', 'dig', 'Wassergraben ausheben (Rechteck ziehen)'], [true, 'Zuschütten', 'dig', 'Graben zuschütten (Rechteck ziehen)']] as [boolean, string, string, string][]) {
        const el = h('button', { class: 'item', title: tip, onclick: () => this.api.actions.startDig(fill) }, h('div', { class: 'ic', html: toolIcon(icon, 40) }), h('div', { class: 'nm', text: label }), h('div', { class: 'cs', text: 'Gold' }));
        this.grid.append(el);
      }
    }
    this.lastKey = '';
  }

  openCategory(i: number): void {
    const c = CATEGORIES[i];
    if (c) this.setCat(c.id);
  }

  /** Auf Bezahlbarkeit, aktive Auswahl und Rückgängig-Zustand prüfen */
  refresh(v: PlayerView, mode: string): void {
    const placing = this.api.actions.placingType();
    const key = `${v.gold}|${v.stock[R.Wood]}|${v.stock[R.Stone]}|${v.stock[R.Iron]}|${v.stock[R.Pitch]}|${placing}|${mode}|${v.undoLeft}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const [id, el] of this.items) {
      const c = BUILDINGS[id].cost;
      const ok = (c.gold ?? 0) <= v.gold && (c.wood ?? 0) <= v.stock[R.Wood] && (c.stone ?? 0) <= v.stock[R.Stone] && (c.iron ?? 0) <= v.stock[R.Iron] && (c.pitch ?? 0) <= v.stock[R.Pitch];
      el.classList.toggle('off', !ok);
      el.classList.toggle('active', placing === id);
    }
    for (const [k, b] of this.toolBtns) {
      if (k === 'demolish' || k === 'repair') b.classList.toggle('active', mode === k);
      if (k === 'cancel') (b as HTMLButtonElement).disabled = mode === 'normal';
      if (k === 'undo') (b as HTMLButtonElement).disabled = v.undoLeft <= 0;
    }
    this.undoLabel.textContent = v.undoLeft > 0 ? `Zurück ${v.undoLeft}s` : 'Rückgängig';
  }
}
