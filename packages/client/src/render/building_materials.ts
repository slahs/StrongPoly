import * as THREE from 'three';
import { animDepthMaterial, animMaterial } from './materials';
import { QUALITY, QualityCfg } from './quality';

/**
 * Gebäudespezifische Materialien. Sie setzen auf dem gemeinsamen Animationsmaterial (`materials.ts`) auf und
 * ergänzen es per Shader-Patch, statt es zu ändern:
 *  - Materialvariation je Instanz (kleine Farbabweichung aus der Instanzphase)
 *  - prozedurale Oberflächen (Quaderfugen, Bretter, Ziegel, Stroh …) aus dem Vertexattribut `aSurf`
 *  - Bauanimation (`BUILD_CLIP`): Teile erscheinen nach ihrem Zeitfenster `aBuild` von unten nach oben,
 *    der Fortschritt der Instanz steckt in iAnim.z. Nichts wird skaliert, es gibt nur eine Höhenmaske.
 */
export const BGFX = {
  /** 0 = keine Oberflächenmuster (Niedrig), 1 = volle Muster */
  uDetail: { value: 1 },
};

const VERT_PARS = /* glsl */ `
attribute vec4 aBuild;
attribute float aSurf;
varying vec3 vLocal;
varying float vSurf;
varying float vTint;
varying vec4 vBuild;
varying float vProg;
`;

const VERT_BEGIN = /* glsl */ `
vLocal = transformed;
vSurf = aSurf;
vBuild = aBuild;
vProg = iAnim.z;
vTint = (fract(sin(iAnim.x * 91.7 + 3.1) * 437.58) - 0.5) * (1.0 - aMeta.x);
`;

const FRAG_COMMON = /* glsl */ `
varying vec3 vLocal;
varying float vSurf;
varying float vTint;
varying vec4 vBuild;
varying float vProg;
uniform float uDetail;
float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const FRAG_CLIP = /* glsl */ `
float bEdge = 0.0;
#ifdef BUILD_CLIP
{
  float s0 = vBuild.x; float s1 = vBuild.y;
  if (vProg <= s0) discard;
  float t = clamp((vProg - s0) / max(0.001, s1 - s0), 0.0, 1.0);
  float cut = vBuild.z + t * vBuild.w;
  if (vLocal.y > cut + 0.002) discard;
  bEdge = (1.0 - smoothstep(0.0, 0.07, cut - vLocal.y)) * (1.0 - step(0.999, t));
}
#endif
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 col = diffuseColor.rgb;
  col *= 1.0 + vTint * 0.16;
  if (uDetail > 0.5 && vSurf > 0.5) {
    vec3 dx = dFdx(vLocal); vec3 dy = dFdy(vLocal);
    vec3 fn = normalize(cross(dx, dy));
    float ky = abs(fn.y);
    vec2 uv;
    if (ky > 0.97) uv = vLocal.xz;
    else {
      vec3 us = vec3(0.0, 1.0, 0.0) - fn * fn.y;
      us = normalize(us);
      vec3 ur = normalize(cross(us, fn));
      uv = vec2(dot(vLocal, ur), dot(vLocal, us));
    }
    float u = uv.x; float v = uv.y;
    float k = vSurf;
    if (k < 1.5) {
      // Quader: Lagen von 0,21, Stoßfugen versetzt
      float ch = 0.21;
      float row = floor(v / ch);
      float bw = 0.40 + bHash(vec2(row, 1.7)) * 0.2;
      float bu = u + row * 0.37;
      float cell = floor(bu / bw);
      float fu = fract(bu / bw); float fv = fract(v / ch);
      float mortar = max(step(fu, 0.05), step(fv, 0.09));
      col *= 1.0 - 0.17 * mortar;
      col *= 1.0 + (bHash(vec2(cell, row)) - 0.5) * 0.13;
      col *= 1.0 + 0.05 * smoothstep(0.8, 1.0, fv) * (1.0 - mortar);
    } else if (k < 2.5) {
      float n = bNoise(uv * 3.1) * 0.6 + bNoise(uv * 11.0) * 0.4;
      col *= 0.95 + n * 0.1;
      col *= mix(0.9, 1.0, smoothstep(0.0, 0.4, vLocal.y));
    } else if (k < 3.5) {
      float pw = 0.14;
      float pid = floor(u / pw);
      float fu = fract(u / pw);
      col *= 1.0 - 0.2 * step(fu, 0.07);
      col *= 1.0 + (bHash(vec2(pid, 4.3)) - 0.5) * 0.16;
      col *= 1.0 + 0.04 * sin(v * 34.0 + pid * 5.0);
    } else if (k < 4.5) {
      float ch = 0.14;
      float row = floor(v / ch);
      float cw = 0.19;
      float bu = u + mod(row, 2.0) * cw * 0.5;
      float cell = floor(bu / cw);
      float fu = fract(bu / cw); float fv = fract(v / ch);
      col *= 0.8 + 0.2 * smoothstep(0.0, 0.75, fv);
      col *= 1.0 - 0.14 * step(fu, 0.07);
      col *= 1.0 + (bHash(vec2(cell, row)) - 0.5) * 0.16;
    } else if (k < 5.5) {
      float n = bNoise(vec2(u * 16.0, v * 2.5));
      float band = fract(v / 0.26);
      col *= 0.88 + n * 0.2;
      col *= 0.86 + 0.14 * smoothstep(0.0, 0.5, band);
    } else if (k < 6.5) {
      float ch = 0.1;
      float row = floor(v / ch);
      float cw = 0.13;
      float bu = u + mod(row, 2.0) * cw * 0.5;
      float cell = floor(bu / cw);
      float fu = fract(bu / cw); float fv = fract(v / ch);
      col *= 0.78 + 0.22 * smoothstep(0.0, 0.8, fv);
      col *= 1.0 - 0.12 * step(fu, 0.08);
      col *= 1.0 + (bHash(vec2(cell, row)) - 0.5) * 0.24;
    } else if (k < 7.5) {
      float ch = 0.17;
      float row = floor(v / ch);
      float fv = fract(v / ch);
      col *= 0.82 + 0.2 * sin(fv * 3.14159);
      col *= 1.0 + (bHash(vec2(row, 9.1)) - 0.5) * 0.14;
      col *= 1.0 + 0.05 * sin(u * 7.0 + row * 3.0);
    } else if (k < 8.5) {
      float n = bNoise(uv * 4.0) * 0.55 + bNoise(uv * 15.0) * 0.45;
      col *= 0.88 + n * 0.22;
    } else {
      float cw = 0.34;
      vec2 c = floor(uv / cw);
      vec2 f = fract(uv / cw);
      col *= 1.0 - 0.15 * max(step(f.x, 0.06), step(f.y, 0.06));
      col *= 1.0 + (bHash(c) - 0.5) * 0.14;
    }
  }
  col *= 1.0 + bEdge * 0.22;
  diffuseColor.rgb = col;
}
`;

function patchBuilding(s: THREE.WebGLProgramParametersWithUniforms, clip: boolean): void {
  s.uniforms.uDetail = BGFX.uDetail;
  s.vertexShader = s.vertexShader
    .replace('void main() {', VERT_PARS + '\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BEGIN);
  s.fragmentShader = s.fragmentShader
    .replace('void main() {', FRAG_COMMON + '\nvoid main() {\n' + FRAG_CLIP)
    .replace('#include <color_fragment>', FRAG_COLOR);
  if (clip) s.fragmentShader = '#define BUILD_CLIP\n' + s.fragmentShader;
}

function derive(base: THREE.MeshLambertMaterial, key: string, clip: boolean): THREE.MeshLambertMaterial {
  const m = base.clone();
  const baseCompile = base.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    baseCompile.call(m, s, r);
    patchBuilding(s, clip);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

let bldMat: THREE.MeshLambertMaterial | null = null;
/** Fertige Gebäude: Animationsmaterial + Instanzvariation + prozedurale Oberflächen */
export function buildingMaterial(): THREE.MeshLambertMaterial {
  return (bldMat ??= derive(animMaterial(), 'spBuilding', false));
}

let conMat: THREE.MeshLambertMaterial | null = null;
/** Baustellen: wie `buildingMaterial`, zusätzlich Höhenmaske nach Teilefenstern (iAnim.z = Fortschritt) */
export function constructionMaterial(): THREE.MeshLambertMaterial {
  return (conMat ??= derive(animMaterial(), 'spBuildingClip', true));
}

let conDepth: THREE.MeshDepthMaterial | null = null;
/** Schattenmaterial der Baustellen (gleiche Maske, damit der Schatten zum sichtbaren Teil passt) */
export function constructionDepthMaterial(): THREE.MeshDepthMaterial {
  if (conDepth) return conDepth;
  const base = animDepthMaterial();
  const m = base.clone();
  const baseCompile = base.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    baseCompile.call(m, s, r);
    s.vertexShader = s.vertexShader
      .replace('void main() {', VERT_PARS + '\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vLocal = transformed; vBuild = aBuild; vProg = iAnim.z;');
    s.fragmentShader = s.fragmentShader.replace(
      'void main() {',
      `varying vec3 vLocal; varying vec4 vBuild; varying float vProg;
void main() {
  {
    float s0 = vBuild.x; float s1 = vBuild.y;
    if (vProg <= s0) discard;
    float t = clamp((vProg - s0) / max(0.001, s1 - s0), 0.0, 1.0);
    if (vLocal.y > vBuild.z + t * vBuild.w + 0.002) discard;
  }`,
    );
  };
  m.customProgramCacheKey = () => 'spBuildingClipDepth';
  conDepth = m;
  return m;
}

/** Gebäude-Detailstufe je Grafikstufe: Niedrig = vereinfachte Details ohne Oberflächenmuster, Mittel/Hoch = volle Details */
export function buildingLevelOf(q: QualityCfg): { detail: 0 | 1 | 2; patterns: boolean } {
  if (q === QUALITY.low) return { detail: 1, patterns: false };
  return { detail: 2, patterns: true };
}
