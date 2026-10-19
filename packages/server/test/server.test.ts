import { decode, encode } from '@msgpack/msgpack';
import { ClientWorld, FRAME, type ClientMsg, type ServerMsg, type Snapshot } from '@strongpoly/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../src/index';

let srv: ReturnType<typeof startServer>;
const PORT = 3911;

beforeAll(() => {
  srv = startServer(PORT, '/nonexistent');
});
afterAll(() => srv.close());

class TestClient {
  ws!: WebSocket;
  controls: ServerMsg[] = [];
  snaps: Snapshot[] = [];
  views = 0;
  world = new ClientWorld();
  token = '';
  id = 0;
  waiters: ((m: ServerMsg) => boolean)[] = [];

  constructor(readonly name: string) {}

  connect(token?: string): Promise<void> {
    return new Promise((res) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.binaryType = 'nodebuffer';
      this.ws.on('open', () => {
        this.send({ t: 'hello', name: this.name, token });
        res();
      });
      this.ws.on('message', (data: Buffer) => {
        const type = data[0];
        const body = decode(data.subarray(1));
        if (type === FRAME.Control) {
          const m = body as ServerMsg;
          if (m.t === 'welcome') {
            this.token = m.token;
            this.id = m.id;
          }
          this.controls.push(m);
          this.waiters = this.waiters.filter((w) => !w(m));
        } else if (type === FRAME.Snapshot) {
          const s = body as Snapshot;
          this.snaps.push(s);
          this.world.apply(s, performance.now());
        } else if (type === FRAME.View) this.views++;
      });
    });
  }
  send(m: ClientMsg): void {
    this.ws.send(encode(m));
  }
  waitFor(pred: (m: ServerMsg) => boolean, ms = 5000): Promise<ServerMsg> {
    const found = this.controls.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('timeout')), ms);
      this.waiters.push((m) => {
        if (pred(m)) {
          clearTimeout(to);
          res(m);
          return true;
        }
        return false;
      });
    });
  }
  async until(f: () => boolean, ms = 8000): Promise<void> {
    const t0 = Date.now();
    while (!f()) {
      if (Date.now() - t0 > ms) throw new Error('until timeout');
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

describe('Server', () => {
  it('Lobby: Raum erstellen, KI-Slot, Start, Snapshots, Befehle, Reconnect', async () => {
    const a = new TestClient('Alice');
    const b = new TestClient('Bob');
    await a.connect();
    await b.connect();
    await a.waitFor((m) => m.t === 'welcome');
    await b.waitFor((m) => m.t === 'welcome');
    a.send({ t: 'create', settings: { name: 'Test', size: 96, seed: 4, speed: 3 } });
    const room = (await a.waitFor((m) => m.t === 'room' && !!m.room)) as Extract<ServerMsg, { t: 'room' }>;
    expect(room.room!.slots[0].kind).toBe('human');
    b.send({ t: 'list' });
    const list = (await b.waitFor((m) => m.t === 'rooms' && m.list.length > 0)) as Extract<ServerMsg, { t: 'rooms' }>;
    b.send({ t: 'join', room: list.list[0].id });
    await b.waitFor((m) => m.t === 'room' && !!m.room);
    // KI-Slot für Team 2
    a.send({ t: 'slot', index: 2, patch: { kind: 'ai', ai: 3, team: 2, difficulty: 1 } });
    a.send({ t: 'slot', index: 1, patch: { team: 1 } });
    b.send({ t: 'ready', ready: true });
    await a.until(() => a.controls.some((m) => m.t === 'room' && m.room?.slots[2].kind === 'ai'));
    a.send({ t: 'start' });
    const sa = (await a.waitFor((m) => m.t === 'start')) as Extract<ServerMsg, { t: 'start' }>;
    const sb = (await b.waitFor((m) => m.t === 'start')) as Extract<ServerMsg, { t: 'start' }>;
    expect(sa.me).toBe(0);
    expect(sb.me).toBe(1);
    expect(sa.setup.players.length).toBe(3);
    await a.until(() => a.snaps.some((s) => s.full) && a.snaps.length > 30);
    await b.until(() => b.snaps.length > 30);
    expect(a.views).toBeGreaterThan(1);
    // Beide Welten stimmen überein
    expect(a.world.buildings.size).toBe(b.world.buildings.size);
    expect(Math.abs(a.world.tick - b.world.tick)).toBeLessThan(8);
    // Befehl: Bob baut einen Brunnen
    const keep = b.world.players[1];
    const before = b.world.buildings.size;
    for (let dx = 8; dx < 20; dx++) b.send({ t: 'cmd', cmd: { c: 'place', type: 29, x: Math.round(keep.keepX) + dx, y: Math.round(keep.keepY) - 9 } });
    await b.until(() => b.world.buildings.size > before);
    await a.until(() => a.world.buildings.size > before);
    // Reconnect von Bob
    const token = b.token;
    b.ws.terminate();
    await new Promise((r) => setTimeout(r, 300));
    const b2 = new TestClient('Bob');
    await b2.connect(token);
    const w = (await b2.waitFor((m) => m.t === 'welcome')) as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w.resumed).toBe(true);
    await b2.waitFor((m) => m.t === 'start');
    await b2.until(() => b2.snaps.some((s) => s.full));
    await b2.until(() => b2.snaps.length > 20);
    expect(b2.world.buildings.size).toBeGreaterThanOrEqual(before);
    expect(b2.world.tick).toBeGreaterThan(0);
    a.ws.close();
    b2.ws.close();
  }, 30000);

  it('Soak: 2 Menschen + 4 KI-Lords (200x200, 3x) laufen stabil und bleiben synchron', async () => {
    const a = new TestClient('Anna');
    const b = new TestClient('Ben');
    await a.connect();
    await b.connect();
    await a.waitFor((m) => m.t === 'welcome');
    await b.waitFor((m) => m.t === 'welcome');
    a.send({ t: 'create', settings: { name: 'Soak', size: 200, seed: 21, speed: 3, maxPlayers: 6 } });
    const soakRoom = (await a.waitFor((m) => m.t === 'room' && !!m.room)) as Extract<ServerMsg, { t: 'room' }>;
    b.send({ t: 'join', room: soakRoom.room!.id });
    await b.waitFor((m) => m.t === 'room' && !!m.room);
    a.send({ t: 'slot', index: 0, patch: { team: 0 } });
    a.send({ t: 'slot', index: 1, patch: { team: 0 } });
    for (let i = 2; i < 6; i++) a.send({ t: 'slot', index: i, patch: { kind: 'ai', ai: i + 2, team: i, difficulty: 1 } });
    b.send({ t: 'ready', ready: true });
    await a.until(() => a.controls.some((m) => m.t === 'room' && m.room?.slots[5].kind === 'ai'));
    await new Promise((r) => setTimeout(r, 200));
    a.send({ t: 'start' });
    await a.waitFor((m) => m.t === 'start');
    await b.waitFor((m) => m.t === 'start');
    // ~15 s Spielzeit bei 3x => 450 Ticks
    await a.until(() => a.world.tick > 400, 40000);
    await b.until(() => b.world.tick > 400, 40000);
    expect(a.world.players.length).toBe(6);
    // Beide Spiegel zeigen dieselbe Welt (Tick-Versatz erlaubt)
    expect(Math.abs(a.world.tick - b.world.tick)).toBeLessThan(40);
    expect(Math.abs(a.world.buildings.size - b.world.buildings.size)).toBeLessThan(6);
    expect(a.world.buildings.size).toBeGreaterThan(30);
    // Server lebt
    const health = await fetch(`http://localhost:${PORT}/healthz`).then((r) => r.json());
    expect(health.ok).toBe(true);
    a.ws.close();
    b.ws.close();
  }, 60000);

  it('weist unzulässige Starts ab', async () => {
    const c = new TestClient('Solo');
    await c.connect();
    await c.waitFor((m) => m.t === 'welcome');
    c.send({ t: 'create', settings: {} });
    await c.waitFor((m) => m.t === 'room' && !!m.room);
    c.send({ t: 'start' });
    const err = (await c.waitFor((m) => m.t === 'error')) as Extract<ServerMsg, { t: 'error' }>;
    expect(err.message).toMatch(/Spieler/);
    c.ws.close();
  });
});
