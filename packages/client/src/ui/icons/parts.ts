/**
 * Wiederverwendbare Teile: Waffen (aufrecht um den Ursprung gezeichnet, Spitze oben),
 * Menschenfigur, Pferd. Werden von Einheiten-, Ressourcen- und Werkzeug-Icons genutzt.
 */
import { PAL } from '@strongpoly/shared';
import { Col, INK, X, at, dark, dot, line, lite, ngon, poly, rect } from './svg';

// ---------- Waffen (Ursprung = Mitte, Länge ca. 44) ----------

export function swordP(c: Col = X.steel): string {
  return (
    poly([0, -24, -3.2, -18, -3.2, 6, 0, 6], lite(c, 0.2), 0) +
    poly([0, -24, 3.2, -18, 3.2, 6, 0, 6], dark(c, 0.15), 0) +
    poly([0, -24, 3.2, -18, 3.2, 6, -3.2, 6, -3.2, -18], null) +
    rect(-8, 6, 16, 3.4, PAL.gold, 2.2) +
    rect(-1.8, 9.4, 3.6, 8, X.leather, 2) +
    ngon(0, 19.5, 2.8, PAL.gold, 2, 6)
  );
}

export function spearP(): string {
  return rect(-1.3, -12, 2.6, 36, PAL.wood, 2) + poly([0, -27, 4, -12, -4, -12], X.steel, 2.2) + poly([0, -27, 4, -12, 0, -12], X.steelDark, 0) + poly([0, -27, 4, -12, -4, -12], null, 2.2);
}

export function pikeP(): string {
  return rect(-1.2, -20, 2.4, 46, PAL.wood, 2) + poly([0, -32, 2.8, -18, 0, -16, -2.8, -18], X.steel, 2.2) + rect(-2.4, -17, 4.8, 3, X.red, 1.8);
}

export function maceP(): string {
  const star: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const r = i % 2 ? 6 : 9.5;
    star.push(Math.cos(a) * r, -15 + Math.sin(a) * r);
  }
  return rect(-1.8, -6, 3.6, 29, PAL.wood, 2) + poly(star, X.iron, 2.2) + ngon(-1.5, -16, 3.2, lite(X.iron, 0.3), 0, 6);
}

export function axeP(): string {
  return (
    rect(-1.6, -16, 3.2, 40, PAL.wood, 2) +
    poly([1.6, -20, 12, -23, 12, -4, 1.6, -9], X.steel, 2.4) +
    poly([1.6, -20, 12, -23, 12, -13.5, 1.6, -14], lite(X.steel, 0.25), 0)
  );
}

export function hammerP(): string {
  return rect(-1.8, -8, 3.6, 32, PAL.wood, 2) + rect(-9, -18, 18, 10, X.iron, 2.4) + rect(-9, -18, 18, 3.5, lite(X.iron, 0.3), 0);
}

export function pickP(): string {
  return rect(-1.6, -14, 3.2, 38, PAL.wood, 2) + poly([-15, -4, -8, -14, 0, -17, 8, -14, 15, -4, 8, -11, 0, -13, -8, -11], X.iron, 2.4);
}

/** Bogen: Sehne rechts, Wölbung links */
export function bowP(): string {
  return (
    line([6, -23, 6, 23], 1.2, PAL.white) +
    line([6, -23, -3, -12, -7, 0, -3, 12, 6, 23], 5.6, INK) +
    line([6, -23, -3, -12, -7, 0, -3, 12, 6, 23], 3.2, PAL.wood)
  );
}

export function crossbowP(): string {
  return (
    rect(-2.2, -12, 4.4, 36, PAL.woodDark, 2) +
    line([-15, -6, -8, -13, 0, -15, 8, -13, 15, -6], 5.6, INK) +
    line([-15, -6, -8, -13, 0, -15, 8, -13, 15, -6], 3.2, PAL.wood) +
    line([-15, -6, 0, 10, 15, -6], 1.2, PAL.white) +
    poly([0, -22, 1.8, -9, -1.8, -9], X.steel, 1.6)
  );
}

/** Schild; Embleme in `team` */
export function shieldP(c: Col, team: Col = X.red, kind: 'heater' | 'round' = 'heater'): string {
  if (kind === 'round') {
    return ngon(0, 0, 11, c, 2.6, 10) + ngon(0, 0, 11, null, 2.6, 10) + poly([-0.1, -11, 11, 0, 0, 11, -11, 0], null, 0) + ngon(0, 0, 4.2, team, 2, 8) + ngon(2, 0, 2, lite(team, 0.2), 0, 6);
  }
  return (
    poly([-10, -11, 10, -11, 10, 2, 0, 14, -10, 2], c, 2.6) +
    poly([0, -11, 10, -11, 10, 2, 0, 14], dark(c, 0.25), 0) +
    poly([-3, -11, 3, -11, 3, 9, 0, 12, -3, 9], team, 0) +
    poly([-10, -11, 10, -11, 10, 2, 0, 14, -10, 2], null, 2.6)
  );
}

// ---------- Menschenfigur ----------

export interface ManOpts {
  tunic: Col;
  legs?: Col;
  skin?: Col;
  hat?: 'none' | 'straw' | 'hood' | 'helm' | 'crown' | 'turban' | 'cap' | 'cowl' | 'mask' | 'kettle' | 'bascinet';
  hatCol?: Col;
  /** Teamfarbe: Schärpe/Wappenrock */
  team?: Col;
  /** Teamstreifen: 'tabard' (Wappenrock), 'sash', 'none' */
  mark?: 'tabard' | 'sash' | 'belt' | 'none';
  cape?: Col;
  bare?: boolean;
  legsOff?: boolean;
  robe?: boolean;
}

export function man(o: ManOpts): string {
  const skin = o.skin ?? X.skin;
  const legs = o.legs ?? dark(o.tunic, 0.45);
  let s = '';
  if (o.cape !== undefined) s += poly([23, 25, 41, 25, 47, 51, 17, 51], o.cape, 2.4) + poly([32, 25, 41, 25, 47, 51, 32, 51], dark(o.cape, 0.25), 0);
  if (o.robe) {
    s += poly([22, 26, 42, 26, 47, 55, 17, 55], o.tunic, 2.6) + poly([32, 26, 42, 26, 47, 55, 32, 55], dark(o.tunic, 0.25), 0) + poly([22, 26, 42, 26, 47, 55, 17, 55], null, 2.6);
  } else {
    if (!o.legsOff) {
      s += rect(24, 42, 6.6, 12, legs, 2.4) + rect(33.4, 42, 6.6, 12, legs, 2.4);
      s += rect(23, 52, 8.2, 3.2, dark(legs, 0.4), 1.8) + rect(32.8, 52, 8.2, 3.2, dark(legs, 0.4), 1.8);
    }
    const bodyCol = o.bare ? skin : o.tunic;
    s += poly([23, 25, 41, 25, 43.5, 43, 20.5, 43], bodyCol, 2.6) + poly([32, 25, 41, 25, 43.5, 43, 32, 43], dark(bodyCol, 0.22), 0) + poly([23, 25, 41, 25, 43.5, 43, 20.5, 43], null, 2.6);
  }
  if (o.team !== undefined) {
    if (o.mark === 'sash') s += poly([23, 25, 29, 25, 41, 41, 42.5, 43, 36, 43, 24, 28], o.team, 1.8);
    else if (o.mark === 'belt') s += rect(21.5, 38, 21, 4, o.team, 1.8);
    else if (o.mark !== 'none') s += poly([28, 25, 36, 25, 37, 48, 32, 51, 27, 48], o.team, 2);
  }
  // Arme
  s += poly([23, 26, 18, 30, 16.5, 42, 21, 43, 22, 33], o.bare ? skin : o.tunic, 2.2) + poly([41, 26, 46, 30, 47.5, 42, 43, 43, 42, 33], dark(o.bare ? skin : o.tunic, 0.22), 2.2);
  s += dot(18.8, 43.5, 2.2, skin, 1.4) + dot(45.2, 43.5, 2.2, skin, 1.4);
  // Kopf
  s += head(o, skin);
  return s;
}

function head(o: ManOpts, skin: Col): string {
  const hc = o.hatCol ?? X.cloth;
  let s = '';
  const face = (): string => ngon(32, 17, 6.6, skin, 2.4, 8) + poly([32, 10.4, 38.6, 17, 36, 22.5, 32, 23.6], dark(skin, 0.18), 0) + ngon(32, 17, 6.6, null, 2.4, 8) + dot(29.4, 17.5, 1.1, INK) + dot(34.6, 17.5, 1.1, INK);
  switch (o.hat) {
    case 'hood':
    case 'cowl':
      s += poly([22.5, 24, 23, 12, 28, 6.5, 36, 6.5, 41, 12, 41.5, 24, 36, 22, 28, 22], hc, 2.6) + poly([32, 6.5, 36, 6.5, 41, 12, 41.5, 24, 36, 22, 32, 22], dark(hc, 0.25), 0);
      s += ngon(32, 17.5, 5, skin, 2, 8) + dot(30, 18, 1, INK) + dot(34, 18, 1, INK);
      return s;
    case 'mask':
      s += poly([22.5, 24, 23, 12, 28, 6.5, 36, 6.5, 41, 12, 41.5, 24, 36, 22, 28, 22], hc, 2.6) + poly([32, 6.5, 36, 6.5, 41, 12, 41.5, 24, 36, 22, 32, 22], dark(hc, 0.25), 0);
      s += rect(26.5, 14, 11, 5, skin, 1.6) + dot(29.5, 16.5, 1.2, INK) + dot(34.5, 16.5, 1.2, INK);
      return s;
    case 'helm':
    case 'kettle':
    case 'bascinet': {
      const steel = o.hat === 'kettle' ? X.steelDark : X.steel;
      s += face();
      s += poly([24.5, 19, 25, 11, 32, 6.2, 39, 11, 39.5, 19, 36.5, 19, 36.5, 16, 27.5, 16, 27.5, 19], steel, 2.6) + poly([32, 6.2, 39, 11, 39.5, 19, 36.5, 19, 36.5, 16, 32, 16], dark(steel, 0.25), 0);
      if (o.hat === 'kettle') s += poly([20.5, 12.5, 32, 8.5, 43.5, 12.5, 32, 15.5], steel, 2.4);
      if (o.hat === 'bascinet') s += rect(25, 16, 14, 3, X.night, 1.8) + poly([30.5, 3.5, 33.5, 3.5, 34, 8, 30, 8], hc, 1.6);
      if (hc !== X.cloth && o.hat === 'helm') s += poly([30, 6.4, 34, 6.4, 38.5, 0.5, 32, 3], hc, 1.6);
      return s;
    }
    case 'straw':
      s += face();
      s += poly([21, 13.5, 27, 11, 37, 11, 43, 13.5, 32, 16.5], PAL.thatch, 2.4) + poly([27, 11.5, 28, 5.5, 36, 5.5, 37, 11.5], PAL.thatch, 2.4) + poly([32, 5.5, 36, 5.5, 37, 11.5, 32, 11.5], dark(PAL.thatch, 0.22), 0) + rect(27.2, 9.2, 9.6, 2, X.brown, 1.2);
      return s;
    case 'crown':
      s += face();
      s += poly([26, 11.5, 25.5, 4.5, 29, 8, 32, 3, 35, 8, 38.5, 4.5, 38, 11.5], PAL.gold, 2.2) + poly([32, 3, 35, 8, 38.5, 4.5, 38, 11.5, 32, 11.5], dark(PAL.gold, 0.2), 0) + dot(32, 9, 1.2, X.red);
      return s;
    case 'turban':
      s += face();
      s += ngon(32, 10.5, 9, hc, 2.4, 8, 6.2) + poly([32, 4.5, 41, 10.5, 32, 16.5], dark(hc, 0.2), 0) + poly([34, 5, 38, 4, 40, 8, 36, 9], lite(hc, 0.3), 1.4) + dot(32, 6.5, 1.6, PAL.gold);
      return s;
    case 'cap':
      s += face();
      s += poly([24.5, 13.5, 25, 9, 32, 5.5, 39, 9, 39.5, 13.5], hc, 2.4) + poly([32, 5.5, 39, 9, 39.5, 13.5, 32, 13.5], dark(hc, 0.2), 0) + rect(22.5, 12.8, 19, 2.8, dark(hc, 0.1), 2);
      return s;
    default:
      s += face();
      s += poly([25.5, 14, 26, 9.5, 32, 7, 38, 9.5, 38.5, 14, 35, 11.5, 29, 11.5], hc, 2.2);
      return s;
  }
}

// ---------- Pferd (Seitenansicht, schaut nach rechts) ----------

export function horse(coat: Col, cloth: Col | null): string {
  let s = '';
  // Hinterbeine / Schweif
  s += poly([8, 33, 3, 40, 5, 48, 10, 41], dark(coat, 0.45), 2.2);
  s += rect(12, 46, 4, 11, dark(coat, 0.2), 2.2) + rect(17.5, 46, 4, 11, coat, 2.2);
  s += rect(36, 46, 4, 11, dark(coat, 0.2), 2.2) + rect(41.5, 46, 4, 11, coat, 2.2);
  s += rect(11.5, 55, 5, 3, X.night, 1.6) + rect(17, 55, 5, 3, X.night, 1.6) + rect(35.5, 55, 5, 3, X.night, 1.6) + rect(41, 55, 5, 3, X.night, 1.6);
  // Körper
  s += poly([9, 33, 38, 31, 46, 36, 45, 47, 38, 49, 16, 49, 9, 44], coat, 2.6) + poly([9, 41, 45, 41, 45, 47, 38, 49, 16, 49, 9, 44], dark(coat, 0.22), 0) + poly([9, 33, 38, 31, 46, 36, 45, 47, 38, 49, 16, 49, 9, 44], null, 2.6);
  // Hals + Kopf
  s += poly([38, 31, 45, 17, 52, 18, 47, 38, 44, 40], coat, 2.6) + poly([46, 17, 52, 18, 58, 28, 62, 33, 59, 37, 51, 31, 46, 26], lite(coat, 0.05), 2.6);
  s += poly([44, 18, 41, 20, 43, 31, 38, 32], dark(coat, 0.5), 2) + dot(53.2, 22, 1.2, INK) + poly([47, 17, 48.5, 12, 51, 17], dark(coat, 0.2), 1.8);
  if (cloth !== null) s += poly([15, 32, 33, 31, 35, 49, 30, 53, 24, 49, 18, 53, 13, 48], cloth, 2.4) + poly([26, 31, 33, 31, 35, 49, 30, 53, 26, 50], dark(cloth, 0.25), 0);
  return s;
}

/** Reiter auf Pferd: Mensch skaliert über den Pferderücken */
export function rider(m: ManOpts): string {
  return at(8.5, 3.5, man({ ...m, legsOff: true }), 0, 0.6);
}
