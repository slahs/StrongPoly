import * as THREE from 'three';
import { NOISE_SIZE, genNoiseA, genNoiseN } from './noise';

/**
 * Gemeinsame Shader-Uniforms (werden von GameScene gesetzt). Die ersten drei gab es schon, der Rest ist neu und
 * ausschließlich additiv: alle Materialien lesen dieselben Objekte, ein Wert ändert also alle Programme zugleich.
 */
export const GFX = {
  uTime: { value: 0 },
  /** Stärke der eingebackenen Ambient Occlusion 0..1 */
  uAo: { value: 0.85 },
  /** Windstärke für Gras */
  uWind: { value: 1 },
  /** Windrichtung in der Ebene (normiert) */
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  /** prozedurale Rauschtexturen (siehe noise.ts), werden bei der ersten Materialerzeugung gefüllt */
  uNoiseA: { value: null as THREE.Texture | null },
  uNoiseN: { value: null as THREE.Texture | null },
  /** Richtung zur Sonne und Lichtfarben (bereits mit Intensität multipliziert = Bestrahlungsstärke) */
  uSunDir: { value: new THREE.Vector3(-0.38, 0.8, 0.46).normalize() },
  uSunIrr: { value: new THREE.Color(1, 0.9, 0.7) },
  uSkyIrr: { value: new THREE.Color(1, 0.94, 0.82) },
  uGndIrr: { value: new THREE.Color(0.54, 0.46, 0.34) },
  /** Himmelsfarbe für Reflexe und Randlicht (ohne Intensität) */
  uSkyCol: { value: new THREE.Color(0.62, 0.72, 0.82) },
  /** Oberflächendetail im Gelände: 0 aus, 1 Farbvariation + einfache Normalen, 2 + Klippen-Schichten, Kies */
  uDetail: { value: 2 },
  /** Wolkenschatten 0..1 */
  uCloud: { value: 0.6 },
  /** Himmelsreflex am Rand (Randlicht) 0..1 */
  uRim: { value: 0.6 },
  /** Materialvariation je Instanz 0..1 */
  uVar: { value: 1 },
  /** Wasser: 1 animierte Normalen + Fresnel + Schaum, 2 + Glitzern und zweite Wellenlage */
  uWaterLv: { value: 2 },
  /** Baumschwanken 0..1 */
  uTreeSway: { value: 1 },
  /** Bodenkarte (Trampelpfade, Felder, Kontaktschatten), siehe terrain.ts / groundmap.ts */
  uGround: { value: null as THREE.Texture | null },
  /** 1 / Kartengröße in Tiles */
  uMapInv: { value: new THREE.Vector2(1 / 128, 1 / 128) },
};

/** Teil-Kennungen für die prozedurale Animation (Attribut aPivot.w). */
export const PART = {
  Static: 0,
  LegL: 1,
  LegR: 2,
  /** Waffenarm: Hieb, Hacken, Bogen spannen */
  ArmR: 3,
  /** zweiter Arm: Bogenarm / Schildarm */
  ArmL: 4,
  /** Bogen: folgt dem linken Arm, bleibt aber aufrecht */
  Bow: 5,
  Wheel: 6,
  /** Wurfarm der Katapulte */
  Lever: 7,
  /** Rammbock / Rückstoß: Verschiebung entlang z */
  Slide: 8,
  /** Mühlenflügel: Drehung um z */
  Sail: 10,
  /** Fahnentuch: flattert */
  Cloth: 11,
  /** Torflügel/Fallgatter: hebt sich bei geöffnetem Tor */
  Door: 12,
} as const;

/** Flags im Instanzattribut iAnim.y */
export const AF = {
  Move: 1,
  Melee: 2,
  Shoot: 4,
  Work: 8,
  Dead: 16,
  /** Gebäude: kein Wippen des ganzen Körpers */
  Static: 64,
} as const;

const ANIM_PARS = /* glsl */ `
attribute vec4 aPivot;
attribute vec3 aMeta;
attribute vec4 iAnim;
uniform float uTime;
uniform float uAo;

vec3 spRotX(vec3 p, vec3 c, float a) {
  float s = sin(a); float co = cos(a);
  vec3 d = p - c;
  return c + vec3(d.x, d.y * co - d.z * s, d.y * s + d.z * co);
}
vec3 spRotZ(vec3 p, vec3 c, float a) {
  float s = sin(a); float co = cos(a);
  vec3 d = p - c;
  return c + vec3(d.x * co - d.y * s, d.x * s + d.y * co, d.z);
}
float spSaw(float c, float a, float b) { return clamp((c - a) / (b - a), 0.0, 1.0); }

vec3 spAnimate(vec3 p) {
  float part = aPivot.w;
  int fl = int(iAnim.y + 0.5);
  if (fl == 0 && part < 9.5) return p;
  float ph = iAnim.x;
  if ((fl & 16) != 0) {
    float age = iAnim.w;
    float f = clamp(age / 0.4, 0.0, 1.0);
    f = f * f * (3.0 - 2.0 * f);
    vec3 q;
    if (iAnim.z > 0.5) {
      q = spRotZ(p, vec3(0.0), (ph > 0.5 ? 1.5708 : -1.5708) * f);
      q.y += 0.14 * f;
    } else {
      q = spRotX(p, vec3(0.0), -1.5708 * f);
      q.y += 0.1 * f;
    }
    q.y += sin(f * 3.14159) * 0.05;
    q.y -= max(0.0, age - 3.0) * 0.25;
    return q;
  }
  float wt = uTime * iAnim.z + ph * 6.2831853;
  float per = max(iAnim.w, 0.25);
  float cyc = fract(uTime / per + ph);
  bool moving = (fl & 1) != 0;
  bool melee = (fl & 2) != 0;
  bool shoot = (fl & 4) != 0;
  bool work = (fl & 8) != 0;
  vec3 off = vec3(0.0);
  if ((fl & 64) == 0) {
    if (moving) off.y += abs(sin(wt)) * 0.035;
    if (melee) off.z += 0.07 * spSaw(cyc, 0.5, 0.68) * (1.0 - spSaw(cyc, 0.68, 0.9));
    if (work) off.y -= 0.03 * abs(sin(cyc * 6.2831853));
  }
  vec3 c = aPivot.xyz;
  vec3 q = p;
  float a = 0.0;
  if (part < 0.5) return p + off;
  if (part < 1.5) {
    if (moving) q = spRotX(p, c, sin(wt) * 0.8);
  } else if (part < 2.5) {
    if (moving) q = spRotX(p, c, -sin(wt) * 0.8);
  } else if (part < 3.5) {
    if (melee) {
      if (aMeta.z > 0.5) {
        float z = -0.12 * spSaw(cyc, 0.0, 0.5);
        z = mix(z, 0.28, spSaw(cyc, 0.5, 0.6));
        z = mix(z, 0.0, spSaw(cyc, 0.6, 1.0));
        q = p + vec3(0.0, 0.0, z);
      } else {
        a = mix(0.0, -2.7, spSaw(cyc, 0.0, 0.5));
        a = mix(a, -0.15, spSaw(cyc, 0.5, 0.64));
        a = mix(a, 0.0, spSaw(cyc, 0.64, 1.0));
        q = spRotX(p, c, a);
      }
    } else if (shoot) {
      float pull = spSaw(cyc, 0.0, 0.7) * (1.0 - step(0.72, cyc));
      q = spRotX(p, c, -1.45);
      q.z -= 0.13 * pull;
    } else if (work) {
      q = spRotX(p, c, -1.25 + sin(cyc * 6.2831853) * 0.95);
    } else if (moving) {
      q = spRotX(p, c, -sin(wt) * 0.6);
    }
  } else if (part < 4.5) {
    if (shoot) q = spRotX(p, c, -1.45);
    else if (melee) q = spRotX(p, c, -0.6);
    else if (work) q = spRotX(p, c, -0.9 - sin(cyc * 6.2831853) * 0.5);
    else if (moving) q = spRotX(p, c, sin(wt) * 0.6);
  } else if (part < 5.5) {
    // Bogen: am linken Arm, aber aufrecht gehalten
    if (shoot) {
      q = spRotX(p, c, -1.45);
      vec3 hand = spRotX(c + vec3(0.0, -0.25, 0.0), c, -1.45);
      q = spRotX(q, hand, 1.35);
    } else if (moving) {
      float s2 = sin(wt) * 0.6;
      q = spRotX(p, c, s2);
    }
  } else if (part < 6.5) {
    if (moving) q = spRotX(p, c, wt * 0.8);
  } else if (part < 7.5) {
    if (shoot || melee) {
      a = mix(0.0, 1.05, spSaw(cyc, 0.0, 0.7));
      a = mix(a, -1.15, spSaw(cyc, 0.7, 0.78));
      a = mix(a, 0.0, spSaw(cyc, 0.78, 1.0));
      q = spRotX(p, c, a);
    }
  } else if (part < 8.5) {
    if (shoot || melee) {
      float z = mix(0.0, -0.4, spSaw(cyc, 0.0, 0.6));
      z = mix(z, 0.3, spSaw(cyc, 0.6, 0.72));
      z = mix(z, 0.0, spSaw(cyc, 0.72, 1.0));
      q = p + vec3(0.0, 0.0, z);
    }
  } else if (part > 9.5 && part < 10.5) {
    float sp = work ? 0.9 : 0.14;
    q = spRotZ(p, c, uTime * sp + ph * 6.2831853);
  } else if (part < 11.5) {
    vec3 d = p - c;
    float k = length(d.xz);
    q = p + vec3(sin(uTime * 4.0 + d.z * 9.0 + ph * 6.28) * 0.2 * k, 0.0, 0.0);
  } else {
    // Tor: Fallgatter hebt sich (iAnim.w = Öffnungsgrad 0..1)
    q = p + vec3(0.0, 1.7 * iAnim.w, 0.0);
  }
  return q + off;
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Rauschtexturen, Farbkorrektur und gemeinsame Shader-Bausteine
// ---------------------------------------------------------------------------------------------------------------

let noiseReady = false;
/** Erzeugt (einmalig) die prozeduralen Rauschtexturen; wird von den Materialfabriken aufgerufen. */
export function ensureNoiseTextures(): void {
  if (noiseReady) return;
  noiseReady = true;
  const mk = (data: Uint8Array<ArrayBuffer>): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  GFX.uNoiseA.value = mk(genNoiseA());
  GFX.uNoiseN.value = mk(genNoiseN());
}

/** Anisotropie der Rauschtexturen setzen (Gelände unter flachem Blickwinkel) */
export function setNoiseAnisotropy(level: number): void {
  for (const t of [GFX.uNoiseA.value, GFX.uNoiseN.value]) {
    if (t && t.anisotropy !== level) {
      t.anisotropy = level;
      t.needsUpdate = true;
    }
  }
}

/**
 * Farbkorrektur (Grading) für alle Materialien: wird in three.js' `colorspace_fragment` nach dem Tonemapping und vor
 * der sRGB-Kodierung eingesetzt. Bewusst ohne Uniforms (reine Konstanten), damit auch Fremdshader (Partikel) unberührt
 * kompilieren: etwas mehr Sättigung, leicht warmer Ton, sanfter S-Kontrast.
 */
THREE.ShaderChunk.colorspace_fragment = /* glsl */ `
{
  vec3 spc = max(gl_FragColor.rgb, vec3(0.0));
  float spl = dot(spc, vec3(0.2126, 0.7152, 0.0722));
  spc = mix(vec3(spl), spc, 1.04);
  spc *= vec3(1.02, 1.0, 0.97);
  vec3 spk = clamp(spc, 0.0, 1.0);
  spc = mix(spc, spk * spk * (3.0 - 2.0 * spk), 0.18);
  gl_FragColor.rgb = spc;
}
gl_FragColor = linearToOutputTexel( gl_FragColor );
`;

const WORLD_POS = /* glsl */ `
{
  vec4 spw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    spw = instanceMatrix * spw;
  #endif
  vSpW = (modelMatrix * spw).xyz;
}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uNoiseA;
uniform float uTime;
uniform float uCloud;
uniform float uRim;
uniform vec3 uSkyCol;
uniform vec2 uWindDir;
varying vec3 vSpW;
/* 1 = Wolkenschatten aus (Gewässerbett unter Wasser) */
float spNoCloud = 0.0;
`;

/** Wolkenschatten (wandernde Aufhellung/Abdunklung) und Himmelsreflex am Rand; nach der Beleuchtung */
const FRAG_TAIL = /* glsl */ `
{
  if (uCloud > 0.001) {
    float spcl = texture2D(uNoiseA, vSpW.xz * 0.0105 + uWindDir * (uTime * 0.0042)).r;
    spcl = smoothstep(0.40, 0.78, spcl);
    outgoingLight *= 1.0 - uCloud * 0.17 * spcl * (1.0 - spNoCloud);
  }
  if (uRim > 0.001) {
    float spr = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
    outgoingLight += uSkyCol * diffuseColor.rgb * (spr * spr * spr) * uRim * 0.5;
  }
}
`;

type Shader = THREE.WebGLProgramParametersWithUniforms;

function shareUniforms(s: Shader): void {
  s.uniforms.uTime = GFX.uTime;
  s.uniforms.uNoiseA = GFX.uNoiseA;
  s.uniforms.uCloud = GFX.uCloud;
  s.uniforms.uRim = GFX.uRim;
  s.uniforms.uSkyCol = GFX.uSkyCol;
  s.uniforms.uWindDir = GFX.uWindDir;
}

/** Weltposition (Varying) im Vertex-Shader und Wolkenschatten/Randlicht im Fragment-Shader ergänzen */
function patchLit(s: Shader): void {
  ensureNoiseTextures();
  shareUniforms(s);
  s.vertexShader = s.vertexShader.replace('void main() {', 'varying vec3 vSpW;\nvoid main() {').replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_POS);
  s.fragmentShader = s.fragmentShader.replace('void main() {', FRAG_PARS + 'void main() {').replace('#include <envmap_fragment>', '#include <envmap_fragment>\n' + FRAG_TAIL);
}

// ---------------------------------------------------------------------------------------------------------------
// Einheiten, Gebäude, statische Modelle
// ---------------------------------------------------------------------------------------------------------------

const COLOR_VERTEX_ANIM = /* glsl */ `
vColor = color.rgb;
#ifdef USE_INSTANCING_COLOR
  vColor = mix(vColor, instanceColor.rgb, aMeta.x);
#endif
vColor *= mix(1.0, aMeta.y, uAo);
{
  // Materialvariation je Instanz: Helligkeit und leichter Warm/Kalt-Stich aus der Instanzphase (stabil je Einheit/Gebäude),
  // Teamfarbteile bleiben unverändert
  float spHas = step(0.0001, iAnim.x);
  float spA = fract(iAnim.x * 7.3137 + 0.31);
  float spB = fract(iAnim.x * 13.771 + 0.57);
  float spK = spHas * uVar * (1.0 - aMeta.x);
  vColor *= 1.0 + (spA - 0.5) * 0.14 * spK;
  vColor *= vec3(1.0) + vec3(0.04, 0.0, -0.06) * ((spB - 0.5) * 2.0 * spK);
}
`;

const COLOR_VERTEX_STATIC = /* glsl */ `
vColor = color.rgb;
#ifdef USE_INSTANCING_COLOR
  vColor = mix(vColor, instanceColor.rgb, aMeta.x);
#endif
vColor *= mix(1.0, aMeta.y, uAo);
`;

function patchAnim(shader: Shader, color: boolean): void {
  shader.uniforms.uTime = GFX.uTime;
  shader.uniforms.uAo = GFX.uAo;
  shader.uniforms.uVar = GFX.uVar;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', ANIM_PARS + '\nuniform float uVar;\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = spAnimate(transformed);');
  if (color) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', COLOR_VERTEX_ANIM);
}

let animMat: THREE.MeshLambertMaterial | null = null;
/** Gemeinsames Material für alle animierten/instanzierten Modelle (Vertexfarben, Teamfarbe, AO, Vertex-Animation, Instanzvariation). */
export function animMaterial(): THREE.MeshLambertMaterial {
  if (animMat) return animMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (s) => {
    patchAnim(s, true);
    patchLit(s);
  };
  m.customProgramCacheKey = () => 'spAnimLambert2';
  animMat = m;
  return m;
}

let staticMat: THREE.MeshLambertMaterial | null = null;
/** Wie animMaterial, aber ohne Animation: Dekor, Trümmer (Vertexfarben, Teamfarbe, AO). */
export function staticMaterial(): THREE.MeshLambertMaterial {
  if (staticMat) return staticMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uAo = GFX.uAo;
    s.vertexShader = s.vertexShader.replace('void main() {', 'attribute vec3 aMeta;\nuniform float uAo;\nvoid main() {').replace('#include <color_vertex>', COLOR_VERTEX_STATIC);
    patchLit(s);
  };
  m.customProgramCacheKey = () => 'spStaticLambert2';
  staticMat = m;
  return m;
}

let animDepth: THREE.MeshDepthMaterial | null = null;
/** Schattenmaterial mit derselben Animation, damit Schatten zur Pose passen. */
export function animDepthMaterial(): THREE.MeshDepthMaterial {
  if (animDepth) return animDepth;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => patchAnim(s, false);
  m.customProgramCacheKey = () => 'spAnimDepth';
  animDepth = m;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Vegetation: Laub (Baumschwanken), Gras
// ---------------------------------------------------------------------------------------------------------------

const SWAY_PARS = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uTreeSway;
uniform vec2 uWindDir;
vec3 spSway(vec3 p, float flex) {
  #ifdef USE_INSTANCING
    vec3 ip = vec3(instanceMatrix[3]);
    float k = clamp(p.y * flex, 0.0, 1.0);
    k *= k;
    float ph = ip.x * 0.31 + ip.z * 0.23;
    float w = sin(uTime * 1.25 + ph) + 0.5 * sin(uTime * 2.7 + ph * 1.9);
    float gust = 0.5 + 0.5 * sin(uTime * 0.35 + dot(ip.xz, uWindDir) * 0.12);
    vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y) * (w * 0.5 + 0.45 * gust) * 0.085 * uWind * uTreeSway * k;
    d += vec3(sin(uTime * 4.1 + p.x * 9.0 + ph), 0.0, cos(uTime * 3.7 + p.z * 8.0 + ph)) * 0.010 * k * uTreeSway;
    mat3 m = mat3(instanceMatrix);
    vec3 s2 = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
    return p + (transpose(m) * d) / s2;
  #else
    return p;
  #endif
}
`;

function patchSway(s: Shader): void {
  s.uniforms.uTime = GFX.uTime;
  s.uniforms.uWind = GFX.uWind;
  s.uniforms.uTreeSway = GFX.uTreeSway;
  s.uniforms.uWindDir = GFX.uWindDir;
  s.vertexShader = s.vertexShader.replace('void main() {', SWAY_PARS + 'void main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = spSway(transformed, 0.9);');
}

let foliageMat: THREE.MeshLambertMaterial | null = null;
/**
 * Laub und Bäume: Vertexfarben mit Instanzfarbe als Multiplikator (Farbvariation je Baum), Ambient Occlusion,
 * Wind-Schwanken im Vertex-Shader (wächst mit der Höhe), Blattbüschel-Rauschen im Fragment-Shader.
 */
export function foliageMaterial(): THREE.MeshLambertMaterial {
  if (foliageMat) return foliageMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uAo = GFX.uAo;
    s.uniforms.uDetail = GFX.uDetail;
    patchSway(s);
    s.vertexShader = s.vertexShader.replace('void main() {', 'attribute vec3 aMeta;\nuniform float uAo;\nvoid main() {').replace(
      '#include <color_vertex>',
      /* glsl */ `
        vColor = color.rgb;
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor.rgb;
        #endif
        vColor *= mix(1.0, aMeta.y, uAo);
        `,
    );
    patchLit(s);
    s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform float uDetail;\nvoid main() {').replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      if (uDetail > 0.5) {
        vec4 spn = texture2D(uNoiseA, vSpW.xz * 0.31 + vec2(vSpW.y * 0.23, 0.0));
        diffuseColor.rgb *= 0.84 + spn.a * 0.32;
      }`,
    );
  };
  m.customProgramCacheKey = () => 'spFoliage';
  foliageMat = m;
  return m;
}

let foliageDepth: THREE.MeshDepthMaterial | null = null;
/** Schattenmaterial für schwankende Bäume (Schatten wackeln mit) */
export function foliageDepthMaterial(): THREE.MeshDepthMaterial {
  if (foliageDepth) return foliageDepth;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => patchSway(s);
  m.customProgramCacheKey = () => 'spFoliageDepth';
  foliageDepth = m;
  return m;
}

let grassMat: THREE.MeshLambertMaterial | null = null;
/** Gras: Büschel wiegen sich im Wind (Vertex-Shader, Auslenkung wächst mit der Höhe), Instanzfarbe variiert den Ton. */
export function grassMaterial(): THREE.MeshLambertMaterial {
  if (grassMat) return grassMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = GFX.uTime;
    s.uniforms.uWind = GFX.uWind;
    s.uniforms.uWindDir = GFX.uWindDir;
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'uniform float uTime;\nuniform float uWind;\nuniform vec2 uWindDir;\nvoid main() {')
      .replace(
        '#include <color_vertex>',
        /* glsl */ `
        #include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor.rgb;
        #endif`,
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        {
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float k = clamp(transformed.y * 3.2, 0.0, 1.0);
          float w = sin(uTime * 1.7 + ip.x * 0.75 + ip.z * 0.55) + 0.5 * sin(uTime * 3.1 + ip.x * 1.9 - ip.z * 1.3);
          float gust = 0.5 + 0.5 * sin(uTime * 0.4 + dot(ip.xz, uWindDir) * 0.14);
          transformed.x += (w * 0.07 + gust * 0.05) * k * k * uWind * uWindDir.x * 1.2;
          transformed.z += (cos(uTime * 1.3 + ip.x * 0.6) * 0.045 + gust * 0.05 * uWindDir.y) * k * k * uWind;
        }
        #include <project_vertex>`,
      );
    patchLit(s);
  };
  m.customProgramCacheKey = () => 'spGrass2';
  grassMat = m;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Gelände
// ---------------------------------------------------------------------------------------------------------------

const BUMP_FN = /* glsl */ `
// Bump-Mapping über Bildschirmableitungen der Höhe h (Weltgradient, unabhängig vom Zoom)
vec3 spBump(vec3 N, vec3 pos, float h, float k) {
  vec3 dpx = dFdx(pos);
  vec3 dpy = dFdy(pos);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpy, N);
  vec3 r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 g = (dhx * r1 + dhy * r2) / max(abs(det), 1e-8) * sign(det);
  return normalize(N - k * g);
}
`;

const TERRAIN_FRAG = /* glsl */ `
#include <color_fragment>
float spH = 0.0;
float spHk = 0.0;
{
  vec4 spG = texture2D(uGround, vSpW.xz * uMapInv);
  float spCliff = 1.0 - smoothstep(0.30, 0.80, vNy);
  vec2 spUv = spCliff > 0.5 ? vec2(vSpW.x + vSpW.z, vSpW.y * 1.7) : vSpW.xz;
  vec4 spA = texture2D(uNoiseA, spUv * 0.0156);
  vec4 spB = vec4(0.5);
  vec4 spF = vec4(0.5);
  vec3 spC = diffuseColor.rgb;
  vec3 spC0 = spC;
  float gw = vSurf.x;
  float sw = vSurf.y;
  float rw = max(vSurf.z, spCliff);
  float ww = min(vSurf.w, 1.0);
  // großflächige Flecken (Biom-Variation über Dutzende Felder)
  spC *= 1.0 + (spA.r - 0.5) * 0.26;
  spC *= mix(vec3(1.0), vec3(1.04, 1.0, 0.93), smoothstep(0.35, 0.68, spA.g) * 0.4);
  if (uDetail > 0.5) {
    spB = texture2D(uNoiseA, spUv * 0.115 + vec2(0.31, 0.57));
    spF = texture2D(uNoiseA, spUv * 0.29 + vec2(0.77, 0.13));
    // Gras: Lichtungen/Flecken in Grün- und Gelbtönen, feines Büschelkorn
    spC = mix(spC, spC * vec3(0.90, 1.07, 0.80), (spB.g - 0.5) * gw * 1.2);
    float tuft = smoothstep(0.55, 0.92, spF.a);
    spC *= 1.0 + (tuft - 0.35) * 0.2 * gw;
    // Sand: Rippelmuster
    float rip = sin(dot(spUv, vec2(0.87, 0.5)) * 8.0 + spB.r * 7.0);
    spC *= 1.0 + rip * 0.018 * sw;
    // Fels: Risse und Fleckung
    float crack = smoothstep(0.66, 0.92, spB.b);
    spC *= 1.0 - crack * 0.34 * rw;
    spC *= 1.0 + (spB.r - 0.5) * 0.34 * rw;
    // Klippen: Gesteinsschichten (Bänder um die Hochachse, warm/kühl wechselnd)
    if (spCliff > 0.02) {
      float band = sin(vSpW.y * 13.0 + spA.g * 5.0 + spB.r * 2.5);
      float band2 = sin(vSpW.y * 33.0 + spB.g * 9.0);
      spC *= 1.0 + (band * 0.15 + band2 * 0.05) * spCliff;
      spC = mix(spC, spC * vec3(1.10, 0.96, 0.82), smoothstep(0.1, 0.8, band) * 0.5 * spCliff);
    }
    // nasse Uferstreifen: dunkler und satter
    spC *= mix(1.0, 0.72, ww);
    spH = (spF.a - 0.5) * (0.06 + 0.12 * gw) + (spB.r - 0.5) * 0.30 - crack * 0.30 * rw + rip * 0.03 * sw;
    spHk = 0.55 + 0.7 * rw;
    // um Gebäude und auf Pfaden bleibt der Boden ruhig
    float calm = clamp(spG.r + spG.a, 0.0, 1.0) * 0.6;
    spC = mix(spC, spC0, calm);
    spH *= 1.0 - calm;
  }
  // Bodenkarte: getretene Erde um Gebäude, Pfade, Felder, Kontaktschatten
  float wear = smoothstep(0.10, 0.72, spG.r + (spA.g - 0.5) * 0.36) * (1.0 - spCliff);
  vec3 dirt = vec3(0.40, 0.29, 0.18) * (0.9 + 0.22 * spB.g);
  // Spuren folgen dem Kriegsnebel (vFog 1 sichtbar, 0,55 erkundet, 0,08 unerkundet): sonst verrieten sie Gebäude im Nebel
  spC = mix(spC, dirt * vFog, wear * 0.5);
  float path = smoothstep(0.30, 0.60, spG.a + (spB.r - 0.5) * 0.45) * (1.0 - spCliff);
  vec3 pdirt = vec3(0.40, 0.29, 0.17) * (0.9 + 0.2 * spF.r);
  pdirt = mix(pdirt, vec3(0.62, 0.55, 0.45), smoothstep(0.84, 0.95, spF.a) * 0.6);
  spC = mix(spC, pdirt * vFog, path * 0.9);
  float field = smoothstep(0.32, 0.65, spG.g + (spB.r - 0.5) * 0.25) * (1.0 - spCliff);
  float fur = 0.5 + 0.5 * sin(vSpW.x * 9.5 + spB.g * 2.2);
  spC = mix(spC, mix(vec3(0.11, 0.07, 0.04), vec3(0.20, 0.13, 0.07), fur) * vFog, field * 0.85);
  spH += (fur - 0.5) * 0.12 * field;
  spC *= 1.0 - spG.b * 0.30;
  float sub = step(1.5, vSurf.w);
  spNoCloud = sub;
  spC *= 1.0 - 0.18 * sub;
  diffuseColor.rgb = spC;
}
`;

let terrainMat: THREE.MeshLambertMaterial | null = null;
/**
 * Geländematerial: Vertexfarben (weiche Übergänge) plus Detailschicht im Fragment-Shader aus kachelbarem Rauschen
 * (großflächige Fleckung, Grasbüschel, Sandrippel, Felsrisse, Klippenschichten, nasse Ufer), Bodenkarte (getretene
 * Erde, Pfade, Felder, Kontaktschatten) und Bump-Mapping. `aSurf` (Gras, Sand, Fels, nass) steuert die Mischung.
 */
export function terrainMaterial(): THREE.MeshLambertMaterial {
  if (terrainMat) return terrainMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    ensureNoiseTextures();
    s.uniforms.uDetail = GFX.uDetail;
    s.uniforms.uGround = GFX.uGround;
    s.uniforms.uMapInv = GFX.uMapInv;
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'attribute vec4 aSurf;\nattribute float aFog;\nvarying vec4 vSurf;\nvarying float vNy;\nvarying float vFog;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSurf = aSurf;\n vNy = normal.y;\n vFog = aFog;');
    patchLit(s);
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform float uDetail;\nuniform sampler2D uGround;\nuniform vec2 uMapInv;\nvarying vec4 vSurf;\nvarying float vNy;\nvarying float vFog;\n' + BUMP_FN + 'void main() {')
      .replace('#include <color_fragment>', TERRAIN_FRAG)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n if (spHk > 0.0) normal = spBump(normal, -vViewPosition, spH, spHk);');
  };
  m.customProgramCacheKey = () => 'spTerrain';
  terrainMat = m;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Wasser
// ---------------------------------------------------------------------------------------------------------------

const WATER_VS = /* glsl */ `
attribute float aFoam;
attribute float aDepth;
attribute float aKind;
varying vec3 vW;
varying vec3 vCol;
varying float vFoam;
varying float vDepth;
varying float vKind;
uniform float uTime;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float wv = sin(p.x * 1.9 + uTime * 1.4) + sin(p.z * 1.5 - uTime * 1.15) + 0.6 * sin((p.x + p.z) * 3.1 + uTime * 2.3);
  p.y += wv * 0.026 * (1.0 - 0.6 * aFoam);
  vW = p;
  vCol = color;
  vFoam = aFoam;
  vDepth = aDepth;
  vKind = aKind;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FS = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoiseN;
uniform vec3 uSunDir;
uniform vec3 uSunIrr;
uniform vec3 uSkyIrr;
uniform vec3 uGndIrr;
uniform vec3 uSkyCol;
uniform vec2 uWindDir;
uniform float uWaterLv;
varying vec3 vW;
varying vec3 vCol;
varying float vFoam;
varying float vDepth;
varying float vKind;
#include <fog_pars_fragment>
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float moat = vKind;
  // zwei gegenläufige Wellenlagen (Gradienten aus der Wassertextur)
  vec2 wd = uWindDir;
  // feine Wellen (Zellen von etwa einem Feld): große Wellenzellen ergäben großflächige Sonnenreflexe wie Wolken
  vec4 n1 = texture2D(uNoiseN, vW.xz * 0.13 + wd * (uTime * 0.035));
  vec4 n2 = texture2D(uNoiseN, vW.xz * 0.29 + vec2(wd.y, -wd.x) * (uTime * 0.05) + 0.37);
  vec2 g = (n1.rg + n2.rg - 1.0) * (1.0 - 0.2 * moat);
  if (uWaterLv > 1.5) {
    vec4 n3 = texture2D(uNoiseN, vW.xz * 0.67 - wd * (uTime * 0.08) + 0.71);
    g += (n3.rg - 0.5) * 0.6;
  }
  vec3 N = normalize(vec3(-g.x * 0.26, 1.0, -g.y * 0.26));
  // Tiefenfarbe aus dem Vertex-Tint, Streulicht von Hemisphäre und Sonne
  vec3 base = vCol;
  base *= 0.92 + 0.16 * n1.b;
  float nl = clamp(dot(N, uSunDir), 0.0, 1.0);
  vec3 irr = mix(uGndIrr, uSkyIrr, 0.5 + 0.5 * N.y) + uSunIrr * nl;
  vec3 col = base * irr * 0.318;
  // Fresnel: flach gesehenes Wasser spiegelt den Himmel (stilisiert)
  float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  fr = 0.03 + 0.97 * fr;
  col = mix(col, uSkyCol * (0.78 + 0.12 * n2.b), clamp(fr * (0.8 + 1.2 * moat), 0.0, 0.42 + 0.16 * moat));
  // Sonnenglanz und Glitzern
  vec3 R = reflect(-V, N);
  float spec = pow(clamp(dot(R, uSunDir), 0.0, 1.0), 220.0);
  col += uSunIrr * spec * (0.22 + 0.2 * moat);
  if (uWaterLv > 1.5) {
    float sp = smoothstep(0.80, 0.96, n1.b * 0.5 + n2.b * 0.5 + (n1.a - 0.5) * 0.6);
    float sh = pow(clamp(dot(R, uSunDir), 0.0, 1.0), 40.0);
    col += uSunIrr * sp * sh * 0.8;
  }
  // Uferschaum: unregelmäßiger Saum und auslaufende Schaumlinien
  float edge = vFoam + (n1.a - 0.5) * 0.34 + 0.08 * sin(vW.x * 5.0 + uTime * 1.6) * sin(vW.z * 4.3 - uTime * 1.1);
  float foam = smoothstep(0.60, 0.92, edge);
  float lines = smoothstep(0.80, 1.0, sin(vFoam * 9.0 - uTime * 0.9 + n2.a * 7.0)) * smoothstep(0.2, 0.7, vFoam) * 0.4;
  float pulse = 0.80 + 0.20 * sin(uTime * 1.9 + vW.x * 1.7 + vW.z * 1.3);
  float fa = clamp(foam * pulse + lines * (1.0 - foam), 0.0, 1.0);
  col = mix(col, vec3(0.88, 0.92, 0.88) * mix(0.55, 0.8, nl), fa * 0.6 * (1.0 - 0.7 * moat));
  float alpha = mix(0.7, 0.96, smoothstep(0.0, 0.8, vDepth));
  alpha = clamp(alpha + fr * 0.25 + fa * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Wasser: animiert = eigener Shader (Normalen, Fresnel, Schaum, Glitzern); sonst flache Lambert-Fläche (Niedrig). */
export function waterMaterial(animated: boolean): THREE.Material {
  if (!animated) {
    return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 1, depthWrite: true });
  }
  ensureNoiseTextures();
  const m = new THREE.ShaderMaterial({
    vertexShader: WATER_VS,
    fragmentShader: WATER_FS,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  // gemeinsame Uniform-Objekte einsetzen, damit GameScene sie zentral steuert
  for (const k of ['uTime', 'uNoiseN', 'uSunDir', 'uSunIrr', 'uSkyIrr', 'uGndIrr', 'uSkyCol', 'uWindDir', 'uWaterLv'] as const) m.uniforms[k] = GFX[k];
  return m;
}
