/**
 * Untertitel-Overlay für gesprochene Zeilen: unten mittig über dem Bedienfeld, höchstens zwei Zeilen
 * (Berater + Einheit), blendet nach kurzer Zeit aus. Rein visuell, reagiert nicht auf die Maus.
 */
import { subtitleHoldMs } from './voice_logic';

export class SubtitleOverlay {
  private root: HTMLDivElement | null = null;
  private rows = new Map<string, { el: HTMLDivElement; timer: ReturnType<typeof setTimeout> }>();

  /** Schaltet die Anzeige; beim Ausschalten verschwinden laufende Untertitel sofort. */
  enable(on: boolean): void {
    if (!on) this.clear();
  }

  private ensure(): HTMLDivElement | null {
    if (typeof document === 'undefined') return null;
    if (this.root && this.root.isConnected) return this.root;
    const r = document.createElement('div');
    r.id = 'voice-subtitles';
    r.setAttribute('role', 'log');
    r.setAttribute('aria-live', 'polite');
    r.setAttribute('data-nosfx', '1');
    r.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(262px * var(--ui-scale,1));max-width:min(720px,86vw);z-index:40;display:flex;flex-direction:column;gap:4px;align-items:center;pointer-events:none;font:600 15px/1.3 system-ui,sans-serif;';
    document.body.appendChild(r);
    this.root = r;
    return r;
  }

  /** Zeile anzeigen; je Kanal (`slot`: 'advisor' | 'unit') ersetzt sie die vorige. */
  show(text: string, speaker: string, slot: 'advisor' | 'unit'): void {
    const root = this.ensure();
    if (!root) return;
    const old = this.rows.get(slot);
    if (old) {
      clearTimeout(old.timer);
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = `vsub ${slot}`;
    el.style.cssText = `padding:5px 12px;border-radius:5px;background:rgba(24,16,8,0.82);color:#f6ead0;border:1px solid ${slot === 'advisor' ? '#c9a24a' : '#6b4a26'};text-shadow:0 1px 2px #000;text-align:center;transition:opacity .35s;`;
    const who = document.createElement('span');
    who.textContent = `${speaker}: `;
    who.style.cssText = `color:${slot === 'advisor' ? '#f0c862' : '#d9b27a'};font-weight:800;`;
    const msg = document.createElement('span');
    msg.textContent = text;
    el.append(who, msg);
    root.appendChild(el);
    const timer = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        if (this.rows.get(slot)?.el === el) this.rows.delete(slot);
      }, 400);
    }, subtitleHoldMs(text));
    this.rows.set(slot, { el, timer });
  }

  /** Alle Untertitel entfernen */
  clear(): void {
    for (const r of this.rows.values()) {
      clearTimeout(r.timer);
      r.el.remove();
    }
    this.rows.clear();
  }

  /** Sichtbare Texte (Diagnose, Tests) */
  visible(): string[] {
    return [...this.rows.values()].map((r) => r.el.textContent ?? '');
  }
}
