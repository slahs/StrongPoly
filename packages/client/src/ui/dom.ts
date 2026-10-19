type Attrs = {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  title?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  onclick?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  onchange?: (e: Event) => void;
  type?: string;
  value?: string;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  draggable?: boolean;
  data?: Record<string, string>;
  [k: string]: unknown;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v as string;
    else if (k === 'text') el.textContent = v as string;
    else if (k === 'html') el.innerHTML = v as string;
    else if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else Object.assign(el.style, v);
    } else if (k === 'data') Object.assign(el.dataset, v as Record<string, string>);
    else if (k.startsWith('on')) (el as unknown as Record<string, unknown>)[k] = v;
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function fmtCost(c: { gold?: number; wood?: number; stone?: number; iron?: number; pitch?: number }): string {
  const parts: string[] = [];
  if (c.gold) parts.push(`${c.gold} Gold`);
  if (c.wood) parts.push(`${c.wood} Holz`);
  if (c.stone) parts.push(`${c.stone} Stein`);
  if (c.iron) parts.push(`${c.iron} Eisen`);
  if (c.pitch) parts.push(`${c.pitch} Pech`);
  return parts.join(', ') || 'kostenlos';
}
