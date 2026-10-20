import { BT } from '@strongpoly/shared';

/** Dauerhafte Effekte an Gebäuden: Schornsteine, Dampf, Feuerstellen (Positionen im Modellraum). */
export interface Emitter {
  x: number;
  y: number;
  z: number;
  kind: 'smoke' | 'smokeDark' | 'steam' | 'flame' | 'sparks';
  /** Partikel pro Sekunde */
  rate: number;
  /** nur wenn ein Arbeiter anwesend ist (sonst immer) */
  staffed: boolean;
}

const stack = (x: number, y: number, z: number, kind: Emitter['kind'], rate: number, staffed = true): Emitter => ({ x, y, z, kind, rate, staffed });

export const EMITTERS: Record<number, Emitter[]> = {
  [BT.Hovel]: [stack(0.3, 1.42, 0, 'smoke', 0.45, false)],
  [BT.Campfire]: [stack(0, 0.35, 0, 'flame', 5, false), stack(0, 0.7, 0, 'smoke', 0.8, false)],
  [BT.Bakery]: [stack(0.7, 1.95, -0.3, 'smoke', 2.2)],
  [BT.Blacksmith]: [stack(0.75, 1.85, -0.45, 'smokeDark', 2.4), stack(0.75, 1.85, -0.45, 'sparks', 1.4)],
  [BT.Armorer]: [stack(0.75, 1.85, -0.45, 'smokeDark', 2.0), stack(0.75, 1.85, -0.45, 'sparks', 1.0)],
  [BT.Tanner]: [stack(0.75, 1.85, -0.45, 'smoke', 1.1)],
  [BT.Fletcher]: [stack(0.75, 1.85, -0.45, 'smoke', 0.8)],
  [BT.Poleturner]: [stack(0.75, 1.85, -0.45, 'smoke', 0.8)],
  [BT.Brewery]: [stack(-1.0, 1.0, 1.0, 'steam', 1.6)],
  [BT.PitchRig]: [stack(0.6, 0.45, 0.5, 'smokeDark', 1.6)],
  [BT.Cauldron]: [stack(0, 1.9, 0, 'steam', 1.2, false)],
  [BT.PitchDitch]: [stack(0, 0.1, 0, 'smokeDark', 0.22, false)],
};

/** Bauwerke, deren Mündung/Feuer beim Brand höher liegt (Dachhöhe) kommen aus BuildingDef.height */
