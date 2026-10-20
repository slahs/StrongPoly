import { BT, R, WorkerPhase as P } from '@strongpoly/shared';

/**
 * Berufe der Bauern. Die Sim kennt nur den Einheitentyp „Bauer“; der Beruf ergibt sich rein darstellerisch aus
 * dem Arbeitsplatz (Gebäude neben dem Arbeiter), dem Teilzustand der Arbeit (`aux >> 4`, Sim-Phase `P.*`) und der
 * getragenen Ware. Der Renderer merkt sich den zuletzt sicher erkannten Beruf je Einheit, damit das Aussehen nicht flackert.
 */
export const JOB = {
  /** Landarbeiter ohne festen Beruf */
  None: 0,
  Woodcutter: 1,
  Stonemason: 2,
  Miner: 3,
  PitchWorker: 4,
  Orchard: 5,
  Dairy: 6,
  Hunter: 7,
  Farmer: 8,
  HopPicker: 9,
  Miller: 10,
  Baker: 11,
  Brewer: 12,
  Bowyer: 13,
  Turner: 14,
  Smith: 15,
  Tanner: 16,
  Armorer: 17,
  Digger: 18,
  Carpenter: 19,
  Innkeeper: 20,
  Trader: 21,
  Cleric: 22,
} as const;
export const JOB_COUNT = 23;

export const JOB_NAMES: string[] = [
  'Bauer',
  'Holzfäller',
  'Steinmetz',
  'Bergmann',
  'Pechsieder',
  'Obstbauer',
  'Milchbauer',
  'Jäger',
  'Landwirt',
  'Hopfenpflücker',
  'Müller',
  'Bäcker',
  'Brauer',
  'Bogner',
  'Drechsler',
  'Schmied',
  'Gerber',
  'Plattner',
  'Gräber',
  'Zimmermann',
  'Wirt',
  'Händler',
  'Geistlicher',
];

/** Armstil (ARM.*) des rechten/linken Arms je Beruf; Bauernarme tragen den Stil 9 (rechts) bzw. 10 (links) und lesen hier nach */
export const JOB_ARM_R: number[] = [6, 0, 4, 6, 5, 3, 5, 4, 3, 3, 7, 5, 5, 4, 4, 2, 4, 4, 6, 4, 7, 7, 7];
export const JOB_ARM_L: number[] = [0, 0, 7, 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 7, 7, 7, 7];

/** Beruf eines Arbeitsplatz-Gebäudes (-1 = kein Arbeitsplatz) */
export const JOB_OF_BUILDING: number[] = (() => {
  const a: number[] = new Array(64).fill(-1);
  a[BT.Woodcutter] = JOB.Woodcutter;
  a[BT.Quarry] = JOB.Stonemason;
  a[BT.IronMine] = JOB.Miner;
  a[BT.PitchRig] = JOB.PitchWorker;
  a[BT.AppleOrchard] = JOB.Orchard;
  a[BT.DairyFarm] = JOB.Dairy;
  a[BT.HunterPost] = JOB.Hunter;
  a[BT.WheatFarm] = JOB.Farmer;
  a[BT.HopFarm] = JOB.HopPicker;
  a[BT.Mill] = JOB.Miller;
  a[BT.Bakery] = JOB.Baker;
  a[BT.Brewery] = JOB.Brewer;
  a[BT.Inn] = JOB.Innkeeper;
  a[BT.Fletcher] = JOB.Bowyer;
  a[BT.Poleturner] = JOB.Turner;
  a[BT.Blacksmith] = JOB.Smith;
  a[BT.Tanner] = JOB.Tanner;
  a[BT.Armorer] = JOB.Armorer;
  a[BT.Market] = JOB.Trader;
  a[BT.Chapel] = JOB.Cleric;
  a[BT.Church] = JOB.Cleric;
  a[BT.Cathedral] = JOB.Cleric;
  return a;
})();

/** Beruf anhand der getragenen Ware (Ressourcen-ID), -1 = unbekannt */
export const JOB_OF_RES: number[] = (() => {
  const a: number[] = new Array(32).fill(-1);
  a[R.Wood] = JOB.Woodcutter;
  a[R.Stone] = JOB.Stonemason;
  a[R.Iron] = JOB.Miner;
  a[R.Pitch] = JOB.PitchWorker;
  a[R.Hops] = JOB.HopPicker;
  a[R.Ale] = JOB.Brewer;
  a[R.Wheat] = JOB.Farmer;
  a[R.Flour] = JOB.Miller;
  a[R.Cow] = JOB.Tanner;
  a[R.Apple] = JOB.Orchard;
  a[R.Cheese] = JOB.Dairy;
  a[R.Meat] = JOB.Hunter;
  a[R.Bread] = JOB.Baker;
  a[R.Bow] = JOB.Bowyer;
  a[R.Crossbow] = JOB.Bowyer;
  a[R.Spear] = JOB.Turner;
  a[R.Pike] = JOB.Turner;
  a[R.Mace] = JOB.Smith;
  a[R.Sword] = JOB.Smith;
  a[R.Leather] = JOB.Tanner;
  a[R.Armor] = JOB.Armorer;
  return a;
})();

export interface JobInput {
  /** zuletzt sicher erkannter Beruf (JOB.None, wenn noch keiner) */
  prev: number;
  /** Sim-Teilzustand (`aux >> 4`) */
  sub: number;
  /** getragene Ware: 0 = nichts, sonst Ressourcen-ID + 1 */
  carry: number;
  /** Arbeitsplatz-Gebäudetyp direkt neben dem Arbeiter, -1 = keiner */
  nearBuilding: number;
  /** nur bei Suche/Sammeln im Freien: Typ des nächsten Roam-Gebäudes (Holzfäller/Jägerhütte), sonst -1 */
  roamBuilding: number;
}

export interface JobResult {
  /** darzustellender Beruf */
  show: number;
  /** neuer Merker (bleibt bei vorübergehenden Tätigkeiten wie Graben unverändert) */
  keep: number;
}

/** Teilzustände, bei denen der Arbeiter am Arbeitsplatz steht */
const AT_WORK: Record<number, true> = { [P.Working]: true, [P.WaitWork]: true };
/** Teilzustände im Freien (Suchen, Sammeln) */
const OUTDOOR: Record<number, true> = { [P.Search]: true, [P.ToRes]: true, [P.Gather]: true };

/**
 * Bestimmt den Beruf. Reihenfolge der Belege: vorübergehende Aufträge (Graben, Reparieren) → Arbeitsplatz-Gebäude
 * (sicher, wird gemerkt) → Sammeln im Freien mit nahem Holzfäller-/Jägerposten → getragene Ware (nur ohne bisherigen Beruf).
 */
export function resolveJob(i: JobInput): JobResult {
  if (i.sub === P.Dig || i.sub === P.ToDig) return { show: JOB.Digger, keep: i.prev };
  if (i.sub === P.Repair || i.sub === P.ToRepair) return { show: JOB.Carpenter, keep: i.prev };
  if (AT_WORK[i.sub] && i.nearBuilding >= 0 && JOB_OF_BUILDING[i.nearBuilding] >= 0) {
    const j = JOB_OF_BUILDING[i.nearBuilding];
    return { show: j, keep: j };
  }
  if (i.prev === JOB.None) {
    if (OUTDOOR[i.sub] && i.roamBuilding >= 0 && JOB_OF_BUILDING[i.roamBuilding] >= 0) {
      const j = JOB_OF_BUILDING[i.roamBuilding];
      return { show: j, keep: j };
    }
    if (i.carry > 0) {
      const j = JOB_OF_RES[i.carry - 1];
      if (j !== undefined && j >= 0) return { show: j, keep: j };
    }
  }
  return { show: i.prev, keep: i.prev };
}
