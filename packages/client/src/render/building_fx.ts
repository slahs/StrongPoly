import type { FxSystem } from './fx';
import type { ConstructionParams } from './construction';

/**
 * Effekte der Bauinszenierung (4C) und kleine Arbeitseffekte an Gebäuden. Rein visuell, zurückhaltend und über
 * `particleScale` der Grafikstufe skaliert. Zufall ist hier unkritisch (nur Darstellung).
 */
type Col = [number, number, number];
const DUST: Col = [0.82, 0.72, 0.52];
const DUST_LIGHT: Col = [0.9, 0.84, 0.7];
const WOOD: Col = [0.62, 0.42, 0.22];
const STONE: Col = [0.6, 0.57, 0.52];
const SPARK: Col = [1.0, 0.82, 0.4];

export interface SiteRect {
  x: number;
  z: number;
  w: number;
  h: number;
  y: number;
  /** Höhe des Modells (für Arbeitsstellen an der Oberkante) */
  top: number;
  wood: boolean;
}

const rnd = Math.random;

/** Staub und Späne während der Bauphase (dt in Sekunden, scale = Partikelfaktor der Grafikstufe) */
export function constructionFx(fx: FxSystem, s: SiteRect, cp: ConstructionParams, dt: number, scale: number): void {
  if (cp.done) return;
  const k = cp.dust * scale;
  if (k <= 0.02) return;
  const per = (s.w + s.h) * 2;
  // Bodenstaub entlang der Kante
  let n = dt * (0.9 + per * 0.22) * k;
  while (n > 0) {
    if (n >= 1 || rnd() < n) {
      const t = rnd() * per;
      let px: number;
      let pz: number;
      if (t < s.w) {
        px = s.x + t;
        pz = s.z;
      } else if (t < s.w + s.h) {
        px = s.x + s.w;
        pz = s.z + (t - s.w);
      } else if (t < 2 * s.w + s.h) {
        px = s.x + s.w - (t - s.w - s.h);
        pz = s.z + s.h;
      } else {
        px = s.x;
        pz = s.z + s.h - (t - 2 * s.w - s.h);
      }
      fx.puff(px, s.y + 0.08, pz, (rnd() - 0.5) * 0.35, 0.18 + rnd() * 0.25, (rnd() - 0.5) * 0.35, 1.1 + rnd() * 0.8, 0.12, 0.5 + rnd() * 0.3, rnd() < 0.5 ? DUST : DUST_LIGHT, 0.32, -0.05, 0.9);
    }
    n -= 1;
  }
  // Späne/Splitter an der aktuellen Bauhöhe
  let m = dt * (1.2 + per * 0.18) * cp.dust * scale;
  const hy = s.y + Math.max(0.2, Math.min(s.top, cp.raise * s.top * 1.05 + 0.2));
  while (m > 0) {
    if (m >= 1 || rnd() < m) {
      const px = s.x + 0.2 + rnd() * Math.max(0.1, s.w - 0.4);
      const pz = s.z + 0.2 + rnd() * Math.max(0.1, s.h - 0.4);
      fx.chunk(px, hy, pz, (rnd() - 0.5) * 1.2, 0.8 + rnd() * 1.2, (rnd() - 0.5) * 1.2, 0.5 + rnd() * 0.3, 0.035 + rnd() * 0.03, s.wood ? WOOD : STONE, 9);
      if (rnd() < 0.18) fx.spark(px, hy, pz, (rnd() - 0.5) * 0.8, 0.5 + rnd() * 0.8, (rnd() - 0.5) * 0.8, 0.35, 0.06, 0.02, SPARK, 0.9, 3, 0);
    }
    m -= 1;
  }
}

/** Abschlusseffekt: Staubwolke an den Ecken, aufspringende Funken, Holz- bzw. Steinsplitter */
export function finishFx(fx: FxSystem, s: SiteRect, scale: number): void {
  const cx = s.x + s.w / 2;
  const cz = s.z + s.h / 2;
  fx.dustRing(cx, s.y, cz, 8 + s.w * s.h * 0.6, Math.max(s.w, s.h) * 0.75, 0.8 + Math.min(1.2, (s.w + s.h) * 0.12), DUST, 0.5, 1.9);
  const corners: [number, number][] = [[s.x, s.z], [s.x + s.w, s.z], [s.x, s.z + s.h], [s.x + s.w, s.z + s.h]];
  for (const [px, pz] of corners) {
    fx.dustRing(px, s.y, pz, 3, 0.8, 0.55, DUST_LIGHT, 0.4, 1.5);
    const sp = Math.round(3 * scale);
    for (let i = 0; i < sp; i++) fx.spark(px, s.y + 0.4, pz, (rnd() - 0.5) * 1.6, 0.8 + rnd() * 1.2, (rnd() - 0.5) * 1.6, 0.6, 0.07, 0.02, SPARK, 0.95, 4, 0);
  }
  const ch = Math.round((6 + s.w * s.h * 0.4) * scale);
  for (let i = 0; i < ch; i++) fx.chunk(cx + (rnd() - 0.5) * s.w, s.y + s.top * 0.6, cz + (rnd() - 0.5) * s.h, (rnd() - 0.5) * 2, 1 + rnd() * 1.4, (rnd() - 0.5) * 2, 0.6, 0.04 + rnd() * 0.03, s.wood ? WOOD : STONE, 10);
}

/** Staub am Mauerfuß, solange ein Mauerstück wächst (Mauerzug läuft entlang) */
export function wallFx(fx: FxSystem, x: number, y: number, z: number, wood: boolean, dt: number, scale: number): void {
  if (rnd() < dt * 7 * scale) fx.puff(x + (rnd() - 0.5) * 0.7, y + 0.08, z + (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.4, 0.15 + rnd() * 0.2, (rnd() - 0.5) * 0.4, 0.9, 0.12, 0.45, DUST, 0.3, -0.05, 0.9);
  if (rnd() < dt * 4 * scale) fx.chunk(x + (rnd() - 0.5) * 0.5, y + 0.6, z + (rnd() - 0.5) * 0.5, (rnd() - 0.5), 0.8 + rnd(), (rnd() - 0.5), 0.45, 0.04, wood ? WOOD : STONE, 9);
}
