import { readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { ARM_FOREARM, ARM_RAISE, ARM_REST, MotionRig, sampleMotion } from '../src/renderer/motion';
import { PropRig, ROPE_SPAN, ROPE_PIVOT_Y } from '../src/renderer/props';
import { DragSprings } from '../src/renderer/motion/springs';
import { frameBounds, measureMotionBounds, motionAspect, springEnvelope } from '../src/renderer/motion/framing';

const source = readFileSync(new URL('../../assets/model/usagi.vrm', import.meta.url));
const deployed = readFileSync(new URL('../../assets/models/usagi.vrm', import.meta.url));
const jsonSize = deployed.readUInt32LE(12);
const document = JSON.parse(deployed.subarray(20, 20 + jsonSize).toString());

/** Real geometry, skeleton, constraints, spring joints and colliders, without a GPU/DOM.
 * Only renderer materials and UV expressions are omitted from this in-memory fixture. */
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
  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -ARM_REST;
  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = ARM_REST;
  vrm.update(0);
  return vrm;
}
function ears(vrm: VRM): Vector3[] {
  vrm.scene.updateMatrixWorld(true);
  return ['L', 'R'].map(side => vrm.scene.getObjectByName(`Ear${side}_Tip`)!.getWorldPosition(new Vector3())
    .sub(vrm.scene.getObjectByName(`Ear${side}_1`)!.getWorldPosition(new Vector3())).normalize());
}
function outsideColliders(vrm: VRM): void {
  for (const joint of vrm.springBoneManager!.joints) {
    if (!joint.bone.name.startsWith('Ear') || !joint.child) continue;
    const tail = joint.child.getWorldPosition(new Vector3());
    for (const group of joint.colliderGroups) for (const collider of group.colliders) {
      expect(collider.shape.calculateCollision(collider.colliderMatrix, tail, joint.settings.hitRadius, new Vector3())).toBeGreaterThanOrEqual(-0.0001);
    }
  }
}
const degrees = (a: Vector3[], b: Vector3[]) => Math.max(...a.map((v, i) => v.angleTo(b[i]!) * 180 / Math.PI));

describe('真实 Usagi 资源的无界面验证', () => {
  it('部署模型逐字节等于 011，情绪 UV 表情全为二值且包含碰撞体', () => {
    expect(deployed.equals(source)).toBe(true);
    const presets = document.extensions.VRMC_vrm.expressions.preset;
    for (const name of ['happy', 'angry', 'sad', 'relaxed', 'surprised']) {
      expect(presets[name].isBinary).toBe(true);
      expect(presets[name].textureTransformBinds.length).toBeGreaterThan(0);
      expect(presets[name].overrideBlink).toBe('block');
      expect(presets[name].overrideMouth).toBe('block');
    }
    expect(document.extensions.VRMC_springBone.colliders.length).toBeGreaterThanOrEqual(2);
  });
  it('静止上臂保持原始姿态，模型表面不受蒙皮变形', async () => {
    expect(ARM_REST).toBe(0);
    const vrm = await load();
    for (const bone of ['leftUpperArm', 'rightUpperArm'] as const) {
      expect(Math.abs(vrm.humanoid.getNormalizedBoneNode(bone)!.rotation.z)).toBe(0);
    }
    let maximum = 0, vertices = 0;
    vrm.scene.traverse((object) => {
      const mesh = object as import('three').SkinnedMesh;
      if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.position) return;
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const original = new Vector3().fromBufferAttribute(position, i);
        maximum = Math.max(maximum, original.distanceTo(mesh.getVertexPosition(i, new Vector3())));
        vertices++;
      }
    });
    expect(vertices).toBeGreaterThan(9000);
    expect(maximum).toBeLessThan(1e-6);
  });
  describe('道具的真实模型取景', () => {
    let vrm: VRM, rig: MotionRig, neutral: Box3, height: number;
    let measured: ReturnType<typeof measureMotionBounds>;
    beforeAll(async () => {
      vrm = await load();
      neutral = new Box3().setFromObject(vrm.scene, true);
      height = neutral.getSize(new Vector3()).y;
      rig = new MotionRig(vrm);
      // One immutable reference measurement, reused by the three dense sweeps.
      measured = measureMotionBounds(vrm, rig);
    });
    it('跳绳握柄在真实小手外侧，取景测量后释放道具', () => {
      for (const side of ['leftHand', 'rightHand'] as const) {
        const hand = vrm.humanoid.getRawBoneNode(side)!.getWorldPosition(new Vector3());
        const gap = ROPE_SPAN * height - Math.abs(hand.x);
        expect(gap).toBeGreaterThan(0); expect(gap).toBeLessThan(height * 0.04);
        expect(Math.abs(ROPE_PIVOT_Y * height - hand.y)).toBeLessThan(height * 0.01);
      }
      expect(vrm.scene.getObjectByName('props')).toBeUndefined();
    });
    it.each(['jumpRope', 'blowBubbles', 'napPillow'] as const)('%s 道具进入取景', name => {
      const props = new PropRig(vrm.scene, height, neutral);
      try {
        for (let t = 0.025; t < 5; t += 0.075) {
          props.apply(); rig.reset();
          const pose = sampleMotion(name, t, { modelHeight: height }); rig.apply(pose); props.apply(pose.props);
          vrm.update(0); vrm.scene.updateMatrixWorld(true);
          const box = new Box3().setFromObject(vrm.scene, true);
          // Dense samples supplement the extrema measured at load. A tiny epsilon
          // only absorbs Float32 bone/vertex arithmetic at otherwise equal bounds.
          expect(measured.motion.clone().expandByScalar(height * 0.001).containsBox(box), `${name} at ${t.toFixed(3)}s`).toBe(true);
        }
      } finally { props.dispose(); rig.reset(); vrm.update(0); }
    });
  });
  it.each([['stretch', 1.1], ['shout', 0.55]] as const)('%s 的两只小手向两侧斜上举、伸出身体轮廓，结束后回中性', async (name, age) => {
    const vrm = await load();
    const rig = new MotionRig(vrm);
    const world = (bone: 'leftHand' | 'rightHand' | 'neck', raw = false) =>
      (raw ? vrm.humanoid.getRawBoneNode(bone) : vrm.humanoid.getNormalizedBoneNode(bone))!.getWorldPosition(new Vector3());
    // Body/head silhouette half-width at a given height, measured with both arms hung straight
    // down out of the way so the unchanged Tripo rest arms do not mask the check.
    const arms = (['leftUpperArm', 'rightUpperArm'] as const).map((bone) => vrm.humanoid.getNormalizedBoneNode(bone)!);
    arms[0]!.rotation.z = -1.5; arms[1]!.rotation.z = 1.5;
    vrm.update(0); vrm.scene.updateMatrixWorld(true);
    const points: Vector3[] = [];
    vrm.scene.traverse((object) => {
      const mesh = object as unknown as { isMesh?: boolean; geometry?: { attributes: { position?: { count: number } } };
        getVertexPosition(i: number, v: Vector3): Vector3; matrixWorld: import('three').Matrix4 };
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) points.push(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
    });
    const height = new Box3().setFromPoints(points).getSize(new Vector3()).y;
    points.sort((a, b) => a.y - b.y);
    const size = 2 ** Math.ceil(Math.log2(points.length));
    const widths = new Float64Array(size * 2);
    points.forEach((p, i) => { widths[size + i] = Math.abs(p.x); });
    for (let i = size - 1; i > 0; i--) widths[i] = Math.max(widths[i * 2]!, widths[i * 2 + 1]!);
    const firstIndex = (y: number, after: boolean) => {
      let lo = 0, hi = points.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid]!.y < y || (after && points[mid]!.y === y)) lo = mid + 1; else hi = mid; }
      return lo;
    };
    const halfWidth = (y: number) => {
      let lo = size + firstIndex(y - height * 0.01, true), hi = size + firstIndex(y + height * 0.01, false), maximum = 0;
      if (lo === hi) return Infinity; // No measurable silhouette: never count this as a passing pose.
      while (lo < hi) {
        if (lo & 1) maximum = Math.max(maximum, widths[lo++]!);
        if (hi & 1) maximum = Math.max(maximum, widths[--hi]!);
        lo >>>= 1; hi >>>= 1;
      }
      return maximum;
    };
    arms[0]!.rotation.z = -ARM_REST; arms[1]!.rotation.z = ARM_REST;
    vrm.update(0); vrm.scene.updateMatrixWorld(true);
    const resting = [world('leftHand', true), world('rightHand', true)];
    if (process.env.USAGI_SCAN_ARMS === '1' && name === 'stretch') {
      // Symmetric combinations, angles in radians; shoulders and geometry stay fixed.
      const range = (lo: number, hi: number, step: number) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => +(lo + i * step).toFixed(6));
      rig.reset(); rig.apply(sampleMotion(name, age)); vrm.update(0); vrm.scene.updateMatrixWorld(true);
      const reachable = (['left', 'right'] as const).map(side => {
        const position = (part: 'UpperArm' | 'LowerArm' | 'Hand') => vrm.humanoid.getRawBoneNode(`${side}${part}`)!.getWorldPosition(new Vector3());
        const root = position('UpperArm'), elbow = position('LowerArm'), hand = position('Hand');
        const radius = root.distanceTo(elbow) + elbow.distanceTo(hand);
        const neck = world('neck', true).y;
        const bound = (clearance: number) => {
          // The measured silhouette is constant between vertex-band endpoints.
          // Bound the full reachable sphere in every interval, including endpoints;
          // this covers every arm rotation, even combinations outside the angle grid.
          const lo = Math.max(neck - clearance * height, root.y - radius), hi = root.y + radius;
          const breaks = [...new Set([lo, hi, ...points.flatMap(p => [p.y - height * 0.01, p.y + height * 0.01])
            .filter(y => y > lo && y < hi)])].sort((a, b) => a - b);
          const reach = (y: number) => Math.sqrt(Math.max(0, radius**2 - (y - root.y)**2));
          let maximum = -Infinity;
          for (const [i, a] of breaks.entries()) {
            maximum = Math.max(maximum, (Math.abs(root.x) + reach(a) - halfWidth(a)) / height);
            const b = breaks[i+1];
            if (b !== undefined) maximum = Math.max(maximum,
              (Math.abs(root.x) + reach(Math.max(a, Math.min(b, root.y))) - halfWidth((a+b)/2)) / height);
          }
          return maximum;
        };
        return { side, root: root.toArray(), radius, originalMaxSilhouette: bound(0.02), marginMaxSilhouette: bound(0.015) };
      });
      const scan = (fallback: boolean) => {
        let count = 0, evaluated = 0, bestDistance = Infinity;
        let best: Record<string, unknown> | null = null;
        const xs = fallback ? range(-0.3, 0.3, 0.1) : range(-0.6, 0.6, 0.3);
        const ys = fallback ? range(-0.3, 0.3, 0.1) : range(-1, 1, 0.25);
        const zs = fallback ? range(0.2, 1.2, 0.01) : range(0.2, 1.2, 0.05);
        const lowers = fallback ? range(-0.3, 0.3, 0.05) : range(-1.2, 1.2, 0.3);
        const lowerXs = fallback ? range(-0.3, 0.3, 0.15) : [0];
        for (const x of xs) for (const y of ys) for (const z of zs)
        for (const lowerZ of lowers) for (const lowerY of xs) for (const lowerX of lowerXs) {
          count++;
          const distance = x*x + y*y + (z - 0.75)**2 + lowerZ*lowerZ + lowerY*lowerY + lowerX*lowerX;
          if (distance >= bestDistance) continue;
          evaluated++;
          rig.reset();
          const pose = sampleMotion(name, age);
          pose.bones.leftUpperArm = [x, y, z]; pose.bones.rightUpperArm = [x, -y, -z];
          pose.bones.leftLowerArm = [lowerX, lowerY, lowerZ]; pose.bones.rightLowerArm = [lowerX, -lowerY, -lowerZ];
          rig.apply(pose); vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
          const hands = (['leftHand', 'rightHand'] as const).map(bone => world(bone, true));
          const lift = Math.min(...hands.map((hand, i) => (hand.y - resting[i]!.y) / height));
          const neckClearance = Math.min(...hands.map(hand => (hand.y - world('neck', true).y) / height));
          if (lift <= (fallback ? 0.05 : 0.055) || neckClearance <= (fallback ? -0.04 : -0.015)) continue;
          const silhouette = Math.min(...hands.map(hand => (Math.abs(hand.x) - halfWidth(hand.y)) / height));
          if (silhouette <= (fallback ? 0.025 : 0.030)) continue;
          bestDistance = distance;
          best = { upper: [x, y, z], lower: [lowerX, lowerY, lowerZ], lift, neckClearance, silhouette, distance };
        }
        return { count, evaluated, best, ranges: { upperX: xs, upperY: ys, upperZ: zs, lowerZ: lowers, lowerY: xs, lowerX: fallback ? range(-0.3, 0.3, 0.15) : [0] } };
      };
      const original = scan(false), fallback = original.best ? null : scan(true);
      const report = { reachable, original, fallback, handRotation: 'Hand rotation cannot change the hand joint origin, so it remains zero (nearest to pure raise).' };
      writeFileSync(new URL('../../assets/model/usagi_arm_scan.report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
      process.stdout.write(JSON.stringify(report) + '\n');
      expect(original.best).toBeNull();
      for (const bound of reachable) expect(bound.originalMaxSilhouette).toBeLessThan(0.025);
      expect(fallback?.best).toMatchObject({ upper: [0, 0, ARM_RAISE[name]], lower: [0, 0, ARM_FOREARM] });
    }
    const selected = JSON.parse(readFileSync(new URL('../../assets/model/usagi_arm_scan.report.json', import.meta.url), 'utf8')).fallback.best;
    expect(ARM_RAISE[name]).toBeCloseTo(selected.upper[2]);
    expect(ARM_FOREARM).toBeCloseTo(selected.lower[2]);
    rig.reset();
    rig.apply(sampleMotion(name, age));
    vrm.update(0); vrm.scene.updateMatrixWorld(true);
    for (const [i, bone] of (['leftHand', 'rightHand'] as const).entries()) {
      const hand = world(bone, true);
      process.stdout.write(JSON.stringify({ motion: name, side: i, lift: (hand.y - resting[i]!.y) / height,
        neckClearance: (hand.y - world('neck', true).y) / height,
        silhouette: (Math.abs(hand.x) - halfWidth(hand.y)) / height }) + '\n');
      // Keep the original lift and silhouette requirements on the actual skinned rig.
      expect(hand.y - resting[i]!.y).toBeGreaterThan(height * 0.05);
      // 主导授权：组合扫描原阈值无解，保留抬高和轮廓断言，手高改为 neck−0.04H。
      expect(hand.y).toBeGreaterThan(world('neck', true).y - height * 0.04);
      // Pokes out past the body/head outline at that height, so the front view shows it.
      expect(Math.abs(hand.x) - halfWidth(hand.y)).toBeGreaterThan(height * 0.025);
    }
    rig.reset(); rig.apply(sampleMotion(name, name === 'stretch' ? 2.2 : 1.3));
    vrm.update(0); vrm.scene.updateMatrixWorld(true);
    expect(world('leftHand', true).distanceTo(resting[0]!)).toBeLessThan(1e-6);
    expect(world('rightHand', true).distanceTo(resting[1]!)).toBeLessThan(1e-6);
  });
  it('真实耳链受力反向、甩头可见，释放 1.5s 后回稳，动态范围完整入画', async () => {
    const vrm = await load();
    const rig = new MotionRig(vrm);
    const springs = new DragSprings(vrm);
    const measured = measureMotionBounds(vrm, rig);
    const height = measured.neutral.getSize(new Vector3()).y;
    const envelope = springEnvelope(measured.neutral, measured.motion);
    const aspect = motionAspect(envelope);
    const frame = frameBounds(measured.neutral, [envelope], aspect);
    const viewport = new Box3(new Vector3(frame.left, frame.bottom, -10), new Vector3(frame.right, frame.top, 10));
    for (let i = 0; i < 90; i++) { rig.reset(); vrm.update(1 / 60); }
    const resting = ears(vrm);
    let shake = 0, drag = 0;
    for (let i = 1; i <= 18; i++) {
      rig.reset(); rig.apply(sampleMotion('shake', i / 60, { modelHeight: height })); vrm.update(1 / 60);
      shake = degrees(resting, ears(vrm));
      outsideColliders(vrm);
      expect(viewport.containsBox(new Box3().setFromObject(vrm.scene, true))).toBe(true);
    }
    rig.reset(); vrm.update(0); vrm.springBoneManager!.reset();
    for (let i = 1; i <= 20; i++) {
      rig.reset(); rig.apply(sampleMotion('drag', i / 60, { modelHeight: height, velocityX: 500 }));
      if (i === 15) { springs.sample({ x: 0, y: 0 }, 0); springs.sample({ x: 500, y: 0 }, 100); }
      springs.update(1 / 60, true); vrm.update(1 / 60);
      drag = degrees(resting, ears(vrm));
      outsideColliders(vrm);
      expect(viewport.containsBox(new Box3().setFromObject(vrm.scene, true))).toBe(true);
    }
    expect(ears(vrm).reduce((sum, direction) => sum + direction.x, 0)).toBeLessThan(0); // Velocity +X, ears lag toward -X.
    expect(shake).toBeGreaterThan(5);
    expect(drag).toBeGreaterThan(5);
    springs.restore();
    for (let i = 0; i < 90; i++) { rig.reset(); vrm.update(1 / 60); }
    const settled = degrees(resting, ears(vrm));
    expect(settled).toBeLessThan(2);
    process.stdout.write(JSON.stringify({ usagiPhysics: { shakeDegrees: shake, dragDegrees: drag, settledDegrees: settled, aspect, mediumHeight: Math.round(320 / aspect) } }) + '\n');
  });
});
