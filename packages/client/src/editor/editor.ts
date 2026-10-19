import * as THREE from 'three';
import { GameMap, MapJson, mapFromJson, mapToJson, generateMap, initDeposits, PLAYER_COLORS, T, TERRAIN_NAMES, TREE_WOOD, MAX_HEIGHT, HEIGHT_STEP } from '@strongpoly/shared';
import type { GameScene } from '../render/scene';
import { clear, h, hex } from '../ui/dom';

type Tool =
  | { k: 'terrain'; t: number }
  | { k: 'height'; d: number }
  | { k: 'tree'; on: boolean }
  | { k: 'start'; i: number };

/** Einfacher Karteneditor: Terrain malen, Höhen, Bäume, Startpositionen; Export/Import als JSON. */
export function openEditor(gs: GameScene, ui: HTMLElement, onClose: (testMap?: MapJson) => void): () => void {
  let map = new GameMap(128, 128);
  map.terrain.fill(T.Steppe);
  map.height.fill(1);
  map.starts = [{ x: 30, y: 64 }, { x: 98, y: 64 }];
  map.name = 'Neue Karte';
  let tool: Tool = { k: 'terrain', t: T.Steppe };
  let brush = 3;
  let painting = false;
  let alive = true;
  const keys = new Set<string>();
  const startMarkers = new THREE.Group();
  gs.root.add(startMarkers);

  const loadMap = (m: GameMap): void => {
    map = m;
    gs.setMap(map);
    gs.root.add(startMarkers);
    gs.cam.lookAt(map.w / 2, map.h / 2);
    rebuildStarts();
  };

  const rebuildStarts = (): void => {
    while (startMarkers.children.length) {
      const c = startMarkers.children.pop()!;
      (c as THREE.Mesh).geometry?.dispose();
    }
    map.starts.forEach((s, i) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 5), new THREE.MeshLambertMaterial({ color: 0x7d5a30 }));
      pole.position.y = 2;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.06), new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[i % 8] }));
      flag.position.set(0.75, 3.5, 0);
      const ring = new THREE.Mesh(new THREE.RingGeometry(14, 15, 32), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i % 8], side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      g.add(pole, flag, ring);
      const y = map.height[map.idx(Math.min(map.w - 1, s.x), Math.min(map.h - 1, s.y))] * HEIGHT_STEP;
      g.position.set(s.x + 0.5, y, s.y + 0.5);
      startMarkers.add(g);
    });
  };

  const touch = (x: number, y: number): void => {
    gs.terrain?.markTile(x, y);
  };

  const fixHeights = (cx: number, cy: number, r: number): void => {
    for (let pass = 0; pass < 6; pass++) {
      for (let y = cy - r - 2; y <= cy + r + 2; y++)
        for (let x = cx - r - 2; x <= cx + r + 2; x++) {
          if (!map.inBounds(x, y)) continue;
          const i = map.idx(x, y);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (!map.inBounds(x + dx, y + dy)) continue;
            const j = map.idx(x + dx, y + dy);
            if (map.terrain[i] === T.Water || map.terrain[j] === T.Water) continue;
            if (map.height[i] - map.height[j] > 1) {
              map.height[j] = map.height[i] - 1;
              touch(x + dx, y + dy);
            }
          }
        }
    }
  };

  const paintAt = (px: number, py: number, erase = false): void => {
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    if (tool.k === 'start') {
      const idx = tool.i;
      while (map.starts.length <= idx) map.starts.push({ x: cx, y: cy });
      map.starts[idx] = { x: cx, y: cy };
      rebuildStarts();
      return;
    }
    const r = brush;
    for (let y = cy - r + 1; y <= cy + r - 1; y++)
      for (let x = cx - r + 1; x <= cx + r - 1; x++) {
        if (!map.inBounds(x, y) || Math.hypot(x - cx, y - cy) > r - 0.5) continue;
        const i = map.idx(x, y);
        if (tool.k === 'terrain') {
          const t = erase ? T.Steppe : tool.t;
          map.terrain[i] = t;
          if (t === T.Water) {
            map.height[i] = 0;
            map.trees[i] = 0;
          } else {
            if (map.height[i] === 0) map.height[i] = 1;
            if (t === T.Rock || t === T.Swamp || t === T.PitchSpring || t === T.StoneDeposit || t === T.IronDeposit) map.trees[i] = 0;
          }
          map.deposit[i] = 0;
        } else if (tool.k === 'height') {
          if (map.terrain[i] === T.Water) continue;
          map.height[i] = Math.max(1, Math.min(MAX_HEIGHT, map.height[i] + (erase ? -tool.d : tool.d)));
        } else if (tool.k === 'tree') {
          const t = map.terrain[i];
          const on = erase ? !tool.on : tool.on;
          if (on && t !== T.Water && t !== T.Rock && t !== T.Swamp && t !== T.Moat) map.trees[i] = TREE_WOOD;
          else if (!on) map.trees[i] = 0;
        }
        touch(x, y);
      }
    if (tool.k === 'height') fixHeights(cx, cy, r);
    initDeposits(map);
    gs.decor?.markDirty();
    rebuildStarts();
  };

  // ---- Eingabe ----
  const canvas = gs.canvas;
  const pickGround = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return gs.cam.pick(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), map);
  };
  const onDown = (e: MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    painting = true;
    const g = pickGround(e);
    if (g) paintAt(g.x, g.y, e.button === 2);
    if (tool.k === 'start') painting = false;
  };
  const onMove = (e: MouseEvent) => {
    if (!painting) return;
    const g = pickGround(e);
    if (g) paintAt(g.x, g.y, (e.buttons & 2) !== 0);
  };
  const onUp = () => (painting = false);
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'KeyQ') gs.cam.rotate(-1);
    if (e.code === 'KeyE') gs.cam.rotate(1);
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    gs.cam.zoom(e.deltaY);
  };
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  // ---- UI ----
  const panel = h('div', { class: 'panel', style: 'position:absolute;left:8px;top:8px;width:230px;padding:10px;z-index:30;max-height:96vh;overflow:auto;pointer-events:auto' });
  const toolButtons: HTMLButtonElement[] = [];
  const setTool = (t: Tool, btn: HTMLButtonElement) => {
    tool = t;
    for (const b of toolButtons) b.classList.remove('active');
    btn.classList.add('active');
  };
  const tbtn = (label: string, t: Tool, color?: number) => {
    const b = h('button', { text: label, style: 'width:100%;text-align:left;margin-bottom:2px', onclick: () => setTool(t, b) });
    if (color !== undefined) b.prepend(h('span', { class: 'dot', style: { background: hex(color), marginRight: '6px' } }));
    toolButtons.push(b);
    return b;
  };
  const TCOL: Record<number, number> = { [T.Desert]: 0xe3c98a, [T.Steppe]: 0xb5a560, [T.Oasis]: 0x6fae4a, [T.Rock]: 0x8b8378, [T.Water]: 0x3f86c4, [T.Swamp]: 0x56633a, [T.StoneDeposit]: 0xb9b4aa, [T.IronDeposit]: 0x4a4540, [T.PitchSpring]: 0x2a2622 };
  const info = h('div', { class: 'crumb' });
  const nameIn = h('input', { type: 'text', value: map.name, style: 'width:100%', onchange: (e) => (map.name = (e.target as HTMLInputElement).value) });
  const sizeSel = h('select');
  for (const s of [64, 96, 128, 160, 200, 256, 320, 400]) sizeSel.append(h('option', { value: String(s), text: `${s}×${s}`, selected: s === 128 }));
  const seedIn = h('input', { type: 'number', value: '1', style: 'width:80px' });
  const refresh = () => {
    info.textContent = `${map.w}×${map.h} · Starts: ${map.starts.length} · Links malen, Rechts löschen`;
    nameIn.value = map.name;
  };
  panel.append(
    h('h3', { text: 'Karteneditor', style: 'margin:0 0 6px' }),
    h('div', { class: 'crumb', text: 'Name' }), nameIn,
    h('div', { class: 'row', style: 'margin:6px 0' }, sizeSel, h('button', { text: 'Leer', onclick: () => { const n = Number(sizeSel.value); const m = new GameMap(n, n); m.terrain.fill(T.Steppe); m.height.fill(1); m.starts = [{ x: Math.floor(n * 0.25), y: n >> 1 }, { x: Math.floor(n * 0.75), y: n >> 1 }]; m.name = 'Neue Karte'; loadMap(m); refresh(); } })),
    h('div', { class: 'row', style: 'margin-bottom:6px' }, seedIn, h('button', { text: 'Zufall', onclick: () => { const n = Number(sizeSel.value); loadMap(generateMap({ seed: Number(seedIn.value) || 1, size: n, players: 2 })); refresh(); } })),
    h('div', { class: 'crumb', text: 'Terrain' }),
    ...[T.Desert, T.Steppe, T.Oasis, T.Rock, T.Water, T.Swamp, T.StoneDeposit, T.IronDeposit, T.PitchSpring].map((t) => tbtn(TERRAIN_NAMES[t], { k: 'terrain', t }, TCOL[t])),
    h('div', { class: 'crumb', text: 'Höhe / Bäume' }),
    tbtn('Höhe anheben', { k: 'height', d: 1 }),
    tbtn('Höhe senken', { k: 'height', d: -1 }),
    tbtn('Bäume setzen', { k: 'tree', on: true }),
    tbtn('Bäume entfernen', { k: 'tree', on: false }),
    h('div', { class: 'crumb', text: 'Startpositionen (klicken zum Setzen)' }),
    ...Array.from({ length: 8 }, (_, i) => tbtn(`Start ${i + 1}`, { k: 'start', i }, PLAYER_COLORS[i])),
    h('div', { class: 'crumb', text: 'Pinselgröße' }),
    h('input', { type: 'range', min: '1', max: '9', value: String(brush), oninput: (e) => (brush = Number((e.target as HTMLInputElement).value)) }),
    info,
  );
  toolButtons[1].classList.add('active');

  const download = () => {
    const j = mapToJson(map);
    const blob = new Blob([JSON.stringify(j)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${map.name || 'karte'}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const fileIn = h('input', {
    type: 'file',
    accept: '.json,application/json',
    style: 'display:none',
    onchange: (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      void f.text().then((t) => {
        try {
          loadMap(mapFromJson(JSON.parse(t) as MapJson));
          refresh();
        } catch (err) {
          alert('Ungültige Karte: ' + (err as Error).message);
        }
      });
    },
  });
  const close = (testMap?: MapJson) => {
    if (!alive) return;
    alive = false;
    canvas.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    gs.root.remove(startMarkers);
    panel.remove();
    onClose(testMap);
  };
  panel.append(
    h('div', { class: 'row', style: 'margin-top:8px;flex-wrap:wrap' },
      h('button', { text: 'Export', onclick: download }),
      h('button', { text: 'Import', onclick: () => fileIn.click() }),
      fileIn,
      h('button', { class: 'primary', text: 'Testspiel', onclick: () => {
        if (map.starts.length < 2) return alert('Mindestens zwei Startpositionen setzen.');
        close(mapToJson(map));
      } }),
      h('button', { text: 'Zurück', onclick: () => close() }),
    ),
  );
  ui.append(panel);
  loadMap(map);
  refresh();

  // eigene Render-Schleife
  let last = performance.now();
  const loop = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const sx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    if (sx || sy) gs.cam.pan(sx, sy, dt);
    gs.render(dt, now / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  void clear;
  return () => close();
}
