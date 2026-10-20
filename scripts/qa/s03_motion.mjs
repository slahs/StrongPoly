#!/usr/bin/env node
/**
 * Szenario 3: Mehrere Bauern bei der Arbeit beobachten. Läuft zweimal mit derselben Siedlung: neues Bewegungsverhalten
 * und `&motionlegacy=1` (altes Verhalten). Auswertung über die Bewegungs-Kennzahlen `window.__motion.report()`
 * (Schrittverhältnis, Sprünge, Halt, Rückwärtsschritte, Richtungsumkehr, Stehende (Drift), Gehen ohne Weg, Gleiten).
 * Kleines Fenster und Stufe Niedrig, damit Software-GL halbwegs viele Bilder schafft (Kennzahlen hängen an Bildern).
 *   node scripts/qa/s03_motion.mjs [--secs=60]
 */
import fs from 'node:fs';
import path from 'node:path';
import { startQA, sleep, args, root } from './lib.mjs';

const secs = Number(args.secs ?? 60);
const results = {};
let code = 0;
for (const legacy of [false, true]) {
  const tag = legacy ? 'alt' : 'neu';
  const q = await startQA(`s03_motion_${tag}`, {
    query: `quick=1&dev=1&seed=3&size=96&motiondebug${legacy ? '&motionlegacy=1' : ''}`,
    viewport: { width: 480, height: 270 },
    settings: { quality: 'low', shadows: false },
  });
  const { page, S, ok } = q;
  await page.evaluate(() => {
    window.__fr = [];
    let last = performance.now();
    const f = (t) => {
      window.__fr.push(t - last);
      last = t;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  const info = await S(() => {
    const p = window.session().world.players[0];
    return { kx: p.keepX, ky: p.keepY };
  });
  const plan = [
    [6, -9, -3], [16, 5, -10], [17, 9, -4], [18, 8, 3], [22, -10, 5], [3, -4, 8], [7, 8, 9], [20, -4, -9], [23, -10, -9], [24, 3, 11], [14, -14, -2], [2, 12, 0], [13, -14, 9],
  ];
  await S(({ kx, ky, plan }) => {
    const c = window.session().conn;
    c.dev('gold', { owner: 0, n: 5000 });
    for (let r = 0; r <= 20; r++) c.dev('res', { owner: 0, res: r, n: 200 });
    for (const [t, dx, dy] of plan) c.dev('build', { owner: 0, type: t, x: Math.round(kx + dx), y: Math.round(ky + dy), rot: 0 });
    c.dev('spawn', { type: 0, owner: 0, n: 30, x: kx - 4, y: ky + 4, stance: 2 });
  }, { ...info, plan });
  await S(() => {
    const s = window.session();
    s.gs.cam.lookAt(s.world.players[0].keepX, s.world.players[0].keepY + 2);
    s.gs.cam.dist = 22;
    s.gs.cam.distTarget = 22;
  });
  await sleep(15000); // Einschwingen: Bauern verteilen sich auf die Arbeitsplätze
  await S(() => {
    window.__motion.resetMeter();
    window.__fr.length = 0;
  });
  const half = Math.floor(secs / 2) * 1000;
  await sleep(half);
  await q.shot('1_arbeit');
  await sleep(half);
  await q.shot('2_arbeit');
  const r = await S(() => ({ rep: window.__motion.report(), fr: window.__fr.slice(), tick: window.session().world.tick }));
  const fr = r.fr.slice().sort((a, b) => a - b);
  const fps = r.fr.length / (r.fr.reduce((a, b) => a + b, 0) / 1000);
  results[tag] = { ...r.rep, frames_total: r.fr.length, fps: +fps.toFixed(1), frameP50: Math.round(fr[Math.floor(fr.length / 2)] ?? 0), tick: r.tick };
  console.log(tag, JSON.stringify(results[tag]));
  const walkers = await S(() => {
    const w = window.session().world;
    let n = 0;
    let work = 0;
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s] || w.owner[s] !== 0 || w.type[s] !== 0) continue;
      n++;
      if (w.state[s] !== 0) work++;
    }
    return { peasants: n, nichtLeerlauf: work };
  });
  q.note('bauern', walkers);
  ok(`${tag}: Bauern vorhanden`, walkers.peasants >= 20, JSON.stringify(walkers));
  ok(`${tag}: genug gemessene Bewegungsbilder`, r.rep.moveFrames > 1000, r.rep.moveFrames);
  q.result.data.report = results[tag];
  code |= await q.finish();
}
const n = results.neu;
const a = results.alt;
const f2 = (v) => v.toFixed(2);
const table = [
  ['Kennzahl', 'neu', 'alt (motionlegacy)'],
  ['Bilder gesamt / FPS', `${n.frames_total} / ${n.fps}`, `${a.frames_total} / ${a.fps}`],
  ['Bewegungsbilder', n.moveFrames, a.moveFrames],
  ['Schritt p50/p95/max (gezeigt/Soll)', [n.ratioP50, n.ratioP95, n.ratioMax].map(f2).join('/'), [a.ratioP50, a.ratioP95, a.ratioMax].map(f2).join('/')],
  ['Sprünge %', f2(n.jumpPct), f2(a.jumpPct)],
  ['Halt %', f2(n.haltPct), f2(a.haltPct)],
  ['Rückwärts %', f2(n.backPct), f2(a.backPct)],
  ['Richtungsumkehr / min', n.reversalsPerMin.toFixed(1), a.reversalsPerMin.toFixed(1)],
  ['Dreh p95 °/s', n.turnP95.toFixed(0), a.turnP95.toFixed(0)],
  ['Stehende Drift mittel t/s', n.idleDriftMean.toFixed(3), a.idleDriftMean.toFixed(3)],
  ['Stehende Drift p95 t/s', n.idleDriftP95.toFixed(3), a.idleDriftP95.toFixed(3)],
  ['Gehen ohne Weg %', f2(n.marchInPlacePct), f2(a.marchInPlacePct)],
  ['Gleiten %', f2(n.slidePct), f2(a.slidePct)],
  ['Schritt-CV', f2(n.strideCV), f2(a.strideCV)],
];
const md = table.map((r) => `| ${r.join(' | ')} |`);
md.splice(1, 0, '| --- | --- | --- |');
fs.writeFileSync(path.join(root, 'docs', 'phase4', 'qa', 's03_motion.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
process.exit(code);
