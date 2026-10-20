import {
  ABILITIES,
  BUILDINGS,
  BT,
  ClientWorld,
  Command,
  PlayerView,
  Snapshot,
  PLAYER_COLORS,
  PublicPlayer,
  RenderClock,
} from '@strongpoly/shared';
import { EntityRenderer } from '../render/entities';
import { GhostRenderer } from '../render/ghost';
import { GameScene } from '../render/scene';
import { Hud, HudActions, ModeName } from '../ui/hud';
import { AdvisorLogic, AdvisorPanel } from '../ui/advisor';
import { showEndScreen } from '../ui/endscreen';
import { closeEncyclopedia, isEncyclopediaOpen, openEncyclopedia } from '../ui/encyclopedia';
import type { GameConnection } from './connection';
import { FogOfWar } from './fog';
import { InputController } from './input';
import type { GameSetup } from './protocol';
import { Settings } from './settings';
import type { AudioEngine } from '../audio/audio';
import { Soundscape, SoundView } from './soundscape';

export interface SessionOptions {
  setup: GameSetup;
  extreme: boolean;
  mission?: string | null;
  onExit: () => void;
  onMenu: () => void;
  settings: Settings;
  audio: AudioEngine | null;
  /** Hotkey-Übersicht (F1) und Enzyklopädie (F2) */
  onHelp?: () => void;
  onEncyclopedia?: () => void;
}

/** Eine laufende Partie auf Client-Seite: Welt-Spiegel, Rendering, Eingabe und HUD. */
export class Session {
  readonly world = new ClientWorld();
  readonly entities: EntityRenderer;
  readonly ghost = new GhostRenderer();
  readonly hud: Hud;
  readonly input: InputController;
  fog: FogOfWar | null = null;
  selection = { units: [] as number[], pool: [] as number[], building: 0 };
  readonly advisor: AdvisorLogic;
  private advisorPanel: AdvisorPanel | null = null;
  private advisorTimer = 0;
  controlGroups: number[][] = [];
  teamOf: number[] = [];
  myTeam = 0;
  me: number;
  speed = 1;
  paused = false;
  /** eingetroffene Snapshots mit Ankunftszeit (ms), werden einmal je Frame verarbeitet */
  private queue: { s: Snapshot; at: number }[] = [];
  /** gleichmäßige Darstellungsuhr in Sim-Ticks (Interpolation der Einheiten) */
  readonly clock = new RenderClock();
  private lastFrameSec = 0;
  private view: PlayerView | null = null;
  private hudTimer = 0;
  private fpsAcc = { frames: 0, t: 0, fps: 0 };
  private gotFirst = false;
  private ended = false;
  private themed = false;
  private moveFlash: { x: number; y: number; t: number }[] = [];
  private mouse = { x: 0, y: 0, inside: false };
  private hoverBuilding = 0;
  private hoverTimer = 0;
  private onMove: (e: PointerEvent) => void;
  private onLeave: () => void;
  private alertCooldown = 0;
  private info = { tickMs: 0, tick: 0, units: 0 };
  audio: AudioEngine | null;
  /** leitet Weltgeräusche und die Musikstimmung aus dem Spielzustand ab */
  readonly sound: Soundscape | null;

  constructor(
    readonly gs: GameScene,
    readonly conn: GameConnection,
    readonly uiRoot: HTMLElement,
    private opts: SessionOptions,
  ) {
    this.me = conn.playerId;
    this.audio = opts.audio;
    this.sound = opts.audio ? new Soundscape(this.world, opts.audio) : null;
    // neue Partie: Spielmusik statt Menüthema
    this.audio?.playTheme(null);
    this.audio?.setMood('build');
    this.entities = new EntityRenderer(this.world);
    this.entities.onBuildingsChanged = () => gs.decor?.markDirty();
    gs.onGfx = (q, shadows) => this.entities.applyQuality(q, shadows);
    this.entities.applyQuality(gs.qcfg, gs.gfx.shadows && gs.qcfg.shadows);
    gs.root.add(this.entities.group, this.ghost.group);
    const cv = gs.canvas;
    this.onMove = (e: PointerEvent): void => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    };
    this.onLeave = (): void => {
      this.mouse.inside = false;
    };
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerleave', this.onLeave);
    const actions: HudActions = {
      send: (c) => this.send(c),
      startPlacement: (t) => this.startPlacement(t),
      cancelPlacement: () => this.input.setMode({ k: 'normal' }),
      startDig: (fill) => this.input.setMode({ k: 'dig', fill }),
      startMode: (m) => this.input.setMode({ k: m } as never),
      currentMode: () => this.input.mode.k as ModeName,
      placingType: () => (this.input.mode.k === 'place' ? this.input.mode.type : -1),
      undo: () => this.undo(),
      openHelp: () => this.opts.onHelp?.(),
      openEncyclopedia: () => this.opts.onEncyclopedia?.(),
      selectBuilding: (id) => this.setSelection([], id),
      filterSelection: (t) => this.filterSelection(t),
      openMenu: () => this.openMenu(),
      setSpeed: (d) => this.changeSpeed(d),
      togglePause: () => this.togglePause(),
      centerOn: (x, y) => gs.cam.lookAt(x, y),
      isLocal: conn.local,
    };
    this.hud = new Hud(uiRoot, actions, this.world, {
      extreme: opts.extreme,
      onMinimapMove: (x, y) => gs.cam.lookAt(x, y),
      onMinimapOrder: (x, y) => {
        if (this.selection.units.length) this.send({ c: 'move', units: this.selection.units, x, y, formation: this.input.formation });
      },
    });
    this.hud.setMe(this.me);
    this.advisor = new AdvisorLogic(this.world, () => this.me, () => this.teamOf);
    this.advisorPanel = new AdvisorPanel(this.hud.topRight, this.advisor, (x, y) => this.gs.cam.lookAt(x, y), () => this.world.tick);
    this.advisor.onMessage = (m) => {
      this.advisorPanel?.notify();
      this.audio?.advisor(m.kind === 'info' ? 'info' : 'alert');
    };
    this.hud.formationHandler = (f) => {
      this.input.formation = f;
      this.hud.toast('Formation geändert');
    };
    this.input = new InputController(this);
    conn.onSnapshot = (s) => this.queue.push({ s, at: performance.now() });
    conn.onView = (v) => {
      this.view = v;
      this.world.applyMe(v);
    };
    conn.onInfo = (i) => (this.info = i);
    conn.onError = (m) => {
      console.error(m);
      this.hud.toast('Simulationsfehler – siehe Konsole', true);
    };
  }

  // ----- Befehle & Auswahl -----
  send(cmd: Command): void {
    this.conn.send(cmd);
    this.commandVoice(cmd);
  }

  /** Kurzer Ton je Einheitenklasse bei Befehlen an Einheiten. */
  private commandVoice(cmd: Command): void {
    if (!this.audio) return;
    let kind: 'move' | 'attack' | 'attackMove' | 'stop' | null = null;
    switch (cmd.c) {
      case 'move':
        kind = cmd.attack ? 'attackMove' : 'move';
        break;
      case 'attack':
      case 'attackGround':
        kind = 'attack';
        break;
      case 'patrol':
        kind = 'attackMove';
        break;
      case 'tunnel':
        kind = 'move';
        break;
      case 'stop':
        kind = 'stop';
        break;
      default:
        return;
    }
    const w = this.world;
    const types: number[] = [];
    for (const id of cmd.units) {
      const s = w.slotOf(id);
      if (s >= 0) types.push(w.type[s]);
    }
    if (types.length) this.audio.selectionCommand(types, kind);
  }

  /** Taste M: Ton stumm/an, mit sichtbarer Meldung. */
  toggleMute(): void {
    if (!this.audio) return;
    const muted = this.audio.toggleMute();
    this.opts.settings.muted = muted;
    this.opts.settings.save();
    this.hud.toast(muted ? 'Ton aus (M zum Einschalten)' : 'Ton an');
    if (!muted) this.audio.ui('confirm');
  }

  startPlacement(type: number): void {
    this.input.setMode({ k: 'place', type, rot: 0 });
    this.setSelection([], 0);
  }

  setSelection(units: number[], building: number, keepPool = false): void {
    this.selection = { units, pool: keepPool ? this.selection.pool : units, building };
    if (units.length) {
      const w = this.world;
      const types: number[] = [];
      for (const id of units) {
        const s = w.slotOf(id);
        if (s >= 0) types.push(w.type[s]);
      }
      this.audio?.selectionSelect(types);
    } else if (building) this.audio?.ui('click');
  }

  /** Truppenpanel: Auswahl auf einen Typ einschränken (null = alle Typen der Gesamtauswahl) */
  filterSelection(type: number | null): void {
    const w = this.world;
    const pool = this.selection.pool.filter((id) => w.slotOf(id) >= 0);
    const units = type === null ? pool : pool.filter((id) => w.type[w.slotOf(id)] === type);
    this.selection = { units, pool, building: 0 };
    if (units.length) this.audio?.ui('click');
  }

  /** Strg+Z */
  undo(): void {
    this.send({ c: 'undo' });
    this.audio?.ui('click');
  }

  /** Bergfried, Kornspeicher, Kaserne, Markt, Lager, Waffenkammer direkt anwählen (Kamera folgt) */
  selectBuildingType(type: number): void {
    let best: { id: number; x: number; y: number } | null = null;
    for (const b of this.world.buildings.values()) if (b.o === this.me && b.t === type) {
      best = { id: b.i, x: b.x + b.w / 2, y: b.y + b.h / 2 };
      break;
    }
    if (!best) {
      this.hud.toast(`${BUILDINGS[type].name} ist nicht gebaut`, true);
      this.audio?.ui('error');
      return;
    }
    this.setSelection([], best.id);
    this.gs.cam.lookAt(best.x, best.y);
  }

  /** Leertaste: Kamera zur letzten Meldung */
  jumpToAlert(): void {
    const list = this.advisor.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.x !== undefined && m.y !== undefined) {
        m.read = true;
        this.gs.cam.lookAt(m.x, m.y);
        this.advisorPanel?.render();
        return;
      }
    }
    this.hud.toast('Keine Meldung mit Ort vorhanden');
  }

  selectAllArmy(): void {
    const w = this.world;
    const ids: number[] = [];
    for (let s = 0; s < w.top; s++) if (w.ids[s] && w.owner[s] === this.me && w.type[s] > 1) ids.push(w.ids[s]);
    this.setSelection(ids, 0);
  }

  centerOnSelection(): void {
    const w = this.world;
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of this.selection.units) {
      const s = w.slotOf(id);
      if (s < 0) continue;
      x += w.curX[s];
      y += w.curY[s];
      n++;
    }
    if (n) this.gs.cam.lookAt(x / n, y / n);
  }

  centerOnKeep(): void {
    const p = this.world.players[this.me];
    if (p) this.gs.cam.lookAt(p.keepX, p.keepY);
  }

  flashMove(x: number, y: number): void {
    this.entities.fx.effect('dust', x, y, 0.2);
  }

  useAbility(id: number, x: number, y: number): void {
    this.send({ c: 'ability', id, x, y });
  }
  armAbility(i: number): void {
    if (!this.opts.extreme) return;
    const a = ABILITIES[i];
    if (!a) return;
    const v = this.view;
    if (v && (v.power < a.cost || (v.abilityCd[i] ?? 0) > 0)) {
      this.hud.toast(`${a.name} noch nicht bereit`, true);
      return;
    }
    if (a.radius === 0) {
      // Fähigkeiten ohne Zielgebiet sofort auslösen
      this.useAbility(a.id, this.gs.cam.tx, this.gs.cam.tz);
      return;
    }
    this.input.setMode({ k: 'ability', id: a.id });
  }

  toggleShadows(): void {
    this.opts.settings.shadows = !this.opts.settings.shadows;
    this.opts.settings.save();
    this.applySettings();
  }

  applySettings(): void {
    const st = this.opts.settings;
    this.gs.applyGfx({ shadows: st.shadows, quality: st.quality });
    this.entities.setShadows(st.shadows);
    this.gs.cam.scrollSpeed = 1.4 * st.scrollSpeed;
    this.uiRoot.style.setProperty('--ui-scale', String(st.uiScale));
    this.entities.setBlood(st.blood);
    this.audio?.configure(st.audio());
  }

  changeSpeed(dir: number): void {
    const steps = [0.5, 1, 1.5, 2, 3];
    let i = steps.indexOf(this.speed);
    if (i < 0) i = 1;
    i = Math.max(0, Math.min(steps.length - 1, i + dir));
    this.speed = steps[i];
    this.conn.setSpeed?.(this.speed);
    this.hud.setSpeedLabel(this.speed);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.conn.setPaused?.(this.paused);
    this.hud.setPaused(this.paused);
    this.hud.toast(this.paused ? 'Pausiert' : 'Fortgesetzt');
  }

  openMenu(): void {
    this.opts.onMenu();
  }
  openHelp(): void {
    this.opts.onHelp?.();
  }
  /** F2 / Knopf: Enzyklopädie; im Einzelspieler pausiert die Partie, solange sie offen ist */
  toggleEncyclopedia(): void {
    if (isEncyclopediaOpen()) {
      closeEncyclopedia();
      return;
    }
    const pausedByUs = this.conn.local && !this.paused;
    if (pausedByUs) this.togglePause();
    openEncyclopedia(undefined, { onClose: () => { if (pausedByUs && this.paused) this.togglePause(); } });
  }
  openEncyclopedia(): void {
    this.toggleEncyclopedia();
  }

  // ----- Frame -----
  private applySnapshots(nowMs: number): void {
    const q = this.queue;
    this.queue = [];
    for (const { s, at } of q) {
      this.world.apply(s, nowMs);
      if (s.full) {
        // Start oder Reconnect: Positionshistorie (ClientWorld) und Darstellungsuhr neu aufsetzen; die Posen bleiben, damit nichts springt
        this.clock.reset(s.tick);
        this.initAfterFull();
        this.gotFirst = true;
      } else this.clock.onSnapshot(s.tick, nowMs - at, this.speed, at);
      for (const t of this.world.tileChanges) {
        if (t < 0) continue;
        this.gs.terrain?.markTile(t % this.world.map.w, (t / this.world.map.w) | 0);
        this.gs.decor?.markDirty();
        this.hud.minimap.patchTile(t);
      }
      this.world.tileChanges.length = 0;
      this.advisor.checkRemoved(this.world.tick);
      this.handleEvents(s.events);
      this.sound?.onSnapshot(this.soundView());
      if (s.winner !== undefined && !this.ended) this.onEnd(s.winner);
    }
  }

  private handleEvents(events: Snapshot['events']): void {
    for (const e of events) {
      if (e.e === 'msg' && e.p === this.me) {
        this.advisor.push('info', e.text, this.world.tick);
      } else if (e.e === 'alert' && e.p === this.me && this.alertCooldown <= 0) {
        this.alertCooldown = 6;
        if (e.k !== 'attack') this.advisor.push('warn', 'Achtung!', this.world.tick);
      } else if (e.e === 'lose' && e.p === this.me) {
        this.hud.banner('Niederlage', '#d8362f');
        this.audio?.defeat();
        this.audio?.playTheme('defeat');
        this.themed = true;
      } else if (e.e === 'fx') this.sound?.onEvent(e, this.soundView());
    }
  }

  private onEnd(winner: number): void {
    this.ended = true;
    const won = winner === this.myTeam;
    this.hud.banner(won ? 'Sieg!' : winner < 0 ? 'Unentschieden' : 'Niederlage', won ? '#f0c040' : '#d8362f');
    if (won) {
      this.audio?.victory();
      this.audio?.playTheme('victory');
    } else if (!this.themed) {
      this.audio?.defeat();
      this.audio?.playTheme('defeat');
    }
    this.themed = true;
    // Endbildschirm mit Statistik und Siegerpodest; die Statistik kommt im Snapshot nach Spielende
    setTimeout(() => {
      const w = this.world;
      showEndScreen(this.uiRoot, { world: w, myTeam: this.myTeam, me: this.me, winnerTeam: winner, onExit: () => this.opts.onExit() });
    }, 1800);
  }

  frame(dt: number, nowSec: number): void {
    const nowMs = nowSec * 1000;
    if (!this.gotFirst && !this.queue.some((q) => q.s.full)) return;
    // echte Frame-Zeit (main.ts begrenzt dt auf 0,1 s; die Uhr braucht auch lange Frames, um Rückstand zu vermeiden)
    const real = this.lastFrameSec ? Math.max(0, Math.min(1, nowSec - this.lastFrameSec)) : dt;
    this.lastFrameSec = nowSec;
    this.clock.advance(real, this.speed, this.paused);
    this.applySnapshots(nowMs);
    this.alertCooldown -= dt;
    this.advisorTimer -= dt;
    if (this.advisorTimer <= 0) {
      this.advisorTimer = 1;
      this.advisor.update(this.view, this.world.tick);
      this.advisorPanel?.render();
    }
    if (this.opts.mission) this.hud.setMission(this.world.mission);
    // Eingabe/Kamera
    this.input.update(dt);
    // Fog
    if (this.fog) {
      this.fogTimer -= dt;
      if (this.fogTimer <= 0) {
        this.fogTimer = 0.25;
        this.fog.update(this.world, this.myTeam, this.teamOf);
        this.gs.terrain?.applyFog(this.fog.visibleMap, this.fog.exploredMap);
        let n = 0;
        const e = this.fog.exploredMap;
        for (let i = 0; i < e.length; i += 7) n += e[i];
        if (n !== this.lastExplored && performance.now() - this.lastDecorFog > 1500) {
          this.lastExplored = n;
          this.lastDecorFog = performance.now();
          this.gs.decor?.setExplored(e);
          this.world.buildingsDirty = true;
          this.hud.minimap.setFog(e);
        }
      }
    }
    this.updateHover(dt);
    // Rendering
    const alpha = this.clock.alpha;
    const sel = new Set(this.selection.units);
    const pc = this.world.proj.length / 8;
    this.lastProj = pc;
    this.sound?.update(dt, this.soundView());
    const tU0 = performance.now();
    this.entities.consumeEvents();
    this.entities.update(dt, {
      alpha,
      tickF: this.clock.render,
      paused: this.paused,
      now: nowSec,
      camYaw: this.gs.cam.yaw,
      selected: sel,
      selectedBuilding: this.selection.building,
      hoverTile: null,
      hoverBuilding: this.hoverBuilding,
      camera: this.gs.cam.camera,
      visible: this.fog ? (x, y) => this.fog!.visible(x, y) : null,
      explored: this.fog ? (x, y) => this.fog!.explored(Math.floor(x), Math.floor(y)) : null,
      me: this.me,
      myTeam: this.myTeam,
      teamOfPlayer: this.teamOf,
    });
    this.entities.clearEvents();
    const tU1 = performance.now();
    this.gs.render(dt, nowSec);
    const tU2 = performance.now();
    this.perf.entities += tU1 - tU0;
    this.perf.render += tU2 - tU1;
    this.perf.n++;
    // HUD (5 Hz)
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.2;
      this.hud.update(this.view, this.selection);
      this.hud.setAbilities(
        this.opts.extreme ? ABILITIES.map((a, i) => ({ id: a.id, name: a.name, cost: a.cost, cd: 0, hotkey: this.input.hotkeys[`ability${i + 1}` as 'ability1'] })) : [],
        (id) => this.armAbility(id),
        this.view,
      );
    }
    this.hud.minimap.draw(
      nowSec,
      { x: this.gs.cam.tx, y: this.gs.cam.tz, size: this.gs.cam.dist * 0.9 },
      this.myTeam,
      this.teamOf,
      this.fog ? (x, y) => this.fog!.visible(x, y) : null,
    );
    // FPS
    this.fpsAcc.frames++;
    this.fpsAcc.t += dt;
    if (this.fpsAcc.t >= 0.5) {
      this.fpsAcc.fps = Math.round(this.fpsAcc.frames / this.fpsAcc.t);
      this.fpsAcc.frames = 0;
      this.fpsAcc.t = 0;
      const pf = this.perf;
      this.hud.fpsEl.textContent = `${this.fpsAcc.fps} FPS · Entities ${(pf.entities / Math.max(1, pf.n)).toFixed(1)} ms · Render ${(pf.render / Math.max(1, pf.n)).toFixed(1)} ms · Sim ${this.info.tickMs.toFixed(1)} ms · ${this.info.units} Einh.`;
      pf.entities = pf.render = pf.n = 0;
    }
  }
  /** Gebäude unter dem Mauszeiger (für die Umriss-Hervorhebung), höchstens 15 Mal pro Sekunde geprüft */
  private updateHover(dt: number): void {
    this.hoverTimer -= dt;
    if (this.hoverTimer > 0) return;
    this.hoverTimer = 0.066;
    if (!this.mouse.inside || !this.world.map.n) {
      this.hoverBuilding = 0;
      return;
    }
    const r = this.gs.canvas.getBoundingClientRect();
    const nx = ((this.mouse.x - r.left) / r.width) * 2 - 1;
    const ny = -(((this.mouse.y - r.top) / r.height) * 2 - 1);
    const p = this.gs.cam.pick(nx, ny, this.world.map);
    let id = 0;
    if (p) {
      const tx = Math.floor(p.x);
      const ty = Math.floor(p.y);
      if (this.world.map.inBounds(tx, ty)) id = this.world.bldAt[this.world.map.idx(tx, ty)];
      if (id && this.fog && !this.fog.explored(tx, ty)) id = 0;
    }
    this.hoverBuilding = id;
  }

  private soundView(): SoundView {
    const c = this.gs.cam;
    return { me: this.me, myTeam: this.myTeam, teamOf: this.teamOf, camX: c.tx, camY: c.tz, camYaw: c.yaw, camDist: c.dist };
  }
  private fogTimer = 0;
  private camInit = false;
  private lastProj = 0;
  private lastExplored = -1;
  private lastDecorFog = 0;
  perf = { entities: 0, render: 0, n: 0 };

  private initAfterFull(): void {
    const w = this.world;
    const setup = this.opts.setup;
    this.teamOf = w.players.map((p) => p.team);
    this.myTeam = this.teamOf[this.me] ?? 0;
    this.gs.setMap(w.map);
    this.gs.decor?.setOccupancy(w.bldAt);
    this.gs.root.add(this.entities.group, this.ghost.group);
    this.hud.minimap.refreshTerrain();
    if (setup.fog) this.fog = new FogOfWar(w.map.w, w.map.h);
    const me: PublicPlayer | undefined = w.players[this.me];
    if (me && !this.camInit) this.gs.cam.lookAt(me.keepX, me.keepY + 4);
    this.camInit = true;
    this.applySettings();
    void BUILDINGS;
    void BT;
    void PLAYER_COLORS;
  }

  destroy(): void {
    this.gs.canvas.removeEventListener('pointermove', this.onMove);
    this.gs.canvas.removeEventListener('pointerleave', this.onLeave);
    this.gs.onGfx = null;
    this.conn.close();
    this.input.destroy();
    this.advisorPanel?.destroy();
    this.hud.destroy();
    this.gs.root.remove(this.entities.group, this.ghost.group);
    this.entities.dispose();
  }
}
