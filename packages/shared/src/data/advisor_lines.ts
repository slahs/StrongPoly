/**
 * Zeilen des Hofberaters als Daten: Ereignis (Thema, Priorität, Art, Abklingzeit) und Texte je Variante in Deutsch
 * (vollständig) und Englisch (ergänzend, Rückfall auf Deutsch). Die Ereignislogik (`client/src/ui/advisor.ts`) entscheidet
 * aus echten Spieldaten, WANN ein Ereignis gilt; hier steht nur, WAS der Berater dazu sagt.
 *
 * Stil: mittelalterlich, respektvoll aber nicht unterwürfig, ruhig und sachlich, bei Gefahr knapp und alarmiert,
 * gelegentlich trocken-humorvoll. Kurze, gut sprechbare Sätze. Zahlen kommen als Platzhalter `{n}` aus den echten Daten.
 *
 * Schlüssel einer Zeile: `advisor.<ereignis>.<nr>` (Nr ab 1); derselbe Schlüssel dient dem Sprachsystem als Clip-Schlüssel.
 */
import { fill, getLang } from './descriptions';
import type { Lang, Params } from './descriptions';

/** Name und Titel des Hofberaters (Anzeige im Beraterpanel) */
export const ADVISOR_NAME_DE = 'Ansgar, Kämmerer des Hofes';
export const ADVISOR_NAME_EN = 'Ansgar, Chamberlain of the Court';

export type AdvisorTopic = 'economy' | 'food' | 'popularity' | 'military' | 'development';
/** 0 normal, 1 wichtig, 2 kritisch (entspricht `VoicePriority`) */
export type AdvisorPrio = 0 | 1 | 2;
export type AdvisorKind = 'info' | 'warn' | 'alert';

export interface AdvisorEventDef {
  id: string;
  topic: AdvisorTopic;
  prio: AdvisorPrio;
  kind: AdvisorKind;
  /** Platzhalter, die die Ereignislogik liefert */
  params: string[];
  /** Anzahl der Textvarianten (Schlüssel `advisor.<id>.1` … `.<variants>`) */
  variants: number;
  /** Mindestabstand gleicher Meldungen in Ticks (10 Ticks = 1 s); sonst nach Priorität */
  cooldown?: number;
}

const ev = (id: string, topic: AdvisorTopic, prio: AdvisorPrio, kind: AdvisorKind, params: string[], variants = 1, cooldown?: number): AdvisorEventDef => ({ id, topic, prio, kind, params, variants, cooldown });

const CAUSES = ['tax', 'ration', 'crowd', 'bad', 'events', 'other'] as const;
export type AdvisorPopCause = (typeof CAUSES)[number];

export const ADVISOR_EVENTS: AdvisorEventDef[] = [
  // Wirtschaft
  ev('res.low.plain', 'economy', 1, 'warn', ['res', 'n'], 2),
  ev('res.low.noprod', 'economy', 1, 'warn', ['res', 'n'], 1),
  ev('res.low.multi', 'economy', 1, 'warn', ['list', 'n'], 1),
  ev('res.empty', 'economy', 1, 'alert', ['res'], 2),
  ev('res.empty.multi', 'economy', 1, 'alert', ['list', 'n'], 1),
  ev('res.recovered', 'economy', 0, 'info', ['res'], 2),
  ev('res.recovered.multi', 'economy', 0, 'info', ['list', 'n'], 1),
  ev('storage.full', 'economy', 0, 'warn', ['store'], 2),
  ev('storage.full.multi', 'economy', 0, 'warn', ['list', 'n'], 1),
  ev('workers.short', 'economy', 1, 'warn', ['jobs', 'peasants'], 2),
  ev('workers.short.housing', 'economy', 1, 'warn', ['jobs', 'peasants'], 1),
  ev('housing.full', 'economy', 0, 'warn', ['housing'], 1),
  ev('chain.noinput', 'economy', 1, 'warn', ['building', 'res'], 2),
  ev('chain.noinput.multi', 'economy', 1, 'warn', ['list', 'n'], 1),
  ev('chain.noworkers', 'economy', 1, 'warn', ['building'], 1),
  ev('chain.noworkers.multi', 'economy', 1, 'warn', ['list', 'n'], 1),
  ev('chain.blocked', 'economy', 0, 'warn', ['building'], 1),
  ev('chain.blocked.multi', 'economy', 0, 'warn', ['list', 'n'], 1),
  ev('chain.recovered', 'economy', 0, 'info', [], 1),
  // Nahrung
  ev('food.low', 'food', 1, 'warn', ['months'], 2),
  ev('food.low.noprod', 'food', 1, 'warn', ['months'], 1),
  ev('food.empty', 'food', 2, 'alert', [], 2, 1200),
  ev('food.recovered', 'food', 0, 'info', [], 1),
  // Beliebtheit
  ...CAUSES.map((c) => ev(`pop.falling.${c}`, 'popularity', 1, 'warn', ['pop', 'time', 'threshold'], 1)),
  ...CAUSES.map((c) => ev(`pop.leaving.${c}`, 'popularity', 2, 'alert', ['pop', 'seconds'], 1, 1800)),
  ev('pop.recovered', 'popularity', 0, 'info', ['pop'], 1),
  // Militär
  ev('enemy.approach', 'military', 1, 'warn', ['name', 'n', 'dist'], 2, 900),
  ev('enemy.attack', 'military', 2, 'alert', ['name', 'n'], 2, 300),
  ev('enemy.attack.grow', 'military', 2, 'alert', ['name', 'n'], 1, 300),
  ev('siege.sighted', 'military', 2, 'alert', ['what'], 2, 900),
  ev('keep.hurt', 'military', 2, 'alert', ['pct'], 1, 600),
  ev('wall.breach', 'military', 2, 'alert', [], 1, 150),
  ev('gate.fallen', 'military', 2, 'alert', [], 1, 150),
  ev('tower.fallen', 'military', 2, 'alert', ['building'], 1, 150),
  ev('lord.hurt', 'military', 2, 'alert', [], 1, 300),
  ev('lord.danger', 'military', 2, 'alert', [], 1, 300),
  ev('aid.request', 'military', 1, 'warn', ['name'], 1, 100),
  ev('army.ready', 'military', 0, 'info', ['n'], 2),
  ev('army.limit', 'military', 0, 'info', ['n', 'limit'], 1),
  // Entwicklung
  ev('dev.grow', 'development', 0, 'info', ['n'], 3),
];

export const ADVISOR_EVENT_BY_ID: Record<string, AdvisorEventDef> = Object.fromEntries(ADVISOR_EVENTS.map((e) => [e.id, e]));

export const advisorKey = (id: string, variant = 1): string => `advisor.${id}.${variant}`;

const cause = (c: AdvisorPopCause, parts: Record<AdvisorPopCause, string>): string => parts[c];

const FALL_DE: Record<AdvisorPopCause, string> = {
  tax: 'Euer Volk murrt, mein Lord. Die Steuern sind zu hoch, die Beliebtheit sinkt.',
  ration: 'Das Volk murrt, mein Lord. Die Rationen sind zu knapp, die Beliebtheit sinkt.',
  crowd: 'Das Volk murrt, mein Lord. Es ist zu eng in der Burg, die Beliebtheit sinkt.',
  bad: 'Das Volk fürchtet sich, mein Lord. Galgen und Pranger drücken die Beliebtheit.',
  events: 'Das Volk ist unruhig, mein Lord. Die Beliebtheit sinkt.',
  other: 'Das Volk murrt, mein Lord. Die Beliebtheit sinkt.',
};
const LEAVE_DE: Record<AdvisorPopCause, string> = {
  tax: 'Bauern verlassen die Burg! Die Steuern sind der Hauptgrund. Die Beliebtheit liegt bei {pop}.',
  ration: 'Bauern verlassen die Burg! Die Rationen sind der Hauptgrund. Die Beliebtheit liegt bei {pop}.',
  crowd: 'Bauern verlassen die Burg! Die Enge ist der Hauptgrund. Die Beliebtheit liegt bei {pop}.',
  bad: 'Bauern verlassen die Burg! Die Furcht vor Galgen und Pranger ist der Hauptgrund. Die Beliebtheit liegt bei {pop}.',
  events: 'Bauern verlassen die Burg! Die Beliebtheit liegt bei {pop}.',
  other: 'Bauern verlassen die Burg! Die Beliebtheit liegt bei {pop}.',
};
const FALL_EN: Record<AdvisorPopCause, string> = {
  tax: 'Your people grumble, my lord. The taxes are too high and popularity is falling.',
  ration: 'The people grumble, my lord. Rations are too meagre and popularity is falling.',
  crowd: 'The people grumble, my lord. The castle is too cramped and popularity is falling.',
  bad: 'The people are afraid, my lord. Gallows and stocks are dragging popularity down.',
  events: 'The people are restless, my lord. Popularity is falling.',
  other: 'The people grumble, my lord. Popularity is falling.',
};
const LEAVE_EN: Record<AdvisorPopCause, string> = {
  tax: 'Peasants are leaving the castle! The taxes are the main reason. Popularity is at {pop}.',
  ration: 'Peasants are leaving the castle! The rations are the main reason. Popularity is at {pop}.',
  crowd: 'Peasants are leaving the castle! The crowding is the main reason. Popularity is at {pop}.',
  bad: 'Peasants are leaving the castle! Fear of gallows and stocks is the main reason. Popularity is at {pop}.',
  events: 'Peasants are leaving the castle! Popularity is at {pop}.',
  other: 'Peasants are leaving the castle! Popularity is at {pop}.',
};

export const ADVISOR_DE: Record<string, string> = {
  'advisor.res.low.plain.1': 'Mein Lord, {res} wird knapp. Nur noch {n} liegen im Lager.',
  'advisor.res.low.plain.2': 'Ein Blick ins Lager, Herr: Von {res} sind nur noch {n} übrig. Dem sollten wir abhelfen.',
  'advisor.res.low.noprod.1': '{res} geht zur Neige, nur noch {n} im Lager, und kein Gebäude liefert Nachschub. Wir brauchen eine Produktion.',
  'advisor.res.low.multi.1': 'Es wird knapp an {list}. Das Lager sieht schon dünn aus.',
  'advisor.res.empty.1': 'Kein {res} mehr, Herr! Bau und Handwerk müssen warten.',
  'advisor.res.empty.2': 'Das Lager ist leer: {res} ist aufgebraucht. Ohne Nachschub geht hier nichts mehr.',
  'advisor.res.empty.multi.1': 'Es fehlt an allem: {list} sind aufgebraucht!',
  'advisor.res.recovered.1': 'Gut so: {res} ist wieder reichlich da.',
  'advisor.res.recovered.2': 'Der Engpass bei {res} ist behoben. Die Lager füllen sich.',
  'advisor.res.recovered.multi.1': 'Der Engpass ist behoben: {list} sind wieder da.',
  'advisor.storage.full.1': '{store} ist voll. Baut ein weiteres Modul an, sonst geht Ware verloren.',
  'advisor.storage.full.2': 'Mein Lord, {store} platzt aus allen Nähten. Ein weiteres Modul wäre klug.',
  'advisor.storage.full.multi.1': 'Mehrere Lager sind voll: {list}. Baut weitere Module an.',
  'advisor.workers.short.1': 'Es fehlen Arbeitskräfte: {jobs} Stellen, aber nur {peasants} Bauern.',
  'advisor.workers.short.2': 'Die Werkstätten warten auf Hände, Herr. {jobs} Stellen sind offen, doch es gibt nur {peasants} Bauern.',
  'advisor.workers.short.housing.1': 'Es fehlen Arbeitskräfte: {jobs} Stellen, nur {peasants} Bauern. Der Wohnraum ist voll, baut Hütten.',
  'advisor.housing.full.1': 'Der Wohnraum ist voll, bei {housing} Plätzen. Neue Bauern finden kein Dach. Baut Hütten.',
  'advisor.chain.noinput.1': '{building} steht still: Es fehlt {res}.',
  'advisor.chain.noinput.2': 'Herr, in {building} ruht die Arbeit. Dort fehlt {res}.',
  'advisor.chain.noinput.multi.1': '{n} Betriebe stehen still, weil ihnen Rohstoffe fehlen: {list}.',
  'advisor.chain.noworkers.1': '{building} steht still. Dort arbeitet niemand.',
  'advisor.chain.noworkers.multi.1': '{n} Betriebe stehen still, weil niemand dort arbeitet: {list}.',
  'advisor.chain.blocked.1': '{building} wird seine Ware nicht los. Die Abholung stockt.',
  'advisor.chain.blocked.multi.1': 'Bei {n} Betrieben stockt die Abholung: {list}.',
  'advisor.chain.recovered.1': 'Die Werkstätten arbeiten wieder. Die Räder drehen sich.',

  'advisor.food.low.1': 'Der Kornspeicher leert sich. Die Nahrung reicht noch etwa {months} Monate.',
  'advisor.food.low.2': 'Mein Lord, die Vorräte schwinden. Für das Volk reicht es noch etwa {months} Monate.',
  'advisor.food.low.noprod.1': 'Der Kornspeicher leert sich, und niemand erzeugt Nachschub. Es reicht noch etwa {months} Monate.',
  'advisor.food.empty.1': 'Hunger, Herr! Die Bauern haben nichts mehr zu essen.',
  'advisor.food.empty.2': 'Der Kornspeicher ist leer! Das Volk hungert.',
  'advisor.food.recovered.1': 'Die Speicher füllen sich wieder. Das Volk darf aufatmen.',

  ...Object.fromEntries(CAUSES.map((c) => [`advisor.pop.falling.${c}.1`, cause(c, FALL_DE) + ' In etwa {time} fällt sie unter {threshold}.'])),
  ...Object.fromEntries(CAUSES.map((c) => [`advisor.pop.leaving.${c}.1`, cause(c, LEAVE_DE)])),
  'advisor.pop.recovered.1': 'Das Volk beruhigt sich. Die Beliebtheit steigt wieder, sie liegt bei {pop}.',

  'advisor.enemy.approach.1': 'Staub am Horizont, Herr: {n} Soldaten von {name} marschieren heran. Noch etwa {dist} Felder.',
  'advisor.enemy.approach.2': 'Späher melden Feinde: {n} Mann von {name}, noch {dist} Felder entfernt.',
  'advisor.enemy.attack.1': 'Angriff von {name}! {n} Soldaten stehen vor der Burg!',
  'advisor.enemy.attack.2': 'Zu den Waffen! {name} greift mit {n} Mann an!',
  'advisor.enemy.attack.grow.1': 'Der Feind bekommt Verstärkung! {name} hat jetzt {n} Soldaten hier.',
  'advisor.siege.sighted.1': 'Belagerungsgerät gesichtet: {what}! Haltet die Mauern bereit.',
  'advisor.siege.sighted.2': 'Der Feind bringt schweres Gerät: {what}! Das wird ungemütlich.',
  'advisor.keep.hurt.1': 'Der Bergfried nimmt Schaden! Nur noch {pct} Prozent sind heil.',
  'advisor.wall.breach.1': 'Die Mauer wurde durchbrochen!',
  'advisor.gate.fallen.1': 'Das Tor ist gefallen!',
  'advisor.tower.fallen.1': '{building} ist gefallen!',
  'advisor.lord.hurt.1': 'Der Lord ist schwer verwundet!',
  'advisor.lord.danger.1': 'Der Lord ist in Gefahr!',
  'advisor.aid.request.1': '{name} bittet um Hilfe!',
  'advisor.army.ready.1': 'Euer Heer zählt {n} Mann. Es ist bereit, mein Lord.',
  'advisor.army.ready.2': '{n} Mann stehen unter Waffen. Das lässt sich sehen.',
  'advisor.army.limit.1': 'Die Truppenstärke ist am Limit: {n} von {limit}. Mehr Mann dürfen wir nicht aufstellen.',
  'advisor.dev.grow.1': 'Die Burg wächst: {n} Bauern leben nun hier.',
  'advisor.dev.grow.2': 'Gute Nachrichten, Herr: Wir zählen jetzt {n} Bauern.',
  'advisor.dev.grow.3': '{n} Bauern bevölkern die Burg. Es geht voran.',
};

export const ADVISOR_EN: Record<string, string> = {
  'advisor.res.low.plain.1': 'My lord, {res} is running low. Only {n} left in the stores.',
  'advisor.res.low.plain.2': 'A glance at the stores, sire: only {n} {res} left. We should see to that.',
  'advisor.res.low.noprod.1': '{res} is running out, only {n} left, and no building supplies more. We need production.',
  'advisor.res.low.multi.1': 'We are running short of {list}. The stores look thin.',
  'advisor.res.empty.1': 'No more {res}, sire! Building and crafts must wait.',
  'advisor.res.empty.2': 'The stores are empty: {res} is used up. Nothing moves without supplies.',
  'advisor.res.empty.multi.1': 'We lack everything: {list} are used up!',
  'advisor.res.recovered.1': 'Good: there is plenty of {res} again.',
  'advisor.res.recovered.2': 'The shortage of {res} is over. The stores are filling.',
  'advisor.res.recovered.multi.1': 'The shortage is over: {list} are back.',
  'advisor.storage.full.1': '{store} is full. Build another module or goods will be lost.',
  'advisor.storage.full.2': 'My lord, {store} is bursting at the seams. Another module would be wise.',
  'advisor.storage.full.multi.1': 'Several stores are full: {list}. Build more modules.',
  'advisor.workers.short.1': 'We lack workers: {jobs} jobs, but only {peasants} peasants.',
  'advisor.workers.short.2': 'The workshops are waiting for hands, sire. {jobs} jobs are open, yet there are only {peasants} peasants.',
  'advisor.workers.short.housing.1': 'We lack workers: {jobs} jobs, only {peasants} peasants. Housing is full, build hovels.',
  'advisor.housing.full.1': 'Housing is full at {housing} places. New peasants find no roof. Build hovels.',
  'advisor.chain.noinput.1': '{building} stands idle: {res} is missing.',
  'advisor.chain.noinput.2': 'Sire, work has stopped in {building}. It lacks {res}.',
  'advisor.chain.noinput.multi.1': '{n} workshops stand idle for lack of materials: {list}.',
  'advisor.chain.noworkers.1': '{building} stands idle. Nobody works there.',
  'advisor.chain.noworkers.multi.1': '{n} workshops stand idle because nobody works there: {list}.',
  'advisor.chain.blocked.1': '{building} cannot get rid of its goods. The pickup is stuck.',
  'advisor.chain.blocked.multi.1': 'The pickup is stuck at {n} workshops: {list}.',
  'advisor.chain.recovered.1': 'The workshops are running again. The wheels turn.',
  'advisor.food.low.1': 'The granary is emptying. The food lasts about {months} more months.',
  'advisor.food.low.2': 'My lord, supplies are dwindling. There is food for about {months} more months.',
  'advisor.food.low.noprod.1': 'The granary is emptying and nobody produces more. It lasts about {months} more months.',
  'advisor.food.empty.1': 'Hunger, sire! The peasants have nothing left to eat.',
  'advisor.food.empty.2': 'The granary is empty! The people are starving.',
  'advisor.food.recovered.1': 'The granaries are filling again. The people can breathe easy.',
  ...Object.fromEntries(CAUSES.map((c) => [`advisor.pop.falling.${c}.1`, cause(c, FALL_EN) + ' In about {time} it drops below {threshold}.'])),
  ...Object.fromEntries(CAUSES.map((c) => [`advisor.pop.leaving.${c}.1`, cause(c, LEAVE_EN)])),
  'advisor.pop.recovered.1': 'The people are calming down. Popularity is rising again, now at {pop}.',
  'advisor.enemy.approach.1': 'Dust on the horizon, sire: {n} soldiers of {name} are marching closer. About {dist} tiles away.',
  'advisor.enemy.approach.2': 'Scouts report enemies: {n} men of {name}, {dist} tiles away.',
  'advisor.enemy.attack.1': 'Attack by {name}! {n} soldiers stand before the castle!',
  'advisor.enemy.attack.2': 'To arms! {name} attacks with {n} men!',
  'advisor.enemy.attack.grow.1': 'The enemy gets reinforcements! {name} now has {n} soldiers here.',
  'advisor.siege.sighted.1': 'Siege equipment sighted: {what}! Hold the walls ready.',
  'advisor.siege.sighted.2': 'The enemy brings heavy gear: {what}! This will get uncomfortable.',
  'advisor.keep.hurt.1': 'The keep is taking damage! Only {pct} percent is left intact.',
  'advisor.wall.breach.1': 'The wall has been breached!',
  'advisor.gate.fallen.1': 'The gate has fallen!',
  'advisor.tower.fallen.1': '{building} has fallen!',
  'advisor.lord.hurt.1': 'The lord is badly wounded!',
  'advisor.lord.danger.1': 'The lord is in danger!',
  'advisor.aid.request.1': '{name} asks for help!',
  'advisor.army.ready.1': 'Your army counts {n} men. It is ready, my lord.',
  'advisor.army.ready.2': '{n} men stand under arms. A sight to behold.',
  'advisor.army.limit.1': 'The army is at its limit: {n} of {limit}. We may not raise more men.',
  'advisor.dev.grow.1': 'The castle grows: {n} peasants live here now.',
  'advisor.dev.grow.2': 'Good news, sire: we now count {n} peasants.',
  'advisor.dev.grow.3': '{n} peasants fill the castle. Things are looking up.',
};

export const ADVISOR_TEXTS: Record<Lang, Record<string, string>> = { de: ADVISOR_DE, en: ADVISOR_EN };

/** Rohtext einer Zeile (mit Platzhaltern); Englisch fällt auf Deutsch zurück. */
export function advisorRaw(key: string, lang: Lang = getLang()): string {
  const own = ADVISOR_TEXTS[lang];
  if (Object.prototype.hasOwnProperty.call(own, key)) return own[key];
  return ADVISOR_DE[key] ?? key;
}

/** Fertiger Text mit eingesetzten Parametern */
export function advisorText(key: string, params: Params = {}, lang: Lang = getLang()): string {
  return fill(advisorRaw(key, lang), params, lang);
}

/** Alle Schlüssel (Varianten) eines Ereignisses */
export function advisorKeys(def: AdvisorEventDef): string[] {
  return Array.from({ length: def.variants }, (_, i) => advisorKey(def.id, i + 1));
}
