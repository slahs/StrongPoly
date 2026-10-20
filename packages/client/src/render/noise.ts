import { hash2 } from '@strongpoly/shared';

/**
 * Prozedurale, kachelbare Rauschtexturen (keine Bilddateien). Die Daten werden einmal beim Start berechnet
 * (deterministisch) und als kleine RGBA8-Texturen mit Mipmaps hochgeladen:
 *
 *  - Textur A (Gelände/Material): R großflächige Variation, G mittlere Variation, B Risse/Grate (Ridged), A feines Korn
 *  - Textur N (Wasser): R/G Gradient (Wellennormale), B Höhe, A Schaum-Aufbruch
 *
 * Alles ist periodisch (nahtlos wiederholbar), damit sich keine Kanten zeigen.
 */
export const NOISE_SIZE = 256;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

const latticeCache = new Map<string, Float32Array>();
/** Gitterwerte (Periode p x p) einer Lage; werden je (Seed, Periode) einmal berechnet */
function lattice(seed: number, p: number): Float32Array {
  const key = `${seed}|${p}`;
  let a = latticeCache.get(key);
  if (!a) {
    a = new Float32Array(p * p);
    for (let y = 0; y < p; y++) for (let x = 0; x < p; x++) a[y * p + x] = hash2(seed, x, y);
    latticeCache.set(key, a);
  }
  return a;
}

/** periodisches Gitter-Value-Noise: u,v in Einheiten von Gitterzellen, Periode p Zellen */
export function periodicNoise(seed: number, u: number, v: number, p: number): number {
  const xi = Math.floor(u);
  const yi = Math.floor(v);
  const fx = smooth(u - xi);
  const fy = smooth(v - yi);
  const x0 = ((xi % p) + p) % p;
  const y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const g = lattice(seed, p);
  const a = g[y0 * p + x0];
  const b = g[y0 * p + x1];
  const c = g[y1 * p + x0];
  const d = g[y1 * p + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** periodisches fBm: Grundperiode p, jede Oktave verdoppelt Frequenz und Periode; Ergebnis 0..1 */
export function periodicFbm(seed: number, x: number, y: number, p: number, octaves: number): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let per = p;
  for (let o = 0; o < octaves; o++) {
    sum += periodicNoise(seed + o * 131, x * per, y * per, per) * amp;
    norm += amp;
    amp *= 0.5;
    per *= 2;
  }
  return sum / norm;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const byte = (v: number): number => Math.round(clamp01(v) * 255);

/** Textur A (Gelände/Material), RGBA8, size x size */
export function genNoiseA(size = NOISE_SIZE, seed = 1234): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = i / size;
      const y = j / size;
      const macro = periodicFbm(seed, x, y, 4, 4);
      const mid = periodicFbm(seed + 11, x, y, 16, 3);
      // Risse: 1 - |2n - 1| (scharfe Grate), zweilagig
      const r1 = 1 - Math.abs(periodicFbm(seed + 23, x, y, 6, 3) * 2 - 1);
      const r2 = 1 - Math.abs(periodicFbm(seed + 29, x, y, 12, 2) * 2 - 1);
      const ridge = clamp01(r1 * r1 * 0.65 + r2 * r2 * 0.45);
      // Korn: 12 bzw. 24 Zellen je Periode (bei einer Wiederholung auf ~3 Feldern also 4-8 Zellen je Feld, kein Pixelrauschen)
      const grain = periodicNoise(seed + 41, x * 12, y * 12, 12) * 0.6 + periodicNoise(seed + 43, x * 24, y * 24, 24) * 0.4;
      const k = (j * size + i) * 4;
      out[k] = byte(macro);
      out[k + 1] = byte(mid);
      out[k + 2] = byte(ridge);
      out[k + 3] = byte(grain);
    }
  return out;
}

/** Textur N (Wasser): Gradient-Normale (R,G), Höhe (B), Schaum-Aufbruch (A) */
export function genNoiseN(size = NOISE_SIZE, seed = 777): Uint8Array<ArrayBuffer> {
  const h = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) h[j * size + i] = periodicFbm(seed, i / size, j / size, 8, 4);
  const out = new Uint8Array(size * size * 4);
  const at = (i: number, j: number): number => h[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      // zentrale Differenzen; Skalierung so, dass typische Gradienten im Bereich ±1 landen
      const gx = (at(i + 1, j) - at(i - 1, j)) * 7;
      const gy = (at(i, j + 1) - at(i, j - 1)) * 7;
      const foam = periodicFbm(seed + 91, i / size, j / size, 12, 3);
      const k = (j * size + i) * 4;
      out[k] = byte(gx * 0.5 + 0.5);
      out[k + 1] = byte(gy * 0.5 + 0.5);
      out[k + 2] = byte(h[j * size + i]);
      out[k + 3] = byte(foam);
    }
  return out;
}
