import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, PAL, T, hash2 } from '@strongpoly/shared';
import { Biome, Species, biomeOf, forestDensity, pickSpecies, treeLook } from './biome';
import { GroundBuilding, GroundMap, groundTrace } from './groundmap';
import { foliageDepthMaterial, foliageMaterial, grassMaterial } from './materials';
import type { QualityCfg } from './quality';
import { qualityOf } from './quality';

// ---------------------------------------------------------------------------------------------------------------
// Geometrie-Baukasten für Vegetation und Felsen: beliebig gedrehte Primitive, Facettenvariation, Licht/Schatten in den
// Vertexfarben (Oberseiten heller, Unterseiten dunkler, Boden dunkler), Moos auf Felsen. Alles prozedural.
// ---------------------------------------------------------------------------------------------------------------

type C3 = [number, number, number];
const lin = (hex: number): C3 => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const mixC = (a: C3, b: C3, k: number): C3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const scaleC = (a: C3, k: number): C3 => [a[0] * k, a[1] * k, a[2] * k];

interface FinishOpts {
  /** Höhe, bis zu der der Boden verdunkelt wird */
  aoH: number;
  aoK: number;
  /** Oberseiten heller / Unterseiten dunkler (0 = aus) */
  topLight: number;
  /** Moosanteil auf nach oben zeigenden Flächen (0 = aus) und Mooston */
  moss?: number;
  mossCol?: C3;
  /** Facettenvariation der Helligkeit (±) */
  facet: number;
}

const ico0 = new THREE.IcosahedronGeometry(1, 0);
const ico1 = new THREE.IcosahedronGeometry(1, 1);
const coneCache = new Map<string, THREE.BufferGeometry>();

class DB {
  pos: number[] = [];
  col: number[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();

  /** beliebiges Primitiv mit Matrix und Farbe (Facetten werden in finish() variiert) */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, c: C3): this {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      this.col.push(c[0], c[1], c[2]);
    }
    if (ng !== g) ng.dispose();
    return this;
  }

  private compose(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
    this.tmpE.set(rx, ry, rz, 'YXZ');
    this.tmpQ.setFromEuler(this.tmpE);
    return this.tmpM.compose(new THREE.Vector3(x, y, z), this.tmpQ, new THREE.Vector3(sx, sy, sz));
  }

  /** Brocken: verformtes Ikosaeder (detail 0 = 20 Flächen, 1 = 80), Halbachsen rx/ry/rz, unten abgeflacht */
  blob(rx: number, ry: number, rz: number, x: number, y: number, z: number, seed: number, c: C3, detail = 0, rough = 0.5, flatBase = true): this {
    const g = (detail ? ico1 : ico0).clone();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const j = 1 - rough * 0.5 + hash2(seed, Math.round(vx * 997), Math.round(vy * 991 + vz * 983)) * rough;
      p.setXYZ(i, vx * j, flatBase ? Math.max(vy * j, -0.5) : vy * j, vz * j);
    }
    this.add(g, this.compose(x, y, z, 0, hash2(seed, 1, 2) * 6.28, 0, rx, ry, rz), c);
    g.dispose();
    return this;
  }

  /** Kegelstumpf mit Neigung; Basis bei (x,y,z), nach oben (+Neigung) */
  cyl(rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, c: C3, tiltX = 0, tiltZ = 0, yaw = 0): this {
    const key = `${rTop}|${rBot}|${seg}|${h >= 0.2 ? 1 : 0}`;
    let g = coneCache.get(key);
    if (!g) {
      // Böden und Deckel hoher Körper sind nie sichtbar: offene Zylinder sparen Dreiecke; flache Scheiben behalten ihre Fläche
      g = new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, h >= 0.2);
      g.translate(0, 0.5, 0);
      coneCache.set(key, g);
    }
    this.add(g, this.compose(x, y, z, tiltX, yaw, tiltZ, 1, h, 1), c);
    return this;
  }

  cone(r: number, h: number, seg: number, x: number, y: number, z: number, c: C3, tiltX = 0, tiltZ = 0, yaw = 0): this {
    return this.cyl(0, r, h, seg, x, y, z, c, tiltX, tiltZ, yaw);
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, c: C3, yaw = 0, tiltX = 0, tiltZ = 0): this {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    this.add(g, this.compose(x, y, z, tiltX, yaw, tiltZ, w, h, d), c);
    g.dispose();
    return this;
  }

  /** Wedel (Blattfläche) von (x,y,z) in Richtung yaw, mit Aufwärtswinkel up (rad, negativ = hängt) und Länge len; beidseitig (Vor- und Rückseite) */
  frond(len: number, wid: number, x: number, y: number, z: number, yaw: number, up: number, c: C3): this {
    const g = new THREE.BufferGeometry();
    const hw = wid / 2;
    const mw = hw * 0.85;
    // Blatt in +z: Basis, Mitte (Falz leicht erhöht), Spitze; jede Fläche in beiden Windungen
    const front = [
      -hw, 0, 0, hw, 0, 0, mw, 0.02, len * 0.5,
      -hw, 0, 0, mw, 0.02, len * 0.5, -mw, 0.02, len * 0.5,
      -mw, 0.02, len * 0.5, mw, 0.02, len * 0.5, 0, -0.01, len,
    ];
    const v: number[] = [...front];
    for (let t = 0; t < 3; t++) {
      const o = t * 9;
      v.push(front[o], front[o + 1], front[o + 2], front[o + 6], front[o + 7], front[o + 8], front[o + 3], front[o + 4], front[o + 5]);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    this.add(g, this.compose(x, y, z, -up, yaw, 0, 1, 1, 1), c);
    g.dispose();
    return this;
  }

  /** fertige Geometrie: Facettenvariation, Licht in den Farben, Bodenverdunklung, optional Moos */
  finish(o: FinishOpts, seed: number): THREE.BufferGeometry {
    const n = this.pos.length / 9;
    const col: number[] = [];
    const meta: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (let f = 0; f < n; f++) {
      const o9 = f * 9;
      a.set(this.pos[o9], this.pos[o9 + 1], this.pos[o9 + 2]);
      b.set(this.pos[o9 + 3], this.pos[o9 + 4], this.pos[o9 + 5]);
      c.set(this.pos[o9 + 6], this.pos[o9 + 7], this.pos[o9 + 8]);
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      const nrm = e1.cross(e2).normalize();
      const cy = (a.y + b.y + c.y) / 3;
      const hf = hash2(seed, Math.round((a.x + b.x + c.x) * 400), Math.round((a.y + b.y + c.y) * 300 + (a.z + b.z + c.z) * 500));
      let k = 1 + (hf - 0.5) * 2 * o.facet;
      if (o.topLight) k *= 1 + nrm.y * o.topLight;
      for (let v = 0; v < 3; v++) {
        const r = this.col[o9 + v * 3] * k;
        const g = this.col[o9 + v * 3 + 1] * k;
        const bl = this.col[o9 + v * 3 + 2] * k;
        let cc: C3 = [r, g, bl];
        if (o.moss && nrm.y > 0.5) {
          const mk = Math.min(1, (nrm.y - 0.5) * 2.2) * o.moss * (0.55 + hf * 0.8);
          cc = mixC(cc, o.mossCol ?? [0.1, 0.22, 0.06], Math.min(0.85, mk));
        }
        col.push(cc[0], cc[1], cc[2]);
        const vy = this.pos[o9 + v * 3 + 1];
        const t = Math.min(1, Math.max(0, vy / o.aoH));
        meta.push(0, 1 - o.aoK * (1 - t) * (1 - t), 0);
      }
      void cy;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aMeta', new THREE.Float32BufferAttribute(meta, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Modelle
// ---------------------------------------------------------------------------------------------------------------

const K = {
  trunk: lin(PAL.trunk),
  trunkDark: lin(0x4f3822),
  birchBark: lin(0xe4dfd2),
  spruceDark: lin(0x24552d),
  spruceMid: lin(0x2e6a35),
  spruceLight: lin(0x3f8140),
  oakDark: lin(0x2f6a2a),
  oakMid: lin(0x3f8132),
  oakLight: lin(0x5a9a3c),
  birchLeaf: lin(0x6c9c3a),
  birchLeafL: lin(0x88b048),
  acacia: lin(0x6c7f38),
  acaciaL: lin(0x84963f),
  cypress: lin(0x2a5a34),
  cypressL: lin(0x377042),
  palmLeaf: lin(0x2f6a28),
  palmLeafL: lin(0x437f30),
  white: lin(PAL.white),
  black: lin(PAL.black),
  rock: lin(PAL.rock),
  rockDark: lin(PAL.rockDark),
  stone: lin(PAL.stone),
  stoneDark: lin(PAL.stoneDark),
  roof: lin(PAL.roof),
  gold: lin(PAL.gold),
  pitch: lin(PAL.pitch),
  moss: lin(0x4a6e2a),
  bushDark: lin(0x346c2e),
  bushLight: lin(0x4f8a38),
  bushDry: lin(0x8c8348),
  bushDryL: lin(0xa39a58),
  grassBase: lin(0x56783a),
  grassTip: lin(0x8fb04a),
  dryBase: lin(0x8f8445),
  dryTip: lin(0xc7b66a),
  pebble: lin(0xa39d92),
  pebbleD: lin(0x7c776e),
};

const TREE_OPTS: FinishOpts = { aoH: 0.55, aoK: 0.45, topLight: 0.16, facet: 0.07 };
const ROCK_OPTS: FinishOpts = { aoH: 0.5, aoK: 0.3, topLight: 0.12, facet: 0.09, moss: 0.3 };

function spruceModel(v: number): THREE.BufferGeometry {
  const b = new DB();
  b.cyl(0.055, 0.085, 0.38, 5, 0, 0, 0, K.trunk);
  const tiers = v ? 6 : 5;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const r = (v ? 0.5 : 0.46) * (1 - t * 0.82);
    const h = 0.36 - t * 0.12;
    const y = 0.18 + k * (v ? 0.17 : 0.2);
    const c = mixC(K.spruceDark, K.spruceLight, (k % 2 ? 0.55 : 0.2) + t * 0.35);
    b.cone(r, h, 6, (hash2(v + 3, k, 1) - 0.5) * 0.04, y, (hash2(v + 3, k, 2) - 0.5) * 0.04, c, (hash2(v + 5, k, 3) - 0.5) * 0.06, (hash2(v + 5, k, 4) - 0.5) * 0.06, hash2(v, k, 7) * 6);
  }
  b.cone(0.05, 0.16, 4, 0, 0.18 + (tiers - 1) * (v ? 0.17 : 0.2) + 0.16, 0, K.spruceLight);
  return b.finish(TREE_OPTS, 21 + v);
}

function oakModel(): THREE.BufferGeometry {
  const b = new DB();
  b.cyl(0.06, 0.11, 0.5, 5, 0, 0, 0, K.trunk);
  // Astgabel
  b.cyl(0.035, 0.06, 0.3, 4, 0.02, 0.36, 0, K.trunk, 0, -0.55);
  b.cyl(0.035, 0.055, 0.28, 4, -0.01, 0.38, 0.01, K.trunkDark, 0.5, 0.35);
  b.blob(0.42, 0.32, 0.42, 0, 0.62, 0, 3, K.oakDark, 0, 0.55);
  b.blob(0.33, 0.27, 0.33, 0.26, 0.72, 0.1, 7, K.oakMid, 0, 0.55);
  b.blob(0.32, 0.26, 0.32, -0.25, 0.7, -0.12, 11, K.oakMid, 0, 0.55);
  b.blob(0.28, 0.22, 0.28, 0.02, 0.92, 0.02, 15, K.oakLight, 0, 0.5);
  return b.finish(TREE_OPTS, 31);
}

function birchModel(): THREE.BufferGeometry {
  const b = new DB();
  // Stamm in drei Abschnitten (hell, dunkles Band, hell): Rindenzeichnung ohne Zusatzkörper
  b.cyl(0.045, 0.06, 0.26, 5, 0, 0, 0, K.birchBark, 0.03, 0.02);
  b.cyl(0.043, 0.047, 0.07, 5, 0.007, 0.25, 0, K.black, 0.04, 0.025);
  b.cyl(0.04, 0.045, 0.4, 5, 0.012, 0.31, 0, K.birchBark, 0.05, 0.03);
  b.blob(0.28, 0.36, 0.28, 0.01, 0.78, 0, 5, K.birchLeaf, 0, 0.5);
  b.blob(0.24, 0.3, 0.24, 0.16, 0.64, 0.08, 9, K.birchLeafL, 0, 0.5);
  b.blob(0.23, 0.28, 0.23, -0.15, 0.68, -0.1, 13, K.birchLeaf, 0, 0.5);
  return b.finish(TREE_OPTS, 41);
}

function acaciaModel(): THREE.BufferGeometry {
  const b = new DB();
  b.cyl(0.05, 0.095, 0.46, 5, 0, 0, 0, K.trunkDark, 0, 0.12);
  b.cyl(0.035, 0.055, 0.3, 5, 0.04, 0.4, 0, K.trunkDark, 0, -0.65);
  b.cyl(0.035, 0.05, 0.26, 5, 0.03, 0.4, 0, K.trunkDark, 0.6, 0.25);
  b.blob(0.56, 0.12, 0.54, 0.04, 0.62, 0, 3, K.acacia, 0, 0.35);
  b.blob(0.38, 0.1, 0.36, -0.08, 0.74, 0.05, 7, K.acaciaL, 0, 0.35);
  b.blob(0.27, 0.09, 0.24, 0.24, 0.55, -0.12, 11, K.acacia, 0, 0.3);
  return b.finish(TREE_OPTS, 51);
}

function cypressModel(): THREE.BufferGeometry {
  const b = new DB();
  b.cyl(0.04, 0.06, 0.25, 4, 0, 0, 0, K.trunkDark);
  b.cone(0.2, 0.75, 6, 0, 0.18, 0, K.cypress);
  b.cone(0.15, 0.7, 6, 0.01, 0.6, 0, K.cypressL);
  b.cone(0.09, 0.4, 4, 0, 1.05, 0, K.cypress);
  return b.finish(TREE_OPTS, 61);
}

function palmModel(): THREE.BufferGeometry {
  const b = new DB();
  // geschwungener Stamm aus drei Segmenten
  let x = 0;
  let y = 0;
  for (let k = 0; k < 3; k++) {
    const lean = 0.12 + k * 0.05;
    b.cyl(0.05 - k * 0.006, 0.07 - k * 0.006, 0.22, 5, x, y, 0, k % 2 ? K.trunk : K.trunkDark, 0, -lean);
    x += Math.sin(lean) * 0.22;
    y += Math.cos(lean) * 0.22;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    b.frond(0.62, 0.3, x, y + 0.02, 0, a, i % 2 ? -0.5 : 0.2, i % 2 ? K.palmLeaf : K.palmLeafL);
  }
  b.cone(0.12, 0.14, 5, x, y, 0, K.palmLeaf);
  b.blob(0.06, 0.06, 0.06, x + 0.06, y - 0.03, 0.05, 3, K.trunkDark, 0, 0.2);
  b.blob(0.06, 0.06, 0.06, x - 0.05, y - 0.03, -0.04, 5, K.trunkDark, 0, 0.2);
  return b.finish(TREE_OPTS, 71);
}

/** Fernform: ein Kegel bzw. ein Kugelhaufen, weiß (Farbe kommt aus der Instanzfarbe) */
function farConifer(): THREE.BufferGeometry {
  const b = new DB();
  b.cone(0.4, 0.7, 5, 0, 0.14, 0, [1, 1, 1]);
  b.cone(0.26, 0.55, 5, 0, 0.62, 0, [1, 1, 1]);
  return b.finish({ aoH: 0.5, aoK: 0.35, topLight: 0.1, facet: 0.05 }, 81);
}
function farBroad(): THREE.BufferGeometry {
  const b = new DB();
  b.cyl(0.05, 0.08, 0.4, 4, 0, 0, 0, [0.42, 0.3, 0.18]);
  b.blob(0.36, 0.34, 0.36, 0, 0.7, 0, 3, [1, 1, 1], 0, 0.4);
  return b.finish({ aoH: 0.6, aoK: 0.35, topLight: 0.1, facet: 0.05 }, 83);
}

function bushModel(kind: 'green' | 'flower' | 'dry'): THREE.BufferGeometry {
  const b = new DB();
  const d = kind === 'dry' ? K.bushDry : K.bushDark;
  const l = kind === 'dry' ? K.bushDryL : K.bushLight;
  b.blob(0.24, 0.17, 0.24, 0, 0.1, 0, 5, d, 0, 0.55);
  b.blob(0.18, 0.14, 0.18, 0.16, 0.08, 0.06, 9, l, 0, 0.55);
  b.blob(0.16, 0.13, 0.16, -0.14, 0.08, -0.07, 13, d, 0, 0.5);
  if (kind === 'flower') {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      // Blüten als kleine Pyramiden (4 Dreiecke)
      b.cone(0.045, 0.06, 4, Math.cos(a) * 0.2, 0.16 + (i % 3) * 0.04, Math.sin(a) * 0.2, i % 2 ? [0.9, 0.85, 0.3] : [0.92, 0.55, 0.62]);
    }
  }
  return b.finish({ aoH: 0.3, aoK: 0.4, topLight: 0.14, facet: 0.08 }, 91);
}

function peakModel(v: number): THREE.BufferGeometry {
  const b = new DB();
  const big = v === 0;
  b.cone(big ? 0.62 : 0.5, big ? 1.1 : 0.85, 5, 0, 0, 0, K.rock);
  b.cone(0.3, 0.7, 5, 0.25, 0, 0.1, K.rockDark, 0, 0, v);
  b.blob(0.32, 0.24, 0.3, -0.3, 0.12, 0.2, 5 + v, mixC(K.rockDark, K.rock, 0.4), 1, 0.7);
  b.blob(0.22, 0.16, 0.2, 0.3, 0.1, -0.28, 9 + v, K.rock, 0, 0.7);
  b.cone(0.16, 0.28, 4, big ? 0 : 0.05, big ? 1.0 : 0.78, 0, K.stone);
  // Schichtlinien: helle Platten schräg am Hang
  b.box(0.7, 0.04, 0.3, 0, 0.35, 0.08, mixC(K.stone, K.rock, 0.4), 0.5);
  b.box(0.5, 0.04, 0.22, 0.05, 0.6, -0.05, mixC(K.stone, K.rock, 0.3), -0.4);
  return b.finish({ aoH: 0.8, aoK: 0.4, topLight: 0.1, facet: 0.1, moss: 0.35 }, 101 + v);
}

function rockSmallModel(v: number): THREE.BufferGeometry {
  const b = new DB();
  b.blob(0.26, 0.2, 0.24, 0, 0.06, 0, 5 + v * 7, mixC(K.rock, K.rockDark, 0.2 + v * 0.2), 1, 0.65);
  b.blob(0.14, 0.11, 0.13, 0.2, 0.03, 0.08, 9 + v, K.rock, 0, 0.6);
  return b.finish(ROCK_OPTS, 111 + v);
}

/** Steinvorkommen: helle, geschichtete Felsplatten mit Meißelkanten und dunklen Fugen */
function stoneModel(v: number): THREE.BufferGeometry {
  const b = new DB();
  const L = mixC(K.stone, [1, 1, 1], 0.06);
  b.blob(0.36, 0.28, 0.32, -0.05, 0.12, 0.02, 11 + v, K.stone, 1, 0.55);
  b.blob(0.26, 0.24, 0.24, 0.28, 0.08, 0.1, 21 + v, K.stoneDark, 0, 0.6);
  b.blob(0.22, 0.3, 0.22, -0.28, 0.1, -0.22, 31 + v, K.stone, 0, 0.6);
  b.blob(0.17, 0.15, 0.16, 0.1, 0.06, -0.3, 41 + v, K.stoneDark, 0, 0.6);
  // geschichtete Platten obenauf
  b.box(0.5, 0.05, 0.36, -0.04, 0.3, 0.02, L, 0.3 + v * 0.1);
  b.box(0.36, 0.05, 0.28, 0.0, 0.35, 0.0, mixC(L, K.stoneDark, 0.3), -0.4);
  b.box(0.22, 0.12, 0.2, 0.18, 0.2, -0.12, K.white, 0.9);
  return b.finish({ aoH: 0.45, aoK: 0.4, topLight: 0.12, facet: 0.1, moss: 0.12 }, 121 + v);
}

/** Eisenvorkommen: dunkles Gestein mit rostroten und goldenen Erzadern und Kristallspitzen */
function oreModel(v: number): THREE.BufferGeometry {
  const b = new DB();
  b.blob(0.36, 0.3, 0.32, -0.05, 0.12, 0.02, 13 + v, K.rockDark, 1, 0.6);
  b.blob(0.26, 0.27, 0.24, 0.28, 0.08, 0.1, 23 + v, K.black, 0, 0.6);
  b.blob(0.22, 0.32, 0.22, -0.28, 0.1, -0.22, 33 + v, K.rockDark, 0, 0.6);
  b.blob(0.17, 0.15, 0.16, 0.1, 0.06, -0.3, 43 + v, K.black, 0, 0.6);
  b.box(0.52, 0.05, 0.07, -0.02, 0.3, 0.12, K.roof, 0.5);
  b.box(0.4, 0.05, 0.06, 0.16, 0.24, -0.06, K.roof, -0.7);
  b.box(0.3, 0.05, 0.06, -0.26, 0.26, -0.2, K.gold, 0.2);
  b.cone(0.06, 0.2, 4, 0.2, 0.12, 0.2, K.roof);
  b.cone(0.05, 0.16, 4, -0.12, 0.3, -0.1, K.gold);
  b.cone(0.055, 0.18, 4, 0.02, 0.28, 0.18, K.roof);
  return b.finish({ aoH: 0.45, aoK: 0.4, topLight: 0.12, facet: 0.1 }, 131 + v);
}

function pitchModel(): THREE.BufferGeometry {
  const b = new DB();
  b.cyl(0.4, 0.44, 0.06, 8, 0, 0, 0, K.pitch);
  b.cyl(0.18, 0.24, 0.12, 6, 0.1, 0, 0.05, K.black);
  b.cyl(0.09, 0.11, 0.1, 5, -0.2, 0.03, -0.1, K.black);
  // glänzende Blasen und Krustenring
  b.blob(0.06, 0.05, 0.06, 0.12, 0.13, 0.04, 3, [0.35, 0.35, 0.38], 0, 0.2, false);
  b.blob(0.045, 0.04, 0.045, -0.2, 0.12, -0.1, 5, [0.32, 0.32, 0.36], 0, 0.2, false);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28;
    b.blob(0.07, 0.05, 0.07, Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42, 40 + i, mixC(K.pitch, K.rockDark, 0.5), 0, 0.5);
  }
  return b.finish({ aoH: 0.15, aoK: 0.2, topLight: 0.05, facet: 0.04 }, 141);
}

function grassGeo(dry: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const base = dry ? K.dryBase : K.grassBase;
  const tip = dry ? K.dryTip : K.grassTip;
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const r = 0.025 + (i % 3) * 0.03;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const h = (dry ? 0.1 : 0.16) + (i % 4) * (dry ? 0.04 : 0.055) + hash2(3, i, dry ? 1 : 0) * 0.04;
    const lean = 0.06 + (i % 2) * 0.06;
    const tx = cx + Math.cos(a) * lean;
    const tz = cz + Math.sin(a) * lean;
    const ox = -Math.sin(a) * 0.026;
    const oz = Math.cos(a) * 0.026;
    pos.push(cx - ox, 0, cz - oz, cx + ox, 0, cz + oz, tx, h, tz);
    const bk = 0.85 + (i % 3) * 0.1;
    col.push(base[0] * bk, base[1] * bk, base[2] * bk, base[0] * bk, base[1] * bk, base[2] * bk, tip[0], tip[1], tip[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Wiesenblumen: kleiner Strauß aus fünf Blüten in Weiß, Gelb, Rosa, Violett (je 5 Dreiecke: Stiel und Blüte), leicht */
function flowerGeo(): THREE.BufferGeometry {
  const b = new DB();
  const heads: C3[] = [lin(0xf2efe2), lin(0xe8c63a), lin(0xe07a98), lin(0x9a6fd0), lin(0xf2efe2)];
  for (let i = 0; i < heads.length; i++) {
    const a = i * 1.26 + 0.4;
    const r = 0.05 + (i % 2) * 0.04;
    const h = 0.11 + (i % 3) * 0.035;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Stiel: schmales Dreieck, Blüte: flache vierseitige Pyramide
    b.cone(0.012, h, 3, x, 0, z, K.grassBase);
    b.cone(0.04, 0.035, 4, x, h - 0.005, z, heads[i]);
  }
  return b.finish({ aoH: 0.12, aoK: 0.15, topLight: 0.05, facet: 0.03 }, 151);
}

function pebbleGeo(): THREE.BufferGeometry {
  const b = new DB();
  b.blob(0.065, 0.04, 0.055, 0, 0.0, 0, 3, K.pebble, 0, 0.45);
  b.blob(0.045, 0.03, 0.045, 0.1, 0.0, 0.04, 5, K.pebbleD, 0, 0.45);
  return b.finish({ aoH: 0.06, aoK: 0.2, topLight: 0.08, facet: 0.06 }, 161);
}

// ---------------------------------------------------------------------------------------------------------------
// Instanzen
// ---------------------------------------------------------------------------------------------------------------

export type DecorKind =
  | 'spruce' | 'spruce2' | 'oak' | 'birch' | 'acacia' | 'cypress' | 'palm'
  | 'farConifer' | 'farBroad'
  | 'bush' | 'bushFlower' | 'bushDry'
  | 'peak' | 'peak2' | 'rockS' | 'rockS2' | 'stone' | 'stone2' | 'ore' | 'ore2' | 'pitch'
  | 'grass' | 'grassDry' | 'flowers' | 'pebbles';
export const DECOR_KINDS: DecorKind[] = [
  'spruce', 'spruce2', 'oak', 'birch', 'acacia', 'cypress', 'palm', 'farConifer', 'farBroad', 'bush', 'bushFlower', 'bushDry',
  'peak', 'peak2', 'rockS', 'rockS2', 'stone', 'stone2', 'ore', 'ore2', 'pitch', 'grass', 'grassDry', 'flowers', 'pebbles',
];
const TREE_KINDS = new Set<DecorKind>(['spruce', 'spruce2', 'oak', 'birch', 'acacia', 'cypress', 'palm', 'bush', 'bushFlower', 'bushDry']);
const SMALL_KINDS = new Set<DecorKind>(['grass', 'grassDry', 'flowers', 'pebbles']);
/** Floats je Instanz: x, y, z, Drehung, Breite, Höhe, Neigung, r, g, b */
const STRIDE = 10;

/** Fernform und Grundfarbe je Baumart */
const FAR: Record<Species, { kind: DecorKind; col: C3 }> = {
  spruce: { kind: 'farConifer', col: K.spruceMid },
  spruce2: { kind: 'farConifer', col: K.spruceDark },
  cypress: { kind: 'farConifer', col: K.cypress },
  oak: { kind: 'farBroad', col: K.oakMid },
  birch: { kind: 'farBroad', col: K.birchLeaf },
  acacia: { kind: 'farBroad', col: K.acacia },
  palm: { kind: 'farBroad', col: K.palmLeaf },
};

/**
 * Schreibt eine 4x4-Instanzmatrix (spaltenweise) aus Position, Drehung um Y (rot), Neigung um X (lean) und
 * Skalierung (breit w, hoch h): entspricht `Matrix4.compose` mit Euler-Reihenfolge YXZ (z = 0), ohne Zwischenobjekte.
 */
export function writeInstanceMatrix(arr: Float32Array, m: number, x: number, y: number, z: number, rot: number, lean: number, w: number, h: number): void {
  const cy = Math.cos(rot);
  const sy = Math.sin(rot);
  const cx = Math.cos(lean);
  const sx = Math.sin(lean);
  arr[m] = cy * w;
  arr[m + 1] = 0;
  arr[m + 2] = -sy * w;
  arr[m + 3] = 0;
  arr[m + 4] = sy * sx * h;
  arr[m + 5] = cx * h;
  arr[m + 6] = cy * sx * h;
  arr[m + 7] = 0;
  arr[m + 8] = sy * cx * w;
  arr[m + 9] = -sx * w;
  arr[m + 10] = cy * cx * w;
  arr[m + 11] = 0;
  arr[m + 12] = x;
  arr[m + 13] = y;
  arr[m + 14] = z;
  arr[m + 15] = 1;
}

/** Statische Dekoration (Bäume, Felsen, Vorkommen, Gras, Blumen) als InstancedMeshes, nur im Sichtbereich. */
export class DecorRenderer {
  readonly group = new THREE.Group();
  private lit = foliageMaterial();
  private meshes: Partial<Record<DecorKind, THREE.InstancedMesh>> = {};
  private geoCache: Partial<Record<DecorKind, THREE.BufferGeometry>> = {};
  private lists = new Map<DecorKind, number[]>();
  private dirty = true;
  private lastBuild = -10;
  private explored: Uint8Array | null = null;
  private q: QualityCfg = qualityOf('medium');
  private shadows = true;
  private cx = -1e9;
  private cz = -1e9;
  private camDist = 40;
  /** Kameraposition (Weltkoordinaten) für den Detailgrad der Bäume */
  private camPos = new THREE.Vector3(1e9, 0, 1e9);
  private lastCamDist = 40;
  /** Belegung durch Gebäude (Client-Spiegel), damit kein Gras durch Felder wächst */
  private occupied: Int32Array | null = null;
  private blds: ReadonlyMap<number, GroundBuilding> | null = null;
  private groundDirty = true;
  /** Bodenkarte (wird von GameScene gesetzt); Dekor meidet Pfade und Felder */
  ground: GroundMap | null = null;
  biome: Biome;
  /** Zähler der zuletzt gebauten Instanzen (Messung/Test) */
  stats = { trees: 0, far: 0, small: 0, total: 0, ms: 0 };

  constructor(private map: GameMap) {
    this.group.name = 'decor';
    this.biome = biomeOf(map.seed);
    for (const k of DECOR_KINDS) this.lists.set(k, []);
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.biome = biomeOf(map.seed);
    this.dirty = true;
    this.groundDirty = true;
  }

  setOccupancy(a: Int32Array | null, buildings?: ReadonlyMap<number, GroundBuilding>): void {
    this.occupied = a;
    if (buildings) this.blds = buildings;
    this.dirty = true;
    this.groundDirty = true;
  }

  /** Erkundungskarte (Kriegsnebel): nicht erkundete Tiles bekommen keine Dekoration */
  setExplored(e: Uint8Array | null): void {
    this.explored = e;
    this.dirty = true;
  }

  applyQuality(q: QualityCfg, shadows: boolean): void {
    this.q = q;
    this.shadows = shadows;
    for (const k of DECOR_KINDS) {
      const m = this.meshes[k];
      if (m) this.setupMesh(m, k);
    }
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
    this.groundDirty = true;
  }

  private setupMesh(m: THREE.InstancedMesh, k: DecorKind): void {
    const far = k === 'farConifer' || k === 'farBroad';
    m.castShadow = this.shadows && this.q.shadowDecor && !SMALL_KINDS.has(k) && !far;
    m.customDepthMaterial = TREE_KINDS.has(k) && this.q.treeSway > 0 ? foliageDepthMaterial() : (undefined as unknown as THREE.Material);
  }

  update(now: number, camX = this.map.w / 2, camZ = this.map.h / 2, camDist = this.camDist, camPos?: THREE.Vector3): void {
    this.camDist = camDist;
    if (camPos) this.camPos.copy(camPos);
    const moved = Math.abs(camX - this.cx) > 5 || Math.abs(camZ - this.cz) > 5;
    const zoomed = Math.abs(camDist - this.lastCamDist) > this.lastCamDist * 0.2;
    if (!(this.dirty || moved || zoomed) || now - this.lastBuild < 0.35) return;
    this.dirty = false;
    this.lastBuild = now;
    this.cx = camX;
    this.cz = camZ;
    this.lastCamDist = camDist;
    if (this.groundDirty && this.ground && this.blds) {
      this.ground.update({ w: this.map.w, h: this.map.h, terrain: this.map.terrain }, this.blds.values());
      this.groundDirty = false;
    }
    this.rebuild(camX, camZ);
  }

  /** Kameraposition für den Detailgrad setzen (wird sonst über update() übernommen) */
  setCameraPos(p: THREE.Vector3): void {
    this.camPos.copy(p);
  }

  /** Modellgeometrie einer Art (für Tests und Messungen) */
  modelGeo(k: DecorKind): THREE.BufferGeometry {
    return this.geo(k);
  }

  private geo(k: DecorKind): THREE.BufferGeometry {
    let g = this.geoCache[k];
    if (!g) {
      switch (k) {
        case 'spruce': g = spruceModel(0); break;
        case 'spruce2': g = spruceModel(1); break;
        case 'oak': g = oakModel(); break;
        case 'birch': g = birchModel(); break;
        case 'acacia': g = acaciaModel(); break;
        case 'cypress': g = cypressModel(); break;
        case 'palm': g = palmModel(); break;
        case 'farConifer': g = farConifer(); break;
        case 'farBroad': g = farBroad(); break;
        case 'bush': g = bushModel('green'); break;
        case 'bushFlower': g = bushModel('flower'); break;
        case 'bushDry': g = bushModel('dry'); break;
        case 'peak': g = peakModel(0); break;
        case 'peak2': g = peakModel(1); break;
        case 'rockS': g = rockSmallModel(0); break;
        case 'rockS2': g = rockSmallModel(1); break;
        case 'stone': g = stoneModel(0); break;
        case 'stone2': g = stoneModel(7); break;
        case 'ore': g = oreModel(0); break;
        case 'ore2': g = oreModel(5); break;
        case 'pitch': g = pitchModel(); break;
        case 'grass': g = grassGeo(false); break;
        case 'grassDry': g = grassGeo(true); break;
        case 'flowers': g = flowerGeo(); break;
        default: g = pebbleGeo();
      }
      this.geoCache[k] = g;
    }
    return g;
  }

  private ensure(k: DecorKind, count: number): THREE.InstancedMesh {
    let m = this.meshes[k];
    if (!m || m.instanceMatrix.count < count) {
      if (m) {
        this.group.remove(m);
        m.dispose();
      }
      const grass = k === 'grass' || k === 'grassDry';
      const cap = Math.max(32, Math.ceil(count * 1.3));
      m = new THREE.InstancedMesh(this.geo(k), grass ? grassMaterial() : this.lit, cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.receiveShadow = false;
      m.frustumCulled = false;
      this.setupMesh(m, k);
      this.meshes[k] = m;
      this.group.add(m);
    }
    return m;
  }

  rebuild(camX: number, camZ: number): void {
    const map = this.map;
    const q = this.q;
    const bio = this.biome;
    const seed = map.seed;
    const tStart = performance.now();
    this.stats = { trees: 0, far: 0, small: 0, total: 0, ms: 0 };
    for (const l of this.lists.values()) l.length = 0;
    const L = (k: DecorKind): number[] => this.lists.get(k)!;
    // Sichtweite wächst mit dem Kameraabstand (Zoom heraus: mehr sehen), begrenzt durch die Qualitätsstufe
    const r = Math.min(q.decorRadius, Math.max(36, this.camDist * 1.55 + 14));
    const xa = Math.max(0, Math.floor(camX - r));
    const xb = Math.min(map.w - 1, Math.ceil(camX + r));
    const za = Math.max(0, Math.floor(camZ - r));
    const zb = Math.min(map.h - 1, Math.ceil(camZ + r));
    const rad2 = r * r;
    const gr = Math.min(r, 62, this.camDist * 1.2 + 10);
    const grassN = q.grassPerTile;
    let grassCount = 0;
    let smallCount = 0;
    // Detailgrad nach dem echten Abstand zur Kamera (Dreiecksbudget: weit weg oder weit herausgezoomt nur Fernformen)
    const fullR = q.treeFullRadius;
    const cp = this.camPos;
    const haveCam = cp.x < 1e8;
    const gd = this.ground?.data ?? null;
    const W = map.w;
    const treeAt = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < map.h && map.trees[y * W + x] > 0;
    const push = (k: DecorKind, x: number, y: number, z: number, rot: number, sx: number, sy: number, lean: number, c: C3 | null): void => {
      const l = L(k);
      l.push(x, y, z, rot, sx, sy, lean, c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1);
    };
    for (let y = za; y <= zb; y++) {
      for (let x = xa; x <= xb; x++) {
        // Kreis statt Quadrat: die Ecken des Sichtquadrats liegen außerhalb der Reichweite
        const ddx = x - camX;
        const ddz = y - camZ;
        if (ddx * ddx + ddz * ddz > rad2) continue;
        const i = y * W + x;
        if (this.explored && !this.explored[i]) continue;
        const t = map.terrain[i];
        if (t === T.Water || t === T.Moat) continue;
        const hgt = map.height[i];
        const base = hgt * HEIGHT_STEP;
        const r1 = hash2(seed + 3, x, y);
        const r2 = hash2(seed + 4, x, y);
        const r3 = hash2(seed + 5, x, y);
        const occ = this.occupied ? this.occupied[i] !== 0 : false;
        if (map.trees[i] > 0) {
          const species = pickSpecies(bio, t, hgt, r1);
          const look = treeLook(bio, species, r1, r2, r3, hash2(seed + 6, x, y));
          const px = x + 0.5 + look.ox;
          const pz = y + 0.5 + look.oz;
          const dxc = px - (haveCam ? cp.x : camX);
          const dzc = pz - (haveCam ? cp.z : camZ);
          const dyc = haveCam ? base - cp.y : 0;
          const far = dxc * dxc + dzc * dzc + dyc * dyc > fullR * fullR;
          if (far) {
            const f = FAR[species];
            const c: C3 = [f.col[0] * look.tint[0], f.col[1] * look.tint[1], f.col[2] * look.tint[2]];
            push(f.kind, px, base, pz, look.rot, look.s * (f.kind === 'farBroad' ? 1.05 : 1), look.sy, look.lean, c);
            this.stats.far++;
          } else {
            push(species, px, base, pz, look.rot, look.s, look.sy, look.lean, look.tint);
            this.stats.trees++;
            // dichter Wald: zusätzlicher kleiner Baum bzw. Jungwuchs
            const dens = forestDensity(
              (treeAt(x - 1, y - 1) ? 1 : 0) + (treeAt(x, y - 1) ? 1 : 0) + (treeAt(x + 1, y - 1) ? 1 : 0) + (treeAt(x - 1, y) ? 1 : 0) + 1 + (treeAt(x + 1, y) ? 1 : 0) + (treeAt(x - 1, y + 1) ? 1 : 0) + (treeAt(x, y + 1) ? 1 : 0) + (treeAt(x + 1, y + 1) ? 1 : 0),
            );
            const r5 = hash2(seed + 7, x, y);
            if (dens > 0.45 && r5 < 0.5 * q.undergrowth) {
              const sp2 = pickSpecies(bio, t, hgt, hash2(seed + 8, x, y));
              const lk2 = treeLook(bio, sp2, hash2(seed + 9, x, y), r3, r1, r2);
              push(sp2, x + 0.5 - look.ox * 0.9, base, y + 0.5 - look.oz * 0.9, lk2.rot, lk2.s * 0.62, lk2.sy * 0.9, lk2.lean, lk2.tint);
              this.stats.trees++;
            } else if (dens > 0.2 && r5 > 0.62 && r5 < 0.62 + 0.3 * q.undergrowth) {
              push('bush', x + 0.5 + (r2 - 0.5) * 0.8, base, y + 0.5 + (r1 - 0.5) * 0.8, r3 * 6.28, 0.8 + r2 * 0.5, 0.9 + r1 * 0.3, 0, [0.9 + r3 * 0.2, 0.95 + r2 * 0.1, 0.9 + r1 * 0.12]);
            }
          }
          continue;
        }
        if (t === T.Rock) {
          push(r1 < 0.5 ? 'peak' : 'peak2', x + 0.5, base, y + 0.5, r3 * 6.28, 0.8 + r2 * 1.1, 0.85 + r1 * 0.5, 0, null);
          continue;
        }
        if (t === T.StoneDeposit) {
          push(r1 < 0.5 ? 'stone' : 'stone2', x + 0.5 + (r2 - 0.5) * 0.4, base, y + 0.5 + (r3 - 0.5) * 0.4, r3 * 6.28, 0.85 + r1 * 0.55, 0.8 + r2 * 0.6, 0, null);
          continue;
        }
        if (t === T.IronDeposit) {
          push(r1 < 0.5 ? 'ore' : 'ore2', x + 0.5 + (r2 - 0.5) * 0.4, base, y + 0.5 + (r3 - 0.5) * 0.4, r3 * 6.28, 0.85 + r1 * 0.55, 0.8 + r2 * 0.6, 0, null);
          continue;
        }
        if (t === T.PitchSpring) {
          push('pitch', x + 0.5 + (r2 - 0.5) * 0.2, base, y + 0.5 + (r3 - 0.5) * 0.2, r3 * 6.28, 0.9 + r1 * 0.3, 1, 0, null);
          continue;
        }
        if (occ) continue;
        const trace = gd ? groundTrace(gd, i) : 0;
        const near = Math.abs(x - camX) <= gr && Math.abs(y - camZ) <= gr;
        const treeNb = (treeAt(x - 1, y) ? 1 : 0) + (treeAt(x + 1, y) ? 1 : 0) + (treeAt(x, y - 1) ? 1 : 0) + (treeAt(x, y + 1) ? 1 : 0);
        // Büsche am Waldrand und vereinzelt im Offenen (Dichte nach Qualitätsstufe)
        if (q.undergrowth > 0 && trace < 0.3 && (t === T.Steppe || t === T.Oasis || t === T.Desert)) {
          const pb = (treeNb > 0 ? 0.22 : 0.012) * q.undergrowth;
          if (hash2(seed + 21, x, y) < pb && (near || r <= 40)) {
            const dry = t !== T.Oasis && (t === T.Desert || bio.green < 0.3 || r2 < 0.35);
            const flower = !dry && hash2(seed + 22, x, y) < 0.22;
            push(dry ? 'bushDry' : flower ? 'bushFlower' : 'bush', x + 0.2 + r2 * 0.6, base, y + 0.2 + r3 * 0.6, r1 * 6.28, 0.8 + r3 * 0.6, 0.85 + r2 * 0.4, 0, [0.92 + r1 * 0.16, 0.95 + r2 * 0.1, 0.9 + r3 * 0.12]);
          }
        }
        // einzelne Felsbrocken (Hang, offene Fläche)
        const hRock = hash2(seed + 23, x, y);
        if (t !== T.Swamp && trace < 0.2 && hRock < 0.036 && (hRock < 0.006 || this.edgeNear(x, y, hgt))) {
          push(r2 < 0.5 ? 'rockS' : 'rockS2', x + 0.25 + r1 * 0.5, base, y + 0.25 + r3 * 0.5, r3 * 6.28, 0.7 + r2 * 0.8, 0.8 + r1 * 0.5, 0, null);
        }
        if (!near) continue;
        // Gras
        if (grassN > 0 && (t === T.Oasis || t === T.Steppe || t === T.Swamp) && trace < 0.35) {
          const n = t === T.Oasis ? grassN : t === T.Swamp ? Math.ceil(grassN * 0.6) : r2 < 0.3 ? Math.ceil(grassN * 0.3) : 0;
          const dry = t === T.Steppe && bio.green < 0.5;
          const list = L(dry ? 'grassDry' : 'grass');
          for (let g = 0; g < n && grassCount < q.grassMax; g++, grassCount++) {
            const gx = x + hash2(seed + 61 + g, x, y);
            const gz = y + hash2(seed + 71 + g, x, y);
            const tone = 0.82 + hash2(seed + 95 + g, x, y) * 0.36;
            list.push(gx, base, gz, hash2(seed + 81 + g, x, y) * 6.28, 0.8 + hash2(seed + 91 + g, x, y) * 0.7, 1, 0, tone, tone * (0.95 + r1 * 0.1), tone * (0.85 + r2 * 0.2));
          }
        }
        // Wiesenblumen und Kiesel
        if (q.flowersPerTile > 0 && smallCount < q.detailMax) {
          const lush = (t === T.Oasis || (t === T.Steppe && bio.green > 0.3)) && trace < 0.3;
          if (lush && hash2(seed + 31, x, y) < 0.13 * q.flowersPerTile) {
            L('flowers').push(x + hash2(seed + 32, x, y), base, y + hash2(seed + 33, x, y), r3 * 6.28, 0.8 + r1 * 0.5, 0.9 + r2 * 0.4, 0, 1, 1, 1);
            smallCount++;
          }
          const dry = t === T.Steppe || t === T.Desert;
          if (dry && hash2(seed + 34, x, y) < 0.045 + (trace > 0.4 ? 0.12 : 0)) {
            const tint = 0.7 + r1 * 0.3;
            L('pebbles').push(x + hash2(seed + 35, x, y), base, y + hash2(seed + 36, x, y), r3 * 6.28, 0.7 + r2 * 0.8, 1, 0, tint, tint, tint);
            smallCount++;
          }
        }
      }
    }
    this.stats.small = smallCount + grassCount;
    let total = 0;
    for (const k of DECOR_KINDS) {
      const l = L(k);
      const count = l.length / STRIDE;
      if (count === 0 && !this.meshes[k]) continue;
      const mesh = this.ensure(k, count);
      const arr = mesh.instanceMatrix.array as Float32Array;
      const ca = (mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
      for (let n = 0; n < count; n++) {
        const o = n * STRIDE;
        writeInstanceMatrix(arr, n * 16, l[o], l[o + 1], l[o + 2], l[o + 3], l[o + 6], l[o + 4], l[o + 5]);
        ca[n * 3] = l[o + 7];
        ca[n * 3 + 1] = l[o + 8];
        ca[n * 3 + 2] = l[o + 9];
      }
      mesh.count = count;
      // leere Gruppen gar nicht erst durch die Renderliste schicken (spart Programmwechsel und Objektaufwand)
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      total += count;
    }
    this.stats.total = total;
    this.stats.ms = performance.now() - tStart;
  }

  /** liegt das Tile an einer Höhenstufe (Hangkante)? */
  private edgeNear(x: number, y: number, h: number): boolean {
    const m = this.map;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (m.inBounds(nx, ny) && m.height[m.idx(nx, ny)] !== h && m.terrain[m.idx(nx, ny)] !== T.Water) return true;
    }
    return false;
  }
}
