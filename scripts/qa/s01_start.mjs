#!/usr/bin/env node
/**
 * Szenario 1: Neues Gefecht gegen die KI starten – über das Hauptmenü (Gefecht gegen KI) und über ?quick=1.
 * Prüft: Spiel läuft, HUD sichtbar, Bergfried + Bauern da, KI baut, Konsole sauber; misst Start-Hänger (Long Tasks).
 *   node scripts/qa/s01_start.mjs
 */
import { startQA, sleep } from './lib.mjs';

let code = 0;

// A) über das Hauptmenü
{
  const q = await startQA('s01_menu', { query: '', waitGame: false, settings: { quality: 'medium', shadows: true } });
  const { page, ok, S } = q;
  await page.addInitScript(() => {
    window.__long = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] });
    } catch {
      /* ignorieren */
    }
  });
  await page.reload();
  await page.waitForTimeout(800);
  await q.shot('1_menu');
  ok('Hauptmenü zeigt „Gefecht gegen KI“', (await page.getByText('Gefecht gegen KI', { exact: true }).count()) === 1);
  await page.getByText('Gefecht gegen KI', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText('+ KI-Lord hinzufügen', { exact: true }).click();
  await q.shot('2_setup');
  await page.getByText('Spiel starten', { exact: true }).click();
  await page.waitForFunction(() => window.session && window.session() && window.session().world.view, null, { timeout: 60000 });
  await q.speed(4);
  await q.waitTick(300, 120000);
  await q.shot('3_game');
  const st = await S(() => {
    const s = window.session();
    const w = s.world;
    let units = 0;
    for (let i = 0; i < w.top; i++) if (w.ids[i]) units++;
    return {
      tick: w.tick,
      players: w.players.length,
      buildings: w.buildings.size,
      units,
      hud: !!document.querySelector('.topbar, #hud, .hud'),
      view: w.view && { gold: w.view.gold, peasants: w.view.peasants },
    };
  });
  console.log(JSON.stringify(st));
  ok('Partie läuft (Ticks laufen)', st.tick >= 300, st.tick);
  ok('Drei Spieler (Mensch + 2 KI) im Spiel', st.players === 3, st.players);
  ok('Bergfriede stehen, Bauern laufen', st.buildings >= 3 && st.units >= 10, JSON.stringify(st));
  ok('HUD vorhanden', st.hud);
  const long = await S(() => window.__long);
  q.note('longtasks_ms', long);
  // Unter Software-GL dauert schon ein einzelnes Bild > 1 s (Raster + Shader-Kompilierung): Long Tasks sind hier nur ein Hinweis,
  // der Start-Hänger der JS-Seite wird in s14_perf.mjs getrennt vom Zeichnen gemessen.
  // KI baut nach einer Weile
  await q.waitTick(900, 120000);
  const ai = await S(() => {
    const w = window.session().world;
    const c = [0, 0, 0];
    for (const b of w.buildings.values()) c[b.o]++;
    return c;
  });
  ok('KI-Lords haben nach 90 s Spielzeit weitergebaut', ai[1] > 1 && ai[2] > 1, JSON.stringify(ai));
  code |= await q.finish();
}

// B) ?quick=1
{
  const q = await startQA('s01_quick', { query: 'quick=1&size=128', settings: { quality: 'medium', shadows: true } });
  await q.speed(4);
  await sleep(1500);
  await q.waitTick(200, 120000);
  await q.shot('1_quick');
  const n = await q.S(() => window.session().world.buildings.size);
  q.ok('?quick=1 startet ein Gefecht mit Bergfrieden', n >= 2, n);
  code |= await q.finish();
}
process.exit(code);
