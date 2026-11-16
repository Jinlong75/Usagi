import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { Vector3, Euler } from 'three';
import { arc, canSit, coversDisplay, dropTarget, followSeat, HOP_COOLDOWN, hopTarget } from '../src/main/perch/logic';
import type { WindowInfo } from '../src/main/perch/logic';
import { createWindowReader } from '../src/main/perch/windows';
import { PerchController } from '../src/main/perch/controller';
import { BehaviorMachine } from '../src/renderer/behavior/machine';
import { sampleMotion } from '../src/renderer/motion';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/main/config';
import { cacheForegroundFullscreen, isForegroundFullscreen } from '../src/main/routine';
import type { PerchStatus, Point, Rect } from '../src/shared/types';

const area = { x: 0, y: 25, width: 1440, height: 875 };
const window = (id = 'one', bounds: Partial<Rect> = {}): WindowInfo =>
  ({ id, bounds: { x: 100, y: 400, width: 600, height: 400, ...bounds }, minimized: false, ownerPid: 123 });
const options = { enabled: true, auto: true, fullscreen: false, now: 0, lastHop: -Infinity };

describe('窗口上沿可坐区域', () => {
  it('30px 命中，31px 不命中，边缘保留30px，窄窗口和最大化窗口不坐', () => {
    expect(dropTarget([window()], { x: 200, y: 430 }, area)).toEqual({ id: 'one', offsetX: 100 });
    expect(dropTarget([window()], { x: 200, y: 431 }, area)).toBeUndefined();
    expect(dropTarget([window()], { x: 129, y: 400 }, area)).toBeUndefined();
    expect(dropTarget([window()], { x: 671, y: 400 }, area)).toBeUndefined();
    expect(dropTarget([window('narrow', { width: 239 })], { x: 200, y: 400 }, area)).toBeUndefined();
    expect(dropTarget([window('max', { y: area.y })], { x: 200, y: area.y }, area)).toBeUndefined();
    expect(canSit([window('edge', { y: area.y + 39 })], 0, 200, area)).toBe(false);
    expect(canSit([window('edge', { y: area.y + 40 })], 0, 200, area)).toBe(true);
  });
  it('遮挡按 z 序，只检查座位处，多个命中取最上层，忽略最小化遮挡', () => {
    const blocker = window('cover', { x: 180, y: 350, width: 100, height: 200 });
    expect(dropTarget([blocker, window()], { x: 200, y: 400 }, area)).toBeUndefined();
    expect(dropTarget([blocker, window()], { x: 400, y: 400 }, area)?.id).toBe('one');
    expect(dropTarget([window('front', { y: 390 }), window()], { x: 200, y: 385 }, area)?.id).toBe('front');
    expect(dropTarget([{ ...blocker, minimized: true }, window()], { x: 200, y: 400 }, area)?.id).toBe('one');
  });
  it('保持相对水平位置跟随；最小化、关闭、盖住、最大化和越出可坐范围均解除', () => {
    const seat = { id: 'one', offsetX: 100 };
    expect(followSeat([window('one', { x: 300, y: 450 })], seat, area)).toEqual({ x: 400, y: 450 });
    for (const list of [[], [{ ...window(), minimized: true }], [window('cover', { x: 150, y: 380, width: 100 }), window()],
      [window('one', { y: 25 })], [window('one', { y: 950 })], [window('one', { width: 120 })]]) {
      expect(followSeat(list, seat, area)).toBeUndefined();
    }
  });
});
describe('自动跳上去与全屏', () => {
  it('只找上方、同屏、水平400px内最近可坐点，寻找未遮挡侧边', () => {
    const point = { x: 300, y: 600 };
    expect(hopTarget([window('near'), window('far', { y: 200 })], point, area, options)?.id).toBe('near');
    expect(hopTarget([window('below', { y: 650 })], point, area, options)).toBeUndefined();
    expect(hopTarget([window('far', { x: 900 })], point, area, options)).toBeUndefined();
    expect(hopTarget([window('other-screen', { x: 1500 })], { x: 1400, y: 600 }, area, options)).toBeUndefined();
    const target = hopTarget([window('cover', { x: 200, y: 300, width: 200 }), window()], point, area, options);
    expect(target).toBeDefined();
    expect(followSeat([window('cover', { x: 200, y: 300, width: 200 }), window()], target!, area)).toBeDefined();
  });
  it('冷却10分钟，auto=false、关闭、全屏、没有目标时不入池', () => {
    const p = { x: 300, y: 600 };
    for (const overrides of [{ lastHop: 0, now: HOP_COOLDOWN - 1 }, { auto: false }, { enabled: false }, { fullscreen: true }])
      expect(hopTarget([window()], p, area, { ...options, ...overrides })).toBeUndefined();
    expect(hopTarget([window()], p, area, { ...options, lastHop: 0, now: HOP_COOLDOWN })).toBeDefined();
    expect(hopTarget([], p, area, options)).toBeUndefined();
  });
  it('完整bounds才全屏，workArea不算；四边容差2px，支持负坐标显示器', () => {
    const bounds = { x: -1440, y: 0, width: 1440, height: 900 };
    expect(coversDisplay(window('full', bounds), bounds)).toBe(true);
    expect(coversDisplay(window('work', { ...bounds, y: 25, height: 875 }), bounds)).toBe(false);
    expect(coversDisplay(window('tolerance', { x: -1438, y: 2, width: 1436, height: 896 }), bounds)).toBe(true);
    expect(coversDisplay(window('outside', { ...bounds, y: 3 }), bounds)).toBe(false);
    expect(coversDisplay({ ...window('min', bounds), minimized: true }, bounds)).toBe(false);
    expect(coversDisplay(undefined, bounds)).toBe(false);
    cacheForegroundFullscreen(true); expect(isForegroundFullscreen()).toBe(true);
    cacheForegroundFullscreen(false); expect(isForegroundFullscreen()).toBe(false);
  });
  it('抛物线端点精确，最高点比较高端再高60px', () => {
    for (const [from, to] of [[{ x: 100, y: 800 }, { x: 300, y: 400 }], [{ x: 300, y: 400 }, { x: 300, y: 800 }]]) {
      expect(arc(from!, to!, 0)).toEqual(from);
      expect(arc(from!, to!, 1)).toEqual(to);
      const ys = Array.from({ length: 10001 }, (_, i) => arc(from!, to!, i / 10000).y);
      expect(Math.min(...ys)).toBeCloseTo(340, 3);
    }
  });
});
function controller() {
  let now = 0, enabled = true, auto = true;
  let bounds: Rect = { x: 100, y: 200, width: 200, height: 250 };
  const notify = vi.fn<(status: PerchStatus) => void>(), cancel = vi.fn();
  const perch = new PerchController({ bounds: () => bounds, area: () => area, enabled: () => enabled, auto: () => auto,
    visible: () => true, seat: () => ({ x: 0.5, y: 0.8 }), ground: () => 610,
    move: (p: Point) => { bounds = { ...bounds, ...p }; }, cancelWalk: cancel, notify }, () => now);
  perch.update([window()], false);
  return { perch, notify, cancel, bounds: () => bounds, enabled: (v: boolean) => { enabled = v; }, auto: (v: boolean) => { auto = v; },
    advance(ms: number) { now += ms; perch.tick(); } };
}
describe('吸附状态与原生动画所有权', () => {
  it('松手180ms对齐，移动跟随，手动拖动解除', () => {
    const f = controller(); expect(f.perch.drop()).toBe(true); expect(f.cancel).toHaveBeenCalled();
    expect(f.notify).toHaveBeenLastCalledWith({ phase: 'snap', canHop: false });
    f.advance(180); expect(f.perch.sitting).toBe(true);
    expect(f.bounds().y + f.bounds().height * 0.8).toBe(400);
    f.perch.update([window('one', { x: 300, y: 500 })], false);
    expect(f.bounds()).toMatchObject({ x: 300, y: 300 });
    f.perch.detach(); expect(f.perch.active).toBe(false);
  });
  it.each(['minimize', 'close', 'cover', 'maximize', 'outside'] as const)('%s触发跳下，500ms飞行后220ms落地压扁', reason => {
    const f = controller(); f.perch.drop(); f.advance(180);
    const windows = reason === 'minimize' ? [{ ...window(), minimized: true }] : reason === 'close' ? [] : reason === 'cover' ?
      [window('cover', { x: 150, y: 300, width: 100 }), window()] : [window('one', { y: reason === 'maximize' ? 25 : 1000 })];
    f.perch.update(windows, false);
    expect(f.notify).toHaveBeenLastCalledWith({ phase: 'down', canHop: false });
    f.advance(500); expect(f.bounds().y).toBe(610); expect(f.perch.active).toBe(true);
    f.advance(220); expect(f.perch.active).toBe(false);
  });
  it('自动跳有120ms蹲伏、700ms飞行、220ms压扁，成功起跳后冷却', () => {
    const f = controller(); f.perch.update([window('one', { y: 300 })], false);
    expect(f.notify).toHaveBeenLastCalledWith({ phase: 'free', canHop: true });
    f.perch.hop(); f.advance(120); expect(f.bounds().y).toBe(200);
    f.advance(350); expect(f.bounds().y).toBeLessThan(100);
    f.advance(350); expect(f.bounds().y).toBe(100); expect(f.perch.sitting).toBe(false);
    f.advance(220); expect(f.perch.sitting).toBe(true);
    f.perch.detach(); expect(f.notify).toHaveBeenLastCalledWith({ phase: 'free', canHop: false });
  });
  it('关闭吸附后仍完成跳下；auto关闭和全屏时拒绝起跳', () => {
    const f = controller(); f.perch.drop(); f.advance(180); f.enabled(false); f.perch.update([window()], false);
    f.perch.update([window()], false); f.advance(720); expect(f.bounds().y).toBe(610); expect(f.perch.active).toBe(false);
    for (const fullscreen of [true, false]) {
      const f = controller(); f.auto(fullscreen); f.perch.update([window('one', { y: 300 })], fullscreen); f.perch.hop();
      expect(f.perch.active).toBe(false);
    }
  });
});

describe('降级与分发', () => {
  it('koffi加载失败仅记录一行，吸附和全屏静默关闭且不会重试', () => {
    const log = vi.fn(), load = vi.fn(() => { throw new Error('missing binary'); });
    const reader = createWindowReader({ load, log });
    expect(reader.list()).toEqual([]); expect(reader.list()).toEqual([]);
    expect(reader.fullscreen([], () => area)).toBe(false); expect(reader.available).toBe(false);
    expect(log).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(1);
  });
  it('系统调用失败被捕获，不抛给主进程', () => {
    const log = vi.fn();
    const reader = createWindowReader({ platform: 'win32', log, load: () => ({
      struct: () => ({}), proto: () => ({}), pointer: () => ({}),
      load: () => ({ func: (...args: unknown[]) => args[1] === 'EnumWindows' ? () => { throw new Error('API error'); } : () => 0 }),
    }) as never });
    expect(() => reader.list()).not.toThrow(); expect(reader.available).toBe(false);
    expect(reader.fullscreen([], () => area)).toBe(false); expect(log).toHaveBeenCalledTimes(1);
  });
  it('固定版本及两个目标架构预编译文件、asar解包声明齐全', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).dependencies.koffi).toBe('2.15.1');
    for (const arch of ['win32_x64', 'darwin_arm64']) expect(existsSync(`node_modules/koffi/build/koffi/${arch}/koffi.node`)).toBe(true);
    expect(readFileSync('electron-builder.yml', 'utf8')).toContain('node_modules/koffi/build/koffi/**/*.node');
    expect(normalizeConfig({ perch: { auto: false } }).perch).toEqual({ enabled: true, auto: false });
    expect(DEFAULT_CONFIG.perch).toEqual({ enabled: true, auto: true });
  });
});

describe('坐姿与动作池', () => {
  it('坐姿持续保持，腿绕负X朝前，脚每3秒±0.15rad摆动，上身和表情不变', () => {
    for (const t of [0, 0.75, 2.25, 300]) {
      const pose = sampleMotion('sit', t);
      expect(pose.hipsY).toBeCloseTo(-0.035); expect(pose.expressions).toEqual({});
      expect(pose.bones.leftUpperLeg).toEqual([-1.2, 0, 0]);
      expect(new Vector3(0, -1, 0).applyEuler(new Euler(...pose.bones.leftUpperLeg!)).z).toBeGreaterThan(0);
      expect(pose.bones.chest).toBeUndefined();
    }
    expect(sampleMotion('sit', 0.75).bones.leftLowerLeg![0]).toBeCloseTo(0.4);
    expect(sampleMotion('sit', 2.25).bones.leftLowerLeg![0]).toBeCloseTo(0.1);
    expect(sampleMotion('perchHop', 0.06).scale[1]).toBeLessThan(1);
    expect(sampleMotion('perchHop', 0.93).scale).toEqual([1.08, 0.85, 1.08]);
    expect(sampleMotion('perchDown', 0.61).scale).toEqual([1.08, 0.85, 1.08]);
  });
  it('坐着不走路或转身，不选jump/spin/jumpRope；空目标不选perchHop', () => {
    let now = 0;
    const machine = new BehaviorMachine(() => 0.999, () => now);
    machine.perch(true, false);
    for (let i = 0; i < 50; i++) {
      now += 10000; const state = machine.tick({ bounds: { x: 100, y: 100, width: 200, height: 250 }, workArea: area });
      expect(['move', 'turn']).not.toContain(state.state);
      expect(['jump', 'spin', 'jumpRope', 'perchHop']).not.toContain(state.action);
      expect(machine.drain().some(c => c.type === 'move' || c.type === 'perchHop')).toBe(false);
    }
    machine.activity('jumpRope'); expect(machine.snapshot.action).not.toBe('jumpRope');
    const hop = new BehaviorMachine(() => 0.5, () => now, ['perchHop']);
    now += 3500; hop.tick(null); expect(hop.snapshot.action).toBeUndefined();
    hop.perch(false, true); now += 3500; hop.tick(null);
    expect(hop.drain()).toContainEqual({ type: 'perchHop' });
  });
});

it('Windows适配按z序过滤桌面/任务栏/工具/无标题/隐藏UWP/小窗口/自身，物理坐标转DIP且前台匹配', () => {
  type Native = { id: number; cls?: string; visible?: boolean; titleLength?: number; style?: number; cloaked?: number; pid?: number; width?: number; minimized?: boolean };
  const natives: Native[] = [
    { id: 1, visible: false }, { id: 2, titleLength: 0 }, { id: 3, style: 0x80 }, { id: 4, cls: 'Progman' },
    { id: 5, cls: 'WorkerW' }, { id: 6, cls: 'Shell_TrayWnd' }, { id: 7, cls: 'Shell_SecondaryTrayWnd' },
    { id: 8, cloaked: 1 }, { id: 9, width: 200 }, { id: 10, pid: 999 }, { id: 11 }, { id: 12, minimized: true },
  ];
  let current: Native = natives[0]!;
  const bound = new Set<string>();
  const reader = createWindowReader({ platform: 'win32', pid: 999, toDip: r => ({ x: r.x / 2, y: r.y / 2, width: r.width / 2, height: r.height / 2 }),
    load: () => ({
      struct: () => ({}), proto: () => ({}), pointer: () => ({}), sizeof: () => 16, address: (w: Native) => BigInt(w.id),
      decode: () => ({ left: 200, top: 800, right: 200 + (current.width ?? 1200), bottom: 1600 }),
      load: () => ({ func: (...args: unknown[]) => {
        const name = args[0] === '__stdcall' ? String(args[1]) : String(args[0]); bound.add(name);
        if (name === 'EnumWindows') return (callback: (w: Native) => boolean) => {
          for (const w of natives) { current = w; if (!callback(w)) return false; } return true;
        };
        if (name.includes('IsWindowVisible')) return (w: Native) => w.visible !== false;
        if (name.includes('IsIconic')) return (w: Native) => !!w.minimized;
        if (name.includes('GetWindowTextLengthW')) return (w: Native) => w.titleLength ?? 5;
        if (name.includes('GetWindowLongPtrW')) return (w: Native) => w.style ?? 0;
        if (name.includes('GetWindowThreadProcessId')) return (w: Native, out: number[]) => { out[0] = w.pid ?? 123; return 1; };
        if (name.includes('GetClassNameW')) return (w: Native, out: Uint16Array) => { const s = w.cls ?? 'Ordinary'; out.set([...s].map(c => c.charCodeAt(0))); return s.length; };
        if (name.includes('DwmGetWindowAttribute')) return (w: Native, attr: number, out: Buffer) => { if (attr === 14) out.writeUInt32LE(w.cloaked ?? 0); return 0; };
        if (name.includes('GetForegroundWindow')) return () => natives.find(w => w.id === 11);
        throw new Error(`unexpected API ${name}`);
      } }),
    }) as never,
  });
  const windows = reader.list();
  expect(reader.available).toBe(true); expect(windows.map(w => w.id)).toEqual(['11', '12']);
  expect(windows[0]).toEqual({ id: '11', bounds: { x: 100, y: 400, width: 600, height: 400 }, minimized: false, ownerPid: 123 });
  expect(windows[1]!.minimized).toBe(true); expect(windows.every(w => w.title === undefined)).toBe(true);
  expect(reader.fullscreen(windows, () => windows[0]!.bounds)).toBe(true);
  expect(reader.fullscreen(windows, () => area)).toBe(false);
  expect([...bound].some(name => /GetWindowTextW\(/.test(name))).toBe(false);
});
