/** Globale Balancing-Konstanten. */
export const TICK_RATE = 10;
export const DT = 1 / TICK_RATE;
/** Spielmonat in Ticks (60 s bei 1x) */
export const TICKS_PER_MONTH = 600;
export const MONTHS_PER_YEAR = 12;
/** Beliebtheit/Steuern werden alle N Ticks angewandt (Monatswerte / 6) */
export const POP_INTERVAL = 100;
export const POP_STEPS_PER_MONTH = TICKS_PER_MONTH / POP_INTERVAL;

export const UNIT_CAP = 8192;
export const PROJ_CAP = 4096;
export const SLOT_BITS = 13;
export const SLOT_MASK = (1 << SLOT_BITS) - 1;

export const DEFAULT_TROOP_LIMIT = 1000;
export const START_GOLD = 1500;
export const PEASANT_BASE_LIMIT = 8;
export const HOVEL_HOUSING = 8;
export const SPAWN_INTERVAL_TICKS = 25;

/** Steuerstufen -3..+5: Gold pro Bauer & Monat, Beliebtheit pro Monat */
export const TAX_LEVELS = [-3, -2, -1, 0, 1, 2, 3, 4, 5] as const;
export const TAX_GOLD: Record<number, number> = { [-3]: -1.6, [-2]: -1.2, [-1]: -0.8, 0: 0, 1: 0.6, 2: 1.0, 3: 1.4, 4: 1.8, 5: 2.4 };
export const TAX_POP: Record<number, number> = { [-3]: 7, [-2]: 5, [-1]: 3, 0: 0, 1: -2, 2: -4, 3: -6, 4: -8, 5: -11 };

/** Rationen 0..4: keine/halb/normal/extra/doppelt – Nahrung pro Bauer & Monat, Beliebtheit */
export const RATION_NAMES = ['Keine', 'Halbe', 'Normale', 'Extra', 'Doppelte'];
export const RATION_FOOD = [0, 0.25, 0.5, 0.75, 1];
export const RATION_POP = [-8, -4, 0, 4, 8];
/** Beliebtheit pro zusätzlicher Nahrungssorte (ab der zweiten) */
export const VARIETY_POP = 1.5;
export const ALE_POP_MAX = 6;
/** Bauern, die ein Wirtshaus pro Monat bedienen kann */
export const INN_SERVES = 30;
export const ALE_PER_PEASANT_MONTH = 0.35;
export const RELIGION_POP = { chapel: 2, church: 4, cathedral: 7 };
export const RELIGION_COVER = { chapel: 25, church: 50, cathedral: 100 };
export const GOOD_POP = 0.7;
export const BAD_POP = -0.5;
export const CROWD_POP = -4;
/** Angstfaktor: pro Stufe Produktivität/Moral +- */
export const FEAR_PROD_STEP = 0.05;
export const FEAR_DMG_STEP = 0.04;
export const FEAR_MAX = 5;

export const FIRE_DPS = 4;
export const FIRE_SPREAD_CHANCE = 0.02;
export const FIRE_DURATION = 18;
export const WELL_RADIUS = 9;
export const POT_RADIUS = 4;

export const MARKET_PRICE_RECOVER = 0.002;
export const MARKET_PRICE_STEP = 0.015;

/** Kein Bauen, solange feindliche Soldaten so nah (Tiles, ab Gebäuderand) sind – wie im Original verhindert das Tor-Neubau mitten im Sturm */
export const ENEMY_BUILD_RADIUS = 8;
