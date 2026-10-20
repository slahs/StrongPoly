import * as THREE from 'three';
import { TC } from './units_style';

/**
 * Baukasten für die Figurenmodelle: kleine Primitive (Quader, verjüngte Glieder, Zylinder, Kugeln, Dreiecke), die zu einer
 * einzigen Geometrie mit Vertexfarben verschmolzen werden. Jeder Eckpunkt trägt zusätzlich
 *   aPivot  (xyz Drehpunkt, w Teil-Kennung der Vertex-Animation),
 *   aMeta   (x Teamfarbe 0/1, y eingebackene Bodenverdunklung, z Animationsstil des Teils),
 *   aStyle  (x Farbklasse für Variation, y Sichtbarkeits-Bits, z Pivot-Höhe für Neigung/Beinkette, w Berufs-Maske).
 * Koordinaten: Einheit = 1 Tile, y nach oben, +z ist die Blickrichtung, Ursprung am Boden in der Mitte.
 */
type V3 = [number, number, number];

/** Farbe: feste Farbe (Hex) oder Farbklasse (Haut, Haar, Stoff A/B) mit Helligkeit */
export type Col = number | { c: number; k: number };

export const skinC = (k = 1): Col => ({ c: TC.Skin, k });
export const hairC = (k = 1): Col => ({ c: TC.Hair, k });
export const clothA = (k = 1): Col => ({ c: TC.A, k });
export const clothB = (k = 1): Col => ({ c: TC.B, k });

export interface PrimOpts {
  /** Teamfarbe (Instanzfarbe) statt fester Farbe */
  team?: boolean;
  /** Drehung um die Hochachse / Querachse / Längsachse (rad) um den Mittelpunkt des Primitivs */
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  /** Verjüngung nach oben (Faktor auf x und z der Deckfläche) */
  taper?: number | [number, number];
  /** Kappen weglassen */
  capA?: boolean;
  capB?: boolean;
  /** Helligkeitsverlauf unten/oben überschreiben */
  shade?: [number, number];
}

export interface BuildResult {
  geo: THREE.BufferGeometry;
  /** Dreiecke insgesamt (inkl. aller Varianten/LOD-Stufen) */
  tris: number;
}

const cache = new Map<number, THREE.Color>();
function colorOf(hex: number): THREE.Color {
  let c = cache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    cache.set(hex, c);
  }
  return c;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export interface BuilderCfg {
  /** Stärke der Bodenverdunklung und Höhe, bis zu der sie reicht */
  ao?: number;
  aoH?: number;
  /** Flächen nach unten weglassen (Standard an) */
  cullDown?: boolean;
  /** Primitive verwerfen, deren Sichtbarkeits-Bits eines dieser Bits enthalten (Grafikstufe: Details weglassen) */
  drop?: number;
}

export class UnitBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private piv: number[] = [];
  private meta: number[] = [];
  private style: number[] = [];
  private part_ = 0;
  private pivot_: V3 = [0, 0, 0];
  private pstyle_ = 0;
  private show_ = 0;
  private sel_ = 0;
  private upper_ = 0;
  private shade_: [number, number] = [0.8, 1.04];
  tris = 0;
  private ao: number;
  private aoH: number;
  private cullDown: boolean;
  private drop: number;
  private dy_ = 0;

  constructor(cfg: BuilderCfg = {}) {
    this.drop = cfg.drop ?? 0;
    this.ao = cfg.ao ?? 0.22;
    this.aoH = cfg.aoH ?? 0.3;
    this.cullDown = cfg.cullDown ?? true;
  }

  // ------------------------------------------------------------------ Zustand
  /** Folgende Primitive gehören zum Animationsteil `id` mit Drehpunkt; `part(0)` beendet das. `style` wählt die Bewegungsart des Teils. */
  part(id: number, px = 0, py = 0, pz = 0, style = 0): this {
    this.part_ = id;
    this.pivot_ = [px, py, pz];
    this.pstyle_ = style;
    return this;
  }
  /** Sichtbarkeits-Bits (alle müssen an der Instanz gesetzt sein); 0 = immer sichtbar */
  show(mask: number): this {
    this.show_ = mask;
    return this;
  }
  /** Berufs-Maske (Bit je Beruf); 0 = für alle */
  sel(id: number): this {
    this.sel_ = id;
    return this;
  }
  /** Oberkörper-Teil: Neigung/Wippen um die Hüfthöhe y (negativ: Reittier-Schaukeln um |y|); 0 = Teil ist nicht betroffen */
  upper(y: number): this {
    this.upper_ = y;
    return this;
  }
  /** Helligkeitsverlauf (unten, oben) der folgenden Primitive */
  grad(bottom: number, top: number): this {
    this.shade_ = [bottom, top];
    return this;
  }
  /** Alle folgenden Primitive (und Drehpunkte) um dy anheben (Reiter auf dem Reittier); bleibt über `reset` erhalten */
  shift(dy: number): this {
    this.dy_ = dy;
    return this;
  }
  /** Zustand zurücksetzen (Teil, Sichtbarkeit, Auswahl, Oberkörper) */
  reset(): this {
    this.part_ = 0;
    this.pivot_ = [0, 0, 0];
    this.pstyle_ = 0;
    this.show_ = 0;
    this.sel_ = 0;
    this.upper_ = 0;
    this.shade_ = [0.8, 1.04];
    return this;
  }

  // ------------------------------------------------------------------ Ausgabe
  /** Schreibt ein Primitiv (Dreiecke als Liste von 9 Zahlen je Dreieck, schon transformiert) */
  private flush(tri: number[], col: Col, o: PrimOpts | undefined): void {
    const n = tri.length / 9;
    if (!n) return;
    if (this.drop && (this.show_ & this.drop) !== 0) return;
    const dy = this.dy_;
    if (dy) for (let i = 1; i < tri.length; i += 3) tri[i] += dy;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 1; i < tri.length; i += 3) {
      y0 = Math.min(y0, tri[i]);
      y1 = Math.max(y1, tri[i]);
    }
    const span = Math.max(1e-4, y1 - y0);
    const [sb, st] = o?.shade ?? this.shade_;
    const team = !!o?.team;
    let cls = 0;
    let k = 1;
    let rgb: THREE.Color | null = null;
    if (typeof col === 'number') rgb = colorOf(col);
    else {
      cls = col.c;
      k = col.k;
    }
    const part = this.part_;
    const ao = part ? Math.min(this.ao, 0.15) : this.ao;
    let added = 0;
    for (let t = 0; t < n; t++) {
      const b = t * 9;
      if (this.cullDown) {
        tmpA.set(tri[b], tri[b + 1], tri[b + 2]);
        tmpB.set(tri[b + 3], tri[b + 4], tri[b + 5]);
        tmpC.set(tri[b + 6], tri[b + 7], tri[b + 8]);
        tmpB.sub(tmpA);
        tmpC.sub(tmpA);
        tmpN.crossVectors(tmpB, tmpC);
        const len = tmpN.length();
        if (len < 1e-10) continue;
        if (tmpN.y / len < -0.95) continue;
      }
      for (let v = 0; v < 3; v++) {
        const x = tri[b + v * 3];
        const y = tri[b + v * 3 + 1];
        const z = tri[b + v * 3 + 2];
        this.pos.push(x, y, z);
        const sh = sb + (st - sb) * ((y - y0) / span);
        if (rgb) this.col.push(rgb.r * sh * k, rgb.g * sh * k, rgb.b * sh * k);
        else {
          const g = sh * k;
          this.col.push(g, g, g);
        }
        this.piv.push(this.pivot_[0], this.pivot_[1] + (part ? dy : 0), this.pivot_[2], part);
        const kk = ao > 0 ? 1 - Math.min(1, Math.max(0, y / this.aoH)) : 0;
        this.meta.push(team ? 1 : 0, 1 - ao * kk * kk, this.pstyle_);
        this.style.push(cls, this.show_, this.upper_, this.sel_);
      }
      added++;
    }
    this.tris += added;
  }

  /** Transformation um den Mittelpunkt c: Drehung (x, y, z) und Verschiebung */
  private xf(pts: V3[], c: V3, o?: PrimOpts): V3[] {
    const rx = o?.rotX ?? 0;
    const ry = o?.rotY ?? 0;
    const rz = o?.rotZ ?? 0;
    if (!rx && !ry && !rz) return pts.map((p) => [p[0] + c[0], p[1] + c[1], p[2] + c[2]] as V3);
    tmpE.set(rx, ry, rz, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.makeRotationFromQuaternion(tmpQ);
    return pts.map((p) => {
      tmpA.set(p[0], p[1], p[2]).applyMatrix4(tmpM);
      return [tmpA.x + c[0], tmpA.y + c[1], tmpA.z + c[2]] as V3;
    });
  }

  private emitIndexed(p: V3[], idx: number[], col: Col, o?: PrimOpts): void {
    const tri: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[idx[i + k]];
        tri.push(v[0], v[1], v[2]);
      }
    }
    // konvexe Körper: Orientierung zur Außenseite hin absichern
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const v of p) {
      cx += v[0];
      cy += v[1];
      cz += v[2];
    }
    const c: V3 = [cx / p.length, cy / p.length, cz / p.length];
    this.fix(tri, c, c);
    this.flush(tri, col, o);
  }

  // ------------------------------------------------------------------ Primitive
  /** Quader/Stumpf: Mitte (x, z), Unterkante y, Größe (w,h,d); optional verjüngt und gedreht */
  box(w: number, h: number, d: number, x: number, y: number, z: number, col: Col, o?: PrimOpts): this {
    const [tx, tz] = o?.taper === undefined ? [1, 1] : typeof o.taper === 'number' ? [o.taper, o.taper] : o.taper;
    const hw = w / 2;
    const hd = d / 2;
    const hh = h / 2;
    const pts: V3[] = [
      [-hw, -hh, -hd],
      [hw, -hh, -hd],
      [hw, -hh, hd],
      [-hw, -hh, hd],
      [-hw * tx, hh, -hd * tz],
      [hw * tx, hh, -hd * tz],
      [hw * tx, hh, hd * tz],
      [-hw * tx, hh, hd * tz],
    ];
    const p = this.xf(pts, [x, y + hh, z], o);
    // Seiten (nach außen: gegen den Uhrzeigersinn von außen gesehen)
    const idx = [
      0, 1, 5, 0, 5, 4, // hinten (-z)
      2, 3, 7, 2, 7, 6, // vorn (+z)
      3, 0, 4, 3, 4, 7, // links (-x)
      1, 2, 6, 1, 6, 5, // rechts (+x)
      4, 5, 6, 4, 6, 7, // oben
      0, 3, 2, 0, 2, 1, // unten
    ];
    this.emitIndexed(p, idx, col, o);
    return this;
  }

  /** Verjüngtes Glied (Prisma mit `seg` Seiten) von a nach b; Halbmaße r0 (bei a) und r1 (bei b), `ry` streckt die Tiefe */
  limb(a: V3, b: V3, r0: number, r1: number, col: Col, o?: PrimOpts & { seg?: number; ry?: number }): this {
    const seg = o?.seg ?? 4;
    const ry = o?.ry ?? 1;
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-6) return this;
    dir.divideScalar(len);
    const ref = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    const ring = (c: V3, r: number): V3[] => {
      const out: V3[] = [];
      for (let i = 0; i < seg; i++) {
        const t = (i / seg) * Math.PI * 2 + (seg === 4 ? Math.PI / 4 : 0);
        const cu = Math.cos(t) * r * (seg === 4 ? Math.SQRT2 : 1);
        const cv = Math.sin(t) * r * ry * (seg === 4 ? Math.SQRT2 : 1);
        out.push([c[0] + u.x * cu + v.x * cv, c[1] + u.y * cu + v.y * cv, c[2] + u.z * cu + v.z * cv]);
      }
      return out;
    };
    const ra = ring(a, r0);
    const rb = ring(b, r1);
    const tri: number[] = [];
    const push = (p: V3, q: V3, r: V3): void => {
      tri.push(...p, ...q, ...r);
    };
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      // Orientierung so wählen, dass die Normale nach außen zeigt
      if (r1 < 1e-5) push(ra[i], rb[0], ra[j]);
      else {
        push(ra[i], rb[i], rb[j]);
        push(ra[i], rb[j], ra[j]);
      }
    }
    if (o?.capB !== false && r1 >= 1e-5) for (let i = 1; i < seg - 1; i++) push(rb[0], rb[i], rb[i + 1]);
    if (o?.capA !== false) for (let i = 1; i < seg - 1; i++) push(ra[0], ra[i + 1], ra[i]);
    this.fix(tri, a, b);
    this.flush(tri, col, o);
    return this;
  }

  /** Dreiecke so ausrichten, dass die Normalen von der Achse a–b wegzeigen (sicher gegen Orientierungsfehler) */
  private fix(tri: number[], a: V3, b: V3): void {
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const cz = (a[2] + b[2]) / 2;
    for (let i = 0; i < tri.length; i += 9) {
      tmpA.set(tri[i], tri[i + 1], tri[i + 2]);
      tmpB.set(tri[i + 3], tri[i + 4], tri[i + 5]);
      tmpC.set(tri[i + 6], tri[i + 7], tri[i + 8]);
      const mx = (tmpA.x + tmpB.x + tmpC.x) / 3 - cx;
      const my = (tmpA.y + tmpB.y + tmpC.y) / 3 - cy;
      const mz = (tmpA.z + tmpB.z + tmpC.z) / 3 - cz;
      tmpB.sub(tmpA);
      tmpC.sub(tmpA);
      tmpN.crossVectors(tmpB, tmpC);
      if (tmpN.x * mx + tmpN.y * my + tmpN.z * mz < 0) {
        // Orientierung tauschen
        const x1 = tri[i + 3];
        const y1 = tri[i + 4];
        const z1 = tri[i + 5];
        tri[i + 3] = tri[i + 6];
        tri[i + 4] = tri[i + 7];
        tri[i + 5] = tri[i + 8];
        tri[i + 6] = x1;
        tri[i + 7] = y1;
        tri[i + 8] = z1;
      }
    }
  }

  /** Zylinder/Kegelstumpf, senkrecht; `seg` Seiten */
  cyl(rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, col: Col, o?: PrimOpts & { sx?: number; sz?: number }): this {
    const sx = o?.sx ?? 1;
    const sz = o?.sz ?? 1;
    const hh = h / 2;
    const pts: V3[] = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      pts.push([Math.cos(t) * rBot * sx, -hh, Math.sin(t) * rBot * sz]);
    }
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      pts.push([Math.cos(t) * rTop * sx, hh, Math.sin(t) * rTop * sz]);
    }
    const idx: number[] = [];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      // Außenfläche (Normale nach außen)
      idx.push(i, seg + j, seg + i, i, j, seg + j);
    }
    if (rTop > 1e-5 && o?.capB !== false) for (let i = 1; i < seg - 1; i++) idx.push(seg, seg + i + 1, seg + i);
    if (o?.capA !== false) for (let i = 1; i < seg - 1; i++) idx.push(0, i, i + 1);
    const p = this.xf(pts, [x, y + hh, z], o);
    this.emitIndexed(p, idx, col, o);
    return this;
  }

  cone(r: number, h: number, seg: number, x: number, y: number, z: number, col: Col, o?: PrimOpts): this {
    return this.cyl(0, r, h, seg, x, y, z, col, o);
  }

  /** Scheibe mit Achse entlang x (Räder, Schilde seitlich), Mitte (x,y,z), Dicke `thick` */
  disc(r: number, thick: number, seg: number, x: number, y: number, z: number, col: Col, o?: PrimOpts): this {
    const hh = thick / 2;
    const pts: V3[] = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      pts.push([-hh, Math.cos(t) * r, Math.sin(t) * r]);
    }
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      pts.push([hh, Math.cos(t) * r, Math.sin(t) * r]);
    }
    const idx: number[] = [];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      idx.push(i, seg + i, seg + j, i, seg + j, j);
    }
    if (o?.capB !== false) for (let i = 1; i < seg - 1; i++) idx.push(seg, seg + i, seg + i + 1);
    if (o?.capA !== false) for (let i = 1; i < seg - 1; i++) idx.push(0, i + 1, i);
    const p = this.xf(pts, [x, y, z], o);
    this.emitIndexed(p, idx, col, o);
    return this;
  }

  /** Grobe Kugel/Ellipsoid, Mitte (x,y,z), Halbachsen; `detail`: 0 Oktaeder (8), 1 Doppelpyramide mit 6 Seiten (12), 2 Ikosaeder (20), 3 UV 6x4 (36) */
  ball(rx: number, ry: number, rz: number, x: number, y: number, z: number, col: Col, detail: 0 | 1 | 2 | 3 = 2, o?: PrimOpts): this {
    let pts: V3[];
    let idx: number[];
    if (detail === 0) {
      pts = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, -1, 0]];
      idx = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1];
    } else if (detail === 1) {
      pts = [[0, 1, 0], [0, -1, 0]];
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        pts.push([Math.cos(t), 0, Math.sin(t)]);
      }
      idx = [];
      for (let i = 0; i < 6; i++) {
        const a = 2 + i;
        const b = 2 + ((i + 1) % 6);
        idx.push(0, b, a, 1, a, b);
      }
    } else if (detail === 2) {
      const t = (1 + Math.sqrt(5)) / 2;
      const n = Math.hypot(1, t);
      const raw: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
      pts = raw.map((p) => [p[0] / n, p[1] / n, p[2] / n] as V3);
      idx = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
    } else {
      pts = [[0, 1, 0], [0, -1, 0]];
      const rings = [0.5, -0.5];
      for (const yy of rings) {
        const rr = Math.sqrt(1 - yy * yy);
        for (let i = 0; i < 6; i++) {
          const t = (i / 6) * Math.PI * 2 + (yy < 0 ? Math.PI / 6 : 0);
          pts.push([Math.cos(t) * rr, yy, Math.sin(t) * rr]);
        }
      }
      idx = [];
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        idx.push(0, 2 + j, 2 + i); // oben
        idx.push(1, 8 + i, 8 + j); // unten
        idx.push(2 + i, 2 + j, 8 + i, 2 + j, 8 + j, 8 + i); // Gürtel
      }
    }
    const sc = pts.map((p) => [p[0] * rx, p[1] * ry, p[2] * rz] as V3);
    const p = this.xf(sc, [x, y, z], o);
    // Orientierung vom Mittelpunkt weg sichern
    const tri: number[] = [];
    for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) tri.push(...p[idx[i + k]]);
    this.fix(tri, [x, y, z], [x, y, z]);
    this.flush(tri, col, o);
    return this;
  }

  /** Dachförmiger Keil (Prisma): Firstrichtung z, Mitte (x,z), Unterkante y, Größe (w,h,d); `ridge` 0..1 verschiebt den First seitlich */
  wedge(w: number, h: number, d: number, x: number, y: number, z: number, col: Col, o?: PrimOpts): this {
    const hw = w / 2;
    const hd = d / 2;
    const pts: V3[] = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [0, h, -hd], [0, h, hd]];
    const p = this.xf(pts, [x, y, z], o);
    const idx = [0, 1, 4, 3, 5, 2, 0, 4, 5, 0, 5, 3, 1, 2, 5, 1, 5, 4, 0, 3, 2, 0, 2, 1];
    this.emitIndexed(p, idx, col, o);
    return this;
  }

  /** Beliebiges Dreieck (Weltkoordinaten); `two` zeichnet auch die Rückseite (Tuch) */
  tri(a: V3, b: V3, c: V3, col: Col, two = false, o?: PrimOpts): this {
    const t = [...a, ...b, ...c];
    if (two) t.push(...a, ...c, ...b);
    this.flush(t, col, o);
    return this;
  }

  /** Viereck a-b-c-d (Weltkoordinaten); `two` = beidseitig (Tuch, Fahne, Segel) */
  quad(a: V3, b: V3, c: V3, d: V3, col: Col, two = false, o?: PrimOpts): this {
    const t = [...a, ...b, ...c, ...a, ...c, ...d];
    if (two) t.push(...a, ...c, ...b, ...a, ...d, ...c);
    this.flush(t, col, o);
    return this;
  }

  /** Spitze (Pyramide) von der Basis `a` zur Spitze `b` */
  spike(a: V3, b: V3, r: number, col: Col, o?: PrimOpts & { seg?: number }): this {
    return this.limb(a, b, r, 0, col, { ...o, capB: false });
  }

  // ------------------------------------------------------------------ Ergebnis
  build(): BuildResult {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.piv, 4));
    g.setAttribute('aMeta', new THREE.Float32BufferAttribute(this.meta, 3));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.style, 4));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return { geo: g, tris: this.tris };
  }
}

/** Dreiecke einer Geometrie, die bei den Sichtbarkeits-Bits `mask` und dem Berufs-Bit `sel` (1 << Beruf, 0 = keiner) gezeichnet werden */
export function visibleTris(g: THREE.BufferGeometry, mask: number, sel = 0): number {
  const st = g.getAttribute('aStyle');
  let n = 0;
  for (let i = 0; i + 2 < st.count; i += 3) {
    const vm = st.getY(i);
    const sv = st.getW(i);
    if ((mask & vm) !== vm) continue;
    if (sv !== 0 && (sv & sel) === 0) continue;
    n++;
  }
  return n;
}
