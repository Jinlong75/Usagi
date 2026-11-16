import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveModel } from '../src/main/model';
import { resolveSounds } from '../src/main/paths';
import { SoundLibrary } from '../src/main/sounds';
// @ts-expect-error 打包脚本为 JavaScript，直接测试真实入口。
import { packageModel } from '../scripts/package-model.mjs';

const directories: string[] = [];
function directory() { const path = mkdtempSync(join(tmpdir(), 'usagi-package-')); directories.push(path); return path; }
function file(path: string, value: string) { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, value); }
afterEach(() => { directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); });

it('打包路径与开发根目录独立；配置优先，smoke 仍实际加载包内模型', () => {
  const root = directory(), resourcesPath = directory();
  const runtime = { isPackaged: true, resourcesPath };
  const model = join(resourcesPath, 'models/usagi.vrm');
  file(join(root, 'assets/placeholder/Seed-san.vrm'), 'placeholder');
  file(model, 'packaged');
  expect(resolveModel(root, null, false, runtime)).toBe(model);
  expect(resolveModel(root, null, true, runtime)).toBe(model);
  expect(resolveModel(root, 'missing.vrm', false, runtime)).toBe(model);
  const custom = join(directory(), 'custom.vrm'); file(custom, 'custom');
  expect(resolveModel(root, custom, false, runtime)).toBe(custom);
  expect(resolveSounds(root, runtime)).toBe(join(resourcesPath, 'sounds/usagi'));
  expect(resolveSounds(root, { ...runtime, isPackaged: false })).toBe(join(root, 'assets/sounds/usagi'));
  expect(resolveModel(root, null, false, { ...runtime, isPackaged: false })).toBe(join(root, 'assets/models/usagi.vrm'));
});

it('包内模型缺失时保留包内失败路径，不静默读取开发素材', () => {
  const root = directory(), resourcesPath = directory();
  file(join(root, 'assets/placeholder/Seed-san.vrm'), 'placeholder');
  expect(resolveModel(root, null, true, { isPackaged: true, resourcesPath })).toBe(join(resourcesPath, 'models/usagi.vrm'));
});

it('无正式模型自动开发包；正式包拒绝改名后的 Seed-san', () => {
  const root = directory();
  file(join(root, 'assets/placeholder/Seed-san.vrm'), 'placeholder');
  expect(packageModel(root)).toMatchObject({ development: true, source: join(root, 'assets/placeholder/Seed-san.vrm') });
  file(join(root, 'assets/models/usagi.vrm'), 'placeholder');
  expect(() => packageModel(root)).toThrow('Seed-san');
  file(join(root, 'assets/models/usagi.vrm'), 'VRM metadata Seed-san');
  expect(() => packageModel(root)).toThrow('Seed-san');
  file(join(root, 'assets/models/usagi.vrm'), 'Usagi own model');
  expect(packageModel(root)).toMatchObject({ development: false, source: join(root, 'assets/models/usagi.vrm') });
});

it('音效工厂读取 resourcesPath，冒烟核对所有可用素材；缺失/非 Ogg 失败', async () => {
  const root = directory(), resourcesPath = directory();
  const sounds = join(resourcesPath, 'sounds/usagi');
  file(join(sounds, 'manifest.json'), JSON.stringify({ clips: [
    { file: 'a.ogg', quality: 'clean', uses: ['click_happy'] },
    { file: 'b.ogg', quality: 'bgm', uses: ['click_shout'] },
  ] }));
  file(join(sounds, 'a.ogg'), 'OggSsample');
  const library = SoundLibrary.fromRuntime(root, { isPackaged: true, resourcesPath });
  expect(await library.load('click_happy')).toEqual(new Uint8Array(Buffer.from('OggSsample')));
  await expect(library.verify()).rejects.toThrow();
  file(join(sounds, 'b.ogg'), 'invalid');
  await expect(library.verify()).rejects.toThrow('不是 Ogg');
  file(join(sounds, 'b.ogg'), 'OggSanother');
  expect(await library.verify()).toMatchObject({ directory: sounds, clips: 2 });
});
