import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Electron 的首次 import 会同步下载；外层进程计时才能覆盖该阻塞和构建时间。
export function withSmokeDeadline(args, options = {}) {
  return new Promise(done => {
    let expired = false;
    const child = spawn(process.execPath, args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    const stopTree = () => {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    };
    const timer = setTimeout(() => {
      expired = true;
      console.log(JSON.stringify({ ok: false, reason: '整个冒烟命令超过 10 分钟（含构建和首次下载 Electron），已终止本次进程树' }));
      stopTree();
    }, options.timeoutMs ?? 600_000);
    const onSignal = () => { expired = true; stopTree(); };
    process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
    const clean = () => { clearTimeout(timer); process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); };
    child.on('error', error => { clean(); console.log(JSON.stringify({ ok: false, reason: error.message })); done(1); });
    child.on('close', code => { clean(); done(expired ? 1 : code ?? 1); });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await withSmokeDeadline(['scripts/smoke-entry.mjs', ...process.argv.slice(2)]);
}
