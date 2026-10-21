import { Rng } from '@strongpoly/shared';
import { EntityRenderer } from './render/entities';
import { GameScene } from './render/scene';
import { SHOW_NAMES, ShowName, buildShowWorld, sceneSpec } from './showcase_scenes';
import { assetRegistry, parseStyle } from './render/assets/registry';

/**
 * Screenshot-/Vergleichsszenen (`?shots=<szene>`), siehe scripts/shots.mjs und README („Vergleichsszenen“).
 *
 *   ?shots=early|town|castle|siege|figures|engines|map|ground|forest|water|coast|deposits
 *   &quality=low|medium|high   Grafikstufe (Standard medium)
 *   &seed=N                    andere Karte (Standard: fester Szenen-Seed)
 *   &frames=N                  Einschwingphase in Frames (Standard 24; Dekor, Rauch, Partikel)
 *   &shadows=0                 Schatten aus
 *   &cam=x,y,dist,yawDeg,pitch eigene Kamera (Tile-Koordinaten)
 *   &hud=1                     Kennzahlen einblenden
 *   &live=1                    nach der Einschwingphase weiterrendern (sonst Standbild)
 *
 * Die Zeit läuft synthetisch (feste Schrittweite je Frame) und Math.random ist gesetzt, damit dieselbe URL
 * Frame für Frame dasselbe Bild liefert. `window.__shots.ready` wird true, sobald die Einschwingphase vorbei ist.
 */
declare global {
  interface Window {
    __shots?: {
      ready: boolean;
      name: string;
      quality: string;
      frames: number;
      desc: string;
      info: () => { calls: number; triangles: number; geometries: number; textures: number; programs: number; decorMs: number; decorInstances: number };
      scene: GameScene;
      entities: EntityRenderer;
    };
  }
}

export function startShowcase(): void {
  const q = new URLSearchParams(location.search);
  const raw = q.get('shots') ?? 'early';
  if (raw === 'list') {
    document.body.textContent = SHOW_NAMES.join(',');
    (window as unknown as Record<string, unknown>).__shotList = [...SHOW_NAMES];
    return;
  }
  const name = (SHOW_NAMES as readonly string[]).includes(raw) ? (raw as ShowName) : 'early';
  const quality = (q.get('quality') ?? 'medium') as 'low' | 'medium' | 'high';
  const settle = Number(q.get('frames') ?? 24);
  const live = q.get('live') === '1';
  document.title = `StrongPoly Szene ${name}`;
  document.getElementById('ui')!.innerHTML = '';

  // Reproduzierbarkeit: Zufallsquelle der Effekte (Rauch, Funken) fest setzen
  const rng = new Rng(0x5eed + SHOW_NAMES.indexOf(name));
  Math.random = () => rng.next();

  // Grafikstil (&style=medieval): GLB-Assets vor dem ersten Bild laden (Standard 'classic' wie bisher)
  const style = parseStyle(q.get('style')) ?? 'classic';
  assetRegistry.setStyle(style);
  const spec = sceneSpec(name, q.has('seed') ? Number(q.get('seed')) : undefined);
  const world = buildShowWorld(spec);
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const gs = new GameScene(canvas);
  gs.gfx.pixelRatio = Number(q.get('pr') ?? 1);
  const entities = new EntityRenderer(world);
  gs.root.add(entities.group);
  gs.setMap(world.map);
  gs.decor?.setOccupancy(world.bldAt, world.buildings);
  entities.onBuildingsChanged = () => gs.decor?.markDirty();
  gs.onGfx = (qc, sh) => entities.applyQuality(qc, sh);
  gs.applyGfx({ quality, shadows: q.get('shadows') !== '0' });
  entities.applyQuality(gs.qcfg, gs.gfx.shadows && gs.qcfg.shadows);
  if (q.get('blood') === '0') entities.setBlood(false);

  let cam = spec.cam;
  const cq = q.get('cam');
  if (cq) {
    const [x, y, d, yawDeg, pitch] = cq.split(',').map(Number);
    cam = { x, y, dist: d, yaw: (yawDeg * Math.PI) / 180, pitch: pitch || 52 };
  }
  gs.cam.setView(cam.x, cam.y, cam.dist, cam.yaw, cam.pitch);
  gs.setOverview(spec.fogScale);

  const DT = 1 / 30;
  const base = 100;
  let frame = 0;
  const hud = q.get('hud') === '1' ? document.createElement('div') : null;
  if (hud) {
    hud.style.cssText = 'position:fixed;left:8px;top:8px;padding:6px 10px;background:rgba(20,16,12,0.78);color:#f3e8c8;font:12px/1.5 monospace;border-radius:6px;pointer-events:none;z-index:20;white-space:pre';
    document.body.appendChild(hud);
  }
  const state = {
    ready: false,
    name,
    quality,
    frames: 0,
    desc: spec.desc,
    info: () => {
      const i = gs.renderer.info;
      const st = gs.decor?.stats;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0, decorMs: st?.ms ?? 0, decorInstances: st?.total ?? 0 };
    },
    scene: gs,
    entities,
  };
  window.__shots = state;

  const loop = (): void => {
    const now = base + frame * DT;
    world.lastSnapMs = performance.now();
    entities.consumeEvents();
    entities.update(DT, {
      alpha: 1,
      now,
      camYaw: gs.cam.yaw,
      selected: new Set<number>(),
      selectedBuilding: 0,
      hoverBuilding: 0,
      hoverTile: null,
      camera: gs.cam.camera,
      visible: null,
      explored: null,
      me: 0,
      myTeam: 0,
      teamOfPlayer: world.players.map((p) => p.team),
    });
    entities.clearEvents();
    gs.render(DT, now);
    frame++;
    state.frames = frame;
    if (hud && frame % 5 === 0) {
      const i = state.info();
      hud.textContent = `${name} ${quality}  Frame ${frame}\nDraw-Calls ${i.calls}  Dreiecke ${(i.triangles / 1000).toFixed(0)}k  Programme ${i.programs}`;
    }
    if (frame >= settle) {
      state.ready = true;
      // Standbild: nach der Einschwingphase nicht weiterrendern (Screenshot zeigt genau diesen Frame); &live=1 läuft weiter
      if (!live) return;
    }
    requestAnimationFrame(loop);
  };
  if (style === 'medieval') void assetRegistry.preload().then(() => requestAnimationFrame(loop));
  else requestAnimationFrame(loop);
}
