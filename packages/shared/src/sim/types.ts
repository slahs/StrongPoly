import type { GameMap } from '../map/gamemap';

export const Stance = { Hold: 0, Defensive: 1, Aggressive: 2 } as const;
export const Formation = { Free: 0, Line: 1, Box: 2, Wedge: 3 } as const;

export type Command =
  | { c: 'place'; type: number; x: number; y: number; rot?: number }
  | { c: 'placeLine'; type: number; x1: number; y1: number; x2: number; y2: number }
  | { c: 'demolish'; ids: number[] }
  | { c: 'move'; units: number[]; x: number; y: number; queue?: boolean; attack?: boolean; formation?: number }
  | { c: 'attack'; units: number[]; kind: 'unit' | 'building'; target: number }
  | { c: 'attackGround'; units: number[]; x: number; y: number }
  | { c: 'patrol'; units: number[]; x: number; y: number }
  | { c: 'stance'; units: number[]; stance: number }
  | { c: 'stop'; units: number[] }
  | { c: 'recruit'; building: number; unit: number; count: number }
  | { c: 'setTax'; level: number }
  | { c: 'setRation'; level: number }
  | { c: 'trade'; res: number; amount: number; buy: boolean }
  | { c: 'setRecipe'; building: number; recipe: number }
  | { c: 'dig'; x1: number; y1: number; x2: number; y2: number; fill: boolean }
  | { c: 'repair'; building: number }
  | { c: 'ability'; id: number; x: number; y: number }
  | { c: 'tunnel'; units: number[]; x: number; y: number }
  | { c: 'igniteDitch'; x: number; y: number }
  | { c: 'sendAid'; to: number; res: number; amount: number }
  | { c: 'requestAid'; to: number; text?: string }
  | { c: 'sendTroops'; to: number; units: number[] }
  | { c: 'surrender' };

export interface PlayerCommand {
  p: number;
  cmd: Command;
}

export type PlayerKind = 'human' | 'ai';

export interface PlayerSetup {
  name: string;
  team: number;
  kind: PlayerKind;
  /** KI-Persönlichkeit (Index) */
  ai?: number;
  /** Schwierigkeit 0..3 (Bonus auf Einkommen/Reaktion) */
  difficulty?: number;
  color?: number;
}

export interface SimConfig {
  map: GameMap;
  players: PlayerSetup[];
  seed: number;
  startGold: number;
  troopLimit: number;
  fog: boolean;
  extreme: boolean;
  /** Startressourcen-Multiplikator */
  startRes?: number;
  /** Missionsskript */
  mission?: string;
  /** Zustand wird anschließend per restoreSim geladen (kein Startaufbau) */
  restore?: boolean;
}

export type SimEvent =
  | { e: 'fx'; k: string; x: number; y: number; z?: number; p?: number }
  | { e: 'msg'; p: number; text: string }
  | { e: 'win'; team: number }
  | { e: 'lose'; p: number }
  | { e: 'alert'; p: number; x: number; y: number; k: string };
