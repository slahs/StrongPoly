import * as THREE from 'three';

/** Bausteine für prozedurale Low-Poly-Modelle. Alles wird zu einer Geometrie mit Vertexfarben gemergt. */
export interface ModelGeos {
  body: THREE.BufferGeometry;
  /** Teile in Spielerfarbe (Instanzfarbe) – kann leer sein */
  accent: THREE.BufferGeometry | null;
  /**
   * Alles in einer Geometrie. Zusätzliche Attribute: aPivot (xyz Drehpunkt, w Teil-Kennung für die
   * Vertex-Animation), aMeta (x Teamfarbe 0/1, y Ambient-Occlusion-Faktor, z reserviert).
   * Mit `extras` (Gebäude) zusätzlich: aBuild (Zeitfenster und Höhenbereich je Teil für die Bauanimation)
   * und aSurf (Oberflächenart für die prozeduralen Muster, siehe building_palette.ts).
   */
  merged: THREE.BufferGeometry;
  tris: number;
}

type V3 = [number, number, number];

export interface BuilderOpts {
  /** Stärke der eingebackenen Bodenverdunklung (0 = keine) */
  ao?: number;
  /** Höhe, bis zu der die Verdunklung reicht */
  aoH?: number;
  /** Flächen, die exakt nach unten zeigen, weglassen (Einheiten) */
  cullDown?: boolean;
  /** zusätzliche Vertexattribute aBuild/aSurf schreiben (Gebäude) */
  extras?: boolean;
  /** Farbabweichung je Teil (0..1, z. B. 0.06): Quader, Bretter und Steine sehen nie identisch aus */
  jitter?: number;
  /** Verdunklung am Fuß jedes Teils (Kontakt-AO an Anschlüssen, 0 = aus) */
  grad?: number;
}

/** Zustand, der für folgende Teile gilt (setzt der Aufrufer über ModelBuilder.surf/det/stage/grad) */
interface PartState {
  surf: number;
  det: number;
  s0: number;
  s1: number;
  grad: number;
}

/** Automatische Bauzeitfenster: Beginn 0,1 (nach Fundament), Aufbau bis 0,82, danach Gerüstabbau und Abschluss */
export const AUTO_LO = 0.1;
export const AUTO_SPAN = 0.72;

class Acc {
  pos: number[] = [];
  col: number[] = [];
  piv: number[] = [];
  meta: number[] = [];
  team: number[] = [];
  /** je Vertex: Fensterbeginn, Fensterende (-1 = automatisch), Unterkante y, Teilhöhe */
  bld: number[] = [];
  surf: number[] = [];
  det: number[] = [];
  count = 0;
  maxY = 0.001;
  constructor(readonly extras: boolean) {}
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color, team: boolean, part: number, pivot: V3, style: number, ao: number, aoH: number, cullDown: boolean, st: PartState): number {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    // erst transformieren (Höhenbereich des Teils für die Bauanimation und die Fuß-Verdunklung)
    const tv: number[] = [];
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i + 2 < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(m);
      b.fromBufferAttribute(p, i + 1).applyMatrix4(m);
      c.fromBufferAttribute(p, i + 2).applyMatrix4(m);
      tv.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      y0 = Math.min(y0, a.y, b.y, c.y);
      y1 = Math.max(y1, a.y, b.y, c.y);
    }
    const hh = Math.max(0.0001, y1 - y0);
    const gh = Math.min(0.32, hh);
    let added = 0;
    for (let t = 0; t < tv.length; t += 9) {
      a.set(tv[t], tv[t + 1], tv[t + 2]);
      b.set(tv[t + 3], tv[t + 4], tv[t + 5]);
      c.set(tv[t + 6], tv[t + 7], tv[t + 8]);
      if (cullDown) {
        e1.subVectors(b, a);
        e2.subVectors(c, a);
        e1.cross(e2).normalize();
        if (e1.y < -0.95) continue;
      }
      for (const v of [a, b, c]) {
        this.pos.push(v.x, v.y, v.z);
        this.col.push(color.r, color.g, color.b);
        this.piv.push(pivot[0], pivot[1], pivot[2], part);
        const k = ao > 0 ? 1 - Math.min(1, Math.max(0, v.y / aoH)) : 0;
        let f = 1 - ao * k * k;
        if (st.grad > 0) {
          const kk = 1 - Math.min(1, Math.max(0, (v.y - y0) / gh));
          f *= 1 - st.grad * kk * kk;
        }
        this.meta.push(team ? 1 : 0, f, style);
        this.team.push(team ? 1 : 0);
        if (this.extras) {
          this.bld.push(st.s0, st.s1, y0, hh);
          this.surf.push(st.surf);
          this.det.push(st.det);
        }
        if (v.y > this.maxY) this.maxY = v.y;
      }
      added++;
    }
    if (g !== geo) g.dispose();
    this.count += added;
    return added;
  }
  geometry(filter?: 0 | 1, maxDet = 99): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.team.length;
    const sel: boolean[] = new Array(n);
    let all = true;
    for (let i = 0; i < n; i++) {
      sel[i] = (filter === undefined || this.team[i] === filter) && (!this.extras || this.det[i] <= maxDet);
      if (!sel[i]) all = false;
    }
    const pick = (arr: number[], k: number): number[] => {
      if (all) return arr;
      const out: number[] = [];
      for (let i = 0; i < n; i++) if (sel[i]) for (let j = 0; j < k; j++) out.push(arr[i * k + j]);
      return out;
    };
    g.setAttribute('position', new THREE.Float32BufferAttribute(pick(this.pos, 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(pick(this.col, 3), 3));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(pick(this.piv, 4), 4));
    g.setAttribute('aMeta', new THREE.Float32BufferAttribute(pick(this.meta, 3), 3));
    if (this.extras) {
      // automatische Zeitfenster: tiefer liegende Teile zuerst, Dächer und Aufbauten zuletzt
      const H = this.maxY;
      const bld = this.bld.slice();
      for (let i = 0; i < n; i++) {
        if (bld[i * 4] < 0) {
          const y0 = bld[i * 4 + 2];
          const hh = bld[i * 4 + 3];
          // Zeitfenster folgt der Höhe: ein Teil beginnt, wenn das darunterliegende fertig ist (kein schwebendes Dach)
          const s0 = AUTO_LO + AUTO_SPAN * Math.min(1, Math.max(0, y0) / H);
          const s1 = AUTO_LO + AUTO_SPAN * Math.min(1, Math.max(0, y0 + hh) / H);
          bld[i * 4] = s0;
          bld[i * 4 + 1] = Math.max(s0 + 0.04, s1);
        }
      }
      g.setAttribute('aBuild', new THREE.Float32BufferAttribute(pick(bld, 4), 4));
      g.setAttribute('aSurf', new THREE.Float32BufferAttribute(pick(this.surf, 1), 1));
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map<string, THREE.BufferGeometry>();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const ico = new THREE.IcosahedronGeometry(1, 0);

function gableGeo(): THREE.BufferGeometry {
  // Dreiecksprisma: Grundfläche 1x1, Höhe 1, Giebel entlang z
  const g = new THREE.BufferGeometry();
  const a: V3 = [-0.5, 0, -0.5];
  const b: V3 = [0.5, 0, -0.5];
  const c: V3 = [0.5, 0, 0.5];
  const d: V3 = [-0.5, 0, 0.5];
  const e: V3 = [0, 1, -0.5];
  const f: V3 = [0, 1, 0.5];
  const tris: V3[] = [
    a, e, b, // hinten
    d, c, f, // vorn
    a, d, f, a, f, e, // links
    b, e, f, b, f, c, // rechts
    a, b, c, a, c, d, // Boden
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return g;
}
const gable = gableGeo();

function hash3(x: number, y: number, z: number, s: number): number {
  let h = Math.imul((x * 1000) | 0, 374761393) ^ Math.imul((y * 1000) | 0, 668265263) ^ Math.imul((z * 1000) | 0, 2147483647) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bauhilfe. Koordinaten: Einheit = 1 Tile; y nach oben; Ursprung am Boden in der Mitte. */
export class ModelBuilder {
  private acc: Acc;
  private tris = 0;
  private part_ = 0;
  private pivot_: V3 = [0, 0, 0];
  private style_ = 0;
  private ao: number;
  private aoH: number;
  private cullDown: boolean;
  private jitter: number;
  private st: PartState;
  private seq = 0;

  constructor(o: BuilderOpts = {}) {
    this.ao = o.ao ?? 0.32;
    this.aoH = o.aoH ?? 0.55;
    this.cullDown = !!o.cullDown;
    this.jitter = o.jitter ?? 0;
    this.acc = new Acc(!!o.extras);
    this.st = { surf: 0, det: 0, s0: -1, s1: -1, grad: o.grad ?? 0 };
  }

  /** Alle folgenden Teile gehören zu Animationsteil `id` mit Drehpunkt (px,py,pz); `part(0)` beendet das. */
  part(id: number, px = 0, py = 0, pz = 0, style = 0): this {
    this.part_ = id;
    this.pivot_ = [px, py, pz];
    this.style_ = style;
    return this;
  }

  /** Oberflächenart der folgenden Teile (SURF in building_palette.ts); 0 = glatt */
  surf(kind: number): this {
    this.st.surf = kind;
    return this;
  }

  /** Detailstufe der folgenden Teile: 0 = Grundform, 1 = Mittelform (Fenster, Balken), 2 = Feindetail */
  det(level: 0 | 1 | 2): this {
    this.st.det = level;
    return this;
  }

  /** Eigenes Zeitfenster (Fortschritt 0..1) für die Bauanimation; ohne Argumente wieder automatisch (nach Höhe) */
  stage(s0?: number, s1?: number): this {
    this.st.s0 = s0 ?? -1;
    this.st.s1 = s1 ?? -1;
    return this;
  }

  /** Fuß-Verdunklung der folgenden Teile (0 = aus) */
  grad(v: number): this {
    this.st.grad = v;
    return this;
  }

  private put(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: number, team: boolean, ao = this.ao): this {
    const c = new THREE.Color(color);
    if (this.jitter > 0 && !team) {
      const e = m.elements;
      const j = 1 + (hash3(e[12], e[13], e[14], this.seq++) - 0.5) * 2 * this.jitter;
      c.multiplyScalar(j);
    }
    this.tris += this.acc.add(geo, m, c, team, this.part_, this.pivot_, this.style_, this.part_ ? Math.min(ao, 0.15) : ao, this.aoH, this.cullDown, this.st);
    return this;
  }

  /** Quader, Mittelpunkt (x, y-Basis, z), Größe (w,h,d) */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, team = false, rotY = 0): this {
    tmpE.set(0, rotY, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(x, y + h / 2, z), tmpQ, tmpS.set(w, h, d));
    return this.put(boxGeo, tmpM, color, team);
  }

  /** Balken zwischen zwei Punkten mit quadratischem Querschnitt (Streben, Sparren, Stangen, Seile) */
  beam(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, t: number, color: number, team = false): this {
    tmpV.set(x1, y1, z1);
    tmpV2.set(x2, y2, z2);
    const len = tmpV.distanceTo(tmpV2);
    if (len < 1e-5) return this;
    const dir = tmpV2.clone().sub(tmpV).normalize();
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const mid = tmpV.clone().add(tmpV2).multiplyScalar(0.5);
    tmpM.compose(mid, tmpQ, tmpS.set(t, t, len));
    return this.put(boxGeo, tmpM, color, team);
  }

  /** Zylinder / Kegelstumpf mit wenigen Segmenten */
  cyl(rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, color: number, team = false): this {
    const key = `${rTop}|${rBot}|${seg}`;
    let g = cylCache.get(key);
    if (!g) {
      g = new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1);
      cylCache.set(key, g);
    }
    tmpM.compose(tmpV.set(x, y + h / 2, z), tmpQ.identity(), tmpS.set(1, h, 1));
    return this.put(g, tmpM, color, team);
  }

  cone(r: number, h: number, seg: number, x: number, y: number, z: number, color: number, team = false): this {
    return this.cyl(0, r, h, seg, x, y, z, color, team);
  }

  /** Scheibe/Rad mit Achse entlang x (Mittelpunkt x, y, z), Dicke entlang x */
  disc(r: number, thick: number, seg: number, x: number, y: number, z: number, color: number, team = false): this {
    const key = `disc|${r}|${seg}`;
    let g = cylCache.get(key);
    if (!g) {
      g = new THREE.CylinderGeometry(r, r, 1, seg, 1);
      g.rotateZ(Math.PI / 2);
      cylCache.set(key, g);
    }
    tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(thick, 1, 1));
    return this.put(g, tmpM, color, team);
  }

  /** Scheibe mit Achse entlang z (Fassdeckel, Zifferblatt, Rundfenster) */
  discZ(r: number, thick: number, seg: number, x: number, y: number, z: number, color: number, team = false): this {
    const key = `discz|${r}|${seg}`;
    let g = cylCache.get(key);
    if (!g) {
      g = new THREE.CylinderGeometry(r, r, 1, seg, 1);
      g.rotateX(Math.PI / 2);
      cylCache.set(key, g);
    }
    tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(1, 1, thick));
    return this.put(g, tmpM, color, team);
  }

  /** Giebeldach (Prisma). w entlang x, d entlang z, Firstrichtung z. */
  roof(w: number, h: number, d: number, x: number, y: number, z: number, color: number, team = false, rotY = 0): this {
    tmpE.set(0, rotY, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(w, h, d));
    return this.put(gable, tmpM, color, team);
  }

  /** Pyramide (Kegel mit 4 Seiten) */
  pyramid(r: number, h: number, x: number, y: number, z: number, color: number, team = false): this {
    const key = `pyr|${r}`;
    let g = cylCache.get(key);
    if (!g) {
      g = new THREE.ConeGeometry(r, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      cylCache.set(key, g);
    }
    tmpM.compose(tmpV.set(x, y + h / 2, z), tmpQ.identity(), tmpS.set(1, h, 1));
    return this.put(g, tmpM, color, team);
  }

  /** Spitze (vierseitig) entlang +z: Basis bei (x, y, z), Länge len */
  spike(r: number, len: number, x: number, y: number, z: number, color: number, team = false): this {
    const key = `spk|${r}`;
    let g = cylCache.get(key);
    if (!g) {
      g = new THREE.ConeGeometry(r, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, 0.5);
      cylCache.set(key, g);
    }
    tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(1, 1, len));
    return this.put(g, tmpM, color, team);
  }

  /** Kleine Kugel (Ikosaeder), Mittelpunkt (x, y, z) */
  sphere(r: number, x: number, y: number, z: number, color: number, team = false): this {
    tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(r, r, r));
    return this.put(ico, tmpM, color, team);
  }

  /** Kantiger Felsbrocken (verformtes Ikosaeder), Mittelpunkt (x, y, z), Halbachsen (rx, ry, rz) */
  boulder(rx: number, ry: number, rz: number, x: number, y: number, z: number, seed: number, color: number, team = false): this {
    const g = ico.clone();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const j = 0.72 + hash3(vx, vy, vz, seed) * 0.5;
      p.setXYZ(i, vx * j, Math.max(vy * j, -0.55), vz * j);
    }
    tmpE.set(0, hash3(seed, 1, 2, 3) * 6.28, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(rx, ry, rz));
    this.put(g, tmpM, color, team);
    g.dispose();
    return this;
  }

  /**
   * Gerades Prisma aus einem konvexen Polygon in der xy-Ebene, in z-Richtung `depth` dick (zentriert).
   * Ursprung der Punkte bei (x, y, z); `rotY` dreht um die Hochachse (z. B. Bögen, Giebelflächen, Pultdächer).
   */
  poly(pts: [number, number][], depth: number, x: number, y: number, z: number, color: number, team = false, rotY = 0): this {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      area += ax * by - bx * ay;
    }
    const p = area < 0 ? [...pts].reverse() : pts;
    const hd = depth / 2;
    const tri: number[] = [];
    const push = (a: V3, b: V3, c: V3): void => {
      tri.push(...a, ...b, ...c);
    };
    for (let i = 1; i + 1 < p.length; i++) {
      push([p[0][0], p[0][1], hd], [p[i][0], p[i][1], hd], [p[i + 1][0], p[i + 1][1], hd]);
      push([p[0][0], p[0][1], -hd], [p[i + 1][0], p[i + 1][1], -hd], [p[i][0], p[i][1], -hd]);
    }
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[(i + 1) % p.length];
      push([ax, ay, -hd], [bx, by, -hd], [bx, by, hd]);
      push([ax, ay, -hd], [bx, by, hd], [ax, ay, hd]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    tmpE.set(0, rotY, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(1, 1, 1));
    this.put(g, tmpM, color, team);
    g.dispose();
    return this;
  }

  /** Halbkreis-/Bogenfläche: Bogenfenster- und Türoberteil (Radius r, Mitte bei (x, y)), Dicke `depth` entlang z */
  arch(r: number, depth: number, x: number, y: number, z: number, color: number, team = false, rotY = 0, seg = 6): this {
    const pts: [number, number][] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return this.poly(pts, depth, x, y, z, color, team, rotY);
  }

  /**
   * Walmdach: Grundfläche w x d (x/z), Höhe h, Firstlänge `ridge` (0 = Pyramide), First entlang der längeren Achse.
   * Dachrand liegt bei y; rotY dreht um die Hochachse.
   */
  hip(w: number, h: number, d: number, x: number, y: number, z: number, color: number, team = false, rotY = 0, ridge = -1): this {
    const alongZ = d >= w;
    const L = alongZ ? d : w;
    const S = alongZ ? w : d;
    const r = ridge < 0 ? Math.max(0, L - S) : Math.min(ridge, L);
    const hl = L / 2;
    const hs = S / 2;
    const hr = r / 2;
    // lokal: First entlang z, Breite entlang x
    const A: V3 = [-hs, 0, -hl];
    const B: V3 = [hs, 0, -hl];
    const C: V3 = [hs, 0, hl];
    const D: V3 = [-hs, 0, hl];
    const E: V3 = [0, h, -hr];
    const F: V3 = [0, h, hr];
    const tris: V3[] = [];
    // Unterseite und vier Flächen
    tris.push(A, B, C, A, C, D);
    tris.push(A, E, B); // hinten (Walm)
    tris.push(D, C, F); // vorn (Walm)
    tris.push(A, D, F, A, F, E); // links
    tris.push(B, E, F, B, F, C); // rechts
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    tmpE.set(0, rotY + (alongZ ? 0 : Math.PI / 2), 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(1, 1, 1));
    this.put(g, tmpM, color, team);
    g.dispose();
    return this;
  }

  /** Pultdach: hoch bei -z (hinten), niedrig bei +z; Grundfläche w x d, Höhe h an der hohen Kante */
  shed(w: number, h: number, d: number, x: number, y: number, z: number, color: number, team = false, rotY = 0, low = 0.12): this {
    const pts: [number, number][] = [
      [-d / 2, 0],
      [d / 2, 0],
      [d / 2, low],
      [-d / 2, h],
    ];
    // Polygon liegt in der (z,y)-Ebene: poly erwartet (x,y) → um 90° drehen, dann +z zeigt nach vorn
    return this.poly(pts.map(([a, b]) => [-a, b] as [number, number]), w, x, y, z, color, team, rotY + Math.PI / 2);
  }

  /** Kegelstumpf mit rechteckigem Querschnitt (Sockel mit Anlauf, Schlote, Heuhaufen): unten wb x db, oben wt x dt */
  frustum(wb: number, db: number, wt: number, dt: number, h: number, x: number, y: number, z: number, color: number, team = false, rotY = 0): this {
    const b = [[-wb / 2, 0, -db / 2], [wb / 2, 0, -db / 2], [wb / 2, 0, db / 2], [-wb / 2, 0, db / 2]] as V3[];
    const t = [[-wt / 2, h, -dt / 2], [wt / 2, h, -dt / 2], [wt / 2, h, dt / 2], [-wt / 2, h, dt / 2]] as V3[];
    const tris: V3[] = [];
    tris.push(t[0], t[3], t[2], t[0], t[2], t[1]); // oben
    tris.push(b[0], b[1], b[2], b[0], b[2], b[3]); // unten
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      tris.push(b[i], t[i], t[j], b[i], t[j], b[j]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    tmpE.set(0, rotY, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(1, 1, 1));
    this.put(g, tmpM, color, team);
    g.dispose();
    return this;
  }

  /** Ergebnis. `maxDetail` filtert Teile nach Detailstufe (det): 0 = nur Grundform, 2 = alles. */
  build(maxDetail = 99): ModelGeos {
    const body = this.acc.geometry(0, maxDetail);
    const accent = this.acc.team.includes(1) ? this.acc.geometry(1, maxDetail) : null;
    const merged = this.acc.geometry(undefined, maxDetail);
    const tris = maxDetail >= 99 ? this.tris : merged.getAttribute('position').count / 3;
    return { body, accent, merged, tris };
  }
}
