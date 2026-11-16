import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { BehaviorMachine } from '../src/renderer/behavior/machine';
import type { MoveRequest, MoveResult, Point, Rect } from '../src/shared/types';

// Exercise the real main-process handlers with a native-window double, without Electron/GUI.
const host = vi.hoisted(() => ({
  start: undefined as undefined | (() => Promise<void>),
  handlers: new Map<string, (...args: any[]) => any>(),
  invokes: new Map<string, (...args: any[]) => any>(),
  events: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (() => void)[]>(),
  menu: [] as any[],
  bridge: undefined as import('../src/shared/types').PetBridge | undefined,
  rendererOn: vi.fn(), rendererOff: vi.fn(),
  bounds: { x: 340, y: 90, width: 320, height: 420 },
  area: { x: 0, y: 0, width: 1000, height: 800 },
  visible: false,
  send: vi.fn(),
  frame: {},
  contents: undefined as any,
  save: vi.fn(),
  savedPosition: { x: 340, y: 90 } as Point | null,
  ignore: vi.fn(),
  commandLine: { getSwitchValue: vi.fn(() => ''), appendSwitch: vi.fn() },
  options: {} as any,
}));

vi.mock('electron', () => {
  class BrowserWindow {
    constructor(bounds: Rect) { host.options = bounds; host.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; }
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
    setIgnoreMouseEvents = host.ignore;
    on = (name: string, callback: () => void) => host.listeners.set(name, [...(host.listeners.get(name) ?? []), callback]);
    once = (name: string, callback: () => void) => host.events.set(name, callback);
    loadFile = vi.fn();
    loadURL = vi.fn();
  }
  return { BrowserWindow, contextBridge: { exposeInMainWorld: (_name: string, bridge: import('../src/shared/types').PetBridge) => { host.bridge = bridge; } },
    ipcRenderer: { on: host.rendererOn, removeListener: host.rendererOff }, safeStorage: { isAsyncEncryptionAvailable: async () => false },
    app: { commandLine: host.commandLine, whenReady: () => ({ then: (start: () => Promise<void>) => {
      host.start = start; return { catch: vi.fn() };
    } }), on: vi.fn(), getPath: () => '/unused-fixture', dock: { hide: vi.fn() } },
    ipcMain: { on: (name: string, callback: (...args: any[]) => any) => host.handlers.set(name, callback),
      handle: (name: string, callback: (...args: any[]) => any) => host.invokes.set(name, callback) },
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
  host.handlers.clear(); host.invokes.clear(); host.events.clear(); host.listeners.clear(); host.send.mockClear(); host.save.mockClear();
  await import('../src/main/index');
  await host.start!();
  host.events.get('ready-to-show')!();
}

describe('可见性与移动 IPC（原生窗口替身，无 GUI）', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('__dirname', fileURLToPath(new URL('../out', import.meta.url)));
    host.area = { x: 0, y: 0, width: 1000, height: 800 };
    host.savedPosition = { x: 340, y: 90 };
    host.visible = false; host.bounds = { x: 340, y: 90, width: 320, height: 420 };
    await boot();
  });
  afterEach(() => { Object.defineProperty(process, 'platform', platform); host.send.mockReset(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('preload 的 onActivity 订阅并正确解除 pet:activity，不传出 Electron event', async () => {
    await import('../src/preload/index');
    const callback = vi.fn();
    const unsubscribe = host.bridge!.onActivity(callback);
    const [channel, listener] = host.rendererOn.mock.calls.at(-1)!;
    expect(channel).toBe('pet:activity');
    listener({ sender: 'fixture' }, 'jumpRope'); expect(callback).toHaveBeenCalledExactlyOnceWith('jumpRope');
    unsubscribe(); expect(host.rendererOff).toHaveBeenLastCalledWith(channel, listener);
  });

  it('玩耍子菜单通过 pet:activity 分别发送跳绳和吹泡泡', () => {
    const menu = host.menu.find(item => item.label === '玩耍');
    expect(menu.submenu.map((item: any) => item.label)).toEqual(['跳绳', '吹泡泡']);
    menu.submenu[0].click(); expect(host.send).toHaveBeenLastCalledWith('pet:activity', 'jumpRope');
    menu.submenu[1].click(); expect(host.send).toHaveBeenLastCalledWith('pet:activity', 'blowBubbles');
  });

  it('Windows 正式窗口禁用后台降频；blur/focus 即使没有拖动也重设穿透，外部窗口激活后轮询兜底', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    host.commandLine.appendSwitch.mockClear();
    await boot();
    expect(host.commandLine.appendSwitch).toHaveBeenCalledWith('disable-features', 'CalculateNativeWinOcclusion');
    expect(host.commandLine.appendSwitch).toHaveBeenCalledWith('disable-renderer-backgrounding');
    expect(host.options.webPreferences).toMatchObject({ offscreen: false, backgroundThrottling: false });
    host.ignore.mockClear();
    host.listeners.get('blur')!.forEach(callback => callback());
    expect(host.ignore).toHaveBeenCalledExactlyOnceWith(true, { forward: true });
    host.ignore.mockClear();
    host.listeners.get('focus')!.forEach(callback => callback());
    expect(host.ignore).toHaveBeenCalledExactlyOnceWith(true, { forward: true });
    send('pet:hit', true);
    host.ignore.mockClear(); host.send.mockClear();
    vi.advanceTimersByTime(1050);
    expect(host.send.mock.calls.filter(([channel]) => channel === 'pet:cursor').length).toBeGreaterThan(55);
    expect(host.ignore).toHaveBeenCalledWith(false, { forward: true });
  });

  it('拖动失焦取消并可再次拖动，不因没有 pointerup 持续跟随', () => {
    send('pet:hit', true); send('pet:drag-start');
    host.bounds.x += 30;
    vi.advanceTimersByTime(20);
    host.listeners.get('blur')!.forEach(callback => callback());
    expect(host.send).toHaveBeenCalledWith('pet:press', false);
    const held = { ...host.bounds }; host.send.mockClear();
    vi.advanceTimersByTime(100);
    expect(host.bounds).toEqual(held);
    expect(host.send).not.toHaveBeenCalledWith('pet:drag', expect.objectContaining({ active: true }));
    send('pet:drag-start');
    expect(host.send).toHaveBeenCalledWith('pet:press', true);
    send('pet:drag-end', true);
  });

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

  it.each([{ x: 300, y: 546 }, { x: 1400, y: 200 }])('首次取景前配置保留保存位置 %j，取景后才回写实际位置', async (position) => {
    host.area = { x: 0, y: 0, width: 1440, height: 900 };
    host.savedPosition = position;
    await boot();
    const config = () => host.invokes.get('pet:config')!({ sender: host.contents, senderFrame: host.frame });
    host.listeners.get('move')?.forEach(callback => callback());
    vi.advanceTimersByTime(250);
    expect(config().position).toEqual(position);
    expect(host.save).not.toHaveBeenCalled();
    send('pet:framed', { aspect: 1.0175, headTop: 0.1 });
    const expected = position.x === 300 ? position : { x: 1080, y: 546 };
    expect(config().position).toEqual(expected);
    if (position.x === 300) expect(host.save).not.toHaveBeenCalled();
    else expect(host.save).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ position: expected }));
  });

  it('首次取景采用期间实际移动的位置，不回退到启动快照', () => {
    const config = () => host.invokes.get('pet:config')!({ sender: host.contents, senderFrame: host.frame });
    for (const position of [{ x: 100, y: 200 }, { x: 340, y: 90 }]) {
      host.bounds = { ...host.bounds, ...position };
      host.listeners.get('move')?.forEach(callback => callback());
      expect(config().position).toEqual(position);
      vi.advanceTimersByTime(250);
      expect(host.save).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ position }));
    }
    host.bounds = { ...host.bounds, x: 110, y: 210 };
    host.listeners.get('move')?.forEach(callback => callback());
    // Framing can arrive before the debounced disk save.
    send('pet:framed', { aspect: 1.0175, headTop: 0.1 });
    expect(host.bounds).toEqual({ x: 110, y: 210, width: 320, height: 314 });
    expect(config().position).toEqual({ x: 110, y: 210 });
  });
});
