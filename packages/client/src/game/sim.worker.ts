import { encode } from '@msgpack/msgpack';
import { GameHost, generateMap, mapFromJson, Sim, SimConfig } from '@strongpoly/shared';
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

function post(m: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(m, transfer);
}

function sendSnap(snap: unknown): void {
  const data = encode(snap);
  post({ t: 'snap', data }, [data.buffer]);
}

function buildSim(setup: GameSetup): Sim {
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
  };
  return new Sim(cfg);
}

function begin(sim: Sim, setup: GameSetup): void {
  host = new GameHost(sim);
  host.speed = setup.speed ?? 1;
  me = setup.me;
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

ctx.onmessage = (ev) => {
  const m = ev.data;
  try {
    switch (m.t) {
      case 'start':
        begin(buildSim(m.setup), m.setup);
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
