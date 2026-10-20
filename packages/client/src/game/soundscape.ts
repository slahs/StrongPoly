import { BF, BT, BUILDINGS, ClientWorld, PROJ, SimEvent, T, U, UNIT_CAP, WorkerPhase } from '@strongpoly/shared';
import type { AudioEngine } from '../audio';
import { MoodDirector } from '../audio/mood';
import { viewRadius } from '../audio/mix';

/** Blickpunkt/Teaminformation, die die Session pro Frame liefert. */
export interface SoundView {
  me: number;
  myTeam: number;
  teamOf: number[];
  camX: number;
  camY: number;
  camYaw: number;
  camDist: number;
}

const SCAN = 0.25;
const CELL = 8;
const WORK_PERIOD: Record<number, number> = {
  [WorkerPhase.Gather]: 1.25,
  [WorkerPhase.Dig]: 1.1,
  [WorkerPhase.Repair]: 1.0,
};

interface BldRec {
  f: number;
  cx: number;
  cy: number;
  t: number;
  o: number;
}

/**
 * Leitet aus dem Client-Spiegel des Spielzustands Klänge ab, die die Sim nicht als Ereignis meldet
 * (Bauen, Abreißen, Arbeit, Geschosse, Tore, Rekrutierung), und bestimmt die Musikstimmung.
 * Reine Ausgabe: verändert den Spielzustand nicht.
 */
export class Soundscape {
  readonly director = new MoodDirector();
  /** Diagnosewerte für Tests und Debug-Hook */
  stats = { enemyNear: 0, attackers: 0, combatRate: 0, scans: 0, units: 0 };
  private known = new Map<number, BldRec>();
  private prevIds = new Int32Array(UNIT_CAP);
  private seeded = false;
  private acc = 0;
  private combatAcc = 0;
  private collapses: { x: number; y: number; at: number }[] = [];
  private hitEvents: { x: number; y: number }[] = [];
  private prevProj: Float32Array = new Float32Array(0);
  private zone = new Uint8Array(1);
  private zw = 1;
  private clock = 0;
  private bldTimer = new Map<number, number>();
  private view: SoundView | null = null;

  constructor(
    private world: ClientWorld,
    private audio: AudioEngine,
  ) {}

  // ---------------------------------------------------------------------------------------
  // Sim-Ereignisse

  onEvent(e: SimEvent, v: SoundView): void {
    this.view = v;
    if (e.e !== 'fx') return;
    const a = this.audio;
    const near = this.isRelevant(e.x, e.y, v);
    switch (e.k) {
      case 'hit': {
        if (near) this.combatAcc += 1;
        if (this.arrowNear(e.x, e.y)) {
          this.hitEvents.push({ x: e.x, y: e.y });
          a.play('arrowHit', e.x, e.y);
        } else a.simFx('hit', e.x, e.y);
        break;
      }
      case 'collapse':
      case 'collapseWood':
        this.collapses.push({ x: e.x, y: e.y, at: this.clock });
        if (near) this.combatAcc += 2;
        a.simFx(e.k, e.x, e.y);
        break;
      case 'explosion':
      case 'rock':
        if (near) this.combatAcc += 2;
        a.simFx(e.k, e.x, e.y);
        break;
      case 'dust':
        if (near) this.combatAcc += 0.25;
        break;
      case 'fire':
        // Feuer an der eigenen Burg ist Gefahr, aber kein Gefecht
        a.simFx(e.k, e.x, e.y);
        break;
      default:
        a.simFx(e.k, e.x, e.y);
    }
  }

  /** Liegt der Ort im Sichtbereich oder in der Nähe eigener Gebäude? (filtert Kämpfe weit entfernter Parteien) */
  private isRelevant(x: number, y: number, v: SoundView): boolean {
    if (Math.hypot(x - v.camX, y - v.camY) < 55) return true;
    return this.inZone(x, y);
  }

  private inZone(x: number, y: number): boolean {
    const cx = (x / CELL) | 0;
    const cy = (y / CELL) | 0;
    if (cx < 0 || cy < 0 || cx >= this.zw) return false;
    return this.zone[cy * this.zw + cx] === 1;
  }

  private arrowNear(x: number, y: number): boolean {
    const p = this.prevProj;
    const n = Math.min(p.length / 8, 600);
    for (let i = 0; i < n; i++) {
      const k = p[i * 8];
      if (k !== PROJ.Arrow && k !== PROJ.Bolt && k !== PROJ.FireArrow) continue;
      const px = p[i * 8 + 2] + p[i * 8 + 5];
      const py = p[i * 8 + 3] + p[i * 8 + 6];
      if ((px - x) * (px - x) + (py - y) * (py - y) < 2.6) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------
  // Frame

  update(dt: number, v: SoundView): void {
    this.view = v;
    this.clock += dt;
    this.acc += dt;
    this.audio.setListener(v.camX, v.camY, v.camYaw, v.camDist);
    if (this.acc < SCAN) return;
    const sdt = this.acc;
    this.acc = 0;
    this.scan(sdt, v);
  }

  private buildZone(v: SoundView): void {
    const w = this.world;
    const cw = Math.ceil(w.map.w / CELL) + 1;
    const ch = Math.ceil(w.map.h / CELL) + 1;
    if (this.zone.length !== cw * ch) {
      this.zone = new Uint8Array(cw * ch);
      this.zw = cw;
    } else this.zone.fill(0);
    const R = 3; // Zellen (24 Tiles) Umkreis um eigene Gebäude
    for (const b of w.buildings.values()) {
      if (v.teamOf[b.o] !== v.myTeam) continue;
      const cx = ((b.x + b.w / 2) / CELL) | 0;
      const cy = ((b.y + b.h / 2) / CELL) | 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= ch) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = cx + dx;
          if (xx >= 0 && xx < cw) this.zone[yy * cw + xx] = 1;
        }
      }
    }
  }

  private scan(dt: number, v: SoundView): void {
    const w = this.world;
    const a = this.audio;
    if (!w.map || w.map.w < 4) return;
    this.stats.scans++;
    this.buildZone(v);
    const cull = viewRadius(v.camDist) * 1.6;
    const cull2 = cull * cull;
    const quiet = !this.seeded;

    // ----- Gebäude -----
    const fresh: BldRec[] = [];
    const seen = new Set<number>();
    for (const b of w.buildings.values()) {
      seen.add(b.i);
      const f = b.f;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const old = this.known.get(b.i);
      if (!old) {
        const rec: BldRec = { f, cx, cy, t: b.t, o: b.o };
        this.known.set(b.i, rec);
        fresh.push(rec);
        continue;
      }
      if (!quiet && (f & BF.GateOpen) !== (old.f & BF.GateOpen)) a.play(f & BF.GateOpen ? 'gateOpen' : 'gateClose', cx, cy);
      old.f = f;
      // Arbeitsgeräusche der Werkstätten (nur hörbare, besetzte Gebäude)
      if (b.s > 0 && !quiet) {
        const dx = cx - v.camX;
        const dy = cy - v.camY;
        if (dx * dx + dy * dy < cull2) this.buildingWork(b.t, b.i, cx, cy, dt);
      }
    }
    const removed: BldRec[] = [];
    for (const [id, rec] of this.known) {
      if (!seen.has(id)) {
        removed.push(rec);
        this.known.delete(id);
        this.bldTimer.delete(id);
      }
    }
    // Voll-Snapshot (Start/Neuverbindung) liefert viele "neue" Gebäude auf einmal: still bleiben
    if (!quiet) {
      if (fresh.length <= 8) {
        let n = 0;
        for (const r of fresh) if (n < 3 && a.play('build', r.cx, r.cy)) n++;
      }
      if (removed.length <= 12) {
        for (const r of removed) {
          const hasCollapse = this.collapses.some((c) => this.clock - c.at < 1.5 && Math.hypot(c.x - r.cx, c.y - r.cy) < 4);
          if (!hasCollapse) a.play('demolish', r.cx, r.cy);
        }
      }
    }
    this.collapses = this.collapses.filter((c) => this.clock - c.at < 3);

    // ----- Einheiten -----
    let enemyNear = 0;
    let attackers = 0;
    let recruits = 0;
    let recruitX = 0;
    let recruitY = 0;
    let units = 0;
    const top = w.top;
    for (let s = 0; s < top; s++) {
      const id = w.ids[s];
      const wasId = this.prevIds[s];
      if (id === 0) {
        this.prevIds[s] = 0;
        continue;
      }
      units++;
      const isNew = wasId !== id;
      this.prevIds[s] = id;
      const type = w.type[s];
      const owner = w.owner[s];
      const x = w.curX[s];
      const y = w.curY[s];
      const mine = v.teamOf[owner] === v.myTeam;
      const soldier = type >= U.Lord && type !== U.Ox;
      if (isNew && !quiet && owner === v.me && type >= U.Archer && type <= U.Monk) {
        const b = this.barracksAt(x, y);
        if (b) {
          recruits++;
          recruitX = b.cx;
          recruitY = b.cy;
        }
      }
      if (!mine && soldier && this.inZone(x, y)) enemyNear++;
      const aux = w.aux[s];
      if (aux & 1) {
        if ((owner === v.me || this.inZone(x, y)) && soldier) attackers++;
        else if (Math.hypot(x - v.camX, y - v.camY) < 30 && soldier) attackers += 0.5;
      }
      if (quiet) continue;
      const sub = aux >> 4;
      const period = WORK_PERIOD[sub];
      if (period && (type === U.Peasant || type === U.Engineer)) {
        const dx = x - v.camX;
        const dy = y - v.camY;
        if (dx * dx + dy * dy < cull2 && Math.random() < dt / period) this.workSound(sub, x, y);
      }
    }
    if (recruits > 0) a.play('recruit', recruitX, recruitY);
    this.seeded = true;

    // ----- Stimmung -----
    const combat = this.combatAcc + attackers * 0.15 * dt;
    this.combatAcc = 0;
    this.director.update(dt, { enemyNear, combat });
    this.stats.enemyNear = enemyNear;
    this.stats.attackers = attackers;
    this.stats.units = units;
    this.stats.combatRate = Math.round(this.director.combatRate * 100) / 100;
    a.setMood(this.director.mood);
  }

  private barracksAt(x: number, y: number): { cx: number; cy: number } | null {
    const w = this.world;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (!w.map.inBounds(tx + dx, ty + dy)) continue;
        const id = w.bldAt[w.map.idx(tx + dx, ty + dy)];
        if (!id) continue;
        const b = w.buildings.get(id);
        if (b && (b.t === BT.Barracks || b.t === BT.MercPost || b.t === BT.EngineerGuild)) return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
      }
    return null;
  }

  private buildingWork(t: number, id: number, cx: number, cy: number, dt: number): void {
    let period = 0;
    let sfx: 'smith' | 'mill' | 'pick' | null = null;
    switch (t) {
      case BT.Blacksmith:
      case BT.Armorer:
      case BT.Fletcher:
      case BT.Poleturner:
        sfx = 'smith';
        period = 2.4;
        break;
      case BT.Mill:
        sfx = 'mill';
        period = 3.5;
        break;
      case BT.IronMine:
        sfx = 'pick';
        period = 1.8;
        break;
      default:
        return;
    }
    const left = (this.bldTimer.get(id) ?? Math.random() * period) - dt;
    if (left <= 0) {
      this.audio.play(sfx, cx, cy, { vol: 0.8 });
      this.bldTimer.set(id, period * (0.8 + Math.random() * 0.5));
    } else this.bldTimer.set(id, left);
  }

  /** Welche Arbeit steht an dieser Stelle an? Bäume → Hacken, Vorkommen → Pickel, sonst Ernte. */
  private workSound(sub: number, x: number, y: number): void {
    const w = this.world;
    const a = this.audio;
    if (sub === WorkerPhase.Repair) {
      a.play('build', x, y, { vol: 0.7 });
      return;
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    let tree = false;
    let ore = false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!w.map.inBounds(tx + dx, ty + dy)) continue;
        const i = w.map.idx(tx + dx, ty + dy);
        if (w.map.trees[i] > 0) tree = true;
        const tr = w.map.terrain[i];
        if (tr === T.StoneDeposit || tr === T.IronDeposit) ore = true;
      }
    if (sub === WorkerPhase.Dig) a.play('pick', x, y, { vol: 0.8 });
    else if (tree) a.play('chop', x, y);
    else if (ore) a.play('pick', x, y);
    else a.play('harvest', x, y, { vol: 0.8 });
  }

  /** Nach jedem angewendeten Snapshot aufrufen: neue Geschosse → Schuss-/Abschussgeräusch, verschwundene Pfeile → Einschlag. */
  onSnapshot(v: SoundView): void {
    this.view = v;
    this.diffProjectiles();
    this.hitEvents.length = 0;
  }

  private diffProjectiles(): void {
    const cur = this.world.proj;
    const prev = this.prevProj;
    const a = this.audio;
    if (!this.seeded) {
      this.prevProj = cur;
      return;
    }
    const nPrev = prev.length / 8;
    const nCur = cur.length / 8;
    // Erwartete Position jedes vorherigen Geschosses (aktuelle Position + Schritt) in einem 0,5-Tile-Raster
    const cellOf = (k: number, x: number, y: number): number => (k * 1024 + Math.max(0, Math.min(1023, Math.floor(x * 2)))) * 1024 + Math.max(0, Math.min(1023, Math.floor(y * 2)));
    const px = new Float32Array(nPrev);
    const py = new Float32Array(nPrev);
    const grid = new Map<number, number[]>();
    for (let j = 0; j < nPrev; j++) {
      px[j] = prev[j * 8 + 2] + prev[j * 8 + 5];
      py[j] = prev[j * 8 + 3] + prev[j * 8 + 6];
      const c = cellOf(prev[j * 8], px[j], py[j]);
      const l = grid.get(c);
      if (l) l.push(j);
      else grid.set(c, [j]);
    }
    const matched = new Uint8Array(nPrev);
    let tries = 0;
    for (let i = 0; i < nCur; i++) {
      const k = cur[i * 8];
      const x = cur[i * 8 + 2];
      const y = cur[i * 8 + 3];
      // gleiche Flugbahn fortgesetzt?
      let found = false;
      for (let dx = -1; dx <= 1 && !found; dx++)
        for (let dy = -1; dy <= 1 && !found; dy++) {
          const l = grid.get(cellOf(k, x + dx * 0.5, y + dy * 0.5));
          if (!l) continue;
          for (const j of l) {
            if (matched[j]) continue;
            if ((px[j] - x) * (px[j] - x) + (py[j] - y) * (py[j] - y) < 0.09) {
              matched[j] = 1;
              found = true;
              break;
            }
          }
        }
      if (found) continue;
      if (tries >= 10) continue;
      let ok = false;
      if (k === PROJ.Arrow || k === PROJ.FireArrow) ok = a.play('arrowShot', x, y);
      else if (k === PROJ.Bolt) ok = a.play('arrowShot', x, y, { v: 1.3 });
      else if (k === PROJ.Stone || k === PROJ.Boulder) ok = a.play('catapult', x, y, { v: k === PROJ.Boulder ? 1.2 : 1 });
      tries += ok ? 1 : 0.25;
    }
    // Pfeile, die nicht mehr fliegen, ohne dass ein Trefferereignis kam: Einschlag in Boden/Mauer
    let ends = 0;
    for (let j = 0; j < nPrev && ends < 6; j++) {
      if (matched[j]) continue;
      const k = prev[j * 8];
      if (k !== PROJ.Arrow && k !== PROJ.Bolt && k !== PROJ.FireArrow) continue;
      const ex = px[j];
      const ey = py[j];
      if (this.hitEvents.some((h) => (h.x - ex) * (h.x - ex) + (h.y - ey) * (h.y - ey) < 4)) continue;
      if (a.play('arrowHit', ex, ey, { vol: 0.7 })) ends++;
    }
    this.prevProj = cur;
  }
}
