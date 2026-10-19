import type { GameSetup } from '@strongpoly/shared';

export interface SaveRecord {
  key: string;
  name: string;
  time: number;
  setup: GameSetup;
  state: unknown;
}

export function makeSave(setup: GameSetup, state: unknown, name: string): SaveRecord {
  return { key: `save-${Date.now()}`, name, time: Date.now(), setup, state };
}

/** Spielstände als strukturierte Objekte in IndexedDB. */
export class SaveStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const req = indexedDB.open('strongpoly', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('saves', { keyPath: 'key' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.db;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('saves', mode);
      const req = fn(t.objectStore('saves'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async save(r: SaveRecord): Promise<void> {
    await this.tx('readwrite', (s) => s.put(r));
  }
  async load(key: string): Promise<SaveRecord | null> {
    return ((await this.tx('readonly', (s) => s.get(key))) as SaveRecord | undefined) ?? null;
  }
  async list(): Promise<{ key: string; name: string; time: number }[]> {
    const all = (await this.tx('readonly', (s) => s.getAll())) as SaveRecord[];
    return all.map((r) => ({ key: r.key, name: r.name, time: r.time }));
  }
  async remove(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
}
