import { Box3, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { sampleMotion } from './index';
import type { MotionRig, Pose } from './index';
import { TURN_ANGLE } from '../behavior/machine';

/** Pose extrema, sampled once before the first rendered frame. */
export function framingPoses(): Pose[] {
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
  try {
    for (const pose of framingPoses()) {
      rig.reset();
      rig.apply(pose);
      motion.union(measure());
    }
  } finally {
    rig.reset();
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    vrm.springBoneManager?.reset();
    vrm.scene.updateMatrixWorld(true);
  }
  return { neutral, motion };
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
