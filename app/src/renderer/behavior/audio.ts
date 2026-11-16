import type { SoundUse } from '../../shared/types';

/** One channel, including async read/decode: stale replies can never revive an interrupted sound. */
export class PetAudio {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private generation = 0;
  constructor(private load: (use: SoundUse) => Promise<ArrayBuffer | null>, private volume = () => 0.7) {}
  async unlock(): Promise<void> {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  stop(): void { this.generation++; this.source?.stop(); this.source = undefined; }
  async play(use: SoundUse): Promise<void> {
    this.stop();
    const generation = this.generation;
    try {
      await this.unlock();
      const bytes = await this.load(use);
      if (!bytes || generation !== this.generation) return;
      const buffer = await this.context!.decodeAudioData(bytes.slice(0));
      if (generation !== this.generation) return;
      const gain = this.context!.createGain(); gain.gain.value = this.volume();
      const source = this.context!.createBufferSource(); source.buffer = buffer;
      source.connect(gain); gain.connect(this.context!.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.source === source) this.source = undefined; };
      this.source = source; source.start();
    } catch { /* Audio unavailable: animation and interaction remain usable. */ }
  }
}
