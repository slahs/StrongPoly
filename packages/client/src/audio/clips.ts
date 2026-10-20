/**
 * Clip-Register der gesprochenen Zeilen: Schlüssel → Audiodatei (Sprachpaket je Sprache, austauschbar).
 * Das Paket liegt unter `<Basis>/voice/<lang>/manifest.json` (+ Clips, siehe scripts/gen_voices.py). Basis ist `BASE_URL`
 * oder per `?voicepack=<URL-Präfix>` frei wählbar (z. B. ein anderes Paket mit gleicher Struktur).
 * Fehlt das Paket oder ein Clip, meldet das Register „nicht vorhanden“ – das Sprachsystem nimmt dann den Ersatz.
 * Das Laden ist träge (bei Bedarf) plus gedrosseltes Vorladen der häufigsten Zeilen im Hintergrund.
 */
import { normText } from './voice_logic';

export interface ClipEntry {
  /** relativer Dateipfad im Paket */
  f: string;
  /** Dauer in Sekunden */
  d: number;
  /** Text der Zeile (muss zum angefragten Text passen) */
  t: string;
  /** Stimme (Gruppe) */
  v: string;
  /** 1 = Zeile stammt aus fremder Datenquelle (Beraterzeilen des Ereignis-Beraters) */
  x?: number;
}

export interface ClipManifest {
  lang: string;
  format: string;
  sampleRate?: number;
  generator?: string;
  clips: Record<string, ClipEntry>;
}

/** Prüft ein geladenes Manifest und liefert nur gültige Einträge zurück (kaputte werden ausgelassen). */
export function validateManifest(raw: unknown): ClipManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.lang !== 'string' || !o.clips || typeof o.clips !== 'object') return null;
  const clips: Record<string, ClipEntry> = {};
  for (const [k, v] of Object.entries(o.clips as Record<string, unknown>)) {
    const e = v as Partial<ClipEntry> | null;
    if (!e || typeof e.f !== 'string' || typeof e.d !== 'number' || !(e.d > 0) || typeof e.t !== 'string') continue;
    clips[k] = { f: e.f, d: e.d, t: e.t, v: typeof e.v === 'string' ? e.v : '', ...(e.x === 1 ? { x: 1 } : {}) };
  }
  return { lang: o.lang, format: String(o.format ?? 'mp3'), sampleRate: Number(o.sampleRate) || undefined, generator: typeof o.generator === 'string' ? o.generator : undefined, clips };
}

/** Kleiner LRU-Cache */
export class Lru<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V): void {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  has(k: string): boolean {
    return this.m.has(k);
  }
  get size(): number {
    return this.m.size;
  }
}

export interface ClipStats {
  manifest: 'none' | 'loading' | 'ok' | 'missing';
  clips: number;
  fetched: number;
  decoded: number;
  failed: number;
  prefetch: number;
}

type Decoder = (data: ArrayBuffer) => Promise<AudioBuffer>;

function baseUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('voicepack');
    if (q) return q.endsWith('/') ? q : `${q}/`;
  } catch {
    /* kein Browser */
  }
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const b = env?.BASE_URL ?? '/';
  return `${b.endsWith('/') ? b : `${b}/`}voice/`;
}

export class ClipRegistry {
  private manifests = new Map<string, ClipManifest | 'missing' | Promise<ClipManifest | 'missing'>>();
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private decoded = new Lru<AudioBuffer>(72);
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  readonly stats: ClipStats = { manifest: 'none', clips: 0, fetched: 0, decoded: 0, failed: 0, prefetch: 0 };
  private prefetchRunning = false;

  constructor(
    private decode: Decoder,
    private base: string = baseUrl(),
    private fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  /** Manifest einer Sprache laden (einmal; Fehler = „missing“ ohne erneuten Versuch) */
  ensure(lang: string): Promise<ClipManifest | null> {
    const cur = this.manifests.get(lang);
    if (cur && typeof cur !== 'string' && !(cur instanceof Promise)) return Promise.resolve(cur);
    if (cur === 'missing') return Promise.resolve(null);
    if (cur instanceof Promise) return cur.then((m) => (m === 'missing' ? null : m));
    this.stats.manifest = 'loading';
    const p = this.fetcher(`${this.base}${lang}/manifest.json`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const m = validateManifest(await r.json());
        if (!m) throw new Error('Manifest ungültig');
        this.manifests.set(lang, m);
        this.stats.manifest = 'ok';
        this.stats.clips = Object.keys(m.clips).length;
        return m;
      })
      .catch(() => {
        this.manifests.set(lang, 'missing');
        this.stats.manifest = 'missing';
        return 'missing' as const;
      });
    this.manifests.set(lang, p);
    return p.then((m) => (m === 'missing' ? null : m));
  }

  /** Synchron: Manifest, falls schon geladen */
  manifest(lang: string): ClipManifest | null {
    const m = this.manifests.get(lang);
    return m && typeof m !== 'string' && !(m instanceof Promise) ? m : null;
  }

  private altIndex = new Map<string, Map<string, string>>();

  /** Index „Zeilenschlüssel + Text → Clip-Schlüssel“ für ausgeschriebene Varianten (`<zeile>@<wert>`, z. B. Beraterzeilen mit Warennamen) */
  private alt(lang: string): Map<string, string> {
    let m = this.altIndex.get(lang);
    if (!m) {
      m = new Map();
      const man = this.manifest(lang);
      if (man) {
        for (const [k, e] of Object.entries(man.clips)) if (k.includes('@')) m.set(`${k.split('@')[0]}\u0000${normText(e.t)}`, k);
        this.altIndex.set(lang, m);
      }
    }
    return m;
  }

  /**
   * Clip zu Schlüssel und Text finden. Ein Clip gilt nur, wenn sein Text zum angefragten passt; sonst wird nach einer
   * ausgeschriebenen Variante (`<schlüssel>@<wert>`) mit genau diesem Text gesucht. Liefert den tatsächlichen Clip-Schlüssel.
   */
  resolve(lang: string, key: string, text?: string): { key: string; entry: ClipEntry } | null {
    const man = this.manifest(lang);
    if (!man) return null;
    const e = man.clips[key];
    if (e && (text === undefined || text === '' || normText(text) === normText(e.t))) return { key, entry: e };
    if (text) {
      const k2 = this.alt(lang).get(`${key}\u0000${normText(text)}`);
      if (k2) return { key: k2, entry: man.clips[k2] };
    }
    return null;
  }

  /** Gibt es für Schlüssel (und, falls angegeben, passenden Text) einen Clip? */
  entry(lang: string, key: string, text?: string): ClipEntry | null {
    return this.resolve(lang, key, text)?.entry ?? null;
  }

  private cacheKey(lang: string, key: string): string {
    return `${lang}/${key}`;
  }

  private fetchBytes(lang: string, e: ClipEntry): Promise<ArrayBuffer | null> {
    const url = `${this.base}${lang}/${e.f}`;
    let p = this.bytes.get(url);
    if (!p) {
      p = this.fetcher(url)
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          const b = await r.arrayBuffer();
          this.stats.fetched++;
          return b;
        })
        .catch(() => {
          this.stats.failed++;
          return null;
        });
      this.bytes.set(url, p);
    }
    return p;
  }

  /** Clip laden und dekodieren (zwischengespeichert); null bei Fehler */
  buffer(lang: string, key: string): Promise<AudioBuffer | null> {
    const ck = this.cacheKey(lang, key);
    const hit = this.decoded.get(ck);
    if (hit) return Promise.resolve(hit);
    const run = this.pending.get(ck);
    if (run) return run;
    const e = this.manifest(lang)?.clips[key];
    if (!e) return Promise.resolve(null);
    const p = this.fetchBytes(lang, e)
      .then(async (b) => {
        if (!b) return null;
        // decodeAudioData verbraucht den Puffer: Kopie übergeben, Rohdaten bleiben für spätere Dekodierung
        const buf = await this.decode(b.slice(0));
        this.decoded.set(ck, buf);
        this.stats.decoded++;
        return buf;
      })
      .catch(() => {
        this.stats.failed++;
        return null;
      })
      .finally(() => this.pending.delete(ck));
    this.pending.set(ck, p);
    return p;
  }

  /**
   * Häufigste Zeilen im Hintergrund vorladen (nur Rohdaten, höchstens `parallel` Anfragen zugleich),
   * damit der erste Befehl eines Spiels nicht auf das Netz warten muss.
   */
  prefetch(lang: string, keys: string[], parallel = 3): void {
    if (this.prefetchRunning) return;
    const m = this.manifest(lang);
    if (!m) return;
    this.prefetchRunning = true;
    const queue = keys.filter((k) => m.clips[k]);
    let running = 0;
    const next = (): void => {
      while (running < parallel && queue.length) {
        const k = queue.shift()!;
        running++;
        this.fetchBytes(lang, m.clips[k]).then(() => {
          this.stats.prefetch++;
          running--;
          next();
        });
      }
      if (running === 0 && queue.length === 0) this.prefetchRunning = false;
    };
    next();
  }
}
