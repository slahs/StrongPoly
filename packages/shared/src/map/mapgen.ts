import { GameMap } from './gamemap';
import { fbm, hash2, Rng } from '../rng';
import { DEPOSIT_AMOUNT, MAX_HEIGHT, T, TREE_WOOD } from '../data/terrain';

export interface MapGenParams {
  seed: number;
  size: number; // 64..400
  players: number; // 2..8
  /** 0..1: Wasseranteil */
  water?: number;
  /** 0..1: Baumdichte */
  trees?: number;
  /** 0..1: Höhenvarianz */
  hills?: number;
}

const START_RADIUS = 15;

/** Generiert eine Karte prozedural. Startpositionen liegen auf einem Ring und besitzen identische Ressourcen. */
export function generateMap(p: MapGenParams): GameMap {
  const size = Math.max(64, Math.min(400, Math.round(p.size)));
  const m = new GameMap(size, size);
  m.seed = p.seed;
  m.name = `Zufallskarte ${p.seed}`;
  const water = p.water ?? 0.35;
  const treeDensity = p.trees ?? 0.5;
  const hills = p.hills ?? 0.6;
  const s0 = p.seed >>> 0;
  const rng = new Rng(s0 ^ 0xa5a5a5a5);
  const scale = 1 / (size * 0.16);

  // Startpositionen: Ring um die Mitte
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * 0.36;
  const phase = (p.players === 2 ? 0.25 : 0.125) * Math.PI * 2;
  for (let i = 0; i < p.players; i++) {
    const a = phase + (i / p.players) * Math.PI * 2;
    m.starts.push({ x: Math.round(cx + Math.cos(a) * ringR), y: Math.round(cy + Math.sin(a) * ringR) });
  }
  const startDist = (x: number, y: number): number => {
    let d = 1e9;
    for (const s of m.starts) d = Math.min(d, Math.hypot(x - s.x, y - s.y));
    return d;
  };

  // Basisterrain aus Rauschen
  const waterThreshold = 0.5 - water * 0.28;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = m.idx(x, y);
      const e = fbm(s0, x * scale, y * scale, 4);
      const moist = fbm(s0 + 77, x * scale * 1.3, y * scale * 1.3, 3);
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      let elev = e;
      if (edge < 8) elev = elev * (0.55 + 0.45 * (edge / 8)); // Karte läuft zum Rand hin aus
      const sd = startDist(x, y);
      if (sd < START_RADIUS + 10) elev = elev * (sd / (START_RADIUS + 10)) + 0.5 * (1 - sd / (START_RADIUS + 10));
      let t: number = T.Steppe;
      let h = 1;
      if (elev < waterThreshold) {
        t = T.Water;
        h = 0;
      } else if (elev < waterThreshold + 0.05 && moist > 0.55) {
        t = T.Swamp;
        h = 0;
      } else {
        const hv = (elev - waterThreshold) / (1 - waterThreshold);
        h = Math.min(MAX_HEIGHT, Math.max(0, Math.floor(hv * (1.2 + hills * 3.8))));
        if (h === 0) h = 1;
        if (moist > 0.62) t = T.Oasis;
        else if (moist < 0.4) t = T.Desert;
        if (elev > 0.74 + (1 - hills) * 0.15) t = T.Rock;
      }
      m.terrain[i] = t;
      m.height[i] = h;
    }
  }

  // Höhen glätten: Nachbarn dürfen sich um max. 1 Stufe unterscheiden
  smoothHeights(m);

  // Ressourcenvorkommen im Gelände (Fels-Ränder -> Stein/Eisen, Sumpf -> Pech)
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = m.idx(x, y);
      const t = m.terrain[i];
      const r = hash2(s0 + 5, x, y);
      if (t === T.Rock) {
        const nearOpen = anyNeighbor(m, x, y, (j) => m.terrain[j] !== T.Rock && m.terrain[j] !== T.Water);
        if (nearOpen && r < 0.12) m.terrain[i] = T.StoneDeposit;
        else if (nearOpen && r < 0.16) m.terrain[i] = T.IronDeposit;
      } else if (t === T.Swamp && r < 0.2) m.terrain[i] = T.PitchSpring;
    }
  }
  // zusätzliche Blobs
  const blobs = Math.round(size / 10);
  for (let k = 0; k < blobs; k++) {
    const x = rng.int(size - 12) + 6;
    const y = rng.int(size - 12) + 6;
    const kind = k % 3 === 0 ? T.IronDeposit : T.StoneDeposit;
    stampBlob(m, x, y, 2 + rng.int(2), kind, rng, true);
  }

  // Bäume
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = m.idx(x, y);
      const t = m.terrain[i];
      if (t !== T.Steppe && t !== T.Oasis && t !== T.Desert) continue;
      const f = fbm(s0 + 313, x * 0.07, y * 0.07, 3);
      const base = t === T.Oasis ? 0.5 : t === T.Steppe ? 0.3 : 0.05;
      const dens = (f - 0.45) * 2.2 * treeDensity + base * treeDensity * 0.4;
      if (hash2(s0 + 9, x, y) < dens) m.trees[i] = TREE_WOOD;
    }
  }

  // Startgebiete stampen (identisch für alle Spieler)
  for (const s of m.starts) stampStart(m, s.x, s.y, s0);

  connectStarts(m);
  initDeposits(m);
  return m;
}

function anyNeighbor(m: GameMap, x: number, y: number, f: (i: number) => boolean): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && m.inBounds(x + dx, y + dy) && f(m.idx(x + dx, y + dy))) return true;
    }
  return false;
}

function smoothHeights(m: GameMap): void {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 12) {
    changed = false;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const i = m.idx(x, y);
        const h = m.height[i];
        let maxN = 0;
        if (x > 0) maxN = Math.max(maxN, m.height[i - 1]);
        if (x < m.w - 1) maxN = Math.max(maxN, m.height[i + 1]);
        if (y > 0) maxN = Math.max(maxN, m.height[i - m.w]);
        if (y < m.h - 1) maxN = Math.max(maxN, m.height[i + m.w]);
        if (maxN - h > 1) {
          m.height[i] = maxN - 1;
          changed = true;
        }
      }
    }
  }
  // Wasser ist immer auf Stufe 0
  for (let i = 0; i < m.n; i++) if (m.terrain[i] === T.Water) m.height[i] = 0;
}

function stampBlob(m: GameMap, cx: number, cy: number, r: number, t: number, rng: Rng, onlyLand: boolean): void {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!m.inBounds(x, y)) continue;
      if (Math.hypot(x - cx, y - cy) > r + rng.range(-0.4, 0.4)) continue;
      const i = m.idx(x, y);
      if (onlyLand && (m.terrain[i] === T.Water || m.terrain[i] === T.Swamp)) continue;
      m.terrain[i] = t;
      m.trees[i] = 0;
    }
}

/** Standard-Startgebiet. Offsets relativ zum Keep-Mittelpunkt. */
function stampStart(m: GameMap, sx: number, sy: number, seed: number): void {
  const rng = new Rng(seed ^ 0x1234567);
  const lvl = 1;
  for (let y = sy - START_RADIUS; y <= sy + START_RADIUS; y++)
    for (let x = sx - START_RADIUS; x <= sx + START_RADIUS; x++) {
      if (!m.inBounds(x, y)) continue;
      const d = Math.hypot(x - sx, y - sy);
      if (d > START_RADIUS) continue;
      const i = m.idx(x, y);
      m.terrain[i] = T.Steppe;
      m.height[i] = lvl;
      m.trees[i] = 0;
    }
  // Oase (fruchtbar) westlich-südlich
  stampBlob(m, sx - 8, sy + 6, 5, T.Oasis, rng, false);
  stampBlob(m, sx + 8, sy + 6, 4, T.Oasis, rng, false);
  // Vorkommen jenseits des Kernradius – an festen Offsets
  stampRect(m, sx + 12, sy - 12, 5, 4, T.StoneDeposit);
  stampRect(m, sx - 18, sy - 8, 4, 3, T.IronDeposit);
  stampSwamp(m, sx + 4, sy + 20);
  // Bäume (Ring-Wald, deterministisch aus Offsets)
  for (let y = sy - 22; y <= sy + 22; y++)
    for (let x = sx - 22; x <= sx + 22; x++) {
      if (!m.inBounds(x, y)) continue;
      const d = Math.hypot(x - sx, y - sy);
      if (d < 9 || d > 22) continue;
      const i = m.idx(x, y);
      const t = m.terrain[i];
      if (t !== T.Steppe && t !== T.Oasis && t !== T.Desert) continue;
      if (hash2(0xbeef, x - sx, y - sy) < 0.22 && fbm(0xcafe, (x - sx) * 0.15, (y - sy) * 0.15, 2) > 0.45) m.trees[i] = TREE_WOOD;
    }
  // Umgebung der Anlagen höhenmäßig einebnen (Radius etwas größer als Kern)
  for (let y = sy - START_RADIUS - 6; y <= sy + START_RADIUS + 6; y++)
    for (let x = sx - START_RADIUS - 6; x <= sx + START_RADIUS + 6; x++) {
      if (!m.inBounds(x, y)) continue;
      const d = Math.hypot(x - sx, y - sy);
      if (d <= START_RADIUS || d > START_RADIUS + 6) continue;
      const i = m.idx(x, y);
      if (m.terrain[i] === T.Water) m.terrain[i] = T.Steppe;
      if (m.terrain[i] === T.Rock) m.terrain[i] = T.Steppe;
    }
  smoothRegion(m, sx - 30, sy - 30, sx + 30, sy + 30);
}

function stampRect(m: GameMap, x0: number, y0: number, w: number, h: number, t: number): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      if (!m.inBounds(x, y)) continue;
      const i = m.idx(x, y);
      m.terrain[i] = t;
      m.height[i] = 1;
      m.trees[i] = 0;
    }
}

function stampSwamp(m: GameMap, cx: number, cy: number): void {
  for (let y = cy - 4; y <= cy + 4; y++)
    for (let x = cx - 5; x <= cx + 5; x++) {
      if (!m.inBounds(x, y)) continue;
      const d = Math.hypot((x - cx) / 5, (y - cy) / 4);
      if (d > 1) continue;
      const i = m.idx(x, y);
      m.terrain[i] = d < 0.55 ? T.PitchSpring : T.Swamp;
      m.height[i] = 1;
      m.trees[i] = 0;
    }
}

function smoothRegion(m: GameMap, x0: number, y0: number, x1: number, y1: number): void {
  for (let pass = 0; pass < 8; pass++) {
    for (let y = Math.max(0, y0); y <= Math.min(m.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(m.w - 1, x1); x++) {
        const i = m.idx(x, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!m.inBounds(nx, ny)) continue;
          const j = m.idx(nx, ny);
          if (m.terrain[j] === T.Water) continue;
          if (m.height[j] - m.height[i] > 1 && m.terrain[i] !== T.Water) m.height[j] = m.height[i] + 1;
          if (m.height[i] - m.height[j] > 1 && m.terrain[j] !== T.Water) m.height[i] = m.height[j] + 1;
        }
      }
  }
}

/** Stellt sicher, dass alle Startpunkte miteinander verbunden sind (schlägt Schneisen). */
function connectStarts(m: GameMap): void {
  for (let k = 1; k < m.starts.length; k++) {
    if (reachable(m, m.starts[0], m.starts[k])) continue;
    carveLine(m, m.starts[k - 1], m.starts[k]);
  }
  for (let k = 1; k < m.starts.length; k++) {
    if (!reachable(m, m.starts[0], m.starts[k])) carveLine(m, m.starts[0], m.starts[k]);
  }
}

function reachable(m: GameMap, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const seen = new Uint8Array(m.n);
  const q = new Int32Array(m.n);
  let qh = 0;
  let qt = 0;
  const s = m.idx(a.x, a.y);
  const goal = m.idx(b.x, b.y);
  q[qt++] = s;
  seen[s] = 1;
  while (qh < qt) {
    const i = q[qh++];
    if (i === goal) return true;
    const x = i % m.w;
    const y = (i / m.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!m.inBounds(nx, ny)) continue;
      const j = m.idx(nx, ny);
      if (seen[j] || !m.walkableTerrain(j)) continue;
      if (Math.abs(m.height[j] - m.height[i]) > 1) continue;
      seen[j] = 1;
      q[qt++] = j;
    }
  }
  return false;
}

function carveLine(m: GameMap, a: { x: number; y: number }, b: { x: number; y: number }): void {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(a.x + ((b.x - a.x) * s) / steps);
    const y = Math.round(a.y + ((b.y - a.y) * s) / steps);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!m.inBounds(x + dx, y + dy)) continue;
        const i = m.idx(x + dx, y + dy);
        const t = m.terrain[i];
        if (t === T.Water || t === T.Rock || t === T.Swamp) m.terrain[i] = T.Steppe;
        if (m.height[i] === 0) m.height[i] = 1;
        m.trees[i] = 0;
      }
  }
  smoothHeights(m);
}

export function initDeposits(m: GameMap): void {
  for (let i = 0; i < m.n; i++) {
    const a = DEPOSIT_AMOUNT[m.terrain[i]];
    if (a && m.deposit[i] === 0) m.deposit[i] = a;
  }
}
