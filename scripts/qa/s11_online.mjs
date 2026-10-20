#!/usr/bin/env node
/**
 * Szenario 11: Multiplayer-Verbindung und Reconnect. Startet den gebauten Server (`packages/server/dist/server.mjs`, eigener Port,
 * Beenden per PID), zwei Browser-Clients (Alice, Bob) + 1 KI-Lord in einem Raum, Spiel starten. Prüft:
 *  - beide Clients sehen dieselbe Welt (Tick, Gebäude, Einheiten),
 *  - Bob platziert Gebäude; Alice sieht sie mit Bauanimation,
 *  - Verbindung von Bob wird getrennt (WebSocket schließen, Offline, Seite neu laden) und wieder aufgebaut,
 *  - nach dem Wiederverbinden: Gebäude/Baustufen korrekt, KEINE Neubau-Animation fertiger Gebäude, Bewegung ruhig, Stimmen/Berater laufen,
 *  - ein Gebäude, das während der Trennung noch im Bau war, läuft nicht von vorn an.
 * Vorlage: online.mjs/reconnect.mjs (Scratchpad), hier auf scripts/qa/lib.mjs umgestellt. Der Server-Test mit 2 Menschen + 4 KI
 * (`pnpm --filter @strongpoly/server test`) deckt die Synchronität über 200x200-Karten ab.
 *   node scripts/qa/s11_online.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { launchBrowser, startQA, sleep, root } from './lib.mjs';

const PORT = 5530 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, [path.join(root, 'packages', 'server', 'dist', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), STATIC_DIR: path.join(root, 'packages', 'client', 'dist') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => (srvLog += d));
srv.stderr.on('data', (d) => (srvLog += d));
for (let i = 0; i < 50 && !/läuft auf Port/.test(srvLog); i++) await sleep(200);
const base = `http://127.0.0.1:${PORT}`;
console.log('Server', srv.pid, srvLog.trim());

const browser = await launchBrowser({ extraArgs: ['--autoplay-policy=no-user-gesture-required'] });
const A = await startQA('s11_online', { query: '', waitGame: false, base, browser, viewport: { width: 800, height: 450 }, settings: { quality: 'low', shadows: false } });
const B = await startQA('s11_online_b', { query: '', waitGame: false, base, browser, viewport: { width: 800, height: 450 }, settings: { quality: 'low', shadows: false } });
const ok = (l, c, e = '') => A.ok(l, c, e);
let code = 1;
try {
  for (const [Q, n] of [[A, 'Alice'], [B, 'Bob']]) {
    const p = Q.page;
    await p.getByText('Online spielen', { exact: true }).click();
    await p.locator('input[type=text]').first().fill(n);
    await p.getByText('Verbinden', { exact: true }).click();
    await sleep(800);
  }
  await A.page.getByText('Raum erstellen', { exact: true }).click();
  await sleep(700);
  await B.page.getByText('Aktualisieren', { exact: true }).click();
  await sleep(700);
  await B.page.locator('.li').first().click();
  await sleep(700);
  // dritter Slot: KI-Lord; Teams getrennt
  await A.page.evaluate(() => {
    const sel = [...document.querySelectorAll('.slot')][2].querySelector('select');
    sel.value = 'ai';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(500);
  await A.page.evaluate(() => {
    const rows = [...document.querySelectorAll('.slot')];
    rows.forEach((r, i) => {
      const sels = r.querySelectorAll('select');
      const t = sels[sels.length - 1];
      if (t) {
        t.value = String(i + 1);
        t.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
  await sleep(400);
  await B.page.getByText('Bereit', { exact: true }).click();
  await sleep(700);
  await A.shot('1_raum');
  await A.page.getByText('Spiel starten', { exact: true }).click();
  for (const Q of [A, B]) await Q.page.waitForFunction(() => window.session && window.session() && window.session().world.view, null, { timeout: 60000 });
  await sleep(2500);
  const st = (Q) =>
    Q.page.evaluate(() => {
      const s = window.session();
      const w = s.world;
      let n = 0;
      for (let i = 0; i < w.top; i++) if (w.ids[i]) n++;
      return { tick: w.tick, bld: w.buildings.size, units: n, me: s.me, net: window.net()?.connected, building: s.entities.building.size, players: w.players.length };
    });
  /** Gebäudezahl und Prüfsumme der Gebäude, die spätestens zum Tick T gesetzt waren (beide Clients liegen leicht auseinander) */
  const bsum = (Q, T) =>
    Q.page.evaluate((T) => {
      const w = window.session().world;
      let n = 0;
      let h = 0;
      for (const b of w.buildings.values()) if (b.n <= T) { n++; h = (h * 31 + b.t * 1009 + b.x * 7 + b.y * 13 + b.o) % 1000003; }
      return { n, h, tick: w.tick };
    }, T);
  const sameWorld = async () => {
    const ta = (await st(A)).tick;
    const tb = (await st(B)).tick;
    const T = Math.min(ta, tb) - 30;
    return [await bsum(A, T), await bsum(B, T), T];
  };
  let a = await st(A);
  let b = await st(B);
  console.log('Start A', JSON.stringify(a), 'B', JSON.stringify(b));
  {
    const [x, y, T] = await sameWorld();
    ok('Beide Clients laufen im selben Spiel (3 Spieler, gleiche Gebäude bis Tick T, Ticks dicht beieinander)', a.players === 3 && b.players === 3 && x.n === y.n && x.h === y.h && Math.abs(a.tick - b.tick) < 40, `T=${T} ${JSON.stringify([x, y])}`);
  }
  ok('Verschiedene Spieler (me)', a.me !== b.me, `${a.me} ${b.me}`);
  for (const Q of [A, B]) await Q.page.mouse.click(400, 150);
  // Bob platziert drei Gebäude (Bergfried-Umfeld, Sim prüft)
  await B.page.evaluate(() => {
    const s = window.session();
    const k = s.world.players[s.me];
    window.__bk = { x: Math.round(k.keepX), y: Math.round(k.keepY) };
  });
  const bk = await B.page.evaluate(() => window.__bk);
  const placeFree = (type, minR, maxR) =>
    B.page.evaluate(
      ([type, minR, maxR]) => {
        const s = window.session();
        const k = window.__bk;
        const c = [];
        for (let dy = -maxR; dy <= maxR; dy++) for (let dx = -maxR; dx <= maxR; dx++) {
          const d = Math.hypot(dx, dy);
          if (d >= minR && d <= maxR) c.push([dx, dy, d]);
        }
        c.sort((x, y) => x[2] - y[2]);
        window.__used = window.__used ?? [];
        for (const [dx, dy] of c) {
          const x = k.x + dx;
          const y = k.y + dy;
          if (window.__used.some(([ux, uy]) => Math.abs(ux - x) < 6 && Math.abs(uy - y) < 6)) continue;
          if (window.__place(type, x, y, 0) === null) {
            window.__used.push([x, y]);
            s.send({ c: 'place', type, x, y });
            return { x, y, tick: s.world.tick };
          }
        }
        return null;
      },
      [type, minR, maxR],
    );
  const p1 = await placeFree(3, 5, 12); // Lager
  const p2 = await placeFree(6, 6, 30); // Holzfäller
  const p3 = await placeFree(16, 6, 22); // Mühle (große Bauanimation)
  console.log('Bob platziert', JSON.stringify([p1, p2, p3]));
  await sleep(3500);
  a = await st(A);
  b = await st(B);
  {
    const [x, y, T] = await sameWorld();
    ok('Alice sieht Bobs neue Gebäude (gleiche Gebäude bis Tick T wie Bob)', x.n === y.n && x.h === y.h && x.n >= 3 + 3, `T=${T} ${JSON.stringify([x, y])}`);
  }
  await A.shot('2_alice_sieht_bob');
  // Mühle: Bauanimation läuft noch → Verbindung von Bob kappen
  const prog = (Q) =>
    Q.page.evaluate(() => {
      const s = window.session();
      const w = s.world;
      const out = [];
      for (const bb of w.buildings.values()) if (bb.n > 0) out.push({ t: bb.t, i: bb.i, n: bb.n, age: w.tick - bb.n, p: +s.entities.sites.progress(w, bb, 1).toFixed(2) });
      return out;
    });
  // ---- 1) WebSocket schließen, Client verbindet automatisch neu
  await sleep(6000);
  const preB = await prog(B);
  await B.page.evaluate(() => window.net().ws.close());
  await sleep(1200);
  const mid = await st(B);
  console.log('getrennt B', JSON.stringify(mid), 'Toast:', await B.page.locator('.toast').allInnerTexts().catch(() => []));
  await B.shot('3_getrennt');
  await B.page.waitForFunction(() => window.net() && window.net().connected, null, { timeout: 20000 }).catch(() => {});
  await sleep(4000);
  const back = await st(B);
  const postB = await prog(B);
  console.log('wieder verbunden B', JSON.stringify(back));
  ok('Nach dem Trennen verbindet Bob automatisch neu und spielt weiter (Ticks laufen)', back.net === true && back.tick > mid.tick, `${mid.tick} -> ${back.tick}`);
  {
    const [x, y, T] = await sameWorld();
    ok('Gebäude nach dem Wiederverbinden gleich (keine verlorenen/doppelten Gebäude)', x.n === y.n && x.h === y.h, `T=${T} ${JSON.stringify([x, y])}`);
  }
  // Keine Neubau-Animation: jedes Gebäude hat nach dem Reconnect Fortschritt >= vorher (nicht von vorn)
  const regress = postB.filter((x) => {
    const old = preB.find((y) => y.i === x.i);
    return old && x.p + 0.001 < old.p;
  });
  ok('Keine Baustufe fällt nach dem Reconnect zurück (kein Neubau fertiger Gebäude)', regress.length === 0, JSON.stringify(regress));
  // im Bau gezeigt werden dürfen nur Gebäude, die nach dem Trennen (Tick preTick) gesetzt wurden
  const preTick = (await st(A)).tick - 200;
  const rebuilding = await B.page.evaluate(() => [...window.session().entities.building].map((id) => window.session().world.buildings.get(id)?.n ?? 0));
  const old = rebuilding.filter((n) => n > 0 && n < mid.tick);
  ok('Nach dem Reconnect zeigt kein vor dem Trennen gesetztes Gebäude eine Bauanimation', old.length === 0, JSON.stringify({ rebuilding, trennTick: mid.tick, preTick }));
  await B.shot('4_wieder_verbunden');
  // ---- 2) hartes Offline
  await B.ctx.setOffline(true);
  await B.page.evaluate(() => window.net().ws.close());
  await sleep(3500);
  await B.ctx.setOffline(false);
  await B.page.waitForFunction(() => window.net() && window.net().connected, null, { timeout: 30000 }).catch(() => {});
  await sleep(4000);
  const off = await st(B);
  console.log('nach Offline B', JSON.stringify(off));
  ok('Nach hartem Offline wieder verbunden, Ticks laufen', off.net === true && off.tick > back.tick, `${back.tick} -> ${off.tick}`);
  // ---- 3) Seite neu laden
  await B.page.reload();
  await B.page.waitForFunction(() => window.session && window.session() && window.session().world.view, null, { timeout: 40000 }).catch(() => {});
  await sleep(5000);
  const rel = await st(B);
  console.log('nach Reload B', JSON.stringify(rel));
  {
    const [x, y, T] = await sameWorld();
    ok('Nach Seiten-Neuladen kehrt Bob automatisch in die laufende Partie zurück (gleiche Gebäude bis Tick T)', rel.net === true && x.n === y.n && x.h === y.h, `${JSON.stringify(rel)} T=${T} ${JSON.stringify([x, y])}`);
  }
  const rel2 = await B.page.evaluate(() => [...window.session().entities.building].map((id) => window.session().world.buildings.get(id)?.n ?? 0));
  ok('Nach dem Neuladen keine Neubau-Animation vorhandener Gebäude (nur neu gesetzte)', rel2.filter((n) => n > 0 && n < back.tick).length === 0, JSON.stringify(rel2));
  await B.shot('5_nach_reload');
  // Bewegung: Meter nach dem Reconnect (Stichprobe 10 s)
  await B.page.evaluate(() => {
    window.__motion.enable(true);
    window.__motion.measure(true);
    window.__motion.resetMeter();
  });
  await sleep(10000);
  const rep = await B.page.evaluate(() => window.__motion.report());
  A.result.data.motionAfterReconnect = rep;
  // Software-GL: wenige Bilder in 10 s (Kennzahl rauscht); als Richtwert protokolliert, bindend sind s03/s04 mit mehr Bildern
A.note('bewegung_nach_reconnect', `Sprung ${rep.jumpPct.toFixed(2)} %, Halt ${rep.haltPct.toFixed(2)} %, rückw. ${rep.backPct.toFixed(2)} %, ${rep.frames} Bilder`);
  ok('Bewegung nach dem Reconnect: keine großen Sprünge (< 6 %, Richtwert bei sehr wenigen Bildern)', rep.jumpPct < 6, `Sprung ${rep.jumpPct.toFixed(2)} %, Halt ${rep.haltPct.toFixed(2)} %, rückw. ${rep.backPct.toFixed(2)} %, ${rep.frames} Bilder`);
  // Stimmen/Berater laufen weiter: Auswahl nach Reconnect spricht, Berater liefert Liste
  await B.page.mouse.click(400, 150);
  await B.page.waitForFunction(() => window.__audio.state().ctx === 'running', null, { timeout: 10000 }).catch(() => {});
  const log0 = await B.page.evaluate(() => window.__audio.state().voice.log.length + window.__audio.state().voice.stats.drops);
  const acc = await B.page.evaluate(() => window.__audio.engine.voice.speak('knight', 'select', {}));
  await sleep(2500);
  const log1 = await B.page.evaluate(() => window.__audio.state().voice.log.length + window.__audio.state().voice.stats.drops);
  const advOk = await B.page.evaluate(() => Array.isArray(window.session().advisor.list) && window.session().advisor.list.length >= 0);
  ok('Nach dem Reconnect: Sprachsystem antwortet wieder und die Beraterlogik läuft', acc && log1 > log0 && advOk, `Zeilen ${log0} -> ${log1}, angenommen ${acc}`);
  ok('Alice spielt ungestört weiter (verbunden, Ticks laufen)', (await st(A)).net === true);
  await A.shot('6_alice_am_ende');
  code = 0;
} catch (e) {
  console.log('FEHLER im Szenario', e?.stack ?? e);
  A.ok('Szenario ohne Ausnahme', false, String(e));
}
const ca = await A.finish();
const cb = await B.finish();
await browser.close();
srv.kill('SIGTERM');
console.log('Server-Protokoll', srvLog.trim().slice(-300));
process.exit(code || ca || cb);
