/** Einheiten-Icons (U-IDs). Jeder Zeichner bekommt die Spielerfarbe `t`. */
import { PAL, U } from '@strongpoly/shared';
import { bowP, crossbowP, hammerP, horse, maceP, man, pickP, pikeP, rider, shieldP, spearP, swordP } from './parts';
import { Col, INK, SW, X, arrow, at, cube, dark, dot, flag, flame, line, lite, ngon, poly, pole, rect, shadow } from './svg';

export type UnitDrawer = (t: Col) => string;

function ladder(): string {
  let s = rect(-4.6, -24, 2.6, 48, PAL.wood, 1.8) + rect(2, -24, 2.6, 48, PAL.wood, 1.8);
  for (let i = 0; i < 6; i++) s += rect(-2, -19 + i * 8, 4, 2.4, PAL.woodDark, 1.4);
  return s;
}

function wheel(cx: number, cy: number, r: number): string {
  let s = ngon(cx, cy, r, PAL.woodDark, SW, 10);
  s += line([cx - r, cy, cx + r, cy], 1.6, INK, 0.8) + line([cx, cy - r, cx, cy + r], 1.6, INK, 0.8);
  return s + ngon(cx, cy, r * 0.3, X.iron, 1.6, 6);
}

export const UNIT_ICONS: Record<number, UnitDrawer> = {
  [U.Peasant]: () => shadow(32, 57, 15) + man({ tunic: PAL.thatch, legs: PAL.woodDark, hat: 'straw' }) + at(50, 36, pickP(), 18, 0.62),

  [U.Ox]: () =>
    shadow(32, 58, 26) +
    rect(14, 44, 6, 12, X.brown, 2.2) + rect(22, 44, 6, 12, dark(X.brown, 0.2), 2.2) + rect(40, 44, 6, 12, dark(X.brown, 0.2), 2.2) + rect(47, 44, 6, 12, X.brown, 2.2) +
    poly([8, 28, 36, 24, 54, 28, 56, 40, 50, 48, 14, 48, 8, 40], X.brown, SW) + poly([8, 40, 56, 40, 50, 48, 14, 48], dark(X.brown, 0.22), 0) + poly([36, 24, 54, 28, 56, 40, 36, 40], dark(X.brown, 0.12), 0) + poly([8, 28, 36, 24, 54, 28, 56, 40, 50, 48, 14, 48, 8, 40], null, SW) +
    poly([2, 24, 12, 22, 16, 30, 14, 42, 6, 46, 1, 40], lite(X.brown, 0.1), SW) + poly([8, 22, 12, 22, 16, 30, 14, 42, 8, 42], dark(X.brown, 0.1), 0) +
    poly([3, 24, 0, 14, 5, 18, 8, 22], PAL.white, 1.8) + poly([12, 22, 16, 13, 17, 20, 15, 27], PAL.white, 1.8) + dot(8, 31, 1.3, INK) + ngon(5, 41, 2.8, X.pink, 1.6, 6) +
    poly([56, 30, 61, 38, 58, 46, 55, 40], dark(X.brown, 0.4), 1.8),

  [U.Lord]: (t) =>
    shadow(32, 57, 17) + man({ tunic: PAL.gold, legs: X.night, hat: 'crown', cape: t, team: t, mark: 'tabard' }) +
    at(50, 34, swordP(), 12, 0.62) + poly([41, 26, 47, 28, 41, 34], dark(t, 0.1), 1.6),

  [U.Archer]: (t) => shadow(32, 57, 15) + man({ tunic: PAL.treeLight, legs: PAL.woodDark, hat: 'hood', hatCol: PAL.treeDark, team: t, mark: 'belt' }) + at(52, 34, bowP(), 0, 0.82) + at(12, 30, rect(-2, -8, 4, 16, PAL.woodDark, 1.6) + poly([-2, -8, 0, -12, 2, -8], t, 1.2), 0, 1),

  [U.Crossbowman]: (t) => shadow(32, 57, 15) + man({ tunic: X.cloth, legs: PAL.woodDark, hat: 'kettle', team: t, mark: 'tabard' }) + at(48, 36, crossbowP(), 75, 0.85),

  [U.Spearman]: (t) => shadow(32, 57, 15) + man({ tunic: PAL.woodDark, legs: X.brown, hat: 'helm', hatCol: t, team: t, mark: 'belt' }) + at(52, 30, spearP(), 6, 1.0) + at(17, 42, shieldP(PAL.wood, t, 'round'), 0, 0.82),

  [U.Pikeman]: (t) => shadow(32, 57, 15) + man({ tunic: X.steelDark, legs: X.night, hat: 'kettle', team: t, mark: 'tabard' }) + at(53, 28, pikeP(), 4, 1.08) + at(11, 40, shieldP(X.steel, t), 0, 0.6),

  [U.Maceman]: (t) => shadow(32, 57, 15) + man({ tunic: X.leather, legs: PAL.woodDark, hat: 'helm', hatCol: t, team: t, mark: 'tabard' }) + at(51, 30, maceP(), 18, 0.88) + at(14, 41, shieldP(PAL.wood, t, 'round'), 0, 0.74),

  [U.Swordsman]: (t) => shadow(32, 57, 15) + man({ tunic: X.steel, legs: X.steelDark, hat: 'bascinet', hatCol: t, team: t, mark: 'tabard' }) + at(52, 32, swordP(), 14, 0.84) + at(12, 41, shieldP(X.steel, t), 0, 0.82),

  [U.Knight]: (t) =>
    shadow(30, 59, 28) + horse(X.brown, t) + rider({ tunic: X.steel, legs: X.steelDark, hat: 'bascinet', hatCol: t, team: t, mark: 'tabard' }) +
    line([24, 28, 58, 6], 5, INK) + line([24, 28, 58, 6], 2.6, PAL.wood) + poly([56, 2, 62, 4, 58, 9], t, 1.6),

  [U.Tunneler]: () => shadow(32, 57, 15) + man({ tunic: X.cloth, legs: PAL.woodDark, hat: 'cap', hatCol: PAL.gold }) + dot(32, 8, 2.2, X.flameHot, 1.4) + at(50, 32, pickP(), 14, 0.74),

  [U.Laddermen]: (t) => shadow(32, 57, 15) + man({ tunic: PAL.woodDark, legs: X.brown, hat: 'hood', hatCol: X.cloth, team: t, mark: 'belt' }) + at(14, 30, ladder(), 8, 0.74),

  [U.Engineer]: () => shadow(32, 57, 15) + man({ tunic: X.orange, legs: PAL.woodDark, hat: 'cap', hatCol: PAL.gold, team: PAL.white, mark: 'belt' }) + at(49, 36, hammerP(), 22, 0.68),

  [U.Monk]: (t) => shadow(32, 57, 15) + man({ tunic: X.cloth, legs: X.cloth, hat: 'cowl', hatCol: X.cloth, robe: true, team: t, mark: 'belt' }) + at(52, 32, pole(0, -14, 24, 2.2) + poly([-5, -14, 5, -14, 5, -7, 1.2, -7, 1.2, -4, -1.2, -4, -1.2, -7, -5, -7], PAL.gold, 1.6), 0, 1),

  [U.Slave]: (t) => shadow(32, 57, 15) + man({ tunic: X.skinDark, legs: X.cloth, bare: true, skin: X.skinDark, team: t, mark: 'belt' }) + at(51, 30, pole(0, -4, 22, 2.4) + flame(0, -4, 0.8), 14, 1),

  [U.Slinger]: (t) => shadow(32, 57, 15) + man({ tunic: PAL.sand, legs: PAL.woodDark, hat: 'turban', hatCol: t, team: t, mark: 'sash' }) + line([42, 40, 52, 22, 58, 12], 2, INK) + ngon(58, 11, 3.6, PAL.stone, 2, 6) + line([42, 40, 56, 30], 1.4, INK),

  [U.HorseArcher]: (t) => shadow(30, 59, 28) + horse(PAL.sandDark, t) + rider({ tunic: PAL.sand, hat: 'turban', hatCol: t, team: t, mark: 'sash' }) + at(50, 22, bowP(), 0, 0.7),

  [U.ArabSwordsman]: (t) =>
    shadow(32, 57, 15) + man({ tunic: X.red, legs: PAL.sand, hat: 'turban', hatCol: t, team: t, mark: 'sash' }) +
    at(52, 30, poly([0, -22, 4, -18, 4, -8, 2, 6, -3, 6, -3, -18], X.steel, 2) + poly([0, -22, 4, -18, 4, -8, 2, 6, 0, 6], X.steelDark, 0) + rect(-6, 6, 12, 3, PAL.gold, 2) + rect(-1.6, 9, 3.2, 7, X.leather, 1.8), 14, 0.9) +
    at(14, 42, shieldP(PAL.gold, t, 'round'), 0, 0.6),

  [U.Assassin]: (t) =>
    shadow(32, 57, 15) + man({ tunic: X.night, legs: X.night, hat: 'mask', hatCol: dark(X.night, 0.2), team: t, mark: 'sash' }) +
    at(51, 36, poly([0, -16, 2.6, -10, 2.6, 2, -2.6, 2, -2.6, -10], X.steel, 2) + rect(-5, 2, 10, 2.6, PAL.gold, 1.8) + rect(-1.4, 4.6, 2.8, 6, X.brown, 1.6), 28, 0.9) +
    at(14, 40, poly([0, -12, 2.2, -7, 2.2, 1, -2.2, 1, -2.2, -7], X.steel, 2) + rect(-4, 1, 8, 2.4, PAL.gold, 1.6) + rect(-1.2, 3, 2.4, 5, X.brown, 1.4), -28, 0.85),

  [U.Firethrower]: (t) =>
    shadow(32, 57, 15) + man({ tunic: X.cloth, legs: PAL.woodDark, hat: 'turban', hatCol: t, team: t, mark: 'belt' }) +
    at(40, 33, rect(0, -2.4, 14, 4.8, X.iron, 2) + rect(-3, -4, 6, 8, PAL.woodDark, 1.8), 0, 1) + at(55, 30, flame(0, 8, 1.4), 90, 1),

  // ---- Belagerungsgerät ----
  [U.Catapult]: (t) =>
    shadow(32, 58, 28) +
    poly([6, 44, 12, 36, 52, 36, 58, 44], PAL.wood, SW) + rect(6, 44, 52, 4, PAL.woodDark, 2) + poly([6, 44, 12, 36, 52, 36, 58, 44], null, SW) +
    poly([22, 36, 28, 18, 32, 18, 28, 36], PAL.woodDark, 2) + poly([42, 36, 36, 18, 32, 18, 36, 36], PAL.woodDark, 2) +
    line([30, 20, 52, 6], 6, INK) + line([30, 20, 52, 6], 3.4, PAL.wood) + line([30, 20, 14, 30], 6, INK) + line([30, 20, 14, 30], 3.4, PAL.wood) +
    ngon(52, 6, 5.2, PAL.stone, 2.2, 7) + poly([14, 30, 8, 26, 12, 34], t, 1.6) +
    wheel(16, 50, 7) + wheel(48, 50, 7) + flag(32, 18, 6, t, 7),

  [U.Trebuchet]: (t) =>
    shadow(32, 58, 28) +
    poly([6, 52, 32, 52, 58, 52, 52, 56, 12, 56], PAL.woodDark, SW) +
    line([14, 52, 26, 12], 6, INK) + line([14, 52, 26, 12], 3.4, PAL.wood) + line([46, 52, 34, 12], 6, INK) + line([46, 52, 34, 12], 3.4, PAL.wood) +
    line([20, 32, 40, 32], 3.2, PAL.woodDark) +
    line([8, 52, 30, 12, 58, 4], 6, INK) + line([30, 12, 58, 4], 3.4, PAL.wood) + line([30, 12, 18, 40], 3.4, PAL.wood) +
    rect(12, 38, 12, 11, PAL.stoneDark, 2.4) + line([24, 40, 18, 40], 1.5, INK) +
    line([58, 4, 54, 24], 1.4, INK) + ngon(53, 28, 4.4, PAL.stone, 2.2, 7) + ngon(30, 12, 3.2, X.iron, 1.8, 6) + flag(46, 52, 8, t, 6),

  [U.Ram]: (t) =>
    shadow(32, 58, 28) +
    poly([6, 20, 32, 8, 58, 20, 58, 26, 6, 26], t, SW) + poly([32, 8, 58, 20, 58, 26, 32, 26], dark(t, 0.28), 0) + poly([6, 20, 32, 8, 58, 20, 58, 26, 6, 26], null, SW) +
    rect(10, 26, 3.6, 20, PAL.woodDark, 2) + rect(50, 26, 3.6, 20, PAL.woodDark, 2) + rect(30, 26, 3.6, 20, PAL.woodDark, 2) +
    line([6, 40, 56, 40], 6, INK) + line([6, 40, 56, 40], 3.8, PAL.wood) + poly([56, 36, 62, 40, 56, 44], X.iron, 2.2) + poly([56, 36, 62, 40, 56, 40], lite(X.iron, 0.3), 0) +
    line([18, 26, 18, 40], 1.4, INK) + line([44, 26, 44, 40], 1.4, INK) + wheel(14, 52, 5.6) + wheel(34, 52, 5.6) + wheel(50, 52, 5.6),

  [U.SiegeTower]: (t) =>
    shadow(32, 59, 22) +
    cube(14, 8, 30, 44, 8, PAL.wood) + line([14, 20, 44, 20], 1.4, INK, 0.6) + line([14, 34, 44, 34], 1.4, INK, 0.6) + line([14, 8, 44, 52], 1.4, INK, 0.4) + line([44, 8, 14, 52], 1.4, INK, 0.4) +
    rect(24, 12, 10, 8, X.night, 1.8) + poly([44, 22, 58, 22, 58, 26, 44, 26], PAL.woodDark, 2) +
    poly([16, 6, 42, 6, 40, 2, 18, 2], PAL.woodDark, 2) + flag(30, 2, 0.1, t, 1) + poly([30, 2, 30, -2, 38, 0], t, 1) +
    wheel(20, 56, 6) + wheel(38, 56, 6) + poly([14, 52, 44, 52, 44, 49, 14, 49], PAL.woodDark, 1.4) + poly([14, 36, 24, 36, 24, 46, 14, 46], t, 1.8),

  [U.Mantlet]: (t) =>
    shadow(32, 58, 24) +
    poly([8, 12, 44, 12, 44, 52, 8, 52], PAL.wood, SW) + poly([44, 12, 56, 8, 56, 48, 44, 52], PAL.woodDark, SW) + poly([8, 12, 44, 12, 56, 8, 20, 8], lite(PAL.wood, 0.25), SW) +
    line([16, 12, 16, 52], 1.4, INK, 0.6) + line([26, 12, 26, 52], 1.4, INK, 0.6) + line([36, 12, 36, 52], 1.4, INK, 0.6) +
    rect(6, 28, 40, 4, X.iron, 2) + rect(6, 44, 40, 4, X.iron, 2) + poly([18, 18, 34, 18, 34, 26, 26, 30, 18, 26], t, 1.8),

  [U.FireBallista]: (t) =>
    shadow(32, 58, 26) +
    poly([8, 46, 14, 38, 50, 38, 56, 46], PAL.wood, SW) + rect(8, 46, 48, 4, PAL.woodDark, 2) +
    line([20, 14, 14, 30, 20, 46], 6, INK) + line([20, 14, 14, 30, 20, 46], 3.4, PAL.woodDark) + line([20, 14, 28, 30, 20, 46], 1.2, PAL.white) +
    rect(18, 28.4, 34, 4.4, PAL.wood, 2) + at(26, 30.6, arrow(26, X.iron), 0, 1) + at(52, 28, flame(0, 4, 0.8), 90, 1) +
    wheel(18, 53, 5.6) + wheel(46, 53, 5.6) + poly([8, 24, 14, 20, 14, 28], t, 1.6),
};

/** Reserve, falls ein Typ fehlt (wird von iconCoverage gemeldet) */
export function genericUnit(t: Col): string {
  return shadow(32, 57, 15) + man({ tunic: t, hat: 'none' });
}
