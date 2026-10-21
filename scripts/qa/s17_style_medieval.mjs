#!/usr/bin/env node
/**
 * Szenario 17 (Phase 5A): Spiel im Stil „medieval“ (`?style=medieval`) mit GLB-Assets im echten Renderer.
 * Prüft über den echten Spielweg (Session, Befehle, Maus):
 *  - Manifest und Assets laden, Override aktiv (Brunnen = GLB statt prozedural)
 *  - Platzierungsgeist zeigt das GLB-Modell (Geometrie aus dem Asset)
 *  - Bau über den Befehlsweg: Sofortbau in der Sim, Bauanimation mit Höhenmaske (Clip-Material), danach fertiges GLB
 *  - Auswahlrahmen, Hover-Kontur aus der GLB-Geometrie, Lebensbalken
 *  - Stilwechsel zurück auf classic → prozedurales Modell; Konsole sauber
 *   node scripts/qa/s17_style_medieval.mjs [--out=docs/phase5a/qa]
 */
import { args, sleep, startQA } from './lib.mjs';

if (!args.out) args.out = 'docs/phase5a/qa';
const WELL = 29;
const q = await startQA('s17_style_medieval', { query: 'quick=1&dev=1&size=128&seed=3&style=medieval', settings: { quality: 'medium', shadows: true } });
const { page, ok, S } = q;

await page.waitForFunction(() => window.__assets && window.__assets.manifestState === 'ready', null, { timeout: 60000 });
const pre = await S(() => window.__assets.preload());
ok('Manifest und Assets geladen', pre.ok >= 1 && pre.failed === 0, JSON.stringify(pre));
ok('Override Brunnen aktiv', await S((t) => window.__assets.forBuilding(t)?.id === 'well', WELL));

await q.speed(1);
await q.dev('gold', { owner: 0, n: 5000 });
for (const r of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) await q.dev('res', { owner: 0, res: r, n: 200 });
await q.waitTick(20);

// freie Stelle nahe am Bergfried
const spot = await S((t) => {
  const s = window.session();
  const k = s.world.players[0];
  for (let r = 3; r < 14; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(k.keepX) + dx;
        const y = Math.round(k.keepY) + dy;
        if (window.__place(t, x, y, 0) === null) return { x, y };
      }
  return null;
}, WELL);
ok('freie Stelle gefunden', !!spot, JSON.stringify(spot));

// Kamera nah an die Stelle
await S(([x, y]) => {
  const c = window.session().gs.cam;
  c.lookAt(x + 0.5, y + 0.5);
  c.zoom(-2000);
}, [spot.x, spot.y]);
await sleep(800);
const screenOf = (x, y, h = 0) =>
  S(([x, y, h]) => {
    const s = window.session();
    const cam = s.gs.cam.camera;
    const v = cam.position.clone().set(x, h, y).project(cam);
    const r = s.gs.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, [x, y, h]);

// 1) Platzierungsgeist
await S((t) => window.session().startPlacement(t), WELL);
const p0 = await screenOf(spot.x + 0.5, spot.y + 0.5);
await page.mouse.move(p0.x, p0.y);
await sleep(700);
const ghost = await S((t) => {
  const s = window.session();
  const g = s.ghost;
  const m = window.__assets.forBuilding(t);
  return { visible: g.group.visible, count: g.body?.count ?? 0, fromAsset: !!m && g.body?.geometry === m.cache.ghost };
}, WELL);
ok('Platzierungsgeist zeigt das GLB-Modell', ghost.visible && ghost.count >= 1 && ghost.fromAsset, JSON.stringify(ghost));
await q.shot('1_geist');

// 2) Bauen (Befehlsweg), Bauanimation: Beobachter im Seitenkontext nach jedem Bild (die Bauzeit des Brunnens ist kurz)
await q.speed(0.25);
await S(([t, x, y]) => {
  const s = window.session();
  window.__bau = [];
  const look = () => {
    const b = [...s.world.buildings.values()].find((v) => v.x === x && v.y === y && v.t === t);
    if (b) {
      const prog = s.entities.sites.progress(s.world, b, 1);
      let clip = 0;
      let fin = 0;
      s.entities.group.traverse((o) => {
        if (!o.name.startsWith('asset:well:') || !o.count) return;
        if (o.material.customProgramCacheKey?.() === 'spAsset:clip') clip += o.count;
        else fin += o.count;
      });
      window.__bau.push({ tick: s.world.tick, n: b.n, prog: +prog.toFixed(2), clip, fin, hp: b.hp });
      if (prog >= 1 && fin > 0) return;
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
  s.send({ c: 'place', type: t, x, y });
}, [WELL, spot.x, spot.y]);
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__bau.length && window.__bau[window.__bau.length - 1].fin > 0 && window.__bau[window.__bau.length - 1].prog >= 1, null, { timeout: 60000 });
const samples = await S(() => window.__bau);
const bid = await S(([x, y]) => [...window.session().world.buildings.values()].find((b) => b.x === x && b.y === y).i, [spot.x, spot.y]);
q.note('bau', samples);
ok('Sofortbau: Gebäude steht sofort in der Sim (volle HP)', samples[0].hp > 0, JSON.stringify(samples[0]));
ok('Bauanimation: GLB im Clip-Material während des Baus (Fortschritt steigt stetig)', samples.some((v) => v.prog > 0 && v.prog < 1 && v.clip > 0) && samples.every((v, i) => i === 0 || v.prog >= samples[i - 1].prog), JSON.stringify(samples.filter((_, i) => i % 3 === 0).slice(0, 6)));
await q.speed(4);
await page.waitForFunction((id) => {
  const s = window.session();
  return s.entities.sites.progress(s.world, s.world.buildings.get(id), 1) >= 1;
}, bid, { timeout: 60000 });
await q.speed(1);
await sleep(600);
const fin = await S((t) => {
  const s = window.session();
  let n = 0;
  s.entities.group.traverse((o) => {
    if (o.name.startsWith('asset:well:') && o.material.customProgramCacheKey?.() === 'spAsset:final') n += o.count;
  });
  return { glb: n, proc: s.entities.bldMeshes[t]?.count ?? 0 };
}, WELL);
ok('fertig: GLB-Modell, kein prozedurales Modell für den Brunnen', fin.glb >= 1 && fin.proc === 0, JSON.stringify(fin));

// 3) Auswahl, Hover-Kontur
await S((id) => window.session().setSelection([], id), bid);
const p1 = await screenOf(spot.x + 0.5, spot.y + 0.5, 0.4);
await page.mouse.move(p1.x, p1.y);
await sleep(900);
const sel = await S((t) => {
  const s = window.session();
  const e = s.entities;
  const m = window.__assets.forBuilding(t);
  return { frames: e.frames.count, hover: e.hoverLines.visible, edgesFromAsset: !!m && e.hoverLines.geometry === m.cache.edges };
}, WELL);
ok('Auswahlrahmen sichtbar', sel.frames >= 4, JSON.stringify(sel));
ok('Hover-Kontur aus der GLB-Geometrie', sel.hover && sel.edgesFromAsset, JSON.stringify(sel));
await q.shot('3_auswahl_hover');

// 4) Stilwechsel zur Laufzeit → classic (prozedural)
await S(() => window.__assets.setStyle('classic'));
await sleep(700);
const cls = await S((t) => {
  const s = window.session();
  let n = 0;
  s.entities.group.traverse((o) => {
    if (o.name.startsWith('asset:') && o.count) n += o.count;
  });
  return { glb: n, proc: s.entities.bldMeshes[t]?.count ?? 0 };
}, WELL);
ok('Stil classic: prozedurales Modell, keine GLB-Instanzen', cls.glb === 0 && cls.proc >= 1, JSON.stringify(cls));
await q.shot('4_classic');
await S(() => window.__assets.setStyle('medieval'));
await sleep(700);
await q.shot('5_medieval');

process.exit(await q.finish());
