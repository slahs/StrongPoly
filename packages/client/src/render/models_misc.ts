import * as THREE from 'three';
import { PAL } from '@strongpoly/shared';
import { ModelBuilder } from './builder';

/** Fundament eines Bauplatzes: Platte 1x1 (im Renderer auf die Grundfläche skaliert) mit Erdfüllung */
export function foundationGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0 });
  b.box(0.98, 0.1, 0.98, 0, 0, 0, PAL.stoneDark);
  b.box(0.84, 0.03, 0.84, 0, 0.1, 0, PAL.sandDark);
  b.box(0.12, 0.05, 0.84, 0, 0.1, 0, PAL.woodDark);
  return b.build().body;
}

/** Gerüstabschnitt: Pfosten bei x=0, Querlatten entlang +x (Länge 1); Höhe 1, im Renderer in y skaliert */
export function scaffoldGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0 });
  b.box(0.08, 1, 0.08, 0, 0, 0, PAL.woodDark);
  for (const y of [0.3, 0.64, 0.98]) b.box(1, 0.045, 0.07, 0.5, y - 0.02, 0, PAL.wood);
  b.box(0.04, 0.04, 0.04, 0.5, 0.98, 0, PAL.black);
  // Querstrebe
  b.box(1.05, 0.04, 0.04, 0.5, 0.45, 0, PAL.woodDark, false, 0.0);
  return b.build().body;
}

/** Trümmerhaufen eines Tiles: Steinbrocken (stone) oder zersplitterte Balken (wood) */
export function rubbleGeo(wood: boolean): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.4, aoH: 0.4 });
  if (wood) {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const x = Math.cos(a) * 0.28;
      const z = Math.sin(a * 1.3) * 0.28;
      b.box(0.1 + (i % 3) * 0.04, 0.08, 0.5 - (i % 4) * 0.07, x, 0.02 + (i % 3) * 0.06, z, i % 2 ? PAL.wood : PAL.woodDark, false, a);
    }
    b.boulder(0.2, 0.1, 0.2, 0.0, 0.05, 0.0, 3, PAL.black);
  } else {
    const cols = [PAL.stone, PAL.stoneDark, PAL.stone, PAL.rockDark, PAL.stone];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.2;
      const r = 0.18 + (i % 3) * 0.12;
      const s = 0.1 + (i % 4) * 0.045;
      b.boulder(s * 1.2, s, s * 1.1, Math.cos(a) * r, s * 0.6, Math.sin(a) * r, 5 + i, cols[i % cols.length]);
    }
    b.boulder(0.2, 0.17, 0.2, 0, 0.1, 0, 33, PAL.stone);
  }
  return b.build().body;
}

export function arrowGeo(kind: 'arrow' | 'bolt' | 'fire'): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0 });
  const t = kind === 'bolt' ? 1.5 : 1;
  b.box(0.03 * t, 0.03 * t, kind === 'bolt' ? 0.4 : 0.55, 0, -0.015 * t, 0.0, kind === 'fire' ? PAL.woodDark : PAL.wood);
  b.spike(0.045 * t, 0.14, 0, 0, 0.27, kind === 'fire' ? PAL.roof : PAL.stoneDark);
  // Befiederung kreuzweise
  b.box(0.1, 0.012, 0.1, 0, -0.006, -0.22, PAL.white);
  b.box(0.012, 0.1, 0.1, 0, -0.05, -0.22, PAL.white);
  if (kind === 'fire') b.box(0.05, 0.05, 0.12, 0, -0.025, 0.2, PAL.gold);
  return b.build().body;
}

export function stoneGeo(big: boolean): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0 });
  b.boulder(0.2, 0.17, 0.19, 0, 0, 0, big ? 9 : 4, big ? PAL.stoneDark : PAL.stone);
  if (big) b.boulder(0.12, 0.1, 0.12, 0.14, 0.08, 0.04, 14, PAL.rockDark);
  return b.build().body;
}

export function flameGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0 });
  b.cone(0.24, 0.62, 5, 0, 0, 0, PAL.roof);
  b.cone(0.16, 0.5, 5, 0.04, 0.04, 0.02, PAL.gold);
  b.cone(0.09, 0.34, 4, -0.05, 0.08, -0.03, PAL.white);
  return b.build().body;
}
