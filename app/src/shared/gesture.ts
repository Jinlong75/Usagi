import type { Point } from './types';

export interface Gesture { start: Point; startedAt: number; dragged: boolean }
export function beginGesture(start: Point, now: number): Gesture {
  return { start, startedAt: now, dragged: false };
}
export function updateGesture(gesture: Gesture, point: Point): void {
  if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= 4) gesture.dragged = true;
}
export function isClick(gesture: Gesture, point: Point, now: number): boolean {
  updateGesture(gesture, point);
  return !gesture.dragged && now - gesture.startedAt < 300 && now >= gesture.startedAt;
}
