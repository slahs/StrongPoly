#!/usr/bin/env node
/**
 * Schreibt packages/client/public/assets/manifest.json neu (Materialien + Texturen + Asset-Register), siehe
 * scripts/lib/asset_manifest.mjs und assets/PIPELINE.md.
 *
 *   node scripts/asset-manifest.mjs            # schreiben
 *   node scripts/asset-manifest.mjs --check    # nur pruefen: Exit 1, wenn die Datei veraltet ist oder Dateien fehlen
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, manifestPath, serialize } from './lib/asset_manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { manifest, problems } = buildManifest(root);
const out = manifestPath(root);
const text = serialize(manifest);
const check = process.argv.includes('--check');
for (const p of problems) console.error(`Problem: ${p}`);
const nMat = Object.values(manifest.materials).filter((m) => Object.keys(m.maps).length).length;
const summary = `${Object.keys(manifest.assets).length} Assets, ${Object.keys(manifest.materials).length} Materialien (${nMat} mit Texturen)`;
if (check) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== text) {
    console.error(`manifest.json ist veraltet (${summary}) - node scripts/asset-manifest.mjs ausfuehren`);
    process.exit(1);
  }
  if (problems.length) process.exit(1);
  console.error(`manifest.json aktuell: ${summary}`);
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.error(`${path.relative(root, out)}: ${summary}`);
  if (problems.length) process.exitCode = 1;
}
