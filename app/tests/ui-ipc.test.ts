import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { ChatEvent } from '../src/main/chat/service';
const host = vi.hoisted(() => ({
  start: undefined as (() => Promise<void>) | undefined,
  invokes: new Map<string, (...args: any[]) => any>(), sends: new Map<string, (...args: any[]) => any>(),
  appEvents: new Map<string, (...args: any[]) => any>(), windows: [] as any[], menu: [] as any[],
  emit: (_event: ChatEvent) => {}, send: vi.fn(() => 'request-1'), stop: vi.fn(), save: vi.fn(),
  keySave: vi.fn(async (_key: string) => ({ persisted: false, reason: '仅本次有效' })),
  flush: vi.fn(async () => {}), sessionFlush: vi.fn(async () => {}),
  quit: vi.fn(), confirm: vi.fn(async () => ({ response: 0 })), popup: vi.fn(),
}));
vi.mock('electron', () => {
  class BrowserWindow {
    options: any; visible = false; destroyed = false;
    bounds = { x: 300, y: 300, width: 320, height: 420 };
    events = new Map<string, ((...args: any[]) => any)[]>();
    webContents = { mainFrame: {}, send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() };
    constructor(options: any) { this.options = options; this.bounds = { ...this.bounds, ...options }; host.windows.push(this); }
    on(name: string, fn: (...args: any[]) => any) { this.events.set(name, [...(this.events.get(name) ?? []), fn]); }
    once(name: string, fn: (...args: any[]) => any) { this.on(name, fn); }
    emit(name: string, ...args: any[]) { for (const fn of this.events.get(name) ?? []) fn(...args); }
    getBounds() { const { x, y, width, height } = this.bounds; return { x, y, width, height }; }
    getPosition() { return [this.bounds.x, this.bounds.y]; }
    setBounds(bounds: any) { this.bounds = { ...this.bounds, ...bounds }; }
    setPosition(x: number, y: number) { this.bounds.x = x; this.bounds.y = y; this.emit('move'); }
    isVisible() { return this.visible; } isDestroyed() { return this.destroyed; }
    hide() { this.visible = false; this.emit('hide'); }
    show() { this.visible = true; } showInactive = vi.fn(() => { this.visible = true; });
    destroy() { this.destroyed = true; }
    setAlwaysOnTop = vi.fn(); setVisibleOnAllWorkspaces = vi.fn(); setIgnoreMouseEvents = vi.fn();
    loadFile = vi.fn(async () => {}); loadURL = vi.fn(async () => {});
  }
  return { BrowserWindow,
    app: { whenReady: () => ({ then: (start: () => Promise<void>) => { host.start = start; return { catch: vi.fn() }; } }),
      on: (name: string, fn: (...args: any[]) => any) => host.appEvents.set(name, fn),
      getPath: () => '/unused-ui-fixture', getVersion: () => '0.1.0', dock: { hide: vi.fn() }, quit: host.quit },
    ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => host.invokes.set(name, fn),
      on: (name: string, fn: (...args: any[]) => any) => host.sends.set(name, fn) },
    Menu: { buildFromTemplate: (template: any[]) => Object.assign(template, { popup: host.popup }) },
    Tray: class { setContextMenu(template: any[]) { host.menu = template; } setToolTip() {} destroy() {} },
    nativeImage: { createFromBitmap: () => ({ setTemplateImage: vi.fn() }) }, safeStorage: {},
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 900 } }),
      getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1200, height: 900 } }],
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 900 } }),
      getCursorScreenPoint: () => ({ x: 450, y: 400 }) }, dialog: { showMessageBox: host.confirm },
  };
});
vi.mock('../src/main/config', async importOriginal => {
  const original = await importOriginal<typeof import('../src/main/config')>();
  return { ...original, readConfig: () => structuredClone(original.DEFAULT_CONFIG), writeConfig: host.save };
});
vi.mock('../src/main/ipc/keys', () => ({ AsyncKeyStore: class {
  load = async () => ({ apiKey: 'sk-123456789abcd', needsReentry: false }); save = host.keySave; flush = host.flush;
} }));
vi.mock('../src/main/chat/sessionStore', () => ({ SessionStore: class {
  load = async () => ({ messages: [] }); clear = async () => {}; flush = host.sessionFlush;
} }));
vi.mock('../src/main/chat/service', () => ({ ChatService: class {
  onEvent(fn: (event: ChatEvent) => void) { host.emit = fn; return () => {}; }
  send = host.send; stop = host.stop;
  testConnection = async () => ({ ok: true, models: ['deepseek-flash'] });
} }));
const pet = () => host.windows[0]!;
const event = (win: any) => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
const invoke = (channel: string, win: any, ...args: any[]) => host.invokes.get(channel)!(event(win), ...args);
const send = (channel: string, win: any, ...args: any[]) => host.sends.get(channel)!(event(win), ...args);
const item = (label: string) => host.menu.find(entry => entry.label === label)!;
async function open(label: string): Promise<any> { item(label).click(); await vi.advanceTimersByTimeAsync(0); return host.windows.at(-1)!; }

describe('008 主进程接线：原生窗口替身，无 GUI', () => {
  beforeEach(async () => {
    vi.useFakeTimers(); vi.resetModules(); vi.clearAllMocks();
    vi.stubGlobal('__dirname', fileURLToPath(new URL('../out', import.meta.url)));
    host.windows = []; host.invokes.clear(); host.sends.clear(); host.appEvents.clear();
    host.confirm.mockResolvedValue({ response: 0 }); host.flush.mockImplementation(async () => {});
    host.sessionFlush.mockImplementation(async () => {}); host.save.mockReset();
    await import('../src/main/index'); await host.start!(); pet().emit('ready-to-show');
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('菜单/设置双向同步并广播，不允许设置快照回退桌宠位置', async () => {
    const settings = await open('设置…');
    const initial = await invoke('settings:load', settings);
    expect(initial.maskedKey).toBe('sk-****abcd'); expect(initial).not.toHaveProperty('apiKey');
    item('自言自语').click({ checked: false });
    expect(item('自言自语').checked).toBe(false);
    expect(settings.webContents.send).toHaveBeenCalledWith('config:changed', expect.objectContaining({ selfTalk: expect.objectContaining({ enabled: false }) }));
    pet().setPosition(100, 200); await vi.advanceTimersByTimeAsync(200);
    const saved = await invoke('settings:save', settings, { ...initial.config, volume: 0.3, position: { x: 1, y: 2 },
      selfTalk: { ...initial.config.selfTalk, enabled: true } }, 'new-key');
    expect(saved.key).toEqual({ persisted: false, reason: '仅本次有效' });
    expect(saved.config.position).toEqual({ x: 100, y: 200 }); expect(saved.config.volume).toBe(0.3);
    expect(item('自言自语').checked).toBe(true); expect(host.keySave).toHaveBeenCalledWith('new-key');
    expect(host.save).toHaveBeenLastCalledWith(expect.any(String), saved.config);
    item('鼠标穿透').click({ checked: true }); await vi.advanceTimersByTimeAsync(0);
    const stale = await invoke('settings:save', settings, { ...initial.config, mousePassthrough: false });
    expect(stale.config.mousePassthrough).toBe(true);
    item('鼠标穿透').click({ checked: false });
    const preventDefault = vi.fn(); settings.emit('close', { preventDefault });
    expect(preventDefault).toHaveBeenCalled(); expect(settings.webContents.send).toHaveBeenCalledWith('settings:save-close');
    send('settings:close-ready', settings); expect(settings.visible).toBe(false);
  });
  it('整窗穿透不 forward；右键仅命中且穿透关闭时可弹出', async () => {
    send('pet:hit', pet(), true); send('pet:context-menu', pet()); expect(host.popup).toHaveBeenCalledTimes(1);
    item('鼠标穿透').click({ checked: true }); await vi.advanceTimersByTimeAsync(0);
    expect(pet().setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
    const bubble = host.windows.at(-1)!;
    expect(bubble.options).toMatchObject({ transparent: true, focusable: false, frame: false });
    expect(bubble.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(bubble.webContents.send).toHaveBeenCalledWith('bubble:text', expect.objectContaining({ text: '已开启鼠标穿透，在菜单栏图标里可以关掉哦' }));
    send('pet:context-menu', pet()); expect(host.popup).toHaveBeenCalledTimes(1);
    item('鼠标穿透').click({ checked: false }); expect(pet().setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });
  it('配置写盘抛 EACCES 时 IPC 返回失败，内存和界面状态保持原值，可重试', async () => {
    const settings = await open('设置…');
    const initial = await invoke('settings:load', settings);
    settings.webContents.send.mockClear(); pet().setAlwaysOnTop.mockClear();
    const error = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    host.save.mockImplementationOnce(() => { throw error; });
    const edited = { ...initial.config, volume: 0.2, chat: { ...initial.config.chat, model: 'custom-model' },
      selfTalk: { ...initial.config.selfTalk, enabled: false } };
    expect(await invoke('settings:save', settings, edited, 'new-key')).toEqual({ ok: false, reason: error.message });
    expect((await invoke('settings:load', settings)).config).toEqual(initial.config);
    expect(invoke('pet:config', pet())).toEqual(initial.config);
    expect(item('自言自语').checked).toBe(true);
    expect(settings.webContents.send).not.toHaveBeenCalledWith('config:changed', expect.anything());
    expect(pet().setAlwaysOnTop).not.toHaveBeenCalled(); expect(host.keySave).not.toHaveBeenCalled();
    const retried = await invoke('settings:save', settings, edited);
    expect(retried).toMatchObject({ ok: true, config: edited });
  });
  it('聊天发送、流式节流、完成表情和错误气泡；窗口关闭只隐藏', async () => {
    const chat = await open('和乌萨奇聊天');
    expect(await invoke('chat:send', chat, '你好')).toEqual({ requestId: 'request-1' });
    await vi.advanceTimersByTimeAsync(0); const bubble = host.windows.at(-1)!;
    expect(bubble.webContents.send).toHaveBeenCalledWith('bubble:text', expect.objectContaining({ text: '嗯……让我想想' }));
    host.emit({ type: 'delta', requestId: 'request-1', text: '呀哈' }); await vi.advanceTimersByTimeAsync(0);
    expect(bubble.webContents.send).toHaveBeenLastCalledWith('bubble:text', expect.objectContaining({ text: '呀哈' }));
    host.emit({ type: 'delta', requestId: 'request-1', text: '！' }); await vi.advanceTimersByTimeAsync(199);
    expect(bubble.webContents.send).toHaveBeenLastCalledWith('bubble:text', expect.objectContaining({ text: '呀哈' }));
    await vi.advanceTimersByTimeAsync(1);
    expect(bubble.webContents.send).toHaveBeenLastCalledWith('bubble:text', expect.objectContaining({ text: '呀哈！' }));
    host.emit({ type: 'done', requestId: 'request-1', text: '呀哈！', emotion: 'happy' }); await vi.advanceTimersByTimeAsync(0);
    expect(pet().webContents.send).toHaveBeenCalledWith('pet:expression', 'happy');
    await vi.advanceTimersByTimeAsync(5000);
    expect(bubble.webContents.send).toHaveBeenLastCalledWith('bubble:text', expect.objectContaining({ visible: false }));
    const preventDefault = vi.fn(); chat.emit('close', { preventDefault });
    expect(preventDefault).toHaveBeenCalled(); expect(chat.visible).toBe(false);
    item('和乌萨奇聊天').click(); await vi.advanceTimersByTimeAsync(0); expect(chat.visible).toBe(true);
    await invoke('chat:send', chat, '第二句');
    host.emit({ type: 'error', requestId: 'request-1', code: 'no_key', message: '请先填写 Key' });
    await vi.advanceTimersByTimeAsync(0);
    expect(bubble.webContents.send).toHaveBeenLastCalledWith('bubble:text', expect.objectContaining({ text: '请先填写 Key' }));
  });
  it('窗口/子框架不能冒用 IPC，气泡跟随 move 而不靠轮询', async () => {
    const chat = await open('和乌萨奇聊天'); const settings = await open('设置…');
    expect(() => invoke('settings:reveal', chat)).toThrow('未授权');
    expect(() => host.invokes.get('settings:reveal')!({ sender: settings.webContents, senderFrame: {} })).toThrow('未授权');
    expect(await invoke('settings:reveal', settings)).toBe('sk-123456789abcd');
    await invoke('chat:send', chat, 'hi'); await vi.advanceTimersByTimeAsync(0);
    const bubble = host.windows.at(-1)!, old = bubble.getBounds();
    pet().setPosition(400, 400); expect(bubble.getBounds()).not.toEqual(old);
    for (const win of host.windows) expect(win.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true });
  });
  it('退出时先停止聊天并启动 session flush，同时等设置保存；快路径不必等满 2 秒', async () => {
    const chat = await open('和乌萨奇聊天'); await invoke('chat:send', chat, 'hi');
    const settings = await open('设置…');
    const preventDefault = vi.fn(); host.appEvents.get('before-quit')!({ preventDefault });
    await vi.advanceTimersByTimeAsync(0);
    expect(settings.webContents.send).toHaveBeenCalledWith('settings:save-close');
    expect(host.sessionFlush).toHaveBeenCalledTimes(1);
    expect(host.stop.mock.invocationCallOrder[0]).toBeLessThan(host.sessionFlush.mock.invocationCallOrder[0]!);
    expect(host.flush).not.toHaveBeenCalled(); expect(host.quit).not.toHaveBeenCalled();
    const initial = await invoke('settings:load', settings);
    await invoke('settings:save', settings, { ...initial.config, volume: 0.2 });
    send('settings:close-ready', settings); await vi.advanceTimersByTimeAsync(0);
    expect(host.sessionFlush).toHaveBeenCalledTimes(1); expect(host.flush).toHaveBeenCalledTimes(1);
    expect(host.quit).toHaveBeenCalledTimes(1);
  });
  it('设置页不确认也会启动 session flush，1.5 秒后仍能退出', async () => {
    const settings = await open('设置…');
    host.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(settings.webContents.send).toHaveBeenCalledWith('settings:save-close');
    expect(host.sessionFlush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1499); expect(host.quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(host.flush).toHaveBeenCalledTimes(1); expect(host.quit).toHaveBeenCalledTimes(1);
  });
  it('设置页慢保存超过 1.5 秒，不会占用 session flush 的等待时间或阻止退出', async () => {
    const settings = await open('设置…');
    const initial = await invoke('settings:load', settings);
    let completeSave = () => {};
    host.keySave.mockImplementationOnce(() => new Promise(done => {
      completeSave = () => done({ persisted: false, reason: '仅本次有效' });
    }));
    let rendererSave: Promise<void> | undefined;
    settings.webContents.send.mockImplementation((channel: string) => {
      if (channel === 'settings:save-close') rendererSave = invoke('settings:save', settings, initial.config, 'new-key')
        .then(() => { send('settings:close-ready', settings); });
    });
    host.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(host.keySave).toHaveBeenCalledTimes(1); expect(host.sessionFlush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1499); expect(host.quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(host.quit).toHaveBeenCalledTimes(1);
    completeSave(); await rendererSave;
    expect(host.sessionFlush).toHaveBeenCalledTimes(1); expect(host.quit).toHaveBeenCalledTimes(1);
  });
  it('设置页保存请求抛错也不会阻止 session flush 和退出', async () => {
    const settings = await open('设置…');
    settings.webContents.send.mockImplementation((channel: string) => {
      if (channel === 'settings:save-close') throw new Error('renderer unavailable');
    });
    host.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(host.sessionFlush).toHaveBeenCalledTimes(1); expect(host.flush).toHaveBeenCalledTimes(1);
    expect(host.quit).toHaveBeenCalledTimes(1);
  });
  it('退出时设置写盘抛 EACCES 且不确认，仍 flush 会话并退出', async () => {
    const settings = await open('设置…');
    const initial = await invoke('settings:load', settings);
    host.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    host.save.mockImplementationOnce(() => { throw new Error('EACCES'); });
    expect(await invoke('settings:save', settings, { ...initial.config, volume: 0.2 }))
      .toEqual({ ok: false, reason: 'EACCES' });
    expect(host.sessionFlush).toHaveBeenCalledTimes(1);
    expect((await invoke('settings:load', settings)).config).toEqual(initial.config);
    await vi.advanceTimersByTimeAsync(1500); expect(host.quit).toHaveBeenCalledTimes(1);
  });
  it('设置页和 session flush 同时卡住，session 的独立上限仍是 2 秒', async () => {
    await open('设置…'); host.sessionFlush.mockImplementation(() => new Promise(() => {}));
    host.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0); expect(host.sessionFlush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999); expect(host.quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(host.quit).toHaveBeenCalledTimes(1);
  });
  it('设置页与两项 flush 都无响应时，总等待不超过 3 秒；重复退出不重启写盘', async () => {
    await open('设置…');
    host.sessionFlush.mockImplementation(() => new Promise(() => {}));
    host.flush.mockImplementation(() => new Promise(() => {}));
    host.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    host.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(2999);
    expect(host.sessionFlush).toHaveBeenCalledTimes(1); expect(host.flush).toHaveBeenCalledTimes(1);
    expect(host.quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(host.quit).toHaveBeenCalledTimes(1);
  });
  it('清空需要二次确认且聊天中拒绝，退出等待 flush 最多 2 秒', async () => {
    const chat = await open('和乌萨奇聊天');
    expect(await invoke('chat:clear', chat)).toBe(false);
    expect(host.confirm).toHaveBeenCalledWith(chat, expect.objectContaining({ buttons: ['取消', '清空对话'] }));
    host.confirm.mockResolvedValueOnce({ response: 1 }); expect(await invoke('chat:clear', chat)).toBe(true);
    await invoke('chat:send', chat, 'hi'); expect(await invoke('chat:clear', chat)).toBe(false);
    host.sessionFlush.mockImplementation(() => new Promise(() => {}));
    let resolve = () => {}; host.flush.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const preventDefault = vi.fn(); host.appEvents.get('before-quit')!({ preventDefault });
    expect(preventDefault).toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(0);
    expect(host.sessionFlush).toHaveBeenCalledTimes(1); expect(host.flush).toHaveBeenCalledTimes(1);
    expect(host.quit).not.toHaveBeenCalled();
    resolve(); await vi.advanceTimersByTimeAsync(1999); expect(host.quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(host.quit).toHaveBeenCalledTimes(1);
    host.flush.mockImplementation(async () => {});
  });
});
