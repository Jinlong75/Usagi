import { describe, expect, it } from 'vitest';
import { BehaviorMachine, DURATIONS, inwardDirection, planMove } from '../src/renderer/behavior/machine';
import type { Action } from '../src/renderer/behavior/machine';
import type { WindowInfo } from '../src/shared/types';

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
  it('先转向再发移动请求，完成通知后转回正面', () => {
    const f = fixture([0.9]);
    f.advance(3500); expect(f.machine.drain()).toEqual([]);
    expect(f.advance(450).state).toBe('move');
    expect(f.machine.drain()).toEqual([{ type: 'move', request: { x: 280, y: 90, durationMs: 60 / 90 * 1000 } }]);
    expect(f.advance(5000).state).toBe('move'); // Native completion, not a renderer timer, owns the finish.
    f.machine.moveDone(); expect(f.machine.snapshot).toMatchObject({ state: 'turn', toAngle: 0 });
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
    f.machine.moveDone(); expect(f.machine.snapshot.state).toBe('click');
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
