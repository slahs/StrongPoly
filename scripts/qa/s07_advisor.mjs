#!/usr/bin/env node
/**
 * Szenario 7: Ressourcenmangel provozieren → der Hofberater meldet genau einmal passend (Text sichtbar, Stimme als Clip oder
 * Ersatz ausgelöst), keine Wiederholung, Verschlimmerung (leer) einmal zusätzlich, Klick auf die Meldung springt zum Ort,
 * „Wiederholen“ (Knopf und Alt+H), Sprachschalter. Danach Nahrung (Doppelte Rationen): Vorwarnung vor Hunger, Hunger kritisch einmal.
 * Vorlage: Berater-Prüfskript des Berater-Agenten (4E), hier auf scripts/qa/lib.mjs umgestellt und um die Stimmenprüfung erweitert.
 *   node scripts/qa/s07_advisor.mjs
 */
import { startQA, sleep } from './lib.mjs';

const q = await startQA('s07_advisor', { query: 'quick=1&dev=1&size=128&seed=1&lang=de', viewport: { width: 1280, height: 720 }, settings: { quality: 'low', shadows: false, subtitles: true } });
const { page, S, ok } = q;
// Geste für Autoplay → Sprachsystem aktiv
await page.mouse.click(640, 200);
await page.waitForFunction(() => window.__audio.state().ctx === 'running', null, { timeout: 15000 }).catch(() => {});
await S(() => window.__audio.engine.configure({ subtitles: true, advisor: 1, master: 1 }));
await q.speed(4);
const msgs = () => S(() => window.session().advisor.list.map((m) => ({ t: m.tick, e: m.event, text: m.text, key: m.key, prio: m.prio, x: m.x, y: m.y, b: m.building })));
const vlog = () => S(() => window.__audio.engine.voice.debug().log.filter((l) => l.voice === 'advisor'));
const wood = () => S(() => window.session().world.view.stock[0]);
await q.waitTick(650, 120000);
ok('Ruhephase: keine Beratermeldung', (await msgs()).length === 0, JSON.stringify(await msgs()));

// Holz verbrauchen (Holzpalisaden), bis unter 20
const spots = [];
for (let dy = -16; dy <= 16; dy += 2) for (let dx = -22; dx <= 22; dx += 2) spots.push([dx, dy]);
const palisade = (dx, dy) => S(([dx, dy]) => {
  const s = window.session();
  const k = s.world.players[0];
  s.send({ c: 'place', type: 37, x: Math.round(k.keepX) + dx, y: Math.round(k.keepY) + dy });
}, [dx, dy]);
for (const [dx, dy] of spots) {
  if ((await wood()) < 20) break;
  await palisade(dx, dy);
  await sleep(80);
}
await sleep(600);
console.log('Holz jetzt', await wood());
await page.waitForFunction(() => window.session().advisor.list.some((m) => /Holz/.test(m.text)), null, { timeout: 60000 }).catch(() => {});
await sleep(2500);
let m = await msgs();
const holz = m.filter((x) => /Holz/.test(x.text));
console.log(JSON.stringify(holz));
ok('Genau eine Holz-Meldung bei Knappheit', holz.length === 1, `n=${holz.length}`);
ok('Meldung hat Zeilenschlüssel und nennt den Bestand', holz[0]?.key?.startsWith('advisor.res.') && /\d/.test(holz[0]?.text ?? ''), `${holz[0]?.key} / ${holz[0]?.text}`);
const panelText = await page.locator('.adv-msg').allInnerTexts().catch(() => []);
ok('Text ist im Beraterpanel sichtbar', panelText.some((t) => /Holz/.test(t)), JSON.stringify(panelText));
await q.shot('1_holz_knapp');
const vl = await vlog();
console.log('Stimmenprotokoll Berater', JSON.stringify(vl));
ok('Stimme ausgelöst (Clip oder Ersatz) mit demselben Text', vl.length >= 1 && vl.some((l) => /Holz/.test(l.text)), JSON.stringify(vl.slice(-2)));
// Zeilen mit eingesetzten Zahlen („nur noch 18 im Lager“) kann kein vorab erzeugter Clip enthalten: Browser-Sprachausgabe (Ersatz).
// Zeilen ohne Zahlen (Hunger, Lager voll) sind Clips (siehe unten).
ok('Beraterzeile mit Zahl läuft über den Ersatz (Browser-Stimme) oder als Clip – nie stumm', vl.every((l) => l.mode === 'clip' || l.mode === 'tts' || l.mode === 'text'), JSON.stringify(vl.map((l) => l.mode)));
q.note('beraterstimme_holz', vl.filter((l) => /Holz/.test(l.text)).map((l) => l.mode));
const sub = await S(() => document.querySelector('#voice-subtitles')?.textContent ?? '');
q.note('untertitel_beim_berater', sub);
// keine Wiederholung
await sleep(12000);
m = await msgs();
ok('Keine Wiederholung nach 12 s real (48 s Spielzeit)', m.filter((x) => /Holz/.test(x.text)).length === 1, `n=${m.filter((x) => /Holz/.test(x.text)).length}`);
const vlen0 = (await vlog()).length;
// Verschlimmerung: leer
for (const [dx, dy] of spots.slice().reverse()) {
  if ((await wood()) <= 0) break;
  await palisade(dx, dy);
  await sleep(120);
}
await page.waitForFunction(() => window.session().advisor.list.some((m) => m.event === 'res.empty'), null, { timeout: 60000 }).catch(() => console.log('kein res.empty'));
await sleep(2500);
m = await msgs();
const empty = m.filter((x) => x.e === 'res.empty');
ok('Bei Leerstand genau eine zusätzliche, verschärfte Meldung (kritisch/alarmiert)', empty.length === 1 && /Holz/.test(empty[0].text), JSON.stringify(empty));
ok('Es sind genau zwei Holz-Meldungen (knapp, leer)', m.filter((x) => /Holz/.test(x.text)).length === 2);
ok('Zweite Meldung wurde ebenfalls gesprochen', (await vlog()).length > vlen0, `${vlen0} -> ${(await vlog()).length}`);
await q.shot('2_holz_leer');

// Klick springt zum Ort
await S(() => window.session().gs.cam.lookAt(10, 10));
await sleep(500);
const cam1 = await S(() => ({ x: window.session().gs.cam.tx, z: window.session().gs.cam.tz }));
await page.locator('.adv-msg.go').first().click();
await sleep(800);
const cam2 = await S(() => ({ x: window.session().gs.cam.tx, z: window.session().gs.cam.tz }));
ok('Klick auf die Meldung bewegt die Kamera zum Ort', Math.abs(cam2.x - cam1.x) + Math.abs(cam2.z - cam1.z) > 5, JSON.stringify([cam1, cam2]));

// Wiederholen (Knopf und Alt+H)
const r0 = (await vlog()).length;
await page.locator('.adv-btn').nth(1).click();
await sleep(1500);
const r1 = (await vlog()).length;
ok('Wiederholen-Knopf spricht den letzten Hinweis erneut', r1 > r0, `${r0} -> ${r1}`);
await sleep(3500);
await page.keyboard.press('Alt+KeyH');
await sleep(1500);
const r2 = (await vlog()).length;
ok('Alt+H spricht den letzten Hinweis erneut', r2 > r1, `${r1} -> ${r2}`);
// Alt+H löst weder Halten noch Kameraschwenk aus
// Sprachschalter
const before = await S(() => window.session().opts.settings.advisorSpeech);
await page.locator('.adv-btn').nth(0).click();
await sleep(300);
const after = await S(() => window.session().opts.settings.advisorSpeech);
ok('Sprachschalter kippt die Einstellung und speichert sie', before === true && after === false && (await S(() => JSON.parse(localStorage.getItem('strongpoly.settings')).advisorSpeech)) === false, `${before} -> ${after}`);
await page.locator('.adv-btn').nth(0).click();
await sleep(200);

// Nahrung: Doppelte Rationen
await q.dev('res', { owner: 0, res: 0, n: 400 });
await S(() => {
  const s = window.session();
  s.send({ c: 'setRation', level: 4 });
  s.conn.setSpeed(4);
});
await page.waitForFunction(() => window.session().world.view.foodShort, null, { timeout: 180000 }).catch(() => console.log('kein Hunger erreicht'));
await page.waitForFunction(() => window.session().advisor.list.some((m) => m.event === 'food.empty'), null, { timeout: 60000 }).catch(() => console.log('keine food.empty-Meldung'));
await sleep(2000);
m = await msgs();
const ev = m.map((x) => x.e);
const iLow = ev.findIndex((e) => /^food\.low/.test(e));
const iEmpty = ev.indexOf('food.empty');
console.log(JSON.stringify(m.map((x) => [x.t, x.e, x.prio, x.text])));
ok('Nahrung: Vorwarnung kommt vor dem Hunger', iLow >= 0 && iLow < iEmpty, JSON.stringify(ev));
ok('Hunger genau einmal und kritisch', ev.filter((e) => e === 'food.empty').length === 1 && m[iEmpty].prio === 2);
const vl2 = await vlog();
ok('Hunger-Meldung wurde gesprochen', vl2.some((l) => /Hunger|Nahrung|Brot|Vorrat|Speicher/i.test(l.text)), JSON.stringify(vl2.slice(-2)));
ok('Zahlenfreie Beraterzeilen (Hunger, Lager voll) wurden als vorab erzeugter Clip gesprochen', vl2.filter((l) => /^advisor\.(food\.empty|storage\.full)/.test(l.key)).every((l) => l.mode === 'clip') && vl2.some((l) => /^advisor\.food\.empty/.test(l.key)), JSON.stringify(vl2.map((l) => [l.key, l.mode])));
await q.shot('3_hunger');
// Ereignis-Spam-Prüfung: Gesamtzahl der Meldungen in der gesamten Partie klein
ok('Berater nicht zugespammt (insgesamt < 15 Meldungen in dieser Partie)', m.length < 15, `${m.length}`);
process.exit(await q.finish());
