import { describe, expect, it, vi, afterEach } from 'vitest';
import { Object3D, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
import type { MotionName } from '../src/renderer/motion';
import { DragSprings, SPRING_ACCELERATION_COEFFICIENT } from '../src/renderer/motion/springs';
import { renderInterval } from '../src/renderer/behavior/power';
import { prepareMove, WindowMotion } from '../src/main/motion';
import { frameSize } from '../src/renderer/motion/framing';
import { topRowsTransparent } from '../src/shared/hit';

function model() {
  const bones = new Map<VRMHumanBoneName, Object3D>();
  const values = new Map<string, number>();
  const vrm = { scene: new Object3D(), humanoid: { getNormalizedBoneNode: (name: VRMHumanBoneName) => {
    if (!bones.has(name)) bones.set(name, new Object3D());
    return bones.get(name)!;
  } }, expressionManager: { getExpression: () => ({}), setValue: (name: string, value: number) => values.set(name, value) } } as unknown as VRM;
  vrm.scene.position.set(0.1, 0.2, 0.3);
  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -1.1;
  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = 1.1;
  return { vrm, bones, values };
}
describe('程序化动作与复位', () => {
  const durations: Record<MotionName, number> = { idle: 3.5, lookAround: 3.5, turn: 0.9, walk: 2, drag: 1.2,
    jump: 1.2, stretch: 2.2, shake: 1.2, spin: 1.8, happy: 1.2, surprised: 1.1, shout: 1.3 };
  it.each(Object.keys(durations) as MotionName[])('%s 有正确时长、中段有动作、两端恢复所有骨骼和根节点', (name) => {
    expect(MOTION_SECONDS[name]).toBe(durations[name]);
    const { vrm, bones, values } = model();
    const rig = new MotionRig(vrm);
    const baseline = [...bones.values()].map((bone) => bone.quaternion.clone());
    const origin = vrm.scene.position.clone();
    const changed = sampleMotion(name, name === 'happy' || name === 'jump' ? 0.175 : durations[name] * 0.37);
    expect(changed).not.toEqual(neutralPose());
    rig.apply(changed);
    const hasMotion = !vrm.scene.position.equals(origin) || vrm.scene.rotation.toArray().slice(0, 3).some((n) => n !== 0) ||
      [...bones.values()].some((bone, i) => bone.quaternion.angleTo(baseline[i]!) > 0.001);
    expect(hasMotion).toBe(true);
    for (const t of [0, durations[name], durations[name] + 1]) {
      rig.reset(); rig.apply(sampleMotion(name, t));
      expect(vrm.scene.position.toArray()).toEqual(origin.toArray());
      expect(vrm.scene.scale.toArray()).toEqual([1, 1, 1]);
      expect(vrm.scene.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      [...bones.values()].forEach((bone, i) => expect(bone.quaternion.angleTo(baseline[i]!)).toBeLessThan(1e-7));
      expect([...values.values()].every((value) => value === 0)).toBe(true);
    }
  });
  it('缺失骨骼与表情安静跳过，连续动作不叠加残留', () => {
    const { vrm } = model();
    vrm.expressionManager!.getExpression = () => null;
    vrm.humanoid.getNormalizedBoneNode = () => null;
    const rig = new MotionRig(vrm);
    expect(() => { rig.apply(sampleMotion('shout', 0.5)); rig.reset(); rig.apply(sampleMotion('idle', 0)); }).not.toThrow();
    expect(vrm.scene.rotation.x).toBe(0);
  });
  it('两次跳跃后的挤压分别持续 220ms；喊叫和惊讶表情权重正确', () => {
    for (const landing of [0.35, 0.92]) {
      expect(jumps(landing).squash).toBeCloseTo(0);
      expect(jumps(landing + 0.11).squash).toBeCloseTo(0.15);
      expect(jumps(landing + 0.22).squash).toBeCloseTo(0);
    }
    expect(sampleMotion('shout', 0.6).expressions).toEqual({ aa: 1, angry: 0.6 });
    expect(sampleMotion('surprised', 0.5).expressions).toEqual({ surprised: 1 });
    expect(sampleMotion('drag', 0.5).expressions).toEqual({ surprised: 0.4 });
    expect(Math.abs(sampleMotion('drag', 0.5, { velocityX: 10000 }).rotation[2])).toBeCloseTo(Math.PI / 12);
  });
  it('步态按 45px 一步推进，90px/s 对应平均每秒两步，原生缓动与脚步同相', () => {
    const a = sampleMotion('walk', 0.5, { duration: 3, distance: 22.5 });
    const b = sampleMotion('walk', 0.5, { duration: 3, distance: 67.5 });
    expect(a.bones.leftUpperLeg![0]).toBeCloseTo(0.3);
    expect(b.bones.leftUpperLeg![0]).toBeCloseTo(-0.3);
    expect(a.position[1]).toBeCloseTo(b.position[1]);
    const p = 0.5 / 3;
    const distance = (p * p * (3 - 2 * p)) * 3 * 90;
    expect(sampleMotion('walk', 0.5, { duration: 3 })).toEqual(sampleMotion('walk', 0.5, { duration: 3, distance }));
  });
});
describe('拖动弹簧受力与省电', () => {
  it('所有 joint 叠加反向加速度，静止一秒内衰减，结束精确恢复原参数', () => {
    const settings = [{ gravityDir: new Vector3(0, -1, 0), gravityPower: 0.2 },
      { gravityDir: new Vector3(0, 0, 1), gravityPower: 0.4 }];
    const vrm = { springBoneManager: { joints: new Set(settings.map((setting) => ({ settings: setting }))) } } as unknown as VRM;
    const original = settings.map((setting) => ({ gravityDir: setting.gravityDir.clone(), gravityPower: setting.gravityPower }));
    const springs = new DragSprings(vrm);
    expect(SPRING_ACCELERATION_COEFFICIENT).toBe(0.00008);
    springs.sample({ x: 0, y: 0 }, 0); springs.sample({ x: 500, y: 0 }, 100); springs.update(0.016, true);
    settings.forEach((setting) => expect(setting.gravityDir.x).toBeLessThan(0));
    for (let i = 0; i < 60; i++) springs.update(1 / 60, true);
    settings.forEach((setting, i) => expect(setting.gravityDir.distanceTo(original[i]!.gravityDir)).toBeLessThan(0.001));
    springs.update(0.016, false);
    expect(settings).toEqual(original);
    expect(() => new DragSprings({} as VRM).update(0.016, true)).not.toThrow();
  });
  it('隐藏不渲染，8 秒后 30fps，任何活动立即恢复', () => {
    expect(renderInterval(7999, 0, false)).toBe(0);
    expect(renderInterval(8000, 0, false)).toBe(1000 / 30);
    expect(renderInterval(10000, 9999, false)).toBe(0);
    expect(renderInterval(10000, 9999, true)).toBe(Infinity);
  });
});
describe('原生窗口移动（假时钟，不启动 Electron）', () => {
  afterEach(() => vi.useRealTimers());
  it('60Hz 缓动完成只通知一次，取消停在当前点；新路线从当前点起步', () => {
    vi.useFakeTimers(); let now = 0; let point = [0, 50];
    const setPosition = vi.fn((x: number, y: number) => { point = [x, y]; });
    const done = vi.fn();
    const motion = new WindowMotion({ getPosition: () => point, setPosition }, done, () => now);
    motion.move({ x: 180, y: 50, durationMs: 2000 });
    now = 500; vi.advanceTimersByTime(500); expect(point).toEqual([28, 50]);
    expect(setPosition.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(setPosition.mock.calls.length).toBeLessThanOrEqual(32);
    motion.cancel(); now = 3000; vi.advanceTimersByTime(2500);
    expect(point).toEqual([28, 50]); expect(done).not.toHaveBeenCalled();
    motion.move({ x: 90, y: 50, durationMs: 1000 });
    now = 3500; vi.advanceTimersByTime(500); expect(point).toEqual([59, 50]);
    now = 4000; vi.advanceTimersByTime(500); expect(point).toEqual([90, 50]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith({ ok: true, distance: 62 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('安全裁剪改变距离时按比例调整时长，保持原请求速度且 Y 不漫游', () => {
    const info = { bounds: { x: 750, y: 90, width: 320, height: 420 },
      workArea: { x: 0, y: 0, width: 1000, height: 800 } };
    expect(prepareMove(info, { x: 690, y: 150, durationMs: 60 / 90 * 1000 })).toEqual({
      ok: true, distance: 90, request: { x: 660, y: 90, durationMs: 1000 },
    });
    expect(prepareMove({ ...info, bounds: { ...info.bounds, x: 600 } },
      { x: 780, y: 90, durationMs: 2000 })).toEqual({
      ok: true, distance: 60, request: { x: 660, y: 90, durationMs: 2000 / 3 },
    });
    expect(prepareMove(info, { x: 600, y: 90, durationMs: NaN })).toEqual({ ok: false, reason: 'invalid-target' });
    expect(prepareMove(info, { x: 750, y: 90, durationMs: 1000 })).toEqual({ ok: false, reason: 'invalid-target' });
    expect(prepareMove({ ...info, workArea: { ...info.workArea, width: 340 } },
      { x: 600, y: 90, durationMs: 1000 })).toEqual({ ok: false, reason: 'no-space' });
  });
});

describe('动作取景与冒烟顶部透明检查', () => {
  it.each([320 / 420, 440 / 578, 0.4, 2])('纵横比 %s：模型顶部至少留高度 18%%、左右各 8%%，脚底在下方 5%%', (aspect) => {
    const size = frameSize(0.8, 1.6, aspect);
    const bottom = -size.height * 0.05;
    expect(bottom / size.height).toBeCloseTo(-0.05);
    expect(bottom + size.height - 1.6).toBeGreaterThanOrEqual(1.6 * 0.18 - 1e-10);
    expect((size.width - 0.8) / 2).toBeGreaterThanOrEqual(0.8 * 0.08 - 1e-10);
    expect(jumps(0.175).y).toBeCloseTo(0.08); // happy smoke samples the apex, not a landing.
  });
  it('只检查最上方两行的 alpha，第二行最后一个像素也不能漏掉', () => {
    const bitmap = new Uint8Array(4 * 4 * 4);
    bitmap[0] = 255; // RGB does not affect transparency.
    bitmap[2 * 4 * 4 + 3] = 255; // Third row may contain the model.
    expect(topRowsTransparent(bitmap, 4)).toBe(true);
    for (let index = 3; index < 2 * 4 * 4; index += 4) {
      bitmap[index] = 1;
      expect(topRowsTransparent(bitmap, 4)).toBe(false);
      bitmap[index] = 0;
    }
    expect(topRowsTransparent(bitmap, 0)).toBe(false);
    expect(topRowsTransparent(bitmap.slice(0, 12), 4)).toBe(false);
  });
});
