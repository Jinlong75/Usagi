import { ChatError, emptyReplyError, httpError, networkError } from './errors';
import { SSEParser } from './sse';
import type { ChatMessage, ChatSettings, StreamEvent } from './types';

export interface StreamOptions extends ChatSettings {
  apiKey: string;
  messages: ChatMessage[];
  timeoutMs?: number;
}
export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export function chatEndpoint(baseUrl = DEFAULT_BASE_URL): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}
export function modelsEndpoint(baseUrl = DEFAULT_BASE_URL): string {
  return chatEndpoint(baseUrl).replace(/\/chat\/completions$/, '/models');
}

// Race reads as well as fetch: even a stalled/incorrect transport must settle on abort.
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function requestScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(new ChatError('aborted', '请求已停止。'));
  if (external?.aborted) abort();
  else external?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new ChatError('timeout', 'DeepSeek 回复超时了，稍后再试。')), timeoutMs);
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); external?.removeEventListener('abort', abort); } };
}

export class DeepSeekClient {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async *streamChat(opts: StreamOptions, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    const scope = requestScope(signal, opts.timeoutMs ?? 60000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      scope.signal.throwIfAborted();
      const url = chatEndpoint(opts.baseUrl);
      const thinking = opts.thinking ?? 'disabled';
      const hostname = new URL(url).hostname;
      const body: Record<string, unknown> = {
        model: opts.model ?? 'deepseek-flash', messages: opts.messages, stream: true,
        temperature: opts.temperature ?? 0.7, max_tokens: opts.maxTokens ?? 2048,
      };
      // TODO(lead): auto 未指定 type；按参考 C1 在官方域名启用思考，008 可确认产品语义。
      if (thinking === 'enabled' || (thinking === 'auto' && (hostname === 'deepseek.com' || hostname.endsWith('.deepseek.com')))) {
        body.thinking = { type: 'enabled' };
      } else if (thinking === 'disabled') body.thinking = { type: 'disabled' };
      const response = await abortable(this.fetcher(url, {
        method: 'POST', headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body), signal: scope.signal,
      }), scope.signal);
      if (!response.ok) throw httpError(response.status, await abortable(response.text(), scope.signal), opts.apiKey);
      if (!response.body) throw emptyReplyError(false, null, opts.maxTokens ?? 2048);
      reader = response.body.getReader();
      const parser = new SSEParser();
      let content = '', reasoning = false;
      let finishReason: string | null = null;
      while (!parser.done) {
        const chunk = await abortable(reader.read(), scope.signal);
        scope.signal.throwIfAborted();
        if (chunk.done) break;
        for (const event of parser.push(chunk.value)) {
          if (event.type === 'done') { finishReason = event.finishReason; continue; }
          if (event.type === 'content') content += event.text;
          else reasoning ||= !!event.text.trim();
          yield event;
          scope.signal.throwIfAborted();
        }
      }
      finishReason ??= parser.finishReason;
      if (!content.trim()) throw emptyReplyError(reasoning, finishReason, opts.maxTokens ?? 2048);
      if (!parser.done && !finishReason) throw new ChatError('stream_incomplete', '回复连接中断了，请稍后重试。');
      yield { type: 'done', finishReason };
    } catch (error) {
      throw scope.signal.aborted ? scope.signal.reason : networkError(error, opts.apiKey);
    } finally {
      scope.cleanup();
      if (reader) {
        try { await reader.cancel(); } catch { /* Abort may already have errored the stream. */ }
        reader.releaseLock();
      }
    }
  }

  async listModels(baseUrl: string | undefined, apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const scope = requestScope(signal, 60000);
    try {
      scope.signal.throwIfAborted();
      const response = await abortable(this.fetcher(modelsEndpoint(baseUrl), {
        method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: scope.signal,
      }), scope.signal);
      if (!response.ok) throw httpError(response.status, await abortable(response.text(), scope.signal), apiKey);
      const data = await abortable(response.json(), scope.signal);
      if (!Array.isArray(data?.data)) throw new ChatError('invalid_response', '模型列表格式不正确，请检查服务地址。');
      return data.data.filter((model: unknown): model is { id: string } => !!model && typeof model === 'object' && 'id' in model && typeof model.id === 'string').map((model: { id: string }) => model.id);
    } catch (error) {
      throw scope.signal.aborted ? scope.signal.reason : networkError(error, apiKey);
    } finally { scope.cleanup(); }
  }
}

const defaultClient = new DeepSeekClient();
export const streamChat = (opts: StreamOptions, signal?: AbortSignal) => defaultClient.streamChat(opts, signal);
export const listModels = (baseUrl: string | undefined, apiKey: string, signal?: AbortSignal) => defaultClient.listModels(baseUrl, apiKey, signal);
