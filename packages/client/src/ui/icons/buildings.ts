/** Gebäude-Icons: ein Zeichner pro BT-Eintrag (ID aus shared/data/buildings.ts). */
import { BT, PAL } from '@strongpoly/shared';
import { axeP, bowP, hammerP, man, pickP, swordP } from './parts';
import {
  Col, INK, SW, X, arrow, at, barrel, bricks, crenel, cube, cyl, dark, dot, door, flag, flame, house, line, lite, logH, mix, ngon, poly, pole, rect, sack, shadow, smoke, stoneBlock, win,
} from './svg';

export type Drawer = () => string;

const ST = PAL.stone;
const STD = PAL.stoneDark;

/** Zahnrad mit n Zähnen */
export function gear(cx: number, cy: number, r: number, n: number, c: Col): string {
  const p: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i * Math.PI) / n;
    const rr = i % 2 === 0 ? r : r * 0.78;
    const a1 = a0 + Math.PI / n / 2;
    p.push(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr);
  }
  return poly(p, c, 2.2) + ngon(cx, cy, r * 0.38, X.night, 1.8, 8);
}

function groundPatch(c: Col = PAL.sandDark): string {
  return poly([4, 50, 32, 42, 60, 50, 32, 60], c, 0, 0.55);
}

function wheat(x: number, y: number, h: number): string {
  let s = line([x, y, x, y - h], 2.2, PAL.thatch);
  for (let i = 0; i < 4; i++) {
    const yy = y - h + i * 3.4;
    s += poly([x, yy - 2.8, x + 3.6, yy, x, yy + 2.2], PAL.thatch, 1.5) + poly([x, yy - 2.8, x - 3.6, yy, x, yy + 2.2], lite(PAL.thatch, 0.25), 1.5);
  }
  return s;
}

function crossAt(x: number, y: number, h: number, c: Col = PAL.gold): string {
  return rect(x - 1.1, y - h, 2.2, h, c, 1.6) + rect(x - h * 0.3, y - h * 0.72, h * 0.6, 2.2, c, 1.6);
}

export const BUILDING_ICONS: Record<number, Drawer> = {
  [BT.Keep]: () =>
    shadow(32, 58, 28) +
    cube(3, 30, 15, 26, 4, STD) + crenel(3, 30, 15, 3, 4, ST) +
    cube(46, 30, 15, 26, 4, STD) + crenel(46, 30, 15, 3, 4, ST) +
    cube(16, 18, 30, 38, 6, ST) + crenel(16, 18, 30, 5, 5, lite(ST, 0.1)) + bricks(16, 18, 30, 38, 6) +
    poly([27, 56, 27, 43, 31, 38, 35, 38, 39, 43, 39, 56], PAL.woodDark, 2.4) + line([33, 38, 33, 56], 1.3, INK, 0.7) + line([27, 47, 39, 47], 1.3, INK, 0.7) +
    win(21, 27, 4) + win(40, 27, 4) + rect(9, 38, 3, 6, X.night, 1.4) + rect(52, 38, 3, 6, X.night, 1.4) +
    flag(31, 13, 12, X.red, 11),

  [BT.Campfire]: () =>
    shadow(32, 56, 22) +
    at(32, 52, logH(-15, 0, 30, 3.2), -18) + at(32, 52, logH(-15, 0, 30, 3.2), 18) +
    flame(32, 48, 1.5) +
    ngon(14, 54, 4, PAL.rock, 2, 6) + ngon(50, 54, 4, PAL.rock, 2, 6) + ngon(22, 57, 3.4, PAL.rockDark, 2, 6) + ngon(42, 57, 3.4, PAL.rockDark, 2, 6),

  [BT.Hovel]: () => shadow(30, 57, 26) + house(6, 30, 30, 25, 11, PAL.wood, PAL.thatch, 18) + win(10, 38, 6, X.night),

  [BT.Stockpile]: () =>
    groundPatch() +
    logH(6, 51, 24, 3.4) + logH(8, 44.5, 24, 3.4) + logH(7, 38, 24, 3.4) +
    stoneBlock(34, 40, 14, 12, ST) + stoneBlock(46, 46, 12, 9, STD) + stoneBlock(38, 29, 11, 9, lite(ST, 0.1)),

  [BT.Granary]: () =>
    shadow(32, 58, 22) +
    cyl(32, 26, 28, 30, PAL.wood) + line([18, 38, 46, 38], 1.4, INK, 0.6) + line([18, 48, 46, 48], 1.4, INK, 0.6) +
    poly([14, 27, 32, 8, 50, 27], PAL.roof, SW) + poly([32, 8, 50, 27, 32, 27], dark(PAL.roof, 0.25), 0) + poly([14, 27, 32, 8, 50, 27], null, SW) +
    door(27, 56, 10, 14) + sack(14, 46, 11, 12) + sack(50, 46, 11, 12, PAL.thatch) + wheat(32, 36, 9),

  [BT.Armory]: () =>
    shadow(32, 58, 26) +
    house(8, 30, 34, 25, 10, PAL.stoneDark, X.iron, 14, null) +
    at(25, 41, swordP(), 45, 0.5) + at(25, 41, swordP(), -45, 0.5) +
    poly([18, 34, 32, 34, 32, 44, 25, 52, 18, 44], PAL.stone, 2.2) + poly([25, 34, 32, 34, 32, 44, 25, 52], dark(ST, 0.25), 0) + poly([23, 34, 27, 34, 27, 48, 25, 50, 23, 48], X.red, 1.4),

  [BT.Woodcutter]: () =>
    shadow(32, 58, 26) + house(5, 36, 24, 18, 7, PAL.wood, PAL.roof, 13) +
    logH(36, 55, 22, 3.2) + logH(38, 48.5, 20, 3.2) + logH(37, 42, 20, 3.2) +
    at(47, 33, axeP(), 25, 0.75),

  [BT.Quarry]: () =>
    poly([2, 55, 10, 36, 20, 30, 30, 34, 38, 22, 50, 28, 62, 55], PAL.rock, SW) +
    poly([30, 34, 38, 22, 50, 28, 62, 55, 30, 55], PAL.rockDark, 0) + poly([20, 30, 30, 34, 30, 55, 2, 55, 10, 36], lite(PAL.rock, 0.12), 0) +
    poly([2, 55, 10, 36, 20, 30, 30, 34, 38, 22, 50, 28, 62, 55], null, SW) +
    stoneBlock(38, 44, 15, 11, ST) + stoneBlock(14, 46, 12, 9, lite(ST, 0.1)) + at(26, 40, pickP(), -35, 0.8),

  [BT.OxTether]: () =>
    shadow(32, 58, 26) +
    poly([8, 32, 40, 32, 38, 46, 10, 46], PAL.wood, SW) + poly([8, 40, 40, 40, 38, 46, 10, 46], PAL.woodDark, 0) + poly([8, 32, 40, 32, 38, 46, 10, 46], null, SW) +
    stoneBlock(12, 22, 12, 10, ST) + stoneBlock(25, 24, 11, 8, STD) +
    ngon(24, 49, 8, PAL.woodDark, SW, 10) + ngon(24, 49, 2.6, PAL.wood, 1.6, 6) + line([24, 41, 24, 57], 1.4, INK) + line([16, 49, 32, 49], 1.4, INK) +
    line([40, 38, 46, 38], 3.2, INK) + line([40, 38, 46, 38], 1.4, PAL.wood) +
    poly([46, 30, 56, 29, 60, 36, 58, 46, 52, 50, 46, 46], X.brown, SW) + poly([46, 30, 56, 29, 60, 36, 52, 38], lite(X.brown, 0.15), 0) +
    poly([47, 30, 44, 22, 48, 26, 50, 30], PAL.white, 1.6) + poly([56, 29, 59, 21, 60, 27, 59, 33], PAL.white, 1.6) + dot(55, 37, 1.3, INK) + ngon(58, 44, 2.4, X.pink, 1.4, 6),

  [BT.IronMine]: () =>
    shadow(32, 58, 28) +
    poly([3, 56, 18, 26, 30, 36, 44, 14, 61, 56], PAL.rock, SW) + poly([44, 14, 61, 56, 30, 56, 30, 36], PAL.rockDark, 0) + poly([18, 26, 30, 36, 30, 56, 3, 56], lite(PAL.rock, 0.1), 0) + poly([3, 56, 18, 26, 30, 36, 44, 14, 61, 56], null, SW) +
    poly([20, 56, 20, 40, 32, 34, 44, 40, 44, 56], X.night, SW) + rect(18, 38, 4, 18, PAL.wood, 2) + rect(42, 38, 4, 18, PAL.wood, 2) + rect(18, 36, 28, 4, PAL.woodDark, 2) +
    ngon(12, 52, 4.4, X.iron, 2, 6) + ngon(51, 51, 4, X.steel, 2, 6) + ngon(47, 28, 3.2, X.steel, 1.8, 6) + ngon(27, 22, 3, X.steel, 1.8, 6),

  [BT.PitchRig]: () =>
    ngon(32, 51, 25, PAL.pitch, SW, 10, 7) + ngon(26, 49, 7, lite(PAL.pitch, 0.25), 0, 7, 2.2) +
    line([20, 50, 32, 12, 44, 50], 5.6, INK) + line([20, 50, 32, 12, 44, 50], 3, PAL.wood) + line([25, 36, 39, 36], 3, PAL.woodDark) +
    ngon(32, 12, 4.2, X.iron, 2.2, 8) + line([32, 16, 32, 36], 1.4, INK) +
    poly([27, 36, 37, 36, 35, 45, 29, 45], PAL.pitch, 2) + poly([46, 20, 49, 26, 46, 30, 43, 26], PAL.pitch, 1.8),

  [BT.AppleOrchard]: () =>
    groundPatch(PAL.oasisDark) +
    rect(29, 38, 6, 18, PAL.trunk, 2.2) +
    ngon(32, 27, 22, PAL.treeLight, SW, 8, 18) + poly([32, 9, 50, 27, 32, 45], dark(PAL.treeLight, 0.22), 0) + poly([14, 27, 32, 9, 50, 27, 32, 45], null, SW) +
    ngon(22, 24, 4.2, X.apple, 2, 7) + ngon(40, 20, 4.2, X.apple, 2, 7) + ngon(34, 34, 4.2, X.apple, 2, 7) + ngon(24, 36, 4, X.apple, 2, 7) + ngon(44, 33, 4, X.apple, 2, 7) +
    ngon(12, 54, 4, X.apple, 2, 7) + ngon(52, 55, 4, X.apple, 2, 7),

  [BT.DairyFarm]: () => {
    const spot = (pp: number[]): string => poly(pp, X.night, 0);
    return (
      groundPatch(PAL.oasis) + shadow(30, 57, 24) +
      rect(14, 44, 5, 12, PAL.white, 2) + rect(22, 44, 5, 12, PAL.white, 2) + rect(36, 44, 5, 12, PAL.white, 2) + rect(44, 44, 5, 12, PAL.white, 2) +
      poly([4, 30, 46, 26, 52, 32, 50, 46, 8, 46, 4, 40], X.milk, SW) + spot([12, 28, 22, 27, 24, 36, 14, 38]) + spot([32, 30, 42, 28, 44, 38, 34, 40]) + spot([24, 40, 30, 40, 30, 46, 24, 46]) +
      poly([4, 30, 46, 26, 52, 32, 50, 46, 8, 46, 4, 40], null, SW) +
      poly([46, 22, 58, 24, 62, 32, 58, 42, 48, 40, 46, 30], X.milk, SW) + poly([54, 24, 58, 24, 62, 32, 58, 42, 54, 40], dark(X.milk, 0.15), 0) + poly([46, 22, 58, 24, 62, 32, 58, 42, 48, 40, 46, 30], null, SW) +
      poly([49, 22, 47, 15, 52, 20], PAL.thatch, 1.6) + poly([56, 24, 59, 17, 60, 24], PAL.thatch, 1.6) + dot(54, 30, 1.4, INK) + rect(52, 36, 8, 5, X.pink, 1.6) +
      poly([8, 32, 3, 34, 3, 44, 6, 44, 6, 36], X.night, 1.8) + poly([22, 46, 34, 46, 33, 51, 23, 51], X.pink, 1.8)
    );
  },

  [BT.HunterPost]: () => {
    return (
      groundPatch(PAL.oasis) + shadow(26, 57, 20) +
      rect(10, 42, 3.4, 14, X.cloth, 2) + rect(16, 44, 3.4, 12, dark(X.cloth, 0.2), 2) + rect(32, 42, 3.4, 14, X.cloth, 2) + rect(38, 44, 3.4, 12, dark(X.cloth, 0.2), 2) +
      poly([8, 32, 38, 30, 44, 36, 40, 46, 12, 46, 8, 40], X.cloth, SW) + poly([8, 40, 40, 40, 40, 46, 12, 46, 8, 42], lite(X.cream, 0.1), 0) + poly([8, 32, 38, 30, 44, 36, 40, 46, 12, 46, 8, 40], null, SW) +
      poly([36, 31, 42, 18, 49, 20, 44, 38, 40, 40], X.cloth, SW) + poly([42, 18, 49, 20, 56, 28, 54, 31, 46, 28], X.cloth, SW) + dot(50, 23, 1.2, INK) +
      line([44, 18, 44, 8, 40, 3], 2.4, INK) + line([44, 18, 44, 8, 40, 3], 1.2, X.cream) + line([44, 10, 50, 5], 2.4, INK) + line([44, 10, 50, 5], 1.2, X.cream) + line([42, 12, 36, 9], 2.2, INK) + line([42, 12, 36, 9], 1.1, X.cream) +
      at(54, 44, bowP(), 0, 0.72) + at(46, 52, arrow(14), -80, 0.9)
    );
  },

  [BT.WheatFarm]: () =>
    poly([4, 56, 16, 34, 60, 34, 56, 56], X.brown, SW) + poly([4, 56, 16, 34, 60, 34, 56, 56], null, SW) +
    line([8, 50, 58, 50], 1.4, PAL.steppe, 1) + line([11, 44, 58, 44], 1.4, PAL.steppe, 1) + line([13, 39, 59, 39], 1.4, PAL.steppe, 1) +
    wheat(18, 54, 20) + wheat(26, 56, 24) + wheat(34, 54, 22) + wheat(42, 56, 25) + wheat(50, 54, 20) + wheat(22, 46, 18) + wheat(38, 46, 18),

  [BT.HopFarm]: () => {
    const cone = (x: number, y: number): string => poly([x, y, x + 3.2, y + 2.6, x + 2.4, y + 7, x, y + 9, x - 2.4, y + 7, x - 3.2, y + 2.6], X.hop, 1.8) + line([x, y + 2, x, y + 7], 1, dark(X.hop, 0.4), 0.7);
    let s = groundPatch(PAL.oasisDark);
    s += pole(18, 8, 56, 3.2) + pole(46, 8, 56, 3.2) + line([18, 10, 46, 10], 2.6, PAL.woodDark) + line([32, 10, 32, 56], 2, PAL.treeDark);
    for (let i = 0; i < 5; i++) {
      const y = 16 + i * 8;
      s += poly([18, y, 12, y + 4, 18, y + 8, 24, y + 4], PAL.treeLight, 1.8) + poly([46, y, 40, y + 4, 46, y + 8, 52, y + 4], i % 2 ? PAL.treeLight : PAL.treeDark, 1.8);
    }
    return s + cone(26, 18) + cone(37, 26) + cone(27, 34) + cone(38, 42) + cone(26, 46) + cone(11, 36) + cone(53, 20);
  },

  [BT.Mill]: () => {
    const blade = (): string => rect(-1.4, -28, 2.8, 28, PAL.woodDark, 1.6) + poly([1.4, -27, 10, -27, 10, -10, 1.4, -10], X.cream, 1.8) + line([1.4, -18.5, 10, -18.5], 1, INK, 0.5);
    return (
      shadow(32, 58, 24) +
      poly([20, 56, 44, 56, 39, 28, 25, 28], PAL.wood, SW) + poly([32, 56, 44, 56, 39, 28, 32, 28], PAL.woodDark, 0) + poly([20, 56, 44, 56, 39, 28, 25, 28], null, SW) +
      door(28, 56, 8, 11) +
      poly([22, 29, 32, 16, 42, 29], PAL.roof, SW) + poly([32, 16, 42, 29, 32, 29], dark(PAL.roof, 0.25), 0) + poly([22, 29, 32, 16, 42, 29], null, SW) +
      at(32, 28, blade(), 40) + at(32, 28, blade(), 130) + at(32, 28, blade(), 220) + at(32, 28, blade(), 310) +
      ngon(32, 28, 3.4, X.iron, 2, 6)
    );
  },

  [BT.Bakery]: () =>
    shadow(32, 58, 26) +
    house(8, 32, 32, 23, 9, X.cream, PAL.roof, 13, null) +
    rect(34, 10, 7, 15, STD, 2.2) + rect(33, 8, 9, 3, ST, 2) + smoke(38, 4, 0.9) +
    ngon(38, 49, 6.5, ST, 2.4, 8, 7) + poly([32, 51, 44, 51, 44, 55, 32, 55], ST, 2) + ngon(38, 50, 3.4, X.night, 0, 6, 3.6) +
    ngon(21, 45, 8, X.bread, SW, 8, 5.6) + poly([14, 45, 28, 45, 27, 48, 15, 48], dark(X.bread, 0.25), 0) + line([17, 42, 19, 46], 1.5, dark(X.bread, 0.5)) + line([22, 41, 24, 46], 1.5, dark(X.bread, 0.5)),

  [BT.Brewery]: () =>
    shadow(32, 58, 26) +
    house(5, 26, 30, 24, 8, PAL.wood, PAL.roof, 13, null) + door(15, 50, 9, 13) +
    barrel(46, 30, 18, 25, PAL.woodDark) + barrel(26, 44, 14, 16, PAL.wood) +
    ngon(46, 31, 8, X.cheese, 1.8, 8, 2.2) ,

  [BT.Inn]: () =>
    shadow(32, 58, 27) +
    house(8, 28, 36, 26, 9, PAL.wood, PAL.roof, 14, PAL.woodDark) +
    win(14, 36, 6, X.flameHot) + win(32, 36, 6, X.flameHot) +
    line([5, 30, 5, 56], 3, PAL.woodDark) + line([5, 32, 14, 32], 3, PAL.woodDark) +
    // Schild mit Humpen
    rect(46, 36, 14, 14, PAL.thatch, 2) + rect(49, 39, 6, 8, X.cream, 1.6) + rect(55, 41, 3, 4, null, 1.6) + rect(49, 38, 6, 2.4, PAL.white, 1.2) + line([53, 36, 53, 32], 1.6, INK),

  [BT.Fletcher]: () =>
    shadow(32, 58, 26) + house(4, 32, 30, 22, 8, PAL.wood, PAL.treeDark, 14) +
    at(48, 36, bowP(), 0, 1.0) + at(52, 24, arrow(30), 90, 0.75) + at(56, 28, arrow(30), 90, 0.75),

  [BT.Poleturner]: () =>
    shadow(32, 58, 26) +
    cube(6, 42, 44, 5, 6, PAL.wood) + rect(10, 47, 4, 9, PAL.woodDark, 2) + rect(42, 47, 4, 9, PAL.woodDark, 2) +
    rect(4, 33, 48, 3.4, PAL.wood, 2) + poly([52, 33, 62, 34.7, 52, 36.4], X.steel, 1.8) +
    ngon(14, 37, 3.6, PAL.woodDark, 2, 6) +
    poly([10, 14, 12, 8, 18, 12, 16, 20], null, 0) +
    rect(20, 12, 2.6, 20, PAL.wood, 1.8) + poly([21.3, 4, 24, 12, 18.6, 12], X.steel, 1.8) +
    rect(30, 14, 2.6, 18, PAL.wood, 1.8) + poly([31.3, 6, 34, 14, 28.6, 14], X.steel, 1.8) +
    rect(40, 12, 2.6, 20, PAL.wood, 1.8) + poly([41.3, 4, 44, 12, 38.6, 12], X.steel, 1.8) +
    poly([22, 53, 26, 51, 28, 55], lite(PAL.wood, 0.3), 1.2) + poly([32, 54, 36, 52, 37, 56], lite(PAL.wood, 0.3), 1.2),

  [BT.Blacksmith]: () =>
    shadow(32, 58, 26) +
    cube(12, 44, 38, 12, 5, STD) +
    poly([10, 34, 46, 34, 50, 38, 34, 41, 38, 48, 44, 50, 44, 53, 18, 53, 18, 50, 26, 48, 30, 41, 14, 40], X.iron, SW) + poly([10, 34, 46, 34, 50, 38, 34, 41, 14, 40], lite(X.iron, 0.3), 0) + poly([10, 34, 46, 34, 50, 38, 34, 41, 38, 48, 44, 50, 44, 53, 18, 53, 18, 50, 26, 48, 30, 41, 14, 40], null, SW) +
    at(46, 18, hammerP(), 38, 0.75) +
    poly([24, 26, 26, 30, 30, 30, 27, 33, 28, 37, 24, 34, 20, 37, 21, 33, 18, 30, 22, 30], X.flameHot, 1.4) + poly([40, 28, 41, 31, 44, 31, 42, 33, 43, 36, 40, 34, 37, 36, 38, 33, 36, 31, 39, 31], X.flame, 1.2),

  [BT.Tanner]: () =>
    shadow(32, 58, 24) +
    pole(10, 8, 56, 4) + pole(54, 8, 56, 4) + pole(32, 8, 12, 0.1) + rect(8, 8, 48, 4, PAL.woodDark, 2) + rect(8, 46, 48, 4, PAL.woodDark, 2) +
    poly([16, 14, 24, 16, 32, 13, 40, 16, 48, 14, 46, 24, 51, 30, 46, 38, 49, 44, 40, 44, 32, 46, 24, 44, 15, 44, 18, 38, 13, 30, 18, 24], X.leather, SW) +
    poly([32, 13, 40, 16, 48, 14, 46, 24, 51, 30, 46, 38, 49, 44, 40, 44, 32, 46], dark(X.leather, 0.22), 0) +
    poly([16, 14, 24, 16, 32, 13, 40, 16, 48, 14, 46, 24, 51, 30, 46, 38, 49, 44, 40, 44, 32, 46, 24, 44, 15, 44, 18, 38, 13, 30, 18, 24], null, SW) +
    line([10, 16, 17, 16], 1.4, INK) + line([10, 30, 14, 30], 1.4, INK) + line([10, 42, 16, 42], 1.4, INK) + line([54, 16, 47, 16], 1.4, INK) + line([54, 30, 50, 30], 1.4, INK) + line([54, 42, 48, 42], 1.4, INK),

  [BT.Armorer]: () =>
    shadow(32, 58, 22) +
    cube(16, 52, 32, 5, 5, PAL.woodDark) + rect(29.5, 40, 5, 12, PAL.wood, 2) +
    poly([14, 16, 24, 11, 32, 15, 40, 11, 50, 16, 47, 25, 45, 42, 38, 47, 26, 47, 19, 42, 17, 25], X.steel, SW) +
    poly([32, 15, 40, 11, 50, 16, 47, 25, 45, 42, 38, 47, 32, 47], X.steelDark, 0) + poly([14, 16, 24, 11, 32, 15, 24, 28, 19, 42, 17, 25], lite(X.steel, 0.3), 0) +
    poly([14, 16, 24, 11, 32, 15, 40, 11, 50, 16, 47, 25, 45, 42, 38, 47, 26, 47, 19, 42, 17, 25], null, SW) +
    line([32, 15, 32, 46], 1.4, INK, 0.6) + line([22, 30, 42, 30], 1.4, INK, 0.5) + poly([30, 18, 34, 18, 34, 24, 30, 24], PAL.gold, 1.4),

  [BT.Market]: () => {
    let aw = '';
    for (let i = 0; i < 6; i++) {
      const x0 = 6 + i * 8.7, x1 = x0 + 8.7;
      aw += poly([x0 + 1.5, 16, x1 + 1.5 - (i === 5 ? 1.5 : 0), 16, x1 + 1, 29, x0 - 0.5 + 0.0, 29], i % 2 ? PAL.white : X.red, 2);
    }
    return (
      shadow(32, 58, 27) +
      pole(10, 16, 56, 3.4) + pole(54, 16, 56, 3.4) +
      cube(8, 42, 48, 12, 5, PAL.wood) +
      ngon(18, 38, 5, X.apple, 2, 7) + ngon(27, 38, 5, X.apple, 2, 7) + ngon(36, 38, 5, X.hop, 2, 7) + ngon(45, 38, 5, PAL.thatch, 2, 7) +
      aw + line([6, 29, 6, 29], 1, INK) +
      poly([6.5, 29, 15, 29, 10.8, 34], X.red, 1.8) + poly([15, 29, 23.5, 29, 19.2, 34], PAL.white, 1.8) + poly([23.5, 29, 32, 29, 27.8, 34], X.red, 1.8) + poly([32, 29, 40.5, 29, 36.2, 34], PAL.white, 1.8) + poly([40.5, 29, 49, 29, 44.8, 34], X.red, 1.8) + poly([49, 29, 57.5, 29, 53.2, 34], PAL.white, 1.8) +
      flag(32, 16, 8, PAL.gold, 7)
    );
  },

  [BT.Chapel]: () =>
    shadow(32, 58, 22) + house(12, 34, 26, 21, 8, ST, PAL.roof, 15, null) +
    door(21, 55, 8, 14, PAL.woodDark) + win(15, 38, 4) + crossAt(25, 19, 10),

  [BT.Church]: () =>
    shadow(32, 58, 27) +
    house(28, 38, 24, 17, 6, ST, PAL.roof, 12, null) + door(36, 55, 7, 11) +
    cube(6, 22, 16, 34, 5, ST) + win(12, 32, 4) + door(11, 56, 6, 8) +
    poly([3, 22, 14, 5, 25, 22], PAL.roof, SW) + poly([14, 5, 25, 22, 14, 22], dark(PAL.roof, 0.25), 0) + poly([3, 22, 14, 5, 25, 22], null, SW) +
    crossAt(14, 5, 8),

  [BT.Cathedral]: () =>
    shadow(32, 58, 29) +
    house(16, 26, 28, 30, 5, lite(ST, 0.1), PAL.roof, 16, null) +
    cube(2, 20, 14, 36, 4, ST) + cube(46, 20, 14, 36, 4, ST) +
    poly([-0.5, 20, 9, 4, 18.5, 20], PAL.roof, SW) + poly([9, 4, 18.5, 20, 9, 20], dark(PAL.roof, 0.25), 0) + poly([-0.5, 20, 9, 4, 18.5, 20], null, SW) +
    poly([43.5, 20, 53, 4, 62.5, 20], PAL.roof, SW) + poly([53, 4, 62.5, 20, 53, 20], dark(PAL.roof, 0.25), 0) + poly([43.5, 20, 53, 4, 62.5, 20], null, SW) +
    ngon(30, 36, 6, X.blue, 2.4, 10) + line([30, 30, 30, 42], 1.2, INK) + line([24, 36, 36, 36], 1.2, INK) +
    door(25.5, 56, 9, 14) + win(6, 34, 4) + win(50, 34, 4) + crossAt(30, 8, 8),

  [BT.Well]: () =>
    shadow(32, 58, 20) +
    pole(21, 18, 42, 3.4) + pole(43, 18, 42, 3.4) +
    cyl(32, 40, 28, 16, ST) + ngon(32, 40, 14, X.night, 2.6, 10, 5) + ngon(32, 40.5, 11.6, PAL.water, 0, 10, 3.6) + bricks(18, 40, 28, 16, 3) +
    poly([14, 22, 32, 10, 50, 22], PAL.roof, SW) + poly([32, 10, 50, 22, 32, 22], dark(PAL.roof, 0.25), 0) + poly([14, 22, 32, 10, 50, 22], null, SW) +
    line([32, 22, 32, 33], 1.5, INK) + rect(29, 33, 6, 5, PAL.wood, 1.8),

  [BT.WaterPot]: () => {
    const clay = mix(PAL.roof, PAL.thatch, 0.35);
    const drop = (x: number, y: number): string => poly([x, y, x + 3, y + 5, x, y + 8, x - 3, y + 5], X.blue, 1.8);
    return (
      shadow(32, 58, 17) +
      poly([22, 24, 42, 24, 47, 38, 42, 54, 22, 54, 17, 38], clay, SW) + poly([32, 24, 42, 24, 47, 38, 42, 54, 32, 54], dark(clay, 0.25), 0) + poly([22, 24, 42, 24, 47, 38, 42, 54, 22, 54, 17, 38], null, SW) +
      rect(23, 19, 18, 6, lite(clay, 0.15), SW) + line([20, 36, 44, 36], 1.6, INK, 0.5) + line([22, 44, 42, 44], 1.6, INK, 0.5) +
      drop(32, 5) + drop(21, 9) + drop(43, 9)
    );
  },

  [BT.Garden]: () => {
    const fl = (x: number, y: number, c: Col): string => line([x, y, x, y + 12], 2, PAL.treeDark) + ngon(x, y, 4.2, c, 2, 6) + ngon(x, y, 1.6, PAL.gold, 0, 5);
    return (
      groundPatch(PAL.oasis) + poly([6, 52, 32, 40, 58, 52, 32, 62], PAL.oasisDark, SW) + poly([6, 52, 32, 40, 58, 52, 32, 62], null, SW) +
      poly([10, 50, 18, 42, 24, 48, 16, 52], PAL.treeLight, 1.8) + poly([46, 50, 40, 44, 52, 44, 54, 50], PAL.treeLight, 1.8) +
      fl(16, 38, X.red) + fl(26, 28, PAL.gold) + fl(36, 34, X.pink) + fl(46, 26, PAL.white) + fl(32, 22, X.purple) + fl(22, 44, X.orange) + fl(44, 41, X.blue)
    );
  },

  [BT.Statue]: () =>
    shadow(32, 58, 18) + cube(16, 46, 28, 10, 6, ST) + cube(21, 40, 18, 7, 4, lite(ST, 0.1)) +
    at(15.5, 12, man({ tunic: lite(ST, 0.1), legs: ST, skin: lite(ST, 0.1), hat: 'helm', hatCol: ST, bare: false }), 0, 0.68) +
    at(45, 28, swordP(PAL.stone), 8, 0.5),

  [BT.Maypole]: () => {
    const rib = (x: number, c: Col): string => line([32, 14, x, 54], 2.4, INK) + line([32, 14, x, 54], 1.2, c);
    return (
      shadow(32, 58, 22) + rib(10, X.red) + rib(22, X.blue) + rib(44, PAL.gold) + rib(54, PAL.oasis) +
      pole(32, 8, 56, 4, PAL.wood) + poly([8, 56, 32, 52, 56, 56, 32, 60], PAL.oasisDark, 2) +
      ngon(32, 13, 9, PAL.treeLight, 2.4, 8, 5) + ngon(25, 13, 2.6, X.pink, 1.4, 6) + ngon(39, 13, 2.6, PAL.gold, 1.4, 6) + ngon(32, 17, 2.6, X.red, 1.4, 6) +
      poly([32, 6, 40, 3, 32, 0]  , X.red, 1.8)
    );
  },

  [BT.Gallows]: () =>
    shadow(32, 58, 26) + cube(8, 50, 44, 6, 6, PAL.wood) +
    pole(18, 8, 52, 5, PAL.woodDark) + rect(14, 8, 36, 5, PAL.woodDark, 2.2) + line([18, 24, 30, 13], 4.6, INK) + line([18, 24, 30, 13], 2.4, PAL.wood) +
    line([42, 13, 42, 26], 1.8, INK) + ngon(42, 30, 4, null, 2, 8, 5) + dot(42, 26, 1.6, INK),

  [BT.Stocks]: () =>
    shadow(32, 58, 20) +
    pole(18, 16, 56, 5, PAL.woodDark) + pole(46, 16, 56, 5, PAL.woodDark) +
    rect(14, 28, 36, 14, PAL.wood, SW) + rect(14, 28, 36, 5, lite(PAL.wood, 0.25), 0) + rect(14, 28, 36, 14, null, SW) +
    ngon(25, 35, 3.4, X.night, 1.8, 8) + ngon(39, 35, 3.4, X.night, 1.8, 8) + line([32, 28, 32, 42], 1.6, INK) +
    cube(10, 52, 44, 4, 4, PAL.stoneDark, 2),

  [BT.Dungeon]: () =>
    shadow(32, 58, 28) +
    cube(6, 26, 42, 30, 10, STD) + crenel(6, 26, 42, 5, 4, ST) + bricks(6, 26, 42, 30, 5) +
    poly([18, 56, 18, 40, 22, 34, 32, 34, 36, 40, 36, 56], X.night, SW) +
    line([22, 36, 22, 56], 2.2, X.steelDark) + line([27, 34, 27, 56], 2.2, X.steelDark) + line([32, 36, 32, 56], 2.2, X.steelDark) + line([18, 44, 36, 44], 2.2, X.steelDark) +
    line([51, 20, 51, 30], 1.6, INK) + ngon(51, 33, 3, null, 2, 6) + line([56, 26, 56, 36], 1.6, INK) + ngon(56, 39, 3, null, 2, 6),

  [BT.WallWood]: () => {
    let s = shadow(32, 58, 28);
    const hs = [34, 30, 36, 28, 34, 38, 32];
    for (let i = 0; i < hs.length; i++) {
      const x = 4 + i * 8, y = 56 - hs[i] - 4, c = i % 2 ? PAL.wood : PAL.woodDark;
      s += poly([x, 56, x, y + 6, x + 4, y, x + 8, y + 6, x + 8, 56], c, 2.4) + poly([x + 4, y, x + 8, y + 6, x + 8, 56, x + 4, 56], dark(c, 0.25), 0) + poly([x, 56, x, y + 6, x + 4, y, x + 8, y + 6, x + 8, 56], null, 2.4);
    }
    return s + line([2, 46, 62, 46], 2.4, INK) + line([2, 46, 62, 46], 1.2, X.cloth);
  },

  [BT.WallLow]: () => shadow(32, 58, 28) + cube(3, 32, 46, 22, 11, ST) + bricks(3, 32, 46, 22, 4) + line([14, 32, 14, 54], 1.1, INK, 0.4) + line([30, 32, 30, 54], 1.1, INK, 0.4),

  [BT.WallHigh]: () =>
    shadow(32, 58, 28) + cube(4, 18, 44, 38, 12, ST) + crenel(4, 18, 44, 6, 6, lite(ST, 0.1)) + bricks(4, 18, 44, 38, 5) + rect(12, 30, 3, 8, X.night, 1.4) + rect(32, 30, 3, 8, X.night, 1.4),

  [BT.TowerLookout]: () =>
    shadow(32, 58, 18) + cube(24, 24, 16, 32, 6, ST) + bricks(24, 24, 16, 32, 4) + rect(30, 34, 3, 7, X.night, 1.4) +
    rect(20, 22, 30, 4, PAL.wood, 2.2) + pole(23, 10, 22, 2.6) + pole(41, 10, 22, 2.6) +
    poly([18, 12, 32, 2, 46, 12], PAL.roof, SW) + poly([32, 2, 46, 12, 32, 12], dark(PAL.roof, 0.25), 0) + poly([18, 12, 32, 2, 46, 12], null, SW),

  [BT.TowerGuard]: () =>
    shadow(32, 58, 24) + cube(14, 18, 30, 38, 8, ST) + crenel(12, 18, 34, 5, 6, lite(ST, 0.1)) + rect(11, 18, 36, 3, STD, 2.2) + bricks(14, 20, 30, 36, 5) +
    rect(21, 26, 3, 8, X.night, 1.4) + rect(34, 26, 3, 8, X.night, 1.4) + door(25, 56, 8, 13) + flag(29, 11, 11, X.red, 9),

  [BT.TowerRound]: () =>
    shadow(32, 58, 28) +
    cyl(32, 22, 42, 34, ST) + bricks(11, 22, 42, 34, 5) +
    crenel(8, 22, 48, 6, 6, lite(ST, 0.1)) + rect(8, 21, 48, 3.4, STD, 2.2) +
    poly([26, 56, 26, 44, 29, 39, 35, 39, 38, 44, 38, 56], PAL.woodDark, 2.4) + rect(20, 29, 3, 7, X.night, 1.4) + rect(41, 29, 3, 7, X.night, 1.4) +
    at(32, 10, flag(0, 6, 14, X.red, 10), 0, 1),

  [BT.GateWood]: () =>
    shadow(32, 58, 28) +
    rect(4, 14, 11, 42, PAL.woodDark, SW) + rect(49, 14, 11, 42, PAL.woodDark, SW) +
    poly([4, 14, 9.5, 5, 15, 14], PAL.wood, 2.2) + poly([49, 14, 54.5, 5, 60, 14], PAL.wood, 2.2) +
    rect(15, 22, 34, 34, PAL.wood, SW) + poly([32, 22, 49, 22, 49, 56, 32, 56], dark(PAL.wood, 0.22), 0) + rect(15, 22, 34, 34, null, SW) +
    line([32, 22, 32, 56], 2, INK) + line([15, 31, 49, 31], 2, X.iron) + line([15, 47, 49, 47], 2, X.iron) + line([20, 22, 20, 56], 1, INK, 0.4) + line([26, 22, 26, 56], 1, INK, 0.4) + line([38, 22, 38, 56], 1, INK, 0.4) + line([44, 22, 44, 56], 1, INK, 0.4) +
    rect(13, 18, 38, 5, PAL.woodDark, 2.2),

  [BT.GateStone]: () => {
    let grid = '';
    for (let i = 0; i < 4; i++) grid += line([24 + i * 5.3, 30, 24 + i * 5.3, 56], 1.8, X.steelDark);
    for (let j = 0; j < 4; j++) grid += line([20, 38 + j * 6, 44, 38 + j * 6], 1.8, X.steelDark);
    return (
      shadow(32, 58, 29) +
      cube(2, 20, 17, 36, 4, ST) + crenel(2, 20, 17, 3, 5, lite(ST, 0.1)) + cube(42, 20, 17, 36, 4, ST) + crenel(42, 20, 17, 3, 5, lite(ST, 0.1)) +
      rect(17, 24, 30, 32, ST, SW) + crenel(17, 24, 30, 4, 5, lite(ST, 0.1)) +
      poly([20, 56, 20, 38, 24, 31, 40, 31, 44, 38, 44, 56], X.night, SW) + grid +
      poly([20, 56, 20, 38, 24, 31, 40, 31, 44, 38, 44, 56], null, SW) +
      win(8, 30, 4) + win(48, 30, 4) + flag(32, 19, 10, X.red, 9)
    );
  },

  [BT.Drawbridge]: () =>
    poly([2, 38, 62, 38, 62, 58, 2, 58], PAL.water, SW) + poly([2, 48, 62, 48, 62, 58, 2, 58], PAL.waterDeep, 0) + poly([2, 38, 62, 38, 62, 58, 2, 58], null, SW) +
    cube(8, 8, 48, 16, 4, ST) + crenel(8, 8, 48, 6, 4, lite(ST, 0.1)) + poly([26, 28, 26, 18, 30, 12, 34, 12, 38, 18, 38, 28], X.night, 2) +
    line([20, 26, 18, 38], 2.2, INK) + line([44, 26, 46, 38], 2.2, INK) +
    poly([22, 26, 42, 26, 50, 54, 14, 54], PAL.wood, SW) + poly([32, 26, 42, 26, 50, 54, 32, 54], dark(PAL.wood, 0.22), 0) + poly([22, 26, 42, 26, 50, 54, 14, 54], null, SW) +
    line([20, 33, 44, 33], 1.4, INK, 0.7) + line([18, 40, 46, 40], 1.4, INK, 0.7) + line([16, 47, 48, 47], 1.4, INK, 0.7) + line([32, 26, 32, 54], 1.4, INK, 0.6),

  [BT.Stairs]: () => {
    let s = shadow(32, 58, 28);
    for (let i = 0; i < 4; i++) s += cube(6 + i * 11, 50 - i * 10, 11, 6 + i * 10, 5, ST);
    return s;
  },

  [BT.Pit]: () =>
    groundPatch() + ngon(32, 40, 26, PAL.sandDark, SW, 10, 14) + ngon(32, 41, 20, PAL.pitch, 2, 10, 9.4) +
    rect(14, 36, 36, 3, PAL.wood, 1.8) + rect(18, 43, 30, 3, PAL.woodDark, 1.8) + poly([8, 36, 12, 32, 14, 38], PAL.steppe, 1.4) + poly([52, 44, 56, 41, 58, 46], PAL.steppe, 1.4),

  [BT.KillingPit]: () => {
    let s = groundPatch() + ngon(32, 44, 27, PAL.sandDark, SW, 10, 12) + ngon(32, 45, 22, PAL.pitch, 2, 10, 8.4);
    const xs = [16, 24, 32, 40, 48];
    for (let i = 0; i < xs.length; i++) {
      const y = i % 2 ? 32 : 28;
      s += poly([xs[i] - 2.6, 47, xs[i], y, xs[i] + 2.6, 47], PAL.wood, 2) + poly([xs[i], y, xs[i] + 2.6, 47, xs[i], 47], PAL.woodDark, 0) + poly([xs[i] - 2.6, 47, xs[i], y, xs[i] + 2.6, 47], null, 2);
    }
    return s;
  },

  [BT.PitchDitch]: () =>
    poly([2, 48, 14, 32, 62, 32, 50, 48], PAL.sandDark, SW) + poly([6, 46, 16, 35, 58, 35, 48, 46], PAL.pitch, 2) +
    ngon(22, 41, 3.4, lite(PAL.pitch, 0.3), 0, 6, 1.6) + ngon(42, 40, 3.4, lite(PAL.pitch, 0.3), 0, 6, 1.6) +
    flame(20, 40, 0.9) + flame(46, 39, 1.1) + flame(33, 38, 0.8),

  [BT.Cauldron]: () =>
    shadow(32, 58, 22) +
    flame(20, 56, 0.9) + flame(32, 56, 1.1) + flame(44, 56, 0.9) +
    poly([12, 22, 52, 22, 52, 32, 47, 44, 38, 49, 26, 49, 17, 44, 12, 32], X.night, SW) + poly([32, 22, 52, 22, 52, 32, 47, 44, 38, 49, 32, 49], dark(X.night, 0.3), 0) + poly([12, 22, 18, 22, 18, 36, 17, 44, 12, 32], lite(X.night, 0.15), 0) + poly([12, 22, 52, 22, 52, 32, 47, 44, 38, 49, 26, 49, 17, 44, 12, 32], null, SW) +
    ngon(32, 22, 20, X.brown, SW, 10, 5.4) + ngon(32, 22.5, 16, PAL.pitch, 0, 10, 3.6) +
    ngon(26, 22, 2.6, lite(PAL.pitch, 0.3), 0, 6, 1.4) +
    line([12, 25, 6, 31], 2.4, INK) + line([52, 25, 58, 31], 2.4, INK) + smoke(32, 12, 0.9),

  [BT.TurretBallista]: () =>
    shadow(32, 58, 26) + cube(6, 46, 46, 10, 6, ST) + crenel(6, 46, 46, 6, 4, lite(ST, 0.1)) +
    poly([22, 46, 26, 36, 30, 36, 28, 46], PAL.woodDark, 2) + poly([40, 46, 36, 36, 32, 36, 34, 46], PAL.woodDark, 2) +
    rect(16, 30, 38, 5, PAL.wood, 2.2) +
    line([20, 16, 16, 32, 20, 48], 5.6, INK) + line([20, 16, 16, 32, 20, 48], 3.2, PAL.woodDark) + line([20, 16, 26, 32, 20, 48], 1.2, PAL.white) +
    at(24, 32.5, arrow(34, X.steel), 0, 1),

  [BT.TurretMangonel]: () =>
    shadow(32, 58, 26) + cube(6, 46, 46, 10, 6, ST) + crenel(6, 46, 46, 6, 4, lite(ST, 0.1)) +
    poly([10, 46, 14, 38, 48, 38, 52, 46], PAL.wood, SW) + rect(10, 38, 42, 4, PAL.woodDark, 2) +
    poly([18, 38, 24, 22, 28, 22, 24, 38], PAL.woodDark, 2) + poly([40, 38, 36, 22, 32, 22, 36, 38], PAL.woodDark, 2) +
    line([26, 24, 46, 8], 5.6, INK) + line([26, 24, 46, 8], 3.2, PAL.wood) + line([26, 24, 14, 32], 5.6, INK) + line([26, 24, 14, 32], 3.2, PAL.wood) +
    ngon(48, 7, 5, ST, 2.2, 7) + poly([42, 10, 46, 14, 54, 12, 53, 8], PAL.woodDark, 1.8) + ngon(48, 7, 4.6, ST, 2.2, 7) + ngon(26, 24, 3, X.iron, 1.8, 6),

  [BT.Barracks]: () =>
    shadow(32, 58, 28) +
    cube(5, 24, 44, 32, 9, STD) + crenel(5, 24, 44, 6, 5, ST) + bricks(5, 24, 44, 32, 5) +
    poly([22, 56, 22, 44, 27, 38, 33, 38, 38, 44, 38, 56], PAL.woodDark, SW) +
    poly([8, 28, 17, 28, 17, 45, 12.5, 41, 8, 45], X.red, 2) + poly([41, 28, 50, 28, 50, 45, 45.5, 41, 41, 45], X.red, 2) +
    at(30, 30, swordP(), 50, 0.42) + at(30, 30, swordP(), -50, 0.42) + flag(30, 19, 10, X.red, 9),

  [BT.MercPost]: () =>
    shadow(32, 58, 26) +
    poly([4, 56, 32, 12, 60, 56], PAL.sand, SW) + poly([32, 12, 60, 56, 32, 56], PAL.sandDark, 0) + poly([4, 56, 32, 12, 60, 56], null, SW) +
    poly([14, 40, 22, 40, 20, 56, 12, 56], PAL.roof, 1.8) + poly([50, 40, 42, 40, 44, 56, 52, 56], PAL.roof, 1.8) +
    poly([24, 56, 28, 36, 32, 32, 36, 36, 40, 56], X.night, 2.2) + poly([24, 56, 28, 36, 32, 32, 28, 56], X.brown, 1.6) +
    line([32, 12, 32, 4], 2, INK) + poly([32, 4, 42, 7, 32, 10], X.red, 1.6) + dot(32, 12, 2, PAL.gold, 1.4) +
    rect(6, 22, 2.6, 34, PAL.wood, 1.8) + poly([7.3, 12, 10, 22, 4.6, 22], X.steel, 1.6),

  [BT.Stable]: () =>
    shadow(32, 58, 28) +
    house(5, 28, 38, 27, 10, PAL.wood, PAL.roof, 15, null) +
    rect(14, 38, 20, 17, X.night, 2.4) +
    poly([20, 55, 20, 48, 24, 41, 30, 41, 32, 46, 32, 55], lite(X.brown, 0.3), 1.8) + poly([22, 41, 28, 41, 28, 49, 22, 49], lite(X.brown, 0.5), 1.8) + poly([24, 41, 26, 41, 26, 49, 24, 49], PAL.white, 0) + dot(26.5, 44, 1, INK) +
    line([14, 38, 34, 55], 2.2, PAL.wood) + line([34, 38, 14, 55], 2.2, PAL.wood) + rect(14, 38, 20, 17, null, 2.4) +
    cube(48, 46, 10, 9, 4, PAL.thatch),

  [BT.EngineerGuild]: () =>
    shadow(32, 58, 28) +
    house(6, 30, 36, 25, 10, STD, PAL.roof, 13, null) + door(10, 55, 9, 13) +
    gear(36, 42, 9, 8, X.steel) + gear(52, 28, 6, 6, X.steelDark) +
    rect(48, 12, 3, 10, PAL.wood, 1.8) + line([49.5, 12, 49.5, 6], 1.6, INK),
};

/** Reiner Hilfstyp: kleine Vorschau der Rohbau-/Fallback-Form */
export function genericBuilding(): string {
  return shadow(32, 58, 22) + house(10, 30, 32, 24, 10, PAL.wood, PAL.roof, 14);
}
