#!/usr/bin/env node
/**
 * Szenario 12: Alle drei Grafikstufen (Niedrig/Mittel/Hoch) mit Nah- und Fernansicht im laufenden Spiel; Wechsel zur Laufzeit
 * über das Optionsmenü (Auswahlfeld „Grafikstufe“) ohne Fehler; Draw-Calls/Dreiecke/Programme je Stufe und Ansicht.
 * Die Vergleichsszenen für alle Stufen mit `--check` laufen getrennt über `node scripts/shots.mjs --check` (siehe s12 am Ende,
 * ruft shots.mjs selbst auf, wenn --shots gesetzt ist).
 *   node scripts/qa/s12_quality.mjs [--shots]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startQA, sleep, args, root, openPauseMenu, closePauseMenu } from './lib.mjs';

const q = await startQA('s12_quality', { query: 'quick=1&dev=1&size=128&seed=1', viewport: { width: 1280, height: 720 }, settings: { quality: 'medium', shadows: true } });
const { page, S, ok } = q;
await q.speed(2);
const k = await S(() => {
  const p = window.session().world.players[0];
  return { x: Math.round(p.keepX), y: Math.round(p.keepY) };
});
await q.dev('gold', { owner: 0, n: 5000 });
for (let r = 0; r <= 9; r++) await q.dev('res', { owner: 0, res: r, n: 300 });
for (const [t, dx, dy] of [[6, -9, -3], [16, 5, -10], [17, 9, -4], [22, -10, 5], [3, -4, 8], [7, 8, 9], [2, 12, 0], [14, -14, -2]]) await q.dev('build', { owner: 0, type: t, x: k.x + dx, y: k.y + dy });
await q.dev('spawn', { type: 0, owner: 0, n: 20, x: k.x - 4, y: k.y + 4 });
await q.dev('spawn', { type: 8, owner: 0, n: 40, x: k.x + 4, y: k.y + 12, stance: 0 });
await q.dev('spawn', { type: 3, owner: 1, n: 30, x: k.x + 10, y: k.y + 12, stance: 0 });
await q.waitTick((await q.tick()) + 250, 120000);

const info = () =>
  S(() => {
    const s = window.session();
    const r = s.gs.renderer.info;
    return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, programs: r.programs?.length ?? 0, quality: s.opts.settings.quality };
  });
const setQuality = async (v) => {
  // über das Optionsmenü: Esc → Optionen → Grafikstufe
  await openPauseMenu(page);
  await page.getByText('Optionen', { exact: true }).first().click();
  await sleep(600);
  await page.evaluate((v) => {
    const labels = [...document.querySelectorAll('.form > span')];
    const sel = labels.find((e) => e.textContent === 'Grafikstufe')?.nextElementSibling;
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  await sleep(800);
  // zurück ins Hauptmenü der Pause und fortsetzen
  const back = page.getByText('← Zurück', { exact: false });
  if (await back.count()) await back.first().click();
  await sleep(300);
  await closePauseMenu(page);
};
const view = async (name, dist, x, y) => {
  await S(([x, y, d]) => {
    const s = window.session();
    s.gs.cam.lookAt(x, y);
    s.gs.cam.dist = d;
    s.gs.cam.distTarget = d;
  }, [x, y, dist]);
  await sleep(3500);
  await q.shot(name);
  return info();
};
const table = [];
// Reihenfolge bewusst Mittel → Hoch → Niedrig → Mittel: Wechsel in beide Richtungen zur Laufzeit
for (const lv of ['medium', 'high', 'low', 'medium']) {
  if ((await info()).quality !== lv) await setQuality(lv);
  const got = (await info()).quality;
  ok(`Grafikstufe ${lv} zur Laufzeit gesetzt`, got === lv, got);
  const far = await view(`${lv}_fern_${table.length}`, 60, k.x, k.y + 6);
  const near = await view(`${lv}_nah_${table.length}`, 12, k.x + 2, k.y + 8);
  table.push({ stufe: lv, fern: far, nah: near });
  console.log(lv, JSON.stringify({ fern: far, nah: near }));
}
q.result.data.table = table;
ok('Draw-Calls in allen Stufen/Ansichten unter 250', table.every((t) => t.fern.calls < 250 && t.nah.calls < 250), JSON.stringify(table.map((t) => [t.fern.calls, t.nah.calls])));
ok('Nach vier Wechseln keine zusätzlichen Geometrien/Texturen gegenüber der ersten Mittelstufe (Entsorgung beim Umschalten)', table[3].nah.geos <= table[0].nah.geos + 40 && table[3].nah.tex <= table[0].nah.tex + 4, `Geometrien ${table[0].nah.geos} -> ${table[3].nah.geos}, Texturen ${table[0].nah.tex} -> ${table[3].nah.tex}`);
ok('Niedrig zeichnet weniger Dreiecke als Hoch (Fernansicht)', table[2].fern.tris < table[1].fern.tris, `${table[2].fern.tris} vs ${table[1].fern.tris}`);
const code = await q.finish();
if (args.shots) {
  // Vergleichsszenen aller Stufen mit Konsolenprüfung (Shader-Warnungen/-Fehler lassen shots.mjs mit Code 2 enden)
  let bad = 0;
  for (const lv of ['low', 'medium', 'high']) {
    const tmp = path.join(os.tmpdir(), 'strongpoly-qa', `shots_${lv}`);
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'shots.mjs'), `--out=${tmp}`, `--quality=${lv}`, '--format=jpg', '--check', '--info'], { encoding: 'utf8' });
    // Bilder bleiben im Temp-Ordner (Repo-Größe); die Kennzahlen je Szene (Draw-Calls, Dreiecke, Programme) kommen ins Protokoll
    if (fs.existsSync(path.join(tmp, 'info.json'))) fs.copyFileSync(path.join(tmp, 'info.json'), path.join(root, 'docs', 'phase4', 'qa', `s12_shots_${lv}.json`));
    console.log(lv, 'shots.mjs --check Exit', r.status, (r.stdout + r.stderr).split('\n').slice(-3).join(' | '));
    if (r.status !== 0) bad++;
  }
  process.exit(code || bad);
}
process.exit(code);
