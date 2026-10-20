/**
 * Offline-Rendering der Synthese (OfflineAudioContext) für Prüfungen ohne Lautsprecher:
 * Spitzenpegel, Effektivwert, NaN-/Stille-Erkennung je Effekt, Einheitenton und Musikstimmung.
 */
import { CommandKind, VoiceClass } from './classes';
import { Ambience, birdCall, crackle, distantClash } from './ambience';
import { AmbienceTargets, computeAmbience, QUIET_INPUT, SILENT_TARGETS } from './ambience_logic';
import { applyLevels, createBus, DEFAULT_AUDIO } from './engine';
import { MusicPlayer } from './music';
import { SFX, SFX_IDS, SfxId } from './sfx';
import { Env, noiseBuffer } from './synth';
import { mulberry32, MoodId, THEME_PHRASES } from './theory';
import { playUnitVoice } from './voices';

export interface RenderStat {
  id: string;
  seconds: number;
  /** Spitzenpegel der rohen Synthese (vor dem Bus) */
  peak: number;
  rms: number;
  /** Spitzenpegel nach Kanal-Kompressor und Limiter */
  busPeak: number;
  nan: boolean;
  silent: boolean;
  ok: boolean;
}

const SR = 44100;

function analyse(buf: AudioBuffer, from: number, to: number): { peak: number; rms: number; nan: boolean } {
  let peak = 0;
  let sum = 0;
  let nan = false;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) {
        nan = true;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (i >= from && i < to) {
        sum += v * v;
        n++;
      }
    }
  }
  return { peak, rms: n ? Math.sqrt(sum / n) : 0, nan };
}

type Builder = (env: Env, ctx: OfflineAudioContext) => number;

async function renderTwice(id: string, seconds: number, build: Builder): Promise<RenderStat> {
  const out: { dur: number; raw: ReturnType<typeof analyse>; bus: ReturnType<typeof analyse> }[] = [];
  for (const viaBus of [false, true]) {
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
    let dest: AudioNode = ctx.destination;
    if (viaBus) {
      const bus = createBus(ctx);
      applyLevels(bus, DEFAULT_AUDIO, ctx, true);
      dest = bus.input.effects;
    }
    const env: Env = { ctx, out: dest, noise: noiseBuffer(ctx), rand: mulberry32(1234) };
    const dur = build(env, ctx);
    const buf = await ctx.startRendering();
    const a = analyse(buf, 0, Math.min(buf.length, Math.ceil(SR * (dur + 0.2))));
    out.push({ dur, raw: a, bus: a });
  }
  const raw = out[0].raw;
  const bus = out[1].bus;
  const silent = raw.rms < 1e-4 || raw.peak < 1e-3;
  const nan = raw.nan || bus.nan;
  return { id, seconds: out[0].dur, peak: raw.peak, rms: raw.rms, busPeak: bus.peak, nan, silent, ok: !nan && !silent && raw.peak <= 1 && bus.peak <= 1 };
}

export function renderSfx(id: SfxId): Promise<RenderStat> {
  return renderTwice(id, 6, (env) => SFX[id](env, 0.02, {}));
}

export function renderVoice(cls: VoiceClass, mode: 'select' | 'command', kind: CommandKind = 'move'): Promise<RenderStat> {
  return renderTwice(`voice:${cls}:${mode}`, 2, (env) => playUnitVoice(env, 0.02, cls, mode, kind));
}

/** Musik einer Stimmung offline rendern. */
export async function renderMusic(mood: MoodId, seconds = 14, seed = 42): Promise<RenderStat> {
  const stats: ReturnType<typeof analyse>[] = [];
  for (const viaBus of [false, true]) {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    let dest: AudioNode = ctx.destination;
    if (viaBus) {
      const bus = createBus(ctx);
      applyLevels(bus, DEFAULT_AUDIO, ctx, true);
      dest = bus.input.music;
    }
    const player = new MusicPlayer(ctx, dest, seed);
    const theme = mood === 'menu' || mood === 'victory' || mood === 'defeat' ? THEME_PHRASES[mood] : 0;
    player.setTarget(mood, theme, true);
    player.start(0.2, false);
    player.scheduleUntil(seconds);
    const buf = await ctx.startRendering();
    stats.push(analyse(buf, Math.floor(SR * 1), buf.length));
  }
  const [raw, bus] = stats;
  const silent = raw.rms < 1e-4;
  const nan = raw.nan || bus.nan;
  return { id: `music:${mood}`, seconds, peak: raw.peak, rms: raw.rms, busPeak: bus.peak, nan, silent, ok: !nan && !silent && raw.peak <= 1 && bus.peak <= 1 };
}

/** Einzelereignis der Umgebung (Vogel/Gefechtsschlag/Knistern) offline rendern */
export function renderAmbientEvent(kind: 'birdFinch' | 'birdDove' | 'birdTrill' | 'clash' | 'crackle'): Promise<RenderStat> {
  return renderTwice(`ambient:${kind}`, 3, (env) => {
    const r = { birdFinch: 0.1, birdDove: 0.55, birdTrill: 0.9, clash: 0.9, crackle: 0.9 }[kind];
    if (kind.startsWith('bird')) return birdCall(env, 0.05, r, 0.3);
    if (kind === 'clash') return distantClash(env, 0.05, r, 0.5);
    return crackle(env, 0.05, r);
  });
}

/** Klangbetten der Umgebung offline rendern (Pegel nach Bus, Übersteuerung, NaN); `targets` = Zielpegel */
export async function renderAmbience(id: string, targets: AmbienceTargets, seconds = 7): Promise<RenderStat> {
  const stats: ReturnType<typeof analyse>[] = [];
  for (const viaBus of [false, true]) {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    let dest: AudioNode = ctx.destination;
    if (viaBus) {
      const bus = createBus(ctx);
      applyLevels(bus, DEFAULT_AUDIO, ctx, true);
      dest = bus.input.ambient;
    }
    const amb = new Ambience(ctx, dest, noiseBuffer(ctx), mulberry32(7));
    amb.apply(targets, 0, 0.01);
    if (targets.birdsPerMin > 0) for (let i = 0; i < 3; i++) amb.fire({ kind: 'bird', pan: -0.5 + i * 0.5, far: 0.4, r: 0.15 + i * 0.35 }, 1 + i * 1.7);
    if (targets.din > 0) for (let i = 0; i < 4; i++) amb.fire({ kind: 'clash', pan: 0.2, far: 0.6, r: 0.2 + i * 0.2 }, 0.8 + i * 0.5);
    if (targets.fire > 0) for (let i = 0; i < 10; i++) amb.fire({ kind: 'crackle', pan: -0.2, far: 0.1, r: (i * 0.37) % 1 }, 0.5 + i * 0.12);
    const buf = await ctx.startRendering();
    stats.push(analyse(buf, Math.floor(SR * 1), buf.length));
  }
  const [raw, bus] = stats;
  const silent = raw.rms < 1e-5;
  const nan = raw.nan || bus.nan;
  return { id: `ambience:${id}`, seconds, peak: raw.peak, rms: raw.rms, busPeak: bus.peak, nan, silent, ok: !nan && !silent && raw.peak <= 1 && bus.peak <= 1 };
}

/** Prüfbare Lagen der Umgebung: jedes Bett einzeln bei Vollpegel, dazu ein dichtes Gesamtszenario */
export function ambienceScenarios(): { id: string; targets: AmbienceTargets }[] {
  const only = (k: keyof AmbienceTargets): AmbienceTargets => ({ ...SILENT_TARGETS, [k]: 1, birdsPerMin: 0 });
  const dense = computeAmbience({ ...QUIET_INPUT, dist: 14, water: 0.5, waterPan: 0.4, trees: 0.8, open: 0.5, built: 40, folk: 40, markets: 2, fire: 1, firePan: -0.5, farCombat: 6, farCombatPan: 0.3, nearCombat: 0, mood: 'tension' });
  return [
    { id: 'wind', targets: only('wind') },
    { id: 'rustle', targets: only('rustle') },
    { id: 'water', targets: { ...only('water'), waterPan: 0.6 } },
    { id: 'murmur', targets: only('murmur') },
    { id: 'fire', targets: only('fire') },
    { id: 'din', targets: only('din') },
    { id: 'birds', targets: { ...SILENT_TARGETS, wind: 0.2, birdsPerMin: 8 } },
    { id: 'dense', targets: { ...dense, birdsPerMin: 8 } },
  ];
}

export async function renderAll(): Promise<RenderStat[]> {
  const res: RenderStat[] = [];
  for (const id of SFX_IDS) res.push(await renderSfx(id));
  const classes: VoiceClass[] = ['infantry', 'archer', 'cavalry', 'siege', 'worker', 'lord', 'monk', 'special'];
  for (const c of classes) {
    res.push(await renderVoice(c, 'select'));
    res.push(await renderVoice(c, 'command', 'attack'));
  }
  for (const m of ['build', 'tension', 'battle', 'menu', 'victory', 'defeat'] as MoodId[]) res.push(await renderMusic(m));
  for (const k of ['birdFinch', 'birdDove', 'birdTrill', 'clash', 'crackle'] as const) res.push(await renderAmbientEvent(k));
  for (const sc of ambienceScenarios()) res.push(await renderAmbience(sc.id, sc.targets));
  return res;
}
