import { T, TERRAIN_SPEED } from '../data/terrain';

export interface StartPos {
  x: number;
  y: number;
}

/** Tile-basierte Karte. Reine Daten (typisierte Arrays), keine Logik außer Zugriffshilfen. */
export class GameMap {
  readonly n: number;
  terrain: Uint8Array;
  height: Uint8Array;
  /** Holz in den Bäumen auf dem Tile (0 = kein Baum) */
  trees: Uint8Array;
  /** Restmenge Stein/Eisen/Pech */
  deposit: Uint16Array;
  /** Fallen-Typ (0 keine, 1 Fallgrube, 2 Killing Pit) – wird von der Sim gepflegt */
  trap: Uint8Array;
  starts: StartPos[] = [];
  name = '';
  seed = 0;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.n = w * h;
    this.terrain = new Uint8Array(this.n);
    this.height = new Uint8Array(this.n);
    this.trees = new Uint8Array(this.n);
    this.deposit = new Uint16Array(this.n);
    this.trap = new Uint8Array(this.n);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** Terrain begehbar (ohne Gebäude/Bäume)? */
  walkableTerrain(i: number): boolean {
    return TERRAIN_SPEED[this.terrain[i]] > 0;
  }
  /** Von Fußtruppen betretbar, ohne Gebäude zu betrachten */
  walkable(i: number): boolean {
    return this.trees[i] === 0 && TERRAIN_SPEED[this.terrain[i]] > 0;
  }
  speedAt(x: number, y: number): number {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inBounds(tx, ty)) return 0;
    return TERRAIN_SPEED[this.terrain[this.idx(tx, ty)]] || 0;
  }
  isWater(i: number): boolean {
    const t = this.terrain[i];
    return t === T.Water || t === T.Moat;
  }
  clone(): GameMap {
    const m = new GameMap(this.w, this.h);
    m.terrain.set(this.terrain);
    m.height.set(this.height);
    m.trees.set(this.trees);
    m.deposit.set(this.deposit);
    m.trap.set(this.trap);
    m.starts = this.starts.map((s) => ({ ...s }));
    m.name = this.name;
    m.seed = this.seed;
    return m;
  }
}

/** Serialisierbares Kartenformat (Editor-Export, Savegames, Netzwerk-Init) */
export interface MapJson {
  v: 1;
  name: string;
  seed: number;
  w: number;
  h: number;
  /** base64 von Uint8Array (RLE-komprimiert) */
  terrain: string;
  height: string;
  trees: string;
  deposit: string;
  starts: StartPos[];
}

function rleEncode(a: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let run = 1;
    while (i + run < a.length && a[i + run] === v && run < 255) run++;
    out.push(run, v);
    i += run;
  }
  return Uint8Array.from(out);
}
function rleDecode(b: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i + 1 < b.length; i += 2) {
    const run = b[i];
    const v = b[i + 1];
    out.fill(v, o, o + run);
    o += run;
  }
  return out;
}
export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < b.length; i += chunk) s += String.fromCharCode(...b.subarray(i, i + chunk));
  return btoa(s);
}
export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

export function mapToJson(m: GameMap): MapJson {
  const dep8 = new Uint8Array(m.n);
  // Deposits werden beim Laden aus dem Terrain neu initialisiert; Menge als 0..255 (x 10)
  for (let i = 0; i < m.n; i++) dep8[i] = Math.min(255, Math.round(m.deposit[i] / 10));
  return {
    v: 1,
    name: m.name,
    seed: m.seed,
    w: m.w,
    h: m.h,
    terrain: bytesToBase64(rleEncode(m.terrain)),
    height: bytesToBase64(rleEncode(m.height)),
    trees: bytesToBase64(rleEncode(m.trees)),
    deposit: bytesToBase64(rleEncode(dep8)),
    starts: m.starts.map((s) => ({ ...s })),
  };
}

export function mapFromJson(j: MapJson): GameMap {
  if (j.v !== 1 || !(j.w > 0) || !(j.h > 0) || j.w > 512 || j.h > 512) throw new Error('Ungültiges Kartenformat');
  const m = new GameMap(j.w, j.h);
  m.name = j.name ?? '';
  m.seed = j.seed ?? 0;
  m.terrain = rleDecode(base64ToBytes(j.terrain), m.n);
  m.height = rleDecode(base64ToBytes(j.height), m.n);
  m.trees = rleDecode(base64ToBytes(j.trees), m.n);
  const dep8 = rleDecode(base64ToBytes(j.deposit), m.n);
  for (let i = 0; i < m.n; i++) m.deposit[i] = dep8[i] * 10;
  m.starts = j.starts.map((s) => ({ x: s.x, y: s.y }));
  return m;
}
