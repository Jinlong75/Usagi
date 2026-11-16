import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, normalizeConfig, readConfig, writeConfig } from '../src/main/config';

const directories: string[] = [];
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'usagi-config-test-'));
  directories.push(directory);
  return join(directory, 'config.json');
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('配置持久化', () => {
  it('缺失文件使用默认值，且不自行写文件', () => {
    const path = fixture();
    expect(readConfig(path)).toEqual(DEFAULT_CONFIG);
    expect(readdirSync(join(path, '..'))).toEqual([]);
  });
  it('部分字段与默认值合并，保留 false 与负屏幕坐标', () => {
    const path = fixture();
    writeFileSync(path, JSON.stringify({ alwaysOnTop: false, position: { x: -100, y: 20 } }));
    expect(readConfig(path)).toEqual({ ...DEFAULT_CONFIG, alwaysOnTop: false, position: { x: -100, y: 20 } });
  });
  it('原子写入后可还原全部字段，不留下临时文件', () => {
    const path = fixture();
    const config = { modelPath: 'assets/models/custom.vrm', size: 'large' as const, position: { x: 120, y: 40 }, alwaysOnTop: false };
    writeConfig(path, config);
    expect(readConfig(path)).toEqual(config);
    expect(readdirSync(join(path, '..'))).toEqual(['config.json']);
  });
  it('为损坏 JSON 留原始备份并返回默认值，可再次正常保存', () => {
    const path = fixture();
    writeFileSync(path, '{ broken config');
    expect(readConfig(path)).toEqual(DEFAULT_CONFIG);
    const backup = readdirSync(join(path, '..'));
    expect(backup).toHaveLength(1);
    expect(backup[0]).toMatch(/^config\.broken-\d+\.json$/);
    expect(readFileSync(join(path, '..', backup[0]!), 'utf8')).toBe('{ broken config');
    writeConfig(path, DEFAULT_CONFIG);
    expect(readConfig(path)).toEqual(DEFAULT_CONFIG);
  });
  it.each([null, [], 12, { size: 'giant', modelPath: '', position: { x: Infinity, y: 0 }, alwaysOnTop: 'true' }])(
    '非法结构或字段不能污染默认配置：%j', (value) => {
      expect(normalizeConfig(value)).toEqual(DEFAULT_CONFIG);
    },
  );
});
