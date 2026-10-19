import { BT } from './buildings';
import { U } from './units';

/** Burg-Template: wird parametrisch um den Bergfried gebaut (quadratischer Mauerring). */
export interface CastleTemplate {
  name: string;
  /** Radius des Rings (Tiles vom Keep-Mittelpunkt, 8..12) */
  ring: number;
  wall: number;
  /** zweiter Mauerring direkt dahinter */
  doubleWall: boolean;
  /** Eckturmtyp (0 = keine Ecktürme) */
  corner: number;
  /** zusätzlicher Turm alle N Ringkacheln (0 = nie) */
  towerEvery: number;
  towerType: number;
  gate: number;
  /** Anzahl Tore (1 = zur Gegnerseite, 2 = auch Rückseite) */
  gates: number;
  stairs: boolean;
  moat: boolean;
  pits: boolean;
  cauldrons: number;
  /** 0 nichts, 1 Ballista, 2 Mangonel auf Eck-Großtürmen */
  turret: 0 | 1 | 2;
  /** Zuerst Palisade, später durch Stein ersetzen (nicht umgesetzt: Palisade bleibt) */
  killingPits: boolean;
  /** Bogenschützen, die auf Mauern stationiert werden */
  garrison: number;
}

export interface AiProfile {
  id: number;
  /** nicht in Auswahllisten (Missions-Gegner) */
  hidden?: boolean;
  name: string;
  title: string;
  desc: string;
  castle: CastleTemplate;
  econ: {
    /** Zielanzahl Holzfäller / Steinbrüche / Eisenminen */
    wood: number;
    stone: number;
    iron: number;
    pitch: number;
    /** Nahrungsfaktor (1 = normal) */
    food: number;
    market: boolean;
    /** 0 keine, 1 Kapelle, 2 Kirche, 3 Kathedrale */
    religion: number;
    ale: boolean;
    goodThings: number;
    badThings: number;
    /** angestrebte Bauernzahl */
    peasants: number;
    tax: number;
  };
  army: {
    /** Einheit -> Gewicht */
    units: [number, number][];
    siege: [number, number][];
    /** Truppenstärke der ersten Welle */
    wave: number;
    waveGrow: number;
    /** Tick des frühesten Angriffs */
    firstAttack: number;
    waveInterval: number;
    /** 0..1: Anteil der Armee, der angreift */
    aggression: number;
    /** Anteil Belagerungswaffen an der Angriffswelle (Anzahl je 10 Soldaten) */
    siegePer10: number;
    /** Spezialeinheiten pro Welle */
    ladders: number;
    tunnelers: number;
    assassins: number;
    firethrowers: number;
  };
  aid: {
    /** Anteil der Truppen, der Verbündeten geschickt wird */
    send: number;
    /** ruft Verbündete, wenn Gegner-Übermacht dieser Faktor */
    request: number;
  };
}

const T_MIN = 600; // 1 Minute
export const AI_PROFILES: AiProfile[] = [
  {
    id: 0,
    name: 'Baron Eisenfaust',
    title: 'Der Rammbock',
    desc: 'Früher, harter Druck mit Speerträgern, Keulen und Rammböcken. Schwache Palisade.',
    castle: { name: 'Palisadenlager', ring: 9, wall: BT.WallWood, doubleWall: false, corner: BT.TowerLookout, towerEvery: 0, towerType: BT.TowerLookout, gate: BT.GateWood, gates: 1, stairs: true, moat: false, pits: false, cauldrons: 0, turret: 0, killingPits: false, garrison: 4 },
    econ: { wood: 3, stone: 1, iron: 1, pitch: 0, food: 0.9, market: false, religion: 0, ale: false, goodThings: 0, badThings: 2, peasants: 36, tax: 2 },
    army: { units: [[U.Spearman, 5], [U.Maceman, 3], [U.Archer, 1]], siege: [[U.Ram, 1]], wave: 14, waveGrow: 6, firstAttack: 6 * T_MIN, waveInterval: 3 * T_MIN, aggression: 0.9, siegePer10: 1, ladders: 3, tunnelers: 0, assassins: 0, firethrowers: 0 },
    aid: { send: 0.3, request: 2.5 },
  },
  {
    id: 1,
    name: 'Gräfin Sonnwend',
    title: 'Die Baumeisterin',
    desc: 'Hohe Steinmauern, viele Bogenschützen, spät aber mit Katapulten und Übermacht.',
    castle: { name: 'Hohe Festung', ring: 10, wall: BT.WallHigh, doubleWall: false, corner: BT.TowerGuard, towerEvery: 6, towerType: BT.TowerLookout, gate: BT.GateStone, gates: 1, stairs: true, moat: true, pits: false, cauldrons: 2, turret: 0, killingPits: false, garrison: 10 },
    econ: { wood: 3, stone: 3, iron: 1, pitch: 1, food: 1.2, market: true, religion: 2, ale: true, goodThings: 2, badThings: 0, peasants: 55, tax: 1 },
    army: { units: [[U.Archer, 6], [U.Crossbowman, 3], [U.Pikeman, 2]], siege: [[U.Catapult, 2], [U.Ram, 1]], wave: 24, waveGrow: 8, firstAttack: 11 * T_MIN, waveInterval: 4 * T_MIN, aggression: 0.7, siegePer10: 1, ladders: 4, tunnelers: 1, assassins: 0, firethrowers: 0 },
    aid: { send: 0.4, request: 2 },
  },
  {
    id: 2,
    name: 'Emir Karim',
    title: 'Der Söldnerfürst',
    desc: 'Kauft arabische Söldner: Sklaven, Schleuderer und Reiterbogenschützen. Kaum Burg.',
    castle: { name: 'Zeltburg', ring: 8, wall: BT.WallLow, doubleWall: false, corner: BT.TowerLookout, towerEvery: 0, towerType: BT.TowerLookout, gate: BT.GateWood, gates: 1, stairs: true, moat: false, pits: true, cauldrons: 0, turret: 0, killingPits: false, garrison: 3 },
    econ: { wood: 2, stone: 2, iron: 0, pitch: 0, food: 0.8, market: true, religion: 0, ale: false, goodThings: 0, badThings: 1, peasants: 30, tax: 3 },
    army: { units: [[U.Slave, 4], [U.Slinger, 4], [U.HorseArcher, 3], [U.ArabSwordsman, 3]], siege: [], wave: 16, waveGrow: 6, firstAttack: 5 * T_MIN, waveInterval: 2.5 * T_MIN, aggression: 1, siegePer10: 0, ladders: 4, tunnelers: 0, assassins: 0, firethrowers: 2 },
    aid: { send: 0.25, request: 3 },
  },
  {
    id: 3,
    name: 'Ritter Falk',
    title: 'Der Reiterfürst',
    desc: 'Schwere Kavallerie und Schwertkämpfer aus der Wehrburg. Greift mit Rittern an.',
    castle: { name: 'Reiterburg', ring: 10, wall: BT.WallLow, doubleWall: false, corner: BT.TowerGuard, towerEvery: 0, towerType: BT.TowerLookout, gate: BT.GateStone, gates: 2, stairs: true, moat: false, pits: false, cauldrons: 1, turret: 0, killingPits: false, garrison: 6 },
    econ: { wood: 3, stone: 2, iron: 3, pitch: 0, food: 1, market: true, religion: 1, ale: true, goodThings: 1, badThings: 0, peasants: 45, tax: 2 },
    army: { units: [[U.Knight, 5], [U.Swordsman, 4], [U.Archer, 2]], siege: [[U.Ram, 1]], wave: 12, waveGrow: 4, firstAttack: 9 * T_MIN, waveInterval: 3.5 * T_MIN, aggression: 0.8, siegePer10: 1, ladders: 2, tunnelers: 0, assassins: 0, firethrowers: 0 },
    aid: { send: 0.35, request: 2.2 },
  },
  {
    id: 4,
    name: 'Meister Orsolo',
    title: 'Der Belagerungsmeister',
    desc: 'Sichert sich mit Ballisten und Ölkesseln ab und erdrückt Burgen mit Trebuchets.',
    castle: { name: 'Geschützfestung', ring: 10, wall: BT.WallHigh, doubleWall: false, corner: BT.TowerRound, towerEvery: 0, towerType: BT.TowerGuard, gate: BT.GateStone, gates: 1, stairs: true, moat: false, pits: true, cauldrons: 3, turret: 1, killingPits: true, garrison: 8 },
    econ: { wood: 4, stone: 3, iron: 2, pitch: 2, food: 1, market: true, religion: 0, ale: false, goodThings: 0, badThings: 0, peasants: 50, tax: 2 },
    army: { units: [[U.Crossbowman, 4], [U.Pikeman, 3], [U.Archer, 3]], siege: [[U.Trebuchet, 2], [U.Catapult, 2], [U.FireBallista, 1], [U.Mantlet, 1]], wave: 18, waveGrow: 6, firstAttack: 12 * T_MIN, waveInterval: 4.5 * T_MIN, aggression: 0.6, siegePer10: 3, ladders: 2, tunnelers: 2, assassins: 0, firethrowers: 0 },
    aid: { send: 0.3, request: 2 },
  },
  {
    id: 5,
    name: 'Abt Benedikt',
    title: 'Der Bollwerk-Abt',
    desc: 'Frömmigkeit und Beliebtheit. Sehr defensiv, Türme, Pikeniere und Mönche, greift selten an.',
    castle: { name: 'Klosterburg', ring: 11, wall: BT.WallHigh, doubleWall: true, corner: BT.TowerRound, towerEvery: 5, towerType: BT.TowerLookout, gate: BT.GateStone, gates: 1, stairs: true, moat: true, pits: false, cauldrons: 2, turret: 2, killingPits: false, garrison: 12 },
    econ: { wood: 3, stone: 4, iron: 1, pitch: 1, food: 1.4, market: true, religion: 3, ale: true, goodThings: 4, badThings: 0, peasants: 65, tax: 0 },
    army: { units: [[U.Pikeman, 4], [U.Crossbowman, 4], [U.Monk, 2], [U.Archer, 3]], siege: [[U.Catapult, 1]], wave: 30, waveGrow: 10, firstAttack: 16 * T_MIN, waveInterval: 6 * T_MIN, aggression: 0.5, siegePer10: 1, ladders: 3, tunnelers: 0, assassins: 0, firethrowers: 0 },
    aid: { send: 0.5, request: 1.6 },
  },
  {
    id: 6,
    name: 'Sultan Zahir',
    title: 'Der Schattenherrscher',
    desc: 'Assassinen und Feuerwerfer: unsichtbare Klingen über die Mauern, dazu Reiter.',
    castle: { name: 'Palastmauer', ring: 9, wall: BT.WallLow, doubleWall: false, corner: BT.TowerLookout, towerEvery: 4, towerType: BT.TowerLookout, gate: BT.GateWood, gates: 1, stairs: true, moat: false, pits: true, cauldrons: 1, turret: 0, killingPits: true, garrison: 5 },
    econ: { wood: 2, stone: 2, iron: 0, pitch: 1, food: 0.9, market: true, religion: 0, ale: false, goodThings: 0, badThings: 1, peasants: 34, tax: 2 },
    army: { units: [[U.Assassin, 4], [U.ArabSwordsman, 3], [U.HorseArcher, 3], [U.Firethrower, 2]], siege: [], wave: 12, waveGrow: 4, firstAttack: 8 * T_MIN, waveInterval: 3 * T_MIN, aggression: 0.95, siegePer10: 0, ladders: 0, tunnelers: 0, assassins: 6, firethrowers: 3 },
    aid: { send: 0.25, request: 2.8 },
  },
  {
    id: 7,
    name: 'Kaiserin Mathilde',
    title: 'Die Allrounderin',
    desc: 'Ausgewogen: Doppelmauer, Graben und Fallen, kombinierte Wellen aus Fern-, Nahkampf und Belagerung.',
    castle: { name: 'Kaiserliche Doppelburg', ring: 11, wall: BT.WallHigh, doubleWall: false, corner: BT.TowerRound, towerEvery: 7, towerType: BT.TowerGuard, gate: BT.GateStone, gates: 1, stairs: true, moat: true, pits: true, cauldrons: 2, turret: 1, killingPits: true, garrison: 9 },
    econ: { wood: 3, stone: 3, iron: 2, pitch: 1, food: 1.2, market: true, religion: 2, ale: true, goodThings: 2, badThings: 1, peasants: 55, tax: 1 },
    army: { units: [[U.Swordsman, 3], [U.Archer, 3], [U.Crossbowman, 2], [U.Pikeman, 2], [U.Knight, 1]], siege: [[U.Catapult, 1], [U.Ram, 1], [U.SiegeTower, 1]], wave: 20, waveGrow: 7, firstAttack: 10 * T_MIN, waveInterval: 4 * T_MIN, aggression: 0.75, siegePer10: 2, ladders: 3, tunnelers: 1, assassins: 0, firethrowers: 0 },
    aid: { send: 0.4, request: 2 },
  },
  {
    id: 8,
    name: 'Wolf der Graue',
    title: 'Der Steppenwolf',
    desc: 'Reiterbogenschützen und Tunnelgräber: schnelle Überfälle und Untergrabung der Mauern.',
    castle: { name: 'Wolfsschanze', ring: 8, wall: BT.WallWood, doubleWall: false, corner: BT.TowerLookout, towerEvery: 0, towerType: BT.TowerLookout, gate: BT.GateWood, gates: 1, stairs: true, moat: false, pits: true, cauldrons: 0, turret: 0, killingPits: false, garrison: 3 },
    econ: { wood: 2, stone: 1, iron: 0, pitch: 0, food: 0.8, market: true, religion: 0, ale: false, goodThings: 0, badThings: 1, peasants: 28, tax: 3 },
    army: { units: [[U.HorseArcher, 6], [U.Slinger, 3], [U.ArabSwordsman, 2]], siege: [], wave: 14, waveGrow: 5, firstAttack: 5.5 * T_MIN, waveInterval: 2.5 * T_MIN, aggression: 1, siegePer10: 0, ladders: 2, tunnelers: 5, assassins: 0, firethrowers: 0 },
    aid: { send: 0.2, request: 3 },
  },
];

/** Missions-Gegner (nicht wählbar) */
AI_PROFILES.push(
  {
    id: 9,
    hidden: true,
    name: 'Banditenhauptmann',
    title: 'Der Plünderer',
    desc: 'Kleine, frühe Überfälle (Tutorial).',
    castle: { name: 'Lager', ring: 8, wall: BT.WallWood, doubleWall: false, corner: 0, towerEvery: 0, towerType: BT.TowerLookout, gate: BT.GateWood, gates: 1, stairs: false, moat: false, pits: false, cauldrons: 0, turret: 0, killingPits: false, garrison: 2 },
    econ: { wood: 2, stone: 1, iron: 0, pitch: 0, food: 0.8, market: false, religion: 0, ale: false, goodThings: 0, badThings: 0, peasants: 24, tax: 2 },
    army: { units: [[U.Spearman, 3], [U.Archer, 2]], siege: [], wave: 8, waveGrow: 3, firstAttack: 5 * T_MIN, waveInterval: 2 * T_MIN, aggression: 1, siegePer10: 0, ladders: 0, tunnelers: 0, assassins: 0, firethrowers: 0 },
    aid: { send: 0, request: 99 },
  },
  {
    id: 10,
    hidden: true,
    name: 'Wächter',
    title: 'Der Zögerliche',
    desc: 'Verteidigt nur (Tutorial).',
    castle: { name: 'Wachfestung', ring: 9, wall: BT.WallLow, doubleWall: false, corner: BT.TowerLookout, towerEvery: 0, towerType: BT.TowerLookout, gate: BT.GateWood, gates: 1, stairs: true, moat: false, pits: false, cauldrons: 0, turret: 0, killingPits: false, garrison: 4 },
    econ: { wood: 2, stone: 2, iron: 1, pitch: 0, food: 1, market: false, religion: 0, ale: false, goodThings: 0, badThings: 0, peasants: 30, tax: 1 },
    army: { units: [[U.Spearman, 3], [U.Archer, 3], [U.Maceman, 2]], siege: [], wave: 999, waveGrow: 0, firstAttack: 9999 * T_MIN, waveInterval: 9999 * T_MIN, aggression: 0, siegePer10: 0, ladders: 0, tunnelers: 0, assassins: 0, firethrowers: 0 },
    aid: { send: 0, request: 99 },
  },
);

/** Bonus-Gold pro Spielmonat je Schwierigkeit (0 = fair, kein Cheat) */
export const AI_DIFFICULTY_GOLD = [0, 40, 100, 200];
