import { describe, expect, it } from 'vitest';
import { initialBounds, SIZES, windowDimensions } from '../src/shared/window';

describe('大小档位及工作区位置', () => {
  const primary = { x: 0, y: 25, width: 1440, height: 850 };
  const secondary = { x: -1920, y: 0, width: 1920, height: 1080 };
  it('三档尺寸固定', () => {
    expect(SIZES).toEqual({ small: { width: 240, height: 315 }, medium: { width: 320, height: 420 }, large: { width: 440, height: 578 } });
  });
  it('默认右下角距离工作区边缘 40px', () => {
    expect(initialBounds('medium', null, primary, [primary])).toEqual({ x: 1080, y: 415, width: 320, height: 420 });
  });
  it('恢复合法副屏的负坐标', () => {
    expect(initialBounds('small', { x: -1800, y: 10 }, primary, [primary, secondary])).toMatchObject({ x: -1800, y: 10 });
  });
  it.each([{ x: 1400, y: 100 }, { x: 200, y: 800 }, { x: -1800, y: 10 }, { x: 200, y: 0 }])(
    '屏幕移除或任一边越界回退：%j', (position) => {
      expect(initialBounds('medium', position, primary, [primary])).toMatchObject({ x: 1080, y: 415 });
    },
  );
  it('窗口恰好落在工作区边界时可以恢复', () => {
    expect(initialBounds('medium', { x: 1120, y: 455 }, primary, [primary])).toMatchObject({ x: 1120, y: 455 });
  });
  it('小工作区至少将左上角放在工作区内', () => {
    expect(initialBounds('large', null, { x: 30, y: 20, width: 200, height: 200 }, [])).toMatchObject({ x: 30, y: 20 });
  });
});

it('Usagi 依据动作包围盒纵横比调整三档高度，宽度仍为 240/320/440', () => {
  const aspect = 1.0175;
  expect(windowDimensions('medium', aspect)).toEqual({ width: 320, height: 314 });
  expect(windowDimensions('small', aspect)).toEqual({ width: 240, height: 236 });
  expect(windowDimensions('large', aspect)).toEqual({ width: 440, height: 432 });
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  expect(initialBounds('medium', null, area, [area], aspect)).toEqual({ x: 1080, y: 546, width: 320, height: 314 });
});
