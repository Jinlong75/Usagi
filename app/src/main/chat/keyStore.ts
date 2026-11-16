import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite, isMissing, SerialQueue } from './persistence';

export interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export interface KeyResult { apiKey: string; needsReentry: boolean }
export type SaveKeyResult = { persisted: true } | { persisted: false; reason: string };
const MEMORY_ONLY = '加密存储不可用，Key 只在本次运行有效，重启后需要重新填写。';

export function maskKey(key: string): string {
  return key.length > 8 ? `sk-****${key.slice(-4)}` : '****';
}

export class KeyStore {
  readonly path: string;
  private memory?: KeyResult;
  private readonly queue = new SerialQueue();
  constructor(userData: string, private readonly encryption: Encryption) { this.path = join(userData, 'secrets.json'); }

  load(): Promise<KeyResult> {
    return this.queue.run(async () => {
      if (this.memory) return { ...this.memory };
      try {
        const data = JSON.parse(await readFile(this.path, 'utf8'));
        if (!data || typeof data !== 'object' || typeof data.deepseekApiKey !== 'string') throw new Error('Invalid secret');
        if (!this.encryption.isEncryptionAvailable() || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.deepseekApiKey) || !data.deepseekApiKey) throw new Error('Unavailable secret');
        const apiKey = this.encryption.decryptString(Buffer.from(data.deepseekApiKey, 'base64'));
        if (!apiKey) throw new Error('Empty secret');
        this.memory = { apiKey, needsReentry: false };
      } catch (error) {
        this.memory = { apiKey: '', needsReentry: !isMissing(error) };
      }
      return { ...this.memory };
    });
  }
  save(apiKey: string): Promise<SaveKeyResult> {
    return this.queue.run(async () => {
      this.memory = { apiKey, needsReentry: false };
      if (!apiKey) { await rm(this.path, { force: true }); return { persisted: true }; }
      if (!this.encryption.isEncryptionAvailable()) {
        // Remove an older encrypted Key so a restart cannot silently resurrect it.
        await rm(this.path, { force: true });
        return { persisted: false, reason: MEMORY_ONLY };
      }
      let encrypted: Buffer;
      try { encrypted = this.encryption.encryptString(apiKey); }
      catch {
        await rm(this.path, { force: true });
        return { persisted: false, reason: MEMORY_ONLY };
      }
      await atomicWrite(this.path, { deepseekApiKey: encrypted.toString('base64') });
      return { persisted: true };
    });
  }
  flush(): Promise<void> { return this.queue.flush(); }
}
