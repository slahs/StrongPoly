import * as THREE from 'three';
import { GameMap, T } from '@strongpoly/shared';
import { RtsCamera } from './camera';
import { DecorRenderer } from './decor';
import { AmbientLife } from './ambient';
import { GroundMap } from './groundmap';
import { GFX, ensureNoiseTextures, setNoiseAnisotropy } from './materials';
import { QualityCfg, qualityOf } from './quality';
import { FOG_COLOR, TerrainRenderer } from './terrain';
import { assetRegistry } from './assets/registry';
import type { ArtStyle } from './assets/registry';
import { MEDIEVAL_LOOK, MedievalSky, fogDensityFor, sunColorOf, sunDirOf, toneMapJs, currentToneOp } from './env/atmosphere';
import { ENVU } from './env/uniforms';
import { EnvMap } from './env/envmap';
import type { RoadSeg } from './env/envmap';
import { MedievalDecor } from './env/veg_layer';
import type { PropPlacement } from './env/veg_layer';
import { TERRAIN_LAYERS, TerrainTextures, medievalTerrainMaterial, terrainTexSize } from './env/terrain_medieval';

export interface GfxSettings {
  shadows: boolean;
  quality: 'low' | 'medium' | 'high';
  pixelRatio: number;
}

/** Richtung vom Boden zur Sonne (tiefer, warmer Sonnenstand aus Südwest, sichtbare Schatten) */
const SUN_DIR = new THREE.Vector3(-0.38, 0.8, 0.46).normalize();
/** Spielwert des Sonnenstands (SUN_DIR kann nur das LookDev verändern, siehe GameScene.setSun) */
const SUN_GAME = SUN_DIR.clone();
/** Stil medieval: tieferer Nachmittagsstand (Südwest, 34°) – lange, plastische Schatten, warmes Licht */
const SUN_MEDIEVAL = new THREE.Vector3(...sunDirOf(232, 34));
const SUN_DIST = 90;
/**
 * Lichtstimmung (Refined Stylized Medieval): tiefe, warme Sonne, leicht kühler Himmel. Die Schatten bekommen dadurch
 * einen kühlen Stich und die Sonnenseiten bleiben warm: Farbkontrast statt reiner Helligkeit.
 */
const LOOK = {
  sunColor: 0xffe0b0,
  sunIntensity: 2.15,
  skyColor: 0xdfe6ee,
  groundColor: 0x9a8560,
  hemiIntensity: 1.05,
  /** Himmelsfarbe für Reflexe/Randlicht */
  skyReflect: 0xa9c4dc,
  exposure: 1.1,
};
const SHADOW_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  pcfsoft: THREE.PCFSoftShadowMap,
} as const;

/** Besitzt Renderer, Szene, Licht und Kamera. Der Renderer liest nur Zustand. */
/** Kantenglättung aus den gespeicherten Einstellungen (wirkt beim Start) */
function readAA(): boolean {
  try {
    return (JSON.parse(localStorage.getItem('strongpoly.settings') ?? '{}') as { aa?: boolean }).aa !== false;
  } catch {
    return true;
  }
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: RtsCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  terrain: TerrainRenderer | null = null;
  /** Dekoration: classic prozedural, medieval GLB-Vegetation (mit prozeduralem Rückfall) */
  decor: DecorRenderer | MedievalDecor | null = null;
  /** Vögel, Schmetterlinge, treibende Blätter (ab Stufe Mittel) */
  ambient: AmbientLife | null = null;
  map: GameMap | null = null;
  /** Bodenkarte (Trampelpfade, Felder, Kontaktschatten) der aktuellen Karte */
  ground: GroundMap | null = null;
  gfx: GfxSettings = { shadows: true, quality: 'medium', pixelRatio: Math.min(window.devicePixelRatio, 2) };
  /** aktuell wirksame Werte der Grafikstufe (siehe render/quality.ts) */
  qcfg: QualityCfg = qualityOf('medium');
  readonly root = new THREE.Group();
  private t0 = performance.now() / 1000;
  private shadowExt = 0;
  private lastShadowType = '';
  /** Rückruf nach jeder Änderung der Grafikstufe (z. B. für EntityRenderer) */
  onGfx: ((q: QualityCfg, shadows: boolean) => void) | null = null;
  /** Grafikstil (folgt assetRegistry.style): classic = Phase-4-Darstellung unverändert, medieval = Umgebung aus env/ */
  style: ArtStyle = 'classic';
  /** Himmel/Umgebung des Stils medieval */
  private sky: MedievalSky | null = null;
  private fogClassic: THREE.Fog;
  private fogMed = new THREE.FogExp2(0xc9cfd2, 0.01);
  /** vom LookDev gesetzter Sonnenstand (null = Standard des Stils) */
  private sunUser: THREE.Vector3 | null = null;
  /** Rückruf nach einem Stilwechsel (Terrain/Dekor wurden neu aufgebaut) */
  onStyle: ((s: ArtStyle) => void) | null = null;
  /** Stil medieval: Umgebungskarte (Wege, Kronendach) der aktuellen Karte */
  envMap: EnvMap | null = null;
  /** Stil medieval: Texturarrays der Bodenschichten */
  readonly terrainTex = new TerrainTextures();
  private terrainTexState: 'none' | 'loading' | 'ready' = 'none';
  /** zusätzliche Wege und feste Requisiten (LookDev; nur Stil medieval) */
  private envExtras: { roads: RoadSeg[]; props: PropPlacement[] } = { roads: [], props: [] };
  private readonly aa: boolean;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.aa = readAA();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.aa, powerPreference: 'high-performance' });
    this.renderer.setClearColor(FOG_COLOR);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tonemapping (Khronos-neutral: erhält die Palette, rollt Lichter weich ab; das Grading steckt in materials.ts)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = LOOK.exposure;
    ensureNoiseTextures();
    assetRegistry.attachRenderer(this.renderer);
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.fogClassic = new THREE.Fog(FOG_COLOR, 60, 200);
    this.scene.fog = this.fogClassic;
    this.scene.add(this.root);

    // Himmel leicht kühl, Boden warm zurückgeworfen; Sonne tief und golden
    this.hemi = new THREE.HemisphereLight(LOOK.skyColor, LOOK.groundColor, LOOK.hemiIntensity);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(LOOK.sunColor, LOOK.sunIntensity);
    this.sun.position.copy(SUN_DIR).multiplyScalar(SUN_DIST).add(new THREE.Vector3(30, 0, 30));
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 300;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.intensity = 0.8;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.applyLook();
    this.cam = new RtsCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.applyGfx({});
    this.applyStyle(assetRegistry.style);
    assetRegistry.onChange(() => this.applyStyle(assetRegistry.style));
  }

  /**
   * Grafikstil anwenden. classic: Licht, Tonemapping, Nebel, Gelände und Dekor exakt wie in Phase 4. medieval: Himmel als
   * PMREM-Umgebung + Hintergrund, Sonne aus dem Sonnenstand, Exponentialnebel in Horizontfarbe, AgX-Tonemapping mit
   * eigener Abstimmung, Gelände mit Materialbibliothek und Vegetation aus GLB-Assets (env/).
   */
  applyStyle(s: ArtStyle): void {
    if (s === this.style) return;
    this.style = s;
    const med = s === 'medieval';
    if (med) {
      this.sky ??= new MedievalSky(this.renderer);
      this.renderer.toneMapping = THREE.CustomToneMapping;
      this.renderer.toneMappingExposure = MEDIEVAL_LOOK.exposure;
      this.scene.fog = this.fogMed;
      this.sun.shadow.intensity = 1;
      ENVU.uHemiK.value = 0;
      assetRegistry.materials.sceneEnv = true;
    } else {
      this.renderer.toneMapping = THREE.NeutralToneMapping;
      this.renderer.toneMappingExposure = LOOK.exposure;
      this.scene.fog = this.fogClassic;
      this.scene.environment = null;
      this.scene.background = new THREE.Color(FOG_COLOR);
      this.renderer.setClearColor(FOG_COLOR);
      this.sun.shadow.intensity = 0.8;
      this.sun.color.set(LOOK.sunColor);
      this.sun.intensity = LOOK.sunIntensity;
      this.hemi.color.set(LOOK.skyColor);
      this.hemi.groundColor.set(LOOK.groundColor);
      this.hemi.intensity = LOOK.hemiIntensity;
      ENVU.uHemiK.value = 1;
      assetRegistry.materials.sceneEnv = false;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.05;
      this.sky?.dispose();
      this.sky = null;
      this.terrainTex.dispose();
      this.terrainTexState = 'none';
    }
    this.applyLook();
    this.shadowExt = 0;
    if (this.map) this.setMap(this.map);
    this.onStyle?.(s);
  }

  /** Nebelweite zusätzlich skalieren (Prüfszenen/Übersichten); 1 = normal. Der Nebel folgt sonst dem Kameraabstand. */
  fogScale = 1;
  setOverview(scale: number): void {
    this.fogScale = scale;
  }

  /**
   * Sonnenstand (nur LookDev/Vergleiche): Azimut in Grad (0 = Norden = −z, 90 = Osten = +x, im Uhrzeigersinn), Höhe in Grad.
   * `null` stellt den festen Spielwert wieder her. Das Spiel ruft dies nie auf.
   */
  setSun(azDeg: number | null, elDeg = 50): void {
    if (azDeg === null) this.sunUser = null;
    else {
      const az = THREE.MathUtils.degToRad(azDeg);
      const el = THREE.MathUtils.degToRad(Math.max(2, Math.min(89, elDeg)));
      this.sunUser = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    }
    this.applyLook();
    this.shadowExt = 0;
  }

  /** Nullpunkt der Shader-Zeit setzen (LookDev: reproduzierbare Animationsphase unabhängig vom Ladezeitpunkt) */
  setClockOrigin(t0: number): void {
    this.t0 = t0;
  }

  /** Lichtfarben und -stärken in die gemeinsamen Shader-Uniforms (Wasser, Rand-/Wolkenlicht) übernehmen */
  private applyLook(): void {
    SUN_DIR.copy(this.sunUser ?? (this.style === 'medieval' ? SUN_MEDIEVAL : SUN_GAME));
    if (this.style === 'medieval' && this.sky) {
      this.applyMedievalLook(this.sky);
      return;
    }
    const sun = new THREE.Color(LOOK.sunColor);
    GFX.uSunDir.value.copy(SUN_DIR);
    GFX.uSunIrr.value.copy(sun).multiplyScalar(LOOK.sunIntensity);
    GFX.uSkyIrr.value.set(LOOK.skyColor).multiplyScalar(LOOK.hemiIntensity);
    GFX.uGndIrr.value.set(LOOK.groundColor).multiplyScalar(LOOK.hemiIntensity);
    GFX.uSkyCol.value.set(LOOK.skyReflect);
  }

  /** Licht des Stils medieval aus dem Sonnenstand: Sonnenfarbe, Himmel (Umgebung/Hintergrund), Halbkugel, Nebelfarbe */
  private applyMedievalLook(sky: MedievalSky): void {
    const L = MEDIEVAL_LOOK;
    sky.update(SUN_DIR, L);
    const el = THREE.MathUtils.radToDeg(Math.asin(Math.min(1, SUN_DIR.y)));
    const sc = sunColorOf(el);
    // flache Sonne: etwas schwächer (längerer Weg durch die Atmosphäre)
    const k = L.sunIntensity * (0.72 + 0.28 * Math.min(1, el / 45));
    this.sun.color.setRGB(sc[0], sc[1], sc[2]);
    this.sun.intensity = k;
    // Halbkugel nur für Lambert-Rückfallmodelle: Strahldichte × π = Bestrahlungsstärke wie aus der Umgebung
    this.hemi.color.copy(sky.hemiSky);
    this.hemi.groundColor.copy(sky.hemiGround);
    this.hemi.intensity = Math.PI * L.envIntensity;
    this.scene.environment = sky.env;
    this.scene.environmentIntensity = L.envIntensity;
    this.scene.background = sky.background;
    // Nebel wird nach dem Tonemapping gemischt: Horizontfarbe durch denselben Operator schicken
    const h = toneMapJs([sky.horizon.r, sky.horizon.g, sky.horizon.b], L.exposure, currentToneOp(), L);
    this.fogMed.color.setRGB(h[0], h[1], h[2]);
    this.renderer.setClearColor(this.fogMed.color);
    GFX.uSunDir.value.copy(SUN_DIR);
    GFX.uSunIrr.value.setRGB(sc[0] * k, sc[1] * k, sc[2] * k);
    GFX.uSkyIrr.value.copy(sky.hemiSky).multiplyScalar(Math.PI);
    GFX.uGndIrr.value.copy(sky.hemiGround).multiplyScalar(Math.PI);
    GFX.uSkyCol.value.copy(sky.hemiSky).multiplyScalar(1.6);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(this.gfx.pixelRatio, this.qcfg.pixelRatioMax));
    this.renderer.setSize(w, h, false);
    this.cam.setAspect(w / h);
  }

  /** Wendet Grafikstufe und Schalter an: Schatten, Auflösung, Wasser, Gras, Partikel, AO. */
  applyGfx(g: Partial<GfxSettings>): void {
    Object.assign(this.gfx, g);
    const q = qualityOf(this.gfx.quality);
    this.qcfg = q;
    const shadows = this.gfx.shadows && q.shadows;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const st = SHADOW_TYPES[q.shadowType];
    if (this.renderer.shadowMap.type !== st || this.lastShadowType !== q.shadowType) {
      this.renderer.shadowMap.type = st;
      this.lastShadowType = q.shadowType;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) for (const mm of m) mm.needsUpdate = true;
        else if (m) m.needsUpdate = true;
      });
    }
    this.sun.shadow.radius = q.shadowRadius;
    if (this.sun.shadow.mapSize.x !== q.shadowMapSize) {
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    GFX.uAo.value = q.ao;
    GFX.uDetail.value = q.surfaceDetail;
    GFX.uCloud.value = q.cloudShadow;
    GFX.uRim.value = q.rimLight;
    GFX.uVar.value = q.instanceVariation;
    GFX.uWaterLv.value = q.waterDetail;
    GFX.uTreeSway.value = q.treeSway;
    setNoiseAnisotropy(Math.max(1, Math.min(q.anisotropy, this.renderer.capabilities.getMaxAnisotropy())));
    this.terrain?.applyQuality(q);
    if (this.style === 'medieval' && this.terrain) {
      this.terrainTex.setAnisotropy(Math.max(1, Math.min(q.anisotropy, this.renderer.capabilities.getMaxAnisotropy())));
      if (this.terrainTexState === 'ready' && this.terrainTex.size !== terrainTexSize(q)) {
        this.terrainTexState = 'none';
        this.loadTerrainTextures();
      }
      this.terrain.setLandMaterial(this.medTerrainMaterial());
    }
    this.terrain?.setShadows(shadows);
    this.decor?.applyQuality(q, shadows);
    this.ambient?.applyQuality(q);
    this.onGfx?.(q, shadows);
    this.resize();
  }

  setMap(map: GameMap): void {
    this.map = map;
    if (this.terrain) {
      this.root.remove(this.terrain.group);
      this.terrain.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    if (this.decor) {
      this.root.remove(this.decor.group);
      this.decor.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
      if (this.decor instanceof MedievalDecor) this.decor.dispose();
    }
    if (this.ambient) {
      this.root.remove(this.ambient.group);
      this.ambient.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    }
    this.ambient = new AmbientLife(map);
    this.ambient.applyQuality(this.qcfg);
    this.root.add(this.ambient.group);
    this.ground?.dispose();
    this.ground = new GroundMap(map.w, map.h);
    GFX.uGround.value = this.ground.texture;
    GFX.uMapInv.value.set(1 / map.w, 1 / map.h);
    const med = this.style === 'medieval';
    this.envMap?.dispose();
    this.envMap = null;
    if (med) {
      this.envMap = new EnvMap(map.w, map.h);
      this.envMap.update([], map.trees, (i) => map.terrain[i] === T.Water || map.terrain[i] === T.Moat);
      ENVU.uEnvMap.value = this.envMap.texture;
      ENVU.uEnvDir.value = this.envMap.dirTexture;
      ENVU.uEnvInv.value.set(1 / map.w, 1 / map.h);
    }
    this.terrain = med ? new TerrainRenderer(map, { medieval: true, material: this.medTerrainMaterial() }) : new TerrainRenderer(map);
    if (med) this.loadTerrainTextures();
    if (med) {
      if (this.envMap) this.envMap.extraRoads = this.envExtras.roads;
      const md = new MedievalDecor(map, this.envMap, assetRegistry.materials, this.aa);
      md.extraProps = this.envExtras.props;
      this.decor = md;
    } else this.decor = new DecorRenderer(map);
    this.decor.ground = this.ground;
    this.terrain.applyQuality(this.qcfg);
    this.terrain.setShadows(this.gfx.shadows && this.qcfg.shadows);
    this.decor.applyQuality(this.qcfg, this.gfx.shadows && this.qcfg.shadows);
    this.root.add(this.terrain.group, this.decor.group);
    this.cam.bounds = { w: map.w, h: map.h };
    this.cam.maxDist = Math.min(110, 40 + map.w * 0.25);
  }

  /** Zusätzliche Wege (Polylinien-Segmente) und feste Requisiten für den Stil medieval (LookDev); bleibt über Stil-/Kartenwechsel */
  setEnvExtras(roads: RoadSeg[], props: PropPlacement[]): void {
    this.envExtras = { roads, props };
    if (this.envMap) this.envMap.extraRoads = roads;
    if (this.decor instanceof MedievalDecor) {
      this.decor.extraProps = props;
      this.decor.markDirty();
    }
  }

  /** Geländematerial des Stils medieval (Texturen, sobald geladen; sonst prozeduraler Rückfall) */
  private medMat: THREE.Material | null = null;
  private medTerrainMaterial(): THREE.Material {
    const defs = assetRegistry.materials.defs;
    const base = TERRAIN_LAYERS.map((n) => defs[n]?.base ?? '#808070');
    const tile = TERRAIN_LAYERS.map((n) => defs[n]?.tile ?? 4);
    this.medMat?.dispose();
    this.medMat = medievalTerrainMaterial(this.terrainTexState === 'ready' ? this.terrainTex : null, this.qcfg, base, tile);
    return this.medMat;
  }

  /** Bodentexturen laden (Manifest → Bibliothekstexturen → Texturarrays) und das Material tauschen */
  private terrainTexP: Promise<void> = Promise.resolve();
  /** Stil medieval: erfüllt, wenn Bodentexturen und Vegetation geladen sind (LookDev, Messungen) */
  async whenEnvReady(): Promise<void> {
    await this.terrainTexP;
    if (this.decor instanceof MedievalDecor) await this.decor.loaded;
  }

  private loadTerrainTextures(): void {
    if (this.terrainTexState !== 'none') return;
    this.terrainTexState = 'loading';
    this.terrainTexP = (async () => {
      const m = await assetRegistry.loadManifest();
      if (!m || this.style !== 'medieval') {
        this.terrainTexState = 'none';
        return;
      }
      const ok = await this.terrainTex.build(assetRegistry.materials, terrainTexSize(this.qcfg), Math.max(1, Math.min(this.qcfg.anisotropy, this.renderer.capabilities.getMaxAnisotropy())));
      if (this.style !== 'medieval') return;
      this.terrainTexState = ok ? 'ready' : 'none';
      this.terrain?.setLandMaterial(this.medTerrainMaterial());
    })();
  }

  private tmpR = new THREE.Vector3();
  private tmpU = new THREE.Vector3();
  private tmpF = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  /** Schatten-Kamera folgt dem Blickpunkt, nur der sichtbare Bereich wird abgedeckt (Texel-Snapping gegen Flimmern). */
  private updateShadow(): void {
    if (this.style === 'medieval') {
      this.updateShadowFit();
      return;
    }
    const sh = this.sun.shadow;
    const sc = sh.camera;
    const ext = 16 + this.cam.dist * 0.72;
    if (Math.abs(this.shadowExt - ext) > 0.6) {
      this.shadowExt = ext;
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.far = SUN_DIST + ext * 2.2 + 30;
      sc.updateProjectionMatrix();
    }
    const texel = (ext * 2) / sh.mapSize.x;
    this.tmpF.copy(SUN_DIR).negate();
    this.tmpR.crossVectors(this.tmpF, this.worldUp).normalize();
    this.tmpU.crossVectors(this.tmpR, this.tmpF).normalize();
    const tx = this.cam.tx;
    const tz = this.cam.tz;
    const a = tx * this.tmpR.x + tz * this.tmpR.z;
    const b = tx * this.tmpU.x + tz * this.tmpU.z;
    const sa = Math.round(a / texel) * texel;
    const sb = Math.round(b / texel) * texel;
    const px = tx - this.tmpR.x * (a - sa) - this.tmpU.x * (b - sb);
    const pz = tz - this.tmpR.z * (a - sa) - this.tmpU.z * (b - sb);
    const py = this.tmpU.y * -(b - sb) * 0;
    this.sun.target.position.set(px, py, pz);
    this.sun.position.set(px + SUN_DIR.x * SUN_DIST, SUN_DIR.y * SUN_DIST, pz + SUN_DIR.z * SUN_DIST);
    this.sun.target.updateMatrixWorld();
  }

  private tmpV = new THREE.Vector3();
  private fitKey = '';
  /**
   * Stil medieval: Schattenkamera auf den sichtbaren Boden eingepasst (Kaskaden-Ersatz). Die Bodenpunkte der Sichtpyramide
   * (Ecken/Kantenmitten, Fernpunkte auf 2,2 × Kameraabstand begrenzt) werden in den Lichtraum projiziert; ihr Rechteck
   * (je Achse eigene Ausdehnung) bestimmt Mitte und Größe – bei steiler RTS-Sicht deutlich enger als der feste Radius,
   * also mehr Texel je Einheit. Texel-Snapping je Achse gegen Flimmern, Normal-Bias in Texelgrößen (kein Peter-Panning).
   */
  private updateShadowFit(): void {
    const sh = this.sun.shadow;
    const sc = sh.camera;
    const cam = this.cam.camera;
    cam.updateMatrixWorld();
    this.tmpF.copy(SUN_DIR).negate();
    this.tmpR.crossVectors(this.tmpF, this.worldUp).normalize();
    this.tmpU.crossVectors(this.tmpR, this.tmpF).normalize();
    const R = this.tmpR;
    const U = this.tmpU;
    const cp = cam.position;
    const maxD = this.cam.dist * 2.2 + 8;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    const add = (x: number, y: number, z: number): void => {
      const a = x * R.x + y * R.y + z * R.z;
      const b = x * U.x + y * U.y + z * U.z;
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    };
    const ground = 0.6;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const v = this.tmpV.set(i, j, 0.5).unproject(cam).sub(cp).normalize();
        let t = v.y < -1e-3 ? (cp.y - ground) / -v.y : maxD;
        t = Math.min(t, maxD);
        add(cp.x + v.x * t, ground, cp.z + v.z * t);
        // hohe Objekte (Türme, Baumkronen) am Rand werfen Schatten ins Bild: Höhe 4 mitnehmen
        add(cp.x + v.x * t, ground + 4, cp.z + v.z * t);
      }
    add(this.cam.tx, ground, this.cam.tz);
    const margin = 2.5;
    let ea = Math.max(8, (a1 - a0) / 2 + margin);
    let eb = Math.max(8, (b1 - b0) / 2 + margin);
    const cap = 16 + this.cam.dist * 0.95;
    ea = Math.min(cap, Math.ceil(ea));
    eb = Math.min(cap, Math.ceil(eb));
    const key = `${ea}|${eb}`;
    if (key !== this.fitKey) {
      this.fitKey = key;
      sc.left = -ea;
      sc.right = ea;
      sc.top = eb;
      sc.bottom = -eb;
      sc.far = SUN_DIST + Math.max(ea, eb) * 2.2 + 30;
      sc.updateProjectionMatrix();
    }
    const ta = (ea * 2) / sh.mapSize.x;
    const tb = (eb * 2) / sh.mapSize.y;
    const ca = Math.round((a0 + a1) / 2 / ta) * ta;
    const cb = Math.round((b0 + b1) / 2 / tb) * tb;
    // Mittelpunkt im Lichtraum → Welt (auf der Ebene durch den Ursprung senkrecht zur Lichtrichtung)
    const px = R.x * ca + U.x * cb;
    const py = R.y * ca + U.y * cb;
    const pz = R.z * ca + U.z * cb;
    this.sun.target.position.set(px, py, pz);
    this.sun.position.set(px + SUN_DIR.x * SUN_DIST, py + SUN_DIR.y * SUN_DIST, pz + SUN_DIR.z * SUN_DIST);
    this.sun.target.updateMatrixWorld();
    const texel = Math.max(ta, tb);
    sh.normalBias = texel * 1.1;
    sh.bias = -0.00012;
  }

  render(dt: number, now: number): void {
    GFX.uTime.value = now - this.t0;
    this.cam.update(dt, this.map);
    this.updateShadow();
    // Dunst folgt dem Kameraabstand: nah klar, in der Ferne Tiefenstaffelung
    if (this.style === 'medieval') {
      this.fogMed.density = fogDensityFor(this.cam.dist, this.fogScale);
      ENVU.uCamPos.value.copy(this.cam.camera.position);
    } else {
      const fog = this.scene.fog as THREE.Fog;
      fog.near = this.cam.dist * 1.35 * this.fogScale;
      fog.far = this.cam.dist * 4.4 * this.fogScale;
    }
    this.terrain?.flush();
    if (this.decor instanceof MedievalDecor) this.decor.setCamera(this.cam.camera);
    this.decor?.update(now, this.cam.tx, this.cam.tz, this.cam.dist, this.cam.camera.position);
    this.ambient?.update(this.cam.tx, this.cam.tz, this.cam.camera.position.y - Math.sin(this.cam.pitch) * this.cam.dist, GFX.uWindDir.value);
    this.renderer.render(this.scene, this.cam.camera);
  }
}
