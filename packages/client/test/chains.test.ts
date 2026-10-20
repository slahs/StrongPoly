import { describe, expect, it } from 'vitest';
import { BT, BUILDINGS, R, U } from '@strongpoly/shared';
import { CHAIN_IDS, ChainGraph, NODE_H, NODE_W, buildingGraph, chainGraph, chainSvg, layoutChain, wrapLabel } from '../src/ui/encyclopedia/chains';

const has = (g: ChainGraph, from: string, to: string): boolean => g.edges.some((e) => e.from === from && e.to === to);

describe('Wirtschaftsketten-Graphen (aus BUILDINGS[].prod erzeugt)', () => {
  it('Nahrung: Weizen → Mühle → Mehl → Bäckerei → Brot → Kornspeicher', () => {
    const g = chainGraph('food');
    expect(has(g, `r${R.Wheat}`, `b${BT.Mill}`)).toBe(true);
    expect(has(g, `b${BT.Mill}`, `r${R.Flour}`)).toBe(true);
    expect(has(g, `r${R.Flour}`, `b${BT.Bakery}`)).toBe(true);
    expect(has(g, `b${BT.Bakery}`, `r${R.Bread}`)).toBe(true);
    expect(has(g, `r${R.Bread}`, `b${BT.Granary}`)).toBe(true);
    expect(has(g, `b${BT.WheatFarm}`, `r${R.Wheat}`)).toBe(true);
    // alle vier Nahrungssorten landen im Kornspeicher
    for (const r of [R.Apple, R.Cheese, R.Meat, R.Bread]) expect(has(g, `r${r}`, `b${BT.Granary}`)).toBe(true);
    // Weizen und Mehl sind Zwischenprodukte und gehen direkt in die Weiterverarbeitung
    expect(has(g, `r${R.Wheat}`, `b${BT.Stockpile}`)).toBe(false);
  });

  it('Bier: Hopfenfarm → Hopfen → Brauerei → Bier → Lager → Schenke', () => {
    const g = chainGraph('ale');
    expect(has(g, `b${BT.HopFarm}`, `r${R.Hops}`)).toBe(true);
    expect(has(g, `r${R.Hops}`, `b${BT.Brewery}`)).toBe(true);
    expect(has(g, `b${BT.Brewery}`, `r${R.Ale}`)).toBe(true);
    expect(has(g, `r${R.Ale}`, `b${BT.Stockpile}`)).toBe(true);
    expect(has(g, `b${BT.Stockpile}`, `b${BT.Inn}`)).toBe(true);
  });

  it('Holz/Stein/Eisen, Waffen, Pech und Pferde', () => {
    const w = chainGraph('woodstone');
    for (const b of [BT.Woodcutter, BT.Quarry, BT.IronMine]) expect(w.nodes.some((n) => n.id === `b${b}`)).toBe(true);
    expect(has(w, `r${R.Stone}`, `b${BT.Stockpile}`)).toBe(true);
    const wp = chainGraph('weapons');
    for (const b of [BT.Fletcher, BT.Poleturner, BT.Blacksmith, BT.Tanner, BT.Armorer]) expect(wp.nodes.some((n) => n.id === `b${b}`)).toBe(true);
    expect(has(wp, `r${R.Iron}`, `b${BT.Blacksmith}`)).toBe(true);
    expect(has(wp, `r${R.Sword}`, `b${BT.Armory}`)).toBe(true);
    expect(has(wp, `b${BT.Armory}`, `b${BT.Barracks}`)).toBe(true);
    const p = chainGraph('pitch');
    expect(has(p, `b${BT.PitchRig}`, `r${R.Pitch}`)).toBe(true);
    expect(has(p, `b${BT.Stockpile}`, `b${BT.Cauldron}`)).toBe(true);
    const h = chainGraph('horses');
    expect(has(h, `b${BT.Stable}`, 'horse')).toBe(true);
    expect(has(h, `b${BT.Barracks}`, `u${U.Knight}`)).toBe(true);
  });

  it('Kanten verweisen nur auf vorhandene Knoten, Knoten sind eindeutig', () => {
    for (const id of CHAIN_IDS) {
      const g = chainGraph(id);
      const ids = new Set(g.nodes.map((n) => n.id));
      expect(ids.size, id).toBe(g.nodes.length);
      for (const e of g.edges) {
        expect(ids.has(e.from), `${id}: ${e.from}`).toBe(true);
        expect(ids.has(e.to), `${id}: ${e.to}`).toBe(true);
      }
      for (const n of g.nodes) expect(n.icon, n.id).toContain('<svg');
    }
  });

  it('jedes Produktionsgebäude hat einen Einzelgraphen mit Eingängen und Ausgängen', () => {
    for (const b of BUILDINGS) {
      const g = buildingGraph(b);
      if (!b.prod) {
        expect(g).toBeNull();
        continue;
      }
      expect(g, b.key).not.toBeNull();
      expect(g!.nodes.some((n) => n.id === `b${b.id}`)).toBe(true);
      for (const rec of b.prod.recipes) {
        expect(has(g!, `b${b.id}`, `r${rec.out}`), `${b.key} → ${rec.name}`).toBe(true);
        for (const [inp] of rec.in) expect(has(g!, `r${inp}`, `b${b.id}`)).toBe(true);
      }
    }
  });
});

describe('Layout und SVG', () => {
  it('Spalten wachsen entlang der Pfeile, nichts überlappt, alle Koordinaten sind endlich', () => {
    for (const id of CHAIN_IDS) {
      const g = chainGraph(id);
      const l = layoutChain(g);
      expect(l.width).toBeGreaterThan(0);
      expect(l.height).toBeGreaterThan(0);
      const col = new Map(l.nodes.map((n) => [n.id, n.col]));
      for (const e of g.edges) expect(col.get(e.to)!, `${id}: ${e.from}→${e.to}`).toBeGreaterThan(col.get(e.from)!);
      for (const n of l.nodes) {
        for (const v of [n.x, n.y]) expect(Number.isFinite(v)).toBe(true);
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + NODE_W).toBeLessThanOrEqual(l.width);
        expect(n.y + NODE_H).toBeLessThanOrEqual(l.height);
      }
      for (let i = 0; i < l.nodes.length; i++) {
        for (let j = i + 1; j < l.nodes.length; j++) {
          const a = l.nodes[i];
          const b = l.nodes[j];
          const overlap = a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + NODE_H && b.y < a.y + NODE_H;
          expect(overlap, `${id}: ${a.id} und ${b.id} überlappen`).toBe(false);
        }
      }
      for (const e of l.edges) for (const v of [e.x1, e.y1, e.x2, e.y2]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('SVG enthält jeden Knoten mit Namen und jede Kante als Pfad', () => {
    const g = chainGraph('food');
    const l = layoutChain(g);
    const svg = chainSvg(l);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(svg.match(/marker-end=/g)!.length).toBe(g.edges.length);
    for (const n of g.nodes) expect(svg).toContain(`<title>${n.label}</title>`);
    for (const name of ['Weizen', 'Mühle', 'Mehl', 'Bäckerei', 'Brot', 'Kornspeicher']) expect(svg).toContain(name);
    // Knoten mit Link sind anklickbar
    expect(svg).toContain('data-link="building/mill"');
    expect(svg).toContain('data-link="resource/wheat"');
  });

  it('lange Beschriftungen werden auf höchstens zwei Zeilen verteilt', () => {
    expect(wrapLabel('Mühle')).toEqual(['Mühle']);
    expect(wrapLabel('Niedrige Steinmauer').length).toBeLessThanOrEqual(2);
    expect(wrapLabel('Berittener Bogenschütze im Steppenwind').length).toBeLessThanOrEqual(2);
  });
});
