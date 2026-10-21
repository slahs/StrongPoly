/**
 * Erzeugt das Laufzeit-Manifest `packages/client/public/assets/manifest.json` aus
 *   - assets/materials.json            (Materialbibliothek: Namen, Rueckfallwerte, Kachelgroesse)
 *   - assets/registry/<id>.json        (je exportiertem Asset ein Eintrag, geschrieben von assets/blender/lib/sp/asset.py)
 *   - packages/client/public/assets/textures/<M_Name>/{albedo,normal,orm}[_<px>].{ktx2,webp,jpg,png}  (vorhandene Texturen)
 * Rein und deterministisch (keine Zeitstempel): derselbe Stand ergibt dieselbe Datei (Test `assets_manifest.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';

export const MAP_KINDS = ['albedo', 'normal', 'orm'];
/** Bevorzugte Reihenfolge der Formate (erstes vorhandenes gewinnt; KTX2 nur, wenn vorhanden) */
export const FORMATS = ['ktx2', 'webp', 'jpg', 'jpeg', 'png'];

/** Bildgroesse aus dem Dateikopf (PNG, JPEG, WebP, KTX2); null wenn unbekannt */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) return null;
      const m = buf[o + 1];
      const len = buf.readUInt16BE(o + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) };
      o += 2 + len;
    }
    return null;
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const k = buf.toString('ascii', 12, 16);
    if (k === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (k === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  if (buf.length > 28 && buf[0] === 0xab && buf.toString('ascii', 1, 7) === 'KTX 20') return { w: buf.readUInt32LE(20), h: buf.readUInt32LE(24) };
  return null;
}

function readJson(f) {
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/** Texturen eines Materials: { albedo: { file, bytes, w, h, format, sizes: { [px]: file } }, ... } */
export function scanTextures(texDir, name) {
  const dir = path.join(texDir, name);
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir).sort();
  const maps = {};
  for (const kind of MAP_KINDS) {
    const re = new RegExp(`^${kind}(?:_(\\d+))?\\.(${FORMATS.join('|')})$`);
    const cands = files.map((f) => ({ f, m: re.exec(f) })).filter((c) => c.m);
    if (!cands.length) continue;
    // Hauptdatei: ohne Groessensuffix im bevorzugten Format
    const rank = (c) => FORMATS.indexOf(c.m[2]);
    const main = cands.filter((c) => !c.m[1]).sort((a, b) => rank(a) - rank(b))[0] ?? cands.sort((a, b) => rank(a) - rank(b))[0];
    const buf = fs.readFileSync(path.join(dir, main.f));
    const sz = imageSize(buf) ?? { w: 0, h: 0 };
    const entry = { file: `textures/${name}/${main.f}`, bytes: buf.length, w: sz.w, h: sz.h, format: main.m[2] === 'jpeg' ? 'jpg' : main.m[2] };
    const sizes = {};
    for (const c of cands) if (c.m[1] && c.m[2] === main.m[2]) sizes[c.m[1]] = `textures/${name}/${c.f}`;
    if (Object.keys(sizes).length) entry.sizes = sizes;
    // weitere Formate derselben Karte (z. B. KTX2 neben WebP): Laufzeit waehlt je nach Unterstuetzung
    const alt = {};
    for (const c of cands) if (!c.m[1] && c.f !== main.f) alt[c.m[2] === 'jpeg' ? 'jpg' : c.m[2]] = `textures/${name}/${c.f}`;
    if (Object.keys(alt).length) entry.alt = alt;
    maps[kind] = entry;
  }
  return maps;
}

/**
 * Manifest aus den Quellen bauen. `root` = Repository-Wurzel. Rueckgabe { manifest, problems } (problems: fehlende Dateien,
 * unbekannte Materialien, LOD-Luecken - die Laufzeit faellt in solchen Faellen auf das prozedurale Modell zurueck).
 */
export function buildManifest(root) {
  const pub = path.join(root, 'packages', 'client', 'public', 'assets');
  const lib = readJson(path.join(root, 'assets', 'materials.json')).materials;
  const problems = [];
  const materials = {};
  for (const name of Object.keys(lib).sort()) {
    const d = lib[name];
    const m = { base: d.base, rough: d.rough, metal: d.metal, tile: d.tile, dirt: d.dirt };
    if (d.alphaTest) m.alphaTest = d.alphaTest;
    if (d.doubleSided) m.doubleSided = true;
    if (d.normalScale) m.normalScale = d.normalScale;
    m.maps = scanTextures(path.join(pub, 'textures'), name);
    materials[name] = m;
  }
  const regDir = path.join(root, 'assets', 'registry');
  const assets = {};
  if (fs.existsSync(regDir)) {
    for (const f of fs.readdirSync(regDir).filter((x) => x.endsWith('.json')).sort()) {
      const e = readJson(path.join(regDir, f));
      const file = path.join(pub, e.file);
      if (!fs.existsSync(file)) problems.push(`${e.id}: Datei fehlt (${e.file})`);
      for (const m of e.materials ?? []) if (!materials[m]) problems.push(`${e.id}: unbekanntes Material ${m}`);
      if (!e.lods || e.lods.length < 1) problems.push(`${e.id}: keine LOD-Stufen`);
      const { source, blend, license, ...rest } = e;
      assets[e.id] = { ...rest, bytes: fs.existsSync(file) ? fs.statSync(file).size : 0, source, blend, license };
    }
  }
  return { manifest: { version: 1, doc: 'Erzeugt von scripts/asset-manifest.mjs - nicht von Hand bearbeiten (Quellen: assets/materials.json, assets/registry/*.json, public/assets/textures).', materials, assets }, problems };
}

export function manifestPath(root) {
  return path.join(root, 'packages', 'client', 'public', 'assets', 'manifest.json');
}

export function serialize(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}
