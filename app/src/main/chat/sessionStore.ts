import { randomUUID } from 'node:crypto';
import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite, isMissing, SerialQueue } from './persistence';
import type { Message, Session } from './types';

function validSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const data = value as Session;
  const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  return typeof data.sessionId === 'string' && date(data.createdAt) && date(data.updatedAt) && Array.isArray(data.messages)
    && data.messages.every(msg => !!msg && typeof msg.id === 'string' && (msg.role === 'user' || msg.role === 'assistant')
      && typeof msg.content === 'string' && date(msg.createdAt)
      && (msg.emotion === undefined || ['happy', 'surprised', 'angry', 'sad', 'neutral'].includes(msg.emotion)));
}

export class SessionStore {
  readonly path: string;
  private session?: Session;
  private readonly queue = new SerialQueue();
  constructor(userData: string, private readonly now: () => Date = () => new Date()) {
    this.path = join(userData, 'chat', 'session.json');
  }
  private fresh(): Session {
    const timestamp = this.now().toISOString();
    return { sessionId: randomUUID(), createdAt: timestamp, updatedAt: timestamp, messages: [] };
  }
  private async read(): Promise<Session> {
    if (this.session) return this.session;
    let raw: string;
    try { raw = await readFile(this.path, 'utf8'); }
    catch (error) { if (!isMissing(error)) throw error; return this.session = this.fresh(); }
    let data: unknown;
    try { data = JSON.parse(raw); } catch { /* Invalid JSON is quarantined below. */ }
    if (validSession(data)) return this.session = data;
    await rename(this.path, join(this.path, '..', `session.corrupt-${this.now().getTime()}.json`));
    return this.session = this.fresh();
  }
  load(): Promise<Session> {
    return this.queue.run(async () => structuredClone(await this.read()));
  }
  append(msg: Message): Promise<void> {
    const snapshot = structuredClone(msg);
    return this.queue.run(async () => {
      const current = await this.read();
      const next: Session = { ...current, updatedAt: this.now().toISOString(), messages: [...current.messages, snapshot] };
      await atomicWrite(this.path, next);
      this.session = next;
    });
  }
  clear(): Promise<void> {
    return this.queue.run(async () => {
      const next = this.fresh();
      await atomicWrite(this.path, next);
      this.session = next;
    });
  }
  flush(): Promise<void> { return this.queue.flush(); }
}
