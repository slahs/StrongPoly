import * as THREE from 'three';
import { GameMap, HEIGHT_STEP, T, hash2 } from '@strongpoly/shared';
import { GFX } from './materials';
import type { QualityCfg } from './quality';

/**
 * Umgebungsleben (zurückhaltend, ab Stufe Mittel): Vogelschwärme hoch am Himmel, Schmetterlinge über Wiesen und
 * treibende Blätter/Staub im Wind (Hoch). Alles instanziert und rein im Vertex-Shader animiert (Position aus Zeit und
 * Instanzparametern): keine CPU-Arbeit pro Frame außer wenigen Uniforms, je Gruppe ein Draw Call.
 */

const COMMON_VS = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
attribute vec4 aA;
attribute vec4 aB;
varying vec3 vCol;
#include <fog_pars_vertex>
`;

/** Vögel: Flügelschlag, Kreisbahn um einen Ankerpunkt, Schwarm in lockerer V-Formation */
const BIRD_VS = /* glsl */ `
${COMMON_VS}
void main() {
  // aA: Ankerpunkt (x, z), Radius, Winkelgeschwindigkeit; aB: Flughöhe, Phase, Formationsversatz x, z
  float ang = aB.y + uTime * aA.w;
  vec2 c = aA.xy;
  // Anker folgen der Kamera in einem Raster (nahtloses Umlaufen)
  float span = 170.0;
  c = mod(c - uCam.xz + span * 0.5, span) + uCam.xz - span * 0.5;
  vec2 dir = vec2(-sin(ang), cos(ang));
  vec2 side = vec2(dir.y, -dir.x);
  vec2 p = c + aA.z * vec2(cos(ang), sin(ang)) + dir * aB.w + side * aB.z;
  float y = aB.x + sin(uTime * 0.7 + aB.y * 3.0) * 0.5;
  // Körper: lokal x quer, z in Flugrichtung; Flügelspitzen (|x| > 0.3) schlagen
  vec3 l = position;
  float flap = sin(uTime * 9.0 + aB.y * 6.0 + aB.z);
  l.y += abs(l.x) * flap * 0.9;
  vec3 world = vec3(p.x, y, p.y) + vec3(side.x * l.x + dir.x * l.z, l.y, side.y * l.x + dir.y * l.z) * 0.3;
  vCol = vec3(0.12, 0.11, 0.1);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/** Schmetterlinge/Insekten: kleine Schwirrbahn um einen Ankerpunkt über Wiesen */
const BUG_VS = /* glsl */ `
${COMMON_VS}
void main() {
  // aA: Anker (x, y, z), Phase; aB: Farbe (rgb), Größe
  float ph = aA.w;
  float t = uTime * 0.8 + ph * 40.0;
  vec3 a = aA.xyz;
  vec3 off = vec3(sin(t * 1.3 + ph * 9.0) * 0.8 + sin(t * 2.9) * 0.25, 0.35 + sin(t * 1.9 + ph * 5.0) * 0.18, cos(t * 1.1 + ph * 7.0) * 0.8 + cos(t * 3.3) * 0.2);
  vec3 vel = vec3(cos(t * 1.3 + ph * 9.0) * 1.04, 0.0, -sin(t * 1.1 + ph * 7.0) * 0.88);
  float hd = atan(vel.x, vel.z);
  float flap = sin(uTime * 22.0 + ph * 50.0);
  vec3 l = position * aB.w;
  l.y += abs(l.x) * flap * 1.2;
  float cs = cos(hd);
  float sn = sin(hd);
  vec3 rl = vec3(l.x * cs + l.z * sn, l.y, -l.x * sn + l.z * cs);
  vec3 world = a + off + rl;
  vCol = aB.rgb;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/** Blätter und Staub: treiben mit dem Wind, taumeln, laufen um die Kamera herum */
const MOTE_VS = /* glsl */ `
${COMMON_VS}
uniform vec2 uWind;
void main() {
  // aA: Anfangsposition (x, y, z), Phase; aB: Farbe (rgb), Größe
  float ph = aA.w;
  vec3 p = aA.xyz;
  float span = 70.0;
  p.xz += uWind * (uTime * (0.7 + ph * 0.6));
  p.y += sin(uTime * 0.8 + ph * 20.0) * 0.35;
  p.xz = mod(p.xz - uCam.xz + span * 0.5, span) + uCam.xz - span * 0.5;
  p.y = uCam.y + 0.25 + p.y;
  float a = uTime * (1.5 + ph * 2.0) + ph * 30.0;
  vec3 l = position * aB.w;
  float c = cos(a);
  float s = sin(a);
  vec3 rl = vec3(l.x * c - l.y * s, l.x * s + l.y * c * 0.6, l.z + l.y * 0.2);
  vCol = aB.rgb;
  vec4 mvPosition = viewMatrix * vec4(p + rl, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FS = /* glsl */ `
varying vec3 vCol;
uniform float uAlpha;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(vCol, uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function makeMat(vs: string, extra: Record<string, { value: unknown }>, alpha: number): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: vs,
    fragmentShader: FS,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    transparent: alpha < 1,
    depthWrite: alpha >= 1,
    side: THREE.DoubleSide,
    fog: true,
  });
  m.uniforms.uAlpha = { value: alpha };
  m.uniforms.uTime = GFX.uTime;
  m.uniforms.uCam = { value: new THREE.Vector3() };
  for (const [k, v] of Object.entries(extra)) m.uniforms[k] = v;
  return m;
}

function geoWith(base: THREE.BufferGeometry, n: number, a: Float32Array, b: Float32Array): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = n;
  return g;
}

/** Vogel: zwei Flügel und ein Körper aus drei Dreiecken (x quer, z in Flugrichtung) */
function birdBase(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const v = [
    -0.7, 0, -0.1, 0, 0, 0.25, 0, 0, -0.25,
    0.7, 0, -0.1, 0, 0, -0.25, 0, 0, 0.25,
    0, 0.04, 0.3, -0.06, 0, -0.15, 0.06, 0, -0.15,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

function quadBase(sx: number, sy: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-sx, 0, -sy, sx, 0, -sy, sx, 0, sy, -sx, 0, sy], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Bündel aus bis zu drei Instanzgruppen; Anzahl und Umfang nach Qualitätsstufe */
export class AmbientLife {
  readonly group = new THREE.Group();
  private birds: THREE.Mesh | null = null;
  private bugs: THREE.Mesh | null = null;
  private motes: THREE.Mesh | null = null;
  private birdMat = makeMat(BIRD_VS, {}, 1);
  private bugMat = makeMat(BUG_VS, {}, 1);
  private moteMat = makeMat(MOTE_VS, { uWind: { value: new THREE.Vector2(0.8, 0.6) } }, 0.8);
  private q: QualityCfg | null = null;
  private lastBugX = -1e9;
  private lastBugZ = -1e9;

  constructor(private map: GameMap) {
    this.group.name = 'ambient';
    this.birdMat.uniforms.uTime = GFX.uTime;
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.lastBugX = -1e9;
  }

  applyQuality(q: QualityCfg): void {
    this.q = q;
    this.build();
  }

  private clear(m: THREE.Mesh | null): void {
    if (!m) return;
    this.group.remove(m);
    m.geometry.dispose();
  }

  private build(): void {
    const q = this.q;
    this.clear(this.birds);
    this.clear(this.bugs);
    this.clear(this.motes);
    this.birds = this.bugs = this.motes = null;
    if (!q || q.ambientLife <= 0 || q.ambientMax <= 0) return;
    const seed = this.map.seed;
    // Vögel: Schwärme zu 4..8
    const nBirds = Math.round(q.ambientMax * 0.22);
    {
      const a = new Float32Array(nBirds * 4);
      const b = new Float32Array(nBirds * 4);
      let i = 0;
      let f = 0;
      while (i < nBirds) {
        const size = 4 + Math.floor(hash2(seed + 501, f, 1) * 5);
        const cx = hash2(seed + 502, f, 2) * 170;
        const cz = hash2(seed + 503, f, 3) * 170;
        const radius = 10 + hash2(seed + 504, f, 4) * 16;
        const speed = (0.06 + hash2(seed + 505, f, 5) * 0.05) * (hash2(seed + 506, f, 6) < 0.5 ? 1 : -1);
        const height = 11 + hash2(seed + 507, f, 7) * 6;
        const ph = hash2(seed + 508, f, 8) * 6.28;
        for (let k = 0; k < size && i < nBirds; k++, i++) {
          const row = Math.ceil(k / 2);
          const sd = k === 0 ? 0 : k % 2 ? 1 : -1;
          a.set([cx, cz, radius, speed], i * 4);
          b.set([height + (hash2(seed + 509, f, k) - 0.5) * 0.8, ph, sd * row * 0.9, -row * 0.8], i * 4);
        }
        f++;
      }
      this.birds = new THREE.Mesh(geoWith(birdBase(), nBirds, a, b), this.birdMat);
      this.birds.frustumCulled = false;
      this.group.add(this.birds);
    }
    if (q.ambientLife >= 2) {
      const nMotes = Math.round(q.ambientMax * 0.45);
      const a = new Float32Array(nMotes * 4);
      const b = new Float32Array(nMotes * 4);
      for (let i = 0; i < nMotes; i++) {
        a.set([hash2(seed + 601, i, 1) * 70, 0.3 + hash2(seed + 602, i, 2) * 3, hash2(seed + 603, i, 3) * 70, hash2(seed + 604, i, 4)], i * 4);
        const leaf = hash2(seed + 605, i, 5) < 0.45;
        const tone = hash2(seed + 606, i, 6);
        // Blätter in Grün/Ocker, Staub heller; sehr klein
        const col = leaf ? (tone < 0.5 ? [0.28, 0.36, 0.12] : [0.5, 0.34, 0.1]) : [0.85, 0.78, 0.62];
        b.set([col[0], col[1], col[2], leaf ? 0.05 : 0.022], i * 4);
      }
      this.motes = new THREE.Mesh(geoWith(quadBase(1, 0.6), nMotes, a, b), this.moteMat);
      this.motes.frustumCulled = false;
      this.group.add(this.motes);
      this.bugs = null;
    }
  }

  /** Schmetterlinge neu verankern (über Wiesen nahe der Kamera) */
  private placeBugs(cx: number, cz: number): void {
    const q = this.q;
    if (!q || q.ambientLife < 2) return;
    const map = this.map;
    const n = Math.round(q.ambientMax * 0.3);
    const a = new Float32Array(n * 4);
    const b = new Float32Array(n * 4);
    const cols: [number, number, number][] = [[0.95, 0.9, 0.55], [0.96, 0.96, 0.9], [0.9, 0.55, 0.3], [0.7, 0.6, 0.9]];
    let count = 0;
    for (let k = 0; k < n * 6 && count < n; k++) {
      const x = Math.floor(cx + (hash2(map.seed + 701, k, 1) - 0.5) * 50);
      const z = Math.floor(cz + (hash2(map.seed + 702, k, 2) - 0.5) * 50);
      if (!map.inBounds(x, z)) continue;
      const i = map.idx(x, z);
      const t = map.terrain[i];
      if (t !== T.Oasis && !(t === T.Steppe && hash2(map.seed + 703, x, z) < 0.25)) continue;
      const c = cols[Math.floor(hash2(map.seed + 704, k, 3) * cols.length)];
      a.set([x + hash2(map.seed + 705, k, 4), map.height[i] * HEIGHT_STEP, z + hash2(map.seed + 706, k, 5), hash2(map.seed + 707, k, 6)], count * 4);
      b.set([c[0], c[1], c[2], 0.05], count * 4);
      count++;
    }
    this.clear(this.bugs);
    this.bugs = new THREE.Mesh(geoWith(quadBase(1, 0.5), count, a.slice(0, count * 4), b.slice(0, count * 4)), this.bugMat);
    this.bugs.frustumCulled = false;
    this.group.add(this.bugs);
    this.lastBugX = cx;
    this.lastBugZ = cz;
  }

  update(camX: number, camZ: number, camY: number, wind: THREE.Vector2): void {
    if (!this.q || this.q.ambientLife <= 0) return;
    for (const m of [this.birdMat, this.bugMat, this.moteMat]) (m.uniforms.uCam.value as THREE.Vector3).set(camX, camY, camZ);
    (this.moteMat.uniforms.uWind.value as THREE.Vector2).copy(wind).multiplyScalar(0.9);
    if (this.q.ambientLife >= 2 && Math.hypot(camX - this.lastBugX, camZ - this.lastBugZ) > 18) this.placeBugs(camX, camZ);
  }
}
