import { appendFileSync, mkdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { App, BrowserWindow } from 'electron';

const MAX_BYTES = 1024 * 1024;
export class CrashLog {
  readonly path: string;
  constructor(private directory: string) { this.path = join(directory, 'crash.log'); }
  write(category: string, data: unknown): void {
    try {
      const line = `${new Date().toISOString()} ${category} ${JSON.stringify(data)}\n`;
      mkdirSync(this.directory, { recursive: true });
      let size = 0;
      try { size = statSync(this.path).size; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (size && size + Buffer.byteLength(line) > MAX_BYTES) {
        rmSync(`${this.path}.1`, { force: true });
        renameSync(this.path, `${this.path}.1`);
      }
      // Synchronous writes also survive immediate app.exit() and fatal JS errors.
      appendFileSync(this.path, line, { encoding: 'utf8', mode: 0o600 });
    } catch (error) { console.error('崩溃日志写入失败', error); }
  }
}
let log: CrashLog | undefined;
export function logCrash(category: string, data: unknown): void { log?.write(category, data); }
export const crashCounts = { renderGone: 0, childGone: 0 };
export function watchRenderer(win: BrowserWindow, window: string): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    crashCounts.renderGone++;
    logCrash('render-gone', { window, reason: details.reason, exitCode: details.exitCode });
  });
}
function errorDetails(error: unknown): { message: string; stack?: string } {
  try {
    return error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  } catch { return { message: '无法序列化异常' }; }
}
export function memorySnapshot(app: Pick<App, 'getAppMetrics'>) {
  const { rss, heapUsed } = process.memoryUsage();
  const processes = app.getAppMetrics().map(({ type, memory }) => ({ type, workingSetSize: memory.workingSetSize }));
  return { rss, heapUsed, processes, workingSetSize: processes.reduce((sum, entry) => sum + entry.workingSetSize, 0) };
}
export function installCrashLog(app: App): () => void {
  log = new CrashLog(app.getPath('userData'));
  logCrash('start', { version: app.getVersion(), platform: process.platform, electron: process.versions.electron,
    packaged: app.isPackaged, userData: app.getPath('userData') });
  const exception = (error: Error) => logCrash('main-exception', errorDetails(error));
  const rejection = (error: unknown) => logCrash('main-rejection', errorDetails(error));
  // Monitoring does not count as handling an exception: Electron retains its
  // original uncaughtException handlers/default fatal behaviour.
  process.on('uncaughtExceptionMonitor', exception);
  process.on('unhandledRejection', rejection);
  const childGone = (_event: Electron.Event, details: Electron.Details) => {
    crashCounts.childGone++;
    const { type, reason, exitCode, serviceName, name } = details;
    logCrash('child-gone', { type, reason, exitCode, serviceName, name });
  };
  app.on('child-process-gone', childGone);
  const timer = setInterval(() => {
    try { logCrash('mem', memorySnapshot(app)); }
    catch (error) { console.error('内存采样失败', error); }
  }, 10 * 60_000);
  timer.unref();
  return () => {
    clearInterval(timer);
    process.removeListener('uncaughtExceptionMonitor', exception);
    process.removeListener('unhandledRejection', rejection);
    app.removeListener('child-process-gone', childGone);
  };
}
