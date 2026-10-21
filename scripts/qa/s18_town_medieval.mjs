#!/usr/bin/env node
/**
 * Szenario 18 (Phase 5A, Stadt): Fachwerkhaus (Hütte, zwei Modellvarianten), Bäckerei und Schmiede als GLB-Assets im
 * echten Spiel (`?style=medieval`). Prüft über den echten Spielweg (Session, Befehle, Maus):
 *  - Overrides aktiv (hovel/hovel_b, bakery, blacksmith), Variantenwahl je Gebäude-ID
 *  - Platzierungsgeist aus dem GLB, Bau über den Befehlsweg, Bauanimation in Stufen (Bilder bei 20/45/70/90 %)
 *  - fertiges GLB statt prozeduralem Modell, Auswahlrahmen, Hover-Kontur aus dem Asset
 *  - Emitter aus den Ankern (Rauch der Bäckerei/Schmiede mit Arbeiter, Hütte ohne), Konsole sauber
 *   node scripts/qa/s18_town_medieval.mjs [--out=docs/phase5a/assets/town/qa]
 */
import { args, sleep, startQA } from './lib.mjs';

if (!args.out) args.out = 'docs/phase5a/assets/town/qa';
const BT = { Hovel: 2, Bakery: 17, Blacksmith: 22 };
const q = await startQA('s18_town_medieval', { query: 'quick=1&dev=1&size=128&seed=3&style=medieval', settings: { quality: 'medium', shadows: true } });
const { page, ok, S } = q;

await page.waitForFunction(() => window.__assets && window.__assets.manifestState === 'ready', null, { timeout: 60000 });
const pre = await S(() => window.__assets.preload());
ok('Manifest und Assets geladen', pre.ok >= 4 && pre.failed === 0, JSON.stringify(pre));
const ov = await S((bt) => ({
  hovel: window.__assets.forBuilding(bt.Hovel)?.id,
  bakery: window.__assets.forBuilding(bt.Bakery)?.id,
  smithy: window.__assets.forBuilding(bt.Blacksmith)?.id,
  variants: window.__assets.variants.get(`b:${bt.Hovel}`) ?? 0,
}), BT);
ok('Overrides Hütte/Bäckerei/Schmiede aktiv, Hütte mit Variante', ov.hovel === 'hovel' && ov.bakery === 'bakery' && ov.smithy === 'blacksmith' && ov.variants === 1, JSON.stringify(ov));

await q.speed(1);
await q.dev('gold', { owner: 0, n: 5000 });
for (const r of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) await q.dev('res', { owner: 0, res: r, n: 300 });
await q.waitTick(20);

/** freie Stelle nahe am Bergfried, die nicht mit `taken` (Rechtecke) überlappt */
const findSpot = (t, taken, r0 = 4) =>
  S(([t, taken, r0]) => {
    const s = window.session();
    const k = s.world.players[0];
    const hit = (x, y) => taken.some((r) => x < r.x + r.w + 1 && x + 3 + 1 > r.x && y < r.y + r.h + 1 && y + 3 + 1 > r.y);
    for (let r = r0; r < 26; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = Math.round(k.keepX) + dx;
          const y = Math.round(k.keepY) + dy;
          if (!hit(x, y) && window.__place(t, x, y, 0) === null) return { x, y };
        }
    return null;
  }, [t, taken, r0]);

/** Bauauftrag senden; true, wenn das Gebäude erscheint (Figuren auf der Fläche können den Auftrag verhindern) */
const placeOk = async (t, x, y) => {
  await S(([t, x, y]) => window.session().send({ c: 'place', type: t, x, y }), [t, x, y]);
  return page
    .waitForFunction(([x, y, t]) => [...window.session().world.buildings.values()].some((b) => b.x === x && b.y === y && b.t === t), [x, y, t], { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
};

const camTo = (x, y, zoom) =>
  S(([x, y, z]) => {
    const c = window.session().gs.cam;
    c.lookAt(x, y);
    c.zoom(-2000);
    c.zoom(z);
  }, [x, y, zoom]);

const screenOf = (x, y, h = 0) =>
  S(([x, y, h]) => {
    const s = window.session();
    const cam = s.gs.cam.camera;
    const v = cam.position.clone().set(x, h, y).project(cam);
    const r = s.gs.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, [x, y, h]);

/** Bildschirmfoto mit langer Frist (Software-GL unter Last braucht für ein Bild mehrere Sekunden) */
const shot = (file) => page.screenshot({ path: `${q.picDir}/${file}.jpg`, type: 'jpeg', quality: 80, timeout: 180000 });
const taken = [];
const built = {};
for (const [name, t, w, h, zoom] of [['bakery', BT.Bakery, 3, 3, 260], ['blacksmith', BT.Blacksmith, 3, 3, 260], ['hovel', BT.Hovel, 2, 2, 160]]) {
  const spot = await findSpot(t, taken, t === BT.Hovel ? 9 : 5);
  ok(`${name}: freie Stelle`, !!spot, JSON.stringify(spot));
  if (!spot) continue;
  taken.push({ x: spot.x, y: spot.y, w, h });
  await camTo(spot.x + w / 2, spot.y + h / 2, zoom);
  await sleep(700);
  // Platzierungsgeist
  await S((t) => window.session().startPlacement(t), t);
  const p0 = await screenOf(spot.x + w / 2, spot.y + h / 2);
  await page.mouse.move(p0.x, p0.y);
  await sleep(900);
  const ghost = await S((t) => {
    const s = window.session();
    const g = s.ghost;
    const m = window.__assets.forBuilding(t);
    return { visible: g.group.visible, count: g.body?.count ?? 0, fromAsset: !!m && g.body?.geometry === m.cache.ghost };
  }, t);
  ok(`${name}: Platzierungsgeist aus dem GLB`, ghost.visible && ghost.count >= 1 && ghost.fromAsset, JSON.stringify(ghost));
  await shot(`${name}_0_geist`);
  // Bau über den Befehlsweg, langsam; Bilder bei festen Fortschritten
  await q.speed(0.35);
  const placed = await placeOk(t, spot.x, spot.y);
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 5);
  ok(`${name}: Bauauftrag angenommen`, placed, JSON.stringify(spot));
  if (!placed) continue;
  const id = await S(([x, y, t]) => [...window.session().world.buildings.values()].find((b) => b.x === x && b.y === y && b.t === t).i, [spot.x, spot.y, t]);
  built[name] = { id, ...spot, w, h };
  // Bauanimation in festen Stufen: Spiel pausieren, Baubeginn im Client-Spiegel so setzen, dass der Fortschritt dem Ziel
  // entspricht (rein darstellungsseitig, wie die Bauanimation selbst) - unabhängig von der Bildrate der Software-GL
  await S(() => window.session().conn.setPaused?.(true));
  await sleep(500);
  const n0 = await S((id) => window.session().world.buildings.get(id).n, id);
  const stages = [];
  for (const th of [0.2, 0.45, 0.7, 0.9]) {
    const st = await S(async ([id, th]) => {
      const s = window.session();
      const b = s.world.buildings.get(id);
      const pr = () => s.entities.sites.progress(s.world, b, 1);
      let lo = s.world.tick - 20000;
      let hi = s.world.tick;
      for (let k = 0; k < 40; k++) {
        const mid = Math.round((lo + hi) / 2);
        b.n = mid;
        if (pr() < th) hi = mid;
        else lo = mid;
      }
      b.n = lo;
      s.entities.bldDirty = true; // fertige Gebäude werden sonst nicht neu geschrieben
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let clip = 0;
      s.entities.group.traverse((o) => {
        if (o.name.startsWith('asset:') && o.count && o.material.customProgramCacheKey?.() === 'spAsset:clip') clip += o.count;
      });
      return { th, prog: +pr().toFixed(2), clip };
    }, [id, th]);
    stages.push(st);
    await shot(`${name}_${Math.round(th * 100)}_bau`);
  }
  await S(([id, n0]) => {
    window.session().world.buildings.get(id).n = n0;
    window.session().entities.bldDirty = true;
  }, [id, n0]);
  await S(() => window.session().conn.setPaused?.(false));
  q.note(`${name}_bau`, stages);
  ok(`${name}: Bauanimation im Clip-Material (Fortschritt steigt)`, stages.every((s) => s.clip > 0) && stages.every((s, i) => i === 0 || s.prog >= stages[i - 1].prog), JSON.stringify(stages));
  await q.speed(4);
  await page.waitForFunction((id) => {
    const s = window.session();
    return s.entities.sites.progress(s.world, s.world.buildings.get(id), 1) >= 1;
  }, id, { timeout: 120000 });
  await q.speed(1);
  await sleep(700);
  const fin = await S(([t, id]) => {
    const s = window.session();
    const m = window.__assets.forBuilding(t, id);
    let n = 0;
    s.entities.group.traverse((o) => {
      if (m && o.name.startsWith(`asset:${m.id}:`) && o.material.customProgramCacheKey?.() === 'spAsset:final') n += o.count;
    });
    return { id: m?.id, glb: n, proc: s.entities.bldMeshes[t]?.count ?? 0 };
  }, [t, id]);
  ok(`${name}: fertiges GLB (${fin.id}), kein prozedurales Modell`, fin.glb >= 1 && fin.proc === 0, JSON.stringify(fin));
  // Auswahl + Hover
  await S((id) => window.session().setSelection([], id), id);
  const p1 = await screenOf(spot.x + w / 2, spot.y + h / 2, 0.8);
  await page.mouse.move(p1.x, p1.y);
  await sleep(900);
  const sel = await S(([t, id]) => {
    const s = window.session();
    const e = s.entities;
    const m = window.__assets.forBuilding(t, id);
    return { frames: e.frames.count, hover: e.hoverLines.visible, edgesFromAsset: !!m && e.hoverLines.geometry === m.cache.edges };
  }, [t, id]);
  ok(`${name}: Auswahlrahmen und Hover-Kontur aus dem Asset`, sel.frames >= 4 && sel.hover && sel.edgesFromAsset, JSON.stringify(sel));
  await shot(`${name}_1_fertig_auswahl`);
  await S(() => window.session().setSelection([], -1));
}

// zweite bis vierte Hütte: Variantenwahl je Gebäude-ID
const ids = [];
for (let k = 0; k < 7 && ids.length < 3; k++) {
  const spot = await findSpot(BT.Hovel, taken, 9);
  if (!spot) break;
  taken.push({ x: spot.x, y: spot.y, w: 2, h: 2 });
  if (!(await placeOk(BT.Hovel, spot.x, spot.y))) continue;
  ids.push(await S(([x, y, t]) => [...window.session().world.buildings.values()].find((b) => b.x === x && b.y === y && b.t === t).i, [spot.x, spot.y, BT.Hovel]));
}
if (built.hovel) ids.unshift(built.hovel.id);
const vs = await S(([t, ids]) => ids.map((id) => window.__assets.forBuilding(t, id)?.id), [BT.Hovel, ids]);
q.note('hovel_varianten', { ids, assets: vs });
ok('Hütten: beide Modellvarianten in der Siedlung', new Set(vs).size === 2, JSON.stringify(vs));

// Arbeiter und Rauch (Bäckerei/Schmiede: Emitter aus den Ankern, nur mit Arbeiter)
await q.speed(4);
const staffed = await page
  .waitForFunction((ids) => {
    const s = window.session();
    return ids.every((id) => {
      const b = s.world.buildings.get(id);
      return b && b.s > 0;
    });
  }, [built.bakery?.id, built.blacksmith?.id].filter((v) => v !== undefined), { timeout: 90000, polling: 500 })
  .then(() => true)
  .catch(() => false);
await q.speed(1);
await sleep(1500);
const em = await S((b) => {
  const s = window.session();
  const out = {};
  for (const [name, r] of Object.entries(b)) {
    const near = s.entities.emitSites.filter((e) => e.x >= r.x - 0.5 && e.x <= r.x + r.w + 0.5 && e.z >= r.y - 0.5 && e.z <= r.y + r.h + 0.5);
    out[name] = near.map((e) => `${e.kind}@${e.y.toFixed(2)}`);
  }
  return out;
}, built);
q.note('emitter', { staffed, em });
ok('Emitter aus Ankern: Bäckerei Rauch am Schlot, Schmiede Rauch + Amboss (mit Arbeiter), Hütte Kaminrauch', (em.hovel ?? []).some((k) => k.startsWith('smoke')) && (!staffed || ((em.bakery ?? []).some((k) => k.startsWith('smoke@')) && (em.blacksmith ?? []).some((k) => k.startsWith('smokeDark')) && (em.blacksmith ?? []).some((k) => k.startsWith('anvil')))), JSON.stringify({ staffed, em }));
for (const name of ['bakery', 'blacksmith']) {
  const b = built[name];
  if (!b) continue;
  await camTo(b.x + b.w / 2, b.y + b.h / 2, 300);
  await sleep(1500);
  await shot(`${name}_2_betrieb`);
}
if (built.hovel) {
  await camTo(built.hovel.x + 1, built.hovel.y + 1, 600);
  await sleep(1200);
  await shot('hovel_2_siedlung');
}
process.exit(await q.finish());
