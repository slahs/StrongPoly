import { DEFAULT_AUDIO } from '../audio/engine';
import type { AudioSettings } from '../audio/engine';

/** Übernimmt gespeicherte Einstellungen, migriert alte Felder (volume → volMaster) und begrenzt Pegel. */
export function migrateSettings(o: Record<string, unknown>): Record<string, unknown> {
  const r = { ...o };
  if (typeof r.volume === 'number' && typeof r.volMaster !== 'number') r.volMaster = r.volume;
  delete r.volume;
  for (const k of ['volMaster', 'volSfx', 'volMusic', 'volAdvisor']) {
    if (k in r) {
      const v = Number(r[k]);
      r[k] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined;
      if (r[k] === undefined) delete r[k];
    }
  }
  return r;
}

export class Settings {
  shadows = true;
  quality: 'low' | 'medium' | 'high' = 'medium';
  /** Lautstärken je Kanal (0..1) */
  volMaster = DEFAULT_AUDIO.master;
  volSfx = DEFAULT_AUDIO.sfx;
  volMusic = DEFAULT_AUDIO.music;
  volAdvisor = DEFAULT_AUDIO.advisor;
  /** Musik an/aus */
  music = DEFAULT_AUDIO.musicOn;
  /** Der Berater spricht seine Hinweise (Text bleibt in jedem Fall lesbar) */
  advisorSpeech = true;
  /** Stummschaltung (Taste M) */
  muted = false;
  edgeScroll = true;
  /** Kantenglättung (wirkt beim nächsten Start) */
  aa = true;
  /** UI-Skalierung 0.8 .. 1.5 */
  uiScale = 1;
  /** Kamera-Scrollgeschwindigkeit (Faktor) */
  scrollSpeed = 1;
  /** Blut bei Gefallenen darstellen (abschaltbar) */
  blood = true;

  constructor() {
    try {
      const raw = localStorage.getItem('strongpoly.settings');
      if (raw) {
        Object.assign(this, migrateSettings(JSON.parse(raw) as Record<string, unknown>));
      }
    } catch {
      /* ignorieren */
    }
  }

  /** Audio-Teil im Format der AudioEngine */
  audio(): AudioSettings {
    return { master: this.volMaster, sfx: this.volSfx, music: this.volMusic, advisor: this.volAdvisor, musicOn: this.music, muted: this.muted };
  }

  save(): void {
    try {
      localStorage.setItem(
        'strongpoly.settings',
        JSON.stringify({
          shadows: this.shadows,
          quality: this.quality,
          volMaster: this.volMaster,
          volSfx: this.volSfx,
          volMusic: this.volMusic,
          volAdvisor: this.volAdvisor,
          music: this.music,
          advisorSpeech: this.advisorSpeech,
          muted: this.muted,
          edgeScroll: this.edgeScroll,
          aa: this.aa,
          uiScale: this.uiScale,
          scrollSpeed: this.scrollSpeed,
          blood: this.blood,
        }),
      );
    } catch {
      /* ignorieren */
    }
  }
}
