/**
 * Headless-Messlabor für die Bewegungskette (Meilenstein 4A): Sim → GameHost → Snapshot → ClientWorld →
 * Darstellungsmodell → gerenderte Pose pro Frame. Die Zeitachse (Worker-Timer, Übertragung, Frame-Takt)
 * wird simuliert, damit Jitter-Profile reproduzierbar sind. Die Auswertung quantifiziert Sprünge,
 * Rückwärtsschritte, Richtungs-Zittern, Drehraten und die Synchronität der Gehanimation.
 */
import {
  ClientWorld,
  Command,
  GameHost,
  generateMap,
  Sim,
  Snapshot,
  UNITS,
  U,
} from '@strongpoly/shared';
import type { MotionScene, SceneApi } from '../src/game/motion_scenes';

// ---------------------------------------------------------------- Zufall
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- Zeitprofile
export interface Profile {
  name: string;
  /** Intervall des Worker-Timers (ms) und dessen Jitter (± ms) */
  workerMs: number;
  workerJit: number;
  /** Übertragungsdauer Worker → Hauptthread bzw. Server → Client (ms): Basis + Zufall */
  latBase: number;
  latJit: number;
  /** mittlere Frame-Zeit (ms), Gauß-Streuung, Aussetzer: Wahrscheinlichkeit und Länge (ms) */
  frameMs: number;
  frameSigma: number;
  hitchP: number;
  hitchMs: number;
}

export const PROFILES: Record<string, Profile> = {
  /** Singleplayer, 60 Hz, ruhiger Rechner */
  local60: { name: 'local60', workerMs: 40, workerJit: 2, latBase: 1, latJit: 3, frameMs: 1000 / 60, frameSigma: 0.5, hitchP: 0, hitchMs: 0 },
  /** Singleplayer, unruhiger Rechner (Safari/Last): Frame-Jitter und gelegentliche Hänger */
  local60j: { name: 'local60j', workerMs: 40, workerJit: 6, latBase: 2, latJit: 8, frameMs: 1000 / 60, frameSigma: 3, hitchP: 0.01, hitchMs: 60 },
  /** 30 FPS (Software-GL / schwache GPU) */
  local30: { name: 'local30', workerMs: 40, workerJit: 3, latBase: 2, latJit: 6, frameMs: 1000 / 30, frameSigma: 2, hitchP: 0.01, hitchMs: 80 },
  /** Online-Spiel: Übertragungsjitter, Server-Takt exakt */
  net60: { name: 'net60', workerMs: 100, workerJit: 1, latBase: 30, latJit: 35, frameMs: 1000 / 60, frameSigma: 0.8, hitchP: 0, hitchMs: 0 },
};

// ---------------------------------------------------------------- Pose-Modelle
export interface FrameInfo {
  world: ClientWorld;
  /** Frame-Zeit (ms) und Dauer seit dem letzten Frame (s) */
  nowMs: number;
  dt: number;
  speed: number;
  paused: boolean;
}

export interface Pose {
  x: number;
  y: number;
  face: number;
  moving: boolean;
  /** Gehphase (rad), nur zur Auswertung */
  gait: number;
}

export interface PoseModel {
  /** zu Beginn jedes Frames, vor dem Einlesen der Snapshots (Uhr weiterstellen) */
  advance?(f: FrameInfo): void;
  /** je eingelesenem Snapshot (lateMs: Zeit seit der Ankunft) */
  onSnapshot?(s: Snapshot, lateMs: number, arrivalMs: number, speed: number): void;
  /** nach dem Einlesen der Snapshots: Posen berechnen */
  frame(f: FrameInfo): void;
  /** wird nach einem Voll-Snapshot (Reconnect/Start) aufgerufen */
  reset?(): void;
  pose(s: number, out: Pose): void;
}

// ---------------------------------------------------------------- Szenen-Treiber (Sim direkt)
export function mkSimApi(sim: Sim, pending: Command[]): SceneApi {
  const st = sim.map.starts[0];
  const keep = sim.buildings.get(sim.players[0].keepId)!;
  return {
    map: sim.map,
    bldAt: (i) => sim.bldAt[i],
    home: { x: keep ? keep.cx : st.x, y: keep ? keep.cy : st.y },
    spawn(type, x, y, n, stance = 2) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      for (let i = 0; i < n; i++) {
        const s = sim.spawnUnit(type, 0, x + (i % cols) * 0.7, y + Math.floor(i / cols) * 0.7);
        if (s >= 0) {
          sim.units.stance[s] = stance;
          sim.units.ax[s] = sim.units.x[s];
          sim.units.ay[s] = sim.units.y[s];
        }
      }
    },
    build(type, x, y, rot = 0) {
      sim.addBuilding(0, type, x, y, rot);
    },
    order(rect, mk, types) {
      const u = sim.units;
      const ids: number[] = [];
      for (let s = 0; s < u.top; s++) {
        if (!u.alive[s] || u.owner[s] !== 0 || u.type[s] === U.Lord) continue;
        if (types && !types.includes(u.type[s])) continue;
        if (u.x[s] < rect[0] || u.x[s] > rect[2] || u.y[s] < rect[1] || u.y[s] > rect[3]) continue;
        ids.push(u.id(s));
      }
      if (ids.length) pending.push(mk(ids));
    },
  };
}

// ---------------------------------------------------------------- Messung
export interface Stats {
  frames: number;
  /** Einheiten-Frames in gleichmäßiger Bewegung */
  moveFrames: number;
  /** Schrittverhältnis Rendergeschwindigkeit / Sollgeschwindigkeit: Perzentile */
  ratioP50: number;
  ratioP95: number;
  ratioP99: number;
  ratioMax: number;
  /** Anteil der Bewegungsframes mit Sprung (Verhältnis > 2) bzw. Stillstand (< 0,25) */
  jumpPct: number;
  haltPct: number;
  /** Anteil der Bewegungsframes mit Rückwärtsschritt (gegen die Simulationsrichtung) */
  backPct: number;
  /** Richtungsumkehrungen der gerenderten Bahn je Einheit und Minute */
  reversalsPerMin: number;
  /** Drehrate in Grad/s (nur Bewegungsframes) */
  turnP95: number;
  turnP99: number;
  turnMax: number;
  /** gesamte Drehung pro zurückgelegtem Tile (Grad/Tile) */
  degPerTile: number;
  /** Vorzeichenwechsel der Drehung (>3°) je Einheit und Minute: Zittern der Blickrichtung */
  faceFlipsPerMin: number;
  /** Einheiten, die laut Sim stehen: gerenderte Wegstrecke je Sekunde (Tiles/s, Mittel / p95) und Drehung (Grad/s) */
  idleDriftMean: number;
  idleDriftP95: number;
  idleTurnMean: number;
  /** Schrittlänge je Gehphase: Variationskoeffizient (0 = perfekt synchron) */
  strideCV: number;
  /** Anteil Frames: Gehanimation an, aber Einheit steht (<0,1 Sollgeschw.) bzw. Einheit läuft (>0,5), Animation aus */
  marchInPlacePct: number;
  slidePct: number;
  /** größter Positionssprung einer Einheit zwischen zwei Frames (Tiles), beliebiger Zustand */
  maxStep: number;
}

function pct(a: number[], p: number): number {
  if (!a.length) return 0;
  const b = Float64Array.from(a).sort();
  return b[Math.min(b.length - 1, Math.floor((p / 100) * b.length))];
}

class Recorder {
  private ratios: number[] = [];
  private turns: number[] = [];
  private idleDrift: number[] = [];
  private idleTurn: number[] = [];
  private strides: number[] = [];
  private frames = 0;
  private moveFrames = 0;
  private jump = 0;
  private halt = 0;
  private back = 0;
  private reversals = 0;
  private flips = 0;
  private moveUnitSec = 0;
  private degSum = 0;
  private distSum = 0;
  private march = 0;
  private slide = 0;
  private maxStep = 0;
  private movingFramesForFlags = 0;
  // je Slot
  private id = new Int32Array(8192);
  private px = new Float32Array(8192);
  private py = new Float32Array(8192);
  private pf = new Float32Array(8192);
  private pg = new Float32Array(8192);
  private pdx = new Float32Array(8192);
  private pdy = new Float32Array(8192);
  private pdf = new Float32Array(8192);
  // Sim-Wahrheit: Position vor 3 Ticks
  private hist: Float32Array[] = [];
  private win = new Map<number, { x: number; y: number; len: number; turn: number; t: number }>();

  constructor(private sim: Sim) {}

  /** nach jedem Sim-Tick: Positionshistorie (für Sim-Bewegungsrichtung) */
  onTick(): void {
    const u = this.sim.units;
    const a = new Float32Array(u.top * 2);
    for (let s = 0; s < u.top; s++) {
      a[s * 2] = u.x[s];
      a[s * 2 + 1] = u.y[s];
    }
    this.hist.push(a);
    if (this.hist.length > 12) this.hist.shift();
  }

  frame(m: PoseModel, world: ClientWorld, dt: number, speed: number, tickDur: number): void {
    const u = this.sim.units;
    const o: Pose = { x: 0, y: 0, face: 0, moving: false, gait: 0 };
    this.frames++;
    const h = this.hist;
    for (let s = 0; s < u.top; s++) {
      if (!u.alive[s]) {
        this.id[s] = 0;
        continue;
      }
      const uid = u.id(s);
      // erst auswerten, wenn der Client die Einheit kennt (Snapshot angekommen)
      if (world.ids[s] !== uid) {
        this.id[s] = 0;
        continue;
      }
      m.pose(s, o);
      if (this.id[s] !== uid) {
        this.id[s] = uid;
        this.px[s] = o.x; this.py[s] = o.y; this.pf[s] = o.face; this.pg[s] = o.gait;
        this.pdx[s] = 0; this.pdy[s] = 0; this.pdf[s] = 0;
        continue;
      }
      const dx = o.x - this.px[s];
      const dy = o.y - this.py[s];
      const d = Math.hypot(dx, dy);
      let df = o.face - this.pf[s];
      df = Math.atan2(Math.sin(df), Math.cos(df));
      const def = UNITS[u.type[s]];
      const vn = def.speed * speed;
      // Sim-Wahrheit: Bewegung der letzten 3 Ticks
      let sdx = 0;
      let sdy = 0;
      if (h.length >= 4 && u.type[s] !== U.Ox) {
        const a = h[h.length - 1];
        const b = h[h.length - 4];
        sdx = a[s * 2] - b[s * 2];
        sdy = a[s * 2 + 1] - b[s * 2 + 1];
      }
      const simSpeed = Math.hypot(sdx, sdy) / (3 * tickDur);
      const simMoving = simSpeed > 0.6 * vn * 0.9 && h.length >= 4;
      const simStill = h.length >= 11 && Math.hypot(h[h.length - 1][s * 2] - h[0][s * 2], h[h.length - 1][s * 2 + 1] - h[0][s * 2 + 1]) < 0.05;
      if (d > this.maxStep) this.maxStep = d;
      const v = d / dt;
      // Gehphase: Schrittlänge je Phasenradiant
      const dg = o.gait - this.pg[s];
      if (simMoving) {
        this.moveFrames++;
        this.moveUnitSec += dt;
        const r = v / vn;
        this.ratios.push(r);
        if (r > 2) this.jump++;
        if (r < 0.25) this.halt++;
        if (d > 0.002 && dx * sdx + dy * sdy < 0) this.back++;
        const turn = (Math.abs(df) * 180) / Math.PI / dt;
        this.turns.push(turn);
        this.degSum += (Math.abs(df) * 180) / Math.PI;
        this.distSum += d;
        if (d > 0.003 && this.pdx[s] * dx + this.pdy[s] * dy < -0.5 * d * Math.hypot(this.pdx[s], this.pdy[s]) && Math.hypot(this.pdx[s], this.pdy[s]) > 0.003) this.reversals++;
        if (Math.abs(df) > (3 * Math.PI) / 180 && Math.abs(this.pdf[s]) > (3 * Math.PI) / 180 && df * this.pdf[s] < 0) this.flips++;
        if (o.moving && dg > 1e-4) this.strides.push(d / dg);
        this.movingFramesForFlags++;
        if (o.moving && v < 0.1 * vn) this.march++;
        if (!o.moving && v > 0.5 * vn) this.slide++;
      } else if (simStill) {
        // Stehende: gerenderte Wegstrecke und Drehung im Sekundenfenster
        let w = this.win.get(s);
        if (!w) {
          w = { x: o.x, y: o.y, len: 0, turn: 0, t: 0 };
          this.win.set(s, w);
        }
        w.len += d;
        w.turn += (Math.abs(df) * 180) / Math.PI;
        w.t += dt;
        if (w.t >= 1) {
          this.idleDrift.push(w.len / w.t);
          this.idleTurn.push(w.turn / w.t);
          this.win.delete(s);
        }
      } else this.win.delete(s);
      this.px[s] = o.x; this.py[s] = o.y; this.pf[s] = o.face; this.pg[s] = o.gait;
      this.pdx[s] = dx; this.pdy[s] = dy; this.pdf[s] = df;
    }
  }

  result(): Stats {
    const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const sm = mean(this.strides);
    const sv = this.strides.length ? Math.sqrt(mean(this.strides.map((x) => (x - sm) * (x - sm)))) : 0;
    const mf = Math.max(1, this.moveFrames);
    const minutes = Math.max(1e-6, this.moveUnitSec / 60);
    return {
      frames: this.frames,
      moveFrames: this.moveFrames,
      ratioP50: pct(this.ratios, 50),
      ratioP95: pct(this.ratios, 95),
      ratioP99: pct(this.ratios, 99),
      ratioMax: this.ratios.reduce((a, b) => Math.max(a, b), 0),
      jumpPct: (100 * this.jump) / mf,
      haltPct: (100 * this.halt) / mf,
      backPct: (100 * this.back) / mf,
      reversalsPerMin: this.reversals / minutes,
      turnP95: pct(this.turns, 95),
      turnP99: pct(this.turns, 99),
      turnMax: this.turns.reduce((a, b) => Math.max(a, b), 0),
      degPerTile: this.degSum / Math.max(1e-6, this.distSum),
      faceFlipsPerMin: this.flips / minutes,
      idleDriftMean: mean(this.idleDrift),
      idleDriftP95: pct(this.idleDrift, 95),
      idleTurnMean: mean(this.idleTurn),
      strideCV: sm > 0 ? sv / sm : 0,
      marchInPlacePct: (100 * this.march) / mf,
      slidePct: (100 * this.slide) / mf,
      maxStep: this.maxStep,
    };
  }
}

// ---------------------------------------------------------------- Lauf
export interface RunOpts {
  scene: MotionScene;
  profile: Profile;
  /** Spielgeschwindigkeit */
  speed?: number;
  seed?: number;
  /** Ticks überspringen, bevor gemessen wird (Aufbau/Anlauf) */
  warmTicks?: number;
  /** Pause: ab diesem Tick pausiert der Host für `ms` Echtzeit-Millisekunden */
  pause?: { fromTick: number; ms: number };
  /** Voll-Snapshot (Reconnect) ab diesem Tick einspielen */
  reconnectAtTick?: number;
  /** Frame-Hook zusätzlich zum Messen (z. B. Spurenaufzeichnung); sim: Zugriff auf die Simulation */
  onFrame?: (m: PoseModel, fi: FrameInfo, sim: Sim) => void;
}

export function runLab(mkModel: () => PoseModel, o: RunOpts): Stats {
  const speed = o.speed ?? 1;
  const seed = o.seed ?? 1;
  const map = generateMap({ seed, size: 128, players: 2 });
  const sim = new Sim({
    map,
    seed,
    players: [
      { name: 'A', team: 0, kind: 'human' },
      { name: 'B', team: 1, kind: 'human' },
    ],
    startGold: 3000,
    troopLimit: 1000,
    fog: false,
    extreme: false,
  });
  const pending: Command[] = [];
  const api = mkSimApi(sim, pending);
  o.scene.setup(api);
  const host = new GameHost(sim);
  host.speed = speed;
  const world = new ClientWorld();
  const model = mkModel();
  const rec = new Recorder(sim);
  const rnd = rng(seed * 7919 + 13);
  const gauss = (): number => {
    let s = 0;
    for (let i = 0; i < 6; i++) s += rnd();
    return (s - 3) / 0.7071;
  };
  const P = o.profile;

  const first = host.fullSnapshot();
  world.apply(first, 0);
  model.reset?.();

  let tw = P.workerMs; // nächster Worker-Lauf
  let lastW = 0;
  let nextFrame = 5 + rnd() * 10;
  let lastFrame = nextFrame - P.frameMs;
  const inbox: { at: number; snap: Snapshot }[] = [];
  const arrived: { snap: Snapshot; at: number }[] = [];
  let lastArrive = 0;
  const endTick = o.scene.ticks + (o.warmTicks ?? 40);
  const warm = o.warmTicks ?? 40;
  let measuring = false;
  const tickDur = 0.1 / speed;
  let pauseDone = false;
  let reconDone = false;
  let pauseUntil = 0;
  let safety = 0;
  while ((sim.tick < endTick || host.paused) && safety++ < 2_000_000) {
    // nächstes Ereignis: Ankunft, Worker-Lauf oder Frame (bei Gleichstand in dieser Reihenfolge)
    const nextArr = inbox.length ? inbox[0].at : Infinity;
    if (nextArr <= tw && nextArr <= nextFrame) {
      { const m = inbox.shift()!; arrived.push({ snap: m.snap, at: m.at }); }
      continue;
    }
    if (tw <= nextFrame) {
      // Worker-Schleife (setInterval 40 ms): Sim vorwärts, danach Skript/Befehle für den nächsten Tick
      const now = tw + (rnd() * 2 - 1) * P.workerJit;
      const dt = Math.min(250, now - lastW);
      lastW = now;
      if (o.pause && !pauseDone && sim.tick >= o.pause.fromTick) {
        host.paused = true;
        pauseDone = true;
        pauseUntil = now + o.pause.ms;
      }
      if (host.paused && o.pause && now >= pauseUntil) host.paused = false;
      const snaps = host.advance(dt);
      if (o.reconnectAtTick !== undefined && !reconDone && sim.tick >= o.reconnectAtTick) {
        reconDone = true;
        snaps.push(host.fullSnapshot());
      }
      for (const s of snaps) {
        rec.onTick();
        const lat = P.latBase + rnd() * P.latJit;
        lastArrive = Math.max(lastArrive + 0.01, now + lat);
        inbox.push({ at: lastArrive, snap: s });
        o.scene.step?.(api, sim.tick);
        for (const c of pending) host.submit(0, c);
        pending.length = 0;
      }
      tw += P.workerMs;
      continue;
    }
    // Frame
    const now = nextFrame;
    const dtMs = now - lastFrame;
    lastFrame = now;
    // Snapshots verarbeiten wie Session.applySnapshots
    const fi: FrameInfo = { world, nowMs: now, dt: dtMs / 1000, speed, paused: host.paused };
    model.advance?.(fi);
    for (const m of arrived) {
      world.apply(m.snap, now);
      if (m.snap.full) model.reset?.();
      model.onSnapshot?.(m.snap, now - m.at, m.at, speed);
    }
    arrived.length = 0;
    model.frame(fi);
    if (!measuring && sim.tick >= warm) {
      measuring = true;
    }
    if (measuring) rec.frame(model, world, dtMs / 1000, speed, tickDur);
    o.onFrame?.(model, fi, sim);
    let step = P.frameMs + gauss() * P.frameSigma;
    if (P.hitchP && rnd() < P.hitchP) step += P.hitchMs;
    nextFrame += Math.max(4, step);
  }
  return rec.result();
}

export function fmt(st: Stats): string {
  const f = (n: number, d = 2): string => n.toFixed(d);
  return [
    `Schritt p50/p95/p99/max ${f(st.ratioP50)}/${f(st.ratioP95)}/${f(st.ratioP99)}/${f(st.ratioMax)}`,
    `Sprung ${f(st.jumpPct)}% Halt ${f(st.haltPct)}% rückw. ${f(st.backPct)}%`,
    `Umkehr ${f(st.reversalsPerMin, 1)}/min`,
    `Drehung p95/p99/max ${f(st.turnP95, 0)}/${f(st.turnP99, 0)}/${f(st.turnMax, 0)}°/s, ${f(st.degPerTile, 0)}°/Tile, Flips ${f(st.faceFlipsPerMin, 1)}/min`,
    `Stehende: Drift ${f(st.idleDriftMean, 3)} (p95 ${f(st.idleDriftP95, 3)}) t/s, Dreh ${f(st.idleTurnMean, 1)}°/s`,
    `max. Frame-Sprung ${f(st.maxStep, 3)} t`,
    `Schritt-CV ${f(st.strideCV)} Marsch-auf-Stelle ${f(st.marchInPlacePct)}% Gleiten ${f(st.slidePct)}%`,
  ].join(' | ');
}
