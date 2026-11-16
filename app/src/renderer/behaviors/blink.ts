import type { VRM } from '@pixiv/three-vrm';

export interface BlinkState { next: number; began: number | null }
export function blinkInterval(random: () => number): number { return 2.5 + Math.min(1, Math.max(0, random())) * 3.5; }
export function createBlink(now = 0, random = Math.random): BlinkState {
  return { next: now + blinkInterval(random), began: null };
}
/** 150ms total: close during the first half, reopen during the second half. */
export function blinkValue(state: BlinkState, now: number, random = Math.random): number {
  if (state.began === null && now >= state.next) state.began = now;
  if (state.began === null) return 0;
  const progress = (now - state.began) / 0.15;
  if (progress >= 1) {
    state.began = null;
    state.next = now + blinkInterval(random);
    return 0;
  }
  return Math.max(0, 1 - Math.abs(2 * progress - 1));
}
export function blink(vrm: VRM, state: BlinkState, elapsed: number): void {
  if (vrm.expressionManager?.getExpression('blink')) {
    vrm.expressionManager.setValue('blink', blinkValue(state, elapsed) >= 0.5 ? 1 : 0);
  }
}
