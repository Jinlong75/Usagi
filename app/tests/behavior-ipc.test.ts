import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { BehaviorMachine } from '../src/renderer/behavior/machine';
import type { MoveRequest, MoveResult, Point, Rect } from '../src/shared/types';

// Exercise the real main-process handlers with a native-window double, without Electron/GUI.
const host = vi.hoisted(() => ({
  start: undefined as undefined | (() => Promise<void>),
  handlers: new Map<string, (...args: any[]) => any>(),
  events: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (() => void)[]>(),
  menu: [] as any[],
  bounds: { x: 340, y: 90, width: 320, height: 420 },
  area: { x: 0, y: 0, width: 1000, height: 800 },
  visible: false,
  send: vi.fn(),
  frame: {},
  contents: undefined as any,
  save: vi.fn(),
  savedPosition: { x: 340, y: 90 } as Point | null,
}));

vi.mock('electron', () => {
  class BrowserWindow {
    constructor(bounds: Rect) { host.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; }
    webContents = host.contents = { send: host.send, mainFrame: host.frame,
      setWindowOpenHandler: vi.fn(), on: vi.fn() };
    isVisible() { return host.visible; }
    isDestroyed() { return false; }
    hide() { host.visible = false; }
    showInactive() { host.visible = true; }
    getBounds() { return { ...host.bounds }; }
    getPosition() { return [host.bounds.x, host.bounds.y]; }
    setPosition(x: number, y: number) { host.bounds = { ...host.bounds, x, y }; }
    setBounds(bounds: Rect) {
      const moved = bounds.x !== host.bounds.x || bounds.y !== host.bounds.y;
      host.bounds = { ...bounds };
      if (moved) host.listeners.get('move')?.forEach(callback => callback());
    }
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    on = (name: string, callback: () => void) => host.listeners.set(name, [...(host.listeners.get(name) ?? []), callback]);
    once = (name: string, callback: () => void) => host.events.set(name, callback);
    loadFile = vi.fn();
    loadURL = vi.fn();
  }
  return { BrowserWindow, safeStorage: { isAsyncEncryptionAvailable: async () => false },
    app: { whenReady: () => ({ then: (start: () => Promise<void>) => {
      host.start = start; return { catch: vi.fn() };
    } }), on: vi.fn(), getPath: () => '/unused-fixture', dock: { hide: vi.fn() } },
    ipcMain: { on: (name: string, callback: (...args: any[]) => any) => host.handlers.set(name, callback), handle: vi.fn() },
    Menu: { buildFromTemplate: (menu: any[]) => menu },
    Tray: class { setContextMenu(menu: any[]) { host.menu = menu; } setToolTip() {} },
    nativeImage: { createFromBitmap: () => ({ setTemplateImage: vi.fn() }), createFromPath: () => ({ setTemplateImage: vi.fn() }) },
    screen: { getPrimaryDisplay: () => ({ workArea: host.area }),
      getAllDisplays: () => [{ workArea: host.area }], getDisplayMatching: () => ({ workArea: host.area }),
      getCursorScreenPoint: () => ({ x: 400, y: 100 }) },
  };
});
vi.mock('../src/main/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/main/config')>();
  return { ...original, readConfig: () => ({ ...structuredClone(original.DEFAULT_CONFIG), position: host.savedPosition }), writeConfig: host.save };
});

function send(channel: string, value?: unknown): void {
  host.handlers.get(channel)!({ sender: host.contents, senderFrame: host.frame }, value);
}
const request: MoveRequest = { x: 520, y: 90, durationMs: 2000 };

async function boot(): Promise<void> {
  vi.clearAllTimers(); vi.resetModules();
  host.handlers.clear(); host.events.clear(); host.listeners.clear(); host.send.mockClear(); host.save.mockClear();
  await import('../src/main/index');
  await host.start!();
  host.events.get('ready-to-show')!();
}

describe('可见性与移动 IPC（原生窗口替身，无 GUI）', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('__dirname', fileURLToPath(new URL('../out', import.meta.url)));
    host.area = { x: 0, y: 0, width: 1000, height: 800 };
    host.savedPosition = { x: 340, y: 90 };
    host.visible = false; host.bounds = { x: 340, y: 90, width: 320, height: 420 };
    await boot();
  });
  afterEach(() => { host.send.mockReset(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('托盘 hide/showInactive 显式通知渲染器，隐藏时等待不会重新掷骰，显示从 idle 开始', () => {
    let now = 0;
    const random = vi.fn(() => 0.9);
    const machine = new BehaviorMachine(random, () => now);
    machine.click(); random.mockClear();
    host.send.mockImplementation((channel, payload) => {
      if (channel === 'pet:visibility') machine.visibility(payload.visible);
    });
    host.menu[0].click();
    expect(host.visible).toBe(false);
    expect(host.send).toHaveBeenCalledWith('pet:visibility', { visible: false });
    now = 60_000; expect(machine.tick(null).state).toBe('idle');
    expect(random).not.toHaveBeenCalled();
    host.menu[0].click();
    expect(host.visible).toBe(true);
    expect(host.send).toHaveBeenLastCalledWith('pet:visibility', { visible: true });
    expect(machine.tick(null)).toMatchObject({ state: 'idle', startedAt: 60_000 });
    host.send.mockReset();
  });

  it.each(['hidden', 'dragging', 'invalid-target'] as const)('以 %s 拒绝时确实回 ok:false，状态机立即离开 move', (reason) => {
    let now = 0;
    const machine = new BehaviorMachine(() => 0.9, () => now);
    const info = { bounds: host.bounds, workArea: host.area };
    now = 3500; machine.tick(info); now += 450; machine.tick(info);
    expect(machine.snapshot.state).toBe('move');
    host.send.mockImplementation((channel, result: MoveResult) => {
      if (channel === 'pet:move-done') machine.moveDone(result);
    });
    if (reason === 'hidden') host.visible = false;
    if (reason === 'dragging') { send('pet:hit', true); send('pet:drag-start'); }
    send('pet:move-to', reason === 'invalid-target' ? { ...request, x: NaN } : request);
    expect(host.send).toHaveBeenCalledWith('pet:move-done', { ok: false, reason });
    expect(machine.snapshot.state).toBe('idle');
    host.send.mockReset();
  });

  it('主进程安全裁剪后按实际距离重算时长，完成回执返回实际距离并保存', () => {
    send('pet:framed', { aspect: 320 / 420, headTop: 0.1 });
    host.bounds.x = 750;
    send('pet:move-to', { x: 690, y: 90, durationMs: 60 / 90 * 1000 });
    vi.advanceTimersByTime(500);
    expect(host.bounds.x).toBeGreaterThan(660);
    expect(host.bounds.x).toBeLessThan(750);
    expect(host.send).not.toHaveBeenCalledWith('pet:move-done', expect.anything());
    vi.advanceTimersByTime(520);
    expect(host.bounds).toMatchObject({ x: 660, y: 90 });
    expect(host.send).toHaveBeenCalledWith('pet:move-done', { ok: true, distance: 90 });
    expect(host.save).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ position: { x: 660, y: 90 } }));
  });

  it.each([{ x: 300, y: 200 }, { x: 300, y: 546 }])('启动至首次取景按实际高度恢复 %j，连续两次重启不漂移', async (position) => {
    host.area = { x: 0, y: 0, width: 1440, height: 900 };
    host.savedPosition = position;
    for (let restart = 0; restart < 2; restart++) {
      await boot();
      // Startup still has the legacy 420px height, including a fallback for y=546.
      expect(host.bounds.height).toBe(420);
      host.listeners.get('move')?.forEach(callback => callback());
      vi.advanceTimersByTime(250);
      expect(host.save).not.toHaveBeenCalled();
      send('pet:framed', { aspect: 1.0175, headTop: 0.1 });
      expect(host.bounds).toEqual({ ...position, width: 320, height: 314 });
      // A renderer resize reports framing again. It must not shift the restored position.
      send('pet:framed', { aspect: 1.0175, headTop: 0.1 });
      expect(host.bounds).toEqual({ ...position, width: 320, height: 314 });
      host.listeners.get('move')?.forEach(callback => callback());
      vi.advanceTimersByTime(250);
      const saved = host.save.mock.lastCall![1];
      expect(saved.position).toEqual(position);
      host.savedPosition = structuredClone(saved.position);
    }
  });

  it.each([null, { x: 1400, y: 200 }])('没有有效保存位置 %j 时首次取景保持默认窗口底边', async (position) => {
    host.area = { x: 0, y: 0, width: 1440, height: 900 };
    host.savedPosition = position;
    await boot();
    const bottom = host.bounds.y + host.bounds.height;
    send('pet:framed', { aspect: 1.0175, headTop: 0.1 });
    expect(host.bounds).toEqual({ x: 1080, y: 546, width: 320, height: 314 });
    expect(host.bounds.y + host.bounds.height).toBe(bottom);
  });
});
