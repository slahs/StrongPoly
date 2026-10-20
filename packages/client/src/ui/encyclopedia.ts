/**
 * Enzyklopädie: Vollbild-Overlay mit Navigation links, Inhalt rechts, Suchfeld und Deep-Link.
 *
 *   openEncyclopedia('building/quarry')   // Seite öffnen (ohne Argument: Startseite bzw. zuletzt gesehene Seite)
 *   closeEncyclopedia()
 *   toggleEncyclopedia()
 *   isEncyclopediaOpen()
 *
 * Seiten-IDs: start, buildings, building/<key>, units, unit/<key>, resources, resource/<key>, chains, chain/<id>,
 * popularity, combat, siege, abilities, rules, controls, lords. Auch nackte Schlüssel („quarry“) werden aufgelöst.
 * Schließen mit Esc oder der Enzyklopädie-Taste (Standard F2). Der Inhalt entsteht vollständig aus shared/data.
 */
import { t } from '@strongpoly/shared';
import { loadHotkeys } from '../game/hotkeys';
import { renderDoc } from './doc/render';
import { clear, h } from './dom';
import { buildingTooltip, attachTooltip, hideTooltip, unitTooltip } from './tooltip';
import { EncGroup, EncPage, encGroups, encPages, resolvePage, searchPages } from './encyclopedia/pages';
import { iconEl } from './icons';
import { BUILDINGS, UNITS } from '@strongpoly/shared';

export interface OpenOptions {
  /** wird nach dem Schließen aufgerufen (z. B. um die Pause zu beenden) */
  onClose?: () => void;
}

interface State {
  root: HTMLElement;
  pages: Map<string, EncPage>;
  groups: EncGroup[];
  nav: HTMLElement;
  content: HTMLElement;
  search: HTMLInputElement;
  current: string;
  history: string[];
  open: Set<string>;
  textCache: Map<string, string>;
  onClose?: () => void;
  keyDown: (e: KeyboardEvent) => void;
  keyUp: (e: KeyboardEvent) => void;
  back: HTMLButtonElement;
}

let st: State | null = null;
let lastPage = 'start';

export function isEncyclopediaOpen(): boolean {
  return st !== null;
}

export function closeEncyclopedia(): void {
  if (!st) return;
  const s = st;
  st = null;
  window.removeEventListener('keydown', s.keyDown, true);
  window.removeEventListener('keyup', s.keyUp, true);
  hideTooltip();
  s.root.remove();
  s.onClose?.();
}

export function toggleEncyclopedia(page?: string, opts?: OpenOptions): void {
  if (st) closeEncyclopedia();
  else openEncyclopedia(page, opts);
}

/** Springt zu einer Seite, wenn die Enzyklopädie offen ist; sonst öffnet sie sie dort. */
export function showEncyclopediaPage(page: string): void {
  if (st) go(page);
  else openEncyclopedia(page);
}

export function openEncyclopedia(page?: string, opts: OpenOptions = {}): void {
  if (st) {
    if (page) go(page);
    return;
  }
  const pages = encPages({ hotkeys: loadHotkeys() });
  const groups = encGroups();
  const search = h('input', { type: 'text', placeholder: t('enc.search'), 'aria-label': t('enc.search') });
  const back = h('button', { text: '←', title: t('enc.back'), disabled: true, onclick: () => goBack() });
  const nav = h('div', { class: 'enc-nav' });
  const content = h('div', { class: 'enc-content' });
  const root = h(
    'div',
    { class: 'enc', role: 'dialog', 'aria-label': t('enc.title') },
    h(
      'div',
      { class: 'enc-frame' },
      h(
        'div',
        { class: 'enc-top' },
        back,
        h('h2', { text: t('enc.title') }),
        h('div', { class: 'search' }, search),
        h('div', { class: 'sp' }),
        h('button', { text: '✕  ' + t('enc.close'), onclick: () => closeEncyclopedia() }),
      ),
      h('div', { class: 'enc-main' }, nav, content),
      h('div', { class: 'enc-foot' }, h('span', { text: t('enc.foot') })),
    ),
  );
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  const keyDown = (e: KeyboardEvent): void => onKeyDown(e);
  const keyUp = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) e.stopImmediatePropagation();
  };
  st = { root, pages, groups, nav, content, search, current: '', history: [], open: new Set(), textCache: new Map(), onClose: opts.onClose, keyDown, keyUp, back };
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  search.addEventListener('input', () => runSearch());
  document.body.append(root);
  go(page ?? lastPage, false);
  if (!page) search.blur();
}

function onKeyDown(e: KeyboardEvent): void {
  if (!st) return;
  const hk = loadHotkeys();
  if (e.code === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (st.search.value) {
      st.search.value = '';
      runSearch();
    } else closeEncyclopedia();
    return;
  }
  if (e.code === hk.encyclopedia || e.code === 'F2') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) closeEncyclopedia();
    return;
  }
  // Strg-Kombinationen, F5 und F12 gehören dem Browser; alles andere erreicht das Spiel nicht
  if (e.ctrlKey || e.metaKey || e.code === 'F5' || e.code === 'F12') return;
  e.stopImmediatePropagation();
  if (/^F\d+$/.test(e.code)) e.preventDefault();
}

function goBack(): void {
  if (!st || st.history.length < 2) return;
  st.history.pop();
  const prev = st.history[st.history.length - 1];
  go(prev, false, true);
}

function go(id: string, push = true, fromBack = false): void {
  if (!st) return;
  const s = st;
  const page = resolvePage(s.pages, id);
  s.search.value = '';
  s.current = page;
  lastPage = page;
  if (push && !fromBack && s.history[s.history.length - 1] !== page) s.history.push(page);
  if (!s.history.length) s.history.push(page);
  s.back.disabled = s.history.length < 2;
  const p = s.pages.get(page)!;
  const group = s.groups.find((g) => g.id === p.group);
  if (group) s.open.add(group.id);
  renderNav();
  clear(s.content);
  const crumb = h('div', { class: 'enc-crumb' }, h('a', { text: t('enc.title'), onclick: () => go('start') }));
  if (group && group.page && group.page !== page) {
    crumb.append(' › ', h('a', { text: group.title, onclick: () => go(group.page!) }));
  } else if (group && !group.page && group.title && p.id !== 'start') crumb.append(' › ', group.title);
  s.content.append(crumb, renderDoc(p.build(), { onLink: (l) => go(l) }));
  s.content.scrollTop = 0;
  const cur = s.nav.querySelector('.item.cur');
  if (cur) (cur as HTMLElement).scrollIntoView({ block: 'nearest' });
}

function pageTooltip(id: string): (() => HTMLElement) | null {
  if (id.startsWith('building/')) {
    const key = id.slice('building/'.length);
    const def = BUILDINGS.find((b) => b.key === key);
    return def ? () => buildingTooltip(def.id) : null;
  }
  if (id.startsWith('unit/')) {
    const key = id.slice('unit/'.length);
    const def = UNITS.find((u) => u.key === key);
    return def ? () => unitTooltip(def.id) : null;
  }
  return null;
}

function renderNav(): void {
  if (!st) return;
  const s = st;
  clear(s.nav);
  for (const g of s.groups) {
    const isOpen = s.open.has(g.id);
    const head = h(
      'div',
      { class: 'grp' + (g.page && g.page === s.current ? ' cur' : ''), role: 'button' },
      h('span', { class: 'doc-ic' }, iconEl(g.icon)),
      h('span', { text: g.title }),
      g.sections.length ? h('span', { class: 'arr', text: isOpen ? '▾' : '▸' }) : null,
    );
    head.onclick = () => {
      if (g.sections.length) {
        if (isOpen && !g.page) s.open.delete(g.id);
        else s.open.add(g.id);
      }
      if (g.page && g.page !== s.current) go(g.page);
      else renderNav();
    };
    s.nav.append(head);
    if (!isOpen) continue;
    for (const sec of g.sections) {
      const box = h('div', { class: 'sub' });
      if (sec.title) box.append(h('div', { class: 'subhead', text: sec.title }));
      for (const id of sec.pages) {
        const p = s.pages.get(id);
        if (!p) continue;
        const item = h('div', { class: 'item' + (id === s.current ? ' cur' : ''), role: 'button' }, h('span', { class: 'doc-ic' }, iconEl(p.icon)), h('span', { text: p.title }));
        item.onclick = () => go(id);
        const tip = pageTooltip(id);
        if (tip) attachTooltip(item, tip, { placement: 'cursor' });
        box.append(item);
      }
      s.nav.append(box);
    }
  }
}

let searchTimer = 0;
function runSearch(): void {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    if (!st) return;
    const s = st;
    const q = s.search.value.trim();
    if (!q) {
      go(s.current, false, true);
      return;
    }
    const hits = searchPages(s.pages, q, s.textCache);
    clear(s.content);
    s.content.append(h('h3', { class: 'doc-h', text: `${t('enc.results')} (${hits.length})` }));
    if (!hits.length) s.content.append(h('div', { class: 'enc-empty', text: t('enc.noResults') }));
    const box = h('div', { class: 'enc-results' });
    for (const p of hits.slice(0, 80)) {
      const g = s.groups.find((x) => x.id === p.group);
      const a = h('a', { class: 'doc-chipbtn', href: '#' }, h('span', { class: 'doc-ic' }, iconEl(p.icon)), h('span', { text: p.title }), h('span', { class: 'crumb', text: g ? g.title : '' }));
      a.onclick = (e) => {
        e.preventDefault();
        go(p.id);
      };
      box.append(h('div', {}, a));
    }
    s.content.append(box);
    s.content.scrollTop = 0;
  }, 120);
}
