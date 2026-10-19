import { ClientWorld, HEIGHT_STEP, T } from '@strongpoly/shared';

export function tileY(w: ClientWorld, tx: number, ty: number): number {
  const m = w.map;
  if (tx < 0) tx = 0;
  else if (tx >= m.w) tx = m.w - 1;
  if (ty < 0) ty = 0;
  else if (ty >= m.h) ty = m.h - 1;
  const i = ty * m.w + tx;
  const t = m.terrain[i];
  if (t === T.Water) return -0.25;
  if (t === T.Moat) return m.height[i] * HEIGHT_STEP - 0.3;
  return m.height[i] * HEIGHT_STEP;
}

export function groundYAt(w: ClientWorld, x: number, y: number): number {
  return tileY(w, Math.floor(x), Math.floor(y));
}

/** Ressourcenfarben für getragene Waren */
export const RES_COLORS: number[] = [
  0x6b4a2b, // Holz
  0xb9b4aa, // Stein
  0x24211e, // Eisen
  0x2a2622, // Pech
  0x6fae4a, // Hopfen
  0xa97c45, // Bier
  0xd9b84e, // Weizen
  0xf2ede0, // Mehl
  0xf2ede0, // Kuh
  0xb0452f, // Äpfel
  0xf0c040, // Käse
  0xb0452f, // Fleisch
  0xd1b073, // Brot
  0xa97c45,
  0x7d5a30,
  0x7d5a30,
  0x7d5a30,
  0x8e897f,
  0xb9b4aa,
  0xa97c45,
  0x8e897f,
];
