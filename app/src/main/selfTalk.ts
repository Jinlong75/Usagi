import type { Config } from '../shared/types';
export const BUILTIN_LINES = ['呀哈！', '乌拉！', '哈？', '噗噜噜噜噜……', '呀哈呀哈！', '乌拉～乌拉～', '哈啊？！', '咿呀～哈～！', '嗯～？', '呀——哈——！'];
export const BUBBLE_DURATION = 3200;
export function talkDelay(minSec: number, maxSec: number, random: () => number, displayMs = 0): number {
  const min = Math.max(5, minSec), max = Math.max(min, maxSec);
  return (min + (max - min) * random()) * 1000 + displayMs;
}
export function chooseLine(lines: string[], previous: string | undefined, random: () => number): string {
  const pool = lines.length ? lines : BUILTIN_LINES;
  const choices = pool.filter(line => line !== previous);
  const available = choices.length ? choices : pool;
  return available[Math.min(available.length - 1, Math.floor(random() * available.length))]!;
}
export interface TalkClock { set(callback: () => void, delay: number): unknown; clear(timer: unknown): void }
export class SelfTalk {
  private timer?: unknown;
  private previous?: string;
  constructor(private options: { config(): Config['selfTalk']; blocked(): boolean; show(text: string, duration: number): void;
    sound(): void; random?: () => number; clock?: TalkClock }) {}
  private get clock(): TalkClock { return this.options.clock ?? { set: (fn, delay) => setTimeout(fn, delay), clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) }; }
  stop(): void { if (this.timer !== undefined) this.clock.clear(this.timer); this.timer = undefined; }
  restart(displayMs = 0): void {
    this.stop(); const config = this.options.config(); if (!config.enabled) return;
    this.timer = this.clock.set(() => {
      this.timer = undefined;
      if (this.options.blocked()) return this.restart();
      const random = this.options.random ?? Math.random;
      this.previous = chooseLine(config.lines, this.previous, random);
      this.options.show(this.previous, BUBBLE_DURATION);
      if (random() < 0.3) this.options.sound();
      this.restart(BUBBLE_DURATION);
    }, talkDelay(config.minSec, config.maxSec, this.options.random ?? Math.random, displayMs));
  }
}
