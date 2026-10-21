import { assetRegistry, parseStyle } from './render/assets/registry';
import {
  BT,
  BUILDINGS,
  BuildingRec,
  ClientBuilding,
  ClientWorld,
  PROJ,
  T,
  U,
  UNITS,
  generateMap,
  PublicPlayer,
} from '@strongpoly/shared';
import * as THREE from 'three';
import { EntityRenderer } from './render/entities';
import { JOB_NAMES } from './render/unit_jobs';
import { GameScene } from './render/scene';

/**
 * Benchmark-Szene (?bench): zwei Heere kämpfen auf einem ebenen Schlachtfeld, ganz ohne Netz und ohne Sim-Worker.
 * Die Welt ist ein synthetischer ClientWorld-Spiegel, der wie die echte Sim in 10-Hz-Ticks fortgeschrieben wird
 * (Marsch, Nahkampf, Fernkampf mit Projektilen, Belagerungsgerät, Tod mit Nachschub, brennende Gebäude).
 * Der Renderer wird dabei wie im Spiel belastet: Einheiten-Instanzen mit Animation, Projektile, Partikel, Schatten, Gebäude.
 *
 * Aufruf: ?bench&quality=medium&units=2000&secs=20  (optional &warm=3 &seed=1 &shadows=0 &pr=1)
 * Ergebnis: window.__bench.result() → { fps, avgMs, p95Ms, p99Ms, units, quality, ... }
 */
export interface BenchResult {
  fps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  /** JS-Zeit pro Frame (Aktualisierung + Rendern, ohne Wartezeit auf die GPU) */
  cpuAvgMs: number;
  cpuP95Ms: number;
  /** davon: Entity-Aktualisierung und renderer.render */
  updateMs: number;
  renderMs: number;
  /** Aufschlüsselung der Entity-Aktualisierung (Mittel in ms) */
  parts: Record<string, number>;
  calls: number;
  triangles: number;
  units: number;
  unitsDrawn: number;
  projectiles: number;
  particles: number;
  quality: string;
  /** Draw-Calls waren No-ops (reine JS-Zeit) */
  nodraw: boolean;
  secs: number;
  frames: number;
  viewport: string;
  gl: string;
  done: boolean;
}

declare global {
  interface Window {
    __bench?: {
      ready: boolean;
      done: boolean;
      result: () => BenchResult;
      scene: GameScene;
      entities: EntityRenderer;
      world: ClientWorld;
      setCamera: (x: number, y: number, dist?: number) => void;
      /** Weltzeit (Tick) setzen – Prüfszene `showcase=build`: Alter der Baustellen reproduzierbar einstellen */
      setTick: (tick: number) => void;
      /** Gebäude zerstören (Einsturz, Staub, Trümmer) – Prüfhilfe */
      destroy: (id: number) => void;
      /** feste Zeit (s) für Bildserien der Animation; null = Echtzeit */
      setTime: (t: number | null) => void;
      /** Zähler gezeichneter Bilder (zum Warten auf ein neues Bild) */
      frameNo: () => number;
      /** Auswahl/Hover für Prüfaufnahmen */
      selected: Set<number>;
      ui: { selectedBuilding: number; hoverBuilding: number };
    };
  }
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

interface Proj {
  kind: number;
  owner: number;
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
  arc: number;
  t: number;
  T: number;
  target: number;
  dmg: number;
  splash: number;
}

/** Zusammensetzung eines Heeres (Anteile) */
const ARMY_A: [number, number][] = [
  [U.Swordsman, 0.2],
  [U.Spearman, 0.16],
  [U.Maceman, 0.1],
  [U.Pikeman, 0.08],
  [U.Archer, 0.16],
  [U.Crossbowman, 0.1],
  [U.Knight, 0.08],
  [U.Monk, 0.02],
  [U.Engineer, 0.02],
  [U.Laddermen, 0.04],
  [U.Catapult, 0.02],
  [U.Ram, 0.02],
];
const ARMY_B: [number, number][] = [
  [U.ArabSwordsman, 0.24],
  [U.Slinger, 0.2],
  [U.HorseArcher, 0.1],
  [U.Slave, 0.12],
  [U.Assassin, 0.04],
  [U.Firethrower, 0.04],
  [U.Archer, 0.08],
  [U.Spearman, 0.08],
  [U.Swordsman, 0.04],
  [U.Trebuchet, 0.02],
  [U.Catapult, 0.02],
  [U.Mantlet, 0.02],
];

/** Eintrag der Einheiten-Prüfszene */
export interface ShowcaseEntry {
  type: number;
  label: string;
  /** getragene Ware (Ressourcen-ID + 1) – bestimmt bei Bauern u. a. den Beruf */
  carry?: number;
  /** Arbeits-Teilzustand (Sim `P.*`) */
  sub?: number;
  /** Beruf erzwingen (Prüfhilfe: `EntityRenderer.debugJobs`) */
  job?: number;
}
/** Platzierungs-Tick der Baustellen in der Prüfszene `showcase=build` */
export const BUILD_BORN = 1000;

export class BenchWorld {
  readonly w = new ClientWorld();
  private hpf = new Float32Array(8192);
  private cd = new Float32Array(8192);
  private tgt = new Int32Array(8192);
  private gen = new Uint16Array(8192);
  private free: number[] = [];
  private projs: Proj[] = [];
  private grid = new Map<number, number[]>();
  private rnd: () => number;
  readonly cx: number;
  readonly cy: number;
  count = 0;
  private armyA: number[] = [];
  private armyB: number[] = [];
  private nextB = 100;
  /** Beschriftungen für Prüfszenen (Weltkoordinaten) */
  readonly labels: { x: number; y: number; text: string }[] = [];
  showcaseGrid = { cols: 1, spacing: 2.3, rowSpacing: 2.7 };
  /** Blickrichtung der Prüfszene (Bruchteile von π; 0,4 = Dreiviertelansicht, 0,75 = Seitenansicht nach rechts) */
  showFace = 0.4;
  /** erzwungene Berufe der Prüfszene (Einheiten-ID → Beruf) */
  readonly showJobs = new Map<number, number>();

  constructor(
    private total: number,
    seed: number,
    private plain = false,
  ) {
    let s = seed * 2654435761 + 1;
    this.rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const map = generateMap({ seed, size: 128, players: 2 });
    const w = this.w;
    this.cx = map.w / 2;
    this.cy = map.h / 2;
    // ebenes Schlachtfeld in der Kartenmitte
    for (let y = this.cy - 34; y <= this.cy + 34; y++)
      for (let x = this.cx - 56; x <= this.cx + 56; x++) {
        const i = map.idx(x, y);
        const edge = Math.max(Math.abs(x - this.cx) / 56, Math.abs(y - this.cy) / 34);
        if (edge > 0.93) continue;
        map.terrain[i] = T.Desert;
        map.height[i] = 0;
        map.trees[i] = 0;
      }
    w.map = map;
    w.bldAt = new Int32Array(map.n);
    w.digMask = new Uint8Array(map.n);
    w.tileChanges.push(-1);
    const players: PublicPlayer[] = [
      { id: 0, name: 'Rot', team: 0, color: 0, kind: 'ai', alive: true, keepX: this.cx - 50, keepY: this.cy },
      { id: 1, name: 'Blau', team: 1, color: 1, kind: 'ai', alive: true, keepX: this.cx + 50, keepY: this.cy },
    ];
    w.players = players;
    if (!plain) {
      this.placeBuildings();
      this.populate();
    }
  }

  private addBuilding(t: number, x: number, y: number, o: number, rot = 0, f = 0, staffed = 0, born = 0): ClientBuilding {
    const w = this.w;
    const id = w.buildings.size + 1;
    const rec: BuildingRec = { i: id, t, o, x, y, r: rot, hp: BUILDINGS[t].hp, f, u: 0, q: 0, s: staffed, c: 0, b: 0, p: 0, n: born };
    const cb = rec as ClientBuilding;
    w.placeBuilding(cb);
    w.buildings.set(id, cb);
    w.buildingsDirty = true;
    return cb;
  }

  private placeBuildings(): void {
    const { cx, cy } = this;
    for (const side of [0, 1]) {
      const sx = side === 0 ? -1 : 1;
      const kx = cx + sx * 50;
      this.addBuilding(BT.Keep, Math.round(kx - 2.5), Math.round(cy - 2.5), side);
      // Mauerlinie mit Steintor und Türmen vor dem Bergfried
      const wx = Math.round(cx + sx * 34);
      for (let y = cy - 16; y <= cy + 16; y++) {
        if (y >= cy - 6 && y <= cy + 5) continue;
        this.addBuilding(side === 0 ? BT.WallHigh : BT.WallLow, wx, y, side);
      }
      this.addBuilding(BT.GateStone, wx - 1, cy - 2, side, 1);
      this.addBuilding(BT.TowerRound, wx - 2, cy - 6, side);
      this.addBuilding(BT.TowerRound, wx - 2, cy + 2, side);
      this.addBuilding(BT.TowerGuard, wx - 1, cy - 19, side);
      this.addBuilding(BT.TowerGuard, wx - 1, cy + 17, side);
      // Wirtschaft: Häuser, Mühle, Schmiede mit Rauch, Lager
      const bx = kx + sx * 6;
      this.addBuilding(BT.Hovel, Math.round(bx), Math.round(cy - 9), side);
      this.addBuilding(BT.Hovel, Math.round(bx), Math.round(cy + 8), side);
      this.addBuilding(BT.Mill, Math.round(bx - sx * 2 - 1), Math.round(cy + 12), side, 0, 0, 1);
      this.addBuilding(BT.Blacksmith, Math.round(bx - 1), Math.round(cy - 14), side, 0, 0, 1);
      this.addBuilding(BT.Bakery, Math.round(bx + sx * 4), Math.round(cy - 6), side, 0, 0, 1);
      this.addBuilding(BT.Stockpile, Math.round(bx + sx * 4), Math.round(cy + 5), side);
      this.addBuilding(BT.Barracks, Math.round(kx - sx * 9 - 2), Math.round(cy - 2), side);
      this.addBuilding(BT.Woodcutter, Math.round(bx + sx * 8), Math.round(cy + 12), side, 0, 0, 1);
      // ein brennendes Gebäude an der Front der Gegenseite
      if (side === 1) this.addBuilding(BT.Fletcher, Math.round(bx - 3), Math.round(cy + 18), side, 0, 1);
    }
  }

  private slot(): number {
    if (this.free.length) return this.free.pop()!;
    const w = this.w;
    if (w.top < 8192) return w.top++;
    return -1;
  }

  spawn(type: number, side: number, x: number, y: number): number {
    const s = this.slot();
    if (s < 0) return -1;
    const w = this.w;
    if (s >= w.top) w.top = s + 1;
    this.gen[s] = (this.gen[s] % 60) + 1;
    const id = (this.gen[s] << 13) | s;
    w.ids[s] = id;
    w.type[s] = type;
    w.owner[s] = side;
    w.flags[s] = 0;
    w.hp[s] = 255;
    w.state[s] = 0;
    w.carry[s] = 0;
    w.aux[s] = 0;
    w.face[s] = side === 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
    w.prevX[s] = w.curX[s] = x;
    w.prevY[s] = w.curY[s] = y;
    this.hpf[s] = UNITS[type].hp;
    this.cd[s] = this.rnd() * 1.5;
    this.tgt[s] = -1;
    this.count++;
    (side === 0 ? this.armyA : this.armyB).push(s);
    return s;
  }

  private pickType(list: [number, number][]): number {
    let r = this.rnd();
    for (const [t, p] of list) {
      r -= p;
      if (r <= 0) return t;
    }
    return list[0][0];
  }

  private populate(): void {
    const { cx, cy } = this;
    const per = Math.floor(this.total / 2);
    for (const side of [0, 1]) {
      const list = side === 0 ? ARMY_A : ARMY_B;
      const sx = side === 0 ? -1 : 1;
      const cols = 26;
      let n = 0;
      // Lord
      this.spawn(U.Lord, side, cx + sx * 20, cy);
      // Bauern bei den Gebäuden (Arbeit, Tragen)
      for (let i = 0; i < 28 && n < per; i++, n++) {
        const s = this.spawn(U.Peasant, side, cx + sx * (46 + this.rnd() * 6), cy + (this.rnd() - 0.5) * 24);
        if (s >= 0) {
          this.w.carry[s] = 1 + Math.floor(this.rnd() * 12);
          this.w.aux[s] = this.rnd() < 0.5 ? 2 : 0;
        }
      }
      while (n < per) {
        const row = Math.floor(n / cols);
        const col = n % cols;
        const x = cx + sx * (11 + row * 0.9);
        const y = cy + (col - cols / 2) * 0.85 + (this.rnd() - 0.5) * 0.2;
        const t = this.pickType(list);
        const big = UNITS[t].radius > 0.5;
        this.spawn(t, side, big ? x + sx * 3 : x, big ? cy + (this.rnd() - 0.5) * 26 : y);
        n++;
      }
    }
    this.commitTick(0);
  }

  private key(x: number, y: number): number {
    return (Math.floor(x / 3) + 100) * 1000 + (Math.floor(y / 3) + 100);
  }

  /** ein Sim-Tick (0,1 s) */
  tick(): void {
    const w = this.w;
    const dt = 0.1;
    // Raster der Einheiten je Seite
    const grids = [new Map<number, number[]>(), new Map<number, number[]>()];
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s]) continue;
      const k = this.key(w.curX[s], w.curY[s]);
      const g = grids[w.owner[s]];
      let l = g.get(k);
      if (!l) g.set(k, (l = []));
      l.push(s);
    }
    w.events.length = 0;
    w.deaths.length = 0;
    const dead: number[] = [];
    for (let s = 0; s < w.top; s++) {
      const id = w.ids[s];
      if (!id) continue;
      const type = w.type[s];
      const def = UNITS[type];
      const side = w.owner[s];
      const x = w.curX[s];
      const y = w.curY[s];
      w.prevX[s] = x;
      w.prevY[s] = y;
      w.flags[s] &= ~4;
      let aux = w.aux[s] & 2; // Arbeit bleibt
      if (type === U.Peasant) {
        w.aux[s] = aux;
        continue;
      }
      // Ziel suchen: nächster Gegner im Umkreis
      let best = -1;
      let bd = 1e9;
      const eg = grids[1 - side];
      const reach = Math.max(def.range + 1, 6);
      const cr = Math.ceil(reach / 3);
      const kx = Math.floor(x / 3);
      const ky = Math.floor(y / 3);
      for (let dx = -cr; dx <= cr; dx++)
        for (let dy = -cr; dy <= cr; dy++) {
          const l = eg.get((kx + dx + 100) * 1000 + (ky + dy + 100));
          if (!l) continue;
          for (const e of l) {
            const d = (w.curX[e] - x) ** 2 + (w.curY[e] - y) ** 2;
            if (d < bd) {
              bd = d;
              best = e;
            }
          }
        }
      const dist = Math.sqrt(bd);
      const range = def.range + 0.5;
      if (best >= 0 && dist <= range) {
        // kämpfen
        w.face[s] = (Math.atan2(w.curX[best] - x, w.curY[best] - y) + Math.PI * 2) % (Math.PI * 2);
        this.cd[s] -= dt;
        aux |= 1;
        if (this.cd[s] <= 0) {
          this.cd[s] = def.cd * (0.8 + this.rnd() * 0.4);
          if (def.proj !== PROJ.None) this.shoot(s, best, def.proj, def.dmg, def.splash);
          else {
            this.hpf[best] -= def.dmg * (0.4 + this.rnd() * 0.4);
            if (this.rnd() < 0.08) w.events.push({ e: 'fx', k: 'hit', x: w.curX[best], y: w.curY[best], z: 0.5 });
          }
        }
      } else {
        // marschieren: zum Ziel oder geradeaus zum gegnerischen Bergfried
        let tx: number;
        let ty: number;
        if (best >= 0) {
          tx = w.curX[best];
          ty = w.curY[best];
        } else {
          tx = side === 0 ? this.cx + 50 : this.cx - 50;
          ty = this.cy + Math.sin(s) * 6;
        }
        const d = Math.hypot(tx - x, ty - y) || 1;
        const sp = def.speed * 1.05 * dt;
        const mx = ((tx - x) / d) * sp;
        const my = ((ty - y) / d) * sp;
        // einfache Trennung
        w.curX[s] = x + mx + (this.rnd() - 0.5) * 0.03;
        w.curY[s] = y + my + (this.rnd() - 0.5) * 0.03;
        w.face[s] = (Math.atan2(mx, my) + Math.PI * 2) % (Math.PI * 2);
        w.flags[s] |= 4;
      }
      w.aux[s] = aux;
    }
    // Projektile fortschreiben
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.t++;
      if (p.t >= p.T) {
        const tgt = p.target;
        if (tgt >= 0 && w.ids[tgt]) {
          this.hpf[tgt] -= p.dmg * (0.4 + this.rnd() * 0.5);
        }
        if (p.kind === PROJ.Boulder || p.kind === PROJ.Stone) {
          w.events.push({ e: 'fx', k: 'explosion', x: p.ex, y: p.ey, z: 0.4 });
          if (p.splash > 0) {
            for (let s = 0; s < w.top; s++) {
              if (!w.ids[s] || w.owner[s] === p.owner) continue;
              if ((w.curX[s] - p.ex) ** 2 + (w.curY[s] - p.ey) ** 2 < p.splash * p.splash) this.hpf[s] -= p.dmg * 0.5;
            }
          }
        } else if (this.rnd() < 0.05) w.events.push({ e: 'fx', k: 'hit', x: p.ex, y: p.ey, z: 0.4 });
        this.projs.splice(i, 1);
      }
    }
    // Tote entfernen, Nachschub an der Heereslinie
    for (let s = 0; s < w.top; s++) {
      const id = w.ids[s];
      if (!id) continue;
      this.hpf[s] = Math.min(this.hpf[s], UNITS[w.type[s]].hp);
      w.hp[s] = Math.max(1, Math.ceil((Math.max(0, this.hpf[s]) / UNITS[w.type[s]].hp) * 255));
      if (this.hpf[s] <= 0) dead.push(s);
    }
    for (const s of dead) {
      const side = w.owner[s];
      w.deaths.push({ id: w.ids[s], x: w.curX[s], y: w.curY[s], type: w.type[s], owner: side, face: w.face[s] });
      const type = w.type[s];
      w.ids[s] = 0;
      this.free.push(s);
      this.count--;
      const arr = side === 0 ? this.armyA : this.armyB;
      const i = arr.indexOf(s);
      if (i >= 0) arr.splice(i, 1);
      // Nachschub (nicht der Lord)
      if (type !== U.Lord && type !== U.Peasant) {
        const sx = side === 0 ? -1 : 1;
        const list = side === 0 ? ARMY_A : ARMY_B;
        const t = this.pickType(list);
        this.spawn(t, side, this.cx + sx * (22 + this.rnd() * 14), this.cy + (this.rnd() - 0.5) * 30);
      } else if (type === U.Lord) this.spawn(U.Lord, side, this.cx + (side === 0 ? -1 : 1) * 40, this.cy);
    }
    this.commitTick(dt);
  }

  private shoot(s: number, target: number, kind: number, dmg: number, splash: number): void {
    const w = this.w;
    const sx = w.curX[s];
    const sy = w.curY[s];
    const ex = w.curX[target];
    const ey = w.curY[target];
    const dist = Math.hypot(ex - sx, ey - sy);
    const speed = kind === PROJ.Boulder ? 12 : kind === PROJ.Stone ? 14 : 22;
    const T = Math.max(2, Math.round((dist / speed) * 10));
    if (this.projs.length > 1800) return;
    this.projs.push({
      kind,
      owner: w.owner[s],
      sx,
      sy,
      sz: 0.9,
      ex,
      ey,
      ez: 0.4,
      arc: kind === PROJ.Boulder || kind === PROJ.Stone ? Math.min(6, dist * 0.3) : Math.min(3.5, dist * 0.12),
      t: 0,
      T,
      target,
      dmg,
      splash,
    });
  }

  /**
   * Prüfszene: alle Einheitentypen in vier Zeilen (Stehen, Gehen, Angriff, Arbeit), bildschirmparallel zur Standardkamera
   * (Spalten laufen nach rechts, Zeilen zur Kamera hin). `extra` hängt zusätzliche Spalten an (z. B. Berufe der Bauern).
   */
  showcaseUnits(extra: ShowcaseEntry[] = []): void {
    const { cx, cy } = this;
    const w = this.w;
    const list: ShowcaseEntry[] = UNITS.map((d) => ({ type: d.id, label: d.name }));
    list.push(...extra);
    this.showcaseGrid = { cols: list.length, spacing: list.length > 30 ? 1.7 : 2.3, rowSpacing: 2.7 };
    list.forEach((e, col) => {
      for (let row = 0; row < 4; row++) {
        const p = this.gridPos(col, row);
        const s = this.spawn(e.type, row % 2 === 0 ? 0 : 1, p.x, p.y);
        if (s < 0) continue;
        w.face[s] = Math.PI * this.showFace;
        if (row === 1) w.flags[s] |= 4;
        if (row === 2) w.aux[s] |= 1;
        if (row === 3) {
          w.aux[s] |= 2;
          w.carry[s] = e.carry ?? 1 + (e.type % 12);
        } else if (e.carry && e.type === U.Peasant) w.carry[s] = e.carry;
        if (e.sub !== undefined) w.aux[s] = (w.aux[s] & 15) | (e.sub << 4);
        if (e.job !== undefined) this.showJobs.set(w.ids[s], e.job);
        w.hp[s] = row === 2 ? 140 : 255;
      }
      const p = this.gridPos(col, 3.6);
      this.labels.push({ x: p.x, y: p.y, text: e.label });
    });
    void cx;
    void cy;
    this.commitTick(0);
  }

  /** Prüfszene mit einer einzigen Einheit in der Kartenmitte (Bildserien der Animation): state = stand|walk|attack|work */
  showcaseSingle(type: number, state: string, job: number, side: number, carry = 0): void {
    const w = this.w;
    const s = this.spawn(type, side, this.cx, this.cy);
    if (s < 0) return;
    w.face[s] = Math.PI * this.showFace;
    if (state === 'walk') w.flags[s] |= 4;
    if (state === 'attack') w.aux[s] |= 1;
    if (state === 'work') w.aux[s] |= 2;
    if (carry) w.carry[s] = carry;
    if (job > 0) this.showJobs.set(w.ids[s], job);
    if (state === 'dead') w.ids[s] = 0; // nur die Leiche (per Sterbe-Ereignis aus dem Skript) bleibt
    this.commitTick(0);
  }

  /** Weltposition einer Rasterzelle der Prüfszene (Spalte nach Bildschirm-rechts, Zeile zur Kamera) */
  gridPos(col: number, row: number): { x: number; y: number } {
    const g = this.showcaseGrid;
    const u = (col - (g.cols - 1) / 2) * g.spacing;
    const v = (row - 1.5) * g.rowSpacing;
    const k = Math.SQRT1_2;
    return { x: this.cx + (u + v) * k, y: this.cy + (v - u) * k };
  }

  /** Prüfszene: alle Gebäudetypen im Raster, dazu Mauerformen */
  showcaseBuildings(): void {
    const { cx, cy } = this;
    let x = cx - 42;
    let y = cy - 24;
    let rowH = 0;
    for (let t = 0; t < BUILDINGS.length; t++) {
      const def = BUILDINGS[t];
      if (def.hp <= 0 || t === BT.WallWood || t === BT.WallLow || t === BT.WallHigh || t === BT.Stairs) continue;
      if (x + def.w > cx + 44) {
        x = cx - 42;
        y += rowH + 2;
        rowH = 0;
      }
      const cb = this.addBuilding(t, Math.round(x), Math.round(y), t % 2, 0, t === BT.Fletcher ? 1 : 0, 1);
      // Großer Turm mit Ballista, zweiter mit Mangonel (Geschütze sind ein Feld des Turms)
      if (t === BT.TowerRound) cb.u = 1;
      x += def.w + 1.5;
      rowH = Math.max(rowH, def.h);
    }
    {
      const tw = BUILDINGS[BT.TowerRound];
      if (x + tw.w > cx + 44) {
        x = cx - 42;
        y += rowH + 2;
      }
      this.addBuilding(BT.TowerRound, Math.round(x), Math.round(y), 1, 0, 0, 1).u = 2;
    }
    // Mauerformen: gerade, Ecke, T, Kreuz, Treppe, Tor
    const wy = cy + 14;
    const wx = cx - 40;
    const plan = [
      '#########  ####  #####  ###  #  ',
      '#       #  #  #  #       # #  #  ',
      '#   #####  #  #  #####   ###  #S#',
      '#   #      ####      #        #  ',
      '#####                #####       ',
    ];
    plan.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '#') this.addBuilding([BT.WallHigh, BT.WallLow, BT.WallWood][Math.floor(i / 12) % 3], wx + i, wy + j * 1, 0);
      }
    });
    this.addBuilding(BT.Stairs, wx + 35, wy + 1, 0);
    this.addBuilding(BT.TowerLookout, wx + 36, wy + 6, 0);
  }

  /**
   * Prüfszene Bauanimation: ausgewählte Typen in einer Reihe, alle mit Platzierungs-Tick `BUILD_BORN`.
   * Das Alter stellt der Aufrufer über `__bench.setTick(BUILD_BORN + Alter)` ein (Ticks, 10 je Sekunde).
   */
  showcaseBuild(): void {
    const { cx, cy } = this;
    const row1: number[] = [BT.Hovel, BT.Mill, BT.Bakery, BT.Brewery, BT.Inn, BT.Church, BT.WheatFarm];
    const row2: number[] = [BT.TowerLookout, BT.TowerGuard, BT.GateStone, BT.Barracks, BT.Quarry, BT.Market, BT.Blacksmith];
    let x = cx - 40;
    for (const t of row1) {
      this.addBuilding(t, Math.round(x), Math.round(cy - 14), 0, 0, 0, 1, BUILD_BORN);
      x += BUILDINGS[t].w + 3;
    }
    x = cx - 40;
    for (const t of row2) {
      this.addBuilding(t, Math.round(x), Math.round(cy - 4), 0, 0, 0, 1, BUILD_BORN);
      x += BUILDINGS[t].w + 3;
    }
    // gezogene Mauerlinien (Holz, niedrig, hoch) und ein Winkel
    for (let i = 0; i < 14; i++) this.addBuilding(BT.WallHigh, cx - 40 + i, cy + 8, 0, 0, 0, 0, BUILD_BORN);
    for (let i = 0; i < 10; i++) this.addBuilding(BT.WallLow, cx - 40 + i, cy + 12, 0, 0, 0, 0, BUILD_BORN);
    for (let i = 0; i < 10; i++) this.addBuilding(BT.WallWood, cx - 40 + i, cy + 16, 0, 0, 0, 0, BUILD_BORN);
    for (let j = 1; j < 5; j++) this.addBuilding(BT.WallWood, cx - 31, cy + 16 - j, 0, 0, 0, 0, BUILD_BORN);
  }

  /** schreibt den Projektilpuffer im Snapshot-Format */
  private commitTick(_dt: number): void {
    const w = this.w;
    const arr = new Float32Array(this.projs.length * 8);
    let o = 0;
    for (const p of this.projs) {
      const f = p.t / p.T;
      const f2 = Math.min(1, (p.t + 1) / p.T);
      const x = p.sx + (p.ex - p.sx) * f;
      const y = p.sy + (p.ey - p.sy) * f;
      const z = p.sz + (p.ez - p.sz) * f + p.arc * 4 * f * (1 - f);
      const nx = p.sx + (p.ex - p.sx) * f2;
      const ny = p.sy + (p.ey - p.sy) * f2;
      const nz = p.sz + (p.ez - p.sz) * f2 + p.arc * 4 * f2 * (1 - f2);
      arr[o++] = p.kind;
      arr[o++] = p.owner;
      arr[o++] = x;
      arr[o++] = y;
      arr[o++] = z;
      arr[o++] = nx - x;
      arr[o++] = ny - y;
      arr[o++] = nz - z;
    }
    w.proj = arr;
    w.lastSnapMs = performance.now();
  }
}

/** Zusätzliche Prüfspalten: Bauern in den verschiedenen Berufen (Beruf folgt aus Ware/Teilzustand) */
function professionEntries(): ShowcaseEntry[] {
  return JOB_NAMES.map((label, job) => ({ type: U.Peasant, label, job }));
}

/** Einstieg: ersetzt das normale Spiel durch die Benchmark-Szene */
export function startBench(): void {
  const q = new URLSearchParams(location.search);
  const total = Math.max(2, Number(q.get('units') ?? 2000));
  const secs = Number(q.get('secs') ?? 20);
  const warm = Number(q.get('warm') ?? 3);
  const quality = (q.get('quality') ?? 'medium') as 'low' | 'medium' | 'high';
  const seed = Number(q.get('seed') ?? 1);
  document.title = 'StrongPoly Benchmark';
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  ui.innerHTML = '';
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const gs = new GameScene(canvas);
  gs.gfx.pixelRatio = Number(q.get('pr') ?? 1);
  // &style=medieval: GLB-Assets der Phase 5A (wo registriert) statt prozeduraler Modelle; Messung startet nach dem Laden
  const style = parseStyle(q.get('style')) ?? 'classic';
  assetRegistry.setStyle(style);
  // für Messskripte (z. B. weitere Einheitentypen per register() auf eine GLB-Figur abbilden)
  (window as unknown as Record<string, unknown>).__assets = assetRegistry;
  // &nodraw=1: Draw-Calls werden zu No-ops. So misst man die reine JS-Zeit (Szenengraph, Instanzdaten, Uploads),
  // unabhängig davon, wie langsam der Rasterizer (z. B. SwiftShader) den Befehlspuffer abarbeitet.
  const nodraw = q.get('nodraw') === '1';
  if (nodraw) {
    const gl = gs.renderer.getContext() as unknown as Record<string, unknown>;
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) gl[n] = () => undefined;
  }
  const showcase = q.get('showcase');
  /** &still=1: Kamera ohne Schwenk (reproduzierbare Vergleichsaufnahmen) */
  const still = q.get('still') === '1';
  const bw = new BenchWorld(showcase ? 0 : total, seed, !!showcase);
  if (q.get('face')) bw.showFace = Number(q.get('face'));
  if (showcase === 'units') bw.showcaseUnits(q.get('prof') === '1' ? professionEntries() : []);
  else if (showcase === 'buildings') bw.showcaseBuildings();
  else if (showcase === 'single') bw.showcaseSingle(Number(q.get('type') ?? 8), q.get('state') ?? 'stand', Number(q.get('job') ?? 0), Number(q.get('team') ?? 0), Number(q.get('carry') ?? 0));
  else if (showcase === 'build') {
    bw.showcaseBuild();
    bw.w.tick = BUILD_BORN - 5;
  }
  const world = bw.w;
  const entities = new EntityRenderer(world);
  gs.root.add(entities.group);
  gs.setMap(world.map);
  gs.decor?.setOccupancy(world.bldAt, world.buildings);
  entities.onBuildingsChanged = () => gs.decor?.markDirty();
  for (const [id, j] of bw.showJobs) entities.debugJobs.set(id, j);
  gs.onGfx = (qc, sh) => entities.applyQuality(qc, sh);
  gs.applyGfx({ quality, shadows: q.get('shadows') !== '0' });
  entities.applyQuality(gs.qcfg, gs.gfx.shadows && gs.qcfg.shadows);
  if (q.get('blood') === '0') entities.setBlood(false);
  gs.cam.maxDist = 120;
  let camX = bw.cx;
  let camY = bw.cy;
  let camDist = Number(q.get('dist') ?? 46);
  gs.cam.lookAt(camX, camY);
  gs.cam.dist = camDist;
  gs.cam.zoom(0);
  const setCamera = (x: number, y: number, d?: number): void => {
    camX = x;
    camY = y;
    if (d) {
      camDist = d;
      gs.cam.dist = d;
      (gs.cam as unknown as { distTarget: number }).distTarget = d;
    }
    gs.cam.lookAt(camX, camY);
  };
  setCamera(camX, camY, camDist);

  // &labels=1: Beschriftung der Prüfszene (Einheitennamen über der ersten Reihe)
  const labelEls: HTMLDivElement[] = [];
  if (q.get('labels') === '1') {
    for (const l of bw.labels) {
      const el = document.createElement('div');
      el.textContent = l.text;
      el.style.cssText = 'position:fixed;transform:translate(-50%,-100%);padding:1px 4px;background:rgba(20,16,12,0.7);color:#f3e8c8;font:10px/1.3 sans-serif;border-radius:3px;pointer-events:none;z-index:19;white-space:nowrap';
      app.appendChild(el);
      labelEls.push(el);
    }
  }
  const projV = new THREE.Vector3();
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;left:8px;top:8px;padding:6px 10px;background:rgba(20,16,12,0.78);color:#f3e8c8;font:12px/1.5 monospace;border-radius:6px;pointer-events:none;z-index:20;white-space:pre';
  app.appendChild(overlay);

  const frameMs: number[] = [];
  const cpuMs: number[] = [];
  const updMs: number[] = [];
  const renMs: number[] = [];
  const partMs: Record<string, number[]> = { buildings: [], units: [], corpses: [], proj: [], emit: [], fx: [] };
  let startT = 0;
  let last = performance.now();
  let tickAcc = 0;
  let running = false;
  let done = false;
  let lastCalls = 0;
  let lastTris = 0;
  let begin = performance.now();
  let recent: number[] = [];
  const result = (): BenchResult => {
    const f = [...frameMs].sort((a, b) => a - b);
    const c = [...cpuMs].sort((a, b) => a - b);
    const gl = gs.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const avg = mean(frameMs);
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      avgMs: avg,
      p95Ms: pct(f, 0.95),
      p99Ms: pct(f, 0.99),
      cpuAvgMs: mean(cpuMs),
      cpuP95Ms: pct(c, 0.95),
      updateMs: mean(updMs),
      renderMs: mean(renMs),
      parts: Object.fromEntries(Object.entries(partMs).map(([k, v]) => [k, mean(v)])),
      calls: lastCalls,
      triangles: lastTris,
      units: bw.count,
      unitsDrawn: entities.stats.units,
      projectiles: entities.stats.projectiles,
      particles: entities.fx.count,
      quality,
      nodraw,
      secs,
      frames: frameMs.length,
      viewport: `${innerWidth}x${innerHeight}`,
      gl: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unbekannt',
      done,
    };
  };
  const ctl = { selectedBuilding: 0, hoverBuilding: 0 };
  const selected = new Set<number>();
  const destroy = (id: number): void => {
    const b = world.buildings.get(id);
    if (!b) return;
    const def = BUILDINGS[b.t];
    world.clearBuilding(b);
    world.removedBuildings.push(b);
    world.buildings.delete(id);
    world.buildingsDirty = true;
    world.events.push({ e: 'fx', k: def.wood ? 'collapseWood' : 'collapse', x: b.x + b.w / 2, y: b.y + b.h / 2, z: def.height });
  };
  let fixedT: number | null = null;
  let frameCount = 0;
  window.__bench = { ready: true, done: false, result, scene: gs, entities, world, setCamera, setTick: (t: number) => {
      world.tick = t;
      world.buildingsDirty = true;
    }, destroy, selected, ui: ctl, setTime: (t) => (fixedT = t), frameNo: () => frameCount };

  const loop = (nowMs: number): void => {
    const dtReal = (nowMs - last) / 1000;
    const dt = Math.min(0.1, dtReal);
    const interval = nowMs - last;
    last = nowMs;
    if (!running) {
      running = true;
      startT = nowMs;
      begin = nowMs;
    }
    // Sim-Ticks nachholen (höchstens 3 je Frame)
    tickAcc += Math.min(1.2, dtReal);
    let ticks = 0;
    while (tickAcc >= 0.1 && ticks < 12) {
      tickAcc -= 0.1;
      if (!showcase) bw.tick();
      ticks++;
    }
    if (showcase) world.lastSnapMs = performance.now();
    if (tickAcc > 1.2) tickAcc = 0;
    const nowS = fixedT ?? nowMs / 1000;
    frameCount++;
    // Kamera: leichter Schwenk, damit Schatten- und Dekor-Updates mitlaufen
    const t = (nowMs - begin) / 1000;
    if (still) gs.cam.lookAt(camX, camY);
    else gs.cam.lookAt(camX + Math.sin(t * 0.35) * 5, camY + Math.cos(t * 0.27) * 2);
    if (labelEls.length) {
      gs.cam.camera.updateMatrixWorld();
      bw.labels.forEach((l, i) => {
        projV.set(l.x, 0.0, l.y).project(gs.cam.camera);
        const el = labelEls[i];
        const vis = projV.z < 1 && Math.abs(projV.x) < 1.05 && Math.abs(projV.y) < 1.05;
        el.style.display = vis ? '' : 'none';
        el.style.left = `${((projV.x + 1) / 2) * innerWidth}px`;
        el.style.top = `${((1 - projV.y) / 2) * innerHeight}px`;
      });
    }
    const alpha = (performance.now() - world.lastSnapMs) / 100;
    const tU0 = performance.now();
    entities.consumeEvents();
    entities.update(dt, {
      alpha,
      now: nowS,
      camYaw: gs.cam.yaw,
      selected,
      selectedBuilding: ctl.selectedBuilding,
      hoverBuilding: ctl.hoverBuilding,
      hoverTile: null,
      camera: gs.cam.camera,
      visible: null,
      explored: null,
      me: 0,
      myTeam: 0,
      teamOfPlayer: [0, 1],
    });
    entities.clearEvents();
    const tU1 = performance.now();
    gs.render(dt, nowS);
    const tU2 = performance.now();
    const info = gs.renderer.info;
    lastCalls = info.render.calls;
    lastTris = info.render.triangles;
    const cpu = tU2 - tU0;
    const elapsed = (nowMs - startT) / 1000;
    if (!done && elapsed >= warm) {
      frameMs.push(interval);
      cpuMs.push(cpu);
      updMs.push(tU1 - tU0);
      renMs.push(tU2 - tU1);
      for (const k of Object.keys(partMs)) partMs[k].push((entities.stats.ms as Record<string, number>)[k]);
      if (elapsed >= warm + secs) {
        done = true;
        if (window.__bench) window.__bench.done = true;
        console.log('BENCH_DONE ' + JSON.stringify(result()));
      }
    }
    recent.push(interval);
    if (recent.length > 30) recent = recent.slice(-30);
    if (nowMs % 400 < 40 || frameMs.length < 3) {
      const r = mean(recent);
      overlay.textContent =
        `StrongPoly Benchmark  ${quality}  ${bw.count} Einheiten\n` +
        `FPS ${(1000 / (r || 1)).toFixed(1)}  Frame ${r.toFixed(1)} ms  JS ${cpu.toFixed(1)} ms (Update ${(tU1 - tU0).toFixed(1)} / Render ${(tU2 - tU1).toFixed(1)})\n` +
        `Draw-Calls ${lastCalls}  Dreiecke ${(lastTris / 1000).toFixed(0)}k  Partikel ${entities.fx.count}  Proj ${entities.stats.projectiles}\n` +
        (done ? 'Messung beendet' : elapsed < warm ? 'Warmlauf …' : `Messung ${Math.min(secs, elapsed - warm).toFixed(0)}/${secs} s`);
    }
    requestAnimationFrame(loop);
  };
  if (style === 'medieval') void assetRegistry.preload().then(() => requestAnimationFrame(loop));
  else requestAnimationFrame(loop);
}
