import * as THREE from 'three';
import { ModelBuilder } from './builder';
import { BP } from './building_palette';

/** Höhe eines Gerüststockwerks (Pfosten bis Belag) */
export const SCAFFOLD_TIER = 1.05;

/**
 * Gerüstmodul: ein Tile breit, Pfosten bei x=0, Ausleger entlang +x, Belag nach innen (+z).
 * Stockwerke werden im Renderer übereinander gesetzt; nur das oberste wächst in y (kein harter Sprung).
 * Bewusst licht gehalten, damit man das wachsende Gebäude dahinter sieht.
 */
export function scaffoldTierGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0, jitter: 0.04 });
  const T = SCAFFOLD_TIER;
  b.box(0.06, T + 0.08, 0.06, 0, 0, 0, BP.woodDark);
  // obere Längslatte außen, Strebe, schmaler Belag nach innen
  b.box(1.0, 0.045, 0.045, 0.5, T - 0.05, 0, BP.wood);
  b.beam(0.03, 0.08, 0, 0.97, T - 0.08, 0, 0.032, BP.woodDark);
  b.box(0.98, 0.04, 0.22, 0.5, T - 0.085, 0.13, BP.woodLight);
  b.box(0.07, 0.07, 0.07, 0.0, 0.5, 0, BP.clothDark);
  return b.build().body;
}

/** Fundament eines Bauplatzes: Erdplatte 1x1 mit Steinrand, Schnurpflöcken (im Renderer je Tile gesetzt) */
export function groundworkGeo(): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0, jitter: 0.06 });
  b.box(0.98, 0.05, 0.98, 0, 0, 0, BP.soilDark);
  b.box(0.84, 0.03, 0.84, 0, 0.05, 0, BP.soil);
  // Rand aus Steinen und Balken
  b.box(0.98, 0.09, 0.1, 0, 0.0, -0.44, BP.stoneDark);
  b.box(0.1, 0.09, 0.98, -0.44, 0.0, 0, BP.stoneDark);
  b.box(0.98, 0.07, 0.08, 0, 0.0, 0.45, BP.woodDark);
  b.box(0.08, 0.07, 0.98, 0.45, 0.0, 0, BP.woodDark);
  b.boulder(0.06, 0.04, 0.05, 0.2, 0.09, -0.4, 4, BP.stone);
  b.boulder(0.05, 0.04, 0.06, -0.4, 0.09, 0.15, 7, BP.stoneMid);
  return b.build().body;
}

/** Baumaterial am Boden: Holz (Bretter, Balken, Fass) oder Stein (Quader, Kalksäcke) */
export function materialPileGeo(wood: boolean): THREE.BufferGeometry {
  const b = new ModelBuilder({ ao: 0.2, aoH: 0.3, jitter: 0.06 });
  if (wood) {
    for (let l = 0; l < 4; l++) b.box(0.5, 0.05, 0.22 - (l % 2) * 0.03, 0, l * 0.055, 0, l % 2 ? BP.woodLight : BP.wood, false, 0.15);
    for (let i = 0; i < 3; i++) b.cyl(0.07, 0.07, 0.5, 6, -0.12 + i * 0.12, 0.07, 0.26 + (i % 2) * 0.1, i % 2 ? BP.wood : BP.woodDark);
    b.cyl(0.12, 0.12, 0.28, 8, -0.38, 0, -0.1, BP.woodDark);
    b.box(0.3, 0.05, 0.1, 0.1, 0.25, 0.0, BP.woodLight, false, -0.4);
  } else {
    for (let i = 0; i < 5; i++) b.box(0.26 - (i % 3) * 0.04, 0.16, 0.2, Math.cos(i * 2.4) * 0.14, i > 2 ? 0.16 : 0, Math.sin(i * 2.4) * 0.12, i % 2 ? BP.stone : BP.stoneMid, false, i);
    b.cyl(0.07, 0.11, 0.2, 6, 0.32, 0, 0.1, BP.cloth);
    b.cyl(0.07, 0.11, 0.2, 6, 0.2, 0, 0.3, BP.clothDark);
    b.box(0.22, 0.14, 0.14, -0.3, 0, 0.2, BP.stoneLight, false, 0.5);
  }
  return b.build().body;
}
