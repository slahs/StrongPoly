/**
 * Bus-Graph: Kanäle (effects / music / advisor / ui) mit je eigenem Gain und Kompressor,
 * danach Master-Gain, Limiter und ein Sichtbarkeits-Gain (Tab verborgen → leise).
 */
import { volumeCurve } from './mix';

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  /** Berater-Stimme und Meldungstöne */
  advisor: number;
  /** Einheiten- und Bewohnerstimmen */
  voice: number;
  /** Umgebungsgeräusche (Wind, Wasser, Vögel, Siedlung, Werkstätten …) */
  ambient: number;
  musicOn: boolean;
  muted: boolean;
  /** Untertitel zu gesprochenen Zeilen */
  subtitles: boolean;
  /** Browser-Sprachausgabe, wenn zu einer Zeile kein Clip vorliegt */
  ttsFallback: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = {
  master: 0.8,
  sfx: 0.8,
  music: 0.5,
  advisor: 0.8,
  voice: 0.8,
  ambient: 0.6,
  musicOn: true,
  muted: false,
  subtitles: false,
  ttsFallback: true,
};

export type Channel = 'effects' | 'music' | 'advisor' | 'ui' | 'voice' | 'ambient';

export interface Bus {
  /** Eingänge der Kanäle (Quellen verbinden sich hiermit) */
  input: Record<Channel, GainNode>;
  /** Pegelregler der Kanäle (nach dem Eingang) */
  level: Record<Channel, GainNode>;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  vis: GainNode;
}

function compressor(ctx: BaseAudioContext, threshold: number, ratio: number, attack: number, release: number, knee: number): DynamicsCompressorNode {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.ratio.value = ratio;
  c.attack.value = attack;
  c.release.value = release;
  c.knee.value = knee;
  return c;
}

export function createBus(ctx: BaseAudioContext, dest: AudioNode = ctx.destination): Bus {
  const vis = ctx.createGain();
  vis.connect(dest);
  const limiter = compressor(ctx, -3, 20, 0.002, 0.12, 0);
  limiter.connect(vis);
  const master = ctx.createGain();
  master.connect(limiter);
  const input = {} as Record<Channel, GainNode>;
  const level = {} as Record<Channel, GainNode>;
  const cfg: Record<Channel, [number, number]> = {
    effects: [-16, 5],
    music: [-20, 3],
    advisor: [-18, 4],
    ui: [-18, 4],
    voice: [-18, 4],
    ambient: [-22, 3],
  };
  for (const ch of Object.keys(cfg) as Channel[]) {
    const inp = ctx.createGain();
    const comp = compressor(ctx, cfg[ch][0], cfg[ch][1], 0.004, 0.18, 12);
    const lvl = ctx.createGain();
    inp.connect(comp).connect(lvl).connect(master);
    input[ch] = inp;
    level[ch] = lvl;
  }
  return { input, level, master, limiter, vis };
}

/** Wendet die Reglerstellungen auf den Bus an (weich, ohne Knacken). */
export function applyLevels(bus: Bus, s: AudioSettings, ctx: BaseAudioContext, instant = false): void {
  const t = ctx.currentTime;
  const set = (p: AudioParam, v: number): void => {
    if (instant) p.setValueAtTime(v, t);
    else p.setTargetAtTime(v, t, 0.04);
  };
  set(bus.master.gain, s.muted ? 0 : volumeCurve(s.master) * 1.5);
  set(bus.level.effects.gain, volumeCurve(s.sfx));
  set(bus.level.ui.gain, volumeCurve(s.sfx));
  set(bus.level.advisor.gain, volumeCurve(s.advisor));
  set(bus.level.voice.gain, volumeCurve(s.voice));
  set(bus.level.ambient.gain, volumeCurve(s.ambient));
  set(bus.level.music.gain, s.musicOn ? volumeCurve(s.music) : 0);
}
