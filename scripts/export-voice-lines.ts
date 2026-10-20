/**
 * Exportiert die Dialogdaten (shared/src/data/voices*.ts) als JSON für den Clip-Generator (`gen_voices.py`).
 * Aufruf (aus dem Repo-Wurzelordner): pnpm --filter @strongpoly/shared exec tsx ../../scripts/export-voice-lines.ts <lang> <ausgabe.json>
 */
import { writeFileSync } from 'node:fs';
import { allVoiceLines, VOICE_PROFILES, type VoiceLang } from '../packages/shared/src/data/voices';

const lang = (process.argv[2] ?? 'de') as VoiceLang;
const out = process.argv[3];
if (!out) throw new Error('Ausgabedatei fehlt');
writeFileSync(out, JSON.stringify({ lang, profiles: VOICE_PROFILES, lines: allVoiceLines(lang) }, null, 1));
console.log(`${allVoiceLines(lang).length} Zeilen (${lang}) -> ${out}`);
