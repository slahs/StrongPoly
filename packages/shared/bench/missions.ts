/**
 * Spielt die Tutorial-Missionen per Skript bis zum Missionssieg durch (nur über Spielbefehle, echte Kosten).
 * Aufruf: tsx bench/missions.ts [missionsnummer 1-5 | alle]
 * Wird auch von test/missions_play.test.ts genutzt.
 */
import { BT, BUILDINGS, generateMap, MISSIONS, R, Sim, T, U, UNITS, mapFromJson } from '../src';
import { applyCommand } from '../src/sim/commands';
import { findSpot } from '../src/sim/ai/spots';
import type { Command } from '../src';

export interface PlayResult {
  won: boolean;
  ticks: number;
  stage: number;
  open: string[];
  log: string[];
}

export function missionSim(i: number): Sim {
  const m = MISSIONS[i];
  const setup = m.setup();
  const map = 'gen' in setup.map ? generateMap(setup.map.gen) : mapFromJson(setup.map.json);
  return new Sim({ map, players: setup.players, seed: setup.seed, startGold: setup.startGold, troopLimit: setup.troopLimit, fog: setup.fog, extreme: setup.extreme, mission: m.id, startRes: setup.startRes });
}

/** Ein "menschlicher" Spieler als Skript: baut an sinnvollen Stellen, rekrutiert, befiehlt */
export class Bot {
  constructor(
    readonly sim: Sim,
    readonly p = 0,
  ) {}

  get keep() {
    return this.sim.buildings.get(this.sim.players[this.p].keepId)!;
  }
  count(type: number): number {
    let n = 0;
    for (const b of this.sim.buildings.values()) if (b.owner === this.p && b.type === type) n++;
    return n;
  }
  send(cmd: Command): void {
    applyCommand(this.sim, this.p, cmd);
  }

  /** Nächster Punkt mit Gelände `terrain` zum Keep */
  terrainAnchor(terrain: number): { x: number; y: number } | null {
    const m = this.sim.map;
    const k = this.keep;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let y = Math.max(0, Math.floor(k.cy) - 40); y < Math.min(m.h, k.cy + 40); y++)
      for (let x = Math.max(0, Math.floor(k.cx) - 40); x < Math.min(m.w, k.cx + 40); x++) {
        if (m.terrain[m.idx(x, y)] !== terrain) continue;
        const d = (x - k.cx) ** 2 + (y - k.cy) ** 2;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    return best;
  }
  /** Nächster Baum zum Keep (außerhalb des baumfreien Burgbereichs) */
  treeAnchor(): { x: number; y: number } | null {
    const m = this.sim.map;
    const k = this.keep;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let y = Math.max(0, Math.floor(k.cy) - 40); y < Math.min(m.h, k.cy + 40); y++)
      for (let x = Math.max(0, Math.floor(k.cx) - 40); x < Math.min(m.w, k.cx + 40); x++) {
        if (!m.trees[m.idx(x, y)]) continue;
        const d = (x - k.cx) ** 2 + (y - k.cy) ** 2;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    return best;
  }

  /** Baut `type`, falls weniger als `n` vorhanden und bezahlbar. Anker: Gelände-/Baumnähe oder Keep. */
  ensure(type: number, n: number, anchor?: { x: number; y: number } | null): boolean {
    if (this.count(type) >= n) return true;
    const def = BUILDINGS[type];
    if (!this.sim.canAfford(this.p, def.cost)) return false;
    const k = this.keep;
    let a = anchor;
    if (!a) {
      if (def.placement === 'deposit' && def.terrain !== undefined) a = this.terrainAnchor(def.terrain);
      else if (def.placement === 'fertile') a = this.terrainAnchor(T.Oasis);
      else if (type === BT.Woodcutter) a = this.treeAnchor();
    }
    const ax = a?.x ?? k.cx + 5;
    const ay = a?.y ?? k.cy + 5;
    const spot = findSpot(this.sim, this.p, type, ax, ay, { kx: Math.floor(k.cx), ky: Math.floor(k.cy), ring: 40, margin: true });
    if (!spot) return false;
    const before = this.count(type);
    this.send({ c: 'place', type, x: spot.x, y: spot.y });
    return this.count(type) > before;
  }

  /** Rekrutiert `n` Einheiten, falls Gebäude, Gold und Waffen vorhanden */
  recruit(unit: number, n: number): number {
    const d = UNITS[unit];
    const want = d.producer === 'barracks' ? BT.Barracks : d.producer === 'merc' ? BT.MercPost : BT.EngineerGuild;
    let b = null as ReturnType<Sim['buildings']['get']> | null;
    for (const x of this.sim.buildings.values()) if (x.owner === this.p && x.type === want && (!b || x.queue.length < b.queue.length)) b = x;
    if (!b) return 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const q0 = b.queue.length;
      this.send({ c: 'recruit', building: b.id, unit, count: 1 });
      if (b.queue.length > q0) ok++;
      else break;
    }
    return ok;
  }

  myUnits(filter: (type: number) => boolean = () => true): number[] {
    const u = this.sim.units;
    const out: number[] = [];
    for (let s = 0; s < u.top; s++) if (u.alive[s] && u.owner[s] === this.p && filter(u.type[s])) out.push(u.id(s));
    return out;
  }
}

type Policy = (bot: Bot, sim: Sim, log: (s: string) => void) => void;

function openObjectives(sim: Sim): string[] {
  const v = sim.mission!.view;
  return v.objectives.filter((o) => !o.done).map((o) => `[Stufe ${v.stage}] ${o.text}`);
}

export function playMission(index: number, policy: Policy, maxMinutes: number, verbose = false): PlayResult {
  const sim = missionSim(index);
  const bot = new Bot(sim, 0);
  const log: string[] = [];
  const say = (s: string) => {
    log.push(`${(sim.tick / 600).toFixed(1)}min ${s}`);
    if (verbose) console.log(log[log.length - 1]);
  };
  let lastStage = 0;
  while (sim.tick < maxMinutes * 600 && !sim.gameOver) {
    if (sim.tick % 60 === 0) policy(bot, sim, say);
    sim.step();
    if (sim.mission!.stage !== lastStage) {
      lastStage = sim.mission!.stage;
      say(`→ Stufe ${lastStage + 1}`);
    }
  }
  return { won: sim.gameOver && sim.winnerTeam === sim.teamOf[0] && sim.mission!.complete, ticks: sim.tick, stage: sim.mission!.stage, open: openObjectives(sim), log };
}

// ---------------------------------------------------------------- Missions-Skripte
export const POLICIES: Policy[] = [
  // 1: Das erste Lager
  (bot) => {
    bot.ensure(BT.Woodcutter, 2);
    bot.ensure(BT.AppleOrchard, 1);
    bot.ensure(BT.Hovel, 3);
    if (bot.count(BT.Woodcutter) >= 2) {
      bot.ensure(BT.Quarry, 1);
      bot.ensure(BT.OxTether, 1);
    }
  },
  // 2: Brot und Bier
  (bot, sim) => {
    const pl = sim.players[0];
    bot.ensure(BT.Woodcutter, 3);
    bot.ensure(BT.Hovel, 5);
    bot.ensure(BT.AppleOrchard, 2);
    bot.ensure(BT.WheatFarm, 1);
    bot.ensure(BT.Mill, 1);
    bot.ensure(BT.Bakery, 1);
    bot.ensure(BT.HopFarm, 1);
    bot.ensure(BT.Brewery, 1);
    bot.ensure(BT.Inn, 1);
    bot.ensure(BT.Chapel, 1);
    bot.ensure(BT.Quarry, 1);
    bot.ensure(BT.OxTether, 1);
    bot.ensure(BT.Garden, 3);
    // Beliebtheit: großzügige Rationen, niedrige Steuern
    pl.ration = 3;
    bot.send({ c: 'setRation', level: 3 });
    bot.send({ c: 'setTax', level: pl.popularity < 75 ? -1 : 0 });
  },
  // 3: Wehrhafte Mauern
  (bot, sim) => {
    const k = bot.keep;
    const kx = Math.floor(k.cx);
    const ky = Math.floor(k.cy);
    const r = 9;
    const placed = (type: number) => bot.count(type);
    // Tor unten mittig, dann Mauern als Linien (Lücke fürs Tor)
    if (placed(BT.GateWood) === 0 && sim.canAfford(0, BUILDINGS[BT.GateWood].cost)) bot.send({ c: 'place', type: BT.GateWood, x: kx - 1, y: ky + r - 1 });
    if (placed(BT.GateWood) > 0 && bot.count(BT.WallLow) < 60) {
      bot.send({ c: 'placeLine', type: BT.WallLow, x1: kx - r, y1: ky - r, x2: kx + r, y2: ky - r });
      bot.send({ c: 'placeLine', type: BT.WallLow, x1: kx - r, y1: ky - r, x2: kx - r, y2: ky + r });
      bot.send({ c: 'placeLine', type: BT.WallLow, x1: kx + r, y1: ky - r, x2: kx + r, y2: ky + r });
      bot.send({ c: 'placeLine', type: BT.WallLow, x1: kx - r, y1: ky + r, x2: kx - 3, y2: ky + r });
      bot.send({ c: 'placeLine', type: BT.WallLow, x1: kx + 3, y1: ky + r, x2: kx + r, y2: ky + r });
    }
    bot.ensure(BT.TowerLookout, 1, { x: kx - r, y: ky - r });
    if (bot.count(BT.Stairs) < 1 && bot.count(BT.WallLow) > 10) for (let dy = -4; dy <= 6 && bot.count(BT.Stairs) < 1; dy++) bot.send({ c: 'place', type: BT.Stairs, x: kx - r + 1, y: ky + dy });
    // Wirtschaft für Bögen
    bot.ensure(BT.Woodcutter, 2);
    bot.ensure(BT.Quarry, 1);
    bot.ensure(BT.OxTether, 1);
    bot.ensure(BT.Armory, 1);
    bot.ensure(BT.Barracks, 1);
    bot.ensure(BT.Fletcher, 1);
    if (bot.count(BT.Barracks) > 0 && sim.players[0].stock[R.Bow] > 0 && sim.players[0].troops + 0 < 12) bot.recruit(U.Archer, 2);
    // Bogenschützen auf die Mauer, dem Feind entgegen
    for (const id of bot.myUnits((t) => t === U.Archer)) {
      const s = sim.units.slot(id);
      if (sim.units.state[s] === 0 && sim.units.layer[s] === 0) bot.send({ c: 'move', units: [id], x: kx + 0.5, y: ky + r - 2 });
    }
  },
  // 4: Der Sturm auf die Burg
  (bot, sim) => {
    const pl = sim.players[0];
    bot.ensure(BT.Barracks, 1);
    bot.ensure(BT.EngineerGuild, 1);
    bot.ensure(BT.Woodcutter, 2);
    bot.ensure(BT.Quarry, 1);
    bot.ensure(BT.OxTether, 1);
    // Rekrutierung: Mischung aus Speer, Bogen, Streitkolben, Schwert; dazu Ramme und Leitern
    if (bot.count(BT.Barracks) > 0) {
      for (const [u, n] of [[U.Spearman, 6], [U.Archer, 4], [U.Maceman, 3], [U.Swordsman, 2]] as [number, number][]) bot.recruit(u, n);
    }
    if (bot.count(BT.EngineerGuild) > 0) {
      const rams = bot.myUnits((t) => t === U.Ram).length;
      if (rams < 3) bot.recruit(U.Ram, 1);
      if (bot.myUnits((t) => t === U.Laddermen).length < 4) bot.recruit(U.Laddermen, 2);
    }
    // Angriff, sobald genug Truppen da sind (zweite Stufe); danach laufend nachschicken
    if (sim.mission!.stage >= 1 && sim.tick % 300 === 0) {
      const enemy = sim.players[1];
      const ek = sim.buildings.get(enemy.keepId);
      if (!ek) return;
      let gate: { id: number; d: number } | null = null;
      for (const b of sim.buildings.values()) if (b.owner === 1 && b.def.gate) {
        const d = Math.hypot(b.cx - bot.keep.cx, b.cy - bot.keep.cy);
        if (!gate || d < gate.d) gate = { id: b.id, d };
      }
      const inf = bot.myUnits((t) => t >= U.Archer && t !== U.Lord && !UNITS[t].siege && t !== U.Laddermen);
      const siege = bot.myUnits((t) => !!UNITS[t].siege);
      const lad = bot.myUnits((t) => t === U.Laddermen);
      if (inf.length) bot.send({ c: 'move', units: inf, x: ek.cx, y: ek.cy, attack: true });
      if (lad.length) bot.send({ c: 'move', units: lad, x: ek.cx, y: ek.cy, attack: true });
      for (const id of siege) bot.send({ c: 'attack', units: [id], kind: 'building', target: gate?.id ?? ek.id });
    }
    void pl;
  },
  // 5: Extreme!
  (bot, sim) => {
    const pl = sim.players[0];
    const k = bot.keep;
    bot.ensure(BT.Woodcutter, 3);
    bot.ensure(BT.Armory, 1);
    bot.ensure(BT.Barracks, 1);
    bot.ensure(BT.Fletcher, 2);
    bot.ensure(BT.Quarry, 1);
    bot.ensure(BT.OxTether, 1);
    bot.ensure(BT.Hovel, 7);
    bot.ensure(BT.AppleOrchard, 3);
    bot.ensure(BT.HunterPost, 2);
    bot.send({ c: 'setTax', level: pl.popularity < 60 ? -1 : 1 });
    if (bot.count(BT.Barracks) > 0 && pl.stock[R.Bow] > 0) bot.recruit(U.Archer, 3);
    // Fähigkeiten: Goldspende, Pfeilhagel (auf den Feind, sonst neben die Burg)
    const target = sim.buildings.get(sim.players[1].keepId);
    if ((pl.abilitiesUsed[4] ?? 0) === 0) bot.send({ c: 'ability', id: 4, x: k.cx, y: k.cy });
    if ((pl.abilitiesUsed[0] ?? 0) === 0) bot.send({ c: 'ability', id: 0, x: target?.cx ?? k.cx + 20, y: target?.cy ?? k.cy + 20 });
    if (sim.tick % 300 !== 0 || sim.mission!.stage < 1) return;
    const troops = bot.myUnits((t) => t >= U.Archer && t !== U.Lord && !UNITS[t].siege);
    const banners = (sim.extreme?.banners ?? []).filter((b) => b.owner !== 0);
    if (pl.banners < 2 && banners.length && troops.length) {
      // vier Mann besetzen die nächste Fahne, der Rest bleibt zuhause
      banners.sort((a, b) => Math.hypot(a.x - k.cx, a.y - k.cy) - Math.hypot(b.x - k.cx, b.y - k.cy));
      bot.send({ c: 'move', units: troops.slice(0, 5), x: banners[0].x + 1, y: banners[0].y + 1 });
    } else if (target && troops.length >= 45) {
      bot.send({ c: 'move', units: troops, x: target.cx, y: target.cy, attack: true });
      if (pl.power > 60) bot.send({ c: 'ability', id: 3, x: target.cx, y: target.cy });
      else if (pl.power > 30) bot.send({ c: 'ability', id: 0, x: target.cx, y: target.cy });
    }
  },
];

if (process.argv[1]?.endsWith('missions.ts')) {
  const arg = process.argv[2] ?? 'alle';
  const which = arg === 'alle' ? POLICIES.map((_, i) => i) : [Number(arg) - 1];
  let bad = 0;
  for (const i of which) {
    const r = playMission(i, POLICIES[i], 40, process.env.V === '1');
    console.log(`${r.won ? 'SIEG ' : 'FEHLT'} Mission ${i + 1} (${MISSIONS[i].name}): ${(r.ticks / 600).toFixed(1)} Min, Stufe ${r.stage + 1}${r.won ? '' : ', offen: ' + r.open.join(' | ')}`);
    if (!r.won) bad++;
  }
  void U;
  process.exit(bad ? 1 : 0);
}
