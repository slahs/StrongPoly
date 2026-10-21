import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EMITTER_KINDS } from './manifest';
import type { AnchorDef, AssetDef } from './manifest';

/**
 * Umwandlung einer geladenen glTF-Szene in das Laufzeitmodell (rein, ohne WebGL – testbar in Node):
 *   Knoten LOD0/LOD1/LOD2 → je LOD eine Geometrie je Bibliotheksmaterial (Asset-Koordinaten, Instanz-tauglich)
 *   Vertexattribute (GLB → Shader):
 *     COLOR_0 (color)         → aData  (vec4: R AO, G Schmutz, B Kantenabnutzung, A Teamfarbe)
 *     _BUILD, _BUILDH         → aBuild (vec4: s0, s1, y0, h – wie builder.ts, Höhenmaske der Bauanimation)
 *     _PART, _PIVOT           → aPivot (vec4: Drehpunkt xyz, Teil-Kennung w – Vertex-Animation materials.ts/unit_shader.ts)
 *     _ARM, COLOR_0.a         → aMeta  (vec3: Teamfarbe, AO-Faktor 1, Armstil)
 *     _STYLE, _SLOT (Figuren) → aStyle (vec4: Farbklasse, Sichtbarkeitsmaske, Hüfthöhe, Slot)
 *   Fehlende Attribute bekommen neutrale Werte (fehlt _BUILD, wächst jedes Teil als Ganzes von unten nach oben).
 *   Knoten ANCHOR_<art>_<n> (glTF-extras → userData) → Ankerpunkte und Emitter.
 */

export interface AssetPart {
  material: string;
  geometry: THREE.BufferGeometry;
  tris: number;
}

export interface AssetLod {
  parts: AssetPart[];
  tris: number;
}

export interface AssetEmitter {
  x: number;
  y: number;
  z: number;
  kind: string;
  rate: number;
  staffed: boolean;
}

export interface AssetModel {
  id: string;
  def: AssetDef;
  lods: AssetLod[];
  anchors: AnchorDef[];
  emitters: AssetEmitter[];
  /** Höhe über Boden (Oberkante LOD0) */
  height: number;
  /** Diagonale der Bounding-Box (LOD-Größenfaktor) */
  diag: number;
  /** Geometriespeicher aller LODs in Byte (Vertex- und Indexpuffer) */
  geoBytes: number;
  /** Figuren-Attribute vorhanden (aStyle) */
  figure: boolean;
  /** Ladezeit (ms) – vom Lader gesetzt */
  loadMs: number;
  /** zwischengespeicherte Hilfsgeometrien (Hover-Kanten, Bauvorschau) */
  cache: { edges?: THREE.BufferGeometry; ghost?: THREE.BufferGeometry };
}

/** Standard-Emissionsraten je Art (Partikel/s), wenn der Anker keine `rate` trägt (ähnlich work_fx.ts) */
const DEFAULT_RATE: Record<string, number> = { smoke: 2.2, smokeDark: 2.4, steam: 1.6, flame: 6, sparks: 2, anvil: 1.2, dust: 2, flour: 2, chips: 1.5 };

const LOD_RE = /^LOD([0-9])$/;

function f32(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, n: number, size: number, fill: number[]): Float32Array {
  const out = new Float32Array(n * size);
  if (!attr) {
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = fill[k] ?? 0;
    return out;
  }
  const get = [attr.getX.bind(attr), attr.getY.bind(attr), attr.getZ.bind(attr), attr.getW.bind(attr)];
  for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = k < attr.itemSize ? get[k](i) : fill[k] ?? 0;
  return out;
}

/** Geometrie eines glTF-Primitives in das Laufzeitformat (Asset-Koordinaten, Attribute s. o.) */
export function convertGeometry(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g0 = src.clone();
  g0.applyMatrix4(m);
  const n = g0.getAttribute('position').count;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(f32(g0.getAttribute('position'), n, 3, [0, 0, 0]), 3));
  const nrm = g0.getAttribute('normal');
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(f32(nrm, n, 3, [0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(f32(g0.getAttribute('uv'), n, 2, [0, 0]), 2));
  const col = g0.getAttribute('color');
  const data = f32(col, n, 4, [1, 0, 0, 0]);
  if (col && col.itemSize === 3) for (let i = 0; i < n; i++) data[i * 4 + 3] = 0;
  g.setAttribute('aData', new THREE.Float32BufferAttribute(data, 4));
  // Bauanimation
  const b = g0.getAttribute('_build');
  const bh = g0.getAttribute('_buildh');
  const pos = g.getAttribute('position');
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const bld = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (b) {
      bld[i * 4] = b.getX(i);
      bld[i * 4 + 1] = b.getY(i);
      bld[i * 4 + 2] = b.getZ(i);
      bld[i * 4 + 3] = bh ? bh.getX(i) : Math.max(1e-4, y1 - b.getZ(i));
    } else {
      bld[i * 4] = 0.1;
      bld[i * 4 + 1] = 0.82;
      bld[i * 4 + 2] = y0;
      bld[i * 4 + 3] = Math.max(1e-4, y1 - y0);
    }
  }
  g.setAttribute('aBuild', new THREE.Float32BufferAttribute(bld, 4));
  // Teile/Drehpunkte
  const part = g0.getAttribute('_part');
  const piv = g0.getAttribute('_pivot');
  const ap = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (piv) {
      ap[i * 4] = piv.getX(i);
      ap[i * 4 + 1] = piv.getY(i);
      ap[i * 4 + 2] = piv.getZ(i);
    }
    ap[i * 4 + 3] = part ? part.getX(i) : 0;
  }
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(ap, 4));
  const arm = g0.getAttribute('_arm');
  const meta = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    meta[i * 3] = data[i * 4 + 3] > 0.5 ? 1 : 0;
    meta[i * 3 + 1] = 1;
    meta[i * 3 + 2] = arm ? arm.getX(i) : 0;
  }
  g.setAttribute('aMeta', new THREE.Float32BufferAttribute(meta, 3));
  const st = g0.getAttribute('_style');
  if (st) {
    const slot = g0.getAttribute('_slot');
    const s = f32(st, n, 4, [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) s[i * 4 + 3] = slot ? slot.getX(i) : 0;
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(s, 4));
  }
  if (g0.index) g.setIndex(g0.index.clone());
  g0.dispose();
  return g;
}

function triCount(g: THREE.BufferGeometry): number {
  return Math.floor((g.index ? g.index.count : g.getAttribute('position').count) / 3);
}

export function geometryBytes(g: THREE.BufferGeometry): number {
  let s = 0;
  for (const a of Object.values(g.attributes)) s += (a as THREE.BufferAttribute).array.byteLength;
  if (g.index) s += g.index.array.byteLength;
  return s;
}

function materialName(mat: THREE.Material | THREE.Material[]): string {
  const m = Array.isArray(mat) ? mat[0] : mat;
  return m?.name || 'M_Default';
}

/** glTF-Szene → Laufzeitmodell. `def` aus dem Manifest (Anker im GLB haben Vorrang, falls vorhanden). */
export function modelFromScene(def: AssetDef, scene: THREE.Object3D): AssetModel {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const lodNodes: THREE.Object3D[] = [];
  const anchors: AnchorDef[] = [];
  scene.traverse((o) => {
    const m = LOD_RE.exec(o.name);
    if (m) lodNodes[Number(m[1])] = o;
    if (o.name.startsWith('ANCHOR_')) {
      const p = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const ex = (o.userData ?? {}) as Record<string, unknown>;
      const kind = typeof ex.kind === 'string' ? ex.kind : o.name.split('_')[1];
      anchors.push({ name: o.name, kind, pos: [p.x, p.y, p.z], extras: ex });
    }
  });
  // ohne LOD-Knoten: die ganze Szene ist LOD0
  if (!lodNodes.length) lodNodes[0] = scene;
  const lods: AssetLod[] = [];
  let geoBytes = 0;
  let figure = false;
  const box = new THREE.Box3();
  for (let L = 0; L < lodNodes.length; L++) {
    const node = lodNodes[L];
    if (!node) break;
    const byMat = new Map<string, THREE.BufferGeometry[]>();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      const g = convertGeometry(mesh.geometry, m);
      if (g.getAttribute('aStyle')) figure = true;
      const k = materialName(mesh.material);
      if (!byMat.has(k)) byMat.set(k, []);
      byMat.get(k)!.push(g);
    });
    const parts: AssetPart[] = [];
    let tris = 0;
    for (const [mat, gs] of [...byMat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const merged = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
      if (!merged) continue;
      if (gs.length > 1) for (const g of gs) g.dispose();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      if (L === 0 && merged.boundingBox) box.union(merged.boundingBox);
      const t = triCount(merged);
      tris += t;
      geoBytes += geometryBytes(merged);
      parts.push({ material: mat, geometry: merged, tris: t });
    }
    if (!parts.length) break;
    lods.push({ parts, tris });
  }
  const useAnchors = anchors.length ? anchors : def.anchors ?? [];
  const emitters: AssetEmitter[] = [];
  for (const a of useAnchors) {
    if (!(EMITTER_KINDS as readonly string[]).includes(a.kind)) continue;
    const r = Number(a.extras?.rate);
    emitters.push({ x: a.pos[0], y: a.pos[1], z: a.pos[2], kind: a.kind, rate: Number.isFinite(r) && r > 0 ? r : DEFAULT_RATE[a.kind] ?? 2, staffed: a.extras?.staffed === true || a.extras?.staffed === 1 });
  }
  const size = box.isEmpty() ? new THREE.Vector3(1, def.height || 1, 1) : box.getSize(new THREE.Vector3());
  return {
    id: def.id,
    def,
    lods,
    anchors: useAnchors,
    emitters,
    height: box.isEmpty() ? def.height : box.max.y,
    diag: size.length(),
    geoBytes,
    figure,
    loadMs: 0,
    cache: {},
  };
}

/** Geometrie, die nur die Attribut-Objekte teilt (gemeinsame GPU-Puffer), damit jedes TypeMesh eigene Instanzattribute anhängen kann */
export function shareGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const s = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) s.setAttribute(k, a);
  if (g.index) s.setIndex(g.index);
  s.boundingBox = g.boundingBox;
  s.boundingSphere = g.boundingSphere;
  return s;
}

/** Alle Materialteile einer LOD-Stufe zu einer Geometrie (nur Position/Normale + Farbe), z. B. für Bauvorschau und Hover-Kanten */
export function mergedLod(model: AssetModel, level: number, colorOf?: (material: string) => THREE.Color): THREE.BufferGeometry {
  const lod = model.lods[Math.min(level, model.lods.length - 1)];
  const gs: THREE.BufferGeometry[] = [];
  for (const p of lod.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', p.geometry.getAttribute('position'));
    const nrm = p.geometry.getAttribute('normal');
    if (nrm) g.setAttribute('normal', nrm);
    const n = g.getAttribute('position').count;
    const c = colorOf ? colorOf(p.material) : new THREE.Color(1, 1, 1);
    const data = p.geometry.getAttribute('aData');
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ao = data ? 0.35 + 0.65 * data.getX(i) : 1;
      col[i * 3] = c.r * ao;
      col[i * 3 + 1] = c.g * ao;
      col[i * 3 + 2] = c.b * ao;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (p.geometry.index) g.setIndex(p.geometry.index);
    gs.push(g.index ? g.toNonIndexed() : g);
  }
  const m = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
  if (!m.getAttribute('normal')) m.computeVertexNormals();
  m.computeBoundingBox();
  m.computeBoundingSphere();
  return m;
}
