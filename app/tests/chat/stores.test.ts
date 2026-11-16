import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyStore, maskKey } from '../../src/main/chat/keyStore';
import type { Encryption } from '../../src/main/chat/keyStore';
import { SessionStore } from '../../src/main/chat/sessionStore';
import { atomicWrite, SerialQueue } from '../../src/main/chat/persistence';
import type { Message } from '../../src/main/chat/types';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename) };
});
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'usagi-chat-')); });
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });
const now = () => new Date('2026-11-16T04:00:00.000Z');
const message = (id: string): Message => ({ id, role: 'user', content: `text ${id}`, createdAt: now().toISOString() });

describe('atomic persistence', () => {
  it('writes a private temp file, fsyncs and closes before rename', async () => {
    const order: string[] = [];
    vi.mocked(fs.open).mockImplementationOnce(async () => ({
      writeFile: vi.fn(async () => { order.push('write'); }),
      sync: vi.fn(async () => { order.push('sync'); }),
      close: vi.fn(async () => { order.push('close'); }),
    }) as unknown as fs.FileHandle);
    vi.mocked(fs.rename).mockImplementationOnce(async () => { order.push('rename'); });
    const path = join(directory, 'nested', 'session.json');
    await atomicWrite(path, { messages: [] });
    expect(fs.open).toHaveBeenLastCalledWith(`${path}.tmp`, 'w', 0o600);
    expect(fs.rename).toHaveBeenLastCalledWith(`${path}.tmp`, path);
    expect(order).toEqual(['write', 'sync', 'close', 'rename']);
  });
  it('preserves the previous complete file and removes temp on failed rename', async () => {
    const path = join(directory, 'state.json');
    await atomicWrite(path, { old: true });
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error('rename failed'));
    await expect(atomicWrite(path, { new: true })).rejects.toThrow('rename failed');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ old: true });
    expect(await readdir(directory)).toEqual(['state.json']);
  });
  it('serializes async work, flush waits, and failures are observable without wedging the queue', async () => {
    const queue = new SerialQueue();
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const order: number[] = [];
    const first = queue.run(async () => { await hold; order.push(1); });
    const second = queue.run(async () => { order.push(2); });
    let flushed = false;
    const flush = queue.flush().then(() => { flushed = true; });
    await Promise.resolve();
    expect(order).toEqual([]);
    expect(flushed).toBe(false);
    release();
    await Promise.all([first, second, flush]);
    expect(order).toEqual([1, 2]);
    await expect(queue.run(async () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
    await queue.run(async () => { order.push(3); });
    await expect(queue.flush()).rejects.toThrow('disk full');
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('SessionStore', () => {
  it('creates a single ISO session, serializes concurrent appends, reloads and isolates returned objects', async () => {
    const store = new SessionStore(directory, now);
    const initial = await store.load();
    expect(initial).toMatchObject({ createdAt: now().toISOString(), updatedAt: now().toISOString(), messages: [] });
    const writes = Array.from({ length: 15 }, (_, i) => store.append(message(String(i))));
    await store.flush();
    await Promise.all(writes);
    const saved = await new SessionStore(directory, now).load();
    expect(saved.sessionId).toBe(initial.sessionId);
    expect(saved.messages.map(msg => msg.id)).toEqual(Array.from({ length: 15 }, (_, i) => String(i)));
    expect(await readdir(join(directory, 'chat'))).toEqual(['session.json']);
    saved.messages.length = 0;
    expect((await store.load()).messages).toHaveLength(15);
  });
  it('snapshots inputs and preserves clear/append operation order with a new session id', async () => {
    const store = new SessionStore(directory, now);
    const old = await store.load();
    const input = message('1');
    const write = store.append(input);
    input.content = 'mutated';
    await write;
    expect((await store.load()).messages[0]?.content).toBe('text 1');
    const clear = store.clear();
    const append = store.append({ ...message('2'), role: 'assistant', emotion: 'happy' });
    const pendingRead = store.load();
    await Promise.all([clear, append, store.flush()]);
    const session = await pendingRead;
    expect(session.sessionId).not.toBe(old.sessionId);
    expect(session.messages).toEqual([{ ...message('2'), role: 'assistant', emotion: 'happy' }]);
    expect(JSON.parse(await readFile(store.path, 'utf8'))).toEqual(session);
  });
  it.each(['{broken', '{"messages":null}', 'null'])('quarantines corrupt data: %s', async raw => {
    const store = new SessionStore(directory, now);
    await mkdir(join(directory, 'chat'));
    await writeFile(store.path, raw);
    const session = await store.load();
    expect(session.messages).toEqual([]);
    expect(await readdir(join(directory, 'chat'))).toEqual([`session.corrupt-${now().getTime()}.json`]);
    expect(await readFile(join(directory, 'chat', `session.corrupt-${now().getTime()}.json`), 'utf8')).toBe(raw);
    await store.append(message('recovered'));
    expect((await new SessionStore(directory).load()).messages[0]?.id).toBe('recovered');
  });
});

describe('KeyStore', () => {
  const key = 'unit-test-secret-value';
  // A reversible fake cipher, deliberately unlike plaintext/base64 plaintext.
  const encryption = (): Encryption => ({
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from([...Buffer.from(text)].map(byte => byte ^ 0xab)),
    decryptString: bytes => Buffer.from([...bytes].map(byte => byte ^ 0xab)).toString(),
  });
  it('round-trips encrypted base64 only, never persisting plaintext, and supports deletion', async () => {
    const cipher = encryption();
    const store = new KeyStore(directory, cipher);
    expect(await store.load()).toEqual({ apiKey: '', needsReentry: false });
    expect(await store.save(key)).toEqual({ persisted: true });
    await store.flush();
    const raw = await readFile(store.path, 'utf8');
    expect(raw).not.toContain(key);
    expect(JSON.parse(raw).deepseekApiKey).toBe(cipher.encryptString(key).toString('base64'));
    expect(await new KeyStore(directory, cipher).load()).toEqual({ apiKey: key, needsReentry: false });
    await store.save('');
    expect(await readdir(directory)).toEqual([]);
    expect(await store.load()).toEqual({ apiKey: '', needsReentry: false });
  });
  it('keeps Key only in memory when encryption is unavailable, removing stale persisted secrets', async () => {
    await new KeyStore(directory, encryption()).save('old-secret');
    const cipher = { ...encryption(), isEncryptionAvailable: () => false, encryptString: vi.fn() };
    const store = new KeyStore(directory, cipher);
    expect(await store.save(key)).toEqual({ persisted: false, reason: '加密存储不可用，Key 只在本次运行有效，重启后需要重新填写。' });
    expect(await store.load()).toEqual({ apiKey: key, needsReentry: false });
    expect(cipher.encryptString).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual([]);
    expect(await new KeyStore(directory, encryption()).load()).toEqual({ apiKey: '', needsReentry: false });
  });
  it('falls back to memory when encryptString throws without exposing error text', async () => {
    const cipher = { ...encryption(), encryptString: () => { throw new Error(key); } };
    const store = new KeyStore(directory, cipher);
    expect(await store.save(key)).toMatchObject({ persisted: false });
    expect(await readdir(directory)).toEqual([]);
    expect((await store.load()).apiKey).toBe(key);
  });
  it('marks unreadable or undecryptable secrets for reentry', async () => {
    const cipher = encryption();
    await new KeyStore(directory, cipher).save(key);
    const broken = { ...cipher, decryptString: () => { throw new Error('different machine'); } };
    expect(await new KeyStore(directory, broken).load()).toEqual({ apiKey: '', needsReentry: true });
    expect(await new KeyStore(directory, { ...cipher, isEncryptionAvailable: () => false }).load()).toEqual({ apiKey: '', needsReentry: true });
    for (const raw of ['{broken', '{"deepseekApiKey":"not!base64"}', '{}', 'null']) {
      await writeFile(join(directory, 'secrets.json'), raw);
      expect(await new KeyStore(directory, cipher).load()).toEqual({ apiKey: '', needsReentry: true });
    }
  });
  it('serializes concurrent saves so load and disk agree', async () => {
    const store = new KeyStore(directory, encryption());
    await Promise.all([store.save('first'), store.save('second'), store.flush()]);
    expect((await store.load()).apiKey).toBe('second');
    expect((await new KeyStore(directory, encryption()).load()).apiKey).toBe('second');
  });
  it('masks short keys entirely and only exposes the last four of longer keys', () => {
    expect(maskKey('sk-abcdefghijkl')).toBe('sk-****ijkl');
    expect(maskKey('abc')).toBe('****');
    expect(maskKey('')).toBe('****');
  });
});
