import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekClient } from '../../src/main/chat/client';
import { ChatError } from '../../src/main/chat/errors';
import { ChatService } from '../../src/main/chat/service';
import type { ChatClient, ChatEvent } from '../../src/main/chat/service';
import { SessionStore } from '../../src/main/chat/sessionStore';
import type { StreamEvent } from '../../src/main/chat/types';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'usagi-chat-service-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const now = () => new Date(2026, 10, 16, 9, 5);
function setup(customClient?: ChatClient) {
  const client = customClient ?? {
    streamChat: vi.fn(async function* () {
      yield { type: 'reasoning', text: '思考过程不显示也不保存' } as StreamEvent;
      for (const text of ['[', '开', '心]', '呀哈！', '乌拉！']) yield { type: 'content', text } as StreamEvent;
      yield { type: 'done', finishReason: 'stop' } as StreamEvent;
    }),
    listModels: vi.fn(async () => ['deepseek-flash']),
  };
  const store = new SessionStore(directory, now);
  const keyStore = { load: vi.fn(async () => ({ apiKey: 'unit-secret', needsReentry: false })) };
  const getSettings = vi.fn(() => ({ model: 'deepseek-flash', persona: '自定义人设' }));
  const events: ChatEvent[] = [];
  const service = new ChatService({ client, store, keyStore, getSettings, now, onEvent: event => events.push(event) });
  return { service, events, store, keyStore, client, getSettings };
}
async function terminal(events: ChatEvent[]) {
  await vi.waitFor(() => expect(events.some(event => ['done', 'error', 'stopped'].includes(event.type))).toBe(true));
}

describe('ChatService', () => {
  it('persists user before calling the client, filters emotion, emits ordered events and persists only the final assistant', async () => {
    const context = setup();
    await context.store.append({ id: 'old', role: 'assistant', content: '上一条', createdAt: new Date(now().getTime() - 20 * 60000).toISOString() });
    const original = vi.mocked(context.client.streamChat).getMockImplementation()!;
    const spy = vi.spyOn(context.client, 'streamChat').mockImplementation(async function* (opts, signal) {
      expect((await context.store.load()).messages.map(msg => msg.content)).toEqual(['上一条', '你好']);
      expect(opts.messages.map(msg => msg.content)).toEqual([
        '自定义人设\n\n【时间信息】当前时间：2026-11-16 周一 09:05。距离上一条消息已经过去约 20 分钟。用户消息开头的 [日期 时间] 是系统附加的，不要复述或模仿。',
        '上一条', '[2026-11-16 周一 09:05] 你好',
      ]);
      yield* original(opts, signal);
    });
    const requestId = context.service.send('  你好  ');
    expect(typeof requestId).toBe('string');
    expect(context.events).toEqual([]);
    await terminal(context.events);
    expect(context.events).toEqual([
      { type: 'status', status: 'thinking', requestId },
      { type: 'delta', text: '呀哈！', requestId }, { type: 'delta', text: '乌拉！', requestId },
      { type: 'done', text: '呀哈！乌拉！', emotion: 'happy', requestId },
    ]);
    expect(spy).toHaveBeenCalledOnce();
    const saved = await new SessionStore(directory).load();
    expect(saved.messages.at(-1)).toMatchObject({ role: 'assistant', content: '呀哈！乌拉！', emotion: 'happy', createdAt: now().toISOString() });
    expect(saved.messages).toHaveLength(3);
  });
  it('rejects busy immediately without queuing or persisting a second user', async () => {
    const { service, events, store, client } = setup();
    service.send('first');
    expect(() => service.send('second')).toThrow(expect.objectContaining({ code: 'busy' }));
    await terminal(events);
    expect(client.streamChat).toHaveBeenCalledOnce();
    expect((await store.load()).messages.map(msg => msg.content)).toEqual(['first', '呀哈！乌拉！']);
    const id = service.send('third');
    await vi.waitFor(() => expect(events.some(event => event.requestId === id && event.type === 'done')).toBe(true));
  });
  it('stops mid-stream, aborts and closes the iterator without persisting a partial assistant', async () => {
    let closed = false;
    let streamSignal: AbortSignal | undefined;
    const client: ChatClient = {
      listModels: vi.fn(),
      async *streamChat(_opts, signal) {
        streamSignal = signal;
        try {
          yield { type: 'content', text: '[难过]半截回复' };
          await new Promise<void>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        } finally { closed = true; }
      },
    };
    const { service, events, store } = setup(client);
    const requestId = service.send('问题');
    await vi.waitFor(() => expect(events.some(event => event.type === 'delta')).toBe(true));
    expect(service.stop()).toBe(true);
    expect(service.stop()).toBe(false);
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(streamSignal?.aborted).toBe(true);
    expect(events).toEqual([
      { type: 'status', status: 'thinking', requestId }, { type: 'delta', text: '半截回复', requestId }, { type: 'stopped', requestId },
    ]);
    expect((await store.load()).messages.map(msg => msg.role)).toEqual(['user']);
    expect(service.stop()).toBe(false);
  });
  it('can stop immediately before Key lookup, without starting persistence or transport', async () => {
    const { service, events, client, keyStore, store } = setup();
    const requestId = service.send('question');
    expect(service.stop()).toBe(true);
    await Promise.resolve();
    expect(events).toEqual([{ type: 'stopped', requestId }]);
    expect(keyStore.load).not.toHaveBeenCalled();
    expect(client.streamChat).not.toHaveBeenCalled();
    expect((await store.load()).messages).toEqual([]);
  });
  it('suppresses done and assistant save when stopped synchronously from a delta callback', async () => {
    const { service, events, store } = setup();
    service.onEvent(event => { if (event.type === 'delta') service.stop(); });
    service.send('question');
    await terminal(events);
    expect(events.at(-1)?.type).toBe('stopped');
    expect(events.filter(event => event.type === 'done' || event.type === 'error')).toEqual([]);
    expect((await store.load()).messages.map(msg => msg.role)).toEqual(['user']);
  });
  it('returns no_key with exact message and no user persistence', async () => {
    const { service, events, keyStore, client, store } = setup();
    keyStore.load.mockResolvedValue({ apiKey: '', needsReentry: true });
    const requestId = service.send('question');
    await terminal(events);
    expect(events).toEqual([{ type: 'error', requestId, code: 'no_key', message: '还没有填写 DeepSeek API Key，在设置里填好就能聊天啦。' }]);
    expect(client.streamChat).not.toHaveBeenCalled();
    expect((await store.load()).messages).toEqual([]);
    expect(await service.testConnection()).toEqual({ ok: false, message: '请先填写 API Key。' });
    expect(client.listModels).not.toHaveBeenCalled();
  });
  it('reports EACCES on session load as a storage error without starting transport', async () => {
    const { service, events, store, client } = setup();
    vi.spyOn(store, 'load').mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
    const append = vi.spyOn(store, 'append');
    const requestId = service.send('question');
    await terminal(events);
    expect(events).toEqual([
      { type: 'status', status: 'thinking', requestId },
      { type: 'error', requestId, code: 'storage', message: '聊天记录读写失败：EACCES。请检查磁盘空间和文件权限。' },
    ]);
    expect(append).not.toHaveBeenCalled();
    expect(client.streamChat).not.toHaveBeenCalled();
  });
  it('reports ENOSPC on user append as a storage error without starting transport', async () => {
    const { service, events, store, client } = setup();
    const append = vi.spyOn(store, 'append').mockRejectedValueOnce(Object.assign(new Error('no space left'), { code: 'ENOSPC' }));
    const requestId = service.send('question');
    await terminal(events);
    expect(events).toEqual([
      { type: 'status', status: 'thinking', requestId },
      { type: 'error', requestId, code: 'storage', message: '聊天记录读写失败：ENOSPC。请检查磁盘空间和文件权限。' },
    ]);
    expect(append).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }));
    expect(client.streamChat).not.toHaveBeenCalled();
    expect((await store.load()).messages).toEqual([]);
  });
  it('reports ENOSPC on assistant append as a storage error and never emits done', async () => {
    const { service, events, store, client } = setup();
    const persist = store.append.bind(store);
    const append = vi.spyOn(store, 'append').mockImplementationOnce(persist)
      .mockRejectedValueOnce(Object.assign(new Error('no space left'), { code: 'ENOSPC' }));
    const requestId = service.send('question');
    await terminal(events);
    expect(events).toEqual([
      { type: 'status', status: 'thinking', requestId },
      { type: 'delta', text: '呀哈！', requestId }, { type: 'delta', text: '乌拉！', requestId },
      { type: 'error', requestId, code: 'storage', message: '聊天记录读写失败：ENOSPC。请检查磁盘空间和文件权限。' },
    ]);
    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'assistant' }));
    expect(client.streamChat).toHaveBeenCalledOnce();
    expect((await store.load()).messages.map(msg => msg.role)).toEqual(['user']);
  });
  it('uses only the first 80 message characters when a storage error has no code', async () => {
    const { service, events, store, client } = setup();
    const reason = '磁盘写入失败'.repeat(20);
    vi.spyOn(store, 'load').mockRejectedValueOnce(new Error(reason));
    service.send('question');
    await terminal(events);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'storage', message: `聊天记录读写失败：${reason.slice(0, 80)}。请检查磁盘空间和文件权限。` });
    expect(client.streamChat).not.toHaveBeenCalled();
  });
  it.each(['throw', 'eof', 'empty', 'reasoning'] as const)('does not persist an assistant on %s', async failure => {
    const client: ChatClient = {
      listModels: vi.fn(),
      async *streamChat() {
        if (failure === 'throw' || failure === 'eof') yield { type: 'content', text: '[平静]半截' };
        if (failure === 'throw') throw new ChatError('server', 'DeepSeek 服务暂时出问题了，稍后再试。');
        if (failure === 'reasoning') yield { type: 'reasoning', text: '思考' };
        if (failure !== 'eof') yield { type: 'done', finishReason: failure === 'reasoning' ? 'length' : 'stop' };
      },
    };
    const { service, events, store } = setup(client);
    service.send('question');
    await terminal(events);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: { throw: 'server', eof: 'stream_incomplete', empty: 'empty_reply', reasoning: 'reasoning_limit' }[failure] });
    expect(events.some(event => event.type === 'done')).toBe(false);
    expect((await store.load()).messages.map(msg => msg.role)).toEqual(['user']);
  });
  it('supports event unsubscribe and isolates callback failures', async () => {
    const { service, events } = setup();
    const removed = vi.fn();
    const off = service.onEvent(removed);
    off();
    service.onEvent(() => { throw new Error('UI callback failed'); });
    service.send('question');
    await terminal(events);
    expect(events.at(-1)?.type).toBe('done');
    expect(removed).not.toHaveBeenCalled();
  });
  it('tests connection with current settings and handles errors', async () => {
    const { service, client, getSettings } = setup();
    expect(await service.testConnection()).toEqual({ ok: true, models: ['deepseek-flash'] });
    expect(getSettings).toHaveBeenCalledOnce();
    expect(client.listModels).toHaveBeenCalledWith(undefined, 'unit-secret');
    vi.mocked(client.listModels).mockRejectedValueOnce(new ChatError('auth', 'API Key 无效或没有权限，请在设置里检查 Key。'));
    expect(await service.testConnection()).toEqual({ ok: false, message: 'API Key 无效或没有权限，请在设置里检查 Key。' });
  });
  it('integrates the real SSE client with mocked fetch and actual atomic session persistence', async () => {
    const frames = ['[', '开', '心]', '呀哈！'].map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join('')
      + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(frames));
    const { service, events, store } = setup(new DeepSeekClient(fetcher));
    service.send('你好');
    await terminal(events);
    expect(events.at(-1)).toMatchObject({ type: 'done', text: '呀哈！', emotion: 'happy' });
    expect((await store.load()).messages.map(msg => msg.content)).toEqual(['你好', '呀哈！']);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
