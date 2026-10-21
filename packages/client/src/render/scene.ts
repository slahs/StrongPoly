import * as THREE from 'three';
import { GameMap } from '@strongpoly/shared';
import { RtsCamera } from './camera';
import { DecorRenderer } from './decor';
import { AmbientLife } from './ambient';
import { GroundMap } from './groundmap';
import { GFX, ensureNoiseTextures, setNoiseAnisotropy } from './materials';
import { QualityCfg, qualityOf } from './quality';
import { FOG_COLOR, TerrainRenderer } from './terrain';
import { assetRegistry } from './assets/registry';

export interface GfxSettings {
  shadows: boolean;
  quality: 'low' | 'medium' | 'high';
  pixelRatio: number;
}

/** Richtung vom Boden zur Sonne (tiefer, warmer Sonnenstand aus Südwest, sichtbare Schatten) */
const SUN_DIR = new THREE.Vector3(-0.38, 0.8, 0.46).normalize();
/** Spielwert des Sonnenstands (SUN_DIR kann nur das LookDev verändern, siehe GameScene.setSun) */
const SUN_GAME = SUN_DIR.clone();
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
  decor: DecorRenderer | null = null;
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

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: readAA(), powerPreference: 'high-performance' });
    this.renderer.setClearColor(FOG_COLOR);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tonemapping (Khronos-neutral: erhält die Palette, rollt Lichter weich ab; das Grading steckt in materials.ts)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = LOOK.exposure;
    ensureNoiseTextures();
    assetRegistry.attachRenderer(this.renderer);
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 60, 200);
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
    if (azDeg === null) SUN_DIR.copy(SUN_GAME);
    else {
      const az = THREE.MathUtils.degToRad(azDeg);
      const el = THREE.MathUtils.degToRad(Math.max(2, Math.min(89, elDeg)));
      SUN_DIR.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
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
    const sun = new THREE.Color(LOOK.sunColor);
    GFX.uSunDir.value.copy(SUN_DIR);
    GFX.uSunIrr.value.copy(sun).multiplyScalar(LOOK.sunIntensity);
    GFX.uSkyIrr.value.set(LOOK.skyColor).multiplyScalar(LOOK.hemiIntensity);
    GFX.uGndIrr.value.set(LOOK.groundColor).multiplyScalar(LOOK.hemiIntensity);
    GFX.uSkyCol.value.set(LOOK.skyReflect);
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
    this.terrain = new TerrainRenderer(map);
    this.decor = new DecorRenderer(map);
    this.decor.ground = this.ground;
    this.terrain.applyQuality(this.qcfg);
    this.terrain.setShadows(this.gfx.shadows && this.qcfg.shadows);
    this.decor.applyQuality(this.qcfg, this.gfx.shadows && this.qcfg.shadows);
    this.root.add(this.terrain.group, this.decor.group);
    this.cam.bounds = { w: map.w, h: map.h };
    this.cam.maxDist = Math.min(110, 40 + map.w * 0.25);
  }

  private tmpR = new THREE.Vector3();
  private tmpU = new THREE.Vector3();
  private tmpF = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  /** Schatten-Kamera folgt dem Blickpunkt, nur der sichtbare Bereich wird abgedeckt (Texel-Snapping gegen Flimmern). */
  private updateShadow(): void {
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

  render(dt: number, now: number): void {
    GFX.uTime.value = now - this.t0;
    this.cam.update(dt, this.map);
    this.updateShadow();
    // Dunst folgt dem Kameraabstand: nah klar, in der Ferne Tiefenstaffelung
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.cam.dist * 1.35 * this.fogScale;
    fog.far = this.cam.dist * 4.4 * this.fogScale;
    this.terrain?.flush();
    this.decor?.update(now, this.cam.tx, this.cam.tz, this.cam.dist, this.cam.camera.position);
    this.ambient?.update(this.cam.tx, this.cam.tz, this.cam.camera.position.y - Math.sin(this.cam.pitch) * this.cam.dist, GFX.uWindDir.value);
    this.renderer.render(this.scene, this.cam.camera);
  }
}
