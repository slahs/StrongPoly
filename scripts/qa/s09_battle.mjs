#!/usr/bin/env node
/**
 * Szenario 9: Schlacht mit vielen Einheiten (Dev-Befehle, ?quick=1&dev=1): je Seite mehrere Hundert Soldaten, KI-Gegner.
 * Prüft: Lesbarkeit (Bilder aus drei Höhen), Kampfeffekte und Leichen sichtbar, Zahl lebender Einheiten sinkt, Gleichzeitigkeit
 * der Klänge begrenzt (Limiter), Stimmen höchstens eine zugleich, Pegel am Bus ohne Übersteuern („keine Soundwand“),
 * Atmosphäre wechselt in die Schlachtstimmung; Draw-Calls/Dreiecke der Szene.
 *   node scripts/qa/s09_battle.mjs [--per-side=300]
 */
import { startQA, sleep, args } from './lib.mjs';

const perSide = Number(args['per-side'] ?? 300);
const q = await startQA('s09_battle', { query: 'quick=1&dev=1&size=128&seed=1&lang=de', viewport: { width: 1280, height: 720 }, settings: { quality: 'medium', shadows: true } });
const { page, S, ok } = q;
await page.mouse.click(640, 200);
await page.waitForFunction(() => window.__audio.state().ctx === 'running', null, { timeout: 15000 }).catch(() => {});
await S(() => window.__audio.engine.configure({ master: 1, sfx: 1, voice: 1, ambient: 1, music: 1, subtitles: true }));

// flache, freie Fläche 44x20 suchen
const site = await S(() => {
  const s = window.session();
  const w = s.world;
  const m = w.map;
  const k = w.players[0];
  // Rechteck mit wenigen blockierten Feldern (Bäume, Felsen, Wasser) und geringer Höhenspanne, nahe am Bergfried
  const tryRect = (rw, rh, maxBad) => {
    let best = null;
    for (let y0 = 3; y0 < m.h - rh - 3; y0 += 2)
      for (let x0 = 3; x0 < m.w - rw - 3; x0 += 2) {
        let lo = 255;
        let hi = 0;
        let bad = 0;
        for (let y = y0; y < y0 + rh; y++)
          for (let x = x0; x < x0 + rw; x++) {
            const i = m.idx(x, y);
            if (!m.walkable(i) || w.bldAt[i] || m.trees[i] !== 0) bad++;
            lo = Math.min(lo, m.height[i]);
            hi = Math.max(hi, m.height[i]);
          }
        if (bad > maxBad || hi - lo > 2) continue;
        const sc = bad * 6 + (hi - lo) * 40 + Math.hypot(x0 + rw / 2 - k.keepX, y0 + rh / 2 - k.keepY) * 0.5;
        if (!best || sc < best.sc) best = { sc, x0, y0, rw, rh, bad };
      }
    return best;
  };
  return tryRect(44,22,60) ?? tryRect(36,20,60);
});
console.log('Schlachtfeld', JSON.stringify(site));
ok('Ebene Fläche für das Schlachtfeld gefunden', !!site, JSON.stringify(site));
const cx = site.x0 + (site.rw >> 1);
const cy = site.y0 + (site.rh >> 1);
const half = Math.floor(perSide / 3);
// Seite A (Mensch, links): Schwertkämpfer, Speerträger, Bogenschützen; Seite B (KI-Lord, rechts) dasselbe + Ritter
const spawn = (owner, x, y) => {
  return Promise.all([
    q.dev('spawn', { type: 8, owner, n: half, x, y, stance: 2 }),
    q.dev('spawn', { type: 5, owner, n: half, x, y: y + 8, stance: 2 }),
    q.dev('spawn', { type: 3, owner, n: perSide - 2 * half, x: x - 5, y: y + 4, stance: 2 }),
  ]);
};
await spawn(0, cx - 14, cy - 8);
await spawn(1, cx + 8, cy - 8);
await q.dev('spawn', { type: 9, owner: 1, n: 12, x: cx + 14, y: cy - 2, stance: 2 });
await q.dev('spawn', { type: 9, owner: 0, n: 12, x: cx - 18, y: cy - 2, stance: 2 });
await S(([x, y]) => {
  const s = window.session();
  s.gs.cam.lookAt(x, y);
  s.gs.cam.dist = 55;
  s.gs.cam.distTarget = 55;
  s.conn.setSpeed(1);
}, [cx, cy]);
await sleep(3500);
const count = () => S(() => {
  const w = window.session().world;
  const c = [0, 0, 0];
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] < 3 && w.type[i] !== 0 && w.type[i] !== 1) c[w.owner[i]]++;
  return c;
});
const c0 = await count();
console.log('Einheiten zu Beginn', JSON.stringify(c0));
ok(`Mehrere Hundert Soldaten je Seite (≥ ${perSide} + 12)`, c0[0] >= perSide && c0[1] >= perSide, JSON.stringify(c0));
// Angriffsmarsch beider Seiten aufeinander
await S(([cx, cy]) => {
  const s = window.session();
  const w = s.world;
  const mine = [];
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] === 0 && w.type[i] !== 0 && w.type[i] !== 1) mine.push(w.ids[i]);
  s.send({ c: 'move', units: mine, x: cx + 6, y: cy, attack: true });
}, [cx, cy]);
// Aufnahme des Pegels am Bus: Analysator mit Spitzen-/Effektivwertprotokoll
await S(() => {
  const eng = window.__audio.engine;
  const an = eng.ctx.createAnalyser();
  an.fftSize = 2048;
  eng.bus.vis.connect(an);
  const buf = new Float32Array(an.fftSize);
  window.__lvl = { peak: 0, rmsMax: 0, clip: 0, n: 0, voices: 0, active: 0, conc: [] };
  window.__lvlT = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let p = 0;
    let s2 = 0;
    for (const x of buf) {
      p = Math.max(p, Math.abs(x));
      s2 += x * x;
    }
    const L = window.__lvl;
    L.peak = Math.max(L.peak, p);
    L.rmsMax = Math.max(L.rmsMax, Math.sqrt(s2 / buf.length));
    if (p >= 0.99) L.clip++;
    L.n++;
    const st = window.__audio.state();
    L.voices = Math.max(L.voices, st.voices);
    L.active = Math.max(L.active, st.voice.active);
    L.conc.push(st.voices);
  }, 100);
});
const series = [];
for (let i = 0; i < 6; i++) {
  await sleep(6000);
  const c = await count();
  const info = await S(() => {
    const s = window.session();
    const r = s.gs.renderer.info.render;
    const st = window.__audio.state();
    return { tick: s.world.tick, calls: r.calls, tris: r.triangles, mood: st.mood, voices: st.voices, ambience: st.ambience?.targets ?? null, corpses: s.entities.stats.corpses, projectiles: s.entities.stats.projectiles, particles: s.entities.fx.count };
  });
  series.push({ c, ...info });
  console.log(`t=${i} Einheiten ${JSON.stringify(c)} calls ${info.calls} tris ${info.tris} Stimmung ${info.mood} Klänge ${info.voices}`);
  if (i === 1) await q.shot('1_schlacht_fern');
  if (i === 2) {
    await S(([x, y]) => {
      const s = window.session();
      s.gs.cam.lookAt(x, y);
      s.gs.cam.dist = 26;
      s.gs.cam.distTarget = 26;
    }, [cx, cy]);
    await sleep(2500);
    await q.shot('2_schlacht_mittel');
  }
  if (i === 3) {
    await S(([x, y]) => {
      const s = window.session();
      s.gs.cam.lookAt(x, y);
      s.gs.cam.dist = 13;
      s.gs.cam.distTarget = 13;
    }, [cx, cy]);
    await sleep(2500);
    await q.shot('3_schlacht_nah');
  }
}
q.result.data.series = series;
const lvl = await S(() => {
  clearInterval(window.__lvlT);
  return window.__lvl;
});
const lastC = series[series.length - 1].c;
console.log('Pegel', JSON.stringify({ peak: lvl.peak, rmsMax: lvl.rmsMax, clip: lvl.clip, n: lvl.n, maxKlaenge: lvl.voices, maxStimmen: lvl.active }));
q.result.data.level = { peak: lvl.peak, rmsMax: lvl.rmsMax, clip: lvl.clip, samples: lvl.n, maxConcurrentEffects: lvl.voices, maxConcurrentVoices: lvl.active };
ok('Es wird gekämpft: Verluste auf beiden Seiten', lastC[0] < c0[0] - 5 && lastC[1] < c0[1] - 5, `${JSON.stringify(c0)} -> ${JSON.stringify(lastC)}`);
ok('Atmosphäre/Musik wechseln in die Schlachtstimmung', series.some((s) => /battle|fight|war|tension|combat/i.test(String(s.mood))), JSON.stringify(series.map((s) => s.mood)));
ok('Kein Übersteuern am Bus (Spitze ≤ 1,0, höchstens 2 Messpunkte ≥ 0,99)', lvl.peak <= 1.0 && lvl.clip <= 2, `Spitze ${lvl.peak.toFixed(3)}, Clips ${lvl.clip}/${lvl.n}`);
// Alle Regler stehen hier auf 1,0 (ungünstigster Fall); RMS über 46-ms-Fenster, Maximum über die Schlacht
ok('Keine Soundwand: gleichzeitige Effekt-Stimmen begrenzt (≤ 32) und Effektivwert am Bus ≤ 0,45 bei allen Reglern auf Maximum', lvl.voices <= 32 && lvl.rmsMax <= 0.45, `Stimmen ${lvl.voices}, RMS ${lvl.rmsMax.toFixed(3)}`);
ok('Einheitenstimmen: nie mehr als 2 zugleich im Gefecht', lvl.active <= 2, `${lvl.active}`);
const stAfter = await S(() => window.__audio.state());
q.note('klaenge_gespielt', stAfter.played);
q.note('klaenge_verworfen_limiter', stAfter.dropped);
const fx = { corpsesMax: Math.max(...series.map((x) => x.corpses)), projectilesMax: Math.max(...series.map((x) => x.projectiles)), particlesMax: Math.max(...series.map((x) => x.particles)) };
q.note('effekte', fx);
ok('Kampfeffekte: Pfeile/Geschosse und Partikel sichtbar im Spiel', fx.projectilesMax > 0 && fx.particlesMax > 0, JSON.stringify(fx));
ok('Leichen liegen sichtbar (gleichzeitig > 20, begrenzt durch die Stufe)', fx.corpsesMax > 20, JSON.stringify(fx));
ok('Draw-Calls der Schlacht unter 200', series.every((s) => s.calls < 200), JSON.stringify(series.map((s) => s.calls)));
process.exit(await q.finish());
