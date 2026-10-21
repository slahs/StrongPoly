#!/usr/bin/env node
/**
 * Szenario 18 (Phase 5A): GLB-Figuren Bauer und Speerkämpfer im Spiel (`?quick=1&style=medieval`).
 * Prüft über den echten Spielweg (Session, Dev-Befehle, Bewegungsbefehl):
 *  - Overrides aktiv: Einheitentyp Bauer → `peasant`, Speerkämpfer → `spearman` (GLB statt prozedural)
 *  - Bauern arbeiten/laufen (Anteile aus Sim-Zustand und Bewegung), Nahaufnahme
 *  - Speerkämpfer beider Seiten marschieren aufeinander zu und kämpfen; Leichen bleiben liegen (Umkippen)
 *  - LOD-Verteilung der Figuren-Instanzen (nah/mittel/fern), Draw-Calls/Dreiecke der Szene
 *  - Bewegungsglättung unverändert (Sprünge der Bewegungsglättung zählen), Konsole sauber
 *   node scripts/qa/s18_figures_medieval.mjs [--out=docs/phase5a/qa]
 */
import { args, sleep, startQA } from './lib.mjs';

if (!args.out) args.out = 'docs/phase5a/qa';
const q = await startQA('s18_figures_medieval', { query: 'quick=1&dev=1&size=128&seed=3&style=medieval', viewport: { width: 960, height: 540 }, settings: { quality: 'medium', shadows: false } });
const { page, ok, S } = q;
// Maus in die Bildmitte (am Rand würde die Kamera scrollen)
await page.mouse.move(480, 170);

await page.waitForFunction(() => window.__assets && window.__assets.manifestState === 'ready', null, { timeout: 60000 });
const pre = await S(() => window.__assets.preload());
ok('Manifest und Assets geladen', pre.ok >= 2 && pre.failed === 0, JSON.stringify(pre));
ok('Override Bauer = GLB peasant', await S(() => window.__assets.forUnit(0)?.id === 'peasant'));
ok('Override Speerkämpfer = GLB spearman', await S(() => window.__assets.forUnit(5)?.id === 'spearman'));

await q.speed(1);
await q.dev('gold', { owner: 0, n: 5000 });
const frameMs = () =>
  S(
    () =>
      new Promise((ok) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => (++n >= 5 ? ok((performance.now() - t0) / 5) : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
  );
// Arbeitsplätze (Holzfäller, Steinbruch) nahe dem Bergfried, damit Bauern Berufe ausüben
for (const type of [6, 7, 6]) {
  const spot = await S((type) => {
    const s = window.session();
    const k = s.world.players[0];
    for (let r = 5; r < 26; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = Math.round(k.keepX) + dx;
          const y = Math.round(k.keepY) + dy;
          if (window.__place(type, x, y, 0) === null) return { x, y };
        }
    return null;
  }, type);
  if (spot) await S(([type, x, y]) => window.session().send({ c: 'place', type, x, y }), [type, spot.x, spot.y]);
}
const t0 = await q.tick();
await q.waitTick(t0 + 400, 300000);

// ---- Bauern: Zustände zählen (Arbeit aus aux, Gehen aus der Bewegungsglättung)
const peas = await S(() => {
  const s = window.session();
  const w = s.world;
  const mo = s.entities.motion;
  let n = 0;
  let work = 0;
  let walk = 0;
  let pick = null;
  for (let i = 0; i < w.top; i++) {
    if (!w.ids[i] || w.type[i] !== 0 || w.owner[i] !== 0) continue;
    n++;
    if (w.aux[i] & 2) {
      work++;
      if (!pick) pick = { x: w.curX[i], y: w.curY[i] };
    }
    if (mo.walk[i]) walk++;
  }
  return { n, work, walk, pick };
});
ok('Bauern vorhanden, einige arbeiten oder laufen', peas.n > 0 && peas.work + peas.walk > 0, JSON.stringify(peas));
if (peas.pick) {
  await S(([x, y]) => {
    const c = window.session().gs.cam;
    c.setView(x, y, 6, Math.PI / 4, 30);
  }, [peas.pick.x, peas.pick.y]);
  await sleep(1500);
  await q.shot('01_bauer_arbeit_nah');
}
// Übersicht Siedlung (RTS-Höhe)
await S(() => {
  const s = window.session();
  const k = s.world.players[0];
  s.gs.cam.setView(k.keepX, k.keepY + 4, 34, Math.PI / 4, 52);
});
await sleep(1500);
await q.shot('02_siedlung_rts');

// ---- Speerkämpfer: zwei Gruppen (defensiv, weit auseinander) marschieren auf Befehl aufeinander zu
const site = await S(() => {
  const s = window.session();
  const w = s.world;
  const m = w.map;
  const k = w.players[0];
  let best = null;
  for (let y0 = 4; y0 < m.h - 14; y0 += 2)
    for (let x0 = 4; x0 < m.w - 34; x0 += 2) {
      let bad = 0;
      for (let y = y0; y < y0 + 10; y++)
        for (let x = x0; x < x0 + 30; x++) {
          const i = m.idx(x, y);
          if (!m.walkable(i) || w.bldAt[i] || m.trees[i] !== 0) bad++;
        }
      if (bad > 10) continue;
      const sc = bad * 5 + Math.hypot(x0 + 15 - k.keepX, y0 + 5 - k.keepY);
      if (!best || sc < best.sc) best = { sc, x0, y0 };
    }
  return best;
});
ok('freie Fläche für die Speerkämpfer', !!site, JSON.stringify(site));
const cx = site.x0 + 15;
const cy = site.y0 + 5;
await q.dev('spawn', { type: 5, owner: 0, n: 14, x: cx - 9, y: cy, stance: 2 });
await q.dev('spawn', { type: 5, owner: 1, n: 14, x: cx + 9, y: cy, stance: 2 });
await sleep(800);
await S(() => {
  const s = window.session();
  const w = s.world;
  let x = 0;
  let y = 0;
  let n = 0;
  for (let i = 0; i < w.top; i++)
    if (w.ids[i] && w.type[i] === 5 && w.owner[i] === 0) {
      x += w.curX[i];
      y += w.curY[i];
      n++;
    }
  if (n) s.gs.cam.setView(x / n + 1.5, y / n, 8, Math.PI / 4 + 0.4, 24);
});
await sleep(1500);
await q.shot('03_speer_stehen_nah');
const order = () =>
  S(([cx, cy]) => {
    const s = window.session();
    const w = s.world;
    const mine = [];
    for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] === 0 && w.type[i] === 5) mine.push(w.ids[i]);
    s.send({ c: 'move', units: mine, x: cx + 4, y: cy, attack: true });
  }, [cx, cy]);
await order();
const j0 = await S(() => window.session().entities.motion.jumps);
// fortlaufend abtasten: Gehen, Nahkampf, Leichen; Kamera folgt der eigenen Gruppe
const sample = () =>
  S(() => {
    const s = window.session();
    const w = s.world;
    let melee = 0;
    let walk = 0;
    let mx = 0;
    let my = 0;
    let n = 0;
    for (let i = 0; i < w.top; i++) {
      if (!w.ids[i] || w.type[i] !== 5 || w.owner[i] > 1) continue;
      if (w.aux[i] & 1) melee++;
      if (s.entities.motion.walk[i]) walk++;
      if (w.owner[i] === 0) {
        mx += s.entities.motion.x[i];
        my += s.entities.motion.y[i];
        n++;
      }
    }
    let all = 0;
    for (let i = 0; i < w.top; i++) if (w.ids[i] && w.type[i] === 5 && w.owner[i] < 2) all++;
    return { melee, walk, all, corpses: s.entities.stats.corpses, x: n ? mx / n : 0, y: n ? my / n : 0, n };
  });
let maxMelee = 0;
let maxCorpses = 0;
let marching = 0;
let minAlive = 1e9;
const alive0 = (await sample()).all;
const shots = new Set();
for (let i = 0; i < 50 && shots.size < 3; i++) {
  const f = await sample();
  maxMelee = Math.max(maxMelee, f.melee);
  maxCorpses = Math.max(maxCorpses, f.corpses);
  marching = Math.max(marching, f.walk);
  minAlive = Math.min(minAlive, f.all);
  if (f.n) await S(([x, y]) => window.session().gs.cam.setView(x, y, 9, Math.PI / 4 + 0.4, 28), [f.x + 1.5, f.y]);
  if (!shots.has('m') && f.walk >= 2) {
    await q.shot('04_speer_marsch');
    shots.add('m');
  } else if (!shots.has('k') && (f.melee >= 1 || f.corpses >= 1)) {
    await q.shot('05_speer_kampf');
    shots.add('k');
  } else if (shots.has('k') && !shots.has('l') && f.corpses >= 2) {
    await q.shot('06_speer_leichen');
    shots.add('l');
  } else await sleep(250);
}
const fms = await frameMs();
q.note('frame_ms_softwaregl', fms);
ok('Speerkämpfer marschieren (Schrittanimation aus echter Bewegung)', marching > 0, `max. ${marching} gehen, Frame ${fms.toFixed(0)} ms (Software-GL)`);
ok('Speerkämpfer kämpfen (Nahkampf-Zustand bzw. Verluste)', maxMelee > 0 || minAlive < alive0, `max. ${maxMelee} im Nahkampf, ${alive0} → ${minAlive} am Leben`);
ok('Gefallene bleiben als Leichen liegen (GLB umgekippt)', maxCorpses > 0, `max. ${maxCorpses} Leichen`);

// ---- Mittlere Höhe und RTS-Höhe über dem Kampf; Statistik
await S(([x, y]) => window.session().gs.cam.setView(x, y, 24, Math.PI / 4, 45), [cx, cy]);
await sleep(1500);
await q.shot('07_kampf_mittel');
await S(([x, y]) => window.session().gs.cam.setView(x, y, 46, Math.PI / 4, 52), [cx, cy]);
await sleep(1500);
await q.shot('08_kampf_rts');
const stats = await S(() => {
  const s = window.session();
  const info = s.gs.renderer.info.render;
  const lods = {};
  for (const [k, m] of s.entities.assetMeshes ?? new Map()) if (k.startsWith('u:')) lods[k] = [...m.perLod];
  return { calls: info.calls, triangles: info.triangles, lods };
});
q.note('szene', stats);
console.log('Statistik', JSON.stringify(stats));
// Bewegungsglättung (render/motion.ts) ist unverändert; bei Software-GL (> 1 s je Bild) springen Einheiten zwangsläufig
// über die Versetzungsgrenze – die Zahl ist nur ein Hinweis auf die Bildrate, kein Fehler der Figuren
const j1 = await S(() => window.session().entities.motion.jumps);
q.note('bewegungsglaettung_spruenge_softwaregl', j1 - j0);

process.exit(await q.finish());
