import { RES_COUNT } from '../data/resources';
import type { PlayerKind } from './types';

export interface PopFactor {
  key: string;
  label: string;
  value: number;
}

export class PlayerState {
  alive = true;
  gold = 0;
  stock = new Int32Array(RES_COUNT);
  /** Gesamtproduktion je Ware (Statistik) */
  produced = new Int32Array(RES_COUNT);
  tax = 0;
  ration = 2;
  popularity = 60;
  popTarget = 60;
  factors: PopFactor[] = [];
  keepId = 0;
  campfireId = 0;
  lordId = 0;
  horses = 0;
  /** Marktpreis-Multiplikator je Ware */
  priceMul = new Float32Array(RES_COUNT).fill(1);
  // Kapazitäten (aus Lagermodulen) und Belegung
  cap = { stock: 0, granary: 0, armory: 0 };
  used = { stock: 0, granary: 0, armory: 0 };
  housing = 0;
  peasants = 0;
  troops = 0;
  fear = 0;
  foodTypes = 0;
  foodShort = false;
  foodAcc = 0;
  aleAcc = 0;
  spawnTimer = 0;
  leaveTimer = 0;
  /** Extreme */
  power = 0;
  powerMax = 100;
  abilityCd: number[] = [];
  banners = 0;
  /** zeitlich begrenzte Beliebtheits-Ereignisse */
  events: { label: string; value: number; until: number }[] = [];
  ai: unknown = null;
  stats = { kills: 0, losses: 0, built: 0, goldEarned: 0, ever: new Int32Array(40) };
  abilitiesUsed: number[] = [];
  /** gesetzt wenn der Spieler besiegt ist */
  defeatedTick = -1;
  /** Hilferufe */
  aidRequests: { from: number; tick: number }[] = [];

  constructor(
    readonly id: number,
    public team: number,
    public name: string,
    public kind: PlayerKind,
    public color: number,
  ) {}
}
