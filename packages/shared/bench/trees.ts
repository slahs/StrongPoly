import { generateMap } from '../src';
const seed = Number(process.argv[2] ?? 14);
const map = generateMap({ seed, size: 160, players: 2 });
for (const s of map.starts) {
  const band: number[] = Array(8).fill(0);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.trees[y * map.w + x]) { const d = Math.max(Math.abs(x - s.x), Math.abs(y - s.y)); if (d < 40) band[Math.floor(d / 5)]++; }
  console.log('start', s.x, s.y, 'Bäume je 5-Tile-Chebyshev-Band 0..40:', band.join(' '));
}
