import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { modelPaths, type ResourceRuntime } from './paths';

export function resolveModel(root: string, configured: string | null, smoke: boolean, runtime?: ResourceRuntime): string {
  const defaults = modelPaths(root, runtime);
  // Smoke exercises the same default resource as the installed pet.
  if (smoke) return defaults[0]!;
  const candidates = [configured ? resolve(root, configured) : null, defaults[0]!];
  return candidates.find((path): path is string => path !== null && existsSync(path)) ?? defaults[0]!;
}
