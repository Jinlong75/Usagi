import type { VRM } from '@pixiv/three-vrm';
import { sampleMotion } from '../motion';

/** Compatibility for the original happy-click API; live reactions use MotionRig. */
export function clickPose(age: number): { happy: number; jump: number } {
  const pose = sampleMotion('happy', age);
  return { happy: pose.expressions.happy ?? 0, jump: pose.position[1] };
}
export function click(vrm: VRM, age: number, baseY: number): void {
  const pose = clickPose(age);
  if (vrm.expressionManager?.getExpression('happy')) vrm.expressionManager.setValue('happy', pose.happy);
  vrm.scene.position.y = baseY + pose.jump;
}
