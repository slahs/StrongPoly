#!/usr/bin/env node
/**
 * Wiedererkennbarkeit der Spielerfarben: Gefecht mit acht Spielern (Hauptmenü → +6 KI-Lords), je Spieler eine Gruppe aus Schwertkämpfern,
 * Bogenschützen, Rittern und Bauern nebeneinander; Aufnahmen aus drei Entfernungen. Bild: docs/phase4/qa/s16_teamcolors/.
 *   node scripts/qa/s16_teamcolors.mjs
 */
import { startQA, sleep } from './lib.mjs';

const q = await startQA('s16_teamcolors', { query: 'dev=1', waitGame: false, viewport: { width: 1280, height: 720 }, settings: { quality: 'medium', shadows: true } });
const { page, S, ok } = q;
await page.getByText('Gefecht gegen KI', { exact: true }).click();
await sleep(300);
for (let i = 0; i < 6; i++) await page.getByText('+ KI-Lord hinzufügen', { exact: true }).click();
await page.evaluate(() => {
  // Wasser/Wald zurück, damit die Karte offen ist (Regler nur, wenn vorhanden)
  const sl = [...document.querySelectorAll('input[type=range]')];
  for (const s of sl.slice(0, 3)) {
    s.value = '0.1';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await page.getByText('Spiel starten', { exact: true }).click();
await page.waitForFunction(() => window.session && window.session() && window.session().world.view, null, { timeout: 90000 });
await q.dev('gold', { owner: 0, n: 100 });
const site = await S(() => {
  const w = window.session().world;
  const m = w.map;
  const k = w.players[0];
  let best = null;
  for (let y0 = 3; y0 < m.h - 14; y0 += 2)
    for (let x0 = 3; x0 < m.w - 52; x0 += 2) {
      let bad = 0;
      for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 50; x++) { const i = m.idx(x, y); if (!m.walkable(i) || w.bldAt[i] || m.trees[i] !== 0) bad++; }
      const d = Math.hypot(x0 + 25 - k.keepX, y0 + 5 - k.keepY);
      const sc = bad * 4 + d * 0.2;
      if (!best || sc < best.sc) best = { sc, x0, y0, bad };
    }
  return best;
});
console.log('Fläche', JSON.stringify(site));
for (let o = 0; o < 8; o++) {
  const x = site.x0 + o * 6;
  await q.dev('spawn', { type: 8, owner: o, n: 4, x, y: site.y0, stance: 0 });
  await q.dev('spawn', { type: 3, owner: o, n: 4, x, y: site.y0 + 3, stance: 0 });
  await q.dev('spawn', { type: 9, owner: o, n: 2, x, y: site.y0 + 6, stance: 0 });
  await q.dev('spawn', { type: 0, owner: o, n: 2, x: x + 3, y: site.y0 + 6, stance: 0 });
}
await sleep(1500);
for (const [name, d] of [['nah', 16], ['mittel', 30], ['fern', 52]]) {
  await S(([x, y, d]) => {
    const s = window.session();
    s.gs.cam.lookAt(x, y);
    s.gs.cam.dist = d;
    s.gs.cam.distTarget = d;
    document.getElementById('ui').style.display = 'none';
  }, [site.x0 + 21, site.y0 + 4, d]);
  await sleep(3500);
  await q.shot(`teams_${name}`);
}
const n = await S(() => {
  const w = window.session().world;
  const c = new Array(8).fill(0);
  for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] < 8 && w.type[i] !== 0) c[w.owner[i]]++;
  return c;
});
ok('Acht Spielergruppen gespawnt (je ≥ 6 Soldaten/Reiter/Lord; die KI bewegt Einheiten)', n.every((x) => x >= 6), JSON.stringify(n));
process.exit(await q.finish());
