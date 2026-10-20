/**
 * Tooltip-Manager und fertige Tooltip-Inhalte.
 *
 *   attachTooltip(el, () => buildingTooltip(BT.Quarry))     // Gebäude (Bauleiste)
 *   attachTooltip(el, () => unitTooltip(U.Archer, color))   // Einheit (Truppenleiste, Kaserne)
 *   attachTooltip(el, () => resourceTooltip(R.Wood, live))  // Ware (Ressourcenleiste)
 *   attachTooltip(el, () => abilityTooltip(0))              // Extreme-Fähigkeit
 *   attachTooltip(el, () => toolTooltip('demolish', 'Entf'))// Werkzeug
 *   attachTooltip(el, 'Einfacher Text')
 *
 * Der Inhalt wird erst beim Anzeigen erzeugt (aktuelle Zahlen). Verzögerung ~250 ms, der Tooltip verschwindet beim
 * Verlassen des Elements, bei Klick, Mausrad und Escape und bleibt immer im sichtbaren Bereich.
 */
import { renderDoc } from './doc/render';
import type { Doc } from './doc/blocks';
import { h } from './dom';
import { abilityTipDoc, buildingTipDoc, resourceTipDoc, toolTipDoc, unitTipDoc } from './tooltips/model';
import type { ResourceLive } from './tooltips/model';
import { placeAtCursor, placeAtRect } from './tooltips/place';

export const TOOLTIP_DELAY_MS = 250;

export interface TooltipOpts {
  /** Verzögerung in ms (Standard 250) */
  delay?: number;
  /** 'cursor' folgt der Maus, 'element' sitzt über/unter dem Element */
  placement?: 'cursor' | 'element';
}

export type TooltipContent = () => HTMLElement | string | null;

let tipEl: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let timer = 0;
let watch = 0;
let cursor = { x: 0, y: 0 };
let globalsBound = false;
/** nach einem Klick erscheinen Tooltips erst wieder, wenn sich die Maus bewegt (kein Wiederauftauchen unter dem ruhenden Zeiger) */
let suppressUntil = 0;

function ensure(): HTMLElement {
  if (!tipEl) {
    tipEl = h('div', { class: 'sp-tooltip', role: 'tooltip' });
    document.body.append(tipEl);
  }
  return tipEl;
}

export function hideTooltip(): void {
  window.clearTimeout(timer);
  timer = 0;
  window.clearInterval(watch);
  watch = 0;
  owner = null;
  if (tipEl) {
    tipEl.classList.remove('show');
    tipEl.style.left = '-9999px';
    tipEl.style.top = '-9999px';
  }
}

export function tooltipVisible(): boolean {
  return !!tipEl && tipEl.classList.contains('show');
}

function position(placement: 'cursor' | 'element'): void {
  if (!tipEl || !owner) return;
  const r = tipEl.getBoundingClientRect();
  const size = { w: r.width, h: r.height };
  const view = { w: window.innerWidth, h: window.innerHeight };
  const p =
    placement === 'element'
      ? (() => {
          const b = owner.getBoundingClientRect();
          return placeAtRect({ x: b.left, y: b.top, w: b.width, h: b.height }, size, view);
        })()
      : placeAtCursor(cursor, size, view);
  tipEl.style.left = `${Math.round(p.x)}px`;
  tipEl.style.top = `${Math.round(p.y)}px`;
}

function show(el: HTMLElement, content: TooltipContent, placement: 'cursor' | 'element'): void {
  const c = content();
  if (c === null) return;
  const tip = ensure();
  tip.textContent = '';
  tip.classList.toggle('plain', typeof c === 'string');
  if (typeof c === 'string') tip.textContent = c;
  else tip.append(c);
  owner = el;
  tip.style.left = '-9999px';
  tip.style.top = '-9999px';
  tip.classList.add('show');
  position(placement);
  // Ist das Ziel verschwunden (z. B. HUD neu aufgebaut), Tooltip entfernen
  window.clearInterval(watch);
  watch = window.setInterval(() => {
    if (!owner || !owner.isConnected) hideTooltip();
  }, 400);
}

function bindGlobals(): void {
  if (globalsBound) return;
  globalsBound = true;
  window.addEventListener('blur', hideTooltip);
  window.addEventListener(
    'pointerdown',
    () => {
      suppressUntil = performance.now() + 500;
      hideTooltip();
    },
    true,
  );
  window.addEventListener('wheel', hideTooltip, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') hideTooltip();
  });
}

/**
 * Hängt einen Tooltip an ein Element. Gibt eine Funktion zurück, die ihn wieder löst.
 * `content` darf `null` liefern (dann erscheint nichts).
 */
export function attachTooltip(el: HTMLElement, content: TooltipContent | string, opts: TooltipOpts = {}): () => void {
  bindGlobals();
  const delay = opts.delay ?? TOOLTIP_DELAY_MS;
  const placement = opts.placement ?? 'cursor';
  const fn: TooltipContent = typeof content === 'string' ? () => content : content;
  const arm = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || performance.now() < suppressUntil) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      show(el, fn, placement);
    }, delay);
  };
  const onEnter = (e: PointerEvent): void => {
    cursor = { x: e.clientX, y: e.clientY };
    arm(e);
  };
  const onMove = (e: PointerEvent): void => {
    cursor = { x: e.clientX, y: e.clientY };
    if (owner === el && tooltipVisible()) {
      if (placement === 'cursor') position(placement);
    } else if (!timer && owner !== el) arm(e);
  };
  const onLeave = (): void => {
    if (owner === el || timer) hideTooltip();
  };
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointerdown', onLeave);
  el.addEventListener('contextmenu', onLeave);
  return () => {
    el.removeEventListener('pointerenter', onEnter);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('pointerdown', onLeave);
    el.removeEventListener('contextmenu', onLeave);
    if (owner === el) hideTooltip();
  };
}

// ---------- Fertige Inhalte ----------

function render(doc: Doc): HTMLElement {
  return renderDoc(doc, { compact: true });
}

/** Gebäude-Tooltip: Icon, Name, Kosten, Arbeiter, Größe, Platzierungsregeln, Eingang → Ausgang, Wirkung, Voraussetzungen, Tipp */
export function buildingTooltip(typeId: number): HTMLElement {
  return render(buildingTipDoc(typeId));
}

/** Einheiten-Tooltip: Kosten, Rekrutierungsort, Werte, Besonderheiten, Stark/Schwach gegen (aus DMG_TABLE) */
export function unitTooltip(typeId: number, teamColor?: number): HTMLElement {
  return render(unitTipDoc(typeId, teamColor));
}

/** Waren-Tooltip; mit `live` werden Bestand, Kapazität und aktueller Marktpreis angezeigt */
export function resourceTooltip(resId: number, live?: ResourceLive): HTMLElement {
  return render(resourceTipDoc(resId, live));
}

export function abilityTooltip(id: number): HTMLElement {
  return render(abilityTipDoc(id));
}

export function toolTooltip(key: string, hotkey?: string): HTMLElement {
  return render(toolTipDoc(key, hotkey));
}

export { placementErrorText as explainPlacementError } from './tooltips/model';

export type { ResourceLive };
