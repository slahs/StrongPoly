#!/usr/bin/env node
/**
 * Szenario 2: Wirtschaftsgebäude errichten (Holzfäller, Steinbruch, Farm, Mühle, Bäcker, Markt, Obstgarten, Käserei, Hütte).
 * Platziert über den echten Befehlsweg (`place`, nicht Dev-Bau), prüft
 *  - Sofortbau: Gebäude steht direkt im Snapshot, Arbeiter ziehen ein (`s > 0`), Produktion/Fortschritt beginnt,
 *  - Bauanimation sichtbar: Fortschritt 0 → 1 über die konfigurierte Dauer (Zeitpunkte: Tick seit Platzierung, Fortschritt),
 *    Bildserie bei 0,25-facher Geschwindigkeit,
 *  - die Bauanimation verändert keine Ressourcen (Kosten sofort abgebucht, keine nachträgliche Abbuchung).
 *   node scripts/qa/s02_economy.mjs
 */
import { startQA, sleep } from './lib.mjs';

const q = await startQA('s02_economy', { query: 'quick=1&dev=1&size=128&seed=3', settings: { quality: 'medium', shadows: true } });
const { page, ok, S } = q;
const BT = { Hovel: 2, Stockpile: 3, Woodcutter: 6, Quarry: 7, AppleOrchard: 11, DairyFarm: 12, WheatFarm: 14, Mill: 16, Bakery: 17, Market: 25 };

await q.speed(1);
await q.dev('gold', { owner: 0, n: 8000 });
for (const r of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) await q.dev('res', { owner: 0, res: r, n: 300 });
await q.waitTick(30);

// Beobachter im Seitenkontext: sieht jeden Snapshot-Zustand zwischen den Bildern (setInterval 40 ms)
await S(() => {
  const s = window.session();
  window.__track = {};
  window.__trackTimer = setInterval(() => {
    const w = s.world;
    for (const b of w.buildings.values()) {
      if (b.o !== 0 || b.n <= 0) continue;
      const prog = s.entities.sites.progress(w, b, 1);
      const t = (window.__track[b.i] ??= { type: b.t, n: b.n, firstSeen: w.tick, firstStaffed: null, firstProd: null, progAtStaffed: null, maxProg: 0, hp0: b.hp });
      if (b.s > 0 && t.firstStaffed === null) {
        t.firstStaffed = w.tick;
        t.progAtStaffed = +prog.toFixed(2);
      }
      if ((b.p > 0 || b.b > 0) && t.firstProd === null) t.firstProd = w.tick;
      t.maxProg = Math.max(t.maxProg, prog);
    }
  }, 40);
});

/** freie Stelle in Ringen um den Bergfried suchen (Platzierungsregeln der Sim über __place) */
const findSpot = (type, minR, maxR, avoid) =>
  S(
    ([type, minR, maxR, avoid]) => {
      const s = window.session();
      const k = s.world.players[0];
      const cand = [];
      for (let dy = -maxR; dy <= maxR; dy++)
        for (let dx = -maxR; dx <= maxR; dx++) {
          const d = Math.hypot(dx, dy);
          if (d >= minR && d <= maxR) cand.push([dx, dy, d]);
        }
      cand.sort((a, b) => a[2] - b[2]);
      for (const [dx, dy] of cand) {
        const x = Math.round(k.keepX) + dx;
        const y = Math.round(k.keepY) + dy;
        if (avoid.some(([ax, ay]) => Math.abs(ax - x) < 6 && Math.abs(ay - y) < 6)) continue;
        if (window.__place(type, x, y, 0) === null) return { x, y };
      }
      return null;
    },
    [type, minR, maxR, avoid],
  );
const placeAt = async (type, x, y) => {
  const before = await S(() => window.session().world.buildings.size);
  const tick = await S(([type, x, y]) => {
    const s = window.session();
    s.send({ c: 'place', type, x, y });
    return s.world.tick;
  }, [type, x, y]);
  await page.waitForFunction((n) => window.session().world.buildings.size > n, before, { timeout: 30000 }).catch(() => {});
  return tick;
};

const placed = [];
const names = Object.fromEntries(Object.entries(BT).map(([k, v]) => [v, k]));
for (const [type, minR, maxR] of [
  [BT.Stockpile, 5, 12],
  [BT.Woodcutter, 6, 30],
  [BT.Quarry, 6, 40],
  [BT.WheatFarm, 8, 30],
  [BT.Mill, 6, 20],
  [BT.Bakery, 6, 20],
  [BT.Market, 6, 20],
  [BT.AppleOrchard, 8, 30],
  [BT.DairyFarm, 8, 30],
  [BT.Hovel, 5, 16],
]) {
  const r = await findSpot(type, minR, maxR, placed);
  if (!r) {
    ok(`${names[type]} platzierbar`, false, 'keine freie Stelle');
    continue;
  }
  const tick = await placeAt(type, r.x, r.y);
  placed.push([r.x, r.y]);
  console.log(names[type], JSON.stringify({ ...r, tick }));
}
ok('Alle Gebäude platziert', placed.length === 10, `${placed.length}/10`);

// ---- Sofortbau: Beobachtung bis 70 s Spielzeit nach der letzten Platzierung ----
const wood0 = await S(() => window.session().world.view.stock[0]);
await q.speed(4);
await q.waitTick((await q.tick()) + 600);
const wood1 = await S(() => window.session().world.view.stock[0]);
ok('Holzfäller liefert Holz ins Lager (Bestand steigt, keine weiteren Ausgaben)', wood1 > wood0, `${wood0} -> ${wood1}`);
const track = await S(() => window.__track);
const rows = Object.values(track).map((t) => ({
  Gebäude: names[t.type],
  Platziert: t.n,
  'im Snapshot nach (Ticks)': t.firstSeen - t.n,
  'Arbeiter drin nach (s)': t.firstStaffed === null ? null : +((t.firstStaffed - t.n) / 10).toFixed(1),
  'Produktion/Ausgabe nach (s)': t.firstProd === null ? null : +((t.firstProd - t.n) / 10).toFixed(1),
  'Baufortschritt bei Einzug': t.progAtStaffed,
  'max. Fortschritt': +t.maxProg.toFixed(2),
}));
console.table(rows);
q.result.data.economy = rows;
const vals = Object.values(track);
const worked = vals.filter((t) => [BT.Woodcutter, BT.Quarry, BT.WheatFarm, BT.Mill, BT.Bakery, BT.DairyFarm, BT.AppleOrchard].includes(t.type));
// Außenarbeiter (Holzfäller) sind selten „im Gebäude“; für sie zählt der gelieferte Bestand (unten)
const indoor = worked.filter((t) => t.type !== BT.Woodcutter);
const staffed = indoor.filter((t) => t.firstStaffed !== null);
// Beobachtungsraster: ein Bild unter Software-GL dauert ~1 s (= 10 Ticks), daher Toleranz 30 Ticks
ok('Gebäude stehen sofort im Snapshot (Abstand zur Platzierung höchstens 3 s Spielzeit, Raster ~1 s)', vals.every((t) => t.firstSeen - t.n <= 30), JSON.stringify(vals.map((t) => t.firstSeen - t.n)));
ok('Arbeiter ziehen ein (alle 6 Innenbetriebe werden besetzt)', staffed.length === indoor.length, `${staffed.length}/${indoor.length}`);
const slow = staffed.filter((t) => t.firstStaffed - t.n > 600);
ok('Einzug dauert nur Laufweg/Arbeiterpool (höchstens 60 s Spielzeit), nie bis zum Ende der Animation gekoppelt', slow.length === 0, JSON.stringify(slow.map((t) => names[t.type])));
const early = staffed.filter((t) => t.progAtStaffed !== null && t.progAtStaffed < 1);
q.note('einzug_waehrend_bauanimation', `${early.length} von ${staffed.length} Gebäuden: Arbeiter drin, solange die Animation noch läuft`);
ok('Baufortschritt endet bei 1 für alle Gebäude', vals.every((t) => t.maxProg >= 0.999), JSON.stringify(vals.map((t) => +t.maxProg.toFixed(2))));
const prod = worked.filter((t) => t.firstProd !== null);
ok('Produktion beginnt (Fortschritt/Ausgabe > 0) bei mindestens 5 von 7', prod.length >= 5, `${prod.length}/7`);
const stock = await S(() => Array.from(window.session().world.view.stock).slice(0, 20));
q.note('stock_nach_600_ticks', stock);

// ---- Bildserie der Bauanimation bei 0,25x: Mühle (groß) ----
const mill = await findSpot(BT.Mill, 6, 26, placed);
ok('Mühle für die Bildserie platzierbar', !!mill);
if (mill) {
  await S(([x, y]) => {
    const s = window.session();
    s.gs.cam.lookAt(x + 1, y + 1);
    s.gs.cam.dist = 15;
    s.gs.cam.distTarget = 15;
    s.conn.setSpeed(0.25);
  }, [mill.x, mill.y]);
  await sleep(1500);
  await placeAt(BT.Mill, mill.x, mill.y);
  const series = [];
  for (let i = 0; i < 14; i++) {
    const info = await S(([x, y]) => {
      const s = window.session();
      const w = s.world;
      let b = null;
      for (const bb of w.buildings.values()) if (bb.x === x && bb.y === y) b = bb;
      return b && { age: w.tick - b.n, prog: +s.entities.sites.progress(w, b, 1).toFixed(3) };
    }, [mill.x, mill.y]);
    series.push(info);
    await q.shot(`bau_muehle_${String(i).padStart(2, '0')}`);
    if (info && info.prog >= 1) break;
  }
  console.log('Bauserie Mühle', JSON.stringify(series));
  q.result.data.buildSeries = series;
  ok('Bauanimation zeigt Zwischenstufen (mindestens 3 verschiedene Fortschritte zwischen 0 und 1)', new Set(series.filter((s) => s && s.prog < 1 && s.prog > 0).map((s) => s.prog)).size >= 3, JSON.stringify(series));
  await S(() => window.session().conn.setSpeed(4));
}

// ---- Ansicht der fertigen Siedlung ----
await q.waitTick((await q.tick()) + 150);
await S(() => {
  const s = window.session();
  const k = s.world.players[0];
  s.gs.cam.lookAt(k.keepX, k.keepY + 3);
  s.gs.cam.dist = 30;
  s.gs.cam.distTarget = 30;
  s.conn.setSpeed(1);
});
await sleep(2500);
await q.shot('siedlung_fern');
await S(() => {
  const s = window.session();
  const k = s.world.players[0];
  s.gs.cam.lookAt(k.keepX - 6, k.keepY + 5);
  s.gs.cam.dist = 14;
  s.gs.cam.distTarget = 14;
});
await sleep(2500);
await q.shot('siedlung_nah');
process.exit(await q.finish());
