#!/usr/bin/env node
/**
 * Szenario 18 (Phase 5A): Burg-Assets im Spiel (`?style=medieval`): Bergfried, Hohe Steinmauer (Arm/Pfosten/Einzelpfeiler),
 * Steintor. Über den echten Spielweg (Befehle `place`/`placeLine`):
 *  - Overrides aktiv, Bergfried als GLB-Instanz
 *  - Platzierungsgeist des Tors aus dem GLB
 *  - Bauanimation von Tor und Mauerzug im Clip-Material (Standbilder bei ~35 % und ~70 %), danach fertige GLB-Instanzen
 *  - Mauer schließt an das Tor an (Arme zum Tor), Eckstoß, Einzelpfeiler
 *  - Tor öffnet für eigene Truppen (Fallgitter hebt sich), Einheiten laufen hindurch
 *  - Auswahlrahmen/Hover-Kontur am Tor; Konsole sauber
 *   node scripts/qa/s18_castle_medieval.mjs [--out=docs/phase5a/qa]
 */
import { args, sleep, startQA } from './lib.mjs';

if (!args.out) args.out = 'docs/phase5a/qa';
const BT = { Keep: 0, WallHigh: 39, GateStone: 44 };
const q = await startQA('s18_castle_medieval', { query: 'quick=1&dev=1&size=128&seed=3&style=medieval', settings: { quality: 'medium', shadows: true } });
const { page, ok, S } = q;
const shot = async (file) => page.screenshot({ path: `${q.picDir}/${file}.jpg`, type: 'jpeg', quality: 80, timeout: 240000 });

await page.waitForFunction(() => window.__assets && window.__assets.manifestState === 'ready', null, { timeout: 60000 });
const pre = await S(() => window.__assets.preload());
ok('Manifest und Assets geladen', pre.ok >= 1 && pre.failed === 0, JSON.stringify(pre));
const ov = await S(() => ({
  keep: window.__assets.forBuilding(0)?.id,
  gate: window.__assets.forBuilding(44)?.id,
  arm: window.__assets.forWall(39, 'arm')?.id,
  post: window.__assets.forWall(39, 'post')?.id,
  stub: window.__assets.forWall(39, 'stub')?.id,
}));
ok('Overrides Bergfried/Steintor/Mauerstücke aktiv', ov.keep === 'keep' && ov.gate === 'gate_stone' && ov.arm === 'wall_high_arm' && ov.post === 'wall_high_post' && ov.stub === 'wall_high_stub', JSON.stringify(ov));
await q.dev('gold', { owner: 0, n: 9000 });
for (const r of [0, 1, 2, 3, 4, 5]) await q.dev('res', { owner: 0, res: r, n: 150 });
await q.waitTick(20);

const count = (prefix, mat) =>
  S(([p, m]) => {
    let n = 0;
    window.session().entities.group.traverse((o) => {
      if (!o.name.startsWith(p) || !o.count) return;
      if (m && o.material.customProgramCacheKey?.() !== m) return;
      n += o.count;
    });
    return n;
  }, [prefix, mat ?? null]);
const look = (x, y, dist, yaw) =>
  S(([x, y, d, yaw]) => {
    const c = window.session().gs.cam;
    c.setView(x, y, d, yaw ?? Math.PI / 4, 40);
  }, [x, y, dist, yaw]);

// Bergfried
const keep = await S(() => {
  const k = window.session().world.players[0];
  return { x: k.keepX, y: k.keepY };
});
await look(keep.x + 0.5, keep.y + 0.5, 15, 0.6);
await sleep(2500);
const kc = await count('asset:keep:');
ok('Bergfried als GLB-Instanz gezeichnet', kc >= 1, kc);
await shot('0_bergfried');

// freie, ebene Fläche 12 x 7 für Tor + Mauer mit Ecke
const site = await S(() => {
  const s = window.session();
  const w = s.world;
  const m = w.map;
  const k = w.players[0];
  let best = null;
  for (let r = 6; r < 30 && !best; r++)
    for (let dy = -r; dy <= r && !best; dy++)
      for (let dx = -r; dx <= r && !best; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x0 = Math.round(k.keepX) + dx;
        const y0 = Math.round(k.keepY) + dy;
        let okk = true;
        let lo = 255;
        let hi = 0;
        for (let y = y0 - 1; y < y0 + 8 && okk; y++)
          for (let x = x0 - 1; x < x0 + 14 && okk; x++) {
            if (!m.inBounds(x, y)) okk = false;
            else {
              const i = m.idx(x, y);
              if (!m.walkable(i) || w.bldAt[i] || m.trees[i] !== 0) okk = false;
              lo = Math.min(lo, m.height[i]);
              hi = Math.max(hi, m.height[i]);
            }
          }
        if (okk && hi - lo <= 1) best = { x0, y0 };
      }
  return best;
});
ok('freie Fläche für Tor und Mauer', !!site, JSON.stringify(site));
const { x0, y0 } = site;
const GX = x0 + 4;
const GY = y0 + 2; // Tor 4 x 3: Mauerlinie auf GY + 1
const WY = GY + 1;

// Platzierungsgeist des Tors
await look(GX + 2, GY + 1.5, 16, 0.5);
await sleep(800);
await S((t) => window.session().startPlacement(t), BT.GateStone);
const p0 = await S(([x, y]) => {
  const s = window.session();
  const cam = s.gs.cam.camera;
  const v = cam.position.clone().set(x, 0, y).project(cam);
  const r = s.gs.canvas.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [GX + 2, GY + 1.5]);
await page.mouse.move(p0.x, p0.y);
await sleep(900);
const ghost = await S((t) => {
  const s = window.session();
  const g = s.ghost;
  const m = window.__assets.forBuilding(t);
  return { visible: g.group.visible, fromAsset: !!m && g.body?.geometry === m.cache.ghost };
}, BT.GateStone);
ok('Platzierungsgeist des Tors aus dem GLB', ghost.visible && ghost.fromAsset, JSON.stringify(ghost));
await shot('1_geist_tor');
await page.keyboard.press('Escape');

// Bau: Tor, Mauer links/rechts (Anschluss an das Tor), Ecke nach Norden, Einzelpfeiler
await S(() => window.session().conn.setPaused(true));
const send = (c) => S((c) => window.session().send(c), c);
await send({ c: 'place', type: BT.GateStone, x: GX, y: GY, rot: 0 });
await q.dev('res', { owner: 0, res: 1, n: 150 });
await send({ c: 'placeLine', type: BT.WallHigh, x1: x0, y1: WY, x2: GX - 1, y2: WY });
await send({ c: 'placeLine', type: BT.WallHigh, x1: GX + 4, y1: WY, x2: x0 + 12, y2: WY });
await q.dev('res', { owner: 0, res: 1, n: 150 });
await send({ c: 'placeLine', type: BT.WallHigh, x1: x0, y1: WY - 1, x2: x0, y2: y0 - 1 });
await send({ c: 'place', type: BT.WallHigh, x: x0 + 12, y: y0 - 1 });
// Beobachter je Bild: Mauerstücke im Clip-Material (die Mauerwelle ist kurz, Software-GL liefert nur wenige Bilder)
await S(() => {
  const s = window.session();
  window.__wallClip = 0;
  const f = () => {
    let n = 0;
    s.entities.group.traverse((o) => {
      if (o.name.startsWith('asset:wall_high_') && o.count && o.material.customProgramCacheKey?.() === 'spAsset:clip') n += o.count;
    });
    window.__wallClip = Math.max(window.__wallClip, n);
    if (window.__wallClip < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
await S(() => window.session().conn.setSpeed(0.25));
await S(() => window.session().conn.setPaused(false));
await look(GX + 1, GY + 1, 17, -0.45);
const stills = [];
for (const target of [0.35, 0.7]) {
  await page.waitForFunction(([x, y, t]) => {
    const s = window.session();
    const b = [...s.world.buildings.values()].find((v) => v.x === x && v.y === y && v.t === 44);
    if (!b) return false;
    const p = s.entities.sites.progress(s.world, b, 1);
    if (p >= t) {
      s.conn.setPaused(true);
      return true;
    }
    return false;
  }, [GX, GY, target], { timeout: 240000, polling: 'raf' });
  await sleep(1500);
  const clip = await count('asset:gate_stone:', 'spAsset:clip');
  const wclip = await count('asset:wall_high_', 'spAsset:clip');
  stills.push({ target, clip, wclip });
  await shot(`2_bau_${Math.round(target * 100)}`);
  await S(() => window.session().conn.setPaused(false));
}
const wallClip = await S(() => window.__wallClip);
ok('Bauanimation: Tor im Clip-Material (GLB) bei 35 % und 70 %', stills.every((s) => s.clip >= 1), JSON.stringify(stills));
ok('Bauanimation: Mauerstücke im Clip-Material (GLB) während der Mauerwelle', wallClip >= 1, wallClip);
await S(() => window.session().conn.setSpeed(4));
await page.waitForFunction(([x, y]) => {
  const s = window.session();
  const all = [...s.world.buildings.values()].filter((v) => v.o === 0 && (v.t === 44 || v.t === 39));
  return all.length > 5 && all.every((b) => s.entities.sites.progress(s.world, b, 1) >= 1);
}, [GX, GY], { timeout: 240000, polling: 500 });
await S(() => window.session().conn.setSpeed(1));
await sleep(1500);
const fin = {
  gate: await count('asset:gate_stone:', 'spAsset:final'),
  arm: await count('asset:wall_high_arm:', 'spAsset:final'),
  post: await count('asset:wall_high_post:', 'spAsset:final'),
  stub: await count('asset:wall_high_stub:', 'spAsset:final'),
  procGate: await S(() => window.session().entities.bldMeshes[44]?.count ?? 0),
};
ok('fertig: Tor, Mauerarme, Pfosten und Einzelpfeiler als GLB, kein prozedurales Tor', fin.gate >= 1 && fin.arm >= 10 && fin.post >= 10 && fin.stub >= 1 && fin.procGate === 0, JSON.stringify(fin));
await shot('3_fertig');
await look(GX + 2, GY + 1.5, 9, -0.35);
await sleep(1500);
await shot('4_tor_nah');

// Truppen durch das Tor (Süden -> Norden)
await q.dev('spawn', { type: 8, owner: 0, n: 8, x: GX + 1, y: GY + 4.2, stance: 0 });
let ids = [];
for (let k = 0; k < 30 && ids.length < 6; k++) {
  await sleep(700);
  ids = await S(() => {
    const w = window.session().world;
    const r = [];
    for (let s = 0; s < w.top; s++) if (w.ids[s] && w.owner[s] === 0 && w.type[s] === 8) r.push(w.ids[s]);
    return r;
  });
}
ok('Truppen vor dem Tor erschienen', ids.length >= 6, ids.length);
await S(([ids, x, y]) => window.session().send({ c: 'move', units: ids, x, y }), [ids, GX + 2, GY - 4]);
let opened = 0;
let through = 0;
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  const st = await S(([ids, gy]) => {
    const s = window.session();
    const w = s.world;
    let n = 0;
    for (let i = 0; i < w.top; i++) if (ids.includes(w.ids[i]) && w.curY[i] < gy - 0.5) n++;
    let open = 0;
    for (const [, v] of s.entities.gateP ?? []) open = Math.max(open, v);
    return { n, open };
  }, [ids, GY]);
  opened = Math.max(opened, st.open);
  through = st.n;
  if (opened > 0.5 && !q.result.notes.openShot) {
    q.note('openShot', true);
    await shot('5_tor_offen');
  }
  if (through >= ids.length - 1) break;
  await sleep(800);
}
ok('Fallgitter hebt sich für eigene Truppen (Öffnungsgrad > 0,5)', opened > 0.5, opened.toFixed(2));
ok('Truppen laufen durch das Tor', through >= ids.length - 2, `${through}/${ids.length}`);

// Auswahl und Hover-Kontur am Tor
const bid = await S(([x, y]) => [...window.session().world.buildings.values()].find((b) => b.x === x && b.y === y && b.t === 44)?.i, [GX, GY]);
await S((id) => window.session().setSelection([], id), bid);
await look(GX + 2, GY + 1.5, 12, -0.35);
await sleep(1200);
const p1 = await S(([x, y]) => {
  const s = window.session();
  const cam = s.gs.cam.camera;
  const v = cam.position.clone().set(x, 0.2, y).project(cam);
  const r = s.gs.canvas.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [GX + 0.7, GY + 1.5]);
await page.mouse.move(p1.x - 6, p1.y - 4);
await sleep(600);
await page.mouse.move(p1.x, p1.y);
await sleep(2500);
const sel = await S(() => {
  const s = window.session();
  const e = s.entities;
  const m = window.__assets.forBuilding(44);
  return { frames: e.frames.count, hover: e.hoverLines.visible, edgesFromAsset: !!m && e.hoverLines.geometry === m.cache.edges };
});
ok('Auswahlrahmen und Hover-Kontur (GLB) am Tor', sel.frames >= 4 && sel.hover && sel.edgesFromAsset, JSON.stringify(sel));
await shot('6_auswahl');

process.exit(await q.finish());
