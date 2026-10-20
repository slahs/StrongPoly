import type { AudioEngine } from './index';
import { renderAll, renderAmbience, renderAmbientEvent, renderMusic, renderSfx, renderVoice } from './offline';
import { checkClips } from './clips_check';

/**
 * Debug-Hook für Browser-Prüfungen (`window.__audio`):
 *  state()         Kontextstatus, Stimmung, Thema, aktive Stimmen, Zähler gespielter Effekte, Musikstatus
 *  renderAll()     rendert jede Synthese offline und liefert Spitzenpegel/RMS/NaN je Eintrag
 */
export function exposeAudioDebug(audio: AudioEngine): void {
  (window as unknown as Record<string, unknown>).__audio = {
    state: () => audio.state(),
    engine: audio,
    renderAll,
    renderSfx,
    renderVoice,
    renderMusic,
    renderAmbience,
    renderAmbientEvent,
    /** Alle Sprachclips laden, dekodieren und prüfen (Länge, Pegel, NaN); optional nur Stimmen `voices` */
    checkClips: (voices?: string[]) => checkClips(audio, voices),
  };
}
