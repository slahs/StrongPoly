/**
 * Sprachdaten für Einheiten, Bewohner und Berater (Meilenstein 4D): Ereigniskategorien, Stimmprofile, Zeilenregister.
 * Texte in `voices.de.ts` / `voices.en.ts`; fehlende englische Einträge fallen auf Deutsch zurück.
 * Die Stimmprofile dienen dem Generator-Skript (`scripts/gen-voices.mjs`, Clip-Erzeugung) und dem Browser-Ersatz.
 */
import { ADVISOR_DE, VOICE_DE } from './voices.de';
import { ADVISOR_EN, VOICE_EN } from './voices.en';

export type VoiceLang = 'de' | 'en';

/** Ereigniskategorien: Auswahl, Bewegungsbefehl, Angriff, Verteidigung/Halten, Arbeiten, Abschluss, verwundet, Besonderes */
export type VoiceEvent = 'select' | 'move' | 'attack' | 'hold' | 'work' | 'done' | 'wounded' | 'special';
export const VOICE_EVENTS: readonly VoiceEvent[] = ['select', 'move', 'attack', 'hold', 'work', 'done', 'wounded', 'special'];

/** Zeilen je Gruppe und Ereignis */
export type VoiceLines = Record<string, Partial<Record<VoiceEvent, string[]>>>;
/** Beraterzeilen mit frei vergebenem Schlüssel */
export type AdvisorLines = Record<string, { text: string; alarm?: boolean }>;

/** Mindestanzahl Varianten je definiertem Ereignis */
export const MIN_VARIANTS = 3;

export type TtsModel = 'thorsten-high' | 'thorsten-medium' | 'thorsten-emotional' | 'kerstin' | 'en-joe' | 'en-john' | 'en-norman' | 'en-kathleen';
export type VoiceFx = 'none' | 'room' | 'helm' | 'hall' | 'chapel' | 'air' | 'shop' | 'yard';

export interface VoiceProfile {
  id: string;
  label: string;
  /** Stimme des Generators für Deutsch (Piper/VITS-Modell, Sprecher-ID, nur bei `thorsten-emotional` > 0) */
  tts: { model: TtsModel; sid: number };
  /** Stimme des Generators für Englisch */
  ttsEn: { model: TtsModel; sid: number };
  /** Tonhöhenverschiebung in Halbtönen (negativ = tiefer) */
  pitch: number;
  /** Sprechgeschwindigkeit (1 = Modell-Standard) */
  speed: number;
  /** Klangfarbe/Raum */
  fx: VoiceFx;
  /** Pegelkorrektur in dB nach der Normalisierung */
  gain: number;
  /** Ersatzstimme des Browsers, wenn kein Clip vorliegt */
  browser: { pitch: number; rate: number; female?: boolean };
  /** räumlich (Einheit in der Welt) oder direkt (Berater) */
  spatial: boolean;
}

const E = { amused: 0, angry: 1, disgusted: 2, drunk: 3, neutral: 4, sleepy: 5, surprised: 6, whisper: 7 } as const;

function P(id: string, label: string, model: TtsModel, sid: number, pitch: number, speed: number, fx: VoiceFx, gain: number, browser: VoiceProfile['browser'], spatial = true): VoiceProfile {
  return { id, label, tts: { model, sid }, ttsEn: { model: EN_VOICE[id] ?? 'en-john', sid: 0 }, pitch, speed, fx, gain, browser, spatial };
}

/** Englische Sprecher je Profil (alle CC0/gemeinfrei: joe, john, norman, kathleen) */
const EN_VOICE: Record<string, TtsModel> = {
  swordsman: 'en-norman',
  spearman: 'en-john',
  archer: 'en-joe',
  crossbow: 'en-john',
  knight: 'en-norman',
  mercenary: 'en-joe',
  assassin: 'en-john',
  siege: 'en-norman',
  engineer: 'en-joe',
  monk: 'en-john',
  lord: 'en-norman',
  peasant: 'en-kathleen',
  woodcutter: 'en-joe',
  mason: 'en-norman',
  farmer: 'en-john',
  baker: 'en-kathleen',
  miller: 'en-joe',
  brewer: 'en-john',
  smith: 'en-norman',
  trader: 'en-joe',
  advisor: 'en-norman',
  'advisor.alarm': 'en-joe',
};

/** Stimmprofile je Gruppe (+ `advisor`, `advisor.alarm`). Zwei echte Sprecher (männlich/weiblich) – Unterscheidung über Stil, Tonhöhe, Tempo und Klangfarbe. */
export const VOICE_PROFILES: Record<string, VoiceProfile> = Object.fromEntries(
  [
    P('swordsman', 'Schwertkämpfer', 'thorsten-emotional', E.neutral, -1.5, 1.04, 'helm', 0, { pitch: 0.7, rate: 1.0 }),
    P('spearman', 'Speerkämpfer', 'thorsten-medium', 0, -1.0, 1.05, 'helm', 0, { pitch: 0.85, rate: 1.0 }),
    P('archer', 'Bogenschütze', 'thorsten-high', 0, 1.5, 1.08, 'air', 0, { pitch: 1.15, rate: 1.05 }),
    P('crossbow', 'Armbrustschütze', 'thorsten-medium', 0, 0.5, 1.0, 'air', 0, { pitch: 1.0, rate: 0.95 }),
    P('knight', 'Ritter', 'thorsten-high', 0, -2.5, 0.95, 'helm', 0, { pitch: 0.5, rate: 0.9 }),
    P('mercenary', 'Söldner', 'thorsten-emotional', E.amused, 0.5, 1.0, 'air', 0, { pitch: 1.05, rate: 1.0 }),
    P('assassin', 'Assassine', 'thorsten-emotional', E.whisper, 0, 1.0, 'none', 1, { pitch: 0.9, rate: 0.9 }),
    P('siege', 'Belagerungsmannschaft', 'thorsten-emotional', E.angry, -1.5, 1.0, 'yard', 0, { pitch: 0.6, rate: 0.95 }),
    P('engineer', 'Ingenieur', 'thorsten-medium', 0, 1.8, 1.08, 'air', 0, { pitch: 1.2, rate: 1.05 }),
    P('monk', 'Mönch', 'thorsten-emotional', E.sleepy, -0.5, 1.12, 'chapel', 0, { pitch: 0.95, rate: 0.85 }),
    P('lord', 'Lord', 'thorsten-high', 0, -2.0, 0.95, 'hall', 0, { pitch: 0.55, rate: 0.9 }),
    P('peasant', 'Bauer', 'kerstin', 0, 0, 1.0, 'none', 0, { pitch: 1.1, rate: 1.0, female: true }),
    P('woodcutter', 'Holzfäller', 'thorsten-medium', 0, -2.0, 1.02, 'yard', 0, { pitch: 0.7, rate: 1.0 }),
    P('mason', 'Steinmetz', 'thorsten-emotional', E.disgusted, -1.5, 1.0, 'yard', 0, { pitch: 0.75, rate: 0.95 }),
    P('farmer', 'Landwirt', 'thorsten-emotional', E.amused, -1.0, 1.0, 'yard', 0, { pitch: 0.95, rate: 1.0 }),
    P('baker', 'Bäckerin', 'kerstin', 0, 1.5, 1.04, 'shop', 0, { pitch: 1.3, rate: 1.0, female: true }),
    P('miller', 'Müller', 'thorsten-emotional', E.neutral, 0.5, 0.98, 'yard', 0, { pitch: 1.0, rate: 0.95 }),
    P('brewer', 'Brauer', 'thorsten-emotional', E.sleepy, -1.5, 1.1, 'shop', 0, { pitch: 0.8, rate: 0.95 }),
    P('smith', 'Schmied', 'thorsten-emotional', E.angry, -2.0, 1.0, 'shop', 0, { pitch: 0.55, rate: 0.95 }),
    P('trader', 'Händler', 'thorsten-emotional', E.amused, 2.0, 1.1, 'shop', 0, { pitch: 1.3, rate: 1.1 }),
    P('advisor', 'Hofberater', 'thorsten-high', 0, -1.0, 0.97, 'room', 0, { pitch: 0.9, rate: 0.95 }, false),
    P('advisor.alarm', 'Hofberater (dringend)', 'thorsten-emotional', E.surprised, -1.0, 1.08, 'room', 0, { pitch: 1.0, rate: 1.1 }, false),
  ].map((p) => [p.id, p]),
);

/** Gruppen der Einheiten/Bewohner (ohne Berater) */
export const VOICE_GROUPS: readonly string[] = Object.keys(VOICE_DE);

export function voiceKey(group: string, event: VoiceEvent, n: number): string {
  return `${group}.${event}.${n}`;
}

const KEY_RE = /^([a-z]+)\.([a-z]+)\.(\d+)$/;
export function parseVoiceKey(key: string): { group: string; event: VoiceEvent; n: number } | null {
  const m = KEY_RE.exec(key);
  if (!m || !(VOICE_EVENTS as readonly string[]).includes(m[2])) return null;
  return { group: m[1], event: m[2] as VoiceEvent, n: Number(m[3]) };
}

const PACKS: Record<VoiceLang, { units: VoiceLines; advisor: AdvisorLines }> = {
  de: { units: VOICE_DE, advisor: ADVISOR_DE },
  en: { units: VOICE_EN, advisor: ADVISOR_EN },
};

/** Zeilen (Texte) einer Gruppe und eines Ereignisses; fehlt die Sprache, gilt Deutsch. */
export function voiceLines(group: string, event: VoiceEvent, lang: VoiceLang = 'de'): string[] {
  return PACKS[lang].units[group]?.[event] ?? VOICE_DE[group]?.[event] ?? [];
}

/** Ereignisse, die eine Gruppe (auf Deutsch) kennt */
export function voiceEventsOf(group: string): VoiceEvent[] {
  const g = VOICE_DE[group];
  return g ? VOICE_EVENTS.filter((e) => (g[e]?.length ?? 0) > 0) : [];
}

/** Text einer Zeile per Schlüssel; undefined, wenn es den Schlüssel nicht gibt. Englisch fällt auf Deutsch zurück. */
export function voiceText(key: string, lang: VoiceLang = 'de'): string | undefined {
  const adv = PACKS[lang].advisor[key] ?? ADVISOR_DE[key];
  if (adv) return adv.text;
  const k = parseVoiceKey(key);
  if (!k) return undefined;
  return voiceLines(k.group, k.event, lang)[k.n - 1];
}

export interface VoiceLine {
  key: string;
  /** Stimme (Gruppe oder `advisor`) */
  voice: string;
  /** Profil für die Clip-Erzeugung (bei dringenden Beraterzeilen `advisor.alarm`) */
  profile: string;
  event: VoiceEvent | 'advisor';
  text: string;
}

/** Alle Zeilen einer Sprache in stabiler Reihenfolge (Generator, Manifest, Tests) */
export function allVoiceLines(lang: VoiceLang = 'de'): VoiceLine[] {
  const out: VoiceLine[] = [];
  for (const group of VOICE_GROUPS) {
    for (const ev of VOICE_EVENTS) {
      const de = VOICE_DE[group]?.[ev];
      if (!de) continue;
      const own = PACKS[lang].units[group]?.[ev];
      for (let i = 0; i < de.length; i++) out.push({ key: voiceKey(group, ev, i + 1), voice: group, profile: group, event: ev, text: own?.[i] ?? de[i] });
    }
  }
  for (const key of Object.keys(ADVISOR_DE)) {
    const own = PACKS[lang].advisor[key];
    out.push({ key, voice: 'advisor', profile: ADVISOR_DE[key].alarm ? 'advisor.alarm' : 'advisor', event: 'advisor', text: own?.text ?? ADVISOR_DE[key].text });
  }
  return out;
}

/** Schlüssel der Beraterzeilen */
export const ADVISOR_KEYS: readonly string[] = Object.keys(ADVISOR_DE);
