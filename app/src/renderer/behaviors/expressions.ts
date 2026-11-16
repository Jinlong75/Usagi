import type { VRM } from '@pixiv/three-vrm';

export const EMOTIONS = ['happy', 'surprised', 'angry', 'sad', 'relaxed'] as const;
/** UV offsets add together. Clear the entire emotion bank before a binary switch. */
export function setEmotion(vrm: VRM, selected: string): void {
  for (const name of [...EMOTIONS, 'aa', 'ih', 'ou', 'ee', 'oh', 'neutral']) {
    if (vrm.expressionManager?.getExpression(name)) vrm.expressionManager.setValue(name, name === selected ? 1 : 0);
  }
}
