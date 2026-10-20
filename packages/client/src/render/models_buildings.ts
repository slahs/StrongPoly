import { BT, BuildingDef } from '@strongpoly/shared';
import { ModelBuilder, ModelGeos } from './builder';
import {
  armorer,
  appleOrchard,
  bakery,
  blacksmith,
  brewery,
  dairyFarm,
  fletcher,
  granary,
  hopFarm,
  hunterPost,
  inn,
  ironMine,
  market,
  mill,
  armory,
  oxTether,
  pitchRig,
  poleturner,
  quarry,
  stockpile,
  tanner,
  wheatFarm,
  woodcutter,
} from './models_economy';
import {
  barracks,
  cauldron,
  drawbridge,
  dungeon,
  engineerGuild,
  gateStone,
  gateWood,
  keep,
  killingPit,
  mercPost,
  pit,
  pitchDitch,
  stable,
  stairs,
  towerGuard,
  towerLookout,
  towerRound,
  turretModel,
  wallParts,
  wallStraight,
} from './models_castle';
import { campfire, cathedral, chapel, church, garden, gallows, hovel, maypole, statue, stocks, well, waterPot } from './models_town';

export { wallParts, WALL_T } from './models_castle';

export const WALL_TYPES: number[] = [BT.WallWood, BT.WallLow, BT.WallHigh];
/** Bauwerke, an die Mauerarme anschließen (Mauern, Türme, Tore, Bergfried, Ölkessel) */
export const WALL_JOIN: Set<number> = new Set([BT.WallWood, BT.WallLow, BT.WallHigh, BT.TowerLookout, BT.TowerGuard, BT.TowerRound, BT.GateWood, BT.GateStone, BT.Keep, BT.Cauldron]);

/** Höhe, auf der das Geschütz auf dem Großen Turm sitzt (Kronenhöhe) */
export const TURRET_BASE_Y = 4.6;

/** Detailstufen der Gebäudemodelle: 0 = Grundform, 1 = mittlere Details (Fenster, Balken), 2 = Feindetail */
export type ModelDetail = 0 | 1 | 2;

/** Builder-Optionen der Gebäude: Zusatzattribute (Bauanimation, Oberflächen), Farbvariation, Fuß-Verdunklung */
function newBuilder(ao = 0.32, aoH = 0.55): ModelBuilder {
  return new ModelBuilder({ ao, aoH, extras: true, jitter: 0.05, grad: 0.16 });
}

const MODELS: Record<number, (b: ModelBuilder, W: number, H: number) => void> = {
  [BT.Keep]: keep,
  [BT.Campfire]: (b) => campfire(b),
  [BT.Hovel]: hovel,
  [BT.Stockpile]: stockpile,
  [BT.Granary]: granary,
  [BT.Armory]: armory,
  [BT.Woodcutter]: woodcutter,
  [BT.Quarry]: quarry,
  [BT.OxTether]: oxTether,
  [BT.IronMine]: ironMine,
  [BT.PitchRig]: pitchRig,
  [BT.AppleOrchard]: appleOrchard,
  [BT.DairyFarm]: dairyFarm,
  [BT.HunterPost]: hunterPost,
  [BT.WheatFarm]: wheatFarm,
  [BT.HopFarm]: hopFarm,
  [BT.Mill]: mill,
  [BT.Bakery]: bakery,
  [BT.Brewery]: brewery,
  [BT.Inn]: inn,
  [BT.Fletcher]: (b) => fletcher(b),
  [BT.Poleturner]: (b) => poleturner(b),
  [BT.Blacksmith]: (b) => blacksmith(b),
  [BT.Tanner]: (b) => tanner(b),
  [BT.Armorer]: (b) => armorer(b),
  [BT.Market]: market,
  [BT.Chapel]: chapel,
  [BT.Church]: church,
  [BT.Cathedral]: cathedral,
  [BT.Well]: (b) => well(b),
  [BT.WaterPot]: (b) => waterPot(b),
  [BT.Garden]: garden,
  [BT.Statue]: (b) => statue(b),
  [BT.Maypole]: (b) => maypole(b),
  [BT.Gallows]: (b) => gallows(b),
  [BT.Stocks]: (b) => stocks(b),
  [BT.Dungeon]: dungeon,
  [BT.WallWood]: (b, _w, _h) => wallStraight(b, BT.WallWood, 1.5),
  [BT.WallLow]: (b) => wallStraight(b, BT.WallLow, 1.5),
  [BT.WallHigh]: (b) => wallStraight(b, BT.WallHigh, 2.4),
  [BT.TowerLookout]: (b) => towerLookout(b),
  [BT.TowerGuard]: (b) => towerGuard(b),
  [BT.TowerRound]: (b) => towerRound(b),
  [BT.GateWood]: gateWood,
  [BT.GateStone]: gateStone,
  [BT.Drawbridge]: drawbridge,
  [BT.Stairs]: (b) => stairs(b),
  [BT.Pit]: (b) => pit(b),
  [BT.KillingPit]: (b) => killingPit(b),
  [BT.PitchDitch]: (b) => pitchDitch(b),
  [BT.Cauldron]: (b) => cauldron(b),
  [BT.TurretBallista]: (b) => turretModel(b, 'ballista'),
  [BT.TurretMangonel]: (b) => turretModel(b, 'mangonel'),
  [BT.Barracks]: barracks,
  [BT.MercPost]: mercPost,
  [BT.Stable]: stable,
  [BT.EngineerGuild]: engineerGuild,
};

/** Alle Typen mit einem eigenen Modell (Testabdeckung) */
export const MODELLED_TYPES: number[] = Object.keys(MODELS).map(Number);

const builders = new Map<number, ModelBuilder>();

/**
 * Gebäudemodell. `detail` filtert Teile nach Detailstufe (Niedrig nutzt 1, Mittel/Hoch 2). Jeder Aufruf liefert
 * eigene Geometrien (ein TypeMesh hängt Instanzattribute daran); der Aufbau der Teile selbst wird je Typ nur einmal gemacht.
 */
export function buildBuildingModel(def: BuildingDef, detail: ModelDetail = 2): ModelGeos {
  let b = builders.get(def.id);
  if (!b) {
    b = newBuilder();
    const fn = MODELS[def.id];
    if (fn) fn(b, def.w, def.h);
    else b.box(def.w - 0.2, Math.max(0.3, def.height * 0.6), def.h - 0.2, 0, 0, 0, 0xb2aa9b);
    builders.set(def.id, b);
  }
  return b.build(detail);
}

/** Mauerstück (Pfosten, Arm oder Einzelpfosten) als Instanzmodell; Arme liegen auf x ∈ [0, 0.5] */
export function buildWallModel(id: number, height: number, kind: 'arm' | 'post' | 'stub', detail: ModelDetail = 2): ModelGeos {
  const b = new ModelBuilder({ ao: 0.34, aoH: 0.8, extras: true, jitter: 0.04, grad: 0.12 });
  wallParts(b, id, height, kind, 1);
  return b.build(detail);
}

/** Geschütz, das auf einem Großen Turm sitzt (Ursprung auf der Turmkrone) */
export function buildTurretModel(kind: 'ballista' | 'mangonel', detail: ModelDetail = 2): ModelGeos {
  const b = newBuilder(0.2, 0.4);
  turretModel(b, kind);
  return b.build(detail);
}

/** Gebäude, deren Dreiecksbudget (Bergfried bis ~8k, normale Gebäude ~1,5k) im Test geprüft wird */
export const TRIS_BUDGET = { keep: 8000, large: 4500, normal: 2600, wall: 900 };
