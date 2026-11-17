import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { coversDisplay, createWindowReader } from '../src/main/fullscreen';
import type { WindowInfo } from '../src/main/fullscreen';
import { cacheForegroundFullscreen, isForegroundFullscreen } from '../src/main/routine';
import type { Rect } from '../src/shared/types';

const area = { x: 0, y: 25, width: 1440, height: 875 };
const window = (id = 'one', bounds: Partial<Rect> = {}): WindowInfo =>
  ({ id, bounds: { x: 100, y: 400, width: 600, height: 400, ...bounds }, minimized: false, ownerPid: 123 });

describe('全屏检测', () => {
  it('完整bounds才全屏，workArea不算；四边容差2px，支持负坐标显示器', () => {
    const bounds = { x: -1440, y: 0, width: 1440, height: 900 };
    expect(coversDisplay(window('full', bounds), bounds)).toBe(true);
    expect(coversDisplay(window('work', { ...bounds, y: 25, height: 875 }), bounds)).toBe(false);
    expect(coversDisplay(window('tolerance', { x: -1438, y: 2, width: 1436, height: 896 }), bounds)).toBe(true);
    expect(coversDisplay(window('outside', { ...bounds, y: 3 }), bounds)).toBe(false);
    expect(coversDisplay({ ...window('min', bounds), minimized: true }, bounds)).toBe(false);
    expect(coversDisplay(undefined, bounds)).toBe(false);
    cacheForegroundFullscreen(true); expect(isForegroundFullscreen()).toBe(true);
    cacheForegroundFullscreen(false); expect(isForegroundFullscreen()).toBe(false);
  });
  it('koffi加载失败仅记录一行，全屏静默关闭且不会重试', () => {
    const log = vi.fn(), load = vi.fn(() => { throw new Error('missing binary'); });
    const reader = createWindowReader({ load, log });
    expect(reader.list()).toEqual([]); expect(reader.list()).toEqual([]);
    expect(reader.fullscreen([], () => area)).toBe(false); expect(reader.available).toBe(false);
    expect(log).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(1);
  });
  it('系统调用失败被捕获，不抛给主进程', () => {
    const log = vi.fn();
    const reader = createWindowReader({ platform: 'win32', log, load: () => ({
      struct: () => ({}), proto: () => ({}), pointer: () => ({}),
      load: () => ({ func: (...args: unknown[]) => args[1] === 'EnumWindows' ? () => { throw new Error('API error'); } : () => 0 }),
    }) as never });
    expect(() => reader.list()).not.toThrow(); expect(reader.available).toBe(false);
    expect(reader.fullscreen([], () => area)).toBe(false); expect(log).toHaveBeenCalledTimes(1);
  });
  it('固定版本及两个目标架构预编译文件、asar解包声明齐全', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).dependencies.koffi).toBe('2.15.1');
    for (const arch of ['win32_x64', 'darwin_arm64']) expect(existsSync(`node_modules/koffi/build/koffi/${arch}/koffi.node`)).toBe(true);
    expect(readFileSync('electron-builder.yml', 'utf8')).toContain('node_modules/koffi/build/koffi/**/*.node');
  });
});

it('Windows适配按z序过滤桌面/任务栏/工具/无标题/隐藏UWP/小窗口/自身，物理坐标转DIP且前台匹配', () => {
  type Native = { id: number; cls?: string; visible?: boolean; titleLength?: number; style?: number; cloaked?: number; pid?: number; width?: number; minimized?: boolean };
  const natives: Native[] = [
    { id: 1, visible: false }, { id: 2, titleLength: 0 }, { id: 3, style: 0x80 }, { id: 4, cls: 'Progman' },
    { id: 5, cls: 'WorkerW' }, { id: 6, cls: 'Shell_TrayWnd' }, { id: 7, cls: 'Shell_SecondaryTrayWnd' },
    { id: 8, cloaked: 1 }, { id: 9, width: 200 }, { id: 10, pid: 999 }, { id: 11 }, { id: 12, minimized: true },
  ];
  let current: Native = natives[0]!;
  const bound = new Set<string>();
  const reader = createWindowReader({ platform: 'win32', pid: 999, toDip: r => ({ x: r.x / 2, y: r.y / 2, width: r.width / 2, height: r.height / 2 }),
    load: () => ({
      struct: () => ({}), proto: () => ({}), pointer: () => ({}), sizeof: () => 16, address: (w: Native) => BigInt(w.id),
      decode: () => ({ left: 200, top: 800, right: 200 + (current.width ?? 1200), bottom: 1600 }),
      load: () => ({ func: (...args: unknown[]) => {
        const name = args[0] === '__stdcall' ? String(args[1]) : String(args[0]); bound.add(name);
        if (name === 'EnumWindows') return (callback: (w: Native) => boolean) => {
          for (const w of natives) { current = w; if (!callback(w)) return false; } return true;
        };
        if (name.includes('IsWindowVisible')) return (w: Native) => w.visible !== false;
        if (name.includes('IsIconic')) return (w: Native) => !!w.minimized;
        if (name.includes('GetWindowTextLengthW')) return (w: Native) => w.titleLength ?? 5;
        if (name.includes('GetWindowLongPtrW')) return (w: Native) => w.style ?? 0;
        if (name.includes('GetWindowThreadProcessId')) return (w: Native, out: number[]) => { out[0] = w.pid ?? 123; return 1; };
        if (name.includes('GetClassNameW')) return (w: Native, out: Uint16Array) => { const s = w.cls ?? 'Ordinary'; out.set([...s].map(c => c.charCodeAt(0))); return s.length; };
        if (name.includes('DwmGetWindowAttribute')) return (w: Native, attr: number, out: Buffer) => { if (attr === 14) out.writeUInt32LE(w.cloaked ?? 0); return 0; };
        if (name.includes('GetForegroundWindow')) return () => natives.find(w => w.id === 11);
        throw new Error(`unexpected API ${name}`);
      } }),
    }) as never,
  });
  const windows = reader.list();
  expect(reader.available).toBe(true); expect(windows.map(w => w.id)).toEqual(['11', '12']);
  expect(windows[0]).toEqual({ id: '11', bounds: { x: 100, y: 400, width: 600, height: 400 }, minimized: false, ownerPid: 123 });
  expect(windows[1]!.minimized).toBe(true); expect(windows.every(w => !('title' in w))).toBe(true);
  expect(reader.fullscreen(windows, () => windows[0]!.bounds)).toBe(true);
  expect(reader.fullscreen(windows, () => area)).toBe(false);
  expect([...bound].some(name => /GetWindowTextW\(/.test(name))).toBe(false);
});

it('前台窗口调用失败只记录一次并永久关闭全屏检测', () => {
  const log = vi.fn(), foreground = vi.fn(() => { throw new Error('foreground failed'); });
  const reader = createWindowReader({ platform: 'win32', log, load: () => ({
    struct: () => ({}), proto: () => ({}), pointer: () => ({}),
    load: () => ({ func: (...args: unknown[]) => String(args[0]).includes('GetForegroundWindow') ? foreground
      : args[1] === 'EnumWindows' ? () => true : () => 0 }),
  }) as never });
  expect(reader.list()).toEqual([]);
  expect(reader.fullscreen([], () => area)).toBe(false);
  expect(reader.list()).toEqual([]);
  expect(reader.fullscreen([], () => area)).toBe(false);
  expect(reader.available).toBe(false);
  expect(log).toHaveBeenCalledTimes(1); expect(foreground).toHaveBeenCalledTimes(1);
});
