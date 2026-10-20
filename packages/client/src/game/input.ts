import * as THREE from 'three';
import { BUILDINGS, BT, BuildingDef, checkPlaceRules, ClientWorld, Formation, UNITS, U } from '@strongpoly/shared';
import type { GhostPlacement } from '../render/ghost';
import { comboOf, loadHotkeys, HotkeyAction } from './hotkeys';
import { ENEMY_BUILD_RADIUS, RES_INFO } from '@strongpoly/shared';
import type { Session } from './session';
import { groundYAt } from '../render/util';

export type Mode =
  | { k: 'normal' }
  | { k: 'place'; type: number; rot: number }
  | { k: 'dig'; fill: boolean }
  | { k: 'ability'; id: number }
  | { k: 'attackMove' }
  | { k: 'patrol' }
  | { k: 'attackGround' }
  | { k: 'demolish' }
  | { k: 'repair' }
  | { k: 'tunnel' }
  | { k: 'ignite' };

function bresenham(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;
  for (let i = 0; i < 120; i++) {
    pts.push([x, y]);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return pts;
}

/** Maus- und Tastatursteuerung. Erzeugt ausschließlich Befehle (nie direkter Zustandseingriff). */
export class InputController {
  mode: Mode = { k: 'normal' };
  keys = new Set<string>();
  hotkeys = loadHotkeys();
  mouse = { x: 0, y: 0, inside: false, overUi: false };
  private downPos: { x: number; y: number } | null = null;
  private boxEl: HTMLElement;
  private dragTile: { x: number; y: number } | null = null;
  private lastClick = { t: 0, type: -1 };
  formation: number = Formation.Free;
  private groupTap = { n: 0, t: 0 };
  private disposers: (() => void)[] = [];
  private hover: { x: number; y: number; fx: number; fy: number } | null = null;
  private ghostLabel: HTMLElement;
  private placeInfo: { n: number; okCount: number; reason: string | null; cost: string; name: string; hint: string | null } | null = null;

  constructor(private s: Session) {
    const canvas = s.gs.canvas;
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'selbox';
    this.boxEl.style.display = 'none';
    s.uiRoot.append(this.boxEl);
    this.ghostLabel = document.createElement('div');
    this.ghostLabel.className = 'ghostlabel';
    this.ghostLabel.style.display = 'none';
    s.uiRoot.append(this.ghostLabel);
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, ev: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(ev, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(ev, fn as EventListener));
    };
    void on;
    const add = (t: EventTarget, ev: string, fn: (e: any) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn, o);
      this.disposers.push(() => t.removeEventListener(ev, fn));
    };
    add(canvas, 'mousedown', (e: MouseEvent) => this.onDown(e));
    add(window, 'mousemove', (e: MouseEvent) => this.onMove(e));
    add(window, 'mouseup', (e: MouseEvent) => this.onUp(e));
    add(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    add(canvas, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      // Beim Platzieren dreht das Mausrad das Gebäude (Umschalt+Rad zoomt)
      if (this.mode.k === 'place' && !e.shiftKey && BUILDINGS[this.mode.type].placement !== 'onWall') this.mode.rot ^= 1;
      else s.gs.cam.zoom(e.deltaY);
    }, { passive: false });
    add(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    add(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));
    add(document, 'mouseleave', () => (this.mouse.inside = false));
    add(window, 'blur', () => this.keys.clear());
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.boxEl.remove();
    this.ghostLabel.remove();
  }

  reloadHotkeys(): void {
    this.hotkeys = loadHotkeys();
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.dragTile = null;
    this.s.ghost.hide();
    this.ghostLabel.style.display = 'none';
    this.s.hud.setHint(
      m.k === 'place' ? `${BUILDINGS[m.type].name} platzieren – Linksklick bauen${BUILDINGS[m.type].line ? ' (ziehen für Linie)' : ''}, R drehen, Rechtsklick/Esc abbrechen`
      : m.k === 'dig' ? (m.fill ? 'Rechteck ziehen: Graben zuschütten' : 'Rechteck ziehen: Wassergraben ausheben')
      : m.k === 'ability' ? 'Zielgebiet anklicken – Esc abbrechen'
      : m.k === 'attackMove' ? 'Angriffsmarsch: Ziel anklicken'
      : m.k === 'patrol' ? 'Patrouille: Zielpunkt anklicken'
      : m.k === 'attackGround' ? 'Bodenangriff: Zielpunkt anklicken'
      : m.k === 'demolish' ? 'Abreißen: Gebäude anklicken (halbes Holz/Stein/Eisen zurück) – Rechtsklick/Esc beendet'
      : m.k === 'repair' ? 'Reparieren: beschädigtes Gebäude anklicken – Rechtsklick/Esc beendet'
      : m.k === 'tunnel' ? 'Tunnel: Zielpunkt anklicken (Tunnelgräber)'
      : m.k === 'ignite' ? 'Pechgraben anklicken, um ihn zu entzünden (Ingenieur in der Nähe nötig)' : null,
    );
  }

  // ----- Hilfen -----
  private ndc(cx: number, cy: number): [number, number] {
    const r = this.s.gs.canvas.getBoundingClientRect();
    return [((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1)];
  }

  groundAt(cx: number, cy: number): { x: number; y: number } | null {
    const [nx, ny] = this.ndc(cx, cy);
    return this.s.gs.cam.pick(nx, ny, this.s.world.map);
  }

  private project(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(x, z, y).project(this.s.gs.cam.camera);
    return out;
  }

  /** Einheit unter dem Mauszeiger (Bildschirmabstand) */
  unitAt(cx: number, cy: number, filter: (s: number) => boolean): number {
    const w = this.s.world;
    const r = this.s.gs.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best = -1;
    let bd = 24 * 24;
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s] || !filter(s)) continue;
      const x = w.curX[s];
      const y = w.curY[s];
      const gy = groundYAt(w, x, y) + 0.45;
      this.project(x, y, gy, v);
      if (v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * r.width + r.left;
      const sy = ((1 - v.y) / 2) * r.height + r.top;
      const d = (sx - cx) ** 2 + (sy - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private selectable = (s: number): boolean => {
    const w = this.s.world;
    return w.owner[s] === this.s.me && w.type[s] !== U.Peasant && w.type[s] !== U.Ox;
  };

  private visibleEnemy = (s: number): boolean => {
    const w = this.s.world;
    if (this.s.teamOf[w.owner[s]] === this.s.myTeam) return false;
    if (w.flags[s] & 8) return false;
    return !this.s.fog || this.s.fog.visible(w.curX[s], w.curY[s]);
  };

  // ----- Platzierung -----
  private placementsFor(def: BuildingDef, rot: number, hx: number, hy: number): GhostPlacement[] {
    const s = this.s;
    const w = rot ? def.h : def.w;
    const h = rot ? def.w : def.h;
    const tile = (px: number, py: number): [number, number] => [Math.floor(px - w / 2 + 0.5), Math.floor(py - h / 2 + 0.5)];
    const view = s.world.view;
    const out: GhostPlacement[] = [];
    let list: [number, number][];
    if (def.line && this.dragTile) list = bresenham(this.dragTile.x, this.dragTile.y, Math.floor(hx), Math.floor(hy));
    else list = [tile(hx, hy)];
    // Gesamtkosten gegen Bestand prüfen; der erste Grund, warum nicht gebaut werden kann, wird am Cursor angezeigt
    let n = 0;
    let reason: string | null = null;
    let okCount = 0;
    for (const [x, y] of list) {
      const err = checkPlaceRules(s.world, s.me, def.id, x, y, rot);
      n++;
      const c = def.cost;
      const poor =
        !view ||
        (c.gold ?? 0) * n > view.gold ||
        (c.wood ?? 0) * n > view.stock[0] ||
        (c.stone ?? 0) * n > view.stock[1] ||
        (c.iron ?? 0) * n > view.stock[2] ||
        (c.pitch ?? 0) * n > view.stock[3];
      const ok = !err && !poor;
      if (ok) okCount++;
      else if (!reason) reason = err ?? 'Zu wenig Ressourcen';
      out.push({ x, y, valid: ok });
    }
    const c = def.cost;
    const parts: string[] = [];
    for (const [key, label] of [['gold', 'Gold'], ['wood', 'Holz'], ['stone', 'Stein'], ['iron', 'Eisen'], ['pitch', 'Pech']] as const) if (c[key]) parts.push(`${(c[key] ?? 0) * n} ${label}`);
    this.placeInfo = { n, okCount, reason, cost: parts.join(', ') || 'kostenlos', name: def.name, hint: reason === null ? null : null };
    return out;
  }

  /** Pro Frame: Kamera scrollen, Vorschau aktualisieren */
  update(dt: number): void {
    const s = this.s;
    const cam = s.gs.cam;
    const hk = this.hotkeys;
    let sx = 0;
    let sy = 0;
    const k = this.keys;
    if (k.has(hk.panLeft) || k.has('ArrowLeft')) sx -= 1;
    if (k.has(hk.panRight) || k.has('ArrowRight')) sx += 1;
    if (k.has(hk.panUp) || k.has('ArrowUp')) sy -= 1;
    if (k.has(hk.panDown) || k.has('ArrowDown')) sy += 1;
    // Kantenscrollen
    const m = this.mouse;
    if (m.inside && !m.overUi && !this.downPos) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (m.x <= 2) sx -= 1;
      else if (m.x >= W - 3) sx += 1;
      if (m.y <= 2) sy -= 1;
      else if (m.y >= H - 3) sy += 1;
    }
    if (sx || sy) cam.pan(sx, sy, dt);
    if (k.has(hk.zoomIn)) cam.zoom(-300 * dt * 3);
    if (k.has(hk.zoomOut)) cam.zoom(300 * dt * 3);

    // Vorschau
    const ground = !m.overUi && m.inside ? this.groundAt(m.x, m.y) : null;
    this.hover = ground ? { x: Math.floor(ground.x), y: Math.floor(ground.y), fx: ground.x, fy: ground.y } : null;
    const mode = this.mode;
    if (mode.k === 'place' && ground) {
      const def = BUILDINGS[mode.type];
      if (def.placement === 'onWall') {
        const tx = Math.floor(ground.x);
        const ty = Math.floor(ground.y);
        const err = checkPlaceRules(s.world, s.me, mode.type, tx, ty, 0);
        const b = s.world.bldAt[s.world.map.idx(tx, ty)];
        const bb = b ? s.world.buildings.get(b) : null;
        const px = bb ? bb.x : tx;
        const py = bb ? bb.y : ty;
        s.ghost.showRect(s.world, tx, ty, tx, ty, err ? [1, 0.25, 0.25] : [0.3, 1, 0.3]);
        void px;
        void py;
      } else {
        s.ghost.show(s.world, def, mode.rot, this.placementsFor(def, mode.rot, ground.x, ground.y));
        this.updateGhostLabel(def);
      }
    } else if (mode.k === 'dig' && this.dragTile && ground) {
      s.ghost.showRect(s.world, this.dragTile.x, this.dragTile.y, Math.floor(ground.x), Math.floor(ground.y), mode.fill ? [0.9, 0.7, 0.3] : [0.3, 0.6, 1]);
    } else if (mode.k === 'place' || mode.k === 'dig') {
      s.ghost.hide();
      this.ghostLabel.style.display = 'none';
    }
    if (mode.k !== 'place') this.ghostLabel.style.display = 'none';
  }

  /** Kosten (bei Linien für die ganze Linie) und Grund am Cursor */
  private updateGhostLabel(def: BuildingDef): void {
    const info = this.placeInfo;
    const el = this.ghostLabel;
    if (!info) {
      el.style.display = 'none';
      return;
    }
    const lineTxt = def.line && info.n > 1 ? ` (${info.okCount}/${info.n} Stück)` : '';
    el.style.display = '';
    el.style.left = this.mouse.x + 18 + 'px';
    el.style.top = this.mouse.y + 18 + 'px';
    const bad = info.reason && info.okCount < info.n;
    const reason = bad ? (info.reason === 'Feinde in der Nähe' ? `Feinde in der Nähe (Bauverbot im Umkreis von ${ENEMY_BUILD_RADIUS} Tiles um feindliche Soldaten)` : info.reason) : null;
    el.className = 'ghostlabel' + (bad && info.okCount === 0 ? ' bad' : '');
    el.textContent = '';
    const b = document.createElement('b');
    b.textContent = `${info.name}${lineTxt}`;
    const c = document.createElement('div');
    c.textContent = `Kosten: ${info.cost}`;
    el.append(b, c);
    if (reason) {
      const r = document.createElement('div');
      r.className = 'why';
      r.textContent = reason;
      el.append(r);
    }
  }

  // ----- Maus -----
  private onDown(e: MouseEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    const s = this.s;
    const mode = this.mode;
    if (e.button === 2) {
      if (mode.k !== 'normal') {
        this.setMode({ k: 'normal' });
        return;
      }
      this.rightClick(e);
      return;
    }
    if (e.button !== 0) return;
    const g = this.groundAt(e.clientX, e.clientY);
    if (mode.k === 'place') {
      const def = BUILDINGS[mode.type];
      if (g && def.line) this.dragTile = { x: Math.floor(g.x), y: Math.floor(g.y) };
      return;
    }
    if (mode.k === 'dig') {
      if (g) this.dragTile = { x: Math.floor(g.x), y: Math.floor(g.y) };
      return;
    }
    if (mode.k === 'ability') {
      if (g) s.useAbility(mode.id, g.x, g.y);
      if (!e.shiftKey) this.setMode({ k: 'normal' });
      return;
    }
    if (mode.k === 'demolish' || mode.k === 'repair') {
      if (g) {
        const tx = Math.floor(g.x);
        const ty = Math.floor(g.y);
        const bid = s.world.map.inBounds(tx, ty) ? s.world.bldAt[s.world.map.idx(tx, ty)] : 0;
        const b = bid ? s.world.buildings.get(bid) : null;
        if (b && b.o === s.me && b.t !== BT.Keep && b.t !== BT.Campfire) {
          if (mode.k === 'demolish') s.send({ c: 'demolish', ids: [bid] });
          else s.send({ c: 'repair', building: bid });
          s.audio?.ui('confirm');
        } else s.audio?.ui('error');
      }
      return;
    }
    if (mode.k === 'tunnel') {
      if (g && s.selection.units.length) s.send({ c: 'tunnel', units: s.selection.units, x: g.x, y: g.y });
      this.setMode({ k: 'normal' });
      return;
    }
    if (mode.k === 'ignite') {
      if (g) s.send({ c: 'igniteDitch', x: Math.floor(g.x), y: Math.floor(g.y) });
      this.setMode({ k: 'normal' });
      return;
    }
    if (mode.k === 'attackMove' || mode.k === 'patrol' || mode.k === 'attackGround') {
      if (g && s.selection.units.length) {
        if (mode.k === 'attackMove') s.send({ c: 'move', units: s.selection.units, x: g.x, y: g.y, attack: true, formation: this.formation });
        else if (mode.k === 'patrol') s.send({ c: 'patrol', units: s.selection.units, x: g.x, y: g.y });
        else s.send({ c: 'attackGround', units: s.selection.units, x: g.x, y: g.y });
      }
      this.setMode({ k: 'normal' });
      return;
    }
    this.downPos = { x: e.clientX, y: e.clientY };
  }

  private onMove(e: MouseEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.inside = true;
    const target = e.target as HTMLElement | null;
    this.mouse.overUi = !!target && target !== this.s.gs.canvas;
    if (this.downPos && this.mode.k === 'normal') {
      const dx = e.clientX - this.downPos.x;
      const dy = e.clientY - this.downPos.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        const b = this.boxEl;
        b.style.display = '';
        b.style.left = Math.min(e.clientX, this.downPos.x) + 'px';
        b.style.top = Math.min(e.clientY, this.downPos.y) + 'px';
        b.style.width = Math.abs(dx) + 'px';
        b.style.height = Math.abs(dy) + 'px';
      }
    }
  }

  private onUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    const s = this.s;
    const mode = this.mode;
    const g = this.hover;
    if (mode.k === 'place' && !this.mouse.overUi) {
      const def = BUILDINGS[mode.type];
      if (g) {
        if (def.placement === 'onWall') s.send({ c: 'place', type: mode.type, x: g.x, y: g.y });
        else {
          const pl = this.placementsFor(def, mode.rot, g.fx, g.fy);
          if (def.line && this.dragTile && pl.length > 1) {
            const a = pl[0];
            const z = pl[pl.length - 1];
            s.send({ c: 'placeLine', type: def.id, x1: a.x, y1: a.y, x2: z.x, y2: z.y });
          } else if (pl[0]?.valid) {
            s.send({ c: 'place', type: def.id, x: pl[0].x, y: pl[0].y, rot: mode.rot });
            s.audio?.build();
          } else if (pl[0]) {
            s.hud.toast('Hier kann nicht gebaut werden', true);
            s.audio?.error();
          }
        }
      }
      this.dragTile = null;
      return;
    }
    if (mode.k === 'dig') {
      if (this.dragTile && g) s.send({ c: 'dig', x1: this.dragTile.x, y1: this.dragTile.y, x2: g.x, y2: g.y, fill: mode.fill });
      this.dragTile = null;
      s.ghost.hide();
      return;
    }
    if (!this.downPos) return;
    const d = this.downPos;
    this.downPos = null;
    this.boxEl.style.display = 'none';
    if (mode.k !== 'normal') return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.boxSelect(d.x, d.y, e.clientX, e.clientY, e.shiftKey);
    else this.clickSelect(e);
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const s = this.s;
    const w = s.world;
    const r = s.gs.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const sel: number[] = add ? [...s.selection.units] : [];
    const have = new Set(sel);
    for (let i = 0; i < w.top; i++) {
      if (!w.ids[i] || !this.selectable(i)) continue;
      this.project(w.curX[i], w.curY[i], groundYAt(w, w.curX[i], w.curY[i]) + 0.4, v);
      if (v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * r.width + r.left;
      const sy = ((1 - v.y) / 2) * r.height + r.top;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY && !have.has(w.ids[i])) sel.push(w.ids[i]);
    }
    s.setSelection(sel, 0);
  }

  private clickSelect(e: MouseEvent): void {
    const s = this.s;
    const w = s.world;
    const me = this.unitAt(e.clientX, e.clientY, this.selectable);
    const now = performance.now();
    if (me >= 0) {
      const type = w.type[me];
      if (now - this.lastClick.t < 380 && this.lastClick.type === type) {
        // Doppelklick: alle gleichen Einheiten im Bild
        const r = s.gs.canvas.getBoundingClientRect();
        const v = new THREE.Vector3();
        const sel: number[] = [];
        for (let i = 0; i < w.top; i++) {
          if (!w.ids[i] || !this.selectable(i) || w.type[i] !== type) continue;
          this.project(w.curX[i], w.curY[i], groundYAt(w, w.curX[i], w.curY[i]), v);
          if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
          sel.push(w.ids[i]);
        }
        void r;
        s.setSelection(sel, 0);
        this.lastClick.t = 0;
        return;
      }
      this.lastClick = { t: now, type };
      if (e.shiftKey) {
        const set = new Set(s.selection.units);
        if (set.has(w.ids[me])) set.delete(w.ids[me]);
        else set.add(w.ids[me]);
        s.setSelection([...set], 0);
      } else s.setSelection([w.ids[me]], 0);
      return;
    }
    // Bauer / Ochse anklicken: Info
    const any = this.unitAt(e.clientX, e.clientY, (i) => w.owner[i] === s.me || this.visibleEnemy(i));
    const g = this.groundAt(e.clientX, e.clientY);
    if (g) {
      const tx = Math.floor(g.x);
      const ty = Math.floor(g.y);
      if (w.map.inBounds(tx, ty)) {
        const bid = w.bldAt[w.map.idx(tx, ty)];
        if (bid && (!s.fog || s.fog.explored(tx, ty))) {
          s.setSelection([], bid);
          return;
        }
      }
    }
    if (any >= 0 && w.owner[any] === s.me) {
      s.setSelection([w.ids[any]], 0);
      return;
    }
    s.setSelection([], 0);
  }

  private rightClick(e: MouseEvent): void {
    const s = this.s;
    const w = s.world;
    const units = s.selection.units.filter((id) => w.slotOf(id) >= 0);
    if (!units.length) return;
    const enemy = this.unitAt(e.clientX, e.clientY, this.visibleEnemy);
    if (enemy >= 0) {
      s.send({ c: 'attack', units, kind: 'unit', target: w.ids[enemy] });
      return;
    }
    const g = this.groundAt(e.clientX, e.clientY);
    if (!g) return;
    const tx = Math.floor(g.x);
    const ty = Math.floor(g.y);
    // Tunnelgräber: Rechtsklick = unterirdisch zum Ziel graben
    if (units.every((id) => w.type[w.slotOf(id)] === U.Tunneler)) {
      s.send({ c: 'tunnel', units, x: g.x, y: g.y });
      return;
    }
    if (w.map.inBounds(tx, ty)) {
      const bid = w.bldAt[w.map.idx(tx, ty)];
      const b = bid ? w.buildings.get(bid) : null;
      if (b && s.teamOf[b.o] !== s.myTeam) {
        s.send({ c: 'attack', units, kind: 'building', target: bid });
        return;
      }
    }
    s.send({ c: 'move', units, x: g.x, y: g.y, queue: e.shiftKey, attack: e.altKey, formation: this.formation });
    s.flashMove(g.x, g.y);
  }

  // ----- Tastatur -----
  private onKey(e: KeyboardEvent, down: boolean): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!down) {
      this.keys.delete(e.code);
      return;
    }
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    const s = this.s;
    const hk = this.hotkeys;
    const combo = comboOf(e);
    const is = (a: HotkeyAction) => hk[a] === combo;
    if (e.code.startsWith('F') && /^F\d+$/.test(e.code)) e.preventDefault();
    if (e.code === 'Space' || (e.ctrlKey && e.code === 'KeyZ') || (e.altKey && /^Key/.test(e.code))) e.preventDefault();
    if (is('rotateLeft')) s.gs.cam.rotate(-1);
    else if (is('rotateRight')) s.gs.cam.rotate(1);
    else if (is('cancel')) {
      if (s.hud.hasPopup()) s.hud.closePopup();
      else if (this.mode.k !== 'normal') this.setMode({ k: 'normal' });
      else if (s.selection.units.length || s.selection.building) s.setSelection([], 0);
      else s.openMenu();
    } else if (is('rotateBuilding') && this.mode.k === 'place') this.mode.rot ^= 1;
    else if (is('pause')) s.togglePause();
    else if (is('undo')) s.undo();
    else if (is('jumpAlert')) s.jumpToAlert();
    else if (is('centerSelection')) s.centerOnSelection();
    else if (is('help')) s.openHelp();
    else if (is('encyclopedia')) s.toggleEncyclopedia();
    else if (is('tunnel') && s.selection.units.length) this.setMode({ k: 'tunnel' });
    else if (is('selectKeep')) s.selectBuildingType(BT.Keep);
    else if (is('selectGranary')) s.selectBuildingType(BT.Granary);
    else if (is('selectBarracks')) s.selectBuildingType(BT.Barracks);
    else if (is('selectMarket')) s.selectBuildingType(BT.Market);
    else if (is('selectStock')) s.selectBuildingType(BT.Stockpile);
    else if (is('selectArmory')) s.selectBuildingType(BT.Armory);
    else if (is('stop') && s.selection.units.length) s.send({ c: 'stop', units: s.selection.units });
    else if (is('hold') && s.selection.units.length) s.send({ c: 'stance', units: s.selection.units, stance: 0 });
    else if (is('defensive') && s.selection.units.length) s.send({ c: 'stance', units: s.selection.units, stance: 1 });
    else if (is('aggressive') && s.selection.units.length) s.send({ c: 'stance', units: s.selection.units, stance: 2 });
    else if (is('attackMove') && s.selection.units.length) this.setMode({ k: 'attackMove' });
    else if (is('patrol') && s.selection.units.length) this.setMode({ k: 'patrol' });
    else if (is('attackGround') && s.selection.units.length) this.setMode({ k: 'attackGround' });
    else if (is('demolish')) { if (s.selection.building) s.send({ c: 'demolish', ids: [s.selection.building] }); else this.setMode({ k: 'demolish' }); }
    else if (is('repair')) { if (s.selection.building) s.send({ c: 'repair', building: s.selection.building }); else this.setMode({ k: 'repair' }); }
    else if (is('toggleStock')) s.hud.togglePopup('stock');
    else if (is('toggleMarket')) s.hud.togglePopup('market');
    else if (is('togglePopularity')) s.hud.togglePopup('popularity');
    else if (is('toggleAdmin')) s.hud.togglePopup('admin');
    else if (is('toggleShadows')) s.toggleShadows();
    else if (is('toggleMute')) s.toggleMute();
    else if (is('centerKeep')) s.centerOnKeep();
    else if (is('selectAllArmy')) s.selectAllArmy();
    else {
      for (let i = 1; i <= 5; i++) if (hk[`ability${i}` as HotkeyAction] === combo) s.armAbility(i - 1);
      for (let i = 1; i <= 6; i++) if (hk[`cat${i}` as HotkeyAction] === combo) s.hud.openCategory(i - 1);
    }
    // Kontrollgruppen
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) {
      const n = Number(m[1]);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        s.controlGroups[n] = [...s.selection.units];
        s.hud.toast(`Gruppe ${n} gespeichert (${s.selection.units.length})`);
      } else {
        const g = (s.controlGroups[n] ?? []).filter((id) => s.world.slotOf(id) >= 0);
        if (g.length) {
          s.setSelection(g, 0);
          const now = performance.now();
          if (this.groupTap.n === n && now - this.groupTap.t < 400) s.centerOnSelection();
          this.groupTap = { n, t: now };
        }
      }
    }
  }
}
