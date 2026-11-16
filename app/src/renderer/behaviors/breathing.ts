import type { VRM } from '@pixiv/three-vrm';

export function breathingAngle(elapsed: number): number {
  return Math.sin(elapsed * 2 * Math.PI / 3.5) * 0.018;
}
export function breathe(vrm: VRM, elapsed: number): void {
  const bone = vrm.humanoid.getNormalizedBoneNode('chest') ?? vrm.humanoid.getNormalizedBoneNode('spine');
  if (bone) bone.rotation.x = breathingAngle(elapsed);
}
