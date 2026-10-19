/** Prozedurale WebAudio-Effekte (wird im Audio-Meilenstein ausgebaut). */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.6;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }
  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  click(): void {}
  alert(): void {}
  fx(_k: string, _x: number, _y: number, _cx: number, _cy: number): void {
    void this.ensure;
  }
}
