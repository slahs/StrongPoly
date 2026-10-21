import * as THREE from 'three';
import { GFX, ensureNoiseTextures } from '../materials';
import type { AssetMaterials } from '../assets/materials';
import type { MaterialDef } from '../assets/manifest';
import { ENVU, patchHemiK } from './uniforms';

/**
 * Materialien der Vegetation und Umgebungs-Requisiten (Stil medieval). Je Bibliotheksmaterial EIN MeshStandardMaterial
 * (+ Schattenmaterial), geteilt von allen Vegetations-Assets; Texturen aus der Materialbibliothek (AssetMaterials).
 *
 * Datenfarbe aData (COLOR_0, siehe assets/blender/lib/sp/veg.py): R AO, G Biegsamkeit (Felsen: Moos), B Zufall je
 * Zweig/Karte/Halm, A Durchlicht (Laub/Flora) bzw. Birkenrinde (M_Bark).
 *
 *  - Wind: bestehendes Schwanken (uTime/uWind/uWindDir/uTreeSway wie materials.ts spSway) – ganze Pflanze biegt sich mit
 *    dem Quadrat der Biegsamkeit, Äste schwingen phasenversetzt (aData.b), Blätter/Halme flattern; Schatten schwanken mit
 *  - Laub (M_Foliage, M_Foliage_Conifer): Alpha-Test (kein Blending) auch im Schattenpass, Alpha-Erhalt in den Mipmaps,
 *    Kronennormalen werden auf Rückseiten NICHT umgedreht (weiche Krone), Durchlicht (Sonne von hinten, mit Schatten)
 *  - M_Flora (Gras, Blumen, Farn): Palettenatlas ohne Alpha, Durchlicht, Ausblenden am Rand des Grasradius
 *  - Rinde/Holz/Fels: Weltmaß-UVs (Kachelgröße zur Laufzeit korrigiert: uUvScale = tile beim Export / tile jetzt),
 *    Birkenrinde (weiß mit dunklen Korkporen) aus aData.a, Moos auf Felsen (Oberseiten + aData.g)
 *  - AO aus aData.r auf indirektes Licht voll, auf direktes teilweise; Himmelslicht aus scene.environment (uHemiK)
 * Fehlen Texturen (z. B. M_Foliage vor dem Material-Merge), erzeugt die Laufzeit einen einfachen Ersatzatlas (Canvas),
 * damit Karten nie als undurchsichtige Vierecke erscheinen.
 */

export type VegKind = 'solid' | 'leaf' | 'flora';

const SWAY = /* glsl */ `
attribute vec4 aData;
uniform float uTime;
uniform float uWind;
uniform float uTreeSway;
uniform vec2 uWindDir;
uniform vec2 uUvScale;
uniform float uSwayAmp;
uniform vec4 uGrassFade;
varying vec4 vData;
varying vec3 vSpW;
vec3 spVegSway( vec3 p ) {
  #ifdef USE_INSTANCING
    vec3 ip = vec3( instanceMatrix[ 3 ] );
    float flex = aData.g;
    #ifdef SP_ROCK
      flex = 0.0;
    #endif
    float k = flex * flex;
    float ph = ip.x * 0.31 + ip.z * 0.23;
    float w = sin( uTime * 1.05 + ph ) + 0.45 * sin( uTime * 2.2 + ph * 1.7 );
    float gust = 0.5 + 0.5 * sin( uTime * 0.33 + dot( ip.xz, uWindDir ) * 0.11 );
    vec3 d = vec3( uWindDir.x, 0.0, uWindDir.y ) * ( w * 0.45 + 0.6 * gust ) * uSwayAmp * k;
    // Äste: eigene Phase je Zweig
    float bph = aData.b * 6.2831;
    d += vec3( sin( uTime * 1.9 + bph + ph ), 0.0, cos( uTime * 1.6 + bph ) ) * uSwayAmp * 0.28 * k * ( 0.4 + 0.6 * gust );
    #ifdef SP_LEAF
      // Flattern der Blätter/Halme (klein, schnell)
      d += vec3( sin( uTime * 6.3 + bph * 3.0 + p.y * 7.0 ), sin( uTime * 7.1 + bph * 5.0 ) * 0.6, cos( uTime * 5.7 + bph * 4.0 + p.x * 6.0 ) ) * uSwayAmp * 0.12 * flex * aData.a;
    #endif
    d *= uWind * uTreeSway;
    mat3 m = mat3( instanceMatrix );
    vec3 s2 = vec3( dot( m[ 0 ], m[ 0 ] ), dot( m[ 1 ], m[ 1 ] ), dot( m[ 2 ], m[ 2 ] ) );
    vec3 q = p + ( transpose( m ) * d ) / s2;
    #ifdef SP_FADE
      // Gras/Blumen schrumpfen am Rand des Sichtradius (kein harter Rand beim Nachladen)
      float fd = distance( ip.xz, uGrassFade.xy );
      q *= 1.0 - smoothstep( uGrassFade.z, uGrassFade.w, fd );
    #endif
    return q;
  #else
    return p;
  #endif
}
`;

const VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
vData = aData;
transformed = spVegSway( transformed );
`;

const VERT_UV = /* glsl */ `
#include <uv_vertex>
#ifdef USE_MAP
  vMapUv *= uUvScale;
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv *= uUvScale;
#endif
#ifdef USE_AOMAP
  vAoMapUv *= uUvScale;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv *= uUvScale;
#endif
#ifdef USE_METALNESSMAP
  vMetalnessMapUv *= uUvScale;
#endif
`;

const WORLD = /* glsl */ `
#include <project_vertex>
{
  vec4 spw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    spw = instanceMatrix * spw;
  #endif
  vSpW = ( modelMatrix * spw ).xyz;
}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uNoiseA;
uniform float uAo;
uniform float uTrans;
uniform float uBirch;
uniform float uMoss;
uniform vec2 uTexSize;
varying vec4 vData;
varying vec3 vSpW;
`;

/** Durchlicht: Sonne von hinten durch dünnes Laub (mit Schatten, da directLight.color bereits verschattet ist) */
const TRANS_FN = /* glsl */ `
#include <lights_physical_pars_fragment>
float spTrans = 0.0;
void spRE_Direct( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  if ( spTrans > 0.0 ) {
    float back = saturate( dot( - geometryNormal, directLight.direction ) * 0.6 + 0.4 );
    float fwd = pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 3.0 );
    reflectedLight.directDiffuse += directLight.color * material.diffuseColor * spTrans * ( back * 0.22 + fwd * 0.55 ) * RECIPROCAL_PI * 2.0;
  }
}
#undef RE_Direct
#define RE_Direct spRE_Direct
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
#ifdef SP_SOLID
  if ( uBirch > 0.5 && vData.a > 0.01 ) {
    // Birkenrinde: kalkweiß, quer liegende dunkle Korkporen (Lentizellen), oben glatter
    #ifdef USE_MAP
      vec2 spBuv = vMapUv;
    #else
      vec2 spBuv = vec2( vSpW.x + vSpW.z, vSpW.y );
    #endif
    vec4 bn = texture2D( uNoiseA, vec2( spBuv.x * 0.9, spBuv.y * 5.5 ) * 0.5 );
    float lent = smoothstep( 0.66, 0.8, bn.g ) * smoothstep( 0.3, 0.6, bn.r );
    vec3 white = vec3( 0.74, 0.72, 0.67 ) * ( 0.9 + 0.2 * bn.b );
    vec3 bc = mix( white, vec3( 0.06, 0.055, 0.05 ), lent * 0.85 );
    diffuseColor.rgb = mix( diffuseColor.rgb, bc, clamp( vData.a, 0.0, 1.0 ) );
  }
  if ( uMoss > 0.5 ) {
    // Moos/Flechten auf Felsen: Oberseiten + gebackener Moosanteil, fleckig
    vec4 mn = texture2D( uNoiseA, vSpW.xz * 0.9 + vSpW.y * 0.3 );
    float mk = clamp( vData.g * 1.2 + ( mn.r - 0.55 ) * 0.9, 0.0, 1.0 );
    vec3 moss = mix( vec3( 0.07, 0.085, 0.03 ), vec3( 0.16, 0.17, 0.07 ), mn.b );
    diffuseColor.rgb = mix( diffuseColor.rgb, moss, mk * 0.85 );
  }
#endif
`;

const FRAG_ALPHA = /* glsl */ `
#ifdef USE_MAP
{
  // Alpha-Erhalt in kleinen Mipmaps: Laub dünnt in der Ferne sonst aus
  vec2 spT = vMapUv * uTexSize;
  vec2 spDx = dFdx( spT );
  vec2 spDy = dFdy( spT );
  float spMip = max( 0.0, 0.5 * log2( max( dot( spDx, spDx ), dot( spDy, spDy ) ) ) );
  diffuseColor.a *= 1.0 + spMip * 0.3;
}
#endif
#include <alphatest_fragment>
`;

const FRAG_NORMAL_BEGIN = /* glsl */ `
#include <normal_fragment_begin>
#if defined( DOUBLE_SIDED ) && defined( SP_LEAF )
  // Kronen-/Halmnormalen gelten für beide Seiten (weiche Beleuchtung statt dunkler Rückseiten)
  normal *= faceDirection;
  #if defined( USE_NORMALMAP_TANGENTSPACE )
    tbn[ 0 ] *= faceDirection;
    tbn[ 1 ] *= faceDirection;
  #endif
#endif
`;

const FRAG_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
#ifdef SP_LEAF
  // Laub/Gras: matt (kein bläulicher Himmelsglanz auf den Blättern)
  roughnessFactor = max( roughnessFactor, 0.82 );
#endif
`;

const FRAG_AO = /* glsl */ `
#include <aomap_fragment>
#ifdef SP_LEAF
  reflectedLight.indirectSpecular *= 0.45;
  reflectedLight.directSpecular *= 0.6;
#endif
{
  float spAO = mix( 1.0, clamp( vData.r, 0.0, 1.0 ), uAo );
  reflectedLight.indirectDiffuse *= spAO;
  reflectedLight.indirectSpecular *= spAO;
  reflectedLight.directDiffuse *= mix( 1.0, spAO, 0.4 );
}
`;

const FRAG_TRANS_SET = /* glsl */ `
#ifdef SP_LEAF
  spTrans = uTrans * clamp( vData.a, 0.0, 1.0 );
#endif
#include <lights_physical_fragment>
`;

/** Ersatzatlas (Canvas), falls eine Laub-/Flora-Textur fehlt: grobe Blattbüschel bzw. Farbpalette – nur Rückfall */
function fallbackTexture(name: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  let seed = 1234;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (name === 'M_Flora') {
    // Palette: Spalten = Farben (siehe assets/blender/tools/veg_textures.py: PALETTE)
    const cols = ['#4f6b2a', '#6f8a3a', '#8ea24a', '#a9a65a', '#c2b26b', '#3f5a24', '#5d7a30', '#f2efe2', '#e8c63a', '#d06a8e', '#8a6fc8', '#c8452e', '#6a8fd0', '#e9e2c8', '#7c5a3a', '#2f4a20'];
    cols.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect((i * S) / 16, 0, S / 16 + 1, S);
    });
  } else {
    g.clearRect(0, 0, S, S);
    const cells = name === 'M_Foliage_Conifer' ? [[0, 0, S, S]] : [[0, 0, S / 2, S / 2], [S / 2, 0, S / 2, S / 2], [0, S / 2, S / 2, S / 2], [S / 2, S / 2, S / 2, S / 2]];
    for (const [x0, y0, w, h] of cells) {
      const conifer = name === 'M_Foliage_Conifer';
      g.strokeStyle = '#3a2a1a';
      g.lineWidth = conifer ? 2 : 1.5;
      g.beginPath();
      g.moveTo(x0 + w / 2, y0 + h);
      g.lineTo(x0 + w / 2, y0 + h * 0.06);
      g.stroke();
      const n = conifer ? 260 : 70;
      for (let i = 0; i < n; i++) {
        const t = rnd();
        const cx = x0 + w / 2 + (rnd() - 0.5) * w * (conifer ? 0.75 * (1 - t * 0.6) : 0.8) * (0.4 + t * 0.6);
        const cy = y0 + h * (0.06 + 0.88 * t);
        const l = conifer ? 0.08 * w : (0.07 + 0.06 * rnd()) * w;
        const a = rnd() * Math.PI;
        const v = 0.7 + 0.5 * rnd();
        g.fillStyle = conifer ? `rgb(${Math.round(38 * v)},${Math.round(62 * v)},${Math.round(30 * v)})` : `rgb(${Math.round(58 * v)},${Math.round(92 * v)},${Math.round(34 * v)})`;
        g.beginPath();
        g.ellipse(cx, cy, l, conifer ? l * 0.12 : l * 0.45, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const LEAF_MATS = new Set(['M_Foliage', 'M_Foliage_Conifer']);

/** Art des Vegetationsmaterials nach Bibliotheksnamen */
export function vegKindOf(name: string): VegKind {
  if (LEAF_MATS.has(name)) return 'leaf';
  if (name === 'M_Flora') return 'flora';
  return 'solid';
}

/** Windamplitude (Einheiten bei Biegsamkeit 1) je Art */
const SWAY_AMP: Record<VegKind, number> = { solid: 0.07, leaf: 0.07, flora: 0.06 };

/** Vegetationsmaterialien (eine Instanz je Seite/Renderer) */
export class VegMaterials {
  private mats = new Map<string, { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }>();
  private fallbacks = new Map<string, THREE.Texture | null>();
  alphaToCoverage = false;

  constructor(private lib: AssetMaterials) {}

  /** Material + Schattenmaterial eines Bibliotheksnamens; uvScale = tile beim Export / tile jetzt; fade = Gras-Ausblendung */
  get(name: string, uvScale = 1, fade = false): { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
    const key = `${name}|${uvScale.toFixed(4)}|${fade ? 1 : 0}`;
    const have = this.mats.get(key);
    if (have) return have;
    ensureNoiseTextures();
    const d: MaterialDef = this.lib.defs[name] ?? { base: '#808070', rough: 0.85, metal: 0, tile: 1, dirt: '#303020', maps: {} };
    const kind = vegKindOf(name);
    let map = this.lib.texture(name, 'albedo');
    if (!map && kind !== 'solid') {
      if (!this.fallbacks.has(name)) this.fallbacks.set(name, fallbackTexture(name));
      map = this.fallbacks.get(name) ?? null;
    }
    const nrm = this.lib.texture(name, 'normal');
    const orm = this.lib.texture(name, 'orm');
    const leaf = kind !== 'solid';
    const alpha = kind === 'leaf';
    const m = new THREE.MeshStandardMaterial({
      name: `veg:${name}`,
      color: map ? 0xffffff : new THREE.Color(d.base),
      map,
      normalMap: nrm,
      aoMap: orm,
      roughnessMap: orm,
      metalnessMap: null,
      roughness: orm ? 1 : d.rough,
      metalness: 0,
      side: leaf || d.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      alphaTest: alpha ? (d.alphaTest ?? 0.5) : 0,
      envMapIntensity: 1,
    });
    if (nrm) m.normalScale.set(leaf ? 0.6 : 1, leaf ? 0.6 : 1);
    m.alphaToCoverage = alpha && this.alphaToCoverage;
    const img = map?.image as { width?: number; height?: number } | undefined;
    const uni = {
      uUvScale: { value: new THREE.Vector2(uvScale, uvScale) },
      uSwayAmp: { value: SWAY_AMP[kind] },
      uBirch: { value: name === 'M_Bark' ? 1 : 0 },
      uMoss: { value: name === 'M_Rock' ? 1 : 0 },
      uTexSize: { value: new THREE.Vector2(img?.width ?? 512, img?.height ?? 512) },
    };
    const defs = (kind === 'solid' ? '#define SP_SOLID\n' : '#define SP_LEAF\n') + (name === 'M_Rock' ? '#define SP_ROCK\n' : '') + (fade ? '#define SP_FADE\n' : '');
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = GFX.uTime;
      s.uniforms.uWind = GFX.uWind;
      s.uniforms.uTreeSway = GFX.uTreeSway;
      s.uniforms.uWindDir = GFX.uWindDir;
      s.uniforms.uNoiseA = GFX.uNoiseA;
      s.uniforms.uAo = GFX.uAo;
      s.uniforms.uTrans = ENVU.uTrans;
      s.uniforms.uGrassFade = ENVU.uGrassFade;
      Object.assign(s.uniforms, uni);
      patchHemiK(s);
      s.vertexShader =
        defs +
        s.vertexShader
          .replace('void main() {', SWAY + 'void main() {')
          .replace('#include <uv_vertex>', VERT_UV)
          .replace('#include <begin_vertex>', VERT_BEGIN)
          .replace('#include <project_vertex>', WORLD);
      s.fragmentShader =
        defs +
        s.fragmentShader
          .replace('void main() {', FRAG_PARS + 'void main() {')
          .replace('#include <lights_physical_pars_fragment>', TRANS_FN)
          .replace('#include <color_fragment>', FRAG_COLOR)
          .replace('#include <alphatest_fragment>', FRAG_ALPHA)
          .replace('#include <normal_fragment_begin>', FRAG_NORMAL_BEGIN)
          .replace('#include <lights_physical_fragment>', FRAG_TRANS_SET)
          .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
          .replace('#include <aomap_fragment>', FRAG_AO);
    };
    m.customProgramCacheKey = () => `spVeg:${kind}:${name === 'M_Rock' ? 1 : 0}:${fade ? 1 : 0}`;
    // Schatten: gleiche Windbewegung, Alpha-Test mit derselben Karte (schließt die Lücke „Laub-Alpha im Schattenpass“)
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: alpha ? map : null, alphaTest: alpha ? (d.alphaTest ?? 0.5) : 0, side: leaf ? THREE.DoubleSide : THREE.FrontSide });
    dm.onBeforeCompile = (s) => {
      s.uniforms.uTime = GFX.uTime;
      s.uniforms.uWind = GFX.uWind;
      s.uniforms.uTreeSway = GFX.uTreeSway;
      s.uniforms.uWindDir = GFX.uWindDir;
      s.uniforms.uGrassFade = ENVU.uGrassFade;
      s.uniforms.uUvScale = uni.uUvScale;
      s.uniforms.uSwayAmp = uni.uSwayAmp;
      s.vertexShader = defs + s.vertexShader.replace('void main() {', SWAY + 'void main() {').replace('#include <begin_vertex>', VERT_BEGIN);
      s.fragmentShader = s.fragmentShader.replace('void main() {', 'varying vec4 vData;\nvarying vec3 vSpW;\nvoid main() {');
    };
    dm.customProgramCacheKey = () => `spVegDepth:${kind}:${fade ? 1 : 0}`;
    const rec = { mat: m, depth: dm };
    this.mats.set(key, rec);
    return rec;
  }

  /** Programme/Materialien neu aufbauen (z. B. Kantenglättung/Alpha-to-Coverage geändert) */
  invalidate(): void {
    for (const r of this.mats.values()) {
      r.mat.alphaToCoverage = r.mat.alphaTest > 0 && this.alphaToCoverage;
      r.mat.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const r of this.mats.values()) {
      r.mat.dispose();
      r.depth.dispose();
    }
    this.mats.clear();
    for (const t of this.fallbacks.values()) t?.dispose();
    this.fallbacks.clear();
  }
}
