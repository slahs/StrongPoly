/** Icon-Galerie (Aufruf mit ?icons): Raster aller Icons, 32/64 px, Spielerfarbe für Einheiten. */
import { PLAYER_COLORS, PLAYER_COLOR_NAMES } from '@strongpoly/shared';
import { clear, h, hex } from '../dom';
import { galleryItems, iconCoverage } from './index';

const CSS = `
.sp-gallery { position: fixed; inset: 0; overflow: auto; background: var(--gal-bg, #4a4236); color: #f2ede0; font: 13px 'Segoe UI', system-ui, sans-serif; padding: 12px 16px 40px; user-select: text; pointer-events: auto; }
.sp-gallery.light { --gal-bg: #d9cfb6; color: #24211e; }
.sp-gallery header { position: sticky; top: -12px; z-index: 2; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; padding: 8px 10px; margin: -12px -16px 10px; background: #2b241bf2; color: #f2ede0; border-bottom: 2px solid #7d5a30; }
.sp-gallery h1 { font-size: 16px; margin: 0 10px 0 0; }
.sp-gallery h2 { font-size: 15px; margin: 18px 0 8px; border-bottom: 1px solid #0006; padding-bottom: 3px; }
.sp-gallery .grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(var(--cell, 120px), 1fr)); }
.sp-gallery .cell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px 6px; background: #0002; border: 1px solid #0003; border-radius: 4px; text-align: center; }
.sp-gallery .cell .nm { font-size: 12px; font-weight: 600; line-height: 1.2; }
.sp-gallery .cell .ky { font-size: 10px; opacity: 0.7; word-break: break-all; }
.sp-gallery .sw { display: inline-block; width: 18px; height: 18px; border: 2px solid #0008; border-radius: 3px; cursor: pointer; vertical-align: middle; }
.sp-gallery .sw.on { outline: 2px solid #fff; }
.sp-gallery button { margin-right: 4px; }
.sp-gallery button.on { border-color: var(--gold); background: linear-gradient(#a97c25, #7a5818); }
.sp-gallery .cov { font-size: 12px; }
.sp-gallery .cov.bad { color: #ff8a80; font-weight: 700; }
.sp-icon { display: block; flex: none; }
`;

export function showGallery(root: HTMLElement = document.getElementById('ui') ?? document.body): void {
  document.getElementById('view')?.remove();
  if (!document.getElementById('sp-gallery-css')) {
    const st = document.createElement('style');
    st.id = 'sp-gallery-css';
    st.textContent = CSS;
    document.head.append(st);
  }
  root.style.pointerEvents = 'auto';
  let size = Number(new URLSearchParams(location.search).get('size')) || 64;
  let team = 0;
  let filter = '';
  let light = false;
  const wrap = h('div', { class: 'sp-gallery' });
  root.append(wrap);

  const render = (): void => {
    clear(wrap);
    const cov = iconCoverage();
    const missing = Object.entries(cov).flatMap(([k, v]) => v.map((x: string) => `${k}: ${x}`));
    const sizeBtn = (s: number): HTMLElement => h('button', { class: size === s ? 'on' : '', text: `${s} px`, onclick: () => { size = s; render(); } });
    const swatches = PLAYER_COLORS.map((c, i) =>
      h('span', { class: 'sw' + (i === team ? ' on' : ''), title: PLAYER_COLOR_NAMES[i], style: { background: hex(c) }, onclick: () => { team = i; render(); } }),
    );
    const search = h('input', { type: 'text', placeholder: 'Filter (Name oder Schlüssel)', value: filter });
    search.oninput = (): void => {
      filter = search.value.toLowerCase();
      renderGrid();
    };
    wrap.classList.toggle('light', light);
    wrap.append(
      h(
        'header',
        {},
        h('h1', { text: 'StrongPoly – Icon-Galerie' }),
        h('span', {}, sizeBtn(32), sizeBtn(48), sizeBtn(64), sizeBtn(96)),
        h('span', {}, 'Spielerfarbe: ', ...swatches),
        h('button', { text: light ? 'Dunkler Grund' : 'Heller Grund', onclick: () => { light = !light; render(); } }),
        search,
        h('span', { class: 'cov' + (missing.length ? ' bad' : ''), text: missing.length ? `Fehlend: ${missing.join(', ')}` : 'Abdeckung vollständig' }),
      ),
    );
    wrap.append(h('div', { id: 'sp-gal-body' }));
    renderGrid();
    search.focus();
  };

  const renderGrid = (): void => {
    const body = wrap.querySelector('#sp-gal-body') as HTMLElement;
    clear(body);
    const items = galleryItems({ size, teamColor: PLAYER_COLORS[team] });
    let cur = '';
    let grid: HTMLElement | null = null;
    let n = 0;
    for (const it of items) {
      if (filter && !(it.name + ' ' + it.key).toLowerCase().includes(filter)) continue;
      if (it.group !== cur) {
        cur = it.group;
        body.append(h('h2', { text: cur }));
        grid = h('div', { class: 'grid', style: `--cell:${Math.max(110, size + 40)}px` });
        body.append(grid);
      }
      const cell = h('div', { class: 'cell', title: it.key }, h('div', { html: it.svg }), h('div', { class: 'nm', text: it.name }), h('div', { class: 'ky', text: it.key }));
      grid?.append(cell);
      n++;
    }
    document.title = `Icons (${n})`;
  };

  render();
}
