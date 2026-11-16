import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { BehaviorMachine } from '../src/renderer/behavior/machine';
import type { FeedRequest, MoveRequest, MoveResult, Point, Rect } from '../src/shared/types';

// Exercise the real main-process handlers with a native-window double, without Electron/GUI.
const host = vi.hoisted(() => ({
  nativeWindows: [] as import('../src/main/perch/logic').WindowInfo[],
  nativeReads: 0, fullscreenReads: 0, fullscreen: false, cursor: { x: 400, y: 100 },
  routineOptions: undefined as import('../src/main/routine').RoutineOptions | undefined,
  rendererSend: vi.fn(),
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
    ipcRenderer: { send: host.rendererSend, on: host.rendererOn, removeListener: host.rendererOff }, safeStorage: { isAsyncEncryptionAvailable: async () => false },
    powerMonitor: { on: vi.fn(), getSystemIdleTime: () => 0 },
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
      getCursorScreenPoint: () => ({ ...host.cursor }) },
  };
});
vi.mock('../src/main/perch/windows', () => ({ createWindowReader: () => ({
  list: () => { host.nativeReads++; return host.nativeWindows; },
  fullscreen: () => { host.fullscreenReads++; return host.fullscreen; }, available: true,
}) }));
vi.mock('../src/main/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/main/config')>();
  return { ...original, readConfig: () => ({ ...structuredClone(original.DEFAULT_CONFIG), position: host.savedPosition }), writeConfig: host.save };
});

vi.mock('../src/main/routine', async importOriginal => {
  const original = await importOriginal<typeof import('../src/main/routine')>();
  return { ...original, Routine: class {
    constructor(options: import('../src/main/routine').RoutineOptions) { host.routineOptions = options; }
    start() {} stop() {} markAway() {} resting = false;
  } };
});

function send(channel: string, value?: unknown): void {
  host.handlers.get(channel)!({ sender: host.contents, senderFrame: host.frame }, value);
}
function latestFeed(): FeedRequest {
  return host.send.mock.calls.filter(([channel]) => channel === 'pet:activity').at(-1)![1];
}
const request: MoveRequest = { x: 520, y: 90, durationMs: 2000 };

async function boot(): Promise<void> {
  vi.clearAllTimers(); vi.resetModules();
  host.nativeWindows = []; host.nativeReads = 0; host.fullscreenReads = 0; host.fullscreen = false; host.cursor = { x: 400, y: 100 };
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
    const request: FeedRequest = { activity: 'eatRiceball', feedId: 42 };
    listener({ sender: 'fixture' }, request); expect(callback).toHaveBeenLastCalledWith(request);
    unsubscribe(); expect(host.rendererOff).toHaveBeenLastCalledWith(channel, listener);
  });

  it('玩耍子菜单通过 pet:activity 分别发送跳绳和吹泡泡', () => {
    const menu = host.menu.find(item => item.label === '玩耍');
    expect(menu.submenu.map((item: any) => item.label)).toEqual(['跳绳', '吹泡泡']);
    menu.submenu[0].click(); expect(host.send).toHaveBeenLastCalledWith('pet:activity', 'jumpRope');
    menu.submenu[1].click(); expect(host.send).toHaveBeenLastCalledWith('pet:activity', 'blowBubbles');
  });

  it('喂食子菜单在玩耍上方，三项发正确 IPC，偷吃不进菜单；preload 上报完成', async () => {
    const index = host.menu.findIndex(item => item.label === '喂食');
    expect(index).toBeLessThan(host.menu.findIndex(item => item.label === '玩耍'));
    const menu = host.menu[index];
    expect(menu.submenu.map((item: any) => item.label)).toEqual(['饭团', '西瓜', '冰淇淋']);
    for (const [i, activity] of ['eatRiceball', 'eatWatermelon', 'iceCream'].entries()) {
      menu.submenu[i].click(); expect(host.send).toHaveBeenLastCalledWith('pet:activity', { activity, feedId: i + 1 });
    }
    await import('../src/preload/index');
    const request: FeedRequest = { activity: 'eatRiceball', feedId: 42 };
    host.bridge!.activityDone(request);
    expect(host.rendererSend).toHaveBeenLastCalledWith('pet:activity-done', request);
  });

  it.each(['07:30', '12:00', '18:30'])('%s 问话出现后两分钟内喂食，实际吃完才冒好吃 3.2 秒；重复/非可信回执不生效', async time => {
    const { UiController } = await import('../src/main/ipc/ui');
    const { BubbleWindow } = await import('../src/main/windows/bubble');
    const question = vi.spyOn(UiController.prototype, 'showRoutine').mockResolvedValue();
    const show = vi.spyOn(BubbleWindow.prototype, 'showBubble').mockResolvedValue();
    vi.setSystemTime(new Date(`2026-11-17T${time}:00`));
    await host.routineOptions!.show('吃饭了吗？', 10000, true);
    expect(question).toHaveBeenCalledWith('吃饭了吗？', 10000, true);
    vi.advanceTimersByTime(120000);
    const menu = host.menu.find(item => item.label === '喂食');
    for (const [i, activity] of ['eatRiceball', 'eatWatermelon', 'iceCream'].entries()) {
      // Each menu selection qualifies against its own recent question.
      if (i > 0) await host.routineOptions!.show('吃饭了吗？', 10000, true);
      show.mockClear(); menu.submenu[i].click(); expect(show).not.toHaveBeenCalled();
      const request = latestFeed();
      expect(request.activity).toBe(activity);
      host.handlers.get('pet:activity-done')!({ sender: {}, senderFrame: host.frame }, request);
      send('pet:activity-done', { ...request, activity: 'jumpRope' });
      for (const invalid of [null, activity, {}, { activity }, { feedId: request.feedId }]) send('pet:activity-done', invalid);
      expect(show).not.toHaveBeenCalled();
      vi.advanceTimersByTime(6000); show.mockClear(); send('pet:activity-done', request);
      expect(show).toHaveBeenCalledExactlyOnceWith('呀哈！（好吃！）', 3200);
      send('pet:activity-done', request); expect(show).toHaveBeenCalledTimes(1);
    }
    question.mockRestore(); show.mockRestore();
  });

  it('连续两次选择饭团：迟到的第一轮回执不清除第二轮、不提前冒泡，第二轮完成只冒一次', async () => {
    const { UiController } = await import('../src/main/ipc/ui');
    const { BubbleWindow } = await import('../src/main/windows/bubble');
    const question = vi.spyOn(UiController.prototype, 'showRoutine').mockResolvedValue();
    const show = vi.spyOn(BubbleWindow.prototype, 'showBubble').mockResolvedValue();
    vi.setSystemTime(new Date('2026-11-17T12:00:00'));
    await host.routineOptions!.show('吃饭了吗？', 10000, true);
    const riceball = host.menu.find(item => item.label === '喂食').submenu[0];
    riceball.click(); const first = latestFeed();
    vi.advanceTimersByTime(1000);
    riceball.click(); const second = latestFeed();
    expect(first.activity).toBe('eatRiceball'); expect(second.activity).toBe('eatRiceball');
    expect(second.feedId).toBe(first.feedId + 1);
    vi.advanceTimersByTime(5000);
    send('pet:activity-done', first); expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    send('pet:activity-done', second);
    expect(show).toHaveBeenCalledExactlyOnceWith('呀哈！（好吃！）', 3200);
    send('pet:activity-done', first); send('pet:activity-done', second);
    expect(show).toHaveBeenCalledTimes(1);
    question.mockRestore(); show.mockRestore();
  });

  it.each(['no-question', 'expired', 'outside-meal', 'not-question', 'hidden', 'dragging'] as const)('%s 时喂食不冒好吃气泡', async reason => {
    const { UiController } = await import('../src/main/ipc/ui');
    const { BubbleWindow } = await import('../src/main/windows/bubble');
    const question = vi.spyOn(UiController.prototype, 'showRoutine').mockResolvedValue();
    const show = vi.spyOn(BubbleWindow.prototype, 'showBubble').mockResolvedValue();
    vi.setSystemTime(new Date('2026-11-17T12:00:00'));
    if (reason !== 'no-question') await host.routineOptions!.show('吃饭了吗？', 10000, reason !== 'not-question');
    if (reason === 'expired') vi.advanceTimersByTime(120001);
    if (reason === 'outside-meal') vi.setSystemTime(new Date('2026-11-17T16:00:00'));
    if (reason === 'hidden') host.visible = false;
    if (reason === 'dragging') { send('pet:hit', true); send('pet:drag-start'); }
    show.mockClear(); host.send.mockClear();
    host.menu.find(item => item.label === '喂食').submenu[0].click();
    if (reason === 'hidden' || reason === 'dragging') {
      expect(host.send).not.toHaveBeenCalledWith('pet:activity', expect.anything());
      send('pet:activity-done', { activity: 'eatRiceball', feedId: 1 });
    } else send('pet:activity-done', latestFeed());
    expect(show).not.toHaveBeenCalled();
    question.mockRestore(); show.mockRestore();
  });

  it('吃完已经离开午餐时段，不冒好吃', async () => {
    const { UiController } = await import('../src/main/ipc/ui');
    const { BubbleWindow } = await import('../src/main/windows/bubble');
    const question = vi.spyOn(UiController.prototype, 'showRoutine').mockResolvedValue();
    const show = vi.spyOn(BubbleWindow.prototype, 'showBubble').mockResolvedValue();
    vi.setSystemTime(new Date('2026-11-17T12:59:59'));
    await host.routineOptions!.show('吃饭了吗？', 10000, true);
    host.menu.find(item => item.label === '喂食').submenu[0].click();
    const request = latestFeed();
    vi.advanceTimersByTime(6000); send('pet:activity-done', request);
    expect(show).not.toHaveBeenCalled();
    question.mockRestore(); show.mockRestore();
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
  it('真实主进程接线：seat上报、拖放吸附、100ms跟随、菜单下来、拖动解除', () => {
    send('pet:framed', { aspect: 320 / 420, headTop: 0.1, seat: { x: 0.5, y: 0.8 } });
    host.nativeWindows = [{ id: 'target', bounds: { x: 100, y: 400, width: 600, height: 400 }, minimized: false }];
    send('pet:hit', true); send('pet:drag-start'); host.cursor.x += 50;
    vi.advanceTimersByTime(20); send('pet:drag-end', false); vi.advanceTimersByTime(200);
    expect(host.bounds.y + host.bounds.height * 0.8).toBe(400);
    expect(host.send).toHaveBeenCalledWith('pet:perch', { phase: 'sit', canHop: false });
    expect(host.menu.some(item => item.label === '下来')).toBe(true);
    host.nativeWindows[0]!.bounds.x += 100; host.nativeWindows[0]!.bounds.y += 50;
    vi.advanceTimersByTime(100);
    expect(host.bounds.x).toBe(490); expect(host.bounds.y + host.bounds.height * 0.8).toBe(450);
    host.menu.find(item => item.label === '下来').click(); vi.advanceTimersByTime(750);
    expect(host.bounds.y).toBe(340); expect(host.menu.some(item => item.label === '下来')).toBe(false);
    // Hop then drag: the seat follower must stop owning native motion.
    send('pet:perch-hop'); vi.advanceTimersByTime(1100);
    expect(host.menu.some(item => item.label === '下来')).toBe(true);
    send('pet:drag-start'); host.cursor.x += 50; vi.advanceTimersByTime(20);
    send('pet:drag-end', true);
    expect(host.menu.some(item => item.label === '下来')).toBe(false);
  });
  it('全屏每2秒刷新缓存，Routine检查不再读取系统', async () => {
    const { isForegroundFullscreen } = await import('../src/main/routine');
    vi.advanceTimersByTime(100); expect(host.fullscreenReads).toBe(1);
    host.fullscreen = true;
    for (let i = 0; i < 100; i++) expect(isForegroundFullscreen()).toBe(false);
    expect(host.fullscreenReads).toBe(1);
    vi.advanceTimersByTime(900);
    host.menu.find(item => item.label === '显示帧率').click({ checked: true }); // Forced window refresh must not delay the fullscreen deadline.
    expect(host.fullscreenReads).toBe(1);
    vi.advanceTimersByTime(1099); expect(isForegroundFullscreen()).toBe(false);
    vi.advanceTimersByTime(1); expect(isForegroundFullscreen()).toBe(true);
    expect(host.fullscreenReads).toBe(2);
  });
  it('preload传递seat和perch事件，保留sender隔离', async () => {
    await import('../src/preload/index');
    host.bridge!.framed(0.8, 0.1, { x: 0.5, y: 0.8 });
    expect(host.rendererSend).toHaveBeenCalledWith('pet:framed', { aspect: 0.8, headTop: 0.1, seat: { x: 0.5, y: 0.8 } });
    const callback = vi.fn(), unsubscribe = host.bridge!.onPerch(callback);
    const [channel, listener] = host.rendererOn.mock.calls.at(-1)!;
    expect(channel).toBe('pet:perch'); listener({}, { phase: 'sit', canHop: false });
    expect(callback).toHaveBeenCalledExactlyOnceWith({ phase: 'sit', canHop: false });
    unsubscribe(); expect(host.rendererOff).toHaveBeenCalledWith(channel, listener);
    host.bridge!.perchHop(); expect(host.rendererSend).toHaveBeenCalledWith('pet:perch-hop');
  });

});
