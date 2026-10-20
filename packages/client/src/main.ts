import './style.css';
import { GameSetup, setLang } from '@strongpoly/shared';
import { AudioEngine } from './audio';
import { exposeAudioDebug } from './audio/debug';
import { LocalConnection } from './game/connection';
import { NetClient, RemoteConnection } from './game/netconn';
import { toggleHelp } from './ui/help';
import { Session } from './game/session';
import { Settings } from './game/settings';
import { GameScene } from './render/scene';
import { Screens } from './ui/screens';
import { openEncyclopedia } from './ui/encyclopedia';
import { h } from './ui/dom';
import { openEditor } from './editor/editor';
import { MISSIONS } from '@strongpoly/shared';
import { SaveStore, makeSave } from './game/saves';

// Icon-Galerie (?icons): rendern und den normalen Start überspringen
if (new URLSearchParams(location.search).has('icons')) {
  (await import('./ui/icons/gallery')).showGallery();
  await new Promise<never>(() => {});
}

// Tooltip-Testseite (?tooltips): alle Tooltips im Raster
if (new URLSearchParams(location.search).has('tooltips')) {
  (await import('./ui/tooltips/gallery')).showTooltipGallery();
  await new Promise<never>(() => {});
}

// Benchmark-Szene (?bench): eigener Einstieg ohne Netz und Sim-Worker
if (new URLSearchParams(location.search).has('bench')) {
  (await import('./bench')).startBench();
  await new Promise<never>(() => {});
}

// Vergleichsszenen/Screenshot-Werkzeug (?shots=early|town|castle|siege|figures|map|…): feste Kameras, fester Spielzustand
if (new URLSearchParams(location.search).has('shots')) {
  (await import('./showcase')).startShowcase();
  await new Promise<never>(() => {});
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const gs = new GameScene(canvas);
const settings = new Settings();
if (new URLSearchParams(location.search).get('blood') === '0') settings.blood = false;
const qParam = new URLSearchParams(location.search).get('quality');
if (qParam === 'low' || qParam === 'medium' || qParam === 'high') settings.quality = qParam;
const audio = new AudioEngine();
audio.configure(settings.audio());
exposeAudioDebug(audio);
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
    audio.configure(settings.audio());
  },
  missions: MISSIONS.map((m) => ({ name: m.name, desc: m.desc })),
  inGame: false,
  resume: null as (() => void) | null,
  saveGame: null as (() => void) | null,
  quitGame: null as (() => void) | null,
  surrender: null as (() => void) | null,
  openEncyclopedia: (() => openEncyclopedia()) as (() => void) | undefined,
  startSkirmish: (setup: GameSetup) => launch(setup, false),
  startOnline: (n: NetClient, me: number, setup: GameSetup) => {
    // Wiederverbindung: Sitzung läuft weiter, der Server schickt nur einen neuen Voll-Snapshot
    if (session && !session.conn.local && net === n) return;
    net = n;
    try {
      localStorage.setItem('strongpoly.resume', JSON.stringify({ url: n.url, name: n.name, at: Date.now() }));
    } catch {
      /* ignorieren */
    }
    n.onResumed = () => session?.hud.toast('Wieder verbunden');
    n.onClose = (inGame) => {
      if (inGame) session?.hud.toast('Verbindung verloren – verbinde neu…', true);
    };
    launch({ ...setup, me }, true, n);
  },
  clearResume: () => {
    try {
      localStorage.removeItem('strongpoly.resume');
    } catch {
      /* ignorieren */
    }
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
  setup = { ...setup, mission };
  const conn = online && n ? new RemoteConnection(n, setup.me) : new LocalConnection({ ...setup, dev: new URLSearchParams(location.search).get('dev') === '1' }, restore);
  const s = new Session(gs, conn, ui, {
    setup,
    extreme: setup.extreme,
    mission: mission ?? null,
    onExit: () => exitToMenu(),
    onMenu: () => showPauseMenu(),
    settings,
    audio,
    onHelp: () => toggleHelp(ui),
    onEncyclopedia: () => hooks.openEncyclopedia?.(),
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
  hooks.surrender = () => s.send({ c: 'surrender' });
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
  hooks.surrender = null;
  if (wasOnline && net && net.connected) {
    // Raum bleibt bestehen: zurück zur Lobby (Server setzt den Raum nach dem Spiel zurück)
    hooks.clearResume();
    audio.playTheme('menu');
    screens.returnToLobby(net);
    return;
  }
  net?.close();
  net = null;
  hooks.clearResume();
  screens.playing = false;
  audio.playTheme('menu');
  screens.main();
}

audio.playTheme('menu');
screens.main();
try {
  const r = JSON.parse(localStorage.getItem('strongpoly.resume') ?? 'null') as { url: string; name: string; at: number } | null;
  if (r && Date.now() - r.at < 6 * 3600 * 1000) screens.resumeOnline(r.url, r.name);
  else if (r) hooks.clearResume();
} catch {
  /* ignorieren */
}
const params = new URLSearchParams(location.search);
if (params.get('lang') === 'en') setLang('en');
// Enzyklopädie direkt öffnen (?enc=building/quarry), z. B. für Tests und Verweise
if (params.has('enc')) openEncyclopedia(params.get('enc') || undefined);
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
(window as unknown as Record<string, unknown>).net = () => net;
void h;
