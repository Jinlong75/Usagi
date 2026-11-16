import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DEFAULT_CONFIG, readConfig, writeConfig } from './config';
import { resolveModel } from './model';
import { prepareMove, WindowMotion } from './motion';
import { SoundLibrary } from './sounds';
import { initialBounds } from '../shared/window';
import { beginGesture, isClick, updateGesture } from '../shared/gesture';
import { topRowsTransparent } from '../shared/hit';
import type { Gesture } from '../shared/gesture';
import type { Config, Point, RenderResult, Size, MoveRequest, SmokeBehavior, SoundUse } from '../shared/types';

const smoke = process.argv.includes('--smoke');
const root = resolve(__dirname, '../..');
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let config: Config = { ...DEFAULT_CONFIG };
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
const sounds = new SoundLibrary(resolve(root, 'assets/sounds/usagi'));
const smokeBehaviors: SmokeBehavior[] = ['idle', 'walk', 'happy', 'surprised', 'shout', 'drag'];
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

function save(): void {
  if (smoke) return;
  try { writeConfig(configPath, config); }
  catch (error) { console.error('配置保存失败', error); }
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
}

function applyHit(): void { win?.setIgnoreMouseEvents(!hit && !gesture, { forward: true }); }

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

function refreshMenu(): void {
  if (!tray || !win) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win.isVisible() ? '隐藏桌宠' : '显示桌宠', click: () => {
      if (win?.isVisible()) {
        finishDrag(true); motion?.cancel(); win.webContents.send('pet:press', false);
        win.hide(); win.webContents.send('pet:visibility', { visible: false });
      } else if (win) {
        win.showInactive(); win.webContents.send('pet:visibility', { visible: true });
      }
      refreshMenu();
    } },
    { label: '始终置顶', type: 'checkbox', checked: config.alwaysOnTop, click: (item) => {
      config.alwaysOnTop = item.checked;
      win?.setAlwaysOnTop(item.checked, 'floating');
      save();
    } },
    { label: '大小', submenu: (['small', 'medium', 'large'] as const).map((size, index) => ({
      label: ['小', '中', '大'][index]!, type: 'radio' as const,
      checked: config.size === size, click: () => setSize(size),
    })) },
    { label: '重新载入模型', click: () => win?.webContents.send('pet:reload') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

function makeTray(): void {
  // TODO(lead): 换成 Usagi 图标
  const width = 32;
  const bitmap = Buffer.alloc(width * width * 4);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const body = ((x - 16) / 11) ** 2 + ((y - 21) / 9) ** 2 <= 1;
    const ears = y >= 2 && y <= 19 && ((x >= 8 && x <= 13) || (x >= 19 && x <= 24));
    if (body || ears) bitmap[(y * width + x) * 4 + 3] = 255;
  }
  const icon = nativeImage.createFromBitmap(bitmap, { width, height: width, scaleFactor: 2 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Usagi 桌宠');
  refreshMenu();
}

async function capture(result: RenderResult): Promise<void> {
  if (!smoke || completed || !win || captureBusy) return;
  if (!result.ok) return fail(result.reason ?? '模型加载失败');
  const expected = smokeIndex < 0 ? undefined : smokeBehaviors[smokeIndex];
  if (result.behavior !== expected) return fail('冒烟姿态顺序不匹配');
  captureBusy = true;
  try {
    const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    const bitmap = image.toBitmap({ scaleFactor: 1 });
    let opaque = 0;
    for (let index = 3; index < bitmap.length; index += 4) if (bitmap[index]! > 0) opaque++;
    const opaqueRatio = opaque / (bitmap.length / 4);
    const directory = process.env.AR_GATE_ARTIFACT_DIR || resolve(root, 'app/smoke-out');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, expected ? `smoke-${expected}.png` : 'smoke.png'), image.toPNG());
    if (expected === 'happy' || expected === 'shout') {
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
      completed = true;
      exitSmoke(0, { ok: true, model: modelPath, opaqueRatio: initialRatio, vrmVersion: result.vrmVersion,
        expressions: result.expressions ?? [], behaviors: smokeBehaviors, behaviorOpaqueRatios: behaviorRatios,
        behaviorTopTransparent });
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
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    event.sender === win?.webContents && event.senderFrame === win?.webContents.mainFrame;
  ipcMain.handle('pet:load-model', async (event) => {
    if (!trusted(event)) throw new Error('未授权的模型请求');
    modelPath = resolveModel(root, config.modelPath, smoke);
    return { bytes: new Uint8Array(await readFile(modelPath)), path: modelPath, smoke };
  });
  ipcMain.handle('pet:window-info', (event) => {
    if (!trusted(event) || !win) throw new Error('未授权的窗口请求');
    const bounds = win.getBounds();
    return { bounds, workArea: screen.getDisplayMatching(bounds).workArea };
  });
  ipcMain.handle('pet:sound', (event, use: SoundUse) => {
    if (!trusted(event) || smoke || !['click_happy', 'click_surprise', 'click_shout', 'drag'].includes(use) ||
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
    if (!trusted(event) || smoke || !hit || !win || gesture) return;
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
app.on('before-quit', () => {
  clearTimeout(watchdog);
  clearInterval(cursorTimer);
  motion?.cancel();
  clearTimeout(moveSaveTimer);
  if (!smoke) { finishDrag(true); save(); }
  tray?.destroy();
});
app.on('window-all-closed', () => app.quit());
