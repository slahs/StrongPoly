import * as THREE from 'three';
import { Rng } from '@strongpoly/shared';
import { EntityRenderer } from './render/entities';
import { GameScene } from './render/scene';
import { buildShowWorld } from './showcase_scenes';
import { LOOKDEV_CAMS, LOOKDEV_LAYOUT, lookdevSpec } from './lookdev_scene';
import type { LookdevCam } from './lookdev_scene';
import { assetRegistry, parseStyle } from './render/assets/registry';
import type { ArtStyle } from './render/assets/registry';
import { textureBytes } from './render/assets/materials';
import { GFX } from './render/materials';
import { setToneOp } from './render/env/atmosphere';

/**
 * LookDev der Phase 5A: `/?lookdev=medieval` (oder `classic`) – Referenzsiedlung im ECHTEN Renderer (GameScene, Terrain,
 * Dekor, EntityRenderer mit Override-Register), feste Kameras, Stil alt/neu, Qualitätsstufe, Sonnenstand, Statistik.
 *
 *   ?lookdev=medieval|classic   Stil (gleichbedeutend &style=)
 *   &cam=1-rts|2-mid|3a-building|3b-figures|3c-material|3d-landscape   &tone=agx|aces (nur medieval)
 *   &quality=low|medium|high    &sun=game|<Stunde 6..19>     &frames=N (Einschwingen, Standard 30)
 *   &ui=0 (ohne Leiste, für Aufnahmen)  &stats=0 (ohne Statistik)  &live=0 (Standbild nach dem Einschwingen)
 *
 * Zeit synthetisch (feste Schrittweite), Math.random gesetzt, Shader-Uhr fest: gleiche URL → gleiches Bild.
 * `window.__lookdev` (für scripts/lookdev.mjs): ready, stats(), cams, setCam(id), setStyle(s), setQuality(q), setSun(h).
 * Kennzahlen aus Software-GL (SwiftShader) sind KEINE GPU-Werte.
 */

export interface LookdevStats {
  style: ArtStyle;
  quality: string;
  cam: string;
  calls: number;
  triangles: number;
  programs: number;
  textures: number;
  geometries: number;
  /** geschätzter Texturspeicher (Byte): alle von Szenenmaterialien genutzten Texturen + Schattenkarte */
  texBytes: number;
  /** davon Asset-Texturen (Materialbibliothek) */
  assetTexBytes: number;
  /** Geometriespeicher (Byte): alle Vertex-/Index-/Instanzpuffer der Szene */
  geoBytes: number;
  /** Ladezeiten (ms): Manifest, alle Assets (bis fertig), je Asset */
  manifestMs: number;
  assetsMs: number;
  assets: Record<string, { ms: number; bytes: number; ok: boolean; error?: string }>;
  /** GLB-Ersetzungen im Bild: Asset-ID → Instanzen je LOD */
  overrides: string[];
  frameMs: number;
  gl: string;
  note: string;
}

declare global {
  interface Window {
    __lookdev?: {
      ready: boolean;
      frames: number;
      cams: string[];
      stats: () => LookdevStats;
      setCam: (id: string) => void;
      setStyle: (s: ArtStyle) => Promise<void>;
      setQuality: (q: 'low' | 'medium' | 'high') => void;
      setSun: (h: number | null) => void;
      layout: typeof LOOKDEV_LAYOUT;
    };
  }
}

/** Uhrzeit → Sonnenstand (Azimut von Osten über Süden nach Westen, Höhe als Bogen) */
export function sunOfHour(h: number): { az: number; el: number } {
  const t = Math.max(0, Math.min(1, (h - 6) / 13));
  return { az: 90 + t * 195, el: 8 + 54 * Math.sin(Math.PI * t) };
}

function texSize(t: THREE.Texture): number {
  const img = t.image as { width?: number; height?: number; data?: ArrayLike<number> } | undefined;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  const bpp = (t as THREE.CompressedTexture).isCompressedTexture ? 1 : t.type === THREE.FloatType ? 16 : t.type === THREE.HalfFloatType ? 8 : 4;
  return textureBytes(w, h, bpp, t.generateMipmaps || (t as THREE.CompressedTexture).isCompressedTexture);
}

export function startLookdev(): void {
  const q = new URLSearchParams(location.search);
  let style: ArtStyle = parseStyle(q.get('style')) ?? parseStyle(q.get('lookdev')) ?? 'medieval';
  let quality = (['low', 'medium', 'high'].includes(q.get('quality') ?? '') ? q.get('quality') : 'medium') as 'low' | 'medium' | 'high';
  let camId = q.get('cam') ?? '1-rts';
  const sunQ = q.get('sun') ?? 'game';
  const settle = Number(q.get('frames') ?? 30);
  const showUi = q.get('ui') !== '0';
  const showStats = q.get('stats') !== '0';
  const live = q.get('live') !== '0' && showUi;
  document.title = 'StrongPoly LookDev';
  document.getElementById('ui')!.innerHTML = '';

  // Stil medieval: Tonemapping-Operator vergleichen (&tone=agx|aces), muss vor dem ersten Kompilieren stehen
  const tone = q.get('tone');
  if (tone === 'agx' || tone === 'aces') setToneOp(tone);
  const rng = new Rng(0x10cdef);
  Math.random = () => rng.next();
  assetRegistry.setStyle(style);

  const { spec, cx, cy, roads, props } = lookdevSpec();
  const world = buildShowWorld(spec);
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const gs = new GameScene(canvas);
  gs.gfx.pixelRatio = Number(q.get('pr') ?? 1);
  gs.setClockOrigin(0);
  const entities = new EntityRenderer(world);
  gs.root.add(entities.group);
  gs.setEnvExtras(roads, props);
  gs.setMap(world.map);
  gs.decor?.setOccupancy(world.bldAt, world.buildings);
  entities.onBuildingsChanged = () => gs.decor?.markDirty();
  gs.onGfx = (qc, sh) => entities.applyQuality(qc, sh);
  gs.applyGfx({ quality, shadows: q.get('shadows') !== '0' });
  entities.applyQuality(gs.qcfg, gs.gfx.shadows && gs.qcfg.shadows);

  const camOf = (id: string): LookdevCam => LOOKDEV_CAMS.find((c) => c.id === id) ?? LOOKDEV_CAMS[0];
  const applyCam = (): void => {
    const c = camOf(camId);
    gs.cam.setView(cx + c.x, cy + c.y, c.dist, c.yaw, c.pitch);
    gs.cam.lookHeight = c.lookHeight;
    gs.setOverview(c.fog);
  };
  const applySun = (v: string): void => {
    if (v === 'game') gs.setSun(null);
    else {
      const s = sunOfHour(Number(v));
      gs.setSun(s.az, s.el);
    }
  };
  applyCam();
  applySun(sunQ);

  const DT = 1 / 30;
  const base = 100;
  let frame = 0;
  let lastFrameMs = 0;
  let ready = false;
  const syncUrl = (): void => {
    const u = new URLSearchParams(location.search);
    u.set('lookdev', style);
    u.delete('style');
    u.set('cam', camId);
    u.set('quality', quality);
    history.replaceState(null, '', '?' + u.toString());
  };

  const stats = (): LookdevStats => {
    const info = gs.renderer.info;
    const texs = new Set<THREE.Texture>();
    const attrs = new Set<ArrayBufferLike | ArrayLike<number>>();
    let geoBytes = 0;
    const addAttr = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null | undefined): void => {
      if (!a) return;
      const arr = (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as THREE.InterleavedBufferAttribute).data.array : (a as THREE.BufferAttribute).array;
      if (attrs.has(arr)) return;
      attrs.add(arr);
      geoBytes += (arr as unknown as { byteLength: number }).byteLength;
    };
    const overrides = new Map<string, number>();
    gs.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      for (const a of Object.values(m.geometry.attributes)) addAttr(a as THREE.BufferAttribute);
      addAttr(m.geometry.index);
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        addAttr(im.instanceMatrix);
        addAttr(im.instanceColor);
      }
      if (o.name.startsWith('asset:') && (im.count ?? 0) > 0) {
        const k = o.name.split(':').slice(1, 3).join(':');
        overrides.set(k, Math.max(overrides.get(k) ?? 0, im.count));
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const r = mat as unknown as Record<string, unknown>;
        for (const k of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'envMap', 'alphaMap']) if (r[k] instanceof THREE.Texture) texs.add(r[k] as THREE.Texture);
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const v of Object.values(u)) if (v && (v as { value: unknown }).value instanceof THREE.Texture) texs.add((v as { value: THREE.Texture }).value);
      }
    });
    // gemeinsame Rausch-/Bodentexturen hängen an onBeforeCompile-Uniforms, nicht an den Materialien
    for (const t of [GFX.uNoiseA.value, GFX.uNoiseN.value, GFX.uGround.value]) if (t) texs.add(t);
    let texBytes = 0;
    for (const t of texs) texBytes += texSize(t);
    const sm = gs.sun.shadow.map;
    if (sm && gs.renderer.shadowMap.enabled) texBytes += sm.width * sm.height * 4 + sm.width * sm.height * 4;
    const gl = gs.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const glName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    return {
      style,
      quality,
      cam: camId,
      calls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      texBytes,
      assetTexBytes: assetRegistry.materials.stats.bytes,
      geoBytes,
      manifestMs: Math.round(assetRegistry.stats.manifestMs),
      assetsMs: Math.round(assetRegistry.stats.totalMs),
      assets: assetRegistry.stats.assets,
      overrides: [...overrides.entries()].map(([k, n]) => `${k} x${n}`).sort(),
      frameMs: Math.round(lastFrameMs * 10) / 10,
      gl: glName,
      note: /swiftshader|llvmpipe|software/i.test(glName) ? 'Software-GL: Zeiten/Bildraten sind KEINE GPU-Werte' : 'Hardware-GL',
    };
  };

  // ---------------------------------------------------------------- Bedienleiste und Statistik
  let bar: HTMLDivElement | null = null;
  let hud: HTMLDivElement | null = null;
  const btn = (label: string, on: boolean, f: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `margin:0 2px;padding:3px 8px;border-radius:5px;border:1px solid #7a6a50;cursor:pointer;font:12px system-ui,sans-serif;background:${on ? '#e7c77a' : '#2b241c'};color:${on ? '#1d1812' : '#f1e6cf'}`;
    b.onclick = f;
    return b;
  };
  const renderBar = (): void => {
    if (!bar) return;
    bar.innerHTML = '';
    const grp = (title: string, ...els: HTMLElement[]): void => {
      const s = document.createElement('span');
      s.style.cssText = 'margin-right:14px;white-space:nowrap';
      const t = document.createElement('b');
      t.textContent = title + ' ';
      t.style.cssText = 'font-weight:600;margin-right:2px';
      s.append(t, ...els);
      bar!.append(s);
    };
    grp('Stil', btn('alt (classic)', style === 'classic', () => void api.setStyle('classic')), btn('neu (medieval)', style === 'medieval', () => void api.setStyle('medieval')));
    grp('Kamera', ...LOOKDEV_CAMS.map((c) => btn(c.label, c.id === camId, () => api.setCam(c.id))));
    grp('Stufe', ...(['low', 'medium', 'high'] as const).map((l) => btn({ low: 'Niedrig', medium: 'Mittel', high: 'Hoch' }[l], l === quality, () => api.setQuality(l))));
    const sun = document.createElement('input');
    sun.type = 'range';
    sun.min = '6';
    sun.max = '19';
    sun.step = '0.25';
    sun.value = sunQ === 'game' ? '15' : sunQ;
    sun.style.cssText = 'vertical-align:middle;width:110px';
    const lab = document.createElement('span');
    lab.textContent = sunQ === 'game' ? 'Spiel' : `${sun.value} h`;
    sun.oninput = () => {
      lab.textContent = `${sun.value} h`;
      api.setSun(Number(sun.value));
    };
    grp('Sonne', sun, lab, btn('Spiel', false, () => { lab.textContent = 'Spiel'; api.setSun(null); }));
  };
  if (showUi) {
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:6px 10px;background:rgba(24,19,14,0.86);color:#f1e6cf;font:12px system-ui,sans-serif;z-index:30;display:flex;flex-wrap:wrap;align-items:center;gap:4px';
    document.body.appendChild(bar);
    renderBar();
  }
  if (showStats) {
    hud = document.createElement('div');
    hud.style.cssText = `position:fixed;left:8px;top:${showUi ? 44 : 8}px;padding:6px 10px;background:rgba(20,16,12,0.8);color:#f3e8c8;font:11px/1.45 monospace;border-radius:6px;pointer-events:none;z-index:20;white-space:pre`;
    document.body.appendChild(hud);
  }
  const mb = (b: number): string => `${(b / 1048576).toFixed(1)} MB`;
  const drawHud = (): void => {
    if (!hud) return;
    const s = stats();
    const lines = [
      `LookDev ${s.style} · ${s.quality} · Kamera ${s.cam}`,
      `Draw-Calls ${s.calls}   Dreiecke ${(s.triangles / 1000).toFixed(1)}k   Programme ${s.programs}`,
      `Texturen ${s.textures} (≈${mb(s.texBytes)}, Assets ${mb(s.assetTexBytes)})   Geometrie ≈${mb(s.geoBytes)}`,
      `Laden: Manifest ${s.manifestMs} ms, Assets ${s.assetsMs} ms (${Object.keys(s.assets).length})`,
      `GLB im Bild: ${s.overrides.length ? s.overrides.join(', ') : '—'}`,
      `${s.note}`,
    ];
    hud.textContent = lines.join('\n');
  };

  const step = (): void => {
    const t0 = performance.now();
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
    lastFrameMs = performance.now() - t0;
    frame++;
  };
  let running = false;
  const loop = (): void => {
    step();
    if (frame % 10 === 0) drawHud();
    if (frame >= settle && !ready) {
      ready = true;
      api.ready = true;
      drawHud();
    }
    api.frames = frame;
    if (ready && !live) {
      running = false;
      return;
    }
    requestAnimationFrame(loop);
  };
  /** nach einer Änderung neu einschwingen (Standbildmodus) */
  const rerun = (): void => {
    api.ready = false;
    ready = false;
    frame = 0;
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  };

  const api = {
    ready: false,
    frames: 0,
    cams: LOOKDEV_CAMS.map((c) => c.id),
    stats,
    layout: LOOKDEV_LAYOUT,
    setCam: (id: string): void => {
      camId = id;
      applyCam();
      syncUrl();
      renderBar();
      rerun();
    },
    setStyle: async (s: ArtStyle): Promise<void> => {
      style = s;
      assetRegistry.setStyle(s);
      if (s === 'medieval') await preloadMedieval();
      syncUrl();
      renderBar();
      rerun();
    },
    setQuality: (l: 'low' | 'medium' | 'high'): void => {
      quality = l;
      gs.applyGfx({ quality: l });
      syncUrl();
      renderBar();
      rerun();
    },
    setSun: (h: number | null): void => {
      applySun(h === null ? 'game' : String(h));
      rerun();
    },
  };
  window.__lookdev = api;
  // Diagnose (scripts/qa): Vegetations-/Umgebungszustand
  (window as unknown as { __dbg: () => unknown }).__dbg = () => {
    const veg: string[] = [];
    gs.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh && o.name.startsWith('veg:') && m.count > 0) veg.push(`${o.name} x${m.count}${m.visible ? '' : ' (aus)'}`);
    });
    const d = gs.decor as unknown as { state?: string; stats?: unknown };
    return { style: gs.style, decor: d.state ?? 'classic', stats: d.stats, veg: veg.sort(), programs: gs.renderer.info.programs?.map((p) => p.name) };
  };
  /** Stil medieval: Gebäude-/Figuren-Assets, Vegetation und Bodentexturen vor dem Einschwingen laden */
  async function preloadMedieval(): Promise<void> {
    await assetRegistry.preload();
    await gs.whenEnvReady();
  }
  running = true;
  const start = (): void => {
    requestAnimationFrame(loop);
  };
  if (style === 'medieval') void preloadMedieval().then(start, start);
  else start();
}
