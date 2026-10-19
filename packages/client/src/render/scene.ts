import * as THREE from 'three';
import { GameMap } from '@strongpoly/shared';
import { RtsCamera } from './camera';
import { DecorRenderer } from './decor';
import { FOG_COLOR, TerrainRenderer } from './terrain';

export interface GfxSettings {
  shadows: boolean;
  quality: 'low' | 'medium' | 'high';
  pixelRatio: number;
}

/** Besitzt Renderer, Szene, Licht und Kamera. Der Renderer liest nur Zustand. */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: RtsCamera;
  readonly sun: THREE.DirectionalLight;
  terrain: TerrainRenderer | null = null;
  decor: DecorRenderer | null = null;
  map: GameMap | null = null;
  gfx: GfxSettings = { shadows: true, quality: 'medium', pixelRatio: Math.min(window.devicePixelRatio, 2) };
  readonly root = new THREE.Group();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(FOG_COLOR);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 90, 190);
    this.scene.add(this.root);

    this.scene.add(new THREE.HemisphereLight(0xfff4dc, 0x7a6a50, 1.05));
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.9);
    this.sun.position.set(30, 60, 20);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.cam = new RtsCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.gfx.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.cam.setAspect(w / h);
  }

  applyGfx(g: Partial<GfxSettings>): void {
    Object.assign(this.gfx, g);
    this.renderer.shadowMap.enabled = this.gfx.shadows;
    this.sun.castShadow = this.gfx.shadows;
    const size = this.gfx.quality === 'high' ? 4096 : this.gfx.quality === 'medium' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  setMap(map: GameMap): void {
    this.map = map;
    if (this.terrain) {
      this.root.remove(this.terrain.group);
      this.terrain.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    if (this.decor) this.root.remove(this.decor.group);
    this.terrain = new TerrainRenderer(map);
    this.decor = new DecorRenderer(map);
    this.root.add(this.terrain.group, this.decor.group);
    this.cam.bounds = { w: map.w, h: map.h };
    this.cam.maxDist = Math.min(110, 40 + map.w * 0.25);
  }

  render(dt: number, now: number): void {
    this.cam.update(dt, this.map);
    // Sonne folgt dem Blickpunkt, Schatten bleiben scharf
    const t = this.sun.target.position;
    t.set(this.cam.tx, 0, this.cam.tz);
    this.sun.position.set(this.cam.tx + 30, 60, this.cam.tz + 20);
    const sc = this.sun.shadow.camera;
    const ext = 18 + this.cam.dist * 0.7;
    if (Math.abs(sc.right - ext) > 1) {
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.updateProjectionMatrix();
    }
    this.terrain?.flush();
    this.decor?.update(now);
    this.renderer.render(this.scene, this.cam.camera);
  }
}
