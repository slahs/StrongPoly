import type { QualityCfg } from '../quality';

/**
 * LOD-Wahl der GLB-Assets nach Kameraabstand mit Hysterese (reine Funktionen, testbar).
 * Grenzen: LOD0 bis d01, LOD1 bis d12, dahinter LOD2 – je Asset mit einem Größenfaktor skaliert (große Gebäude
 * behalten ihr Detail länger). `min` sperrt feinere Stufen (Niedrig: nie LOD0).
 */
export interface LodCfg {
  d01: number;
  d12: number;
  /** Breite der Hysterese (Einheiten) um jede Grenze */
  hyst: number;
  /** feinste erlaubte Stufe (0 = LOD0) */
  min: number;
}

/** Abstand Kamera → Objekt in Spiel-Einheiten; Spielkamera 10..110, Standard ~34 */
export function lodCfgOf(q: Pick<QualityCfg, 'assetLod0' | 'assetLod1' | 'assetLods'>): LodCfg {
  return { d01: q.assetLod0, d12: q.assetLod1, hyst: 3, min: Math.max(0, 3 - q.assetLods) };
}

/** Größenfaktor der LOD-Grenzen aus der Diagonale der Bounding-Box (Brunnen ~0,7, Bergfried ~2) */
export function lodScale(diag: number, override?: number): number {
  if (override && override > 0) return override;
  return Math.min(2.2, Math.max(0.7, diag / 3.2));
}

/**
 * Neue LOD-Stufe. `prev` = bisherige Stufe (-1 = neu, ohne Hysterese), `dist` = Abstand, `n` = Anzahl Stufen.
 * Hysterese: gröber wird erst ab Grenze + hyst, feiner erst unter Grenze − hyst (kein Flackern an der Grenze).
 */
export function pickLod(prev: number, dist: number, cfg: LodCfg, scale = 1, n = 3): number {
  const t = [cfg.d01 * scale, cfg.d12 * scale];
  let raw = dist < t[0] ? 0 : dist < t[1] ? 1 : 2;
  if (prev >= 0 && prev !== raw) {
    if (raw > prev) {
      // gröber: nur wenn deutlich jenseits der Grenze zwischen prev und prev+1
      let k = prev;
      while (k < raw && dist > t[k] + cfg.hyst) k++;
      raw = k;
    } else {
      let k = prev;
      while (k > raw && dist < t[k - 1] - cfg.hyst) k--;
      raw = k;
    }
  }
  raw = Math.max(raw, cfg.min);
  return Math.min(raw, n - 1);
}
