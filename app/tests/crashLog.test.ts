import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { CrashLog, crashCounts, installCrashLog, watchRenderer } from '../src/main/crashLog';
import type { App, BrowserWindow } from 'electron';

const directories: string[] = [];
function directory() { const path = mkdtempSync(join(tmpdir(), 'usagi-crash-test-')); directories.push(path); return path; }
function records(path: string) {
  return readFileSync(join(path, 'crash.log'), 'utf8').trim().split('\n').map(line => {
    const [, time, category, json] = /^(\S+) (\S+) (.*)$/.exec(line)!;
    expect(new Date(time!).toISOString()).toBe(time);
    return { category, data: JSON.parse(json!) };
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('持久崩溃日志', () => {
  it('追加完整 JSON 行，超过 1 MiB 轮转且只保留一份旧文件', () => {
    const path = directory(); const logger = new CrashLog(path);
    logger.write('start', { version: '1' }); logger.write('chat', { round: 1 });
    expect(records(path).map(record => record.category)).toEqual(['start', 'chat']);
    writeFileSync(logger.path, 'a'.repeat(1024 * 1024)); logger.write('quit', { source: 'tray' });
    expect(readFileSync(`${logger.path}.1`, 'utf8')).toBe('a'.repeat(1024 * 1024));
    expect(records(path)).toEqual([{ category: 'quit', data: { source: 'tray' } }]);
    writeFileSync(logger.path, 'b'.repeat(1024 * 1024 + 1)); logger.write('start', {});
    expect(readFileSync(`${logger.path}.1`, 'utf8')).toBe('b'.repeat(1024 * 1024 + 1));
    expect(readdirSync(path).sort()).toEqual(['crash.log', 'crash.log.1']);
  });
  it('路径不可写或无法序列化时只报告到 console，不抛出', () => {
    const path = join(directory(), 'file'); writeFileSync(path, 'file');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => new CrashLog(path).write('start', {})).not.toThrow();
    const circular: any = {}; circular.self = circular;
    expect(() => new CrashLog(directory()).write('start', circular)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(2);
  });
  it('记录启动、四种窗口、子进程、拒绝及十分钟内存，安装可清理', () => {
    vi.useFakeTimers(); const path = directory();
    const host = Object.assign(new EventEmitter(), { getPath: () => path, getVersion: () => '0.1.0', isPackaged: true,
      getAppMetrics: () => [{ type: 'Browser', memory: { workingSetSize: 100 } }, { type: 'GPU', memory: { workingSetSize: 25 } }] });
    const before = process.listeners('unhandledRejection');
    const stop = installCrashLog(host as unknown as App);
    try {
      const rejection = process.listeners('unhandledRejection').find(listener => !before.includes(listener))!;
      rejection(new Error('rejected'), Promise.resolve());
      const renderBefore = crashCounts.renderGone, childBefore = crashCounts.childGone;
      for (const window of ['pet', 'bubble', 'chat', 'settings']) {
        const webContents = new EventEmitter(); watchRenderer({ webContents } as BrowserWindow, window);
        webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 9 });
      }
      host.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 12, serviceName: 'gpu', name: 'gpu-name' });
      vi.advanceTimersByTime(599_999); expect(records(path).some(record => record.category === 'mem')).toBe(false);
      vi.advanceTimersByTime(1);
      const entries = records(path);
      expect(entries[0]).toMatchObject({ category: 'start', data: { version: '0.1.0', packaged: true, platform: process.platform, userData: path } });
      expect(entries.find(record => record.category === 'main-rejection')?.data).toMatchObject({ message: 'rejected', stack: expect.stringContaining('rejected') });
      expect(entries.filter(record => record.category === 'render-gone').map(record => record.data)).toEqual(
        ['pet', 'bubble', 'chat', 'settings'].map(window => ({ window, reason: 'crashed', exitCode: 9 })));
      expect(entries.find(record => record.category === 'child-gone')?.data).toEqual({ type: 'GPU', reason: 'crashed', exitCode: 12, serviceName: 'gpu', name: 'gpu-name' });
      expect(entries.find(record => record.category === 'mem')?.data).toMatchObject({ rss: expect.any(Number), heapUsed: expect.any(Number), workingSetSize: 125,
        processes: [{ type: 'Browser', workingSetSize: 100 }, { type: 'GPU', workingSetSize: 25 }] });
      expect(crashCounts.renderGone - renderBefore).toBe(4); expect(crashCounts.childGone - childBefore).toBe(1);
    } finally { stop(); }
    expect(process.listeners('unhandledRejection')).toEqual(before);
    expect(host.listenerCount('child-process-gone')).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('uncaughtException 写盘后保留默认非零退出，不吞掉异常', () => {
    const path = directory();
    const bundle = buildSync({ entryPoints: ['src/main/crashLog.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
    const script = join(path, 'fixture.cjs');
    writeFileSync(script, bundle.outputFiles[0]!.text + `\ninstallCrashLog({ getPath: () => ${JSON.stringify(path)}, getVersion: () => 'test', on() {} });\nthrow new Error('fatal-fixture');`);
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(result.status).toBe(1); expect(result.stderr).toContain('fatal-fixture');
    expect(records(path).find(record => record.category === 'main-exception')?.data).toMatchObject({ message: 'fatal-fixture', stack: expect.stringContaining('fixture.cjs') });
  });
});
