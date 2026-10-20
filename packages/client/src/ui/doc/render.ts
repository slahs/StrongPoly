/**
 * DOM-Darstellung der neutralen Inhalts-Bausteine (ui/doc/blocks.ts). Dünne Schicht ohne eigene Logik.
 */
import { h } from '../dom';
import { iconEl } from '../icons';
import type { Block, Doc, Inline, Rich } from './blocks';
import './doc.css';

export interface RenderOpts {
  /** kleiner Tooltip-Stil */
  compact?: boolean;
  /** Klick auf einen Link (Enzyklopädie-Seiten-ID) */
  onLink?: (id: string) => void;
}

function svgNode(svg: string): Node {
  return iconEl(svg);
}

export function renderInline(i: Inline, o: RenderOpts): Node {
  if (typeof i === 'string') return document.createTextNode(i);
  if ('br' in i) return document.createElement('br');
  if ('link' in i) {
    const a = h('a', { class: 'doc-link', href: '#', title: i.text });
    if (i.icon) a.append(h('span', { class: 'doc-ic' }, svgNode(i.icon)));
    a.append(document.createTextNode(i.text));
    a.onclick = (e) => {
      e.preventDefault();
      o.onLink?.(i.link);
    };
    return a;
  }
  if ('icon' in i) {
    const s = h('span', { class: 'doc-chip' + (i.cls ? ' ' + i.cls : ''), title: i.title ?? '' });
    s.append(h('span', { class: 'doc-ic' }, svgNode(i.icon)));
    if (i.text) s.append(document.createTextNode(i.text));
    return s;
  }
  const s = h('span', { class: (i.bold ? 'b ' : '') + (i.cls ?? ''), title: i.title ?? '' });
  s.textContent = i.text;
  return s;
}

export function renderRich(r: Rich, o: RenderOpts): HTMLElement {
  const el = h('span', { class: 'doc-rich' });
  for (const i of r) el.append(renderInline(i, o));
  return el;
}

/** Farbstufe der Schadensmatrix: grün (hoch) bis rot (niedrig) – aber Wirkung gegen Gegner: hoher Wert = viel Schaden */
export function matrixColor(v: number): string {
  // 0 → dunkelrot, 1 → neutral gelb-grün, >1 → grün
  const clamp = Math.max(0, Math.min(1.5, v));
  const hue = Math.round((clamp / 1.5) * 120);
  const light = 22 + Math.round(Math.min(1, clamp / 1.2) * 12);
  return `hsl(${hue} 55% ${light}%)`;
}

export function renderBlock(b: Block, o: RenderOpts): HTMLElement {
  switch (b.k) {
    case 'h':
      return h(b.level === 3 ? 'h4' : 'h3', { class: 'doc-h' }, b.icon ? h('span', { class: 'doc-ic' }, svgNode(b.icon)) : null, b.text);
    case 'p':
      return h('p', { class: 'doc-p', text: b.text });
    case 'rich':
      return h('div', { class: 'doc-rich-block' }, renderRich(b.parts, o));
    case 'kv': {
      const el = h('div', { class: 'doc-kv' });
      for (const r of b.rows) {
        el.append(h('div', { class: 'k', text: r.label }), h('div', { class: 'v' }, renderRich(r.value, o)));
      }
      return el;
    }
    case 'list': {
      const ul = h('ul', { class: 'doc-list' });
      for (const it of b.items) ul.append(h('li', {}, renderRich(it, o)));
      return ul;
    }
    case 'tip':
      return h('div', { class: 'doc-tip' }, h('b', { text: (b.label ?? '') + ' ' }), b.text);
    case 'rule':
      return h('div', { class: 'doc-rule tone-' + (b.tone ?? 'info'), text: b.text });
    case 'table': {
      const tb = h('table', { class: 'doc-table' });
      const hr = h('tr', {});
      for (const c of b.head) hr.append(h('th', {}, renderRich(c, o)));
      tb.append(h('thead', {}, hr));
      const body = h('tbody', {});
      for (const row of b.rows) {
        const tr = h('tr', {});
        for (const c of row) tr.append(h('td', {}, renderRich(c, o)));
        body.append(tr);
      }
      tb.append(body);
      return h('div', { class: 'doc-table-wrap' }, tb);
    }
    case 'matrix': {
      const tb = h('table', { class: 'doc-matrix' });
      const hr = h('tr', {}, h('th', { text: b.corner }));
      for (const c of b.cols) {
        const th = h('th', { title: c.title ?? c.label });
        if (c.icon) th.append(h('span', { class: 'doc-ic' }, svgNode(c.icon)));
        th.append(h('div', { class: 'ml', text: c.label }));
        hr.append(th);
      }
      tb.append(h('thead', {}, hr));
      const body = h('tbody', {});
      for (const r of b.rows) {
        const th = h('th', { class: 'rowh', title: r.title ?? r.label });
        if (r.icon) th.append(h('span', { class: 'doc-ic' }, svgNode(r.icon)));
        th.append(document.createTextNode(r.label));
        const tr = h('tr', {}, th);
        for (const c of r.cells) {
          const td = h('td', { text: c.text, title: c.title ?? '' });
          td.style.background = matrixColor(c.value);
          tr.append(td);
        }
        body.append(tr);
      }
      tb.append(body);
      return h('div', { class: 'doc-table-wrap' }, tb);
    }
    case 'svg': {
      const box = h('div', { class: 'doc-svg' });
      box.innerHTML = b.svg;
      box.addEventListener('click', (e) => {
        const g = (e.target as Element).closest('[data-link]');
        if (g) o.onLink?.(g.getAttribute('data-link') ?? '');
      });
      if (b.caption) box.append(h('div', { class: 'cap', text: b.caption }));
      return box;
    }
    case 'chips': {
      const box = h('div', { class: 'doc-chips' });
      for (const c of b.items) {
        const a = h('a', { class: 'doc-chipbtn', href: '#', title: c.label });
        if (c.icon) a.append(h('span', { class: 'doc-ic' }, svgNode(c.icon)));
        a.append(h('span', { text: c.label }));
        a.onclick = (e) => {
          e.preventDefault();
          o.onLink?.(c.link);
        };
        box.append(a);
      }
      return box;
    }
  }
}

export function renderBlocks(blocks: Block[], o: RenderOpts = {}): HTMLElement {
  const box = h('div', { class: 'doc-body' });
  for (const b of blocks) box.append(renderBlock(b, o));
  return box;
}

/** Vollständiges Dokument mit Kopf (Icon, Titel, Untertitel) */
export function renderDoc(d: Doc, o: RenderOpts = {}): HTMLElement {
  const head = h('div', { class: 'doc-head' });
  if (d.icon) head.append(h('div', { class: 'doc-headicon' }, svgNode(d.icon)));
  head.append(h('div', { class: 'doc-headtext' }, h('div', { class: 'doc-title', text: d.title }), d.subtitle ? h('div', { class: 'doc-sub', text: d.subtitle }) : null));
  return h('div', { class: 'doc' + (o.compact ? ' compact' : '') }, head, renderBlocks(d.blocks, o));
}
