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

/** NativeImage's top-left-origin, four-byte bitmap; any alpha in the top two rows fails. */
export function topRowsTransparent(bitmap: Uint8Array, width: number): boolean {
  if (!Number.isInteger(width) || width <= 0 || bitmap.length < width * 2 * 4) return false;
  for (let index = 3; index < width * 2 * 4; index += 4) if (bitmap[index] !== 0) return false;
  return true;
}
