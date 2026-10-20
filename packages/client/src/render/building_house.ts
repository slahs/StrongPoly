import type { ModelBuilder } from './builder';
import { BP, SURF } from './building_palette';
import { banner, chimney, doorOn, FACE_ROT, facePos, gableRoof, hipRoof, plinth, shedRoof, timberFace, windowOn } from './building_parts';

export interface HouseOpts {
  /** Wandkörper (x × z) und Wandhöhe */
  w: number;
  d: number;
  h: number;
  x?: number;
  z?: number;
  /** Grundhöhe des Hauses über dem Boden (Stelzenhäuser) */
  y?: number;
  /** Höhe des Sockels (Wände beginnen darüber), 0 = kein Sockel */
  plinth?: number;
  wall: number;
  wallSurf?: number;
  roof: {
    kind?: 'gable' | 'hip' | 'shed';
    rise: number;
    color: number;
    surf?: number;
    over?: number;
    /** Firstbalken in Spielerfarbe (Dach bleibt Naturfarbe) */
    teamRidge?: boolean;
    /** First entlang x statt z */
    ridgeX?: boolean;
  };
  /** Fachwerk auf allen Seiten ('all'), nur Vorder-/Rückseite ('ends') oder keins */
  timber?: 'all' | 'ends' | false;
  timberColor?: number;
  door?: { face?: number; u?: number; w?: number; h?: number; arch?: boolean; step?: boolean; leaf?: number } | false;
  /** Fenster je Langseite und Vorderseite */
  windows?: number;
  shutters?: boolean;
  chimney?: { x: number; z: number; h?: number; w?: number } | false;
  /** kleines Banner (Spielerfarbe) neben der Tür */
  banner?: boolean;
}

/** Ergebnis: obere Wandkante und Dachfirst (für Aufbauten) */
export interface HouseInfo {
  wallTop: number;
  ridge: number;
  y0: number;
}

/**
 * Wohn-/Werkstatthaus: Sockel, Wände (Putz/Holz/Stein) mit optionalem Fachwerk, Tür, Fenster, Dach mit Firstbalken,
 * Schornstein. Alle Maße im Gebäudeinneren; die Front zeigt nach +z.
 */
export function house(b: ModelBuilder, o: HouseOpts): HouseInfo {
  const x = o.x ?? 0;
  const z = o.z ?? 0;
  const ph = o.plinth ?? 0.14;
  const y0 = (o.y ?? 0) + ph;
  if (ph > 0) plinth(b, o.w, o.d, x, z, ph, BP.stoneDark, 0.05);
  b.det(0).surf(o.wallSurf ?? SURF.Plaster).box(o.w, o.h, o.d, x, y0, z, o.wall).surf(0);
  const top = y0 + o.h;
  // Dach
  const r = o.roof;
  const kind = r.kind ?? 'gable';
  const rw = r.ridgeX ? o.d : o.w;
  const rd = r.ridgeX ? o.w : o.d;
  const rot = r.ridgeX ? Math.PI / 2 : 0;
  if (kind === 'gable') gableRoof(b, { w: rw, d: rd, x, z, y: top, rise: r.rise, color: r.color, surf: r.surf, over: r.over, rotY: rot, ridgeTeam: r.teamRidge, ridge: r.teamRidge ? BP.white : BP.woodDark });
  else if (kind === 'hip') hipRoof(b, { w: o.w, d: o.d, x, z, y: top, rise: r.rise, color: r.color, surf: r.surf, over: r.over });
  else shedRoof(b, { w: o.w, d: o.d, x, z, y: top, rise: r.rise, color: r.color, surf: r.surf, over: r.over });
  // Fachwerk, Tür, Fenster je Seite
  const doorO = o.door === false ? null : (o.door ?? {});
  const doorFace = doorO ? (doorO.face ?? 0) : -1;
  const faceLen = (f: number): number => (f & 1 ? o.d : o.w);
  const faceN = (f: number): number => (f & 1 ? o.w : o.d) / 2;
  for (let f = 0; f < 4; f++) {
    const len = faceLen(f);
    const n = faceN(f);
    // Seitenmitte im Weltkoordinatensystem: Versatz (x, z) in Seitenkoordinaten umrechnen
    const du = f === 0 ? x : f === 1 ? -z : f === 2 ? -x : z;
    const dn = f === 0 ? z : f === 1 ? x : f === 2 ? -z : -x;
    const nn = n + dn;
    const wantTimber = o.timber === 'all' || (o.timber === 'ends' && (f & 1) === 0);
    const hasDoor = doorO && doorFace === f;
    const dW = doorO?.w ?? 0.34;
    const dH = doorO?.h ?? Math.min(o.h * 0.78, 0.62);
    const doorU = hasDoor ? (doorO!.u ?? -len / 4) : 0;
    const wins: number[] = [];
    if (o.h > 0.5) {
      if (hasDoor) {
        if (len > 1.1) wins.push(doorU <= 0 ? len / 4 : -len / 4);
      } else {
        const cnt = f & 1 ? (o.windows ?? 1) : len > 1.5 ? 2 : 1;
        for (let i = 0; i < cnt; i++) wins.push(-len / 2 + ((i + 0.5) / cnt) * len);
      }
    }
    if (wantTimber) {
      const nb = Math.max(2, Math.round(len / 0.9));
      const skip: number[] = [];
      for (const u of [...wins, ...(hasDoor ? [doorU] : [])]) skip.push(Math.min(nb - 1, Math.max(0, Math.floor(((u + len / 2) / len) * nb))));
      // Fachwerk liegt auf der Wandfläche; (du, nn) → Seitenkoordinaten mit Versatz
      timberFace(b, f, len, y0, o.h, nn, o.timberColor ?? BP.woodDark, nb, skip, du);
    }
    if (hasDoor) {
      doorOn(b, f, doorU + du, y0, nn, dW, dH, { arch: doorO!.arch, step: doorO!.step, leaf: doorO!.leaf });
      if (o.banner) banner(b, f, doorU + du + (doorU < 0 ? dW + 0.28 : -dW - 0.28), y0 + o.h - 0.08, nn, 0.22, 0.5);
    }
    for (const u of wins) {
      const wh = Math.min(0.34, o.h * 0.42);
      windowOn(b, f, u + du, y0 + o.h * 0.5 - wh * 0.15, nn, 0.22, wh, { shutters: o.shutters });
    }
  }
  if (o.chimney) chimney(b, o.chimney.x, top - 0.2, o.chimney.z, r.rise + 0.5, o.chimney.w ?? 0.28);
  void facePos;
  void FACE_ROT;
  return { wallTop: top, ridge: top + r.rise, y0 };
}

