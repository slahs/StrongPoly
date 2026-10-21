import * as THREE from 'three';
import { ANIM_PARS, FRAG_PARS, FRAG_TAIL, GFX, WORLD_POS, ensureNoiseTextures, shareUniforms } from '../materials';
import { FRAG_CLIP } from '../building_materials';
import { UNIT_ANIM_PARS, uTintUniform } from '../unit_shader';
import { TINT_COUNT } from '../units_style';
import type { MapEntry, MapKind, MaterialDef } from './manifest';
import { patchHemiK } from '../env/uniforms';

/**
 * Laufzeit-Materialbibliothek: jedes Bibliotheksmaterial `M_*` wird EIN MeshStandardMaterial (je Variante), egal wie viele
 * Assets es nutzen. Texturen (Albedo sRGB, Normal und ORM linear; ORM = R AO, G Rauheit, B Metall wie glTF) werden extern
 * über den Materialnamen aufgelöst (`public/assets/textures/<M_Name>/`), mit Mipmaps, Anisotropie und Wiederholung geladen.
 * Fehlt eine Textur, gelten die Rückfallwerte aus dem Manifest (Grundfarbe, Rauheit, Metall).
 *
 * Shader-Ergänzungen (onBeforeCompile, ein Programm je Variante und Texturkombination, von allen M_* geteilt):
 *  - Vertex-Animation wie die prozeduralen Modelle (spAnimate aus materials.ts bzw. unit_shader.ts für Figuren)
 *  - Datenfarbe aData: AO (wirkt auf indirektes Licht voll, auf direktes teilweise), Schmutz (Richtung uDirt, rauer),
 *    Kantenabnutzung (heller, glatter), Teamfarbe (Instanzfarbe)
 *  - Instanzvariation (Helligkeit/Farbton aus der Instanzphase, uVar), Wolkenschatten, Randlicht, Grading (global)
 *  - Variante 'clip': Höhenmaske der Bauanimation (aBuild, iAnim.z) wie building_materials.ts
 *  - Variante 'unit' (GLB-Figuren): Farbklassen aus aStyle.x wie die prozeduralen Figuren (1 Haut, 2 Haar, 3/4 Stoffe je
 *    Instanz) und zusätzlich feste Töne (Klasse ≥ 16 → Eintrag Klasse − 16 der Tonetabelle: Holz, Stroh, Leder, Eisen ohne
 *    eigenes Material). Getönte und spielerfarbene Teile werden auf die mittlere Albedo ihres Materials normiert (kleinste
 *    Mipmap der Albedo-Textur bzw. Grundfarbe): die Textur liefert nur noch die Struktur, der Ton bestimmt die Farbe – sonst
 *    würde z. B. eine braune Wolltextur jede Spielerfarbe abdunkeln und verfälschen.
 */

export type AssetVariant = 'final' | 'clip' | 'unit';

export interface TexStats {
  textures: number;
  /** geschätzter GPU-Speicher der Texturen in Byte (unkomprimiert RGBA8 + Mipmaps bzw. Blockformat) */
  bytes: number;
  /** Ladezeit aller Texturen (ms, Summe) */
  loadMs: number;
  failed: number;
}

const VERT_PARS = /* glsl */ `
attribute vec4 aBuild;
attribute vec4 aData;
uniform float uVar;
varying vec3 vLocal;
varying vec4 vBuild;
varying float vProg;
varying vec4 vData;
varying vec3 vSpW;
varying float vSpTint;
`;

const VERT_BEGIN = /* glsl */ `
vLocal = transformed;
vBuild = aBuild;
vProg = iAnim.z;
vData = aData;
transformed = spAnimate(transformed);
`;

/** Teamfarbe (aData.a) und Instanzvariation; Figuren zusätzlich Farbklassen (Haut/Haar/Stoffe) und Helligkeit (iVar) */
const COLOR_VERTEX = /* glsl */ `
vColor = vec3(1.0);
vSpTint = 0.0;
#ifdef SP_UNIT
{
  int tcl = int(aStyle.x + 0.5);
  if (tcl > 0) {
    int pk = int(iVar.x + 0.5);
    vSpTint = 1.0;
    if (tcl >= 16) vColor = uTint[min(tcl - 16, ${TINT_COUNT - 1})];
    else if (tcl == 1) vColor = uTint[pk & 7];
    else if (tcl == 2) vColor = uTint[8 + ((pk >> 3) & 7)];
    else if (tcl == 3) vColor = uTint[16 + ((pk >> 6) & 31)];
    else vColor = uTint[16 + ((pk >> 11) & 31)];
  }
  vColor *= (iVar.y > 0.0 ? iVar.y : 1.0);
}
#endif
#ifdef USE_INSTANCING_COLOR
  vColor = mix(vColor, instanceColor.rgb, aData.a);
  #ifdef SP_UNIT
  vSpTint = max(vSpTint, step(0.5, aData.a));
  #endif
#endif
#ifndef SP_UNIT
{
  float spHas = step(0.0001, iAnim.x);
  float spA = fract(iAnim.x * 7.3137 + 0.31);
  float spB = fract(iAnim.x * 13.771 + 0.57);
  float spK = spHas * uVar * (1.0 - aData.a);
  vColor *= 1.0 + (spA - 0.5) * 0.12 * spK;
  vColor *= vec3(1.0) + vec3(0.035, 0.0, -0.05) * ((spB - 0.5) * 2.0 * spK);
}
#endif
`;

const FRAG_PARS_ASSET = /* glsl */ `
varying vec3 vLocal;
varying vec4 vBuild;
varying float vProg;
varying vec4 vData;
varying float vSpTint;
uniform vec3 uDirt;
uniform float uAo;
`;

const FRAG_SURFACE = /* glsl */ `
#include <color_fragment>
#ifdef SP_UNIT
{
  // getönte Figurenteile: auf die mittlere Albedo des Materials normieren (1×1-Mipmap = Mittelwert der Textur)
  #ifdef USE_MAP
    vec3 spAvg = textureLod(map, vMapUv, 16.0).rgb * diffuse;
  #else
    vec3 spAvg = diffuse;
  #endif
  // Struktur relativ zur mittleren Albedo, auf Figurenmaßstab gedämpft (Webmuster sonst wie ein Gitter)
  vec3 spRel = diffuseColor.rgb / max(spAvg * vColor, vec3(0.002));
  vec3 spTinted = vColor * mix(vec3(1.0), spRel, 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, spTinted, vSpTint);
}
#endif
{
  // Schmutz (Vertexfarbe G) zieht Richtung Schmutzfarbe, Kantenabnutzung (B) hellt leicht auf; frische Baukante heller
  float spD = clamp(vData.g, 0.0, 1.0);
  vec3 spDirt = uDirt * (0.75 + 0.25 * dot(diffuseColor.rgb, vec3(0.333)) / max(0.05, dot(uDirt, vec3(0.333))));
  diffuseColor.rgb = mix(diffuseColor.rgb, spDirt, spD * 0.7);
  diffuseColor.rgb *= 1.0 + clamp(vData.b, 0.0, 1.0) * 0.2;
  diffuseColor.rgb *= 1.0 + bEdge * 0.22;
}
`;

const FRAG_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + vData.g * 0.06 - vData.b * 0.12, 0.05, 1.0);
`;

const FRAG_AO = /* glsl */ `
#include <aomap_fragment>
{
  float spAO = mix(1.0, clamp(vData.r, 0.0, 1.0), uAo);
  reflectedLight.indirectDiffuse *= spAO;
  reflectedLight.indirectSpecular *= spAO;
  reflectedLight.directDiffuse *= mix(1.0, spAO, 0.45);
  reflectedLight.directSpecular *= spAO;
}
`;

function patch(s: THREE.WebGLProgramParametersWithUniforms, variant: AssetVariant, dirt: { value: THREE.Color }): void {
  ensureNoiseTextures();
  shareUniforms(s);
  // Stil medieval: Himmelslicht aus der Umgebung (scene.environment), Halbkugel nicht doppelt (uHemiK = 0; classic 1)
  patchHemiK(s);
  s.uniforms.uAo = GFX.uAo;
  s.uniforms.uVar = GFX.uVar;
  s.uniforms.uDirt = dirt;
  const unit = variant === 'unit';
  if (unit) s.uniforms.uTint = uTintUniform;
  s.vertexShader = s.vertexShader
    .replace('void main() {', (unit ? '#define SP_UNIT\n' + UNIT_ANIM_PARS : ANIM_PARS) + VERT_PARS + '\nvoid main() {')
    .replace('#include <color_vertex>', COLOR_VERTEX)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BEGIN)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_POS);
  s.fragmentShader = s.fragmentShader
    .replace('void main() {', FRAG_PARS + FRAG_PARS_ASSET + '\nvoid main() {\n' + FRAG_CLIP)
    .replace('#include <color_fragment>', FRAG_SURFACE)
    .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
    .replace('#include <aomap_fragment>', FRAG_AO)
    .replace('#include <opaque_fragment>', FRAG_TAIL + '\n#include <opaque_fragment>');
  if (variant === 'clip') s.fragmentShader = '#define BUILD_CLIP\n' + s.fragmentShader;
  if (unit) s.fragmentShader = '#define SP_UNIT\n' + s.fragmentShader;
}

function srgbHex(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Bytes je Pixel der Blockformate (KTX2 → GPU-Format); unkomprimiert 4 */
function bppOf(t: THREE.Texture): number {
  const f = t.format as number;
  if ((t as THREE.CompressedTexture).isCompressedTexture) {
    // BC1/ETC1/ETC2 RGB: 0,5; BC3/BC7/ASTC 4x4/ETC2 RGBA: 1
    const half = [THREE.RGB_S3TC_DXT1_Format, THREE.RGBA_S3TC_DXT1_Format, THREE.RGB_ETC1_Format, THREE.RGB_ETC2_Format, THREE.RGB_PVRTC_4BPPV1_Format, THREE.RGBA_PVRTC_4BPPV1_Format];
    return (half as number[]).includes(f) ? 0.5 : 1;
  }
  return 4;
}

/** geschätzter GPU-Speicher einer Textur (mit Mipmap-Kette ≈ 4/3) */
export function textureBytes(w: number, h: number, bpp: number, mips = true): number {
  return Math.round(w * h * bpp * (mips ? 4 / 3 : 1));
}

/** Datei einer Karte für eine Höchstgröße wählen (größte vorhandene Fassung ≤ max, sonst die kleinste vorhandene) */
export function pickMapFile(e: MapEntry, maxSize: number, ktx2: boolean): string {
  if (ktx2 && e.format !== 'ktx2' && e.alt?.ktx2) return e.alt.ktx2;
  if (!ktx2 && e.format === 'ktx2') {
    const alt = e.alt?.webp ?? e.alt?.jpg ?? e.alt?.png;
    if (alt) return alt;
  }
  const full = Math.max(e.w, e.h);
  if (!e.sizes || full <= maxSize) return e.file;
  const sizes = Object.keys(e.sizes).map(Number).sort((a, b) => b - a);
  const fit = sizes.find((s) => s <= maxSize);
  return e.sizes[String(fit ?? sizes[sizes.length - 1])];
}

type KtxLoader = { load(url: string, ok: (t: THREE.Texture) => void, p?: unknown, err?: (e: unknown) => void): void; detectSupport(r: THREE.WebGLRenderer): unknown };

/** Materialbibliothek (eine Instanz je Renderer/Seite) */
export class AssetMaterials {
  defs: Record<string, MaterialDef> = {};
  base = '/assets/';
  /** Hash-Anhang je Datei (Cache-Busting) */
  version: Record<string, string> = {};
  renderer: THREE.WebGLRenderer | null = null;
  maxSize = 1024;
  anisotropy = 4;
  /** KTX2 benutzen, wenn vorhanden (nur mit Renderer und Transcoder) */
  useKtx2 = true;
  private textures = new Map<string, Promise<THREE.Texture | null>>();
  private loaded = new Map<string, THREE.Texture>();
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private dirt = new Map<string, { value: THREE.Color }>();
  private env: THREE.Texture | null = null;
  private ktx: KtxLoader | null = null;
  readonly stats: TexStats = { textures: 0, bytes: 0, loadMs: 0, failed: 0 };

  configure(defs: Record<string, MaterialDef>, base: string): void {
    this.defs = defs;
    this.base = base;
  }

  /** Grafikstufe: Höchstgröße der Texturen (wirkt auf neu geladene Texturen) und Anisotropie (sofort) */
  setQuality(maxSize: number, anisotropy: number): void {
    this.maxSize = maxSize;
    const cap = this.renderer ? this.renderer.capabilities.getMaxAnisotropy() : anisotropy;
    this.anisotropy = Math.max(1, Math.min(anisotropy, cap));
    for (const t of this.loaded.values()) {
      if (t.anisotropy !== this.anisotropy) {
        t.anisotropy = this.anisotropy;
        t.needsUpdate = true;
      }
    }
  }

  private url(file: string): string {
    const v = this.version[file];
    return this.base + file + (v ? `?v=${v}` : '');
  }

  private async ktxLoader(): Promise<KtxLoader | null> {
    if (this.ktx || !this.renderer || !this.useKtx2) return this.ktx;
    const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js');
    const l = new KTX2Loader().setTranscoderPath(this.base + 'basis/');
    l.detectSupport(this.renderer);
    this.ktx = l as unknown as KtxLoader;
    return this.ktx;
  }

  /** Eine Karte laden (einmal je Datei); null bei Fehler (Material nutzt dann die Rückfallwerte) */
  private loadMap(e: MapEntry, kind: MapKind): Promise<THREE.Texture | null> {
    const file = pickMapFile(e, this.maxSize, this.useKtx2 && !!this.renderer && (e.format === 'ktx2' || !!e.alt?.ktx2));
    const have = this.textures.get(file);
    if (have) return have;
    const t0 = performance.now();
    const p = (async (): Promise<THREE.Texture | null> => {
      try {
        let tex: THREE.Texture;
        if (file.endsWith('.ktx2')) {
          const l = await this.ktxLoader();
          if (!l) throw new Error('KTX2 nicht verfügbar');
          tex = await new Promise<THREE.Texture>((ok, err) => l.load(this.url(file), ok, undefined, err));
        } else {
          tex = await new THREE.TextureLoader().loadAsync(this.url(file));
          tex.flipY = false;
          tex.generateMipmaps = true;
        }
        // UVs kommen aus glTF (Ursprung oben links) wie bei GLTFLoader: flipY = false
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = this.anisotropy;
        tex.colorSpace = kind === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        tex.name = file;
        const img = tex.image as { width?: number; height?: number } | undefined;
        const w = img?.width ?? e.w;
        const h = img?.height ?? e.h;
        this.stats.textures++;
        this.stats.bytes += textureBytes(w, h, bppOf(tex));
        this.stats.loadMs += performance.now() - t0;
        this.loaded.set(file, tex);
        return tex;
      } catch {
        this.stats.failed++;
        return null;
      }
    })();
    this.textures.set(file, p);
    return p;
  }

  /** Lädt die Texturen der genannten Materialien (vor dem ersten Zeichnen eines Assets, damit nichts schwarz aufblitzt) */
  async ensure(names: string[]): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const n of names) {
      const d = this.defs[n];
      if (!d) continue;
      for (const k of ['albedo', 'normal', 'orm'] as MapKind[]) {
        const e = d.maps?.[k];
        if (e) jobs.push(this.loadMap(e, k));
      }
    }
    await Promise.all(jobs);
  }

  /** geladene Karte eines Bibliotheksmaterials (nach ensure), sonst null – z. B. für die Gelände-Texturarrays (env/) */
  texture(name: string, kind: MapKind): THREE.Texture | null {
    return this.tex(name, kind);
  }

  /** Umgebung für Glanz/Metall (gemeinsame kleine PMREM); `null` = scene.environment (Stil medieval: Himmel) verwenden */
  set sceneEnv(on: boolean) {
    this.useSceneEnv = on;
    for (const m of this.mats.values()) {
      m.envMap = on ? null : this.envMap();
      m.envMapIntensity = on ? 1 : 0.45;
      m.needsUpdate = true;
    }
  }
  private useSceneEnv = false;

  private tex(name: string, kind: MapKind): THREE.Texture | null {
    const e = this.defs[name]?.maps?.[kind];
    if (!e) return null;
    const file = pickMapFile(e, this.maxSize, this.useKtx2 && !!this.renderer && (e.format === 'ktx2' || !!e.alt?.ktx2));
    return this.loaded.get(file) ?? null;
  }

  /** Umgebungslicht für Glanz/Metall: kleiner Himmelsverlauf als PMREM (nur mit Renderer) */
  private envMap(): THREE.Texture | null {
    if (this.env || !this.renderer) return this.env;
    // kleines Equirect-Bild (64x32, Himmel → Horizont → Boden) statt einer Szene: PMREM 336x64 statt 768x1024 (≈0,2 statt 6 MB)
    const W = 64;
    const H = 32;
    const top = new THREE.Color(0x8fb0d4);
    const mid = new THREE.Color(0xe8e2d2);
    const bot = new THREE.Color(0x6b5a40);
    const data = new Float32Array(W * H * 4);
    const c = new THREE.Color();
    for (let y = 0; y < H; y++) {
      const h = ((y + 0.5) / H) * 2 - 1; // Zeile 0 = unten (v = 0)
      if (h > 0) c.copy(mid).lerp(top, Math.pow(h, 0.6));
      else c.copy(mid).lerp(bot, Math.pow(-h, 0.4));
      for (let x = 0; x < W; x++) data.set([c.r, c.g, c.b, 1], (y * W + x) * 4);
    }
    const eq = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    eq.mapping = THREE.EquirectangularReflectionMapping;
    eq.colorSpace = THREE.LinearSRGBColorSpace;
    eq.needsUpdate = true;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromEquirectangular(eq).texture;
    pm.dispose();
    eq.dispose();
    return this.env;
  }

  /** Das gemeinsame Material eines Bibliotheksnamens in einer Variante (Rückfall: neutrales Material für unbekannte Namen) */
  material(name: string, variant: AssetVariant): THREE.MeshStandardMaterial {
    const key = `${name}|${variant}`;
    const have = this.mats.get(key);
    if (have) return have;
    const d: MaterialDef = this.defs[name] ?? { base: '#a09a90', rough: 0.85, metal: 0, tile: 2, dirt: '#40362a', maps: {} };
    let dirt = this.dirt.get(name);
    if (!dirt) {
      dirt = { value: srgbHex(d.dirt) };
      this.dirt.set(name, dirt);
    }
    const map = this.tex(name, 'albedo');
    const nrm = this.tex(name, 'normal');
    const orm = this.tex(name, 'orm');
    const m = new THREE.MeshStandardMaterial({
      name,
      color: map ? 0xffffff : srgbHex(d.base),
      roughness: orm ? 1 : d.rough,
      metalness: orm ? 1 : d.metal,
      map,
      normalMap: nrm,
      aoMap: orm,
      roughnessMap: orm,
      metalnessMap: orm,
      envMap: this.useSceneEnv ? null : this.envMap(),
      envMapIntensity: this.useSceneEnv ? 1 : 0.45,
      side: d.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      alphaTest: d.alphaTest ?? 0,
    });
    if (nrm && d.normalScale) m.normalScale.set(d.normalScale, d.normalScale);
    // Figuren: Normalen der Bibliothek halb so stark (Stoffbindung/Ledernarbung ist im Figurenmaßstab bewusst vergrößert)
    if (nrm && variant === 'unit') m.normalScale.multiplyScalar(0.5);
    if (orm) m.aoMapIntensity = 1;
    const dRef = dirt;
    m.onBeforeCompile = (s) => patch(s, variant, dRef);
    m.customProgramCacheKey = () => `spAsset:${variant}`;
    this.mats.set(key, m);
    return m;
  }

  /** Grundfarbe (linear) eines Bibliotheksmaterials – Bauvorschau, Statistik */
  baseColor(name: string): THREE.Color {
    return srgbHex(this.defs[name]?.base ?? '#a09a90');
  }

  /** alle Materialien/Texturen freigeben (z. B. Stilwechsel) */
  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.loaded.values()) t.dispose();
    this.mats.clear();
    this.loaded.clear();
    this.textures.clear();
    this.env?.dispose();
    this.env = null;
    Object.assign(this.stats, { textures: 0, bytes: 0, loadMs: 0, failed: 0 });
  }
}
