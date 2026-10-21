import * as THREE from 'three';
import { GFX, WORLD_POS, ensureNoiseTextures } from '../materials';
import type { QualityCfg } from '../quality';
import type { AssetMaterials } from '../assets/materials';
import { ENVU, patchHemiK } from './uniforms';
import { CROSS_MAX } from './envmap';

/**
 * Geländematerial des Stils medieval (Teilschritt 5): PBR (MeshStandard) mit den Bodenmaterialien der Bibliothek
 * (M_Ground_Grass, M_Ground_Dirt, M_Ground_Path, M_Rock) als Textur-Arrays (je Karte EIN Sampler für vier Schichten –
 * Safari/WebGL2 hat nur 16 Textureinheiten), Weltmaß-UVs (tile aus der Bibliothek), Klippen seitlich projiziert.
 *
 * Mischung je Pixel:
 *  - Grundgewichte aus dem Terrain (aSurf: Gras/Sand/Fels/nass) + Rauschflecken (trockene Stellen, Moos/Erde)
 *  - Bodenkarte (getretene Erde um Gebäude, Felder), Umgebungskarte (Wege mit ausgefransten Rändern, Grasstreifen in der
 *    Mitte von Karrenwegen, Fahrspuren als Rillen, Laubstreu unter Bäumen)
 *  - höhenbasierte Übergänge: Höhe der Texturen (ORM.a) + Gewicht, scharf abgeschnitten (Erde in den Fugen, Gras darüber)
 *  - gegen Kachelwiederholung: großräumige Helligkeits-/Farbvariation, auf Hoch zweite gedrehte/skalierte Abtastung
 *  - Rückfall ohne Texturen: prozedurale Schichten aus den Grundfarben der Bibliothek und Rauschen
 * Kriegsnebel/Tönung kommen weiter aus der Vertexfarbe (TerrainRenderer), Kartenrand blendet in die Nebelfarbe.
 */

export const TERRAIN_LAYERS = ['M_Ground_Grass', 'M_Ground_Dirt', 'M_Ground_Path', 'M_Rock'] as const;

/** Farbabstimmung je Schicht (Multiplikator auf die Bibliothekstextur): Gras, Erde, Weg, Fels */
export const LAYER_TINT: [number, number, number][] = [
  [1.0, 1.07, 0.88],
  [0.95, 0.9, 0.84],
  [0.86, 0.74, 0.58],
  [1.0, 1.0, 1.0],
];

/** Kantenlänge der Gelände-Texturarrays je Grafikstufe */
export function terrainTexSize(q: Pick<QualityCfg, 'assetTexMax'>): number {
  return Math.min(1024, q.assetTexMax);
}

const VERT_PARS = /* glsl */ `
attribute vec4 aSurf;
attribute vec2 aMed;
varying vec4 vSurf;
varying vec2 vMed;
varying float vNy;
varying vec3 vSpW;
`;

const FRAG_PARS = /* glsl */ `
#define SP_CROSS_MAX ${CROSS_MAX.toFixed(1)}
uniform sampler2D uNoiseA;
uniform sampler2D uGround;
uniform sampler2D uEnvMap;
uniform sampler2D uEnvDir;
uniform vec2 uMapInv;
uniform vec2 uEnvInv;
uniform float uCloud;
uniform float uTime;
uniform vec2 uWindDir;
uniform vec3 uBase[4];
uniform vec3 uLayerTint[4];
uniform vec4 uTile;
varying vec4 vSurf;
varying vec2 vMed;
varying float vNy;
varying vec3 vSpW;
#ifdef SP_TEX
uniform highp sampler2DArray uTAlb;
uniform highp sampler2DArray uTOrm;
uniform vec4 uOn;
#ifdef SP_NRM
uniform highp sampler2DArray uTNrm;
#endif
#endif

mat3 spTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
  vec3 q0 = dFdx( eye_pos.xyz );
  vec3 q1 = dFdy( eye_pos.xyz );
  vec2 st0 = dFdx( uv.st );
  vec2 st1 = dFdy( uv.st );
  vec3 N = surf_norm;
  vec3 q1perp = cross( q1, N );
  vec3 q0perp = cross( N, q0 );
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max( dot( T, T ), dot( B, B ) );
  float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
  return mat3( T * scale, B * scale, N );
}
vec3 spBumpN( vec3 N, vec3 pos, float h, float k ) {
  vec3 dpx = dFdx( pos );
  vec3 dpy = dFdy( pos );
  float dhx = dFdx( h );
  float dhy = dFdy( h );
  vec3 r1 = cross( dpy, N );
  vec3 r2 = cross( N, dpx );
  float det = dot( dpx, r1 );
  vec3 g = ( dhx * r1 + dhy * r2 ) / max( abs( det ), 1e-8 ) * sign( det );
  return normalize( N - k * g );
}
vec2 spRot( vec2 p, float a ) { float c = cos( a ); float s = sin( a ); return vec2( c * p.x - s * p.y, s * p.x + c * p.y ); }
`;

/** Schichten abtasten und mischen → Albedo, Rauheit, AO, Normale (Tangentenraum), Bump-Höhe */
const FRAG_SURFACE = /* glsl */ `
vec3 spAlb = vec3( 0.5 );
float spRough = 0.92;
float spAO = 1.0;
vec3 spNts = vec3( 0.0, 0.0, 1.0 );
float spBh = 0.0;
float spBk = 0.0;
vec2 spUvW;
{
  vec2 xz = vSpW.xz;
  float cliff = 1.0 - smoothstep( 0.35, 0.8, vNy );
  spUvW = cliff > 0.5 ? vec2( vSpW.x + vSpW.z, -vSpW.y * 1.4 ) : xz;
  vec4 G = texture2D( uGround, xz * uMapInv );
  vec4 E = texture2D( uEnvMap, xz * uEnvInv );
  vec4 Dr = texture2D( uEnvDir, xz * uEnvInv );
  // Wegrichtung (doppelter Winkel) → Richtung entlang des Weges, Querabstand in Einheiten (vorzeichenbehaftet)
  float spTh = 0.5 * atan( Dr.g * 2.0 - 1.0, Dr.r * 2.0 - 1.0 );
  vec2 spDir = vec2( cos( spTh ), sin( spTh ) );
  vec2 spNrm = vec2( - spDir.y, spDir.x );
  float spCross = ( E.g * 2.0 - 1.0 ) * SP_CROSS_MAX;
  float spQ = Dr.b;
  // Richtungssicherheit: an Kreuzungen mitteln sich die Richtungen weg → dort Weltprojektion (kein Verschmieren)
  float spDirK = smoothstep( 0.55, 0.9, length( Dr.rg * 2.0 - 1.0 ) );
  vec4 nA = texture2D( uNoiseA, xz * 0.017 );
  vec4 nB = texture2D( uNoiseA, xz * 0.11 + vec2( 0.31, 0.57 ) );
  vec4 nC = texture2D( uNoiseA, xz * 0.43 + vec2( 0.77, 0.13 ) );
  // ---- Gewichte
  float moist = vMed.y;
  float wG = vSurf.x * ( 1.0 - cliff );
  float wD = vSurf.y * ( 1.0 - cliff );
  float wR = max( vSurf.z, cliff );
  float dry = smoothstep( 0.6, 0.84, nA.g + ( nB.r - 0.5 ) * 0.4 ) * ( 1.0 - moist * 0.7 );
  wD += wG * dry * 0.75;
  float wear = smoothstep( 0.06, 0.7, G.r + ( nB.g - 0.5 ) * 0.5 ) * ( 1.0 - cliff );
  float field = smoothstep( 0.32, 0.65, G.g + ( nB.r - 0.5 ) * 0.25 ) * ( 1.0 - cliff );
  // ausgefranste Wegränder: grobes + feines Rauschen, Gras greift in den Rand
  vec4 nE = texture2D( uNoiseA, xz * 0.9 + vec2( 0.41, 0.23 ) );
  float roadE = E.r + ( nB.b - 0.5 ) * 0.5 + ( nC.a - 0.5 ) * 0.38 + ( nE.r - 0.5 ) * 0.3;
  float road = smoothstep( 0.4, 0.62, roadE ) * ( 1.0 - cliff );
  // Karrenweg: Grasstreifen in der Mitte, Fahrspuren als Rillen
  float mid = ( 1.0 - smoothstep( 0.1, 0.24, spQ + ( nC.r - 0.5 ) * 0.14 ) ) * E.a;
  float rut = E.a * smoothstep( 0.2, 0.32, spQ + ( nC.g - 0.5 ) * 0.05 ) * ( 1.0 - smoothstep( 0.42, 0.56, spQ + ( nC.g - 0.5 ) * 0.05 ) ) * road;
  float wP = road * ( 1.0 - mid * 0.8 );
  wD += wear * 1.3 + field * 2.4;
  wG += road * mid * 1.2;
  vec4 w = vec4( wG * ( 1.0 - wP ), wD * ( 1.0 - wP * 0.85 ), wP * 2.2, wR * 1.4 );
  w /= max( 1e-4, dot( w, vec4( 1.0 ) ) );
  // ---- Schichten
  vec4 a0; vec4 a1; vec4 a2; vec4 a3;
  vec4 o0; vec4 o1; vec4 o2; vec4 o3;
  vec2 u0 = spUvW / uTile.x;
  vec2 u1 = spUvW / uTile.y;
  // Wegtextur entlang des Weges ausgerichtet (Spurrillen der Textur laufen mit dem Weg), mittig auf der Wegachse
  vec2 u2 = cliff > 0.5 ? spUvW / uTile.z : vec2( 0.5 + spCross / uTile.z, dot( xz, spDir ) / uTile.z );
  vec2 u3 = spUvW / uTile.w;
  #ifdef SP_TEX
    a0 = texture( uTAlb, vec3( u0, 0.0 ) ); o0 = texture( uTOrm, vec3( u0, 0.0 ) );
    a1 = texture( uTAlb, vec3( u1, 1.0 ) ); o1 = texture( uTOrm, vec3( u1, 1.0 ) );
    a2 = texture( uTAlb, vec3( u2, 2.0 ) ); o2 = texture( uTOrm, vec3( u2, 2.0 ) );
    if ( spDirK < 0.99 ) {
      vec2 u2w = spUvW / uTile.z;
      a2 = mix( texture( uTAlb, vec3( u2w, 2.0 ) ), a2, spDirK );
      o2 = mix( texture( uTOrm, vec3( u2w, 2.0 ) ), o2, spDirK );
    }
    a3 = texture( uTAlb, vec3( u3, 3.0 ) ); o3 = texture( uTOrm, vec3( u3, 3.0 ) );
    #ifdef SP_DUAL
      // zweite Abtastung: gedreht und skaliert, über großflächiges Rauschen eingeblendet (bricht Kachelmuster)
      float bl = smoothstep( 0.35, 0.65, nA.b );
      vec2 r = vec2( 0.37, 0.71 );
      a0 = mix( a0, texture( uTAlb, vec3( spRot( u0, 1.1 ) * 0.71 + r, 0.0 ) ), bl );
      a1 = mix( a1, texture( uTAlb, vec3( spRot( u1, 2.3 ) * 0.77 + r, 1.0 ) ), bl );
      o0 = mix( o0, texture( uTOrm, vec3( spRot( u0, 1.1 ) * 0.71 + r, 0.0 ) ), bl );
      o1 = mix( o1, texture( uTOrm, vec3( spRot( u1, 2.3 ) * 0.77 + r, 1.0 ) ), bl );
    #endif
    // Schichten ohne Textur: Grundfarbe mit Rauschen
    a0 = mix( vec4( uBase[0] * ( 0.8 + 0.4 * nC.r ), 1.0 ), a0, uOn.x );
    a1 = mix( vec4( uBase[1] * ( 0.8 + 0.4 * nC.g ), 1.0 ), a1, uOn.y );
    a2 = mix( vec4( uBase[2] * ( 0.85 + 0.3 * nC.b ), 1.0 ), a2, uOn.z );
    a3 = mix( vec4( uBase[3] * ( 0.8 + 0.4 * nB.r ), 1.0 ), a3, uOn.w );
    o0 = mix( vec4( 1.0, 0.95, 0.0, nC.r ), o0, uOn.x );
    o1 = mix( vec4( 1.0, 0.95, 0.0, nC.g ), o1, uOn.y );
    o2 = mix( vec4( 1.0, 0.92, 0.0, nC.b ), o2, uOn.z );
    o3 = mix( vec4( 1.0, 0.9, 0.0, nB.r ), o3, uOn.w );
  #else
    // prozeduraler Rückfall: Grundfarben der Bibliothek + Rauschen (Halme, Kiesel, Risse)
    float blade = nC.a;
    a0 = vec4( uBase[0] * ( 0.72 + 0.5 * blade ) * vec3( 1.0, 1.0 + ( nB.g - 0.5 ) * 0.2, 1.0 ), 1.0 );
    float peb = smoothstep( 0.72, 0.9, nC.b );
    a1 = vec4( uBase[1] * ( 0.8 + 0.3 * nC.g ) * ( 1.0 + peb * 0.35 ), 1.0 );
    a2 = vec4( uBase[2] * ( 0.85 + 0.25 * nC.r ) * ( 1.0 + peb * 0.4 ), 1.0 );
    float crack = smoothstep( 0.66, 0.92, nB.b );
    a3 = vec4( uBase[3] * ( 0.85 + 0.3 * nB.r ) * ( 1.0 - crack * 0.35 ), 1.0 );
    o0 = vec4( 1.0, 0.95, 0.0, blade );
    o1 = vec4( 1.0 - peb * 0.2, 0.95, 0.0, 0.4 + peb * 0.5 );
    o2 = vec4( 1.0 - peb * 0.2, 0.92, 0.0, 0.35 + peb * 0.6 );
    o3 = vec4( 1.0 - crack * 0.4, 0.88, 0.0, 0.6 - crack * 0.5 );
    spBh = ( blade - 0.5 ) * 0.08 * w.x + peb * 0.06 * ( w.y + w.z ) - crack * 0.2 * w.w + ( nB.r - 0.5 ) * 0.12;
    spBk = 0.8;
  #endif
  // ---- höhenbasierte Mischung (Höhe = ORM.a der Textur): Erde füllt Fugen, Gras/Kies liegt darüber
  // Höhe: ORM.a, falls die Textur sie trägt (Bibliothek: Alpha = Höhe); sonst Ersatz aus AO (Hohlräume tief) und Helligkeit
  vec4 hgt = vec4( o0.a, o1.a, o2.a, o3.a );
  vec4 hProxy = clamp( vec4( o0.r, o1.r, o2.r, o3.r ) * 0.7 + vec4( dot( a0.rgb, vec3( 0.6 ) ), dot( a1.rgb, vec3( 0.6 ) ), dot( a2.rgb, vec3( 0.6 ) ), dot( a3.rgb, vec3( 0.6 ) ) ) - 0.35, 0.0, 1.0 );
  hgt = mix( hgt, hProxy, step( vec4( 0.995 ), hgt ) );
  vec4 wt = w + hgt * 0.55 * min( vec4( 1.0 ), w * 4.0 );
  float mx = max( max( wt.x, wt.y ), max( wt.z, wt.w ) );
  wt = max( wt - ( mx - 0.22 ), vec4( 0.0 ) );
  wt /= max( 1e-4, dot( wt, vec4( 1.0 ) ) );
  // Abstimmung der Bibliothekstexturen auf die Szene (Gras satter, Weg erdiger)
  // Weg: Kontrast der Spurrillen in der Textur mildern (aus RTS-Sicht sonst harte schwarze Risse)
  a2.rgb = mix( a2.rgb, vec3( dot( a2.rgb, vec3( 0.333 ) ) ) * vec3( 1.08, 1.0, 0.86 ), 0.25 ) * 0.68 + uBase[2] * 0.32 * ( 0.8 + 0.4 * nC.b );
  a0.rgb *= uLayerTint[0]; a1.rgb *= uLayerTint[1]; a2.rgb *= uLayerTint[2]; a3.rgb *= uLayerTint[3];
  vec4 alb = a0 * wt.x + a1 * wt.y + a2 * wt.z + a3 * wt.w;
  vec4 orm = o0 * wt.x + o1 * wt.y + o2 * wt.z + o3 * wt.w;
  #if defined( SP_TEX ) && defined( SP_NRM )
    vec3 n0 = texture( uTNrm, vec3( u0, 0.0 ) ).xyz * 2.0 - 1.0;
    vec3 n1 = texture( uTNrm, vec3( u1, 1.0 ) ).xyz * 2.0 - 1.0;
    vec3 n2 = texture( uTNrm, vec3( u2, 2.0 ) ).xyz * 2.0 - 1.0;
    // Normale der Wegtextur aus dem Wegrahmen (u quer, v längs) in den Weltrahmen (x, z) drehen
    if ( cliff <= 0.5 ) n2.xy = mix( n2.xy, n2.x * spNrm + n2.y * spDir, spDirK );
    vec3 n3 = texture( uTNrm, vec3( u3, 3.0 ) ).xyz * 2.0 - 1.0;
    n0 = mix( vec3( 0.0, 0.0, 1.0 ), n0, uOn.x );
    n1 = mix( vec3( 0.0, 0.0, 1.0 ), n1, uOn.y );
    n2 = mix( vec3( 0.0, 0.0, 1.0 ), n2, uOn.z );
    n3 = mix( vec3( 0.0, 0.0, 1.0 ), n3, uOn.w );
    spNts = normalize( n0 * wt.x + n1 * wt.y + n2 * wt.z + n3 * wt.w );
  #endif
  vec3 c = alb.rgb;
  // großräumige Variation (Helligkeit, sonnenverbrannte/satte Wiesenflecken) gegen Wiederholung
  vec4 nM = texture2D( uNoiseA, xz * 0.0063 + vec2( 0.13, 0.71 ) );
  c *= 1.0 + ( nA.r - 0.5 ) * 0.3 + ( nM.g - 0.5 ) * 0.22;
  // Wiese: trockene, gelbliche Flecken und satte, dunklere Senken (großräumig, gegen den Teppich-Eindruck)
  float burnt = smoothstep( 0.42, 0.78, nA.b * 0.6 + nM.r * 0.6 + ( nB.g - 0.5 ) * 0.3 - 0.1 ) * ( 1.0 - moist * 0.5 );
  c = mix( c, c * vec3( 1.16, 1.05, 0.7 ), burnt * 0.6 * wt.x );
  float lush = smoothstep( 0.55, 0.85, 1.0 - nA.g * 0.7 - nM.b * 0.5 + moist * 0.3 );
  c = mix( c, c * vec3( 0.82, 0.96, 0.78 ), lush * 0.45 * wt.x );
  // Fahrspuren (nur ohne Wegtextur – M_Ground_Path trägt eigene Spurrillen): verdichtet, dunkler, als Rille
  #ifdef SP_TEX
    rut *= 1.0 - uOn.z;
  #endif
  c *= 1.0 - rut * 0.22;
  spBh += -rut * 0.22 + ( field > 0.01 ? ( 0.5 + 0.5 * sin( vSpW.x * 9.5 + nB.g * 2.2 ) - 0.5 ) * 0.1 * field : 0.0 );
  spBk = max( spBk, rut > 0.01 || field > 0.01 ? 0.9 : 0.0 );
  // Ackerfurchen dunkler
  c = mix( c, c * 0.62, field * ( 0.5 + 0.5 * sin( vSpW.x * 9.5 + nB.g * 2.2 ) ) * 0.5 );
  // Waldboden: Laubstreu (bräunlich, dunkler), weniger Himmelslicht
  float can = E.b;
  c = mix( c, vec3( 0.13, 0.095, 0.06 ) * ( 0.8 + 0.4 * nC.r ), can * 0.45 * ( wt.x + wt.y ) );
  // nasse Ufer: dunkler, glatter
  float wet = min( vSurf.w, 1.0 );
  c *= mix( 1.0, 0.62, wet );
  float sub = step( 1.5, vSurf.w );
  c *= 1.0 - 0.2 * sub;
  // Tönung/Kriegsnebel aus der Vertexfarbe
  c *= vColor.rgb;
  spAlb = c;
  spRough = clamp( orm.g - wet * 0.35, 0.3, 1.0 );
  spAO = clamp( orm.r, 0.0, 1.0 ) * ( 1.0 - G.b * 0.55 ) * ( 1.0 - can * 0.4 );
}
diffuseColor.rgb = spAlb;
`;

const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
#if defined( SP_TEX ) && defined( SP_NRM )
{
  mat3 spTbn = spTangentFrame( - vViewPosition, normal, spUvW );
  normal = normalize( spTbn * spNts );
}
#endif
if ( spBk > 0.0 ) normal = spBumpN( normal, - vViewPosition, spBh, spBk );
`;

const FRAG_AO = /* glsl */ `
#include <aomap_fragment>
{
  reflectedLight.indirectDiffuse *= spAO;
  reflectedLight.indirectSpecular *= spAO;
  reflectedLight.directDiffuse *= mix( 1.0, spAO, 0.35 );
}
`;

const FRAG_TAIL = /* glsl */ `
{
  if ( uCloud > 0.001 ) {
    float spcl = texture2D( uNoiseA, vSpW.xz * 0.0105 + uWindDir * ( uTime * 0.0042 ) ).r;
    spcl = smoothstep( 0.40, 0.78, spcl );
    outgoingLight *= 1.0 - uCloud * 0.15 * spcl * ( 1.0 - step( 1.5, vSurf.w ) );
  }
}
#include <opaque_fragment>
`;

const FRAG_EDGE = /* glsl */ `
#include <fog_fragment>
#ifdef USE_FOG
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, vMed.x );
#endif
`;

/** Texturarrays der vier Bodenschichten (aus den Bibliothekstexturen) */
export class TerrainTextures {
  alb: THREE.DataArrayTexture | null = null;
  nrm: THREE.DataArrayTexture | null = null;
  orm: THREE.DataArrayTexture | null = null;
  on = new THREE.Vector4(0, 0, 0, 0);
  size = 0;
  bytes = 0;
  private building: Promise<boolean> | null = null;

  /** Baut die Arrays (einmal je Größe). true, wenn mindestens eine Schicht eine Textur hat. */
  build(mats: AssetMaterials, size: number, anisotropy: number): Promise<boolean> {
    if (this.building && this.size === size) return this.building;
    this.size = size;
    this.building = (async (): Promise<boolean> => {
      await mats.ensure([...TERRAIN_LAYERS]);
      if (typeof document === 'undefined') return false;
      const any = TERRAIN_LAYERS.some((n) => mats.texture(n, 'albedo'));
      if (!any) return false;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      const make = (kind: 'albedo' | 'normal' | 'orm', fill: (l: number) => [number, number, number, number]): THREE.DataArrayTexture => {
        const data = new Uint8Array(size * size * 4 * 4);
        TERRAIN_LAYERS.forEach((name, l) => {
          const t = mats.texture(name, kind);
          const img = t?.image as CanvasImageSource | undefined;
          if (img) {
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            data.set(ctx.getImageData(0, 0, size, size).data, l * size * size * 4);
          } else {
            const f = fill(l);
            for (let i = 0; i < size * size; i++) data.set(f, (l * size * size + i) * 4);
          }
        });
        const tex = new THREE.DataArrayTexture(data, size, size, 4);
        tex.format = THREE.RGBAFormat;
        tex.type = THREE.UnsignedByteType;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = anisotropy;
        tex.colorSpace = kind === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.needsUpdate = true;
        this.bytes += Math.round(size * size * 4 * 4 * (4 / 3));
        return tex;
      };
      for (const t of [this.alb, this.nrm, this.orm]) t?.dispose();
      this.bytes = 0;
      this.alb = make('albedo', () => [128, 128, 128, 255]);
      this.nrm = make('normal', () => [128, 128, 255, 255]);
      this.orm = make('orm', () => [255, 240, 0, 128]);
      this.on.set(...(TERRAIN_LAYERS.map((n) => (mats.texture(n, 'albedo') ? 1 : 0)) as [number, number, number, number]));
      return true;
    })();
    return this.building;
  }

  setAnisotropy(a: number): void {
    for (const t of [this.alb, this.nrm, this.orm])
      if (t && t.anisotropy !== a) {
        t.anisotropy = a;
        t.needsUpdate = true;
      }
  }

  dispose(): void {
    for (const t of [this.alb, this.nrm, this.orm]) t?.dispose();
    this.alb = this.nrm = this.orm = null;
    this.building = null;
    this.bytes = 0;
  }
}

/** sRGB-Hex → lineare Farbe */
function lin(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/**
 * Material erzeugen. `tex` = Texturarrays (oder null → prozeduraler Rückfall), `q` = Grafikstufe (Normalen ab Mittel,
 * zweite Abtastung nur Hoch), `base`/`tile` = Grundfarben und Kachelgrößen der vier Schichten (aus dem Manifest).
 */
export function medievalTerrainMaterial(tex: TerrainTextures | null, q: Pick<QualityCfg, 'surfaceDetail'>, base: string[], tile: number[]): THREE.MeshStandardMaterial {
  ensureNoiseTextures();
  const useTex = !!(tex && tex.alb && tex.orm);
  const nrm = useTex && q.surfaceDetail >= 1;
  const dual = useTex && q.surfaceDetail >= 2;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  m.name = 'spTerrainMedieval';
  const uBase = { value: base.map(lin) };
  const uLayerTint = { value: LAYER_TINT.map((c) => new THREE.Vector3(...c)) };
  const uTile = { value: new THREE.Vector4(...(tile.map((t) => (t > 0 ? t : 4)) as [number, number, number, number])) };
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoiseA = GFX.uNoiseA;
    s.uniforms.uGround = GFX.uGround;
    s.uniforms.uMapInv = GFX.uMapInv;
    s.uniforms.uCloud = GFX.uCloud;
    s.uniforms.uTime = GFX.uTime;
    s.uniforms.uWindDir = GFX.uWindDir;
    s.uniforms.uEnvMap = ENVU.uEnvMap;
    s.uniforms.uEnvDir = ENVU.uEnvDir;
    s.uniforms.uEnvInv = ENVU.uEnvInv;
    s.uniforms.uBase = uBase;
    s.uniforms.uLayerTint = uLayerTint;
    s.uniforms.uTile = uTile;
    if (useTex && tex) {
      s.uniforms.uTAlb = { value: tex.alb };
      s.uniforms.uTOrm = { value: tex.orm };
      s.uniforms.uTNrm = { value: tex.nrm };
      s.uniforms.uOn = { value: tex.on };
    }
    patchHemiK(s);
    s.vertexShader = s.vertexShader
      .replace('void main() {', VERT_PARS + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSurf = aSurf;\n vMed = aMed;\n vNy = normal.y;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_POS);
    const defs = (useTex ? '#define SP_TEX\n' : '') + (nrm ? '#define SP_NRM\n' : '') + (dual ? '#define SP_DUAL\n' : '');
    s.fragmentShader =
      defs +
      s.fragmentShader
        .replace('void main() {', FRAG_PARS + 'void main() {')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_SURFACE)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = spRough;')
        .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
        .replace('#include <aomap_fragment>', FRAG_AO)
        .replace('#include <opaque_fragment>', FRAG_TAIL)
        .replace('#include <fog_fragment>', FRAG_EDGE);
  };
  m.customProgramCacheKey = () => `spTerrainMed:${useTex ? 1 : 0}${nrm ? 1 : 0}${dual ? 1 : 0}`;
  return m;
}
