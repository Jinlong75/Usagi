import type { Point, Rect, Size } from './types';

export const SIZES = {
  small: { width: 240, height: 315 },
  medium: { width: 320, height: 420 },
  large: { width: 440, height: 578 },
} as const;

export function windowDimensions(size: Size, aspect = 320 / 420): { width: number; height: number } {
  const width = SIZES[size].width;
  return { width, height: Math.round(width / aspect) };
}

export function initialBounds(size: Size, position: Point | null, primary: Rect, workAreas: Rect[], aspect?: number): Rect {
  const dimensions = aspect === undefined ? SIZES[size] : windowDimensions(size, aspect);
  const fits = position && workAreas.some((area) =>
    position.x >= area.x && position.y >= area.y &&
    position.x + dimensions.width <= area.x + area.width &&
    position.y + dimensions.height <= area.y + area.height);
  return {
    ...dimensions,
    x: fits ? position.x : Math.max(primary.x, primary.x + primary.width - dimensions.width - 40),
    y: fits ? position.y : Math.max(primary.y, primary.y + primary.height - dimensions.height - 40),
  };
}
