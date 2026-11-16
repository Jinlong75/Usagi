import { randomUUID } from 'node:crypto';
import type { StreamOptions } from './client';
import { EmotionStreamFilter } from './emotion';
import { ChatError, emptyReplyError, networkError } from './errors';
import type { KeyResult } from './keyStore';
import { buildMessages } from './prompt';
import type { ChatSettings, Emotion, Message, Session, StreamEvent } from './types';

export type ChatEvent = { requestId: string } & (
  | { type: 'status'; status: 'thinking' }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; emotion: Emotion }
  | { type: 'error'; code: string; message: string }
  | { type: 'stopped' }
);
export interface ChatClient {
  streamChat(opts: StreamOptions, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  listModels(baseUrl: string | undefined, apiKey: string): Promise<string[]>;
}
export interface ChatServiceOptions {
  client: ChatClient;
  store: { load(): Promise<Session>; append(msg: Message): Promise<void> };
  keyStore: { load(): Promise<KeyResult> };
  getSettings(): ChatSettings;
  now?: () => Date;
  onEvent?: (event: ChatEvent) => void;
}
interface ActiveRequest {
  id: string;
  controller: AbortController;
  stopped: boolean;
  committing: boolean;
}

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const cause = error as { code?: unknown; message?: unknown } | null;
    const reason = typeof cause?.code === 'string' && cause.code
      ? cause.code
      : (typeof cause?.message === 'string' ? cause.message : String(error)).slice(0, 80);
    throw new ChatError('storage', `聊天记录读写失败：${reason}。请检查磁盘空间和文件权限。`);
  }
}

async function* streamWithErrors(client: ChatClient, opts: StreamOptions, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  try { yield* client.streamChat(opts, signal); }
  catch (error) { throw networkError(error, opts.apiKey); }
}

export class ChatService {
  private active?: ActiveRequest;
  private readonly listeners = new Set<(event: ChatEvent) => void>();
  private readonly now: () => Date;
  constructor(private readonly options: ChatServiceOptions) {
    this.now = options.now ?? (() => new Date());
    if (options.onEvent) this.listeners.add(options.onEvent);
  }
  onEvent(listener: (event: ChatEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private emit(event: ChatEvent): void {
    // A consumer's callback must not change persistence or request lifecycle.
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Consumers own their callback failures. */ }
    }
  }
  send(userText: string): string {
    if (this.active) throw new ChatError('busy', '正在回复上一条消息，请稍等或先停止。');
    const request: ActiveRequest = { id: randomUUID(), controller: new AbortController(), stopped: false, committing: false };
    this.active = request;
    // Return the id before the first callback, including the no-Key path.
    queueMicrotask(() => { void this.run(request, userText.trim()); });
    return request.id;
  }
  stop(): boolean {
    const request = this.active;
    // Once the full answer has entered its atomic commit it is already complete.
    if (!request || request.stopped || request.committing) return false;
    request.stopped = true;
    request.controller.abort();
    this.emit({ type: 'stopped', requestId: request.id });
    return true;
  }
  private async run(request: ActiveRequest, userText: string): Promise<void> {
    const { client, store, keyStore, getSettings } = this.options;
    let apiKey = '';
    try {
      if (request.stopped) return;
      apiKey = (await keyStore.load()).apiKey;
      if (request.stopped) return;
      if (!apiKey) throw new ChatError('no_key', '还没有填写 DeepSeek API Key，在设置里填好就能聊天啦。');
      this.emit({ type: 'status', status: 'thinking', requestId: request.id });
      if (request.stopped) return;
      const settings = getSettings();
      const history = (await storageOperation(() => store.load())).messages;
      if (request.stopped) return;
      const now = this.now();
      const messages = buildMessages({ ...settings, history, userText, now, lastMessageAt: history.at(-1)?.createdAt });
      await storageOperation(() => store.append({ id: randomUUID(), role: 'user', content: userText, createdAt: now.toISOString() }));
      if (request.stopped) return;
      const filter = new EmotionStreamFilter();
      let text = '', reasoning = false, complete = false;
      let finishReason: string | null = null;
      const delta = (chunk: string) => {
        if (!chunk) return;
        text += chunk;
        this.emit({ type: 'delta', requestId: request.id, text: chunk });
      };
      for await (const event of streamWithErrors(client, { ...settings, apiKey, messages }, request.controller.signal)) {
        if (request.stopped) return;
        if (event.type === 'content') delta(filter.push(event.text));
        else if (event.type === 'reasoning') reasoning ||= !!event.text.trim();
        else { complete = true; finishReason = event.finishReason; break; }
      }
      if (request.stopped) return;
      delta(filter.finish());
      if (request.stopped) return;
      if (!text.trim()) throw emptyReplyError(reasoning, finishReason, settings.maxTokens ?? 2048);
      if (!complete) throw new ChatError('stream_incomplete', '回复连接中断了，请稍后重试。');
      request.committing = true;
      await storageOperation(() => store.append({ id: randomUUID(), role: 'assistant', content: text, createdAt: this.now().toISOString(), emotion: filter.emotion }));
      if (this.active === request) this.active = undefined;
      this.emit({ type: 'done', requestId: request.id, text, emotion: filter.emotion });
    } catch (error) {
      if (!request.stopped) {
        const chatError = error instanceof ChatError ? error : new ChatError('unknown');
        if (this.active === request) this.active = undefined;
        this.emit({ type: 'error', requestId: request.id, code: chatError.code, message: chatError.message });
      }
    } finally {
      if (this.active === request) this.active = undefined;
    }
  }
  async testConnection(): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
    let apiKey = '';
    try {
      apiKey = (await this.options.keyStore.load()).apiKey;
      if (!apiKey) return { ok: false, message: '请先填写 API Key。' };
      const { baseUrl } = this.options.getSettings();
      let models: string[];
      try { models = await this.options.client.listModels(baseUrl, apiKey); }
      catch (error) { throw networkError(error, apiKey); }
      return { ok: true, models };
    } catch (error) {
      return { ok: false, message: error instanceof ChatError ? error.message : new ChatError('unknown').message };
    }
  }
}
