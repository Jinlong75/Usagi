import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveModel } from '../src/main/model';

let root: string;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });
it('按配置、Usagi 顺序加载，Seed-san 只在显式指定时使用；smoke 固定 Usagi', () => {
  root = mkdtempSync(join(tmpdir(), 'usagi-model-test-'));
  const placeholder = join(root, 'assets/placeholder/Seed-san.vrm');
  const usagi = join(root, 'assets/models/usagi.vrm');
  expect(resolveModel(root, null, false)).toBe(usagi);
  mkdirSync(join(root, 'assets/models'), { recursive: true });
  writeFileSync(join(root, 'assets/models/usagi.vrm'), 'model');
  expect(resolveModel(root, 'missing.vrm', false)).toBe(join(root, 'assets/models/usagi.vrm'));
  writeFileSync(join(root, 'custom.vrm'), 'model');
  expect(resolveModel(root, 'custom.vrm', false)).toBe(join(root, 'custom.vrm'));
  expect(resolveModel(root, 'custom.vrm', true)).toBe(usagi);
  mkdirSync(join(root, 'assets/placeholder'), { recursive: true });
  writeFileSync(placeholder, 'placeholder');
  expect(resolveModel(root, 'assets/placeholder/Seed-san.vrm', false)).toBe(placeholder);
});
