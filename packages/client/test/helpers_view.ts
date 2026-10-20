import type { PlayerView } from '@strongpoly/shared';

export { BT, R, explainPopularity, setLang } from '@strongpoly/shared';

/** Spieleransicht für Tests der Anzeige-Logik (Vorrat: 200 Äpfel, sonst leer) */
export function mkTestView(over: Partial<PlayerView> = {}): PlayerView {
  return {
    gold: 100, stock: Array.from({ length: 21 }, (_, i) => (i === 9 ? 200 : 0)), cap: [150, 150, 60], used: [10, 10, 0], tax: 0, ration: 2, popularity: 60, popDelta: 0, factors: [], peasants: 20, housing: 24, troops: 0, troopLimit: 100,
    fear: 0, horses: 0, foodTypes: 1, foodShort: false, power: 0, powerMax: 100, abilityCd: [], banners: 0, priceMul: new Array(21).fill(1), alive: true, aid: [], aleCover: 0, relCover: 0, undoLeft: 0, ...over,
  };
}
