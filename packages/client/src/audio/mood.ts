import type { GameMood } from './theory';

/** Eingabe der Stimmungsableitung (aus dem Client-Spiegel des Spielzustands). */
export interface MoodInput {
  /** Anzahl feindlicher Soldaten in der Nähe eigener Gebäude/Burg */
  enemyNear: number;
  /** Kampfereignisse (Treffer, Angriffe, Einstürze) seit dem letzten Aufruf, gewichtet */
  combat: number;
}

/**
 * Leitet aus Bedrohung und Kampfgeschehen die Musikstimmung ab.
 * Mit Hysterese und Mindestverweildauer, damit sie nicht flackert.
 */
export class MoodDirector {
  mood: GameMood = 'build';
  /** geglättete Kampfrate (Ereignisse/s) */
  combatRate = 0;
  private inMood = 0;
  private battleHeld = 0;
  private battleQuiet = 0;
  private threatHeld = 0;
  private threatNone = 0;

  static readonly BATTLE_ON = 2.2;
  static readonly BATTLE_OFF = 0.7;
  static readonly THREAT_ON = 3;

  update(dt: number, inp: MoodInput): GameMood {
    dt = Math.max(0.001, dt);
    const rate = inp.combat / dt;
    this.combatRate += (rate - this.combatRate) * Math.min(1, dt / 2);
    this.inMood += dt;

    const battleOn = this.combatRate > MoodDirector.BATTLE_ON;
    const battleOff = this.combatRate < MoodDirector.BATTLE_OFF;
    const threatOn = inp.enemyNear >= MoodDirector.THREAT_ON;
    const threatNone = inp.enemyNear === 0;

    this.battleHeld = battleOn ? this.battleHeld + dt : 0;
    this.battleQuiet = battleOff ? this.battleQuiet + dt : 0;
    this.threatHeld = threatOn ? this.threatHeld + dt : 0;
    this.threatNone = threatNone ? this.threatNone + dt : 0;

    const go = (m: GameMood): void => {
      this.mood = m;
      this.inMood = 0;
      this.battleHeld = this.battleQuiet = this.threatHeld = this.threatNone = 0;
    };

    switch (this.mood) {
      case 'build':
        if (this.battleHeld >= 1.5) go('battle');
        else if (this.threatHeld >= 2 && this.inMood >= 6) go('tension');
        break;
      case 'tension':
        if (this.battleHeld >= 1.5 && this.inMood >= 4) go('battle');
        else if (this.threatNone >= 12 && this.combatRate < MoodDirector.BATTLE_OFF && this.inMood >= 10) go('build');
        break;
      case 'battle':
        if (this.battleQuiet >= 9 && this.inMood >= 12) go(inp.enemyNear > 0 ? 'tension' : 'build');
        break;
    }
    return this.mood;
  }

  reset(): void {
    this.mood = 'build';
    this.combatRate = 0;
    this.inMood = this.battleHeld = this.battleQuiet = this.threatHeld = this.threatNone = 0;
  }
}
