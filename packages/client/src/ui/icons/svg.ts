/**
 * Bausteine für die Code-erzeugten SVG-Icons (64x64-Raster).
 * Stil: dicker dunkler Umriss, flache Low-Poly-Facetten in 2-3 Tönen derselben Farbe.
 * Alle Funktionen liefern SVG-Fragmente (Strings); `wrap` macht daraus ein vollständiges <svg>.
 */
import { PAL } from '@strongpoly/shared';

export type Col = number;

/** Umrissfarbe */
export const INK: Col = PAL.black;
/** Standard-Umrissbreite im 64er-Raster (ca. 1,3 px bei 32 px) */
export const SW = 2.6;
/** dünne Innenlinien */
export const TH = 1.5;

/** Zusatzfarben, die in der Palette fehlen, aber zu ihr passen */
export const X = {
  iron: 0x6f7f91,
  steel: 0xaab6c2,
  steelDark: 0x7d8996,
  red: 0xc23b2e,
  redDark: 0x8f2a21,
  apple: 0xc8322a,
  orange: 0xe8822a,
  flame: 0xf2a02a,
  flameHot: 0xf6d44a,
  cream: 0xeadcb0,
  bread: 0xc98a3c,
  cheese: 0xf0cd55,
  skin: 0xe6b98a,
  skinDark: 0xc9946a,
  cloth: 0x8a6a4a,
  leather: 0x8b5a33,
  hop: 0x9bc24a,
  milk: 0xf4f1e8,
  grey: 0x7c7c7c,
  smoke: 0xcfcac0,
  blue: 0x3f86c4,
  purple: 0x7a4aa8,
  pink: 0xe58ab4,
  brown: 0x5a3a22,
  night: 0x2b3345,
} as const;

export const hx = (c: Col): string => '#' + c.toString(16).padStart(6, '0');
const n1 = (n: number): string => String(Math.round(n * 10) / 10);

export function mix(a: Col, b: Col, t: number): Col {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
export const lite = (c: Col, t = 0.3): Col => mix(c, 0xfff8e8, t);
export const dark = (c: Col, t = 0.3): Col => mix(c, 0x1a1410, t);

function pts(p: number[]): string {
  const o: string[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) o.push(n1(p[i]) + ',' + n1(p[i + 1]));
  return o.join(' ');
}

/** Gefülltes Polygon mit Umriss (sw=0: nur Fläche, null: nur Umriss). */
export function poly(p: number[], fill: Col | null, sw: number = SW, op = 1): string {
  const f = fill === null ? 'none' : hx(fill);
  const s = sw > 0 ? ` stroke="${hx(INK)}" stroke-width="${sw}"` : '';
  const o = op < 1 ? ` opacity="${op}"` : '';
  return `<polygon points="${pts(p)}" fill="${f}"${s}${o}/>`;
}

/** Offener Linienzug */
export function line(p: number[], sw: number = TH, col: Col = INK, op = 1): string {
  const o = op < 1 ? ` opacity="${op}"` : '';
  return `<polyline points="${pts(p)}" fill="none" stroke="${hx(col)}" stroke-width="${sw}"${o}/>`;
}

/** Rechteck (als Polygon) */
export function rect(x: number, y: number, w: number, h: number, fill: Col | null, sw: number = SW): string {
  return poly([x, y, x + w, y, x + w, y + h, x, y + h], fill, sw);
}

/** Regelmäßiges n-Eck (Low-Poly-"Kreis") */
export function ngon(cx: number, cy: number, rx: number, fill: Col | null, sw: number = SW, n = 8, ry: number = rx, rot = 22.5): string {
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180;
    p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return poly(p, fill, sw);
}

/** Echter Kreis (für Punkte, Augen) */
export function dot(cx: number, cy: number, r: number, fill: Col, sw = 0): string {
  const s = sw > 0 ? ` stroke="${hx(INK)}" stroke-width="${sw}"` : '';
  return `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${hx(fill)}"${s}/>`;
}

/** Weicher Bodenschatten */
export function shadow(cx: number, cy: number, rx: number, ry = rx * 0.28): string {
  return `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="${hx(INK)}" opacity="0.22"/>`;
}

/** Gruppe mit Transformation: Ursprung nach (x,y), drehen, skalieren */
export function at(x: number, y: number, inner: string, rot = 0, s = 1): string {
  return `<g transform="translate(${n1(x)} ${n1(y)})${rot ? ` rotate(${rot})` : ''}${s !== 1 ? ` scale(${s})` : ''}">${inner}</g>`;
}

/** Spiegeln an der senkrechten Achse x=cx */
export function flipX(inner: string, cx = 32): string {
  return `<g transform="translate(${cx * 2} 0) scale(-1 1)">${inner}</g>`;
}

/** Quader in Schrägansicht: Front (Grundton), Seite (dunkel), Oberseite (hell). (x,y) = oben links der Front. */
export function cube(x: number, y: number, w: number, h: number, d: number, c: Col, sw: number = SW): string {
  const dy = d * 0.6;
  return (
    poly([x + w, y, x + w + d, y - dy, x + w + d, y + h - dy, x + w, y + h], dark(c, 0.3), sw) +
    poly([x, y, x + d, y - dy, x + w + d, y - dy, x + w, y], lite(c, 0.35), sw) +
    poly([x, y, x + w, y, x + w, y + h, x, y + h], c, sw)
  );
}

/** Walze (stehend), Seitenansicht mit zwei Tönen */
export function cyl(cx: number, y: number, w: number, h: number, c: Col, sw: number = SW): string {
  const x = cx - w / 2;
  return (
    poly([x, y, x + w, y, x + w, y + h, x, y + h], c, sw) +
    poly([cx + w * 0.12, y, x + w, y, x + w, y + h, cx + w * 0.12, y + h], dark(c, 0.28), 0) +
    poly([x, y, x + w * 0.28, y, x + w * 0.28, y + h, x, y + h], lite(c, 0.25), 0) +
    poly([x, y, x + w, y, x + w, y + h, x, y + h], null, sw)
  );
}

/** Dach (Satteldach, Giebel vorn): Front-Dreieck + rechte Dachfläche. */
export function gable(x: number, w: number, yb: number, rh: number, d: number, c: Col, ov = 2.5): string {
  const mx = x + w / 2, dy = d * 0.6, x1 = x + w + ov, x0 = x - ov;
  return (
    poly([mx, yb - rh, x1, yb, x1 + d, yb - dy, mx + d, yb - rh - dy], dark(c, 0.25), SW) +
    poly([x0, yb, x1, yb, mx, yb - rh], c, SW) +
    poly([mx, yb - rh, x1, yb, mx, yb], dark(c, 0.15), 0)
  );
}

/** Einfaches Haus: Wand (Front+Seite) + Satteldach + optional Tür. (x,y) oben links der Wandfront. */
export function house(x: number, y: number, w: number, h: number, d: number, wall: Col, roof: Col, rh: number, door: Col | null = PAL.woodDark): string {
  const dy = d * 0.6;
  let s = poly([x + w, y, x + w + d, y - dy, x + w + d, y + h - dy, x + w, y + h], dark(wall, 0.3));
  s += poly([x, y, x + w, y, x + w, y + h, x, y + h], wall);
  if (door !== null) s += poly([x + w / 2 - 3, y + h, x + w / 2 - 3, y + h - 8, x + w / 2 + 3, y + h - 8, x + w / 2 + 3, y + h], door, 2);
  s += gable(x, w, y, rh, d, roof);
  return s;
}

/** Zinnenkranz auf Oberkante y, von x bis x+w, n Zinnen */
export function crenel(x: number, y: number, w: number, n: number, mh: number, c: Col): string {
  const step = w / (n * 2 - 1);
  let s = '';
  for (let i = 0; i < n; i++) s += rect(x + i * 2 * step, y - mh, step, mh + 1, c, 2);
  return s;
}

/** Steinquader-Fugen als dünne Linien in einer Fläche */
export function bricks(x: number, y: number, w: number, h: number, rows = 3, col: Col = INK): string {
  let s = '';
  for (let r = 1; r < rows; r++) {
    const yy = y + (h * r) / rows;
    s += line([x, yy, x + w, yy], 1.1, col, 0.45);
  }
  return s;
}

export function door(x: number, y: number, w: number, h: number, c: Col = PAL.woodDark): string {
  return poly([x, y, x, y - h + w / 2, x + w / 2, y - h, x + w, y - h + w / 2, x + w, y], c, 2);
}
export function win(x: number, y: number, s = 4, c: Col = X.night): string {
  return rect(x, y, s, s, c, 1.6);
}

export function flag(x: number, y: number, h: number, c: Col, w = 8): string {
  return line([x, y, x, y - h], 2, INK) + poly([x, y - h, x + w, y - h + w * 0.4, x, y - h + w * 0.8], c, 1.8);
}

/** Rauchwölkchen */
export function smoke(x: number, y: number, s = 1): string {
  return (
    ngon(x, y, 3.4 * s, X.smoke, 1.6, 6) +
    ngon(x + 3 * s, y - 5 * s, 3 * s, lite(X.smoke, 0.3), 1.6, 6) +
    ngon(x - 1 * s, y - 9.5 * s, 2.5 * s, lite(X.smoke, 0.5), 1.6, 6)
  );
}

export function flame(x: number, y: number, s = 1): string {
  return (
    poly([x - 6 * s, y, x - 7 * s, y - 8 * s, x - 2 * s, y - 14 * s, x - 3 * s, y - 6 * s, x, y - 20 * s, x + 4 * s, y - 10 * s, x + 7 * s, y - 14 * s, x + 7 * s, y - 4 * s, x + 4 * s, y], X.flame, 2.2) +
    poly([x - 3 * s, y, x - 3.5 * s, y - 5 * s, x, y - 11 * s, x + 3 * s, y - 5 * s, x + 3 * s, y], X.flameHot, 0)
  );
}

export function tree(x: number, y: number, s = 1, c: Col = PAL.treeLight): string {
  return (
    rect(x - 1.8 * s, y - 7 * s, 3.6 * s, 7 * s, PAL.trunk, 2) +
    poly([x - 9 * s, y - 6 * s, x, y - 26 * s, x + 9 * s, y - 6 * s], c, 2.4) +
    poly([x, y - 26 * s, x + 9 * s, y - 6 * s, x, y - 6 * s], dark(c, 0.25), 0) +
    poly([x - 9 * s, y - 6 * s, x, y - 26 * s, x + 9 * s, y - 6 * s], null, 2.4)
  );
}

export function logEnd(cx: number, cy: number, r: number): string {
  return ngon(cx, cy, r, PAL.wood, 2, 7) + ngon(cx, cy, r * 0.45, lite(PAL.wood, 0.4), 0, 6);
}

/** Liegender Baumstamm, Länge w, Höhe 2r, links = Schnittfläche */
export function logH(x: number, y: number, w: number, r: number): string {
  return rect(x, y - r, w, 2 * r, PAL.woodDark, 2.2) + poly([x + 2, y - r, x + w, y - r, x + w, y - r * 0.2, x + 2, y - r * 0.2], PAL.wood, 0) + logEnd(x, y, r);
}

export function barrel(cx: number, y: number, w: number, h: number, c: Col = PAL.wood): string {
  const x = cx - w / 2;
  return (
    poly([x + 1.5, y, x + w - 1.5, y, x + w, y + h * 0.28, x + w, y + h * 0.72, x + w - 1.5, y + h, x + 1.5, y + h, x, y + h * 0.72, x, y + h * 0.28], c, SW) +
    poly([cx + w * 0.1, y, x + w - 1.5, y, x + w, y + h * 0.28, x + w, y + h * 0.72, x + w - 1.5, y + h, cx + w * 0.1, y + h], dark(c, 0.28), 0) +
    line([x + 0.5, y + h * 0.28, x + w - 0.5, y + h * 0.28], 1.6, INK, 0.8) +
    line([x + 0.5, y + h * 0.72, x + w - 0.5, y + h * 0.72], 1.6, INK, 0.8) +
    poly([x + 1.5, y, x + w - 1.5, y, x + w, y + h * 0.28, x + w, y + h * 0.72, x + w - 1.5, y + h, x + 1.5, y + h, x, y + h * 0.72, x, y + h * 0.28], null, SW)
  );
}

export function sack(cx: number, y: number, w: number, h: number, c: Col = X.cream): string {
  const x = cx - w / 2;
  return (
    poly([cx - w * 0.2, y, cx + w * 0.2, y, cx + w * 0.3, y + h * 0.18, x + w, y + h * 0.5, x + w - 1, y + h, x + 1, y + h, x, y + h * 0.5, cx - w * 0.3, y + h * 0.18], c, SW) +
    poly([cx + w * 0.08, y + h * 0.2, cx + w * 0.3, y + h * 0.18, x + w, y + h * 0.5, x + w - 1, y + h, cx + w * 0.08, y + h], dark(c, 0.2), 0) +
    line([cx - w * 0.3, y + h * 0.18, cx + w * 0.3, y + h * 0.18], 2, INK)
  );
}

export function crate(x: number, y: number, s: number, c: Col = PAL.wood): string {
  return cube(x, y, s, s, s * 0.3, c, 2.2) + line([x, y, x + s, y + s], 1.2, INK, 0.5) + line([x + s, y, x, y + s], 1.2, INK, 0.5);
}

/** Stein-Quader (Stein/Steinbruch/Mauerteil) */
export function stoneBlock(x: number, y: number, w: number, h: number, c: Col = PAL.stone): string {
  return cube(x, y, w, h, Math.min(w, h) * 0.45, c, 2.2);
}

export function pole(x: number, y1: number, y2: number, w = 2.4, c: Col = PAL.wood): string {
  return rect(x - w / 2, y1, w, y2 - y1, c, 1.8);
}

export function coin(cx: number, cy: number, r: number): string {
  return ngon(cx, cy, r, PAL.gold, 2.2, 8) + ngon(cx, cy, r * 0.6, lite(PAL.gold, 0.35), 0, 8);
}

/** Pfeil (waagrecht, Spitze rechts), Länge l ab (0,0) */
export function arrow(l: number, c: Col = X.steel): string {
  return (
    line([0, 0, l - 3, 0], 2, PAL.woodDark) +
    poly([l - 5, -3, l + 2, 0, l - 5, 3], c, 1.6) +
    poly([-1, 0, -4, -3, -1, -3.5, 2, 0, -1, 3.5, -4, 3], PAL.white, 1.2)
  );
}

export function wrap(inner: string, size: number, label: string): string {
  const l = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<svg class="sp-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${l}"><g stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;
}
