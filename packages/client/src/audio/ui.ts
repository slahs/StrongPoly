import type { Settings } from '../game/settings';
import { h } from '../ui/dom';
import type { AudioEngine } from './index';

/**
 * Optionszeilen für den Ton (Label/Regler-Paare für das zweispaltige `.form`-Raster):
 * Master, Effekte, Musik, Berater, Musik-Schalter, Stumm. Änderungen wirken sofort und werden gespeichert.
 * `onChange` ersetzt das Standardverhalten (Einstellungen speichern + an die Engine geben).
 */
export function audioOptionRows(audio: AudioEngine, st: Settings, onChange?: () => void): HTMLElement[] {
  const apply = (): void => {
    if (onChange) onChange();
    else {
      st.save();
      audio.configure(st.audio());
    }
  };
  const slider = (label: string, key: 'volMaster' | 'volSfx' | 'volMusic' | 'volAdvisor', preview: () => void): HTMLElement[] => {
    const out = h('span', { class: 'crumb', text: `${Math.round(st[key] * 100)} %`, style: 'min-width:42px;text-align:right' });
    const input = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.05',
      value: String(st[key]),
      style: 'flex:1',
      oninput: (e) => {
        st[key] = Number((e.target as HTMLInputElement).value);
        out.textContent = `${Math.round(st[key] * 100)} %`;
        apply();
      },
      onchange: () => preview(),
    });
    return [h('span', { text: label }), h('div', { class: 'row', 'data-nosfx': '1' }, input, out)];
  };
  const check = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement[] => [
    h('span', { text: label }),
    h('input', {
      type: 'checkbox',
      checked: get(),
      onchange: (e) => {
        set((e.target as HTMLInputElement).checked);
        apply();
      },
    }),
  ];
  return [
    ...slider('Lautstärke gesamt', 'volMaster', () => audio.ui('confirm')),
    ...slider('Effekte', 'volSfx', () => audio.play('chop')),
    ...slider('Musik', 'volMusic', () => undefined),
    ...slider('Berater', 'volAdvisor', () => audio.play('gong')),
    ...check('Musik spielen', () => st.music, (v) => (st.music = v)),
    ...check('Stumm (Taste M)', () => st.muted, (v) => (st.muted = v)),
  ];
}
