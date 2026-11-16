import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KeyStore } from '../chat/keyStore';
import type { KeyResult, SaveKeyResult } from '../chat/keyStore';

/** Adapt async Electron encryption to the core's synchronous injection contract.
 * Encryption completes before entering KeyStore; only the transient result is handed to its callback.
 */
export class AsyncKeyStore {
  private store: KeyStore;
  private ready: Promise<void>;
  private pending: Promise<unknown> = Promise.resolve();
  private available = false;
  private encrypted?: Buffer;
  private decrypted?: { bytes: Buffer; text: string };
  constructor(directory: string, encryption: Pick<Electron.SafeStorage, 'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'>) {
    this.store = new KeyStore(directory, {
      isEncryptionAvailable: () => this.available,
      encryptString: () => { if (!this.encrypted) throw new Error('Encryption unavailable'); return this.encrypted; },
      decryptString: bytes => {
        if (!this.decrypted?.bytes.equals(bytes)) throw new Error('Decryption unavailable');
        return this.decrypted.text;
      },
    });
    this.encryption = encryption;
    this.ready = (async () => {
      try { this.available = await encryption.isAsyncEncryptionAvailable(); } catch { this.available = false; }
      if (!this.available) return;
      try {
        const secret = JSON.parse(await readFile(join(directory, 'secrets.json'), 'utf8'));
        const bytes = Buffer.from(secret.deepseekApiKey, 'base64');
        const { result } = await encryption.decryptStringAsync(bytes);
        this.decrypted = { bytes, text: result };
      } catch { /* KeyStore reports needsReentry for an existing unreadable secret. */ }
    })();
  }
  private encryption: Pick<Electron.SafeStorage, 'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'>;
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(() => this.ready).then(operation);
    this.pending = result.catch(() => {}); return result;
  }
  load(): Promise<KeyResult> { return this.run(async () => {
    try { return await this.store.load(); } finally { this.decrypted = undefined; }
  }); }
  save(key: string): Promise<SaveKeyResult> { return this.run(async () => {
    try {
      if (key && this.available) {
        try { this.encrypted = await this.encryption.encryptStringAsync(key); } catch { this.encrypted = undefined; }
      }
      return await this.store.save(key);
    } finally { this.encrypted = undefined; }
  }); }
  async flush(): Promise<void> { await this.pending; await this.store.flush(); }
}
