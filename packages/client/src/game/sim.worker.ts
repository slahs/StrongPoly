import { encode } from '@msgpack/msgpack';
import { GameHost, generateMap, mapFromJson, restoreSim, saveSim, Sim, SimConfig, SimSave } from '@strongpoly/shared';
import type { FromWorker, GameSetup, ToWorker } from './protocol';

interface WorkerCtx {
  postMessage(m: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
}
const ctx = self as unknown as WorkerCtx;
let host: GameHost | null = null;
let me = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let last = 0;
let tickCount = 0;
let devEnabled = false;

function post(m: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(m, transfer);
}

function sendSnap(snap: unknown): void {
  const data = encode(snap);
  post({ t: 'snap', data }, [data.buffer]);
}

function buildSim(setup: GameSetup, restore = false): Sim {
  const map = 'gen' in setup.map ? generateMap(setup.map.gen) : mapFromJson(setup.map.json);
  const cfg: SimConfig = {
    map,
    players: setup.players,
    seed: setup.seed,
    startGold: setup.startGold,
    troopLimit: setup.troopLimit,
    fog: setup.fog,
    extreme: setup.extreme,
    mission: setup.mission,
    startRes: setup.startRes,
    restore,
  };
  return new Sim(cfg);
}

function begin(sim: Sim, setup: GameSetup): void {
  host = new GameHost(sim);
  host.speed = setup.speed ?? 1;
  me = setup.me;
  devEnabled = !!setup.dev;
  sendSnap(host.fullSnapshot());
  post({ t: 'me', view: host.view(me) });
  last = performance.now();
  if (timer) clearInterval(timer);
  timer = setInterval(loop, 40);
}

function loop(): void {
  if (!host) return;
  const now = performance.now();
  const dt = Math.min(250, now - last);
  last = now;
  const snaps = host.advance(dt);
  for (const s of snaps) {
    sendSnap(s);
    tickCount++;
    if (tickCount % 5 === 0) post({ t: 'me', view: host.view(me) });
    if (tickCount % 20 === 0) post({ t: 'info', tickMs: host.avgTickMs, tick: host.sim.tick, units: host.sim.units.count });
  }
}

function devOp(sim: Sim, op: string, a: Record<string, number>): void {
  if (op === 'spawn') {
    for (let i = 0; i < (a.n ?? 1); i++) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(a.n ?? 1)));
      const s = sim.spawnUnit(a.type, a.owner, a.x + (i % cols) * 0.7, a.y + Math.floor(i / cols) * 0.7);
      if (s >= 0) {
        sim.units.stance[s] = a.stance ?? 2;
        sim.units.ax[s] = sim.units.x[s];
        sim.units.ay[s] = sim.units.y[s];
      }
    }
  } else if (op === 'gold') sim.players[a.owner ?? 0].gold += a.n ?? 1000;
  else if (op === 'res') sim.addStock(a.owner ?? 0, a.res, a.n ?? 100);
  else if (op === 'build') sim.addBuilding(a.owner ?? 0, a.type, a.x, a.y, a.rot ?? 0);
  else if (op === 'turret') {
    // Prüfhilfe: Geschütz (1 Ballista, 2 Mangonel) auf das Gebäude an (x, y) setzen
    const b = sim.buildingAtTile(a.x, a.y);
    if (b) b.turret = a.kind === 2 ? 2 : 1;
  }
}

ctx.onmessage = (ev) => {
  const m = ev.data;
  try {
    switch (m.t) {
      case 'start':
        begin(buildSim(m.setup), m.setup);
        break;
      case 'load': {
        const sim = buildSim(m.setup, true);
        restoreSim(sim, m.state as SimSave);
        begin(sim, m.setup);
        break;
      }
      case 'save':
        post({ t: 'saved', save: host ? saveSim(host.sim) : null });
        break;
      case 'cmd':
        host?.submit(me, m.cmd);
        break;
      case 'speed':
        if (host) host.speed = Math.max(0.25, Math.min(4, m.speed));
        break;
      case 'pause':
        if (host) host.paused = m.paused;
        break;
      case 'dev':
        if (devEnabled && host) devOp(host.sim, m.op, m.args);
        break;
      case 'stop':
        if (timer) clearInterval(timer);
        host = null;
        break;
      default:
        break;
    }
  } catch (e) {
    post({ t: 'error', message: String((e as Error)?.stack ?? e) });
  }
};
