import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Matrix4, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { LIMB, MOTION_SECONDS, MotionRig, ROPE_APEX, ROPE_PERIOD, ROPE_START, sampleMotion } from '../src/renderer/motion';
import type { MotionName, Pose } from '../src/renderer/motion';
import { ICE_LICKS, MELON_BITES, RICE_BITES } from '../src/renderer/motion/food';

const deployed = readFileSync(new URL('../../assets/models/usagi.vrm', import.meta.url));
const jsonSize = deployed.readUInt32LE(12);
const document = JSON.parse(deployed.subarray(20, 20 + jsonSize).toString());
// Keep the deployed geometry, weights and bind matrices. Only GPU materials and
// expressions are omitted; three-vrm drives normalized -> raw bones on the CPU.
async function load(): Promise<VRM> {
  const gltf = structuredClone(document);
  delete gltf.materials; delete gltf.textures; delete gltf.images; delete gltf.samplers;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  delete gltf.extensions.VRMC_vrm.expressions;
  const start = 20 + jsonSize + 8;
  const bytes = deployed.subarray(start);
  const json = Buffer.from(JSON.stringify(gltf).padEnd(Math.ceil(JSON.stringify(gltf).length / 4) * 4, ' '));
  const fixture = Buffer.alloc(12 + 8 + json.length + 8 + bytes.length);
  fixture.writeUInt32LE(0x46546c67, 0); fixture.writeUInt32LE(2, 4); fixture.writeUInt32LE(fixture.length, 8);
  fixture.writeUInt32LE(json.length, 12); fixture.writeUInt32LE(0x4e4f534a, 16); json.copy(fixture, 20);
  fixture.writeUInt32LE(bytes.length, 20 + json.length); fixture.writeUInt32LE(0x004e4942, 24 + json.length);
  bytes.copy(fixture, 28 + json.length);
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const result = await loader.parseAsync(fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength), '');
  const vrm = result.userData.vrm as VRM;
  for (const joint of [...(vrm.springBoneManager?.joints ?? [])]) vrm.springBoneManager!.deleteJoint(joint);
  vrm.update(0);
  return vrm;
}

const tips = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as const;
type Tip = typeof tips[number];
interface Sample { mesh: SkinnedMesh; index: number }

describe('真实 VRM 在 200px 高度的正面四肢投影', () => {
  let vrm: VRM, rig: MotionRig, height: number;
  const samples: Record<Tip, Sample[]> = { leftHand: [], rightHand: [], leftFoot: [], rightFoot: [] };
  beforeAll(async () => {
    vrm = await load(); rig = new MotionRig(vrm);
    const bounds = new Box3().setFromObject(vrm.scene, true);
    height = bounds.getSize(new Vector3()).y;
    const roots = (['leftUpperArm', 'rightUpperArm'] as const).map(name => vrm.humanoid.getRawBoneNode(name)!.getWorldPosition(new Vector3()));
    const hands = (['leftHand', 'rightHand'] as const).map(name => vrm.humanoid.getRawBoneNode(name)!.getWorldPosition(new Vector3()));
    vrm.scene.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      let body = false;
      for (let node: import('three').Object3D | null = object; node; node = node.parent) body ||= node.name.startsWith('Usagi_Body');
      if (!body) return;
      for (let index = 0; index < object.geometry.attributes.position!.count; index++) {
        const p = object.getVertexPosition(index, new Vector3()).applyMatrix4(object.matrixWorld);
        // Freeze independent geometric terminal samples in neutral, as in 030.
        for (const [side, i] of [['left', 0], ['right', 1]] as const) {
          if (Math.sign(p.x) !== Math.sign(hands[i]!.x)) continue;
          const terminal = Math.abs(roots[i]!.x) + 0.75 * Math.abs(hands[i]!.x - roots[i]!.x);
          if (Math.abs(p.x) >= terminal && Math.abs(p.y - roots[i]!.y) < height * 0.055 && Math.abs(p.z) < height * 0.10)
            samples[`${side}Hand`].push({ mesh: object, index });
          if (p.y < bounds.min.y + height * 0.03 && Math.abs(p.x) > height * 0.005 && Math.abs(p.x) < height * 0.14)
            samples[`${side}Foot`].push({ mesh: object, index });
        }
      }
    });
    for (const tip of tips) expect(samples[tip].length, tip).toBeGreaterThan(20);
  });
  function project(pose: Pose): Record<Tip, Vector3[]> {
    rig.reset(); rig.apply(pose); vrm.update(0); vrm.scene.updateMatrixWorld(true);
    // Cancel ALL root translation, roll, yaw and squash before front projection.
    const inverseRoot = new Matrix4().copy(vrm.scene.matrixWorld).invert();
    return Object.fromEntries(tips.map(tip => {
      const vertices = samples[tip].map(({ mesh, index }) => {
        const p = mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseRoot).multiplyScalar(200 / height);
        p.z = 0; return p;
      });
      return [tip, vertices];
    })) as Record<Tip, Vector3[]>;
  }
  it('walk 一个完整步伐周期：左右手端和脚端正面位移各自至少 3px（扣除根运动）', () => {
    const frames = Array.from({ length: 65 }, (_, i) => project(sampleMotion('walk', 0.7, { distance: i / 64 * 90 })));
    const pixels = Object.fromEntries(tips.map(tip => {
      // Peak-to-peak of a fixed terminal vertex, using 030's maximum terminal
      // displacement convention; never pair different vertices across frames.
      let maximum = 0;
      for (const a of frames) for (const b of frames) a[tip].forEach((point, i) => { maximum = Math.max(maximum, point.distanceTo(b[tip][i]!)); });
      return [tip, maximum];
    }));
    console.log(JSON.stringify({ limbMotion: { heightPx: 200, walkPeakToPeakPx: pixels, samples: Object.fromEntries(tips.map(tip => [tip, samples[tip].length])) } }));
    for (const tip of tips) expect(pixels[tip], tip).toBeGreaterThanOrEqual(3);
    const pose = sampleMotion('walk', 0.7, { distance: 22.5 });
    const standard = project(pose);
    const moved = project({ ...pose, position: [2, 3, -4], rotation: [0.3, 0.7, -0.5], scale: [1.2, 0.8, 1.3] });
    for (const tip of tips) moved[tip].forEach((point, i) => expect(point.distanceTo(standard[tip][i]!), tip).toBeLessThan(1e-4));
  });
  it.each(['jump', 'happy'] as const)('%s 腾空峰值手端比起跳前高至少 4px（扣除根运动）', name => {
    const rest = project(sampleMotion(name, 0));
    const apex = project(sampleMotion(name, 0.175));
    const rise = Object.fromEntries((['leftHand', 'rightHand'] as const).map(tip => [tip,
      Math.max(...apex[tip].map((point, i) => point.y - rest[tip][i]!.y))]));
    console.log(JSON.stringify({ limbMotion: { name, handRisePx: rise } }));
    expect(rise.leftHand).toBeGreaterThanOrEqual(4); expect(rise.rightHand).toBeGreaterThanOrEqual(4);
  });
  it.each(Object.keys(MOTION_SECONDS) as MotionName[])('%s 结束切到 idle 后所有四肢旋转归零，Hand/Foot 也复位', name => {
    const limbs = ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', ...tips,
      'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'] as const;
    rig.reset(); rig.apply(sampleMotion(name, name === 'jump' || name === 'happy' ? 0.175 : MOTION_SECONDS[name] * 0.37));
    // Hand isn't animated by these clips yet: seed it so reset-list omissions
    // cannot pass merely because the sampler never touched it.
    for (const tip of tips) vrm.humanoid.getNormalizedBoneNode(tip)!.rotation.set(0.1, -0.2, 0.3);
    rig.reset(); rig.apply(sampleMotion(name, MOTION_SECONDS[name]));
    rig.reset(); rig.apply(sampleMotion('idle', 0)); vrm.update(0);
    for (const name of limbs) {
      const r = vrm.humanoid.getNormalizedBoneNode(name)!.rotation;
      expect(Math.max(Math.abs(r.x), Math.abs(r.y), Math.abs(r.z)), name).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('手脚动作节奏与安全角度', () => {
  it('walk 对侧抬手，同侧屈膝和脚尖下垂，落地腿伸直', () => {
    for (const [distance, raised, grounded] of [[22.5, 'left', 'right'], [67.5, 'right', 'left']] as const) {
      const { bones } = sampleMotion('walk', 0.7, { distance });
      expect(bones[`${raised}UpperLeg`]![0]).toBeCloseTo(0.35);
      expect(bones[`${raised}LowerLeg`]![0]).toBeCloseTo(0.30);
      expect(bones[`${raised}Foot`]![0]).toBeCloseTo(-0.20);
      for (const part of ['UpperLeg', 'LowerLeg', 'Foot'] as const) expect(Math.hypot(...bones[`${grounded}${part}`]!)).toBe(0);
      const sign = grounded === 'left' ? 1 : -1;
      expect(bones[`${grounded}UpperArm`]).toEqual([0, 0, sign * 0.25]);
      expect(bones[`${raised}UpperArm`]).toEqual([0, 0, sign * 0.25]);
    }
  });
  it('jump/happy 保持原跳跃相位，两次收腿、落地压手并伸直腿', () => {
    for (const name of ['jump', 'happy'] as const) for (const start of [0, 0.57]) {
      const apex = sampleMotion(name, start + 0.175);
      const w = start === 0 ? (0.175 / 0.18) ** 2 * (3 - 2 * 0.175 / 0.18) : 1;
      expect(apex.bones.leftUpperArm![2]).toBeCloseTo(0.43 * w, 8);
      expect(apex.bones.leftLowerArm![2]).toBeCloseTo(-0.10 * w, 8);
      expect(apex.bones.leftUpperLeg![0]).toBeCloseTo(0.25 * w, 8);
      expect(apex.bones.rightLowerLeg![0]).toBeCloseTo(0.35 * w, 8);
      const crouch = sampleMotion(name, start + 0.46);
      expect(crouch.bones.leftUpperArm![2]).toBeCloseTo(-0.15);
      expect(crouch.bones.leftUpperLeg).toEqual([0, 0, 0]);
      expect(crouch.bones.rightLowerLeg).toEqual([0, 0, 0]);
    }
  });
  it('每口饭团、西瓜、冰淇淋、偷吃均在 0.25s 内抬手再回落，咀嚼 ±0.04', () => {
    for (const [name, starts, chew] of [['eatRiceball', RICE_BITES, 0.9], ['eatWatermelon', MELON_BITES, 0.75],
      ['iceCream', ICE_LICKS, 0.15], ['sneakSnack', [1.5, 2.2], 0.4]] as const) {
      for (const start of starts) {
        expect(sampleMotion(name, start + 0.125).bones.leftUpperArm![2]).toBeCloseTo(0.32);
        expect(sampleMotion(name, start + 0.25).bones.leftUpperArm![2]).toBeCloseTo(0.20);
        expect(sampleMotion(name, start + 0.25 + chew / 4).bones.leftUpperArm![2]).toBeCloseTo(0.24);
        expect(sampleMotion(name, start + 0.25 + chew * 3 / 4).bones.leftUpperArm![2]).toBeCloseTo(0.16);
        expect(sampleMotion(name, start + 0.125).bones.leftUpperLeg).toBeUndefined();
      }
    }
  });
  it('jumpRope 同相画圈跟绳周期，每次腾空收腿，落地伸直', () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      const age = ROPE_START + cycle * ROPE_PERIOD + ROPE_APEX;
      const apex = sampleMotion('jumpRope', age);
      expect(apex.bones.leftUpperArm![0]).toBeCloseTo(0.10, 8);
      expect(apex.bones.leftUpperArm![2]).toBeCloseTo(0.18, 8);
      expect(apex.bones.rightUpperArm![0]).toBeCloseTo(0.10, 8);
      expect(apex.bones.rightUpperArm![2]).toBeCloseTo(-0.18, 8);
      expect(apex.bones.leftUpperLeg![0]).toBeCloseTo(0.25);
      expect(apex.bones.rightLowerLeg![0]).toBeCloseTo(0.35);
      const quarter = sampleMotion('jumpRope', age + ROPE_PERIOD / 4);
      expect(quarter.bones.leftUpperArm![2]).toBeCloseTo(0.28);
      expect(quarter.bones.rightUpperArm![2]).toBeCloseTo(-0.28);
      expect(sampleMotion('jumpRope', age - ROPE_APEX + 0.46).bones.leftUpperLeg).toEqual([0, 0, 0]);
    }
  });
  it('idle/lookAround 呼吸轻摆、surprised 快速举手回落、shake 不加，拖动跟速度', () => {
    for (const name of ['idle', 'lookAround'] as const) {
      expect(sampleMotion(name, 0.875).bones.leftUpperArm![2]).toBeCloseTo(0.04);
      expect(sampleMotion(name, 2.625).bones.rightUpperArm![2]).toBeCloseTo(0.04);
      expect(sampleMotion(name, 0.875).bones.leftUpperLeg).toBeUndefined();
      expect(sampleMotion(name, 1, { breathTime: 2.625 }).bones.leftUpperArm![2]).toBeCloseTo(-0.04);
    }
    expect(sampleMotion('surprised', 0.18).bones.leftUpperArm![2]).toBeCloseTo(0.35);
    expect(sampleMotion('surprised', 0.5).bones.leftUpperArm![2]).toBe(0);
    expect(sampleMotion('shake', 0.3).bones.leftUpperArm).toBeUndefined();
    for (const v of [-700, 0, 700]) {
      const { bones } = sampleMotion('drag', 0.5, { velocityX: v });
      expect(bones.leftUpperLeg![0]).toBeCloseTo(0.035 + v / 700 * 0.15);
      expect(bones.rightUpperLeg![0]).toBeCloseTo(-0.035 - v / 700 * 0.15);
    }
  });
  it('所有动作上臂、前臂不超过 031 的 0.43/0.10 rad 上限', () => {
    expect(LIMB.jump.arm).toBeLessThanOrEqual(0.43); expect(Math.abs(LIMB.jump.forearm)).toBeLessThanOrEqual(0.10);
    for (const name of Object.keys(MOTION_SECONDS) as MotionName[]) for (let i = 1; i < 100; i++) {
      const pose = sampleMotion(name, MOTION_SECONDS[name] * i / 100);
      for (const side of ['left', 'right'] as const) {
        expect(Math.hypot(...(pose.bones[`${side}UpperArm`] ?? [0, 0, 0]))).toBeLessThanOrEqual(0.43);
        expect(Math.hypot(...(pose.bones[`${side}LowerArm`] ?? [0, 0, 0]))).toBeLessThanOrEqual(0.10);
      }
    }
  });
});
