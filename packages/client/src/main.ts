import './style.css';
import { generateMap } from '@strongpoly/shared';
import { GameScene } from './render/scene';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const gs = new GameScene(canvas);

function newMap(seed: number, size: number, players: number): void {
  const t0 = performance.now();
  const map = generateMap({ seed, size, players });
  gs.setMap(map);
  const s = map.starts[0];
  gs.cam.lookAt(s.x, s.y);
  console.log(`Karte ${size}x${size} in ${(performance.now() - t0).toFixed(0)} ms`);
}

ui.innerHTML = `<div style="position:absolute;left:8px;top:8px;background:#000a;color:#fff;padding:8px;font:13px sans-serif;border-radius:6px">
  Seed <input id="seed" value="1" size="6"> Größe <select id="size"><option>128</option><option selected>200</option><option>400</option></select>
  Spieler <select id="pl"><option>2</option><option>4</option><option>8</option></select>
  <button id="gen">Neue Karte</button><br>WASD/Pfeile scrollen · Q/E drehen · Mausrad Zoom</div>`;
const g = (id: string) => document.getElementById(id) as HTMLInputElement;
g('gen').onclick = () => newMap(Number(g('seed').value) || 1, Number(g('size').value), Number(g('pl').value));
newMap(1, 200, 4);

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyQ') gs.cam.rotate(-1);
  if (e.code === 'KeyE') gs.cam.rotate(1);
});
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('wheel', (e) => gs.cam.zoom(e.deltaY), { passive: true });

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const sx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const sy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (sx || sy) gs.cam.pan(sx, sy, dt);
  gs.render(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as Record<string, unknown>).gs = gs;
