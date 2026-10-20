/** Icons für Waren (R-IDs: Rohstoffe, Nahrung, Waffen, Rüstungen) und Extreme-Fähigkeiten. */
import { PAL, R } from '@strongpoly/shared';
import { crossbowP, bowP, maceP, man, pikeP, spearP, swordP } from './parts';
import { Col, INK, SW, X, arrow, at, barrel, coin, dark, dot, line, lite, logH, mix, ngon, poly, rect, sack, shadow, stoneBlock } from './svg';

export type Drawer = () => string;

function ingot(x: number, y: number, w: number, h: number, c: Col): string {
  return (
    poly([x + 3, y, x + w - 3, y, x + w, y + h, x, y + h], c, 2.4) +
    poly([x + 3, y, x + w - 3, y, x + w - 4.5, y + h * 0.35, x + 4.5, y + h * 0.35], lite(c, 0.4), 0) +
    poly([x + w / 2, y + h * 0.35, x + w - 4.5, y + h * 0.35, x + w - 3, y, x + w, y + h, x + w / 2, y + h], dark(c, 0.2), 0) +
    poly([x + 3, y, x + w - 3, y, x + w, y + h, x, y + h], null, 2.4)
  );
}

function wheatSheaf(): string {
  let s = '';
  const xs = [-12, -6, 0, 6, 12];
  for (let i = 0; i < xs.length; i++) {
    const x = 32 + xs[i], top = 10 + Math.abs(xs[i]) * 0.5;
    s += at(32, 54, line([0, 0, xs[i] * 0.9, -(54 - top)], 2.4, PAL.steppe), 0, 1);
    for (let k = 0; k < 4; k++) {
      const yy = top + k * 3.6;
      s += poly([x, yy - 3, x + 4, yy + 0.5, x, yy + 3], PAL.thatch, 1.6) + poly([x, yy - 3, x - 4, yy + 0.5, x, yy + 3], lite(PAL.thatch, 0.25), 1.6);
    }
  }
  return s + poly([22, 38, 42, 38, 40, 44, 24, 44], X.leather, 2.2) + poly([26, 54, 38, 54, 42, 44, 22, 44], PAL.thatch, SW) + poly([32, 54, 38, 54, 42, 44, 32, 44], dark(PAL.thatch, 0.2), 0);
}

function cowBody(): string {
  const spot = (pp: number[]): string => poly(pp, X.night, 0);
  return (
    rect(14, 40, 5, 14, PAL.white, 2) + rect(22, 40, 5, 14, PAL.white, 2) + rect(37, 40, 5, 14, PAL.white, 2) + rect(45, 40, 5, 14, PAL.white, 2) +
    poly([5, 26, 47, 22, 54, 28, 52, 44, 8, 44, 5, 36], X.milk, SW) + spot([12, 24, 22, 23, 24, 32, 14, 34]) + spot([34, 26, 44, 24, 46, 34, 36, 36]) +
    poly([5, 26, 47, 22, 54, 28, 52, 44, 8, 44, 5, 36], null, SW) +
    poly([47, 18, 60, 20, 63, 28, 59, 38, 49, 36, 47, 26], X.milk, SW) + poly([55, 20, 60, 20, 63, 28, 59, 38, 55, 36], dark(X.milk, 0.15), 0) + poly([47, 18, 60, 20, 63, 28, 59, 38, 49, 36, 47, 26], null, SW) +
    poly([50, 18, 48, 11, 53, 16], PAL.thatch, 1.6) + poly([58, 20, 60, 13, 61, 20], PAL.thatch, 1.6) + dot(55, 26, 1.5, INK) + rect(53, 32, 8, 5, X.pink, 1.6)
  );
}

function breastplate(c: Col, trim: Col | null): string {
  return (
    poly([14, 16, 24, 11, 32, 15, 40, 11, 50, 16, 47, 25, 45, 44, 38, 50, 26, 50, 19, 44, 17, 25], c, SW) +
    poly([32, 15, 40, 11, 50, 16, 47, 25, 45, 44, 38, 50, 32, 50], dark(c, 0.22), 0) +
    poly([14, 16, 24, 11, 32, 15, 24, 30, 19, 44, 17, 25], lite(c, 0.28), 0) +
    poly([14, 16, 24, 11, 32, 15, 40, 11, 50, 16, 47, 25, 45, 44, 38, 50, 26, 50, 19, 44, 17, 25], null, SW) +
    line([32, 15, 32, 49], 1.4, INK, 0.5) +
    (trim !== null ? line([20, 44, 26, 49, 38, 49, 44, 44], 2.2, trim) + poly([29.5, 20, 34.5, 20, 34.5, 27, 29.5, 27], trim, 1.4) : '')
  );
}

function star4(cx: number, cy: number, r: number, c: Col): string {
  return poly([cx, cy - r, cx + r * 0.28, cy - r * 0.28, cx + r, cy, cx + r * 0.28, cy + r * 0.28, cx, cy + r, cx - r * 0.28, cy + r * 0.28, cx - r, cy, cx - r * 0.28, cy - r * 0.28], c, 1.6);
}

export const RESOURCE_ICONS: Record<number, Drawer> = {
  [R.Wood]: () => shadow(32, 56, 24) + logH(8, 46, 46, 5.4) + logH(14, 35, 42, 5.4) + logH(10, 24, 44, 5.4),

  [R.Stone]: () => shadow(32, 57, 24) + stoneBlock(6, 38, 24, 18, PAL.stone) + stoneBlock(32, 40, 22, 16, PAL.stoneDark) + stoneBlock(18, 18, 24, 18, lite(PAL.stone, 0.1)),

  [R.Iron]: () => shadow(32, 57, 24) + ingot(5, 40, 28, 15, X.iron) + ingot(34, 40, 26, 15, X.iron) + ingot(18, 24, 28, 15, lite(X.iron, 0.1)),

  [R.Pitch]: () =>
    shadow(32, 58, 18) + barrel(32, 10, 28, 40, mix(PAL.pitch, PAL.stoneDark, 0.6)) +
    poly([18, 12, 46, 12, 44, 18, 20, 18], PAL.pitch, 1.8) + poly([24, 18, 26, 30, 29, 18], PAL.pitch, 1.6) + poly([36, 18, 38, 36, 41, 18], PAL.pitch, 1.6) +
    poly([34, 50, 38, 56, 34, 60, 30, 56], PAL.pitch, 2) + ngon(24, 28, 2.2, lite(PAL.pitch, 0.5), 0, 5),

  [R.Hops]: () => {
    const cone = (x: number, y: number, s: number): string =>
      poly([x, y, x + 6 * s, y + 5 * s, x + 5 * s, y + 14 * s, x, y + 19 * s, x - 5 * s, y + 14 * s, x - 6 * s, y + 5 * s], X.hop, 2.2) +
      poly([x, y, x + 6 * s, y + 5 * s, x + 5 * s, y + 14 * s, x, y + 19 * s], dark(X.hop, 0.2), 0) +
      line([x - 5 * s, y + 8 * s, x + 5 * s, y + 8 * s], 1.2, INK, 0.5) + line([x - 4 * s, y + 13 * s, x + 4 * s, y + 13 * s], 1.2, INK, 0.5);
    return (
      line([32, 4, 32, 14], 2.4, PAL.treeDark) + poly([32, 10, 46, 6, 52, 14, 40, 16], PAL.treeLight, 2) + poly([32, 10, 18, 6, 12, 14, 24, 16], PAL.treeDark, 2) +
      cone(18, 26, 1) + cone(46, 26, 1) + cone(32, 22, 1.3)
    );
  },

  [R.Ale]: () =>
    shadow(32, 58, 18) +
    poly([14, 22, 44, 22, 42, 56, 16, 56], X.cheese, SW) + poly([32, 22, 44, 22, 42, 56, 32, 56], dark(X.cheese, 0.2), 0) + poly([14, 22, 44, 22, 42, 56, 16, 56], null, SW) +
    line([46, 28, 56, 28, 56, 44, 44, 44], 5.6, INK) + line([46, 28, 56, 28, 56, 44, 44, 44], 2.6, PAL.woodDark) +
    rect(20, 32, 3, 18, lite(X.cheese, 0.5), 0) +
    ngon(18, 18, 6, PAL.white, 2.2, 7) + ngon(29, 14, 7.4, PAL.white, 2.2, 7) + ngon(40, 18, 6, PAL.white, 2.2, 7) + ngon(29, 20, 6, lite(PAL.white, 0), 0, 7),

  [R.Wheat]: () => shadow(32, 58, 22) + wheatSheaf(),

  [R.Flour]: () => shadow(32, 58, 22) + sack(32, 12, 40, 44, X.cream) + poly([18, 8, 46, 8, 42, 16, 22, 16], PAL.white, 2) + ngon(32, 38, 7, PAL.thatch, 0, 6) + line([28, 34, 36, 42], 1.6, dark(PAL.thatch, 0.4)) + line([36, 34, 28, 42], 1.6, dark(PAL.thatch, 0.4)),

  [R.Cow]: () => shadow(32, 57, 26) + cowBody(),

  [R.Apple]: () =>
    shadow(32, 58, 16) +
    line([32, 14, 34, 6], 3, INK) + line([32, 14, 34, 6], 1.4, PAL.trunk) + poly([34, 9, 44, 4, 46, 12, 36, 14], PAL.treeLight, 2.2) +
    poly([32, 16, 40, 12, 50, 16, 54, 28, 50, 42, 42, 54, 32, 50, 22, 54, 14, 42, 10, 28, 14, 16, 24, 12], X.apple, SW) +
    poly([32, 16, 40, 12, 50, 16, 54, 28, 50, 42, 42, 54, 32, 50], dark(X.apple, 0.22), 0) + poly([14, 16, 24, 12, 32, 16, 28, 28, 18, 30, 10, 28], lite(X.apple, 0.3), 0) +
    poly([32, 16, 40, 12, 50, 16, 54, 28, 50, 42, 42, 54, 32, 50, 22, 54, 14, 42, 10, 28, 14, 16, 24, 12], null, SW),

  [R.Cheese]: () =>
    shadow(32, 58, 24) +
    poly([6, 30, 40, 14, 58, 26, 58, 46, 6, 46], X.cheese, SW) + poly([6, 30, 40, 14, 58, 26, 22, 36], lite(X.cheese, 0.35), 0) + poly([22, 36, 58, 26, 58, 46, 22, 56], dark(X.cheese, 0.12), 0) + poly([6, 30, 22, 36, 22, 56, 6, 46], X.cheese, 0) +
    poly([6, 30, 40, 14, 58, 26, 58, 46, 22, 56, 6, 46], null, SW) + line([22, 36, 22, 56], 1.4, INK, 0.7) + line([22, 36, 58, 26], 1.4, INK, 0.7) + line([6, 30, 22, 36], 1.4, INK, 0.7) +
    ngon(13, 42, 2.4, dark(X.cheese, 0.35), 0, 6) + ngon(40, 42, 3.4, dark(X.cheese, 0.35), 0, 6) + ngon(48, 33, 2.4, dark(X.cheese, 0.35), 0, 6) + ngon(36, 21, 2.2, dark(X.cheese, 0.3), 0, 6),

  [R.Meat]: () => {
    const meat = 0xb5503f;
    return (
      shadow(32, 58, 22) +
      rect(36, 8, 5, 22, PAL.white, 2) + ngon(34, 8, 4.6, PAL.white, 2, 6) + ngon(43, 9, 4.2, PAL.white, 2, 6) +
      poly([30, 24, 46, 24, 54, 38, 48, 54, 32, 56, 14, 52, 8, 40, 14, 28], meat, SW) +
      poly([30, 24, 46, 24, 54, 38, 48, 54, 32, 56, 32, 40], dark(meat, 0.22), 0) + poly([14, 28, 30, 24, 32, 40, 8, 40], lite(meat, 0.25), 0) +
      poly([30, 24, 46, 24, 54, 38, 48, 54, 32, 56, 14, 52, 8, 40, 14, 28], null, SW) +
      ngon(26, 40, 4.4, lite(meat, 0.5), 1.6, 6) + line([16, 34, 24, 32], 1.4, dark(meat, 0.4), 0.8)
    );
  },

  [R.Bread]: () => {
    const loaf = (cx: number, cy: number, rx: number, ry: number): string =>
      ngon(cx, cy, rx, X.bread, SW, 8, ry) + poly([cx - rx, cy, cx + rx, cy, cx + rx * 0.7, cy + ry * 0.7, cx, cy + ry, cx - rx * 0.7, cy + ry * 0.7], dark(X.bread, 0.2), 0) +
      ngon(cx, cy, rx, null, SW, 8, ry) +
      line([cx - rx * 0.5, cy - ry * 0.7, cx - rx * 0.3, cy + ry * 0.1], 1.8, lite(X.bread, 0.55)) + line([cx, cy - ry * 0.9, cx + rx * 0.2, cy + ry * 0.2], 1.8, lite(X.bread, 0.55)) + line([cx + rx * 0.5, cy - ry * 0.7, cx + rx * 0.65, cy + ry * 0.1], 1.8, lite(X.bread, 0.55));
    return shadow(32, 58, 26) + loaf(32, 24, 22, 13) + loaf(20, 42, 17, 11) + loaf(45, 44, 17, 11);
  },

  [R.Bow]: () => shadow(32, 58, 18) + at(30, 32, bowP(), 0, 1.3) + at(22, 32, arrow(34), 0, 1),

  [R.Crossbow]: () => shadow(32, 58, 22) + at(32, 33, crossbowP(), 0, 1.25) + at(32, 9, arrow(0.1), 0, 1),

  [R.Spear]: () => shadow(32, 58, 22) + at(32, 32, spearP(), 40, 1.2),

  [R.Pike]: () => shadow(32, 58, 22) + at(32, 32, pikeP(), 40, 1.05),

  [R.Mace]: () => shadow(32, 58, 22) + at(32, 32, maceP(), 40, 1.25),

  [R.Sword]: () => shadow(32, 58, 22) + at(32, 32, swordP(), 40, 1.3),

  [R.Leather]: () => {
    const lc = X.leather;
    return (
      shadow(32, 58, 22) +
      poly([16, 14, 26, 10, 32, 16, 38, 10, 48, 14, 52, 28, 46, 30, 45, 52, 19, 52, 18, 30, 12, 28], lc, SW) +
      poly([32, 16, 38, 10, 48, 14, 52, 28, 46, 30, 45, 52, 32, 52], dark(lc, 0.22), 0) + poly([16, 14, 26, 10, 32, 16, 24, 30, 18, 30, 12, 28], lite(lc, 0.25), 0) +
      poly([16, 14, 26, 10, 32, 16, 38, 10, 48, 14, 52, 28, 46, 30, 45, 52, 19, 52, 18, 30, 12, 28], null, SW) +
      line([32, 16, 32, 52], 1.4, INK, 0.7) + line([22, 38, 42, 38], 2, INK, 0.5) + line([22, 46, 42, 46], 2, INK, 0.5) + dot(32, 24, 1.8, PAL.gold) + dot(32, 31, 1.8, PAL.gold) + dot(32, 38, 1.8, PAL.gold) + line([24, 18, 26, 28], 1.6, lite(lc, 0.5))
    );
  },

  [R.Armor]: () => shadow(32, 58, 22) + breastplate(X.steel, PAL.gold),
};

export const ABILITY_ICONS: Record<number, Drawer> = {
  // Pfeilhagel
  0: () =>
    ngon(32, 52, 24, X.red, 2.4, 10, 6) + ngon(32, 52, 14, null, 2, 10, 3.4) +
    at(20, 6, arrow(34), 70, 1) + at(34, 2, arrow(38), 70, 1) + at(48, 10, arrow(34), 70, 1) + at(8, 16, arrow(30), 70, 0.9),

  // Verstärkung
  1: () =>
    shadow(32, 58, 26) +
    at(-2, 12, man({ tunic: X.steelDark, legs: X.night, hat: 'helm', hatCol: X.red, team: X.red, mark: 'tabard' }), 0, 0.66) +
    at(30, 12, man({ tunic: X.steelDark, legs: X.night, hat: 'helm', hatCol: X.red, team: X.red, mark: 'tabard' }), 0, 0.66) +
    rect(30, 8, 2.8, 48, PAL.wood, 1.8) + poly([32.8, 9, 48, 14, 48, 28, 40.4, 24, 32.8, 28], X.red, 2) + poly([40.4, 11, 48, 14, 48, 28, 40.4, 24], dark(X.red, 0.25), 0) + dot(38, 18, 2.2, PAL.gold),

  // Heilung
  2: () =>
    ngon(32, 32, 26, X.hop, SW, 10) + ngon(32, 32, 26, null, SW, 10) + poly([32, 6, 51, 14, 58, 32, 50, 50, 32, 58, 32, 32], dark(X.hop, 0.2), 0) + ngon(32, 32, 26, null, SW, 10) +
    poly([26, 14, 38, 14, 38, 26, 50, 26, 50, 38, 38, 38, 38, 50, 26, 50, 26, 38, 14, 38, 14, 26, 26, 26], PAL.white, 2.4) + poly([32, 14, 38, 14, 38, 26, 50, 26, 50, 38, 38, 38, 38, 50, 32, 50], X.cream, 0) + poly([26, 14, 38, 14, 38, 26, 50, 26, 50, 38, 38, 38, 38, 50, 26, 50, 26, 38, 14, 38, 14, 26, 26, 26], null, 2.4) +
    star4(10, 10, 6, PAL.gold) + star4(54, 56, 5, PAL.gold),

  // Felsschlag
  3: () => {
    const roc = [22, 22, 32, 14, 46, 18, 54, 30, 52, 44, 40, 52, 26, 50, 16, 40, 14, 30];
    return (
      poly([2, 2, 14, 6, 6, 14], X.flame, 1.8) + poly([4, 14, 18, 14, 14, 24, 6, 22], X.flameHot, 1.8) + poly([2, 20, 12, 22, 10, 32], X.red, 1.8) +
      poly(roc, PAL.rock, SW) + poly([32, 14, 46, 18, 54, 30, 52, 44, 40, 52, 32, 34], PAL.rockDark, 0) + poly([22, 22, 32, 14, 32, 34, 16, 40, 14, 30], lite(PAL.rock, 0.2), 0) + poly(roc, null, SW) +
      line([24, 34, 32, 34, 38, 42], 1.4, INK, 0.5) + line([32, 34, 36, 24], 1.4, INK, 0.5) +
      poly([6, 58, 16, 52, 22, 56, 32, 50, 42, 56, 50, 52, 60, 58], PAL.sandDark, 2) + ngon(8, 54, 3.4, PAL.sand, 1.6, 6) + ngon(58, 54, 3.4, PAL.sand, 1.6, 6)
    );
  },

  // Goldspende
  4: () =>
    shadow(32, 58, 22) +
    sack(32, 14, 34, 40, PAL.thatch) + ngon(32, 38, 9, PAL.gold, 2.2, 8) + ngon(32, 38, 5, lite(PAL.gold, 0.4), 0, 8) +
    coin(12, 50, 6) + coin(52, 52, 6) + coin(48, 14, 5) + coin(16, 16, 5),
};
