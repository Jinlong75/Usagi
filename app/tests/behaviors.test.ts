import { describe, expect, it } from 'vitest';
import { blink, blinkInterval, blinkValue, createBlink } from '../src/renderer/behaviors/blink';
import { breathingAngle } from '../src/renderer/behaviors/breathing';
import { clickPose } from '../src/renderer/behaviors/click';
import { cursorDirection, look } from '../src/renderer/behaviors/look';
import { Object3D, Quaternion } from 'three';
import type { VRM } from '@pixiv/three-vrm';

describe('眨眼时间轴', () => {
  it('注入随机函数可复现 2.5～6s 的间隔', () => {
    for (let index = 0; index <= 100; index++) {
      const interval = blinkInterval(() => index / 100);
      expect(interval).toBeGreaterThanOrEqual(2.5);
      expect(interval).toBeLessThanOrEqual(6);
    }
    expect(createBlink(10, () => 0).next).toBe(12.5);
    expect(createBlink(10, () => 1).next).toBe(16);
  });
  it('150ms 内闭合并张开，然后安排下一次', () => {
    const state = createBlink(0, () => 0);
    expect(blinkValue(state, 2.49, () => 1)).toBe(0);
    expect(blinkValue(state, 2.5, () => 1)).toBe(0);
    expect(blinkValue(state, 2.575, () => 1)).toBeCloseTo(1);
    expect(blinkValue(state, 2.65, () => 1)).toBeCloseTo(0);
    expect(blinkValue(state, 2.66, () => 1)).toBe(0);
    expect(state.next).toBeCloseTo(8.66);
  });
  it('没有 blink 表情时直接跳过', () => {
    const state = createBlink(0, () => 0);
    expect(() => blink({ expressionManager: { getExpression: () => null } } as unknown as VRM, state, 3)).not.toThrow();
    expect(state.began).toBeNull();
  });
});

describe('待机与点击动作', () => {
  it('呼吸 3.5s 循环且幅度很小', () => {
    expect(breathingAngle(0)).toBe(0);
    expect(breathingAngle(0.875)).toBeCloseTo(0.018);
    expect(breathingAngle(3.5)).toBeCloseTo(0);
  });
  it('点击时跳跃、开心 1.2s 后恢复', () => {
    expect(clickPose(-1)).toEqual({ happy: 0, jump: 0 });
    expect(clickPose(0.225)).toEqual({ happy: 1, jump: 0.08 });
    expect(clickPose(0.6)).toEqual({ happy: 1, jump: 0 });
    expect(clickPose(1.2)).toEqual({ happy: 0, jump: 0 });
  });
  it('鼠标方向使用窗口位置，并限制到 [-1,1]', () => {
    const bounds = { x: -320, y: 20, width: 320, height: 420 };
    expect(cursorDirection({ x: -160, y: 230 }, bounds)).toEqual({ x: 0, y: 0 });
    expect(cursorDirection({ x: 9000, y: -1000 }, bounds)).toEqual({ x: 1, y: 1 });
  });
  it('头部平滑旋转不超过 20 度', () => {
    const head = new Object3D();
    const fake = { humanoid: { getNormalizedBoneNode: () => head }, lookAt: {} } as unknown as VRM;
    const target = new Object3D();
    look(fake, target, { x: 1, y: -1 }, 0.016);
    expect(head.rotation.y).toBeGreaterThan(0);
    expect(head.rotation.y).toBeLessThan(Math.PI / 9);
    for (let index = 0; index < 100; index++) look(fake, target, { x: 1, y: -1 }, 0.05);
    expect(head.rotation.y).toBeLessThanOrEqual(Math.PI / 9);
    expect(head.rotation.x).toBeLessThanOrEqual(Math.PI / 9);
    expect(head.quaternion.angleTo(new Quaternion())).toBeLessThanOrEqual(Math.PI / 9);
    expect(fake.lookAt?.target).toBe(target);
  });
});
