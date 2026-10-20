#!/usr/bin/env node
/**
 * Szenario 10: Speichern, Laden und Darstellung kontrollieren. Siedlung mit Gebäuden/Bauern/Soldaten aufbauen, über das Menü
 * speichern, Spiel beenden, über „Spiel laden“ wieder starten. Prüft: Gebäude werden nicht neu aufgebaut (keine Bauanimation,
 * `entities.building` leer), gleiche Gebäude/Einheiten/Geländehöhen, Figuren und Berufe wie vorher (gleiche Typen/Positionen,
 * Berufe aus Arbeitsplatz), Musik und Atmosphäre laufen, Bewegung nach dem Laden ruhig (Kennzahlen).
 *   node scripts/qa/s10_saveload.mjs
 */
import { startQA, sleep, openPauseMenu } from './lib.mjs';

const q = await startQA('s10_saveload', { query: 'quick=1&dev=1&size=96&seed=3&motiondebug', viewport: { width: 640, height: 400 }, settings: { quality: 'low', shadows: false } });
const { page, S, ok } = q;
await page.mouse.click(320, 120);
await page.waitForFunction(() => window.__audio.state().ctx === 'running', null, { timeout: 15000 }).catch(() => {});
const k = await S(() => {
  const p = window.session().world.players[0];
  return { x: p.keepX, y: p.keepY };
});
const plan = [[6, -9, -3], [16, 5, -10], [17, 9, -4], [18, 8, 3], [22, -10, 5], [3, -4, 8], [7, 8, 9], [20, -4, -9], [14, -14, -2], [2, 12, 0]];
await S(({ kx, ky, plan }) => {
  const c = window.session().conn;
  c.dev('gold', { owner: 0, n: 5000 });
  for (let r = 0; r <= 20; r++) c.dev('res', { owner: 0, res: r, n: 200 });
  for (const [t, dx, dy] of plan) c.dev('build', { owner: 0, type: t, x: Math.round(kx + dx), y: Math.round(ky + dy), rot: 0 });
  c.dev('spawn', { type: 0, owner: 0, n: 25, x: kx - 4, y: ky + 4, stance: 2 });
  c.dev('spawn', { type: 8, owner: 0, n: 10, x: kx + 4, y: ky + 9, stance: 0 });
  c.setSpeed(4);
}, { kx: k.x, ky: k.y, plan });
// platzierte (nicht dev-gebaute) Gebäude über den Befehlsweg, damit `n` > 0 (Bauanimation) vorkommt
await S(({ kx, ky }) => {
  const s = window.session();
  s.send({ c: 'place', type: 17, x: Math.round(kx + 14), y: Math.round(ky + 8) });
  s.send({ c: 'place', type: 25, x: Math.round(kx - 14), y: Math.round(ky + 10) });
}, { kx: k.x, ky: k.y });
await q.waitTick((await q.tick()) + 500, 120000);
await S(() => window.session().conn.setSpeed(1));
await sleep(1500);

const state = () =>
  S(() => {
    const s = window.session();
    const w = s.world;
    const b = [...w.buildings.values()].map((x) => [x.t, x.x, x.y, x.o, x.n]).sort((a, c) => a[1] - c[1] || a[2] - c[2]);
    const types = {};
    let n = 0;
    for (let i = 0; i < w.top; i++) if (w.ids[i]) {
      types[w.type[i] + ':' + w.owner[i]] = (types[w.type[i] + ':' + w.owner[i]] ?? 0) + 1;
      n++;
    }
    let hsum = 0;
    const m = w.map;
    for (let i = 0; i < m.w * m.h; i++) hsum += m.height[i] * ((i % 97) + 1);
    // Berufe der Bauern (Darstellung): Verteilung der Beruf-IDs, falls der Renderer sie führt
    const jobs = {};
    const jobArr = s.entities.jobS;
    if (jobArr) for (let i = 0; i < w.top; i++) if (w.ids[i] && w.type[i] === 0) jobs[jobArr[i]] = (jobs[jobArr[i]] ?? 0) + 1;
    return {
      tick: w.tick,
      buildings: b,
      units: n,
      types,
      hsum,
      jobs,
      building: s.entities.building ? s.entities.building.size : null,
      buildingDetail: s.entities.building ? [...s.entities.building].map((id) => { const b = w.buildings.get(id); return b && { t: b.t, n: b.n, age: w.tick - b.n, prog: +s.entities.sites.progress(w, b, 1).toFixed(2) }; }) : null,
      music: window.__audio.state().music,
      mood: window.__audio.state().mood,
      amb: window.__audio.state().ambience,
      ctx: window.__audio.state().ctx,
    };
  });
await q.shot('1_vor_dem_speichern');
// Speichern über das Menü; das Menü pausiert die Sim, der Zustand davor ist damit eingefroren
await openPauseMenu(page);
const before = await state();
console.log('vorher', JSON.stringify({ ...before, buildings: before.buildings.length, amb: !!before.amb, music: !!before.music }));
await page.getByText('Spiel speichern', { exact: true }).click();
await sleep(2000);
const saved = await S(async () => {
  const req = indexedDB.open('strongpoly', 1);
  return await new Promise((res) => {
    req.onsuccess = () => {
      const t = req.result.transaction('saves').objectStore('saves').getAll();
      t.onsuccess = () => res(t.result.map((r) => ({ key: r.key, name: r.name })));
    };
  });
});
ok('Spielstand liegt in IndexedDB', saved.length >= 1, JSON.stringify(saved));
await openPauseMenu(page);
await page.getByText('Spiel beenden', { exact: true }).click();
await sleep(1000);
await page.getByText('Spiel laden', { exact: true }).click();
await sleep(600);
await page.getByText('Laden', { exact: true }).first().click();
await page.waitForFunction(() => window.session && window.session() && window.session().world.view && window.session().world.tick > 0, null, { timeout: 60000 });
// in den ersten Bildern prüfen, ob irgendein Gebäude „im Bau“ gezeigt wird
const seen = [];
let early = null;
for (let i = 0; i < 12; i++) {
  seen.push(await S(() => [...(window.session().entities.building ?? [])].map((id) => window.session().world.buildings.get(id)?.n ?? 0)));
  if (i === 1) early = await state();
  await sleep(250);
}
await S(() => {
  window.__motion.resetMeter();
});
await sleep(8000);
await q.shot('2_nach_dem_laden');
const after = await state();
console.log('nachher', JSON.stringify({ ...after, buildings: after.buildings.length, amb: !!after.amb }));
// im Bau gezeigt werden dürfen nur Gebäude, die NACH dem Speichern gesetzt wurden (die KI baut nach dem Laden weiter)
const rebuilt = seen.flat().filter((n) => n > 0 && n < before.tick - 1);
ok('Nach dem Laden wird kein vorhandenes Gebäude neu aufgebaut (nur nach dem Speichern gesetzte dürfen im Bau sein)', rebuilt.length === 0, JSON.stringify(seen));
const mineB = (st) => JSON.stringify(st.buildings.filter((b) => b[3] === 0));
ok('Gleiche Gebäude des Spielers (Typ, Ort, Platzierungs-Tick) wie beim Speichern', mineB(early) === mineB(before), `${before.buildings.filter((b) => b[3] === 0).length} vs ${early.buildings.filter((b) => b[3] === 0).length}`);
const mineU = (st) => Object.fromEntries(Object.entries(st.types).filter(([k]) => k.endsWith(':0')));
const du = Object.keys({ ...mineU(before), ...mineU(early) }).map((k) => Math.abs((mineU(before)[k] ?? 0) - (mineU(early)[k] ?? 0)));
ok('Gleiche Einheiten des Spielers (Typ, Anzahl ± 3 durch den Fortschritt seit dem Laden)', Math.max(...du) <= 3, `${JSON.stringify(mineU(before))} vs ${JSON.stringify(mineU(early))}`);
ok('Gleiches Gelände (Höhenprüfsumme)', after.hsum === before.hsum, `${before.hsum} vs ${after.hsum}`);
ok('Spielstand setzt bei etwa demselben Tick fort (höchstens 2 s später)', early.tick >= before.tick && early.tick - before.tick <= 60, `${before.tick} -> ${early.tick}`);
const jk = (st) => Object.keys(st.jobs).filter((k) => k !== '0').length;
ok('Berufe der Bauern werden nach dem Laden wieder erkannt (Berufsfiguren vorhanden wie vorher)', jk(early) >= Math.min(jk(before), 3) - 1, `${JSON.stringify(before.jobs)} vs ${JSON.stringify(early.jobs)}`);
await page.mouse.click(320, 150);
await sleep(1500);
const au = await S(() => window.__audio.state());
ok('Nach dem Laden läuft Musik (Spielthema) und Umgebung', au.ctx === 'running' && !!au.music && au.ambience !== null, JSON.stringify({ ctx: au.ctx, theme: au.theme, mood: au.mood, music: au.music && Object.keys(au.music).length, amb: !!au.ambience }));
const rep = await S(() => window.__motion.report());
q.result.data.motionAfterLoad = rep;
console.log(JSON.stringify(rep));
ok('Bewegung nach dem Laden ruhig: keine Sprünge, wenige Rückwärtsschritte, Stehende ruhen', rep.jumpPct < 1 && rep.backPct < 3 && rep.idleDriftMean < 0.01, `Sprung ${rep.jumpPct.toFixed(2)} %, rückw. ${rep.backPct.toFixed(2)} %, Drift ${rep.idleDriftMean.toFixed(4)}`);
process.exit(await q.finish());
