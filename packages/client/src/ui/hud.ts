import {
  ARMORY_RES,
  BT,
  ClientWorld,
  Command,
  FOOD_RES,
  MissionView,
  PLAYER_COLORS,
  PlayerView,
  RES_INFO,
  STOCK_RES,
  TAX_GOLD,
  TAX_LEVELS,
  TAX_POP,
  R,
  RES_COUNT,
  RATION_NAMES,
  SELL_RATIO,
  TICKS_PER_MONTH,
} from '@strongpoly/shared';
import { clear, h, MONTHS } from './dom';
import { buildingIcon, iconEl, popFaceIcon, popFactorIcon, resourceIcon, toolIcon, abilityIcon } from './icons';
import { Minimap } from './minimap';
import { abilityTooltip, attachTooltip, buildingTooltip, resourceTooltip, unitTooltip } from './tooltip';
import { renderDoc } from './doc/render';
import type { Doc } from './doc/blocks';
import { explainPopularity } from '@strongpoly/shared';
import { foodLevel, foodSupply, foodWarnText, fearTipDoc, goldLevel, goldTipDoc, peasantLevel, peasantsTipDoc, popularityLevel, resLevel, resWarnText, RES_LIMITS, troopLevel, troopsTipDoc } from './hud_stats';
import type { Level } from './hud_stats';
import { popularityTooltip, renderPopularityDetail, renderPopularitySummary } from './popularity';
import { deltaText } from './popularity_model';
import { BuildMenu } from './hud_build';
import { ContextPanel } from './hud_context';
import { TroopPanel } from './hud_troops';

export type ModeName = 'normal' | 'place' | 'dig' | 'ability' | 'attackMove' | 'patrol' | 'attackGround' | 'demolish' | 'repair' | 'tunnel' | 'ignite';

export interface HudActions {
  send(cmd: Command): void;
  startPlacement(type: number): void;
  cancelPlacement(): void;
  startDig(fill: boolean): void;
  startMode(m: 'attackMove' | 'patrol' | 'attackGround' | 'tunnel' | 'ignite' | 'demolish' | 'repair'): void;
  currentMode(): ModeName;
  /** Typ des gerade zu platzierenden Gebäudes oder -1 */
  placingType(): number;
  undo(): void;
  openMenu(): void;
  openHelp(): void;
  openEncyclopedia(): void;
  setSpeed(x: number): void;
  togglePause(): void;
  centerOn(x: number, y: number): void;
  selectBuilding(id: number): void;
  /** Auswahl auf einen Typ einschränken (Truppenpanel); `null` = alle wieder */
  filterSelection(type: number | null): void;
  isLocal: boolean;
}

export interface SelectionState {
  units: number[];
  /** gesamte Auswahl vor dem Filtern nach Typ (Truppenpanel) */
  pool: number[];
  building: number;
}

/** Gemeinsame Sicht der HUD-Bausteine */
export interface HudShared {
  world: ClientWorld;
  actions: HudActions;
  view: () => PlayerView | null;
  me: () => number;
  /** Tooltip an ein Element hängen (Standard: title-Text, wird später durch die Enzyklopädie-Tooltips ersetzt) */
  tip: (el: HTMLElement, kind: 'building' | 'unit' | 'resource' | 'ability' | 'text', id: number, text?: string) => void;
  togglePopup: (kind: string) => void;
}

/** Gesamte Spielzeit-HUD: Leisten, Bau-Menü, Kontext-/Truppenpanel, Popups, Toasts */
export class Hud {
  readonly root: HTMLElement;
  readonly minimap: Minimap;
  private actions: HudActions;
  private topGold!: HTMLElement;
  private topPop!: HTMLElement;
  private topPopularity!: HTMLElement;
  private topFace!: HTMLElement;
  private topDelta!: HTMLElement;
  private topDate!: HTMLElement;
  private topTroops!: HTMLElement;
  private topFear!: HTMLElement;
  private statGold!: HTMLElement;
  private statPeasants!: HTMLElement;
  private statPop!: HTMLElement;
  private statTroops!: HTMLElement;
  private statFear!: HTMLElement;
  private foodSum!: HTMLElement;
  private armed = new Set<number>();
  private powerWrap!: HTMLElement;
  private powerFill!: HTMLElement;
  private powerText!: HTMLElement;
  private resRows: HTMLElement[] = [];
  private resBar!: HTMLElement;
  private info!: HTMLElement;
  private toasts!: HTMLElement;
  private hint!: HTMLElement;
  private popupEl: HTMLElement | null = null;
  private popupKind = '';
  private lastView: PlayerView | null = null;
  private lastFace = -1;
  private abilityBar!: HTMLElement;
  private speedLabel!: HTMLElement;
  private pauseBtn: HTMLElement | null = null;
  fpsEl!: HTMLElement;
  private missionEl: HTMLElement | null = null;
  private missionSig = '';
  readonly build: BuildMenu;
  private context: ContextPanel;
  private troops: TroopPanel;
  /** Platz für Meldungsliste etc. */
  readonly topRight: HTMLElement;
  me = 0;
  private extremeMode = false;
  /** Wird von der Enzyklopädie/Tooltip-Anbindung überschrieben */
  tipHook: HudShared['tip'] = (el, kind, id, text) => {
    const me = this.world.players[this.me];
    const col = me ? PLAYER_COLORS[me.color % PLAYER_COLORS.length] : undefined;
    const v = () => this.lastView;
    switch (kind) {
      case 'building':
        attachTooltip(el, () => buildingTooltip(id), { placement: 'element' });
        break;
      case 'unit':
        attachTooltip(el, () => unitTooltip(id, col), { placement: 'element' });
        break;
      case 'resource':
        attachTooltip(
          el,
          () => {
            const tip = resourceTooltip(id, { stock: v()?.stock[id], priceMul: v()?.priceMul[id] });
            const warn = this.resWarning(id);
            if (warn) tip.append(h('div', { class: 'doc-rule tone-warn', text: warn }));
            return tip;
          },
          { placement: 'element' },
        );
        break;
      case 'ability':
        attachTooltip(el, () => abilityTooltip(id), { placement: 'element' });
        break;
      default:
        if (text) attachTooltip(el, text, { placement: 'element' });
    }
  };
  private sharedApi: HudShared;
  formationHandler: ((f: number) => void) | null = null;

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
    this.sharedApi = {
      world,
      actions,
      view: () => this.lastView,
      me: () => this.me,
      tip: (el, k, id, text) => this.tipHook(el, k, id, text),
      togglePopup: (k) => this.togglePopup(k),
    };
    this.buildTop();
    this.buildResBar();
    this.topRight = h('div', { class: 'topright' });
    this.toasts = h('div', { class: 'toasts' });
    this.hint = h('div', { class: 'hint', style: 'display:none' });
    this.fpsEl = h('div', { class: 'fps' });
    this.root.append(this.topRight, this.toasts, this.hint, this.fpsEl);
    // Unteres Hauptpanel: Baumenü links, Kontext in der Mitte, Minikarte rechts
    const bottom = h('div', { class: 'bottom' });
    this.build = new BuildMenu(this.sharedApi);
    this.info = h('div', { class: 'panel pp info' });
    // Während die Maustaste im Infopanel gedrückt ist (Schieberegler, Klick) wird nicht neu aufgebaut
    this.info.addEventListener('pointerdown', () => (this.infoFrozen = true));
    window.addEventListener('pointerup', () => (this.infoFrozen = false));
    this.context = new ContextPanel(this.sharedApi, this.info);
    this.troops = new TroopPanel(this.sharedApi, this.info);
    this.troops.formationHandler = (f) => this.formationHandler?.(f);
    this.minimap = new Minimap(world, opts.onMinimapMove, opts.onMinimapOrder);
    const mm = h('div', { class: 'panel pp minimap' }, this.minimap.canvas);
    bottom.append(this.build.root, this.info, mm);
    this.root.append(bottom);
    this.showIdleInfo();
    this.refreshLayout();
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.refreshLayout();

  setMe(me: number): void {
    this.me = me;
  }

  // ---------- Leisten ----------
  private buildTop(): void {
    const bar = h('div', { class: 'topbar' });
    this.topGold = h('span', { text: '0' });
    this.topPop = h('span', { text: '0/0' });
    this.topPopularity = h('span', { text: '60' });
    this.topFace = h('span', { class: 'face', html: popFaceIcon(60, 28) });
    this.topDelta = h('span', { class: 'delta', text: '' });
    this.topDate = h('span', { text: 'Januar 1' });
    this.topTroops = h('span', { text: '0' });
    this.topFear = h('span', { text: '0' });
    this.speedLabel = h('span', { text: '1×' });
    const warn = (): HTMLElement => h('span', { class: 'wmark', html: WARN_SVG });
    const view = (): PlayerView | null => this.lastView;
    const tip = (el: HTMLElement, doc: (v: PlayerView) => Doc): void => {
      attachTooltip(el, () => (view() ? renderDoc(doc(view() as PlayerView), { compact: true }) : null), { placement: 'element' });
    };
    this.statGold = h('div', { class: 'stat click gold', onclick: () => this.togglePopup('admin') }, iconEl(coinIcon()), this.topGold, warn());
    this.statPeasants = h('div', { class: 'stat click peasants', onclick: () => this.togglePopup('admin') }, iconEl(popFactorIcon('crowd', 24)), this.topPop, warn());
    this.statPop = h('div', { class: 'stat click pop', onclick: () => this.togglePopup('popularity') }, this.topFace, this.topPopularity, this.topDelta, warn());
    this.statTroops = h('div', { class: 'stat troops' }, iconEl(toolIcon('troops', 24)), this.topTroops, warn());
    this.statFear = h('div', { class: 'stat fear' }, iconEl(popFactorIcon('fear', 24)), this.topFear);
    tip(this.statGold, goldTipDoc);
    tip(this.statPeasants, peasantsTipDoc);
    attachTooltip(this.statPop, popularityTooltip(view), { placement: 'element' });
    tip(this.statTroops, troopsTipDoc);
    tip(this.statFear, fearTipDoc);
    bar.append(h('div', { class: 'grp' }, this.statGold, this.statPeasants, this.statPop), h('div', { class: 'grp' }, this.statTroops, this.statFear));
    this.powerFill = h('div', { style: 'width:0%' });
    this.powerText = h('span', { text: '' });
    this.powerWrap = h('div', { class: 'power', title: 'Machtleiste (Extreme)', style: this.extremeMode ? '' : 'display:none' }, this.powerFill, this.powerText);
    this.abilityBar = h('div', { class: 'abilities' });
    bar.append(this.powerWrap, this.abilityBar, h('div', { class: 'spacer' }));
    bar.append(h('div', { class: 'stat date', title: 'Spielzeit' }, iconEl(toolIcon('time', 22)), this.topDate));
    if (this.actions.isLocal) {
      this.pauseBtn = this.iconBtn('pause', 'Pause (Pause-Taste)', () => this.actions.togglePause());
      bar.append(h('div', { class: 'grp speedgrp' }, this.iconBtn('zoom', 'Langsamer', () => this.actions.setSpeed(-1), '−'), h('div', { class: 'stat speed' }, this.speedLabel), this.iconBtn('speed', 'Schneller', () => this.actions.setSpeed(1), '+')), this.pauseBtn);
    }
    bar.append(
      this.iconBtn('help', 'Hotkey-Übersicht (F1)', () => this.actions.openHelp()),
      this.iconBtn('encyclopedia', 'Enzyklopädie (F2)', () => this.actions.openEncyclopedia()),
      this.iconBtn('menu', 'Menü (Esc)', () => this.actions.openMenu()),
    );
    this.root.append(bar);
  }

  private iconBtn(tool: string, title: string, onclick: () => void, label?: string): HTMLElement {
    const b = h('button', { class: 'ibtn', title, onclick: () => onclick() });
    if (label) b.append(label);
    else b.append(iconEl(toolIcon(tool, 22)));
    return b;
  }

  /** Missionsziele anzeigen (nur bei Änderung neu aufbauen) */
  setMission(m: MissionView | null): void {
    if (!m) {
      this.missionEl?.remove();
      this.missionEl = null;
      return;
    }
    const sig = JSON.stringify(m);
    if (sig === this.missionSig) return;
    this.missionSig = sig;
    if (!this.missionEl) {
      this.missionEl = h('div', { class: 'panel pp mission' });
      this.root.append(this.missionEl);
    }
    const el = this.missionEl;
    clear(el);
    el.append(h('h4', { text: `${m.name} – Stufe ${m.stage}/${m.stages}: ${m.title}` }));
    for (const o of m.objectives) el.append(h('div', { class: o.done ? 'obj done' : 'obj', text: (o.done ? '✔ ' : '☐ ') + o.text }));
    el.append(h('div', { class: 'crumb', text: m.hint }));
    if (m.complete) el.append(h('b', { text: 'Mission erfüllt!', style: 'color:#7a5a00' }));
  }

  setSpeedLabel(s: number): void {
    this.speedLabel.textContent = `${s}×`;
  }

  setPaused(p: boolean): void {
    this.pauseBtn?.classList.toggle('active', p);
  }

  private buildResBar(): void {
    this.resBar = h('div', { class: 'panel pp resbar' });
    const groups: [string, number[]][] = [
      ['stock', [R.Wood, R.Stone, R.Iron, R.Pitch]],
      ['food', [R.Apple, R.Cheese, R.Meat, R.Bread, R.Ale]],
    ];
    for (const [g, list] of groups) {
      for (const r of list) {
        const val = h('b', { text: '0' });
        const row = h('div', { class: 'row', onclick: () => this.togglePopup(g === 'food' ? 'granary' : 'stock') }, iconEl(resourceIcon(r, 20)), h('span', { class: 'nm', text: RES_INFO[r].name }), h('span', { class: 'wmark', html: WARN_SVG }), val);
        this.sharedApi.tip(row, 'resource', r, `${RES_INFO[r].name} – Klick: ${g === 'food' ? 'Kornspeicher' : 'Lager'}`);
        row.dataset.res = String(r);
        this.resRows[r] = row;
        this.resBar.append(row);
      }
      if (g === 'food') {
        // Vorrat in Monaten: reicht die Nahrung?
        this.foodSum = h('b', { text: '–' });
        const sum = h('div', { class: 'row foodsum', onclick: () => this.togglePopup('granary') }, iconEl(popFactorIcon('food', 20)), h('span', { class: 'nm', text: 'Vorrat' }), h('span', { class: 'wmark', html: WARN_SVG }), this.foodSum);
        attachTooltip(sum, () => (this.lastView ? foodWarnText(this.lastView) : null), { placement: 'element' });
        this.resBar.append(sum);
      }
      this.resBar.append(h('div', { class: 'sep' }));
    }
    const arm = h('b', { text: '0' });
    this.resBar.append(h('div', { class: 'row', title: 'Waffenkammer', onclick: () => this.togglePopup('armory') }, iconEl(resourceIcon(R.Sword, 20)), h('span', { class: 'nm', text: 'Waffen' }), arm));
    this.resRows[999] = arm.parentElement as HTMLElement;
    this.root.append(this.resBar);
  }

  /** Warnhinweis zu einer Ware für den Tooltip (leer, wenn alles in Ordnung ist) */
  private resWarning(res: number): string {
    const v = this.lastView;
    if (!v) return '';
    if (FOOD_RES.includes(res)) return foodLevel(v) === 'ok' ? '' : foodWarnText(v);
    const lv = resLevel(res, v.stock[res] ?? 0, this.armed.has(res));
    return resWarnText(res, v.stock[res] ?? 0, lv);
  }

  private setLevel(el: HTMLElement, lv: Level): void {
    el.classList.toggle('warn', lv === 'warn');
    el.classList.toggle('crit', lv === 'crit');
  }

  /** Anordnung je nach wirksamer Breite (Fensterbreite / UI-Skalierung): kompakt und eng */
  refreshLayout(): void {
    const scale = parseFloat(getComputedStyle(this.root).getPropertyValue('--ui-scale')) || 1;
    const w = window.innerWidth / scale;
    this.root.classList.toggle('compact', w < 1180);
    this.root.classList.toggle('tight', w < 940);
    this.root.classList.toggle('short', window.innerHeight / scale < 640);
  }

  openCategory(i: number): void {
    this.build.openCategory(i);
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
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => t.remove(), 4500);
  }

  // ---------- Update ----------
  update(view: PlayerView | null, sel: SelectionState): void {
    if (view) {
      this.lastView = view;
      const ex = explainPopularity(view);
      this.topGold.textContent = String(view.gold);
      this.topPop.textContent = `${view.peasants}/${view.housing}`;
      this.topPopularity.textContent = String(Math.round(view.popularity));
      const face = Math.round(view.popularity / 5);
      if (face !== this.lastFace) {
        this.lastFace = face;
        this.topFace.innerHTML = popFaceIcon(view.popularity, 28);
      }
      this.topDelta.textContent = deltaText(ex);
      this.topDelta.className = 'delta ' + (ex.pending ? '' : ex.direction === 'up' ? 'pos' : ex.direction === 'down' ? 'neg' : '');
      this.topTroops.textContent = `${view.troops}/${view.troopLimit}`;
      this.topFear.textContent = (view.fear > 0 ? '+' : '') + view.fear;
      this.setLevel(this.statGold, goldLevel(view));
      this.setLevel(this.statPeasants, peasantLevel(view));
      this.setLevel(this.statPop, popularityLevel(view));
      this.setLevel(this.statTroops, troopLevel(view));
      const month = this.world.month;
      this.topDate.textContent = `${MONTHS[month % 12]} ${Math.floor(month / 12) + 1}`;
      for (const r of [...STOCK_RES, ...FOOD_RES]) {
        const row = this.resRows[r];
        if (!row) continue;
        const v = view.stock[r];
        (row.lastElementChild as HTMLElement).textContent = String(v);
        const lim = RES_LIMITS[r];
        if (lim && v >= lim.arm) this.armed.add(r);
        const lv: Level = FOOD_RES.includes(r) ? (foodLevel(view) === 'crit' && v <= 0 ? 'crit' : 'ok') : resLevel(r, v, this.armed.has(r));
        this.setLevel(row, lv);
      }
      const fs = foodSupply(view);
      const fl = foodLevel(view);
      this.foodSum.textContent = view.foodShort ? 'Hunger' : Number.isFinite(fs.months) ? `${fs.months >= 10 ? '10+' : fs.months.toFixed(1).replace('.', ',')} Mon.` : '–';
      this.setLevel(this.foodSum.parentElement as HTMLElement, fl);
      let arm = 0;
      for (const r of ARMORY_RES) arm += view.stock[r];
      if (this.resRows[999]) (this.resRows[999].lastElementChild as HTMLElement).textContent = String(arm);
      this.build.refresh(view, this.actions.currentMode());
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
      const b = h('button', { class: 'ability' + (ok ? '' : ' off'), disabled: !ok, onclick: () => onPick(a.id) }, iconEl(abilityIcon(a.id, 24)), h('span', { class: 'cost', text: String(a.cost) }), cd > 0 ? h('span', { class: 'cd', text: `${Math.ceil(cd)}s` }) : null);
      this.sharedApi.tip(b, 'ability', a.id, `${a.name} – ${a.cost} Macht [${a.hotkey.replace(/^Key/, '')}]`);
      this.abilityBar.append(b);
    }
  }

  // ---------- Info-Panel ----------
  private lastInfoKey = '';
  private infoFrozen = false;
  private showIdleInfo(): void {
    clear(this.info);
    this.info.append(
      h('h3', { text: 'StrongPoly' }),
      h('div', { class: 'crumb', html: 'Linksklick: auswählen · Rahmen ziehen: Truppen wählen<br>Rechtsklick: Befehl / Bauen abbrechen<br>Strg+Z: letzte Platzierung zurücknehmen<br>F1: Hotkeys · F2: Enzyklopädie · Leertaste: letzte Meldung' }),
    );
  }

  private updateInfo(sel: SelectionState): void {
    if (this.infoFrozen) return;
    const w = this.world;
    const v = this.lastView;
    let key: string;
    if (sel.building) {
      const b = w.buildings.get(sel.building);
      key = b && v ? this.context.key(b, v) : 'nob';
    } else if (sel.units.length || sel.pool.length) {
      // Lebensbalken nur in 10-%-Stufen und Typverteilung: so selten wie möglich neu aufbauen
      let hp = 0;
      let n = 0;
      let alive = 0;
      for (const id of sel.pool.length ? sel.pool : sel.units) {
        const s = w.slotOf(id);
        if (s < 0) continue;
        alive++;
        if (sel.units.includes(id)) {
          hp += w.hp[s] / 255;
          n++;
        }
      }
      key = `U|${alive}|${sel.units.length}|${sel.units[0] ?? 0}|${n ? Math.round((hp / n) * 10) : 0}|${this.actions.currentMode()}`;
    } else key = 'idle';
    if (key === this.lastInfoKey) return;
    this.lastInfoKey = key;
    if (sel.building) {
      const b = w.buildings.get(sel.building);
      if (b && v) return this.context.render(b, v);
    }
    if (sel.units.length || sel.pool.length) return this.troops.render(sel);
    this.showIdleInfo();
  }

  // ---------- Popups ----------
  togglePopup(kind: string): void {
    if (this.popupEl && this.popupKind === kind) return this.closePopup();
    this.closePopup();
    this.popupKind = kind;
    this.popupEl = h('div', { class: `panel pp popup ${kind}` });
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
    const sig = this.popupKind === 'market' ? `${this.popupKind}|${v.gold}|${v.stock.join(',')}|${v.priceMul.join(',')}` : `${this.popupKind}|${v.gold}|${v.stock.join(',')}|${v.tax}|${v.ration}|${(v.popularity * 10) | 0}|${v.peasants}|${v.housing}|${v.foodShort}|${v.foodTypes}|${v.aleCover.toFixed(2)}|${v.relCover.toFixed(2)}|${v.factors.map((f) => f.value.toFixed(1)).join(',')}`;
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
      g.append(iconEl(resourceIcon(r, 22)), h('span', { text: RES_INFO[r].name }), h('b', { text: String(v.stock[r]) }));
    }
    el.append(g);
    el.append(h('div', { class: 'bar', style: 'margin-top:10px' }, h('div', { style: `width:${v.cap[idx] ? (v.used[idx] / v.cap[idx]) * 100 : 0}%` })));
    el.append(h('div', { class: 'crumb', text: `Belegung ${v.used[idx]} / ${v.cap[idx]} – erweitert sich durch angrenzende Module` }));
  }

  private popupMarket(el: HTMLElement, v: PlayerView): void {
    el.append(h('div', { class: 'crumb', text: `Gold: ${v.gold} · Verkauf zu ${Math.round(SELL_RATIO * 100)} % des Preises. Preise schwanken mit Angebot und Nachfrage.` }));
    el.append(marketGrid(this.sharedApi, v));
  }

  private popupPopularity(el: HTMLElement, v: PlayerView): void {
    popularityBreakdown(el, v, { openAdmin: () => this.togglePopup('admin'), close: () => this.closePopup() });
  }

  private popupAdmin(el: HTMLElement, v: PlayerView): void {
    adminControls(el, v, this.actions);
  }

  /** Meldung groß einblenden */
  banner(text: string, color = '#f0c040'): void {
    const b = h('div', { class: 'banner-msg', text, style: `color:${color}` });
    this.root.append(b);
    setTimeout(() => b.remove(), 4000);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.minimap.destroy();
    this.root.remove();
  }
}

function coinIcon(): string {
  return `<svg viewBox="0 0 64 64" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><g stroke="#241a12" stroke-width="3" stroke-linejoin="round"><polygon points="32,6 52,16 52,44 32,56 12,44 12,16" fill="#f0c040"/><polygon points="32,6 52,16 52,44 32,32" fill="#d9a520"/><polygon points="32,32 12,16 12,44 32,56" fill="#f7d96a"/></g></svg>`;
}

/** Marktliste: Kaufen/Verkaufen je 1 und 5, Preise live */
export function marketGrid(api: HudShared, v: PlayerView): HTMLElement {
  const g = h('div', { class: 'market' });
  g.append(h('b', { text: 'Ware' }), h('b', { text: 'Bestand' }), h('b', { text: 'Kauf' }), h('b', { text: 'Verkauf' }), h('b', { text: '' }));
  for (let r = 0; r < RES_COUNT; r++) {
    const price = RES_INFO[r].price * v.priceMul[r];
    const mk = (buy: boolean, n: number) => {
      const can = buy ? v.gold >= price * n : v.stock[r] >= n;
      return h('button', { class: buy ? 'buy' : 'sell', text: `${buy ? '+' : '−'}${n}`, disabled: !can, title: `${n} ${buy ? 'kaufen' : 'verkaufen'}: ${(price * n * (buy ? 1 : SELL_RATIO)).toFixed(1)} Gold`, onclick: () => api.actions.send({ c: 'trade', res: r, amount: n, buy }) });
    };
    const trend = v.priceMul[r] > 1.02 ? '▲' : v.priceMul[r] < 0.98 ? '▼' : '';
    g.append(
      h('span', { class: 'mname' }, iconEl(resourceIcon(r, 20)), ' ' + RES_INFO[r].name),
      h('span', { text: String(v.stock[r]) }),
      h('span', { text: `${price.toFixed(1)} ${trend}`, class: v.priceMul[r] > 1.02 ? 'neg' : v.priceMul[r] < 0.98 ? 'pos' : '' }),
      h('span', { text: (price * SELL_RATIO).toFixed(1) }),
      h('span', { class: 'mbtns' }, mk(true, 1), mk(true, 5), mk(false, 1), mk(false, 5)),
    );
  }
  return g;
}

/** Beliebtheit: Detailansicht (Zahl, Entwicklung, Faktoren, Warnungen, Hinweise) – dieselbe Funktion für Taste L, Klick und Bergfried */
export function popularityBreakdown(el: HTMLElement, v: PlayerView, hooks: { openAdmin?: () => void; close?: () => void } = {}): void {
  renderPopularityDetail(el, v, hooks);
}

/** Steuern und Rationen (Bergfried / Verwaltung) */
export function adminControls(el: HTMLElement, v: PlayerView, actions: HudActions): void {
  const taxSlider = h('input', {
    type: 'range',
    min: String(TAX_LEVELS[0]),
    max: String(TAX_LEVELS[TAX_LEVELS.length - 1]),
    step: '1',
    value: String(v.tax),
    oninput: (e) => actions.send({ c: 'setTax', level: Number((e.target as HTMLInputElement).value) }),
  });
  const rationSlider = h('input', {
    type: 'range',
    min: '0',
    max: '4',
    step: '1',
    value: String(v.ration),
    oninput: (e) => actions.send({ c: 'setRation', level: Number((e.target as HTMLInputElement).value) }),
  });
  const monthGold = v.peasants * TAX_GOLD[v.tax];
  el.append(
    h('div', { class: 'form' },
      h('span', { text: 'Steuern' }),
      h('div', {}, taxSlider, h('div', { class: 'crumb', text: v.tax < 0 ? `Bestechung: ${-TAX_GOLD[v.tax]} Gold je Bauer/Monat, Beliebtheit +${TAX_POP[v.tax]}` : v.tax === 0 ? 'Keine Steuern' : `${TAX_GOLD[v.tax]} Gold je Bauer/Monat, Beliebtheit ${TAX_POP[v.tax]}` }), h('div', { class: monthGold >= 0 ? 'pos crumb' : 'neg crumb', text: `≈ ${monthGold >= 0 ? '+' : ''}${monthGold.toFixed(0)} Gold pro Monat (${TICKS_PER_MONTH / 10} s)` })),
      h('span', { text: 'Rationen' }),
      h('div', {}, rationSlider, h('div', { class: 'crumb', text: RATION_NAMES[v.ration] })),
    ),
  );
  el.append(h('div', { class: 'crumb', text: `Bauern ${v.peasants} / ${v.housing} · Pferde ${v.horses}` }));
}

void BT;
void buildingIcon;
void renderPopularitySummary;
void TAX_POP;

/** Kleines Warndreieck (eigenes Symbol) für Mangelanzeigen */
const WARN_SVG = `<svg viewBox="0 0 20 20" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><polygon points="10,2 19,18 1,18" fill="#f0b030" stroke="#3a2512" stroke-width="1.6" stroke-linejoin="round"/><rect x="9" y="7.5" width="2" height="5.5" fill="#3a2512"/><rect x="9" y="14" width="2" height="2" fill="#3a2512"/></svg>`;
