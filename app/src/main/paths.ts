import { resolve } from 'node:path';

export interface ResourceRuntime { isPackaged: boolean; resourcesPath: string }

export function modelPaths(root: string, runtime?: ResourceRuntime): string[] {
  return runtime?.isPackaged ? [resolve(runtime.resourcesPath, 'models/usagi.vrm')] :
    [resolve(root, 'assets/models/usagi.vrm'), resolve(root, 'assets/placeholder/Seed-san.vrm')];
}

export function resolveSounds(root: string, runtime?: ResourceRuntime): string {
  return runtime?.isPackaged ? resolve(runtime.resourcesPath, 'sounds/usagi') : resolve(root, 'assets/sounds/usagi');
}
