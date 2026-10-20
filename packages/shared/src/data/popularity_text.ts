/**
 * Textbausteine der Beliebtheits-Erklärung (`sim/popularity_explain.ts`), Deutsch vollständig, Englisch ergänzend
 * (fehlt ein englischer Schlüssel, gilt der deutsche). Die Wahl des Bausteins trifft die Erklärfunktion aus den
 * echten Sim-Werten; Zahlen stehen als Platzhalter `{name}` im Text und kommen aus denselben Daten.
 */
import { fill, getLang } from './descriptions';
import type { Lang, Params } from './descriptions';

export const POP_TEXT_DE: Record<string, string> = {
  // Hinweis (Hauptursache)
  'pop.head.pending': 'Der Hofstaat wertet die Stimmung im Volk gerade erst aus.',
  'pop.head.hunger': 'Die Bauern hungern: Es ist keine Nahrung mehr da. Das drückt die Stimmung schwer.',
  'pop.head.neg.tax.high': 'Eure hohen Steuern belasten die Stimmung im Volk.',
  'pop.head.neg.tax': 'Eure Steuern belasten die Stimmung im Volk.',
  'pop.head.neg.ration': 'Die knappen Rationen verderben dem Volk die Laune.',
  'pop.head.neg.bad': 'Galgen, Pranger und Verlies verbreiten Furcht und trüben die Stimmung.',
  'pop.head.neg.crowd': 'Es ist zu eng in der Burg: Die Überfüllung verdirbt die Stimmung.',
  'pop.head.neg.events': 'Ein Ereignis drückt die Stimmung: {label}.',
  'pop.head.neg.generic': 'Dieser Faktor drückt die Stimmung: {label}.',
  'pop.head.pos.generic': 'Dieser Faktor hebt die Stimmung: {label}.',
  'pop.head.pos.ration': 'Reichliche Rationen machen das Volk zufrieden.',
  'pop.head.pos.variety': 'Die vielen Nahrungssorten heben die Stimmung im Volk.',
  'pop.head.pos.tax': 'Eure Bestechungsgelder stimmen das Volk freundlich.',
  'pop.head.pos.ale': 'Das Bier in den Schenken hebt die Stimmung im Volk.',
  'pop.head.pos.religion': 'Der Glaube spendet dem Volk Trost und hebt die Stimmung.',
  'pop.head.pos.good': 'Schöne Dinge wie Gärten und Statuen erfreuen das Volk.',
  'pop.head.pos.events': 'Ein Ereignis hebt die Stimmung: {label}.',
  'pop.head.balanced': 'Gutes und Schlechtes halten sich die Waage. Die Stimmung bleibt, wie sie ist.',
  'pop.head.flat': 'Das Volk ist ruhig. Nichts hebt oder senkt die Stimmung nennenswert.',

  // Warnungen
  'pop.warn.hunger': 'Hunger: Es gibt keine Nahrung mehr im Kornspeicher.',
  'pop.warn.leaving': 'Bauern wandern ab: alle {seconds} Sekunden einer, solange die Beliebtheit unter {threshold} liegt.',
  'pop.warn.nearThreshold': 'In etwa {time} fällt die Beliebtheit unter {threshold}. Dann wandern Bauern ab.',
  'pop.warn.critical': 'Die Beliebtheit ist kritisch niedrig ({value}).',
  'pop.warn.bribeBlocked': 'Die Bestechung ist nicht bezahlbar: Es ist zu wenig Gold da, sie wirkt nicht.',
  'pop.warn.crowded': 'Überfüllung: {peasants} Bauern, aber nur Platz für {housing}.',
  'pop.warn.housingFull': 'Es ist kein Wohnraum mehr frei ({housing}). Es kommen keine neuen Bauern.',
  'pop.warn.floor': 'Die Beliebtheit ist am Boden und fällt weiter.',

  // Was kann ich tun?
  'pop.advice.tax': 'Steuern um eine Stufe senken: {gain} Beliebtheit pro Monat mehr, aber etwa {gold} Gold pro Monat weniger.',
  'pop.advice.bribe': 'Bestechung erhöhen: {gain} Beliebtheit pro Monat mehr, kostet etwa {gold} Gold pro Monat.',
  'pop.advice.ration': 'Rationen um eine Stufe erhöhen: {gain} Beliebtheit pro Monat mehr, kostet etwa {food} Nahrung pro Monat.',
  'pop.advice.food': 'Nahrung beschaffen (Äpfel, Käse, Fleisch, Brot): Sonst bleibt der Hunger-Abzug von {gain} Punkten.',
  'pop.advice.variety': 'Weitere Nahrungssorte lagern: {gain} Beliebtheit pro Monat je neuer Sorte (noch {types} möglich).',
  'pop.advice.ale': 'Schenke bauen und Bier brauen lassen: bis zu {gain} Beliebtheit pro Monat mehr (jetzt {cover} % der Bauern versorgt).',
  'pop.advice.religion': 'Kapelle, Kirche oder Kathedrale mit Personal bauen: bis zu {gain} Beliebtheit pro Monat mehr (jetzt {cover} % abgedeckt).',
  'pop.advice.good': 'Gärten, Statuen oder einen Maibaum bauen: je {gain} Beliebtheit pro Monat, höchstens {cap} insgesamt.',
  'pop.advice.bad': 'Galgen, Pranger oder Verlies abreißen: {gain} Beliebtheit pro Monat mehr (die Angst sinkt dabei auch).',
  'pop.advice.housing': 'Hütten bauen: Die Überfüllung kostet {gain} Beliebtheit pro Monat ({peasants} Bauern auf {housing} Plätzen).',

  // Beschriftungen
  'pop.ui.title': 'Beliebtheit',
  'pop.ui.now': 'Aktuell',
  'pop.ui.trend': 'Entwicklung',
  'pop.ui.positive': 'Positive Faktoren',
  'pop.ui.negative': 'Negative Faktoren',
  'pop.ui.warnings': 'Warnungen',
  'pop.ui.advice': 'Was kann ich tun?',
  'pop.ui.factor': 'Faktor',
  'pop.ui.effect': 'Einfluss',
  'pop.ui.sum': 'Summe',
  'pop.ui.none': 'Keine',
  'pop.ui.noAdvice': 'Nichts zu tun: Die Lage ist gut.',
  'pop.ui.hoverMore': 'Klick: Details',
  'pop.ui.perMonth': 'pro Monat',
  'pop.ui.cap': 'Obergrenze {cap} erreicht',
  'pop.ui.capOf': 'Obergrenze {cap}',
  'pop.ui.blocked': 'wirkt nicht',
  'pop.ui.mainNeg': 'Hauptbelastung',
  'pop.ui.mainPos': 'Hauptstütze',
  'pop.ui.openAdmin': 'Verwaltung öffnen',
  'pop.ui.timeNote': 'Ein Monat dauert {seconds} Sekunden bei Geschwindigkeit 1×. Die Faktoren werden alle {step} Sekunden neu bewertet; pro Bewertung ändert sich die Beliebtheit um {perStep}.',
  'pop.ui.thresholdNote': 'Unter {threshold} wandern Bauern ab, ab {threshold} kommen neue, solange Wohnraum frei ist.',
  'pop.ui.noTarget': 'Die Beliebtheit nähert sich keinem Zielwert, sondern steigt oder fällt stetig mit der Summe der Faktoren (0 bis 100).',
  'pop.ui.up': 'steigt um {v} pro Monat',
  'pop.ui.down': 'fällt um {v} pro Monat',
  'pop.ui.flat': 'bleibt gleich',
  'pop.ui.forecast1': 'in einem Monat etwa {v}',
  'pop.ui.forecast3': 'in drei Monaten etwa {v}',
  'pop.ui.toThreshold': 'unter {threshold} in etwa {time}',
  'pop.ui.toThresholdUp': 'ab {threshold} in etwa {time}',
  'pop.ui.leave': 'Abwanderung: ein Bauer alle {seconds} s',
  'pop.ui.grow': 'Zuzug: ein Bauer alle {seconds} s',
  'pop.ui.ceiling': 'Höchstwert erreicht',
  'pop.ui.floor': 'Tiefstwert erreicht',
  'pop.ui.level.great': 'Das Volk jubelt',
  'pop.ui.level.good': 'Das Volk ist zufrieden',
  'pop.ui.level.ok': 'Das Volk ist gelassen',
  'pop.ui.level.low': 'Das Volk murrt',
  'pop.ui.level.critical': 'Das Volk ist aufgebracht',
  'pop.ui.secs': '{s} s',
  'pop.ui.mins': '{m} min {s} s',

  // Faktornamen
  'pop.factor.ration': 'Rationen',
  'pop.factor.hunger': 'Hunger (keine Nahrung)',
  'pop.factor.variety': 'Nahrungsvielfalt',
  'pop.factor.tax': 'Steuern',
  'pop.factor.bribe': 'Bestechung',
  'pop.factor.ale': 'Bier',
  'pop.factor.religion': 'Religion',
  'pop.factor.good': 'Gute Dinge',
  'pop.factor.bad': 'Schlechte Dinge',
  'pop.factor.crowd': 'Überfüllung',
  'pop.factor.events': 'Ereignisse',
};

export const POP_TEXT_EN: Record<string, string> = {
  'pop.head.pending': 'The court is only just assessing the mood of the people.',
  'pop.head.hunger': 'The peasants are starving: there is no food left. This weighs heavily on their mood.',
  'pop.head.neg.tax.high': 'Your high taxes weigh on the mood of the people.',
  'pop.head.neg.tax': 'Your taxes weigh on the mood of the people.',
  'pop.head.neg.ration': 'The meagre rations spoil the mood of the people.',
  'pop.head.neg.bad': 'Gallows, stocks and dungeons spread fear and darken the mood.',
  'pop.head.neg.crowd': 'The castle is too cramped: overcrowding spoils the mood.',
  'pop.head.neg.events': 'An event weighs on the mood: {label}.',
  'pop.head.neg.generic': 'This factor weighs on the mood: {label}.',
  'pop.head.pos.generic': 'This factor lifts the mood: {label}.',
  'pop.head.pos.ration': 'Generous rations keep the people content.',
  'pop.head.pos.variety': 'The variety of food lifts the mood of the people.',
  'pop.head.pos.tax': 'Your bribes put the people in a friendly mood.',
  'pop.head.pos.ale': 'The ale in the inns lifts the mood of the people.',
  'pop.head.pos.religion': 'Faith comforts the people and lifts their mood.',
  'pop.head.pos.good': 'Pleasant things like gardens and statues delight the people.',
  'pop.head.pos.events': 'An event lifts the mood: {label}.',
  'pop.head.balanced': 'Good and bad balance each other out. The mood stays as it is.',
  'pop.head.flat': 'The people are calm. Nothing noticeably lifts or lowers their mood.',
  'pop.warn.hunger': 'Hunger: there is no food left in the granary.',
  'pop.warn.leaving': 'Peasants are leaving: one every {seconds} seconds while popularity is below {threshold}.',
  'pop.warn.nearThreshold': 'In about {time} popularity falls below {threshold}. Then peasants start to leave.',
  'pop.warn.critical': 'Popularity is critically low ({value}).',
  'pop.warn.bribeBlocked': 'The bribe cannot be paid: not enough gold, so it has no effect.',
  'pop.warn.crowded': 'Overcrowding: {peasants} peasants, but room for only {housing}.',
  'pop.warn.housingFull': 'No housing is free ({housing}). No new peasants arrive.',
  'pop.warn.floor': 'Popularity has hit rock bottom and keeps falling.',
  'pop.advice.tax': 'Lower taxes by one step: {gain} more popularity per month, but about {gold} less gold per month.',
  'pop.advice.bribe': 'Raise the bribe: {gain} more popularity per month, costs about {gold} gold per month.',
  'pop.advice.ration': 'Raise rations by one step: {gain} more popularity per month, costs about {food} food per month.',
  'pop.advice.food': 'Get food (apples, cheese, meat, bread): otherwise the hunger penalty of {gain} points stays.',
  'pop.advice.variety': 'Store another kind of food: {gain} popularity per month for each new kind ({types} more possible).',
  'pop.advice.ale': 'Build an inn and brew ale: up to {gain} more popularity per month ({cover} % of peasants served now).',
  'pop.advice.religion': 'Build a staffed chapel, church or cathedral: up to {gain} more popularity per month ({cover} % covered now).',
  'pop.advice.good': 'Build gardens, statues or a maypole: {gain} popularity per month each, {cap} at most in total.',
  'pop.advice.bad': 'Tear down gallows, stocks or dungeon: {gain} more popularity per month (fear drops as well).',
  'pop.advice.housing': 'Build hovels: overcrowding costs {gain} popularity per month ({peasants} peasants for {housing} places).',
  'pop.ui.title': 'Popularity',
  'pop.ui.now': 'Current',
  'pop.ui.trend': 'Trend',
  'pop.ui.positive': 'Positive factors',
  'pop.ui.negative': 'Negative factors',
  'pop.ui.warnings': 'Warnings',
  'pop.ui.advice': 'What can I do?',
  'pop.ui.factor': 'Factor',
  'pop.ui.effect': 'Effect',
  'pop.ui.sum': 'Total',
  'pop.ui.none': 'None',
  'pop.ui.noAdvice': 'Nothing to do: things are going well.',
  'pop.ui.hoverMore': 'Click: details',
  'pop.ui.perMonth': 'per month',
  'pop.ui.cap': 'cap {cap} reached',
  'pop.ui.capOf': 'cap {cap}',
  'pop.ui.blocked': 'no effect',
  'pop.ui.mainNeg': 'Main burden',
  'pop.ui.mainPos': 'Main support',
  'pop.ui.openAdmin': 'Open administration',
  'pop.ui.timeNote': 'A month lasts {seconds} seconds at speed 1x. The factors are re-evaluated every {step} seconds; popularity changes by {perStep} per evaluation.',
  'pop.ui.thresholdNote': 'Below {threshold} peasants leave, from {threshold} new ones arrive while housing is free.',
  'pop.ui.noTarget': 'Popularity does not approach a target value: it rises or falls steadily with the sum of the factors (0 to 100).',
  'pop.ui.up': 'rises by {v} per month',
  'pop.ui.down': 'falls by {v} per month',
  'pop.ui.flat': 'stays the same',
  'pop.ui.forecast1': 'in one month about {v}',
  'pop.ui.forecast3': 'in three months about {v}',
  'pop.ui.toThreshold': 'below {threshold} in about {time}',
  'pop.ui.toThresholdUp': 'reaches {threshold} in about {time}',
  'pop.ui.leave': 'Leaving: one peasant every {seconds} s',
  'pop.ui.grow': 'Arrivals: one peasant every {seconds} s',
  'pop.ui.ceiling': 'maximum reached',
  'pop.ui.floor': 'minimum reached',
  'pop.ui.level.great': 'The people cheer',
  'pop.ui.level.good': 'The people are content',
  'pop.ui.level.ok': 'The people are calm',
  'pop.ui.level.low': 'The people grumble',
  'pop.ui.level.critical': 'The people are furious',
  'pop.ui.secs': '{s} s',
  'pop.ui.mins': '{m} min {s} s',
  'pop.factor.ration': 'Rations',
  'pop.factor.hunger': 'Hunger (no food)',
  'pop.factor.variety': 'Food variety',
  'pop.factor.tax': 'Taxes',
  'pop.factor.bribe': 'Bribery',
  'pop.factor.ale': 'Ale',
  'pop.factor.religion': 'Religion',
  'pop.factor.good': 'Good things',
  'pop.factor.bad': 'Bad things',
  'pop.factor.crowd': 'Overcrowding',
  'pop.factor.events': 'Events',
};

export const POP_TEXTS: Record<Lang, Record<string, string>> = { de: POP_TEXT_DE, en: POP_TEXT_EN };

/** Text zu einem Schlüssel (Rückfall auf Deutsch, sonst der Schlüssel selbst), Platzhalter eingesetzt. */
export function popText(key: string, params: Params = {}, lang: Lang = getLang()): string {
  const own = POP_TEXTS[lang];
  const raw = Object.prototype.hasOwnProperty.call(own, key) ? own[key] : (POP_TEXT_DE[key] ?? key);
  return fill(raw, params, lang);
}

/** Zeitspanne für die Anzeige: `45 s` oder `2 min 5 s` */
export function popDuration(seconds: number, lang: Lang = getLang()): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return popText('pop.ui.secs', { s }, lang);
  return popText('pop.ui.mins', { m: Math.floor(s / 60), s: s % 60 }, lang);
}

/** Zahl mit einer Nachkommastelle (Dezimalkomma auf Deutsch), mit Vorzeichen bei `signed` */
export function popNum(x: number, signed = false, lang: Lang = getLang()): string {
  const r = Math.round(x * 10) / 10;
  const s = (Object.is(r, -0) ? 0 : r).toFixed(1).replace(/\.0$/, '');
  const out = lang === 'de' ? s.replace('.', ',') : s;
  return signed && r > 0 ? `+${out}` : out.replace('-', '−');
}

/** Alle Texte der Erklärung (Hinweis, Warnungen, Stellschrauben) für Anzeige und Berater in einer Sprache */
export function popularityTexts(ex: import('../sim/popularity_explain').PopExplain, lang: Lang = getLang()): { headline: string; warnings: { text: string; severity: 'critical' | 'warn' | 'info' }[]; advice: { text: string; action: 'admin' | 'build'; code: string }[] } {
  const num = (p: Record<string, number | string>): Params => {
    const o: Params = {};
    for (const [k, v] of Object.entries(p)) o[k] = typeof v === 'number' && ['gain', 'cap'].includes(k) ? popNum(v, false, lang) : v;
    return o;
  };
  return {
    headline: popText(ex.headline.key, ex.headline.params, lang),
    warnings: ex.warnings.map((w) => {
      const p: Params = { ...w.params, threshold: ex.threshold };
      if (typeof w.params.seconds === 'number' && w.code === 'nearThreshold') p.time = popDuration(w.params.seconds, lang);
      return { text: popText(`pop.warn.${w.code}`, p, lang), severity: w.severity };
    }),
    advice: ex.advice.map((a) => ({ text: popText(`pop.advice.${a.code}`, num(a.params), lang), action: a.action, code: a.code })),
  };
}
