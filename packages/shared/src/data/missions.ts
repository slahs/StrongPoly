import { BT } from './buildings';
import { R } from './resources';
import { U } from './units';
import type { GameSetup } from '../net/protocol';
import type { Sim } from '../sim/sim';
import type { PlayerSetup } from '../sim/types';

/** Missionsziel (datengetrieben, serialisierbar) */
export type Objective =
  | { k: 'build'; type: number; n: number; text: string }
  | { k: 'buildAny'; types: number[]; n: number; text: string }
  | { k: 'produced'; res: number; n: number; text: string }
  | { k: 'stock'; res: number; n: number; text: string }
  | { k: 'peasants'; n: number; text: string }
  | { k: 'popularity'; n: number; text: string }
  | { k: 'gold'; n: number; text: string }
  | { k: 'troops'; n: number; text: string }
  | { k: 'unitCount'; type: number; n: number; text: string }
  | { k: 'kills'; n: number; text: string }
  | { k: 'defeat'; player: number; text: string }
  | { k: 'ability'; id: number; text: string }
  | { k: 'banners'; n: number; text: string }
  | { k: 'survive'; ticks: number; text: string }
  | { k: 'wallTiles'; n: number; text: string };

export interface MissionStage {
  title: string;
  /** Hinweistext beim Beginn der Stufe */
  hint: string;
  objectives: Objective[];
}

export interface MissionDef {
  id: string;
  name: string;
  desc: string;
  intro: string;
  stages: MissionStage[];
  setup: () => GameSetup;
  /** Startaufbau (Gebäude, Vorräte) */
  init?: (sim: Sim) => void;
}

const base = (players: PlayerSetup[], seed: number, size: number, extra: Partial<GameSetup> = {}): GameSetup => ({
  map: { gen: { seed, size, players: players.length, water: 0.25, trees: 0.5, hills: 0.4 } },
  players,
  seed,
  startGold: 1200,
  troopLimit: 400,
  fog: false,
  extreme: false,
  me: 0,
  ...extra,
});

const you: PlayerSetup = { name: 'Du', team: 0, kind: 'human', color: 0 };
const guard: PlayerSetup = { name: 'Wächter', team: 1, kind: 'ai', ai: 10, difficulty: 0, color: 1 };
const bandit: PlayerSetup = { name: 'Banditenhauptmann', team: 1, kind: 'ai', ai: 9, difficulty: 0, color: 1 };

export const MISSIONS: MissionDef[] = [
  {
    id: 'm1',
    name: 'Das erste Lager',
    desc: 'Wirtschaft: Holz, Nahrung und Wohnraum aufbauen.',
    intro: 'Willkommen, Lord! Baue zuerst Holzfäller und eine Apfelplantage (Kategorien Industrie/Landwirtschaft), dann Hütten für neue Bauern.',
    setup: () => base([you], 11, 96, { startGold: 600, startRes: 1 }),
    stages: [
      {
        title: 'Rohstoffe',
        hint: 'Holzfäller liefern Holz ins Lager. Bauern gehen zu Fuß zwischen Arbeitsplatz und Lager.',
        objectives: [
          { k: 'build', type: BT.Woodcutter, n: 2, text: '2 Holzfäller bauen' },
          { k: 'build', type: BT.AppleOrchard, n: 1, text: 'Eine Apfelplantage auf fruchtbarem Boden (grün) bauen' },
          { k: 'produced', res: R.Wood, n: 40, text: '40 Holz herstellen' },
        ],
      },
      {
        title: 'Wachstum',
        hint: 'Hütten erhöhen das Bevölkerungslimit. Neue Bauern kommen nur bei Beliebtheit ab 50.',
        objectives: [
          { k: 'build', type: BT.Hovel, n: 3, text: '3 Hütten bauen' },
          { k: 'peasants', n: 20, text: '20 Bauern erreichen' },
          { k: 'build', type: BT.Quarry, n: 1, text: 'Einen Steinbruch auf dem Steinvorkommen bauen' },
          { k: 'build', type: BT.OxTether, n: 1, text: 'Ein Ochsengespann für den Steintransport bauen' },
          { k: 'produced', res: R.Stone, n: 20, text: '20 Stein herstellen' },
        ],
      },
    ],
  },
  {
    id: 'm2',
    name: 'Brot und Bier',
    desc: 'Beliebtheit: Nahrung, Steuern, Bier und Religion.',
    intro: 'Zufriedene Bauern arbeiten für dich. Sorge für Nahrungsvielfalt, Bier und Glauben – und sammle Steuern.',
    setup: () => base([you], 23, 96, { startGold: 1000 }),
    stages: [
      {
        title: 'Nahrung',
        hint: 'Brot entsteht aus Weizen → Mühle (Mehl) → Bäckerei. Jede zusätzliche Nahrungssorte steigert die Beliebtheit.',
        objectives: [
          { k: 'build', type: BT.WheatFarm, n: 1, text: 'Weizenhof bauen' },
          { k: 'build', type: BT.Mill, n: 1, text: 'Mühle bauen' },
          { k: 'build', type: BT.Bakery, n: 1, text: 'Bäckerei bauen' },
          { k: 'produced', res: R.Bread, n: 20, text: '20 Brot herstellen' },
        ],
      },
      {
        title: 'Bier und Glaube',
        hint: 'Hopfen → Brauerei → Schenke. Kapellen und Kirchen brauchen Priester (Arbeiter).',
        objectives: [
          { k: 'build', type: BT.Inn, n: 1, text: 'Schenke bauen' },
          { k: 'produced', res: R.Ale, n: 10, text: '10 Bier herstellen' },
          { k: 'buildAny', types: [BT.Chapel, BT.Church, BT.Cathedral], n: 1, text: 'Eine Kapelle oder Kirche bauen' },
          { k: 'popularity', n: 75, text: 'Beliebtheit 75 erreichen' },
        ],
      },
    ],
  },
  {
    id: 'm3',
    name: 'Wehrhafte Mauern',
    desc: 'Bau und Verteidigung: Mauern, Tor, Türme – und ein Banditenüberfall.',
    intro: 'Banditen sammeln sich. Befestige deine Burg: Mauern ziehen (Linie ziehen), Tor, Wachturm, Treppen und Bogenschützen auf die Zinnen!',
    setup: () => base([you, bandit], 5, 128, { startGold: 1500, startRes: 2 }),
    init: (sim) => {
      sim.addStock(0, R.Stone, 150);
      sim.addStock(0, R.Wood, 150);
    },
    stages: [
      {
        title: 'Befestigen',
        hint: 'Mauern per Drag-Linie platzieren. Ein Tor lässt nur deine Einheiten durch. Treppen führen auf die Mauerkrone.',
        objectives: [
          { k: 'wallTiles', n: 30, text: '30 Mauerstücke bauen' },
          { k: 'buildAny', types: [BT.GateWood, BT.GateStone], n: 1, text: 'Ein Tor bauen' },
          { k: 'buildAny', types: [BT.TowerLookout, BT.TowerGuard, BT.TowerRound], n: 1, text: 'Einen Turm bauen' },
          { k: 'build', type: BT.Stairs, n: 1, text: 'Eine Treppe an der Mauer bauen' },
        ],
      },
      {
        title: 'Verteidigen',
        hint: 'Rekrutiere Bogenschützen in der Kaserne (Waffenkammer + Bogner nötig) und halte durch!',
        objectives: [
          { k: 'build', type: BT.Barracks, n: 1, text: 'Kaserne bauen' },
          { k: 'troops', n: 8, text: '8 Soldaten haben' },
          { k: 'survive', ticks: 14 * 600, text: 'Bis Minute 14 durchhalten' },
          { k: 'kills', n: 5, text: '5 Gegner besiegen' },
        ],
      },
    ],
  },
  {
    id: 'm4',
    name: 'Der Sturm auf die Burg',
    desc: 'Angriff: Armee aufstellen, Belagerungswaffen bauen, den Lord besiegen.',
    intro: 'Der Wächter-Lord hat sich verschanzt. Rüste eine Armee aus und stürme seine Burg – Rammböcke öffnen Tore, Leiterträger erklimmen Mauern.',
    setup: () => base([you, guard], 31, 128, { startGold: 4000, troopLimit: 600 }),
    init: (sim) => {
      const st = sim.map.starts[0];
      for (let r = 6; r < 18; r++) {
        let done = false;
        for (let dy = -r; dy <= r && !done; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (sim.checkPlace(0, BT.Armory, st.x + dx, st.y + dy, 0, true)) continue;
            sim.addBuilding(0, BT.Armory, st.x + dx, st.y + dy, 0);
            done = true;
            break;
          }
        if (done) break;
      }
      sim.recountAll();
      sim.addStock(0, R.Wood, 150);
      sim.addStock(0, R.Stone, 150);
      for (const [r, n] of [[R.Spear, 40], [R.Bow, 40], [R.Mace, 20], [R.Leather, 20], [R.Sword, 10], [R.Armor, 20]] as [number, number][]) sim.addStock(0, r, n);
    },
    stages: [
      {
        title: 'Aufrüsten',
        hint: 'Baue Kaserne, Ingenieurszunft und rekrutiere. Die Waffenkammer ist gefüllt.',
        objectives: [
          { k: 'build', type: BT.Barracks, n: 1, text: 'Kaserne bauen' },
          { k: 'build', type: BT.EngineerGuild, n: 1, text: 'Ingenieurszunft bauen' },
          { k: 'troops', n: 25, text: '25 Truppen aufstellen' },
          { k: 'unitCount', type: U.Ram, n: 1, text: 'Einen Rammbock bauen' },
        ],
      },
      {
        title: 'Sturmangriff',
        hint: 'Wähle deine Truppen (Rahmen ziehen), Rechtsklick auf Feinde greift an. Rammbock: Rechtsklick auf das Tor.',
        objectives: [{ k: 'defeat', player: 1, text: 'Den Lord des Wächters besiegen' }],
      },
    ],
  },
  {
    id: 'm5',
    name: 'Extreme!',
    desc: 'Extreme-Fähigkeiten: Machtleiste, Fahnenstangen, Pfeilhagel.',
    intro: 'Im Extreme-Modus füllt sich eine Machtleiste. Erobere Fahnenstangen (Truppen daneben stellen) und setze Fähigkeiten ein.',
    setup: () => base([you, bandit], 77, 128, { startGold: 2000, extreme: true }),
    init: (sim) => {
      sim.players[0].power = 80;
      sim.addStock(0, R.Wood, 100);
      sim.addStock(0, R.Stone, 100);
    },
    stages: [
      {
        title: 'Macht nutzen',
        hint: 'Die Fähigkeiten stehen oben in der Leiste (Hotkeys Z, C, N, M, K). Pfeilhagel und Felsschlag brauchen ein Zielgebiet.',
        objectives: [
          { k: 'ability', id: 4, text: 'Goldspende einsetzen' },
          { k: 'ability', id: 0, text: 'Pfeilhagel auf ein Zielgebiet einsetzen' },
          { k: 'troops', n: 10, text: '10 Soldaten haben (Kaserne + Waffen)' },
        ],
      },
      {
        title: 'Fahnen erobern',
        hint: 'Alle 90 Sekunden erscheint eine neue Fahnenstange auf der Karte. Stelle Truppen daneben, um sie zu erobern.',
        objectives: [
          { k: 'banners', n: 2, text: '2 Fahnenstangen halten' },
          { k: 'defeat', player: 1, text: 'Den Banditenhauptmann besiegen' },
        ],
      },
    ],
  },
];
