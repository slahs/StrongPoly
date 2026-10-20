#!/usr/bin/env node
/**
 * Misst die Bildzeit der Benchmark-Szene (`/?bench`, siehe packages/client/src/bench.ts) für alle drei Grafikstufen
 * und gibt die Ergebnisse als Markdown-Tabelle aus.
 *
 *   node scripts/bench-fps.mjs [--units=2000] [--secs=15] [--warm=4] [--quality=low,medium,high]
 *                              [--viewport=1280x720] [--dist=36] [--pr=1] [--hw] [--no-js] [--json] [--out=datei.md]
 *                              [--url=http://host:port]
 *
 * Voraussetzungen:
 *  - `playwright-core` (normal installiert, per NODE_PATH oder PLAYWRIGHT_CORE=<Verzeichnis>)
 *  - ein Chromium: CHROMIUM=<Pfad> oder automatisch unter $PLAYWRIGHT_BROWSERS_PATH bzw. /opt/pw-browsers
 *  - gebauter Client (packages/client/dist); fehlt er, wird `pnpm --filter @strongpoly/client build` ausgeführt
 *
 * Zusätzlich läuft je Stufe ein zweiter Durchgang mit `&nodraw=1` (Draw-Calls als No-ops): Er misst die reine JS-Zeit pro
 * Frame unabhängig davon, wie schnell der Rasterizer ist (--no-js lässt ihn weg).
 *
 * Standardmäßig wird Software-GL (SwiftShader) erzwungen, damit der Lauf überall funktioniert. Mit --hw nutzt der
 * Browser die echte GPU. Software-GL-Zahlen sind nur ein pessimistischer Richtwert.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const units = Number(args.units ?? 2000);
const secs = Number(args.secs ?? 15);
const warm = Number(args.warm ?? 4);
const qualities = String(args.quality ?? 'low,medium,high').split(',');
const [vw, vh] = String(args.viewport ?? '1280x720').split('x').map(Number);
const dist = Number(args.dist ?? 36);
const pr = Number(args.pr ?? 1);
const hw = !!args.hw;
const withJs = !args['no-js'];

async function loadPlaywright() {
  const tries = [];
  const add = (p) => p && tries.push(p);
  add(process.env.PLAYWRIGHT_CORE);
  for (const p of (process.env.NODE_PATH ?? '').split(path.delimiter)) if (p) add(path.join(p, 'playwright-core'));
  add(path.join(root, 'node_modules', 'playwright-core'));
  try {
    const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
    if (g.status === 0) add(path.join(g.stdout.trim(), 'playwright-core'));
  } catch {
    /* ignorieren */
  }
  try {
    return await import('playwright-core');
  } catch {
    /* weiter mit Kandidaten */
  }
  for (const t of tries) {
    for (const f of ['index.mjs', 'index.js']) {
      const file = fs.existsSync(t) && fs.statSync(t).isFile() ? t : path.join(t, f);
      if (fs.existsSync(file)) {
        try {
          const mod = await import(pathToFileURL(file).href);
          return mod.chromium ? mod : mod.default;
        } catch {
          /* nächster Versuch */
        }
      }
    }
  }
  throw new Error('playwright-core nicht gefunden (PLAYWRIGHT_CORE=<Verzeichnis> oder NODE_PATH setzen)');
}

function findChromium() {
  const env = process.env.CHROMIUM || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const direct = path.join(base, 'chromium');
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
    for (const d of fs.readdirSync(base).sort().reverse()) {
      if (!/^chromium/.test(d)) continue;
      for (const sub of fs.existsSync(path.join(base, d)) ? fs.readdirSync(path.join(base, d)) : []) {
        for (const exe of ['chrome', 'headless_shell']) {
          const f = path.join(base, d, sub, exe);
          if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
        }
      }
    }
  }
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error('Kein Chromium gefunden (CHROMIUM=<Pfad> setzen)');
}

function serveDist(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        res.end('nicht gefunden');
        return;
      }
      res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');

async function main() {
  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  const exe = findChromium();
  let base = args.url;
  let srv = null;
  if (!base) {
    const dist = path.join(root, 'packages', 'client', 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('Client nicht gebaut, baue …');
      const r = spawnSync('pnpm', ['--filter', '@strongpoly/client', 'build'], { cwd: root, stdio: 'inherit' });
      if (r.status !== 0) throw new Error('Build fehlgeschlagen');
    }
    const s = await serveDist(dist);
    srv = s.srv;
    base = s.url;
  }
  const launchArgs = hw
    ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--no-sandbox']
    : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
  const browser = await chromium.launch({ executablePath: exe, args: launchArgs });
  const version = browser.version();
  const rows = [];
  for (const quality of qualities) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh } });
    page.on('pageerror', (e) => console.error('[Seitenfehler]', e.message));
    const q = `bench&quality=${quality}&units=${units}&secs=${secs}&warm=${warm}&dist=${dist}&pr=${pr}`;
    console.error(`Messe ${quality} (${units} Einheiten, ${warm}+${secs} s) …`);
    await page.goto(`${base}/?${q}`);
    await page.waitForFunction(() => window.__bench && window.__bench.done, null, { timeout: (warm + secs) * 1000 * 8 + 120000, polling: 500 });
    const r = await page.evaluate(() => window.__bench.result());
    await page.close();
    if (withJs) {
      const js = await browser.newPage({ viewport: { width: vw, height: vh } });
      console.error(`Messe ${quality} ohne Raster (JS-Zeit) …`);
      await js.goto(`${base}/?${q}&nodraw=1&secs=${Math.min(secs, 10)}`);
      await js.waitForFunction(() => window.__bench && window.__bench.done, null, { timeout: 120000, polling: 250 });
      const rj = await js.evaluate(() => window.__bench.result());
      r.jsOnlyAvg = rj.cpuAvgMs;
      r.jsOnlyP95 = rj.cpuP95Ms;
      r.jsOnlyUpdate = rj.updateMs;
      r.jsOnlyRender = rj.renderMs;
      await js.close();
    }
    rows.push(r);
  }
  await browser.close();
  srv?.close();

  const gl = rows[0]?.gl ?? 'unbekannt';
  const software = /swiftshader|llvmpipe|software|softpipe/i.test(gl);
  if (args.json) {
    console.log(JSON.stringify({ env: { browser: version, gl, viewport: `${vw}x${vh}`, cores: os.cpus().length, cpu: os.cpus()[0]?.model, software }, rows }, null, 2));
    return;
  }
  const out = [];
  out.push(`## Benchmark ?bench – ${units} kämpfende Einheiten`);
  out.push('');
  out.push(`- Browser: ${version}, Viewport ${vw}x${vh}, Pixel-Ratio ${pr}, Kamera-Abstand ${dist}`);
  out.push(`- GL: ${gl}${software ? ' (Software-Rendering)' : ''}`);
  out.push(`- CPU: ${os.cpus()[0]?.model ?? '?'} × ${os.cpus().length}`);
  out.push(`- Messfenster: ${secs} s nach ${warm} s Warmlauf; Bildzeit = Abstand zwischen requestAnimationFrame-Aufrufen, JS = Aktualisierung + renderer.render (ohne Wartezeit auf die GPU)`);
  out.push('');
  out.push('| Stufe | FPS | Ø ms | p95 ms | p99 ms | JS Ø ms (voll) | JS Ø ms (ohne Raster) | davon Update / Render | JS p95 ms (ohne Raster) | Draw-Calls | Dreiecke | Einheiten (gezeichnet) | Partikel | Frames |');
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    out.push(
      `| ${r.quality} | ${f1(r.fps)} | ${f1(r.avgMs)} | ${f1(r.p95Ms)} | ${f1(r.p99Ms)} | ${f1(r.cpuAvgMs)} | ${r.jsOnlyAvg === undefined ? '-' : f1(r.jsOnlyAvg)} | ${r.jsOnlyUpdate === undefined ? '-' : `${f1(r.jsOnlyUpdate)} / ${f1(r.jsOnlyRender)}`} | ${r.jsOnlyP95 === undefined ? '-' : f1(r.jsOnlyP95)} | ${r.calls} | ${Math.round(r.triangles / 1000)}k | ${r.units} (${r.unitsDrawn}) | ${r.particles} | ${r.frames} |`,
    );
  }
  out.push('');
  const med = rows.find((r) => r.quality === 'medium');
  if (med) {
    const js = med.jsOnlyAvg ?? med.cpuAvgMs;
    out.push(`- Ziel JS-Zeit ≤ 8 ms auf Mittel: ${js <= 8 ? 'erreicht' : 'verfehlt'} (${f1(js)} ms${med.jsOnlyAvg === undefined ? ', mit Raster-Wartezeit' : ', ohne Raster'})`);
    out.push(`- Ziel Draw-Calls < 150: ${rows.every((r) => r.calls < 150) ? 'erreicht' : 'verfehlt'} (max. ${Math.max(...rows.map((r) => r.calls))})`);
    out.push(`- Ziel 60 FPS auf Mittel: ${med.fps >= 60 ? 'erreicht' : 'nicht erreicht'} (${f1(med.fps)} FPS)`);
  }
  if (software) out.push('- Hinweis: Software-GL. Die FPS sind nur ein pessimistischer Richtwert; 60 FPS auf echter GPU sind damit weder bestätigt noch widerlegt (Lauf mit --hw auf einem Rechner mit GPU wiederholen).');
  console.log(out.join('\n'));
  if (args.out) fs.writeFileSync(String(args.out), out.join('\n') + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
