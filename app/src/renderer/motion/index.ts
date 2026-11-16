import { isFoodMotion, sampleFood } from './food';
import { Euler, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { DURATIONS, SPEED } from '../behavior/machine';
import { setEmotion } from '../behaviors/expressions';
import { PILLOW_CENTER, ROPE_PIVOT_Y, WAND_RING } from '../props';
import type { PropState } from '../props';
import type { Action, Reaction } from '../behavior/machine';

export type MotionName = 'idle' | 'lookAround' | 'turn' | 'walk' | 'drag' | Action | Reaction | 'napPillow';
export type Rotation = [number, number, number];
export interface Pose {
  roundEyes?: boolean;
  props?: Record<string, PropState>;
  position: Rotation; rotation: Rotation; scale: Rotation;
  bones: Partial<Record<VRMHumanBoneName, Rotation>>; hipsY?: number; expressions: Record<string, number>;
}
// Translations are fractions of neutral model height; angles are radians.
export const MOTION_SECONDS: Record<MotionName, number> = {
  idle: 3.5, lookAround: 3.5, turn: 0.9, walk: 2, drag: 1.2,
  eatRiceball: 6, eatWatermelon: 5, iceCream: 5.5, sneakSnack: 4.5,
  jumpRope: 6.5, blowBubbles: 5, napPillow: 4,
  jump: DURATIONS.jump / 1000, stretch: DURATIONS.stretch / 1000,
  shake: DURATIONS.shake / 1000, spin: DURATIONS.spin / 1000,
  happy: DURATIONS.happy / 1000, surprised: DURATIONS.surprised / 1000, shout: DURATIONS.shout / 1000,
};
/** 2026-11-16 用户：“那个形状就是最标准的形状”。静止不旋转上臂，保持 Tripo 原始姿态。 */
export const ARM_REST = 0;
/** 2026-11-17 主导授权多轴扫描；原手高与轮廓要求无解后采用 neck−0.04H。
 * 在扫描网格中取距 0.75 rad 纯抬臂最近的姿态，见 usagi_arm_scan.report.json。 */
export const ARM_RAISE = { stretch: 0.43, shout: 0.43 } as const;
export const ARM_FOREARM = -0.1;
export function neutralPose(): Pose {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], bones: {}, expressions: {} };
}
const smooth = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p); };
function envelope(t: number, duration: number, fade = 0.18): number {
  return smooth(t / fade) * smooth((duration - t) / fade);
}
/** Two flights followed by two full 220ms landing compression/recovery pulses. */
export function jumps(t: number, modelHeight = 1, starts: readonly number[] = [0, 0.57]): { y: number; squash: number } {
  for (const start of starts) {
    const age = t - start;
    if (age >= 0 && age < 0.35) return { y: Math.sin(Math.PI * age / 0.35) * modelHeight * 0.1, squash: 0 };
    if (age >= 0.35 && age < 0.57) return { y: 0, squash: Math.sin(Math.PI * (age - 0.35) / 0.22) * 0.15 };
  }
  return { y: 0, squash: 0 };
}
export const ROPE_START = 1.2;
export const ROPE_PERIOD = 0.6;
export const ROPE_APEX = 0.175;
export const BUBBLE_BLOWS = [0.55, 2.45] as const;
export interface MotionOptions { loop?: boolean; duration?: number; direction?: -1 | 1; velocityX?: number; distance?: number; modelHeight?: number }
/** Pure pose sampling; every finite clip has neutral endpoints, including expressions and root scale. */
export function sampleMotion(name: MotionName, t: number, options: MotionOptions = {}): Pose {
  const pose = neutralPose();
  const duration = options.duration ?? MOTION_SECONDS[name];
  const looping = name === 'napPillow' && options.loop;
  if (looping) t = ((t % duration) + duration) % duration;
  else if (t <= 0 || t >= duration) return pose;
  const weight = envelope(t, duration);
  const p = t / duration;
  const height = options.modelHeight ?? 1;
  if (isFoodMotion(name)) {
    pose.roundEyes = true;
    sampleFood(pose, name, t, weight, height);
  } else if (name === 'jumpRope') {
    const age = t - ROPE_START;
    if (age >= 0 && age < 6 * ROPE_PERIOD) {
      const jump = jumps(age % ROPE_PERIOD, height * 0.6, [0]);
      pose.position[1] = jump.y;
      pose.scale = [1 + jump.squash * 0.08 / 0.15, 1 - jump.squash, 1 + jump.squash * 0.08 / 0.15];
    }
    const phase = Math.max(0, Math.min(6 * ROPE_PERIOD, age));
    // Park below the face before/after the six continuously rotating turns.
    const ropeAngle = age >= 0 && age < 6 * ROPE_PERIOD ? 2 * Math.PI * (phase - ROPE_APEX) / ROPE_PERIOD : 0;
    // Open the upper sweep around the head/ears while keeping the accepted
    // underfoot U exactly unchanged. A small lateral opening between vertical
    // phases also clears the hands; the ends still overlap the handle radii.
    const upper = Math.max(0, -Math.cos(ropeAngle));
    const ropeWidth = 1 + 0.03 * Math.sin(ropeAngle) ** 2;
    pose.props = { handles: { name: 'handles', position: [0, ROPE_PIVOT_Y, 0.02], scale: [weight, weight, weight] },
      rope: { name: 'rope', position: [0, ROPE_PIVOT_Y, 0.02], rotation: [ropeAngle, 0, 0], scale: [weight * ropeWidth, weight, weight], ropeOpen: smooth(upper) } };
    const swing = Math.sin(phase / ROPE_PERIOD * Math.PI * 2) * 0.06 * weight;
    pose.bones.leftUpperArm = [swing, 0, 0]; pose.bones.rightUpperArm = [swing, 0, 0];
    if (age >= 3.6 && age < 4.1) pose.expressions.happy = 1;
  } else if (name === 'blowBubbles') {
    pose.props = { wand: { name: 'wand', position: [...WAND_RING], scale: [weight, weight, weight] } };
    let blowing = 0;
    for (const start of BUBBLE_BLOWS) {
      const age = t - start;
      if (age >= 0 && age < 0.4) blowing = Math.sin(Math.PI * age / 0.4);
    }
    pose.bones.chest = [0.07 * blowing, 0, 0];
    pose.bones.head = [-0.07 * Math.sin(Math.PI * p) * weight, 0, 0];
    if (blowing > 0) pose.expressions.ou = 1;
    BUBBLE_BLOWS.forEach((start, batch) => {
      for (let i = 0; i < 3; i++) {
        const age = t - (start + 0.12 + i * 0.09);
        if (age < 0 || age >= 1.5) continue;
        const radius = (0.015 + i * 0.0075) * Math.min(1, age / 0.1) * Math.min(1, (1.5 - age) / 0.3);
        // Fan out instead of converging into one indistinguishable cluster.
        // Ease the outward drift so late bubbles stay inside the pet's framing.
        const outward = 0.75 * (1 - Math.exp(-age / 0.75));
        const upward = 0.9 * (1 - Math.exp(-age / 0.9));
        pose.props![`bubble-${batch}-${i}`] = { name: 'bubble', position: [WAND_RING[0] - outward * (0.6 - i * 0.16), WAND_RING[1] + upward * (0.24 + i * 0.24), WAND_RING[2] + 0.025], scale: [radius, radius, radius] };
      }
    });
  } else if (name === 'napPillow') {
    const w = looping ? 1 : weight;
    pose.props = { pillow: { name: 'pillow', position: [...PILLOW_CENTER], scale: [w, w, w] } };
    pose.expressions.relaxed = 1;
    pose.bones.head = [0.06 * (1 - Math.cos(2 * Math.PI * p)) * w, 0, Math.PI / 18 * w];
    pose.bones.chest = [Math.sin(2 * Math.PI * p) * 0.07 * w, 0, 0];
    pose.bones.spine = [Math.sin(2 * Math.PI * p) * 0.07 * 0.35 * w, 0, 0];
    pose.bones.leftUpperArm = [0.08 * w, 0, 0.06 * w];
    pose.bones.rightUpperArm = [0.08 * w, 0, -0.06 * w];
  } else if (name === 'idle' || name === 'lookAround') {
    pose.rotation[2] = Math.sin(p * Math.PI * 2) * 0.025 * weight;
    if (name === 'lookAround') pose.bones.head = [0, Math.sin(p * Math.PI * 2) * 0.12 * weight, 0];
  } else if (name === 'happy' || name === 'jump') {
    const jump = jumps(t, height);
    pose.position[1] = jump.y;
    pose.scale = [1 + jump.squash * (0.08 / 0.15), 1 - jump.squash, 1 + jump.squash * (0.08 / 0.15)];
    if (name === 'happy') pose.expressions.happy = 1;
  } else if (name === 'stretch' || name === 'shout') {
    // VRM normalized arms extend along ±X: opposite Z turns raise both sides.
    // Keep shoulders fixed; a small forearm counter-rotation retains visible width.
    const upperArm = ARM_REST + ARM_RAISE[name];
    pose.bones.leftUpperArm = [0, 0, upperArm * weight];
    pose.bones.rightUpperArm = [0, 0, -upperArm * weight];
    pose.bones.leftLowerArm = [0, 0, ARM_FOREARM * weight];
    pose.bones.rightLowerArm = [0, 0, -ARM_FOREARM * weight];
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
/** Re-sample the same instant throughout the catch, with the cookie shrunk
 * behind the body and immediately hidden/disposed. No breathing/chewing advances. */
export function caughtSnackPose(snackAge: number, modelHeight = 1): Pose {
  const pose = sampleMotion('sneakSnack', snackAge, { modelHeight });
  pose.props = { cookie: { name: 'cookie', position: [0, 0.24, -0.25], scale: [0, 0, 0], visible: false } };
  pose.expressions = { surprised: 1 }; pose.roundEyes = true;
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
    if (pose.roundEyes) this.vrm.expressionManager?.setValue('blink', 0);
    for (const [name, value] of Object.entries(pose.expressions)) {
      if (['happy', 'angry', 'sad', 'relaxed', 'surprised'].includes(name)) {
        if (value) setEmotion(this.vrm, name);
        continue;
      }
      if (this.vrm.expressionManager?.getExpression(name)) this.vrm.expressionManager.setValue(name, value);
    }
  }
}
