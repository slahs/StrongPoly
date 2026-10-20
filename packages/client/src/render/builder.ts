import * as THREE from 'three';

/** Bausteine für prozedurale Low-Poly-Modelle. Alles wird zu einer Geometrie mit Vertexfarben gemergt. */
export interface ModelGeos {
  body: THREE.BufferGeometry;
  /** Teile in Spielerfarbe (Instanzfarbe) – kann leer sein */
  accent: THREE.BufferGeometry | null;
  /**
   * Alles in einer Geometrie. Zusätzliche Attribute: aPivot (xyz Drehpunkt, w Teil-Kennung für die
   * Vertex-Animation), aMeta (x Teamfarbe 0/1, y Ambient-Occlusion-Faktor, z reserviert).
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
}

class Acc {
  pos: number[] = [];
  col: number[] = [];
  piv: number[] = [];
  meta: number[] = [];
  team: number[] = [];
  count = 0;
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color, team: boolean, part: number, pivot: V3, style: number, ao: number, aoH: number, cullDown: boolean): number {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    let added = 0;
    for (let i = 0; i + 2 < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(m);
      b.fromBufferAttribute(p, i + 1).applyMatrix4(m);
      c.fromBufferAttribute(p, i + 2).applyMatrix4(m);
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
        const f = 1 - ao * k * k;
        this.meta.push(team ? 1 : 0, f, style);
        this.team.push(team ? 1 : 0);
      }
      added++;
    }
    if (g !== geo) g.dispose();
    this.count += added;
    return added;
  }
  geometry(filter?: 0 | 1): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const sel = filter === undefined ? null : this.team.map((t) => (t === filter ? 1 : 0));
    const pick = (arr: number[], n: number): number[] => {
      if (!sel) return arr;
      const out: number[] = [];
      for (let i = 0; i < sel.length; i++) if (sel[i]) for (let k = 0; k < n; k++) out.push(arr[i * n + k]);
      return out;
    };
    g.setAttribute('position', new THREE.Float32BufferAttribute(pick(this.pos, 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(pick(this.col, 3), 3));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(pick(this.piv, 4), 4));
    g.setAttribute('aMeta', new THREE.Float32BufferAttribute(pick(this.meta, 3), 3));
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
  private acc = new Acc();
  private tris = 0;
  private part_ = 0;
  private pivot_: V3 = [0, 0, 0];
  private style_ = 0;
  private ao: number;
  private aoH: number;
  private cullDown: boolean;

  constructor(o: BuilderOpts = {}) {
    this.ao = o.ao ?? 0.32;
    this.aoH = o.aoH ?? 0.55;
    this.cullDown = !!o.cullDown;
  }

  /** Alle folgenden Teile gehören zu Animationsteil `id` mit Drehpunkt (px,py,pz); `part(0)` beendet das. */
  part(id: number, px = 0, py = 0, pz = 0, style = 0): this {
    this.part_ = id;
    this.pivot_ = [px, py, pz];
    this.style_ = style;
    return this;
  }

  private put(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: number, team: boolean, ao = this.ao): this {
    this.tris += this.acc.add(geo, m, new THREE.Color(color), team, this.part_, this.pivot_, this.style_, this.part_ ? Math.min(ao, 0.15) : ao, this.aoH, this.cullDown);
    return this;
  }

  /** Quader, Mittelpunkt (x, y-Basis, z), Größe (w,h,d) */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, team = false, rotY = 0): this {
    tmpE.set(0, rotY, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(x, y + h / 2, z), tmpQ, new THREE.Vector3(w, h, d));
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
    tmpM.compose(new THREE.Vector3(x, y + h / 2, z), tmpQ.identity(), new THREE.Vector3(1, h, 1));
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
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.identity(), new THREE.Vector3(thick, 1, 1));
    return this.put(g, tmpM, color, team);
  }

  /** Giebeldach (Prisma). w entlang x, d entlang z, Firstrichtung z. */
  roof(w: number, h: number, d: number, x: number, y: number, z: number, color: number, team = false, rotY = 0): this {
    tmpE.set(0, rotY, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(w, h, d));
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
    tmpM.compose(new THREE.Vector3(x, y + h / 2, z), tmpQ.identity(), new THREE.Vector3(1, h, 1));
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
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.identity(), new THREE.Vector3(1, 1, len));
    return this.put(g, tmpM, color, team);
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
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(rx, ry, rz));
    this.put(g, tmpM, color, team);
    g.dispose();
    return this;
  }

  build(): ModelGeos {
    const body = this.acc.geometry(0);
    const accent = this.acc.team.includes(1) ? this.acc.geometry(1) : null;
    const merged = this.acc.geometry();
    return { body, accent, merged, tris: this.tris };
  }
}
