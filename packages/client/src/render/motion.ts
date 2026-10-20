import { UNITS, type ClientWorld } from '@strongpoly/shared';

const PI2 = Math.PI * 2;

/** kürzeste Winkeldifferenz b − a in (−π, π] */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % PI2;
  if (d > Math.PI) d -= PI2;
  else if (d <= -Math.PI) d += PI2;
  return d;
}

/** Blickrichtung weich der Zielrichtung nachführen: kürzester Weg, exponentielle Annäherung mit Zeitkonstante `tau`, begrenzte Drehrate. */
export function turnToward(face: number, target: number, dt: number, tau: number, maxRate: number): number {
  const d = angleDiff(face, target);
  let step = d * (1 - Math.exp(-dt / tau));
  const lim = maxRate * dt;
  if (step > lim) step = lim;
  else if (step < -lim) step = -lim;
  return face + step;
}

/** Schrittweite je Gehphase: Phasenradiant pro Tile (aus Schrittfrequenz und Sollgeschwindigkeit, Verhältnis wie bisher) */
export function stridePerTile(walkW: number, speed: number): number {
  return walkW / Math.max(0.5, speed);
}

/** Schwelle (Tiles/s), ab der eine Einheit als gehend gilt (mit Hysterese) */
const WALK_ON = 0.3;
const WALK_OFF = 0.12;
/** Zeitkonstanten (s) der Geschwindigkeits- und Richtungsglättung */
const TAU_SPEED = 0.09;
/** Zeitkonstante der Positionsglättung (s): nimmt die Rasterung der Snapshot-Positionen (1/16 Tile) heraus */
const TAU_POS = 0.045;
/** Abstand zwischen Zielpose und gezeichneter Pose, ab dem nicht geglättet, sondern gesprungen wird (Tiles) */
const SNAP_DIST = 1.5;
const TAU_DIR = 0.14;
/** Ausgleich der Gehphase beim Anhalten: mindestens diese Phasengeschwindigkeit (rad/s) bis zum nächsten Nulldurchgang */
const SETTLE_RATE = 8;

export interface MotionOpts {
  /** Darstellungszeit in Sim-Ticks; undefined → keine Zeitinterpolation (Benchmark-Szene), dann `alpha` mit prev/cur */
  tickF?: number;
  alpha: number;
  dt: number;
  paused: boolean;
  /** Schrittfrequenz der Gehanimation je Typ (rad/s, wie im Vertex-Shader) */
  walkW: ArrayLike<number>;
}

/**
 * Darstellungspose aller Einheiten: Position (aus der Historie der ClientWorld zur Darstellungszeit), Blickrichtung
 * (bei Bewegung aus der tatsächlichen Bahn, sonst aus der Sim-Ausrichtung, jeweils zeitbasiert geglättet) und Gehphase
 * (aus der zurückgelegten Strecke). Rein rechnerisch, ohne Three.js, damit Tests und das Messlabor dasselbe benutzen.
 */
export class UnitMotion {
  x = new Float32Array(8192);
  y = new Float32Array(8192);
  face = new Float32Array(8192);
  /** geglättete Geschwindigkeit (Tiles/s) und Geschwindigkeitsvektor */
  speed = new Float32Array(8192);
  private vx = new Float32Array(8192);
  private vy = new Float32Array(8192);
  /** Gehphase (rad) und Zustand der Schrittanimation */
  gait = new Float32Array(8192);
  walk = new Uint8Array(8192);
  private seen = new Int32Array(8192);
  /** Zähler und letzter Befund für die Debug-Anzeige */
  jumps = 0;
  lastJump = { id: 0, d: 0 };

  /** Alle Posen verwerfen (Voll-Snapshot/Reconnect): Einheiten starten neu an ihrer Position */
  reset(): void {
    this.seen.fill(0);
    this.jumps = 0;
  }

  /** hat die Einheit eine gültige Pose (aus dem letzten update)? */
  valid(s: number, id: number): boolean {
    return this.seen[s] === id;
  }

  update(w: ClientWorld, o: MotionOpts): void {
    const dt = o.dt;
    const timeBased = o.tickF !== undefined;
    for (let s = 0; s < w.top; s++) {
      const id = w.ids[s];
      if (id === 0) continue;
      let nx: number;
      let ny: number;
      if (timeBased) {
        w.sampleInto(s, o.tickF!, 0.3);
        nx = w.sx;
        ny = w.sy;
      } else {
        const a = Math.min(1.15, o.alpha);
        nx = w.prevX[s] + (w.curX[s] - w.prevX[s]) * a;
        ny = w.prevY[s] + (w.curY[s] - w.prevY[s]) * a;
      }
      const type = w.type[s];
      const fresh = this.seen[s] !== id;
      if (fresh) {
        this.seen[s] = id;
        this.x[s] = nx;
        this.y[s] = ny;
        this.face[s] = w.face[s];
        this.speed[s] = 0;
        this.vx[s] = 0;
        this.vy[s] = 0;
        this.gait[s] = 0;
        this.walk[s] = 0;
        continue;
      }
      if (o.paused || dt <= 1e-5) {
        // Pause: keine Bewegung, kein Phasenvorschub, Richtung bleibt
        this.speed[s] = 0;
        this.vx[s] = 0;
        this.vy[s] = 0;
        continue;
      }
      let tx = nx - this.x[s];
      let ty = ny - this.y[s];
      if (Math.hypot(tx, ty) > SNAP_DIST) {
        // Versetzung (Teleport, Spawn-Korrektur): ohne Wischen übernehmen, nicht in Geschwindigkeit/Richtung einrechnen
        this.jumps++;
        this.lastJump = { id, d: Math.hypot(tx, ty) };
        this.x[s] = nx;
        this.y[s] = ny;
        this.vx[s] = 0;
        this.vy[s] = 0;
        this.speed[s] = 0;
        continue;
      }
      const kp = timeBased ? 1 - Math.exp(-dt / TAU_POS) : 1;
      tx *= kp;
      ty *= kp;
      const dx = tx;
      const dy = ty;
      const d = Math.hypot(dx, dy);
      this.x[s] += tx;
      this.y[s] += ty;
      const kv = 1 - Math.exp(-dt / TAU_SPEED);
      const kd = 1 - Math.exp(-dt / TAU_DIR);
      const v = d / dt;
      this.speed[s] += (v - this.speed[s]) * kv;
      this.vx[s] += (dx / dt - this.vx[s]) * kd;
      this.vy[s] += (dy / dt - this.vy[s]) * kd;
      const def = UNITS[type];
      // Zustand der Schrittanimation (Hysterese)
      const sp = this.speed[s];
      let walking = this.walk[s] === 1;
      if (!walking && sp > WALK_ON) {
        walking = true;
        this.gait[s] = 0; // Schritt beginnt in der Neutralstellung
      }
      const stride = stridePerTile(o.walkW[type], def.speed);
      if (walking) {
        let rate = stride * sp;
        if (sp < WALK_OFF) {
          // anhalten: bis zum nächsten Nulldurchgang des Beinschwungs (Vielfache von π) auslaufen lassen
          rate = Math.max(rate, SETTLE_RATE);
          const g = this.gait[s];
          const next = Math.ceil(g / Math.PI) * Math.PI;
          const adv = rate * dt;
          if (g + adv >= next - 1e-4) {
            this.gait[s] = next;
            walking = false;
          } else this.gait[s] = g + adv;
        } else this.gait[s] += rate * dt;
      }
      this.walk[s] = walking ? 1 : 0;
      // Blickrichtung
      const vlen = Math.hypot(this.vx[s], this.vy[s]);
      const maxRate = def.side === 'siege' ? 1.6 : def.mounted ? 4.5 : 9;
      let target = w.face[s];
      let tau = 0.12;
      if (vlen > 0.35 && sp > 0.3) {
        target = Math.atan2(this.vx[s], this.vy[s]);
        tau = 0.1;
      }
      let f = turnToward(this.face[s], target, dt, tau, maxRate);
      if (f > Math.PI) f -= PI2;
      else if (f < -Math.PI) f += PI2;
      this.face[s] = f;
    }
  }
}
