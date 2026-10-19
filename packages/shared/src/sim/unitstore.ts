import { SLOT_BITS, SLOT_MASK, UNIT_CAP } from '../data/balance';

/** Einheitenzustände */
export const S = {
  Idle: 0,
  Move: 1,
  AttackMove: 2,
  Attack: 3,
  Patrol: 4,
  Work: 5,
  Dead: 6,
  Tunnel: 7,
  Ground: 8,
} as const;

/** Struct-of-Arrays für alle Einheiten (ECS-ähnlich). Handle = (gen << 13) | slot */
export class UnitStore {
  readonly cap = UNIT_CAP;
  alive = new Uint8Array(UNIT_CAP);
  gen = new Uint16Array(UNIT_CAP);
  type = new Uint8Array(UNIT_CAP);
  owner = new Uint8Array(UNIT_CAP);
  state = new Uint8Array(UNIT_CAP);
  sub = new Uint8Array(UNIT_CAP);
  stance = new Uint8Array(UNIT_CAP);
  layer = new Uint8Array(UNIT_CAP);
  flags = new Uint8Array(UNIT_CAP);
  x = new Float32Array(UNIT_CAP);
  y = new Float32Array(UNIT_CAP);
  hp = new Float32Array(UNIT_CAP);
  maxHp = new Float32Array(UNIT_CAP);
  face = new Float32Array(UNIT_CAP);
  tx = new Float32Array(UNIT_CAP);
  ty = new Float32Array(UNIT_CAP);
  /** Zielknoten des Flowfields (-1 = keins) */
  goal = new Int32Array(UNIT_CAP);
  /** Ziel-Handle (Einheit oder Gebäude) */
  target = new Int32Array(UNIT_CAP);
  /** 0 keins, 1 Einheit, 2 Gebäude */
  targetKind = new Uint8Array(UNIT_CAP);
  cd = new Int16Array(UNIT_CAP);
  timer = new Float32Array(UNIT_CAP);
  carryRes = new Uint8Array(UNIT_CAP);
  carryAmt = new Uint8Array(UNIT_CAP);
  home = new Int32Array(UNIT_CAP);
  ax = new Float32Array(UNIT_CAP);
  ay = new Float32Array(UNIT_CAP);
  stuck = new Uint8Array(UNIT_CAP);
  burn = new Float32Array(UNIT_CAP);
  /** Waypoint-Warteschlangen (selten) */
  waypoints = new Map<number, { x: number; y: number }[]>();

  count = 0;
  /** höchster benutzter Slot + 1 (für Schleifen) */
  top = 0;
  private free: number[] = [];

  id(slot: number): number {
    return (this.gen[slot] << SLOT_BITS) | slot;
  }
  slotOf(id: number): number {
    return id & SLOT_MASK;
  }
  valid(id: number): boolean {
    if (id <= 0) return false;
    const s = id & SLOT_MASK;
    return this.alive[s] === 1 && this.gen[s] === id >> SLOT_BITS;
  }
  /** Slot zu Handle, oder -1 */
  slot(id: number): number {
    return this.valid(id) ? id & SLOT_MASK : -1;
  }

  spawn(type: number, owner: number, x: number, y: number, hp: number): number {
    let s: number;
    if (this.free.length) s = this.free.pop()!;
    else if (this.top < this.cap) s = this.top++;
    else return -1;
    this.alive[s] = 1;
    this.gen[s] = ((this.gen[s] + 1) & 0x3fff) || 1;
    this.type[s] = type;
    this.owner[s] = owner;
    this.state[s] = S.Idle;
    this.sub[s] = 0;
    this.stance[s] = 1;
    this.layer[s] = 0;
    this.flags[s] = 0;
    this.x[s] = x;
    this.y[s] = y;
    this.hp[s] = hp;
    this.maxHp[s] = hp;
    this.face[s] = 0;
    this.tx[s] = x;
    this.ty[s] = y;
    this.goal[s] = -1;
    this.target[s] = 0;
    this.targetKind[s] = 0;
    this.cd[s] = 0;
    this.timer[s] = 0;
    this.carryRes[s] = 0;
    this.carryAmt[s] = 0;
    this.home[s] = 0;
    this.ax[s] = x;
    this.ay[s] = y;
    this.stuck[s] = 0;
    this.burn[s] = 0;
    this.count++;
    return s;
  }

  kill(s: number): void {
    if (!this.alive[s]) return;
    this.alive[s] = 0;
    this.waypoints.delete(s);
    this.free.push(s);
    this.count--;
  }
}
