import { describe, expect, it } from 'vitest';
import { BehaviorMachine, ACTIONS, pickAction, DURATIONS, inwardDirection, planMove } from '../src/renderer/behavior/machine';
import type { Action } from '../src/renderer/behavior/machine';
import type { WindowInfo } from '../src/shared/types';
import { sampleMotion } from '../src/renderer/motion';

const info: WindowInfo = { bounds: { x: 340, y: 90, width: 320, height: 420 }, workArea: { x: 0, y: 0, width: 1000, height: 800 } };
function fixture(values: number[], pool?: Action[]) {
  let now = 0; let index = 0;
  const machine = new BehaviorMachine(() => values[index++] ?? 0, () => now, pool);
  return { machine, advance: (ms: number) => { now += ms; return machine.tick(info); }, set: (time: number) => { now = time; } };
}
describe('纯行为规则', () => {
  it.each([0, 0.2999, 0.30, 0.3999, 0.40, 0.7999, 0.80, 0.9999])('掷骰边界 %s', (roll) => {
    const f = fixture([roll]);
    expect(f.advance(3500).state).toBe(roll < 0.4 ? 'idle' : roll < 0.8 ? 'act' : 'turn');
  });
  it('动作只排除上一个，单元素保留、空池回待机', () => {
    const f = fixture([0.5, 0, 0.5, 0, 0.5, 0]);
    expect(f.advance(3500).action).toBe('jump');
    expect(f.advance(1200).action).toBe('stretch');
    expect(f.advance(2200).action).toBe('jump');
    const single = fixture([0.5, 0, 0.5, 0], ['jump']);
    expect(single.advance(3500).action).toBe('jump');
    expect(single.advance(1200).action).toBe('jump');
    expect(fixture([0.5], []).advance(3500).state).toBe('idle');
  });
  it('朝向闸门只由位置改变，带宽是可达带的 ±7%', () => {
    const at = (x: number) => ({ ...info, bounds: { ...info.bounds, x } });
    expect(inwardDirection(at(340), -1)).toBe(-1);
    expect(inwardDirection(at(340 - 44), -1)).toBe(-1);
    expect(inwardDirection(at(340 - 46), -1)).toBe(1);
    expect(inwardDirection(at(340 + 44), 1)).toBe(1);
    expect(inwardDirection(at(340 + 46), 1)).toBe(-1);
    const f = fixture([0.31]);
    f.set(3500);
    expect(f.machine.tick(at(600))).toMatchObject({ state: 'turn', direction: -1 });
    expect(f.advance(450)).toMatchObject({ state: 'turn', toAngle: 0 });
    expect(f.advance(450).state).toBe('idle');
  });
  it('移动被拒回动作、无动作回待机', () => {
    const tiny = { ...info, workArea: { ...info.workArea, width: 400 }, bounds: { ...info.bounds, x: 40 } };
    const f = fixture([0.9]); f.set(3500);
    expect(f.machine.tick(tiny).state).toBe('act');
    const empty = fixture([0.9], []); empty.set(3500);
    expect(empty.machine.tick(tiny).state).toBe('idle');
    f.machine.press(true); f.set(10000);
    expect(f.machine.tick(info).state).toBe('idle');
    expect(f.machine.drain()).toEqual([{ type: 'cancel' }]);
  });
  it('两边够才随机；单边只能朝可移动侧，距离与边距不越界且 Y 固定', () => {
    expect(planMove(info, () => 0)).toMatchObject({ x: 280, y: 90, direction: -1, durationMs: 60 / 90 * 1000 });
    expect(planMove(info, () => 0.99999)).toMatchObject({ x: 580, direction: 1 });
    const leftEdge = { ...info, bounds: { ...info.bounds, x: 20 } };
    expect(planMove(leftEdge, () => 0)?.direction).toBe(1);
    const rightEdge = { ...info, bounds: { ...info.bounds, x: 660 } };
    expect(planMove(rightEdge, () => 0.99999)?.direction).toBe(-1);
    for (let x = 20; x <= 660; x += 10) {
      for (const value of [0, 0.5, 0.99999]) {
        const move = planMove({ ...info, bounds: { ...info.bounds, x } }, () => value)!;
        expect(move.x).toBeGreaterThanOrEqual(20); expect(move.x).toBeLessThanOrEqual(660);
        expect(Math.abs(move.x - x)).toBeGreaterThanOrEqual(60); expect(Math.abs(move.x - x)).toBeLessThanOrEqual(240);
      }
    }
  });
  it('部分越界时先裁终点：真实距离、90px/s 时长与每 45px 一步保持一致', () => {
    const outside = { ...info, bounds: { ...info.bounds, x: 750 } };
    const plan = planMove(outside, () => 0)!;
    // The raw 60px plan would end at 690; the reachable edge is 660.
    expect(plan).toMatchObject({ x: 660, y: 90, direction: -1, durationMs: 1000 });
    const distance = Math.abs(plan.x - outside.bounds.x);
    const seconds = plan.durationMs / 1000;
    expect(distance).toBe(90);
    expect(Math.abs(distance / seconds - 90)).toBeLessThanOrEqual(1);
    expect(distance / 45).toBe(2);
    for (const p of [0.2, 0.4, 0.6, 0.8]) {
      const traveled = p * p * (3 - 2 * p) * distance;
      const pose = sampleMotion('walk', seconds * p, { duration: seconds });
      expect(pose).toEqual(sampleMotion('walk', seconds * p, { duration: seconds, distance: traveled }));
      expect(pose.bones.leftUpperLeg![0]).toBeCloseTo(Math.sin(traveled / 45 * Math.PI) * 0.16);
    }
  });
  it('先转向再发移动请求，完成通知后转回正面', () => {
    const f = fixture([0.9]);
    f.advance(3500); expect(f.machine.drain()).toEqual([]);
    expect(f.advance(450).state).toBe('move');
    expect(f.machine.drain()).toEqual([{ type: 'move', request: { x: 280, y: 90, durationMs: 60 / 90 * 1000 } }]);
    expect(f.advance(700).state).toBe('move'); // Wait for native completion within the one-second grace period.
    f.machine.moveDone({ ok: true, distance: 60 }); expect(f.machine.snapshot).toMatchObject({ state: 'turn', toAngle: 0 });
    expect(f.advance(450).state).toBe('idle');
  });
  it.each(['turn', 'move', 'click', 'drag'] as const)('%s 被点击接管，旧计划永不恢复', (state) => {
    const f = fixture([0.9, 0, 0, 0, 0]); f.advance(3500);
    if (state === 'move') f.advance(450);
    if (state === 'click') f.machine.click();
    if (state === 'drag') f.machine.drag(true);
    f.machine.drain();
    f.machine.click();
    expect(f.machine.snapshot.state).toBe('click');
    expect(f.machine.drain().map((command) => command.type)).toEqual(['cancel', 'sound']);
    f.machine.moveDone({ ok: true, distance: 60 }); expect(f.machine.snapshot.state).toBe('click');
    expect(f.advance(1400).state).toBe('idle');
    expect(f.machine.drain()).toEqual([]);
  });
  it('隐藏/缩放的释放通知也清除待移动路线，恢复后不会跳回旧终点', () => {
    const f = fixture([0.9, 0.9, 0, 0.31]);
    f.advance(3500); expect(f.machine.snapshot.state).toBe('turn');
    f.machine.press(false); expect(f.machine.drain()).toEqual([{ type: 'cancel' }]);
    f.set(7000);
    f.machine.tick({ ...info, bounds: { ...info.bounds, x: 600 } });
    expect(f.machine.snapshot.state).toBe('turn');
    expect(f.advance(450)).toMatchObject({ state: 'turn', toAngle: 0 });
    expect(f.machine.drain()).toEqual([]);
    expect(f.advance(450).state).toBe('idle');
  });
  it.each(['turn', 'move', 'click', 'drag'] as const)('%s 隐藏后不计时不掷骰，等待再显示从 idle 重新计时', (state) => {
    const f = fixture([0.9, 0, 0, 0.5, 0.5]); f.advance(3500);
    if (state === 'move') f.advance(450);
    if (state === 'click') f.machine.click();
    if (state === 'drag') f.machine.drag(true);
    f.machine.drain();
    f.machine.visibility(false);
    expect(f.machine.drain()).toEqual([{ type: 'cancel' }]);
    const hidden = { ...f.machine.snapshot };
    expect(f.advance(60_000)).toEqual(hidden);
    expect(f.machine.drain()).toEqual([]);
    f.machine.visibility(true);
    expect(f.machine.snapshot.state).toBe('idle');
    f.machine.drain();
    expect(f.advance(3499).state).toBe('idle');
    expect(f.advance(1).state).toBe('act'); // Hidden ticks consumed no random values.
    expect(f.machine.drain()).toEqual([]); // The old route is gone.
  });
  it.each(['hidden', 'dragging', 'invalid-target'])('主进程以 %s 拒绝移动，立即回 idle', (reason) => {
    const f = fixture([0.9]); f.advance(3500); f.advance(450); f.machine.drain();
    f.machine.moveDone({ ok: false, reason });
    expect(f.machine.snapshot.state).toBe('idle');
    expect(f.advance(1).state).toBe('idle');
    expect(f.machine.drain()).toEqual([]);
  });
  it('移动到计划时长 + 1 秒未回执时取消并回 idle，晚回执不复活路线', () => {
    const f = fixture([0.9, 0, 30 / 181]); f.advance(3500); f.advance(450); f.machine.drain();
    expect(f.machine.snapshot.durationMs).toBe(1000);
    const timeout = f.machine.snapshot.durationMs + 1000;
    expect(f.advance(timeout - 1).state).toBe('move');
    expect(f.advance(1).state).toBe('idle');
    expect(f.machine.drain()).toEqual([{ type: 'cancel' }]);
    f.machine.moveDone({ ok: true, distance: 60 });
    expect(f.machine.snapshot.state).toBe('idle');
  });
  it('点击只排除上一次；时长 1～1.4s，拖动声音 30% 且只在开始', () => {
    const f = fixture([0, 0, 0, 0.29, 0.30]);
    expect(f.machine.click()).toBe('happy'); expect(f.machine.click()).toBe('surprised'); expect(f.machine.click()).toBe('happy');
    f.machine.drain();
    f.machine.drag(true); expect(f.machine.drain()).toEqual([{ type: 'cancel' }, { type: 'sound', use: 'drag' }]);
    expect(f.advance(60000).state).toBe('drag');
    f.machine.drag(false); f.machine.drain();
    f.machine.drag(true); expect(f.machine.drain()).toEqual([{ type: 'cancel' }]);
    for (const name of ['happy', 'surprised', 'shout'] as const) {
      expect(DURATIONS[name]).toBeGreaterThanOrEqual(1000); expect(DURATIONS[name]).toBeLessThanOrEqual(1400);
    }
  });
});


describe('道具活动与作息', () => {
  it('固定均匀随机数下低权重动作各为旧动作一半，仍只排除上一项', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      const action = pickAction(ACTIONS, undefined, (i + 0.5) / 10000)!;
      counts[action] = (counts[action] ?? 0) + 1;
    }
    expect(counts).toEqual({ perchHop: 833, jump: 1667, stretch: 1667, shake: 1666, spin: 1667, jumpRope: 833, blowBubbles: 834, sneakSnack: 833 });
    for (const name of ['eatRiceball', 'eatWatermelon', 'iceCream']) expect(ACTIONS).not.toContain(name);
    for (const previous of ACTIONS) for (let i = 0; i < 100; i++) expect(pickAction(ACTIONS, previous, i / 100)).not.toBe(previous);
    expect(pickAction(['jumpRope'], 'jumpRope', 0)).toBe('jumpRope');
    expect(pickAction([], undefined, 0)).toBeUndefined();
  });
  it('菜单活动打断移动且旧回执不复活，跳绳结束只喊一次，拖动不可打断', () => {
    const f = fixture([0.9]); f.advance(3500); f.advance(450); f.machine.drain();
    f.machine.activity('jumpRope'); expect(f.machine.snapshot).toMatchObject({ state: 'act', action: 'jumpRope', durationMs: 6500 });
    expect(f.machine.drain()).toEqual([{ type: 'cancel' }]);
    f.machine.moveDone({ ok: true, distance: 60 }); expect(f.machine.snapshot.action).toBe('jumpRope');
    f.advance(6499); expect(f.machine.drain()).toEqual([]);
    f.advance(1); expect(f.machine.drain().filter(command => command.type === 'sound')).toEqual([{ type: 'sound', use: 'click_shout' }]);
    f.advance(1); expect(f.machine.drain()).toEqual([]);
    f.machine.drag(true); f.machine.drain(); f.machine.activity('blowBubbles');
    expect(f.machine.snapshot.state).toBe('drag'); expect(f.machine.drain()).toEqual([]);
  });
  it.each(['nap', 'sleep'] as const)('%s 立即取消移动并无限打盹，真实 press/click 顺序惊醒 60 秒，awake 伸懒腰', routine => {
    const f = fixture([0.9]); f.advance(3500); f.advance(450); f.machine.drain();
    f.machine.routine(routine); expect(f.machine.snapshot.state).toBe('nap');
    expect(f.machine.drain()).toEqual([{ type: 'cancel' }]);
    expect(f.advance(1_000_000).state).toBe('nap');
    f.machine.press(true); f.machine.press(false);
    expect(f.machine.click()).toBe('surprised');
    expect(f.machine.drain()).toContainEqual({ type: 'sound', use: 'click_surprise' });
    expect(f.advance(1100).state).toBe('idle');
    expect(f.advance(58_899).state).not.toBe('nap');
    expect(f.advance(1).state).toBe('nap');
    f.machine.routine('awake'); expect(f.machine.snapshot).toMatchObject({ state: 'act', action: 'stretch' });
    expect(f.advance(2200).state).not.toBe('nap');
  });
  it('拖动时先藏枕头，放手后恰好 2 秒恢复；拖动中 awake 延迟到放手伸展', () => {
    const f = fixture([0.9]); f.machine.routine('nap');
    f.machine.press(true); f.machine.drag(true); expect(f.machine.snapshot.state).toBe('drag');
    f.advance(10000); f.machine.drag(false); f.machine.press(false);
    expect(f.advance(1999).state).toBe('idle'); expect(f.advance(1).state).toBe('nap');
    f.machine.drag(true); f.machine.routine('awake'); expect(f.machine.snapshot.state).toBe('drag');
    f.machine.drag(false); expect(f.advance(1)).toMatchObject({ state: 'act', action: 'stretch' });
  });
});


describe('进食结束与偷吃点击', () => {
  it.each(['eatRiceball', 'eatWatermelon', 'iceCream'] as const)('%s 菜单打断 act/move、正常完成才通知一次，拖动不接管', action => {
    const f = fixture([0.9]); f.advance(3500); f.advance(450);
    const request = { activity: action, feedId: 42 };
    f.machine.activity(request); f.machine.drain();
    expect(f.advance(DURATIONS[action] - 1).action).toBe(action);
    expect(f.machine.drain()).toEqual([]);
    f.advance(1);
    const commands = f.machine.drain();
    expect(commands.filter(command => command.type === 'activityDone')).toEqual([{ type: 'activityDone', ...request }]);
    expect(commands.filter(command => command.type === 'sound')).toEqual(action === 'eatRiceball' ? [{ type: 'sound', use: 'click_happy' }] : []);
    f.advance(1); expect(f.machine.drain()).toEqual([]);
    f.machine.activity(request); f.machine.click(); f.machine.drain(); f.advance(DURATIONS[action]);
    expect(f.machine.drain().some(command => command.type === 'activityDone')).toBe(false);
    f.machine.drag(true); f.machine.drain(); f.machine.activity(request);
    expect(f.machine.snapshot.state).toBe('drag'); expect(f.machine.drain()).toEqual([]);
  });
  it.each([false, true])('偷吃点击：先冻结原姿态 400ms，再接惊讶点击和声音（原生 press 序列=%s）', press => {
    const f = fixture([0.5, 0], ['sneakSnack']); f.advance(3500); f.advance(1700); f.machine.drain();
    if (press) { f.machine.press(true); expect(f.machine.snapshot).toMatchObject({ state: 'caught', snackAge: 1.7 }); f.machine.press(false); }
    expect(f.machine.click()).toBe('surprised');
    const frozen = f.machine.snapshot;
    expect(frozen).toMatchObject({ state: 'caught', durationMs: 400, snackAge: 1.7 });
    expect(f.machine.drain().some(command => command.type === 'sound')).toBe(false);
    expect(f.advance(399)).toEqual(frozen);
    expect(f.advance(1)).toMatchObject({ state: 'click', reaction: 'surprised', durationMs: 1100 });
    expect(f.machine.drain()).toContainEqual({ type: 'sound', use: 'click_surprise' });
    expect(f.advance(1100).state).toBe('idle');
  });
  it('偷吃按下后变成拖动，不会在放手后触发被抓住', () => {
    const f = fixture([0.5, 0], ['sneakSnack']); f.advance(3500); f.advance(1700);
    f.machine.press(true); f.machine.drag(true); f.machine.drag(false); f.machine.press(false);
    expect(f.machine.click()).toBe('happy'); expect(f.machine.snapshot.state).toBe('click');
  });
});
