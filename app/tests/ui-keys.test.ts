import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AsyncKeyStore } from '../src/main/ipc/keys';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function directory() { const path = await mkdtemp(join(tmpdir(), 'usagi-ui-key-')); directories.push(path); return path; }
function encryption(available = true) {
  return { isAsyncEncryptionAvailable: vi.fn(async () => available),
    encryptStringAsync: vi.fn(async (text: string) => Buffer.from(`cipher:${text}`)),
    decryptStringAsync: vi.fn(async (bytes: Buffer) => ({ result: bytes.toString().slice(7), shouldReEncrypt: false })) };
}
describe('异步 safeStorage 接线，不调用弃用同步 API', () => {
  it('加密后经原 KeyStore 原子保存，重启时异步解密且只在主进程返回', async () => {
    const path = await directory(), crypto = encryption();
    const store = new AsyncKeyStore(path, crypto);
    expect(await store.load()).toEqual({ apiKey: '', needsReentry: false });
    expect(await store.save('sk-private')).toEqual({ persisted: true }); await store.flush();
    expect(crypto.encryptStringAsync).toHaveBeenCalledWith('sk-private');
    const disk = JSON.parse(await readFile(join(path, 'secrets.json'), 'utf8'));
    expect(disk).toEqual({ deepseekApiKey: Buffer.from('cipher:sk-private').toString('base64') });
    const restarted = new AsyncKeyStore(path, crypto);
    expect(await restarted.load()).toEqual({ apiKey: 'sk-private', needsReentry: false });
    expect(await restarted.load()).toEqual({ apiKey: 'sk-private', needsReentry: false });
    expect(crypto.decryptStringAsync).toHaveBeenCalledTimes(1);
  });
  it('异步加密不可用/抛错，返回仅本次有效的原因，同时内存可用', async () => {
    for (const fail of [false, true]) {
      const path = await directory(), crypto = encryption(fail);
      if (fail) crypto.encryptStringAsync.mockRejectedValueOnce(new Error('unavailable'));
      const store = new AsyncKeyStore(path, crypto);
      expect(await store.save('secret')).toMatchObject({ persisted: false, reason: expect.stringContaining('只在本次运行有效') });
      expect(await store.load()).toEqual({ apiKey: 'secret', needsReentry: false });
      await expect(readFile(join(path, 'secrets.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
  it('并发保存串行，不串 Key；解密失败要求重新填写', async () => {
    const path = await directory(), crypto = encryption(), store = new AsyncKeyStore(path, crypto);
    await Promise.all([store.save('first'), store.save('second')]);
    expect(await store.load()).toEqual({ apiKey: 'second', needsReentry: false });
    crypto.decryptStringAsync.mockRejectedValueOnce(new Error('locked'));
    expect(await new AsyncKeyStore(path, crypto).load()).toEqual({ apiKey: '', needsReentry: true });
  });
});
