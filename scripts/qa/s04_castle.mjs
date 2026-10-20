#!/usr/bin/env node
/**
 * Szenario 4: Größere Burg mit Mauern und Torhaus bauen (echte Befehle `place`/`placeLine`), Mauerbau-Welle beobachten,
 * Türme, Treppe und Geschütz setzen, Einheiten über Tor, Treppe und Mauerkrone laufen lassen.
 *   node scripts/qa/s04_castle.mjs
 */
import { startQA, sleep, args } from './lib.mjs';

// --fast: Stufe Niedrig, 640x360 (mehr Bilder je Sekunde, aussagekräftigere Bewegungskennzahlen); --legacy: altes Bewegungsverhalten zum Vergleich
const fast = !!args.fast;
const legacy = !!args.legacy;

const BT = { Hovel: 2, Stockpile: 3, WallHigh: 39, TowerGuard: 41, TowerRound: 42, GateStone: 44, Stairs: 46, Barracks: 53, TurretBallista: 51 };
const q = await startQA(`s04_castle${fast ? '_fast' : ''}${legacy ? '_legacy' : ''}`, {
  query: `quick=1&dev=1&size=128&seed=${args.seed ?? 6}${fast ? "&motiondebug" : ""}${legacy ? '&motionlegacy=1' : ''}`,
  viewport: fast ? { width: 640, height: 360 } : { width: 1280, height: 720 },
  settings: fast ? { quality: 'low', shadows: false } : { quality: 'medium', shadows: true },
});
const { page, S, ok } = q;
await q.dev('gold', { owner: 0, n: 9000 });
for (const r of [0, 1, 2, 3, 4, 5]) await q.dev('res', { owner: 0, res: r, n: 3000 });
await q.waitTick(30);

// ebene, freie Fläche für die Burg suchen
const site = await S(() => {
  const s = window.session();
  const w = s.world;
  const m = w.map;
  const k = w.players[0];
  // Rechteck mit wenigen blockierten Feldern (Bäume, Felsen, Wasser) und geringer Höhenspanne, nahe am Bergfried
  const tryRect = (rw, rh, maxBad) => {
    let best = null;
    const en = w.players[1];
    for (let y0 = 3; y0 < m.h - rh - 3; y0 += 2)
      for (let x0 = 3; x0 < m.w - rw - 3; x0 += 2) {
        // in Reichweite des eigenen Bergfrieds, außerhalb des Bauverbots um den Gegner
        const dEnemy = Math.hypot(x0 + rw / 2 - en.keepX, y0 + rh / 2 - en.keepY);
        if (dEnemy < 45 || Math.hypot(x0 + rw / 2 - k.keepX, y0 + rh / 2 - k.keepY) > 45) continue;
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
        const d = Math.hypot(x0 + rw / 2 - k.keepX, y0 + rh / 2 - k.keepY);
        if (bad > maxBad || hi - lo > 2) continue;
        const sc = bad * 6 + (hi - lo) * 40 + d * 0.5;
        if (!best || sc < best.sc) best = { sc, x0, y0, rw, rh, bad };
      }
    return best;
  };
  return tryRect(34,26,8) ?? tryRect(28,22,8) ?? tryRect(24,18,8);
});
console.log('Burgplatz', JSON.stringify(site));
ok('Ebene Fläche für die Burg gefunden', !!site, JSON.stringify(site));
const { x0: SX, y0: SY, rw, rh } = site;
const X0 = SX + 2;
const X1 = SX + rw - 3;
const Y0 = SY + 2;
const Y1 = SY + rh - 3;
const cx = (X0 + X1) >> 1;
// Lagerkapazität: dev('res') füllt höchstens bis zur Lagergrenze (150 je Ware) – vor jedem Bauauftrag Stein und Holz auffüllen
const topUp = async () => {
  await q.dev('res', { owner: 0, res: 1, n: 150 });
  await q.dev('res', { owner: 0, res: 0, n: 150 });
};
const place = async (type, x, y, rot = 0) => {
  await topUp();
  return placeRaw(type, x, y, rot);
};
const placeRaw = (type, x, y, rot = 0) => S(([t, x, y, r]) => window.session().send({ c: 'place', type: t, x, y, rot: r }), [type, x, y, rot]);
const line = async (type, x1, y1, x2, y2) => {
  await topUp();
  return lineRaw(type, x1, y1, x2, y2);
};
const lineRaw = (type, x1, y1, x2, y2) => S(([t, a, b, c, d]) => window.session().send({ c: 'placeLine', type: t, x1: a, y1: b, x2: c, y2: d }), [type, x1, y1, x2, y2]);

// Kamera auf die Burg, langsam, damit die Mauerwelle sichtbar wird
await S(([cx, cy]) => {
  const s = window.session();
  s.gs.cam.lookAt(cx, cy);
  s.gs.cam.dist = 40;
  s.gs.cam.distTarget = 40;
  s.conn.setSpeed(0.5);
}, [cx, (Y0 + Y1) >> 1]);
// Türme zuerst, dann Tor und Mauerzüge (Mauern lassen belegte Felder aus)
for (const [x, y] of [[X0 - 2, Y0 - 2], [X1 - 1, Y0 - 2], [X0 - 2, Y1 - 1], [X1 - 1, Y1 - 1]]) await place(BT.TowerRound, x, y);
await place(BT.TowerGuard, cx - 1, Y0 - 1);
await place(BT.TowerGuard, X0 - 1, (Y0 + Y1) >> 1);
await place(BT.TowerGuard, X1 - 1, (Y0 + Y1) >> 1);
await place(BT.GateStone, cx - 2, Y1 - 1);
await sleep(2500);
await q.shot('1_tuerme_tor');
const t0 = await q.tick();
// Sim anhalten, alle Mauerzüge einreichen, dann mit 0,25-facher Geschwindigkeit loslaufen lassen: die Welle (höchstens ~2,4 s Spielzeit)
// wird sonst von den langsamen Bildern (Software-GL) verschluckt, bevor das erste Bild entsteht
await S(() => window.session().conn.setPaused(true));
await line(BT.WallHigh, X0, Y0, X1, Y0);
await line(BT.WallHigh, X0, Y1, X1, Y1);
await line(BT.WallHigh, X0, Y0, X0, Y1);
await line(BT.WallHigh, X1, Y0, X1, Y1);
await S(() => {
  window.session().conn.setSpeed(0.25);
  window.session().conn.setPaused(false);
});
// Mauerwelle: Bildserie + Fortschritt der Mauerstücke
const wave = [];
for (let i = 0; i < (fast ? 40 : 6); i++) {
  const info = await S(() => {
    const s = window.session();
    const w = s.world;
    let n = 0;
    let done = 0;
    let part = 0;
    for (const b of w.buildings.values()) {
      if (b.t !== 39 || b.o !== 0) continue;
      n++;
      const p = s.entities.sites.progress(w, b, 1);
      if (p >= 1) done++;
      else if (p > 0) part++;
    }
    return { tick: w.tick, walls: n, done, part };
  });
  wave.push(info);
  if (!fast || i % 3 === 0) await q.shot(`2_mauerwelle_${i}`);
  if (info.walls > 20 && info.done === info.walls) break;
}
console.log('Mauerwelle', JSON.stringify(wave));
q.result.data.wallWave = wave;
const last = wave[wave.length - 1];
ok('Mauern entstehen als zusammenhängender Zug (≥ 20 Stücke aus vier Linien, alle fertig)', last.walls >= 20 && last.done === last.walls, JSON.stringify(last));
// Unter Software-GL in Mittel/1280x720 dauert ein Bild mehrere Sekunden und die Welle ist vorbei, bevor das erste Bild fertig ist;
// die Zwischenzustände werden deshalb im Lauf --fast (Niedrig, 640x360) geprüft, in dem die Bildrate dafür reicht
if (fast) ok('Mauerwelle zeigt Zwischenzustände (Stücke teils fertig, teils im Bau)', wave.some((w) => w.part > 0 && w.done < w.walls), JSON.stringify(wave));

// Treppe an die Innenseite der Nordmauer, Geschütz auf den Nordwest-Turm, Hofgebäude
await place(BT.Stairs, X0 + 6, Y0 + 1);
await place(BT.Stairs, X0 + 7, Y0 + 1);
await place(BT.Barracks, X0 + 4, Y0 + 4);
await place(BT.Stockpile, X1 - 8, Y0 + 4);
await place(BT.Hovel, X1 - 8, Y1 - 6);
await sleep(1500);
await place(BT.TurretBallista, X0 - 2, Y0 - 2);
await S(() => window.session().conn.setSpeed(2));
await q.waitTick(t0 + 450, 120000);
const st = await S(() => {
  const w = window.session().world;
  const c = {};
  for (const b of w.buildings.values()) if (b.o === 0) c[b.t] = (c[b.t] ?? 0) + 1;
  const tur = [...w.buildings.values()].filter((b) => b.o === 0 && b.t === 42).map((b) => b.u);
  return { c, tur };
});
console.log(JSON.stringify(st));
ok('Burg steht: 4 große Türme, 3 Wachtürme, Tor, Treppen', st.c[42] === 4 && st.c[41] === 3 && st.c[44] === 1 && (st.c[46] ?? 0) >= 1, JSON.stringify(st.c));
ok('Geschütz auf Großem Turm gesetzt', st.tur.some((u) => u > 0), JSON.stringify(st.tur));

// Einheiten: 16 Schwertkämpfer im Hof, durch das Tor hinaus, wieder herein, dann über die Treppe auf die Mauer
await q.dev('spawn', { type: 8, owner: 0, n: 16, x: cx - 4, y: Y0 + 8, stance: 0 });
await q.dev('spawn', { type: 3, owner: 0, n: 8, x: cx + 2, y: Y0 + 8, stance: 0 });
await S(() => {
  window.session().conn.setSpeed(1);
  window.__motion.resetMeter();
});
await sleep(2500);
const mine = () =>
  S(() => {
    const w = window.session().world;
    const r = [];
    for (let s = 0; s < w.top; s++) if (w.ids[s] && w.owner[s] === 0 && (w.type[s] === 8 || w.type[s] === 3)) r.push([w.ids[s], w.curX[s], w.curY[s], w.type[s]]);
    return r;
  });
let units = await mine();
ok('24 Soldaten im Hof', units.length === 24, units.length);
const ids = units.map((u) => u[0]);
const move = (x, y, extra = {}) => S(([ids, x, y, e]) => window.session().send({ c: 'move', units: ids, x, y, ...e }), [ids, x, y, extra]);
const cross = [];
const watch = async (label, secs, pred) => {
  const t = Date.now();
  let hit = 0;
  while (Date.now() - t < secs * 1000) {
    const u = await mine();
    hit = u.filter(pred).length;
    if (hit >= u.length - 2) break;
    await sleep(700);
  }
  cross.push({ label, hit, secs: +((Date.now() - t) / 1000).toFixed(1) });
  return hit;
};
// hinaus (Süden, hinter dem Tor): ein begehbares, freies Feld 5–10 Felder hinter dem Tor suchen
const out = await S(([cx, y1]) => {
  const w = window.session().world;
  const m = w.map;
  for (let d = 5; d <= 12; d++)
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx;
      const y = y1 + d;
      const i = m.idx(x, y);
      if (m.inBounds(x, y) && m.walkable(i) && !w.bldAt[i] && m.trees[i] === 0) return { x, y };
    }
  return null;
}, [cx, Y1]);
console.log('Ziel hinter dem Tor', JSON.stringify(out));
await S((v) => window.session().conn.setSpeed(v), fast ? 1 : 2);
await move(out.x, out.y);
await q.shot('3_vor_dem_tor');
const outN = await watch("durch das Tor hinaus", fast ? 110 : 70, (u) => u[2] > Y1 + 3);
await q.shot('4_vor_dem_tor_draussen');
ok('Truppen passieren das Torhaus nach außen (≥ 16 von 24 binnen 70 s Realzeit bei 2-facher Geschwindigkeit)', outN >= 16, `${outN}/24`);
// wieder herein
await move(cx, Y0 + 9);
const inn = await watch('durch das Tor herein', 80, (u) => u[2] < Y1 - 1);
ok('Truppen passieren das Torhaus nach innen', inn >= 20, `${inn}/24`);
// auf die Mauerkrone über die Treppe: Ziel auf der Nordmauer (Wehrgang)
await move(X0 + 12, Y0);
await S(() => window.session().conn.setSpeed(1));
const top = await watch('Treppe hinauf auf die Mauerkrone', 70, (u) => Math.abs(u[2] - Y0) < 1.2 && u[1] > X0 + 6);
await q.shot('5_auf_der_mauer');
ok('Mindestens ein Teil der Truppen erreicht die Mauerkrone über die Treppe', top >= 3, `${top}/24`);
// Hinweis zum Blick: nah an die Treppe
await S(([x, y]) => {
  const c = window.session().gs.cam;
  window.session().gs.cam.lookAt(x, y);
  c.dist = 14;
  c.distTarget = 14;
}, [X0 + 8, Y0 + 2]);
await sleep(2500);
await q.shot('6_treppe_nah');
const rep = await S(() => window.__motion.report());
q.result.data.motion = rep;
q.result.data.cross = cross;
console.log(JSON.stringify(cross), JSON.stringify(rep));
console.log('Bewegungskennzahlen Tor/Treppe', fast ? '(schnell)' : '(Mittel, wenige FPS)', legacy ? 'ALT' : 'NEU', JSON.stringify(rep));
// Die Kennzahlen hängen an der Bildrate (Software-GL: 1–5 FPS); bindend ist der Lauf --fast, der Vergleich steht in PROGRESS-4.md
if (fast) ok('Bewegung über Tor/Treppe: Sprünge < 3 %, Rückwärtsschritte < 3 %', rep.jumpPct < 3 && rep.backPct < 3, `Sprung ${rep.jumpPct.toFixed(2)} %, rückwärts ${rep.backPct.toFixed(2)} %`);
process.exit(await q.finish());
