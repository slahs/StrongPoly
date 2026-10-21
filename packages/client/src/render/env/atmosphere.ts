import * as THREE from 'three';
import '../materials';

/**
 * Licht und Atmosphäre im Stil „medieval“ (Phase 5A, Teilschritt 5). Der Stil „classic“ bleibt unverändert: alles hier
 * wirkt nur, wenn GameScene den Stil medieval anwendet (eigener Tonemapping-Operator, Exponentialnebel, Himmel als
 * Umgebung). Reine Funktionen (Himmelsfarbe, Sonnenfarbe, Nebeldichte) sind ohne WebGL testbar.
 *
 *  - Sonne: Farbe aus dem Sonnenstand (tief = wärmer, Annäherung an die Farbtemperatur 3.400 K … 5.800 K), Stärke so,
 *    dass Sonne : Himmel auf dem Boden etwa 3 : 1 ergibt (klarer Nachmittag).
 *  - Himmel: prozeduraler Verlauf (Zenit blau, Horizont dunstig hell, Aureole um die Sonne, Bodenreflex unten) als
 *    kleines Equirect-Bild → PMREM (scene.environment: diffuses Himmelslicht + Glanz für alle PBR-Materialien) und als
 *    Hintergrund. Die Halbkugel-Lichtquelle bekommt daraus abgeleitete Farben für die prozeduralen Rückfallmodelle
 *    (Lambert); PBR-Materialien blenden sie aus (uHemiK), damit das Himmelslicht nicht doppelt zählt.
 *  - Nebel: FogExp2 in Horizontfarbe (Luftperspektive), Dichte folgt dem Kameraabstand (nah klar), über ~2 Einheiten
 *    Höhe dünner (Höhendunst). Umgesetzt in der FOG_EXP2-Verzweigung der three-Chunks – classic nutzt den linearen Nebel.
 *  - Tonemapping: CustomToneMapping = AgX (Standard) oder ACES + eigene Abstimmung (Sättigung, sanfter Kontrast, leichte
 *    Teiltonung); das globale Grading aus materials.ts entfällt dann (spGradeMode). Kein Bloom (Kosten/Safari).
 */

export type ToneOp = 'agx' | 'aces';

export interface MedievalLook {
  /** Sonnenstärke (three-Einheiten, Bestrahlungsstärke) */
  sunIntensity: number;
  /** Strahldichte des Himmels: Zenit, Horizont (linear) */
  zenith: [number, number, number];
  horizon: [number, number, number];
  /** Bodenreflex (untere Halbkugel) */
  ground: [number, number, number];
  /** Helligkeit der Aureole um die Sonne (nur im Himmel, nicht als Licht) */
  aureole: number;
  /** Faktor auf das Himmelslicht der PBR-Materialien */
  envIntensity: number;
  /** Belichtung */
  exposure: number;
  /** Sättigung/Kontrast der Abstimmung nach dem Tonemapping */
  saturation: number;
  contrast: number;
  /** Nebel: Abstand (× Kameraabstand), bei dem die Hälfte erreicht ist */
  fogHalf: number;
  /** größter Anteil des Nebels (Fernsicht bleibt lesbar) */
  fogMax: number;
}

export const MEDIEVAL_LOOK: MedievalLook = {
  sunIntensity: 3.5,
  zenith: [0.12, 0.23, 0.5],
  horizon: [0.54, 0.6, 0.66],
  ground: [0.16, 0.15, 0.12],
  aureole: 0.55,
  envIntensity: 0.85,
  exposure: 1.15,
  saturation: 1.12,
  contrast: 1.06,
  fogHalf: 3.2,
  fogMax: 0.85,
};

/** Tonemapping-Operator des Stils medieval (vor dem ersten Kompilieren wählbar; LookDev `&tone=aces`) */
let toneOp: ToneOp = 'agx';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Sonnenfarbe (linear, Maximum 1) aus der Sonnenhöhe in Grad: tief (5°) ≈ 3.400 K orange-warm, ab ~55° ≈ 5.800 K fast
 * weiß. Annäherung der Farbtemperatur durch eine glatte Kurve (keine Spektralrechnung).
 */
export function sunColorOf(elDeg: number): [number, number, number] {
  const t = smooth(4, 58, elDeg);
  const r = 1;
  const g = 0.66 + 0.29 * t;
  const b = 0.4 + 0.47 * t;
  return [r, g, b];
}

/** Richtung zur Sonne aus Azimut (0 = Norden = −z, 90 = Osten = +x) und Höhe in Grad */
export function sunDirOf(azDeg: number, elDeg: number): [number, number, number] {
  const az = (azDeg * Math.PI) / 180;
  const el = (Math.max(1, Math.min(89, elDeg)) * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/**
 * Strahldichte des Himmels in Richtung d (normiert, y oben) bei Sonnenrichtung s (linear RGB). Rein, für Umgebung,
 * Hintergrund, Nebelfarbe und Tests.
 */
export function skyRadiance(d: [number, number, number], s: [number, number, number], look: MedievalLook = MEDIEVAL_LOOK): [number, number, number] {
  const y = d[1];
  const sunEl = Math.asin(Math.max(-1, Math.min(1, s[1])));
  const sc = sunColorOf((sunEl * 180) / Math.PI);
  // tiefe Sonne: Horizont wärmer und etwas dunkler, Zenit tiefer blau
  const low = 1 - smooth(0.12, 0.9, sunEl);
  const hz: [number, number, number] = [look.horizon[0] * (1 + 0.1 * low), look.horizon[1] * (1 - 0.02 * low), look.horizon[2] * (1 - 0.12 * low)];
  const cosS = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
  const mie = Math.pow(Math.max(0, cosS), 6) * 0.45 + Math.pow(Math.max(0, cosS), 48) * 1.0;
  const out: [number, number, number] = [0, 0, 0];
  if (y >= 0) {
    const k = Math.pow(y, 0.42);
    for (let i = 0; i < 3; i++) out[i] = hz[i] + (look.zenith[i] - hz[i]) * k;
    // Aureole (Vorwärtsstreuung), zum Horizont hin stärker (längerer Lichtweg)
    const a = look.aureole * mie * (0.55 + 0.45 * (1 - k));
    for (let i = 0; i < 3; i++) out[i] += sc[i] * a;
    // gegenüber der Sonne leicht dunkler (Erdschatten-Anmutung nur angedeutet)
    const anti = Math.max(0, -cosS) * 0.06 * (1 - k);
    for (let i = 0; i < 3; i++) out[i] *= 1 - anti;
  } else {
    const k = smooth(0, 0.25, -y);
    for (let i = 0; i < 3; i++) out[i] = hz[i] * 0.8 + (look.ground[i] - hz[i] * 0.8) * k;
  }
  return out;
}

/** Equirect-Bild des Himmels (RGBA float, Zeile 0 = unten wie DataTexture/flipY=false) */
export function buildSky(sunDir: [number, number, number], w = 128, h = 64, look: MedievalLook = MEDIEVAL_LOOK): Float32Array<ArrayBuffer> {
  const data = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    const phi = (v - 0.5) * Math.PI; // -π/2 (unten) .. π/2 (oben)
    const cy = Math.sin(phi);
    const cr = Math.cos(phi);
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      // three equirect: u = atan(d.z, d.x) / 2π + 0.5
      const th = (u - 0.5) * Math.PI * 2;
      const d: [number, number, number] = [Math.cos(th) * cr, cy, Math.sin(th) * cr];
      const c = skyRadiance(d, sunDir, look);
      const o = (j * w + i) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 1;
    }
  }
  return data;
}

/** mittlere Strahldichte der oberen bzw. unteren Halbkugel (cos-gewichtet) – Farben der Halbkugel-Lichtquelle */
export function hemiOf(sunDir: [number, number, number], look: MedievalLook = MEDIEVAL_LOOK): { sky: [number, number, number]; ground: [number, number, number] } {
  const sky: [number, number, number] = [0, 0, 0];
  const gnd: [number, number, number] = [0, 0, 0];
  let ws = 0;
  let wg = 0;
  const N = 24;
  for (let a = 0; a < N; a++)
    for (let b = 0; b < N / 2; b++) {
      const th = ((a + 0.5) / N) * Math.PI * 2;
      const ph = ((b + 0.5) / (N / 2)) * (Math.PI / 2);
      const cy = Math.sin(ph);
      const cr = Math.cos(ph);
      const up = skyRadiance([Math.cos(th) * cr, cy, Math.sin(th) * cr], sunDir, look);
      const dn = skyRadiance([Math.cos(th) * cr, -cy, Math.sin(th) * cr], sunDir, look);
      const w = cy * cr;
      for (let i = 0; i < 3; i++) {
        sky[i] += up[i] * w;
        gnd[i] += dn[i] * w;
      }
      ws += w;
      wg += w;
    }
  for (let i = 0; i < 3; i++) {
    sky[i] /= ws;
    gnd[i] /= wg;
  }
  return { sky, ground: gnd };
}

/**
 * Nebeldichte (FogExp2) für einen Kameraabstand: die Hälfte des Nebels ist bei fogHalf × Kameraabstand × scale erreicht.
 * f(d) = 1 − exp(−(dichte·d)²) → dichte = √ln2 / d½.
 */
export function fogDensityFor(camDist: number, scale = 1, look: MedievalLook = MEDIEVAL_LOOK): number {
  const half = Math.max(8, camDist * look.fogHalf * scale);
  return Math.sqrt(Math.LN2) / half;
}

type V3 = [number, number, number];
/** GLSL mat3(a, b, c) * v (Spalten a, b, c) */
function m3(a: V3, b: V3, c: V3, v: V3): V3 {
  return [a[0] * v[0] + b[0] * v[1] + c[0] * v[2], a[1] * v[0] + b[1] * v[1] + c[1] * v[2], a[2] * v[0] + b[2] * v[1] + c[2] * v[2]];
}

/**
 * Tonemapping + Abstimmung des Stils als JS-Spiegel des Shaders (three r170 AgX/ACES): Nebelfarbe passend zum
 * Hintergrundhimmel (der Nebel wird in three NACH dem Tonemapping gemischt) und Tests. Ergebnis: lineares Anzeige-RGB.
 */
export function toneMapJs(rgb: V3, exposure: number, op: ToneOp = toneOp, look: MedievalLook = MEDIEVAL_LOOK): V3 {
  let c: V3;
  if (op === 'aces') {
    let v: V3 = [rgb[0] * (exposure / 0.6), rgb[1] * (exposure / 0.6), rgb[2] * (exposure / 0.6)];
    v = m3([0.59719, 0.076, 0.0284], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777], v);
    v = v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081)) as V3;
    v = m3([1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602], v);
    c = v.map(clamp01) as V3;
  } else {
    let v: V3 = [rgb[0] * exposure, rgb[1] * exposure, rgb[2] * exposure];
    v = m3([0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956], v);
    v = m3([0.856627153315983, 0.137318972929847, 0.11189821299995], [0.0951212405381588, 0.761241990602591, 0.0767994186031903], [0.0482516061458583, 0.101439036467562, 0.811302368396859], v);
    const minEv = -12.47393;
    const maxEv = 4.026069;
    v = v.map((x) => clamp01((Math.log2(Math.max(x, 1e-10)) - minEv) / (maxEv - minEv))) as V3;
    v = v.map((x) => {
      const x2 = x * x;
      const x4 = x2 * x2;
      return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
    }) as V3;
    v = m3([1.1271005818144368, -0.1413297634984383, -0.14132976349843826], [-0.11060664309660323, 1.157823702216272, -0.11060664309660294], [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405], v);
    v = v.map((x) => Math.pow(Math.max(0, x), 2.2)) as V3;
    v = m3([1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187], v);
    c = v.map(clamp01) as V3;
  }
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  c = c.map((x) => clamp01(l + (x - l) * look.saturation)) as V3;
  c = c.map((x) => {
    const p = clamp01((Math.sqrt(x) - 0.5) * look.contrast + 0.5);
    return p * p;
  }) as V3;
  const k = smooth(0.04, 0.5, l);
  const tint: V3 = [0.985 + (1.015 - 0.985) * k, 0.995 + (1.0 - 0.995) * k, 1.02 + (0.975 - 1.02) * k];
  return [clamp01(c[0] * tint[0]), clamp01(c[1] * tint[1]), clamp01(c[2] * tint[2])];
}

// ---------------------------------------------------------------------------------------------------------------
// Shader-Chunks (einmalig beim Import): Nebel FOG_EXP2 mit Höhendunst, CustomToneMapping, Grading-Schalter
// ---------------------------------------------------------------------------------------------------------------

const FOG_PARS_V = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	#ifdef FOG_EXP2
		varying float vFogH;
	#endif
#endif
`;
const FOG_V = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	#ifdef FOG_EXP2
		vFogH = ( transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) ).y;
	#endif
#endif
`;
const FOG_PARS_F = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
		varying float vFogH;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;
const FOG_F = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float spFd = fogDensity * vFogDepth;
		float fogFactor = 1.0 - exp( - spFd * spFd );
		// Höhendunst: über dem Boden dünner (Türme/Baumkronen bleiben klarer), Obergrenze hält die Fernsicht lesbar
		fogFactor *= mix( 1.0, 0.62, smoothstep( 1.0, 7.0, vFogH ) );
		fogFactor = min( fogFactor, SP_FOG_MAX );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

function toneFn(op: ToneOp, look: MedievalLook): string {
  const f = (x: number): string => x.toFixed(4);
  const base = op === 'aces' ? 'ACESFilmicToneMapping( color )' : 'AgXToneMapping( color )';
  return /* glsl */ `
float spGradeMode = 0.0;
vec3 CustomToneMapping( vec3 color ) {
	spGradeMode = 1.0;
	vec3 c = ${base};
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = clamp( mix( vec3( l ), c, ${f(look.saturation)} ), 0.0, 1.0 );
	vec3 p = sqrt( c );
	p = clamp( ( p - 0.5 ) * ${f(look.contrast)} + 0.5, 0.0, 1.0 );
	c = p * p;
	// leichte Teiltonung: Schatten minimal kühl, Lichter minimal warm
	c *= mix( vec3( 0.985, 0.995, 1.02 ), vec3( 1.015, 1.0, 0.975 ), smoothstep( 0.04, 0.5, l ) );
	return clamp( c, 0.0, 1.0 );
}`;
}

let installed = false;
let toneTemplate = '';

/** Chunks einmal patchen (idempotent). Muss vor dem ersten Kompilieren eines Programms laufen (Import von scene.ts). */
export function installEnvChunks(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = FOG_PARS_V;
  C.fog_vertex = FOG_V;
  C.fog_pars_fragment = FOG_PARS_F;
  C.fog_fragment = FOG_F.replace('SP_FOG_MAX', MEDIEVAL_LOOK.fogMax.toFixed(3));
  toneTemplate = C.tonemapping_pars_fragment.replace(/vec3 CustomToneMapping\( vec3 color \) \{ return color; \}/, '/*SP_TONE*/');
  if (!toneTemplate.includes('/*SP_TONE*/')) toneTemplate += '\n/*SP_TONE*/';
  applyTone();
  // Grading aus materials.ts nur, wenn nicht der Stil-Operator (CustomToneMapping) aktiv war
  const cs = C.colorspace_fragment;
  if (!cs.includes('spGradeMode')) {
    const i = cs.indexOf('{');
    const j = cs.lastIndexOf('}');
    if (i >= 0 && j > i) C.colorspace_fragment = cs.slice(0, i) + '#ifdef TONE_MAPPING\nif ( spGradeMode < 0.5 )\n#endif\n' + cs.slice(i);
  }
}

function applyTone(): void {
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.tonemapping_pars_fragment = toneTemplate.replace('/*SP_TONE*/', toneFn(toneOp, MEDIEVAL_LOOK));
}

/** Operator wählen (nur vor dem ersten Kompilieren sinnvoll; LookDev-Vergleich AgX/ACES über `&tone=`) */
export function setToneOp(op: ToneOp): void {
  toneOp = op;
  if (installed) applyTone();
}

export function currentToneOp(): ToneOp {
  return toneOp;
}

installEnvChunks();

// ---------------------------------------------------------------------------------------------------------------
// Himmel-Umgebung (PMREM) und Hintergrund
// ---------------------------------------------------------------------------------------------------------------

/** Himmel des Stils medieval: Equirect-Hintergrund + PMREM-Umgebung, neu berechnet bei Sonnenwechsel */
export class MedievalSky {
  env: THREE.Texture | null = null;
  background: THREE.DataTexture | null = null;
  private pm: THREE.PMREMGenerator | null = null;
  private key = '';
  /** Halbkugel-Farben (linear, Strahldichte) und Horizontfarbe (Nebel) des aktuellen Himmels */
  hemiSky = new THREE.Color();
  hemiGround = new THREE.Color();
  horizon = new THREE.Color();

  constructor(private renderer: THREE.WebGLRenderer | null) {}

  update(sunDir: THREE.Vector3, look: MedievalLook = MEDIEVAL_LOOK): boolean {
    const key = `${sunDir.x.toFixed(3)},${sunDir.y.toFixed(3)},${sunDir.z.toFixed(3)}`;
    if (key === this.key) return false;
    this.key = key;
    const s: [number, number, number] = [sunDir.x, sunDir.y, sunDir.z];
    const W = 128;
    const H = 64;
    const data = buildSky(s, W, H, look);
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const old = this.background;
    this.background = tex;
    const h = hemiOf(s, look);
    this.hemiSky.setRGB(h.sky[0], h.sky[1], h.sky[2]);
    this.hemiGround.setRGB(h.ground[0], h.ground[1], h.ground[2]);
    // Nebelfarbe: Horizont seitlich zur Sonne (Mittel über den Azimut, leicht über dem Horizont)
    const hz = [0, 0, 0];
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const c = skyRadiance([Math.cos(th) * 0.995, 0.1, Math.sin(th) * 0.995], s, look);
      for (let i = 0; i < 3; i++) hz[i] += c[i] / 16;
    }
    this.horizon.setRGB(hz[0], hz[1], hz[2]);
    if (this.renderer) {
      this.pm ??= new THREE.PMREMGenerator(this.renderer);
      const prev = this.env;
      this.env = this.pm.fromEquirectangular(tex).texture;
      prev?.dispose();
    }
    old?.dispose();
    return true;
  }

  dispose(): void {
    this.env?.dispose();
    this.background?.dispose();
    this.pm?.dispose();
    this.env = null;
    this.background = null;
    this.pm = null;
    this.key = '';
  }
}
