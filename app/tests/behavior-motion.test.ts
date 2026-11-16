import { describe, expect, it, vi, afterEach } from 'vitest';
import { Bone, Box3, BoxGeometry, Float32BufferAttribute, Object3D, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
import { EMOTIONS, setEmotion } from '../src/renderer/behaviors/expressions';
import type { MotionName } from '../src/renderer/motion';
import { DragSprings, SPRING_ACCELERATION_COEFFICIENT } from '../src/renderer/motion/springs';
import { renderInterval } from '../src/renderer/behavior/power';
import { prepareMove, WindowMotion } from '../src/main/motion';
import { frameBounds, framingPoses, measureMotionBounds } from '../src/renderer/motion/framing';
import { regionDifference, topRowsTransparent } from '../src/shared/hit';

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
    const hips = vrm.humanoid.getNormalizedBoneNode('hips')!;
    const hipsOrigin = hips.position.clone();
    const changed = sampleMotion(name, name === 'happy' || name === 'jump' ? 0.175 : durations[name] * 0.37);
    expect(changed).not.toEqual(neutralPose());
    rig.apply(changed);
    const hasMotion = !vrm.scene.position.equals(origin) || vrm.scene.rotation.toArray().slice(0, 3).some((n) => n !== 0) ||
      [...bones.values()].some((bone, i) => bone.quaternion.angleTo(baseline[i]!) > 0.001);
    expect(hasMotion).toBe(true);
    for (const t of [0, durations[name], durations[name] + 1]) {
      rig.reset(); rig.apply(sampleMotion(name, t));
      expect(vrm.scene.position.toArray()).toEqual(origin.toArray());
      expect(hips.position.toArray()).toEqual(hipsOrigin.toArray());
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
    expect(sampleMotion('shout', 0.6).expressions).toEqual({ angry: 1 });
    expect(sampleMotion('surprised', 0.5).expressions).toEqual({ surprised: 1 });
    expect(sampleMotion('drag', 0.5).expressions).toEqual({ surprised: 1 });
    expect(Math.abs(sampleMotion('drag', 0.5, { velocityX: 10000 }).rotation[2])).toBeCloseTo(Math.PI / 12);
  });
  it('步态按 45px 一步推进，90px/s 对应平均每秒两步，原生缓动与脚步同相', () => {
    const a = sampleMotion('walk', 0.5, { duration: 3, distance: 22.5 });
    const b = sampleMotion('walk', 0.5, { duration: 3, distance: 67.5 });
    expect(a.bones.leftUpperLeg![0]).toBeCloseTo(0.16);
    expect(b.bones.leftUpperLeg![0]).toBeCloseTo(-0.16);
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
    expect(SPRING_ACCELERATION_COEFFICIENT).toBe(0.00012);
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
  const box = (min: number[], max: number[]) => new Box3(new Vector3(...min), new Vector3(...max));
  const neutral = box([-0.4, 0.2, -0.2], [0.4, 1.8, 0.2]);
  const poses = [box([-0.3, 0.2, -0.4], [0.6, 2.5, 0.4]), // shout's machinery
    box([-0.4, 0.28, -0.2], [0.4, 1.88, 0.2]), // happy apex
    box([-0.7, 0.2, -0.3], [0.6, 2.3, 0.3]), // stretch
    box([-0.9, 0.2, -0.7], [1.1, 1.8, 0.7])]; // spin / drag width
  it.each([240 / 315, 320 / 420, 440 / 578, 0.4, 2])('纵横比 %s：覆盖全部动作并集及四边 4%%，中性脚底在下方 5%%', (aspect) => {
    const originals = [neutral, ...poses].map((pose) => pose.clone());
    const frame = frameBounds(neutral, poses, aspect);
    const union = poses.reduce((bounds, pose) => bounds.union(pose), neutral.clone());
    const size = union.getSize(new Vector3());
    const viewport = box([frame.left, frame.bottom, union.min.z], [frame.right, frame.top, union.max.z]);
    for (const pose of [neutral, ...poses]) expect(viewport.containsBox(pose)).toBe(true);
    expect(frame.top - union.max.y).toBeGreaterThanOrEqual(size.y * 0.04 - 1e-10);
    expect(union.min.y - frame.bottom).toBeGreaterThanOrEqual(size.y * 0.04 - 1e-10);
    expect(union.min.x - frame.left).toBeGreaterThanOrEqual(size.x * 0.04 - 1e-10);
    expect(frame.right - union.max.x).toBeGreaterThanOrEqual(size.x * 0.04 - 1e-10);
    expect((neutral.min.y - frame.bottom) / frame.height).toBeCloseTo(0.05);
    expect(frame.width / frame.height).toBeCloseTo(aspect);
    expect(frame.centerX).toBeCloseTo(0.1); // Center the asymmetric motion range.
    expect([neutral, ...poses]).toEqual(originals);
    expect(jumps(0.175).y).toBeCloseTo(0.1); // happy smoke samples the apex, not a landing.
  });
  it('姿态向脚底以下延伸时，只按需要上移角色且保留顶部和底部边距', () => {
    const low = box([-0.4, -0.5, -0.2], [0.4, 1.8, 0.2]);
    const frame = frameBounds(neutral, [low], 320 / 420);
    const margin = (low.max.y - low.min.y) * 0.04;
    expect(frame.bottom).toBeCloseTo(low.min.y - margin);
    expect(frame.top).toBeGreaterThanOrEqual(low.max.y + margin - 1e-10);
    expect((neutral.min.y - frame.bottom) / frame.height).toBeGreaterThan(0.05);
  });
  it('采样覆盖喊叫、跳跃最高点、伸懒腰、甩头两侧、每 45° 转圈、走路最高点和双向拖动', () => {
    const poses = framingPoses();
    for (const pose of [sampleMotion('shout', 0.55), sampleMotion('happy', 0.175), sampleMotion('stretch', 1.1),
      sampleMotion('shake', 0.3), sampleMotion('shake', 0.42)]) expect(poses).toContainEqual(pose);
    for (let angle = 0; angle < 360; angle += 45) {
      expect(poses.some((pose) => pose.rotation[1] === angle * Math.PI / 180)).toBe(true);
    }
    for (const direction of [-1, 1] as const) {
      expect(poses).toContainEqual(sampleMotion('walk', 0.7, { distance: direction * 22.5 }));
      expect(poses).toContainEqual(sampleMotion('drag', 0.5, { velocityX: direction * 700 }));
    }
  });
  it('读取更新骨骼后的实际顶点而非缓存包围盒，采样完成恢复中性', () => {
    const scene = new Object3D();
    const normalized = new Object3D();
    normalized.rotation.z = -1.1;
    const bone = new Bone();
    bone.position.y = 1;
    bone.rotation.copy(normalized.rotation);
    const geometry = new BoxGeometry(2, 0.2, 0.2).translate(1, 1, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => i % 4 === 0 ? 1 : 0), 4));
    const mesh = new SkinnedMesh(geometry);
    scene.add(mesh, bone);
    mesh.bind(new Skeleton([bone]));
    mesh.computeBoundingBox(); // A stale neutral box must not hide raised vertices.
    const reset = vi.fn();
    const update = vi.fn(() => bone.quaternion.copy(normalized.quaternion));
    const vrm = { scene, humanoid: { getNormalizedBoneNode: (name: string) => name === 'leftUpperArm' ? normalized : null },
      update, springBoneManager: { reset } } as unknown as VRM;
    const rig = new MotionRig(vrm);
    const rotation = normalized.quaternion.clone();
    const result = measureMotionBounds(vrm, rig);
    expect(result.motion.max.y).toBeGreaterThan(result.neutral.max.y + 0.5);
    expect(result.motion.containsBox(result.neutral)).toBe(true);
    expect(normalized.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(bone.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(scene.position.toArray()).toEqual([0, 0, 0]);
    expect(scene.scale.toArray()).toEqual([1, 1, 1]);
    expect(scene.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(new Box3().setFromObject(scene, true)).toEqual(result.neutral);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(framingPoses().length + 2);
    geometry.dispose();
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

it('所有点击/聊天情绪互斥，清掉 relaxed 和口型，不干涉 blink', () => {
  const { vrm, values } = model();
  values.set('blink', 1);
  for (const selected of EMOTIONS) {
    for (const emotion of EMOTIONS) values.set(emotion, 1);
    values.set('aa', 1);
    setEmotion(vrm, selected);
    for (const emotion of EMOTIONS) expect(values.get(emotion)).toBe(emotion === selected ? 1 : 0);
    expect(values.get('aa')).toBe(0);
    expect(values.get('blink')).toBe(1);
  }
  for (const name of ['happy', 'surprised', 'shout', 'drag', 'spin'] as const) {
    for (const age of [0.001, 0.03, 0.175, 0.9]) {
      expect(Object.values(sampleMotion(name, age).expressions).every(value => value === 0 || value === 1)).toBe(true);
    }
  }
});
it('按模型高度跳 10%，落地 XZ 1.08，短腿摇摆大于手臂，伸展上移 Hips', () => {
  expect(sampleMotion('jump', 0.175, { modelHeight: 2 }).position[1]).toBeCloseTo(0.2);
  expect(sampleMotion('happy', 0.46).scale).toEqual([1.08, 0.85, 1.08]);
  const walk = sampleMotion('walk', 0.7, { distance: 22.5 });
  expect(walk.rotation[2]).toBeCloseTo(0.1);
  expect(walk.position[1]).toBeCloseTo(0.028);
  expect(walk.bones.leftUpperArm![0]).toBeCloseTo(-0.025);
  const stretch = sampleMotion('stretch', 1.1);
  expect(stretch.hipsY).toBeCloseTo(0.025);
  expect(stretch.bones.chest![0]).toBeCloseTo(-0.1);
  expect(stretch.bones.leftUpperArm![2] - 1.1).toBeCloseTo(1.5);
});

it('像素比较只看指定区域，跟随脸部位移，透明度和颜色变化都能检出', () => {
  const bitmap = new Uint8Array(10 * 10 * 4);
  const other = bitmap.slice();
  const image = { bitmap, width: 10, height: 10, region: { x: 0, y: 0, width: 1, height: 0.3 } };
  other[(9 * 10) * 4 + 3] = 255;
  expect(regionDifference(image, { ...image, bitmap: other })).toBe(0);
  other[3] = 255;
  expect(regionDifference(image, { ...image, bitmap: other })).toBeCloseTo(1 / 30);
  const shifted = bitmap.slice();
  bitmap[(4 * 10 + 3) * 4] = 255;
  shifted[(2 * 10 + 3) * 4] = 255;
  const face = { ...image, region: { x: 0.2, y: 0.3, width: 0.5, height: 0.4 } };
  const moved = { ...image, bitmap: shifted, region: { ...face.region, y: 0.1 } };
  expect(regionDifference(face, moved)).toBe(0);
  shifted[(2 * 10 + 3) * 4] = 0;
  expect(regionDifference(face, moved)).toBeGreaterThan(0);
  expect(() => regionDifference(image, { ...image, bitmap: new Uint8Array(4) })).toThrow();
});
