import * as THREE from 'three';
import { HIST, RenderClock, UNITS, type ClientWorld } from '@strongpoly/shared';
import type { UnitMotion } from './motion';
import { groundYAt } from './util';

/** Kennzahlen der gezeichneten Bewegung (gleiche Definitionen wie das Messlabor in bench/motion_lab.ts) */
export interface MeterReport {
  frames: number;
  moveFrames: number;
  ratioP50: number;
  ratioP95: number;
  ratioP99: number;
  ratioMax: number;
  jumpPct: number;
  haltPct: number;
  backPct: number;
  reversalsPerMin: number;
  turnP95: number;
  turnMax: number;
  degPerTile: number;
  idleDriftMean: number;
  idleDriftP95: number;
  marchInPlacePct: number;
  slidePct: number;
  strideCV: number;
}

const RING = 40000;
function pct(a: Float32Array, n: number, p: number): number {
  if (!n) return 0;
  const b = a.slice(0, Math.min(n, a.length)).sort();
  return b[Math.min(b.length - 1, Math.floor((p / 100) * b.length))];
}

/**
 * Misst die tatsächlich gezeichnete Bewegung im laufenden Spiel: je Frame und Einheit Schrittverhältnis
 * (gezeichnete Geschwindigkeit / Sollgeschwindigkeit), Rückwärtsschritte, Richtungsumkehr, Drehrate, Drift
 * stehender Einheiten und Synchronität der Gehanimation. „Bewegt“ bzw. „stehend“ bestimmt die Positionshistorie
 * der ClientWorld (Sim-Wahrheit): bewegt = Weg der letzten 3 Ticks, stehend = seit ≥ 1,1 s kein Delta-Eintrag.
 */
export class MotionMeter {
  private ratios = new Float32Array(RING);
  private turns = new Float32Array(RING);
  private idleD = new Float32Array(8000);
  private nR = 0;
  private nT = 0;
  private nI = 0;
  private frames = 0;
  private moveFrames = 0;
  private jump = 0;
  private halt = 0;
  private back = 0;
  private rev = 0;
  private moveSec = 0;
  private deg = 0;
  private dist = 0;
  private march = 0;
  private slide = 0;
  private strideN = 0;
  private strideS = 0;
  private strideQ = 0;
  private px = new Float32Array(8192);
  private py = new Float32Array(8192);
  private pf = new Float32Array(8192);
  private pg = new Float32Array(8192);
  private pdx = new Float32Array(8192);
  private pdy = new Float32Array(8192);
  private pid = new Int32Array(8192);
  private win = new Map<number, { len: number; t: number }>();
  /** Ausreißer (Schrittverhältnis > 2) für die Ursachensuche: höchstens 40, neueste zuletzt */
  outliers: { tick: number; slot: number; ratio: number; dtMs: number; d: number; walk: number; hist: number }[] = [];
  /** nur diese Einheiten auswerten (null = alle) */
  filter: ((s: number) => boolean) | null = null;

  reset(): void {
    const f = this.filter;
    Object.assign(this, new MotionMeter());
    this.filter = f;
  }

  frame(w: ClientWorld, m: UnitMotion, dt: number, speed: number): void {
    if (dt <= 1e-4) return;
    this.frames++;
    const tickDur = 0.1 / speed;
    const T = w.tick;
    for (let s = 0; s < w.top; s++) {
      const id = w.ids[s];
      if (!id) {
        this.pid[s] = 0;
        continue;
      }
      if (!m.valid(s, id) || (this.filter && !this.filter(s))) continue;
      const x = m.x[s];
      const y = m.y[s];
      const f = m.face[s];
      if (this.pid[s] !== id) {
        this.pid[s] = id;
        this.px[s] = x;
        this.py[s] = y;
        this.pf[s] = f;
        this.pg[s] = m.gait[s];
        this.pdx[s] = 0;
        this.pdy[s] = 0;
        continue;
      }
      const dx = x - this.px[s];
      const dy = y - this.py[s];
      const d = Math.hypot(dx, dy);
      let df = f - this.pf[s];
      df = Math.atan2(Math.sin(df), Math.cos(df));
      const vn = UNITS[w.type[s]].speed * speed;
      // Sim-Wahrheit aus der Positionshistorie
      w.sampleInto(s, T, 0);
      const ax = w.sx;
      const ay = w.sy;
      w.sampleInto(s, T - 3, 0);
      const sdx = ax - w.sx;
      const sdy = ay - w.sy;
      const simMoving = w.hn[s] > 1 && Math.hypot(sdx, sdy) / (3 * tickDur) > 0.54 * vn;
      const simStill = T - w.ht[s * HIST + w.hh[s]] >= 11;
      const v = d / dt;
      if (simMoving) {
        this.moveFrames++;
        this.moveSec += dt;
        const r = v / vn;
        this.ratios[this.nR++ % RING] = r;
        if (r > 2) {
          this.jump++;
          if (this.outliers.length < 40) this.outliers.push({ tick: T, slot: s, ratio: r, dtMs: dt * 1000, d, walk: m.walk[s], hist: w.hn[s] });
        }
        if (r < 0.25) this.halt++;
        if (d > 0.002 && dx * sdx + dy * sdy < 0) this.back++;
        this.turns[this.nT++ % RING] = (Math.abs(df) * 180) / Math.PI / dt;
        this.deg += (Math.abs(df) * 180) / Math.PI;
        this.dist += d;
        const pd = Math.hypot(this.pdx[s], this.pdy[s]);
        if (d > 0.003 && pd > 0.003 && this.pdx[s] * dx + this.pdy[s] * dy < -0.5 * d * pd) this.rev++;
        const dg = m.gait[s] - this.pg[s];
        if (m.walk[s] && dg > 1e-4) {
          const st = d / dg;
          this.strideN++;
          this.strideS += st;
          this.strideQ += st * st;
        }
        if (m.walk[s] && v < 0.1 * vn) this.march++;
        if (!m.walk[s] && v > 0.5 * vn) this.slide++;
        this.win.delete(s);
      } else if (simStill) {
        let wd = this.win.get(s);
        if (!wd) this.win.set(s, (wd = { len: 0, t: 0 }));
        wd.len += d;
        wd.t += dt;
        if (wd.t >= 1) {
          this.idleD[this.nI++ % this.idleD.length] = wd.len / wd.t;
          this.win.delete(s);
        }
      } else this.win.delete(s);
      this.px[s] = x;
      this.py[s] = y;
      this.pf[s] = f;
      this.pg[s] = m.gait[s];
      this.pdx[s] = dx;
      this.pdy[s] = dy;
    }
  }

  report(): MeterReport {
    const mf = Math.max(1, this.moveFrames);
    const mean = (a: Float32Array, n: number): number => {
      const k = Math.min(n, a.length);
      let t = 0;
      for (let i = 0; i < k; i++) t += a[i];
      return k ? t / k : 0;
    };
    const sm = this.strideN ? this.strideS / this.strideN : 0;
    const sv = this.strideN ? Math.sqrt(Math.max(0, this.strideQ / this.strideN - sm * sm)) : 0;
    let tmax = 0;
    for (let i = 0; i < Math.min(this.nT, RING); i++) tmax = Math.max(tmax, this.turns[i]);
    let rmax = 0;
    for (let i = 0; i < Math.min(this.nR, RING); i++) rmax = Math.max(rmax, this.ratios[i]);
    return {
      frames: this.frames,
      moveFrames: this.moveFrames,
      ratioP50: pct(this.ratios, this.nR, 50),
      ratioP95: pct(this.ratios, this.nR, 95),
      ratioP99: pct(this.ratios, this.nR, 99),
      ratioMax: rmax,
      jumpPct: (100 * this.jump) / mf,
      haltPct: (100 * this.halt) / mf,
      backPct: (100 * this.back) / mf,
      reversalsPerMin: this.rev / Math.max(1e-6, this.moveSec / 60),
      turnP95: pct(this.turns, this.nT, 95),
      turnMax: tmax,
      degPerTile: this.deg / Math.max(1e-6, this.dist),
      idleDriftMean: mean(this.idleD, this.nI),
      idleDriftP95: pct(this.idleD, this.nI, 95),
      marchInPlacePct: (100 * this.march) / mf,
      slidePct: (100 * this.slide) / mf,
      strideCV: sm > 0 ? sv / sm : 0,
    };
  }
}

export interface DebugDeps {
  parent: HTMLElement;
  canvas: HTMLCanvasElement;
  world: ClientWorld;
  clock: RenderClock;
  motion: () => UnitMotion;
  camera: () => THREE.Camera;
  selected: () => number[];
  speed: () => number;
  paused: () => boolean;
  legacy: boolean;
}

const f2 = (n: number): string => n.toFixed(2);
const deg = (r: number): string => `${((r * 180) / Math.PI).toFixed(0)}°`;

/**
 * Bewegungs-Debug (URL ?motiondebug oder F10): Text (Uhr, Snapshot-Abstand, Korrekturereignisse, Kennzahlen,
 * Daten der ersten gewählten Einheit) und Zeichnung über dem Spiel: Sim-Position (rot), gezeichnete Position
 * (grün), Blickrichtung (cyan), Spur der gezeichneten Bahn.
 */
export class MotionDebug {
  readonly meter = new MotionMeter();
  private box: HTMLPreElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private on = false;
  /** Kennzahlen auch bei ausgeblendeter Anzeige mitführen (Messläufe, Prüfszenen) */
  measure = false;
  private events: string[] = [];
  private last = { resyncs: 0, cuts: 0, jumps: 0 };
  private gaps: number[] = [];
  private snapsFrame = 0;
  private lastSnapAt = 0;
  private underruns = 0;
  private bursts = 0;
  private txt = 0;
  private trails = new Map<number, number[]>();
  private t = 0;
  private v = { x: 0, y: 0, z: 0 };
  private pv = new THREE.Vector3();
  /** Aufzeichnung der gezeichneten Bahn einzelner Einheiten (Auswertung/Diagramme): je Frame t, x, y, Blick, Gehflag, Sim-Position */
  private traceSlots: number[] = [];
  trace: { t: number; slot: number; x: number; y: number; face: number; walk: number; sx: number; sy: number }[] = [];

  constructor(private d: DebugDeps) {
    this.box = document.createElement('pre');
    this.box.style.cssText = 'position:absolute;left:8px;top:64px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#d7f7d0;background:#000a;border:1px solid #fff3;border-radius:4px;pointer-events:none;z-index:40;white-space:pre;max-width:46ch;display:none';
    this.cv = document.createElement('canvas');
    this.cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:39;display:none';
    d.parent.append(this.cv, this.box);
    this.ctx = this.cv.getContext('2d');
  }

  /** Bahn dieser Slots je Frame aufzeichnen (leer = Aufzeichnung aus) */
  startTrace(slots: number[]): void {
    this.traceSlots = slots;
    this.trace = [];
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(v: boolean): void {
    this.on = v;
    this.box.style.display = v ? 'block' : 'none';
    this.cv.style.display = v ? 'block' : 'none';
    if (v) this.meter.reset();
  }
  toggle(): boolean {
    this.setEnabled(!this.on);
    return this.on;
  }

  /** Ankunft eines Snapshots (nur Zählung für „mehrere Snapshots pro Frame“ und den Abstand) */
  onSnapshot(atMs: number): void {
    this.snapsFrame++;
    if (this.lastSnapAt) {
      this.gaps.push(atMs - this.lastSnapAt);
      if (this.gaps.length > 120) this.gaps.shift();
    }
    this.lastSnapAt = atMs;
  }

  private log(msg: string): void {
    this.events.push(`${this.t.toFixed(1)}s ${msg}`);
    if (this.events.length > 6) this.events.shift();
  }

  /** je Frame, nach EntityRenderer.update */
  update(dt: number, nowSec: number): void {
    const { world: w, clock: c } = this.d;
    this.t = nowSec;
    if (!this.on && !this.measure) {
      this.snapsFrame = 0;
      return;
    }
    const m = this.d.motion();
    if (this.snapsFrame > 1) {
      this.bursts++;
      this.log(`${this.snapsFrame} Snapshots in einem Frame`);
    }
    this.snapsFrame = 0;
    if (c.resyncs !== this.last.resyncs) {
      this.log(`Uhr neu synchronisiert (Fehler ${f2(c.lastError)} Ticks)`);
      this.last.resyncs = c.resyncs;
    }
    if (w.cuts !== this.last.cuts) {
      const k = w.lastCut;
      this.log(`Teleport #${k.id & 8191}: ${Math.hypot(k.x1 - k.x0, k.y1 - k.y0).toFixed(1)} Tiles, nicht interpoliert`);
      this.last.cuts = w.cuts;
    }
    if (m.jumps !== this.last.jumps) {
      this.log(`Posensprung #${m.lastJump.id & 8191}: ${m.lastJump.d.toFixed(1)} Tiles`);
      this.last.jumps = m.jumps;
    }
    if (!this.d.paused() && c.render > c.latest + 0.05) {
      this.underruns++;
      if (this.underruns % 20 === 1) this.log('Puffer leer: es wird extrapoliert');
    }
    this.meter.frame(w, m, dt, this.d.speed());
    for (const s of this.traceSlots) if (w.ids[s]) this.trace.push({ t: nowSec, slot: s, x: m.x[s], y: m.y[s], face: m.face[s], walk: m.walk[s], sx: w.curX[s], sy: w.curY[s] });
    if (!this.on) return;
    // Text nur ca. 4 × pro Sekunde erneuern
    if (nowSec - this.txt > 0.25) {
      this.txt = nowSec;
      this.box.textContent = this.text(m);
    }
    this.draw(m);
  }

  private text(m: UnitMotion): string {
    const { world: w, clock: c } = this.d;
    const spd = this.d.speed();
    const g = this.gaps;
    let mean = 0;
    let max = 0;
    for (const x of g) {
      mean += x;
      max = Math.max(max, x);
    }
    mean = g.length ? mean / g.length : 0;
    const r = this.meter.report();
    const L: string[] = [];
    L.push(`BEWEGUNG${this.d.legacy ? ' (ALTES VERHALTEN)' : ''}  ${spd}×${this.d.paused() ? '  PAUSE' : ''}`);
    if (this.d.legacy) L.push(`alpha ${f2((performance.now() - w.lastSnapMs) / (100 / spd))} (Echtzeit seit Snapshot)`);
    else L.push(`Tick neu ${w.tick}  Darst. ${c.render.toFixed(2)}  Uhr ${c.est.toFixed(2)}  Faktor ${f2(c.alpha)}`);
    L.push(`Puffer ${f2(c.delay)} Ticks (${((c.delay * 100) / spd).toFixed(0)} ms)  Jitter ${f2(c.jitter)}  Fehler ${f2(c.lastError)}`);
    L.push(`Snapshot-Abstand Ø ${mean.toFixed(0)} ms, max ${max.toFixed(0)} ms  Bursts ${this.bursts}`);
    L.push(`Korrekturen: Resync ${c.resyncs}  Teleport ${w.cuts}  Posensprung ${m.jumps}  Leerlauf ${this.underruns}`);
    L.push(`Schritt p50/p95/max ${f2(r.ratioP50)}/${f2(r.ratioP95)}/${f2(r.ratioMax)}  Sprung ${r.jumpPct.toFixed(1)}%  rückw. ${r.backPct.toFixed(1)}%`);
    L.push(`Umkehr ${r.reversalsPerMin.toFixed(1)}/min  Dreh p95 ${r.turnP95.toFixed(0)}°/s  Stehende ${r.idleDriftMean.toFixed(3)} t/s`);
    L.push(`Gehen ohne Weg ${r.marchInPlacePct.toFixed(1)}%  Gleiten ${r.slidePct.toFixed(1)}%  Schritt-CV ${f2(r.strideCV)}  (${r.moveFrames} Fr.)`);
    const sel = this.d.selected();
    const id = sel.find((i) => w.slotOf(i) >= 0);
    if (id) {
      const s = w.slotOf(id);
      const def = UNITS[w.type[s]];
      L.push(`— ${def.name} #${s}: Zustand ${w.state[s]}  hist ${w.hn[s]}`);
      L.push(`Sim ${w.curX[s].toFixed(2)},${w.curY[s].toFixed(2)}  gezeichnet ${m.x[s].toFixed(2)},${m.y[s].toFixed(2)}  Abstand ${Math.hypot(w.curX[s] - m.x[s], w.curY[s] - m.y[s]).toFixed(2)}`);
      L.push(`Tempo ${m.speed[s].toFixed(2)} t/s (Soll ${def.speed})  Blick ${deg(m.face[s])} (Sim ${deg(w.face[s])})  Gehen ${m.walk[s]}  Phase ${m.gait[s].toFixed(1)}`);
    } else L.push('— keine Einheit gewählt (Auswahl zeigt Einzeldaten und Spuren)');
    for (const e of this.events) L.push(e);
    return L.join('\n');
  }

  private draw(m: UnitMotion): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cv = this.cv;
    const W = this.d.canvas.clientWidth;
    const H = this.d.canvas.clientHeight;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    ctx.clearRect(0, 0, W, H);
    const cam = this.d.camera();
    const w = this.d.world;
    const sel = this.d.selected();
    const slots: number[] = [];
    for (const id of sel) {
      const s = w.slotOf(id);
      if (s >= 0) slots.push(s);
      if (slots.length >= 80) break;
    }
    const seen = new Set<number>(slots);
    for (const s of [...this.trails.keys()]) if (!seen.has(s)) this.trails.delete(s);
    const proj = (x: number, y: number): [number, number] | null => {
      const v = this.v;
      v.x = x;
      v.y = groundYAt(w, x, y) + 0.1;
      v.z = y;
      const p = this.pv.set(x, v.y, y).project(cam);
      if (p.z > 1) return null;
      return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
    };
    for (const s of slots) {
      const a = proj(m.x[s], m.y[s]);
      const b = proj(w.curX[s], w.curY[s]);
      if (!a || !b) continue;
      // Spur der gezeichneten Bahn in Weltkoordinaten (wird jeden Frame neu projiziert)
      let tr = this.trails.get(s);
      if (!tr) this.trails.set(s, (tr = []));
      tr.push(m.x[s], m.y[s]);
      if (tr.length > 120) tr.splice(0, 2);
      ctx.strokeStyle = 'rgba(120,255,160,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < tr.length; i += 2) {
        const p = proj(tr[i], tr[i + 1]);
        if (!p) continue;
        if (started) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        started = true;
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.strokeStyle = '#ff4a4a';
      ctx.beginPath();
      ctx.arc(b[0], b[1], 4, 0, 6.283);
      ctx.stroke();
      ctx.fillStyle = '#3dff7a';
      ctx.beginPath();
      ctx.arc(a[0], a[1], 2.5, 0, 6.283);
      ctx.fill();
      // Blickrichtung (Sim-Konvention: face = atan2(dx, dy))
      const q = proj(m.x[s] + Math.sin(m.face[s]) * 0.8, m.y[s] + Math.cos(m.face[s]) * 0.8);
      if (q) {
        ctx.strokeStyle = '#46d9ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
    }
  }
}
