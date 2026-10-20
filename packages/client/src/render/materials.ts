import * as THREE from 'three';

/** Gemeinsame Shader-Uniforms (werden jeden Frame von GameScene gesetzt). */
export const GFX = {
  uTime: { value: 0 },
  /** Stärke der eingebackenen Ambient Occlusion 0..1 */
  uAo: { value: 0.85 },
  /** Windstärke für Gras */
  uWind: { value: 1 },
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

const COLOR_VERTEX = /* glsl */ `
vColor = color.rgb;
#ifdef USE_INSTANCING_COLOR
  vColor = mix(vColor, instanceColor.rgb, aMeta.x);
#endif
vColor *= mix(1.0, aMeta.y, uAo);
`;

function patchAnim(shader: THREE.WebGLProgramParametersWithUniforms, color: boolean): void {
  shader.uniforms.uTime = GFX.uTime;
  shader.uniforms.uAo = GFX.uAo;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', ANIM_PARS + '\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = spAnimate(transformed);');
  if (color) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', COLOR_VERTEX);
}

let animMat: THREE.MeshLambertMaterial | null = null;
/** Gemeinsames Material für alle animierten/instanzierten Modelle (Vertexfarben, Teamfarbe, AO, Vertex-Animation). */
export function animMaterial(): THREE.MeshLambertMaterial {
  if (animMat) return animMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (s) => patchAnim(s, true);
  m.customProgramCacheKey = () => 'spAnimLambert';
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
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'attribute vec3 aMeta;\nuniform float uAo;\nvoid main() {')
      .replace('#include <color_vertex>', COLOR_VERTEX);
  };
  m.customProgramCacheKey = () => 'spStaticLambert';
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

let grassMat: THREE.MeshLambertMaterial | null = null;
/** Gras: Büschel wiegen sich im Wind (Vertex-Shader, Auslenkung wächst mit der Höhe). */
export function grassMaterial(): THREE.MeshLambertMaterial {
  if (grassMat) return grassMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = GFX.uTime;
    s.uniforms.uWind = GFX.uWind;
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'uniform float uTime;\nuniform float uWind;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `
        {
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float k = clamp(transformed.y * 3.2, 0.0, 1.0);
          float w = sin(uTime * 1.7 + ip.x * 0.75 + ip.z * 0.55) + 0.5 * sin(uTime * 3.1 + ip.x * 1.9 - ip.z * 1.3);
          transformed.x += w * 0.07 * k * k * uWind;
          transformed.z += cos(uTime * 1.3 + ip.x * 0.6) * 0.045 * k * k * uWind;
        }
        #include <project_vertex>`,
      );
  };
  m.customProgramCacheKey = () => 'spGrass';
  grassMat = m;
  return m;
}

/** Wasser: Wellen per Vertex-Displacement, Farbspiel und Uferschaum über das Attribut aFoam. */
export function waterMaterial(animated: boolean): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    opacity: animated ? 0.9 : 1,
    depthWrite: !animated,
  });
  if (animated) {
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = GFX.uTime;
      s.vertexShader = s.vertexShader
        .replace(
          'void main() {',
          `attribute float aFoam;
           varying float vFoam;
           varying vec2 vWp;
           uniform float uTime;
           void main() {`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vFoam = aFoam;
           vWp = position.xz;
           float wv = sin(position.x * 1.9 + uTime * 1.4) + sin(position.z * 1.5 - uTime * 1.15) + 0.6 * sin((position.x + position.z) * 3.1 + uTime * 2.3);
           transformed.y += wv * 0.028 * (1.0 - 0.6 * aFoam);`,
        );
      s.fragmentShader = s.fragmentShader
        .replace(
          'void main() {',
          `varying float vFoam;
           varying vec2 vWp;
           uniform float uTime;
           void main() {`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           {
             float rip = sin(vWp.x * 2.3 + uTime * 0.9) * sin(vWp.y * 2.1 - uTime * 0.7);
             diffuseColor.rgb *= 1.0 + 0.07 * rip;
             float edge = vFoam + 0.16 * sin(vWp.x * 5.0 + uTime * 1.6) * sin(vWp.y * 4.3 - uTime * 1.1);
             float foam = smoothstep(0.62, 0.9, edge);
             float pulse = 0.78 + 0.22 * sin(uTime * 2.0 + vWp.x * 1.7 + vWp.y * 1.3);
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 0.93), foam * pulse * 0.9);
             diffuseColor.a = max(diffuseColor.a, foam * 0.92);
           }`,
        );
    };
    m.customProgramCacheKey = () => 'spWater';
  }
  return m;
}
