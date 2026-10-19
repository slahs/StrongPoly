import { DT, TICK_RATE } from '../data/balance';
import { ABILITIES, EXTREME } from '../data/extreme';
import { D, PROJ, U } from '../data/units';
import { damageUnit, fireProjectile, groundZ, hitBuilding } from './combat';
import { nearestFreeTile } from './orders';
import type { Sim } from './sim';
import { Stance } from './types';
import { S } from './unitstore';

export interface Banner {
  id: number;
  x: number;
  y: number;
  /** Besitzer-Spieler oder -1 */
  owner: number;
  /** Eroberungsfortschritt 0..1 für den aktuellen Anwärter */
  progress: number;
  claimant: number;
}

interface Volley {
  x: number;
  y: number;
  until: number;
  owner: number;
  r: number;
}

export class ExtremeState {
  banners: Banner[] = [];
  volleys: Volley[] = [];
  nextBanner: number;
  private nextId = 1;
  get nextIdValue(): number {
    return this.nextId;
  }
  set nextIdValue(v: number) {
    this.nextId = v;
  }

  constructor(private sim: Sim) {
    this.nextBanner = EXTREME.bannerEvery * TICK_RATE;
    for (const p of sim.players) {
      p.powerMax = EXTREME.powerMax;
      p.abilityCd = ABILITIES.map(() => 0);
      p.power = 20;
    }
  }

  onKill(by: number): void {
    const p = this.sim.players[by];
    if (p) p.power = Math.min(p.powerMax, p.power + EXTREME.killGain);
  }

  private spawnBanner(): void {
    const sim = this.sim;
    const m = sim.map;
    for (let tries = 0; tries < 80; tries++) {
      const x = 8 + sim.rng.int(m.w - 16);
      const y = 8 + sim.rng.int(m.h - 16);
      const i = m.idx(x, y);
      if (!m.walkable(i) || sim.bldAt[i]) continue;
      // Abstand zu allen Burgen
      let ok = true;
      for (const st of m.starts.slice(0, sim.players.length)) if (Math.hypot(st.x - x, st.y - y) < 22) ok = false;
      for (const b of this.banners) if (Math.hypot(b.x - x, b.y - y) < 18) ok = false;
      if (!ok) continue;
      this.banners.push({ id: this.nextId++, x: x + 0.5, y: y + 0.5, owner: -1, progress: 0, claimant: -1 });
      sim.emit({ e: 'fx', k: 'banner', x: x + 0.5, y: y + 0.5, z: 0.5 });
      return;
    }
  }

  update(): void {
    const sim = this.sim;
    const u = sim.units;
    // Zuwachs
    if (sim.tick % 10 === 0) {
      for (const p of sim.players) {
        if (!p.alive) continue;
        let rate = EXTREME.baseRate;
        for (const b of this.banners) if (b.owner === p.id) rate += EXTREME.bannerRate;
        p.banners = this.banners.filter((b) => b.owner === p.id).length;
        p.power = Math.min(p.powerMax, p.power + rate);
      }
    }
    if (sim.tick >= this.nextBanner) {
      this.nextBanner = sim.tick + EXTREME.bannerEvery * TICK_RATE;
      if (this.banners.length < EXTREME.bannerMax) this.spawnBanner();
    }
    // Eroberung
    if (sim.tick % 5 === 0) {
      for (const b of this.banners) {
        const count = new Map<number, number>();
        sim.spatial.query(b.x, b.y, EXTREME.captureRadius + 1, (s) => {
          if (!u.alive[s] || u.type[s] < U.Lord || Math.hypot(u.x[s] - b.x, u.y[s] - b.y) > EXTREME.captureRadius) return;
          if (u.type[s] === U.Ox) return;
          count.set(u.owner[s], (count.get(u.owner[s]) ?? 0) + 1);
        });
        // Teams zählen
        const teamCount = new Map<number, number>();
        for (const [p, n] of count) teamCount.set(sim.teamOf[p], (teamCount.get(sim.teamOf[p]) ?? 0) + n);
        if (teamCount.size === 1) {
          const [team] = [...teamCount.keys()];
          // stärkster Spieler des Teams ist Anwärter
          let best = -1;
          let bn = 0;
          for (const [p, n] of count) if (sim.teamOf[p] === team && n > bn) {
            bn = n;
            best = p;
          }
          if (b.owner >= 0 && sim.teamOf[b.owner] === team) {
            b.progress = 0;
            continue;
          }
          if (b.claimant < 0 || sim.teamOf[b.claimant] !== team) {
            b.claimant = best;
            b.progress = 0;
          }
          b.progress += (5 * DT) / EXTREME.captureTime;
          if (b.progress >= 1) {
            b.owner = b.claimant;
            b.progress = 0;
            sim.emit({ e: 'fx', k: 'banner', x: b.x, y: b.y, z: 1 });
            sim.emit({ e: 'msg', p: b.owner, text: 'Fahnenstange erobert!' });
          }
        } else if (teamCount.size === 0) b.progress = Math.max(0, b.progress - 0.02);
      }
    }
    // Pfeilhagel-Salven
    for (let i = this.volleys.length - 1; i >= 0; i--) {
      const v = this.volleys[i];
      if (sim.tick >= v.until) {
        this.volleys.splice(i, 1);
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const a = sim.rng.next() * Math.PI * 2;
        const r = Math.sqrt(sim.rng.next()) * v.r;
        const tx = v.x + Math.cos(a) * r;
        const ty = v.y + Math.sin(a) * r;
        fireProjectile(sim, {
          kind: PROJ.Arrow,
          owner: v.owner,
          sx: tx + (sim.rng.next() - 0.5) * 6,
          sy: ty - 10,
          sz: groundZ(sim, tx, ty) + 18,
          tx,
          ty,
          dmg: 16,
          dtype: D.Pierce,
        });
      }
    }
  }
}

export function updateExtreme(sim: Sim): void {
  sim.extreme!.update();
}

export function useAbility(sim: Sim, p: number, id: number, x: number, y: number): void {
  const ex = sim.extreme;
  const pl = sim.players[p];
  const def = ABILITIES[id];
  if (!ex || !def || !pl.alive) return;
  if (pl.power < def.cost || pl.abilityCd[id] > sim.tick) return;
  const tx = Math.max(1, Math.min(sim.map.w - 2, x));
  const ty = Math.max(1, Math.min(sim.map.h - 2, y));
  pl.power -= def.cost;
  pl.abilitiesUsed[id] = (pl.abilitiesUsed[id] ?? 0) + 1;
  pl.abilityCd[id] = sim.tick + def.cooldown * TICK_RATE;
  const u = sim.units;
  switch (def.key) {
    case 'arrows':
      ex.volleys.push({ x: tx, y: ty, until: sim.tick + 35, owner: p, r: def.radius });
      sim.emit({ e: 'fx', k: 'arrows', x: tx, y: ty, z: 0 });
      break;
    case 'heal':
      sim.emit({ e: 'fx', k: 'heal', x: tx, y: ty, z: 0.4 });
      sim.spatial.query(tx, ty, def.radius, (s) => {
        if (!u.alive[s] || sim.isEnemy(p, u.owner[s]) || Math.hypot(u.x[s] - tx, u.y[s] - ty) > def.radius) return;
        u.hp[s] = Math.min(u.maxHp[s], u.hp[s] + u.maxHp[s] * 0.6);
        sim.emit({ e: 'fx', k: 'heal', x: u.x[s], y: u.y[s], z: 0.4 });
      });
      break;
    case 'rockfall':
      sim.emit({ e: 'fx', k: 'rock', x: tx, y: ty, z: 0 });
      fireProjectile(sim, { kind: PROJ.Boulder, owner: p, sx: tx, sy: ty - 1, sz: groundZ(sim, tx, ty) + 24, tx, ty, dmg: 420, dtype: D.Siege, splash: def.radius });
      break;
    case 'gold':
      pl.gold += EXTREME.goldDonation;
      sim.emit({ e: 'msg', p, text: `Ein Gönner spendet ${EXTREME.goldDonation} Gold!` });
      break;
    case 'reinforce': {
      // Kartenrand nahe der eigenen Burg
      const keep = sim.buildings.get(pl.keepId);
      const kx = keep ? keep.cx : sim.map.starts[p].x;
      const ky = keep ? keep.cy : sim.map.starts[p].y;
      const m = sim.map;
      const dl = kx;
      const dr = m.w - kx;
      const dt = ky;
      const db = m.h - ky;
      const dmin = Math.min(dl, dr, dt, db);
      let ex0 = kx;
      let ey0 = ky;
      if (dmin === dl) ex0 = 3;
      else if (dmin === dr) ex0 = m.w - 4;
      else if (dmin === dt) ey0 = 3;
      else ey0 = m.h - 4;
      const comp = [U.Swordsman, U.Swordsman, U.Swordsman, U.Archer, U.Archer, U.Archer, U.Knight, U.Knight, U.Pikeman, U.Pikeman, U.Crossbowman, U.Maceman];
      const team = sim.teamOf[p];
      const ids: number[] = [];
      for (let i = 0; i < Math.min(EXTREME.reinforceCount, comp.length); i++) {
        if (pl.troops + i >= sim.troopLimit + 20) break;
        const tile = nearestFreeTile(sim, Math.round(ex0 + (i % 4) - 2), Math.round(ey0 + Math.floor(i / 4) - 1), team, 10);
        if (tile < 0) continue;
        const s = sim.spawnUnit(comp[i], p, (tile % m.w) + 0.5, ((tile / m.w) | 0) + 0.5);
        if (s < 0) continue;
        u.stance[s] = Stance.Aggressive;
        u.state[s] = S.Idle;
        ids.push(u.id(s));
      }
      sim.emit({ e: 'fx', k: 'banner', x: ex0, y: ey0, z: 0.5 });
      if (ids.length) {
        // zur Burg marschieren (nächster Tick)
        sim.pendingOrders.push({ p, units: ids, x: kx + 0.5, y: ky + 4.5 });
      }
      break;
    }
    default:
      break;
  }
  void hitBuilding;
  void damageUnit;
}
