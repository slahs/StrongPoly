import { U } from '@strongpoly/shared';

/** Klangklassen der Einheiten für Auswahl-/Befehlsrückmeldung. */
export type VoiceClass = 'infantry' | 'archer' | 'cavalry' | 'siege' | 'worker' | 'lord' | 'monk' | 'special';
export type CommandKind = 'move' | 'attack' | 'attackMove' | 'stop' | 'work' | 'other';

const CLASS_OF: Record<number, VoiceClass> = {
  [U.Peasant]: 'worker',
  [U.Ox]: 'worker',
  [U.Laddermen]: 'worker',
  [U.Engineer]: 'worker',
  [U.Lord]: 'lord',
  [U.Archer]: 'archer',
  [U.Crossbowman]: 'archer',
  [U.Slinger]: 'archer',
  [U.Spearman]: 'infantry',
  [U.Pikeman]: 'infantry',
  [U.Maceman]: 'infantry',
  [U.Swordsman]: 'infantry',
  [U.ArabSwordsman]: 'infantry',
  [U.Knight]: 'cavalry',
  [U.HorseArcher]: 'cavalry',
  [U.Monk]: 'monk',
  [U.Tunneler]: 'special',
  [U.Slave]: 'special',
  [U.Assassin]: 'special',
  [U.Firethrower]: 'special',
  [U.Catapult]: 'siege',
  [U.Trebuchet]: 'siege',
  [U.Ram]: 'siege',
  [U.SiegeTower]: 'siege',
  [U.Mantlet]: 'siege',
  [U.FireBallista]: 'siege',
};

export function voiceClassOf(unitType: number): VoiceClass {
  return CLASS_OF[unitType] ?? 'infantry';
}

/** Welche Klasse einer Auswahl "spricht"? Wichtigere Klassen zuerst. */
const PRIORITY: VoiceClass[] = ['lord', 'cavalry', 'siege', 'infantry', 'archer', 'special', 'monk', 'worker'];
export function leadClass(types: Iterable<number>): VoiceClass | null {
  let best = -1;
  let cls: VoiceClass | null = null;
  for (const t of types) {
    const c = voiceClassOf(t);
    const p = PRIORITY.length - PRIORITY.indexOf(c);
    if (p > best) {
      best = p;
      cls = c;
    }
  }
  return cls;
}
