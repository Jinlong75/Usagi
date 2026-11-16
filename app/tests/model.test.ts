import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveModel } from '../src/main/model';

let root: string;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });
it('按配置、Usagi、占位路径的顺序回退，smoke 固定占位路径', () => {
  root = mkdtempSync(join(tmpdir(), 'usagi-model-test-'));
  const placeholder = join(root, 'assets/placeholder/Seed-san.vrm');
  expect(resolveModel(root, null, false)).toBe(placeholder);
  mkdirSync(join(root, 'assets/models'), { recursive: true });
  writeFileSync(join(root, 'assets/models/usagi.vrm'), 'model');
  expect(resolveModel(root, 'missing.vrm', false)).toBe(join(root, 'assets/models/usagi.vrm'));
  writeFileSync(join(root, 'custom.vrm'), 'model');
  expect(resolveModel(root, 'custom.vrm', false)).toBe(join(root, 'custom.vrm'));
  expect(resolveModel(root, 'custom.vrm', true)).toBe(placeholder);
});
