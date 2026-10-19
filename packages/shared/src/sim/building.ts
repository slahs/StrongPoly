import { BuildingDef, BUILDINGS } from '../data/buildings';
import { RES_COUNT } from '../data/resources';

export interface TrainItem {
  unit: number;
  left: number;
}

export class Building {
  def: BuildingDef;
  /** Footprint (nach Rotation) */
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** Feuer: verbleibende Sekunden (0 = aus) */
  burn = 0;
  workers: number[] = [];
  /** Ausgabepuffer (fertige Ware) */
  out = 0;
  /** Eingabepuffer für Verarbeitung */
  inBuf = 0;
  recipe = 0;
  timer = 0;
  cycles = 0;
  /** 0 keins, 1 Ballista, 2 Mangonel (Türme) */
  turret = 0;
  turretCd = 0;
  queue: TrainItem[] = [];
  /** Zugangstile (Index) oder -1 */
  entry = -1;
  entryVer = 0;
  /** Ochs/Transportreservierung */
  claim = 0;
  horses = 0;
  /** Aktivität bis zu diesem Tick (z. B. Tor offen) */
  activeUntil = 0;
  /** Anzahl anwesender/arbeitender Arbeiter */
  staffed = 0;
  /** Angriffsabklingzeit für Kessel/Türme in Ticks */
  cd = 0;
  /** Ölkessel: Ladungen */
  charges = 0;
  dead = false;
  /** Reparatur angefordert / Reparateur */
  repair = false;
  repairer = 0;
  /** Fortschritt eines Spezialtimers (Stall-Pferde, Campfire-Spawn) */
  spawnTimer = 0;

  constructor(
    readonly id: number,
    readonly type: number,
    readonly owner: number,
    public x: number,
    public y: number,
    public rot: number,
  ) {
    this.def = BUILDINGS[type];
    this.w = rot ? this.def.h : this.def.w;
    this.h = rot ? this.def.w : this.def.h;
    this.maxHp = this.def.hp;
    this.hp = this.def.hp;
    if (type === 50) this.charges = 3;
  }

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }

  contains(tx: number, ty: number): boolean {
    return tx >= this.x && ty >= this.y && tx < this.x + this.w && ty < this.y + this.h;
  }
}

export const NO_STOCK = new Int32Array(RES_COUNT);
