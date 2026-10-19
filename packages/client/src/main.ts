import './style.css';
import { GameSetup } from '@strongpoly/shared';
import { AudioEngine } from './audio/audio';
import { LocalConnection } from './game/connection';
import { NetClient, RemoteConnection } from './game/netconn';
import { Session } from './game/session';
import { Settings } from './game/settings';
import { GameScene } from './render/scene';
import { Screens } from './ui/screens';
import { h } from './ui/dom';
import { openEditor } from './editor/editor';
import { MISSIONS } from '@strongpoly/shared';
import { SaveStore, makeSave } from './game/saves';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const gs = new GameScene(canvas);
const settings = new Settings();
const audio = new AudioEngine();
audio.setVolume(settings.volume);
const saves = new SaveStore();
let session: Session | null = null;
let net: NetClient | null = null;
let editorClose: (() => void) | null = null;

const hooks = {
  settings,
  audio,
  applySettings: () => {
    session?.applySettings();
    gs.applyGfx({ shadows: settings.shadows, quality: settings.quality });
    audio.setVolume(settings.volume);
  },
  missions: MISSIONS.map((m) => ({ name: m.name, desc: m.desc })),
  inGame: false,
  resume: null as (() => void) | null,
  saveGame: null as (() => void) | null,
  quitGame: null as (() => void) | null,
  startSkirmish: (setup: GameSetup) => launch(setup, false),
  startOnline: (n: NetClient, me: number, setup: GameSetup) => {
    net = n;
    launch({ ...setup, me }, true, n);
  },
  startMission: (i: number) => {
    const m = MISSIONS[i];
    launch(m.setup(), false, undefined, m.id);
  },
  openEditor: () => {
    screens.hide();
    editorClose = openEditor(gs, ui, (testMap) => {
      editorClose = null;
      if (testMap) {
        launch(
          {
            map: { json: testMap },
            players: [
              { name: 'Du', team: 0, kind: 'human' },
              { name: 'Gegner', team: 1, kind: 'ai', ai: Math.floor(Math.random() * 9), difficulty: 1 },
            ],
            seed: 1,
            startGold: 1500,
            troopLimit: 1000,
            fog: false,
            extreme: false,
            me: 0,
          },
          false,
        );
      } else screens.main();
    });
  },
  loadGame: (key: string) => {
    void saves.load(key).then((save) => {
      if (save) launch(save.setup, false, undefined, undefined, save.state);
    });
  },
  listSaves: () => saves.list(),
  deleteSave: (key: string) => saves.remove(key),
};
const screens = new Screens(ui, hooks);

function launch(setup: GameSetup, online: boolean, n?: NetClient, missionId?: string, restore?: unknown): void {
  session?.destroy();
  screens.hide();
  const mission = missionId ?? setup.mission;
  const conn = online && n ? new RemoteConnection(n, setup.me) : new LocalConnection({ ...setup, mission, dev: new URLSearchParams(location.search).get('dev') === '1' }, restore);
  const s = new Session(gs, conn, ui, {
    setup,
    extreme: setup.extreme,
    mission: mission ?? null,
    onExit: () => exitToMenu(),
    onMenu: () => showPauseMenu(),
    settings,
    audio,
  });
  session = s;
  s.applySettings();
  hooks.inGame = true;
  hooks.resume = () => {
    screens.hide();
    if (conn.local && s.paused) s.togglePause();
  };
  hooks.saveGame = conn.local
    ? () => {
        void conn.save?.().then((state) => {
          void saves.save(makeSave(setup, state, `Spiel ${new Date().toLocaleTimeString()}`)).then(() => s.hud.toast('Spiel gespeichert'));
        });
        screens.hide();
        if (s.paused) s.togglePause();
      }
    : null;
  hooks.quitGame = () => exitToMenu();
}

function showPauseMenu(): void {
  if (!session) return;
  if (session.conn.local && !session.paused) session.togglePause();
  screens.main();
}

function exitToMenu(): void {
  const wasOnline = !!session && !session.conn.local;
  session?.destroy();
  session = null;
  hooks.inGame = false;
  hooks.resume = null;
  hooks.saveGame = null;
  hooks.quitGame = null;
  if (wasOnline && net && net.connected) {
    // Raum bleibt bestehen: zurück zur Lobby (Server setzt den Raum nach dem Spiel zurück)
    screens.returnToLobby(net);
    return;
  }
  net?.close();
  net = null;
  screens.playing = false;
  screens.main();
}

screens.main();
const params = new URLSearchParams(location.search);
if (params.get('quick') === '1') {
  // Schnellstart für Entwicklung/Tests
  const size = Number(params.get('size') ?? 128);
  launch(
    {
      map: { gen: { seed: Number(params.get('seed') ?? 1), size, players: 2 } },
      players: [
        { name: 'Du', team: 0, kind: 'human' },
        { name: 'Gegner', team: 1, kind: 'ai', ai: Number(params.get('ai') ?? 0), difficulty: 1 },
      ],
      seed: 1,
      startGold: 1500,
      troopLimit: 1000,
      fog: params.get('fog') === '1',
      extreme: params.get('extreme') === '1',
      me: 0,
    },
    false,
  );
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!editorClose) session?.frame(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as Record<string, unknown>).session = () => session;
void h;
