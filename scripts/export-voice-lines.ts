/**
 * Exportiert die Dialogdaten (shared/src/data/voices*.ts) als JSON für den Clip-Generator (`gen_voices.py`).
 * Aufruf (aus dem Repo-Wurzelordner): pnpm --filter @strongpoly/shared exec tsx ../../scripts/export-voice-lines.ts <lang> <ausgabe.json>
 *
 * Zusätzlich werden, falls vorhanden, die Beraterzeilen des Ereignis-Beraters (`shared/src/data/advisor_lines.ts`, Schlüssel
 * `advisor.<ereignis>.<nr>`) mitvertont – aber nur Zeilen OHNE Platzhalter `{…}`: Texte mit zur Laufzeit eingesetzten Zahlen oder
 * Namen kann ein vorab erzeugter Clip nicht enthalten, dafür greift der Ersatz (Browser-Sprachausgabe mit dem fertigen Text).
 * Dringende Ereignisse (Priorität 2 / Art „alert“) bekommen das Profil `advisor.alarm`.
 */
import { writeFileSync } from 'node:fs';
import { BT, BUILDINGS } from '../packages/shared/src/data/buildings';
import { RES_INFO } from '../packages/shared/src/data/resources';
import { allVoiceLines, VOICE_PROFILES, type VoiceLang, type VoiceLine } from '../packages/shared/src/data/voices';

const lang = (process.argv[2] ?? 'de') as VoiceLang;
const out = process.argv[3];
if (!out) throw new Error('Ausgabedatei fehlt');

const lines: (VoiceLine & { src?: string })[] = allVoiceLines(lang);
try {
  const mod = (await import('../packages/shared/src/data/advisor_lines')) as {
    ADVISOR_DE: Record<string, string>;
    ADVISOR_EN: Record<string, string>;
    ADVISOR_EVENT_BY_ID: Record<string, { prio: number; kind: string }>;
    advisorText: (key: string, params: Record<string, string | number>, lang: VoiceLang) => string;
  };
  const have = new Set(lines.map((l) => l.key));
  let n = 0;
  for (const [key, de] of Object.entries(mod.ADVISOR_DE)) {
    const text = lang === 'en' ? (mod.ADVISOR_EN[key] ?? de) : de;
    if (text.includes('{') || have.has(key)) continue;
    const id = key.replace(/^advisor\./, '').replace(/\.\d+$/, '');
    const def = mod.ADVISOR_EVENT_BY_ID[id];
    const alarm = def ? def.prio >= 2 || def.kind === 'alert' : /leaving/.test(id);
    lines.push({ key, voice: 'advisor', profile: alarm ? 'advisor.alarm' : 'advisor', event: 'advisor', text, src: 'advisor_lines' });
    n++;
  }
  // Zeilen mit endlich vielen Namen als Platzhalter (Ware, Lager, Gebäude) werden je Wert ausgeschrieben; Schlüssel `<zeile>@<wert>`.
  // Das Sprachsystem findet den Clip über (Zeile, fertiger Text). Zahlen/freie Namen bleiben beim Ersatz (Browser-Sprachausgabe).
  if (lang === 'de') {
    const stores = ['Das Lager', 'Der Kornspeicher', 'Die Waffenkammer'];
    const producers = [...new Set(BUILDINGS.filter((b) => b && b.prod).map((b) => b.name))];
    const towers = [BT.TowerLookout, BT.TowerGuard, BT.TowerRound].map((t) => BUILDINGS[t].name);
    for (const [key, de] of Object.entries(mod.ADVISOR_DE)) {
      const ph = [...new Set([...de.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
      if (ph.length !== 1) continue;
      const id = key.replace(/^advisor\./, '').replace(/\.\d+$/, '');
      const def = mod.ADVISOR_EVENT_BY_ID[id];
      const alarm = def ? def.prio >= 2 || def.kind === 'alert' : false;
      let values: string[] = [];
      if (ph[0] === 'res') values = RES_INFO.map((r) => r.name);
      else if (ph[0] === 'store') values = stores;
      else if (ph[0] === 'building') values = id === 'tower.fallen' ? towers : id.startsWith('chain.') ? producers : [];
      for (const v of values) {
        const text = mod.advisorText(key, { [ph[0]]: v }, 'de');
        lines.push({ key: `${key}@${v}`, voice: 'advisor', profile: alarm ? 'advisor.alarm' : 'advisor', event: 'advisor', text, src: 'advisor_lines' });
        n++;
      }
    }
  }
  console.log(`${n} Beraterzeilen aus advisor_lines.ts ergänzt (ohne Platzhalter bzw. je Namenswert ausgeschrieben)`);
} catch {
  console.log('advisor_lines.ts nicht vorhanden – nur die eigenen Beraterzeilen');
}
writeFileSync(out, JSON.stringify({ lang, profiles: VOICE_PROFILES, lines }, null, 1));
console.log(`${lines.length} Zeilen (${lang}) -> ${out}`);
