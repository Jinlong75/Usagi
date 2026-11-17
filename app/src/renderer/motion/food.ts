import type { Pose } from './index';
import type { FoodActivity } from '../../shared/types';

export type FoodMotion = FoodActivity | 'sneakSnack';
export const RICE_BITES = [0.6, 1.75, 2.9] as const;
export const MELON_BITES = [0.6, 1.8, 3] as const;
export const ICE_LICKS = [0.6, 1.4, 2.2, 3.6] as const;
export const ICE_DROP_AT = ICE_LICKS[2] + 0.4;
export function isFoodMotion(name: string | undefined): name is FoodMotion {
  return name === 'eatRiceball' || name === 'eatWatermelon' || name === 'iceCream' || name === 'sneakSnack';
}
const smooth = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p); };
/** Coordinates are fractions of H; +Z is forward. Food floats below the ω mouth
 * (neutral mouth center y≈0.355H). Limb timing never changes prop trajectories. */
export function sampleFood(pose: Pose, name: FoodMotion, t: number, weight: number, height: number, limb: { rest: number; bite: number; chew: number }): void {
  const raised = limb.rest * weight;
  pose.bones.leftUpperArm = [0, 0, raised]; pose.bones.rightUpperArm = [0, 0, -raised];
  pose.bones.head = [0, 0, 0];
  pose.props = {};
  const hands = (age: number, chewSeconds: number) => {
    const extra = age < 0.25 ? limb.bite * Math.sin(Math.PI * age / 0.25)
      : limb.chew * Math.sin((age - 0.25) / chewSeconds * Math.PI * 2);
    const arm = raised + extra * weight;
    pose.bones.leftUpperArm = [0, 0, arm]; pose.bones.rightUpperArm = [0, 0, -arm];
  };
  const bite = (start: number, chewSeconds: number, side = 0) => {
    const age = t - start;
    if (age < 0 || age >= 0.25 + chewSeconds) return;
    hands(age, chewSeconds);
    const biting = age < 0.25;
    pose.expressions[biting ? 'aa' : 'sad'] = 1;
    pose.bones.head = [biting ? 0.08 * Math.sin(Math.PI * age / 0.25) : 0, 0, side * 0.1];
    if (!biting) pose.scale[1] = 1 - 0.03 * Math.sin((age - 0.25) / chewSeconds * Math.PI * 2) ** 2;
  };
  if (name === 'eatRiceball') {
    const eaten = RICE_BITES.filter(start => t >= start + 0.25).length;
    const size = [1, 0.65, 0.3, 0][eaten]! * weight;
    const rise = smooth(t / 0.6);
    if (size > 0) pose.props.riceball = { name: 'riceball', position: [0, 0.12 + rise * 0.135, 0.36], scale: [size, size, size] };
    RICE_BITES.forEach(start => bite(start, 0.9));
    const age = t - (RICE_BITES[2] + 0.25);
    if (age >= 0 && age < 0.7) for (let i = 0; i < 4; i++) {
      const radius = 0.005 * Math.min(1, (0.7 - age) / 0.15);
      pose.props[`rice-${i}`] = { name: 'rice', position: [(i - 1.5) * (0.014 + age * 0.018), 0.255 - age * age * 0.4, 0.37], scale: [radius, radius, radius] };
    }
    if (t >= 5) {
      pose.expressions.happy = 1;
      const jump = (t - 5.1) / 0.35;
      if (jump > 0 && jump < 1) pose.position[1] = Math.sin(Math.PI * jump) * 0.04 * height;
    }
  } else if (name === 'eatWatermelon') {
    const eaten = MELON_BITES.filter(start => t >= start + 0.25).length;
    pose.props.watermelon = { name: 'watermelon', position: [0, 0.275, 0.36], scale: [weight, weight, weight], foodRemaining: [1, 0.72, 0.44, 0][eaten]! };
    MELON_BITES.forEach((start, i) => bite(start, 0.75, [-1, 1, 0][i]));
    if (t >= 4) pose.expressions.happy = 1;
  } else if (name === 'iceCream') {
    pose.props.iceCream = { name: 'iceCream', position: [0, 0.18, 0.38], scale: [weight, weight, weight] };
    for (const start of ICE_LICKS) {
      const age = t - start;
      if (age >= 0 && age < 0.4) {
        hands(age, 0.15);
        pose.expressions.ih = 1;
        pose.bones.chest = [0.1 * Math.sin(Math.PI * age / 0.4), 0, 0];
        pose.bones.head = [0.08 * Math.sin(Math.PI * age / 0.4), 0, 0];
      }
    }
    const age = t - ICE_DROP_AT;
    if (age >= 0 && age < 0.8) {
      const radius = 0.009 * Math.min(1, (0.8 - age) / 0.12);
      pose.props.iceDrop = { name: 'iceDrop', position: [0.04, 0.275 - 0.7 * age * age, 0.39], scale: [radius, radius, radius] };
    }
    if (age >= 0 && age < 0.6) {
      pose.expressions = { surprised: 1 };
      pose.bones.head = [-0.12, 0, 0]; pose.position[2] = -0.025 * height;
    }
    if (t >= 4.3) pose.expressions.happy = 1;
  } else {
    const mouthward = smooth((t - 1.2) / 0.3);
    pose.props.cookie = { name: 'cookie', position: [0.22 * (1 - mouthward), 0.24 + mouthward * 0.04, 0.36], scale: [weight, weight, weight] };
    if (t < 1.2) {
      const age = t - 0.2;
      pose.bones.head = [0, age < 0 ? 0 : age < 0.5 ? -0.25 * Math.sin(Math.PI * age / 0.5) : 0.25 * Math.sin(Math.PI * (age - 0.5) / 0.5), 0];
    }
    [1.5, 2.2].forEach(start => bite(start, 0.4));
    if (t >= 2.95) { pose.props = {}; pose.expressions.happy = 1; }
  }
}
