import { GameMap } from '../map/gamemap';
import { TERRAIN_SPEED } from '../data/terrain';

/** Bit-Flags pro Tile (aus Gebäuden abgeleitet) */
export const NK = { Solid: 1, Gate: 2, Stairs: 4, WallTop: 8, Bld: 16 } as const;

/** Nachbarn (8 Richtungen): 0..3 orthogonal, 4..7 diagonal */
export const DX = [1, 0, -1, 0, 1, -1, -1, 1];
export const DY = [0, 1, 0, -1, 1, 1, -1, -1];
export const DIR_SWITCH = 8;
export const DIR_NONE = 255;

export interface Field {
  dir: Uint8Array;
  goal: number;
  team: number;
  breach: boolean;
  version: number;
  tick: number;
  lastUse: number;
  limit: number;
}

/**
 * Navigationsgitter mit zwei Ebenen (0 = Boden, 1 = Mauerkrone) und gecachten Flowfields.
 * Kosten: orthogonal 10, diagonal 14, Durchbruch durch feindliche Gebäude teuer.
 */
export class Nav {
  readonly n: number;
  readonly w: number;
  readonly h: number;
  kind: Uint8Array;
  /** Besitzer+1 des Gebäudes auf dem Tile (0 = keins) */
  owner: Uint8Array;
  /** Bitmaske der Teams, die an diesem Tile per Leiter/Belagerungsturm klettern dürfen */
  ladder: Uint8Array;
  version = 1;
  /** Team je Spieler (für Torregel) */
  teamOf: number[] = [];
  private fields = new Map<number, Field>();
  private dist: Int32Array;
  private touched: Int32Array;
  private heapK: Int32Array;
  private heapV: Int32Array;
  private heapN = 0;
  computeBudget = 0;
  computedThisTick = 0;
  stats = { computes: 0, ms: 0 };

  constructor(readonly map: GameMap) {
    this.n = map.n;
    this.w = map.w;
    this.h = map.h;
    this.kind = new Uint8Array(this.n);
    this.owner = new Uint8Array(this.n);
    this.ladder = new Uint8Array(this.n);
    this.dist = new Int32Array(this.n * 2).fill(0x3fffffff);
    this.touched = new Int32Array(this.n * 2);
    this.heapK = new Int32Array(this.n * 8);
    this.heapV = new Int32Array(this.n * 8);
  }

  bump(): void {
    this.version++;
  }

  /** Statisch begehbar (Terrain/Bäume/Gebäude), Torregel nach Team */
  groundFree(i: number, team: number): boolean {
    const k = this.kind[i];
    if (k & NK.Gate && this.teamOf[this.owner[i] - 1] === team) return true;
    if (k & NK.Stairs) return true;
    if (k & NK.Solid) return false;
    return this.map.walkable(i);
  }

  /** Eintrittskosten in Bodenknoten; <0 = unpassierbar. */
  private groundCost(i: number, team: number, breach: boolean): number {
    const k = this.kind[i];
    if (k) {
      if (k & NK.Gate && this.teamOf[this.owner[i] - 1] === team) return 10;
      if (k & NK.Stairs) return 10;
      if (k & NK.Solid) {
        if (this.ladder[i] & (1 << team)) return 20;
        if (breach && this.map.walkableTerrain(i) && this.teamOf[this.owner[i] - 1] !== team) {
          return k & NK.Gate ? 140 : 260;
        }
        return -1;
      }
    }
    if (this.map.trees[i] !== 0) return -1;
    const sp = TERRAIN_SPEED[this.map.terrain[i]];
    if (!sp) return -1;
    return sp >= 1 ? 10 : Math.round(10 / sp);
  }

  private topFree(i: number): boolean {
    return (this.kind[i] & NK.WallTop) !== 0;
  }

  /** Dijkstra vom Ziel aus; liefert Richtungsfeld */
  private compute(team: number, goal: number, breach: boolean, limit: number, f?: Field): Field {
    const t0 = performance.now();
    const N2 = this.n * 2;
    const dist = this.dist;
    const touched = this.touched;
    let nt = 0;
    const field: Field =
      f ?? { dir: new Uint8Array(N2), goal, team, breach, version: 0, tick: 0, lastUse: 0, limit };
    field.dir.fill(DIR_NONE);
    field.limit = limit;
    const dir = field.dir;
    const w = this.w;
    const map = this.map;
    this.heapN = 0;
    dist[goal] = 0;
    touched[nt++] = goal;
    this.push(0, goal);
    while (this.heapN > 0) {
      const v = this.heapV[0];
      const d = this.heapK[0];
      this.pop();
      if (d > dist[v]) continue;
      if (d > limit) break;
      const t = v >> 1;
      const layer = v & 1;
      const x = t % w;
      const y = (t / w) | 0;
      // Kosten, um u zu betreten, wo u = v (Ziel der Bewegung der Nachbarn)
      // Nachbarn s laufen nach v: Kosten = enterCost(v)
      if (layer === 0) {
        const enter = this.groundCost(t, team, breach);
        if (enter < 0 && v !== goal) continue;
        const base = enter < 0 ? 10 : enter;
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k];
          const ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
          const s = ny * w + nx;
          // s muss stehbar sein (nicht-hart blockiert) – Durchbruchsknoten sind nur Zwischenziele
          const sCost = this.groundCost(s, team, breach);
          if (sCost < 0) continue;
          if (Math.abs(map.height[s] - map.height[t]) > 1 && !(this.kind[s] & (NK.Gate | NK.Stairs)) && !(this.kind[t] & (NK.Gate | NK.Stairs))) continue;
          if (k >= 4) {
            // keine Ecken schneiden
            const a = y * w + nx;
            const b = ny * w + x;
            if (this.hard(a, team) || this.hard(b, team)) continue;
          }
          // Einheit steht auf s und geht nach t (Durchbruchs-Tiles dienen als Zwischenknoten)
          const nd = d + (k < 4 ? base : Math.round(base * 1.4));
          const sv = s * 2;
          if (nd < dist[sv]) {
            if (dist[sv] === 0x3fffffff) touched[nt++] = sv;
            dist[sv] = nd;
            // Richtung von s nach t: entgegengesetzt zu k
            dir[sv] = opp(k);
            this.push(nd, sv);
          }
        }
        // Übergänge Boden<->Krone
        if (this.kind[t] & NK.Stairs || this.ladder[t] & (1 << team)) {
          const sv = t * 2 + 1;
          if (this.topFree(t)) {
            const nd = d + 8;
            if (nd < dist[sv]) {
              if (dist[sv] === 0x3fffffff) touched[nt++] = sv;
              dist[sv] = nd;
              dir[sv] = DIR_SWITCH;
              this.push(nd, sv);
            }
          }
        }
      } else {
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k];
          const ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
          const s = ny * w + nx;
          if (!this.topFree(s)) continue;
          if (k >= 4) {
            if (!this.topFree(y * w + nx) || !this.topFree(ny * w + x)) continue;
          }
          const nd = d + (k < 4 ? 10 : 14);
          const sv = s * 2 + 1;
          if (nd < dist[sv]) {
            if (dist[sv] === 0x3fffffff) touched[nt++] = sv;
            dist[sv] = nd;
            dir[sv] = opp(k);
            this.push(nd, sv);
          }
        }
        if (this.kind[t] & NK.Stairs || this.ladder[t] & (1 << team)) {
          const sv = t * 2;
          const sc = this.groundCost(t, team, breach);
          if (sc >= 0) {
            const nd = d + 8;
            if (nd < dist[sv]) {
              if (dist[sv] === 0x3fffffff) touched[nt++] = sv;
              dist[sv] = nd;
              dir[sv] = DIR_SWITCH;
              this.push(nd, sv);
            }
          }
        }
      }
    }
    for (let i = 0; i < nt; i++) dist[touched[i]] = 0x3fffffff;
    field.version = this.version;
    this.stats.computes++;
    this.stats.ms += performance.now() - t0;
    return field;
  }

  private hard(i: number, team: number): boolean {
    return this.groundCost(i, team, false) < 0;
  }

  /**
   * Flowfield zum Zielknoten holen. Bei Cache-Miss wird (im Rahmen des Tick-Budgets) berechnet.
   * Veraltete Felder werden weiterverwendet und mit Verzögerung aktualisiert.
   */
  getField(team: number, goalNode: number, breach: boolean, tick: number, limit = 0x3fffff00): Field | null {
    const key = ((goalNode * 8 + team) * 2 + (breach ? 1 : 0)) * 2;
    let f = this.fields.get(key);
    if (f) {
      f.lastUse = tick;
      if (f.version !== this.version && tick - f.tick >= 8 && this.computedThisTick < this.computeBudget) {
        this.computedThisTick++;
        this.compute(team, goalNode, breach, f.limit, f);
        f.tick = tick;
      }
      return f;
    }
    if (this.computedThisTick >= this.computeBudget) return null;
    this.computedThisTick++;
    f = this.compute(team, goalNode, breach, limit);
    f.tick = tick;
    f.lastUse = tick;
    this.fields.set(key, f);
    if (this.fields.size > 64) this.evict(tick);
    return f;
  }

  private evict(tick: number): void {
    let oldestKey = -1;
    let oldest = Infinity;
    for (const [k, f] of this.fields) {
      if (f.lastUse < oldest) {
        oldest = f.lastUse;
        oldestKey = k;
      }
    }
    if (oldestKey >= 0 && oldest < tick) this.fields.delete(oldestKey);
  }

  invalidateAll(): void {
    this.fields.clear();
  }

  /** Erreichbarkeit via Flowfield */
  reachable(f: Field, node: number): boolean {
    return node === f.goal || f.dir[node] !== DIR_NONE;
  }

  // --- Heap ---
  private push(k: number, v: number): void {
    let i = this.heapN++;
    if (this.heapN > this.heapK.length) {
      const nk = new Int32Array(this.heapK.length * 2);
      nk.set(this.heapK);
      this.heapK = nk;
      const nv = new Int32Array(this.heapV.length * 2);
      nv.set(this.heapV);
      this.heapV = nv;
    }
    const hk = this.heapK;
    const hv = this.heapV;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p];
      hv[i] = hv[p];
      i = p;
    }
    hk[i] = k;
    hv[i] = v;
  }

  private pop(): void {
    const hk = this.heapK;
    const hv = this.heapV;
    const n = --this.heapN;
    if (n === 0) return;
    const k = hk[n];
    const v = hv[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[i] = hk[c];
      hv[i] = hv[c];
      i = c;
    }
    hk[i] = k;
    hv[i] = v;
  }
}

function opp(k: number): number {
  // Gegenrichtung für DX/DY-Tabelle
  switch (k) {
    case 0: return 2;
    case 1: return 3;
    case 2: return 0;
    case 3: return 1;
    case 4: return 6;
    case 5: return 7;
    case 6: return 4;
    default: return 5;
  }
}
