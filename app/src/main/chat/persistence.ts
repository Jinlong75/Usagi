import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function atomicWrite(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    const file = await open(temporary, 'w', 0o600);
    try {
      await file.writeFile(JSON.stringify(data, null, 2) + '\n', 'utf8');
      await file.sync();
    } finally { await file.close(); }
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private failure: unknown;
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(error => { this.failure = error; });
    return result;
  }
  async flush(): Promise<void> {
    // Include operations added while an earlier operation is being awaited.
    let pending;
    do { pending = this.tail; await pending; } while (pending !== this.tail);
    if (this.failure) throw this.failure;
  }
}

export function isMissing(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}
