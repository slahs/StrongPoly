import { BT } from '@strongpoly/shared';

/** Dauerhafte Effekte an Gebäuden: Schornsteine, Dampf, Feuerstellen (Positionen im Modellraum). */
export interface Emitter {
  x: number;
  y: number;
  z: number;
  kind: 'smoke' | 'smokeDark' | 'steam' | 'flame' | 'sparks' | 'dust' | 'chips' | 'flour' | 'anvil';
  /** Partikel pro Sekunde */
  rate: number;
  /** nur wenn ein Arbeiter anwesend ist (sonst immer) */
  staffed: boolean;
}

const stack = (x: number, y: number, z: number, kind: Emitter['kind'], rate: number, staffed = true): Emitter => ({ x, y, z, kind, rate, staffed });

/**
 * Positionen im Modellraum (Mündung des Schornsteins bzw. Arbeitsstelle) – müssen zu den Modellen in
 * models_*.ts passen (Test: Positionen liegen innerhalb der Modellhülle).
 */
export const EMITTERS: Record<number, Emitter[]> = {
  [BT.Hovel]: [stack(0.45, 1.8, -0.4, 'smoke', 0.4, false)],
  [BT.Campfire]: [stack(0, 0.3, 0, 'flame', 5, false), stack(0, 0.75, 0, 'smoke', 0.8, false)],
  [BT.Woodcutter]: [stack(-0.55, 0.42, 0.62, 'chips', 1.4)],
  [BT.Quarry]: [stack(-0.4, 0.95, -0.4, 'dust', 1.6), stack(0.1, 0.8, 0.7, 'dust', 0.9)],
  [BT.IronMine]: [stack(0, 0.5, 1.2, 'dust', 0.9)],
  [BT.PitchRig]: [stack(0.1, 0.25, 0.0, 'smokeDark', 1.4)],
  [BT.WheatFarm]: [stack(2.0, 1.65, -2.0, 'smoke', 0.4, false)],
  [BT.Mill]: [stack(0, 0.75, 1.15, 'flour', 0.9)],
  [BT.Bakery]: [stack(0.95, 1.98, 0.0, 'smoke', 2.2)],
  [BT.Brewery]: [stack(0.9, 2.55, -0.8, 'smoke', 0.9), stack(-1.0, 1.4, 0.95, 'steam', 1.8)],
  [BT.Inn]: [stack(0.8, 3.15, -0.7, 'smoke', 0.9, false)],
  [BT.Fletcher]: [stack(0.2, 2.05, -0.95, 'smoke', 0.8)],
  [BT.Poleturner]: [stack(0.2, 2.05, -0.95, 'smoke', 0.8)],
  [BT.Blacksmith]: [stack(0.9, 2.3, 0.4, 'smokeDark', 2.4), stack(0.0, 0.55, 1.05, 'anvil', 2.2)],
  [BT.Tanner]: [stack(0.2, 2.05, -0.95, 'smoke', 1.1)],
  [BT.Armorer]: [stack(0.55, 2.05, -0.95, 'smokeDark', 2.0), stack(0.0, 0.55, 1.0, 'anvil', 1.6)],
  [BT.Barracks]: [stack(1.1, 3.45, -1.2, 'smoke', 0.7, false)],
  [BT.EngineerGuild]: [stack(-0.9, 3.45, -0.7, 'smoke', 1.0)],
  [BT.Cauldron]: [stack(0, 2.2, 0, 'steam', 1.2, false)],
  [BT.PitchDitch]: [stack(0, 0.1, 0, 'smokeDark', 0.22, false)],
};

/** Bauwerke, deren Mündung/Feuer beim Brand höher liegt (Dachhöhe) kommen aus BuildingDef.height */
