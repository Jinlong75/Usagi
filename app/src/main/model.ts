import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveModel(root: string, configured: string | null, smoke: boolean): string {
  // TODO(lead): 打包后的模型路径
  const placeholder = resolve(root, 'assets/placeholder/Seed-san.vrm');
  if (smoke) return placeholder;
  const candidates = [configured ? resolve(root, configured) : null, resolve(root, 'assets/models/usagi.vrm'), placeholder];
  return candidates.find((path): path is string => path !== null && existsSync(path)) ?? placeholder;
}
