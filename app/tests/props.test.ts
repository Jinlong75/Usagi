import { describe, expect, it, vi } from 'vitest';
import { BackSide, Box3, Mesh, MeshBasicMaterial, Object3D, QuadraticBezierCurve3, TubeGeometry, Vector3 } from 'three';
import { createProp, PILLOW_CENTER, PILLOW_SIZE, PROP_COLORS, PropRig, ROPE_RADIUS, ROPE_SPAN, WAND_GRIP, WAND_RING } from '../src/renderer/props';
import { BUBBLE_BLOWS, caughtSnackPose, MOTION_SECONDS, neutralPose, ROPE_APEX, ROPE_PERIOD, ROPE_START, sampleMotion } from '../src/renderer/motion';
import { frameBounds } from '../src/renderer/motion/framing';

describe('道具几何、驱动与释放', () => {
  it.each(['handles', 'rope', 'wand', 'bubble', 'pillow', 'riceball', 'rice', 'watermelon', 'iceCream', 'iceDrop', 'cookie'] as const)('%s 使用限定平涂与 3.5%% 反壳描边，所有 geometry/material 恰好释放一次', name => {
    const prop = createProp(name);
    const geometries = new Set<import('three').BufferGeometry>();
    const materials = new Set<MeshBasicMaterial>();
    prop.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const material = object.material as MeshBasicMaterial; materials.add(material);
      expect(Object.values(PROP_COLORS)).toContain(`#${material.color.getHexString()}`);
      expect(material.toneMapped).toBe(false);
      if (name === 'bubble' && material.side !== BackSide) {
        expect(material.opacity).toBe(object === prop.group.children[0]!.children[0] ? 0.45 : 0.95);
        expect(material.depthWrite).toBe(true);
      }
      if (material.side === BackSide) {
        expect(object.scale.toArray()).toEqual([1.035, 1.035, 1.035]);
        expect(material.color.getHexString()).toBe('2b1a14');
      }
    });
    expect(geometries.size).toBeGreaterThan(0);
    const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    prop.apply({ name, position: [0.1, 0.2, 0.3], rotation: [0.2, 0, 0], scale: [2, 3, 4], opacity: 0.3, visible: false });
    expect(prop.group.position.toArray()).toEqual([0.1, 0.2, 0.3]);
    expect(prop.group.rotation.x).toBe(0.2); expect(prop.group.scale.toArray()).toEqual([2, 3, 4]);
    expect(prop.group.visible).toBe(false); materials.forEach(material => expect(material.opacity).toBe(0.3));
    prop.dispose(); prop.dispose(); spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });
  it('换动作、隐藏和 reload 释放旧道具，按 H 和模型脚底定位，不残留 Group', () => {
    const root = new Object3D(); root.position.set(3, 4, 5); root.updateMatrixWorld(true);
    const props = new PropRig(root, 2, new Box3(new Vector3(2, 4, 4), new Vector3(4, 6, 6)));
    props.apply(sampleMotion('napPillow', 2).props);
    const pillow = root.getObjectByName('prop:pillow')!;
    const mesh = pillow.children[0]!.children[0] as Mesh;
    const dispose = vi.spyOn(mesh.geometry, 'dispose');
    expect(pillow.getWorldPosition(new Vector3()).toArray()).toEqual([3, 4.12, 5.59]);
    props.apply(sampleMotion('jumpRope', 2).props);
    expect(dispose).toHaveBeenCalledOnce(); expect(root.getObjectByName('prop:pillow')).toBeUndefined();
    expect(root.getObjectByName('prop:rope')).toBeDefined();
    props.apply(); expect(root.children[0]!.children).toHaveLength(0);
    props.dispose(); expect(root.children).toHaveLength(0);
  });
  it('绳是手柄间下垂 0.42H 的二次曲线；棒杆接右手且全在嘴侧；软枕为圆角长方体', () => {
    const rope = createProp('rope');
    const mesh = rope.group.children[0]!.children[0] as Mesh<import('three').TubeGeometry>;
    const curve = mesh.geometry.parameters.path;
    expect(curve.getPoint(0).toArray()).toEqual([-ROPE_SPAN, 0, 0]);
    expect(curve.getPoint(1).toArray()).toEqual([ROPE_SPAN, 0, 0]);
    expect(curve.getPoint(0.5).toArray()).toEqual([0, -ROPE_RADIUS, 0]);
    expect(ROPE_RADIUS).toBeGreaterThanOrEqual(0.35); expect(ROPE_RADIUS).toBeLessThanOrEqual(0.5);
    const wand = createProp('wand'); wand.apply(sampleMotion('blowBubbles', 1.25).props!.wand!);
    wand.group.updateMatrixWorld(true);
    const shaft = wand.group.children[1]!;
    const cylinder = (shaft.children[0] as Mesh<import('three').CylinderGeometry>).geometry;
    const grip = shaft.localToWorld(new Vector3(0, -cylinder.parameters.height / 2, 0));
    expect(grip.distanceTo(new Vector3(...WAND_GRIP))).toBeLessThan(1e-6);
    expect(WAND_RING[0] + 0.04).toBeLessThan(-0.055); // whole ring clears the ω mouth
    expect(new Box3().setFromObject(wand.group).max.x).toBeLessThan(-0.055);
    const pillow = createProp('pillow');
    const box = new Box3().setFromObject(pillow.group);
    const size = box.getSize(new Vector3());
    PILLOW_SIZE.forEach((value, i) => expect(size.getComponent(i)).toBeCloseTo(value * 1.035, 5));
    expect(PILLOW_SIZE[1] / PILLOW_SIZE[0]).toBeCloseTo(0.4);
    expect(PILLOW_CENTER[1] + size.y / 2).toBeLessThan(0.27 - (0.35532 - 0.24984));
    expect(PROP_COLORS.pillow).toBe('#f6c9d3');
    for (const prop of [rope, wand, pillow]) prop.dispose();
  });
  it('像素证据比较真实合成帧，透明泡泡也能检查，测量后恢复显隐与画面', () => {
    const root = new Object3D(); const props = new PropRig(root, 1, new Box3(new Vector3(), new Vector3(1, 1, 1)));
    props.apply({ a: { name: 'bubble', position: [0, 0, 0] }, b: { name: 'wand', position: [0, 0, 0] } });
    const render = vi.fn(() => new Uint8Array([root.getObjectByName('prop:bubble')!.visible ? 10 : 0,
      root.getObjectByName('prop:wand')!.visible ? 20 : 0, 0, 100, 0, 0, 0, 0]));
    expect(props.visiblePixelRatios(render)).toEqual({ bubble: 0.5, wand: 0.5 });
    expect(root.getObjectByName('prop:bubble')!.visible).toBe(true);
    expect(render).toHaveBeenCalledTimes(4);
    props.dispose();
  });
  it('上翻绳弧复用顶点缓冲、端点仍在握柄处，脚下帧完整恢复原 U 弧', () => {
    const prop = createProp('rope');
    const mesh = prop.group.children[0]!.children[0] as Mesh<import('three').TubeGeometry>;
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position!;
    const original = positions.array.slice();
    const baseline = new TubeGeometry(new QuadraticBezierCurve3(new Vector3(-ROPE_SPAN, 0, 0),
      new Vector3(0, -2 * ROPE_RADIUS, 0), new Vector3(ROPE_SPAN, 0, 0)), 64, 0.004, 8, false);
    expect(original).toEqual(baseline.attributes.position!.array);
    baseline.dispose();
    const dispose = vi.spyOn(geometry, 'dispose');
    const overhead = sampleMotion('jumpRope', ROPE_START + ROPE_APEX + ROPE_PERIOD / 2).props!.rope!;
    expect(overhead.ropeOpen).toBe(1);
    prop.apply(overhead);
    expect(mesh.geometry).toBe(geometry);
    expect(geometry.attributes.position).toBe(positions);
    expect(positions.array).not.toEqual(original);
    expect(geometry.parameters.path.getPoint(0).x).toBe(-ROPE_SPAN);
    expect(geometry.parameters.path.getPoint(1).x).toBe(ROPE_SPAN);
    expect(dispose).not.toHaveBeenCalled();
    prop.apply(sampleMotion('jumpRope', 2.575).props!.rope!);
    expect(prop.group.scale.toArray()).toEqual([1, 1, 1]);
    expect(positions.array).toEqual(original);
    expect(geometry.parameters.path.getPoint(0.5).y).toBe(-ROPE_RADIUS);
    prop.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('三种互动动作', () => {
  it.each(['jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'] as const)('%s 有限片段首尾 neutral 且没有可见道具', name => {
    for (const t of [0, MOTION_SECONDS[name], MOTION_SECONDS[name] + 1]) expect(sampleMotion(name, t)).toEqual(neutralPose());
  });
  it('六圈绳最低点恰在腾空顶点 0.06H，包含落地压缩与结束 happy 半秒', () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      const t = ROPE_START + cycle * ROPE_PERIOD + ROPE_APEX;
      const pose = sampleMotion('jumpRope', t);
      const angle = pose.props!.rope!.rotation![0];
      expect(Math.cos(angle)).toBeCloseTo(1);
      expect(pose.position[1]).toBeGreaterThan(0.03); expect(pose.position[1]).toBeCloseTo(0.06);
      expect(sampleMotion('jumpRope', t, { modelHeight: 2 }).position[1]).toBeCloseTo(0.12);
      const landed = sampleMotion('jumpRope', ROPE_START + cycle * ROPE_PERIOD + 0.46);
      expect(landed.position[1]).toBe(0); expect(landed.scale[1]).toBeCloseTo(0.85);
    }
    for (let cycle = 0; cycle < 6; cycle++) expect(sampleMotion('jumpRope', ROPE_START + cycle * ROPE_PERIOD + 0.59).position[1]).toBe(0);
    // Smoke freezes the third flight apex with the U below the feet, clear of the face.
    expect(Math.cos(sampleMotion('jumpRope', 2.575).props!.rope!.rotation![0])).toBeCloseTo(1);
    for (const t of [0.5, 1.1, 5, 6]) expect(sampleMotion('jumpRope', t).props!.rope!.rotation![0]).toBe(0);
    expect(sampleMotion('jumpRope', 4.81).expressions.happy).toBe(1);
    expect(sampleMotion('jumpRope', 5.29).expressions.happy).toBe(1);
    expect(sampleMotion('jumpRope', 5.31).expressions.happy).toBeUndefined();
  });
  it('每次吹气 0.4 秒有 ou，两个批次各三个，存活 1.5 秒后彻底消失', () => {
    for (const start of BUBBLE_BLOWS) {
      const pose = sampleMotion('blowBubbles', start + 0.35);
      const bubbles = Object.values(pose.props!).filter(prop => prop.name === 'bubble');
      expect(bubbles).toHaveLength(3); expect(pose.expressions.ou).toBe(1);
      expect(sampleMotion('blowBubbles', start + 0.41).expressions.ou).toBeUndefined();
      bubbles.forEach(bubble => { expect(bubble.scale![0]).toBeGreaterThan(0); expect(bubble.scale![0]).toBeLessThanOrEqual(0.03); });
      bubbles.forEach(bubble => { expect(bubble.position[0]).toBeLessThan(WAND_RING[0]); expect(bubble.position[1]).toBeGreaterThan(WAND_RING[1]); });
      const before = sampleMotion('blowBubbles', start + 1.79).props!;
      const after = sampleMotion('blowBubbles', start + 1.81).props!;
      expect(Object.values(before).filter(prop => prop.name === 'bubble')).toHaveLength(1);
      expect(Object.values(after).filter(prop => prop.name === 'bubble')).toHaveLength(0);
    }
  });
  it('napPillow 无限循环连续，2 秒下点 0.12rad，4 秒回，呼吸幅度双倍', () => {
    for (const cycle of [0, 1, 1000, 1_000_000]) {
      expect(sampleMotion('napPillow', cycle * 4, { loop: true })).toEqual(sampleMotion('napPillow', 0, { loop: true }));
      const before = sampleMotion('napPillow', cycle * 4 + 3.999999, { loop: true });
      const after = sampleMotion('napPillow', cycle * 4 + 4.000001, { loop: true });
      expect(before.props).toEqual(after.props); expect(before.expressions).toEqual({ relaxed: 1 });
      expect(Math.abs(before.bones.head![0] - after.bones.head![0])).toBeLessThan(1e-6);
      expect(Math.abs(before.bones.chest![0] - after.bones.chest![0])).toBeLessThan(1e-6);
    }
    expect(sampleMotion('napPillow', 2, { loop: true }).bones.head![0]).toBeCloseTo(0.12);
    expect(sampleMotion('napPillow', 2, { loop: true }).bones.head![2]).toBeCloseTo(10 * Math.PI / 180);
    expect(sampleMotion('napPillow', 1, { loop: true }).bones.chest![0]).toBeCloseTo(0.07);
  });
  it('取景包含完整绳旋转和所有漂浮泡泡的包围盒，缩放窗口也保留边距', () => {
    const neutral = new Box3(new Vector3(-0.35, 0, -0.3), new Vector3(0.35, 1, 0.3));
    const root = new Object3D(); const props = new PropRig(root, 1, neutral);
    const bounds: Box3[] = [];
    for (const name of ['jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'] as const) {
      for (let t = 0.025; t < MOTION_SECONDS[name]; t += 0.025) {
        const pose = sampleMotion(name, t); props.apply(pose.props);
        root.position.set(...pose.position); root.scale.set(...pose.scale);
        bounds.push(new Box3().setFromObject(root, true));
      }
    }
    for (const aspect of [0.4, 320 / 420, 2]) {
      const frame = frameBounds(neutral, bounds, aspect);
      expect(bounds.every(box => box.min.x > frame.left && box.max.x < frame.right && box.min.y > frame.bottom && box.max.y < frame.top)).toBe(true);
    }
    props.dispose();
  });
});


describe('进食节奏与几何形变', () => {
  it('饭团三口 1→0.65→0.3→消失，每口 aa 0.25 秒然后 sad 0.9 秒、咀嚼两压', () => {
    for (const [i, start] of [0.6, 1.75, 2.9].entries()) {
      expect(sampleMotion('eatRiceball', start + 0.1).props!.riceball!.scale![0]).toBeCloseTo([1, 0.65, 0.3][i]!);
      expect(sampleMotion('eatRiceball', start + 0.249).expressions).toEqual({ aa: 1 });
      expect(sampleMotion('eatRiceball', start + 0.251).expressions).toEqual({ sad: 1 });
      expect(sampleMotion('eatRiceball', start + 1.149).expressions).toEqual({ sad: 1 });
      for (const offset of [0.25 + 0.225, 0.25 + 0.675]) expect(sampleMotion('eatRiceball', start + offset).scale[1]).toBeCloseTo(0.97);
    }
    const crumbs = sampleMotion('eatRiceball', 3.16).props!;
    expect(crumbs.riceball).toBeUndefined(); expect(Object.keys(crumbs)).toHaveLength(4);
    expect(Object.values(crumbs).every(prop => prop.name === 'rice')).toBe(true);
    expect(sampleMotion('eatRiceball', 3.7).props!['rice-0']!.position[1]).toBeLessThan(crumbs['rice-0']!.position[1]);
    expect(sampleMotion('eatRiceball', 4).props).toEqual({});
    expect(sampleMotion('eatRiceball', 5.2).expressions).toEqual({ happy: 1 });
    expect(sampleMotion('eatRiceball', 5.275).position[1]).toBeCloseTo(0.04);
  });
  it('西瓜弧边朝下，左、右、中啃后切口下移，吃完只剩绿皮', () => {
    const prop = createProp('watermelon');
    const flesh = prop.group.children[2]!;
    const geometry = (flesh.children[0] as Mesh).geometry;
    const original = geometry.attributes.position!.array.slice();
    const flatY = -0.045;
    for (let i = 0; i < geometry.attributes.position!.count; i++) {
      expect(geometry.attributes.position!.getY(i)).toBeLessThanOrEqual(flatY + 1e-8);
    }
    const rindPositions = (prop.group.children[0]!.children[0] as Mesh).geometry.attributes.position!;
    for (let i = 0; i < rindPositions.count; i++) {
      expect(rindPositions.getY(i)).toBeLessThanOrEqual(flatY + 1e-8);
      expect(Math.hypot(rindPositions.getX(i), rindPositions.getY(i) - flatY)).toBeGreaterThanOrEqual(0.093 - 1e-8);
    }
    const seeds = prop.group.children.slice(3);
    expect(seeds).toHaveLength(5);
    for (const seed of seeds) {
      const { x, y } = seed.position;
      expect(Math.hypot(Math.abs(x) + 0.003, y - flatY - 0.007)).toBeLessThan(0.085);
      expect(y + 0.007).toBeLessThan(flatY);
    }
    let previous = Infinity;
    for (const [i, time] of [0.7, 1, 2.2, 3.4].entries()) {
      const state = sampleMotion('eatWatermelon', time).props!.watermelon!;
      expect(state.foodRemaining).toBe([1, 0.72, 0.44, 0][i]);
      prop.apply(state);
      prop.group.updateMatrixWorld(true);
      const box = new Box3().setFromObject(flesh.children[0]!, true);
      expect(box.min.y - state.position[1]).toBeCloseTo(-0.13);
      expect(box.max.y - state.position[1]).toBeCloseTo(flatY - 0.085 * (1 - state.foodRemaining!));
      for (const seed of seeds) expect(seed.visible).toBe(state.foodRemaining! > 0 && seed.position.y + 0.007 <= flatY - 0.085 * (1 - state.foodRemaining!));
      expect(box.getSize(new Vector3()).y).toBeLessThan(previous); previous = box.getSize(new Vector3()).y;
    }
    expect(prop.group.children.map(part => part.visible)).toEqual([true, false, false, false, false, false, false, false]);
    prop.apply({ name: 'watermelon', position: [0, 0, 0], foodRemaining: 0.5 });
    prop.group.updateMatrixWorld(true);
    const halfBox = new Box3().setFromObject(flesh.children[0]!, true);
    expect(halfBox.min.y).toBeCloseTo(-0.13);
    expect(halfBox.max.y).toBeCloseTo(-0.0875);
    expect(seeds.map(seed => seed.visible)).toEqual([false, true, true, true, false]);
    prop.apply({ name: 'watermelon', position: [0, 0, 0], foodRemaining: 1 });
    expect(geometry.attributes.position!.array).toEqual(original);
    expect(prop.group.children.every(part => part.visible)).toBe(true);
    expect(sampleMotion('eatWatermelon', 0.7).bones.head![2]).toBe(-0.1);
    expect(sampleMotion('eatWatermelon', 1.9).bones.head![2]).toBe(0.1);
    expect(sampleMotion('eatWatermelon', 3.1).bones.head![2]).toBe(0);
    for (const t of [0.7, 1.9, 3.1]) expect(sampleMotion('eatWatermelon', t).expressions).toEqual({ aa: 1 });
    expect(sampleMotion('eatWatermelon', 4.1).expressions).toEqual({ happy: 1 });
    prop.dispose();
  });
  it('冰淇淋四次 ih 各 0.4 秒，第三次结束才滴落，0.8 秒内缩小消失；惊讶 0.6 秒', () => {
    for (const start of [0.6, 1.4, 2.2, 3.6]) {
      for (const age of [0.001, 0.2, 0.399]) expect(sampleMotion('iceCream', start + age).expressions.ih).toBe(1);
    }
    expect(sampleMotion('iceCream', 2.599).props!.iceDrop).toBeUndefined();
    const drop = sampleMotion('iceCream', 2.601).props!.iceDrop!;
    expect(drop.name).toBe('iceDrop');
    const falling = sampleMotion('iceCream', 3.39).props!.iceDrop!;
    expect(falling.position[1]).toBeLessThan(drop.position[1]); expect(falling.scale![0]).toBeLessThan(drop.scale![0]);
    expect(sampleMotion('iceCream', 3.401).props!.iceDrop).toBeUndefined();
    expect(sampleMotion('iceCream', 2.601).expressions).toEqual({ surprised: 1 });
    expect(sampleMotion('iceCream', 3.199).expressions).toEqual({ surprised: 1 });
    expect(sampleMotion('iceCream', 3.201).expressions.surprised).toBeUndefined();
    expect(sampleMotion('iceCream', 4.5).expressions).toEqual({ happy: 1 });
  });
  it('偷看左右各 0.5 秒、两口 aa/sad，所有食物动作上臂不超过 0.32rad 且保持圆眼', () => {
    expect(sampleMotion('sneakSnack', 0.45).bones.head![1]).toBeCloseTo(-0.25);
    expect(sampleMotion('sneakSnack', 0.95).bones.head![1]).toBeCloseTo(0.25);
    for (const start of [1.5, 2.2]) {
      expect(sampleMotion('sneakSnack', start + 0.1).expressions).toEqual({ aa: 1 });
      expect(sampleMotion('sneakSnack', start + 0.3).expressions).toEqual({ sad: 1 });
    }
    for (const name of ['eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'] as const) {
      for (let t = 0.01; t < MOTION_SECONDS[name]; t += 0.01) {
        const pose = sampleMotion(name, t); expect(pose.roundEyes).toBe(true);
        for (const bone of ['leftUpperArm', 'rightUpperArm'] as const) expect(Math.hypot(...pose.bones[bone]!)).toBeLessThanOrEqual(0.32);
        expect(pose.expressions.relaxed).toBeUndefined(); expect(pose.expressions.blink).toBeUndefined();
      }
    }
  });
});

it('被抓住的姿态固定在点击瞬间，饼干缩到身后并隐藏、立即回收，嘴切 surprised', () => {
  const root = new Object3D(); const props = new PropRig(root, 1, new Box3(new Vector3(), new Vector3(1, 1, 1)));
  const chewing = sampleMotion('sneakSnack', 1.9);
  props.apply(chewing.props);
  const cookie = root.getObjectByName('prop:cookie')!;
  const dispose = vi.spyOn((cookie.children[0]!.children[0] as Mesh).geometry, 'dispose');
  const caught = caughtSnackPose(1.9);
  expect(caught.position).toEqual(chewing.position); expect(caught.scale).toEqual(chewing.scale); expect(caught.bones).toEqual(chewing.bones);
  expect(caught.expressions).toEqual({ surprised: 1 }); expect(caught.roundEyes).toBe(true);
  expect(caught.props!.cookie).toMatchObject({ visible: false, scale: [0, 0, 0] });
  expect(caught.props!.cookie!.position[2]).toBeLessThan(0);
  props.apply(caught.props); expect(dispose).toHaveBeenCalledOnce(); expect(root.getObjectByName('prop:cookie')).toBeUndefined();
  props.dispose();
});
