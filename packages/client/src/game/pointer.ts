/**
 * Kleine, reine Hilfen für Zeigergeräte, die sich zwischen Browsern/Plattformen unterscheiden (Safari/macOS, Trackpad).
 */

/** Mausrad-/Trackpad-Delta in Pixeln: `deltaMode` 1 (Zeilen, z. B. Firefox) und 2 (Seiten) auf Pixel umrechnen. */
export function wheelPixels(e: { deltaY: number; deltaMode?: number }): number {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  // sehr große Einzelschritte (Maus-Rad mit hoher Auflösung, Trägheit) begrenzen, damit ein Wisch nicht den ganzen Zoombereich durchfährt
  return Math.max(-240, Math.min(240, e.deltaY * k));
}

/** Auf dem Mac ist Strg+Klick der Rechtsklick (Trackpad ohne Zwei-Finger-Tipp); der Browser sendet dabei Taste 0 mit gedrückter Strg-Taste. */
export function isSecondaryClick(e: { button: number; ctrlKey: boolean }, mac: boolean): boolean {
  return e.button === 2 || (mac && e.button === 0 && e.ctrlKey);
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
