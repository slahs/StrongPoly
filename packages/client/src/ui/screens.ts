import {
  AI_PROFILES,
  DEFAULT_ROOM_SETTINGS,
  DEFAULT_TROOP_LIMIT,
  GameSetup,
  MapJson,
  PLAYER_COLORS,
  PLAYER_COLOR_NAMES,
  PlayerSetup,
  RoomListItem,
  RoomSettings,
  RoomState,
  ServerMsg,
  START_GOLD,
  mapFromJson,
} from '@strongpoly/shared';
import type { AudioEngine } from '../audio/audio';
import { NetClient } from '../game/netconn';
import { HOTKEY_LABELS, DEFAULT_HOTKEYS, HotkeyAction, keyLabel, loadHotkeys, saveHotkeys } from '../game/hotkeys';
import type { Settings } from '../game/settings';
import { clear, h, hex } from './dom';

export interface AppHooks {
  startSkirmish(setup: GameSetup): void;
  startOnline(net: NetClient, me: number, setup: GameSetup): void;
  clearResume(): void;
  startMission(index: number): void;
  openEditor(): void;
  loadGame(slot: string): void;
  listSaves(): Promise<{ key: string; name: string; time: number }[]>;
  deleteSave(key: string): Promise<void>;
  settings: Settings;
  audio: AudioEngine;
  applySettings(): void;
  missions: { name: string; desc: string }[];
  resume: (() => void) | null;
  inGame: boolean;
  saveGame: (() => void) | null;
  quitGame: (() => void) | null;
}

interface SkSlot {
  kind: 'you' | 'ai';
  ai: number; // -1 = zufällig
  difficulty: number;
  team: number;
  color: number;
}

/** Hauptmenü, Gefecht-Einstellungen, Online-Lobby, Optionen. */
export class Screens {
  private el: HTMLElement | null = null;
  private net: NetClient | null = null;
  private room: RoomState | null = null;
  private you = -1;
  private chatLog: { from: string; text: string }[] = [];
  private rooms: RoomListItem[] = [];
  private onlineName = '';
  private roomRender: (() => void) | null = null;
  private lastError = '';
  /** true, solange ein Online-Spiel läuft (Lobby-Updates dürfen das Spiel nicht überdecken) */
  playing = false;

  constructor(
    private root: HTMLElement,
    private hooks: AppHooks,
  ) {
    try {
      this.onlineName = localStorage.getItem('strongpoly.name') ?? 'Lord ' + Math.floor(Math.random() * 900 + 100);
    } catch {
      this.onlineName = 'Lord';
    }
  }

  /** Nach einem Online-Spiel zurück in Raum/Lobby */
  returnToLobby(net: NetClient): void {
    this.playing = false;
    this.net = net;
    net.onControl = (m) => this.onNetMsg(m);
    if (this.room) this.roomView();
    else this.lobbyView();
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }

  private show(content: HTMLElement[]): HTMLElement {
    this.hide();
    const box = h('div', { class: 'panel box' }, ...content);
    this.el = h('div', { class: 'screen' }, box);
    this.root.append(this.el);
    return box;
  }

  // ---------------- Hauptmenü ----------------
  main(): void {
    const btns = h('div', { class: 'menu-btns' });
    const add = (text: string, fn: () => void, primary = false) => btns.append(h('button', { text, class: primary ? 'primary' : '', onclick: fn }));
    if (this.hooks.inGame) {
      add('Fortsetzen', () => this.hooks.resume?.(), true);
      if (this.hooks.saveGame) add('Spiel speichern', () => this.hooks.saveGame?.());
      add('Optionen', () => this.options());
      add('Spiel beenden', () => this.hooks.quitGame?.());
    } else {
      add('Gefecht gegen KI', () => this.skirmish(), true);
      add('Online spielen', () => this.online());
      add('Tutorial-Missionen', () => this.missions());
      add('Karteneditor', () => this.hooks.openEditor());
      add('Spiel laden', () => this.loadMenu());
      add('Optionen', () => this.options());
    }
    this.show([
      h('h1', { text: 'STRONGPOLY' }),
      h('div', { class: 'sub', text: 'Burgenbau-Echtzeitstrategie im Low-Poly-Stil' }),
      btns,
      h('div', { class: 'crumb', style: 'margin-top:18px', text: 'Alle Namen, Modelle und Klänge sind Eigenentwürfe.' }),
    ]);
  }

  private backButton(to: () => void): HTMLElement {
    return h('button', { text: '← Zurück', onclick: to });
  }

  // ---------------- Missionen ----------------
  missions(): void {
    const list = h('div', { class: 'list' });
    this.hooks.missions.forEach((m, i) => {
      list.append(h('div', { class: 'li', onclick: () => this.hooks.startMission(i) }, h('span', {}, h('b', { text: `${i + 1}. ${m.name}` }), h('div', { class: 'crumb', text: m.desc })), h('button', { text: 'Starten', class: 'primary' })));
    });
    this.show([h('h2', { text: 'Tutorial-Missionen' }), list, h('div', { style: 'margin-top:10px' }, this.backButton(() => this.main()))]);
  }

  // ---------------- Laden ----------------
  loadMenu(): void {
    const list = h('div', { class: 'list' }, h('div', { class: 'li', text: 'Lade…' }));
    const box = this.show([h('h2', { text: 'Spiel laden' }), list, h('div', { style: 'margin-top:10px' }, this.backButton(() => this.main()))]);
    void box;
    void this.hooks.listSaves().then((saves) => {
      clear(list);
      if (!saves.length) list.append(h('div', { class: 'li', text: 'Keine Spielstände vorhanden.' }));
      for (const s of saves.sort((a, b) => b.time - a.time)) {
        list.append(
          h('div', { class: 'li' }, h('span', { text: `${s.name} – ${new Date(s.time).toLocaleString()}` }), h('span', {}, h('button', { text: 'Laden', class: 'primary', onclick: () => this.hooks.loadGame(s.key) }), ' ', h('button', { class: 'danger', text: '✕', onclick: () => void this.hooks.deleteSave(s.key).then(() => this.loadMenu()) }))),
        );
      }
    });
  }

  // ---------------- Gefecht ----------------
  private sk = {
    seed: Math.floor(Math.random() * 99999) + 1,
    size: 160,
    water: 0.35,
    trees: 0.5,
    hills: 0.6,
    gold: START_GOLD,
    troops: DEFAULT_TROOP_LIMIT,
    fog: false,
    extreme: false,
    speed: 1,
    slots: [
      { kind: 'you', ai: -1, difficulty: 1, team: 0, color: 0 },
      { kind: 'ai', ai: -1, difficulty: 1, team: 1, color: 1 },
    ] as SkSlot[],
    customMap: null as MapJson | null,
  };

  skirmish(): void {
    const sk = this.sk;
    const box = h('div');
    const render = () => {
      clear(box);
      const num = (label: string, key: 'seed' | 'gold' | 'troops', min: number, max: number) =>
        [h('span', { text: label }), h('input', { type: 'number', value: String(sk[key]), min: String(min), max: String(max), oninput: (e) => ((sk[key] as number) = Number((e.target as HTMLInputElement).value)) })];
      const rnd = h('button', { text: '🎲', title: 'Zufälliger Seed', onclick: () => { sk.seed = Math.floor(Math.random() * 99999) + 1; render(); } });
      const sizeSel = h('select', { onchange: (e) => (sk.size = Number((e.target as HTMLSelectElement).value)) });
      for (const s of [96, 128, 160, 200, 256, 320, 400]) sizeSel.append(h('option', { value: String(s), text: `${s}×${s}`, selected: s === sk.size }));
      const slider = (label: string, key: 'water' | 'trees' | 'hills') => [
        h('span', { text: label }),
        h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(sk[key]), oninput: (e) => ((sk[key] as number) = Number((e.target as HTMLInputElement).value)) }),
      ];
      const chk = (label: string, key: 'fog' | 'extreme') => [
        h('span', { text: label }),
        h('input', { type: 'checkbox', checked: sk[key], onchange: (e) => ((sk[key] as boolean) = (e.target as HTMLInputElement).checked) }),
      ];
      const speed = h('select', { onchange: (e) => (sk.speed = Number((e.target as HTMLSelectElement).value)) });
      for (const s of [0.5, 1, 1.5, 2, 3]) speed.append(h('option', { value: String(s), text: `${s}×`, selected: s === sk.speed }));
      const form = h('div', { class: 'form' },
        ...(sk.customMap ? [h('span', { text: 'Karte' }), h('div', { class: 'row' }, h('b', { text: sk.customMap.name || 'Eigene Karte' }), h('button', { text: 'Zufallskarte', onclick: () => { sk.customMap = null; render(); } }))]
          : [...num('Seed', 'seed', 1, 2 ** 31), h('span', { text: 'Größe' }), h('div', { class: 'row' }, sizeSel, rnd), ...slider('Wasser', 'water'), ...slider('Wald', 'trees'), ...slider('Hügel', 'hills')]),
        h('span', { text: 'Eigene Karte (JSON)' }),
        h('input', { type: 'file', accept: '.json,application/json', onchange: (e) => this.readMapFile(e, (m) => { sk.customMap = m; render(); }) }),
        ...num('Startgold', 'gold', 0, 20000),
        ...num('Truppenlimit', 'troops', 50, 3000),
        ...chk('Kriegsnebel', 'fog'),
        ...chk('Extreme-Modus', 'extreme'),
        h('span', { text: 'Spielgeschwindigkeit' }),
        speed,
      );
      const slots = h('div', { class: 'slots' });
      sk.slots.forEach((s, i) => {
        const team = h('select', { onchange: (e) => (s.team = Number((e.target as HTMLSelectElement).value)) });
        for (let t = 0; t < 8; t++) team.append(h('option', { value: String(t), text: `Team ${t + 1}`, selected: t === s.team }));
        const persona = h('select', { onchange: (e) => (s.ai = Number((e.target as HTMLSelectElement).value)) });
        persona.append(h('option', { value: '-1', text: 'Zufällige KI', selected: s.ai === -1 }));
        AI_PROFILES.forEach((p) => persona.append(h('option', { value: String(p.id), text: `${p.name} – ${p.title}`, selected: s.ai === p.id, title: p.desc })));
        const diff = h('select', { onchange: (e) => (s.difficulty = Number((e.target as HTMLSelectElement).value)) });
        ['Fair', 'Leicht+', 'Mittel+', 'Schwer+'].forEach((n, k) => diff.append(h('option', { value: String(k), text: n, selected: k === s.difficulty })));
        slots.append(
          h('div', { class: 'slot', style: 'grid-template-columns:22px 1fr 190px 90px 80px 30px' },
            h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[s.color]) }, title: PLAYER_COLOR_NAMES[s.color] }),
            s.kind === 'you' ? h('b', { text: 'Du' }) : persona,
            s.kind === 'you' ? h('span') : diff,
            team,
            h('button', { text: '↻', title: 'Farbe', onclick: () => { s.color = (s.color + 1) % 8; render(); } }),
            i >= 2 ? h('button', { text: '✕', onclick: () => { sk.slots.splice(i, 1); sk.slots.forEach((q, k) => (q.color = k % 8)); render(); } }) : h('span'),
          ),
        );
      });
      box.append(
        form,
        h('h3', { text: 'Spieler' }),
        slots,
        h('button', { text: '+ KI-Lord hinzufügen', disabled: sk.slots.length >= 8, onclick: () => { sk.slots.push({ kind: 'ai', ai: -1, difficulty: 1, team: sk.slots.length % 8, color: sk.slots.length % 8 }); render(); } }),
        h('div', { class: 'row', style: 'margin-top:14px' }, this.backButton(() => this.main()), h('button', { class: 'primary', text: 'Spiel starten', onclick: () => this.startSkirmish() })),
      );
    };
    this.show([h('h2', { text: 'Gefecht gegen KI' }), box]);
    render();
  }

  private readMapFile(e: Event, cb: (m: MapJson) => void): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    void f.text().then((t) => {
      try {
        const j = JSON.parse(t) as MapJson;
        mapFromJson(j);
        cb(j);
      } catch (err) {
        alert('Kartendatei ungültig: ' + (err as Error).message);
      }
    });
  }

  private startSkirmish(): void {
    const sk = this.sk;
    const players: PlayerSetup[] = sk.slots.map((s, i) => ({
      name: s.kind === 'you' ? 'Du' : AI_PROFILES[(s.ai >= 0 ? s.ai : Math.floor(Math.random() * AI_PROFILES.length)) % AI_PROFILES.length].name,
      team: s.team,
      kind: s.kind === 'you' ? 'human' : 'ai',
      ai: s.ai >= 0 ? s.ai : Math.floor(Math.random() * AI_PROFILES.length),
      difficulty: s.difficulty,
      color: s.color,
    }));
    if (new Set(players.map((p) => p.team)).size < 2) {
      alert('Es werden mindestens zwei Teams benötigt.');
      return;
    }
    players.forEach((p, i) => {
      if (p.kind === 'ai') p.name = AI_PROFILES[p.ai ?? 0].name;
      void i;
    });
    const setup: GameSetup = {
      map: sk.customMap ? { json: sk.customMap } : { gen: { seed: sk.seed, size: sk.size, players: players.length, water: sk.water, trees: sk.trees, hills: sk.hills } },
      players,
      seed: sk.seed,
      startGold: sk.gold,
      troopLimit: sk.troops,
      fog: sk.fog,
      extreme: sk.extreme,
      speed: sk.speed,
      me: 0,
    };
    this.hide();
    this.hooks.startSkirmish(setup);
  }

  // ---------------- Online ----------------
  /** Nach Seiten-Neuladen: zurück in die laufende Online-Partie (der Server hält den Slot per Token). */
  resumeOnline(url: string, name: string): void {
    this.onlineName = name;
    this.show([h('h2', { text: 'Verbinde erneut…' }), h('div', { class: 'crumb', text: 'Rückkehr in die laufende Partie' })]);
    this.net?.close();
    const net = new NetClient();
    this.net = net;
    let resumed = false;
    net.onControl = (m) => {
      if (m.t === 'welcome') resumed = !!m.resumed;
      this.onNetMsg(m);
    };
    net.onClose = () => {};
    net
      .connect(url, name)
      .then(() => {
        // Keine laufende Partie mehr: Marke löschen und in die Lobby
        window.setTimeout(() => {
          if (!resumed && !this.playing) {
            this.hooks.clearResume();
            this.lobbyView();
          }
        }, 1500);
      })
      .catch(() => {
        this.hooks.clearResume();
        this.lastError = 'Die Partie ist nicht mehr erreichbar.';
        this.main();
      });
  }

  online(): void {
    const status = h('div', { class: 'crumb', text: this.lastError });
    const nameIn = h('input', { type: 'text', value: this.onlineName, maxLength: 24 });
    const urlIn = h('input', { type: 'text', value: NetClient.defaultUrl(), style: 'width:280px' });
    const connect = async () => {
      this.onlineName = nameIn.value.trim() || 'Lord';
      try {
        localStorage.setItem('strongpoly.name', this.onlineName);
      } catch {
        /* ignorieren */
      }
      status.textContent = 'Verbinde…';
      this.net?.close();
      const net = new NetClient();
      this.net = net;
      net.onControl = (m) => this.onNetMsg(m);
      net.onClose = (inGame) => {
        if (!inGame) this.lastError = 'Verbindung verloren – versuche erneut…';
      };
      try {
        await net.connect(urlIn.value.trim(), this.onlineName);
        this.lobbyView();
      } catch (e) {
        status.textContent = (e as Error).message;
      }
    };
    this.show([
      h('h2', { text: 'Online spielen' }),
      h('div', { class: 'form' }, h('span', { text: 'Dein Name' }), nameIn, h('span', { text: 'Server' }), urlIn),
      status,
      h('div', { class: 'row', style: 'margin-top:12px' }, this.backButton(() => this.main()), h('button', { class: 'primary', text: 'Verbinden', onclick: () => void connect() })),
    ]);
  }

  private onNetMsg(m: ServerMsg): void {
    switch (m.t) {
      case 'rooms':
        this.rooms = m.list;
        if (!this.room && !this.playing) this.lobbyView();
        break;
      case 'room':
        this.room = m.room;
        this.you = m.you;
        if (this.playing) break;
        if (this.room) this.roomView();
        else this.lobbyView();
        break;
      case 'chat':
        this.chatLog.push({ from: m.from, text: m.text });
        if (this.chatLog.length > 80) this.chatLog.shift();
        this.roomRender?.();
        break;
      case 'error':
        this.lastError = m.message;
        this.toastError(m.message);
        break;
      case 'start':
        this.hide();
        this.playing = true;
        this.hooks.startOnline(this.net!, m.me, m.setup);
        break;
      case 'end':
        break;
      default:
        break;
    }
  }

  private toastError(text: string): void {
    const t = h('div', { class: 'toast bad', text, style: 'position:fixed;right:20px;top:20px;z-index:99;pointer-events:none' });
    document.body.append(t);
    setTimeout(() => t.remove(), 4000);
  }

  private lobbyView(): void {
    this.roomRender = null;
    const net = this.net!;
    const list = h('div', { class: 'list' });
    if (!this.rooms.length) list.append(h('div', { class: 'li', text: 'Keine Räume – erstelle einen neuen.' }));
    for (const r of this.rooms) {
      list.append(h('div', { class: 'li', onclick: () => !r.playing && net.sendMsg({ t: 'join', room: r.id }) }, h('span', {}, h('b', { text: r.name }), ` (${r.host}) · ${r.size}×${r.size}`), h('span', { text: r.playing ? 'läuft' : `${r.players}/${r.max}` })));
    }
    this.show([
      h('h2', { text: `Lobby – ${net.name}` }),
      list,
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { text: '← Trennen', onclick: () => { net.close(); this.net = null; this.main(); } }),
        h('button', { text: 'Aktualisieren', onclick: () => net.sendMsg({ t: 'list' }) }),
        h('button', { class: 'primary', text: 'Raum erstellen', onclick: () => net.sendMsg({ t: 'create', settings: { ...DEFAULT_ROOM_SETTINGS, name: `${net.name}s Spiel`, seed: Math.floor(Math.random() * 99999) + 1 } }) }),
      ),
    ]);
    net.sendMsg({ t: 'list' });
  }

  private roomView(): void {
    const net = this.net!;
    const room = this.room!;
    const isHost = room.host === net.id;
    const st = room.settings;
    const set = (patch: Partial<RoomSettings>) => net.sendMsg({ t: 'settings', settings: patch });
    const numIn = (label: string, key: 'seed' | 'startGold' | 'troopLimit', min: number, max: number) => [
      h('span', { text: label }),
      h('input', { type: 'number', value: String(st[key]), min: String(min), max: String(max), disabled: !isHost, onchange: (e) => set({ [key]: Number((e.target as HTMLInputElement).value) } as Partial<RoomSettings>) }),
    ];
    const sizeSel = h('select', { disabled: !isHost, onchange: (e) => set({ size: Number((e.target as HTMLSelectElement).value) }) });
    for (const s of [96, 128, 160, 200, 256, 320, 400]) sizeSel.append(h('option', { value: String(s), text: `${s}×${s}`, selected: s === st.size }));
    const maxSel = h('select', { disabled: !isHost, onchange: (e) => set({ maxPlayers: Number((e.target as HTMLSelectElement).value) }) });
    for (let n = 2; n <= 8; n++) maxSel.append(h('option', { value: String(n), text: `${n}`, selected: n === st.maxPlayers }));
    const speedSel = h('select', { disabled: !isHost, onchange: (e) => set({ speed: Number((e.target as HTMLSelectElement).value) }) });
    for (const s of [0.5, 1, 1.5, 2, 3]) speedSel.append(h('option', { value: String(s), text: `${s}×`, selected: s === st.speed }));
    const form = h('div', { class: 'form', style: 'grid-template-columns:150px 1fr 150px 1fr' },
      h('span', { text: 'Raumname' }), h('input', { type: 'text', value: st.name, disabled: !isHost, onchange: (e) => set({ name: (e.target as HTMLInputElement).value }) }),
      ...numIn('Seed', 'seed', 0, 2 ** 31),
      h('span', { text: 'Kartengröße' }), sizeSel,
      h('span', { text: 'Max. Spieler' }), maxSel,
      ...numIn('Startgold', 'startGold', 0, 20000),
      ...numIn('Truppenlimit', 'troopLimit', 50, 3000),
      h('span', { text: 'Geschwindigkeit' }), speedSel,
      h('span', { text: 'Kriegsnebel' }), h('input', { type: 'checkbox', checked: st.fog, disabled: !isHost, onchange: (e) => set({ fog: (e.target as HTMLInputElement).checked }) }),
      h('span', { text: 'Extreme-Modus' }), h('input', { type: 'checkbox', checked: st.extreme, disabled: !isHost, onchange: (e) => set({ extreme: (e.target as HTMLInputElement).checked }) }),
    );
    const slots = h('div', { class: 'slots' });
    room.slots.forEach((s, i) => {
      if (i >= st.maxPlayers && s.kind === 'closed') return;
      const mine = s.kind === 'human' && s.client === net.id;
      const team = h('select', { disabled: !(isHost || mine), onchange: (e) => net.sendMsg({ t: 'slot', index: i, patch: { team: Number((e.target as HTMLSelectElement).value) } }) });
      for (let t = 0; t < 8; t++) team.append(h('option', { value: String(t), text: `Team ${t + 1}`, selected: t === s.team }));
      let who: HTMLElement;
      if (s.kind === 'human') who = h('b', { text: `${s.name}${s.client === room.host ? ' ★' : ''}${s.connected ? '' : ' (getrennt)'}` });
      else if (isHost) {
        const kindSel = h('select', { onchange: (e) => net.sendMsg({ t: 'slot', index: i, patch: { kind: (e.target as HTMLSelectElement).value as 'ai' | 'open' | 'closed' } }) });
        for (const [k, l] of [['open', 'Offen'], ['ai', 'KI-Lord'], ['closed', 'Geschlossen']]) kindSel.append(h('option', { value: k, text: l, selected: s.kind === k }));
        who = kindSel;
      } else who = h('span', { text: s.kind === 'ai' ? 'KI-Lord' : s.kind === 'open' ? 'Offen' : 'Geschlossen' });
      let extra: HTMLElement = h('span');
      if (s.kind === 'ai') {
        const persona = h('select', { disabled: !isHost, onchange: (e) => net.sendMsg({ t: 'slot', index: i, patch: { ai: Number((e.target as HTMLSelectElement).value), name: AI_PROFILES[Number((e.target as HTMLSelectElement).value)].name } }) });
        AI_PROFILES.forEach((p) => persona.append(h('option', { value: String(p.id), text: p.name, selected: s.ai === p.id })));
        extra = persona;
      } else if (s.kind === 'human') extra = h('span', { text: s.ready ? '✔ bereit' : '…' });
      slots.append(
        h('div', { class: 'slot', style: 'grid-template-columns:22px 150px 1fr 90px 70px' },
          h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[s.color]) }, onclick: () => (isHost || mine) && net.sendMsg({ t: 'slot', index: i, patch: { color: (s.color + 1) % 8 } }) }),
          who, extra, team,
          s.kind === 'ai' && isHost ? (() => { const d = h('select', { onchange: (e) => net.sendMsg({ t: 'slot', index: i, patch: { difficulty: Number((e.target as HTMLSelectElement).value) } }) }); ['Fair', 'Leicht+', 'Mittel+', 'Schwer+'].forEach((n, k) => d.append(h('option', { value: String(k), text: n, selected: s.difficulty === k }))); return d; })() : h('span'),
        ),
      );
    });
    const chat = h('div', { class: 'chat' });
    const fill = () => {
      clear(chat);
      for (const m of this.chatLog) chat.append(h('div', { html: '' }, h('b', { text: m.from + ': ' }), m.text));
      chat.scrollTop = chat.scrollHeight;
    };
    const input = h('input', { type: 'text', placeholder: 'Nachricht…', style: 'flex:1', maxLength: 200 });
    const send = () => {
      if (input.value.trim()) net.sendMsg({ t: 'chat', text: input.value });
      input.value = '';
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') send();
    };
    const me = room.slots[this.you];
    this.show([
      h('h2', { text: `Raum: ${st.name}` }),
      form,
      h('h3', { text: 'Spieler' }),
      slots,
      chat,
      h('div', { class: 'row', style: 'margin-top:6px' }, input, h('button', { text: 'Senden', onclick: send })),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { text: '← Raum verlassen', onclick: () => { net.sendMsg({ t: 'leave' }); this.room = null; } }),
        !isHost && me ? h('button', { class: me.ready ? '' : 'primary', text: me.ready ? 'Nicht bereit' : 'Bereit', onclick: () => net.sendMsg({ t: 'ready', ready: !me.ready }) }) : h('span'),
        isHost ? h('button', { class: 'primary', text: 'Spiel starten', onclick: () => net.sendMsg({ t: 'start' }) }) : h('span'),
      ),
    ]);
    this.roomRender = fill;
    fill();
  }

  // ---------------- Optionen ----------------
  options(): void {
    const st = this.hooks.settings;
    const apply = () => {
      st.save();
      this.hooks.applySettings();
    };
    const quality = h('select', { onchange: (e) => { st.quality = (e.target as HTMLSelectElement).value as 'low' | 'medium' | 'high'; apply(); } });
    for (const [v, l] of [['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']]) quality.append(h('option', { value: v, text: l, selected: st.quality === v }));
    const hk = loadHotkeys();
    const table = h('div', { style: 'display:grid;grid-template-columns:1fr auto;gap:3px 12px;max-height:230px;overflow:auto;padding-right:8px' });
    (Object.keys(HOTKEY_LABELS) as HotkeyAction[]).forEach((a) => {
      const btn = h('button', { text: keyLabel(hk[a]), style: 'min-width:80px' });
      btn.onclick = () => {
        btn.textContent = 'Taste drücken…';
        const on = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', on, true);
          if (e.code !== 'Escape') {
            hk[a] = e.code;
            saveHotkeys(hk);
          }
          btn.textContent = keyLabel(hk[a]);
        };
        window.addEventListener('keydown', on, true);
      };
      table.append(h('span', { text: HOTKEY_LABELS[a] }), btn);
    });
    this.show([
      h('h2', { text: 'Optionen' }),
      h('div', { class: 'form' },
        h('span', { text: 'Grafikqualität' }), quality,
        h('span', { text: 'Schatten' }), h('input', { type: 'checkbox', checked: st.shadows, onchange: (e) => { st.shadows = (e.target as HTMLInputElement).checked; apply(); } }),
        h('span', { text: 'Lautstärke' }), h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(st.volume), oninput: (e) => { st.volume = Number((e.target as HTMLInputElement).value); apply(); this.hooks.audio.click(); } }),
        h('span', { text: 'Musik' }), h('input', { type: 'checkbox', checked: st.music, onchange: (e) => { st.music = (e.target as HTMLInputElement).checked; apply(); } }),
      ),
      h('h3', { text: 'Tastenbelegung' }),
      table,
      h('div', { class: 'row', style: 'margin-top:12px' },
        this.backButton(() => this.main()),
        h('button', { text: 'Standard', onclick: () => { saveHotkeys({ ...DEFAULT_HOTKEYS }); this.options(); } }),
      ),
    ]);
  }
}
