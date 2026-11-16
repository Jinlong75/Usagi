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
vi.mock('../src/renderer/motion', () => ({ ARM_REST: 1, MotionRig: class { reset() {} apply() {} }, sampleMotion: () => ({}) }));
vi.mock('../src/renderer/motion/framing', async () => {
  const { Box3, Vector3 } = await import('three');
  const bounds = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 2, 1));
  return { measureMotionBounds: () => ({ neutral: bounds, motion: bounds }), springEnvelope: () => bounds,
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
    host.model = { scene, humanoid: { getNormalizedBoneNode: () => null }, update() {}, meta: { metaVersion: '1' } };
    host.read.mockImplementation((x: number, _y: number, _w: number, _h: number, _format: number, _type: number, pixel: Uint8Array) => {
      pixel[3] = x >= 100 && x < 200 ? 255 : 0;
    });
    const listen = (name: string) => (callback: (value?: any) => void) => { host.callbacks.set(name, callback); return () => {}; };
    bridge = {
      platform: 'win32', reportFps: vi.fn(), getConfig: async () => structuredClone(DEFAULT_CONFIG),
      onConfig: listen('config'), onCursor: listen('cursor'), onPress: listen('press'), onClick: listen('click'),
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
