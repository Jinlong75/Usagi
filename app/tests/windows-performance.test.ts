import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureWindowsRendering } from '../src/main/performance';
import { startTickLoop } from '../src/main/timing';
import { easeInOut, WindowMotion } from '../src/main/motion';
import { FpsLog } from '../src/main/fps';
import { FrameStats, formatFps, renderPixelRatio } from '../src/shared/performance';
import { smoothDirection } from '../src/renderer/behaviors/look';
import { DEFAULT_CONFIG, normalizeConfig, readConfig, writeConfig } from '../src/main/config';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Windows 渲染策略，平台可注入', () => {
  it('仅 Windows 限制高 DPI，低 DPI 与 macOS/Linux 保持原值', () => {
    expect(renderPixelRatio(1.75, 'win32')).toBe(1.25);
    expect(renderPixelRatio(1.5, 'win32')).toBe(1.25);
    expect(renderPixelRatio(1, 'win32')).toBe(1);
    expect(renderPixelRatio(2, 'darwin')).toBe(2);
    expect(renderPixelRatio(1.75, 'linux')).toBe(1.75);
  });
  it('遮挡和后台开关仅在 Windows 加入，保留既有禁用项且去重', () => {
    const commandLine = { getSwitchValue: vi.fn(() => 'ExistingFeature,CalculateNativeWinOcclusion'), appendSwitch: vi.fn() };
    configureWindowsRendering(commandLine, 'darwin');
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
    configureWindowsRendering(commandLine, 'win32');
    expect(commandLine.appendSwitch).toHaveBeenCalledWith('disable-features', 'ExistingFeature,CalculateNativeWinOcclusion');
    expect(commandLine.appendSwitch).toHaveBeenCalledWith('disable-renderer-backgrounding');
    commandLine.getSwitchValue.mockReturnValue('ExistingFeature');
    configureWindowsRendering(commandLine, 'win32');
    expect(commandLine.appendSwitch).toHaveBeenCalledWith('disable-features', 'ExistingFeature,CalculateNativeWinOcclusion');
  });
});

describe('粗粒度时钟与逐帧平滑', () => {
  it('15.6ms 向上取整的定时器不累积漂移，移动依真实时间缓动；取消无残留', () => {
    vi.useFakeTimers();
    const originalTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay = 0) =>
      originalTimeout(callback, Math.ceil(Number(delay) / 15.6) * 15.6)) as typeof setTimeout);
    let point = [0, 50];
    const positions: { time: number; x: number }[] = [];
    const began = performance.now();
    const done = vi.fn();
    const motion = new WindowMotion({ getPosition: () => point, setPosition: (x, y) => {
      point = [x, y]; positions.push({ time: performance.now() - began, x });
    } }, done);
    motion.move({ x: 1000, y: 50, durationMs: 1000 });
    vi.advanceTimersByTime(1020);
    expect(positions.length).toBeGreaterThanOrEqual(55); // Naive 16.7ms interval rounded to 31.2ms yields only ~32.
    expect(positions.length).toBeLessThanOrEqual(62);
    for (const position of positions) expect(position.x).toBe(Math.round(1000 * easeInOut(position.time / 1000)));
    expect(point).toEqual([1000, 50]);
    expect(done).toHaveBeenCalledExactlyOnceWith({ ok: true, distance: 1000 });
    expect(vi.getTimerCount()).toBe(0);
    motion.move({ x: 0, y: 50, durationMs: 1000 });
    vi.advanceTimersByTime(100); motion.cancel();
    const held = [...point]; vi.advanceTimersByTime(1000);
    expect(point).toEqual(held); expect(vi.getTimerCount()).toBe(0);
  });
  it('阻塞后跳过错过的 tick，不补发风暴，并可在回调中停止', () => {
    vi.useFakeTimers(); let now = 0; let count = 0;
    const stop = startTickLoop(() => { count++; now += 300; if (count === 2) stop(); }, 10, () => now);
    vi.advanceTimersByTime(10); expect(count).toBe(1);
    vi.advanceTimersByTime(10); expect(count).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('看向目标逐帧收敛且不越过，30/60Hz 相同时间给出相同结果', () => {
    const target = { x: 1, y: -1 };
    const first = smoothDirection({ x: 0, y: 0 }, target, 1 / 60);
    expect(first.x).toBeGreaterThan(0); expect(first.x).toBeLessThan(1);
    let a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) a = smoothDirection(a, target, 1 / 60);
    for (let i = 0; i < 30; i++) b = smoothDirection(b, target, 1 / 30);
    expect(a.x).toBeCloseTo(1, 4); expect(a.y).toBeCloseTo(-1, 4);
    expect(a.x).toBeCloseTo(b.x, 12);
    expect(smoothDirection(a, target, 0)).toEqual(a);
  });
});

describe('帧率诊断', () => {
  it('只统计最近一秒，保留慢帧；重置不会计入隐藏时间', () => {
    const stats = new FrameStats();
    expect(stats.frame(0)).toBeUndefined();
    for (let i = 1; i <= 60; i++) stats.frame(i * 1000 / 60);
    expect(stats.frame(1016.6666666667)?.fps).toBeCloseTo(60);
    const slow = stats.frame(1216.6666666667)!;
    expect(slow.maxFrameMs).toBeCloseTo(200);
    expect(slow.fps).toBeLessThan(60);
    for (let i = 1; i <= 70; i++) stats.frame(1216.6666666667 + i * 1000 / 60);
    expect(stats.frame(2400)?.maxFrameMs).toBeCloseTo(1000 / 60);
    stats.reset(); expect(stats.frame(50_000)).toBeUndefined();
    expect(formatFps(stats.frame(50_020)!)).toBe('FPS 50.0 · 最长帧 20.0 ms');
  });
  it('开关默认关闭，严格布尔值，可写盘并重启读取；日志一行与屏幕同格式、限频且拒绝非法值', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'usagi-fps-test-'));
    try {
      expect(DEFAULT_CONFIG.showFps).toBe(false);
      expect(normalizeConfig({ showFps: 'true' }).showFps).toBe(false);
      const path = join(directory, 'config.json');
      writeConfig(path, { ...DEFAULT_CONFIG, showFps: true });
      expect(readConfig(path).showFps).toBe(true);
      let now = 0;
      const logger = new FpsLog(directory, () => now);
      await logger.record({ fps: Infinity, maxFrameMs: 20 });
      await logger.record({ fps: 50, maxFrameMs: NaN });
      await logger.record({ fps: 50, maxFrameMs: 20 });
      await logger.record({ fps: 25, maxFrameMs: 40 });
      now = 10_000; await logger.record({ fps: 25, maxFrameMs: 40 });
      const lines = (await readFile(join(directory, 'logs/fps.log'), 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/Z FPS 50\.0 · 最长帧 20\.0 ms$/);
      expect(lines[1]).toMatch(/Z FPS 25\.0 · 最长帧 40\.0 ms$/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
