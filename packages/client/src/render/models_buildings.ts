import { BT, BuildingDef, PAL } from '@strongpoly/shared';
import { ModelBuilder, ModelGeos } from './builder';

/** Zinnen auf einer rechteckigen Krone */
function merlons(b: ModelBuilder, w: number, d: number, y: number, color: number, step = 0.5): void {
  const nx = Math.max(2, Math.round(w / step));
  const nz = Math.max(2, Math.round(d / step));
  for (let i = 0; i < nx; i += 2) {
    const x = -w / 2 + (i + 0.5) * (w / nx);
    b.box(w / nx * 0.8, 0.18, 0.1, x, y, -d / 2 + 0.05, color);
    b.box(w / nx * 0.8, 0.18, 0.1, x, y, d / 2 - 0.05, color);
  }
  for (let j = 1; j < nz - 1; j += 2) {
    const z = -d / 2 + (j + 0.5) * (d / nz);
    b.box(0.1, 0.18, d / nz * 0.8, -w / 2 + 0.05, y, z, color);
    b.box(0.1, 0.18, d / nz * 0.8, w / 2 - 0.05, y, z, color);
  }
}

function hut(b: ModelBuilder, w: number, d: number, h: number, wall: number, roof: number, roofTeam = false, door = true): void {
  b.box(w, h, d, 0, 0, 0, wall);
  b.roof(w + 0.15, Math.min(0.9, w * 0.45), d + 0.15, 0, h, 0, roof, roofTeam);
  if (door) b.box(Math.min(0.4, w * 0.3), Math.min(0.55, h * 0.7), 0.04, 0, 0, d / 2 + 0.01, PAL.black);
}

function flag(b: ModelBuilder, x: number, y: number, z: number, h = 0.8): void {
  b.box(0.04, h, 0.04, x, y, z, PAL.woodDark);
  b.box(0.04, 0.22, 0.34, x, y + h - 0.24, z + 0.19, PAL.roof, true);
}

function tower(b: ModelBuilder, r: number, h: number, x: number, z: number, wallC: number, roofC: number | null): void {
  b.cyl(r, r * 1.08, h, 8, x, 0, z, wallC);
  b.cyl(r * 1.2, r * 1.2, 0.18, 8, x, h, z, wallC);
  if (roofC !== null) b.cone(r * 1.2, r * 1.2, 8, x, h + 0.18, z, roofC, true);
  else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.box(r * 0.5, 0.2, r * 0.5, Math.cos(a) * r * 0.9 + x, h + 0.18, Math.sin(a) * r * 0.9 + z, wallC);
    }
  }
}

function barrel(b: ModelBuilder, x: number, z: number, c: number = PAL.woodDark): void {
  b.cyl(0.14, 0.14, 0.3, 6, x, 0, z, c);
  b.cyl(0.15, 0.15, 0.04, 6, x, 0.1, z, PAL.black);
}

function crate(b: ModelBuilder, x: number, z: number, s = 0.3, c: number = PAL.wood): void {
  b.box(s, s, s, x, 0, z, c);
}

function tree(b: ModelBuilder, x: number, z: number, leaf = PAL.treeLight, fruit?: number): void {
  b.cyl(0.05, 0.07, 0.3, 4, x, 0, z, PAL.trunk);
  b.cone(0.3, 0.45, 5, x, 0.25, z, leaf);
  if (fruit) {
    b.box(0.07, 0.07, 0.07, x + 0.18, 0.4, z, fruit);
    b.box(0.07, 0.07, 0.07, x - 0.12, 0.34, z + 0.12, fruit);
  }
}

function workshop(b: ModelBuilder, W: number, H: number, wall: number, roof: number, kind: string): void {
  hut(b, W - 0.5, H - 0.6, 0.9, wall, roof, false);
  b.box(0.3, 0.9, 0.3, W * 0.25, 0.9, -H * 0.15, PAL.stoneDark); // Schornstein
  flag(b, -W / 2 + 0.3, 0.2, H / 2 - 0.3, 1.2);
  switch (kind) {
    case 'bow':
      b.box(0.05, 0.7, 0.05, W / 2 - 0.2, 0, H / 2 - 0.2, PAL.wood);
      b.box(0.05, 0.7, 0.05, W / 2 - 0.4, 0, H / 2 - 0.2, PAL.wood);
      break;
    case 'smith':
      b.box(0.4, 0.25, 0.3, W / 2 - 0.3, 0, H / 2 - 0.2, PAL.black);
      b.box(0.2, 0.1, 0.2, W / 2 - 0.3, 0.25, H / 2 - 0.2, PAL.stone);
      break;
    case 'armor':
      b.box(0.3, 0.5, 0.2, W / 2 - 0.3, 0, H / 2 - 0.2, PAL.stone);
      b.box(0.18, 0.15, 0.18, W / 2 - 0.3, 0.5, H / 2 - 0.2, PAL.stoneDark);
      break;
    case 'tan':
      b.box(0.5, 0.05, 0.4, W / 2 - 0.3, 0.5, H / 2 - 0.1, PAL.woodDark);
      b.box(0.06, 0.5, 0.06, W / 2 - 0.1, 0, H / 2 - 0.1, PAL.woodDark);
      b.box(0.06, 0.5, 0.06, W / 2 - 0.5, 0, H / 2 - 0.1, PAL.woodDark);
      break;
    default:
      b.cyl(0.08, 0.08, 0.7, 5, W / 2 - 0.2, 0, H / 2 - 0.2, PAL.wood);
  }
}

function wallPiece(b: ModelBuilder, h: number, wallC: number, topC: number): void {
  b.box(1, h, 1, 0, 0, 0, wallC);
  b.box(1.02, 0.06, 1.02, 0, h, 0, topC);
  const m = 0.26;
  for (const [x, z] of [[-0.37, -0.37], [0.37, -0.37], [-0.37, 0.37], [0.37, 0.37]]) b.box(m, 0.2, m, x, h + 0.06, z, wallC);
}

export function buildBuildingModel(def: BuildingDef): ModelGeos {
  const b = new ModelBuilder();
  const W = def.w;
  const H = def.h;
  switch (def.id) {
    case BT.Keep: {
      b.box(W - 0.4, 2.4, H - 0.4, 0, 0, 0, PAL.stone);
      b.box(W - 1.4, 1.6, H - 1.4, 0, 2.4, 0, PAL.stoneDark);
      merlons(b, W - 0.4, H - 0.4, 2.4, PAL.stone);
      b.roof(W - 1.4, 0.9, H - 1.4, 0, 4.0, 0, PAL.roof, true);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) tower(b, 0.55, 3.0, sx * (W / 2 - 0.45), sz * (H / 2 - 0.45), PAL.stone, PAL.roof);
      b.box(1.0, 1.4, 0.1, 0, 0, H / 2 - 0.2, PAL.black);
      flag(b, 0, 4.9, 0, 1.2);
      break;
    }
    case BT.Campfire:
      b.cyl(0.32, 0.36, 0.1, 7, 0, 0, 0, PAL.stoneDark);
      b.box(0.5, 0.08, 0.1, 0, 0.1, 0, PAL.trunk, false, 0.6);
      b.box(0.5, 0.08, 0.1, 0, 0.1, 0, PAL.trunk, false, -0.6);
      b.cone(0.14, 0.4, 5, 0, 0.12, 0, PAL.gold);
      b.cone(0.09, 0.3, 4, 0, 0.12, 0, PAL.roof);
      break;
    case BT.Hovel:
      hut(b, W - 0.3, H - 0.3, 0.7, PAL.sandDark, PAL.roof, true);
      b.box(0.2, 0.5, 0.2, 0.3, 0.9, 0, PAL.stoneDark);
      break;
    case BT.Stockpile:
      b.box(W - 0.1, 0.08, H - 0.1, 0, 0, 0, PAL.sandDark);
      for (let i = 0; i < 3; i++) b.box(0.9, 0.22, 0.28, -0.5, 0.08 + i * 0.22, -0.9 + (i % 2) * 0.05, PAL.wood);
      crate(b, 0.7, -0.8, 0.5);
      crate(b, 0.7, -0.2, 0.4, PAL.woodDark);
      b.box(0.5, 0.5, 0.5, -0.7, 0.08, 0.7, PAL.stone);
      b.box(0.4, 0.4, 0.4, 0.5, 0.08, 0.8, PAL.stoneDark);
      flag(b, W / 2 - 0.15, 0, H / 2 - 0.15, 1.0);
      break;
    case BT.Granary:
      b.box(W - 0.3, 1.0, H - 0.3, 0, 0, 0, PAL.sand);
      b.roof(W, 0.9, H, 0, 1.0, 0, PAL.thatch);
      b.box(0.6, 0.8, 0.06, 0, 0, H / 2 - 0.14, PAL.woodDark);
      b.cyl(0.35, 0.35, 0.5, 6, W / 2 - 0.3, 1.0, 0.1, PAL.thatch, true);
      break;
    case BT.Armory:
      b.box(W - 0.2, 1.1, H - 0.2, 0, 0, 0, PAL.stone);
      merlons(b, W - 0.2, H - 0.2, 1.1, PAL.stone);
      b.box(0.7, 0.8, 0.06, 0, 0, H / 2 - 0.1, PAL.woodDark);
      b.box(0.4, 0.5, 0.06, -0.8, 0.4, H / 2 - 0.1, PAL.roof, true);
      b.box(0.04, 0.6, 0.04, 0.8, 0.4, H / 2 - 0.1, PAL.stoneDark);
      b.box(0.3, 0.04, 0.04, 0.8, 0.8, H / 2 - 0.1, PAL.stoneDark);
      break;
    case BT.Woodcutter:
      hut(b, 1.1, 1.0, 0.6, PAL.wood, PAL.woodDark);
      b.box(0.8, 0.2, 0.25, 0.5, 0, 0.7, PAL.trunk);
      b.box(0.8, 0.2, 0.25, 0.5, 0.2, 0.7, PAL.trunk);
      b.box(0.06, 0.5, 0.06, -0.8, 0, 0.5, PAL.woodDark);
      b.box(0.3, 0.06, 0.06, -0.8, 0.5, 0.5, PAL.stone);
      break;
    case BT.Quarry:
      b.box(W - 0.3, 0.06, H - 0.3, 0, 0, 0, PAL.rockDark);
      b.box(1.2, 0.3, 1.2, -0.5, 0.06, -0.5, PAL.stoneDark);
      b.box(0.8, 0.5, 0.8, -0.4, 0.06, -0.4, PAL.stone);
      b.box(0.1, 1.3, 0.1, 0.9, 0, -0.9, PAL.wood);
      b.box(1.0, 0.1, 0.1, 0.5, 1.3, -0.9, PAL.wood);
      b.box(0.1, 0.5, 0.1, 0.1, 0.8, -0.9, PAL.woodDark);
      b.box(0.5, 0.3, 0.5, 0.8, 0.06, 0.6, PAL.wood);
      flag(b, -W / 2 + 0.2, 0, H / 2 - 0.2, 1.0);
      break;
    case BT.OxTether:
      b.box(W - 0.2, 0.06, H - 0.2, 0, 0, 0, PAL.sandDark);
      b.box(0.1, 0.8, 0.1, 0, 0, 0, PAL.woodDark);
      b.box(0.9, 0.08, 0.08, 0, 0.1, 0.2, PAL.wood);
      b.box(0.5, 0.35, 0.4, 0.5, 0.06, -0.4, PAL.wood);
      b.roof(0.7, 0.3, 0.6, 0.5, 0.41, -0.4, PAL.thatch);
      break;
    case BT.IronMine:
      b.cone(1.6, 1.3, 6, 0, 0, -0.3, PAL.rockDark);
      b.box(0.8, 0.7, 0.3, 0, 0, H / 2 - 0.9, PAL.black);
      b.box(0.1, 0.8, 0.1, -0.5, 0, H / 2 - 0.8, PAL.woodDark);
      b.box(0.1, 0.8, 0.1, 0.5, 0, H / 2 - 0.8, PAL.woodDark);
      b.box(1.2, 0.1, 0.1, 0, 0.8, H / 2 - 0.8, PAL.woodDark);
      b.box(0.5, 0.3, 0.4, 1.0, 0, 0.9, PAL.stoneDark);
      break;
    case BT.PitchRig:
      b.cyl(0.6, 0.7, 0.08, 6, 0, 0, 0, PAL.pitch);
      for (const [x, z] of [[-0.4, -0.3], [0.4, -0.3], [0, 0.45]]) b.box(0.07, 1.2, 0.07, x * 0.6, 0, z * 0.6, PAL.woodDark);
      b.box(0.2, 0.2, 0.2, 0, 1.15, 0, PAL.black);
      b.cyl(0.18, 0.18, 0.4, 6, 0.6, 0, 0.5, PAL.black);
      break;
    case BT.AppleOrchard:
      b.box(W - 0.2, 0.04, H - 0.2, 0, 0, 0, PAL.oasisDark);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j += 1) if ((i + j) % 2 === 0) tree(b, -W / 2 + 0.6 + i * 0.9, -H / 2 + 0.6 + j * 0.9, PAL.treeLight, PAL.roof);
      break;
    case BT.DairyFarm:
      b.box(W - 0.2, 0.04, H - 0.2, 0, 0, 0, PAL.oasis);
      hut(b, 1.4, 1.2, 0.8, PAL.roof, PAL.woodDark, false);
      for (const [x, z] of [[1.0, 0.6], [0.4, 1.1], [1.2, -0.4]]) {
        b.box(0.3, 0.25, 0.5, x, 0.05, z, PAL.white);
        b.box(0.16, 0.14, 0.16, x, 0.18, z + 0.3, PAL.black);
      }
      b.box(W - 0.2, 0.2, 0.05, 0, 0, H / 2 - 0.1, PAL.wood);
      break;
    case BT.HunterPost:
      hut(b, 1.2, 1.0, 0.7, PAL.woodDark, PAL.sandDark);
      b.box(0.04, 0.3, 0.04, 0.2, 1.1, 0.6, PAL.stone);
      b.box(0.5, 0.04, 0.04, 0.2, 1.3, 0.6, PAL.stone);
      b.box(0.04, 0.6, 0.04, -0.7, 0, 0.9, PAL.woodDark);
      break;
    case BT.WheatFarm:
      b.box(W - 0.2, 0.04, H - 0.2, 0, 0, 0, PAL.thatch);
      for (let i = 0; i < 5; i++) b.box(0.3, 0.3, H - 1.4, -W / 2 + 0.7 + i * 0.85, 0.04, 0.5, i % 2 ? PAL.thatch : PAL.sandDark);
      hut(b, 1.0, 0.8, 0.6, PAL.wood, PAL.thatch);
      break;
    case BT.HopFarm:
      b.box(W - 0.2, 0.04, H - 0.2, 0, 0, 0, PAL.oasisDark);
      for (let i = 0; i < 4; i++) {
        b.box(0.05, 1.1, 0.05, -W / 2 + 0.6 + i * 0.8, 0.04, -0.4, PAL.woodDark);
        b.box(0.35, 0.9, 0.35, -W / 2 + 0.6 + i * 0.8, 0.04, 0.5, PAL.treeLight);
      }
      break;
    case BT.Mill: {
      b.cyl(0.7, 1.0, 2.0, 8, 0, 0, 0, PAL.sand);
      b.cone(1.0, 0.9, 8, 0, 2.0, 0, PAL.roof, true);
      b.box(0.1, 1.6, 0.05, 0, 1.5, 1.02, PAL.wood, false);
      b.box(1.6, 0.1, 0.05, 0, 1.5, 1.02, PAL.wood);
      b.box(0.5, 0.7, 0.06, 0, 0, 0.98, PAL.woodDark);
      break;
    }
    case BT.Bakery:
      hut(b, W - 0.4, H - 0.4, 0.9, PAL.sand, PAL.roof, false);
      b.box(0.4, 1.0, 0.4, 0.7, 0.9, -0.3, PAL.stoneDark);
      b.cyl(0.35, 0.4, 0.4, 6, -1.0, 0, 0.9, PAL.stoneDark);
      flag(b, -W / 2 + 0.2, 0, H / 2 - 0.2, 1.1);
      break;
    case BT.Brewery:
      hut(b, W - 0.5, H - 0.6, 1.0, PAL.woodDark, PAL.wood, false);
      barrel(b, 1.0, 1.0);
      barrel(b, 0.6, 1.2);
      b.cyl(0.35, 0.35, 0.9, 7, -1.0, 0, 1.0, PAL.wood);
      flag(b, -W / 2 + 0.2, 0, -H / 2 + 0.2, 1.4);
      break;
    case BT.Inn:
      b.box(W - 0.3, 1.0, H - 0.3, 0, 0, 0, PAL.sand);
      b.box(W - 0.7, 0.8, H - 0.7, 0, 1.0, 0, PAL.sandDark);
      b.roof(W, 0.9, H - 0.2, 0, 1.8, 0, PAL.roof, true);
      b.box(0.5, 0.7, 0.05, 0, 0, H / 2 - 0.14, PAL.woodDark);
      b.box(0.04, 0.5, 0.04, W / 2 - 0.1, 0.6, H / 2 - 0.1, PAL.woodDark);
      b.box(0.3, 0.3, 0.04, W / 2 - 0.25, 0.6, H / 2 - 0.1, PAL.gold, true);
      barrel(b, -0.9, H / 2 - 0.1);
      break;
    case BT.Fletcher:
      workshop(b, W, H, PAL.wood, PAL.treeDark, 'bow');
      break;
    case BT.Poleturner:
      workshop(b, W, H, PAL.sand, PAL.woodDark, 'pole');
      break;
    case BT.Blacksmith:
      workshop(b, W, H, PAL.stone, PAL.black, 'smith');
      break;
    case BT.Tanner:
      workshop(b, W, H, PAL.woodDark, PAL.thatch, 'tan');
      break;
    case BT.Armorer:
      workshop(b, W, H, PAL.stoneDark, PAL.stone, 'armor');
      break;
    case BT.Market:
      b.box(W - 0.2, 0.05, H - 0.2, 0, 0, 0, PAL.sandDark);
      for (let i = 0; i < 3; i++) {
        const x = -W / 2 + 0.6 + i * 0.9;
        b.box(0.05, 0.9, 0.05, x - 0.3, 0.05, -0.2, PAL.woodDark);
        b.box(0.05, 0.9, 0.05, x + 0.3, 0.05, -0.2, PAL.woodDark);
        b.roof(0.8, 0.3, 1.0, x, 0.95, -0.2, i % 2 ? PAL.white : PAL.roof, i % 2 === 0);
        b.box(0.6, 0.25, 0.3, x, 0.05, -0.2, PAL.wood);
      }
      crate(b, -0.8, 1.0, 0.3);
      barrel(b, 0.8, 1.0, PAL.wood);
      break;
    case BT.Chapel:
      b.box(W - 0.3, 1.3, H - 0.4, 0, 0, 0, PAL.stone);
      b.roof(W, 0.8, H - 0.3, 0, 1.3, 0, PAL.roof, true);
      b.box(0.5, 0.9, 0.06, 0, 0, H / 2 - 0.18, PAL.woodDark);
      b.box(0.08, 0.5, 0.08, 0, 2.1, -0.5, PAL.gold);
      b.box(0.3, 0.08, 0.08, 0, 2.3, -0.5, PAL.gold);
      break;
    case BT.Church:
      b.box(W - 0.4, 1.8, H - 0.6, 0, 0, 0.2, PAL.stone);
      b.roof(W - 0.2, 1.0, H - 0.5, 0, 1.8, 0.2, PAL.roof, true);
      b.box(1.0, 3.0, 1.0, 0, 0, -H / 2 + 0.7, PAL.stoneDark);
      b.pyramid(0.8, 1.4, 0, 3.0, -H / 2 + 0.7, PAL.roof, true);
      b.box(0.08, 0.5, 0.08, 0, 4.4, -H / 2 + 0.7, PAL.gold);
      b.box(0.3, 0.08, 0.08, 0, 4.65, -H / 2 + 0.7, PAL.gold);
      b.box(0.7, 1.1, 0.06, 0, 0, H / 2 - 0.35, PAL.woodDark);
      break;
    case BT.Cathedral:
      b.box(W - 0.4, 2.4, H - 0.8, 0, 0, 0.3, PAL.stone);
      b.roof(W - 0.2, 1.3, H - 0.7, 0, 2.4, 0.3, PAL.roof, true);
      for (const sx of [-1, 1]) {
        b.box(0.9, 3.6, 0.9, sx * (W / 2 - 0.6), 0, -H / 2 + 0.7, PAL.stoneDark);
        b.pyramid(0.75, 1.6, sx * (W / 2 - 0.6), 3.6, -H / 2 + 0.7, PAL.roof, true);
      }
      b.box(0.9, 1.6, 0.08, 0, 0, H / 2 - 0.45, PAL.woodDark);
      b.box(0.1, 0.8, 0.1, 0, 3.8, 0.3, PAL.gold);
      b.box(0.5, 0.1, 0.1, 0, 4.2, 0.3, PAL.gold);
      break;
    case BT.Well:
      b.cyl(0.35, 0.38, 0.4, 7, 0, 0, 0, PAL.stoneDark);
      b.cyl(0.25, 0.25, 0.02, 7, 0, 0.4, 0, PAL.water);
      b.box(0.05, 0.6, 0.05, -0.3, 0.4, 0, PAL.woodDark);
      b.box(0.05, 0.6, 0.05, 0.3, 0.4, 0, PAL.woodDark);
      b.roof(0.9, 0.3, 0.7, 0, 1.0, 0, PAL.roof, true, Math.PI / 2);
      break;
    case BT.WaterPot:
      b.cyl(0.2, 0.28, 0.35, 6, 0, 0, 0, PAL.sandDark);
      b.cyl(0.18, 0.18, 0.02, 6, 0, 0.35, 0, PAL.water);
      break;
    case BT.Garden:
      b.box(W - 0.2, 0.1, H - 0.2, 0, 0, 0, PAL.oasisDark);
      for (const [x, z, c] of [[-0.4, -0.4, PAL.roof], [0.4, -0.4, PAL.gold], [-0.4, 0.4, PAL.white], [0.4, 0.4, PAL.roof]] as [number, number, number][]) {
        b.cone(0.18, 0.3, 5, x, 0.1, z, PAL.treeLight);
        b.box(0.1, 0.1, 0.1, x, 0.38, z, c, c === PAL.roof && x < 0);
      }
      break;
    case BT.Statue:
      b.box(1.4, 0.2, 1.4, 0, 0, 0, PAL.stoneDark);
      b.box(0.7, 0.6, 0.7, 0, 0.2, 0, PAL.stone);
      b.box(0.3, 0.8, 0.2, 0, 0.8, 0, PAL.stone);
      b.box(0.2, 0.2, 0.2, 0, 1.6, 0, PAL.stone);
      b.box(0.5, 0.06, 0.06, 0, 1.3, 0, PAL.gold, true);
      break;
    case BT.Maypole:
      b.cyl(0.3, 0.35, 0.1, 6, 0, 0, 0, PAL.oasis);
      b.cyl(0.06, 0.08, 2.0, 5, 0, 0.1, 0, PAL.woodDark);
      b.box(0.04, 1.0, 0.04, 0.3, 1.0, 0.0, PAL.roof, true);
      b.box(0.04, 1.0, 0.04, -0.3, 1.0, 0.0, PAL.gold);
      b.box(0.5, 0.15, 0.04, 0, 2.0, 0, PAL.treeLight);
      break;
    case BT.Gallows:
      b.box(1.6, 0.12, 1.6, 0, 0, 0, PAL.woodDark);
      b.box(0.1, 1.8, 0.1, -0.5, 0.12, 0, PAL.wood);
      b.box(1.0, 0.1, 0.1, -0.05, 1.8, 0, PAL.wood);
      b.box(0.03, 0.5, 0.03, 0.3, 1.3, 0, PAL.thatch);
      b.box(0.14, 0.14, 0.14, 0.3, 1.15, 0, PAL.sandDark);
      break;
    case BT.Stocks:
      b.box(0.9, 0.06, 1.6, 0, 0, 0, PAL.woodDark);
      b.box(0.1, 0.8, 0.1, 0, 0.06, -0.6, PAL.wood);
      b.box(0.1, 0.8, 0.1, 0, 0.06, 0.6, PAL.wood);
      b.box(0.15, 0.1, 1.4, 0, 0.5, 0, PAL.wood);
      break;
    case BT.Dungeon:
      b.box(W - 0.3, 1.0, H - 0.3, 0, 0, 0, PAL.stoneDark);
      merlons(b, W - 0.3, H - 0.3, 1.0, PAL.stoneDark);
      b.box(0.8, 0.7, 0.06, 0, 0, H / 2 - 0.16, PAL.black);
      b.box(0.5, 0.3, 0.06, -0.8, 0.5, H / 2 - 0.16, PAL.black);
      break;
    case BT.WallWood:
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          const x = -0.375 + i * 0.25;
          const z = -0.375 + j * 0.25;
          if ((i + j) % 2 === 0) {
            b.box(0.18, 1.2, 0.18, x, 0, z, PAL.wood);
            b.pyramid(0.14, 0.2, x, 1.2, z, PAL.woodDark);
          } else b.box(0.2, 1.0, 0.2, x, 0, z, PAL.woodDark);
        }
      b.box(1, 0.1, 1, 0, 0, 0, PAL.woodDark);
      break;
    case BT.WallLow:
      wallPiece(b, 1.3, PAL.stone, PAL.stoneDark);
      break;
    case BT.WallHigh:
      wallPiece(b, 2.2, PAL.stone, PAL.stoneDark);
      b.box(0.9, 0.05, 0.9, 0, 1.0, 0, PAL.stoneDark);
      break;
    case BT.TowerLookout:
      tower(b, 0.8, 2.8, 0, 0, PAL.stone, PAL.roof);
      b.box(0.3, 0.5, 0.06, 0, 0, 0.8, PAL.black);
      break;
    case BT.TowerGuard:
      b.box(W - 0.3, 3.4, H - 0.3, 0, 0, 0, PAL.stone);
      b.box(W, 0.2, H, 0, 3.4, 0, PAL.stoneDark);
      merlons(b, W, H, 3.6, PAL.stone, 0.5);
      b.box(0.5, 0.4, 0.06, 0, 2.4, H / 2 - 0.14, PAL.black);
      flag(b, 0, 3.6, 0, 1.0);
      break;
    case BT.TowerRound:
      b.cyl(1.7, 1.9, 4.2, 10, 0, 0, 0, PAL.stone);
      b.cyl(2.0, 2.0, 0.3, 10, 0, 4.2, 0, PAL.stoneDark);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.box(0.5, 0.3, 0.5, Math.cos(a) * 1.8, 4.5, Math.sin(a) * 1.8, PAL.stone);
      }
      b.box(0.6, 0.6, 0.06, 0, 2.4, 1.8, PAL.black);
      flag(b, 0, 4.5, 0, 1.2);
      break;
    case BT.GateWood:
      for (const sx of [-1, 1]) b.box(0.7, 2.6, H - 0.2, sx * (W / 2 - 0.35), 0, 0, PAL.woodDark);
      b.box(W, 0.6, H - 0.2, 0, 1.9, 0, PAL.wood);
      b.box(W - 1.4, 1.6, 0.1, 0, 0, 0, PAL.wood);
      merlons(b, W, H - 0.2, 2.5, PAL.woodDark);
      b.box(0.3, 0.1, 0.3, 0, 2.5, 0, PAL.roof, true);
      break;
    case BT.GateStone:
      for (const sx of [-1, 1]) {
        tower(b, 0.9, 3.4, sx * (W / 2 - 0.9), 0, PAL.stone, PAL.roof);
      }
      b.box(W - 1.6, 0.9, H - 0.4, 0, 2.5, 0, PAL.stone);
      b.box(W - 2.2, 2.0, 0.2, 0, 0, 0, PAL.woodDark);
      merlons(b, W - 1.6, H - 0.4, 3.4, PAL.stone);
      break;
    case BT.Drawbridge:
      b.box(W - 0.4, 0.15, H - 0.2, 0, 0.05, 0, PAL.wood);
      for (let i = 0; i < 5; i++) b.box(W - 0.4, 0.04, 0.04, 0, 0.2, -H / 2 + 0.3 + i * (H - 0.6) / 4, PAL.woodDark);
      b.box(0.06, 0.8, 0.06, -W / 2 + 0.3, 0.1, -H / 2 + 0.2, PAL.black);
      b.box(0.06, 0.8, 0.06, W / 2 - 0.3, 0.1, -H / 2 + 0.2, PAL.black);
      break;
    case BT.Stairs:
      for (let i = 0; i < 4; i++) b.box(1, 0.35 * (i + 1), 0.25, 0, 0, -0.375 + i * 0.25, PAL.stoneDark);
      break;
    case BT.Pit:
      b.box(0.9, 0.04, 0.9, 0, 0, 0, PAL.black);
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [0, 0.2]]) b.pyramid(0.07, 0.25, x, 0.04, z, PAL.stone);
      break;
    case BT.KillingPit:
      b.box(0.95, 0.04, 0.95, 0, 0, 0, PAL.black);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.pyramid(0.07, 0.3, -0.3 + i * 0.3, 0.04, -0.3 + j * 0.3, PAL.stone);
      b.box(0.95, 0.06, 0.05, 0, 0.05, 0, PAL.roof);
      break;
    case BT.PitchDitch:
      b.box(0.95, 0.05, 0.95, 0, 0, 0, PAL.pitch);
      b.box(0.5, 0.06, 0.5, 0.05, 0, -0.05, PAL.black);
      break;
    case BT.Cauldron:
      wallPiece(b, 1.4, PAL.stone, PAL.stoneDark);
      b.cyl(0.3, 0.22, 0.3, 7, 0, 1.55, 0, PAL.black);
      b.cyl(0.26, 0.26, 0.02, 7, 0, 1.84, 0, PAL.gold);
      break;
    case BT.Barracks:
      b.box(W - 0.4, 1.5, H - 0.4, 0, 0, 0, PAL.stone);
      b.box(W - 1.6, 0.9, H - 1.6, 0, 1.5, 0, PAL.stoneDark);
      merlons(b, W - 0.4, H - 0.4, 1.5, PAL.stone);
      b.roof(W - 1.6, 0.7, H - 1.6, 0, 2.4, 0, PAL.roof, true);
      b.box(1.0, 1.1, 0.06, 0, 0, H / 2 - 0.18, PAL.woodDark);
      b.box(0.1, 1.4, 0.1, -W / 2 + 0.3, 0, H / 2 - 0.3, PAL.woodDark);
      b.box(0.1, 1.4, 0.1, W / 2 - 0.3, 0, H / 2 - 0.3, PAL.woodDark);
      b.box(0.04, 0.4, 0.5, -W / 2 + 0.3, 1.0, H / 2 - 0.3, PAL.roof, true);
      break;
    case BT.MercPost:
      b.pyramid(1.7, 1.6, 0, 0, 0, PAL.sandDark);
      b.pyramid(1.2, 0.9, 0, 1.4, 0, PAL.roof, true);
      b.box(0.5, 0.9, 0.06, 0, 0, 1.15, PAL.black);
      b.box(0.04, 1.2, 0.04, 1.3, 0, 1.2, PAL.woodDark);
      b.box(0.04, 0.3, 0.4, 1.3, 0.9, 1.4, PAL.gold);
      break;
    case BT.Stable:
      hut(b, W - 0.6, H - 1.0, 0.8, PAL.wood, PAL.thatch, false);
      for (let i = 0; i < 4; i++) b.box(0.06, 0.5, 0.06, -W / 2 + 0.3 + i * 1.1, 0, H / 2 - 0.2, PAL.woodDark);
      b.box(W - 0.4, 0.06, 0.06, 0, 0.4, H / 2 - 0.2, PAL.woodDark);
      b.box(0.3, 0.3, 0.6, 1.0, 0.0, H / 2 - 0.6, PAL.woodDark);
      b.box(0.1, 0.1, 0.1, 1.0, 0.3, H / 2 - 0.3, PAL.woodDark);
      break;
    case BT.EngineerGuild:
      b.box(W - 0.6, 1.4, H - 0.6, 0, 0, 0, PAL.wood);
      b.roof(W - 0.4, 0.8, H - 0.5, 0, 1.4, 0, PAL.stoneDark, false);
      b.box(0.1, 2.2, 0.1, W / 2 - 0.3, 0, H / 2 - 0.3, PAL.woodDark);
      b.box(1.2, 0.1, 0.1, W / 2 - 0.9, 2.2, H / 2 - 0.3, PAL.woodDark);
      b.cyl(0.3, 0.3, 0.1, 8, -W / 2 + 0.5, 1.4, -H / 2 + 0.6, PAL.stoneDark);
      b.box(0.7, 0.9, 0.06, 0, 0, H / 2 - 0.3, PAL.black);
      flag(b, -W / 2 + 0.3, 1.4, H / 2 - 0.3, 0.9);
      break;
    default:
      b.box(W - 0.2, def.height * 0.6, H - 0.2, 0, 0, 0, PAL.stone);
  }
  return b.build();
}
