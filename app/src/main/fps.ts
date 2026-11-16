import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FPS_LOG_INTERVAL_MS, formatFps } from '../shared/performance';
import type { FpsSample } from '../shared/types';

export class FpsLog {
  private lastWrite = -Infinity;
  constructor(private userData: string, private now = () => performance.now()) {}
  async record(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object') return;
    const sample = value as FpsSample;
    if (!Number.isFinite(sample.fps) || sample.fps <= 0 || sample.fps > 1000 ||
      !Number.isFinite(sample.maxFrameMs) || sample.maxFrameMs <= 0) return;
    const now = this.now();
    // Allow IPC scheduling jitter, while preventing an unbounded stream of writes.
    if (now - this.lastWrite < FPS_LOG_INTERVAL_MS - 500) return;
    this.lastWrite = now;
    const directory = join(this.userData, 'logs');
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, 'fps.log'), `${new Date().toISOString()} ${formatFps(sample)}\n`, 'utf8');
  }
}
