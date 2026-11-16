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

export interface BitmapRegion { bitmap: Uint8Array; width: number; height: number; region: Rect }
/** Compare normalized crops on a common grid, independent of jump displacement/DPR. */
export function regionDifference(a: BitmapRegion, b: BitmapRegion): number {
  const valid = (image: BitmapRegion) => image.width > 0 && image.height > 0 &&
    image.bitmap.length === image.width * image.height * 4 &&
    Object.values(image.region).every(Number.isFinite) && image.region.width > 0 && image.region.height > 0 &&
    image.region.x >= 0 && image.region.y >= 0 && image.region.x + image.region.width <= 1 && image.region.y + image.region.height <= 1;
  if (!valid(a) || !valid(b)) throw new Error('无效的冒烟像素比较区域');
  const width = Math.max(1, Math.floor(Math.min(a.region.width * a.width, b.region.width * b.width)));
  const height = Math.max(1, Math.floor(Math.min(a.region.height * a.height, b.region.height * b.height)));
  const offset = (image: BitmapRegion, x: number, y: number) => {
    const px = Math.min(image.width - 1, Math.floor((image.region.x + (x + 0.5) / width * image.region.width) * image.width));
    const py = Math.min(image.height - 1, Math.floor((image.region.y + (y + 0.5) / height * image.region.height) * image.height));
    return (py * image.width + px) * 4;
  };
  let changed = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ai = offset(a, x, y), bi = offset(b, x, y);
    if ([0, 1, 2, 3].some(channel => Math.abs(a.bitmap[ai + channel]! - b.bitmap[bi + channel]!) > 16)) changed++;
  }
  return changed / (width * height);
}
