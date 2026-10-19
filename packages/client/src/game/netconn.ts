import { decode, encode } from '@msgpack/msgpack';
import { FRAME, type ClientMsg, type Command, type PlayerView, type ServerMsg, type Snapshot } from '@strongpoly/shared';
import type { GameConnection } from './connection';

/** WebSocket-Client zum Server (Lobby + Spiel). Hält Token für Reconnect. */
export class NetClient {
  ws: WebSocket | null = null;
  name = 'Spieler';
  token = '';
  id = 0;
  connected = false;
  onControl: (m: ServerMsg) => void = () => {};
  onSnapshot: (s: Snapshot) => void = () => {};
  onView: (v: PlayerView) => void = () => {};
  onClose: (wasInGame: boolean) => void = () => {};
  inGame = false;
  private url = '';
  private reconnecting = false;
  private closedByUs = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  latency = 0;

  static defaultUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect(url: string, name: string): Promise<void> {
    this.url = url;
    this.name = name;
    try {
      this.token = localStorage.getItem('strongpoly.token') ?? '';
    } catch {
      this.token = '';
    }
    this.closedByUs = false;
    return this.open();
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        this.sendMsg({ t: 'hello', name: this.name, token: this.token || undefined });
      };
      ws.onmessage = (ev) => {
        const data = new Uint8Array(ev.data as ArrayBuffer);
        const type = data[0];
        const body = decode(data.subarray(1));
        if (type === FRAME.Control) {
          const m = body as ServerMsg;
          if (m.t === 'welcome') {
            this.token = m.token;
            this.id = m.id;
            try {
              localStorage.setItem('strongpoly.token', m.token);
            } catch {
              /* ignorieren */
            }
            if (!settled) {
              settled = true;
              resolve();
            }
          } else if (m.t === 'pong') this.latency = performance.now() - m.n;
          this.onControl(m);
        } else if (type === FRAME.Snapshot) this.onSnapshot(body as Snapshot);
        else if (type === FRAME.View) this.onView(body as PlayerView);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Verbindung fehlgeschlagen'));
        }
      };
      ws.onclose = () => {
        this.connected = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (!settled) {
          settled = true;
          reject(new Error('Verbindung geschlossen'));
          return;
        }
        if (this.closedByUs) return;
        this.onClose(this.inGame);
        void this.retry();
      };
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.sendMsg({ t: 'ping', n: performance.now() }), 5000);
    });
  }

  private async retry(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    for (let i = 0; i < 120 && !this.closedByUs; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await this.open();
        this.reconnecting = false;
        return;
      } catch {
        /* weiter versuchen */
      }
    }
    this.reconnecting = false;
  }

  sendMsg(m: ClientMsg): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(encode(m));
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
    if (this.pingTimer) clearInterval(this.pingTimer);
  }
}

/** Online-Partie als GameConnection (gleiche Schnittstelle wie der lokale Worker). */
export class RemoteConnection implements GameConnection {
  readonly local = false;
  onSnapshot: (s: Snapshot) => void = () => {};
  onView: (v: PlayerView) => void = () => {};
  onInfo?: (i: { tickMs: number; tick: number; units: number }) => void;
  onError?: (m: string) => void;
  canControl = false;

  constructor(
    private net: NetClient,
    readonly playerId: number,
  ) {
    net.inGame = true;
    net.onSnapshot = (s) => this.onSnapshot(s);
    net.onView = (v) => this.onView(v);
  }
  send(cmd: Command): void {
    this.net.sendMsg({ t: 'cmd', cmd });
  }
  setSpeed(x: number): void {
    this.net.sendMsg({ t: 'speed', speed: x });
  }
  setPaused(p: boolean): void {
    this.net.sendMsg({ t: 'pause', paused: p });
  }
  close(): void {
    this.net.inGame = false;
    this.net.onSnapshot = () => {};
    this.net.onView = () => {};
  }
}
