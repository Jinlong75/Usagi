import type { MoveRequest, Point } from '../shared/types';

export function easeInOut(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * (3 - 2 * t);
}
export interface MotionWindow { getPosition(): number[]; setPosition(x: number, y: number): void }
/** Cancelling clears the only timer and leaves the current native window position untouched. */
export class WindowMotion {
  private timer?: ReturnType<typeof setInterval>;
  constructor(private window: MotionWindow, private done: () => void, private now = () => performance.now()) {}
  cancel(): void { clearInterval(this.timer); this.timer = undefined; }
  move(request: MoveRequest): void {
    this.cancel();
    const [x = 0, y = 0] = this.window.getPosition();
    const origin: Point = { x, y };
    const began = this.now();
    this.timer = setInterval(() => {
      const progress = Math.min(1, (this.now() - began) / request.durationMs);
      const eased = easeInOut(progress);
      this.window.setPosition(Math.round(origin.x + (request.x - origin.x) * eased), Math.round(origin.y + (request.y - origin.y) * eased));
      if (progress >= 1) { this.cancel(); this.done(); }
    }, 1000 / 60);
  }
}
