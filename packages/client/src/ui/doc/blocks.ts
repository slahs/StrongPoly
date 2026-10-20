/**
 * Neutrale Beschreibung von Tooltip- und Enzyklopädie-Inhalten (reine Datenstruktur, kein DOM).
 * Die Builder in ui/tooltips und ui/encyclopedia liefern `Doc`; ui/doc/render.ts macht daraus DOM.
 * So lässt sich der Inhalt ohne Browser testen (`docText`).
 */

/** Inline-Element: Text, Icon mit Text oder Link auf eine Enzyklopädie-Seite */
export type Inline =
  | string
  | { icon: string; text?: string; cls?: string; title?: string }
  | { text: string; cls?: string; bold?: boolean; title?: string }
  | { link: string; text: string; icon?: string }
  /** Zeilenumbruch */
  | { br: true };

export type Rich = Inline[];

export interface MatrixCol {
  label: string;
  icon?: string;
  title?: string;
}
export interface MatrixCell {
  text: string;
  /** Multiplikator (für die Farbcodierung) */
  value: number;
  title?: string;
}
export interface MatrixRow {
  label: string;
  icon?: string;
  title?: string;
  cells: MatrixCell[];
}

export type Block =
  | { k: 'h'; text: string; level?: 2 | 3; icon?: string }
  | { k: 'p'; text: string }
  | { k: 'rich'; parts: Rich }
  | { k: 'kv'; rows: { label: string; value: Rich }[] }
  | { k: 'list'; items: Rich[] }
  | { k: 'tip'; text: string; label?: string }
  | { k: 'rule'; text: string; tone?: 'info' | 'warn' }
  | { k: 'table'; head: Rich[]; rows: Rich[][] }
  | { k: 'matrix'; corner: string; cols: MatrixCol[]; rows: MatrixRow[] }
  | { k: 'svg'; svg: string; caption?: string }
  | { k: 'chips'; items: { label: string; icon?: string; link: string }[] };

export interface Doc {
  title: string;
  icon?: string;
  subtitle?: string;
  blocks: Block[];
}

export function inlineText(i: Inline): string {
  if (typeof i === 'string') return i;
  if ('br' in i) return ' ';
  if ('link' in i) return i.text + ' ';
  // Icon-Chips: der Titel nennt Menge und Namen („15 Gold“), sonst der sichtbare Text
  if ('icon' in i) return (i.title || i.text || '') + ' ';
  return i.text ?? '';
}

export function richText(r: Rich): string {
  return r.map(inlineText).join('').replace(/\s+/g, ' ').trim();
}

/** Alle sichtbaren Texte eines Blocks, durch Zeilenumbrüche getrennt (für Tests und Suche). */
export function blockText(b: Block): string {
  switch (b.k) {
    case 'h':
    case 'p':
    case 'tip':
    case 'rule':
      return b.text;
    case 'rich':
      return richText(b.parts);
    case 'kv':
      return b.rows.map((r) => `${r.label}: ${richText(r.value)}`).join('\n');
    case 'list':
      return b.items.map(richText).join('\n');
    case 'table':
      return [b.head.map(richText).join(' | '), ...b.rows.map((r) => r.map(richText).join(' | '))].join('\n');
    case 'matrix':
      return [b.corner + ' | ' + b.cols.map((c) => c.label).join(' | '), ...b.rows.map((r) => r.label + ' | ' + r.cells.map((c) => c.text).join(' | '))].join('\n');
    case 'svg':
      return b.caption ?? '';
    case 'chips':
      return b.items.map((c) => c.label).join(', ');
  }
}

export function docText(d: Doc): string {
  return [d.title, d.subtitle ?? '', ...d.blocks.map(blockText)].filter((s) => s !== '').join('\n');
}

/** Alle SVG-Strings und Icons eines Dokuments (für Gültigkeitsprüfungen) */
export function docSvgs(d: Doc): string[] {
  const out: string[] = [];
  if (d.icon) out.push(d.icon);
  const rich = (r: Rich) => {
    for (const i of r) if (typeof i !== 'string' && 'icon' in i && i.icon) out.push(i.icon);
  };
  for (const b of d.blocks) {
    if (b.k === 'svg') out.push(b.svg);
    else if (b.k === 'h' && b.icon) out.push(b.icon);
    else if (b.k === 'rich') rich(b.parts);
    else if (b.k === 'kv') b.rows.forEach((r) => rich(r.value));
    else if (b.k === 'list') b.items.forEach(rich);
    else if (b.k === 'table') {
      b.head.forEach(rich);
      b.rows.forEach((r) => r.forEach(rich));
    } else if (b.k === 'matrix') {
      b.cols.forEach((c) => c.icon && out.push(c.icon));
      b.rows.forEach((r) => r.icon && out.push(r.icon));
    } else if (b.k === 'chips') b.items.forEach((c) => c.icon && out.push(c.icon));
  }
  return out;
}

/** Alle Link-Ziele eines Dokuments */
export function docLinks(d: Doc): string[] {
  const out: string[] = [];
  const rich = (r: Rich) => {
    for (const i of r) if (typeof i !== 'string' && 'link' in i) out.push(i.link);
  };
  for (const b of d.blocks) {
    if (b.k === 'rich') rich(b.parts);
    else if (b.k === 'kv') b.rows.forEach((r) => rich(r.value));
    else if (b.k === 'list') b.items.forEach(rich);
    else if (b.k === 'table') {
      b.head.forEach(rich);
      b.rows.forEach((r) => r.forEach(rich));
    } else if (b.k === 'chips') b.items.forEach((c) => out.push(c.link));
  }
  return out;
}
