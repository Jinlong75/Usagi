import type { VRM } from '@pixiv/three-vrm';

export function clickPose(age: number): { happy: number; jump: number } {
  if (age < 0 || age >= 1.2) return { happy: 0, jump: 0 };
  return {
    happy: Math.min(1, age / 0.1, (1.2 - age) / 0.2),
    jump: age < 0.45 ? Math.sin(Math.PI * age / 0.45) * 0.08 : 0,
  };
}
export function click(vrm: VRM, age: number, baseY: number): void {
  const pose = clickPose(age);
  if (vrm.expressionManager?.getExpression('happy')) vrm.expressionManager.setValue('happy', pose.happy);
  vrm.scene.position.y = baseY + pose.jump;
}
