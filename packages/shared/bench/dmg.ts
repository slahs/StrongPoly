import { generateMap, Sim } from '../src';
const [a, b, seed, t1] = process.argv.slice(2, 6).map(Number);
const map = generateMap({ seed, size: 160, players: 2 });
const sim = new Sim({ map, seed, players: [{ name: 'A', team: 0, kind: 'ai', ai: a }, { name: 'B', team: 1, kind: 'ai', ai: b }], startGold: 1500, troopLimit: 1000, fog: false, extreme: false });
while (sim.tick < t1 * 600 && !sim.gameOver) sim.step();
const d = (globalThis as any).DMG ?? {};
console.log(Object.entries(d).sort((x: any, y: any) => y[1] - x[1]).slice(0, 12).map(([k, v]: any) => `${k} ${Math.round(v)}`).join('\n'));
