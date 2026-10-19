import { BUILDINGS } from '../data/buildings';
import { MISSIONS, MissionDef, Objective } from '../data/missions';
import { U } from '../data/units';
import type { Sim } from './sim';

export interface MissionView {
  id: string;
  name: string;
  stage: number;
  stages: number;
  title: string;
  hint: string;
  objectives: { text: string; done: boolean }[];
  complete: boolean;
}

export class MissionState {
  readonly def: MissionDef;
  stage = 0;
  complete = false;
  hintSent = -1;
  view: MissionView;
  private sig = '';
  private done: boolean[][] = [];

  constructor(
    private sim: Sim,
    id: string,
    restoring = false,
  ) {
    const def = MISSIONS.find((m) => m.id === id);
    if (!def) throw new Error('Unbekannte Mission ' + id);
    this.def = def;
    this.done = def.stages.map((s) => s.objectives.map(() => false));
    if (!restoring) def.init?.(sim);
    this.view = this.buildView();
    if (!restoring) sim.emit({ e: 'msg', p: 0, text: def.intro });
  }

  private count(p: number, o: Extract<Objective, { k: 'build' | 'buildAny' | 'wallTiles' }>): number {
    let n = 0;
    for (const b of this.sim.buildings.values()) {
      if (b.owner !== p) continue;
      if (o.k === 'build' && b.type === o.type) n++;
      else if (o.k === 'buildAny' && o.types.includes(b.type)) n++;
      else if (o.k === 'wallTiles' && BUILDINGS[b.type].line && BUILDINGS[b.type].wallTop) n++;
    }
    return n;
  }

  private check(o: Objective): boolean {
    const sim = this.sim;
    const pl = sim.players[0];
    switch (o.k) {
      case 'build':
      case 'buildAny':
      case 'wallTiles':
        return this.count(0, o) >= (o.k === 'wallTiles' ? o.n : o.n);
      case 'produced':
        return pl.produced[o.res] >= o.n;
      case 'stock':
        return pl.stock[o.res] >= o.n;
      case 'peasants':
        return pl.peasants >= o.n;
      case 'popularity':
        return pl.popularity >= o.n;
      case 'gold':
        return pl.gold >= o.n;
      case 'troops':
        return pl.troops >= o.n;
      case 'unitCount': {
        const u = sim.units;
        let n = 0;
        for (let s = 0; s < u.top; s++) if (u.alive[s] && u.owner[s] === 0 && u.type[s] === o.type) n++;
        for (const b of sim.buildings.values()) if (b.owner === 0) for (const q of b.queue) if (q.unit === o.type) n++;
        return n >= o.n || pl.stats.ever[o.type] >= o.n;
      }
      case 'kills':
        return pl.stats.kills >= o.n;
      case 'defeat':
        return !sim.players[o.player].alive;
      case 'ability':
        return (pl.abilitiesUsed[o.id] ?? 0) > 0;
      case 'banners':
        return pl.banners >= o.n;
      case 'survive':
        return sim.tick >= o.ticks;
    }
  }

  private buildView(): MissionView {
    const st = this.def.stages[Math.min(this.stage, this.def.stages.length - 1)];
    return {
      id: this.def.id,
      name: this.def.name,
      stage: this.stage + 1,
      stages: this.def.stages.length,
      title: st.title,
      hint: st.hint,
      objectives: st.objectives.map((o, i) => ({ text: o.text, done: this.done[Math.min(this.stage, this.def.stages.length - 1)][i] })),
      complete: this.complete,
    };
  }

  update(): void {
    const sim = this.sim;
    if (sim.tick % 10 !== 0 || this.complete) return;
    if (this.hintSent !== this.stage) {
      this.hintSent = this.stage;
      sim.emit({ e: 'msg', p: 0, text: `Stufe ${this.stage + 1}: ${this.def.stages[this.stage].title} – ${this.def.stages[this.stage].hint}` });
    }
    const st = this.def.stages[this.stage];
    let all = true;
    st.objectives.forEach((o, i) => {
      if (!this.done[this.stage][i] && this.check(o)) {
        this.done[this.stage][i] = true;
        sim.emit({ e: 'msg', p: 0, text: `✔ ${o.text}` });
      }
      if (!this.done[this.stage][i]) all = false;
    });
    if (all) {
      if (this.stage + 1 >= this.def.stages.length) {
        this.complete = true;
        sim.gameOver = true;
        sim.winnerTeam = sim.teamOf[0];
        sim.emit({ e: 'win', team: sim.teamOf[0] });
      } else this.stage++;
    }
    this.view = this.buildView();
  }

  saveState(): { stage: number; complete: boolean; hintSent: number; done: boolean[][] } {
    return { stage: this.stage, complete: this.complete, hintSent: this.hintSent, done: this.done.map((d) => [...d]) };
  }

  loadState(s: { stage: number; complete: boolean; hintSent: number; done: boolean[][] }): void {
    this.stage = s.stage;
    this.complete = s.complete;
    this.hintSent = s.hintSent;
    this.done = s.done.map((d) => [...d]);
    this.view = this.buildView();
  }

  signature(): string {
    return JSON.stringify(this.view);
  }
}

export function updateMission(sim: Sim): void {
  sim.mission!.update();
}

export { U };
