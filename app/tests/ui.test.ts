import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/main/config';
import { BUILTIN_LINES, BUBBLE_DURATION, chooseLine, SelfTalk, talkDelay } from '../src/main/selfTalk';
import { bubblePosition, companionBounds, emotionExpression, menuState, preview, typewriterCount } from '../src/shared/ui';

describe('008 配置迁移', () => {
  it('旧配置补默认，嵌套部分字段独立合并，Key 被丢弃', () => {
    const config = normalizeConfig({ alwaysOnTop: false, chat: { model: 'custom', apiKey: 'never-persist' }, selfTalk: { enabled: false } });
    expect(config).toEqual({ ...DEFAULT_CONFIG, alwaysOnTop: false,
      chat: { ...DEFAULT_CONFIG.chat, model: 'custom' }, selfTalk: { ...DEFAULT_CONFIG.selfTalk, enabled: false } });
    expect(JSON.stringify(config)).not.toContain('never-persist');
    config.selfTalk.lines.push('a'); config.chat.model = 'changed';
    expect(normalizeConfig({}).selfTalk.lines).toEqual([]);
    expect(DEFAULT_CONFIG.chat.model).toBe('deepseek-flash');
  });
  it('限制间隔、温度、音量，保留 0 与 false，非法数字回退', () => {
    expect(normalizeConfig({ selfTalk: { minSec: 1, maxSec: 2, lines: [' a ', '', 'a', 3] },
      chat: { temperature: 8, maxTokens: Infinity, thinking: 'enabled' }, volume: -1, mousePassthrough: true }))
      .toMatchObject({ selfTalk: { minSec: 5, maxSec: 5, lines: ['a'] }, volume: 0, mousePassthrough: true,
        chat: { temperature: 1.5, maxTokens: 2048, thinking: 'enabled' } });
    expect(normalizeConfig({ volume: NaN, chat: { temperature: 0 }, selfTalk: { minSec: 90, maxSec: 10 } }))
      .toMatchObject({ volume: 0.7, chat: { temperature: 0 }, selfTalk: { minSec: 90, maxSec: 90 } });
  });
});
describe('气泡与窗口布局', () => {
  const area = { x: 0, y: 0, width: 1200, height: 900 };
  const pet = { x: 400, y: 300, width: 320, height: 420 };
  it('上方居中，空间不足时选择空闲最多的右/左侧', () => {
    expect(bubblePosition(pet, area, 240, 80)).toEqual({ x: 440, y: 212, width: 240, height: 80, side: 'top' });
    expect(bubblePosition({ ...pet, x: 50, y: 10 }, area, 240, 80)).toMatchObject({ x: 378, side: 'right' });
    expect(bubblePosition({ ...pet, x: 800, y: 10 }, area, 240, 80)).toMatchObject({ x: 552, side: 'left' });
  });
  it('负屏幕坐标、屏幕边缘和聊天窗不出屏且不覆盖桌宠', () => {
    const negative = { x: -1400, y: -100, width: 1400, height: 1000 };
    const bounds = bubblePosition({ ...pet, x: -1390, y: -90 }, negative, 264, 300);
    expect(bounds.side).toBe('right'); expect(bounds.x).toBeGreaterThanOrEqual(negative.x);
    expect(bounds.y).toBeGreaterThanOrEqual(negative.y);
    const chat = companionBounds({ ...pet, x: 850 }, area, 360, 520);
    expect(chat.x + chat.width).toBeLessThanOrEqual(850);
    expect(chat.y).toBeGreaterThanOrEqual(0); expect(chat.y + chat.height).toBeLessThanOrEqual(900);
  });
});
describe('自言自语：纯随机、注入时钟、阻塞重排', () => {
  it('规定的十句完整保留，只排除上一句，单自定义句允许重复', () => {
    expect(BUILTIN_LINES).toEqual(['呀哈！', '乌拉！', '哈？', '噗噜噜噜噜……', '呀哈呀哈！', '乌拉～乌拉～', '哈啊？！', '咿呀～哈～！', '嗯～？', '呀——哈——！']);
    expect(chooseLine([], '呀哈！', () => 0)).toBe('乌拉！');
    expect(chooseLine(['a', 'b', 'c'], 'b', () => 0.99)).toBe('c');
    expect(chooseLine(['a'], 'a', () => 0)).toBe('a');
    expect(talkDelay(20, 60, () => 0)).toBe(20000);
    expect(talkDelay(20, 60, () => 0.5, BUBBLE_DURATION)).toBe(43200);
    expect(talkDelay(1, 2, () => 0)).toBe(5000);
  });
  it('首轮只随机间隔，显示后加 3.2 秒，跳过后只重排正常间隔，关闭清除计时器', () => {
    let callback = () => {}, blocked = true;
    const clock = { set: vi.fn((fn: () => void, _delay: number) => { callback = fn; return 'timer'; }), clear: vi.fn() };
    const show = vi.fn(), sound = vi.fn(); const config = structuredClone(DEFAULT_CONFIG.selfTalk);
    const talk = new SelfTalk({ config: () => config, clock, blocked: () => blocked, show, sound, random: () => 0 });
    talk.restart(); expect(clock.set).toHaveBeenLastCalledWith(expect.any(Function), 20000);
    callback(); expect(show).not.toHaveBeenCalled(); expect(clock.set).toHaveBeenLastCalledWith(expect.any(Function), 20000);
    blocked = false; callback(); expect(show).toHaveBeenLastCalledWith('呀哈！', 3200); expect(sound).toHaveBeenCalledTimes(1);
    expect(clock.set).toHaveBeenLastCalledWith(expect.any(Function), 23200);
    callback(); expect(show).toHaveBeenLastCalledWith('乌拉！', 3200);
    config.enabled = false; talk.restart(); expect(clock.clear).toHaveBeenCalledWith('timer');
    expect(clock.set).toHaveBeenCalledTimes(4);
  });
  it('30% 以外不播音', () => {
    let callback = () => {};
    const sound = vi.fn();
    const talk = new SelfTalk({ config: () => DEFAULT_CONFIG.selfTalk, blocked: () => false, show: vi.fn(), sound,
      random: () => 0.3, clock: { set: fn => { callback = fn; return 1; }, clear: vi.fn() } });
    talk.restart(); callback(); expect(sound).not.toHaveBeenCalled(); talk.stop();
  });
});
describe('聊天显示与菜单', () => {
  it('打字机按 16ms 帧规则取字，预览不切坏 Unicode', () => {
    expect([0, 1, 40, 41, 400, 1000].map(typewriterCount)).toEqual([1, 1, 1, 2, 10, 10]);
    expect(preview('😆ab', 2)).toBe('😆a…'); expect(preview('ab', 2)).toBe('ab');
  });
  it('情绪映射与勾选来自同一个配置快照', () => {
    expect(['happy', 'surprised', 'angry', 'sad', 'neutral'].map(e => emotionExpression(e as Parameters<typeof emotionExpression>[0])))
      .toEqual(['happy', 'surprised', 'angry', 'sad', null]);
    const config = normalizeConfig({ selfTalk: { enabled: false }, alwaysOnTop: false, mousePassthrough: true, size: 'small' });
    expect(menuState(config, false)).toEqual({ selfTalk: false, alwaysOnTop: false, mousePassthrough: true, size: 'small', visibility: '显示桌宠' });
  });
});
