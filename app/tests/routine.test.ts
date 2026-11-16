import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/main/config';
import { BEDTIME_LINES, inRange, insertWeather, logicalDay, questionText, Routine, ROUTINE_LINES } from '../src/main/routine';
import { SelfTalk } from '../src/main/selfTalk';

let directory: string;
beforeEach(() => { vi.useFakeTimers(); directory = mkdtempSync(join(tmpdir(), 'usagi-routine-')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }); });
const date = (hour: number, minute = 0, day = 16) => new Date(2026, 10, day, hour, minute);
function setup(hour = 7, minute = 0) {
  let now = date(hour, minute), idle = 0, blocked = false, fullscreen = false;
  const config = structuredClone(DEFAULT_CONFIG.routine);
  const show = vi.fn(), sound = vi.fn(), state = vi.fn(), weatherLine = vi.fn(async (): Promise<string | null> => null);
  const options = { path: join(directory, 'routine-state.json'), config: () => config, now: () => now,
    idleSeconds: () => idle, blocked: () => blocked, fullscreen: () => fullscreen,
    show, sound, state, weatherLine, random: () => 0 };
  const routine = new Routine(options);
  return { routine, options, config, show, sound, state, weatherLine,
    at: (hour: number, minute = 0, day = 16) => { now = date(hour, minute, day); },
    idle: (value: number) => { idle = value; }, block: (value: boolean) => { blocked = value; },
    fullscreen: (value: boolean) => { fullscreen = value; } };
}

describe('作息调度，假时钟与临时状态文件', () => {
  it.each([[7, 'morning'], [12, 'lunch'], [18, 'dinner']] as const)('%s 点首次活跃问话 10 秒且播一次叫声，同日及重启不重复', async (hour, period) => {
    const c = setup(hour); await c.routine.tick();
    expect(c.show).toHaveBeenCalledExactlyOnceWith(ROUTINE_LINES[period][0], 10_000, true);
    expect(c.sound).toHaveBeenCalledOnce();
    await c.routine.tick(); await new Routine(c.options).tick();
    expect(c.show).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(c.options.path, 'utf8')).days[period]).toBe('2026-11-16');
    expect(readdirSync(directory)).toEqual(['routine-state.json']);
  });
  it('每 30 秒检查，停止后不再触发', async () => {
    const c = setup(); c.routine.start();
    await vi.advanceTimersByTimeAsync(29_999); expect(c.show).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(c.show).toHaveBeenCalledOnce();
    c.routine.stop(); c.at(12); await vi.advanceTimersByTimeAsync(60_000); expect(c.show).toHaveBeenCalledOnce();
  });
  it('天气等待不改变 30 秒检查节拍，重启调度不遗留旧计时器', async () => {
    const c = setup(), tick = vi.spyOn(c.routine, 'tick');
    c.weatherLine.mockImplementationOnce(() => new Promise(() => {})); c.routine.start();
    await vi.advanceTimersByTimeAsync(30_000); expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000); expect(c.show).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(27_000); expect(tick).toHaveBeenCalledTimes(2);
    c.at(7, 0, 17); c.weatherLine.mockImplementationOnce(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(30_000); expect(tick).toHaveBeenCalledTimes(3);
    c.routine.start(); await vi.advanceTimersByTimeAsync(3000); expect(c.show).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(27_000); expect(tick).toHaveBeenCalledTimes(4);
    expect(c.show).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(1); c.routine.stop();
  });
  it('错过时段不补，起止相同关闭，跨午夜区间正确', async () => {
    const c = setup(10); await c.routine.tick(); expect(c.show).not.toHaveBeenCalled();
    c.config.lunch = ['12:00', '12:00']; c.at(12); await c.routine.tick(); expect(c.show).not.toHaveBeenCalled();
    expect(inRange(date(23), ['22:00', '02:00'])).toBe(true);
    expect(inRange(date(2), ['22:00', '02:00'])).toBe(false);
  });
  it('空闲 60 秒不触发，恢复到 59 秒才触发', async () => {
    const c = setup(); c.idle(60); await c.routine.tick(); expect(c.show).not.toHaveBeenCalled();
    c.idle(59); await c.routine.tick(); expect(c.show).toHaveBeenCalledOnce();
  });
  it.each(['block', 'fullscreen'] as const)('%s 推迟至解除，若已错过整个时段则不补', async key => {
    const c = setup(); c[key](true); await c.routine.tick(); expect(c.show).not.toHaveBeenCalled();
    c[key](false); await c.routine.tick(); expect(c.show).toHaveBeenCalledOnce();
    c.at(12); c[key](true); await c.routine.tick(); c.at(14, 30); c[key](false);
    await c.routine.tick(); expect(c.show).toHaveBeenCalledOnce();
  });
  it('bedtime 每 30 分钟依次提醒，重启保留次数，第四次不出', async () => {
    const c = setup(22, 29); await c.routine.tick(); expect(c.show).not.toHaveBeenCalled();
    c.at(22, 30); await c.routine.tick();
    c.at(22, 59); await c.routine.tick(); expect(c.show).toHaveBeenCalledTimes(1);
    c.at(23); await new Routine(c.options).tick();
    c.at(23, 30); await new Routine(c.options).tick();
    c.at(23, 59); await new Routine(c.options).tick();
    expect(c.show.mock.calls.map(call => call[0])).toEqual(BEDTIME_LINES);
    expect(c.sound).toHaveBeenCalledTimes(3);
  });
  it('05:00 为逻辑日界，午夜 sleep 至 06:00 连续睡眠不重复，第二夜会再触发', async () => {
    expect(logicalDay(date(4, 59))).toBe('2026-11-15'); expect(logicalDay(date(5))).toBe('2026-11-16');
    const c = setup(23, 30); await c.routine.tick();
    c.at(0, 0, 17); await c.routine.tick();
    expect(c.show).toHaveBeenLastCalledWith('呼……（晚安）', 3200, false);
    expect(c.state).toHaveBeenLastCalledWith('sleep');
    c.at(5, 0, 17); await new Routine(c.options).tick();
    expect(c.show).toHaveBeenCalledTimes(2);
    c.at(6, 0, 17); await c.routine.tick(); expect(c.state).toHaveBeenLastCalledWith('awake');
    c.at(0, 0, 18); await c.routine.tick();
    expect(c.show.mock.calls.filter(call => call[0] === '呼……（晚安）')).toHaveLength(2);
  });
  it('自定义跨午夜的催睡仍每 30 分钟一次并在重启后保持同一逻辑日计数', async () => {
    const c = setup(23, 30); c.config.bedtime = '23:30'; c.config.sleep = ['00:00', '00:00'];
    await c.routine.tick(); c.at(0, 0, 17); await new Routine(c.options).tick();
    c.at(0, 30, 17); await new Routine(c.options).tick();
    c.at(1, 0, 17); await new Routine(c.options).tick();
    expect(c.show.mock.calls.map(call => call[0])).toEqual(BEDTIME_LINES);
  });
  it('离开至少 30 分钟再活跃会招呼，2 小时冷却持久化，休息期间不招呼', async () => {
    const c = setup(10, 30); c.idle(1800); await c.routine.tick(); c.idle(0); await c.routine.tick();
    expect(c.show).toHaveBeenLastCalledWith(ROUTINE_LINES.welcome[0], 3200, false);
    const restarted = new Routine(c.options);
    c.at(11); c.idle(1800); await restarted.tick(); c.idle(0); await restarted.tick(); expect(c.show).toHaveBeenCalledOnce();
    c.at(12, 30); c.config.lunch = ['00:00', '00:00'];
    c.idle(1800); await restarted.tick(); c.idle(0); await restarted.tick(); expect(c.show).toHaveBeenCalledTimes(2);
    c.at(13); c.idle(1800); await restarted.tick(); c.idle(0); await restarted.tick();
    expect(c.show.mock.calls.filter(call => ROUTINE_LINES.welcome.includes(call[0]))).toHaveLength(2);
  });
  it('quiet 不出气泡、不响，但 idle/blocked 期间仍发休息与醒来状态；enabled=false 全停', async () => {
    const c = setup(13); c.config.quiet = true; c.idle(1800); c.block(true);
    await c.routine.tick(); expect(c.state).toHaveBeenCalledExactlyOnceWith('nap'); expect(c.routine.resting).toBe(true);
    c.idle(0); c.block(false); await c.routine.tick();
    expect(c.show).not.toHaveBeenCalled(); expect(c.sound).not.toHaveBeenCalled();
    c.at(14); await c.routine.tick(); expect(c.state).toHaveBeenLastCalledWith('awake');
    c.config.enabled = false; c.at(0); c.state.mockClear(); await c.routine.tick();
    expect(c.routine.resting).toBe(false); expect(c.state).not.toHaveBeenCalled();
    expect(c.show).not.toHaveBeenCalled(); expect(c.sound).not.toHaveBeenCalled();
  });
  it.each([[13, 14, 'nap'], [0, 6, 'sleep']] as const)('%s 点发 %s 状态，自言自语立即暂停，到结束后恢复', async (start, end, state) => {
    const c = setup(start), talkShow = vi.fn();
    const talk = new SelfTalk({ config: () => ({ ...DEFAULT_CONFIG.selfTalk, minSec: 5, maxSec: 5 }),
      blocked: () => c.routine.resting, show: talkShow, sound: vi.fn(), random: () => 0 });
    talk.restart(); await vi.advanceTimersByTimeAsync(5000); expect(talkShow).not.toHaveBeenCalled();
    await c.routine.tick(); expect(c.state).toHaveBeenLastCalledWith(state);
    c.at(end); await c.routine.tick(); expect(c.state).toHaveBeenLastCalledWith('awake');
    await vi.advanceTimersByTimeAsync(5000); expect(talkShow).toHaveBeenCalledOnce(); talk.stop();
  });
  it('天气 3 秒超时或失败用原句，成功则插在中文问句之前', async () => {
    const c = setup(); c.weatherLine.mockImplementationOnce(() => new Promise(() => {}));
    const tick = c.routine.tick(); await vi.advanceTimersByTimeAsync(2999); expect(c.show).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await tick;
    expect(c.show).toHaveBeenCalledWith(ROUTINE_LINES.morning[0], 10_000, true);
    c.at(7, 0, 17); c.weatherLine.mockResolvedValueOnce('今天晴，12～20°C。'); await c.routine.tick();
    expect(c.show).toHaveBeenLastCalledWith('呀哈呀哈！（起床啦～今天晴，12～20°C。早饭吃了没？）', 10_000, true);
    c.at(7, 0, 18); c.weatherLine.mockRejectedValueOnce(new Error('offline')); await c.routine.tick();
    expect(c.show).toHaveBeenLastCalledWith(ROUTINE_LINES.morning[0], 10_000, true);
    expect(insertWeather(ROUTINE_LINES.morning[2]!, '晴。')).toBe('哈？（天亮了！晴。早饭吃了什么呀？）');
    expect(questionText('呀哈！（早上好～今天晴。早饭吃了什么？）')).toBe('早上好～今天晴。早饭吃了什么？');
  });
  it.each(['blocked', 'disabled', 'stop', 'out-of-range'] as const)('天气等待过程中 %s 不会漏出旧问候', async change => {
    const c = setup(); let resolve!: (line: string) => void;
    c.weatherLine.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = c.routine.tick(); await Promise.resolve();
    if (change === 'blocked') c.block(true);
    else if (change === 'disabled') c.config.enabled = false;
    else if (change === 'stop') c.routine.stop();
    else c.at(10);
    resolve('晴。'); await pending; expect(c.show).not.toHaveBeenCalled(); expect(c.sound).not.toHaveBeenCalled();
  });
  it('损坏状态文件隔离后重建，不信任非法状态结构', async () => {
    for (const raw of ['{oops', JSON.stringify({ days: {}, bedtime: { day: '', count: 9, lastAt: 0 }, lastWelcome: null })]) {
      const c = setup(); writeFileSync(c.options.path, raw); await new Routine(c.options).tick();
      expect(c.show).toHaveBeenCalledOnce(); expect(readdirSync(directory).some(name => /routine-state\.broken-\d+\.json/.test(name))).toBe(true);
    }
  });
  it('非法时间回落默认，合法相等时间保持以关闭时段', () => {
    const c = normalizeConfig({ routine: { morning: ['24:00', '09:60'], lunch: ['6:00', null], nap: ['13:00', '13:00'],
      bedtime: '22:300', dinner: ['17:00'], sleep: ['00:00', '23:59'], enabled: false, quiet: true } });
    expect(c.routine).toEqual({ ...DEFAULT_CONFIG.routine, enabled: false, quiet: true, nap: ['13:00', '13:00'], sleep: ['00:00', '23:59'] });
  });
});
