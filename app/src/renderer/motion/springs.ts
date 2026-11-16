import { Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';

// Forces are in VRM world units per screen acceleration (DIP/s²).
export const SPRING_ACCELERATION_COEFFICIENT = 0.00012;
/** Adds acceleration-induced force to the authored gravity vector, restoring the exact original settings on release. */
export class DragSprings {
  private originals;
  private velocity = { x: 0, y: 0 };
  private time: number | null = null;
  private force = new Vector3();
  constructor(vrm: VRM) {
    this.originals = [...(vrm.springBoneManager?.joints ?? [])].map((joint) => ({ joint,
      direction: joint.settings.gravityDir.clone(), power: joint.settings.gravityPower, stiffness: joint.settings.stiffness }));
  }
  sample(velocity: { x: number; y: number }, timestamp: number): void {
    if (this.time !== null && timestamp > this.time) {
      const dt = Math.max(0.008, (timestamp - this.time) / 1000);
      this.force.set(-(velocity.x - this.velocity.x) / dt, (velocity.y - this.velocity.y) / dt, 0)
        .multiplyScalar(SPRING_ACCELERATION_COEFFICIENT).clampLength(0, 0.85);
    }
    this.velocity = velocity; this.time = timestamp;
  }
  update(delta: number, active: boolean): void {
    if (!active) { this.restore(); return; }
    for (const { joint, direction, power } of this.originals) {
      const gravity = direction.clone().multiplyScalar(power).add(this.force);
      joint.settings.gravityPower = gravity.length();
      joint.settings.gravityDir.copy(gravity.lengthSq() ? gravity.normalize() : direction);
    }
    this.force.multiplyScalar(Math.exp(-10 * delta));
  }
  /** A brief authored-stiffness boost straightens both ears while the body holds.
   * Keep the exact baseline so hiding/reload/drag restores every setting. */
  caught(active: boolean): void {
    for (const { joint, stiffness } of this.originals) {
      if (stiffness !== undefined && /^Ear[LR]_/.test(joint.bone.name)) joint.settings.stiffness = active ? stiffness + 5 : stiffness;
    }
  }
  restore(): void {
    this.caught(false);
    for (const { joint, direction, power } of this.originals) {
      joint.settings.gravityDir.copy(direction); joint.settings.gravityPower = power;
    }
    this.force.set(0, 0, 0); this.velocity = { x: 0, y: 0 }; this.time = null;
  }
}
