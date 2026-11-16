import { describe, expect, it } from 'vitest';
import { ChatError, emptyReplyError, httpError, networkError, safeDetail } from '../../src/main/chat/errors';
import { EmotionStreamFilter, parseEmotion } from '../../src/main/chat/emotion';
import { DEFAULT_PERSONA } from '../../src/main/chat/persona';
import { buildMessages, formatTime } from '../../src/main/chat/prompt';
import type { Message } from '../../src/main/chat/types';

describe('human-readable errors', () => {
  it.each([
    [401, 'auth', 'API Key 无效或没有权限，请在设置里检查 Key。'],
    [403, 'auth', 'API Key 无效或没有权限，请在设置里检查 Key。'],
    [402, 'insufficient_balance', 'DeepSeek 账户余额不足，请到 platform.deepseek.com 充值后再试。'],
    [429, 'rate_limit', '请求太频繁了，稍等一会儿再试。'],
    [500, 'server', 'DeepSeek 服务暂时出问题了，稍后再试。'],
    [503, 'server', 'DeepSeek 服务暂时出问题了，稍后再试。'],
    [599, 'server', 'DeepSeek 服务暂时出问题了，稍后再试。'],
    [400, 'http_error', '请求失败：400 wrong model'],
  ])('maps HTTP %s', (status, code, message) => {
    expect(httpError(status, '{"error":{"message":"wrong model"}}')).toMatchObject({ code, message, detail: 'wrong model' });
  });
  it('redacts secrets before truncating server details or composing messages', () => {
    const secret = 'test-private-key';
    const error = httpError(404, `Bearer ${secret} sk-othersecret ${secret} ${'文'.repeat(400)}`, secret);
    expect(error.detail.length).toBe(300);
    expect(error.message).not.toContain(secret);
    expect(error.detail).not.toContain('sk-othersecret');
    expect(safeDetail('a\n  b')).toBe('a b');
  });
  it('keeps network cause and appends the certificate guidance for all keywords', () => {
    expect(networkError(new Error('offline')).message).toBe('连不上 DeepSeek：offline。如果开着代理或 VPN，试试关掉或换线路。');
    for (const reason of ['cert', 'certificate', 'SSL', 'TLS']) {
      expect(networkError(new TypeError('fetch failed', { cause: new Error(reason) })).message).toBe(`连不上 DeepSeek：fetch failed: ${reason}。如果开着代理或 VPN，试试关掉或换线路。（看起来是证书被拦截，常见于开着代理软件。）`);
    }
    const error = new ChatError('timeout', 'DeepSeek 回复超时了，稍后再试。');
    expect(networkError(error)).toBe(error);
  });
  it('distinguishes reasoning exhaustion from other empty replies', () => {
    expect(emptyReplyError(true, 'length', 4096).message).toBe('深度思考用完了最大输出长度（当前 4096），请在设置里调大或关掉深度思考。');
    for (const [reasoning, reason] of [[true, 'stop'], [false, 'length'], [false, null]] as const) {
      expect(emptyReplyError(reasoning, reason, 2048).message).toBe('模型没有返回任何内容，请稍后重试或检查模型设置。');
    }
  });
});

describe('prompt construction', () => {
  // Numeric constructor fixes local wall time independently of the host timezone.
  const now = new Date(2026, 10, 16, 9, 5);
  const msg = (id: string, content: string, role: Message['role'] = 'user'): Message => ({ id, role, content, createdAt: new Date(2026, 10, 15, 21, 8).toISOString() });
  it('uses the exact default persona, local time, timestamps only users, and trims this user', () => {
    const history = [msg('1', '原文'), msg('2', '回复', 'assistant')];
    const snapshot = structuredClone(history);
    const result = buildMessages({ history, userText: '  你好 \n', now });
    expect(result).toEqual([
      { role: 'system', content: `${DEFAULT_PERSONA}\n\n【时间信息】当前时间：2026-11-16 周一 09:05。用户消息开头的 [日期 时间] 是系统附加的，不要复述或模仿。` },
      { role: 'user', content: '[2026-11-15 周日 21:08] 原文' }, { role: 'assistant', content: '回复' },
      { role: 'user', content: '[2026-11-16 周一 09:05] 你好' },
    ]);
    expect(history).toEqual(snapshot);
    expect(buildMessages({ history: [], userText: '', now, persona: '自定义' })[0]?.content).toMatch(/^自定义\n\n/);
  });
  it.each([[9, ''], [10, '10 分钟'], [59, '59 分钟'], [60, '1 小时'], [1439, '23 小时'], [1440, '1 天'], [2881, '2 天']])('formats interval %s minutes', (minutes, gap) => {
    const lastMessageAt = new Date(now.getTime() - minutes * 60000);
    const system = buildMessages({ history: [], userText: 'hi', now, lastMessageAt })[0]!.content;
    if (gap) expect(system).toContain(`距离上一条消息已经过去约 ${gap}。`);
    else expect(system).not.toContain('距离上一条');
  });
  it('formats local wall time at morning, afternoon, midnight and week boundaries', () => {
    expect(formatTime(new Date(2026, 0, 4, 0, 0))).toBe('2026-01-04 周日 00:00');
    expect(formatTime(new Date(2026, 0, 5, 15, 30))).toBe('2026-01-05 周一 15:30');
    expect(formatTime(new Date(2026, 0, 10, 23, 59))).toBe('2026-01-10 周六 23:59');
  });
  it('trims by message count preserving chronological order', () => {
    const history = Array.from({ length: 43 }, (_, i) => msg(String(i), String(i), 'assistant'));
    const result = buildMessages({ history, userText: 'latest', now });
    expect(result).toHaveLength(42);
    expect(result[1]?.content).toBe('3');
    expect(result.at(-2)?.content).toBe('42');
    expect(buildMessages({ history, userText: 'new', historyLimit: 2, now }).slice(1, -1).map(m => m.content)).toEqual(['41', '42']);
  });
  it('keeps exact character boundary, drops the whole over-limit older item, and excludes current/system', () => {
    const result = buildMessages({ history: [msg('1', 'older', 'assistant'), msg('2', 'ab', 'assistant'), msg('3', 'cde', 'assistant')], userText: 'x'.repeat(20), historyCharLimit: 5, now });
    expect(result.slice(1, -1).map(m => m.content)).toEqual(['ab', 'cde']);
    expect(buildMessages({ history: [msg('1', 'abc', 'assistant'), msg('2', 'de', 'assistant')], userText: '', historyCharLimit: 4, now }).slice(1, -1)).toEqual([{ role: 'assistant', content: 'de' }]);
  });
  it('falls back to the newest tail and supports zero history budgets', () => {
    const history = [msg('1', 'older', 'assistant'), msg('2', 'abcdef', 'assistant')];
    expect(buildMessages({ history, userText: '', historyCharLimit: 3, now }).slice(1, -1)).toEqual([{ role: 'assistant', content: 'def' }]);
    expect(buildMessages({ history, userText: '', historyCharLimit: 0, now })).toHaveLength(2);
    expect(buildMessages({ history, userText: '', historyLimit: 0, now })).toHaveLength(2);
  });
});

describe('emotion parsing and streaming', () => {
  it.each([['开心', 'happy'], ['惊讶', 'surprised'], ['生气', 'angry'], ['难过', 'sad'], ['平静', 'neutral']])('recognizes %s in both bracket styles', (tag, emotion) => {
    expect(parseEmotion(` \n[${tag}]呀哈！`)).toEqual({ emotion, text: '呀哈！' });
    expect(parseEmotion(`【${tag}】乌拉！`)).toEqual({ emotion, text: '乌拉！' });
  });
  it('preserves untagged/unknown tags and matches only at the beginning', () => {
    for (const text of [' 普通正文', '[未知]正文', '呀哈[开心]', '[开心】正文']) expect(parseEmotion(text)).toEqual({ emotion: 'neutral', text });
  });
  it('buffers [, 开, 心] separately then streams untouched body', () => {
    const filter = new EmotionStreamFilter();
    expect(filter.push('[')).toBe('');
    expect(filter.push('开')).toBe('');
    expect(filter.push('心]')).toBe('');
    expect(filter.emotion).toBe('happy');
    expect(filter.push('呀哈[难过]')).toBe('呀哈[难过]');
    expect(filter.finish()).toBe('');
  });
  it('handles every tag split, leading whitespace, unknown/incomplete tags and bounded buffering', () => {
    const text = ' \n【惊讶】哈？';
    for (let i = 0; i <= text.length; i++) {
      const filter = new EmotionStreamFilter();
      expect(filter.push(text.slice(0, i)) + filter.push(text.slice(i)) + filter.finish()).toBe('哈？');
      expect(filter.emotion).toBe('surprised');
    }
    for (const text of ['[未知]哈', '[开', '普通文本', '        [开心]哈', '']) {
      const filter = new EmotionStreamFilter();
      expect([...text].map(c => filter.push(c)).join('') + filter.finish()).toBe(text);
    }
    const bounded = new EmotionStreamFilter();
    expect(bounded.push('       ')).toBe('');
    expect(bounded.push(' ')).toBe('        ');
  });
});
