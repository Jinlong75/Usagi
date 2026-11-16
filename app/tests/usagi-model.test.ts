import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { MotionRig, sampleMotion } from '../src/renderer/motion';
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
  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -1.1;
  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = 1.1;
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
