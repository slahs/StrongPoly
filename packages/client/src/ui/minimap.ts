import { ClientWorld, PLAYER_COLORS, T } from '@strongpoly/shared';

const SIZE = 174;
const TERRAIN_RGB: Record<number, number> = {
  [T.Desert]: 0xe3c98a,
  [T.Steppe]: 0xb5a560,
  [T.Oasis]: 0x6fae4a,
  [T.Rock]: 0x8b8378,
  [T.Water]: 0x3f86c4,
  [T.Swamp]: 0x56633a,
  [T.StoneDeposit]: 0xb9b4aa,
  [T.IronDeposit]: 0x4a4540,
  [T.PitchSpring]: 0x2a2622,
  [T.Moat]: 0x3f86c4,
};

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private baseCtx: CanvasRenderingContext2D;
  private dragging = false;
  private mapW = 1;
  private mapH = 1;
  private lastDraw = 0;
  private disposers: (() => void)[] = [];
  private fogCanvas: HTMLCanvasElement | null = null;

  constructor(
    private world: ClientWorld,
    private onMove: (x: number, y: number) => void,
    private onOrder: (x: number, y: number) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = SIZE;
    this.base.height = SIZE;
    this.baseCtx = this.base.getContext('2d')!;
    const pos = (e: MouseEvent): [number, number] => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * this.mapW, ((e.clientY - r.top) / r.height) * this.mapH];
    };
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button === 0) {
        this.dragging = true;
        this.onMove(...pos(e));
      } else if (e.button === 2) this.onOrder(...pos(e));
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    const move = (e: MouseEvent) => {
      if (this.dragging) this.onMove(...pos(e));
    };
    const up = () => (this.dragging = false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    this.disposers.push(() => window.removeEventListener('mousemove', move), () => window.removeEventListener('mouseup', up));
  }

  destroy(): void {
    for (const d of this.disposers) d();
  }

  /** Terrain-Basisbild neu erzeugen */
  refreshTerrain(): void {
    const m = this.world.map;
    this.mapW = m.w;
    this.mapH = m.h;
    const img = new ImageData(m.w, m.h);
    for (let i = 0; i < m.n; i++) {
      let c = TERRAIN_RGB[m.terrain[i]] ?? 0xff00ff;
      if (m.trees[i]) c = 0x2c6a2e;
      const hgt = m.height[i];
      const k = 0.78 + hgt * 0.07;
      img.data[i * 4] = Math.min(255, ((c >> 16) & 255) * k);
      img.data[i * 4 + 1] = Math.min(255, ((c >> 8) & 255) * k);
      img.data[i * 4 + 2] = Math.min(255, (c & 255) * k);
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement('canvas');
    tmp.width = m.w;
    tmp.height = m.h;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    this.baseCtx.imageSmoothingEnabled = false;
    this.baseCtx.drawImage(tmp, 0, 0, SIZE, SIZE);
  }

  /** Erkundungsnebel (dunkle Fläche über nicht erkundeten Tiles) */
  setFog(exp: Uint8Array | null): void {
    if (!exp) {
      this.fogCanvas = null;
      return;
    }
    const m = this.world.map;
    const img = new ImageData(m.w, m.h);
    for (let i = 0; i < m.n; i++) {
      img.data[i * 4 + 3] = exp[i] ? 0 : 235;
    }
    const c = this.fogCanvas ?? document.createElement('canvas');
    c.width = m.w;
    c.height = m.h;
    c.getContext('2d')!.putImageData(img, 0, 0);
    this.fogCanvas = c;
  }

  /** Ändert einzelne Tiles (Bäume gefällt, Graben) */
  patchTile(i: number): void {
    const m = this.world.map;
    const x = i % m.w;
    const y = (i / m.w) | 0;
    let c = TERRAIN_RGB[m.terrain[i]] ?? 0xff00ff;
    if (m.trees[i]) c = 0x2c6a2e;
    const k = 0.78 + m.height[i] * 0.07;
    this.baseCtx.fillStyle = `rgb(${Math.min(255, ((c >> 16) & 255) * k)},${Math.min(255, ((c >> 8) & 255) * k)},${Math.min(255, (c & 255) * k)})`;
    const sx = SIZE / m.w;
    this.baseCtx.fillRect(Math.floor(x * sx), Math.floor(y * sx), Math.ceil(sx), Math.ceil(sx));
  }

  draw(now: number, cam: { x: number; y: number; size: number }, myTeam: number, teamOf: number[], isVisible: ((x: number, y: number) => boolean) | null): void {
    if (now - this.lastDraw < 0.25) return;
    this.lastDraw = now;
    const w = this.world;
    const ctx = this.ctx;
    const sx = SIZE / this.mapW;
    ctx.drawImage(this.base, 0, 0);
    if (this.fogCanvas) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.fogCanvas, 0, 0, SIZE, SIZE);
    }
    for (const b of w.buildings.values()) {
      if (teamOf[b.o] !== myTeam && isVisible && !isVisible(b.x + b.w / 2, b.y + b.h / 2)) continue;
      ctx.fillStyle = '#' + PLAYER_COLORS[b.o % 8].toString(16).padStart(6, '0');
      ctx.fillRect(Math.floor(b.x * sx), Math.floor(b.y * sx), Math.max(2, Math.ceil(b.w * sx)), Math.max(2, Math.ceil(b.h * sx)));
    }
    for (let s = 0; s < w.top; s++) {
      if (!w.ids[s]) continue;
      const o = w.owner[s];
      const x = w.curX[s];
      const y = w.curY[s];
      if (teamOf[o] !== myTeam && isVisible && !isVisible(x, y)) continue;
      ctx.fillStyle = '#' + PLAYER_COLORS[o % 8].toString(16).padStart(6, '0');
      ctx.fillRect(Math.floor(x * sx), Math.floor(y * sx), 2, 2);
    }
    for (let i = 0; i + 3 < w.banners.length; i += 4) {
      ctx.fillStyle = w.banners[i + 2] >= 0 ? '#' + PLAYER_COLORS[w.banners[i + 2] % 8].toString(16).padStart(6, '0') : '#ffffff';
      ctx.fillRect(Math.floor(w.banners[i] * sx) - 2, Math.floor(w.banners[i + 1] * sx) - 2, 5, 5);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(Math.floor(w.banners[i] * sx) - 2, Math.floor(w.banners[i + 1] * sx) - 2, 5, 5);
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    const half = (cam.size * sx) / 2;
    ctx.strokeRect(cam.x * sx - half, cam.y * sx - half * 0.75, half * 2, half * 1.5);
  }
}
