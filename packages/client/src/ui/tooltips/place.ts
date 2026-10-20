/**
 * Positionierung von Tooltips (reine Geometrie, ohne DOM): am Cursor oder an einem Element,
 * immer vollständig im sichtbaren Bereich.
 */
export interface Size {
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TIP_MARGIN = 6;
export const CURSOR_OFFSET = { x: 16, y: 18 };

function clamp(v: number, lo: number, hi: number): number {
  return hi < lo ? lo : Math.max(lo, Math.min(hi, v));
}

/** Tooltip am Cursor: rechts unterhalb; passt es nicht, wird nach links bzw. oben geklappt; zuletzt auf den Rand geklemmt. */
export function placeAtCursor(cursor: Pt, size: Size, view: Size, margin = TIP_MARGIN): Pt {
  let x = cursor.x + CURSOR_OFFSET.x;
  let y = cursor.y + CURSOR_OFFSET.y;
  if (x + size.w > view.w - margin) x = cursor.x - CURSOR_OFFSET.x - size.w;
  if (y + size.h > view.h - margin) y = cursor.y - CURSOR_OFFSET.y - size.h;
  return { x: clamp(x, margin, view.w - margin - size.w), y: clamp(y, margin, view.h - margin - size.h) };
}

/** Tooltip an einem Element: bevorzugt darüber (Bauleiste unten), sonst darunter; waagerecht zentriert. */
export function placeAtRect(rect: Rect, size: Size, view: Size, margin = TIP_MARGIN, gap = 8): Pt {
  let y = rect.y - gap - size.h;
  if (y < margin) y = rect.y + rect.h + gap;
  const x = rect.x + rect.w / 2 - size.w / 2;
  return { x: clamp(x, margin, view.w - margin - size.w), y: clamp(y, margin, view.h - margin - size.h) };
}

/** Liegt der Tooltip vollständig im Bild? */
export function insideView(p: Pt, size: Size, view: Size): boolean {
  return p.x >= 0 && p.y >= 0 && p.x + size.w <= view.w && p.y + size.h <= view.h;
}
