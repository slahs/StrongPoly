#!/usr/bin/env node
/**
 * „Nachher“-Aufnahmen des zusammengeführten Stands mit denselben Kameras wie die „Vorher“-Bilder unter docs/phase4/before/
 * (Figuren: catalog/army, Gebäude: showcase/settlement/castle). Ausgabe JPEG, Mittel, 1280x720.
 *   node scripts/qa/compare_shots.mjs --set=units|buildings|settlement|castle|all [--out=docs/phase4/final]
 * Die Welt-Szenen (`?shots=`) liefert `node scripts/shots.mjs --out=docs/phase4/final/world --quality=medium --format=jpg`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startQA, sleep, args, root } from './lib.mjs';

const out = path.resolve(String(args.out ?? path.join(root, 'docs', 'phase4', 'final')));
const set = String(args.set ?? 'all');
const want = (n) => set === 'all' || set.split(',').includes(n);
const settle = async (page, n = 3) => {
  for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
};
async function shot(q, dir, name, wait = 400) {
  await settle(q.page, 3);
  await sleep(wait);
  fs.mkdirSync(dir, { recursive: true });
  await q.page.screenshot({ path: path.join(dir, `${name}.jpg`), type: 'jpeg', quality: 80 });
  console.log('Bild', path.join(path.basename(dir), name));
}
const hideOverlay = (page) =>
  page.evaluate(() => {
    const ov = document.querySelector('div[style*="monospace"]');
    if (ov) ov.style.display = 'none';
  });

// ---------- Figuren (Katalog und Heer, ?bench&showcase=units) ----------
if (want('units')) {
  const dir = path.join(out, 'units');
  const q = await startQA('compare_units', { query: 'bench&still=1&warm=100000&showcase=units&labels=1&quality=medium', waitGame: false, settings: null });
  await q.page.waitForFunction(() => window.__bench && window.__bench.ready, null, { timeout: 90000 });
  await sleep(2500);
  await hideOverlay(q.page);
  const cx = 64;
  const cy = 64;
  const N = 26;
  const colPos = (c, v = 0) => {
    const u = (c - (N - 1) / 2) * 2.3;
    const k = Math.SQRT1_2;
    return [cx + (u + v) * k, cy + (v - u) * k];
  };
  const cam = async (x, y, d) => {
    await q.page.evaluate(([x, y, d]) => window.__bench.setCamera(x, y, d), [x, y, d]);
    await sleep(1200);
  };
  const per = 6;
  for (let g = 0; g * per < N; g++) {
    const c = g * per + (per - 1) / 2;
    await cam(...colPos(Math.min(c, N - 1 - (per - 1) / 2), 0.9), 16);
    await shot(q, dir, `catalog_near_${g + 1}`);
  }
  await cam(...colPos((N - 1) / 2, 0), 46);
  await shot(q, dir, 'catalog_far');
  await cam(...colPos(N * 0.25, 0), 26);
  await shot(q, dir, 'catalog_mid');
  await q.finish();
  const a = await startQA('compare_army', { query: 'bench&still=1&warm=100000&units=600&quality=medium&seed=2', waitGame: false, settings: null });
  await a.page.waitForFunction(() => window.__bench && window.__bench.ready, null, { timeout: 90000 });
  await sleep(11000);
  await hideOverlay(a.page);
  for (const [name, x, y, d] of [['army_mid', cx - 6, cy, 26], ['army_far', cx - 6, cy, 46], ['army_near', cx - 8, cy + 1, 14]]) {
    await a.page.evaluate(([x, y, d]) => window.__bench.setCamera(x, y, d), [x, y, d]);
    await sleep(1200);
    await shot(a, dir, name);
  }
  await a.finish();
}

// ---------- Gebäude (?bench&showcase=buildings) ----------
if (want('buildings')) {
  const dir = path.join(out, 'buildings');
  const q = await startQA('compare_buildings', { query: 'bench&showcase=buildings&still=1&quality=medium&secs=3600', waitGame: false, settings: null });
  await q.page.waitForFunction(() => window.__bench && window.__bench.ready, null, { timeout: 90000 });
  await sleep(5000);
  await q.page.evaluate(() => {
    const b = window.__bench;
    window.__focus = (t, d, yaw = 0) => {
      for (const x of b.world.buildings.values())
        if (x.t === t) {
          b.scene.cam.yawIndex = yaw;
          b.setCamera(x.x + x.w / 2, x.y + x.h / 2, d);
          return [x.x, x.y];
        }
      return null;
    };
  });
  await hideOverlay(q.page);
  // Typnummern: shared/src/data/buildings.ts
  const shots = [
    ['showcase_00_overview', 'cam', 78], ['showcase_01_keep', 0, 16], ['showcase_02_keep_far', 0, 40], ['showcase_03_mill', 16, 11], ['showcase_05_smith', 22, 10],
    ['showcase_09_church', 27, 14], ['showcase_10_cathedral', 28, 16], ['showcase_11_barracks', 53, 14], ['showcase_12_towers', 41, 14], ['showcase_13_gates', 44, 14],
    ['showcase_15_roundtower', 42, 16], ['showcase_16_quarry', 7, 11], ['showcase_19_misc', 34, 12],
  ];
  for (const [name, t, d] of shots) {
    if (t === 'cam') await q.page.evaluate(([d]) => { const b = window.__bench; b.scene.cam.yawIndex = 0; b.setCamera(b.world.map.w / 2, b.world.map.h / 2 - 2, d); }, [d]);
    else if (!(await q.page.evaluate(([t, d]) => window.__focus(t, d, 0), [t, d]))) continue;
    await shot(q, dir, name, 300);
  }
  await q.finish();
}

// ---------- Siedlung und Burg im laufenden Spiel (?quick=1&dev=1) ----------
async function gameScene(kind) {
  const dir = path.join(out, 'buildings');
  const q = await startQA(`compare_${kind}`, { query: 'quick=1&dev=1&seed=1&quality=medium', settings: { quality: 'medium', shadows: true } });
  const { page } = q;
  await page.evaluate(() => {
    const ui = document.getElementById('ui');
    if (ui) ui.style.display = 'none';
    const S = window.session();
    window.__S = S;
    window.__occ = new Uint8Array(S.world.map.n);
    window.__build = (type, x, y, rot = 0) => S.conn.dev('build', { owner: 0, type, x, y, rot });
    window.__cam = (x, y, d, yaw = 0) => {
      S.gs.cam.yawIndex = yaw;
      S.gs.cam.lookAt(x, y);
      S.gs.cam.dist = d;
      S.gs.cam.distTarget = d;
    };
    window.__keep = () => {
      const p = S.world.players[0];
      return [p.keepX, p.keepY];
    };
    window.__free = (x, y, w, h, m) => {
      const mp = S.world.map;
      const h0 = mp.height[mp.idx(x, y)];
      for (let yy = y - m; yy < y + h + m; yy++)
        for (let xx = x - m; xx < x + w + m; xx++) {
          if (!mp.inBounds(xx, yy)) return false;
          const i = mp.idx(xx, yy);
          if (mp.terrain[i] > 2 || mp.trees[i] || S.world.bldAt[i] || window.__occ[i]) return false;
          if (Math.abs(mp.height[i] - h0) > 0) return false;
        }
      return true;
    };
    window.__mark = (x, y, w, h) => {
      const mp = S.world.map;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) window.__occ[mp.idx(xx, yy)] = 1;
    };
    window.__ring = (list, cx, cy, gap = 1, rmin = 4) => {
      const placed = [];
      for (const [type, w, h] of list) {
        let ok = false;
        for (let r = rmin; r < 40 && !ok; r += 1) {
          const steps = Math.max(8, Math.floor(r * 6));
          for (let k = 0; k < steps && !ok; k++) {
            const a = (k / steps) * Math.PI * 2 + r * 0.37;
            const x = Math.round(cx + Math.cos(a) * r * 1.25 - w / 2);
            const y = Math.round(cy + Math.sin(a) * r - h / 2);
            if (window.__free(x, y, w, h, gap)) {
              window.__mark(x, y, w, h);
              window.__build(type, x, y, 0);
              placed.push([type, x, y]);
              ok = true;
            }
          }
        }
      }
      return placed;
    };
  });
  const [kx, ky] = await page.evaluate(() => window.__keep());
  const cam = (x, y, d, yaw = 0) => page.evaluate(([x, y, d, yaw]) => window.__cam(x, y, d, yaw), [x, y, d, yaw]);
  await q.dev('gold', { owner: 0, n: 9000 });
  for (let r = 0; r <= 9; r++) await q.dev('res', { owner: 0, res: r, n: 500 });
  if (kind === 'settlement') {
    const T = { Hovel: 2, Stockpile: 3, Granary: 4, Armory: 5, Woodcutter: 6, Wheat: 14, Hops: 15, Apple: 11, Dairy: 12, Hunter: 13, Mill: 16, Bakery: 17, Brewery: 18, Inn: 19, Fletcher: 20, Tanner: 23, Smith: 22, Market: 25, Chapel: 26, Church: 27, Well: 29, Garden: 31, Statue: 32, Maypole: 33, Barracks: 53, Merc: 54, Stable: 55, Guild: 56 };
    const list = [
      [T.Stockpile, 3, 3], [T.Granary, 3, 3], [T.Hovel, 2, 2], [T.Hovel, 2, 2], [T.Hovel, 2, 2], [T.Hovel, 2, 2], [T.Woodcutter, 2, 2], [T.Woodcutter, 2, 2],
      [T.Mill, 3, 3], [T.Bakery, 3, 3], [T.Brewery, 3, 3], [T.Inn, 3, 3], [T.Smith, 3, 3], [T.Fletcher, 3, 3], [T.Tanner, 3, 3], [T.Market, 3, 3], [T.Armory, 3, 3],
      [T.Chapel, 2, 3], [T.Church, 3, 4], [T.Well, 1, 1], [T.Well, 1, 1], [T.Garden, 2, 2], [T.Statue, 2, 2], [T.Maypole, 2, 2], [T.Hovel, 2, 2], [T.Hovel, 2, 2],
      [T.Barracks, 4, 4], [T.Wheat, 5, 5], [T.Apple, 4, 4], [T.Dairy, 4, 4], [T.Hops, 4, 4], [T.Hunter, 2, 2], [T.Stable, 4, 3], [T.Guild, 4, 4], [T.Merc, 3, 3],
    ];
    const placed = await page.evaluate(([list, kx, ky]) => window.__ring(list, kx, ky, 1, 5), [list, kx, ky]);
    console.log('platziert', placed.length, '/', list.length);
    await q.speed(4);
    await q.waitTick((await q.tick()) + 500, 300000);
    await q.speed(1);
    await cam(kx, ky, 46);
    await shot(q, dir, 'settlement_settlement_far', 800);
    await cam(kx, ky, 30);
    await shot(q, dir, 'settlement_settlement_mid', 800);
    await cam(kx + 6, ky + 4, 20, 1);
    await shot(q, dir, 'settlement_settlement_close', 800);
    await cam(kx - 6, ky - 6, 17, 3);
    await shot(q, dir, 'settlement_settlement_close2', 800);
  } else {
    const T = { WallHigh: 39, WallLow: 38, WallWood: 37, TowerGuard: 41, TowerRound: 42, TowerLook: 40, GateStone: 44, GateWood: 43, Barracks: 53, Guild: 56, Cauldron: 50 };
    const r = 13;
    const bd = (t, x, y, rot = 0) => page.evaluate(([t, x, y, rot]) => window.__build(t, x, y, rot), [t, x, y, rot]);
    const x0 = Math.round(kx) - r;
    const x1 = Math.round(kx) + r;
    const y0 = Math.round(ky) - r;
    const y1 = Math.round(ky) + r;
    for (let x = x0 + 2; x <= x1 - 2; x++) {
      const gap = x >= Math.round(kx) - 2 && x <= Math.round(kx) + 1;
      await bd(T.WallHigh, x, y0);
      if (!gap) await bd(x < kx ? T.WallHigh : T.WallLow, x, y1);
    }
    for (let y = y0 + 2; y <= y1 - 2; y++) {
      await bd(y < ky ? T.WallHigh : T.WallLow, x0, y);
      await bd(y < ky ? T.WallWood : T.WallHigh, x1, y);
    }
    await bd(T.GateStone, Math.round(kx) - 2, y1 - 1);
    await bd(T.TowerRound, x0 - 1, y0 - 1);
    await bd(T.TowerGuard, x1 - 1, y0 - 1);
    await bd(T.TowerGuard, x0 - 1, y1 - 1);
    await bd(T.TowerRound, x1 - 1, y1 - 1);
    await bd(T.TowerLook, Math.round(kx) - 1, y0 - 1);
    await bd(T.Barracks, x0 + 3, y0 + 3);
    await bd(T.Guild, x1 - 7, y0 + 3);
    await bd(T.GateWood, x1 - 1, Math.round(ky) - 1, 1);
    await bd(T.Cauldron, x0 + 2, y1 - 3);
    await q.speed(4);
    await q.waitTick((await q.tick()) + 300, 300000);
    await q.speed(1);
    await page.evaluate(() => {
      for (const b of window.__S.world.buildings.values()) if (b.t === 42) window.__S.conn.dev('turret', { x: b.x, y: b.y, kind: b.x < 100 ? 1 : 2 });
    });
    await sleep(1500);
    await cam(kx, ky, 48);
    await shot(q, dir, 'castle_castle_far', 800);
    await cam(kx, ky, 30);
    await shot(q, dir, 'castle_castle_mid', 800);
    await cam(x1 - 2, y1 - 1, 16, 0);
    await shot(q, dir, 'castle_castle_gate_tower', 800);
    await cam(x0 + 2, y0 + 2, 15, 1);
    await shot(q, dir, 'castle_castle_corner', 800);
    await cam(kx, ky, 17, 0);
    await shot(q, dir, 'castle_castle_keep', 800);
  }
  await q.finish();
}
if (want('settlement')) await gameScene('settlement');
if (want('castle')) await gameScene('castle');
process.exit(0);
