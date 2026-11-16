import type { Point, Rect } from './types';

/** CSS/client coordinates -> bottom-left-origin WebGL backing pixels, including DPR. */
export function canvasPixel(point: Point, rect: Rect, bufferWidth: number, bufferHeight: number): Point | null {
  if (rect.width <= 0 || rect.height <= 0 || bufferWidth <= 0 || bufferHeight <= 0 ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < rect.x || point.y < rect.y || point.x >= rect.x + rect.width || point.y >= rect.y + rect.height) return null;
  return {
    x: Math.floor((point.x - rect.x) / rect.width * bufferWidth),
    y: bufferHeight - 1 - Math.floor((point.y - rect.y) / rect.height * bufferHeight),
  };
}
export function alphaHit(alpha: number): boolean { return alpha / 255 > 0.1; }
