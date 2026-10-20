import { Building } from './building';
import { AiController } from './ai/controller';
import { PlayerState } from './player';
import type { Sim } from './sim';

/** Vollständiger Spielstand (strukturiert klonbar: nur Zahlen, Arrays, typisierte Arrays). */
export interface SimSave {
  v: 1;
  tick: number;
  rng: number;
  nextBid: number;
  winnerTeam: number;
  gameOver: boolean;
  map: { terrain: Uint8Array; height: Uint8Array; trees: Uint8Array; deposit: Uint16Array; trap: Uint8Array; w: number; h: number };
  digMask: Uint8Array;
  digCount: number;
  units: Record<string, ArrayLike<number>> & { top: number };
  waypoints: [number, { x: number; y: number }[]][];
  proj: Record<string, ArrayLike<number>> & { top: number };
  buildings: Record<string, unknown>[];
  players: Record<string, unknown>[];
  ladders: { tile: number; team: number; owner: number; hp: number; until: number; tower: boolean }[];
  extreme: { banners: unknown[]; volleys: unknown[]; nextBanner: number; nextId: number } | null;
  mission: ReturnType<NonNullable<Sim['mission']>['saveState']> | null;
  ai: (unknown | null)[];
}

const UNIT_FIELDS = ['alive', 'gen', 'type', 'owner', 'state', 'sub', 'stance', 'layer', 'flags', 'x', 'y', 'hp', 'maxHp', 'face', 'tx', 'ty', 'goal', 'march', 'target', 'targetKind', 'cd', 'timer', 'carryRes', 'carryAmt', 'home', 'ax', 'ay', 'stuck', 'burn'] as const;
const PROJ_FIELDS = ['alive', 'kind', 'owner', 'sx', 'sy', 'sz', 'ex', 'ey', 'ez', 'arc', 't', 'T', 'dmg', 'dtype', 'splash', 'target', 'fire', 'bTarget'] as const;
const BLD_FIELDS = ['hp', 'maxHp', 'burn', 'workers', 'out', 'inBuf', 'recipe', 'timer', 'cycles', 'turret', 'turretCd', 'queue', 'claim', 'horses', 'activeUntil', 'staffed', 'cd', 'charges', 'repair', 'repairer', 'spawnTimer', 'off', 'prog'] as const;
const PLAYER_FIELDS = ['alive', 'gold', 'tax', 'ration', 'popularity', 'popTarget', 'factors', 'keepId', 'campfireId', 'lordId', 'horses', 'fear', 'foodTypes', 'foodShort', 'spawnTimer', 'leaveTimer', 'foodAcc', 'aleAcc', 'power', 'powerMax', 'abilityCd', 'banners', 'events', 'abilitiesUsed', 'defeatedTick', 'aidRequests', 'aleCover', 'relCover', 'placed', 'peasants', 'troops', 'team', 'name'] as const;

export function saveSim(sim: Sim): SimSave {
  const u = sim.units as unknown as Record<string, ArrayLike<number> & { slice(a: number, b: number): ArrayLike<number> }>;
  const units: SimSave['units'] = { top: sim.units.top } as SimSave['units'];
  for (const f of UNIT_FIELDS) units[f] = u[f].slice(0, sim.units.top);
  const p = sim.proj as unknown as Record<string, ArrayLike<number> & { slice(a: number, b: number): ArrayLike<number> }>;
  const proj: SimSave['proj'] = { top: sim.proj.top } as SimSave['proj'];
  for (const f of PROJ_FIELDS) proj[f] = p[f].slice(0, sim.proj.top);
  const buildings = [...sim.buildings.values()].map((b) => {
    const o: Record<string, unknown> = { id: b.id, type: b.type, owner: b.owner, x: b.x, y: b.y, rot: b.rot };
    for (const f of BLD_FIELDS) {
      const v = b[f] as unknown;
      o[f] = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : v;
    }
    return o;
  });
  const players = sim.players.map((pl) => {
    const o: Record<string, unknown> = {
      stock: Array.from(pl.stock),
      produced: Array.from(pl.produced),
      priceMul: Array.from(pl.priceMul),
      stats: { ...pl.stats, ever: Array.from(pl.stats.ever) },
    };
    for (const f of PLAYER_FIELDS) {
      const v = pl[f] as unknown;
      o[f] = v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
    return o;
  });
  return {
    v: 1,
    tick: sim.tick,
    rng: sim.rng.state,
    nextBid: sim.nextBid,
    winnerTeam: sim.winnerTeam,
    gameOver: sim.gameOver,
    map: { terrain: sim.map.terrain.slice(), height: sim.map.height.slice(), trees: sim.map.trees.slice(), deposit: sim.map.deposit.slice(), trap: sim.map.trap.slice(), w: sim.map.w, h: sim.map.h },
    digMask: sim.digMask.slice(),
    digCount: sim.digCount,
    units,
    waypoints: [...sim.units.waypoints.entries()].map(([k, v]) => [k, v.map((q) => ({ ...q }))]),
    proj,
    buildings,
    players,
    ladders: [...sim.ladders.values()].map((l) => ({ ...l })),
    extreme: sim.extreme ? { banners: JSON.parse(JSON.stringify(sim.extreme.banners)), volleys: JSON.parse(JSON.stringify(sim.extreme.volleys)), nextBanner: sim.extreme.nextBanner, nextId: sim.extreme.nextIdValue } : null,
    mission: sim.mission ? sim.mission.saveState() : null,
    ai: sim.players.map((pl) => (pl.ai ? (pl.ai as AiController).saveState() : null)),
  };
}

/** Lädt einen Spielstand in eine mit cfg.restore=true erzeugte Sim. */
export function restoreSim(sim: Sim, save: SimSave): void {
  if (save.v !== 1 || save.map.w !== sim.map.w || save.map.h !== sim.map.h) throw new Error('Spielstand passt nicht zur Karte');
  sim.tick = save.tick;
  sim.rng.state = save.rng;
  sim.nextBid = save.nextBid;
  sim.winnerTeam = save.winnerTeam;
  sim.gameOver = save.gameOver;
  sim.map.terrain.set(save.map.terrain);
  sim.map.height.set(save.map.height);
  sim.map.trees.set(save.map.trees);
  sim.map.deposit.set(save.map.deposit);
  sim.map.trap.set(save.map.trap);
  sim.digMask.set(save.digMask);
  sim.digCount = save.digCount;

  // Einheiten
  const us = sim.units as unknown as Record<string, { set(a: ArrayLike<number>): void }>;
  for (const f of UNIT_FIELDS) us[f].set(save.units[f]);
  sim.units.top = save.units.top;
  sim.units.rebuild();
  sim.units.waypoints.clear();
  for (const [k, v] of save.waypoints) sim.units.waypoints.set(k, v.map((q) => ({ ...q })));
  const ps = sim.proj as unknown as Record<string, { set(a: ArrayLike<number>): void }>;
  for (const f of PROJ_FIELDS) ps[f].set(save.proj[f]);
  sim.proj.top = save.proj.top;
  sim.proj.rebuild();

  // Gebäude
  sim.buildings.clear();
  sim.bldAt.fill(0);
  sim.nav.kind.fill(0);
  sim.nav.owner.fill(0);
  sim.nav.ladder.fill(0);
  for (const o of save.buildings) {
    const b = new Building(o.id as number, o.type as number, o.owner as number, o.x as number, o.y as number, o.rot as number);
    for (const f of BLD_FIELDS) (b as unknown as Record<string, unknown>)[f] = o[f];
    sim.registerBuilding(b);
  }
  // Spieler
  save.players.forEach((o, i) => {
    const pl: PlayerState = sim.players[i];
    pl.stock.set(o.stock as number[]);
    pl.produced.set(o.produced as number[]);
    pl.priceMul.set(o.priceMul as number[]);
    const st = o.stats as PlayerState['stats'] & { ever: number[] };
    Object.assign(pl.stats, st);
    pl.stats.ever = Int32Array.from(st.ever);
    for (const f of PLAYER_FIELDS) (pl as unknown as Record<string, unknown>)[f] = o[f];
  });
  sim.ladders.clear();
  for (const l of save.ladders) {
    sim.ladders.set(l.tile, { ...l });
    sim.nav.ladder[l.tile] |= 1 << l.team;
  }
  sim.nav.bump();
  sim.nav.invalidateAll();
  sim.recountAll();
  if (sim.extreme && save.extreme) {
    sim.extreme.banners = save.extreme.banners as typeof sim.extreme.banners;
    sim.extreme.volleys = save.extreme.volleys as typeof sim.extreme.volleys;
    sim.extreme.nextBanner = save.extreme.nextBanner;
    sim.extreme.nextIdValue = save.extreme.nextId;
  }
  if (sim.mission && save.mission) sim.mission.loadState(save.mission);
  save.ai.forEach((a, i) => {
    if (!a) return;
    const ai = sim.ensureAi(i);
    if (ai) ai.loadState(a as ReturnType<AiController['saveState']>);
  });
}
