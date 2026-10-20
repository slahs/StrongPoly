/**
 * Zuordnung Einheiten-/Gebäudetyp → Sprechergruppe (Daten in shared/data/voices.*) und Befehlsart → Ereignis.
 * Reine Logik ohne WebAudio, getestet in `audio_voice.test.ts`.
 */
import { BT, U, VoiceEvent } from '@strongpoly/shared';
import type { CommandKind } from './classes';

const UNIT_GROUP: Record<number, string> = {
  [U.Peasant]: 'peasant',
  [U.Lord]: 'lord',
  [U.Archer]: 'archer',
  [U.Crossbowman]: 'crossbow',
  [U.Slinger]: 'mercenary',
  [U.Spearman]: 'spearman',
  [U.Pikeman]: 'spearman',
  [U.Maceman]: 'swordsman',
  [U.Swordsman]: 'swordsman',
  [U.ArabSwordsman]: 'mercenary',
  [U.Knight]: 'knight',
  [U.HorseArcher]: 'mercenary',
  [U.Monk]: 'monk',
  [U.Tunneler]: 'engineer',
  [U.Laddermen]: 'engineer',
  [U.Engineer]: 'engineer',
  [U.Slave]: 'mercenary',
  [U.Firethrower]: 'mercenary',
  [U.Assassin]: 'assassin',
  [U.Catapult]: 'siege',
  [U.Trebuchet]: 'siege',
  [U.Ram]: 'siege',
  [U.SiegeTower]: 'siege',
  [U.Mantlet]: 'siege',
  [U.FireBallista]: 'siege',
};

/** Sprechergruppe einer Einheit; Ochsen sprechen nicht (null). */
export function groupOfUnit(unitType: number): string | null {
  if (unitType === U.Ox) return null;
  return UNIT_GROUP[unitType] ?? 'swordsman';
}

const BUILDING_GROUP: Record<number, string> = {
  [BT.Woodcutter]: 'woodcutter',
  [BT.Quarry]: 'mason',
  [BT.IronMine]: 'mason',
  [BT.WheatFarm]: 'farmer',
  [BT.HopFarm]: 'farmer',
  [BT.AppleOrchard]: 'farmer',
  [BT.DairyFarm]: 'farmer',
  [BT.HunterPost]: 'farmer',
  [BT.Granary]: 'farmer',
  [BT.Mill]: 'miller',
  [BT.Bakery]: 'baker',
  [BT.Brewery]: 'brewer',
  [BT.Inn]: 'brewer',
  [BT.Blacksmith]: 'smith',
  [BT.Armorer]: 'smith',
  [BT.Fletcher]: 'smith',
  [BT.Poleturner]: 'smith',
  [BT.Tanner]: 'smith',
  [BT.Market]: 'trader',
  [BT.Chapel]: 'monk',
  [BT.Church]: 'monk',
  [BT.Cathedral]: 'monk',
  [BT.Barracks]: 'swordsman',
  [BT.MercPost]: 'mercenary',
  [BT.Stable]: 'knight',
  [BT.EngineerGuild]: 'engineer',
};

/** Sprecher der Bewohner eines Gebäudes (null: Gebäude ohne Stimme, z. B. Mauern) */
export function groupOfBuilding(buildingType: number): string | null {
  return BUILDING_GROUP[buildingType] ?? null;
}

/** Gruppen, die der Soundscape aus der Arbeitsart ableitet (Bäume → Holzfäller, Vorkommen → Steinmetz, Ernte → Landwirt, sonst Bauer) */
export const TASK_GROUPS: readonly string[] = ['peasant', 'woodcutter', 'mason', 'farmer'];

/** Alle Gruppen, die im Spiel erreichbar sind (für den Test auf tote Daten) */
export function reachableGroups(): Set<string> {
  const s = new Set<string>(TASK_GROUPS);
  for (const g of Object.values(UNIT_GROUP)) s.add(g);
  for (const g of Object.values(BUILDING_GROUP)) s.add(g);
  return s;
}

/** Welche Gruppe „spricht“ bei gemischter Auswahl? Wichtigere zuerst (Lord, Reiter, Belagerung, Fußvolk, Schützen …). */
const GROUP_ORDER = ['lord', 'knight', 'siege', 'swordsman', 'spearman', 'crossbow', 'archer', 'mercenary', 'assassin', 'engineer', 'monk', 'peasant'];

export function leadGroup(types: Iterable<number>): string | null {
  let best = -1;
  let group: string | null = null;
  for (const t of types) {
    const g = groupOfUnit(t);
    if (!g) continue;
    const p = GROUP_ORDER.length - GROUP_ORDER.indexOf(g);
    if (p > best) {
      best = p;
      group = g;
    }
  }
  return group;
}

/** Ereigniskategorie eines Befehls an Einheiten (null: keine Sprachrückmeldung) */
export function eventOfCommand(kind: CommandKind): VoiceEvent | null {
  switch (kind) {
    case 'move':
      return 'move';
    case 'attack':
    case 'attackMove':
      return 'attack';
    case 'stop':
      return 'hold';
    case 'work':
      return 'work';
    default:
      return null;
  }
}
