import type { AudioEngine } from './index';
import { renderAll, renderMusic, renderSfx, renderVoice } from './offline';

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
  };
}
