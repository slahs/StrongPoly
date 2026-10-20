#!/usr/bin/env node
/**
 * Ohne WebGL 2 (z. B. Safari mit abgeschalteter Hardwarebeschleunigung): verständliche Meldung statt leerer Seite.
 * Startet Chromium ohne 3D-APIs (`--disable-3d-apis`), öffnet das Spiel und prüft, dass die Erklärung sichtbar ist.
 *   node scripts/qa/s15_nowebgl.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { findChromium, loadPlaywright } from '../lib/browser.mjs';
import { root, serveClient, sleep } from './lib.mjs';

const s = await serveClient();
const pw = await loadPlaywright(root);
const browser = await (pw.chromium ?? pw.default.chromium).launch({ executablePath: findChromium(), args: ['--disable-3d-apis', '--disable-gpu', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 500 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(s.url + '/');
await sleep(2500);
const txt = await page.evaluate(() => document.body.innerText);
const outDir = path.join(root, 'docs', 'phase4', 'qa', 's15_nowebgl');
fs.mkdirSync(outDir, { recursive: true });
await page.screenshot({ path: path.join(outDir, 'meldung.jpg'), type: 'jpeg', quality: 78 });
const ok = /braucht WebGL 2/.test(txt);
console.log(ok ? 'OK   Erklärung bei fehlendem WebGL 2 sichtbar' : 'FAIL keine Erklärung', JSON.stringify(txt.slice(0, 200)), 'Seitenfehler:', errors.length);
fs.writeFileSync(path.join(root, 'docs', 'phase4', 'qa', 's15_nowebgl.json'), JSON.stringify({ ok, text: txt.slice(0, 300), pageErrors: errors.length }, null, 2));
await browser.close();
s.srv.close();
process.exit(ok ? 0 : 1);
