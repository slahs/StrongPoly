import * as THREE from 'three';

/**
 * Gemeinsame Uniforms des Stils „medieval“ (Umgebung, Gelände, Vegetation). Getrennt von `GFX` (materials.ts), damit der
 * Stil classic keine neuen Uniforms bekommt. GameScene setzt die Werte beim Stilwechsel und je Bild.
 */
export const ENVU = {
  /** Anteil der Halbkugel-Lichtquelle in PBR-Materialien: 0 im Stil medieval (Himmelslicht kommt aus der PMREM-Umgebung) */
  uHemiK: { value: 1 },
  /** Umgebungskarte (Wege, Kronendach, Spurrillen), siehe env/envmap.ts */
  uEnvMap: { value: null as THREE.Texture | null },
  /** Wegrichtung (doppelter Winkel) der Umgebungskarte */
  uEnvDir: { value: null as THREE.Texture | null },
  /** Kartengröße in Tiles (für uEnvMap) */
  uEnvInv: { value: new THREE.Vector2(1 / 128, 1 / 128) },
  /** Durchlicht der Blätter 0..1 (Grafikstufe) */
  uTrans: { value: 0.7 },
  /** Kamera (Welt), für Ausblenden/Überblenden der Vegetation */
  uCamPos: { value: new THREE.Vector3() },
  /** Grasbedeckung: Ausblendradius (Einheiten) der Grasinstanzen um die Kamera-Zielpunkt */
  uGrassFade: { value: new THREE.Vector4(0, 0, 20, 26) },
};

type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Halbkugel-Licht in einem PBR-Shader mit uHemiK gewichten (Himmelslicht nicht doppelt aus Umgebung + Halbkugel) */
export function patchHemiK(s: Shader): void {
  s.uniforms.uHemiK = ENVU.uHemiK;
  s.fragmentShader = s.fragmentShader
    .replace('void main() {', 'uniform float uHemiK;\nvoid main() {')
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('irradiance += getHemisphereLightIrradiance(', 'irradiance += uHemiK * getHemisphereLightIrradiance('));
}
