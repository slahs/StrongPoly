import { decode } from '@msgpack/msgpack';
import {
  DEFAULT_ROOM_SETTINGS,
  FRAME,
  GameSetup,
  PLAYER_COLORS,
  PlayerSetup,
  type ClientMsg,
  type RoomListItem,
  type RoomSettings,
  type RoomState,
  type ServerMsg,
  type SlotInfo,
} from '@strongpoly/shared';
import type WebSocket from 'ws';
import { frame, GameRuntime } from './game';

let nextClientId = 1;
let nextRoomId = 1;

const clamp = (v: unknown, a: number, b: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);

export class Client {
  readonly id = nextClientId++;
  token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  name = 'Spieler';
  ws: WebSocket | null = null;
  room: Room | null = null;
  slot = -1;
  connected = true;
  disconnectedAt = 0;
  tokens = 60;
  lastRefill = Date.now();

  send(buf: Buffer | Uint8Array): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(buf, { binary: true });
  }
  msg(m: ServerMsg): void {
    this.send(frame(FRAME.Control, m));
  }
  allow(): boolean {
    const now = Date.now();
    this.tokens = Math.min(400, this.tokens + ((now - this.lastRefill) / 1000) * 250);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}

function emptySlot(): SlotInfo {
  return { kind: 'open', name: '', team: 0, color: 0, ready: false, ai: 0, difficulty: 0, connected: false };
}

export class Room {
  readonly id = nextRoomId++;
  settings: RoomSettings;
  slots: SlotInfo[] = [];
  host: Client;
  chat: RoomState['chat'] = [];
  runtime: GameRuntime | null = null;
  playing = false;
  clients = new Set<Client>();

  constructor(host: Client, settings: Partial<RoomSettings>) {
    this.settings = this.sanitize({ ...DEFAULT_ROOM_SETTINGS, ...settings });
    this.host = host;
    for (let i = 0; i < 8; i++) {
      const s = emptySlot();
      s.team = i;
      s.color = i;
      this.slots.push(s);
    }
    this.applyMax();
  }

  sanitize(s: RoomSettings): RoomSettings {
    return {
      name: String(s.name ?? 'Spiel').slice(0, 40) || 'Spiel',
      seed: Math.floor(clamp(s.seed, 0, 2 ** 31, 1)),
      size: Math.round(clamp(s.size, 64, 400, 200) / 8) * 8,
      water: clamp(s.water, 0, 1, 0.35),
      trees: clamp(s.trees, 0, 1, 0.5),
      hills: clamp(s.hills, 0, 1, 0.6),
      startGold: Math.floor(clamp(s.startGold, 0, 20000, 1500)),
      troopLimit: Math.floor(clamp(s.troopLimit, 50, 3000, 1000)),
      speed: clamp(s.speed, 0.5, 3, 1),
      fog: !!s.fog,
      extreme: !!s.extreme,
      maxPlayers: Math.floor(clamp(s.maxPlayers, 2, 8, 8)),
    };
  }

  applyMaxPublic(): void {
    this.applyMax();
  }

  private applyMax(): void {
    for (let i = 0; i < 8; i++) {
      if (i >= this.settings.maxPlayers && this.slots[i].kind === 'open') this.slots[i].kind = 'closed';
      else if (i < this.settings.maxPlayers && this.slots[i].kind === 'closed') this.slots[i].kind = 'open';
    }
  }

  state(): RoomState {
    return { id: this.id, host: this.host.id, settings: this.settings, slots: this.slots, playing: this.playing, chat: this.chat.slice(-30) };
  }

  listItem(): RoomListItem {
    return {
      id: this.id,
      name: this.settings.name,
      players: this.slots.filter((s) => s.kind === 'human' || s.kind === 'ai').length,
      max: this.settings.maxPlayers,
      playing: this.playing,
      host: this.host.name,
      size: this.settings.size,
    };
  }

  broadcastState(): void {
    for (const c of this.clients) c.msg({ t: 'room', room: this.state(), you: c.slot });
  }

  addClient(c: Client): boolean {
    const idx = this.slots.findIndex((s) => s.kind === 'open');
    if (idx < 0 || this.playing) return false;
    const s = this.slots[idx];
    s.kind = 'human';
    s.name = c.name;
    s.ready = false;
    s.connected = true;
    s.client = c.id;
    c.room = this;
    c.slot = idx;
    this.clients.add(c);
    return true;
  }

  removeClient(c: Client): void {
    this.clients.delete(c);
    if (c.slot >= 0) {
      if (this.playing) {
        this.slots[c.slot].connected = false;
        this.runtime?.clients.delete(this.playerIndex(c.slot));
      } else {
        const s = this.slots[c.slot];
        const t = s.team;
        const col = s.color;
        Object.assign(s, emptySlot());
        s.team = t;
        s.color = col;
      }
    }
    c.room = null;
    c.slot = -1;
    if (this.host === c) {
      const next = [...this.clients].find((x) => x.connected);
      if (next) this.host = next;
    }
    this.applyMax();
  }

  /** Spieler-Index im Spiel für einen Slot */
  playerIndex(slot: number): number {
    let n = 0;
    for (let i = 0; i < slot; i++) if (this.slots[i].kind === 'human' || this.slots[i].kind === 'ai') n++;
    return n;
  }

  chatMsg(from: string, text: string): void {
    const m = { from, text: text.slice(0, 200), t: Date.now() };
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
    for (const c of this.clients) c.msg({ t: 'chat', from: m.from, text: m.text });
  }

  setSlot(c: Client, index: number, patch: Partial<SlotInfo>): void {
    const s = this.slots[index];
    if (!s || this.playing) return;
    const isHost = c === this.host;
    const own = s.kind === 'human' && s.client === c.id;
    if (!isHost && !own) return;
    if (own || isHost) {
      if (typeof patch.team === 'number') s.team = Math.max(0, Math.min(7, patch.team | 0));
      if (typeof patch.color === 'number') {
        const col = Math.max(0, Math.min(PLAYER_COLORS.length - 1, patch.color | 0));
        if (!this.slots.some((o, i) => i !== index && (o.kind === 'human' || o.kind === 'ai') && o.color === col)) s.color = col;
      }
    }
    if (isHost) {
      if (patch.kind && s.kind !== 'human') {
        if (patch.kind === 'ai' || patch.kind === 'open' || patch.kind === 'closed') {
          s.kind = patch.kind;
          if (patch.kind === 'ai') {
            s.name = typeof patch.name === 'string' ? patch.name.slice(0, 30) : s.name || 'KI';
            s.ready = true;
          } else {
            s.name = '';
            s.ready = false;
          }
        }
      }
      if (s.kind === 'ai') {
        if (typeof patch.ai === 'number') s.ai = Math.max(0, Math.min(20, patch.ai | 0));
        if (typeof patch.difficulty === 'number') s.difficulty = Math.max(0, Math.min(3, patch.difficulty | 0));
        if (typeof patch.name === 'string') s.name = patch.name.slice(0, 30);
      }
    }
  }

  start(c: Client): string | null {
    if (c !== this.host) return 'Nur der Gastgeber kann starten';
    if (this.playing) return 'Läuft bereits';
    const active = this.slots.filter((s) => s.kind === 'human' || s.kind === 'ai');
    if (active.length < 2) return 'Mindestens zwei Spieler nötig';
    if (this.slots.some((s) => s.kind === 'human' && !s.ready && s.client !== this.host.id)) return 'Nicht alle Spieler sind bereit';
    const teams = new Set(active.map((s) => s.team));
    if (teams.size < 2) return 'Mindestens zwei Teams nötig';
    const players: PlayerSetup[] = active.map((s) => ({ name: s.name || 'Spieler', team: s.team, kind: s.kind === 'ai' ? 'ai' : 'human', ai: s.ai, difficulty: s.difficulty, color: s.color }));
    const st = this.settings;
    const setup: GameSetup = {
      map: { gen: { seed: st.seed, size: st.size, players: players.length, water: st.water, trees: st.trees, hills: st.hills } },
      players,
      seed: st.seed,
      startGold: st.startGold,
      troopLimit: st.troopLimit,
      fog: st.fog,
      extreme: st.extreme,
      speed: st.speed,
      me: 0,
    };
    this.runtime = new GameRuntime(setup);
    this.playing = true;
    for (const s of this.slots) s.ready = s.kind === 'ai' ? true : false;
    this.runtime.onEnd = (winner) => this.finish(winner);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.kind !== 'human') continue;
      const cl = [...this.clients].find((x) => x.slot === i);
      if (!cl) continue;
      const p = this.playerIndex(i);
      this.runtime.clients.set(p, cl);
      cl.msg({ t: 'start', me: p, setup: { ...setup, me: p } });
    }
    this.runtime.start();
    // Voll-Snapshot nach kurzem Moment (Clients bauen Spiel auf)
    for (const [p, cl] of this.runtime.clients) this.runtime.syncClient(p, cl);
    this.broadcastState();
    return null;
  }

  finish(winner: number): void {
    this.runtime?.broadcastControl({ t: 'end', winner });
    this.runtime?.stop();
    this.runtime = null;
    this.playing = false;
    for (const s of this.slots) {
      if (s.kind === 'human') s.ready = false;
    }
    // getrennte Spieler entfernen
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.kind === 'human' && !s.connected) {
        Object.assign(s, emptySlot());
        s.team = i;
        s.color = i;
      }
    }
    this.applyMax();
    this.broadcastState();
  }

  destroy(): void {
    this.runtime?.stop();
    this.runtime = null;
  }
}

/** Verwaltet Clients, Räume und Wiederverbindung. */
export class Lobby {
  clients = new Map<number, Client>();
  byToken = new Map<string, Client>();
  rooms = new Map<number, Room>();

  connect(ws: WebSocket): void {
    const client = new Client();
    client.ws = ws;
    let helloed = false;
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return;
      let msg: ClientMsg;
      try {
        msg = decode(data) as ClientMsg;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (!helloed) {
        if (msg.t !== 'hello') return;
        helloed = true;
        const resumed = this.hello(client, ws, msg);
        void resumed;
        return;
      }
      const c = this.activeClient(ws);
      if (!c || !c.allow()) return;
      this.handle(c, msg);
    });
    ws.on('close', () => this.onClose(ws));
    ws.on('error', () => undefined);
    (ws as unknown as { alive: boolean }).alive = true;
    ws.on('pong', () => ((ws as unknown as { alive: boolean }).alive = true));
    this.wsClient.set(ws, client);
  }

  private wsClient = new Map<WebSocket, Client>();
  private activeClient(ws: WebSocket): Client | undefined {
    return this.wsClient.get(ws);
  }

  private hello(fresh: Client, ws: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>): boolean {
    const name = String(msg.name ?? 'Spieler').trim().slice(0, 24) || 'Spieler';
    const old = msg.token ? this.byToken.get(msg.token) : undefined;
    if (old && !old.connected) {
      // Wiederverbindung
      old.ws = ws;
      old.connected = true;
      old.name = name;
      this.wsClient.set(ws, old);
      old.msg({ t: 'welcome', id: old.id, token: old.token, name: old.name, resumed: true });
      const room = old.room;
      if (room) {
        if (old.slot >= 0) room.slots[old.slot].connected = true;
        room.clients.add(old);
        old.msg({ t: 'room', room: room.state(), you: old.slot });
        if (room.playing && room.runtime) {
          const p = room.playerIndex(old.slot);
          room.runtime.clients.set(p, old);
          old.msg({ t: 'start', me: p, setup: { ...room.runtime.setup, me: p } });
          room.runtime.syncClient(p, old);
        }
        room.broadcastState();
      }
      return true;
    }
    fresh.name = name;
    this.clients.set(fresh.id, fresh);
    this.byToken.set(fresh.token, fresh);
    fresh.msg({ t: 'welcome', id: fresh.id, token: fresh.token, name: fresh.name });
    fresh.msg({ t: 'rooms', list: this.roomList() });
    return false;
  }

  roomList(): RoomListItem[] {
    return [...this.rooms.values()].map((r) => r.listItem());
  }

  private handle(c: Client, m: ClientMsg): void {
    switch (m.t) {
      case 'ping':
        c.msg({ t: 'pong', n: m.n });
        break;
      case 'list':
        c.msg({ t: 'rooms', list: this.roomList() });
        break;
      case 'create': {
        if (c.room) return c.msg({ t: 'error', message: 'Bereits in einem Raum' });
        const room = new Room(c, { ...(m.settings ?? {}), name: m.settings?.name ?? `${c.name}s Spiel` });
        this.rooms.set(room.id, room);
        room.addClient(c);
        room.broadcastState();
        break;
      }
      case 'join': {
        if (c.room) return;
        const room = this.rooms.get(m.room | 0);
        if (!room) return c.msg({ t: 'error', message: 'Raum nicht gefunden' });
        if (!room.addClient(c)) return c.msg({ t: 'error', message: room.playing ? 'Spiel läuft bereits' : 'Raum voll' });
        room.broadcastState();
        break;
      }
      case 'leave':
        this.leave(c);
        break;
      case 'settings': {
        const r = c.room;
        if (!r || r.host !== c || r.playing) return;
        r.settings = r.sanitize({ ...r.settings, ...(m.settings ?? {}) });
        r.applyMaxPublic();
        r.broadcastState();
        break;
      }
      case 'slot': {
        const r = c.room;
        if (!r) return;
        r.setSlot(c, m.index | 0, m.patch ?? {});
        r.broadcastState();
        break;
      }
      case 'ready': {
        const r = c.room;
        if (!r || r.playing || c.slot < 0) return;
        r.slots[c.slot].ready = !!m.ready;
        r.broadcastState();
        break;
      }
      case 'chat': {
        const r = c.room;
        if (!r || typeof m.text !== 'string') return;
        const text = m.text.trim();
        if (text) r.chatMsg(c.name, text);
        break;
      }
      case 'start': {
        const r = c.room;
        if (!r) return;
        const err = r.start(c);
        if (err) c.msg({ t: 'error', message: err });
        break;
      }
      case 'cmd': {
        const r = c.room;
        if (!r || !r.runtime || c.slot < 0) return;
        r.runtime.submit(r.playerIndex(c.slot), m.cmd);
        break;
      }
      case 'resync': {
        const r = c.room;
        if (r?.runtime && c.slot >= 0) r.runtime.syncClient(r.playerIndex(c.slot), c);
        break;
      }
      case 'speed': {
        const r = c.room;
        if (!r || !r.runtime || r.host !== c) return;
        r.runtime.host.speed = clamp(m.speed, 0.5, 3, 1);
        r.runtime.broadcastControl({ t: 'paused', paused: r.runtime.host.paused, speed: r.runtime.host.speed });
        break;
      }
      case 'pause': {
        const r = c.room;
        if (!r || !r.runtime || r.host !== c) return;
        r.runtime.host.paused = !!m.paused;
        r.runtime.broadcastControl({ t: 'paused', paused: r.runtime.host.paused, speed: r.runtime.host.speed });
        break;
      }
      default:
        break;
    }
  }

  leave(c: Client): void {
    const r = c.room;
    if (!r) return;
    r.removeClient(c);
    if (r.clients.size === 0 || ![...r.clients].some((x) => x.connected)) {
      r.destroy();
      this.rooms.delete(r.id);
    } else r.broadcastState();
    c.msg({ t: 'room', room: null, you: -1 });
    c.msg({ t: 'rooms', list: this.roomList() });
  }

  private onClose(ws: WebSocket): void {
    const c = this.wsClient.get(ws);
    this.wsClient.delete(ws);
    if (!c || c.ws !== ws) return;
    c.connected = false;
    c.ws = null;
    c.disconnectedAt = Date.now();
    const r = c.room;
    if (r && c.slot >= 0) {
      r.slots[c.slot].connected = false;
      r.runtime?.clients.delete(r.playerIndex(c.slot));
      r.broadcastState();
    }
  }

  /** Alle paar Sekunden: tote Verbindungen/abgelaufene Clients aufräumen */
  sweep(): void {
    const now = Date.now();
    for (const [ws, c] of this.wsClient) {
      const w = ws as unknown as { alive: boolean };
      if (!w.alive) {
        ws.terminate();
        continue;
      }
      w.alive = false;
      try {
        ws.ping();
      } catch {
        /* ignorieren */
      }
      void c;
    }
    for (const c of [...this.clients.values()]) {
      if (c.connected) continue;
      const age = now - c.disconnectedAt;
      const inGame = c.room?.playing;
      const grace = inGame ? 10 * 60_000 : c.room ? 45_000 : 60_000;
      if (age > grace) {
        if (c.room) this.leave(c);
        this.clients.delete(c.id);
        this.byToken.delete(c.token);
      }
    }
    // verwaiste Räume
    for (const r of [...this.rooms.values()]) {
      if (![...r.clients].some((x) => x.connected)) {
        r.destroy();
        this.rooms.delete(r.id);
      }
    }
  }
}
