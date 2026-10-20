import { ADVISOR_DE, ADVISOR_EN, ADVISOR_EVENT_BY_ID, ADVISOR_EVENTS, advisorKeys, advisorText, BT, BUILDINGS, RES_INFO } from '@strongpoly/shared';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../src/audio/clips';
import { normText } from '../src/audio/voice_logic';

/**
 * Meilenstein 4H: Jede Beraterzeile, die vorab vertont werden kann, hat einen Clip im Sprachpaket.
 *  - Zeilen ohne Platzhalter: Clip unter dem Zeilenschlüssel (`advisor.<ereignis>.<nr>`), Text gleich Zeilentext.
 *  - Zeilen mit genau einem endlichen Namensplatzhalter ({res}, {store}, {building}): je Wert ein Clip `<zeile>@<wert>`.
 *  - Zeilen mit Zahlen/freien Namen ({n}, {months}, {list}, {name} …) laufen bewusst über die Browser-Sprachausgabe (Ersatz).
 * Bei Lücken: `scripts/gen-voices.sh` (siehe packages/client/public/voice/README.md) und die Clips mit einchecken.
 */
const PACKS = join(__dirname, '../public/voice');

const placeholders = (t: string): string[] => [...new Set([...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];

function load(lang: 'de' | 'en') {
  const dir = join(PACKS, lang);
  const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  return { dir, man: validateManifest(raw)! };
}

/** Werte der endlichen Namensplatzhalter wie in scripts/export-voice-lines.ts */
function finiteValues(key: string, ph: string): string[] {
  const id = key.replace(/^advisor\./, '').replace(/\.\d+$/, '');
  if (ph === 'res') return RES_INFO.map((r) => r.name);
  if (ph === 'store') return ['Das Lager', 'Der Kornspeicher', 'Die Waffenkammer'];
  if (ph === 'building') {
    if (id === 'tower.fallen') return [BT.TowerLookout, BT.TowerGuard, BT.TowerRound].map((t) => BUILDINGS[t].name);
    if (id.startsWith('chain.')) return [...new Set(BUILDINGS.filter((b) => b && b.prod).map((b) => b.name))];
  }
  return [];
}

describe('Beraterzeilen haben Clips im Sprachpaket', () => {
  it('Daten: jedes Ereignis hat Texte für alle Varianten (de)', () => {
    for (const def of ADVISOR_EVENTS) for (const k of advisorKeys(def)) expect(ADVISOR_DE[k], `Text fehlt: ${k}`).toBeTruthy();
    expect(Object.keys(ADVISOR_DE).length).toBeGreaterThan(50);
  });

  it('de: alle Zeilen ohne Platzhalter haben einen Clip (Datei vorhanden, Text passt)', () => {
    const { dir, man } = load('de');
    const missing: string[] = [];
    let n = 0;
    for (const [key, text] of Object.entries(ADVISOR_DE)) {
      if (placeholders(text).length) continue;
      n++;
      const e = man.clips[key];
      if (!e || normText(e.t) !== normText(text) || !existsSync(join(dir, e.f)) || statSync(join(dir, e.f)).size < 1500) missing.push(key);
    }
    expect(n).toBeGreaterThan(5);
    expect(missing, `Clips fehlen oder sind veraltet (scripts/gen-voices.sh): ${missing.join(', ')}`).toEqual([]);
  });

  it('de: Zeilen mit einem endlichen Namensplatzhalter haben je Wert einen Clip mit fertigem Text', () => {
    const { dir, man } = load('de');
    const missing: string[] = [];
    let n = 0;
    for (const [key, text] of Object.entries(ADVISOR_DE)) {
      const ph = placeholders(text);
      if (ph.length !== 1) continue;
      for (const v of finiteValues(key, ph[0])) {
        n++;
        const ck = `${key}@${v}`;
        const e = man.clips[ck];
        const want = advisorText(key, { [ph[0]]: v }, 'de');
        if (!e || normText(e.t) !== normText(want) || !existsSync(join(dir, e.f))) missing.push(ck);
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(missing, `Clips fehlen oder sind veraltet: ${missing.join(', ')}`).toEqual([]);
  });

  it('en: alle Zeilen ohne Platzhalter haben einen Clip', () => {
    const { dir, man } = load('en');
    const missing: string[] = [];
    for (const [key, de] of Object.entries(ADVISOR_DE)) {
      const text = ADVISOR_EN[key] ?? de;
      if (placeholders(text).length) continue;
      const e = man.clips[key];
      if (!e || normText(e.t) !== normText(text) || !existsSync(join(dir, e.f))) missing.push(key);
    }
    expect(missing, `Clips fehlen oder sind veraltet: ${missing.join(', ')}`).toEqual([]);
  });

  it('jede Zeile mit Zahl/freiem Namen ist als Ersatzfall bekannt (kein Platzhalter ohne Wert aus der Ereignislogik)', () => {
    // Jeder Platzhalter muss in params des Ereignisses stehen, damit die Ereignislogik ihn füllt
    for (const [key, text] of Object.entries(ADVISOR_DE)) {
      const id = key.replace(/^advisor\./, '').replace(/\.\d+$/, '');
      const def = ADVISOR_EVENT_BY_ID[id];
      if (!def) continue;
      for (const ph of placeholders(text)) expect(def.params, `${key}: {${ph}} fehlt in params`).toContain(ph);
    }
  });
});
