#!/usr/bin/env node
/**
 * Führt Abnahme-Szenarien nacheinander aus (je ein Kindprozess, Protokoll in <log-Verzeichnis>/<name>.log).
 *   node scripts/qa/run.mjs s02_economy s03_motion [--logs=/pfad]     (ohne Namen: alle s*.mjs außer Mehrspieler)
 * Exit-Code 0 nur, wenn alle Szenarien ohne FAIL und ohne Konsolenmeldung endeten.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const logs = argv.find((a) => a.startsWith('--logs='))?.slice(7) ?? path.join(os.tmpdir(), 'strongpoly-qa');
fs.mkdirSync(logs, { recursive: true });
const names = argv.filter((a) => !a.startsWith('--'));
const all = names.length ? names : fs.readdirSync(here).filter((f) => /^s\d+_.*\.mjs$/.test(f)).map((f) => f.replace(/\.mjs$/, '')).sort();
let bad = 0;
for (const n of all) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, `${n}.mjs`), ...argv.filter((a) => a.startsWith('--') && !a.startsWith('--logs='))], { encoding: 'utf8', maxBuffer: 1 << 28 });
  fs.writeFileSync(path.join(logs, `${n}.log`), (r.stdout ?? '') + (r.stderr ?? ''));
  const tail = (r.stdout ?? '').trim().split('\n').slice(-1)[0];
  console.log(`${r.status === 0 ? 'OK  ' : 'FAIL'} ${n} (${((Date.now() - t) / 1000).toFixed(0)} s) ${tail}`);
  if (r.status !== 0) bad++;
}
process.exit(bad ? 1 : 0);
