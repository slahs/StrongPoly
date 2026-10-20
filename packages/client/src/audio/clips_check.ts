/**
 * Prüfung der Sprachclips im Browser (Debug-Hook `window.__audio.checkClips()`): lädt jedes Clip des Sprachpakets,
 * dekodiert es (decodeAudioData auf einem OfflineAudioContext, braucht keine Nutzergeste) und misst Länge, Spitzenpegel,
 * Effektivwert, Stille-Anteil und NaN. Vergleicht die Länge mit dem Manifest.
 */
import { getLang } from '@strongpoly/shared';
import { ClipRegistry } from './clips';
import type { AudioEngine } from './index';

export interface ClipCheckRow {
  key: string;
  voice: string;
  seconds: number;
  manifestSeconds: number;
  peak: number;
  rmsDb: number;
  quiet: number;
  nan: boolean;
  ok: boolean;
}

export interface ClipCheckResult {
  lang: string;
  manifest: boolean;
  count: number;
  ok: number;
  problems: ClipCheckRow[];
  totalSeconds: number;
  /** Spitzenwerte über alle Clips */
  maxPeak: number;
  minRmsDb: number;
  maxRmsDb: number;
  /** je Stimme: Anzahl, mittlere Dauer, mittlerer Pegel (dB RMS) */
  perVoice: Record<string, { n: number; meanSeconds: number; meanRmsDb: number }>;
  ms: number;
}

export async function checkClips(_audio: AudioEngine, voices?: string[], lang = getLang()): Promise<ClipCheckResult> {
  const t0 = performance.now();
  const ctx = new OfflineAudioContext(1, 1, 22050);
  const reg = new ClipRegistry((d) => ctx.decodeAudioData(d));
  const man = await reg.ensure(lang);
  const res: ClipCheckResult = { lang, manifest: !!man, count: 0, ok: 0, problems: [], totalSeconds: 0, maxPeak: 0, minRmsDb: 0, maxRmsDb: -200, perVoice: {}, ms: 0 };
  if (!man) return res;
  res.minRmsDb = 200;
  const keys = Object.keys(man.clips).filter((k) => !voices || voices.includes(man.clips[k].v));
  for (const key of keys) {
    const e = man.clips[key];
    const buf = await reg.buffer(lang, key);
    const row: ClipCheckRow = { key, voice: e.v, seconds: 0, manifestSeconds: e.d, peak: 0, rmsDb: -200, quiet: 1, nan: false, ok: false };
    if (buf) {
      const d = buf.getChannelData(0);
      let peak = 0;
      let sum = 0;
      let n = 0;
      let quiet = 0;
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        if (!Number.isFinite(v)) {
          row.nan = true;
          continue;
        }
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a < 0.005) quiet++;
        if (a > 0.02) {
          sum += v * v;
          n++;
        }
      }
      row.seconds = buf.duration;
      row.peak = peak;
      row.rmsDb = n ? 20 * Math.log10(Math.sqrt(sum / n)) : -200;
      row.quiet = d.length ? quiet / d.length : 1;
      row.ok = !row.nan && peak > 0.2 && peak < 0.999 && row.rmsDb > -32 && row.rmsDb < -10 && Math.abs(buf.duration - e.d) < 0.2 && row.quiet < 0.7;
    }
    res.count++;
    if (row.ok) res.ok++;
    else res.problems.push(row);
    res.totalSeconds += row.seconds;
    res.maxPeak = Math.max(res.maxPeak, row.peak);
    if (row.rmsDb > -200) {
      res.minRmsDb = Math.min(res.minRmsDb, row.rmsDb);
      res.maxRmsDb = Math.max(res.maxRmsDb, row.rmsDb);
    }
    const pv = (res.perVoice[e.v] ??= { n: 0, meanSeconds: 0, meanRmsDb: 0 });
    pv.n++;
    pv.meanSeconds += row.seconds;
    pv.meanRmsDb += row.rmsDb;
  }
  for (const pv of Object.values(res.perVoice)) {
    pv.meanSeconds = Math.round((pv.meanSeconds / pv.n) * 100) / 100;
    pv.meanRmsDb = Math.round((pv.meanRmsDb / pv.n) * 10) / 10;
  }
  res.totalSeconds = Math.round(res.totalSeconds * 10) / 10;
  res.ms = Math.round(performance.now() - t0);
  return res;
}
