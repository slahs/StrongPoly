/** Werkzeug-, Beliebtheits-, Gesichts- und Kategorie-Icons. */
import { BT, PAL, R } from '@strongpoly/shared';
import { BUILDING_ICONS, gear } from './buildings';
import { RESOURCE_ICONS } from './items';
import { hammerP, man, pikeP, shieldP, spearP, swordP } from './parts';
import { Col, INK, SW, X, at, coin, cube, dark, flag, flame, line, lite, mix, ngon, poly, pole, rect, shadow } from './svg';

export type Drawer = () => string;

// ---------- Bausteine ----------

/** Dicker Pfeil von (x1,y1) nach (x2,y2) */
function bigArrow(x1: number, y1: number, x2: number, y2: number, c: Col, w = 7, hw = 17, hl = 15): string {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  const full = [x1 + (nx * w) / 2, y1 + (ny * w) / 2, bx + (nx * w) / 2, by + (ny * w) / 2, bx + (nx * hw) / 2, by + (ny * hw) / 2, x2, y2, bx - (nx * hw) / 2, by - (ny * hw) / 2, bx - (nx * w) / 2, by - (ny * w) / 2, x1 - (nx * w) / 2, y1 - (ny * w) / 2];
  const side = [x1, y1, x2, y2, bx - (nx * hw) / 2, by - (ny * hw) / 2, bx - (nx * w) / 2, by - (ny * w) / 2, x1 - (nx * w) / 2, y1 - (ny * w) / 2];
  return poly(full, c, SW) + poly(side, dark(c, 0.22), 0) + poly(full, null, SW);
}

/** Kreisbogen-Pfeil (Winkel in Grad, im Uhrzeigersinn von a0 nach a1) */
function circArrow(cx: number, cy: number, r: number, a0: number, a1: number, c: Col): string {
  const p: number[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  const ae = (a1 * Math.PI) / 180, dir = a1 > a0 ? 1 : -1;
  const tx = -Math.sin(ae) * dir, ty = Math.cos(ae) * dir; // Tangente
  const ex = cx + Math.cos(ae) * r, ey = cy + Math.sin(ae) * r;
  const nx = Math.cos(ae), ny = Math.sin(ae);
  const head = [ex + tx * 11, ey + ty * 11, ex + nx * 11 - tx * 4, ey + ny * 11 - ty * 4, ex - nx * 11 - tx * 4, ey - ny * 11 - ty * 4];
  return line(p, 10.4, INK) + poly(head, INK, 5) + line(p, 6, c) + poly(head, c, 0);
}

function badge(c: Col): string {
  return ngon(32, 32, 27, c, SW, 12) + poly([32, 5, 52, 12, 59, 32, 52, 52, 32, 59, 32, 32], dark(c, 0.22), 0) + poly([6, 22, 12, 12, 32, 5, 32, 32], lite(c, 0.2), 0) + ngon(32, 32, 27, null, SW, 12);
}

function shovelP(): string {
  return (
    rect(-1.6, -14, 3.2, 28, PAL.wood, 2) + rect(-5, -17, 10, 3.4, PAL.woodDark, 2) +
    poly([-6, 14, 6, 14, 7, 28, 0, 34, -7, 28], X.steel, 2.4) + poly([0, 14, 6, 14, 7, 28, 0, 34], X.steelDark, 0) + poly([-6, 14, 6, 14, 7, 28, 0, 34, -7, 28], null, 2.4)
  );
}

function wrenchP(): string {
  return (
    rect(-2.2, -6, 4.4, 30, X.steel, 2.2) + poly([-8, -22, -3, -22, -3, -14, 3, -14, 3, -22, 8, -22, 9, -10, 4, -4, -4, -4, -9, -10], X.steel, 2.4) + poly([0, -4, 4, -4, 9, -10, 8, -22, 3, -22, 3, -14, 0, -14], X.steelDark, 0)
  );
}

function token(cx: number, cy: number, c: Col = X.steel, r = 4.4): string {
  return ngon(cx, cy, r, c, 2, 7) + ngon(cx - 1, cy - 1.2, r * 0.4, lite(c, 0.4), 0, 5);
}

function drop(cx: number, cy: number, s: number, c: Col): string {
  return poly([cx, cy - 8 * s, cx + 5.5 * s, cy, cx + 5 * s, cy + 4.4 * s, cx, cy + 8 * s, cx - 5 * s, cy + 4.4 * s, cx - 5.5 * s, cy], c, 2) + poly([cx, cy - 8 * s, cx + 5.5 * s, cy, cx + 5 * s, cy + 4.4 * s, cx, cy + 8 * s], dark(c, 0.2), 0);
}

function key(x: number, y: number, w: number, h: number, c: Col = PAL.stone): string {
  return rect(x, y, w, h, c, 1.8) + rect(x + 1, y + 1, w - 2, h * 0.35, lite(c, 0.4), 0);
}

function sub(inner: string, x: number, y: number, s: number): string {
  return at(x, y, inner, 0, s);
}

// ---------- Werkzeuge ----------

export interface ToolDef {
  name: string;
  draw: Drawer;
}

export const TOOL_ICONS: Record<string, ToolDef> = {
  demolish: {
    name: 'Abreißen',
    draw: () =>
      cube(4, 34, 30, 22, 8, PAL.stone) + poly([4, 34, 14, 34, 18, 44, 10, 48, 14, 56, 4, 56], PAL.stoneDark, 0, 0.0) +
      line([14, 34, 20, 42, 14, 48, 22, 56], 1.8, INK) + at(38, 24, hammerP(), 40, 1.25) +
      poly([42, 46, 47, 42, 49, 48], PAL.stone, 1.8) + poly([52, 54, 58, 50, 58, 57], PAL.stoneDark, 1.8) + poly([36, 52, 40, 49, 42, 55], PAL.stone, 1.8),
  },
  repair: {
    name: 'Reparieren',
    draw: () => at(32, 32, hammerP(), -42, 1.25) + at(32, 32, wrenchP(), 42, 1.1),
  },
  undo: { name: 'Rückgängig', draw: () => circArrow(32, 34, 17, -20, -290, X.blue) },
  cancel: {
    name: 'Bau abbrechen',
    draw: () =>
      cube(10, 30, 32, 24, 8, PAL.wood) + poly([8, 30, 26, 14, 44, 30], PAL.thatch, SW) +
      poly([42, 10, 48, 4, 60, 16, 54, 22], X.red, 0) + poly([30, 22, 36, 16, 44, 24, 52, 16, 58, 22, 50, 30, 58, 38, 52, 44, 44, 36, 36, 44, 30, 38, 38, 30], X.red, SW) + poly([44, 24, 52, 16, 58, 22, 50, 30, 58, 38, 52, 44, 44, 36], dark(X.red, 0.25), 0) + poly([30, 22, 36, 16, 44, 24, 52, 16, 58, 22, 50, 30, 58, 38, 52, 44, 44, 36, 36, 44, 30, 38, 38, 30], null, SW),
  },
  rotate: { name: 'Drehen', draw: () => circArrow(32, 32, 18, -60, 200, PAL.gold) },
  move: {
    name: 'Bewegen',
    draw: () => bigArrow(6, 46, 40, 26, X.blue, 9, 21, 17) + flag(52, 56, 26, X.red, 10) + poly([46, 56, 58, 56, 56, 59, 48, 59], PAL.sandDark, 1.8),
  },
  attack: {
    name: 'Angreifen',
    draw: () => at(32, 32, swordP(), 45, 1.3) + at(32, 32, swordP(), -45, 1.3),
  },
  groundattack: {
    name: 'Bodenangriff',
    draw: () =>
      ngon(32, 44, 24, X.red, SW, 10, 12) + ngon(32, 44, 24, null, SW, 10, 12) + ngon(32, 44, 14, PAL.white, 2.2, 10, 6.6) + ngon(32, 44, 6, X.red, 2, 8, 3) +
      line([32, 26, 32, 62], 1.6, INK) + line([8, 44, 56, 44], 1.6, INK) + bigArrow(32, 2, 32, 40, PAL.stoneDark, 6, 15, 12),
  },
  patrol: {
    name: 'Patrouille',
    draw: () => pole(10, 14, 56, 3) + pole(54, 14, 56, 3) + poly([10, 14, 20, 17, 10, 21], X.red, 1.8) + poly([54, 14, 44, 17, 54, 21], X.red, 1.8) + bigArrow(18, 30, 46, 30, X.blue, 7, 16, 11) + bigArrow(46, 46, 18, 46, PAL.oasis, 7, 16, 11),
  },
  stop: {
    name: 'Stopp',
    draw: () =>
      ngon(32, 32, 28, X.red, SW, 8) + poly([32, 4, 52, 12, 60, 32, 52, 52, 32, 60, 32, 32], dark(X.red, 0.25), 0) + ngon(32, 32, 28, null, SW, 8) +
      rect(18, 26, 28, 12, PAL.white, 2) + rect(18, 26, 28, 5, lite(PAL.white, 0), 0),
  },
  stance_hold: {
    name: 'Stellung halten',
    draw: () => at(32, 31, shieldP(X.steel, X.blue), 0, 2.2) + ngon(32, 30, 5, PAL.gold, 2, 6),
  },
  stance_defensive: {
    name: 'Defensiv',
    draw: () => at(32, 30, swordP(), 40, 1.2) + at(28, 36, shieldP(PAL.wood, PAL.gold), 0, 1.9),
  },
  stance_aggressive: {
    name: 'Aggressiv',
    draw: () =>
      poly([32, 2, 38, 14, 50, 6, 46, 20, 62, 20, 50, 30, 60, 42, 46, 40, 48, 56, 36, 46, 30, 60, 26, 46, 12, 54, 18, 40, 2, 36, 16, 28, 6, 14, 22, 18, 24, 6], X.red, SW) + poly([32, 2, 38, 14, 50, 6, 46, 20, 62, 20, 50, 30, 60, 42, 46, 40, 48, 56, 36, 46, 30, 60], dark(X.red, 0.25), 0) +
      poly([32, 2, 38, 14, 50, 6, 46, 20, 62, 20, 50, 30, 60, 42, 46, 40, 48, 56, 36, 46, 30, 60, 26, 46, 12, 54, 18, 40, 2, 36, 16, 28, 6, 14, 22, 18, 24, 6], null, SW) + at(32, 31, swordP(), 0, 1.1),
  },
  formation_free: {
    name: 'Freie Formation',
    draw: () => token(14, 18) + token(40, 12) + token(26, 30) + token(52, 32) + token(12, 46) + token(36, 50) + token(54, 54),
  },
  formation_line: {
    name: 'Linie',
    draw: () => token(8, 32) + token(20, 32) + token(32, 32) + token(44, 32) + token(56, 32) + bigArrow(10, 52, 54, 52, PAL.stoneDark, 4, 10, 9),
  },
  formation_box: {
    name: 'Block',
    draw: () => {
      let s = '';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += token(14 + c * 18, 14 + r * 18, X.steel, 5.6);
      return s;
    },
  },
  formation_wedge: {
    name: 'Keil',
    draw: () => token(32, 10, X.steel, 5) + token(22, 24, X.steel, 5) + token(42, 24, X.steel, 5) + token(12, 38, X.steel, 5) + token(32, 38, X.steel, 5) + token(52, 38, X.steel, 5) + token(2 + 5, 52, X.steel, 4.6) + token(22, 52, X.steel, 4.6) + token(42, 52, X.steel, 4.6) + token(57, 52, X.steel, 4.6),
  },
  dig: {
    name: 'Graben',
    draw: () =>
      poly([2, 50, 14, 42, 62, 42, 54, 50], PAL.sandDark, SW) + poly([6, 52, 16, 45, 52, 45, 46, 52], PAL.pitch, 2) +
      poly([2, 50, 54, 50, 62, 42, 62, 56, 2, 56], mix(PAL.sandDark, PAL.rock, 0.3), 0) + line([2, 56, 62, 56], 2.4, INK) +
      at(28, 22, shovelP(), 28, 1.0) + poly([40, 42, 46, 36, 50, 42], PAL.sandDark, 2) + poly([44, 44, 52, 38, 56, 44], PAL.sand, 2),
  },
  filloil: {
    name: 'Ölkessel füllen',
    draw: () =>
      flame(20, 62, 0.8) + flame(44, 62, 0.8) + poly([10, 34, 54, 34, 54, 42, 48, 54, 38, 58, 26, 58, 16, 54, 10, 42], X.night, SW) + poly([32, 34, 54, 34, 54, 42, 48, 54, 38, 58, 32, 58], dark(X.night, 0.3), 0) + ngon(32, 34, 22, X.brown, SW, 10, 5.6) + ngon(32, 34.5, 17, PAL.pitch, 0, 10, 3.6) +
      drop(32, 12, 1.7, PAL.pitch) + drop(32, 12, 1.7, mix(PAL.pitch, PAL.stoneDark, 0.2)),
  },
  pause: {
    name: 'Pause',
    draw: () => badge(PAL.stoneDark) + rect(20, 18, 8, 28, PAL.white, 2.2) + rect(36, 18, 8, 28, PAL.white, 2.2),
  },
  play: {
    name: 'Weiter',
    draw: () => badge(PAL.oasisDark) + poly([24, 16, 24, 48, 49, 32], PAL.white, 2.4) + poly([24, 32, 49, 32, 24, 48], X.cream, 0) + poly([24, 16, 24, 48, 49, 32], null, 2.4),
  },
  speed: {
    name: 'Tempo',
    draw: () => badge(X.blue) + poly([13, 18, 13, 46, 30, 32], PAL.white, 2.2) + poly([31, 18, 31, 46, 48, 32], PAL.white, 2.2) + rect(50, 18, 4, 28, PAL.white, 1.8),
  },
  center: {
    name: 'Zentrieren',
    draw: () =>
      line([6, 20, 6, 6, 20, 6], 6, INK) + line([6, 20, 6, 6, 20, 6], 3, PAL.gold) + line([44, 6, 58, 6, 58, 20], 6, INK) + line([44, 6, 58, 6, 58, 20], 3, PAL.gold) +
      line([6, 44, 6, 58, 20, 58], 6, INK) + line([6, 44, 6, 58, 20, 58], 3, PAL.gold) + line([44, 58, 58, 58, 58, 44], 6, INK) + line([44, 58, 58, 58, 58, 44], 3, PAL.gold) +
      ngon(32, 32, 10, X.red, SW, 8) + ngon(32, 32, 3.4, PAL.white, 0, 6),
  },
  group: {
    name: 'Gruppe',
    draw: () => at(-6, 8, man({ tunic: X.steelDark, hat: 'helm', legsOff: true }), 0, 0.72) + at(26, 8, man({ tunic: X.steelDark, hat: 'helm', legsOff: true }), 0, 0.72) + at(10, 14, man({ tunic: X.steel, hat: 'helm', hatCol: X.red, team: X.red, mark: 'tabard', legsOff: true }), 0, 0.82),
  },
  selectall: {
    name: 'Alle wählen',
    draw: () =>
      poly([6, 10, 44, 10, 44, 44, 6, 44], X.blue, 0, 0.25) + line([6, 10, 44, 10, 44, 44, 6, 44, 6, 10], 3, X.blue) +
      poly([30, 26, 30, 58, 38, 50, 44, 62, 50, 58, 44, 46, 56, 46], PAL.white, 2.4),
  },
  save: {
    name: 'Speichern',
    draw: () =>
      poly([8, 8, 50, 8, 58, 16, 58, 56, 8, 56], X.blue, SW) + poly([32, 8, 50, 8, 58, 16, 58, 56, 32, 56], dark(X.blue, 0.25), 0) + poly([8, 8, 50, 8, 58, 16, 58, 56, 8, 56], null, SW) +
      rect(16, 8, 28, 16, PAL.white, 2) + rect(36, 11, 5, 10, PAL.stoneDark, 1.4) + rect(14, 34, 36, 22, X.cream, 2) + line([19, 40, 45, 40], 1.5, INK, 0.5) + line([19, 46, 45, 46], 1.5, INK, 0.5),
  },
  load: {
    name: 'Laden',
    draw: () =>
      poly([4, 18, 24, 18, 30, 24, 60, 24, 60, 54, 4, 54], PAL.sandDark, SW) + poly([4, 30, 60, 30, 56, 54, 4, 54], PAL.sand, SW) + bigArrow(32, 28, 32, 2, PAL.oasis, 8, 20, 12),
  },
  options: { name: 'Optionen', draw: () => gear(32, 32, 26, 8, X.steel) },
  menu: {
    name: 'Menü',
    draw: () => badge(PAL.woodDark) + rect(15, 17, 34, 6, PAL.white, 2) + rect(15, 29, 34, 6, PAL.white, 2) + rect(15, 41, 34, 6, PAL.white, 2),
  },
  help: {
    name: 'Hilfe',
    draw: () => badge(X.blue) + poly([22, 24, 24, 16, 32, 12, 40, 16, 42, 24, 36, 32, 33, 36, 33, 40, 29, 40, 29, 34, 34, 29, 37, 24, 35, 19, 29, 19, 26, 24], PAL.white, 2) + rect(29, 45, 5, 5, PAL.white, 2),
  },
  encyclopedia: {
    name: 'Enzyklopädie',
    draw: () =>
      cube(10, 10, 34, 46, 8, X.red) + rect(46, 14, 2, 40, PAL.white, 0) + poly([44, 10, 52, 4.8, 52, 46, 44, 56], X.cream, SW) + line([46, 20, 52, 16], 1.2, INK, 0.5) + line([46, 30, 52, 26], 1.2, INK, 0.5) + line([46, 40, 52, 36], 1.2, INK, 0.5) +
      poly([10, 10, 44, 10, 44, 56, 10, 56], X.red, SW) + rect(14, 14, 26, 38, null, 1.8) + ngon(27, 33, 8, PAL.gold, 2, 8) + line([27, 26, 27, 40], 1.6, dark(PAL.gold, 0.5)) + line([21, 33, 33, 33], 1.6, dark(PAL.gold, 0.5)),
  },
  advisor: {
    name: 'Berater',
    draw: () =>
      at(-4, 8, man({ tunic: X.purple, hat: 'cap', hatCol: X.purple, legsOff: true, team: PAL.gold, mark: 'sash' }), 0, 0.92) +
      poly([40, 4, 62, 4, 62, 22, 52, 22, 46, 28, 46, 22, 40, 22], PAL.white, 2.2) + rect(45, 9, 12, 2, INK, 0) + rect(45, 14, 8, 2, INK, 0),
  },
  hotkeys: {
    name: 'Tastenbelegung',
    draw: () => {
      let s = '';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) s += key(4 + c * 14, 8 + r * 15, 12, 12);
      return s + key(14, 53, 36, 8);
    },
  },
  gold: { name: 'Gold', draw: () => shadow(32, 58, 22) + coin(32, 50, 11) + coin(18, 44, 10) + coin(46, 42, 10) + coin(32, 30, 13) },
  peasants: { name: 'Bauern', draw: () => at(0, 0, man({ tunic: PAL.thatch, legs: PAL.woodDark, hat: 'straw' }), 0, 1) },
  troops: { name: 'Truppen', draw: () => at(32, 34, swordP(), 0, 1.0) + at(32, 22, shieldP(X.steel, X.red), 0, 1.5) },
  time: {
    name: 'Zeit',
    draw: () =>
      rect(10, 5, 44, 5, PAL.woodDark, 2.2) + rect(10, 54, 44, 5, PAL.woodDark, 2.2) +
      poly([14, 10, 50, 10, 38, 30, 38, 34, 50, 54, 14, 54, 26, 34, 26, 30], X.cream, SW, 0.55) + poly([14, 10, 50, 10, 38, 30, 26, 30], null, 0) +
      poly([20, 12, 44, 12, 36, 26, 28, 26], PAL.thatch, 0) + poly([24, 54, 40, 54, 36, 44, 28, 44], PAL.thatch, 0) + line([32, 30, 32, 44], 1.6, PAL.thatch) + poly([14, 10, 50, 10, 38, 30, 38, 34, 50, 54, 14, 54, 26, 34, 26, 30], null, SW),
  },
  sound: {
    name: 'Ton',
    draw: () => poly([6, 24, 18, 24, 32, 12, 32, 52, 18, 40, 6, 40], PAL.stone, SW) + poly([18, 24, 32, 12, 32, 52, 18, 40], PAL.stoneDark, 0) + poly([6, 24, 18, 24, 32, 12, 32, 52, 18, 40, 6, 40], null, SW) + line([40, 24, 44, 32, 40, 40], 5.6, INK) + line([40, 24, 44, 32, 40, 40], 2.6, PAL.gold) + line([48, 16, 56, 32, 48, 48], 5.6, INK) + line([48, 16, 56, 32, 48, 48], 2.6, PAL.gold),
  },
  mute: {
    name: 'Stumm',
    draw: () => poly([4, 24, 16, 24, 30, 12, 30, 52, 16, 40, 4, 40], PAL.stone, SW) + poly([16, 24, 30, 12, 30, 52, 16, 40], PAL.stoneDark, 0) + poly([4, 24, 16, 24, 30, 12, 30, 52, 16, 40, 4, 40], null, SW) + poly([38, 22, 44, 16, 52, 24, 60, 16, 64 - 0, 22, 56, 30, 64, 38, 58, 44, 52, 36, 44, 44, 38, 38, 46, 30], X.red, 2.2),
  },
  zoom: {
    name: 'Zoom',
    draw: () => ngon(26, 26, 18, X.blue, SW, 10, 18, 0) + ngon(26, 26, 13, lite(X.blue, 0.55), 1.6, 10, 13, 0) + line([39, 39, 56, 56], 9, INK) + line([39, 39, 56, 56], 5, PAL.wood) + poly([16, 20, 22, 14, 26, 16, 18, 24], PAL.white, 0),
  },
  minimap: {
    name: 'Karte',
    draw: () => poly([4, 8, 24, 14, 42, 8, 60, 14, 60, 56, 42, 50, 24, 56, 4, 50], X.cream, SW) + poly([24, 14, 42, 8, 42, 50, 24, 56], PAL.sand, 0) + line([24, 14, 24, 56], 1.4, INK, 0.5) + line([42, 8, 42, 50], 1.4, INK, 0.5) + poly([10, 40, 18, 32, 30, 38, 36, 28, 52, 38, 50, 46, 24, 46], PAL.oasis, 0, 0.9) + poly([4, 8, 24, 14, 42, 8, 60, 14, 60, 56, 42, 50, 24, 56, 4, 50], null, SW) + ngon(40, 28, 4, X.red, 1.8, 6),
  },
};

// ---------- Beliebtheitsfaktoren ----------

function mini(draw: Drawer, x: number, y: number, s: number): string {
  return sub(draw(), x, y, s);
}

function skull(): string {
  return (
    poly([10, 28, 12, 14, 22, 6, 32, 4, 42, 6, 52, 14, 54, 28, 48, 36, 46, 46, 36, 46, 34, 52, 30, 52, 28, 46, 18, 46, 16, 36], PAL.white, SW) +
    poly([32, 4, 42, 6, 52, 14, 54, 28, 48, 36, 46, 46, 36, 46, 34, 52, 32, 52], X.smoke, 0) +
    poly([10, 28, 12, 14, 22, 6, 32, 4, 42, 6, 52, 14, 54, 28, 48, 36, 46, 46, 36, 46, 34, 52, 30, 52, 28, 46, 18, 46, 16, 36], null, SW) +
    poly([16, 22, 28, 22, 28, 34, 16, 32], X.night, 1.6) + poly([36, 22, 48, 22, 48, 32, 36, 34], X.night, 1.6) + poly([32, 36, 35, 42, 29, 42], X.night, 1.4) + line([24, 46, 24, 52], 1.6, INK) + line([40, 46, 40, 52], 1.6, INK) + line([32, 46, 32, 52], 1.6, INK)
  );
}

export const POP_FACTORS: Record<string, ToolDef> = {
  ration: { name: 'Rationen', draw: () => RESOURCE_ICONS[R.Bread]() },
  variety: {
    name: 'Nahrungsvielfalt',
    draw: () => mini(RESOURCE_ICONS[R.Apple], -6, 0, 0.6) + mini(RESOURCE_ICONS[R.Cheese], 28, 0, 0.6) + mini(RESOURCE_ICONS[R.Meat], -6, 28, 0.6) + mini(RESOURCE_ICONS[R.Bread], 28, 28, 0.6),
  },
  tax: {
    name: 'Steuern',
    draw: () =>
      shadow(32, 58, 22) + poly([20, 22, 44, 22, 52, 40, 46, 56, 18, 56, 12, 40], X.brown, SW) + poly([32, 22, 44, 22, 52, 40, 46, 56, 32, 56], dark(X.brown, 0.25), 0) + poly([20, 22, 44, 22, 52, 40, 46, 56, 18, 56, 12, 40], null, SW) +
      poly([24, 16, 40, 16, 38, 24, 26, 24], X.leather, 2.2) + coin(32, 40, 9) + coin(50, 14, 7) + coin(14, 14, 6),
  },
  ale: { name: 'Bier', draw: () => RESOURCE_ICONS[R.Ale]() },
  religion: {
    name: 'Religion',
    draw: () => {
      let rays = '';
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 * Math.PI) / 180;
        rays += poly([32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, 32 + Math.cos(a + 0.12) * 29, 32 + Math.sin(a + 0.12) * 29, 32 + Math.cos(a - 0.12) * 29, 32 + Math.sin(a - 0.12) * 29], PAL.gold, 1.4);
      }
      return rays + ngon(32, 32, 19, PAL.white, SW, 10) + poly([32, 13, 51, 32, 32, 51], X.cream, 0) + ngon(32, 32, 19, null, SW, 10) + poly([28, 18, 36, 18, 36, 28, 46, 28, 46, 36, 36, 36, 36, 48, 28, 48, 28, 36, 18, 36, 18, 28, 28, 28], PAL.gold, 2);
    },
  },
  good: {
    name: 'Gute Dinge',
    draw: () => mini(BUILDING_ICONS[BT.Garden], 0, 4, 1) ,
  },
  bad: { name: 'Schlechte Dinge', draw: () => mini(BUILDING_ICONS[BT.Gallows], 0, 0, 1) },
  fear: { name: 'Angst', draw: () => skull() },
  garden: { name: 'Garten', draw: () => BUILDING_ICONS[BT.Garden]() },
  crowd: {
    name: 'Überfüllung',
    draw: () =>
      mini(() => man({ tunic: PAL.thatch, legs: PAL.woodDark, hat: 'straw', legsOff: true }), -14, 12, 0.7) + mini(() => man({ tunic: X.cloth, hat: 'cap', hatCol: X.cloth, legsOff: true }), 20, 12, 0.7) +
      mini(() => man({ tunic: X.orange, hat: 'hood', hatCol: X.brown, legsOff: true }), 3, 20, 0.8) + poly([4, 60, 60, 60, 60, 56, 4, 56], PAL.sandDark, 2),
  },
  events: {
    name: 'Ereignisse',
    draw: () =>
      poly([10, 6, 50, 6, 54, 14, 54, 52, 50, 58, 10, 58, 6, 52, 6, 14], X.cream, SW) + poly([32, 6, 50, 6, 54, 14, 54, 52, 50, 58, 32, 58], dark(X.cream, 0.12), 0) + poly([10, 6, 50, 6, 54, 14, 54, 52, 50, 58, 10, 58, 6, 52, 6, 14], null, SW) +
      poly([27, 14, 37, 14, 35, 38, 29, 38], X.red, 2) + ngon(32, 46, 4.6, X.red, 2, 8),
  },
  food: { name: 'Nahrung', draw: () => RESOURCE_ICONS[R.Bread]() },
};

export const POP_ALIASES: Record<string, string> = { beer: 'ale', taxes: 'tax', bribe: 'tax', rations: 'ration', hunger: 'ration', religion_cover: 'religion' };

// ---------- Gesichter (Beliebtheit) ----------

export const FACE_COLORS: readonly Col[] = [X.red, X.orange, 0xe8c020, X.hop, 0x35a84a];
export const FACE_NAMES = ['Wütend', 'Unzufrieden', 'Gleichgültig', 'Zufrieden', 'Begeistert'];

/** Beliebtheit 0..100 -> Stufe 0..4 */
export function popFaceLevel(value: number): number {
  const v = Number.isFinite(value) ? value : 50;
  return v < 20 ? 0 : v < 40 ? 1 : v < 60 ? 2 : v < 80 ? 3 : 4;
}

export function faceIcon(level: number): string {
  const c = FACE_COLORS[level];
  let s = ngon(32, 32, 28, c, SW, 12) + poly([32, 4, 50, 10, 60, 32, 52, 52, 32, 60, 32, 32], dark(c, 0.2), 0) + poly([6, 22, 14, 10, 32, 4, 32, 32], lite(c, 0.25), 0) + ngon(32, 32, 28, null, SW, 12);
  const ink = dark(c, 0.78);
  const eyeY = 26;
  s += ngon(22, eyeY, 3.6, ink, 0, 6) + ngon(42, eyeY, 3.6, ink, 0, 6);
  switch (level) {
    case 0:
      s += line([15, 17, 27, 22], 3.4, ink) + line([49, 17, 37, 22], 3.4, ink) + poly([20, 48, 24, 40, 32, 38, 40, 40, 44, 48, 38, 44, 32, 43, 26, 44], ink, 1.4);
      break;
    case 1:
      s += line([16, 19, 27, 21], 2.6, ink) + line([48, 19, 37, 21], 2.6, ink) + line([22, 46, 27, 42, 37, 42, 42, 46], 3.4, ink);
      break;
    case 2:
      s += line([23, 43, 41, 43], 3.4, ink);
      break;
    case 3:
      s += line([21, 40, 27, 45, 37, 45, 43, 40], 3.4, ink);
      break;
    default:
      s += poly([17, 38, 47, 38, 43, 47, 37, 50, 27, 50, 21, 47], ink, 1.6) + poly([22, 38, 42, 38, 40, 42, 24, 42], PAL.white, 0) + poly([27, 46, 37, 46, 34, 50, 30, 50], X.pink, 0);
  }
  return s;
}

// ---------- Kategorien ----------

export const CATEGORY_ICONS: Record<string, ToolDef> = {
  castle: { name: 'Burg', draw: () => BUILDING_ICONS[BT.Keep]() },
  industry: { name: 'Industrie', draw: () => BUILDING_ICONS[BT.Quarry]() },
  farm: { name: 'Landwirtschaft', draw: () => BUILDING_ICONS[BT.WheatFarm]() },
  town: { name: 'Stadt', draw: () => BUILDING_ICONS[BT.Church]() },
  weapons: { name: 'Waffen', draw: () => at(32, 32, swordP(), 38, 1.2) + at(32, 32, pikeP(), -38, 1.0) },
  food: { name: 'Nahrung', draw: () => RESOURCE_ICONS[R.Bread]() },
  walls: { name: 'Mauern', draw: () => BUILDING_ICONS[BT.WallHigh]() },
  towers: { name: 'Türme', draw: () => BUILDING_ICONS[BT.TowerGuard]() },
  gates: { name: 'Tore', draw: () => BUILDING_ICONS[BT.GateStone]() },
  siege: { name: 'Belagerungsbau', draw: () => BUILDING_ICONS[BT.EngineerGuild]() },
  traps: { name: 'Fallen', draw: () => BUILDING_ICONS[BT.KillingPit]() },
  moat: {
    name: 'Graben',
    draw: () => poly([2, 36, 14, 24, 62, 24, 50, 36], PAL.sandDark, SW) + poly([8, 34, 18, 27, 56, 27, 46, 34], PAL.water, 2) + poly([2, 36, 50, 36, 62, 24, 62, 50, 2, 50], mix(PAL.sandDark, PAL.rock, 0.3), SW) + poly([8, 34, 46, 34, 56, 27, 18, 27], PAL.water, 2) + poly([2, 36, 50, 36, 62, 24, 62, 50, 2, 50], null, SW),
  },
  oil: { name: 'Öl', draw: () => BUILDING_ICONS[BT.Cauldron]() },
  units: { name: 'Truppen', draw: () => at(0, 0, man({ tunic: X.steel, legs: X.steelDark, hat: 'bascinet', hatCol: X.red, team: X.red, mark: 'tabard' }), 0, 1) + at(46, 36, spearP(), 6, 0.9) },
  mercs: { name: 'Söldner', draw: () => BUILDING_ICONS[BT.MercPost]() },
  engineers: { name: 'Ingenieure', draw: () => gear(32, 32, 26, 8, X.steel) + at(32, 32, hammerP(), 38, 0.9) },
};

