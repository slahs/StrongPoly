import {
  BUILDINGS,
  BT,
  ClientWorld,
  Command,
  PlayerView,
  Snapshot,
  PLAYER_COLORS,
  PublicPlayer,
} from '@strongpoly/shared';
import { EntityRenderer } from '../render/entities';
import { GhostRenderer } from '../render/ghost';
import { GameScene } from '../render/scene';
import { Hud, HudActions } from '../ui/hud';
import type { GameConnection } from './connection';
import { FogOfWar } from './fog';
import { InputController } from './input';
import type { GameSetup } from './protocol';
import { Settings } from './settings';
import type { AudioEngine } from '../audio/audio';

export interface SessionOptions {
  setup: GameSetup;
  extreme: boolean;
  onExit: () => void;
  onMenu: () => void;
  settings: Settings;
  audio: AudioEngine | null;
}

/** Eine laufende Partie auf Client-Seite: Welt-Spiegel, Rendering, Eingabe und HUD. */
export class Session {
  readonly world = new ClientWorld();
  readonly entities: EntityRenderer;
  readonly ghost = new GhostRenderer();
  readonly hud: Hud;
  readonly input: InputController;
  fog: FogOfWar | null = null;
  selection = { units: [] as number[], building: 0 };
  controlGroups: number[][] = [];
  teamOf: number[] = [];
  myTeam = 0;
  me: number;
  speed = 1;
  paused = false;
  private queue: Snapshot[] = [];
  private view: PlayerView | null = null;
  private hudTimer = 0;
  private fpsAcc = { frames: 0, t: 0, fps: 0 };
  private gotFirst = false;
  private ended = false;
  private moveFlash: { x: number; y: number; t: number }[] = [];
  private alertCooldown = 0;
  private info = { tickMs: 0, tick: 0, units: 0 };
  audio: AudioEngine | null;

  constructor(
    readonly gs: GameScene,
    readonly conn: GameConnection,
    readonly uiRoot: HTMLElement,
    private opts: SessionOptions,
  ) {
    this.me = conn.playerId;
    this.audio = opts.audio;
    this.entities = new EntityRenderer(this.world);
    gs.root.add(this.entities.group, this.ghost.group);
    const actions: HudActions = {
      send: (c) => this.send(c),
      startPlacement: (t) => this.startPlacement(t),
      cancelPlacement: () => this.input.setMode({ k: 'normal' }),
      startDig: (fill) => this.input.setMode({ k: 'dig', fill }),
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
    this.hud.formationHandler = (f) => {
      this.input.formation = f;
      this.hud.toast('Formation geändert');
    };
    this.input = new InputController(this);
    conn.onSnapshot = (s) => this.queue.push(s);
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
  }

  startPlacement(type: number): void {
    this.input.setMode({ k: 'place', type, rot: 0 });
    this.setSelection([], 0);
  }

  setSelection(units: number[], building: number): void {
    this.selection = { units, building };
    if (units.length) this.audio?.click();
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
  armAbility(_i: number): void {
    // Extreme-Meilenstein
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
    this.audio?.setVolume(st.volume);
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
    this.hud.toast(this.paused ? 'Pausiert' : 'Fortgesetzt');
  }

  openMenu(): void {
    this.opts.onMenu();
  }

  // ----- Frame -----
  private applySnapshots(nowMs: number): void {
    const q = this.queue;
    this.queue = [];
    for (const s of q) {
      this.world.apply(s, nowMs);
      if (s.full) {
        this.initAfterFull();
        this.gotFirst = true;
      }
      for (const t of this.world.tileChanges) {
        if (t < 0) continue;
        this.gs.terrain?.markTile(t % this.world.map.w, (t / this.world.map.w) | 0);
        this.gs.decor?.markDirty();
        this.hud.minimap.patchTile(t);
      }
      this.world.tileChanges.length = 0;
      this.handleEvents();
      if (s.winner !== undefined && !this.ended) this.onEnd(s.winner);
    }
  }

  private handleEvents(): void {
    const w = this.world;
    for (const e of w.events) {
      if (e.e === 'msg' && e.p === this.me) this.hud.toast(e.text);
      else if (e.e === 'alert' && e.p === this.me && this.alertCooldown <= 0) {
        this.alertCooldown = 6;
        this.hud.toast(e.k === 'attack' ? 'Wir werden angegriffen!' : 'Achtung!', true);
        this.audio?.alert();
      } else if (e.e === 'lose' && e.p === this.me) this.hud.banner('Niederlage', '#d8362f');
      else if (e.e === 'fx') this.audio?.fx(e.k, e.x, e.y, this.gs.cam.tx, this.gs.cam.tz);
    }
  }

  private onEnd(winner: number): void {
    this.ended = true;
    const won = winner === this.myTeam;
    this.hud.banner(won ? 'Sieg!' : winner < 0 ? 'Unentschieden' : 'Niederlage', won ? '#f0c040' : '#d8362f');
    setTimeout(() => this.opts.onMenu(), 3500);
  }

  frame(dt: number, nowSec: number): void {
    const nowMs = nowSec * 1000;
    if (!this.gotFirst && !this.queue.some((s) => s.full)) return;
    this.applySnapshots(nowMs);
    this.alertCooldown -= dt;
    // Eingabe/Kamera
    this.input.update(dt);
    // Fog
    if (this.fog) {
      this.fogTimer -= dt;
      if (this.fogTimer <= 0) {
        this.fogTimer = 0.25;
        this.fog.update(this.world, this.myTeam, this.teamOf);
      }
    }
    // Rendering
    const alpha = (nowMs - this.world.lastSnapMs) / (100 / this.speed);
    const sel = new Set(this.selection.units);
    this.entities.consumeEvents();
    this.entities.update(dt, {
      alpha,
      now: nowSec,
      camYaw: this.gs.cam.yaw,
      selected: sel,
      selectedBuilding: this.selection.building,
      hoverTile: null,
      visible: this.fog ? (x, y) => this.fog!.visible(x, y) : null,
      me: this.me,
      myTeam: this.myTeam,
      teamOfPlayer: this.teamOf,
    });
    this.entities.clearEvents();
    this.gs.render(dt, nowSec);
    // HUD (5 Hz)
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.2;
      this.hud.update(this.view, this.selection);
      this.hud.setAbilities([], () => {}, this.view);
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
      this.hud.fpsEl.textContent = `${this.fpsAcc.fps} FPS · Sim ${this.info.tickMs.toFixed(1)} ms · ${this.world.top ? this.info.units : 0} Einh.`;
    }
  }
  private fogTimer = 0;

  private initAfterFull(): void {
    const w = this.world;
    const setup = this.opts.setup;
    this.teamOf = w.players.map((p) => p.team);
    this.myTeam = this.teamOf[this.me] ?? 0;
    this.gs.setMap(w.map);
    this.gs.root.add(this.entities.group, this.ghost.group);
    this.hud.minimap.refreshTerrain();
    if (setup.fog) this.fog = new FogOfWar(w.map.w, w.map.h);
    const me: PublicPlayer | undefined = w.players[this.me];
    if (me) this.gs.cam.lookAt(me.keepX, me.keepY + 4);
    this.applySettings();
    void BUILDINGS;
    void BT;
    void PLAYER_COLORS;
  }

  destroy(): void {
    this.conn.close();
    this.input.destroy();
    this.hud.destroy();
    this.gs.root.remove(this.entities.group, this.ghost.group);
  }
}
