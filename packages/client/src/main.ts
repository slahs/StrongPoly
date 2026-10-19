import './style.css';
import { Command, DEFAULT_TROOP_LIMIT, START_GOLD } from '@strongpoly/shared';
import { AudioEngine } from './audio/audio';
import { LocalConnection } from './game/connection';
import type { GameSetup } from './game/protocol';
import { Session } from './game/session';
import { Settings } from './game/settings';
import { GameScene } from './render/scene';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const gs = new GameScene(canvas);
const settings = new Settings();
const audio = new AudioEngine();
let session: Session | null = null;

function startSkirmish(setup: GameSetup): void {
  session?.destroy();
  const conn = new LocalConnection(setup);
  session = new Session(gs, conn, ui, {
    setup,
    extreme: setup.extreme,
    onExit: () => {},
    onMenu: () => {},
    settings,
    audio,
  });
}

const params = new URLSearchParams(location.search);
const setup: GameSetup = {
  map: { gen: { seed: Number(params.get('seed') ?? 1), size: Number(params.get('size') ?? 160), players: 2 } },
  players: [
    { name: 'Spieler', team: 0, kind: 'human' },
    { name: 'Gegner', team: 1, kind: 'ai', ai: 0 },
  ],
  seed: 1,
  startGold: START_GOLD,
  troopLimit: DEFAULT_TROOP_LIMIT,
  fog: params.get('fog') === '1',
  extreme: false,
  me: 0,
};
startSkirmish(setup);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  session?.frame(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as Record<string, unknown>).session = () => session;
void ({} as Command);
