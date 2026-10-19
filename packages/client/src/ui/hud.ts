import {
  ARMORY_RES,
  BT,
  BUILDINGS,
  BuildingDef,
  CATEGORIES,
  ClientBuilding,
  ClientWorld,
  Command,
  FOOD_RES,
  PLAYER_COLORS,
  PlayerView,
  RATION_NAMES,
  RES_INFO,
  SELL_RATIO,
  STOCK_RES,
  TAX_GOLD,
  TAX_LEVELS,
  TAX_POP,
  TICKS_PER_MONTH,
  U,
  UNITS,
  UnitDef,
  Cat,
  RES_COUNT,
  R,
  SIEGE_UNITS,
  Stance,
  Formation,
} from '@strongpoly/shared';
import { clear, fmtCost, h, hex, MONTHS } from './dom';
import { Minimap } from './minimap';

export interface HudActions {
  send(cmd: Command): void;
  startPlacement(type: number): void;
  cancelPlacement(): void;
  startDig(fill: boolean): void;
  openMenu(): void;
  setSpeed(x: number): void;
  togglePause(): void;
  centerOn(x: number, y: number): void;
  isLocal: boolean;
}

export interface SelectionState {
  units: number[];
  building: number;
}

const ICON_COLORS: Record<string, number> = {
  castle: 0xb9b4aa,
  industry: 0x8b8378,
  farm: 0x6fae4a,
  town: 0xb0452f,
  weapons: 0x7d5a30,
  food: 0xd9b84e,
};

const RES_SWATCH: number[] = [0x6b4a2b, 0xb9b4aa, 0x24211e, 0x2a2622, 0x6fae4a, 0xa97c45, 0xd9b84e, 0xf2ede0, 0xf2ede0, 0xb0452f, 0xf0c040, 0xb0452f, 0xd1b073, 0xa97c45, 0x7d5a30, 0x7d5a30, 0x7d5a30, 0x8e897f, 0xb9b4aa, 0xa97c45, 0x8e897f];

/** Gesamte Spielzeit-HUD: Leisten, Bau-Menü, Info-Panel, Popups, Toasts */
export class Hud {
  readonly root: HTMLElement;
  readonly minimap: Minimap;
  private actions: HudActions;
  private topGold!: HTMLElement;
  private topPop!: HTMLElement;
  private topPopularity!: HTMLElement;
  private topPopBar!: HTMLElement;
  private topDate!: HTMLElement;
  private topTroops!: HTMLElement;
  private topFear!: HTMLElement;
  private powerWrap!: HTMLElement;
  private powerFill!: HTMLElement;
  private powerText!: HTMLElement;
  private resRows: HTMLElement[] = [];
  private resBar!: HTMLElement;
  private menuItems!: HTMLElement;
  private info!: HTMLElement;
  private toasts!: HTMLElement;
  private hint!: HTMLElement;
  private popupEl: HTMLElement | null = null;
  private popupKind = '';
  private cat: Cat = 'castle';
  private tabButtons = new Map<string, HTMLButtonElement>();
  private itemEls = new Map<number, HTMLElement>();
  private lastView: PlayerView | null = null;
  private lastInfoKey = '';
  private abilityBar!: HTMLElement;
  private speedLabel!: HTMLElement;
  fpsEl!: HTMLElement;
  me = 0;
  private extremeMode = false;

  constructor(
    parent: HTMLElement,
    actions: HudActions,
    private world: ClientWorld,
    opts: { extreme: boolean; onMinimapMove: (x: number, y: number) => void; onMinimapOrder: (x: number, y: number) => void },
  ) {
    this.actions = actions;
    this.extremeMode = opts.extreme;
    this.root = h('div', { class: 'hud', style: 'position:absolute;inset:0;pointer-events:none' });
    parent.append(this.root);
    this.buildTop();
    this.buildResBar();
    this.toasts = h('div', { class: 'toasts' });
    this.hint = h('div', { class: 'hint', style: 'display:none' });
    this.fpsEl = h('div', { class: 'fps' });
    this.root.append(this.toasts, this.hint, this.fpsEl);
    const bottom = h('div', { class: 'bottom' });
    this.minimap = new Minimap(world, opts.onMinimapMove, opts.onMinimapOrder);
    const mm = h('div', { class: 'panel minimap' }, this.minimap.canvas);
    this.info = h('div', { class: 'panel info' });
    const menu = h('div', { class: 'panel menu' });
    const tabs = h('div', { class: 'tabs' });
    for (const c of CATEGORIES) {
      const b = h('button', { text: c.name, onclick: () => this.setCat(c.id) });
      this.tabButtons.set(c.id, b);
      tabs.append(b);
    }
    tabs.append(
      h('button', { text: 'Graben', title: 'Wassergraben ausheben (Rechteck ziehen)', onclick: () => this.actions.startDig(false) }),
      h('button', { text: 'Zuschütten', title: 'Graben zuschütten', onclick: () => this.actions.startDig(true) }),
    );
    this.menuItems = h('div', { class: 'items' });
    menu.append(tabs, this.menuItems);
    bottom.append(mm, this.info, menu);
    this.root.append(bottom);
    this.setCat('castle');
  }

  setMe(me: number): void {
    this.me = me;
  }

  // ---------- Leisten ----------
  private buildTop(): void {
    const bar = h('div', { class: 'topbar' });
    this.topGold = h('span', { text: '0' });
    this.topPop = h('span', { text: '0/0' });
    this.topPopularity = h('span', { text: '60' });
    this.topPopBar = h('div', { style: 'width:60%;background:#6fae4a' });
    this.topDate = h('span', { text: 'Januar 1' });
    this.topTroops = h('span', { text: '0' });
    this.topFear = h('span', { text: '0' });
    this.speedLabel = h('span', { text: '1×' });
    bar.append(
      h('div', { class: 'stat', title: 'Gold' }, h('span', { class: 'dot', style: 'background:#f0c040' }), this.topGold),
      h('div', { class: 'stat click', title: 'Bevölkerung / Limit – Klick: Verwaltung', onclick: () => this.togglePopup('admin') }, 'Bauern ', this.topPop),
      h('div', { class: 'stat click', title: 'Beliebtheit – Klick für Aufschlüsselung', onclick: () => this.togglePopup('popularity') }, 'Beliebtheit ', this.topPopularity, h('div', { class: 'popbar' }, this.topPopBar)),
      h('div', { class: 'stat', title: 'Truppen / Limit' }, 'Truppen ', this.topTroops),
      h('div', { class: 'stat', title: 'Angstfaktor: Produktivität +, Kampfmoral −' }, 'Angst ', this.topFear),
    );
    this.powerFill = h('div', { style: 'width:0%' });
    this.powerText = h('span', { text: '' });
    this.powerWrap = h('div', { class: 'power', title: 'Machtleiste (Extreme)', style: this.extremeMode ? '' : 'display:none' }, this.powerFill, this.powerText);
    this.abilityBar = h('div', { style: 'display:flex;gap:4px' });
    bar.append(this.powerWrap, this.abilityBar, h('div', { class: 'spacer' }));
    bar.append(h('div', { class: 'stat' }, this.topDate));
    if (this.actions.isLocal) {
      bar.append(
        h('button', { text: '−', title: 'Langsamer', onclick: () => this.actions.setSpeed(-1) }),
        h('div', { class: 'stat' }, this.speedLabel),
        h('button', { text: '+', title: 'Schneller', onclick: () => this.actions.setSpeed(1) }),
        h('button', { text: 'Pause', onclick: () => this.actions.togglePause() }),
      );
    }
    bar.append(h('button', { text: 'Menü', onclick: () => this.actions.openMenu() }));
    this.root.append(bar);
  }

  setSpeedLabel(s: number): void {
    this.speedLabel.textContent = `${s}×`;
  }

  private buildResBar(): void {
    this.resBar = h('div', { class: 'panel resbar' });
    const groups: [string, number[]][] = [
      ['stock', [R.Wood, R.Stone, R.Iron, R.Pitch]],
      ['food', [R.Apple, R.Cheese, R.Meat, R.Bread, R.Ale]],
    ];
    for (const [g, list] of groups) {
      for (const r of list) {
        const val = h('b', { text: '0' });
        const row = h('div', { class: 'row', title: RES_INFO[r].name, onclick: () => this.togglePopup(g === 'food' ? 'granary' : 'stock') }, h('span', { class: 'dot', style: { background: hex(RES_SWATCH[r]) } }), RES_INFO[r].name, val);
        row.dataset.res = String(r);
        this.resRows[r] = row;
        this.resBar.append(row);
      }
      this.resBar.append(h('div', { class: 'sep' }));
    }
    const arm = h('b', { text: '0' });
    this.resBar.append(h('div', { class: 'row', onclick: () => this.togglePopup('armory') }, h('span', { class: 'dot', style: 'background:#8e897f' }), 'Waffen', arm));
    this.resRows[999] = arm.parentElement as HTMLElement;
    this.root.append(this.resBar);
  }

  // ---------- Bau-Menü ----------
  private setCat(c: Cat): void {
    this.cat = c;
    for (const [id, b] of this.tabButtons) b.classList.toggle('active', id === c);
    clear(this.menuItems);
    this.itemEls.clear();
    for (const def of BUILDINGS) {
      if (!def || def.cat !== c || def.id === BT.Keep || def.id === BT.Campfire) continue;
      const el = h(
        'button',
        {
          class: 'item',
          title: `${def.name}\n${def.desc ?? ''}\nKosten: ${fmtCost(def.cost)}\nGröße: ${def.w}×${def.h}`,
          onclick: () => this.actions.startPlacement(def.id),
        },
        h('div', { class: 'ic', style: { background: hex(ICON_COLORS[def.cat] ?? 0x888888) } }),
        h('div', { class: 'nm', text: def.name }),
        h('div', { class: 'cs', text: fmtCost(def.cost) }),
      );
      this.itemEls.set(def.id, el);
      this.menuItems.append(el);
    }
    if (this.lastView) this.refreshAffordability(this.lastView);
  }

  private refreshAffordability(v: PlayerView): void {
    for (const [id, el] of this.itemEls) {
      const c = BUILDINGS[id].cost;
      const ok = (c.gold ?? 0) <= v.gold && (c.wood ?? 0) <= v.stock[R.Wood] && (c.stone ?? 0) <= v.stock[R.Stone] && (c.iron ?? 0) <= v.stock[R.Iron] && (c.pitch ?? 0) <= v.stock[R.Pitch];
      el.classList.toggle('off', !ok);
    }
  }

  openCategory(i: number): void {
    const c = CATEGORIES[i];
    if (c) this.setCat(c.id);
  }

  setHint(text: string | null): void {
    if (!text) this.hint.style.display = 'none';
    else {
      this.hint.style.display = '';
      this.hint.textContent = text;
    }
  }

  toast(text: string, bad = false): void {
    const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), text });
    this.toasts.append(t);
    while (this.toasts.children.length > 5) this.toasts.firstChild?.remove();
    setTimeout(() => t.remove(), 5000);
  }

  // ---------- Update ----------
  update(view: PlayerView | null, sel: SelectionState): void {
    if (view) {
      this.lastView = view;
      this.topGold.textContent = String(view.gold);
      this.topPop.textContent = `${view.peasants}/${view.housing}`;
      this.topPopularity.textContent = String(Math.round(view.popularity));
      this.topPopBar.style.width = `${view.popularity}%`;
      this.topPopBar.style.background = view.popularity >= 50 ? '#6fae4a' : '#d8362f';
      this.topTroops.textContent = `${view.troops}/${view.troopLimit}`;
      this.topFear.textContent = (view.fear > 0 ? '+' : '') + view.fear;
      const month = this.world.month;
      this.topDate.textContent = `${MONTHS[month % 12]} ${Math.floor(month / 12) + 1}`;
      for (const r of [...STOCK_RES, ...FOOD_RES]) {
        const row = this.resRows[r];
        if (row) (row.lastElementChild as HTMLElement).textContent = String(view.stock[r]);
      }
      let arm = 0;
      for (const r of ARMORY_RES) arm += view.stock[r];
      if (this.resRows[999]) (this.resRows[999].lastElementChild as HTMLElement).textContent = String(arm);
      this.refreshAffordability(view);
      if (this.extremeMode) {
        this.powerFill.style.width = `${(view.power / view.powerMax) * 100}%`;
        this.powerText.textContent = `${Math.floor(view.power)} / ${view.powerMax}`;
      }
      if (this.popupEl) this.refreshPopup();
    }
    this.updateInfo(sel);
  }

  setAbilities(items: { id: number; name: string; cost: number; cd: number; hotkey: string }[], onPick: (id: number) => void, view: PlayerView | null): void {
    clear(this.abilityBar);
    if (!this.extremeMode) return;
    for (const a of items) {
      const cd = view?.abilityCd[a.id] ?? 0;
      const ok = view ? view.power >= a.cost && cd <= 0 : false;
      this.abilityBar.append(
        h('button', { text: `${a.name}${cd > 0 ? ` (${Math.ceil(cd)}s)` : ''}`, title: `${a.name} – ${a.cost} Macht [${a.hotkey}]`, disabled: !ok, onclick: () => onPick(a.id) }),
      );
    }
  }

  // ---------- Info-Panel ----------
  private updateInfo(sel: SelectionState): void {
    const w = this.world;
    const key = `${sel.building}|${sel.units.length}|${sel.units[0] ?? 0}|${Math.floor(w.tick / 5)}`;
    if (key === this.lastInfoKey) return;
    this.lastInfoKey = key;
    clear(this.info);
    if (sel.building) {
      const b = w.buildings.get(sel.building);
      if (b) return this.infoBuilding(b);
    }
    if (sel.units.length) return this.infoUnits(sel.units);
    this.info.append(
      h('h3', { text: 'StrongPoly' }),
      h('div', { class: 'crumb', html: 'Linksklick: auswählen · Rahmen ziehen: Truppen wählen<br>Rechtsklick: Befehl · WASD: Kamera · Q/E: drehen<br>Strg+1..9: Gruppe festlegen · 1..9: Gruppe wählen' }),
    );
  }

  private infoBuilding(b: ClientBuilding): void {
    const def = BUILDINGS[b.t];
    const mine = b.o === this.me;
    this.info.append(h('h3', { text: def.name }));
    const maxHp = def.hp;
    this.info.append(h('div', { class: 'hpbar' }, h('div', { style: `width:${Math.min(100, (b.hp / maxHp) * 100)}%` })));
    this.info.append(h('div', { class: 'kv' }, 'Zustand', h('b', { text: `${b.hp}/${maxHp}${b.f & 1 ? ' – brennt!' : ''}` })));
    if (!mine) {
      const p = this.world.players[b.o];
      this.info.append(h('div', { class: 'kv' }, 'Besitzer', h('b', { text: p?.name ?? '?' })));
      return;
    }
    if (def.workers) this.info.append(h('div', { class: 'kv' }, 'Arbeiter', h('b', { text: `${b.s}/${def.workers}` })));
    if (def.prod) {
      const prod = def.prod;
      this.info.append(h('div', { class: 'kv' }, 'Ausgabepuffer', h('b', { text: String(b.b) })));
      if (prod.recipes.length > 1) {
        const sel = h('select', {
          onchange: (e) => this.actions.send({ c: 'setRecipe', building: b.i, recipe: Number((e.target as HTMLSelectElement).value) }),
        });
        prod.recipes.forEach((r, i) => sel.append(h('option', { value: String(i), text: r.name, selected: i === b.c })));
        this.info.append(h('div', { class: 'kv' }, 'Produziert', sel));
      } else this.info.append(h('div', { class: 'kv' }, 'Produziert', h('b', { text: prod.recipes[0].name })));
      if (prod.recipes[b.c]?.in.length) this.info.append(h('div', { class: 'kv' }, 'Benötigt', h('b', { text: prod.recipes[b.c].in.map(([r, a]) => `${a} ${RES_INFO[r].name}`).join(', ') })));
    }
    if (def.desc) this.info.append(h('div', { class: 'crumb', text: def.desc }));
    const btns = h('div', { class: 'btns' });
    if (b.t === BT.Barracks || b.t === BT.MercPost || b.t === BT.EngineerGuild) {
      const producer = b.t === BT.Barracks ? 'barracks' : b.t === BT.MercPost ? 'merc' : 'guild';
      this.info.append(h('div', { class: 'kv' }, 'Warteschlange', h('b', { text: String(b.q) })));
      for (const ud of UNITS) {
        if (ud.producer !== producer) continue;
        btns.append(
          h('button', {
            text: ud.name,
            title: `${ud.name}\n${this.unitCostText(ud)}\nTP ${ud.hp}, Schaden ${ud.dmg}, Reichweite ${ud.range}`,
            onclick: (e) => this.actions.send({ c: 'recruit', building: b.i, unit: ud.id, count: e.shiftKey ? 5 : 1 }),
          }),
        );
      }
      this.info.append(h('div', { class: 'crumb', text: 'Umschalt+Klick: 5 Einheiten' }));
    }
    if (b.t === BT.Market) btns.append(h('button', { text: 'Handeln…', onclick: () => this.togglePopup('market') }));
    if (def.store) btns.append(h('button', { text: 'Bestand', onclick: () => this.togglePopup(def.store === 'granary' ? 'granary' : def.store === 'armory' ? 'armory' : 'stock') }));
    if (b.t === BT.Campfire || b.t === BT.Hovel) btns.append(h('button', { text: 'Verwaltung', onclick: () => this.togglePopup('admin') }));
    if (b.hp < maxHp && def.hp > 0) btns.append(h('button', { text: 'Reparieren', onclick: () => this.actions.send({ c: 'repair', building: b.i }) }));
    if (b.t !== BT.Keep && b.t !== BT.Campfire) btns.append(h('button', { class: 'danger', text: 'Abreißen', onclick: () => this.actions.send({ c: 'demolish', ids: [b.i] }) }));
    if (b.t === BT.PitchDitch) btns.append(h('button', { text: 'Entzünden', title: 'Benötigt einen Ingenieur in der Nähe', onclick: () => this.actions.send({ c: 'igniteDitch', x: b.x, y: b.y }) }));
    this.info.append(btns);
  }

  private unitCostText(ud: UnitDef): string {
    const parts = [`${ud.cost.gold} Gold`];
    for (const [r, a] of ud.cost.res ?? []) parts.push(`${a} ${RES_INFO[r].name}`);
    if (ud.cost.horse) parts.push('1 Pferd');
    if (ud.cost.crew) parts.push(`${ud.cost.crew} Bauern`);
    else parts.push('1 Bauer');
    return parts.join(', ');
  }

  private infoUnits(ids: number[]): void {
    const w = this.world;
    const counts = new Map<number, number>();
    let hp = 0;
    let maxHp = 0;
    for (const id of ids) {
      const s = w.slotOf(id);
      if (s < 0) continue;
      const t = w.type[s];
      counts.set(t, (counts.get(t) ?? 0) + 1);
      hp += w.hp[s] / 255;
      maxHp += 1;
    }
    this.info.append(h('h3', { text: ids.length === 1 ? UNITS[[...counts.keys()][0]]?.name ?? 'Einheit' : `${ids.length} Einheiten` }));
    this.info.append(h('div', { class: 'hpbar' }, h('div', { style: `width:${maxHp ? (hp / maxHp) * 100 : 0}%` })));
    const list = h('div', { class: 'crumb' });
    list.textContent = [...counts.entries()].map(([t, n]) => `${n}× ${UNITS[t].name}`).join(', ');
    this.info.append(list);
    const mk = (label: string, cmd: Command, title?: string) => h('button', { text: label, title, onclick: () => this.actions.send(cmd) });
    const btns = h('div', { class: 'btns' });
    btns.append(
      mk('Halten', { c: 'stance', units: ids, stance: Stance.Hold }, 'Stellung halten'),
      mk('Defensiv', { c: 'stance', units: ids, stance: Stance.Defensive }),
      mk('Aggressiv', { c: 'stance', units: ids, stance: Stance.Aggressive }),
      mk('Stopp', { c: 'stop', units: ids }),
    );
    this.info.append(btns);
    const fb = h('div', { class: 'btns' }, h('span', { class: 'crumb', text: 'Formation:' }));
    const f = (label: string, fm: number) => h('button', { text: label, onclick: () => (this.formationHandler?.(fm)) });
    fb.append(f('Frei', Formation.Free), f('Linie', Formation.Line), f('Block', Formation.Box), f('Keil', Formation.Wedge));
    this.info.append(fb);
    this.info.append(h('div', { class: 'crumb', html: 'Rechtsklick: Bewegen/Angreifen · A+Klick: Angriffsmarsch<br>P+Klick: Patrouille · G: Bodenangriff · Umschalt: Wegpunkt' }));
  }

  formationHandler: ((f: number) => void) | null = null;

  // ---------- Popups ----------
  togglePopup(kind: string): void {
    if (this.popupEl && this.popupKind === kind) return this.closePopup();
    this.closePopup();
    this.popupKind = kind;
    this.popupEl = h('div', { class: 'panel popup' });
    this.root.append(this.popupEl);
    this.popupEl.style.pointerEvents = 'auto';
    this.refreshPopup(true);
  }

  closePopup(): void {
    this.popupEl?.remove();
    this.popupEl = null;
    this.popupKind = '';
  }

  hasPopup(): boolean {
    return !!this.popupEl;
  }

  private popupSig = '';
  private refreshPopup(force = false): void {
    const v = this.lastView;
    if (!this.popupEl || !v) return;
    const sig = this.popupKind === 'market' ? `${this.popupKind}|${v.gold}|${v.stock.join(',')}|${v.priceMul.join(',')}` : `${this.popupKind}|${v.gold}|${v.stock.join(',')}|${v.tax}|${v.ration}|${v.popularity | 0}|${v.factors.map((f) => f.value.toFixed(1)).join(',')}`;
    if (!force && sig === this.popupSig) return;
    this.popupSig = sig;
    const el = this.popupEl;
    const scroll = el.scrollTop;
    clear(el);
    const title = { stock: 'Lager', granary: 'Kornspeicher', armory: 'Waffenkammer', market: 'Markt', popularity: 'Beliebtheit', admin: 'Verwaltung' }[this.popupKind] ?? '';
    el.append(h('h2', {}, title, h('button', { class: 'close', text: '✕', onclick: () => this.closePopup() })));
    if (this.popupKind === 'stock' || this.popupKind === 'granary' || this.popupKind === 'armory') this.popupStore(el, v, this.popupKind);
    else if (this.popupKind === 'market') this.popupMarket(el, v);
    else if (this.popupKind === 'popularity') this.popupPopularity(el, v);
    else if (this.popupKind === 'admin') this.popupAdmin(el, v);
    el.scrollTop = scroll;
  }

  private popupStore(el: HTMLElement, v: PlayerView, kind: 'stock' | 'granary' | 'armory'): void {
    const idx = kind === 'stock' ? 0 : kind === 'granary' ? 1 : 2;
    const g = h('div', { class: 'grid2' });
    for (let r = 0; r < RES_COUNT; r++) {
      if (RES_INFO[r].store !== kind) continue;
      g.append(h('span', { class: 'dot', style: { background: hex(RES_SWATCH[r]) } }), h('span', { text: RES_INFO[r].name }), h('b', { text: String(v.stock[r]) }));
    }
    el.append(g);
    el.append(h('div', { class: 'bar', style: 'margin-top:10px' }, h('div', { style: `width:${v.cap[idx] ? (v.used[idx] / v.cap[idx]) * 100 : 0}%` })));
    el.append(h('div', { class: 'crumb', text: `Belegung ${v.used[idx]} / ${v.cap[idx]} – erweitert sich durch angrenzende Module` }));
  }

  private popupMarket(el: HTMLElement, v: PlayerView): void {
    el.append(h('div', { class: 'crumb', text: `Gold: ${v.gold} · Verkauf zu ${Math.round(SELL_RATIO * 100)}% des Preises. Preise schwanken mit Angebot und Nachfrage.` }));
    const g = h('div', { style: 'display:grid;grid-template-columns:1fr 40px 54px 54px auto;gap:3px 8px;align-items:center;margin-top:8px' });
    g.append(h('b', { text: 'Ware' }), h('b', { text: 'Bst.' }), h('b', { text: 'Kauf' }), h('b', { text: 'Verk.' }), h('b', { text: '' }));
    for (let r = 0; r < RES_COUNT; r++) {
      const price = RES_INFO[r].price * v.priceMul[r];
      const mk = (buy: boolean, n: number) => h('button', { text: `${buy ? '+' : '−'}${n}`, onclick: () => this.actions.send({ c: 'trade', res: r, amount: n, buy }) });
      g.append(
        h('span', {}, h('span', { class: 'dot', style: { background: hex(RES_SWATCH[r]) } }), ' ' + RES_INFO[r].name),
        h('span', { text: String(v.stock[r]) }),
        h('span', { text: price.toFixed(1) }),
        h('span', { text: (price * SELL_RATIO).toFixed(1) }),
        h('span', { style: 'display:flex;gap:2px' }, mk(true, 1), mk(true, 10), mk(false, 1), mk(false, 10)),
      );
    }
    el.append(g);
  }

  private popupPopularity(el: HTMLElement, v: PlayerView): void {
    el.append(h('div', { html: `Beliebtheit: <b>${v.popularity.toFixed(1)}</b> / 100 &nbsp; <span class="${v.popDelta >= 0 ? 'pos' : 'neg'}">${v.popDelta >= 0 ? '+' : ''}${v.popDelta.toFixed(1)} pro Monat</span>` }));
    el.append(h('div', { class: 'crumb', text: 'Unter 50 verlassen Bauern die Burg, darüber kommen neue.' }));
    const g = h('div', { class: 'grid2', style: 'margin-top:8px' });
    for (const f of v.factors) {
      g.append(h('span'), h('span', { text: f.label }), h('b', { class: f.value > 0.05 ? 'pos' : f.value < -0.05 ? 'neg' : '', text: (f.value > 0 ? '+' : '') + f.value.toFixed(1) }));
    }
    el.append(g);
    el.append(h('div', { class: 'crumb', style: 'margin-top:8px', text: `Nahrungssorten: ${v.foodTypes}${v.foodShort ? ' · NAHRUNGSMANGEL' : ''} · Angstfaktor: ${v.fear}` }));
  }

  private popupAdmin(el: HTMLElement, v: PlayerView): void {
    const taxSlider = h('input', {
      type: 'range',
      min: String(TAX_LEVELS[0]),
      max: String(TAX_LEVELS[TAX_LEVELS.length - 1]),
      step: '1',
      value: String(v.tax),
      oninput: (e) => this.actions.send({ c: 'setTax', level: Number((e.target as HTMLInputElement).value) }),
    });
    const rationSlider = h('input', {
      type: 'range',
      min: '0',
      max: '4',
      step: '1',
      value: String(v.ration),
      oninput: (e) => this.actions.send({ c: 'setRation', level: Number((e.target as HTMLInputElement).value) }),
    });
    el.append(
      h('div', { class: 'form' },
        h('span', { text: 'Steuern' }),
        h('div', {}, taxSlider, h('div', { class: 'crumb', text: v.tax < 0 ? `Bestechung: ${-TAX_GOLD[v.tax]} Gold/Bauer/Monat, Beliebtheit +${TAX_POP[v.tax]}` : v.tax === 0 ? 'Keine Steuern' : `Steuer: ${TAX_GOLD[v.tax]} Gold/Bauer/Monat, Beliebtheit ${TAX_POP[v.tax]}` })),
        h('span', { text: 'Rationen' }),
        h('div', {}, rationSlider, h('div', { class: 'crumb', text: RATION_NAMES[v.ration] })),
      ),
    );
    el.append(h('div', { class: 'crumb', text: `Bauern ${v.peasants} / ${v.housing} · Pferde ${v.horses}` }));
  }

  /** Meldung groß einblenden */
  banner(text: string, color = '#f0c040'): void {
    const b = h('div', { class: 'banner-msg', text, style: `color:${color}` });
    this.root.append(b);
    setTimeout(() => b.remove(), 4000);
  }

  destroy(): void {
    this.minimap.destroy();
    this.root.remove();
  }
}

