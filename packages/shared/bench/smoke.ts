/**
 * Smoke-Test: feuert jeden Befehlstyp (auch unsinnige Parameter) gegen eine laufende Sim und prüft Invarianten.
 * Aufruf: tsx bench/smoke.ts [seed=1] [minuten=25]
 * Invarianten: keine NaN-Positionen, Bestände >= 0, keine Bodeneinheit in festen Gebäuden (außer Tor/Treppe/Mauerkrone),
 * kein Gebäude mit HP > Max, Einheiten im Kartenraster.
 * Exit-Code 1 bei Verletzung (für CI / Regressionstest).
 */
import { applyCommand } from '../src/sim/commands';
import { ABILITIES, BT, BUILDINGS, generateMap, RES_COUNT, Rng, Sim, TAX_LEVELS, U, UNITS } from '../src';
import type { Command } from '../src';

export interface SmokeReport {
  violations: string[];
  commands: Record<string, number>;
  ticks: number;
}

export function runSmoke(seed = 1, minutes = 25, quiet = false): SmokeReport {
  const map = generateMap({ seed, size: 128, players: 3 });
  const sim = new Sim({
    map,
    seed,
    players: [
      { name: 'H0', team: 0, kind: 'human' },
      { name: 'H1', team: 1, kind: 'human' },
      { name: 'AI', team: 2, kind: 'ai', ai: 8 },
    ],
    startGold: 3000,
    troopLimit: 600,
    fog: false,
    extreme: true,
  });
  const rng = new Rng(seed * 7919);
  const violations: string[] = [];
  const commands: Record<string, number> = {};
  const note = (v: string) => {
    if (violations.length < 40 && !violations.includes(v)) violations.push(v);
  };
  const buildTypes = Object.keys(BUILDINGS).map(Number);
  const garbage = [NaN, Infinity, -1, 1e9, 0.5, -1e9];

  const ownBuildings = (p: number) => [...sim.buildings.values()].filter((b) => b.owner === p);
  const ownUnits = (p: number): number[] => {
    const l: number[] = [];
    for (let s = 0; s < sim.units.top; s++) if (sim.units.alive[s] && sim.units.owner[s] === p) l.push(sim.units.id(s));
    return l;
  };
  const pickSome = <T>(l: T[], n: number): T[] => (l.length ? Array.from({ length: Math.min(n, 1 + rng.int(n)) }, () => rng.pick(l)) : []);

  function fire(p: number, cmd: Command): void {
    commands[cmd.c] = (commands[cmd.c] ?? 0) + 1;
    try {
      applyCommand(sim, p, cmd);
    } catch (e) {
      note(`Ausnahme bei ${cmd.c}: ${(e as Error).message}`);
    }
  }

  function randomCommand(p: number): Command {
    const pl = sim.players[p];
    const keep = sim.buildings.get(pl.keepId);
    const kx = keep ? keep.cx : 60;
    const ky = keep ? keep.cy : 60;
    const near = (r = 22) => ({ x: Math.round(kx + rng.range(-r, r)), y: Math.round(ky + rng.range(-r, r)) });
    const bs = ownBuildings(p);
    const us = ownUnits(p);
    const junk = rng.chance(0.06);
    const g = () => rng.pick(garbage);
    switch (rng.int(19)) {
      case 0:
      case 1:
      case 2: {
        const t = rng.pick(buildTypes);
        const q = near();
        return { c: 'place', type: junk ? g() : t, x: junk ? g() : q.x, y: q.y, rot: rng.int(2) };
      }
      case 3: {
        const a = near(),
          b = rng.chance(0.5) ? { x: a.x + rng.int(14), y: a.y } : { x: a.x, y: a.y + rng.int(14) };
        return { c: 'placeLine', type: rng.pick([BT.WallLow, BT.WallHigh, BT.WallWood, BT.Pit, BT.KillingPit]), x1: a.x, y1: a.y, x2: b.x, y2: junk ? g() : b.y };
      }
      case 4:
        return { c: 'demolish', ids: junk ? [g(), 123456] : pickSome(bs, 3).map((b) => b.id) };
      case 5: {
        const q = near(40);
        return { c: 'move', units: pickSome(us, 12), x: q.x, y: junk ? g() : q.y, attack: rng.chance(0.4), queue: rng.chance(0.2), formation: rng.int(4) };
      }
      case 6:
        return { c: 'attack', units: pickSome(us, 8), kind: rng.chance(0.5) ? 'unit' : 'building', target: rng.chance(0.5) ? rng.pick([...sim.buildings.keys()]) : rng.pick(ownUnits(rng.int(3))) };
      case 7: {
        const q = near(40);
        return { c: rng.pick(['attackGround', 'patrol'] as const), units: pickSome(us, 6), x: q.x, y: q.y };
      }
      case 8:
        return { c: rng.pick(['stance', 'stop'] as const), units: pickSome(us, 10), stance: rng.int(3) } as Command;
      case 9: {
        const rec = bs.filter((b) => b.def.key === 'barracks' || b.def.key === 'engineers' || b.def.key === 'mercpost');
        const b = rec.length ? rng.pick(rec) : null;
        const unit = rng.pick([U.Archer, U.Spearman, U.Maceman, U.Swordsman, U.Knight, U.Tunneler, U.Laddermen, U.Slave, U.Slinger, U.Catapult, U.Ram]);
        return { c: 'recruit', building: b ? b.id : 99999, unit: junk ? g() : unit, count: 1 + rng.int(5) };
      }
      case 10:
        return { c: 'setTax', level: junk ? g() : rng.pick(TAX_LEVELS) };
      case 11:
        return { c: 'setRation', level: junk ? g() : rng.int(5) };
      case 12:
        return { c: 'trade', res: rng.int(RES_COUNT + (junk ? 5 : 0)), amount: junk ? g() : 1 + rng.int(20), buy: rng.chance(0.5) };
      case 13: {
        const ws = bs.filter((b) => b.def.prod && b.def.prod.recipes.length > 1);
        const b = ws.length ? rng.pick(ws) : null;
        return { c: 'setRecipe', building: b ? b.id : 1, recipe: rng.int(4) - (junk ? 3 : 0) };
      }
      case 14: {
        const a = near(10);
        return { c: 'dig', x1: a.x, y1: a.y, x2: a.x + rng.int(10), y2: a.y + rng.int(3), fill: rng.chance(0.3) };
      }
      case 15:
        return { c: 'repair', building: bs.length ? rng.pick(bs).id : 1 };
      case 16: {
        const q = near(40);
        return { c: 'ability', id: junk ? g() : rng.int(ABILITIES.length), x: q.x, y: q.y };
      }
      case 17: {
        const q = near(30);
        const tun = us.filter((id) => UNITS[sim.units.type[sim.units.slot(id)]]?.tunnels);
        return rng.chance(0.5) ? { c: 'tunnel', units: tun.length ? tun : pickSome(us, 2), x: q.x, y: q.y } : { c: 'igniteDitch', x: q.x, y: q.y };
      }
      default:
        return rng.chance(0.5)
          ? { c: 'sendAid', to: rng.int(3), res: rng.int(RES_COUNT), amount: 1 + rng.int(50) }
          : rng.chance(0.5)
            ? { c: 'requestAid', to: rng.int(3) }
            : { c: 'sendTroops', to: rng.int(3), units: pickSome(us, 4) };
    }
  }

  function checkInvariants(): void {
    const u = sim.units;
    const m = sim.map;
    for (let s = 0; s < u.top; s++) {
      if (!u.alive[s]) continue;
      const x = u.x[s];
      const y = u.y[s];
      const tag = `Einheit ${UNITS[u.type[s]]?.key ?? u.type[s]} (Besitzer ${u.owner[s]}) bei Tick ${sim.tick}`;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(u.hp[s])) {
        note(`NaN: ${tag}`);
        continue;
      }
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) {
        note(`außerhalb der Karte: ${tag} (${x.toFixed(1)}, ${y.toFixed(1)})`);
        continue;
      }
      if (u.hp[s] > u.maxHp[s] + 0.01) note(`HP > Max: ${tag}`);
      if (u.layer[s] === 0) {
        const b = sim.buildingAtTile(Math.floor(x), Math.floor(y));
        if (b && b.def.solid && !b.def.gate && !b.def.wallTop && !b.def.stairs && u.state[s] !== 7) note(`Bodeneinheit in festem Gebäude ${b.def.key}: ${tag}`);
      }
    }
    for (const b of sim.buildings.values()) {
      if (b.hp > b.maxHp + 0.01) note(`Gebäude ${b.def.key} HP ${b.hp} > Max ${b.maxHp}`);
      if (!Number.isFinite(b.hp)) note(`Gebäude ${b.def.key} HP NaN`);
    }
    for (let p = 0; p < sim.players.length; p++) {
      const pl = sim.players[p];
      if (!(pl.gold >= -0.001) || !Number.isFinite(pl.gold)) note(`Gold ${pl.gold} bei Spieler ${p}`);
      for (let r = 0; r < RES_COUNT; r++) if (pl.stock[r] < 0) note(`Bestand ${r} = ${pl.stock[r]} bei Spieler ${p}`);
      if (!Number.isFinite(pl.popularity)) note(`Beliebtheit NaN bei Spieler ${p}`);
    }
  }

  const total = minutes * 600;
  while (sim.tick < total && !sim.gameOver) {
    if (sim.tick % 15 === 0) for (const p of [0, 1]) if (sim.players[p].alive) for (let k = 0; k < 1 + rng.int(3); k++) fire(p, randomCommand(p));
    sim.step();
    if (sim.tick % 25 === 0) checkInvariants();
  }
  checkInvariants();
  if (!quiet) {
    console.log(`Smoke seed ${seed}: ${sim.tick} Ticks, Befehle ${JSON.stringify(commands)}`);
    console.log(violations.length ? `VERLETZUNGEN (${violations.length}):\n  ` + violations.join('\n  ') : 'keine Invariantenverletzung');
  }
  return { violations, commands, ticks: sim.tick };
}

if (process.argv[1]?.endsWith('smoke.ts')) {
  const r = runSmoke(Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 25));
  process.exit(r.violations.length ? 1 : 0);
}
