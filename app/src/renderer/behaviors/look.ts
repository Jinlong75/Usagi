import { MathUtils, Object3D } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { Point, Rect } from '../../shared/types';

// Seconds-based exponential filters stay consistent across 30/60/144Hz rendering.
export const GAZE_RESPONSE_PER_SECOND = 8;
export const CURSOR_RESPONSE_PER_SECOND = 12;
export function smoothDirection(current: Point, target: Point, delta: number): Point {
  const amount = 1 - Math.exp(-CURSOR_RESPONSE_PER_SECOND * Math.max(0, delta));
  return { x: MathUtils.lerp(current.x, target.x, amount), y: MathUtils.lerp(current.y, target.y, amount) };
}

export function cursorDirection(point: Point, bounds: Rect): Point {
  return {
    x: MathUtils.clamp((point.x - bounds.x - bounds.width / 2) / (bounds.width / 2), -1, 1),
    y: MathUtils.clamp((bounds.y + bounds.height / 2 - point.y) / (bounds.height / 2), -1, 1),
  };
}
/** Total gaze budget is shared equally by Head and Neck. No eyeball lookAt. */
export function gazeAngles(direction: Point): Point {
  return { x: -MathUtils.clamp(direction.y, -1, 1) * Math.PI / 36,
    y: MathUtils.clamp(direction.x, -1, 1) * Math.PI / 18 };
}
export function look(vrm: VRM, _target: Object3D, direction: Point, delta: number): void {
  if (vrm.lookAt) { vrm.lookAt.target = null; vrm.lookAt.reset(); vrm.lookAt.autoUpdate = false; }
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  const neck = vrm.humanoid.getNormalizedBoneNode('neck');
  const angles = gazeAngles(direction);
  const smoothing = 1 - Math.exp(-GAZE_RESPONSE_PER_SECOND * delta);
  for (const bone of [head, neck]) {
    if (!bone) continue;
    bone.rotation.y = MathUtils.lerp(bone.rotation.y, angles.y * (neck ? 1 : 2), smoothing);
    bone.rotation.x = MathUtils.lerp(bone.rotation.x, angles.x * (neck ? 1 : 2), smoothing);
  }
}
