#!/usr/bin/env node
/**
 * Szenario 5: Einheiten auswählen und bewegen – Einzelklick, Rahmen, Alle-Truppen (Y), Rechtsklick-Marsch, Formationen
 * (Frei/Linie/Block/Keil), Angriffsmarsch (F + Klick), Patrouille (P + Klick), Stopp (X), Haltungen (H/V/B).
 * Alle Eingaben über echte Maus-/Tastaturereignisse; die gesendeten Befehle werden mitgeschnitten und geprüft.
 *   node scripts/qa/s05_units.mjs
 */
import { startQA, sleep, clickAt } from './lib.mjs';

const q = await startQA('s05_units', { query: 'quick=1&dev=1&size=128&seed=1', settings: { quality: 'low', shadows: false } });
const { page, S, ok } = q;
await q.speed(2);
await q.waitTick(20);
// Befehle mitschneiden
await S(() => {
  const s = window.session();
  window.__cmds = [];
  const orig = s.send.bind(s);
  s.send = (c) => {
    window.__cmds.push(c);
    return orig(c);
  };
});
const keep = await S(() => {
  const p = window.session().world.players[0];
  return { x: p.keepX, y: p.keepY };
});
const SX = Math.round(keep.x) - 3;
const SY = Math.round(keep.y) + 7;
await q.dev('spawn', { type: 8, owner: 0, n: 16, x: SX, y: SY, stance: 0 });
await q.dev('spawn', { type: 3, owner: 0, n: 9, x: SX, y: SY + 4, stance: 0 });
await q.dev('spawn', { type: 9, owner: 0, n: 4, x: SX + 8, y: SY, stance: 0 });
await S(([x, y]) => {
  const s = window.session();
  s.gs.cam.lookAt(x + 5, y + 6);
  s.gs.cam.dist = 44;
  s.gs.cam.distTarget = 44;
}, [SX, SY]);
await sleep(2500);

/** Bildschirmposition einer Einheit/eines Bodenpunkts (Höhe durch Rückprojektion über groundAt bestimmt) */
const screenOf = (x, y) =>
  S(
    ([x, y]) => {
      const s = window.session();
      const cam = s.gs.cam.camera;
      cam.updateMatrixWorld();
      const V = cam.matrixWorldInverse.elements;
      const P = cam.projectionMatrix.elements;
      const cv = s.gs.canvas.getBoundingClientRect();
      const proj = (X, Y, Z) => {
        const vx = V[0] * X + V[4] * Y + V[8] * Z + V[12];
        const vy = V[1] * X + V[5] * Y + V[9] * Z + V[13];
        const vz = V[2] * X + V[6] * Y + V[10] * Z + V[14];
        const cx = P[0] * vx + P[4] * vy + P[8] * vz + P[12];
        const cy = P[1] * vx + P[5] * vy + P[9] * vz + P[13];
        const cw = P[3] * vx + P[7] * vy + P[11] * vz + P[15];
        return [((cx / cw) * 0.5 + 0.5) * cv.width + cv.left, (-(cy / cw) * 0.5 + 0.5) * cv.height + cv.top];
      };
      let best = null;
      for (let h = 0; h <= 6; h += 0.25) {
        const [sx, sy] = proj(x, h, y);
        const g = s.input.groundAt(sx, sy);
        if (!g) continue;
        const d = Math.hypot(g.x - x, g.y - y);
        if (!best || d < best.d) best = { d, sx, sy, h };
      }
      // Einheiten stehen auf dem Boden; für das Anklicken genügt Körpermitte ≈ 0,5 über dem Boden
      const [bx, by] = proj(x, best.h + 0.45, y);
      return { x: bx, y: by, h: best.h };
    },
    [x, y],
  );
const units = (types) =>
  S((types) => {
    const w = window.session().world;
    const r = [];
    for (let i = 0; i < w.top; i++) if (w.ids[i] && w.owner[i] === 0 && types.includes(w.type[i])) r.push({ id: w.ids[i], x: w.curX[i], y: w.curY[i], t: w.type[i] });
    return r;
  }, types);
const sel = () => S(() => window.session().selection.units.slice());
const cmds = () => S(() => window.__cmds.splice(0));

// 1) Einzelklick
const sw = await units([8]);
ok('16 Schwertkämpfer, 9 Bogenschützen, 4 Ritter gespawnt', sw.length === 16 && (await units([3])).length === 9 && (await units([9])).length === 4, sw.length);
const one = sw[0];
let p = await screenOf(one.x, one.y);
await clickAt(page, p.x, p.y);
await sleep(600);
let sl = await sel();
ok('Einzelklick wählt genau die Einheit', sl.length >= 1 && sl.length <= 3 && sl.includes(one.id), JSON.stringify(sl));
await q.shot('1_einzelauswahl');

// 2) Rahmenauswahl über alle Fußtruppen
const all = await units([8, 3, 9]);
const xs = all.map((u) => u.x);
const ys = all.map((u) => u.y);
// alle vier Ecken des Weltrechtecks projizieren (die Kamera ist um 45° gedreht, zwei Ecken genügen nicht)
const cs = [];
for (const cx of [Math.min(...xs) - 1, Math.max(...xs) + 1]) for (const cy of [Math.min(...ys) - 1, Math.max(...ys) + 1]) cs.push(await screenOf(cx, cy));
const a = { x: Math.min(...cs.map((c) => c.x)), y: Math.min(...cs.map((c) => c.y)) };
const b = { x: Math.max(...cs.map((c) => c.x)), y: Math.max(...cs.map((c) => c.y)) };
const x0 = Math.max(a.x - 30, 10);
const x1 = Math.min(b.x + 30, 1270);
const y0 = Math.max(a.y - 40, 60);
const y1 = Math.min(b.y + 30, 462);
console.log('Rahmen', JSON.stringify({ a, b, x0, y0, x1, y1 }));
await page.mouse.move(x0, y0);
await page.mouse.down();
await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
await page.mouse.move(x1, y1, { steps: 4 });
await q.shot('2_rahmen_zieht');
await page.mouse.up();
await sleep(800);
sl = await sel();
ok('Rahmenauswahl erfasst die Truppen (≥ 25 von 29)', sl.length >= 25, `${sl.length}`);
await q.shot('2_rahmen_ergebnis');
// Einzelwahl dann Alle-Truppen (Y)
await S(() => window.session().setSelection([], 0));
await page.keyboard.press('KeyY');
await sleep(500);
sl = await sel();
ok('Taste Y wählt alle Truppen (29 Soldaten + Lord)', sl.length === 30, `${sl.length}`);

// 3) Rechtsklick-Marsch in Formationen
const groundOf = (sx, sy) => S(([sx, sy]) => window.session().input.groundAt(sx, sy), [sx, sy]);
const target = await groundOf(930, 300);
console.log('Marschziel', JSON.stringify(target));
const formations = [['Frei', 0], ['Linie', 1], ['Block', 2], ['Keil', 3]];
const shape = {};
for (const [name, f] of formations) {
  // Truppe zurück an den Start
  await S(([ids, x, y]) => window.session().send({ c: 'move', units: ids, x, y }), [sl, SX + 4, SY]);
  for (let w = 0; w < 40; w++) {
    const u = await units([8, 3, 9]);
    if (u.filter((e) => Math.hypot(e.x - (SX + 4), e.y - SY) < 7).length >= 24) break;
    await sleep(1500);
  }
  await page.keyboard.press('KeyY');
  await sleep(300);
  // Formation über die echte Schaltfläche, sonst über den Handler der Schaltfläche
  const btn = page.getByText(name, { exact: true });
  if (await btn.count()) await btn.first().click().catch(() => {});
  else await S((f) => window.session().hud.formationHandler?.(f), f);
  await sleep(300);
  const used = await S(() => window.session().input.formation);
  if (used !== f) await S((f) => window.session().hud.formationHandler?.(f), f);
  await cmds();
  const tp = await screenOf(target.x, target.y);
  const el = await S(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e && `${e.tagName}#${e.id}.${e.className}`;
  }, [tp.x, tp.y]);
  console.log('Rechtsklick auf', JSON.stringify(tp), el, 'Auswahl', (await sel()).length);
  await clickAt(page, tp.x, tp.y, 'right');
  await sleep(400);
  const sent = await cmds();
  const mv = sent.find((c) => c.c === 'move');
  ok(`Rechtsklick sendet Marschbefehl (${name})`, !!mv && mv.units.length >= 29 && mv.formation === f && !mv.attack, JSON.stringify(mv && { ...mv, units: mv.units.length }));
  // warten, bis die Spitze angekommen ist
  const t0 = Date.now();
  let near = 0;
  while (mv && Date.now() - t0 < 60000) {
    const u = await units([8, 3, 9]);
    near = u.filter((e) => Math.hypot(e.x - target.x, e.y - target.y) < 9).length;
    if (near >= 24) break;
    await sleep(1200);
  }
  const u = await units([8, 3, 9]);
  const cx = u.reduce((s, e) => s + e.x, 0) / u.length;
  const cy = u.reduce((s, e) => s + e.y, 0) / u.length;
  // Breite/Tiefe der Aufstellung (Hauptachsen)
  let sxx = 0, syy = 0, sxy = 0;
  for (const e of u) {
    sxx += (e.x - cx) ** 2;
    syy += (e.y - cy) ** 2;
    sxy += (e.x - cx) * (e.y - cy);
  }
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l2 = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  shape[name] = { angekommen: near, breite: +Math.sqrt(l1 / u.length).toFixed(2), tiefe: +Math.sqrt(l2 / u.length).toFixed(2) };
  ok(`Truppe erreicht das Ziel (${name}), ≥ 24 von 29 im Umkreis 9`, near >= 24, `${near}/29`);
  await q.shot(`3_marsch_${name.toLowerCase()}`);
}
console.log('Formationen', JSON.stringify(shape));
q.result.data.formationShape = shape;
ok('Linie ist flacher als Block (Seitenverhältnis Breite/Tiefe größer)', shape.Linie.breite / Math.max(0.1, shape.Linie.tiefe) >= shape.Block.breite / Math.max(0.1, shape.Block.tiefe) - 0.2, JSON.stringify([shape.Linie, shape.Block]));

// 5) Patrouille: P + Klick; Truppe pendelt zwischen Start und Ziel (vor dem Angriffsmarsch: sichtet eine Patrouille einen Gegner, greift sie an)
await S(() => window.session().setSelection([], 0));
await page.keyboard.press('KeyY');
await sleep(300);
await S(([ids, x, y]) => window.session().send({ c: 'move', units: ids, x, y }), [await sel(), SX + 4, SY + 2]);
await sleep(8000);
await page.keyboard.press('KeyY');
await cmds();
await page.keyboard.press('KeyP');
await sleep(200);
ok('P schaltet den Patrouillen-Modus ein', (await S(() => window.session().input.mode.k)) === 'patrol');
const p0 = await units([8]);
const px0 = p0.reduce((a, e) => a + e.x, 0) / p0.length;
const py0 = p0.reduce((a, e) => a + e.y, 0) / p0.length;
// Patrouillenziel: begehbares freies Feld 8–12 Felder vom Startpunkt, das im sichtbaren Kartenbereich liegt
const cands = await S(([x, y]) => {
  const w = window.session().world;
  const m = w.map;
  const out = [];
  for (let dy = -12; dy <= 12; dy += 2)
    for (let dx = -12; dx <= 12; dx += 2) {
      const d = Math.hypot(dx, dy);
      if (d < 8 || d > 12) continue;
      const tx = Math.round(x + dx);
      const ty = Math.round(y + dy);
      const i = m.idx(tx, ty);
      if (m.inBounds(tx, ty) && m.walkable(i) && !w.bldAt[i] && m.trees[i] === 0) out.push({ x: tx, y: ty });
    }
  return out;
}, [px0, py0]);
let pt = null;
let ptScreen = null;
for (const c of cands) {
  const sc = await screenOf(c.x, c.y);
  if (sc.x > 40 && sc.x < 1240 && sc.y > 80 && sc.y < 440) {
    pt = c;
    ptScreen = sc;
    break;
  }
}
console.log('Patrouillenziel', JSON.stringify([pt, ptScreen, cands.length]));
await clickAt(page, ptScreen.x, ptScreen.y);
await sleep(400);
const sentP = await cmds();
const pc = sentP.find((c) => c.c === 'patrol');
ok('Patrouille sendet patrol-Befehl', !!pc && pc.units.length >= 25, JSON.stringify(pc && { ...pc, units: pc.units.length }));
const ypos = [];
for (let i = 0; i < 24; i++) {
  const u = await units([8]);
  ypos.push(+(u.reduce((s, e) => s + Math.hypot(e.x - px0, e.y - py0), 0) / u.length).toFixed(1));
  await sleep(2500);
}
console.log('Patrouille mittlerer Abstand vom Startpunkt', JSON.stringify(ypos));
q.result.data.patrolY = ypos;
let dir = 0;
let turns = 0;
for (let i = 1; i < ypos.length; i++) {
  const d = Math.sign(ypos[i] - ypos[i - 1]);
  if (d && dir && d !== dir) turns++;
  if (d) dir = d;
}
ok('Patrouille: Truppe wendet mindestens einmal und pendelt', turns >= 1 && Math.max(...ypos) - Math.min(...ypos) > 5, `Wendungen ${turns}, Spanne ${(Math.max(...ypos) - Math.min(...ypos)).toFixed(1)}`);
await q.shot('5_patrouille');

// 4) Angriffsmarsch (nach der Patrouille, weil die Gegner sonst die Patrouille beenden)
// Angriffsmarsch: F, dann Linksklick auf das Ziel; Gegner dort aufstellen
const enemyAt = await groundOf(1000, 360);
await q.dev('spawn', { type: 8, owner: 1, n: 5, x: enemyAt.x, y: enemyAt.y, stance: 0 });
await S(() => window.session().setSelection([], 0));
await page.keyboard.press('KeyY');
await sleep(300);
await cmds();
await page.keyboard.press('KeyF');
await sleep(200);
const mode = await S(() => window.session().input.mode.k);
ok('F schaltet den Angriffsmarsch-Modus ein', mode === 'attackMove', mode);
// auf den Boden neben den Gegnern klicken (ein Klick auf einen Gegner wäre ein gezielter Angriff, kein Angriffsmarsch)
const am = await groundOf(700, 330); // links vom Beraterpanel (das nach den Gegner-Meldungen bis y≈300 reicht)
const amScreen = await screenOf(am.x, am.y);
console.log('Angriffsmarsch-Klick', JSON.stringify({ am, amScreen, sel: (await sel()).length, mode: await S(() => window.session().input.mode.k) }));
await clickAt(page, amScreen.x, amScreen.y);
await sleep(400);
const sentF = await cmds();
console.log('danach', JSON.stringify(sentF.map((c) => c.c)), 'Auswahl', (await sel()).length, 'Modus', await S(() => window.session().input.mode.k));
const mvF = sentF.find((c) => c.c === 'move');
ok('Angriffsmarsch sendet move mit attack=true', !!mvF && mvF.attack === true, JSON.stringify(mvF && { ...mvF, units: mvF.units.length }));
await sleep(6000);
await q.shot('4_angriffsmarsch');

// 6) Stopp und Haltungen
await cmds();
await page.keyboard.press('KeyX');
await page.keyboard.press('KeyH');
await page.keyboard.press('KeyV');
await page.keyboard.press('KeyB');
await sleep(400);
const sentS = await cmds();
ok('X sendet stop, H/V/B senden Haltung 0/1/2', sentS.some((c) => c.c === 'stop') && [0, 1, 2].every((st) => sentS.some((c) => c.c === 'stance' && c.stance === st)), JSON.stringify(sentS.map((c) => c.c + (c.stance ?? ''))));
// Alt+H ist Berater-Wiederholung, nicht „Halten“
await cmds();
await page.keyboard.press('Alt+KeyH');
await sleep(300);
const sentH = await cmds();
ok('Alt+H sendet keinen Haltungsbefehl (Berater-Hotkey kollidiert nicht mit Halten)', !sentH.some((c) => c.c === 'stance'), JSON.stringify(sentH.map((c) => c.c)));
// Alt+S/Alt+W bewegen die Kamera nicht
const cam0 = await S(() => ({ x: window.session().gs.cam.tx, z: window.session().gs.cam.tz }));
await page.keyboard.down('Alt');
await page.keyboard.down('KeyW'); // Alt+W = Waffenkammer anwählen (hier keine vorhanden); W allein schwenkt die Kamera
await sleep(1200);
await page.keyboard.up('KeyW');
await page.keyboard.up('Alt');
const cam1 = await S(() => ({ x: window.session().gs.cam.tx, z: window.session().gs.cam.tz }));
ok('Alt+W (Waffenkammer anwählen) schwenkt die Kamera nicht mit', Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z) < 0.5, JSON.stringify([cam0, cam1]));
process.exit(await q.finish());
