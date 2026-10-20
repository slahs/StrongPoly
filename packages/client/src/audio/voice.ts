/**
 * Sprachsystem (Meilenstein 4D): spricht Zeilen von Einheiten, Bewohnern und Berater.
 * Implementiert den Vertrag `VoiceApi` (voice_api.ts); die Engine hängt es als `AudioEngine.voice` an.
 *
 * Reihenfolge je Zeile: Tor (Entprellung/Priorität, voice_logic.ts) → Clip aus dem Register (vorab erzeugte Sprachdatei) →
 * ohne Clip Browser-Sprachausgabe (Ersatz, abschaltbar) → sonst stumm (Rückgabe false, `lastDrop = 'unavailable'`).
 * Einheiten sind räumlich (Entfernung, Dämpfung, Pan), der Berater nicht. Untertitel optional (Overlay + `onSubtitle`).
 */
import { getLang, parseVoiceKey, VOICE_PROFILES, voiceLines, VoiceEvent, voiceText } from '@strongpoly/shared';
import { Bus, AudioSettings } from './engine';
import { ClipRegistry, ClipStats } from './clips';
import { Listener, spatialize, volumeCurve } from './mix';
import { SubtitleOverlay } from './subtitles';
import type { SpeakRequest, VoiceApi } from './voice_api';
import { DropReason, estimateDurationMs, GateReq, LinePicker, VoiceCategory, VoiceGate } from './voice_logic';

/** Was das Sprachsystem von der Engine braucht */
export interface VoiceHost {
  isReady(): boolean;
  settings(): AudioSettings;
  ctx(): AudioContext | null;
  bus(): Bus | null;
  listener(): Listener;
}

interface Running {
  id: number;
  category: VoiceCategory;
  cancelled: boolean;
  stop: () => void;
}

export interface VoiceLogEntry {
  key: string;
  text: string;
  mode: 'clip' | 'tts' | 'text';
  voice: string;
  lang: string;
  at: number;
}

export type LastDrop = DropReason | 'unavailable' | 'muted' | 'far' | 'not-ready' | 'no-text' | null;

const MAX_LATE_MS = { player: 1100, ambient: 2200, advisor: 4000 };

export class VoiceSystem implements VoiceApi {
  onSubtitle: ((text: string, voice: string) => void) | null = null;
  readonly gate = new VoiceGate();
  readonly picker = new LinePicker();
  readonly overlay = new SubtitleOverlay();
  clips: ClipRegistry | null = null;
  lastDrop: LastDrop = null;
  /** Diagnose */
  readonly stats = { clip: 0, tts: 0, textOnly: 0, drops: 0, interrupted: 0, queued: 0 };
  readonly log: VoiceLogEntry[] = [];
  private running = new Map<number, Running>();
  private lastReq = new Map<string, SpeakRequest>();
  private queuedReq = new Map<string, SpeakRequest>();
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private prefetched = false;

  constructor(private host: VoiceHost) {}

  // ---------------------------------------------------------------------------------------
  // Einrichtung

  /** Nach Autoplay-Freigabe: Clip-Register anlegen, Manifest der aktuellen Sprache laden, häufige Clips vorladen. */
  init(): void {
    const ctx = this.host.ctx();
    if (!ctx || this.clips) return;
    this.clips = new ClipRegistry((data) => ctx.decodeAudioData(data));
    void this.clips.ensure(getLang()).then((m) => {
      if (!m || this.prefetched) return;
      this.prefetched = true;
      setTimeout(() => this.prefetchPack(getLang()), 2500);
    });
  }

  private prefetchPack(lang: string): void {
    const m = this.clips?.manifest(lang);
    if (!m) return;
    const rank = (k: string): number => {
      const e = parseVoiceKey(k)?.event;
      return e === 'select' ? 0 : e === 'move' || e === 'attack' ? 1 : e === undefined ? 0 : 2;
    };
    const keys = Object.keys(m.clips).sort((a, b) => rank(a) - rank(b));
    this.clips?.prefetch(lang, keys, 3);
  }

  // ---------------------------------------------------------------------------------------
  // VoiceApi

  say(req: SpeakRequest, retry = false): boolean {
    const host = this.host;
    const lang = req.lang ?? getLang();
    const category: VoiceCategory = req.voice === 'advisor' ? 'advisor' : 'unit';
    if (!host.isReady()) return this.fail('not-ready');
    if (host.settings().muted) return this.fail('muted');
    const parsed = parseVoiceKey(req.key);
    const text = req.text || voiceText(req.key, lang) || '';
    if (!text) return this.fail('no-text');
    const priority = req.priority ?? (category === 'advisor' ? 1 : 0);

    // Sprache gewechselt (setLang): Manifest der neuen Sprache im Hintergrund nachladen, ab der nächsten Zeile gelten die Clips
    if (this.clips && !this.clips.manifest(lang) && this.clips.stats.manifest !== 'loading') void this.clips.ensure(lang);
    // Manifest noch unterwegs: einmal kurz warten, damit die erste Zeile nicht fälschlich über den Ersatz läuft
    if (!retry && this.clips && this.clips.stats.manifest === 'loading') {
      void this.clips.ensure(lang).then(() => this.say(req, true));
      return true;
    }

    // Entfernung: ferne Hintergrundzeilen werden gar nicht erst eingeplant
    let gain = 1;
    let pan = 0;
    let lowpass = 0;
    if (req.pos && category === 'unit') {
      const sp = spatialize(host.listener(), req.pos.x, req.pos.y);
      if (!sp.audible && priority < 1) return this.fail('far');
      // Spielerrückmeldung bleibt hörbar, wird aber mit Entfernung dumpfer und leiser
      gain = priority >= 1 ? Math.max(sp.gain, 0.5) : sp.gain;
      pan = sp.pan * (priority >= 1 ? 0.6 : 1);
      lowpass = sp.lowpass;
    }

    const gr: GateReq = { category, voice: req.voice, key: req.key, event: parsed?.event, priority };
    return this.start(gr, req, text, lang, { gain, pan, lowpass });
  }

  private start(gr: GateReq, req: SpeakRequest, text: string, lang: string, sp: { gain: number; pan: number; lowpass: number }): boolean {
    const now = performance.now();
    const dec = this.gate.decide(gr, now);
    if (dec.kind === 'drop') {
      this.stats.drops++;
      this.lastDrop = dec.reason;
      return false;
    }
    if (dec.kind === 'queue') {
      this.stats.queued++;
      this.queuedReq.set(req.key, { ...req, text, lang: lang as 'de' | 'en' });
      this.lastReq.set(req.voice, { ...req, text, lang: lang as 'de' | 'en' });
      this.schedulePump();
      return true;
    }
    this.lastReq.set(req.voice, { ...req, text, lang: lang as 'de' | 'en' });
    for (const id of dec.interrupt) {
      this.running.get(id)?.stop();
      this.stats.interrupted++;
    }
    this.lastDrop = null;

    const hit = this.clips?.resolve(lang, req.key, text) ?? null;
    const entry = hit?.entry ?? null;
    const ttsOk = this.host.settings().ttsFallback && typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
    const channel = gr.category === 'advisor' ? 'advisor' : 'voice';
    const quiet = volumeCurve(this.host.settings()[channel === 'advisor' ? 'advisor' : 'voice']) < 0.0005;
    if (!entry && !ttsOk && !this.host.settings().subtitles) {
      this.lastDrop = 'unavailable';
      return false;
    }

    const est = entry ? entry.d * 1000 + 150 : estimateDurationMs(text, VOICE_PROFILES[req.voice]?.browser.rate ?? 1);
    const id = this.gate.begin(gr, now, est);
    let cancelNow: (() => void) | null = null;
    const run: Running = { id, category: gr.category, cancelled: false, stop: () => undefined };
    this.running.set(id, run);
    const finish = (): void => {
      if (!this.running.delete(id)) return;
      this.gate.end(id, performance.now());
      this.schedulePump();
    };
    run.stop = () => {
      run.cancelled = true;
      cancelNow?.();
      finish();
    };
    const late = gr.category === 'advisor' ? MAX_LATE_MS.advisor : gr.priority >= 1 ? MAX_LATE_MS.player : MAX_LATE_MS.ambient;

    const speakText = (): void => {
      if (run.cancelled) return;
      this.emitSubtitle(text, req.voice);
      if (quiet) {
        this.log_(req, text, 'text', lang);
        this.stats.textOnly++;
        setTimeout(finish, est);
        return;
      }
      if (!ttsOk) {
        this.log_(req, text, 'text', lang);
        this.stats.textOnly++;
        setTimeout(finish, est);
        return;
      }
      cancelNow = this.speakTts(text, req.voice, lang, gr.category, sp.gain, finish);
      this.stats.tts++;
      this.log_(req, text, 'tts', lang);
    };

    if (!entry || !this.clips) {
      speakText();
      return true;
    }
    const t0 = now;
    void this.clips.buffer(lang, hit!.key).then((buf) => {
      if (run.cancelled) return;
      if (!buf) return speakText();
      if (performance.now() - t0 > late) return finish();
      this.emitSubtitle(text, req.voice);
      if (quiet) {
        this.log_(req, text, 'text', lang);
        this.stats.textOnly++;
        setTimeout(finish, entry.d * 1000);
        return;
      }
      cancelNow = this.playBuffer(buf, channel, sp, finish);
      this.stats.clip++;
      this.log_(req, text, 'clip', lang);
    });
    return true;
  }

  private playBuffer(buf: AudioBuffer, channel: 'advisor' | 'voice', sp: { gain: number; pan: number; lowpass: number }, done: () => void): () => void {
    const ctx = this.host.ctx()!;
    const bus = this.host.bus()!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = sp.gain * 1.0;
    src.connect(g);
    let tail: AudioNode = g;
    const nodes: AudioNode[] = [src, g];
    if (channel === 'voice') {
      if (sp.lowpass > 0 && sp.lowpass < 13000) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = sp.lowpass;
        f.Q.value = 0.5;
        tail.connect(f);
        tail = f;
        nodes.push(f);
      }
      if (typeof ctx.createStereoPanner === 'function' && Math.abs(sp.pan) > 0.01) {
        const p = ctx.createStereoPanner();
        p.pan.value = sp.pan;
        tail.connect(p);
        tail = p;
        nodes.push(p);
      }
    }
    tail.connect(bus.input[channel]);
    let ended = false;
    const cleanup = (): void => {
      if (ended) return;
      ended = true;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignorieren */
        }
      }
      done();
    };
    src.onended = cleanup;
    src.start(ctx.currentTime + 0.01);
    return () => {
      if (ended) return;
      try {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.025);
        src.stop(ctx.currentTime + 0.1);
      } catch {
        /* ignorieren */
      }
      setTimeout(cleanup, 160);
    };
  }

  private speakTts(text: string, voice: string, lang: string, category: VoiceCategory, spatialGain: number, done: () => void): () => void {
    const synth = speechSynthesis;
    const prof = VOICE_PROFILES[voice] ?? VOICE_PROFILES.advisor;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : 'de-DE';
    u.pitch = Math.max(0.1, Math.min(2, prof.browser.pitch));
    u.rate = Math.max(0.5, Math.min(2, prof.browser.rate));
    const cfg = this.host.settings();
    u.volume = Math.max(0, Math.min(1, cfg.master * (category === 'advisor' ? cfg.advisor : cfg.voice) * Math.min(1, spatialGain)));
    const v = pickBrowserVoice(synth.getVoices(), u.lang, !!prof.browser.female);
    if (v) u.voice = v;
    let finished = false;
    const end = (): void => {
      if (finished) return;
      finished = true;
      done();
    };
    u.onend = end;
    u.onerror = end;
    try {
      synth.speak(u);
    } catch {
      end();
    }
    // Absicherung: manche Browser melden das Ende nie
    const guard = setTimeout(end, estimateDurationMs(text, u.rate) + 2500);
    return () => {
      clearTimeout(guard);
      if (!finished) {
        try {
          synth.cancel();
        } catch {
          /* ignorieren */
        }
      }
    };
  }

  private emitSubtitle(text: string, voice: string): void {
    if (!this.host.settings().subtitles) return;
    const label = VOICE_PROFILES[voice]?.label ?? voice;
    this.overlay.show(text, label, voice === 'advisor' ? 'advisor' : 'unit');
    this.onSubtitle?.(text, voice);
  }

  private log_(req: SpeakRequest, text: string, mode: VoiceLogEntry['mode'], lang: string): void {
    this.log.push({ key: req.key, text, mode, voice: req.voice, lang, at: Math.round(performance.now()) });
    if (this.log.length > 24) this.log.shift();
  }

  private fail(reason: LastDrop): false {
    this.lastDrop = reason;
    return false;
  }

  // ---------------------------------------------------------------------------------------
  // Warteschlange des Beraters

  private schedulePump(): void {
    if (this.pumpTimer) return;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.pump();
    }, 120);
  }

  /** Wartende Beraterzeile starten, sobald der Berater frei ist (auch von außen pro Frame aufrufbar) */
  pump(): void {
    const q = this.gate.nextQueued(performance.now());
    if (q) {
      const r = this.queuedReq.get(q.key);
      this.queuedReq.delete(q.key);
      if (r) this.say({ ...r, priority: q.priority });
    }
    if (this.gate.queueLength() > 0) this.schedulePump();
  }

  replayLast(voice = 'advisor'): boolean {
    const r = this.lastReq.get(voice);
    if (!r) return false;
    const category: VoiceCategory = voice === 'advisor' ? 'advisor' : 'unit';
    const parsed = parseVoiceKey(r.key);
    const gr: GateReq = { category, voice, key: r.key, event: parsed?.event, priority: 2, force: true };
    if (!this.host.isReady() || this.host.settings().muted) return false;
    return this.start(gr, r, r.text, r.lang ?? getLang(), { gain: 1, pan: 0, lowpass: 0 });
  }

  lastText(voice = 'advisor'): string | null {
    return this.lastReq.get(voice)?.text ?? null;
  }

  stop(category?: 'advisor' | 'unit'): void {
    for (const r of [...this.running.values()]) if (!category || r.category === category) r.stop();
    if (!category || category === 'advisor') this.gate.clearQueue();
    if (typeof speechSynthesis !== 'undefined') {
      try {
        speechSynthesis.cancel();
      } catch {
        /* ignorieren */
      }
    }
  }

  // ---------------------------------------------------------------------------------------
  // Komfortaufrufe für Einheiten

  /**
   * Zeile eines Ereignisses einer Gruppe sprechen: Variante wird abwechselnd gewählt (nie dieselbe zweimal hintereinander).
   * `priority`: 1 = Spielerrückmeldung (Auswahl/Befehl), 0 = Hintergrund (Arbeit, Abschluss, verwundet …).
   */
  speak(group: string, event: VoiceEvent, opts: { pos?: { x: number; y: number }; priority?: 0 | 1 | 2; lang?: 'de' | 'en' } = {}): boolean {
    const lang = opts.lang ?? getLang();
    const de = voiceLines(group, event, 'de');
    if (de.length === 0) return false;
    const i = this.picker.pick(`${group}.${event}`, de.length);
    const text = voiceLines(group, event, lang)[i] ?? de[i];
    return this.say({ voice: group, key: `${group}.${event}.${i + 1}`, text, lang, priority: opts.priority ?? 0, pos: opts.pos });
  }

  debug(): { clips: ClipStats | null; stats: VoiceSystem['stats']; lastDrop: LastDrop; log: VoiceLogEntry[]; dropped: Record<string, number>; active: number; subtitles: string[] } {
    return {
      clips: this.clips ? { ...this.clips.stats } : null,
      stats: { ...this.stats },
      lastDrop: this.lastDrop,
      log: [...this.log],
      dropped: { ...this.gate.dropped },
      active: this.gate.activeCount(performance.now()),
      subtitles: this.overlay.visible(),
    };
  }
}

const FEMALE_HINT = /anna|petra|marlene|vicki|katja|helena|hedda|female|frau|girl|weiblich|google deutsch$/i;
const MALE_HINT = /markus|hans|stefan|yannick|jonas|male|mann|männlich|conrad|florian/i;

/** Passende Browser-Stimme wählen (Sprache zuerst, dann grobes Geschlecht anhand des Namens) */
export function pickBrowserVoice(voices: SpeechSynthesisVoice[], lang: string, female: boolean): SpeechSynthesisVoice | null {
  const pre = lang.slice(0, 2).toLowerCase();
  const list = voices.filter((v) => v.lang.toLowerCase().startsWith(pre));
  if (list.length === 0) return null;
  const hint = female ? FEMALE_HINT : MALE_HINT;
  return list.find((v) => hint.test(v.name)) ?? list.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ?? list[0];
}
