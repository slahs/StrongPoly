import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Materialbibliothek (Phase 5A): ergaenzt assets_pipeline.test.ts um die Inhalte der Bibliothek –
// Namensliste aus PIPELINE.md, Werte in assets/materials.json, vollstaendige Kartensaetze und Stufen,
// Alpha der Laubkarte, Speicherbudget.
const ROOT = join(__dirname, '../../..');
const TEX = join(ROOT, 'packages/client/public/assets/textures');
const MAPS = ['albedo', 'normal', 'orm'] as const;
const BUDGET_BYTES = 40 * 1024 * 1024;

interface LibEntry {
  base: string; rough: number; metal: number; tile: number; dirt: string; alphaTest?: number;
  info?: { srcPx: number; tileM: [number, number]; script: string; heightMm: number };
}
interface MapEntry { file: string; w: number; h: number; format: string; sizes?: Record<string, string> }

function pipelineNames(): string[] {
  const md = readFileSync(join(ROOT, 'assets/PIPELINE.md'), 'utf8');
  const line = md.split('\n').find((l) => l.includes('Gemeinsame Bibliothek (Namen fix)'));
  expect(line, 'Namensliste in PIPELINE.md').toBeTruthy();
  return [...(line as string).matchAll(/`(M_[A-Za-z_]+)`/g)].map((m) => m[1]);
}

/** WebP-Kopf: hat das Bild einen Alphakanal? (VP8X-Flag oder VP8L-Alphahinweis) */
function webpHasAlpha(path: string): boolean {
  const b = readFileSync(path);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return (b[20] & 0x10) !== 0;
  if (chunk === 'VP8L') return ((b[24] >> 4) & 1) === 1;
  return false;
}

describe('Materialbibliothek (assets/materials.json + public/assets/textures)', () => {
  const names = pipelineNames();
  const lib = (JSON.parse(readFileSync(join(ROOT, 'assets/materials.json'), 'utf8')) as { materials: Record<string, LibEntry> }).materials;
  const manifest = JSON.parse(readFileSync(join(ROOT, 'packages/client/public/assets/manifest.json'), 'utf8')) as {
    materials: Record<string, { maps: Partial<Record<(typeof MAPS)[number], MapEntry>> }>;
  };

  it('Bibliothek = Namensliste aus PIPELINE.md (19 Materialien)', () => {
    expect(names).toHaveLength(19);
    expect(Object.keys(lib).sort()).toEqual([...names].sort());
  });

  for (const name of names) {
    it(`${name}: Werte, Quelle, vollstaendiger Kartensatz mit Stufe 512`, () => {
      const d = lib[name];
      expect(d.base).toMatch(/^#[0-9a-f]{6}$/);
      expect(d.tile).toBeGreaterThan(0);
      expect(d.rough).toBeGreaterThan(0);
      expect(d.rough).toBeLessThanOrEqual(1);
      expect(d.info, 'info (Bibliotheksdaten)').toBeTruthy();
      const info = d.info as NonNullable<LibEntry['info']>;
      expect([1024, 2048]).toContain(info.srcPx);
      expect(existsSync(join(ROOT, info.script))).toBe(true);
      expect(info.heightMm).toBeGreaterThan(0);
      for (const k of MAPS) {
        const e = manifest.materials[name]?.maps?.[k];
        expect(e, `${name} ${k}`).toBeTruthy();
        const m = e as MapEntry;
        expect(m.format).toBe('webp');
        expect(m.w).toBe(info.srcPx);
        expect(m.h).toBe(info.srcPx);
        expect(m.sizes?.['512']).toBe(`textures/${name}/${k}_512.webp`);
        if (info.srcPx > 1024) expect(m.sizes?.['1024']).toBe(`textures/${name}/${k}_1024.webp`);
        expect(existsSync(join(TEX, name, `${k}_512.webp`))).toBe(true);
      }
    });
  }

  it('Laubkarte: Alpha-Test gesetzt und Albedo mit Alphakanal', () => {
    expect(lib.M_Foliage.alphaTest).toBeGreaterThan(0);
    expect(webpHasAlpha(join(TEX, 'M_Foliage/albedo.webp'))).toBe(true);
    expect(webpHasAlpha(join(TEX, 'M_Foliage/albedo_512.webp'))).toBe(true);
    expect(webpHasAlpha(join(TEX, 'M_Stone_Ashlar/albedo.webp'))).toBe(false);
  });

  it(`Laufzeittexturen der Bibliothek <= ${BUDGET_BYTES / 1024 / 1024} MB (alle Stufen)`, () => {
    let sum = 0;
    for (const name of names) {
      for (const f of readdirSync(join(TEX, name))) sum += statSync(join(TEX, name, f)).size;
    }
    expect(sum).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
