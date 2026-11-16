import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { modelPaths, type ResourceRuntime } from './paths';

export function resolveModel(root: string, configured: string | null, smoke: boolean, runtime?: ResourceRuntime): string {
  const defaults = modelPaths(root, runtime);
  // 开发冒烟固定占位模型；打包冒烟必须走包内真实资源路径。
  if (smoke && !runtime?.isPackaged) return defaults[1]!;
  const candidates = [configured ? resolve(root, configured) : null, ...defaults];
  return candidates.find((path): path is string => path !== null && existsSync(path)) ?? defaults.at(-1)!;
}
