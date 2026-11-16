import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray, safeStorage } from 'electron';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_CONFIG, normalizeConfig, readConfig, writeConfig } from './config';
import { resolveModel } from './model';
import { prepareMove, WindowMotion } from './motion';
import { SoundLibrary } from './sounds';
import { UiController } from './ipc/ui';
import { AsyncKeyStore } from './ipc/keys';
import { waitForQuitTask } from './ipc/quit';
import { ChatService } from './chat/service';
import { DeepSeekClient } from './chat/client';
import { SessionStore } from './chat/sessionStore';
import { SelfTalk } from './selfTalk';
import { menuState } from '../shared/ui';
import { initialBounds } from '../shared/window';
import { beginGesture, isClick, updateGesture } from '../shared/gesture';
import { topRowsTransparent } from '../shared/hit';
import type { Gesture } from '../shared/gesture';
import type { Config, Point, RenderResult, Size, MoveRequest, SmokeBehavior, SoundUse } from '../shared/types';

const smoke = process.argv.includes('--smoke');
const root = resolve(__dirname, '../..');
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let config: Config = structuredClone(DEFAULT_CONFIG);
let ui: UiController;
let selfTalk: SelfTalk;
let sessionStore: SessionStore | undefined;
let keyStore: AsyncKeyStore | undefined;
let quitting = false;
let quitFlushed = false;
let configPath = '';
let modelPath = '';
let cursorTimer: ReturnType<typeof setInterval> | undefined;
let moveSaveTimer: ReturnType<typeof setTimeout> | undefined;
let gesture: Gesture | null = null;
let dragOrigin: Point | null = null;
let hit = false;
let completed = false;
let motion: WindowMotion | undefined;
let lastDragEndedAt = -Infinity;
let dragSample = { point: { x: 0, y: 0 }, time: 0 };
const runtime = { isPackaged: app.isPackaged, resourcesPath: process.resourcesPath };
const sounds = SoundLibrary.fromRuntime(root, runtime);
const smokeBehaviors: SmokeBehavior[] = ['idle', 'walk', 'happy', 'surprised', 'shout', 'stretch', 'drag'];
const behaviorRatios: Partial<Record<SmokeBehavior, number>> = {};
const behaviorTopTransparent: Partial<Record<SmokeBehavior, boolean>> = {};
let smokeIndex = -1;
let captureBusy = false;
let initialRatio = 0;
let lastCursorSentAt = -Infinity;

function exitSmoke(code: number, result: object): void {
  // app.exit() is immediate; wait for piped stdout so the gate receives the JSON.
  process.stdout.write(JSON.stringify(result) + '\n', () => app.exit(code));
}

function fail(reason: string): void {
  if (completed) return;
  completed = true;
  exitSmoke(1, { ok: false, reason, model: modelPath });
}
const watchdog = smoke ? setTimeout(() => fail('模型渲染在 60 秒内未完成'), 59_000) : undefined;

function save(next = config): { ok: true } | { ok: false; reason: string } {
  try {
    if (!smoke) writeConfig(configPath, next);
    return { ok: true };
  } catch (error) {
    console.error('配置保存失败', error);
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function currentBounds(size = config.size) {
  return initialBounds(size, config.position, screen.getPrimaryDisplay().workArea,
    screen.getAllDisplays().map((display) => display.workArea));
}

function setSize(size: Size): void {
  if (!win) return;
  motion?.cancel();
  win.webContents.send('pet:press', false);
  config.size = size;
  const { x, y } = win.getBounds();
  config.position = { x, y };
  win.setBounds(currentBounds());
  const actual = win.getBounds();
  config.position = { x: actual.x, y: actual.y };
  save();
  refreshMenu();
  ui?.broadcast();
}

function applyHit(): void {
  if (config.mousePassthrough) win?.setIgnoreMouseEvents(true);
  else win?.setIgnoreMouseEvents(!hit && !gesture, { forward: true });
}

function dragPosition(point: Point, now: number): void {
  if (!win || !gesture || !dragOrigin) return;
  const wasDragged = gesture.dragged;
  updateGesture(gesture, point);
  if (!gesture.dragged) return;
  if (!wasDragged) motion?.cancel();
  win.setPosition(Math.round(dragOrigin.x + point.x - gesture.start.x),
    Math.round(dragOrigin.y + point.y - gesture.start.y));
  const bounds = win.getBounds();
  const dt = Math.max(0.008, (now - dragSample.time) / 1000);
  win.webContents.send('pet:drag', { active: true, timestamp: now,
    velocity: { x: (bounds.x - dragSample.point.x) / dt, y: (bounds.y - dragSample.point.y) / dt } });
  dragSample = { point: bounds, time: now };
}

function finishDrag(cancelled: boolean): void {
  if (!win || !gesture) return;
  const now = performance.now();
  const point = screen.getCursorScreenPoint();
  dragPosition(point, now);
  const clicked = !cancelled && isClick(gesture, point, now, lastDragEndedAt);
  if (gesture.dragged) {
    lastDragEndedAt = now;
    win.webContents.send('pet:drag', { active: false, velocity: { x: 0, y: 0 }, timestamp: now });
  }
  gesture = null;
  dragOrigin = null;
  win.webContents.send('pet:press', false);
  const { x, y } = win.getBounds();
  config.position = { x, y };
  save();
  applyHit();
  if (clicked) win.webContents.send('pet:click');
}

function updateConfig(value: unknown): void {
  // A settings snapshot cannot rewind a pet moved/resized while the page was open.
  const next = normalizeConfig(value);
  const candidate = { ...next, position: config.position, size: config.size, modelPath: config.modelPath };
  const saved = save(candidate);
  if (!saved.ok) throw new Error(saved.reason);
  config = candidate;
  win?.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  applyHit(); refreshMenu(); ui?.broadcast(); if (!quitting) selfTalk?.restart();
}

// 菜单里的开关直接写配置：写盘失败时恢复勾选状态并用气泡提示，不让异常冒到主进程
function updateFromMenu(value: unknown): boolean {
  try {
    updateConfig(value);
    return true;
  } catch (error) {
    refreshMenu();
    const reason = error instanceof Error ? error.message : String(error);
    void ui?.bubble.showBubble(`设置保存失败：${reason}。请检查磁盘空间和文件权限。`, 4000);
    return false;
  }
}

function petMenu(): Electron.MenuItemConstructorOptions[] {
  const state = menuState(config, win?.isVisible() ?? false);
  return [
    { label: state.visibility, click: () => {
      if (win?.isVisible()) {
        finishDrag(true); motion?.cancel(); win.webContents.send('pet:press', false);
        win.hide(); win.webContents.send('pet:visibility', { visible: false });
      } else if (win) {
        win.showInactive(); win.webContents.send('pet:visibility', { visible: true });
      }
      refreshMenu();
    } },
    { label: '和乌萨奇聊天', click: () => { void ui.chat.open(); } },
    { label: '设置…', click: () => { void ui.settings.open(); } },
    { label: '自言自语', type: 'checkbox', checked: state.selfTalk, click: item => {
      updateFromMenu({ ...config, selfTalk: { ...config.selfTalk, enabled: item.checked } });
    } },
    { label: '鼠标穿透', type: 'checkbox', checked: state.mousePassthrough, click: item => {
      finishDrag(true);
      if (updateFromMenu({ ...config, mousePassthrough: item.checked }) && item.checked) {
        void ui.bubble.showBubble('已开启鼠标穿透，在菜单栏图标里可以关掉哦', 4000);
      }
    } },
    { label: '始终置顶', type: 'checkbox', checked: state.alwaysOnTop, click: item => { updateFromMenu({ ...config, alwaysOnTop: item.checked }); } },
    { label: '大小', submenu: (['small', 'medium', 'large'] as const).map((size, index) => ({
      label: ['小', '中', '大'][index]!, type: 'radio' as const,
      checked: state.size === size, click: () => setSize(size),
    })) },
    { label: '重新载入模型', click: () => win?.webContents.send('pet:reload') },
    { type: 'separator' }, { label: '退出', click: () => app.quit() },
  ];
}
function refreshMenu(): void { if (tray && win) tray.setContextMenu(Menu.buildFromTemplate(petMenu())); }

function makeTray(): void {
  const icon = nativeImage.createFromPath(resolve(root, 'app/build', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Usagi 桌宠');
  refreshMenu();
}

async function capture(result: RenderResult): Promise<void> {
  if (!smoke || completed || !win || captureBusy) return;
  if (!result.ok) return fail(result.reason ?? '模型加载失败');
  if (smokeIndex >= smokeBehaviors.length) return;
  const expected = smokeIndex < 0 ? undefined : smokeBehaviors[smokeIndex];
  if (result.behavior !== expected) return fail('冒烟姿态顺序不匹配');
  captureBusy = true;
  try {
    const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    const bitmap = image.toBitmap({ scaleFactor: 1 });
    let opaque = 0;
    for (let index = 3; index < bitmap.length; index += 4) if (bitmap[index]! > 0) opaque++;
    const opaqueRatio = opaque / (bitmap.length / 4);
    const directory = process.env.AR_GATE_ARTIFACT_DIR || (app.isPackaged ? join(tmpdir(), `usagi-smoke-${process.pid}`) : resolve(root, 'app/smoke-out'));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, expected ? `smoke-${expected}.png` : 'smoke.png'), image.toPNG());
    if (expected === 'happy' || expected === 'shout' || expected === 'stretch') {
      behaviorTopTransparent[expected] = topRowsTransparent(bitmap, image.getSize(1).width);
      if (!behaviorTopTransparent[expected]) return fail(`角色超出取景：${expected} 最上方两行 alpha 非零`);
    }
    if (!Number.isFinite(opaqueRatio) || opaqueRatio < 0.02 || opaqueRatio > 0.95 || result.vrmVersion !== '1') {
      return fail(`角色占比、透明背景或 VRM 版本检查失败：${expected ?? 'initial'} (${opaqueRatio})`);
    }
    if (expected) behaviorRatios[expected] = opaqueRatio;
    else initialRatio = opaqueRatio;
    smokeIndex++;
    captureBusy = false;
    const next = smokeBehaviors[smokeIndex];
    if (next) win.webContents.send('pet:smoke-pose', next);
    else {
      const { captureUi } = await import('../../scripts/smoke-ui');
      // Return to idle before composing the pet + bubble screenshot.
      win.webContents.send('pet:smoke-pose', 'idle');
      await captureUi(ui, win, directory);
      const audio = await sounds.verify();
      const decoded = await win.webContents.executeJavaScript(`(async () => {
        const context = new AudioContext();
        try { const buffer = await context.decodeAudioData(new Uint8Array(${JSON.stringify(Array.from(audio.sample))}).buffer);
          return buffer.duration > 0; } finally { await context.close(); }
      })()`);
      if (decoded !== true) throw new Error('包内音效解码失败');
      completed = true;
      exitSmoke(0, { ok: true, model: modelPath, opaqueRatio: initialRatio, vrmVersion: result.vrmVersion,
        expressions: result.expressions ?? [], behaviors: smokeBehaviors, behaviorOpaqueRatios: behaviorRatios,
        behaviorTopTransparent, ui: ['bubble', 'chat', 'settings'],
        sounds: { directory: audio.directory, clips: audio.clips, decoded: true } });
    }
  } catch (error) { fail(String(error)); }
}

async function start(): Promise<void> {
  configPath = join(app.getPath('userData'), 'config.json');
  if (!smoke) {
    try { config = readConfig(configPath); }
    catch (error) { console.error('配置读取失败，使用默认值', error); }
  }
  if (process.platform === 'darwin') app.dock?.hide();
  win = new BrowserWindow({
    ...currentBounds(), show: false, transparent: true, backgroundColor: '#00000000',
    frame: false, hasShadow: false, resizable: false, maximizable: false, fullscreenable: false,
    // macOS：窗口未激活时第一次按下也直接交给页面（点击/拖动不用点两次）
    acceptFirstMouse: true, focusable: false,
    skipTaskbar: process.platform === 'win32', alwaysOnTop: config.alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
      sandbox: true, offscreen: smoke, backgroundThrottling: false,
    },
  });
  motion = new WindowMotion(win, (result) => {
    if (!win || win.isDestroyed()) return;
    const { x, y } = win.getBounds(); config.position = { x, y }; save();
    win.webContents.send('pet:move-done', result);
  });
  win.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('console-message', (details) => {
    if (details.level === 'warning' || details.level === 'error') console.error(`[renderer:${details.level}] ${details.message}`);
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('render-process-gone', (_event, details) => {
    if (smoke) fail(`渲染进程退出：${details.reason}`);
    else console.error('渲染进程退出', details.reason);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    if (smoke) fail(`页面加载失败：${code} ${description}`);
    else console.error('页面加载失败', code, description);
  });
  const dependencies = smoke ? (await import('../../scripts/smoke-ui')).smokeDependencies() : (() => {
    sessionStore = new SessionStore(app.getPath('userData'));
    keyStore = new AsyncKeyStore(app.getPath('userData'), safeStorage);
    return { store: sessionStore, keys: keyStore, service: new ChatService({ client: new DeepSeekClient(),
      store: sessionStore, keyStore, getSettings: () => config.chat }) };
  })();
  ui = new UiController({ pet: win, root, smoke, config: () => config, update: updateConfig, ...dependencies });
  selfTalk = new SelfTalk({ config: () => config.selfTalk,
    blocked: () => !win?.isVisible() || !!gesture?.dragged || ui.active || ui.bubble.occupied,
    show: (text, duration) => { void ui.bubble.showBubble(text, duration); },
    sound: () => win?.webContents.send('pet:play-sound', 'idle_talk'),
  });
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    event.sender === win?.webContents && event.senderFrame === win?.webContents.mainFrame;
  ipcMain.handle('pet:config', event => { if (!trusted(event)) throw new Error('未授权的配置请求'); return config; });
  ipcMain.on('pet:context-menu', event => {
    if (trusted(event) && win && hit && !config.mousePassthrough) Menu.buildFromTemplate(petMenu()).popup({ window: win });
  });
  ipcMain.handle('pet:load-model', async (event) => {
    if (!trusted(event)) throw new Error('未授权的模型请求');
    modelPath = resolveModel(root, config.modelPath, smoke, runtime);
    return { bytes: new Uint8Array(await readFile(modelPath)), path: modelPath, smoke };
  });
  ipcMain.handle('pet:window-info', (event) => {
    if (!trusted(event) || !win) throw new Error('未授权的窗口请求');
    const bounds = win.getBounds();
    return { bounds, workArea: screen.getDisplayMatching(bounds).workArea };
  });
  ipcMain.handle('pet:sound', (event, use: SoundUse) => {
    if (!trusted(event) || smoke || !['click_happy', 'click_surprise', 'click_shout', 'drag', 'idle_talk', 'chat_reply'].includes(use) ||
      (gesture?.dragged && use !== 'drag')) return null;
    return sounds.load(use).then((bytes) => bytes ? new Uint8Array(bytes).buffer : null);
  });
  ipcMain.on('pet:move-to', (event, request: MoveRequest) => {
    if (!trusted(event)) return;
    const refuse = (reason: string) => win?.webContents.send('pet:move-done', { ok: false, reason });
    if (smoke) return refuse('smoke');
    if (gesture) return refuse('dragging');
    if (!win?.isVisible()) return refuse('hidden');
    if (!motion) return refuse('unavailable');
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const prepared = prepareMove({ bounds, workArea: area }, request);
    if (!prepared.ok) return refuse(prepared.reason);
    motion.move(prepared.request);
  });
  ipcMain.on('pet:move-cancel', (event) => { if (trusted(event)) motion?.cancel(); });
  ipcMain.on('pet:hit', (event, value: unknown) => {
    if (!trusted(event) || typeof value !== 'boolean' || smoke) return;
    hit = value;
    applyHit();
  });
  ipcMain.on('pet:drag-start', (event) => {
    if (!trusted(event) || smoke || config.mousePassthrough || !hit || !win || gesture) return;
    motion?.cancel();
    gesture = beginGesture(screen.getCursorScreenPoint(), performance.now(), win.getBounds().width);
    win.webContents.send('pet:press', true);
    const { x, y } = win.getBounds();
    dragOrigin = { x, y };
    dragSample = { point: { x, y }, time: performance.now() };
    applyHit();
  });
  ipcMain.on('pet:drag-end', (event, cancelled: unknown) => {
    if (trusted(event) && typeof cancelled === 'boolean' && !smoke) finishDrag(cancelled);
  });
  ipcMain.on('pet:rendered', (event, result: RenderResult) => {
    if (trusted(event) && result && typeof result.ok === 'boolean') void capture(result);
  });
  ipcMain.on('pet:error', (event, message: unknown) => {
    if (trusted(event) && typeof message === 'string') console.error('模型加载失败：' + message);
  });
  if (!smoke) {
    applyHit();
    makeTray();
    selfTalk.restart();
    cursorTimer = setInterval(() => {
      if (!win || win.isDestroyed() || !win.isVisible()) return;
      const now = performance.now();
      if (!gesture && now - lastCursorSentAt < 50) return;
      lastCursorSentAt = now;
      const point = screen.getCursorScreenPoint();
      dragPosition(point, performance.now());
      const bounds = win.getBounds();
      win.webContents.send('pet:cursor', { point, bounds, workArea: screen.getDisplayMatching(bounds).workArea });
    }, 1000 / 60);
    win.on('move', () => {
      clearTimeout(moveSaveTimer);
      if (gesture) return;
      moveSaveTimer = setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        const { x, y } = win.getBounds();
        config.position = { x, y };
        save();
      }, 200);
    });
    win.on('blur', () => finishDrag(true));
    win.once('ready-to-show', () => {
      win?.showInactive(); win?.webContents.send('pet:visibility', { visible: true }); refreshMenu();
    });
  }
  if (!smoke && process.env.USAGI_DEV_URL) await win.loadURL(process.env.USAGI_DEV_URL);
  else await win.loadFile(resolve(root, 'app/dist/index.html'));
}

app.whenReady().then(start).catch((error) => {
  if (smoke) fail(String(error));
  else { console.error(error); app.exit(1); }
});
app.on('before-quit', event => {
  if (!smoke && !quitFlushed) {
    event.preventDefault();
    if (quitting) return;
    quitting = true; selfTalk?.stop();
    ui?.stopChat();
    // Session persistence starts independently of renderer responsiveness. Settings
    // and the following key flush each get 1.5s; total quit wait is at most 3s.
    void Promise.all([
      waitForQuitTask(() => sessionStore?.flush(), 2000),
      (async () => {
        await waitForQuitTask(() => ui?.settings.saveBeforeQuit(), 1500);
        await waitForQuitTask(() => keyStore?.flush(), 1500);
      })(),
    ]).finally(() => {
      ui?.quit(); quitFlushed = true; app.quit();
    });
    return;
  }
  selfTalk?.stop();
  clearTimeout(watchdog);
  clearInterval(cursorTimer);
  motion?.cancel();
  clearTimeout(moveSaveTimer);
  if (!smoke) { finishDrag(true); save(); }
  tray?.destroy();
});
app.on('window-all-closed', () => app.quit());
