/**
 * AudioEngine: öffentliche Schnittstelle für Spiel und Oberfläche.
 * Erzeugt den AudioContext erst nach der ersten Nutzergeste (Autoplay-Regeln), mischt Weltgeräusche
 * räumlich nach Kameraposition/Zoom, begrenzt Stimmen und steuert die generative Musik.
 */
import { leadClass, voiceClassOf, CommandKind, VoiceClass } from './classes';
import { VoiceEvent } from '@strongpoly/shared';
import { VoiceSystem } from './voice';
import { Ambience } from './ambience';
import { AmbienceInput, SILENT_TARGETS } from './ambience_logic';
import { eventOfCommand, groupOfBuilding, groupOfUnit, leadGroup } from './voice_groups';
import { applyLevels, AudioSettings, Bus, Channel, createBus, DEFAULT_AUDIO } from './engine';
import { Listener, LIMITER_CFG, spatialize, VoiceLimiter } from './mix';
import { MusicPlayer, MusicStats } from './music';
import { SFX, SfxId, SfxParams } from './sfx';
import { Env, noiseBuffer } from './synth';
import { GameMood, MoodId, ThemeId, THEME_PHRASES } from './theory';
import { playUnitVoice } from './voices';

export type { AudioSettings } from './engine';
export { DEFAULT_AUDIO } from './engine';
export type { CommandKind, VoiceClass } from './classes';
export type { GameMood, ThemeId } from './theory';
export type { SfxId } from './sfx';
export type { VoiceApi, SpeakRequest, VoicePriority } from './voice_api';

const CHANNEL: Partial<Record<SfxId, Channel>> = {
  uiHover: 'ui',
  uiClick: 'ui',
  uiConfirm: 'ui',
  uiError: 'ui',
  placeFail: 'ui',
  gong: 'advisor',
  notice: 'advisor',
  victory: 'ui',
  defeat: 'ui',
};

/** Geschätzte Dauer (ms) für das Voice-Limit, bevor der Effekt synthetisiert wird. */
const EST_MS: Partial<Record<SfxId, number>> = {
  build: 600,
  demolish: 800,
  chop: 250,
  pick: 300,
  smith: 800,
  mill: 1000,
  harvest: 250,
  arrowShot: 250,
  arrowHit: 120,
  swordHit: 250,
  catapult: 500,
  siegeImpact: 700,
  wallCollapse: 1600,
  fire: 550,
  gateOpen: 900,
  gateClose: 900,
  recruit: 1000,
  oil: 1000,
  heal: 600,
  banner: 950,
  splash: 350,
  uiHover: 50,
  uiClick: 100,
  uiConfirm: 400,
  uiError: 200,
  placeFail: 350,
  gong: 2400,
  notice: 800,
  victory: 3600,
  defeat: 4200,
};

const UI_SELECTOR = 'button, select, summary, [role=button], .item, .tab, input[type=checkbox], input[type=range], label.check';

interface DebugState {
  ctx: string;
  mood: GameMood;
  theme: ThemeId | null;
  muted: boolean;
  musicOn: boolean;
  voices: number;
  dropped: number;
  played: Record<string, number>;
  music: MusicStats | null;
  settings: AudioSettings;
  listener: Listener;
  voice: ReturnType<VoiceSystem['debug']>;
  ambience: { targets: Ambience['state']; played: Ambience['played'] } | null;
}

export class AudioEngine {
  cfg: AudioSettings = { ...DEFAULT_AUDIO };
  private ctx: AudioContext | null = null;
  private bus: Bus | null = null;
  private noise: AudioBuffer | null = null;
  private music: MusicPlayer | null = null;
  private ambience: Ambience | null = null;
  private limiter = new VoiceLimiter(LIMITER_CFG);
  private listener: Listener = { x: 0, y: 0, yaw: Math.PI / 4, dist: 38 };
  private mood: GameMood = 'build';
  private theme: ThemeId | null = null;
  private played: Record<string, number> = {};
  private seed = (Math.random() * 0x7fffffff) | 0;
  private lastHover: Element | null = null;
  /** Sprachsystem (Einheiten, Bewohner, Berater); Vertrag `VoiceApi` */
  readonly voice: VoiceSystem;
  private lastSel = { sig: '', at: 0 };
  private visTimer: ReturnType<typeof setTimeout> | null = null;
  private unlockBound = (e: Event): void => this.unlock(e);

  constructor() {
    this.voice = new VoiceSystem({
      isReady: () => this.ready,
      settings: () => this.cfg,
      ctx: () => this.ctx,
      bus: () => this.bus,
      listener: () => this.listener,
    });
    if (typeof window === 'undefined') return;
    // Browser erlauben Audio erst nach einer Nutzergeste: erst dann Kontext erzeugen/fortsetzen
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.addEventListener(ev, this.unlockBound, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    // Oberflächen-Geräusche global über Ereignisdelegation: gilt auch für später gebaute Menüs
    document.addEventListener('pointerdown', (e) => this.uiPointer(e, true), true);
    document.addEventListener('pointerover', (e) => this.uiPointer(e, false), true);
  }

  // ---------------------------------------------------------------------------------------
  // Kontext / Autoplay

  private unlock(e: Event): void {
    if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    if (!this.ctx) this.createContext();
    const c = this.ctx;
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    if (c.state === 'running') this.onRunning();
  }

  private createContext(): void {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.bus = createBus(ctx);
      this.noise = noiseBuffer(ctx);
      applyLevels(this.bus, this.cfg, ctx, true);
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running') this.onRunning();
        // z. B. nach Unterbrechung (iOS) wieder auf die nächste Geste warten
        else if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') this.armUnlock();
      });
    } catch {
      this.ctx = null;
    }
  }

  private armUnlock(): void {
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.addEventListener(ev, this.unlockBound, { capture: true, passive: true });
  }

  private onRunning(): void {
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.removeEventListener(ev, this.unlockBound, { capture: true });
    this.syncMusic();
    this.voice.init();
    this.syncAmbience();
  }

  /** true, wenn Klänge gerade hörbar abgespielt werden können. */
  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.bus;
  }

  private onVisibility(): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return;
    if (this.visTimer) clearTimeout(this.visTimer);
    if (document.hidden) {
      bus.vis.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      this.visTimer = setTimeout(() => {
        if (document.hidden && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      }, 500);
    } else {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      bus.vis.gain.setTargetAtTime(1, ctx.currentTime, 0.15);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Einstellungen

  configure(s: Partial<AudioSettings>): void {
    const wasMusic = this.cfg.musicOn;
    Object.assign(this.cfg, s);
    for (const k of ['master', 'sfx', 'music', 'advisor', 'voice', 'ambient'] as const) this.cfg[k] = Math.max(0, Math.min(1, Number(this.cfg[k]) || 0));
    this.cfg.subtitles = !!this.cfg.subtitles;
    this.cfg.ttsFallback = this.cfg.ttsFallback !== false;
    if (!this.cfg.subtitles) this.voice.overlay.clear();
    if (this.cfg.muted) this.voice.stop();
    if (this.ctx && this.bus) applyLevels(this.bus, this.cfg, this.ctx);
    if (wasMusic !== this.cfg.musicOn) this.syncMusic();
  }

  /** Kompatibilität: alter Einzelregler = Master */
  setVolume(v: number): void {
    this.configure({ master: v });
  }
  /** Kompatibilität: Musik an/aus */
  setMusic(on: boolean): void {
    this.configure({ musicOn: on });
  }

  toggleMute(): boolean {
    this.configure({ muted: !this.cfg.muted });
    return this.cfg.muted;
  }
  get muted(): boolean {
    return this.cfg.muted;
  }

  /** Kamera als Hörerposition (jeden Frame aufrufen): Blickpunkt in Tiles, Gierwinkel, Abstand. */
  setListener(x: number, y: number, yaw: number, dist: number): void {
    const l = this.listener;
    l.x = x;
    l.y = y;
    l.yaw = yaw;
    l.dist = dist;
    this.voice.pump();
  }

  // ---------------------------------------------------------------------------------------
  // Effekte

  private env(out: AudioNode): Env | null {
    if (!this.ctx || !this.noise) return null;
    return { ctx: this.ctx, out, noise: this.noise, rand: Math.random };
  }

  /** Spielt einen Effekt, optional an einer Weltposition (Tile-Koordinaten). */
  play(id: SfxId, x?: number, y?: number, p: SfxParams & { vol?: number } = {}): boolean {
    if (!this.ready || this.cfg.muted) return false;
    const bus = this.bus!;
    const ctx = this.ctx!;
    const ch = CHANNEL[id] ?? 'effects';
    if (bus.level[ch].gain.value < 0.0005) return false;
    let gain = (p.vol ?? 1) * (0.88 + Math.random() * 0.2);
    let pan = 0;
    let lowpass = 0;
    if (x !== undefined && y !== undefined) {
      const sp = spatialize(this.listener, x, y);
      if (!sp.audible) return false;
      gain *= sp.gain;
      pan = sp.pan;
      lowpass = sp.lowpass;
    }
    if (!this.limiter.request(id, performance.now(), EST_MS[id] ?? 600)) return false;
    const nodes: AudioNode[] = [];
    const entry = ctx.createGain();
    entry.gain.value = gain;
    nodes.push(entry);
    let tail: AudioNode = entry;
    if (x !== undefined) {
      if (lowpass > 0 && lowpass < 13000) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lowpass;
        f.Q.value = 0.5;
        tail.connect(f);
        tail = f;
        nodes.push(f);
      }
      if (typeof ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
        const sp = ctx.createStereoPanner();
        sp.pan.value = pan;
        tail.connect(sp);
        tail = sp;
        nodes.push(sp);
      }
    }
    tail.connect(bus.input[ch]);
    const env = this.env(entry)!;
    let dur = 0.5;
    try {
      dur = SFX[id](env, ctx.currentTime + 0.01, p);
    } catch (err) {
      console.error('audio', id, err);
    }
    this.played[id] = (this.played[id] ?? 0) + 1;
    setTimeout(() => {
      for (const n of nodes) n.disconnect();
    }, (dur + 0.4) * 1000);
    return true;
  }

  /** Sim-Effekt ('fx'-Ereignis) auf einen Klang abbilden. */
  simFx(kind: string, x: number, y: number): void {
    switch (kind) {
      case 'hit':
        this.play('swordHit', x, y);
        break;
      case 'explosion':
      case 'rock':
        this.play('siegeImpact', x, y);
        break;
      case 'collapse':
        this.play('wallCollapse', x, y);
        break;
      case 'collapseWood':
        this.play('wallCollapse', x, y, { wood: true });
        break;
      case 'fire':
        this.play('fire', x, y, { v: 0.8 });
        break;
      case 'oil':
        this.play('oil', x, y);
        break;
      case 'heal':
        this.play('heal', x, y, { vol: 0.7 });
        break;
      case 'arrows':
        this.play('arrowShot', x, y, { v: 1.2 });
        break;
      case 'banner':
        this.play('banner', x, y);
        break;
      case 'splash':
        this.play('splash', x, y);
        break;
      default:
        break;
    }
  }

  // ----- Kompatible Kurzaufrufe der alten Schnittstelle -----
  click(): void {
    this.play('uiClick');
  }
  /** Bestätigungston beim Platzieren (der Hammer kommt vom entstehenden Gebäude) */
  build(): void {
    this.play('uiConfirm', undefined, undefined, { vol: 0.6 });
  }
  error(): void {
    this.play('placeFail');
  }
  alert(): void {
    this.play('gong');
  }
  victory(): void {
    this.play('victory');
  }
  defeat(): void {
    this.play('defeat');
  }
  shoot(): void {
    /* ersetzt durch positionsbezogene Geschossgeräusche (Soundscape) */
  }
  /** Alte Schnittstelle: Effekt mit Kamerabezug. Hörerposition wird separat gesetzt. */
  fx(kind: string, x: number, y: number): void {
    this.simFx(kind, x, y);
  }

  ui(kind: 'hover' | 'click' | 'confirm' | 'error'): void {
    this.play(kind === 'hover' ? 'uiHover' : kind === 'click' ? 'uiClick' : kind === 'confirm' ? 'uiConfirm' : 'uiError');
  }

  advisor(kind: 'alert' | 'info'): void {
    this.play(kind === 'alert' ? 'gong' : 'notice');
  }

  private uiPointer(e: Event, down: boolean): void {
    if (!this.ready) return;
    const t = e.target as Element | null;
    const el = t && typeof t.closest === 'function' ? t.closest(UI_SELECTOR) : null;
    if (!el || el.closest('[data-nosfx]')) {
      if (!down) this.lastHover = null;
      return;
    }
    const disabled = (el as HTMLButtonElement).disabled === true;
    if (down) this.ui(disabled ? 'error' : 'click');
    else if (el !== this.lastHover) {
      this.lastHover = el;
      if (!disabled) this.ui('hover');
    }
  }

  // ---------------------------------------------------------------------------------------
  // Einheiten

  /** Letzter Ausweg ohne Sprachclips und ohne Browser-Sprachausgabe: kurze synthetische Rückmeldung je Klasse */
  private legacyVoice(cls: VoiceClass, mode: 'select' | 'command', kind: CommandKind = 'move'): void {
    if (!this.ready || this.cfg.muted) return;
    const ctx = this.ctx!;
    if (!this.limiter.request('voice', performance.now(), 500)) return;
    const g = ctx.createGain();
    g.gain.value = (mode === 'select' ? 0.9 : 0.75) * (0.9 + Math.random() * 0.15);
    g.connect(this.bus!.input.effects);
    const env = this.env(g)!;
    const dur = playUnitVoice(env, ctx.currentTime + 0.01, cls, mode, kind);
    this.played['voice'] = (this.played['voice'] ?? 0) + 1;
    setTimeout(() => g.disconnect(), (dur + 0.6) * 1000);
  }

  /** Spielerrückmeldung (Auswahl/Befehl) an die Sprachausgabe; Rückfall auf die synthetische Kurzrückmeldung, wenn nichts sprechen kann. */
  private feedback(group: string | null, event: VoiceEvent, cls: VoiceClass | null, mode: 'select' | 'command', kind: CommandKind, pos?: { x: number; y: number }): void {
    if (!group || !this.ready || this.cfg.muted) return;
    const ok = this.voice.speak(group, event, { pos, priority: 1 });
    if (!ok && this.voice.lastDrop === 'unavailable' && cls) this.legacyVoice(cls, mode, kind);
  }

  /** Einheitentyp-ID (shared/data/units) → Rückmeldung bei Auswahl. `sig` kennzeichnet die Auswahl: dieselbe Auswahl in kurzer Folge bleibt stumm. */
  unitSelect(unitTypeId: number, pos?: { x: number; y: number }, sig?: string): void {
    this.selectionSelect([unitTypeId], pos, sig);
  }
  /** Rückmeldung bei einem Befehl an Einheiten dieses Typs. */
  unitCommand(unitTypeId: number, kind: CommandKind = 'move', pos?: { x: number; y: number }): void {
    this.selectionCommand([unitTypeId], kind, pos);
  }
  /** Eine „sprechende“ Klasse der (gemischten) Auswahl antwortet – nur bei neuer Auswahl. */
  selectionSelect(types: Iterable<number>, pos?: { x: number; y: number }, sig?: string): void {
    const arr = [...types];
    const now = performance.now();
    if (sig !== undefined) {
      if (sig === this.lastSel.sig && now - this.lastSel.at < 4000) return;
      this.lastSel = { sig, at: now };
    }
    const g = leadGroup(arr);
    const c = leadClass(arr);
    this.feedback(g, 'select', c, 'select', 'move', pos);
  }
  selectionCommand(types: Iterable<number>, kind: CommandKind = 'move', pos?: { x: number; y: number }): void {
    const arr = [...types];
    const ev = eventOfCommand(kind);
    if (!ev) return;
    this.feedback(leadGroup(arr), ev, leadClass(arr), 'command', kind, pos);
  }
  /** Gebäude angewählt: ein Bewohner/Arbeiter des Gebäudes meldet sich (Schmied, Bäcker, Händler …). */
  buildingSelect(buildingType: number, pos?: { x: number; y: number }): void {
    this.feedback(groupOfBuilding(buildingType), 'select', null, 'select', 'move', pos);
  }
  /** Ereignisbezogene Zeile (Arbeit, Abschluss, verwundet …) einer Einheitengruppe; Hintergrundrang, räumlich. */
  speakEvent(group: string | null, event: VoiceEvent, pos?: { x: number; y: number }, priority: 0 | 1 = 0): boolean {
    if (!group || !this.ready || this.cfg.muted) return false;
    return this.voice.speak(group, event, { pos, priority });
  }
  /** Gruppe einer Einheit/eines Gebäudes (für Aufrufer ohne Kenntnis der Zuordnung) */
  groupOfUnit(unitType: number): string | null {
    return groupOfUnit(unitType);
  }
  groupOfBuilding(buildingType: number): string | null {
    return groupOfBuilding(buildingType);
  }

  // ---------------------------------------------------------------------------------------
  // Musik

  /** Spielstimmung (Aufbau/Spannung/Schlacht); weicher Übergang. Ein laufendes Thema hat Vorrang. */
  setMood(m: GameMood): void {
    this.mood = m;
    if (!this.theme) this.music?.setTarget(m);
  }

  /** Thema für Hauptmenü, Sieg, Niederlage; null = zurück zur Spielstimmung. */
  playTheme(t: ThemeId | null): void {
    if (t === 'menu') this.ambience?.apply(SILENT_TARGETS, undefined, 0.6);
    if (this.theme === t) return;
    this.theme = t;
    this.music?.setTarget(t ?? this.mood, t ? THEME_PHRASES[t] : 0, !!t);
  }

  currentTheme(): ThemeId | null {
    return this.theme;
  }
  currentMood(): GameMood {
    return this.mood;
  }

  private syncMusic(): void {
    if (!this.ready) return;
    const want = this.cfg.musicOn;
    if (want && !this.music) {
      const ctx = this.ctx!;
      this.music = new MusicPlayer(ctx, this.bus!.input.music, this.seed);
      const mood: MoodId = this.theme ?? this.mood;
      this.music.setTarget(mood, this.theme ? THEME_PHRASES[this.theme] : 0, true);
      this.music.start(3);
    } else if (want && this.music) {
      this.music.start(2);
    } else if (!want && this.music) {
      this.music.stop(0.8);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Umgebungsgeräusche (4G)

  private syncAmbience(): void {
    if (!this.ready || this.ambience) return;
    this.ambience = new Ambience(this.ctx!, this.bus!.input.ambient, this.noise!);
  }

  /**
   * Beobachtungen der Umgebung (Soundscape, alle ~0,25 s) → Klangbetten und Einzelereignisse (Vögel, Knistern, ferne Waffenschläge).
   * Einzelereignisse laufen über das Voice-Limit.
   */
  updateAmbience(input: AmbienceInput, dt: number): void {
    if (!this.ready) return;
    if (!this.ambience) this.syncAmbience();
    const a = this.ambience;
    if (!a) return;
    const events = a.update(dt, input);
    if (this.cfg.muted || this.bus!.level.ambient.gain.value < 0.0005) return;
    for (const ev of events) {
      const est = ev.kind === 'bird' ? 1100 : ev.kind === 'clash' ? 650 : 120;
      if (!this.limiter.request(ev.kind, performance.now(), est)) continue;
      a.fire(ev);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Diagnose

  state(): DebugState {
    return {
      ctx: this.ctx?.state ?? 'none',
      mood: this.mood,
      theme: this.theme,
      muted: this.cfg.muted,
      musicOn: this.cfg.musicOn,
      voices: this.limiter.active(performance.now()),
      dropped: this.limiter.dropped,
      played: { ...this.played },
      music: this.music ? this.music.stats() : null,
      settings: { ...this.cfg },
      listener: { ...this.listener },
      voice: this.voice.debug(),
      ambience: this.ambience ? { targets: { ...this.ambience.state }, played: { ...this.ambience.played } } : null,
    };
  }
}
