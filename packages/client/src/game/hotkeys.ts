export type HotkeyAction =
  | 'panUp' | 'panDown' | 'panLeft' | 'panRight'
  | 'rotateLeft' | 'rotateRight'
  | 'zoomIn' | 'zoomOut'
  | 'stop' | 'hold' | 'defensive' | 'aggressive'
  | 'attackMove' | 'patrol' | 'attackGround'
  | 'rotateBuilding' | 'cancel' | 'pause'
  | 'demolish' | 'repair'
  | 'cat1' | 'cat2' | 'cat3' | 'cat4' | 'cat5' | 'cat6'
  | 'ability1' | 'ability2' | 'ability3' | 'ability4' | 'ability5'
  | 'toggleStock' | 'toggleMarket' | 'togglePopularity' | 'toggleAdmin'
  | 'selectAllArmy' | 'toggleShadows' | 'centerKeep' | 'toggleMute';

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  panUp: 'Kamera hoch', panDown: 'Kamera runter', panLeft: 'Kamera links', panRight: 'Kamera rechts',
  rotateLeft: 'Kamera links drehen', rotateRight: 'Kamera rechts drehen',
  zoomIn: 'Hineinzoomen', zoomOut: 'Herauszoomen',
  stop: 'Stopp', hold: 'Stellung halten', defensive: 'Defensiv', aggressive: 'Aggressiv',
  attackMove: 'Angriffsmarsch', patrol: 'Patrouille', attackGround: 'Bodenangriff',
  rotateBuilding: 'Gebäude drehen', cancel: 'Abbrechen', pause: 'Pause',
  demolish: 'Abreißen', repair: 'Reparieren',
  cat1: 'Menü Burg', cat2: 'Menü Industrie', cat3: 'Menü Landwirtschaft', cat4: 'Menü Stadt', cat5: 'Menü Waffen', cat6: 'Menü Nahrung',
  ability1: 'Fähigkeit 1', ability2: 'Fähigkeit 2', ability3: 'Fähigkeit 3', ability4: 'Fähigkeit 4', ability5: 'Fähigkeit 5',
  toggleStock: 'Lager', toggleMarket: 'Markt', togglePopularity: 'Beliebtheit', toggleAdmin: 'Verwaltung',
  selectAllArmy: 'Alle Truppen wählen', toggleShadows: 'Schatten umschalten', centerKeep: 'Zum Bergfried', toggleMute: 'Ton stumm/an',
};

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  panUp: 'KeyW', panDown: 'KeyS', panLeft: 'KeyA', panRight: 'KeyD',
  rotateLeft: 'KeyQ', rotateRight: 'KeyE',
  zoomIn: 'Equal', zoomOut: 'Minus',
  stop: 'KeyX', hold: 'KeyH', defensive: 'KeyV', aggressive: 'KeyB',
  attackMove: 'KeyF', patrol: 'KeyP', attackGround: 'KeyG',
  rotateBuilding: 'KeyR', cancel: 'Escape', pause: 'Space',
  demolish: 'Delete', repair: 'KeyU',
  cat1: 'F1', cat2: 'F2', cat3: 'F3', cat4: 'F4', cat5: 'F5', cat6: 'F6',
  ability1: 'KeyZ', ability2: 'KeyC', ability3: 'KeyN', ability4: 'KeyJ', ability5: 'KeyK',
  toggleStock: 'KeyI', toggleMarket: 'KeyO', togglePopularity: 'KeyL', toggleAdmin: 'KeyT',
  selectAllArmy: 'KeyY', toggleShadows: 'F9', centerKeep: 'Home', toggleMute: 'KeyM',
};

const KEY = 'strongpoly.hotkeys';

export function loadHotkeys(): Record<HotkeyAction, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_HOTKEYS, ...(JSON.parse(raw) as Partial<Record<HotkeyAction, string>>) };
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

export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Equal', '+').replace('Minus', '-');
}
