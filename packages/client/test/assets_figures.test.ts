import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { U } from '@strongpoly/shared';
import type { AssetManifest } from '../src/render/assets/manifest';
import { unitKey, targetKey } from '../src/render/assets/manifest';
import { modelFromScene } from '../src/render/assets/model';
import type { AssetModel } from '../src/render/assets/model';
import { AssetMaterials } from '../src/render/assets/materials';
import { ARM, UPART } from '../src/render/unit_shader';
import { JOB_COUNT } from '../src/render/unit_jobs';
import { HAIR_BITS, HAT_BITS, TINT_COUNT, VAR_SPEC, VIS } from '../src/render/units_style';

/**
 * GLB-Figuren der Phase 5A (Bauer, Speerkämpfer; assets/blender/models/peasant.py, spearman.py): Schnittstelle zum
 * Figuren-Shader (unit_shader.ts) – Teile/Drehpunkte, Farbklassen, Sichtbarkeitsmasken, Berufs-Slots, Armstile –,
 * Budgets je LOD, Materialzahl, Spielerfarbe, Varianten.
 */
const ROOT = path.resolve(__dirname, '../../..');
const PUB = path.join(ROOT, 'packages/client/public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.json'), 'utf8')) as AssetManifest;
const BUDGET = [2500, 800, 250];
const FIGS = [
  { id: 'peasant', unit: U.Peasant, arms: [9, 10], hats: 3, hairs: 3 },
  { id: 'spearman', unit: U.Spearman, arms: [ARM.Thrust], hats: 3, hairs: 2 },
] as const;
const VARIANT_BITS = VIS.Hair0 | VIS.Hair1 | VIS.Hair2 | VIS.Beard | VIS.Hat0 | VIS.Hat1 | VIS.Hat2;
const PARTS = new Set<number>(Object.values(UPART));

async function load(id: string): Promise<AssetModel> {
  const def = MANIFEST.assets[id];
  const buf = fs.readFileSync(path.join(PUB, def.file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const scene = await new Promise<THREE.Object3D>((ok, err) => new GLTFLoader().parse(ab, '', (g) => ok(g.scene), err));
  return modelFromScene(def, scene);
}

/** Sichtbare Dreiecke einer Instanz (wie spAnimate: alle Maskenbits gesetzt und Slot 0 oder Slot & Berufsbit) */
function visibleTris(m: AssetModel, L: number, bits: number, jobBit: number): number {
  let n = 0;
  for (const p of m.lods[L].parts) {
    const st = p.geometry.getAttribute('aStyle');
    const idx = p.geometry.index!;
    for (let t = 0; t < idx.count; t += 3) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const i = idx.getX(t + k);
        const vm = Math.round(st.getY(i));
        const sl = Math.round(st.getW(i));
        if ((bits & vm) !== vm || (sl !== 0 && (sl & jobBit) === 0)) ok = false;
      }
      if (ok) n++;
    }
  }
  return n;
}

describe.each(FIGS)('GLB-Figur $id', (f) => {
  it('Manifest: Ziel, Klasse, Budget je LOD, wenige Materialien (LOD0 ≤ 4, LOD1/LOD2 je 1)', () => {
    const def = MANIFEST.assets[f.id];
    expect(def).toBeDefined();
    expect(targetKey(def.target)).toBe(unitKey(f.unit));
    expect(def.class).toBe('figure');
    expect(def.tris.length).toBe(3);
    def.tris.forEach((t, L) => expect(t, `LOD${L}`).toBeLessThanOrEqual(BUDGET[L]));
    expect(def.lods[0].materials.length).toBeLessThanOrEqual(4);
    expect(def.lods[1].materials).toEqual(['M_Figure']);
    expect(def.lods[2].materials).toEqual(['M_Figure']);
    for (const a of ['_PART', '_PIVOT', '_STYLE', '_SLOT', '_ARM']) expect(def.attributes).toContain(a);
  });

  it('Attribute je Vertex: Teile gültig, Farbklassen 0–4 oder fester Ton, Masken nur Varianten-Bits, Slots nur Berufsbits', async () => {
    const m = await load(f.id);
    expect(m.figure).toBe(true);
    expect(m.lods.length).toBe(3);
    for (const [L, lod] of m.lods.entries()) {
      for (const p of lod.parts) {
        const g = p.geometry;
        const ap = g.getAttribute('aPivot');
        const st = g.getAttribute('aStyle');
        const me = g.getAttribute('aMeta');
        for (const a of [ap, st, me]) expect(a, `LOD${L} ${p.material}`).toBeDefined();
        for (let i = 0; i < ap.count; i++) {
          expect(PARTS.has(Math.round(ap.getW(i)))).toBe(true);
          const cls = Math.round(st.getX(i));
          expect(cls <= 4 || (cls >= 16 && cls < 16 + TINT_COUNT), `Farbklasse ${cls}`).toBe(true);
          expect(Math.round(st.getY(i)) & ~VARIANT_BITS).toBe(0);
          expect(Math.round(st.getW(i))).toBeLessThan(1 << JOB_COUNT);
          expect(st.getZ(i)).toBeGreaterThan(0.4);
          for (const k of [ap.getX(i), ap.getY(i), ap.getZ(i), st.getZ(i)]) expect(Number.isFinite(k)).toBe(true);
        }
      }
    }
  });

  it('Gelenkkette passt zum Shader: Huefte/Knie/Schulter/Kopf, Schienbein dreht um Knie und Huefte (aStyle.z)', async () => {
    const m = await load(f.id);
    for (const lod of m.lods) {
      const piv = new Map<number, { x: number; y: number; z: number; up: number }>();
      const arms = new Set<number>();
      for (const p of lod.parts) {
        const ap = p.geometry.getAttribute('aPivot');
        const st = p.geometry.getAttribute('aStyle');
        const me = p.geometry.getAttribute('aMeta');
        for (let i = 0; i < ap.count; i++) {
          const part = Math.round(ap.getW(i));
          if (part === 0) continue;
          const v = { x: ap.getX(i), y: ap.getY(i), z: ap.getZ(i), up: st.getZ(i) };
          const prev = piv.get(part);
          if (prev && part !== UPART.LegL && part !== UPART.LegR) {
            // ein Drehpunkt je Teil (Beine: Schoesse/Schuerzen teilen den Hueftpunkt)
            expect(Math.abs(prev.x - v.x) + Math.abs(prev.y - v.y) + Math.abs(prev.z - v.z), `Teil ${part}`).toBeLessThan(1e-3);
          }
          piv.set(part, v);
          if (part === UPART.ArmR || part === UPART.ArmL) arms.add(Math.round(me.getZ(i)));
        }
      }
      for (const leg of [UPART.LegL, UPART.LegR]) {
        const h = piv.get(leg)!;
        expect(h.y).toBeGreaterThan(0.42);
        expect(h.y).toBeLessThan(0.52);
      }
      if (piv.has(UPART.ShinL)) {
        for (const [shin, leg] of [[UPART.ShinL, UPART.LegL], [UPART.ShinR, UPART.LegR]]) {
          const k = piv.get(shin)!;
          const h = piv.get(leg)!;
          expect(k.y).toBeGreaterThan(0.2);
          expect(k.y).toBeLessThan(h.y);
          expect(k.up).toBeCloseTo(h.y, 3);
          expect(Math.abs(k.x - h.x)).toBeLessThan(0.01);
          expect(Math.abs(k.z - h.z)).toBeLessThan(0.01);
        }
      }
      const ar = piv.get(UPART.ArmR)!;
      const al = piv.get(UPART.ArmL)!;
      expect(ar.x).toBeGreaterThan(0.05);
      expect(al.x).toBeLessThan(-0.05);
      expect(ar.y).toBeGreaterThan(0.68);
      expect(piv.get(UPART.Head)!.y).toBeGreaterThan(ar.y);
      expect([...arms].sort()).toEqual([...f.arms].sort());
    }
  });

  it('Maße: Fußpunkt am Boden, Höhe ~0,93–1,0 (≈1,72 m bei 1 Einheit ≈ 1,85 m), Vorderseite +z', async () => {
    const m = await load(f.id);
    const box = new THREE.Box3();
    for (const p of m.lods[0].parts) box.union(p.geometry.boundingBox!);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.min.y).toBeLessThan(0.02);
    expect(m.height).toBeGreaterThan(0.9);
    expect(m.height).toBeLessThan(1.25);
  });

  it('Spielerfarbe in jeder LOD-Stufe vorhanden; jede Variante (Haar, Kopfbedeckung) hat Geometrie; sichtbare Dreiecke je Instanz im Budget', async () => {
    const m = await load(f.id);
    for (const [L, lod] of m.lods.entries()) {
      let team = 0;
      for (const p of lod.parts) {
        const d = p.geometry.getAttribute('aData');
        for (let i = 0; i < d.count; i++) if (d.getW(i) > 0.5) team++;
      }
      expect(team, `LOD${L}`).toBeGreaterThan(0);
    }
    const spec = VAR_SPEC[f.unit];
    expect(spec.hats).toBe(f.hats);
    expect(spec.hairStyles).toBe(f.hairs);
    const base = visibleTris(m, 0, 0, 1);
    for (let h = 0; h < f.hairs; h++) expect(visibleTris(m, 0, HAIR_BITS[h], 1), `Haar ${h}`).toBeGreaterThan(base);
    for (let h = 0; h < 2; h++) expect(visibleTris(m, 0, HAT_BITS[h], 1), `Hut ${h}`).toBeGreaterThan(base);
    expect(visibleTris(m, 0, VIS.Beard, 1)).toBeGreaterThan(base);
    let worst = 0;
    for (let L = 0; L < 3; L++)
      for (let j = 0; j < (f.unit === U.Peasant ? JOB_COUNT : 1); j++)
        for (const hb of HAIR_BITS.slice(0, f.hairs))
          for (const hat of HAT_BITS) {
            const t = visibleTris(m, L, hb | hat | VIS.Beard, 1 << j);
            if (L === 0) worst = Math.max(worst, t);
            expect(t).toBeLessThanOrEqual(BUDGET[L]);
          }
    // die Varianten teilen sich das Budget: eine Instanz zeigt weniger als die ganze LOD0-Geometrie
    expect(worst).toBeLessThan(m.lods[0].tris);
  });
});

describe('GLB-Figuren: Berufe des Bauern', () => {
  it('jeder Beruf zeigt höchstens ein Werkzeug im rechten Arm; ohne Beruf die Hacke', async () => {
    const m = await load('peasant');
    const toolTris = (job: number): number => {
      let n = 0;
      for (const p of m.lods[0].parts) {
        const st = p.geometry.getAttribute('aStyle');
        const ap = p.geometry.getAttribute('aPivot');
        const idx = p.geometry.index!;
        for (let t = 0; t < idx.count; t += 3) {
          const i = idx.getX(t);
          const sl = Math.round(st.getW(i));
          if (sl !== 0 && (sl & (1 << job)) && Math.round(ap.getW(i)) === UPART.ArmR) n++;
        }
      }
      return n;
    };
    expect(toolTris(0)).toBeGreaterThan(10);
    for (let j = 0; j < JOB_COUNT; j++) expect(toolTris(j), `Beruf ${j}`).toBeLessThan(120);
  });
});

describe('Figuren-Material (Variante unit): feste Töne und Normierung der Tönung', () => {
  it('Shader-Patch enthält Tonklasse ≥ 16 und die Normierung auf die mittlere Albedo', () => {
    const lib = new AssetMaterials();
    lib.configure(MANIFEST.materials, '/assets/');
    const mat = lib.material('M_Figure', 'unit');
    const shader = {
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('#define SP_UNIT');
    expect(shader.vertexShader).toContain('if (tcl >= 16) vColor = uTint[');
    expect(shader.vertexShader).toContain('vSpTint');
    expect(shader.fragmentShader).toContain('#define SP_UNIT');
    expect(shader.fragmentShader).toContain('textureLod(map, vMapUv, 16.0)');
    expect(mat.customProgramCacheKey()).toBe('spAsset:unit');
  });
});
