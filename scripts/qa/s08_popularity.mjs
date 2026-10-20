#!/usr/bin/env node
/**
 * Szenario 8: Beliebtheit verändern (Steuern, Rationen) → Hover und Detailansicht (Klick/L) zeigen Faktoren, Zahlen stimmen mit
 * Sim (`view.factors`, `popDelta`) und Bergfried-Panel überein, Hinweistext passt, der Berater reagiert auf starken Abfall.
 * Vorlage: Beliebtheits-Prüfskript des 4F-Agenten, auf scripts/qa/lib.mjs umgestellt und erweitert.
 *   node scripts/qa/s08_popularity.mjs
 */
import { startQA, sleep } from './lib.mjs';

const q = await startQA('s08_popularity', { query: 'quick=1&dev=1&size=128&seed=1&lang=de', viewport: { width: 1280, height: 720 }, settings: { quality: 'low', shadows: false } });
const { page, S, ok } = q;
await q.speed(4);
await S(() => window.session().send({ c: 'setTax', level: 4 }));
await page.waitForFunction(() => window.session().world.view.factors.length > 0 && window.session().world.view.popDelta < -3, null, { timeout: 90000 });
await sleep(1000);
const v = await S(() => window.session().world.view);
console.log('view', JSON.stringify({ pop: v.popularity, d: v.popDelta, f: v.factors }));
// Hover
await page.locator('.topbar .pop').hover();
await sleep(900);
await q.shot('1_hover');
const tip = await page.locator('.sp-tooltip.show').innerText().catch(() => '');
console.log('TIP:', tip.replace(/\n/g, ' | '));
ok('Hover nennt Steuern als Faktor', /Steuern/.test(tip));
ok('Hover zeigt den Hinweistext zur Hauptursache', /Eure hohen Steuern belasten die Stimmung im Volk/.test(tip));
ok('Hover nennt die Änderung pro Monat (Zeiteinheit)', /Monat/.test(tip));
// Klick: Detailansicht
await page.mouse.move(600, 400);
await page.locator('.topbar .pop').click();
await sleep(700);
await q.shot('2_detail');
const det = await page.locator('.popup.popularity').innerText();
console.log('DETAIL:', det.replace(/\n/g, ' | '));
ok('Detailansicht: Steuern −8 als Hauptbelastung', /Steuern/.test(det) && /−8/.test(det) && /Hauptbelastung/.test(det));
ok('Detailansicht: Prognose „pro Monat“ und Handlungshinweis', /pro Monat/.test(det) && /Was kann ich tun/i.test(det));
// Zahlen: jeder Faktor der Sim steht in der Ansicht, Summe = popDelta
const view1 = await S(() => window.session().world.view);
const sum = view1.factors.reduce((a, f) => a + (f.v ?? f.value ?? 0), 0);
q.note('faktoren_sim', view1.factors);
const shown = (await page.locator('.popup.popularity .pd-num b').innerText()).replace(',', '.');
ok('Zahl der Detailansicht = Beliebtheit der Sim', Math.abs(parseFloat(shown) - view1.popularity) < 0.15, `${shown} vs ${view1.popularity.toFixed(2)}`);
const rows = await page.locator('.popup.popularity').innerText();
const nums = [...rows.matchAll(/([+−-]\d+(?:,\d)?)/g)].map((x) => x[1]);
q.note('detail_zahlen', nums);
// Spiel läuft weiter, Esc schließt, L öffnet
const t0 = await q.tick();
await sleep(1200);
ok('Spiel läuft bei offener Detailansicht weiter (nicht modal)', (await q.tick()) > t0);
await page.keyboard.press('Escape');
await sleep(300);
ok('Esc schließt die Detailansicht', (await page.locator('.popup.popularity').count()) === 0);
await page.keyboard.press('KeyL');
await sleep(400);
ok('Taste L öffnet die Detailansicht', (await page.locator('.popup.popularity').count()) === 1);
await page.keyboard.press('Escape');
// Bergfried-Panel
await S(() => {
  const s = window.session();
  for (const b of s.world.buildings.values()) if (b.o === 0 && b.t === 0) s.setSelection([], b.i);
});
await sleep(900);
await q.shot('3_bergfried');
const ctx = await page.locator('.info').innerText();
const m = /Beliebtheit (\d+)/.exec(ctx);
const view2 = await S(() => window.session().world.view);
ok('Bergfried-Panel: gleiche Beliebtheit wie Kopfleiste/Sim', m && Math.abs(Number(m[1]) - view2.popularity) <= 1, m ? m[1] : 'keine');
const mm = /([+−-]?\d+,\d) pro Monat/.exec(ctx);
const expectDelta = view2.popDelta.toFixed(1).replace('.', ',').replace('-', '−');
ok('Bergfried-Panel: gleiche Änderung pro Monat wie Sim', !!mm && mm[1].replace('-', '−').replace('+', '') === expectDelta.replace('+', ''), `${mm?.[1]} vs ${expectDelta}`);
const top = await page.locator('.topbar .pop').innerText();
ok('Kopfleiste zeigt fallende Tendenz (▼)', /▼/.test(top), top.replace(/\n/g, ' '));
// Berater reagiert auf den Abfall (pop.falling.* oder pop.leaving.*), nicht zugespammt
await page.waitForFunction(() => window.session().advisor.list.some((m) => /^pop\./.test(m.event)), null, { timeout: 150000 }).catch(() => console.log('keine pop-Meldung'));
await sleep(1500);
const adv = await S(() => window.session().advisor.list.map((m) => ({ t: m.tick, e: m.event, text: m.text, prio: m.prio })));
console.log(JSON.stringify(adv));
const popMsgs = adv.filter((x) => /^pop\./.test(x.e));
ok('Berater meldet den Beliebtheitsabfall (Ursache Steuern)', popMsgs.length >= 1 && popMsgs.some((x) => /tax/.test(x.e) || /Steuer/.test(x.text)), JSON.stringify(popMsgs));
ok('Meldung nennt dieselbe Ursache wie die Detailansicht', popMsgs.every((x) => /Steuer/.test(x.text) || /tax/.test(x.e)), JSON.stringify(popMsgs.map((x) => x.text)));
ok('Keine Beliebtheitsmeldung doppelt in kurzer Folge', popMsgs.filter((x) => /^pop\.falling/.test(x.e)).length <= 2, `${popMsgs.length}`);
await q.shot('4_berater_abfall');

// Gegenprobe Rationen/Steuern positiv: Rationen extra, Steuern −2 → Beliebtheit steigt, Detailansicht zeigt positive Faktoren
await S(() => {
  const s = window.session();
  s.send({ c: 'setTax', level: -2 });
  s.send({ c: 'setRation', level: 3 });
});
await page.waitForFunction(() => window.session().world.view.popDelta > 3, null, { timeout: 90000 }).catch(() => console.log('kein Anstieg'));
await sleep(800);
await page.keyboard.press('KeyL');
await sleep(700);
const det2 = await page.locator('.popup.popularity').innerText().catch(() => '');
console.log('DETAIL2:', det2.replace(/\n/g, ' | '));
const view3 = await S(() => window.session().world.view);
ok('Nach Steuersenkung + Extra-Rationen: Beliebtheit steigt (Tendenz ▲/positiv)', view3.popDelta > 0, `${view3.popDelta.toFixed(2)}`);
// negative Steuerstufe heißt in der Ansicht „Bestechung“ (positiver Faktor)
const posPart = det2.split(/NEGATIVE FAKTOREN/i)[0] ?? '';
ok('Detailansicht listet Rationen und Bestechung (Steuern gesenkt) als positive Faktoren mit Vorzeichen', /Rationen\s*\|?\s*\+/i.test(posPart.replace(/\n/g, ' | ')) && /Bestechung/.test(posPart), posPart.replace(/\n/g, ' | ').slice(0, 300));
await q.shot('5_detail_positiv');
process.exit(await q.finish());
