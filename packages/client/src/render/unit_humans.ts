import { UnitBuilder, Col, clothA, clothB, skinC } from './unit_builder';
import { UPART, ARM } from './unit_shader';
import { VIS } from './units_style';
import { ANKLE, C, ELBOW_R, HAND_L, HAND_R, HEAD_Y, HIP, KNEE, LEGX, SHO, SX, st, V3 } from './unit_items';

/**
 * Menschlicher Körper für alle Figuren (≈ 5,5 Kopfhöhen): Beine mit Knie, Rumpf, Hals, Kopf, Arme mit Händen.
 * Nahes Modell (VIS.Near) hat geteilte Glieder, Hände, Hals, Nase; fernes Modell (VIS.Far) einfache Quader-Glieder;
 * Rumpf, Kopf, Kopfbedeckung, Waffen und Schilde sind für beide Stufen gemeinsam (show = 0).
 */
export interface Rig {
  /** Hauptstoff (Rumpf, Rock) und Beinkleider */
  top?: Col;
  legs?: Col;
  /** Ärmel: 'long' (Standard), 'short' (Unterarm bloß), 'none' (nackte Arme) */
  sleeves?: 'long' | 'short' | 'none';
  sleeveCol?: Col;
  boots?: number;
  /** Rocklänge unter der Hüfte (0 = kein Rock) und Farbe */
  skirt?: number;
  skirtCol?: Col;
  /** Gürtelfarbe, null = kein Gürtel */
  belt?: number | null;
  /** Schulterbreite (1 = Standard), Rumpftiefe */
  broad?: number;
  chest?: number;
  /** nackter Oberkörper (Haut) */
  bare?: boolean;
  /** Reiter: Körper um dy angehoben, Beine starr gespreizt */
  rider?: { dy: number; pivot: number };
  /** Kopf ohne Hals (Kapuze o. Ä.) */
  noNeck?: boolean;
  /** Spielerfarbe als Halstuch/Schärpe */
  scarf?: boolean;
  /** Kopfgröße (1 = Standard) */
  head?: number;
}

const HY = HEAD_Y;

export function upperOf(r: Rig): number {
  return r.rider ? -r.rider.pivot : HIP;
}

/** Baut Beine, Rumpf, Kopf (ohne Haare/Kopfbedeckung) und Arme (ohne Waffen). Gibt die Oberkörper-Neigungshöhe zurück. */
export function body(b: UnitBuilder, r: Rig = {}): number {
  b.shift(r.rider?.dy ?? 0);
  const top = r.top ?? clothA();
  const legs = r.legs ?? clothB();
  const boots = r.boots ?? C.leatherD;
  const up = upperOf(r);
  const dy = 0;
  const sh = r.broad ?? 1;
  const ch = r.chest ?? 1;

  // ---- Beine
  if (r.rider) {
    // Reiter: Beine hängen seitlich am Pferd, starr (schaukeln mit dem Reittier)
    for (const s of [-1, 1]) {
      const x = s * 0.115;
      st(b, { show: VIS.Near, upper: up });
      b.limb([s * 0.065, dy + HIP + 0.02, 0.01], [x + s * 0.03, dy + 0.2, 0.05], 0.045, 0.036, legs, { capA: false, capB: false });
      b.limb([x + s * 0.03, dy + 0.2, 0.05], [x + s * 0.035, dy + 0.04, 0.03], 0.036, 0.03, legs, { capA: false });
      b.box(0.066, 0.045, 0.11, x + s * 0.035, dy + 0.0, 0.055, boots);
      st(b, { show: VIS.Far, upper: up });
      b.limb([s * 0.065, dy + HIP + 0.02, 0.01], [x + s * 0.035, dy + 0.04, 0.04], 0.045, 0.034, legs, { capA: false });
    }
  } else {
    for (const s of [-1, 1]) {
      const x = s * LEGX;
      const lp = s < 0 ? UPART.LegL : UPART.LegR;
      const sp = s < 0 ? UPART.ShinL : UPART.ShinR;
      st(b, { part: lp, px: x, py: HIP, pz: 0, show: VIS.Near });
      b.limb([x, HIP + 0.03, 0], [x, KNEE, 0.008], 0.05, 0.041, legs, { capA: false, capB: false });
      st(b, { part: sp, px: x, py: KNEE, pz: 0, show: VIS.Near, upper: HIP });
      b.limb([x, KNEE, 0.008], [x, ANKLE + 0.012, 0.0], 0.041, 0.033, legs, { capA: false });
      b.box(0.074, 0.08, 0.122, x, 0.0, 0.024, boots);
      st(b, { part: lp, px: x, py: HIP, pz: 0, show: VIS.Far });
      b.box(0.09, HIP + 0.02, 0.092, x, 0.0, 0.004, legs, { taper: [1.12, 1.0] });
    }
  }

  // ---- Rumpf (geteilt)
  st(b, { upper: up });
  const bare = r.bare ? skinC() : top;
  b.box(0.2 * sh, 0.24, 0.118 * ch, 0, dy + HIP - 0.005, 0, bare, { taper: [1.22, 1.1] });
  if (r.skirt && r.skirt > 0) {
    // Rock hängt am Rumpf, schwingt nicht mit den Beinen
    b.box(0.215 * sh, r.skirt, 0.14 * ch, 0, dy + HIP + 0.045 - r.skirt, 0, r.skirtCol ?? top, { taper: [0.82, 0.86] });
  }
  if (r.belt !== null) {
    st(b, { show: VIS.Near, upper: up });
    b.box(0.208 * sh, 0.026, 0.124 * ch, 0, dy + HIP + 0.012, 0, r.belt ?? C.leatherD, { taper: 1.0 });
    st(b, { show: VIS.Near | VIS.Detail, upper: up });
    b.box(0.032, 0.03, 0.012, 0, dy + HIP + 0.01, 0.065 * ch, C.brass);
  }
  if (r.scarf) {
    st(b, { upper: up });
    b.box(0.2 * sh, 0.034, 0.128 * ch, 0, dy + SHO - 0.038, 0, C.white, { team: true });
  }

  // ---- Kopf
  st(b, { part: UPART.Head, px: 0, py: dy + SHO + 0.03, pz: 0, upper: up });
  const hs = r.head ?? 1;
  if (!r.noNeck) {
    st(b, { part: UPART.Head, px: 0, py: dy + SHO + 0.03, pz: 0, upper: up, show: VIS.Near });
    b.limb([0, dy + SHO - 0.01, 0], [0, dy + SHO + 0.06, 0.005], 0.027, 0.025, skinC(), { capA: false, capB: false });
  }
  st(b, { part: UPART.Head, px: 0, py: dy + SHO + 0.03, pz: 0, upper: up, show: VIS.Near });
  b.ball(0.066 * hs, 0.074 * hs, 0.07 * hs, 0, dy + HY, 0.006, skinC(), 2);
  b.box(0.02 * hs, 0.026 * hs, 0.03, 0, dy + HY - 0.01, 0.075 * hs, skinC(1.06));
  // Hoch: Ohren und Augen
  st(b, { part: UPART.Head, px: 0, py: dy + SHO + 0.03, pz: 0, upper: up, show: VIS.Near | VIS.Detail });
  for (const s of [-1, 1]) {
    b.box(0.012, 0.032, 0.024, s * 0.068 * hs, dy + HY - 0.004, 0.0, skinC(0.94));
    b.box(0.018, 0.012, 0.006, s * 0.026 * hs, dy + HY + 0.014, 0.066 * hs, C.black);
  }
  st(b, { part: UPART.Head, px: 0, py: dy + SHO + 0.03, pz: 0, upper: up, show: VIS.Far });
  b.ball(0.067 * hs, 0.075 * hs, 0.07 * hs, 0, dy + HY, 0.006, skinC(), 1);
  st(b, { upper: up });
  return up;
}

/** Ärmel/Unterarm-Farbe */
function armCols(r: Rig): { upper: Col; fore: Col } {
  const sc = r.sleeveCol ?? r.top ?? clothA();
  if (r.sleeves === 'none' || r.bare) return { upper: skinC(), fore: skinC() };
  if (r.sleeves === 'short') return { upper: sc, fore: skinC() };
  return { upper: sc, fore: sc };
}

/**
 * Ein Arm (Teil ArmR/ArmL bzw. Bogen); `fn` zeichnet Waffe/Werkzeug im selben Teil (Pose: Arm hängt, Hand an HAND_R/HAND_L).
 * `part` kann UPART.Bow sein (Bogenarm).
 */
export function arm(b: UnitBuilder, r: Rig, side: 'R' | 'L', style: number, fn?: (hand: V3) => void, o: { part?: number; handAt?: V3; noHand?: boolean } = {}): void {
  const dy = 0;
  b.shift(r.rider?.dy ?? 0);
  const up = upperOf(r);
  const s = side === 'R' ? 1 : -1;
  const part = o.part ?? (side === 'R' ? UPART.ArmR : UPART.ArmL);
  const cols = armCols(r);
  const sx = SX * (r.broad ?? 1) * s;
  const hand = o.handAt ?? (side === 'R' ? HAND_R : HAND_L);
  const sho: V3 = [sx, dy + SHO - 0.005, 0];
  const elbow: V3 = [s * 0.168 + (hand[0] - s * 0.172) * 0.5, dy + ELBOW_R[1], ELBOW_R[2] + (hand[2] - 0.04) * 0.3];
  const h: V3 = [hand[0], dy + hand[1], hand[2]];
  st(b, { part, px: sx, py: dy + SHO, pz: 0, style, show: VIS.Near, upper: up });
  b.limb(sho, elbow, 0.032, 0.027, cols.upper, { capA: false, capB: false });
  b.limb(elbow, [h[0], h[1] + 0.012, h[2]], 0.027, 0.022, cols.fore, { capA: false });
  if (!o.noHand) b.ball(0.029, 0.03, 0.03, h[0], h[1], h[2], skinC(), 0);
  st(b, { part, px: sx, py: dy + SHO, pz: 0, style, show: VIS.Far, upper: up });
  b.limb([sx, dy + SHO - 0.005, 0], [h[0], h[1] + 0.012, h[2]], 0.032, 0.025, cols.upper, { capA: false });
  if (fn) {
    st(b, { part, px: sx, py: dy + SHO, pz: 0, style, upper: up });
    fn(h);
  }
  st(b, { upper: up });
}

export const HANDS = { R: HAND_R, L: HAND_L };
export { ARM };
