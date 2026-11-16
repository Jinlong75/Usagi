import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekClient, chatEndpoint, modelsEndpoint } from '../../src/main/chat/client';
import type { StreamOptions } from '../../src/main/chat/client';
import type { StreamEvent } from '../../src/main/chat/types';

const opts: StreamOptions = { apiKey: 'test-secret', messages: [{ role: 'user', content: '你好' }] };
const frame = (delta: object = {}, finish_reason: string | null = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;
function response(text = frame({ content: '你好' }, 'stop') + 'data: [DONE]\n\n', cancel = vi.fn()) {
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); }, cancel }));
}
async function collect(iterable: AsyncIterable<StreamEvent>) {
  const result: StreamEvent[] = [];
  for await (const event of iterable) result.push(event);
  return result;
}
afterEach(() => { vi.useRealTimers(); });

describe('DeepSeekClient', () => {
  it.each([
    [undefined, 'https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/models'],
    ['https://example.test/v1///', 'https://example.test/v1/chat/completions', 'https://example.test/v1/models'],
    ['https://example.test/v1/chat/completions/', 'https://example.test/v1/chat/completions', 'https://example.test/v1/models'],
  ])('normalizes base URL %s', async (baseUrl, chat, models) => {
    expect(chatEndpoint(baseUrl)).toBe(chat);
    expect(modelsEndpoint(baseUrl)).toBe(models);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(Response.json({ data: [{ id: 'a' }, {}, { id: 'b' }, null] }));
    const client = new DeepSeekClient(fetcher);
    expect(await collect(client.streamChat({ ...opts, baseUrl }))).toEqual([{ type: 'content', text: '你好' }, { type: 'done', finishReason: 'stop' }]);
    expect(await client.listModels(baseUrl, opts.apiKey)).toEqual(['a', 'b']);
    expect(fetcher.mock.calls[0]?.[0]).toBe(chat);
    expect(fetcher.mock.calls[1]?.[0]).toBe(models);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'GET', headers: { Authorization: `Bearer ${opts.apiKey}` } });
  });
  it('sends exact defaults, required headers, and explicit generation settings', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const client = new DeepSeekClient(fetcher);
    await collect(client.streamChat(opts));
    const init = fetcher.mock.calls[0]![1]!;
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' } });
    expect(JSON.parse(init.body as string)).toEqual({ model: 'deepseek-flash', messages: opts.messages, stream: true, temperature: 0.7, max_tokens: 2048, thinking: { type: 'disabled' } });
    await collect(client.streamChat({ ...opts, model: 'deepseek-v4-pro', temperature: 0, maxTokens: 4000 }));
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toMatchObject({ model: 'deepseek-v4-pro', temperature: 0, max_tokens: 4000 });
  });
  it.each([
    ['enabled', 'https://third.test', 'enabled'], ['disabled', 'https://api.deepseek.com', 'disabled'],
    ['auto', 'https://api.deepseek.com/v1', 'enabled'], ['auto', 'https://deepseek.com', 'enabled'],
    ['auto', 'https://deepseek.com.evil.test', undefined], ['auto', 'https://fake-deepseek.com', undefined], ['auto', 'https://third.test', undefined],
  ] as const)('handles thinking %s for %s', async (thinking, baseUrl, expected) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    await collect(new DeepSeekClient(fetcher).streamChat({ ...opts, thinking, baseUrl }));
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body.thinking).toEqual(expected ? { type: expected } : undefined);
  });
  it('streams reasoning separately and permits finish_reason followed by EOF', async () => {
    const text = frame({ reasoning_content: '思考' }) + frame({ content: '正文' }, 'length');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(text));
    expect(await collect(new DeepSeekClient(fetcher).streamChat(opts))).toEqual([
      { type: 'reasoning', text: '思考' }, { type: 'content', text: '正文' }, { type: 'done', finishReason: 'length' },
    ]);
  });
  it.each([
    ['', 'empty_reply'], [frame({ reasoning_content: '思考' }, 'length') + 'data: [DONE]\n\n', 'reasoning_limit'],
    [frame({ content: '半截' }), 'stream_incomplete'],
  ])('rejects empty or truncated output (%s)', async (text, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(text));
    await expect(collect(new DeepSeekClient(fetcher).streamChat(opts))).rejects.toMatchObject({ code });
  });
  it('cancels and releases the reader on consumer return', async () => {
    const cancel = vi.fn();
    const res = response(undefined, cancel);
    const client = new DeepSeekClient(vi.fn<typeof fetch>().mockResolvedValue(res));
    const iterator = client.streamChat(opts);
    expect(await iterator.next()).toMatchObject({ value: { type: 'content' } });
    await iterator.return(undefined);
    expect(cancel).toHaveBeenCalledOnce();
    expect(res.body?.locked).toBe(false);
  });
  it('aborts a pending read and performs reader cleanup', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const res = new Response(new ReadableStream({ cancel }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(res);
    const iterator = new DeepSeekClient(fetcher).streamChat(opts, controller.signal);
    const next = iterator.next();
    const rejection = expect(next).rejects.toMatchObject({ code: 'aborted' });
    await vi.waitFor(() => expect(res.body?.locked).toBe(true));
    controller.abort();
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
    expect(res.body?.locked).toBe(false);
    expect(fetcher.mock.calls[0]![1]!.signal?.aborted).toBe(true);
  });
  it('does not fetch for an already aborted signal', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(collect(new DeepSeekClient(fetcher).streamChat(opts, AbortSignal.abort()))).rejects.toMatchObject({ code: 'aborted' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('times out a stalled fetch and a stalled body read using abort', async () => {
    vi.useFakeTimers();
    for (const res of [undefined, new Response(new ReadableStream())]) {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(() => res ? Promise.resolve(res) : new Promise(() => {}));
      const work = collect(new DeepSeekClient(fetcher).streamChat({ ...opts, timeoutMs: 25 }));
      const rejection = expect(work).rejects.toMatchObject({ code: 'timeout', message: 'DeepSeek 回复超时了，稍后再试。' });
      await vi.advanceTimersByTimeAsync(25);
      await rejection;
      expect(fetcher.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
  it('maps HTTP/network errors for chat and connection test, redacting the Key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ error: { message: `denied ${opts.apiKey}` } }), { status: 401 }));
    const client = new DeepSeekClient(fetcher);
    await expect(collect(client.streamChat(opts))).rejects.toMatchObject({ code: 'auth', detail: 'denied [REDACTED]' });
    await expect(client.listModels(undefined, opts.apiKey)).rejects.toMatchObject({ code: 'auth' });
    fetcher.mockRejectedValue(new TypeError('fetch failed', { cause: new Error('TLS certificate blocked') }));
    await expect(collect(client.streamChat(opts))).rejects.toMatchObject({ code: 'network', message: expect.stringContaining('看起来是证书被拦截') });
    fetcher.mockResolvedValue(Response.json({ wrong: [] }));
    await expect(client.listModels(undefined, opts.apiKey)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
