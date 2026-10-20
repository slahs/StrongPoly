#!/usr/bin/env node
/**
 * CPU-Profil (Chrome DevTools Protocol) für die Kosten-Hotspots der JS-Seite.
 *   Szene `start`: Spielstart (?quick=1): erstmaliges Modellbauen, Materialien, Terrain, Shader-Kompilierung (Zeit in GL-Aufrufen getrennt)
 *   Szene `bench`: ?bench&units=2000&nodraw=1 (reine JS-Zeit pro Frame, Draw-Calls als No-ops)
 *   Szene `showcase_units` / `showcase_buildings`: Prüfszenen, die alle Figuren- bzw. Gebäudemodelle auf einmal bauen (Modellbau-Kosten)
 * Für lesbare Funktionsnamen einen nicht minimierten Build verwenden:
 *   pnpm --filter @strongpoly/client exec vite build --minify false --outDir /tmp/strongpoly-dist-nomin
 *   node scripts/qa/perf_profile.mjs --dist=/tmp/strongpoly-dist-nomin --scene=bench [--quality=medium] [--secs=10] [--top=30]
 * Ausgabe: Tabelle der Funktionen mit höchster Eigenzeit (ms, Anteil) und der Dateien; JSON unter docs/phase4/qa/perf_<scene>_<quality>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, serveClient, sleep, args, root } from './lib.mjs';

const scene = String(args.scene ?? 'bench');
const quality = String(args.quality ?? 'medium');
const secs = Number(args.secs ?? 10);
const top = Number(args.top ?? 30);
const units = Number(args.units ?? 2000);
const s = await serveClient(args.dist ? path.resolve(String(args.dist)) : undefined);
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript((q) => localStorage.setItem('strongpoly.settings', JSON.stringify({ quality: q, shadows: true })), quality);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const url =
  scene === 'start'
    ? `${s.url}/?quick=1&size=128&quality=${quality}`
    : scene.startsWith('showcase_')
      ? `${s.url}/?bench&showcase=${scene.slice(9)}&still=1&quality=${quality}&secs=${secs}&warm=1&nodraw=1`
      : `${s.url}/?bench&quality=${quality}&units=${units}&secs=${secs}&warm=3&dist=36&nodraw=1`;
await page.goto(url);
if (scene === 'start') await sleep(secs * 1000);
else await page.waitForFunction(() => window.__bench && window.__bench.done, null, { timeout: 300000, polling: 500 });
const bench = scene === 'bench' ? await page.evaluate(() => window.__bench.result()) : null;
const { profile } = await cdp.send('Profiler.stop');
await browser.close();
s.srv.close();

const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (dt[i] ?? 0));
const byFn = new Map();
const byFile = new Map();
let total = 0;
for (const [id, us] of self) {
  const n = nodes.get(id);
  const cf = n.callFrame;
  const file = (cf.url || '(nativ)').split('/').pop().replace(/-[A-Za-z0-9_]{8}\.js$/, '.js');
  const name = `${cf.functionName || '(anonym)'} ${file}:${cf.lineNumber + 1}`;
  if (cf.functionName === '(idle)' || cf.functionName === '(program)') continue;
  total += us;
  byFn.set(name, (byFn.get(name) ?? 0) + us);
  byFile.set(file, (byFile.get(file) ?? 0) + us);
}
const rows = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => ({ fn: k, ms: +(v / 1000).toFixed(1), pct: +((100 * v) / total).toFixed(1) }));
const files = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ file: k, ms: +(v / 1000).toFixed(1), pct: +((100 * v) / total).toFixed(1) }));
console.log(`Profil ${scene} (${quality}), Gesamt-Eigenzeit ohne Leerlauf: ${(total / 1000).toFixed(0)} ms`);
console.table(rows);
console.table(files);
if (bench) console.log('Bench', JSON.stringify({ cpuAvgMs: bench.cpuAvgMs, updateMs: bench.updateMs, renderMs: bench.renderMs, calls: bench.calls, triangles: bench.triangles, parts: bench.parts }));
fs.mkdirSync(path.join(root, 'docs', 'phase4', 'qa'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'phase4', 'qa', `perf_${scene}_${quality}.json`), JSON.stringify({ scene, quality, totalMs: +(total / 1000).toFixed(0), top: rows, files, bench }, null, 1));
