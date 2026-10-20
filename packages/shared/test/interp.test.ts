import { describe, expect, it } from 'vitest';
import { ClientWorld, RenderClock, Snapshot, UREC } from '../src';

/** Delta-Snapshot mit den angegebenen Einheiten (id = Slot + Generation 1, Position in Tiles) */
function snap(tick: number, units: { s: number; x: number; y: number; state?: number }[]): Snapshot {
  const buf = new Uint8Array(units.length * UREC);
  const dv = new DataView(buf.buffer);
  units.forEach((u, k) => {
    const o = k * UREC;
    dv.setUint32(o, (1 << 13) | u.s, true);
    dv.setUint8(o + 4, 3);
    dv.setUint8(o + 5, 0);
    dv.setInt16(o + 6, Math.round(u.x * 16), true);
    dv.setInt16(o + 8, Math.round(u.y * 16), true);
    dv.setUint8(o + 10, 255);
    dv.setUint8(o + 12, u.state ?? 1);
  });
  return {
    t: 'snap',
    full: false,
    tick,
    month: 0,
    units: buf,
    deadUnits: [],
    blds: [],
    bRemoved: [],
    tiles: new Int32Array(0),
    proj: new Float32Array(0),
    ladders: [],
    banners: [],
    events: [],
  };
}

function sample(w: ClientWorld, s: number, t: number, extra = 0): [number, number] {
  w.sampleInto(s, t, extra);
  return [w.sx, w.sy];
}

describe('Positionshistorie (ClientWorld)', () => {
  it('interpoliert linear zwischen den Ticks', () => {
    const w = new ClientWorld();
    w.apply(snap(10, [{ s: 5, x: 2, y: 3 }]), 0);
    w.apply(snap(11, [{ s: 5, x: 2.5, y: 3 }]), 100);
    w.apply(snap(12, [{ s: 5, x: 3, y: 3 }]), 200);
    expect(sample(w, 5, 10.5)[0]).toBeCloseTo(2.25, 3);
    expect(sample(w, 5, 11.5)[0]).toBeCloseTo(2.75, 3);
    expect(sample(w, 5, 12)[0]).toBeCloseTo(3, 3);
    // vor der ältesten Stützstelle: halten
    expect(sample(w, 5, 5)[0]).toBeCloseTo(2, 3);
  });

  it('Einheit ohne Delta-Eintrag steht still: kein Zurückpendeln auf die vorige Position (Regression)', () => {
    const w = new ClientWorld();
    w.apply(snap(10, [{ s: 1, x: 5, y: 5 }]), 0);
    w.apply(snap(11, [{ s: 1, x: 5.1875, y: 5 }]), 100); // letzter Schritt (Positionen sind auf 1/16 Tile gerastert)
    // danach kommt kein Eintrag mehr (Zustand unverändert): die Einheit steht bei x = 5,1875
    for (let t = 12; t <= 20; t++) w.apply(snap(t, [{ s: 2, x: 9 + t, y: 1 }]), t * 100);
    const xs: number[] = [];
    for (let t = 12; t < 20; t += 0.1) xs.push(sample(w, 1, t)[0]);
    for (const x of xs) expect(x).toBeCloseTo(5.1875, 3);
  });

  it('übersprungene Ticks: nur über den letzten Tick wird bewegt, davor steht die Einheit', () => {
    const w = new ClientWorld();
    w.apply(snap(10, [{ s: 1, x: 5, y: 5 }]), 0);
    w.apply(snap(11, [{ s: 2, x: 1, y: 1 }]), 100);
    w.apply(snap(12, [{ s: 2, x: 1, y: 1 }]), 200);
    w.apply(snap(13, [{ s: 1, x: 5.25, y: 5 }]), 300); // setzt sich erst bei Tick 13 in Bewegung
    expect(sample(w, 1, 11)[0]).toBeCloseTo(5, 3);
    expect(sample(w, 1, 12)[0]).toBeCloseTo(5, 3);
    expect(sample(w, 1, 12.5)[0]).toBeCloseTo(5.125, 3);
    expect(sample(w, 1, 13)[0]).toBeCloseTo(5.25, 3);
  });

  it('mehrere Snapshots in einem Frame ergeben eine lückenlose Bahn', () => {
    const w = new ClientWorld();
    // vier Snapshots treffen gleichzeitig ein (alle mit derselben Frame-Zeit)
    for (let t = 1; t <= 4; t++) w.apply(snap(t, [{ s: 3, x: t * 0.25, y: 0 }]), 1000);
    let last = -1;
    for (let t = 1; t <= 4; t += 0.05) {
      const x = sample(w, 3, t)[0];
      expect(x).toBeGreaterThanOrEqual(last - 1e-6);
      expect(x).toBeCloseTo(t * 0.25, 1);
      last = x;
    }
  });

  it('Extrapolation ist auf maxExtra begrenzt', () => {
    const w = new ClientWorld();
    w.apply(snap(1, [{ s: 3, x: 0, y: 0 }]), 0);
    w.apply(snap(2, [{ s: 3, x: 0.1875, y: 0 }]), 100);
    expect(sample(w, 3, 2.2, 0.3)[0]).toBeCloseTo(0.225, 3);
    expect(sample(w, 3, 5, 0.3)[0]).toBeCloseTo(0.24375, 3); // gekappt bei 0,3 Ticks
    expect(sample(w, 3, 5, 0)[0]).toBeCloseTo(0.1875, 3); // ohne Extrapolation: halten
  });

  it('Teleport wird nicht interpoliert (Schnitt), neue Einheit erscheint sofort an ihrer Stelle', () => {
    const w = new ClientWorld();
    w.apply(snap(1, [{ s: 4, x: 10, y: 10 }]), 0);
    w.apply(snap(2, [{ s: 4, x: 10.25, y: 10 }]), 100);
    w.apply(snap(3, [{ s: 4, x: 30, y: 10 }]), 200);
    expect(w.cuts).toBe(1);
    expect(sample(w, 4, 2.5)[0]).toBeCloseTo(30, 3);
    expect(sample(w, 4, 3)[0]).toBeCloseTo(30, 3);
    // frische Einheit: schon vor ihrem ersten Tick an der Spawn-Position
    w.apply(snap(4, [{ s: 6, x: 2, y: 2 }]), 300);
    expect(sample(w, 6, 3.2)[0]).toBeCloseTo(2, 3);
  });
});

describe('RenderClock', () => {
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Spielt Frames (16,7 ms) und Snapshots (Tick alle 100/speed ms + Jitter) durch und liefert die Darstellungsraten */
  function drive(jitterMs: number, speed = 1, frames = 3000, onFrame?: (c: RenderClock, f: number) => void): { rates: number[]; clock: RenderClock } {
    const r = rng(11);
    const c = new RenderClock();
    c.reset(0);
    const inbox: { at: number; tick: number }[] = [];
    const tickMs = 100 / speed;
    let t = 0;
    let sent = 0;
    const rates: number[] = [];
    let last = c.render;
    for (let f = 0; f < frames; f++) {
      t += 16.667;
      while ((sent + 1) * tickMs <= t - 10) {
        sent++;
        inbox.push({ at: sent * tickMs + r() * jitterMs, tick: sent });
      }
      c.advance(0.016667, speed, false);
      inbox.sort((a, b) => a.at - b.at);
      while (inbox.length && inbox[0].at <= t) {
        const m = inbox.shift()!;
        c.onSnapshot(m.tick, t - m.at, speed, m.at);
      }
      onFrame?.(c, f);
      if (f > 300) rates.push((c.render - last) / 0.016667 / (10 * speed));
      last = c.render;
    }
    return { rates, clock: c };
  }

  it('läuft bei exakten Paketen gleichmäßig mit Tempo 1 und einem Tick Verzögerung', () => {
    const { rates, clock } = drive(0);
    for (const r of rates) expect(r).toBeCloseTo(1, 3);
    expect(clock.delay).toBeCloseTo(RenderClock.MIN_DELAY + 0.05, 2);
  });

  it('bleibt bei Paket-Jitter ruhig: nie rückwärts, Tempo nahe 1, Puffer wächst mit dem Jitter', () => {
    const { rates, clock } = drive(60);
    expect(Math.min(...rates)).toBeGreaterThan(0.85);
    expect(Math.max(...rates)).toBeLessThan(1.15);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean).toBeCloseTo(1, 1);
    expect(clock.delay).toBeGreaterThan(1.2);
    expect(clock.resyncs).toBe(0);
  });

  it('Darstellungszeit liegt fast immer innerhalb der empfangenen Ticks (zwei bekannte Zustände)', () => {
    let outside = 0;
    let n = 0;
    drive(40, 1, 3000, (c, f) => {
      if (f < 600) return;
      n++;
      if (c.render > c.latest) outside++;
    });
    expect(outside / n).toBeLessThan(0.02);
  });

  it('Spielgeschwindigkeit: Tempo folgt dem Faktor', () => {
    for (const sp of [0.5, 2, 3]) {
      const { rates } = drive(5, sp);
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      expect(mean).toBeCloseTo(1, 1);
      expect(Math.min(...rates)).toBeGreaterThan(0.8);
    }
  });

  it('Pause friert die Uhr ein und setzt danach ohne Sprung fort', () => {
    const c = new RenderClock();
    c.reset(100);
    for (let i = 0; i < 30; i++) {
      c.advance(0.0167, 1, false);
      if (i % 6 === 0) c.onSnapshot(100 + i / 6 + 1, 0, 1);
    }
    const frozen = c.render;
    for (let i = 0; i < 100; i++) c.advance(0.0167, 1, true);
    expect(c.render).toBe(frozen);
    // noch ein Snapshot trifft während der Pause ein: ändert die Darstellungszeit nicht
    c.onSnapshot(c.latest + 1, 0, 1);
    expect(c.render).toBe(frozen);
    c.advance(0.0167, 1, false);
    expect(c.render - frozen).toBeGreaterThan(0);
    expect(c.render - frozen).toBeLessThan(0.3);
  });

  it('große Abweichung (Aussetzer, Reconnect) synchronisiert hart neu, Extrapolation bleibt begrenzt', () => {
    const c = new RenderClock();
    c.reset(10);
    c.advance(0.0167, 1, false);
    c.onSnapshot(30, 0, 1);
    expect(c.resyncs).toBe(1);
    expect(c.est).toBeCloseTo(30, 1);
    // keine neuen Snapshots: Uhr läuft nicht weiter als bis zur Extrapolationsgrenze
    for (let i = 0; i < 600; i++) c.advance(0.0167, 1, false);
    expect(c.render).toBeLessThanOrEqual(30 + RenderClock.MAX_EXTRAP + 1e-6);
  });

  it('Voll-Snapshot (reset) setzt Uhr und Puffer neu', () => {
    const { clock } = drive(60);
    expect(clock.jitter).toBeGreaterThan(0.1);
    clock.reset(500);
    expect(clock.est).toBe(500);
    expect(clock.jitter).toBe(0);
  });
});
