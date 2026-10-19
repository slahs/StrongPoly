import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { Lobby } from './lobby';

const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(process.cwd(), process.cwd().endsWith('server') ? '../client/dist' : 'packages/client/dist'));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

export function startServer(port: number, staticDir = STATIC_DIR): { close(): void; lobby: Lobby; port: number } {
const lobby = new Lobby();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: lobby.clients.size, rooms: lobby.rooms.size }));
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (p.includes('..')) p = '';
  let file = join(staticDir, p);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('StrongPoly: Client nicht gebaut (pnpm build).');
    return;
  }
  const ext = extname(file);
  const immutable = file.includes(`${join(staticDir, 'assets')}`);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(readFileSync(file));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => lobby.connect(ws));
});

const sweeper = setInterval(() => lobby.sweep(), 15_000);

server.listen(port);
return {
  lobby,
  port,
  close() {
    clearInterval(sweeper);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close();
  },
};
}
