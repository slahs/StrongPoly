export class Settings {
  shadows = true;
  quality: 'low' | 'medium' | 'high' = 'medium';
  volume = 0.6;
  music = false;
  edgeScroll = true;

  constructor() {
    try {
      const raw = localStorage.getItem('strongpoly.settings');
      if (raw) Object.assign(this, JSON.parse(raw));
    } catch {
      /* ignorieren */
    }
  }
  save(): void {
    try {
      localStorage.setItem('strongpoly.settings', JSON.stringify({ shadows: this.shadows, quality: this.quality, volume: this.volume, music: this.music, edgeScroll: this.edgeScroll }));
    } catch {
      /* ignorieren */
    }
  }
}
