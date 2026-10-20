#!/usr/bin/env node
/**
 * Speicher-/Disposal-Lecks: dreimal ein Gefecht starten und beenden (Menü → „Spiel beenden“), nach jedem Durchlauf
 * `renderer.info.memory` (Geometrien, Texturen), Programme, Szenenobjekte, Event-Listener-Zähler und den JS-Heap messen.
 * Erwartung: Nach dem ersten Durchlauf (Caches, Texturen, Shader) wachsen Geometrien/Texturen/Programme/Szenenobjekte nicht mehr.
 *   node scripts/qa/s13_leaks.mjs [--rounds=3]
 */
import { startQA, sleep, args, launchBrowser, openPauseMenu } from './lib.mjs';

const rounds = Number(args.rounds ?? 3);
const browser = await launchBrowser({ extraArgs: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const q = await startQA('s13_leaks', { query: '', waitGame: false, browser, viewport: { width: 640, height: 400 }, settings: { quality: 'medium', shadows: true } });
const { page, S, ok } = q;
await page.addInitScript(() => {
  // Zähler für Listener am Fenster/Dokument (Zuwachs nach Spielende = nicht entfernte Listener)
  window.__ls = 0;
  window.__lsBy = {};
  for (const T of [window, document]) {
    const add = T.addEventListener.bind(T);
    const rem = T.removeEventListener.bind(T);
    const tn = T === window ? 'window' : 'document';
    T.addEventListener = (...a) => {
      window.__ls++;
      window.__lsBy[`${tn}.${a[0]}`] = (window.__lsBy[`${tn}.${a[0]}`] ?? 0) + 1;
      return add(...a);
    };
    T.removeEventListener = (...a) => {
      window.__ls--;
      window.__lsBy[`${tn}.${a[0]}`] = (window.__lsBy[`${tn}.${a[0]}`] ?? 0) - 1;
      return rem(...a);
    };
  }
});
await page.reload();
await sleep(800);
const rows = [];
const snap = (label) =>
  S(async (label) => {
    if (window.gc) window.gc();
    await new Promise((r) => setTimeout(r, 300));
    const gs = window.__gs;
    const info = gs?.renderer.info;
    return {
      label,
      geometries: info?.memory.geometries ?? null,
      textures: info?.memory.textures ?? null,
      programs: info?.programs?.length ?? null,
      sceneObjects: (() => {
        let n = 0;
        gs?.scene.traverse(() => n++);
        return n;
      })(),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      listeners: window.__ls,
      audioCtx: window.__audio?.state().ctx,
      voicesActive: window.__audio?.state().voices,
      domNodes: document.getElementsByTagName('*').length,
      lsBy: { ...window.__lsBy },
      domIds: [...document.querySelectorAll('body > *, #ui > *')].map((e) => `${e.tagName}#${e.id}.${String(e.className).slice(0, 30)}`),
    };
  }, label);
for (let i = 1; i <= rounds; i++) {
  await page.getByText('Gefecht gegen KI', { exact: true }).click();
  await sleep(300);
  await page.getByText('Spiel starten', { exact: true }).click();
  await page.waitForFunction(() => window.session && window.session() && window.session().world.view, null, { timeout: 60000 });
  await S(() => {
    window.__gs = window.session().gs;
    window.session().conn.setSpeed(4);
  });
  // etwas Betrieb: Einheiten und Gebäude, Schlachtgeräusche
  const k = await S(() => {
    const p = window.session().world.players[0];
    return { x: Math.round(p.keepX), y: Math.round(p.keepY) };
  });
  await q.dev('spawn', { type: 8, owner: 0, n: 20, x: k.x - 6, y: k.y + 6 });
  await q.dev('build', { owner: 0, type: 6, x: k.x + 8, y: k.y + 6 });
  await page.mouse.click(300, 150);
  await sleep(9000);
  const during = await snap(`Runde ${i} im Spiel`);
  await openPauseMenu(page);
  await page.getByText('Spiel beenden', { exact: true }).click();
  await sleep(1200);
  const after = await snap(`Runde ${i} nach Spielende`);
  rows.push(during, after);
  console.log(JSON.stringify({ ...during, lsBy: undefined, domIds: undefined }));
  console.log(JSON.stringify({ ...after, lsBy: undefined }));
  console.log('Listener-Bilanz', JSON.stringify(Object.fromEntries(Object.entries(after.lsBy).filter(([, v]) => v !== 0))));
  // zurück im Hauptmenü?
  ok(`Runde ${i}: Hauptmenü nach dem Beenden`, (await page.getByText('Gefecht gegen KI', { exact: true }).count()) === 1);
}
q.result.data.rows = rows;
const afters = rows.filter((r) => /nach Spielende/.test(r.label));
const first = afters[0];
const last = afters[afters.length - 1];
ok('Geometrien wachsen nach Runde 1 nicht mehr', last.geometries <= first.geometries, `${first.geometries} -> ${last.geometries}`);
ok('Texturen wachsen nach Runde 1 nicht mehr', last.textures <= first.textures, `${first.textures} -> ${last.textures}`);
ok('Shader-Programme wachsen nach Runde 1 nicht mehr', last.programs <= first.programs, `${first.programs} -> ${last.programs}`);
ok('Szenenobjekte wachsen nach Runde 1 nicht mehr', last.sceneObjects <= first.sceneObjects, `${first.sceneObjects} -> ${last.sceneObjects}`);
ok('Keine hängenden Listener an Fenster/Dokument (kein Zuwachs nach Runde 1)', last.listeners - first.listeners <= 0, `${first.listeners} -> ${last.listeners}`);
ok('JS-Heap wächst nach Runde 1 höchstens um 12 MB (Rauschen/Caches)', last.heapMB === null || last.heapMB - first.heapMB <= 12, `${first.heapMB} -> ${last.heapMB} MB`);
ok('DOM-Knoten wachsen nach Runde 1 nicht (Overlays/Panels werden entfernt; Toleranz 3)', last.domNodes <= first.domNodes + 3, `${first.domNodes} -> ${last.domNodes}`);
const code = await q.finish();
await browser.close();
process.exit(code);
