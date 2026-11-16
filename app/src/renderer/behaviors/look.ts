import { MathUtils, Object3D } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { Point, Rect } from '../../shared/types';

export function cursorDirection(point: Point, bounds: Rect): Point {
  return {
    x: MathUtils.clamp((point.x - bounds.x - bounds.width / 2) / (bounds.width / 2), -1, 1),
    y: MathUtils.clamp((bounds.y + bounds.height / 2 - point.y) / (bounds.height / 2), -1, 1),
  };
}
export function look(vrm: VRM, target: Object3D, direction: Point, delta: number): void {
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  if (!head) return;
  const smoothing = 1 - Math.exp(-8 * delta);
  // VRM 1 faces +Z; these Euler signs turn the head toward the screen-space cursor.
  const limit = MathUtils.degToRad(20);
  const magnitude = Math.max(1, Math.hypot(direction.x, direction.y));
  head.rotation.y = MathUtils.lerp(head.rotation.y, direction.x / magnitude * limit, smoothing);
  head.rotation.x = MathUtils.lerp(head.rotation.x, -direction.y / magnitude * limit, smoothing);
  head.getWorldPosition(target.position);
  target.position.x += direction.x * 2;
  target.position.y += direction.y;
  target.position.z += 3;
  if (vrm.lookAt) vrm.lookAt.target = target;
}
