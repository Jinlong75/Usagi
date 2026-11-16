import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DEFAULT_CONFIG, readConfig, writeConfig } from './config';
import { resolveModel } from './model';
import { initialBounds } from '../shared/window';
import { beginGesture, isClick, updateGesture } from '../shared/gesture';
import type { Gesture } from '../shared/gesture';
import type { Config, Point, RenderResult, Size } from '../shared/types';

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

function fail(reason: string): void {
  if (completed) return;
  completed = true;
  console.log(JSON.stringify({ ok: false, reason, model: modelPath }));
  app.exit(1);
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

function finishDrag(cancelled: boolean): void {
  if (!win || !gesture) return;
  const point = screen.getCursorScreenPoint();
  const clicked = !cancelled && isClick(gesture, point, performance.now());
  if (gesture.dragged && dragOrigin) {
    win.setPosition(Math.round(dragOrigin.x + point.x - gesture.start.x),
      Math.round(dragOrigin.y + point.y - gesture.start.y));
  }
  gesture = null;
  dragOrigin = null;
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
      if (win?.isVisible()) { finishDrag(true); win.hide(); }
      else win?.showInactive();
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
  if (!smoke || completed || !win) return;
  if (!result.ok) return fail(result.reason ?? '模型加载失败');
  try {
    // The renderer reports only after the model has completed 60 rendered frames.
    const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    const bitmap = image.toBitmap(); // BGRA; alpha is the fourth byte on both target platforms.
    let opaque = 0;
    for (let index = 3; index < bitmap.length; index += 4) if (bitmap[index]! > 0) opaque++;
    const opaqueRatio = opaque / (bitmap.length / 4);
    const directory = process.env.AR_GATE_ARTIFACT_DIR || resolve(root, 'app/smoke-out');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'smoke.png'), image.toPNG());
    const ok = Number.isFinite(opaqueRatio) && opaqueRatio >= 0.02 && opaqueRatio <= 0.95 && result.vrmVersion === '1';
    completed = true;
    console.log(JSON.stringify({ ok, model: modelPath, opaqueRatio, vrmVersion: result.vrmVersion,
      expressions: result.expressions ?? [], ...(!ok ? { reason: '角色占比、透明背景或 VRM 版本检查失败' } : {}) }));
    app.exit(ok ? 0 : 1);
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
    skipTaskbar: process.platform === 'win32', alwaysOnTop: config.alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
      sandbox: true, offscreen: smoke, backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true);
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
  ipcMain.on('pet:hit', (event, value: unknown) => {
    if (!trusted(event) || typeof value !== 'boolean' || smoke) return;
    hit = value;
    applyHit();
  });
  ipcMain.on('pet:drag-start', (event) => {
    if (!trusted(event) || smoke || !hit || !win || gesture) return;
    gesture = beginGesture(screen.getCursorScreenPoint(), performance.now());
    const { x, y } = win.getBounds();
    dragOrigin = { x, y };
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
      if (!win || win.isDestroyed()) return;
      const point = screen.getCursorScreenPoint();
      if (gesture && dragOrigin) {
        updateGesture(gesture, point);
        if (gesture.dragged) win.setPosition(Math.round(dragOrigin.x + point.x - gesture.start.x),
          Math.round(dragOrigin.y + point.y - gesture.start.y));
      }
      win.webContents.send('pet:cursor', { point, bounds: win.getBounds() });
    }, 50);
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
    win.once('ready-to-show', () => { win?.showInactive(); refreshMenu(); });
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
  clearTimeout(moveSaveTimer);
  if (!smoke) { finishDrag(true); save(); }
  tray?.destroy();
});
app.on('window-all-closed', () => app.quit());
