import * as THREE from 'three';
import { GFX, PART } from './materials';
import { TINT_COUNT, UNIT_TINTS } from './units_style';
import { JOB_ARM_L, JOB_ARM_R, JOB_COUNT } from './unit_jobs';

/**
 * Material und Vertex-Animation der Figuren (ohne Skelett). Erweitert den bisherigen Ansatz um
 *  – Gegenphase von Armen und Beinen, Knie (Oberschenkel + Schienbein), Körperneigung, Wippen und Drehung des Oberkörpers,
 *  – Kopf (Mitgehen, Umsehen im Stand, Blick nach unten bei der Arbeit), Umhang, Mähne/Schweif,
 *  – Arbeits-, Hieb- und Schussbewegungen je nach Stil des Teils (aMeta.z),
 *  – Sichtbarkeit je Instanz (LOD, Haar-/Bart-/Hut-Varianten, Beruf) über aStyle.y/.w und iVar.z/.w,
 *  – Farbvariation je Instanz (Haut, Haar, Stoffe) über die Tonetabelle und iVar.x/.y.
 * Instanzdaten: iAnim (Phase, Flags, Schrittfrequenz, Zyklus/Alter), iVar (Palette, Helligkeit, Sichtbarkeits-Bits, Auswahl-ID).
 */
export const UPART = {
  ...PART,
  /** Umhang: hängt an der Schulter und weht beim Gehen nach hinten */
  Cape: 13,
  /** Kopf: Gegenneigung beim Gehen, Umsehen im Stand */
  Head: 14,
  /** Schienbein/Unterschenkel (Knie-Drehpunkt in aPivot, Hüfthöhe in aStyle.z) */
  ShinL: 15,
  ShinR: 16,
  /** Mähne, Schweif, Helmbusch: flattert */
  Mane: 17,
} as const;

/** Armstile (aMeta.z) für Hieb/Arbeit/Gehen */
export const ARM = {
  /** Hieb von oben (Schwert, Axt), Hacken */
  Slash: 0,
  /** Stoß (Speer, Pike): Arm bleibt, Waffe fährt vor */
  Thrust: 1,
  /** schwerer Schlag (Streitkolben, Hammer): große Ausholbewegung */
  Smash: 2,
  /** Schleudern/Sensen: Kreisbewegung bzw. seitliches Schwingen */
  Sweep: 3,
  /** kurzes, schnelles Klopfen (Meißel, Hammer am Amboss) */
  Tap: 4,
  /** Rühren/Kneten */
  Stir: 5,
  /** Graben/Hacken nach unten */
  Dig: 6,
  /** hält etwas vor dem Körper (Leiter, Korb), kaum Schwingen */
  Hold: 7,
} as const;

const arr = (a: number[]): string => a.join(', ');

const ANIM_PARS = /* glsl */ `
const int JOB_AR[${JOB_COUNT}] = int[${JOB_COUNT}](${arr(JOB_ARM_R)});
const int JOB_AL[${JOB_COUNT}] = int[${JOB_COUNT}](${arr(JOB_ARM_L)});
attribute vec4 aPivot;
attribute vec3 aMeta;
attribute vec4 aStyle;
attribute vec4 iAnim;
attribute vec4 iVar;
uniform float uTime;
uniform float uAo;
uniform vec3 uTint[${TINT_COUNT}];

vec3 spRotX(vec3 p, vec3 c, float a) {
  float s = sin(a); float co = cos(a);
  vec3 d = p - c;
  return c + vec3(d.x, d.y * co - d.z * s, d.y * s + d.z * co);
}
vec3 spRotY(vec3 p, vec3 c, float a) {
  float s = sin(a); float co = cos(a);
  vec3 d = p - c;
  return c + vec3(d.x * co + d.z * s, d.y, -d.x * s + d.z * co);
}
vec3 spRotZ(vec3 p, vec3 c, float a) {
  float s = sin(a); float co = cos(a);
  vec3 d = p - c;
  return c + vec3(d.x * co - d.y * s, d.x * s + d.y * co, d.z);
}
float spSaw(float c, float a, float b) { return clamp((c - a) / (b - a), 0.0, 1.0); }
float spPulse(float c, float a, float b, float d) { return spSaw(c, a, b) * (1.0 - spSaw(c, b, d)); }

vec3 spAnimate(vec3 p) {
  float part = aPivot.w;
  int vm = int(aStyle.y + 0.5);
  int im = int(iVar.z + 0.5);
  if ((im & vm) != vm) return vec3(0.0);
  int sl = int(aStyle.w + 0.5);
  if (sl != 0 && (sl & int(iVar.w + 0.5)) == 0) return vec3(0.0);
  int fl = int(iAnim.y + 0.5);
  float up = aStyle.z;
  float ph = iAnim.x;
  bool isLeg = part > 0.5 && part < 2.5;
  bool isShin = part > 14.5 && part < 16.5;
  if (fl == 0 && part < 0.5 && up == 0.0) return p;

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
  float cw = cyc * 6.2831853;
  bool moving = (fl & 1) != 0;
  bool melee = (fl & 2) != 0;
  bool shoot = (fl & 4) != 0;
  bool work = (fl & 8) != 0;
  bool idle = fl == 0;
  float sw = sin(wt);
  int st = int(aMeta.z + 0.5);
  if (st >= 9) {
    // Bauern: Armstil folgt dem Beruf (Bits 16..20 von iVar.x)
    int jb = (int(iVar.x + 0.5) >> 16) & 31;
    st = st == 9 ? JOB_AR[jb] : JOB_AL[jb];
  }
  vec3 c = aPivot.xyz;
  vec3 q = p;
  int pi = int(part + 0.5);

  // ---- Teilbewegung (um den eigenen Drehpunkt)
  if (pi == 1 || pi == 2) {
    float s = pi == 1 ? 1.0 : -1.0;
    if (moving) q = spRotX(p, c, s * sw * 0.66);
  } else if (pi == 15 || pi == 16) {
    // Schienbein: Knie beugt sich in der Schwungphase, dann folgt die Drehung der Hüfte
    float s = pi == 15 ? 1.0 : -1.0;
    if (moving) {
      float kf = max(0.0, -s * cos(wt)) * 0.95;
      vec3 hip = vec3(c.x, aStyle.z, c.z);
      q = spRotX(p, c, kf);
      q = spRotX(q, hip, s * sw * 0.66);
    }
  } else if (pi == 3) {
    if (melee) {
      if (st == 1) {
        float z = -0.1 * spSaw(cyc, 0.0, 0.5);
        z = mix(z, 0.3, spSaw(cyc, 0.5, 0.6));
        z = mix(z, 0.0, spSaw(cyc, 0.6, 1.0));
        q = p + vec3(0.0, 0.0, z);
      } else if (st == 2) {
        float a = mix(0.0, -2.95, spSaw(cyc, 0.0, 0.58));
        a = mix(a, -0.05, spSaw(cyc, 0.58, 0.7));
        a = mix(a, 0.0, spSaw(cyc, 0.7, 1.0));
        q = spRotX(p, c, a);
      } else {
        float a = mix(0.0, -2.7, spSaw(cyc, 0.0, 0.5));
        a = mix(a, -0.15, spSaw(cyc, 0.5, 0.64));
        a = mix(a, 0.0, spSaw(cyc, 0.64, 1.0));
        q = spRotX(p, c, a);
      }
    } else if (shoot) {
      if (st == 3) {
        // Schleuder: Arm kreist über dem Kopf
        q = spRotX(p, c, -2.6);
        q = spRotZ(q, c, sin(cw * 2.0) * 0.5);
      } else {
        float pull = spSaw(cyc, 0.0, 0.7) * (1.0 - step(0.72, cyc));
        q = spRotX(p, c, -1.45);
        q.z -= 0.13 * pull;
      }
    } else if (work) {
      if (st == 2) q = spRotX(p, c, -1.0 - 1.15 * (0.5 - 0.5 * cos(cw)));
      else if (st == 3) {
        q = spRotX(p, c, -0.95);
        q = spRotY(q, c, sin(cw) * 0.75);
      } else if (st == 4) q = spRotX(p, c, -1.05 + 0.32 * sin(cw * 3.0));
      else if (st == 5) {
        q = spRotX(p, c, -1.0 + 0.22 * sin(cw));
        q = spRotZ(q, c, 0.3 * cos(cw));
      } else if (st == 6) q = spRotX(p, c, -0.4 - 1.3 * spPulse(cyc, 0.0, 0.5, 0.8));
      else if (st == 7) q = spRotX(p, c, -0.85);
      else q = spRotX(p, c, -1.25 + sin(cw) * 0.95);
    } else if (moving) {
      if (st == 7) q = spRotX(p, c, -0.85);
      else if (st == 1) q = spRotX(p, c, sw * 0.18);
      else q = spRotX(p, c, sw * 0.58);
    }
  } else if (pi == 4) {
    if (shoot) q = spRotX(p, c, -1.45);
    else if (melee) q = spRotX(p, c, -0.62 - 0.12 * sin(cw));
    else if (work) {
      if (st == 7) q = spRotX(p, c, -0.85);
      else q = spRotX(p, c, -0.95 - sin(cw) * 0.45);
    } else if (moving) {
      if (st == 7) q = spRotX(p, c, -0.85);
      else if (st == 1) q = spRotX(p, c, -0.25 - sw * 0.12);
      else q = spRotX(p, c, -sw * 0.58);
    }
  } else if (pi == 5) {
    if (shoot) {
      q = spRotX(p, c, -1.45);
      vec3 hand = spRotX(c + vec3(0.0, -0.27, 0.0), c, -1.45);
      q = spRotX(q, hand, 1.35);
    } else if (moving) {
      q = spRotX(p, c, -sw * 0.58);
    }
  } else if (pi == 6) {
    if (moving) q = spRotX(p, c, wt * 0.8 * (0.18 / max(c.y, 0.06)));
  } else if (pi == 7) {
    if (shoot || melee) {
      float a = mix(0.0, 1.05, spSaw(cyc, 0.0, 0.7));
      a = mix(a, -1.15, spSaw(cyc, 0.7, 0.78));
      a = mix(a, 0.0, spSaw(cyc, 0.78, 1.0));
      q = spRotX(p, c, a);
    }
  } else if (pi == 8) {
    if (shoot || melee) {
      float z = mix(0.0, -0.4, spSaw(cyc, 0.0, 0.6));
      z = mix(z, 0.3, spSaw(cyc, 0.6, 0.72));
      z = mix(z, 0.0, spSaw(cyc, 0.72, 1.0));
      q = p + vec3(0.0, 0.0, z);
    }
  } else if (pi == 10) {
    float sp = work ? 0.9 : 0.14;
    q = spRotZ(p, c, uTime * sp + ph * 6.2831853);
  } else if (pi == 11) {
    vec3 d = p - c;
    float k = length(d.xz);
    q = p + vec3(sin(uTime * 4.0 + d.z * 9.0 + ph * 6.28) * 0.2 * k, 0.0, 0.0);
  } else if (pi == 12) {
    q = p + vec3(0.0, 1.7 * iAnim.w, 0.0);
  } else if (pi == 13) {
    // Umhang: hängt an der Schulter, weht beim Gehen nach hinten
    float a = 0.05 + 0.03 * sin(uTime * 1.3 + ph * 6.28);
    if (moving) a = 0.3 + 0.12 * sin(wt * 2.0);
    else if (melee || work) a = 0.12;
    q = spRotX(p, c, a);
    vec3 d = p - c;
    q.x += sin(uTime * 3.0 + d.y * 8.0 + ph * 6.28) * 0.012 * clamp(-d.y * 3.0, 0.0, 1.0) * (moving ? 2.0 : 1.0);
  } else if (pi == 14) {
    if (moving) q = spRotX(p, c, -0.07 + 0.035 * sin(wt * 2.0));
    else if (work) q = spRotX(p, c, 0.28 + 0.1 * sin(cw));
    else if (shoot) q = spRotX(p, c, 0.05);
    else if (melee) q = spRotX(p, c, 0.1 * spPulse(cyc, 0.45, 0.6, 0.9));
    else {
      float look = sin(uTime * 0.55 + ph * 17.0) * sin(uTime * 0.31 + ph * 5.0);
      q = spRotY(p, c, look * 0.7);
    }
  } else if (pi == 17) {
    vec3 d = p - c;
    float k = clamp(length(d) * 4.0, 0.0, 1.0);
    float amp = moving ? 1.0 : 0.25;
    q = p + vec3(sin(uTime * 7.0 + d.z * 11.0 + ph * 6.28) * 0.02 * k * amp, cos(uTime * 6.0 + d.y * 9.0) * 0.012 * k * amp, 0.0);
  }

  // ---- Körperbewegung: Oberkörper neigt/dreht sich um die Hüfte, ganzer Körper wippt
  vec3 off = vec3(0.0);
  if (up != 0.0 && !isLeg && !isShin) {
    float hipY = abs(up);
    vec3 hip = vec3(0.0, hipY, 0.0);
    float lean = 0.0;
    float twist = 0.0;
    if (up > 0.0) {
      if (moving) { lean = 0.08; twist = 0.1 * sw; }
      if (melee) lean += 0.2 * spPulse(cyc, 0.45, 0.6, 0.85) - 0.1 * spPulse(cyc, 0.0, 0.4, 0.5);
      if (shoot) lean = -0.06 - 0.04 * spSaw(cyc, 0.0, 0.7);
      if (work) lean = 0.1 + 0.2 * (0.5 - 0.5 * cos(cw));
      if (idle) off.y += 0.004 * sin(uTime * 1.7 + ph * 6.28);
    } else if (moving) {
      lean = 0.05 * sin(wt * 2.0);
    }
    if (lean != 0.0 || twist != 0.0) {
      q = spRotY(q, hip, twist);
      q = spRotX(q, hip, lean);
    }
  }
  if ((fl & 64) == 0) {
    if (moving) off.y += abs(sw) * (up < 0.0 ? 0.03 : 0.024);
    if (melee) off.z += 0.07 * spPulse(cyc, 0.45, 0.6, 0.9);
    if (work) off.y -= 0.02 * abs(sin(cw * 0.5));
  }
  return q + off;
}
`;

const COLOR_VERTEX = /* glsl */ `
vec3 base = color.rgb;
int tcl = int(aStyle.x + 0.5);
if (tcl > 0) {
  int pk = int(iVar.x + 0.5);
  vec3 tn;
  if (tcl == 1) tn = uTint[pk & 7];
  else if (tcl == 2) tn = uTint[8 + ((pk >> 3) & 7)];
  else if (tcl == 3) tn = uTint[16 + ((pk >> 6) & 31)];
  else tn = uTint[16 + ((pk >> 11) & 31)];
  base = color.rgb * tn;
}
#ifdef USE_INSTANCING_COLOR
  base = mix(base, instanceColor.rgb * color.r, aMeta.x);
#endif
base *= (iVar.y > 0.0 ? iVar.y : 1.0);
vColor = base * mix(1.0, aMeta.y, uAo);
`;

const uTintUniform = { value: UNIT_TINTS };

function patch(shader: THREE.WebGLProgramParametersWithUniforms, color: boolean): void {
  shader.uniforms.uTime = GFX.uTime;
  shader.uniforms.uAo = GFX.uAo;
  shader.uniforms.uTint = uTintUniform;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', ANIM_PARS + '\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = spAnimate(transformed);');
  if (color) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', COLOR_VERTEX);
}

let mat: THREE.MeshLambertMaterial | null = null;
/** Gemeinsames Material aller Figuren: Vertexfarben mit Farbklassen, Teamfarbe, Bodenverdunklung, Vertex-Animation */
export function unitMaterial(): THREE.MeshLambertMaterial {
  if (mat) return mat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (s) => patch(s, true);
  m.customProgramCacheKey = () => 'spUnitLambert';
  mat = m;
  return m;
}

let depth: THREE.MeshDepthMaterial | null = null;
/** Schattenmaterial mit derselben Animation und Sichtbarkeit, damit Schatten zur Pose passen */
export function unitDepthMaterial(): THREE.MeshDepthMaterial {
  if (depth) return depth;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (s) => patch(s, false);
  m.customProgramCacheKey = () => 'spUnitDepth';
  depth = m;
  return m;
}
