import { Euler, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { DURATIONS, SPEED } from '../behavior/machine';
import { setEmotion } from '../behaviors/expressions';
import type { Action, Reaction } from '../behavior/machine';

export type MotionName = 'idle' | 'lookAround' | 'turn' | 'walk' | 'drag' | Action | Reaction;
export type Rotation = [number, number, number];
export interface Pose {
  position: Rotation; rotation: Rotation; scale: Rotation;
  bones: Partial<Record<VRMHumanBoneName, Rotation>>; hipsY?: number; expressions: Record<string, number>;
}
// Translations are fractions of neutral model height; angles are radians.
export const MOTION_SECONDS: Record<MotionName, number> = {
  idle: 3.5, lookAround: 3.5, turn: 0.9, walk: 2, drag: 1.2,
  jump: DURATIONS.jump / 1000, stretch: DURATIONS.stretch / 1000,
  shake: DURATIONS.shake / 1000, spin: DURATIONS.spin / 1000,
  happy: DURATIONS.happy / 1000, surprised: DURATIONS.surprised / 1000, shout: DURATIONS.shout / 1000,
};
export function neutralPose(): Pose {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], bones: {}, expressions: {} };
}
const smooth = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p); };
function envelope(t: number, duration: number, fade = 0.18): number {
  return smooth(t / fade) * smooth((duration - t) / fade);
}
/** Two flights followed by two full 220ms landing compression/recovery pulses. */
export function jumps(t: number, modelHeight = 1): { y: number; squash: number } {
  for (const start of [0, 0.57]) {
    const age = t - start;
    if (age >= 0 && age < 0.35) return { y: Math.sin(Math.PI * age / 0.35) * modelHeight * 0.1, squash: 0 };
    if (age >= 0.35 && age < 0.57) return { y: 0, squash: Math.sin(Math.PI * (age - 0.35) / 0.22) * 0.15 };
  }
  return { y: 0, squash: 0 };
}
export interface MotionOptions { duration?: number; direction?: -1 | 1; velocityX?: number; distance?: number; modelHeight?: number }
/** Pure pose sampling; every finite clip has neutral endpoints, including expressions and root scale. */
export function sampleMotion(name: MotionName, t: number, options: MotionOptions = {}): Pose {
  const pose = neutralPose();
  const duration = options.duration ?? MOTION_SECONDS[name];
  if (t <= 0 || t >= duration) return pose;
  const weight = envelope(t, duration);
  const p = t / duration;
  const height = options.modelHeight ?? 1;
  if (name === 'idle' || name === 'lookAround') {
    pose.rotation[2] = Math.sin(p * Math.PI * 2) * 0.025 * weight;
    if (name === 'lookAround') pose.bones.head = [0, Math.sin(p * Math.PI * 2) * 0.12 * weight, 0];
  } else if (name === 'happy' || name === 'jump') {
    const jump = jumps(t, height);
    pose.position[1] = jump.y;
    pose.scale = [1 + jump.squash * (0.08 / 0.15), 1 - jump.squash, 1 + jump.squash * (0.08 / 0.15)];
    if (name === 'happy') pose.expressions.happy = 1;
  } else if (name === 'stretch' || name === 'shout') {
    // Usagi's arm is a ~0.075H stub rooted at the body side (y≈0.26H) under a huge
    // head (neck y≈0.30H): it cannot reach above the head. Turning the shoulder swings
    // the arm root into the head and bulges the body, so only the upper arm abducts:
    // the hands poke out sideways-up past the silhouette (主导 2026-11-16 定).
    // VRM 1.0 normalized arms extend along ±X: opposite Z turns raise both sides.
    const upperArm = name === 'stretch' ? 1.5 : 1.4; // Relative to resting ±1.1; 1.5 sits the hands in the head–body notch, where they show most.
    pose.bones.leftUpperArm = [-0.06 * weight, 0, upperArm * weight];
    pose.bones.rightUpperArm = [-0.06 * weight, 0, -upperArm * weight];
    pose.bones.chest = [-0.1 * weight, 0, 0];
    pose.hipsY = height * 0.025 * weight;
    if (name === 'shout') pose.expressions.angry = 1;
  } else if (name === 'shake') {
    pose.bones.head = [0, Math.sin(p * Math.PI * 10) * 0.38 * weight, Math.sin(p * Math.PI * 10) * 0.18 * weight];
  } else if (name === 'spin') {
    // A full revolution is the identity orientation at both endpoints.
    pose.rotation[1] = smooth(p) * Math.PI * 2;
    pose.expressions.happy = 1;
  } else if (name === 'surprised') {
    pose.position[2] = -height * 0.04 * Math.sin(p * Math.PI) * weight;
    pose.scale = [1 - 0.05 * weight, 1 - 0.08 * weight, 1 - 0.05 * weight];
    pose.bones.head = [-0.18 * weight, 0, 0];
    pose.expressions.surprised = 1;
  } else if (name === 'turn') {
    pose.rotation[1] = (options.direction ?? 1) * 50 * Math.PI / 180 * Math.sin(p * Math.PI) * weight;
  } else if (name === 'walk') {
    // One step per 45 DIP, two steps per gait cycle. Match the native ease-in-out distance.
    const distance = options.distance ?? smooth(p) * duration * SPEED;
    const phase = distance / 45 * Math.PI;
    pose.position[1] = Math.abs(Math.sin(phase)) * height * 0.028 * weight;
    pose.rotation[2] = Math.sin(phase) * 0.1 * weight;
    pose.bones.leftUpperLeg = [Math.sin(phase) * 0.16 * weight, 0, 0];
    pose.bones.rightUpperLeg = [-Math.sin(phase) * 0.16 * weight, 0, 0];
    pose.bones.leftLowerLeg = [Math.max(0, -Math.sin(phase)) * 0.12 * weight, 0, 0];
    pose.bones.rightLowerLeg = [Math.max(0, Math.sin(phase)) * 0.12 * weight, 0, 0];
    pose.bones.leftUpperArm = [-Math.sin(phase) * 0.025 * weight, 0, 0];
    pose.bones.rightUpperArm = [Math.sin(phase) * 0.025 * weight, 0, 0];
  } else if (name === 'drag') {
    const sway = Math.max(-1, Math.min(1, (options.velocityX ?? 180) / 700));
    pose.rotation[2] = -sway * Math.PI / 12 * weight;
    pose.bones.leftUpperArm = [0, 0, (-0.16 + sway * 0.05) * weight];
    pose.bones.rightUpperArm = [0, 0, (0.16 + sway * 0.05) * weight];
    pose.bones.leftUpperLeg = [0.035 * weight, 0, sway * 0.04 * weight];
    pose.bones.rightUpperLeg = [-0.035 * weight, 0, sway * 0.04 * weight];
    pose.expressions.surprised = 1;
  }
  return pose;
}
const BONES: VRMHumanBoneName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'];
const EXPRESSIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh'];

export class MotionRig {
  private position: Vector3;
  private scale: Vector3;
  private rotation: Euler;
  private hipsPosition?: Vector3;
  private bones: { node: NonNullable<ReturnType<VRM['humanoid']['getNormalizedBoneNode']>>; rotation: Euler }[];
  constructor(private vrm: VRM) {
    this.hipsPosition = vrm.humanoid.getNormalizedBoneNode('hips')?.position.clone();
    this.position = vrm.scene.position.clone(); this.scale = vrm.scene.scale.clone(); this.rotation = vrm.scene.rotation.clone();
    this.bones = BONES.flatMap((name) => {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      return node ? [{ node, rotation: node.rotation.clone() }] : [];
    });
  }
  reset(): void {
    this.vrm.scene.position.copy(this.position); this.vrm.scene.scale.copy(this.scale); this.vrm.scene.rotation.copy(this.rotation);
    for (const bone of this.bones) bone.node.rotation.copy(bone.rotation);
    if (this.hipsPosition) this.vrm.humanoid.getNormalizedBoneNode('hips')?.position.copy(this.hipsPosition);
    for (const name of EXPRESSIONS) if (this.vrm.expressionManager?.getExpression(name)) this.vrm.expressionManager.setValue(name, 0);
  }
  apply(pose: Pose): void {
    const root = this.vrm.scene;
    root.position.add(new Vector3(...pose.position));
    root.rotation.x += pose.rotation[0]; root.rotation.y += pose.rotation[1]; root.rotation.z += pose.rotation[2];
    root.scale.multiply(new Vector3(...pose.scale));
    for (const [name, rotation] of Object.entries(pose.bones)) {
      const node = this.vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
      if (node && rotation) { node.rotation.x += rotation[0]; node.rotation.y += rotation[1]; node.rotation.z += rotation[2]; }
    }
    const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips && pose.hipsY) hips.position.y += pose.hipsY;
    for (const [name, value] of Object.entries(pose.expressions)) {
      if (['happy', 'angry', 'sad', 'relaxed', 'surprised'].includes(name)) {
        if (value) setEmotion(this.vrm, name);
        continue;
      }
      if (this.vrm.expressionManager?.getExpression(name)) this.vrm.expressionManager.setValue(name, value);
    }
  }
}
