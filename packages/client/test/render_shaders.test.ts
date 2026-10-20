import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { animDepthMaterial, animMaterial, foliageDepthMaterial, foliageMaterial, GFX, grassMaterial, staticMaterial, terrainMaterial, waterMaterial } from '../src/render/materials';

/**
 * Die Materialien verändern die Standard-Shader von three.js per String-Ersetzung (onBeforeCompile). Fehlt ein Anker nach
 * einem three.js-Update, passiert die Ersetzung still nicht und das Bild bricht ohne Fehlermeldung. Diese Tests laufen
 * die Patches gegen die Shader-Texte der installierten Version und prüfen, dass jede Ersetzung gegriffen hat.
 * (Das tatsächliche Kompilieren im Browser prüft `node scripts/shots.mjs --check`.)
 */
describe('Shader-Patches greifen', () => {
  type Sh = { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string };
  const patched = (m: THREE.Material, base: 'lambert' | 'depth'): Sh => {
    const lib = base === 'lambert' ? THREE.ShaderLib.lambert : THREE.ShaderLib.depth;
    const sh: Sh = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    (m as unknown as { onBeforeCompile: (s: Sh, r: unknown) => void }).onBeforeCompile(sh, null);
    return sh;
  };

  it('Anker der Lambert- und Tiefen-Shader existieren in dieser three.js-Version', () => {
    for (const a of ['void main() {', '#include <begin_vertex>', '#include <color_vertex>', '#include <project_vertex>']) expect(THREE.ShaderLib.lambert.vertexShader, a).toContain(a);
    for (const a of ['void main() {', '#include <color_fragment>', '#include <envmap_fragment>', '#include <normal_fragment_maps>']) expect(THREE.ShaderLib.lambert.fragmentShader, a).toContain(a);
    for (const a of ['void main() {', '#include <begin_vertex>']) expect(THREE.ShaderLib.depth.vertexShader, a).toContain(a);
    expect(THREE.ShaderChunk.colorspace_fragment).toContain('linearToOutputTexel');
    // eigene Farbkorrektur ist eingesetzt
    expect(THREE.ShaderChunk.colorspace_fragment).toContain('spc');
  });

  it('alle gemeinsamen Materialien werden wie vorgesehen verändert', () => {
    const anim = patched(animMaterial(), 'lambert');
    expect(anim.vertexShader).toContain('spAnimate(transformed)');
    expect(anim.vertexShader).toContain('spB');
    expect(anim.vertexShader).toContain('vSpW = ');
    expect(anim.fragmentShader).toContain('uCloud');
    expect(anim.fragmentShader).toContain('uRim');
    const st = patched(staticMaterial(), 'lambert');
    expect(st.vertexShader).toContain('attribute vec3 aMeta');
    expect(st.fragmentShader).toContain('uCloud');
    const fo = patched(foliageMaterial(), 'lambert');
    expect(fo.vertexShader).toContain('spSway(transformed');
    expect(fo.vertexShader).toContain('instanceColor');
    expect(fo.fragmentShader).toContain('spn');
    const gr = patched(grassMaterial(), 'lambert');
    expect(gr.vertexShader).toContain('uWindDir');
    expect(gr.fragmentShader).toContain('uCloud');
    const te = patched(terrainMaterial(), 'lambert');
    expect(te.vertexShader).toContain('aSurf');
    expect(te.fragmentShader).toContain('spBump');
    expect(te.fragmentShader).toContain('uGround');
    expect(te.fragmentShader).toContain('spG.a');
    const d1 = patched(animDepthMaterial(), 'depth');
    expect(d1.vertexShader).toContain('spAnimate(transformed)');
    const d2 = patched(foliageDepthMaterial(), 'depth');
    expect(d2.vertexShader).toContain('spSway(transformed');
    // Uniforms zeigen auf die gemeinsamen Objekte (GameScene steuert sie zentral)
    expect(anim.uniforms.uTime).toBe(GFX.uTime);
    expect(te.uniforms.uGround).toBe(GFX.uGround);
    expect(te.uniforms.uNoiseA).toBe(GFX.uNoiseA);
    expect(fo.uniforms.uTreeSway).toBe(GFX.uTreeSway);
  });

  it('Wasser: flach (Lambert) oder animierter Shader mit gemeinsamen Uniforms', () => {
    const flat = waterMaterial(false);
    expect(flat).toBeInstanceOf(THREE.MeshLambertMaterial);
    const anim = waterMaterial(true) as THREE.ShaderMaterial;
    expect(anim).toBeInstanceOf(THREE.ShaderMaterial);
    expect(anim.uniforms.uTime).toBe(GFX.uTime);
    expect(anim.uniforms.uNoiseN).toBe(GFX.uNoiseN);
    expect(anim.fragmentShader).toContain('uWaterLv');
    expect(anim.fragmentShader).toContain('#include <fog_fragment>');
    expect(anim.transparent).toBe(true);
    expect(anim.depthWrite).toBe(false);
  });

  it('Rauschtexturen sind vorhanden, kachelbar eingestellt und mit Mipmaps', () => {
    animMaterial();
    const a = GFX.uNoiseA.value as THREE.DataTexture;
    const n = GFX.uNoiseN.value as THREE.DataTexture;
    for (const t of [a, n]) {
      expect(t).toBeTruthy();
      expect(t.wrapS).toBe(THREE.RepeatWrapping);
      expect(t.generateMipmaps).toBe(true);
      expect(t.format).toBe(THREE.RGBAFormat);
      expect(t.type).toBe(THREE.UnsignedByteType);
    }
  });
});
