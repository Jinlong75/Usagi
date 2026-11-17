import { installCrashLog, logCrash, watchRenderer, crashCounts } from './crashLog';
import { createWindowReader } from './fullscreen';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray, safeStorage, powerMonitor, net } from 'electron';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_CONFIG, normalizeConfig, readConfig, writeConfig } from './config';
import { resolveModel } from './model';
import { prepareMove, WindowMotion } from './motion';
import { startTickLoop } from './timing';
import { configureWindowsRendering } from './performance';
import { FpsLog } from './fps';
import { SoundLibrary } from './sounds';
import { UiController } from './ipc/ui';
import { AsyncKeyStore } from './ipc/keys';
import { waitForQuitTask } from './ipc/quit';
import { ChatService } from './chat/service';
import { DeepSeekClient } from './chat/client';
import { SessionStore } from './chat/sessionStore';
import { SelfTalk } from './selfTalk';
import { Weather, prefetchMorning } from './weather';
import { Routine, inRange, isForegroundFullscreen, cacheForegroundFullscreen } from './routine';
import { menuState } from '../shared/ui';
import { initialBounds, windowDimensions } from '../shared/window';
import { beginGesture, isClick, updateGesture } from '../shared/gesture';
import { topRowsTransparent, regionDifference } from '../shared/hit';
import type { Gesture } from '../shared/gesture';
import type { Config, Point, RenderResult, Size, MoveRequest, SmokeBehavior, SoundUse, Rect, FoodActivity, FeedRequest } from '../shared/types';

const smoke = process.argv.includes('--smoke');
const chatRoundsOnly = smoke && process.argv.includes('--chat-rounds');
const smokeDiagnostics = smoke ? { name: app.getName(), defaultUserData: app.getPath('userData') } : undefined;
// Smoke runs must not append diagnostics to the user's installed app data.
if (smoke) app.setPath('userData', mkdtempSync(join(tmpdir(), 'usagi-smoke-chat-')));
const stopCrashLog = installCrashLog(app);
let quitSource = 'external';
function quit(source: string): void {
  quitSource = source; logCrash('quit', { phase: 'request', source }); app.quit();
}
function exit(code: number, source: string, error?: unknown): void {
  quitSource = source;
  logCrash('quit', { phase: 'exit', source, code, ...(error === undefined ? {} : {
    message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined,
  }) });
  app.exit(code);
}
configureWindowsRendering(app.commandLine);
const root = resolve(__dirname, '../..');
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let config: Config = structuredClone(DEFAULT_CONFIG);
let ui: UiController;
let selfTalk: SelfTalk;
let routine: Routine | undefined;
let lastMealQuestionAt = -Infinity;
let nextFeedId = 0;
let pendingFood: FeedRequest & { delicious: boolean } | undefined;
function mealTime(now = new Date()): boolean {
  return config.routine.enabled && !config.routine.quiet && (['morning', 'lunch', 'dinner'] as const).some(key => inRange(now, config.routine[key]));
}
function feed(activity: FoodActivity): void {
  if (!win?.isVisible() || gesture) return;
  const request: FeedRequest = { activity, feedId: ++nextFeedId };
  pendingFood = { ...request, delicious: mealTime() && Date.now() - lastMealQuestionAt <= 120_000 };
  win.webContents.send('pet:activity', request);
}
let stopWeatherPrefetch: (() => void) | undefined;
let sessionStore: SessionStore | undefined;
let keyStore: AsyncKeyStore | undefined;
let quitting = false;
let quitFlushed = false;
let configPath = '';
let modelPath = '';
let modelAspect: number | undefined;
let stopCursor: (() => void) | undefined;
let fpsLog: FpsLog | undefined;
let moveSaveTimer: ReturnType<typeof setTimeout> | undefined;
let gesture: Gesture | null = null;
let dragOrigin: Point | null = null;
let hit = false;
let completed = false;
let motion: WindowMotion | undefined;
let stopFullscreen: ReturnType<typeof setInterval> | undefined;
let lastDragEndedAt = -Infinity;
let dragSample = { point: { x: 0, y: 0 }, time: 0 };
const runtime = { isPackaged: app.isPackaged, resourcesPath: process.resourcesPath };
const sounds = SoundLibrary.fromRuntime(root, runtime);
const smokeBehaviors: SmokeBehavior[] = ['idle', 'walk', 'happy', 'surprised', 'shout', 'stretch', 'drag', 'ear-shake', 'jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'];
// Focused screenshots share the production smoke renderer, without opening UI pages.
const smokeOnly = smoke ? process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',') : undefined;
if (smokeOnly) {
  if (!smokeOnly.length || smokeOnly.some(name => !['jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'].includes(name))) throw new Error('无效的聚焦冒烟动作');
  smokeBehaviors.splice(0, smokeBehaviors.length, ...smokeBehaviors.filter(name => smokeOnly.includes(name)));
}
const propOpaqueRatios: Record<string, number> = {};
const propFraming: Record<string, boolean> = {};
const behaviorRatios: Partial<Record<SmokeBehavior, number>> = {};
const behaviorTopTransparent: Partial<Record<SmokeBehavior, boolean>> = {};
let smokeIndex = -1;
let captureBusy = false;
let initialRatio = 0;
let idleImage: { bitmap: Uint8Array; width: number; height: number; face?: Rect } | undefined;
let earDifferenceRatio = 0;
let happyFaceDifferenceRatio = 0;
const earDegrees: Partial<Record<SmokeBehavior, number>> = {};
// A non-focusable pet may receive no blur when another application's window activates.
const HIT_REASSERT_MS = 1000;
let lastHitAppliedAt = -Infinity;

function exitSmoke(code: number, result: object): void {
  // app.exit() is immediate; wait for piped stdout so the gate receives the JSON.
  process.stdout.write(JSON.stringify(result) + '\n', () => exit(code, 'smoke', 'reason' in result ? result.reason : undefined));
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
    screen.getAllDisplays().map((display) => display.workArea), modelAspect);
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
  lastHitAppliedAt = performance.now();
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
  if (!cancelled) dragPosition(point, now);
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
  const routineWasEnabled = config.routine.enabled;
  config = candidate;
  win?.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  applyHit(); refreshMenu(); ui?.broadcast(); if (!quitting) { selfTalk?.restart(); routine?.start(); }
  // Routine only emits changes to its cached state. Re-enabling needs a fresh
  // clock sample even if that cache still says nap from before it was disabled.
  if (!quitting && routine && !routineWasEnabled && config.routine.enabled) {
    const now = new Date();
    win?.webContents.send('routine:state', inRange(now, config.routine.sleep) ? 'sleep' : inRange(now, config.routine.nap) ? 'nap' : 'awake');
  }
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
    { label: '喂食', submenu: [
      { label: '饭团', click: () => feed('eatRiceball') },
      { label: '西瓜', click: () => feed('eatWatermelon') },
      { label: '冰淇淋', click: () => feed('iceCream') },
    ] },
    { label: '玩耍', submenu: [
      { label: '跳绳', click: () => win?.webContents.send('pet:activity', 'jumpRope') },
      { label: '吹泡泡', click: () => win?.webContents.send('pet:activity', 'blowBubbles') },
    ] },
    { label: '设置…', click: () => { void ui.settings.open(); } },
    { label: '自言自语', type: 'checkbox', checked: state.selfTalk, click: item => {
      updateFromMenu({ ...config, selfTalk: { ...config.selfTalk, enabled: item.checked } });
    } },
    { label: '免打扰', type: 'checkbox', checked: config.routine.quiet, click: item => {
      updateFromMenu({ ...config, routine: { ...config.routine, quiet: item.checked } });
    } },
    { label: '鼠标穿透', type: 'checkbox', checked: state.mousePassthrough, click: item => {
      finishDrag(true);
      if (updateFromMenu({ ...config, mousePassthrough: item.checked }) && item.checked) {
        void ui.bubble.showBubble('已开启鼠标穿透，在菜单栏图标里可以关掉哦', 4000);
      }
    } },
    { label: '始终置顶', type: 'checkbox', checked: state.alwaysOnTop, click: item => { updateFromMenu({ ...config, alwaysOnTop: item.checked }); } },
    { label: '显示帧率', type: 'checkbox', checked: config.showFps, click: item => { updateFromMenu({ ...config, showFps: item.checked }); } },
    { label: '大小', submenu: (['small', 'medium', 'large'] as const).map((size, index) => ({
      label: ['小', '中', '大'][index]!, type: 'radio' as const,
      checked: state.size === size, click: () => setSize(size),
    })) },
    { label: '重新载入模型', click: () => win?.webContents.send('pet:reload') },
    { type: 'separator' }, { label: '退出', click: () => quit('tray') },
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
  if (!smoke || chatRoundsOnly || completed || !win || captureBusy) return;
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
    const { width, height } = image.getSize(1);
    const requiredProps: Record<string, string[]> = { jumpRope: ['handles', 'rope'], blowBubbles: ['wand', 'bubble'], napPillow: ['pillow'], eatRiceball: ['riceball'], eatWatermelon: ['watermelon'], iceCream: ['iceCream'], sneakSnack: ['cookie'] };
    if (expected && requiredProps[expected]) {
      for (const name of requiredProps[expected]) {
        const ratio = result.propOpaqueRatios?.[name];
        if (!Number.isFinite(ratio) || ratio! <= 0 || ratio! > 1) return fail(`道具没有可见像素：${expected}/${name}`);
        propOpaqueRatios[name] = ratio!;
      }
      propFraming[expected] = result.propsInFrame === true;
      if (!propFraming[expected]) return fail(`道具超出取景：${expected}`);
    }
    if (expected === 'idle') idleImage = { bitmap, width, height, face: result.face };
    if (expected && result.earDegrees !== undefined) earDegrees[expected] = result.earDegrees;
    if (expected === 'ear-shake') {
      if (!idleImage) return fail('缺少 idle 对照截图');
      const region = { x: 0, y: 0, width: 1, height: 0.3 };
      earDifferenceRatio = regionDifference({ ...idleImage, region }, { bitmap, width, height, region });
      if (earDifferenceRatio <= 0.03) return fail(`耳朵区域差异比例必须 > 3%：${earDifferenceRatio}`);
    }
    if (expected === 'happy') {
      if (!idleImage?.face || !result.face) return fail('缺少 Usagi 脸部区域');
      happyFaceDifferenceRatio = regionDifference({ ...idleImage, region: idleImage.face }, { bitmap, width, height, region: result.face });
      if (happyFaceDifferenceRatio <= 0) return fail('happy 与 idle 的脸部区域完全相同');
    }
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
      if (smokeOnly) {
        completed = true;
        exitSmoke(0, { ok: true, focused: true, model: modelPath, opaqueRatio: initialRatio, vrmVersion: result.vrmVersion,
          expressions: result.expressions ?? [], behaviors: smokeBehaviors, behaviorOpaqueRatios: behaviorRatios, propOpaqueRatios, propFraming });
        return;
      }
      const { captureUi } = await import('../../scripts/smoke-ui');
      // Return to idle before composing the pet + bubble screenshot.
      win.webContents.send('pet:smoke-pose', 'idle');
      await captureUi(ui, win, directory);
      const { checkChatRounds } = await import('../../scripts/smoke-chat');
      const chatRounds = await checkChatRounds(ui, crashCounts);
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
        propOpaqueRatios, propFraming, behaviorTopTransparent, earDifferenceRatio, happyFaceDifferenceRatio, earDegrees, ui: ['bubble', 'chat', 'settings'],
        chatRounds, sounds: { directory: audio.directory, clips: audio.clips, decoded: true } });
    }
  } catch (error) { fail(String(error)); }
}

async function start(): Promise<void> {
  configPath = join(app.getPath('userData'), 'config.json');
  fpsLog = new FpsLog(app.getPath('userData'));
  if (!smoke) {
    try { config = readConfig(configPath); }
    catch (error) { console.error('配置读取失败，使用默认值', error); }
  }
  // The temporary window uses the legacy height; validate the saved position only
  // once the renderer has measured the model's actual dimensions.
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
  if (!smoke) {
    // TODO(lead): Windows 用户用新日志复测第 6 轮退出；无 JS 日志的原生崩溃仍需系统转储。
    const reader = createWindowReader({ log: reason => logCrash('fullscreen-disabled', { reason }), toDip: rect => screen.screenToDipRect(null, rect) });
    const poll = () => {
      if (!win || win.isDestroyed()) return;
      cacheForegroundFullscreen(reader.fullscreen(reader.list(), bounds => screen.getDisplayMatching(bounds).bounds));
    };
    poll();
    stopFullscreen = setInterval(poll, 2000);
  }
  win.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  watchRenderer(win, 'pet');
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
  const weather = new Weather({ path: join(app.getPath('userData'), 'weather-cache.json'),
    fetch: (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init), now: Date.now, enabled: () => config.routine.weather });
  ui = new UiController({ weatherCity: () => weather.city(), pet: win, root, smoke, config: () => config, update: updateConfig, ...dependencies });
  const blocked = () => !win?.isVisible() || !!gesture?.dragged || ui.blocked || ui.bubble.occupied || isForegroundFullscreen();
  const sound = () => win?.webContents.send('pet:play-sound', 'idle_talk');
  if (!smoke) {
    try {
      routine = new Routine({
        path: join(app.getPath('userData'), 'routine-state.json'), config: () => config.routine,
        now: () => new Date(), idleSeconds: () => powerMonitor.getSystemIdleTime(), blocked,
        show: async (text, duration, question) => {
          await ui.showRoutine(text, duration, question);
          if (question && mealTime()) lastMealQuestionAt = Date.now();
        }, sound,
        state: state => win?.webContents.send('routine:state', state),
        weatherLine: () => weather.line().then(line => line ? line + '。' : null),
        onError: error => console.error('作息调度失败', error),
      });
      stopWeatherPrefetch = prefetchMorning(weather, () => config.routine);
      powerMonitor.on('suspend', () => routine?.markAway());
      powerMonitor.on('lock-screen', () => routine?.markAway());
    } catch (error) {
      routine = undefined;
      console.error('作息初始化失败，已停用作息', error);
    }
  }
  selfTalk = new SelfTalk({ config: () => config.selfTalk,
    blocked: () => blocked() || !!routine?.resting,
    show: (text, duration) => { void ui.bubble.showBubble(text, duration); },
    sound,
  });
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    event.sender === win?.webContents && event.senderFrame === win?.webContents.mainFrame;
  ipcMain.handle('pet:config', event => { if (!trusted(event)) throw new Error('未授权的配置请求'); return config; });
  ipcMain.on('pet:activity-done', (event, value: unknown) => {
    if (!trusted(event) || smoke || !value || typeof value !== 'object' || !pendingFood) return;
    const request = value as Partial<FeedRequest>;
    if (request.feedId !== pendingFood.feedId || request.activity !== pendingFood.activity) return;
    const delicious = pendingFood.delicious; pendingFood = undefined;
    if (delicious && win?.isVisible() && mealTime()) void ui.bubble.showBubble('呀哈！（好吃！）', 3200);
  });
  ipcMain.on('pet:context-menu', event => {
    if (trusted(event) && win && hit && !config.mousePassthrough) Menu.buildFromTemplate(petMenu()).popup({ window: win });
  });
  ipcMain.handle('pet:load-model', async (event) => {
    if (!trusted(event)) throw new Error('未授权的模型请求');
    modelPath = resolveModel(root, config.modelPath, smoke, runtime);
    return { bytes: new Uint8Array(await readFile(modelPath)), path: modelPath, smoke };
  });
  ipcMain.on('pet:framed', (event, value: { aspect?: number; headTop?: number }) => {
    if (!trusted(event) || !win || !value || !Number.isFinite(value.aspect) ||
      value.aspect! < 0.4 || value.aspect! > 2 || !Number.isFinite(value.headTop) || value.headTop! < 0 || value.headTop! > 1) return;
    const previous = win.getBounds();
    const firstFrame = modelAspect === undefined;
    modelAspect = value.aspect!;
    const dimensions = windowDimensions(config.size, modelAspect);
    const area = screen.getDisplayMatching(previous).workArea;
    const position = { x: previous.x, y: previous.y + previous.height - dimensions.height };
    if (firstFrame) {
      win.setBounds(initialBounds(config.size, config.position, screen.getPrimaryDisplay().workArea,
        screen.getAllDisplays().map(display => display.workArea), modelAspect));
    } else if (dimensions.width !== previous.width || dimensions.height !== previous.height) {
      win.setBounds(initialBounds(config.size, position, area, [area], modelAspect));
    }
    const actual = win.getBounds();
    if (config.position?.x !== actual.x || config.position?.y !== actual.y) {
      config.position = { x: actual.x, y: actual.y };
      save();
    }
    ui.bubble.anchor(value.headTop!);
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
  ipcMain.on('pet:fps', (event, value: unknown) => {
    if (!trusted(event) || smoke || !config.showFps) return;
    void fpsLog?.record(value).catch(error => console.error('帧率日志写入失败', error));
  });
  if (!smoke) {
    applyHit();
    makeTray();
    selfTalk.restart();
    routine?.start();
    stopCursor = startTickLoop(() => {
      if (!win || win.isDestroyed() || !win.isVisible()) return;
      const now = performance.now();
      const point = screen.getCursorScreenPoint();
      dragPosition(point, now);
      const bounds = win.getBounds();
      win.webContents.send('pet:cursor', { point, bounds, workArea: screen.getDisplayMatching(bounds).workArea });
      if (process.platform === 'win32' && now - lastHitAppliedAt >= HIT_REASSERT_MS) applyHit();
    });
    let observedPosition = win.getBounds();
    win.on('move', () => {
      clearTimeout(moveSaveTimer);
      const { x, y } = win!.getBounds();
      const changed = x !== observedPosition.x || y !== observedPosition.y;
      observedPosition = { ...observedPosition, x, y };
      if (gesture) return;
      if (modelAspect === undefined) {
        // Ignore duplicate startup notifications for the temporary legacy bounds,
        // but keep real moves available to settings and the first framing pass.
        if (!changed) return;
        config.position = { x, y };
      }
      moveSaveTimer = setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        const { x, y } = win.getBounds();
        config.position = { x, y };
        save();
      }, 200);
    });
    win.on('blur', () => {
      finishDrag(true);
      if (process.platform === 'win32') applyHit();
    });
    win.on('focus', () => { if (process.platform === 'win32') applyHit(); });
    win.once('ready-to-show', () => {
      win?.showInactive(); win?.webContents.send('pet:visibility', { visible: true }); refreshMenu();
    });
  }
  if (!smoke && process.env.USAGI_DEV_URL) await win.loadURL(process.env.USAGI_DEV_URL);
  else await win.loadFile(resolve(root, 'app/dist/index.html'));
  if (chatRoundsOnly) {
    const { checkChatRounds } = await import('../../scripts/smoke-chat');
    const chatRounds = await checkChatRounds(ui, crashCounts);
    completed = true;
    exitSmoke(0, { ok: true, chatRoundsOnly: true, chatRounds, diagnostics: { ...smokeDiagnostics, userData: app.getPath('userData') } });
  }
}

app.whenReady().then(start).catch((error) => {
  if (smoke) fail(String(error));
  else { console.error(error); exit(1, 'start-failed', error); }
});
app.on('before-quit', event => {
  logCrash('quit', { phase: 'before-quit', source: quitSource });
  if (!smoke && !quitFlushed) {
    event.preventDefault();
    if (quitting) return;
    quitting = true; stopWeatherPrefetch?.(); selfTalk?.stop(); routine?.stop();
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
      ui?.quit(); quitFlushed = true; quit(quitSource);
    });
    return;
  }
  stopWeatherPrefetch?.(); selfTalk?.stop(); routine?.stop();
  clearTimeout(watchdog);
  stopCursor?.();
  clearInterval(stopFullscreen);
  motion?.cancel();
  clearTimeout(moveSaveTimer);
  if (!smoke) { finishDrag(true); save(); }
  tray?.destroy();
});
app.on('will-quit', () => { logCrash('quit', { phase: 'will-quit', source: quitSource }); stopCrashLog(); });
app.on('window-all-closed', () => quit('window-all-closed'));
