/** Reine Mischlogik (keine WebAudio-Abhängigkeit): Voice-Limits, Drosselung, räumliche Dämpfung. */

export interface VoiceTypeCfg {
  /** maximale gleichzeitige Stimmen dieses Typs */
  max: number;
  /** Mindestabstand zwischen zwei Starts desselben Typs (ms) */
  gapMs: number;
  /** Priorität: >= 2 darf das globale Limit bis zu `priorityHeadroom` überschreiten */
  priority?: number;
}

export interface LimiterCfg {
  global: number;
  priorityHeadroom: number;
  types: Record<string, VoiceTypeCfg>;
  fallback: VoiceTypeCfg;
}

export class VoiceLimiter {
  private voices: { type: string; end: number }[] = [];
  private lastStart = new Map<string, number>();
  /** Zähler verworfener Anfragen (Diagnose) */
  dropped = 0;

  constructor(private cfg: LimiterCfg) {}

  private prune(now: number): void {
    const v = this.voices;
    let w = 0;
    for (let i = 0; i < v.length; i++) if (v[i].end > now) v[w++] = v[i];
    v.length = w;
  }

  /** Aktive Stimmen (optional nur eines Typs). */
  active(now: number, type?: string): number {
    this.prune(now);
    if (!type) return this.voices.length;
    let n = 0;
    for (const v of this.voices) if (v.type === type) n++;
    return n;
  }

  /** Meldet einen Start an. true = darf spielen (Stimme wird gezählt), false = verwerfen. */
  request(type: string, now: number, durMs: number): boolean {
    const c = this.cfg.types[type] ?? this.cfg.fallback;
    this.prune(now);
    const last = this.lastStart.get(type);
    if (last !== undefined && now - last < c.gapMs) return this.drop();
    let typeCount = 0;
    for (const v of this.voices) if (v.type === type) typeCount++;
    if (typeCount >= c.max) return this.drop();
    const limit = this.cfg.global + ((c.priority ?? 0) >= 2 ? this.cfg.priorityHeadroom : 0);
    if (this.voices.length >= limit) return this.drop();
    this.voices.push({ type, end: now + Math.max(30, durMs) });
    this.lastStart.set(type, now);
    return true;
  }

  private drop(): false {
    this.dropped++;
    return false;
  }

  reset(): void {
    this.voices.length = 0;
    this.lastStart.clear();
  }
}

/** Voice-Limits je Effekttyp. Schlüssel = Effekt-ID aus sfx.ts / voices.ts. */
export const LIMITER_CFG: LimiterCfg = {
  global: 28,
  priorityHeadroom: 6,
  fallback: { max: 3, gapMs: 60 },
  types: {
    build: { max: 3, gapMs: 90 },
    demolish: { max: 2, gapMs: 120 },
    placeFail: { max: 1, gapMs: 120, priority: 2 },
    chop: { max: 3, gapMs: 70 },
    pick: { max: 3, gapMs: 70 },
    smith: { max: 2, gapMs: 120 },
    mill: { max: 2, gapMs: 400 },
    harvest: { max: 2, gapMs: 200 },
    arrowShot: { max: 4, gapMs: 60 },
    arrowHit: { max: 4, gapMs: 60 },
    swordHit: { max: 4, gapMs: 60 },
    catapult: { max: 2, gapMs: 150, priority: 1 },
    siegeImpact: { max: 3, gapMs: 100, priority: 1 },
    wallCollapse: { max: 2, gapMs: 150, priority: 1 },
    fire: { max: 2, gapMs: 250 },
    gateOpen: { max: 2, gapMs: 200 },
    gateClose: { max: 2, gapMs: 200 },
    recruit: { max: 2, gapMs: 250, priority: 1 },
    oil: { max: 2, gapMs: 200 },
    heal: { max: 2, gapMs: 200 },
    banner: { max: 1, gapMs: 400, priority: 1 },
    splash: { max: 2, gapMs: 120 },
    uiHover: { max: 2, gapMs: 45, priority: 2 },
    uiClick: { max: 3, gapMs: 40, priority: 2 },
    uiConfirm: { max: 2, gapMs: 60, priority: 2 },
    uiError: { max: 1, gapMs: 120, priority: 2 },
    gong: { max: 1, gapMs: 600, priority: 3 },
    notice: { max: 1, gapMs: 500, priority: 2 },
    victory: { max: 1, gapMs: 1000, priority: 3 },
    defeat: { max: 1, gapMs: 1000, priority: 3 },
    voice: { max: 2, gapMs: 140, priority: 2 },
  },
};

// ---------------------------------------------------------------------------------------------
// Räumliche Mischung

export interface Listener {
  /** Blickpunkt der Kamera in Tile-Koordinaten */
  x: number;
  y: number;
  /** Kamera-Gierwinkel (rad) wie in RtsCamera.yaw */
  yaw: number;
  /** Kameraabstand (Zoom) */
  dist: number;
}

export interface Spatial {
  gain: number;
  /** -1 links .. +1 rechts */
  pan: number;
  /** Tiefpass-Grenzfrequenz (Hz): ferne Klänge klingen dumpfer */
  lowpass: number;
  audible: boolean;
}

/** Sichtradius in Tiles (Näherung wie die Minimap: ~0,9 × Kameraabstand). */
export function viewRadius(dist: number): number {
  return Math.max(8, dist * 0.9);
}

/**
 * Entfernung → Lautstärke. 1 bis `ref`, danach glatt fallend, 0 ab `max`. Monoton fallend.
 */
export function distanceGain(d: number, ref: number, max: number): number {
  if (!(d > ref)) return 1;
  if (d >= max) return 0;
  const t = (d - ref) / (max - ref);
  const s = 1 - t;
  return s * s * (0.35 + 0.65 * s);
}

/** Gesamtdämpfung durch Zoom: weit herausgezoomt wirkt alles leiser/entfernter. */
export function zoomGain(dist: number): number {
  const t = Math.max(0, Math.min(1, (dist - 10) / 80));
  return 1 - 0.45 * t;
}

/**
 * Berechnet Lautstärke, Stereoposition und Klangfarbe eines Weltgeräuschs.
 * Rechtsrichtung der Kamera in Tile-Koordinaten: (cos yaw, -sin yaw).
 */
export function spatialize(l: Listener, sx: number, sy: number): Spatial {
  const dx = sx - l.x;
  const dy = sy - l.y;
  const d = Math.hypot(dx, dy);
  const view = viewRadius(l.dist);
  const ref = view * 0.3;
  const max = view * 1.55;
  const g = distanceGain(d, ref, max) * zoomGain(l.dist);
  const rx = Math.cos(l.yaw);
  const ry = -Math.sin(l.yaw);
  const side = dx * rx + dy * ry;
  // Pan wächst mit der seitlichen Entfernung, aber nie ganz hart
  const pan = Math.max(-0.85, Math.min(0.85, (side / (view * 0.9)) * 0.85));
  const far = Math.min(1, d / max);
  const lowpass = 14000 - far * 11000;
  return { gain: g, pan, lowpass, audible: g > 0.012 };
}

/** Dezibel-ähnliche Hilfsfunktion: Lautstärkeregler (0..1) → linearer Gain mit sanfter Kurve. */
export function volumeCurve(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c * c;
}
