#!/usr/bin/env node
/**
 * Rendert alle Vergleichsszenen (`/?shots=<szene>`, siehe packages/client/src/showcase.ts) für eine Grafikstufe
 * in ein Ausgabeverzeichnis. Feste Kameras, fester Spielzustand, synthetische Zeit: dieselbe Version liefert
 * dieselben Bilder, und zwei Stände (vorher/nachher) lassen sich direkt vergleichen.
 *
 *   node scripts/shots.mjs --out=docs/phase4/after/world [--quality=medium] [--scenes=early,town,castle,siege,figures,map]
 *                          [--viewport=1280x720] [--format=png|jpg] [--check] [--info] [--hw] [--url=http://host:port]
 *                          [--frames=24] [--seed=N] [--port=54xx] [--dist=<gebauter Client>] [--style=classic|medieval]
 *
 *  --check   Konsole prüfen: jede Warnung/jeder Fehler (außer bekannte Software-GL-Hinweise) lässt das Skript mit Code 2 enden
 *            (deckt Shader-Kompilierungsfehler/-warnungen und WebGL-Fehler ab)
 *  --info    schreibt <out>/info.json mit Draw-Calls, Dreiecken und Programmanzahl je Szene
 *  --hw      echte GPU statt Software-GL (SwiftShader)
 *
 * Voraussetzungen: `playwright-core` (PLAYWRIGHT_CORE=<Verzeichnis> oder NODE_PATH), ein Chromium (CHROMIUM=<Pfad>
 * oder unter /opt/pw-browsers) und ein gebauter Client (packages/client/dist; fehlt er, wird er gebaut).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium, loadPlaywright, serveDist } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const ALL = ['early', 'town', 'castle', 'siege', 'figures', 'engines', 'map', 'ground', 'forest', 'water', 'coast', 'deposits'];
const scenes = args.scenes && args.scenes !== 'all' ? String(args.scenes).split(',') : ALL;
const quality = String(args.quality ?? 'medium');
const [vw, vh] = String(args.viewport ?? '1280x720').split('x').map(Number);
const out = path.resolve(String(args.out ?? path.join(root, 'shots-out')));
const format = args.format === 'jpg' || args.format === 'jpeg' ? 'jpeg' : 'png';
const ext = format === 'jpeg' ? 'jpg' : 'png';
const hw = !!args.hw;
const check = !!args.check;
const frames = args.frames ? Number(args.frames) : undefined;

/** bekannte, harmlose Meldungen der Software-GL bzw. des Screenshot-Pfads */
const IGNORE = [/GPU stall/i, /swiftshader/i, /Automatic fallback to software WebGL/i, /ReadPixels/i, /GL Driver Message/i];

async function main() {
  const pw = await loadPlaywright(root);
  const chromium = pw.chromium ?? pw.default?.chromium;
  const exe = findChromium();
  let base = args.url;
  let srv = null;
  if (!base) {
    const dist = args.dist ? path.resolve(String(args.dist)) : path.join(root, 'packages', 'client', 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('Client nicht gebaut, baue …');
      const r = spawnSync('pnpm', ['--filter', '@strongpoly/client', 'build'], { cwd: root, stdio: 'inherit' });
      if (r.status !== 0) throw new Error('Build fehlgeschlagen');
    }
    const s = await serveDist(dist, args.port ? Number(args.port) : 0);
    srv = s.srv;
    base = s.url;
  }
  fs.mkdirSync(out, { recursive: true });
  const launchArgs = hw
    ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--no-sandbox']
    : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
  const browser = await chromium.launch({ executablePath: exe, args: launchArgs });
  const info = {};
  const problems = [];
  for (const scene of scenes) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    const msgs = [];
    page.on('console', (m) => {
      const t = m.text();
      if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.some((r) => r.test(t))) msgs.push(`[${m.type()}] ${t}`);
    });
    page.on('pageerror', (e) => msgs.push(`[Seitenfehler] ${e.message}`));
    let q = `shots=${scene}&quality=${quality}`;
    if (frames) q += `&frames=${frames}`;
    if (args.seed) q += `&seed=${args.seed}`;
    if (args.style && args.style !== true) q += `&style=${args.style}`;
    const t0 = Date.now();
    await page.goto(`${base}/?${q}`);
    await page.waitForFunction(() => window.__shots && window.__shots.ready, null, { timeout: 600000, polling: 400 });
    const file = path.join(out, `${scene}.${ext}`);
    await page.screenshot({ path: file, type: format, ...(format === 'jpeg' ? { quality: 90 } : {}) });
    const i = await page.evaluate(() => ({ ...window.__shots.info(), desc: window.__shots.desc }));
    info[scene] = i;
    console.error(`${scene.padEnd(9)} ${((Date.now() - t0) / 1000).toFixed(1)} s  Draw-Calls ${i.calls}  Dreiecke ${Math.round(i.triangles / 1000)}k  Programme ${i.programs}  -> ${path.relative(root, file)}`);
    if (msgs.length) {
      problems.push(...msgs.map((m) => `${scene}: ${m}`));
      console.error(msgs.map((m) => '   ' + m).join('\n'));
    }
    await page.close();
  }
  await browser.close();
  srv?.close();
  if (args.info) fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ quality, viewport: `${vw}x${vh}`, scenes: info }, null, 2) + '\n');
  if (check) {
    if (problems.length) {
      console.error(`\nKonsole NICHT sauber (${problems.length} Meldungen)`);
      process.exit(2);
    }
    console.error('\nKonsole sauber (keine Warnungen/Fehler außer bekannten Software-GL-Hinweisen)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
