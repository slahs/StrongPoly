/**
 * Gemeinsame Browser-Hilfen für Skripte (shots.mjs): playwright-core finden, Chromium finden, dist/ ausliefern.
 * (bench-fps.mjs enthält dieselben Funktionen noch einmal; hier nur die Teile, die shots.mjs braucht.)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadPlaywright(root) {
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

export function findChromium() {
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

export function serveDist(dir, port = 0) {
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
    srv.listen(port, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
