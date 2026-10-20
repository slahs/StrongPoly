import { HOTKEY_GROUPS, HOTKEY_LABELS, keyLabel, loadHotkeys } from '../game/hotkeys';
import { h } from './dom';

let open: HTMLElement | null = null;

/** F1: Hotkey-Übersicht (zeigt die aktuelle, ggf. umbelegte Tastenbelegung) */
export function toggleHelp(parent: HTMLElement): void {
  if (open) {
    closeHelp();
    return;
  }
  const hk = loadHotkeys();
  const cols = h('div', { class: 'help-cols' });
  for (const g of HOTKEY_GROUPS) {
    const rows = h('div', { class: 'keyrows' });
    for (const a of g.actions) rows.append(h('span', { text: HOTKEY_LABELS[a] }), h('span', { class: 'kc', text: keyLabel(hk[a]) }), h('span'));
    cols.append(h('div', { class: 'keygroup', text: g.name }), rows);
  }
  const mouse = h('div', {},
    h('div', { class: 'keygroup', text: 'Maus' }),
    h('div', { class: 'crumb', html: 'Linksklick: auswählen / bauen · Rahmen ziehen: Truppen wählen · Doppelklick: alle gleichen Einheiten<br>Rechtsklick: Befehl, Bauen abbrechen · Umschalt+Rechtsklick: Wegpunkt · Alt+Rechtsklick: Angriffsmarsch<br>Mausrad: Zoom (beim Bauen: Gebäude drehen, Umschalt+Rad: Zoom) · Mauern/Gräben: Maustaste halten und ziehen<br>Strg+Zahl: Truppen in Gruppe speichern · Zahl: Gruppe wählen · Zahl doppelt: hinzoomen' }),
  );
  const box = h('div', { class: 'panel pp box' }, h('h2', { text: 'Hotkeys' }), cols, mouse, h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'primary', text: 'Schließen (F1 / Esc)', onclick: () => closeHelp() })));
  open = h('div', { class: 'screen overlay', onclick: (e) => { if (e.target === open) closeHelp(); } }, box);
  parent.append(open);
}

export function closeHelp(): void {
  open?.remove();
  open = null;
}

export function helpOpen(): boolean {
  return !!open;
}
