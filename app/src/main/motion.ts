import type { MoveRequest, MoveResult, Point, WindowInfo } from '../shared/types';
import { startTickLoop } from './timing';

/** Last safety check against the current display; preserve the requested average speed. */
export function prepareMove(info: WindowInfo, request: MoveRequest):
  { ok: true; request: MoveRequest; distance: number } | { ok: false; reason: string } {
  if (!request || ![request.x, request.y, request.durationMs].every(Number.isFinite) ||
      request.durationMs <= 0 || request.durationMs > 10_000) return { ok: false, reason: 'invalid-target' };
  const minimumX = info.workArea.x + 20;
  const maximumX = info.workArea.x + info.workArea.width - info.bounds.width - 20;
  if (maximumX < minimumX) return { ok: false, reason: 'no-space' };
  const x = Math.round(Math.max(minimumX, Math.min(maximumX, request.x)));
  const requestedDistance = Math.abs(request.x - info.bounds.x);
  const distance = Math.abs(x - info.bounds.x);
  if (!requestedDistance || !distance) return { ok: false, reason: 'invalid-target' };
  const durationMs = request.durationMs * distance / requestedDistance;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return { ok: false, reason: 'invalid-target' };
  return { ok: true, distance,
    request: { x, y: info.bounds.y, durationMs } };
}

export function easeInOut(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * (3 - 2 * t);
}
export interface MotionWindow { getPosition(): number[]; setPosition(x: number, y: number): void }
/** Cancelling clears the only timer and leaves the current native window position untouched. */
export class WindowMotion {
  private stop?: () => void;
  constructor(private window: MotionWindow, private done: (result: MoveResult) => void, private now = () => performance.now()) {}
  cancel(): void { this.stop?.(); this.stop = undefined; }
  move(request: MoveRequest): void {
    this.cancel();
    const [x = 0, y = 0] = this.window.getPosition();
    const origin: Point = { x, y };
    const began = this.now();
    this.stop = startTickLoop(() => {
      const progress = Math.min(1, (this.now() - began) / request.durationMs);
      const eased = easeInOut(progress);
      this.window.setPosition(Math.round(origin.x + (request.x - origin.x) * eased), Math.round(origin.y + (request.y - origin.y) * eased));
      if (progress >= 1) {
        this.cancel();
        const [actualX = origin.x] = this.window.getPosition();
        this.done({ ok: true, distance: Math.abs(actualX - origin.x) });
      }
    });
  }
}
