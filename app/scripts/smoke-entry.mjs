import { spawn } from 'node:child_process';

const code = await new Promise((done, reject) => {
  const child = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  child.on('error', reject); child.on('close', done);
});
if (code !== 0) process.exitCode = code ?? 1;
else await import('./smoke.mjs').then(module => module.smokeMain());
