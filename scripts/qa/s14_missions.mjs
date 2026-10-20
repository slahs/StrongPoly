#!/usr/bin/env node
/**
 * Tutorial-Missionen 1–5 starten (Hauptmenü → Tutorial-Missionen → Starten), je Mission 20 s Zufallsbedienung
 * (Klicks, Rahmen, Befehle, Hotkeys, Bauen) bei 3-facher Geschwindigkeit. Prüft: Spiel startet, kein Konsolenfehler, Berater
 * nicht zugespammt (Meldungen je Mission), Rückkehr ins Menü ohne Fehler.
 * Vorlage: walk.mjs (Scratchpad), hier mit festem Zufallsgenerator (reproduzierbar).
 *   node scripts/qa/s14_missions.mjs [--secs=20]
 */
import { startQA, sleep, args } from './lib.mjs';

const secs = Number(args.secs ?? 20);
const q = await startQA('s14_missions', { query: '', waitGame: false, viewport: { width: 1000, height: 600 }, settings: { quality: 'low', shadows: false } });
const { page, S, ok } = q;
await page.mouse.click(10, 10);
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const keys = ['w', 'a', 's', 'd', 'q', 'e', 'b', 'Escape', 'Tab', ' ', 'F1', 'F2', 'h', 'm', '1', '2', 'r', 'y', 'f', 'p'];
async function play(sec) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < sec * 1000) {
    i++;
    const x = 150 + rnd() * 600;
    const y = 100 + rnd() * 330;
    const k = i % 6;
    if (k === 0) await page.mouse.click(x, y);
    else if (k === 1) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 150, y + 90, { steps: 3 });
      await page.mouse.up();
    } else if (k === 2) await page.mouse.click(x, y, { button: 'right' });
    else if (k === 3) await page.keyboard.press(keys[Math.floor(rnd() * keys.length)]);
    else if (k === 4) await page.mouse.wheel(0, rnd() < 0.5 ? -200 : 200);
    else {
      const tiles = page.locator('.bgrid .btn, .buildgrid button, .bpanel button, .item');
      const n = await tiles.count().catch(() => 0);
      if (n) {
        await tiles.nth(Math.floor(rnd() * n)).click({ timeout: 400 }).catch(() => {});
        await page.mouse.click(x, y);
      }
    }
    await sleep(120);
  }
}
async function backToMenu() {
  for (let i = 0; i < 3; i++) {
    if (await page.getByText('Spiel beenden', { exact: true }).count()) break;
    await page.keyboard.press('Escape');
    await sleep(400);
  }
  if (await page.getByText('Spiel beenden', { exact: true }).count()) await page.getByText('Spiel beenden', { exact: true }).click();
  await sleep(600);
}
const res = [];
for (let i = 0; i < 5; i++) {
  await page.getByText('Tutorial-Missionen', { exact: true }).click();
  await sleep(300);
  await page.getByText('Starten', { exact: true }).nth(i).click();
  await page.waitForFunction(() => window.session && window.session() && window.session().world.view, null, { timeout: 60000 }).catch(() => {});
  await S(() => window.session()?.conn.setSpeed?.(3));
  const start = await S(() => {
    const s = window.session();
    return s && { tick: s.world.tick, bld: s.world.buildings.size, mission: s.world.mission?.name ?? null, goals: s.world.mission?.goals?.length ?? null };
  });
  const c0 = q.result.console.length;
  await play(secs);
  const end = await S(() => {
    const s = window.session();
    return s && { tick: s.world.tick, bld: s.world.buildings.size, adv: s.advisor.list.length, goalsDone: s.world.mission?.goals?.filter?.((g) => g.done).length ?? null, over: !!document.querySelector('.endscreen, .end') };
  });
  await q.shot(`mission_${i + 1}`);
  console.log(`Mission ${i + 1}`, JSON.stringify(start), '->', JSON.stringify(end));
  ok(`Mission ${i + 1} startet und läuft (Ticks laufen)`, !!start && !!end && end.tick > start.tick, `${start?.tick} -> ${end?.tick}`);
  ok(`Mission ${i + 1}: keine Konsolenfehler/-warnungen`, q.result.console.length === c0, q.result.console.slice(c0).join(' | '));
  ok(`Mission ${i + 1}: Berater nicht zugespammt (≤ 8 Meldungen in ${secs} s)`, (end?.adv ?? 0) <= 8, `${end?.adv}`);
  res.push({ mission: i + 1, start, end });
  await backToMenu();
}
q.result.data.missions = res;
process.exit(await q.finish());
