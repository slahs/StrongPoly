import type { Command, MapGenParams, MapJson, PlayerSetup, PlayerView, Snapshot } from '@strongpoly/shared';

/** Spielstart-Konfiguration (Singleplayer und Server gleichermaßen) */
export interface GameSetup {
  map: { gen: MapGenParams } | { json: MapJson };
  players: PlayerSetup[];
  seed: number;
  startGold: number;
  troopLimit: number;
  fog: boolean;
  extreme: boolean;
  speed?: number;
  mission?: string;
  startRes?: number;
  dev?: boolean;
  /** Index des eigenen Spielers */
  me: number;
}

export type ToWorker =
  | { t: 'start'; setup: GameSetup }
  | { t: 'load'; save: unknown }
  | { t: 'cmd'; cmd: Command }
  | { t: 'speed'; speed: number }
  | { t: 'pause'; paused: boolean }
  | { t: 'save' }
  | { t: 'dev'; op: string; args: Record<string, number> }
  | { t: 'stop' };

export type FromWorker =
  | { t: 'snap'; data: Uint8Array }
  | { t: 'me'; view: PlayerView }
  | { t: 'info'; tickMs: number; tick: number; units: number }
  | { t: 'saved'; save: unknown }
  | { t: 'error'; message: string };

export type { Snapshot };
