import * as THREE from 'three';
import { BT, BUILDINGS, T } from '@strongpoly/shared';

/**
 * Bodenkarte: aus den Gebäuden im Client-Spiegel abgeleitete Spuren im Gelände (reine Darstellung, keine Sim-Daten).
 * Pro Tile vier Kanäle (RGBA8), im Gelände-Shader bilinear gelesen, daher weiche Ränder:
 *   R getretene Erde um Gebäude und Lagerplätze
 *   G Ackerfläche (Weizen-/Hopfenhöfe)
 *   B Kontaktschatten (Boden direkt am Gebäude/an der Mauer dunkler)
 *   A Trampelpfade zwischen Gebäuden und dem nächsten Lager-/Versorgungsgebäude
 */
export const GROUND_R = 0;
export const GROUND_G = 1;
export const GROUND_B = 2;
export const GROUND_A = 3;

export interface GroundBuilding {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GroundMapLike {
  w: number;
  h: number;
  terrain: ArrayLike<number>;
}

/** Gebäude, zu denen Pfade führen (Lager, Versorgung, Zentrum) */
const HUBS = new Set<number>([BT.Keep, BT.Stockpile, BT.Granary, BT.Armory, BT.Market]);
/** Ackerflächen */
const FIELDS = new Set<number>([BT.WheatFarm, BT.HopFarm]);
/** Gebäude ohne Spuren (Linienbauten, Fallen, kleine Dekoration) */
function leavesTrace(t: number): boolean {
  const d = BUILDINGS[t];
  return !!d && !d.line && d.hp > 0 && d.height >= 0.7 && t !== BT.Stairs;
}

/** Wirkungsradius der getretenen Erde (Felder um die Grundfläche) und Stärke je Gebäudeart */
export function wearOf(t: number): { radius: number; strength: number } {
  switch (t) {
    case BT.Keep:
      return { radius: 3.2, strength: 1 };
    case BT.Stockpile:
    case BT.Granary:
    case BT.Armory:
      return { radius: 2.6, strength: 1 };
    case BT.Market:
      return { radius: 3.0, strength: 1 };
    case BT.Woodcutter:
    case BT.Quarry:
    case BT.IronMine:
    case BT.PitchRig:
    case BT.OxTether:
      return { radius: 2.4, strength: 0.95 };
    case BT.Barracks:
    case BT.Stable:
    case BT.MercPost:
    case BT.EngineerGuild:
      return { radius: 2.4, strength: 0.85 };
    default:
      return { radius: 1.5, strength: 0.7 };
  }
}

function distToRect(px: number, py: number, b: GroundBuilding): number {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Berechnet die Bodenkarte. Ergebnis: RGBA8, Länge w*h*4, Zeilenreihenfolge wie die Karte (y*w+x).
 * Rein und deterministisch: gleiche Gebäude (in beliebiger Reihenfolge) ergeben dieselbe Karte.
 */
export function computeGround(map: GroundMapLike, buildings: Iterable<GroundBuilding>, out?: Uint8Array): Uint8Array {
  const { w, h } = map;
  const n = w * h;
  const wear = new Float32Array(n);
  const field = new Float32Array(n);
  const contact = new Float32Array(n);
  const path = new Float32Array(n);
  const list = [...buildings].sort((a, b) => a.t - b.t || a.y - b.y || a.x - b.x);
  const wet = (i: number): boolean => map.terrain[i] === T.Water || map.terrain[i] === T.Moat;

  for (const b of list) {
    const def = BUILDINGS[b.t];
    if (!def || def.hp <= 0) continue;
    const trace = leavesTrace(b.t);
    const isField = FIELDS.has(b.t);
    const wr = wearOf(b.t);
    const reach = trace ? Math.max(wr.radius, isField ? 1.4 : 0) : 0;
    const cr = def.line ? 0.8 : 1.1;
    const R = Math.ceil(Math.max(reach, cr)) + 1;
    for (let ty = Math.max(0, b.y - R); ty <= Math.min(h - 1, b.y + b.h + R); ty++)
      for (let tx = Math.max(0, b.x - R); tx <= Math.min(w - 1, b.x + b.w + R); tx++) {
        const i = ty * w + tx;
        if (wet(i)) continue;
        const d = distToRect(tx + 0.5, ty + 0.5, b);
        const inside = tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h;
        const dd = inside ? 0 : d;
        // Kontaktschatten: im Fußabdruck 1, nach außen auf 0 (über cr Felder)
        const c = Math.max(0, 1 - dd / cr);
        const cw = def.line ? 0.55 : 0.8;
        if (c > 0) contact[i] = Math.max(contact[i], c * c * cw);
        if (trace && !isField) {
          const k = Math.max(0, 1 - dd / wr.radius);
          if (k > 0) wear[i] = Math.max(wear[i], Math.min(1, k * 1.15) * wr.strength);
        }
        if (isField) {
          const k = Math.max(0, 1 - dd / 1.0);
          if (k > 0) field[i] = Math.max(field[i], k);
          const kw = Math.max(0, 1 - dd / 2.2);
          if (kw > 0) wear[i] = Math.max(wear[i], kw * 0.55);
        }
      }
  }

  // Pfade: jedes Gebäude mit Spuren verbindet sich mit dem nächsten Lager-/Versorgungsgebäude (höchstens 18 Felder)
  const hubs = list.filter((b) => HUBS.has(b.t));
  for (const b of list) {
    if (!leavesTrace(b.t) || FIELDS.has(b.t)) continue;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    let best: GroundBuilding | null = null;
    let bd = 18;
    for (const hb of hubs) {
      if (hb === b) continue;
      const d = Math.hypot(hb.x + hb.w / 2 - bx, hb.y + hb.h / 2 - by) - (hb.w + hb.h) / 4 - (b.w + b.h) / 4;
      if (d < bd) {
        bd = d;
        best = hb;
      }
    }
    if (!best) continue;
    const ex = best.x + best.w / 2;
    const ey = best.y + best.h / 2;
    const steps = Math.ceil(Math.max(Math.abs(ex - bx), Math.abs(ey - by)) * 2);
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const px = Math.floor(bx + (ex - bx) * f);
      const py = Math.floor(by + (ey - by) * f);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = py * w + px;
      if (wet(i)) continue;
      path[i] = Math.max(path[i], 0.9);
      // Schultern: Nachbarfelder halb, damit der Pfad ein ruhiges Band ergibt
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!wet(j)) path[j] = Math.max(path[j], 0.38);
      }
    }
  }

  const o = out && out.length === n * 4 ? out : new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    o[i * 4 + GROUND_R] = Math.round(Math.min(1, wear[i]) * 255);
    o[i * 4 + GROUND_G] = Math.round(Math.min(1, field[i]) * 255);
    o[i * 4 + GROUND_B] = Math.round(Math.min(1, contact[i]) * 255);
    o[i * 4 + GROUND_A] = Math.round(Math.min(1, path[i]) * 255);
  }
  return o;
}

/** Spurstärke 0..1 an einem Tile (für Dekor: kein Gras auf Pfaden und Feldern) */
export function groundTrace(data: Uint8Array, i: number): number {
  const k = i * 4;
  return Math.max(data[k + GROUND_R] * 0.8, data[k + GROUND_G], data[k + GROUND_A]) / 255;
}

/** Bodenkarte samt Textur; ohne Gebäude leer. Die Textur wird bei Änderungen neu hochgeladen. */
export class GroundMap {
  data: Uint8Array<ArrayBuffer>;
  readonly texture: THREE.DataTexture;
  private dirty = false;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
    this.texture = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
  }

  /** neu berechnen (aus dem Gebäudebestand) und beim nächsten Rendern hochladen */
  update(map: GroundMapLike, buildings: Iterable<GroundBuilding>): void {
    computeGround(map, buildings, this.data);
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  dispose(): void {
    this.texture.dispose();
  }

  get isDirty(): boolean {
    return this.dirty;
  }
}
