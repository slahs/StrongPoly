/** Waren. Gold wird separat geführt (player.gold). */
export const R = {
  Wood: 0,
  Stone: 1,
  Iron: 2,
  Pitch: 3,
  Hops: 4,
  Ale: 5,
  Wheat: 6,
  Flour: 7,
  Cow: 8,
  Apple: 9,
  Cheese: 10,
  Meat: 11,
  Bread: 12,
  Bow: 13,
  Crossbow: 14,
  Spear: 15,
  Pike: 16,
  Mace: 17,
  Sword: 18,
  Leather: 19,
  Armor: 20,
} as const;
export const RES_COUNT = 21;
export type StoreKind = 'stock' | 'granary' | 'armory';

export interface ResInfo {
  key: string;
  name: string;
  store: StoreKind;
  /** Kaufpreis am Markt in Gold (Verkauf = sellRatio * Preis) */
  price: number;
  food?: boolean;
}

export const RES_INFO: ResInfo[] = [
  { key: 'wood', name: 'Holz', store: 'stock', price: 6 },
  { key: 'stone', name: 'Stein', store: 'stock', price: 14 },
  { key: 'iron', name: 'Eisen', store: 'stock', price: 22 },
  { key: 'pitch', name: 'Pech', store: 'stock', price: 20 },
  { key: 'hops', name: 'Hopfen', store: 'stock', price: 12 },
  { key: 'ale', name: 'Bier', store: 'stock', price: 14 },
  { key: 'wheat', name: 'Weizen', store: 'stock', price: 10 },
  { key: 'flour', name: 'Mehl', store: 'stock', price: 12 },
  { key: 'cow', name: 'Kuh', store: 'stock', price: 25 },
  { key: 'apple', name: 'Äpfel', store: 'granary', price: 8, food: true },
  { key: 'cheese', name: 'Käse', store: 'granary', price: 10, food: true },
  { key: 'meat', name: 'Fleisch', store: 'granary', price: 12, food: true },
  { key: 'bread', name: 'Brot', store: 'granary', price: 14, food: true },
  { key: 'bow', name: 'Bogen', store: 'armory', price: 30 },
  { key: 'crossbow', name: 'Armbrust', store: 'armory', price: 40 },
  { key: 'spear', name: 'Speer', store: 'armory', price: 25 },
  { key: 'pike', name: 'Pike', store: 'armory', price: 32 },
  { key: 'mace', name: 'Streitkolben', store: 'armory', price: 45 },
  { key: 'sword', name: 'Schwert', store: 'armory', price: 60 },
  { key: 'leather', name: 'Lederrüstung', store: 'armory', price: 35 },
  { key: 'armor', name: 'Plattenrüstung', store: 'armory', price: 70 },
];

export const FOOD_RES: number[] = [R.Apple, R.Cheese, R.Meat, R.Bread];
export const STOCK_RES: number[] = RES_INFO.map((r, i) => (r.store === 'stock' ? i : -1)).filter((i) => i >= 0);
export const GRANARY_RES: number[] = FOOD_RES;
export const ARMORY_RES: number[] = RES_INFO.map((r, i) => (r.store === 'armory' ? i : -1)).filter((i) => i >= 0);
export const SELL_RATIO = 0.6;
