export type HotkeyAction =
  | 'panUp' | 'panDown' | 'panLeft' | 'panRight'
  | 'rotateLeft' | 'rotateRight'
  | 'zoomIn' | 'zoomOut'
  | 'stop' | 'hold' | 'defensive' | 'aggressive'
  | 'attackMove' | 'patrol' | 'attackGround' | 'tunnel'
  | 'rotateBuilding' | 'cancel' | 'pause'
  | 'demolish' | 'repair' | 'undo'
  | 'cat1' | 'cat2' | 'cat3' | 'cat4' | 'cat5' | 'cat6'
  | 'ability1' | 'ability2' | 'ability3' | 'ability4' | 'ability5'
  | 'toggleStock' | 'toggleMarket' | 'togglePopularity' | 'toggleAdmin'
  | 'selectKeep' | 'selectGranary' | 'selectBarracks' | 'selectMarket' | 'selectStock' | 'selectArmory'
  | 'jumpAlert' | 'centerSelection'
  | 'help' | 'encyclopedia'
  | 'selectAllArmy' | 'toggleShadows' | 'centerKeep' | 'toggleMute' | 'advisorReplay';

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  panUp: 'Kamera hoch', panDown: 'Kamera runter', panLeft: 'Kamera links', panRight: 'Kamera rechts',
  rotateLeft: 'Kamera links drehen', rotateRight: 'Kamera rechts drehen',
  zoomIn: 'Hineinzoomen', zoomOut: 'Herauszoomen',
  stop: 'Stopp', hold: 'Stellung halten', defensive: 'Defensiv', aggressive: 'Aggressiv',
  attackMove: 'Angriffsmarsch', patrol: 'Patrouille', attackGround: 'Bodenangriff', tunnel: 'Tunnel graben',
  rotateBuilding: 'Gebäude drehen', cancel: 'Abbrechen / Menü', pause: 'Pause',
  demolish: 'Abreißen', repair: 'Reparieren', undo: 'Rückgängig (letzte Platzierung)',
  cat1: 'Baumenü Burg', cat2: 'Baumenü Industrie', cat3: 'Baumenü Landwirtschaft', cat4: 'Baumenü Stadt', cat5: 'Baumenü Waffen', cat6: 'Baumenü Nahrung',
  ability1: 'Fähigkeit 1', ability2: 'Fähigkeit 2', ability3: 'Fähigkeit 3', ability4: 'Fähigkeit 4', ability5: 'Fähigkeit 5',
  toggleStock: 'Lager', toggleMarket: 'Markt', togglePopularity: 'Beliebtheit', toggleAdmin: 'Verwaltung',
  selectKeep: 'Bergfried anwählen', selectGranary: 'Kornspeicher anwählen', selectBarracks: 'Kaserne anwählen',
  selectMarket: 'Markt anwählen', selectStock: 'Lager anwählen', selectArmory: 'Waffenkammer anwählen',
  jumpAlert: 'Kamera zur letzten Meldung', centerSelection: 'Kamera auf Auswahl',
  help: 'Hotkey-Übersicht', encyclopedia: 'Enzyklopädie',
  selectAllArmy: 'Alle Truppen wählen', toggleShadows: 'Schatten umschalten', centerKeep: 'Zum Bergfried', toggleMute: 'Ton stumm/an', advisorReplay: 'Letzten Berater-Hinweis erneut abspielen',
};

/** Reihenfolge und Gruppen für Optionsmenü und F1-Übersicht */
export const HOTKEY_GROUPS: { name: string; actions: HotkeyAction[] }[] = [
  { name: 'Kamera', actions: ['panUp', 'panDown', 'panLeft', 'panRight', 'rotateLeft', 'rotateRight', 'zoomIn', 'zoomOut', 'centerKeep', 'centerSelection', 'jumpAlert'] },
  { name: 'Bauen', actions: ['cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6', 'rotateBuilding', 'demolish', 'repair', 'undo', 'cancel'] },
  { name: 'Gebäude anwählen', actions: ['selectKeep', 'selectGranary', 'selectBarracks', 'selectMarket', 'selectStock', 'selectArmory'] },
  { name: 'Einheiten', actions: ['selectAllArmy', 'hold', 'defensive', 'aggressive', 'attackMove', 'patrol', 'attackGround', 'tunnel', 'stop'] },
  { name: 'Fenster', actions: ['toggleStock', 'toggleMarket', 'togglePopularity', 'toggleAdmin', 'help', 'encyclopedia'] },
  { name: 'Extreme', actions: ['ability1', 'ability2', 'ability3', 'ability4', 'ability5'] },
  { name: 'Spiel', actions: ['pause', 'toggleShadows', 'toggleMute', 'advisorReplay'] },
];

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  panUp: 'KeyW', panDown: 'KeyS', panLeft: 'KeyA', panRight: 'KeyD',
  rotateLeft: 'KeyQ', rotateRight: 'KeyE',
  zoomIn: 'Equal', zoomOut: 'Minus',
  stop: 'KeyX', hold: 'KeyH', defensive: 'KeyV', aggressive: 'KeyB',
  attackMove: 'KeyF', patrol: 'KeyP', attackGround: 'KeyG', tunnel: 'Alt+KeyT',
  rotateBuilding: 'KeyR', cancel: 'Escape', pause: 'Pause',
  demolish: 'Delete', repair: 'KeyU', undo: 'Ctrl+KeyZ',
  cat1: 'F3', cat2: 'F4', cat3: 'F5', cat4: 'F6', cat5: 'F7', cat6: 'F8',
  ability1: 'KeyZ', ability2: 'KeyC', ability3: 'KeyN', ability4: 'KeyJ', ability5: 'KeyK',
  toggleStock: 'KeyI', toggleMarket: 'KeyO', togglePopularity: 'KeyL', toggleAdmin: 'KeyT',
  selectKeep: 'Alt+KeyK', selectGranary: 'Alt+KeyG', selectBarracks: 'Alt+KeyB', selectMarket: 'Alt+KeyM', selectStock: 'Alt+KeyS', selectArmory: 'Alt+KeyW',
  jumpAlert: 'Space', centerSelection: 'Enter',
  help: 'F1', encyclopedia: 'F2',
  selectAllArmy: 'KeyY', toggleShadows: 'F9', centerKeep: 'Home', toggleMute: 'KeyM', advisorReplay: 'Alt+KeyH',
};

const KEY = 'strongpoly.hotkeys';

export function loadHotkeys(): Record<HotkeyAction, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<HotkeyAction, string>>;
      // Eigene Belegungen bleiben, unbekannte Schlüssel werden verworfen
      const out = { ...DEFAULT_HOTKEYS };
      for (const k of Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]) if (typeof saved[k] === 'string') out[k] = saved[k] as string;
      return out;
    }
  } catch {
    /* ignorieren */
  }
  return { ...DEFAULT_HOTKEYS };
}

export function saveHotkeys(h: Record<HotkeyAction, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    /* ignorieren */
  }
}

/** Tastenkombination eines Ereignisses als Text: Strg und Alt gehören dazu, Umschalt nicht (Umschalt ist Wegpunkt/Mehrfachwahl). */
export function comboOf(e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string {
  return `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.code}`;
}

/**
 * Gehaltene Tasten (Kamera schwenken/zoomen) nur ohne Strg/Alt/Cmd merken: Alt+S (Lager anwählen) darf nicht gleichzeitig
 * die Kamera nach unten schwenken, und unter macOS sendet der Browser bei gehaltener Cmd-Taste kein keyup für die Buchstabentaste
 * (sonst bliebe die Kamera hängen).
 */
export const tracksHeldKey = (e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean => !(e.ctrlKey || e.metaKey || e.altKey);

/**
 * Kombinationen, auf die ein Tastendruck anspricht: MacBook-Tastaturen haben keine Entf-Taste (⌫ sendet `Backspace`, Entf erst mit Fn),
 * deshalb löst Backspace jede „Entf“-Belegung (Standard: Abreißen) ebenfalls aus.
 */
export function comboAliases(e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string[] {
  const c = comboOf(e);
  return e.code === 'Backspace' ? [c, comboOf({ ...e, code: 'Delete' })] : [c];
}

const KEY_NAMES: Record<string, string> = {
  Equal: '+', Minus: '-', Escape: 'Esc', Space: 'Leertaste', Pause: 'Pause', Delete: 'Entf', Home: 'Pos1', End: 'Ende', Enter: 'Eingabe',
  Backquote: '^', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'Bild↑', PageDown: 'Bild↓', Insert: 'Einfg',
};

export function keyLabel(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      if (p === 'Ctrl') return 'Strg';
      if (p === 'Alt') return 'Alt';
      return KEY_NAMES[p] ?? p.replace(/^Key/, '').replace(/^Digit/, '');
    })
    .join('+');
}

/** Doppelt belegte Kombinationen (für die Warnung im Optionsmenü) */
export function hotkeyConflicts(h: Record<HotkeyAction, string>): Map<string, HotkeyAction[]> {
  const m = new Map<string, HotkeyAction[]>();
  for (const a of Object.keys(h) as HotkeyAction[]) m.set(h[a], [...(m.get(h[a]) ?? []), a]);
  for (const [k, v] of [...m]) if (v.length < 2) m.delete(k);
  return m;
}
