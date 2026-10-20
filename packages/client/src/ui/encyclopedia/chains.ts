/**
 * Wirtschaftsketten als Flussdiagramm. Der Graph entsteht automatisch aus `BUILDINGS[].prod`:
 * Knoten = Gebäude und Waren, Pfeile = Eingang → Gebäude → Ausgang → Lager. Layout und SVG sind reine Funktionen.
 */
import { BT, BUILDINGS, BuildingDef, RES_INFO, R, U, UNITS, t, tf } from '@strongpoly/shared';
import { POP_FACTORS, buildingIcon, popFactorIcon, resourceIcon, unitIcon } from '../icons';
import { linkBuilding, linkRes, linkUnit, producersOf, storeOfRes } from '../info/facts';

export type NodeKind = 'res' | 'bld' | 'unit' | 'item';

export interface ChainNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** SVG-Icon (volles <svg>) */
  icon: string;
  link?: string;
}

export interface ChainEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ChainGraph {
  id: string;
  nodes: ChainNode[];
  edges: ChainEdge[];
}

export const CHAIN_IDS = ['food', 'ale', 'woodstone', 'weapons', 'pitch', 'horses'] as const;
export type ChainId = (typeof CHAIN_IDS)[number];

/** Ausgangswaren je Kette (die Erzeuger und deren Eingänge werden automatisch gesucht) */
const CHAIN_SEEDS: Record<Exclude<ChainId, 'horses'>, number[]> = {
  food: [R.Apple, R.Cheese, R.Meat, R.Bread],
  ale: [R.Ale],
  woodstone: [R.Wood, R.Stone, R.Iron],
  weapons: [R.Bow, R.Crossbow, R.Spear, R.Pike, R.Mace, R.Sword, R.Leather, R.Armor],
  pitch: [R.Pitch],
};

const rid = (r: number): string => `r${r}`;
const bid = (b: number): string => `b${b}`;

class Builder {
  nodes = new Map<string, ChainNode>();
  edges: ChainEdge[] = [];
  private edgeKeys = new Set<string>();

  res(r: number): string {
    const id = rid(r);
    if (!this.nodes.has(id)) this.nodes.set(id, { id, kind: 'res', label: RES_INFO[r].name, icon: resourceIcon(r, 40), link: linkRes(r) });
    return id;
  }
  bld(b: number, kind: NodeKind = 'bld'): string {
    const id = bid(b);
    if (!this.nodes.has(id)) this.nodes.set(id, { id, kind, label: BUILDINGS[b].name, icon: buildingIcon(b, 40), link: linkBuilding(BUILDINGS[b]) });
    return id;
  }
  edge(from: string, to: string, label?: string): void {
    const k = `${from}>${to}`;
    if (this.edgeKeys.has(k)) return;
    this.edgeKeys.add(k);
    this.edges.push({ from, to, label });
  }
}

function addResource(g: Builder, r: number, seen: Set<number>): void {
  if (seen.has(r)) return;
  seen.add(r);
  g.res(r);
  for (const b of producersOf(r)) {
    const prod = b.prod!;
    const bn = g.bld(b.id);
    for (const rec of prod.recipes) {
      if (rec.out === r) {
        g.edge(bn, g.res(r), `${rec.outAmt} / ${rec.time} s`);
        for (const [inp, amt] of rec.in) {
          addResource(g, inp, seen);
          g.edge(g.res(inp), bn, `×${amt}`);
        }
      }
    }
  }
}

/** Ketten-Graph bauen. Für 'horses' entsteht ein handgesetzter kleiner Graph (Pferde sind keine Ware in RES_INFO). */
export function chainGraph(id: ChainId): ChainGraph {
  const g = new Builder();
  if (id === 'horses') {
    const stable = g.bld(BT.Stable);
    g.nodes.set('horse', { id: 'horse', kind: 'item', label: t('ui.horse'), icon: unitIcon(U.Knight, undefined, 40), link: linkUnit(UNITS[U.Knight]) });
    const barracks = g.bld(BT.Barracks);
    const knight = 'u' + U.Knight;
    g.nodes.set(knight, { id: knight, kind: 'unit', label: UNITS[U.Knight].name, icon: unitIcon(U.Knight, undefined, 40), link: linkUnit(UNITS[U.Knight]) });
    g.edge(stable, 'horse');
    g.edge('horse', barracks);
    g.edge(barracks, knight);
    // Schwert und Rüstung kommen aus der Waffenkammer
    g.res(R.Sword);
    g.res(R.Armor);
    g.edge(g.res(R.Sword), barracks);
    g.edge(g.res(R.Armor), barracks);
    return { id, nodes: [...g.nodes.values()], edges: g.edges };
  }
  const seen = new Set<number>();
  for (const r of CHAIN_SEEDS[id]) addResource(g, r, seen);
  // Nebenprodukte (z. B. Kuh vom Milchhof), wenn die Ware ohnehin im Graphen ist
  for (const b of BUILDINGS) {
    for (const rec of b.prod?.recipes ?? []) {
      if (rec.extra && g.nodes.has(bid(b.id)) && g.nodes.has(rid(rec.extra.res))) g.edge(bid(b.id), rid(rec.extra.res), `1 / ${rec.extra.every}×`);
    }
  }
  // Lieferziele: Endprodukte (nicht weiterverarbeitet) gehen ins Lager, den Kornspeicher oder die Waffenkammer
  const resNodes = [...g.nodes.values()].filter((n) => n.kind === 'res');
  for (const n of resNodes) {
    const consumed = g.edges.some((e) => e.from === n.id && e.to.startsWith('b'));
    if (consumed) continue;
    g.edge(n.id, g.bld(storeOfRes(Number(n.id.slice(1))).id));
  }
  // Letzte Stufe je Kette
  const last = (kind: string): void => {
    if (kind === 'ale') {
      const inn = g.bld(BT.Inn);
      g.edge(g.bld(BT.Stockpile), inn);
      g.nodes.set('pop-ale', { id: 'pop-ale', kind: 'item', label: POP_FACTORS.ale.name, icon: popFactorIcon('ale', 40), link: 'popularity' });
      g.edge(inn, 'pop-ale');
    } else if (kind === 'food') {
      g.nodes.set('pop-ration', { id: 'pop-ration', kind: 'item', label: POP_FACTORS.ration.name, icon: popFactorIcon('ration', 40), link: 'popularity' });
      g.edge(g.bld(BT.Granary), 'pop-ration');
    } else if (kind === 'weapons') {
      const barracks = g.bld(BT.Barracks);
      g.edge(g.bld(BT.Armory), barracks);
    } else if (kind === 'pitch') {
      g.edge(g.bld(BT.Stockpile), g.bld(BT.Cauldron));
      g.edge(g.bld(BT.Stockpile), g.bld(BT.PitchDitch));
    }
  };
  last(id);
  return { id, nodes: [...g.nodes.values()], edges: g.edges };
}

/** Kleiner Graph um ein einzelnes Produktionsgebäude: Eingänge → Gebäude → Ausgänge → Lager (und Ochsengespann). */
export function buildingGraph(def: BuildingDef): ChainGraph | null {
  if (!def.prod) return null;
  const g = new Builder();
  const me = g.bld(def.id);
  for (const rec of def.prod.recipes) {
    for (const [inp, amt] of rec.in) g.edge(g.res(inp), me, `×${amt}`);
    const out = g.res(rec.out);
    g.edge(me, out, `${rec.outAmt} / ${rec.time} s`);
    g.edge(out, g.bld(storeOfRes(rec.out).id));
    if (rec.extra) {
      const ex = g.res(rec.extra.res);
      g.edge(me, ex, `1 / ${rec.extra.every}×`);
      g.edge(ex, g.bld(storeOfRes(rec.extra.res).id));
    }
  }
  if (def.prod.haul === 'ox') g.edge(g.bld(BT.OxTether), me);
  // Eingangswaren stammen aus dem Lager: zeige die Erzeuger dahinter nicht, sondern das Lager als Quelle
  return { id: 'b' + def.key, nodes: [...g.nodes.values()], edges: g.edges };
}

// ---------- Layout ----------

export const NODE_W = 108;
export const NODE_H = 72;
export const COL_GAP = 54;
export const ROW_GAP = 14;
export const PAD = 14;

export interface PlacedNode extends ChainNode {
  x: number;
  y: number;
  col: number;
}
export interface ChainLayout {
  id: string;
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: (ChainEdge & { x1: number; y1: number; x2: number; y2: number })[];
}

/** Geschichtetes Layout von links nach rechts. Rang = längster Weg von einer Quelle. */
export function layoutChain(graph: ChainGraph): ChainLayout {
  const ids = graph.nodes.map((n) => n.id);
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const e of graph.edges) {
    incoming.get(e.to)?.push(e.from);
    outgoing.get(e.from)?.push(e.to);
  }
  const rank = new Map<string, number>();
  // einfache Relaxation (Graph ist ein DAG; die Iterationszahl begrenzt Zyklen)
  for (const id of ids) rank.set(id, 0);
  for (let it = 0; it < ids.length + 1; it++) {
    let changed = false;
    for (const e of graph.edges) {
      const r = (rank.get(e.from) ?? 0) + 1;
      if (r > (rank.get(e.to) ?? 0) && r <= ids.length) {
        rank.set(e.to, r);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Quellen und Zwischenstufen so spät wie möglich setzen: kurze Ketten rücken an ihr Ziel, es gibt weniger lange Pfeile
  const byRankDesc = [...ids].sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0));
  for (const id of byRankDesc) {
    const outs = outgoing.get(id) ?? [];
    if (!outs.length) continue;
    const latest = Math.min(...outs.map((o) => rank.get(o) ?? 0)) - 1;
    if (latest > (rank.get(id) ?? 0)) rank.set(id, latest);
  }
  const cols: string[][] = [];
  for (const id of ids) {
    const r = rank.get(id) ?? 0;
    (cols[r] ??= []).push(id);
  }
  for (let i = 0; i < cols.length; i++) cols[i] ??= [];
  // Reihenfolge innerhalb der Spalte nach Mittelwert der Vorgänger-Positionen (zwei Durchläufe)
  const pos = new Map<string, number>();
  cols.forEach((c) => c.forEach((id, i) => pos.set(id, i)));
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 1; c < cols.length; c++) {
      const bary = (id: string): number => {
        const ps = (incoming.get(id) ?? []).map((p) => pos.get(p) ?? 0);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : (pos.get(id) ?? 0);
      };
      cols[c].sort((a, b) => bary(a) - bary(b) || (pos.get(a) ?? 0) - (pos.get(b) ?? 0));
      cols[c].forEach((id, i) => pos.set(id, i));
    }
    for (let c = cols.length - 2; c >= 0; c--) {
      const bary = (id: string): number => {
        const ps = (outgoing.get(id) ?? []).map((p) => pos.get(p) ?? 0);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : (pos.get(id) ?? 0);
      };
      cols[c].sort((a, b) => bary(a) - bary(b) || (pos.get(a) ?? 0) - (pos.get(b) ?? 0));
      cols[c].forEach((id, i) => pos.set(id, i));
    }
  }
  const maxRows = Math.max(1, ...cols.map((c) => c.length));
  const height = PAD * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const width = PAD * 2 + cols.length * NODE_W + (cols.length - 1) * COL_GAP;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const placed = new Map<string, PlacedNode>();
  cols.forEach((c, ci) => {
    const colH = c.length * NODE_H + (c.length - 1) * ROW_GAP;
    const y0 = PAD + (height - PAD * 2 - colH) / 2;
    c.forEach((id, i) => {
      const n = byId.get(id)!;
      placed.set(id, { ...n, col: ci, x: PAD + ci * (NODE_W + COL_GAP), y: y0 + i * (NODE_H + ROW_GAP) });
    });
  });
  const edges = graph.edges.map((e) => {
    const a = placed.get(e.from)!;
    const b = placed.get(e.to)!;
    return { ...e, x1: a.x + NODE_W, y1: a.y + NODE_H / 2, x2: b.x, y2: b.y + NODE_H / 2 };
  });
  return { id: graph.id, width, height, nodes: [...placed.values()], edges };
}

// ---------- SVG ----------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Beschriftung auf höchstens zwei Zeilen verteilen */
export function wrapLabel(label: string, max = 15): string[] {
  if (label.length <= max) return [label];
  const words = label.split(' ');
  const lines: string[] = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= max) lines[lines.length - 1] = cur + ' ' + w;
    else lines.push(w);
  }
  if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(' '));
  return lines.map((l) => (l.length > max + 4 ? l.slice(0, max + 3) + '…' : l));
}

const FILL: Record<NodeKind, string> = { res: '#2f3b2a', bld: '#4a3826', unit: '#3b3340', item: '#3a3a2a' };
const STROKE: Record<NodeKind, string> = { res: '#7fa05a', bld: '#c49a5a', unit: '#9a85b5', item: '#c8b860' };

export function chainSvg(layout: ChainLayout): string {
  const { width, height } = layout;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="chain-svg" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}" width="${Math.ceil(width)}" height="${Math.ceil(height)}" role="img">`;
  s += `<defs><marker id="arr-${esc(layout.id)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L10 5 L0 9 z" fill="#e3c98a"/></marker></defs>`;
  // Pfeile zuerst (unter den Knoten)
  for (const e of layout.edges) {
    const dx = Math.max(24, (e.x2 - e.x1) * 0.5);
    const d = `M${e.x1} ${e.y1} C${e.x1 + dx} ${e.y1} ${e.x2 - dx} ${e.y2} ${e.x2 - 2} ${e.y2}`;
    s += `<path d="${d}" fill="none" stroke="#e3c98a" stroke-width="2" stroke-linecap="round" opacity="0.85" marker-end="url(#arr-${esc(layout.id)})"/>`;
  }
  for (const e of layout.edges) {
    if (!e.label) continue;
    const mx = (e.x1 + e.x2) / 2;
    const my = (e.y1 + e.y2) / 2 - 4;
    s += `<text x="${mx}" y="${my}" text-anchor="middle" font-size="11" fill="#f2ede0" stroke="#17110c" stroke-width="3" paint-order="stroke" font-family="Segoe UI, system-ui, sans-serif">${esc(e.label)}</text>`;
  }
  for (const n of layout.nodes) {
    const lines = wrapLabel(n.label);
    const attrs = n.link ? ` data-link="${esc(n.link)}" style="cursor:pointer"` : '';
    s += `<g class="chain-node"${attrs}><title>${esc(n.label)}</title>`;
    s += `<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="7" fill="${FILL[n.kind]}" stroke="${STROKE[n.kind]}" stroke-width="${n.kind === 'bld' ? 2 : 1.5}"/>`;
    s += `<g transform="translate(${n.x + NODE_W / 2 - 20} ${n.y + 4})">${n.icon}</g>`;
    lines.forEach((ln, i) => {
      s += `<text x="${n.x + NODE_W / 2}" y="${n.y + 54 + i * 12}" text-anchor="middle" font-size="12" font-weight="600" fill="#f2ede0" font-family="Segoe UI, system-ui, sans-serif">${esc(ln)}</text>`;
    });
    s += `</g>`;
  }
  s += '</svg>';
  return s;
}

/** Beschreibung der Kette in Gebäuden (für Seitenlisten) */
export function chainBuildings(graph: ChainGraph): number[] {
  return graph.nodes.filter((n) => n.id.startsWith('b')).map((n) => Number(n.id.slice(1)));
}

export function chainTitle(id: ChainId): string {
  return t(`enc.chain.${id}.title`);
}

export function chainIntro(id: ChainId): string {
  return tf(`enc.chain.${id}.intro`);
}
