import type { MapGenParams, MapJson } from '../map';
import type { Command, PlayerSetup } from '../sim/types';

/** Spielstart-Konfiguration (Singleplayer, Server und Missionen gleichermaßen) */
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
  /** Index des eigenen Spielers (nur clientseitig sinnvoll) */
  me: number;
}

export type SlotKind = 'open' | 'human' | 'ai' | 'closed';

export interface SlotInfo {
  kind: SlotKind;
  name: string;
  team: number;
  color: number;
  ready: boolean;
  /** Persönlichkeit der KI */
  ai: number;
  difficulty: number;
  connected: boolean;
  /** Client-ID für menschliche Spieler */
  client?: number;
}

export interface RoomSettings {
  name: string;
  seed: number;
  size: number;
  water: number;
  trees: number;
  hills: number;
  startGold: number;
  troopLimit: number;
  speed: number;
  fog: boolean;
  extreme: boolean;
  maxPlayers: number;
}

export interface RoomState {
  id: number;
  host: number;
  settings: RoomSettings;
  slots: SlotInfo[];
  playing: boolean;
  chat: { from: string; text: string; t: number }[];
}

export interface RoomListItem {
  id: number;
  name: string;
  players: number;
  max: number;
  playing: boolean;
  host: string;
  size: number;
}

export const FRAME = { Control: 0, Snapshot: 1, View: 2 } as const;

/** Client -> Server */
export type ClientMsg =
  | { t: 'hello'; name: string; token?: string }
  | { t: 'list' }
  | { t: 'create'; settings: Partial<RoomSettings> }
  | { t: 'join'; room: number }
  | { t: 'leave' }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'slot'; index: number; patch: Partial<SlotInfo> }
  | { t: 'ready'; ready: boolean }
  | { t: 'chat'; text: string }
  | { t: 'start' }
  | { t: 'cmd'; cmd: Command }
  | { t: 'resync' }
  | { t: 'speed'; speed: number }
  | { t: 'pause'; paused: boolean }
  | { t: 'ping'; n: number };

/** Server -> Client (Kontrollnachrichten) */
export type ServerMsg =
  | { t: 'welcome'; id: number; token: string; name: string; resumed?: boolean }
  | { t: 'rooms'; list: RoomListItem[] }
  | { t: 'room'; room: RoomState | null; you: number }
  | { t: 'chat'; from: string; text: string }
  | { t: 'start'; me: number; setup: GameSetup }
  | { t: 'end'; winner: number }
  | { t: 'error'; message: string }
  | { t: 'pong'; n: number }
  | { t: 'paused'; paused: boolean; speed: number };

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  name: 'Neues Spiel',
  seed: 1,
  size: 200,
  water: 0.35,
  trees: 0.5,
  hills: 0.6,
  startGold: 1500,
  troopLimit: 1000,
  speed: 1,
  fog: false,
  extreme: false,
  maxPlayers: 8,
};
