import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config } from '../shared/types';

export const DEFAULT_CONFIG: Config = { modelPath: null, size: 'medium', position: null, alwaysOnTop: true };

export function normalizeConfig(value: unknown): Config {
  const result = { ...DEFAULT_CONFIG };
  if (!value || typeof value !== 'object') return result;
  const data = value as Record<string, unknown>;
  if (typeof data.modelPath === 'string' && data.modelPath.trim()) result.modelPath = data.modelPath;
  if (data.size === 'small' || data.size === 'medium' || data.size === 'large') result.size = data.size;
  if (typeof data.alwaysOnTop === 'boolean') result.alwaysOnTop = data.alwaysOnTop;
  if (data.position && typeof data.position === 'object') {
    const { x, y } = data.position as Record<string, unknown>;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      result.position = { x: Math.round(x), y: Math.round(y) };
    }
  }
  return result;
}

export function readConfig(path: string): Config {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  const contents = readFileSync(path, 'utf8');
  let data: unknown;
  try { data = JSON.parse(contents); }
  catch {
    renameSync(path, path.replace(/\.json$/, '') + `.broken-${Date.now()}.json`);
    return { ...DEFAULT_CONFIG };
  }
  return normalizeConfig(data);
}

export function writeConfig(path: string, config: Config): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(normalizeConfig(config), null, 2) + '\n', 'utf8');
  renameSync(temporary, path);
}
