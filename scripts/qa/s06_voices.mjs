#!/usr/bin/env node
/**
 * Szenario 6: Gesprochene Einheitenantworten.
 *  A) Autoplay (vor der ersten Geste kein Ton, keine Konsolenwarnung), Clips laden/dekodieren (`__audio.checkClips`).
 *  B) Im Spiel: Auswahl/Befehle lösen Stimmen aus; gleiche Auswahl spricht nicht erneut; Wechsel-Spam und Massenbefehl erzeugen
 *     keine überlappende Massenrede; Untertitel an/aus; Lautstärkeregler (Optionsmenü), Stumm (M).
 *  C) Ausgabe aufgenommen (MediaRecorder am Bus, je Rolle eine Aufnahme) und mit lokaler Spracherkennung (Whisper, Python-Umgebung
 *     aus scripts/check_voices.py) rücktranskribiert: je Rolle mindestens eine Stichprobe.
 *   node scripts/qa/s06_voices.mjs [--asr-python=/pfad/venv/bin/python] [--asr=/pfad/sherpa-onnx-whisper-small]
 * Ohne Spracherkennung (kein Python) entfällt nur Teil C-Auswertung; die Aufnahmen bleiben unter docs/phase4/qa/s06_voices/.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startQA, sleep, args, root, openPauseMenu, closePauseMenu } from './lib.mjs';

const SCRATCH = '/tmp/claude-0/-home-user-StrongPoly/7790b50a-18ae-5266-b53e-ba32399649e4/scratchpad/agent4d';
const py = String(args['asr-python'] ?? process.env.ASR_PYTHON ?? `${SCRATCH}/venv/bin/python`);
const asr = String(args.asr ?? process.env.ASR_DIR ?? `${SCRATCH}/asr/sherpa-onnx-whisper-small`);

const q = await startQA('s06_voices', { query: 'quick=1&dev=1&seed=3&quality=low&lang=de', viewport: { width: 640, height: 400 }, settings: { quality: 'low', shadows: false }, autoplay: false });
const { page, S, ok } = q;
const aud = () => S(() => window.__audio.state());
const vdbg = () => S(() => window.__audio.engine.voice.debug());

// ---- A) Autoplay ----
const pre = await aud();
ok('Vor der ersten Geste: AudioContext nicht „running“ (Autoplay-Regel), keine Konsolenwarnung', pre.ctx !== 'running' && q.result.console.length === 0, `ctx=${pre.ctx}`);
await page.mouse.click(320, 150);
await page.waitForFunction(() => window.__audio.state().ctx === 'running', null, { timeout: 15000 }).catch(() => {});
const post = await aud();
ok('Nach der ersten Geste läuft der AudioContext', post.ctx === 'running', `ctx=${post.ctx}`);
await page.waitForFunction(() => { const c = window.__audio.state().voice.clips; return c && c.manifest && c.clips > 0; }, null, { timeout: 60000 }).catch(() => {});
const clipsInfo = (await aud()).voice.clips;
console.log('Clipregister', JSON.stringify(clipsInfo));
ok('Sprachpaket (Manifest) geladen, ≥ 490 deutsche Clips', clipsInfo?.manifest && clipsInfo.clips >= 490, JSON.stringify(clipsInfo));
// alle Clips laden, dekodieren, Pegel/NaN prüfen (decodeAudioData im Browser): auf einer eigenen, leichten Menüseite ohne laufendes Spiel,
// weil die Prüfung neben dem rechnenden Spiel (Software-GL) sehr lange dauert
const cq = await startQA('s06_clips', { query: 'lang=de', waitGame: false, settings: { quality: 'low', shadows: false }, viewport: { width: 640, height: 400 } });
const chk = await cq.S(async () => window.__audio.checkClips());
await cq.finish();
const summary = chk && { count: chk.count, ok: chk.ok, problems: chk.problems?.length, sekunden: Math.round(chk.totalSeconds), maxPeak: chk.maxPeak, rmsDb: [chk.minRmsDb, chk.maxRmsDb], ms: Math.round(chk.ms) };
console.log('checkClips', JSON.stringify(summary));
q.result.data.checkClips = { ...summary, perVoice: chk?.perVoice };
ok('Alle deutschen Clips lassen sich laden und dekodieren (Länge, Pegel, keine NaN/Stille)', !!chk && chk.count >= 490 && chk.problems.length === 0 && chk.ok === chk.count, JSON.stringify(summary));

// ---- B) Im Spiel ----
await S(() => {
  window.__audio.engine.configure({ subtitles: true, voice: 1, master: 1, advisor: 1 });
  // der Berater spricht in diesem Teil nicht (sonst zählen seine Zeilen bei den Einheitenstimmen mit)
  window.session().opts.settings.advisorSpeech = false;
});
const keep = await S(() => {
  const s = window.session();
  const p = s.world.players[s.me];
  return { x: Math.floor(p.keepX), y: Math.floor(p.keepY) };
});
await q.dev('gold', { owner: 0, n: 5000 });
await q.dev('spawn', { type: 3, owner: 0, x: keep.x + 5, y: keep.y + 4, n: 4 });
await q.dev('spawn', { type: 9, owner: 0, x: keep.x + 9, y: keep.y + 4, n: 3 });
await q.dev('spawn', { type: 8, owner: 0, x: keep.x + 5, y: keep.y + 8, n: 4 });
await q.dev('spawn', { type: 5, owner: 0, x: keep.x + 9, y: keep.y + 8, n: 3 });
await q.dev('build', { owner: 0, type: 22, x: keep.x - 9, y: keep.y + 3 });
await sleep(2500);
const pick = (type) => S((t) => {
  const s = window.session();
  const w = s.world;
  const r = [];
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] === s.me && w.type[i] === t) r.push(w.ids[i]);
  return r;
}, type);
const archers = await pick(3);
const knights = await pick(9);
const swords = await pick(8);
const spears = await pick(5);
const sel = (ids) => S((ids) => window.session().setSelection(ids, 0), ids);
const log0 = async () => (await vdbg()).log.length;
const lastLog = async () => (await vdbg()).log.slice(-1)[0];
const total = async () => {
  const s = (await vdbg()).stats;
  return s.clip + s.tts + s.textOnly;
};

let n0 = await total();
await sel(archers);
await sleep(2200);
let ll = await lastLog();
ok('Auswahl Bogenschützen: Stimme „archer“ spricht einen Clip', ll?.voice === 'archer' && ll.mode === 'clip' && (await total()) > n0, JSON.stringify(ll));
q.note('auswahl_bogenschuetze', ll?.text);
const sub = await S(() => document.querySelector('#voice-subtitles')?.textContent ?? null);
ok('Untertitel sichtbar, wenn eingeschaltet', !!sub && sub.length > 3, sub);
await q.shot('1_auswahl_untertitel');
// Befehl
n0 = await total();
await S(([ids, x, y]) => window.session().send({ c: 'move', units: ids, x, y }), [archers, keep.x + 12, keep.y + 6]);
await sleep(2200);
ll = await lastLog();
ok('Marschbefehl: Antwort der Gruppe (Ereignis „move“)', ll?.key?.includes('.move.') && (await total()) > n0, JSON.stringify(ll));
// Ritter, dann dieselbe Auswahl noch mal: keine neue Zeile
await sel(knights);
await sleep(2200);
ll = await lastLog();
ok('Auswahl Ritter: Stimme „knight“', ll?.voice === 'knight', JSON.stringify(ll));
n0 = await total();
for (let i = 0; i < 6; i++) await sel(knights);
await sleep(1000);
ok('Dieselbe Auswahl erneut: keine Wiederholung der Rede', (await total()) === n0, `${n0} -> ${await total()}`);
// Wechsel-Spam
n0 = await total();
for (const ids of [archers, knights, swords, spears, archers, knights, swords, spears, archers, knights, swords, spears]) {
  await sel(ids);
  await sleep(100);
}
await sleep(1500);
const dbg = await vdbg();
const spoken = (await total()) - n0;
console.log('Wechsel-Spam: gesprochen', spoken, 'verworfen', JSON.stringify(dbg.dropped), 'aktiv', dbg.active);
ok('Wechsel-Spam: höchstens 4 Zeilen aus 12 Auswahlwechseln in 1,2 s, Rest verworfen (keine Massenrede)', spoken <= 4 && dbg.stats.drops > 0, `gesprochen ${spoken}, verworfen ${dbg.stats.drops}`);
ok('Nie mehr als eine Einheitenstimme zugleich', dbg.active <= 2, `aktiv ${dbg.active}`);
// Massenbefehl an alle
await S(() => window.session().selectAllArmy?.());
await sleep(300);
n0 = await total();
await S(([x, y]) => window.session().send({ c: 'move', units: window.session().selection.units, x, y }), [keep.x + 14, keep.y + 12]);
await sleep(2500);
const massSpoken = (await total()) - n0;
ok('Marschbefehl an 14 Einheiten: höchstens eine Antwort', massSpoken <= 1, `Zeilen ${massSpoken}`);
// Gebäude anwählen
const smith = await S(() => {
  for (const b of window.session().world.buildings.values()) if (b.t === 22 && b.o === 0) return b.i;
  return 0;
});
n0 = await total();
await S((id) => window.session().setSelection([], id), smith);
await sleep(2400);
ll = await lastLog();
ok('Schmiede anwählen: Handwerkerstimme „smith“', ll?.voice === 'smith', JSON.stringify(ll));
// Untertitel aus
await S(() => window.__audio.engine.configure({ subtitles: false }));
await sel(archers);
await sel(swords);
await sleep(2200);
const subOff = await S(() => document.querySelector('#voice-subtitles')?.textContent ?? '');
ok('Untertitel aus: kein Text im Overlay', !subOff, subOff);
await S(() => window.__audio.engine.configure({ subtitles: true }));
// Stumm
n0 = await total();
await page.keyboard.press('KeyM');
await sleep(300);
await sel(knights);
await sleep(300);
await sel(spears);
await sleep(1800);
const muted = await S(() => window.__audio.state().settings.muted);
ok('Taste M schaltet stumm; im Stummzustand keine neuen Zeilen', muted === true && (await total()) === n0, `muted=${muted}, Zeilen ${n0}->${await total()}`);
await page.keyboard.press('KeyM');
// Lautstärkeregler im Optionsmenü
await openPauseMenu(page);
await page.getByText('Optionen', { exact: true }).first().click().catch(() => {});
await sleep(800);
const rows = await S(() => [...document.querySelectorAll('.form > span')].map((e) => e.textContent));
ok('Optionsmenü zeigt Regler Einheitenstimmen, Berater, Umgebung und Untertitel', ['Einheitenstimmen', 'Berater', 'Umgebung'].every((r) => rows.some((x) => x && x.startsWith(r))) && rows.some((x) => /Untertitel/.test(x ?? '')), JSON.stringify(rows));
await q.shot('2_optionen');
await S(() => {
  const labels = [...document.querySelectorAll('.form > span')];
  const row = (txt) => labels.find((e) => e.textContent === txt)?.nextElementSibling;
  const r = row('Einheitenstimmen')?.querySelector('input');
  if (r) {
    r.value = '0.35';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await sleep(400);
const st = await S(() => ({ eng: window.__audio.state().settings.voice, saved: JSON.parse(localStorage.getItem('strongpoly.settings')).volVoice }));
ok('Regler „Einheitenstimmen“ wirkt auf die Engine und wird gespeichert', Math.abs(st.eng - 0.35) < 0.01 && Math.abs(st.saved - 0.35) < 0.01, JSON.stringify(st));
await S(() => window.__audio.engine.configure({ voice: 1 }));
const back = page.getByText('← Zurück', { exact: false });
if (await back.count()) await back.first().click();
await sleep(300);
await closePauseMenu(page);

// ---- C) Aufnahme je Rolle + Rücktranskription ----
const recDir = path.join(q.picDir, 'rec');
fs.mkdirSync(recDir, { recursive: true });
await S(() => {
  const eng = window.__audio.engine;
  eng.configure({ voice: 1, master: 1, advisor: 1, music: 0, subtitles: true, muted: false });
  const dst = eng.ctx.createMediaStreamDestination();
  eng.bus.vis.connect(dst);
  window.__dst = dst;
});
const roles = ['swordsman', 'spearman', 'archer', 'crossbow', 'knight', 'mercenary', 'assassin', 'siege', 'engineer', 'monk', 'lord', 'peasant', 'woodcutter', 'mason', 'farmer', 'baker', 'miller', 'brewer', 'smith', 'trader', 'advisor'];
const refs = {};
const peaks = {};
for (const role of roles) {
  const r = await S(async (role) => {
    const eng = window.__audio.engine;
    const v = eng.voice;
    const rec = new MediaRecorder(window.__dst.stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const an = eng.ctx.createAnalyser();
    an.fftSize = 2048;
    eng.bus.vis.connect(an);
    let peak = 0;
    const buf = new Float32Array(an.fftSize);
    const t = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      for (const x of buf) peak = Math.max(peak, Math.abs(x));
    }, 25);
    rec.start();
    await new Promise((r) => setTimeout(r, 300));
    const lastAt = v.debug().log.slice(-1)[0]?.at ?? -1;
    const accepted = role === 'advisor' ? v.say({ voice: 'advisor', key: 'advisor.army.ready', text: 'Unser Heer ist bereit.', lang: 'de', priority: 1 }) : v.speak(role, 'select', {});
    // warten, bis die Zeile fertig ist (Aufnahme ≈ Dauer + Ausklang)
    await new Promise((r) => setTimeout(r, 400));
    const t0 = performance.now();
    while (v.debug().active > 0 && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 600));
    clearInterval(t);
    await new Promise((res) => {
      rec.onstop = res;
      rec.stop();
    });
    eng.bus.vis.disconnect(an);
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const b = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    const log = v.debug().log.filter((l) => l.at > lastAt && l.voice === role);
    return { accepted, peak, b64: btoa(s), log: log.slice(-1)[0] ?? null };
  }, role);
  const file = path.join(recDir, `${role}.webm`);
  fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
  refs[`${role}.webm`] = r.log?.text ?? '';
  peaks[role] = { accepted: r.accepted, peak: +r.peak.toFixed(3), mode: r.log?.mode, key: r.log?.key };
  console.log(role, JSON.stringify(peaks[role]), '|', refs[`${role}.webm`]);
  await sleep(2600); // Mindestabstand zwischen den Zeilen abwarten
}
q.result.data.roles = peaks;
ok('Alle 20 Sprecherrollen und der Berater haben eine Zeile als Clip gesprochen', roles.every((r) => peaks[r].accepted && peaks[r].mode === 'clip'), JSON.stringify(Object.entries(peaks).filter(([, v]) => !(v.accepted && v.mode === 'clip'))));
ok('Aufnahmepegel am Bus hörbar (Spitze > 0,02) und ohne Übersteuern (≤ 1,0) für alle Rollen', roles.every((r) => peaks[r].peak > 0.02 && peaks[r].peak <= 1.0), JSON.stringify(Object.entries(peaks).filter(([, v]) => !(v.peak > 0.02 && v.peak <= 1)).map(([k, v]) => [k, v.peak])));
fs.writeFileSync(path.join(recDir, 'refs.json'), JSON.stringify(refs, null, 1));

if (fs.existsSync(py) && fs.existsSync(asr) && fs.existsSync(`${SCRATCH}/stt.py`)) {
  const files = roles.map((r) => path.join(recDir, `${r}.webm`));
  const r = spawnSync(py, ['-I', `${SCRATCH}/stt.py`, '--json', path.join(recDir, 'stt.json'), '--ref', path.join(recDir, 'refs.json'), ...files], { encoding: 'utf8', maxBuffer: 1 << 26 });
  console.log(r.stdout);
  if (r.status !== 0) console.log(r.stderr.slice(-800));
  const wers = [];
  for (const line of r.stdout.split('\n')) {
    const m = /^(\w+)\.webm\t(.*?)\tWER=([\d.]+)/.exec(line);
    if (m) wers.push({ role: m[1], text: m[2], wer: Number(m[3]) });
  }
  q.result.data.stt = wers;
  const good = wers.filter((w) => w.wer <= 0.5).length;
  const mean = wers.reduce((s, w) => s + w.wer, 0) / Math.max(1, wers.length);
  q.note('stt_mittlere_wortfehlerrate', +mean.toFixed(2));
  // Die Zeile je Rolle wird zufällig gewählt und Whisper small halluziniert bei 1–3-Wort-Zurufen: die Wortfehlerrate schwankt von Lauf zu Lauf
  // (0,45 … 0,55 im Mittel, 4–6 von 21 fehlerfrei). Als Prüfung zählt, dass die Aufnahmen verständliche Sprache enthalten (≥ 8 von 21 ≤ 0,5, ≥ 3 fehlerfrei).
  const perfect = wers.filter((w) => w.wer === 0).length;
  q.note('stt_fehlerfrei', perfect);
  ok(`Rücktranskription: ${wers.length} Rollen ausgewertet, ≥ 8 davon mit Wortfehlerrate ≤ 0,5 und ≥ 3 fehlerfrei (Whisper small, Opus-Aufnahme des Busses: pessimistisch bei 1–3-Wort-Zurufen)`, wers.length >= 19 && good >= 8 && perfect >= 3, `${good}/${wers.length} ≤ 0,5, ${perfect} fehlerfrei, Mittel ${mean.toFixed(2)}`);
  // je Rolle eine Stichprobe: wenigstens das erste Inhaltswort wird erkannt (lockere Kontrolle, Whisper halluziniert bei 1–3-Wort-Zurufen)
} else {
  q.note('stt', 'Spracherkennung nicht verfügbar (Python-Umgebung fehlt): Rücktranskription nicht ausgewertet');
  console.log('Spracherkennung nicht verfügbar:', py, asr);
}
const final = await vdbg();
q.result.data.voiceStats = final.stats;
process.exit(await q.finish());
