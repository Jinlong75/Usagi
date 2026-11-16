import type { FpsSample } from './types';

// Transparent windows composite the whole backing surface on Windows. At 175%
// scaling the uncapped pixel count is 3.06x; 1.25 keeps it at most 1.56x.
export const WINDOWS_PIXEL_RATIO_LIMIT = 1.25;
export function renderPixelRatio(devicePixelRatio: number, platform: string): number {
  return platform === 'win32' ? Math.min(devicePixelRatio, WINDOWS_PIXEL_RATIO_LIMIT) : devicePixelRatio;
}

export const FPS_WINDOW_MS = 1000;
export const FPS_LOG_INTERVAL_MS = 10_000;
/** Measures rendered frames (after any intentional idle frame skipping), not RAF callbacks. */
export class FrameStats {
  private previous?: number;
  private intervals: { end: number; ms: number }[] = [];
  reset(): void { this.previous = undefined; this.intervals = []; }
  frame(now: number): FpsSample | undefined {
    if (this.previous !== undefined && now > this.previous) this.intervals.push({ end: now, ms: now - this.previous });
    this.previous = now;
    this.intervals = this.intervals.filter(frame => frame.end > now - FPS_WINDOW_MS);
    if (!this.intervals.length) return;
    const duration = this.intervals.reduce((sum, frame) => sum + frame.ms, 0);
    return { fps: this.intervals.length * 1000 / duration, maxFrameMs: Math.max(...this.intervals.map(frame => frame.ms)) };
  }
}
export function formatFps(sample: FpsSample): string {
  return `FPS ${sample.fps.toFixed(1)} · 最长帧 ${sample.maxFrameMs.toFixed(1)} ms`;
}
