import * as THREE from 'three';

/** Bausteine für prozedurale Low-Poly-Modelle. Alles wird zu einer Geometrie mit Vertexfarben gemergt. */
export interface ModelGeos {
  body: THREE.BufferGeometry;
  /** Teile in Spielerfarbe (Instanzfarbe) – kann leer sein */
  accent: THREE.BufferGeometry | null;
  tris: number;
}

type V3 = [number, number, number];

class Acc {
  pos: number[] = [];
  col: number[] = [];
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      this.col.push(color.r, color.g, color.b);
    }
    if (g !== geo) g.dispose();
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
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

/** Bauhilfe. Koordinaten: Einheit = 1 Tile; y nach oben; Ursprung am Boden in der Mitte. */
export class ModelBuilder {
  private body = new Acc();
  private acc = new Acc();
  private tris = 0;

  private put(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: number, team: boolean): this {
    (team ? this.acc : this.body).add(geo, m, new THREE.Color(color));
    this.tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
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

  build(): ModelGeos {
    const body = this.body.geometry();
    const accent = this.acc.pos.length ? this.acc.geometry() : null;
    return { body, accent, tris: this.tris };
  }
}
