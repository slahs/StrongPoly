import {
  BT,
  BUILDINGS,
  BuildingDef,
  ClientBuilding,
  FOOD_RES,
  INN_SERVES,
  PlayerView,
  R,
  RATION_FOOD,
  RELIGION_COVER,
  RELIGION_POP,
  RES_COUNT,
  RES_INFO,
  UNITS,
  UnitDef,
  ARMORY_RES,
  PLAYER_COLORS,
  STOCK_RES,
} from '@strongpoly/shared';
import { clear, h } from './dom';
import { adminControls, HudShared, marketGrid, popularityBreakdown } from './hud';
import { buildingIcon, iconEl, popFaceIcon, resourceIcon, unitIcon } from './icons';

/** Warum eine Einheit gerade nicht rekrutiert werden kann (leer = möglich) */
export function recruitMissing(ud: UnitDef, v: PlayerView): string[] {
  const out: string[] = [];
  if (v.gold < ud.cost.gold) out.push(`${ud.cost.gold - v.gold} Gold`);
  for (const [r, a] of ud.cost.res ?? []) if (v.stock[r] < a) out.push(`${a - v.stock[r]} ${RES_INFO[r].name}`);
  if (ud.cost.horse && v.horses < 1) out.push('1 Pferd');
  const crew = ud.cost.crew ?? 1;
  if (v.peasants < crew) out.push(`${crew - v.peasants} Bauer${crew - v.peasants > 1 ? 'n' : ''}`);
  if (v.troops + ud.troops > v.troopLimit) out.push('Truppenlimit');
  return out;
}

export function unitCostText(ud: UnitDef): string {
  const parts = [`${ud.cost.gold} Gold`];
  for (const [r, a] of ud.cost.res ?? []) parts.push(`${a} ${RES_INFO[r].name}`);
  if (ud.cost.horse) parts.push('1 Pferd');
  parts.push(ud.cost.crew ? `${ud.cost.crew} Bauern` : '1 Bauer');
  return parts.join(', ');
}

/** Rückerstattung beim Abreißen (halbes Holz/Stein/Eisen, siehe Befehl `demolish`) */
export function demolishRefund(def: BuildingDef): string {
  const c = def.cost;
  const parts: string[] = [];
  if (c.wood) parts.push(`${Math.floor(c.wood / 2)} Holz`);
  if (c.stone) parts.push(`${Math.floor(c.stone / 2)} Stein`);
  if (c.iron) parts.push(`${Math.floor(c.iron / 2)} Eisen`);
  return parts.length ? parts.join(', ') : 'keine';
}

/** Kontextpanel der Panelmitte für angewählte Gebäude */
export class ContextPanel {
  constructor(
    private api: HudShared,
    private root: HTMLElement,
  ) {}

  /** Schlüssel der sichtbaren Zustände: nur bei Änderung wird neu aufgebaut (so selten wie möglich, damit Klicks nicht ins Leere gehen) */
  key(b: ClientBuilding, v: PlayerView): string {
    const def = BUILDINGS[b.t];
    let s = `B|${b.i}|${b.hp}|${b.s}|${b.q}|${b.c}|${b.b}|${b.p >> 4}|${b.f}|${b.u}`;
    if (b.o !== this.api.me()) return s;
    const st = (list: readonly number[]) => list.map((r) => v.stock[r]).join(',');
    switch (b.t) {
      case BT.Keep:
        return s + `|${v.tax}|${v.ration}|${v.peasants}|${v.popularity | 0}|${v.popDelta.toFixed(1)}`;
      case BT.Granary:
        return s + `|${v.ration}|${v.peasants}|${st(FOOD_RES)}|${v.foodShort}`;
      case BT.Stockpile:
        return s + `|${st(STOCK_RES)}|${v.used[0]}`;
      case BT.Armory:
        return s + `|${st(ARMORY_RES)}|${v.used[2]}`;
      case BT.Market:
        return s + `|${v.gold}|${v.stock.join(',')}|${v.priceMul.join(',')}`;
      case BT.Barracks:
      case BT.MercPost:
      case BT.EngineerGuild:
        return s + `|${v.gold}|${st(ARMORY_RES)}|${v.horses}|${v.peasants}|${v.troops}`;
      case BT.Inn:
        return s + `|${(v.aleCover * 50) | 0}|${v.stock[R.Ale]}`;
      case BT.Cauldron:
        return s + `|${v.stock[R.Pitch]}`;
      case BT.Stable:
        return s + `|${v.horses}`;
      case BT.Hovel:
      case BT.Campfire:
        return s + `|${v.peasants}|${v.housing}`;
      default:
    }
    if (def.religion) return s + `|${(v.relCover * 50) | 0}`;
    if (def.prod) {
      const rec = def.prod.recipes[Math.min(b.c, def.prod.recipes.length - 1)];
      return s + `|${rec.in.map(([r]) => v.stock[r]).join(',')}`;
    }
    return s;
  }

  render(b: ClientBuilding, v: PlayerView): void {
    const el = this.root;
    clear(el);
    const def = BUILDINGS[b.t];
    const mine = b.o === this.api.me();
    const head = h('div', { class: 'ctx-head' }, h('div', { class: 'ctx-ic', html: buildingIcon(b.t, 44) }), h('div', {}, h('h3', { text: def.name }), h('div', { class: 'crumb', text: `${def.w}×${def.h}${mine ? '' : ' · ' + (this.api.world.players[b.o]?.name ?? '?')}` })));
    el.append(head);
    const maxHp = def.hp;
    if (maxHp > 0) {
      el.append(h('div', { class: 'hpbar' }, h('div', { style: `width:${Math.min(100, (b.hp / maxHp) * 100)}%` })));
      el.append(h('div', { class: 'kv' }, 'Zustand', h('b', { text: `${b.hp}/${maxHp}${b.f & 1 ? ' – brennt!' : ''}${b.f & 2 ? ' – wird repariert' : ''}` })));
    }
    if (!mine) return;
    this.body(el, b, v, def);
    this.footer(el, b, def, maxHp);
  }

  private body(el: HTMLElement, b: ClientBuilding, v: PlayerView, def: BuildingDef): void {
    const act = this.api.actions;
    switch (b.t) {
      case BT.Keep: {
        el.append(h('div', { class: 'popwrap small' }, h('span', { class: 'face', html: popFaceIcon(v.popularity, 40) }), h('div', {}, h('b', { text: `Beliebtheit ${v.popularity.toFixed(0)}` }), h('div', { class: v.popDelta >= 0 ? 'pos' : 'neg', text: `${v.popDelta >= 0 ? '+' : ''}${v.popDelta.toFixed(1)} pro Monat` }))));
        adminControls(el, v, act);
        el.append(h('div', { class: 'btns' }, h('button', { text: 'Beliebtheit im Detail', onclick: () => this.api.togglePopup('popularity') })));
        return;
      }
      case BT.Granary: {
        const n = v.peasants;
        let food = 0;
        const list = h('div', { class: 'grid2' });
        for (const r of FOOD_RES) {
          food += v.stock[r];
          list.append(iconEl(resourceIcon(r, 20)), h('span', { text: RES_INFO[r].name }), h('b', { text: String(v.stock[r]) }));
        }
        const perMonth = RATION_FOOD[v.ration] * n;
        el.append(list);
        el.append(h('div', { class: 'kv' }, 'Belegung', h('b', { text: `${v.used[1]}/${v.cap[1]}` })));
        el.append(h('div', { class: 'kv' }, 'Verbrauch', h('b', { text: `${perMonth.toFixed(0)} pro Monat` })));
        el.append(h('div', { class: v.foodShort ? 'neg' : 'crumb', text: perMonth > 0 ? `Vorrat reicht ≈ ${(food / perMonth).toFixed(1)} Monate` : 'Keine Rationen – nichts wird verbraucht' }));
        const sl = h('input', { type: 'range', min: '0', max: '4', step: '1', value: String(v.ration), oninput: (e) => act.send({ c: 'setRation', level: Number((e.target as HTMLInputElement).value) }) });
        el.append(h('div', { class: 'kv' }, 'Rationen', h('b', { text: ['Keine', 'Halbe', 'Normale', 'Extra', 'Doppelte'][v.ration] })), sl);
        return;
      }
      case BT.Stockpile: {
        const g = h('div', { class: 'grid2' });
        for (const r of STOCK_RES) g.append(iconEl(resourceIcon(r, 20)), h('span', { text: RES_INFO[r].name }), h('b', { text: String(v.stock[r]) }));
        el.append(g, h('div', { class: 'bar' }, h('div', { style: `width:${v.cap[0] ? (v.used[0] / v.cap[0]) * 100 : 0}%` })), h('div', { class: 'crumb', text: `Belegung ${v.used[0]}/${v.cap[0]} · Module müssen aneinander grenzen` }));
        return;
      }
      case BT.Armory: {
        const g = h('div', { class: 'grid2' });
        for (const r of ARMORY_RES) g.append(iconEl(resourceIcon(r, 20)), h('span', { text: RES_INFO[r].name }), h('b', { text: String(v.stock[r]) }));
        el.append(g, h('div', { class: 'bar' }, h('div', { style: `width:${v.cap[2] ? (v.used[2] / v.cap[2]) * 100 : 0}%` })), h('div', { class: 'crumb', text: `Belegung ${v.used[2]}/${v.cap[2]}` }));
        return;
      }
      case BT.Barracks:
      case BT.MercPost:
      case BT.EngineerGuild:
        return this.recruitList(el, b, v);
      case BT.Market: {
        el.append(h('div', { class: 'crumb', text: `Gold ${v.gold} · Kaufen +1/+5, Verkaufen −1/−5` }));
        el.append(marketGrid(this.api, v));
        return;
      }
      case BT.Inn: {
        const served = Math.min(v.peasants, INN_SERVES);
        el.append(h('div', { class: 'kv' }, 'Bierabdeckung (alle Schenken)', h('b', { text: `${(v.aleCover * 100).toFixed(0)} %` })), h('div', { class: 'bar' }, h('div', { style: `width:${v.aleCover * 100}%` })));
        el.append(h('div', { class: 'kv' }, 'Bier im Vorrat', h('b', { text: String(v.stock[R.Ale]) })));
        el.append(h('div', { class: 'crumb', text: `Eine Schenke versorgt bis zu ${INN_SERVES} Bauern (hier ≈ ${served}). Braucht Bier aus der Brauerei und einen Wirt.` }));
        el.append(h('div', { class: 'kv' }, 'Wirt', h('b', { text: `${b.s}/${def.workers || 1}` })));
        return;
      }
      default:
    }
    if (def.religion) {
      el.append(h('div', { class: 'kv' }, 'Glaubensabdeckung (alle Kirchen)', h('b', { text: `${(v.relCover * 100).toFixed(0)} %` })), h('div', { class: 'bar' }, h('div', { style: `width:${v.relCover * 100}%` })));
      el.append(h('div', { class: 'kv' }, 'Reichweite', h('b', { text: `${RELIGION_COVER[def.religion]} Bauern` })), h('div', { class: 'kv' }, 'Beliebtheitswirkung', h('b', { text: `+${RELIGION_POP[def.religion]} (mit Priester)` })));
      el.append(h('div', { class: 'kv' }, 'Priester', h('b', { text: `${b.s}/${def.workers}` })));
      return;
    }
    if (def.prod && def.workers > 0) return this.workshop(el, b, v, def);
    if (b.t === BT.Cauldron) {
      el.append(h('div', { class: 'kv' }, 'Pech im Lager', h('b', { text: String(v.stock[R.Pitch]) })), h('div', { class: 'crumb', text: 'Gießt kochendes Öl auf Angreifer am Fuß der Mauer; jeder Guss verbraucht 1 Pech.' }));
      return;
    }
    if (b.t === BT.Stable) {
      el.append(h('div', { class: 'kv' }, 'Pferde', h('b', { text: String(v.horses) })), h('div', { class: 'crumb', text: 'Pferde werden nach und nach gezüchtet; Ritter und Reiter brauchen je eins.' }));
      return;
    }
    if (def.housing) {
      el.append(h('div', { class: 'kv' }, 'Wohnraum', h('b', { text: `+${def.housing}` })), h('div', { class: 'kv' }, 'Bauern', h('b', { text: `${v.peasants}/${v.housing}` })));
      return;
    }
    if (b.t === BT.Campfire) {
      el.append(h('div', { class: 'kv' }, 'Bauern', h('b', { text: `${v.peasants}/${v.housing}` })), h('div', { class: 'crumb', text: 'Hier erscheinen neue Bauern, solange die Beliebtheit ≥ 50 ist.' }));
      return;
    }
    if (def.gate) {
      el.append(h('div', { class: 'crumb', text: b.f & 4 ? 'Das Tor ist offen.' : 'Lässt nur deine Einheiten durch. Rammen und Feuer öffnen es für den Feind.' }));
      return;
    }
    if (b.t === BT.TowerRound) {
      el.append(h('div', { class: 'kv' }, 'Geschütz', h('b', { text: b.u === 1 ? 'Ballista' : b.u === 2 ? 'Mangonel' : 'keines' })));
      return;
    }
    if (def.desc) el.append(h('div', { class: 'crumb', text: def.desc }));
  }

  /** Werkstatt: Rezeptwahl, Arbeiter an/aus, Fortschritt */
  private workshop(el: HTMLElement, b: ClientBuilding, v: PlayerView, def: BuildingDef): void {
    const prod = def.prod!;
    const off = !!(b.f & 8);
    el.append(h('div', { class: 'kv' }, 'Arbeiter', h('b', { text: `${b.s}/${def.workers}${off ? ' (aus)' : ''}` })));
    if (prod.recipes.length > 1) {
      const row = h('div', { class: 'recipes' });
      prod.recipes.forEach((r, i) => {
        const bt = h('button', { class: 'recipe' + (i === b.c ? ' active' : ''), title: `${r.name}: ${r.in.length ? r.in.map(([x, a]) => `${a} ${RES_INFO[x].name}`).join(' + ') + ' → ' : ''}${r.outAmt} ${RES_INFO[r.out].name} in ${r.time} s`, onclick: () => this.api.actions.send({ c: 'setRecipe', building: b.i, recipe: i }) }, iconEl(resourceIcon(r.out, 22)), h('span', { text: RES_INFO[r.out].name }));
        row.append(bt);
      });
      el.append(row);
    }
    const rec = prod.recipes[Math.min(b.c, prod.recipes.length - 1)];
    el.append(h('div', { class: 'kv' }, 'Herstellung', h('b', { text: `${rec.outAmt}× ${RES_INFO[rec.out].name} / ${rec.time} s` })));
    if (rec.in.length) el.append(h('div', { class: 'kv' }, 'Benötigt', h('b', { text: rec.in.map(([x, a]) => `${a} ${RES_INFO[x].name} (${v.stock[x]})`).join(', ') })));
    el.append(h('div', { class: 'kv' }, 'Fortschritt', h('b', { text: off ? 'abgeschaltet' : `${b.p} %` })), h('div', { class: 'bar' }, h('div', { style: `width:${off ? 0 : b.p}%` })));
    el.append(h('div', { class: 'kv' }, 'Ausgabepuffer', h('b', { text: `${b.b}/${prod.batch}` })));
    el.append(
      h('div', { class: 'btns' }, h('button', { class: off ? 'primary' : '', text: off ? 'Arbeiter einsetzen' : 'Arbeiter abziehen', title: 'Schaltet die Produktion dieses Gebäudes aus bzw. an', onclick: () => this.api.actions.send({ c: 'setWork', building: b.i, on: off }) })),
    );
  }

  /** Rekrutierungsliste mit Grund, warum eine Einheit ausgegraut ist */
  private recruitList(el: HTMLElement, b: ClientBuilding, v: PlayerView): void {
    const producer = b.t === BT.Barracks ? 'barracks' : b.t === BT.MercPost ? 'merc' : 'guild';
    el.append(h('div', { class: 'kv' }, 'Warteschlange', h('b', { text: String(b.q) })), h('div', { class: 'kv' }, 'Truppen', h('b', { text: `${v.troops}/${v.troopLimit}` })));
    const grid = h('div', { class: 'recruit' });
    const me = this.api.world.players[this.api.me()];
    for (const ud of UNITS) {
      if (ud.producer !== producer) continue;
      const miss = recruitMissing(ud, v);
      const ok = miss.length === 0;
      const card = h(
        'button',
        {
          class: 'unitcard' + (ok ? '' : ' off'),
          onclick: (e) => this.api.actions.send({ c: 'recruit', building: b.i, unit: ud.id, count: e.shiftKey ? 5 : 1 }),
        },
        h('div', { class: 'ic', html: unitIcon(ud.id, me ? PLAYER_COLORS[me.color % PLAYER_COLORS.length] : undefined, 38) }),
        h('div', { class: 'nm', text: ud.name }),
        h('div', { class: 'cs' + (ok ? '' : ' neg'), text: ok ? unitCostText(ud) : 'Fehlt: ' + miss.join(', ') }),
      );
      this.api.tip(card, 'unit', ud.id);
      grid.append(card);
    }
    el.append(grid, h('div', { class: 'crumb', text: 'Umschalt+Klick: 5 Einheiten auf einmal' }));
  }

  private footer(el: HTMLElement, b: ClientBuilding, def: BuildingDef, maxHp: number): void {
    const btns = h('div', { class: 'btns' });
    if (b.t === BT.Market) btns.append(h('button', { text: 'Großer Marktdialog', onclick: () => this.api.togglePopup('market') }));
    if (def.store) btns.append(h('button', { text: 'Bestandsliste', onclick: () => this.api.togglePopup(def.store === 'granary' ? 'granary' : def.store === 'armory' ? 'armory' : 'stock') }));
    if (b.t === BT.Campfire || b.t === BT.Hovel) btns.append(h('button', { text: 'Verwaltung', onclick: () => this.api.togglePopup('admin') }));
    if (maxHp > 0 && b.hp < maxHp) btns.append(h('button', { text: 'Reparieren', title: 'Ein Arbeiter repariert das Gebäude (kostet nichts)', onclick: () => this.api.actions.send({ c: 'repair', building: b.i }) }));
    if (b.t !== BT.Keep && b.t !== BT.Campfire) btns.append(h('button', { class: 'danger', text: 'Abreißen', title: `Rückerstattung: ${demolishRefund(def)}`, onclick: () => this.api.actions.send({ c: 'demolish', ids: [b.i] }) }));
    if (b.t === BT.PitchDitch) btns.append(h('button', { text: 'Entzünden', title: 'Benötigt einen Ingenieur in der Nähe', onclick: () => this.api.actions.send({ c: 'igniteDitch', x: b.x, y: b.y }) }));
    if (btns.childNodes.length) el.append(btns);
    void RES_COUNT;
  }
}
