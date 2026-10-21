import * as THREE from 'three';

/**
 * Umgebungskarte des Stils medieval (reine Darstellung, keine Sim-Daten): eine RGBA8-Textur mit `res` Texeln je Tile.
 *   R  Weg (0..1, weicher Rand; das Ausfransen macht der Gelände-Shader mit Rauschen)
 *   G  vorzeichenbehafteter Abstand zur Wegmitte in Einheiten: 0,5 + d / (2·CROSS_MAX) – Fahrspuren, Grasstreifen in
 *      der Mitte und die quer ausgerichtete Wegtextur (M_Ground_Path trägt Spurrillen entlang V)
 *   B  Kronendach (geglättete Baumdichte): Laubstreu, dunklerer Waldboden, weniger Himmelslicht
 *   A  Fahrspuren-Stärke (0 = Fußpfad, 1 = Karrenweg mit Spurrillen)
 * Zweite Textur (dir): RG = Wegrichtung als doppelter Winkel (cos 2θ, sin 2θ)·0,5+0,5 – richtet die Wegtextur entlang
 * des Weges aus (Interpolation ohne Sprung bei θ ± π). Wege kommen aus Liniensegmenten: im Spiel die Trampelpfade der Bodenkarte (Gebäude → nächstes Lager), im LookDev
 * zusätzlich gezeichnete Wege (lookdev_scene.ts). Rein und deterministisch (testbar).
 */

export interface RoadSeg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** halbe Breite in Tiles */
  hw: number;
  /** Fahrspuren 0..1 */
  ruts: number;
}

/** größter gespeicherter Querabstand (Einheiten) */
export const CROSS_MAX = 2;

/** Polylinie → Segmente */
export function polylineSegs(pts: [number, number][], hw: number, ruts: number): RoadSeg[] {
  const out: RoadSeg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push({ x0: pts[i][0], y0: pts[i][1], x1: pts[i + 1][0], y1: pts[i + 1][1], hw, ruts });
  return out;
}

/** Texel je Tile für eine Kartengröße (große Karten gröber, höchstens ~1.400² Texel) */
export function envRes(size: number): number {
  return Math.max(2, Math.min(4, Math.floor(1400 / Math.max(1, size))));
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Berechnet die Karte. `trees` = Baumbestand je Tile (map.trees, > 0 = Baum), `wet` optional (Wasser: keine Wege).
 * Rückgabe RGBA8 (W = w·res, H = h·res), Zeile 0 = Kartenzeile 0 (wie die Bodenkarte).
 */
export function computeEnvMap(w: number, h: number, res: number, roads: RoadSeg[], trees: ArrayLike<number> | null, wet?: (i: number) => boolean, dirOut?: Uint8Array): Uint8Array<ArrayBuffer> {
  const W = w * res;
  const H = h * res;
  const road = new Float32Array(W * H);
  const cross = new Float32Array(W * H).fill(1);
  const signed = new Float32Array(W * H).fill(CROSS_MAX);
  const dcos = new Float32Array(W * H).fill(1);
  const dsin = new Float32Array(W * H);
  const ruts = new Float32Array(W * H);
  for (const s of roads) {
    const pad = s.hw * 1.3 + 0.5;
    const xa = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - pad) * res));
    const xb = Math.min(W - 1, Math.ceil((Math.max(s.x0, s.x1) + pad) * res));
    const ya = Math.max(0, Math.floor((Math.min(s.y0, s.y1) - pad) * res));
    const yb = Math.min(H - 1, Math.ceil((Math.max(s.y0, s.y1) + pad) * res));
    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const L2 = dx * dx + dy * dy;
    const th = Math.atan2(dy, dx);
    const c2 = Math.cos(2 * th);
    const s2 = Math.sin(2 * th);
    const Ln = Math.sqrt(L2) || 1;
    for (let py = ya; py <= yb; py++)
      for (let px = xa; px <= xb; px++) {
        const x = (px + 0.5) / res;
        const y = (py + 0.5) / res;
        let t = L2 > 1e-9 ? ((x - s.x0) * dx + (y - s.y0) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = s.x0 + dx * t - x;
        const ey = s.y0 + dy * t - y;
        const d = Math.sqrt(ex * ex + ey * ey);
        const q = d / s.hw;
        if (q > 1.3) continue;
        const i = py * W + px;
        const r = 1 - smooth(0.78, 1.25, q);
        if (r > road[i]) road[i] = r;
        if (q < cross[i]) {
          cross[i] = q;
          // Vorzeichen: links/rechts der Laufrichtung
          const side = (x - s.x0) * (-dy / Ln) + (y - s.y0) * (dx / Ln);
          signed[i] = Math.max(-CROSS_MAX, Math.min(CROSS_MAX, side >= 0 ? d : -d));
          dcos[i] = c2;
          dsin[i] = s2;
          ruts[i] = Math.max(ruts[i], s.ruts * (1 - smooth(0.9, 1.2, q)));
        } else if (q < 1) ruts[i] = Math.max(ruts[i], s.ruts * 0.5 * (1 - q));
      }
  }
  // Kronendach: Baumdichte je Tile, zweimal mit 3x3 geglättet, dann auf das Texelraster
  const canopy = new Float32Array(w * h);
  if (trees) {
    const a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = trees[i] > 0 ? 1 : 0;
    const b = new Float32Array(w * h);
    const blur = (src: Float32Array, dst: Float32Array): void => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let s = 0;
          let n = 0;
          for (let k = -1; k <= 1; k++)
            for (let l = -1; l <= 1; l++) {
              const xx = x + l;
              const yy = y + k;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const wgt = k === 0 && l === 0 ? 2 : 1;
              s += src[yy * w + xx] * wgt;
              n += wgt;
            }
          dst[y * w + x] = s / n;
        }
    };
    blur(a, b);
    blur(b, canopy);
  }
  const out = new Uint8Array(W * H * 4);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      // Kronendach bilinear aus dem Tile-Raster
      const fx = (px + 0.5) / res - 0.5;
      const fy = (py + 0.5) / res - 0.5;
      const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0));
      const ty = Math.min(1, Math.max(0, fy - y0));
      const c = (canopy[y0 * w + x0] * (1 - tx) + canopy[y0 * w + x1] * tx) * (1 - ty) + (canopy[y1 * w + x0] * (1 - tx) + canopy[y1 * w + x1] * tx) * ty;
      const ti = Math.min(h - 1, Math.floor(py / res)) * w + Math.min(w - 1, Math.floor(px / res));
      const isWet = wet ? wet(ti) : false;
      out[i * 4] = isWet ? 0 : Math.round(Math.min(1, road[i]) * 255);
      out[i * 4 + 1] = Math.round((0.5 + signed[i] / (2 * CROSS_MAX)) * 255);
      if (dirOut) {
        dirOut[i * 4] = Math.round((dcos[i] * 0.5 + 0.5) * 255);
        dirOut[i * 4 + 1] = Math.round((dsin[i] * 0.5 + 0.5) * 255);
        dirOut[i * 4 + 2] = Math.round(Math.min(1, cross[i]) * 255);
        dirOut[i * 4 + 3] = 255;
      }
      out[i * 4 + 2] = Math.round(Math.min(1, c) * 255);
      out[i * 4 + 3] = isWet ? 0 : Math.round(Math.min(1, ruts[i]) * 255);
    }
  return out;
}

/** Wegstärke 0..1 am Tile (für die Vegetation: kein Gras/Gebüsch auf Wegen); Mittel über die Texel des Tiles */
export function roadAt(data: Uint8Array, w: number, res: number, x: number, y: number): number {
  const W = w * res;
  let s = 0;
  for (let k = 0; k < res; k++) for (let l = 0; l < res; l++) s += data[((y * res + k) * W + x * res + l) * 4];
  return s / (res * res * 255);
}

/** Wegstärke an einem Punkt (Weltkoordinaten in Tiles), nächster Texel */
export function roadAtPoint(data: Uint8Array, w: number, h: number, res: number, x: number, y: number): number {
  const W = w * res;
  const px = Math.max(0, Math.min(W - 1, Math.floor(x * res)));
  const py = Math.max(0, Math.min(h * res - 1, Math.floor(y * res)));
  return data[(py * W + px) * 4] / 255;
}

/** Kronendach an einem Punkt */
export function canopyAtPoint(data: Uint8Array, w: number, h: number, res: number, x: number, y: number): number {
  const W = w * res;
  const px = Math.max(0, Math.min(W - 1, Math.floor(x * res)));
  const py = Math.max(0, Math.min(h * res - 1, Math.floor(y * res)));
  return data[(py * W + px) * 4 + 2] / 255;
}

/** Textur der Umgebungskarte samt Daten */
export class EnvMap {
  readonly res: number;
  data: Uint8Array<ArrayBuffer>;
  readonly texture: THREE.DataTexture;
  /** Wegrichtung (doppelter Winkel) und relativer Querabstand */
  dirData: Uint8Array<ArrayBuffer>;
  readonly dirTexture: THREE.DataTexture;
  /** zusätzliche Wege (LookDev, später: Straßenbau) */
  extraRoads: RoadSeg[] = [];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.res = envRes(Math.max(w, h));
    this.data = new Uint8Array(w * this.res * h * this.res * 4);
    this.texture = new THREE.DataTexture(this.data, w * this.res, h * this.res, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
    this.dirData = new Uint8Array(w * this.res * h * this.res * 4);
    this.dirTexture = new THREE.DataTexture(this.dirData, w * this.res, h * this.res, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.dirTexture.magFilter = THREE.LinearFilter;
    this.dirTexture.minFilter = THREE.LinearFilter;
    this.dirTexture.generateMipmaps = false;
    this.dirTexture.colorSpace = THREE.NoColorSpace;
    this.dirTexture.needsUpdate = true;
  }

  update(roads: RoadSeg[], trees: ArrayLike<number> | null, wet?: (i: number) => boolean): void {
    const d = computeEnvMap(this.w, this.h, this.res, [...roads, ...this.extraRoads], trees, wet, this.dirData);
    this.data.set(d);
    this.texture.needsUpdate = true;
    this.dirTexture.needsUpdate = true;
  }

  road(x: number, y: number): number {
    return roadAtPoint(this.data, this.w, this.h, this.res, x, y);
  }

  canopy(x: number, y: number): number {
    return canopyAtPoint(this.data, this.w, this.h, this.res, x, y);
  }

  dispose(): void {
    this.texture.dispose();
    this.dirTexture.dispose();
  }
}
