/**
 * Vertrag zwischen Sprachsystem (Meilenstein 4D, Agent „Stimmen“) und Berater (4E, Agent „Berater/HUD“).
 * Das Sprachsystem implementiert `VoiceApi` und hängt es als `AudioEngine.voice` an; der Berater ruft nur diese Schnittstelle.
 * Fehlt ein Clip, spricht das System den Text über den Fallback (Browser-TTS) oder bleibt stumm – der Aufrufer muss das nicht wissen.
 */

/** 0 = normal, 1 = wichtig, 2 = kritisch (unterbricht/verdrängt niedrigere Prioritäten) */
export type VoicePriority = 0 | 1 | 2;

export interface SpeakRequest {
  /** Stimme/Sprechertyp, z. B. 'advisor', 'soldier', 'archer', 'woodcutter', 'peasant' */
  voice: string;
  /** stabile Zeilen-ID, z. B. 'advisor.wood.low'; dient als Clip-Schlüssel und zur Wiederholungssperre */
  key: string;
  /** Text der Zeile (Untertitel und TTS-Fallback), Sprache laut `lang` */
  text: string;
  lang?: 'de' | 'en';
  priority?: VoicePriority;
  /** Weltposition für räumliche Einheitenstimmen (Berater: weglassen = nicht räumlich) */
  pos?: { x: number; y: number };
}

export interface VoiceApi {
  /** Zeile sprechen; false, wenn sie verworfen wurde (stumm, gesperrt, zu niedrige Priorität, Abstand zu klein) */
  say(req: SpeakRequest): boolean;
  /** letzte Beraterzeile erneut sprechen */
  replayLast(voice?: string): boolean;
  /** Text der zuletzt gesprochenen Zeile einer Stimme (null, wenn keine) */
  lastText(voice?: string): string | null;
  /** laufende Sprache beenden (Kategorie: 'advisor' | 'unit'; ohne Angabe alles) */
  stop(category?: 'advisor' | 'unit'): void;
  /** Untertitel-Rückruf (wird nur gerufen, wenn Untertitel aktiviert sind) */
  onSubtitle: ((text: string, voice: string) => void) | null;
}
