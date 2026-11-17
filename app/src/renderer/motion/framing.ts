import { Box3, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { sampleMotion } from './index';
import type { MotionRig, Pose } from './index';
import { PropRig } from '../props';
import { TURN_ANGLE } from '../behavior/machine';

/** Pose extrema, sampled once before the first rendered frame. */
export function framingPoses(modelHeight = 1): Pose[] {
  const poses = [sampleMotion('shout', 0.55), sampleMotion('happy', 0.175), sampleMotion('stretch', 1.1),
    sampleMotion('shake', 0.3), sampleMotion('shake', 0.42)];
  for (let angle = 0; angle < 360; angle += 45) {
    const pose = sampleMotion('spin', 0.9);
    pose.rotation[1] = angle * Math.PI / 180;
    poses.push(pose);
  }
  for (const direction of [-1, 1] as const) {
    const walk = sampleMotion('walk', 0.7, { distance: direction * 22.5 });
    // Include the front-facing smoke gait and the turned live gait at its apex.
    poses.push(walk);
    const turnedWalk = sampleMotion('walk', 0.7, { distance: direction * 22.5 });
    turnedWalk.rotation[1] = direction * TURN_ANGLE;
    poses.push(turnedWalk, sampleMotion('drag', 0.5, { velocityX: direction * 700 }));
  }
  for (const pose of poses) {
    pose.position = pose.position.map(value => value * modelHeight) as Pose['position'];
    if (pose.hipsY) pose.hipsY *= modelHeight;
  }
  // Dense full rotations include rope, jumping root and landing scale together.
  // The parked U hangs lower than the rope on a jumping root during a turn.
  poses.push(sampleMotion('jumpRope', 0.6, { modelHeight }), sampleMotion('jumpRope', 5.2, { modelHeight }));
  for (let i = 0; i <= 48; i++) poses.push(sampleMotion('jumpRope', 1.2 + i * 0.6 / 48, { modelHeight }));
  for (let t = 0.1; t < 5; t += 0.1) poses.push(sampleMotion('blowBubbles', t, { modelHeight }));
  for (const t of [0.001, 1, 2, 3, 3.999]) poses.push(sampleMotion('napPillow', t, { modelHeight }));
  // Food paths are monotone between these extrema: rise endpoints, largest
  // food/side bends, full forward lean, last falling-particle instant and hop apex.
  // Avoid dense skin scans for each bite of the same otherwise identical pose.
  const foodExtrema = {
    eatRiceball: [0.18, 0.6, 0.725, 0.85, 3.15, 3.849999, 5.275],
    eatWatermelon: [0.6, 0.725, 1.925, 3.125],
    iceCream: [0.18, 0.8, 2.6, 2.8, 3.399999, 3.8],
    sneakSnack: [0.18, 0.45, 0.95, 1.2, 1.625, 2.325],
  } as const;
  for (const name of Object.keys(foodExtrema) as (keyof typeof foodExtrema)[]) {
    for (const t of foodExtrema[name]) poses.push(sampleMotion(name, t, { modelHeight }));
  }
  return poses;
}

export function measureMotionBounds(vrm: VRM, rig: MotionRig): { neutral: Box3; motion: Box3 } {
  const measure = () => {
    // Propagate normalized bones to the raw skeleton, constraints and expressions,
    // then refresh every bone's world matrix before evaluating skinned vertices.
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    return new Box3().setFromObject(vrm.scene, true);
  };
  rig.reset();
  const neutral = measure();
  const motion = neutral.clone();
  const props = new PropRig(vrm.scene, neutral.getSize(new Vector3()).y, neutral);
  try {
    for (const pose of framingPoses(neutral.getSize(new Vector3()).y)) {
      props.apply();
      rig.reset();
      rig.apply(pose);
      props.apply(pose.props);
      motion.union(measure());
    }
  } finally {
    props.dispose();
    rig.reset();
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    vrm.springBoneManager?.reset();
    vrm.scene.updateMatrixWorld(true);
  }
  return { neutral, motion };
}

/** Reserve lateral room for long ears deflecting up to 35° beyond the head. */
export function springEnvelope(neutral: Box3, motion: Box3): Box3 {
  const height = neutral.getSize(new Vector3()).y;
  return motion.clone().expandByVector(new Vector3(height * 0.3 * Math.sin(35 * Math.PI / 180), height * 0.015, 0));
}

export function motionAspect(bounds: Box3): number {
  const size = bounds.getSize(new Vector3());
  return Math.max(0.4, Math.min(2, size.x * 1.08 / (size.y * 1.08 / 0.95)));
}

/** Fit the union with 4% on every side; anchor neutral soles at 5% where possible.
 * A pose extending below that anchor moves the whole frame down only as needed. */
export function frameBounds(neutral: Box3, poses: readonly Box3[], aspect: number) {
  const bounds = neutral.clone();
  for (const pose of poses) bounds.union(pose);
  const size = bounds.getSize(new Vector3());
  const padded = bounds.clone().expandByVector(new Vector3(size.x * 0.04, size.y * 0.04, 0));
  const height = Math.max(size.x * 1.08 / aspect, size.y * 1.08,
    (padded.max.y - neutral.min.y) / 0.95, 0.1);
  const width = height * aspect;
  const center = bounds.getCenter(new Vector3());
  const bottom = Math.min(neutral.min.y - height * 0.05, padded.min.y);
  return { width, height, left: center.x - width / 2, right: center.x + width / 2,
    bottom, top: bottom + height, centerX: center.x, centerZ: center.z, front: bounds.max.z };
}
