import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 4H-Befund (Speicher): `hud.ts` hängte pro Spiel einen anonymen `pointerup`-Listener ans Fenster, der nie entfernt wurde – er hielt nach
 * jedem Spielende das ganze Hud samt Welt im Speicher (Browsermessung `scripts/qa/s13_leaks.mjs`: +1 Listener je Spiel, Heap wächst).
 * Die Regel: Listener an `window`/`document`, die zu einer Sitzung gehören, sind benannte Funktionen und werden in `destroy()` entfernt.
 * Ausgenommen sind Einmal-Installationen (Tooltips, Audio-Engine, Spielszene).
 */
const SRC = join(__dirname, '../src');
const SINGLETONS = new Set(['ui/tooltip.ts', 'audio/index.ts', 'render/scene.ts', 'main.ts', 'editor/editor.ts', 'ui/screens.ts', 'ui/encyclopedia.ts']);

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('Sitzungsgebundene Listener werden entfernt', () => {
  it('kein anonymer window/document-Listener außerhalb der Einmal-Installationen', () => {
    const bad: string[] = [];
    for (const f of files(SRC)) {
      const rel = f.slice(SRC.length + 1);
      if (SINGLETONS.has(rel)) continue;
      const text = readFileSync(f, 'utf8');
      const re = /(window|document)\.addEventListener\(\s*'[a-zA-Z]+'\s*,\s*(\(|async|function)/g;
      for (const m of text.matchAll(re)) bad.push(`${rel}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  it('Hud entfernt resize- und pointerup-Listener in destroy()', () => {
    const text = readFileSync(join(SRC, 'ui/hud.ts'), 'utf8');
    const destroy = text.slice(text.indexOf('  destroy(): void {'));
    expect(destroy).toMatch(/removeEventListener\('resize'/);
    expect(destroy).toMatch(/removeEventListener\('pointerup'/);
  });

  it('Session.destroy räumt das Bewegungs-Debug-Overlay auf (Canvas + Textfeld im #ui-Baum, window.__motion)', () => {
    const session = readFileSync(join(SRC, 'game/session.ts'), 'utf8');
    const destroy = session.slice(session.indexOf('  destroy(): void {'));
    expect(destroy).toMatch(/this\.debug\.destroy\(\)/);
    const dbg = readFileSync(join(SRC, 'render/motion_debug.ts'), 'utf8');
    expect(dbg).toMatch(/destroy\(\): void \{[\s\S]*this\.cv\.remove\(\);[\s\S]*this\.box\.remove\(\);/);
  });
});
