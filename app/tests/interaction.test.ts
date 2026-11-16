import { describe, expect, it } from 'vitest';
import { alphaHit, canvasPixel } from '../src/shared/hit';
import { beginGesture, isClick, updateGesture } from '../src/shared/gesture';

describe('透明像素命中坐标', () => {
  const rect = { x: 10, y: 20, width: 320, height: 420 };
  it('DPR 1：CSS 原点偏移与 WebGL Y 翻转', () => {
    expect(canvasPixel({ x: 10, y: 20 }, rect, 320, 420)).toEqual({ x: 0, y: 419 });
    expect(canvasPixel({ x: 170, y: 230 }, rect, 320, 420)).toEqual({ x: 160, y: 209 });
    expect(canvasPixel({ x: 329.9, y: 439.9 }, rect, 320, 420)).toEqual({ x: 319, y: 0 });
  });
  it('DPR 2：使用真实 backing 尺寸，不重复乘缩放比', () => {
    expect(canvasPixel({ x: 170, y: 230 }, rect, 640, 840)).toEqual({ x: 320, y: 419 });
    expect(canvasPixel({ x: 10.75, y: 20.75 }, rect, 640, 840)).toEqual({ x: 1, y: 838 });
  });
  it('越界点、空画布与非有限坐标不读取像素', () => {
    for (const point of [{ x: 330, y: 20 }, { x: 10, y: 440 }, { x: 9, y: 20 }, { x: 10, y: 19 }, { x: NaN, y: 20 }]) {
      expect(canvasPixel(point, rect, 640, 840)).toBeNull();
    }
    expect(canvasPixel({ x: 10, y: 20 }, { ...rect, width: 0 }, 0, 0)).toBeNull();
  });
  it('alpha 必须严格大于 0.1', () => {
    expect(alphaHit(0)).toBe(false);
    expect(alphaHit(25)).toBe(false);
    expect(alphaHit(26)).toBe(true);
    expect(alphaHit(255)).toBe(true);
  });
});

describe('点击与拖动', () => {
  it('短按且位移小于 4px 才是点击', () => {
    expect(isClick(beginGesture({ x: 100, y: 100 }, 0), { x: 102, y: 102 }, 299)).toBe(true);
    expect(isClick(beginGesture({ x: 100, y: 100 }, 0), { x: 104, y: 100 }, 100)).toBe(false);
    expect(isClick(beginGesture({ x: 100, y: 100 }, 0), { x: 100, y: 100 }, 300)).toBe(false);
  });
  it('拖动后回到起点也不会误触点击', () => {
    const gesture = beginGesture({ x: -200, y: 100 }, 500);
    updateGesture(gesture, { x: -180, y: 100 });
    expect(isClick(gesture, { x: -200, y: 100 }, 600)).toBe(false);
  });
});
