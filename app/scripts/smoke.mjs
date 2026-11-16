import { fileURLToPath } from 'node:url';
import { runSmokeProcess } from './smoke-process.mjs';

try {
  const { default: electron } = await import('electron');
  process.exitCode = await runSmokeProcess(electron, ['.', '--smoke'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
  });
} catch (error) {
  console.log(JSON.stringify({ ok: false, reason: `Electron 冒烟启动失败：${error.message}` }));
  process.exitCode = 1;
}
