import { spawn } from 'node:child_process';
import electron from 'electron';

const child = spawn(electron, ['.', '--smoke'], { stdio: 'inherit' });
// Covers app startup failures before Electron's own watchdog can be installed.
const watchdog = setTimeout(() => {
  console.log(JSON.stringify({ ok: false, reason: 'Electron 冒烟进程超过 60 秒' }));
  child.kill('SIGKILL');
  process.exitCode = 1;
}, 60_000);
child.on('error', (error) => {
  clearTimeout(watchdog);
  console.log(JSON.stringify({ ok: false, reason: error.message }));
  process.exitCode = 1;
});
child.on('exit', (code) => { clearTimeout(watchdog); process.exitCode = code ?? 1; });
