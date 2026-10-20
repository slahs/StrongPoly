import { ClientWorld, Snapshot, UNITS, UREC, U } from '@strongpoly/shared';
import { describe, expect, it } from 'vitest';
import { PROFILES, runLab } from '../bench/motion_lab';
import { LegacyPose } from '../bench/motion_legacy';
import { NewPose } from '../bench/motion_new';
import { motionScene } from '../src/game/motion_scenes';
import { angleDiff, stridePerTile, TURN_FOOT, turnToward, UnitMotion } from '../src/render/motion';
import { UNIT_WALK_W } from '../src/render/models_units';

describe('Winkelglättung', () => {
  it('angleDiff nimmt den kürzesten Weg über ±π', () => {
    expect(angleDiff(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6.0, 6);
    expect(angleDiff(-3.0, 3.0)).toBeCloseTo(6.0 - 2 * Math.PI, 6);
    expect(angleDiff(0.1, 0.3)).toBeCloseTo(0.2, 6);
    expect(Math.abs(angleDiff(0, Math.PI))).toBeCloseTo(Math.PI, 6);
  });

  it('turnToward dreht über den Wrap hinweg kurz herum und erreicht das Ziel ohne Überschwingen', () => {
    let f = 3.0;
    const target = -3.0; // kürzer: +0,28 rad über π hinaus
    let prev = Math.abs(angleDiff(f, target));
    for (let i = 0; i < 120; i++) {
      f = turnToward(f, target, 1 / 60, 0.1, 9);
      const d = Math.abs(angleDiff(f, target));
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
    expect(prev).toBeLessThan(1e-3);
  });

  it('turnToward begrenzt die Drehrate', () => {
    const f = turnToward(0, Math.PI, 1 / 60, 0.01, 6);
    expect(Math.abs(f)).toBeCloseTo(6 / 60, 6);
  });

  it('Zeitbasiert: gleiche Wegzeit, unabhängig von der Frame-Rate', () => {
    const run = (dt: number): number => {
      let f = 0;
      for (let t = 0; t < 0.3 - 1e-9; t += dt) f = turnToward(f, 1, dt, 0.1, 99);
      return f;
    };
    expect(run(1 / 60)).toBeCloseTo(run(1 / 20), 2);
  });
});

/** Welt mit einer Einheit, die sich mit v Tiles/s auf der x-Achse bewegt (Snapshot je Tick, auf 1/16 gerastert) */
function walker(v: number, type: number = U.Peasant): { w: ClientWorld; feed: (tick: number) => void } {
  const w = new ClientWorld();
  const feed = (tick: number): void => {
    const buf = new Uint8Array(UREC);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, (1 << 13) | 7, true);
    dv.setUint8(4, type);
    dv.setUint8(5, v > 0 ? 1 << 6 : 0);
    dv.setInt16(6, Math.round(10 * 16 + v * tick * 0.1 * 16), true);
    dv.setInt16(8, 10 * 16, true);
    dv.setUint8(10, 255);
    dv.setUint8(11, 64); // Sim-Richtung beliebig (π/2)
    dv.setUint8(12, v > 0 ? 1 : 0);
    const snap: Snapshot = { t: 'snap', full: false, tick, month: 0, units: buf, deadUnits: [], blds: [], bRemoved: [], tiles: new Int32Array(0), proj: new Float32Array(0), ladders: [], banners: [], events: [] };
    w.apply(snap, 0);
  };
  return { w, feed };
}

/** treibt UnitMotion mit 60 Frames/s über `secs` Sekunden; paused(t) bestimmt die Pausenphasen */
function drive(v: number, secs: number, type: number = U.Peasant, paused: (t: number) => boolean = () => false, endMoveAt = Infinity): { m: UnitMotion; log: { x: number; gait: number; walk: number; speed: number; face: number }[] } {
  const { w, feed } = walker(v, type);
  const m = new UnitMotion();
  const log: { x: number; gait: number; walk: number; speed: number; face: number }[] = [];
  let sent = 0;
  feed(0);
  for (let f = 0; f * (1 / 60) < secs; f++) {
    const t = f / 60;
    while (sent < Math.floor(t * 10) + 2) {
      sent++;
      // nach endMoveAt bleibt die Einheit stehen (kein Delta mehr)
      if (sent * 0.1 <= endMoveAt) feed(sent);
    }
    const tickF = Math.max(0, t * 10 - 1.2);
    m.update(w, { tickF, alpha: 0, dt: 1 / 60, paused: paused(t), walkW: UNIT_WALK_W });
    log.push({ x: m.x[7], gait: m.gait[7], walk: m.walk[7], speed: m.speed[7], face: m.face[7] });
  }
  return { m, log };
}

describe('Gehphase aus der tatsächlichen Bewegung', () => {
  it('Phase wächst proportional zur zurückgelegten Strecke (gleiche Schrittweite bei jedem Tempo)', () => {
    const per = (v: number): number => {
      const { log } = drive(v, 6);
      const a = log[120];
      const b = log[330];
      return (b.gait - a.gait) / (b.x - a.x);
    };
    const slow = per(0.9);
    const fast = per(1.7);
    expect(fast / slow).toBeCloseTo(1, 1);
    expect(slow).toBeCloseTo(stridePerTile(UNIT_WALK_W[U.Peasant], UNITS[U.Peasant].speed), 0);
  });

  it('steht die Einheit (auch bei gesetztem Sim-Bewegungsflag), läuft keine Schrittanimation (kein Marschieren auf der Stelle)', () => {
    // Sim meldet "bewegt" (Flag), aber die Position ändert sich nicht
    const { w, feed } = walker(0);
    const m = new UnitMotion();
    feed(0);
    w.flags[7] = 4; // Sim-Flag "geht"
    for (let f = 0; f < 120; f++) {
      m.update(w, { tickF: 0, alpha: 0, dt: 1 / 60, paused: false, walkW: UNIT_WALK_W });
      expect(m.walk[7]).toBe(0);
    }
    expect(m.gait[7]).toBe(0);
  });

  it('beim Anhalten läuft die Phase bis zum nächsten Nulldurchgang aus (kein Beinsprung)', () => {
    const { log } = drive(1.7, 8, U.Peasant, () => false, 3);
    // nach dem Stillstand der Einheit: Zustand endet in einem Vielfachen von π
    const end = log[log.length - 1];
    expect(end.walk).toBe(0);
    const k = end.gait / Math.PI;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-3);
    // und die Phase bleibt danach konstant
    expect(log[log.length - 1].gait).toBe(log[log.length - 60].gait);
  });

  it('Pause: keine Bewegung und kein Phasenvorschub', () => {
    const { log } = drive(1.7, 6, U.Peasant, (t) => t >= 3 && t < 5);
    const a = log[190]; // t ≈ 3,17
    const b = log[290]; // t ≈ 4,83
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.gait).toBeCloseTo(a.gait, 6);
    // nach der Pause geht es weiter
    expect(log[359].x).toBeGreaterThan(b.x);
  });
});

describe('Blickrichtung bei Bewegung', () => {
  it('folgt der tatsächlichen Bahn, nicht dem (verrauschten) Sim-Wert', () => {
    // Sim-Blickrichtung im Snapshot steht bei π/2 (x-Richtung = atan2(1,0) = π/2); Einheit läuft in +x → passt
    const { log } = drive(1.7, 4);
    expect(log[200].face).toBeCloseTo(Math.PI / 2, 1);
  });

  it('wechselt nie sprunghaft: Drehung pro Frame höchstens maxRate·dt', () => {
    const { log } = drive(1.7, 4);
    for (let i = 1; i < log.length; i++) expect(Math.abs(angleDiff(log[i - 1].face, log[i].face))).toBeLessThanOrEqual((TURN_FOOT / 60) * 1.001);
  });
});

const LAB = { scene: motionScene('pawns')!, profile: PROFILES.local60 };

describe('Messlabor: Bauern vor dem Bergfried (Sim → Snapshot → ClientWorld → Pose)', () => {
  const legacy = runLab(() => new LegacyPose(), { ...LAB, scene: { ...LAB.scene, ticks: 500 } });
  const modern = runLab(() => new NewPose(), { ...LAB, scene: { ...LAB.scene, ticks: 500 } });

  it('Befund alt: stehende Einheiten pendeln weiter, Schritte springen, Richtung kehrt um, Schrittanimation läuft auf der Stelle', () => {
    expect(legacy.idleDriftMean).toBeGreaterThan(0.2);
    expect(legacy.jumpPct).toBeGreaterThan(2);
    expect(legacy.reversalsPerMin).toBeGreaterThan(30);
    expect(legacy.backPct).toBeGreaterThan(1);
    expect(legacy.marchInPlacePct).toBeGreaterThan(2);
    expect(legacy.strideCV).toBeGreaterThan(0.35);
  });

  it('neu: Stehende bleiben ruhig, gleichmäßige Schritte, keine Umkehr, Schrittanimation passt zur Bewegung', () => {
    expect(modern.idleDriftMean).toBeLessThan(0.02);
    expect(modern.jumpPct).toBeLessThan(0.3);
    expect(modern.haltPct).toBeLessThan(1.5);
    expect(modern.reversalsPerMin).toBeLessThan(5);
    expect(modern.backPct).toBeLessThan(0.3);
    expect(modern.ratioP95).toBeLessThan(1.35);
    expect(modern.marchInPlacePct).toBeLessThan(0.5);
    expect(modern.strideCV).toBeLessThan(0.25);
  });
});

describe('Messlabor: Zeitprofile, Geschwindigkeit, Pause, Reconnect', () => {
  const scene = { ...motionScene('gate')!, ticks: 420 };

  it('stabil bei Frame-Jitter, 30 FPS und Netz-Jitter', () => {
    for (const p of ['local60j', 'local30', 'net60']) {
      const st = runLab(() => new NewPose(), { scene, profile: PROFILES[p] });
      expect(st.jumpPct, p).toBeLessThan(0.5);
      expect(st.backPct, p).toBeLessThan(0.6);
      expect(st.ratioP95, p).toBeLessThan(1.45);
      expect(st.idleDriftMean, p).toBeLessThan(0.05);
    }
  });

  it('Spielgeschwindigkeit 2× und 3×: weiterhin gleichmäßig', () => {
    for (const sp of [2, 3]) {
      const st = runLab(() => new NewPose(), { scene, profile: PROFILES.local60, speed: sp });
      expect(st.jumpPct, `x${sp}`).toBeLessThan(0.5);
      expect(st.ratioP95, `x${sp}`).toBeLessThan(1.5);
    }
  });

  it('Pause: alle Einheiten stehen still, ohne Nachlaufen; danach geht es ohne Sprung weiter', () => {
    const rec: { pos: number[]; paused: boolean; gait: number[] }[] = [];
    const st = runLab(() => new NewPose(), {
      scene,
      profile: PROFILES.local60j,
      pause: { fromTick: 200, ms: 1500 },
      onFrame: (m, fi, sim) => {
        const mm = (m as NewPose).motion;
        const pos: number[] = [];
        const gait: number[] = [];
        for (let s = 0; s < sim.units.top; s++) if (sim.units.alive[s]) { pos.push(mm.x[s], mm.y[s]); gait.push(mm.gait[s]); }
        rec.push({ pos, paused: fi.paused, gait });
      },
    });
    // ab dem dritten Pausenframe ändert sich nichts mehr
    const idx = rec.map((r, i) => (r.paused ? i : -1)).filter((i) => i >= 0);
    expect(idx.length).toBeGreaterThan(60);
    const a = rec[idx[3]];
    const b = rec[idx[idx.length - 1]];
    expect(b.pos).toEqual(a.pos);
    expect(b.gait).toEqual(a.gait);
    expect(st.maxStep).toBeLessThan(0.35);
  });

  it('Reconnect (Voll-Snapshot mitten in der Bewegung): kein Sprung der Einheiten', () => {
    const st = runLab(() => new NewPose(), { scene, profile: PROFILES.net60, reconnectAtTick: 150 });
    expect(st.maxStep).toBeLessThan(0.35);
  });
});
