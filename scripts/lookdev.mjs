#!/usr/bin/env node
/**
 * Rendert die LookDev-Referenzsiedlung (`/?lookdev=<stil>`, packages/client/src/lookdev.ts) deterministisch für alle
 * Kameras × Stil (classic = alt, medieval = neu) × Grafikstufe:
 *   <out>/<stil>/<stufe>/<kamera>.jpg  +  <out>/<stil>/<stufe>/stats.json  +  <out>/stats.json (Übersicht)
 *
 *   node scripts/lookdev.mjs [--out=docs/phase5a/lookdev] [--styles=classic,medieval] [--qualities=low,medium,high]
 *                            [--cams=1-rts,2-mid,3a-building,3b-figures,3c-material,3d-keep,3e-gate,3f-wall,3g-corner,3h-landscape] [--viewport=1280x720] [--frames=30]
 *                            [--sun=game|<Stunde>] [--check] [--hw] [--port=5641] [--dist=<gebauter Client>] [--url=http://…]
 *                            [--tone=agx|aces] (nur medieval) [--timeout=<s je Bild, Standard 900>]
 *
 *  --check  Konsole prüfen: Warnungen/Fehler (außer bekannten Software-GL-Hinweisen) → Exit-Code 2
 *  --hw     echte GPU statt Software-GL (SwiftShader). OHNE --hw sind alle Zeiten Software-GL-Werte, KEINE GPU-Werte.
 *
 * Voraussetzungen wie scripts/shots.mjs: playwright-core (PLAYWRIGHT_CORE=<Verzeichnis> oder NODE_PATH), Chromium
 * (CHROMIUM=<Pfad> oder /opt/pw-browsers), gebauter Client (packages/client/dist; fehlt er, wird gebaut).
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
const list = (v, d) => (v && v !== true && v !== 'all' ? String(v).split(',') : d);
const styles = list(args.styles, ['classic', 'medieval']);
const qualities = list(args.qualities, ['low', 'medium', 'high']);
const CAMS = ['1-rts', '2-mid', '3a-building', '3b-figures', '3c-material', '3d-keep', '3e-gate', '3f-wall', '3g-corner', '3h-landscape'];
const cams = list(args.cams, CAMS);
const [vw, vh] = String(args.viewport ?? '1280x720').split('x').map(Number);
const out = path.resolve(String(args.out ?? path.join(root, 'docs', 'phase5a', 'lookdev')));
const frames = Number(args.frames ?? 30);
const sun = String(args.sun ?? 'game');
const hw = !!args.hw;
const check = !!args.check;
/** Wartezeit je Seite/Kamera in Sekunden (Software-GL auf belasteten Rechnern braucht für Hoch mehrere Minuten) */
const waitMs = Number(args.timeout ?? 900) * 1000;
const IGNORE = [/GPU stall/i, /swiftshader/i, /Automatic fallback to software WebGL/i, /ReadPixels/i, /GL Driver Message/i];

async function main() {
  const pw = await loadPlaywright(root);
  const chromium = pw.chromium ?? pw.default?.chromium;
  let base = args.url;
  let srv = null;
  if (!base) {
    const dist = args.dist ? path.resolve(String(args.dist)) : path.join(root, 'packages', 'client', 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('Client nicht gebaut, baue …');
      const r = spawnSync('pnpm', ['--filter', '@strongpoly/client', 'build'], { cwd: root, stdio: 'inherit' });
      if (r.status !== 0) throw new Error('Build fehlgeschlagen');
    }
    const s = await serveDist(dist, args.port ? Number(args.port) : 5641);
    srv = s.srv;
    base = s.url;
  }
  const launchArgs = hw
    ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--no-sandbox']
    : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
  const browser = await chromium.launch({ executablePath: findChromium(), args: launchArgs });
  const summary = { viewport: `${vw}x${vh}`, gl: hw ? 'Hardware' : 'Software-GL (SwiftShader) – Zeiten sind KEINE GPU-Werte', sun, runs: {} };
  const problems = [];
  try {
    for (const style of styles)
      for (const quality of qualities) {
        const dir = path.join(out, style, quality);
        fs.mkdirSync(dir, { recursive: true });
        const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
        const msgs = [];
        page.on('console', (m) => {
          const t = m.text();
          if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.some((r) => r.test(t))) msgs.push(`[${m.type()}] ${t}`);
        });
        page.on('pageerror', (e) => msgs.push(`[Seitenfehler] ${e.message}`));
        const t0 = Date.now();
        await page.goto(`${base}/?lookdev=${style}&quality=${quality}&cam=${cams[0]}&ui=0&stats=0&live=0&frames=${frames}&sun=${sun}${args.tone ? `&tone=${args.tone}` : ''}`);
        await page.waitForFunction(() => window.__lookdev && window.__lookdev.ready, null, { timeout: waitMs, polling: 300 });
        const loadS = (Date.now() - t0) / 1000;
        const per = {};
        for (const cam of cams) {
          if (cam !== cams[0]) {
            await page.evaluate((c) => window.__lookdev.setCam(c), cam);
            await page.waitForFunction(() => window.__lookdev.ready, null, { timeout: waitMs, polling: 300 });
          }
          const file = path.join(dir, `${cam}.jpg`);
          await page.screenshot({ path: file, type: 'jpeg', quality: Number(args.jpeg ?? 82) });
          const st = await page.evaluate(() => window.__lookdev.stats());
          per[cam] = st;
          console.error(`${style.padEnd(8)} ${quality.padEnd(6)} ${cam.padEnd(12)} Draw-Calls ${String(st.calls).padStart(4)}  Dreiecke ${String(Math.round(st.triangles / 1000)).padStart(4)}k  Programme ${st.programs}  Tex ≈${(st.texBytes / 1048576).toFixed(1)} MB  Geo ≈${(st.geoBytes / 1048576).toFixed(1)} MB  GLB: ${st.overrides.join(' ') || '—'}`);
        }
        const first = per[cams[0]];
        fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify({ style, quality, viewport: `${vw}x${vh}`, pageLoadS: loadS, gl: first.gl, note: first.note, cams: per }, null, 2) + '\n');
        summary.runs[`${style}/${quality}`] = Object.fromEntries(Object.entries(per).map(([c, s]) => [c, { calls: s.calls, triangles: s.triangles, programs: s.programs, texMB: +(s.texBytes / 1048576).toFixed(2), assetTexMB: +(s.assetTexBytes / 1048576).toFixed(2), geoMB: +(s.geoBytes / 1048576).toFixed(2), assetsMs: s.assetsMs, overrides: s.overrides }]));
        if (msgs.length) {
          problems.push(...msgs.map((m) => `${style}/${quality}: ${m}`));
          console.error(msgs.map((m) => '   ' + m).join('\n'));
        }
        await page.close();
      }
  } finally {
    await browser.close();
    srv?.close();
  }
  fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(summary, null, 2) + '\n');
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
