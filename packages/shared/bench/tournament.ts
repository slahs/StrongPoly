/**
 * Turnier: alle KI-Profile paarweise (A ≠ B, je Paar eine Seite) auf mehreren Seeds.
 * Aufruf: tsx bench/tournament.ts [seeds=3] [minuten=90] [parallel=3] [profilliste z.B. 0,1,2]
 * Ziel: ≥ 80 % der Partien enden mit Keep-Fall.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AI_PROFILES } from '../src';

const seeds = Number(process.argv[2] ?? 3);
const minutes = Number(process.argv[3] ?? 90);
const parallel = Number(process.argv[4] ?? 3);
const ids = process.argv[5] ? process.argv[5].split(',').map(Number) : AI_PROFILES.slice(0, 9).map((_, i) => i);

interface Job { a: number; b: number; seed: number }
const jobs: Job[] = [];
for (let i = 0; i < ids.length; i++)
  for (let j = i + 1; j < ids.length; j++)
    for (let s = 0; s < seeds; s++) jobs.push({ a: ids[i], b: ids[j], seed: 3 + s * 11 + ((i + j) % 5) });

// RERUN=<vorheriges Ergebnis.json>: nur die damals nicht beendeten Partien wiederholen
if (process.env.RERUN) {
  const prev = JSON.parse(readFileSync(process.env.RERUN, 'utf8')) as { job: Job; ended: boolean }[];
  jobs.length = 0;
  for (const r of prev) if (!r.ended) jobs.push(r.job);
}

interface Res { job: Job; ended: boolean; min: number; text: string }
const results: Res[] = [];
// Zwischenstand je Partie (JSON-Zeilen): ein abgebrochenes Turnier setzt dort wieder an
const partial = (process.env.OUT ?? 'tournament.json') + '.partial.jsonl';
if (existsSync(partial)) {
  const key = (j: Job) => `${j.a}-${j.b}-${j.seed}`;
  const done = new Map<string, Res>();
  for (const line of readFileSync(partial, 'utf8').split('\n')) if (line.trim()) { const r = JSON.parse(line) as Res; done.set(key(r.job), r); }
  for (let i = jobs.length - 1; i >= 0; i--) {
    const r = done.get(key(jobs[i]));
    if (r) { results.push(r); jobs.splice(i, 1); }
  }
  if (results.length) console.log(`Fortsetzung: ${results.length} Partien aus ${partial} übernommen`);
}
const total = jobs.length + results.length;
let next = 0;
let running = 0;

function launch(): void {
  while (running < parallel && next < jobs.length) {
    const job = jobs[next++];
    running++;
    const child = spawn('node', ['--import', 'tsx', 'bench/duel.ts', String(job.a), String(job.b), String(job.seed), String(minutes)], { cwd: process.cwd() });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', () => {
      running--;
      const m = /RESULT (ENDED|TIMEOUT) ([\d.]+)min/.exec(out);
      const last = out.trim().split('\n').slice(-2).join('\n');
      const r: Res = { job, ended: m?.[1] === 'ENDED', min: m ? Number(m[2]) : -1, text: m ? last : 'CRASH\n' + out.slice(-400) };
      results.push(r);
      appendFileSync(partial, JSON.stringify(r) + '\n');
      console.log(`${r.ended ? 'ENDED  ' : 'TIMEOUT'} ${AI_PROFILES[job.a].name} vs ${AI_PROFILES[job.b].name} seed ${job.seed} ${r.min}min  (${results.length}/${total})`);
      if (results.length === total) finish();
      else launch();
    });
  }
}

function finish(): void {
  const ended = results.filter((r) => r.ended).length;
  console.log(`\n== ${ended}/${results.length} Partien mit Keep-Fall (${((100 * ended) / results.length).toFixed(0)} %) ==`);
  for (const r of results.filter((x) => !x.ended)) console.log(`TIMEOUT ${r.job.a} vs ${r.job.b} seed ${r.job.seed}: ${r.text.split('\n')[0].slice(0, 220)}`);
  writeFileSync(process.env.OUT ?? 'tournament.json', JSON.stringify(results, null, 1));
}
if (!jobs.length) finish();
else launch();
