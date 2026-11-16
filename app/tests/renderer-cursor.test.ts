import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { DEFAULT_CONFIG } from '../src/main/config';
import type { Config, PetBridge } from '../src/shared/types';

class Element {
  hidden = false; textContent = ''; style = { cssText: '' }; width = 320; height = 420;
  listeners = new Map<string, (event: any) => void>();
  addEventListener(name: string, callback: (event: any) => void) { this.listeners.set(name, callback); }
  getBoundingClientRect() { return { x: 0, y: 0, width: 320, height: 420 }; }
  setPointerCapture = vi.fn();
}
const host = vi.hoisted(() => ({
  canvas: undefined as any, overlay: undefined as any, model: undefined as any,
  frame: undefined as undefined | ((now: number) => void),
  callbacks: new Map<string, (value?: any) => void>(),
  ratio: vi.fn(), read: vi.fn(), rendered: vi.fn(),
}));
vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, WebGLRenderer: class {
    domElement = host.canvas;
    setClearColor() {} setSize() {} setPixelRatio = host.ratio;
    render = host.rendered;
    getContext() { return { RGBA: 1, UNSIGNED_BYTE: 2, readPixels: host.read }; }
  } };
});
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  register() {} async parseAsync() { return { scene: host.model.scene, userData: { vrm: host.model } }; }
} }));
vi.mock('@pixiv/three-vrm', () => ({ VRMLoaderPlugin: class {}, VRMUtils: {
  removeUnnecessaryVertices() {}, combineSkeletons() {}, combineMorphs() {}, rotateVRM0() {}, deepDispose() {},
} }));
vi.mock('../src/renderer/motion/framing', async () => {
  const { Box3, Vector3 } = await import('three');
  const bounds = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 2, 1));
  return { measureSeat: () => new Vector3(0, 0.2, 0), measureMotionBounds: () => ({ neutral: bounds, motion: bounds }), springEnvelope: () => bounds,
    motionAspect: () => 320 / 420, frameBounds: () => ({ height: 3, bottom: 0, centerX: 0, centerZ: 0, front: 1 }) };
});

let bridge: PetBridge;
function cursor(x: number): void {
  host.callbacks.get('cursor')!({ point: { x: 340 + x, y: 190 }, bounds: { x: 340, y: 90, width: 320, height: 420 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 } });
}
function draw(delta = 20): void { vi.advanceTimersByTime(delta); host.frame!(performance.now()); }

describe('真实渲染入口接线，无 Electron/DOM/WebGL 宿主', () => {
  beforeEach(async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks(); host.callbacks.clear();
    host.canvas = new Element(); host.overlay = new Element();
    const scene = new Object3D(); scene.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
    host.model = { scene, expressionManager: { getExpression: () => ({}), setValue: vi.fn() }, humanoid: { getNormalizedBoneNode: () => null }, update() {}, meta: { metaVersion: '1' } };
    host.read.mockImplementation((x: number, _y: number, _w: number, _h: number, _format: number, _type: number, pixel: Uint8Array) => {
      pixel[3] = x >= 100 && x < 200 ? 255 : 0;
    });
    const listen = (name: string) => (callback: (value?: any) => void) => { host.callbacks.set(name, callback); return () => {}; };
    bridge = {
      platform: 'win32', activityDone: vi.fn(), reportFps: vi.fn(), getConfig: async () => structuredClone(DEFAULT_CONFIG),
      onPerch: listen('perch'), perchHop: vi.fn(), onActivity: listen('activity'), onRoutine: listen('routine'), onConfig: listen('config'), onCursor: listen('cursor'), onPress: listen('press'), onClick: listen('click'),
      onDrag: listen('drag'), onMoveDone: listen('done'), onVisibility: listen('visibility'), onSmokePose: listen('smoke'),
      onExpression: listen('expression'), onSound: listen('sound'), onReload: listen('reload'),
      loadModel: async () => ({ bytes: new Uint8Array(), path: '', smoke: false }),
      windowInfo: async () => ({ bounds: { x: 340, y: 90, width: 320, height: 420 }, workArea: { x: 0, y: 0, width: 1000, height: 800 } }),
      setHit: vi.fn(), beginDrag: vi.fn(), endDrag: vi.fn(), cancelMove: vi.fn(), moveTo: vi.fn(),
      framed: vi.fn(), rendered: vi.fn(), logError: vi.fn(), loadSound: async () => null, contextMenu: vi.fn(),
    };
    vi.stubGlobal('document', { querySelector: () => new Element(), createElement: () => host.overlay, body: { append: vi.fn() } });
    vi.stubGlobal('window', { pet: bridge, innerWidth: 320, innerHeight: 420, devicePixelRatio: 1.75, addEventListener: listen('window') });
    vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => { host.frame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    await import('../src/renderer/index');
    await vi.waitFor(() => expect(bridge.framed).toHaveBeenCalled());
    expect(bridge.logError).not.toHaveBeenCalled();
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(['sit', 'snap'] as const)('%s保留MotionRig保存的VRM0基准朝向Math.PI', async phase => {
    host.model.scene.rotation.y = Math.PI;
    host.callbacks.get('reload')!();
    await vi.waitFor(() => expect(bridge.framed).toHaveBeenCalledTimes(2));
    draw(); expect(host.model.scene.rotation.y).toBe(Math.PI);
    host.callbacks.get('perch')!({ phase, canHop: false });
    for (const delta of [20, 750, 3500]) {
      draw(delta); expect(host.model.scene.rotation.y).toBe(Math.PI);
    }
  });

  it('只有 pet:cursor 没有 DOM mousemove，也能从穿透恢复命中；坐标使用原生窗口偏移', () => {
    expect(host.ratio).toHaveBeenCalledWith(1.25);
    cursor(20); expect(bridge.setHit).not.toHaveBeenCalled();
    cursor(160); expect(bridge.setHit).toHaveBeenLastCalledWith(true);
    expect(host.read).toHaveBeenLastCalledWith(160, 319, 1, 1, 1, 2, expect.any(Uint8Array));
    cursor(20); expect(bridge.setHit).toHaveBeenLastCalledWith(false);
    cursor(160); expect(bridge.setHit).toHaveBeenLastCalledWith(true);
    expect(host.canvas.listeners.has('mousemove')).toBe(false);
  });
  it('主进程取消按压后，迟来的 pointerup 不会结束下一状态或触发点击', () => {
    cursor(160);
    host.canvas.listeners.get('pointerdown')!({ button: 0, clientX: 160, clientY: 100, pointerId: 1 });
    expect(bridge.beginDrag).toHaveBeenCalledTimes(1);
    host.callbacks.get('press')!(false);
    host.canvas.listeners.get('pointerup')!({ button: 0 });
    expect(bridge.endDrag).not.toHaveBeenCalled();
  });
  it('活动和作息 IPC 驱动真实道具，打盹停眨眼，隐藏/reload/拖动清理资源', async () => {
    host.callbacks.get('activity')!('jumpRope'); draw(200);
    expect(host.model.scene.getObjectByName('prop:rope')).toBeDefined();
    host.callbacks.get('routine')!('nap'); draw();
    expect(host.model.scene.getObjectByName('prop:rope')).toBeUndefined();
    const pillow = host.model.scene.getObjectByName('prop:pillow');
    expect(pillow).toBeDefined();
    const geometry = pillow.children[0].children[0].geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    host.model.expressionManager.setValue.mockClear(); draw(4000);
    expect(host.model.expressionManager.setValue.mock.calls.filter(([name]: string[]) => name === 'blink')).toEqual([['blink', 0]]);
    host.callbacks.get('drag')!({ active: true, velocity: { x: 0, y: 0 }, timestamp: performance.now() }); draw();
    expect(dispose).toHaveBeenCalledOnce(); expect(host.model.scene.getObjectByName('prop:pillow')).toBeUndefined();
    host.callbacks.get('activity')!('blowBubbles'); draw();
    expect(host.model.scene.getObjectByName('prop:wand')).toBeUndefined();
    host.callbacks.get('drag')!({ active: false, velocity: { x: 0, y: 0 }, timestamp: performance.now() });
    draw(1999); expect(host.model.scene.getObjectByName('prop:pillow')).toBeUndefined();
    draw(1); expect(host.model.scene.getObjectByName('prop:pillow')).toBeDefined();
    host.callbacks.get('routine')!('awake'); draw();
    expect(host.model.scene.getObjectByName('prop:pillow')).toBeUndefined();
    host.callbacks.get('activity')!('blowBubbles'); draw(1250);
    expect(host.model.scene.getObjectByName('prop:wand')).toBeDefined();
    host.callbacks.get('visibility')!({ visible: false });
    expect(host.model.scene.getObjectByName('prop:wand')).toBeUndefined();
    host.callbacks.get('visibility')!({ visible: true });
    host.callbacks.get('activity')!('blowBubbles'); draw(1250);
    const wandGeometry = host.model.scene.getObjectByName('prop:wand').children[0].children[0].geometry;
    const wandDispose = vi.spyOn(wandGeometry, 'dispose');
    host.callbacks.get('reload')!();
    await vi.waitFor(() => expect(wandDispose).toHaveBeenCalledOnce());
    expect(host.model.scene.getObjectByName('prop:wand')).toBeUndefined();
  });

  it('喂食播放时关闭眨眼和聊天表情叠加，吃完才发送完成 IPC，道具被释放', () => {
    for (const [activity, prop, duration] of [['eatRiceball', 'riceball', 6000], ['eatWatermelon', 'watermelon', 5000], ['iceCream', 'iceCream', 5500]] as const) {
      const request = { activity, feedId: duration };
      host.callbacks.get('activity')!(request); draw(700);
      const food = host.model.scene.getObjectByName(`prop:${prop}`);
      expect(food).toBeDefined();
      host.model.expressionManager.setValue.mockClear();
      host.callbacks.get('expression')!('angry'); draw();
      expect(host.model.expressionManager.setValue.mock.calls.filter(([name]: string[]) => name === 'blink')).toEqual([['blink', 0], ['blink', 0]]);
      expect(host.model.expressionManager.setValue).not.toHaveBeenCalledWith('angry', 1);
      expect(bridge.activityDone).not.toHaveBeenCalledWith(request);
      draw(duration - 720);
      expect(bridge.activityDone).toHaveBeenCalledWith(request);
      expect(food.parent).toBeNull();
    }
  });

  it('同种喂食重启动作时保留第二轮 feedId，只为实际播完的一轮回执一次', () => {
    const first = { activity: 'eatRiceball', feedId: 71 };
    const second = { activity: 'eatRiceball', feedId: 72 };
    host.callbacks.get('activity')!(first); draw(1000);
    host.callbacks.get('activity')!(second); draw(5000);
    expect(bridge.activityDone).not.toHaveBeenCalled();
    draw(1000);
    expect(bridge.activityDone).toHaveBeenCalledExactlyOnceWith(second);
    draw(20); expect(bridge.activityDone).toHaveBeenCalledTimes(1);
  });

  it('真实随机偷吃到原生 press/release/click：道具立即消失、身体冻结 400ms，之后惊讶点击', async () => {
    const random = vi.spyOn(Math, 'random');
    host.callbacks.get('reload')!();
    await vi.waitFor(() => expect(bridge.framed).toHaveBeenCalledTimes(2));
    random.mockReturnValueOnce(0.5).mockReturnValueOnce(0.999);
    draw(3500); draw(1700);
    expect(host.model.scene.getObjectByName('prop:cookie')).toBeDefined();
    host.callbacks.get('press')!(true); draw();
    expect(host.model.scene.getObjectByName('prop:cookie')).toBeUndefined();
    const scale = host.model.scene.scale.clone(); const position = host.model.scene.position.clone();
    host.callbacks.get('press')!(false); host.callbacks.get('click')!();
    draw(399);
    expect(host.model.scene.scale).toEqual(scale); expect(host.model.scene.position).toEqual(position);
    expect(host.model.expressionManager.setValue).toHaveBeenCalledWith('surprised', 1);
    draw(1); draw(100);
    expect(host.model.scene.position.z).toBeLessThan(position.z);
    random.mockRestore();
  });

  it.each(['nap', 'sleep'] as const)('%s 中关闭作息立即收枕清醒，迟来状态与 reload 不复睡，开启后等新状态再打盹', async state => {
    host.callbacks.get('routine')!(state); draw();
    const pillow = host.model.scene.getObjectByName('prop:pillow');
    expect(pillow).toBeDefined();
    const dispose = vi.spyOn(pillow.children[0].children[0].geometry, 'dispose');
    const disabled = { ...DEFAULT_CONFIG, routine: { ...DEFAULT_CONFIG.routine, enabled: false } };
    host.callbacks.get('config')!(disabled);
    expect(dispose).toHaveBeenCalledOnce();
    expect(host.model.scene.getObjectByName('prop:pillow')).toBeUndefined();
    draw();
    expect(host.model.expressionManager.setValue).toHaveBeenCalledWith('relaxed', 0);
    host.callbacks.get('routine')!(state); draw(61_000);
    expect(host.model.scene.getObjectByName('prop:pillow')).toBeUndefined();
    host.callbacks.get('reload')!();
    await vi.waitFor(() => expect(host.model.scene.getObjectByName('props')).toBeDefined());
    draw(61_000); expect(host.model.scene.getObjectByName('prop:pillow')).toBeUndefined();
    host.callbacks.get('config')!(structuredClone(DEFAULT_CONFIG)); draw();
    expect(host.model.scene.getObjectByName('prop:pillow')).toBeUndefined();
    host.callbacks.get('routine')!(state); draw();
    expect(host.model.scene.getObjectByName('prop:pillow')).toBeDefined();
  });

  it('诊断默认隐藏；开启才采样、每10秒发屏幕同样的数字，关闭和隐藏停止记录', () => {
    expect(host.overlay.hidden).toBe(true);
    for (let i = 0; i < 5; i++) draw();
    expect(bridge.reportFps).not.toHaveBeenCalled();
    const enable = { ...DEFAULT_CONFIG, showFps: true } satisfies Config;
    host.callbacks.get('config')!(enable);
    expect(host.overlay.hidden).toBe(false);
    for (let i = 0; i < 500; i++) draw();
    expect(bridge.reportFps).toHaveBeenCalledTimes(1);
    const sample = vi.mocked(bridge.reportFps).mock.calls[0]![0];
    expect(host.overlay.textContent).toBe(`FPS ${sample.fps.toFixed(1)} · 最长帧 ${sample.maxFrameMs.toFixed(1)} ms`);
    expect(sample.maxFrameMs).toBeGreaterThan(0);
    host.callbacks.get('visibility')!({ visible: false });
    vi.advanceTimersByTime(20_000);
    expect(bridge.reportFps).toHaveBeenCalledTimes(1);
    host.callbacks.get('visibility')!({ visible: true });
    draw(); expect(bridge.reportFps).toHaveBeenCalledTimes(1);
    host.callbacks.get('config')!({ ...enable, showFps: false });
    expect(host.overlay.hidden).toBe(true);
    for (let i = 0; i < 550; i++) draw();
    expect(bridge.reportFps).toHaveBeenCalledTimes(1);
  });
});
