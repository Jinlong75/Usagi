import type { Point } from './types';

export interface Gesture { start: Point; startedAt: number; dragged: boolean; threshold: number }
export function beginGesture(start: Point, now: number, width = 320): Gesture {
  return { start, startedAt: now, dragged: false, threshold: 5 * width / 320 };
}
export function updateGesture(gesture: Gesture, point: Point): void {
  if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= gesture.threshold) gesture.dragged = true;
}
export function isClick(gesture: Gesture, point: Point, now: number, lastDragEndedAt = -Infinity): boolean {
  updateGesture(gesture, point);
  return !gesture.dragged && now - gesture.startedAt < 300 && now >= gesture.startedAt && now - lastDragEndedAt >= 150;
}
