/**
 * Testseite `?tooltips`: zeigt alle Tooltips (Gebäude, Einheiten, Waren, Fähigkeiten, Werkzeuge) als Raster.
 * Oben ein Hover-Test mit echten Tooltips (Positionierung am Bildrand prüfen), darunter jeder Tooltip statisch.
 */
import { ABILITIES, BUILDINGS, PLAYER_COLORS, RES_INFO, UNITS } from '@strongpoly/shared';
import { renderDoc } from '../doc/render';
import { h } from '../dom';
import { TOOL_KEYS, abilityIcon, buildingIcon, resourceIcon, toolIcon, unitIcon } from '../icons';
import { abilityTooltip, attachTooltip, buildingTooltip, resourceTooltip, toolTooltip, unitTooltip } from '../tooltip';
import { abilityTipDoc, buildingTipDoc, resourceTipDoc, toolTipDoc, unitTipDoc } from './model';
import type { Doc } from '../doc/blocks';

export function showTooltipGallery(): void {
  document.body.style.cssText = 'overflow:auto;background:#241b12;user-select:text';
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
  const root = h('div', { id: 'tipgal', style: 'position:absolute;inset:0;overflow:auto;padding:14px 16px 60px;color:#f2ede0;font-family:Segoe UI,system-ui,sans-serif' });
  document.body.append(root);
  root.append(h('h1', { text: 'Tooltips', style: 'margin:0 0 4px;color:#f0c040' }), h('div', { class: 'crumb', style: 'margin-bottom:10px', text: 'Hover-Test: Maus über die Icons. Darunter alle Tooltip-Inhalte statisch.' }));

  const hoverRow = (title: string, items: { icon: string; tip: () => HTMLElement }[]): void => {
    root.append(h('h3', { text: title, style: 'margin:12px 0 4px;color:#e3c98a' }));
    const row = h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px' });
    for (const it of items) {
      const b = h('div', { style: 'width:40px;height:40px;background:#3a2c1e;border:1px solid #7d5a30;border-radius:4px;display:flex;cursor:default' });
      b.innerHTML = it.icon;
      attachTooltip(b, it.tip);
      row.append(b);
    }
    root.append(row);
  };
  hoverRow('Gebäude', BUILDINGS.map((b) => ({ icon: buildingIcon(b.id, 38), tip: () => buildingTooltip(b.id) })));
  hoverRow('Einheiten', UNITS.map((u) => ({ icon: unitIcon(u.id, PLAYER_COLORS[0], 38), tip: () => unitTooltip(u.id, PLAYER_COLORS[0]) })));
  hoverRow('Waren', RES_INFO.map((_r, i) => ({ icon: resourceIcon(i, 38), tip: () => resourceTooltip(i, { stock: 42, capacity: 150, priceMul: 1.2 }) })));
  hoverRow('Fähigkeiten', ABILITIES.map((a) => ({ icon: abilityIcon(a.id, 38), tip: () => abilityTooltip(a.id) })));
  hoverRow('Werkzeuge', TOOL_KEYS.map((k) => ({ icon: toolIcon(k, 38), tip: () => toolTooltip(k, 'Entf') })));

  const section = (title: string, docs: Doc[]): void => {
    root.append(h('h2', { text: `${title} (${docs.length})`, style: 'margin:26px 0 8px;color:#e3c98a;border-bottom:1px solid #7d5a30' }));
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;align-items:start' });
    for (const d of docs) {
      const card = h('div', { class: 'panel', style: 'padding:8px 10px;background:rgba(28,21,14,.97)' }, renderDoc(d, { compact: true }));
      grid.append(card);
    }
    root.append(grid);
  };
  section('Gebäude', BUILDINGS.map((b) => buildingTipDoc(b.id)));
  section('Einheiten', UNITS.map((u) => unitTipDoc(u.id, PLAYER_COLORS[0])));
  section('Waren', RES_INFO.map((_r, i) => resourceTipDoc(i, { stock: 42, capacity: 150 })));
  section('Fähigkeiten', ABILITIES.map((a) => abilityTipDoc(a.id)));
  section('Werkzeuge', TOOL_KEYS.map((k) => toolTipDoc(k, 'Entf')));
}
