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
const q = await startQA('s18_figures_medieval', { query: 'quick=1&dev=1&size=128&seed=3&style=medieval', settings: { quality: 'high', shadows: true } });
const { page, ok, S } = q;

await page.waitForFunction(() => window.__assets && window.__assets.manifestState === 'ready', null, { timeout: 60000 });
const pre = await S(() => window.__assets.preload());
ok('Manifest und Assets geladen', pre.ok >= 2 && pre.failed === 0, JSON.stringify(pre));
ok('Override Bauer = GLB peasant', await S(() => window.__assets.forUnit(0)?.id === 'peasant'));
ok('Override Speerkämpfer = GLB spearman', await S(() => window.__assets.forUnit(5)?.id === 'spearman'));

await q.speed(1);
await q.dev('gold', { owner: 0, n: 5000 });
const t0 = await q.tick();
await q.waitTick(t0 + 250);

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

// ---- Speerkämpfer: zwei Gruppen marschieren aufeinander zu
const site = await S(() => {
  const s = window.session();
  const w = s.world;
  const m = w.map;
  const k = w.players[0];
  let best = null;
  for (let y0 = 4; y0 < m.h - 14; y0 += 2)
    for (let x0 = 4; x0 < m.w - 26; x0 += 2) {
      let bad = 0;
      for (let y = y0; y < y0 + 10; y++)
        for (let x = x0; x < x0 + 22; x++) {
          const i = m.idx(x, y);
          if (!m.walkable(i) || w.bldAt[i] || m.trees[i] !== 0) bad++;
        }
      if (bad > 8) continue;
      const sc = bad * 5 + Math.hypot(x0 + 11 - k.keepX, y0 + 5 - k.keepY);
      if (!best || sc < best.sc) best = { sc, x0, y0 };
    }
  return best;
});
ok('freie Fläche für die Speerkämpfer', !!site, JSON.stringify(site));
const cx = site.x0 + 11;
const cy = site.y0 + 5;
await q.dev('spawn', { type: 5, owner: 0, n: 14, x: cx - 8, y: cy, stance: 2 });
await q.dev('spawn', { type: 5, owner: 1, n: 14, x: cx + 8, y: cy, stance: 2 });
await sleep(800);
await S(([x, y]) => window.session().gs.cam.setView(x, y, 9, Math.PI / 4 + 0.4, 28), [cx - 6, cy]);
await sleep(1500);
await q.shot('03_speer_stehen_nah');
await S(([cx, cy]) => {
  const s = window.session();
  const w = s.world;
  const mine = [];
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] === 0 && w.type[i] === 5) mine.push(w.ids[i]);
  s.send({ c: 'move', units: mine, x: cx + 6, y: cy, attack: true });
}, [cx, cy]);
const j0 = await S(() => window.session().entities.motion.jumps);
await sleep(2500);
await S(([x, y]) => window.session().gs.cam.setView(x, y, 10, Math.PI / 4 + 0.4, 30), [cx - 3, cy]);
await sleep(1200);
const marching = await S(() => {
  const s = window.session();
  const w = s.world;
  let n = 0;
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] === 0 && w.type[i] === 5 && s.entities.motion.walk[i]) n++;
  return n;
});
ok('Speerkämpfer marschieren (Schrittanimation aus echter Bewegung)', marching > 0, `${marching} gehen`);
await q.shot('04_speer_marsch');
await sleep(5000);
await S(([x, y]) => window.session().gs.cam.setView(x, y, 11, Math.PI / 4 + 0.4, 32), [cx, cy]);
await sleep(2500);
const fight = await S(() => {
  const s = window.session();
  const w = s.world;
  let melee = 0;
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.type[i] === 5 && w.aux[i] & 1) melee++;
  return { melee, corpses: s.entities.stats.corpses };
});
await q.shot('05_speer_kampf');
ok('Speerkämpfer kämpfen', fight.melee > 0, JSON.stringify(fight));
await sleep(9000);
const after = await S(() => {
  const s = window.session();
  const w = s.world;
  const c = [0, 0];
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.type[i] === 5 && w.owner[i] < 2) c[w.owner[i]]++;
  return { alive: c, corpses: s.entities.stats.corpses };
});
await q.shot('06_speer_kampf_spaeter');
ok('Gefallene bleiben als Leichen liegen (GLB umgekippt)', after.corpses > 0, JSON.stringify(after));

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
const j1 = await S(() => window.session().entities.motion.jumps);
q.note('bewegungsglaettung_spruenge', j1 - j0);
ok('Bewegungsglättung: keine Versetzungen beim Marsch/Kampf', j1 - j0 === 0, `${j1 - j0} Sprünge`);

process.exit(await q.finish());
