/**
 * Gemeinsame Hilfen der Abnahme-Skripte (Meilenstein 4H) unter scripts/qa/.
 *
 * Jedes Szenario-Skript startet über `startQA(name, opts)` einen kleinen statischen Server für `packages/client/dist`
 * (oder nutzt `--url=`), ein Chromium mit Software-GL (SwiftShader) und liefert Seite, Konsolenprotokoll und
 * Prüfhilfen. Ergebnisse (Prüfungen, Konsolenmeldungen, Messwerte) landen in `docs/phase4/qa/<name>.json`,
 * Bilder in `docs/phase4/qa/<name>/`.
 *
 * Voraussetzungen: `playwright-core` (PLAYWRIGHT_CORE=<Verzeichnis> oder NODE_PATH), Chromium (CHROMIUM=<Pfad> oder
 * /opt/pw-browsers) und ein gebauter Client (`pnpm build`).
 *
 * Gemeinsame Kommandozeile: --url=http://host:port (statt eigenem Server), --hw (echte GPU), --out=<Verzeichnis>.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium, loadPlaywright, serveDist } from '../lib/browser.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

/** bekannte, harmlose Meldungen der Software-GL bzw. des Screenshot-Pfads */
export const IGNORE = [/GPU stall/i, /swiftshader/i, /Automatic fallback to software WebGL/i, /ReadPixels/i, /GL Driver Message/i];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Statischen Server für den gebauten Client starten (freier Port im Bereich 5500–5599, sonst beliebig). */
export async function serveClient(dir = path.join(root, 'packages', 'client', 'dist')) {
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error('Client nicht gebaut: `pnpm build` ausführen');
  for (let p = 5500 + Math.floor(Math.random() * 80); p < 5600; p++) {
    try {
      const s = await Promise.race([serveDist(dir, p), sleep(1500).then(() => Promise.reject(new Error('timeout')))]);
      return s;
    } catch {
      /* Port belegt */
    }
  }
  return serveDist(dir, 0);
}

export async function launchBrowser({ hw = !!args.hw, extraArgs = [] } = {}) {
  const pw = await loadPlaywright(root);
  const chromium = pw.chromium ?? pw.default?.chromium;
  const launchArgs = hw
    ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--no-sandbox']
    : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
  // Autoplay: Playwright-Chromium startet Kontexte ohne Nutzergeste; für Audio-Prüfungen steht --autoplay-policy bereit
  return chromium.launch({ executablePath: findChromium(), args: [...launchArgs, ...extraArgs] });
}

/**
 * Szenario starten. Optionen:
 *  query     URL-Parameter (ohne `?`), Standard `quick=1&dev=1&size=128`; `null` = Hauptmenü ohne Parameter
 *  viewport  {width,height}, Standard 1280x720
 *  settings  Objekt, das vor dem Laden als `strongpoly.settings` gespeichert wird (z. B. {quality:'low'})
 *  waitGame  auf `window.session().world.view` warten (Standard: true, wenn query ein Spiel startet)
 *  autoplay  Chromium-Autoplay ohne Geste erlauben (Audio-Szenarien)
 */
export async function startQA(name, opts = {}) {
  const {
    query = 'quick=1&dev=1&size=128',
    viewport = { width: 1280, height: 720 },
    settings = { quality: 'low', shadows: false },
    waitGame = query != null && /quick=1/.test(query),
    autoplay = false,
    browser: sharedBrowser,
    base: baseOpt,
  } = opts;
  const outDir = path.resolve(String(args.out ?? path.join(root, 'docs', 'phase4', 'qa')));
  const picDir = path.join(outDir, name);
  fs.mkdirSync(picDir, { recursive: true });
  let srv = null;
  let base = baseOpt ?? args.url;
  if (!base) {
    const s = await serveClient();
    srv = s.srv;
    base = s.url;
  }
  const browser = sharedBrowser ?? (await launchBrowser({ extraArgs: autoplay ? ['--autoplay-policy=no-user-gesture-required'] : [] }));
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const result = { name, base, query, at: new Date().toISOString(), checks: [], console: [], notes: {}, data: {} };
  if (settings)
    await page.addInitScript((st) => {
      try {
        if (!localStorage.getItem('strongpoly.settings')) localStorage.setItem('strongpoly.settings', JSON.stringify(st));
      } catch {
        /* ignorieren */
      }
    }, settings);
  page.on('console', (m) => {
    const t = m.text();
    if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.some((r) => r.test(t))) {
      result.console.push(`[${m.type()}] ${t}`);
      console.log('[Konsole]', m.type(), t.slice(0, 300));
    }
  });
  page.on('pageerror', (e) => {
    result.console.push(`[Seitenfehler] ${e.message}`);
    console.log('[Seitenfehler]', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | '));
  });
  if (query !== undefined) await page.goto(`${base}/${query ? `?${query}` : ''}`);
  if (waitGame) await page.waitForFunction(() => window.session && window.session() && window.session().world.view, null, { timeout: 60000 });
  const q = {
    page,
    ctx,
    browser,
    base,
    result,
    picDir,
    S: (fn, arg) => page.evaluate(fn, arg),
    /** Prüfung protokollieren */
    ok(label, cond, extra = '') {
      result.checks.push({ label, ok: !!cond, extra: String(extra).slice(0, 400) });
      console.log(cond ? 'OK  ' : 'FAIL', label, extra === '' ? '' : String(extra).slice(0, 300));
      return !!cond;
    },
    note(key, value) {
      result.notes[key] = value;
    },
    async shot(file, o = {}) {
      const f = path.join(picDir, `${file}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: o.quality ?? 78, ...(o.clip ? { clip: o.clip } : {}) });
      return f;
    },
    async speed(x) {
      await page.evaluate((x) => window.session().conn.setSpeed?.(x), x);
    },
    tick: () => page.evaluate(() => window.session().world.tick),
    /** Auf Spieltick warten */
    waitTick: (n, timeout = 90000) => page.waitForFunction((n) => window.session().world.tick >= n, n, { timeout, polling: 250 }),
    /** Dev-Befehle (nur mit &dev=1) */
    dev: (op, a) => page.evaluate(([op, a]) => window.session().conn.dev(op, a), [op, a]),
    async finish() {
      result.passed = result.checks.filter((c) => c.ok).length;
      result.failed = result.checks.filter((c) => !c.ok).length;
      result.consoleClean = result.console.length === 0;
      fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(result, null, 2));
      console.log(`\n${name}: ${result.passed} OK, ${result.failed} FAIL, Konsolenmeldungen: ${result.console.length}`);
      await ctx.close();
      if (!sharedBrowser) await browser.close();
      srv?.close();
      return result.failed === 0 && result.console.length === 0 ? 0 : 1;
    },
  };
  return q;
}

/** Pausenmenü öffnen: Esc leert zuerst Auswahl/Modus/Fenster, erst dann öffnet sich das Menü (Schaltfläche „Fortsetzen“). */
export async function openPauseMenu(page) {
  for (let i = 0; i < 5; i++) {
    if (await page.getByText('Fortsetzen', { exact: true }).count()) return true;
    await page.keyboard.press('Escape');
    await sleep(450);
  }
  return (await page.getByText('Fortsetzen', { exact: true }).count()) > 0;
}

/** Pausenmenü schließen (Fortsetzen) */
export async function closePauseMenu(page) {
  if (await page.getByText('Fortsetzen', { exact: true }).count()) await page.getByText('Fortsetzen', { exact: true }).click();
  await sleep(400);
}
