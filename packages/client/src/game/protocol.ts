import type { Command, PlayerView, Snapshot } from '@strongpoly/shared';

export type { GameSetup } from '@strongpoly/shared';
import type { GameSetup } from '@strongpoly/shared';

export type ToWorker =
  | { t: 'start'; setup: GameSetup }
  | { t: 'load'; setup: GameSetup; state: unknown }
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
